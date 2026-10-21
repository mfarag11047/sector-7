import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { createUnit } from './production';
import { detonateMules, VOLT, voltDamage } from './voltCore';

const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x: number, z = 0, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, team, id, { x, z }), ...patch });
const armed = () => true;

describe('Battery Mule Volt Core', () => {
  it('detonates a destroyed mule: heavy damage at the centre, falling off to the rim', () => {
    expect(voltDamage(0)).toBe(VOLT.damage);
    expect(voltDamage(VOLT.radius)).toBeCloseTo(VOLT.damage * VOLT.edge);
    expect(voltDamage(VOLT.radius / 2)).toBeGreaterThan(voltDamage(VOLT.radius));
    expect(voltDamage(VOLT.radius + 0.5)).toBe(0);
    const units = [unit('m', 'sun_plate', 'blue', 0, 0, { health: 0 }), unit('near', 'tank', 'red', 1), unit('edge', 'tank', 'red', 4), unit('far', 'tank', 'red', 6), unit('wasp', 'wasp', 'red', 2), unit('own', 'tank', 'blue', 1, 1)];
    const r = detonateMules(units, armed);
    const hp = (id: string) => r.units.find(u => u.id === id)!.health;
    const full = (id: string) => units.find(u => u.id === id)!.health;
    expect(r.blasts).toEqual([{ muleId: 'm', team: 'blue', at: { x: 0, z: 0 } }]);
    expect(full('near') - hp('near')).toBeCloseTo(voltDamage(1));
    expect(full('near') - hp('near')).toBeGreaterThan(full('edge') - hp('edge'));
    expect(hp('far')).toBe(full('far'));
    // Aircraft too; never its own side.
    expect(hp('wasp')).toBeLessThan(full('wasp'));
    expect(hp('own')).toBe(full('own'));
  });

  it('needs the research, and only fires for mules that died', () => {
    const units = [unit('m', 'sun_plate', 'blue', 0, 0, { health: 0 }), unit('e', 'trooper', 'red', 1)];
    expect(detonateMules(units, () => false).blasts).toEqual([]);
    expect(detonateMules([unit('m', 'sun_plate', 'blue', 0), unit('e', 'trooper', 'red', 1)], armed).blasts).toEqual([]);
  });

  it('sets off an enemy mule it kills, which detonates in turn', () => {
    const units = [unit('m', 'sun_plate', 'blue', 0, 0, { health: 0 }), unit('r', 'sun_plate', 'red', 1, 0, { health: 50 }), unit('b', 'trooper', 'blue', 4)];
    const r = detonateMules(units, armed);
    expect(r.blasts.map(b => b.muleId)).toEqual(['m', 'r']);
    expect(r.units.find(u => u.id === 'b')!.health).toBeLessThan(units[2].health);
  });
});
