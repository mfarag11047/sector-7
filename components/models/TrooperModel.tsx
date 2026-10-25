// The Trooper, the basic infantry unit: a supplied rigged model (public/models/trooper.glb, a
// fully armoured soldier with a respirator helmet and a backpack, in parts on one skeleton),
// adapted to the game's look and posed in code.
//
// The model comes untextured, so it is painted from the unit kit's palette, part by part and within
// parts (by where a point sits and which bone moves it): an olive helmet shell, vest, upper arms
// and shin guards; darker olive cloth (trousers, sleeves, hood, pouches); a black visor slit and
// hoses over a dark respirator; dark gloves, boots and belt; a khaki canvas backpack; and the
// shoulder plates in the side's colour. So it sits with the rest of the army. It has no animation
// clips, so it moves procedurally:
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
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { reach, wq } from '../kit/rig';
import { ContactShadow, Plate, Strip, Turned } from '../kit/shapes';

const MODEL_URL = '/models/trooper.glb';
useGLTF.preload(MODEL_URL);
const SCALE = 3.6;

// The paints, from the unit kit's palette: olive armour plate, darker olive cloth, near-black
// gear, black glass and hoses, khaki canvas, and the side's colour.
type Paint = 'armour' | 'armourDark' | 'composite' | 'black' | 'canvas' | 'team';
const COLOURS: Record<Exclude<Paint, 'team'>, THREE.Color> = {
  armour: new THREE.Color(PALETTE.armour), armourDark: new THREE.Color(PALETTE.armourDark),
  composite: new THREE.Color(PALETTE.composite), black: new THREE.Color(PALETTE.black), canvas: new THREE.Color('#6b6a4c'),
};
// The parts, by their names in the model.
const PART = {
  head: 'tripo_part_0', backpack: 'tripo_part_1', armRight: 'tripo_part_2', armLeft: 'tripo_part_3',
  vest: 'tripo_part_5', trousers: 'tripo_part_7', shins: ['tripo_part_8', 'tripo_part_9'], boots: ['tripo_part_4', 'tripo_part_6'],
  pouches: ['tripo_part_10', 'tripo_part_12', 'tripo_part_14', 'tripo_part_19'], hoses: ['tripo_part_15', 'tripo_part_16', 'tripo_part_18'],
};
// The face of the helmet, in the model's space: the visor slit and the respirator below it.
const VISOR = { low: 0.915, high: 0.937 }, FACE_Z = 0.05;

// What colour a point of a part is: where it sits (in the model's space, facing +Z, 1 tall) and,
// for the arms, which bone moves it most.
function paintAt(part: string, p: THREE.Vector3, bone: string): Paint {
  if (part === PART.head) {
    if (p.y > VISOR.high) return 'armour'; // the helmet shell
    if (p.z > FACE_Z) return p.y > VISOR.low ? 'black' : 'composite'; // visor, respirator
    return 'armourDark'; // the hood round the neck
  }
  if (part === PART.armRight || part === PART.armLeft) {
    if (bone.includes('Hand')) return 'composite'; // gloves
    if (bone.includes('ForeArm')) return 'armourDark'; // sleeves
    return p.y > 0.72 ? 'team' : 'armour'; // shoulder plate, upper arm
  }
  if (part === PART.vest) return 'armour';
  if (part === PART.backpack) return 'canvas';
  if (part === PART.trousers) return 'armourDark';
  if (PART.shins.includes(part)) return 'armour';
  if (PART.hoses.includes(part)) return 'black';
  if (PART.pouches.includes(part)) return 'armourDark';
  return 'composite'; // boots, belt, buckles and the rest of the small gear
}

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

// A part painted: each vertex takes its colour (a vertex colour, so where one paint meets another
// the colours blend rather than step along the triangles), except the team-coloured triangles,
// split off to take the side's colour.
function paintPart(mesh: THREE.SkinnedMesh) {
  const g = mesh.geometry;
  const position = g.getAttribute('position'), skinIndex = g.getAttribute('skinIndex'), skinWeight = g.getAttribute('skinWeight');
  const index = g.getIndex()!;
  const { bones } = mesh.skeleton;
  const p = new THREE.Vector3();
  // Each vertex's paint, by where it sits and the bone that moves it most.
  const paints: Paint[] = [];
  for (let v = 0; v < position.count; v++) {
    let best = 0;
    for (let k = 1; k < 4; k++) if (skinWeight.getComponent(v, k) > skinWeight.getComponent(v, best)) best = k;
    paints.push(paintAt(mesh.name, p.fromBufferAttribute(position, v).applyMatrix4(mesh.bindMatrix), bones[skinIndex.getComponent(v, best)].name));
  }
  const colours = new Float32Array(position.count * 3);
  paints.forEach((paint, v) => (paint === 'team' ? COLOURS.armour : COLOURS[paint]).toArray(colours, v * 3));
  // A triangle is team-coloured when most of its corners are.
  const team: number[] = [], rest: number[] = [];
  for (let t = 0; t < index.count; t += 3) {
    const vs = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    (vs.filter(v => paints[v] === 'team').length >= 2 ? team : rest).push(...vs);
  }
  const body = g.clone();
  body.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  body.setIndex(rest);
  const out: [boolean, THREE.BufferGeometry][] = [[false, body]];
  if (team.length) { const t = g.clone(); t.setIndex(team); out.push([true, t]); }
  return out;
}

// The model's parts, re-weighted, painted and merged: one geometry for the painted body and one
// for its team-coloured triangles, built once from the loaded model and shared by every Trooper
// (each binds them to its own skeleton).
const merged = new WeakMap<THREE.Object3D, { body: THREE.BufferGeometry; team: THREE.BufferGeometry }>();
function mergedParts(scene: THREE.Object3D, parts: THREE.SkinnedMesh[]) {
  let out = merged.get(scene);
  if (!out) {
    parts.forEach(separateArms);
    const painted = parts.flatMap(paintPart);
    out = {
      body: mergeGeometries(painted.filter(([team]) => !team).map(([, g]) => g))!,
      team: mergeGeometries(painted.filter(([team]) => team).map(([, g]) => g))!,
    };
    merged.set(scene, out);
  }
  return out;
}
const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.65 });

export const TrooperModel: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, moving, lastAttackTime, flashRef }) => {
  const { scene } = useGLTF(MODEL_URL);
  const dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black'), composite = kitMaterial('composite');

  const rig = useMemo(() => {
    const root = cloneSkinned(scene) as THREE.Group;
    // The parts merged into two skinned meshes, painted and team-coloured, on this soldier's own
    // skeleton.
    const parts: THREE.SkinnedMesh[] = [];
    root.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) parts.push(o as THREE.SkinnedMesh); });
    const { skeleton, bindMatrix, parent } = parts[0];
    const { body, team } = mergedParts(scene, parts);
    for (const [geometry, material] of [[body, bodyMaterial], [team, teamPaint(teamColor)]] as const) {
      const mesh = new THREE.SkinnedMesh(geometry, material);
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
