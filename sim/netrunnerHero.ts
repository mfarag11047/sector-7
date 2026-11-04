// Cipher, Netrunner's doctrine hero (sim/heroes.ts): an intrusion operative who fights with the
// network rather than the gun.
//
//   - Smart SMG (UNIT_RULES): light, hits ground and air alike.
//   - Override (sim/unitAbilities.ts 'override'; 40 s cooldown): aimed at a spot up to
//     OVERRIDE.range away, Cipher seizes the nearest enemy machine within OVERRIDE.radius of it,
//     a light vehicle or an aircraft (not infantry, not heavy armour, not a hero), and runs it as
//     the side's own for OVERRIDE.durationMs: it can be ordered about and fights for you. When the
//     hold runs out it goes back to its owner, wherever it is.
//   - Uplink (passive): Cipher hacks the neutral Sentinels from UPLINK.range tiles, UPLINK.rate
//     times as fast as other units (sim/sentinelNet.ts), once the side has the Sentinels' code.
//
// Pure: Override comes in as a UNIT_ABILITY command; CityMap.tsx and sim/headless.ts hand each
// seized machine back when its time is up (releaseOverrides).

import type { UnitData } from '../types';
import type { GridPos, Team } from './commands';
import { UNIT_RULES } from './units';
import { isHeroType } from './heroes';

export const OVERRIDE = { range: 7, radius: 2, durationMs: 15_000 };
export const UPLINK = { range: 5, rate: 3 };

export const isCipher = (u: UnitData) => u.type === 'hero_netrunner' && u.health > 0;

// What Override can seize from `team`'s enemies.
const NOT_SEIZABLE = new Set<UnitData['type']>(['courier', 'crawler_drone', 'field_generator', 'cloak_generator', 'titan_dropped']);
export function overridable(u: UnitData, team: Team): boolean {
  // (Cloaked units, sim/cloak.ts isHidden, can't be picked out. Checked here directly: this module
  // sits below the ability rules, which the cloak module itself needs.)
  if (u.health <= 0 || u.team === team || u.team === 'neutral' || u.overriddenBy || u.fieldCloaked || u.decoyActive) return false;
  if (isHeroType(u.type) || NOT_SEIZABLE.has(u.type)) return false;
  const armor = UNIT_RULES[u.type].armor;
  return armor === 'light' || armor === 'air';
}

// The machine Override takes at `at`: the nearest seizable one within OVERRIDE.radius.
export function overrideTarget(units: readonly UnitData[], team: Team, at: GridPos): UnitData | null {
  let best: UnitData | null = null;
  let bestD = OVERRIDE.radius;
  for (const u of units) {
    if (!overridable(u, team)) continue;
    const d = Math.hypot(u.gridPos.x - at.x, u.gridPos.z - at.z);
    if (d <= bestD) { best = u; bestD = d; }
  }
  return best;
}

// The machine seized: the side's own until the hold runs out.
export const seize = (u: UnitData, team: Team, now: number): UnitData => ({
  ...u, team, overriddenBy: { team: u.team as Team, until: now + OVERRIDE.durationMs },
  path: [], attackMove: false, combatTargetId: null,
});

// Seized machines whose hold has run out, back to their owners. The same array if none.
export function releaseOverrides(units: UnitData[], now: number): UnitData[] {
  if (!units.some(u => u.overriddenBy && u.overriddenBy.until <= now)) return units;
  return units.map(u => (u.overriddenBy && u.overriddenBy.until <= now
    ? { ...u, team: u.overriddenBy.team, overriddenBy: undefined, path: [], attackMove: false, combatTargetId: null }
    : u));
}
