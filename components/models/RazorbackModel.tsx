// The Razorback light armoured car, built from the unit kit (components/kit).
//
// Simple but military: a six-wheeled, lightly armoured patrol car. A long sloped hood behind a
// steel grille guard and a bumper with tow hooks; a faceted armoured cabin with a dark windscreen
// and slit windows; armoured doors with team stripes over running boards; roof rails and a light
// bar; and on the roof a remote weapon station: an anti-personnel machine gun behind a small
// shield, with an ammunition box and a sensor head.
//
// It moves: the wheels turn while it drives; the gun turns to what it is shooting at (`aimRef`) and
// flashes at the muzzle (`flashRef`, lit by Unit.tsx when it fires).
//
// Built facing +Z, about 2.8 long in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.4;
// Lower hull side profile: [forward, up].
const HULL: [number, number][] = [[-1.25, 0.34], [-1.25, 0.72], [1.3, 0.72], [1.46, 0.56], [1.4, 0.42], [1.2, 0.34]];
// Body: a cabin at the back, a raked windscreen, a long sloped hood.
const BODY: [number, number][] = [[-1.25, 0.7], [-1.25, 1.22], [-1.1, 1.3], [0.22, 1.3], [0.72, 0.95], [1.4, 0.84], [1.46, 0.7]];
const BODY_W = 1.3;
const SCREEN = Math.atan2(1.3 - 0.95, 0.72 - 0.22);
const HOOD = Math.atan2(0.95 - 0.84, 1.4 - 0.72);
const WHEELS_Z = [1.0, 0.36, -0.94];
const WHEEL_X = 0.68;
const ROOF_Y = 1.3, GUN_Z = -0.45;

