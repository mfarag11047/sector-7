// The Depot, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a gantry loading bay. A raised deck, deep enough to hold a supply pit, with
// four heavy corner pillars carrying rails along the two sides; a bridge spans the rails (hazard
// striped, a toothed rack on top) with a hoist trolley on it, cables down to its hook. In the deck,
// over the pit, a pair of floor doors; the pit below is lit. A control booth on a back corner,
// a winch drum on the front edge, and on the east side a roller conveyor running into a dispatch
// bay.
//
// While the Depot is at work (`active`), it runs its delivery cycle: the floor doors swing down,
// the hook drops and lifts a crate up out of the pit, the doors close under it, the bridge and
// trolley carry it over the conveyor and lower it, and it rolls away into the dispatch bay while
// the gantry goes back. When the work stops it finishes the cycle in hand and parks.
//
// Team colour: bands on the pillars, a panel on the booth, the trolley's beacon.
//
// Built facing +Z, about 11 by 11 across and 8 tall, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Strip, Turned } from '../kit/shapes';

// The deck: its half-size and the height of its top (the pit is sunk into it).
const DECK = { half: 5.4, top: 1.3 };
// The pit: its centre and half-size, its floor.
const PIT = { x: 0, z: -1.4, half: 1.3, floor: 0.08 };
// The frame: pillar spacing and rail height.
const FRAME = { at: 4.9, rail: 7.0 };
// The crate: half-width and height.
const CRATE = { half: 0.68, h: 1.1 };
// Where the crate is set down (on the conveyor), and where it rolls to (inside the dispatch bay).
const CONVEYOR = { z: 2.7, x0: 1.4, top: DECK.top + 0.42 };
const BAY = { x0: 3.7, x1: 5.6, z0: 1.8, z1: 3.6, h: 2.0 };
// How high the crate's floor hangs while it is carried, and where the trolley's cables start.
const HANG = 4.2;
const TROLLEY_Y = FRAME.rail + 0.2;
// The delivery cycle, seconds.
const CYCLE = 9;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// 0 before a, 1 after b, eased between.
const step = (a: number, b: number, u: number) => { const t = clamp01((u - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

// A box between two corners, from y0 to y1.
const Box: React.FC<{ x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; material: THREE.Material }> = ({ x0, x1, z0, z1, y0, y1, material }) => (
  <Plate size={[x1 - x0, y1 - y0, z1 - z0]} material={material} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]} />
);

// A supply crate: a dark box with a band in the team's colour, corner guards and a lid fitting.
const Crate: React.FC<{ band: THREE.Material }> = ({ band }) => {
  const grey = kitMaterial('structGrey'), dark = kitMaterial('structDark'), steel = kitMaterial('steel'), composite = kitMaterial('composite');
  return (
    <group>
      <Plate size={[CRATE.half * 2, CRATE.h, CRATE.half * 2]} material={composite} position={[0, CRATE.h / 2, 0]} />
      <Plate size={[CRATE.half * 2 + 0.04, 0.22, CRATE.half * 2 + 0.04]} material={band} position={[0, CRATE.h * 0.55, 0]} />
      <Plate size={[CRATE.half * 2 - 0.1, 0.05, CRATE.half * 2 - 0.1]} material={grey} position={[0, CRATE.h + 0.01, 0]} />
      {[-1, 1].flatMap(sx => [-1, 1].map(sz => (
        <Plate key={`${sx}${sz}`} size={[0.16, CRATE.h + 0.02, 0.16]} material={dark} position={[sx * (CRATE.half - 0.05), CRATE.h / 2, sz * (CRATE.half - 0.05)]} />
      )))}
      <Plate size={[0.3, 0.08, 0.3]} material={steel} position={[0, CRATE.h + 0.04, 0]} />
    </group>
  );
};

export const DepotModel: React.FC<{ teamColor: string; active: boolean }> = ({ teamColor, active }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber), lamp = glow('#dbeafe');

  // The pit's light and the trolley's beacon: this depot's own, so they can change.
  const pitGlow = useMemo(() => own(glow('#cfe9ff')) as THREE.MeshBasicMaterial, []);
  const beacon = useMemo(() => own(glow(PALETTE.amber)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => { pitGlow.dispose(); beacon.dispose(); }, [pitGlow, beacon]);
  const tint = useMemo(() => new THREE.Color(), []);

  const bridge = useRef<THREE.Group>(null);
  const trolley = useRef<THREE.Group>(null);
  const cables = useRef<THREE.Group>(null);
  const hook = useRef<THREE.Group>(null);
  const crate = useRef<THREE.Group>(null);
  const doors = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ u: 0, running: false }), []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05);
    // Start a cycle when work starts; finish the one in hand when it stops.
    if (active) state.running = true;
    if (state.running) {
      state.u += dt / CYCLE;
      if (state.u >= 1) { state.u = active ? state.u - 1 : 0; if (!active) state.running = false; }
    }
    const u = state.u;

    const open = step(0, 0.08, u) - step(0.3, 0.36, u);
    const rise = step(0.08, 0.3, u);
    const move = step(0.36, 0.56, u) - step(0.74, 0.95, u);
    const lower = step(0.56, 0.68, u);
    const release = step(0.68, 0.74, u);
    const slide = step(0.74, 0.92, u);

    const bz = lerp(PIT.z, CONVEYOR.z, move), tx = lerp(PIT.x, CONVEYOR.x0, move);
    if (bridge.current) bridge.current.position.z = bz;
    if (trolley.current) trolley.current.position.x = tx;
    doors.current.forEach((d, i) => { if (d) d.rotation.z = (i ? 1 : -1) * open * 1.5; });

    // The crate: in the pit, then on the hook, then on the conveyor rolling into the bay.
    const attached = u < 0.68;
    let crateY: number;
    if (attached) crateY = lerp(PIT.floor, HANG, rise) - lower * (HANG - CONVEYOR.top);
    else crateY = CONVEYOR.top;
    if (crate.current) {
      crate.current.position.set(attached ? tx : lerp(CONVEYOR.x0, (BAY.x0 + BAY.x1) / 2 + 0.1, slide), crateY, attached ? bz : CONVEYOR.z);
      crate.current.visible = slide < 1;
    }
    // The hook: down to the crate in the pit as the doors open, with it while it is carried, then up.
    const top = HANG + CRATE.h;
    let hookY: number;
    if (u < 0.08) hookY = lerp(top, PIT.floor + CRATE.h, step(0.03, 0.08, u));
    else if (attached) hookY = crateY + CRATE.h;
    else hookY = lerp(CONVEYOR.top + CRATE.h, top, release);
    if (hook.current) hook.current.position.set(tx, hookY, bz);
    if (cables.current) { cables.current.scale.y = Math.max(0.01, TROLLEY_Y - hookY); cables.current.position.set(tx, hookY, bz); }

    pitGlow.color.copy(tint.set('#cfe9ff')).multiplyScalar(0.25 + 0.75 * open);
    beacon.color.copy(tint.set(PALETTE.amber)).multiplyScalar(state.running && Math.sin(clock.elapsedTime * 7) > 0 ? 1.2 : 0.15);
  });

  const H = DECK.half, P = PIT;
  return (
    <group>
      {/* --- The deck, with the pit sunk into it --- */}
      <Box x0={-H} x1={H} z0={-H} z1={P.z - P.half} y0={0} y1={DECK.top} material={grey} />
      <Box x0={-H} x1={H} z0={P.z + P.half} z1={H} y0={0} y1={DECK.top} material={grey} />
      <Box x0={-H} x1={P.x - P.half} z0={P.z - P.half} z1={P.z + P.half} y0={0} y1={DECK.top} material={grey} />
      <Box x0={P.x + P.half} x1={H} z0={P.z - P.half} z1={P.z + P.half} y0={0} y1={DECK.top} material={grey} />
      <Box x0={-H - 0.1} x1={H + 0.1} z0={-H - 0.1} z1={H + 0.1} y0={0} y1={0.3} material={dark} />
      {/* The deck's top plates, a frame round the pit, hazard edging. */}
      {[[-H + 0.1, -0.1], [0.1, H - 0.1]].flatMap(([x0, x1]) => [[-H + 0.1, P.z - P.half - 0.3], [P.z + P.half + 0.3, H - 0.1]].map(([z0, z1]) => (
        <Box key={`${x0}${z0}`} x0={x0} x1={x1} z0={z0} z1={z1} y0={DECK.top} y1={DECK.top + 0.03} material={light} />
      )))}
      {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([sx, sz]) => (
        <Plate key={`${sx}${sz}`} size={[sx ? 0.2 : P.half * 2 + 0.4, 0.06, sz ? 0.2 : P.half * 2 + 0.4]} material={amber} position={[P.x + sx * (P.half + 0.1), DECK.top + 0.03, P.z + sz * (P.half + 0.1)]} />
      ))}
      {/* The pit: dark walls, a lit floor and light strips down its sides. */}
      <Plate size={[P.half * 2, 0.06, P.half * 2]} material={pitGlow} position={[P.x, P.floor - 0.03, P.z]} />
      {[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([sx, sz]) => (
        <group key={`${sx}${sz}`} position={[P.x + sx * (P.half - 0.03), DECK.top / 2, P.z + sz * (P.half - 0.03)]}>
          <Plate size={[sx ? 0.06 : P.half * 2, DECK.top, sz ? 0.06 : P.half * 2]} material={black} />
          <Plate size={[sx ? 0.07 : 0.1, DECK.top - 0.3, sz ? 0.07 : 0.1]} material={pitGlow} position={[sz ? -P.half * 0.6 : 0, 0, sx ? -P.half * 0.6 : 0]} />
          <Plate size={[sx ? 0.07 : 0.1, DECK.top - 0.3, sz ? 0.07 : 0.1]} material={pitGlow} position={[sz ? P.half * 0.6 : 0, 0, sx ? P.half * 0.6 : 0]} />
        </group>
      ))}
      {/* The floor doors, hinged at the pit's sides, swinging down into it. */}
      {[-1, 1].map((s, i) => (
        <group key={s} ref={g => { doors.current[i] = g; }} position={[P.x + s * P.half, DECK.top - 0.06, P.z]}>
          <Plate size={[P.half - 0.02, 0.1, P.half * 2 - 0.04]} material={dark} position={[-s * (P.half / 2), 0, 0]} />
          {[-0.5, 0, 0.5].map(z => <Plate key={z} size={[P.half - 0.2, 0.03, 0.08]} material={grey} position={[-s * (P.half / 2), 0.06, z * P.half * 1.4]} />)}
        </group>
      ))}

      {/* --- The frame: four pillars, two side rails --- */}
      {[-1, 1].flatMap(sx => [-1, 1].map(sz => (
        <group key={`${sx}${sz}`} position={[sx * FRAME.at, DECK.top, sz * FRAME.at]}>
          <Plate size={[0.9, FRAME.rail - DECK.top, 0.9]} material={light} position={[0, (FRAME.rail - DECK.top) / 2, 0]} />
          <Plate size={[1.05, 0.5, 1.05]} material={dark} position={[0, 0.25, 0]} />
          <Plate size={[0.92, 0.18, 0.92]} material={paint} position={[0, 2.2, 0]} />
          <Plate size={[0.3, FRAME.rail - DECK.top - 1.4, 0.06]} material={dark} position={[-sx * 0.2, (FRAME.rail - DECK.top) / 2, sz * 0.46]} />
          {/* Angled feet at the corners. */}
          <Plate size={[0.4, 1.4, 0.4]} material={dark} position={[sx * 0.55, -0.6, sz * 0.55]} rotation={[sz * 0.35, 0, -sx * 0.35]} />
        </group>
      )))}
      {[-1, 1].map(sx => (
        <group key={sx} position={[sx * FRAME.at, FRAME.rail, 0]}>
          <Plate size={[1.0, 0.6, FRAME.at * 2 + 1.0]} material={grey} position={[0, 0.3, 0]} />
          <Plate size={[0.3, 0.12, FRAME.at * 2 + 0.8]} material={steel} position={[0, 0.66, 0]} />
        </group>
      ))}

      {/* --- The bridge and trolley --- */}
      <group ref={bridge} position={[0, FRAME.rail + 0.7, PIT.z]}>
        {[-1, 1].map(sx => <Plate key={sx} size={[1.2, 0.7, 1.4]} material={light} position={[sx * FRAME.at, 0.1, 0]} />)}
        <Plate size={[FRAME.at * 2 - 1.0, 0.6, 0.8]} material={dark} position={[0, 0, 0]} />
        {/* Hazard striping down its face, a toothed rack along its top. */}
        {Array.from({ length: 12 }, (_, k) => -3.85 + k * 0.7).map((x, k) => (
          <Plate key={x} size={[0.34, 0.3, 0.04]} material={k % 2 ? dark : amber} position={[x, 0, 0.42]} rotation={[0, 0, 0.6]} />
        ))}
        {Array.from({ length: 16 }, (_, k) => -3.75 + k * 0.5).map(x => <Plate key={x} size={[0.16, 0.14, 0.5]} material={steel} position={[x, 0.37, 0]} />)}
        <Strip size={[FRAME.at * 2 - 1.4, 0.05, 0.12]} material={lamp} position={[0, -0.32, 0.2]} />
        <group ref={trolley} position={[PIT.x, 0, 0]}>
          <Plate size={[1.3, 0.9, 1.3]} material={light} position={[0, -0.05, 0]} />
          <Plate size={[1.0, 0.25, 1.4]} material={grey} position={[0, 0.45, 0]} />
          <Turned profile={[[0.3, -0.5], [0.3, 0.5]]} segments={10} material={steel} rotation={[0, Math.PI / 2, 0]} position={[0, 0.0, 0.7]} />
          <Strip size={[0.18, 0.18, 0.18]} material={beacon} position={[0, 0.65, 0]} />
        </group>
      </group>
      {/* The cables and hook hang from the trolley; they follow it each frame. */}
      <group ref={cables} position={[PIT.x, HANG + CRATE.h, PIT.z]}>
        {[[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map(([x, z]) => <Plate key={`${x}${z}`} size={[0.04, 1, 0.04]} material={black} position={[x, 0.5, z]} />)}
      </group>
      <group ref={hook} position={[PIT.x, HANG + CRATE.h, PIT.z]}>
        <Plate size={[1.0, 0.18, 1.0]} material={amber} position={[0, 0.12, 0]} />
      </group>
      <group ref={crate} position={[PIT.x, PIT.floor, PIT.z]}><Crate band={paint} /></group>

      {/* --- The control booth on the back-east corner, its windows on the bay --- */}
      <group position={[3.6, DECK.top, -3.7]} rotation={[0, Math.PI / 2, 0]}>
        <Plate size={[2.0, 2.4, 2.0]} material={light} position={[0, 1.2, 0]} />
        <Plate size={[2.2, 0.25, 2.2]} material={dark} position={[0, 2.5, 0]} />
        <Plate size={[1.6, 0.8, 0.06]} material={black} position={[0, 1.7, 1.02]} />
        <Plate size={[0.06, 0.8, 1.3]} material={black} position={[1.02, 1.7, 0]} />
        <Plate size={[0.7, 1.3, 0.06]} material={dark} position={[0.45, 0.65, 1.02]} />
        <Plate size={[0.4, 0.5, 0.04]} material={paint} position={[-0.5, 0.75, 1.03]} />
        <Strip size={[0.1, 0.25, 0.04]} material={glow(PALETTE.warning)} position={[-0.85, 1.0, 1.04]} />
        <Strip size={[0.3, 0.06, 0.04]} material={lamp} position={[0.45, 1.4, 1.04]} />
      </group>
      {/* A winch drum on the front edge. */}
      <group position={[0, DECK.top, 4.2]}>
        <Plate size={[2.2, 0.3, 1.0]} material={dark} position={[0, 0.15, 0]} />
        <Turned profile={[[0.42, -0.8], [0.42, 0.8]]} segments={12} material={grey} rotation={[0, Math.PI / 2, 0]} position={[0, 0.72, 0]} />
        {[-0.95, 0.95].map(x => <Plate key={x} size={[0.18, 0.9, 0.8]} material={dark} position={[x, 0.6, 0]} />)}
      </group>

      {/* --- The conveyor and the dispatch bay on the east side --- */}
      <group position={[0, DECK.top, CONVEYOR.z]}>
        <Plate size={[BAY.x0 - CONVEYOR.x0 + 1.2, 0.3, 1.6]} material={dark} position={[(CONVEYOR.x0 + BAY.x0) / 2, 0.15, 0]} />
        {Array.from({ length: 8 }, (_, k) => CONVEYOR.x0 - 0.5 + k * 0.42).map(x => (
          <Turned key={x} profile={[[0.09, -0.75], [0.09, 0.75]]} segments={8} material={steel} position={[x, 0.33, 0]} />
        ))}
      </group>
      <Box x0={BAY.x0} x1={BAY.x1} z0={BAY.z0} z1={BAY.z0 + 0.15} y0={DECK.top} y1={DECK.top + BAY.h} material={light} />
      <Box x0={BAY.x0} x1={BAY.x1} z0={BAY.z1 - 0.15} z1={BAY.z1} y0={DECK.top} y1={DECK.top + BAY.h} material={light} />
      <Box x0={BAY.x1 - 0.15} x1={BAY.x1} z0={BAY.z0} z1={BAY.z1} y0={DECK.top} y1={DECK.top + BAY.h} material={light} />
      <Box x0={BAY.x0 - 0.1} x1={BAY.x1 + 0.1} z0={BAY.z0 - 0.1} z1={BAY.z1 + 0.1} y0={DECK.top + BAY.h} y1={DECK.top + BAY.h + 0.25} material={dark} />
      <Box x0={BAY.x0 - 0.06} x1={BAY.x0} z0={BAY.z0} z1={BAY.z1} y0={DECK.top + BAY.h - 0.4} y1={DECK.top + BAY.h} material={dark} />
      <Strip size={[0.04, 0.12, BAY.z1 - BAY.z0 - 0.4]} material={amber} position={[BAY.x0 - 0.08, DECK.top + BAY.h - 0.2, (BAY.z0 + BAY.z1) / 2]} />
      <Box x0={BAY.x0 + 0.15} x1={BAY.x1 - 0.15} z0={BAY.z0 + 0.15} z1={BAY.z1 - 0.15} y0={DECK.top} y1={DECK.top + 0.02} material={black} />
    </group>
  );
};
