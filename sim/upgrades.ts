// Unit upgrades, researched at an Advanced Research building.
//
// Reaching a tier unlocks the units of that tier, with their first ability. It no longer hands
// over every unit's later upgrades too: each has to be researched, one at a time per Advanced
// Research building, for cores, compute and time. A side can't afford them all at once, so what it
// researches commits it to the units it means to build.
//
// An upgrade needs its tier researched first, and some need an earlier upgrade. Research runs on
// the structure (StructureData.research) and is lost if the building is destroyed before it
// finishes; finished upgrades belong to the side (TeamEconomy.upgrades) for the rest of the match.

import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { DoctrineType, StructureData, UnitClass, UnitType } from '../types';
import type { Team } from './commands';
import type { Economy, TeamEconomy } from './economy';
import { Tier, UNIT_RULES } from './units';
import { type UnitAbilityDef, UPGRADE_BONUS } from './unitAbilities';
import type { UnitData } from '../types';

export type UpgradeId =
  | 'nanoweave' | 'dampener' | 'phantom_decoy' | 'emp_rocket'
  | 'overclock' | 'radar' | 'long_range_shells' | 'guided_shells'
  | 'hellfire' | 'hunter_rockets' | 'flechette_burst' | 'regen_shield' | 'piercing_round' | 'volt_core'
  | RefitId
  | HeroUpgradeId;

// A doctrine hero's unlock and its two refits (sim/heroes.ts).
export type HeroUpgradeId = `hero_${DoctrineType}_${'unlock' | 'mk2' | 'mk3'}`;

// Stat-only refits, so every unit has two upgrades: no new ability (yet), just the upgrade bonus
// of health and damage every upgrade gives (UPGRADE_BONUS). Mk II unlocks at Tier 2, Mk III at
// Tier 3; a Tier 3 unit's are both Tier 3.
export type RefitId =
  | 'scout_car_mk2'
  | 'scout_car_mk3'
  | 'trooper_mk3'
  | 'lancer_mk2'
  | 'razorback_mk3'
  | 'sun_plate_mk3'
  | 'tank_mk2'
  | 'aegis_mk2'
  | 'drone_mk2'
  | 'drone_mk3'
  | 'wasp_mk2'
  | 'wasp_mk3'
  | 'bombard_mk2'
  | 'bombard_mk3'
  | 'guardian_mk2'
  | 'guardian_mk3'
  | 'helios_mk2'
  | 'helios_mk3'
  | 'banshee_mk2'
  | 'banshee_mk3'
  | 'ballista_mk2'
  | 'ballista_mk3'
  | 'mason_mk2'
  | 'mason_mk3'
  | 'mule_mk2'
  | 'mule_mk3'
  | 'swarm_host_mk2'
  | 'swarm_host_mk3';

export interface UpgradeDef {
  id: UpgradeId;
  unit: UnitType;
  name: string;
  tier: Tier;
  cost: number;
  // Compute spent as well as cores, so upgrades compete with the next tier for it.
  compute: number;
  researchMs: number;
  requires?: UpgradeId;
  description: string;
  // Only a side that picked this doctrine can research it (the doctrine heroes').
  doctrine?: DoctrineType;
  // Unlocks a unit rather than improving it: gives no upgrade bonus.
  unlock?: boolean;
}

const T2 = { cost: 250, compute: 50, researchMs: 30_000 };
const T3 = { cost: 400, compute: 100, researchMs: 45_000 };

const refit = (id: RefitId, unit: UnitType, tier: Tier, mk: 2 | 3): UpgradeDef => ({
  id, unit, name: mk === 2 ? 'Mk II Refit' : 'Mk III Refit', tier, ...(tier === 3 ? T3 : T2),
  description: 'Refit: tougher and harder-hitting. No new ability.',
});

