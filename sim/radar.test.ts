import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { createUnit } from './production';
import { isRadarActive, onRadar, RADAR, radarRangeOf, radarSources, radarUnits, SEARCH_RADAR, searchRadarSources } from './radar';

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

  it('Infiltrator search radar holds ground units and large aircraft, not small or medium ones', () => {
    const units = [
      unit('drone', 'blue', 'd', 0),
      unit('tank', 'red', 'tank', 6), unit('trooper', 'red', 'trooper', 7), unit('bombard', 'red', 'bombard', 5),
      unit('hornet', 'red', 'hornet', 4), unit('wasp', 'red', 'wasp', 3), unit('drone', 'red', 'drone', 2),
      unit('tank', 'red', 'far', SEARCH_RADAR.range + 1),
    ];
    const held = radarUnits(units, 'blue', radarSources(units, 'blue'), () => false, searchRadarSources(units, 'blue'));
    expect(held.map(u => u.id).sort()).toEqual(['bombard', 'tank', 'trooper']);
  });

  it('Infiltrator radar reaches half again as far on a Surveillance loiter', () => {
    const drone = unit('drone', 'blue', 'd', 0);
    const loitering = { ...drone, surveillance: { active: true, status: 'active' as const, center: { x: 0, z: 0 }, returnPos: { x: 0, z: 0 }, startTime: 0 } };
    expect(radarRangeOf(drone)).toBe(SEARCH_RADAR.range);
    expect(radarRangeOf(loitering)).toBe(SEARCH_RADAR.surveillanceRange);
    expect(SEARCH_RADAR.surveillanceRange).toBe(SEARCH_RADAR.range * 1.5);
    const units = [loitering, unit('tank', 'red', 't', 11)];
    expect(radarUnits(units, 'blue', [], () => false, searchRadarSources(units, 'blue')).map(u => u.id)).toEqual(['t']);
    expect(radarUnits([drone, units[1]], 'blue', [], () => false, searchRadarSources([drone, units[1]], 'blue'))).toHaveLength(0);
    expect(radarRangeOf({ ...drone, buffs: [{ kind: 'emp', until: 9e15 }] })).toBe(0);
    expect(radarRangeOf(unit('aegis', 'blue', 'a', 0))).toBe(RADAR.range);
  });
});
