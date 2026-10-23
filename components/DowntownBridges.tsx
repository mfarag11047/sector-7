// Megastructure sky-bridges downtown: a few massive enclosed bridges, high up, spanning the street
// between two corporate towers that face each other across it, so the road runs on under a dark
// mass of building. Picked by hand (BRIDGES) on blue's side; each has a twin on red's. A bridge
// goes when either of its towers is destroyed. Scenery, never clicked.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingData } from '../types';

type Footprint = NonNullable<BuildingData['footprint']>;

// Pairs of towers on blue's side, by the corners of their footprints: [west or north, east or south].
const BRIDGES: [string, string][] = [
  // Over the boulevard on its way north out of the plaza, and at the plaza itself.
  ['37,25', '40,25'], ['37,31', '40,31'],
  // Over the boulevard west of the plaza.
  ['31,37', '31,40'],
  // On the corner block, across its street.
  ['25,29', '25,31'],
];

export interface Bridge {
  // Middle, in tile coordinates; height of its middle in world units.
  x: number;
  z: number;
  y: number;
  // Runs along x (else z); its length along the run and breadth across it, in tiles.
  alongX: boolean;
  length: number;
  breadth: number;
  // The two towers it joins.
  ends: [string, string];
}

const HEIGHT = 14;

export function downtownBridges(buildings: readonly BuildingData[], gridSize: number): Bridge[] {
  const last = gridSize - 1;
  const towers = new Map<string, { f: Footprint; h: number }>();
  for (const b of buildings) if (b.type === 'commercial' && b.footprint) towers.set(`${b.footprint.x},${b.footprint.z}`, { f: b.footprint, h: b.height });
  const twin = (k: string) => {
    const t = towers.get(k);
    return t ? `${last - (t.f.x + t.f.w - 1)},${last - (t.f.z + t.f.d - 1)}` : '';
  };
  const out: Bridge[] = [];
  for (const [ka, kb] of BRIDGES) {
    for (const [p, q] of [[ka, kb], [twin(kb), twin(ka)]]) {
      const a = towers.get(p), b = towers.get(q);
      if (!a || !b) continue;
      const alongX = b.f.x > a.f.x + a.f.w - 1;
      const lo = alongX ? Math.max(a.f.z, b.f.z) : Math.max(a.f.x, b.f.x);
      const hi = alongX ? Math.min(a.f.z + a.f.d, b.f.z + b.f.d) : Math.min(a.f.x + a.f.w, b.f.x + b.f.w);
      const gap = alongX ? a.f.x + a.f.w : a.f.z + a.f.d;
      // Over the road and well into both towers, most of their shared width.
      const across = (lo + hi - 1) / 2;
      out.push({
        x: alongX ? gap : across, z: alongX ? across : gap,
        y: Math.min(a.h, b.h) * 0.55, alongX, length: 2.2, breadth: (hi - lo) * 0.8, ends: [p, q],
      });
    }
  }
  return out;
}

const noRaycast = () => null;
// Each part as a box relative to the bridge's middle: [length share, height, breadth share, y].
const PARTS = {
  body: [1, HEIGHT, 1, 0],
  // Bands of lit windows along both long faces.
  glow: [0.96, 1.2, 1.02, 1.8],
  glow2: [0.96, 0.6, 1.02, -1.6],
  // A neon line along its underside.
  under: [1, 0.2, 0.3, -HEIGHT / 2 - 0.1],
} as const;

const DowntownBridges: React.FC<{ buildings: BuildingData[]; tileSize: number; offset: number }> = ({ buildings, tileSize: T, offset }) => {
  const gridSize = Math.round((offset * 2) / T);
  const all = useMemo(() => downtownBridges(buildings, gridSize), [buildings, gridSize]);
  // Only standing bridges: both towers whole.
  const fallen = useMemo(() => new Set(buildings.filter(b => b.destroyed && b.footprint && b.type === 'commercial').map(b => `${b.footprint!.x},${b.footprint!.z}`)), [buildings]);
  const key = [...fallen].sort().join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bridges = useMemo(() => all.filter(b => !fallen.has(b.ends[0]) && !fallen.has(b.ends[1])), [all, key]);
  const refs = { body: useRef<THREE.InstancedMesh>(null), glow: useRef<THREE.InstancedMesh>(null), glow2: useRef<THREE.InstancedMesh>(null), under: useRef<THREE.InstancedMesh>(null) };
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (const [name, [l, h, w, y]] of Object.entries(PARTS) as [keyof typeof PARTS, readonly number[]][]) {
      const mesh = refs[name].current;
      if (!mesh) continue;
      bridges.forEach((b, i) => {
        const length = b.length * T * l, breadth = b.breadth * T * w;
        o.position.set(b.x * T - offset, b.y + y, b.z * T - offset);
        o.scale.set(b.alongX ? length : breadth, h, b.alongX ? breadth : length);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  if (bridges.length === 0) return null;
  const n = bridges.length;
  return (
    <group>
      <instancedMesh key={`b-${n}`} ref={refs.body} args={[undefined, undefined, n]} raycast={noRaycast} castShadow receiveShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#15171b" metalness={0.7} roughness={0.4} />
      </instancedMesh>
      <instancedMesh key={`g-${n}`} ref={refs.glow} args={[undefined, undefined, n]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#fde4b0" toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`g2-${n}`} ref={refs.glow2} args={[undefined, undefined, n]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#67e8f9" toneMapped={false} />
      </instancedMesh>
      <instancedMesh key={`u-${n}`} ref={refs.under} args={[undefined, undefined, n]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#e879f9" toneMapped={false} />
      </instancedMesh>
    </group>
  );
};

export default React.memo(DowntownBridges);
