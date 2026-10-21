// What counters what, for the computer player.
//
// A counter has to do two things against a threat: kill it, and survive it. Ranking units only by
// the damage they deal picked infantry against a Kestrel swarm (troopers can shoot aircraft), and
// the Kestrels' machine guns cut them down. So a unit's value against an enemy mix weighs both:
//
//   offense: its damage per second against the enemy units, by their armour,
//   survival: its health over the damage per second those enemy units do to it,
//
// each per core spent (Lanchester's square law: an army's strength grows with the square of its
// numbers, so the cost counts twice). The enemy mix is by unit type, weighted by worth, so it
// knows a Kestrel (a machine gun that shreds infantry) from a Hornet (rockets for vehicles).
//
// Pure: sim/aiStrategy.ts picks strategies with it and sim/ai.ts picks what to train.

import { UNIT_STATS } from '../constants';
import type { UnitData, UnitType } from '../types';
import { unitCost } from './economy';
import { ArmorClass, dps, UNIT_RULES } from './units';

// The enemy, as shares of its worth by unit type, summing to 1.
export type EnemyMix = Partial<Record<UnitType, number>>;

// Damage per second that doesn't come from the unit's weapon in UNIT_RULES: Crawler Drones, Helios
// beams and the Kestrel's flechette burst. Rough, but enough to rank counters.
const EXTRA_DPS: Partial<Record<UnitType, Partial<Record<ArmorClass, number>>>> = {
  swarm_host: { infantry: 12, light: 12, heavy: 9, air: 0 },
  helios: { infantry: 4, light: 4, heavy: 4, air: 4 },
  attack_drone: { infantry: 3.6, light: 1.6, heavy: 0.7, air: 1.8 },
};

export const unitDps = (t: UnitType, a: ArmorClass) => dps(UNIT_RULES[t].weapon, a) + (EXTRA_DPS[t]?.[a] ?? 0);

// Enemy fire too small to matter still counts a little, so a unit nothing can hurt isn't
// worth infinitely much.
const MIN_INCOMING = 2;

// How well `t` fights an enemy of this mix, per core spent. 0 if it can't hurt any of it.
export function matchup(t: UnitType, enemy: EnemyMix): number {
  const armor = UNIT_RULES[t].armor;
  let offense = 0;
  let incoming = 0;
  for (const [e, share] of Object.entries(enemy) as [UnitType, number][]) {
    if (!share) continue;
    offense += share * unitDps(t, UNIT_RULES[e].armor);
    incoming += share * unitDps(e, armor);
  }
  if (offense <= 0) return 0;
  const cost = unitCost(t);
  return (offense / cost) * (UNIT_STATS[t].maxHealth / Math.max(MIN_INCOMING, incoming) / cost) * 1e4;
}

// Units that aren't an army: what they are worth in a fight doesn't tell you what to train.
const NOT_ARMY: ReadonlySet<UnitType> = new Set<UnitType>(['defense_drone', 'crawler_drone', 'courier', 'field_generator', 'cloak_generator']);

// An army as shares of its worth by unit type.
export function typeMix(units: readonly UnitData[]): EnemyMix {
  const mix: EnemyMix = {};
  let total = 0;
  for (const u of units) {
    if (NOT_ARMY.has(u.type) || u.health <= 0) continue;
    const v = (UNIT_STATS[u.type].cost || 150) * (u.health / u.maxHealth);
    mix[u.type] = (mix[u.type] ?? 0) + v;
    total += v;
  }
  if (total > 0) for (const k of Object.keys(mix) as UnitType[]) mix[k]! /= total;
  return mix;
}

// Two mixes blended, `w` of the second.
export function blendMix(a: EnemyMix, b: EnemyMix, w: number): EnemyMix {
  const out: EnemyMix = {};
  for (const [k, v] of Object.entries(a) as [UnitType, number][]) out[k] = (out[k] ?? 0) + v * (1 - w);
  for (const [k, v] of Object.entries(b) as [UnitType, number][]) out[k] = (out[k] ?? 0) + v * w;
  return out;
}

// The unit type with the biggest share.
export const topType = (mix: EnemyMix): UnitType | null =>
  (Object.entries(mix) as [UnitType, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
