// A square lattice tower, for masts, gantry legs and plant frames on base structures.

import React from 'react';
import * as THREE from 'three';
import { kitMaterial } from './materials';
import { Plate } from './shapes';

// A square lattice tower: corner posts, rings, and crossed braces on its faces.
export const Lattice: React.FC<{ w: number; h: number; position: [number, number, number]; material?: THREE.Material }> = ({ w, h, position, material }) => {
  const grey = material ?? kitMaterial('structGrey');
  const rings = Math.max(2, Math.round(h / 1.3));
  const step = h / rings, diag = Math.hypot(w, step), lean = Math.atan2(step, w);
  return (
    <group position={position}>
      {[-1, 1].flatMap(sx => [-1, 1].map(sz => <Plate key={`${sx}${sz}`} size={[0.14, h, 0.14]} material={grey} position={[sx * w / 2, h / 2, sz * w / 2]} />))}
      {Array.from({ length: rings + 1 }, (_, k) => k * step).map(y => (
        <group key={y} position={[0, y, 0]}>
          {[-1, 1].map(s => <Plate key={`a${s}`} size={[w, 0.08, 0.08]} material={grey} position={[0, 0, s * w / 2]} />)}
          {[-1, 1].map(s => <Plate key={`b${s}`} size={[0.08, 0.08, w]} material={grey} position={[s * w / 2, 0, 0]} />)}
        </group>
      ))}
      {Array.from({ length: rings }, (_, k) => (k + 0.5) * step).flatMap(y => [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(r => (
        <group key={`${y}${r}`} rotation={[0, r, 0]}>
          <Plate size={[diag, 0.06, 0.06]} material={grey} position={[0, y, w / 2]} rotation={[0, 0, (Math.round(y / step) % 2 ? 1 : -1) * lean]} />
        </group>
      )))}
    </group>
  );
};
