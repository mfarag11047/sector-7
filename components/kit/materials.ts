// The unit kit's palette and materials, shared by every unit built from it. The look is simple but
// military: flat-shaded, untextured plates whose shapes carry the detail, olive drab armour over dark
// running gear, team colour as stripes and markings, and a few small lights. Parts take the material
// they would be made of, so a unit isn't one flat colour: armour plate, dark composite fenders and
// guards, pale equipment housings, bright metal, rubber.
//
// Materials are cached and shared between units; a cloak tints copies, never these (Unit.tsx).
// Anything a unit animates on its own material (a scrolling track, a pulsing core) takes a copy
// (`own`).
//
// The scene is lit by an environment (Atmosphere.tsx) as well as its lights, so the materials are
// tuned as what they are: bare metal is metallic and catches the city's light, paint has a satin
// sheen, polymer less, rubber none. Every plate also carries a little wear (`weathered`): a faint
// mottling of its roughness and tone, so light breaks up across a plate rather than lying on it
// evenly; and a rim, a cool light on the faces seen nearly edge-on, which on these faceted parts
// are the thin bands along a unit's silhouette, so units stand out against the dark streets from
// any heading.

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
  // Base structures: greys and black rather than the army's olive.
  structLight: '#686d73',   // light grey: main walls and panels
  structGrey: '#4b5056',    // dark grey: secondary plates, frames, bands
  structDark: '#26292d',    // near black: plinths, deep trim, roofs
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

export type KitMaterial = 'armour' | 'armourDark' | 'steel' | 'black' | 'composite' | 'housing' | 'structLight' | 'structGrey' | 'structDark' | 'tread';

const cache = new Map<string, THREE.Material>();
const cached = <T extends THREE.Material>(key: string, make: () => T): T => {
  let m = cache.get(key) as T | undefined;
  if (!m) { m = make(); cache.set(key, m); }
  return m;
};

// Wear, for a plate: its roughness and tone mottled by a soft noise in the part's own space (so it
// stays on the part as the unit moves), at two scales. Patched into three's standard shader.
// The rim: its colour and strength, and how tightly it hugs the edge (higher, thinner).
const RIM = { color: new THREE.Color('#9cc2ff'), strength: 0.35, power: 6 };
const WEAR_GLSL = `
varying vec3 vKitPos;
float kitHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kitNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kitHash(i), kitHash(i + vec3(1, 0, 0)), f.x), mix(kitHash(i + vec3(0, 1, 0)), kitHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(kitHash(i + vec3(0, 0, 1)), kitHash(i + vec3(1, 0, 1)), f.x), mix(kitHash(i + vec3(0, 1, 1)), kitHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;
// It also sets how much of the environment's soft fill a plate takes (`fill`, kept in its userData
// so copies keep it): its reflections it takes in full, but the fill alone would wash paint flat.
export function weathered<T extends THREE.MeshStandardMaterial>(m: T, fill = m.userData.kitFill ?? 1): T {
  m.userData.kitWear = true;
  m.userData.kitFill = fill;
  m.customProgramCacheKey = () => 'kit-wear';
  m.onBeforeCompile = shader => {
    shader.uniforms.kitFill = { value: fill };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKitPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float kitFill;\n${WEAR_GLSL}`)
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\niblIrradiance *= kitFill;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float kitWear = kitNoise(vKitPos * 16.0) * 0.5 + kitNoise(vKitPos * 45.0) * 0.5;
        diffuseColor.rgb *= 0.95 + 0.07 * kitWear;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (kitWear - 0.5) * 0.05, 0.05, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(${RIM.color.r}, ${RIM.color.g}, ${RIM.color.b}) * ${RIM.strength.toFixed(3)}
          * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), ${RIM.power.toFixed(1)});`);
  };
  return m;
}

// A flat-shaded plate: each face one even tone, so edges and bevels read crisply. `fill`: how much
// of the environment's soft fill it takes (see `weathered`).
const plate = (color: string, metalness: number, roughness: number, fill: number) =>
  weathered(new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true }), fill);

export function kitMaterial(kind: KitMaterial): THREE.MeshStandardMaterial {
  return cached(kind, () => {
    switch (kind) {
      // Painted armour: a satin sheen.
      case 'armour': return plate(PALETTE.armour, 0.1, 0.58, 0.35);
      case 'armourDark': return plate(PALETTE.armourDark, 0.1, 0.62, 0.3);
      // Bare, worked metal.
      case 'steel': return plate(PALETTE.steel, 0.7, 0.36, 1);
      // Rubber, deep recesses: no sheen.
      case 'black': return plate(PALETTE.black, 0, 0.88, 0.2);
      case 'composite': return plate(PALETTE.composite, 0.05, 0.74, 0.3);
      case 'housing': return plate(PALETTE.housing, 0.1, 0.44, 0.45);
      // Base structures: painted plate and concrete, matte to satin.
      case 'structLight': return plate(PALETTE.structLight, 0.1, 0.62, 0.4);
      case 'structGrey': return plate(PALETTE.structGrey, 0.15, 0.58, 0.35);
      case 'structDark': return plate(PALETTE.structDark, 0.1, 0.7, 0.3);
      case 'tread': return new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.1, roughness: 0.85, map: treadMap() });
    }
  }) as THREE.MeshStandardMaterial;
}

// A kit material smooth-shaded, for rounded parts that should read as curved rather than faceted
// (an infantryman's limbs and helmet).
export const smoothMaterial = (kind: Exclude<KitMaterial, 'tread'>) => cached(`smooth:${kind}`, () => {
  const m = weathered(kitMaterial(kind).clone());
  m.flatShading = false;
  return m;
});

// Team paint: the side's colour as a plate.
export const teamPaint = (color: string) => cached(`team:${color}`, () => plate(color, 0.1, 0.4, 0.45));

// A light: unlit, full colour, outside the scene's tone mapping; opaque ones bloom (PostFx.tsx).
export const glow = (color: string, opacity = 1) => cached(`glow:${color}:${opacity}`, () =>
  new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));

// A copy for one unit to animate (and dispose of) on its own, with its own copy of any texture
// whose offset it moves.
export function own<T extends THREE.Material>(material: T, ownMap = false): T {
  const m = material.clone() as T;
  const std = m as unknown as THREE.MeshStandardMaterial;
  if (m.userData.kitWear) weathered(std);
  if (ownMap && std.map) std.map = std.map.clone();
  return m;
}
