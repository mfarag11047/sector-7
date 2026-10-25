// The Lancer, the anti-vehicle infantry unit, as a two-legged mech, built from the unit kit
// (components/kit).
//
// Simple but military: a heavy bipedal walker. Its hull is one compact armoured wedge, slung low
// between its legs: narrow at the belly, widest at the flanks where the legs hang, its big front
// face sloping back to the top; a sensor cluster on the chin, headlight clusters on the front
// face, a searchlight, a box and an antenna on top. Two crouched, digitigrade legs, each bent
// twice: a huge armoured thigh block forward to a gridded knee pad, a shin back to a raised
// ankle, then a foot segment forward to a broad clawed foot. On each upper flank an arm carries a
// rocket pod (an ammunition drum and a face of four tubes) over a twin-barrelled machine gun; the
// arms come up while it fights and kick back on each shot, the gun's muzzle flashing
// (`lastAttackTime`, the flash lit by Unit.tsx through `flashRef`). Team colour on the shoulders.
//
// It moves: it walks, each leg posed every frame from the foot up (the foot segment, then a
// two-link solve from hip to ankle, kit/legs.ts), the hull bobbing and swaying with each step.
//
// Built facing +Z, about 1.85 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { poseLeg } from '../kit/legs';
import { ContactShadow, Loft, Plate, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.3;
// The hull, one wedge: top views [right, forward] matched point for point, at its belly, its
// widest line (the flanks) and its top, which is set back so the front face slopes.
const BELLY: [number, number][] = [[-0.18, -0.22], [0.18, -0.22], [0.24, -0.1], [0.22, 0.14], [0.1, 0.26], [-0.1, 0.26], [-0.22, 0.14], [-0.24, -0.1]];
const FLANKS: [number, number][] = [[-0.34, -0.36], [0.34, -0.36], [0.46, -0.16], [0.44, 0.2], [0.2, 0.4], [-0.2, 0.4], [-0.44, 0.2], [-0.46, -0.16]];
const TOP: [number, number][] = [[-0.26, -0.36], [0.26, -0.36], [0.36, -0.2], [0.34, -0.02], [0.14, 0.08], [-0.14, 0.08], [-0.34, -0.02], [-0.36, -0.2]];
const BELLY_Y = 0.6, FLANKS_Y = 0.9, TOP_Y = 1.28;
// The legs: hips under the flanks; thigh and shin to the ankle; the foot segment from the ankle
// (back and up from the foot) down and forward to the foot.
const HIP_Y = 1.12, HIP_X = 0.56;
const THIGH = 0.56, SHIN = 0.54;
const ANKLE: [number, number] = [-0.24, 0.42];
// How far the hull and arms (drawn on shorter legs) are raised to sit on these.
const LIFT = 0.22;
const FOOT = Math.hypot(ANKLE[0], ANKLE[1]);
// The arms, on the upper flanks.
const SHOULDER_X = 0.56, SHOULDER_Y = 1.12;

export const LancerMechModel: React.FC<{ teamColor: string; moving?: boolean; lastAttackTime?: number; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, moving, lastAttackTime, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber);

  const body = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Group | null)[]>([]);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const thighs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const ankles = useRef<(THREE.Group | null)[]>([]);
  const feet = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ walk: 0, stride: 0, raise: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.walk += ((moving ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 6));
    state.stride += dt * 6 * state.walk;
    // The arms come up while it is fighting and kick back on each shot.
    const since = lastAttackTime ? Date.now() - lastAttackTime : Infinity;
    state.raise += ((since < 4000 ? 1 : 0) - state.raise) * (1 - Math.exp(-dt * 4));
    const kick = since < 250 ? (1 - since / 250) * 0.12 : 0;

    const bob = Math.abs(Math.sin(state.stride)) * 0.04 * state.walk;
    const drop = -0.03 * state.walk + bob;
    if (body.current) {
      body.current.position.y = LIFT + drop;
      body.current.rotation.z = Math.sin(state.stride) * 0.035 * state.walk;
    }
    arms.current.forEach((a, i) => {
      if (!a) return;
      a.rotation.x = -0.2 * state.raise - (i === 0 ? kick : kick * 0.6);
      a.position.z = -kick * 0.5;
    });
    [0, 1].forEach(i => {
      const h = hips.current[i], th = thighs.current[i], kn = knees.current[i], an = ankles.current[i], ft = feet.current[i];
      if (!h || !th || !kn || !an || !ft) return;
      const hipY = HIP_Y + drop;
      h.position.set((i ? -1 : 1) * HIP_X, hipY, 0);
      // The foot, on the ground or lifted and swung while it steps; the ankle back and up from it.
      const s = state.stride + i * Math.PI;
      const fx = Math.cos(s) * 0.2 * state.walk + 0.1;
      const fy = -hipY + Math.max(0, Math.sin(s)) * 0.12 * state.walk;
      ft.position.set(fx, fy, 0);
      const ax = fx + ANKLE[0], ay = fy + ANKLE[1];
      an.position.set(ax, ay, 0);
      an.rotation.z = Math.atan2(fy - ay, fx - ax);
      poseLeg(THIGH, SHIN, ax, ay, th, kn);
    });
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[1.7, 1.2]} />
      <group ref={body} position={[0, LIFT, 0]}>
        {/* The hull, one wedge: belly to flanks, flanks to the top. */}
        <Loft bottom={BELLY} top={FLANKS} height={FLANKS_Y - BELLY_Y} material={armour} position={[0, BELLY_Y, 0]} />
        <Loft bottom={FLANKS} top={TOP} height={TOP_Y - FLANKS_Y} material={armour} position={[0, FLANKS_Y, 0]} />
        {/* The chin: a sensor cluster and a vent on the lower front face. */}
        <group position={[0, 0.76, 0.34]} rotation={[0.45, 0, 0]}>
          <Plate size={[0.2, 0.18, 0.06]} material={dark} />
          {[-0.05, 0.05].map(x => (
            <group key={x} position={[x, 0.02, 0.03]}>
              <Turned profile={[[0.032, 0], [0.032, 0.02]]} segments={8} material={black} />
              <Strip size={[0.028, 0.028, 0.008]} material={glow(x > 0 ? PALETTE.warning : PALETTE.amber)} position={[0, 0, 0.022]} />
            </group>
          ))}
          {[-0.05, -0.07].map(y => <Plate key={y} size={[0.14, 0.008, 0.07]} material={black} position={[0, y, 0]} />)}
        </group>
        {/* Headlight clusters on the sloping front face. */}
        {[-1, 1].map(s => (
          <group key={s} position={[s * 0.2, 1.06, 0.26]} rotation={[-0.7, 0, 0]}>
            <Plate size={[0.13, 0.13, 0.03]} material={dark} />
            {[-0.03, 0.03].map(x => [-0.03, 0.03].map(y => <Strip key={`${x}${y}`} size={[0.045, 0.045, 0.01]} material={glow(PALETTE.headlight)} position={[x, y, 0.018]} />))}
          </group>
        ))}
        {/* On top: a searchlight, a box, an antenna. */}
        <group position={[0.1, TOP_Y + 0.07, -0.1]}>
          <Turned profile={[[0.06, -0.07], [0.06, 0.07], [0.05, 0.08]]} segments={8} material={steel} />
          <Strip size={[0.08, 0.08, 0.01]} material={glow(PALETTE.headlight, 0.8)} position={[0, 0, 0.082]} />
        </group>
        <Plate size={[0.14, 0.06, 0.12]} material={dark} position={[-0.12, TOP_Y + 0.03, -0.22]} />
        <Turned profile={[[0.008, 0], [0.005, 0.36]]} segments={4} material={black} position={[-0.22, TOP_Y, -0.28]} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />

        {/* An arm on each upper flank: a team plate, a rocket pod over a machine gun. */}
        {[1, -1].map((s, i) => (
          <group key={s}>
            <Plate size={[0.2, 0.05, 0.3]} material={paint} position={[s * 0.38, TOP_Y - 0.06, -0.14]} rotation={[0, 0, -s * 0.5]} />
            <group ref={g => { arms.current[i] = g; }} position={[s * SHOULDER_X, SHOULDER_Y, -0.08]}>
              <Wheel radius={0.11} width={0.14} segments={8} material={composite} position={[-s * 0.12, 0, 0]} />
              <Plate size={[0.2, 0.26, 0.36]} material={dark} position={[0, -0.02, 0.06]} />
              {/* The rocket pod on top: a housing, an ammunition drum, four tubes. */}
              <group position={[0, 0.15, 0.18]}>
                <Plate size={[0.24, 0.2, 0.56]} material={armour} />
                <Turned profile={[[0.065, -0.12], [0.065, 0.12]]} segments={8} material={housing} position={[s * 0.14, 0.0, -0.08]} />
                <group position={[0, 0, 0.29]}>
                  <Plate size={[0.24, 0.2, 0.03]} material={black} />
                  {[[-0.055, 0.045], [0.055, 0.045], [-0.055, -0.045], [0.055, -0.045]].map(([x, y]) => (
                    <group key={`${x}${y}`} position={[x, y, 0.015]}>
                      <Turned profile={[[0.038, 0], [0.038, 0.02], [0.028, 0.02], [0.028, 0.0]]} segments={8} material={steel} />
                      <Strip size={[0.024, 0.024, 0.008]} material={amber} position={[0, 0, 0.004]} />
                    </group>
                  ))}
                </group>
              </group>
              {/* The machine gun underneath: a receiver, a feed, twin barrels in a shroud. */}
              <group position={[0, -0.14, 0.2]}>
                <Plate size={[0.15, 0.13, 0.38]} material={composite} />
                <Plate size={[0.06, 0.1, 0.14]} material={housing} position={[-s * 0.1, 0.02, -0.08]} />
                <Turned profile={[[0.06, 0.19], [0.06, 0.42], [0.046, 0.44]]} segments={8} material={dark} />
                {[-0.026, 0.026].map(x => <Turned key={x} profile={[[0.02, 0.42], [0.02, 0.62], [0.028, 0.62], [0.028, 0.66]]} segments={6} material={black} position={[x, 0, 0]} />)}
                {i === 0 && (
                  <mesh ref={flashRef} position={[0, 0, 0.78]} visible={false} raycast={() => null}>
                    <sphereGeometry args={[0.13, 8, 6]} />
                    <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        ))}
      </group>

      {/* The legs, posed every frame: the thigh block and its knee pad, the shin with a ram, the
          foot segment from the ankle, the foot. */}
      {[0, 1].map(i => (
        <group key={i} ref={g => { hips.current[i] = g; }} rotation={[0, -Math.PI / 2, 0]}>
          <Wheel radius={0.15} width={0.32} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
          <group ref={g => { thighs.current[i] = g; }}>
            <Plate size={[THIGH + 0.12, 0.34, 0.32]} material={dark} position={[THIGH / 2 - 0.03, 0.02, 0]} />
            <Plate size={[THIGH * 0.85, 0.08, 0.38]} material={armour} position={[THIGH * 0.45, 0.2, 0]} />
            <Plate size={[THIGH * 0.75, 0.28, 0.05]} material={armour} position={[THIGH * 0.45, 0.03, 0.18]} />
            <Plate size={[THIGH * 0.75, 0.28, 0.05]} material={armour} position={[THIGH * 0.45, 0.03, -0.18]} />
            {/* The knee pad, gridded, on the front of the knee. */}
            <group position={[THIGH - 0.02, 0.2, 0]}>
              <Plate size={[0.32, 0.12, 0.34]} material={composite} />
              {[-0.08, 0, 0.08].map(x => <Plate key={x} size={[0.014, 0.126, 0.34]} material={black} position={[x, 0, 0]} />)}
              {[-0.08, 0, 0.08].map(z => <Plate key={z} size={[0.32, 0.126, 0.014]} material={black} position={[0, 0, z]} />)}
            </group>
          </group>
          <group ref={g => { knees.current[i] = g; }}>
            <Wheel radius={0.13} width={0.3} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
            <Plate size={[SHIN, 0.2, 0.22]} material={dark} position={[SHIN / 2, 0, 0]} />
            <Plate size={[SHIN * 0.7, 0.06, 0.28]} material={armour} position={[SHIN * 0.45, 0.12, 0]} />
            <Turned profile={[[0.03, 0], [0.03, SHIN * 0.75]]} segments={6} material={steel} position={[0.04, -0.13, 0]} rotation={[0, Math.PI / 2, 0]} />
          </group>
          <group ref={g => { ankles.current[i] = g; }}>
            <Wheel radius={0.1} width={0.26} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
            <Plate size={[FOOT, 0.14, 0.18]} material={dark} position={[FOOT / 2, 0, 0]} />
            <Plate size={[FOOT * 0.7, 0.05, 0.22]} material={composite} position={[FOOT * 0.45, -0.09, 0]} />
          </group>
          <group ref={g => { feet.current[i] = g; }}>
            <Plate size={[0.44, 0.08, 0.32]} material={composite} position={[0.02, 0.04, 0]} />
            {[-0.1, 0.1].map(z => <Plate key={z} size={[0.14, 0.06, 0.1]} material={black} position={[0.29, 0.03, z]} rotation={[0, 0, -0.2]} />)}
            <Plate size={[0.12, 0.06, 0.14]} material={black} position={[-0.24, 0.03, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
};
