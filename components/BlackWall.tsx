// The Blackwall: the digital barrier that seals the city in.
//
// Four towering walls of glitching light stand just outside the map edge: dense vertical
// scanlines in red, magenta and blue that flicker, tear sideways and break up as they rise, with
// hot magenta flares bursting through here and there. A bright seam runs along the base, and the
// ground outside is a dark crimson waste lit by the wall's glow, so the edge of the playable city
// reads at a glance instead of fading into the night.
//
// All of it is shader work on a handful of planes: cheap to draw, no textures. It ignores fog so
// the wall stays visible at any zoom.

import React, { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const WALL_HEIGHT = 150;
// Tiles of clearance between the last row of the city and the wall.
const MARGIN = 2;

const wallVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const wallFragment = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uSeed;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n * 127.1 + uSeed * 311.7) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }

  void main() {
    float t = uTime;
    vec2 uv = vUv;

    // Horizontal tears: now and then a band of the wall jumps sideways.
    float row = floor(uv.y * 40.0);
    float tearOn = step(0.93, hash2(vec2(row, floor(t * 9.0))));
    uv.x += tearOn * (hash2(vec2(row, floor(t * 13.0))) - 0.5) * 0.04;

    // Dense vertical scanlines along the wall: about one every world unit and a half.
    float columns = uLength / 1.6;
    float cx = uv.x * columns;
    float col = floor(cx);
    float within = fract(cx);
    float width = 0.18 + 0.55 * hash(col);
    float line = smoothstep(width, width * 0.4, abs(within - 0.5) * 2.0);

    // Each column's colour: red, magenta or blue, red the most common.
    float pick = hash(col + 17.0);
    vec3 red = vec3(1.0, 0.08, 0.22);
    vec3 magenta = vec3(1.0, 0.18, 0.75);
    vec3 blue = vec3(0.25, 0.35, 1.0);
    vec3 color = pick < 0.55 ? red : (pick < 0.82 ? magenta : blue);

    // Columns break into flickering segments that crawl upward.
    float seg = floor(uv.y * (14.0 + 30.0 * hash(col + 3.0)) - t * (0.6 + hash(col + 5.0) * 2.5));
    float segOn = step(0.28, hash2(vec2(col, seg)));
    float flicker = 0.55 + 0.45 * step(0.15, hash2(vec2(col, floor(t * (4.0 + 8.0 * hash(col + 9.0))))));

    // Fade with height, strongest at the base.
    float rise = pow(1.0 - uv.y, 1.6);
    float intensity = line * segOn * flicker * (0.25 + 0.95 * rise);

    // A soft haze behind the lines so the wall reads as a sheet, not a fence.
    float haze = 0.18 * rise * (0.7 + 0.3 * sin(uv.x * 40.0 + t * 1.3));
    vec3 hazeColor = mix(red, magenta, 0.5 + 0.5 * sin(uv.x * 9.0 + t * 0.4));

    // Magenta flares bursting through: a few drifting hot spots that pulse.
    float flare = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float period = 5.0 + fi * 1.7;
      float cycle = floor((t + fi * 2.3) / period);
      float phase = fract((t + fi * 2.3) / period);
      vec2 c = vec2(hash2(vec2(cycle, fi)), 0.12 + 0.45 * hash2(vec2(fi, cycle)));
      vec2 d = (uv - c) * vec2(uLength / WALL_H, 1.0);
      float pulse = sin(phase * 3.14159);
      flare += pulse * (exp(-length(d) * 9.0) * 1.6 + exp(-abs(d.y) * 30.0) * exp(-abs(d.x) * 2.5) * 0.35);
    }
    vec3 flareColor = vec3(1.0, 0.35, 0.85);

    // The bright seam along the base.
    float seam = exp(-uv.y * 60.0) * 1.4;

    vec3 rgb = color * intensity * 1.6 + hazeColor * haze + flareColor * flare + vec3(1.0, 0.2, 0.5) * seam;
    float alpha = clamp(intensity * 0.9 + haze + flare * 0.8 + seam, 0.0, 1.0);
    gl_FragColor = vec4(rgb, alpha);
  }
