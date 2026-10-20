// The computer player's army strategy.
//
// Each side starts the match committed to an army style, picked at random: infantry, armour,
// air or drones. The strategy steers what it trains (sim/ai.ts weighs each unit by it), which
// production structures it leans on and builds extra of, and how early it pushes for Tier 2.
//
// It is not fixed. The computer keeps track of the units it loses and what killed them: the
// enemy units standing around each unit when it died, weighted by how well they hurt it. When
// it has lost a good share of its army in the last couple of minutes, mostly to one kind of
// enemy (infantry, light vehicles, heavy armour or aircraft), it switches to whichever strategy
// counters that kind best, and leans its training toward the counter.
//
// Pure: aiThink calls updateStrategy once per think with what it can see.

import { UNIT_STATS } from '../constants';
import type { StructureType, UnitData, UnitType } from '../types';
import type { GridPos } from './commands';
import { unitCost } from './economy';
import { ArmorClass, dps, Tier, UNIT_RULES } from './units';

export type AiStrategy = 'infantry' | 'armor' | 'air' | 'drones';
export const AI_STRATEGIES: readonly AiStrategy[] = ['infantry', 'armor', 'air', 'drones'];

export interface StrategyPlan {
  label: string;
  // The kind of army, for the pacing report: "an infantry army".
  army: string;
  // How much each unit is favoured when choosing what to train (1 when unlisted).
  units: Partial<Record<UnitType, number>>;
  // How often each production structure is used, from 0 to 1 (1 when unlisted). Barracks always
  // train enough infantry to capture with, whatever this says.
  producers: Partial<Record<StructureType, number>>;
  // An extra production structure of this type, once the tier allows it.
  extra: { type: StructureType; tier: Tier };
  // Pushes for a server node early, to reach the units it is waiting on.
  techRush: boolean;
  // Builds an Airpad at Tier 1, for Kestrel attack drones, rather than waiting for Tier 2.
  earlyAirpad: boolean;
}

export const STRATEGY_PLANS: Record<AiStrategy, StrategyPlan> = {
  infantry: {
    label: 'Infantry', army: 'an infantry army',
    units: { trooper: 1.5, ghost: 1.3, lancer: 1.8, guardian: 1.3, razorback: 0.6, tank: 0.6, hornet: 0.5, wasp: 0.5 },
    producers: { armor: 0.35, air: 0.3, ordnance_fab: 0.3 },
    extra: { type: 'infantry', tier: 1 },
    techRush: false,
    earlyAirpad: false,
  },
  armor: {
    label: 'Armour', army: 'an armoured army',
    units: { razorback: 1.5, tank: 1.8, howitzer: 1.3, aegis: 1.2, sun_plate: 1.2, trooper: 0.7, hornet: 0.5, wasp: 0.5 },
    producers: { infantry: 0.5, air: 0.3, ordnance_fab: 0.3 },
    extra: { type: 'armor', tier: 1 },
    techRush: false,
    earlyAirpad: false,
  },
  air: {
    label: 'Air', army: 'an air force',
    units: { hornet: 1.8, wasp: 1.4, bombard: 1.5, attack_drone: 1.4, drone: 1.2, razorback: 0.7, tank: 0.6, trooper: 0.8 },
    producers: { armor: 0.4, infantry: 0.6, ordnance_fab: 0.3 },
    extra: { type: 'air', tier: 2 },
    techRush: true,
    earlyAirpad: true,
  },
  drones: {
    label: 'Drones', army: 'a drone swarm',
    // Kestrel attack drones from Tier 1 are the backbone; Wasps, Helios, Banshees and Swarm Hosts join later.
    units: { attack_drone: 2.0, wasp: 1.8, helios: 1.8, banshee: 1.5, swarm_host: 1.7, bombard: 1.4, hornet: 0.7, tank: 0.6, trooper: 0.8 },
    producers: { armor: 0.4, infantry: 0.6 },
    extra: { type: 'air', tier: 1 },
    techRush: false,
    earlyAirpad: true,
  },
};

