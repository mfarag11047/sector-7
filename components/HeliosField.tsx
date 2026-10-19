// What a Helios is doing (sim/helios.ts), drawn on the ground under it.
//   - Charge mode: a gold ring with soft pulses drifting inward, power flowing to the units inside.
//   - Microwave mode: an orange-red ring with heat rippling outward, and a faint cone of the beam
//     from the drone down to the ground.
// A Helios that isn't working (knocked out, or flat in Microwave mode) shows only a dim ring.

import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const time = { value: 0 };
const makeMaterial = (color: string, inward: boolean) => new THREE.ShaderMaterial({
  uniforms: { uTime: time, uColor: { value: new THREE.Color(color) } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      if (r > 1.0) discard;
      // Pulses running ${inward ? 'in toward the drone' : 'out from the drone'}.
      float wave = sin(r * 18.0 ${inward ? '+' : '-'} uTime * 3.0) * 0.5 + 0.5;
      float a = 0.05 + smoothstep(0.7, 1.0, wave) * ${inward ? '0.10' : '0.16'};
      gl_FragColor = vec4(uColor * (1.0 + wave * 0.6), a);
    }
  `,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide,
});
let chargeMaterial: THREE.ShaderMaterial | null = null;
let burnMaterial: THREE.ShaderMaterial | null = null;
const getChargeMaterial = () => chargeMaterial ??= makeMaterial('#facc15', true);
const getBurnMaterial = () => burnMaterial ??= makeMaterial('#f97316', false);

const noRaycast = () => null;
const CHARGE = '#facc15';
const BURN = '#ef4444';

export const HeliosField: React.FC<{ radius: number; mode: 'charge' | 'burn'; working: boolean; groundY: number }> = ({ radius, mode, working, groundY }) => {
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });
  const burn = mode === 'burn';
  return (
    <group>
      <group position={[0, groundY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh raycast={noRaycast}>
          <ringGeometry args={[radius - 0.5, radius, 64]} />
          <meshBasicMaterial color={burn ? BURN : CHARGE} transparent opacity={working ? 0.6 : 0.2} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        {working && (
          <mesh position={[0, 0, 0.05]} material={burn ? getBurnMaterial() : getChargeMaterial()} raycast={noRaycast} renderOrder={2}>
            <circleGeometry args={[radius - 0.5, 64]} />
          </mesh>
        )}
      </group>
      {/* The microwave beam: a faint cone from the drone to the ground it covers. */}
      {working && burn && (
        <mesh position={[0, groundY / 2, 0]} raycast={noRaycast} renderOrder={3}>
          <coneGeometry args={[radius - 0.5, -groundY, 48, 1, true]} />
          <meshBasicMaterial color="#fb923c" transparent opacity={0.07} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
};
