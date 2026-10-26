// The Factory, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a vehicle plant on a raised concrete pad. The assembly hangar fills the
// middle: a long hall with a chamfered roof and ribs across it, its whole front a portal framed in
// dark plate, and inside, under a lit bay, two robot arms at work on the line, sparks flashing.
// Rails run out of the portal across the pad. Beside the hangar, an office block (a door, a marked
// sign panel, a window, an AC unit) and a machinery block with pipes. Behind it to the west, the
// plant: two tall smokestacks, a domed storage tank on a lattice frame, a lattice tower, and pipes
// between. Over the east side, a gantry crane on lattice legs, its trolley running slowly along the
// beam and back with its hook block. Spare track sections, a cable spool and a bin of parts on the pad.
//
// Team colour: a stripe round the portal, the sign panel, and the crane's beacon.
//
// Built facing +Z, about 13 by 13 across and 12 tall to the stacks' tops, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Prism, Strip, Turned } from '../kit/shapes';
import { Lattice } from '../kit/lattice';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const PAD = { x: 6.6, z: 6.4, h: 0.4 };
// The hangar: its cross-section across X (a chamfered roof), and its run along Z.
const HALL = { x: -0.6, z0: -4.6, z1: 2.4, w: 3.4, eave: 4.4, ridge: 5.8, flat: 2.2 };
const section = (w: number, eave: number, ridge: number, flat: number): [number, number][] =>
  [[-w, 0], [w, 0], [w, eave], [flat, ridge], [-flat, ridge], [-w, eave]];
// The same section with the portal's opening cut out of its foot: an arch.
const OPEN = { w: 2.7, eave: 3.7, ridge: 4.6, flat: 1.6 };
const arch = (w: number, eave: number, ridge: number, flat: number): [number, number][] => [
  [-w, 0], [-OPEN.w, 0], [-OPEN.w, OPEN.eave], [-OPEN.flat, OPEN.ridge], [OPEN.flat, OPEN.ridge], [OPEN.w, OPEN.eave], [OPEN.w, 0],
  [w, 0], [w, eave], [flat, ridge], [-flat, ridge], [-w, eave],
];
// How deep the bay goes into the hall behind the portal.
const BAY = 2.2;
// The crane's beam runs along Z over the east side.
const CRANE = { x: 5.2, z0: -5.6, z1: 4.6, h: 8.0 };

// A section of hall, `depth` long along Z, centred on its group: the outline is drawn across X.
const Hall: React.FC<{ outline: [number, number][]; depth: number; material: THREE.Material; position?: [number, number, number] }> = ({ outline, depth, material, position }) => (
  <group position={position} rotation={[0, Math.PI / 2, 0]}>
    <Prism outline={outline.map(([x, y]) => [-x, y] as [number, number])} depth={depth} axis="x" material={material} />
  </group>
);


