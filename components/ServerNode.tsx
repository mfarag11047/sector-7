// The server node as a data centre: a gunmetal block whose walls are banks of server racks seen
// through glass, rows of status LEDs blinking on every unit; a cooling plant of spinning fans in
// housings on the roof, with exhaust vents and a status mast; glowing fibre conduits running
// down its corners and out along the ground, data pulses flowing along them.
//
// The block's body carries the capture fill (Building.tsx's material); the fans are spun by
// Building.tsx through fansRef.

import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { TEAM_COLORS } from '../constants';
import type { BuildingData } from '../types';

const time = { value: 0 };

// Server racks behind glass: cabinets side by side, each a stack of 1U units with a strip of
// LEDs, blinking at their own pace, mostly cyan and green, now and then amber.
const rackMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec2 cab = vec2(vUv.x * 6.0, vUv.y * 22.0);
      vec2 cell = floor(cab), f = fract(cab);
      // Cabinet frames and the gaps between units.
      float frame = step(f.x, 0.06) + step(0.94, f.x);
      float slot = step(f.y, 0.12);
      vec3 c = vec3(0.04, 0.05, 0.07) + vec3(0.03, 0.04, 0.06) * (1.0 - slot);
      // LEDs: a short row at the left of each unit.
      float led = step(0.12, f.x) * step(f.x, 0.42) * step(0.4, f.y) * step(f.y, 0.7);
      float which = floor((f.x - 0.12) / 0.06);
      float id = h(cell + which * 3.1);
      float on = step(0.45, h(cell + vec2(which, floor(uTime * (1.5 + id * 6.0) + id * 10.0))));
      vec3 ledColour = id > 0.92 ? vec3(1.0, 0.65, 0.15) : id > 0.5 ? vec3(0.2, 0.95, 1.0) : vec3(0.3, 1.0, 0.5);
      c += led * on * ledColour * 1.6;
      // A cool blue light on the glass, brighter low down (the cold aisle).
      c += vec3(0.05, 0.12, 0.3) * (0.5 + 0.5 * (1.0 - vUv.y));
      c *= 1.0 - frame * 0.8;
      // The glass frame round the whole face.
      float edge = step(vUv.x, 0.02) + step(0.98, vUv.x) + step(vUv.y, 0.03) + step(0.97, vUv.y);
      c = mix(c, vec3(0.15, 0.17, 0.2), clamp(edge, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`,
  toneMapped: false,
});

// Fibre conduits: a glowing cyan line with bright pulses running along it.
const fibreMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    void main() {
      float pulse = smoothstep(0.85, 1.0, sin(vUv.y * 18.0 - uTime * 5.0));
      vec3 c = vec3(0.1, 0.7, 1.0) * (0.55 + pulse * 1.6);
      gl_FragColor = vec4(c, 0.9);
    }`,
  transparent: true, depthWrite: false, toneMapped: false,
});

const shellMaterial = new THREE.MeshStandardMaterial({ color: '#1f2530', metalness: 0.85, roughness: 0.35 });
const fanHousingMaterial = new THREE.MeshStandardMaterial({ color: '#2a313c', metalness: 0.7, roughness: 0.45 });
const bladeMaterial = new THREE.MeshStandardMaterial({ color: '#8a96a8', metalness: 0.8, roughness: 0.3 });
const ventMaterial = new THREE.MeshStandardMaterial({ color: '#3a4250', metalness: 0.6, roughness: 0.5 });
const statusMaterials = new Map<string, THREE.MeshBasicMaterial>();
const glow = (color: string) => {
  let m = statusMaterials.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false }); statusMaterials.set(color, m); }
  return m;
};

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
  const rackH = h * 0.78;
  const fanR = w * 0.17;
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
          <mesh position={[0, 0.4 + rackH / 2, 0]} material={rackMaterial}><planeGeometry args={[w * 0.9, rackH]} /></mesh>
          {/* Corner fibre conduits running down into the ground. */}
          <mesh position={[w * 0.47, h / 2, 0.15]} material={fibreMaterial}><boxGeometry args={[0.25, h, 0.25]} /></mesh>
          {/* And out along the ground, a tile's length. */}
          <mesh position={[w * 0.25, 0.3, 4.5]} rotation={[Math.PI / 2, 0, 0]} material={fibreMaterial}><boxGeometry args={[0.45, 9, 0.14]} /></mesh>
        </group>
      ))}
      {/* A parapet band in the owner's colour, or cyan. */}
      <mesh position={[0, h - 0.5, 0]} material={glow(accent)}><boxGeometry args={[w + 0.12, 0.25, w + 0.12]} /></mesh>

      {/* Roof: a cooling plant of four fans in housings, exhaust vents and a status mast. */}
      <group position={[0, h, 0]}>
        <mesh position={[0, 0.3, 0]} material={shellMaterial}><boxGeometry args={[w * 0.92, 0.6, w * 0.92]} /></mesh>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
          <mesh key={i} position={[x * w * 0.22, 1.1, z * w * 0.22]} material={fanHousingMaterial}>
            <cylinderGeometry args={[fanR * 1.15, fanR * 1.15, 1, 16, 1, true]} />
          </mesh>
        ))}
        <group ref={fansRef}>
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
            <group key={i} position={[x * w * 0.22, 1.2, z * w * 0.22]} rotation={[0, i, 0]}>
              {[0, 1, 2, 3].map(b => (
                <mesh key={b} rotation={[0, (b * Math.PI) / 2, 0.25]} position={[0, 0, 0]} material={bladeMaterial}>
                  <boxGeometry args={[fanR * 1.9, 0.06, fanR * 0.35]} />
                </mesh>
              ))}
              <mesh material={glow(accent)}><cylinderGeometry args={[fanR * 0.18, fanR * 0.18, 0.2, 10]} /></mesh>
            </group>
          ))}
        </group>
        {[-0.3, 0.3].map(x => (
          <mesh key={x} position={[x * w, 1.4, 0]} material={ventMaterial}><boxGeometry args={[w * 0.12, 1.6, w * 0.3]} /></mesh>
        ))}
        <mesh position={[0, 3.5, 0]} material={ventMaterial}><cylinderGeometry args={[0.12, 0.2, 6, 6]} /></mesh>
        <mesh position={[0, 6.6, 0]} material={glow(accent)}><sphereGeometry args={[0.45, 10, 8]} /></mesh>
      </group>
    </group>
  );
};
