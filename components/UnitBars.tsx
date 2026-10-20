// A unit's health and battery bars, drawn in the 3D scene at a fixed size on screen at any zoom
// (like the role badges), instead of HTML laid over the canvas.
//
// HTML bars cost a DOM element per unit that drei repositions every frame. In a big fight most
// units are damaged and every vehicle off the grid is draining its battery, so that was a hundred
// or more elements moved on every frame, and the frame rate went with them. Here the whole stack
// of bars is one quad drawn by a small shader: one draw call per unit, the levels as uniforms.

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// Sizes in the same screen units as a sprite with sizeAttenuation off (fractions of the view
// height): about 32 by 4 pixels a bar, like the old HTML bars.
const WIDTH = 0.034;
const HEIGHT = 0.0045;
const BORDER = 0.0011;
const GAP = 0.002;
const BOLT = 0.011;
const MAX_BARS = 3;

export const METER_COLORS = { hp: '#22d3ee', battery: '#fbbf24', secondary: '#e879f9' } as const;
export interface Meter { ratio: number; color: string }

const BAR_H = HEIGHT + 2 * BORDER;
const blockHeight = (n: number) => n * BAR_H + Math.max(0, n - 1) * GAP;

const vertexShader = /* glsl */ `
  uniform vec2 uSize;
  uniform vec2 uOffset;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // As three.js draws a sprite without size attenuation: a fixed size on screen, facing the camera.
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += (position.xy * uSize + uOffset) * -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec2 uSize;
  uniform int uCount;
  uniform vec3 uRatios;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  varying vec2 vUv;
  const float W = ${WIDTH.toFixed(5)};
  const float H = ${HEIGHT.toFixed(5)};
  const float B = ${BORDER.toFixed(5)};
  const float G = ${GAP.toFixed(5)};
  void main() {
    vec2 p = vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y);   // from the top-left corner
    float pitch = H + 2.0 * B + G;
    int i = int(floor(p.y / pitch));
    float y = p.y - float(i) * pitch;
    if (i >= uCount || y > H + 2.0 * B) discard;                // the gap between bars
    // The bar's cyan edge.
    if (p.x < B || p.x > W + B || y < B || y > H + B) { gl_FragColor = vec4(0.40, 0.91, 0.98, 0.5); return; }
    float ratio = i == 0 ? uRatios.x : i == 1 ? uRatios.y : uRatios.z;
    vec3 color = i == 0 ? uColor0 : i == 1 ? uColor1 : uColor2;
    float x = (p.x - B) / W;
    // Fill with the HTML bars' fine notches, over a dark track.
    float notch = step(0.75, fract(x * 8.0)) * 0.6;
    gl_FragColor = x <= ratio ? vec4(color * (1.0 - notch), 1.0) : vec4(0.02, 0.03, 0.06, 0.92);
  }
`;

let boltTexture: THREE.Texture | null = null;
// The charging bolt, drawn once into a small canvas.
function bolt(): THREE.Texture {
  if (boltTexture) return boltTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#facc15';
  g.font = 'bold 26px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('⚡', 16, 17);
  boltTexture = new THREE.CanvasTexture(canvas);
  return boltTexture;
}

const quad = new THREE.PlaneGeometry(1, 1);
const noRaycast = () => null;

export const UnitBars: React.FC<{ y: number; meters: Meter[]; charging: boolean }> = ({ y, meters, charging }) => {
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
    uniforms: {
      uSize: { value: new THREE.Vector2() }, uOffset: { value: new THREE.Vector2() }, uCount: { value: 0 },
      uRatios: { value: new THREE.Vector3() },
      uColor0: { value: new THREE.Color() }, uColor1: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() },
    },
  }), []);
  useEffect(() => () => material.dispose(), [material]);

  const shown = meters.slice(0, MAX_BARS);
  const n = shown.length;
  const u = material.uniforms;
  const total = blockHeight(n);
  u.uSize.value.set(WIDTH + 2 * BORDER, total);
  // Centred on the first bar, the rest stacking downward, as the HTML bars did.
  u.uOffset.value.set(0, -(total - BAR_H) / 2);
  u.uCount.value = n;
  const level = (i: number) => Math.max(0, Math.min(1, shown[i]?.ratio ?? 0));
  u.uRatios.value.set(level(0), level(1), level(2));
  [u.uColor0, u.uColor1, u.uColor2].forEach((c, i) => c.value.set(shown[i]?.color ?? '#000000'));

  const boltCenter = useMemo(() => new THREE.Vector2(-(WIDTH / 2 + 0.001) / BOLT, -(HEIGHT / 2) / BOLT), []);
  return (
    <group position={[0, y, 0]}>
      {n > 0 && <mesh geometry={quad} material={material} renderOrder={19} frustumCulled={false} raycast={noRaycast} />}
      {charging && (
        // Just past the right end of the top bar, sitting on it.
        <sprite center={boltCenter} scale={[BOLT, BOLT, 1]} renderOrder={21} raycast={noRaycast}>
          <spriteMaterial map={bolt()} sizeAttenuation={false} depthTest={false} depthWrite={false} transparent toneMapped={false} />
        </sprite>
      )}
    </group>
  );
};
