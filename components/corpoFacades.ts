// The look of the corporate towers downtown and in the core: a handful of facade styles taken from
// Night City's centre, so the towers stand apart from each other while still reading as one
// district. Each building gets one style for all its tiles, picked by hand for every tower on
// blue's side (CURATED) and given to its twin across the map too, and one of a few shades of
// its style's body colour.
//
//   monolith   near-black, a scatter of warm windows, full-height white light strips
//   goldscale  dark, with glowing panels of gold scales across its two broad faces
//   office     slate blue, dense rows of cool white office windows
//   brutalist  charcoal, horizontal louvre fins, an amber light line round it
//   ticker     dark, bands of red LED readouts between thin white lines
//
// Each tower also gets its own massing (how it steps in on the way up) and crown, so towers
// side by side differ in silhouette as well as dress.
//
// Used by FootprintBuilding.tsx; Building.tsx takes the body colour from here.

import * as THREE from 'three';
import { CITY_CONFIG } from '../constants';
import type { BuildingData } from '../types';

export type FacadeName = 'monolith' | 'goldscale' | 'office' | 'brutalist' | 'ticker';

export interface Facade {
  name: FacadeName;
  // The body's colour, unlit: one of `bodies`, picked per building.
  body: string;
  bodies: string[];
  // The neon line round the top and the crown.
  accent: string;
  // The window texture covers texW x texH world units and repeats.
  texW: number;
  texH: number;
  // Full-height light strips on each tile's stretch of outside wall, and their colour.
  strips?: { count: number; color: string };
  // A light line right round the building at this share of its height.
  band?: { at: number; color: string };
  // Gold scale panels on its two broad faces.
  scales?: boolean;
  // The building's own shape (set per building by facadeOf).
  massing?: Massing;
  crown?: Crown;
}

export const FACADES: Record<FacadeName, Facade> = {
  monolith: { name: 'monolith', body: '#262a33', bodies: ['#262a33', '#2d2f35', '#22262f'], accent: '#f8fafc', texW: 5, texH: 5, strips: { count: 2, color: '#f1f5f9' } },
  goldscale: { name: 'goldscale', body: '#2b2620', bodies: ['#2b2620', '#302a22'], accent: '#fbbf24', texW: 5, texH: 5, scales: true },
  office: { name: 'office', body: '#243247', bodies: ['#243247', '#29384a', '#26323d'], accent: '#7dd3fc', texW: 6, texH: 4 },
  brutalist: { name: 'brutalist', body: '#383a3f', bodies: ['#383a3f', '#3f3d39', '#353a40'], accent: '#facc15', texW: 8, texH: 3, band: { at: 0.32, color: '#fde047' } },
  ticker: { name: 'ticker', body: '#221f2a', bodies: ['#221f2a', '#272229'], accent: '#ff2d55', texW: 7, texH: 6, strips: { count: 1, color: '#e2e8f0' } },
};

// How a tower is massed, from the ground up: the heights (shares of its height) where its
// outside walls step in.
//   straight   one sheer box
//   setback    steps in once, about 60% up
//   stepped    steps in twice, wedding-cake style
//   plinth     a broad base a fifth of the way up, then a slimmer shaft
//   crownstep  sheer almost to the top, then a narrower crown storey
export type Massing = 'straight' | 'setback' | 'stepped' | 'plinth' | 'crownstep';
export const MASSING_STEPS: Record<Massing, number[]> = {
  straight: [], setback: [0.6], stepped: [0.45, 0.75], plinth: [0.22], crownstep: [0.86],
};
// What stands on the roof.
//   spire     a crown block, a neon band and a mast with a red light
//   stepped   three stacked, shrinking blocks
//   helipad   a landing pad with a lit ring and corner lights
//   antennas  a cluster of masts of different heights
//   blade     a tall thin fin with a neon edge
export type Crown = 'spire' | 'stepped' | 'helipad' | 'antennas' | 'blade';

