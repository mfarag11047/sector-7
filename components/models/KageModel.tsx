// Kage, Shadow Ops' hero (sim/shadowHero.ts), built from the unit kit (components/kit).
//
// A cloaking assassin: lean and quick, in a black undersuit under close-fitting dark plates, not
// the line infantry's bulky olive armour. Segmented plates over the chest and abdomen, narrow
// shoulder guards painted in team colour, a team-colour sash at the waist with its tails hanging
// behind, armoured shins and split-toe boots. Red tags on the chest and shoulder. A close helmet
// with a black faceplate and the four-lens night-vision rig that names him, its lenses glowing
// green. On his back, the empty scabbard; in his left hand, the black katana with a bright edge.
//
// It moves, posed limb by limb: standing, a low sword stance, knees bent, blade angled forward,
// breathing; running, leaning into it with the blade trailing behind; each cut (`lastAttackTime`)
// a slash, wind-up over the right shoulder and a sweep down across to the left; dead (`dead`,
// from `diedAt`), he drops to his knees and falls forward (components/FallenUnits.tsx keeps him
// on the ground a while).
//
// Built facing +Z, about 1 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, smoothMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Strip, Turned } from '../kit/shapes';

type V3 = [number, number, number];
type Outline = [number, number][];
// A head taller than the line infantry, and leaner.
const SCALE = 4.9;
const HIP_Y = 0.5, HIP_X = 0.062;
const THIGH = 0.235, SHIN = 0.225;
const UPPER = 0.17, FORE = 0.16;
const SHOULDER_Y = 0.79, SHOULDER_X = 0.145;
const DOWN: V3 = [Math.PI / 2, 0, 0];
const UP: V3 = [-Math.PI / 2, 0, 0];
const ATTACK_MS = 800;
const FALL_MS = 1100;
// Red tags.
const TAG = '#ff3b3b';

// The chest plates, top views [right, forward]: the waist, the chest, the shoulders.
const WAIST: Outline = [[-0.07, -0.06], [0.07, -0.06], [0.09, -0.02], [0.085, 0.045], [0.045, 0.07], [-0.045, 0.07], [-0.085, 0.045], [-0.09, -0.02]];
const CHEST: Outline = [[-0.095, -0.075], [0.095, -0.075], [0.125, -0.025], [0.12, 0.05], [0.06, 0.088], [-0.06, 0.088], [-0.12, 0.05], [-0.125, -0.025]];
const COLLAR: Outline = [[-0.07, -0.06], [0.07, -0.06], [0.1, -0.02], [0.095, 0.04], [0.05, 0.065], [-0.05, 0.065], [-0.095, 0.04], [-0.1, -0.02]];
// The helmet: rim, brow, crown.
const HELM_RIM: Outline = [[-0.05, -0.07], [0.05, -0.07], [0.07, -0.035], [0.07, 0.04], [0.045, 0.075], [-0.045, 0.075], [-0.07, 0.04], [-0.07, -0.035]];
const HELM_BROW: Outline = [[-0.055, -0.08], [0.055, -0.08], [0.078, -0.035], [0.076, 0.045], [0.05, 0.085], [-0.05, 0.085], [-0.076, 0.045], [-0.078, -0.035]];
const HELM_CROWN: Outline = [[-0.04, -0.06], [0.04, -0.06], [0.055, -0.025], [0.052, 0.03], [0.03, 0.055], [-0.03, 0.055], [-0.052, 0.03], [-0.055, -0.025]];
const HELM_Y = 0.85, BROW_Y = 0.93, CROWN_Y = 0.975;

