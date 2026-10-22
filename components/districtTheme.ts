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

// 'courtyard' and 'carpark' are a district's choice, not textures: each block is ringed along the
// street with one ground and filled in the middle with another (see groundOfTile):
//   courtyard  light concrete 'paving' round a 'lawn'
//   carpark    dark 'walkway' pavers round empty 'parking' bays
export type GroundStyle = 'plaza' | 'courtyard' | 'paving' | 'lawn' | 'carpark' | 'walkway' | 'parking' | 'yard' | 'scorched' | 'hex';
type SplitGround = 'courtyard' | 'carpark';
export type TileGround = Exclude<GroundStyle, SplitGround>;
export type GroundTexture = Exclude<TileGround, 'hex'>;

export interface DistrictTheme {
  ground: GroundStyle;
  // Multiplies the street texture: a cast for the district.
  streetTint: string;
  sidewalks: boolean;
  crosswalks: boolean;
}

export const DISTRICT_THEMES: Record<District, DistrictTheme> = {
  // Corporate core and downtown: paved plazas, sidewalks, crosswalks.
  core: { ground: 'plaza', streetTint: '#a5b4c8', sidewalks: true, crosswalks: true },
  downtown: { ground: 'plaza', streetTint: '#9fb0c4', sidewalks: true, crosswalks: true },
  // Midtown: grass courtyards inside a ring of light paving, sidewalks, no crosswalks.
  midtown: { ground: 'courtyard', streetTint: '#98a6b8', sidewalks: true, crosswalks: false },
  // Industrial: stained concrete yards, warmer and dirtier streets.
  industrial: { ground: 'yard', streetTint: '#a39a8c', sidewalks: false, crosswalks: false },
  // Outskirts: dark paved walkways along the streets round parking lots. Fringe: scorched rubble
  // toward the Blackwall.
  outskirts: { ground: 'carpark', streetTint: '#8f98a6', sidewalks: false, crosswalks: false },
  fringe: { ground: 'scorched', streetTint: '#8a8486', sidewalks: false, crosswalks: false },
  // The bases keep the hex-grid ground they always had.
  base: { ground: 'hex', streetTint: '#94a3b8', sidewalks: false, crosswalks: false },
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
  if (ground !== 'courtyard' && ground !== 'carpark') return ground;
  const onStreet = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => districtAt(x + dx, z + dz, gridSize) === null);
  if (ground === 'courtyard') return onStreet ? 'paving' : 'lawn';
  return onStreet ? 'walkway' : 'parking';
}

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
  // Large paving slabs with tight joints and a faint inlaid light line: corporate plaza.
  plaza: (ctx, rand) => {
    ctx.fillStyle = '#2c3545';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const n = 4, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const shade = 40 + Math.floor(rand() * 10);
      ctx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 22})`;
      ctx.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
    }
    grime(ctx, rand, ['#1e2633', '#3c4759'], 2500, 3, 0.25);
    ctx.strokeStyle = '#161d29';
    ctx.lineWidth = 4;
    for (let i = 0; i <= n; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(SIZE, i * s); ctx.stroke();
    }
    // An inlaid light strip across the slabs, and a drain grate.
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.22)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, SIZE * 0.5); ctx.lineTo(SIZE, SIZE * 0.5); ctx.stroke();
    ctx.fillStyle = '#1a212d';
    ctx.fillRect(SIZE * 0.68, SIZE * 0.68, 60, 26);
    ctx.strokeStyle = '#2f3a4c';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(SIZE * 0.68 + 6 + k * 9, SIZE * 0.68 + 4); ctx.lineTo(SIZE * 0.68 + 6 + k * 9, SIZE * 0.68 + 22); ctx.stroke(); }
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
  // Rubble and scorch marks: the war-torn edge by the Blackwall.
  scorched: (ctx, rand) => {
    ctx.fillStyle = '#2a2729';
    ctx.fillRect(0, 0, SIZE, SIZE);
    grime(ctx, rand, ['#1c1a1b', '#3a3537', '#463b35'], 5000, 5, 0.35);
    for (let k = 0; k < 4; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 50 + rand() * 70, '#050404', 0.7);
    for (let k = 0; k < 6; k++) crack(ctx, rand, '#121011', 3, 8);
    // Chunks of broken concrete.
    for (let k = 0; k < 45; k++) {
      const x = rand() * SIZE, y = rand() * SIZE, s = 4 + rand() * 12;
      ctx.fillStyle = rand() > 0.5 ? '#4b4547' : '#3c3739';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s, y + s * 0.3); ctx.lineTo(x + s * 0.6, y + s); ctx.closePath(); ctx.fill();
    }
  },
};

export const createGroundTexture = (style: GroundTexture) =>
  canvasTexture(DRAW[style], { plaza: 11, paving: 23, lawn: 29, walkway: 31, parking: 41, yard: 37, scorched: 53 }[style]);

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
