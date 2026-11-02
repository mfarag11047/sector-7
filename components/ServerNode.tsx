// The server node as a compute cluster, kept minimal so it reads cleanly from above: a gunmetal
// block whose walls are tall cabinets of dark glass, one slow light line down each; a thin band in
// its holder's colour (cyan while nobody holds it) under a cooling deck, a solid slab across the
// roof with four fans spinning down in round wells cut into it, each round a ring of the same
// light; and a light line up each corner.
//
// The block's body carries the capture fill (Building.tsx's material); the fans are spun by
// Building.tsx through fansRef.

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { TEAM_COLORS } from '../constants';
import type { BuildingData } from '../types';

const time = { value: 0 };

// Server cabinets behind dark glass: four tall cabinets to a face, each with one slim light line
// down its middle that breathes slowly, a soft data pulse climbing it now and then. Kept quiet on
// purpose: no rows of LEDs, so the node reads as one clean machine from the game's camera.
const rackMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    void main() {
      float x = vUv.x * 4.0, cab = floor(x), f = fract(x);
      // Dark glass, a touch lighter low down (the cold aisle), with deep gaps between cabinets.
      vec3 c = vec3(0.035, 0.045, 0.065) + vec3(0.02, 0.04, 0.08) * (1.0 - vUv.y);
      float gap = step(f, 0.05) + step(0.95, f);
      // The cabinet's light line, breathing, and a pulse running up it.
      float line = smoothstep(0.035, 0.0, abs(f - 0.5));
      float breathe = 0.55 + 0.45 * sin(uTime * 0.8 + cab * 1.7);
      float pulse = smoothstep(0.92, 1.0, sin(vUv.y * 6.0 - uTime * 2.0 - cab * 1.3));
      c += line * vec3(0.15, 0.75, 1.0) * (0.5 * breathe + pulse * 1.2);
      c *= 1.0 - gap * 0.85;
      gl_FragColor = vec4(c, 1.0);
    }`,
  toneMapped: false,
});

const shellMaterial = new THREE.MeshStandardMaterial({ color: '#1f2530', metalness: 0.85, roughness: 0.35 });
const wellMaterial = new THREE.MeshStandardMaterial({ color: '#0a0d12', metalness: 0.5, roughness: 0.7 });
const bladeMaterial = new THREE.MeshStandardMaterial({ color: '#6c7686', metalness: 0.8, roughness: 0.35 });
const statusMaterials = new Map<string, THREE.MeshBasicMaterial>();
const glow = (color: string) => {
  let m = statusMaterials.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); statusMaterials.set(color, m); }
  return m;
};

// The cooling deck: one solid slab over the roof with four round wells cut through it, so the fans
// sit inside the machine rather than on top of it.
const DECK_H = 1.2;
function deckGeometry(size: number, wellR: number, at: number) {
  const half = size / 2;
  const shape = new THREE.Shape([new THREE.Vector2(-half, -half), new THREE.Vector2(half, -half), new THREE.Vector2(half, half), new THREE.Vector2(-half, half)]);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const hole = new THREE.Path();
    hole.absarc(x * at, z * at, wellR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: DECK_H, bevelEnabled: false, curveSegments: 20 });
  g.rotateX(-Math.PI / 2);
  return g;
}

const Clock: React.FC = () => { useFrame(({ clock }) => { time.value = clock.elapsedTime; }); return null; };

export const ServerNode: React.FC<{
  data: BuildingData;
  materialRef: React.Ref<THREE.MeshStandardMaterial>;
  onBeforeCompile: (shader: any) => void;
  hovered: boolean;
  edge: THREE.Color;
  fansRef: React.Ref<THREE.Group>;
}> = ({ data, materialRef, onBeforeCompile, hovered, edge, fansRef }) => {
  const [w, h] = data.scale;
  const accent = data.owner ? TEAM_COLORS[data.owner] : '#22d3ee';
  // The four rack faces, just proud of the body, below a solid parapet.
  const faces = useMemo(() => [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(r => ({
    r, x: Math.sin(r) * (w / 2 + 0.03), z: Math.cos(r) * (w / 2 + 0.03),
  })), [w]);
  const rackH = h * 0.8;
  const deck = w * 0.9, wellAt = deck * 0.24, wellR = deck * 0.19;
  const deckGeo = useMemo(() => deckGeometry(deck, wellR, wellAt), [deck, wellR, wellAt]);
  useEffect(() => () => deckGeo.dispose(), [deckGeo]);
  const wells = [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
  return (
    <group>
      <Clock />
      {/* The body: it carries the capture fill. */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, w]} />
        <meshStandardMaterial ref={materialRef} metalness={0.9} roughness={0.25} onBeforeCompile={onBeforeCompile} />
        <Edges threshold={15} color={hovered ? '#ffffff' : edge} />
      </mesh>
      {faces.map(f => (
        <group key={f.r} position={[f.x, 0, f.z]} rotation={[0, f.r, 0]}>
          <mesh position={[0, 0.5 + rackH / 2, 0]} material={rackMaterial}><planeGeometry args={[w * 0.86, rackH]} /></mesh>
          {/* A light line up the corner. */}
          <mesh position={[w * 0.5, h / 2, 0.02]} material={glow(accent)}><boxGeometry args={[0.18, h * 0.96, 0.18]} /></mesh>
        </group>
      ))}
      {/* A band in the holder's colour round the top of the walls. */}
      <mesh position={[0, h - 0.35, 0]} material={glow(accent)}><boxGeometry args={[w + 0.1, 0.22, w + 0.1]} /></mesh>

      {/* The cooling deck, the fans down in its wells. */}
      <group position={[0, h, 0]}>
        <mesh geometry={deckGeo} material={shellMaterial} castShadow receiveShadow />
        {wells.map(([x, z], i) => (
          <group key={i} position={[x * wellAt, 0, z * wellAt]}>
            <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={wellMaterial}><circleGeometry args={[wellR, 20]} /></mesh>
            <mesh position={[0, DECK_H + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glow(accent)}><ringGeometry args={[wellR, wellR + 0.18, 32]} /></mesh>
          </group>
        ))}
        <group ref={fansRef}>
          {wells.map(([x, z], i) => (
            <group key={i} position={[x * wellAt, DECK_H * 0.55, z * wellAt]} rotation={[0, i, 0]}>
              {[0, 1, 2, 3, 4].map(b => (
                <mesh key={b} rotation={[0, (b * Math.PI * 2) / 5, 0.3]} position={[0, 0, 0]} material={bladeMaterial}>
                  <boxGeometry args={[wellR * 1.8, 0.05, wellR * 0.32]} />
                </mesh>
              ))}
              <mesh material={shellMaterial}><cylinderGeometry args={[wellR * 0.2, wellR * 0.2, 0.25, 12]} /></mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  );
};
