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

// Which ends of a finished Bulwark Wall meet another running the same way, so the model draws them
// clicked together with no gap (components/models/BulwarkWallModel.tsx). The model is built along
// +x and turned a quarter for a wall running along z, which carries its +x end to -z: `start` is
// the -x (along z, the +z) neighbour, `end` the +x (-z) one.
export interface WallJoins { start: boolean; end: boolean }
const JOINS: Record<string, WallJoins> = {
  '00': { start: false, end: false }, '10': { start: true, end: false }, '01': { start: false, end: true }, '11': { start: true, end: true },
};
export function bulwarkJoins(wall: StructureData, structures: readonly StructureData[]): WallJoins {
  const run = wall.wallRun ?? 'x';
  const meets = (dx: number, dz: number) => structures.some(s =>
    s.type === 'wall_tier2' && !s.isBlueprint && s.team === wall.team && (s.wallRun ?? 'x') === run &&
    s.gridPos.x === wall.gridPos.x + dx && s.gridPos.z === wall.gridPos.z + dz);
  const [start, end] = run === 'x' ? [meets(-1, 0), meets(1, 0)] : [meets(0, 1), meets(0, -1)];
  return JOINS[`${start ? 1 : 0}${end ? 1 : 0}`];
}
