// The Trooper, the basic infantry unit, built from the unit kit (components/kit).
//
// Simple but military: a soldier in full armour. A full helmet with a dark visor and a lit visor
// line, an armoured chest and a backpack, shoulder plates in team colour, plated arms and legs
// over a dark undersuit, and boots. Two hands on a plain futuristic rifle: a boxy receiver, a
// magazine, an optic and a short barrel, its muzzle flashing when it fires (`flashRef`, lit by
// Unit.tsx).
//
// It moves: it walks, legs swinging and knees bending in step; it carries the rifle low at the
// ready and brings it up to aim while it is fighting (`lastAttackTime`).
//
// Built facing +Z, about 1 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Strip, Turned } from '../kit/shapes';

const SCALE = 3.6;
const HIP_Y = 0.52, HIP_X = 0.07;
// The torso, top views [right, forward] matched point for point: waist and shoulders.
const WAIST: [number, number][] = [[-0.09, -0.06], [0.09, -0.06], [0.11, 0.0], [0.09, 0.07], [-0.09, 0.07], [-0.11, 0.0]];
const CHEST: [number, number][] = [[-0.13, -0.08], [0.13, -0.08], [0.16, 0.0], [0.13, 0.09], [-0.13, 0.09], [-0.16, 0.0]];

export const TrooperModel: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, moving, lastAttackTime, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), paint = teamPaint(teamColor);

  const body = useRef<THREE.Group>(null);
  const arms = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const shins = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ walk: 0, stride: 0, aim: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.walk += ((moving ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 8));
    state.stride += dt * 8 * state.walk;
    const since = lastAttackTime ? Date.now() - lastAttackTime : Infinity;
    state.aim += ((since < 3000 ? 1 : 0) - state.aim) * (1 - Math.exp(-dt * 6));
    if (body.current) body.current.position.y = Math.abs(Math.sin(state.stride)) * 0.015 * state.walk;
    // Low ready, or up at the shoulder to aim.
    if (arms.current) arms.current.rotation.x = 0.35 * (1 - state.aim);
    [0, 1].forEach(i => {
      const s = state.stride + i * Math.PI;
      const leg = legs.current[i], shin = shins.current[i];
      if (leg) leg.rotation.x = Math.sin(s) * 0.5 * state.walk;
      if (shin) shin.rotation.x = (0.05 + 0.6 * Math.max(0, Math.sin(s + 1.2))) * state.walk;
    });
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[0.45, 0.4]} />
      {/* The legs: plated thighs, knee pads, shins and boots, swinging from the hips. */}
      {[1, -1].map((s, i) => (
        <group key={s} ref={g => { legs.current[i] = g; }} position={[s * HIP_X, HIP_Y, 0]}>
          <Plate size={[0.09, 0.22, 0.1]} material={dark} position={[0, -0.11, 0]} />
          <Plate size={[0.1, 0.16, 0.04]} material={armour} position={[0, -0.1, 0.05]} />
          <group ref={g => { shins.current[i] = g; }} position={[0, -0.22, 0]}>
            <Plate size={[0.085, 0.2, 0.09]} material={dark} position={[0, -0.1, 0]} />
            <Plate size={[0.09, 0.15, 0.035]} material={armour} position={[0, -0.09, 0.05]} />
            <Plate size={[0.08, 0.06, 0.05]} material={composite} position={[0, 0.0, 0.055]} />
            <Plate size={[0.1, 0.07, 0.17]} material={composite} position={[0, -0.235, 0.03]} />
          </group>
        </group>
      ))}

      <group ref={body}>
        {/* Belt, torso, chest plate, backpack. */}
        <Plate size={[0.22, 0.08, 0.14]} material={composite} position={[0, HIP_Y + 0.02, 0]} />
        <Loft bottom={WAIST} top={CHEST} height={0.25} material={dark} position={[0, 0.57, 0]} />
        <Plate size={[0.22, 0.16, 0.04]} material={armour} position={[0, 0.71, 0.08]} rotation={[-0.1, 0, 0]} />
        <Plate size={[0.18, 0.2, 0.08]} material={composite} position={[0, 0.72, -0.12]} />
        {/* Shoulder plates in team colour. */}
        {[1, -1].map(s => (
          <group key={s} position={[s * 0.18, 0.8, 0]} rotation={[0, 0, -s * 0.35]}>
            <Plate size={[0.1, 0.04, 0.13]} material={armour} />
            <Plate size={[0.1, 0.012, 0.04]} material={paint} position={[0, 0.026, 0]} />
          </group>
        ))}
        {/* The helmet: a full shell, a jaw plate, a dark visor with a lit line. */}
        <Plate size={[0.07, 0.05, 0.07]} material={dark} position={[0, 0.85, 0]} />
        <group position={[0, 0.86, -0.005]} scale={[1, 1, 1.12]}>
          <Turned profile={[[0.075, 0], [0.085, 0.05], [0.082, 0.1], [0.062, 0.14], [0.001, 0.155]]} segments={8} material={armour} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        <Plate size={[0.11, 0.05, 0.04]} material={composite} position={[0, 0.885, 0.075]} />
        <Plate size={[0.13, 0.04, 0.03]} material={black} position={[0, 0.945, 0.08]} />
        <Strip size={[0.1, 0.008, 0.006]} material={glow(PALETTE.cyan)} position={[0, 0.945, 0.096]} />

        {/* The arms and the rifle, held as one from the shoulders: low ready or aimed. */}
        <group ref={arms} position={[0, 0.78, 0]}>
          {/* Right arm (on -X, facing +Z) to the grip; left arm across to the handguard. */}
          <Plate size={[0.07, 0.17, 0.08]} material={armour} position={[-0.18, -0.08, 0.03]} rotation={[-0.5, 0, 0]} />
          <Plate size={[0.065, 0.065, 0.16]} material={dark} position={[-0.13, -0.15, 0.13]} rotation={[0, 0.45, 0]} />
          <Plate size={[0.07, 0.17, 0.08]} material={armour} position={[0.18, -0.08, 0.03]} rotation={[-0.5, 0, 0]} />
          <Plate size={[0.065, 0.065, 0.22]} material={dark} position={[0.07, -0.13, 0.2]} rotation={[0, -0.8, 0]} />
          {/* The rifle: stock, receiver, magazine, optic, barrel. */}
          <group position={[-0.06, -0.12, 0.18]}>
            <Plate size={[0.045, 0.07, 0.14]} material={composite} position={[0, -0.005, -0.17]} />
            <Plate size={[0.055, 0.085, 0.26]} material={dark} />
            <Plate size={[0.035, 0.09, 0.05]} material={black} position={[0, -0.08, 0.03]} rotation={[0.25, 0, 0]} />
            <Plate size={[0.03, 0.035, 0.09]} material={steel} position={[0, 0.06, -0.01]} />
            <Strip size={[0.022, 0.022, 0.006]} material={glow(PALETTE.amber)} position={[0, 0.06, 0.037]} />
            <Turned profile={[[0.016, 0.13], [0.016, 0.27], [0.022, 0.27], [0.022, 0.3]]} segments={6} material={black} />
            <mesh ref={flashRef} position={[0, 0, 0.36]} visible={false} raycast={() => null}>
              <sphereGeometry args={[0.05, 8, 6]} />
              <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};
