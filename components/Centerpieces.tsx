// The district centerpieces' own pieces (sim/centerpieces.ts, centerpieceLooks.ts), placed by
// FootprintBuilding.tsx on the faces and tiles that carry them. Everything else about them (the
// massing, the cladding ground to roof, the tower) is the kit every city building uses.
//
//   numberMaterial  the megablock's number, lit huge near the top of each face
//   Entrance        the megablock's front door in the middle of each face: a tall dark portal
//                   in the crimson panels under a heavy canopy, a light strip beneath it, the
//                   number again over it, small, so it reads at the door as it does from afar
//   Pylons          the lifted block's concrete legs under its overhang, braced
//   LoadingDoors    blue roller doors in the lifted block's core at street level, a lamp over each
//   Stripes         the lifted block's blue stripes painted round it every few storeys

import React from 'react';
import * as THREE from 'three';
import { canvas } from './corpoFacades';
import { SCENE } from './scenePalette';
import type { Rect } from './eras';

const numberMats = new Map<string, THREE.MeshBasicMaterial>();
// Pale pink-white numerals with a crimson glow round them, on nothing.
export const numberMaterial = (text: string) => {
  let m = numberMats.get(text);
  if (!m) {
    const tex = canvas(256, g => {
      g.clearRect(0, 0, 256, 256);
      g.font = 'bold 190px monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = SCENE.red; g.shadowBlur = 24;
      g.fillStyle = '#ffd9e6';
      g.fillText(text, 128, 136);
    }, 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    numberMats.set(text, m);
  }
  return m;
};

const std = (color: string, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
const M = {
  portal: new THREE.MeshStandardMaterial({ color: '#08090d', metalness: 0.8, roughness: 0.3, emissive: '#2a0c14', emissiveIntensity: 0.8 }),
  strip: new THREE.MeshBasicMaterial({ color: SCENE.red, toneMapped: false }),
  lamp: new THREE.MeshBasicMaterial({ color: '#ffb070', toneMapped: false }),
  concrete: std('#9a968d', 0.05, 0.9),
  door: std('#2f55b8', 0.5, 0.5),
};
const canopyMats = new Map<string, THREE.MeshStandardMaterial>();
const canopyMaterial = (color: string) => { let m = canopyMats.get(color); if (!m) { m = std(color, 0.4, 0.6); canopyMats.set(color, m); } return m; };

// In a face's own coordinates: centred on x = 0, the wall at z = 0, +z out to the street.
export const Entrance: React.FC<{ number: string; panel: string }> = ({ number, panel }) => (
  <group>
    <mesh position={[0, 3.2, 0.25]} material={M.portal}><boxGeometry args={[5.5, 6.4, 0.5]} /></mesh>
    {/* Panel pylons either side, the canopy over the door, its light strip, the number. */}
    {[-1, 1].map(s => <mesh key={s} position={[s * 3.6, 4, 0.6]} material={canopyMaterial(panel)} castShadow><boxGeometry args={[1.2, 8, 1.2]} /></mesh>)}
    <mesh position={[0, 7.1, 1.6]} rotation={[0.08, 0, 0]} material={canopyMaterial(panel)} castShadow><boxGeometry args={[9.5, 0.7, 3.4]} /></mesh>
    <mesh position={[0, 6.7, 3.25]} material={M.strip}><boxGeometry args={[8.6, 0.1, 0.16]} /></mesh>
    <mesh position={[0, 9.6, 0.5]} material={numberMaterial(number)}><planeGeometry args={[3.6, 3.6]} /></mesh>
  </group>
);

// Under a block lifted over its core: a pylon halfway along each outside edge of the tile `r`,
// from the ground to the overhang at `top`, with a brace to the core.
export const Pylons: React.FC<{ r: Rect; outside: Record<'west' | 'east' | 'north' | 'south', boolean>; top: number; core: number }> = ({ r, outside, top, core }) => {
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  const legs: { at: [number, number]; brace: number }[] = [];
  // `brace`: the turn that points the strut (along +x) in toward the core.
  if (outside.north) legs.push({ at: [cx, r.z0 + 0.8], brace: -Math.PI / 2 });
  if (outside.south) legs.push({ at: [cx, r.z1 - 0.8], brace: Math.PI / 2 });
  if (outside.west) legs.push({ at: [r.x0 + 0.8, cz], brace: 0 });
  if (outside.east) legs.push({ at: [r.x1 - 0.8, cz], brace: Math.PI });
  return (
    <group>
      {legs.map(({ at: [x, z], brace }, i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, top / 2, 0]} material={M.concrete} castShadow><boxGeometry args={[1.6, top, 1.6]} /></mesh>
          {/* A raking strut up from the core to the pylon's head. */}
          <group rotation={[0, brace, 0]}>
            <mesh position={[core / 2, top * 0.72, 0]} rotation={[0, 0, -Math.atan2(top * 0.5, core)]} material={M.concrete}>
              <boxGeometry args={[Math.hypot(core, top * 0.5), 0.6, 0.6]} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
};

// Two blue roller doors and a lamp over each, in a face's own coordinates.
export const LoadingDoors: React.FC<{ width: number }> = ({ width }) => (
  <group>
    {[-0.24, 0.24].map(k => (
      <group key={k} position={[k * width, 0, 0]}>
        <mesh position={[0, 2.2, 0.15]} material={M.door}><boxGeometry args={[Math.min(3.6, width * 0.4), 4.4, 0.2]} /></mesh>
        <mesh position={[0, 4.9, 0.35]} material={M.lamp}><boxGeometry args={[0.6, 0.25, 0.3]} /></mesh>
      </group>
    ))}
  </group>
);

const stripeMats = new Map<string, THREE.MeshStandardMaterial>();
// Stripes painted round a face every `every` world units between `bottom` and `top` (in the face's
// own coordinates, y from the ground).
export const Stripes: React.FC<{ width: number; bottom: number; top: number; every: number; color: string }> = ({ width, bottom, top, every, color }) => {
  let m = stripeMats.get(color);
  if (!m) { m = std(color, 0.3, 0.6); stripeMats.set(color, m); }
  const ys: number[] = [];
  for (let y = Math.ceil((bottom + 1) / every) * every; y < top - 1; y += every) ys.push(y);
  return <group>{ys.map(y => <mesh key={y} position={[0, y, 0.14]} material={m}><boxGeometry args={[width + 0.1, 0.7, 0.12]} /></mesh>)}</group>;
};
