// Post-processing over the whole scene, in order: ambient occlusion, bloom, tone mapping, grading.
//
// Ambient occlusion (N8AO) darkens where surfaces close in on each other (under a hull, where a leg
// meets the body, round a building's foot), worked out from the depth buffer alone, so it costs no
// second drawing of the scene. (Unless it is made "transparency aware", which it turns on by itself
// when it finds anything transparent: then it walks the whole scene every frame and draws it twice
// more. That is switched off; a see-through effect may take a faint shade of the AO behind it.) It
// runs at full resolution (half resolution is cheaper but shimmers from frame to frame on big flat
// walls), on the scene's real brightness before bloom and tone mapping. AO.radius is in world
// units: a unit's creases, not a city block's.
//
// Between them, a guard (FINITE_GUARD) that turns any pixel that isn't a finite number (a NaN or an
// infinity, from a shader's edge case on some GPU) black, and any negative colour to zero (which an
// 8-bit screen would have clamped, but this high-range chain keeps). Bloom blurs each pixel into
// ever wider averages, and one such pixel poisons every average it touches: unguarded, a single bad
// pixel blacks out half the screen or all of it.
//
// Bloom, so lights glow with a soft halo. Selective: only what is on the bloom layer glows, so lit
// surfaces, however bright, never do, and a light keeps its own colour rather than being pushed to
// white to clear a brightness threshold. On the layer go every opaque unlit light, which a sweep of
// the scene finds: a walk through it a slice at a time, no more than SWEEP_MS a frame (the scene
// holds tens of thousands of objects, and walking them all at once costs a whole frame), starting
// over when it reaches the end: the unit kit's lights (kit/materials.ts `glow`), the city's neon,
// the structures' trim. Parts are matched by depth, so a see-through light (one drawn without
// writing depth: exhausts, the force field dome) doesn't bloom. The layer is all the selection
// there is: bloom's own brightness filter is switched off, not set to zero. (At zero it computes
// smoothstep(0, 0, x), which GLSL leaves undefined; on some GPUs that is a NaN on every unlit
// pixel, and the screen goes black.)
//
// Tone mapping, which the renderer would otherwise apply, comes after them. Then grading, on the
// displayed image: a little more contrast and colour (GRADE), and a vignette darkening the screen's
// edges to draw the eye in.

import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { SelectiveBloomEffect, ShaderPass, ToneMappingMode } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const AO = { radius: 4, falloff: 1, intensity: 2 };
const BLOOM = { intensity: 1.6, radius: 0.75 };
const GRADE = { contrast: 0.08, saturation: 0.08, vignetteOffset: 0.3, vignetteDarkness: 0.6 };
const SWEEP_MS = 0.4;
const BLOOM_LAYER = 10;

const FINITE_GUARD = `
uniform sampler2D inputBuffer;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(inputBuffer, vUv);
  gl_FragColor = any(isnan(c)) || any(isinf(c)) ? vec4(0.0, 0.0, 0.0, 1.0) : max(c, vec4(0.0));
}`;
const FULLSCREEN = 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }';

// An opaque unlit light: drawn at full colour, outside tone mapping, writing depth.
const isLight = (m: THREE.Material | THREE.Material[] | undefined) =>
  !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true && !m.toneMapped && m.depthWrite;

// Memoised: it takes nothing from the app, so the app's frequent updates needn't touch it.
const PostFx: React.FC = React.memo(() => {
  const { scene, camera } = useThree();
  const ao = useMemo(() => {
    const pass = new N8AOPostPass(scene, camera);
    pass.autoDetectTransparency = false;
    Object.assign(pass.configuration, {
      aoRadius: AO.radius, distanceFalloff: AO.falloff, intensity: AO.intensity,
      halfRes: false,
      // Linear light: tone mapping and the output's gamma come later in the chain.
      gammaCorrection: false,
      transparencyAware: false,
    });
    return pass;
  }, [scene, camera]);
  useEffect(() => () => ao.dispose(), [ao]);
  const guard = useMemo(() => new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { inputBuffer: { value: null } }, vertexShader: FULLSCREEN, fragmentShader: FINITE_GUARD,
    depthWrite: false, depthTest: false,
  })), []);
  useEffect(() => () => guard.dispose(), [guard]);
  const bloom = useMemo(() => {
    const effect = new SelectiveBloomEffect(scene, camera, { mipmapBlur: true, intensity: BLOOM.intensity, radius: BLOOM.radius });
    effect.selection.layer = BLOOM_LAYER;
    effect.luminancePass.enabled = false;
    return effect;
  }, [scene, camera]);
  useEffect(() => () => bloom.dispose(), [bloom]);

  // What is left to visit on this walk through the scene.
  const unvisited = useMemo<THREE.Object3D[]>(() => [], []);
  useFrame(() => {
    const start = performance.now();
    if (unvisited.length === 0) unvisited.push(scene);
    for (let n = 1; unvisited.length > 0; n++) {
      const o = unvisited.pop()!;
      if ((o as THREE.Mesh).isMesh) {
        if (isLight((o as THREE.Mesh).material)) o.layers.enable(BLOOM_LAYER);
        else o.layers.disable(BLOOM_LAYER);
      }
      for (let i = 0; i < o.children.length; i++) unvisited.push(o.children[i]);
      if (n % 256 === 0 && performance.now() - start > SWEEP_MS) break;
    }
  });

  return (
    <EffectComposer multisampling={4}>
      <primitive object={ao} />
      <primitive object={guard} />
      <primitive object={bloom} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <BrightnessContrast contrast={GRADE.contrast} />
      <HueSaturation saturation={GRADE.saturation} />
      <Vignette offset={GRADE.vignetteOffset} darkness={GRADE.vignetteDarkness} />
    </EffectComposer>
  );
});

export default PostFx;
