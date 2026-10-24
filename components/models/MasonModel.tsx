// The Mason combat engineering vehicle, built from the unit kit (components/kit).
//
// Simple but military: a six-wheeled engineer truck. A sturdy armoured dozer blade on push arms
// and rams at the front, a steel cutting edge along its foot and hazard stripes along its top; an
// angular armoured cab; right behind it an armoured materials box with latches and team stripes,
// with steel beams strapped on top while it carries materials; and at the back a knuckle-boom
// lifting arm on a turntable, with a gripper and a work light at its tip.
//
// It moves: the wheels turn while it drives. Building, the arm rises off its rest, slews to and
// fro and reaches out, its work light flashing; the construction beam (Unit.tsx) runs from its tip
// (`tipRef`). Otherwise it lies folded forward over the box.
//
// Built facing +Z, about 3 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.6;
const DECK_Y = 0.8;
const HAZARD = '#d9a514';

// Dozer blade, side view [forward, up]: a curved mouldboard, thick at the back.
const BLADE: [number, number][] = [[1.56, 0.08], [1.7, 0.1], [1.66, 0.3], [1.66, 0.62], [1.72, 0.86], [1.6, 0.9], [1.56, 0.62], [1.56, 0.3], [1.5, 0.12]];
const BLADE_W = 1.72;
// Cab side profile: an angular armoured front.
const CAB: [number, number][] = [[0.66, 0.55], [0.66, 1.46], [1.08, 1.46], [1.36, 1.16], [1.44, 0.9], [1.44, 0.55]];
const CAB_W = 1.36;
const WHEELS_Z = [0.98, -0.42, -0.98];
const WHEEL_X = 0.66;
const BOX = { z: 0.18, l: 0.86, w: 1.26, h: 0.56 };
const ARM = { z: -0.86, pivotY: 0.68 };

