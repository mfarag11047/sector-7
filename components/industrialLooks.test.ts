import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { industrialLookOf } from './industrialLooks';
import { industrialGantries } from './IndustrialGantries';

const city = generateCity({ gridSize: CITY_CONFIG.gridSize, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const sheds = new Map(city.buildings.filter(b => b.type === 'industrial' && b.footprint).map(b => [`${b.footprint!.x},${b.footprint!.z}`, b.footprint!]));

describe('industry', () => {
  it('dresses each building like its twin, with every style and roof in use and the big halls as plants', () => {
    for (const f of sheds.values()) {
      const twin = sheds.get(`${78 - (f.x + f.w - 1)},${78 - (f.z + f.d - 1)}`)!;
      expect(industrialLookOf(twin)).toEqual(industrialLookOf(f));
      if (f.w * f.d >= 9) expect(industrialLookOf(f)).toMatchObject({ name: 'plant', crown: 'smokestack' });
    }
    const looks = [...sheds.values()].map(f => industrialLookOf(f));
    expect(new Set(looks.map(l => l.name))).toEqual(new Set(['plant', 'rustshed', 'warehouse']));
    expect(new Set(looks.map(l => l.crown))).toEqual(new Set(['smokestack', 'redtanks', 'vents', 'crane']));
  });

  it('runs pipe gantries over the gaps between facing buildings, mirrored', () => {
    const g = industrialGantries(city.buildings, CITY_CONFIG.gridSize);
    expect(g.length).toBeGreaterThan(40);
    const open = new Set(city.roadTiles.map(t => `${t.x},${t.z}`));
    for (const r of g) {
      expect(open.has(r.alongX ? `${r.x},${Math.round(r.z)}` : `${Math.round(r.x)},${r.z}`)).toBe(true);
      expect(g.some(t => t.x === 78 - r.x && t.z === 78 - r.z && t.alongX === r.alongX)).toBe(true);
    }
  });
});
