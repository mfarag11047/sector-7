// The AA Turret, the base's close-in weapon system, built from the unit kit (components/kit).
//
// The Aegis' gun on a fixed mount, in the base greys: an octagonal armoured plinth with sloped
// sides over a dark skirt, team stripes on four faces, amber running lights at the corners and an
// ammunition hatch at the back; on its deck a turret ring. On the ring, the same gun as the Aegis
// carries: a yoke that turns, and in it the gun and its pod elevating together, a six-barrel
// rotary cannon under an angular six-sided armoured pod with a dark sensor band, a lens, and a band
// in team colour.
//
// It moves: firing, the mount turns and the gun lifts onto its target (`aimOf`, from the CIWS
// stream in CityMap) and the barrels spin; idle, it turns slowly round, scanning the sky.
//
// Built facing +Z, about 2.3 across its skirt and 2.7 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Strip, Turned } from '../kit/shapes';

const SCALE = 5;
// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
// An octagon of radius r, flat faces toward the four sides and the four corners between.
const oct = (r: number): [number, number][] => Array.from({ length: 8 }, (_, k) => {
  const a = k * Math.PI / 4 + Math.PI / 8;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
const SKIRT = { y: 0, h: 0.12, bottom: 1.15, top: 1.06 };
const PLINTH = { y: 0.12, h: 0.38, bottom: 1.06, top: 0.84 };
const DECK_Y = PLINTH.y + PLINTH.h;
const SIDE_TILT = Math.atan2((PLINTH.bottom - PLINTH.top) * Math.cos(Math.PI / 8), PLINTH.h);
const FACE = (PLINTH.bottom + PLINTH.top) / 2 * Math.cos(Math.PI / 8);
const SIDES = [0, 1, 2, 3].map(k => k * Math.PI / 2);
const CORNERS = SIDES.map(a => a + Math.PI / 4);
// The gun, the Aegis' own, a little larger here.
const GUN = 1.3;
const MOUNT_Y = DECK_Y + 0.1;
// The pod, a six-sided tower turned on its axis, its top cut in facets.
const POD: [number, number][] = [[0.3, 0], [0.34, 0.12], [0.34, 0.68], [0.24, 0.92], [0.12, 1.0], [0.001, 1.02]];
const BARRELS = 6;
const MAX_PITCH = 1.2;
const IDLE_PITCH = 0.35;

// The gun's pivot height and the reach from it to the muzzle, in world units.
const PIVOT_Y = (MOUNT_Y + GUN * 0.42) * SCALE;
const REACH = GUN * (0.24 + 0.95) * SCALE;

// Where the muzzle is in the world for a turret standing at `base` (on the ground) aimed at
// `target`, for the tracer stream's origin and flash; with no target, about where it idles.
export const aaTurretMuzzle = (base: { x: number; z: number }, target?: { x: number; y: number; z: number }) => {
  if (!target) return { x: base.x, y: PIVOT_Y + REACH * Math.sin(IDLE_PITCH), z: base.z };
  const dx = target.x - base.x, dz = target.z - base.z, flat = Math.hypot(dx, dz) || 1;
  const pitch = Math.min(MAX_PITCH, Math.max(0, Math.atan2(target.y - PIVOT_Y, flat)));
  const out = REACH * Math.cos(pitch);
  return { x: base.x + dx / flat * out, y: PIVOT_Y + REACH * Math.sin(pitch), z: base.z + dz / flat * out };
};

export const AaTurretModel: React.FC<{
  teamColor: string;
  firing?: boolean;
  // Where the gun is shooting, in world space, while it fires.
  aimOf?: () => THREE.Vector3 | undefined;
}> = ({ teamColor, firing, aimOf }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const steel = kitMaterial('steel'), black = kitMaterial('black'), paint = teamPaint(teamColor);

  const yaw = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const barrels = useRef<THREE.Group>(null);
  const scratch = useMemo(() => ({ v: new THREE.Vector3(), o: new THREE.Vector3() }), []);

  useFrame(({ clock }, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * (firing ? 10 : 2));
    if (barrels.current) barrels.current.rotation.z += delta * (firing ? 40 : 0);
    const y = yaw.current, p = pitch.current;
    if (!y || !p || !y.parent) return;
    // Onto the target while firing; otherwise a slow turn round the sky.
    let wantYaw = clock.elapsedTime * 0.25, wantPitch = IDLE_PITCH;
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
      <ContactShadow size={[2.6, 2.6]} />
      {/* The plinth: a dark skirt, sloped armoured sides, a deck. */}
      <Loft bottom={oct(SKIRT.bottom)} top={oct(SKIRT.top)} height={SKIRT.h} material={dark} position={[0, SKIRT.y, 0]} />
      <Loft bottom={oct(PLINTH.bottom)} top={oct(PLINTH.top)} height={PLINTH.h} material={light} position={[0, PLINTH.y, 0]} />
      <Loft bottom={oct(PLINTH.top)} top={oct(PLINTH.top - 0.03)} height={0.03} material={grey} position={[0, DECK_Y, 0]} />
      {/* Team stripes on the four side faces; amber lights on the corners. */}
      {SIDES.map(a => (
        <group key={a} rotation={[0, a, 0]}>
          <group position={[0, PLINTH.y + PLINTH.h * 0.5, FACE + 0.006]} rotation={[-SIDE_TILT, 0, 0]}>
            {[-0.12, 0.12].map(x => <Plate key={x} size={[0.12, 0.3, 0.01]} material={paint} position={[x, 0, 0]} />)}
            <Plate size={[0.06, 0.3, 0.01]} material={dark} />
          </group>
        </group>
      ))}
      {CORNERS.map(a => (
        <group key={a} rotation={[0, a, 0]}>
          <group position={[0, PLINTH.y + PLINTH.h * 0.78, FACE - 0.03]} rotation={[-SIDE_TILT, 0, 0]}>
            <Strip size={[0.14, 0.035, 0.01]} material={glow(PALETTE.warning)} />
          </group>
        </group>
      ))}
      {/* The ammunition hatch at the back, and the feed running up into the ring. */}
      <Plate size={[0.5, 0.26, 0.14]} material={grey} position={[0, PLINTH.y + 0.15, -FACE + 0.02]} rotation={[SIDE_TILT, 0, 0]} />
      <Plate size={[0.4, 0.18, 0.02]} material={dark} position={[0, PLINTH.y + 0.16, -FACE - 0.05]} rotation={[SIDE_TILT, 0, 0]} />
      <Plate size={[0.16, 0.1, 0.36]} material={dark} position={[0, DECK_Y + 0.05, -0.62]} />

      {/* The turret ring. */}
      <Turned profile={[[0.66, 0], [0.66, 0.08], [0.6, 0.1]]} segments={12} material={dark} rotation={UP} position={[0, DECK_Y, 0]} />

      {/* The gun: the Aegis' mount, yoke, rotary cannon and pod. */}
      <group ref={yaw} position={[0, MOUNT_Y, 0]}>
        <group scale={GUN}>
          <Turned profile={[[0.44, 0], [0.44, 0.1], [0.38, 0.14]]} segments={8} material={grey} rotation={UP} />
          {[-1, 1].map(s => <Plate key={s} size={[0.1, 0.48, 0.34]} material={light} position={[s * 0.38, 0.36, 0]} />)}
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
              <Turned profile={POD} segments={6} material={light} rotation={UP} />
              <Turned profile={[[0.345, 0.42], [0.345, 0.54]]} segments={6} material={black} rotation={UP} />
              <Turned profile={[[0.345, 0.2], [0.345, 0.26]]} segments={6} material={paint} rotation={UP} />
              <Strip size={[0.08, 0.05, 0.02]} material={glow(PALETTE.cyan)} position={[0, 0.48, 0.3]} />
              <Plate size={[0.2, 0.12, 0.1]} material={dark} position={[0, 0.3, 0.33]} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
