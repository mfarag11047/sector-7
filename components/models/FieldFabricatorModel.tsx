// The Field Fabricator, built from the unit kit (components/kit): it turns material charges into
// missiles in the field and carries them to a Ballista.
//
// Simple but military: a long-wheelbase six-wheeled truck. An angular armoured cab with a sloped
// windscreen; right behind it, a compact fabrication station (a housing with a tool gantry, a lit
// work window and a vent stack); and the rest of the long bed taken by missile cages: a steel frame
// holding missiles on cradles in two layers of three, noses to the rear.
//
// The cages show the stock (`missiles`, `material`): each missile fabricated wears a warhead cap in
// the colour of its type (EMP, HE, WP, as on the Ballista); each material charge not yet made into
// a missile is a bare missile body, its nose an open collar; the rest of the cradles are empty.
// While it fabricates (`fabricating`), the station's work window and the next bare missile's nose
// pulse in the colour of the warhead being made.
//
// It moves: its wheels turn while it drives.
//
// Built facing +Z, about 3.7 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';
import { WARHEAD_COLORS } from './BallistaModel';

type Warhead = 'emp' | 'he' | 'wp';
const SCALE = 2.2;
// Cab side profile: [forward, up], a sloped windscreen.
const CAB: [number, number][] = [[0.75, 0.5], [0.75, 1.32], [1.06, 1.32], [1.36, 0.98], [1.44, 0.84], [1.44, 0.5]];
const CAB_W = 1.1;
const SCREEN_SLOPE = Math.atan2(1.32 - 0.98, 1.36 - 1.06);
const WHEELS_Z = [1.05, -1.22, -1.8];
const WHEEL_X = 0.56;
const DECK_Y = 0.6;
// The cages along the bed: their ends and posts, and the cradles, two layers of three.
const CAGE = { front: 0.06, back: -2.12, posts: [0.06, -1.03, -2.12], x: 0.5, top: 1.24 };
const SLOTS: [number, number][] = [0.74, 1.0].flatMap(y => [-0.28, 0, 0.28].map(x => [x, y] as [number, number]));
// A missile on its cradle, along Z: its tail at the front of the bed, its nose to the rear.
const MISSILE = { r: 0.1, tail: -0.02, length: 1.86 };

