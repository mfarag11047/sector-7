// The city's history, written on its buildings (drawn by FootprintBuilding.tsx and Retrofits.tsx).
//
// The city grew in four eras, and a building shows more than one of them, layered from the
// street up, the newer always on top of the older:
//
//   1  Utilitarian     built through the collapse: concrete boxes, square corners, ducts, tanks
//   2  Mass-market     the consumer boom: rounded corners, curved walls, pastel neon, big signs
//   3  Corporate       corporate rule: chamfered 135-degree corners, dark matte, sharp and stark,
//                      server cooling rigs and cameras bolted onto whatever was there before
//   4  Ultra-elite     the rich: seamless glass and gold pavilions, sky gardens
//
// Each building gets an era stack:
//   bones     how it was built: its corners (square, rounded or chamfered)
//   frontage  its ground storey (the shops and lobbies, drawn in a later pass)
//   body      its middle floors: the bones' era, or recladding over them
//   roof      what was added on top since, and the retrofit that stands there (or none)
// Every layer is at least as new as the bones. Now and then a building has a sleek new frontage
// over old bones the owner never got round to rebuilding (`mismatch`).
//
// The district sets the odds: poverty at the edge (the fringe and outskirts mostly era 1), the
// boom in midtown (era 2), corporate money bolted onto everything (era 3 roofs), the industrial
// plants bought up for compute (era 1 sheds under era 3 cooling rigs). The corporate towers of
// downtown and the core (and the two sides' megatowers, Landmarks.tsx) stand apart, pristine:
// they get no stack and are drawn as they always were.
//
// Picked from where a building stands, so its twin across the map gets the same: the map stays
// fair. Pure, for testing.

import { CITY_CONFIG } from '../constants';
import type { BuildingData } from '../types';
import { districtAt, type District } from '../sim/districts';

export type Era = 1 | 2 | 3 | 4;
export type Corner = 'square' | 'round' | 'chamfer';
// What stands on the roof, by era:
//   watertank, hvac        1  a water tank on legs; boxy air handlers with ducts running off them
//   roofsign, dome         2  a big rounded sign frame lit in neon; a bubble skylight
//   coolers, sentry        3  a server cooling rig (a platform of fan units); a camera and comms mast
//   pavilion               4  a glass pavilion with gold trim among a few dark trees
export type Retrofit = 'watertank' | 'hvac' | 'roofsign' | 'dome' | 'coolers' | 'sentry' | 'pavilion';
export const RETROFIT_ERA: Record<Retrofit, Era> = { watertank: 1, hvac: 1, roofsign: 2, dome: 2, coolers: 3, sentry: 3, pavilion: 4 };

export interface EraStack {
  bones: Era;
  frontage: Era;
  body: Era;
  roof: Era | null;
  retrofit: Retrofit | null;
  corner: Corner;
  mismatch: boolean;
}

type Odds<T> = [T, number][];
interface DistrictEras { bones: Odds<Era>; roof: Odds<Era | null>; frontage: Odds<Era>; reclad: number }
// The odds for each district a stack is drawn for (shares add up to 1).
export const DISTRICT_ERAS: Partial<Record<District, DistrictEras>> = {
  fringe: { bones: [[1, 0.9], [2, 0.1]], roof: [[1, 0.5], [2, 0.1], [null, 0.4]], frontage: [[1, 0.7], [2, 0.3]], reclad: 0 },
  outskirts: { bones: [[1, 0.7], [2, 0.3]], roof: [[1, 0.35], [2, 0.3], [3, 0.15], [null, 0.2]], frontage: [[1, 0.3], [2, 0.6], [3, 0.1]], reclad: 0.05 },
  midtown: { bones: [[1, 0.3], [2, 0.45], [3, 0.25]], roof: [[2, 0.25], [3, 0.55], [4, 0.05], [null, 0.15]], frontage: [[2, 0.65], [3, 0.3], [4, 0.05]], reclad: 0.2 },
  industrial: { bones: [[1, 0.85], [3, 0.15]], roof: [[1, 0.2], [3, 0.6], [null, 0.2]], frontage: [[1, 0.8], [3, 0.2]], reclad: 0.1 },
  base: { bones: [[1, 0.6], [2, 0.2], [3, 0.2]], roof: [[3, 0.5], [null, 0.5]], frontage: [[2, 0.5], [3, 0.5]], reclad: 0.2 },
};
// How often a building gets a new frontage over old bones left as they were.
export const MISMATCH = 0.12;
// The corner each era of bones builds.
export const CORNER: Record<Era, Corner> = { 1: 'square', 2: 'round', 3: 'chamfer', 4: 'round' };
const RETROFITS: Record<Era, Retrofit[]> = { 1: ['watertank', 'hvac'], 2: ['roofsign', 'dome'], 3: ['coolers', 'sentry'], 4: ['pavilion'] };

type Footprint = NonNullable<BuildingData['footprint']>;

// Blue's side of a footprint and its twin, and a steady 0..1 for it by salt.
function canonical(f: Footprint, gridSize: number) {
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  const [x, z] = f.x + f.z < tx + tz || (f.x + f.z === tx + tz && f.x <= tx) ? [f.x, f.z] : [tx, tz];
  return (salt: number) => { const v = Math.sin((x * gridSize + z) * 91.345 + salt * 47.853) * 24634.6345; return v - Math.floor(v); };
}

