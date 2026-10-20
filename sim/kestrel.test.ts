import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { fireFlechettes, FLECHETTE, regenerateShield, SHIELD, shieldedHit, shieldMax } from './kestrel';
import { createUnit } from './production';

const NOW = 100_000;
const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x: number, z = 0, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, team, id, { x, z }), ...patch });
const kestrel = (patch: Partial<UnitData> = {}) => unit('k', 'attack_drone', 'blue', 0, 0, { combatTargetId: 't', ...patch });

describe('Kestrel Flechette Burst', () => {
  it('fires alongside its gun on a cooldown, hard against infantry and light on armour', () => {
    const trooper = unit('t', 'trooper', 'red', 2);
    const r = fireFlechettes([kestrel(), trooper], NOW);
    expect(r.unitDamage.get('t')).toBe(FLECHETTE.damage);
    const tank = unit('t', 'tank', 'red', 2);
    expect(fireFlechettes([kestrel(), tank], NOW).unitDamage.get('t')).toBeLessThan(FLECHETTE.damage / 2);
    // Recharging, out of range, or not shooting: nothing.
    expect(fireFlechettes([kestrel({ flechetteAt: NOW - 1000 }), trooper], NOW).shots).toHaveLength(0);
    expect(fireFlechettes([kestrel({ flechetteAt: NOW - FLECHETTE.cooldownMs }), trooper], NOW).shots).toHaveLength(1);
    expect(fireFlechettes([kestrel(), unit('t', 'trooper', 'red', 8)], NOW).shots).toHaveLength(0);
    expect(fireFlechettes([kestrel({ combatTargetId: null }), trooper], NOW).shots).toHaveLength(0);
  });

  it('peppers enemies right beside its target, and never its own side', () => {
    const r = fireFlechettes([kestrel(), unit('t', 'trooper', 'red', 2), unit('n', 'trooper', 'red', 3), unit('far', 'trooper', 'red', 6), unit('f', 'trooper', 'blue', 2, 1)], NOW);
    expect(r.unitDamage.get('n')).toBe(FLECHETTE.spreadDamage);
    expect(r.unitDamage.has('far')).toBe(false);
    expect(r.unitDamage.has('f')).toBe(false);
  });
});

describe('Kestrel Regenerative Shield', () => {
  const drone = kestrel();
  const max = shieldMax(drone);

  it('is worth a quarter of its health and takes 25% less damage than the hull', () => {
    expect(max).toBe(Math.round(drone.maxHealth * 0.25));
    const hit = shieldedHit({ health: 100, regenShield: max }, 20);
    expect(hit).toEqual({ health: 100, regenShield: max - 20 * SHIELD.takes });
    // A hit bigger than the shield breaks it; the rest lands on the hull at full strength.
    const big = shieldedHit({ health: 100, regenShield: 15 }, 40);
    expect(big.regenShield).toBe(0);
    expect(big.health).toBeCloseTo(100 - (40 * SHIELD.takes - 15) / SHIELD.takes);
    // No shield: the hull takes it all.
    expect(shieldedHit({ health: 100 }, 30)).toEqual({ health: 70, regenShield: undefined });
  });

  it('recharges only after 10s without being hit, and only once researched', () => {
    const hit = { ...drone, regenShield: 0, lastDamageTime: NOW };
    expect(regenerateShield(hit, NOW + 9000, 100, true).regenShield).toBe(0);
    let u = hit;
    for (let t = NOW + SHIELD.regenDelayMs; t < NOW + SHIELD.regenDelayMs + 3000; t += 100) u = regenerateShield(u, t, 100, true);
    expect(u.regenShield).toBe(max);
    expect(regenerateShield({ ...drone, lastDamageTime: undefined }, NOW, 100, false).regenShield).toBeUndefined();
    expect(shieldMax(unit('x', 'trooper', 'blue', 0))).toBe(0);
  });
});
