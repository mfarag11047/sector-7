// Roof retrofits (eras.ts): what was bolted onto a building's roof since it went up, in the era it
// was added. Each is built from a handful of boxes and cylinders, merged into one mesh per
// material, so a roof costs a few draw calls whatever stands on it.
//
//   watertank  (1)  a rusty tank on four legs with a ladder up its side
//   hvac       (1)  two boxy air handlers, a duct run from them across the roof and down the wall
//   roofsign   (2)  a big rounded sign on a frame, lit round its edge in pastel neon
//   dome       (2)  a bubble skylight on a round kerb, glowing from inside
//   coolers    (3)  a server cooling rig: a dark platform of fan units glowing blue, a pipe
//                   bundle running off it
//   sentry     (3)  a mast with a chamfered camera housing, a red light and a small dish
//   pavilion   (4)  a round glass pavilion with champagne trim, a few dark trees round it
//   pool       (4)  a rooftop pool, lit from inside, on a travertine deck with two loungers and a
//                   parasol
//   shanty          not an era's: where people live in the ruins (decayPlan.ts), shipping containers
//                   stacked into homes, a lit window, a tarp between them and a ladder up
//
// The colours keep to the scenery palette (scenePalette.ts): no cyan, amber, white or green.

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SCENE } from './scenePalette';
import type { Retrofit } from './eras';

