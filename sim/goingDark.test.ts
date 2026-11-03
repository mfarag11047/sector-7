import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { AMBUSH_DARK, CLOAK_FIELD, fieldCloakedIds } from './cloak';
import { resolveAttacks } from './combat';

const unit = (id: string, team: UnitData['team'], extra: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team, gridPos: { x: 10, z: 10 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...extra,
} as UnitData);
const shadow = (t: UnitData['team']) => (t === 'blue' ? 'shadow_ops' as const : null);

describe('Going Dark (Shadow Ops)', () => {
  it('hides its infantry and light vehicles holding still and out of combat', () => {
    const now = 100_000;
    const units = [
      unit('still', 'blue'),
      unit('moving', 'blue', { path: ['11,10'] }),
      unit('fought', 'blue', { lastAttackTime: now - 1000 }),
      unit('tank', 'blue', { type: 'tank', unitClass: 'armor' }),
      unit('car', 'blue', { type: 'razorback', unitClass: 'armor' }),
      unit('other', 'red'),
    ];
    const hidden = fieldCloakedIds(units, now, shadow);
    expect([...hidden].sort()).toEqual(['car', 'still']);
    // Long enough after the fight, it slips back under.
    expect(fieldCloakedIds([unit('fought', 'blue', { lastAttackTime: now - CLOAK_FIELD.revealMs - 1 })], now, shadow).has('fought')).toBe(true);
  });

  it('strikes from the dark as an ambush', () => {
    const target = unit('t', 'red', { gridPos: { x: 11, z: 10 }, type: 'razorback', unitClass: 'armor', health: 500, maxHealth: 500 });
    const plain = resolveAttacks([unit('a', 'blue'), target], [], 10_000, () => false).unitDamage.get('t')!;
    const dark = resolveAttacks([unit('a', 'blue', { fieldCloaked: true }), target], [], 10_000, () => false).unitDamage.get('t')!;
    expect(dark).toBeCloseTo(plain * AMBUSH_DARK);
  });
});
