import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import type { StructureData } from '../types';
import { baseCentreOf, BUILDING_PADS, freePadsFor, hqPads, padKindOf, spawnTile, TURRET_PADS } from './baseLayout';
import { facingBase } from '../components/kit/facing';
import { generateCity } from './mapgen';

const N = CITY_CONFIG.gridSize;
const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const roads = new Set(city.roadTileSet);
const key = (p: { x: number; z: number }) => `${p.x},${p.z}`;
const all = (hq: { x: number; z: number }) => [...hqPads(hq, 'building', N), ...hqPads(hq, 'turret', N)];

describe('base pads', () => {
  it('gives every HQ six building pads and four turret corners', () => {
    for (const hq of [TEAM_BASES.blue, TEAM_BASES.red, { x: 39, z: 15 }]) {
      expect(hqPads(hq, 'building', N)).toHaveLength(BUILDING_PADS);
      expect(hqPads(hq, 'turret', N)).toHaveLength(TURRET_PADS);
      expect(new Set(all(hq).map(key)).size).toBe(BUILDING_PADS + TURRET_PADS);
      // Never on the HQ's own pad.
      expect(all(hq).every(p => Math.abs(p.x - hq.x) > 1 || Math.abs(p.z - hq.z) > 1)).toBe(true);
    }
  });

  it('lays the starting bases out on their paved square, mirrored, clear of the roads through it', () => {
    const mirror = (p: { x: number; z: number }) => key({ x: N - 1 - p.x, z: N - 1 - p.z });
    expect(new Set(all(TEAM_BASES.red).map(key))).toEqual(new Set(all(TEAM_BASES.blue).map(mirror)));
    for (const hq of [TEAM_BASES.blue, TEAM_BASES.red]) {
      for (const p of all(hq)) {
        expect(roads.has(key(p))).toBe(true);
        expect(p.x % 6 === 0 || p.z % 6 === 0).toBe(false);
        expect(city.buildings.some(b => b.gridX === p.x && b.gridZ === p.z)).toBe(false);
      }
      // The turrets are on the square's corners.
      expect(hqPads(hq, 'turret', N).every(p => Math.abs(p.x - hq.x) === 3 && Math.abs(p.z - hq.z) === 3)).toBe(true);
    }
  });

  it('lays a built HQ out inside its cleared block, turrets on the block corners', () => {
    const hq = { x: 39, z: 15 };
    for (const p of all(hq)) expect(p.x % 6 !== 0 && p.z % 6 !== 0 && Math.floor(p.x / 6) === 6 && Math.floor(p.z / 6) === 2).toBe(true);
    expect(hqPads(hq, 'turret', N).map(key).sort()).toEqual(['37,13', '37,17', '41,13', '41,17']);
  });

  it('knows which structures take which pads, and which pads are free', () => {
    expect(padKindOf('armor')).toBe('building');
    expect(padKindOf('aa_turret')).toBe('turret');
    expect(padKindOf('wall_tier1')).toBeNull();
    const s = (id: string, type: StructureData['type'], x: number, z: number, extra: Partial<StructureData> = {}): StructureData => ({
      id, type, team: 'blue', gridPos: { x, z }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 100, maxHealth: 100, ...extra,
    });
    const hq = s('hq', 'hq', 4, 4);
    expect(freePadsFor('infantry', [hq, s('b', 'infantry', 7, 4)], 'blue', N)).toHaveLength(5);
    expect(freePadsFor('wall_tier1', [hq], 'blue', N)).toBeNull();
    // A fallen HQ's pads are gone.
    expect(freePadsFor('infantry', [{ ...hq, health: 0 }], 'blue', N)).toEqual([]);
  });
});

describe('the middle of a base', () => {
  const hqAt = (id: string, team: 'blue' | 'red', x: number, z: number) =>
    ({ id, type: 'hq', team, gridPos: { x, z }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 1, maxHealth: 1 }) as StructureData;
  const hqs = [hqAt('a', 'blue', 4, 4), hqAt('b', 'blue', 21, 4), hqAt('c', 'red', 6, 3)];

  it('is the side\'s nearest Command HQ', () => {
    expect(baseCentreOf({ x: 1, z: 3 }, hqs, 'blue')).toEqual({ x: 4, z: 4 });
    expect(baseCentreOf({ x: 19, z: 6 }, hqs, 'blue')).toEqual({ x: 21, z: 4 });
    expect(baseCentreOf({ x: 1, z: 3 }, [], 'blue')).toBeNull();
  });

  it('is where every base building on an HQ\'s pads faces', () => {
    const hq = TEAM_BASES.blue;
    // Models face +Z; a turn of t points them along (sin t, cos t).
    for (const pad of hqPads(hq, 'building', N)) {
      const t = facingBase(pad, hq);
      const [fx, fz] = [Math.round(Math.sin(t)), Math.round(Math.cos(t))];
      expect(Math.abs(fx) + Math.abs(fz)).toBe(1);
      // A step forward brings it nearer the HQ.
      expect(Math.hypot(pad.x + fx - hq.x, pad.z + fz - hq.z)).toBeLessThan(Math.hypot(pad.x - hq.x, pad.z - hq.z));
    }
  });

  it('is the side new units come out on', () => {
    const open = () => true;
    // A building west of its HQ: out on its east side, toward the HQ.
    expect(spawnTile({ x: 1, z: 4 }, { x: 4, z: 4 }, open)).toEqual({ x: 2, z: 4 });
    expect(spawnTile({ x: 4, z: 7 }, { x: 4, z: 4 }, open)).toEqual({ x: 4, z: 6 });
    // The nearest ring still comes first, the inside of it where free.
    expect(spawnTile({ x: 1, z: 4 }, { x: 4, z: 4 }, (x, z) => x !== 2)).toEqual({ x: 1, z: 3 });
    expect(spawnTile({ x: 1, z: 4 }, { x: 4, z: 4 }, (x, z) => Math.max(Math.abs(x - 1), Math.abs(z - 4)) > 1)).toEqual({ x: 3, z: 4 });
    expect(spawnTile({ x: 1, z: 4 }, null, open)).toEqual({ x: 0, z: 3 });
    expect(spawnTile({ x: 1, z: 4 }, { x: 4, z: 4 }, () => false)).toEqual({ x: 1, z: 4 });
  });
});
