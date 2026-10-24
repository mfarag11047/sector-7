// The Hornet gunship, built from the unit kit (components/kit).
//
// Simple but military: an armoured VTOL attack drone. A bulky angular hull with a sloped nose, a
// sensor eye and team colour on top, carried on four thruster pods: armoured housings on short
// arms at the corners, hanging below the hull, each with a downward-facing jet nozzle, grab rails
// and a team marking. Under the nose, the gun bay: a recessed housing with an autocannon that
// turns to what the Hornet is shooting at (`aimRef`) and flashes at the muzzle (`flashRef`). With
// Hunter-Killer Rockets researched, a row of four rocket tubes rides on its back.
//
// It moves: its jets flicker under it, and it bobs and banks gently as it hovers.
//
// Built facing +Z, about 1.7 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 2.4;
// Hull side profile: [forward, up], a sloped nose over the gun bay.
const HULL: [number, number][] = [[-0.8, -0.2], [-0.8, 0.3], [-0.55, 0.46], [0.3, 0.46], [0.75, 0.2], [0.86, -0.02], [0.66, -0.26], [-0.6, -0.28]];
const HULL_W = 0.8;
// A thruster pod, side view: a tall housing, its top front cut back.
const POD: [number, number][] = [[-0.22, -0.56], [-0.22, 0.24], [0.1, 0.24], [0.22, 0.1], [0.22, -0.56]];
const POD_W = 0.32;
// The four pods: [right, forward].
const PODS: [number, number][] = [[-0.66, 0.36], [0.66, 0.36], [-0.66, -0.4], [0.66, -0.4]];
const ROCKETS_X = [-0.27, -0.09, 0.09, 0.27];

export const HornetModel: React.FC<{
  teamColor: string;
  // Hunter-Killer Rockets researched: rocket tubes on its back.
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
    // The gun turns toward its target, else back to the front.
    const g = gun.current;
    if (!g || !g.parent) return;
    let yaw = 0;
    const aim = aimRef?.current;
    if (aim) {
      const local = g.parent.worldToLocal(scratch.copy(aim));
      yaw = Math.max(-1.2, Math.min(1.2, Math.atan2(local.x - g.position.x, local.z - g.position.z)));
    }
    g.rotation.y += (yaw - g.rotation.y) * Math.min(1, delta * 6);
  });

  return (
    <group scale={SCALE}>
      <group ref={body}>
        {/* Hull, spine, sensor eye, antenna, team colour on top. */}
        <Prism outline={HULL} depth={HULL_W} axis="x" material={armour} />
        <Plate size={[0.46, 0.08, 0.74]} material={dark} position={[0, 0.5, -0.2]} />
        <Plate size={[0.32, 0.012, 0.26]} material={paint} position={[0, 0.546, 0.02]} />
        <group position={[0, 0.46, 0.26]}>
          <Turned profile={[[0.1, 0], [0.1, 0.06], [0.06, 0.12], [0.001, 0.13]]} segments={8} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
          <Strip size={[0.06, 0.04, 0.02]} material={glow(PALETTE.cyan)} position={[0, 0.07, 0.09]} />
        </group>
        <group position={[0.3, 0.54, -0.55]}>
          <Turned profile={[[0.008, 0], [0.005, 0.4]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.15, 0, 0]} />
        </group>
        {[-1, 1].map(s => [0.15, 0.27].map(z => (
          <Plate key={`${s}${z}`} size={[0.012, 0.36, 0.06]} material={paint} position={[s * (HULL_W / 2 + 0.006), 0.1, z]} rotation={[-0.35, 0, 0]} />
        )))}

        {/* Rocket tubes on its back, once researched: a row of four on a base. */}
        {rockets && (
          <group position={[0, 0.54, -0.42]}>
            <Plate size={[0.72, 0.08, 0.3]} material={dark} position={[0, 0.04, 0]} />
            {ROCKETS_X.map(x => (
              <group key={x} position={[x, 0.15, -0.05]}>
                <Turned profile={[[0.075, 0], [0.075, 0.4], [0.045, 0.4], [0.045, 0.37]]} segments={8} material={composite} />
                <Plate size={[0.05, 0.02, 0.2]} material={steel} position={[0, -0.08, 0.15]} />
              </group>
            ))}
          </group>
        )}

        {/* The four thruster pods: an arm, the housing, grab rails, a team marking, and a jet
            nozzle firing down. */}
        {PODS.map(([x, z], i) => {
          const s = Math.sign(x);
          return (
            <group key={i}>
              <Plate size={[0.24, 0.16, 0.24]} material={dark} position={[s * (HULL_W / 2 + 0.06), 0.06, z]} />
              <group position={[x, 0, z]}>
                <Prism outline={POD} depth={POD_W} axis="x" material={composite} />
                <Plate size={[0.012, 0.22, 0.2]} material={paint} position={[s * (POD_W / 2 + 0.006), 0.0, 0]} />
                <Plate size={[0.014, 0.12, 0.1]} material={black} position={[s * (POD_W / 2 + 0.008), 0.0, 0]} />
                {[-0.42, 0.18].map(y => <Plate key={y} size={[0.03, 0.025, 0.36]} material={steel} position={[s * (POD_W / 2 + 0.03), y, 0]} />)}
                <Strip size={[0.03, 0.06, 0.012]} material={glow(PALETTE.warning)} position={[s * 0.1, 0.12, 0.225]} />
                <group position={[0, -0.56, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <Turned profile={[[0.12, 0], [0.13, 0.08], [0.1, 0.1]]} segments={8} material={dark} />
                  <Turned profile={[[0.001, 0.06], [0.09, 0.06]]} segments={8} material={exhaust} />
                  <Turned profile={[[0.06, 0.07], [0.001, 0.26]]} segments={8} material={exhaust} />
                  <Turned profile={[[0.1, 0.07], [0.001, 0.38]]} segments={8} material={glow('#ffd9a0', 0.3)} />
                </group>
              </group>
            </group>
          );
        })}

        {/* The gun bay under the nose: a recessed housing and a turning autocannon. */}
        <Plate size={[0.42, 0.14, 0.4]} material={black} position={[0, -0.24, 0.48]} />
        <group ref={gun} position={[0, -0.3, 0.52]}>
          <Plate size={[0.22, 0.14, 0.24]} material={dark} />
          <Turned profile={[[0.035, 0.1], [0.035, 0.62]]} segments={8} material={steel} />
          <Turned profile={[[0.05, 0.6], [0.05, 0.7]]} segments={8} material={dark} />
          <mesh ref={flashRef} position={[0, 0, 0.8]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
