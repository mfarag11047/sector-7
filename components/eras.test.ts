import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtAt } from '../sim/districts';
import { ARC_STEPS, CORNER, eraStackOf, outline, RETROFIT_ERA, retrofitTile, type EraStack } from './eras';

const N = CITY_CONFIG.gridSize, last = N - 1;
const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const prints = new Map(city.buildings.filter(b => b.footprint).map(b => [`${b.footprint!.x},${b.footprint!.z}`, b]));
const all = [...prints.values()];
const twinOf = (f: NonNullable<(typeof all)[number]['footprint']>) => prints.get(`${last - (f.x + f.w - 1)},${last - (f.z + f.d - 1)}`)!;

describe('era stacks', () => {
  it('are the same for a building and its twin across the map, retrofit tile and all', () => {
    for (const b of all) {
      const twin = twinOf(b.footprint!);
      expect(eraStackOf(twin)).toEqual(eraStackOf(b));
      const r = retrofitTile(b.footprint!), t = retrofitTile(twin.footprint!);
      expect(t.replacesCrown).toBe(r.replacesCrown);
      if (r.replacesCrown) continue;
      // Mirrored: the twin's tile is the same corner seen from the other side.
      expect([t.lx, t.lz]).toEqual([b.footprint!.w - 1 - r.lx, b.footprint!.d - 1 - r.lz]);
    }
  });

  it('leave the corporate towers pristine', () => {
    for (const b of all.filter(b => b.type === 'commercial')) expect(eraStackOf(b)).toBeNull();
  });

  it('only ever layer newer on older, and build each era its own corners', () => {
    const stacks = all.map(b => eraStackOf(b)).filter((s): s is EraStack => !!s);
    expect(stacks.length).toBeGreaterThan(100);
    for (const s of stacks) {
      expect(s.frontage).toBeGreaterThanOrEqual(s.bones);
      expect(s.body).toBeGreaterThanOrEqual(s.bones);
      if (s.roof !== null) expect(s.roof).toBeGreaterThanOrEqual(s.bones);
      expect(s.retrofit === null).toBe(s.roof === null);
      if (s.retrofit) expect(RETROFIT_ERA[s.retrofit]).toBe(s.roof);
      if (s.corner !== 'square') expect(s.corner).toBe(CORNER[s.bones]);
      if (s.mismatch) expect([s.bones, s.body, s.frontage]).toEqual([1, 1, 3]);
    }
    // Every era shows up somewhere, and every corner.
    expect(new Set(stacks.map(s => s.bones))).toEqual(new Set([1, 2, 3]));
    expect(new Set(stacks.map(s => s.corner))).toEqual(new Set(['square', 'round', 'chamfer']));
    expect(stacks.some(s => s.mismatch)).toBe(true);
  });

  it('get older toward the edge of the map and newer toward the middle', () => {
    const mean = (district: string) => {
      const s = all.filter(b => districtAt(b.footprint!.x, b.footprint!.z, N) === district).map(b => eraStackOf(b)!).filter(Boolean);
      return s.reduce((a, x) => a + x.bones, 0) / s.length;
    };
    expect(mean('fringe')).toBeLessThan(mean('outskirts'));
    expect(mean('outskirts')).toBeLessThan(mean('midtown'));
  });

  it('put the retrofit on a corner tile clear of the middle one on bigger buildings', () => {
    for (const b of all) {
      const f = b.footprint!, r = retrofitTile(f);
      if (f.w * f.d <= 2) { expect(r.replacesCrown).toBe(true); continue; }
      expect(r.replacesCrown).toBe(false);
      expect([r.lx, r.lz]).not.toEqual([Math.floor((f.w - 1) / 2), Math.floor((f.d - 1) / 2)]);
    }
  });
});

describe('corners', () => {
  const r = { x0: -5, x1: 5, z0: -4, z1: 4 };
  const area = (p: [number, number][]) => Math.abs(p.reduce((a, [x, z], i) => { const [x2, z2] = p[(i + 1) % p.length]; return a + x * z2 - x2 * z; }, 0)) / 2;

  it('leave a square corner square', () => {
    expect(outline(r, { nw: 2 }, 'square')).toEqual([[-5, -4], [5, -4], [5, 4], [-5, 4]]);
  });

  it('cut a chamfer across at 45 degrees from both walls, only where asked', () => {
    const p = outline(r, { nw: 2, se: 1 }, 'chamfer');
    expect(p).toHaveLength(6);
    expect(p[0][0]).toBeCloseTo(-5); expect(p[0][1]).toBeCloseTo(-2);
    expect(p[1][0]).toBeCloseTo(-3); expect(p[1][1]).toBeCloseTo(-4);
    // Two triangles off the corners: 2x2/2 and 1x1/2.
    expect(area(p)).toBeCloseTo(80 - 2 - 0.5);
  });

  it('round a corner along a quarter circle', () => {
    const p = outline(r, { ne: 3 }, 'round');
    expect(p).toHaveLength(3 + ARC_STEPS + 1);
    // Every point on the arc is 3 from its centre, 3 in from both walls.
    for (const [x, z] of p.slice(1, ARC_STEPS + 2)) expect(Math.hypot(x - 2, z + 1)).toBeCloseTo(3);
    // Close to the area of a quarter circle cut from a 3x3 corner.
    expect(area(p)).toBeGreaterThan(80 - 9 + (Math.PI * 9) / 4 - 0.2);
    expect(area(p)).toBeLessThan(80 - 9 + (Math.PI * 9) / 4 + 0.01);
  });
});
