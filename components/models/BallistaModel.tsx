// The Ballista missile launcher, built from the unit kit (components/kit).
//
// Simple but military: a large eight-wheeled armoured truck, built big to be a big target. An angular cab with a sloped windscreen,
// side windows, a sensor bar on the roof, a grille and a plough with tow hooks at the front; a
// composite tank box between the axles; and on the back a long armoured module, stepped at the
// roof with rails, vents, amber lights and team stripes, that hides the launch tube.
//
// To load and fire it stands still and erects: the module swings up on its hydraulic rams about
// its rear edge until its front end, with the round mouth of the launch tube, faces the sky; a
// stabiliser jack plants under it. The missile slides up the tube as it loads, and when armed its
// warhead stands out of the mouth in the colour of its type. Fired, or driving off, it folds down.
//
// Built facing +Z, about 3.9 long in its own units, and scaled up here: a big target.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.9;

// Warhead colours, by missile type.
export const WARHEAD_COLORS: Record<'emp' | 'he' | 'wp', string> = { emp: '#38bdf8', he: '#ef4444', wp: '#f8fafc' };

// Cab side profile: [forward, up], a sloped windscreen.
const CAB: [number, number][] = [[0.6, 0.55], [0.6, 1.6], [1.02, 1.6], [1.44, 1.16], [1.5, 1.0], [1.5, 0.55]];
const CAB_W = 1.4;
const SCREEN_SLOPE = Math.atan2(1.6 - 1.16, 1.44 - 1.02);
// Front plough, side view.
const PLOUGH: [number, number][] = [[1.48, 0.3], [1.48, 0.66], [1.62, 0.58], [1.7, 0.36]];
const WHEELS_Z = [1.05, -0.95, -1.52, -2.09];
const WHEEL_X = 0.68;
// The erector: a module hinged at its rear bottom edge on the deck.
const DECK_Y = 0.78, HINGE_Z = -2.22;
const MOD = { w: 1.26, h: 0.66, l: 2.8 };
const TUBE = { r: 0.32, y: 0.36 };
// The missile, along the tube: a body and a nose cone. Its nose base sits at the mouth when armed.
const MISSILE_IN = -0.65;

