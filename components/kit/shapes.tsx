// The unit kit's parts: bevelled plates, extruded armour with angled faces, turned parts (barrels,
// wheels, exhausts), light strips and a soft contact shadow. Built from these, a unit reads as
// solid, panelled armour rather than bare boxes.
//
// Every part's geometry is cached by its dimensions and shared between units, and is mapped so
// each face shows the armour detail texture once (textures.ts): every face is one panel.

import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { contactShadowMap } from './textures';

type V3 = [number, number, number];

const geometries = new Map<string, THREE.BufferGeometry>();
const cachedGeometry = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geometries.get(key);
  if (!g) { g = make(); geometries.set(key, g); }
  return g;
};

// Gives each triangle UVs from the two axes its face is most square to, spread over the part's
// bounding box: every face of the part shows the texture once.
function projectFaceUVs(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source;
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const size = max.clone().sub(min).max(new THREE.Vector3(1e-6, 1e-6, 1e-6));
  const pos = g.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = [a, b, c][k];
      const u = ax >= ay && ax >= az ? (p.z - min.z) / size.z : (p.x - min.x) / size.x;
      const v = ay >= ax && ay >= az ? (p.z - min.z) / size.z : (p.y - min.y) / size.y;
      uv[(i + k) * 2] = u; uv[(i + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

interface Placed { position?: V3; rotation?: V3; material: THREE.Material; shadow?: boolean }

// A box with rounded edges: the basic armour plate.
export const Plate: React.FC<Placed & { size: V3; radius?: number }> = ({ size, radius = 0.03, material, position, rotation, shadow = true }) => {
  const r = Math.min(radius, Math.min(...size) / 2 - 1e-4);
  const geometry = cachedGeometry(`plate:${size.join(',')}:${r}`, () => projectFaceUVs(new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.max(r, 0.001))));
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={shadow} receiveShadow />;
};

// A 2D outline extruded into a slab with bevelled edges, for armour with angled faces.
// axis 'x': the outline is a side view, [forward (z), up (y)] points, extruded across the width.
// axis 'y': the outline is a top view, [right (x), forward (z)] points, extruded upward from 0.
export const Prism: React.FC<Placed & { outline: [number, number][]; depth: number; axis: 'x' | 'y'; bevel?: number }> = ({ outline, depth, axis, bevel = 0.025, material, position, rotation, shadow = true }) => {
  const geometry = cachedGeometry(`prism:${axis}:${depth}:${bevel}:${outline.flat().join(',')}`, () => {
    const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, axis === 'y' ? -v : v)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
    if (axis === 'x') { g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); }
    else { g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0); }
    return projectFaceUVs(g);
  });
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={shadow} receiveShadow />;
};

// A part turned on a lathe, pointing along +Z: `profile` is [radius, distance along] points.
export const Turned: React.FC<Placed & { profile: [number, number][]; segments?: number }> = ({ profile, segments = 12, material, position, rotation, shadow = true }) => {
  const geometry = cachedGeometry(`turned:${segments}:${profile.flat().join(',')}`, () => {
    const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
    g.rotateX(Math.PI / 2);
    return g;
  });
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={shadow} />;
};

// A wheel or disc of `radius` and `width`, its axle along X.
export const Wheel: React.FC<Placed & { radius: number; width: number; segments?: number }> = ({ radius, width, segments = 14, material, position, rotation, shadow = true }) => {
  const geometry = cachedGeometry(`wheel:${radius}:${width}:${segments}`, () => {
    const g = new THREE.CylinderGeometry(radius, radius, width, segments);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={shadow} />;
};

// A thin strip of light.
export const Strip: React.FC<Placed & { size: V3 }> = ({ size, material, position, rotation }) => {
  const geometry = cachedGeometry(`strip:${size.join(',')}`, () => new THREE.BoxGeometry(...size));
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} raycast={() => null} />;
};

let shadowMaterial: THREE.MeshBasicMaterial | null = null;
// A soft shadow where the unit meets the ground, `size` [width, length].
export const ContactShadow: React.FC<{ size: [number, number]; y?: number }> = ({ size, y = 0.02 }) => {
  shadowMaterial ??= new THREE.MeshBasicMaterial({ map: contactShadowMap(), transparent: true, depthWrite: false, toneMapped: false });
  const geometry = cachedGeometry('shadow', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  return <mesh geometry={geometry} material={shadowMaterial} position={[0, y, 0]} scale={[size[0], 1, size[1]]} raycast={() => null} renderOrder={-1} />;
};
