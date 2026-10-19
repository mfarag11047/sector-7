// The Ghost's Dampener field (sim/ghost.ts): a wall of flickering black and white vertical glitch
// bars standing round the Ghost at the field's edge, like a camera feed being scrambled, over a
// faint ring on the ground.
//
// One shared shader material: bars are columns round the wall that switch between white, black and
// clear many times a second, broken up and down the wall so they tear rather than stand solid.

import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const glitchTime = { value: 0 };
let wallMaterial: THREE.ShaderMaterial | null = null;
const getWallMaterial = () => wallMaterial ??= new THREE.ShaderMaterial({
  uniforms: { uTime: glitchTime },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vWorld;
    void main() {
      vUv = uv;
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      // Each wall has its own timing, keyed off where it stands.
      float seed = hash(floor(vWorld.xz / 40.0));
      float frame = floor(uTime * 14.0 + seed * 7.0);
      // Columns of uneven width round the wall.
      float col = floor(vUv.x * 140.0 + hash(vec2(floor(vUv.x * 23.0), frame)) * 3.0);
      // Each column is cut into a few vertical runs that come and go.
      float run = floor(vUv.y * (3.0 + floor(hash(vec2(col, 1.0)) * 4.0)));
      float pick = hash(vec2(col, frame + run * 13.0));
      // Bursts: now and then the whole wall floods with bars.
      float burst = step(0.86, hash(vec2(floor(uTime * 3.0), seed)));
      float white = step(0.78 - burst * 0.2, pick);
      float black = step(pick, 0.16 + burst * 0.12);
      if (white + black < 0.5) discard;
      // Fade out toward the top so it reads as a field rising off the ground.
      float fade = 1.0 - smoothstep(0.55, 1.0, vUv.y);
      vec3 colour = mix(vec3(0.02), vec3(0.95), white);
      gl_FragColor = vec4(colour, (white * 0.55 + black * 0.6) * fade);
    }
  `,
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
});

let ringMaterial: THREE.MeshBasicMaterial | null = null;
const getRingMaterial = () => ringMaterial ??= new THREE.MeshBasicMaterial({
  color: '#e2e8f0', transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide,
});

const noRaycast = () => null;

// `radius` in world units; `y` is the ground below the unit.
export const GlitchField: React.FC<{ radius: number; height: number; y: number }> = ({ radius, height, y }) => {
  useFrame(({ clock }) => { glitchTime.value = clock.elapsedTime; });
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, height / 2, 0]} material={getWallMaterial()} raycast={noRaycast} renderOrder={4}>
        <cylinderGeometry args={[radius, radius, height, 64, 1, true]} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]} material={getRingMaterial()} raycast={noRaycast}>
        <ringGeometry args={[radius - 0.4, radius, 64]} />
      </mesh>
    </group>
  );
};
