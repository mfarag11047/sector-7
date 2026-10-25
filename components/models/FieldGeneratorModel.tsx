// The Bulwark Field Generator, Heavy Metal's force field, built from the unit kit (components/kit).
//
// Simple but military: the drop pod it comes down in, landed and braced. An octagonal armoured
// hull with sloped sides over a dark skirt, team stripes on four faces, and four heavy stabiliser
// legs hinged out at the corners onto broad foot pads, a piston under each. On the deck, four
// capacitor banks with lit cell windows feed a tall six-sided projector column ringed with heat
// sink fins; at its head, inside a crown of three curved emitter vanes, a faceted lens. Amber
// running lights round the deck, and a warning beacon.
//
// While the field is up (`active`), the lens and the cells glow in the dome's colour
// (`fieldColor`) and pulse, and the crown turns. Down (no power, rebooting, EMP'd), they go dark
// and the warning beacon blinks red.
//
// Built facing +Z, about 2.6 across its feet and 2 tall in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.2;
// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
// An octagon of radius r, flat faces toward the four sides and the four corners between.
const oct = (r: number): [number, number][] => Array.from({ length: 8 }, (_, k) => {
  const a = k * Math.PI / 4 + Math.PI / 8;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
// The hull: a skirt flaring out to the main hull, whose sides slope in to the deck.
const SKIRT = { y: 0, h: 0.12, bottom: 0.7, top: 0.84 };
const HULL = { y: 0.12, h: 0.36, bottom: 0.84, top: 0.72 };
const DECK_Y = HULL.y + HULL.h;
const SIDE_TILT = Math.atan2((HULL.bottom - HULL.top) * Math.cos(Math.PI / 8), HULL.h);
// The column on the deck, and the crown at its head.
const COLUMN_H = 1.0;
const CROWN_Y = DECK_Y + COLUMN_H + 0.04;
// Headings out from the centre: the legs at the corners, the capacitor banks to the sides.
const CORNERS = [0, 1, 2, 3].map(k => Math.PI / 4 + k * Math.PI / 2);
const SIDES = [0, 1, 2, 3].map(k => k * Math.PI / 2);

export const FieldGeneratorModel: React.FC<{ teamColor: string; fieldColor: string; active: boolean }> = ({ teamColor, fieldColor, active }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber);

  // The lens and cells, and the warning beacon: this generator's own, so they can pulse and blink.
  const emit = useMemo(() => own(glow(fieldColor)) as THREE.MeshBasicMaterial, [fieldColor]);
  const beacon = useMemo(() => own(glow(PALETTE.warning)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => emit.dispose(), [emit]);
  useEffect(() => () => beacon.dispose(), [beacon]);
  const tint = useMemo(() => new THREE.Color(), []);
  const crown = useRef<THREE.Group>(null);
  const lens = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    if (crown.current && active) crown.current.rotation.y += Math.min(delta, 0.05) * 0.9;
    emit.color.copy(tint.set(fieldColor)).multiplyScalar(active ? 0.8 + 0.2 * Math.sin(t * 5) : 0.12);
    lens.current?.scale.setScalar(active ? 1 + 0.06 * Math.sin(t * 5) : 0.9);
    beacon.color.copy(tint.set(PALETTE.warning)).multiplyScalar(!active && Math.sin(t * 6) > 0 ? 1 : 0.12);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.8, 2.8]} />

      {/* The pod's hull: a dark skirt, the sloped armoured hull, a team stripe on four faces. */}
      <Loft bottom={oct(SKIRT.bottom)} top={oct(SKIRT.top)} height={SKIRT.h} material={composite} position={[0, SKIRT.y, 0]} />
      <Loft bottom={oct(HULL.bottom)} top={oct(HULL.top)} height={HULL.h} material={armour} position={[0, HULL.y, 0]} />
      {SIDES.map(a => (
        <group key={a} rotation={[0, a, 0]}>
          <group position={[0, HULL.y + HULL.h * 0.62, (HULL.bottom + HULL.top) / 2 * Math.cos(Math.PI / 8) + 0.008]} rotation={[-SIDE_TILT, 0, 0]}>
            <Plate size={[0.42, 0.07, 0.012]} material={paint} />
            <Plate size={[0.5, 0.025, 0.014]} material={dark} position={[0, -0.09, 0]} />
          </group>
        </group>
      ))}

      {/* Four stabiliser legs hinged out at the corners: a heavy strut on a hinge, a piston under
          it, a broad foot pad. */}
      {CORNERS.map(a => (
        <group key={a} rotation={[0, a, 0]}>
          <Prism outline={[[0.56, 0.44], [0.76, 0.44], [1.14, 0.15], [1.14, 0.05], [1.0, 0.05], [0.58, 0.24]]} depth={0.16} axis="x" material={dark} />
          <Prism outline={[[0.74, 0.4], [0.8, 0.4], [1.06, 0.18], [1.0, 0.16]]} depth={0.17} axis="x" material={armour} />
          <Wheel radius={0.07} width={0.22} segments={8} material={steel} position={[0, 0.36, 0.64]} />
          <Turned profile={[[0.035, 0], [0.035, 0.22], [0.025, 0.22], [0.025, 0.38]]} segments={6} material={steel} position={[0, 0.12, 0.6]} rotation={[-0.12, 0, 0]} />
          <Plate size={[0.3, 0.05, 0.32]} material={black} position={[0, 0.025, 1.12]} />
          <Plate size={[0.22, 0.03, 0.22]} material={composite} position={[0, 0.06, 1.12]} />
        </group>
      ))}

      {/* The deck: a raised plate, amber running lights at the corners. */}
      <Prism outline={oct(0.62)} depth={0.04} axis="y" material={composite} position={[0, DECK_Y, 0]} />
      {CORNERS.map(a => (
        <group key={a} rotation={[0, a, 0]}>
          <Strip size={[0.1, 0.025, 0.025]} material={amber} position={[0, DECK_Y + 0.015, 0.7]} />
        </group>
      ))}

      {/* Four capacitor banks, each a sloped housing with a lit cell window, a conduit to the column. */}
      {SIDES.map(a => (
        <group key={a} rotation={[0, a, 0]} position={[0, DECK_Y + 0.04, 0]}>
          <Prism outline={[[0.26, 0], [0.56, 0], [0.56, 0.12], [0.42, 0.26], [0.26, 0.26]]} depth={0.32} axis="x" material={housing} />
          <Plate size={[0.24, 0.012, 0.13]} material={black} position={[0, 0.192, 0.492]} rotation={[Math.PI / 4, 0, 0]} />
          {[-0.07, 0, 0.07].map(x => (
            <Strip key={x} size={[0.05, 0.012, 0.1]} material={emit} position={[x, 0.198, 0.498]} rotation={[Math.PI / 4, 0, 0]} />
          ))}
          <Plate size={[0.34, 0.03, 0.2]} material={dark} position={[0, 0.27, 0.36]} />
          <Plate size={[0.08, 0.06, 0.14]} material={dark} position={[0, 0.03, 0.2]} />
        </group>
      ))}

      {/* The projector column: six-sided, ringed low with heat sink fins, a collar at its head. */}
      <Turned profile={[[0.001, 0], [0.24, 0], [0.24, 0.1], [0.2, 0.2], [0.17, COLUMN_H - 0.06], [0.22, COLUMN_H - 0.02], [0.22, COLUMN_H], [0.001, COLUMN_H]]} segments={6} material={armour} rotation={UP} position={[0, DECK_Y, 0]} />
      <Turned profile={[[0.2, 0], [0.205, 0.16]]} segments={6} material={dark} rotation={UP} position={[0, DECK_Y + 0.66, 0]} />
      {SIDES.map(a => <group key={a} rotation={[0, a + Math.PI / 6, 0]}><Strip size={[0.05, 0.1, 0.01]} material={emit} position={[0, DECK_Y + 0.74, 0.176]} /></group>)}
      {[0, 1, 2, 3, 4, 5].map(k => (
        <group key={k} rotation={[0, k * Math.PI / 3 + Math.PI / 6, 0]}>
          <Prism outline={[[0.12, 0.2], [0.27, 0.24], [0.27, 0.56], [0.12, 0.62]]} depth={0.02} axis="x" material={steel} position={[0, DECK_Y, 0]} />
        </group>
      ))}
      <Turned profile={[[0.001, 0], [0.27, 0], [0.27, 0.06], [0.001, 0.06]]} segments={6} material={dark} rotation={UP} position={[0, CROWN_Y - 0.04, 0]} />

      {/* The crown: three curved emitter vanes round the lens, lit on their inner edges. */}
      <group ref={crown} position={[0, CROWN_Y, 0]}>
        {[0, 1, 2].map(k => (
          <group key={k} rotation={[0, k * Math.PI * 2 / 3, 0]}>
            <Prism outline={[[0.14, 0], [0.3, 0], [0.42, 0.16], [0.4, 0.44], [0.32, 0.48], [0.28, 0.2], [0.18, 0.08]]} depth={0.1} axis="x" material={armour} />
            <Prism outline={[[0.32, 0.48], [0.4, 0.44], [0.41, 0.5], [0.35, 0.53]]} depth={0.11} axis="x" material={dark} />
            <Strip size={[0.03, 0.22, 0.02]} material={emit} position={[0, 0.27, 0.27]} rotation={[0.08, 0, 0]} />
          </group>
        ))}
        <Turned profile={[[0.001, 0], [0.09, 0.06], [0.09, 0.14]]} segments={6} material={steel} rotation={UP} />
        <group ref={lens} position={[0, 0.3, 0]}>
          <Turned profile={[[0.001, -0.18], [0.16, -0.03], [0.16, 0.04], [0.001, 0.22]]} segments={6} material={emit} rotation={UP} />
        </group>
      </group>

      {/* A whip antenna and the warning beacon on one bank. */}
      <group rotation={[0, Math.PI / 2, 0]} position={[0, DECK_Y + 0.3, 0]}>
        <Turned profile={[[0.02, 0], [0.02, 0.04]]} segments={6} material={dark} rotation={UP} position={[0.1, 0, 0.36]} />
        <Turned profile={[[0.008, 0.04], [0.004, 0.5]]} segments={4} material={black} rotation={UP} position={[0.1, 0, 0.36]} />
        <Turned profile={[[0.03, 0], [0.03, 0.03]]} segments={6} material={dark} rotation={UP} position={[-0.1, 0, 0.36]} />
        <Strip size={[0.05, 0.05, 0.05]} material={beacon} position={[-0.1, 0.055, 0.36]} />
      </group>
    </group>
  );
};
