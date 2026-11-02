// District centerpieces: one landmark building in midtown and one in the industrial zone on each
// side of the map, each a mass that stands out from across the city and is just as recognisable
// at its front door (drawn by components/FootprintBuilding.tsx, styled in
// components/centerpieceLooks.ts).
//
//   megablock  midtown: a 62-high block of housing on a 3x3 footprint, narrow at its foot and
//              swelling out over the street above, clad from the pavement to the roof in crimson
//              and slate panels, its district number lit huge near the top and again over its
//              entrances
//   liftblock  industrial: a 40-high block on a 5x3 footprint lifted on concrete pylons over a
//              narrow core, pale concrete with blue panels and stripes, a tower of stacked
//              modules rising out of its middle to 66
//
// They're ordinary city buildings in the game, captured and destroyed tile by tile like any
// other; only their heights differ (set here, so shots and missiles meet them where they're
// drawn). Tall enough to stand out over their districts and seen from across the map, but kept
// below the corporate core's towers so the camera can still be brought down low over them.
// Placed on blue's side and mirrored to red's, so the map stays fair.

import type { BuildingData } from '../types';

export type CenterpieceKind = 'megablock' | 'liftblock';
export interface Centerpiece {
  kind: CenterpieceKind;
  // The footprint on blue's side of the map.
  x: number;
  z: number;
  w: number;
  d: number;
  height: number;
  // A tower rising out of it, by tile within the footprint (on blue's side), and its height.
  tower?: { lx: number; lz: number; height: number };
}

export const CENTERPIECES: Centerpiece[] = [
  { kind: 'megablock', x: 31, z: 19, w: 3, d: 3, height: 62 },
  { kind: 'liftblock', x: 19, z: 13, w: 5, d: 3, height: 40, tower: { lx: 2, lz: 1, height: 66 } },
];

type Footprint = Pick<NonNullable<BuildingData['footprint']>, 'x' | 'z' | 'w' | 'd'>;

// The centerpiece a footprint is, if any, with its tower's tile (in tiles from the footprint's
// corner) turned round for the twin on red's side.
export function centerpieceOf(f: Footprint, gridSize: number): (Centerpiece & { twin: boolean }) | null {
  const last = gridSize - 1;
  for (const c of CENTERPIECES) {
    if (c.w !== f.w || c.d !== f.d) continue;
    if (c.x === f.x && c.z === f.z) return { ...c, twin: false };
    if (last - (c.x + c.w - 1) === f.x && last - (c.z + c.d - 1) === f.z) {
      return { ...c, twin: true, tower: c.tower && { ...c.tower, lx: c.w - 1 - c.tower.lx, lz: c.d - 1 - c.tower.lz } };
    }
  }
  return null;
}

// A centerpiece's height at one of its tiles.
export function centerpieceHeight(c: Centerpiece, lx: number, lz: number): number {
  return c.tower && c.tower.lx === lx && c.tower.lz === lz ? c.tower.height : c.height;
}
