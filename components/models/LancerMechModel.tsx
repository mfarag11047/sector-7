// The Lancer, the anti-vehicle infantry unit, as a two-legged mech, built from the unit kit
// (components/kit).
//
// Simple but military: a heavy bipedal walker whose hull sits low, slung between its legs. A
// faceted armoured hull drawn in to a chin with a sensor cluster, a searchlight and an antenna on
// top; big hip housings on its flanks carry the legs. Two crouched legs with forward knees: huge
// armoured thigh blocks running down from the hips to gridded knee pads, shins with hydraulic
// rams back to broad clawed feet. On each shoulder an arm carries a rocket pod (an ammunition drum
// and a face of four tubes) over a machine gun; the arms come up while it fights and kick back on
// each shot, the gun's muzzle flashing (`lastAttackTime`, the flash lit by Unit.tsx through
// `flashRef`). Team colour on the shoulder plates.
//
// It moves: it walks, the legs posed each frame by a two-link solve from hip to foot
// (kit/legs.ts), the hull bobbing and swaying with each step.
//
// Built facing +Z, about 2 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { poseLeg } from '../kit/legs';
import { ContactShadow, Loft, Plate, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.0;
// The hips, on the hull's flanks, and the crouched legs below them.
const HIP_Y = 1.0, HIP_X = 0.5;
const THIGH = 0.66, SHIN = 0.66;
// The hull, slung low between the legs: top views [right, forward] matched point for point, its
// belly and its shoulders.
const BELLY: [number, number][] = [[-0.2, -0.26], [0.2, -0.26], [0.26, -0.1], [0.24, 0.2], [0.1, 0.34], [-0.1, 0.34], [-0.24, 0.2], [-0.26, -0.1]];
const SHOULDERS: [number, number][] = [[-0.32, -0.36], [0.32, -0.36], [0.42, -0.14], [0.38, 0.16], [0.18, 0.3], [-0.18, 0.3], [-0.38, 0.16], [-0.42, -0.14]];
const HULL_Y = 0.56, HULL_H = 0.86;
const SHOULDER_X = 0.6, SHOULDER_Y = 1.36;

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
    // The arms come up while it is fighting and kick back on each shot.
    const since = lastAttackTime ? Date.now() - lastAttackTime : Infinity;
    state.raise += ((since < 4000 ? 1 : 0) - state.raise) * (1 - Math.exp(-dt * 4));
    const kick = since < 250 ? (1 - since / 250) * 0.12 : 0;

    const bob = Math.abs(Math.sin(state.stride)) * 0.05 * state.walk;
    const drop = -0.04 * state.walk + bob;
    if (body.current) {
      body.current.position.y = drop;
      body.current.rotation.z = Math.sin(state.stride) * 0.035 * state.walk;
    }
    arms.current.forEach((a, i) => {
      if (!a) return;
      a.rotation.x = -0.2 * state.raise - (i === 0 ? kick : kick * 0.6);
      a.position.z = -kick * 0.5;
    });
    [0, 1].forEach(i => {
      const h = hips.current[i], th = thighs.current[i], kn = knees.current[i], ft = feet.current[i];
      if (!h || !th || !kn || !ft) return;
      const hipY = HIP_Y + drop;
      h.position.set((i ? -1 : 1) * HIP_X, hipY, 0);
      const s = state.stride + i * Math.PI;
      const fx = Math.cos(s) * 0.22 * state.walk - 0.02;
      const fy = -hipY + Math.max(0, Math.sin(s)) * 0.14 * state.walk;
      ft.position.set(fx, fy, 0);
      poseLeg(THIGH, SHIN, fx, fy, th, kn);
    });
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[1.7, 1.3]} />
      <group ref={body}>
        {/* The hull, slung between the legs: faceted armour from belly to shoulders, a top deck. */}
        <Loft bottom={BELLY} top={SHOULDERS} height={HULL_H} material={armour} position={[0, HULL_Y, 0]} />
        <Plate size={[0.4, 0.1, 0.5]} material={dark} position={[0, HULL_Y - 0.04, -0.02]} />
        <Plate size={[0.7, 0.08, 0.6]} material={composite} position={[0, HULL_Y + HULL_H + 0.04, -0.04]} />
        <Plate size={[0.44, 0.07, 0.42]} material={armour} position={[0, HULL_Y + HULL_H + 0.11, -0.06]} />
        {/* The hip housings on the flanks that carry the legs. */}
        {[-1, 1].map(s => (
          <group key={s}>
            <Plate size={[0.22, 0.4, 0.46]} material={dark} position={[s * 0.36, HIP_Y, -0.02]} />
            <Plate size={[0.06, 0.32, 0.38]} material={composite} position={[s * 0.48, HIP_Y + 0.02, -0.02]} />
          </group>
        ))}
        {/* The chin: a sensor cluster, a vent; headlights above. */}
        <group position={[0, HULL_Y + 0.3, 0.31]} rotation={[0.28, 0, 0]}>
          <Plate size={[0.18, 0.24, 0.06]} material={black} />
          {[0.06, -0.02].map(y => (
            <group key={y} position={[0, y, 0.03]}>
              <Turned profile={[[0.03, 0], [0.03, 0.02]]} segments={8} material={dark} />
              <Strip size={[0.028, 0.028, 0.008]} material={glow(y > 0 ? PALETTE.warning : PALETTE.amber)} position={[0, 0, 0.022]} />
            </group>
          ))}
          {[-0.07, -0.09].map(y => <Plate key={y} size={[0.12, 0.008, 0.07]} material={dark} position={[0, y, 0]} />)}
        </group>
        {[-1, 1].map(s => (
          <group key={s} position={[s * 0.19, HULL_Y + HULL_H - 0.16, 0.25]}>
            <Plate size={[0.12, 0.12, 0.04]} material={dark} />
            {[-0.03, 0.03].map(x => [-0.03, 0.03].map(y => <Strip key={`${x}${y}`} size={[0.04, 0.04, 0.01]} material={glow(PALETTE.headlight)} position={[x, y, 0.022]} />))}
          </group>
        ))}
        {/* On top: a searchlight, a box, an antenna. */}
        <group position={[0.1, HULL_Y + HULL_H + 0.21, 0.0]}>
          <Turned profile={[[0.07, -0.08], [0.07, 0.08], [0.06, 0.09]]} segments={8} material={steel} />
          <Strip size={[0.1, 0.1, 0.01]} material={glow(PALETTE.headlight, 0.8)} position={[0, 0, 0.092]} />
        </group>
        <Plate size={[0.14, 0.08, 0.12]} material={dark} position={[-0.12, HULL_Y + HULL_H + 0.19, -0.12]} />
        <Turned profile={[[0.008, 0], [0.005, 0.4]]} segments={4} material={black} position={[-0.2, HULL_Y + HULL_H + 0.15, -0.22]} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />

        {/* An arm on each shoulder: a joint, a team plate, a rocket pod over a machine gun. */}
        {[1, -1].map((s, i) => (
          <group key={s}>
            <Wheel radius={0.13} width={0.18} segments={8} material={composite} position={[s * (SHOULDER_X - 0.16), SHOULDER_Y, -0.04]} />
            <Plate size={[0.24, 0.06, 0.34]} material={paint} position={[s * (SHOULDER_X - 0.1), SHOULDER_Y + 0.16, -0.06]} rotation={[0, 0, -s * 0.15]} />
            <group ref={g => { arms.current[i] = g; }} position={[s * SHOULDER_X, SHOULDER_Y, -0.04]}>
              {/* The arm's housing. */}
              <Plate size={[0.22, 0.3, 0.42]} material={dark} position={[0, -0.04, 0.08]} />
              {/* The rocket pod on top: a housing, an ammunition drum, four tubes. */}
              <group position={[0, 0.17, 0.2]}>
                <Plate size={[0.26, 0.22, 0.6]} material={armour} />
                <Turned profile={[[0.07, -0.12], [0.07, 0.12]]} segments={8} material={housing} position={[s * 0.15, 0.0, -0.1]} />
                <group position={[0, 0, 0.31]}>
                  <Plate size={[0.26, 0.22, 0.03]} material={black} />
                  {[[-0.06, 0.05], [0.06, 0.05], [-0.06, -0.05], [0.06, -0.05]].map(([x, y]) => (
                    <group key={`${x}${y}`} position={[x, y, 0.015]}>
                      <Turned profile={[[0.04, 0], [0.04, 0.02], [0.03, 0.02], [0.03, 0.0]]} segments={8} material={steel} />
                      <Strip size={[0.026, 0.026, 0.008]} material={amber} position={[0, 0, 0.004]} />
                    </group>
                  ))}
                </group>
              </group>
              {/* The machine gun underneath: a receiver, a feed, twin barrels in a shroud. */}
              <group position={[0, -0.16, 0.24]}>
                <Plate size={[0.16, 0.14, 0.4]} material={composite} />
                <Plate size={[0.06, 0.1, 0.14]} material={housing} position={[-s * 0.1, 0.02, -0.08]} />
                <Turned profile={[[0.065, 0.2], [0.065, 0.44], [0.05, 0.46]]} segments={8} material={dark} />
                {[-0.028, 0.028].map(x => <Turned key={x} profile={[[0.022, 0.44], [0.022, 0.66], [0.03, 0.66], [0.03, 0.7]]} segments={6} material={black} position={[x, 0, 0]} />)}
                {i === 0 && (
                  <mesh ref={flashRef} position={[0, 0, 0.82]} visible={false} raycast={() => null}>
                    <sphereGeometry args={[0.14, 8, 6]} />
                    <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
                  </mesh>
                )}
              </group>
            </group>
          </group>
        ))}
      </group>

      {/* The legs, posed every frame from the hips: the thigh block and its knee pad, the knee,
          the shin with a ram, the foot. */}
      {[0, 1].map(i => (
        <group key={i} ref={g => { hips.current[i] = g; }} rotation={[0, -Math.PI / 2, 0]}>
          <Wheel radius={0.16} width={0.3} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
          <group ref={g => { thighs.current[i] = g; }}>
            <Plate size={[THIGH + 0.1, 0.36, 0.34]} material={dark} position={[THIGH / 2 - 0.02, 0.02, 0]} />
            <Plate size={[THIGH * 0.85, 0.08, 0.4]} material={armour} position={[THIGH * 0.46, 0.22, 0]} />
            <Plate size={[THIGH * 0.7, 0.3, 0.05]} material={armour} position={[THIGH * 0.45, 0.04, 0.2]} />
            <Plate size={[THIGH * 0.7, 0.3, 0.05]} material={armour} position={[THIGH * 0.45, 0.04, -0.2]} />
            {/* The knee pad, gridded, on the front of the knee. */}
            <group position={[THIGH - 0.02, 0.22, 0]}>
              <Plate size={[0.38, 0.14, 0.38]} material={composite} />
              {[-0.09, 0, 0.09].map(x => <Plate key={x} size={[0.014, 0.146, 0.38]} material={black} position={[x, 0, 0]} />)}
              {[-0.09, 0, 0.09].map(z => <Plate key={z} size={[0.38, 0.146, 0.014]} material={black} position={[0, 0, z]} />)}
            </group>
          </group>
          <group ref={g => { knees.current[i] = g; }}>
            <Wheel radius={0.15} width={0.34} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
            <Plate size={[SHIN, 0.22, 0.24]} material={dark} position={[SHIN / 2, 0, 0]} />
            <Plate size={[SHIN * 0.72, 0.06, 0.3]} material={armour} position={[SHIN * 0.45, 0.14, 0]} />
            <Turned profile={[[0.032, 0], [0.032, SHIN * 0.7]]} segments={6} material={steel} position={[0.06, -0.15, 0]} rotation={[0, Math.PI / 2, 0]} />
          </group>
          <group ref={g => { feet.current[i] = g; }}>
            <Plate size={[0.52, 0.08, 0.34]} material={composite} position={[0.07, 0.04, 0]} />
            {[-0.1, 0.1].map(z => <Plate key={z} size={[0.14, 0.06, 0.1]} material={black} position={[0.37, 0.03, z]} rotation={[0, 0, -0.2]} />)}
            <Plate size={[0.12, 0.06, 0.14]} material={black} position={[-0.23, 0.03, 0]} />
            <Plate size={[0.22, 0.14, 0.24]} material={dark} position={[0, 0.13, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
};
