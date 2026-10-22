// Street furniture for the corporate core and downtown, over their granite and plaza stone
// (components/districtTheme.ts):
//   - a glowing neon line inlaid along the kerb, wherever a block's granite meets the street;
//   - long low planters with clipped hedges against the foot of every tower, on its open sides.
// Laid out from the map's tiles, so both sides of the map get the same. Scenery only.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingData, RoadTileData } from '../types';
import { districtOfTile, groundOfTile } from './districtTheme';

type Side = 'n' | 's' | 'e' | 'w';
const STEP: Record<Side, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

export interface DowntownLayout {
  // A granite tile's edge onto the street, lit along the kerb.
  neon: { x: number; z: number; side: Side }[];
  // An open tile's edge against a tower, with a planter along it.
  planters: { x: number; z: number; side: Side }[];
}

export function downtownLayout(tiles: readonly RoadTileData[], buildings: readonly BuildingData[], gridSize: number): DowntownLayout {
  const type = new Map<string, RoadTileData['type']>(tiles.map(t => [`${t.x},${t.z}`, t.type]));
  const isRoad = (x: number, z: number) => { const k = type.get(`${x},${z}`); return k === 'main' || k === 'street'; };
  const tower = new Set(buildings.filter(b => b.type === 'commercial').map(b => `${b.gridX},${b.gridZ}`));
  const neon: DowntownLayout['neon'] = [];
  const planters: DowntownLayout['planters'] = [];
  for (const t of tiles) {
    if (t.type !== 'open') continue;
    const district = districtOfTile(t.x, t.z, gridSize);
    if (district !== 'downtown' && district !== 'core') continue;
    const granite = groundOfTile(t.x, t.z, gridSize) === 'granite';
    for (const side of Object.keys(STEP) as Side[]) {
      const [dx, dz] = STEP[side];
      if (granite && isRoad(t.x + dx, t.z + dz)) neon.push({ x: t.x, z: t.z, side });
      if (tower.has(`${t.x + dx},${t.z + dz}`)) planters.push({ x: t.x, z: t.z, side });
    }
  }
  return { neon, planters };
}

const ROAD_TOP = 0.2;
const NEON = '#e879f9';
const noRaycast = () => null;

// Places one instance per tile edge: `inset` (in tiles) in from that edge, `y` up, its length
// running along the edge.
function useEdgeInstances(ref: React.RefObject<THREE.InstancedMesh | null>, edges: readonly { x: number; z: number; side: Side }[], tileSize: number, offset: number, inset: number, y: number) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    edges.forEach((e, i) => {
      const [dx, dz] = STEP[e.side];
      const out = (0.5 - inset) * tileSize;
      o.position.set(e.x * tileSize - offset + dx * out, y, e.z * tileSize - offset + dz * out);
      o.rotation.set(0, dx !== 0 ? Math.PI / 2 : 0, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [ref, edges, tileSize, offset, inset, y]);
}

const DowntownDressing: React.FC<{ tiles: RoadTileData[]; buildings: BuildingData[]; tileSize: number; offset: number }> = ({ tiles, buildings, tileSize, offset }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const layout = useMemo(() => downtownLayout(tiles, buildings, gridSize), [tiles, buildings, gridSize]);
  const neon = useRef<THREE.InstancedMesh>(null);
  const boxes = useRef<THREE.InstancedMesh>(null);
  const hedges = useRef<THREE.InstancedMesh>(null);
  const PLANTER_H = 0.9;
  useEdgeInstances(neon, layout.neon, tileSize, offset, 0.06, ROAD_TOP + 0.05);
  useEdgeInstances(boxes, layout.planters, tileSize, offset, 0.14, ROAD_TOP + PLANTER_H / 2);
  useEdgeInstances(hedges, layout.planters, tileSize, offset, 0.14, ROAD_TOP + PLANTER_H + 0.35);
  return (
    <group>
      {layout.neon.length > 0 && (
        <instancedMesh key={`neon-${layout.neon.length}`} ref={neon} args={[undefined, undefined, layout.neon.length]} raycast={noRaycast}>
          <boxGeometry args={[tileSize, 0.12, tileSize * 0.05]} />
          <meshBasicMaterial color={NEON} toneMapped={false} />
        </instancedMesh>
      )}
      {layout.planters.length > 0 && (
        <>
          <instancedMesh key={`planters-${layout.planters.length}`} ref={boxes} args={[undefined, undefined, layout.planters.length]} raycast={noRaycast} castShadow receiveShadow>
            <boxGeometry args={[tileSize * 0.78, PLANTER_H, tileSize * 0.16]} />
            <meshStandardMaterial color="#3b4152" roughness={0.6} metalness={0.3} />
          </instancedMesh>
          <instancedMesh key={`hedges-${layout.planters.length}`} ref={hedges} args={[undefined, undefined, layout.planters.length]} raycast={noRaycast} castShadow>
            <boxGeometry args={[tileSize * 0.72, 0.7, tileSize * 0.12]} />
            <meshStandardMaterial color="#2c5a3c" roughness={0.95} emissive="#0d2a18" />
          </instancedMesh>
        </>
      )}
    </group>
  );
};

export default React.memo(DowntownDressing);
