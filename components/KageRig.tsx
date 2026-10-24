// Kage, the Shadow Ops hero, as a rigged, animated model (public/models/kage.glb, made in Tripo;
// see docs/GAME_DESIGN.md), with his katana (public/models/katana.glb) in his left hand.
//
// The model carries four clips: `idle` (a breathing sword stance), `run` (in place: the game moves
// him), `attack` (one slash, as long as his time between cuts) and `death` (falls and stays down).
// Which one plays follows the unit: dead, then striking, then moving, else idle, cross-fading
// between them.
//
// Each Kage gets his own copy of the skeleton and his own material, since a cloak tints the
// material in place (Unit.tsx). The material recolours the blue team bands painted into the
// texture to his side's colour, and makes the green night-vision lenses glow.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { teamTintedMaterial } from './teamTint';

const KAGE_URL = '/models/kage.glb';
const KATANA_URL = '/models/katana.glb';
useGLTF.preload(KAGE_URL);
useGLTF.preload(KATANA_URL);

// The model is about 0.93 tall; this makes him a head taller than the line infantry.
const SCALE = 5.6;
const FADE = 0.15;
const ATTACK_MS = 800;

// The katana's grip centre and tip in its own file, its length in his hands (a fraction of his
// height over its own length), and how it sits in the left hand (found by eye: an angled guard).
const GRIP = new THREE.Vector3(0.33, 0.29, 0);
const TIP = new THREE.Vector3(-0.5, 0, 0);
const KATANA_LENGTH = 0.45 / 0.83;
const IN_HAND = new THREE.Euler(0, Math.PI / 4, 0);

export const KageRig: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; dead?: boolean }> = ({ teamColor, moving, lastAttackTime, dead }) => {
  const kage = useGLTF(KAGE_URL);
  const katana = useGLTF(KATANA_URL);

  const { root, mixer, actions, material, katanaMaterials } = useMemo(() => {
    const root = cloneSkinned(kage.scene) as THREE.Group;
    let base: THREE.Material | null = null;
    root.traverse(o => { if (!base && (o as THREE.Mesh).isMesh) base = (o as THREE.Mesh).material as THREE.Material; });
    const material = teamTintedMaterial(base!, teamColor, 'green');
    const katanaMaterials: THREE.Material[] = [];
    let hand: THREE.Bone | null = null;
    root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) { mesh.material = material; mesh.castShadow = true; mesh.frustumCulled = false; }
      if ((o as THREE.Bone).isBone && o.name === 'mixamorigLeftHand') hand = o as THREE.Bone;
    });
    // The katana on a pivot: grip centre at the origin and the blade along +Z, then set in the hand.
    if (hand) {
      const blade = katana.scene.clone(true);
      blade.position.copy(GRIP).multiplyScalar(-1);
      blade.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.material = (mesh.material as THREE.Material).clone();
        katanaMaterials.push(mesh.material as THREE.Material);
      });
      const aligned = new THREE.Group();
      aligned.add(blade);
      aligned.quaternion.setFromUnitVectors(TIP.clone().sub(GRIP).normalize(), new THREE.Vector3(0, 0, 1));
      const pivot = new THREE.Group();
      pivot.add(aligned);
      pivot.rotation.copy(IN_HAND);
      pivot.scale.setScalar(KATANA_LENGTH);
      (hand as THREE.Bone).add(pivot);
    }
    const mixer = new THREE.AnimationMixer(root);
    const actions: Record<string, THREE.AnimationAction> = {};
    for (const clip of kage.animations) actions[clip.name] = mixer.clipAction(clip);
    for (const name of ['attack', 'death']) {
      actions[name]?.setLoop(THREE.LoopOnce, 1);
      if (actions[name]) actions[name].clampWhenFinished = true;
    }
    return { root, mixer, actions, material, katanaMaterials };
  }, [kage, katana, teamColor]);

  useEffect(() => () => { mixer.stopAllAction(); material.dispose(); katanaMaterials.forEach(m => m.dispose()); }, [mixer, material, katanaMaterials]);

  // The clip to play now, and switching to it.
  const current = useRef<string | null>(null);
  const attackStarted = useRef<number | undefined>(undefined);
  const play = (name: string, restart = false) => {
    const next = actions[name];
    if (!next) return;
    if (current.current === name && !restart) return;
    const prev = current.current ? actions[current.current] : null;
    next.reset().play();
    if (prev && prev !== next) next.crossFadeFrom(prev, FADE, false);
    current.current = name;
  };

  useFrame((_, delta) => {
    const now = Date.now();
    if (dead) play('death');
    else if (lastAttackTime !== undefined && now - lastAttackTime < ATTACK_MS) {
      // Each new cut restarts the slash.
      play('attack', attackStarted.current !== lastAttackTime);
      attackStarted.current = lastAttackTime;
    } else play(moving ? 'run' : 'idle');
    mixer.update(Math.min(delta, 0.1));
  });

  return <primitive object={root} scale={SCALE} />;
};
