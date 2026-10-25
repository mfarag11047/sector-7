// The Ballista's missile, built from the unit kit (components/kit): one model wherever it shows,
// in the Field Fabricator's cages, in the Ballista's launch tube and in flight.
//
// Simple but military: a long dark body; a forked tail of four prongs splaying out round a nozzle;
// four small fins ahead of them; and at the front, behind a faceted dark nose, a collar ring that
// glows in the colour of its warhead (EMP, HE or WP). A missile with no warhead yet (`warhead`
// null) is a bare body: no nose, its collar an open, unlit ring (`ring` lights it, as while a
// warhead is being fitted).
//
// Built along +Z: its tail at 0, its nose's tip at `length`. The collar starts at COLLAR of the
// length, the nose at NOSE.

import React from 'react';
import * as THREE from 'three';
import { glow, kitMaterial } from '../kit/materials';
import { Plate, Turned } from '../kit/shapes';

export type Warhead = 'emp' | 'he' | 'wp';
// Warhead colours, by type.
export const WARHEAD_COLORS: Record<Warhead, string> = { emp: '#38bdf8', he: '#ef4444', wp: '#f8fafc' };
export const MISSILE_COLLAR = 0.8, MISSILE_NOSE = 0.87;

export const Missile: React.FC<{
  warhead: Warhead | null;
  radius: number;
  length: number;
  // Lights the collar ring with this instead of the warhead's colour (or of a bare body, not at all).
  ring?: THREE.Material;
  position?: [number, number, number];
  rotation?: [number, number, number];
}> = ({ warhead, radius: r, length: L, ring, position, rotation }) => {
  const dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black'), composite = kitMaterial('composite');
  const band = ring ?? (warhead ? glow(WARHEAD_COLORS[warhead]) : black);
  const collar = MISSILE_COLLAR * L, nose = MISSILE_NOSE * L;
  return (
    <group position={position} rotation={rotation}>
      {/* The body, drawn in at the tail; the nozzle. */}
      <Turned profile={[[r * 0.5, 0], [r * 0.62, 0.1 * L], [r, 0.24 * L], [r, collar]]} segments={10} material={composite} />
      <Turned profile={[[r * 0.42, -0.02 * L], [r * 0.5, 0.01 * L], [0.001, 0.01 * L]]} segments={8} material={black} />
      {/* The forked tail: four prongs splaying out to the rear. */}
      {[0, 1, 2, 3].map(k => (
        <group key={k} rotation={[0, 0, k * Math.PI / 2 + Math.PI / 4]}>
          <Plate size={[r * 0.32, r * 0.22, 0.26 * L]} material={dark} position={[r * 0.82, 0, 0.1 * L]} rotation={[0, -0.28, 0]} />
        </group>
      ))}
      {/* Four small fins ahead of the tail. */}
      {[0, 1, 2, 3].map(k => (
        <group key={k} rotation={[0, 0, k * Math.PI / 2]}>
          <Plate size={[r * 0.7, r * 0.08, 0.12 * L]} material={dark} position={[r * 1.25, 0, 0.32 * L]} rotation={[0, 0.35, 0]} />
        </group>
      ))}
      {/* The collar: metal rims round the ring that shows the warhead's colour. */}
      <Turned profile={[[r * 1.06, collar], [r * 1.06, collar + 0.012 * L]]} segments={12} material={steel} />
      <Turned profile={[[r * 1.02, collar + 0.012 * L], [r * 1.02, nose - 0.012 * L]]} segments={12} material={band} />
      <Turned profile={[[r * 1.06, nose - 0.012 * L], [r * 1.06, nose]]} segments={12} material={steel} />
      {/* The nose: faceted and dark; or, on a bare body, an open end. */}
      {warhead
        ? <Turned profile={[[r, nose], [r * 0.96, nose + 0.035 * L], [r * 0.82, nose + 0.075 * L], [r * 0.5, nose + 0.11 * L], [0.001, 0.999 * L]]} segments={7} material={black} />
        : <Turned profile={[[r * 0.85, nose], [0.001, nose]]} segments={10} material={black} />}
    </group>
  );
};
