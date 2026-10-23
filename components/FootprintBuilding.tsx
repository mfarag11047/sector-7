// City buildings, laid out by district in sim/mapgen.ts, whether one tile or several.
//
// Every tile is still its own building in the game: it is captured, damaged and destroyed on its
// own. But a tile that is part of a bigger footprint draws itself as its piece of one continuous
// building: its body runs right up to the tile edge where it joins the rest of the footprint, and
// only the outside faces get windows and neon. One tile of each building, its anchor, carries the
// rooftop pieces, so a building has one crown, one smokestack or one water tank, not one per tile.
//
// The look follows the building type, which follows the district:
//   commercial (core, downtown): glass curtain walls, a setback crown and spire; towers on podiums;
//                                holo billboards on the taller ones (HoloBillboard.tsx)
//   hightech (midtown):          banded data-centre floors, rooftop plant
//   industrial:                  low sawtooth-roofed sheds with pipe runs along the walls, a
//                                smokestack and storage tank, and on many a tower crane
//   residential (outskirts):     cheap housing: tenement windows, AC units, fire escapes and
//                                rooftop shacks, dishes and laundry (residentialLooks.ts)

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { TEAM_COLORS } from '../constants';
import type { BuildingData } from '../types';
import { AD_COUNT, HoloBillboard } from './HoloBillboard';
import { type Crown, facadeOf, stencilMaterial, facadeWindowMaterial, featureSides, goldScaleMaterial, MASSING_STEPS, shopfrontMaterial } from './corpoFacades';
import { midtownLookOf } from './midtownLooks';
import { residentialLookOf } from './residentialLooks';
import { industrialLookOf } from './industrialLooks';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Kind = 'commercial' | 'hightech' | 'industrial' | 'residential';

// How a building type dresses its outside faces. A window texture covers texW x texH world units
// and repeats, lined up in world space so it runs on unbroken across tiles.
const STYLE: Record<Kind, { accent: string; texW: number; texH: number; groundFloor: number }> = {
  commercial: { accent: '#e879f9', texW: 7, texH: 12, groundFloor: 2 },
  hightech: { accent: '#2dd4bf', texW: 7, texH: 6, groundFloor: 2 },
  industrial: { accent: '#f59e0b', texW: 14, texH: 14, groundFloor: 0 },
  residential: { accent: '#38bdf8', texW: 7, texH: 7, groundFloor: 1.5 },
};

// --- Window textures, drawn once per type ---
const textures = new Map<Kind, THREE.CanvasTexture>();
function windowTexture(kind: Kind): THREE.CanvasTexture {
  const cached = textures.get(kind);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  // Seeded so every player sees the same windows.
  let seed = kind.length * 977;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (kind === 'hightech') {
    // Continuous window bands with dark spandrels, and a few dark bays.
    for (let row = 0; row < 4; row++) {
      g.fillStyle = 'rgba(94,234,212,0.55)';
      g.fillRect(0, row * 32 + 8, 128, 12);
      for (let col = 0; col < 8; col++) if (rnd() > 0.7) { g.fillStyle = 'rgba(8,20,30,0.9)'; g.fillRect(col * 16, row * 32 + 8, 16, 12); }
    }
  } else if (kind === 'residential') {
    // Small apartment windows, some lit warm, some pink, many dark.
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        const lit = rnd();
        g.fillStyle = lit > 0.75 ? 'rgba(252,211,77,0.9)' : lit > 0.6 ? 'rgba(249,168,212,0.85)' : 'rgba(148,163,184,0.12)';
        g.fillRect(col * 32 + 9, row * 32 + 10, 14, 14);
      }
    }
  } else {
    // A strip of high clerestory windows and a hazard band along the foot of the wall.
    for (let col = 0; col < 8; col++) {
      g.fillStyle = rnd() > 0.4 ? 'rgba(251,191,36,0.7)' : 'rgba(251,191,36,0.15)';
      g.fillRect(col * 16 + 3, 70, 10, 10);
    }
    for (let i = -2; i < 16; i++) {
      g.fillStyle = 'rgba(250,204,21,0.8)';
      g.beginPath();
      g.moveTo(i * 16, 128); g.lineTo(i * 16 + 8, 128); g.lineTo(i * 16 + 16, 112); g.lineTo(i * 16 + 8, 112);
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  textures.set(kind, tex);
  return tex;
}

const windowMaterials = new Map<Kind, THREE.MeshBasicMaterial>();
const windowMaterial = (kind: Kind) => {
  let m = windowMaterials.get(kind);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ map: windowTexture(kind), transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    windowMaterials.set(kind, m);
  }
  return m;
};

const neonMaterials = new Map<string, THREE.MeshBasicMaterial>();
const neonMaterial = (color: string) => {
  let m = neonMaterials.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); neonMaterials.set(color, m); }
  return m;
};

const podiumMaterial = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.7, roughness: 0.45 });
const plantMaterial = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.5, roughness: 0.6 });
const sawtoothMaterial = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.6, roughness: 0.4 });

// The roof slab: dark, or in the owner's colour once the building is taken.
const roofCaps = new Map<string, THREE.MeshStandardMaterial>();
const roofCapMaterial = (owner: 'blue' | 'red' | null) => {
  const k = owner ?? 'none';
  let m = roofCaps.get(k);
  if (!m) {
    m = owner
      ? new THREE.MeshStandardMaterial({ color: TEAM_COLORS[owner], emissive: TEAM_COLORS[owner], emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.6 })
      : new THREE.MeshStandardMaterial({ color: '#0b1120', metalness: 0.5, roughness: 0.7 });
    roofCaps.set(k, m);
  }
  return m;
};
// How far the roof slab stops short of the building's outside edge, leaving a lit rim.
const ROOF_RIM = 0.7;

// A plane for one face, its texture coordinates set in world units so the windows line up.
function faceGeometry(width: number, height: number, u0: number, v0: number, texW: number, texH: number) {
  const geo = new THREE.PlaneGeometry(width, height);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * width / texW, v0 + uv.getY(i) * height / texH);
  return geo;
}

