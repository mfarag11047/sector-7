// The "Jackrabbit" scout RC car, built from the unit kit (components/kit).
//
// Simple but military, and small beside the real vehicles: a six-wheeled stealth UGV on oversized
// wheels. A low faceted shell in dark stealth tones, fender pods over the wheels, a bumper with
// small red and amber lights, and a team stripe down the spine; on top, a sensor array on a short
// mast (a pan-tilt head with three lenses and a dome), and two whip antennas.
//
// It moves: the wheels turn while it drives, and the sensor head scans to and fro.
//
// Built facing +Z, about 1.7 long in its own units, and scaled up here.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 1.6;
// Hull side profile: [forward, up], a wedge nose.
const HULL: [number, number][] = [[-0.75, 0.26], [-0.75, 0.55], [-0.55, 0.62], [0.35, 0.62], [0.72, 0.48], [0.8, 0.34], [0.68, 0.24], [-0.6, 0.24]];
// The raised top shell.
const SHELL: [number, number][] = [[-0.62, 0.6], [-0.5, 0.72], [0.22, 0.72], [0.4, 0.6]];
// A fender pod over a side's wheels.
const FENDER: [number, number][] = [[-0.86, 0.56], [-0.72, 0.66], [0.68, 0.66], [0.86, 0.56], [0.86, 0.52], [-0.86, 0.52]];
const WHEELS_Z = [0.56, 0, -0.56];
const WHEEL_X = 0.5;

export const ScoutCarModel: React.FC<{ teamColor: string; moving?: boolean }> = ({ teamColor, moving }) => {
  const dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const wheels = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 9; });
    if (head.current) head.current.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.9;
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[1.5, 2.0]} />
      {/* Six oversized wheels: chunky tyres on dark hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.27, z]}>
            <Wheel radius={0.27} width={0.24} segments={10} material={black} />
            <Wheel radius={0.13} width={0.26} segments={6} material={dark} />
          </group>
        )))}
      </group>

      {/* Hull and top shell; fender pods; bumper and lights; team stripe. */}
      <Prism outline={HULL} depth={0.66} axis="x" material={dark} />
      <Prism outline={SHELL} depth={0.5} axis="x" material={composite} />
      {[-1, 1].map(s => <Prism key={s} outline={FENDER} depth={0.28} axis="x" material={composite} position={[s * WHEEL_X, 0, 0]} />)}
      <Plate size={[0.8, 0.1, 0.08]} material={composite} position={[0, 0.3, 0.8]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Strip size={[0.1, 0.035, 0.012]} material={glow(PALETTE.warning)} position={[s * 0.2, 0.42, 0.77]} rotation={[0.6, 0, 0]} />
          <Strip size={[0.05, 0.03, 0.012]} material={glow(PALETTE.amber)} position={[s * 0.27, 0.32, 0.846]} />
          <Strip size={[0.06, 0.03, 0.012]} material={glow(PALETTE.warning)} position={[s * 0.22, 0.45, -0.757]} />
        </group>
      ))}
      <Plate size={[0.08, 0.012, 0.8]} material={paint} position={[0, 0.726, -0.15]} />

      {/* The sensor array: a mast and a pan-tilt head with three lenses and a dome. */}
      <group position={[0, 0.72, 0.05]}>
        <Turned profile={[[0.08, 0], [0.08, 0.05], [0.04, 0.07]]} segments={8} material={black} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.03, 0.05], [0.03, 0.2]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <group ref={head} position={[0, 0.27, 0]}>
          <Plate size={[0.28, 0.15, 0.2]} material={dark} />
          <Plate size={[0.3, 0.03, 0.22]} material={composite} position={[0, 0.09, 0]} />
          {([[-0.08, 0.02, PALETTE.cyan], [0.03, 0.02, PALETTE.cyan], [0.1, -0.03, PALETTE.warning]] as const).map(([x, y, c]) => (
            <group key={x} position={[x, y, 0.1]}>
              <Turned profile={[[0.035, 0], [0.035, 0.03]]} segments={8} material={black} />
              <Strip size={[0.03, 0.03, 0.01]} material={glow(c)} position={[0, 0, 0.032]} />
            </group>
          ))}
          <Turned profile={[[0.06, 0.1], [0.06, 0.14], [0.03, 0.18], [0.001, 0.19]]} segments={8} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
      </group>
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.18, 0.72, -0.5]}>
          <Turned profile={[[0.008, 0], [0.004, 0.42]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.12, 0, 0]} />
        </group>
      ))}
    </group>
  );
};
