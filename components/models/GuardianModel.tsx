// The Guardian support UGV, built from the unit kit (components/kit).
//
// Simple but military: an unmanned six-wheeled armoured carrier with sharp-edged armour, each part
// in what it would be made of. An angular hull with a sloped nose, a dark sensor window and a
// composite bumper; composite panniers over the wheels, striped in team colour; and a pale
// equipment module with green repair crosses, carrying the repair emitter on a telescopic mast (a
// six-sided head with a glowing green band and lens, where the repair beams start), a turning
// radar panel and the Trophy launcher, whose light turns red while it reloads.
//
// It moves: the wheels turn while it drives, the radar turns, and the emitter's band pulses.
//
// Built facing +Z, about 2.4 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.6;
// The emitter's tip, where repair beams start, in the unit's own (unscaled) space.
const EMITTER_TIP = 2.3;
export const GUARDIAN_BEAM_ORIGIN_Y = EMITTER_TIP * SCALE;

// Hull side profile: [forward, up], a sloped nose.
const HULL: [number, number][] = [[-1.15, 0.34], [-1.15, 0.86], [-1.02, 0.95], [0.35, 0.95], [0.75, 0.85], [1.2, 0.6], [1.2, 0.46], [1.02, 0.32], [-1.0, 0.32]];
// Equipment module, side view [forward, up] from its base: its top edges cut at an angle.
const MODULE: [number, number][] = [[-0.47, 0], [-0.47, 0.38], [-0.37, 0.46], [0.37, 0.46], [0.47, 0.38], [0.47, 0]];
const MODULE_Y = 0.95, MODULE_Z = -0.45;
const WHEELS_Z = [-0.78, 0, 0.78];
const WHEEL_X = 0.66;
const NOSE_SLOPE = Math.atan2(0.85 - 0.6, 1.2 - 0.75);

export const GuardianModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // The Trophy System is reloading.
  trophyCooling?: boolean;
}> = ({ teamColor, moving, trophyCooling }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor), repair = glow(PALETTE.repair);
  // This Guardian's own: its emitter band pulses.
  const band = useMemo(() => own(glow(PALETTE.repair)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => band.dispose(), [band]);

  const wheels = useRef<THREE.Group>(null);
  const radar = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    if (radar.current) radar.current.rotation.y += delta;
    band.color.copy(scratch.set(PALETTE.repair)).multiplyScalar(0.8 + 0.3 * Math.sin(clock.elapsedTime * 4));
  });

  const top = MODULE_Y + 0.46;
  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.0, 2.9]} />
      {/* Six wheels: tyres round metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.28, z]}>
            <Wheel radius={0.28} width={0.22} segments={12} material={black} />
            <Wheel radius={0.15} width={0.24} segments={6} material={steel} />
          </group>
        )))}
      </group>

      {/* Hull: a sloped nose with a dark sensor window, a composite bumper with tow hooks, lights. */}
      <Prism outline={HULL} depth={1.02} axis="x" material={armour} />
      <group position={[0, 0.735, 0.97]} rotation={[NOSE_SLOPE, 0, 0]}>
        <Plate size={[0.8, 0.02, 0.22]} material={black} />
        <Strip size={[0.5, 0.012, 0.02]} material={glow(PALETTE.cyan)} position={[0, 0.012, -0.06]} />
      </group>
      <Plate size={[1.06, 0.14, 0.1]} material={composite} position={[0, 0.42, 1.22]} />
      {[-0.3, 0.3].map(x => <Plate key={x} size={[0.08, 0.06, 0.08]} material={steel} position={[x, 0.36, 1.3]} />)}
      {[-0.4, 0.4].map(x => (
        <group key={x}>
          <Plate size={[0.16, 0.08, 0.04]} material={dark} position={[x, 0.53, 1.205]} />
          <Strip size={[0.11, 0.04, 0.015]} material={glow(PALETTE.headlight)} position={[x, 0.53, 1.228]} />
          <Strip size={[0.08, 0.035, 0.015]} material={glow(PALETTE.warning)} position={[x, 0.8, -1.158]} />
        </group>
      ))}
      <Plate size={[1.0, 0.12, 0.08]} material={composite} position={[0, 0.44, -1.18]} />

      {/* Panniers over the wheels: composite boxes, two team stripes on each. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.67, 0, 0]}>
          <Plate size={[0.3, 0.2, 2.1]} material={composite} position={[0, 0.8, -0.05]} />
          {[-0.12, 0.04].map(z => (
            <Plate key={z} size={[0.012, 0.2, 0.06]} material={paint} position={[s * 0.151, 0.8, z]} rotation={[-0.35, 0, 0]} />
          ))}
        </group>
      ))}

      {/* Equipment module: green repair crosses on its sides, team colour on its roof. */}
      <Prism outline={MODULE} depth={0.94} axis="x" material={housing} position={[0, MODULE_Y, MODULE_Z]} />
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.472, MODULE_Y + 0.22, MODULE_Z]}>
          <Strip size={[0.01, 0.07, 0.26]} material={repair} />
          <Strip size={[0.01, 0.26, 0.07]} material={repair} />
        </group>
      ))}
      <Plate size={[0.5, 0.012, 0.3]} material={paint} position={[0, top + 0.006, MODULE_Z - 0.18]} />

      {/* Repair emitter on a telescopic mast: a six-sided head with a glowing band and a lens. */}
      <group position={[0, top, MODULE_Z + 0.08]}>
        <Plate size={[0.3, 0.1, 0.3]} material={dark} position={[0, 0.05, 0]} />
        <Turned profile={[[0.06, 0.1], [0.06, 0.4]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.045, 0.4], [0.045, 0.54]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.001, 0.54], [0.17, 0.54], [0.2, 0.6], [0.2, 0.76], [0.15, 0.82], [0.001, 0.82]]} segments={6} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.206, 0.63], [0.206, 0.71]]} segments={6} material={band} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.07, 0.82], [0.07, 0.85], [0.001, EMITTER_TIP - top]]} segments={6} material={repair} rotation={[-Math.PI / 2, 0, 0]} />
      </group>

      {/* Radar panel on a short mast, front right of the module, turning. */}
      <group ref={radar} position={[0.32, top, MODULE_Z + 0.32]}>
        <Turned profile={[[0.03, 0], [0.03, 0.18]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <Plate size={[0.32, 0.18, 0.03]} material={dark} position={[0, 0.25, 0]} rotation={[-0.3, 0, 0]} />
      </group>

      {/* Trophy launcher, front left of the module: a tube block and a ready light (red while reloading). */}
      <group position={[-0.3, top, MODULE_Z + 0.3]}>
        <Plate size={[0.26, 0.14, 0.2]} material={dark} position={[0, 0.07, 0]} rotation={[0.25, 0, 0]} />
        {[-0.07, 0, 0.07].map(x => (
          <Turned key={x} profile={[[0.028, 0], [0.028, 0.04]]} segments={6} material={black} position={[x, 0.1, 0.09]} rotation={[0.25, 0, 0]} />
        ))}
        <Strip size={[0.06, 0.02, 0.02]} material={glow(trophyCooling ? PALETTE.warning : PALETTE.cyan)} position={[0, 0.16, -0.07]} />
      </group>
      {/* Whip antennas at the back. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * 0.36, top, MODULE_Z - 0.4]}>
          <Turned profile={[[0.008, 0], [0.005, 0.45]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
        </group>
      ))}
    </group>
  );
};
