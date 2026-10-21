import { describe, expect, it } from 'vitest';
import type { StructureData } from '../types';
import { STRUCTURE_INFO, UNIT_STATS } from '../constants';
import { createEconomy, Economy, incomeFor } from './economy';
import { applyOrderToStructures, isOperational, orderEffects, OrdersContext } from './orders';
import { advanceDismantling, DISMANTLE } from './dismantle';
import { REFINERY } from './refinery';
import { createHeadlessMatch, stepMatch } from './headless';

const structure = (id: string, type: StructureData['type'], patch: Partial<StructureData> = {}): StructureData => ({
  id, type, team: 'blue', gridPos: { x: 5, z: 1 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100,
  health: STRUCTURE_INFO[type].maxHealth, maxHealth: STRUCTURE_INFO[type].maxHealth, ...patch,
});
const ctx = {} as OrdersContext;
const econ = (): Economy => createEconomy(1000);
const order = (structures: StructureData[], id: string, economy = econ()) =>
  orderEffects({ units: [], structures, buildings: [], economy }, 'blue', { type: 'DISASSEMBLE_STRUCTURE', structureId: id }, ctx);
const apply = (structures: StructureData[], id: string, economy = econ()) => {
  const r = order(structures, id, economy);
  if (!('effects' in r)) throw new Error(r.reason);
  return { structures: applyOrderToStructures(structures, r.effects), economy: r.effects.economy ? r.effects.economy(economy)! : economy };
};

describe('disassembling base buildings', () => {
  it('takes a finished building down over time, idle meanwhile, then pays half back', () => {
    const start = apply([structure('b', 'infantry')], 'b');
    expect(start.economy.blue.cores).toBe(1000);
    expect(start.structures[0].dismantle).toEqual({ remainingMs: DISMANTLE.ms, totalMs: DISMANTLE.ms, refund: STRUCTURE_INFO.infantry.cost / 2 });
    expect(isOperational(start.structures[0])).toBe(false);
    const half = advanceDismantling(start.structures, DISMANTLE.ms - 1);
    expect(half.done).toEqual([]);
    const gone = advanceDismantling(half.structures, 1);
    expect(gone.structures).toEqual([]);
    expect(gone.done).toEqual([{ team: 'blue', type: 'infantry', refund: STRUCTURE_INFO.infantry.cost / 2 }]);
  });

  it('cancels and refunds in full what it was doing: queued units, research, a refinery upgrade', () => {
    const barracks = structure('b', 'infantry', { queue: [{ unitType: 'trooper', remainingMs: 5000, totalMs: 12000 }, { unitType: 'ghost', remainingMs: 18000, totalMs: 18000 }] });
    const r = apply([barracks], 'b');
    expect(r.economy.blue.cores).toBe(1000 + UNIT_STATS.trooper.cost + UNIT_STATS.ghost.cost);
    expect(r.structures[0].queue).toEqual([]);
    const lab = apply([structure('l', 'research_lab', { research: { upgrade: 'nanoweave', remainingMs: 10, totalMs: 30_000 } })], 'l');
    expect(lab.economy.blue).toMatchObject({ cores: 1000 + 250, compute: 50 });
    expect(lab.structures[0].research).toBeUndefined();
    const ref = apply([structure('r', 'refinery', { refineryUpgrade: { remainingMs: 10, totalMs: 25_000 } })], 'r');
    expect(ref.economy.blue.cores).toBe(1000 + REFINERY.upgrade.cost);
  });

  it('counts a refinery\'s level 2 upgrade in its refund, and its income stops while it comes down', () => {
    const r = apply([structure('r', 'refinery', { refineryLevel: 2 })], 'r');
    expect(r.structures[0].dismantle!.refund).toBe((STRUCTURE_INFO.refinery.cost + REFINERY.upgrade.cost) / 2);
    expect(incomeFor([], 'blue', r.structures)).toBe(incomeFor([], 'blue', []));
  });

  it('cancels one still going up at once, all its cost back', () => {
    const r = apply([structure('f', 'armor', { buildRemainingMs: 10_000, buildTotalMs: 25_000 })], 'f');
    expect(r.structures).toEqual([]);
    expect(r.economy.blue.cores).toBe(1000 + STRUCTURE_INFO.armor.cost);
    const turret = apply([structure('t', 'defense', { isBlueprint: true, constructionProgress: 0, maxProgress: 200 })], 't');
    expect(turret.structures).toEqual([]);
    expect(turret.economy.blue.cores).toBe(1000 + STRUCTURE_INFO.defense.cost);
  });

  it('stops when told again, and works only on your own pad buildings and turrets', () => {
    const r = apply([structure('b', 'infantry')], 'b');
    expect(apply(r.structures, 'b').structures[0].dismantle).toBeUndefined();
    expect(order([structure('h', 'hq')], 'h')).toMatchObject({ ok: false, reason: expect.stringMatching(/can't be disassembled/) });
    expect(order([structure('w', 'wall_tier1')], 'w')).toMatchObject({ ok: false });
    expect(order([structure('e', 'infantry', { team: 'red' })], 'e')).toMatchObject({ reason: 'not your building' });
  });

  it('pays nothing if it is destroyed before it is down, and frees the pad when it is', () => {
    const r = apply([structure('b', 'infantry')], 'b');
    const destroyed = advanceDismantling([{ ...r.structures[0], health: 0 }], DISMANTLE.ms);
    expect(destroyed.done).toEqual([]);
    // In a match: gone, refunded, and the pad free again.
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    m.structures.push({ ...structure('mine', 'air', { gridPos: { x: 5, z: 1 } }), dismantle: { remainingMs: 100, totalMs: DISMANTLE.ms, refund: 300 } });
    const before = m.economy.blue.cores;
    stepMatch(m);
    expect(m.structures.some(s => s.id === 'mine')).toBe(false);
    expect(m.economy.blue.cores).toBeGreaterThanOrEqual(before + 300);
  });
});
