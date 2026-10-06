// Cores, warhead stockpiles, income and doctrine tier progress.
//
// Every function here is pure: it takes the current economy and returns a new one
// without touching React, the 3D scene or the clock. That is what lets the same code
// run in the browser today and on the game server later, and what makes it testable.

import { ABILITY_CONFIG, BUILDING_VALUES, DOCTRINE_CONFIG, STRUCTURE_INFO, TIER_UNLOCK_COSTS, UNIT_STATS } from '../constants';
import type { BuildingData, DoctrineType, StructureData, StructureType, TeamStats, UnitData, UnitType } from '../types';
import type { Team, Warhead } from './commands';

export const STARTING_CORES = 2500;
// Income is paid once per economy tick.
export const ECONOMY_TICK_MS = 1000;
// Warhead fabs and Field Fabricators advance once per logic tick.
export const PRODUCTION_TICK_MS = 100;
// Skunkworks tier 1 passive: production runs 10% faster.
const SKUNKWORKS_PRODUCTION_BONUS = 1.1;

export interface TeamEconomy {
  cores: number;
  // Every core ever earned. Doctrine tiers unlock from this, so spending never re-locks them.
  lifetimeIncome: number;
  stockpile: Record<Warhead, number>;
}

export type Economy = Record<Team, TeamEconomy>;

export const TEAMS: readonly Team[] = ['blue', 'red'];

export const createEconomy = (startingCores = STARTING_CORES): Economy => ({
  blue: { cores: startingCores, lifetimeIncome: 0, stockpile: { eclipse: 0, he: 0 } },
  red: { cores: startingCores, lifetimeIncome: 0, stockpile: { eclipse: 0, he: 0 } },
});

const withTeam = (economy: Economy, team: Team, patch: Partial<TeamEconomy>): Economy => ({
  ...economy,
  [team]: { ...economy[team], ...patch },
});

// --- Prices ---

export const unitCost = (type: UnitType) => UNIT_STATS[type].cost || 0;
export const structureCost = (type: StructureType) => STRUCTURE_INFO[type].cost;
export const warheadCost = (warhead: Warhead) =>
  warhead === 'eclipse' ? ABILITY_CONFIG.WARHEAD_COST_ECLIPSE : ABILITY_CONFIG.WARHEAD_COST_HE;
export const warheadBuildTime = (warhead: Warhead) =>
  warhead === 'eclipse' ? ABILITY_CONFIG.WARHEAD_BUILD_TIME_ECLIPSE : ABILITY_CONFIG.WARHEAD_BUILD_TIME_HE;
export const doctrinePowerCost = (doctrine: DoctrineType, tier: 2 | 3) =>
  tier === 2 ? DOCTRINE_CONFIG[doctrine].tier2_cost : DOCTRINE_CONFIG[doctrine].tier3_cost;

// --- Spending ---

const isPrice = (cost: number) => Number.isFinite(cost) && cost >= 0;

export const canAfford = (economy: Economy, team: Team, cost: number) =>
  isPrice(cost) && economy[team].cores >= cost;

// Returns the economy after paying, or null when the team cannot afford it.
export function spend(economy: Economy, team: Team, cost: number): Economy | null {
  if (!canAfford(economy, team, cost)) return null;
  return withTeam(economy, team, { cores: economy[team].cores - cost });
}

export function setCores(economy: Economy, team: Team, cores: number): Economy {
  return withTeam(economy, team, { cores: Math.max(0, cores) });
}

// --- Warhead stockpile ---

export function addWarheads(economy: Economy, team: Team, warhead: Warhead, count = 1): Economy {
  const stockpile = { ...economy[team].stockpile, [warhead]: economy[team].stockpile[warhead] + count };
  return withTeam(economy, team, { stockpile });
}

// Returns the economy after drawing one warhead, or null when the stockpile is empty.
export function takeWarhead(economy: Economy, team: Team, warhead: Warhead): Economy | null {
  if (economy[team].stockpile[warhead] <= 0) return null;
  return addWarheads(economy, team, warhead, -1);
}

// --- Income ---

// Only core nodes pay. Other captured buildings extend the energy grid instead.
export function incomeFor(buildings: readonly BuildingData[], team: Team): number {
  let income = 0;
  for (const b of buildings) {
    if (b.owner === team && !b.destroyed) income += BUILDING_VALUES[b.type].income;
  }
  return income;
}

// One economy tick. Always returns a new object so listeners refresh once per tick.
export function payIncome(economy: Economy, buildings: readonly BuildingData[]): Economy {
  const next = { ...economy };
  for (const team of TEAMS) {
    const income = incomeFor(buildings, team);
    next[team] = {
      ...economy[team],
      cores: economy[team].cores + income,
      lifetimeIncome: economy[team].lifetimeIncome + income,
    };
  }
  return next;
}

export function unlockedTier(lifetimeIncome: number): 1 | 2 | 3 {
  if (lifetimeIncome >= TIER_UNLOCK_COSTS.TIER3) return 3;
  if (lifetimeIncome >= TIER_UNLOCK_COSTS.TIER2) return 2;
  return 1;
}

// --- Production ---

// Milliseconds of build progress one production tick is worth for this team.
export const productionStep = (doctrine: DoctrineType | null | undefined) =>
  PRODUCTION_TICK_MS * (doctrine === 'skunkworks' ? SKUNKWORKS_PRODUCTION_BONUS : 1);

export interface WarheadProductionResult {
  // New production state for each fab that advanced, keyed by structure id.
  updates: Map<string, NonNullable<StructureData['production']>>;
  finished: { team: Team; warhead: Warhead }[];
}

// One production tick for every Ordnance Fab that is building a warhead.
export function advanceWarheadProduction(
  structures: readonly StructureData[],
  doctrineOf: (team: Team) => DoctrineType | null | undefined,
): WarheadProductionResult {
  const updates: WarheadProductionResult['updates'] = new Map();
  const finished: WarheadProductionResult['finished'] = [];
  for (const s of structures) {
    const p = s.production;
    if (s.type !== 'ordnance_fab' || !p?.active) continue;
    const progress = p.progress + productionStep(doctrineOf(s.team));
    if (progress >= p.totalTime) {
      updates.set(s.id, { ...p, active: false, progress: 0 });
      finished.push({ team: s.team, warhead: p.item });
    } else {
      updates.set(s.id, { ...p, progress });
    }
  }
  return { updates, finished };
}

// --- HUD summary ---

export function teamStats(
  economy: Economy,
  team: Team,
  buildings: readonly BuildingData[],
  units: readonly UnitData[],
  bonusCompute = 0,
): TeamStats {
  const owned = { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0, core_node: 0 };
  for (const b of buildings) {
    if (b.owner === team && !b.destroyed) owned[b.type]++;
  }
  return {
    resources: economy[team].cores,
    income: incomeFor(buildings, team),
    compute: owned.server_node + bonusCompute,
    units: units.filter(u => u.team === team).length,
    buildings: owned,
    stockpile: { ...economy[team].stockpile },
    // The selected doctrine and its cooldowns live in App; only the tier comes from here.
    doctrine: { selected: null, unlockedTiers: unlockedTier(economy[team].lifetimeIncome), cooldowns: { tier2: 0, tier3: 0 } },
  };
}
