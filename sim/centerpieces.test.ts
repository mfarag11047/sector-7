import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from './mapgen';
import { districtAt } from './districts';
import { CENTERPIECES, centerpieceOf } from './centerpieces';

const N = CITY_CONFIG.gridSize, last = N - 1;
const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const at = (x: number, z: number) => city.buildings.find(b => b.gridX === x && b.gridZ === z)!;

describe('district centerpieces', () => {
  it('stand where the city plan has a building of their footprint, in their district, on both sides', () => {
    expect(districtAt(CENTERPIECES[0].x, CENTERPIECES[0].z, N)).toBe('midtown');
    expect(districtAt(CENTERPIECES[1].x, CENTERPIECES[1].z, N)).toBe('industrial');
    for (const c of CENTERPIECES) {
      for (const [x, z] of [[c.x, c.z], [last - (c.x + c.w - 1), last - (c.z + c.d - 1)]]) {
        const b = at(x, z);
        expect(b.footprint).toMatchObject({ x, z, w: c.w, d: c.d });
        expect(centerpieceOf(b.footprint!, N)?.kind).toBe(c.kind);
      }
    }
  });

  it('are taller than anything else in their district, the same height as their twin tile for tile', () => {
    for (const c of CENTERPIECES) {
      const district = districtAt(c.x, c.z, N);
      const others = city.buildings.filter(b => b.footprint && districtAt(b.gridX, b.gridZ, N) === district && !centerpieceOf(b.footprint, N));
      const tallest = Math.max(...others.map(b => b.scale[1]));
      for (let lx = 0; lx < c.w; lx++) for (let lz = 0; lz < c.d; lz++) {
        const b = at(c.x + lx, c.z + lz), twin = at(last - (c.x + lx), last - (c.z + lz));
        expect(b.scale[1]).toBeGreaterThan(tallest * 1.5);
        expect(twin.scale[1]).toBe(b.scale[1]);
      }
    }
  });

  it('raise the tower out of the middle of the lifted block, on both sides', () => {
    const c = CENTERPIECES[1];
    const blue = at(c.x, c.z).footprint!, red = at(last - (c.x + c.w - 1), last - (c.z + c.d - 1)).footprint!;
    expect(blue.tower).toEqual({ x: c.x + 2, z: c.z + 1 });
    expect(red.tower).toEqual({ x: last - (c.x + 2), z: last - (c.z + 1) });
    expect(at(blue.tower!.x, blue.tower!.z).scale[1]).toBe(c.tower!.height);
  });
});