// A pose, limb by limb: each shoulder's rotation, each elbow's bend, the sword hand's turn, and the
// torso's twist (y) and lean (x).
interface Pose { ls: V3; le: number; lh: V3; rs: V3; re: number; twist: number; lean: number }
const STANCE: Pose = { ls: [-0.55, 0, 0.3], le: -0.95, lh: [0.75, 0, 0], rs: [-0.45, 0, -0.25], re: -1.15, twist: 0.15, lean: 0.08 };
const RUN: Pose = { ls: [0.55, 0, 0.15], le: -0.35, lh: [2.0, 0, 0], rs: [-0.3, 0, -0.1], re: -1.3, twist: 0, lean: 0.32 };
const WIND: Pose = { ls: [-2.5, 0, -0.55], le: -1.0, lh: [1.3, 0, 0], rs: [-0.7, 0, -0.35], re: -1.4, twist: -0.45, lean: 0.05 };
const CUT: Pose = { ls: [-0.9, 0, 0.75], le: -0.15, lh: [0.6, 0, 0], rs: [-0.3, 0, -0.5], re: -0.9, twist: 0.45, lean: 0.22 };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const blend = (a: Pose, b: Pose, t: number): Pose => ({
  ls: mix3(a.ls, b.ls, t), le: mix(a.le, b.le, t), lh: mix3(a.lh, b.lh, t),
  rs: mix3(a.rs, b.rs, t), re: mix(a.re, b.re, t), twist: mix(a.twist, b.twist, t), lean: mix(a.lean, b.lean, t),
});
const ease = (t: number) => t * t * (3 - 2 * t);
// Where the slash is at `k` (0 to 1 over a cut): up to the wind-up, the sweep down, then back.
function slash(base: Pose, k: number): Pose {
  if (k < 0.3) return blend(base, WIND, ease(k / 0.3));
  if (k < 0.5) return blend(WIND, CUT, ease((k - 0.3) / 0.2));
  return blend(CUT, base, ease((k - 0.5) / 0.5));
}

// A tapered limb from one point to another.
const Segment: React.FC<{ from: V3; to: V3; r: [number, number]; material: THREE.Material; segments?: number }> = ({ from, to, r, material, segments = 10 }) => {
  const { q, len } = useMemo(() => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    return { len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()) };
  }, [from, to]);
  return (
    <group position={from} quaternion={q}>
      <Turned profile={[[r[0] * 0.85, 0], [r[0], len * 0.15], [r[1], len * 0.85], [r[1] * 0.85, len]]} segments={segments} material={material} />
    </group>
  );
};

// The katana, from the fist along +Z: a wrapped grip and pommel, a round guard, and the long,
// slightly curved black blade with a bright edge along its underside.
const Katana: React.FC = () => {
  const black = kitMaterial('black'), steel = kitMaterial('steel'), dark = kitMaterial('structDark');
  const edge = glow('#d7e4ee');
  return (
    <group>
      <Turned profile={[[0.012, -0.09], [0.014, -0.08], [0.013, 0.04]]} segments={6} material={dark} />
      <Turned profile={[[0.016, -0.1], [0.016, -0.09]]} segments={6} material={steel} />
      <Turned profile={[[0.03, 0.04], [0.03, 0.05]]} segments={10} material={black} />
      <Plate size={[0.012, 0.03, 0.03]} material={steel} position={[0, 0, 0.058]} />
      {/* The blade in two lengths, the outer one curving up a little toward the tip. */}
      <Plate size={[0.007, 0.026, 0.25]} material={black} position={[0, 0, 0.19]} />
      <Strip size={[0.0075, 0.004, 0.25]} material={edge} position={[0, -0.013, 0.19]} />
      <group position={[0, 0, 0.312]} rotation={[-0.08, 0, 0]}>
        <Plate size={[0.007, 0.024, 0.2]} material={black} position={[0, 0, 0.1]} />
        <Strip size={[0.0075, 0.004, 0.19]} material={edge} position={[0, -0.012, 0.095]} />
        <Plate size={[0.007, 0.016, 0.03]} material={black} position={[0, -0.004, 0.21]} rotation={[0.5, 0, 0]} />
      </group>
    </group>
  );
};

