// Cipher, Netrunner's hero (sim/netrunnerHero.ts), built from the unit kit (components/kit).
//
// An intrusion operative, not a soldier: no plate armour. A long dark coat flaring below the
// waist with a hem in team colour, slim legs and boots, a deep hood over a black faceplate with a
// cyan visor line and three lens dots. On the back a cyberdeck, its status lights in cyan and
// magenta and a short antenna, cabled over the shoulder to the left wrist, where a holo-screen
// floats over the forearm. In the right hand a compact smart SMG with a lit sight, its muzzle
// flashing when it fires (`flashRef`, lit by Unit.tsx). Over the shoulder, a small hack drone
// circles on its own: a round body with a cyan eye and two rotor discs.
//
// It moves: it walks, legs swinging in step and the coat swaying; the drone keeps circling. Just
// after Cipher casts Override (`castAt`), the holo-screen flares and a ring pulses out from the
// drone.
//
// Built facing +Z, about 1 tall in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, smoothMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Strip, Turned } from '../kit/shapes';

type V3 = [number, number, number];
const SCALE = 3.6;
const HIP_Y = 0.52, HIP_X = 0.06;
const THIGH = 0.23, SHIN = 0.22;
const DOWN: V3 = [Math.PI / 2, 0, 0];
const UP: V3 = [-Math.PI / 2, 0, 0];
const MAGENTA = '#ff4fd8';
// How long the cast flare lasts, ms.
const CAST_MS = 1500;

// A tapered limb from one point to another.
const Segment: React.FC<{ from: V3; to: V3; r: [number, number]; material: THREE.Material; segments?: number }> = ({ from, to, r, material, segments = 8 }) => {
  const { q, len } = useMemo(() => {
    const d = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const len = d.length();
    return { len, q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()) };
  }, [from, to]);
  return (
    <group position={from} quaternion={q}>
      <Turned profile={[[r[0], 0], [r[1], len]]} segments={segments} material={material} />
    </group>
  );
};

// Arms from the shoulder line: the right hand forward on the SMG's grip, the left forearm raised
// level in front, the holo-screen over it.
const R_SHOULDER: V3 = [-0.14, -0.01, 0], R_ELBOW: V3 = [-0.17, -0.17, 0.04], R_HAND: V3 = [-0.1, -0.15, 0.17];
const L_SHOULDER: V3 = [0.14, -0.01, 0], L_ELBOW: V3 = [0.16, -0.16, 0.06], L_HAND: V3 = [0.07, -0.1, 0.22];

