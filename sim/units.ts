// The rules side of the unit roster: armor, weapons, population, tech tier and production.
// Names, cost, health and speed are in UNIT_STATS (constants.ts). docs/GAME_DESIGN.md explains
// the intent behind the numbers; sim/balance.test.ts checks the counters hold at equal cost.

import { STRUCTURE_INFO, UNIT_STATS } from '../constants';
import type { StructureData, StructureType, UnitData, UnitType } from '../types';

export type ArmorClass = 'infantry' | 'light' | 'heavy' | 'air' | 'structure';
export type DamageType = 'rifle' | 'ap' | 'flak' | 'explosive' | 'mg' | 'blade';
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
  // The Aegis rotary cannon, fired in bursts by sim/ciws.ts rather than shot by shot.
  ciws?: boolean;
}

// How hard each damage type hits each armor class.
//   Rifles shred infantry, AP cracks vehicles, flak swats aircraft, explosives level buildings.
//   Machine guns (the Kestrel attack drone) are a generalist: decent against everything, the best
//   counter to nothing.
export const DAMAGE_MULTIPLIER: Record<DamageType, Record<ArmorClass, number>> = {
  rifle:     { infantry: 1.0,  light: 0.6, heavy: 0.25, air: 0.5,  structure: 0.2 },
  ap:        { infantry: 0.5,  light: 1.0, heavy: 2.0,  air: 0.4,  structure: 0.75 },
  flak:      { infantry: 0.4,  light: 0.4, heavy: 0.2,  air: 2.0,  structure: 0.1 },
  explosive: { infantry: 1.25, light: 1.0, heavy: 0.75, air: 0,    structure: 1.5 },
  mg:        { infantry: 0.9,  light: 0.8, heavy: 0.55, air: 0.8,  structure: 0.35 },
  // Kage's katana (sim/shadowHero.ts): melee, cuts infantry apart, still bites into vehicles.
  blade:     { infantry: 1.3,  light: 0.9, heavy: 0.6,  air: 0,    structure: 0.5 },
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
  // --- Command HQ: the scout car. ---
  scout_car: { armor: 'light', weapon: null, pop: 1, tier: 1, producer: 'hq', buildTimeMs: 8000, role: 'Remote-controlled scout car. Very fast, sees far, big battery; unarmed and fragile.' },

  // --- Barracks: infantry. Cheap, captures ground, and the answer to aircraft. ---
  trooper: { armor: 'infantry', weapon: rifle(10, 1000, 3), pop: 1, tier: 1, producer: 'infantry', buildTimeMs: 12000, role: 'Line infantry. Captures nodes, shoots down aircraft.' },
  ghost: { armor: 'infantry', weapon: rifle(12, 800, 3), pop: 1, tier: 1, producer: 'infantry', buildTimeMs: 18000, role: 'EW specialist. Captures fast; hides the squad from map and radar (Tier 2) and cloaks with Phantom Decoy (Tier 3).' },
  lancer: { armor: 'infantry', weapon: ap(70, 3000, 4, true), pop: 1, tier: 2, producer: 'infantry', buildTimeMs: 16000, role: 'Rocket team. Breaks vehicles and gunships.' },

  // --- Factory: vehicles. Tough, run on the grid, beat infantry. ---
  razorback: { armor: 'light', weapon: rifle(10, 500, 3), pop: 2, tier: 1, producer: 'armor', buildTimeMs: 18000, role: 'Fast raider. Shreds infantry.' },
  sun_plate: { armor: 'heavy', weapon: null, pop: 2, tier: 1, producer: 'armor', buildTimeMs: 20000, role: 'Anchors to power linked vehicles away from the grid.' },
  tank: { armor: 'heavy', weapon: shell(50, 2200, 4, 1, 0.1), pop: 3, tier: 2, producer: 'armor', buildTimeMs: 30000, role: 'Main battle tank. Long-range rail gun that kills armour, short-range gun for close work.' },
  // Its weapon is shown here for menus and balance; it fires through sim/artillery.ts. Range grows with tier.
  howitzer: { armor: 'light', weapon: { ...shell(70, 5000, 12, 1.6, 0.4), indirect: true }, pop: 3, tier: 1, producer: 'armor', buildTimeMs: 28000, role: 'Long-range artillery. Anchors to shell a target; helpless while moving.' },
  // Its rotary cannon fires through sim/ciws.ts in bursts (3.5 s on, 6 s reload); shown here as its rate against aircraft while firing.
  aegis: { armor: 'light', weapon: { damage: 1.6, cooldownMs: 100, range: 10, type: 'flak', hitsGround: false, hitsAir: true, ciws: true }, pop: 2, tier: 2, producer: 'armor', buildTimeMs: 20000, role: 'Air-defence carrier: radar and an automatic rotary cannon that shreds aircraft and missiles. Helpless on the ground.' },

  // --- Airpad: aircraft. Ignore walls and terrain, beat vehicles. ---
  drone: { armor: 'air', weapon: null, pop: 1, tier: 1, producer: 'air', buildTimeMs: 10000, role: 'Radar scout. Picks up ground units and large aircraft.' },
  attack_drone: { armor: 'air', weapon: { damage: 6, cooldownMs: 400, range: 3, type: 'mg', hitsGround: true, hitsAir: true }, pop: 1, tier: 1, producer: 'air', buildTimeMs: 12000, role: 'Cheap armed drone. Machine gun that does decent damage to everything, ground and air.' },
  wasp: { armor: 'air', weapon: rifle(6, 600, 3), pop: 2, tier: 2, producer: 'air', buildTimeMs: 22000, role: 'Harasser. Fires homing swarm volleys.' },
  hornet: { armor: 'air', weapon: ap(32, 1600, 4), pop: 3, tier: 2, producer: 'air', buildTimeMs: 26000, role: 'Gunship. AP rounds hunt vehicles; rockets at Tier 3.' },
  bombard: { armor: 'air', weapon: null, pop: 4, tier: 3, producer: 'air', buildTimeMs: 35000, role: 'Levels a 5x5 patch of city, opening new lanes.' },

  // --- Comm Link: support. ---
  guardian: { armor: 'light', weapon: null, pop: 2, tier: 1, producer: 'support', buildTimeMs: 18000, role: 'Repairs three allies and knocks down heavy shells.' },
  helios: { armor: 'air', weapon: null, pop: 1, tier: 1, producer: 'support', buildTimeMs: 12000, role: 'Microwave drone: slowly charges friendly units, or slowly cooks enemies. One mode at a time.' },
  banshee: { armor: 'light', weapon: null, pop: 3, tier: 2, producer: 'support', buildTimeMs: 28000, role: 'Jams enemy drones\' control links and hardlines up to three friendly drones to its battery.' },
  ballista: { armor: 'light', weapon: null, pop: 3, tier: 3, producer: 'ordnance_fab', buildTimeMs: 30000, role: 'Launches EMP and HE missiles up to half the map away.' },

  // --- Depot and Ordnance Fab ---
  mason: { armor: 'light', weapon: null, pop: 1, tier: 1, producer: 'builder', buildTimeMs: 12000, role: 'Builds walls and turrets.' },
  mule: { armor: 'light', weapon: null, pop: 2, tier: 2, producer: 'ordnance_fab', buildTimeMs: 20000, role: 'Fabricates missiles in the field.' },
  swarm_host: { armor: 'heavy', weapon: null, pop: 3, tier: 2, producer: 'ordnance_fab', buildTimeMs: 30000, role: 'Mobile drone hive. Anchors to release Crawler Drones that hunt nearby enemies.' },
  // Couriers are dispatched by Transfer Warhead, not trained.
  courier: { armor: 'light', weapon: null, pop: 0, tier: 2, producer: null, buildTimeMs: 0, role: 'Runs a warhead to a Ballista.' },

  // --- Advanced Research: doctrine heroes (sim/heroes.ts). Placeholders: one per doctrine, only
  // for the side that picked it, one at a time, unlocked by research. ---
  // Goliath: a heavy machine gun in both hands, and grenades from his back (sim/heavyMetalHero.ts).
  hero_heavy_metal: { armor: 'heavy', weapon: { damage: 16, cooldownMs: 300, range: 5, type: 'mg', hitsGround: true, hitsAir: true }, pop: 4, tier: 1, producer: 'research_lab', buildTimeMs: 40000, role: 'Heavy Metal\'s hero. A full-borg juggernaut: heavy machine gun, and grenade volleys from his back every 8s.' },
  // Kage: melee only, a katana that can't reach aircraft, and a self-cloak (sim/shadowHero.ts).
  hero_shadow_ops: { armor: 'infantry', weapon: { damage: 60, cooldownMs: 800, range: 1.3, type: 'blade', hitsGround: true, hitsAir: false }, pop: 4, tier: 1, producer: 'research_lab', buildTimeMs: 40000, role: 'Shadow Ops\' hero. A cloaking assassin with a katana: melee only, can\'t hit aircraft. Striking from cloak deals double damage.' },
  hero_netrunner: { armor: 'light', weapon: { damage: 14, cooldownMs: 500, range: 4, type: 'mg', hitsGround: true, hitsAir: true }, pop: 4, tier: 1, producer: 'research_lab', buildTimeMs: 40000, role: 'Netrunner\'s hero (placeholder). Hits ground and air alike.' },

  // --- Never trained ---
  defense_drone: { armor: 'heavy', weapon: rifle(14, 500, 3), pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Guards a server node. Hostile to everyone.' },
  titan_dropped: { armor: 'heavy', weapon: shell(60, 2200, 4, 1, 0.1), pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Orbital-drop Titan.' },
  field_generator: { armor: 'heavy', weapon: null, pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Projects a force field the enemy cannot shoot into.' },
  cloak_generator: { armor: 'light', weapon: null, pop: 0, tier: 1, producer: null, buildTimeMs: 0, role: 'Cloaks friendly units within 3 tiles while it has battery.' },
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
  // Researches unit upgrades (sim/upgrades.ts), and trains its side's doctrine hero (sim/heroes.ts).
  research_lab: { buildable: true, buildTimeMs: 20000, weapon: null },
  // Makes cores at home (sim/refinery.ts).
  refinery: { buildable: true, buildTimeMs: 30000, weapon: null },
  ordnance: { buildable: false, buildTimeMs: 0, weapon: null },
  // Mason-built: their build time is the Mason's hauls.
  wall_tier1: { buildable: false, buildTimeMs: 0, weapon: null },
  wall_tier2: { buildable: false, buildTimeMs: 0, weapon: null },
  // Anti-vehicle cannon: armour-piercing shells, ground only.
  defense: { buildable: false, buildTimeMs: 0, weapon: ap(40, 1500, 6) },
  // Rotary cannon fired through sim/ciws.ts like the Aegis'; shown here as its rate while firing.
  // Against ground units it does half its flak damage.
  aa_turret: { buildable: false, buildTimeMs: 0, weapon: { damage: 1.6, cooldownMs: 100, range: 10, type: 'flak', hitsGround: true, hitsAir: true, ciws: true } },
  hq: { buildable: false, buildTimeMs: 0, weapon: ap(30, 1000, 5, true) },
  // The starting bases' wall and blast gates (sim/compound.ts).
  base_wall: { buildable: false, buildTimeMs: 0, weapon: null },
  base_gate: { buildable: false, buildTimeMs: 0, weapon: null },
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

// Population cap: a base allowance, a small bump for each core node held, and one more for every
// GRID_TILES_PER_POP tiles of energy grid the side's captured buildings cover (sim/energy.ts,
// gridTiles), so spreading out across the city raises it bit by bit.
export const POP_BASE = 20;
export const POP_PER_CORE_NODE = 3;
export const GRID_TILES_PER_POP = 100;
export const POP_MAX = 60;
export const popCap = (coreNodesHeld: number, gridTiles = 0) =>
  Math.min(POP_MAX, POP_BASE + POP_PER_CORE_NODE * coreNodesHeld + Math.floor(gridTiles / GRID_TILES_PER_POP));

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
