// The Guardian support UGV, built from the unit kit (components/kit).
//
// An unmanned, four-wheeled armoured carrier, each part in what it would be made of: an armoured
// wedge hull with a dark sensor visor; dark composite fenders (striped in team colour), bumpers and
// sills; metal-hubbed wheels; and a pale equipment module carrying the repair emitter, a mast of
// rings round a glowing green core. Green repair crosses on the module's sides; a turning sensor
// dish; and the Trophy launcher, whose light turns red while it reloads.
//
// It moves: the wheels turn while it drives, the dish turns, and the emitter's core pulses.
//
// Built facing +Z, about 2.4 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.6;
// The emitter's tip, where repair beams start, in the unit's own (unscaled) space.
const EMITTER_TIP = 2.34;
export const GUARDIAN_BEAM_ORIGIN_Y = EMITTER_TIP * SCALE;

// Hull side profile: [forward, up], a wedge nose.
const HULL: [number, number][] = [[-1.15, 0.36], [-1.15, 0.95], [0.35, 0.95], [0.72, 0.84], [1.2, 0.62], [1.2, 0.44], [1.02, 0.32], [-1.0, 0.32]];
// An arched fender over a wheel, side view.
const FENDER: [number, number][] = [[-0.44, 0.5], [-0.3, 0.74], [0.3, 0.74], [0.44, 0.5], [0.37, 0.5], [0.26, 0.67], [-0.26, 0.67], [-0.37, 0.5]];
const WHEELS: [number, number][] = [[-0.66, 0.74], [0.66, 0.74], [-0.66, -0.74], [0.66, -0.74]];
const NOSE_SLOPE = Math.atan2(0.84 - 0.62, 1.2 - 0.72);
const MODULE = { y: 0.95, z: -0.5, w: 1.0, h: 0.46, l: 0.95 };

