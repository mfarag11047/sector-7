import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { resolveAttacks } from './combat';
import { fieldCloakedIds, isHidden, applyFieldCloak } from './cloak';
import { createUnit } from './production';
import { CHARGE, kageCharges } from './shadowHero';
import { addBuff, spendOvercharge, unitAbilityEffects } from './unitAbilities';
import { canHit, UNIT_RULES } from './units';

const kage = (patch: Partial<UnitData> = {}): UnitData => ({ ...createUnit('hero_shadow_ops', 'blue', 'k', { x: 10, z: 10 }), ...patch });
const foe = (type: UnitData['type'], at: { x: number; z: number }, id = 'e') => createUnit(type, 'red', id, at);

describe('Kage, the Shadow Ops hero', () => {
  it('fights with a melee blade that cannot reach aircraft', () => {
    const w = UNIT_RULES.hero_shadow_ops.weapon!;
    expect(w.type).toBe('blade');
    expect(w.range).toBeLessThanOrEqual(1.5);
    expect(w.hitsAir).toBe(false);
    expect(canHit(w, true)).toBe(false);
  });

  it('cuts a ground unit beside him, but not one out of reach or in the air', () => {
    const near = resolveAttacks([kage(), foe('trooper', { x: 11, z: 10 })], [], 10_000, () => false);
    expect(near.unitDamage.get('e')).toBeGreaterThan(0);
    const far = resolveAttacks([kage(), foe('trooper', { x: 13, z: 10 })], [], 10_000, () => false);
    expect(far.unitDamage.get('e') ?? 0).toBe(0);
    const air = resolveAttacks([kage(), foe('hornet', { x: 11, z: 10 })], [], 10_000, () => false);
    expect(air.unitDamage.get('e') ?? 0).toBe(0);
  });

  it('cloaks himself with Optical Camo from Tier 1', () => {
    const out = unitAbilityEffects([kage()], 'blue', { tier: 1, upgrades: [] }, { unitIds: ['k'], ability: 'shadow_cloak' }, 1000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const cloaked = out.updates.get('k')!(kage());
    expect(cloaked.buffs?.some(b => b.kind === 'shadow_cloak')).toBe(true);
    const units = applyFieldCloak([cloaked], fieldCloakedIds([cloaked], 1000));
    expect(isHidden(units[0])).toBe(true);
    // Enemies can't target him.
    const shot = resolveAttacks([{ ...units[0] }, foe('trooper', { x: 12, z: 10 })], [], 10_000, () => false);
    expect(shot.unitDamage.get('k') ?? 0).toBe(0);
  });

  it('strikes from cloak for double damage, and the strike drops it', () => {
    const plain = resolveAttacks([kage(), foe('trooper', { x: 11, z: 10 })], [], 10_000, () => false).unitDamage.get('e')!;
    const hidden = addBuff(kage(), 'shadow_cloak', 20_000);
    const ambush = resolveAttacks([hidden, foe('trooper', { x: 11, z: 10 })], [], 10_000, () => false).unitDamage.get('e')!;
    expect(ambush).toBeCloseTo(plain * 2);
    expect(spendOvercharge(hidden).buffs?.some(b => b.kind === 'shadow_cloak')).toBe(false);
  });

  it('charges a ground enemy he sees when idle, but not cloaked, busy, or at aircraft', () => {
    const t = foe('trooper', { x: 13, z: 10 });
    expect(kageCharges([kage(), t])).toEqual([{ unitId: 'k', team: 'blue', target: { x: 13, z: 10 } }]);
    expect(kageCharges([kage(), foe('trooper', { x: 10 + CHARGE.range + 1, z: 10 })])).toEqual([]);
    expect(kageCharges([addBuff(kage(), 'shadow_cloak', 9e9), t])).toEqual([]);
    expect(kageCharges([kage({ path: ['11,10'] }), t])).toEqual([]);
    expect(kageCharges([kage(), foe('hornet', { x: 12, z: 10 })])).toEqual([]);
  });
});