// A steady pseudo-random number in [0, 1) for a tile, so dressing is the same every visit.
const tileHash = (x: number, z: number, salt = 0) => {
  const v = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

const pipeMaterial = new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.8, roughness: 0.35 });
const rustMaterial = new THREE.MeshStandardMaterial({ color: '#9a3412', metalness: 0.5, roughness: 0.6 });
const craneMaterial = new THREE.MeshStandardMaterial({ color: '#eab308', metalness: 0.4, roughness: 0.5, emissive: '#422006', emissiveIntensity: 0.4 });

// A tower crane standing on a shed roof, its jib swung out over the yard.
const Crane: React.FC<{ jibAngle: number; mast: number }> = ({ jibAngle, mast }) => (
  <group>
    {/* Lattice mast: four legs and cross braces. */}
    {[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z], i) => (
      <mesh key={i} position={[x, mast / 2, z]} material={craneMaterial}>
        <boxGeometry args={[0.18, mast, 0.18]} />
      </mesh>
    ))}
    {Array.from({ length: Math.floor(mast / 3) }, (_, i) => (
      <mesh key={i} position={[0, 1.5 + i * 3, 0]} rotation={[0, (i % 2) * Math.PI / 2, 0.75]} material={craneMaterial}>
        <boxGeometry args={[0.12, 1.9, 0.12]} />
      </mesh>
    ))}
    <group position={[0, mast, 0]} rotation={[0, jibAngle, 0]}>
      {/* Cab, jib out front and counter-jib with its weight behind. */}
      <mesh position={[0.9, 0.6, 0]} material={plantMaterial}>
        <boxGeometry args={[1.4, 1.2, 1.4]} />
      </mesh>
      <mesh position={[0.9, 0.7, 0.71]} material={neonMaterial('#7dd3fc')}>
        <boxGeometry args={[1.1, 0.6, 0.02]} />
      </mesh>
      <mesh position={[10, 1.4, 0]} material={craneMaterial}>
        <boxGeometry args={[20, 0.5, 0.9]} />
      </mesh>
      <mesh position={[-4, 1.4, 0]} material={craneMaterial}>
        <boxGeometry args={[8, 0.5, 0.9]} />
      </mesh>
      <mesh position={[-7, 0.5, 0]} material={plantMaterial}>
        <boxGeometry args={[2, 1.6, 1.4]} />
      </mesh>
      {/* Top mast and the tie bars down to both ends. */}
      <mesh position={[0, 3.2, 0]} material={craneMaterial}>
        <boxGeometry args={[0.3, 4, 0.3]} />
      </mesh>
      <mesh position={[8, 3.2, 0]} rotation={[0, 0, -0.22]} material={plantMaterial}>
        <boxGeometry args={[16.5, 0.08, 0.08]} />
      </mesh>
      <mesh position={[-3.5, 3.2, 0]} rotation={[0, 0, 0.5]} material={plantMaterial}>
        <boxGeometry args={[8, 0.08, 0.08]} />
      </mesh>
      {/* Trolley, cable and hook partway out. */}
      <mesh position={[14, 0.2, 0]} material={plantMaterial}>
        <boxGeometry args={[1, 0.5, 1]} />
      </mesh>
      <mesh position={[14, -4, 0]} material={plantMaterial}>
        <boxGeometry args={[0.06, 8, 0.06]} />
      </mesh>
      <mesh position={[14, -8.3, 0]} material={rustMaterial}>
        <boxGeometry args={[0.8, 0.7, 0.8]} />
      </mesh>
      <mesh position={[20, 1.9, 0]} material={neonMaterial('#ff003c')}>
        <sphereGeometry args={[0.35, 8, 6]} />
      </mesh>
    </group>
  </group>
);

// What stands on a corporate tower's roof (corpoFacades.ts Crown). `span` is the roof's narrow
// side, `long` its broad one.
const redLight = () => neonMaterial('#ff003c');
// --- The beacon crown: a holo-projector throwing a column of light into the sky, ringed by bands
// of holographic ad glyphs scrolling round it. Shaders shared per colour, driven by one clock. ---
const beaconTime = { value: 0 };
const BEAM_HEIGHT = 150;
const beamMaterials = new Map<string, THREE.ShaderMaterial>();
const beamMaterial = (color: string) => {
  let m = beamMaterials.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uTime: beaconTime, uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          // Brightest at the projector, fading out high in the sky, with pulses running up it.
          float fade = pow(1.0 - vUv.y, 1.6);
          float pulse = 0.6 + 0.4 * smoothstep(0.7, 1.0, sin(vUv.y * 40.0 - uTime * 6.0));
          float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = fade * pulse * (0.35 + 0.65 * core);
          gl_FragColor = vec4(uColor * a * 2.2, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    beamMaterials.set(color, m);
  }
  return m;
};
const adRingMaterials = new Map<string, THREE.ShaderMaterial>();
const adRingMaterial = (color: string) => {
  let m = adRingMaterials.get(color);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uTime: beaconTime, uColor: { value: new THREE.Color(color) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          // Rows of glyph blocks scrolling round the ring, between bright edge lines.
          vec2 g = vec2((vUv.x + uTime * 0.05) * 90.0, vUv.y * 5.0);
          float glyph = step(0.45, h(floor(g))) * step(0.15, fract(g.x)) * step(0.2, fract(g.y));
          float edge = step(0.92, vUv.y) + step(vUv.y, 0.08);
          float flicker = 0.75 + 0.25 * step(0.3, h(vec2(floor(uTime * 12.0), 3.0)));
          float a = (glyph * 0.8 + edge) * flicker;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor * a * 1.5, a * 0.9);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    });
    adRingMaterials.set(color, m);
  }
  return m;
};
const BeaconClock: React.FC = () => { useFrame(({ clock }) => { beaconTime.value = clock.elapsedTime; }); return null; };