export const CipherModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  lastAttackTime?: number;
  flashRef?: React.Ref<THREE.Mesh>;
  // When it last cast Override, for the flare.
  castAt?: number;
}> = ({ teamColor, moving, lastAttackTime, flashRef, castAt }) => {
  // Charcoal and black, not the army's olive: an operative, not a soldier.
  const coat = smoothMaterial('structDark'), suit = smoothMaterial('black'), glove = smoothMaterial('composite');
  const dark = kitMaterial('structDark'), black = kitMaterial('black'), steel = kitMaterial('steel'), composite = kitMaterial('composite');
  const paint = teamPaint(teamColor);
  const cyan = glow(PALETTE.cyan), magenta = glow(MAGENTA);
  // Its own, to flare on a cast.
  const screen = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.4, 1.8), toneMapped: false, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const pulse = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 2), toneMapped: false, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const droneEye = useMemo(() => own(glow(PALETTE.cyan)), []);

  const body = useRef<THREE.Group>(null);
  const arms = useRef<THREE.Group>(null);
  const skirt = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Group | null)[]>([]);
  const shins = useRef<(THREE.Group | null)[]>([]);
  const drone = useRef<THREE.Group>(null);
  const rotors = useRef<(THREE.Mesh | null)[]>([]);
  const ring = useRef<THREE.Mesh>(null);
  const state = useMemo(() => ({ walk: 0, stride: 0, aim: 0, orbit: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    state.walk += ((moving ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 8));
    state.stride += dt * 8 * state.walk;
    const since = lastAttackTime ? Date.now() - lastAttackTime : Infinity;
    state.aim += ((since < 3000 ? 1 : 0) - state.aim) * (1 - Math.exp(-dt * 6));
    if (body.current) body.current.position.y = Math.abs(Math.sin(state.stride)) * 0.012 * state.walk;
    if (arms.current) arms.current.rotation.x = 0.25 * (1 - state.aim);
    if (skirt.current) skirt.current.rotation.x = Math.sin(state.stride * 2) * 0.05 * state.walk - 0.04 * state.walk;
    [0, 1].forEach(i => {
      const s = state.stride + i * Math.PI;
      const leg = legs.current[i], shin = shins.current[i];
      if (leg) leg.rotation.x = Math.sin(s) * 0.5 * state.walk;
      if (shin) shin.rotation.x = (0.05 + 0.6 * Math.max(0, Math.sin(s + 1.2))) * state.walk;
    });
    // The drone circles over the shoulder, bobbing, its rotors spinning.
    state.orbit += dt * 1.4;
    if (drone.current) {
      drone.current.position.set(Math.cos(state.orbit) * 0.32, 1.13 + Math.sin(state.orbit * 2.3) * 0.025, Math.sin(state.orbit) * 0.32);
      drone.current.rotation.y = -state.orbit + Math.PI / 2;
    }
    rotors.current.forEach(r => { if (r) r.rotation.y += dt * 40; });
    // The cast: the screen flares and a ring pulses out from the drone.
    const k = castAt ? (Date.now() - castAt) / CAST_MS : 1;
    const flare = k >= 0 && k < 1 ? 1 - k : 0;
    screen.opacity = 0.45 + 0.5 * flare;
    pulse.opacity = 0.8 * flare;
    if (ring.current) { ring.current.visible = flare > 0; ring.current.scale.setScalar(0.2 + k * 1.6); }
    droneEye.color.setRGB(0.3 + 1.5 * flare, 1.6 + flare, 2);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[0.42, 0.38]} />
      {/* Slim legs in the black undersuit, boots. */}
      {[1, -1].map((s, i) => (
        <group key={s} ref={g => { legs.current[i] = g; }} position={[s * HIP_X, HIP_Y, 0]}>
          <Turned profile={[[0.045, 0], [0.052, 0.04], [0.045, 0.17], [0.038, THIGH]]} segments={10} material={suit} rotation={DOWN} />
          <group ref={g => { shins.current[i] = g; }} position={[0, -THIGH, 0]}>
            <Turned profile={[[0.038, 0], [0.04, 0.05], [0.032, 0.18], [0.03, SHIN]]} segments={10} material={suit} rotation={DOWN} />
            <Plate size={[0.075, 0.07, 0.11]} material={dark} position={[0, -SHIN - 0.03, 0.005]} />
            <Plate size={[0.08, 0.02, 0.17]} material={black} position={[0, -SHIN - 0.062, 0.03]} />
            <Strip size={[0.04, 0.006, 0.004]} material={cyan} position={[0, -SHIN - 0.02, 0.064]} />
          </group>
        </group>
      ))}

      <group ref={body}>
        {/* The long coat: its body over the torso, and its skirt flaring to the knees with a hem in
            team colour, open a little at the front. */}
        <group position={[0, HIP_Y + 0.02, 0]} scale={[1, 1, 0.72]}>
          <Turned profile={[[0.1, 0], [0.105, 0.09], [0.125, 0.2], [0.13, 0.24], [0.1, 0.27], [0.001, 0.28]]} segments={10} material={coat} rotation={UP} />
        </group>
        <group ref={skirt} position={[0, HIP_Y + 0.06, 0]}>
          <group scale={[1, 1, 0.8]}>
            {/* Drawn from the hem up, so its faces point out. */}
            <Turned profile={[[0.155, -0.26], [0.13, -0.12], [0.108, 0]]} segments={8} material={dark} rotation={UP} />
            <Turned profile={[[0.158, -0.278], [0.158, -0.252]]} segments={8} material={paint} rotation={UP} />
          </group>
          <Plate size={[0.03, 0.27, 0.01]} material={black} position={[0, -0.14, 0.125]} rotation={[0.18, 0, 0]} />
        </group>
        <Plate size={[0.2, 0.03, 0.15]} material={composite} position={[0, HIP_Y + 0.05, 0]} />
        {/* High collar and coat lapels edged in team colour. */}
        {[1, -1].map(s => (
          <group key={s}>
            <Plate size={[0.07, 0.17, 0.02]} material={dark} position={[s * 0.055, 0.7, 0.085]} rotation={[0.12, 0, s * -0.2]} />
            <Plate size={[0.008, 0.17, 0.022]} material={paint} position={[s * 0.022, 0.7, 0.092]} rotation={[0.12, 0, s * -0.2]} />
          </group>
        ))}
        <Turned profile={[[0.075, 0], [0.07, 0.07]]} segments={10} material={dark} position={[0, 0.79, -0.01]} rotation={UP} />

        {/* The cyberdeck on the back: status lights and an antenna. */}
        <group position={[0, 0.68, -0.12]}>
          <Plate size={[0.18, 0.2, 0.07]} radius={0.01} material={composite} />
          <Plate size={[0.16, 0.05, 0.075]} material={dark} position={[0, -0.06, 0]} />
          {[-0.05, 0, 0.05].map((x, i) => <Strip key={x} size={[0.025, 0.012, 0.004]} material={i === 1 ? magenta : cyan} position={[x, 0.05, -0.037]} />)}
          <Strip size={[0.12, 0.006, 0.004]} material={cyan} position={[0, -0.02, -0.037]} />
          <Turned profile={[[0.006, 0], [0.004, 0.22]]} segments={4} material={steel} position={[0.06, 0.1, 0]} rotation={UP} />
          <Strip size={[0.012, 0.012, 0.012]} material={magenta} position={[0.06, 0.32, 0]} />
        </group>
        {/* Its cable, over the left shoulder and down to the wrist. */}
        <Segment from={[0.07, 0.76, -0.12]} to={[0.13, 0.82, -0.02]} r={[0.008, 0.008]} material={black} segments={5} />

        {/* The hood over the head, and the faceplate inside it: a cyan visor line, three lenses. */}
        <Turned profile={[[0.03, 0], [0.03, 0.05]]} segments={8} material={suit} position={[0, 0.8, 0]} rotation={UP} />
        <group position={[0, 0.9, -0.005]}>
          <Turned profile={[[0.085, -0.06], [0.1, 0.0], [0.095, 0.06], [0.06, 0.11], [0.001, 0.125]]} segments={10} material={coat} rotation={UP} />
          <Plate size={[0.1, 0.09, 0.03]} material={black} position={[0, -0.005, 0.075]} rotation={[0.08, 0, 0]} />
          <Strip size={[0.08, 0.007, 0.004]} material={cyan} position={[0, 0.012, 0.092]} />
          {[-0.022, 0, 0.022].map(x => <Strip key={x} size={[0.009, 0.009, 0.004]} material={cyan} position={[x, -0.02, 0.09]} />)}
          <Plate size={[0.12, 0.02, 0.06]} material={coat} position={[0, 0.06, 0.06]} rotation={[0.35, 0, 0]} />
        </group>

        {/* The arms: the right on the smart SMG, the left raised under the holo-screen. */}
        <group ref={arms} position={[0, 0.78, 0]}>
          <Segment from={R_SHOULDER} to={R_ELBOW} r={[0.036, 0.031]} material={coat} />
          <Segment from={R_ELBOW} to={R_HAND} r={[0.031, 0.026]} material={coat} />
          <Segment from={L_SHOULDER} to={L_ELBOW} r={[0.036, 0.031]} material={coat} />
          <Segment from={L_ELBOW} to={L_HAND} r={[0.031, 0.026]} material={coat} />
          {[R_HAND, L_HAND].map((p, i) => <Plate key={i} size={[0.04, 0.045, 0.05]} radius={0.012} material={glove} position={p} />)}
          {/* A wrist rig with its own light, and the holo-screen floating over the forearm. */}
          <Plate size={[0.05, 0.03, 0.08]} material={composite} position={[0.11, -0.12, 0.15]} rotation={[0, 0.45, 0]} />
          <Strip size={[0.03, 0.006, 0.004]} material={magenta} position={[0.11, -0.104, 0.15]} />
          <mesh position={[0.1, -0.02, 0.2]} rotation={[-0.25, 0.45, 0]} material={screen} raycast={() => null}>
            <planeGeometry args={[0.13, 0.085]} />
          </mesh>
          {/* The smart SMG: a short receiver, grip and magazine, a lit sight, the barrel. */}
          <group position={[-0.08, -0.13, 0.2]}>
            <Plate size={[0.04, 0.06, 0.16]} material={dark} />
            <Plate size={[0.028, 0.06, 0.03]} material={black} position={[0, -0.05, -0.03]} rotation={[-0.3, 0, 0]} />
            <Plate size={[0.024, 0.08, 0.03]} material={black} position={[0, -0.06, 0.03]} />
            <Plate size={[0.03, 0.02, 0.05]} material={steel} position={[0, 0.04, -0.01]} />
            <Strip size={[0.02, 0.012, 0.004]} material={cyan} position={[0, 0.042, 0.016]} />
            <Turned profile={[[0.012, 0.08], [0.012, 0.15], [0.016, 0.15], [0.016, 0.17]]} segments={8} material={black} />
            <mesh ref={flashRef} position={[0, 0, 0.22]} visible={false} raycast={() => null}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshBasicMaterial color="#9ff3ff" transparent opacity={0.9} toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>

      {/* The hack drone, circling: a round body, a cyan eye, two rotor discs; the cast's ring. */}
      <group ref={drone}>
        <Turned profile={[[0.001, -0.03], [0.035, -0.02], [0.04, 0.0], [0.03, 0.02], [0.001, 0.03]]} segments={10} material={composite} rotation={UP} />
        <mesh position={[0, 0, 0.038]} material={droneEye} raycast={() => null}><boxGeometry args={[0.03, 0.008, 0.006]} /></mesh>
        {[1, -1].map((s, i) => (
          <group key={s} position={[s * 0.055, 0.012, 0]}>
            <Plate size={[0.03, 0.008, 0.012]} material={dark} position={[-s * 0.015, 0, 0]} />
            <mesh ref={m => { rotors.current[i] = m; }} raycast={() => null} material={steel}>
              <cylinderGeometry args={[0.028, 0.028, 0.003, 10]} />
            </mesh>
          </group>
        ))}
        <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]} material={pulse} visible={false} raycast={() => null}>
          <ringGeometry args={[0.18, 0.22, 32]} />
        </mesh>
      </group>
    </group>
  );
};
