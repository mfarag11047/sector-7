// Goliath, the Heavy Metal hero, from three Tripo models (public/models/goliath*.glb): his rigged
// body, the heavy machine gun he carries at his right hip, and the grenade launcher on an arm
// over his right shoulder, mounted on the socket in his back.
//
// The body has a skeleton but no animation clips, so he moves procedurally:
//   - his arms hold the gun by two-bone IK each frame: the right hand on the pistol grip, the
//     left on the front grip, elbows down and out, so they follow the gun however it moves;
//   - walking swings his legs and bobs his hips; standing, his chest rises and falls;
//   - each shot kicks the gun back and each grenade volley kicks the launcher;
//   - dead, he topples backward (components/FallenUnits.tsx keeps him on the ground a while).
//
// Each Goliath gets his own skeleton and materials (a cloak tints materials in place). His
// pauldrons take the team colour and his eyes and amber lights glow (components/teamTint.ts).

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { GOLIATH } from '../sim/heavyMetalHero';
import { teamTintedMaterial } from './teamTint';
import { reach, wp, wq } from './kit/rig';

const BODY_URL = '/models/goliath.glb';
const GUN_URL = '/models/goliath_gun.glb';
const LAUNCHER_URL = '/models/goliath_launcher.glb';
useGLTF.preload(BODY_URL);
useGLTF.preload(GUN_URL);
useGLTF.preload(LAUNCHER_URL);

// The body is 1 tall; this makes him the towering heavy he is.
export const GOLIATH_SCALE = 7;

// Where the props sit, in the body's own space (1 tall, facing +Z), found by eye.
const GUN = { pos: new THREE.Vector3(-0.1, 0.53, 0.2), rot: new THREE.Euler(0, -Math.PI / 2, 0), scale: 0.75 };
// The grips and muzzle in the gun's own space (barrel along +X).
const GRIP_RIGHT = new THREE.Vector3(-0.33, 0.1, 0);
const GRIP_LEFT = new THREE.Vector3(0.08, 0.06, 0);
const MUZZLE = new THREE.Vector3(0.53, 0.26, 0);
const LAUNCHER = { pos: new THREE.Vector3(-0.12, 0.57, -0.05), rot: new THREE.Euler(0, -Math.PI / 2, 0), scale: 0.55 };
// Which way each elbow points, in the body's space.
const POLE_RIGHT = new THREE.Vector3(-0.6, -1, -0.4);
const POLE_LEFT = new THREE.Vector3(0.6, -1, -0.2);
// How far the fingers close round the grips.
const CURL = 1.0;

const RECOIL_MS = 140;
const TOPPLE_MS = 1100;

