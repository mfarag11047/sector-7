// Post-processing over the whole scene: bloom, so lights glow with a soft halo.
//
// Selective: only what is on the bloom layer glows, so lit surfaces, however bright, never do, and
// a light keeps its own colour rather than being pushed to white to clear a brightness threshold.
// On the layer go every opaque unlit light, which a sweep of the scene finds every SWEEP_S:
// the unit kit's lights (kit/materials.ts `glow`), the city's neon, the structures' trim. Parts
// are matched by depth, so a see-through light (one drawn without writing depth: exhausts, the
// force field dome) doesn't bloom.
//
// Tone mapping, which the renderer would otherwise apply, moves to the end of the chain.

import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer, ToneMapping } from '@react-three/postprocessing';
import { SelectiveBloomEffect, ToneMappingMode } from 'postprocessing';

const BLOOM = { intensity: 1.6, radius: 0.75 };
const SWEEP_S = 0.4;
const BLOOM_LAYER = 10;

// An opaque unlit light: drawn at full colour, outside tone mapping, writing depth.
const isLight = (m: THREE.Material | THREE.Material[] | undefined) =>
  !!m && !Array.isArray(m) && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial === true && !m.toneMapped && m.depthWrite;

const PostFx: React.FC = () => {
  const { scene, camera } = useThree();
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
      <primitive object={bloom} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
};

export default PostFx;
