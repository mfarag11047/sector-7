// The unit kit's parts: armour plates, extruded armour with angled faces, tapering hulls, turned
// parts (barrels, wheels, exhausts), light strips and a soft contact shadow. With the kit's
// flat-shaded materials (materials.ts), the shapes themselves carry the detail. Edges are sharp
// unless a part asks for a rounded edge (`radius`) or a bevel: armour plate meets at hard corners.
//
// Every part's geometry is cached by its dimensions and shared between units.

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

interface Placed { position?: V3; rotation?: V3; material: THREE.Material; shadow?: boolean }

// A box, the basic armour plate: sharp-edged, or with its edges rounded by `radius`.
export const Plate: React.FC<Placed & { size: V3; radius?: number }> = ({ size, radius = 0, material, position, rotation, shadow = true }) => {
  const r = Math.min(radius, Math.min(...size) / 2 - 1e-4);
  const geometry = cachedGeometry(`plate:${size.join(',')}:${r}`, () => r > 0 ? new RoundedBoxGeometry(size[0], size[1], size[2], 2, r) : new THREE.BoxGeometry(...size));
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={shadow} receiveShadow />;
};

// A 2D outline extruded into a slab, for armour with angled faces: sharp-edged, or bevelled by `bevel`.
// axis 'x': the outline is a side view, [forward (z), up (y)] points, extruded across the width.
// axis 'y': the outline is a top view, [right (x), forward (z)] points, extruded upward from 0.
export const Prism: React.FC<Placed & { outline: [number, number][]; depth: number; axis: 'x' | 'y'; bevel?: number }> = ({ outline, depth, axis, bevel = 0, material, position, rotation, shadow = true }) => {
  const geometry = cachedGeometry(`prism:${axis}:${depth}:${bevel}:${outline.flat().join(',')}`, () => {
    const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, axis === 'y' ? -v : v)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 4 });
    if (axis === 'x') { g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); }
    else { g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0); }
    return g;
  });
  return <mesh geometry={geometry} material={material} position={position} rotation={rotation} castShadow={shadow} receiveShadow />;
};

// A solid tapering from one outline to another: `bottom` at y = 0 and `top` at y = `height`, both
// top views ([right, forward] points, convex, the same number of points, in the same order). Each
// pair of edges is joined by a flat face, so a wide top can slope in to a narrow keel.
export const Loft: React.FC<Placed & { top: [number, number][]; bottom: [number, number][]; height: number }> = ({ top, bottom, height, material, position, rotation, shadow = true }) => {
  const geometry = cachedGeometry(`loft:${height}:${top.flat().join(',')}:${bottom.flat().join(',')}`, () => {
    const T = top.map(([x, z]) => new THREE.Vector3(x, height, z)), B = bottom.map(([x, z]) => new THREE.Vector3(x, 0, z));
    const centre = [...T, ...B].reduce((c, p) => c.add(p), new THREE.Vector3()).multiplyScalar(1 / (T.length + B.length));
    const tris: THREE.Vector3[][] = [];
    for (let i = 0; i < T.length; i++) {
      const j = (i + 1) % T.length;
      tris.push([T[i], T[j], B[j]], [T[i], B[j], B[i]]);
    }
    for (let i = 1; i < T.length - 1; i++) tris.push([T[0], T[i], T[i + 1]], [B[0], B[i], B[i + 1]]);
    const pos: number[] = [], n = new THREE.Vector3(), mid = new THREE.Vector3();
    for (const [a, b, c] of tris) {
      // Wound to face outward from the solid's centre.
      n.crossVectors(b.clone().sub(a), c.clone().sub(a));
      mid.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(centre);
      const [p, q, r] = n.dot(mid) < 0 ? [a, c, b] : [a, b, c];
      pos.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
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