export const GoliathRig: React.FC<{
  teamColor: string;
  moving?: boolean;
  lastAttackTime?: number;
  grenadeAt?: number;
  dead?: boolean;
  diedAt?: number;
  flashRef?: React.Ref<THREE.Mesh>;
}> = ({ teamColor, moving, lastAttackTime, grenadeAt, dead, diedAt, flashRef }) => {
  const bodyGltf = useGLTF(BODY_URL);
  const gunGltf = useGLTF(GUN_URL);
  const launcherGltf = useGLTF(LAUNCHER_URL);

  const rig = useMemo(() => {
    const root = cloneSkinned(bodyGltf.scene) as THREE.Group;
    const materials: THREE.Material[] = [];
    const tint = (o: THREE.Object3D) => o.traverse(c => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const m = teamTintedMaterial(mesh.material as THREE.Material, teamColor, 'warm');
      mesh.material = m;
      materials.push(m);
    });
    tint(root);
    const bones: Record<string, THREE.Bone> = {};
    root.traverse(o => { if ((o as THREE.Bone).isBone) bones[o.name.replace('mixamorig', '')] = o as THREE.Bone; });

    // The props on their mounts, placed in the body's space, then carried by the chest.
    const gun = gunGltf.scene.clone(true); tint(gun);
    const gunMount = new THREE.Group(); gunMount.add(gun);
    gunMount.position.copy(GUN.pos); gunMount.rotation.copy(GUN.rot); gunMount.scale.setScalar(GUN.scale);
    const launcher = launcherGltf.scene.clone(true); tint(launcher);
    const launcherMount = new THREE.Group(); launcherMount.add(launcher);
    launcherMount.position.copy(LAUNCHER.pos); launcherMount.rotation.copy(LAUNCHER.rot); launcherMount.scale.setScalar(LAUNCHER.scale);
    root.add(gunMount, launcherMount);
    root.updateMatrixWorld(true);
    bones.Spine2.attach(gunMount);
    bones.Spine2.attach(launcherMount);
    const muzzle = new THREE.Group(); muzzle.position.copy(MUZZLE); gun.add(muzzle);

    // Fists round the grips: the fingers keep this for good.
    for (const side of ['Left', 'Right']) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (const k of [1, 2, 3]) {
      const bone = bones[`${side}Hand${f}${k}`];
      if (bone) bone.rotateZ(side === 'Left' ? -CURL : CURL);
    }
    const animated = ['Hips', 'Spine', 'Spine2', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
    const rest = Object.fromEntries(animated.map(n => [n, { q: bones[n].quaternion.clone(), p: bones[n].position.clone() }]));
    return { root, bones, gun, launcher, muzzle, materials, rest, launcherRot: launcher.rotation.clone() };
  }, [bodyGltf, gunGltf, launcherGltf, teamColor]);

  useEffect(() => () => rig.materials.forEach(m => m.dispose()), [rig]);

  useFrame(({ clock }) => {
    const { root, bones, gun, launcher, rest } = rig;
    const now = Date.now(), t = clock.elapsedTime;
    for (const n in rest) { bones[n].quaternion.copy(rest[n].q); bones[n].position.copy(rest[n].p); }

    // Dead: topple backward, then lie still.
    const fall = dead ? Math.min(1, (now - (diedAt ?? now)) / TOPPLE_MS) : 0;
    root.rotation.x = -1.45 * fall * fall;

    if (!dead && moving) {
      // A heavy stride: legs swing, knees bend on the forward swing, hips bob twice a stride.
      const phase = t * 6;
      const swing = Math.sin(phase) * 0.42;
      bones.RightUpLeg.rotateZ(-swing);
      bones.LeftUpLeg.rotateZ(swing);
      bones.RightLeg.rotateZ(Math.max(0, Math.sin(phase)) * 0.7);
      bones.LeftLeg.rotateZ(Math.max(0, -Math.sin(phase)) * 0.7);
      bones.Hips.position.y += Math.abs(Math.cos(phase)) * 0.012;
      bones.Spine.rotateY(Math.sin(phase) * 0.06);
    } else if (!dead) {
      // Breathing.
      bones.Spine2.rotateX(Math.sin(t * 1.6) * 0.02);
    }

    // Recoil: each shot kicks the gun back along its barrel; each volley kicks the launcher up.
    const shot = lastAttackTime === undefined ? 1 : Math.min(1, (now - lastAttackTime) / RECOIL_MS);
    gun.position.x = -(1 - shot) * 0.06;
    const volleyMs = GOLIATH.grenades.count * GOLIATH.grenades.intervalMs;
    const since = grenadeAt === undefined ? Infinity : now - grenadeAt;
    const kick = since < volleyMs + 200 ? Math.max(0, 1 - (since % GOLIATH.grenades.intervalMs) / GOLIATH.grenades.intervalMs) : 0;
    launcher.rotation.z = rig.launcherRot.z + kick * 0.18;

    root.updateMatrixWorld(true);
    // Hands on the grips, wherever the gun is now.
    const facing = wq(root);
    reach(bones.RightArm, bones.RightForeArm, bones.RightHand, gun.localToWorld(GRIP_RIGHT.clone()), POLE_RIGHT.clone().applyQuaternion(facing));
    reach(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, gun.localToWorld(GRIP_LEFT.clone()), POLE_LEFT.clone().applyQuaternion(facing));
  });

  return (
    <group>
      <primitive object={rig.root} scale={GOLIATH_SCALE} />
      {/* The muzzle flash Unit.tsx shows on each shot, kept at the muzzle. */}
      {flashRef && <MuzzleFlash anchor={rig.muzzle} flashRef={flashRef} />}
    </group>
  );
};

// A flash sphere that follows the gun's muzzle.
const MuzzleFlash: React.FC<{ anchor: THREE.Object3D; flashRef: React.Ref<THREE.Mesh> }> = ({ anchor, flashRef }) => {
  const group = React.useRef<THREE.Group>(null);
  useFrame(() => {
    const g = group.current;
    if (!g || !g.parent) return;
    g.position.copy(g.parent.worldToLocal(wp(anchor)));
  });
  return (
    <group ref={group}>
      <mesh ref={flashRef} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.5, 8, 6]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
};
