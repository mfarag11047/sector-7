// How each district centerpiece (sim/centerpieces.ts) looks: drawn by FootprintBuilding.tsx with
// the kit every city building uses, set up here.
//
// Each follows the ground-floor rule: what makes it recognisable from across the map runs all
// the way down to its front door, so it's as plain a landmark from the street as from the sky.
//   megablock  housing over midtown: narrow at its foot and swelling out over the street a
//              third of the way up, chamfered corners, clad from the pavement to the roof in big
//              crimson and slate panels, holo billboards on its faces, its number lit huge near
//              the top of every face and again over the entrance in the middle of each
//   liftblock  industry's: a block lifted on concrete pylons over a narrow core, pale concrete
//              with blue panels and blue stripes painted round it every few storeys, its code
//              stencilled big on its front, blue loading doors in the core at street level, and
//              a tower of stacked chamfered modules rising out of its middle, the same stripes
//              on it
// Both carry plant on the corners of their roofs, and their panels are twice the usual size.
// Colours keep to the scenery palette (scenePalette.ts): no cyan, amber, white or green.

import type { CenterpieceKind } from '../sim/centerpieces';
import type { Crown, FacadeName } from './corpoFacades';
import { SCENE } from './scenePalette';
import type { RoofPiece } from './Retrofits';

export interface CenterpieceLook {
  windows: FacadeName;
  body: string;
  accent: string;
  crown: Crown;
  // Massing, as MASSING_STEPS: [share of height, steps in (negative: out)] from the ground up;
  // the tower's own, if it has one.
  steps: [number, number][];
  towerSteps?: [number, number][];
  corner: 'chamfer' | 'square';
  // Panel cladding over every face, ground to roof: [panel, accent panel].
  cladding: [string, string];
  // A number lit huge near the top of each face and again over each entrance.
  number?: string;
  // A code stencilled big on its front.
  stencil?: string;
  // Stripes painted round it every `every` world units.
  stripes?: { color: string; every: number };
  // Concrete pylons under its overhang.
  pylons?: boolean;
  billboards: boolean;
  // What stands on the roof at its corners (Retrofits.tsx), alternating.
  roofKit: [RoofPiece, RoofPiece];
}

export const CENTERPIECE_LOOKS: Record<CenterpieceKind, CenterpieceLook> = {
  megablock: {
    windows: 'apartment', body: '#1c1d24', accent: SCENE.red, crown: 'antennas',
    steps: [[0, 2], [0.3, -2.5]], corner: 'chamfer',
    cladding: ['#7d2630', '#2d3a63'], number: '07', billboards: true, roofKit: ['coolers', 'sentry'],
  },
  liftblock: {
    windows: 'plant', body: '#8d8a83', accent: SCENE.blue, crown: 'antennas',
    steps: [[0, 6], [0.3, -1.5]], towerSteps: [[0.62, 0], [0.7, 1], [0.8, 0.2], [0.9, 1.3]], corner: 'chamfer',
    cladding: ['#a7a39a', '#2f4f9c'], stencil: 'S7-03', stripes: { color: '#2f55b8', every: 9 }, pylons: true, billboards: false, roofKit: ['coolers', 'hvac'],
  },
};