// Every corporate tower on blue's side, by the corner of its footprint (sim/cityPlan.ts): its
// facade, its massing and its crown; its twin across the centre is the same. Laid out so towers
// side by side never share a look and a silhouette, with the gold-scaled towers flanking the
// boulevard into the plaza and on the big corner block.
const CURATED: Record<string, [FacadeName, Massing, Crown]> = {
  // Corner block (4,4).
  '27,27': ['goldscale', 'setback', 'spire'], '25,25': ['office', 'plinth', 'helipad'], '28,25': ['ticker', 'straight', 'antennas'], '25,28': ['ticker', 'straight', 'blade'],
  // Block (5,4).
  '31,25': ['monolith', 'stepped', 'spire'], '34,25': ['brutalist', 'straight', 'blade'], '34,28': ['office', 'setback', 'antennas'], '31,29': ['brutalist', 'straight', 'helipad'],
  // Block (6,4), either side of the boulevard.
  '37,25': ['monolith', 'setback', 'stepped'], '40,25': ['office', 'plinth', 'spire'], '37,28': ['brutalist', 'plinth', 'helipad'], '41,28': ['ticker', 'straight', 'blade'],
  // Block (7,4).
  '43,25': ['brutalist', 'crownstep', 'antennas'], '46,25': ['monolith', 'stepped', 'helipad'], '43,28': ['office', 'straight', 'antennas'], '45,28': ['monolith', 'plinth', 'stepped'],
  // The core, either side of the boulevard into the plaza.
  '37,31': ['goldscale', 'setback', 'spire'], '40,31': ['goldscale', 'stepped', 'helipad'], '31,37': ['monolith', 'stepped', 'spire'], '31,40': ['monolith', 'setback', 'helipad'],
  // Block (4,5).
  '25,31': ['monolith', 'stepped', 'spire'], '29,31': ['ticker', 'straight', 'blade'], '25,34': ['brutalist', 'straight', 'antennas'], '27,34': ['office', 'crownstep', 'stepped'],
  // Block (4,6), either side of the boulevard.
  '25,37': ['brutalist', 'setback', 'helipad'], '28,37': ['ticker', 'straight', 'blade'], '26,40': ['office', 'plinth', 'antennas'], '29,40': ['brutalist', 'crownstep', 'antennas'],
  // Block (4,7).
  '25,43': ['ticker', 'straight', 'antennas'], '27,43': ['office', 'stepped', 'spire'], '25,46': ['brutalist', 'plinth', 'stepped'], '29,46': ['monolith', 'straight', 'blade'],
};

type Footprint = NonNullable<BuildingData['footprint']>;

// The style of a building, the same for it and its twin across the centre.
export function facadeOf(f: Footprint, gridSize = CITY_CONFIG.gridSize): Facade {
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  // Blue's side of the pair.
  const [bx, bz] = f.x + f.z <= tx + tz ? [f.x, f.z] : [tx, tz];
  const h = Math.sin((bx * gridSize + bz) * 12.9898 + 4.1) * 43758.5453;
  const r = h - Math.floor(h);
  const [name, massing, crown] = CURATED[`${bx},${bz}`] ?? ['monolith', 'straight', 'spire'];
  const style = FACADES[name];
  return { ...style, body: style.bodies[Math.floor(r * style.bodies.length)], massing, crown };
}

export type Side = 'west' | 'east' | 'north' | 'south';
// The faces that carry the gold scales: the building's two broad faces, so blue's camera
// (looking toward the centre, at north and west faces) and red's (at south and east) both see one.
export function featureSides(f: Footprint): Side[] {
  return f.w >= f.d ? ['north', 'south'] : ['west', 'east'];
}

// --- Textures, drawn once each, seeded so every player sees the same ---

