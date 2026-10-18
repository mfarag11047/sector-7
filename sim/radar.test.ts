import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { createUnit } from './production';
import { isRadarActive, onRadar, RADAR, radarUnits, radarSources } from './radar';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
const unit = (type: UnitData['type'], team: 'blue' | 'red', id: string, x: number) => at(createUnit(type, team, id, { x: 0, z: 0 }), x);

describe('Aegis radar', () => {
  it('comes from working Aegis only', () => {
    const aegis = unit('aegis', 'blue', 'a', 0);
    expect(radarSources([aegis, unit('tank', 'blue', 't', 3), unit('aegis', 'red', 'r', 5)], 'blue')).toEqual([{ x: 0, z: 0 }]);
    expect(isRadarActive({ ...aegis, buffs: [{ kind: 'emp', until: 9e15 }] })).toBe(false);
    expect(isRadarActive({ ...aegis, health: 0 })).toBe(false);
  });

  it('reaches far beyond what the Aegis can see', () => {
    expect(onRadar({ x: RADAR.range, z: 0 }, [{ x: 0, z: 0 }])).toBe(true);
    expect(onRadar({ x: RADAR.range + 0.5, z: 0 }, [{ x: 0, z: 0 }])).toBe(false);
  });

  it('holds enemy aircraft that nothing sees, not ground units, friends or ones already in view', () => {
    const units = [
      unit('aegis', 'blue', 'a', 0), unit('hornet', 'red', 'far-air', 12), unit('wasp', 'red', 'seen-air', 4),
      unit('tank', 'red', 'ground', 10), unit('hornet', 'blue', 'friend', 8), unit('drone', 'red', 'out', 30),
    ];
    const held = radarUnits(units, 'blue', radarSources(units, 'blue'), u => u.id === 'seen-air');
    expect(held.map(u => u.id)).toEqual(['far-air']);
    // A cloaked ground unit does show (sim/cloak.ts).
    const cloaked = units.map(u => u.id === 'ground' ? { ...u, fieldCloaked: true } : u);
    expect(radarUnits(cloaked, 'blue', radarSources(cloaked, 'blue'), u => u.id === 'seen-air').map(u => u.id)).toEqual(['far-air', 'ground']);
  });
});
