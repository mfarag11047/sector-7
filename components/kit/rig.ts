// Posing rigged models (a skeleton, no animation clips) by hand: aiming a bone and two-bone IK.
// Used by the rigged units (GoliathRig).

import * as THREE from 'three';

export const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
export const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());

// Turns `bone` so its child lies along world direction `dir`.
export function aim(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3) {
  const current = wp(child).sub(wp(bone)).normalize();
  const world = new THREE.Quaternion().setFromUnitVectors(current, dir.clone().normalize()).multiply(wq(bone));
  bone.quaternion.copy(wq(bone.parent!).invert().multiply(world));
  bone.updateMatrixWorld(true);
}

// Two-bone IK: shoulder, elbow and hand reach `target`, the elbow bending toward world `pole`.
export function reach(upper: THREE.Object3D, fore: THREE.Object3D, hand: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  const s = wp(upper), a = wp(fore).distanceTo(s), b = wp(hand).distanceTo(wp(fore));
  const toTarget = target.clone().sub(s);
  const c = Math.min(toTarget.length(), a + b - 1e-4);
  const dir = toTarget.normalize();
  const angle = Math.acos(THREE.MathUtils.clamp((a * a + c * c - b * b) / (2 * a * c), -1, 1));
  const bend = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbow = s.clone().addScaledVector(dir, Math.cos(angle) * a).addScaledVector(bend, Math.sin(angle) * a);
  aim(upper, fore, elbow.sub(s));
  aim(fore, hand, target.clone().sub(wp(fore)));
}
