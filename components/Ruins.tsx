// Ruins and craters (layout and rules in ruinsPlan.ts).
//
// RuinTile: what a destroyed building tile shows. Its broken wall stubs in the building's own
// colour gone dark with soot, rubble slabs and rebar, each kind merged into one mesh, over a
// scorched footprint; and, for the first while after it fell, embers glowing in the rubble and a
// plume of smoke, both dying away.
//
// Craters: every crater on the map, as one instanced mesh of scorched decals on the ground.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY_CONFIG } from '../constants';
import type { BuildingData } from '../types';
import { lookOf } from './midtownLooks';
import { CRATER, ruinLayout, type Crater, type RuinPiece, type Side } from './ruinsPlan';

// How long the embers and smoke last after a building falls, in seconds.
const BURN_S = 45;
const SOOT = new THREE.Color('#141416');

// The pieces as one geometry, each coloured by `colour(piece)`.
function merged(pieces: readonly RuinPiece[], colour: (p: RuinPiece) => THREE.Color): THREE.BufferGeometry | null {
  if (pieces.length === 0) return null;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  return mergeGeometries(pieces.map(p => {
    e.set(p.turn[1], p.turn[0], p.turn[2], 'YXZ');
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(...p.at), q, new THREE.Vector3(1, 1, 1));
    const g = new THREE.BoxGeometry(...p.size).applyMatrix4(m);
    const c = colour(p), n = g.attributes.position.count, rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { rgb[i * 3] = c.r; rgb[i * 3 + 1] = c.g; rgb[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    return g;
  }));
}

const canvasTexture = (size: number, draw: (g: CanvasRenderingContext2D, rand: () => number) => void) => {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  let s = 7;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  draw(c.getContext('2d')!, rand);
  return new THREE.CanvasTexture(c);
};

// Soot: a dark stain, darkest in the middle, ragged at the edge.
let sootTex: THREE.Texture | null = null;
const sootTexture = () => sootTex ??= canvasTexture(128, (g, rand) => {
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(8,8,9,0.85)');
  grad.addColorStop(0.6, 'rgba(14,13,13,0.6)');
  grad.addColorStop(1, 'rgba(14,13,13,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(10,10,10,${0.15 + rand() * 0.25})`;
    const a = rand() * Math.PI * 2, r = 30 + rand() * 30;
    g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 2 + rand() * 6, 0, Math.PI * 2); g.fill();
  }
});

// A crater: a charred pit with a scorched ring, soot thrown out in streaks, and a ragged edge.
let craterTex: THREE.Texture | null = null;
const craterTexture = () => craterTex ??= canvasTexture(256, (g, rand) => {
  const c = 128;
  // Soot streaks thrown out from the middle.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, len = 70 + rand() * 55, w = 0.06 + rand() * 0.1;
    const grad = g.createLinearGradient(c, c, c + Math.cos(a) * len, c + Math.sin(a) * len);
    grad.addColorStop(0, 'rgba(12,11,10,0.55)');
    grad.addColorStop(1, 'rgba(12,11,10,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(c, c);
    g.arc(c, c, len, a - w, a + w);
    g.closePath(); g.fill();
  }
  // The scorched ground round the pit.
  const burn = g.createRadialGradient(c, c, 10, c, c, 95);
  burn.addColorStop(0, 'rgba(22,18,15,0.95)');
  burn.addColorStop(0.55, 'rgba(34,28,24,0.85)');
  burn.addColorStop(1, 'rgba(30,26,24,0)');
  g.fillStyle = burn;
  g.beginPath(); g.arc(c, c, 95, 0, Math.PI * 2); g.fill();
  // The rim: broken lumps of lighter debris round the pit.
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, r = 46 + rand() * 18;
    g.fillStyle = `rgba(${52 + rand() * 26},${49 + rand() * 22},${45 + rand() * 20},${0.4 + rand() * 0.35})`;
    g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 2 + rand() * 4, 0, Math.PI * 2); g.fill();
  }
  // The charred pit.
  const pit = g.createRadialGradient(c, c, 0, c, c, 46);
  pit.addColorStop(0, 'rgba(5,5,5,1)');
  pit.addColorStop(0.75, 'rgba(12,10,9,1)');
  pit.addColorStop(1, 'rgba(26,22,19,0.9)');
  g.fillStyle = pit;
  g.beginPath(); g.arc(c, c, 46, 0, Math.PI * 2); g.fill();
});

// Broken concrete, from grey to charred black; now and then a chunk of the building's own facade.
const CONCRETE = new THREE.Color('#4c4c50');
const debrisMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
const rebarMaterial = new THREE.MeshStandardMaterial({ color: '#3d2a20', roughness: 0.8, metalness: 0.4 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: '#1b1b1e', roughness: 1 });

