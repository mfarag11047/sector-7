// The rules side of the unit roster: armor, weapons, population, tech tier and production.
// Names, cost, health and speed are in UNIT_STATS (constants.ts). docs/GAME_DESIGN.md explains
// the intent behind the numbers; sim/balance.test.ts checks the counters hold at equal cost.

import { STRUCTURE_INFO, UNIT_STATS } from '../constants';
import type { StructureData, StructureType, UnitData, UnitType } from '../types';

export type ArmorClass = 'infantry' | 'light' | 'heavy' | 'air' | 'structure';
export type DamageType = 'rifle' | 'ap' | 'flak' | 'explosive';
export type Tier = 1 | 2 | 3;

export interface Weapon {
  damage: number;
  cooldownMs: number;
  range: number; // Tiles
  type: DamageType;
  hitsGround: boolean;
  hitsAir: boolean;
  // Explosive rounds also hit other enemy ground units within this many tiles of the target,
  // at splashFactor of the damage. Keeps clumped infantry honest.
  splash?: number;
  splashFactor?: number;
  // Lobbed shells that land later (the Thunderhead, sim/artillery.ts), not direct fire.
  indirect?: boolean;
}

// How hard each damage type hits each armor class.
//   Rifles shred infantry, AP cracks vehicles, flak swats aircraft, explosives level buildings.
export const DAMAGE_MULTIPLIER: Record<DamageType, Record<ArmorClass, number>> = {
  rifle:     { infantry: 1.0,  light: 0.6, heavy: 0.25, air: 0.5,  structure: 0.2 },
  ap:        { infantry: 0.5,  light: 1.0, heavy: 2.0,  air: 0.4,  structure: 0.75 },
  flak:      { infantry: 0.4,  light: 0.4, heavy: 0.2,  air: 2.0,  structure: 0.1 },
  explosive: { infantry: 1.25, light: 1.0, heavy: 0.75, air: 0,    structure: 1.5 },
};

export interface UnitRules {
  armor: ArmorClass;
  weapon: Weapon | null;
  pop: number;
  tier: Tier;
  // Structure that trains it, or null when it only arrives by ability, doctrine or map.
  producer: StructureType | null;
  buildTimeMs: number;
  role: string; // One line for menus and tooltips
}

const rifle = (damage: number, cooldownMs: number, range: number, hitsAir = true): Weapon =>
  ({ damage, cooldownMs, range, type: 'rifle', hitsGround: true, hitsAir });
const ap = (damage: number, cooldownMs: number, range: number, hitsAir = false): Weapon =>
  ({ damage, cooldownMs, range, type: 'ap', hitsGround: true, hitsAir });
const shell = (damage: number, cooldownMs: number, range: number, splash = 1, splashFactor = 0.3): Weapon =>
  ({ damage, cooldownMs, range, type: 'explosive', hitsGround: true, hitsAir: false, splash, splashFactor });

