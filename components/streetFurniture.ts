// Everyday rulers (drawn by StreetFurniture.tsx): things everyone knows the size of, set on the
// pavement at the foot of the tall buildings, so the towers read as huge against them.
//
//   bench     a slatted street bench, facing the road
//   vending   a vending machine against the kerb, its front lit
//   dumpster  a skip with its lid half up
//   bollards  a short row of bollards along the kerb
//
// Beside the corporate towers of the core and downtown: benches and bollards, now and then a
// vending machine. Beside the other tall buildings (the district centerpieces and the tallest of
// midtown): benches, vending machines and dumpsters. Only on streets with pavements, a piece or
// two to each stretch of pavement along a tall building. Laid out from the map, the same every
// time. Scenery only. Pure, for testing.

import type { BuildingData, RoadTileData } from '../types';
import { themeOfTile } from './districtTheme';
import { districtAt } from '../sim/districts';

export type FurnitureKind = 'bench' | 'vending' | 'dumpster' | 'bollards';
// A piece in tile coordinates (a tile's centre at its whole x, z), turned so its front faces the
// road (`turn`: radians about y, 0 facing +z).
export interface Furniture { kind: FurnitureKind; x: number; z: number; turn: number }

export const RULERS = {
  // Buildings at least this tall get furniture at their foot.
  minHeight: 34,
  // How far out from the road tile's centre toward the building the pavement pieces stand.
  out: 0.4,
};

const ODDS: Record<'corporate' | 'street', [FurnitureKind | null, number][]> = {
  corporate: [['bench', 0.4], ['bollards', 0.35], ['vending', 0.1], [null, 0.15]],
  street: [['bench', 0.3], ['vending', 0.3], ['dumpster', 0.25], [null, 0.15]],
};

const hash = (x: number, z: number, salt: number) => { const v = Math.sin(x * 97.13 + z * 41.77 + salt * 13.31) * 31337.77; return v - Math.floor(v); };
const pick = (r: number, odds: [FurnitureKind | null, number][]) => {
  for (const [k, share] of odds) { if (r < share) return k; r -= share; }
  return null;
};

export function streetFurniture(tiles: readonly RoadTileData[], buildings: readonly BuildingData[], gridSize: number): Furniture[] {
  const tall = new Map<number, BuildingData>();
  for (const b of buildings) if (b.scale[1] >= RULERS.minHeight) tall.set(b.gridX * 4096 + b.gridZ, b);
  const out: Furniture[] = [];
  for (const t of tiles) {
    if ((t.type !== 'main' && t.type !== 'street') || !themeOfTile(t.x, t.z, gridSize).sidewalks) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const b = tall.get((t.x + dx) * 4096 + (t.z + dz));
      if (!b) continue;
      const district = districtAt(t.x + dx, t.z + dz, gridSize);
      const odds = ODDS[district === 'core' || district === 'downtown' ? 'corporate' : 'street'];
      // Facing the road: away from the building.
      const turn = Math.atan2(-dx, -dz);
      const salt = dx * 3 + dz * 7;
      for (const [slot, along] of [[0, -0.22], [1, 0.22]] as [number, number][]) {
        const kind = pick(hash(t.x, t.z, salt + slot * 11), odds);
        if (!kind) continue;
        out.push({ kind, x: t.x + dx * RULERS.out + (dz !== 0 ? along : 0), z: t.z + dz * RULERS.out + (dx !== 0 ? along : 0), turn });
      }
    }
  }
  return out;
}