const std = (color: string, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const glow = (color: string) => new THREE.MeshBasicMaterial({ color, toneMapped: false });

const M = {
  rust: std('#6b3a26', 0.5, 0.7),
  concrete: std('#55575a', 0.1, 0.9),
  steel: std('#3a3f45', 0.7, 0.45),
  duct: std('#7c8186', 0.8, 0.35),
  dark: std('#15171c', 0.6, 0.5),
  frame: std('#2b2d33', 0.6, 0.5),
  glass: std('#1c2440', 0.9, 0.12, { emissive: '#2a1a40', emissiveIntensity: 0.6 }),
  dome: std('#3a2450', 0.6, 0.15, { emissive: '#7a2a8a', emissiveIntensity: 0.7, transparent: true, opacity: 0.85 }),
  champagne: std('#a8966a', 0.9, 0.3),
  leaves: std('#2c3528', 0, 0.95),
  sign: std('#1a1420', 0.3, 0.6, { emissive: '#2a0f2a', emissiveIntensity: 0.6 }),
  boxRust: std('#7a3626', 0.5, 0.65),
  boxBlue: std('#3d5670', 0.5, 0.65),
  boxOrange: std('#8a5a2a', 0.5, 0.65),
  boxGrey: std('#5a5d60', 0.5, 0.65),
  tarp: std('#3f5a78', 0, 0.9, { side: THREE.DoubleSide }),
  window: glow('#ffb070'),
  deck: std('#a89e8a', 0.1, 0.6),
  water: std('#1c3a6e', 0.3, 0.05, { emissive: '#1d3f86', emissiveIntensity: 0.35 }),
  canvas: std('#d9cfc0', 0, 0.9, { side: THREE.DoubleSide }),
  fan: glow(SCENE.blue),
  red: glow('#ff003c'),
  pink: glow(SCENE.hotPink),
  lilac: glow(SCENE.magenta),
  coral: glow(SCENE.coral),
};
type Mat = keyof typeof M;

// Pieces are added in the roof's own coordinates (y up from the roof), then merged by material.
class Kit {
  parts = new Map<Mat, THREE.BufferGeometry[]>();
  add(mat: Mat, g: THREE.BufferGeometry, at: [number, number, number], rot: [number, number, number] = [0, 0, 0], scale?: [number, number, number]) {
    if (scale) g.scale(...scale);
    g.rotateX(rot[0]); g.rotateZ(rot[2]); g.rotateY(rot[1]);
    g.translate(...at);
    const geo = g.index ? g.toNonIndexed() : g;
    if (geo !== g) g.dispose();
    // Keep only what every piece has, so they merge.
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    this.parts.set(mat, [...(this.parts.get(mat) ?? []), geo]);
  }
  box(mat: Mat, size: [number, number, number], at: [number, number, number], rot?: [number, number, number]) { this.add(mat, new THREE.BoxGeometry(...size), at, rot); }
  cyl(mat: Mat, r0: number, r1: number, h: number, at: [number, number, number], seg = 12, rot?: [number, number, number]) { this.add(mat, new THREE.CylinderGeometry(r0, r1, h, seg), at, rot); }
  build() {
    return [...this.parts].map(([mat, list]) => {
      const g = mergeGeometries(list)!;
      list.forEach(x => x.dispose());
      return { mat: M[mat], geometry: g };
    });
  }
}

// Build a retrofit for a roof `span` across (its narrow side), the sign facing +z when `faceZ`
// is 1, -z when -1. `seed` in [0, 1) varies the details.
export type RoofPiece = Retrofit | 'shanty';
export function buildRetrofit(kind: RoofPiece, span: number, faceZ: 1 | -1, seed: number) {
  const k = new Kit();
  const s = span;
  switch (kind) {
    case 'watertank': {
      const r = s * 0.15, x = -s * 0.18, z = s * 0.12;
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.box('steel', [0.25, 2.4, 0.25], [x + lx * r * 0.7, 1.2, z + lz * r * 0.7]);
      k.box('steel', [r * 1.9, 0.18, r * 1.9], [x, 2.4, z]);
      k.cyl('rust', r, r, 3.4, [x, 4.2, z], 14);
      k.add('rust', new THREE.ConeGeometry(r * 1.06, 1, 14), [x, 6.4, z]);
      // A ladder up the side facing out.
      k.box('steel', [0.08, 5.6, 0.08], [x + r + 0.1, 3, z - 0.3]);
      k.box('steel', [0.08, 5.6, 0.08], [x + r + 0.1, 3, z + 0.3]);
      for (let y = 0.6; y < 5.6; y += 0.7) k.box('steel', [0.06, 0.06, 0.6], [x + r + 0.1, y, z]);
      break;
    }
    case 'hvac': {
      for (const [x, z] of [[-s * 0.2, -s * 0.12], [s * 0.12, -s * 0.12]]) {
        k.box('duct', [s * 0.26, 1.6, s * 0.22], [x, 0.8, z]);
        k.cyl('dark', s * 0.07, s * 0.07, 0.12, [x, 1.66, z], 12);
      }
      // The duct: off the units, across the roof and down over the edge of the wall.
      k.box('duct', [1, 0.9, s * 0.5], [-s * 0.04, 0.45, s * 0.16]);
      k.box('duct', [1, 0.9, 1], [-s * 0.04, 0.45, s * 0.45]);
      k.box('duct', [1, 5, 0.9], [-s * 0.04, -2, s * 0.5 + 0.5]);
      for (const y of [-1, -3.5]) k.box('steel', [1.25, 0.15, 1.15], [-s * 0.04, y, s * 0.5 + 0.5]);
      break;
    }
    case 'roofsign': {
      // Rounded at both ends, standing on two legs, lit round its edge.
      const len = s * 0.45, r = s * 0.13, z = -faceZ * s * 0.1, y = 3.2;
      for (const x of [-len * 0.35, len * 0.35]) k.box('frame', [0.3, y, 0.3], [x, y / 2, z]);
      k.box('frame', [len * 0.9, 0.25, 0.4], [0, y * 0.55, z - faceZ * 0.2]);
      // Flat panels, a sign board and the neon rim just behind it, so from above it's a thin line.
      k.add('lilac', new THREE.CapsuleGeometry(r + 0.25, len, 6, 14), [0, y + r, z], [0, 0, Math.PI / 2], [1, 1, 0.2 / (r + 0.25)]);
      k.add('sign', new THREE.CapsuleGeometry(r, len, 6, 14), [0, y + r, z + faceZ * 0.12], [0, 0, Math.PI / 2], [1, 1, 0.25 / r]);
      // Letters: a row of bright bars across the sign's face.
      const n = 3 + Math.floor(seed * 3);
      for (let i = 0; i < n; i++) k.box(i % 2 ? 'coral' : 'pink', [len / (n * 1.6), r * 0.9, 0.1], [(i - (n - 1) / 2) * (len / n), y + r, z + faceZ * 0.45]);
      break;
    }
    case 'dome': {
      const r = s * 0.2;
      k.cyl('concrete', r * 1.12, r * 1.18, 0.6, [0, 0.3, 0], 20);
      k.add('dome', new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.6, 0]);
      for (let i = 0; i < 4; i++) k.box('frame', [0.12, 0.12, r * 2], [0, 0.6 + r * 0.55, 0], [0, (i * Math.PI) / 4, 0]);
      k.add('pink', new THREE.TorusGeometry(r * 1.12, 0.1, 6, 24), [0, 0.62, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    case 'coolers': {
      const w = s * 0.62, d = s * 0.42;
      k.box('dark', [w, 0.9, d], [0, 0.45, 0]);
      k.box('frame', [w + 0.3, 0.2, d + 0.3], [0, 0.95, 0]);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const x = (i - 1) * (w / 3), z = (j - 0.5) * (d / 2);
        k.cyl('steel', w / 7.5, w / 7.5, 0.7, [x, 1.4, z], 14);
        k.cyl('fan', w / 9, w / 9, 0.06, [x, 1.78, z], 14);
        k.box('dark', [w / 4.6, 0.08, 0.14], [x, 1.83, z], [0, seed * 3 + i + j, 0]);
      }
      // The coolant pipes: off the rig, over the roof edge.
      for (const dz of [-0.35, 0.35]) k.cyl('duct', 0.22, 0.22, s * 0.3, [w / 2 + s * 0.15, 0.5, dz], 8, [0, 0, Math.PI / 2]);
      break;
    }
    case 'sentry': {
      const x = s * 0.22, z = -s * 0.2, h = 6 + seed * 3;
      k.box('steel', [1.4, 0.5, 1.4], [x, 0.25, z]);
      k.cyl('steel', 0.18, 0.28, h, [x, h / 2, z], 6);
      // The housing: a box with its corners cut off, the corporate way.
      k.cyl('dark', 0.9, 0.9, 1.1, [x, h, z], 8, [0, Math.PI / 8, 0]);
      k.box('dark', [0.5, 0.5, 1.4], [x, h - 0.2, z + faceZ * 0.9]);
      k.add('red', new THREE.SphereGeometry(0.26, 8, 6), [x, h + 0.8, z]);
      k.add('steel', new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 3), [x - 0.5, h * 0.6, z], [-0.9, 0.6, 0]);
      // A cable down to a junction box on the roof.
      k.box('frame', [0.9, 1.2, 0.7], [x - 1.4, 0.6, z + 0.8]);
      break;
    }
    case 'shanty': {
      // Containers 6 long, 2.5 wide and 2.6 high: two side by side, one or two on top, turned.
      const boxes: Mat[] = ['boxRust', 'boxBlue', 'boxOrange', 'boxGrey'];
      const L = Math.min(6, s * 0.55), W = 2.5, Hc = 2.6;
      const spots: [number, number, number, number][] = [[-W * 0.6, Hc / 2, -s * 0.05, 0], [W * 0.6, Hc / 2, s * 0.02, 0], [0, Hc * 1.5, 0, Math.PI / 2 + (seed - 0.5) * 0.4]];
      if (seed > 0.5) spots.push([-W * 0.6, Hc * 2.5, -s * 0.05, 0.1]);
      spots.forEach(([x, y, z, turn], i) => {
        const mat = boxes[(Math.floor(seed * 7) + i) % boxes.length];
        k.box(mat, [W, Hc, L], [x, y, z], [0, turn, 0]);
        // The ribs down its sides, and a lit window cut in it.
        for (let r = -2; r <= 2; r++) k.box(mat, [W + 0.12, Hc * 0.9, 0.12], [x, y, z + (r * L) / 5.5], [0, turn, 0]);
        if (i !== 1) k.box('window', [0.06, 0.7, 1.1], [x + Math.cos(turn) * (W / 2 + 0.04), y + 0.2, z - Math.sin(turn) * (W / 2 + 0.04)], [0, turn, 0]);
      });
      // A tarp stretched from the stack to a pole, and a ladder up the side.
      k.add('tarp', new THREE.PlaneGeometry(3.4, 3), [W * 1.6 + 1, Hc + 0.4, s * 0.1], [-Math.PI / 2 + 0.25, 0, 0]);
      k.box('steel', [0.1, Hc + 0.4, 0.1], [W * 1.6 + 2.6, (Hc + 0.4) / 2, s * 0.1 + 1.3]);
      for (const dz of [-0.3, 0.3]) k.box('steel', [0.08, Hc * 2, 0.08], [-W * 1.1 - 0.1, Hc, -s * 0.05 + dz]);
      for (let y = 0.4; y < Hc * 2; y += 0.6) k.box('steel', [0.06, 0.06, 0.6], [-W * 1.1 - 0.1, y, -s * 0.05]);
      break;
    }
    case 'pool': {
      const w = s * 0.62, d = s * 0.4, z = -s * 0.08;
      k.box('deck', [w + 2.4, 0.5, d + 2.4], [0, 0.25, z]);
      k.box('water', [w, 0.1, d], [0, 0.52, z]);
      // Loungers along the deck, and a parasol over them.
      for (const x of [-w * 0.2, w * 0.2]) {
        k.box('frame', [0.8, 0.25, 2], [x, 0.65, z + d / 2 + 1.3]);
        k.box('frame', [0.8, 0.6, 0.15], [x, 0.85, z + d / 2 + 2.25], [-0.5, 0, 0]);
      }
      k.cyl('frame', 0.06, 0.06, 2.6, [w * 0.45, 1.8, z + d / 2 + 1.4], 5);
      k.add('canvas', new THREE.ConeGeometry(1.5, 0.6, 8, 1, true), [w * 0.45, 3.1, z + d / 2 + 1.4]);
      break;
    }
    case 'pavilion': {
      const r = s * 0.24;
      k.cyl('frame', r * 1.25, r * 1.3, 0.4, [0, 0.2, 0], 24);
      k.cyl('glass', r, r, 2.8, [0, 1.8, 0], 24);
      k.cyl('frame', r * 1.12, r * 1.12, 0.3, [0, 3.35, 0], 24);
      for (const y of [0.42, 3.52]) k.add('champagne', new THREE.TorusGeometry(r * (y > 1 ? 1.12 : 1.27), 0.07, 6, 32), [0, y, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 3; i++) {
        const a = seed * 6 + i * 2.1, d = r * 1.75;
        const x = Math.cos(a) * d, z = Math.sin(a) * d;
        k.cyl('frame', 0.1, 0.14, 1.6, [x, 0.8, z], 5);
        k.add('leaves', new THREE.IcosahedronGeometry(0.9 + (i % 2) * 0.3, 0), [x, 2, z]);
      }
      break;
    }
  }
  return k.build();
}

// On a dead building (decayPlan.ts) nothing on the roof is lit or running, but for the windows of a
// shanty, where people live.
const unlit = std('#25272b', 0.5, 0.6);
export const RetrofitPiece: React.FC<{ kind: RoofPiece; span: number; faceZ: 1 | -1; seed: number; position: [number, number, number]; dead?: boolean }> = ({ kind, span, faceZ, seed, position, dead }) => {
  const parts = useMemo(() => buildRetrofit(kind, span, faceZ, seed), [kind, span, faceZ, seed]);
  useLayoutEffect(() => () => parts.forEach(p => p.geometry.dispose()), [parts]);
  const shown = (m: THREE.Material) => (dead && m instanceof THREE.MeshBasicMaterial && m !== M.window ? unlit : dead && (m === M.dome || m === M.glass || m === M.sign) ? unlit : m);
  return (
    <group position={position}>
      {parts.map((p, i) => <mesh key={i} geometry={p.geometry} material={shown(p.mat)} castShadow raycast={() => null} />)}
    </group>
  );
};
