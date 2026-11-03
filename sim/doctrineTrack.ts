// The doctrine track: how a side's doctrine grows over the match.
//
// A side earns doctrine points in the background: one every POINT_EVERY_MS of match time, sooner
// for every server node it holds (SERVER_BONUS each). The track has four ranks, opening at
// RANK_OPENS_MS into the match; at each the side spends RANK_COST points to take ONE of two
// options, for good, and the other is gone. Ranks are taken in order. So two players with the same
// doctrine can play it two ways, and holding the server nodes gets you there sooner.
//
//   Rank 1  how its passive plays (sim/salvage.ts, sim/cloak.ts, sim/sentinelNet.ts)
//   Rank 2  its first power: one of its two doctrine powers (DOCTRINE_CONFIG tier2 / tier3)
//   Rank 3  its hero (sim/heroes.ts), or an army-wide edge instead
//   Rank 4  Arsenal (the power it passed up at rank 2 as well) or Overdrive (its powers at half
//           the cost and half the cooldown)
//
// The powers still cost cores and recharge as before; the track decides which a side has. The
// hero option unlocks the hero for training at Advanced Research (its Mk II and Mk III refits are
// still researched there).
//
// Pure: the economy carries each side's track (TeamEconomy.track); CityMap.tsx and sim/headless.ts
// advance it once a second (advanceTrack); picks come in as PICK_DOCTRINE orders (sim/orders.ts).

import { DOCTRINE_CONFIG } from '../constants';
import type { BuildingData, DoctrineType, UnitData } from '../types';
import { UNIT_RULES } from './units';
import type { Team } from './commands';
import type { Economy, TeamEconomy } from './economy';
import type { UpgradeId } from './upgrades';

export const POINT_EVERY_MS = 90_000;
// Each server node held makes points come this much faster (0.25: a quarter faster each).
export const SERVER_BONUS = 0.25;
export const STARTING_POINTS = 1;
export const RANK_OPENS_MS = [0, 4 * 60_000, 8 * 60_000, 12 * 60_000] as const;
export const RANK_COST = [1, 2, 3, 4] as const;
export type Rank = 1 | 2 | 3 | 4;
export type PowerKey = 'tier2' | 'tier3';

export interface TrackOption {
  id: string;
  name: string;
  description: string;
  // A doctrine power it unlocks, the hero it unlocks, or neither (an edge for the army).
  power?: PowerKey;
  hero?: true;
}

export interface TeamTrack {
  points: number;
  // Match time banked toward the next point, ms (server nodes make it count faster).
  progressMs: number;
  // Match time so far, for which ranks are open.
  elapsedMs: number;
  // The option taken at each rank, in rank order.
  picks: string[];
}
export const freshTrack = (): TeamTrack => ({ points: STARTING_POINTS, progressMs: 0, elapsedMs: 0, picks: [] });

const power = (doctrine: DoctrineType, key: PowerKey): TrackOption => {
  const c = DOCTRINE_CONFIG[doctrine];
  return { id: `${doctrine}_${key}`, power: key, name: key === 'tier2' ? c.tier2_name : c.tier3_name, description: key === 'tier2' ? c.tier2_desc : c.tier3_desc };
};
const capstones = (doctrine: DoctrineType): [TrackOption, TrackOption] => [
  { id: `${doctrine}_arsenal`, name: 'Arsenal', description: 'The power you passed up at rank 2 as well: both your doctrine powers.' },
  { id: `${doctrine}_overdrive`, name: 'Overdrive', description: 'Your doctrine powers cost half as many cores and recharge twice as fast.' },
];

