// The Infiltrator surveillance drone, built from the unit kit (components/kit).
//
// Simple but military: a blended-wing stealth drone with very long wings, the body and wings one
// sweeping piece. A pointed body that widens and flows into long, slightly swept, slender wings;
// a low hump along the middle with a dorsal intake; two small canted fins at the back; and in the
// tail a flat jet nozzle with a glowing exhaust. On the nose, a sensor array: a dark window on top
// and a turret under the chin. A radar rotodome on a short fairing over the middle turns while
// its radar runs (`radarOn`), its scan bar lit. Team markings near the wingtips, red and green
// tip lights.
//
// It moves: the rotodome turns, the exhaust flickers, and it bobs and banks gently as it loiters.
//
// Built facing +Z, about 1.7 long and 4.8 across its wings in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 1.7;
// The whole planform, body and wings, top view [right, forward]: the nose, the body widening into
// the wing's leading edge, out to the right tip, the trailing edge back in to the tail; the left
// is its mirror.
const RIGHT: [number, number][] = [[0.0, 0.95], [0.22, 0.56], [0.7, 0.11], [2.4, -0.1], [2.42, -0.24], [0.78, -0.18], [0.4, -0.44], [0.14, -0.72], [0.0, -0.72]];
const PLANFORM: [number, number][] = [...RIGHT, ...RIGHT.slice(1, -1).reverse().map(([x, z]) => [-x, z] as [number, number])];
const SKIN_T = 0.04;
// The body's hump above the wing and its belly below it: footprint and top, point for point.
const BODY: [number, number][] = [[-0.13, -0.68], [0.13, -0.68], [0.4, -0.38], [0.66, -0.06], [0.24, 0.5], [0.03, 0.9], [-0.03, 0.9], [-0.24, 0.5], [-0.66, -0.06], [-0.4, -0.38]];
const HUMP: [number, number][] = BODY.map(([x, z]) => [x * 0.4, z * 0.8 + 0.02] as [number, number]);
const HUMP_H = 0.15;
const BELLY: [number, number][] = BODY.map(([x, z]) => [x * 0.45, z * 0.75] as [number, number]);
const BELLY_H = 0.07;
// A canted tail fin, side view.
const FIN: [number, number][] = [[-0.66, 0], [-0.68, 0.2], [-0.58, 0.2], [-0.4, 0]];

