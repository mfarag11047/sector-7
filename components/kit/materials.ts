// The unit kit's palette and materials (the art bible's colours), shared by every unit built from
// it. Materials are cached and shared between units; a cloak tints copies, never these
// (Unit.tsx). Anything a unit animates on its own material (a scrolling track, a pulsing core)
// takes a copy (`own`).

import * as THREE from 'three';
import { armourBumpMap, armourDetailMap, grilleMap, hazardMap, treadMap } from './textures';

export const PALETTE = {
  // Armour and materials.
  armour: '#6c7684',        // gunmetal: main plates
  armourDark: '#434b57',    // charcoal: lower hull, secondary plates
  steel: '#9aa3ad',         // brushed steel: joints, rails, pistons
  black: '#17191c',         // rubber, cloth, deep recesses
  hazard: '#f2c230',
  // Lights.
  cyan: '#22d3ee',          // standard army
  amber: '#f59e0b',         // Heavy Metal
  green: '#39ff6a',         // Shadow Ops
  magenta: '#e040fb',       // Netrunner
  warning: '#ff2a2a',
  headlight: '#e0f7ff',
};

export type KitMaterial = 'armour' | 'armourDark' | 'steel' | 'black' | 'tread' | 'hazard' | 'grille';

const cache = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); cache.set(key, m); }
  return m;
};

// Painted, worn armour plate in `color`. Kept mostly matte: the scene has no environment map, so
// metal has nothing to reflect and very metallic plates render near black.
const armourPlate = (color: string, metalness: number, roughness: number) => new THREE.MeshStandardMaterial({
  color, metalness, roughness, map: armourDetailMap(), bumpMap: armourBumpMap(), bumpScale: 0.7,
});

export function kitMaterial(kind: KitMaterial): THREE.MeshStandardMaterial {
  return cached(kind, () => {
    switch (kind) {
      case 'armour': return armourPlate(PALETTE.armour, 0.25, 0.55);
      case 'armourDark': return armourPlate(PALETTE.armourDark, 0.2, 0.6);
      case 'steel': return new THREE.MeshStandardMaterial({ color: PALETTE.steel, metalness: 0.5, roughness: 0.35, map: armourDetailMap() });
      case 'black': return new THREE.MeshStandardMaterial({ color: PALETTE.black, metalness: 0.2, roughness: 0.85 });
      case 'tread': return new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.2, roughness: 0.75, map: treadMap() });
      case 'hazard': return new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.2, roughness: 0.6, map: hazardMap() });
      case 'grille': return new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.3, roughness: 0.55, map: grilleMap() });
    }
  }) as THREE.MeshStandardMaterial;
}

// Team paint: the side's colour on the same worn plate.
export const teamPaint = (color: string) => cached(`team:${color}`, () => armourPlate(color, 0.15, 0.5));

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
