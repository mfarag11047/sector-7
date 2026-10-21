import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { UnitData } from '../types';
import { muleLinks } from './energy';
import { createHeadlessMatch, stepMatch } from './headless';
import { createUnit } from './production';

const unit = (id: string, type: UnitData['type'], x: number, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, 'blue', id, { x, z: 0 }), ...patch });
const mule = (id = 'm', patch: Partial<UnitData> = {}) => unit(id, 'sun_plate', 0, { isDeployed: true, ...patch });
const low = (id: string, share: number, x = 2, type: UnitData['type'] = 'tank') => {
  const u = unit(id, type, x);
  return { ...u, battery: u.maxBattery * share };
};

describe('Battery Mule automatic charging', () => {
  it('charges the friendly vehicles and aircraft in range lowest on battery first', () => {
    const units = [mule(), low('a', 0.9), low('b', 0.1), low('c', 0.5, 3, 'wasp'), low('d', 0.3), low('e', 0.2), low('full', 1)];
    expect(muleLinks(units[0], units)).toEqual(['b', 'e', 'd', 'c']);
    expect(ABILITY_CONFIG.BATTERY_MULE_SLOTS).toBe(4);
  });

  it('skips infantry, the enemy, units out of range, and anything when packed up', () => {
    const enemy = { ...low('x', 0.1), team: 'red' as const };
    const far = low('far', 0.1, ABILITY_CONFIG.BATTERY_MULE_RANGE + 1);
    const trooper = { ...unit('t', 'trooper', 1), battery: 1 };
    expect(muleLinks(mule(), [mule(), enemy, far, trooper])).toEqual([]);
    expect(muleLinks(mule('m', { isDeployed: false }), [low('a', 0.1)])).toEqual([]);
  });

  it('stays on a unit until it is full, then moves on to the next lowest', () => {
    const units = [low('a', 0.6), low('b', 0.1)];
    const m = mule('m', { batteryTetherIds: ['a'] });
    expect(muleLinks(m, [m, ...units])).toEqual(['a', 'b']);
    const topped = [{ ...units[0], battery: units[0].maxBattery }, units[1]];
    expect(muleLinks(m, [m, ...topped])).toEqual(['b']);
  });

  it('leaves a unit another mule is charging to that mule', () => {
    const a = low('a', 0.1);
    const m1 = mule('m1', { batteryTetherIds: ['a'] });
    const m2 = mule('m2', { batteryTetherIds: ['a'] });
    expect(muleLinks(m2, [m1, m2, a])).toEqual([]);
    expect(muleLinks(m1, [m1, m2, a])).toEqual(['a']);
  });

  it('charges them in a match, with no order given', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const tank = { ...low('tk', 0.2, 41), gridPos: { x: 41, z: 30 } };
    m.units.push({ ...mule('mm'), gridPos: { x: 40, z: 30 } }, tank);
    const before = tank.battery;
    for (let i = 0; i < 5; i++) stepMatch(m);
    expect(m.units.find(u => u.id === 'mm')!.batteryTetherIds).toContain('tk');
    expect(m.units.find(u => u.id === 'tk')!.battery).toBeGreaterThan(before);
  });
});