const pick = <T,>(r: number, odds: Odds<T>): T => {
  for (const [o, share] of odds) { if (r < share) return o; r -= share; }
  return odds[odds.length - 1][0];
};

// A building's era stack, or null for the pristine corporate towers and anything outside the
// districts that layer.
export function eraStackOf(b: Pick<BuildingData, 'type' | 'footprint'> & { sawtooth?: boolean }, gridSize = CITY_CONFIG.gridSize): EraStack | null {
  const f = b.footprint;
  if (!f || b.type === 'commercial') return null;
  const district = districtAt(f.x, f.z, gridSize);
  const odds = district ? DISTRICT_ERAS[district] : undefined;
  if (!odds) return null;
  const r = canonical(f, gridSize);
  const bones = pick(r(1), odds.bones);
  const atLeast = (e: Era) => (e < bones ? bones : e);
  const mismatch = bones === 1 && r(2) < MISMATCH;
  const frontage = mismatch ? 3 : atLeast(pick(r(3), odds.frontage));
  const body = !mismatch && r(4) < odds.reclad ? atLeast(3) : bones;
  let roof = pick(r(5), odds.roof);
  // Nobody bolts an older kind of kit onto a newer building.
  if (roof !== null && roof < bones) roof = null;
  const retrofit = roof === null ? null : RETROFITS[roof][Math.floor(r(6) * RETROFITS[roof].length)];
  // A sawtooth shed keeps its square corners: its roof runs out to them.
  const corner = b.sawtooth ? 'square' : CORNER[bones];
  return { bones, frontage, body, roof, retrofit, corner, mismatch };
}

// Which tile of a building carries its roof retrofit, in tiles from the footprint's corner: on a
// building of one or two tiles it stands in place of the usual rooftop piece; on a bigger one,
// on a corner tile away from the tile carrying that piece (the middle, see
// FootprintBuilding.tsx), so the two don't crowd each other. The same corner as its twin's, seen
// from across the map.
export function retrofitTile(f: Footprint, gridSize = CITY_CONFIG.gridSize): { lx: number; lz: number; replacesCrown: boolean } {
  if (f.w * f.d === 1) return { lx: 0, lz: 0, replacesCrown: true };
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  const twin = !(f.x + f.z < tx + tz || (f.x + f.z === tx + tz && f.x <= tx));
  const ax = Math.floor((f.w - 1) / 2), az = Math.floor((f.d - 1) / 2);
  const corners: [number, number][] = [[f.w - 1, f.d - 1], [0, 0], [f.w - 1, 0], [0, f.d - 1]];
  // Clear of the middle tile on both twins (it isn't mirrored: on a building an even number of
  // tiles across, it sits just off the middle on the same side of both).
  const clear = (x: number, z: number) => (x !== ax || z !== az) && (x !== f.w - 1 - ax || z !== f.d - 1 - az);
  for (const [cx, cz] of corners) {
    if (!clear(cx, cz)) continue;
    return twin ? { lx: f.w - 1 - cx, lz: f.d - 1 - cz, replacesCrown: false } : { lx: cx, lz: cz, replacesCrown: false };
  }
  // A building of two tiles has no such corner: the retrofit takes the middle tile's place.
  return { lx: ax, lz: az, replacesCrown: true };
}

// --- Corners ---

export type CornerKey = 'nw' | 'ne' | 'se' | 'sw';
export interface Rect { x0: number; x1: number; z0: number; z1: number }
// How far a corner is cut back: a chamfer's legs, a rounded corner's radius.
export const CORNER_CUT: Record<Exclude<Corner, 'square'>, number> = { chamfer: 0.2, round: 0.24 };
// The steps along a rounded corner's quarter circle.
export const ARC_STEPS = 6;
// The direction each corner looks out, and where its quarter circle starts (angles from +x toward +z).
export const CORNER_OUT: Record<CornerKey, [number, number]> = { nw: [-1, -1], ne: [1, -1], se: [1, 1], sw: [-1, 1] };
const ARC_START: Record<CornerKey, number> = { nw: Math.PI, ne: Math.PI * 1.5, se: 0, sw: Math.PI / 2 };

// The outline of a rectangle seen from above (x east, z south), going round north, east, south,
// west, with the given corners cut back by `cut[k]`: across at 45 degrees for a chamfer, along a
// quarter circle for a rounded corner.
export function outline(r: Rect, cut: Partial<Record<CornerKey, number>>, corner: Corner): [number, number][] {
  const pts: [number, number][] = [];
  const at: Record<CornerKey, [number, number]> = { nw: [r.x0, r.z0], ne: [r.x1, r.z0], se: [r.x1, r.z1], sw: [r.x0, r.z1] };
  for (const k of ['nw', 'ne', 'se', 'sw'] as CornerKey[]) {
    const c = corner === 'square' ? 0 : cut[k] ?? 0;
    const [x, z] = at[k], [ox, oz] = CORNER_OUT[k];
    if (c <= 0) { pts.push([x, z]); continue; }
    // The corner's centre of curvature, c in from both walls.
    const cx = x - ox * c, cz = z - oz * c;
    const steps = corner === 'round' ? ARC_STEPS : 1;
    for (let i = 0; i <= steps; i++) {
      const a = ARC_START[k] + (Math.PI / 2) * (i / steps);
      pts.push([cx + Math.cos(a) * c, cz + Math.sin(a) * c]);
    }
  }
  return pts;
}
