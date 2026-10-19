// City buildings that span more than one tile (sim/mapgen.ts lays them out by district).
//
// Every tile is still its own building in the game: it is captured, damaged and destroyed on its
// own. But a tile that is part of a bigger footprint draws itself as its piece of one continuous
// building: its body runs right up to the tile edge where it joins the rest of the footprint, and
// only the outside faces get windows and neon. One tile of each building, its anchor, carries the
// rooftop pieces, so a building has one crown, one smokestack or one water tank, not one per tile.
//
// The look follows the building type, which follows the district:
//   commercial (core, downtown): glass curtain walls, a setback crown and spire; towers on podiums
//   hightech (midtown):          banded data-centre floors, rooftop plant
//   industrial:                  low sawtooth-roofed sheds, a smokestack
//   residential (outskirts):     lit apartment windows, a water tank

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { TEAM_COLORS } from '../constants';
import type { BuildingData } from '../types';

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
  if (kind === 'commercial') {
    // Curtain wall: full-height glass between thin mullions, a few floors brighter.
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 8; row++) {
        const lit = rnd();
        g.fillStyle = lit > 0.85 ? 'rgba(240,171,252,0.85)' : lit > 0.45 ? 'rgba(125,211,252,0.55)' : 'rgba(56,189,248,0.18)';
        g.fillRect(col * 32 + 3, row * 16 + 2, 26, 13);
      }
    }
  } else if (kind === 'hightech') {
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
const roofMaterial = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.6, roughness: 0.5 });
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

// How high the podium under a tower stands (the podium tiles around it are 8-12).
const PODIUM_HEIGHT = 10;

type Side = 'west' | 'east' | 'north' | 'south';

