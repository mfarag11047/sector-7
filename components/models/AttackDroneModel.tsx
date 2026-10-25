// The "Kestrel" attack drone, built from the unit kit (components/kit).
//
// Simple but military, and small beside the other drones: a slim, long faceted body with four short
// blade fins standing near upright from its top corners, running fore and aft with the body, and
// two fins out of its lower sides angling down; each has a slatted vent through it, a red accent
// along its edge and serrations. Slots in the body's sides show where the fins fold away when it is
// not flying: the bottom fin up into the middle, the top fins down fore and aft of it. On the front, the sensor array (a big round lens and a column of
// red-ringed lenses); under the front, a short twin gun whose muzzle flashes while it fires
// (`flashRef`, lit by Unit.tsx).
//
// It moves: it bobs and tilts gently as it hovers.
//
// Built facing +Z, about 1.1 long in its own units, and scaled up here.

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE } from '../kit/materials';
import { Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 1.7;
// Body side profile: [forward, up], faceted fore and aft.
const BODY: [number, number][] = [[-0.5, -0.24], [-0.56, 0.0], [-0.44, 0.2], [0.36, 0.2], [0.54, 0.06], [0.52, -0.2], [0.34, -0.3], [-0.34, -0.3]];
const BODY_W = 0.3;
// The fins, each built along +X then turned out to its side (their blades run fore and aft, parallel
// with the body) and tilted up (+) or down (-): four short ones standing near upright from the top
// corners, and two out of the lower sides angling down. Each has a vent through it: an opening
// with slats across.
const FINS = [
  ...[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({
    at: [sx * 0.11, 0.18, sz * 0.27] as [number, number, number], yaw: sx > 0 ? 0 : Math.PI, tilt: 1.15, len: 0.44, chord: 0.2,
  })),
  ...[1, -1].map(sx => ({ at: [sx * 0.14, -0.18, -0.02] as [number, number, number], yaw: sx > 0 ? 0 : Math.PI, tilt: -0.5, len: 0.38, chord: 0.18 })),
];
const FIN_T = 0.032;
// Where the fins fold away when it is not flying, in each side: the bottom fin folds up into a slot
// in the middle, and the top fins fold down into slots fore and aft of it. [position, size].
const SLOTS: { at: [number, number, number]; size: [number, number, number] }[] = [1, -1].flatMap(sx => [
  ...[1, -1].map(sz => ({ at: [sx * 0.152, -0.04, sz * 0.27] as [number, number, number], size: [0.012, 0.4, 0.2] as [number, number, number] })),
  { at: [sx * 0.152, -0.1, -0.02] as [number, number, number], size: [0.012, 0.34, 0.18] as [number, number, number] },
]);
const VENT_R = 0.065;

export const AttackDroneModel: React.FC<{ teamColor: string; flashRef?: React.Ref<THREE.Mesh> }> = ({ flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing');
  const red = glow(PALETTE.warning);

  const body = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (body.current) {
      body.current.position.y = Math.sin(t * 2.2) * 0.04;
      body.current.rotation.x = 0.1 + Math.sin(t * 1.3) * 0.03;
      body.current.rotation.z = Math.sin(t * 1.7) * 0.04;
    }
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The body: faceted armour, a spine, red accents, a rear pack. */}
        <Prism outline={BODY} depth={BODY_W} axis="x" material={composite} />
        <Plate size={[0.18, 0.06, 0.72]} material={dark} position={[0, 0.23, -0.06]} />
        {[-1, 1].map(s => (
          <group key={s}>
            <Strip size={[0.012, 0.016, 0.5]} material={red} position={[s * (BODY_W / 2 + 0.006), 0.18, -0.05]} />
          </group>
        ))}
        <Plate size={[0.22, 0.2, 0.12]} material={armour} position={[0, -0.04, -0.6]} />

        {/* The sensor array on the front: a big round lens, a column of red-ringed lenses. */}
        <group position={[0, -0.02, 0.53]}>
          <Plate size={[0.24, 0.32, 0.03]} material={black} position={[0, 0, 0]} />
          <Turned profile={[[0.06, 0], [0.06, 0.03]]} segments={10} material={dark} position={[-0.045, 0.04, 0.01]} />
          <Strip size={[0.07, 0.07, 0.012]} material={glow(PALETTE.headlight)} position={[-0.045, 0.04, 0.045]} />
          {[0.1, 0.0, -0.1].map(y => (
            <group key={y} position={[0.07, y, 0.01]}>
              <Turned profile={[[0.03, 0], [0.03, 0.025]]} segments={8} material={red} />
              <Turned profile={[[0.02, 0.02], [0.02, 0.035]]} segments={8} material={black} />
            </group>
          ))}
        </group>

        {/* The gun under the front: a mount and twin short barrels. */}
        <group position={[0, -0.32, 0.32]}>
          <Plate size={[0.16, 0.08, 0.16]} material={dark} />
          {[-0.035, 0.035].map(x => <Turned key={x} profile={[[0.022, 0.06], [0.022, 0.3], [0.03, 0.3], [0.03, 0.33]]} segments={6} material={steel} position={[x, -0.01, 0]} />)}
          <mesh ref={flashRef} position={[0, -0.01, 0.42]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>

        {/* Four blade fins standing up from the top corners, and two shorter fins out of the lower
            sides angling down; each with a fan, a red edge and serrations. */}
        {FINS.map(({ at, yaw, tilt, len, chord }, i) => (
          <group key={i} position={at} rotation={[0, yaw, 0]}>
            <group rotation={[0, 0, tilt]}>
              <Plate size={[len, FIN_T, chord]} material={armour} position={[len / 2, 0, 0]} />
              <Turned profile={[[0.022, -chord / 2 + 0.02], [0.022, chord / 2 - 0.02]]} segments={6} material={steel} />
              <Plate size={[0.12, FIN_T, 0.05]} material={armour} position={[len - 0.03, 0.02, chord / 2 + 0.015]} rotation={[0, 0.5, 0]} />
              <Strip size={[len - 0.12, 0.016, 0.016]} material={red} position={[len / 2 + 0.04, 0.02, -chord / 2]} />
              {[0.72, 0.86].map(f => <Plate key={f} size={[0.03, FIN_T, 0.025]} material={dark} position={[len * f, -0.03, -chord / 2 + 0.012]} />)}
              <group position={[len * 0.5, 0, 0.01]}>
                <Wheel radius={VENT_R + 0.016} width={FIN_T + 0.006} segments={10} material={dark} rotation={[0, 0, Math.PI / 2]} />
                <Wheel radius={VENT_R} width={FIN_T + 0.008} segments={10} material={black} rotation={[0, 0, Math.PI / 2]} />
                {[-0.04, 0, 0.04].map(x => <Plate key={x} size={[0.018, FIN_T + 0.014, VENT_R * 2]} material={dark} position={[x, 0, 0]} />)}
              </group>
              <Strip size={[0.025, 0.025, 0.025]} material={glow(PALETTE.amber)} position={[len, 0.02, 0]} />
            </group>
          </group>
        ))}
        <Plate size={[0.1, 0.1, 0.1]} material={housing} position={[0, 0.3, -0.36]} />
        {/* Fold slots: recesses in the body's sides for the top fins to fold down into, and under
            its belly for the bottom ones, each a dark recess inside a raised lip. */}
        {SLOTS.map(({ at, size }, i) => (
          <group key={i} position={at}>
            <Plate size={size} material={black} />
            {size[0] < 0.02
              ? [-1, 1].map(e => <Plate key={e} size={[size[0] + 0.006, size[1] + 0.02, 0.012]} material={dark} position={[0, 0, e * (size[2] / 2 + 0.006)]} />)
              : [-1, 1].map(e => <Plate key={e} size={[size[0] + 0.02, size[1] + 0.006, 0.012]} material={dark} position={[0, 0, e * (size[2] / 2 + 0.006)]} />)}
          </group>
        ))}
      </group>
    </group>
  );
};
