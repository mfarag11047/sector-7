// Models for the units added in the playable build: Razorback, Aegis and Hornet, plus the
// gear that sets Troopers and Lancers apart from the Ghost (they share its soldier mesh).
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

// Razorback: a low, fast raider buggy with a roll cage and a pintle gun.
export const RazorbackModel: React.FC<{ teamColor: string }> = ({ teamColor }) => (
  <group scale={[2.5, 2.5, 2.5]}>
    {/* Chassis, wedge nose forward (-Z) */}
    <mesh position={[0, 0.45, 0.1]}>
      <boxGeometry args={[1.1, 0.3, 1.9]} />
      <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
      <Edges color={DARK} />
    </mesh>
    <mesh position={[0, 0.42, -0.95]} rotation={[0.45, 0, 0]}>
      <boxGeometry args={[1.0, 0.18, 0.5]} />
      <meshStandardMaterial color={HULL} metalness={0.6} />
    </mesh>
    {/* Wheels */}
    {[[-0.62, -0.6], [0.62, -0.6], [-0.62, 0.65], [0.62, 0.65]].map(([x, z], i) => (
      <mesh key={i} position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.3, 0.3, 0.24, 10]} />
        <meshStandardMaterial color="#0f172a" roughness={0.9} />
      </mesh>
    ))}
    {/* Roll cage */}
    {[-0.42, 0.42].map(x => (
      <group key={x}>
        <mesh position={[x, 0.85, 0.05]}>
          <boxGeometry args={[0.06, 0.06, 1.0]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} />
        </mesh>
        <mesh position={[x, 0.7, -0.42]} rotation={[0.6, 0, 0]}>
          <boxGeometry args={[0.06, 0.06, 0.4]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.8} />
        </mesh>
      </group>
    ))}
    <mesh position={[0, 0.88, 0.05]}>
      <boxGeometry args={[0.9, 0.06, 0.06]} />
      <meshStandardMaterial color="#94a3b8" metalness={0.8} />
    </mesh>
    {/* Pintle gun on the rear deck */}
    <group position={[0, 1.0, 0.5]}>
      <mesh>
        <boxGeometry args={[0.22, 0.18, 0.3]} />
        <meshStandardMaterial color={DARK} />
      </mesh>
      <mesh position={[0, 0.02, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.5, 8]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} />
      </mesh>
    </group>
    {/* Team stripes and headlights */}
    {[-0.56, 0.56].map(x => (
      <mesh key={x} position={[x, 0.46, 0.1]}>
        <boxGeometry args={[0.02, 0.06, 1.6]} />
        <meshBasicMaterial color={teamColor} toneMapped={false} />
      </mesh>
    ))}
    {[-0.35, 0.35].map(x => (
      <mesh key={x} position={[x, 0.48, -1.07]}>
        <boxGeometry args={[0.18, 0.06, 0.02]} />
        <meshBasicMaterial color="#e0f2fe" toneMapped={false} />
      </mesh>
    ))}
  </group>
);