`.replace('WALL_H', WALL_HEIGHT.toFixed(1));

// The ground beyond the wall: near-black crimson, lit red close to the wall and fading out.
const outerFragment = /* glsl */ `
  uniform float uTime;
  uniform float uHalf;
  uniform float uWall;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float edge = max(abs(vWorld.x), abs(vWorld.z));
    float out_ = edge - uHalf;
    if (out_ < 0.0) discard;
    // Lit hardest at the foot of the wall, on both sides of it.
    float glow = exp(-abs(edge - uWall) / 70.0);
    // Faint scan grid on the waste ground.
    vec2 g = abs(fract(vWorld.xz / 28.0) - 0.5);
    float grid = smoothstep(0.48, 0.5, max(g.x, g.y)) * 0.25 * glow;
    float pulse = 0.85 + 0.15 * sin(uTime * 1.2 - out_ * 0.05);
    vec3 base = vec3(0.045, 0.008, 0.02);
    vec3 rgb = base + vec3(0.6, 0.04, 0.18) * glow * 0.7 * pulse + vec3(0.9, 0.1, 0.4) * grid;
    gl_FragColor = vec4(rgb, 1.0);
  }
`;
// The wall's light spilling onto the city side: a red rim along the inside of the edge.
const rimFragment = /* glsl */ `
  uniform float uTime;
  uniform float uHalf;
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float inside = uHalf - max(abs(vWorld.x), abs(vWorld.z));
    if (inside < 0.0 || inside > 60.0) discard;
    float flick = 0.8 + 0.2 * sin(uTime * 7.0 + vWorld.x * 0.05 + vWorld.z * 0.05);
    float glow = exp(-inside / 14.0) * flick;
    gl_FragColor = vec4(vec3(1.0, 0.1, 0.35) * glow, glow * 0.6);
  }
`;
const outerVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

export const BlackWall: React.FC<{ gridSize: number; tileSize: number }> = ({ gridSize, tileSize }) => {
  // The city's edge, and the wall just beyond it.
  const mapHalf = (gridSize * tileSize) / 2;
  const half = mapHalf + MARGIN * tileSize;
  const length = half * 2;

  const walls = useMemo(() => [0, 1, 2, 3].map(i => new THREE.ShaderMaterial({
    vertexShader: wallVertex,
    fragmentShader: wallFragment,
    uniforms: { uTime: { value: 0 }, uLength: { value: length }, uSeed: { value: i * 7.31 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })), [length]);

  const outer = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: outerVertex,
    fragmentShader: outerFragment,
    uniforms: { uTime: { value: 0 }, uHalf: { value: mapHalf }, uWall: { value: half } },
  }), [half, mapHalf]);

  const rim = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: outerVertex,
    fragmentShader: rimFragment,
    uniforms: { uTime: { value: 0 }, uHalf: { value: mapHalf }, uWall: { value: half } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [half, mapHalf]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const m of walls) m.uniforms.uTime.value = t;
    outer.uniforms.uTime.value = t;
    rim.uniforms.uTime.value = t;
  });

  // Each wall faces into the city: [x, z, rotation about Y].
  const placements: [number, number, number][] = [
    [0, -half, 0],
    [half, 0, -Math.PI / 2],
    [0, half, Math.PI],
    [-half, 0, Math.PI / 2],
  ];

  return (
    <group>
      {placements.map(([x, z, ry], i) => (
        <mesh key={i} position={[x, WALL_HEIGHT / 2, z]} rotation={[0, ry, 0]} material={walls[i]} raycast={() => null} frustumCulled={false} renderOrder={5}>
          <planeGeometry args={[length, WALL_HEIGHT, 1, 1]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.6, 0]} material={rim} raycast={() => null} renderOrder={4}>
        <planeGeometry args={[length, length, 1, 1]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} material={outer} raycast={() => null}>
        <planeGeometry args={[length * 6, length * 6, 1, 1]} />
      </mesh>
    </group>
  );
};

export default BlackWall;
