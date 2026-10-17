import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { applyCiwsState, CIWS, ciwsMagazine, ciwsTick } from './ciws';
import { createUnit } from './production';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
const aegis = (patch: Partial<UnitData> = {}) => ({ ...at(createUnit('aegis', 'blue', 'a', { x: 0, z: 0 }), 0), ...patch });
const red = (type: UnitData['type'], id: string, x: number) => at(createUnit(type, 'red', id, { x: 0, z: 0 }), x);

describe('Aegis CIWS', () => {
  it('fires on its own at enemy aircraft within range, not ground units or anything farther', () => {
    const r = ciwsTick([aegis(), red('hornet', 'h', CIWS.range - 1), red('tank', 't', 2), red('wasp', 'far', CIWS.range + 1)], [], 1000, 100);
    expect(r.links).toEqual([{ gunId: 'a', targetId: 'h', ordnance: false, fromStructure: false }]);
    expect(r.unitDamage.get('h')).toBeCloseTo(CIWS.airDps * 0.1);
  });

  it("goes for incoming ordnance before aircraft, and ignores its own side's", () => {
    const missile = { id: 'm', team: 'red' as const, at: { x: 8, z: 0 }, kind: 'missile' as const };
    const ours = { id: 'mine', team: 'blue' as const, at: { x: 2, z: 0 }, kind: 'missile' as const };
    const r = ciwsTick([aegis(), red('hornet', 'h', 3)], [ours, missile], 1000, 100);
    expect(r.links[0]).toMatchObject({ targetId: 'm', ordnance: true });
    expect(r.ordnanceDamage.get('m')).toBeCloseTo(CIWS.ordnanceDps * 0.1);
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

describe('CIWS turret', () => {
  const turret = (patch: Partial<StructureData> = {}): StructureData => ({
    id: 'tur', type: 'aa_turret', team: 'blue', gridPos: { x: 0, z: 0 }, isBlueprint: false, constructionProgress: 300,
    maxProgress: 300, health: 800, maxHealth: 800, ...patch,
  });

  it('shoots aircraft and missiles like the Aegis, with no Aegis needed', () => {
    const missile = { id: 'm', team: 'red' as const, at: { x: 7, z: 0 }, kind: 'missile' as const };
    const r = ciwsTick([red('hornet', 'h', 4)], [missile], 1000, 100, [turret()]);
    expect(r.links[0]).toMatchObject({ gunId: 'tur', targetId: 'm', fromStructure: true });
    expect(ciwsTick([red('hornet', 'h', 4)], [], 1000, 100, [turret()]).unitDamage.get('h')).toBeCloseTo(CIWS.airDps * 0.1);
  });

  it('falls back on ground units nearby at a fraction of the damage, only with the sky clear', () => {
    const r = ciwsTick([red('tank', 't', 4), red('trooper', 'tr', 3)], [], 1000, 100, [turret()]);
    expect(r.links[0]).toMatchObject({ targetId: 'tr', fromStructure: true });
    expect(r.unitDamage.get('tr')!).toBeLessThan(CIWS.airDps * 0.1 * 0.3);
    expect(ciwsTick([red('tank', 't', CIWS.groundRange + 1)], [], 1000, 100, [turret()]).links).toHaveLength(0);
    expect(ciwsTick([red('tank', 't', 3), red('wasp', 'w', 8)], [], 1000, 100, [turret()]).links[0].targetId).toBe('w');
    // The Aegis never shoots ground units.
    expect(ciwsTick([aegis(), red('tank', 't', 3)], [], 1000, 100).links).toHaveLength(0);
  });

  it('does nothing until finished', () => {
    expect(ciwsTick([red('hornet', 'h', 4)], [], 1000, 100, [turret({ isBlueprint: true })]).links).toHaveLength(0);
    expect(ciwsTick([red('hornet', 'h', 4)], [], 1000, 100, [turret({ buildRemainingMs: 500 })]).links).toHaveLength(0);
  });
});
