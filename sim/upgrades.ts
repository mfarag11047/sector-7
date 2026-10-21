// Unit upgrades, researched at an Advanced Research building.
//
// Reaching a tier unlocks the units of that tier, with their first ability. It no longer hands
// over every unit's later upgrades too: each has to be researched, one at a time per Advanced
// Research building, for cores and time. A side can't afford them all at once, so what it
// researches commits it to the units it means to build.
//
// An upgrade needs its tier researched first, and some need an earlier upgrade. Research runs on
// the structure (StructureData.research) and is lost if the building is destroyed before it
// finishes; finished upgrades belong to the side (TeamEconomy.upgrades) for the rest of the match.

import { UNIT_STATS } from '../constants';
import type { StructureData, UnitClass, UnitType } from '../types';
import type { Team } from './commands';
import type { Economy, TeamEconomy } from './economy';
import { Tier, UNIT_RULES } from './units';
import { type UnitAbilityDef } from './unitAbilities';

export type UpgradeId =
  | 'nanoweave' | 'dampener' | 'phantom_decoy' | 'emp_rocket'
  | 'overclock' | 'radar' | 'long_range_shells' | 'guided_shells'
  | 'hellfire' | 'hunter_rockets' | 'regen_shield' | 'piercing_round' | 'volt_core';

export interface UpgradeDef {
  id: UpgradeId;
  unit: UnitType;
  name: string;
  tier: Tier;
  cost: number;
  researchMs: number;
  requires?: UpgradeId;
  description: string;
}

const T2 = { cost: 250, researchMs: 30_000 };
const T3 = { cost: 400, researchMs: 45_000 };

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'nanoweave', unit: 'trooper', name: 'Nano-Weave Mesh', tier: 2, ...T2, description: 'Ability: takes 50% less damage for 6s.' },
  { id: 'dampener', unit: 'ghost', name: 'Dampener', tier: 2, ...T2, description: 'Ability: hides the Ghost and nearby friendly units from the enemy map and radar.' },
  { id: 'phantom_decoy', unit: 'ghost', name: 'Phantom Decoy', tier: 3, ...T3, description: 'Ability: cloaks the Ghost and sends out holographic copies.' },
  { id: 'emp_rocket', unit: 'lancer', name: 'EMP Tandem Rocket', tier: 3, ...T3, description: 'Ability: a top-attack EMP missile that shuts down vehicles and aircraft for 4s.' },
  { id: 'overclock', unit: 'razorback', name: 'Overclocked Autogun', tier: 2, ...T2, description: 'Ability: double fire rate for 6s.' },
  { id: 'radar', unit: 'aegis', name: 'Sky-Net Radar Sweep', tier: 3, ...T3, description: 'Ability: vision 14 and +2 weapon range for 10s.' },
  { id: 'piercing_round', unit: 'tank', name: 'Piercing Rail Round', tier: 3, ...T3, description: 'Ability: the next rail gun shot carries on down the whole lane, hitting every enemy in its path.' },
  { id: 'volt_core', unit: 'sun_plate', name: 'Volt Core', tier: 2, ...T2, description: 'Passive: when the Battery Mule is destroyed it detonates, 220 electrical damage to enemies within 4 tiles, less toward the edge.' },
  { id: 'long_range_shells', unit: 'howitzer', name: 'Long-Range Shells', tier: 2, ...T2, description: 'Thunderhead range from 12 to 16 tiles.' },
  { id: 'guided_shells', unit: 'howitzer', name: 'Guided Shells', tier: 3, ...T3, requires: 'long_range_shells', description: 'Thunderhead range from 16 to 20 tiles.' },
  { id: 'hellfire', unit: 'hornet', name: 'Hellfire Salvo', tier: 3, ...T3, description: 'Ability: a burst of small rockets that blankets an area.' },
  { id: 'regen_shield', unit: 'attack_drone', name: 'Regenerative Shield', tier: 2, ...T2, description: 'Passive: a shield worth 25% of its health that takes 25% less damage, and recharges after 10s without being hit.' },
  { id: 'hunter_rockets', unit: 'hornet', name: 'Hunter-Killer Rockets', tier: 3, ...T3, description: 'Passive: fires an anti-vehicle rocket at whatever its gun is on.' },
];

