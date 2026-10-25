// The Trooper, the basic infantry unit, built from the unit kit (components/kit).
//
// Simple but military: a soldier in full armour, built round rather than boxy so it reads as a
// person. Tapered, smooth-shaded limbs and torso in a dark undersuit; armour over them (chest and
// back plates, abdominal plates, thigh and shin guards, knee pads, forearm bracers, rounded
// shoulder pauldrons banded in team colour); a full rounded helmet with a wraparound visor and a
// lit visor line over a rebreather; a backpack; boots. Both hands on a plain futuristic rifle: a
// stock, a receiver, a magazine and grip, an optic, a handguard and a barrel, its muzzle flashing
// when it fires (`flashRef`, lit by Unit.tsx).
//
// It moves: it walks, legs swinging and knees bending in step; it carries the rifle low at the
// ready and brings it up to aim while it is fighting (`lastAttackTime`).
//
// Built facing +Z, about 1 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, smoothMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Strip, Turned } from '../kit/shapes';

type V3 = [number, number, number];
const SCALE = 3.6;
const HIP_Y = 0.54, HIP_X = 0.065;
const THIGH = 0.24, SHIN = 0.23;
// Hanging down: the kit's turned parts point along +Z; this turns +Z to -Y.
const DOWN: V3 = [Math.PI / 2, 0, 0];

// A tapered limb from one point to another: a turned part aimed between them.
const Segment: React.FC<{ from: V3; to: V3; r: [number, number]; material: THREE.Material }> = ({ from, to, r, material }) => {
  const { q, len } = useMemo(() => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    return { len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()) };
  }, [from, to]);
  return (
    <group position={from} quaternion={q}>
      <Turned profile={[[r[0] * 0.8, 0], [r[0], len * 0.15], [r[1], len * 0.85], [r[1] * 0.8, len]]} segments={10} material={material} />
    </group>
  );
};

// Points along a segment, for the armour laid over part of it.
const along = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The arms, from the shoulder line: shoulder, elbow and hand on each side. The right hand
// (on -X, facing +Z) holds the grip, the left the handguard.
const R_SHOULDER: V3 = [-0.165, -0.01, 0], R_ELBOW: V3 = [-0.185, -0.18, 0.05], R_HAND: V3 = [-0.085, -0.15, 0.16];
const L_SHOULDER: V3 = [0.165, -0.01, 0], L_ELBOW: V3 = [0.15, -0.16, 0.11], L_HAND: V3 = [-0.04, -0.105, 0.3];

