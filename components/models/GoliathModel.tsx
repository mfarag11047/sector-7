// Goliath, Heavy Metal's hero (sim/heavyMetalHero.ts), built from the unit kit (components/kit).
//
// A towering full-borg heavy, twice a trooper's height and three times as broad: gunmetal plate
// over dark red muscle cabling, showing at the waist, neck and joints. Huge faceted pauldrons in
// team colour, a deep chest with amber running lights, an armoured skirt, thick legs on clawed
// feet. His head sits low between the pauldrons: a pale skull faceplate with glowing red eyes and
// a steel jaw.
//
// In both hands at his right hip, a heavy machine gun: a long receiver, an ammunition box, a
// perforated barrel shroud and a muzzle brake, its muzzle flashing when it fires (`flashRef`, lit
// by Unit.tsx). From a socket in his back, a jointed arm curls over his right shoulder holding a
// box grenade launcher, six tubes facing forward.
//
// It moves: a slow heavy stride, legs swinging, hips bobbing and the torso rolling; standing, his
// chest rises and falls; each shot kicks the gun back, each grenade volley (`grenadeAt`) kicks the
// launcher up; dead (`dead`, from `diedAt`), he topples onto his back (components/FallenUnits.tsx
// keeps him on the ground a while).
//
// Built facing +Z, about 1 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GOLIATH } from '../../sim/heavyMetalHero';
import { glow, kitMaterial, PALETTE, smoothMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Prism, Strip, Turned } from '../kit/shapes';

type V3 = [number, number, number];
type Outline = [number, number][];
export const GOLIATH_SCALE = 7;
const HIP_Y = 0.43, HIP_X = 0.1;
const THIGH = 0.2, SHIN = 0.19;
const DOWN: V3 = [Math.PI / 2, 0, 0];
const UP: V3 = [-Math.PI / 2, 0, 0];
const RECOIL_MS = 140;
const TOPPLE_MS = 1100;
// His muscle cabling.
const CABLE = '#5e1a1a';
const EYE = '#ff2a2a';

// The torso, top views [right, forward]: the waist, the chest at its deepest, the shoulders.
const WAIST: Outline = [[-0.11, -0.08], [0.11, -0.08], [0.14, -0.03], [0.135, 0.06], [0.08, 0.1], [-0.08, 0.1], [-0.135, 0.06], [-0.14, -0.03]];
const CHEST: Outline = [[-0.16, -0.11], [0.16, -0.11], [0.21, -0.04], [0.2, 0.08], [0.11, 0.15], [-0.11, 0.15], [-0.2, 0.08], [-0.21, -0.04]];
const SHOULDERS: Outline = [[-0.13, -0.1], [0.13, -0.1], [0.17, -0.04], [0.165, 0.06], [0.09, 0.11], [-0.09, 0.11], [-0.165, 0.06], [-0.17, -0.04]];
// A pauldron, a faceted dome: its rim and its top.
// The skull, top views [right, forward]: at the cheeks and at the brow.
const SKULL_LOW: Outline = [[-0.03, -0.02], [0.03, -0.02], [0.038, 0.01], [0.034, 0.045], [0.018, 0.055], [-0.018, 0.055], [-0.034, 0.045], [-0.038, 0.01]];
const SKULL_HIGH: Outline = [[-0.042, -0.025], [0.042, -0.025], [0.05, 0.01], [0.046, 0.045], [0.026, 0.058], [-0.026, 0.058], [-0.046, 0.045], [-0.05, 0.01]];
const PAULDRON_RIM: Outline = [[-0.08, -0.1], [0.08, -0.1], [0.11, -0.03], [0.105, 0.06], [0.06, 0.11], [-0.06, 0.11], [-0.105, 0.06], [-0.11, -0.03]];
const PAULDRON_TOP: Outline = [[-0.05, -0.06], [0.05, -0.06], [0.07, -0.02], [0.065, 0.035], [0.035, 0.065], [-0.035, 0.065], [-0.065, 0.035], [-0.07, -0.02]];

