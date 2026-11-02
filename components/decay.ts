// The city's decay (drawn by FootprintBuilding.tsx and Decay.tsx): which state of ruin each city
// block has fallen into, and the props that show it on the streets.
//
// A block has one primary state and sometimes traces of a second:
//   deconstruction  building stopped mid-build: the upper floors of its buildings a bare concrete
//                   skeleton of columns and slabs, rebar sticking up, a tower crane left standing,
//                   a tarp hung over the frame
//   deterioration   weather and neglect taking over: sand drifted against the kerbs of the
//                   streets round it, puddles standing in the road, weeds along the lot edges,
//                   grime streaked down its walls
//   redevelopment   people living in the ruins: shipping containers stacked into homes on the
//                   roofs, lean-to shacks of sheet metal and tarps against the ground floors
// Devastation, the fourth state, isn't laid out: it's what the fighting leaves (ruins.ts).
//
// The poor edge of the map decays most; midtown a little; the corporate core and downtown and
// the bases not at all. Picked per block so a block and its twin across the map are the same.
// Pure, for testing.

import type { RoadTileData } from '../types';
import { blocksAcross, districtAt, districtOfBlock, type District } from '../sim/districts';

export type Decay = 'deconstruction' | 'deterioration' | 'redevelopment';
export interface BlockDecay { primary: Decay; secondary: Decay | null }

const STRIDE = 6;
type Odds = [Decay | null, number][];
// The odds of each primary state by district (shares add up to 1).
export const DECAY_ODDS: Partial<Record<District, Odds>> = {
  fringe: [['redevelopment', 0.45], ['deterioration', 0.4], ['deconstruction', 0.15]],
  outskirts: [['deterioration', 0.3], ['redevelopment', 0.2], ['deconstruction', 0.12], [null, 0.38]],
  industrial: [['deconstruction', 0.3], ['deterioration', 0.35], [null, 0.35]],
  midtown: [['deterioration', 0.1], ['deconstruction', 0.05], [null, 0.85]],
};
// How often a decayed block shows traces of a second state too.
export const SECONDARY = 0.5;
// How strongly a block shows a state as its primary and as its secondary (props scale by it).
export const STRENGTH = { primary: 1, secondary: 0.35 };

const hash = (ix: number, iz: number, salt: number) => { const v = Math.sin(ix * 157.31 + iz * 311.7 + salt * 41.13) * 13758.5453; return v - Math.floor(v); };

export function decayOfBlock(ix: number, iz: number, gridSize: number): BlockDecay | null {
  const n = blocksAcross(gridSize);
  if (ix < 0 || iz < 0 || ix >= n || iz >= n) return null;
  const odds = DECAY_ODDS[districtOfBlock(ix, iz, gridSize)];
  if (!odds) return null;
  // Blue's side of the pair.
  const last = n - 1;
  const [x, z] = ix + iz > last || (ix + iz === last && ix > iz) ? [last - ix, last - iz] : [ix, iz];
  let r = hash(x, z, 1), primary: Decay | null = odds[odds.length - 1][0];
  for (const [d, share] of odds) { if (r < share) { primary = d; break; } r -= share; }
  if (!primary) return null;
  const others = (['deconstruction', 'deterioration', 'redevelopment'] as Decay[]).filter(d => d !== primary);
  const secondary = hash(x, z, 2) < SECONDARY ? others[Math.floor(hash(x, z, 3) * others.length)] : null;
  return { primary, secondary };
}

// How strongly a block shows a state: 1 as its primary, less as its secondary, else 0.
export const strengthOf = (d: BlockDecay | null, state: Decay) =>
  !d ? 0 : d.primary === state ? STRENGTH.primary : d.secondary === state ? STRENGTH.secondary : 0;

// The decay of the block a tile stands in.
export const decayAt = (x: number, z: number, gridSize: number) => decayOfBlock(Math.floor(x / STRIDE), Math.floor(z / STRIDE), gridSize);

// --- Unfinished buildings ---

// A building stopped mid-build is finished up to this share of its height (in whole storeys)
// and a bare frame above, if it's at least `minHeight` tall.
export const UNFINISHED = { share: 0.6, storey: 3.5, minHeight: 14 };
export function finishedHeight(h: number): number {
  return Math.max(UNFINISHED.storey * 2, Math.round((h * UNFINISHED.share) / UNFINISHED.storey) * UNFINISHED.storey);
}

// --- Props on the streets ---

export interface Puddle { x: number; z: number; rx: number; rz: number; turn: number }
export interface Drift { x: number; z: number; length: number; width: number; turn: number }
export interface Weed { x: number; z: number; size: number }
export interface DecayProps { puddles: Puddle[]; drifts: Drift[]; weeds: Weed[] }

// Puddles, drifts and weeds, in tile coordinates (a tile's centre at its whole x, z), on and
// along the streets round deteriorating blocks: each street tile takes the most deteriorated of
// the blocks beside it, drifts piling in the gutter against that side's kerb and weeds coming up
// through the cracks in its pavement.
export function decayProps(tiles: readonly RoadTileData[], gridSize: number): DecayProps {
  const out: DecayProps = { puddles: [], drifts: [], weeds: [] };
  for (const t of tiles) {
    if (t.type !== 'main' && t.type !== 'street') continue;
    // The neighbouring lot tile in the most deteriorated block, and its side.
    let best = 0, side: [number, number] | null = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const nx = t.x + dx, nz = t.z + dz;
      if (!districtAt(nx, nz, gridSize)) continue;
      const s = strengthOf(decayAt(nx, nz, gridSize), 'deterioration');
      if (s > best) { best = s; side = [dx, dz]; }
    }
    if (!side) continue;
    const r = (salt: number) => hash(t.x, t.z, salt);
    const [sx, sz] = side, alongX = sz !== 0;
    if (r(10) < 0.4 * best) {
      out.puddles.push({ x: t.x + (r(11) - 0.5) * 0.6, z: t.z + (r(12) - 0.5) * 0.6, rx: 0.1 + r(13) * 0.18, rz: 0.08 + r(14) * 0.12, turn: r(15) * Math.PI });
    }
    if (r(20) < 0.75 * best) {
      out.drifts.push({ x: t.x + sx * 0.27 + (alongX ? (r(21) - 0.5) * 0.3 : 0), z: t.z + sz * 0.27 + (alongX ? 0 : (r(21) - 0.5) * 0.3), length: 0.5 + r(22) * 0.6, width: 0.14 + r(23) * 0.12, turn: (alongX ? 0 : Math.PI / 2) + (r(24) - 0.5) * 0.25 });
    }
    const clumps = Math.floor(r(30) * 4 * best);
    for (let i = 0; i < clumps; i++) {
      const along = (r(31 + i) - 0.5) * 0.9;
      out.weeds.push({ x: t.x + sx * 0.42 + (alongX ? along : 0), z: t.z + sz * 0.42 + (alongX ? 0 : along), size: 0.5 + r(41 + i) * 0.7 });
    }
  }
  return out;
}