export const GuardianModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // The Trophy System is reloading.
  trophyCooling?: boolean;
}> = ({ teamColor, moving, trophyCooling }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing');
  const paint = teamPaint(teamColor), light = glow(PALETTE.cyan), repair = glow(PALETTE.repair);
  // This Guardian's own: its emitter core pulses.
  const core = useMemo(() => own(glow(PALETTE.repair)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => core.dispose(), [core]);

  const wheels = useRef<THREE.Group>(null);
  const dish = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    if (dish.current) dish.current.rotation.y += delta;
    core.color.copy(scratch.set(PALETTE.repair)).multiplyScalar(0.8 + 0.3 * Math.sin(clock.elapsedTime * 4));
  });

  const top = MODULE.y + MODULE.h;
  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.0, 2.9]} />
      {/* Wheels: chunky tyres round dark hubs, under arched fenders striped in team colour. */}
      <group ref={wheels}>
        {WHEELS.map(([x, z]) => (
          <group key={`${x}${z}`} position={[x, 0.34, z]}>
            <Wheel radius={0.34} width={0.28} segments={12} material={black} />
            <Wheel radius={0.19} width={0.3} segments={6} material={steel} />
          </group>
        ))}
      </group>
      {WHEELS.map(([x, z]) => (
        <group key={`${x}${z}`} position={[x * 1.02, 0, z]}>
          <Prism outline={FENDER} depth={0.34} axis="x" material={composite} />
          <Plate size={[0.3, 0.03, 0.62]} radius={0.01} material={paint} position={[0, 0.775, 0]} />
        </group>
      ))}

      {/* Hull: the wedge body, a dark visor on the nose with a sensor strip, headlights, tail lights. */}
      <Prism outline={HULL} depth={1.06} axis="x" material={armour} />
      {/* Composite bumpers front and back, and sills along the sides between the wheels. */}
      <Plate size={[1.0, 0.14, 0.12]} radius={0.04} material={composite} position={[0, 0.42, 1.2]} />
      <Plate size={[1.0, 0.14, 0.1]} radius={0.04} material={composite} position={[0, 0.44, -1.17]} />
      {[-1, 1].map(s => <Plate key={s} size={[0.05, 0.14, 0.62]} radius={0.02} material={composite} position={[s * 0.54, 0.42, 0]} />)}
      <group position={[0, 0.755, 0.96]} rotation={[NOSE_SLOPE, 0, 0]}>
        <Plate size={[0.86, 0.03, 0.42]} radius={0.01} material={black} />
        <Strip size={[0.56, 0.02, 0.05]} material={light} position={[0, 0.02, 0.04]} />
      </group>
      {[-0.38, 0.38].map(x => (
        <group key={x}>
          <Strip size={[0.14, 0.06, 0.02]} material={glow(PALETTE.headlight)} position={[x, 0.53, 1.205]} />
          <Strip size={[0.12, 0.05, 0.02]} material={glow(PALETTE.warning)} position={[x, 0.82, -1.155]} />
        </group>
      ))}
      {/* Running lights along the hull sides. */}
      {[-1, 1].map(s => <Strip key={s} size={[0.02, 0.04, 0.5]} material={light} position={[s * 0.535, 0.62, 0]} />)}

      {/* Equipment module: team colour band, green repair crosses on its sides. */}
      <Plate size={[MODULE.w, MODULE.h, MODULE.l]} radius={0.06} material={housing} position={[0, MODULE.y + MODULE.h / 2, MODULE.z]} />
      <Plate size={[MODULE.w + 0.03, 0.08, MODULE.l + 0.03]} radius={0.02} material={paint} position={[0, MODULE.y + 0.1, MODULE.z]} />
      {[-1, 1].map(s => (
        <group key={s} position={[s * (MODULE.w / 2 + 0.006), MODULE.y + 0.28, MODULE.z]}>
          <Strip size={[0.01, 0.08, 0.28]} material={repair} />
          <Strip size={[0.01, 0.28, 0.08]} material={repair} />
        </group>
      ))}

      {/* Repair emitter: a collar, a glowing core inside a cage of rings and struts, a lens on top. */}
      <group position={[0, top, MODULE.z]}>
        <Turned profile={[[0.3, 0], [0.3, 0.08], [0.22, 0.14]]} segments={8} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.12, 0.1], [0.12, 0.72]]} segments={8} material={core} rotation={[-Math.PI / 2, 0, 0]} />
        {[0.24, 0.44, 0.64].map(y => (
          <Turned key={y} profile={[[0.15, 0], [0.22, 0], [0.22, 0.05], [0.15, 0.05]]} segments={8} material={steel} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        ))}
        {[0, 1, 2, 3].map(i => (
          <Plate key={i} size={[0.04, 0.62, 0.04]} radius={0.01} material={dark}
            position={[Math.sin(i * Math.PI / 2 + Math.PI / 4) * 0.2, 0.43, Math.cos(i * Math.PI / 2 + Math.PI / 4) * 0.2]} />
        ))}
        <Turned profile={[[0.24, 0], [0.24, 0.06], [0.12, 0.12], [0.001, 0.13]]} segments={8} material={dark} position={[0, 0.72, 0]} rotation={[-Math.PI / 2, 0, 0]} />
        <Turned profile={[[0.07, 0], [0.07, 0.04], [0.001, 0.1]]} segments={8} material={repair} position={[0, EMITTER_TIP - top - 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </group>

      {/* Sensor dish on a mast, front right of the module, turning. */}
      <group ref={dish} position={[0.36, top, MODULE.z + 0.34]}>
        <Turned profile={[[0.04, 0], [0.03, 0.3]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <group position={[0, 0.32, 0]} rotation={[-0.5, 0, 0]}>
          <Turned profile={[[0.04, 0], [0.24, 0.07], [0.22, 0.09], [0.03, 0.03]]} segments={10} material={dark} />
          <Strip size={[0.04, 0.04, 0.1]} material={light} position={[0, 0, 0.08]} />
        </group>
      </group>

      {/* Trophy launcher, front left of the module: a tube block and a ready light (red while reloading). */}
      <group position={[-0.32, top, MODULE.z + 0.28]}>
        <Plate size={[0.3, 0.16, 0.24]} radius={0.03} material={dark} position={[0, 0.08, 0]} />
        {[-0.08, 0, 0.08].map(x => (
          <Turned key={x} profile={[[0.03, 0], [0.03, 0.05]]} segments={6} material={black} position={[x, 0.11, 0.12]} />
        ))}
        <Strip size={[0.08, 0.025, 0.025]} material={glow(trophyCooling ? PALETTE.warning : PALETTE.cyan)} position={[0, 0.17, -0.06]} />
      </group>
      {/* A whip antenna at the back. */}
      <group position={[0.4, top, MODULE.z - 0.38]}>
        <Turned profile={[[0.01, 0], [0.006, 0.4]]} segments={5} material={black} rotation={[-Math.PI / 2 + 0.12, 0, 0]} />
      </group>
    </group>
  );
};
