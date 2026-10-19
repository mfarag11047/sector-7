// What a signal-jammed unit looks like (sim/jamming.ts): a cloud of flickering TV static
// hanging round it, the way a jammer fuzzes out a drone feed, and a "no signal" glyph beside it
// (clear of the role badge above).
//
// The static is a sprite whose noise texture jumps to a new random patch every frame, under a
// fixed soft round mask so the cloud keeps its shape. Every jammed unit shares the same two
// textures, so a whole jammed swarm costs about the same as one.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

let noise: THREE.CanvasTexture | null = null;
function noiseTexture() {
  if (noise) return noise;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    // Now and then a brighter or darker line, like a rolling picture.
    const band = Math.random() < 0.06 ? (Math.random() < 0.5 ? 0.45 : 1.5) : 1;
    for (let x = 0; x < 256; x++) {
      const v = Math.min(255, Math.random() * 255 * band);
      const i = (y * 256 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = Math.min(255, v * 1.08);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  noise = new THREE.CanvasTexture(c);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = THREE.NearestFilter;
  noise.minFilter = THREE.NearestFilter;
  noise.repeat.set(0.5, 0.5);
  return noise;
}

// A soft round mask with a ragged edge, so the cloud doesn't look like a disc.
let mask: THREE.CanvasTexture | null = null;
function maskTexture() {
  if (mask) return mask;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#bbbbbb');
  grad.addColorStop(1, '#000000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  mask = new THREE.CanvasTexture(c);
  return mask;
}

// Signal bars with a red slash through them.
let glyph: THREE.CanvasTexture | null = null;
function glyphTexture() {
  if (glyph) return glyph;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(15,23,42,0.85)';
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#e2e8f0';
  [[14, 40], [24, 32], [34, 24], [44, 16]].forEach(([x, top]) => g.fillRect(x, top, 7, 46 - top));
  g.strokeStyle = '#ef4444';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(12, 12);
  g.lineTo(52, 52);
  g.stroke();
  glyph = new THREE.CanvasTexture(c);
  return glyph;
}

let staticMaterial: THREE.SpriteMaterial | null = null;
const getStaticMaterial = () => staticMaterial ??= new THREE.SpriteMaterial({
  map: noiseTexture(), alphaMap: maskTexture(), color: '#f8fafc', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
});
let glyphMaterial: THREE.SpriteMaterial | null = null;
const getGlyphMaterial = () => glyphMaterial ??= new THREE.SpriteMaterial({ map: glyphTexture(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false });

// The noise jumps once a frame however many jammed units there are.
let lastShuffle = -1;

export const JamStatic: React.FC<{ size: number }> = ({ size }) => {
  const cloud = useRef<THREE.Sprite>(null);
  const icon = useRef<THREE.Sprite>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t !== lastShuffle) {
      lastShuffle = t;
      noiseTexture().offset.set(Math.random(), Math.random());
      // The picture fades in and out a little as the jammer's noise rolls.
      getStaticMaterial().opacity = 0.7 + Math.random() * 0.3;
    }
    if (cloud.current) {
      const s = size * 3.4 * (0.94 + Math.random() * 0.12);
      cloud.current.scale.set(s, s, 1);
    }
    // The glyph pulses, never quite going out.
    getGlyphMaterial().opacity = 0.65 + 0.35 * Math.abs(Math.sin(t * 4));
  });
  return (
    <group>
      <sprite ref={cloud} position={[0, size * 0.6, 0]} material={getStaticMaterial()} raycast={() => null} renderOrder={4} />
      <sprite ref={icon} position={[size * 1.5, size * 1.4, 0]} scale={[4.5, 4.5, 1]} material={getGlyphMaterial()} raycast={() => null} renderOrder={21} />
    </group>
  );
};
