// The Helios microwave drone, built from the unit kit (components/kit).
//
// Simple but military: a hovering power drone. An armoured body with a team band; above it, a
// solar array on a mast (four tilted panels, dark cells in steel frames); four jet nacelles on
// short arms at the corners, firing down; and under it, facing the ground, the microwave
// projector: a flared horn with an emitter core and rings that glow gold while it charges friendly
// units and orange-red while it microwaves enemies (sim/helios.ts), and go dark when it can't work.
//
// It moves: its jets flicker, its projector pulses while working, and it bobs gently as it hovers.
//
// Built facing +Z, about 1.4 across in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 2.6;
// Body side profile: [forward, up], its lower edges cut back.
const BODY: [number, number][] = [[-0.42, -0.14], [-0.48, 0.0], [-0.48, 0.2], [0.48, 0.2], [0.48, 0.0], [0.42, -0.14]];
const BODY_W = 0.84;
const JETS: [number, number][] = [[-0.62, 0.42], [0.62, 0.42], [-0.62, -0.42], [0.62, -0.42]];
const PANELS: [number, number][] = [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3]];
const MODE_COLORS = { charge: PALETTE.power, burn: '#ff5a2a' };

export const HeliosModel: React.FC<{
  teamColor: string;
  mode: 'charge' | 'burn';
  // Charging or burning (not knocked out, and in Microwave mode, not flat).
  working: boolean;
}> = ({ teamColor, mode, working }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  // This Helios's own: the projector's glow, and its jets' flicker.
  const own_ = useMemo(() => ({ core: own(glow(PALETTE.power)) as THREE.MeshBasicMaterial, jet: own(glow(PALETTE.cyan, 0.7)) as THREE.MeshBasicMaterial }), []);
  useEffect(() => () => { own_.core.dispose(); own_.jet.dispose(); }, [own_]);
  const cell = useMemo(() => glow('#1d3b5c'), []);

  const body = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.4) * 0.05;
      body.current.rotation.z = Math.sin(t * 0.8) * 0.03;
    }
    const level = working ? 1.0 + 0.3 * Math.sin(t * (mode === 'burn' ? 9 : 4)) : 0.08;
    own_.core.color.copy(scratch.set(MODE_COLORS[mode])).multiplyScalar(level);
    own_.jet.color.copy(scratch.set(PALETTE.cyan)).multiplyScalar(0.8 + 0.2 * Math.sin(t * 29) + 0.1 * Math.sin(t * 13));
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The body: armour, a team band, side vents, small lights. */}
        <Prism outline={BODY} depth={BODY_W} axis="x" material={armour} />
        <Plate size={[BODY_W + 0.02, 0.06, 0.98]} material={paint} position={[0, 0.12, 0]} />
        {[-1, 1].map(s => (
          <group key={s}>
            {[0.0, 0.06].map(y => <Plate key={y} size={[0.012, 0.025, 0.5]} material={black} position={[s * (BODY_W / 2 + 0.006), y - 0.02, 0]} />)}
            <Strip size={[0.03, 0.03, 0.03]} material={glow(s < 0 ? PALETTE.warning : PALETTE.repair)} position={[s * (BODY_W / 2 + 0.02), 0.06, 0.46]} />
          </group>
        ))}
        <Plate size={[0.3, 0.1, 0.06]} material={dark} position={[0, 0.06, 0.5]} />
        <Strip size={[0.12, 0.03, 0.012]} material={glow(PALETTE.cyan)} position={[0, 0.06, 0.532]} />

        {/* The solar array on its mast: four tilted panels, cells in steel frames. */}
        <Turned profile={[[0.08, 0.2], [0.08, 0.26], [0.04, 0.28], [0.04, 0.42]]} segments={8} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <Plate size={[0.14, 0.06, 0.14]} material={dark} position={[0, 0.44, 0]} />
        {PANELS.map(([x, z]) => (
          <group key={`${x}${z}`} position={[x, 0.46, z]} rotation={[z > 0 ? 0.12 : -0.12, 0, x > 0 ? -0.12 : 0.12]}>
            <Plate size={[0.54, 0.035, 0.54]} material={steel} />
            <Plate size={[0.5, 0.01, 0.5]} material={cell} position={[0, 0.02, 0]} />
            {[-0.125, 0, 0.125].map(o => (
              <group key={o}>
                <Plate size={[0.5, 0.012, 0.01]} material={housing} position={[0, 0.022, o]} />
                <Plate size={[0.01, 0.012, 0.5]} material={housing} position={[o, 0.022, 0]} />
              </group>
            ))}
          </group>
        ))}

        {/* Jet nacelles on short arms at the corners, firing down. */}
        {JETS.map(([x, z]) => (
          <group key={`${x}${z}`}>
            <Plate size={[Math.abs(x) - BODY_W / 2 - 0.08, 0.06, 0.1]} material={dark} position={[Math.sign(x) * (BODY_W / 2 + Math.abs(x)) / 2 - Math.sign(x) * 0.04, 0.05, z]} />
            <group position={[x, 0.05, z]}>
              <Turned profile={[[0.08, -0.16], [0.11, -0.1], [0.11, 0.08], [0.08, 0.12]]} segments={8} material={composite} rotation={[-Math.PI / 2, 0, 0]} />
              <Turned profile={[[0.08, -0.18], [0.09, -0.16], [0.001, -0.16]]} segments={8} material={black} rotation={[-Math.PI / 2, 0, 0]} />
              <group position={[0, -0.18, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <Turned profile={[[0.06, 0], [0.001, 0.3]]} segments={8} material={own_.jet} />
              </group>
            </group>
          </group>
        ))}

        {/* The microwave projector under the body, facing the ground: a mount, a flared horn with
            ribs, rings and an emitter core that glow with the mode. */}
        <group position={[0, -0.14, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <Turned profile={[[0.22, 0], [0.22, 0.06], [0.16, 0.08]]} segments={12} material={dark} />
          <Turned profile={[[0.14, 0.06], [0.2, 0.18], [0.32, 0.3], [0.34, 0.33], [0.3, 0.33], [0.18, 0.22], [0.12, 0.1]]} segments={12} material={housing} />
          {[0, 1, 2, 3].map(k => (
            <Plate key={k} size={[0.02, 0.24, 0.025]} material={dark} position={[Math.cos(k * Math.PI / 2) * 0.24, Math.sin(k * Math.PI / 2) * 0.24, 0.2]} rotation={[0, 0, k * Math.PI / 2]} />
          ))}
          <Turned profile={[[0.27, 0.27], [0.29, 0.27], [0.29, 0.29], [0.27, 0.29]]} segments={12} material={own_.core} />
          <Turned profile={[[0.1, 0.1], [0.1, 0.22], [0.001, 0.26]]} segments={12} material={own_.core} />
        </group>
      </group>
    </group>
  );
};
