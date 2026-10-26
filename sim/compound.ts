// The starting bases' walls and blast gates as things that can be fought over.
//
// Each starting base is ringed by a wall with a gate wherever a road crosses it (sim/mapgen.ts
// baseCompound). Every wall tile and every gate is a structure of the base's side with health:
// - A wall tile ('base_wall') blocks everyone, like any structure. Destroyed, its tile is open
//   ground and anyone can go through the breach. The corner towers are wall tiles too, tougher.
// - A gate ('base_gate') lets its own side through: path planning treats it as open road, and the
//   gate rolls down into the ground as they cross (components/BaseCompound.tsx). The other side's
//   ground units stop in front of a standing gate and can't go on until it is destroyed; standing
//   there, they shoot it like any enemy structure in range (sim/combat.ts).
// Neither is ever repaired, built, dismantled or clicked. Aircraft fly over both. So the wall is a
// layer of defence that holds an early rush at the gates for a while, not a way to seal a base.

import { STRUCTURE_INFO } from '../constants';
import type { StructureData, StructureType } from '../types';
import type { GridPos, Team } from './commands';
import type { BaseWall } from './mapgen';

export const COMPOUND = {
  // A corner tower stands longer than a plain length of wall.
  cornerHealth: 3000,
};

export const isCompoundPiece = (type: StructureType) => type === 'base_wall' || type === 'base_gate';

const tileKey = (x: number, z: number) => `${x},${z}`;

// The wall and gate structures for both starting bases, at full health. Each piece belongs to
// the side whose base it rings: blue's on its half of the map, red's on the other.
export function compoundStructures(walls: readonly BaseWall[], gates: readonly GridPos[], gridSize: number): StructureData[] {
  const centre = (gridSize - 1) / 2;
  const teamOf = (p: GridPos): Team => (p.x + p.z < 2 * centre ? 'blue' : 'red');
  const piece = (type: 'base_wall' | 'base_gate', at: GridPos, health: number): StructureData => ({
    id: `${type === 'base_wall' ? 'wall' : 'gate'}-${at.x}-${at.z}`, type, team: teamOf(at), gridPos: { ...at },
    isBlueprint: false, constructionProgress: 0, maxProgress: 0, health, maxHealth: health,
  });
  return [
    ...walls.map(w => piece('base_wall', w.at, w.runs === 'corner' ? COMPOUND.cornerHealth : STRUCTURE_INFO.base_wall.maxHealth)),
    ...gates.map(g => piece('base_gate', g, STRUCTURE_INFO.base_gate.maxHealth)),
  ];
}

// The wall tiles, which are open ground once their wall is gone (the map itself never counts
// them as road: sim/mapgen.ts).
export const compoundGround = (walls: readonly BaseWall[]) => walls.map(w => tileKey(w.at.x, w.at.z));

// Whether a structure on a tile blocks path planning: everything but a gate, which its own side
// drives through and the other side has to break.
export const blocksPath = (s: Pick<StructureData, 'type'>) => s.type !== 'base_gate';

// The standing gates by tile, worked out once per structures list.
const gatesOf = new WeakMap<readonly StructureData[], Map<string, Team>>();
function standingGates(structures: readonly StructureData[]) {
  let gates = gatesOf.get(structures);
  if (!gates) {
    gates = new Map();
    for (const s of structures) if (s.type === 'base_gate' && s.health > 0) gates.set(tileKey(s.gridPos.x, s.gridPos.z), s.team);
    gatesOf.set(structures, gates);
  }
  return gates;
}

// A standing gate of the other side on `tile` ("x,z"): a ground unit of `team` can't step onto it.
export function hostileGateAt(structures: readonly StructureData[], team: string | undefined, tile: string): boolean {
  const owner = standingGates(structures).get(tile);
  return owner !== undefined && owner !== team;
}

// Whether a ground unit of `team` headed for `path[0]` is held at a gate.
export const heldAtGate = (structures: readonly StructureData[], team: string | undefined, path: readonly string[]) =>
  path.length > 0 && hostileGateAt(structures, team, path[0]);
