// Surface detail drawn in code, for the unit kit (components/kit): no image files.
//
// The armour detail map is greyscale and multiplies a material's own colour, so one texture serves
// every paint: a panel seam round the edge with rivets along it, two inner seams, light edge wear,
// speckle, and grime gathering low down. Kit geometry maps it once onto each face of a part
// (shapes.tsx), so every face reads as one armour panel. A matching bump map sinks the seams and
// raises the rivets. Also here: tank tread (scrolled to make tracks run), hazard stripes, and an
// engine grille.

import * as THREE from 'three';

const SIZE = 256;

// A small seeded random, so the textures come out the same every load.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w = SIZE, h = SIZE) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

function texture(c: HTMLCanvasElement, srgb: boolean, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Where the seams and rivets sit, shared by the detail and bump maps.
const BORDER = 9;
const SEAMS = { h: Math.round(SIZE * 0.42), v: Math.round(SIZE * 0.64) };
const rivets = () => {
  const out: [number, number][] = [];
  for (let i = 24; i < SIZE - 16; i += 30) out.push([i, BORDER + 6], [i, SIZE - BORDER - 6], [BORDER + 6, i], [SIZE - BORDER - 6, i]);
  return out;
};

let armourDetail: THREE.CanvasTexture | null = null;
let armourBump: THREE.CanvasTexture | null = null;

export function armourDetailMap(): THREE.CanvasTexture {
  if (armourDetail) return armourDetail;
  const { c, g } = canvas();
  const r = rng(7);
  g.fillStyle = 'rgb(226,226,226)';
  g.fillRect(0, 0, SIZE, SIZE);
  // Speckle.
  for (let i = 0; i < 2600; i++) {
    const v = 200 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * SIZE, r() * SIZE, 1 + r() * 2, 1 + r() * 2);
  }
  // Grime: darker toward the bottom of the panel, in soft blotches.
  const grime = g.createLinearGradient(0, SIZE * 0.45, 0, SIZE);
  grime.addColorStop(0, 'rgba(40,36,32,0)');
  grime.addColorStop(1, 'rgba(40,36,32,0.28)');
  g.fillStyle = grime;
  g.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 18; i++) {
    const x = r() * SIZE, y = SIZE * (0.5 + r() * 0.5), rad = 10 + r() * 30;
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, 'rgba(30,28,26,0.18)');
    b.addColorStop(1, 'rgba(30,28,26,0)');
    g.fillStyle = b;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Seams.
  g.strokeStyle = 'rgb(92,92,92)';
  g.lineWidth = 3;
  g.strokeRect(BORDER, BORDER, SIZE - BORDER * 2, SIZE - BORDER * 2);
  g.lineWidth = 2;
  g.strokeStyle = 'rgb(120,120,120)';
  g.beginPath(); g.moveTo(BORDER, SEAMS.h); g.lineTo(SIZE - BORDER, SEAMS.h); g.stroke();
  g.beginPath(); g.moveTo(SEAMS.v, SEAMS.h); g.lineTo(SEAMS.v, SIZE - BORDER); g.stroke();
  // Light catching each seam's lower lip.
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.strokeRect(BORDER + 2, BORDER + 2, SIZE - BORDER * 2 - 4, SIZE - BORDER * 2 - 4);
  // Rivets.
  for (const [x, y] of rivets()) {
    g.fillStyle = 'rgb(110,110,110)';
    g.beginPath(); g.arc(x, y, 3.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgb(245,245,245)';
    g.beginPath(); g.arc(x - 0.8, y - 0.8, 1.4, 0, Math.PI * 2); g.fill();
  }
  // Edge wear: bright metal showing through near the panel's edges.
  for (let i = 0; i < 900; i++) {
    const side = Math.floor(r() * 4), along = r() * SIZE, depth = Math.pow(r(), 2.5) * 14;
    const [x, y] = side === 0 ? [along, depth] : side === 1 ? [along, SIZE - depth] : side === 2 ? [depth, along] : [SIZE - depth, along];
    g.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
    g.fillRect(x, y, 1 + r() * 2.5, 1 + r() * 1.5);
  }
  armourDetail = texture(c, true);
  return armourDetail;
}

