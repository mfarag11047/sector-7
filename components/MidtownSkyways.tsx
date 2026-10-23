// The enclosed sky walkways joining the buildings of each midtown apartment complex across the
// alleys between them (midtownLooks.ts skyways): a dark glazed bridge with a lit window strip
// down each side and a teal line along its underside. Scenery, never clicked.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingData } from '../types';
import { skyways, type Skyway } from './midtownLooks';

const HEIGHT = 2.4;
const noRaycast = () => null;

// Each part of a walkway as a box relative to its middle: across (share of a tile), up, along
// (extra beyond the alley, in tiles).
const PARTS = {
  tube: { across: 0.3, up: HEIGHT, y: 0, extra: 0.3 },
  glass: { across: 0.31, up: 0.9, y: 0.25, extra: 0.2 },
  line: { across: 0.12, up: 0.12, y: -HEIGHT / 2 - 0.06, extra: 0.2 },
};

const MidtownSkyways: React.FC<{ buildings: BuildingData[]; tileSize: number; offset: number }> = ({ buildings, tileSize: T, offset }) => {
  const gridSize = Math.round((offset * 2) / T);
  const ways = useMemo(() => skyways(buildings, gridSize), [buildings, gridSize]);
  const refs = { tube: useRef<THREE.InstancedMesh>(null), glass: useRef<THREE.InstancedMesh>(null), line: useRef<THREE.InstancedMesh>(null) };
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (const [name, part] of Object.entries(PARTS) as [keyof typeof PARTS, typeof PARTS.tube][]) {
      const mesh = refs[name].current;
      if (!mesh) continue;
      ways.forEach((w: Skyway, i) => {
        const length = (w.span + part.extra) * T;
        o.position.set(w.x * T - offset, w.y + part.y, w.z * T - offset);
        o.scale.set(w.alongX ? length : part.across * T, part.up, w.alongX ? part.across * T : length);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  });
  if (ways.length === 0) return null;
  return (
    <group>
      <instancedMesh key={`tube-${ways.length}`} ref={refs.tube} args={[undefined, undefined, ways.length]} raycast={noRaycast} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1c2526" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh key={`glass-${ways.length}`} ref={refs.glass} args={[undefined, undefined, ways.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#b9f6e6" toneMapped={false} transparent opacity={0.7} />
      </instancedMesh>
      <instancedMesh key={`line-${ways.length}`} ref={refs.line} args={[undefined, undefined, ways.length]} raycast={noRaycast}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#2dd4bf" toneMapped={false} />
      </instancedMesh>
    </group>
  );
};

export default React.memo(MidtownSkyways);
