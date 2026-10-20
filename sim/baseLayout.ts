// Where a base's structures go.
//
// Every Command HQ comes with a fixed set of building pads: six for base buildings (Barracks,
// Factory, Airpad, Comm Link, Ordnance Fab, Depot, in any mix) and four for turrets, one on each
// corner of its block. Nothing else in the base can be built on. So a side that wants more
// production than six structures has to build another Command HQ (sim/bases.ts), which brings six
// more pads and four more turret corners of its own.
//
// The starting HQs sit on a paved 7x7 square; the pads ring the HQ on it, clear of the two roads
// that cross the square, with the turrets on its corners. An HQ built later sits in the middle of
// a cleared 5x5 city block; its pads ring the HQ inside the block, turrets on the block's corners.
// Both layouts are mirrored between the two sides, so neither base is better laid out.

import type { StructureData, StructureType } from '../types';
import type { GridPos, Team } from './commands';

// Production and tech structures: these take the six base pads.
export const BASE_BUILDINGS: readonly StructureType[] = ['infantry', 'armor', 'air', 'support', 'ordnance_fab', 'builder'];
// Turrets: these take the four corner pads.
export const BASE_TURRETS: readonly StructureType[] = ['defense', 'aa_turret'];

export const BUILDING_PADS = 6;
export const TURRET_PADS = 4;

export type PadKind = 'building' | 'turret';
export const padKindOf = (type: StructureType): PadKind | null =>
  BASE_BUILDINGS.includes(type) ? 'building' : BASE_TURRETS.includes(type) ? 'turret' : null;

// Offsets from a starting HQ, written for the HQ in the top-left corner of the map and turned to
// face the centre for the other.
const START = {
  building: [[-1, -3], [1, -3], [-3, -1], [-3, 1], [3, 0], [0, 3]],
  turret: [[-3, -3], [3, -3], [-3, 3], [3, 3]],
};
// Offsets from an HQ in the middle of a cleared block (its pad is the centre 3x3).
const BLOCK = {
  building: [[-1, -2], [1, -2], [-1, 2], [1, 2], [-2, 0], [2, 0]],
  turret: [[-2, -2], [2, -2], [-2, 2], [2, 2]],
};

const STRIDE = 6;
// HQs built on a cleared block stand at its centre; the starting ones don't.
const atBlockCentre = (p: GridPos) => ((p.x % STRIDE) + STRIDE) % STRIDE === 3 && ((p.z % STRIDE) + STRIDE) % STRIDE === 3;

// The pads of an HQ standing at `hq`, on a map `gridSize` tiles across.
export function hqPads(hq: GridPos, kind: PadKind, gridSize: number): GridPos[] {
  if (atBlockCentre(hq)) return BLOCK[kind].map(([dx, dz]) => ({ x: hq.x + dx, z: hq.z + dz }));
  const centre = (gridSize - 1) / 2;
  const sx = hq.x <= centre ? 1 : -1;
  const sz = hq.z <= centre ? 1 : -1;
  return START[kind].map(([dx, dz]) => ({ x: hq.x + sx * dx, z: hq.z + sz * dz }));
}

// A side's Command HQs that are standing and finished.
export const workingHqs = (structures: readonly StructureData[], team: Team) =>
  structures.filter(s => s.type === 'hq' && s.team === team && s.health > 0 && !((s.buildRemainingMs ?? 0) > 0));

export interface Pad { at: GridPos; hqId: string; taken: boolean }

// Every pad of a kind across a side's working HQs, and whether something already stands on it.
export function teamPads(structures: readonly StructureData[], team: Team, kind: PadKind, gridSize: number): Pad[] {
  return workingHqs(structures, team).flatMap(hq => hqPads(hq.gridPos, kind, gridSize).map(at => ({
    at, hqId: hq.id, taken: structures.some(s => s.type !== 'hq' && s.gridPos.x === at.x && s.gridPos.z === at.z),
  })));
}

// The free pads a structure of this type could go on, or null if it doesn't use pads (walls).
export function freePadsFor(type: StructureType, structures: readonly StructureData[], team: Team, gridSize: number): GridPos[] | null {
  const kind = padKindOf(type);
  if (!kind) return null;
  return teamPads(structures, team, kind, gridSize).filter(p => !p.taken).map(p => p.at);
}

export const isPad = (at: GridPos, pads: readonly GridPos[]) => pads.some(p => p.x === at.x && p.z === at.z);
