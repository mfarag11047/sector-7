// Team colour for models whose texture has blue team markings painted in (the Tripo models):
// texels clearly bluer than they are red or green take the side's colour, keeping their shading.
// Also makes the model's lights glow: clearly green texels (Kage's night-vision lenses), or warm
// ones (Goliath's red eyes and amber lights; dark red cabling and yellow hazard stripes stay dull).
//
// Used as a material's onBeforeCompile (components/KageRig.tsx, components/GoliathRig.tsx).

import * as THREE from 'three';

export type GlowKind = 'green' | 'warm';

const GLOW: Record<GlowKind, string> = {
  green: `glow = smoothstep(0.1, 0.25, c.g - max(c.r, c.b));
    glowColour = vec3(0.25, 1.0, 0.45) * 2.5;`,
  warm: `glow = smoothstep(0.5, 0.65, c.r) * smoothstep(0.3, 0.45, c.r - c.b) * (1.0 - smoothstep(0.7, 0.85, c.g / max(c.r, 0.001)));
    glowColour = c * 3.0;`,
};

export const teamTintShader = (team: THREE.Color, glowKind: GlowKind) =>
  (shader: { uniforms: Record<string, { value: unknown }>; fragmentShader: string }) => {
    shader.uniforms.uTeam = { value: team };
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform vec3 uTeam;\nvoid main() {\n  float glow = 0.0;\n  vec3 glowColour = vec3(0.0);')
      .replace('#include <map_fragment>', `#include <map_fragment>
  {
    vec3 c = diffuseColor.rgb;
    float blue = smoothstep(0.06, 0.18, c.b - max(c.r, c.g));
    float lum = dot(c, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(c, uTeam * (0.25 + lum * 2.2), blue);
    ${GLOW[glowKind]}
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += glowColour * glow;`);
  };

// A copy of `base` with the team colour and glow, for one model instance.
export function teamTintedMaterial(base: THREE.Material, teamColor: string, glowKind: GlowKind): THREE.MeshStandardMaterial {
  const m = (base as THREE.MeshStandardMaterial).clone();
  m.onBeforeCompile = teamTintShader(new THREE.Color(teamColor), glowKind);
  m.customProgramCacheKey = () => `team-tint-${glowKind}`;
  return m;
}