export const FootprintSegment: React.FC<{
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
  const accent = data.owner ? TEAM_COLORS[data.owner] : style.accent;

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
    const tower = isTower ? { x0: -T * 0.31, x1: T * 0.31, z0: -T * 0.31, z1: T * 0.31 } : null;
    const body = tower ?? box;
    const faces = (Object.keys(outside) as Side[]).filter(s => tower || outside[s]);
    const worldX = data.gridX * T;
    const worldZ = data.gridZ * T;
    const bottom = tower ? PODIUM_HEIGHT : style.groundFloor;
    const windows = faces.map(side => {
      const alongX = side === 'north' || side === 'south';
      const width = alongX ? body.x1 - body.x0 : body.z1 - body.z0;
      const start = alongX ? worldX + body.x0 : worldZ + body.z0;
      const height = Math.max(0.5, h - bottom - 0.8);
      const geometry = faceGeometry(width, height, start / style.texW, bottom / style.texH, style.texW, style.texH);
      const cx = alongX ? (body.x0 + body.x1) / 2 : side === 'west' ? body.x0 - 0.04 : body.x1 + 0.04;
      const cz = alongX ? (side === 'north' ? body.z0 - 0.04 : body.z1 + 0.04) : (body.z0 + body.z1) / 2;
      const rot = side === 'north' ? Math.PI : side === 'south' ? 0 : side === 'west' ? -Math.PI / 2 : Math.PI / 2;
      return { side, geometry, position: [cx, bottom + height / 2, cz] as [number, number, number], rot, width, alongX };
    });
    // The roof slab runs on unbroken across tiles and stops short of the outside edges.
    const rim = (side: Side) => (tower || outside[side] ? ROOF_RIM : 0);
    const cap = { x0: body.x0 + rim('west'), x1: body.x1 - rim('east'), z0: body.z0 + rim('north'), z1: body.z1 - rim('south') };
    return { box, body, tower, windows, faces, cap };
  }, [T, lx, lz, f.w, f.d, isTower, data.gridX, data.gridZ, h, style]);

  useEffect(() => () => parts.windows.forEach(w => w.geometry.dispose()), [parts]);
  const { box, body, tower, windows, cap } = parts;
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
      <mesh position={[bx, h / 2, bz]} castShadow receiveShadow>
        <boxGeometry args={[bw, h, bd]} />
        <meshStandardMaterial ref={materialRef} metalness={0.6} roughness={0.35} onBeforeCompile={onBeforeCompile} />
        {hovered && <Edges color="#ffffff" threshold={40} />}
      </mesh>

      <mesh position={[(cap.x0 + cap.x1) / 2, h + 0.12, (cap.z0 + cap.z1) / 2]} material={roofCapMaterial(data.owner)}>
        <boxGeometry args={[cap.x1 - cap.x0, 0.25, cap.z1 - cap.z0]} />
      </mesh>

      {windows.map(w => (
        <group key={w.side}>
          <mesh geometry={w.geometry} position={w.position} rotation={[0, w.rot, 0]} material={windowMaterial(kind)} />
          {/* A neon line along the top of each outside face. */}
          <mesh position={[w.position[0], h - 0.3, w.position[2]]} rotation={[0, w.rot, 0]} material={neonMaterial(accent)}>
            <boxGeometry args={[w.width, 0.35, 0.25]} />
          </mesh>
        </group>
      ))}

      {/* Sawtooth roof on every shed tile, running along the shed. */}
      {kind === 'industrial' && [-0.25, 0.25].map(o => (
        <group key={o} position={[longAlongX ? bx : bx + o * T, h, longAlongX ? bz + o * T : bz]} rotation={[0, longAlongX ? 0 : Math.PI / 2, 0]}>
          <mesh position={[0, 1.1, 0]} rotation={[-0.45, 0, 0]} material={sawtoothMaterial}>
            <boxGeometry args={[longAlongX ? bw : bd, 0.25, T * 0.5]} />
          </mesh>
          <mesh position={[0, 1.15, T * 0.24]} material={neonMaterial('#fbbf24')}>
            <boxGeometry args={[(longAlongX ? bw : bd) * 0.98, 2, 0.1]} />
          </mesh>
        </group>
      ))}

      {anchor && kind === 'commercial' && (
        <group position={[bx, h, bz]}>
          <mesh position={[0, 2, 0]} material={podiumMaterial}>
            <boxGeometry args={[Math.min(bw, bd) * 0.6, 4, Math.min(bw, bd) * 0.6]} />
          </mesh>
          {/* A neon band round the crown, just below its top. */}
          <mesh position={[0, 3.6, 0]} material={neonMaterial(accent)}>
            <boxGeometry args={[Math.min(bw, bd) * 0.62, 0.3, Math.min(bw, bd) * 0.62]} />
          </mesh>
          <mesh position={[0, 4 + h * 0.12, 0]} material={plantMaterial}>
            <cylinderGeometry args={[0.15, 0.3, h * 0.24, 6]} />
          </mesh>
          <mesh position={[0, 4 + h * 0.24, 0]} material={neonMaterial('#ff003c')}>
            <sphereGeometry args={[0.45, 8, 6]} />
          </mesh>
        </group>
      )}

      {anchor && kind === 'hightech' && (
        <group position={[bx, h, bz]}>
          <mesh position={[-T * 0.18, 0.9, -T * 0.12]} material={plantMaterial}>
            <boxGeometry args={[T * 0.25, 1.8, T * 0.3]} />
          </mesh>
          <mesh position={[T * 0.18, 0.7, T * 0.1]} material={plantMaterial}>
            <boxGeometry args={[T * 0.2, 1.4, T * 0.2]} />
          </mesh>
          <mesh position={[T * 0.18, 1.5, T * 0.1]} rotation={[-Math.PI / 2, 0, 0]} material={neonMaterial(accent)}>
            <ringGeometry args={[T * 0.05, T * 0.08, 16]} />
          </mesh>
          <mesh position={[-T * 0.25, 3.5, T * 0.2]} material={plantMaterial}>
            <cylinderGeometry args={[0.1, 0.1, 7, 4]} />
          </mesh>
        </group>
      )}

      {anchor && kind === 'industrial' && (
        <group position={[bx + T * 0.2, h, bz - T * 0.2]}>
          <mesh position={[0, 6, 0]} material={plantMaterial} castShadow>
            <cylinderGeometry args={[1, 1.3, 12, 10]} />
          </mesh>
          <mesh position={[0, 11.2, 0]} material={neonMaterial('#ff003c')}>
            <cylinderGeometry args={[1.05, 1.05, 0.4, 10]} />
          </mesh>
        </group>
      )}

      {anchor && kind === 'residential' && (
        <group position={[bx + T * 0.15, h, bz + T * 0.15]}>
          <mesh position={[0, 1, 0]} material={plantMaterial}>
            <cylinderGeometry args={[0.15, 0.15, 2, 4]} />
          </mesh>
          <mesh position={[0, 3, 0]} material={roofMaterial}>
            <cylinderGeometry args={[1.6, 1.6, 2.4, 10]} />
          </mesh>
          <mesh position={[-T * 0.35, 0.6, -T * 0.3]} material={plantMaterial}>
            <boxGeometry args={[T * 0.2, 1.2, T * 0.15]} />
          </mesh>
        </group>
      )}
    </group>
  );
};

// Whether a building draws as part of a multi-tile footprint.
export const isFootprintSegment = (b: BuildingData): b is BuildingData & { footprint: NonNullable<BuildingData['footprint']> } =>
  !!b.footprint && b.footprint.w * b.footprint.d > 1 &&
  (b.type === 'commercial' || b.type === 'hightech' || b.type === 'industrial' || b.type === 'residential');
