// The "Kestrel" attack drone, built from the unit kit (components/kit).
//
// Simple but military, and small beside the other drones: a compact faceted body carried on four
// long blade arms that flare out and up in an X, each with a fan set into it near the body, a red
// accent along its edge and serrations underneath. On the front, the sensor array (a big round
// lens and a column of red-ringed lenses); under the front, a short twin gun whose muzzle flashes
// while it fires (`flashRef`, lit by Unit.tsx).
//
// It moves: the fans spin, and it bobs and tilts gently as it hovers.
//
// Built facing +Z, about 0.9 long in its own units, and scaled up here.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 1.7;
// Body side profile: [forward, up], faceted fore and aft.
const BODY: [number, number][] = [[-0.36, -0.24], [-0.42, 0.0], [-0.32, 0.2], [0.26, 0.2], [0.4, 0.06], [0.38, -0.2], [0.24, -0.3], [-0.24, -0.3]];
const BODY_W = 0.42;
// The arms, from the body's corners: [right, forward] signs.
const ARMS: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
const ARM_LEN = 0.8, ARM_TILT = 0.38;
const FAN_AT = 0.32, FAN_R = 0.11;

export const AttackDroneModel: React.FC<{ teamColor: string; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const red = glow(PALETTE.warning);

  const body = useRef<THREE.Group>(null);
  const fans = useRef<(THREE.Group | null)[]>([]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    fans.current.forEach((f, i) => { if (f) f.rotation.y += delta * (i % 2 ? -40 : 40); });
    if (body.current) {
      body.current.position.y = Math.sin(t * 2.2) * 0.04;
      body.current.rotation.x = 0.1 + Math.sin(t * 1.3) * 0.03;
      body.current.rotation.z = Math.sin(t * 1.7) * 0.04;
    }
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The body: faceted armour, a spine, team colour, red accents, a rear pack. */}
        <Prism outline={BODY} depth={BODY_W} axis="x" material={composite} />
        <Plate size={[0.24, 0.06, 0.5]} material={dark} position={[0, 0.23, -0.04]} />
        <Plate size={[0.16, 0.012, 0.2]} material={paint} position={[0, 0.266, 0.02]} />
        {[-1, 1].map(s => (
          <group key={s}>
            <Plate size={[0.012, 0.28, 0.05]} material={paint} position={[s * (BODY_W / 2 + 0.006), -0.04, 0.0]} rotation={[-0.35, 0, 0]} />
            <Strip size={[0.012, 0.02, 0.3]} material={red} position={[s * (BODY_W / 2 + 0.006), 0.12, -0.05]} />
          </group>
        ))}
        <Plate size={[0.3, 0.2, 0.12]} material={armour} position={[0, -0.04, -0.44]} />

        {/* The sensor array on the front: a big round lens, a column of red-ringed lenses. */}
        <group position={[0, -0.02, 0.39]}>
          <Plate size={[0.3, 0.32, 0.03]} material={black} position={[0, 0, 0]} />
          <Turned profile={[[0.07, 0], [0.07, 0.03]]} segments={10} material={dark} position={[-0.06, 0.04, 0.01]} />
          <Strip size={[0.08, 0.08, 0.012]} material={glow(PALETTE.headlight)} position={[-0.06, 0.04, 0.045]} />
          {[0.1, 0.0, -0.1].map(y => (
            <group key={y} position={[0.09, y, 0.01]}>
              <Turned profile={[[0.035, 0], [0.035, 0.025]]} segments={8} material={red} />
              <Turned profile={[[0.024, 0.02], [0.024, 0.035]]} segments={8} material={black} />
            </group>
          ))}
        </group>

        {/* The gun under the front: a mount and twin short barrels. */}
        <group position={[0, -0.32, 0.22]}>
          <Plate size={[0.16, 0.08, 0.16]} material={dark} />
          {[-0.035, 0.035].map(x => <Turned key={x} profile={[[0.022, 0.06], [0.022, 0.3], [0.03, 0.3], [0.03, 0.33]]} segments={6} material={steel} position={[x, -0.01, 0]} />)}
          <mesh ref={flashRef} position={[0, -0.01, 0.42]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>

        {/* Four blade arms flaring out and up, each with a fan, a red edge and serrations. */}
        {ARMS.map(([sx, sz], i) => (
          <group key={i} position={[sx * 0.18, 0.06, sz * 0.16]} rotation={[0, Math.atan2(-sz, sx), 0]}>
            <group rotation={[0, 0, ARM_TILT]}>
              <Plate size={[ARM_LEN, 0.05, 0.2]} material={armour} position={[ARM_LEN / 2, 0, 0]} />
              <Plate size={[0.2, 0.05, 0.08]} material={armour} position={[ARM_LEN - 0.04, 0.03, 0.11]} rotation={[0, 0.5, 0]} />
              <Strip size={[ARM_LEN - 0.3, 0.02, 0.02]} material={red} position={[ARM_LEN / 2 + 0.1, 0.03, -0.1]} />
              {[0.5, 0.6, 0.7].map(x => <Plate key={x} size={[0.04, 0.05, 0.03]} material={dark} position={[x, -0.045, -0.085]} />)}
              <group position={[FAN_AT, 0, 0]}>
                <Turned profile={[[FAN_R, -0.035], [FAN_R + 0.03, -0.035], [FAN_R + 0.03, 0.035], [FAN_R, 0.035]]} segments={10} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
                <group ref={g => { fans.current[i] = g; }}>
                  <Plate size={[FAN_R * 2 - 0.02, 0.008, 0.035]} material={black} />
                  <Plate size={[0.035, 0.008, FAN_R * 2 - 0.02]} material={black} />
                </group>
              </group>
              <Strip size={[0.03, 0.03, 0.03]} material={glow(PALETTE.amber)} position={[ARM_LEN, 0.03, 0]} />
            </group>
          </group>
        ))}
        <Plate size={[0.1, 0.1, 0.1]} material={housing} position={[0, 0.3, -0.25]} />
      </group>
    </group>
  );
};
