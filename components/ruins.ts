// Ruins and craters: what a match leaves on the city (drawn by Ruins.tsx).
//
// A destroyed building tile becomes a ruin rather than a bare patch: the broken stub of its ground
// floor in its own colour, jagged wall segments of different heights with gaps blown through them,
// only along the building's outside walls so a ruined building of several tiles reads as one gutted
// shell; slabs of rubble fallen inside, rebar sticking up from the broken walls, and a scorched
// footprint. Laid out from the tile's id, so it is the same for every player and every redraw.
//
// Heavy blasts on the ground leave craters that stay for the match: a scorched pit with soot
// thrown out round it, sized to the blast. Small hits (bullets, drone strikes, single rockets),
// blasts in the air and energy effects (EMP, the Black Wall, a shot stopped by a force field)
// leave none.
//
// Pure, for testing.

import type { Explosion } from '../types';

// A box in a ruin, in the tile's own coordinates (metres from its centre, y up from the ground):
// centre, size, turn (yaw, then a tilt about x and z) and shade (0 to 1: how far it's charred).
export interface RuinPiece { at: [number, number, number]; size: [number, number, number]; turn: [number, number, number]; shade: number }
export interface RuinLayout { walls: RuinPiece[]; rubble: RuinPiece[]; rebar: RuinPiece[] }

export type Side = 'north' | 'south' | 'east' | 'west';

export const RUIN = {
  // The wall stubs stand this share of the building's height (capped at `tallest` metres)...
  low: 0.14,
  high: 0.42,
  lowest: 1.6,
  tallest: 14,
  // ...in this many pieces along each outside wall, a piece blown away now and then.
  piecesPerWall: 4,
  gapChance: 0.22,
  wallThickness: 0.7,
  // Rubble inside, slabs and chunks of different sizes, and rebar.
  rubble: [11, 16] as [number, number],
  biggest: 3.4,
  rebar: [3, 6] as [number, number],
};

// A seeded random source from a string, so a ruin always looks the same.
export function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  let s = h >>> 0 || 1;
  return () => { s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909); s ^= s >>> 16; return (s >>> 0) / 4294967296; };
}

// The ruin of a tile `w` by `d` metres whose building stood `height` tall, with walls along
// `outside` (the building's outside edges on this tile).
export function ruinLayout(id: string, w: number, d: number, height: number, outside: readonly Side[]): RuinLayout {
  const rand = seeded(id);
  const between = (a: number, b: number) => a + (b - a) * rand();
  const tall = Math.min(height, RUIN.tallest / RUIN.high);
  const hw = w / 2 - 0.4, hd = d / 2 - 0.4, t = RUIN.wallThickness;
  const walls: RuinPiece[] = [];
  const rebar: RuinPiece[] = [];
  for (const side of outside) {
    const alongX = side === 'north' || side === 'south';
    const len = alongX ? w - 0.8 : d - 0.8;
    const piece = len / RUIN.piecesPerWall;
    for (let i = 0; i < RUIN.piecesPerWall; i++) {
      if (rand() < RUIN.gapChance) continue;
      const h = Math.max(RUIN.lowest, tall * between(RUIN.low, RUIN.high));
      const along = -len / 2 + piece * (i + 0.5);
      const across = side === 'north' ? -hd + t / 2 : side === 'south' ? hd - t / 2 : side === 'west' ? -hw + t / 2 : hw - t / 2;
      const x = alongX ? along : across, z = alongX ? across : along;
      walls.push({ at: [x, h / 2, z], size: alongX ? [piece * 0.96, h, t] : [t, h, piece * 0.96], turn: [0, 0, 0], shade: rand() * 0.5 });
      // Now and then a few bars of rebar left sticking up out of the broken top.
      if (rand() < 0.35) rebar.push({ at: [x, h + 0.8, z], size: [0.12, between(1.2, 2.6), 0.12], turn: [0, between(-0.5, 0.5), between(-0.6, 0.6)], shade: 0 });
    }
  }
  const rubble: RuinPiece[] = [];
  const [r0, r1] = RUIN.rubble;
  const count = r0 + Math.floor(rand() * (r1 - r0 + 1));
  for (let i = 0; i < count; i++) {
    // Mostly chunks, now and then a broad slab of fallen floor.
    const slab = rand() < 0.3;
    const top = Math.min(RUIN.biggest, w * 0.3, d * 0.3);
    const sx = slab ? between(top * 0.7, top) : between(0.6, top * 0.55);
    const sz = slab ? between(top * 0.5, top) : sx * between(0.6, 1.4);
    const sy = slab ? between(0.3, 0.6) : between(0.5, 1.3);
    rubble.push({
      at: [between(-hw + sx / 2, hw - sx / 2), sy * 0.35, between(-hd + sz / 2, hd - sz / 2)],
      size: [sx, sy, sz],
      turn: [between(0, Math.PI), between(-0.4, 0.4), between(-0.4, 0.4)],
      shade: rand(),
    });
  }
  const [b0, b1] = RUIN.rebar;
  for (let i = rebar.length; i < b0 + Math.floor(rand() * (b1 - b0 + 1)) && rubble.length > 0; i++) {
    const on = rubble[Math.floor(rand() * rubble.length)];
    rebar.push({ at: [on.at[0], on.size[1] + 0.6, on.at[2]], size: [0.1, between(1, 2.2), 0.1], turn: [0, between(-0.8, 0.8), between(-0.8, 0.8)], shade: 0 });
  }
  return { walls, rubble, rebar };
}

// --- Craters ---

export const CRATER = {
  // Blasts smaller than this (world units) leave no crater; blasts higher than `airAbove` are in
  // the air.
  minBlast: 3,
  airAbove: 8,
  // A crater's radius against the blast's, and its bounds.
  scale: 0.8,
  smallest: 2.5,
  largest: 18,
  // The most kept at once: past it the oldest goes.
  max: 320,
};

export interface Crater { id: string; x: number; z: number; r: number; turn: number }

// The crater a blast leaves on the ground, or null.
export function craterOf(e: Pick<Explosion, 'id' | 'position' | 'radius' | 'style'>): Crater | null {
  if (e.style || e.position.y > CRATER.airAbove || e.radius < CRATER.minBlast) return null;
  const r = Math.min(CRATER.largest, Math.max(CRATER.smallest, e.radius * CRATER.scale));
  return { id: e.id, x: e.position.x, z: e.position.z, r, turn: seeded(e.id)() * Math.PI * 2 };
}

// Craters with new ones added, the oldest dropped past CRATER.max.
export const addCraters = (craters: readonly Crater[], added: readonly Crater[]): Crater[] =>
  added.length === 0 ? (craters as Crater[]) : [...craters, ...added].slice(-CRATER.max);
