import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtOfTile } from './districtTheme';
import { industrialYardLayout } from './IndustrialYard';

const { gridSize, tileSize } = CITY_CONFIG;
const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const layout = industrialYardLayout(city.roadTiles, city.buildings, gridSize)!;
const open = new Set(city.roadTiles.filter(t => t.type === 'open').map(t => `${t.x},${t.z}`));
const road = new Set(city.roadTiles.filter(t => t.type !== 'open').map(t => `${t.x},${t.z}`));
const shedAt = new Map(city.buildings.filter(b => b.type === 'industrial' && b.footprint).map(b => [`${b.gridX},${b.gridZ}`, b]));

describe('industrial yards', () => {
  it('runs each track from a shed door through the open yard and out to a street', () => {
    expect(layout.tracks.length).toBeGreaterThan(8);
    for (const track of layout.tracks) {
      const [face, ...rest] = track;
      const end = rest.pop()!;
      // Starts on a shed wall, goes tile to tile through open yard, ends on a street edge.
      const wallTiles = [[Math.floor(face.x), Math.floor(face.z)], [Math.ceil(face.x), Math.ceil(face.z)]].map(([x, z]) => `${x},${z}`);
      expect(wallTiles.some(k => shedAt.has(k))).toBe(true);
      for (const t of rest) {
        expect(open.has(`${t.x},${t.z}`)).toBe(true);
        expect(districtOfTile(t.x, t.z, gridSize)).toBe('industrial');
      }
      for (let i = 1; i < rest.length; i++) expect(Math.abs(rest[i].x - rest[i - 1].x) + Math.abs(rest[i].z - rest[i - 1].z)).toBe(1);
      const out = `${Math.round(2 * end.x - rest[rest.length - 1].x)},${Math.round(2 * end.z - rest[rest.length - 1].z)}`;
      expect(road.has(out)).toBe(true);
    }
  });

  it('stripes the yard edges onto the street, leaving a gate where each track leaves', () => {
    expect(layout.stripes.length).toBeGreaterThan(40);
    const step = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] } as const;
    for (const s of layout.stripes) {
      expect(open.has(`${s.x},${s.z}`)).toBe(true);
      expect(road.has(`${s.x + step[s.side][0]},${s.z + step[s.side][1]}`)).toBe(true);
    }
    for (const track of layout.tracks) {
      const last = track[track.length - 2], end = track[track.length - 1];
      const side = end.x > last.x ? 'e' : end.x < last.x ? 'w' : end.z > last.z ? 's' : 'n';
      expect(layout.stripes.some(s => s.x === last.x && s.z === last.z && s.side === side)).toBe(false);
    }
  });

  it('drops oil at every door and now and then elsewhere', () => {
    expect(layout.stains.length).toBeGreaterThan(layout.tracks.length);
  });
});
