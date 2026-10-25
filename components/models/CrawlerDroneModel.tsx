// The Crawler Drone, built from the unit kit (components/kit).
//
// Simple but military: a micro version of the Swarm Host that fires it out (SwarmHostModel), on
// four legs and with a rounder body. A faceted, rounded armoured shell over a dark skirt band,
// with a team stripe and a small hatch on top, a stub antenna, and on the front a sensor block of
// amber lenses. Four short, thick legs at the corners, each shin faced with a segmented armour
// slab, ending in broad feet.
//
// It moves: it scuttles on its legs, diagonal pairs stepping together, its shell bobbing.
//
// The legs are posed each frame by a two-link solve from hip to foot (kit/legs.ts).
//
// Built facing +Z, about 0.9 long and 1.1 across its feet in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { poseLeg } from '../kit/legs';
import { ContactShadow, Plate, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 1.4;
// The shell, a dome turned about the vertical: [radius, up] from the skirt to the crown.
const SHELL: [number, number][] = [[0.3, -0.12], [0.38, -0.04], [0.38, 0.04], [0.33, 0.13], [0.22, 0.21], [0.001, 0.25]];
// The legs: hip corners, their outward heading, and the diagonal pairs' step phase.
const LEGS = [[1, 1, 0], [-1, 1, Math.PI], [1, -1, Math.PI], [-1, -1, 0]].map(([sx, sz, phase]) => ({
  hip: [sx * 0.3, sz * 0.26] as [number, number], yaw: Math.atan2(-sz * 0.8, sx), phase,
}));
const THIGH = 0.24, SHIN = 0.3;
const HULL_Y = 0.36, REACH = 0.28;

export const CrawlerDroneModel: React.FC<{ teamColor: string; moving?: boolean }> = ({ teamColor, moving }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber);

  const body = useRef<THREE.Group>(null);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const thighs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const feet = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ walk: 0, stride: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.walk += ((moving ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 8));
    state.stride += dt * 10 * state.walk;
    const bob = Math.abs(Math.sin(state.stride)) * 0.025 * state.walk;
    if (body.current) body.current.position.y = HULL_Y + bob;
    LEGS.forEach(({ hip, phase }, i) => {
      const h = hips.current[i], th = thighs.current[i], kn = knees.current[i], ft = feet.current[i];
      if (!h || !th || !kn || !ft) return;
      const hipY = HULL_Y + bob - 0.02;
      h.position.set(hip[0], hipY, hip[1]);
      const s = state.stride + phase;
      const fx = REACH + Math.cos(s) * 0.04 * state.walk;
      const fy = -hipY + Math.max(0, Math.sin(s)) * 0.08 * state.walk;
      ft.position.set(fx, fy, 0);
      poseLeg(THIGH, SHIN, fx, fy, th, kn);
    });
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[1.1, 1.1]} />
      {/* The shell: a rounded dome over a skirt band, a team stripe, a small hatch, an antenna. */}
      <group ref={body} position={[0, HULL_Y, 0]}>
        <group scale={[1, 1, 1.15]}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Turned profile={SHELL} segments={10} material={armour} />
            <Turned profile={[[0.24, -0.18], [0.31, -0.12], [0.001, -0.12]]} segments={10} material={dark} />
            <Turned profile={[[0.39, -0.05], [0.39, 0.0]]} segments={10} material={composite} />
          </group>
        </group>
        <Plate size={[0.06, 0.012, 0.3]} material={paint} position={[0, 0.244, -0.02]} rotation={[0.08, 0, 0]} />
        <Plate size={[0.14, 0.02, 0.12]} material={dark} position={[0.08, 0.235, -0.12]} />
        <Turned profile={[[0.008, 0], [0.005, 0.2]]} segments={4} material={black} position={[-0.12, 0.2, -0.2]} rotation={[-Math.PI / 2 + 0.2, 0, 0]} />
        {/* The sensor block on the front: amber lenses. */}
        <group position={[0, 0.06, 0.4]}>
          <Plate size={[0.18, 0.11, 0.08]} material={dark} />
          {[[-0.04, 0.025], [0.04, 0.025], [-0.04, -0.025], [0.04, -0.025]].map(([x, y]) => (
            <Strip key={`${x}${y}`} size={[0.03, 0.03, 0.01]} material={amber} position={[x, y, 0.042]} />
          ))}
        </group>
        {LEGS.map(({ hip }, i) => <Plate key={i} size={[0.12, 0.13, 0.14]} material={composite} position={[hip[0] * 0.95, -0.02, hip[1]]} />)}
      </group>

      {/* The legs, posed every frame: thigh, knee, shin with its armour slab, foot. */}
      {LEGS.map(({ yaw }, i) => (
        <group key={i} ref={g => { hips.current[i] = g; }} rotation={[0, yaw, 0]}>
          <group ref={g => { thighs.current[i] = g; }}>
            <Plate size={[THIGH, 0.1, 0.11]} material={dark} position={[THIGH / 2, 0, 0]} />
            <Plate size={[THIGH * 0.8, 0.03, 0.13]} material={armour} position={[THIGH * 0.5, 0.06, 0]} />
          </group>
          <group ref={g => { knees.current[i] = g; }}>
            <Wheel radius={0.06} width={0.13} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
            <Plate size={[SHIN, 0.08, 0.09]} material={dark} position={[SHIN / 2, 0, 0]} />
            <Plate size={[SHIN * 0.8, 0.035, 0.2]} material={armour} position={[SHIN * 0.46, 0.055, 0]} />
            {[0.32, 0.6].map(f => <Plate key={f} size={[0.008, 0.04, 0.2]} material={dark} position={[SHIN * f, 0.055, 0]} />)}
          </group>
          <group ref={g => { feet.current[i] = g; }}>
            <Plate size={[0.16, 0.04, 0.18]} material={composite} position={[0.02, 0.02, 0]} />
          </group>
        </group>
      ))}
    </group>
  );
};
