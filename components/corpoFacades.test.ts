import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { facadeOf } from './corpoFacades';

const city = generateCity({ gridSize: CITY_CONFIG.gridSize, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const towers = new Map(city.buildings.filter(b => b.type === 'commercial' && b.footprint).map(b => [`${b.footprint!.x},${b.footprint!.z}`, b.footprint!]));

describe('corporate tower facades', () => {
  it('dresses every tower in a style, the same as its twin across the map, every style used', () => {
    const names = new Set<string>();
    for (const f of towers.values()) {
      const twin = towers.get(`${78 - (f.x + f.w - 1)},${78 - (f.z + f.d - 1)}`)!;
      expect(twin).toBeDefined();
      expect(facadeOf(twin)).toEqual(facadeOf(f));
      names.add(facadeOf(f).name);
    }
    expect(names).toEqual(new Set(['monolith', 'goldscale', 'office', 'brutalist', 'ticker']));
  });

  it('mixes styles within each block', () => {
    const byBlock = new Map<string, Set<string>>();
    for (const f of towers.values()) {
      const k = `${Math.floor(f.x / 6)},${Math.floor(f.z / 6)}`;
      if (!byBlock.has(k)) byBlock.set(k, new Set());
      byBlock.get(k)!.add(facadeOf(f).name);
    }
    for (const [k, styles] of byBlock) if ([...towers.values()].filter(f => `${Math.floor(f.x / 6)},${Math.floor(f.z / 6)}` === k).length > 2) expect(styles.size, k).toBeGreaterThan(1);
  });

  it('never repeats a tower\'s silhouette within a block', () => {
    const byBlock = new Map<string, string[]>();
    for (const f of towers.values()) {
      const k = `${Math.floor(f.x / 6)},${Math.floor(f.z / 6)}`;
      const look = facadeOf(f);
      expect(look.massing, `${f.x},${f.z} is hand-picked`).toBeDefined();
      if (!byBlock.has(k)) byBlock.set(k, []);
      byBlock.get(k)!.push(`${f.w}x${f.d} ${look.massing} ${look.crown}`);
    }
    for (const [k, shapes] of byBlock) expect(new Set(shapes).size, k).toBe(shapes.length);
  });
});