// The units each strategy fights with, for judging which counters what.
const ROSTER: Record<AiStrategy, UnitType[]> = {
  infantry: ['trooper', 'ghost', 'lancer'],
  armor: ['razorback', 'tank', 'howitzer', 'aegis'],
  air: ['attack_drone', 'wasp', 'hornet'],
  drones: ['attack_drone', 'wasp', 'swarm_host', 'helios'],
};

// Damage per second Crawler Drones and Helios beams do in practice, for the units that have no
// weapon of their own in UNIT_RULES. Rough, but enough to rank counters.
const EXTRA_DPS: Partial<Record<UnitType, Partial<Record<ArmorClass, number>>>> = {
  swarm_host: { infantry: 12, light: 12, heavy: 9, air: 0 },
  helios: { infantry: 4, light: 4, heavy: 4, air: 4 },
};

const ARMORS: ArmorClass[] = ['infantry', 'light', 'heavy', 'air'];
const unitDps = (t: UnitType, a: ArmorClass) => dps(UNIT_RULES[t].weapon, a) + (EXTRA_DPS[t]?.[a] ?? 0);

// How well a strategy's army deals with an enemy mix: damage per core, with a little health.
export function counterScore(strategy: AiStrategy, mix: Partial<Record<ArmorClass, number>>, tier: Tier): number {
  // Judged on the units it can field now: a counter it can't build yet is no counter.
  const units = ROSTER[strategy].filter(t => UNIT_RULES[t].tier <= tier);
  if (units.length === 0) return 0;
  const scores = units.map(t => {
    let damage = 0;
    for (const a of ARMORS) damage += (mix[a] ?? 0) * unitDps(t, a);
    return (damage * Math.sqrt(UNIT_STATS[t].maxHealth)) / unitCost(t);
  });
  // Mostly its best answer, which its training leans on once it is losing to that kind.
  return 0.6 * Math.max(...scores) + 0.4 * scores.reduce((s, x) => s + x, 0) / scores.length;
}

// --- Keeping track of losses ---

export interface LossRecord {
  atMs: number;
  // Cores' worth of the unit lost.
  value: number;
  // Who did it: shares by the enemy's armour class, summing to 1.
  by: Partial<Record<ArmorClass, number>>;
}

export interface StrategyMemory {
  strategy: AiStrategy | null;
  since: number;
  // Each of our units as last seen, to notice when one is gone.
  seen: Record<string, { type: UnitType; at: GridPos; value: number }>;
  losses: LossRecord[];
  // Every pick and change, for the pacing report.
  log: { atMs: number; strategy: AiStrategy; reason: string }[];
}

export const freshStrategyMemory = (): StrategyMemory => ({ strategy: null, since: 0, seen: {}, losses: [], log: [] });

// How far back losses count, and how close an enemy must have been to share the blame.
export const LOSS_WINDOW_MS = 120_000;
const BLAME_RADIUS = 7;
// Changing course takes losses worth this much, or this share of what the army is worth now,
// whichever is more, and mostly (this share) to one kind of enemy.
const MIN_LOSS_VALUE = 400;
const LOSS_SHARE_OF_ARMY = 0.5;
const DOMINANT_SHARE = 0.45;
// A new strategy has to counter the threat this much better than the current one.
const BETTER_BY = 1.15;

// Units whose disappearance isn't a combat loss.
const NOT_LOSSES: ReadonlySet<UnitType> = new Set<UnitType>(['crawler_drone', 'courier', 'titan_dropped', 'field_generator', 'cloak_generator', 'defense_drone']);

const valueOf = (u: UnitData) => (UNIT_STATS[u.type].cost || 150) * (u.health / u.maxHealth);

export interface StrategyInput {
  nowMs: number;
  tier: Tier;
  mine: readonly UnitData[];
  theirs: readonly UnitData[];
  armyValue: number;
  random: () => number;
  // How long it sticks with a strategy before it will change it, or null to never change.
  commitMs: number | null;
}

