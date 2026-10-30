import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { createHeadlessMatch, stepMatch } from './headless';
import { createUnit } from './production';
import { DAMAGE_MULTIPLIER } from './units';
import { armMules, countdownOf, dueCharges, VOLT, voltBlastDamage, voltBlasts, voltDamage } from './voltCore';

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
    expect(damage.get('near')).toBeCloseTo(voltDamage(1) + voltBlastDamage(1) * DAMAGE_MULTIPLIER.explosive.heavy);
    expect(damage.get('near')!).toBeGreaterThan(damage.get('edge')!);
    expect(damage.has('far')).toBe(false);
    expect(damage.get('wasp')).toBeGreaterThan(0);
    expect(damage.has('own')).toBe(false);
  });

  it('blasts as well as discharges: hardest on infantry, least on heavy armour, aircraft only shocked', () => {
    expect(voltBlastDamage(0)).toBe(VOLT.blast.damage);
    expect(voltBlastDamage(VOLT.blast.radius)).toBeCloseTo(VOLT.blast.damage * VOLT.blast.edge);
    expect(voltBlastDamage(VOLT.blast.radius + 0.5)).toBe(0);
    const [charge] = armMules([unit('m', 'sun_plate', 'blue', 0, 0, { health: 0 })], armed, NOW);
    const { damage } = voltBlasts([unit('inf', 'trooper', 'red', 1), unit('tank', 'tank', 'red', 1, 0.0001), unit('air', 'hornet', 'red', 0, 1)], [charge]);
    expect(damage.get('inf')).toBeCloseTo(voltDamage(1) + voltBlastDamage(1) * DAMAGE_MULTIPLIER.explosive.infantry);
    expect(damage.get('inf')!).toBeGreaterThan(damage.get('tank')!);
    expect(damage.get('air')).toBeCloseTo(voltDamage(1));
    // At the centre the two together are well past what the discharge alone does.
    expect(voltDamage(0) + voltBlastDamage(0)).toBeGreaterThan(VOLT.damage * 2);
  });

  it('wrecks enemy structures in the blast, sparing its own side', () => {
    const structure = (id: string, team: 'blue' | 'red', x: number): StructureData => ({
      id, type: 'defense', team, gridPos: { x, z: 0 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 900, maxHealth: 900,
    });
    const [charge] = armMules([unit('m', 'sun_plate', 'blue', 0, 0, { health: 0 })], armed, NOW);
    const { structureDamage, hits } = voltBlasts([], [charge], [structure('near', 'red', 1), structure('far', 'red', 5), structure('own', 'blue', 1)]);
    expect(structureDamage.get('near')).toBeCloseTo(voltBlastDamage(1) * DAMAGE_MULTIPLIER.explosive.structure);
    expect(structureDamage.has('far')).toBe(false);
    expect(structureDamage.has('own')).toBe(false);
    expect(hits).toEqual([{ attackerId: 'm', targetId: 'near' }]);
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
