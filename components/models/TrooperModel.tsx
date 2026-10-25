// The Trooper, the basic infantry unit: a supplied rigged model (public/models/trooper.glb, a
// fully armoured soldier with a respirator helmet and a backpack, in parts on one skeleton),
// adapted to the game's look and posed in code.
//
// The model comes untextured; each of its parts takes a colour from the unit kit's palette (olive
// armour, darker gear, dark boots, a black visor and hoses) and its chest pouches take the team
// colour, so it sits with the rest of the army. It has no animation clips, so it moves
// procedurally:
//   - it holds a plain kit rifle in both hands by two-bone IK (kit/rig.ts): the right hand on the
//     grip, the left on the handguard, fingers closed;
//   - the rifle rides low at the ready, and comes up level to fire while it is fighting
//     (`lastAttackTime`), its muzzle flashing on each shot (`flashRef`, lit by Unit.tsx);
//   - walking swings its legs and bobs its hips; standing, its chest rises and falls.
//
// The model faces +Z, 1 tall with its feet on y = 0, and is scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glow, kitMaterial, PALETTE, smoothMaterial, teamPaint } from '../kit/materials';
import { reach, wq } from '../kit/rig';
import { ContactShadow, Plate, Strip, Turned } from '../kit/shapes';

const MODEL_URL = '/models/trooper.glb';
useGLTF.preload(MODEL_URL);
const SCALE = 3.6;

// Each part's paint, by its name in the model; anything unlisted is armour. 'team' is the side's
// colour.
type Paint = 'armour' | 'armourDark' | 'composite' | 'black' | 'team';
const PAINT: Record<string, Paint> = {
  tripo_part_1: 'armourDark', // backpack
  tripo_part_10: 'team', tripo_part_12: 'team', // chest pouches
  tripo_part_13: 'black', tripo_part_15: 'black', tripo_part_16: 'black', tripo_part_18: 'black', // visor, hoses
  tripo_part_11: 'composite', tripo_part_14: 'composite', tripo_part_20: 'composite', tripo_part_22: 'composite',
  tripo_part_21: 'composite', tripo_part_23: 'composite',
  tripo_part_17: 'composite', // belt
  tripo_part_7: 'armourDark', tripo_part_19: 'armourDark', // hips
  tripo_part_4: 'composite', tripo_part_6: 'composite', // boots
};

// The rifle in the model's space: where its grip sits at the ready and when aimed, and its tilt.
const READY = { pos: new THREE.Vector3(-0.07, 0.54, 0.13), tilt: 0.45 };
const AIMED = { pos: new THREE.Vector3(-0.07, 0.68, 0.12), tilt: 0 };
// Where the hands go, in the rifle's own space (barrel along +Z), and which way the elbows point
// in the model's space.
const GRIP_RIGHT = new THREE.Vector3(0, -0.01, 0.0);
const GRIP_LEFT = new THREE.Vector3(0, 0.0, 0.21);
const POLE_RIGHT = new THREE.Vector3(-0.6, -1, -0.3);
const POLE_LEFT = new THREE.Vector3(0.6, -1, 0);
const CURL = 1.0;

// The model's skin weights let parts of the torso follow the arm bones (and the arms the
// spine), which stretches into sheets once the arms come forward to the rifle. So the arms follow
// only arm bones and every other part none of them.
const ARM_PARTS = new Set(['tripo_part_2', 'tripo_part_3']);
const isArmBone = (name: string) => /(Arm|ForeArm|Hand)/.test(name);
function separateArms(mesh: THREE.SkinnedMesh) {
  const g = mesh.geometry;
  const index = g.getAttribute('skinIndex'), weight = g.getAttribute('skinWeight'), position = g.getAttribute('position');
  const arm = ARM_PARTS.has(mesh.name);
  const { bones, boneInverses } = mesh.skeleton;
  const allowed = bones.map((b, i) => i).filter(i => isArmBone(bones[i].name) === arm);
  // Where each allowed bone sits in the bind pose, for vertices left with no weight at all.
  const at = allowed.map(i => new THREE.Vector3().setFromMatrixPosition(boneInverses[i].clone().invert()));
  const p = new THREE.Vector3();
  for (let v = 0; v < index.count; v++) {
    const w = [0, 1, 2, 3].map(k => allowed.includes(index.getComponent(v, k)) ? weight.getComponent(v, k) : 0);
    const total = w.reduce((a, b) => a + b, 0);
    if (total > 0) { w.forEach((x, k) => weight.setComponent(v, k, x / total)); continue; }
    p.fromBufferAttribute(position, v).applyMatrix4(mesh.bindMatrix);
    let best = 0;
    at.forEach((q, j) => { if (q.distanceToSquared(p) < at[best].distanceToSquared(p)) best = j; });
    index.setComponent(v, 0, allowed[best]);
    weight.setComponent(v, 0, 1);
    for (let k = 1; k < 4; k++) weight.setComponent(v, k, 0);
  }
  index.needsUpdate = true;
  weight.needsUpdate = true;
}

// The model's parts, re-weighted and merged by paint: built once from the loaded model and
// shared by every Trooper (each binds them to its own skeleton).
const merged = new WeakMap<THREE.Object3D, [Paint, THREE.BufferGeometry][]>();
function mergedByPaint(scene: THREE.Object3D, parts: THREE.SkinnedMesh[]) {
  let out = merged.get(scene);
  if (!out) {
    parts.forEach(separateArms);
    const byPaint = new Map<Paint, THREE.BufferGeometry[]>();
    parts.forEach(m => {
      const paint = PAINT[m.name] ?? 'armour';
      byPaint.set(paint, [...(byPaint.get(paint) ?? []), m.geometry]);
    });
    out = [...byPaint].map(([paint, geometries]) => [paint, mergeGeometries(geometries)!] as [Paint, THREE.BufferGeometry]);
    merged.set(scene, out);
  }
  return out;
}