// A doctrine hero's research: the Tier 1 unlock that lets it be trained, then Mk II and Mk III.
const heroUpgrades = (doctrine: DoctrineType): UpgradeDef[] => {
  const unit = `hero_${doctrine}` as UnitType;
  return [
    { id: `hero_${doctrine}_unlock`, unit, doctrine, unlock: true, name: 'Hero Unlock', tier: 1, cost: 300, compute: 25, researchMs: 25_000, description: 'Unlocks the doctrine hero for training here. One at a time.' },
    { id: `hero_${doctrine}_mk2`, unit, doctrine, name: 'Hero Mk II', tier: 2, ...T2, requires: `hero_${doctrine}_unlock`, description: 'Refit: tougher and harder-hitting.' },
    { id: `hero_${doctrine}_mk3`, unit, doctrine, name: 'Hero Mk III', tier: 3, ...T3, requires: `hero_${doctrine}_mk2`, description: 'Refit: tougher and harder-hitting.' },
  ];
};

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
  { id: 'flechette_burst', unit: 'attack_drone', name: 'Flechette Burst', tier: 2, ...T2, description: 'Passive: every 5s alongside its machine gun, a shotgun burst that hits its target hard and peppers enemies beside it. Shreds infantry.' },
  { id: 'regen_shield', unit: 'attack_drone', name: 'Regenerative Shield', tier: 3, ...T3, description: 'Passive: a shield worth 25% of its health that takes 25% less damage, and recharges after 10s without being hit.' },
  { id: 'hunter_rockets', unit: 'hornet', name: 'Hunter-Killer Rockets', tier: 3, ...T3, description: 'Passive: fires an anti-vehicle rocket at whatever its gun is on.' },
  refit('scout_car_mk2', 'scout_car', 2, 2),
  refit('scout_car_mk3', 'scout_car', 3, 3),
  refit('trooper_mk3', 'trooper', 3, 3),
  refit('lancer_mk2', 'lancer', 2, 2),
  refit('razorback_mk3', 'razorback', 3, 3),
  { ...refit('sun_plate_mk3', 'sun_plate', 3, 3), description: `Refit: tougher, and it charges vehicles out to ${ABILITY_CONFIG.BATTERY_MULE_RANGE_MAX} tiles instead of ${ABILITY_CONFIG.BATTERY_MULE_RANGE}.` },
  refit('tank_mk2', 'tank', 2, 2),
  refit('aegis_mk2', 'aegis', 2, 2),
  refit('drone_mk2', 'drone', 2, 2),
  refit('drone_mk3', 'drone', 3, 3),
  refit('wasp_mk2', 'wasp', 2, 2),
  refit('wasp_mk3', 'wasp', 3, 3),
  refit('bombard_mk2', 'bombard', 3, 2),
  refit('bombard_mk3', 'bombard', 3, 3),
  refit('guardian_mk2', 'guardian', 2, 2),
  refit('guardian_mk3', 'guardian', 3, 3),
  refit('helios_mk2', 'helios', 2, 2),
  refit('helios_mk3', 'helios', 3, 3),
  refit('banshee_mk2', 'banshee', 2, 2),
  refit('banshee_mk3', 'banshee', 3, 3),
  refit('ballista_mk2', 'ballista', 3, 2),
  refit('ballista_mk3', 'ballista', 3, 3),
  refit('mason_mk2', 'mason', 2, 2),
  refit('mason_mk3', 'mason', 3, 3),
  refit('mule_mk2', 'mule', 2, 2),
  refit('mule_mk3', 'mule', 3, 3),
  refit('swarm_host_mk2', 'swarm_host', 2, 2),
  refit('swarm_host_mk3', 'swarm_host', 3, 3),
  ...heroUpgrades('heavy_metal'),
  ...heroUpgrades('shadow_ops'),
  ...heroUpgrades('netrunner'),
];

export const upgradeDef = (id: string) => UPGRADES.find(u => u.id === id);
// A unit's upgrades, Tier 2 first.
export const upgradesFor = (unit: UnitType) => UPGRADES.filter(u => u.unit === unit).sort((a, b) => a.tier - b.tier);
// An upgrade's name with its unit's, for notices: the refits share their names.
export const upgradeTitle = (def: UpgradeDef) => `${UNIT_STATS[def.unit].label}: ${def.name}`;

// The unit classes with upgrades, and their units, in menu order. The doctrine heroes have a
// row of their own.
export function upgradeClasses(): { unitClass: UnitClass; units: UnitType[] }[] {
  const classes: { unitClass: UnitClass; units: UnitType[] }[] = [];
  for (const u of UPGRADES) {
    if (u.doctrine) continue;
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

// How many upgrades a side has researched for one unit type (a hero's unlock doesn't count).
export const upgradeLevelOf = (team: Pick<TeamEconomy, 'upgrades'> | undefined, unit: UnitType) =>
  UPGRADES.filter(u => u.unit === unit && !u.unlock && hasUpgrade(team, u.id)).length;

// A unit's maximum health with its side's upgrades: +UPGRADE_BONUS.health of its base per upgrade.
export const upgradedMaxHealth = (unit: UnitType, level: number) =>
  Math.round(UNIT_STATS[unit].maxHealth * (1 + UPGRADE_BONUS.health * level));

// Brings every unit up to its side's upgrades: its upgradeLevel (which sets its damage bonus,
// sim/unitAbilities.ts upgradeDamage) and its maximum health, adding the extra to its current
// health too. Units that are already up to date keep their identity; with none changed, the same
// array comes back.
export function applyUpgradeBonuses(units: UnitData[], economy: Economy): UnitData[] {
  let changed = false;
  const next = units.map(u => {
    if ((u.team !== 'blue' && u.team !== 'red') || u.health <= 0 || u.decoyActive) return u;
    const level = upgradeLevelOf(economy[u.team], u.type);
    if ((u.upgradeLevel ?? 0) === level) return u;
    changed = true;
    const maxHealth = upgradedMaxHealth(u.type, level);
    return { ...u, upgradeLevel: level, maxHealth, health: Math.max(1, u.health + maxHealth - u.maxHealth) };
  });
  return changed ? next : units;
}

// The tier a side's Thunderheads shoot at: their range grows with the shell upgrades.
export const artilleryTierOf = (team: Pick<TeamEconomy, 'upgrades'> | undefined): Tier =>
  hasUpgrade(team, 'guided_shells') ? 3 : hasUpgrade(team, 'long_range_shells') ? 2 : 1;

// Why a side can't start researching an upgrade, or null if it can (cores aside). A doctrine's
// research needs the side's doctrine.
export function researchBlocker(
  economy: Economy, team: Team, structures: readonly StructureData[], id: UpgradeId, doctrine?: DoctrineType | null,
): string | null {
  const def = upgradeDef(id);
  if (!def) return 'unknown upgrade';
  if (def.doctrine && def.doctrine !== doctrine) return `${def.name} is only for its own doctrine`;
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
