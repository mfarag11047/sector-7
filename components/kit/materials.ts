// The unit kit's palette and materials, shared by every unit built from it. The look is simple but
// military: flat-shaded, untextured plates whose shapes carry the detail, olive drab armour over dark
// running gear, team colour as stripes and markings, and a few small lights. Parts take the material
// they would be made of, so a unit isn't one flat colour: armour plate, dark composite fenders and
// guards, pale equipment housings, bright metal, rubber.
//
// Materials are cached and shared between units; a cloak tints copies, never these (Unit.tsx).
// Anything a unit animates on its own material (a scrolling track, a pulsing core) takes a copy
// (`own`). Plates are kept matte: the scene has no environment map, so metal has nothing to
// reflect and very metallic plates render near black.

import * as THREE from 'three';
import { treadMap } from './textures';

export const PALETTE = {
  // Armour and materials.
  armour: '#66704d',        // olive drab: main plates
  armourDark: '#454d35',    // dark olive: lower hull, secondary plates
  steel: '#aab1b9',         // bright metal: rails, pistons, barrels
  black: '#1c1e22',         // rubber, deep recesses, vents
  composite: '#363a2f',     // dark olive-grey polymer: skirts, fenders, bumpers, guards
  housing: '#8e917a',       // pale khaki-grey: sensor and system housings
  // Lights.
  cyan: '#22d3ee',          // standard army
  amber: '#f59e0b',         // Heavy Metal
  green: '#39ff6a',         // Shadow Ops
  magenta: '#e040fb',       // Netrunner
  repair: '#4ade80',        // repair beams and emitters
  power: '#facc15',         // battery power: cells, charging links
  warning: '#ff2a2a',
  headlight: '#e0f7ff',
};

export type KitMaterial = 'armour' | 'armourDark' | 'steel' | 'black' | 'composite' | 'housing' | 'tread';

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
      case 'composite': return plate(PALETTE.composite, 0.05, 0.9);
      case 'housing': return plate(PALETTE.housing, 0.1, 0.5);
      case 'tread': return new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.1, roughness: 0.85, map: treadMap() });
    }
  }) as THREE.MeshStandardMaterial;
}

// A kit material smooth-shaded, for rounded parts that should read as curved rather than faceted
// (an infantryman's limbs and helmet).
export const smoothMaterial = (kind: Exclude<KitMaterial, 'tread'>) => cached(`smooth:${kind}`, () => {
  const m = kitMaterial(kind).clone();
  m.flatShading = false;
  return m;
});

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
