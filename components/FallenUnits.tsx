// Units with a death animation keep falling after the game has removed them: CityMap records each
// one where and how it was drawn when it died, and this draws it there playing its death, then
// sinks it into the ground and lets it go. For now only Kage has one (components/KageRig.tsx).

import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { UnitType } from '../types';
import { KageRig } from './KageRig';

export interface FallenUnit {
  id: string;
  type: UnitType;
  teamColor: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  diedAt: number;
}

export const HAS_DEATH_ANIMATION: ReadonlySet<UnitType> = new Set<UnitType>(['hero_shadow_ops']);

// How long a fallen unit lies there, and the last stretch of it spent sinking out of sight.
const LIE_MS = 7000;
const SINK_MS = 1200;

const Fallen: React.FC<{ unit: FallenUnit }> = ({ unit }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const sinking = Date.now() - unit.diedAt - (LIE_MS - SINK_MS);
    g.position.y = unit.position[1] - Math.max(0, sinking / SINK_MS) * 2;
  });
  return (
    <group ref={ref} position={unit.position} quaternion={unit.quaternion}>
      {unit.type === 'hero_shadow_ops' && <KageRig teamColor={unit.teamColor} dead />}
    </group>
  );
};

export const FallenUnits: React.FC<{ fallen: React.MutableRefObject<Map<string, FallenUnit>> }> = ({ fallen }) => {
  const [list, setList] = useState<FallenUnit[]>([]);
  useFrame(() => {
    const now = Date.now();
    for (const [id, f] of fallen.current) if (now - f.diedAt > LIE_MS) fallen.current.delete(id);
    if (fallen.current.size !== list.length || list.some(f => !fallen.current.has(f.id))) setList([...fallen.current.values()]);
  });
  return <>{list.map(f => <Fallen key={f.id} unit={f} />)}</>;
};