export const UNIT_RULES: Record<UnitType, UnitRules> = {
  // --- Barracks: infantry. Cheap, captures ground, and the answer to aircraft. ---
  trooper: { armor: 'infantry', weapon: rifle(10, 1000, 3), pop: 1, tier: 1, producer: 'infantry', buildTimeMs: 12000, role: 'Line infantry. Captures nodes, shoots down aircraft.' },
  ghost: { armor: 'infantry', weapon: rifle(12, 800, 3), pop: 1, tier: 2, producer: 'infantry', buildTimeMs: 18000, role: 'EW specialist. Captures fast, cloaks with Phantom Decoy.' },
  lancer: { armor: 'infantry', weapon: ap(70, 3000, 4, true), pop: 1, tier: 2, producer: 'infantry', buildTimeMs: 16000, role: 'Rocket team. Breaks vehicles and gunships.' },

  // --- Factory: vehicles. Tough, run on the grid, beat infantry. ---
  razorback: { armor: 'light', weapon: rifle(10, 500, 3), pop: 2, tier: 1, producer: 'armor', buildTimeMs: 18000, role: 'Fast raider. Shreds infantry.' },
  sun_plate: { armor: 'heavy', weapon: null, pop: 2, tier: 1, producer: 'armor', buildTimeMs: 20000, role: 'Anchors to power linked vehicles away from the grid.' },
  tank: { armor: 'heavy', weapon: shell(60, 2200, 4), pop: 3, tier: 2, producer: 'armor', buildTimeMs: 30000, role: 'Main battle tank. High-explosive shells flatten infantry and buildings.' },
  // Its weapon is shown here for menus and balance; it fires through sim/artillery.ts. Range grows with tier.
  howitzer: { armor: 'light', weapon: { ...shell(70, 5000, 12, 1.6, 0.4), indirect: true }, pop: 3, tier: 1, producer: 'armor', buildTimeMs: 28000, role: 'Long-range artillery. Anchors to shell a target; helpless while moving.' },
  aegis: { armor: 'light', weapon: { damage: 30, cooldownMs: 1200, range: 5, type: 'flak', hitsGround: false, hitsAir: true }, pop: 2, tier: 2, producer: 'armor', buildTimeMs: 20000, role: 'Flak carrier and air-search radar. Clears the sky, helpless on the ground.' },

  // --- Airpad: aircraft. Ignore walls and terrain, beat vehicles. ---
  drone: { armor: 'air', weapon: null, pop: 1, tier: 1, producer: 'air', buildTimeMs: 10000, role: 'Scout. Loiters for wide surveillance.' },
  wasp: { armor: 'air', weapon: rifle(6, 600, 3), pop: 2, tier: 2, producer: 'air', buildTimeMs: 22000, role: 'Harasser. Fires homing swarm volleys.' },
  hornet: { armor: 'air', weapon: ap(32, 1600, 4), pop: 3, tier: 2, producer: 'air', buildTimeMs: 26000, role: 'Gunship. Hunts vehicles.' },
  bombard: { armor: 'air', weapon: null, pop: 4, tier: 3, producer: 'air', buildTimeMs: 35000, role: 'Levels a 5x5 patch of city, opening new lanes.' },

  // --- Comm Link: support. ---
  guardian: { armor: 'light', weapon: null, pop: 2, tier: 1, producer: 'support', buildTimeMs: 18000, role: 'Repairs three allies and knocks down heavy shells.' },
  helios: { armor: 'air', weapon: null, pop: 1, tier: 1, producer: 'support', buildTimeMs: 12000, role: 'Charges friendly batteries wirelessly.' },
  banshee: { armor: 'light', weapon: null, pop: 3, tier: 2, producer: 'support', buildTimeMs: 28000, role: 'Jams the area and tethers a drone to its battery.' },
  ballista: { armor: 'light', weapon: null, pop: 3, tier: 3, producer: 'support', buildTimeMs: 30000, role: 'Launches EMP and HE missiles anywhere.' },

  // --- Depot and Ordnance Fab ---
  mason: { armor: 'light', weapon: null, pop: 1, tier: 1, producer: 'builder', buildTimeMs: 12000, role: 'Builds walls and turrets.' },
  mule: { armor: 'light', weapon: null, pop: 2, tier: 2, producer: 'ordnance_fab', buildTimeMs: 20000, role: 'Fabricates missiles in the field.' },
  // Couriers are dispatched by Transfer Warhead, not trained.
  courier: { armor: 'light', weapon: null, pop: 0, tier: 2, producer: null, buildTimeMs: 0, role: 'Runs a warhead to a Ballista.' },

  // --- Never trained ---
  defense_drone: { armor: 'heavy', weapon: rifle(14, 500, 3), pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Guards a server node. Hostile to everyone.' },
  titan_dropped: { armor: 'heavy', weapon: shell(60, 2200, 4), pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Orbital-drop Titan.' },
  swarm_host: { armor: 'heavy', weapon: null, pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Releases Crawler Drones when anchored.' },
  crawler_drone: { armor: 'light', weapon: null, pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Detonates next to enemies.' },
};

export interface StructureRules {
  buildable: boolean; // From the HQ build menu
  buildTimeMs: number;
  weapon: Weapon | null;
}

export const STRUCTURE_RULES: Record<StructureType, StructureRules> = {
  infantry: { buildable: true, buildTimeMs: 15000, weapon: null },
  builder: { buildable: true, buildTimeMs: 12000, weapon: null },
  armor: { buildable: true, buildTimeMs: 25000, weapon: null },
  support: { buildable: true, buildTimeMs: 20000, weapon: null },
  air: { buildable: true, buildTimeMs: 25000, weapon: null },
  ordnance_fab: { buildable: true, buildTimeMs: 30000, weapon: null },
  ordnance: { buildable: false, buildTimeMs: 0, weapon: null },
  // Mason-built: their build time is the Mason's hauls.
  wall_tier1: { buildable: false, buildTimeMs: 0, weapon: null },
  wall_tier2: { buildable: false, buildTimeMs: 0, weapon: null },
  defense: { buildable: false, buildTimeMs: 0, weapon: rifle(18, 800, 5) },
  hq: { buildable: false, buildTimeMs: 0, weapon: ap(30, 1000, 5, true) },
};

// Units a structure can train, in menu order.
export const unitsProducedBy = (structure: StructureType): UnitType[] =>
  (Object.keys(UNIT_RULES) as UnitType[]).filter(t => UNIT_RULES[t].producer === structure);

export const isAirType = (type: UnitType) => UNIT_RULES[type].armor === 'air';

// Damage one shot of `weapon` does to a target of `armor`.
export const shotDamage = (weapon: Weapon, armor: ArmorClass) => weapon.damage * DAMAGE_MULTIPLIER[weapon.type][armor];

export const canHit = (weapon: Weapon, targetIsAir: boolean) => (targetIsAir ? weapon.hitsAir : weapon.hitsGround);

// Damage per second against an armor class. For menus and balance checks.
export const dps = (weapon: Weapon | null, armor: ArmorClass) =>
  weapon && canHit(weapon, armor === 'air') ? shotDamage(weapon, armor) / (weapon.cooldownMs / 1000) : 0;

export const structureLabel = (type: StructureType) => STRUCTURE_INFO[type].label;
export const unitLabel = (type: UnitType) => UNIT_STATS[type].label;

// --- Population and tech ---

export const POP_BASE = 20;
export const POP_PER_CORE_NODE = 8;
export const POP_MAX = 60;
export const popCap = (coreNodesHeld: number) => Math.min(POP_MAX, POP_BASE + POP_PER_CORE_NODE * coreNodesHeld);

// Compute is a resource: server nodes produce it, and it is spent at the HQ to research the
// next tier, which then stays unlocked for good. Holding more nodes researches faster, but
// losing them only slows you down; it never takes a tier back. The HQ's own trickle means a
// side that holds no server node still reaches Tier 2 eventually.
export const COMPUTE_PER_SERVER_NODE = 1; // per second
export const HQ_COMPUTE = 0.25; // per second
export const TIER_RESEARCH_COST: Record<2 | 3, number> = { 2: 120, 3: 360 };
export const TIER_REQUIREMENT: Record<Tier, string> = {
  1: 'Available from the start',
  2: `Research Tier 2 at the HQ (${TIER_RESEARCH_COST[2]} compute)`,
  3: `Research Tier 3 at the HQ (${TIER_RESEARCH_COST[3]} compute)`,
};

// Living units plus everything queued, which reserves its population when ordered.
export function popUsed(units: readonly UnitData[], structures: readonly StructureData[], team: UnitData['team']): number {
  let used = 0;
  for (const u of units) if (u.team === team && u.health > 0) used += UNIT_RULES[u.type].pop;
  for (const s of structures) if (s.team === team) for (const q of s.queue || []) used += UNIT_RULES[q.unitType].pop;
  return used;
}
