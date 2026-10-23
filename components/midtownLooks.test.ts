import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { complexOf, midtownLookOf, skyways } from './midtownLooks';

const city = generateCity({ gridSize: CITY_CONFIG.gridSize, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const blocks = city.buildings.filter(b => b.type === 'hightech' && b.footprint);
const prints = new Map(blocks.map(b => [`${b.footprint!.x},${b.footprint!.z}`, b]));

describe('midtown apartment blocks', () => {
  it('gives each building and its twin the same look, and varies them across the district', () => {
    const looks = new Set<string>();
    for (const b of prints.values()) {
      const f = b.footprint!;
      const twin = prints.get(`${78 - (f.x + f.w - 1)},${78 - (f.z + f.d - 1)}`)!;
      expect(midtownLookOf(twin.footprint!)).toEqual(midtownLookOf(f));
      const l = midtownLookOf(f);
      looks.add(`${l.name} ${l.massing} ${l.crown} ${l.shops}`);
    }
    expect(looks.size).toBeGreaterThan(12);
  });

  it('builds each apartment complex of matching buildings of one height, joined by sky walkways', () => {
    const complexes = new Map<string, typeof blocks>();
    for (const b of prints.values()) {
      const c = complexOf(b.footprint!);
      if (!c) continue;
      const k = `${c}:${b.footprint!.x + b.footprint!.z < 78}`;
      complexes.set(k, [...(complexes.get(k) ?? []), b]);
    }
    expect(complexes.size).toBe(6);
    for (const members of complexes.values()) {
      expect(members).toHaveLength(4);
      expect(new Set(members.map(b => JSON.stringify(midtownLookOf(b.footprint!)))).size).toBe(1);
      expect(new Set(members.map(b => b.height)).size).toBe(1);
    }
    const ways = skyways(city.buildings);
    expect(ways).toHaveLength(6 * 4);
    // Each spans an open alley tile, high above it.
    const open = new Set(city.roadTiles.map(t => `${t.x},${t.z}`));
    for (const w of ways) {
      const tile = w.alongX ? `${w.x},${Math.round(w.z)}` : `${Math.round(w.x)},${w.z}`;
      expect(open.has(tile), tile).toBe(true);
      expect(w.y).toBeGreaterThan(8);
    }
  });
});
