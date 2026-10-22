// The Core Refinery: a base building that makes cores at home.
//
// It takes one of a Command HQ's building pads (sim/baseLayout.ts), at most REFINERY.perHq per HQ
// the side has. Each working refinery pays:
// - a flat income of its own, REFINERY.flat[level], and
// - REFINERY.multiplier of the side's core node income on top, stacking additively across
//   refineries up to REFINERY.maxMultiplier.
// So a refinery is worth something even to a side holding nothing, and more to one holding the
// map: it rewards building up at home without taking away the reason to go out and take nodes.
//
// A refinery can be upgraded once, to level 2 (Tier 2, REFINERY.upgrade cores and time). That
// raises only its own flat income, not the multiplier, so an upgraded refinery is a bigger loss
// and a better target.
//
// Pure: CityMap and the headless runner advance upgrades; sim/economy.ts adds the income.

import { CITY_CONFIG } from '../constants';
import type { StructureData } from '../types';
import type { GridPos, Team } from './commands';
import { hqPads } from './baseLayout';

export const REFINERY = {
  // Cores a second of flat income, by level.
  flat: { 1: 1.5, 2: 4 } as Record<1 | 2, number>,
  // Share of core node income each refinery adds, by how many city blocks its base is from the
  // nearest core node: `best` next door (1 block, diagonals included), `step` less for each block
  // further, never below `min`. And the most all of them together can add.
  proximity: { best: 0.15, step: 0.04, min: 0.04 },
  maxMultiplier: 0.4,
  // Refineries allowed per working Command HQ.
  perHq: 2,
  upgrade: { cost: 500, ms: 25_000, tier: 2 as const },
};

export const levelOf = (s: Pick<StructureData, 'refineryLevel'>): 1 | 2 => (s.refineryLevel === 2 ? 2 : 1);

// Finished, standing and not a blueprint: the ones that pay.
export const isWorkingRefinery = (s: StructureData) =>
  s.type === 'refinery' && s.health > 0 && !s.isBlueprint && !((s.buildRemainingMs ?? 0) > 0) && !s.dismantle;

// --- Closeness to a core node ---

// City blocks are the lots between roads, every BLOCK tiles.
const BLOCK = 6;
const blockOf = (p: GridPos) => ({ x: Math.floor(p.x / BLOCK), z: Math.floor(p.z / BLOCK) });

// City blocks between two tiles: 1 for the block next door, diagonals included.
export function blocksBetween(a: GridPos, b: GridPos): number {
  const p = blockOf(a), q = blockOf(b);
  return Math.max(Math.abs(p.x - q.x), Math.abs(p.z - q.z));
}

// The share of node income a refinery adds when its base is `blocks` city blocks from a core node.
export const proximityMultiplier = (blocks: number) =>
  blocks <= 1 ? REFINERY.proximity.best : Math.max(REFINERY.proximity.min, REFINERY.proximity.best - REFINERY.proximity.step * (blocks - 1));

// How close a base at `hq` is to the nearest core node, and the share its refineries add.
export function baseProximity(hq: GridPos, coreNodes: readonly GridPos[]): { blocks: number | null; multiplier: number } {
  if (coreNodes.length === 0) return { blocks: null, multiplier: REFINERY.proximity.min };
  const blocks = Math.min(...coreNodes.map(n => blocksBetween(hq, n)));
  return { blocks, multiplier: proximityMultiplier(blocks) };
}

// The Command HQ a refinery belongs to: the one whose pad it stands on, else the nearest.
export function refineryHq(r: StructureData, structures: readonly StructureData[], gridSize = CITY_CONFIG.gridSize): StructureData | undefined {
  const hqs = structures.filter(s => s.type === 'hq' && s.team === r.team && s.health > 0);
  return hqs.find(h => hqPads(h.gridPos, 'building', gridSize).some(p => p.x === r.gridPos.x && p.z === r.gridPos.z))
    ?? hqs.sort((a, b) => blocksBetween(a.gridPos, r.gridPos) - blocksBetween(b.gridPos, r.gridPos))[0];
}

// The share of node income one refinery adds, from where its base stands.
export function refineryMultiplier(r: StructureData, structures: readonly StructureData[], coreNodes: readonly GridPos[], gridSize = CITY_CONFIG.gridSize) {
  const hq = refineryHq(r, structures, gridSize);
  return hq ? baseProximity(hq.gridPos, coreNodes) : { blocks: null, multiplier: REFINERY.proximity.min };
}

export interface RefineryIncome {
  // Working refineries.
  count: number;
  // Their flat income, all levels together.
  flat: number;
  // The share of node income they add (capped), and what that comes to.
  multiplier: number;
  bonus: number;
  // Each refinery's share, before the cap, and its base's distance from a core node in blocks.
  each: { id: string; multiplier: number; blocks: number | null }[];
}

// What a side's refineries add to its income, given its core node income and where the core
// nodes are.
export function refineryIncome(structures: readonly StructureData[], team: Team, nodeIncome: number, coreNodes: readonly GridPos[] = [], gridSize = CITY_CONFIG.gridSize): RefineryIncome {
  const working = structures.filter(s => s.team === team && isWorkingRefinery(s));
  const flat = working.reduce((n, s) => n + REFINERY.flat[levelOf(s)], 0);
  const each = working.map(r => ({ id: r.id, ...refineryMultiplier(r, structures, coreNodes, gridSize) }));
  const multiplier = Math.min(REFINERY.maxMultiplier, each.reduce((n, e) => n + e.multiplier, 0));
  return { count: working.length, flat, multiplier, bonus: nodeIncome * multiplier, each };
}

// How many refineries a side may have: REFINERY.perHq for each of its working Command HQs.
export const refineryLimit = (structures: readonly StructureData[], team: Team) =>
  REFINERY.perHq * structures.filter(s => s.type === 'hq' && s.team === team && s.health > 0 && !((s.buildRemainingMs ?? 0) > 0)).length;

// Refineries a side has, standing or going up.
export const refineriesOf = (structures: readonly StructureData[], team: Team) =>
  structures.filter(s => s.type === 'refinery' && s.team === team && s.health > 0);

// Why this refinery can't start its level 2 upgrade, or null if it can (cores aside).
export function upgradeBlocker(s: StructureData | undefined, team: Team, tier: number): string | null {
  if (!s || s.team !== team || s.type !== 'refinery') return 'not your Core Refinery';
  if (!isWorkingRefinery(s)) return 'the Core Refinery is not finished';
  if (levelOf(s) === 2) return 'already level 2';
  if (s.refineryUpgrade) return 'already upgrading';
  if (tier < REFINERY.upgrade.tier) return `needs Tier ${REFINERY.upgrade.tier}`;
  return null;
}

// Advances every refinery upgrade by `stepMs`; a finished one becomes level 2. Returns the
// structures unchanged (same array) when nothing is upgrading.
export function advanceRefineryUpgrades(structures: StructureData[], stepMs: (team: StructureData['team']) => number): { structures: StructureData[]; finished: StructureData[] } {
  if (!structures.some(s => s.refineryUpgrade)) return { structures, finished: [] };
  const finished: StructureData[] = [];
  const next = structures.map(s => {
    if (!s.refineryUpgrade || s.health <= 0) return s;
    const remainingMs = s.refineryUpgrade.remainingMs - stepMs(s.team);
    if (remainingMs > 0) return { ...s, refineryUpgrade: { ...s.refineryUpgrade, remainingMs } };
    const done = { ...s, refineryUpgrade: undefined, refineryLevel: 2 as const };
    finished.push(done);
    return done;
  });
  return { structures: next, finished };
}
