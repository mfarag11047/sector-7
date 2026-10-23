// Pipe gantries in the industrial zones, after Night City's refineries: wherever two industrial
// buildings face each other across an alley or a street, a run of pipes crosses between them,
// high up. Between the big halls and sheds it rides a red steel truss with grey and red pipes;
// between the small utility blocks it is just a pair of bare pipes, so the tank yards read as
// one plumbed-together plant. Goes when either building falls. Scenery, never clicked.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingData } from '../types';
import { districtOfTile } from './districtTheme';

type Footprint = NonNullable<BuildingData['footprint']>;

export interface Gantry {
  // Middle, in tile coordinates, and its height in world units.
  x: number;
  z: number;
  y: number;
  alongX: boolean;
  // A red truss carrying pipes, else bare pipes.
  truss: boolean;
  ends: [string, string];
}

export function industrialGantries(buildings: readonly BuildingData[], gridSize: number): Gantry[] {
  const prints = new Map<string, { f: Footprint; h: number }>();
  for (const b of buildings) {
    const f = b.footprint;
    if (!f || b.type !== 'industrial' || districtOfTile(f.x, f.z, gridSize) !== 'industrial') continue;
    prints.set(`${f.x},${f.z}`, { f, h: b.height });
  }
  const all = [...prints.entries()];
  const out: Gantry[] = [];
  for (const [ka, a] of all) for (const [kb, b] of all) {
    for (const alongX of [true, false]) {
      const gap = alongX ? a.f.x + a.f.w : a.f.z + a.f.d;
      if ((alongX ? b.f.x : b.f.z) !== gap + 1) continue;
      const lo = alongX ? Math.max(a.f.z, b.f.z) : Math.max(a.f.x, b.f.x);
      const hi = alongX ? Math.min(a.f.z + a.f.d, b.f.z + b.f.d) : Math.min(a.f.x + a.f.w, b.f.x + b.f.w);
      if (hi <= lo) continue;
      const across = (lo + hi - 1) / 2;
      const truss = a.f.w * a.f.d > 1 || b.f.w * b.f.d > 1;
      out.push({ x: alongX ? gap : across, z: alongX ? across : gap, y: Math.min(a.h, b.h) * 0.72, alongX, truss, ends: [ka, kb] });
    }
  }
  return out;
}

const noRaycast = () => null;

const IndustrialGantries: React.FC<{ buildings: BuildingData[]; tileSize: number; offset: number }> = ({ buildings, tileSize: T, offset }) => {
  const gridSize = Math.round((offset * 2) / T);
  const all = useMemo(() => industrialGantries(buildings, gridSize), [buildings, gridSize]);
  const fallen = buildings.filter(b => b.destroyed && b.type === 'industrial' && b.footprint).map(b => `${b.footprint!.x},${b.footprint!.z}`).sort().join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const gantries = useMemo(() => { const f = new Set(fallen.split('|')); return all.filter(g => !f.has(g.ends[0]) && !f.has(g.ends[1])); }, [all, fallen]);
  const trusses = useMemo(() => gantries.filter(g => g.truss), [gantries]);
  const chords = useRef<THREE.InstancedMesh>(null);
  const braces = useRef<THREE.InstancedMesh>(null);
  const greyPipes = useRef<THREE.InstancedMesh>(null);
  const redPipes = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const place = (g: Gantry, along: number, up: number, across: number, y: number, side: number, rotAlong = 0) => {
      o.position.set(g.x * T - offset + (g.alongX ? 0 : side * T), g.y + y, g.z * T - offset + (g.alongX ? side * T : 0));
      o.rotation.set(0, g.alongX ? 0 : Math.PI / 2, rotAlong);
      o.scale.set(along, up, across);
      o.updateMatrix();
      return o.matrix;
    };
    // Truss: top and bottom chords on both sides, and diagonal braces between them.
    if (chords.current) {
      let i = 0;
      for (const g of trusses) for (const side of [-0.2, 0.2]) for (const y of [1.1, -1.1]) chords.current.setMatrixAt(i++, place(g, 1.6 * T, 0.3, 0.3, y, side));
      chords.current.instanceMatrix.needsUpdate = true;
    }
    if (braces.current) {
      let i = 0;
      const len = Math.hypot(2.2, 0.4 * T), tilt = Math.atan2(2.2, 0.4 * T);
      for (const g of trusses) for (const side of [-0.2, 0.2]) for (let k = -1; k <= 1; k++) {
        o.position.set(0, 0, 0);
        braces.current.setMatrixAt(i++, place(g, len, 0.2, 0.2, 0, side, k % 2 ? tilt : -tilt));
        // Shift each brace along the truss.
        const m = new THREE.Matrix4().makeTranslation(g.alongX ? k * 0.4 * T : 0, 0, g.alongX ? 0 : k * 0.4 * T);
        const cur = new THREE.Matrix4();
        braces.current.getMatrixAt(i - 1, cur);
        braces.current.setMatrixAt(i - 1, m.multiply(cur));
      }
      braces.current.instanceMatrix.needsUpdate = true;
    }
    // Pipes: on every gantry, a grey and a red one side by side.
    for (const [ref, side] of [[greyPipes, -0.06], [redPipes, 0.07]] as const) {
      if (!ref.current) continue;
      gantries.forEach((g, i) => {
        o.position.set(g.x * T - offset + (g.alongX ? 0 : side * T), g.y + (g.truss ? 0.2 : 0), g.z * T - offset + (g.alongX ? side * T : 0));
        o.rotation.set(g.alongX ? 0 : Math.PI / 2, 0, g.alongX ? Math.PI / 2 : 0);
        o.scale.set(1, (g.truss ? 1.7 : 1.5) * T, 1);
        o.updateMatrix();
        ref.current!.setMatrixAt(i, o.matrix);
      });
      ref.current.instanceMatrix.needsUpdate = true;
    }
  });
  if (gantries.length === 0) return null;
  const n = gantries.length, t = trusses.length;
  return (
    <group>
      {t > 0 && (
        <>
          <instancedMesh key={`c-${t}`} ref={chords} args={[undefined, undefined, t * 4]} raycast={noRaycast} castShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#b91c1c" metalness={0.5} roughness={0.5} emissive="#2a0505" />
          </instancedMesh>
          <instancedMesh key={`b-${t}`} ref={braces} args={[undefined, undefined, t * 6]} raycast={noRaycast}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#b91c1c" metalness={0.5} roughness={0.5} emissive="#2a0505" />
          </instancedMesh>
        </>
      )}
      <instancedMesh key={`g-${n}`} ref={greyPipes} args={[undefined, undefined, n]} raycast={noRaycast} castShadow>
        <cylinderGeometry args={[0.55, 0.55, 1, 8]} />
        <meshStandardMaterial color="#9ca3a8" metalness={0.7} roughness={0.35} />
      </instancedMesh>
      <instancedMesh key={`r-${n}`} ref={redPipes} args={[undefined, undefined, n]} raycast={noRaycast}>
        <cylinderGeometry args={[0.4, 0.4, 1, 8]} />
        <meshStandardMaterial color="#c2410c" metalness={0.5} roughness={0.5} />
      </instancedMesh>
    </group>
  );
};

export default React.memo(IndustrialGantries);