export const TrooperModel: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, moving, lastAttackTime, flashRef }) => {
  const armour = smoothMaterial('armour'), suit = smoothMaterial('armourDark'), gear = smoothMaterial('composite');
  const plate = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
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
      {/* The legs, swinging from the hips: thighs with guards, knee pads, shins with guards, boots. */}
      {[1, -1].map((s, i) => (
        <group key={s} ref={g => { legs.current[i] = g; }} position={[s * HIP_X, HIP_Y, 0]}>
          <Turned profile={[[0.05, 0], [0.062, 0.04], [0.054, 0.17], [0.042, THIGH]]} segments={10} material={suit} rotation={DOWN} />
          <Plate size={[0.085, 0.14, 0.03]} radius={0.008} material={plate} position={[0, -0.11, 0.05]} />
          <group ref={g => { shins.current[i] = g; }} position={[0, -THIGH, 0]}>
            <Turned profile={[[0.03, -0.02], [0.042, 0.0], [0.038, 0.02], [0.001, 0.03]]} segments={8} material={gear} position={[0, 0, 0.03]} />
            <Turned profile={[[0.042, 0], [0.046, 0.05], [0.035, 0.18], [0.032, SHIN]]} segments={10} material={suit} rotation={DOWN} />
            <Plate size={[0.07, 0.14, 0.024]} radius={0.007} material={plate} position={[0, -0.11, 0.043]} />
            <Plate size={[0.085, 0.07, 0.17]} radius={0.015} material={composite} position={[0, -SHIN - 0.035, 0.03]} />
            <Plate size={[0.088, 0.02, 0.18]} radius={0.006} material={black} position={[0, -SHIN - 0.064, 0.03]} />
          </group>
        </group>
      ))}

      <group ref={body}>
        {/* Hips and belt, the torso in its undersuit, chest, back and abdominal plates, backpack. */}
        <Plate size={[0.2, 0.09, 0.13]} radius={0.025} material={dark} position={[0, HIP_Y + 0.03, 0]} />
        <Plate size={[0.21, 0.035, 0.14]} radius={0.01} material={composite} position={[0, HIP_Y + 0.07, 0]} />
        {[-0.07, 0.07].map(x => <Plate key={x} size={[0.04, 0.05, 0.03]} radius={0.006} material={composite} position={[x, HIP_Y + 0.06, 0.075]} />)}
        <group position={[0, HIP_Y + 0.05, 0]} scale={[1, 1, 0.7]}>
          <Turned profile={[[0.085, 0], [0.09, 0.08], [0.115, 0.17], [0.125, 0.22], [0.095, 0.255], [0.001, 0.265]]} segments={12} material={suit} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        <Plate size={[0.23, 0.15, 0.05]} radius={0.02} material={plate} position={[0, 0.735, 0.06]} rotation={[-0.08, 0, 0]} />
        {[0.645, 0.6].map(y => <Plate key={y} size={[0.14 - (0.645 - y), 0.04, 0.03]} radius={0.008} material={plate} position={[0, y, 0.065]} />)}
        <Plate size={[0.22, 0.17, 0.04]} radius={0.02} material={plate} position={[0, 0.72, -0.07]} />
        <Plate size={[0.17, 0.19, 0.08]} radius={0.02} material={composite} position={[0, 0.72, -0.12]} />
        <Turned profile={[[0.025, -0.06], [0.025, 0.06]]} segments={8} material={dark} position={[0, 0.83, -0.12]} rotation={[0, Math.PI / 2, 0]} />

        {/* Rounded shoulder pauldrons banded in team colour. */}
        {[1, -1].map(s => (
          <group key={s} position={[s * 0.155, 0.795, 0]} rotation={[0, 0, -s * 0.35]}>
            <Turned profile={[[0.068, -0.01], [0.065, 0.012], [0.045, 0.035], [0.001, 0.045]]} segments={12} material={armour} rotation={[0, s * Math.PI / 2, 0]} />
            <Turned profile={[[0.07, -0.006], [0.07, 0.006]]} segments={12} material={paint} rotation={[0, s * Math.PI / 2, 0]} />
          </group>
        ))}

        {/* Neck and helmet: a rounded shell, a wraparound visor with a lit line, a rebreather. */}
        <Turned profile={[[0.035, 0], [0.032, 0.05]]} segments={10} material={suit} position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        <group position={[0, 0.835, -0.005]} scale={[1, 1, 1.12]}>
          <Turned profile={[[0.07, 0], [0.082, 0.03], [0.088, 0.07], [0.084, 0.11], [0.066, 0.145], [0.035, 0.165], [0.001, 0.17]]} segments={16} material={armour} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        <Plate size={[0.06, 0.035, 0.014]} radius={0.005} material={black} position={[0, 0.925, 0.096]} />
        {[1, -1].map(s => <Plate key={s} size={[0.05, 0.035, 0.014]} radius={0.005} material={black} position={[s * 0.05, 0.925, 0.082]} rotation={[0, s * 0.6, 0]} />)}
        <Strip size={[0.05, 0.006, 0.004]} material={glow(PALETTE.cyan)} position={[0, 0.925, 0.104]} />
        <Plate size={[0.075, 0.045, 0.04]} radius={0.012} material={composite} position={[0, 0.865, 0.08]} />
        {[1, -1].map(s => <Turned key={s} profile={[[0.016, 0], [0.016, 0.02]]} segments={8} material={dark} position={[s * 0.04, 0.86, 0.09]} rotation={[0, s * 0.6, 0]} />)}

        {/* The arms and the rifle, held as one from the shoulders: low ready or aimed. */}
        <group ref={arms} position={[0, 0.78, 0]}>
          <Segment from={R_SHOULDER} to={R_ELBOW} r={[0.04, 0.034]} material={suit} />
          <Segment from={R_ELBOW} to={R_HAND} r={[0.034, 0.029]} material={suit} />
          <Segment from={along(R_ELBOW, R_HAND, 0.2)} to={along(R_ELBOW, R_HAND, 0.75)} r={[0.039, 0.035]} material={armour} />
          <Segment from={L_SHOULDER} to={L_ELBOW} r={[0.04, 0.034]} material={suit} />
          <Segment from={L_ELBOW} to={L_HAND} r={[0.034, 0.029]} material={suit} />
          <Segment from={along(L_ELBOW, L_HAND, 0.2)} to={along(L_ELBOW, L_HAND, 0.75)} r={[0.039, 0.035]} material={armour} />
          {[R_ELBOW, L_ELBOW].map((p, i) => <Plate key={i} size={[0.05, 0.05, 0.05]} radius={0.015} material={composite} position={p} />)}
          {[R_HAND, L_HAND].map((p, i) => <Plate key={i} size={[0.045, 0.05, 0.055]} radius={0.015} material={gear} position={p} />)}
          {/* The rifle: stock, receiver, grip and magazine, optic, handguard, barrel. */}
          <group position={[-0.06, -0.12, 0.16]}>
            <Plate size={[0.04, 0.065, 0.15]} radius={0.01} material={composite} position={[0, -0.005, -0.15]} />
            <Plate size={[0.05, 0.08, 0.24]} radius={0.01} material={dark} />
            <Plate size={[0.03, 0.07, 0.035]} radius={0.006} material={black} position={[0, -0.065, -0.03]} rotation={[-0.3, 0, 0]} />
            <Plate size={[0.03, 0.09, 0.045]} radius={0.006} material={black} position={[0, -0.08, 0.05]} rotation={[0.25, 0, 0]} />
            <Turned profile={[[0.018, -0.045], [0.02, -0.03], [0.02, 0.03], [0.018, 0.045]]} segments={10} material={steel} position={[0, 0.06, -0.01]} />
            <Strip size={[0.02, 0.02, 0.004]} material={glow(PALETTE.amber)} position={[0, 0.06, 0.037]} />
            <Turned profile={[[0.022, 0.11], [0.026, 0.13], [0.026, 0.26], [0.02, 0.28]]} segments={10} material={composite} />
            <Turned profile={[[0.011, 0.27], [0.011, 0.36], [0.017, 0.36], [0.017, 0.39]]} segments={8} material={black} />
            <mesh ref={flashRef} position={[0, 0, 0.44]} visible={false} raycast={() => null}>
              <sphereGeometry args={[0.05, 8, 6]} />
              <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
};
