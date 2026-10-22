import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtOfTile, DISTRICT_THEMES, groundOfTile, roadPieceOf } from './districtTheme';
import { streetscapeLayout } from './Streetscape';

const { gridSize, tileSize } = CITY_CONFIG;
const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const layout = streetscapeLayout(city.roadTiles, gridSize);
const road = new Set(city.roadTiles.filter(t => t.type !== 'open').map(t => `${t.x},${t.z}`));

describe('streetscape', () => {
  it('puts sidewalks only in the districts that have them, on road edges facing a lot', () => {
    expect(layout.sidewalks.length).toBeGreaterThan(100);
    for (const w of layout.sidewalks) {
      expect(DISTRICT_THEMES[districtOfTile(w.x, w.z, gridSize)].sidewalks).toBe(true);
      expect(road.has(`${w.x},${w.z}`)).toBe(true);
      const [dx, dz] = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] }[w.side];
      expect(road.has(`${w.x + dx},${w.z + dz}`)).toBe(false);
    }
    // None in the industrial zone, the outskirts or the bases.
    expect(layout.sidewalks.some(w => ['industrial', 'outskirts', 'fringe', 'base'].includes(districtOfTile(w.x, w.z, gridSize)))).toBe(false);
  });

  it('marks crosswalks on the roads leading into downtown intersections', () => {
    expect(layout.crosswalks.length).toBeGreaterThan(20);
    for (const c of layout.crosswalks) expect(road.has(`${c.x},${c.z}`)).toBe(true);
  });

  it('is laid out the same from either side of the map', () => {
    const key = (x: number, z: number) => `${x},${z}`;
    const walked = new Set(layout.sidewalks.map(w => key(w.x, w.z)));
    const last = gridSize - 1;
    for (const w of layout.sidewalks) expect(walked.has(key(last - w.x, last - w.z))).toBe(true);
  });
});

describe('midtown courtyards', () => {
  it('paves the open ground along the street and grasses the middle of each block', () => {
    const open = city.roadTiles.filter(t => t.type === 'open' && districtOfTile(t.x, t.z, gridSize) === 'midtown');
    const styles = open.map(t => groundOfTile(t.x, t.z, gridSize));
    expect(styles.filter(s => s === 'lawn').length).toBeGreaterThan(50);
    expect(styles.filter(s => s === 'paving').length).toBeGreaterThan(50);
    for (const t of open) {
      const lot = (c: number) => c % 6;
      const edge = [lot(t.x), lot(t.z)].some(c => c === 1 || c === 5) || [t.x, t.z].some(c => Math.abs(c - 39) === 1);
      expect(groundOfTile(t.x, t.z, gridSize), `${t.x},${t.z}`).toBe(edge ? 'paving' : 'lawn');
      expect(groundOfTile(78 - t.x, 78 - t.z, gridSize)).toBe(groundOfTile(t.x, t.z, gridSize));
    }
    // Other districts keep their own ground.
    expect(['granite', 'plazaStone']).toContain(groundOfTile(27, 27, gridSize));
  });
});

describe('outskirts car parks', () => {
  it('lines the street side with walkways and fills the middle with parking, mirrored', () => {
    const open = city.roadTiles.filter(t => t.type === 'open' && districtOfTile(t.x, t.z, gridSize) === 'outskirts');
    const styles = open.map(t => groundOfTile(t.x, t.z, gridSize));
    expect(new Set(styles)).toEqual(new Set(['walkway', 'parking']));
    for (const t of open) {
      const edge = [t.x % 6, t.z % 6].some(c => c === 1 || c === 5) || [t.x, t.z].some(c => Math.abs(c - 39) === 1);
      expect(groundOfTile(t.x, t.z, gridSize) === 'walkway', `${t.x},${t.z}`).toBe(edge);
      expect(groundOfTile(78 - t.x, 78 - t.z, gridSize)).toBe(groundOfTile(t.x, t.z, gridSize));
    }
  });
});

describe('road pieces', () => {
  it('marks city streets in the middle districts and suburban ones further out, turned along their road', () => {
    expect(roadPieceOf(30, 27, 'street', gridSize)).toEqual({ piece: 'cityStraight', alongX: false });
    expect(roadPieceOf(27, 30, 'street', gridSize)).toEqual({ piece: 'cityStraight', alongX: true });
    expect(roadPieceOf(30, 30, 'street', gridSize)).toMatchObject({ piece: 'cityJunction' });
    expect(roadPieceOf(36, 9, 'street', gridSize)).toEqual({ piece: 'suburbStraight', alongX: false });
    expect(roadPieceOf(39, 21, 'main', gridSize)).toEqual({ piece: 'avenue', alongX: false });
    expect(roadPieceOf(21, 39, 'main', gridSize)).toEqual({ piece: 'avenue', alongX: true });
    // Same both sides of the map.
    for (const t of city.roadTiles.filter(t => t.type !== 'open')) {
      const a = roadPieceOf(t.x, t.z, t.type as 'main' | 'street', gridSize);
      const b = roadPieceOf(78 - t.x, 78 - t.z, t.type as 'main' | 'street', gridSize);
      expect(b.piece).toBe(a.piece);
      if (!a.piece.endsWith('Junction')) expect(b.alongX).toBe(a.alongX);
    }
  });
});
