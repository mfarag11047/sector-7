import { describe, expect, it } from 'vitest';
import type { BuildingData, StructureData, UnitData } from '../types';
import { createEconomy, research, setCompute } from './economy';
import { applyOrderToStructures, applyOrderToUnits, OrderCommand, orderEffects, OrdersContext, OrdersView, popUsed } from './orders';
import { advanceProduction, applyProduction, createUnit } from './production';
import { POP_BASE, TIER_RESEARCH_COST, UNIT_RULES } from './units';

const structure = (id: string, patch: Partial<StructureData> = {}): StructureData => ({
  id, type: 'infantry', team: 'blue', gridPos: { x: 6, z: 6 }, isBlueprint: false, constructionProgress: 0,
  maxProgress: 0, health: 900, maxHealth: 900, ...patch,
});
const node = (id: string, type: BuildingData['type'], owner: BuildingData['owner'], x = 40, z = 40): BuildingData => ({
  id, gridX: x, gridZ: z, position: [0, 0, 0], scale: [1, 1, 1], color: '', type, height: 6, blockId: id,
  owner, captureProgress: 0, capturingTeam: null, health: 100, maxHealth: 100,
});

let ids = 0;
const ctx: OrdersContext = {
  gridSize: 79,
  bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } },
  isWalkable: () => true,
  findPath: (_from, to) => [`${to.x},${to.z}`],
  findAirPath: (_from, to) => [`${to.x},${to.z}`],
  canBuildOn: () => true,
  newId: prefix => `${prefix}-${++ids}`,
};
const view = (patch: Partial<OrdersView> = {}): OrdersView => ({
  units: [], structures: [structure('barracks')], buildings: [], economy: createEconomy(1000), ...patch,
});
const run = (v: OrdersView, command: OrderCommand, team: 'blue' | 'red' = 'blue') => {
  const outcome = orderEffects(v, team, command, ctx);
  if ('reason' in outcome) return { refused: outcome.reason };
  const fx = outcome.effects;
  return {
    structures: applyOrderToStructures([...v.structures], fx),
    units: applyOrderToUnits([...v.units], fx),
    economy: fx.economy ? fx.economy(v.economy) : v.economy,
  };
};

