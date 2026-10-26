// The Command HQ, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a heavy foundation block with a tall watchtower rising from its back half,
// crowned by an overhanging control cab and a roof of communications gear. The foundation sits on
// a dark plinth: light grey walls between a kick band and a heavy cornice, a band of dark windows
// and a roll-up vehicle door at the front, a pipe run along its foot, and a lower annex on one side
// with a door and a railed balcony on its roof. The tower: corner pillars, horizontal bands, an
// X-braced truss band high up, a duct running down one face from a utility box, a door at its foot.
// The cab overhangs it on an angled underside, a band of dark windows all round. On its roof, a
// tall comms mast (antenna panels, two dishes, a whip with the team beacon), two radomes and a
// radar array turning on a yoke.
//
// Team colour marks it: a stripe under the cornice and under the cab's windows, and the beacon.
//
// Built facing +Z, about 12.5 by 11 across and 22 tall to the mast's tip, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Strip, Turned } from '../kit/shapes';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
// The four faces of a square: a rotation turning +Z out through each.
const FACES = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
// The foundation: the main block, and the annex on its +X side, lower.
const FOUND = { x0: -6, x1: 4, z0: -5.4, z1: 5.2, top: 3.4 };
const ANNEX = { x0: 4, x1: 6.4, z0: -0.6, z1: 5.2, top: 2.4 };
// The tower, set back on the foundation, and the cab on top of it.
const TOWER = { x: -1.2, z: -1.4, w: 4.6, y0: FOUND.top, y1: 12.6 };
const CAB = { w: 6.8, under: 1.0, h: 1.5 };
const CAB_Y = TOWER.y1 + CAB.under;
const ROOF_Y = CAB_Y + CAB.h;
// A square of half-width h, for lofts.
const square = (h: number): [number, number][] => [[-h, -h], [h, -h], [h, h], [-h, h]];

// A box between two corners (x0, z0)–(x1, z1), from y0 to y1.
const Box: React.FC<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; material: THREE.Material }> = ({ x0, x1, z0, z1, y0, y1, material }) => (
  <Plate size={[x1 - x0, y1 - y0, z1 - z0]} material={material} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} />
);

