// The Aegis air-defence vehicle, built from the unit kit (components/kit).
//
// Simple but military: an eight-wheeled truck carrying a close-in weapon system. A boxy angular cab
// with dark windows, a grille and a bumper; a raised pedestal mid-deck holding the gun mount; and a
// long rear with a generator housing carrying a big search radar, a wide two-faced panel array
// turning on a tall mast behind the gun. The mount is a yoke that turns, and in it the gun and its
// pod elevate together: a six-barrel rotary cannon under an angular six-sided armoured pod
// (ammunition and fire-control radar) with a dark sensor band, a lens, and a band in team colour.
//
// It moves: the wheels turn while it drives; firing, the mount turns and the gun lifts onto its
// target (`aimOf`, from the CIWS stream in CityMap) and the barrels spin; idle, it sweeps slowly.
//
// Built facing +Z, about 3.7 long in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.5;

// Cab side profile: [forward, up], the top of the front cut back.
const CAB: [number, number][] = [[0.78, 0.55], [0.78, 1.5], [1.32, 1.5], [1.52, 1.3], [1.52, 0.55]];
const CAB_W = 1.36;
const WHEELS_Z = [1.12, 0.56, -1.12, -1.68];
const WHEEL_X = 0.66;
const DECK_Y = 0.8;
const MOUNT = { z: -0.05, y: DECK_Y + 0.32 };
// The pod, a six-sided tower turned on its axis, its top cut in facets.
const POD: [number, number][] = [[0.3, 0], [0.34, 0.12], [0.34, 0.68], [0.24, 0.92], [0.12, 1.0], [0.001, 1.02]];
const BARRELS = 6;
const MAX_PITCH = 1.2;