const TowerCrown: React.FC<{ crown: Crown; span: number; long: number; alongX: boolean; h: number; accent: string; position: [number, number, number] }> = ({ crown, span, long, alongX, h, accent, position }) => (
  <group position={position}>
    {crown === 'spire' && (
      <>
        <mesh position={[0, 2, 0]} material={podiumMaterial}><boxGeometry args={[span * 0.6, 4, span * 0.6]} /></mesh>
        <mesh position={[0, 3.6, 0]} material={neonMaterial(accent)}><boxGeometry args={[span * 0.62, 0.3, span * 0.62]} /></mesh>
        <mesh position={[0, 4 + h * 0.12, 0]} material={plantMaterial}><cylinderGeometry args={[0.15, 0.3, h * 0.24, 6]} /></mesh>
        <mesh position={[0, 4 + h * 0.24, 0]} material={redLight()}><sphereGeometry args={[0.45, 8, 6]} /></mesh>
      </>
    )}
    {crown === 'stepped' && [0.75, 0.52, 0.3].map((k, i) => (
      <group key={i}>
        <mesh position={[0, 1.4 + i * 2.8, 0]} material={podiumMaterial}><boxGeometry args={[span * k, 2.8, span * k]} /></mesh>
        <mesh position={[0, 2.7 + i * 2.8, 0]} material={neonMaterial(accent)}><boxGeometry args={[span * k + 0.1, 0.22, span * k + 0.1]} /></mesh>
      </group>
    ))}
    {crown === 'helipad' && (
      <>
        <mesh position={[0, 0.5, 0]} material={podiumMaterial}><cylinderGeometry args={[span * 0.38, span * 0.4, 1, 20]} /></mesh>
        <mesh position={[0, 1.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={neonMaterial(accent)}><ringGeometry args={[span * 0.3, span * 0.33, 32]} /></mesh>
        {/* The H. */}
        {[[-0.09, 0], [0.09, 0]].map(([x], i) => (
          <mesh key={i} position={[span * x, 1.03, 0]} material={neonMaterial('#e2e8f0')}><boxGeometry args={[span * 0.03, 0.04, span * 0.22]} /></mesh>
        ))}
        <mesh position={[0, 1.03, 0]} material={neonMaterial('#e2e8f0')}><boxGeometry args={[span * 0.18, 0.04, span * 0.03]} /></mesh>
        {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z], i) => (
          <mesh key={`l${i}`} position={[x * span * 0.36, 1.1, z * span * 0.36]} material={redLight()}><sphereGeometry args={[0.3, 6, 4]} /></mesh>
        ))}
      </>
    )}
    {crown === 'antennas' && [[-0.22, -0.18, 0.2], [0.15, 0.2, 0.12], [0.25, -0.2, 0.07], [-0.1, 0.25, 0.09]].map(([x, z, k], i) => (
      <group key={i} position={[x * span, 0, z * span]}>
        <mesh position={[0, (h * k) / 2, 0]} material={plantMaterial}><cylinderGeometry args={[0.12, 0.22, h * k, 5]} /></mesh>
        <mesh position={[0, h * k, 0]} material={redLight()}><sphereGeometry args={[0.3, 6, 4]} /></mesh>
        {i === 0 && <mesh position={[0, h * k * 0.6, 0]} material={plantMaterial}><boxGeometry args={[1.6, 0.12, 0.12]} /></mesh>}
      </group>
    ))}
    {crown === 'tanks' && [[-0.2, -0.15, 1.5], [0.2, 0.12, 1.2]].map(([x, z, r], i) => (
      <group key={i} position={[x * span, 0, z * span]}>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([lx, lz], j) => (
          <mesh key={j} position={[lx * r * 0.6, 0.9, lz * r * 0.6]} material={plantMaterial}><boxGeometry args={[0.15, 1.8, 0.15]} /></mesh>
        ))}
        <mesh position={[0, 3.2, 0]} material={tankMaterial} castShadow><cylinderGeometry args={[r, r, 2.8, 12]} /></mesh>
        <mesh position={[0, 4.9, 0]} material={tankMaterial}><coneGeometry args={[r * 1.05, 0.7, 12]} /></mesh>
      </group>
    ))}
    {crown === 'garden' && (
      <>
        <mesh position={[0, 0.35, 0]} material={gardenMaterial}><boxGeometry args={[span * 0.8, 0.5, (long * 0.8 + span * 0.8) / 2]} /></mesh>
        {[[-0.25, -0.2], [0.2, 0.15], [0.05, -0.28], [-0.15, 0.25]].map(([x, z], i) => (
          <group key={i} position={[x * span, 0.6, z * span]}>
            <mesh position={[0, 0.8, 0]} material={plantMaterial}><cylinderGeometry args={[0.1, 0.14, 1.6, 5]} /></mesh>
            <mesh position={[0, 2, 0]} material={gardenMaterial}><icosahedronGeometry args={[0.9, 0]} /></mesh>
          </group>
        ))}
        <mesh position={[0, 0.62, 0]} rotation={[-Math.PI / 2, 0, 0]} material={neonMaterial(accent)}><ringGeometry args={[span * 0.38, span * 0.4, 4, 1, Math.PI / 4]} /></mesh>
      </>
    )}
    {crown === 'plant' && (
      <>
        <mesh position={[-span * 0.18, 0.9, -span * 0.12]} material={plantMaterial}><boxGeometry args={[span * 0.3, 1.8, span * 0.34]} /></mesh>
        <mesh position={[span * 0.18, 0.7, span * 0.1]} material={plantMaterial}><boxGeometry args={[span * 0.24, 1.4, span * 0.24]} /></mesh>
        <mesh position={[span * 0.18, 1.5, span * 0.1]} rotation={[-Math.PI / 2, 0, 0]} material={neonMaterial(accent)}><ringGeometry args={[span * 0.06, span * 0.1, 16]} /></mesh>
        <mesh position={[-span * 0.3, 3.5, span * 0.25]} material={plantMaterial}><cylinderGeometry args={[0.1, 0.1, 7, 4]} /></mesh>
      </>
    )}
    {crown === 'beacon' && (
      <>
        <BeaconClock />
        <mesh position={[0, 1.2, 0]} material={podiumMaterial}><boxGeometry args={[span * 0.5, 2.4, span * 0.5]} /></mesh>
        <mesh position={[0, 2.5, 0]} material={neonMaterial(accent)}><cylinderGeometry args={[span * 0.16, span * 0.2, 0.4, 12]} /></mesh>
        <mesh position={[0, 2.6 + BEAM_HEIGHT / 2, 0]} material={beamMaterial(accent)}>
          <cylinderGeometry args={[2.6, 0.9, BEAM_HEIGHT, 16, 1, true]} />
        </mesh>
        {[[10, 0.55, 4], [24, 0.42, 3]].map(([y, r, band], i) => (
          <mesh key={i} position={[0, y, 0]} material={adRingMaterial(i ? '#67e8f9' : accent)}>
            <cylinderGeometry args={[span * r, span * r, band, 32, 1, true]} />
          </mesh>
        ))}
      </>
    )}
    {crown === 'smokestack' && (
      <group position={[span * 0.2, 0, -span * 0.15]}>
        <mesh position={[0, 9, 0]} material={stackMaterial} castShadow><cylinderGeometry args={[1.1, 1.6, 18, 12]} /></mesh>
        {[5, 16].map(y => <mesh key={y} position={[0, y, 0]} material={neonMaterial('#dc2626')}><cylinderGeometry args={[1.25 + (18 - y) * 0.02, 1.25 + (18 - y) * 0.02, 1.2, 12]} /></mesh>)}
        <mesh position={[0, 18.2, 0]} material={redLight()}><sphereGeometry args={[0.35, 6, 4]} /></mesh>
        <Smoke y={18} />
      </group>
    )}
    {crown === 'redtanks' && [[-0.2, -0.18, 1.8], [0.2, -0.18, 1.5], [0, 0.22, 1.7]].map(([x, z, r], i) => (
      <group key={i} position={[x * span, 0, z * span]}>
        <mesh position={[0, 1.6, 0]} material={redTankMaterial} castShadow><cylinderGeometry args={[r, r, 3.2, 16]} /></mesh>
        <mesh position={[0, 3.25, 0]} material={stackMaterial}><cylinderGeometry args={[r * 0.98, r, 0.15, 16]} /></mesh>
      </group>
    ))}
    {crown === 'vents' && [[-0.22, -0.2], [0.18, -0.2], [-0.22, 0.2], [0.18, 0.2]].map(([x, z], i) => (
      <group key={i} position={[x * span, 0, z * span]}>
        <mesh position={[0, 0.8, 0]} material={acMaterial}><boxGeometry args={[span * 0.28, 1.6, span * 0.28]} /></mesh>
        <mesh position={[0, 1.62, 0]} rotation={[-Math.PI / 2, 0, 0]} material={escapeMaterial}><circleGeometry args={[span * 0.11, 12]} /></mesh>
      </group>
    ))}
    {crown === 'crane' && (
      <group position={[-span * 0.25, 0, -span * 0.25]}>
        <Crane mast={14 + (long % 7) * 1.4} jibAngle={(long * 1.7) % (Math.PI * 2)} />
      </group>
    )}
    {crown === 'shack' && (
      <group position={[-span * 0.12, 0, -span * 0.08]}>
        <mesh position={[0, 1.3, 0]} material={tankMaterial} castShadow><boxGeometry args={[span * 0.42, 2.6, span * 0.36]} /></mesh>
        <mesh position={[0, 2.75, 0]} rotation={[0, 0, 0.14]} material={rustMaterial}><boxGeometry args={[span * 0.5, 0.12, span * 0.44]} /></mesh>
        <mesh position={[span * 0.08, 1.5, span * 0.18 + 0.03]} material={neonMaterial('#fbbf24')}><boxGeometry args={[0.9, 0.7, 0.05]} /></mesh>
        <mesh position={[-span * 0.14, 3.4, -span * 0.08]} material={pipeMaterial}><cylinderGeometry args={[0.18, 0.18, 1.6, 6]} /></mesh>
      </group>
    )}
    {crown === 'dishes' && [[-0.2, -0.15, 1.3, 0.6], [0.18, 0.12, 0.9, 2.2]].map(([x, z, r, turn], i) => (
      <group key={i} position={[x * span, 0, z * span]} rotation={[0, turn, 0]}>
        <mesh position={[0, 0.8, 0]} material={plantMaterial}><cylinderGeometry args={[0.1, 0.12, 1.6, 5]} /></mesh>
        <mesh position={[0, 1.7, 0]} rotation={[-0.9, 0, 0]} material={pipeMaterial}><sphereGeometry args={[r, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3]} /></mesh>
      </group>
    ))}
    {crown === 'dishes' && <mesh position={[span * 0.3, 2.5, -span * 0.3]} material={plantMaterial}><cylinderGeometry args={[0.07, 0.1, 5, 4]} /></mesh>}
    {crown === 'laundry' && (
      <>
        {[-0.3, 0.3].map(x => <mesh key={x} position={[x * span, 1.2, 0]} material={plantMaterial}><cylinderGeometry args={[0.08, 0.08, 2.4, 4]} /></mesh>)}
        <mesh position={[0, 2.3, 0]} material={plantMaterial}><boxGeometry args={[span * 0.6, 0.04, 0.04]} /></mesh>
        {['#f472b6', '#e2e8f0', '#facc15', '#38bdf8', '#a3e635'].map((c, i) => (
          <mesh key={c} position={[(i - 2) * span * 0.11, 1.75, 0]} material={clothMaterial(c)}><boxGeometry args={[span * 0.08, 1 + (i % 2) * 0.3, 0.04]} /></mesh>
        ))}
      </>
    )}
    {crown === 'blade' && (
      <group rotation={[0, alongX ? 0 : Math.PI / 2, 0]}>
        <mesh position={[0, h * 0.075, 0]} material={podiumMaterial}><boxGeometry args={[long * 0.55, h * 0.15, 0.5]} /></mesh>
        <mesh position={[long * 0.275, h * 0.075, 0]} material={neonMaterial(accent)}><boxGeometry args={[0.2, h * 0.15, 0.55]} /></mesh>
        <mesh position={[0, h * 0.15, 0]} material={neonMaterial(accent)}><boxGeometry args={[long * 0.55, 0.2, 0.55]} /></mesh>
      </group>
    )}
  </group>
);

