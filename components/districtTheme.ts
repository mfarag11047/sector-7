// How each district looks at street level: its open ground, the tint on its streets, and whether
// its roads get sidewalks and crosswalks. The data side of the map dressing; RoadSystem.tsx and
// Streetscape.tsx draw it. Districts come from sim/districts.ts and set how blocks are built up in
// sim/mapgen.ts; this is the same zoning seen from the ground.
//
// The ground textures are drawn on a canvas, seeded so they come out the same every load. Kept in
// the night palette and low in contrast, so units, selection rings and the grid stay readable on
// top of them, and free of blue and red, the team colours.

import * as THREE from 'three';
import { District, districtAt, districtOfBlock } from '../sim/districts';
import { BASE_WALL } from '../sim/mapgen';
import { TEAM_BASES } from '../constants';

// 'courtyard' and 'carpark' are a district's choice, not textures: each block is ringed along the
// street with one ground and filled in the middle with another (see groundOfTile):
//   courtyard  light concrete 'paving' round a 'lawn'
//   carpark    dark 'walkway' pavers round empty 'parking' bays
//   corporate  polished 'granite' round patterned 'plazaStone'
export type GroundStyle = 'corporate' | 'granite' | 'plazaStone' | 'courtyard' | 'paving' | 'lawn' | 'carpark' | 'walkway' | 'parking' | 'yard' | 'slab' | 'gravel';
type SplitGround = 'courtyard' | 'carpark' | 'corporate';
export type TileGround = Exclude<GroundStyle, SplitGround>;
export type GroundTexture = TileGround;

export type RoadStyle = 'city' | 'suburb';
// The road textures: a straight piece (markings run along it), a junction (unmarked), and the
// main boulevard's own straight piece.
export type RoadPiece = 'cityStraight' | 'cityJunction' | 'suburbStraight' | 'suburbJunction' | 'avenue' | 'baseLane' | 'basePad';

export interface DistrictTheme {
  ground: GroundStyle;
  // How its roads are surfaced and marked: 'city' or 'suburb' (see roadPieceOf).
  road: RoadStyle;
  sidewalks: boolean;
  crosswalks: boolean;
}

export const DISTRICT_THEMES: Record<District, DistrictTheme> = {
  // Corporate core and downtown: polished granite along the streets round patterned stone plazas
  // (neon kerb lines and planters by DowntownDressing.tsx), sidewalks, crosswalks.
  core: { ground: 'corporate', road: 'city', sidewalks: true, crosswalks: true },
  downtown: { ground: 'corporate', road: 'city', sidewalks: true, crosswalks: true },
  // Midtown: grass courtyards inside a ring of light paving, sidewalks, no crosswalks.
  midtown: { ground: 'courtyard', road: 'city', sidewalks: true, crosswalks: false },
  // Industrial: stained concrete yards, warmer and dirtier streets.
  industrial: { ground: 'yard', road: 'suburb', sidewalks: false, crosswalks: false },
  // Outskirts: dark paved walkways along the streets round parking lots. Fringe: old concrete
  // slabs by the Blackwall, cracked here and there with the Blackwall glitching through
  // (BlackwallCracks.tsx).
  outskirts: { ground: 'carpark', road: 'suburb', sidewalks: false, crosswalks: false },
  fringe: { ground: 'slab', road: 'suburb', sidewalks: false, crosswalks: false },
  // The bases: military gravel outside the compound walls (the compound itself is deck plating,
  // see roadPieceOf).
  base: { ground: 'gravel', road: 'suburb', sidewalks: false, crosswalks: false },
};

const ROAD_STRIDE = 6;
// The block a coordinate falls in. A tile on a road line goes with the block on the side nearer
// the middle of the map, so the zoning mirrors like the map does.
function blockOf(c: number, gridSize: number): number {
  const blocks = Math.floor((gridSize - 1) / ROAD_STRIDE);
  const b = c % ROAD_STRIDE === 0 && c > (gridSize - 1) / 2 ? c / ROAD_STRIDE - 1 : Math.floor(c / ROAD_STRIDE);
  return Math.max(0, Math.min(blocks - 1, b));
}
// The district a tile lies in.
export const districtOfTile = (x: number, z: number, gridSize: number): District =>
  districtOfBlock(blockOf(x, gridSize), blockOf(z, gridSize), gridSize);
export const themeOfTile = (x: number, z: number, gridSize: number) => DISTRICT_THEMES[districtOfTile(x, z, gridSize)];