export const upgradeDef = (id: string) => UPGRADES.find(u => u.id === id);
export const upgradesFor = (unit: UnitType) => UPGRADES.filter(u => u.unit === unit);

// The unit classes with upgrades, and their units, in menu order.
export function upgradeClasses(): { unitClass: UnitClass; units: UnitType[] }[] {
  const classes: { unitClass: UnitClass; units: UnitType[] }[] = [];
  for (const u of UPGRADES) {
    const unitClass = UNIT_STATS[u.unit].unitClass;
    let c = classes.find(x => x.unitClass === unitClass);
    if (!c) classes.push(c = { unitClass, units: [] });
    if (!c.units.includes(u.unit)) c.units.push(u.unit);
  }
  return classes;
}

export const hasUpgrade = (team: Pick<TeamEconomy, 'upgrades'> | undefined, id: UpgradeId) => !!team?.upgrades?.includes(id);

// A unit's ability needs research when it unlocks at a later tier than the unit itself.
export const abilityUpgrade = (def: Pick<UnitAbilityDef, 'id' | 'unit' | 'tier'>): UpgradeId | null =>
  def.tier > UNIT_RULES[def.unit].tier ? (def.id as UpgradeId) : null;

// Whether a side can use one of its units' abilities: the tier, and the research if it needs any.
export function abilityUnlocked(def: Pick<UnitAbilityDef, 'id' | 'unit' | 'tier'>, team: Pick<TeamEconomy, 'tier' | 'upgrades'>): boolean {
  if (team.tier < def.tier) return false;
  const upgrade = abilityUpgrade(def);
  return !upgrade || hasUpgrade(team, upgrade);
}

// The tier a side's Thunderheads shoot at: their range grows with the shell upgrades.
export const artilleryTierOf = (team: Pick<TeamEconomy, 'upgrades'> | undefined): Tier =>
  hasUpgrade(team, 'guided_shells') ? 3 : hasUpgrade(team, 'long_range_shells') ? 2 : 1;

// Why a side can't start researching an upgrade, or null if it can (cores aside).
export function researchBlocker(economy: Economy, team: Team, structures: readonly StructureData[], id: UpgradeId): string | null {
  const def = upgradeDef(id);
  if (!def) return 'unknown upgrade';
  const e = economy[team];
  if (hasUpgrade(e, id)) return `${def.name} is already researched`;
  if (structures.some(s => s.team === team && s.research?.upgrade === id)) return `${def.name} is already being researched`;
  if (e.tier < def.tier) return `${def.name} needs Tier ${def.tier}`;
  if (def.requires && !hasUpgrade(e, def.requires)) return `${def.name} needs ${upgradeDef(def.requires)!.name} first`;
  return null;
}

export interface ResearchTick {
  updates: Map<string, StructureData['research']>;
  finished: { team: Team; upgrade: UpgradeId }[];
}

// Advances research at every Advanced Research building by `stepMs`.
export function advanceResearch(structures: readonly StructureData[], stepMs: (team: StructureData['team']) => number): ResearchTick {
  const updates: ResearchTick['updates'] = new Map();
  const finished: ResearchTick['finished'] = [];
  for (const s of structures) {
    const r = s.research;
    if (s.type !== 'research_lab' || !r || s.health <= 0) continue;
    const remainingMs = r.remainingMs - stepMs(s.team);
    if (remainingMs <= 0) {
      updates.set(s.id, undefined);
      if (s.team === 'blue' || s.team === 'red') finished.push({ team: s.team, upgrade: r.upgrade });
    } else {
      updates.set(s.id, { ...r, remainingMs });
    }
  }
  return { updates, finished };
}

export const applyResearch = (structures: StructureData[], tick: ResearchTick): StructureData[] =>
  tick.updates.size === 0 ? structures : structures.map(s => (tick.updates.has(s.id) ? { ...s, research: tick.updates.get(s.id) } : s));

// Adds finished upgrades to their sides.
export function addUpgrades(economy: Economy, finished: ResearchTick['finished']): Economy {
  let e = economy;
  for (const { team, upgrade } of finished) {
    if (hasUpgrade(e[team], upgrade)) continue;
    e = { ...e, [team]: { ...e[team], upgrades: [...(e[team].upgrades ?? []), upgrade] } };
  }
  return e;
}