export const RazorbackModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // Where the gun should point, in world space, or null.
  aimRef?: React.MutableRefObject<THREE.Vector3 | null>;
  flashRef?: React.Ref<THREE.Mesh>;
}> = ({ teamColor, moving, aimRef, flashRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);

  const wheels = useRef<THREE.Group>(null);
  const gun = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 7; });
    const g = gun.current;
    if (!g || !g.parent) return;
    let yaw = 0;
    const aim = aimRef?.current;
    if (aim) {
      const local = g.parent.worldToLocal(scratch.copy(aim));
      yaw = Math.atan2(local.x - g.position.x, local.z - g.position.z);
    }
    let d = yaw - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, delta * 6);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.1, 3.1]} />
      {/* Six big wheels: tyres on metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.32, z]}>
            <Wheel radius={0.32} width={0.26} segments={12} material={black} />
            <Wheel radius={0.17} width={0.28} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Hull and body; fenders over the wheels; running boards; armoured doors with stripes. */}
      <Prism outline={HULL} depth={1.12} axis="x" material={dark} />
      <Prism outline={BODY} depth={BODY_W} axis="x" material={armour} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.32, 0.05, 1.02]} material={composite} position={[s * WHEEL_X, 0.7, 0.68]} />
          <Plate size={[0.32, 0.05, 0.56]} material={composite} position={[s * WHEEL_X, 0.7, -0.94]} />
          <Plate size={[0.12, 0.04, 0.7]} material={composite} position={[s * 0.7, 0.62, -0.3]} />
          <Plate size={[0.04, 0.5, 0.86]} material={armour} position={[s * (BODY_W / 2 + 0.02), 0.98, -0.42]} />
          {[-0.42, 0.0].map(z => <Plate key={z} size={[0.012, 0.46, 0.012]} material={dark} position={[s * (BODY_W / 2 + 0.042), 0.98, z]} />)}
          <Plate size={[0.012, 0.03, 0.08]} material={steel} position={[s * (BODY_W / 2 + 0.045), 0.96, -0.12]} />
          {[-0.68, -0.56].map(z => (
            <Plate key={z} size={[0.012, 0.42, 0.06]} material={paint} position={[s * (BODY_W / 2 + 0.042), 0.98, z]} rotation={[-0.35, 0, 0]} />
          ))}
          <Plate size={[0.02, 0.12, 0.5]} material={black} position={[s * (BODY_W / 2 + 0.005), 1.17, -0.6]} />
        </group>
      ))}

      {/* Windscreen, hood vents, grille guard, bumper, tow hooks, lights. */}
      <group position={[0, 1.125, 0.47]} rotation={[SCREEN, 0, 0]}>
        <Plate size={[1.14, 0.02, 0.5]} material={black} />
      </group>
      <group position={[0.3, 0.9, 1.0]} rotation={[HOOD, 0, 0]}>
        {[-0.08, 0, 0.08].map(z => <Plate key={z} size={[0.36, 0.02, 0.04]} material={black} position={[0, 0.006, z]} />)}
      </group>
      <group position={[0, 0.66, 1.5]}>
        <Plate size={[0.9, 0.04, 0.04]} material={steel} position={[0, 0.16, 0]} />
        <Plate size={[0.9, 0.04, 0.04]} material={steel} position={[0, -0.04, 0]} />
        {[-0.36, -0.18, 0, 0.18, 0.36].map(x => <Plate key={x} size={[0.03, 0.24, 0.03]} material={steel} position={[x, 0.06, 0]} />)}
      </group>
      <Plate size={[1.24, 0.14, 0.12]} material={composite} position={[0, 0.44, 1.44]} />
      {[-0.4, 0.4].map(x => <Plate key={x} size={[0.07, 0.08, 0.08]} material={steel} position={[x, 0.36, 1.52]} />)}
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.16, 0.08, 0.04]} material={dark} position={[s * 0.55, 0.72, 1.45]} />
          <Strip size={[0.12, 0.05, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.55, 0.72, 1.472]} />
          <Strip size={[0.06, 0.06, 0.012]} material={glow(PALETTE.warning)} position={[s * 0.5, 1.05, -1.257]} />
        </group>
      ))}

      {/* Roof: rails, a light bar, team colour, an antenna. */}
      {[-1, 1].map(s => <Plate key={s} size={[0.03, 0.05, 1.1]} material={steel} position={[s * 0.56, ROOF_Y + 0.06, -0.55]} />)}
      <Plate size={[0.9, 0.06, 0.1]} material={dark} position={[0, ROOF_Y + 0.03, 0.12]} />
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => <Strip key={x} size={[0.16, 0.04, 0.03]} material={glow(i % 2 ? PALETTE.amber : PALETTE.cyan)} position={[x, ROOF_Y + 0.07, 0.15]} />)}
      <Plate size={[0.4, 0.012, 0.26]} material={paint} position={[0, ROOF_Y + 0.006, -1.0]} />
      <group position={[-0.5, ROOF_Y, -1.1]}>
        <Turned profile={[[0.008, 0], [0.005, 0.55]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
      </group>

      {/* The remote weapon station: a ring, a mount, a sensor head, an ammunition box, a shield
          and the machine gun. */}
      <Turned profile={[[0.32, 0], [0.32, 0.06]]} segments={10} material={black} position={[0, ROOF_Y, GUN_Z]} rotation={[-Math.PI / 2, 0, 0]} />
      <group ref={gun} position={[0, ROOF_Y + 0.06, GUN_Z]} scale={1.35}>
        <Plate size={[0.36, 0.14, 0.4]} material={dark} position={[0, 0.07, 0]} />
        <Plate size={[0.14, 0.12, 0.14]} material={housing} position={[0.18, 0.2, 0.06]} />
        <Strip size={[0.06, 0.04, 0.01]} material={glow(PALETTE.cyan)} position={[0.18, 0.21, 0.135]} />
        <Plate size={[0.12, 0.14, 0.2]} material={composite} position={[-0.2, 0.2, -0.02]} />
        <group position={[0, 0.24, 0]}>
          <Plate size={[0.12, 0.12, 0.42]} material={black} position={[0, 0, 0.02]} />
          <Turned profile={[[0.04, 0.2], [0.04, 0.48]]} segments={8} material={dark} />
          <Turned profile={[[0.018, 0.48], [0.018, 0.86], [0.03, 0.86], [0.03, 0.92]]} segments={8} material={steel} />
          <Plate size={[0.3, 0.2, 0.03]} material={armour} position={[0, 0.01, 0.26]} rotation={[-0.2, 0, 0]} />
          <mesh ref={flashRef} position={[0, 0, 1.0]} visible={false} raycast={() => null}>
            <sphereGeometry args={[0.1, 8, 6]} />
            <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
          </mesh>
        </group>
      </group>
    </group>
  );
};
