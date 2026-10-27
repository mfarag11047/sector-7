// The Sentry Turret, the base's ground defence, built from the unit kit (components/kit).
//
// Simple but military: a railgun on a heavy cradle, up on a gun tower so it fires down over the
// base wall rather than through it. The tower is a tapered octagonal concrete shaft with panel
// seams, an armoured door and a ladder on the side facing into the base, flaring out at the top
// into a collar under a cantilevered deck with a railing and downlights. On the deck, an octagonal plinth with sloped sides over a
// dark skirt, team stripes on four faces and amber lights at the corners; on its deck a turret
// ring carrying a turntable with two braced side brackets. Between the brackets, on trunnions, a
// chunky angular receiver with a power block at the back, and out of its front the railgun: a dark
// shroud, then two bare rails with the charging slot lit between them, held by clamp bands, and a
// blunt muzzle block. On the left a six-sided capacitor pack with four cell ends at the front; on
// the right a sensor box with two lenses. On top, the sensor array: a mast with a gimbal sensor
// head that turns on its own, a small radome and a whip antenna.
//
// It moves: it turns and lifts the gun onto its target (`aimOf`); idle, it sweeps slowly about
// the way it faces. The slot and the capacitor cells charge up between shots, and when it fires
// (`lastFiredAt`) the barrel kicks back and the cells flash.
//
// Built facing +Z, about 4.1 across its deck and 5.7 tall in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Prism, Strip, Turned } from '../kit/shapes';

const SCALE = 2.4;
// Upright: the kit's turned parts point along +Z; this turns +Z to +Y. ACROSS turns it to +X.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const ACROSS: [number, number, number] = [0, Math.PI / 2, 0];
// An octagon of radius r, flat faces toward the four sides and the four corners between.
const oct = (r: number): [number, number][] => Array.from({ length: 8 }, (_, k) => {
  const a = k * Math.PI / 4 + Math.PI / 8;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
// The gun tower: its foot, the shaft, the collar flaring out under the deck, the deck. Everything
// above sits on the deck, RISE up.
const RISE = 3.4;
const FOOT = { h: 0.14, bottom: 1.8, top: 1.62 };
const SHAFT = { y: FOOT.h, bottom: 1.55, top: 1.22 };
const COLLAR = { h: 0.32, top: 1.95 };
const DECK = { h: 0.18, r: 2.08 };
const SHAFT_H = RISE - DECK.h - COLLAR.h - SHAFT.y;
const SHAFT_TILT = Math.atan2((SHAFT.bottom - SHAFT.top) * Math.cos(Math.PI / 8), SHAFT_H);
const SHAFT_FACE = (SHAFT.bottom + SHAFT.top) / 2 * Math.cos(Math.PI / 8);
// The railing round the deck: a post at each corner, rails along each side.
const RAIL_R = 2.0;
const RAIL_SIDE = 2 * RAIL_R * Math.sin(Math.PI / 8);
const SKIRT = { y: 0, h: 0.1, bottom: 1.9, top: 1.8 };
const PLINTH = { y: 0.1, h: 0.22, bottom: 1.8, top: 1.62 };
const DECK_Y = PLINTH.y + PLINTH.h;
const SIDE_TILT = Math.atan2((PLINTH.bottom - PLINTH.top) * Math.cos(Math.PI / 8), PLINTH.h);
const FACE = (PLINTH.bottom + PLINTH.top) / 2 * Math.cos(Math.PI / 8);
const SIDES = [0, 1, 2, 3].map(k => k * Math.PI / 2);
const CORNERS = SIDES.map(a => a + Math.PI / 4);
// The turntable on the ring, and the trunnions the gun pitches on, above it.
const YAW_Y = DECK_Y + 0.13;
const TRUNNION_Y = 1.0;
// A bracket's side outline, [forward, up], and the cut-out through it.
const BRACKET: [number, number][] = [[-0.75, 0.12], [0.75, 0.12], [0.32, 1.06], [-0.32, 1.06]];
const BRACKET_CUT: [number, number][] = [[-0.42, 0.26], [0.42, 0.26], [0, 0.78]];
const BRACKET_X = 0.62;
// The receiver, a block whose sides and ends slope in to its top: outlines [x, forward].
const RECEIVER_BOTTOM: [number, number][] = [[-0.5, -1.0], [0.5, -1.0], [0.5, 0.85], [-0.5, 0.85]];
const RECEIVER_TOP: [number, number][] = [[-0.4, -0.9], [0.4, -0.9], [0.4, 0.7], [-0.4, 0.7]];
const RECEIVER = { y: -0.28, h: 0.62 };
const RECEIVER_TOP_Y = RECEIVER.y + RECEIVER.h;
// The railgun, out of the receiver's front: shroud, rails, muzzle.
const BARREL_Z = 0.85;
const SHROUD = 1.6;
const RAILS = 1.5;
const MUZZLE_Z = SHROUD + RAILS + 0.22;
const RECOIL = 0.32;
const RECOIL_MS = 350;
// From up on its tower it can look well down onto ground targets just outside the wall.
const MIN_PITCH = -0.65, MAX_PITCH = 0.45;
// The capacitor cells' and the charging slot's light, dim to full.
const CHARGE = new THREE.Color('#22d3ee');
const FLASH = new THREE.Color('#f0fdff');

// Where the muzzle is in the world for a turret standing at `base` (on the ground) aimed at
// `target`, for the railgun shot's origin.
const PIVOT_Y = (RISE + YAW_Y + TRUNNION_Y) * SCALE;
const REACH = (BARREL_Z + MUZZLE_Z) * SCALE;
export const sentryMuzzle = (base: { x: number; z: number }, target: { x: number; y: number; z: number }) => {
  const dx = target.x - base.x, dz = target.z - base.z, flat = Math.hypot(dx, dz) || 1;
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.atan2(target.y - PIVOT_Y, flat)));
  const out = REACH * Math.cos(pitch);
  return { x: base.x + dx / flat * out, y: PIVOT_Y + REACH * Math.sin(pitch), z: base.z + dz / flat * out };
};