// The smoke over a fresh ruin: a plume on two crossed planes, fading out over BURN_S.
const smokeShader = {
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime; uniform float uFade; varying vec2 vUv;
    float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main() {
      vec2 p = vec2(vUv.x * 3.0, vUv.y * 5.0 - uTime * 0.5);
      float d = n(p) * 0.6 + n(p * 2.3) * 0.4;
      float width = 0.15 + vUv.y * 0.4;
      float plume = smoothstep(width, width * 0.3, abs(vUv.x - 0.5 + sin(vUv.y * 3.0 + uTime * 0.25) * 0.1));
      float a = plume * d * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.08, vUv.y) * uFade;
      if (a < 0.02) discard;
      gl_FragColor = vec4(vec3(0.16, 0.15, 0.15) * (0.7 + d * 0.5), a);
    }`,
};

export const RuinTile: React.FC<{ data: BuildingData }> = ({ data }) => {
  const T = CITY_CONFIG.tileSize;
  const segment = !!data.footprint;
  const w = segment ? T : data.scale[0], d = segment ? T : data.scale[2];
  const layout = useMemo(() => {
    const f = data.footprint;
    const outside: Side[] = f
      ? ([['west', data.gridX === f.x], ['east', data.gridX === f.x + f.w - 1], ['north', data.gridZ === f.z], ['south', data.gridZ === f.z + f.d - 1]] as [Side, boolean][]).filter(([, on]) => on).map(([s]) => s)
      : ['north', 'south', 'east', 'west'];
    const l = ruinLayout(data.id, w, d, data.scale[1], outside);
    // The walls in the building's own colour gone dark with soot, some stretches more than others.
    const body = new THREE.Color(lookOf(data)?.body ?? '#3a3d42');
    const facade = body.clone().lerp(SOOT, 0.45);
    return {
      walls: merged(l.walls, p => facade.clone().lerp(SOOT, p.shade)),
      rubble: merged(l.rubble, p => p.shade > 0.92 ? facade.clone() : CONCRETE.clone().lerp(SOOT, p.shade * 0.85)),
      rebar: merged(l.rebar, () => new THREE.Color(1, 1, 1)),
      // Embers glowing on top of the rubble.
      embers: l.rubble.slice(0, 4).map(r => [r.at[0], r.at[1] + r.size[1] * 0.6 + 0.15, r.at[2]] as const),
    };
  }, [data.id, data.footprint, data.gridX, data.gridZ, w, d, data.scale, data.type]);
  useLayoutEffect(() => () => { layout.walls?.dispose(); layout.rubble?.dispose(); layout.rebar?.dispose(); }, [layout]);

  // Burning: embers and smoke for BURN_S after it fell (from when the ruin first appears).
  const born = useRef<number | null>(null);
  const smoke = useMemo(() => new THREE.ShaderMaterial({
    ...smokeShader, uniforms: { uTime: { value: 0 }, uFade: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }), []);
  const ember = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff7a2a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  const burning = useRef<THREE.Group>(null);
  useLayoutEffect(() => () => { smoke.dispose(); ember.dispose(); }, [smoke, ember]);
  useFrame(({ clock }) => {
    if (!burning.current?.visible) return;
    const t = clock.elapsedTime;
    born.current ??= t;
    const left = 1 - (t - born.current) / BURN_S;
    if (left <= 0) { burning.current.visible = false; return; }
    smoke.uniforms.uTime.value = t;
    smoke.uniforms.uFade.value = Math.min(1, left * 1.5);
    ember.opacity = left * (0.55 + 0.45 * Math.sin(t * 9 + data.gridX));
  });

  return (
    <group>
      {/* The broken ground-floor slab, and soot over it and spilling past its edge. */}
      <mesh position={[0, 0.06, 0]} material={floorMaterial} receiveShadow raycast={() => null}>
        <boxGeometry args={segment ? [w, 0.12, d] : [w - 0.4, 0.12, d - 0.4]} />
      </mesh>
      <mesh position={[0, 0.14, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[w * 1.3, d * 1.3]} />
        <meshBasicMaterial map={sootTexture()} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      {layout.walls && <mesh geometry={layout.walls} material={debrisMaterial} castShadow receiveShadow raycast={() => null} />}
      {layout.rubble && <mesh geometry={layout.rubble} material={debrisMaterial} castShadow receiveShadow raycast={() => null} />}
      {layout.rebar && <mesh geometry={layout.rebar} material={rebarMaterial} raycast={() => null} />}
      <group ref={burning}>
        {layout.embers.map((at, i) => (
          <mesh key={i} position={at as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]} material={ember} raycast={() => null}>
            <circleGeometry args={[0.7, 10]} />
          </mesh>
        ))}
        {[0, Math.PI / 2].map(r => (
          <mesh key={r} position={[0, 11, 0]} rotation={[0, r, 0]} material={smoke} raycast={() => null}>
            <planeGeometry args={[10, 20]} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

// Every crater on the map: scorched decals on the ground, just above the roads.
const CRATER_Y = 0.36;
export const Craters: React.FC<{ craters: readonly Crater[] }> = ({ craters }) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: craterTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), []);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new THREE.Object3D();
    craters.forEach((c, i) => {
      o.position.set(c.x, CRATER_Y, c.z);
      o.rotation.set(-Math.PI / 2, 0, c.turn);
      o.scale.set(c.r * 2, c.r * 2, 1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.count = craters.length;
    m.instanceMatrix.needsUpdate = true;
  }, [craters]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, CRATER.max]} material={material} raycast={() => null} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  );
};
