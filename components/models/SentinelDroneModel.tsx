// The Sentinel Drone that guards a server node, built from the unit kit (components/kit).
//
// A round grey robot hovering over its node, all one eye. The body is a smooth grey sphere with
// two dark seam rings round its top and bottom. A belt runs round its middle from cheek to cheek
// behind the eye, with a red light on each cheek and at the back, and on each side a stubby
// thruster pod with a vent and a fin. In front, the eye: a heavy dark rim standing proud of the
// shell under an armoured brow, a black socket inside it ringed by eight shutter blades, and the
// lens: a red iris round a white-hot pupil. On top, a short sensor mast with a blinking red tip;
// underneath, a hover emitter glowing down.
//
// It moves: it turns its whole body to look at what it is shooting (`aimOf`, a point in the
// world) and fires its laser from the pupil, a white-hot core in a red glow with a flare at each
// end, flickering as it burns. Idle, it turns slowly round, looking down over its node, the eye
// dimmed.
//
// Built facing +Z, about 4.2 across in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, smoothMaterial } from '../kit/materials';
import { Plate, Strip, Turned } from '../kit/shapes';

const SCALE = 1.35;
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const RED = PALETTE.warning;
// The shell's radius, and the round opening in its front the eye sits in.
const R = 1.9;
const OPENING = 0.95;
const OPEN_Z = Math.sqrt(R * R - OPENING * OPENING);
// The shell turned along +Z, from the back pole round to the eye's opening.
const SHELL: [number, number][] = Array.from({ length: 25 }, (_, i) => {
  const a = (i / 24) * (Math.PI - Math.asin(OPENING / R));
  return [R * Math.sin(a), -R * Math.cos(a)] as [number, number];
});
// The eye, turned along +Z: the rim standing proud of the shell, the black socket, the iris
// ring and the pupil's dome.
const RIM: [number, number][] = [[OPENING - 0.06, OPEN_Z - 0.1], [1.12, OPEN_Z], [1.14, OPEN_Z + 0.12], [1.0, OPEN_Z + 0.22], [0.8, OPEN_Z + 0.2], [0.76, OPEN_Z + 0.06]];
const SOCKET: [number, number][] = [[0.001, OPEN_Z - 0.45], [0.6, OPEN_Z - 0.4], [0.8, OPEN_Z - 0.2], [0.82, OPEN_Z + 0.08]];
const IRIS_Z = OPEN_Z - 0.3;
const IRIS: [number, number][] = [[0.3, IRIS_Z + 0.07], [0.52, IRIS_Z + 0.02], [0.56, IRIS_Z - 0.03], [0.3, IRIS_Z - 0.01]];
const PUPIL: [number, number][] = [[0.001, IRIS_Z + 0.22], [0.16, IRIS_Z + 0.19], [0.28, IRIS_Z + 0.1], [0.32, IRIS_Z + 0.02]];
// The pupil's front, where the laser leaves.
export const SENTINEL_EYE_Z = IRIS_Z + 0.22;
// The brow over the eye, a part-turned lip on the shell, over the top 130 degrees.
const BROW: [number, number][] = [[1.22, OPEN_Z - 0.22], [1.32, OPEN_Z - 0.02], [1.28, OPEN_Z + 0.2], [1.14, OPEN_Z + 0.26]];
const BROW_ARC = 2.3;
// The belt round the middle, turned about the upright, leaving the front clear for the eye.
const BELT: [number, number][] = [[R - 0.02, -0.2], [R + 0.08, -0.13], [R + 0.08, 0.13], [R - 0.02, 0.2]];
const BELT_GAP = 0.62;
// Seam rings round the top and bottom of the shell, at height ±SEAM_Y.
const SEAM_Y = 1.32;
const SEAM_R = Math.sqrt(R * R - SEAM_Y * SEAM_Y);
// How it looks when idle: down over its node, turning slowly round.
const IDLE_PITCH = 0.42;
const IDLE_TURN = 0.35;
const PITCH = { min: -0.6, max: 1.35 };

// The shell's paint: a lighter grey than the base structures, smooth-shaded so it reads round.
let shellPaint: THREE.MeshStandardMaterial | null = null;
const shellMaterial = () => shellPaint ??= (() => {
  const m = smoothMaterial('structLight').clone();
  m.color.set('#9ca2a8');
  m.roughness = 0.45;
  m.metalness = 0.25;
  return m;
})();

const partTurned = (profile: [number, number][], phiStart: number, phiLength: number, segments: number) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart, phiLength);

