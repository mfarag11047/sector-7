// A square bar between two points, for braces, arms and dish feeds.

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Plate } from './shapes';

// A strut from a to b, its long axis along the line between them.
export const Strut: React.FC<{ a: THREE.Vector3; b: THREE.Vector3; t: number; material: THREE.Material }> = ({ a, b, t, material }) => {
  const { mid, quat, len } = useMemo(() => {
    const d = b.clone().sub(a);
    return { mid: a.clone().add(b).multiplyScalar(0.5), len: d.length(), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) };
  }, [a, b]);
  return <group position={mid} quaternion={quat}><Plate size={[t, len, t]} material={material} /></group>;
};
