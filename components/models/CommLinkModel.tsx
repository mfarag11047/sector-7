// The Comm Link, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a signals tower on a raised platform. Four stilt legs on footings carry an
// angular platform, its underside faceted in to the legs, a railing round its deck, a stair down
// one side and a grated walkway reaching out from another. On the deck, the core block (a lit
// doorway, a team stripe), a canopy over the front corner, and an upper cab; up its back, a tall
// slanted fin. From the cab a lattice mast climbs high: sector antenna panels and small dishes up
// it, a whip with a blinking beacon at the top. Near its head, on one side, the big dish: a deep
// parabola on a yoke, its feed held at the focus by three struts, panning slowly. Small dark blades
// with red tip lights flank the core.
//
// Team colour: a stripe round the core, a lit panel on the cab, the beacon.
//
// Built facing +Z, about 12 by 12 across and 22 tall to the whip's tip, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Lattice } from '../kit/lattice';
import { Loft, Plate, Prism, Strip, Turned } from '../kit/shapes';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const DECK_Y = 2.6;
const PLAT = { under: 2.4, top: 3.6 };
const LEGS = 2.5;
// The core block, the cab above it, the mast above that.
const CORE = { x0: -1.8, x1: 1.0, z0: -1.8, z1: 1.2, top: 7.0 };
const CAB = { x0: -1.5, x1: 0.7, z0: -1.4, z1: 0.9, top: 9.2 };
const MAST = { x: -0.4, z: -0.25, w: 0.8, y0: 9.4, y1: 19.6 };
// The big dish: where its yoke meets the mast, and the dish's size.
const DISH = { y: 15.6, r: 2.3, depth: 0.8, focus: 1.9 };
const square = (h: number): [number, number][] => [[-h, -h], [h, -h], [h, h], [-h, h]];

// A box between two corners, from y0 to y1.
const Box: React.FC<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; material: THREE.Material }> = ({ x0, x1, z0, z1, y0, y1, material }) => (
  <Plate size={[x1 - x0, y1 - y0, z1 - z0]} material={material} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} />
);

// A strut from a to b, its long axis along the line between them.
const Strut: React.FC<{ a: THREE.Vector3; b: THREE.Vector3; t: number; material: THREE.Material }> = ({ a, b, t, material }) => {
  const { mid, quat, len } = useMemo(() => {
    const d = b.clone().sub(a);
    return { mid: a.clone().add(b).multiplyScalar(0.5), len: d.length(), quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()) };
  }, [a, b]);
  return <group position={mid} quaternion={quat}><Plate size={[t, len, t]} material={material} /></group>;
};

