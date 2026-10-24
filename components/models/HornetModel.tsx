// The Hornet gunship, built from the unit kit (components/kit).
//
// Simple but military: an armoured VTOL attack drone, wide and low. A broad, chamfered, layered
// armour deck (a raised spine, a dome, cable runs, a handle, an antenna, team colour), and below it
// one hull sloping in on every side to a narrow keel. On the keel's flat face, a sensor array (two
// lenses, a grille, a light); at its foot, the gun: twin barrels that only just stand out of their
// slot, turning a little toward what the Hornet is shooting at (`aimRef`) and flashing at the
// muzzles (`flashRef`). Four splayed thruster pods hang under the deck's rim, each with grab rails,
// a team marking and a downward jet; the front pair carry round canisters. With Hunter-Killer
// Rockets researched, a cluster of four rocket tubes rides on each side of the deck, angled
// forward and out.
//
// It moves: its jets flicker under it, and it bobs and banks gently as it hovers.
//
// Built facing +Z, about 1.6 long and 1.8 wide in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.4;
// The deck, top view [right, forward]: broad, its front drawn in to the prow.
const DECK: [number, number][] = [[-0.8, -0.7], [0.8, -0.7], [0.96, -0.22], [0.8, 0.4], [0.3, 0.66], [-0.3, 0.66], [-0.8, 0.4], [-0.96, -0.22]];
const DECK_TOP = DECK.map(([x, z]) => [x * 0.7, z * 0.78 - 0.06] as [number, number]);
const DECK_Y = 0.05, DECK_H = 0.14;
// The hull below the deck tapers in to a narrow keel: the keel's outline, top view, matching the
// deck's point for point. Its front is a flat face for the sensors, with the gun at its foot.
const KEEL: [number, number][] = [[-0.2, -0.45], [0.2, -0.45], [0.26, -0.1], [0.26, 0.4], [0.11, 0.66], [-0.11, 0.66], [-0.26, 0.4], [-0.26, -0.1]];
const KEEL_Y = -0.68, FACE_Z = 0.66;
// A thruster pod, side view: a tall housing, its top front cut back, its foot drawn in.
const POD: [number, number][] = [[-0.22, -0.62], [-0.22, 0.02], [0.02, 0.12], [0.22, -0.02], [0.22, -0.5], [0.12, -0.62]];
const POD_W = 0.3;
const PODS: [number, number][] = [[-0.86, 0.2], [0.86, 0.2], [-0.9, -0.44], [0.9, -0.44]];
// Rocket tubes in each side's cluster: [up, along].
const TUBES: [number, number][] = [[0, 0], [0, 0.13], [0.11, 0.065], [0.11, 0.195]];

