// Models for some of the units added in the playable build: the Cloaking Field Generator. Units
// rebuilt from the unit kit live in models/.
// Built from primitives in the same style as the rest of Unit.tsx. Every model faces -Z,
// which is the direction Unit.tsx turns toward the next waypoint.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';

const HULL = '#334155';
const DARK = '#1e293b';
const STEEL = '#475569';

// Shadow Ops Cloaking Field Generator: a squat drop pod with a pylon, and an emitter ring that
// turns and glows violet while the field is up.
export const CloakGeneratorModel: React.FC<{ teamColor: string; active: boolean }> = ({ teamColor, active }) => {
  const ringRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (ringRef.current && active) ringRef.current.rotation.y += delta * 1.6;
  });
  const glow = active ? '#c084fc' : '#475569';
  return (
    <group scale={[2.4, 2.4, 2.4]}>
      {/* Pod base and landing legs */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.75, 0.9, 0.4, 8]} />
        <meshStandardMaterial color={HULL} metalness={0.7} roughness={0.35} />
        <Edges color={DARK} />
      </mesh>
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} position={[Math.cos(i * Math.PI / 2 + Math.PI / 4) * 0.85, 0.05, Math.sin(i * Math.PI / 2 + Math.PI / 4) * 0.85]} rotation={[0, -(i * Math.PI / 2 + Math.PI / 4), 0.5]}>
          <boxGeometry args={[0.5, 0.06, 0.1]} />
          <meshStandardMaterial color={STEEL} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.04, 8]} />
        <meshBasicMaterial color={teamColor} toneMapped={false} />
      </mesh>
      {/* Pylon */}
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.16, 0.24, 1.0, 8]} />
        <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
      {/* Emitter ring */}
      <group ref={ringRef} position={[0, 1.15, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.5, 0.05, 6, 24]} />
          <meshBasicMaterial color={glow} toneMapped={false} />
        </mesh>
        {[0, 1, 2].map(i => (
          <mesh key={i} position={[Math.cos(i * 2.094) * 0.5, 0, Math.sin(i * 2.094) * 0.5]}>
            <boxGeometry args={[0.12, 0.22, 0.12]} />
            <meshStandardMaterial color={DARK} emissive={glow} emissiveIntensity={active ? 1.2 : 0} />
          </mesh>
        ))}
      </group>
    </group>
  );
};
