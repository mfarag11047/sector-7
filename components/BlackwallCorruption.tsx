// The fringe by the Blackwall, corrupted by it. Its ground is plain old concrete slabs
// (components/districtTheme.ts), but here and there a crack in a slab glows with the Blackwall's
// static, and its buildings flicker with patches of glitching scanlines crawling up their walls.
// In the Blackwall's colours (components/BlackWall.tsx): crimson, magenta and electric blue.
//
// Scenery only, never clicked. Each effect is one instanced mesh with a shared shader; a
// building's corruption goes when the building is destroyed.

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { BuildingData, RoadTileData } from '../types';
import { districtOfTile } from './districtTheme';

// A repeatable 0..1 for a tile, the same for it and its mirror twin, so the map stays symmetric.
const twinHash = (x: number, z: number, gridSize: number) => {
  const last = gridSize - 1;
  const k = Math.min(x * gridSize + z, (last - x) * gridSize + (last - z));
  const h = Math.sin(k * 12.9898) * 43758.5453;
  return h - Math.floor(h);
};

// The fringe tiles with a glitching crack: about one open tile in four.
export function corruptedTiles(tiles: readonly RoadTileData[], gridSize: number): { x: number; z: number; turn: number }[] {
  return tiles
    .filter(t => t.type === 'open' && districtOfTile(t.x, t.z, gridSize) === 'fringe' && twinHash(t.x, t.z, gridSize) < 0.26)
    .map(t => ({ x: t.x, z: t.z, turn: Math.floor(twinHash(t.x + 3, t.z, gridSize) * 4) }));
}

// The fringe buildings still standing, one entry per building however many tiles it covers.
export function corruptedBuildings(buildings: readonly BuildingData[], gridSize: number) {
  const out = new Map<string, { x: number; z: number; w: number; d: number; height: number; single: boolean }>();
  for (const b of buildings) {
    const f = b.footprint;
    if (!f || b.destroyed || districtOfTile(b.gridX, b.gridZ, gridSize) !== 'fringe') continue;
    const k = `${f.x},${f.z}`;
    const prev = out.get(k);
    out.set(k, { x: f.x, z: f.z, w: f.w, d: f.d, height: Math.max(prev?.height ?? 0, b.height), single: f.w * f.d === 1 });
  }
  return [...out.values()];
}

// --- The crack shapes: four in a 2x2 atlas, white on clear, a bright core in a soft halo ---

function crackAtlas(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const S = 512, H = S / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  let seed = 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const branch = (x: number, y: number, angle: number, length: number, width: number, depth: number, cx: number, cy: number) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      angle += (rand() - 0.5) * 0.9;
      x += Math.cos(angle) * (length / steps);
      y += Math.sin(angle) * (length / steps);
      x = Math.max(cx + 10, Math.min(cx + H - 10, x));
      y = Math.max(cy + 10, Math.min(cy + H - 10, y));
      ctx.lineTo(x, y);
      if (depth > 0 && rand() < 0.3) {
        ctx.stroke();
        branch(x, y, angle + (rand() < 0.5 ? 1 : -1) * (0.6 + rand() * 0.6), length * 0.45, width * 0.6, depth - 1, cx, cy);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  };
  for (let v = 0; v < 4; v++) {
    const cx = (v % 2) * H, cy = Math.floor(v / 2) * H;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, cy, H, H); ctx.clip();
    // The halo first, wide and faint, then the bright core over it.
    for (const pass of [{ width: 16, alpha: 0.28, blur: 14 }, { width: 3.5, alpha: 1, blur: 4 }]) {
      seed = 9 + v * 101;
      ctx.strokeStyle = `rgba(255,255,255,${pass.alpha})`;
      ctx.shadowColor = 'white';
      ctx.shadowBlur = pass.blur;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const a = rand() * Math.PI * 2;
      branch(cx + H / 2, cy + H / 2, a, H * 0.42, pass.width, 2, cx, cy);
      branch(cx + H / 2, cy + H / 2, a + Math.PI + (rand() - 0.5), H * 0.38, pass.width * 0.85, 2, cx, cy);
    }
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

// Shared by both shaders: hashing and the three Blackwall colours.
const GLITCH_COMMON = /* glsl */ `
  uniform float uTime;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 wallColour(float pick) {
    return pick < 0.5 ? vec3(1.0, 0.1, 0.24) : (pick < 0.8 ? vec3(1.0, 0.18, 0.7) : vec3(0.25, 0.42, 1.0));
  }
`;

const crackVertex = /* glsl */ `
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const crackFragment = /* glsl */ `
  uniform sampler2D uMask;
  varying vec2 vUv;
  varying float vSeed;
  ${GLITCH_COMMON}
  void main() {
    float t = uTime;
    float variant = floor(vSeed * 4.0);
    vec2 cell = vec2(mod(variant, 2.0), floor(variant / 2.0)) * 0.5;
    // Rows of the crack now and then jump sideways.
    vec2 uv = vUv;
    float row = floor(uv.y * 28.0);
    float tear = step(0.9, h(vec2(row, floor(t * 10.0 + vSeed * 50.0))));
    uv.x += tear * (h(vec2(row, floor(t * 15.0))) - 0.5) * 0.08;
    float m = texture2D(uMask, cell + clamp(uv, 0.002, 0.998) * 0.5).a;
    // The colour shifts along the crack and from moment to moment.
    float seg = floor((uv.x + uv.y) * 6.0);
    vec3 c = wallColour(h(vec2(seg, floor(t * 5.0 + vSeed * 20.0))));
    float flicker = 0.5 + 0.5 * step(0.25, h(vec2(floor(t * 13.0 + vSeed * 40.0), vSeed)));
    float pulse = 0.7 + 0.3 * sin(t * 2.0 + vSeed * 6.28);
    // Stray pixels of static flying off it.
    vec2 px = floor(vUv * 18.0);
    float pix = step(0.95, h(px + floor(t * 7.0 + vSeed * 9.0))) * step(0.03, m);
    float a = clamp(m * flicker * pulse + pix * 0.7, 0.0, 1.0);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c * a * 1.8, a);
  }
