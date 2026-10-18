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

// Aegis: a six-wheeled carrier with a quad flak mount that tracks the sky.
export const AegisModel: React.FC<{ teamColor: string; firing: boolean }> = ({ teamColor, firing }) => {
  const turret = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (turret.current) turret.current.rotation.y += delta * (firing ? 3 : 0.4);
  });
  return (
    <group scale={[2.6, 2.6, 2.6]}>
      <mesh position={[0, 0.55, 0]}>
        <boxGeometry args={[1.2, 0.45, 2.3]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
        <Edges color={DARK} />
      </mesh>
      <mesh position={[0, 0.85, -0.85]}>
        <boxGeometry args={[1.0, 0.35, 0.55]} />
        <meshStandardMaterial color={HULL} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.9, -1.13]}>
        <planeGeometry args={[0.85, 0.2]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
      </mesh>
      {[-0.75, 0, 0.75].flatMap(z => [-0.66, 0.66].map(x => (
        <mesh key={`${x},${z}`} position={[x, 0.32, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.22, 10]} />
          <meshStandardMaterial color="#0f172a" roughness={0.9} />
        </mesh>
      )))}
      {/* Flak turret */}
      <group ref={turret} position={[0, 0.95, 0.35]}>
        <mesh>
          <cylinderGeometry args={[0.45, 0.5, 0.25, 12]} />
          <meshStandardMaterial color={HULL} metalness={0.7} />
        </mesh>
        <group position={[0, 0.3, 0]} rotation={[-0.9, 0, 0]}>
          {[[-0.16, -0.08], [0.16, -0.08], [-0.16, 0.12], [0.16, 0.12]].map(([x, y], i) => (
            <mesh key={i} position={[x, y, -0.35]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.8, 8]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.55, 0.4, 0.3]} />
            <meshStandardMaterial color={STEEL} />
            <Edges color={DARK} />
          </mesh>
        </group>
        <mesh position={[0, 0.14, 0]}>
          <torusGeometry args={[0.47, 0.03, 6, 16]} />
          <meshBasicMaterial color={teamColor} toneMapped={false} />
        </mesh>
      </group>
      {/* Radar mast */}
      <mesh position={[0.45, 1.25, -0.6]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
      <mesh position={[0.45, 1.55, -0.6]}>
        <sphereGeometry args={[0.05]} />
        <meshBasicMaterial color={teamColor} />
      </mesh>
    </group>
  );
};

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

// Thunderhead: a six-wheeled gun truck. On the move the barrel lies forward over the cab; when
// anchored, stabiliser legs swing out and down, and the gun turns to its target and elevates.
// `aim` is the world point it last fired at, if any.
export const ThunderheadModel: React.FC<{ teamColor: string; deployed: boolean; aim: THREE.Vector3 | null }> = ({ teamColor, deployed, aim }) => {
  const turret = useRef<THREE.Group>(null);
  const barrel = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group[]>([]);
  const scratch = useRef({ q: new THREE.Quaternion(), p: new THREE.Vector3(), d: new THREE.Vector3() });
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 4);
    // Legs fold out to the sides and plant; the barrel lifts once planted.
    for (const leg of legs.current) {
      if (!leg) continue;
      leg.rotation.z += ((deployed ? 1.1 : 0) * Math.sign(leg.position.x) - leg.rotation.z) * k;
    }
    if (barrel.current) barrel.current.rotation.x += ((deployed ? 0.75 : 0) - barrel.current.rotation.x) * k;
    const t = turret.current;
    if (!t || !t.parent) return;
    let yaw = 0;
    if (deployed && aim) {
      const { q, p, d } = scratch.current;
      t.getWorldPosition(p);
      t.parent.getWorldQuaternion(q);
      d.copy(aim).sub(p).applyQuaternion(q.invert());
      yaw = Math.atan2(-d.x, -d.z);
    }
    // Turn the short way round.
    let diff = yaw - t.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    t.rotation.y += diff * k;
  });
  return (
    <group scale={[2.6, 2.6, 2.6]}>
      {/* Chassis and armoured cab at the front (-Z) */}
      <mesh position={[0, 0.5, 0.15]}>
        <boxGeometry args={[1.15, 0.28, 2.5]} />
        <meshStandardMaterial color={STEEL} metalness={0.6} roughness={0.35} />
        <Edges color={DARK} />
      </mesh>
      <mesh position={[0, 0.85, -0.85]}>
        <boxGeometry args={[1.05, 0.45, 0.6]} />
        <meshStandardMaterial color={HULL} metalness={0.6} />
        <Edges color={DARK} />
      </mesh>
      <mesh position={[0, 0.92, -1.16]}>
        <boxGeometry args={[0.85, 0.16, 0.02]} />
        <meshBasicMaterial color="#38bdf8" toneMapped={false} />
      </mesh>
      {/* Six wheels */}
      {[-0.85, 0.2, 0.95].flatMap(z => [-0.64, 0.64].map(x => (
        <mesh key={`${x},${z}`} position={[x, 0.3, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.3, 0.3, 0.22, 10]} />
          <meshStandardMaterial color="#0f172a" roughness={0.9} />
        </mesh>
      )))}
      {/* Stabiliser legs, hinged at the deck edge */}
      {[[-0.58, -0.3], [0.58, -0.3], [-0.58, 1.2], [0.58, 1.2]].map(([x, z], i) => (
        <group key={i} ref={g => { if (g) legs.current[i] = g; }} position={[x, 0.6, z]}>
          <mesh position={[0, -0.25, 0]}>
            <boxGeometry args={[0.1, 0.5, 0.1]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.8} />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <boxGeometry args={[0.22, 0.05, 0.22]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
        </group>
      ))}
      {/* Turntable and gun */}
      <group ref={turret} position={[0, 0.72, 0.45]}>
        <mesh>
          <cylinderGeometry args={[0.45, 0.5, 0.2, 12]} />
          <meshStandardMaterial color={HULL} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.25, 0.1]}>
          <boxGeometry args={[0.7, 0.35, 0.7]} />
          <meshStandardMaterial color={STEEL} metalness={0.6} />
          <Edges color={DARK} />
        </mesh>
        {[-0.36, 0.36].map(x => (
          <mesh key={x} position={[x, 0.25, 0.1]}>
            <boxGeometry args={[0.02, 0.08, 0.6]} />
            <meshBasicMaterial color={teamColor} toneMapped={false} />
          </mesh>
        ))}
        <group ref={barrel} position={[0, 0.3, -0.15]}>
          <mesh position={[0, 0, -1.0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.08, 0.1, 2.0, 10]} />
            <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Rail coils along the barrel */}
          {[-0.5, -1.0, -1.5].map(z => (
            <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.12, 0.03, 6, 12]} />
              <meshBasicMaterial color={teamColor} toneMapped={false} />
            </mesh>
          ))}
          <mesh position={[0, 0, -2.02]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.12, 10]} />
            <meshStandardMaterial color={DARK} />
          </mesh>
        </group>
      </group>
    </group>
  );
};

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