// Industry: smokestacks, red tanks, the dark band round a plant's foot, and drifting smoke.
const stackMaterial = new THREE.MeshStandardMaterial({ color: '#b8b6ae', metalness: 0.2, roughness: 0.8 });
const redTankMaterial = new THREE.MeshStandardMaterial({ color: '#b91c1c', metalness: 0.4, roughness: 0.5, emissive: '#3f0606' });
const skirtMaterials = new Map<string, THREE.MeshStandardMaterial>();
const skirtMaterial = (color: string) => {
  let m = skirtMaterials.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.7 }); skirtMaterials.set(color, m); }
  return m;
};
// Smoke: two crossed planes above a stack, with billowing noise scrolling up them and fading out.
const smokeTime = { value: 0 };
const smokeMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: smokeTime },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 p = vec2(vUv.x * 3.0, vUv.y * 5.0 - uTime * 0.6);
      float d = n(p) * 0.6 + n(p * 2.3) * 0.4;
      // A plume that widens as it rises and thins out at the top.
      float width = 0.12 + vUv.y * 0.35;
      float plume = smoothstep(width, width * 0.3, abs(vUv.x - 0.5 + sin(vUv.y * 3.0 + uTime * 0.3) * 0.08));
      float a = plume * d * (1.0 - smoothstep(0.6, 1.0, vUv.y)) * smoothstep(0.0, 0.06, vUv.y) * 1.2;
      if (a < 0.02) discard;
      gl_FragColor = vec4(vec3(0.32, 0.32, 0.34) * (0.7 + d * 0.5), a);
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});
const Smoke: React.FC<{ y: number }> = ({ y }) => {
  useFrame(({ clock }) => { smokeTime.value = clock.elapsedTime; });
  return (
    <group position={[0, y + 10, 0]}>
      {[0, Math.PI / 2].map(r => <mesh key={r} rotation={[0, r, 0]} material={smokeMaterial}><planeGeometry args={[12, 22]} /></mesh>)}
    </group>
  );
};

