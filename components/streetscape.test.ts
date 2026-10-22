import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtOfTile, DISTRICT_THEMES } from './districtTheme';
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