export const KageModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  lastAttackTime?: number;
  dead?: boolean;
  diedAt?: number;
}> = ({ teamColor, moving, lastAttackTime, dead, diedAt }) => {
  const suit = smoothMaterial('black'), glove = smoothMaterial('structDark');
  const plate = kitMaterial('structDark'), grey = kitMaterial('structGrey'), black = kitMaterial('black'), steel = kitMaterial('steel');
  const paint = teamPaint(teamColor);
  const lens = glow(PALETTE.green), tag = glow(TAG);

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const shoulders = useRef<(THREE.Group | null)[]>([]);
  const elbows = useRef<(THREE.Group | null)[]>([]);
  const hand = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const shins = useRef<(THREE.Group | null)[]>([]);
  const sash = useRef<THREE.Group>(null);
  const state = useMemo(() => ({ run: 0, stride: 0, t: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05), now = Date.now();
    state.t += dt;
    state.run += ((moving && !dead ? 1 : 0) - state.run) * (1 - Math.exp(-dt * 8));
    state.stride += dt * 11 * state.run;

    // The pose: the stance or the run, a slash over either on each cut.
    let pose = blend(STANCE, RUN, state.run);
    const k = lastAttackTime !== undefined && !dead ? (now - lastAttackTime) / ATTACK_MS : 1;
    if (k >= 0 && k < 1) pose = slash(pose, k);
    // The run swings the free arm; standing, he breathes.
    const swing = Math.sin(state.stride) * state.run;
    const breath = Math.sin(state.t * 1.8) * (1 - state.run);
    const s0 = shoulders.current[0], s1 = shoulders.current[1], e0 = elbows.current[0], e1 = elbows.current[1];
    if (s0) s0.rotation.set(pose.ls[0], pose.ls[1], pose.ls[2]);
    if (s1) s1.rotation.set(pose.rs[0] - swing * 0.6, pose.rs[1], pose.rs[2]);
    if (e0) e0.rotation.x = pose.le;
    if (e1) e1.rotation.x = pose.re;
    if (hand.current) hand.current.rotation.set(pose.lh[0], pose.lh[1], pose.lh[2]);
    if (torso.current) {
      torso.current.rotation.set(pose.lean + breath * 0.015, pose.twist + swing * 0.12, 0);
    }
    if (sash.current) sash.current.rotation.x = 0.15 + 0.5 * state.run + Math.sin(state.stride * 2) * 0.12 * state.run;

    // Legs: a low stance, knees bent and feet apart; running, a long quick stride.
    const crouch = 1 - state.run;
    [0, 1].forEach(i => {
      const s = state.stride + i * Math.PI;
      const side = i === 0 ? 1 : -1;
      const leg = legs.current[i], shin = shins.current[i];
      if (leg) leg.rotation.set(Math.sin(s) * 0.75 * state.run - 0.35 * crouch * (i === 0 ? 1 : 0.4), 0, side * 0.12 * crouch);
      if (shin) shin.rotation.x = (0.1 + 0.95 * Math.max(0, Math.sin(s + 1.2))) * state.run + 0.5 * crouch;
    });
    if (hips.current) hips.current.position.y = Math.abs(Math.sin(state.stride)) * 0.02 * state.run - 0.035 * crouch;

    // Dead: down on his knees, then forward onto his front.
    if (root.current) {
      const f = dead ? Math.min(1, (now - (diedAt ?? now - FALL_MS)) / FALL_MS) : 0;
      root.current.rotation.x = 1.45 * ease(Math.max(0, (f - 0.25) / 0.75));
      root.current.position.y = -0.18 * ease(Math.min(1, f / 0.4));
      if (f > 0) {
        legs.current.forEach(l => l?.rotation.set(-0.9 * ease(Math.min(1, f / 0.4)), 0, 0));
        shins.current.forEach(s => { if (s) s.rotation.x = 1.6 * ease(Math.min(1, f / 0.4)); });
      }
    }
  });

  return (
    <group scale={SCALE}>
      {!dead && <ContactShadow size={[0.42, 0.38]} />}
      <group ref={root}>
        <group ref={hips}>
          {/* The legs: thighs in the undersuit with guards, knee plates, armoured shins, boots
              with a split toe. */}
          {[1, -1].map((s, i) => (
            <group key={s} ref={g => { legs.current[i] = g; }} position={[s * HIP_X, HIP_Y, 0]}>
              <Turned profile={[[0.047, 0], [0.056, 0.04], [0.048, 0.17], [0.038, THIGH]]} segments={10} material={suit} rotation={DOWN} />
              <Plate size={[0.07, 0.13, 0.025]} material={plate} position={[0, -0.1, 0.045]} rotation={[-0.06, 0, 0]} />
              <group ref={g => { shins.current[i] = g; }} position={[0, -THIGH, 0]}>
                <Plate size={[0.058, 0.055, 0.03]} material={grey} position={[0, 0.0, 0.043]} rotation={[0.35, 0, 0]} />
                <Turned profile={[[0.039, 0], [0.043, 0.05], [0.033, 0.18], [0.03, SHIN]]} segments={10} material={suit} rotation={DOWN} />
                <Plate size={[0.062, 0.14, 0.024]} material={plate} position={[0, -0.11, 0.036]} rotation={[0.05, 0, 0]} />
                <Plate size={[0.075, 0.065, 0.11]} material={plate} position={[0, -SHIN - 0.025, 0.0]} />
                <Plate size={[0.03, 0.035, 0.06]} material={black} position={[0.018, -SHIN - 0.045, 0.075]} />
                <Plate size={[0.035, 0.035, 0.06]} material={black} position={[-0.016, -SHIN - 0.045, 0.072]} />
                <Plate size={[0.08, 0.016, 0.17]} material={black} position={[0, -SHIN - 0.062, 0.03]} />
              </group>
            </group>
          ))}

          {/* Hips, the sash in team colour with its tails behind. */}
          <Plate size={[0.17, 0.08, 0.12]} radius={0.02} material={plate} position={[0, HIP_Y + 0.03, 0]} />
          <Plate size={[0.18, 0.03, 0.13]} material={paint} position={[0, HIP_Y + 0.07, 0]} />
          <group ref={sash} position={[0.03, HIP_Y + 0.07, -0.065]}>
            <Plate size={[0.035, 0.2, 0.006]} material={paint} position={[0, -0.1, 0]} />
            <Plate size={[0.03, 0.16, 0.006]} material={paint} position={[0.04, -0.08, 0.002]} rotation={[0, 0, -0.12]} />
          </group>

          <group ref={torso} position={[0, HIP_Y + 0.07, 0]}>
            <group position={[0, -HIP_Y - 0.07, 0]}>
              {/* The torso in its undersuit, close plates over it: abdomen in bands, the chest,
                  the collar. */}
              <group position={[0, HIP_Y + 0.06, 0]} scale={[1, 1, 0.72]}>
                <Turned profile={[[0.075, 0], [0.08, 0.08], [0.105, 0.17], [0.11, 0.22], [0.085, 0.25], [0.001, 0.26]]} segments={12} material={suit} rotation={UP} />
              </group>
              {[0.6, 0.632, 0.664].map((y, k) => <Plate key={y} size={[0.1 + k * 0.01, 0.026, 0.03]} material={plate} position={[0, y, 0.06 + k * 0.004]} rotation={[0.08, 0, 0]} />)}
              <Loft bottom={WAIST} top={CHEST} height={0.1} material={plate} position={[0, 0.69, 0]} />
              <Loft bottom={CHEST} top={COLLAR} height={0.04} material={grey} position={[0, 0.79, 0]} />
              <Strip size={[0.03, 0.008, 0.004]} material={tag} position={[0.05, 0.75, 0.091]} />
              <Strip size={[0.012, 0.008, 0.004]} material={tag} position={[0.025, 0.75, 0.091]} />
              {/* The scabbard across the back. */}
              <group position={[0, 0.72, -0.1]} rotation={[0, 0, 0.7]}>
                <Turned profile={[[0.016, -0.26], [0.019, -0.2], [0.019, 0.2], [0.022, 0.22]]} segments={6} material={black} rotation={[Math.PI / 2, 0, 0]} />
                <Plate size={[0.03, 0.02, 0.025]} material={steel} position={[0, 0.2, 0]} />
                <Plate size={[0.06, 0.02, 0.02]} material={grey} position={[0, 0, 0.012]} />
              </group>

              {/* Narrow shoulder guards in team colour, a red tag on the right. */}
              {[1, -1].map(s => (
                <group key={s} position={[s * 0.148, 0.81, 0]}>
                  <Plate size={[0.08, 0.025, 0.1]} material={paint} rotation={[0, 0, -s * 0.45]} />
                  <Plate size={[0.07, 0.02, 0.09]} material={plate} position={[s * 0.028, -0.032, 0]} rotation={[0, 0, -s * 0.9]} />
                </group>
              ))}
              <Strip size={[0.004, 0.012, 0.03]} material={tag} position={[-0.19, 0.775, 0.0]} />

              {/* Neck and helmet: the faceted shell, a black faceplate, and the night-vision rig:
                  a mount on the brow and four lenses, two large in the middle, two small outside. */}
              <Turned profile={[[0.032, 0], [0.029, 0.05]]} segments={10} material={suit} position={[0, 0.8, 0]} rotation={UP} />
              <Loft bottom={HELM_RIM} top={HELM_BROW} height={BROW_Y - HELM_Y} material={plate} position={[0, HELM_Y, 0]} />
              <Loft bottom={HELM_BROW} top={HELM_CROWN} height={CROWN_Y - BROW_Y} material={plate} position={[0, BROW_Y, 0]} />
              <Plate size={[0.1, 0.07, 0.03]} material={black} position={[0, 0.885, 0.072]} rotation={[0.12, 0, 0]} />
              <Plate size={[0.06, 0.03, 0.02]} material={grey} position={[0, 0.858, 0.085]} rotation={[0.35, 0, 0]} />
              <group position={[0, 0.915, 0.09]}>
                <Plate size={[0.12, 0.028, 0.03]} material={grey} />
                {[[-0.02, 0.016], [0.02, 0.016], [-0.05, 0.011], [0.05, 0.011]].map(([x, r]) => (
                  <group key={x} position={[x, -0.002, 0.012]}>
                    <Turned profile={[[r, 0], [r, 0.035]]} segments={8} material={black} />
                    <Turned profile={[[r * 0.75, 0.035], [r * 0.75, 0.037]]} segments={8} material={lens} />
                  </group>
                ))}
              </group>

              {/* The arms, posed from the shoulders: the left (on +X) the sword arm. */}
              {[1, -1].map((s, i) => (
                <group key={s} ref={g => { shoulders.current[i] = g; }} position={[s * SHOULDER_X, SHOULDER_Y, 0]}>
                  <Segment from={[0, 0, 0]} to={[0, -UPPER, 0]} r={[0.036, 0.031]} material={suit} />
                  <Plate size={[0.05, 0.08, 0.05]} material={plate} position={[s * 0.008, -0.06, 0]} />
                  <group ref={g => { elbows.current[i] = g; }} position={[0, -UPPER, 0]}>
                    <Segment from={[0, 0, 0]} to={[0, -FORE, 0]} r={[0.031, 0.026]} material={suit} />
                    <Segment from={[0, -0.03, 0]} to={[0, -FORE + 0.02, 0]} r={[0.038, 0.034]} material={plate} segments={5} />
                    <Plate size={[0.04, 0.05, 0.045]} radius={0.012} material={glove} position={[0, -FORE - 0.02, 0]} />
                    {i === 0 && <group ref={hand} position={[0, -FORE - 0.02, 0]}><Katana /></group>}
                  </group>
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