export const TRACK: Record<DoctrineType, [TrackOption, TrackOption][]> = {
  heavy_metal: [
    [
      { id: 'hm_scrap', name: 'Scrap Haulers', description: 'Wrecks you strip are worth twice as much: 60% of the vehicle\'s cost.' },
      { id: 'hm_welders', name: 'Field Welders', description: 'Your armour repairs itself out of combat from the start, twice as fast (10 HP/s).' },
    ],
    [power('heavy_metal', 'tier2'), power('heavy_metal', 'tier3')],
    [
      { id: 'hm_hero', hero: true, name: 'Goliath', description: 'Unlocks Goliath, the full-borg juggernaut, for training at Advanced Research.' },
      { id: 'hm_plate', name: 'Hardened Plate', description: 'Your vehicles take 15% less damage.' },
    ],
    capstones('heavy_metal'),
  ],
  shadow_ops: [
    [
      { id: 'so_silent', name: 'Silent Running', description: 'Your infantry and light vehicles move 20% faster.' },
      { id: 'so_killing', name: 'Killing Ground', description: 'Strikes from the dark are ambushes for double damage instead of +50%.' },
    ],
    [power('shadow_ops', 'tier2'), power('shadow_ops', 'tier3')],
    [
      { id: 'so_hero', hero: true, name: 'Kage', description: 'Unlocks Kage, the cloaking assassin, for training at Advanced Research.' },
      { id: 'so_fade', name: 'Quick Fade', description: 'Your units go dark 2 s after a fight instead of 6.' },
    ],
    capstones('shadow_ops'),
  ],
  netrunner: [
    [
      { id: 'nr_brute', name: 'Brute Force', description: 'Your units hack a neutral Sentinel in 3 s instead of 8.' },
      { id: 'nr_foundry', name: 'Sentinel Foundry', description: 'Sentinels cost 180 cores instead of 300 and build in 12 s.' },
    ],
    [power('netrunner', 'tier2'), power('netrunner', 'tier3')],
    [
      { id: 'nr_hero', hero: true, name: 'Netrunner Hero', description: 'Unlocks the Netrunner hero for training at Advanced Research.' },
      { id: 'nr_fortress', name: 'Hardened Nodes', description: 'Your server nodes gain a Sentinel defender after 45 s held instead of 2 minutes.' },
    ],
    capstones('netrunner'),
  ],
};

const trackOf = (e: TeamEconomy): TeamTrack => e.track ?? freshTrack();
export const hasPick = (e: TeamEconomy | undefined, id: string) => !!e?.track?.picks.includes(id);

// Points to the next one, as a share (0..1), and how fast they're coming.
export const pointRate = (serversHeld: number) => 1 + SERVER_BONUS * serversHeld;

// Advance every side's track by `dtMs` of match time.
export function advanceTrack(economy: Economy, buildings: readonly BuildingData[], dtMs: number): Economy {
  const next = { ...economy };
  for (const team of ['blue', 'red'] as const) {
    const t = trackOf(economy[team]);
    const servers = buildings.filter(b => b.type === 'server_node' && !b.destroyed && b.owner === team).length;
    let progressMs = t.progressMs + dtMs * pointRate(servers);
    let points = t.points;
    while (progressMs >= POINT_EVERY_MS) { progressMs -= POINT_EVERY_MS; points++; }
    next[team] = { ...economy[team], track: { ...t, points, progressMs, elapsedMs: t.elapsedMs + dtMs } };
  }
  return next;
}

// Why a side can't take this option now, or null if it can.
export function pickBlocker(e: TeamEconomy, doctrine: DoctrineType | null | undefined, rank: number, optionId: string): string | null {
  if (!doctrine) return 'no doctrine';
  const ranks = TRACK[doctrine];
  if (!Number.isInteger(rank) || rank < 1 || rank > ranks.length) return 'no such rank';
  if (!ranks[rank - 1].some(o => o.id === optionId)) return 'not an option at that rank';
  const t = trackOf(e);
  if (t.picks.length >= rank) return `rank ${rank} is already chosen`;
  if (t.picks.length < rank - 1) return `choose rank ${rank - 1} first`;
  if (t.elapsedMs < RANK_OPENS_MS[rank - 1]) return `rank ${rank} opens at ${Math.round(RANK_OPENS_MS[rank - 1] / 60_000)}:00`;
  if (t.points < RANK_COST[rank - 1]) return `needs ${RANK_COST[rank - 1]} doctrine points`;
  return null;
}

