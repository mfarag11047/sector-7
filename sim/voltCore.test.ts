import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { createHeadlessMatch, stepMatch } from './headless';
import { createUnit } from './production';
import { armMules, countdownOf, dueCharges, VOLT, voltBlasts, voltDamage } from './voltCore';

const NOW = 100_000;
const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x: number, z = 0, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, team, id, { x, z }), ...patch });
const armed = () => true;

describe('Battery Mule Volt Core', () => {
  it('goes critical where a mule dies, with a three-second countdown, only once researched', () => {
    const dead = unit('m', 'sun_plate', 'blue', 3, 4, { health: 0 });
    const [charge] = armMules([dead, unit('alive', 'sun_plate', 'blue', 0)], armed, NOW);
    expect(charge).toEqual({ muleId: 'm', team: 'blue', at: { x: 3, z: 4 }, armedAt: NOW, blowsAt: NOW + VOLT.fuseMs, power: 1 });
    expect(armMules([dead], () => false, NOW)).toEqual([]);
    expect([0, 1000, 2000, 2900].map(t => countdownOf(charge, NOW + t))).toEqual([3, 2, 1, 1]);
    expect(dueCharges([charge], NOW + 2999)).toEqual([]);
    expect(dueCharges([charge], NOW + 3000)).toEqual([charge]);
  });

  it('blasts enemies round it: heavy at the centre, falling off to the rim, air included, never its own side', () => {
    expect(voltDamage(0)).toBe(VOLT.damage);
    expect(voltDamage(VOLT.radius)).toBeCloseTo(VOLT.damage * VOLT.edge);
    expect(voltDamage(VOLT.radius + 0.5)).toBe(0);
    const [charge] = armMules([unit('m', 'sun_plate', 'blue', 0, 0, { health: 0 })], armed, NOW);
    const units = [unit('near', 'tank', 'red', 1), unit('edge', 'tank', 'red', 4), unit('far', 'tank', 'red', 6), unit('wasp', 'wasp', 'red', 2), unit('own', 'tank', 'blue', 1, 1)];
    const { damage } = voltBlasts(units, [charge]);
    expect(damage.get('near')).toBeCloseTo(voltDamage(1));
    expect(damage.get('near')!).toBeGreaterThan(damage.get('edge')!);
    expect(damage.has('far')).toBe(false);
    expect(damage.get('wasp')).toBeGreaterThan(0);
    expect(damage.has('own')).toBe(false);
  });

  it('counts down and then goes off in a match, and a mule it kills goes critical in turn', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    m.economy = { ...m.economy, blue: { ...m.economy.blue, upgrades: ['volt_core'] }, red: { ...m.economy.red, upgrades: ['volt_core'] } };
    m.units.push(unit('bm', 'sun_plate', 'blue', 40, 30, { health: 0 }), unit('rm', 'sun_plate', 'red', 41, 30, { health: 30 }), unit('rt', 'trooper', 'red', 42, 30));
    stepMatch(m);
    expect(m.volt.map(c => c.muleId)).toEqual(['bm']);
    const at = m.now;
    while (m.now < at + VOLT.fuseMs) stepMatch(m);
    expect(m.units.some(u => u.id === 'rt')).toBe(false);
    expect(m.volt.map(c => c.muleId)).toEqual(['rm']);
  });
});
