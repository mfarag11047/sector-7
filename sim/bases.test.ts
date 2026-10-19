import { describe, expect, it } from 'vitest';
import type { BuildingData, StructureData } from '../types';
import { BASE_SITE, baseSites, clearedBlocks, commandPosts, rubbleCleared } from './bases';
import { createEconomy, setCompute } from './economy';
import { isInsideEnergyGrid } from './energy';
import { applyOrderToStructures, orderEffects, OrdersContext, OrdersView } from './orders';
import { advanceProduction, applyProduction, createUnit } from './production';
import { inBaseBlock, repairTick } from './support';
import { checkVictory } from './victory';

const bldg = (x: number, z: number, destroyed = false, type: BuildingData['type'] = 'residential'): BuildingData => ({
  id: `b-${x}-${z}`, gridX: x, gridZ: z, position: [0, 0, 0], scale: [1, 1, 1], color: '', type, height: 6, blockId: 'blk',
  owner: null, captureProgress: 0, capturingTeam: null, health: destroyed ? 0 : 100, maxHealth: 100, destroyed,
});
const hq = (id: string, team: 'blue' | 'red', x: number, z: number, patch: Partial<StructureData> = {}): StructureData => ({
  id, type: 'hq', team, gridPos: { x, z }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 5000, maxHealth: 5000, ...patch,
});
// The lot between roads 12 and 18 on both axes; its centre is (15, 15).
const CENTRE = { x: 15, z: 15 };
const levelled = [bldg(13, 13, true), bldg(14, 16, true), bldg(16, 14, true)];
const rich = () => setCompute(createEconomy(5000), 'blue', 1000);

let ids = 0;
const ctx: OrdersContext = {
  gridSize: 79, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, isWalkable: () => true,
  findPath: () => [], findAirPath: () => [], canBuildOn: () => true, newId: p => `${p}-${++ids}`,
};
const view = (patch: Partial<OrdersView> = {}): OrdersView => ({
  units: [createUnit('trooper', 'blue', 'scout', { x: 14, z: 12 })], structures: [hq('hq-blue', 'blue', 4, 4), hq('hq-red', 'red', 74, 74)],
  buildings: levelled, economy: rich(), ...patch,
});

describe('base sites', () => {
  it('a city block becomes a site once every building in it is destroyed', () => {
    expect(baseSites(levelled, []).map(s => s.at)).toEqual([CENTRE]);
    expect(baseSites([...levelled.slice(1), bldg(13, 13)], [])).toHaveLength(0);
    expect(clearedBlocks(levelled).size).toBe(1);
  });

  it('clears the rubble of a levelled block only', () => {
    const cleared = clearedBlocks([...levelled, bldg(30, 30, true), bldg(31, 32)]);
    expect(rubbleCleared(levelled[0], cleared)).toBe(true);
    expect(rubbleCleared(bldg(30, 30, true), cleared)).toBe(false);
  });

  it('never makes a site of a node block or a block already built on', () => {
    expect(baseSites([bldg(13, 13, true, 'core_node')], [])).toHaveLength(0);
    expect(baseSites(levelled, [hq('x', 'red', 15, 15)])).toHaveLength(0);
  });
});

describe('building a base', () => {
  it('costs cores and compute and goes up over time as a new HQ', () => {
    const v = view();
    const out = orderEffects(v, 'blue', { type: 'BUILD_BASE', at: CENTRE }, ctx);
    if ('reason' in out) throw new Error(out.reason);
    const econ = out.effects.economy!(v.economy)!;
    expect(econ.blue.cores).toBe(5000 - BASE_SITE.cores);
    expect(econ.blue.compute).toBe(1000 - BASE_SITE.compute);
    let structures = applyOrderToStructures([...v.structures], out.effects);
    const built = structures.find(s => s.gridPos.x === 15)!;
    expect(built).toMatchObject({ type: 'hq', team: 'blue', buildRemainingMs: BASE_SITE.buildMs });
    // Not a command post until it is finished.
    expect(commandPosts(structures, 'blue', { x: 4, z: 4 })).toHaveLength(1);
    for (let i = 0; i < 100_000 && (structures.find(s => s.id === built.id)!.buildRemainingMs || 0) > 0; i++) structures = applyProduction(structures, advanceProduction(structures, () => null));
    expect(commandPosts(structures, 'blue', { x: 4, z: 4 })).toEqual([{ x: 4, z: 4 }, CENTRE]);
  });

  it('refuses without a cleared block, a unit nearby, or the cores and compute', () => {
    const refused = (v: OrdersView, at = CENTRE) => { const o = orderEffects(v, 'blue', { type: 'BUILD_BASE', at }, ctx); return 'reason' in o ? o.reason : 'ok'; };
    expect(refused(view(), { x: 16, z: 15 })).toMatch(/cleared city block/);
    expect(refused(view({ buildings: [...levelled.slice(1), bldg(13, 13)] }))).toMatch(/cleared city block/);
    expect(refused(view({ units: [createUnit('trooper', 'blue', 'far', { x: 40, z: 40 })] }))).toMatch(/within/);
    expect(refused(view({ units: [createUnit('trooper', 'red', 'foe', { x: 15, z: 14 })] }))).toMatch(/within/);
    expect(refused(view({ economy: setCompute(createEconomy(5000), 'blue', 10) }))).toMatch(/compute/);
    expect(refused(view({ economy: setCompute(createEconomy(100), 'blue', 1000) }))).toMatch(/cores/);
  });
});

describe('a built base', () => {
  const posts = [{ x: 4, z: 4 }, CENTRE];
  it('extends the energy grid and repairs units in its block', () => {
    expect(isInsideEnergyGrid({ x: 17, z: 17 }, 'blue', [], posts, { x: 74, z: 74 })).toBe(true);
    expect(isInsideEnergyGrid({ x: 17, z: 17 }, 'blue', [], { x: 4, z: 4 }, { x: 74, z: 74 })).toBe(false);
    expect(inBaseBlock({ x: 14, z: 16 }, CENTRE)).toBe(true);
    const hurt = { ...createUnit('tank', 'blue', 't', { x: 14, z: 16 }), health: 100 };
    const heal = (bases: Parameters<typeof repairTick>[2]) => repairTick([hurt], 1000, bases, () => null).heal.size;
    expect(heal({ blue: posts, red: { x: 74, z: 74 } })).toBe(1);
    expect(heal({ blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } })).toBe(0);
  });

  it('keeps its side in the match after the starting HQ falls', () => {
    const structures = [hq('hq-blue', 'blue', 4, 4, { health: 0 }), hq('hq-blue-2', 'blue', 15, 15), hq('hq-red', 'red', 74, 74)];
    expect(checkVictory(structures)).toBeNull();
    expect(checkVictory(structures.map(s => s.team === 'blue' ? { ...s, health: 0 } : s))).toMatchObject({ winner: 'red' });
  });
});
