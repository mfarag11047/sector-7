// Ground storeys and cladding by era (eras.ts), drawn on each outside face by FootprintBuilding.tsx.
//
// Frontage, the ground storey, in the era it was last done up:
//   1  utilitarian   roller shutters in bare concrete, some half up with light under them, a
//                    caged lamp, tags sprayed on
//   2  mass-market   lit shopfronts under a rounded pastel awning, and an oversized sign bolted
//                    above
//   3  corporate     a tall lobby of dark tinted glass under a slanted canopy, a stark light
//                    strip beneath it
//   4  ultra-elite   warm marble with a champagne trim line, planters of dark shrubs
//
// Cladding: the corporate era's panels over the middle floors, big chamfered shapes in two dark
// tones with the windows showing through slots between them.
//
// Every texture repeats in world units and lines up across tiles, like the windows. Colours keep
// to the scenery palette (scenePalette.ts): no cyan, amber, white or green.

import React, { useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { canvas } from './corpoFacades';
import { SCENE, SHOP_SIGNS } from './scenePalette';
import { CLADDING, type Era } from './eras';

// How tall each era's ground storey stands.
export const FRONTAGE_HEIGHT: Record<Era, number> = { 1: 3.4, 2: 3.4, 3: 5, 4: 4.2 };
// How far each texture runs along the wall before it repeats (world units).
const REPEAT = { shutters: 8, shops: 8, lobby: 6, marble: 10, cladding: 14 };

// --- Textures, drawn once ---

let shutterMat: THREE.MeshBasicMaterial | null = null;
const shutterMaterial = () => shutterMat ??= new THREE.MeshBasicMaterial({
  map: canvas(128, (g, rnd) => {
    // Concrete, a lintel band along the top.
    g.fillStyle = '#2b2a28'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#1f1e1d'; g.fillRect(0, 0, 128, 18);
    for (let bay = 0; bay < 2; bay++) {
      const x = bay * 64 + 6, w = 52;
      // How far the shutter is up: most down, some part up with the light inside showing.
      const up = rnd() < 0.35 ? 18 + rnd() * 30 : 0;
      const light = g.createLinearGradient(0, 128 - up, 0, 128);
      light.addColorStop(0, 'rgba(255,170,90,0.9)');
      light.addColorStop(1, 'rgba(160,80,40,0.8)');
      if (up) { g.fillStyle = light; g.fillRect(x, 128 - up, w, up); }
      // The shutter's ribs.
      for (let y = 24; y < 128 - up; y += 4) {
        g.fillStyle = y % 8 ? '#4a4846' : '#3a3836';
        g.fillRect(x, y, w, 4);
      }
      g.fillStyle = '#5a554f'; g.fillRect(x - 2, 22, w + 4, 4);
    }
    // Tags sprayed on the shutters and walls.
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = [SCENE.pink, SCENE.coral, SCENE.magenta, '#8a8f99'][i];
      g.globalAlpha = 0.55; g.lineWidth = 2 + rnd() * 2;
      g.beginPath();
      let x = rnd() * 110, y = 60 + rnd() * 50;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += 3 + rnd() * 6; y += (rnd() - 0.5) * 16; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  }, 4242),
});

let shopMat: THREE.MeshBasicMaterial | null = null;
// The boom's shopfronts: glass bays lit warm or pink, each with a curved top.
const kitschShopMaterial = () => shopMat ??= new THREE.MeshBasicMaterial({
  toneMapped: false,
  map: canvas(128, (g, rnd) => {
    g.fillStyle = '#17121c'; g.fillRect(0, 0, 128, 128);
    for (let bay = 0; bay < 4; bay++) {
      const x = bay * 32 + 4, w = 24;
      const tint = [['rgba(255,190,140,0.9)', 'rgba(170,90,60,0.7)'], ['rgba(255,150,210,0.85)', 'rgba(140,50,110,0.7)'], ['rgba(220,170,255,0.8)', 'rgba(110,70,150,0.7)']][Math.floor(rnd() * 3)];
      const glass = g.createLinearGradient(0, 30, 0, 128);
      glass.addColorStop(0, tint[0]); glass.addColorStop(1, tint[1]);
      g.fillStyle = glass;
      // A rounded top to every bay.
      g.beginPath(); g.moveTo(x, 128); g.lineTo(x, 40); g.arc(x + w / 2, 40, w / 2, Math.PI, 0); g.lineTo(x + w, 128); g.closePath(); g.fill();
      g.fillStyle = 'rgba(23,18,28,0.9)'; g.fillRect(x + w / 2 - 1, 40, 2, 88);
    }
  }, 9090),
});

let lobbyMat: THREE.MeshStandardMaterial | null = null;
// Tall panes of dark tinted glass between heavy mullions, a cold glow deep inside.
const lobbyMaterial = () => lobbyMat ??= new THREE.MeshStandardMaterial({
  metalness: 0.9, roughness: 0.15, emissive: '#ffffff', emissiveIntensity: 0.55,
  ...(() => {
    const map = canvas(128, g => {
      g.fillStyle = '#0d0f16'; g.fillRect(0, 0, 128, 128);
      for (let p = 0; p < 2; p++) {
        const glow = g.createLinearGradient(0, 128, 0, 10);
        glow.addColorStop(0, 'rgba(70,80,150,0.9)'); glow.addColorStop(1, 'rgba(20,22,40,0.9)');
        g.fillStyle = glow; g.fillRect(p * 64 + 6, 10, 52, 118);
      }
      g.fillStyle = '#05060a';
      for (let x = 0; x <= 128; x += 64) g.fillRect(x - 3, 0, 6, 128);
      g.fillRect(0, 0, 128, 8);
    }, 31);
    return { map, emissiveMap: map };
  })(),
});

let marbleMat: THREE.MeshStandardMaterial | null = null;
// Warm ivory marble in big slabs, veined grey.
const marbleMaterial = () => marbleMat ??= new THREE.MeshStandardMaterial({
  roughness: 0.25, metalness: 0.1,
  map: canvas(256, (g, rnd) => {
    g.fillStyle = '#b9ae98'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(90,84,76,${0.15 + rnd() * 0.3})`; g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      let x = rnd() * 256, y = 0;
      g.moveTo(x, y);
      while (y < 256) { x += (rnd() - 0.5) * 30; y += 10 + rnd() * 20; g.lineTo(x, y); }
      g.stroke();
    }
    // The joints between slabs.
    g.fillStyle = 'rgba(60,56,50,0.5)';
    for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 2, 256);
  }, 5150),
});

const signMats: THREE.MeshBasicMaterial[] = [];
// An oversized sign: blocky letters in pastel neon on dark, a bright border.
const signMaterial = (i: number) => signMats[i] ??= new THREE.MeshBasicMaterial({
  toneMapped: false,
  map: canvas(128, (g, rnd) => {
    const c = SHOP_SIGNS[i % SHOP_SIGNS.length];
    g.fillStyle = '#120d18'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = c; g.lineWidth = 8; g.strokeRect(6, 6, 116, 116);
    g.fillStyle = c;
    const n = 3 + Math.floor(rnd() * 3), w = 96 / n;
    for (let k = 0; k < n; k++) g.fillRect(16 + k * w, 36 + rnd() * 10, w * 0.7, 40 + rnd() * 16);
  }, 600 + i * 17),
});

const claddingMats = new Map<string, THREE.MeshStandardMaterial>();
// The corporate era's panels: big shapes with their corners cut at 45 degrees in two dark tones,
// seams between them, and slots left for the windows to show through.
// `scheme` is [panel, accent panel] (one of eras.ts CLADDING, or a centerpiece's own).
export const claddingMaterial = (scheme: readonly [string, string]) => {
  const key = scheme.join();
  let m = claddingMats.get(key);
  if (m) return m;
  const [base, accent] = scheme;
  const seed = parseInt(base.slice(1, 4), 16);
  const map = canvas(256, (g, rnd) => {
    g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    // Two big chamfered panels in the accent tone.
    const panel = (x: number, y: number, w: number, h: number, c: number) => {
      g.beginPath();
      g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c);
      g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c);
      g.closePath(); g.fill();
    };
    g.fillStyle = accent;
    panel(8, 20, 110, 150, 34);
    panel(140, 110, 108, 140, 30);
    g.fillRect(118, 70, 22, 18);
    // Seams.
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let y = 0; y < 256; y += 64) g.fillRect(0, y, 256, 2);
    for (let x = 0; x < 256; x += 128) g.fillRect(x, 0, 2, 256);
    // Window slots, in columns, cut right through.
    for (let col = 0; col < 4; col++) {
      if (rnd() < 0.25) continue;
      const x = col * 64 + 22;
      for (let y = 8; y < 256; y += 32) if (rnd() > 0.2) g.clearRect(x, y, 20, 20);
    }
  }, 7700 + seed);
  m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, metalness: 0.35, roughness: 0.75, polygonOffset: true, polygonOffsetFactor: -1 });
  claddingMats.set(key, m);
  return m;
};
export const CLADDING_REPEAT = REPEAT.cladding;

const std = (color: string, metalness: number, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
const M = {
  awning: [SCENE.pink, SCENE.magenta, SCENE.coral, SCENE.hotPink].map(c => std(c, 0.2, 0.5, { emissive: c, emissiveIntensity: 0.45 })),
  dark: std('#121318', 0.6, 0.5),
  canopy: std('#1a1c22', 0.7, 0.4),
  champagne: std('#a8966a', 0.9, 0.3),
  planter: std('#3b3833', 0.2, 0.8),
  leaves: std('#2c3528', 0, 0.95),
  lamp: new THREE.MeshBasicMaterial({ color: '#ffb070', toneMapped: false }),
  strip: new THREE.MeshBasicMaterial({ color: SCENE.blue, toneMapped: false }),
};

// A plane `width` x `height`, its texture coordinates in world units from (u0, v0).
function plane(width: number, height: number, u0: number, repeat: number, vRepeat = height) {
  const geo = new THREE.PlaneGeometry(width, height);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + (uv.getX(i) * width) / repeat, (uv.getY(i) * height) / vRepeat);
  return geo;
}

// One outside face's ground storey, in the face's own coordinates: centred on x = 0, the wall at
// z = 0 with +z out to the street, from the ground up. `start` is where the face starts along
// the wall in world units (for lining up the textures); `hash` in [0, 1) varies its details, and
// `tone` in [0, 1) picks the building's awning colour, the same on all its faces.
export const FrontageFace: React.FC<{ era: Era; width: number; start: number; hash: number; tone: number }> = ({ era, width, start, hash, tone }) => {
  const H = FRONTAGE_HEIGHT[era];
  const geometry = useMemo(() => {
    const repeat = era === 1 ? REPEAT.shutters : era === 2 ? REPEAT.shops : era === 3 ? REPEAT.lobby : REPEAT.marble;
    return plane(width, H, start / repeat, repeat, era === 4 ? REPEAT.marble : H);
  }, [era, width, start, H]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  const face = <mesh geometry={geometry} position={[0, H / 2 + 0.05, 0.07]} material={era === 1 ? shutterMaterial() : era === 2 ? kitschShopMaterial() : era === 3 ? lobbyMaterial() : marbleMaterial()} />;
  if (era === 1) return (
    <group>
      {face}
      {hash < 0.6 && <mesh position={[(hash - 0.3) * width, H - 0.5, 0.3]} material={M.lamp}><boxGeometry args={[0.35, 0.35, 0.35]} /></mesh>}
    </group>
  );
  if (era === 2) {
    const signW = Math.min(width * 0.6, 6);
    return (
      <group>
        {face}
        {/* A rounded awning along the shopfronts. */}
        <mesh position={[0, H + 0.05, 0.75]} rotation={[0, 0, Math.PI / 2]} material={M.awning[Math.floor(tone * M.awning.length)]}>
          <cylinderGeometry args={[0.75, 0.75, width * 0.98, 10, 1, false, 0, Math.PI]} />
        </mesh>
        {/* An oversized sign bolted on above, on some stretches. */}
        {hash < 0.55 && (
          <group position={[(hash - 0.27) * (width - signW), H + 2.1, 0.45]}>
            <mesh material={M.dark}><boxGeometry args={[signW + 0.3, 2.1, 0.4]} /></mesh>
            <mesh position={[0, 0, 0.21]} material={signMaterial(Math.floor(hash * 97) % 6)}><planeGeometry args={[signW, 1.8]} /></mesh>
          </group>
        )}
      </group>
    );
  }
  if (era === 3) return (
    <group>
      {face}
      {/* A slanted canopy overhanging the street, a stark strip of light under its edge. */}
      <mesh position={[0, H + 0.35, 1.2]} rotation={[0.2, 0, 0]} material={M.canopy}><boxGeometry args={[width, 0.3, 2.6]} /></mesh>
      <mesh position={[0, H + 0.02, 2.35]} material={M.strip}><boxGeometry args={[width * 0.92, 0.08, 0.14]} /></mesh>
    </group>
  );
  return (
    <group>
      {face}
      <mesh position={[0, H + 0.1, 0.12]} material={M.champagne}><boxGeometry args={[width, 0.2, 0.22]} /></mesh>
      {[-0.28, 0.28].map(k => (
        <group key={k} position={[k * width, 0, 0.9]}>
          <mesh position={[0, 0.4, 0]} material={M.planter}><boxGeometry args={[1.6, 0.8, 1]} /></mesh>
          <mesh position={[0, 1.4, 0]} material={M.leaves}><icosahedronGeometry args={[0.75, 0]} /></mesh>
        </group>
      ))}
    </group>
  );
};

// Bolted-on conduit up an era-1 wall: a pipe from the ground to the roof and a junction box.
const conduit = std('#55595e', 0.8, 0.4);
export const Conduit: React.FC<{ x: number; height: number }> = ({ x, height }) => (
  <group position={[x, 0, 0.3]}>
    <mesh position={[0, height / 2, 0]} material={conduit}><cylinderGeometry args={[0.18, 0.18, height, 6]} /></mesh>
    <mesh position={[0.35, Math.min(2.4, height * 0.5), 0.05]} material={M.dark}><boxGeometry args={[0.9, 1.1, 0.4]} /></mesh>
  </group>
);