export const FieldFabricatorModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // Missiles on board, by warhead.
  missiles?: { emp: number; he: number; wp: number };
  // Material charges not yet made into missiles.
  material?: number;
  // The warhead being fabricated now, if any.
  fabricating?: Warhead | null;
}> = ({ teamColor, moving, missiles, material = 0, fabricating }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber);

  // What each cradle holds: finished missiles first, then bare bodies, then nothing.
  const loads = useMemo(() => {
    const out: (Warhead | 'bare' | null)[] = [];
    (['emp', 'he', 'wp'] as const).forEach(w => { for (let i = 0; i < (missiles?.[w] ?? 0); i++) out.push(w); });
    for (let i = 0; i < material; i++) out.push('bare');
    return SLOTS.map((_, i) => out[i] ?? null);
  }, [missiles, material]);
  // The bare body the station is working on: the first one.
  const working = fabricating ? loads.indexOf('bare') : -1;

  // The pulse in the warhead colour while fabricating: this truck's own material.
  const pulse = useMemo(() => own(glow(PALETTE.amber)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => pulse.dispose(), [pulse]);
  const tint = useMemo(() => new THREE.Color(), []);
  const wheels = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += Math.min(delta, 0.05) * 7; });
    const level = fabricating ? 0.55 + 0.45 * Math.sin(clock.elapsedTime * 6) : 0.12;
    pulse.color.copy(tint.set(fabricating ? WARHEAD_COLORS[fabricating] : PALETTE.amber)).multiplyScalar(level);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[1.5, 3.8]} />
      {/* Six wheels on three axles. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.26, z]}>
            <Wheel radius={0.26} width={0.22} segments={12} material={black} />
            <Wheel radius={0.14} width={0.24} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Chassis, fenders, and the bed. */}
      <Plate size={[0.86, 0.16, 3.5]} material={dark} position={[0, 0.4, -0.4]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.24, 0.05, 0.62]} material={armour} position={[s * WHEEL_X, 0.56, 1.05]} />
          <Plate size={[0.24, 0.05, 1.04]} material={armour} position={[s * WHEEL_X, 0.56, -1.51]} />
        </group>
      ))}
      <Plate size={[1.08, 0.08, 2.28]} material={composite} position={[0, DECK_Y - 0.04, -1.03]} />

      {/* The cab: angular armour, a sloped windscreen, side windows, a team stripe, a light bar. */}
      <Prism outline={CAB} depth={CAB_W} axis="x" material={armour} />
      <Plate size={[CAB_W - 0.14, 0.03, 0.42]} material={black} position={[0, 1.15, 1.21]} rotation={[SCREEN_SLOPE - Math.PI / 2, 0, 0]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.012, 0.22, 0.3]} material={black} position={[s * (CAB_W / 2 + 0.006), 1.1, 0.95]} />
          <Plate size={[0.012, 0.08, 0.6]} material={paint} position={[s * (CAB_W / 2 + 0.006), 0.78, 1.08]} />
          <Strip size={[0.12, 0.06, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.36, 0.72, 1.446]} />
        </group>
      ))}
      <Plate size={[CAB_W - 0.2, 0.05, 0.16]} material={dark} position={[0, 1.35, 0.9]} />
      {[-0.3, -0.1, 0.1, 0.3].map(x => <Strip key={x} size={[0.12, 0.03, 0.03]} material={amber} position={[x, 1.385, 0.9]} />)}
      <Plate size={[0.9, 0.16, 0.08]} material={dark} position={[0, 0.58, 1.48]} />

      {/* The fabrication station behind the cab: housing, tool gantry, work window, vent stack. */}
      <group position={[0, DECK_Y, 0.42]}>
        <Plate size={[1.0, 0.62, 0.52]} material={housing} position={[0, 0.31, 0]} />
        <Plate size={[1.04, 0.06, 0.56]} material={dark} position={[0, 0.64, 0]} />
        {[-1, 1].map(s => (
          <group key={s}>
            <Plate size={[0.012, 0.18, 0.3]} material={black} position={[s * 0.506, 0.36, 0]} />
            <Plate size={[0.014, 0.14, 0.26]} material={pulse} position={[s * 0.508, 0.36, 0]} />
            {[0.2, 0.52].map(y => <Plate key={y} size={[0.016, 0.03, 0.4]} material={dark} position={[s * 0.508, y, 0]} />)}
          </group>
        ))}
        {/* The gantry over the rear of the station, its tool head reaching down toward the cages. */}
        {[-1, 1].map(s => <Plate key={s} size={[0.05, 0.3, 0.05]} material={steel} position={[s * 0.42, 0.82, -0.22]} />)}
        <Plate size={[0.9, 0.06, 0.06]} material={steel} position={[0, 0.96, -0.22]} />
        <group position={[0.1, 0.9, -0.22]}>
          <Plate size={[0.12, 0.1, 0.12]} material={dark} />
          <Turned profile={[[0.03, 0], [0.03, 0.12], [0.012, 0.16]]} segments={6} material={steel} rotation={[Math.PI / 2, 0, 0]} position={[0, -0.04, -0.03]} />
          <Strip size={[0.03, 0.03, 0.03]} material={pulse} position={[0, -0.21, -0.03]} />
        </group>
        <Turned profile={[[0.05, 0], [0.05, 0.3], [0.06, 0.3], [0.06, 0.34]]} segments={8} material={dark} rotation={[-Math.PI / 2, 0, 0]} position={[-0.36, 0.66, 0.12]} />
        <Strip size={[0.04, 0.04, 0.012]} material={glow(fabricating ? PALETTE.repair : PALETTE.warning)} position={[0.36, 0.5, 0.266]} />
      </group>

      {/* The missile cages: posts, rails and cross bars, and cradles under each layer. */}
      <group position={[0, DECK_Y, 0]}>
        {CAGE.posts.flatMap(z => [-1, 1].map(s => (
          <Plate key={`${z}${s}`} size={[0.05, CAGE.top - DECK_Y, 0.05]} material={steel} position={[s * CAGE.x, (CAGE.top - DECK_Y) / 2, z]} />
        )))}
        {[0.42, CAGE.top - DECK_Y].flatMap(y => [-1, 1].map(s => (
          <Plate key={`${y}${s}`} size={[0.04, 0.04, CAGE.front - CAGE.back]} material={steel} position={[s * CAGE.x, y, (CAGE.front + CAGE.back) / 2]} />
        )))}
        {CAGE.posts.map(z => <Plate key={z} size={[CAGE.x * 2, 0.04, 0.04]} material={steel} position={[0, CAGE.top - DECK_Y, z]} />)}
        {[0.08, 0.34].flatMap(y => [-0.34, -1.62].map(z => (
          <Plate key={`${y}${z}`} size={[0.9, 0.05, 0.1]} material={dark} position={[0, y, z]} />
        )))}
        {[-1, 1].map(s => <Plate key={s} size={[0.012, 0.08, 0.4]} material={paint} position={[s * (CAGE.x + 0.03), 0.42, -1.03]} />)}
      </group>

      {/* The missiles in their cradles: a body and fins; a warhead cap in its colour, or a bare
          open collar; the one being made pulses. */}
      {SLOTS.map(([x, y], i) => {
        const load = loads[i];
        if (!load) return null;
        return (
          <group key={i} position={[x, y, MISSILE.tail]} rotation={[0, Math.PI, 0]}>
            <Turned profile={[[MISSILE.r * 0.8, 0], [MISSILE.r, 0.06], [MISSILE.r, MISSILE.length]]} segments={10} material={housing} />
            {[0, Math.PI / 2].map(r => <Plate key={r} size={[0.3, 0.012, 0.12]} material={dark} position={[0, 0, 0.1]} rotation={[0, 0, r + Math.PI / 4]} />)}
            <Turned profile={[[MISSILE.r + 0.006, MISSILE.length - 0.04], [MISSILE.r + 0.006, MISSILE.length]]} segments={10} material={black} />
            {load === 'bare'
              ? <Turned profile={[[MISSILE.r * 0.7, MISSILE.length], [MISSILE.r * 0.55, MISSILE.length + 0.03], [0.001, MISSILE.length + 0.03]]} segments={10} material={i === working ? pulse : black} />
              : <Turned profile={[[MISSILE.r, MISSILE.length], [MISSILE.r * 0.7, MISSILE.length + 0.1], [0.02, MISSILE.length + 0.2], [0.001, MISSILE.length + 0.21]]} segments={10} material={glow(WARHEAD_COLORS[load])} />}
          </group>
        );
      })}

      {/* Rear: a bumper and lights. */}
      <Plate size={[1.0, 0.1, 0.08]} material={dark} position={[0, 0.45, -2.18]} />
      {[-1, 1].map(s => <Strip key={s} size={[0.1, 0.05, 0.012]} material={glow(PALETTE.warning)} position={[s * 0.38, 0.5, -2.226]} />)}
    </group>
  );
};
