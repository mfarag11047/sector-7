// The Wasp gunship, built from the unit kit (components/kit).
//
// Simple but military: a compact faceted VTOL body with a dark sensor face, a chin gun whose muzzle
// flashes while it fires (`flashRef`, lit by Unit.tsx), a tail fin and stabilisers, and two lift
// jets under it. Long, swept wings carry its micro-drone launchers: two hex pods hung under each
// wing on pylons, their faces clusters of tubes with a red-nosed micro drone in each. Team colour
// on the spine and the pods' bands; red and green lights at the wingtips.
//
// It moves: its jets flicker, and it bobs and banks gently as it hovers.
//
// Built facing +Z, about 1.3 long and 3 across its wings in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 2.0;
// Body side profile: [forward, up], faceted fore and aft.
const BODY: [number, number][] = [[-0.6, -0.06], [-0.64, 0.12], [-0.46, 0.2], [0.28, 0.2], [0.6, 0.04], [0.58, -0.1], [0.4, -0.2], [-0.42, -0.2]];
const BODY_W = 0.44;
// The tail fin, side view.
const FIN: [number, number][] = [[-0.62, 0.18], [-0.7, 0.56], [-0.56, 0.56], [-0.3, 0.18]];
// The right wing, top view [right, forward]: long and swept; the left is its mirror.
const WING: [number, number][] = [[0.2, 0.28], [1.5, 0.02], [1.52, -0.16], [0.2, -0.22]];
const WING_Y = 0.02, WING_T = 0.06;
// The launcher pods, two under each wing: where they hang [out, forward], and their tubes [right, up].
const PODS: [number, number][] = [[0.6, 0.0], [1.18, -0.07]];
const POD_Y = -0.2, POD_R = 0.2;
const TUBES: [number, number][] = [[0, 0], ...[0, 1, 2, 3, 4, 5].map(k => [Math.cos(k * Math.PI / 3 + Math.PI / 6) * 0.11, Math.sin(k * Math.PI / 3 + Math.PI / 6) * 0.11] as [number, number])];

