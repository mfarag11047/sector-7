// Doctrine heroes: each doctrine has one unique hero unit, and only a side that picked that
// doctrine at the start of the match can have it.
//
// A hero is unlocked by research at Advanced Research (its Tier 1 unlock), then trained there.
// A side has at most one hero at a time, alive or in training; when it falls, another can be
// trained. It is refitted twice more at Advanced Research, to Mk II at Tier 2 and Mk III at Tier 3,
// each giving the usual upgrade bonus of health and damage (sim/upgrades.ts). The unlock itself
// gives no bonus.
//
// The heroes themselves are placeholders for now: their stats are in UNIT_STATS (constants.ts)
// and UNIT_RULES (sim/units.ts), and they have no abilities yet.

import type { DoctrineType, StructureData, UnitData, UnitType } from '../types';
import type { Team } from './commands';

export interface HeroDef {
  doctrine: DoctrineType;
  unit: UnitType;
  // The research that unlocks it, and its two refits.
  unlock: `hero_${DoctrineType}_unlock`;
  mk2: `hero_${DoctrineType}_mk2`;
  mk3: `hero_${DoctrineType}_mk3`;
}

const hero = (doctrine: DoctrineType): HeroDef => ({
  doctrine, unit: `hero_${doctrine}` as UnitType,
  unlock: `hero_${doctrine}_unlock`, mk2: `hero_${doctrine}_mk2`, mk3: `hero_${doctrine}_mk3`,
});

export const HEROES: Record<DoctrineType, HeroDef> = {
  heavy_metal: hero('heavy_metal'),
  shadow_ops: hero('shadow_ops'),
  netrunner: hero('netrunner'),
};

export const HERO_TYPES: readonly UnitType[] = Object.values(HEROES).map(h => h.unit);
export const isHeroType = (type: UnitType) => HERO_TYPES.includes(type);
export const heroOf = (doctrine: DoctrineType | null | undefined): HeroDef | null => (doctrine ? HEROES[doctrine] : null);
export const heroDefFor = (type: UnitType): HeroDef | undefined => Object.values(HEROES).find(h => h.unit === type);

// A side's hero alive on the map or in training at any of its buildings.
export function heroFielded(units: readonly UnitData[], structures: readonly StructureData[], team: Team, type: UnitType): boolean {
  return units.some(u => u.team === team && u.type === type && u.health > 0)
    || structures.some(s => s.team === team && s.health > 0 && (s.queue ?? []).some(q => q.unitType === type));
}

// Why a side can't train this hero, or null if it can (cores, population and queue aside).
export function heroBlocker(
  type: UnitType, team: Team, doctrine: DoctrineType | null | undefined,
  upgrades: readonly string[], units: readonly UnitData[], structures: readonly StructureData[],
): string | null {
  const def = heroDefFor(type);
  if (!def) return null;
  if (doctrine !== def.doctrine) return 'only for its own doctrine';
  if (!upgrades.includes(def.unlock)) return 'unlock it at Advanced Research first';
  if (heroFielded(units, structures, team, type)) return 'one hero at a time';
  return null;
}
