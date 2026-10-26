// Post-processing over the whole scene, in order: ambient occlusion, bloom, tone mapping, grading.
//
// Ambient occlusion (N8AO) darkens where surfaces close in on each other (under a hull, where a
// leg meets the body, round a building's foot), worked out from the depth buffer alone, so it
// costs no second drawing of the scene. It runs at half resolution, on the scene's real
// brightness before bloom and tone mapping. AO.radius is in world units: a unit's creases, not a
// city block's.
//
// Bloom, so lights glow with a soft halo. Selective: only what is on the bloom layer glows, so lit
// surfaces, however bright, never do, and a light keeps its own colour rather than being pushed to
// white to clear a brightness threshold.
// On the layer go every opaque unlit light, which a sweep of the scene finds every SWEEP_S:
// the unit kit's lights (kit/materials.ts `glow`), the city's neon, the structures' trim. Parts
// are matched by depth, so a see-through light (one drawn without writing depth: exhausts, the
// force field dome) doesn't bloom.
//
// Tone mapping, which the renderer would otherwise apply, comes after them. Then grading, on the
// displayed image: a little more contrast and colour (GRADE), and a vignette darkening the screen's
// edges to draw the eye in.

import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BrightnessContrast, EffectComposer, HueSaturation, ToneMapping, Vignette } from '@react-three/postprocessing';
import { SelectiveBloomEffect, ToneMappingMode } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const AO = { radius: 4, falloff: 1, intensity: 2 };
const BLOOM = { intensity: 1.6, radius: 0.75 };
const GRADE = { contrast: 0.08, saturation: 0.08, vignetteOffset: 0.3, vignetteDarkness: 0.6 };
const SWEEP_S = 0.4;
const BLOOM_LAYER = 10;

// An opaque unlit light: drawn at full colour, outside tone mapping, writing depth.
const isLight = (m: THREE.Material | THREE.Material[] | undefined) =>
  !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true && !m.toneMapped && m.depthWrite;

const PostFx: React.FC = () => {
  const { scene, camera } = useThree();
  const ao = useMemo(() => {
    const pass = new N8AOPostPass(scene, camera);
    Object.assign(pass.configuration, {
      aoRadius: AO.radius, distanceFalloff: AO.falloff, intensity: AO.intensity,
      halfRes: true, depthAwareUpsampling: true,
      // Linear light: tone mapping and the output's gamma come later in the chain.
      gammaCorrection: false,
    });
    return pass;
  }, [scene, camera]);
  useEffect(() => () => ao.dispose(), [ao]);
  const bloom = useMemo(() => {
    const effect = new SelectiveBloomEffect(scene, camera, { mipmapBlur: true, luminanceThreshold: 0, luminanceSmoothing: 0, intensity: BLOOM.intensity, radius: BLOOM.radius });
    effect.selection.layer = BLOOM_LAYER;
    return effect;
  }, [scene, camera]);
  useEffect(() => () => bloom.dispose(), [bloom]);

  const sweep = useMemo(() => ({ last: -Infinity }), []);
  useFrame(({ clock }) => {
    if (clock.elapsedTime - sweep.last < SWEEP_S) return;
    sweep.last = clock.elapsedTime;
    scene.traverse(o => {
      if (!(o as THREE.Mesh).isMesh) return;
      if (isLight((o as THREE.Mesh).material)) o.layers.enable(BLOOM_LAYER);
      else o.layers.disable(BLOOM_LAYER);
    });
  });

  return (
    <EffectComposer multisampling={4}>
      <primitive object={ao} />
      <primitive object={bloom} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <BrightnessContrast contrast={GRADE.contrast} />
      <HueSaturation saturation={GRADE.saturation} />
      <Vignette offset={GRADE.vignetteOffset} darkness={GRADE.vignetteDarkness} />
    </EffectComposer>
  );
};

export default PostFx;