// Hornet: a twin-nacelle VTOL gunship with rocket pods under stub wings.
export const HornetModel: React.FC<{ teamColor: string }> = ({ teamColor }) => (
  <Float speed={2} rotationIntensity={0.15} floatIntensity={0.4} floatingRange={[0, 0.4]}>
    <group scale={[2.6, 2.6, 2.6]}>
      {/* Fuselage and canopy */}
      <mesh>
        <boxGeometry args={[0.6, 0.45, 1.8]} />
        <meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} />
        <Edges color={DARK} />
      </mesh>
      <mesh position={[0, 0.12, -0.85]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.45, 0.3, 0.5]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh position={[0, 0.1, 1.05]}>
        <boxGeometry args={[0.18, 0.18, 0.6]} />
        <meshStandardMaterial color={HULL} />
      </mesh>
      <mesh position={[0, 0.32, 1.25]}>
        <boxGeometry args={[0.05, 0.4, 0.3]} />
        <meshStandardMaterial color={HULL} />
      </mesh>
      {/* Stub wings, rocket pods and tilt nacelles */}
      {[-1, 1].map(side => (
        <group key={side}>
          <mesh position={[side * 0.55, 0, 0.05]}>
            <boxGeometry args={[0.6, 0.06, 0.45]} />
            <meshStandardMaterial color={HULL} metalness={0.6} />
          </mesh>
          <mesh position={[side * 0.55, -0.16, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.55, 8]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
          <mesh position={[side * 0.55, -0.16, -0.33]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.09, 8]} />
            <meshBasicMaterial color="#f97316" toneMapped={false} />
          </mesh>
          <group position={[side * 0.95, 0.05, 0.1]}>
            <mesh>
              <cylinderGeometry args={[0.17, 0.17, 0.5, 10]} />
              <meshStandardMaterial color={HULL} metalness={0.7} />
            </mesh>
            <mesh position={[0, -0.3, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.13, 0.45, 8, 1, true]} />
              <meshBasicMaterial color={teamColor} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          </group>
          <mesh position={[side * 0.31, 0, -0.3]}>
            <boxGeometry args={[0.02, 0.05, 0.9]} />
            <meshBasicMaterial color={teamColor} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* Chin gun */}
      <mesh position={[0, -0.28, -0.7]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.45, 8]} />
        <meshStandardMaterial color="#0f172a" metalness={0.8} />
      </mesh>
    </group>
  </Float>
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

// The "Kestrel" attack drone: a compact X-frame quadcopter with a machine gun slung under its
// nose (+z is forward), shrouded rotors and a team-coloured light bar. Smaller and meaner than
// the Infiltrator; the muzzle flash shows while it fires.
export const AttackDroneModel: React.FC<{ teamColor: string; flashRef: React.Ref<THREE.Mesh> }> = ({ teamColor, flashRef }) => {
  const rotors = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    rotors.current?.children.forEach((r, i) => { r.rotation.y += delta * (i % 2 ? -45 : 45); });
  });
  const arms: [number, number][] = [[0.75, 0.75], [-0.75, 0.75], [0.75, -0.75], [-0.75, -0.75]];
  return (
    <Float speed={2.5} rotationIntensity={0.1} floatIntensity={0.4} floatingRange={[0, 0.4]}>
      <group scale={[2.2, 2.2, 2.2]} rotation={[0.12, 0, 0]}>
        {/* Armoured body, angled nose, battery pack */}
        <mesh>
          <boxGeometry args={[0.55, 0.28, 0.8]} />
          <meshStandardMaterial color={HULL} metalness={0.7} roughness={0.35} />
          <Edges color={DARK} />
        </mesh>
        <mesh position={[0, -0.02, 0.48]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.45, 0.2, 0.25]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.18, -0.15]}>
          <boxGeometry args={[0.35, 0.1, 0.4]} />
          <meshStandardMaterial color={DARK} roughness={0.8} />
        </mesh>
        {/* Team light bar and sensor eye */}
        <mesh position={[0, 0.15, 0.25]}>
          <boxGeometry args={[0.4, 0.03, 0.05]} />
          <meshBasicMaterial color={teamColor} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.02, 0.62]}>
          <sphereGeometry args={[0.06, 10, 8]} />
          <meshBasicMaterial color="#ef4444" toneMapped={false} />
        </mesh>
        {/* X-frame arms with ducted rotors */}
        {arms.map(([x, z], i) => (
          <mesh key={i} position={[x / 2, 0.02, z / 2]} rotation={[0, Math.atan2(x, z), 0]}>
            <boxGeometry args={[0.08, 0.06, 1.05]} />
            <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        {arms.map(([x, z], i) => (
          <mesh key={`duct-${i}`} position={[x, 0.06, z]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.3, 0.04, 6, 16]} />
            <meshStandardMaterial color={DARK} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        <group ref={rotors}>
          {arms.map(([x, z], i) => (
            <group key={i} position={[x, 0.08, z]}>
              <mesh><boxGeometry args={[0.52, 0.01, 0.07]} /><meshBasicMaterial color="#cbd5e1" transparent opacity={0.55} /></mesh>
              <mesh rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[0.52, 0.01, 0.07]} /><meshBasicMaterial color="#cbd5e1" transparent opacity={0.55} /></mesh>
            </group>
          ))}
        </group>
        {/* Chin turret: mount, receiver, barrel shroud and muzzle */}
        <group position={[0, -0.24, 0.25]}>
          <mesh><cylinderGeometry args={[0.12, 0.14, 0.12, 10]} /><meshStandardMaterial color={DARK} metalness={0.6} /></mesh>
          <mesh position={[0, -0.08, 0.12]}><boxGeometry args={[0.14, 0.12, 0.3]} /><meshStandardMaterial color={STEEL} metalness={0.7} roughness={0.3} /></mesh>
          <mesh position={[0, -0.08, 0.5]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.04, 0.04, 0.55, 8]} /><meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} /></mesh>
          <mesh position={[0, -0.08, 0.36]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.065, 0.065, 0.22, 8]} /><meshStandardMaterial color={DARK} /></mesh>
          <mesh ref={flashRef} position={[0, -0.08, 0.85]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.14, 8, 6]} />
            <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </Float>
  );
};
