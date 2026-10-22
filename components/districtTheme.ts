// How each district looks at street level: its open ground, the tint on its streets, and whether
// its roads get sidewalks and crosswalks. The data side of the map dressing; RoadSystem.tsx and
// Streetscape.tsx draw it. Districts come from sim/districts.ts and set how blocks are built up in
// sim/mapgen.ts; this is the same zoning seen from the ground.
//
// The ground textures are drawn on a canvas, seeded so they come out the same every load. Kept in
// the night palette and low in contrast, so units, selection rings and the grid stay readable on
// top of them, and free of blue and red, the team colours.

import * as THREE from 'three';
import { District, districtOfBlock } from '../sim/districts';

export type GroundStyle = 'plaza' | 'courtyard' | 'yard' | 'lot' | 'scorched' | 'hex';

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
  // Midtown: block-paved courtyards and sidewalks, no crosswalks.
  midtown: { ground: 'courtyard', streetTint: '#98a6b8', sidewalks: true, crosswalks: false },
  // Industrial: stained concrete yards, warmer and dirtier streets.
  industrial: { ground: 'yard', streetTint: '#a39a8c', sidewalks: false, crosswalks: false },
  // Outskirts and fringe: cracked lots, then scorched rubble toward the Blackwall.
  outskirts: { ground: 'lot', streetTint: '#8f98a6', sidewalks: false, crosswalks: false },
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

const DRAW: Record<Exclude<GroundStyle, 'hex'>, (ctx: CanvasRenderingContext2D, rand: () => number) => void> = {
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
  // Small block pavers in two tones with a planted bed: residential courtyards.
  courtyard: (ctx, rand) => {
    ctx.fillStyle = '#30343f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const s = SIZE / 12;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const offsetX = (j % 2) * s / 2;
      const shade = 46 + Math.floor(rand() * 12);
      ctx.fillStyle = `rgb(${shade + 6}, ${shade + 2}, ${shade})`;
      ctx.fillRect(i * s + offsetX + 1, j * s + 1, s - 2, s - 2);
    }
    grime(ctx, rand, ['#23262e', '#4a4c55'], 1800, 3, 0.25);
    // A planted bed with a low kerb.
    const bx = SIZE * 0.12, by = SIZE * 0.14, bw = SIZE * 0.3, bh = SIZE * 0.22;
    ctx.fillStyle = '#4a4f5a';
    ctx.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
    ctx.fillStyle = '#1f3027';
    ctx.fillRect(bx, by, bw, bh);
    for (let k = 0; k < 220; k++) {
      ctx.fillStyle = rand() > 0.5 ? '#2c4a36' : '#3a6146';
      ctx.fillRect(bx + rand() * bw, by + rand() * bh, 3, 3);
    }
  },
  // Stained concrete with expansion joints, oil spots, tyre tracks and a hazard-striped edge.
  yard: (ctx, rand) => {
    ctx.fillStyle = '#3a3c3f';
    ctx.fillRect(0, 0, SIZE, SIZE);
    grime(ctx, rand, ['#2b2c2e', '#4a4b4d', '#403a33'], 5000, 4, 0.3);
    ctx.strokeStyle = '#26282b';
    ctx.lineWidth = 3;
    for (const p of [SIZE / 3, (2 * SIZE) / 3]) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
    }
    for (let k = 0; k < 5; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 25 + rand() * 45, '#0e0f10', 0.55);
    // Tyre tracks.
    ctx.strokeStyle = 'rgba(20, 20, 20, 0.22)';
    ctx.lineWidth = 9;
    for (const dx of [0, 26]) {
      ctx.beginPath();
      ctx.moveTo(SIZE * 0.2 + dx, SIZE);
      ctx.bezierCurveTo(SIZE * 0.3 + dx, SIZE * 0.6, SIZE * 0.55 + dx, SIZE * 0.45, SIZE * 0.7 + dx, 0);
      ctx.stroke();
    }
    // Faded hazard stripes along one edge.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, SIZE - 34, SIZE, 34); ctx.clip();
    for (let x = -40; x < SIZE + 40; x += 40) {
      ctx.fillStyle = 'rgba(234, 179, 8, 0.3)';
      ctx.beginPath(); ctx.moveTo(x, SIZE); ctx.lineTo(x + 20, SIZE); ctx.lineTo(x + 54, SIZE - 34); ctx.lineTo(x + 34, SIZE - 34); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    crack(ctx, rand, '#1d1e20', 2, 6);
  },
  // Old cracked asphalt with dirt and weeds coming through.
  lot: (ctx, rand) => {
    ctx.fillStyle = '#2f333b';
    ctx.fillRect(0, 0, SIZE, SIZE);
    grime(ctx, rand, ['#262a31', '#3b4049'], 4000, 4, 0.3);
    for (let k = 0; k < 4; k++) blot(ctx, rand() * SIZE, rand() * SIZE, 40 + rand() * 60, '#4a3d2c', 0.45);
    for (let k = 0; k < 7; k++) crack(ctx, rand, '#181b20', 2 + rand() * 2, 7);
    for (let k = 0; k < 160; k++) {
      ctx.fillStyle = rand() > 0.5 ? '#3b5236' : '#2d4229';
      ctx.fillRect(rand() * SIZE, rand() * SIZE, 2 + rand() * 3, 2 + rand() * 3);
    }
    // Faded parking lines.
    ctx.strokeStyle = 'rgba(200, 200, 190, 0.18)';
    ctx.lineWidth = 5;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(60 + k * 110, 40); ctx.lineTo(60 + k * 110, 200); ctx.stroke(); }
  },
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

export const createGroundTexture = (style: Exclude<GroundStyle, 'hex'>) =>
  canvasTexture(DRAW[style], { plaza: 11, courtyard: 23, yard: 37, lot: 41, scorched: 53 }[style]);

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