export function armourBumpMap(): THREE.CanvasTexture {
  if (armourBump) return armourBump;
  const { c, g } = canvas();
  g.fillStyle = 'rgb(160,160,160)';
  g.fillRect(0, 0, SIZE, SIZE);
  g.strokeStyle = 'rgb(40,40,40)';
  g.lineWidth = 3;
  g.strokeRect(BORDER, BORDER, SIZE - BORDER * 2, SIZE - BORDER * 2);
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(BORDER, SEAMS.h); g.lineTo(SIZE - BORDER, SEAMS.h); g.stroke();
  g.beginPath(); g.moveTo(SEAMS.v, SEAMS.h); g.lineTo(SEAMS.v, SIZE - BORDER); g.stroke();
  for (const [x, y] of rivets()) {
    const b = g.createRadialGradient(x, y, 0, x, y, 3.5);
    b.addColorStop(0, 'rgb(255,255,255)');
    b.addColorStop(1, 'rgb(160,160,160)');
    g.fillStyle = b;
    g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill();
  }
  armourBump = texture(c, false);
  return armourBump;
}

let tread: THREE.CanvasTexture | null = null;
// Track links: dark rubber pads with raised steel cleats across them. Repeats along the track.
export function treadMap(): THREE.CanvasTexture {
  if (tread) return tread;
  const { c, g } = canvas(64, 64);
  g.fillStyle = 'rgb(46,48,52)';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 16) {
    g.fillStyle = 'rgb(118,122,128)';
    g.fillRect(0, y + 2, 64, 6);
    g.fillStyle = 'rgb(160,164,170)';
    g.fillRect(0, y + 2, 64, 1.5);
    g.fillStyle = 'rgb(22,23,26)';
    g.fillRect(0, y + 10, 64, 2);
    g.fillStyle = 'rgb(90,94,100)';
    g.fillRect(28, y + 8, 8, 6);
  }
  tread = texture(c, true, true);
  return tread;
}

let hazard: THREE.CanvasTexture | null = null;
// Yellow and black warning stripes.
export function hazardMap(): THREE.CanvasTexture {
  if (hazard) return hazard;
  const { c, g } = canvas(128, 32);
  g.fillStyle = '#f2c230';
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = '#16171a';
  for (let x = -32; x < 160; x += 24) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 12, 32); g.lineTo(x + 44, 0); g.lineTo(x + 32, 0); g.closePath(); g.fill();
  }
  hazard = texture(c, true);
  return hazard;
}

let grille: THREE.CanvasTexture | null = null;
// An engine deck grille: dark slots between slats.
export function grilleMap(): THREE.CanvasTexture {
  if (grille) return grille;
  const { c, g } = canvas(64, 64);
  g.fillStyle = 'rgb(150,154,160)';
  g.fillRect(0, 0, 64, 64);
  for (let y = 4; y < 64; y += 8) {
    g.fillStyle = 'rgb(18,19,22)';
    g.fillRect(4, y, 56, 4);
  }
  g.strokeStyle = 'rgb(80,82,88)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, 61, 61);
  grille = texture(c, true);
  return grille;
}

let shadow: THREE.CanvasTexture | null = null;
// A soft dark blot for under a unit, where it meets the ground.
export function contactShadowMap(): THREE.CanvasTexture {
  if (shadow) return shadow;
  const { c, g } = canvas(64, 64);
  const b = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  b.addColorStop(0, 'rgba(0,0,0,0.75)');
  b.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  b.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = b;
  g.fillRect(0, 0, 64, 64);
  shadow = texture(c, false);
  return shadow;
}
