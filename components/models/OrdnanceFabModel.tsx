// The Ordnance Fab, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a munitions plant with a silo. On a chamfered base, a round dais of
// panelled tiles at the front, a lit pool sunk in its middle. Behind it the fabrication tower
// rises tall: a dark plinth, a pale body tapering to its crown, a pipe and a dark service column
// running up its face, a dome, dishes and a mast at the top. Out from the tower's face, over the
// pool, the silo ring: a drum with a band of lit windows on a funnel and a feed pipe down into the
// pool; and standing up out of its collar, held in three clamps, a missile (MissileModel.tsx). To
// the east a lower block with a dome and an antenna, a duct across to the drum; to the west two
// spherical tanks on legs, piped to the dais.
//
// While it fabricates (`fabricating`, the warhead being made), the missile on the silo carries that
// warhead and its collar ring pulses in the warhead's colour, as do the drum's windows; idle, the
// missile is a bare body awaiting one and the windows are dim.
//
// Team colour: the drum's band, a stripe round the tower, the beacon.
//
// Built facing +Z, about 12 by 12 across and 16 tall to the mast's tip, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Strip, Turned } from '../kit/shapes';
import { Missile, Warhead, WARHEAD_COLORS } from './MissileModel';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const BASE_H = 0.4;
// The dais at the front, and the pool sunk in its middle.
const DAIS = { z: 1.4, r: 4.6, h: 0.7 };
const POOL = { r: 1.5 };
// The tower: centre, half-sizes, the plinth's top, where the body starts to taper, its top.
const TOWER = { x: -1.2, z: -2.9, hx: 2.2, hz: 1.7, plinth: 3.6, taper: 11.0, top: 13.4 };
// The silo ring: centre, radius, its floor and height.
const DRUM = { x: 0.1, z: 0.3, r: 2.0, y: 5.8, h: 1.3 };
const MISSILE = { r: 0.36, length: 4.4 };
// A sphere of radius r turned about +Z, from pole to pole.
const sphere = (r: number, n = 8): [number, number][] => Array.from({ length: n + 1 }, (_, k) => {
  const a = -Math.PI / 2 + (k * Math.PI) / n;
  return [Math.max(0.001, Math.cos(a) * r), Math.sin(a) * r];
});
// A hexagon-ish base outline: a square of half-size h with its corners cut by c.
const chamfered = (h: number, c: number): [number, number][] =>
  [[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]];

