// Legs for the walkers in the unit kit: a two-link leg posed from hip to foot.
//
// The leg lies in its own vertical plane, +X out from the hip and +Y up. The thigh group sits at
// the hip and the knee group is placed at the knee; each turns about Z so its +X runs down its
// segment. The knee bends upward, as on a crawler's leg.

import type * as THREE from 'three';

export function poseLeg(thighLength: number, shinLength: number, footX: number, footY: number, thigh: THREE.Object3D, knee: THREE.Object3D) {
  const d = Math.min(Math.hypot(footX, footY), thighLength + shinLength - 1e-3);
  const bend = Math.acos(Math.max(-1, Math.min(1, (thighLength * thighLength + d * d - shinLength * shinLength) / (2 * thighLength * d))));
  const a = Math.atan2(footY, footX) + bend;
  thigh.rotation.z = a;
  const kx = Math.cos(a) * thighLength, ky = Math.sin(a) * thighLength;
  knee.position.set(kx, ky, 0);
  knee.rotation.z = Math.atan2(footY - ky, footX - kx);
}
