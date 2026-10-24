// The Banshee electronic-warfare truck, built from the unit kit (components/kit).
//
// Simple but military: a six-wheeled truck with an angular armoured cab, its bed given over to
// two things. Right behind the cab, three tether spools in a rack: cable drums between steel
// flanges, each with an outlet on top whose light shows when its hardline is connected to a drone
// (the tether cables in Unit.tsx run from these outlets). Over the back three quarters of the bed,
// the jamming dish: a big dish on a turntable, tilted to the sky, with an emitter on a boom at its
// focus.
//
// It moves: the wheels turn while it drives; jamming, the dish spins and its emitter glows; a spool
// turns slowly while its cable is out.
//
// Built facing +Z, about 3 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.6;
const DECK_Y = 0.8;
const SPOOL_Z = 0.34;
const SPOOLS_X = [-0.38, 0, 0.38];
// Where each tether cable leaves its spool's outlet, in the unit's own space (scaled).
export const BANSHEE_TETHER_ORIGINS: [number, number, number][] = SPOOLS_X.map(x => [x * SCALE, (DECK_Y + 0.5) * SCALE, SPOOL_Z * SCALE]);

// Cab side profile: [forward, up], an angular armoured front.
const CAB: [number, number][] = [[0.6, 0.55], [0.6, 1.48], [1.08, 1.48], [1.4, 1.18], [1.48, 0.92], [1.48, 0.55]];
const CAB_W = 1.36;
const WHEELS_Z = [1.02, -0.62, -1.18];
const WHEEL_X = 0.66;
// The dish, a shallow bowl opening along +Z before it is tilted: [radius, depth] points.
const DISH: [number, number][] = Array.from({ length: 7 }, (_, i) => {
  const r = 0.001 + (i / 6) * 0.82;
  return [r, r * r * 0.38] as [number, number];
});
const DISH_TILT = -1.0;
// Three struts from the dish's rim to the emitter at its focus.
const STRUTS = [0, 1, 2].map(k => {
  const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
  const rim = new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.25), tip = new THREE.Vector3(0, 0, 0.52);
  const d = tip.clone().sub(rim);
  return { mid: rim.clone().add(tip).multiplyScalar(0.5), len: d.length(), q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()) };
});
const DISH_Z = -0.62;

