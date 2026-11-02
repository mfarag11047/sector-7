// The estates' grounds (drawn by EstateGrounds.tsx): the synthetic nature the very rich keep round
// their villas, on the open ground of the estates district (sim/districts.ts).
//
//   palms   rows of palms along the streets, clumps of them in the gardens, each leaning a little
//   hedges  low clipped hedges along every garden's street edge
//   pools   pools set in the lawns, lit from inside
//
// The ground right round each core node is kept clear, so the objective stays plain to see.
// Laid out per tile and mirrored to its twin across the map, so both estates are the same.
// Scenery only. Pure, for testing.

import type { BuildingData, RoadTileData } from '../types';
import { districtAt } from '../sim/districts';

export interface Palm { x: number; z: number; height: number; lean: number; turn: number }
export interface Hedge { x: number; z: number; length: number; alongX: boolean }
export interface Pool { x: number; z: number; w: number; d: number }
export interface EstateGrounds { palms: Palm[]; hedges: Hedge[]; pools: Pool[] }

export const GROUNDS = {
  // Tiles this close (in tiles, either way) to a core node stay clear.
  nodeClear: 1,
  // The odds of a palm on a street edge, of a pool in a garden tile, and of a clump of palms in
  // one with no pool.
  edgePalm: 0.6,
  pool: 0.4,
  clump: 0.6,
};

const hash = (x: number, z: number, salt: number) => { const v = Math.sin(x * 73.17 + z * 191.3 + salt * 29.71) * 47453.1; return v - Math.floor(v); };

export function estateGrounds(tiles: readonly RoadTileData[], buildings: readonly BuildingData[], gridSize: number): EstateGrounds {
  const last = gridSize - 1;
  const out: EstateGrounds = { palms: [], hedges: [], pools: [] };
  const nodes = buildings.filter(b => b.type === 'core_node');
  const nearNode = (x: number, z: number) => nodes.some(n => Math.max(Math.abs(n.gridX - x), Math.abs(n.gridZ - z)) <= GROUNDS.nodeClear);
  // Each item laid out for a tile and, turned round, for its twin.
  const emit = (t: RoadTileData, place: (x: number, z: number, sign: 1 | -1) => void) => {
    place(t.x, t.z, 1);
    place(last - t.x, last - t.z, -1);
  };
  for (const t of tiles) {
    if (t.type !== 'open' || districtAt(t.x, t.z, gridSize) !== 'estates' || nearNode(t.x, t.z)) continue;
    // One of each pair of twins lays out both.
    if (t.x + t.z > last || (t.x + t.z === last && t.x > t.z)) continue;
    const r = (salt: number) => hash(t.x, t.z, salt);
    const streets = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).filter(([dx, dz]) => districtAt(t.x + dx, t.z + dz, gridSize) === null);
    if (streets.length) {
      streets.forEach(([dx, dz], i) => {
        const alongX = dz !== 0;
        emit(t, (x, z, s) => out.hedges.push({ x: x + s * dx * 0.38, z: z + s * dz * 0.38, length: 0.85, alongX }));
        if (r(10 + i) < GROUNDS.edgePalm) {
          const along = (r(20 + i) - 0.5) * 0.6;
          const height = 9 + r(30 + i) * 5, lean = 0.05 + r(40 + i) * 0.12, turn = r(50 + i) * Math.PI * 2;
          emit(t, (x, z, s) => out.palms.push({ x: x + s * (dx * 0.25 + (alongX ? along : 0)), z: z + s * (dz * 0.25 + (alongX ? 0 : along)), height, lean, turn: turn + (s < 0 ? Math.PI : 0) }));
        }
      });
    } else if (r(1) < GROUNDS.pool) {
      const alongX = r(2) < 0.5;
      const w = 0.55 + r(3) * 0.2, d = 0.32 + r(4) * 0.12;
      emit(t, (x, z) => out.pools.push({ x, z, w: alongX ? w : d, d: alongX ? d : w }));
    } else if (r(5) < GROUNDS.clump) {
      const n = 2 + Math.floor(r(6) * 2);
      for (let i = 0; i < n; i++) {
        const ox = (r(60 + i) - 0.5) * 0.7, oz = (r(70 + i) - 0.5) * 0.7;
        const height = 8 + r(80 + i) * 6, lean = 0.08 + r(90 + i) * 0.15, turn = r(100 + i) * Math.PI * 2;
        emit(t, (x, z, s) => out.palms.push({ x: x + s * ox, z: z + s * oz, height, lean, turn: turn + (s < 0 ? Math.PI : 0) }));
      }
    }
  }
  return out;
}
