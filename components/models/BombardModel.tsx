// The Bombardment Drone, built from the unit kit (components/kit).
//
// Simple but military: an unmanned stealth flying wing. A cranked-kite planform, swept back from a
// pointed nose to long wingtips, with a sawtooth trailing edge; a low hump along the middle with a
// dorsal intake behind the nose and two flat exhaust slots at the back; raised panels and edge
// strips on the wings, team markings near the tips, red and green wingtip lights. Under the
// middle, a bomb bay: its doors swing open while it bombards (`bayOpen`), showing the munitions
// still in its rack (`munitions`, out of five).
//
// It moves: its bay doors swing, and it bobs and banks gently as it holds over a target.
//
// Built facing +Z, about 2.3 long and 3.5 across in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 3.2;
// The wing, top view [right, forward]: the nose, the leading edge to the right wingtip, the
// sawtooth trailing edge back to the middle, and the same on the left.
const RIGHT: [number, number][] = [[0.0, 1.15], [0.5, 0.55], [1.75, -0.4], [1.72, -0.66], [1.0, -0.36], [0.64, -0.62], [0.3, -0.4], [0.0, -0.62]];
const WING: [number, number][] = [...RIGHT, ...RIGHT.slice(1, -1).reverse().map(([x, z]) => [-x, z] as [number, number])];
const WING_T = 0.07;
// The hump along the middle: its footprint on the wing and its top, matched point for point.
const HUMP_BASE: [number, number][] = [[-0.3, -0.42], [0.3, -0.42], [0.46, -0.08], [0.38, 0.45], [0.06, 0.95], [-0.06, 0.95], [-0.38, 0.45], [-0.46, -0.08]];
const HUMP_TOP: [number, number][] = HUMP_BASE.map(([x, z]) => [x * 0.6, z * 0.75 - 0.05] as [number, number]);
const HUMP_H = 0.16;
// The shallow belly under the middle that holds the bomb bay: its top and its flat bottom.
const BELLY_TOP: [number, number][] = HUMP_BASE.map(([x, z]) => [x * 0.8, z * 0.8] as [number, number]);
const BELLY_BOTTOM: [number, number][] = HUMP_BASE.map(([x, z]) => [x * 0.62, z * 0.62 + 0.04] as [number, number]);
const BELLY_H = 0.1;
// Raised panels on each wing, top view [right, forward], mirrored on the left.
const PANELS: [number, number][][] = [
  [[0.62, 0.22], [1.05, -0.12], [0.88, -0.24], [0.54, 0.02]],
  [[1.2, -0.2], [1.56, -0.44], [1.36, -0.46], [1.08, -0.3]],
];
// The bomb bay under the middle, and the munitions in its rack.
const BAY_W = 0.46, BAY_L = 0.62, BAY_Z = 0.08;
const RACK = [-0.18, -0.09, 0, 0.09, 0.18];

