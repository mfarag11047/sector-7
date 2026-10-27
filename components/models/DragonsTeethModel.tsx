// Dragon's Teeth, the cheap buildable barrier, built from the unit kit (components/kit) in the base
// structures' greys.
//
// Simple but military: three anti-tank hedgehogs planted in a row across the middle of the tile on
// a low concrete footing, the way the wall runs (`run`: along x or along z, sim/walls.ts). Each
// hedgehog is three square beams of near-black steel crossing at right angles at the centre, turned
// so it stands on three of its ends with the other three pointing up: a star from every side. Each
// beam's ends chamfer in to a smaller face, with a dull ochre hazard band just inboard, a black
// stripe through it, and a white light strip further in. A line of the side's colour runs along both sides of the footing.
//
// Built across +X in world units, the tile long and about 3 tall; `run` 'z' turns it a quarter.

import React from 'react';
import { glow, kitMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Strip } from '../kit/shapes';

// A hedgehog's beams: length and thickness.
const BEAM = { length: 4.8, width: 0.66 };
// Three beams along the axes, turned so the (1, 1, 1) diagonal stands upright: a quarter turn
// about z by 45 degrees, then tipped back about x.
const STAND: [number, number, number] = [-Math.atan(1 / Math.SQRT2), 0, Math.PI / 4];
// How high the centre sits so the lowest three ends just bite into the ground.
const CENTRE_Y = BEAM.length / (2 * Math.sqrt(3)) + 0.12;
// The row: where each hedgehog stands along the tile, and how it is turned about the upright.
const ROW = [{ x: -4.5, yaw: 0.35 }, { x: 0, yaw: 0 }, { x: 4.5, yaw: -0.35 }];
// The full tile long, so a line of them runs on unbroken from tile to tile.
const FOOTING = { length: 13.9, width: 2.8, h: 0.18 };
// A dull, dark ochre: the hazard bands mark the ends without glaring.
const HAZARD = '#6e5c24';
// Each beam's ends chamfer in to a smaller square face over this length.
const CHAMFER = { length: 0.34, tip: 0.55 };
const square = (h: number): [number, number][] => [[-h, -h], [h, -h], [h, h], [-h, h]];

// One beam along local x: the dark steel body, its chamfered ends, hazard bands and light strips.
const Beam: React.FC<{ rotation?: [number, number, number] }> = ({ rotation }) => {
  const steel = kitMaterial('structDark'), black = kitMaterial('black');
  const hazard = teamPaint(HAZARD), light = glow('#eaf4ff');
  const { length: L, width: W } = BEAM;
  const body = L - CHAMFER.length * 2;
  return (
    <group rotation={rotation}>
      <Plate size={[body, W, W]} material={steel} />
      {[-1, 1].map(s => (
        <group key={s}>
          {/* The chamfered end: from the full square in to a smaller face, along +x or -x. */}
          <Loft bottom={square(W / 2)} top={square((W / 2) * CHAMFER.tip)} height={CHAMFER.length} material={steel}
            position={[s * body / 2, 0, 0]} rotation={[0, 0, -s * Math.PI / 2]} />
          <Plate size={[0.26, W + 0.02, W + 0.02]} material={hazard} position={[s * (body / 2 - 0.2), 0, 0]} />
          <Plate size={[0.07, W + 0.025, W + 0.025]} material={black} position={[s * (body / 2 - 0.2), 0, 0]} />
          <Strip size={[0.07, W + 0.03, W + 0.03]} material={light} position={[s * (body / 2 - 0.62), 0, 0]} />
        </group>
      ))}
    </group>
  );
};

// Three beams crossing at the centre, stood on three ends.
const Hedgehog: React.FC = () => (
  <group rotation={STAND}>
    <Beam />
    <Beam rotation={[0, 0, Math.PI / 2]} />
    <Beam rotation={[0, Math.PI / 2, 0]} />
  </group>
);

export const DragonsTeethModel: React.FC<{ teamColor: string; run?: 'x' | 'z' }> = ({ teamColor, run = 'x' }) => {
  const dark = kitMaterial('structDark'), grey = kitMaterial('structGrey');
  return (
    <group rotation={[0, run === 'z' ? Math.PI / 2 : 0, 0]}>
      <ContactShadow size={[FOOTING.length + 1, FOOTING.width + 2]} />
      {/* The footing they are planted in, with a line of the side's colour along each side. */}
      <Plate size={[FOOTING.length, FOOTING.h, FOOTING.width]} material={dark} position={[0, FOOTING.h / 2, 0]} />
      <Plate size={[FOOTING.length - 0.4, 0.06, FOOTING.width - 0.4]} material={grey} position={[0, FOOTING.h + 0.03, 0]} />
      {[-1, 1].map(s => (
        <Strip key={s} size={[FOOTING.length - 0.6, 0.06, 0.05]} material={glow(teamColor)} position={[0, FOOTING.h * 0.6, s * (FOOTING.width / 2 + 0.02)]} />
      ))}
      {ROW.map(({ x, yaw }) => (
        <group key={x} position={[x, CENTRE_Y, 0]} rotation={[0, yaw, 0]}>
          <Hedgehog />
        </group>
      ))}
    </group>
  );
};