export const MasonModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // Building something.
  working?: boolean;
  // Carrying construction materials.
  carrying?: boolean;
  // The arm's tip, for the construction beam.
  tipRef?: React.Ref<THREE.Object3D>;
}> = ({ teamColor, moving, working, carrying, tipRef }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor), hazard = teamPaint(HAZARD);
  // This Mason's own: its work light flashes while it builds.
  const light = useMemo(() => own(glow(PALETTE.power)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => light.dispose(), [light]);

  const wheels = useRef<THREE.Group>(null);
  const slew = useRef<THREE.Group>(null);
  const boom = useRef<THREE.Group>(null);
  const jib = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.05) * 2.5);
    const t = clock.elapsedTime;
    if (moving) wheels.current?.children.forEach(w => { w.rotation.x += delta * 6; });
    // Folded forward on its rest, or up and working: slewing to and fro, reaching out and back.
    const want = working
      ? { slew: Math.sin(t * 0.7) * 0.6, boom: -0.75 + Math.sin(t * 1.3) * 0.08, jib: 1.25 + Math.sin(t * 0.9) * 0.15 }
      : { slew: 0, boom: 0.04, jib: -2.8 };
    if (slew.current) slew.current.rotation.y += (want.slew - slew.current.rotation.y) * k;
    if (boom.current) boom.current.rotation.x += (want.boom - boom.current.rotation.x) * k;
    if (jib.current) jib.current.rotation.x += (want.jib - jib.current.rotation.x) * k;
    const flash = working ? (Math.sin(t * 22) > 0.2 ? 1.6 : 0.3) : 0.08;
    light.color.copy(scratch.set(PALETTE.power)).multiplyScalar(flash);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.3, 3.6]} />
      {/* Six wheels: tyres on metal hubs. */}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * WHEEL_X, 0.3, z]}>
            <Wheel radius={0.3} width={0.24} segments={12} material={black} />
            <Wheel radius={0.17} width={0.26} segments={8} material={steel} />
          </group>
        )))}
      </group>

      {/* Chassis, deck, fenders, tail lights. */}
      <Plate size={[1.0, 0.34, 2.7]} material={dark} position={[0, 0.58, 0.05]} />
      <Plate size={[1.3, 0.06, 1.75]} material={composite} position={[0, DECK_Y - 0.03, -0.4]} />
      {[-1, 1].map(s => <Plate key={s} size={[0.3, 0.05, 1.2]} material={composite} position={[s * WHEEL_X, DECK_Y - 0.06, -0.7]} />)}
      {[-0.42, 0.42].map(x => <Strip key={x} size={[0.1, 0.05, 0.012]} material={glow(PALETTE.warning)} position={[x, 0.62, -1.257]} />)}

      {/* The dozer blade: mouldboard, cutting edge, hazard stripes along the top, push arms and rams. */}
      <Prism outline={BLADE} depth={BLADE_W} axis="x" material={armour} />
      <Plate size={[BLADE_W, 0.06, 0.1]} material={steel} position={[0, 0.08, 1.64]} />
      {Array.from({ length: 8 }, (_, i) => (
        <Plate key={i} size={[BLADE_W / 8 - 0.005, 0.05, 0.1]} material={i % 2 ? black : hazard} position={[-BLADE_W / 2 + (i + 0.5) * (BLADE_W / 8), 0.9, 1.65]} />
      ))}
      {[-1, 1].map(s => (
        <group key={s}>
          {[-1, 1].map(e => <Plate key={e} size={[0.04, 0.82, 0.14]} material={dark} position={[s * (BLADE_W / 2 - 0.02), 0.5, 1.62]} />)}
          <Plate size={[0.12, 0.12, 0.5]} material={dark} position={[s * 0.55, 0.38, 1.32]} />
          <group position={[s * 0.38, 0.7, 1.32]} rotation={[0.5, 0, 0]}>
            <Turned profile={[[0.045, -0.22], [0.045, 0.02]]} segments={6} material={dark} />
            <Turned profile={[[0.028, 0.02], [0.028, 0.24]]} segments={6} material={steel} />
          </group>
        </group>
      ))}

      {/* The cab: vision slits, side windows, headlights on the roof, team stripes, an antenna. */}
      <Prism outline={CAB} depth={CAB_W} axis="x" material={armour} />
      <group position={[0, 1.31, 1.22]} rotation={[Math.atan2(1.46 - 1.16, 1.36 - 1.08), 0, 0]}>
        {[-0.32, 0.32].map(x => <Plate key={x} size={[0.5, 0.02, 0.14]} material={black} position={[x, 0, 0]} />)}
      </group>
      {[-1, 1].map(s => (
        <group key={s}>
          <Plate size={[0.02, 0.18, 0.28]} material={black} position={[s * (CAB_W / 2 + 0.005), 1.24, 0.95]} />
          <group position={[s * (CAB_W / 2 + 0.006), 0.85, 1.0]}>
            {[-0.06, 0.06].map(z => <Plate key={z} size={[0.012, 0.36, 0.06]} material={paint} position={[0, 0, z]} rotation={[-0.35, 0, 0]} />)}
          </group>
          <Plate size={[0.18, 0.08, 0.08]} material={dark} position={[s * 0.4, 1.5, 1.02]} />
          <Strip size={[0.14, 0.05, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.4, 1.5, 1.062]} />
        </group>
      ))}
      <Plate size={[0.4, 0.012, 0.3]} material={paint} position={[0, 1.466, 0.86]} />
      <Strip size={[0.1, 0.05, 0.1]} material={glow(PALETTE.amber)} position={[-0.3, 1.49, 0.8]} />
      <group position={[0.52, 1.46, 0.72]}>
        <Turned profile={[[0.008, 0], [0.005, 0.5]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
      </group>

      {/* The materials box: armoured, with a lid, latches and team stripes; beams strapped on top
          while it carries materials. */}
      <group position={[0, DECK_Y, BOX.z]}>
        <Plate size={[BOX.w, BOX.h, BOX.l]} material={armour} position={[0, BOX.h / 2, 0]} />
        <Plate size={[BOX.w + 0.04, 0.06, BOX.l + 0.04]} material={dark} position={[0, BOX.h + 0.03, 0]} />
        {[-1, 1].map(s => (
          <group key={s}>
            {[-0.22, 0.22].map(z => <Plate key={z} size={[0.03, 0.08, 0.06]} material={steel} position={[s * (BOX.w / 2 + 0.015), BOX.h - 0.08, z]} />)}
            {[-0.05, 0.07].map(z => <Plate key={z} size={[0.012, 0.36, 0.06]} material={paint} position={[s * (BOX.w / 2 + 0.006), BOX.h / 2 - 0.04, z]} rotation={[-0.35, 0, 0]} />)}
          </group>
        ))}
        {carrying && (
          <group position={[0, BOX.h + 0.06, 0]}>
            {[-0.32, -0.1, 0.12, 0.34].map((x, i) => (
              <Plate key={x} size={[0.16, 0.1, BOX.l - 0.06]} material={i % 2 ? steel : housing} position={[x, 0.05 + (i % 2) * 0.1, 0]} />
            ))}
            {[-0.25, 0.25].map(z => <Plate key={z} size={[BOX.w - 0.1, 0.03, 0.04]} material={black} position={[0, 0.2, z]} />)}
          </group>
        )}
      </group>
      {/* Arm rest above the box's front edge. */}
      {[-1, 1].map(s => <Plate key={s} size={[0.05, 0.24, 0.05]} material={dark} position={[s * 0.16, DECK_Y + BOX.h + 0.18, BOX.z + 0.32]} />)}

      {/* The lifting arm: a pedestal, a turntable, a boom, a jib, and at the tip a gripper and a
          work light. */}
      <Plate size={[0.6, 0.3, 0.6]} material={dark} position={[0, DECK_Y + 0.15, ARM.z]} />
      <group ref={slew} position={[0, DECK_Y + 0.3, ARM.z]}>
        <Turned profile={[[0.32, 0], [0.32, 0.08], [0.26, 0.12]]} segments={8} material={armour} rotation={[-Math.PI / 2, 0, 0]} />
        <Plate size={[0.3, 0.44, 0.36]} material={armour} position={[0, 0.34, 0]} />
        <Plate size={[0.03, 0.2, 0.2]} material={hazard} position={[0.165, 0.38, 0]} />
        <group ref={boom} position={[0, ARM.pivotY - 0.3 + 0.38, 0]} rotation={[0.04, 0, 0]}>
          <Plate size={[0.18, 0.18, 1.2]} material={hazard} position={[0, 0, 0.6]} />
          <Plate size={[0.2, 0.04, 1.0]} material={dark} position={[0, -0.1, 0.55]} />
          {/* The jib's ram, along the top of the boom. */}
          <group position={[0, 0.13, 0.15]}>
            <Turned profile={[[0.04, 0], [0.04, 0.5]]} segments={6} material={dark} />
            <Turned profile={[[0.025, 0.5], [0.025, 0.95]]} segments={6} material={steel} />
          </group>
          <group ref={jib} position={[0, 0, 1.2]} rotation={[-2.8, 0, 0]}>
            <Wheel radius={0.1} width={0.22} segments={8} material={dark} />
            <Plate size={[0.13, 0.13, 0.85]} material={hazard} position={[0, 0, 0.42]} />
            <group position={[0, 0, 0.86]}>
              <Plate size={[0.18, 0.12, 0.1]} material={dark} />
              {[-1, 1].map(s => <Plate key={s} size={[0.03, 0.04, 0.16]} material={steel} position={[s * 0.06, 0, 0.1]} />)}
              <Strip size={[0.06, 0.06, 0.06]} material={light} position={[0, 0.08, 0.02]} />
              <object3D ref={tipRef} position={[0, 0, 0.18]} />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
};
