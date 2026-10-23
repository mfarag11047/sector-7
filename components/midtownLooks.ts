// Midtown's apartment blocks: how each one looks and is shaped, and the sky walkways that join the
// buildings of an apartment complex.
//
// Most midtown blocks are mixed: each building gets its own window style (the old data-centre
// bands, apartment windows or balcony floors), massing, roof and, now and then, a ground storey of
// shops, picked from where it stands so its twin across the map is the same. A few blocks are
// apartment complexes (COMPLEXES): four matching buildings of one height and one look, joined
// across the alleys between them by enclosed sky walkways.
//
// Used by FootprintBuilding.tsx and Building.tsx (through lookOf) and MidtownSkyways.tsx.

import { CITY_CONFIG } from '../constants';
import type { BuildingData } from '../types';
import { type Crown, type Facade, FACADES, type FacadeName, facadeOf, type Massing } from './corpoFacades';

type Footprint = NonNullable<BuildingData['footprint']>;

// The apartment complexes, by city block on blue's side; their twins across the map are too.
const COMPLEXES: Record<string, { windows: FacadeName; massing: Massing; crown: Crown; shops: boolean }> = {
  '4,3': { windows: 'apartment', massing: 'setback', crown: 'garden', shops: true },
  '7,3': { windows: 'balcony', massing: 'straight', crown: 'tanks', shops: true },
  '3,5': { windows: 'bands', massing: 'crownstep', crown: 'plant', shops: false },
};

const STRIDE = 6;
// Blue's side of a footprint and its twin, and a steady 0..1 for it.
function canonical(f: Footprint, gridSize: number) {
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  const [x, z] = f.x + f.z < tx + tz || (f.x + f.z === tx + tz && f.x <= tx) ? [f.x, f.z] : [tx, tz];
  const hash = (salt: number) => { const v = Math.sin((x * gridSize + z) * 12.9898 + salt * 78.233) * 43758.5453; return v - Math.floor(v); };
  return { x, z, hash };
}

// The apartment complex a building belongs to, by its block on blue's side, if any.
export function complexOf(f: Footprint, gridSize = CITY_CONFIG.gridSize): string | null {
  const c = canonical(f, gridSize);
  const key = `${Math.floor(c.x / STRIDE)},${Math.floor(c.z / STRIDE)}`;
  return COMPLEXES[key] ? key : null;
}

const pick = <T,>(r: number, options: [T, number][]): T => {
  for (const [o, share] of options) { if (r < share) return o; r -= share; }
  return options[options.length - 1][0];
};

export function midtownLookOf(f: Footprint, gridSize = CITY_CONFIG.gridSize): Facade {
  const c = canonical(f, gridSize);
  const complex = complexOf(f, gridSize);
  const choice = complex ? COMPLEXES[complex] : {
    windows: pick<FacadeName>(c.hash(1), [['apartment', 0.4], ['balcony', 0.3], ['bands', 0.3]]),
    // Slim buildings stay sheer; broad ones may step.
    massing: f.w * f.d < 2 ? 'straight' : pick<Massing>(c.hash(2), [['straight', 0.35], ['setback', 0.25], ['crownstep', 0.2], ['plinth', 0.2]]),
    crown: pick<Crown>(c.hash(3), [['tanks', 0.3], ['garden', 0.25], ['plant', 0.3], ['antennas', 0.15]]),
    shops: c.hash(4) < 0.4,
  };
  const style = FACADES[choice.windows];
  // A complex's buildings all wear the same shade.
  const shade = complex ? 0 : Math.floor(c.hash(5) * style.bodies.length);
  return { ...style, body: style.bodies[shade], massing: choice.massing, crown: choice.crown, shops: choice.shops };
}

// The look of any city building that has one: corporate towers and midtown blocks.
export function lookOf(b: Pick<BuildingData, 'type' | 'footprint'>): Facade | null {
  if (!b.footprint) return null;
  if (b.type === 'commercial') return facadeOf(b.footprint);
  if (b.type === 'hightech') return midtownLookOf(b.footprint);
  return null;
}

export interface Skyway {
  // Middle of the walkway, in tile coordinates, and its height in world units.
  x: number;
  z: number;
  y: number;
  // Runs along x (else z), across `span` tiles of alley.
  alongX: boolean;
  span: number;
}

// A sky walkway across each alley between two buildings of the same complex that face each other
// across it, at a little over half the lower one's height.
export function skyways(buildings: readonly BuildingData[], gridSize = CITY_CONFIG.gridSize): Skyway[] {
  const byComplex = new Map<string, { f: Footprint; h: number }[]>();
  const seen = new Set<string>();
  for (const b of buildings) {
    const f = b.footprint;
    if (!f || b.type !== 'hightech') continue;
    const complex = complexOf(f, gridSize);
    // Each complex and its twin are told apart by which side of the map they are on.
    const key = complex && `${complex}:${f.x + f.z < gridSize - 1 ? 'b' : 'r'}`;
    if (!key || seen.has(`${f.x},${f.z}`)) continue;
    seen.add(`${f.x},${f.z}`);
    if (!byComplex.has(key)) byComplex.set(key, []);
    byComplex.get(key)!.push({ f, h: b.height });
  }
  const out: Skyway[] = [];
  for (const members of byComplex.values()) {
    for (const a of members) for (const b of members) {
      const overlapZ = [Math.max(a.f.z, b.f.z), Math.min(a.f.z + a.f.d, b.f.z + b.f.d)];
      const overlapX = [Math.max(a.f.x, b.f.x), Math.min(a.f.x + a.f.w, b.f.x + b.f.w)];
      const y = Math.min(a.h, b.h) * 0.58;
      // b just east of a, one alley between.
      if (b.f.x === a.f.x + a.f.w + 1 && overlapZ[1] > overlapZ[0]) out.push({ x: a.f.x + a.f.w, z: (overlapZ[0] + overlapZ[1] - 1) / 2, y, alongX: true, span: 1 });
      // b just south of a.
      if (b.f.z === a.f.z + a.f.d + 1 && overlapX[1] > overlapX[0]) out.push({ x: (overlapX[0] + overlapX[1] - 1) / 2, z: a.f.z + a.f.d, y, alongX: false, span: 1 });
    }
  }
  return out;
}