export const SentryTurretModel: React.FC<{
  teamColor: string;
  // Where its target is, in world space, while it has one.
  aimOf?: () => THREE.Vector3 | undefined;
  // When it last fired (Date.now()), and how long it takes to recharge.
  lastFiredAt?: number;
  cooldownMs?: number;
}> = ({ teamColor, aimOf, lastFiredAt = 0, cooldownMs = 1500 }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const steel = kitMaterial('steel'), black = kitMaterial('black'), paint = teamPaint(teamColor);
  const charge = useMemo(() => own(glow(PALETTE.cyan)), []);
  useEffect(() => () => charge.dispose(), [charge]);

  const yaw = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const barrel = useRef<THREE.Group>(null);
  const gimbal = useRef<THREE.Group>(null);
  const scratch = useMemo(() => ({ v: new THREE.Vector3(), o: new THREE.Vector3() }), []);

  useFrame(({ clock }, delta) => {
    const ago = Date.now() - lastFiredAt;
    // The barrel kicks back as it fires and runs out again.
    const kick = Math.max(0, 1 - ago / RECOIL_MS);
    if (barrel.current) barrel.current.position.z = BARREL_Z - RECOIL * kick * kick;
    // Cells and slot charge up between shots, and flash white as it fires.
    const level = Math.min(1, ago / cooldownMs);
    charge.color.copy(CHARGE).multiplyScalar(0.25 + 0.95 * level);
    if (ago < 120) charge.color.lerp(FLASH, 1 - ago / 120).multiplyScalar(1.4);
    if (gimbal.current) gimbal.current.rotation.y += delta * 0.9;

    const y = yaw.current, p = pitch.current;
    if (!y || !p || !y.parent) return;
    const aim = aimOf?.();
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * (aim ? 8 : 1.5));
    // Onto the target; otherwise a slow sweep about the way it faces.
    let wantYaw = Math.sin(clock.elapsedTime * 0.35) * 0.9, wantPitch = 0;
    if (aim) {
      const local = y.parent.worldToLocal(scratch.v.copy(aim)).sub(scratch.o.copy(y.position));
      wantYaw = Math.atan2(local.x, local.z);
      wantPitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, Math.atan2(local.y - TRUNNION_Y, Math.hypot(local.x, local.z))));
    }
    let d = wantYaw - y.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    y.rotation.y += d * k;
    p.rotation.x += (-wantPitch - p.rotation.x) * k;
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[4.2, 4.2]} />
      {/* The gun tower: a foot, the tapered shaft with panel seams, a collar, the deck and its railing. */}
      <Loft bottom={oct(FOOT.bottom)} top={oct(FOOT.top)} height={FOOT.h} material={dark} />
      <Loft bottom={oct(SHAFT.bottom)} top={oct(SHAFT.top)} height={SHAFT_H} material={light} position={[0, SHAFT.y, 0]} />
      <Loft bottom={oct(SHAFT.top)} top={oct(COLLAR.top)} height={COLLAR.h} material={grey} position={[0, SHAFT.y + SHAFT_H, 0]} />
      <Loft bottom={oct(DECK.r)} top={oct(DECK.r)} height={DECK.h} material={dark} position={[0, RISE - DECK.h, 0]} />
      {[...SIDES, ...CORNERS].map(a => (
        <group key={a} rotation={[0, a, 0]}>
          {/* Seams up the shaft's faces; downlights under the collar; the railing. */}
          <group position={[0, SHAFT.y + SHAFT_H / 2, SHAFT_FACE + 0.006]} rotation={[-SHAFT_TILT, 0, 0]}>
            <Plate size={[0.03, SHAFT_H - 0.3, 0.01]} material={black} />
          </group>
          <Strip size={[0.3, 0.05, 0.02]} material={glow('#eaf4ff')} position={[0, SHAFT.y + SHAFT_H - 0.08, SHAFT.top * Math.cos(Math.PI / 8) + 0.02]} />
          <Plate size={[0.05, 0.36, 0.05]} material={grey} position={[RAIL_SIDE / 2, RISE + 0.18, RAIL_R * Math.cos(Math.PI / 8)]} />
          <Plate size={[RAIL_SIDE, 0.04, 0.04]} material={grey} position={[0, RISE + 0.34, RAIL_R * Math.cos(Math.PI / 8)]} />
          <Plate size={[RAIL_SIDE, 0.03, 0.03]} material={grey} position={[0, RISE + 0.18, RAIL_R * Math.cos(Math.PI / 8)]} />
        </group>
      ))}
      {/* Team stripes high on the four side faces of the shaft. */}
      {SIDES.map(a => (
        <group key={a} rotation={[0, a, 0]}>
          <group position={[0, SHAFT.y + SHAFT_H * 0.78, SHAFT_FACE - (SHAFT.bottom - SHAFT.top) * 0.28 * Math.cos(Math.PI / 8) + 0.008]} rotation={[-SHAFT_TILT, 0, 0]}>
            {[-0.24, 0.24].map(x => <Plate key={x} size={[0.18, 0.5, 0.01]} material={paint} position={[x, 0, 0]} />)}
          </group>
        </group>
      ))}
      {/* An armoured door and a ladder up the side facing into the base. */}
      <group rotation={[0, Math.PI, 0]}>
        <group position={[0, SHAFT.y + 0.45, SHAFT.bottom * Math.cos(Math.PI / 8) - 0.04]} rotation={[-SHAFT_TILT, 0, 0]}>
          <Plate size={[0.62, 0.9, 0.06]} material={dark} />
          <Plate size={[0.5, 0.03, 0.07]} material={black} position={[0, 0.2, 0]} />
          <Strip size={[0.08, 0.05, 0.02]} material={glow(PALETTE.warning)} position={[0, 0.52, 0.03]} />
        </group>
        <group position={[0.62, SHAFT.y + SHAFT_H / 2 + 0.2, SHAFT_FACE + 0.12]} rotation={[-SHAFT_TILT, 0, 0]}>
          {[-0.14, 0.14].map(x => <Plate key={x} size={[0.04, SHAFT_H + 0.4, 0.04]} material={steel} position={[x, 0, 0]} />)}
          {Array.from({ length: 9 }, (_, i) => <Plate key={i} size={[0.28, 0.03, 0.03]} material={steel} position={[0, -SHAFT_H / 2 + 0.2 + i * (SHAFT_H / 9), 0]} />)}
        </group>
      </group>

      <group position={[0, RISE, 0]}>
        {/* The plinth: a dark skirt, sloped armoured sides, a deck. */}
        <Loft bottom={oct(SKIRT.bottom)} top={oct(SKIRT.top)} height={SKIRT.h} material={dark} position={[0, SKIRT.y, 0]} />
        <Loft bottom={oct(PLINTH.bottom)} top={oct(PLINTH.top)} height={PLINTH.h} material={light} position={[0, PLINTH.y, 0]} />
        <Loft bottom={oct(PLINTH.top)} top={oct(PLINTH.top - 0.03)} height={0.02} material={grey} position={[0, DECK_Y, 0]} />
        {/* Team stripes on the four side faces; amber lights on the corners. */}
        {SIDES.map(a => (
          <group key={a} rotation={[0, a, 0]}>
            <group position={[0, PLINTH.y + PLINTH.h * 0.5, FACE + 0.006]} rotation={[-SIDE_TILT, 0, 0]}>
              {[-0.2, 0.2].map(x => <Plate key={x} size={[0.24, 0.14, 0.01]} material={paint} position={[x, 0, 0]} />)}
              <Plate size={[0.1, 0.14, 0.01]} material={dark} />
            </group>
          </group>
        ))}
        {CORNERS.map(a => (
          <group key={a} rotation={[0, a, 0]}>
            <group position={[0, PLINTH.y + PLINTH.h * 0.6, FACE + 0.006]} rotation={[-SIDE_TILT, 0, 0]}>
              <Strip size={[0.2, 0.04, 0.01]} material={glow(PALETTE.warning)} />
            </group>
          </group>
        ))}
        {/* The turret ring. */}
        <Turned profile={[[1.0, 0], [1.0, 0.1], [0.92, 0.13]]} segments={16} material={dark} rotation={UP} position={[0, DECK_Y, 0]} />

        <group ref={yaw} position={[0, YAW_Y, 0]}>
          {/* The turntable and its two braced brackets on foot plates. */}
          <Plate size={[1.7, 0.12, 1.5]} material={grey} position={[0, 0.06, 0]} />
          {[-1, 1].map(s => (
            <group key={s} position={[s * BRACKET_X, 0, 0]}>
              <Plate size={[0.34, 0.06, 1.7]} material={dark} position={[0, 0.15, 0]} />
              <Prism outline={BRACKET} depth={0.14} axis="x" material={grey} />
              <Prism outline={BRACKET_CUT} depth={0.18} axis="x" material={black} />
            </group>
          ))}
          <Turned profile={[[0.14, -0.74], [0.14, 0.74]]} segments={8} material={steel} rotation={ACROSS} position={[0, TRUNNION_Y, 0]} />

          <group ref={pitch} position={[0, TRUNNION_Y, 0]}>
            {/* The receiver, its top deck with team stripes, and the power block behind. */}
            <Loft bottom={RECEIVER_BOTTOM} top={RECEIVER_TOP} height={RECEIVER.h} material={light} position={[0, RECEIVER.y, 0]} />
            <Plate size={[0.66, 0.04, 1.3]} material={grey} position={[0, RECEIVER_TOP_Y + 0.02, -0.05]} />
            {[-0.24, 0.24].map(x => <Plate key={x} size={[0.07, 0.012, 0.8]} material={paint} position={[x, RECEIVER_TOP_Y + 0.045, 0.05]} />)}
            <Plate size={[0.8, 0.46, 0.34]} material={dark} position={[0, 0.02, -1.15]} />
            {[-0.1, 0, 0.1].map(y => <Plate key={y} size={[0.6, 0.03, 0.012]} material={black} position={[0, 0.02 + y, -1.325]} />)}

            {/* The railgun: a shroud, then the twin rails with the charging slot between, clamp
                bands, and the muzzle block. It kicks back as it fires. */}
            <group ref={barrel} position={[0, 0, BARREL_Z]}>
              <Plate size={[0.6, 0.5, SHROUD]} material={dark} position={[0, 0, SHROUD / 2]} />
              {[-1, 1].map(s => <Plate key={s} size={[0.012, 0.16, SHROUD - 0.3]} material={black} position={[s * 0.305, 0.06, SHROUD / 2]} />)}
              <Plate size={[0.3, 0.012, 0.5]} material={grey} position={[0, 0.256, 0.4]} />
              {[-1, 1].map(s => <Plate key={s} size={[0.13, 0.36, RAILS]} material={grey} position={[s * 0.16, 0, SHROUD + RAILS / 2]} />)}
              <Strip size={[0.1, 0.14, RAILS - 0.04]} material={charge} position={[0, 0, SHROUD + RAILS / 2]} />
              {[0.35, 0.85, 1.3].map(z => <Plate key={z} size={[0.5, 0.44, 0.08]} material={dark} position={[0, 0, SHROUD + z]} />)}
              <Plate size={[0.62, 0.54, 0.22]} material={dark} position={[0, 0, MUZZLE_Z - 0.11]} />
              <Plate size={[0.22, 0.3, 0.02]} material={black} position={[0, 0, MUZZLE_Z + 0.005]} />
              {[-1, 1].map(s => <Strip key={s} size={[0.06, 0.04, 0.012]} material={glow(PALETTE.warning)} position={[s * 0.22, 0.2, MUZZLE_Z + 0.01]} />)}
            </group>

            {/* The capacitor pack on the left, on an arm, four cells at its front. */}
            <Plate size={[0.4, 0.16, 0.5]} material={grey} position={[-0.72, 0.16, 0]} />
            <group position={[-1.06, 0.12, -0.6]}>
              <Turned profile={[[0.34, 0], [0.34, 1.2]]} segments={6} material={light} rotation={[0, 0, Math.PI / 6]} />
              <Turned profile={[[0.345, 0.15], [0.345, 0.22]]} segments={6} material={paint} rotation={[0, 0, Math.PI / 6]} />
              {[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([i, j]) => (
                <group key={`${i}${j}`} position={[i * 0.12, j * 0.12, 1.2]}>
                  <Turned profile={[[0.095, 0], [0.095, 0.03]]} segments={10} material={black} />
                  <Turned profile={[[0.05, 0], [0.05, 0.04]]} segments={10} material={charge} />
                </group>
              ))}
            </group>

            {/* The sensor box on the right, two lenses in its dark face. */}
            <group position={[0.76, 0.28, -0.3]}>
              <Plate size={[0.4, 0.46, 0.7]} material={light} />
              <Plate size={[0.34, 0.4, 0.02]} material={black} position={[0, 0, 0.355]} />
              {[0.1, -0.1].map(y => (
                <group key={y} position={[0, y, 0.36]}>
                  <Turned profile={[[0.08, 0], [0.08, 0.03]]} segments={10} material={dark} />
                  <Turned profile={[[0.045, 0], [0.045, 0.04]]} segments={10} material={glow('#8b7cff')} />
                </group>
              ))}
            </group>

            {/* The sensor array on top: a gimbal sensor head on a mast, a radome, a whip antenna. */}
            <group position={[-0.2, RECEIVER_TOP_Y + 0.04, -0.55]}>
              <Turned profile={[[0.08, 0], [0.08, 0.36]]} segments={8} material={dark} rotation={UP} />
              <group ref={gimbal} position={[0, 0.36, 0]} scale={1.35}>
                <Turned profile={[[0.001, 0], [0.15, 0.02], [0.17, 0.1], [0.17, 0.38], [0.12, 0.48], [0.001, 0.5]]} segments={12} material={light} rotation={UP} />
                <Turned profile={[[0.174, 0.2], [0.174, 0.32]]} segments={12} material={black} rotation={UP} />
                <Strip size={[0.09, 0.07, 0.02]} material={glow(PALETTE.cyan)} position={[0, 0.26, 0.17]} />
              </group>
            </group>
            <Turned profile={[[0.2, 0], [0.18, 0.08], [0.12, 0.15], [0.001, 0.18]]} segments={12} material={grey} rotation={UP} position={[0.18, RECEIVER_TOP_Y + 0.04, -0.3]} />
            <Turned profile={[[0.015, 0], [0.015, 0.55]]} segments={4} material={steel} rotation={UP} position={[0.3, RECEIVER_TOP_Y + 0.04, -0.8]} />
          </group>
        </group>
      </group>
    </group>
  );
};
