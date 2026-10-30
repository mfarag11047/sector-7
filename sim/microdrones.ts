// The Wasp's micro-drones: a swarm that hunts on its own and rides along with the Wasp between
// fights, like the Swarm Host's Crawlers but in the air and without anchoring.
//
// A Wasp builds a drone every MICRODRONE.buildMs, launched from its pods. With no enemy near it
// keeps MICRODRONE.escort of them circling it as it flies, and docks any more; once an enemy comes
// within MICRODRONE.seekRadius it builds up to MICRODRONE.max, and every drone peels off and dives
// at an enemy near the Wasp, spreading over the targets rather than piling onto one. A drone is
// spent when it strikes (machine-gun damage by armour, so it hurts everything a little, aircraft
// included) and never chases further than MICRODRONE.leash from its Wasp. When the fight is over
// the survivors form up round it again. A Wasp that is destroyed takes its swarm down with it, and
// one knocked out by an EMP or stun builds no more until it recovers.
//
// The drones are small and fragile: Aegis and CIWS guns shoot them out of the air like missiles
// (sim/ciws.ts, swarmThreats), and an enemy force field stops one that dives at a unit inside it.
//
// Pure: CityMap, the headless runner and the balance skirmish keep the swarm, step it each tick
// and apply the damage it reports.

import type { UnitData } from '../types';
import type { AirThreat } from './ciws';
import { isHidden } from './cloak';
import { ForceField, shotBlocked } from './forcefield';
import { damageTakenMultiplier, isEmpDisabled, upgradeDamage } from './unitAbilities';
import { DAMAGE_MULTIPLIER, UNIT_RULES } from './units';

export const MICRODRONE = {
  // Drones a Wasp has out at once in a fight, and how many ride with it between fights.
  max: 8,
  escort: 5,
  // One built every this long, while it has fewer than it wants.
  buildMs: 1500,
  // How far from the Wasp they find enemies, and the furthest they chase one.
  seekRadius: 6,
  leash: 9,
  // Tiles a second, and how close a drone has to get to strike.
  speed: 9,
  hitRange: 0.6,
  // Damage a strike does before armour (machine-gun multipliers).
  damage: 16,
  // The escort's circle round the Wasp: radius in tiles and one lap's time.
  orbit: 0.9,
  orbitMs: 5000,
  // How close a docking drone has to get to fold back in.
  dockRange: 0.5,
  // Fire a drone takes to bring down (sim/ciws.ts ORDNANCE_INTEGRITY).
  integrity: 6,
};

export type DroneMode = 'escort' | 'attack' | 'dock';

export interface Microdrone {
  id: string;
  waspId: string;
  team: UnitData['team'];
  // Where it is, in fractional tiles.
  at: { x: number; z: number };
  mode: DroneMode;
  targetId: string | null;
  // Its place in the Wasp's escort circle.
  slot: number;
  // Fire it can still take.
  hp: number;
}

export interface Swarm {
  drones: Microdrone[];
  // When each Wasp can build its next drone.
  buildAt: Record<string, number>;
}

export const emptySwarm = (): Swarm => ({ drones: [], buildAt: {} });

