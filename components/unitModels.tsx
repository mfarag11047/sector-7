// Models for some of the units added in the playable build (the field generators), plus the
// gear that sets Troopers and Lancers apart from the Ghost (they share its soldier mesh). Vehicles rebuilt from the unit kit live in models/.
// Built from primitives in the same style as the rest of Unit.tsx. Every model faces -Z,
// which is the direction Unit.tsx turns toward the next waypoint.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';

const HULL = '#334155';
const DARK = '#1e293b';
const STEEL = '#475569';

// Shoulder-fired rocket tube for the Lancer, sized for the soldier mesh at scale 1.
export const LancerLauncher: React.FC<{ teamColor: string }> = ({ teamColor }) => (
  <group position={[0.11, 0.78, 0.02]} rotation={[0.08, 0, 0]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.045, 0.045, 0.5, 10]} />
      <meshStandardMaterial color={DARK} metalness={0.6} roughness={0.4} />
    </mesh>
    <mesh position={[0, 0, -0.26]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.055, 0.045, 0.06, 10]} />
      <meshStandardMaterial color={STEEL} />
    </mesh>
    <mesh position={[0, 0.06, 0.05]}>
      <boxGeometry args={[0.03, 0.03, 0.18]} />
      <meshBasicMaterial color={teamColor} toneMapped={false} />
    </mesh>
  </group>
);

// Trooper's carbine and a team-colored shoulder plate, so a squad reads at a glance.
export const TrooperKit: React.FC<{ teamColor: string }> = ({ teamColor }) => (
  <group>
    <mesh position={[0.07, 0.6, -0.12]} rotation={[0.1, 0, 0]}>
      <boxGeometry args={[0.03, 0.05, 0.3]} />
      <meshStandardMaterial color={DARK} metalness={0.5} />
    </mesh>
    {[-1, 1].map(side => (
      <mesh key={side} position={[side * 0.12, 0.72, 0]}>
        <boxGeometry args={[0.06, 0.03, 0.09]} />
        <meshBasicMaterial color={teamColor} toneMapped={false} />
      </mesh>
    ))}
  </group>
);

// Shadow Ops Cloaking Field Generator: a squat drop pod with a pylon, and an emitter ring that
// turns and glows violet while the field is up.
// Heavy Metal's Bulwark Field Generator: a squat armoured drop pod with four coil pylons and a
// big emitter orb on a spinning collar. The coils and orb glow while the field is up.
export const FieldGeneratorModel: React.FC<{ teamColor: string; active: boolean }> = ({ teamColor, active }) => {
  const collarRef = useRef<THREE.Group>(null);
  const orbRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, delta) => {
    if (collarRef.current && active) collarRef.current.rotation.y += delta * 2.2;
    if (orbRef.current) orbRef.current.scale.setScalar(active ? 1 + Math.sin(clock.elapsedTime * 6) * 0.08 : 0.85);
  });
  const glow = active ? '#7dd3fc' : '#475569';
  return (
    <group scale={[2.6, 2.6, 2.6]}>
      {/* Armoured octagonal base on landing feet */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.85, 1.0, 0.5, 8]} />
        <meshStandardMaterial color={HULL} metalness={0.75} roughness={0.35} />
        <Edges color={DARK} />
      </mesh>
      {[0, 1, 2, 3].map(i => {
        const a = i * Math.PI / 2 + Math.PI / 4;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.95, 0.06, Math.sin(a) * 0.95]} rotation={[0, -a, 0.45]}>
            <boxGeometry args={[0.55, 0.08, 0.14]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.51, 0]}>
        <cylinderGeometry args={[0.8, 0.8, 0.03, 8]} />
        <meshBasicMaterial color={teamColor} toneMapped={false} />
      </mesh>
      {/* Four coil pylons */}
      {[0, 1, 2, 3].map(i => {
        const a = i * Math.PI / 2;
        return (
          <group key={i} position={[Math.cos(a) * 0.55, 0.5, Math.sin(a) * 0.55]}>
            <mesh position={[0, 0.45, 0]}>
              <cylinderGeometry args={[0.07, 0.1, 0.9, 6]} />
              <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.3} />
            </mesh>
            {[0.25, 0.45, 0.65].map(y => (
              <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.12, 0.03, 5, 12]} />
                <meshBasicMaterial color={glow} toneMapped={false} />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* Central mast, spinning collar and emitter orb */}
      <mesh position={[0, 1.0, 0]}>
        <cylinderGeometry args={[0.14, 0.22, 1.0, 8]} />
        <meshStandardMaterial color={STEEL} metalness={0.8} roughness={0.3} />
      </mesh>
      <group ref={collarRef} position={[0, 1.35, 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.42, 0.05, 6, 24]} />
          <meshBasicMaterial color={glow} toneMapped={false} />
        </mesh>
        {[0, 1, 2, 3].map(i => (
          <mesh key={i} position={[Math.cos(i * Math.PI / 2) * 0.42, 0, Math.sin(i * Math.PI / 2) * 0.42]}>
            <boxGeometry args={[0.12, 0.12, 0.12]} />
            <meshStandardMaterial color={HULL} metalness={0.7} />
          </mesh>
        ))}
      </group>
      <mesh ref={orbRef} position={[0, 1.75, 0]}>
        <sphereGeometry args={[0.28, 16, 12]} />
        <meshBasicMaterial color={glow} toneMapped={false} />
      </mesh>
    </group>
  );
};

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
