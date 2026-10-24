// The Thunderhead mobile artillery (sim type `howitzer`), built from the unit kit
// (components/kit).
//
// Simple but military: an eight-wheeled armoured rocket truck. An angular armoured cab at the
// front with a sloped nose, light bars, a sensor ball and smoke dischargers on the roof, and team
// stripes on its flanks; a long rear deck lined with composite lockers; and on a turntable at the
// back, four armoured rocket pods, each a block of nine launch tubes with red lights at the muzzle.
//
// It moves: the wheels turn while it drives. Anchored, four stabiliser jacks push down onto the
// ground, and the launcher turns to its target and raises its pods.
//
// Built facing +Z, about 2.8 long in its own units, and scaled up here. The pods' muzzles face
// the launcher's -Z: back over the deck when stowed.

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.4;
// How high the raised pods' muzzles are above the model's base, in world units: where its rockets
// start their flight (CityMap).
export const THUNDERHEAD_LAUNCH_Y = 1.9 * SCALE;

// Chassis side profile: [forward, up].
const CHASSIS: [number, number][] = [[-1.4, 0.32], [-1.4, 0.7], [1.0, 0.7], [1.42, 0.56], [1.42, 0.42], [1.22, 0.32]];
// Cab side profile: a tall back, a sloped roof and nose.
const CAB: [number, number][] = [[0.3, 0.62], [0.3, 1.28], [0.82, 1.28], [1.3, 0.98], [1.44, 0.82], [1.44, 0.62]];
const CAB_W = 1.36;
const NOSE_SLOPE = Math.atan2(1.28 - 0.98, 1.3 - 0.82);
const WHEELS_Z = [1.0, 0.42, -0.38, -1.0];
const WHEEL_X = 0.66;
// Stabiliser jacks at the corners, ahead of the front wheels and behind the rear ones, and how far
// their rams sit down: tucked up, or on the ground.
const JACKS: [number, number][] = [[-0.56, 1.36], [0.56, 1.36], [-0.56, -1.4], [0.56, -1.4]];
const RAM_UP = 0.5, RAM_DOWN = 0.22;
// The rocket pods, [right, up] in the launcher: two across, two high.
const PODS: [number, number][] = [[-0.21, 0], [0.21, 0], [-0.21, 0.37], [0.21, 0.37]];
const POD = { w: 0.4, h: 0.35, l: 0.95 };
const TUBES: [number, number][] = [-0.11, 0, 0.11].flatMap(x => [-0.1, 0, 0.1].map(y => [x, y] as [number, number]));
const STOWED_PITCH = 0.12, FIRING_PITCH = 0.8;

