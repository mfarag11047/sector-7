// The Airpad, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a landing deck held high on a single column. At the foot, a footing block
// with a door, braced by two splayed buttress legs, lattice between them. The column rises in
// segments: two side spines framing a dark lift core, each segment with a framed opening or an
// X-braced panel, a band at every joint, and a small side platform partway up; a lift car rides
// up and down the core. At the top the spines fork into a Y and carry the deck: a broad plate
// cantilevered out over the front, a landing pad on it (a dark field, a team-colour mark, edge
// lights blinking round it in turn), an apron of grille panels beyond, fan housings under the
// deck's edge, and a short mast with a beacon.
//
// Built facing +Z, about 10 long and 7 wide at the deck and 15 tall to the mast, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
// The column: its spines' spacing across X and depth along Z, from its footing to the fork.
const COL = { x: 0.95, w: 0.42, d: 1.5, y0: 2.2, y1: 10.6 };
// Where the segments join.
const JOINTS = [2.2, 5.0, 7.8, 10.6];
// The deck: a plate whose back sits over the column and whose front reaches out over +Z.
const DECK = { y: 12.2, h: 0.4, x: 3.6, z0: -3.2, z1: 6.6 };
// The landing pad on it.
const LZ = { z: -0.2, half: 2.6 };
const LIGHTS = 12;