// The ground drawn on an open lot tile. In a district whose ground is split, a tile beside the
// street (or the boulevard) takes the edge ground and any other the middle one: a green courtyard
// inside a paved edge in midtown, parking lots inside dark walkways in the outskirts.
export function groundOfTile(x: number, z: number, gridSize: number): TileGround {
  const ground = themeOfTile(x, z, gridSize).ground;
  if (ground !== 'courtyard' && ground !== 'carpark' && ground !== 'corporate') return ground;
  const onStreet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => districtAt(x + dx, z + dz, gridSize) === null);
  if (ground === 'courtyard') return onStreet ? 'paving' : 'lawn';
  if (ground === 'corporate') return onStreet ? 'granite' : 'plazaStone';
  return onStreet ? 'walkway' : 'parking';
}

// Whether a tile is inside a starting base's walls (sim/mapgen.ts baseCompound), gates included.
export function inBaseCompound(x: number, z: number, gridSize: number): boolean {
  const last = gridSize - 1;
  const [fx, fz] = x + z > last ? [last - x, last - z] : [x, z];
  const reach = BASE_WALL.reach;
  return Math.abs(fx - TEAM_BASES.blue.x) <= reach && Math.abs(fz - TEAM_BASES.blue.z) <= reach && fx <= TEAM_BASES.blue.x + reach && fz <= TEAM_BASES.blue.z + reach;
}

// Which road piece a road tile takes, and whether it runs along x (else along z). A tile on one
// road line is a straight piece of it; where lines cross, or off the lines (the paved squares
// round the starting bases), it is a junction. The district picks city or suburb; the main
// boulevard is always the avenue.
export function roadPieceOf(x: number, z: number, type: 'main' | 'street', gridSize: number): { piece: RoadPiece; alongX: boolean } {
  const centre = Math.floor(gridSize / 2);
  const onX = x % ROAD_STRIDE === 0 || x === centre; // A road running along z.
  const onZ = z % ROAD_STRIDE === 0 || z === centre; // A road running along x.
  // Inside a starting base's walls (gates included): deck plating, with marked lanes out.
  if (inBaseCompound(x, z, gridSize)) return onX !== onZ ? { piece: 'baseLane', alongX: onZ } : { piece: 'basePad', alongX: false };
  const style = themeOfTile(x, z, gridSize).road;
  if (onX === onZ) return { piece: style === 'city' || type === 'main' ? 'cityJunction' : 'suburbJunction', alongX: false };
  const alongX = onZ;
  if (type === 'main') return { piece: 'avenue', alongX };
  return { piece: style === 'city' ? 'cityStraight' : 'suburbStraight', alongX };
}

// --- Road textures: drawn with the road running up the canvas ---

function asphalt(ctx: CanvasRenderingContext2D, rand: () => number, style: RoadStyle) {
  if (style === 'city') {
    // Dark, well-kept asphalt, the lanes polished a shade darker by traffic.
    ctx.fillStyle = '#2a2b2e';
    ctx.fillRect(0, 0, SIZE, SIZE);
    grime(ctx, rand, ['#222326', '#35363a', '#414247'], 9000, 2, 0.45);
    ctx.fillStyle = 'rgba(10, 10, 12, 0.12)';
    for (const x of [0.32, 0.68]) ctx.fillRect(SIZE * x - 40, 0, 80, SIZE);
  } else {
    // Older, paler asphalt: cracks, tar-sealed repairs, and crumbling edges.
    ctx.fillStyle = '#3d3e40';
    ctx.fillRect(0, 0, SIZE, SIZE);
    grime(ctx, rand, ['#303134', '#4a4b4e', '#45433f'], 9000, 3, 0.45);
    for (let k = 0; k < 1; k++) {
      ctx.fillStyle = 'rgba(32, 33, 36, 0.25)';
      ctx.fillRect(SIZE * (0.15 + rand() * 0.5), SIZE * rand(), 60 + rand() * 90, 40 + rand() * 70);
    }
    for (let k = 0; k < 5; k++) crack(ctx, rand, 'rgba(22, 22, 24, 0.75)', 2, 5);
    for (const edge of [0, SIZE]) for (let k = 0; k < 6; k++) blot(ctx, edge, rand() * SIZE, 20 + rand() * 30, '#26272a', 0.5);
  }
}

