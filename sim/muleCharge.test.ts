import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { UnitData } from '../types';
import { chargeSources, muleLinks, muleRange } from './energy';
import { createHeadlessMatch, stepMatch } from './headless';
import { createUnit } from './production';

const unit = (id: string, type: UnitData['type'], x: number, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, 'blue', id, { x, z: 0 }), ...patch });
const mule = (id = 'm', patch: Partial<UnitData> = {}) => unit(id, 'sun_plate', 0, patch);
const low = (id: string, share: number, x = 2, type: UnitData['type'] = 'tank') => {
  const u = unit(id, type, x);
  return { ...u, battery: u.maxBattery * share };
};

describe('Battery Mule automatic charging', () => {
  it('charges the friendly ground vehicles in range lowest on battery first, never aircraft', () => {
    const units = [mule(), low('a', 0.9), low('b', 0.1), low('c', 0.5, 3, 'razorback'), low('d', 0.3), low('e', 0.2), low('full', 1), low('air', 0.05, 2, 'wasp'), low('k', 0.05, 2, 'attack_drone')];
    expect(muleLinks(units[0], units)).toEqual(['b', 'e', 'd', 'c']);
    expect(ABILITY_CONFIG.BATTERY_MULE_SLOTS).toBe(4);
  });

  it('skips infantry, the enemy and units out of range, and charges on the move', () => {
    const enemy = { ...low('x', 0.1), team: 'red' as const };
    const far = low('far', 0.1, ABILITY_CONFIG.BATTERY_MULE_RANGE + 1);
    const trooper = { ...unit('t', 'trooper', 1), battery: 1 };
    expect(muleLinks(mule(), [mule(), enemy, far, trooper])).toEqual([]);
    const moving = mule('m', { isDeployed: false, path: ['1,0', '2,0'] });
    expect(muleLinks(moving, [moving, low('a', 0.1)])).toEqual(['a']);
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

describe('Battery Mule range', () => {
  it('is 7 tiles, and 10 once the side has the Mk III Refit', () => {
    expect(muleRange({ upgrades: [] })).toBe(7);
    expect(muleRange({ upgrades: ['volt_core'] })).toBe(7);
    expect(muleRange({ upgrades: ['volt_core', 'sun_plate_mk3'] })).toBe(10);
    expect(muleRange(undefined)).toBe(7);
  });

  it('charges only what is within it', () => {
    const units = [mule(), low('at7', 0.5, 7), low('at8', 0.4, 8), low('at10', 0.3, 10), low('at11', 0.2, 11)];
    expect(muleLinks(units[0], units)).toEqual(['at7']);
    expect(muleLinks(units[0], units, 10)).toEqual(['at10', 'at8', 'at7']);
    // The charge itself goes only as far as the mule's range, whatever it is linked to.
    const linked = { ...units[0], batteryTetherIds: ['at7', 'at8', 'at10'] };
    expect([...chargeSources([linked, ...units.slice(1)]).mule.keys()]).toEqual(['at7']);
    expect([...chargeSources([linked, ...units.slice(1)], () => 10).mule.keys()]).toEqual(['at7', 'at8', 'at10']);
  });

  it('reaches further in a match once the side has researched the Mk III Refit', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    m.nextThink = { blue: Infinity, red: Infinity };
    const tank = { ...createUnit('tank', 'blue', 'tk', { x: 30, z: 30 }), battery: 100 };
    m.units = [createUnit('sun_plate', 'blue', 'mm', { x: 21, z: 30 }), tank];
    for (let i = 0; i < 5; i++) stepMatch(m);
    expect(m.units.find(u => u.id === 'mm')!.batteryTetherIds ?? []).not.toContain('tk');
    m.economy.blue.upgrades = [...m.economy.blue.upgrades, 'sun_plate_mk3'];
    for (let i = 0; i < 5; i++) stepMatch(m);
    expect(m.units.find(u => u.id === 'mm')!.batteryTetherIds).toContain('tk');
  });
});

