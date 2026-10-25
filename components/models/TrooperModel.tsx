// The Trooper, the basic infantry unit, built from the unit kit (components/kit).
//
// Simple but military: a soldier in full armour. Underneath, a body that reads as a person:
// tapered, smooth-shaded limbs and torso in a dark undersuit. Over it, angular, flat-faceted
// armour: a vest that wraps the torso with abdominal plates, layered shoulder plates edged in team
// colour, faceted forearm bracers, thigh and shin guards, angled knee pads and boots. A faceted
// combat helmet: a brow ridge, cheek guards down the sides, a wraparound visor with a lit line,
// and an angled faceplate with a vent. A backpack. Both hands on a plain futuristic rifle: a
// stock, a receiver, a magazine and grip, an optic, a handguard and a barrel, its muzzle flashing
// when it fires (`flashRef`, lit by Unit.tsx).
//
// It moves: it walks, legs swinging and knees bending in step; it carries the rifle low at the
// ready and brings it up to aim while it is fighting (`lastAttackTime`).
//
// The same armoured soldier carries other kit as other infantry (`pack` swaps the backpack: the
// Ghost's EW pack, GhostModel.tsx).
//
// Built facing +Z, about 1 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, smoothMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Strip, Turned } from '../kit/shapes';

type V3 = [number, number, number];
type Outline = [number, number][];
const SCALE = 3.6;
const HIP_Y = 0.54, HIP_X = 0.065;
const THIGH = 0.24, SHIN = 0.23;
// Hanging down: the kit's turned parts point along +Z; this turns +Z to -Y.
const DOWN: V3 = [Math.PI / 2, 0, 0];
// The armoured vest round the torso, top views [right, forward] matched point for point: its
// lower edge and its shoulders.
const VEST_LOW: Outline = [[-0.09, -0.07], [0.09, -0.07], [0.115, -0.03], [0.11, 0.05], [0.06, 0.085], [-0.06, 0.085], [-0.11, 0.05], [-0.115, -0.03]];
const VEST_HIGH: Outline = [[-0.11, -0.085], [0.11, -0.085], [0.15, -0.035], [0.145, 0.05], [0.075, 0.1], [-0.075, 0.1], [-0.145, 0.05], [-0.15, -0.035]];
const VEST_Y = 0.6, VEST_H = 0.21;
// The helmet, faceted: its rim, its widest line at the brow, and its crown.
const HELM_RIM: Outline = [[-0.055, -0.08], [0.055, -0.08], [0.078, -0.04], [0.078, 0.045], [0.05, 0.085], [-0.05, 0.085], [-0.078, 0.045], [-0.078, -0.04]];
const HELM_BROW: Outline = [[-0.065, -0.095], [0.065, -0.095], [0.09, -0.04], [0.088, 0.05], [0.058, 0.1], [-0.058, 0.1], [-0.088, 0.05], [-0.09, -0.04]];
const HELM_CROWN: Outline = [[-0.05, -0.075], [0.05, -0.075], [0.07, -0.03], [0.066, 0.035], [0.038, 0.07], [-0.038, 0.07], [-0.066, 0.035], [-0.07, -0.03]];
const HELM_Y = 0.85, BROW_Y = 0.94, CROWN_Y = 0.985;

// A tapered limb from one point to another: a turned part aimed between them. Few `segments`
// make it a faceted guard rather than a round limb.
const Segment: React.FC<{ from: V3; to: V3; r: [number, number]; material: THREE.Material; segments?: number }> = ({ from, to, r, material, segments = 10 }) => {
  const { q, len } = useMemo(() => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    return { len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()) };
  }, [from, to]);
  return (
    <group position={from} quaternion={q}>
      <Turned profile={[[r[0] * 0.8, 0], [r[0], len * 0.15], [r[1], len * 0.85], [r[1] * 0.8, len]]} segments={segments} material={material} />
    </group>
  );
};

// Points along a segment, for the armour laid over part of it.
const along = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// The arms, from the shoulder line: shoulder, elbow and hand on each side. The right hand
// (on -X, facing +Z) holds the grip, the left the handguard.
const R_SHOULDER: V3 = [-0.165, -0.01, 0], R_ELBOW: V3 = [-0.185, -0.18, 0.05], R_HAND: V3 = [-0.085, -0.15, 0.16];
const L_SHOULDER: V3 = [0.165, -0.01, 0], L_ELBOW: V3 = [0.15, -0.16, 0.11], L_HAND: V3 = [-0.04, -0.105, 0.3];
const R_BRACER: [V3, V3] = [along(R_ELBOW, R_HAND, 0.2), along(R_ELBOW, R_HAND, 0.75)];
const L_BRACER: [V3, V3] = [along(L_ELBOW, L_HAND, 0.2), along(L_ELBOW, L_HAND, 0.75)];

