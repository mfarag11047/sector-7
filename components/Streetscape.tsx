// Sidewalks and crosswalks on the streets of the districts that have them (districtTheme.ts).
//
// A sidewalk is a raised slab along each edge of a road tile that faces a city lot (open ground
// or a building), so the lots read as kerbed blocks and the roads as streets. Crosswalks are
// zebra bars on the road tiles leading into each intersection. Both are scenery only: they
// don't block movement or take clicks, and each is a single instanced mesh.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { RoadTileData } from '../types';
import { createCrosswalkTexture, createSidewalkTexture, themeOfTile } from './districtTheme';

type Side = 'n' | 's' | 'e' | 'w';
const STEP: Record<Side, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

export interface StreetscapeLayout {
  sidewalks: { x: number; z: number; side: Side }[];
  // `axis`: the direction the road runs on this tile, x or z.
  crosswalks: { x: number; z: number; toward: Side; axis: 'x' | 'z' }[];
}

// Where the sidewalks and crosswalks go, from the road tiles and the districts.
export function streetscapeLayout(tiles: readonly RoadTileData[], gridSize: number): StreetscapeLayout {
  const type = new Map<number, RoadTileData['type']>();
  for (const t of tiles) type.set(t.x * 4096 + t.z, t.type);
  const isRoad = (x: number, z: number) => { const k = type.get(x * 4096 + z); return k === 'main' || k === 'street'; };
  const inside = (x: number, z: number) => x >= 0 && z >= 0 && x < gridSize && z < gridSize;
  const sidewalks: StreetscapeLayout['sidewalks'] = [];
  const crosswalks: StreetscapeLayout['crosswalks'] = [];
  for (const t of tiles) {
    if (t.type === 'open') continue;
    const theme = themeOfTile(t.x, t.z, gridSize);
    if (theme.sidewalks) {
      for (const side of Object.keys(STEP) as Side[]) {
        const [dx, dz] = STEP[side];
        const nx = t.x + dx, nz = t.z + dz;
        // A lot beside the road: open ground or a building.
        if (inside(nx, nz) && !isRoad(nx, nz)) sidewalks.push({ x: t.x, z: t.z, side });
      }
    }
    // An intersection: road leading off it both ways along x and along z.
    if (theme.crosswalks && (isRoad(t.x - 1, t.z) || isRoad(t.x + 1, t.z)) && (isRoad(t.x, t.z - 1) || isRoad(t.x, t.z + 1))) {
      for (const side of Object.keys(STEP) as Side[]) {
        const [dx, dz] = STEP[side];
        if (!isRoad(t.x + dx, t.z + dz)) continue;
        // On the tile leading in, facing back toward the intersection.
        const toward: Side = side === 'e' ? 'w' : side === 'w' ? 'e' : side === 'n' ? 's' : 'n';
        crosswalks.push({ x: t.x + dx, z: t.z + dz, toward, axis: dx !== 0 ? 'x' : 'z' });
      }
    }
  }
  return { sidewalks, crosswalks };
}

const SIDEWALK_WIDTH = 0.16; // Of a tile.
const SIDEWALK_HEIGHT = 0.3;
const ROAD_TOP = 0.2;

const Streetscape: React.FC<{ tiles: RoadTileData[]; tileSize: number; offset: number; tileScale?: number }> = ({ tiles, tileSize, offset, tileScale = 0.95 }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const layout = useMemo(() => streetscapeLayout(tiles, gridSize), [tiles, gridSize]);
  const sidewalkTex = useMemo(createSidewalkTexture, []);
  const crosswalkTex = useMemo(createCrosswalkTexture, []);
  const walks = useRef<THREE.InstancedMesh>(null);
  const zebras = useRef<THREE.InstancedMesh>(null);
  const span = tileSize * tileScale;
  const width = tileSize * SIDEWALK_WIDTH;

  useLayoutEffect(() => {
    const mesh = walks.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    layout.sidewalks.forEach((w, i) => {
      const [dx, dz] = STEP[w.side];
      const inset = span / 2 - width / 2;
      o.position.set(w.x * tileSize - offset + dx * inset, ROAD_TOP + SIDEWALK_HEIGHT / 2, w.z * tileSize - offset + dz * inset);
      // The slab's length runs along the edge.
      o.rotation.set(0, dx !== 0 ? Math.PI / 2 : 0, 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [layout, tileSize, offset, span, width]);

  useLayoutEffect(() => {
    const mesh = zebras.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    layout.crosswalks.forEach((c, i) => {
      const [dx, dz] = STEP[c.toward];
      // At the end of the tile nearest the intersection.
      const shift = span * 0.28;
      o.position.set(c.x * tileSize - offset + dx * shift, ROAD_TOP + 0.03, c.z * tileSize - offset + dz * shift);
      // The bars run with the traffic.
      o.rotation.set(-Math.PI / 2, 0, c.axis === 'x' ? Math.PI / 2 : 0);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [layout, tileSize, offset, span]);

  return (
    <group>
      {layout.sidewalks.length > 0 && (
        <instancedMesh key={`walks-${layout.sidewalks.length}`} ref={walks} args={[undefined, undefined, layout.sidewalks.length]} raycast={() => null} receiveShadow>
          <boxGeometry args={[span, SIDEWALK_HEIGHT, width]} />
          <meshStandardMaterial map={sidewalkTex} roughness={0.9} metalness={0.05} />
        </instancedMesh>
      )}
      {layout.crosswalks.length > 0 && (
        <instancedMesh key={`zebras-${layout.crosswalks.length}`} ref={zebras} args={[undefined, undefined, layout.crosswalks.length]} raycast={() => null}>
          <planeGeometry args={[span * 0.62, span * 0.36]} />
          <meshStandardMaterial map={crosswalkTex} transparent depthWrite={false} roughness={0.8} />
        </instancedMesh>
      )}
    </group>
  );
};

export default React.memo(Streetscape);