export const AegisModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  firing?: boolean;
  // Where the gun is shooting, in world space, while it fires.
  aimOf?: () => THREE.Vector3 | undefined;
}> = ({ teamColor, moving, firing, aimOf }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);

  const wheels = useRef<THREE.Group>(null);
  const yaw = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const barrels = useRef<THREE.Group>(null);
  const radar = useRef<THREE.Group>(null);
  const scratch = useMemo(() => ({ v: new THREE.Vector3(), o: new THREE.Vector3() }), []);

  useFrame(({ clock }, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * (firing ? 10 : 2));
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    if (radar.current) radar.current.rotation.y += delta * 1.2;
    if (barrels.current) barrels.current.rotation.z += delta * (firing ? 40 : 0);
    const y = yaw.current, p = pitch.current;
    if (!y || !p || !y.parent) return;
    // Onto the target while firing; otherwise a slow sweep of the sky ahead.
    let wantYaw = Math.sin(clock.elapsedTime * 0.4) * 0.8, wantPitch = 0.35;
    const aim = firing ? aimOf?.() : undefined;
    if (aim) {
      const local = y.parent.worldToLocal(scratch.v.copy(aim)).sub(scratch.o.copy(y.position));
      wantYaw = Math.atan2(local.x, local.z);
      wantPitch = Math.min(MAX_PITCH, Math.max(0, Math.atan2(local.y, Math.hypot(local.x, local.z))));
    }
    let d = wantYaw - y.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    y.rotation.y += d * k;
    p.rotation.x += (-wantPitch - p.rotation.x) * k;
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.2, 4.1]} />
      {/* Eight wheels: tyres on metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.29, z]}>
            <Wheel radius={0.29} width={0.22} segments={12} material={black} />
            <Wheel radius={0.16} width={0.24} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Chassis, deck and fenders; storage boxes between the axles. */}
      <Plate size={[1.0, 0.34, 3.6]} material={dark} position={[0, 0.58, -0.3]} />
      <Plate size={[1.3, 0.06, 2.9]} material={composite} position={[0, DECK_Y - 0.03, -0.72]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.3, 0.05, 1.2]} material={composite} position={[s * WHEEL_X, DECK_Y - 0.06, -1.4]} />
          <Plate size={[0.3, 0.05, 1.1]} material={composite} position={[s * WHEEL_X, DECK_Y - 0.06, 0.84]} />
          <Plate size={[0.26, 0.28, 0.9]} material={armour} position={[s * 0.6, 0.55, -0.3]} />
        </group>
      ))}
      {[-0.42, 0.42].map(x => <Strip key={x} size={[0.1, 0.05, 0.012]} material={glow(PALETTE.warning)} position={[x, 0.62, -2.107]} />)}

      {/* The cab: windscreen, side windows, a grille, headlights, a bumper, team stripes. */}
      <Prism outline={CAB} depth={CAB_W} axis="x" material={armour} />
      <Plate size={[1.16, 0.34, 0.02]} material={black} position={[0, 1.08, 1.525]} />
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.02, 0.3, 0.32]} material={black} position={[s * (CAB_W / 2 + 0.005), 1.2, 1.12]} />
          <group position={[s * (CAB_W / 2 + 0.006), 0.82, 1.12]}>
            {[-0.06, 0.06].map(z => <Plate key={z} size={[0.012, 0.36, 0.06]} material={paint} position={[0, 0, z]} rotation={[-0.35, 0, 0]} />)}
          </group>
          <Plate size={[0.16, 0.1, 0.03]} material={dark} position={[s * 0.5, 0.8, 1.53]} />
          <Strip size={[0.12, 0.06, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.5, 0.8, 1.547]} />
        </group>
      ))}
      {[0.66, 0.72, 0.78, 0.84].map(y => <Plate key={y} size={[0.56, 0.025, 0.02]} material={black} position={[0, y, 1.53]} />)}
      <Plate size={[1.4, 0.16, 0.14]} material={composite} position={[0, 0.5, 1.58]} />
      <Plate size={[0.36, 0.012, 0.3]} material={paint} position={[0, 1.506, 1.0]} />

      {/* Rear: a generator housing with vents, and on it, behind the gun, the search radar: a tall mast
          carrying a wide two-faced panel array that turns. */}
      <Plate size={[1.24, 0.5, 1.2]} material={housing} position={[0, DECK_Y + 0.25, -1.45]} />
      {[-1, 1].map(s => [0.12, 0.2, 0.28].map(dy => (
        <Plate key={`${s}${dy}`} size={[0.012, 0.03, 0.7]} material={black} position={[s * 0.625, DECK_Y + dy, -1.45]} />
      )))}
      <group position={[0, DECK_Y + 0.5, -1.5]}>
        <Plate size={[0.4, 0.12, 0.4]} material={dark} position={[0, 0.06, 0]} />
        <Turned profile={[[0.07, 0.12], [0.07, 0.62], [0.05, 0.62], [0.05, 0.85]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
        <group ref={radar} position={[0, 0.85, 0]}>
          <Turned profile={[[0.16, 0], [0.16, 0.08], [0.1, 0.12]]} segments={8} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
          {[-1, 1].map(f => (
            <group key={f} position={[0, 0.42, f * 0.1]} rotation={[f * 0.2, f > 0 ? 0 : Math.PI, 0]}>
              <Plate size={[1.0, 0.62, 0.06]} material={housing} />
              <Plate size={[0.9, 0.52, 0.02]} material={dark} position={[0, 0, 0.035]} />
              {[-0.15, 0, 0.15].map(y => <Plate key={y} size={[0.86, 0.012, 0.012]} material={black} position={[0, y, 0.05]} />)}
              <Strip size={[0.06, 0.03, 0.012]} material={glow(PALETTE.cyan)} position={[0.38, 0.22, 0.05]} />
            </group>
          ))}
          <Plate size={[0.18, 0.5, 0.16]} material={dark} position={[0, 0.38, 0]} />
        </group>
      </group>

      {/* The gun mount on its pedestal. */}
      <Plate size={[0.86, 0.32, 0.86]} material={armour} position={[0, DECK_Y + 0.16, MOUNT.z]} />
      <group ref={yaw} position={[0, MOUNT.y, MOUNT.z]}>
        <Turned profile={[[0.44, 0], [0.44, 0.1], [0.38, 0.14]]} segments={8} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
        {[-1, 1].map(s => <Plate key={s} size={[0.1, 0.48, 0.34]} material={armour} position={[s * 0.38, 0.36, 0]} />)}
        <group ref={pitch} position={[0, 0.5, 0]}>
          {/* Breech and feed. */}
          <Plate size={[0.48, 0.3, 0.5]} material={dark} position={[0, -0.04, -0.02]} />
          {/* The rotary cannon: six barrels round a hub, a clamp at the muzzle. */}
          <group position={[0, -0.08, 0.24]}>
            <group ref={barrels}>
              {Array.from({ length: BARRELS }, (_, i) => {
                const a = (i / BARRELS) * Math.PI * 2;
                return <Turned key={i} profile={[[0.022, 0], [0.022, 0.95]]} segments={6} material={black} position={[Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0]} />;
              })}
              <Turned profile={[[0.11, 0.62], [0.11, 0.7]]} segments={8} material={steel} />
              <Turned profile={[[0.1, 0.88], [0.1, 0.94]]} segments={8} material={steel} />
            </group>
            <Turned profile={[[0.12, -0.08], [0.12, 0.06]]} segments={8} material={dark} />
          </group>
          {/* The pod: an angular six-sided armoured tower with a sensor band, a lens and team colour. */}
          <group position={[0, 0.1, -0.06]}>
            <Turned profile={POD} segments={6} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[0.345, 0.42], [0.345, 0.54]]} segments={6} material={black} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[0.345, 0.2], [0.345, 0.26]]} segments={6} material={paint} rotation={[-Math.PI / 2, 0, 0]} />
            <Strip size={[0.08, 0.05, 0.02]} material={glow(PALETTE.cyan)} position={[0, 0.48, 0.3]} />
            <Plate size={[0.2, 0.12, 0.1]} material={dark} position={[0, 0.3, 0.33]} />
          </group>
        </group>
      </group>
    </group>
  );
};
