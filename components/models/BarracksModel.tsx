// The Barracks, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: an L of two blocks on a raised concrete pad with chamfered edges and ramps.
// The main block, two storeys, holds the bays: two roll-up doors under awnings, a row of hooded
// windows above, weapon lockers against the wall between, and on its roof two AC units, a pipe run
// and a whip antenna. The command block beside it stands a storey taller: a double door at the top
// of a railed stair, a team-marked panel and a screen on its walls, floodlights at its corners, and
// on its roof a comms mast with two dishes, a satellite dish turning slowly on a yoke, AC boxes and
// two exhaust stacks. In front of the bays, a fenced training yard: an assembly circle, a row of
// targets and a pull-up frame; supply crates are stacked at the far end.
//
// Team colour: a stripe under each block's cornice, the marked panel and the door light.
//
// Built facing +Z, about 13 by 12 across and 12 tall to the mast's tip, in world units.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Strip, Turned } from '../kit/shapes';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const PAD = { x: 6.6, z: 6.2, h: 0.4 };
// The blocks, as corners (x0, z0)–(x1, z1) and the height of their roofs.
const MAIN = { x0: -6.0, x1: 1.0, z0: -5.6, z1: -0.6, top: 5.0 };
const CMD = { x0: 1.0, x1: 6.0, z0: -5.6, z1: 1.4, top: 7.2 };
const STOREY = 2.5;
// The training yard in front of the bays.
const YARD = { x0: -6.0, x1: 1.0, z0: -0.6, z1: 5.6 };

// A chain-link fence panel: see-through, shared by every barracks.
let fenceMaterial: THREE.MeshStandardMaterial | null = null;
const fence = () => (fenceMaterial ??= new THREE.MeshStandardMaterial({ color: '#3a3e44', transparent: true, opacity: 0.4, roughness: 0.8, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));

// A box between two corners, from y0 to y1.
const Box: React.FC<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; material: THREE.Material }> = ({ x0, x1, z0, z1, y0, y1, material }) => (
  <Plate size={[x1 - x0, y1 - y0, z1 - z0]} material={material} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} />
);

// A block: walls, a band at each storey, a cornice and a team stripe under it.
const Block: React.FC<{ b: typeof MAIN; paint: THREE.Material }> = ({ b, paint }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const grow = (d: number) => ({ x0: b.x0 - d, x1: b.x1 + d, z0: b.z0 - d, z1: b.z1 + d });
  return (
    <group>
      <Box {...grow(0)} y0={PAD.h} y1={b.top} material={light} />
      <Box {...grow(0.05)} y0={PAD.h} y1={PAD.h + 0.45} material={grey} />
      {Array.from({ length: Math.floor((b.top - PAD.h) / STOREY) }, (_, k) => PAD.h + (k + 1) * STOREY).filter(y => y < b.top - 0.6).map(y => (
        <Box key={y} {...grow(0.08)} y0={y - 0.12} y1={y + 0.12} material={grey} />
      ))}
      <Box {...grow(0.06)} y0={b.top - 0.5} y1={b.top - 0.38} material={paint} />
      {/* The roof, inside a dark parapet. */}
      <Box {...grow(0.02)} y0={b.top - 0.3} y1={b.top + 0.04} material={grey} />
      <Box x0={b.x0 - 0.14} x1={b.x1 + 0.14} z0={b.z0 - 0.14} z1={b.z0 + 0.14} y0={b.top - 0.3} y1={b.top + 0.3} material={dark} />
      <Box x0={b.x0 - 0.14} x1={b.x1 + 0.14} z0={b.z1 - 0.14} z1={b.z1 + 0.14} y0={b.top - 0.3} y1={b.top + 0.3} material={dark} />
      <Box x0={b.x0 - 0.14} x1={b.x0 + 0.14} z0={b.z0 - 0.14} z1={b.z1 + 0.14} y0={b.top - 0.3} y1={b.top + 0.3} material={dark} />
      <Box x0={b.x1 - 0.14} x1={b.x1 + 0.14} z0={b.z0 - 0.14} z1={b.z1 + 0.14} y0={b.top - 0.3} y1={b.top + 0.3} material={dark} />
    </group>
  );
};