// A tapered limb from one point to another.
const Segment: React.FC<{ from: V3; to: V3; r: [number, number]; material: THREE.Material; segments?: number }> = ({ from, to, r, material, segments = 10 }) => {
  const { q, len } = useMemo(() => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    return { len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()) };
  }, [from, to]);
  return (
    <group position={from} quaternion={q}>
      <Turned profile={[[r[0] * 0.85, 0], [r[0], len * 0.12], [r[1], len * 0.88], [r[1] * 0.85, len]]} segments={segments} material={material} />
    </group>
  );
};

// The arms on the gun, from the shoulder line down to the hands on its grips: the right on the
// pistol grip at the hip, the left on the front grip.
const R_SHOULDER: V3 = [-0.23, 0.76, 0], R_ELBOW: V3 = [-0.27, 0.6, -0.04], R_HAND: V3 = [-0.14, 0.5, 0.06];
const L_SHOULDER: V3 = [0.23, 0.76, 0], L_ELBOW: V3 = [0.2, 0.58, 0.1], L_HAND: V3 = [-0.08, 0.52, 0.26];
// The gun, its rear at the right hip, the barrel along +Z.
const GUN_AT: V3 = [-0.11, 0.52, 0.02];

export const GoliathModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  lastAttackTime?: number;
  grenadeAt?: number;
  dead?: boolean;
  diedAt?: number;
  flashRef?: React.Ref<THREE.Mesh>;
}> = ({ teamColor, moving, lastAttackTime, grenadeAt, dead, diedAt, flashRef }) => {
  const plate = kitMaterial('structGrey'), dark = kitMaterial('structDark'), black = kitMaterial('black'), steel = kitMaterial('steel');
  const smooth = smoothMaterial('structDark'), cable = teamPaint(CABLE), bone = kitMaterial('housing');
  const paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber), eye = glow(EYE);

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const gun = useRef<THREE.Group>(null);
  const launcher = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const shins = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ walk: 0, stride: 0, t: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05), now = Date.now();
    state.t += dt;
    state.walk += ((moving && !dead ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 6));
    state.stride += dt * 5.5 * state.walk;
    [0, 1].forEach(i => {
      const s = state.stride + i * Math.PI;
      const leg = legs.current[i], shin = shins.current[i];
      if (leg) leg.rotation.x = Math.sin(s) * 0.4 * state.walk - 0.08;
      if (shin) shin.rotation.x = 0.12 + 0.6 * Math.max(0, Math.sin(s + 1.2)) * state.walk;
    });
    if (hips.current) hips.current.position.y = Math.abs(Math.cos(state.stride)) * 0.014 * state.walk - 0.01;
    if (torso.current) {
      const breath = Math.sin(state.t * 1.6) * (1 - state.walk);
      torso.current.rotation.set(0.06 + breath * 0.012, Math.sin(state.stride) * 0.07 * state.walk, Math.sin(state.stride) * 0.025 * state.walk);
    }
    // Recoil: each shot kicks the gun back; each volley kicks the launcher up, a kick a grenade.
    const shot = lastAttackTime === undefined ? 1 : Math.min(1, (now - lastAttackTime) / RECOIL_MS);
    if (gun.current) gun.current.position.z = -(1 - shot) * 0.025;
    const volleyMs = GOLIATH.grenades.count * GOLIATH.grenades.intervalMs;
    const since = grenadeAt === undefined ? Infinity : now - grenadeAt;
    const kick = since >= 0 && since < volleyMs + 200 ? Math.max(0, 1 - (since % GOLIATH.grenades.intervalMs) / GOLIATH.grenades.intervalMs) : 0;
    if (launcher.current) launcher.current.rotation.x = -kick * 0.25;
    // Dead: topple backward, then lie still.
    if (root.current) {
      const fall = dead ? Math.min(1, (now - (diedAt ?? now - TOPPLE_MS)) / TOPPLE_MS) : 0;
      root.current.rotation.x = -1.45 * fall * fall;
    }
  });

  return (
    <group scale={GOLIATH_SCALE}>
      {!dead && <ContactShadow size={[0.6, 0.5]} />}
      <group ref={root}>
        <group ref={hips}>
          {/* The legs: thick thighs in plate over cabling, knee guards, shins, and feet with three
              steel claws forward and a spur behind. */}
          {[1, -1].map((s, i) => (
            <group key={s} ref={g => { legs.current[i] = g; }} position={[s * HIP_X, HIP_Y, 0]} rotation={[0, 0, s * 0.04]}>
              <Turned profile={[[0.06, 0], [0.075, 0.05], [0.068, 0.15], [0.055, THIGH]]} segments={10} material={cable} rotation={DOWN} />
              <Plate size={[0.11, 0.15, 0.04]} material={plate} position={[0, -0.09, 0.06]} rotation={[-0.08, 0, 0]} />
              <Plate size={[0.04, 0.13, 0.11]} material={plate} position={[s * 0.065, -0.09, 0]} rotation={[0, 0, s * 0.08]} />
              <group ref={g => { shins.current[i] = g; }} position={[0, -THIGH, 0]}>
                <Plate size={[0.1, 0.08, 0.05]} material={dark} position={[0, 0, 0.06]} rotation={[0.35, 0, 0]} />
                <Turned profile={[[0.055, 0], [0.06, 0.04], [0.048, 0.15], [0.045, SHIN]]} segments={10} material={smooth} rotation={DOWN} />
                <Plate size={[0.1, 0.15, 0.04]} material={plate} position={[0, -0.09, 0.055]} rotation={[0.06, 0, 0]} />
                <Strip size={[0.04, 0.008, 0.004]} material={amber} position={[0, -0.05, 0.078]} />
                {/* The foot. */}
                <group position={[0, -SHIN - 0.03, 0.01]} rotation={[0.12, 0, 0]}>
                  <Plate size={[0.12, 0.06, 0.13]} material={dark} />
                  {[-0.035, 0, 0.035].map(x => (
                    <group key={x} position={[x, -0.012, 0.075]} rotation={[0, x * 4, 0]}>
                      <Plate size={[0.03, 0.035, 0.06]} material={plate} />
                      <Turned profile={[[0.012, 0.02], [0.001, 0.07]]} segments={4} material={steel} position={[0, -0.008, 0.01]} rotation={[0.35, 0, 0]} />
                    </group>
                  ))}
                  <Turned profile={[[0.014, 0], [0.001, 0.05]]} segments={4} material={steel} position={[0, -0.01, -0.06]} rotation={[Math.PI - 0.3, 0, 0]} />
                </group>
              </group>
            </group>
          ))}

          {/* Pelvis and an armoured skirt: a plate front and back, one on each hip. */}
          <Plate size={[0.24, 0.09, 0.17]} radius={0.02} material={dark} position={[0, HIP_Y + 0.03, 0]} />
          <Plate size={[0.12, 0.11, 0.03]} material={plate} position={[0, HIP_Y - 0.01, 0.095]} rotation={[-0.12, 0, 0]} />
          <Strip size={[0.06, 0.008, 0.004]} material={amber} position={[0, HIP_Y + 0.02, 0.112]} />
          <Plate size={[0.14, 0.1, 0.03]} material={plate} position={[0, HIP_Y, -0.095]} rotation={[0.12, 0, 0]} />
          {[1, -1].map(s => <Plate key={s} size={[0.03, 0.1, 0.12]} material={plate} position={[s * 0.135, HIP_Y, 0]} rotation={[0, 0, s * 0.2]} />)}

          <group ref={torso} position={[0, HIP_Y + 0.06, 0]}>
            <group position={[0, -HIP_Y - 0.06, 0]}>
              {/* The waist in bare cabling, then the deep chest and the shoulders over it. */}
              <Turned profile={[[0.1, 0], [0.11, 0.06], [0.12, 0.1]]} segments={10} material={cable} position={[0, HIP_Y + 0.05, 0]} rotation={UP} />
              <Loft bottom={WAIST} top={CHEST} height={0.17} material={plate} position={[0, 0.55, 0.01]} />
              <Loft bottom={CHEST} top={SHOULDERS} height={0.08} material={dark} position={[0, 0.72, 0.01]} />
              {/* Abdominal bands and the chest's plates, with amber running lights. */}
              {[0.56, 0.6].map(y => <Plate key={y} size={[0.13, 0.03, 0.04]} material={dark} position={[0, y, 0.098]} rotation={[-0.1, 0, 0]} />)}
              {[1, -1].map(s => (
                <group key={s}>
                  <Plate size={[0.13, 0.1, 0.03]} material={plate} position={[s * 0.07, 0.68, 0.145]} rotation={[0.1, s * 0.25, 0]} />
                  <Strip size={[0.05, 0.008, 0.004]} material={amber} position={[s * 0.075, 0.655, 0.164]} rotation={[0, s * 0.25, 0]} />
                </group>
              ))}
              <Plate size={[0.04, 0.09, 0.02]} material={black} position={[0, 0.69, 0.155]} />
              {/* The socket in his back, a power pack. */}
              <Plate size={[0.2, 0.18, 0.08]} material={dark} position={[0, 0.7, -0.13]} />
              {[-0.06, 0, 0.06].map(x => <Plate key={x} size={[0.035, 0.12, 0.02]} material={black} position={[x, 0.69, -0.175]} />)}

              {/* The pauldrons, huge, in team colour, with a dark rim beneath. */}
              {[1, -1].map(s => (
                <group key={s} position={[s * 0.25, 0.79, 0]} rotation={[0, 0, -s * 0.28]}>
                  <Loft bottom={PAULDRON_RIM} top={PAULDRON_TOP} height={0.08} material={paint} />
                  <Loft bottom={PAULDRON_RIM} top={PAULDRON_RIM} height={0.03} material={dark} position={[0, -0.03, 0]} />
                  <Plate size={[0.1, 0.02, 0.02]} material={dark} position={[s * 0.01, 0.06, 0.08]} rotation={[0.6, 0, 0]} />
                </group>
              ))}

              {/* The head, low between them: a cable neck, the skull faceplate with red eyes and a
                  steel jaw under a dark cowl. */}
              <Turned profile={[[0.05, 0], [0.045, 0.05]]} segments={10} material={cable} position={[0, 0.79, 0.03]} rotation={UP} />
              <group position={[0, 0.86, 0.05]}>
                {/* The cowl: the back of the head and a hood over the brow. */}
                <Plate size={[0.11, 0.1, 0.1]} radius={0.02} material={dark} position={[0, 0.015, -0.025]} />
                <Plate size={[0.11, 0.025, 0.06]} material={dark} position={[0, 0.07, 0.02]} rotation={[0.25, 0, 0]} />
                {/* The skull: a cranium wider than its cheeks, narrowing to the jaw. */}
                <Loft bottom={SKULL_LOW} top={SKULL_HIGH} height={0.06} material={bone} position={[0, -0.005, 0.0]} />
                <Plate size={[0.082, 0.018, 0.02]} material={bone} position={[0, 0.058, 0.045]} rotation={[-0.35, 0, 0]} />
                {[1, -1].map(s => (
                  <group key={s} position={[s * 0.022, 0.03, 0.056]}>
                    <Plate size={[0.03, 0.022, 0.008]} material={black} rotation={[0, 0, s * 0.15]} />
                    <Strip size={[0.014, 0.009, 0.004]} material={eye} position={[0, 0, 0.004]} />
                  </group>
                ))}
                <Prism outline={[[-0.007, 0], [0.007, 0], [0, 0.016]]} depth={0.008} axis="x" material={black} position={[0, 0.006, 0.058]} rotation={[0, Math.PI / 2, 0]} />
                {/* The steel jaw, and its teeth. */}
                <Plate size={[0.07, 0.03, 0.05]} material={steel} position={[0, -0.022, 0.022]} />
                <Plate size={[0.074, 0.012, 0.05]} material={plate} position={[0, -0.04, 0.018]} />
                {[-0.021, -0.007, 0.007, 0.021].map(x => <Plate key={x} size={[0.004, 0.018, 0.006]} material={black} position={[x, -0.02, 0.048]} />)}
              </group>

              {/* The grenade launcher's arm, out of the back socket and over the right shoulder,
                  and the launcher on it: a box with six tubes and an amber sight. */}
              <Segment from={[-0.05, 0.78, -0.16]} to={[-0.13, 0.98, -0.12]} r={[0.035, 0.03]} material={dark} segments={6} />
              <Segment from={[-0.13, 0.98, -0.12]} to={[-0.2, 1.02, -0.01]} r={[0.03, 0.026]} material={dark} segments={6} />
              <Plate size={[0.05, 0.05, 0.05]} material={plate} position={[-0.13, 0.98, -0.12]} />
              <Segment from={[-0.04, 0.8, -0.15]} to={[-0.12, 0.96, -0.11]} r={[0.012, 0.012]} material={cable} segments={5} />
              <group ref={launcher} position={[-0.2, 1.02, 0.0]}>
                <Plate size={[0.14, 0.11, 0.13]} material={plate} position={[0, 0, 0.03]} />
                <Plate size={[0.15, 0.02, 0.14]} material={dark} position={[0, 0.06, 0.03]} />
                {[-0.04, 0, 0.04].flatMap(x => [-0.022, 0.022].map(y => (
                  <group key={`${x},${y}`} position={[x, y, 0.096]}>
                    <Turned profile={[[0.017, 0], [0.017, 0.01]]} segments={8} material={dark} />
                    <Turned profile={[[0.011, 0.005], [0.011, 0.011]]} segments={8} material={black} />
                  </group>
                )))}
                <Strip size={[0.02, 0.012, 0.004]} material={amber} position={[0.075, 0.03, 0.06]} rotation={[0, Math.PI / 2, 0]} />
              </group>

              {/* The arms and the gun, as one: thick upper arms in cabling under plate, armoured
                  forearms, gauntlets on the grips. */}
              <group ref={gun}>
                {[[R_SHOULDER, R_ELBOW, R_HAND], [L_SHOULDER, L_ELBOW, L_HAND]].map(([sh, el, ha], i) => (
                  <group key={i}>
                    <Segment from={sh} to={el} r={[0.06, 0.05]} material={cable} />
                    <Segment from={[sh[0], sh[1] - 0.02, sh[2]]} to={[(sh[0] + el[0]) / 2, (sh[1] + el[1]) / 2, (sh[2] + el[2]) / 2]} r={[0.068, 0.06]} material={plate} segments={6} />
                    <Plate size={[0.08, 0.08, 0.08]} material={dark} position={el} rotation={[0.4, 0.3, 0]} />
                    <Segment from={el} to={ha} r={[0.06, 0.05]} material={plate} segments={6} />
                    <Plate size={[0.07, 0.07, 0.075]} radius={0.015} material={dark} position={ha} />
                  </group>
                ))}
                <group position={GUN_AT}>
                  {/* Stock, receiver, the ammunition box on its left, a carry handle, grips. */}
                  <Plate size={[0.05, 0.07, 0.1]} material={dark} position={[0, 0.005, -0.09]} />
                  <Plate size={[0.075, 0.1, 0.26]} material={dark} position={[0, 0.02, 0.08]} />
                  {[1, -1].map(x => <Plate key={x} size={[0.006, 0.06, 0.16]} material={plate} position={[x * 0.04, 0.02, 0.1]} />)}
                  <Plate size={[0.08, 0.02, 0.2]} material={dark} position={[0, 0.075, 0.08]} />
                  <Plate size={[0.06, 0.09, 0.1]} material={dark} position={[0.07, -0.01, 0.07]} />
                  <Strip size={[0.004, 0.012, 0.06]} material={amber} position={[0.101, 0.02, 0.07]} />
                  <Plate size={[0.018, 0.04, 0.09]} material={steel} position={[0, 0.11, 0.08]} />
                  <Plate size={[0.035, 0.07, 0.04]} material={black} position={[0, -0.06, 0.02]} rotation={[-0.25, 0, 0]} />
                  <Plate size={[0.035, 0.06, 0.035]} material={black} position={[0, -0.04, 0.24]} />
                  {/* The barrel shroud, perforated, and the muzzle brake. */}
                  <Turned profile={[[0.034, 0.2], [0.034, 0.46]]} segments={8} material={dark} position={[0, 0.03, 0]} />
                  {[0.25, 0.3, 0.35, 0.4].map(z => <Plate key={z} size={[0.072, 0.012, 0.02]} material={black} position={[0, 0.03, z]} />)}
                  <Turned profile={[[0.018, 0.46], [0.018, 0.5], [0.028, 0.5], [0.028, 0.55], [0.018, 0.55]]} segments={8} material={steel} position={[0, 0.03, 0]} />
                  <mesh ref={flashRef} position={[0, 0.03, 0.62]} visible={false} raycast={() => null}>
                    <sphereGeometry args={[0.06, 8, 6]} />
                    <meshBasicMaterial color="#fbbf24" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
                  </mesh>
                </group>
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
