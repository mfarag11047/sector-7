// Match settings and each side's starting force.

import { ABILITY_CONFIG, STRUCTURE_INFO, UNIT_STATS } from '../constants';
import type { DoctrineType, StructureData, StructureType, UnitData, UnitType } from '../types';
import type { GridPos, Team } from './commands';

export type MatchMode = 'ai' | 'sandbox' | 'spectate';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface MatchConfig {
  // ai: you against the computer. sandbox: the old test bed, both sides under your control.
  // spectate: the computer against itself, for checking match pacing (sim/pacing.ts); blue
  // plays playerDoctrine and red aiDoctrine, both at `difficulty`.
  mode: MatchMode;
  seed: number;
  playerTeam: Team;
  difficulty: Difficulty;
  playerDoctrine: DoctrineType | null;
  aiDoctrine: DoctrineType | null;
}

export const STARTING_CORES: Record<MatchMode, number> = { ai: 1000, sandbox: 5000, spectate: 1000 };

// The computer plays by the same rules at every level; harder levels think faster and earn more.
export const AI_INCOME_MULTIPLIER: Record<Difficulty, number> = { easy: 0.7, normal: 1.0, hard: 1.35 };

export const opponentOf = (team: Team): Team => (team === 'blue' ? 'red' : 'blue');
export const aiTeamOf = (config: MatchConfig): Team | null => (config.mode === 'ai' ? opponentOf(config.playerTeam) : null);
// Every side the computer plays.
export const aiTeamsOf = (config: MatchConfig): Team[] =>
  config.mode === 'spectate' ? ['blue', 'red'] : config.mode === 'ai' ? [opponentOf(config.playerTeam)] : [];

// Each side's doctrine: in AI vs AI, blue takes playerDoctrine and red aiDoctrine.
export const doctrineOf = (config: MatchConfig, team: Team): DoctrineType | null =>
  config.mode === 'spectate' ? (team === 'blue' ? config.playerDoctrine : config.aiDoctrine)
    : team === config.playerTeam ? config.playerDoctrine : team === aiTeamOf(config) ? config.aiDoctrine : null;

// Income multipliers for payIncome.
export const incomeMultipliers = (config: MatchConfig): Partial<Record<Team, number>> =>
  Object.fromEntries(aiTeamsOf(config).map(t => [t, AI_INCOME_MULTIPLIER[config.difficulty]]));

const fresh = (id: string, type: UnitType, team: Team, gridPos: GridPos): UnitData => ({
  id, type, unitClass: UNIT_STATS[type].unitClass, team, gridPos, path: [],
  visionRange: UNIT_STATS[type].visionRange, health: UNIT_STATS[type].maxHealth, maxHealth: UNIT_STATS[type].maxHealth,
  battery: 100, maxBattery: 100, cooldowns: {},
});

// A skirmish start: three Strike Troopers to take the home core node, a Mason and a scout drone.
// Placed inside the base area (always street) and mirrored for red.
export function skirmishRoster(gridSize: number, blueBase: GridPos): UnitData[] {
  const last = gridSize - 1;
  const layout: [UnitType, number, number][] = [
    ['trooper', 2, -1], ['trooper', 2, 1], ['trooper', -1, 2], ['mason', 1, 2], ['drone', -2, -1],
  ];
  const units: UnitData[] = [];
  layout.forEach(([type, dx, dz], i) => {
    const pos = { x: blueBase.x + dx, z: blueBase.z + dz };
    units.push(fresh(`start-blue-${i}`, type, 'blue', pos));
    units.push(fresh(`start-red-${i}`, type, 'red', { x: last - pos.x, z: last - pos.z }));
  });
  for (const u of units) if (u.type === 'mason') { u.cargo = 0; u.constructionTargetId = null; }
  return units;
}