// Picks the opening strategy, notes this think's losses, and changes course if they call for it.
export function updateStrategy(memory: StrategyMemory, input: StrategyInput): StrategyMemory {
  const mem: StrategyMemory = { ...memory, seen: {}, losses: [...memory.losses], log: [...memory.log] };
  const { nowMs } = input;
  if (mem.strategy === null) {
    mem.strategy = AI_STRATEGIES[Math.floor(input.random() * AI_STRATEGIES.length) % AI_STRATEGIES.length];
    mem.since = nowMs;
    mem.log.push({ atMs: nowMs, strategy: mem.strategy, reason: 'opening plan' });
  }

  // Units gone since last think: who was around them, and how hard they hit that unit's armour.
  const living = new Set(input.mine.map(u => u.id));
  for (const [id, last] of Object.entries(memory.seen)) {
    if (living.has(id) || NOT_LOSSES.has(last.type)) continue;
    const armor = UNIT_RULES[last.type].armor;
    const blame: Partial<Record<ArmorClass, number>> = {};
    let total = 0;
    for (const e of input.theirs) {
      if (Math.hypot(e.gridPos.x - last.at.x, e.gridPos.z - last.at.z) > BLAME_RADIUS) continue;
      const hurt = unitDps(e.type, armor);
      if (hurt <= 0) continue;
      const share = hurt * valueOf(e);
      const cls = UNIT_RULES[e.type].armor;
      blame[cls] = (blame[cls] ?? 0) + share;
      total += share;
    }
    // Nobody about: a turret, a doctrine power or a long-range shot. Nothing to learn from.
    if (total <= 0) continue;
    for (const k of Object.keys(blame) as ArmorClass[]) blame[k]! /= total;
    mem.losses.push({ atMs: nowMs, value: last.value, by: blame });
  }
  for (const u of input.mine) mem.seen[u.id] = { type: u.type, at: { ...u.gridPos }, value: UNIT_STATS[u.type].cost || 0 };
  mem.losses = mem.losses.filter(l => nowMs - l.atMs <= LOSS_WINDOW_MS);

  // Time to change course?
  if (input.commitMs === null || nowMs - mem.since < input.commitMs) return mem;
  const lostValue = mem.losses.reduce((s, l) => s + l.value, 0);
  if (lostValue < Math.max(MIN_LOSS_VALUE, input.armyValue * LOSS_SHARE_OF_ARMY)) return mem;
  const mix = lossMix(mem.losses);
  const [worst, share] = (Object.entries(mix) as [ArmorClass, number][]).sort((a, b) => b[1] - a[1])[0] ?? ['infantry', 0];
  if (share < DOMINANT_SHARE) return mem;
  const current = mem.strategy;
  const ranked = AI_STRATEGIES.map(s => ({ s, score: counterScore(s, mix, input.tier) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const now = ranked.find(r => r.s === current)!;
  if (best.s === current || best.score < now.score * BETTER_BY) return mem;
  mem.strategy = best.s;
  mem.since = nowMs;
  mem.losses = [];
  mem.log.push({ atMs: nowMs, strategy: best.s, reason: `losing units to enemy ${ARMOR_NAMES[worst]}` });
  return mem;
}

const ARMOR_NAMES: Record<ArmorClass, string> = { infantry: 'infantry', light: 'light vehicles', heavy: 'heavy armour', air: 'aircraft', structure: 'defences' };

// What our recent losses were to, as shares by the enemy's armour class.
export function lossMix(losses: readonly LossRecord[]): Partial<Record<ArmorClass, number>> {
  const mix: Partial<Record<ArmorClass, number>> = {};
  let total = 0;
  for (const l of losses) {
    for (const [k, v] of Object.entries(l.by) as [ArmorClass, number][]) {
      mix[k] = (mix[k] ?? 0) + v * l.value;
      total += v * l.value;
    }
  }
  if (total > 0) for (const k of Object.keys(mix) as ArmorClass[]) mix[k]! /= total;
  return mix;
}

export const strategyLabel = (s: AiStrategy) => STRATEGY_PLANS[s].label;
export const strategyArmy = (s: AiStrategy) => STRATEGY_PLANS[s].army;