export const BansheeModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  jamming?: boolean;
  // How many drones are on hardlines (0-3).
  tethered?: number;
}> = ({ teamColor, moving, jamming, tethered = 0 }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), paint = teamPaint(teamColor);
  // This Banshee's own: the dish shows both faces, and its emitter glows while jamming.
  const own_ = useMemo(() => {
    const dish = kitMaterial('housing').clone();
    dish.side = THREE.DoubleSide;
    return { dish, emitter: own(glow(PALETTE.cyan)) as THREE.MeshBasicMaterial };
  }, []);
  useEffect(() => () => { own_.dish.dispose(); own_.emitter.dispose(); }, [own_]);

  const wheels = useRef<THREE.Group>(null);
  const turntable = useRef<THREE.Group>(null);
  const spools = useRef<(THREE.Group | null)[]>([]);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    if (turntable.current && jamming) turntable.current.rotation.y += delta * 2.5;
    spools.current.forEach((s, i) => { if (s && i < tethered) s.rotation.x += delta * 1.5; });
    const level = jamming ? 1.1 + 0.4 * Math.sin(clock.elapsedTime * 12) : 0.15;
    own_.emitter.color.copy(scratch.set(PALETTE.cyan)).multiplyScalar(level);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.2, 3.4]} />
      {/* Six wheels: tyres on metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.3, z]}>
            <Wheel radius={0.3} width={0.24} segments={12} material={black} />
            <Wheel radius={0.17} width={0.26} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Chassis, bed, fenders, tail lights. */}
      <Plate size={[1.0, 0.34, 2.9]} material={dark} position={[0, 0.58, 0]} />
      <Plate size={[1.3, 0.06, 2.0]} material={composite} position={[0, DECK_Y - 0.03, -0.45]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.3, 0.05, 1.2]} material={composite} position={[s * WHEEL_X, DECK_Y - 0.06, -0.9]} />
          <Plate size={[0.26, 0.26, 0.5]} material={armour} position={[s * 0.6, 0.55, 0.2]} />
        </group>
      ))}
      {[-0.42, 0.42].map(x => <Strip key={x} size={[0.1, 0.05, 0.012]} material={glow(PALETTE.warning)} position={[x, 0.62, -1.457]} />)}

      {/* The cab: armoured vision slits, headlights, a grille, a bumper, team stripes, antennas. */}
      <Prism outline={CAB} depth={CAB_W} axis="x" material={armour} />
      <group position={[0, 1.33, 1.24]} rotation={[Math.atan2(1.48 - 1.18, 1.4 - 1.08), 0, 0]}>
        {[-0.34, 0.34].map(x => <Plate key={x} size={[0.5, 0.02, 0.14]} material={black} position={[x, 0, 0]} />)}
      </group>
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.02, 0.18, 0.3]} material={black} position={[s * (CAB_W / 2 + 0.005), 1.26, 0.9]} />
          <group position={[s * (CAB_W / 2 + 0.006), 0.85, 0.95]}>
            {[-0.06, 0.06].map(z => <Plate key={z} size={[0.012, 0.36, 0.06]} material={paint} position={[0, 0, z]} rotation={[-0.35, 0, 0]} />)}
          </group>
          <Plate size={[0.16, 0.1, 0.03]} material={dark} position={[s * 0.5, 0.78, 1.495]} />
          <Strip size={[0.12, 0.06, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.5, 0.78, 1.512]} />
          <group position={[s * 0.52, 1.48, 0.7]}>
            <Turned profile={[[0.008, 0], [0.005, 0.55]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
          </group>
        </group>
      ))}
      {[0.66, 0.72, 0.78].map(y => <Plate key={y} size={[0.5, 0.025, 0.02]} material={black} position={[0, y, 1.5]} />)}
      <Plate size={[1.4, 0.16, 0.14]} material={composite} position={[0, 0.5, 1.56]} />
      <Plate size={[0.4, 0.012, 0.3]} material={paint} position={[0, 1.486, 0.84]} />

      {/* Tether spools: a rack of three cable drums, each with an outlet and a link light. */}
      <Plate size={[1.24, 0.08, 0.44]} material={dark} position={[0, DECK_Y + 0.04, SPOOL_Z]} />
      {SPOOLS_X.map((x, i) => (
        <group key={x} position={[x, DECK_Y + 0.26, SPOOL_Z]}>
          {[-1, 1].map(s => <Plate key={s} size={[0.03, 0.34, 0.34]} material={armour} position={[s * 0.15, -0.04, 0]} />)}
          <group ref={g => { spools.current[i] = g; }}>
            <Wheel radius={0.13} width={0.24} segments={10} material={black} />
            {[-1, 1].map(s => <Wheel key={s} radius={0.16} width={0.025} segments={10} material={steel} position={[s * 0.115, 0, 0]} />)}
          </group>
          <Turned profile={[[0.04, 0.16], [0.04, 0.22], [0.025, 0.24]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
          <Strip size={[0.05, 0.02, 0.05]} material={i < tethered ? glow('#38bdf8') : black} position={[0, 0.25, 0]} />
        </group>
      ))}

      {/* The jamming dish over the back of the bed: a pedestal, a turntable, a yoke, the dish tilted
          to the sky with a back frame, and an emitter on a boom at its focus. */}
      <Plate size={[0.8, 0.22, 0.8]} material={armour} position={[0, DECK_Y + 0.11, DISH_Z]} />
      <group ref={turntable} position={[0, DECK_Y + 0.22, DISH_Z]}>
        <Turned profile={[[0.42, 0], [0.42, 0.08], [0.34, 0.12]]} segments={10} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
        {[-1, 1].map(s => <Plate key={s} size={[0.08, 0.5, 0.26]} material={armour} position={[s * 0.3, 0.3, 0]} />)}
        <group position={[0, 0.58, 0]} rotation={[DISH_TILT, 0, 0]}>
          <Plate size={[0.5, 0.5, 0.12]} material={dark} position={[0, 0, -0.06]} />
          <Turned profile={DISH} segments={16} material={own_.dish} />
          <Turned profile={[[0.82, 0.255], [0.86, 0.255], [0.86, 0.29], [0.82, 0.29]]} segments={16} material={steel} />
          <Turned profile={[[0.83, 0.2], [0.85, 0.2], [0.85, 0.25], [0.83, 0.25]]} segments={16} material={paint} />
          <Turned profile={[[0.035, 0.05], [0.035, 0.5]]} segments={6} material={steel} />
          <Turned profile={[[0.08, 0.5], [0.1, 0.56], [0.1, 0.62], [0.001, 0.66]]} segments={8} material={own_.emitter} />
          {STRUTS.map(({ mid, q, len }, k) => (
            <group key={k} position={mid} quaternion={q}><Plate size={[0.02, 0.02, len]} material={dark} /></group>
          ))}
        </group>
      </group>
    </group>
  );
};