export const ThunderheadModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // Anchored: legs down, launcher free to turn and raise.
  deployed: boolean;
  // Where it is firing, in world space, if anywhere.
  aim: THREE.Vector3 | null;
}> = ({ teamColor, moving, deployed, aim }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const red = glow(PALETTE.warning);

  const wheels = useRef<THREE.Group>(null);
  const launcher = useRef<THREE.Group>(null);
  const cradle = useRef<THREE.Group>(null);
  const rams = useRef<(THREE.Group | null)[]>([]);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 4);
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    // Jacks push their rams down onto the ground.
    for (const ram of rams.current) {
      if (ram) ram.position.y += ((deployed ? RAM_DOWN : RAM_UP) - ram.position.y) * k;
    }
    // Pods raise once anchored; the launcher turns its muzzles to the target.
    if (cradle.current) cradle.current.rotation.x += ((deployed ? FIRING_PITCH : STOWED_PITCH) - cradle.current.rotation.x) * k;
    const l = launcher.current;
    if (!l || !l.parent) return;
    let yaw = 0;
    if (deployed && aim) {
      const local = l.parent.worldToLocal(scratch.copy(aim));
      yaw = Math.atan2(-(local.x - l.position.x), -(local.z - l.position.z));
    }
    let d = yaw - l.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    l.rotation.y += d * k;
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.2, 3.2]} />
      {/* Eight wheels: tyres on metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.28, z]}>
            <Wheel radius={0.28} width={0.22} segments={12} material={black} />
            <Wheel radius={0.16} width={0.24} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Chassis and rear deck, lockers along its sides, fenders over the rear wheels. */}
      <Prism outline={CHASSIS} depth={1.04} axis="x" material={dark} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.22, 0.24, 1.5]} material={composite} position={[s * 0.62, 0.79, -0.62]} />
          {[-1.05, -0.62, -0.19].map(z => <Plate key={z} size={[0.012, 0.18, 0.02]} material={black} position={[s * 0.732, 0.79, z + 0.21]} />)}
          <Plate size={[0.3, 0.04, 0.5]} material={composite} position={[s * WHEEL_X, 0.6, -1.0]} />
        </group>
      ))}
      {/* Tail lights. */}
      {[-0.4, 0.4].map(x => <Strip key={x} size={[0.1, 0.04, 0.012]} material={red} position={[x, 0.6, -1.407]} />)}

      {/* The cab: armour blocks and tow hooks on the nose, light bars, team stripes on the flanks. */}
      <Prism outline={CAB} depth={CAB_W} axis="x" material={armour} />
      {[-0.4, 0, 0.4].map(x => <Plate key={x} size={[0.36, 0.16, 0.06]} material={dark} position={[x, 0.72, 1.47]} />)}
      {[-0.32, 0.32].map(x => <Plate key={x} size={[0.06, 0.08, 0.08]} material={steel} position={[x, 0.55, 1.5]} />)}
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.22, 0.07, 0.03]} material={dark} position={[s * 0.5, 0.92, 1.43]} />
          <Strip size={[0.18, 0.04, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.5, 0.92, 1.448]} />
          <group position={[s * (CAB_W / 2 + 0.006), 0.95, 0.75]}>
            {[-0.06, 0.06].map(z => <Plate key={z} size={[0.012, 0.42, 0.06]} material={paint} position={[0, 0, z]} rotation={[-0.35, 0, 0]} />)}
          </group>
        </group>
      ))}
      <group position={[0, 1.13, 1.06]} rotation={[NOSE_SLOPE, 0, 0]}>
        <Plate size={[1.0, 0.02, 0.12]} material={black} />
      </group>
      {/* Cab roof: a sensor ball on a pedestal, smoke dischargers, an antenna, team colour. */}
      <group position={[-0.38, 1.28, 0.6]}>
        <Plate size={[0.2, 0.08, 0.2]} material={dark} position={[0, 0.04, 0]} />
        <Turned profile={[[0.001, 0.08], [0.11, 0.1], [0.14, 0.18], [0.11, 0.27], [0.001, 0.29]]} segments={8} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
        <Plate size={[0.1, 0.07, 0.02]} material={black} position={[0, 0.19, 0.13]} />
        <Strip size={[0.025, 0.025, 0.01]} material={red} position={[0.03, 0.19, 0.142]} />
      </group>
      <group position={[0.36, 1.28, 0.45]}>
        <Plate size={[0.3, 0.06, 0.14]} material={dark} position={[0, 0.03, 0]} />
        {[-0.09, 0, 0.09].map(x => (
          <Turned key={x} profile={[[0.035, 0], [0.035, 0.12]]} segments={6} material={dark} position={[x, 0.08, 0.02]} rotation={[-0.6, 0, 0]} />
        ))}
      </group>
      <Plate size={[0.4, 0.015, 0.26]} material={paint} position={[0, 1.288, 0.45]} />
      <group position={[0.55, 1.28, 0.36]}>
        <Turned profile={[[0.008, 0], [0.005, 0.5]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
      </group>

      {/* Stabiliser jacks: housings at the corners, rams that push down onto pads when anchored. */}
      {JACKS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Plate size={[0.16, 0.3, 0.16]} material={dark} position={[0, 0.56, 0]} />
          <group ref={g => { rams.current[i] = g; }} position={[0, RAM_UP, 0]}>
            <Plate size={[0.08, 0.4, 0.08]} material={steel} />
            <Plate size={[0.24, 0.04, 0.24]} material={composite} position={[0, -0.2, 0]} />
          </group>
        </group>
      ))}

      {/* The launcher: a turntable, a cradle on two arms, and four rocket pods. */}
      <Turned profile={[[0.48, 0], [0.48, 0.06]]} segments={12} material={black} position={[0, 0.7, -0.6]} rotation={[-Math.PI / 2, 0, 0]} />
      <group ref={launcher} position={[0, 0.76, -0.6]}>
        <Plate size={[0.9, 0.14, 0.8]} material={dark} position={[0, 0.07, 0]} />
        {[-0.48, 0.48].map(x => <Plate key={x} size={[0.08, 0.32, 0.3]} material={armour} position={[x, 0.28, 0.12]} />)}
        <group ref={cradle} position={[0, 0.38, 0.12]}>
          {PODS.map(([x, y]) => (
            <group key={`${x}${y}`} position={[x, y, -0.3]}>
              <Plate size={[POD.w, POD.h, POD.l]} material={armour} />
              {[-0.2, 0.2].map(z => <Plate key={z} size={[POD.w + 0.02, POD.h + 0.02, 0.05]} material={dark} position={[0, 0, z]} />)}
              <Plate size={[POD.w - 0.04, POD.h - 0.04, 0.02]} material={black} position={[0, 0, -POD.l / 2 - 0.005]} />
              {TUBES.map(([tx, ty]) => (
                <Turned key={`${tx}${ty}`} profile={[[0.04, 0], [0.04, 0.02]]} segments={8} material={dark} position={[tx, ty, -POD.l / 2 - 0.03]} />
              ))}
              {[-1, 1].map(e => <Strip key={e} size={[0.012, 0.16, 0.012]} material={red} position={[e * (POD.w / 2 - 0.02), 0, -POD.l / 2 - 0.02]} />)}
            </group>
          ))}
          {[-1, 1].map(s => <Plate key={s} size={[0.012, 0.05, 0.6]} material={paint} position={[s * (POD.w + 0.016), 0.37, -0.3]} />)}
        </group>
      </group>
    </group>
  );
};