export const TrooperModel: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, moving, lastAttackTime, flashRef }) => {
  const { scene } = useGLTF(MODEL_URL);
  const dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black'), composite = kitMaterial('composite');

  const rig = useMemo(() => {
    const root = cloneSkinned(scene) as THREE.Group;
    // The parts merged into one skinned mesh per paint, on this soldier's own skeleton.
    const parts: THREE.SkinnedMesh[] = [];
    root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) parts.push(o as THREE.SkinnedMesh); });
    const { skeleton, bindMatrix, parent } = parts[0];
    for (const [paint, geometry] of mergedByPaint(scene, parts)) {
      const mesh = new THREE.SkinnedMesh(geometry, paint === 'team' ? teamPaint(teamColor) : smoothMaterial(paint));
      mesh.bind(skeleton, bindMatrix);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      parent!.add(mesh);
    }
    parts.forEach(m => m.removeFromParent());
    const bones: Record<string, THREE.Bone> = {};
    root.traverse(o => { if ((o as THREE.Bone).isBone) bones[o.name.replace('mixamorig', '').replace(':', '')] = o as THREE.Bone; });
    // Fists round the grips: the fingers keep this for good.
    for (const side of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) {
      bones[`${side}Hand${f}${k}`]?.rotateZ(side === 'Left' ? -CURL : CURL);
    }
    const animated = ['Hips', 'Spine', 'Spine2', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
    const rest = Object.fromEntries(animated.map(n => [n, { q: bones[n].quaternion.clone(), p: bones[n].position.clone() }]));
    return { root, bones, rest };
  }, [scene, teamColor]);

  const rifle = useRef<THREE.Group>(null);
  const state = useMemo(() => ({ walk: 0, stride: 0, aim: 0 }), []);

  useFrame(({ clock }, delta) => {
    const { root, bones, rest } = rig;
    const dt = Math.min(delta, 0.05);
    for (const n in rest) { bones[n].quaternion.copy(rest[n].q); bones[n].position.copy(rest[n].p); }
    state.walk += ((moving ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 8));
    state.stride += dt * 8 * state.walk;
    const since = lastAttackTime ? Date.now() - lastAttackTime : Infinity;
    state.aim += ((since < 3000 ? 1 : 0) - state.aim) * (1 - Math.exp(-dt * 6));

    // A stride: legs swing, knees bend on the forward swing, hips bob; standing, breathing.
    const swing = Math.sin(state.stride) * 0.45 * state.walk;
    bones.RightUpLeg.rotateZ(-swing);
    bones.LeftUpLeg.rotateZ(swing);
    bones.RightLeg.rotateZ(Math.max(0, Math.sin(state.stride)) * 0.7 * state.walk);
    bones.LeftLeg.rotateZ(Math.max(0, -Math.sin(state.stride)) * 0.7 * state.walk);
    const bob = Math.abs(Math.cos(state.stride)) * 0.012 * state.walk;
    bones.Hips.position.y += bob;
    bones.Spine2.rotateX(Math.sin(clock.elapsedTime * 1.6) * 0.015 * (1 - state.walk));

    // The rifle, low at the ready or up to fire, riding the stride.
    const r = rifle.current;
    if (!r) return;
    r.position.lerpVectors(READY.pos, AIMED.pos, state.aim);
    r.position.y += bob;
    r.rotation.x = READY.tilt + (AIMED.tilt - READY.tilt) * state.aim;
    root.updateMatrixWorld(true);
    r.updateWorldMatrix(true, false);
    // Hands on the grips, wherever the rifle is now.
    const facing = wq(root);
    reach(bones.RightArm, bones.RightForeArm, bones.RightHand, r.localToWorld(GRIP_RIGHT.clone()), POLE_RIGHT.clone().applyQuaternion(facing));
    reach(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, r.localToWorld(GRIP_LEFT.clone()), POLE_LEFT.clone().applyQuaternion(facing));
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[0.45, 0.4]} />
      <primitive object={rig.root} />
      {/* The rifle: stock, receiver, magazine, optic, handguard, barrel; its origin at the grip. */}
      <group ref={rifle} position={READY.pos}>
        <Plate size={[0.04, 0.06, 0.15]} material={composite} position={[0, 0.02, -0.12]} />
        <Plate size={[0.045, 0.075, 0.22]} material={dark} position={[0, 0.03, 0.04]} />
        <Plate size={[0.028, 0.065, 0.032]} material={black} position={[0, -0.03, -0.01]} rotation={[-0.3, 0, 0]} />
        <Plate size={[0.028, 0.08, 0.04]} material={black} position={[0, -0.03, 0.09]} rotation={[0.25, 0, 0]} />
        <Turned profile={[[0.016, -0.04], [0.018, -0.028], [0.018, 0.028], [0.016, 0.04]]} segments={8} material={steel} position={[0, 0.085, 0.03]} />
        <Strip size={[0.018, 0.018, 0.004]} material={glow(PALETTE.amber)} position={[0, 0.085, 0.072]} />
        <group position={[0, 0.03, 0]}>
          <Turned profile={[[0.02, 0.14], [0.024, 0.16], [0.024, 0.28], [0.018, 0.3]]} segments={6} material={composite} />
          <Turned profile={[[0.01, 0.29], [0.01, 0.38], [0.016, 0.38], [0.016, 0.41]]} segments={8} material={black} />
          <mesh ref={flashRef} position={[0, 0, 0.46]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