// A hooded window on a wall facing +Z: a frame, dark glass, a tilted hood above.
const Window: React.FC<{ position: [number, number, number]; rotation?: [number, number, number] }> = ({ position, rotation }) => {
  const grey = kitMaterial('structGrey'), dark = kitMaterial('structDark'), black = kitMaterial('black');
  return (
    <group position={position} rotation={rotation}>
      <Plate size={[0.95, 0.6, 0.06]} material={grey} position={[0, 0, 0.03]} />
      <Plate size={[0.8, 0.45, 0.04]} material={black} position={[0, -0.02, 0.06]} />
      <Plate size={[1.05, 0.06, 0.35]} material={dark} position={[0, 0.36, 0.17]} rotation={[0.3, 0, 0]} />
    </group>
  );
};
const WEST: [number, number, number] = [0, -Math.PI / 2, 0], EAST: [number, number, number] = [0, Math.PI / 2, 0], BACK: [number, number, number] = [0, Math.PI, 0];

export const BarracksModel: React.FC<{ teamColor: string }> = ({ teamColor }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), composite = kitMaterial('composite'), paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe'), amber = glow(PALETTE.amber), screen = glow(PALETTE.cyan);

  const dish = useRef<THREE.Group>(null);
  useFrame((_, delta) => { if (dish.current) dish.current.rotation.y += Math.min(delta, 0.05) * 0.25; });

  return (
    <group>
      {/* The pad: raised concrete, chamfered all round, a ramp at the front of the yard and one at the side. */}
      <Loft bottom={[[-PAD.x - 0.3, -PAD.z - 0.3], [PAD.x + 0.3, -PAD.z - 0.3], [PAD.x + 0.3, PAD.z + 0.3], [-PAD.x - 0.3, PAD.z + 0.3]]}
        top={[[-PAD.x, -PAD.z], [PAD.x, -PAD.z], [PAD.x, PAD.z], [-PAD.x, PAD.z]]} height={PAD.h} material={grey} />
      {[[-2.5, PAD.z, 0], [PAD.x, 3.2, Math.PI / 2]].map(([x, z, r]) => (
        <group key={r} position={[x, 0, z]} rotation={[0, r, 0]}>
          <Loft bottom={[[-0.9, 0], [0.9, 0], [0.9, 1.2], [-0.9, 1.2]]} top={[[-0.9, 0], [0.9, 0], [0.9, 0.02], [-0.9, 0.02]]} height={PAD.h} material={grey} />
        </group>
      ))}

      {/* --- The main block: the bays --- */}
      <Block b={MAIN} paint={paint} />
      <group position={[0, 0, MAIN.z1]}>
        {/* Two roll-up doors under awnings. */}
        {[-4.3, -1.6].map(x => (
          <group key={x} position={[x, PAD.h, 0]}>
            <Plate size={[2.3, 2.3, 0.1]} material={grey} position={[0, 1.15, 0.03]} />
            <Plate size={[2.0, 2.1, 0.06]} material={dark} position={[0, 1.05, 0.08]} />
            {[0.3, 0.6, 0.9, 1.2, 1.5, 1.8].map(y => <Plate key={y} size={[2.0, 0.04, 0.04]} material={grey} position={[0, y, 0.12]} />)}
            <Plate size={[2.6, 0.08, 0.7]} material={dark} position={[0, 2.45, 0.35]} rotation={[0.25, 0, 0]} />
            <Strip size={[0.3, 0.06, 0.04]} material={amber} position={[0.9, 2.3, 0.1]} />
          </group>
        ))}
        {/* Weapon lockers between the doors and beside them. */}
        {[-2.95, 0.15].map(x => (
          <group key={x} position={[x, PAD.h, 0.25]}>
            <Plate size={[0.7, 1.7, 0.45]} material={composite} position={[0, 0.85, 0]} />
            <Plate size={[0.56, 1.4, 0.04]} material={black} position={[0, 0.9, 0.23]} />
            {[-0.15, 0, 0.15].map(dx => <Plate key={dx} size={[0.04, 1.0, 0.03]} material={steel} position={[dx, 0.9, 0.26]} />)}
          </group>
        ))}
        {/* Hooded windows on the upper storey. */}
        {[-5.0, -3.4, -1.8, -0.2].map(x => <Window key={x} position={[x, PAD.h + STOREY + 1.15, 0]} />)}
      </group>
      {/* The same windows down the west end and along the back, both storeys; and on the command
          block's back and east side. */}
      {[-4.4, -2.4].flatMap(z => [1.15, STOREY + 1.15].map(y => <Window key={`${z}${y}`} position={[MAIN.x0, PAD.h + y, z]} rotation={WEST} />))}
      {[-5.0, -3.4, -1.8, -0.2].flatMap(x => [1.15, STOREY + 1.15].map(y => <Window key={`${x}${y}`} position={[x, PAD.h + y, MAIN.z0]} rotation={BACK} />))}
      {[2.4, 4.6].flatMap(x => [1.15, STOREY + 1.15, 2 * STOREY + 1.0].map(y => <Window key={`${x}${y}`} position={[x, PAD.h + y, CMD.z0]} rotation={BACK} />))}
      {[-4.0, -1.8, 0.4].flatMap(z => [STOREY + 1.15, 2 * STOREY + 1.0].map(y => <Window key={`${z}${y}`} position={[CMD.x1, PAD.h + y, z]} rotation={EAST} />))}
      {/* Its roof: two AC units with fans, a pipe run, a whip antenna. */}
      <group position={[0, MAIN.top + 0.08, 0]}>
        {[-4.8, -3.3].map(x => (
          <group key={x} position={[x, 0, -1.6]}>
            <Plate size={[1.3, 0.7, 1.1]} material={grey} position={[0, 0.35, 0]} />
            <Turned profile={[[0.4, 0], [0.4, 0.02], [0.001, 0.02]]} segments={12} material={black} rotation={UP} position={[0, 0.7, 0]} />
            <Plate size={[0.7, 0.03, 0.06]} material={dark} position={[0, 0.74, 0]} rotation={[0, x, 0]} />
          </group>
        ))}
        <Turned profile={[[0.13, -5.4], [0.13, -0.9]]} segments={8} material={steel} position={[-1.2, 0.25, 0]} />
        <Turned profile={[[0.13, -5.4], [0.13, -0.9]]} segments={8} material={steel} position={[-0.8, 0.25, 0]} />
        <Turned profile={[[0.06, 0], [0.06, 0.3], [0.02, 0.3], [0.015, 2.4]]} segments={6} material={dark} rotation={UP} position={[-5.6, 0, -5.2]} />
      </group>

      {/* --- The command block --- */}
      <Block b={CMD} paint={paint} />
      {/* A railed stair up the front to a landing and the double door. */}
      <group position={[4.0, PAD.h, CMD.z1]}>
        <Plate size={[2.6, 0.9, 1.4]} material={grey} position={[0, 0.45, 0.7]} />
        {[0, 1, 2, 3].map(k => (
          <Plate key={k} size={[1.2, 0.9 - k * 0.22, 0.32]} material={dark} position={[-1.95, (0.9 - k * 0.22) / 2, 0.3 + k * 0.32]} />
        ))}
        {[[1.25, 0.05], [1.25, 1.35], [-0.65, 1.35]].map(([x, z]) => <Plate key={`${x}${z}`} size={[0.07, 0.9, 0.07]} material={steel} position={[x, 1.35, z]} />)}
        <Plate size={[0.06, 0.06, 1.3]} material={steel} position={[1.25, 1.75, 0.7]} />
        <Plate size={[1.9, 0.06, 0.06]} material={steel} position={[0.3, 1.75, 1.35]} />
        <Plate size={[1.6, 0.06, 0.06]} material={steel} position={[-1.95, 1.35, 1.0]} rotation={[0, 0, 0]} />
        <group position={[0.2, 0.9, 0]}>
          <Plate size={[1.7, 2.2, 0.12]} material={grey} position={[0, 1.1, 0.04]} />
          <Plate size={[1.4, 2.0, 0.08]} material={dark} position={[0, 1.0, 0.1]} />
          <Plate size={[0.03, 2.0, 0.03]} material={grey} position={[0, 1.0, 0.15]} />
          <Strip size={[0.35, 0.08, 0.04]} material={glow(teamColor)} position={[0, 2.3, 0.12]} />
        </group>
      </group>
      {/* The marked panel and a screen facing the yard, and a downpipe. */}
      <group position={[CMD.x0, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <group position={[0.6, 0, 0]}>
          <Plate size={[1.8, 1.2, 0.06]} material={black} position={[0, 2.0, 0.03]} />
          <Plate size={[1.6, 1.0, 0.03]} material={screen} position={[0, 2.0, 0.06]} />
        </group>
      </group>
      <group position={[0, 0, CMD.z1]}>
        <Plate size={[1.4, 1.6, 0.06]} material={dark} position={[2.0, 4.9, 0.03]} />
        {/* Two rank chevrons. */}
        {[5.25, 4.75].flatMap(y => [-1, 1].map(s => (
          <Plate key={`${y}${s}`} size={[0.62, 0.16, 0.04]} material={paint} position={[2.0 + s * 0.26, y, 0.07]} rotation={[0, 0, s * -0.5]} />
        )))}
        <Turned profile={[[0.07, PAD.h], [0.07, CMD.top - 0.3]]} segments={6} material={grey} rotation={UP} position={[1.25, 0, 0.1]} />
      </group>
      {/* Floodlights at the front corners. */}
      {[[CMD.x0 + 0.2, CMD.z1], [CMD.x1 - 0.2, CMD.z1]].map(([x, z]) => (
        <group key={x} position={[x, CMD.top - 0.75, z + 0.15]}>
          <Plate size={[0.4, 0.28, 0.2]} material={dark} />
          <Strip size={[0.32, 0.2, 0.03]} material={lamp} position={[0, 0, 0.11]} />
        </group>
      ))}
      {/* Its roof: comms mast, satellite dish, AC boxes, exhaust stacks. */}
      <group position={[0, CMD.top + 0.08, 0]}>
        <group position={[2.4, 0, -1.3]}>
          <Turned profile={[[0.22, 0], [0.22, 0.3], [0.09, 0.4], [0.08, 3.6], [0.03, 4.6]]} segments={8} material={grey} rotation={UP} />
          {[[0.35, 1.8, 0.5], [-0.35, 2.6, -2.4]].map(([x, y, r]) => (
            <group key={y} position={[x, y, 0]} rotation={[0, r, 0]}>
              <Turned profile={[[0.001, -0.1], [0.38, 0], [0.4, 0.03]]} segments={10} material={light} />
            </group>
          ))}
          <Plate size={[0.18, 0.7, 0.12]} material={light} position={[0, 3.4, 0.12]} />
          <Strip size={[0.12, 0.12, 0.12]} material={glow(PALETTE.warning)} position={[0, 4.65, 0]} />
        </group>
        <group position={[4.3, 0, -0.4]}>
          <Plate size={[0.7, 0.5, 0.7]} material={grey} position={[0, 0.25, 0]} />
          <group ref={dish} position={[0, 0.8, 0]}>
            <Plate size={[0.25, 0.6, 0.25]} material={dark} />
            <group position={[0, 0.35, 0]} rotation={[-0.7, 0, 0]}>
              <Turned profile={[[0.001, -0.18], [0.75, 0], [0.8, 0.05]]} segments={12} material={light} />
              <Turned profile={[[0.03, 0], [0.02, 0.6]]} segments={4} material={steel} />
            </group>
          </group>
        </group>
        {[[4.6, -4.3], [3.2, -4.3]].map(([x, z]) => (
          <group key={x} position={[x, 0, z]}>
            <Plate size={[1.2, 0.9, 1.0]} material={grey} position={[0, 0.45, 0]} />
            <Plate size={[1.0, 0.6, 0.04]} material={dark} position={[0, 0.45, 0.52]} />
          </group>
        ))}
        {[1.7, 2.2].map(x => <Turned key={x} profile={[[0.16, 0], [0.16, 1.2], [0.19, 1.25], [0.19, 1.35]]} segments={8} material={dark} rotation={UP} position={[x, 0, -4.9]} />)}
        <Turned profile={[[0.1, -3.8], [0.1, -1.6]]} segments={8} material={steel} position={[3.2, 0.2, 0]} />
      </group>

      {/* --- The training yard --- */}
      {/* A fence along the front and the west side, a gap for the gate. */}
      <group position={[0, PAD.h, 0]}>
        {[
          { from: [YARD.x0 + 0.1, YARD.z1 - 0.1], to: [-3.5, YARD.z1 - 0.1] },
          { from: [-1.5, YARD.z1 - 0.1], to: [YARD.x1 + 0.3, YARD.z1 - 0.1] },
          { from: [YARD.x0 + 0.1, YARD.z0 + 0.3], to: [YARD.x0 + 0.1, YARD.z1 - 0.1] },
        ].map(({ from: [ax, az], to: [bx, bz] }, i) => {
          const len = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
          const posts = Math.max(2, Math.round(len / 1.6) + 1);
          return (
            <group key={i} position={[ax, 0, az]} rotation={[0, a, 0]}>
              <Plate size={[0.02, 1.3, len]} material={fence()} position={[0, 0.7, len / 2]} shadow={false} />
              <Plate size={[0.05, 0.05, len]} material={steel} position={[0, 1.38, len / 2]} />
              {Array.from({ length: posts }, (_, k) => k * len / (posts - 1)).map(z => (
                <Plate key={z} size={[0.07, 1.45, 0.07]} material={steel} position={[0, 0.72, z]} />
              ))}
            </group>
          );
        })}
        {/* The assembly circle, a row of targets, a pull-up frame. */}
        <Turned profile={[[1.6, 0], [1.75, 0]]} segments={32} material={light} rotation={UP} position={[-2.0, 0.02, 2.4]} />
        {[-5.1, -4.3, -3.5].map(x => (
          <group key={x} position={[x, 0, 4.6]}>
            <Plate size={[0.06, 0.5, 0.06]} material={steel} position={[0, 0.25, 0]} />
            <Plate size={[0.42, 0.6, 0.04]} material={dark} position={[0, 0.8, 0]} />
            <Plate size={[0.2, 0.2, 0.04]} material={dark} position={[0, 1.22, 0]} />
          </group>
        ))}
        <group position={[-0.1, 0, 3.6]}>
          {[-0.6, 0.6].map(x => <Plate key={x} size={[0.08, 1.8, 0.08]} material={steel} position={[x, 0.9, 0]} />)}
          <Plate size={[1.3, 0.06, 0.06]} material={steel} position={[0, 1.75, 0]} />
        </group>
      </group>

      {/* Supply crates stacked at the west end of the bays. */}
      {[[-5.3, 0.2, 0, 0.9], [-5.3, 1.0, 0, 0.9], [-4.4, 0.2, 0.1, 0.8], [-5.3, 0.2, 0.9, 0.8]].map(([x, z, y, w], i) => (
        <group key={i} position={[x, PAD.h + y + w * 0.4, z]}>
          <Plate size={[w, w * 0.8, w * 0.9]} material={i % 2 ? composite : grey} />
          <Plate size={[w + 0.02, 0.08, w * 0.9 + 0.02]} material={dark} />
        </group>
      ))}
    </group>
  );
};
