// Which way a buildable wall runs (Dragon's Teeth, Bulwark Wall).
//
// A wall fills its tile like any structure, but its barrier runs across the middle of the tile in
// one direction: along x or along z. The player picks it while placing (R rotates). A wall placed
// beside one of their walls snaps to join it, end to end, unless they rotate it away again.
//
// Pure: CityMap's placement preview and sim/orders.ts both use it.

import type { StructureData, StructureType } from '../types';
import type { GridPos, Team } from './commands';

export type WallRun = 'x' | 'z';

export const isBuildableWall = (type: StructureType) => type === 'wall_tier1' || type === 'wall_tier2';
export const otherRun = (run: WallRun): WallRun => (run === 'x' ? 'z' : 'x');

// The way a new wall at `at` should run to join the side's walls beside it, or null when there is
// nothing to join (the player's own choice stands). A neighbour already running toward the new
// tile wins: the new wall carries its line on. Failing that, the axis the neighbours lie on, when
// they all lie on one.
export function snapRun(at: GridPos, structures: readonly StructureData[], team: Team): WallRun | null {
  const wallAt = (x: number, z: number) => structures.find(s => s.team === team && isBuildableWall(s.type) && s.gridPos.x === x && s.gridPos.z === z);
  const along = { x: [wallAt(at.x - 1, at.z), wallAt(at.x + 1, at.z)].filter(Boolean) as StructureData[], z: [wallAt(at.x, at.z - 1), wallAt(at.x, at.z + 1)].filter(Boolean) as StructureData[] };
  const continuing = (['x', 'z'] as const).filter(run => along[run].some(w => (w.wallRun ?? 'x') === run));
  if (continuing.length === 1) return continuing[0];
  const touching = (['x', 'z'] as const).filter(run => along[run].length > 0);
  if (touching.length === 1) return touching[0];
  return continuing[0] ?? null;
}
