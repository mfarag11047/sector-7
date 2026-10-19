import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { UnitData } from '../types';
import { dampenedUnits } from './ghost';
import { radarUnits } from './radar';
import { UNIT_RULES } from './units';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x: 20, z: 20 }, path: [], visionRange: 4,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const ghost = (patch: Partial<UnitData> = {}) => unit('ghost', { type: 'ghost', unitClass: 'infantry', isDampenerActive: true, ...patch });

describe('Ghost Dampener', () => {
  it('hides the Ghost and friendly units within its radius, not enemies or units beyond', () => {
    const units = [
      ghost(),
      unit('near', { gridPos: { x: 22, z: 20 } }),
      unit('far', { gridPos: { x: 20 + ABILITY_CONFIG.GHOST_DAMPENER_RADIUS + 1, z: 20 } }),
      unit('enemy', { team: 'red', gridPos: { x: 21, z: 20 } }),
    ];
    expect([...dampenedUnits(units)].sort()).toEqual(['ghost', 'near']);
  });

  it('only while switched on and powered', () => {
    expect(dampenedUnits([ghost({ isDampenerActive: false }), unit('near')]).size).toBe(0);
    expect(dampenedUnits([ghost({ battery: 0 }), unit('near')]).size).toBe(0);
  });

  it('hides units from enemy radar', () => {
    // A red Infiltrator's ground radar would pick up the tank, but not under the Dampener.
    const radar = [{ at: { x: 24, z: 20 }, range: 8 }];
    const tank = unit('near', { gridPos: { x: 21, z: 20 } });
    expect(radarUnits([tank], 'red', [], () => false, radar).map(u => u.id)).toEqual(['near']);
    expect(radarUnits([ghost(), tank], 'red', [], () => false, radar)).toEqual([]);
  });

  it('the Ghost itself is a Tier 1 unit', () => {
    expect(UNIT_RULES.ghost.tier).toBe(1);
  });
});
