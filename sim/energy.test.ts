import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { BuildingData, UnitData } from '../types';
import { batteryDrain, chargeSources, isInsideEnergyGrid, PowerContext, powerTick } from './energy';

const BLUE_BASE = { x: 4, z: 4 };
const RED_BASE = { x: 75, z: 75 };

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x: 40, z: 40 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 50, maxBattery: 100, cooldowns: {}, ...patch,
});
const building = (patch: Partial<BuildingData>): BuildingData => ({
  id: 'b', gridX: 30, gridZ: 30, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'residential', height: 1,
  blockId: 'b', owner: 'blue', captureProgress: 0, capturingTeam: null, health: 200, maxHealth: 200, ...patch,
});

describe('isInsideEnergyGrid', () => {
  it('covers the base and captured buildings, but not core nodes or enemy buildings', () => {
    const r = ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS;
    expect(isInsideEnergyGrid({ x: 4 + ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS, z: 4 }, 'blue', [], BLUE_BASE, RED_BASE)).toBe(true);
    expect(isInsideEnergyGrid({ x: 30 + r, z: 30 }, 'blue', [building({})], BLUE_BASE, RED_BASE)).toBe(true);
    expect(isInsideEnergyGrid({ x: 30 + r + 1, z: 30 }, 'blue', [building({})], BLUE_BASE, RED_BASE)).toBe(false);
    expect(isInsideEnergyGrid({ x: 30, z: 30 }, 'blue', [building({ type: 'core_node' })], BLUE_BASE, RED_BASE)).toBe(false);
    expect(isInsideEnergyGrid({ x: 30, z: 30 }, 'red', [building({})], BLUE_BASE, RED_BASE)).toBe(false);
    expect(isInsideEnergyGrid({ x: 30, z: 30 }, 'blue', [building({ destroyed: true })], BLUE_BASE, RED_BASE)).toBe(false);
  });
});

describe('batteryDrain', () => {
  it('charges vehicles for moving off the grid, never infantry', () => {
    expect(batteryDrain(unit('t'), true, false)).toBe(ABILITY_CONFIG.BATTERY_DRAIN_MOVE);
    expect(batteryDrain(unit('t'), false, false)).toBe(ABILITY_CONFIG.BATTERY_DRAIN_IDLE);
    expect(batteryDrain(unit('t'), true, true)).toBe(0);
    expect(batteryDrain(unit('g', { type: 'ghost', unitClass: 'infantry' }), true, false)).toBe(0);
  });

  it('adds the cost of abilities left switched on', () => {
    const jamming = unit('b', { type: 'banshee', unitClass: 'support', jammerActive: true });
    expect(batteryDrain(jamming, false, true)).toBe(ABILITY_CONFIG.DRAIN_STATIC_JAMMER);
  });
});

const ctx = (patch: Partial<PowerContext> = {}): PowerContext => ({
  units: [], sources: chargeSources([]), onGrid: false, inNanoCloud: false, helios: [], ...patch,
});

function tick(u: UnitData, c: PowerContext) {
  const draft = { ...u };
  const changed = powerTick(u, draft, c);
  return { draft, changed };
}

describe('powerTick', () => {
  it('drains a vehicle moving off-grid and recharges it on the grid', () => {
    const moving = unit('t', { path: ['41,40'] });
    expect(tick(moving, ctx()).draft.battery).toBeCloseTo(50 - ABILITY_CONFIG.BATTERY_DRAIN_MOVE);
    const home = tick(moving, ctx({ onGrid: true })).draft;
    expect(home.battery).toBe(50 + ABILITY_CONFIG.ENERGY_GRID_CHARGE_RATE);
    expect(home.chargingStatus).toBe(1);
  });

  it('lets a Helios charge nearby friends unless a nano cloud is in the way', () => {
    const helios = unit('h', { type: 'helios', unitClass: 'support', gridPos: { x: 41, z: 40 } });
    const idle = unit('t');
    const charged = tick(idle, ctx({ helios: [helios] })).draft.battery;
    expect(charged).toBeCloseTo(50 - ABILITY_CONFIG.BATTERY_DRAIN_IDLE + ABILITY_CONFIG.HELIOS_CHARGE_RATE);
    const blocked = tick(idle, ctx({ helios: [helios], inNanoCloud: true })).draft;
    expect(blocked.battery).toBeCloseTo(50 - ABILITY_CONFIG.BATTERY_DRAIN_IDLE);
    expect(blocked.isInNanoCloud).toBe(true);
  });

  it('switches off a flat Ghost cloak and dampener', () => {
    const ghost = unit('g', { type: 'ghost', unitClass: 'infantry', battery: 0, decoyActive: true, isStealthed: true, isDampenerActive: true });
    expect(tick(ghost, ctx()).draft).toMatchObject({ decoyActive: false, isStealthed: false, isDampenerActive: false });
  });

  it('feeds linked vehicles from an anchored Battery Mule and bills the mule', () => {
    const mule = unit('m', { type: 'sun_plate', battery: 800, maxBattery: 800, isDeployed: true, batteryTetherIds: ['t'], gridPos: { x: 40, z: 45 } });
    const tank = unit('t');
    const sources = chargeSources([mule, tank]);
    const c = ctx({ units: [mule, tank], sources });
    expect(tick(tank, c).draft.chargingStatus).toBe(2);
    expect(tick(mule, c).draft.battery).toBeCloseTo(800 - ABILITY_CONFIG.BATTERY_DRAIN_IDLE - ABILITY_CONFIG.BATTERY_MULE_CHARGE_RATE);
  });

  it('reports no change for a full unit idling on the grid', () => {
    const full = unit('t', { battery: 100, chargingStatus: 0, isInNanoCloud: false });
    expect(tick(full, ctx({ onGrid: true })).changed).toBe(false);
  });
});
