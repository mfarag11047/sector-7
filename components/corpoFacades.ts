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

export type FacadeName = 'monolith' | 'goldscale' | 'office' | 'brutalist' | 'ticker'
  // Midtown's apartment blocks (midtownLooks.ts).
  | 'bands' | 'apartment' | 'balcony'
  // The outskirts' cheap housing (residentialLooks.ts).
  | 'tenement' | 'projects' | 'patched';

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
  // A ground storey of lit shopfronts under an awning.
  shops?: boolean;
  // Cheap-housing clutter: AC units bolted on the walls, and a zigzag fire escape down the
  // building's front.
  clutter?: boolean;
  fireEscape?: boolean;
}

export const FACADES: Record<FacadeName, Facade> = {
  monolith: { name: 'monolith', body: '#16181d', bodies: ['#16181d', '#3b3e45', '#2c2f36'], accent: '#f8fafc', texW: 5, texH: 5, strips: { count: 2, color: '#f1f5f9' } },
  goldscale: { name: 'goldscale', body: '#221e19', bodies: ['#221e19', '#433d35'], accent: '#fbbf24', texW: 5, texH: 5, scales: true },
  office: { name: 'office', body: '#1e2838', bodies: ['#1e2838', '#3a4352', '#2e3848'], accent: '#7dd3fc', texW: 6, texH: 4 },
  brutalist: { name: 'brutalist', body: '#2e3034', bodies: ['#2e3034', '#4b4d52', '#575960'], accent: '#facc15', texW: 8, texH: 3, band: { at: 0.32, color: '#fde047' } },
  ticker: { name: 'ticker', body: '#1a1820', bodies: ['#1a1820', '#3b3740'], accent: '#ff2d55', texW: 7, texH: 6, strips: { count: 1, color: '#e2e8f0' } },
  // Midtown: the data-centre bands it always had, apartment windows, balcony floors.
  bands: { name: 'bands', body: '#1f2d2a', bodies: ['#1f2d2a', '#22302e', '#1d2a2c'], accent: '#2dd4bf', texW: 7, texH: 6 },
  apartment: { name: 'apartment', body: '#26302e', bodies: ['#26302e', '#2b3330', '#252d33'], accent: '#5eead4', texW: 5, texH: 4 },
  balcony: { name: 'balcony', body: '#2a3331', bodies: ['#2a3331', '#2e3532', '#283035'], accent: '#a7f3d0', texW: 6, texH: 3.5 },
  // Outskirts: weathered paint and bare concrete, cramped lit windows.
  tenement: { name: 'tenement', body: '#4a3f38', bodies: ['#4a3f38', '#3f4a48', '#4d4436', '#45394a'], accent: '#38bdf8', texW: 4.5, texH: 3.6 },
  projects: { name: 'projects', body: '#4b4e52', bodies: ['#4b4e52', '#55524b', '#474c55'], accent: '#7dd3fc', texW: 6, texH: 3.4 },
  patched: { name: 'patched', body: '#3c4146', bodies: ['#3c4146', '#463f3b', '#3a4440'], accent: '#f472b6', texW: 7, texH: 7 },
};