export const OrdnanceFabModel: React.FC<{ teamColor: string; fabricating?: Warhead | null }> = ({ teamColor, fabricating = null }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe');

  // The pulse in the warhead's colour (the missile's collar, the drum's windows), the pool's light
  // and the beacon: this fab's own.
  const pulse = useMemo(() => own(glow(PALETTE.amber)) as THREE.MeshBasicMaterial, []);
  const pool = useMemo(() => own(glow('#5eead4')) as THREE.MeshBasicMaterial, []);
  const beacon = useMemo(() => own(glow(teamColor)) as THREE.MeshBasicMaterial, [teamColor]);
  useEffect(() => () => { pulse.dispose(); pool.dispose(); }, [pulse, pool]);
  useEffect(() => () => beacon.dispose(), [beacon]);
  const tint = useMemo(() => new THREE.Color(), []);
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const level = fabricating ? 0.6 + 0.4 * Math.sin(t * 5) : 0.15;
    pulse.color.copy(tint.set(fabricating ? WARHEAD_COLORS[fabricating] : PALETTE.amber)).multiplyScalar(level);
    pool.color.copy(tint.set('#5eead4')).multiplyScalar(0.45 + 0.1 * Math.sin(t * 1.3));
    beacon.color.copy(tint.set(teamColor)).multiplyScalar(Math.sin(t * 2.5) > 0.5 ? 1.2 : 0.15);
    if (ring.current && fabricating) ring.current.rotation.y += Math.min(delta, 0.05) * 0.6;
  });

  const tx = TOWER.x, tz = TOWER.z;
  return (
    <group>
      {/* --- The base and the dais --- */}
      <Loft bottom={chamfered(6.3, 2.0)} top={chamfered(6.1, 1.9)} height={BASE_H} material={grey} />
      <Turned profile={[[DAIS.r + 0.3, BASE_H], [DAIS.r, BASE_H + DAIS.h], [POOL.r + 0.3, BASE_H + DAIS.h], [POOL.r, BASE_H + DAIS.h - 0.25], [0.001, BASE_H + DAIS.h - 0.25]]}
        segments={20} material={light} rotation={UP} position={[0, 0, DAIS.z]} />
      {/* Its tiles: radial seams and a ring seam. */}
      {Array.from({ length: 10 }, (_, k) => (k / 10) * Math.PI * 2).map(a => (
        <group key={a} position={[0, BASE_H + DAIS.h + 0.01, DAIS.z]} rotation={[0, a, 0]}>
          <Plate size={[0.06, 0.02, DAIS.r - POOL.r - 0.4]} material={grey} position={[0, 0, (DAIS.r + POOL.r) / 2]} />
        </group>
      ))}
      <Turned profile={[[3.1, 0], [3.2, 0]]} segments={20} material={grey} rotation={UP} position={[0, BASE_H + DAIS.h + 0.015, DAIS.z]} />
      <Turned profile={[[DAIS.r + 0.32, 0], [DAIS.r + 0.32, 0.2]]} segments={20} material={dark} rotation={UP} position={[0, BASE_H, DAIS.z]} />
      {/* The pool. */}
      <Turned profile={[[POOL.r, 0], [0.001, 0]]} segments={16} material={pool} rotation={UP} position={[0, BASE_H + DAIS.h - 0.2, DAIS.z]} />

      {/* --- The tower --- */}
      <Plate size={[TOWER.hx * 2 + 0.4, TOWER.plinth - BASE_H, TOWER.hz * 2 + 0.4]} material={dark} position={[tx, (BASE_H + TOWER.plinth) / 2, tz]} />
      <Plate size={[TOWER.hx * 2, TOWER.taper - TOWER.plinth, TOWER.hz * 2]} material={light} position={[tx, (TOWER.plinth + TOWER.taper) / 2, tz]} />
      <Loft bottom={chamfered(1, 0).map(([x, z]) => [x * TOWER.hx, z * TOWER.hz] as [number, number])}
        top={chamfered(1, 0).map(([x, z]) => [x * TOWER.hx * 0.6, z * TOWER.hz * 0.75] as [number, number])}
        height={TOWER.top - TOWER.taper} material={light} position={[tx, TOWER.taper, tz]} />
      <Plate size={[TOWER.hx * 2 + 0.1, 0.18, TOWER.hz * 2 + 0.1]} material={paint} position={[tx, 9.6, tz]} />
      <Plate size={[TOWER.hx * 2 + 0.14, 0.3, TOWER.hz * 2 + 0.14]} material={grey} position={[tx, TOWER.plinth + 0.15, tz]} />
      {/* Panel seams and rivet rows down the tower's west side; hatches and a lit window. */}
      {[5.2, 7.4].map(y => <Plate key={y} size={[0.04, 0.05, TOWER.hz * 2 - 0.4]} material={grey} position={[tx - TOWER.hx - 0.01, y, tz]} />)}
      {[4.6, 6.0, 7.8].map(y => <Plate key={y} size={[0.06, 0.5, 0.5]} material={grey} position={[tx - TOWER.hx - 0.02, y, tz + 0.9]} />)}
      <Plate size={[0.9, 0.5, 0.05]} material={dark} position={[tx - 1.1, 10.4, tz + TOWER.hz + 0.02]} />
      <Strip size={[0.6, 0.25, 0.03]} material={lamp} position={[tx - 1.1, 10.4, tz + TOWER.hz + 0.05]} />
      {/* A dark service column up the tower's face behind the silo, and a pipe beside it. */}
      <Plate size={[0.9, TOWER.taper + 0.6 - DRUM.y, 0.5]} material={grey} position={[tx + 1.1, (DRUM.y + TOWER.taper + 0.6) / 2, tz + TOWER.hz + 0.2]} />
      <Turned profile={[[0.2, TOWER.plinth], [0.2, TOWER.top - 0.6]]} segments={8} material={dark} rotation={UP} position={[tx - 0.6, 0, tz + TOWER.hz + 0.25]} />
      <Turned profile={[[0.2, 0], [0.2, 0.9]]} segments={8} material={dark} rotation={[0, 0, 0]} position={[tx - 0.6, TOWER.top - 0.6, tz + TOWER.hz + 0.25]} />
      {/* The crown: a dome, two small dishes, a mast and the beacon. */}
      <group position={[tx, TOWER.top, tz]}>
        <Turned profile={[[0.7, 0], [0.7, 0.3], [0.55, 0.65], [0.3, 0.85], [0.001, 0.9]]} segments={12} material={grey} rotation={UP} position={[-0.4, 0, 0]} />
        {[[0.9, 0.5, 0.6], [0.8, -0.5, -0.4]].map(([x, z, r]) => (
          <group key={z} position={[x, 0.6, z]} rotation={[0, r, 0]}>
            <Turned profile={[[0.001, -0.08], [0.32, 0], [0.34, 0.03]]} segments={10} material={light} />
          </group>
        ))}
        <Turned profile={[[0.08, 0], [0.05, 2.4]]} segments={6} material={steel} rotation={UP} position={[0.4, 0, 0]} />
        <Strip size={[0.18, 0.18, 0.18]} material={beacon} position={[0.4, 2.45, 0]} />
      </group>

      {/* --- The silo ring and its missile --- */}
      <group position={[DRUM.x, 0, DRUM.z]}>
        {/* A funnel under the drum, a feed pipe from it down into the pool. */}
        <Turned profile={[[0.45, DRUM.y - 2.0], [0.6, DRUM.y - 1.6], [DRUM.r - 0.2, DRUM.y]]} segments={12} material={grey} rotation={UP} />
        <Turned profile={[[0.25, BASE_H + DAIS.h - 0.2], [0.25, DRUM.y - 1.9]]} segments={8} material={dark} rotation={UP} position={[0.2, 0, 0.2]} />
        {/* The drum: its wall, a band of windows lit in the warhead's colour, a team band, a collar. */}
        <Turned profile={[[DRUM.r, DRUM.y], [DRUM.r, DRUM.y + DRUM.h], [DRUM.r - 0.3, DRUM.y + DRUM.h + 0.15], [0.9, DRUM.y + DRUM.h + 0.15]]} segments={14} material={light} rotation={UP} />
        <Turned profile={[[DRUM.r + 0.03, DRUM.y + 0.1], [DRUM.r + 0.03, DRUM.y + 0.3]]} segments={14} material={paint} rotation={UP} />
        <group ref={ring}>
          {Array.from({ length: 10 }, (_, k) => (k / 10) * Math.PI * 2).map(a => (
            <group key={a} rotation={[0, a, 0]}>
              <Plate size={[0.5, 0.45, 0.05]} material={black} position={[0, DRUM.y + 0.8, DRUM.r + 0.01]} />
              <Plate size={[0.4, 0.35, 0.03]} material={pulse} position={[0, DRUM.y + 0.8, DRUM.r + 0.03]} />
            </group>
          ))}
        </group>
        <Turned profile={[[0.9, DRUM.y + DRUM.h + 0.15], [0.9, DRUM.y + DRUM.h + 0.45], [0.55, DRUM.y + DRUM.h + 0.45]]} segments={12} material={dark} rotation={UP} />
        {/* Three clamps holding the missile upright. */}
        {[0, 1, 2].map(k => (
          <group key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]}>
            <Plate size={[0.18, 1.1, 0.4]} material={grey} position={[0, DRUM.y + DRUM.h + 0.95, MISSILE.r + 0.12]} />
            <Plate size={[0.22, 0.14, 0.5]} material={steel} position={[0, DRUM.y + DRUM.h + 1.4, MISSILE.r + 0.05]} />
          </group>
        ))}
        <Missile warhead={fabricating} radius={MISSILE.r} length={MISSILE.length} ring={fabricating ? pulse : undefined}
          position={[0, DRUM.y + DRUM.h + 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]} />
      </group>

      {/* --- The east block: a dome, an antenna, a duct across to the drum --- */}
      <group position={[3.9, BASE_H, -0.2]}>
        <Plate size={[2.8, 4.6, 3.4]} material={light} position={[0, 2.3, 0]} />
        <Plate size={[2.9, 1.2, 3.5]} material={dark} position={[0, 0.6, 0]} />
        <Plate size={[3.0, 0.3, 3.6]} material={grey} position={[0, 4.75, 0]} />
        <Plate size={[0.9, 1.6, 0.06]} material={dark} position={[0.5, 1.6, 1.72]} />
        <Strip size={[0.3, 0.06, 0.03]} material={lamp} position={[0.5, 2.5, 1.75]} />
        {[2.6, 3.4].map(y => <Plate key={y} size={[1.8, 0.05, 0.05]} material={grey} position={[0, y, 1.73]} />)}
        <Turned profile={sphere(1.05)} segments={12} material={light} rotation={UP} position={[-0.2, 5.6, 0.2]} />
        <Turned profile={[[1.07, -0.08], [1.07, 0.08]]} segments={12} material={grey} rotation={UP} position={[-0.2, 5.6, 0.2]} />
        <Turned profile={[[0.06, 0], [0.04, 3.2]]} segments={6} material={grey} rotation={UP} position={[0.8, 4.9, -1.0]} />
        <Strip size={[0.14, 0.14, 0.14]} material={glow(PALETTE.warning)} position={[0.8, 8.15, -1.0]} />
      </group>
      <Plate size={[1.4, 0.55, 0.6]} material={grey} position={[DRUM.x + DRUM.r + 0.6, DRUM.y + 0.3, DRUM.z - 0.2]} />

      {/* --- The west tanks on legs, piped to the dais --- */}
      {[[-4.5, 1.6], [-3.6, 4.0]].map(([x, z]) => (
        <group key={z} position={[x, BASE_H, z]}>
          {[0, 1, 2, 3].map(k => (
            <group key={k} rotation={[0, (k * Math.PI) / 2 + Math.PI / 4, 0]}>
              <Plate size={[0.18, 1.0, 0.18]} material={dark} position={[0, 0.5, 0.75]} rotation={[0.25, 0, 0]} />
            </group>
          ))}
          <Turned profile={sphere(1.15)} segments={12} material={light} rotation={UP} position={[0, 1.95, 0]} />
          <Turned profile={[[1.17, -0.06], [1.17, 0.06]]} segments={12} material={paint} rotation={UP} position={[0, 1.95, 0]} />
          <Turned profile={[[0.12, 0], [0.12, 0.4], [0.2, 0.4], [0.2, 0.5]]} segments={8} material={dark} rotation={UP} position={[0, 3.05, 0]} />
          {/* A pipe from the tank round to the dais. */}
          <Turned profile={[[0.18, 0], [0.18, 1.6]]} segments={8} material={grey} rotation={[0, Math.PI / 2, 0]} position={[0.8, 1.3, 0]} />
        </group>
      ))}
      {/* A ladder up the dais' side. */}
      <group position={[2.7, BASE_H, DAIS.z + 3.3]} rotation={[0, 0.6, 0]}>
        {[-0.25, 0.25].map(x => <Plate key={x} size={[0.06, 1.4, 0.06]} material={steel} position={[x, 0.6, 0]} />)}
        {[0.25, 0.55, 0.85].map(y => <Plate key={y} size={[0.5, 0.05, 0.05]} material={steel} position={[0, y, 0]} />)}
      </group>
    </group>
  );
};