export interface SwarmTick {
  swarm: Swarm;
  unitDamage: Map<string, number>;
  // Who hit whom, by Wasp, for the pacing report.
  hits: { attackerId: string; targetId: string }[];
  // Drones that struck this tick, where, and at what (for the bursts drawn and heard).
  strikes: { at: { x: number; z: number }; team: UnitData['team']; air: boolean }[];
  // Drones stopped by an enemy force field: where, and where they came from.
  absorbed: { at: { x: number; z: number }; team: UnitData['team']; from: { x: number; z: number } }[];
  // Drones launched this tick, by Wasp.
  launched: { waspId: string; at: { x: number; z: number } }[];
  // Each Wasp whose swarm is fighting, and the enemy nearest it (so attack-move holds there).
  engaged: Map<string, string>;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// `from` moved up to `step` tiles towards `to`.
function toward(from: { x: number; z: number }, to: { x: number; z: number }, step: number) {
  const d = dist(from, to);
  if (d <= step || d === 0) return { x: to.x, z: to.z };
  return { x: from.x + ((to.x - from.x) / d) * step, z: from.z + ((to.z - from.z) / d) * step };
}

// An enemy a Wasp's swarm can go for.
const prey = (wasp: UnitData, t: UnitData) =>
  t.team !== wasp.team && t.team !== 'neutral' && t.health > 0 && !isHidden(t) && !t.decoyActive;

export function swarmTick(
  swarm: Swarm,
  units: readonly UnitData[],
  now: number,
  dtMs: number,
  newId: () => string,
  // Enemy force fields (sim/forcefield.ts).
  fields: readonly ForceField[] = [],
): SwarmTick {
  const byId = new Map(units.map(u => [u.id, u]));
  const wasps = units.filter(u => u.type === 'wasp' && u.health > 0);
  const step = MICRODRONE.speed * (dtMs / 1000);
  const result: SwarmTick = {
    swarm, unitDamage: new Map(), hits: [], strikes: [], absorbed: [], launched: [], engaged: new Map(),
  };

  // A Wasp gone takes its swarm with it.
  let drones = swarm.drones.filter(d => (byId.get(d.waspId)?.health ?? 0) > 0);
  const buildAt: Record<string, number> = {};
  for (const w of wasps) if (swarm.buildAt[w.id] !== undefined) buildAt[w.id] = swarm.buildAt[w.id];

  // The enemies near each Wasp, nearest first.
  const foes = new Map<string, UnitData[]>();
  for (const w of wasps) {
    const near = units.filter(t => prey(w, t) && dist(t.gridPos, w.gridPos) <= MICRODRONE.seekRadius)
      .sort((a, b) => dist(a.gridPos, w.gridPos) - dist(b.gridPos, w.gridPos));
    foes.set(w.id, near);
    if (near.length > 0) result.engaged.set(w.id, near[0].id);
  }

  // Building: up to the escort between fights, up to the full swarm in one.
  for (const w of wasps) {
    const mine = drones.filter(d => d.waspId === w.id);
    const wanted = foes.get(w.id)!.length > 0 ? MICRODRONE.max : MICRODRONE.escort;
    if (mine.length >= wanted || now < (buildAt[w.id] ?? -Infinity) || w.isStunned || isEmpDisabled(w)) continue;
    const taken = new Set(mine.map(d => d.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    drones = [...drones, { id: newId(), waspId: w.id, team: w.team, at: { ...w.gridPos }, mode: 'escort', targetId: null, slot, hp: MICRODRONE.integrity }];
    buildAt[w.id] = now + MICRODRONE.buildMs;
    result.launched.push({ waspId: w.id, at: { ...w.gridPos } });
  }

  // How many drones are already on each enemy, so new ones spread out.
  const assigned = new Map<string, number>();
  for (const d of drones) if (d.mode === 'attack' && d.targetId) assigned.set(d.targetId, (assigned.get(d.targetId) ?? 0) + 1);
  // Each drone's place in its Wasp's escort, by slot.
  const rank = new Map<string, number>();
  const escortSize = new Map<string, number>();
  for (const w of wasps) {
    const mine = drones.filter(d => d.waspId === w.id).sort((a, b) => a.slot - b.slot);
    mine.forEach((d, i) => rank.set(d.id, i));
    escortSize.set(w.id, Math.min(MICRODRONE.escort, mine.length));
  }

  const next: Microdrone[] = [];
  for (const d of drones) {
    const w = byId.get(d.waspId)!;
    const near = foes.get(w.id)!;
    if (near.length > 0) {
      // Hunt: keep a target still worth chasing, or pick the nearest least-covered one.
      let target = d.targetId ? byId.get(d.targetId) : undefined;
      if (!target || !prey(w, target) || dist(target.gridPos, w.gridPos) > MICRODRONE.leash) {
        if (target && d.targetId) assigned.set(d.targetId, Math.max(0, (assigned.get(d.targetId) ?? 1) - 1));
        target = near.reduce((best, f) => {
          const score = (f: UnitData) => dist(d.at, f.gridPos) * (1 + 0.6 * (assigned.get(f.id) ?? 0));
          return score(f) < score(best) ? f : best;
        }, near[0]);
        assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
      }
      if (dist(d.at, target.gridPos) <= MICRODRONE.hitRange + step) {
        // Strike: the drone is spent.
        const air = UNIT_RULES[target.type].armor === 'air';
        if (shotBlocked(fields, d.team, d.at, target.gridPos)) {
          result.absorbed.push({ at: { ...target.gridPos }, team: d.team, from: { ...d.at } });
        } else {
          const n = MICRODRONE.damage * DAMAGE_MULTIPLIER.mg[UNIT_RULES[target.type].armor] * upgradeDamage(w) * damageTakenMultiplier(target);
          result.unitDamage.set(target.id, (result.unitDamage.get(target.id) ?? 0) + n);
          result.hits.push({ attackerId: w.id, targetId: target.id });
          result.strikes.push({ at: { ...target.gridPos }, team: d.team, air });
        }
        continue;
      }
      next.push({ ...d, mode: 'attack', targetId: target.id, at: toward(d.at, target.gridPos, step) });
      continue;
    }
    // No enemy near: the first few form up round the Wasp, the rest fly back in and dock.
    const r = rank.get(d.id)!;
    if (r >= MICRODRONE.escort) {
      if (dist(d.at, w.gridPos) <= MICRODRONE.dockRange + step) continue;
      next.push({ ...d, mode: 'dock', targetId: null, at: toward(d.at, w.gridPos, step) });
      continue;
    }
    next.push({ ...d, mode: 'escort', targetId: null, at: toward(d.at, escortPoint(w.gridPos, r, escortSize.get(w.id)!, now), step) });
  }
  result.swarm = { drones: next, buildAt };
  return result;
}

// Where escort drone `rank` of `size` flies round a Wasp at `at`, turning slowly.
export function escortPoint(at: { x: number; z: number }, rank: number, size: number, now: number) {
  const angle = (rank / Math.max(1, size)) * Math.PI * 2 + (now / MICRODRONE.orbitMs) * Math.PI * 2;
  return { x: at.x + Math.cos(angle) * MICRODRONE.orbit, z: at.z + Math.sin(angle) * MICRODRONE.orbit };
}

// The drones as targets for the Aegis and CIWS guns.
export const swarmThreats = (swarm: Swarm): AirThreat[] =>
  swarm.drones.map(d => ({ id: d.id, team: d.team, at: d.at, kind: 'microdrone' as const }));

// Fire taken by drones (by id). Those that come apart are gone, and reported.
export function damageDrones(swarm: Swarm, damage: ReadonlyMap<string, number>): { swarm: Swarm; downed: Microdrone[] } {
  if (!swarm.drones.some(d => damage.has(d.id))) return { swarm, downed: [] };
  const downed: Microdrone[] = [];
  const drones: Microdrone[] = [];
  for (const d of swarm.drones) {
    const n = damage.get(d.id);
    if (!n) { drones.push(d); continue; }
    if (d.hp - n <= 0) downed.push(d);
    else drones.push({ ...d, hp: d.hp - n });
  }
  return { swarm: { ...swarm, drones }, downed };
}

// How many drones a Wasp has out, for its menu.
export const dronesOf = (swarm: Swarm, waspId: string) => swarm.drones.filter(d => d.waspId === waspId).length;
