// The estates' synthetic nature (layout in estateGroundsPlan.ts): palms, clipped hedges and lit pools
// on the open ground round the villas. Each kind a couple of instanced meshes. Scenery only:
// nothing here blocks movement or takes clicks.
//
// Colours keep to the scenery palette's rules (scenePalette.ts): the fronds and hedges a dark,
// dusty olive far from Tokugen's green, the pools a deep blue well clear of the server nodes'
// cyan.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingData, RoadTileData } from '../types';
import { canvas } from './corpoFacades';
import { estateGrounds } from './estateGroundsPlan';

// The lots' ground.
const GROUND_Y = 0.2;

type Part = [THREE.BufferGeometry, [number, number, number], [number, number, number]?];
function merged(parts: Part[]) {
  const list = parts.map(([g, at, rot]) => {
    if (rot) { g.rotateX(rot[0]); g.rotateZ(rot[2]); g.rotateY(rot[1]); }
    g.translate(...at);
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    return geo;
  });
  const out = mergeGeometries(list)!;
  list.forEach(g => g.dispose());
  return out;
}

// A palm of unit height 10: a slim ringed trunk, its crown of drooping fronds.
function palmGeometries() {
  const trunk: Part[] = [];
  for (let i = 0; i < 5; i++) trunk.push([new THREE.CylinderGeometry(0.2 - i * 0.015, 0.24 - i * 0.015, 2.05, 6), [0, 1 + i * 2, 0]]);
  const fronds: Part[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, droop = 0.35 + (i % 2) * 0.25;
    // A frond: a long flat blade from the crown, out and down.
    const g = new THREE.BoxGeometry(0.7, 0.06, 3.6);
    g.translate(0, 0, 1.8);
    fronds.push([g, [0, 10.1, 0], [droop, a, 0]]);
  }
  fronds.push([new THREE.IcosahedronGeometry(0.45, 0), [0, 9.9, 0]]);
  return { trunk: merged(trunk), fronds: merged(fronds) };
}

const waterTexture = () => canvas(128, (g, rnd) => {
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, '#22468a'); grad.addColorStop(1, '#142e62');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  // Caustics: thin bright lines wandering over the floor of the pool.
  g.strokeStyle = 'rgba(170,200,255,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 18; i++) {
    g.beginPath();
    let x = rnd() * 128, y = rnd() * 128;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
}, 8383);

const EstateGrounds: React.FC<{ roadTiles: readonly RoadTileData[]; buildings: readonly BuildingData[]; gridSize: number; tileSize: number; offset: number }> = ({ roadTiles, buildings, gridSize, tileSize: T, offset }) => {
  // Laid out once, from the city as it stands at the start.
  const g = useMemo(() => estateGrounds(roadTiles, buildings, gridSize), [roadTiles, gridSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => ({
    ...palmGeometries(),
    hedge: new THREE.BoxGeometry(1, 1, 1),
    coping: new THREE.BoxGeometry(1, 1, 1),
    water: new THREE.PlaneGeometry(1, 1),
    trunkMat: new THREE.MeshStandardMaterial({ color: '#6b5a46', roughness: 0.9 }),
    frondMat: new THREE.MeshStandardMaterial({ color: '#3e4a2e', roughness: 0.85, side: THREE.DoubleSide }),
    hedgeMat: new THREE.MeshStandardMaterial({ color: '#2f3628', roughness: 0.95 }),
    copingMat: new THREE.MeshStandardMaterial({ color: '#b5ab97', roughness: 0.5 }),
    waterMat: new THREE.MeshStandardMaterial({ map: waterTexture(), emissive: '#1d3f86', emissiveIntensity: 0.3, roughness: 0.05, metalness: 0.3, color: '#8a9ab8' }),
  }), []);
  useLayoutEffect(() => () => Object.values(res).forEach(r => (r as { dispose?: () => void }).dispose?.()), [res]);
  const trunks = useRef<THREE.InstancedMesh>(null), fronds = useRef<THREE.InstancedMesh>(null), hedges = useRef<THREE.InstancedMesh>(null);
  const copings = useRef<THREE.InstancedMesh>(null), waters = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const done = (m: THREE.InstancedMesh | null) => { if (m) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); } };
    g.palms.forEach((p, i) => {
      o.position.set(p.x * T - offset, GROUND_Y, p.z * T - offset);
      o.rotation.set(p.lean, p.turn, 0, 'YXZ');
      o.scale.setScalar(p.height / 10);
      o.updateMatrix();
      trunks.current?.setMatrixAt(i, o.matrix);
      fronds.current?.setMatrixAt(i, o.matrix);
    });
    g.hedges.forEach((h, i) => {
      o.position.set(h.x * T - offset, GROUND_Y + 0.55, h.z * T - offset);
      o.rotation.set(0, 0, 0);
      o.scale.set(h.alongX ? h.length * T : 0.9, 1.1, h.alongX ? 0.9 : h.length * T);
      o.updateMatrix();
      hedges.current?.setMatrixAt(i, o.matrix);
    });
    g.pools.forEach((p, i) => {
      o.position.set(p.x * T - offset, GROUND_Y + 0.08, p.z * T - offset);
      o.rotation.set(0, 0, 0);
      o.scale.set(p.w * T + 1.4, 0.16, p.d * T + 1.4);
      o.updateMatrix();
      copings.current?.setMatrixAt(i, o.matrix);
      o.position.y = GROUND_Y + 0.17;
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.set(p.w * T, p.d * T, 1);
      o.updateMatrix();
      waters.current?.setMatrixAt(i, o.matrix);
    });
    [trunks, fronds, hedges, copings, waters].forEach(r => done(r.current));
  }, [g, T, offset]);
  return (
    <group>
      {g.palms.length > 0 && <instancedMesh ref={trunks} args={[res.trunk, res.trunkMat, g.palms.length]} castShadow raycast={() => null} />}
      {g.palms.length > 0 && <instancedMesh ref={fronds} args={[res.fronds, res.frondMat, g.palms.length]} castShadow raycast={() => null} />}
      {g.hedges.length > 0 && <instancedMesh ref={hedges} args={[res.hedge, res.hedgeMat, g.hedges.length]} castShadow receiveShadow raycast={() => null} />}
      {g.pools.length > 0 && <instancedMesh ref={copings} args={[res.coping, res.copingMat, g.pools.length]} receiveShadow raycast={() => null} />}
      {g.pools.length > 0 && <instancedMesh ref={waters} args={[res.water, res.waterMat, g.pools.length]} raycast={() => null} />}
    </group>
  );
};

export default React.memo(EstateGrounds);
