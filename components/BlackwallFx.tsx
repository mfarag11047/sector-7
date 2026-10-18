// Visuals for the Netrunner's Black Wall Infect (sim/blackwall.ts), in the colours of the
// Blackwall at the map's edge (components/BlackWall.tsx): crimson, magenta and electric blue
// static with scanlines that tear sideways.
//   - BlackwallBomb: the virus bomb falling, with a warning ring on the ground.
//   - BlackwallBurst: the blast: a glitching ring and a pillar of torn scanlines.
//   - BlackwallInfection: the shell of glitching code that crawls over an infected unit.
//   - BlackwallExposure: a ring filling up round a unit that is about to catch it.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BLACKWALL } from '../sim/blackwall';

const RED = '#ff1a3c';
const MAGENTA = '#ff2fb4';
const BLUE = '#3f6bff';

const glitchVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vPos;
  void main() {
    vUv = uv;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Vertical scanlines in red, magenta and blue that crawl upward and break into segments, with
// bands that jump sideways now and then: the Blackwall look, wrapped round a shape.
const glitchFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uStrength;
  varying vec2 vUv;
  varying vec3 vPos;
  float hash(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    float row = floor(uv.y * 24.0);
    float tear = step(0.88, hash2(vec2(row, floor(uTime * 11.0))));
    uv.x += tear * (hash2(vec2(row, floor(uTime * 17.0))) - 0.5) * 0.25;
    float col = floor(uv.x * 28.0);
    float within = fract(uv.x * 28.0);
    float line = smoothstep(0.5, 0.15, abs(within - 0.5));
    float seg = floor(uv.y * (6.0 + 10.0 * hash(col)) - uTime * (1.5 + 3.0 * hash(col + 3.0)));
    float on = step(0.4, hash2(vec2(col, seg)));
    float pick = hash(col + 9.0);
    vec3 c = pick < 0.5 ? vec3(1.0, 0.1, 0.24) : (pick < 0.8 ? vec3(1.0, 0.18, 0.7) : vec3(0.25, 0.42, 1.0));
    float flicker = 0.6 + 0.4 * step(0.2, hash2(vec2(col, floor(uTime * 9.0))));
    float a = line * on * flicker * uStrength + tear * 0.25 * uStrength;
    gl_FragColor = vec4(c * a * 1.6, a);
  }
`;

function useGlitchMaterial(seed: number, strength = 1) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: glitchVertex,
    fragmentShader: glitchFragment,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed }, uStrength: { value: strength } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [seed, strength]);
  useEffect(() => () => material.dispose(), [material]);
  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime; });
  return material;
}

const noRaycast = () => null;

// --- Infection ---

// Wrapped round an infected unit: a column of glitching scanlines, a jittering wireframe cage in
// red and blue, and slices of static that jump about.
export const BlackwallInfection: React.FC<{ size: number; seed: number }> = ({ size, seed }) => {
  const shell = useGlitchMaterial(seed % 97, 1.6);
  const cage = useRef<THREE.Group>(null);
  const slices = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (cage.current) {
      // Chromatic split: the red and blue cages jitter apart.
      const jitter = Math.random() < 0.25 ? (Math.random() - 0.5) * 0.6 : 0;
      cage.current.children[0].position.x = 0.15 + jitter;
      cage.current.children[1].position.x = -0.15 - jitter;
      cage.current.rotation.y = t * 0.8;
    }
    if (slices.current) {
      slices.current.children.forEach((c, i) => {
        const on = Math.sin(t * (7 + i * 3) + seed + i) > 0.55;
        c.visible = on;
        if (on) { c.position.y = 0.4 + ((t * (1.3 + i * 0.4) + i * 0.37) % 1) * size * 1.4; c.position.x = (Math.random() - 0.5) * 0.4; }
      });
    }
  });
  return (
    <group raycast={noRaycast}>
      <mesh position={[0, size * 0.7, 0]} material={shell} raycast={noRaycast} renderOrder={7}>
        <cylinderGeometry args={[size * 0.75, size * 0.75, size * 1.4, 20, 1, true]} />
      </mesh>
      <group ref={cage} position={[0, size * 0.7, 0]}>
        <mesh raycast={noRaycast}>
          <boxGeometry args={[size * 1.1, size * 1.3, size * 1.1]} />
          <meshBasicMaterial color={RED} wireframe transparent opacity={0.75} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh raycast={noRaycast}>
          <boxGeometry args={[size * 1.1, size * 1.3, size * 1.1]} />
          <meshBasicMaterial color={BLUE} wireframe transparent opacity={0.65} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      </group>
      <group ref={slices}>
        {[RED, MAGENTA, BLUE].map((c, i) => (
          <mesh key={i} raycast={noRaycast}>
            <boxGeometry args={[size * 1.6, 0.12, size * 1.6]} />
            <meshBasicMaterial color={c} transparent opacity={0.7} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
      {/* A red ring on the ground marking the carrier. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]} raycast={noRaycast}>
        <ringGeometry args={[size * 0.9, size * 1.05, 32]} />
        <meshBasicMaterial color={RED} transparent opacity={0.8} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

// Round a unit that has been near a carrier: a ring filling in as it gets closer to catching it.
export const BlackwallExposure: React.FC<{ size: number; exposureMs: number }> = ({ size, exposureMs }) => {
  const share = Math.min(1, exposureMs / BLACKWALL.spreadMs);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]} raycast={noRaycast}>
      <ringGeometry args={[size * 0.9, size * 1.05, 32, 1, Math.PI / 2, -share * Math.PI * 2]} />
      <meshBasicMaterial color={MAGENTA} transparent opacity={0.85} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

// --- Bomb and blast ---

// The virus bomb falling onto `at` (world units), landing at `landAt`.
export const BlackwallBomb: React.FC<{ at: { x: number; z: number }; firedAt: number; landAt: number; radius: number }> = ({ at, firedAt, landAt, radius }) => {
  const bomb = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const shell = useGlitchMaterial(firedAt % 89);
  useFrame(({ clock }) => {
    const p = Math.min(1, Math.max(0, (Date.now() - firedAt) / (landAt - firedAt)));
    if (bomb.current) {
      bomb.current.position.y = 140 * (1 - p * p);
      bomb.current.rotation.y = clock.elapsedTime * 6;
    }
    if (ring.current) {
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.45 * Math.abs(Math.sin(clock.elapsedTime * 10));
      ring.current.scale.setScalar(1.15 - 0.15 * p);
    }
  });
  return (
    <group position={[at.x, 0, at.z]}>
      <group ref={bomb}>
        <mesh raycast={noRaycast}>
          <octahedronGeometry args={[2.2, 0]} />
          <meshBasicMaterial color="#12020a" />
        </mesh>
        <mesh material={shell} scale={1.25} raycast={noRaycast}>
          <octahedronGeometry args={[2.2, 1]} />
        </mesh>
        {/* Trail of torn scanlines behind it. */}
        <mesh position={[0, 9, 0]} material={shell} raycast={noRaycast}>
          <cylinderGeometry args={[0.6, 1.6, 16, 8, 1, true]} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]} raycast={noRaycast}>
        <ringGeometry args={[radius * 0.92, radius, 48]} />
        <meshBasicMaterial color={RED} transparent opacity={0.6} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

// The blast: a ring of static sweeping out to the bomb's radius and a pillar of scanlines
// tearing upward, both fading over the explosion's duration.
export const BlackwallBurst: React.FC<{ position: { x: number; y: number; z: number }; radius: number; createdAt: number; duration: number }> = ({ position, radius, createdAt, duration }) => {
  const ring = useRef<THREE.Mesh>(null);
  const pillar = useRef<THREE.Mesh>(null);
  const disc = useRef<THREE.Mesh>(null);
  const shell = useGlitchMaterial(createdAt % 83, 1.4);
  useFrame(() => {
    const p = Math.min(1, (Date.now() - createdAt) / duration);
    const grow = 0.2 + 0.8 * Math.sqrt(p);
    if (ring.current) {
      ring.current.scale.setScalar(grow);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);
    }
    if (disc.current) {
      disc.current.scale.setScalar(grow);
      (disc.current.material as THREE.MeshBasicMaterial).opacity = 0.3 * (1 - p);
    }
    if (pillar.current) {
      pillar.current.scale.set(1 - p * 0.6, 0.3 + p * 1.2, 1 - p * 0.6);
      shell.uniforms.uStrength.value = 1.4 * (1 - p);
    }
  });
  return (
    <group position={[position.x, 0, position.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]} raycast={noRaycast}>
        <ringGeometry args={[radius * 0.85, radius, 64]} />
        <meshBasicMaterial color={MAGENTA} transparent opacity={0.9} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={disc} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.35, 0]} raycast={noRaycast}>
        <circleGeometry args={[radius, 48]} />
        <meshBasicMaterial color={RED} transparent opacity={0.3} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={pillar} position={[0, 15, 0]} material={shell} raycast={noRaycast}>
        <cylinderGeometry args={[radius * 0.6, radius * 0.9, 30, 24, 1, true]} />
      </mesh>
    </group>
  );
};
