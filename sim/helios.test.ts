import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { abilityEffects, applyUnitEffects, type AbilityContext } from './abilities';
import { createEconomy } from './economy';
import { chargeSources, powerTick } from './energy';
import { activeFields } from './forcefield';
import { HELIOS, heliosCharge, microwaveDamage } from './helios';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x: 20, z: 20 }, path: [], visionRange: 4,
  health: 100, maxHealth: 100, battery: 50, maxBattery: 100, cooldowns: {}, ...patch,
});
const helios = (patch: Partial<UnitData> = {}) => unit('h', { type: 'helios', unitClass: 'support', ...patch });
const tick = (u: UnitData, all: UnitData[]) => {
  const draft = { ...u };
  powerTick(u, draft, { units: all, sources: chargeSources(all), onGrid: false, inNanoCloud: false, helios: all.filter(x => x.type === 'helios') });
  return draft;
};
const ctx = { now: 0, offset: 0, tileSize: 14 } as unknown as AbilityContext;

describe('Helios', () => {
  it('in Charge mode trickles power into friends in range, slowly, and into itself', () => {
    const h = helios({ gridPos: { x: 21, z: 20 } });
    expect(heliosCharge(unit('t'), [h])).toBeCloseTo(HELIOS.chargePerTick);
    expect(heliosCharge(unit('enemy', { team: 'red' }), [h])).toBe(0);
    expect(heliosCharge(unit('far', { gridPos: { x: 20 + HELIOS.radius + 2, z: 20 } }), [h])).toBe(0);
    // 3 a second, against the grid's much faster charge.
    expect(HELIOS.chargePerTick * 10).toBeLessThanOrEqual(3);
    // A flat Helios still charges itself back up.
    const flat = helios({ battery: 0 });
    expect(tick(flat, [flat]).battery).toBeGreaterThan(0);
  });

  it('in Microwave mode slowly damages enemies in range, charges nothing, and spends its battery', () => {
    const h = helios({ heliosMode: 'burn', gridPos: { x: 21, z: 20 } });
    const units = [h, unit('enemy', { team: 'red' }), unit('friend'), unit('far', { team: 'red', gridPos: { x: 30, z: 20 } })];
    const dmg = microwaveDamage(units, 1000);
    expect(dmg.get('enemy')).toBeCloseTo(HELIOS.burnDps);
    expect(dmg.has('friend')).toBe(false);
    expect(dmg.has('far')).toBe(false);
    expect(heliosCharge(unit('friend'), [h])).toBe(0);
    expect(tick(h, [h]).battery).toBeLessThan(h.battery);
    // A flat Helios can't fire the beam.
    expect(microwaveDamage([{ ...h, battery: 0 }, unit('enemy', { team: 'red' })], 1000).size).toBe(0);
  });

  it('is blocked by an enemy force field', () => {
    const gen = unit('gen', { type: 'field_generator', team: 'red', gridPos: { x: 25, z: 20 }, health: 2000, maxHealth: 2000 });
    const h = helios({ heliosMode: 'burn', gridPos: { x: 21, z: 20 } });
    const target = unit('inside', { team: 'red', gridPos: { x: 23, z: 20 } });
    expect(microwaveDamage([h, gen, target], 1000, activeFields([gen], 0)).has('inside')).toBe(false);
    expect(microwaveDamage([h, gen, target], 1000).has('inside')).toBe(true);
  });

  it('switches between its two modes, one at a time', () => {
    let units = [helios(), helios({ id: 'h2', heliosMode: 'burn' })];
    const set = (mode: 'charge' | 'burn') => {
      const r = abilityEffects({ units, structures: [], economy: createEconomy() }, 'blue', { type: 'SET_HELIOS_MODE', unitIds: ['h', 'h2'], mode }, ctx);
      if ('reason' in r) throw new Error(r.reason);
      units = applyUnitEffects(units, r.effects);
    };
    set('burn');
    expect(units.map(u => u.heliosMode)).toEqual(['burn', 'burn']);
    set('charge');
    expect(units.map(u => u.heliosMode)).toEqual(['charge', 'charge']);
  });
});