export const BallistaModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  ammoState?: 'empty' | 'loading' | 'armed' | 'awaiting_delivery';
  loadedAmmo?: 'emp' | 'he' | 'wp' | null;
  // 0-100 while loading.
  loadingProgress?: number;
}> = ({ teamColor, moving, ammoState, loadedAmmo, loadingProgress = 0 }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber), glass = black;
  const warhead = loadedAmmo ? glow(WARHEAD_COLORS[loadedAmmo]) : null;

  const erect = (ammoState === 'loading' || ammoState === 'armed') && !moving;
  // How far up the tube the missile is: hidden while stowed, rising as it loads, out when armed.
  const missileAt = !erect || !loadedAmmo ? MISSILE_IN - 0.4
    : ammoState === 'armed' ? 0 : MISSILE_IN + (-MISSILE_IN) * Math.min(1, loadingProgress / 100);

  const wheels = useRef<THREE.Group>(null);
  const erector = useRef<THREE.Group>(null);
  const missile = useRef<THREE.Group>(null);
  const jack = useRef<THREE.Group>(null);
  const rams = useRef<(THREE.Group | null)[]>([]);
  const scratch = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), w: new THREE.Vector3() }), []);

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 2.5);
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    const e = erector.current;
    if (!e) return;
    e.rotation.x += ((erect ? -Math.PI / 2 : 0) - e.rotation.x) * k;
    if (missile.current) missile.current.position.z += (missileAt - missile.current.position.z) * k;
    if (jack.current) jack.current.position.y += ((erect ? 0.2 : 0.62) - jack.current.position.y) * k;
    // The rams run from the chassis to the module's underside, whatever its angle.
    rams.current.forEach((ram, i) => {
      if (!ram) return;
      const x = i === 0 ? -0.36 : 0.36;
      scratch.a.set(x, DECK_Y - 0.1, -0.7);
      scratch.b.set(x, 0, 1.4).applyEuler(e.rotation).add(e.position);
      ram.position.copy(scratch.a);
      ram.scale.z = scratch.a.distanceTo(scratch.b);
      // lookAt takes a world point.
      if (ram.parent) ram.lookAt(ram.parent.localToWorld(scratch.w.copy(scratch.b)));
    });
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.3, 4.5]} />
      {/* Six wheels: tyres on metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.3, z]}>
            <Wheel radius={0.3} width={0.24} segments={12} material={black} />
            <Wheel radius={0.17} width={0.26} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Chassis, fenders, a tank box between the axles, tail lights. */}
      <Plate size={[1.0, 0.36, 3.75]} material={dark} position={[0, 0.58, -0.375]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.32, 0.05, 1.8]} material={composite} position={[s * WHEEL_X, DECK_Y - 0.01, -1.52]} />
          <Plate size={[0.3, 0.3, 1.0]} material={composite} position={[s * 0.62, 0.52, 0.06]} />
          {[-0.3, 0.06, 0.42].map(z => <Plate key={z} size={[0.32, 0.31, 0.05]} material={steel} position={[s * 0.62, 0.52, z]} />)}
        </group>
      ))}
      {[-0.42, 0.42].map(x => <Strip key={x} size={[0.1, 0.05, 0.012]} material={glow(PALETTE.warning)} position={[x, 0.6, -2.257]} />)}

      {/* The cab: windscreen and side windows, a grille, a plough with tow hooks, a sensor bar. */}
      <Prism outline={CAB} depth={CAB_W} axis="x" material={armour} />
      <group position={[0, 1.38, 1.235]} rotation={[SCREEN_SLOPE, 0, 0]}>
        <Plate size={[1.2, 0.02, 0.5]} material={glass} />
      </group>
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.02, 0.32, 0.36]} material={glass} position={[s * (CAB_W / 2 + 0.005), 1.36, 0.82]} />
          <group position={[s * (CAB_W / 2 + 0.006), 0.9, 0.95]}>
            {[-0.06, 0.06].map(z => <Plate key={z} size={[0.012, 0.36, 0.06]} material={paint} position={[0, 0, z]} rotation={[-0.35, 0, 0]} />)}
          </group>
        </group>
      ))}
      <Plate size={[1.0, 0.3, 0.03]} material={dark} position={[0, 0.84, 1.505]} />
      {[0.74, 0.8, 0.86, 0.92].map(y => <Plate key={y} size={[0.9, 0.025, 0.02]} material={black} position={[0, y, 1.52]} />)}
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.16, 0.12, 0.03]} material={dark} position={[s * 0.6, 0.86, 1.505]} />
          <Strip size={[0.12, 0.08, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.6, 0.86, 1.522]} />
        </group>
      ))}
      <Prism outline={PLOUGH} depth={1.36} axis="x" material={dark} />
      {[-0.32, 0.32].map(x => <Plate key={x} size={[0.07, 0.12, 0.08]} material={steel} position={[x, 0.42, 1.72]} />)}
      <Plate size={[1.0, 0.07, 0.12]} material={dark} position={[0, 1.635, 0.96]} />
      {[-0.3, -0.18, 0.18, 0.3].map(x => <Strip key={x} size={[0.05, 0.04, 0.012]} material={glow(PALETTE.cyan)} position={[x, 1.635, 1.022]} />)}
      <Plate size={[0.42, 0.012, 0.3]} material={paint} position={[0, 1.606, 0.75]} />

      {/* Stabiliser jack under the erector's hinge, planted while it stands up. */}
      {[-0.4, 0.4].map(x => (
        <group key={x} position={[x, 0, HINGE_Z + 0.08]}>
          <Plate size={[0.16, 0.24, 0.16]} material={dark} position={[0, 0.66, 0]} />
        </group>
      ))}
      <group ref={jack} position={[0, 0.62, HINGE_Z + 0.08]}>
        {[-0.4, 0.4].map(x => (
          <group key={x} position={[x, 0, 0]}>
            <Plate size={[0.08, 0.4, 0.08]} material={steel} />
            <Plate size={[0.26, 0.04, 0.26]} material={composite} position={[0, -0.2, 0]} />
          </group>
        ))}
      </group>

      {/* Hydraulic rams, chassis to erector. */}
      {[0, 1].map(i => (
        <group key={i} ref={g => { rams.current[i] = g; }}>
          <Turned profile={[[0.05, 0], [0.05, 0.5]]} segments={6} material={dark} />
          <Turned profile={[[0.03, 0.5], [0.03, 1]]} segments={6} material={steel} />
        </group>
      ))}

      {/* The erector: the armoured module round the launch tube, hinged at its rear bottom edge. */}
      <group ref={erector} position={[0, DECK_Y, HINGE_Z]}>
        <group position={[0, 0, MOD.l / 2]}>
          <Plate size={[MOD.w, MOD.h, MOD.l]} material={armour} position={[0, MOD.h / 2, 0]} />
          <Plate size={[MOD.w - 0.3, 0.14, MOD.l - 0.1]} material={armour} position={[0, MOD.h + 0.07, -0.02]} />
          {[-1, 1].map(s => (
            <group key={s}>
              {/* Roof rails, vents, amber lights and team stripes along the sides. */}
              <Plate size={[0.03, 0.05, 2.3]} material={steel} position={[s * 0.36, MOD.h + 0.165, 0]} />
              {[0.36, 0.42, 0.48].map(y => <Plate key={y} size={[0.012, 0.025, 0.32]} material={black} position={[s * (MOD.w / 2 + 0.005), y, -0.9]} />)}
              <Strip size={[0.012, 0.03, 0.08]} material={amber} position={[s * (MOD.w / 2 + 0.006), MOD.h - 0.08, 1.2]} />
              {[0.12, 0.24].map(z => (
                <Plate key={z} size={[0.012, 0.5, 0.07]} material={paint} position={[s * (MOD.w / 2 + 0.006), MOD.h / 2, z]} rotation={[-0.35, 0, 0]} />
              ))}
              {[-1.0, -0.4, 0.2, 0.8].map(z => <Plate key={z} size={[0.01, MOD.h - 0.06, 0.012]} material={dark} position={[s * (MOD.w / 2 + 0.003), MOD.h / 2, z]} />)}
            </group>
          ))}
          {/* The launch tube's mouth on the front end: a steel rim round a dark bore. */}
          <group position={[0, TUBE.y, MOD.l / 2]}>
            <Turned profile={[[TUBE.r, 0], [TUBE.r + 0.07, 0], [TUBE.r + 0.07, 0.03], [TUBE.r, 0.03]]} segments={16} material={steel} />
            <Turned profile={[[0.001, 0.002], [TUBE.r, 0.002]]} segments={16} material={black} />
            <Plate size={[MOD.w - 0.1, 0.06, 0.03]} material={housing} position={[0, -TUBE.r - 0.12, 0.01]} />
          </group>
        </group>
        {/* The missile in the tube, its warhead out of the mouth when armed. */}
        {warhead && (
          <group ref={missile} position={[0, TUBE.y, MISSILE_IN - 0.4]}>
            <group position={[0, 0, MOD.l]}>
              <Turned profile={[[TUBE.r - 0.04, -1.6], [TUBE.r - 0.04, 0]]} segments={12} material={housing} />
              <Turned profile={[[TUBE.r - 0.04, 0], [TUBE.r - 0.1, 0.22], [0.12, 0.42], [0.001, 0.52]]} segments={12} material={warhead} />
            </group>
          </group>
        )}
      </group>
    </group>
  );
};
