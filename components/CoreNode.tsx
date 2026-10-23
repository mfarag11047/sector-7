// The core node as a core extraction reactor: an armoured hexagonal housing over the extraction
// shaft, four pylons holding a glowing amber energy core suspended above it, turning inside two
// tilted containment rings, an energy column running from the core down into the shaft, and six
// conduits on a hex pad radiating out from the housing, pulses running in along them. The rim,
// rings and pylon lights take the owner's colour once it is held; the core itself stays amber.
//
// The housing carries the capture fill (Building.tsx's material).

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Edges } from '@react-three/drei';
import { CITY_CONFIG, TEAM_COLORS } from '../constants';
import type { BuildingData } from '../types';
import { isSubtreeVisible, refreshSubtree } from '../perf';

const time = { value: 0 };

const conduitMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    void main() {
      // Pulses running in toward the reactor.
      float pulse = smoothstep(0.8, 1.0, sin(vUv.y * 14.0 + uTime * 4.0));
      gl_FragColor = vec4(vec3(1.0, 0.62, 0.12) * (0.5 + pulse * 1.8), 1.0);
    }`,
  toneMapped: false,
});
const columnMaterial = new THREE.ShaderMaterial({
  uniforms: { uTime: time },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; varying vec2 vUv;
    void main() {
      float flow = 0.6 + 0.4 * sin(vUv.y * 24.0 + uTime * 8.0);
      float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
      float a = flow * (0.3 + 0.7 * core) * 0.85;
      gl_FragColor = vec4(vec3(1.0, 0.7, 0.2) * a * 1.8, a);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
});
const padMaterial = new THREE.MeshStandardMaterial({ color: '#141922', metalness: 0.7, roughness: 0.45 });
const pylonMaterial = new THREE.MeshStandardMaterial({ color: '#2b3340', metalness: 0.85, roughness: 0.3 });
const coreMaterial = new THREE.MeshStandardMaterial({ color: '#ffb02e', emissive: '#ff9a1a', emissiveIntensity: 2.2, toneMapped: false, roughness: 0.2 });
const glows = new Map<string, THREE.MeshBasicMaterial>();
const glow = (color: string, opacity = 1) => {
  const k = `${color}:${opacity}`;
  let m = glows.get(k);
  if (!m) { m = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, side: THREE.DoubleSide }); glows.set(k, m); }
  return m;
};

const HEX = Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2 + Math.PI / 6);

export const CoreNode: React.FC<{
  data: BuildingData;
  materialRef: React.Ref<THREE.MeshStandardMaterial>;
  onBeforeCompile: (shader: any) => void;
  hovered: boolean;
  edge: THREE.Color;
}> = ({ data, materialRef, onBeforeCompile, hovered, edge }) => {
  const T = CITY_CONFIG.tileSize;
  const [w, h] = data.scale;
  const r = w / 2;
  const accent = data.owner ? TEAM_COLORS[data.owner] : '#fbbf24';
  const coreY = h + 7.5;
  const spin = useRef<THREE.Group>(null);
  const ringA = useRef<THREE.Group>(null);
  const ringB = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    time.value = clock.elapsedTime;
    if (!spin.current || !isSubtreeVisible(spin.current)) return;
    spin.current.rotation.y += delta * 0.8;
    spin.current.rotation.x += delta * 0.3;
    const s = 1 + Math.sin(clock.elapsedTime * 2.4) * 0.08;
    spin.current.scale.setScalar(s);
    if (ringA.current) ringA.current.rotation.y += delta * 1.1;
    if (ringB.current) ringB.current.rotation.y -= delta * 0.7;
    for (const g of [spin.current, ringA.current, ringB.current]) if (g) refreshSubtree(g);
  });
  return (
    <group>
      {/* The hex pad, its lit rim, and six conduits radiating out. */}
      <mesh position={[0, 0.25, 0]} material={padMaterial} receiveShadow><cylinderGeometry args={[T * 0.47, T * 0.47, 0.2, 6]} /></mesh>
      <mesh position={[0, 0.37, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glow(accent)}><ringGeometry args={[T * 0.44, T * 0.47, 6]} /></mesh>
      {HEX.map(a => (
        <mesh key={a} position={[Math.cos(a) * (r + (T * 0.44 - r) / 2), 0.4, Math.sin(a) * (r + (T * 0.44 - r) / 2)]}
          rotation={[Math.PI / 2, 0, -a + Math.PI / 2]} material={conduitMaterial}>
          <boxGeometry args={[0.45, T * 0.44 - r, 0.12]} />
        </mesh>
      ))}

      {/* The armoured housing: it carries the capture fill. */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[r * 0.88, r, h, 6]} />
        <meshStandardMaterial ref={materialRef} metalness={0.85} roughness={0.3} onBeforeCompile={onBeforeCompile} />
        <Edges threshold={15} color={hovered ? '#ffffff' : edge} />
      </mesh>
      <mesh position={[0, h + 0.1, 0]} rotation={[0, Math.PI / 6, 0]} material={glow(accent)}><cylinderGeometry args={[r * 0.9, r * 0.9, 0.2, 6]} /></mesh>
      {/* The shaft mouth on top, glowing. */}
      <mesh position={[0, h + 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} material={glow('#ff9a1a')}><circleGeometry args={[r * 0.35, 16]} /></mesh>

      {/* Four pylons up round the core, a light near each top. */}
      {[0, 1, 2, 3].map(i => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const px = Math.cos(a) * r * 0.85, pz = Math.sin(a) * r * 0.85;
        const tall = coreY + 3 - h;
        return (
          <group key={i} position={[px, h, pz]}>
            <mesh position={[0, tall / 2, 0]} rotation={[Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12]} material={pylonMaterial} castShadow>
              <boxGeometry args={[0.8, tall, 0.8]} />
            </mesh>
            <mesh position={[0, tall - 0.6, 0]} material={glow(accent)}><boxGeometry args={[0.7, 0.35, 0.7]} /></mesh>
          </group>
        );
      })}

      {/* The energy column from the core down into the shaft. */}
      <mesh position={[0, (h + coreY) / 2, 0]} material={columnMaterial}><cylinderGeometry args={[0.8, 1.3, coreY - h, 12, 1, true]} /></mesh>

      {/* The core, turning and breathing, in its two containment rings. */}
      <group position={[0, coreY, 0]}>
        <group ref={spin}>
          <mesh material={coreMaterial}><icosahedronGeometry args={[2.6, 0]} /></mesh>
          <mesh material={glow('#ffd27a', 0.14)}><icosahedronGeometry args={[3.6, 1]} /></mesh>
        </group>
        <group rotation={[0.5, 0, 0.2]}>
          <group ref={ringA}><mesh rotation={[Math.PI / 2, 0, 0]} material={glow(accent, 0.9)}><torusGeometry args={[4.6, 0.18, 6, 40]} /></mesh></group>
        </group>
        <group rotation={[-0.4, 0, -0.5]}>
          <group ref={ringB}><mesh rotation={[Math.PI / 2, 0, 0]} material={glow(accent, 0.7)}><torusGeometry args={[5.4, 0.12, 6, 40]} /></mesh></group>
        </group>
      </group>
    </group>
  );
};
