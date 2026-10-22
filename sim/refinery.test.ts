import { describe, expect, it } from 'vitest';
import type { BuildingData, StructureData } from '../types';
import { STRUCTURE_INFO } from '../constants';
import { createEconomy, Economy, HQ_INCOME, incomeBreakdown, incomeFor, payIncome } from './economy';
import { applyOrderToStructures, orderEffects, OrdersContext } from './orders';
import { advanceRefineryUpgrades, blocksBetween, proximityMultiplier, REFINERY, refineryIncome } from './refinery';

const structure = (id: string, type: StructureData['type'], patch: Partial<StructureData> = {}): StructureData => ({
  id, type, team: 'blue', gridPos: { x: 4, z: 4 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100,
  health: STRUCTURE_INFO[type].maxHealth, maxHealth: STRUCTURE_INFO[type].maxHealth, ...patch,
});
const node = (id: string, owner: BuildingData['owner'], gridX = 15, gridZ = 15) => ({ id, type: 'core_node', owner, destroyed: false, gridX, gridZ } as BuildingData);
const hq = structure('hq', 'hq');
const refinery = (id: string, patch: Partial<StructureData> = {}) => structure(id, 'refinery', { gridPos: { x: 5, z: 1 }, ...patch });
const NODE = 5;

describe('Core Refinery income', () => {
  // The starting HQ at (4,4) is 2 city blocks from a core node at (15,15).
  const M = proximityMultiplier(2);
  it('pays a flat income even with no nodes, and a share of node income on top', () => {
    expect(incomeFor([], 'blue', [hq, refinery('r')])).toBe(HQ_INCOME + REFINERY.flat[1]);
    const nodes = [node('a', 'blue', 15, 15), node('b', 'blue', 63, 63), node('c', 'red', 75, 3)];
    const b = incomeBreakdown(nodes, 'blue', [hq, refinery('r')]);
    expect(b.nodes).toBe(2 * NODE);
    expect(b.refineries).toMatchObject({ count: 1, flat: REFINERY.flat[1], each: [{ id: 'r', multiplier: M, blocks: 2 }] });
    expect(b.refineries.multiplier).toBeCloseTo(M);
    expect(b.total).toBeCloseTo(HQ_INCOME + 2 * NODE * (1 + M) + REFINERY.flat[1]);
  });

  it('stacks the multiplier additively, up to its cap; only finished, standing refineries count', () => {
    const near = [{ x: 8, z: 8 }];
    const many = Array.from({ length: 6 }, (_, i) => refinery(`r${i}`));
    expect(refineryIncome([hq, ...many.slice(0, 2)], 'blue', 10, near).multiplier).toBeCloseTo(2 * REFINERY.proximity.best);
    expect(refineryIncome([hq, ...many], 'blue', 10, near).multiplier).toBe(REFINERY.maxMultiplier);
    expect(refineryIncome([hq, ...many], 'blue', 10, near).flat).toBe(6 * REFINERY.flat[1]);
    const idle = [refinery('a', { buildRemainingMs: 5000 }), refinery('b', { health: 0 }), refinery('c', { team: 'red' })];
    expect(refineryIncome([hq, ...idle], 'blue', 10, near).count).toBe(0);
  });

  it('level 2 raises only that refinery\'s flat income, not the multiplier', () => {
    const one = refineryIncome([hq, refinery('r', { refineryLevel: 2 })], 'blue', 20, [{ x: 15, z: 15 }]);
    expect(one.flat).toBe(REFINERY.flat[2]);
    expect(one.multiplier).toBeCloseTo(M);
  });

  it('is paid each economy tick, with the difficulty bonus applied to the total', () => {
    const e = payIncome(createEconomy(0), [node('a', 'blue', 15, 15)], { blue: 2 }, [hq, refinery('r')]);
    expect(e.blue.cores).toBeCloseTo(2 * (HQ_INCOME + NODE * (1 + M) + REFINERY.flat[1]));
  });
});

describe('Core Refinery: nearer a core node, a bigger share', () => {
  it('is best on the city block next to a node and falls off block by block to a minimum', () => {
    expect([1, 2, 3, 4, 10].map(proximityMultiplier).map(x => Math.round(x * 100))).toEqual([15, 11, 7, 4, 4]);
    expect(proximityMultiplier(0)).toBe(REFINERY.proximity.best);
    // Blocks are the lots between roads, 6 tiles apart; a diagonal neighbour is next door too.
    expect(blocksBetween({ x: 9, z: 9 }, { x: 15, z: 15 })).toBe(1);
    expect(blocksBetween({ x: 9, z: 9 }, { x: 33, z: 9 })).toBe(4);
  });

  it('counts from the base its refinery stands at: an expansion beside a node pays more than home', () => {
    const nodes = [{ x: 15, z: 15 }, { x: 51, z: 46 }];
    // A Command HQ built later stands at a block centre; its pads ring it.
    const outpost = structure('hq2', 'hq', { gridPos: { x: 45, z: 45 } });
    const there = refinery('r2', { gridPos: { x: 44, z: 43 } });
    const r = refineryIncome([hq, outpost, refinery('r1'), there], 'blue', 10, nodes);
    expect(r.each).toEqual([
      { id: 'r1', multiplier: proximityMultiplier(2), blocks: 2 },
      { id: 'r2', multiplier: REFINERY.proximity.best, blocks: 1 },
    ]);
    // No core nodes on the map: the minimum.
    expect(refineryIncome([hq, refinery('r1')], 'blue', 10, []).each[0].multiplier).toBe(REFINERY.proximity.min);
  });
});

describe('Core Refinery orders', () => {
  const ctx: OrdersContext = { newId: (p: string) => `${p}-1`, canBuildOn: () => true, gridSize: 80, bases: { blue: { x: 4, z: 4 }, red: { x: 75, z: 75 } } } as unknown as OrdersContext;
  const econ = (tier: 1 | 2 | 3 = 1, cores = 5000): Economy => { const e = createEconomy(cores); e.blue = { ...e.blue, tier }; return e; };
  const order = (structures: StructureData[], command: Parameters<typeof orderEffects>[2], economy = econ()) =>
    orderEffects({ units: [], structures, buildings: [], economy }, 'blue', command, ctx);

  it('allows two per Command HQ', () => {
    const place = (structures: StructureData[]) => order(structures, { type: 'PLACE_STRUCTURE', structureType: 'refinery', at: { x: 5, z: 1 } });
    expect('effects' in place([hq])).toBe(true);
    expect(place([hq, refinery('a', { gridPos: { x: 3, z: 1 } }), refinery('b', { gridPos: { x: 1, z: 3 } })]))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/2 Core Refineries per Command HQ/) });
  });

  it('upgrades to level 2 at Tier 2, for cores and time, once', () => {
    const up = (r: StructureData, tier: 1 | 2 = 2) => order([hq, r], { type: 'UPGRADE_REFINERY', structureId: r.id }, econ(tier));
    expect(up(refinery('r'), 1)).toMatchObject({ reason: 'needs Tier 2' });
    expect(up(refinery('r', { buildRemainingMs: 100 }))).toMatchObject({ reason: expect.stringMatching(/not finished/) });
    expect(up(refinery('r', { refineryLevel: 2 }))).toMatchObject({ reason: 'already level 2' });
    const r = up(refinery('r'));
    expect('effects' in r).toBe(true);
    if (!('effects' in r)) return;
    expect(r.effects.economy!(econ(2))!.blue.cores).toBe(5000 - REFINERY.upgrade.cost);
    let structures = applyOrderToStructures([hq, refinery('r')], r.effects);
    expect(structures[1].refineryUpgrade).toEqual({ remainingMs: REFINERY.upgrade.ms, totalMs: REFINERY.upgrade.ms });
    expect(order(structures, { type: 'UPGRADE_REFINERY', structureId: 'r' }, econ(2))).toMatchObject({ reason: 'already upgrading' });
    for (let t = 0; t < REFINERY.upgrade.ms; t += 1000) structures = advanceRefineryUpgrades(structures, () => 1000).structures;
    expect(structures[1]).toMatchObject({ refineryLevel: 2, refineryUpgrade: undefined });
  });
});
