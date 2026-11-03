// Netrunner's passive, the Sentinel Net: the server nodes' Sentinel drones, cracked.
//
// Once a Netrunner side has held a server node (any server node, once, for good), it has the
// Sentinels' code:
//   - It can build Sentinels at its Comm Link (cost in UNIT_STATS, pop and build time in
//     UNIT_RULES): the same heavy drone with its rifle, but its own, slowly hovering to wherever
//     it's sent, over the city, to guard it.
//   - Its units hack the neutral Sentinels guarding the other server nodes rather than having to
//     shoot them down: a unit within SENTINEL_NET.hackRange of one, with no unit of the other side
//     within contestRange of it, hacks it over SENTINEL_NET.hackMs. While it's being hacked the
//     Sentinel's targeting is scrambled and it holds its fire; walk away, or be contested, and the
//     hack stalls and slowly runs back. Hacked, it joins the side, guarding the node it stood at.
//   - A server node it has held for SENTINEL_NET.defenderAfterMs gains a Sentinel of its own as a
//     defender, and another that long after the last one falls, for as long as the node is held.
// Defenders and hacked Sentinels take no population; built ones do.
//
// Run each game tick by CityMap.tsx and sim/headless.ts (sentinelNetTick).

import { UNIT_STATS } from '../constants';
import type { BuildingData, DoctrineType, UnitData } from '../types';
import type { Team } from './commands';

export const SENTINEL_NET = {
  hackRange: 2,
  contestRange: 3,
  hackMs: 8000,
  // How fast a stalled hack runs back, as a share of how fast it fills.
  hackDecay: 0.5,
  defenderAfterMs: 120_000,
};

export const isSentinel = (u: UnitData) => u.type === 'defense_drone';
// A server node's own guard, neutral or not, never trained.
export const isPostedSentinel = (u: UnitData) => isSentinel(u) && !!u.sentinelPost;
// Holding fire while it's being hacked.
export const isBeingHacked = (u: UnitData) => !!u.hackProgress?.active;

// The side's progress toward each server node's next defender.
export interface SentinelPost { team: Team; readyAt: number; defenderId: string | null }
export interface SentinelNet { posts: Record<string, SentinelPost> }
export const freshSentinelNet = (): SentinelNet => ({ posts: {} });

// Whether a side can build Sentinels at its Comm Link, or why not.
export function sentinelBlocker(doctrine: DoctrineType | null | undefined, cracked: boolean | undefined): string | null {
  if (doctrine !== 'netrunner') return 'Netrunner doctrine only';
  if (!cracked) return 'hold a server node to crack the Sentinel code';
  return null;
}

const tiles = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export interface SentinelNetResult {
  units: UnitData[];
  net: SentinelNet;
  // Sides that cracked the code this tick.
  cracked: Team[];
  // Sentinels that changed hands, and new defenders, for notices.
  hacked: { id: string; team: Team }[];
  defenders: { id: string; team: Team; serverId: string }[];
}

export function sentinelNetTick(
  net: SentinelNet,
  units: readonly UnitData[],
  buildings: readonly BuildingData[],
  doctrineOf: (team: Team) => DoctrineType | null | undefined,
  crackedBy: (team: Team) => boolean,
  now: number,
  dtMs: number,
  newId: () => string,
  // A side's own timings from its doctrine track (sim/doctrineTrack.ts): Brute Force, Hardened Nodes.
  tuning: { hackMsOf?: (team: Team) => number | null; defenderAfterOf?: (team: Team) => number | null } = {},
): SentinelNetResult {
  const hackMs = (t: Team) => tuning.hackMsOf?.(t) ?? SENTINEL_NET.hackMs;
  const defenderAfter = (t: Team) => tuning.defenderAfterOf?.(t) ?? SENTINEL_NET.defenderAfterMs;
  const netrunner = (t: Team) => doctrineOf(t) === 'netrunner';
  const servers = buildings.filter(b => b.type === 'server_node' && !b.destroyed);
  const cracked: Team[] = [];
  for (const team of ['blue', 'red'] as const) {
    if (netrunner(team) && !crackedBy(team) && servers.some(s => s.owner === team)) cracked.push(team);
  }
  const hasCode = (t: Team) => netrunner(t) && (crackedBy(t) || cracked.includes(t));
  const anyCode = hasCode('blue') || hasCode('red');
  const postAt = (u: UnitData) => servers.find(s => tiles({ x: s.gridX, z: s.gridZ }, u.gridPos) <= 1)?.id;

  // Hacking the neutral guards.
  const hacked: SentinelNetResult['hacked'] = [];
  let next: UnitData[] = units as UnitData[];
  if (anyCode) {
    const others = units.filter(u => u.health > 0 && u.team !== 'neutral' && !isSentinel(u));
    next = units.map(u => {
      if (!isSentinel(u) || u.team !== 'neutral' || u.health <= 0) return u;
      const near = (team: Team, r: number) => others.some(o => o.team === team && tiles(o.gridPos, u.gridPos) <= r);
      const hackers = (['blue', 'red'] as const).filter(t => hasCode(t) && near(t, SENTINEL_NET.hackRange));
      const prev = u.hackProgress;
      // One side at it, the other nowhere near: the hack goes on.
      const team = hackers.length === 1 ? hackers[0] : null;
      const contested = team ? near(team === 'blue' ? 'red' : 'blue', SENTINEL_NET.contestRange) : true;
      if (team && !contested) {
        const ms = (prev && prev.team === team ? prev.ms : 0) + dtMs;
        if (ms >= hackMs(team)) {
          hacked.push({ id: u.id, team });
          return { ...u, team, hackProgress: undefined, sentinelPost: u.sentinelPost ?? postAt(u), path: [], combatTargetId: null };
        }
        return { ...u, hackProgress: { team, ms, active: true, of: hackMs(team) } };
      }
      if (!prev) return u;
      const ms = prev.ms - dtMs * SENTINEL_NET.hackDecay;
      return ms > 0 ? { ...u, hackProgress: { ...prev, ms, active: false } } : { ...u, hackProgress: undefined };
    });
  }

  // Defenders for the server nodes a Netrunner side holds.
  const posts: Record<string, SentinelPost> = {};
  const defenders: SentinelNetResult['defenders'] = [];
  const spawned: UnitData[] = [];
  for (const s of servers) {
    const team = s.owner;
    if (!team || !netrunner(team)) continue;
    let post = net.posts[s.id];
    if (!post || post.team !== team) post = { team, readyAt: now + defenderAfter(team), defenderId: null };
    // A Sentinel already posted here for the side (a hacked guard) counts as its defender.
    const guard = next.find(u => u.health > 0 && u.team === team && isSentinel(u) && u.sentinelPost === s.id);
    if (guard) post = { ...post, defenderId: guard.id };
    else if (post.defenderId) post = { team, readyAt: now + defenderAfter(team), defenderId: null };
    else if (now >= post.readyAt) {
      const id = newId();
      spawned.push({
        id, type: 'defense_drone', unitClass: 'defense', team,
        gridPos: { x: s.gridX, z: s.gridZ }, path: [], visionRange: UNIT_STATS.defense_drone.visionRange,
        health: UNIT_STATS.defense_drone.maxHealth, maxHealth: UNIT_STATS.defense_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {},
        sentinelPost: s.id,
      });
      defenders.push({ id, team, serverId: s.id });
      post = { ...post, defenderId: id };
    }
    posts[s.id] = post;
  }
  if (spawned.length > 0) next = [...next, ...spawned];
  return { units: next, net: { posts }, cracked, hacked, defenders };
}
