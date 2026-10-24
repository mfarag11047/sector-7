// The Hornet gunship, built from the unit kit (components/kit).
//
// Simple but military: an armoured VTOL attack drone. An angular hull with a sloped nose, armoured
// side pods carrying team stripes, a sensor eye on the spine, and four ducted fans on pylons at the
// corners. Under the nose, the gun bay: a recessed housing with an autocannon that turns to what
// the Hornet is shooting at (`aimRef`) and flashes at the muzzle (`flashRef`). With Hunter-Killer
// Rockets researched, a block of rocket tubes rides on each side pod.
//
// It moves: the rotors spin, and it bobs and banks gently as it hovers.
//
// Built facing +Z, about 2.2 across in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 2.4;
// Hull side profile: [forward, up], a sloped nose over the gun bay.
const HULL: [number, number][] = [[-0.85, -0.12], [-0.85, 0.24], [-0.62, 0.38], [0.32, 0.38], [0.82, 0.14], [0.9, -0.04], [0.7, -0.2], [-0.62, -0.22]];
// A side pod, side view: its front cut back.
const POD: [number, number][] = [[-0.55, -0.22], [-0.55, 0.26], [0.32, 0.26], [0.55, 0.0], [0.5, -0.22]];
// The four fans: [right, forward].
const FANS: [number, number][] = [[-1.0, 0.55], [1.0, 0.55], [-1.0, -0.58], [1.0, -0.58]];
const FAN_R = 0.3;
// A pylon from each side pod out to its fan's ring.
const PYLONS = FANS.map(([x, z]) => {
  const from = [Math.sign(x) * 0.62, z * 0.55], to = [x - Math.sign(x) * FAN_R, z];
  const dx = to[0] - from[0], dz = to[1] - from[1];
  return { len: Math.hypot(dx, dz), mid: [(from[0] + to[0]) / 2, 0.08, (from[1] + to[1]) / 2] as [number, number, number], yaw: -Math.atan2(dz, dx) };
});
const TUBES: [number, number][] = [[-0.07, 0.07], [0.07, 0.07], [-0.07, -0.07], [0.07, -0.07]];

export const HornetModel: React.FC<{
  teamColor: string;
  // Hunter-Killer Rockets researched: rocket pods on the sides.
  rockets?: boolean;
  // Where the gun should point, in world space, or null.
  aimRef?: React.MutableRefObject<THREE.Vector3 | null>;
  flashRef?: React.Ref<THREE.Mesh>;
}> = ({ teamColor, rockets, aimRef, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);

  const body = useRef<THREE.Group>(null);
  const rotors = useRef<(THREE.Group | null)[]>([]);
  const gun = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    rotors.current.forEach((r, i) => { if (r) r.rotation.y += delta * (i % 2 ? -30 : 30); });
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.6) * 0.06;
      body.current.rotation.z = Math.sin(t * 0.9) * 0.04;
      body.current.rotation.x = 0.06 + Math.sin(t * 1.2) * 0.02;
    }
    // The gun turns toward its target, else back to the front.
    const g = gun.current;
    if (!g || !g.parent) return;
    let yaw = 0;
    const aim = aimRef?.current;
    if (aim) {
      const local = g.parent.worldToLocal(scratch.copy(aim));
      yaw = Math.max(-1.2, Math.min(1.2, Math.atan2(local.x - g.position.x, local.z - g.position.z)));
    }
    g.rotation.y += (yaw - g.rotation.y) * Math.min(1, delta * 6);
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* Hull, spine, sensor eye, antenna, team colour on top. */}
        <Prism outline={HULL} depth={0.78} axis="x" material={armour} />
        <Plate size={[0.4, 0.08, 0.8]} material={dark} position={[0, 0.42, -0.2]} />
        <Plate size={[0.3, 0.012, 0.3]} material={paint} position={[0, 0.466, -0.35]} />
        <group position={[0, 0.38, 0.22]}>
          <Turned profile={[[0.1, 0], [0.1, 0.06], [0.06, 0.12], [0.001, 0.13]]} segments={8} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
          <Strip size={[0.06, 0.04, 0.02]} material={glow(PALETTE.cyan)} position={[0, 0.07, 0.09]} />
        </group>
        <group position={[-0.25, 0.46, -0.6]}>
          <Turned profile={[[0.008, 0], [0.005, 0.4]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.15, 0, 0]} />
        </group>

        {/* Armoured side pods with team stripes; rocket tubes on them once researched. */}
        {[-1, 1].map(s => (
          <group key={s} position={[s * 0.52, 0, -0.05]}>
            <Prism outline={POD} depth={0.3} axis="x" material={armour} />
            {[-0.06, 0.06].map(z => <Plate key={z} size={[0.012, 0.3, 0.06]} material={paint} position={[s * 0.156, 0.03, z - 0.1]} rotation={[-0.35, 0, 0]} />)}
            <Plate size={[0.3, 0.04, 0.7]} material={composite} position={[0, 0.28, -0.1]} />
            {rockets && (
              <group position={[0, 0.42, -0.05]}>
                <Plate size={[0.3, 0.3, 0.5]} material={dark} />
                {TUBES.map(([x, y]) => (
                  <Turned key={`${x}${y}`} profile={[[0.055, 0.25], [0.055, 0.3], [0.035, 0.3], [0.035, 0.26]]} segments={8} material={black} position={[x, y, 0]} />
                ))}
              </group>
            )}
          </group>
        ))}

        {/* Four ducted fans on pylons: a ring, a hub, two rotor blades; nav lights. */}
        {FANS.map(([x, z], i) => (
          <group key={i}>
            <Plate size={[PYLONS[i].len, 0.08, 0.14]} material={dark} position={PYLONS[i].mid} rotation={[0, PYLONS[i].yaw, 0]} />
            <group position={[x, 0.08, z]} rotation={[0.12, 0, 0]}>
              <Turned profile={[[FAN_R, -0.08], [FAN_R + 0.06, -0.08], [FAN_R + 0.06, 0.08], [FAN_R, 0.08]]} segments={12} material={armour} rotation={[-Math.PI / 2, 0, 0]} />
              <Turned profile={[[0.06, -0.06], [0.06, 0.06]]} segments={8} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
              <group ref={g => { rotors.current[i] = g; }}>
                <Plate size={[FAN_R * 2 - 0.04, 0.012, 0.07]} material={black} />
                <Plate size={[0.07, 0.012, FAN_R * 2 - 0.04]} material={black} />
              </group>
              <Strip size={[0.04, 0.04, 0.04]} material={glow(x < 0 ? PALETTE.warning : PALETTE.repair)} position={[Math.sign(x) * (FAN_R + 0.07), 0, 0]} />
            </group>
          </group>
        ))}

        {/* The gun bay under the nose: a recessed housing and a turning autocannon. */}
        <Plate size={[0.42, 0.14, 0.4]} material={black} position={[0, -0.24, 0.48]} />
        <group ref={gun} position={[0, -0.3, 0.52]}>
          <Plate size={[0.22, 0.14, 0.24]} material={dark} />
          <Turned profile={[[0.035, 0.1], [0.035, 0.62]]} segments={8} material={steel} />
          <Turned profile={[[0.05, 0.6], [0.05, 0.7]]} segments={8} material={dark} />
          <mesh ref={flashRef} position={[0, 0, 0.8]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
