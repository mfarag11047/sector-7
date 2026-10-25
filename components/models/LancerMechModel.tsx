// The Lancer, the anti-vehicle infantry unit, as a two-legged mech, built from the unit kit
// (components/kit).
//
// Simple but military: a heavy bipedal walker. A faceted armoured torso, broad at the shoulders and
// drawn in to a chin with a sensor cluster, a searchlight and an antenna on top; a weapon pod on
// each shoulder (a long housing with an ammunition drum and a face of rocket tubes) that it brings
// up and kicks back when it fires (`lastAttackTime`, its muzzle flash lit by Unit.tsx through
// `flashRef`). Two thick legs with forward knees: armoured thighs with big gridded knee pads,
// shins with hydraulic rams, and broad clawed feet. Team colour on the shoulder plates.
//
// It moves: it walks, the legs posed each frame by a two-link solve from hip to foot
// (kit/legs.ts), the torso bobbing and swaying with each step.
//
// Built facing +Z, about 2.2 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { poseLeg } from '../kit/legs';
import { ContactShadow, Loft, Plate, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 1.9;
const HIP_Y = 1.08, HIP_X = 0.31;
const THIGH = 0.58, SHIN = 0.58;
// The torso, top views [right, forward] matched point for point: its waist and its shoulders.
const WAIST: [number, number][] = [[-0.25, -0.28], [0.25, -0.28], [0.32, -0.11], [0.28, 0.28], [0.12, 0.39], [-0.12, 0.39], [-0.28, 0.28], [-0.32, -0.11]];
const SHOULDERS: [number, number][] = [[-0.35, -0.35], [0.35, -0.35], [0.46, -0.14], [0.41, 0.16], [0.18, 0.28], [-0.18, 0.28], [-0.41, 0.16], [-0.46, -0.14]];
const TORSO_Y = 1.2, TORSO_H = 0.58;
const SHOULDER_X = 0.64, SHOULDER_Y = 1.62;

export const LancerMechModel: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, moving, lastAttackTime, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber);

  const body = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Group | null)[]>([]);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const thighs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const feet = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ walk: 0, stride: 0, raise: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.walk += ((moving ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 6));
    state.stride += dt * 6 * state.walk;
    // Weapons come up while it is fighting and kick back on each shot.
    const since = lastAttackTime ? Date.now() - lastAttackTime : Infinity;
    state.raise += ((since < 4000 ? 1 : 0) - state.raise) * (1 - Math.exp(-dt * 4));
    const kick = since < 250 ? (1 - since / 250) * 0.12 : 0;

    const bob = Math.abs(Math.sin(state.stride)) * 0.05 * state.walk;
    const hipY = HIP_Y - 0.04 * state.walk + bob;
    if (body.current) {
      body.current.position.y = hipY - HIP_Y;
      body.current.rotation.z = Math.sin(state.stride) * 0.04 * state.walk;
    }
    arms.current.forEach((a, i) => {
      if (!a) return;
      a.rotation.x = -0.25 * state.raise - (i === 0 ? kick : kick * 0.6);
      a.position.z = -kick * 0.5;
    });
    [0, 1].forEach(i => {
      const h = hips.current[i], th = thighs.current[i], kn = knees.current[i], ft = feet.current[i];
      if (!h || !th || !kn || !ft) return;
      h.position.set((i ? -1 : 1) * HIP_X, hipY, 0);
      const s = state.stride + i * Math.PI;
      const fx = Math.cos(s) * 0.22 * state.walk + 0.04;
      const fy = -hipY + Math.max(0, Math.sin(s)) * 0.14 * state.walk;
      ft.position.set(fx, fy, 0);
      poseLeg(THIGH, SHIN, fx, fy, th, kn);
    });
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[1.5, 1.2]} />
      <group ref={body}>
        {/* Pelvis and torso: faceted armour drawn in to the chin. */}
        <Plate size={[0.56, 0.24, 0.4]} material={dark} position={[0, HIP_Y + 0.04, -0.02]} />
        <Loft bottom={WAIST} top={SHOULDERS} height={TORSO_H} material={armour} position={[0, TORSO_Y, 0]} />
        <Plate size={[0.72, 0.08, 0.58]} material={composite} position={[0, TORSO_Y + TORSO_H + 0.04, -0.04]} />
        <Plate size={[0.46, 0.06, 0.4]} material={armour} position={[0, TORSO_Y + TORSO_H + 0.11, -0.06]} />
        {/* The chin: a sensor cluster, a vent, a light. */}
        <group position={[0, TORSO_Y + 0.18, 0.36]} rotation={[0.25, 0, 0]}>
          <Plate size={[0.18, 0.22, 0.06]} material={black} />
          {[0.05, -0.03].map(y => (
            <group key={y} position={[0, y, 0.03]}>
              <Turned profile={[[0.03, 0], [0.03, 0.02]]} segments={8} material={dark} />
              <Strip size={[0.028, 0.028, 0.008]} material={glow(y > 0 ? PALETTE.warning : PALETTE.amber)} position={[0, 0, 0.022]} />
            </group>
          ))}
          {[-0.07, -0.09].map(y => <Plate key={y} size={[0.12, 0.008, 0.07]} material={dark} position={[0, y, 0]} />)}
        </group>
        {[-1, 1].map(s => <Strip key={s} size={[0.06, 0.06, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.2, TORSO_Y + 0.42, 0.25]} />)}
        {/* On top: a searchlight, a box, an antenna. */}
        <group position={[0.1, TORSO_Y + TORSO_H + 0.2, 0.0]}>
          <Turned profile={[[0.07, -0.08], [0.07, 0.08], [0.06, 0.09]]} segments={8} material={steel} />
          <Strip size={[0.1, 0.1, 0.01]} material={glow(PALETTE.headlight, 0.8)} position={[0, 0, 0.092]} />
        </group>
        <Plate size={[0.14, 0.08, 0.12]} material={dark} position={[-0.12, TORSO_Y + TORSO_H + 0.18, -0.12]} />
        <Turned profile={[[0.008, 0], [0.005, 0.4]]} segments={4} material={black} position={[-0.2, TORSO_Y + TORSO_H + 0.14, -0.22]} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />

        {/* A weapon pod on each shoulder: a joint, a team-coloured plate, the housing with its
            ammunition drum, and a face of rocket tubes. */}
        {[1, -1].map((s, i) => (
          <group key={s}>
            <Wheel radius={0.12} width={0.16} segments={8} material={composite} position={[s * (SHOULDER_X - 0.14), SHOULDER_Y, -0.02]} />
            <Plate size={[0.2, 0.06, 0.32]} material={paint} position={[s * (SHOULDER_X - 0.08), SHOULDER_Y + 0.15, -0.04]} rotation={[0, 0, -s * 0.15]} />
            <group ref={g => { arms.current[i] = g; }} position={[s * SHOULDER_X, SHOULDER_Y, -0.02]}>
              <Plate size={[0.28, 0.3, 0.78]} material={dark} position={[0, 0, 0.24]} />
              <Plate size={[0.3, 0.06, 0.64]} material={armour} position={[0, 0.17, 0.22]} />
              <Turned profile={[[0.08, -0.14], [0.08, 0.14]]} segments={8} material={housing} position={[s * 0.15, 0.04, 0.12]} />
              <Plate size={[0.06, 0.04, 0.5]} material={housing} position={[-s * 0.13, -0.06, 0.24]} />
              <group position={[0, 0, 0.635]}>
                <Plate size={[0.3, 0.32, 0.04]} material={black} />
                {[[-0.06, 0.06], [0.06, 0.06], [-0.06, -0.06], [0.06, -0.06]].map(([x, y]) => (
                  <group key={`${x}${y}`} position={[x, y, 0.02]}>
                    <Turned profile={[[0.045, 0], [0.045, 0.02], [0.034, 0.02], [0.034, 0.0]]} segments={8} material={steel} />
                    <Strip size={[0.03, 0.03, 0.008]} material={amber} position={[0, 0, 0.004]} />
                  </group>
                ))}
                {i === 0 && (
                  <mesh ref={flashRef} position={[0, 0, 0.18]} visible={false} raycast={() => null}>
                    <sphereGeometry args={[0.16, 8, 6]} />
                    <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        ))}
      </group>

      {/* The legs, posed every frame: thigh with its knee pad, knee, shin with a ram, foot. */}
      {[0, 1].map(i => (
        <group key={i} ref={g => { hips.current[i] = g; }} rotation={[0, -Math.PI / 2, 0]}>
          <Wheel radius={0.13} width={0.24} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
          <group ref={g => { thighs.current[i] = g; }}>
            <Plate size={[THIGH, 0.28, 0.3]} material={dark} position={[THIGH / 2, 0, 0]} />
            <Plate size={[THIGH * 0.85, 0.07, 0.36]} material={armour} position={[THIGH * 0.48, 0.16, 0]} />
            {/* The knee pad, gridded, on the front of the knee. */}
            <group position={[THIGH - 0.02, 0.18, 0]}>
              <Plate size={[0.36, 0.14, 0.36]} material={composite} />
              {[-0.09, 0, 0.09].map(x => <Plate key={x} size={[0.014, 0.146, 0.36]} material={black} position={[x, 0, 0]} />)}
              {[-0.09, 0, 0.09].map(z => <Plate key={z} size={[0.36, 0.146, 0.014]} material={black} position={[0, 0, z]} />)}
            </group>
          </group>
          <group ref={g => { knees.current[i] = g; }}>
            <Wheel radius={0.14} width={0.32} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
            <Plate size={[SHIN, 0.22, 0.25]} material={dark} position={[SHIN / 2, 0, 0]} />
            <Plate size={[SHIN * 0.72, 0.06, 0.3]} material={armour} position={[SHIN * 0.45, 0.14, 0]} />
            <Turned profile={[[0.032, 0], [0.032, SHIN * 0.7]]} segments={6} material={steel} position={[0.06, -0.15, 0]} rotation={[0, Math.PI / 2, 0]} />
          </group>
          <group ref={g => { feet.current[i] = g; }}>
            <Plate size={[0.5, 0.08, 0.32]} material={composite} position={[0.07, 0.04, 0]} />
            {[-0.09, 0.09].map(z => <Plate key={z} size={[0.14, 0.06, 0.09]} material={black} position={[0.36, 0.03, z]} rotation={[0, 0, -0.2]} />)}
            <Plate size={[0.12, 0.06, 0.14]} material={black} position={[-0.22, 0.03, 0]} />
            <Plate size={[0.2, 0.14, 0.22]} material={dark} position={[0, 0.13, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
};
