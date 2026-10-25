// The Infiltrator surveillance drone, built from the unit kit (components/kit).
//
// Simple but military: a long-winged loitering drone, a futuristic take on a high-endurance
// surveillance aircraft. A slender faceted fuselage with a raised hump over the nose; a sensor
// turret under the nose (a gimbal ball with a lens); long, slightly tapered wings with upturned
// tips and a small pod under each; a V-tail over a ventral fin; and in the tail, instead of a
// propeller, a jet engine: side intakes and a nozzle with a glowing exhaust. A radar rotodome
// stands on struts over the fuselage, turning while its radar runs (`radarOn`), its scan bar lit.
// Team colour on the wingtips and a band round the fuselage.
//
// It moves: the rotodome turns, the exhaust flickers, and it bobs and banks gently as it loiters.
//
// Built facing +Z, about 1.9 long and 3.3 across its wings in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 2.0;
// Fuselage side profile: [forward, up]: a slim body, the hump over the nose, a faceted chin.
const BODY: [number, number][] = [[-0.82, -0.05], [-0.82, 0.07], [-0.3, 0.12], [0.3, 0.13], [0.56, 0.21], [0.82, 0.17], [0.96, 0.05], [0.92, -0.06], [0.66, -0.12], [-0.4, -0.11]];
const BODY_W = 0.22;
// The right wing, top view [right, forward]; the left is its mirror.
const WING: [number, number][] = [[0.1, 0.24], [1.55, 0.12], [1.6, -0.02], [0.1, -0.1]];
const WING_Y = 0.02, WING_T = 0.035;
// The V-tail's halves and the ventral fin, side view.
const TAIL: [number, number][] = [[-0.8, 0], [-0.78, 0.36], [-0.68, 0.36], [-0.5, 0]];