// How a tower is massed, from the ground up: at each share of its height, how many steps its
// outside walls stand in from the footprint (negative: out past it, overhanging the street).
//   straight    one sheer box
//   setback     steps in once, about 60% up
//   stepped     steps in twice, wedding-cake style
//   plinth      a broad base a fifth of the way up, then a slimmer shaft
//   crownstep   sheer almost to the top, then a narrower crown storey
//   cantilever  a heavy upper mass overhanging the street from just over halfway up
//   waist       a deep recessed band of open floors partway up, the mass carrying on above it
//   topheavy    narrow at the foot, swelling out into a broad mass above a third of the way up
export type Massing = 'straight' | 'setback' | 'stepped' | 'plinth' | 'crownstep' | 'cantilever' | 'waist' | 'topheavy';
export const MASSING_STEPS: Record<Massing, [number, number][]> = {
  straight: [], setback: [[0.6, 1]], stepped: [[0.45, 1], [0.75, 2]], plinth: [[0.22, 1]], crownstep: [[0.86, 1]],
  cantilever: [[0.58, -4]], waist: [[0.42, 4], [0.54, 0]], topheavy: [[0, 3], [0.32, -2.5]],
};
// What stands on the roof.
//   spire     a crown block, a neon band and a mast with a red light
//   stepped   three stacked, shrinking blocks
//   helipad   a landing pad with a lit ring and corner lights
//   antennas  a cluster of masts of different heights
//   blade     a tall thin fin with a neon edge
//   beacon    a holo-projector throwing a column of light into the sky, ringed with turning
//             holographic ad bands
export type Crown = 'spire' | 'stepped' | 'helipad' | 'antennas' | 'blade' | 'beacon'
  // Apartment roofs: water tanks, a roof garden, plant and an antenna ring.
  | 'tanks' | 'garden' | 'plant'
  // Cheap housing: a shack built on the roof, satellite dishes, a laundry line.
  | 'shack' | 'dishes' | 'laundry';

// Every corporate tower on blue's side, by the corner of its footprint (sim/cityPlan.ts): its
// facade, its massing, its crown and which of its style's body shades it wears (0 the darkest,
// near black; the others dark greys, so the district isn't a wall of black from afar); its twin
// across the centre is the same. Laid out so towers
// side by side never share a look and a silhouette, with the gold-scaled towers flanking the
// boulevard into the plaza and on the big corner block.
const CURATED: Record<string, [FacadeName, Massing, Crown, number]> = {
  // Corner block (4,4): a gold monolith with a row of three beacon spires beside it.
  '25,25': ['goldscale', 'cantilever', 'helipad', 0], '29,25': ['ticker', 'straight', 'beacon', 0], '29,27': ['monolith', 'straight', 'blade', 1],
  '29,29': ['office', 'crownstep', 'beacon', 1], '25,29': ['brutalist', 'straight', 'antennas', 1],
  // Block (5,4): a long brutalist wall, a spire and a top-heavy mass.
  '31,25': ['brutalist', 'waist', 'antennas', 2], '31,28': ['ticker', 'straight', 'beacon', 1], '33,28': ['monolith', 'topheavy', 'stepped', 0],
  // Block (6,4): two masses either side of the boulevard, bridged high over it, and two spires.
  '37,25': ['monolith', 'cantilever', 'spire', 0], '40,25': ['office', 'waist', 'helipad', 1], '37,29': ['monolith', 'straight', 'beacon', 1], '41,29': ['ticker', 'straight', 'blade', 0],
  // Block (7,4).
  '43,25': ['ticker', 'straight', 'beacon', 0], '45,25': ['brutalist', 'topheavy', 'helipad', 1], '43,27': ['monolith', 'straight', 'antennas', 1],
  '43,29': ['office', 'straight', 'blade', 2], '46,29': ['ticker', 'straight', 'antennas', 1],
  // The core, either side of the boulevard into the plaza, bridged.
  '37,31': ['goldscale', 'cantilever', 'spire', 0], '40,31': ['goldscale', 'waist', 'helipad', 1], '31,37': ['monolith', 'topheavy', 'spire', 0], '31,40': ['monolith', 'cantilever', 'helipad', 1],
  // Block (4,5).
  '25,31': ['brutalist', 'waist', 'helipad', 0], '29,31': ['ticker', 'straight', 'beacon', 1], '25,35': ['office', 'straight', 'beacon', 2], '27,35': ['monolith', 'straight', 'blade', 1],
  // Block (4,6), either side of the boulevard.
  '25,37': ['office', 'cantilever', 'antennas', 1], '29,37': ['monolith', 'straight', 'beacon', 0], '25,40': ['brutalist', 'setback', 'helipad', 2], '28,40': ['ticker', 'topheavy', 'blade', 0],
  // Block (4,7).
  '25,43': ['monolith', 'waist', 'spire', 0], '28,43': ['office', 'cantilever', 'stepped', 1], '25,47': ['ticker', 'straight', 'beacon', 1], '27,47': ['brutalist', 'straight', 'antennas', 2],
};



