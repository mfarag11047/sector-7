import { describe, expect, it } from 'vitest';
import type { BuildingData, StructureData, UnitData } from '../types';
import { CombatStructure, resolveAttacks } from './combat';
import { COVER, coverBetween, coverMap, damageBuildings } from './cover';
import { createUnit } from './production';
import { fireRailguns } from './railgun';
import { shotDamage, UNIT_RULES } from './units';

const NOW = 100_000;
const unit = (type: UnitData['type'], team: 'blue' | 'red', id: string, x: number, z = 0) => createUnit(type, team, id, { x, z });
const building = (x: number, z = 0, patch: Partial<BuildingData> = {}): BuildingData => ({
  id: `b-${x}-${z}`, gridX: x, gridZ: z, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'residential', height: 1,
  blockId: 'blk', owner: null, captureProgress: 0, capturingTeam: null, health: 200, maxHealth: 200, ...patch,
});
const wall = (team: 'blue' | 'red', x: number, z = 0): StructureData => ({
  id: `wall-${x}-${z}`, type: 'base_wall', team, gridPos: { x, z }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 2000, maxHealth: 2000,
});
const fight = (units: UnitData[], buildings: BuildingData[], structures: StructureData[] = []) =>
  resolveAttacks(units, structures as CombatStructure[], NOW, () => false, undefined, coverMap(buildings, structures));

describe('line of fire', () => {
  it('is stopped by the first standing building on the line, not by one it only clips', () => {
    const map = coverMap([building(2), building(4)], []);
    expect(coverBetween(map, 'blue', { x: 0, z: 0 }, { x: 6, z: 0 })).toMatchObject({ kind: 'building', id: 'b-2-0' });
    expect(coverBetween(map, 'blue', { x: 0, z: 1 }, { x: 6, z: 1 })).toBeNull();
    // Diagonally past a corner.
    expect(coverBetween(coverMap([building(1, 0)], []), 'blue', { x: 0, z: 0 }, { x: 1, z: 1 })).toBeNull();
    expect(coverBetween(coverMap([building(2, 0, { destroyed: true })], []), 'blue', { x: 0, z: 0 }, { x: 4, z: 0 })).toBeNull();
  });

  it('counts the other side\'s walls, not the shooter\'s own, and the landmark towers', () => {
    const map = coverMap([], [wall('red', 2)], [{ x: 2, z: 3 }]);
    expect(coverBetween(map, 'blue', { x: 0, z: 0 }, { x: 4, z: 0 })).toMatchObject({ kind: 'structure', id: 'wall-2-0' });
    expect(coverBetween(map, 'red', { x: 4, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(coverBetween(map, 'blue', { x: 0, z: 3 }, { x: 4, z: 3 })).toMatchObject({ kind: 'landmark' });
  });
});

describe('fire into cover', () => {
  it('hits the building instead of the unit behind it, barely, from infantry', () => {
    const r = fight([unit('trooper', 'blue', 'us', 0), unit('trooper', 'red', 'them', 2)], [building(1)]);
    expect(r.unitDamage.get('them') ?? 0).toBe(0);
    const rifle = UNIT_RULES.trooper.weapon!;
    // Both of them fire, into the same building.
    expect(r.buildingDamage.get('b-1-0')).toBeCloseTo(2 * shotDamage(rifle, 'structure') * COVER.buildingShare.infantry);
    expect(r.shots.find(s => s.attackerId === 'us')).toMatchObject({ covered: true, targetId: 'b-1-0' });
    // Shot at, but it doesn't hold an attack-move.
    expect(r.aiming.get('us')).toBeNull();
  });

  it('lets a tank knock far more out of a building than a rifle does', () => {
    const tank = fight([unit('tank', 'blue', 'us', 0), unit('trooper', 'red', 'them', 3)], [building(1)]);
    const rifle = fight([unit('trooper', 'blue', 'us', 0), unit('trooper', 'red', 'them', 3)], [building(1)]);
    expect(tank.buildingDamage.get('b-1-0')!).toBeGreaterThan(rifle.buildingDamage.get('b-1-0')! * 20);
  });

  it('goes for a target in the open first', () => {
    const r = fight([unit('trooper', 'blue', 'us', 0), unit('trooper', 'red', 'hiding', 2), unit('trooper', 'red', 'open', 0, 3)], [building(1)]);
    expect(r.fired.get('us')).toBe('open');
    expect(r.unitDamage.get('open')).toBeGreaterThan(0);
  });

  it('stops nothing in the air', () => {
    const r = fight([unit('trooper', 'blue', 'us', 0), unit('hornet', 'red', 'air', 2)], [building(1)]);
    expect(r.unitDamage.get('air')).toBeGreaterThan(0);
  });

  it('lets defenders fire out over their own wall, while attackers hit the wall', () => {
    const units = [unit('trooper', 'blue', 'out', 0), unit('trooper', 'red', 'in', 2)];
    const r = fight(units, [], [wall('red', 1)]);
    expect(r.structureDamage.get('wall-1-0')).toBeGreaterThan(0);
    expect(r.unitDamage.get('out')).toBeGreaterThan(0);
    expect(r.unitDamage.get('in') ?? 0).toBe(0);
  });

  it('stops a tank\'s rail slug too, which hits the building hard', () => {
    const r = fireRailguns([unit('tank', 'blue', 't', 0), unit('razorback', 'red', 'rb', 6), unit('drone', 'blue', 'eye', 6, 1)], [], NOW, undefined, undefined, undefined, coverMap([building(3)], []));
    expect(r.unitDamage.get('rb') ?? 0).toBe(0);
    expect(r.buildingDamage.get('b-3-0')).toBeGreaterThan(50);
  });
});

describe('damaged buildings', () => {
  it('come down at no health, ownerless, as a Bombardment Drone leaves them', () => {
    const [hit, gone] = damageBuildings([building(1), building(2, 0, { owner: 'blue' })], new Map([['b-1-0', 50], ['b-2-0', 500]]));
    expect(hit.health).toBe(150);
    expect(gone).toMatchObject({ destroyed: true, owner: null, health: 0 });
  });
});