// The economy with the option taken: points spent, and a hero unlock granted.
export function takePick(e: TeamEconomy, doctrine: DoctrineType, rank: Rank, optionId: string): TeamEconomy {
  const t = trackOf(e);
  const option = TRACK[doctrine][rank - 1].find(o => o.id === optionId)!;
  const upgrades = option.hero ? [...e.upgrades, `hero_${doctrine}_unlock` as UpgradeId] : e.upgrades;
  return { ...e, upgrades, track: { ...t, points: t.points - RANK_COST[rank - 1], picks: [...t.picks, optionId] } };
}

// Which doctrine powers a side has from its track.
export function powersOf(e: TeamEconomy | undefined, doctrine: DoctrineType | null | undefined): PowerKey[] {
  if (!e || !doctrine) return [];
  const picks = e.track?.picks ?? [];
  const first = TRACK[doctrine][1].find(o => picks.includes(o.id))?.power;
  if (!first) return [];
  return picks.includes(`${doctrine}_arsenal`) ? ['tier2', 'tier3'] : [first];
}
export const hasPower = (e: TeamEconomy | undefined, doctrine: DoctrineType | null | undefined, key: PowerKey) => powersOf(e, doctrine).includes(key);

const overdrive = (e: TeamEconomy | undefined, doctrine: DoctrineType) => hasPick(e, `${doctrine}_overdrive`);
export function trackPowerCost(e: TeamEconomy | undefined, doctrine: DoctrineType, key: PowerKey): number {
  const c = DOCTRINE_CONFIG[doctrine];
  const base = key === 'tier2' ? c.tier2_cost : c.tier3_cost;
  return overdrive(e, doctrine) ? Math.round(base / 2) : base;
}
export function trackPowerCooldown(e: TeamEconomy | undefined, doctrine: DoctrineType, key: PowerKey): number {
  const c = DOCTRINE_CONFIG[doctrine];
  const base = key === 'tier2' ? c.tier2_cooldown : c.tier3_cooldown;
  return overdrive(e, doctrine) ? base / 2 : base;
}

// The next rank a side can choose at, if it is open and affordable now.
export function nextOpenRank(e: TeamEconomy, doctrine: DoctrineType | null | undefined): Rank | null {
  if (!doctrine) return null;
  const t = trackOf(e);
  const rank = (t.picks.length + 1) as Rank;
  if (rank > 4) return null;
  return t.elapsedMs >= RANK_OPENS_MS[rank - 1] && t.points >= RANK_COST[rank - 1] ? rank : null;
}

// --- What the edges do, for the systems they touch ---
export const perk = {
  salvageMultiplier: (e?: TeamEconomy) => (hasPick(e, 'hm_scrap') ? 2 : 1),
  welders: (e?: TeamEconomy) => hasPick(e, 'hm_welders'),
  vehicleDamageTaken: (e?: TeamEconomy) => (hasPick(e, 'hm_plate') ? 0.85 : 1),
  silentRunning: (e?: TeamEconomy) => hasPick(e, 'so_silent'),
  ambush: (e?: TeamEconomy) => (hasPick(e, 'so_killing') ? 2 : null),
  darkAfterMs: (e?: TeamEconomy) => (hasPick(e, 'so_fade') ? 2000 : null),
  hackMs: (e?: TeamEconomy) => (hasPick(e, 'nr_brute') ? 3000 : null),
  sentinelFoundry: (e?: TeamEconomy) => hasPick(e, 'nr_foundry'),
  defenderAfterMs: (e?: TeamEconomy) => (hasPick(e, 'nr_fortress') ? 45_000 : null),
};
export const FOUNDRY_SENTINEL = { cost: 180, buildTimeMs: 12_000 };

// The edges that touch combat (sim/combat.ts resolveAttacks' perks), from each side's economy.
export function trackCombatPerks(economyOf: (team: Team) => TeamEconomy) {
  const of = (team: UnitData['team']) => (team === 'blue' || team === 'red' ? economyOf(team) : undefined);
  return {
    damageTaken: (u: UnitData) => (UNIT_RULES[u.type].armor === 'light' || UNIT_RULES[u.type].armor === 'heavy' ? perk.vehicleDamageTaken(of(u.team)) : 1),
    ambushOf: (team: UnitData['team']) => perk.ambush(of(team)),
  };
}