export const CommandHqModel: React.FC<{ teamColor: string }> = ({ teamColor }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber), lamp = glow('#cfe8ff');

  // The beacon: this HQ's own, so it can blink.
  const beacon = useMemo(() => own(glow(teamColor)) as THREE.MeshBasicMaterial, [teamColor]);
  useEffect(() => () => beacon.dispose(), [beacon]);
  const tint = useMemo(() => new THREE.Color(), []);
  const radar = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    if (radar.current) radar.current.rotation.y += Math.min(delta, 0.05) * 0.6;
    beacon.color.copy(tint.set(teamColor)).multiplyScalar(Math.sin(clock.elapsedTime * 3) > 0 ? 1 : 0.2);
  });

  const half = TOWER.w / 2;
  return (
    <group>
      {/* --- The foundation --- */}
      <Plate size={[13, 0.4, 11.4]} material={dark} position={[0.2, 0.2, -0.1]} />
      <Box {...FOUND} y0={0.4} y1={FOUND.top} material={light} />
      <Box x0={FOUND.x0 - 0.05} x1={FOUND.x1 + 0.05} z0={FOUND.z0 - 0.05} z1={FOUND.z1 + 0.05} y0={0.4} y1={0.95} material={grey} />
      <Box x0={FOUND.x0 - 0.15} x1={FOUND.x1 + 0.15} z0={FOUND.z0 - 0.15} z1={FOUND.z1 + 0.15} y0={FOUND.top - 0.3} y1={FOUND.top + 0.05} material={grey} />
      <Box x0={FOUND.x0 - 0.06} x1={FOUND.x1 + 0.06} z0={FOUND.z0 - 0.06} z1={FOUND.z1 + 0.06} y0={FOUND.top - 0.48} y1={FOUND.top - 0.36} material={paint} />
      {/* Front: a band of dark windows with mullions, a roll-up vehicle door. */}
      <group position={[0, 0, FOUND.z1]}>
        <Plate size={[5.0, 1.05, 0.08]} material={grey} position={[-3.2, 2.25, 0.02]} />
        <Plate size={[4.7, 0.8, 0.06]} material={black} position={[-3.2, 2.25, 0.05]} />
        {[-5.15, -4.2, -3.2, -2.2, -1.25].map(x => <Plate key={x} size={[0.08, 0.8, 0.06]} material={grey} position={[x, 2.25, 0.08]} />)}
        <Plate size={[2.9, 2.2, 0.1]} material={grey} position={[1.6, 1.5, 0.03]} />
        <Plate size={[2.5, 1.9, 0.06]} material={dark} position={[1.6, 1.4, 0.08]} />
        {[0.7, 1.0, 1.3, 1.6, 1.9, 2.2].map(y => <Plate key={y} size={[2.5, 0.04, 0.04]} material={grey} position={[1.6, y, 0.12]} />)}
        {[0, 3.2].map(x => <Strip key={x} size={[0.18, 0.1, 0.03]} material={amber} position={[x, 2.75, 0.1]} />)}
      </group>
      {/* A pipe run along the foot of the front and the west side, on brackets. */}
      <Turned profile={[[0.12, FOUND.x0 + 0.3], [0.12, -0.4]]} segments={8} material={steel} rotation={[0, Math.PI / 2, 0]} position={[0, 1.15, FOUND.z1 + 0.18]} />
      <Turned profile={[[0.12, FOUND.z0 + 0.3], [0.12, FOUND.z1 + 0.18]]} segments={8} material={steel} position={[FOUND.x0 - 0.18, 1.15, 0]} />
      {[-5.4, -3.2, -1.0].map(x => <Plate key={x} size={[0.12, 0.3, 0.25]} material={dark} position={[x, 1.15, FOUND.z1 + 0.1]} />)}
      {/* The annex: a door, vents, and a railed balcony on its roof. */}
      <Box {...ANNEX} y0={0.4} y1={ANNEX.top} material={light} />
      <Box x0={ANNEX.x0} x1={ANNEX.x1 + 0.1} z0={ANNEX.z0 - 0.1} z1={ANNEX.z1 + 0.1} y0={ANNEX.top - 0.25} y1={ANNEX.top + 0.05} material={grey} />
      <group position={[5.2, 0, ANNEX.z1]}>
        <Plate size={[1.3, 1.7, 0.08]} material={grey} position={[0, 1.25, 0.03]} />
        <Plate size={[1.0, 1.5, 0.06]} material={dark} position={[0, 1.15, 0.07]} />
        <Strip size={[0.3, 0.06, 0.03]} material={lamp} position={[0, 2.05, 0.1]} />
      </group>
      {[-0.1, 0.5, 1.1].map(z => <Plate key={z} size={[0.06, 0.4, 0.45]} material={dark} position={[ANNEX.x1 + 0.03, 1.4, z + 2]} />)}
      <group position={[0, ANNEX.top + 0.05, 0]}>
        {[ANNEX.z0 + 0.15, ANNEX.z1 - 0.1].flatMap(z => [ANNEX.x0 + 0.2, 5.2, ANNEX.x1 - 0.05].map(x => (
          <Plate key={`${x}${z}`} size={[0.08, 0.9, 0.08]} material={steel} position={[x, 0.45, z]} />
        )))}
        {[0.45, 0.88].map(y => (
          <group key={y}>
            <Plate size={[ANNEX.x1 - ANNEX.x0 - 0.15, 0.06, 0.06]} material={steel} position={[(ANNEX.x0 + ANNEX.x1) / 2 + 0.05, y, ANNEX.z1 - 0.1]} />
            <Plate size={[0.06, 0.06, ANNEX.z1 - ANNEX.z0 - 0.2]} material={steel} position={[ANNEX.x1 - 0.05, y, (ANNEX.z0 + ANNEX.z1) / 2]} />
            <Plate size={[ANNEX.x1 - ANNEX.x0 - 0.15, 0.06, 0.06]} material={steel} position={[(ANNEX.x0 + ANNEX.x1) / 2 + 0.05, y, ANNEX.z0 + 0.15]} />
          </group>
        ))}
      </group>
      {/* Back: vent grilles and a service door. */}
      <group position={[0, 0, FOUND.z0]} rotation={[0, Math.PI, 0]}>
        {[-3.5, -1.8, 2.6].map(x => (
          <group key={x} position={[x, 2.1, 0]}>
            <Plate size={[1.3, 0.9, 0.08]} material={grey} position={[0, 0, 0.03]} />
            {[-0.25, 0, 0.25].map(y => <Plate key={y} size={[1.1, 0.08, 0.06]} material={dark} position={[0, y, 0.08]} />)}
          </group>
        ))}
        <Plate size={[1.3, 1.9, 0.08]} material={grey} position={[0.4, 1.35, 0.03]} />
        <Plate size={[1.0, 1.7, 0.06]} material={dark} position={[0.4, 1.25, 0.07]} />
      </group>
      {/* The foundation's roof: a hatch and vent boxes. */}
      <Plate size={[1.6, 0.12, 1.2]} material={dark} position={[2.2, FOUND.top + 0.1, 3.4]} />
      <Plate size={[1.3, 0.06, 0.9]} material={black} position={[2.2, FOUND.top + 0.18, 3.4]} />
      {[[-4.6, 3.6], [-4.6, 2.2]].map(([x, z]) => <Plate key={z} size={[1.0, 0.5, 0.8]} material={grey} position={[x, FOUND.top + 0.3, z]} />)}

      {/* --- The tower --- */}
      <group position={[TOWER.x, 0, TOWER.z]}>
        <Plate size={[TOWER.w, TOWER.y1 - TOWER.y0, TOWER.w]} material={light} position={[0, (TOWER.y0 + TOWER.y1) / 2, 0]} />
        {[-1, 1].flatMap(sx => [-1, 1].map(sz => (
          <Plate key={`${sx}${sz}`} size={[0.55, TOWER.y1 - TOWER.y0, 0.55]} material={grey} position={[sx * (half - 0.15), (TOWER.y0 + TOWER.y1) / 2, sz * (half - 0.15)]} />
        )))}
        {[TOWER.y0 + 0.35, 6.9].map(y => <Plate key={y} size={[TOWER.w + 0.16, 0.3, TOWER.w + 0.16]} material={grey} position={[0, y, 0]} />)}
        {/* The X-braced truss band, proud of every face. */}
        {FACES.map(r => (
          <group key={r} rotation={[0, r, 0]} position={[0, 10.3, 0]}>
            <group position={[0, 0, half + 0.12]}>
              {[-0.9, 0.9].map(y => <Plate key={y} size={[TOWER.w + 0.3, 0.2, 0.2]} material={dark} position={[0, y, 0]} />)}
              {[-2.3, 0, 2.3].map(x => <Plate key={x} size={[0.2, 1.8, 0.2]} material={dark} position={[x, 0, 0]} />)}
              {[-1.15, 1.15].flatMap(x => [1, -1].map(s => (
                <Plate key={`${x}${s}`} size={[2.6, 0.14, 0.14]} material={dark} position={[x, 0, 0.02]} rotation={[0, 0, s * Math.atan2(1.6, 2.1)]} />
              )))}
            </group>
          </group>
        ))}
        {/* Front: a door at its foot. West: a utility box with a duct running down to the deck. */}
        <group position={[0.6, TOWER.y0, half]}>
          <Plate size={[1.3, 2.0, 0.12]} material={grey} position={[0, 1.05, 0.04]} />
          <Plate size={[1.0, 1.8, 0.08]} material={dark} position={[0, 0.95, 0.09]} />
          <Strip size={[0.25, 0.06, 0.03]} material={lamp} position={[0, 2.15, 0.12]} />
        </group>
        <group position={[-half, 0, 0]}>
          <Plate size={[0.5, 0.8, 1.4]} material={grey} position={[-0.25, 8.4, 0.4]} />
          <Plate size={[0.04, 0.4, 0.9]} material={black} position={[-0.51, 8.45, 0.4]} />
          <Plate size={[0.4, 4.6, 0.5]} material={grey} position={[-0.2, 5.8, 0.9]} />
          <Plate size={[0.9, 0.5, 0.5]} material={grey} position={[-0.45, FOUND.top + 0.25, 0.9]} />
        </group>
        <group position={[half, 0, 0.4]}>
          <Plate size={[0.4, 1.0, 1.8]} material={grey} position={[0.2, 6.0, 0]} />
          <Plate size={[0.04, 0.5, 0.6]} material={black} position={[0.41, 6.05, -0.4]} />
          <Strip size={[0.03, 0.12, 0.3]} material={glow(PALETTE.cyan)} position={[0.42, 6.05, 0.4]} />
        </group>

        {/* --- The control cab --- */}
        <Loft bottom={square(half)} top={square(CAB.w / 2)} height={CAB.under} material={grey} position={[0, TOWER.y1, 0]} />
        <Plate size={[CAB.w, CAB.h, CAB.w]} material={light} position={[0, CAB_Y + CAB.h / 2, 0]} />
        {FACES.map(r => (
          <group key={r} rotation={[0, r, 0]}>
            <group position={[0, CAB_Y + 0.85, CAB.w / 2]}>
              <Plate size={[CAB.w - 0.4, 0.75, 0.06]} material={black} position={[0, 0, 0.03]} />
              {[-2.4, -1.2, 0, 1.2, 2.4].map(x => <Plate key={x} size={[0.08, 0.75, 0.06]} material={grey} position={[x, 0, 0.06]} />)}
              <Plate size={[CAB.w - 0.2, 0.08, 0.04]} material={paint} position={[0, -0.5, 0.03]} />
            </group>
            {[-2, -0.7, 0.7, 2].map(x => <Plate key={x} size={[0.5, 0.12, 0.3]} material={dark} position={[x, CAB_Y - 0.06, CAB.w / 2 - 0.15]} />)}
          </group>
        ))}
        <Plate size={[CAB.w + 0.3, 0.25, CAB.w + 0.3]} material={grey} position={[0, ROOF_Y + 0.12, 0]} />
        {FACES.map(r => (
          <group key={r} rotation={[0, r, 0]}>
            <Plate size={[CAB.w + 0.3, 0.4, 0.14]} material={dark} position={[0, ROOF_Y + 0.45, CAB.w / 2 + 0.08]} />
          </group>
        ))}
        {/* Back: a ladder up the tower to a hatch under the cab. */}
        <group position={[-0.8, 0, -half - 0.12]}>
          {[-0.3, 0.3].map(x => <Plate key={x} size={[0.07, TOWER.y1 - TOWER.y0 - 0.4, 0.07]} material={steel} position={[x, (TOWER.y0 + TOWER.y1) / 2, 0]} />)}
          {Array.from({ length: 16 }, (_, k) => TOWER.y0 + 0.6 + k * 0.52).map(y => <Plate key={y} size={[0.6, 0.05, 0.05]} material={steel} position={[0, y, 0]} />)}
        </group>

        {/* --- The roof: comms mast, radomes, radar --- */}
        <group position={[-2.3, ROOF_Y + 0.25, -2.3]}>
          <Turned profile={[[0.35, 0], [0.35, 0.5], [0.16, 0.6], [0.14, 5.4], [0.06, 5.4], [0.04, 7.6]]} segments={8} material={grey} rotation={UP} />
          {[1.6, 2.8, 4.0].map(y => (
            <group key={y} position={[0, y, 0]}>
              <Plate size={[1.4, 0.08, 0.08]} material={steel} />
              {[-1, 1].map(s => <Plate key={s} size={[0.16, 0.8, 0.08]} material={light} position={[s * 0.62, 0.3, 0]} />)}
            </group>
          ))}
          {[[0.55, 2.2, 0.8], [-0.5, 3.4, -2.2]].map(([x, y, r]) => (
            <group key={y} position={[x, y, 0]} rotation={[0, r, 0]}>
              <group rotation={[0.2, 0, 0]}>
                <Turned profile={[[0.001, -0.12], [0.35, 0], [0.38, 0.03]]} segments={10} material={light} />
              </group>
            </group>
          ))}
          <Plate size={[0.9, 0.05, 0.05]} material={steel} position={[0, 6.6, 0]} />
          <Plate size={[0.05, 0.05, 0.9]} material={steel} position={[0, 6.6, 0]} />
          <Strip size={[0.22, 0.22, 0.22]} material={beacon} position={[0, 7.65, 0]} />
        </group>
        {[[1.9, -1.9], [1.9, -0.6]].map(([x, z]) => (
          <group key={z} position={[x, ROOF_Y + 0.25, z]}>
            <Turned profile={[[0.45, 0], [0.45, 0.5]]} segments={10} material={grey} rotation={UP} />
            <Turned profile={[[0.55, 0.5], [0.55, 0.9], [0.45, 1.25], [0.25, 1.45], [0.001, 1.52]]} segments={12} material={light} rotation={UP} />
          </group>
        ))}
        <group position={[0.2, ROOF_Y + 0.25, 1.2]}>
          <Turned profile={[[0.4, 0], [0.4, 0.3], [0.2, 0.4], [0.2, 0.7]]} segments={8} material={dark} rotation={UP} />
          <group ref={radar} position={[0, 0.8, 0]}>
            <Plate size={[0.5, 0.4, 0.3]} material={grey} />
            <group position={[0, 0.5, 0.15]} rotation={[-0.3, 0, 0]}>
              <Plate size={[2.4, 0.8, 0.12]} material={light} />
              <Plate size={[2.2, 0.62, 0.04]} material={dark} position={[0, 0, 0.07]} />
            </group>
          </group>
        </group>
        {/* Lamps under the cab's overhang. */}
        {FACES.map(r => (
          <group key={r} rotation={[0, r, 0]}>
            <Strip size={[0.5, 0.05, 0.2]} material={lamp} position={[0, TOWER.y1 + 0.3, half + 0.55]} />
          </group>
        ))}
      </group>
    </group>
  );
};