// The original sandbox: one of nearly every unit on each side.
export function sandboxRoster(gridSize: number): UnitData[] {
  return [
    { id: 'u1', type: 'drone', unitClass: 'air', team: 'blue', gridPos: { x: 3, z: 4 }, path: [], visionRange: UNIT_STATS.drone.visionRange, health: UNIT_STATS.drone.maxHealth, maxHealth: UNIT_STATS.drone.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u2', type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x: 5, z: 4 }, path: [], visionRange: UNIT_STATS.tank.visionRange, health: UNIT_STATS.tank.maxHealth, maxHealth: UNIT_STATS.tank.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u3', type: 'drone', unitClass: 'air', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 5 }, path: [], visionRange: UNIT_STATS.drone.visionRange, health: UNIT_STATS.drone.maxHealth, maxHealth: UNIT_STATS.drone.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u4', type: 'tank', unitClass: 'armor', team: 'red', gridPos: { x: gridSize - 4, z: gridSize - 5 }, path: [], visionRange: UNIT_STATS.tank.visionRange, health: UNIT_STATS.tank.maxHealth, maxHealth: UNIT_STATS.tank.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u5', type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 2, z: 5 }, path: [], visionRange: UNIT_STATS.ghost.visionRange, isDampenerActive: false, health: UNIT_STATS.ghost.maxHealth, maxHealth: UNIT_STATS.ghost.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u6', type: 'ghost', unitClass: 'infantry', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.ghost.visionRange, isDampenerActive: false, health: UNIT_STATS.ghost.maxHealth, maxHealth: UNIT_STATS.ghost.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u7', type: 'guardian', unitClass: 'support', team: 'blue', gridPos: { x: 4, z: 6 }, path: [], visionRange: UNIT_STATS.guardian.visionRange, health: UNIT_STATS.guardian.maxHealth, maxHealth: UNIT_STATS.guardian.maxHealth, cooldowns: { trophySystem: 0 }, battery: 100, maxBattery: 100 },
    { id: 'u8', type: 'guardian', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 4 }, path: [], visionRange: UNIT_STATS.guardian.visionRange, health: UNIT_STATS.guardian.maxHealth, maxHealth: UNIT_STATS.guardian.maxHealth, cooldowns: { trophySystem: 0 }, battery: 100, maxBattery: 100 },
    { id: 'u9', type: 'mule', unitClass: 'ordnance', team: 'blue', gridPos: { x: 6, z: 5 }, path: [], visionRange: UNIT_STATS.mule.visionRange, health: UNIT_STATS.mule.maxHealth, maxHealth: UNIT_STATS.mule.maxHealth, cooldowns: { combatPrint: 0, smogShell: 0 }, battery: 100, maxBattery: 100, ordnanceMaterial: ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY, missileInventory: { emp: 0, he: 0, wp: 0 } },
    { id: 'u10', type: 'mule', unitClass: 'ordnance', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.mule.visionRange, health: UNIT_STATS.mule.maxHealth, maxHealth: UNIT_STATS.mule.maxHealth, cooldowns: { combatPrint: 0, smogShell: 0 }, battery: 100, maxBattery: 100, ordnanceMaterial: ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY, missileInventory: { emp: 0, he: 0, wp: 0 } },
    { id: 'u11', type: 'wasp', unitClass: 'air', team: 'blue', gridPos: { x: 5, z: 7 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u12', type: 'mason', unitClass: 'builder', team: 'blue', gridPos: { x: 3, z: 6 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u13', type: 'helios', unitClass: 'support', team: 'blue', gridPos: { x: 2, z: 6 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u14', type: 'sun_plate', unitClass: 'armor', team: 'blue', gridPos: { x: 4, z: 5 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, maxBattery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, isDeployed: false, batteryTetherIds: [] },
    { id: 'u15', type: 'ballista', unitClass: 'support', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, missileInventory: { emp: 1, he: 1, wp: 0 }, loadingProgress: 0 },
    { id: 'u16', type: 'wasp', unitClass: 'air', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 8 }, path: [], visionRange: UNIT_STATS.wasp.visionRange, health: UNIT_STATS.wasp.maxHealth, maxHealth: UNIT_STATS.wasp.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u17', type: 'mason', unitClass: 'builder', team: 'red', gridPos: { x: gridSize - 4, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.mason.visionRange, health: UNIT_STATS.mason.maxHealth, maxHealth: UNIT_STATS.mason.maxHealth, cooldowns: {}, cargo: 0, constructionTargetId: null, battery: 100, maxBattery: 100 },
    { id: 'u18', type: 'helios', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 3, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.helios.visionRange, health: UNIT_STATS.helios.maxHealth, maxHealth: UNIT_STATS.helios.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100 },
    { id: 'u19', type: 'sun_plate', unitClass: 'armor', team: 'red', gridPos: { x: gridSize - 5, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.sun_plate.visionRange, health: UNIT_STATS.sun_plate.maxHealth, maxHealth: UNIT_STATS.sun_plate.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, maxBattery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, isDeployed: false, batteryTetherIds: [] },
    { id: 'u20', type: 'ballista', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 6, z: gridSize - 6 }, path: [], visionRange: UNIT_STATS.ballista.visionRange, health: UNIT_STATS.ballista.maxHealth, maxHealth: UNIT_STATS.ballista.maxHealth, cooldowns: {}, battery: 100, maxBattery: 100, ammoState: 'empty', loadedAmmo: null, missileInventory: { emp: 1, he: 1, wp: 0 }, loadingProgress: 0 },
    { id: 'u21', type: 'banshee', unitClass: 'support', team: 'blue', gridPos: { x: 6, z: 6 }, path: [], visionRange: UNIT_STATS.banshee.visionRange, health: UNIT_STATS.banshee.maxHealth, maxHealth: UNIT_STATS.banshee.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, jammerActive: false },
    { id: 'u22', type: 'banshee', unitClass: 'support', team: 'red', gridPos: { x: gridSize - 7, z: gridSize - 7 }, path: [], visionRange: UNIT_STATS.banshee.visionRange, health: UNIT_STATS.banshee.maxHealth, maxHealth: UNIT_STATS.banshee.maxHealth, cooldowns: {}, battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, jammerActive: false },
  ];
}

// The sandbox also starts each side with one of every base building, finished, on the free
// tiles along the outer edge of its base (clear of the starting units). Mirrored for red.
const SANDBOX_LAYOUT: [StructureType, number, number][] = [
  ['infantry', 1, 1], ['armor', 3, 1], ['air', 5, 1], ['support', 7, 2], ['builder', 1, 3], ['ordnance_fab', 1, 7], ['research_lab', 2, 7], ['refinery', 3, 7],
];
export function sandboxStructures(gridSize: number): StructureData[] {
  const last = gridSize - 1;
  return SANDBOX_LAYOUT.flatMap(([type, x, z]) => (['blue', 'red'] as const).map((team): StructureData => {
    const info = STRUCTURE_INFO[type];
    return {
      id: `sandbox-${team}-${type}`, type, team, gridPos: team === 'blue' ? { x, z } : { x: last - x, z: last - z },
      isBlueprint: false, constructionProgress: info.maxProgress || 100, maxProgress: info.maxProgress || 100,
      health: info.maxHealth, maxHealth: info.maxHealth,
    };
  }));
}

export const startingRoster = (config: MatchConfig, gridSize: number, blueBase: GridPos) =>
  config.mode === 'sandbox' ? sandboxRoster(gridSize) : skirmishRoster(gridSize, blueBase);
