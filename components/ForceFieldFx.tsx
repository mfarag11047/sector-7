// Visuals for Heavy Metal's Bulwark Force Field (sim/forcefield.ts).
//   - ForceFieldDome: the hexagon-panelled dome, bright at its rim, with a scan band sweeping up
//     it, flickering as the generator nears burn-out, and lightning crackling from the
//     generator to every enemy inside.
//   - ShieldImpact: a ripple of hexes where a shot or projectile is stopped on the skin.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

const noRaycast = () => null;

const domeVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  varying float vHeight;
  void main() {
    vUv = uv;
    vHeight = position.y;
    vec4 world = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-world.xyz);
    gl_Position = projectionMatrix * world;
  }
`;

const domeFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uRadius;
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec2 vUv;
  varying float vHeight;

  // Distance to the nearest hexagon edge, on a hex grid.
  float hexEdge(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    vec2 q = abs(g);
    return 0.5 - max(dot(q, normalize(vec2(1.0, 1.7320508))), q.x);
  }

  void main() {
    float fresnel = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
    vec2 grid = vec2(vUv.x * 36.0, vUv.y * 12.0);
    float edge = smoothstep(0.06, 0.0, hexEdge(grid));
    float h = vHeight / uRadius;
    // A band of light sweeping up the dome.
    float band = smoothstep(0.08, 0.0, abs(fract(uTime * 0.25) - h));
    // Slow shimmer across the panels.
    float shimmer = 0.5 + 0.5 * sin(uTime * 2.0 + vUv.x * 40.0 + vUv.y * 13.0);
    float base = 0.06 + 0.10 * shimmer;
    float a = (base + edge * 0.35 + fresnel * 0.9 + band * 0.45) * uFade;
    // Bright where the dome meets the ground.
    a += smoothstep(0.12, 0.0, h) * 0.6 * uFade;
    gl_FragColor = vec4(uColor * (0.6 + edge * 0.8 + band), clamp(a, 0.0, 1.0));
  }
`;

// A jagged bolt between two points.
function bolt(from: THREE.Vector3, to: THREE.Vector3, jitter: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const segs = 7;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = from.clone().lerp(to, t);
    if (i > 0 && i < segs) p.add(new THREE.Vector3((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter));
    pts.push([p.x, p.y, p.z]);
  }
  return pts;
}

export const ForceFieldDome: React.FC<{
  center: { x: number; z: number };
  radius: number;
  color: string;
  expiresAt?: number;
  // World positions of the enemies being shocked.
  shocked: { x: number; y: number; z: number }[];
}> = ({ center, radius, color, expiresAt, shocked }) => {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: domeVertex,
    fragmentShader: domeFragment,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uRadius: { value: radius }, uFade: { value: 1 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [color, radius]);
  useEffect(() => () => material.dispose(), [material]);

  // Lightning re-rolls a few times a second.
  const [bolts, setBolts] = useState<[number, number, number][][]>([]);
  const lastRoll = useRef(0);
  const source = useMemo(() => new THREE.Vector3(center.x, 5.5, center.z), [center.x, center.z]);
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
    // Flicker through the last five seconds before burn-out.
    const left = expiresAt ? expiresAt - Date.now() : Infinity;
    material.uniforms.uFade.value = left > 5000 ? 1 : (Math.random() > 0.3 ? 0.4 + 0.6 * Math.max(0, left) / 5000 : 0.1);
    if (clock.elapsedTime - lastRoll.current > 0.09) {
      lastRoll.current = clock.elapsedTime;
      setBolts(shocked.length === 0 ? [] : shocked.flatMap(p => {
        const to = new THREE.Vector3(p.x, p.y, p.z);
        return [bolt(source, to, 2.2), bolt(source, to, 3.2)];
      }));
    }
  });

  return (
    <group>
      <mesh position={[center.x, 0, center.z]} material={material} raycast={noRaycast} renderOrder={6}>
        <sphereGeometry args={[radius, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <mesh position={[center.x, 0.3, center.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[radius - 0.8, radius, 96]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {bolts.map((pts, i) => (
        <Line key={i} points={pts} color={i % 2 ? '#e0f2fe' : color} lineWidth={i % 2 ? 1.5 : 2.5} transparent opacity={0.9} toneMapped={false} />
      ))}
    </group>
  );
};

// A shot stopped on the dome: a flash and a ring of light spreading over the skin.
export const ShieldImpact: React.FC<{ position: { x: number; y: number; z: number }; radius: number; createdAt: number; duration: number }> = ({ position, radius, createdAt, duration }) => {
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const p = Math.min(1, (Date.now() - createdAt) / duration);
    if (ring.current) {
      ring.current.lookAt(camera.position);
      ring.current.scale.setScalar(0.3 + p * 1.6);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - p);
    }
    if (core.current) {
      core.current.scale.setScalar(1 - p * 0.7);
      (core.current.material as THREE.MeshBasicMaterial).opacity = 1 - p;
    }
  });
  return (
    <group position={[position.x, position.y, position.z]}>
      <mesh ref={ring} raycast={noRaycast}>
        <ringGeometry args={[radius * 0.8, radius, 6]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.9} toneMapped={false} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={core} raycast={noRaycast}>
        <sphereGeometry args={[radius * 0.35, 12, 8]} />
        <meshBasicMaterial color="#e0f2fe" transparent toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};
