// The unit kit's palette and materials, shared by every unit built from it. The look is clean and
// stylised: flat-shaded, untextured plates whose shapes carry the detail, light grey armour over
// dark running gear, team colour as accent bands, and glowing light panels.
//
// Materials are cached and shared between units; a cloak tints copies, never these (Unit.tsx).
// Anything a unit animates on its own material (a scrolling track, a pulsing core) takes a copy
// (`own`). Plates are kept matte: the scene has no environment map, so metal has nothing to
// reflect and very metallic plates render near black.

import * as THREE from 'three';
import { treadMap } from './textures';

export const PALETTE = {
  // Armour and materials.
  armour: '#8d96a3',        // light grey: main plates
  armourDark: '#4b525d',    // slate: lower hull, secondary plates
  steel: '#b9c1cb',         // bright metal: rails, pistons, barrels
  black: '#1c1e22',         // rubber, deep recesses, vents
  // Lights.
  cyan: '#22d3ee',          // standard army
  amber: '#f59e0b',         // Heavy Metal
  green: '#39ff6a',         // Shadow Ops
  magenta: '#e040fb',       // Netrunner
  repair: '#4ade80',        // repair beams and emitters
  warning: '#ff2a2a',
  headlight: '#e0f7ff',
};

export type KitMaterial = 'armour' | 'armourDark' | 'steel' | 'black' | 'tread';

const cache = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); cache.set(key, m); }
  return m;
};

// A flat-shaded plate: each face one even tone, so edges and bevels read crisply.
const plate = (color: string, metalness: number, roughness: number) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true });

export function kitMaterial(kind: KitMaterial): THREE.MeshStandardMaterial {
  return cached(kind, () => {
    switch (kind) {
      case 'armour': return plate(PALETTE.armour, 0.15, 0.6);
      case 'armourDark': return plate(PALETTE.armourDark, 0.15, 0.65);
      case 'steel': return plate(PALETTE.steel, 0.4, 0.4);
      case 'black': return plate(PALETTE.black, 0.1, 0.85);
      case 'tread': return new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.1, roughness: 0.85, map: treadMap() });
    }
  }) as THREE.MeshStandardMaterial;
}

// Team paint: the side's colour as a plate.
export const teamPaint = (color: string) => cached(`team:${color}`, () => plate(color, 0.1, 0.5));

// A light: unlit, full colour, glowing under the scene's tone mapping.
export const glow = (color: string, opacity = 1) => cached(`glow:${color}:${opacity}`, () =>
  new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));

// A copy for one unit to animate (and dispose of) on its own, with its own copy of any texture
// whose offset it moves.
export function own<T extends THREE.Material>(material: T, ownMap = false): T {
  const m = material.clone() as T;
  const std = m as unknown as THREE.MeshStandardMaterial;
  if (ownMap && std.map) std.map = std.map.clone();
  return m;
}
