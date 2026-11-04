// Everyday rulers on the pavements (layout in streetFurniturePlan.ts): benches, vending machines,
// dumpsters and bollards at the foot of the tall buildings, each kind one or two instanced
// meshes. Scenery only: nothing here blocks movement or takes clicks.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingData, RoadTileData } from '../types';
import { SCENE } from './scenePalette';
import { type FurnitureKind, streetFurniture } from './streetFurniturePlan';

// The pavement's top.
const PAVEMENT_Y = 0.5;

type Part = [THREE.BufferGeometry, [number, number, number], number?];
function merged(parts: Part[]) {
  const list = parts.map(([g, at, tilt]) => {
    if (tilt) g.rotateX(tilt);
    g.translate(...at);
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    return geo;
  });
  const out = mergeGeometries(list)!;
  list.forEach(g => g.dispose());
  return out;
}

// Each kind's body (front toward +z), and for the vending machine its lit face.
function bodies(): Record<FurnitureKind, THREE.BufferGeometry> {
  const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  return {
    bench: merged([[B(2.2, 0.12, 0.6), [0, 0.5, 0]], [B(2.2, 0.55, 0.08), [0, 0.85, -0.3], -0.2], [B(0.1, 0.5, 0.55), [-0.95, 0.25, 0]], [B(0.1, 0.5, 0.55), [0.95, 0.25, 0]]]),
    vending: merged([[B(1.1, 2.1, 0.8), [0, 1.05, 0]], [B(1.16, 0.12, 0.86), [0, 2.12, 0]]]),
    dumpster: merged([[B(2, 1.15, 1.2), [0, 0.6, 0]], [B(2.05, 0.08, 1.25), [0, 1.35, -0.25], -0.5], [B(0.08, 0.3, 0.08), [-0.8, 0.15, 0.45]], [B(0.08, 0.3, 0.08), [0.8, 0.15, 0.45]]]),
    bollards: merged([-1.1, 0, 1.1].flatMap(x => [[new THREE.CylinderGeometry(0.14, 0.16, 0.9, 8), [x, 0.45, 0.3]], [new THREE.CylinderGeometry(0.15, 0.15, 0.08, 8), [x, 0.92, 0.3]]] as Part[])),
  };
}

const MATERIALS: Record<FurnitureKind, THREE.Material> = {
  bench: new THREE.MeshStandardMaterial({ color: '#3a3d44', metalness: 0.6, roughness: 0.5 }),
  vending: new THREE.MeshStandardMaterial({ color: '#22242c', metalness: 0.5, roughness: 0.5 }),
  // Tinted per piece (instance colours), a dull blue or rust.
  dumpster: new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.4, roughness: 0.7 }),
  bollards: new THREE.MeshStandardMaterial({ color: '#4a4d55', metalness: 0.7, roughness: 0.4 }),
};
const DUMPSTER_COLOURS = ['#34445a', '#6b3a26', '#4a4d52'].map(c => new THREE.Color(c));
const VENDING_COLOURS = [SCENE.hotPink, SCENE.blue, SCENE.coral, SCENE.magenta].map(c => new THREE.Color(c));
const screenMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });

const StreetFurniture: React.FC<{ roadTiles: readonly RoadTileData[]; buildings: readonly BuildingData[]; gridSize: number; tileSize: number; offset: number }> = ({ roadTiles, buildings, gridSize, tileSize: T, offset }) => {
  // Laid out once, from the city as it stands at the start.
  const pieces = useMemo(() => streetFurniture(roadTiles, buildings, gridSize), [roadTiles, gridSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const geo = useMemo(() => ({ ...bodies(), screen: new THREE.PlaneGeometry(0.9, 1.5) }), []);
  useLayoutEffect(() => () => Object.values(geo).forEach(g => g.dispose()), [geo]);
  const byKind = useMemo(() => {
    const m: Record<FurnitureKind, typeof pieces> = { bench: [], vending: [], dumpster: [], bollards: [] };
    for (const p of pieces) m[p.kind].push(p);
    return m;
  }, [pieces]);
  const refs = { bench: useRef<THREE.InstancedMesh>(null), vending: useRef<THREE.InstancedMesh>(null), dumpster: useRef<THREE.InstancedMesh>(null), bollards: useRef<THREE.InstancedMesh>(null) };
  const screens = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    for (const kind of Object.keys(byKind) as FurnitureKind[]) {
      const m = refs[kind].current;
      if (!m) continue;
      byKind[kind].forEach((p, i) => {
        o.position.set(p.x * T - offset, PAVEMENT_Y, p.z * T - offset); o.rotation.set(0, p.turn, 0); o.scale.setScalar(1); o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
        if (kind === 'dumpster') m.setColorAt(i, DUMPSTER_COLOURS[i % DUMPSTER_COLOURS.length]);
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere();
    }
    const s = screens.current;
    if (s) {
      byKind.vending.forEach((p, i) => {
        o.position.set(p.x * T - offset + Math.sin(p.turn) * 0.41, PAVEMENT_Y + 1.15, p.z * T - offset + Math.cos(p.turn) * 0.41); o.rotation.set(0, p.turn, 0); o.updateMatrix();
        s.setMatrixAt(i, o.matrix);
        s.setColorAt(i, VENDING_COLOURS[i % VENDING_COLOURS.length]);
      });
      s.instanceMatrix.needsUpdate = true;
      if (s.instanceColor) s.instanceColor.needsUpdate = true;
      s.computeBoundingSphere();
    }
  }, [byKind, T, offset]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      {(Object.keys(byKind) as FurnitureKind[]).map(kind => byKind[kind].length > 0 && (
        <instancedMesh key={kind} ref={refs[kind]} args={[geo[kind], MATERIALS[kind], byKind[kind].length]} castShadow receiveShadow raycast={() => null} />
      ))}
      {byKind.vending.length > 0 && <instancedMesh ref={screens} args={[geo.screen, screenMaterial, byKind.vending.length]} raycast={() => null} />}
    </group>
  );
};

export default React.memo(StreetFurniture);
