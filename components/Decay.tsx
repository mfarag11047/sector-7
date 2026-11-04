// The city's decay (decayPlan.ts), drawn.
//
// On buildings (placed by FootprintBuilding.tsx):
//   buildFrame   the bare upper floors of a building stopped mid-build: concrete columns and
//                slabs, ragged at the top with rebar sticking out, scaffolding up one face with
//                a faded tarp hung on it
//   LeanTo       a shack of sheet metal against a ground floor, a tarp stretched out over the
//                pavement from it
//   grime        dark streaks run down the walls from the roof
// On the streets (DecayStreets, one instanced mesh each): puddles standing in the road, sand
// drifted into the gutters, weeds up through the pavement.
//
// Colours keep to the scenery palette's rules (scenePalette.ts): the tarps a faded denim blue and
// rust, the weeds a dull olive far from Tokugen's green.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RoadTileData } from '../types';
import { canvas } from './corpoFacades';
import { decayProps } from './decayPlan';
import type { Rect } from './eras';

// --- Merging pieces by material ---

type Piece = { g: THREE.BufferGeometry; at: [number, number, number]; rot?: [number, number, number] };
function merge(pieces: Piece[]): THREE.BufferGeometry | null {
  if (pieces.length === 0) return null;
  const list = pieces.map(({ g, at, rot }) => {
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

const std = (color: string, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
export const DECAY_MATERIALS = {
  concrete: std('#6a6964', 0.05, 0.95),
  rebar: std('#4a3226', 0.6, 0.6),
  scaffold: std('#5c6066', 0.8, 0.4),
  tarp: std('#3f5a78', 0, 0.9, { side: THREE.DoubleSide }),
  rustTarp: std('#7a4a2e', 0, 0.9, { side: THREE.DoubleSide }),
  sheets: ['#6b4a36', '#4f5559', '#5e3b30', '#3f4e5a'].map(c => std(c, 0.6, 0.6)),
};

// --- An unfinished building's bare frame ---

type Sides = { west: boolean; east: boolean; north: boolean; south: boolean };
const STOREY = 3.5;

// The frame over `r` (a tile's top, in its own coordinates) from the finished roof at y0 up to
// y1, its outside faces `outside`. `rand` in [0, 1) by salt varies it.
export function buildFrame(r: Rect, y0: number, y1: number, outside: Sides, rand: (salt: number) => number) {
  const concrete: Piece[] = [], rebar: Piece[] = [], scaffold: Piece[] = [], tarp: Piece[] = [];
  const storeys = Math.max(1, Math.round((y1 - y0) / STOREY));
  const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
  // Columns at the corners and halfway along each side, some a storey short of the top.
  const posts: [number, number][] = [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1], [cx, r.z0], [cx, r.z1], [r.x0, cz], [r.x1, cz]];
  posts.forEach(([x, z], i) => {
    const px = x + (x === r.x0 ? 0.4 : x === r.x1 ? -0.4 : 0), pz = z + (z === r.z0 ? 0.4 : z === r.z1 ? -0.4 : 0);
    const short = rand(10 + i) < 0.35 ? STOREY : 0;
    const hgt = Math.max(STOREY, y1 - y0 - short);
    concrete.push({ g: new THREE.BoxGeometry(0.7, hgt, 0.7), at: [px, y0 + hgt / 2, pz] });
    // Rebar out of the broken top.
    for (let k = 0; k < 3; k++) {
      rebar.push({ g: new THREE.BoxGeometry(0.07, 1.3, 0.07), at: [px + (k - 1) * 0.2, y0 + hgt + 0.6, pz + (rand(20 + i + k) - 0.5) * 0.4], rot: [0, rand(30 + k) * 3, (rand(40 + i + k) - 0.5) * 0.5] });
    }
  });
  // Floor slabs at every storey; the top one only half poured.
  for (let s = 1; s < storeys; s++) {
    const y = y0 + s * STOREY;
    const top = s === storeys - 1;
    const half = rand(50 + s) < 0.5;
    const x0 = top && half ? cx : r.x0, z1 = top && !half ? cz : r.z1;
    concrete.push({ g: new THREE.BoxGeometry(x0 === cx ? r.x1 - cx : r.x1 - r.x0, 0.35, z1 - r.z0), at: [(x0 + r.x1) / 2, y, (r.z0 + z1) / 2] });
  }
  // Scaffolding up one outside face, a tarp hung on part of it.
  const faces = (Object.keys(outside) as (keyof Sides)[]).filter(s => outside[s]);
  if (faces.length && rand(60) < 0.7) {
    const side = faces[Math.floor(rand(61) * faces.length)];
    const alongX = side === 'north' || side === 'south';
    const a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1;
    const off = side === 'north' ? r.z0 - 1.2 : side === 'south' ? r.z1 + 1.2 : side === 'west' ? r.x0 - 1.2 : r.x1 + 1.2;
    const at = (a: number, y: number): [number, number, number] => (alongX ? [a, y, off] : [off, y, a]);
    const top = y1 + 1;
    for (let a = a0; a <= a1 + 0.01; a += (a1 - a0) / 3) scaffold.push({ g: new THREE.BoxGeometry(0.12, top - y0, 0.12), at: at(a, (y0 + top) / 2) });
    for (let y = y0 + 1.75; y < top; y += STOREY / 2) scaffold.push({ g: new THREE.BoxGeometry(alongX ? a1 - a0 : 0.12, 0.1, alongX ? 0.12 : a1 - a0), at: at((a0 + a1) / 2, y) });
    const tw = (a1 - a0) * (0.4 + rand(62) * 0.4), th = Math.min(top - y0 - 1, STOREY * 2);
    const ta = a0 + rand(63) * (a1 - a0 - tw) + tw / 2;
    const p = at(ta, y0 + 1 + th / 2);
    const outward = side === 'north' || side === 'west' ? -0.15 : 0.15;
    tarp.push({ g: new THREE.PlaneGeometry(tw, th), at: alongX ? [p[0], p[1], p[2] + outward] : [p[0] + outward, p[1], p[2]], rot: [0.04, alongX ? 0 : Math.PI / 2, 0] });
  }
  return { concrete: merge(concrete), rebar: merge(rebar), scaffold: merge(scaffold), tarp: merge(tarp), rustTarp: rand(64) < 0.4 };
}

export const Frame: React.FC<{ r: Rect; y0: number; y1: number; outside: Sides; seed: number }> = ({ r, y0, y1, outside, seed }) => {
  const frame = useMemo(() => {
    const rand = (salt: number) => { const v = Math.sin(seed * 9301 + salt * 49.297) * 23421.631; return v - Math.floor(v); };
    return buildFrame(r, y0, y1, outside, rand);
  }, [r, y0, y1, outside, seed]);
  useLayoutEffect(() => () => { frame.concrete?.dispose(); frame.rebar?.dispose(); frame.scaffold?.dispose(); frame.tarp?.dispose(); }, [frame]);
  const M = DECAY_MATERIALS;
  return (
    <group>
      {frame.concrete && <mesh geometry={frame.concrete} material={M.concrete} castShadow receiveShadow />}
      {frame.rebar && <mesh geometry={frame.rebar} material={M.rebar} />}
      {frame.scaffold && <mesh geometry={frame.scaffold} material={M.scaffold} />}
      {frame.tarp && <mesh geometry={frame.tarp} material={frame.rustTarp ? M.rustTarp : M.tarp} castShadow />}
    </group>
  );
};

// --- A lean-to against a ground floor, in the face's own coordinates (+z out to the street) ---

export const LeanTo: React.FC<{ width: number; hash: number }> = ({ width, hash }) => {
  const w = Math.min(width * 0.45, 6), x = (hash - 0.5) * (width - w) * 0.9, d = 2.2, h = 2.6;
  const M = DECAY_MATERIALS;
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, h / 2, d / 2 + 0.1]} material={M.sheets[Math.floor(hash * 97) % M.sheets.length]} castShadow><boxGeometry args={[w, h, d]} /></mesh>
      {/* Its sheet roof, sloping down to the street. */}
      <mesh position={[0, h + 0.2, d / 2 + 0.2]} rotation={[0.18, 0, 0]} material={M.sheets[(Math.floor(hash * 97) + 1) % M.sheets.length]}><boxGeometry args={[w + 0.4, 0.08, d + 0.6]} /></mesh>
      {/* A tarp out over the pavement beside it. */}
      <mesh position={[w * 0.5 + 1.2, h + 0.3, 1.3]} rotation={[-Math.PI / 2 + 0.22, 0, 0]} material={hash < 0.5 ? M.tarp : M.rustTarp}><planeGeometry args={[2.4, 2.6]} /></mesh>
      {[0.1, 2.5].map(z => <mesh key={z} position={[w * 0.5 + 2.3, (h - 0.1) / 2, z]} material={M.scaffold}><boxGeometry args={[0.08, h - 0.1, 0.08]} /></mesh>)}
    </group>
  );
};

