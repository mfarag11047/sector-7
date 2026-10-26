// The key light over the city, the one light that casts shadows, with its shadow fitted to the
// ground in view.
//
// A directional light's shadow is a picture of the scene taken along the light, covering a box.
// Stretched over the whole map the box gives about one shadow texel per world unit, and units'
// shadows come out as soft smudges. So every frame the box is fitted to the ground the camera can
// see: the screen's corners are traced down to the ground (no further than SHADOW_REACH, beyond
// which fog takes over), and the box drawn round them in the light's own frame. Anything that
// casts a shadow into the view lies along the light from it, so the box needs no more than that.
//
// To keep shadows still while the camera pans, the box moves in whole texels; to keep them still
// while it zooms, its size steps in powers of SIZE_STEP rather than following every change.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { FOG_FAR } from '../constants';

// Where the light comes from.
export const KEY_DIRECTION = new THREE.Vector3(400, 600, 400).normalize();
const MAP_SIZE = 2048;
const SHADOW_REACH = FOG_FAR;
const SIZE_STEP = 1.15;
// Extra round the ground in view, for the height of what stands on its edge.
const MARGIN = 12;
// How far back along the light the shadow camera stands, and how deep it sees.
const DISTANCE = 1000, DEPTH = 2200;

// The light's frame: two axes across it.
const ACROSS = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), KEY_DIRECTION).normalize();
const UP_LIGHT = new THREE.Vector3().crossVectors(KEY_DIRECTION, ACROSS).normalize();
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

const KeyLight: React.FC = () => {
  const light = useRef<THREE.DirectionalLight>(null);
  const scratch = useMemo(() => ({ ray: new THREE.Vector3(), point: new THREE.Vector3(), centre: new THREE.Vector3() }), []);

  // The light aims at its target, which has to be in the scene for its position to count.
  useEffect(() => {
    const l = light.current;
    if (!l) return;
    l.parent?.add(l.target);
    return () => { l.target.removeFromParent(); };
  }, []);

  useFrame(({ camera }) => {
    const l = light.current;
    if (!l) return;
    const { ray, point, centre } = scratch;
    // The ground in view, in the light's frame.
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (const [x, y] of CORNERS) {
      ray.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
      const toGround = ray.y < -1e-4 ? -camera.position.y / ray.y : Infinity;
      point.copy(camera.position).addScaledVector(ray, Math.min(toGround, SHADOW_REACH));
      point.y = 0;
      const a = point.dot(ACROSS), b = point.dot(UP_LIGHT);
      minA = Math.min(minA, a); maxA = Math.max(maxA, a);
      minB = Math.min(minB, b); maxB = Math.max(maxB, b);
    }
    // The box: square, stepped in size, moved in whole texels.
    const half = Math.pow(SIZE_STEP, Math.ceil(Math.log(Math.max(maxA - minA, maxB - minB) / 2 + MARGIN) / Math.log(SIZE_STEP)));
    const texel = (2 * half) / MAP_SIZE;
    const a = Math.round((minA + maxA) / 2 / texel) * texel, b = Math.round((minB + maxB) / 2 / texel) * texel;
    centre.copy(ACROSS).multiplyScalar(a).addScaledVector(UP_LIGHT, b);

    l.position.copy(centre).addScaledVector(KEY_DIRECTION, DISTANCE);
    l.target.position.copy(centre);
    l.target.updateMatrixWorld();
    const cam = l.shadow.camera;
    if (cam.right !== half) {
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.updateProjectionMatrix();
    }
  });

  return (
    <directionalLight
      ref={light}
      intensity={1.7}
      color="#e7fbff"
      castShadow
      shadow-mapSize={[MAP_SIZE, MAP_SIZE]}
      shadow-camera-near={1}
      shadow-camera-far={DEPTH}
      shadow-bias={-0.0004}
      shadow-normalBias={0.04}
      shadow-radius={2.5}
    />
  );
};

export default KeyLight;