export const InfiltratorModel: React.FC<{ teamColor: string; radarOn: boolean }> = ({ teamColor, radarOn }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const own_ = useMemo(() => ({ exhaust: own(glow('#ff9a4a', 0.8)) as THREE.MeshBasicMaterial }), []);
  useEffect(() => () => own_.exhaust.dispose(), [own_]);
  const tint = useMemo(() => new THREE.Color(), []);

  const body = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    own_.exhaust.color.copy(tint.set('#ff9a4a')).multiplyScalar(0.7 + 0.2 * Math.sin(t * 29) + 0.1 * Math.sin(t * 13));
    if (dome.current && radarOn) dome.current.rotation.y += Math.min(delta, 0.05) * 2.2;
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.1) * 0.04;
      body.current.rotation.z = Math.sin(t * 0.6) * 0.04;
    }
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* Body and wings in one piece: the planform, the hump above it, the belly below. */}
        <Prism outline={PLANFORM} depth={SKIN_T} axis="y" material={armour} />
        <Loft bottom={BODY} top={HUMP} height={HUMP_H} material={armour} position={[0, SKIN_T, 0]} />
        <Loft top={BODY} bottom={BELLY} height={BELLY_H} material={armour} position={[0, -BELLY_H, 0]} />

        {/* The dorsal intake, ahead of the rotodome. */}
        <group position={[0, SKIN_T + HUMP_H, 0.3]}>
          <Prism outline={[[-0.1, 0], [0.1, 0], [0.06, 0.16], [-0.06, 0.16]]} depth={0.04} axis="y" material={dark} position={[0, -0.02, 0]} />
          <Plate size={[0.15, 0.025, 0.015]} material={black} position={[0, 0.01, 0.16]} />
        </group>

        {/* The sensor array on the nose: a dark window on top, a turret under the chin. */}
        <Prism outline={[[-0.05, 0.62], [0.05, 0.62], [0.03, 0.78], [-0.03, 0.78]]} depth={0.01} axis="y" material={black} position={[0, SKIN_T + HUMP_H * 0.35, 0]} />
        <Strip size={[0.05, 0.01, 0.03]} material={glow(PALETTE.cyan)} position={[0, SKIN_T + HUMP_H * 0.35 + 0.01, 0.7]} />
        <group position={[0, -BELLY_H * 0.6, 0.62]}>
          <Plate size={[0.08, 0.03, 0.08]} material={dark} position={[0, 0, 0]} />
          <Turned profile={[[0.001, -0.06], [0.045, -0.05], [0.06, -0.015], [0.06, 0.015], [0.045, 0.05], [0.001, 0.06]]} segments={10} material={composite} position={[0, -0.05, 0]} />
          <group position={[0, -0.06, 0.05]} rotation={[0.35, 0, 0]}>
            <Turned profile={[[0.03, 0], [0.03, 0.018]]} segments={10} material={black} />
            <Strip size={[0.03, 0.03, 0.008]} material={glow(PALETTE.cyan)} position={[0, 0, 0.02]} />
          </group>
        </group>

        {/* Wing details: a dark leading-edge strip, team markings, tip lights. */}
        {[1, -1].map(s => (
          <group key={s}>
            <Plate size={[1.7, 0.008, 0.03]} material={dark} position={[s * 1.55, SKIN_T + 0.002, -0.02]} rotation={[0, s * 0.124, 0]} />
            <Plate size={[0.24, 0.008, 0.1]} material={paint} position={[s * 2.12, SKIN_T + 0.003, -0.16]} rotation={[0, s * 0.124, 0]} />
            <Strip size={[0.04, 0.03, 0.06]} material={glow(s > 0 ? PALETTE.repair : PALETTE.warning)} position={[s * 2.42, SKIN_T / 2, -0.17]} />
          </group>
        ))}

        {/* Two small canted fins at the back. */}
        {[1, -1].map(s => (
          <group key={s} position={[s * 0.16, SKIN_T, 0]} rotation={[0, 0, -s * 0.6]}>
            <Prism outline={FIN} depth={0.025} axis="x" material={armour} />
          </group>
        ))}

        {/* The jet nozzle in the tail: a flat housing, a dark slot, the exhaust. */}
        <group position={[0, SKIN_T / 2, -0.68]}>
          <Plate size={[0.28, 0.1, 0.08]} material={dark} />
          <Plate size={[0.22, 0.05, 0.012]} material={black} position={[0, 0, -0.04]} />
          <Plate size={[0.2, 0.035, 0.012]} material={own_.exhaust} position={[0, 0, -0.048]} />
        </group>

        {/* The radar rotodome on a short fairing: a lenticular disc with a scan bar, lit while
            the radar runs. */}
        <Prism outline={[[-0.03, -0.32], [0.03, -0.32], [0.03, -0.04], [-0.03, -0.04]]} depth={0.18} axis="y" material={dark} position={[0, SKIN_T + HUMP_H - 0.04, 0]} />
        <group ref={dome} position={[0, SKIN_T + HUMP_H + 0.16, -0.18]} scale={1.5}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Turned profile={[[0.001, -0.035], [0.27, -0.02], [0.32, 0], [0.27, 0.025], [0.001, 0.04]]} segments={16} material={housing} />
          </group>
          <Plate size={[0.52, 0.012, 0.05]} material={radarOn ? glow(PALETTE.repair) : black} position={[0, 0.037, 0]} />
          <Plate size={[0.08, 0.02, 0.08]} material={dark} position={[0, 0.045, 0]} />
        </group>
      </group>
    </group>
  );
};