`;

const shellVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vUp;
  varying float vSeed;
  void main() {
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vN = normalize(mat3(instanceMatrix) * normal);
    vUp = position.y + 0.5;
    vSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;
// Patches of the wall that switch on and off, more of them low down, each a run of vertical
// scanlines crawling upward; bands that tear sideways across the whole building; a glow round
// the base; and stray squares of static on the roof.
const shellFragment = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vN;
  varying float vUp;
  varying float vSeed;
  ${GLITCH_COMMON}
  void main() {
    float t = uTime;
    float step1 = floor(t * (1.2 + vSeed * 2.0));
    float a;
    float pick;
    if (vN.y > 0.5) {
      vec2 sq = floor(vWorld.xz * 0.6);
      a = step(0.9, h(sq + vec2(step1 * 0.37, vSeed * 17.0))) * 0.8;
      pick = h(sq + 5.0);
    } else {
      float u = abs(vN.x) > 0.5 ? vWorld.z : vWorld.x;
      float v = vWorld.y;
      float row = floor(v * 1.2);
      float tear = step(0.93, h(vec2(row + vSeed * 91.0, floor(t * 8.0))));
      u += tear * (h(vec2(row, floor(t * 12.0))) - 0.5) * 3.0;
      vec2 cell = floor(vec2(u / 3.0, v / 3.0));
      float patchOn = step(0.45 + vUp * 0.3, h(cell + vec2(step1 * 0.37, vSeed * 17.0)));
      float col = floor(u * 0.9);
      float within = fract(u * 0.9);
      float line = smoothstep(0.5, 0.2, abs(within - 0.5));
      float seg = floor(v * 0.7 - t * (1.0 + 2.0 * h(vec2(col, 3.0))));
      float on = step(0.35, h(vec2(col, seg)));
      pick = h(vec2(col, floor(t * 2.0 + vSeed * 5.0)));
      // A patch is a haze of static with brighter scanlines through it.
      a = patchOn * (0.22 + line * on * 0.85) + tear * 0.45;
      a += (1.0 - smoothstep(0.0, 0.3, vUp)) * 0.35 * (0.6 + 0.4 * sin(t * 3.0 + vSeed * 6.28));
    }
    if (a < 0.01) discard;
    gl_FragColor = vec4(wallColour(pick) * a * 1.8, a);
  }
`;

const time = { value: 0 };
const noRaycast = () => null;
const ROAD_TOP = 0.2;

const BlackwallCorruption: React.FC<{ tiles: RoadTileData[]; buildings: BuildingData[]; tileSize: number; offset: number }> = ({ tiles, buildings, tileSize, offset }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  const cracks = useMemo(() => corruptedTiles(tiles, gridSize), [tiles, gridSize]);
  // Only rebuilt when a fringe building falls, not on every change to the buildings.
  const fallen = buildings.filter(b => b.destroyed && b.footprint && districtOfTile(b.gridX, b.gridZ, gridSize) === 'fringe').length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shells = useMemo(() => corruptedBuildings(buildings, gridSize), [fallen, gridSize]);

  const atlas = useMemo(crackAtlas, []);
  const crackMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: crackVertex, fragmentShader: crackFragment,
    uniforms: { uTime: time, uMask: { value: atlas } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [atlas]);
  const shellMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: shellVertex, fragmentShader: shellFragment,
    uniforms: { uTime: time },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), []);
  useEffect(() => () => { crackMaterial.dispose(); shellMaterial.dispose(); atlas.dispose(); }, [crackMaterial, shellMaterial, atlas]);
  useFrame(({ clock }) => { time.value = clock.elapsedTime; });

  const crackRef = useRef<THREE.InstancedMesh>(null);
  const shellRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = crackRef.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    cracks.forEach((c, i) => {
      o.position.set(c.x * tileSize - offset, ROAD_TOP + 0.05, c.z * tileSize - offset);
      o.rotation.set(-Math.PI / 2, 0, (c.turn * Math.PI) / 2);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [cracks, tileSize, offset]);
  useLayoutEffect(() => {
    const mesh = shellRef.current;
    if (!mesh) return;
    const o = new THREE.Object3D();
    shells.forEach((s, i) => {
      // A little bigger than the building, so it wraps it.
      const fill = s.single ? 0.7 : 0.96;
      const across = (n: number) => (n - 1 + fill) * tileSize + 0.5;
      o.position.set((s.x + (s.w - 1) / 2) * tileSize - offset, (s.height + 0.3) / 2, (s.z + (s.d - 1) / 2) * tileSize - offset);
      o.rotation.set(0, 0, 0);
      o.scale.set(across(s.w), s.height + 0.3, across(s.d));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [shells, tileSize, offset]);

  return (
    <group>
      {cracks.length > 0 && (
        <instancedMesh key={`cracks-${cracks.length}`} ref={crackRef} args={[undefined, crackMaterial, cracks.length]} raycast={noRaycast} renderOrder={2}>
          <planeGeometry args={[tileSize * 0.9, tileSize * 0.9]} />
        </instancedMesh>
      )}
      {shells.length > 0 && (
        <instancedMesh key={`shells-${shells.length}`} ref={shellRef} args={[undefined, shellMaterial, shells.length]} raycast={noRaycast} renderOrder={3}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      )}
    </group>
  );
};

export default React.memo(BlackwallCorruption);
