import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { applyCiwsState, CIWS, ciwsMagazine, ciwsTick } from './ciws';
import { createUnit } from './production';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
const aegis = (patch: Partial<UnitData> = {}) => ({ ...at(createUnit('aegis', 'blue', 'a', { x: 0, z: 0 }), 0), ...patch });
const red = (type: UnitData['type'], id: string, x: number) => at(createUnit(type, 'red', id, { x: 0, z: 0 }), x);

describe('Aegis CIWS', () => {
  it('fires on its own at enemy aircraft within range, not ground units or anything farther', () => {
    const r = ciwsTick([aegis(), red('hornet', 'h', CIWS.range - 1), red('tank', 't', 2), red('wasp', 'far', CIWS.range + 1)], [], 1000, 100);
    expect(r.links).toEqual([{ aegisId: 'a', targetId: 'h', ordnance: false }]);
    expect(r.unitDamage.get('h')).toBeCloseTo(CIWS.dps * 0.1);
  });

  it("goes for incoming ordnance before aircraft, and ignores its own side's", () => {
    const missile = { id: 'm', team: 'red' as const, at: { x: 8, z: 0 }, kind: 'missile' as const };
    const ours = { id: 'mine', team: 'blue' as const, at: { x: 2, z: 0 }, kind: 'missile' as const };
    const r = ciwsTick([aegis(), red('hornet', 'h', 3)], [ours, missile], 1000, 100);
    expect(r.links[0]).toMatchObject({ targetId: 'm', ordnance: true });
    expect(r.ordnanceDamage.get('m')).toBeCloseTo(CIWS.dps * 0.1);
  });

  it('fires a sustained burst, then has to stop and reload', () => {
    let units = [aegis(), red('hornet', 'h', 5)];
    let now = 0;
    for (; now < CIWS.burstMs; now += 100) units = applyCiwsState(units, ciwsTick(units, [], now, 100).updates);
    const a = units.find(u => u.id === 'a')!;
    expect(a.ciwsReloadUntil).toBeGreaterThan(now);
    expect(ciwsMagazine(a, now)).toBe(0);
    expect(ciwsTick(units, [], now + 100, 100).links).toHaveLength(0);
    expect(ciwsTick(units, [], now + CIWS.reloadMs, 100).links).toHaveLength(1);
  });

  it('tops a part-used magazine up after a lull, and is silenced by an EMP', () => {
    const used = aegis({ ciwsUsedMs: 3000, ciwsLastFiredAt: 0 });
    const r = ciwsTick([used], [], CIWS.topUpMs, 100);
    expect(r.updates.get('a')?.ciwsUsedMs).toBe(0);
    expect(ciwsTick([aegis({ buffs: [{ kind: 'emp', until: 1e12 }] }), red('hornet', 'h', 3)], [], 1000, 100).links).toHaveLength(0);
  });
});