export const CommLinkModel: React.FC<{ teamColor: string }> = ({ teamColor }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe'), red = glow(PALETTE.warning);

  // The beacon: this link's own, so it can blink.
  const beacon = useMemo(() => own(glow(teamColor)) as THREE.MeshBasicMaterial, [teamColor]);
  useEffect(() => () => beacon.dispose(), [beacon]);
  const tint = useMemo(() => new THREE.Color(), []);
  const dish = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    beacon.color.copy(tint.set(teamColor)).multiplyScalar(Math.sin(t * 2.5) > 0.6 ? 1.3 : 0.15);
    if (dish.current) dish.current.rotation.y = 0.45 * Math.sin(t * 0.18);
  });

  // The dish's three struts, from its rim to the feed at its focus.
  const struts = useMemo(() => [0, 1, 2].map(k => {
    const a = k * Math.PI * 2 / 3 + Math.PI / 2;
    return new THREE.Vector3(Math.cos(a) * DISH.r * 0.9, Math.sin(a) * DISH.r * 0.9, DISH.depth * 0.85);
  }), []);
  const feed = useMemo(() => new THREE.Vector3(0, 0, DISH.focus), []);

  return (
    <group>
      {/* --- Stilt legs and the faceted platform --- */}
      {[-1, 1].flatMap(sx => [-1, 1].map(sz => (
        <group key={`${sx}${sz}`} position={[sx * LEGS, 0, sz * LEGS]}>
          <Plate size={[1.1, 0.7, 1.1]} material={grey} position={[0, 0.35, 0]} />
          <Strip size={[1.12, 0.12, 1.12]} material={glow(PALETTE.amber)} position={[0, 0.62, 0]} />
          <Plate size={[0.7, 1.6, 0.7]} material={dark} position={[0, 1.4, 0]} />
        </group>
      )))}
      <Loft bottom={square(PLAT.under)} top={square(PLAT.top)} height={0.7} material={grey} position={[0, DECK_Y - 0.9, 0]} />
      <Plate size={[PLAT.top * 2 + 0.1, 0.2, PLAT.top * 2 + 0.1]} material={dark} position={[0, DECK_Y - 0.1, 0]} />
      {/* A railing round the deck, open at the stair (east) and the walkway (west). */}
      {[
        [[-PLAT.top, -PLAT.top], [PLAT.top, -PLAT.top]],
        [[-PLAT.top, PLAT.top], [PLAT.top, PLAT.top]],
        [[PLAT.top, -PLAT.top], [PLAT.top, 0.6]],
        [[-PLAT.top, 1.6], [-PLAT.top, PLAT.top]],
        [[-PLAT.top, -PLAT.top], [-PLAT.top, -1.2]],
      ].map(([[ax, az], [bx, bz]], i) => {
        const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bx - ax, bz - az);
        const posts = Math.max(2, Math.round(len / 1.4) + 1);
        return (
          <group key={i} position={[ax, DECK_Y, az]} rotation={[0, ang, 0]}>
            <Plate size={[0.05, 0.05, len]} material={steel} position={[0, 0.85, len / 2]} />
            <Plate size={[0.04, 0.04, len]} material={steel} position={[0, 0.45, len / 2]} />
            {Array.from({ length: posts }, (_, k) => k * len / (posts - 1)).map(z => <Plate key={z} size={[0.06, 0.88, 0.06]} material={steel} position={[0, 0.44, z]} />)}
          </group>
        );
      })}
      {/* A stair down the east side. */}
      {Array.from({ length: 6 }, (_, k) => k).map(k => (
        <Plate key={k} size={[0.45, 0.12, 1.1]} material={grey} position={[PLAT.top + 0.25 + k * 0.45, DECK_Y - 0.1 - (k + 1) * 0.4, 1.7]} />
      ))}
      {[1.12, 2.28].map(z => (
        <group key={z} position={[PLAT.top + 1.35, DECK_Y / 2 - 0.15, z]} rotation={[0, 0, -Math.atan2(DECK_Y, 2.7)]}>
          <Plate size={[Math.hypot(DECK_Y, 2.7), 0.25, 0.08]} material={dark} />
          <Plate size={[Math.hypot(DECK_Y, 2.7), 0.04, 0.04]} material={steel} position={[0, 0.9, 0]} />
        </group>
      ))}
      {/* A grated walkway out from the west side. */}
      <group position={[-PLAT.top - 1.0, DECK_Y - 0.1, 0.2]}>
        <Plate size={[2.0, 0.08, 2.6]} material={black} />
        <Plate size={[2.1, 0.14, 0.1]} material={steel} position={[0, 0, 1.3]} />
        <Plate size={[2.1, 0.14, 0.1]} material={steel} position={[0, 0, -1.3]} />
        <Plate size={[0.1, 0.14, 2.6]} material={steel} position={[-1.0, 0, 0]} />
        {[-0.5, 0, 0.5].map(x => <Plate key={x} size={[0.04, 0.02, 2.5]} material={grey} position={[x, 0.05, 0]} />)}
        {[[-1.0, 1.3], [-1.0, -1.3]].map(([x, z]) => <Plate key={z} size={[0.05, 0.9, 0.05]} material={steel} position={[x, 0.45, z]} />)}
        <Plate size={[0.04, 0.04, 2.6]} material={steel} position={[-1.0, 0.9, 0]} />
      </group>

      {/* --- The core, the canopy, the cab --- */}
      <Box {...CORE} y0={DECK_Y} y1={CORE.top} material={light} />
      <Box x0={CORE.x0 - 0.05} x1={CORE.x1 + 0.05} z0={CORE.z0 - 0.05} z1={CORE.z1 + 0.05} y0={CORE.top - 0.7} y1={CORE.top - 0.55} material={paint} />
      <Box x0={CORE.x0 - 0.12} x1={CORE.x1 + 0.12} z0={CORE.z0 - 0.12} z1={CORE.z1 + 0.12} y0={CORE.top - 0.3} y1={CORE.top} material={grey} />
      <group position={[-0.4, DECK_Y, CORE.z1]}>
        <Plate size={[1.3, 2.2, 0.1]} material={grey} position={[0, 1.1, 0.03]} />
        <Plate size={[1.0, 2.0, 0.06]} material={lamp} position={[0, 1.0, 0.07]} />
        <Plate size={[1.6, 0.1, 0.8]} material={dark} position={[0, 2.35, 0.4]} />
      </group>
      {[-1.5, 0.7].map(x => <Plate key={x} size={[0.06, 2.4, 0.4]} material={dark} position={[x, DECK_Y + 2.6, CORE.z1 + 0.2]} />)}
      {/* The canopy over the front-east corner, on two posts. */}
      <group position={[0, DECK_Y, 0]}>
        {[[3.0, 2.9], [3.0, 0.4]].map(([x, z]) => <Plate key={z} size={[0.14, 2.6, 0.14]} material={grey} position={[x, 1.3, z]} />)}
        <Plate size={[2.4, 0.12, 3.0]} material={dark} position={[2.1, 2.75, 1.6]} rotation={[0, 0, -0.18]} />
        <Plate size={[2.4, 0.04, 3.0]} material={lamp} position={[2.1, 2.66, 1.6]} rotation={[0, 0, -0.18]} />
      </group>
      <Box {...CAB} y0={CORE.top} y1={CAB.top} material={grey} />
      <Box x0={CAB.x0} x1={CAB.x1} z0={CAB.z1} z1={CAB.z1 + 0.04} y0={CORE.top + 1.0} y1={CORE.top + 1.6} material={black} />
      <Box x0={CAB.x0 + 0.4} x1={CAB.x1 - 0.4} z0={CAB.z1 + 0.04} z1={CAB.z1 + 0.07} y0={CORE.top + 0.4} y1={CORE.top + 0.7} material={paint} />
      <Loft bottom={[[CAB.x0 - 0.2, CAB.z0 - 0.2], [CAB.x1 + 0.2, CAB.z0 - 0.2], [CAB.x1 + 0.2, CAB.z1 + 0.5], [CAB.x0 - 0.2, CAB.z1 + 0.5]]}
        top={[[CAB.x0, CAB.z0], [CAB.x1, CAB.z0], [CAB.x1, CAB.z1], [CAB.x0, CAB.z1]]} height={0.3} material={dark} position={[0, CAB.top, 0]} />
      {/* The tall slanted fin up the back. */}
      <group position={[0.6, 0, 0]}>
        <Prism outline={[[-1.9, DECK_Y], [-0.4, DECK_Y], [-0.4, 11.5], [-1.0, 13.8], [-1.9, 12.4]]} depth={0.5} axis="x" material={grey} />
        <Prism outline={[[-0.42, 6.5], [-0.32, 6.5], [-0.32, 11.5], [-0.42, 11.5]]} depth={0.52} axis="x" material={lamp} />
      </group>
      {/* Small dark blades with red tips beside the core. */}
      {[[CORE.x0 - 0.1, -0.6, 1], [CORE.x1 + 0.1, 0.6, -1]].map(([x, z, s]) => (
        <group key={x} position={[x, CORE.top - 1.2, z]} rotation={[0, 0, s * 0.25]}>
          <Plate size={[0.12, 2.4, 0.6]} material={dark} position={[0, 1.2, 0]} />
          <Strip size={[0.14, 0.14, 0.14]} material={red} position={[0, 2.45, 0]} />
        </group>
      ))}

      {/* --- The mast --- */}
      <Lattice w={MAST.w} h={MAST.y1 - MAST.y0} position={[MAST.x, MAST.y0, MAST.z]} />
      <group position={[MAST.x, 0, MAST.z]}>
        {/* Sector antenna panels near the top, small dishes lower down, a whip and beacon. */}
        {[0, 1, 2].map(k => (
          <group key={k} rotation={[0, k * Math.PI * 2 / 3, 0]}>
            <Plate size={[0.3, 1.4, 0.12]} material={light} position={[0, MAST.y1 - 1.2, MAST.w / 2 + 0.2]} />
            <Plate size={[0.06, 0.06, 0.25]} material={steel} position={[0, MAST.y1 - 1.2, MAST.w / 2 + 0.06]} />
          </group>
        ))}
        {[[0.6, 12.4, 0.6], [-0.6, 13.6, -2.2]].map(([x, y, r]) => (
          <group key={y} position={[x, y, 0]} rotation={[0, r, 0]}>
            <Turned profile={[[0.001, -0.1], [0.38, 0], [0.41, 0.04]]} segments={10} material={light} />
          </group>
        ))}
        <Turned profile={[[0.08, MAST.y1], [0.05, MAST.y1 + 0.6], [0.03, MAST.y1 + 2.6]]} segments={6} material={grey} rotation={UP} />
        <Strip size={[0.2, 0.2, 0.2]} material={beacon} position={[0, MAST.y1 + 2.7, 0]} />
        <Strip size={[0.14, 0.14, 0.14]} material={red} position={[0, MAST.y1 + 0.1, MAST.w / 2]} />

        {/* --- The big three-pronged dish, on a yoke out from the mast's east face --- */}
        <group position={[MAST.w / 2, DISH.y, 0]}>
          <Plate size={[1.2, 0.35, 0.35]} material={dark} position={[0.6, 0, 0]} />
          <group ref={dish} position={[1.3, 0, 0]}>
            <Turned profile={[[0.25, -0.4], [0.25, 0.4]]} segments={8} material={grey} rotation={UP} position={[0, -0.4, 0]} />
            {/* Facing out east and up. */}
            <group position={[0.4, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <group rotation={[-0.55, 0, 0]}>
                <Turned profile={[[0.35, -0.5], [0.55, -0.15], [0.3, 0.02]]} segments={10} material={dark} />
                {/* The bowl: its back, and its concave face (the same curve traced the other way, so
                    it faces in). */}
                <Turned profile={[[0.001, 0], [DISH.r * 0.5, DISH.depth * 0.22], [DISH.r * 0.85, DISH.depth * 0.68], [DISH.r, DISH.depth], [DISH.r + 0.08, DISH.depth]]} segments={24} material={grey} />
                <Turned profile={[[DISH.r, DISH.depth + 0.01], [DISH.r * 0.85, DISH.depth * 0.68 + 0.02], [DISH.r * 0.5, DISH.depth * 0.22 + 0.03], [0.001, 0.03]]} segments={24} material={light} />
                <Turned profile={[[DISH.r + 0.08, DISH.depth - 0.04], [DISH.r + 0.08, DISH.depth + 0.04]]} segments={24} material={grey} />
                {struts.map((p, k) => <Strut key={k} a={p} b={feed} t={0.07} material={steel} />)}
                <Turned profile={[[0.14, DISH.focus - 0.2], [0.18, DISH.focus + 0.05], [0.12, DISH.focus + 0.12]]} segments={8} material={grey} />
                <Strip size={[0.12, 0.12, 0.06]} material={glow(teamColor)} position={[0, 0, DISH.focus + 0.14]} />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