type Footprint = NonNullable<BuildingData['footprint']>;

// The style of a building, the same for it and its twin across the centre.
export function facadeOf(f: Footprint, gridSize = CITY_CONFIG.gridSize): Facade {
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  // Blue's side of the pair.
  const [bx, bz] = f.x + f.z < tx + tz || (f.x + f.z === tx + tz && f.x <= tx) ? [f.x, f.z] : [tx, tz];
  const [name, massing, crown, shade] = CURATED[`${bx},${bz}`] ?? ['monolith', 'straight', 'spire', 1];
  const style = FACADES[name];
  return { ...style, body: style.bodies[Math.min(shade, style.bodies.length - 1)], massing, crown };
}

export type Side = 'west' | 'east' | 'north' | 'south';
// The faces that carry the gold scales: the building's two broad faces, so blue's camera
// (looking toward the centre, at north and west faces) and red's (at south and east) both see one.
export function featureSides(f: Footprint): Side[] {
  return f.w >= f.d ? ['north', 'south'] : ['west', 'east'];
}

// --- Textures, drawn once each, seeded so every player sees the same ---

export function canvas(size: number, draw: (g: CanvasRenderingContext2D, rnd: () => number) => void, seed: number) {
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
  // Continuous green window bands with dark spandrels and a few dark bays.
  bands: (g, rnd) => {
    for (let row = 0; row < 4; row++) {
      g.fillStyle = 'rgba(94,234,212,0.55)';
      g.fillRect(0, row * 32 + 8, 128, 12);
      for (let col = 0; col < 8; col++) if (rnd() > 0.7) { g.fillStyle = 'rgba(8,20,30,0.9)'; g.fillRect(col * 16, row * 32 + 8, 16, 12); }
    }
  },
  // Flats: a grid of windows, lit warm, white or teal, many dark, a few with curtains drawn.
  apartment: (g, rnd) => {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
      const lit = rnd();
      g.fillStyle = lit > 0.82 ? 'rgba(253,224,160,0.85)' : lit > 0.7 ? 'rgba(204,251,241,0.7)' : lit > 0.6 ? 'rgba(244,170,200,0.6)' : 'rgba(100,130,130,0.14)';
      g.fillRect(col * 21 + 5, row * 16 + 4, 11, 9);
    }
  },
  // Floors of balconies: a pale slab edge and railing under each floor, sliding doors behind.
  balcony: (g, rnd) => {
    for (let row = 0; row < 4; row++) {
      const y = row * 32;
      for (let col = 0; col < 4; col++) {
        const lit = rnd();
        g.fillStyle = lit > 0.6 ? 'rgba(253,230,170,0.75)' : lit > 0.45 ? 'rgba(167,243,208,0.55)' : 'rgba(90,110,110,0.15)';
        g.fillRect(col * 32 + 4, y + 6, 24, 18);
      }
      g.fillStyle = 'rgba(200,214,210,0.45)';
      g.fillRect(0, y + 26, 128, 3);
      g.fillStyle = 'rgba(200,214,210,0.25)';
      for (let x = 0; x < 128; x += 6) g.fillRect(x, y + 20, 1, 6);
    }
  },
  // Small cramped windows in a tight grid: warm, pink or flickering blue TV light, many dark,
  // some with a curtain half drawn.
  tenement: (g, rnd) => {
    for (let row = 0; row < 8; row++) for (let col = 0; col < 7; col++) {
      const lit = rnd();
      const x = col * 18 + 4, y = row * 16 + 4;
      g.fillStyle = lit > 0.78 ? 'rgba(253,200,120,0.85)' : lit > 0.66 ? 'rgba(244,114,182,0.7)' : lit > 0.58 ? 'rgba(125,180,255,0.7)' : 'rgba(60,60,70,0.25)';
      g.fillRect(x, y, 9, 9);
      if (lit > 0.58 && rnd() > 0.6) { g.fillStyle = 'rgba(40,30,30,0.6)'; g.fillRect(x, y, 4, 9); }
    }
  },
  // Concrete housing project: long access balconies under each floor, doors and windows behind,
  // washing hung over the rail here and there.
  projects: (g, rnd) => {
    const cloth = ['rgba(244,114,182,0.7)', 'rgba(250,204,21,0.7)', 'rgba(125,211,252,0.7)', 'rgba(255,255,255,0.6)'];
    for (let row = 0; row < 4; row++) {
      const y = row * 32;
      for (let col = 0; col < 8; col++) {
        const lit = rnd();
        g.fillStyle = lit > 0.7 ? 'rgba(253,214,150,0.8)' : lit > 0.6 ? 'rgba(150,200,255,0.6)' : 'rgba(60,64,70,0.3)';
        g.fillRect(col * 16 + 3, y + 6, 10, 14);
      }
      g.fillStyle = 'rgba(160,165,170,0.5)';
      g.fillRect(0, y + 23, 128, 4);
      for (let k = 0; k < 3; k++) if (rnd() > 0.4) { g.fillStyle = cloth[Math.floor(rnd() * cloth.length)]; g.fillRect(rnd() * 120, y + 22, 5, 7); }
    }
  },
  // Mismatched replacement panels in different greys and rust, few windows, a stray neon tag.
  patched: (g, rnd) => {
    for (let i = 0; i < 9; i++) {
      const shade = Math.floor(rnd() * 40);
      g.fillStyle = rnd() > 0.7 ? `rgba(${120 + shade},${70 + shade / 2},${40},0.22)` : `rgba(${100 + shade},${104 + shade},${110 + shade},0.18)`;
      g.fillRect(Math.floor(rnd() * 4) * 32, Math.floor(rnd() * 4) * 32, 32 + Math.floor(rnd() * 2) * 32, 32);
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const lit = rnd();
      if (lit < 0.45) continue;
      g.fillStyle = lit > 0.85 ? 'rgba(244,114,182,0.75)' : 'rgba(253,214,150,0.75)';
      g.fillRect(col * 32 + 10, row * 32 + 10, 12, 10);
    }
    g.fillStyle = 'rgba(34,211,238,0.7)';
    g.fillRect(20 + rnd() * 60, 100, 26, 3);
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

// Shopfronts: lit glass bays under a dark fascia, each with a neon sign in its own colour.
let shopMaterial: THREE.MeshBasicMaterial | null = null;
export function shopfrontMaterial(): THREE.MeshBasicMaterial {
  if (shopMaterial) return shopMaterial;
  const signs = ['#f472b6', '#22d3ee', '#facc15', '#a78bfa', '#4ade80', '#fb923c'];
  const tex = canvas(128, (g, rnd) => {
    g.fillStyle = 'rgba(10,12,16,0.9)';
    g.fillRect(0, 0, 128, 128);
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 32;
      // Glass, lit warm or cool, with a door and a dark mullion.
      const warm = rnd() > 0.4;
      const glass = g.createLinearGradient(0, 40, 0, 128);
      glass.addColorStop(0, warm ? 'rgba(253,214,150,0.85)' : 'rgba(186,230,253,0.8)');
      glass.addColorStop(1, warm ? 'rgba(180,120,60,0.6)' : 'rgba(80,140,180,0.55)');
      g.fillStyle = glass;
      g.fillRect(x + 3, 44, 26, 84);
      g.fillStyle = 'rgba(10,12,16,0.9)';
      g.fillRect(x + 15, 44, 2, 84);
      // The sign on the fascia above.
      g.fillStyle = signs[Math.floor(rnd() * signs.length)];
      g.fillRect(x + 5, 14 + Math.floor(rnd() * 8), 14 + Math.floor(rnd() * 8), 8);
    }
  }, 777);
  shopMaterial = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  return shopMaterial;
}