function canvas(size: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  draw(g, rnd);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const WINDOWS: Record<FacadeName, (g: CanvasRenderingContext2D, rnd: () => number) => void> = {
  // A few small warm windows lit in a dark slab.
  monolith: (g, rnd) => {
    for (let col = 0; col < 6; col++) for (let row = 0; row < 8; row++) {
      const lit = rnd();
      if (lit < 0.75) continue;
      g.fillStyle = lit > 0.93 ? 'rgba(255,255,255,0.85)' : 'rgba(253,214,150,0.75)';
      g.fillRect(col * 21 + 6, row * 16 + 5, 9, 6);
    }
  },
  // Sparse amber windows; the gold panel is drawn on its own.
  goldscale: (g, rnd) => {
    for (let col = 0; col < 6; col++) for (let row = 0; row < 8; row++) {
      if (rnd() < 0.8) continue;
      g.fillStyle = 'rgba(251,191,36,0.7)';
      g.fillRect(col * 21 + 6, row * 16 + 5, 9, 6);
    }
  },
  // Dense office floors: most windows lit cool white, some cyan, some dark.
  office: (g, rnd) => {
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 10; col++) {
        const lit = rnd();
        g.fillStyle = lit > 0.35 ? (lit > 0.9 ? 'rgba(165,243,252,0.75)' : 'rgba(226,236,250,0.62)') : 'rgba(100,116,139,0.12)';
        g.fillRect(col * 12.8 + 2, row * 16 + 4, 9, 9);
      }
    }
  },
  // Horizontal louvre fins catching the light, and the odd warm slit window between them.
  brutalist: (g, rnd) => {
    for (let row = 0; row < 8; row++) {
      g.fillStyle = 'rgba(148,153,160,0.22)';
      g.fillRect(0, row * 16 + 2, 128, 4);
      g.fillStyle = 'rgba(30,32,36,0.3)';
      g.fillRect(0, row * 16 + 6, 128, 2);
      for (let col = 0; col < 8; col++) if (rnd() > 0.82) { g.fillStyle = 'rgba(253,224,160,0.7)'; g.fillRect(col * 16 + 3, row * 16 + 9, 10, 3); }
    }
  },
  // Bands of red LED readout: rows of little glyph blocks, between thin white lines.
  ticker: (g, rnd) => {
    for (let band = 0; band < 4; band++) {
      const y = band * 32;
      g.fillStyle = 'rgba(226,232,240,0.5)';
      g.fillRect(0, y + 2, 128, 1.5);
      for (let x = 2; x < 126; x += 4) {
        if (rnd() < 0.3) continue;
        const rows = 1 + Math.floor(rnd() * 3);
        for (let r = 0; r < rows; r++) {
          g.fillStyle = rnd() > 0.2 ? 'rgba(255,45,85,0.85)' : 'rgba(255,120,120,0.9)';
          g.fillRect(x, y + 10 + r * 4 + Math.floor(rnd() * 6), 3, 3);
        }
      }
    }
  },
};

const windowMaterials = new Map<FacadeName, THREE.MeshBasicMaterial>();
export function facadeWindowMaterial(name: FacadeName): THREE.MeshBasicMaterial {
  let m = windowMaterials.get(name);
  if (!m) {
    const tex = canvas(128, WINDOWS[name], 977 + name.length * 31);
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    windowMaterials.set(name, m);
  }
  return m;
}

// Gold scales: rows of overlapping rounded diamonds, lit from within, brighter at the centre.
let scaleMaterial: THREE.MeshBasicMaterial | null = null;
export function goldScaleMaterial(): THREE.MeshBasicMaterial {
  if (scaleMaterial) return scaleMaterial;
  const tex = canvas(128, (g, rnd) => {
    const w = 32, h = 40;
    for (let row = -1; row < 128 / (h / 2) + 1; row++) {
      for (let col = -1; col < 128 / w + 1; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0), cy = row * (h / 2);
        const glow = g.createRadialGradient(cx, cy, 2, cx, cy, h / 2);
        const b = 0.75 + rnd() * 0.25;
        glow.addColorStop(0, `rgba(255,236,170,${b})`);
        glow.addColorStop(0.7, `rgba(250,190,70,${b * 0.85})`);
        glow.addColorStop(1, 'rgba(180,110,20,0.5)');
        g.fillStyle = glow;
        g.beginPath();
        g.moveTo(cx, cy - h / 2 + 2);
        g.quadraticCurveTo(cx + w / 2 - 1, cy - 2, cx, cy + h / 2 - 2);
        g.quadraticCurveTo(cx - w / 2 + 1, cy - 2, cx, cy - h / 2 + 2);
        g.fill();
      }
    }
  }, 4242);
  scaleMaterial = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  return scaleMaterial;
}