export const InfiltratorModel: React.FC<{ teamColor: string; radarOn: boolean }> = ({ teamColor, radarOn }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const mirrored = useMemo(() => WING.map(([x, z]) => [-x, z] as [number, number]).reverse(), []);
  const own_ = useMemo(() => ({ exhaust: own(glow('#ff9a4a', 0.55)) as THREE.MeshBasicMaterial }), []);
  useEffect(() => () => own_.exhaust.dispose(), [own_]);
  const tint = useMemo(() => new THREE.Color(), []);

  const body = useRef<THREE.Group>(null);
  const dome = useRef<THREE.Group>(null);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    own_.exhaust.color.copy(tint.set('#ff9a4a')).multiplyScalar(0.75 + 0.2 * Math.sin(t * 29) + 0.1 * Math.sin(t * 13));
    if (dome.current && radarOn) dome.current.rotation.y += Math.min(delta, 0.05) * 2.2;
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.1) * 0.04;
      body.current.rotation.z = Math.sin(t * 0.6) * 0.05;
    }
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The fuselage: faceted armour, a spine, a team band, side panel lines. */}
        <Prism outline={BODY} depth={BODY_W} axis="x" material={armour} />
        <Plate size={[0.1, 0.03, 0.8]} material={dark} position={[0, 0.135, -0.18]} />
        <Plate size={[BODY_W + 0.012, 0.2, 0.03]} material={paint} position={[0, 0.01, 0.34]} />
        {[-1, 1].map(s => <Plate key={s} size={[0.006, 0.012, 0.9]} material={composite} position={[s * (BODY_W / 2 + 0.003), -0.02, -0.05]} />)}

        {/* The sensor turret under the nose: a mount, a gimbal ball, a lens. */}
        <group position={[0, -0.14, 0.7]}>
          <Plate size={[0.1, 0.04, 0.1]} material={dark} position={[0, 0.03, 0]} />
          <Turned profile={[[0.001, -0.07], [0.05, -0.06], [0.07, -0.02], [0.07, 0.02], [0.05, 0.06], [0.001, 0.07]]} segments={10} material={composite} position={[0, -0.04, 0]} />
          <group position={[0, -0.05, 0.06]} rotation={[0.35, 0, 0]}>
            <Turned profile={[[0.035, 0], [0.035, 0.02]]} segments={10} material={black} />
            <Strip size={[0.035, 0.035, 0.008]} material={glow(PALETTE.cyan)} position={[0, 0, 0.022]} />
          </group>
        </group>
        <Strip size={[0.08, 0.02, 0.01]} material={glow(PALETTE.warning)} position={[0, 0.02, 0.955]} />

        {/* The wings: long, a dark leading edge, upturned team-coloured tips, a pod under each. */}
        {[1, -1].map(s => (
          <group key={s}>
            <Prism outline={s > 0 ? WING : mirrored} depth={WING_T} axis="y" material={armour} position={[0, WING_Y, 0]} />
            <Plate size={[1.45, 0.01, 0.03]} material={dark} position={[s * 0.83, WING_Y + WING_T + 0.004, 0.17]} rotation={[0, s * 0.083, 0]} />
            <group position={[s * 1.58, WING_Y + WING_T / 2, 0.04]} rotation={[0, 0, s * 0.9]}>
              <Plate size={[0.16, 0.03, 0.13]} material={paint} position={[s * 0.07, 0, 0]} />
            </group>
            <Strip size={[0.03, 0.03, 0.05]} material={glow(s > 0 ? PALETTE.repair : PALETTE.warning)} position={[s * 1.62, WING_Y + 0.02, 0.08]} />
            <group position={[s * 0.75, WING_Y - 0.08, 0.06]}>
              <Plate size={[0.03, 0.06, 0.1]} material={dark} position={[0, 0.05, 0]} />
              <Turned profile={[[0.001, -0.18], [0.035, -0.12], [0.04, 0.1], [0.001, 0.18]]} segments={8} material={steel} />
            </group>
          </group>
        ))}

        {/* The V-tail and the ventral fin. */}
        {[1, -1].map(s => (
          <group key={s} position={[s * 0.04, 0.08, 0]} rotation={[0, 0, -s * 0.75]}>
            <Prism outline={TAIL} depth={0.03} axis="x" material={armour} />
          </group>
        ))}
        <group position={[0, -0.06, 0]} rotation={[0, 0, Math.PI]}>
          <Prism outline={TAIL.map(([z, y]) => [z, y * 0.6] as [number, number])} depth={0.03} axis="x" material={armour} />
        </group>

        {/* The jet engine in the tail: side intakes, the casing, a nozzle and its exhaust. */}
        {[-1, 1].map(s => (
          <Prism key={s} outline={[[-0.5, 0.0], [-0.5, 0.1], [-0.26, 0.1], [-0.18, 0.0]]} depth={0.06} axis="x" material={dark} position={[s * (BODY_W / 2 + 0.02), -0.02, 0]} />
        ))}
        {[-1, 1].map(s => <Plate key={s} size={[0.012, 0.07, 0.03]} material={black} position={[s * (BODY_W / 2 + 0.052), 0.03, -0.2]} />)}
        <group position={[0, 0.01, -0.8]} rotation={[0, Math.PI, 0]}>
          <Turned profile={[[0.11, -0.02], [0.11, 0.08], [0.08, 0.16], [0.06, 0.16]]} segments={10} material={steel} />
          <Turned profile={[[0.06, 0.14], [0.001, 0.15]]} segments={10} material={black} />
          <Turned profile={[[0.05, 0.16], [0.001, 0.3]]} segments={10} material={own_.exhaust} />
        </group>

        {/* The radar rotodome on two struts: a lenticular disc with a scan bar, lit while the
            radar runs. */}
        {[-0.14, 0.14].map(z => <Plate key={z} size={[0.03, 0.2, 0.05]} material={dark} position={[0, 0.22, z - 0.12]} rotation={[z > 0 ? -0.2 : 0.2, 0, 0]} />)}
        <group ref={dome} position={[0, 0.34, -0.12]}>
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Turned profile={[[0.001, -0.035], [0.26, -0.02], [0.31, 0], [0.26, 0.025], [0.001, 0.04]]} segments={16} material={housing} />
          </group>
          <Plate size={[0.5, 0.012, 0.05]} material={radarOn ? glow(PALETTE.repair) : black} position={[0, 0.037, 0]} />
          <Plate size={[0.08, 0.02, 0.08]} material={dark} position={[0, 0.048, 0]} />
        </group>
      </group>
    </group>
  );
};
