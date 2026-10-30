import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { UnitData } from '../types';
import { abilityEffects, AbilityContext } from './abilities';
import { resolveAttacks } from './combat';
import { createEconomy } from './economy';
import { isRemoteUnit, jammedUnits, jammingUpdates } from './jamming';
import { orderEffects, OrdersContext } from './orders';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'drone', unitClass: 'air', team: 'red', gridPos: { x: 20, z: 20 }, path: [], visionRange: 4,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const banshee = (patch: Partial<UnitData> = {}) =>
  unit('jammer', { type: 'banshee', unitClass: 'support', team: 'blue', gridPos: { x: 18, z: 20 }, jammerActive: true, ...patch });
const apply = (units: UnitData[]) => {
  const fx = jammingUpdates(units);
  return units.map(u => fx.get(u.id)?.(u) ?? u);
};

const orders: OrdersContext = {
  gridSize: 79, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } },
  isWalkable: () => true, findPath: (_f, to) => [`${to.x},${to.z}`], findAirPath: (_f, to) => [`${to.x},${to.z}`],
  canBuildOn: () => true, newId: p => p,
};
const abilities: AbilityContext = {
  now: 10_000, offset: 0, tileSize: 14, isWalkable: () => true,
  findPath: (_f, to) => [`${to.x},${to.z}`], findAirPath: (_f, to) => [`${to.x},${to.z}`],
  findAdjacentSpawn: c => c, createCrawler: (h, at) => unit('c', { gridPos: at, team: h.team }), random: () => 0.5, newId: p => p,
};
const move = (units: UnitData[], ids: string[]) =>
  orderEffects({ units, structures: [], buildings: [], economy: createEconomy() }, 'red', { type: 'MOVE', unitIds: ids, target: { x: 30, z: 30 } }, orders);

describe('Banshee jamming', () => {
  it('jams enemy remote-controlled units inside its radius, and nothing else', () => {
    const units = [
      banshee(),
      unit('drone'),
      unit('wasp', { type: 'wasp' }),
      unit('far', { gridPos: { x: 18 + ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS + 1, z: 20 } }),
      unit('tank', { type: 'tank', unitClass: 'armor' }),
      unit('trooper', { type: 'trooper', unitClass: 'infantry' }),
      unit('friend', { team: 'blue' }),
    ];
    expect([...jammedUnits(units)].sort()).toEqual(['drone', 'wasp']);
  });

  it('needs the jammer switched on and powered', () => {
    expect(jammedUnits([banshee({ jammerActive: false }), unit('drone')]).size).toBe(0);
    expect(jammedUnits([banshee({ battery: 0 }), unit('drone')]).size).toBe(0);
    expect(jammedUnits([banshee({ health: 0 }), unit('drone')]).size).toBe(0);
  });

  it('cannot jam a drone on a hardline tether', () => {
    const own = unit('host', { type: 'banshee', unitClass: 'support', gridPos: { x: 22, z: 20 }, tetherTargetIds: ['drone'] });
    expect(jammedUnits([banshee(), own, unit('drone'), unit('loose')]).has('drone')).toBe(false);
    expect(jammedUnits([banshee(), own, unit('drone'), unit('loose')]).has('loose')).toBe(true);
  });

  it('clears the jam once the unit is out of range', () => {
    let units = apply([banshee(), unit('drone')]);
    expect(units[1].isJammed).toBe(true);
    units = apply([units[0], { ...units[1], gridPos: { x: 40, z: 40 } }]);
    expect(units[1].isJammed).toBe(false);
  });

  it('refuses new orders to jammed units, and lets the rest of a group go', () => {
    const units = apply([banshee(), unit('drone'), unit('tank', { type: 'tank', unitClass: 'armor', gridPos: { x: 21, z: 21 } })]);
    const alone = move(units, ['drone']);
    expect('reason' in alone && alone.reason).toMatch(/jammed/);
    const group = move(units, ['drone', 'tank']);
    expect('effects' in group).toBe(true);
    if ('effects' in group) {
      expect(group.effects.unitUpdates.has('tank')).toBe(true);
      expect(group.effects.unitUpdates.has('drone')).toBe(false);
    }
  });

  it('refuses abilities to jammed units', () => {
    const units = apply([banshee(), unit('drone', { type: 'drone' })]);
    const fired = abilityEffects({ units, structures: [], economy: createEconomy() }, 'red', { type: 'SURVEILLANCE', unitId: 'drone', target: { x: 25, z: 25 } }, abilities);
    expect('reason' in fired && fired.reason).toMatch(/jammed/);
  });

  it('still lets a jammed unit fire on its own at what is in range', () => {
    const units = apply([banshee({ gridPos: { x: 21, z: 20 } }), unit('kestrel', { type: 'attack_drone' })]);
    expect(units[1].isJammed).toBe(true);
    expect(resolveAttacks(units, [], 10_000, () => false).fired.get('kestrel')).toBe('jammer');
  });

  it('counts drones and other uncrewed machines as remote-controlled', () => {
    for (const type of ['drone', 'wasp', 'helios', 'bombard', 'crawler_drone'] as const) expect(isRemoteUnit({ type })).toBe(true);
    for (const type of ['tank', 'hornet', 'trooper', 'banshee'] as const) expect(isRemoteUnit({ type })).toBe(false);
  });
});
