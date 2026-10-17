// Cores, warhead stockpiles, income and doctrine tier progress.
//
// Every function here is pure: it takes the current economy and returns a new one
// without touching React, the 3D scene or the clock. That is what lets the same code
// run in the browser today and on the game server later, and what makes it testable.

import { ABILITY_CONFIG, BUILDING_VALUES, DOCTRINE_CONFIG, STRUCTURE_INFO, TIER_UNLOCK_COSTS, UNIT_STATS } from '../constants';
import type { BuildingData, DoctrineType, StructureData, StructureType, TeamStats, UnitData, UnitType } from '../types';
import type { Team, Warhead } from './commands';
import { COMPUTE_PER_SERVER_NODE, HQ_COMPUTE, popCap, popUsed, Tier, TIER_RESEARCH_COST } from './units';

export const STARTING_CORES = 2500;
// Income is paid once per economy tick.
export const ECONOMY_TICK_MS = 1000;
// Warhead fabs and Field Fabricators advance once per logic tick.
export const PRODUCTION_TICK_MS = 100;
// Skunkworks tier 1 passive: production runs 10% faster.
const SKUNKWORKS_PRODUCTION_BONUS = 1.1;

export interface TeamEconomy {
  cores: number;
  // Every core ever earned, for the end-of-match stats.
  lifetimeIncome: number;
  stockpile: Record<Warhead, number>;
  // Compute from server nodes (and a trickle from the HQ), spent on research.
  compute: number;
  lifetimeCompute: number;
  // The highest tech tier researched. Never goes down.
  tier: Tier;
}

export type Economy = Record<Team, TeamEconomy>;

export const TEAMS: readonly Team[] = ['blue', 'red'];

const freshTeam = (cores: number): TeamEconomy => ({ cores, lifetimeIncome: 0, stockpile: { emp: 0, he: 0 }, compute: 0, lifetimeCompute: 0, tier: 1 });

export const createEconomy = (startingCores = STARTING_CORES): Economy => ({
  blue: freshTeam(startingCores),
  red: freshTeam(startingCores),
});

const withTeam = (economy: Economy, team: Team, patch: Partial<TeamEconomy>): Economy => ({
  ...economy,
  [team]: { ...economy[team], ...patch },
});

// --- Prices ---

export const unitCost = (type: UnitType) => UNIT_STATS[type].cost || 0;
export const structureCost = (type: StructureType) => STRUCTURE_INFO[type].cost;
export const warheadCost = (warhead: Warhead) =>
  warhead === 'emp' ? ABILITY_CONFIG.WARHEAD_COST_EMP : ABILITY_CONFIG.WARHEAD_COST_HE;
export const warheadBuildTime = (warhead: Warhead) =>
  warhead === 'emp' ? ABILITY_CONFIG.WARHEAD_BUILD_TIME_EMP : ABILITY_CONFIG.WARHEAD_BUILD_TIME_HE;
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

// Every HQ pays a small trickle so a side that loses all its nodes can still rebuild.
export const HQ_INCOME = 3;

// The HQ trickle plus core nodes. Other captured buildings extend the energy grid instead.
export function incomeFor(buildings: readonly BuildingData[], team: Team): number {
  let income = HQ_INCOME;
  for (const b of buildings) {
    if (b.owner === team && !b.destroyed) income += BUILDING_VALUES[b.type].income;
  }
  return income;
}

// One economy tick. Always returns a new object so listeners refresh once per tick.
// `multiplier` scales a team's income, which is how the AI difficulty levels are set.
export function payIncome(economy: Economy, buildings: readonly BuildingData[], multiplier: Partial<Record<Team, number>> = {}): Economy {
  const next = { ...economy };
  for (const team of TEAMS) {
    const scale = multiplier[team] ?? 1;
    const income = incomeFor(buildings, team) * scale;
    const compute = computeRateFor(buildings, team) * scale;
    next[team] = {
      ...economy[team],
      cores: economy[team].cores + income,
      lifetimeIncome: economy[team].lifetimeIncome + income,
      compute: economy[team].compute + compute,
      lifetimeCompute: economy[team].lifetimeCompute + compute,
    };
  }
  return next;
}

// --- Compute and research ---

// Compute per second: the HQ trickle plus every live server node held.
export const computeRateFor = (buildings: readonly BuildingData[], team: Team) =>
  HQ_COMPUTE + COMPUTE_PER_SERVER_NODE * buildings.filter(b => b.type === 'server_node' && b.owner === team && !b.destroyed).length;

export const researchCost = (tier: 2 | 3) => TIER_RESEARCH_COST[tier];

// Returns the economy after researching `tier`, or null when it isn't the next tier or the
// team lacks the compute.
export function research(economy: Economy, team: Team, tier: 2 | 3): Economy | null {
  const e = economy[team];
  if (tier !== e.tier + 1 || e.compute < researchCost(tier)) return null;
  return withTeam(economy, team, { compute: e.compute - researchCost(tier), tier });
}

export function setCompute(economy: Economy, team: Team, compute: number): Economy {
  return withTeam(economy, team, { compute: Math.max(0, compute) });
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
  structures: readonly StructureData[] = [],
): TeamStats {
  const owned = { residential: 0, commercial: 0, industrial: 0, hightech: 0, server_node: 0, core_node: 0 };
  for (const b of buildings) {
    if (b.owner === team && !b.destroyed) owned[b.type]++;
  }
  return {
    resources: economy[team].cores,
    income: incomeFor(buildings, team),
    compute: economy[team].compute,
    computeRate: computeRateFor(buildings, team),
    tier: economy[team].tier,
    pop: popUsed(units, structures, team),
    popCap: popCap(owned.core_node),
    units: units.filter(u => u.team === team && u.health > 0).length,
    buildings: owned,
    stockpile: { ...economy[team].stockpile },
    // The selected doctrine and its cooldowns live in App; only the tier comes from here.
    // Doctrine powers unlock with the researched tech tier.
    doctrine: { selected: null, unlockedTiers: economy[team].tier, cooldowns: { tier2: 0, tier3: 0 } },
  };
}