export const AirpadModel: React.FC<{ teamColor: string }> = ({ teamColor }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe');

  // The pad's edge lights: this airpad's own, each blinking in turn round the pad.
  const lights = useMemo(() => Array.from({ length: LIGHTS }, () => own(glow(teamColor)) as THREE.MeshBasicMaterial), [teamColor]);
  useEffect(() => () => lights.forEach(m => m.dispose()), [lights]);
  const tint = useMemo(() => new THREE.Color(), []);
  const car = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const lead = (t * 6) % LIGHTS;
    lights.forEach((m, k) => {
      const behind = (lead - k + LIGHTS) % LIGHTS;
      m.color.copy(tint.set(teamColor)).multiplyScalar(behind < 1 ? 1.2 : behind < 3 ? 0.5 : 0.15);
    });
    if (car.current) car.current.position.y = THREE.MathUtils.lerp(COL.y0 + 0.6, COL.y1 - 1.0, 0.5 - 0.5 * Math.cos(t * 0.35));
  });

  // The pad's lights, round its edge.
  const padLights = useMemo(() => Array.from({ length: LIGHTS }, (_, k) => {
    const side = Math.floor(k / 3), along = ((k % 3) - 1) * LZ.half * 0.7;
    const pos: [number, number][] = [[along, -LZ.half], [LZ.half, along], [-along, LZ.half], [-LZ.half, -along]];
    return pos[side];
  }), []);

  return (
    <group>
      {/* --- The footing and its buttress legs --- */}
      <Plate size={[4.4, 0.4, 4.4]} material={dark} position={[0, 0.2, 0]} />
      <Plate size={[3.0, COL.y0 - 0.4, 2.6]} material={light} position={[0, 0.4 + (COL.y0 - 0.4) / 2, 0]} />
      <Plate size={[3.2, 0.3, 2.8]} material={grey} position={[0, COL.y0 - 0.1, 0]} />
      <group position={[0, 0.4, 1.3]}>
        <Plate size={[1.1, 1.5, 0.08]} material={grey} position={[0, 0.75, 0.03]} />
        <Plate size={[0.85, 1.35, 0.06]} material={dark} position={[0, 0.68, 0.07]} />
        <Strip size={[0.3, 0.06, 0.04]} material={lamp} position={[0, 1.6, 0.08]} />
      </group>
      {/* Two splayed legs, front and back, each a sloping slab with a foot and lattice beside it. */}
      {[1, -1].map(s => (
        <group key={s} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          {[-1, 1].map(sx => (
            <group key={sx} position={[sx * 1.15, 0, 0]}>
              <Prism outline={[[1.0, 3.2], [1.4, 3.2], [3.6, 0.4], [3.6, 0], [3.0, 0], [1.0, 2.6]]} depth={0.35} axis="x" material={grey} />
              <Prism outline={[[1.35, 3.0], [1.5, 3.0], [3.55, 0.45], [3.4, 0.45]]} depth={0.38} axis="x" material={dark} />
              <Plate size={[0.7, 0.3, 0.9]} material={dark} position={[0, 0.15, 3.3]} />
            </group>
          ))}
          {[0.9, 1.7, 2.5].map(y => <Plate key={y} size={[2.2, 0.06, 0.06]} material={steel} position={[0, y, 1.5 + (3.2 - y) * 0.6]} />)}
          {[1, -1].map(d => <Plate key={d} size={[2.6, 0.06, 0.06]} material={steel} position={[0, 1.6, 2.1]} rotation={[0, 0, d * 0.55]} />)}
        </group>
      ))}

      {/* --- The column --- */}
      {/* The lift core, dark, and the car that rides it. */}
      <Turned profile={[[0.48, COL.y0], [0.48, COL.y1 + 0.6]]} segments={10} material={black} rotation={UP} />
      <group ref={car} position={[0, COL.y0 + 0.6, 0]}>
        <Plate size={[1.15, 1.0, 1.15]} material={grey} />
        <Strip size={[0.6, 0.12, 0.03]} material={lamp} position={[0, 0.25, 0.59]} />
      </group>
      {/* The spines: a front and back rail each side, joined at every joint; framed openings and
          X-braced panels between. */}
      {[-1, 1].map(sx => (
        <group key={sx} position={[sx * COL.x, 0, 0]}>
          {[-1, 1].map(sz => <Plate key={sz} size={[COL.w, COL.y1 - COL.y0, 0.32]} material={light} position={[0, (COL.y0 + COL.y1) / 2, sz * (COL.d / 2 - 0.16)]} />)}
          {JOINTS.map(y => <Plate key={y} size={[COL.w + 0.12, 0.42, COL.d + 0.12]} material={grey} position={[0, y, 0]} />)}
          {JOINTS.slice(0, -1).map((y, k) => {
            const mid = (y + JOINTS[k + 1]) / 2, h = JOINTS[k + 1] - y - 0.6;
            return k % 2 === 1
              ? (
                <group key={y} position={[0, mid, 0]}>
                  <Plate size={[0.08, h, COL.d - 0.6]} material={dark} position={[sx * 0.1, 0, 0]} />
                  {[1, -1].map(d => <Plate key={d} size={[0.1, Math.hypot(h, COL.d - 0.6) - 0.1, 0.1]} material={steel} position={[sx * 0.16, 0, 0]} rotation={[d * Math.atan2(COL.d - 0.6, h), 0, 0]} />)}
                </group>
              )
              : <Plate key={y} size={[0.06, h, COL.d - 0.6]} material={black} position={[sx * 0.05, mid, 0]} />;
          })}
        </group>
      ))}
      {/* A small side platform partway up, railed. */}
      <group position={[-COL.x - 0.2, JOINTS[1], 0]}>
        <Plate size={[1.4, 0.12, 1.6]} material={grey} position={[-0.7, 0, 0]} />
        {[-0.75, 0.75].map(z => <Plate key={z} size={[0.05, 0.7, 0.05]} material={steel} position={[-1.35, 0.35, z]} />)}
        <Plate size={[0.05, 0.05, 1.6]} material={steel} position={[-1.35, 0.7, 0]} />
        <Plate size={[0.3, 0.3, 0.2]} material={dark} position={[-0.9, 0.2, 0.6]} />
      </group>

      {/* --- The fork, and the deck --- */}
      {[-1, 1].map(sx => (
        <group key={sx} position={[sx * COL.x, 0, 0]} rotation={[0, 0, 0]}>
          <Prism outline={[[-0.75, COL.y1], [0.75, COL.y1], [3.2, DECK.y], [1.8, DECK.y], [0.2, COL.y1 + 0.8], [-0.75, COL.y1 + 0.8]]} depth={COL.w} axis="x" material={light} />
          <Prism outline={[[-0.75, COL.y1 + 0.8], [-0.2, COL.y1 + 0.8], [-1.6, DECK.y], [-2.6, DECK.y]]} depth={COL.w} axis="x" material={light} />
        </group>
      ))}
      <group position={[0, DECK.y, 0]}>
        <Plate size={[DECK.x * 2, DECK.h, DECK.z1 - DECK.z0]} material={grey} position={[0, DECK.h / 2, (DECK.z0 + DECK.z1) / 2]} />
        <Plate size={[DECK.x * 2 + 0.2, 0.14, DECK.z1 - DECK.z0 + 0.2]} material={dark} position={[0, 0.07, (DECK.z0 + DECK.z1) / 2]} />
        {/* The landing pad: a dark field, a team mark, lights round it in turn. */}
        <Plate size={[LZ.half * 2 + 0.3, 0.06, LZ.half * 2 + 0.3]} material={light} position={[0, DECK.h + 0.03, LZ.z]} />
        <Plate size={[LZ.half * 2, 0.06, LZ.half * 2]} material={dark} position={[0, DECK.h + 0.05, LZ.z]} />
        <Turned profile={[[1.5, 0], [1.68, 0]]} segments={24} material={paint} rotation={UP} position={[0, DECK.h + 0.09, LZ.z]} />
        {[-0.55, 0.55].map(x => <Plate key={x} size={[0.18, 0.03, 1.4]} material={paint} position={[x, DECK.h + 0.09, LZ.z]} />)}
        <Plate size={[0.92, 0.03, 0.18]} material={paint} position={[0, DECK.h + 0.09, LZ.z]} />
        {padLights.map(([x, z], k) => <Strip key={k} size={[0.16, 0.06, 0.16]} material={lights[k]} position={[x, DECK.h + 0.1, LZ.z + z]} />)}
        {/* The apron beyond: grille panels and chevrons, a raised lip at the far edge. */}
        {[3.3, 4.5].map(z => <Plate key={z} size={[DECK.x * 1.4, 0.04, 0.9]} material={black} position={[0, DECK.h + 0.03, z]} />)}
        {[-1, 1].map(s => <Plate key={s} size={[0.9, 0.04, 0.16]} material={lamp} position={[s * 0.5, DECK.h + 0.04, 5.7]} rotation={[0, s * 0.5, 0]} />)}
        <Plate size={[DECK.x * 2, 0.3, 0.2]} material={dark} position={[0, DECK.h + 0.15, DECK.z1 - 0.1]} />
        {/* Fan housings under the deck's sides. */}
        {[-1, 1].flatMap(s => [-2.0, 0.8].map(z => (
          <group key={`${s}${z}`} position={[s * (DECK.x - 0.2), -0.25, z]}>
            <Turned profile={[[0.5, -0.35], [0.5, 0.35]]} segments={12} material={dark} rotation={[0, Math.PI / 2, 0]} />
            <Turned profile={[[0.38, 0.36], [0.001, 0.36]]} segments={12} material={black} rotation={[0, s * Math.PI / 2, 0]} />
          </group>
        )))}
        {/* A short mast with a beacon at the back corner, and lamps under the front edge. */}
        <group position={[DECK.x - 0.5, DECK.h, DECK.z0 + 0.5]}>
          <Plate size={[0.5, 0.6, 0.5]} material={dark} position={[0, 0.3, 0]} />
          <Turned profile={[[0.06, 0.6], [0.04, 2.2]]} segments={6} material={steel} rotation={UP} />
          <Strip size={[0.16, 0.16, 0.16]} material={glow(PALETTE.warning)} position={[0, 2.25, 0]} />
        </group>
        {[-2.4, 0, 2.4].map(x => <Strip key={x} size={[0.4, 0.05, 0.12]} material={lamp} position={[x, -0.02, DECK.z1 - 0.2]} />)}
      </group>
    </group>
  );
};