export interface SoldierProps { teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }

export const TrooperModel: React.FC<SoldierProps> = props => <ArmouredSoldier {...props} />;

// The soldier, with its backpack or other kit on its back (`pack`, drawn in the soldier's own
// units, the back of the torso at z = -0.1).
export const ArmouredSoldier: React.FC<SoldierProps & { pack?: React.ReactNode }> = ({ teamColor, moving, lastAttackTime, flashRef, pack }) => {
  const suit = smoothMaterial('armourDark'), glove = smoothMaterial('composite');
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
      {/* The legs, swinging from the hips: thighs with guards, angled knee pads, shins with
          guards, boots. */}
      {[1, -1].map((s, i) => (
        <group key={s} ref={g => { legs.current[i] = g; }} position={[s * HIP_X, HIP_Y, 0]}>
          <Turned profile={[[0.05, 0], [0.062, 0.04], [0.054, 0.17], [0.042, THIGH]]} segments={10} material={suit} rotation={DOWN} />
          <Plate size={[0.09, 0.15, 0.03]} material={armour} position={[0, -0.1, 0.05]} rotation={[-0.06, 0, 0]} />
          <Plate size={[0.03, 0.12, 0.08]} material={armour} position={[s * 0.05, -0.1, 0.01]} rotation={[0, 0, s * 0.08]} />
          <group ref={g => { shins.current[i] = g; }} position={[0, -THIGH, 0]}>
            <Plate size={[0.07, 0.06, 0.035]} material={composite} position={[0, 0.0, 0.048]} rotation={[0.35, 0, 0]} />
            <Plate size={[0.05, 0.03, 0.03]} material={composite} position={[0, -0.04, 0.05]} rotation={[-0.3, 0, 0]} />
            <Turned profile={[[0.042, 0], [0.046, 0.05], [0.035, 0.18], [0.032, SHIN]]} segments={10} material={suit} rotation={DOWN} />
            <Plate size={[0.075, 0.13, 0.026]} material={armour} position={[0, -0.12, 0.042]} rotation={[0.05, 0, 0]} />
            <Plate size={[0.088, 0.075, 0.12]} material={composite} position={[0, -SHIN - 0.03, 0.0]} />
            <Plate size={[0.082, 0.045, 0.07]} material={composite} position={[0, -SHIN - 0.045, 0.085]} />
            <Plate size={[0.09, 0.02, 0.19]} material={black} position={[0, -SHIN - 0.064, 0.035]} />
          </group>
        </group>
      ))}

      <group ref={body}>
        {/* Hips and belt, the torso in its undersuit, the armoured vest, abdominal plates,
            backpack. */}
        <Plate size={[0.2, 0.09, 0.13]} radius={0.025} material={dark} position={[0, HIP_Y + 0.03, 0]} />
        <Plate size={[0.21, 0.035, 0.14]} material={composite} position={[0, HIP_Y + 0.07, 0]} />
        {[-0.07, 0.07].map(x => <Plate key={x} size={[0.04, 0.05, 0.03]} material={composite} position={[x, HIP_Y + 0.06, 0.075]} />)}
        <group position={[0, HIP_Y + 0.05, 0]} scale={[1, 1, 0.7]}>
          <Turned profile={[[0.085, 0], [0.09, 0.08], [0.115, 0.17], [0.125, 0.22], [0.095, 0.255], [0.001, 0.265]]} segments={12} material={suit} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        <Loft bottom={VEST_LOW} top={VEST_HIGH} height={VEST_H} material={armour} position={[0, VEST_Y, 0]} />
        <Plate size={[0.2, 0.025, 0.17]} material={dark} position={[0, VEST_Y + VEST_H + 0.005, 0.0]} />
        {[0.585, 0.55].map((y, k) => <Plate key={y} size={[0.13 - k * 0.02, 0.035, 0.03]} material={armour} position={[0, y, 0.07 - k * 0.005]} rotation={[0.12, 0, 0]} />)}
        {pack ?? (
          <group>
            <Plate size={[0.17, 0.2, 0.08]} material={composite} position={[0, 0.72, -0.13]} />
            <Plate size={[0.13, 0.06, 0.04]} material={dark} position={[0, 0.66, -0.18]} />
            <Turned profile={[[0.025, -0.06], [0.025, 0.06]]} segments={8} material={dark} position={[0, 0.84, -0.13]} rotation={[0, Math.PI / 2, 0]} />
          </group>
        )}

        {/* Layered shoulder plates, edged in team colour. */}
        {[1, -1].map(s => (
          <group key={s} position={[s * 0.16, 0.8, 0]}>
            <Plate size={[0.1, 0.03, 0.13]} material={armour} rotation={[0, 0, -s * 0.4]} />
            <Plate size={[0.09, 0.025, 0.115]} material={armour} position={[s * 0.035, -0.04, 0]} rotation={[0, 0, -s * 0.85]} />
            <Plate size={[0.02, 0.012, 0.132]} material={paint} position={[s * 0.048, -0.018, 0]} rotation={[0, 0, -s * 0.4]} />
          </group>
        ))}

        {/* Neck and the faceted helmet: rim to brow to crown, a brow ridge, cheek guards, a
            wraparound visor with a lit line, an angled faceplate with a vent. */}
        <Turned profile={[[0.035, 0], [0.032, 0.05]]} segments={10} material={suit} position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        <Loft bottom={HELM_RIM} top={HELM_BROW} height={BROW_Y - HELM_Y} material={armour} position={[0, HELM_Y, 0]} />
        <Loft bottom={HELM_BROW} top={HELM_CROWN} height={CROWN_Y - BROW_Y} material={armour} position={[0, BROW_Y, 0]} />
        <Plate size={[0.13, 0.016, 0.03]} material={armour} position={[0, BROW_Y + 0.005, 0.095]} />
        {[1, -1].map(s => <Plate key={s} size={[0.02, 0.07, 0.1]} material={armour} position={[s * 0.084, HELM_Y + 0.0, 0.02]} rotation={[0.1, 0, 0]} />)}
        <Plate size={[0.075, 0.032, 0.012]} material={black} position={[0, 0.918, 0.098]} />
        {[1, -1].map(s => <Plate key={s} size={[0.05, 0.03, 0.012]} material={black} position={[s * 0.066, 0.918, 0.077]} rotation={[0, s * 0.95, 0]} />)}
        <Strip size={[0.06, 0.005, 0.004]} material={glow(PALETTE.cyan)} position={[0, 0.918, 0.105]} />
        <group position={[0, 0.865, 0.08]} rotation={[0.3, 0, 0]}>
          <Plate size={[0.09, 0.05, 0.035]} material={composite} />
          {[-0.012, 0.0, 0.012].map(y => <Plate key={y} size={[0.05, 0.005, 0.038]} material={black} position={[0, y, 0.002]} />)}
        </group>

        {/* The arms and the rifle, held as one from the shoulders: low ready or aimed. */}
        <group ref={arms} position={[0, 0.78, 0]}>
          <Segment from={R_SHOULDER} to={R_ELBOW} r={[0.04, 0.034]} material={suit} />
          <Segment from={R_ELBOW} to={R_HAND} r={[0.034, 0.029]} material={suit} />
          <Segment from={R_BRACER[0]} to={R_BRACER[1]} r={[0.042, 0.037]} material={armour} segments={5} />
          <Segment from={L_SHOULDER} to={L_ELBOW} r={[0.04, 0.034]} material={suit} />
          <Segment from={L_ELBOW} to={L_HAND} r={[0.034, 0.029]} material={suit} />
          <Segment from={L_BRACER[0]} to={L_BRACER[1]} r={[0.042, 0.037]} material={armour} segments={5} />
          {[R_ELBOW, L_ELBOW].map((p, i) => <Plate key={i} size={[0.05, 0.05, 0.05]} material={composite} position={p} rotation={[0.4, 0.4, 0]} />)}
          {[R_HAND, L_HAND].map((p, i) => <Plate key={i} size={[0.045, 0.05, 0.055]} radius={0.015} material={glove} position={p} />)}
          {/* The rifle: stock, receiver, grip and magazine, optic, handguard, barrel. */}
          <group position={[-0.06, -0.12, 0.16]}>
            <Plate size={[0.04, 0.065, 0.15]} material={composite} position={[0, -0.005, -0.15]} />
            <Plate size={[0.05, 0.08, 0.24]} material={dark} />
            <Plate size={[0.03, 0.07, 0.035]} material={black} position={[0, -0.065, -0.03]} rotation={[-0.3, 0, 0]} />
            <Plate size={[0.03, 0.09, 0.045]} material={black} position={[0, -0.08, 0.05]} rotation={[0.25, 0, 0]} />
            <Turned profile={[[0.018, -0.045], [0.02, -0.03], [0.02, 0.03], [0.018, 0.045]]} segments={8} material={steel} position={[0, 0.06, -0.01]} />
            <Strip size={[0.02, 0.02, 0.004]} material={glow(PALETTE.amber)} position={[0, 0.06, 0.037]} />
            <Turned profile={[[0.022, 0.11], [0.026, 0.13], [0.026, 0.26], [0.02, 0.28]]} segments={6} material={composite} />
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