export const HornetModel: React.FC<{
  teamColor: string;
  // Hunter-Killer Rockets researched: rocket clusters on the deck.
  rockets?: boolean;
  // Where the gun should point, in world space, or null.
  aimRef?: React.MutableRefObject<THREE.Vector3 | null>;
  flashRef?: React.Ref<THREE.Mesh>;
}> = ({ teamColor, rockets, aimRef, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);

  const body = useRef<THREE.Group>(null);
  const exhaust = useMemo(() => own(glow('#ffb35c')) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => exhaust.dispose(), [exhaust]);
  const tint = useMemo(() => new THREE.Color(), []);
  const gun = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    exhaust.color.copy(tint.set('#ffb35c')).multiplyScalar(0.8 + 0.25 * Math.sin(t * 31) + 0.15 * Math.sin(t * 17));
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.6) * 0.06;
      body.current.rotation.z = Math.sin(t * 0.9) * 0.04;
      body.current.rotation.x = 0.06 + Math.sin(t * 1.2) * 0.02;
    }
    // The gun turns a little toward its target, else back to the front.
    const g = gun.current;
    if (!g || !g.parent) return;
    let yaw = 0;
    const aim = aimRef?.current;
    if (aim) {
      const local = g.parent.worldToLocal(scratch.copy(aim));
      yaw = Math.max(-0.6, Math.min(0.6, Math.atan2(local.x - g.position.x, local.z - g.position.z)));
    }
    g.rotation.y += (yaw - g.rotation.y) * Math.min(1, delta * 6);
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* The deck: a broad plate, a darker raised layer, the spine, a dome, cable runs, a
            handle, an antenna and team colour. */}
        <Prism outline={DECK} depth={DECK_H} axis="y" bevel={0.06} material={armour} position={[0, DECK_Y - 0.06, 0]} />
        <Prism outline={DECK_TOP} depth={0.1} axis="y" bevel={0.03} material={dark} position={[0, DECK_Y + DECK_H - 0.02, 0]} />
        <Plate size={[0.3, 0.1, 0.62]} material={armour} position={[0, DECK_Y + DECK_H + 0.13, -0.08]} />
        <Plate size={[0.22, 0.012, 0.3]} material={paint} position={[0, DECK_Y + DECK_H + 0.186, 0.02]} />
        <group position={[0, DECK_Y + DECK_H + 0.18, -0.48]}>
          <Plate size={[0.3, 0.06, 0.24]} material={dark} position={[0, 0.03, 0]} />
          <Turned profile={[[0.12, 0.06], [0.12, 0.1], [0.08, 0.17], [0.001, 0.19]]} segments={8} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
        </group>
        {[-0.08, 0.08].map(x => <Plate key={x} size={[0.025, 0.025, 0.36]} material={steel} position={[x + 0.28, DECK_Y + DECK_H + 0.1, -0.05]} />)}
        <group position={[-0.28, DECK_Y + DECK_H + 0.08, 0.18]}>
          {[-1, 1].map(e => <Plate key={e} size={[0.02, 0.07, 0.02]} material={steel} position={[e * 0.08, 0.035, 0]} />)}
          <Plate size={[0.18, 0.02, 0.02]} material={steel} position={[0, 0.07, 0]} />
        </group>
        <group position={[0.32, DECK_Y + DECK_H + 0.08, -0.45]}>
          <Turned profile={[[0.008, 0], [0.005, 0.45]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.15, 0, 0]} />
        </group>
        {[-1, 1].map(s => <Plate key={s} size={[0.24, 0.03, 0.03]} material={black} position={[s * 0.5, DECK_Y + DECK_H - 0.03, 0.56]} rotation={[0, s * 0.62, 0]} />)}

        {/* The hull, sloping in from the deck to the keel. */}
        <Loft top={DECK} bottom={KEEL} height={DECK_Y - 0.06 - KEEL_Y} material={armour} position={[0, KEEL_Y, 0]} />

        {/* The sensor array on the keel's face: a housing, two lenses, a grille, a light. */}
        <group position={[0, -0.28, FACE_Z]}>
          <Plate size={[0.18, 0.26, 0.02]} material={black} position={[0, 0, 0.01]} />
          {[0.06, -0.02].map((y, i) => (
            <group key={y} position={[0, y, 0.02]}>
              <Turned profile={[[0.034, 0], [0.034, 0.025]]} segments={8} material={dark} />
              <Strip size={[0.03, 0.03, 0.01]} material={glow(i ? PALETTE.warning : PALETTE.cyan)} position={[0, 0, 0.027]} />
            </group>
          ))}
          {[-0.08, -0.1].map(y => <Plate key={y} size={[0.13, 0.01, 0.02]} material={dark} position={[0, y, 0.022]} />)}
        </group>
        <Strip size={[0.1, 0.025, 0.012]} material={glow(PALETTE.headlight)} position={[0, -0.06, FACE_Z + 0.006]} />

        {/* The gun at the keel's foot: twin barrels just out of their slot. */}
        <Plate size={[0.2, 0.1, 0.06]} material={black} position={[0, KEEL_Y + 0.12, FACE_Z]} />
        <group ref={gun} position={[0, KEEL_Y + 0.12, FACE_Z - 0.04]}>
          {[-0.05, 0.05].map(x => (
            <group key={x} position={[x, 0, 0]}>
              <Turned profile={[[0.03, 0], [0.03, 0.16]]} segments={8} material={dark} />
              <Turned profile={[[0.036, 0.16], [0.036, 0.2], [0.02, 0.2]]} segments={8} material={black} />
            </group>
          ))}
          <mesh ref={flashRef} position={[0, 0, 0.28]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>

        {/* Rocket clusters on the deck's sides, angled forward and out, once researched. */}
        {rockets && [-1, 1].map(s => (
          <group key={s} position={[s * 0.66, DECK_Y + DECK_H + 0.05, -0.3]} rotation={[-0.12, s * 0.35, 0]}>
            <Plate size={[0.16, 0.08, 0.36]} material={dark} position={[0, -0.02, 0.05]} />
            {TUBES.map(([y, x]) => (
              <Turned key={`${y}${x}`} profile={[[0.05, 0], [0.05, 0.42], [0.06, 0.42], [0.06, 0.46], [0.035, 0.46]]} segments={8} material={composite}
                position={[s * (x - 0.1), 0.06 + y, -0.12]} />
            ))}
          </group>
        ))}

        {/* The four thruster pods under the deck's corners: housing, grab rails, a team marking, a
            jet firing down; round canisters on the front pair. */}
        {PODS.map(([x, z], i) => {
          const s = Math.sign(x);
          return (
            <group key={i} position={[x, DECK_Y, z]} rotation={[0, 0, s * 0.12]}>
              <Prism outline={POD} depth={POD_W} axis="x" material={composite} />
              <Plate size={[0.012, 0.2, 0.18]} material={paint} position={[s * (POD_W / 2 + 0.006), -0.2, 0.02]} />
              <Plate size={[0.014, 0.1, 0.08]} material={black} position={[s * (POD_W / 2 + 0.008), -0.2, 0.02]} />
              <Strip size={[0.012, 0.08, 0.03]} material={glow(PALETTE.warning)} position={[s * (POD_W / 2 + 0.008), -0.05, 0.15]} />
              <group position={[s * (POD_W / 2 + 0.04), -0.6, 0]}>
                {[-0.17, 0.17].map(e => <Plate key={e} size={[0.025, 0.08, 0.025]} material={steel} position={[-s * 0.02, 0.03, e]} />)}
                <Plate size={[0.025, 0.025, 0.38]} material={steel} position={[0, 0, 0]} />
              </group>
              {i < 2 && <Wheel radius={0.12} width={0.07} segments={12} material={housing} position={[-s * (POD_W / 2 + 0.04), -0.18, 0.02]} />}
              <group position={[0, -0.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <Turned profile={[[0.1, 0], [0.11, 0.07], [0.08, 0.09]]} segments={8} material={dark} />
                <Turned profile={[[0.06, 0.07], [0.001, 0.24]]} segments={8} material={exhaust} />
                <Turned profile={[[0.09, 0.07], [0.001, 0.36]]} segments={8} material={glow('#ffd9a0', 0.3)} />
              </group>
            </group>
          );
        })}
      </group>
    </group>
  );
};