// A painted line up the canvas at `x`, solid or dashed (dash and gap divide the tile, so dashes
// run on unbroken from tile to tile), with a little wear.
function paintLine(ctx: CanvasRenderingContext2D, rand: () => number, x: number, width: number, color: string, dash?: [number, number]) {
  ctx.fillStyle = color;
  if (!dash) ctx.fillRect(x - width / 2, 0, width, SIZE);
  else for (let y = dash[1] / 2; y < SIZE; y += dash[0] + dash[1]) ctx.fillRect(x - width / 2, y, width, dash[0]);
  // Worn spots.
  ctx.fillStyle = 'rgba(40, 40, 42, 0.5)';
  for (let k = 0; k < 40; k++) ctx.fillRect(x - width / 2 + rand() * width, rand() * SIZE, 2 + rand() * 3, 2 + rand() * 4);
}

// Reinforced concrete deck plates, two by two a tile, joined by steel strips with bolt plates
// at the corners; scuffed, with a faded stencilled number.
function deck(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#4a4d4c';
  ctx.fillRect(0, 0, SIZE, SIZE);
  const n = 2, s = SIZE / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const shade = 66 + Math.floor(rand() * 8);
    ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade})`;
    ctx.fillRect(i * s + 9, j * s + 9, s - 18, s - 18);
  }
  grime(ctx, rand, ['#3c3f3e', '#5c605e', '#4a4640'], 7000, 3, 0.35);
  for (let k = 0; k < 3; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 30 + rand() * 40, '#2c2e2d', 0.35);
  // Steel joint strips with a lit edge.
  ctx.fillStyle = '#5d6366';
  for (let i = 0; i <= n; i++) { ctx.fillRect(i * s - 5, 0, 10, SIZE); ctx.fillRect(0, i * s - 5, SIZE, 10); }
  ctx.fillStyle = 'rgba(200, 210, 215, 0.25)';
  for (let i = 0; i <= n; i++) { ctx.fillRect(i * s - 5, 0, 2, SIZE); ctx.fillRect(0, i * s - 5, SIZE, 2); }
  // Bolt plates where the strips cross.
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    ctx.fillStyle = '#6b7175';
    ctx.fillRect(i * s - 16, j * s - 16, 32, 32);
    ctx.fillStyle = '#2a2d2f';
    for (const [bx, by] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) { ctx.beginPath(); ctx.arc(i * s + bx, j * s + by, 3, 0, Math.PI * 2); ctx.fill(); }
  }
  // A faded stencilled plate number.
  ctx.fillStyle = 'rgba(214, 220, 214, 0.18)';
  ctx.font = 'bold 44px monospace';
  ctx.fillText(`0${1 + Math.floor(rand() * 9)}`, s * 0.25, s * 0.62);
}

const YELLOW = 'rgba(222, 176, 52, 0.9)';
const WHITE = 'rgba(226, 229, 233, 0.75)';

const ROAD_DRAW: Record<RoadPiece, (ctx: CanvasRenderingContext2D, rand: () => number) => void> = {
  // City street: a double yellow line down the middle, white lines along the lane edges (just
  // clear of the sidewalks).
  cityStraight: (ctx, rand) => {
    asphalt(ctx, rand, 'city');
    paintLine(ctx, rand, SIZE / 2 - 9, 8, YELLOW);
    paintLine(ctx, rand, SIZE / 2 + 9, 8, YELLOW);
    paintLine(ctx, rand, SIZE * 0.2, 7, WHITE);
    paintLine(ctx, rand, SIZE * 0.8, 7, WHITE);
  },
  // The main boulevard: the city street's markings with a dashed lane line either side.
  avenue: (ctx, rand) => {
    asphalt(ctx, rand, 'city');
    paintLine(ctx, rand, SIZE / 2 - 9, 8, YELLOW);
    paintLine(ctx, rand, SIZE / 2 + 9, 8, YELLOW);
    paintLine(ctx, rand, SIZE * 0.35, 6, WHITE, [64, 64]);
    paintLine(ctx, rand, SIZE * 0.65, 6, WHITE, [64, 64]);
    paintLine(ctx, rand, SIZE * 0.2, 7, WHITE);
    paintLine(ctx, rand, SIZE * 0.8, 7, WHITE);
  },
  // City junction: no markings, a manhole cover.
  cityJunction: (ctx, rand) => {
    asphalt(ctx, rand, 'city');
    ctx.fillStyle = '#1c1d20';
    ctx.beginPath(); ctx.arc(SIZE * 0.62, SIZE * 0.4, 26, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3c3d42';
    ctx.lineWidth = 3;
    for (let r = 8; r < 26; r += 7) { ctx.beginPath(); ctx.arc(SIZE * 0.62, SIZE * 0.4, r, 0, Math.PI * 2); ctx.stroke(); }
  },
  // Suburban street: one faded dashed yellow line down the middle, no edge lines.
  suburbStraight: (ctx, rand) => {
    asphalt(ctx, rand, 'suburb');
    paintLine(ctx, rand, SIZE / 2, 9, 'rgba(214, 170, 60, 0.65)', [96, 160]);
  },
  suburbJunction: (ctx, rand) => asphalt(ctx, rand, 'suburb'),
  // Inside a base: deck plating.
  basePad: (ctx, rand) => deck(ctx, rand),
  // A lane through the base out to a gate: solid yellow edges and a dashed white centre line.
  baseLane: (ctx, rand) => {
    deck(ctx, rand);
    paintLine(ctx, rand, SIZE * 0.14, 10, YELLOW);
    paintLine(ctx, rand, SIZE * 0.86, 10, YELLOW);
    paintLine(ctx, rand, SIZE / 2, 8, WHITE, [96, 160]);
  },
};

export const createRoadTexture = (piece: RoadPiece) =>
  canvasTexture(ROAD_DRAW[piece], { cityStraight: 71, avenue: 73, cityJunction: 79, suburbStraight: 83, suburbJunction: 89, basePad: 97, baseLane: 101 }[piece]);

// --- Ground textures ---

const SIZE = 512;

// A small seeded generator, so a texture is the same every time it is drawn.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void, seed: number): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, seeded(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Fine grime: many faint specks of the given colours.
function grime(ctx: CanvasRenderingContext2D, rand: () => number, colors: string[], count: number, maxSize: number, alpha: number) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const s = rand() * maxSize + 0.5;
    ctx.fillRect(rand() * SIZE, rand() * SIZE, s, s);
  }
  ctx.globalAlpha = 1;
}

// A wandering crack.
function crack(ctx: CanvasRenderingContext2D, rand: () => number, color: string, width: number, steps: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let x = rand() * SIZE, y = rand() * SIZE;
  ctx.moveTo(x, y);
  for (let i = 0; i < steps; i++) {
    x += (rand() - 0.5) * 90;
    y += (rand() - 0.5) * 90;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// A soft round blot: oil, scorch, dirt.
function blot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// A tile of parking lot: asphalt with a driving aisle down the middle and a row of bays either
// side, marked with painted lines; the bays are empty. Laid out on the tile's own edges so bays
// run on unbroken from tile to tile.
function drawParking(ctx: CanvasRenderingContext2D, rand: () => number) {
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(0, 0, SIZE, SIZE);
  grime(ctx, rand, ['#202328', '#363a41'], 4000, 4, 0.3);
  for (let k = 0; k < 3; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 20 + rand() * 25, '#121417', 0.45);
  const bay = SIZE / 4, depth = SIZE * 0.34;
  ctx.strokeStyle = 'rgba(214, 218, 210, 0.5)';
  ctx.lineWidth = 5;
  for (const [y0, y1] of [[0, depth], [SIZE - depth, SIZE]]) {
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * bay, y0); ctx.lineTo(i * bay, y1); ctx.stroke(); }
  }
  // Bay ends along the aisle, and faded arrows down it.
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, depth); ctx.lineTo(SIZE, depth); ctx.moveTo(0, SIZE - depth); ctx.lineTo(SIZE, SIZE - depth); ctx.stroke();
  ctx.fillStyle = 'rgba(214, 218, 210, 0.22)';
  ctx.beginPath(); ctx.moveTo(SIZE * 0.42, SIZE * 0.47); ctx.lineTo(SIZE * 0.55, SIZE * 0.47); ctx.lineTo(SIZE * 0.55, SIZE * 0.44); ctx.lineTo(SIZE * 0.6, SIZE * 0.5); ctx.lineTo(SIZE * 0.55, SIZE * 0.56); ctx.lineTo(SIZE * 0.55, SIZE * 0.53); ctx.lineTo(SIZE * 0.42, SIZE * 0.53); ctx.closePath(); ctx.fill();
}

const DRAW: Record<GroundTexture, (ctx: CanvasRenderingContext2D, rand: () => number) => void> = {
  // Polished dark granite: two big slabs a tile, flecked grain, a soft sheen across them.
  granite: (ctx, rand) => {
    ctx.fillStyle = '#10131a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 2, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shade = 34 + Math.floor(rand() * 6);
      ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 16})`;
      ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
    // Grain: fine light and dark flecks.
    grime(ctx, rand, ['#5b6378', '#1a1e28', '#3c4356', '#7a7f96'], 9000, 2, 0.35);
    // A faint sheen, as if the stone catches the city lights.
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, 'rgba(160, 170, 210, 0)');
    g.addColorStop(0.5, 'rgba(160, 170, 210, 0.07)');
    g.addColorStop(1, 'rgba(160, 170, 210, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
  // Plaza stone laid in a diamond lattice in two tones, each diamond with a lighter centre stone:
  // symmetric every way, so it carries on across tiles however a tile is turned.
  plazaStone: (ctx, rand) => {
    ctx.fillStyle = '#262a36';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 4, s = SIZE / n;
    const diamond = (cx: number, cy: number, r: number) => {
      ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
    };
    // Two lattices of diamonds, one centred on the grid points and one in between.
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const shade = 58 + Math.floor(rand() * 6);
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 14})`;
      diamond(i * s, j * s, s / 2 - 3);
      if (i < n && j < n) {
        const dark = 44 + Math.floor(rand() * 5);
        ctx.fillStyle = `rgb(${dark}, ${dark + 3}, ${dark + 12})`;
        diamond(i * s + s / 2, j * s + s / 2, s / 2 - 3);
        ctx.fillStyle = 'rgba(140, 150, 180, 0.16)';
        diamond(i * s + s / 2, j * s + s / 2, s / 6);
      }
    }
    grime(ctx, rand, ['#20232d', '#5a6072'], 3000, 2, 0.25);
  },
  // Light concrete slabs in a 2x2 grid with a fine border joint: the paved edge of a midtown block.
  paving: (ctx, rand) => {
    ctx.fillStyle = '#5a606b';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 2, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shade = 104 + Math.floor(rand() * 10);
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 9})`;
      ctx.fillRect(i * s + 4, j * s + 4, s - 8, s - 8);
    }
    grime(ctx, rand, ['#5d636e', '#868c97', '#767b84'], 4000, 3, 0.35);
    // Scored lines across each slab, and a few weathered stains.
    ctx.strokeStyle = 'rgba(70, 76, 86, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      ctx.beginPath(); ctx.moveTo(i * s + s / 2, 4); ctx.lineTo(i * s + s / 2, SIZE - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, i * s + s / 2); ctx.lineTo(SIZE - 4, i * s + s / 2); ctx.stroke();
    }
    for (let k = 0; k < 3; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 30 + rand() * 40, '#4a4f58', 0.25);
  },
  // Grass, seamless so a courtyard of several tiles reads as one lawn: blades in three greens over
  // soft patches, nothing that lines up with the tile edge.
  lawn: (ctx, rand) => {
    ctx.fillStyle = '#2f4b2f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // Soft lighter and darker patches, drawn wrapped round the edges so tiles join without a seam.
    for (let k = 0; k < 10; k++) {
      const x = rand() * SIZE, y = rand() * SIZE, r = 50 + rand() * 80;
      const color = rand() > 0.5 ? '#3d6239' : '#243d26';
      for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) blot(ctx, x + ox, y + oy, r, color, 0.45);
    }
    // Blades: short strokes leaning every way.
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 9000; k++) {
      const x = rand() * SIZE, y = rand() * SIZE, a = rand() * Math.PI * 2, l = 3 + rand() * 4;
      const c = rand();
      ctx.strokeStyle = c > 0.66 ? 'rgba(92, 140, 80, 0.55)' : c > 0.33 ? 'rgba(62, 104, 58, 0.55)' : 'rgba(30, 52, 32, 0.5)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    // A few small flowers and clover.
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(214, 220, 160, 0.5)' : 'rgba(150, 190, 120, 0.5)';
      ctx.fillRect(rand() * SIZE, rand() * SIZE, 2, 2);
    }
  },
  // Concrete with expansion joints and fine grime. The tracks, oil and hazard stripes are painted
  // over the whole yard by IndustrialYard.tsx, so they line up with the sheds.
  yard: (ctx, rand) => {
    ctx.fillStyle = '#3a3c3f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    grime(ctx, rand, ['#2b2c2e', '#4a4b4d', '#403a33'], 5000, 4, 0.3);
    ctx.strokeStyle = '#26282b';
    ctx.lineWidth = 3;
    for (const p of [SIZE / 2]) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
    }
    for (let k = 0; k < 2; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 40 + rand() * 50, '#2e2f31', 0.35);
  },
  // Small dark-grey square pavers with a darker border band: the walkways round an outskirts block.
  walkway: (ctx, rand) => {
    ctx.fillStyle = '#1f2329';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 8, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shade = 52 + Math.floor(rand() * 9);
      ctx.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 8})`;
      ctx.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
    grime(ctx, rand, ['#2a2e35', '#4b5059'], 3000, 3, 0.3);
    for (let k = 0; k < 3; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 25 + rand() * 35, '#15181c', 0.3);
    crack(ctx, rand, '#1a1d22', 1.5, 4);
  },
  parking: (ctx, rand) => drawParking(ctx, rand),
  // Compacted military gravel: dark crushed stone in greys and browns, with faint track ruts.
  gravel: (ctx, rand) => {
    ctx.fillStyle = '#37382f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    for (let k = 0; k < 7000; k++) {
      const c = rand();
      ctx.fillStyle = c > 0.75 ? '#5b5a50' : c > 0.5 ? '#4a4a42' : c > 0.25 ? '#2b2c26' : '#504638';
      const x = rand() * SIZE, y = rand() * SIZE, r = 1.5 + rand() * 3.5;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 0.8); ctx.lineTo(x - r * 0.9, y); ctx.closePath(); ctx.fill();
    }
    for (let k = 0; k < 4; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 40 + rand() * 50, '#25261f', 0.3);
  },
  // Big weathered concrete slabs: four to a tile, each a slightly different shade, with wide
  // joints, dust, a few hairline cracks and chipped corners.
  slab: (ctx, rand) => {
    ctx.fillStyle = '#26282c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 2, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shade = 66 + Math.floor(rand() * 14);
      ctx.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 4})`;
      ctx.fillRect(i * s + 6, j * s + 6, s - 12, s - 12);
      // A chipped corner.
      if (rand() < 0.5) {
        const cx = i * s + (rand() < 0.5 ? 6 : s - 6), cy = j * s + (rand() < 0.5 ? 6 : s - 6), r = 10 + rand() * 14;
        ctx.fillStyle = '#2a2c30';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + (cx > i * s + s / 2 ? -r : r), cy); ctx.lineTo(cx, cy + (cy > j * s + s / 2 ? -r : r)); ctx.closePath(); ctx.fill();
      }
    }
    grime(ctx, rand, ['#3e4146', '#5a5d63', '#4a4642'], 5000, 3, 0.3);
    for (let k = 0; k < 4; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 40 + rand() * 50, '#33353a', 0.35);
    for (let k = 0; k < 3; k++) crack(ctx, rand, 'rgba(24, 25, 28, 0.8)', 1.5, 4);
  },
};