describe('training', () => {
  it('charges the price and queues the unit with its build time', () => {
    const r = run(view(), { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' });
    expect(r.economy!.blue.cores).toBe(1000 - 80);
    expect(r.structures![0].queue).toEqual([{ unitType: 'trooper', remainingMs: UNIT_RULES.trooper.buildTimeMs, totalMs: UNIT_RULES.trooper.buildTimeMs }]);
  });

  it("refuses the other team's structure and the wrong producer", () => {
    expect(run(view(), { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }, 'red').refused).toBeTruthy();
    expect(run(view(), { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'tank' }).refused).toMatch(/cannot train/);
  });

  it('needs Tier 2 researched for tier 2 units', () => {
    expect(run(view(), { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'lancer' }).refused).toMatch(/Tier 2/);
    const researched = view({ economy: research(setCompute(createEconomy(1000), 'blue', TIER_RESEARCH_COST[2]), 'blue', 2)! });
    expect(run(researched, { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'lancer' }).refused).toBeUndefined();
  });
});

describe('research', () => {
  const hq = structure('hq-blue', { type: 'hq' });
  it('spends compute at the HQ for the next tier', () => {
    const v = view({ structures: [hq], economy: setCompute(createEconomy(1000), 'blue', 500) });
    expect(run(v, { type: 'RESEARCH_TIER', tier: 3 }).refused).toMatch(/Tier 2 first/);
    const r = run(v, { type: 'RESEARCH_TIER', tier: 2 });
    expect(r.economy!.blue).toMatchObject({ tier: 2, compute: 500 - TIER_RESEARCH_COST[2] });
  });

  it('refuses without compute or without an HQ', () => {
    expect(run(view({ structures: [hq] }), { type: 'RESEARCH_TIER', tier: 2 }).refused).toMatch(/compute/);
    expect(run(view({ structures: [], economy: setCompute(createEconomy(1000), 'blue', 500) }), { type: 'RESEARCH_TIER', tier: 2 }).refused).toMatch(/HQ/);
  });

  it('refuses a structure still under construction', () => {
    const v = view({ structures: [structure('barracks', { buildRemainingMs: 5000, buildTotalMs: 15000 })] });
    expect(run(v, { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }).refused).toMatch(/not finished/);
  });

  it('counts queued units against the population cap', () => {
    const units = Array.from({ length: POP_BASE - 1 }, (_, i) => createUnit('trooper', 'blue', `t${i}`, { x: 1, z: 1 }));
    const v = view({ units, structures: [structure('barracks', { queue: [{ unitType: 'trooper', remainingMs: 1, totalMs: 1 }] })] });
    expect(popUsed(v.units, v.structures, 'blue')).toBe(POP_BASE);
    expect(run(v, { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }).refused).toMatch(/population/);
    const more = { ...v, buildings: [node('c', 'core_node', 'blue')] };
    expect(run(more, { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }).refused).toBeUndefined();
  });

  it('has no population cap in the sandbox', () => {
    const units = Array.from({ length: POP_BASE * 3 }, (_, i) => createUnit('trooper', 'blue', `t${i}`, { x: 1, z: 1 }));
    const v = view({ units });
    expect(run(v, { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }).refused).toMatch(/population/);
    expect(run({ ...v, unlimitedPop: true }, { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }).refused).toBeUndefined();
  });

  it('refuses when broke', () => {
    expect(run(view({ economy: createEconomy(10) }), { type: 'TRAIN_UNIT', structureId: 'barracks', unitType: 'trooper' }).refused).toMatch(/cores/);
  });
});

describe('production over time', () => {
  it('builds a placed structure, then trains its queue in order', () => {
    let structures = [structure('b', { buildRemainingMs: 200, buildTotalMs: 200, queue: [{ unitType: 'trooper', remainingMs: 150, totalMs: 150 }] })];
    const tick = () => {
      const r = advanceProduction(structures, () => null);
      structures = applyProduction(structures, r);
      return r;
    };
    expect(tick().completed).toHaveLength(0);
    expect(tick().completed).toHaveLength(1);
    expect(tick().trained).toHaveLength(0);
    const r = tick();
    expect(r.trained.map(t => t.unitType)).toEqual(['trooper']);
    expect(structures[0].queue).toEqual([]);
  });
});

describe('placing structures', () => {
  it('starts a base structure building, inside the grid', () => {
    const r = run(view({ structures: [] }), { type: 'PLACE_STRUCTURE', structureType: 'armor', at: { x: 8, z: 8 } });
    expect(r.economy!.blue.cores).toBe(1000 - 550);
    expect(r.structures![0]).toMatchObject({ type: 'armor', team: 'blue', isBlueprint: false, buildRemainingMs: 25000 });
  });

  it('refuses outside the energy grid, and allows it next to a captured building', () => {
    const far = { type: 'PLACE_STRUCTURE' as const, structureType: 'infantry' as const, at: { x: 40, z: 41 } };
    expect(run(view(), far).refused).toMatch(/energy grid/);
    expect(run(view({ buildings: [node('b', 'residential', 'blue')] }), far).refused).toBeUndefined();
  });

  it('needs a finished Depot for walls and turrets, which start as blueprints', () => {
    const wall = { type: 'PLACE_STRUCTURE' as const, structureType: 'wall_tier1' as const, at: { x: 8, z: 8 } };
    expect(run(view(), wall).refused).toMatch(/Depot/);
    const r = run(view({ structures: [structure('d', { type: 'builder' })] }), wall);
    expect(r.structures![1]).toMatchObject({ type: 'wall_tier1', isBlueprint: true });
  });

  it('refuses the HQ and Munitions', () => {
    expect(run(view(), { type: 'PLACE_STRUCTURE', structureType: 'hq', at: { x: 8, z: 8 } }).refused).toBeTruthy();
    expect(run(view(), { type: 'PLACE_STRUCTURE', structureType: 'ordnance', at: { x: 8, z: 8 } }).refused).toBeTruthy();
  });
});

describe('moving', () => {
  it('spreads a group over separate tiles and marks attack-move', () => {
    const units = [createUnit('trooper', 'blue', 'a', { x: 1, z: 1 }), createUnit('trooper', 'blue', 'b', { x: 1, z: 2 })];
    const r = run(view({ units }), { type: 'MOVE', unitIds: ['a', 'b'], target: { x: 10, z: 10 }, attackMove: true });
    const ends = r.units!.map(u => u.path[u.path.length - 1]);
    expect(new Set(ends).size).toBe(2);
    expect(r.units!.every(u => u.attackMove)).toBe(true);
  });

  it("refuses the other team's units", () => {
    const units = [createUnit('trooper', 'red', 'a', { x: 1, z: 1 })];
    expect(run(view({ units }), { type: 'MOVE', unitIds: ['a'], target: { x: 10, z: 10 } }).refused).toBeTruthy();
  });
});

describe('building under an EMP blackout', () => {
  it('is refused where your grid is down', () => {
    const at = { x: 8, z: 8 };
    const place = { type: 'PLACE_STRUCTURE' as const, structureType: 'armor' as const, at };
    expect(run(view({ structures: [] }), place).refused).toBeUndefined();
    const blackouts = [{ gridPos: at, radius: 2, team: 'red' as const }];
    expect(run(view({ structures: [], blackouts }), place).refused).toMatch(/EMP/);
  });
});
