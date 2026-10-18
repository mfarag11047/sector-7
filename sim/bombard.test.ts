import { describe, expect, it } from 'vitest';
import { BUILDING_HEALTH } from '../constants';
import type { BuildingData, UnitData } from '../types';
import { BOMBARD, DROPS_TO_DESTROY, bombardState, bombardTick, munitionsOf } from './bombard';
import { bombardBuildings } from './combat';
import { abilityEffects } from './abilities';

const drone = (patch: Partial<UnitData> = {}): UnitData => ({
  id: 'd', type: 'bombard', unitClass: 'air', team: 'blue', gridPos: { x: 20, z: 20 }, path: [], visionRange: 4,
  health: 260, maxHealth: 260, battery: 100, maxBattery: 100, cooldowns: {},
  bombardmentTarget: { x: 20, z: 20 }, ...patch,
});
const BASE = { x: 4, z: 4 };
const bases = () => [BASE];
const airPath = (from: { x: number; z: number }, to: { x: number; z: number }) => (from.x === to.x && from.z === to.z ? [] : [`${to.x},${to.z}`]);

// Runs the drone through ticks, applying the updates the way CityMap does.
function run(start: UnitData, fromMs: number, toMs: number, stepMs = 100) {
  let u = start;
  const strikes: number[] = [];
  for (let now = fromMs; now <= toMs; now += stepMs) {
    const r = bombardTick([u], now, bases, airPath);
    if (r.strikes.length) strikes.push(now);
    const f = r.updates.get(u.id);
    if (f) u = f(u);
  }
  return { u, strikes };
}

describe('Bombardment Drone', () => {
  it('keeps dropping on its target, one drop per interval', () => {
    const { u, strikes } = run(drone(), 0, BOMBARD.intervalMs * 2.5);
    expect(strikes).toEqual([0, BOMBARD.intervalMs, BOMBARD.intervalMs * 2]);
    expect(munitionsOf(u)).toBe(BOMBARD.magazine - 3);
    expect(bombardState(u)).toBe('bombarding');
  });

  it('carries five drops, then breaks off and heads for the nearest base', () => {
    const { u, strikes } = run(drone(), 0, BOMBARD.intervalMs * 10);
    expect(strikes).toHaveLength(5);
    expect(munitionsOf(u)).toBe(0);
    expect(u.bombardmentTarget).toBeNull();
    expect(u.path).toEqual([`${BASE.x},${BASE.z}`]);
    expect(bombardState(u)).toBe('returning');
  });

  it('only strikes while hovering over the target', () => {
    expect(bombardTick([drone({ path: ['21,20'] })], 0, bases, airPath).strikes).toHaveLength(0);
    expect(bombardTick([drone({ bombardmentTarget: null })], 0, bases, airPath).strikes).toHaveLength(0);
  });

  it('never drops twice in an interval, even when the caller lags a tick', () => {
    const r = bombardTick([drone()], 50, bases, airPath, () => 0);
    expect(r.strikes).toHaveLength(0);
  });

  it('rearms to a full load after a spell by a base', () => {
    const home = drone({ gridPos: { ...BASE }, bombardmentTarget: null, bombardMunitions: 0, bombardReturning: true });
    const early = run(home, 0, BOMBARD.rearmMs - 200);
    expect(munitionsOf(early.u)).toBe(0);
    expect(bombardState(early.u)).toBe('rearming');
    const done = run(home, 0, BOMBARD.rearmMs + 200);
    expect(munitionsOf(done.u)).toBe(BOMBARD.magazine);
    expect(bombardState(done.u)).toBe('idle');
  });

  it('does not rearm away from a base', () => {
    const { u } = run(drone({ bombardmentTarget: null, bombardMunitions: 2 }), 0, BOMBARD.rearmMs * 2);
    expect(munitionsOf(u)).toBe(2);
  });
});

describe('BOMBARD command', () => {
  const view = (u: UnitData) => ({ units: [u], structures: [], buildings: [], economy: { blue: { tier: 3 }, red: { tier: 3 } } }) as never;
  const ctx = { now: 0, findAirPath: airPath } as never;

  it('with no target stops the strikes', () => {
    const out = abilityEffects(view(drone()), 'blue', { type: 'BOMBARD', unitId: 'd' }, ctx);
    if (!out.ok) throw new Error('refused');
    expect(out.effects.updates.get('d')!(drone()).bombardmentTarget).toBeNull();
  });

  it('is refused when the drone is out of munitions', () => {
    const out = abilityEffects(view(drone({ bombardmentTarget: null, bombardMunitions: 0 })), 'blue', { type: 'BOMBARD', unitId: 'd', target: { x: 30, z: 30 } }, ctx);
    expect(out.ok).toBe(false);
  });
});

describe('drops to bring a building down', () => {
  const building = (type: BuildingData['type']): BuildingData => ({
    id: type, gridX: 20, gridZ: 20, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type, height: 1,
    blockId: type, owner: null, captureProgress: 0, capturingTeam: null, health: BUILDING_HEALTH[type], maxHealth: BUILDING_HEALTH[type],
  });
  const dropsToFell = (type: BuildingData['type']) => {
    let b = [building(type)];
    for (let n = 1; n <= 10; n++) {
      b = bombardBuildings(b, [{ x: 20, z: 20 }]);
      if (b[0].destroyed) return n;
    }
    return Infinity;
  };

  it('rises toward the city centre: residential 2, industrial 3, high-tech 4, commercial 5', () => {
    expect(dropsToFell('residential')).toBe(2);
    expect(dropsToFell('industrial')).toBe(3);
    expect(dropsToFell('hightech')).toBe(4);
    expect(dropsToFell('commercial')).toBe(5);
    for (const type of Object.keys(DROPS_TO_DESTROY) as BuildingData['type'][]) expect(dropsToFell(type)).toBe(DROPS_TO_DESTROY[type]);
  });
});