export const createGroundTexture = (style: GroundTexture) =>
  canvasTexture(DRAW[style], { granite: 11, plazaStone: 13, paving: 23, lawn: 29, walkway: 31, parking: 41, yard: 37, slab: 53, gravel: 59 }[style]);

// --- Streetscape textures ---

// A sidewalk slab: light concrete with joints, and a pale kerb edge along one long side.
export const createSidewalkTexture = () => canvasTexture((ctx, rand) => {
  ctx.fillStyle = '#4a5363';
  ctx.fillRect(0, 0, SIZE, SIZE);
  grime(ctx, rand, ['#3c4452', '#576072'], 2500, 3, 0.3);
  ctx.strokeStyle = '#323946';
  ctx.lineWidth = 6;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo((i * SIZE) / 4, 0); ctx.lineTo((i * SIZE) / 4, SIZE); ctx.stroke(); }
  // Pale kerb edges along both long sides.
  ctx.fillStyle = '#7b8596';
  ctx.fillRect(0, 0, SIZE, 40);
  ctx.fillRect(0, SIZE - 40, SIZE, 40);
}, 61);

// Zebra crossing bars, on a transparent background.
export const createCrosswalkTexture = () => {
  if (typeof document === 'undefined') return new THREE.Texture();
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
    for (let x = 14; x < 256; x += 38) ctx.fillRect(x, 20, 20, 216);
  }
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
};
