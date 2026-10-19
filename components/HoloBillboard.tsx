// Holographic billboards on the downtown towers.
//
// Two kinds: a wide panel hung just off a facade, and a tall blade sign sticking straight out
// from it. Every billboard shares one texture atlas of adverts and one material, whose shader adds
// the hologram look: scanlines rolling down, a flicker, and now and then a glitch that tears a
// band of the image sideways. Each billboard flickers on its own timing, keyed off where it
// stands, so the street doesn't pulse in unison.

import React from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// The adverts: corporate names from the city's towers and street businesses.
const ADS: { title: string; glyphs: string; color: string; glow: string }[] = [
  { title: 'TOKUGEN', glyphs: '徳源', color: '#f472b6', glow: '#db2777' },
  { title: 'NEXUM', glyphs: 'ネクサム', color: '#22d3ee', glow: '#0891b2' },
  { title: 'AXIOM', glyphs: '公理', color: '#fbbf24', glow: '#d97706' },
  { title: 'VANTA', glyphs: '漆黒', color: '#a78bfa', glow: '#7c3aed' },
  { title: 'NOODLES', glyphs: 'ラーメン', color: '#f87171', glow: '#dc2626' },
  { title: 'SYNTH SAKE', glyphs: '合成酒', color: '#4ade80', glow: '#16a34a' },
];
export const AD_COUNT = ADS.length;

const CELL_W = 256;
const CELL_H = 512;

let atlas: THREE.CanvasTexture | null = null;
function adAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL_W * ADS.length;
  c.height = CELL_H;
  const g = c.getContext('2d')!;
  ADS.forEach((ad, i) => {
    const x0 = i * CELL_W;
    // Faint fill so the sign reads as a lit pane, brighter at the edges.
    const fill = g.createLinearGradient(x0, 0, x0 + CELL_W, 0);
    fill.addColorStop(0, ad.glow + 'aa');
    fill.addColorStop(0.5, ad.glow + '55');
    fill.addColorStop(1, ad.glow + 'aa');
    g.fillStyle = fill;
    g.fillRect(x0, 0, CELL_W, CELL_H);
    g.strokeStyle = ad.color;
    g.lineWidth = 8;
    g.strokeRect(x0 + 8, 8, CELL_W - 16, CELL_H - 16);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = ad.color;
    g.shadowBlur = 18;
    g.fillStyle = ad.color;
    // The glyphs run top to bottom, like a street sign.
    const glyphs = [...ad.glyphs];
    const step = Math.min(96, 330 / glyphs.length);
    g.font = `bold ${Math.floor(step * 0.9)}px sans-serif`;
    glyphs.forEach((ch, j) => g.fillText(ch, x0 + CELL_W / 2, 50 + step / 2 + j * step));
    g.font = `bold ${ad.title.length > 7 ? 30 : 40}px monospace`;
    g.fillStyle = '#ffffff';
    g.fillText(ad.title, x0 + CELL_W / 2, CELL_H - 80);
    g.shadowBlur = 0;
    g.fillStyle = ad.color;
    g.fillRect(x0 + 40, CELL_H - 45, CELL_W - 80, 6);
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}

const holoTime = { value: 0 };
let material: THREE.ShaderMaterial | null = null;
function holoMaterial() {
  if (material) return material;
  material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: adAtlas() }, uTime: holoTime },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vSeed;
      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vSeed = fract(sin(dot(modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uTime;
      varying vec2 vUv;
      varying float vSeed;
      float hash(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float t = uTime + vSeed * 37.0;
        vec2 uv = vUv;
        // Now and then a band of the image tears sideways for a moment.
        float glitching = step(0.93, hash(floor(t * 3.0)));
        float band = step(abs(fract(vUv.y * 0.5 + hash(floor(t * 7.0))) - 0.5), 0.06);
        uv.x += glitching * band * (hash(floor(t * 23.0)) - 0.5) * 0.04;
        vec4 c = texture2D(uMap, uv);
        float scan = 0.72 + 0.28 * sin(vUv.y * 420.0 - t * 9.0);
        float flicker = 0.85 + 0.15 * step(0.5, hash(floor(t * 14.0)));
        flicker *= 1.0 - 0.6 * step(0.985, hash(floor(t * 5.0) + 3.0));
        float a = c.a * scan * flicker;
        gl_FragColor = vec4(c.rgb * scan * flicker * 2.4, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return material;
}

// A plane showing one advert from the atlas.
const geometries = new Map<string, THREE.PlaneGeometry>();
function adGeometry(ad: number, width: number, height: number) {
  const k = `${ad}:${width.toFixed(2)}:${height.toFixed(2)}`;
  let geo = geometries.get(k);
  if (!geo) {
    geo = new THREE.PlaneGeometry(width, height);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (ad + uv.getX(i)) / ADS.length);
    geometries.set(k, geo);
  }
  return geo;
}

const strutMaterial = new THREE.MeshStandardMaterial({ color: '#1e293b', metalness: 0.8, roughness: 0.3 });

// A billboard on a facade. `position` is the middle of the facade spot it hangs from, `rot`
// turns +z to face out from the building.
export const HoloBillboard: React.FC<{
  kind: 'panel' | 'blade';
  ad: number;
  width: number;
  height: number;
  position: [number, number, number];
  rot: number;
}> = ({ kind, ad, width, height, position, rot }) => {
  useFrame(({ clock }) => { holoTime.value = clock.elapsedTime; });
  if (kind === 'panel') {
    return (
      <group position={position} rotation={[0, rot, 0]}>
        <mesh position={[0, 0, 1.2]} geometry={adGeometry(ad, width, height)} material={holoMaterial()} renderOrder={5} />
        {[-1, 1].map(s => (
          <mesh key={s} position={[s * width * 0.4, 0, 0.6]} material={strutMaterial}>
            <boxGeometry args={[0.2, 0.2, 1.2]} />
          </mesh>
        ))}
      </group>
    );
  }
  // A blade sign: narrow and tall, standing out from the wall on an arm top and bottom.
  return (
    <group position={position} rotation={[0, rot, 0]}>
      <mesh position={[0, 0, width / 2 + 0.6]} rotation={[0, Math.PI / 2, 0]} geometry={adGeometry(ad, width, height)} material={holoMaterial()} renderOrder={5} />
      {[-1, 1].map(s => (
        <mesh key={s} position={[0, s * height * 0.45, (width + 0.6) / 2]} material={strutMaterial}>
          <boxGeometry args={[0.2, 0.2, width + 0.6]} />
        </mesh>
      ))}
    </group>
  );
};
