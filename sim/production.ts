// Construction and training over time.
//
// Base structures go up on their own once placed (buildRemainingMs counts down). A finished
// production structure works through its training queue one unit at a time. Both run at the
// team's production speed, so the Skunkworks doctrine bonus applies to them as it does to
// warheads.
//
// Also here: createUnit, the one place a fresh unit of any type is put together, used for
// trained units, starting rosters and anything else that needs a new unit.

import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { DoctrineType, StructureData, UnitData, UnitType } from '../types';
import type { GridPos, Team } from './commands';
import { productionStep } from './economy';
import { isOperational } from './orders';

export function createUnit(type: UnitType, team: UnitData['team'], id: string, gridPos: GridPos): UnitData {
  const stats = UNIT_STATS[type];
  const unit: UnitData = {
    id, type, unitClass: stats.unitClass, team, gridPos: { ...gridPos }, path: [],
    visionRange: stats.visionRange, health: stats.maxHealth, maxHealth: stats.maxHealth,
    battery: 100, maxBattery: 100, cooldowns: {},
  };
  switch (type) {
    case 'mason': return { ...unit, cargo: 0, constructionTargetId: null };
    case 'ghost': return { ...unit, isDampenerActive: false };
    case 'guardian': return { ...unit, cooldowns: { trophySystem: 0 } };
    case 'banshee': return {
      ...unit, jammerActive: false,
      battery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY, maxBattery: ABILITY_CONFIG.BANSHEE_MAX_MAIN_BATTERY,
      secondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY, maxSecondaryBattery: ABILITY_CONFIG.BANSHEE_MAX_SEC_BATTERY,
    };
    case 'howitzer': return { ...unit, isDeployed: false, artilleryTarget: null };
    case 'sun_plate': return {
      ...unit, isDeployed: false, batteryTetherIds: [],
      battery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY, maxBattery: ABILITY_CONFIG.BATTERY_MULE_MAX_BATTERY,
    };
    case 'wasp': return { ...unit, cooldowns: { swarmLaunch: 0 }, charges: { swarm: ABILITY_CONFIG.WASP_MAX_CHARGES } };
    case 'bombard': return { ...unit, battery: ABILITY_CONFIG.BOMBARD_BATTERY, maxBattery: ABILITY_CONFIG.BOMBARD_BATTERY };
    case 'tank': return { ...unit, charges: { smoke: ABILITY_CONFIG.MAX_CHARGES_SMOKE, aps: ABILITY_CONFIG.MAX_CHARGES_APS } };
    // A new Ballista rolls out with one of each warhead.
    case 'ballista': return { ...unit, ammoState: 'empty', loadedAmmo: null, missileInventory: { emp: 1, he: 1 }, loadingProgress: 0 };
    case 'mule': return {
      ...unit, cooldowns: { combatPrint: 0, smogShell: 0 },
      ordnanceMaterial: ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY, missileInventory: { emp: 0, he: 0 },
    };
    default: return unit;
  }
}

export interface ProductionResult {
  updates: Map<string, Partial<StructureData>>;
  // Structures that finished going up this tick.
  completed: StructureData[];
  // Units that finished training, with the structure that trained them.
  trained: { structure: StructureData; unitType: UnitType }[];
}

// One production tick (PRODUCTION_TICK_MS) for every structure.
export function advanceProduction(
  structures: readonly StructureData[],
  doctrineOf: (team: Team) => DoctrineType | null | undefined,
): ProductionResult {
  const result: ProductionResult = { updates: new Map(), completed: [], trained: [] };
  for (const s of structures) {
    if (s.team !== 'blue' && s.team !== 'red') continue;
    const step = productionStep(doctrineOf(s.team));
    if ((s.buildRemainingMs || 0) > 0) {
      const buildRemainingMs = Math.max(0, s.buildRemainingMs! - step);
      result.updates.set(s.id, { buildRemainingMs });
      if (buildRemainingMs === 0) result.completed.push({ ...s, buildRemainingMs });
      continue;
    }
    if (!s.queue || s.queue.length === 0 || !isOperational(s)) continue;
    const [head, ...rest] = s.queue;
    const remainingMs = head.remainingMs - step;
    if (remainingMs <= 0) {
      result.updates.set(s.id, { queue: rest });
      result.trained.push({ structure: s, unitType: head.unitType });
    } else {
      result.updates.set(s.id, { queue: [{ ...head, remainingMs }, ...rest] });
    }
  }
  return result;
}

export function applyProduction(structures: StructureData[], result: ProductionResult): StructureData[] {
  if (result.updates.size === 0) return structures;
  return structures.map(s => {
    const patch = result.updates.get(s.id);
    return patch ? { ...s, ...patch } : s;
  });
}
