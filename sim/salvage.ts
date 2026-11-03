// Heavy Metal's passive, Salvage: every vehicle destroyed, on either side, leaves a burning wreck,
// and Heavy Metal's crews strip it for parts.
//
//   - A wreck lies where the vehicle died for SALVAGE.lifeMs, worth SALVAGE.share of the
//     vehicle's cost (a Titan's wreck is worth a tank's).
//   - A Heavy Metal ground unit within SALVAGE.range of it, with no other side's unit that close,
//     salvages it over SALVAGE.ms. Done, the side gets the wreck's worth in cores, and every one
//     of its vehicles at the wreck is patched up by SALVAGE.repair of its maximum health. Leave it
//     or be contested and the salvage stalls; the wreck keeps what was done until it burns out.
//   - Infantry, aircraft and the little drones leave nothing to salvage.
//
// Alongside it, Heavy Metal keeps its Mechanized Repair (sim/support.ts).
//
// Pure: CityMap.tsx and sim/headless.ts make wrecks of the dead and pay out what's salvaged.

import type { DoctrineType, UnitData, UnitType } from '../types';
import type { GridPos, Team } from './commands';
import { unitCost } from './economy';
import { UNIT_RULES } from './units';

export const SALVAGE = {
  lifeMs: 60_000,
  range: 1.5,
  ms: 4000,
  share: 0.3,
  repair: 0.25,
};

export interface Wreck {
  id: string;
  type: UnitType;
  at: GridPos;
  // Cores it's worth to the side that salvages it.
  value: number;
  diedAt: number;
  // Salvage under way: by whom, and how far along (ms).
  progress?: { team: Team; ms: number; active: boolean };
}

// What a destroyed unit of this type is worth for salvage: vehicles only.
export function salvageValue(type: UnitType): number {
  const rules = UNIT_RULES[type];
  if (rules.armor !== 'light' && rules.armor !== 'heavy') return 0;
  if (type === 'defense_drone' || type === 'crawler_drone' || type === 'field_generator' || type === 'cloak_generator' || type === 'courier') return 0;
  const cost = type === 'titan_dropped' ? unitCost('tank') : unitCost(type);
  return Math.round(cost * SALVAGE.share);
}

export function wreckOf(type: UnitType, at: GridPos, now: number, id: string): Wreck | null {
  const value = salvageValue(type);
  return value > 0 ? { id, type, at: { x: at.x, z: at.z }, value, diedAt: now } : null;
}

const tiles = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
const salvager = (u: UnitData) => u.health > 0 && u.team !== 'neutral' && UNIT_RULES[u.type].armor !== 'air' && u.type !== 'defense_drone';

export interface SalvageTick {
  wrecks: Wreck[];
  payouts: { team: Team; cores: number; wreckId: string; at: GridPos }[];
  // Health to add, by unit.
  repairs: Map<string, number>;
}

export function salvageTick(
  wrecks: readonly Wreck[],
  units: readonly UnitData[],
  doctrineOf: (team: Team) => DoctrineType | null | undefined,
  now: number,
  dtMs: number,
  // Heavy Metal's Scrap Haulers (sim/doctrineTrack.ts): what a wreck is worth to the side, times this.
  valueMultiplier: (team: Team) => number = () => 1,
): SalvageTick {
  const payouts: SalvageTick['payouts'] = [];
  const repairs = new Map<string, number>();
  const kept: Wreck[] = [];
  const near = units.filter(salvager);
  for (const w of wrecks) {
    if (now - w.diedAt >= SALVAGE.lifeMs) continue;
    const at = near.filter(u => tiles(u.gridPos, w.at) <= SALVAGE.range);
    const sides = new Set(at.map(u => u.team as Team));
    const team = sides.size === 1 ? [...sides][0] : null;
    if (team && doctrineOf(team) === 'heavy_metal') {
      const ms = (w.progress?.team === team ? w.progress.ms : 0) + dtMs;
      if (ms >= SALVAGE.ms) {
        payouts.push({ team, cores: Math.round(w.value * valueMultiplier(team)), wreckId: w.id, at: w.at });
        for (const u of at) {
          const armor = UNIT_RULES[u.type].armor;
          if (u.team === team && (armor === 'light' || armor === 'heavy')) repairs.set(u.id, u.maxHealth * SALVAGE.repair);
        }
        continue;
      }
      kept.push({ ...w, progress: { team, ms, active: true } });
      continue;
    }
    kept.push(w.progress?.active ? { ...w, progress: { ...w.progress, active: false } } : w);
  }
  return { wrecks: kept, payouts, repairs };
}