// --- Grime streaked down a wall ---

let grimeMat: THREE.MeshBasicMaterial | null = null;
export const grimeMaterial = () => grimeMat ??= new THREE.MeshBasicMaterial({
  color: '#000000', transparent: true, depthWrite: false, opacity: 0.75,
  alphaMap: canvas(128, (g, rnd) => {
    // The alpha map reads green: streaks darkest at the top, running down and fading.
    g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 26; i++) {
      const x = rnd() * 128, w = 2 + rnd() * 7, len = 30 + rnd() * 98;
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(0,${120 + Math.floor(rnd() * 135)},0,1)`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(x, 0, w, len);
    }
    // A dark band along the top where the water runs off the roof.
    const top = g.createLinearGradient(0, 0, 0, 14);
    top.addColorStop(0, 'rgba(0,200,0,1)'); top.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = top; g.fillRect(0, 0, 128, 14);
  }, 3131),
});
// How far the grime texture runs along a wall before it repeats.
export const GRIME_REPEAT = 10;

// --- On the streets ---

const sandTexture = () => canvas(128, (g, rnd) => {
  g.clearRect(0, 0, 128, 128);
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.25})`; g.fillRect(rnd() * 128, rnd() * 128, 2, 2); }
}, 2718);

// Standing water: dark blue-grey, soft at the edge, with the smeared reflections of the neon and
// the sky across it (drawn, not reflected: it reads as water from the camera's height).
const waterTexture = () => canvas(128, (g, rnd) => {
  g.clearRect(0, 0, 128, 128);
  const body = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  body.addColorStop(0, 'rgba(44,58,82,0.95)'); body.addColorStop(0.75, 'rgba(34,44,62,0.85)'); body.addColorStop(1, 'rgba(30,36,48,0)');
  g.fillStyle = body; g.fillRect(0, 0, 128, 128);
  // Reflections: soft streaks of sky blue-grey and a smear of pink neon.
  g.globalCompositeOperation = 'source-atop';
  for (const [color, y, h] of [['rgba(140,160,210,0.45)', 40, 10], ['rgba(255,110,200,0.3)', 70, 8], ['rgba(170,185,225,0.35)', 88, 5]] as [string, number, number][]) {
    const streak = g.createLinearGradient(0, y - h, 0, y + h);
    streak.addColorStop(0, 'rgba(0,0,0,0)'); streak.addColorStop(0.5, color); streak.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = streak; g.fillRect(10 + rnd() * 10, y - h, 100, h * 2);
  }
  g.globalCompositeOperation = 'source-over';
}, 1414);

// A weed clump: a few thin blades splayed out and a low tuft.
function weedGeometry() {
  const parts: Piece[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push({ g: new THREE.ConeGeometry(0.12, 1.2, 4), at: [Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
  }
  parts.push({ g: new THREE.IcosahedronGeometry(0.4, 0), at: [0, 0.2, 0] });
  return merge(parts)!;
}

const PUDDLE_Y = 0.215, DRIFT_Y = 0.21, PAVEMENT_Y = 0.5;

export const DecayStreets: React.FC<{ roadTiles: readonly RoadTileData[]; gridSize: number; tileSize: number; offset: number }> = ({ roadTiles, gridSize, tileSize: T, offset }) => {
  const props = useMemo(() => decayProps(roadTiles, gridSize), [roadTiles, gridSize]);
  const res = useMemo(() => ({
    puddle: new THREE.CircleGeometry(1, 20),
    drift: new THREE.PlaneGeometry(1, 1),
    weed: weedGeometry(),
    puddleMat: new THREE.MeshBasicMaterial({ map: waterTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    driftMat: std('#7a6a52', 0, 1, { transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, alphaMap: sandTexture() }),
    weedMat: std('#4a4d32', 0, 0.95),
  }), []);
  useLayoutEffect(() => () => { res.puddle.dispose(); res.drift.dispose(); res.weed.dispose(); res.puddleMat.dispose(); res.driftMat.dispose(); res.weedMat.dispose(); }, [res]);
  const puddles = useRef<THREE.InstancedMesh>(null), drifts = useRef<THREE.InstancedMesh>(null), weeds = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const place = (m: THREE.InstancedMesh | null, n: number, set: (i: number) => void) => {
      if (!m) return;
      for (let i = 0; i < n; i++) { set(i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); }
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    };
    place(puddles.current, props.puddles.length, i => {
      const p = props.puddles[i];
      o.position.set(p.x * T - offset, PUDDLE_Y, p.z * T - offset); o.rotation.set(-Math.PI / 2, 0, p.turn); o.scale.set(p.rx * T, p.rz * T, 1);
    });
    place(drifts.current, props.drifts.length, i => {
      const d = props.drifts[i];
      o.position.set(d.x * T - offset, DRIFT_Y, d.z * T - offset); o.rotation.set(-Math.PI / 2, 0, d.turn); o.scale.set(d.length * T, d.width * T, 1);
    });
    place(weeds.current, props.weeds.length, i => {
      const w = props.weeds[i];
      o.position.set(w.x * T - offset, PAVEMENT_Y, w.z * T - offset); o.rotation.set(0, w.x * 7 + w.z * 3, 0); o.scale.setScalar(w.size);
    });
  }, [props, T, offset]);
  return (
    <group>
      {props.drifts.length > 0 && <instancedMesh ref={drifts} args={[res.drift, res.driftMat, props.drifts.length]} receiveShadow raycast={() => null} />}
      {props.puddles.length > 0 && <instancedMesh ref={puddles} args={[res.puddle, res.puddleMat, props.puddles.length]} raycast={() => null} />}
      {props.weeds.length > 0 && <instancedMesh ref={weeds} args={[res.weed, res.weedMat, props.weeds.length]} castShadow raycast={() => null} />}
    </group>
  );
};