// Cheap-housing clutter: cloth on a laundry line, AC units, fire escapes.
const clothMaterials = new Map<string, THREE.MeshStandardMaterial>();
const clothMaterial = (color: string) => {
  let m = clothMaterials.get(color);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.9, side: THREE.DoubleSide }); clothMaterials.set(color, m); }
  return m;
};
const acMaterial = new THREE.MeshStandardMaterial({ color: '#8a9096', metalness: 0.5, roughness: 0.6 });
const escapeMaterial = new THREE.MeshStandardMaterial({ color: '#2b2f33', metalness: 0.7, roughness: 0.5 });

// A zigzag fire escape up a face, in the face's own coordinates (+z out of the wall): a landing
// at every floor with a rail, joined by stair flights running alternately left and right.
const FireEscape: React.FC<{ x: number; y0: number; y1: number; width: number }> = ({ x, y0, y1, width }) => {
  const floors: number[] = [];
  for (let y = y0; y <= y1; y += 3.5) floors.push(y);
  const rise = 3.5, run = width * 0.8;
  const angle = Math.atan2(rise, run), length = Math.hypot(rise, run);
  return (
    <group position={[x, 0, 0]}>
      {floors.map((y, i) => (
        <group key={i}>
          <mesh position={[0, y, 0.65]} material={escapeMaterial}><boxGeometry args={[width, 0.14, 1.3]} /></mesh>
          <mesh position={[0, y + 0.45, 1.28]} material={escapeMaterial}><boxGeometry args={[width, 0.08, 0.06]} /></mesh>
          {i < floors.length - 1 && (
            <mesh position={[0, y + rise / 2, 0.65]} rotation={[0, 0, i % 2 ? -angle : angle]} material={escapeMaterial}><boxGeometry args={[length, 0.12, 0.8]} /></mesh>
          )}
        </group>
      ))}
    </group>
  );
};

// How tall a ground storey of shops is.
const SHOP_HEIGHT = 3.4;
const tankMaterial = new THREE.MeshStandardMaterial({ color: '#57534e', metalness: 0.3, roughness: 0.8 });
const gardenMaterial = new THREE.MeshStandardMaterial({ color: '#2f5a3a', roughness: 0.95, emissive: '#0d2a18' });

// How high the podium under a tower stands (the podium tiles around it are 8-12).
const PODIUM_HEIGHT = 10;

type Side = 'west' | 'east' | 'north' | 'south';

