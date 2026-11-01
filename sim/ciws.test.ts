import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { applyCiwsState, CIWS, ciwsMagazine, ciwsTick } from './ciws';
import { createUnit } from './production';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
// A gun already wound up and on a target at `now` (most tests look at a single tick of fire).
const SPUN = { ciwsSpinStart: 1000 - CIWS.spinUpMs, ciwsAimAt: 900 };
const aegis = (patch: Partial<UnitData> = {}) => ({ ...at(createUnit('aegis', 'blue', 'a', { x: 0, z: 0 }), 0), ...SPUN, ...patch });
// Steps the guns tick by tick from `from` up to (not including) `to`; returns the units, the
// structures and each tick's result.
function run(units: UnitData[], structures: StructureData[], from: number, to: number, ordnance: Parameters<typeof ciwsTick>[1] = []) {
  const ticks: { now: number; r: ReturnType<typeof ciwsTick> }[] = [];
  for (let now = from; now < to; now += 100) {
    const r = ciwsTick(units, ordnance, now, 100, structures);
    units = applyCiwsState(units, r.updates);
    structures = applyCiwsState(structures, r.structureUpdates);
    ticks.push({ now, r });
  }
  return { units, structures, ticks };
}
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

  it('fires a sustained burst, then has to stop and reload, and wind up again after', () => {
    const start = CIWS.spinUpMs;
    let { units } = run([aegis({ ciwsSpinStart: 0, ciwsAimAt: start - 100 }), red('hornet', 'h', 5)], [], start, start + CIWS.burstMs);
    const end = start + CIWS.burstMs;
    const a = units.find(u => u.id === 'a')!;
    expect(a.ciwsReloadUntil).toBeGreaterThan(end);
    expect(ciwsMagazine(a, end)).toBe(0);
    expect(ciwsTick(units, [], end, 100).links).toHaveLength(0);
    // Reloaded: it has to wind the barrels up again before the next burst.
    const after = run(units, [], end + CIWS.reloadMs, end + CIWS.reloadMs + CIWS.spinUpMs + 100);
    expect(after.ticks[0].r.links).toHaveLength(0);
    expect(after.ticks[0].r.spinning).toHaveLength(1);
    expect(after.ticks.at(-1)!.r.links).toHaveLength(1);
  });

  it('tops a part-used magazine up after a lull, and is silenced by an EMP', () => {
    const used = aegis({ ciwsUsedMs: 3000, ciwsLastFiredAt: 0 });
    const r = ciwsTick([used], [], CIWS.topUpMs, 100);
    expect(r.updates.get('a')?.ciwsUsedMs).toBe(0);
    expect(ciwsTick([aegis({ buffs: [{ kind: 'emp', until: 1e12 }] }), red('hornet', 'h', 3)], [], 1000, 100).links).toHaveLength(0);
  });
});

describe('CIWS spin-up', () => {
  it('winds up for CIWS.spinUpMs on a new target, tracking it but doing no damage, then opens fire', () => {
    const { ticks } = run([aegis({ ciwsSpinStart: null, ciwsAimAt: null }), red('hornet', 'h', 5)], [], 1000, 1000 + CIWS.spinUpMs + 500);
    const winding = ticks.filter(t => t.now < 1000 + CIWS.spinUpMs);
    for (const { r } of winding) {
      expect(r.links).toHaveLength(0);
      expect(r.unitDamage.size).toBe(0);
      expect(r.spinning).toEqual([{ gunId: 'a', targetId: 'h', ordnance: false, fromStructure: false }]);
      // Tracking the target already, so the gun turns onto it and is heard winding up.
      expect(r.updates.get('a')?.ciwsTargetId).toBe('h');
    }
    const firing = ticks.filter(t => t.now >= 1000 + CIWS.spinUpMs);
    expect(firing.length).toBeGreaterThan(0);
    for (const { r } of firing) {
      expect(r.links).toHaveLength(1);
      expect(r.spinning).toHaveLength(0);
      expect(r.unitDamage.get('h')).toBeCloseTo(CIWS.airDps * 0.1);
    }
  });

  it("doesn't use up the magazine or count as firing while it winds up", () => {
    const { units } = run([aegis({ ciwsSpinStart: null, ciwsAimAt: null }), red('hornet', 'h', 5)], [], 1000, 1000 + CIWS.spinUpMs);
    const a = units.find(u => u.id === 'a')!;
    expect(a.ciwsUsedMs ?? 0).toBe(0);
    expect(a.ciwsLastFiredAt ?? 0).toBe(0);
  });

  it('stays spun up switching between targets, but winds up again after a lull', () => {
    // Its target gone, a new one turns up a tick later: it fires on at once.
    const spun = aegis();
    const gap = run([{ ...spun, ciwsTargetId: 'gone' }, red('hornet', 'h2', 4)], [], 1000 + CIWS.spinGraceMs - 100, 1000 + CIWS.spinGraceMs);
    expect(gap.ticks[0].r.links).toHaveLength(1);
    // Nothing to shoot for longer than the grace: the barrels have run down.
    const lull = ciwsTick([spun, red('hornet', 'h2', 4)], [], 900 + CIWS.spinGraceMs + 100, 100);
    expect(lull.links).toHaveLength(0);
    expect(lull.spinning).toHaveLength(1);
  });

  it('winds down when knocked out by an EMP', () => {
    const r = ciwsTick([aegis({ buffs: [{ kind: 'emp', until: 1e12 }], ciwsTargetId: 'h' }), red('hornet', 'h', 3)], [], 1000, 100);
    expect(r.updates.get('a')).toMatchObject({ ciwsTargetId: null, ciwsSpinStart: null });
  });
});

describe('CIWS turret', () => {
  const turret = (patch: Partial<StructureData> = {}): StructureData => ({
    id: 'tur', type: 'aa_turret', team: 'blue', gridPos: { x: 0, z: 0 }, isBlueprint: false, constructionProgress: 300,
    maxProgress: 300, health: 800, maxHealth: 800, ...SPUN, ...patch,
  });

  it('winds up like the Aegis before it opens fire', () => {
    const { ticks } = run([red('hornet', 'h', 4)], [turret({ ciwsSpinStart: null, ciwsAimAt: null })], 1000, 1000 + CIWS.spinUpMs + 100);
    expect(ticks[0].r.links).toHaveLength(0);
    expect(ticks[0].r.spinning).toEqual([{ gunId: 'tur', targetId: 'h', ordnance: false, fromStructure: true }]);
    expect(ticks[0].r.structureUpdates.get('tur')?.ciwsTargetId).toBe('h');
    expect(ticks.at(-1)!.r.links).toEqual([{ gunId: 'tur', targetId: 'h', ordnance: false, fromStructure: true }]);
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