export const FactoryModel: React.FC<{ teamColor: string }> = ({ teamColor }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), composite = kitMaterial('composite');
  const paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe'), amber = glow(PALETTE.amber);

  // The welding sparks and the bay's light: this factory's own, so they can flicker.
  const sparks = useMemo(() => own(glow('#fff1c2')) as THREE.MeshBasicMaterial, []);
  const bay = useMemo(() => own(glow('#ffd28a')) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => { sparks.dispose(); bay.dispose(); }, [sparks, bay]);
  const tint = useMemo(() => new THREE.Color(), []);
  const trolley = useRef<THREE.Group>(null);
  const arms = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flash = Math.max(0, Math.sin(t * 23) * Math.sin(t * 7.3));
    sparks.color.copy(tint.set('#fff1c2')).multiplyScalar(flash > 0.3 ? 1.4 : 0.05);
    bay.color.copy(tint.set('#ffd28a')).multiplyScalar(0.22 + 0.12 * flash);
    if (trolley.current) trolley.current.position.z = THREE.MathUtils.lerp(CRANE.z0 + 1.4, CRANE.z1 - 0.6, 0.5 + 0.5 * Math.sin(t * 0.25));
    arms.current.forEach((a, i) => { if (a) a.rotation.z = (i ? 1 : -1) * (0.5 + 0.15 * Math.sin(t * 1.7 + i)); });
  });

  const hallMid = (HALL.z0 + HALL.z1) / 2, hallLen = HALL.z1 - HALL.z0;
  return (
    <group>
      {/* The pad: raised concrete, chamfered, with rails running out of the portal. */}
      <Loft bottom={[[-PAD.x - 0.3, -PAD.z - 0.3], [PAD.x + 0.3, -PAD.z - 0.3], [PAD.x + 0.3, PAD.z + 0.3], [-PAD.x - 0.3, PAD.z + 0.3]]}
        top={[[-PAD.x, -PAD.z], [PAD.x, -PAD.z], [PAD.x, PAD.z], [-PAD.x, PAD.z]]} height={PAD.h} material={grey} />
      {[-1.6, 1.6].flatMap(cx => [-0.45, 0.45].map(dx => (
        <Plate key={`${cx}${dx}`} size={[0.1, 0.06, PAD.z - HALL.z1 + 2]} material={steel} position={[HALL.x + cx + dx, PAD.h + 0.03, (HALL.z1 - 2 + PAD.z) / 2]} />
      )))}
      <Plate size={[6.4, 0.02, PAD.z - HALL.z1]} material={dark} position={[HALL.x, PAD.h + 0.01, (HALL.z1 + PAD.z) / 2]} />

      {/* --- The hangar --- */}
      {/* The hall: solid behind the bay, an arch round it in front. */}
      <Hall outline={section(HALL.w, HALL.eave, HALL.ridge, HALL.flat)} depth={hallLen - BAY} material={light} position={[HALL.x, PAD.h, HALL.z0 + (hallLen - BAY) / 2]} />
      <Hall outline={arch(HALL.w, HALL.eave, HALL.ridge, HALL.flat)} depth={BAY} material={light} position={[HALL.x, PAD.h, HALL.z1 - BAY / 2]} />
      {/* Ribs across the roof and down the walls, and a ridge vent. */}
      {Array.from({ length: 4 }, (_, k) => HALL.z0 + 0.4 + k * (hallLen - BAY - 0.6) / 3).map(z => (
        <Hall key={z} outline={section(HALL.w + 0.08, HALL.eave, HALL.ridge + 0.08, HALL.flat)} depth={0.25} material={grey} position={[HALL.x, PAD.h, z]} />
      ))}
      <Plate size={[1.6, 0.35, hallLen - 1.4]} material={dark} position={[HALL.x, PAD.h + HALL.ridge + 0.2, hallMid]} />
      {/* The portal: a heavy frame round the opening, a team stripe, the lit bay inside. */}
      <group position={[HALL.x, PAD.h, HALL.z1]}>
        <Hall outline={arch(HALL.w + 0.3, HALL.eave + 0.1, HALL.ridge + 0.2, HALL.flat + 0.1)} depth={0.5} material={dark} position={[0, 0, 0.15]} />
        {/* The bay: its back wall lit, a light along its ceiling. */}
        <Hall outline={section(OPEN.w, OPEN.eave, OPEN.ridge, OPEN.flat)} depth={0.05} material={bay} position={[0, 0, -BAY + 0.03]} />
        <Plate size={[3.0, 0.06, BAY - 0.2]} material={lamp} position={[0, OPEN.ridge - 0.08, -BAY / 2]} />
        <Plate size={[6.9, 0.14, 0.05]} material={paint} position={[0, HALL.eave - 0.15, 0.42]} />
        {[-3.0, 3.0].map(x => <Strip key={x} size={[0.12, 0.3, 0.04]} material={amber} position={[x, 2.0, 0.42]} />)}
        {/* Inside: two robot arms at work on the line, sparks between them. */}
        <group position={[0, 0, -BAY / 2]}>
          {[-1, 1].map((s, i) => (
            <group key={s} position={[s * 2.1, 0, -0.2]}>
              <Plate size={[0.4, 0.3, 0.4]} material={grey} position={[0, 0.15, 0]} />
              <group ref={g => { arms.current[i] = g; }} position={[0, 0.3, 0]}>
                <Plate size={[0.16, 1.5, 0.16]} material={amber} position={[0, 0.75, 0]} />
                <Plate size={[0.9, 0.12, 0.12]} material={steel} position={[-s * 0.45, 1.5, 0]} />
              </group>
              <Strip size={[0.14, 0.14, 0.14]} material={sparks} position={[-s * 1.05, 1.0, 0.1]} />
            </group>
          ))}
        </group>
      </group>

      {/* --- Beside the hangar: the office block and the machinery block --- */}
      <group position={[4.2, PAD.h, 1.0]}>
        <Plate size={[2.2, 3.0, 2.6]} material={light} position={[0, 1.5, 0]} />
        <Loft bottom={[[-1.2, -1.4], [1.2, -1.4], [1.2, 1.4], [-1.2, 1.4]]} top={[[-1.0, -1.2], [1.0, -1.2], [1.0, 0.9], [-1.0, 0.9]]} height={0.4} material={grey} position={[0, 3.0, 0]} />
        <group position={[0, 0, 1.3]}>
          <Plate size={[0.9, 1.7, 0.08]} material={grey} position={[-0.4, 0.85, 0.03]} />
          <Plate size={[0.7, 1.55, 0.06]} material={dark} position={[-0.4, 0.78, 0.07]} />
          <Strip size={[0.25, 0.06, 0.04]} material={lamp} position={[-0.4, 1.8, 0.08]} />
          <Plate size={[0.8, 0.9, 0.05]} material={dark} position={[0.55, 2.2, 0.03]} />
          {[0, 1].map(k => <Plate key={k} size={[0.6, 0.12, 0.04]} material={paint} position={[0.55, 2.4 - k * 0.3, 0.07]} />)}
          <Plate size={[0.7, 0.4, 0.05]} material={black} position={[0.55, 1.2, 0.03]} />
        </group>
        <Plate size={[0.8, 0.5, 0.6]} material={grey} position={[0.4, 3.6, -0.4]} />
      </group>
      <group position={[4.6, PAD.h, -2.6]}>
        <Plate size={[2.6, 2.2, 3.4]} material={grey} position={[0, 1.1, 0]} />
        <Plate size={[2.2, 0.5, 2.8]} material={dark} position={[0, 2.45, 0]} />
        {[-0.8, 0, 0.8].map(z => <Plate key={z} size={[0.06, 1.0, 0.5]} material={dark} position={[1.32, 1.2, z]} />)}
        {[-0.6, 0.6].map(z => <Turned key={z} profile={[[0.18, 0], [0.18, 1.8]]} segments={8} material={steel} rotation={[0, -Math.PI / 2, 0]} position={[-0.9, 0.7 + (z > 0 ? 0.6 : 0), z]} />)}
        <Turned profile={[[0.3, 0], [0.3, 0.9], [0.22, 1.05]]} segments={8} material={steel} rotation={UP} position={[0.6, 2.7, -0.8]} />
      </group>

      {/* --- The plant to the west and behind --- */}
      {[[-5.2, -4.7, 11.5, 0.42], [-3.7, -5.3, 9.6, 0.34]].map(([x, z, h, r]) => (
        <group key={x} position={[x, PAD.h, z]}>
          <Turned profile={[[r + 0.25, 0], [r + 0.25, 1.2], [r, 1.6], [r, h - 0.5], [r + 0.08, h - 0.5], [r + 0.08, h]]} segments={10} material={grey} rotation={UP} />
          {[3, 6, 8.5].filter(y => y < h - 0.6).map(y => <Turned key={y} profile={[[r + 0.06, y], [r + 0.06, y + 0.2]]} segments={10} material={dark} rotation={UP} />)}
          <Strip size={[0.12, 0.12, 0.12]} material={glow(PALETTE.warning)} position={[0, h + 0.1, 0]} />
        </group>
      ))}
      <group position={[-5.0, PAD.h, -1.0]}>
        <Lattice w={1.8} h={1.6} position={[0, 0, 0]} />
        <Turned profile={[[1.05, 1.6], [1.05, 4.6], [0.85, 5.2], [0.4, 5.5], [0.001, 5.55]]} segments={14} material={light} rotation={UP} />
        {[2.4, 3.8].map(y => <Turned key={y} profile={[[1.09, y], [1.09, y + 0.15]]} segments={14} material={grey} rotation={UP} />)}
        <Turned profile={[[0.13, 0], [0.13, 2.4]]} segments={8} material={steel} rotation={[0, Math.PI / 2, 0]} position={[0.8, 3.0, 0]} />
        <Turned profile={[[0.13, 0], [0.13, 2.4]]} segments={8} material={steel} rotation={UP} position={[0.4, 5.3, 0]} />
        <Turned profile={[[0.13, 0], [0.13, 3.4]]} segments={8} material={steel} rotation={[0, Math.PI, 0]} position={[0.4, 7.6, 0]} />
      </group>
      <Lattice w={1.0} h={7.5} position={[-2.4, PAD.h, -5.4]} />
      <Turned profile={[[0.6, 0], [0.6, 2.6], [0.4, 3.0], [0.001, 3.05]]} segments={10} material={light} rotation={UP} position={[-5.6, PAD.h, -3.1]} />

      {/* --- The gantry crane over the east side --- */}
      <Lattice w={0.7} h={CRANE.h} position={[CRANE.x, PAD.h, CRANE.z0 + 0.35]} />
      <Lattice w={0.7} h={CRANE.h} position={[CRANE.x, PAD.h, CRANE.z1 - 0.35]} />
      <Plate size={[0.6, 0.5, CRANE.z1 - CRANE.z0]} material={dark} position={[CRANE.x, PAD.h + CRANE.h + 0.25, (CRANE.z0 + CRANE.z1) / 2]} />
      <Plate size={[0.7, 0.12, CRANE.z1 - CRANE.z0 + 0.2]} material={grey} position={[CRANE.x, PAD.h + CRANE.h + 0.56, (CRANE.z0 + CRANE.z1) / 2]} />
      <Strip size={[0.14, 0.14, 0.14]} material={glow(teamColor)} position={[CRANE.x, PAD.h + CRANE.h + 0.7, CRANE.z1]} />
      <group ref={trolley} position={[CRANE.x, PAD.h + CRANE.h, 0]}>
        <Plate size={[0.9, 0.4, 0.8]} material={amber} position={[0, -0.1, 0]} />
        {[-0.15, 0.15].map(x => <Plate key={x} size={[0.03, 1.6, 0.03]} material={black} position={[x, -1.1, 0]} />)}
        {/* The hook block. */}
        <Plate size={[0.5, 0.35, 0.3]} material={amber} position={[0, -2.05, 0]} />
        <Turned profile={[[0.05, 0], [0.05, 0.3]]} segments={6} material={steel} rotation={[Math.PI / 2, 0, 0]} position={[0, -2.25, 0]} />
      </group>

      {/* --- On the pad: spare track sections, a cable spool, a bin of parts --- */}
      {[[-4.2, 3.6, 0.3], [-4.6, 4.8, -0.2]].map(([x, z, r]) => (
        <group key={z} position={[x, PAD.h + 0.15, z]} rotation={[0, r, 0]}>
          <Plate size={[0.5, 0.3, 2.0]} material={black} />
          {[-0.75, -0.25, 0.25, 0.75].map(dz => <Plate key={dz} size={[0.54, 0.06, 0.14]} material={steel} position={[0, 0.16, dz]} />)}
        </group>
      ))}
      <group position={[2.4, PAD.h + 0.55, 5.2]} rotation={[0, 0.3, 0]}>
        <Turned profile={[[0.55, -0.4], [0.55, -0.32], [0.3, -0.32], [0.3, 0.32], [0.55, 0.32], [0.55, 0.4]]} segments={12} material={dark} rotation={[0, Math.PI / 2, 0]} />
        <Turned profile={[[0.42, -0.3], [0.42, 0.3]]} segments={12} material={composite} rotation={[0, Math.PI / 2, 0]} />
      </group>
      <group position={[4.4, PAD.h, 4.8]}>
        <Plate size={[1.4, 0.6, 0.9]} material={grey} position={[0, 0.3, 0]} />
        {[[-0.35, 0.1], [0.2, -0.15], [0.4, 0.2]].map(([x, z]) => <Plate key={x} size={[0.3, 0.25, 0.3]} material={steel} position={[x, 0.65, z]} />)}
      </group>
    </group>
  );
};