export const WaspModel: React.FC<{ teamColor: string; flashRef?: React.Ref<THREE.Mesh> }> = ({ teamColor, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const red = glow(PALETTE.warning);
  const mirrored = useMemo(() => WING.map(([x, z]) => [-x, z] as [number, number]).reverse(), []);

  const body = useRef<THREE.Group>(null);
  const jet = useMemo(() => own(glow(PALETTE.cyan, 0.6)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => jet.dispose(), [jet]);
  const tint = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    jet.color.copy(tint.set(PALETTE.cyan)).multiplyScalar(0.8 + 0.2 * Math.sin(t * 27) + 0.1 * Math.sin(t * 11));
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.8) * 0.05;
      body.current.rotation.z = Math.sin(t * 0.9) * 0.05;
      body.current.rotation.x = 0.05 + Math.sin(t * 1.3) * 0.02;
    }
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The body: faceted armour, a raised spine with team colour, side vents, a rear pack. */}
        <Prism outline={BODY} depth={BODY_W} axis="x" material={composite} />
        <Plate size={[0.24, 0.06, 0.62]} material={dark} position={[0, 0.23, -0.12]} />
        <Plate size={[0.14, 0.012, 0.4]} material={paint} position={[0, 0.266, -0.1]} />
        {[-1, 1].map(s => [-0.02, -0.08].map(y => (
          <Plate key={`${s}${y}`} size={[0.012, 0.025, 0.36]} material={black} position={[s * (BODY_W / 2 + 0.006), y, -0.2]} />
        )))}
        <Plate size={[0.3, 0.2, 0.1]} material={armour} position={[0, 0.02, -0.66]} />

        {/* The tail: a fin and two stabilisers. */}
        <Prism outline={FIN} depth={0.04} axis="x" material={armour} />
        <Strip size={[0.046, 0.025, 0.12]} material={red} position={[0, 0.54, -0.63]} />
        {[-1, 1].map(s => (
          <Plate key={s} size={[0.34, 0.03, 0.16]} material={armour} position={[s * 0.32, 0.12, -0.54]} rotation={[0, 0, s * 0.18]} />
        ))}

        {/* The sensor face: a dark panel, a big lens and two small ones, a headlight. */}
        <group position={[0, -0.02, 0.585]} rotation={[-0.2, 0, 0]}>
          <Plate size={[0.3, 0.2, 0.03]} material={black} />
          <Turned profile={[[0.05, 0], [0.05, 0.03]]} segments={10} material={dark} position={[-0.06, 0.01, 0.01]} />
          <Strip size={[0.06, 0.06, 0.012]} material={glow(PALETTE.cyan)} position={[-0.06, 0.01, 0.045]} />
          {[0.05, -0.03].map(y => <Strip key={y} size={[0.03, 0.03, 0.012]} material={red} position={[0.08, y, 0.02]} />)}
        </group>

        {/* The chin gun: a mount and a short barrel. */}
        <group position={[0, -0.22, 0.38]}>
          <Plate size={[0.14, 0.08, 0.16]} material={dark} />
          <Turned profile={[[0.025, 0.06], [0.025, 0.3], [0.035, 0.3], [0.035, 0.34]]} segments={6} material={steel} />
          <mesh ref={flashRef} position={[0, 0, 0.44]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>

        {/* Two lift jets under the body, firing down. */}
        {[-0.13, 0.13].map(x => (
          <group key={x} position={[x, -0.2, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <Turned profile={[[0.09, 0], [0.1, 0.06], [0.07, 0.08]]} segments={8} material={dark} />
            <Turned profile={[[0.06, 0.06], [0.001, 0.32]]} segments={8} material={jet} />
          </group>
        ))}

        {/* The wings: long and swept, a leading-edge strip, a hard point, wingtip lights. */}
        {[1, -1].map(s => (
          <group key={s}>
            <Prism outline={s > 0 ? WING : mirrored} depth={WING_T} axis="y" material={armour} position={[0, WING_Y, 0]} />
            <Plate size={[0.9, 0.012, 0.1]} material={dark} position={[s * 0.75, WING_Y + WING_T + 0.006, -0.02]} rotation={[0, s * 0.2, 0]} />
            <Strip size={[0.05, 0.03, 0.05]} material={glow(s > 0 ? PALETTE.repair : PALETTE.warning)} position={[s * 1.52, WING_Y + 0.03, -0.06]} />
          </group>
        ))}

        {/* Two micro-drone launchers under each wing: a pylon, a hex pod with a team band, its face
            a cluster of tubes, a red-nosed micro drone in each. */}
        {[1, -1].flatMap(s => PODS.map(([x, z]) => (
          <group key={`${s}${x}`} position={[s * x, POD_Y, z]}>
            <Plate size={[0.08, 0.16, 0.3]} material={dark} position={[0, 0.16, -0.02]} />
            <group rotation={[0, 0, Math.PI / 2]}>
              <Turned profile={[[POD_R - 0.04, -0.38], [POD_R, -0.32], [POD_R, 0.3], [POD_R - 0.02, 0.32]]} segments={6} material={housing} />
              <Turned profile={[[POD_R + 0.008, -0.04], [POD_R + 0.008, 0.06]]} segments={6} material={paint} />
              <Turned profile={[[POD_R - 0.04, 0.3], [POD_R - 0.04, 0.34]]} segments={6} material={dark} />
            </group>
            {TUBES.map(([x, y]) => (
              <group key={`${x}${y}`} position={[x, y, 0.32]}>
                <Turned profile={[[0.045, 0], [0.045, 0.04], [0.032, 0.04], [0.032, 0.0]]} segments={8} material={black} />
                <Turned profile={[[0.028, -0.02], [0.028, 0.0], [0.001, 0.035]]} segments={6} material={red} />
              </group>
            ))}
            <Strip size={[0.04, 0.02, 0.012]} material={glow(PALETTE.amber)} position={[0, -POD_R + 0.03, 0.31]} />
          </group>
        )))}
      </group>
    </group>
  );
};
