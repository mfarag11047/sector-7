// Models for some of the units added in the playable build (the field generators and the
// Infiltrator), plus the gear that sets Troopers and Lancers apart from the
// Ghost (they share its soldier mesh). Vehicles rebuilt from the unit kit live in models/.
// Built from primitives in the same style as the rest of Unit.tsx. Every model faces -Z,
// which is the direction Unit.tsx turns toward the next waypoint.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges, Float } from '@react-three/drei';
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

// Infiltrator Drone: a long-winged loitering surveillance drone with a pusher prop and a radar
// rotodome on struts above the fuselage, turning while its radar runs. Faces -Z.
export const InfiltratorModel: React.FC<{ teamColor: string; radarOn: boolean }> = ({ teamColor, radarOn }) => {
  const domeRef = useRef<THREE.Group>(null);
  const propRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (domeRef.current && radarOn) domeRef.current.rotation.y += delta * 2.2;
    if (propRef.current) propRef.current.rotation.z += delta * 40;
  });
  return (
    <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.3} floatingRange={[0, 0.4]}>
      <group scale={[2.2, 2.2, 2.2]}>
        {/* Fuselage, bulbous sensor nose, tail boom */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.13, 0.1, 1.5, 10]} />
          <meshStandardMaterial color={HULL} metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.02, -0.78]} scale={[1, 0.9, 1.3]}>
          <sphereGeometry args={[0.14, 12, 10]} />
          <meshStandardMaterial color={STEEL} metalness={0.5} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.13, -0.6]}>
          <sphereGeometry args={[0.07, 10, 8]} />
          <meshBasicMaterial color="#0ea5e9" toneMapped={false} />
        </mesh>
        {/* Long straight glider wings with team-coloured tips */}
        <mesh position={[0, 0.02, -0.05]}>
          <boxGeometry args={[3.0, 0.035, 0.28]} />
          <meshStandardMaterial color={HULL} metalness={0.5} roughness={0.4} />
          <Edges color={DARK} />
        </mesh>
        {[-1, 1].map(side => (
          <mesh key={side} position={[side * 1.45, 0.03, -0.05]}>
            <boxGeometry args={[0.1, 0.04, 0.29]} />
            <meshBasicMaterial color={teamColor} toneMapped={false} />
          </mesh>
        ))}
        {/* V-tail */}
        {[-1, 1].map(side => (
          <mesh key={side} position={[side * 0.17, 0.13, 0.62]} rotation={[0, 0, side * -0.7]}>
            <boxGeometry args={[0.38, 0.03, 0.2]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
        ))}
        {/* Pusher prop */}
        <mesh position={[0, 0, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.06, 0.1, 8]} />
          <meshStandardMaterial color={DARK} />
        </mesh>
        <group ref={propRef} position={[0, 0, 0.84]}>
          {[0, Math.PI / 2].map(r => (
            <mesh key={r} rotation={[0, 0, r]}>
              <boxGeometry args={[0.5, 0.04, 0.015]} />
              <meshStandardMaterial color="#94a3b8" transparent opacity={0.7} />
            </mesh>
          ))}
        </group>
        {/* Rotodome on two struts */}
        {[-0.18, 0.18].map(z => (
          <mesh key={z} position={[0, 0.2, z]}>
            <boxGeometry args={[0.04, 0.22, 0.05]} />
            <meshStandardMaterial color={STEEL} />
          </mesh>
        ))}
        <group ref={domeRef} position={[0, 0.34, 0]}>
          <mesh>
            <cylinderGeometry args={[0.45, 0.45, 0.08, 24]} />
            <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.2, 0.44, 24, 1, 0, Math.PI]} />
            <meshBasicMaterial color={radarOn ? '#4ade80' : '#475569'} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <boxGeometry args={[0.9, 0.012, 0.05]} />
            <meshBasicMaterial color={DARK} />
          </mesh>
        </group>
      </group>
    </Float>
  );
};