const FootprintSegmentView: React.FC<{
  data: BuildingData & { footprint: NonNullable<BuildingData['footprint']> };
  tileSize: number;
  materialRef: React.Ref<THREE.MeshStandardMaterial>;
  onBeforeCompile: (shader: any) => void;
  hovered: boolean;
}> = ({ data, tileSize: T, materialRef, onBeforeCompile, hovered }) => {
  const kind = data.type as Kind;
  const style = STYLE[kind];
  const f = data.footprint;
  const h = data.scale[1];
  const lx = data.gridX - f.x;
  const lz = data.gridZ - f.z;
  const isTower = !!f.tower && f.tower.x === data.gridX && f.tower.z === data.gridZ;
  const anchor = f.tower ? isTower : lx === Math.floor((f.w - 1) / 2) && lz === Math.floor((f.d - 1) / 2);
  // Corporate towers each wear one of the facade styles (corpoFacades.ts).
  // Midtown blocks have their own looks too (midtownLooks.ts).
  const facade = useMemo(() => (kind === 'commercial' ? facadeOf(f) : kind === 'hightech' ? midtownLookOf(f) : kind === 'residential' ? residentialLookOf(f) : kind === 'industrial' ? industrialLookOf(f) : null), [kind, f]);
  const accent = data.owner ? TEAM_COLORS[data.owner] : facade?.accent ?? style.accent;
  // The fire escape goes on the broad face toward its own side's camera.
  const blueSide = f.x + f.z + (f.w + f.d) / 2 - 1 < 78;
  const escapeSide: Side = f.w >= f.d ? (blueSide ? 'north' : 'south') : (blueSide ? 'west' : 'east');
  const texW = facade?.texW ?? style.texW;
  const texH = facade?.texH ?? style.texH;

  const parts = useMemo(() => {
    const half = T / 2;
    const inset = T * 0.08;
    // The outside faces of the whole building that this tile carries.
    const outside: Record<Side, boolean> = { west: lx === 0, east: lx === f.w - 1, north: lz === 0, south: lz === f.d - 1 };
    const box = {
      x0: outside.west ? -half + inset : -half, x1: outside.east ? half - inset : half,
      z0: outside.north ? -half + inset : -half, z1: outside.south ? half - inset : half,
    };
    // A tower stands slim on its podium; its own body carries windows all round.
    const tower = isTower ? { x0: -T * 0.38, x1: T * 0.38, z0: -T * 0.38, z1: T * 0.38 } : null;
    const base = tower ?? box;
    const faces = (Object.keys(outside) as Side[]).filter(s => tower || outside[s]);
    const worldX = data.gridX * T;
    const worldZ = data.gridZ * T;
    // Shops take the ground storey; the floors above start over them.
    const bottom = tower ? PODIUM_HEIGHT : facade?.shops ? SHOP_HEIGHT + 0.8 : style.groundFloor;

    // Tiers, from the ground up: at each step of the building's massing its outside walls stand
    // in (or out, overhanging) by that many steps. Steps too near the roof are dropped, and the
    // ground tier starts at the foot even when a step is set at 0.
    const steps = (facade?.massing ? MASSING_STEPS[facade.massing] : []).map(([a, n]) => [a * h, n] as const);
    const footInset = steps.length && steps[0][0] === 0 ? steps[0][1] : 0;
    const breaks = steps.filter(([y]) => y > 3 && y < h - 2);
    // Shallow steps, so towers stay broad and the streets stay walled in.
    const stepIn = tower ? T * 0.05 : T * 0.07;
    const tiers = [[0, footInset] as const, ...breaks].map(([y0, n], k) => {
      const d = n * stepIn;
      const shrink = (s: Side) => (tower || outside[s] ? d : 0);
      return { y0, y1: breaks[k]?.[0] ?? h, x0: base.x0 + shrink('west'), x1: base.x1 - shrink('east'), z0: base.z0 + shrink('north'), z1: base.z1 - shrink('south') };
    });
    const top = tiers[tiers.length - 1];
    // The body, every tier in one mesh centred on half the height, so the capture fill climbs
    // the whole building.
    const bodyGeometry = mergeGeometries(tiers.map(t => {
      const g = new THREE.BoxGeometry(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0);
      g.translate((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2 - h / 2, (t.z0 + t.z1) / 2);
      return g;
    }))!;

    // Windows on each tier's outside faces, lined up in world space.
    const windows = tiers.flatMap((t, k) => faces.map(side => {
      const alongX = side === 'north' || side === 'south';
      const width = alongX ? t.x1 - t.x0 : t.z1 - t.z0;
      const start = alongX ? worldX + t.x0 : worldZ + t.z0;
      const wb = Math.max(bottom, t.y0 + 0.4);
      const wt = t.y1 - (k === tiers.length - 1 ? 0.8 : 0.5);
      const height = Math.max(0.5, wt - wb);
      const geometry = faceGeometry(width, height, start / texW, wb / texH, texW, texH);
      const cx = alongX ? (t.x0 + t.x1) / 2 : side === 'west' ? t.x0 - 0.04 : t.x1 + 0.04;
      const cz = alongX ? (side === 'north' ? t.z0 - 0.04 : t.z1 + 0.04) : (t.z0 + t.z1) / 2;
      const rot = side === 'north' ? Math.PI : side === 'south' ? 0 : side === 'west' ? -Math.PI / 2 : Math.PI / 2;
      return { key: `${side}-${k}`, side, geometry, position: [cx, wb + height / 2, cz] as [number, number, number], rot, width, alongX, height, bottom: wb, top: wt, ledge: t.y1, start };
    }));
    // The gold scale panels on the building's two broad faces: most of the face's height, the
    // scales lined up in world space across the building's tiles.
    const scaleSides = facade?.scales ? featureSides(f) : [];
    const scales = windows.filter(w => scaleSides.includes(w.side) && h > 14).flatMap(w => {
      const y0 = Math.max(w.bottom, h * 0.22), y1 = Math.min(w.top, h * 0.88);
      return y1 - y0 < 3 ? [] : [{ ...w, geometry: faceGeometry(w.width, y1 - y0, w.start / 5, y0 / 5, 5, 5), y: (y0 + y1) / 2 }];
    });
    // The roof slab runs on unbroken across tiles and stops short of the outside edges.
    const rim = (side: Side) => (tower || outside[side] ? ROOF_RIM : 0);
    const cap = { x0: top.x0 + rim('west'), x1: top.x1 - rim('east'), z0: top.z0 + rim('north'), z1: top.z1 - rim('south') };
    // Holo billboards on commercial towers tall enough to carry one: at most one a tile, on one
    // of its outside faces, within one tier.
    let billboard: { kind: 'panel' | 'blade'; ad: number; width: number; height: number; position: [number, number, number]; rot: number } | null = null;
    if (kind === 'commercial' && h >= 24) {
      const blade = tileHash(data.gridX, data.gridZ, 9) < 0.45;
      const choices = windows.filter(w => w.top - w.bottom > 10);
      const face = choices.find((w, i) => tileHash(data.gridX, data.gridZ, i + 1) < 0.45);
      if (face) {
        const width = blade ? 4.5 : Math.min(face.width * 0.85, 11);
        const height = Math.min(width * 2, h * 0.5, face.top - face.bottom - 2);
        const y = Math.min(Math.max(face.bottom + height / 2 + 1, h * 0.62), face.top - height / 2 - 1);
        billboard = { kind: blade ? 'blade' : 'panel', ad: Math.floor(tileHash(data.gridX, data.gridZ, 5) * AD_COUNT), width, height, position: [face.position[0], y, face.position[2]], rot: face.rot };
      }
    }
    // Shopfronts along the ground storey of each outside face, lined up in world space.
    const shops = facade?.shops && !tower ? windows.filter(w => w.key.endsWith('-0')).map(w => ({
      ...w, geometry: faceGeometry(w.width, SHOP_HEIGHT, w.start / 8, 0, 8, SHOP_HEIGHT),
    })) : [];
    return { box, body: top, tower, windows, faces, cap, billboard, scales, bodyGeometry, shops };
  }, [T, lx, lz, f, isTower, data.gridX, data.gridZ, h, style, kind, facade, texW, texH]);

  useEffect(() => () => {
    parts.windows.forEach(w => w.geometry.dispose()); parts.scales.forEach(w => w.geometry.dispose()); parts.shops.forEach(w => w.geometry.dispose()); parts.bodyGeometry.dispose();
  }, [parts]);
  const { box, body, tower, windows, cap, billboard, scales, bodyGeometry, shops } = parts;
  const bw = body.x1 - body.x0;
  const bd = body.z1 - body.z0;
  const bx = (body.x0 + body.x1) / 2;
  const bz = (body.z0 + body.z1) / 2;
  const longAlongX = f.w >= f.d;

  return (
    <group>
      {tower && (
        <mesh position={[(box.x0 + box.x1) / 2, PODIUM_HEIGHT / 2, (box.z0 + box.z1) / 2]} material={podiumMaterial} castShadow receiveShadow>
          <boxGeometry args={[box.x1 - box.x0, PODIUM_HEIGHT, box.z1 - box.z0]} />
        </mesh>
      )}

      {/* The body carries the capture fill. */}
      <mesh position={[0, h / 2, 0]} geometry={bodyGeometry} castShadow receiveShadow>
        <meshStandardMaterial ref={materialRef} metalness={0.6} roughness={0.35} onBeforeCompile={onBeforeCompile} />
        {hovered && <Edges color="#ffffff" threshold={40} />}
      </mesh>

      <mesh position={[(cap.x0 + cap.x1) / 2, h + 0.12, (cap.z0 + cap.z1) / 2]} material={roofCapMaterial(data.owner)}>
        <boxGeometry args={[cap.x1 - cap.x0, 0.25, cap.z1 - cap.z0]} />
      </mesh>

      {windows.map(w => (
        <group key={w.key}>
          <mesh geometry={w.geometry} position={w.position} rotation={[0, w.rot, 0]} material={facade ? facadeWindowMaterial(facade.name) : windowMaterial(kind)} />
          {/* A neon line along the top of each outside face, and of each setback. */}
          <mesh position={[w.position[0], w.ledge - 0.3, w.position[2]]} rotation={[0, w.rot, 0]} material={neonMaterial(accent)}>
            <boxGeometry args={[w.width, 0.35, 0.25]} />
          </mesh>
        </group>
      ))}

      {/* Facade dressing: full-height light strips, a light line round the building, the gold
          scales. Each sits just proud of its face. */}
      {/* AC units bolted on the walls of cheap housing, a few to each tile's stretch. */}
      {facade?.clutter && windows.map(w => (
        <group key={`ac-${w.key}`} position={[w.position[0], 0, w.position[2]]} rotation={[0, w.rot, 0]}>
          {[0, 1, 2].filter(i => tileHash(data.gridX, data.gridZ, 20 + i + w.key.length) < 0.7).map(i => {
            const u = (tileHash(data.gridX, data.gridZ, 30 + i) - 0.5) * w.width * 0.8;
            const y = w.bottom + 1 + tileHash(data.gridX, data.gridZ, 40 + i + w.key.length) * Math.max(0, w.top - w.bottom - 2);
            return <mesh key={i} position={[u, y, 0.4]} material={acMaterial}><boxGeometry args={[1.3, 0.85, 0.8]} /></mesh>;
          })}
        </group>
      ))}
      {/* A fire escape down the front of the taller ones, on the first tile of the face. */}
      {facade?.fireEscape && h >= 12 && windows.filter(w => w.key.endsWith('-0') && w.side === escapeSide && (w.alongX ? lx === 0 : lz === 0)).map(w => (
        <group key={`esc-${w.key}`} position={[w.position[0], 0, w.position[2]]} rotation={[0, w.rot, 0]}>
          <FireEscape x={w.width * (w.side === 'north' || w.side === 'east' ? 0.18 : -0.18)} y0={Math.max(3, w.bottom + 1.5)} y1={h - 2} width={Math.min(T * 0.4, w.width * 0.5)} />
        </group>
      ))}

      {facade?.strips && windows.map(w => (
        <group key={`strips-${w.key}`} position={w.position} rotation={[0, w.rot, 0]}>
          {Array.from({ length: facade.strips!.count }, (_, i) => (
            <mesh key={i} position={[((i + 1) / (facade.strips!.count + 1) - 0.5) * w.width, 0, 0.12]} material={neonMaterial(facade.strips!.color)}>
              <boxGeometry args={[0.22, w.height, 0.12]} />
            </mesh>
          ))}
        </group>
      ))}
      {facade?.band && windows.filter(w => w.bottom <= h * facade.band!.at && h * facade.band!.at <= w.top).map(w => (
        <mesh key={`band-${w.key}`} position={[w.position[0], h * facade.band!.at, w.position[2]]} rotation={[0, w.rot, 0]} material={neonMaterial(facade.band!.color)}>
          <boxGeometry args={[w.width + 0.3, 0.3, 0.3]} />
        </mesh>
      ))}
      {scales.map(w => (
        <mesh key={`scales-${w.key}`} geometry={w.geometry} position={[w.position[0], w.y, w.position[2]]} rotation={[0, w.rot, 0]} material={goldScaleMaterial()}>
        </mesh>
      ))}

      {/* Shops: lit glass and signs along the ground storey, under an awning in the accent. */}
      {shops.map(w => (
        <group key={`shop-${w.key}`} position={[w.position[0], 0, w.position[2]]} rotation={[0, w.rot, 0]}>
          <mesh geometry={w.geometry} position={[0, 0.2 + SHOP_HEIGHT / 2, 0.02]} material={shopfrontMaterial()} />
          <mesh position={[0, SHOP_HEIGHT + 0.35, 0.5]} material={neonMaterial(accent)}>
            <boxGeometry args={[w.width, 0.16, 1]} />
          </mesh>
        </group>
      ))}

      {billboard && <HoloBillboard {...billboard} />}

      {/* Industry: a dark band round the foot of the walls, a code stencilled big on the front. */}
      {facade?.skirt && windows.filter(w => w.key.endsWith('-0')).map(w => (
        <mesh key={`skirt-${w.key}`} position={[w.position[0], h * 0.17, w.position[2]]} rotation={[0, w.rot, 0]} material={skirtMaterial(facade.skirt!)}>
          <boxGeometry args={[w.width + 0.12, h * 0.34, 0.12]} />
        </mesh>
      ))}
      {facade?.stencil && h >= 9 && windows.filter(w => w.key.endsWith('-0') && w.side === escapeSide && (w.alongX ? lx === 0 : lz === 0)).map(w => {
        const size = Math.min(w.width * 0.8, h * 0.45, 9);
        return (
          <group key={`code-${w.key}`} position={[w.position[0], h * 0.62, w.position[2]]} rotation={[0, w.rot, 0]}>
            <mesh position={[0, 0, 0.1]} material={stencilMaterial(facade.stencil!)}><planeGeometry args={[size, size]} /></mesh>
          </group>
        );
      })}

      {/* Pipe runs along the outside walls of sheds, unbroken from tile to tile. */}
      {facade?.pipes && windows.map(w => (
        <group key={`pipes-${w.side}`} position={[w.position[0], 0, w.position[2]]} rotation={[0, w.rot, 0]}>
          <mesh position={[0, Math.min(h - 1.5, 5.5), 0.55]} rotation={[0, 0, Math.PI / 2]} material={pipeMaterial}>
            <cylinderGeometry args={[0.35, 0.35, w.width, 8]} />
          </mesh>
          <mesh position={[0, 3, 0.45]} rotation={[0, 0, Math.PI / 2]} material={rustMaterial}>
            <cylinderGeometry args={[0.25, 0.25, w.width, 8]} />
          </mesh>
          {/* A bracket at the middle of each tile's stretch. */}
          <mesh position={[0, Math.min(h - 1.5, 5.5) - 1.2, 0.3]} material={plantMaterial}>
            <boxGeometry args={[0.2, 3.4, 0.6]} />
          </mesh>
        </group>
      ))}

      {/* Sawtooth roof on every shed tile, running along the shed. */}
      {facade?.sawtooth && [-0.25, 0.25].map(o => (
        <group key={o} position={[longAlongX ? bx : bx + o * T, h, longAlongX ? bz + o * T : bz]} rotation={[0, longAlongX ? 0 : Math.PI / 2, 0]}>
          <mesh position={[0, 1.1, 0]} rotation={[-0.45, 0, 0]} material={sawtoothMaterial}>
            <boxGeometry args={[longAlongX ? bw : bd, 0.25, T * 0.5]} />
          </mesh>
          <mesh position={[0, 1.15, T * 0.24]} material={neonMaterial('#fbbf24')}>
            <boxGeometry args={[(longAlongX ? bw : bd) * 0.98, 2, 0.1]} />
          </mesh>
        </group>
      ))}

      {anchor && facade && <TowerCrown crown={facade.crown ?? 'spire'} span={Math.min(bw, bd)} long={Math.max(bw, bd)} alongX={bw >= bd} h={h} accent={accent} position={[bx, h, bz]} />}

    </group>
  );
};

// Capturing changes a building's capture progress every tick while infantry stand next to it, and
// a column of infantry crossing the city stands next to dozens. The segment's model only shows
// where it is, its kind and size and who owns it, so it re-renders only when one of those changes.
type SegmentProps = React.ComponentProps<typeof FootprintSegmentView>;
const sameSegment = (a: SegmentProps, b: SegmentProps) =>
  a.hovered === b.hovered && a.tileSize === b.tileSize && a.materialRef === b.materialRef && a.onBeforeCompile === b.onBeforeCompile &&
  a.data.gridX === b.data.gridX && a.data.gridZ === b.data.gridZ && a.data.type === b.data.type && a.data.owner === b.data.owner &&
  a.data.scale === b.data.scale && a.data.footprint === b.data.footprint;
export const FootprintSegment = React.memo(FootprintSegmentView, sameSegment);

// Whether a building draws with this kit: every city building laid out by district, whatever
// its size (core and server nodes keep their own models).
export const isFootprintSegment = (b: BuildingData): b is BuildingData & { footprint: NonNullable<BuildingData['footprint']> } =>
  !!b.footprint &&
  (b.type === 'commercial' || b.type === 'hightech' || b.type === 'industrial' || b.type === 'residential');