export const BombardModel: React.FC<{
  teamColor: string;
  // Over its target, dropping: the bay doors swing open.
  bayOpen?: boolean;
  // Munitions left in the rack, out of five.
  munitions?: number;
}> = ({ teamColor, bayOpen, munitions = RACK.length }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const mirror = (outline: [number, number][]) => outline.map(([x, z]) => [-x, z] as [number, number]).reverse();
  const exhaust = useMemo(() => own(glow('#ff9a4a', 0.8)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => exhaust.dispose(), [exhaust]);
  const tint = useMemo(() => new THREE.Color(), []);

  const body = useRef<THREE.Group>(null);
  const doors = useRef<(THREE.Group | null)[]>([]);
  const rack = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    exhaust.color.copy(tint.set('#ff9a4a')).multiplyScalar(0.7 + 0.15 * Math.sin(t * 23));
    if (body.current) {
      body.current.position.y = Math.sin(t * 0.9) * 0.04;
      body.current.rotation.z = Math.sin(t * 0.5) * 0.04;
      body.current.rotation.x = Math.sin(t * 0.7) * 0.015;
    }
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 4);
    doors.current.forEach((d, i) => {
      if (!d) return;
      const target = bayOpen ? (i ? -1 : 1) * 1.4 : 0;
      d.rotation.z += (target - d.rotation.z) * k;
    });
    // The munitions show once the doors are well open.
    if (rack.current && doors.current[0]) rack.current.visible = doors.current[0].rotation.z > 0.5;
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The wing, and the hump along its middle with a dorsal intake and exhaust slots. */}
        <Prism outline={WING} depth={WING_T} axis="y" material={armour} />
        <Loft bottom={HUMP_BASE} top={HUMP_TOP} height={HUMP_H} material={armour} position={[0, WING_T, 0]} />
        <group position={[0, WING_T + HUMP_H, 0.42]}>
          <Prism outline={[[-0.12, 0], [0.12, 0], [0.08, 0.14], [-0.08, 0.14]]} depth={0.05} axis="y" material={dark} position={[0, -0.02, 0]} />
          <Plate size={[0.18, 0.03, 0.02]} material={black} position={[0, 0.012, 0.14]} />
        </group>
        {[-0.1, 0.1].map(x => (
          <group key={x} position={[x, WING_T + HUMP_H * 0.55, -0.38]}>
            <Plate size={[0.16, 0.05, 0.12]} material={dark} />
            <Plate size={[0.12, 0.02, 0.012]} material={exhaust} position={[0, 0, -0.062]} />
          </group>
        ))}

        {/* Raised panels, edge strips, team markings and wingtip lights. */}
        {[1, -1].map(s => (
          <group key={s}>
            {PANELS.map((p, i) => <Prism key={i} outline={s > 0 ? p : mirror(p)} depth={0.008} axis="y" material={dark} position={[0, WING_T, 0]} />)}
            <Plate size={[0.74, 0.012, 0.035]} material={composite} position={[s * 0.24, WING_T + 0.002, 0.83]} rotation={[0, s * 0.876, 0]} />
            <Plate size={[1.5, 0.012, 0.035]} material={composite} position={[s * 1.1, WING_T + 0.002, 0.04]} rotation={[0, s * 0.66, 0]} />
            <Plate size={[0.18, 0.01, 0.08]} material={paint} position={[s * 1.42, WING_T + 0.006, -0.3]} rotation={[0, s * 0.66, 0]} />
            <Strip size={[0.04, 0.03, 0.08]} material={glow(s > 0 ? PALETTE.repair : PALETTE.warning)} position={[s * 1.75, WING_T / 2, -0.5]} />
          </group>
        ))}
        <Plate size={[0.08, 0.01, 0.22]} material={paint} position={[0, WING_T + HUMP_H + 0.004, 0.08]} />

        {/* The belly and its bomb bay: a dark well, the rack and its munitions (shown while the
            bay is open), two doors on hinges at its outer edges. */}
        <Loft top={BELLY_TOP} bottom={BELLY_BOTTOM} height={BELLY_H} material={armour} position={[0, -BELLY_H, 0]} />
        <group position={[0, -BELLY_H, BAY_Z]}>
          <Plate size={[BAY_W, 0.01, BAY_L]} material={black} position={[0, -0.003, 0]} />
          <group ref={rack} visible={false}>
            <Plate size={[BAY_W - 0.04, 0.02, 0.04]} material={steel} position={[0, -0.015, 0]} />
            {RACK.slice(0, Math.max(0, Math.min(RACK.length, munitions))).map(x => (
              <group key={x} position={[x, -0.05, 0]}>
                <Turned profile={[[0.001, -0.22], [0.035, -0.16], [0.04, 0.12], [0.001, 0.2]]} segments={8} material={housing} />
                <Plate size={[0.09, 0.006, 0.05]} material={dark} position={[0, 0, -0.18]} />
                <Strip size={[0.04, 0.012, 0.03]} material={glow(PALETTE.amber)} position={[0, 0.0, 0.12]} />
              </group>
            ))}
          </group>
          {[1, -1].map((s, i) => (
            <group key={s} ref={g => { doors.current[i] = g; }} position={[s * BAY_W / 2, 0, 0]}>
              <Plate size={[BAY_W / 2, 0.02, BAY_L]} material={dark} position={[-s * BAY_W / 4, -0.018, 0]} />
            </group>
          ))}
        </group>
        <Strip size={[0.05, 0.03, 0.05]} material={glow(PALETTE.warning)} position={[0, -0.01, -0.5]} />
      </group>
    </group>
  );
};