export const SentinelDroneModel: React.FC<{
  // Where its laser is aimed in the world, or nothing while it isn't firing.
  aimOf?: () => THREE.Vector3 | undefined;
}> = ({ aimOf }) => {
  const shell = shellMaterial(), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark'), black = kitMaterial('black'), steel = kitMaterial('steel');
  // The eye's lights, its own to brighten while it fires.
  const iris = useMemo(() => own(glow(RED)), []);
  const pupil = useMemo(() => own(glow('#ffd9d4')), []);
  const tip = useMemo(() => own(glow(RED)), []);
  // The laser: a white-hot core in a red glow, and a flare at each end.
  const beamCore = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.4, 2.2), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const beamGlow = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.12, 0.08), toneMapped: false, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const flare = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.4), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), []);
  const geometry = useMemo(() => ({
    brow: (() => { const g = partTurned(BROW, Math.PI - BROW_ARC / 2, BROW_ARC, 16); g.rotateX(Math.PI / 2); return g; })(),
    belt: partTurned(BELT, BELT_GAP, Math.PI * 2 - BELT_GAP * 2, 40),
    beam: new THREE.CylinderGeometry(1, 1, 1, 10, 1, true),
    flare: new THREE.SphereGeometry(1, 12, 8),
  }), []);
  useEffect(() => () => {
    [iris, pupil, tip, beamCore, beamGlow, flare].forEach(m => m.dispose());
    Object.values(geometry).forEach(g => g.dispose());
  }, [iris, pupil, tip, beamCore, beamGlow, flare, geometry]);

  const root = useRef<THREE.Group>(null);
  const yaw = useRef<THREE.Group>(null);
  const pitch = useRef<THREE.Group>(null);
  const eye = useRef<THREE.Object3D>(null);
  const beam = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const muzzle = useRef<THREE.Mesh>(null);
  const impact = useRef<THREE.Mesh>(null);
  const scratch = useMemo(() => ({ aim: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const y = yaw.current, p = pitch.current;
    if (!y || !p || !root.current) return;
    const aim = aimOf?.();
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * (aim ? 9 : 1.2));
    // Onto the target; otherwise turning slowly round, looking down over its node.
    let wantYaw = y.rotation.y + IDLE_TURN * delta, wantPitch = IDLE_PITCH;
    if (aim) {
      const local = root.current.worldToLocal(scratch.aim.copy(aim));
      wantYaw = Math.atan2(local.x, local.z);
      wantPitch = Math.min(PITCH.max, Math.max(PITCH.min, Math.atan2(-local.y, Math.hypot(local.x, local.z))));
    }
    let d = wantYaw - y.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    y.rotation.y += aim ? d * k : IDLE_TURN * delta;
    p.rotation.x += (wantPitch - p.rotation.x) * k;

    // The eye burns bright while it fires; idle, a dim slow pulse. The mast tip blinks.
    const flicker = 0.85 + 0.15 * Math.sin(t * 61) * Math.sin(t * 23);
    iris.color.set(RED).multiplyScalar(aim ? 1.6 * flicker : 0.55 + 0.2 * Math.sin(t * 2));
    pupil.color.set(aim ? '#fff4f2' : '#ff8a80').multiplyScalar(aim ? 2.2 * flicker : 0.7 + 0.25 * Math.sin(t * 2));
    tip.color.set(RED).multiplyScalar((t % 1.4) < 0.12 ? 1.6 : 0.25);

    // The laser, from the pupil to the target, drawn in the unit's own frame.
    const b = beam.current;
    if (!b) return;
    b.visible = !!aim && !!eye.current;
    if (!aim || !eye.current) return;
    const from = root.current.worldToLocal(eye.current.getWorldPosition(scratch.from));
    const to = root.current.worldToLocal(scratch.to.copy(aim));
    const span = to.clone().sub(from);
    const length = span.length();
    if (length < 0.01) { b.visible = false; return; }
    b.position.copy(from).add(to).multiplyScalar(0.5);
    b.quaternion.setFromUnitVectors(scratch.up, span.multiplyScalar(1 / length));
    if (core.current) core.current.scale.set(0.07 * flicker, length, 0.07 * flicker);
    if (halo.current) halo.current.scale.set(0.28 * flicker, length, 0.28 * flicker);
    beamGlow.opacity = 0.35 + 0.15 * flicker;
    if (muzzle.current) { muzzle.current.position.set(0, -length / 2, 0); muzzle.current.scale.setScalar(0.42 * flicker); }
    if (impact.current) { impact.current.position.set(0, length / 2, 0); impact.current.scale.setScalar(0.6 + 0.35 * Math.abs(Math.sin(t * 37))); }
  });

  return (
    <group ref={root}>
      <group ref={yaw} scale={SCALE}>
        <group ref={pitch}>
          {/* The shell, its seam rings, the belt and the side pods. */}
          <Turned profile={SHELL} segments={40} material={shell} />
          {[-1, 1].map(s => (
            <Turned key={s} profile={[[SEAM_R + 0.012, s * SEAM_Y - 0.035], [SEAM_R + 0.03, s * SEAM_Y], [SEAM_R + 0.012, s * SEAM_Y + 0.035]]} segments={40} material={dark} rotation={UP} />
          ))}
          <mesh geometry={geometry.belt} material={grey} castShadow />
          {[1.05, Math.PI, -1.05].map(a => (
            <Strip key={a} size={[0.42, 0.07, 0.03]} material={iris} position={[Math.sin(a) * (R + 0.095), 0, Math.cos(a) * (R + 0.095)]} rotation={[0, a, 0]} />
          ))}
          {[-1, 1].map(s => (
            <group key={s} position={[s * (R - 0.1), 0, -0.35]}>
              <Turned profile={[[0.001, 0], [0.36, 0], [0.4, 0.12], [0.4, 0.38], [0.3, 0.5], [0.001, 0.5]]} segments={14} material={grey} rotation={[0, s * Math.PI / 2, 0]} />
              <Turned profile={[[0.001, 0.5], [0.24, 0.5], [0.24, 0.53], [0.001, 0.53]]} segments={14} material={black} rotation={[0, s * Math.PI / 2, 0]} />
              {[-0.1, 0, 0.1].map(v => <Plate key={v} size={[0.04, 0.035, 0.36]} material={dark} position={[s * 0.545, v, 0]} />)}
              <Plate size={[0.06, 0.34, 0.5]} material={dark} position={[s * 0.25, 0.42, -0.08]} rotation={[-0.35, 0, 0]} />
            </group>
          ))}
          {/* The brow, the rim and the socket, eight shutter blades round the iris, the lens. */}
          <mesh geometry={geometry.brow} material={grey} castShadow />
          <Turned profile={RIM} segments={40} material={dark} />
          <Turned profile={SOCKET} segments={32} material={black} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return (
              <Plate key={i} size={[0.24, 0.1, 0.03]} material={dark} position={[Math.cos(a) * 0.66, Math.sin(a) * 0.66, IRIS_Z + 0.02]} rotation={[0, 0, a + 0.5]} />
            );
          })}
          <Turned profile={IRIS} segments={32} material={iris} />
          <Turned profile={PUPIL} segments={24} material={pupil} />
          <object3D ref={eye} position={[0, 0, SENTINEL_EYE_Z]} />
          {/* The sensor mast on top, and the hover emitter underneath. */}
          <group position={[0, R - 0.05, -0.45]}>
            <Turned profile={[[0.22, 0], [0.18, 0.12], [0.07, 0.16], [0.05, 0.75], [0.001, 0.75]]} segments={10} material={steel} rotation={UP} />
            <mesh position={[0, 0.8, 0]} material={tip}><sphereGeometry args={[0.08, 10, 8]} /></mesh>
          </group>
          <group position={[0, -R + 0.08, 0]} rotation={[Math.PI, 0, 0]}>
            <Turned profile={[[0.7, 0], [0.62, 0.2], [0.42, 0.28], [0.001, 0.28]]} segments={20} material={dark} rotation={UP} />
            <Turned profile={[[0.38, 0.28], [0.3, 0.31], [0.001, 0.31]]} segments={20} material={iris} rotation={UP} />
          </group>
        </group>
      </group>
      {/* The laser, placed each frame between the pupil and the target. */}
      <group ref={beam} visible={false}>
        <mesh ref={core} geometry={geometry.beam} material={beamCore} raycast={() => null} renderOrder={6} />
        <mesh ref={halo} geometry={geometry.beam} material={beamGlow} raycast={() => null} renderOrder={5} />
        <mesh ref={muzzle} geometry={geometry.flare} material={flare} raycast={() => null} renderOrder={6} />
        <mesh ref={impact} geometry={geometry.flare} material={flare} raycast={() => null} renderOrder={6} />
      </group>
    </group>
  );
};
