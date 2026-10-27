// The Titan main battle tank (and the orbital-drop Titan), built from the unit kit
// (components/kit).
//
// Simple but military: sharp-edged armour, each part in what it would be made of. A long hull with
// a sloped glacis and a row of armour blocks across the nose; dark composite side skirts over the
// tracks, hung with add-on armour modules and two diagonal stripes in team colour; and a long, low,
// angular turret stepped in two tiers, carrying the rail gun: a slab-sided housing with cooling
// slots at the turret, then two parallel rails split by a charging slot that glows between them,
// held by clamp bands, ending in a steel muzzle plate and a round extension barrel. A remote weapon station, a
// commander's sight and two whip antennas on the roof; team colour on the turret roof.
//
// It moves: the turret turns to what the tank is shooting at, the rail gun recoils and its slot
// flares when it fires, and the tracks run and the hull rocks while it drives. Its shot is the
// railgun slug the Sentry Turret fires (ShotFx kind 'rail'), from `titanMuzzle`.
//
// Built facing +Z, about 2.6 long in its own units; Unit.tsx scales it up.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

export const TITAN_SCALE = 2.6;

// Hull side profile: [forward, up], a long sloped glacis.
const HULL: [number, number][] = [[-1.25, 0.3], [-1.25, 0.92], [-1.12, 0.96], [0.5, 0.96], [1.22, 0.66], [1.3, 0.56], [1.15, 0.32], [-1.1, 0.3]];
// Side skirt, side view: angled up at the front.
const SKIRT: [number, number][] = [[-1.3, 0.3], [-1.3, 0.9], [0.95, 0.9], [1.3, 0.62], [1.3, 0.46], [1.12, 0.3]];
// Turret top view, [right, forward]: long and low, pointed toward the gun.
const TURRET: [number, number][] = [[-0.5, -0.85], [0.5, -0.85], [0.58, -0.2], [0.5, 0.5], [0.22, 0.95], [-0.22, 0.95], [-0.5, 0.5], [-0.58, -0.2]];
// The turret's upper tier: the same outline drawn in, so the turret steps in at the top.
const TURRET_TOP = TURRET.map(([x, z]) => [x * 0.82, z * 0.85 - 0.05] as [number, number]);
// The rail gun, side view [forward, up]: a housing at the turret, then the two rails, each
// tapering toward the muzzle, with the charging slot between them.
const HOUSING: [number, number][] = [[0.85, -0.1], [0.85, 0.1], [1.25, 0.11], [1.32, 0.105], [1.32, -0.105], [1.25, -0.11]];
const RAIL: [number, number][] = [[1.32, -0.105], [1.32, 0.105], [2.3, 0.075], [2.3, -0.075]];
const RAIL_W = 0.062;
const SLOT_W = 0.085;
const CLAMPS_Z = [1.6, 1.98];
// The muzzle: the tip of the extension barrel, forward of the turret's centre.
const MUZZLE_Z = 2.33 + 0.6;
const ROAD_WHEELS_Z = [-0.95, -0.57, -0.19, 0.19, 0.57, 0.95];
const TRACK_X = 0.78;
const SKIRT_X = 1.02;
const MODULES_Z = [-1.05, -0.6, -0.15, 0.3, 0.75];
const RECOIL_MS = 450;
// The upper glacis's slope, for parts laid on it.
const GLACIS = Math.atan2(0.96 - 0.66, 1.22 - 0.5);
// How high the unit stands (Unit.tsx), and the gun's axis above it.
const HOVER = 1.2;
const GUN_Y = 1.02 + 0.13;

// Where the muzzle is in the world for a tank standing at `base` aimed at `target`, for its shot.
export const titanMuzzle = (base: { x: number; z: number }, target: { x: number; z: number }) => {
  const dx = target.x - base.x, dz = target.z - base.z, flat = Math.hypot(dx, dz) || 1;
  const reach = (MUZZLE_Z - 0.2) * TITAN_SCALE;
  return { x: base.x + dx / flat * reach, y: HOVER + GUN_Y * TITAN_SCALE, z: base.z + dz / flat * reach };
};

export const TitanTankModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // When the rail gun last fired (sim/railgun.ts).
  railFiredAt?: number;
  // Where the turret should point, in world space (what the tank is shooting at), or null.
  aimRef?: React.MutableRefObject<THREE.Vector3 | null>;
  flashRef?: React.Ref<THREE.Mesh>;
  decoy?: boolean;
}> = ({ teamColor, moving, railFiredAt, aimRef, flashRef, decoy }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  // This tank's own: its tracks scroll, and its rail gun's slits flare.
  const own_ = useMemo(() => ({ tread: own(kitMaterial('tread'), true), core: own(glow(PALETTE.cyan)) as THREE.MeshBasicMaterial }), []);
  useEffect(() => () => { own_.tread.map?.dispose(); own_.tread.dispose(); own_.core.dispose(); }, [own_]);
  own_.tread.map!.repeat.set(1, 8);

  const turret = useRef<THREE.Group>(null);
  const rail = useRef<THREE.Group>(null);
  const hull = useRef<THREE.Group>(null);
  const wheels = useRef<THREE.Group>(null);
  const scratch = useMemo(() => ({ v: new THREE.Vector3(), c: new THREE.Color() }), []);

  useFrame(({ clock }, delta) => {
    const now = Date.now();
    // Turret: toward the target, else back to the front.
    const t = turret.current;
    if (t && t.parent) {
      let yaw = 0;
      const aim = aimRef?.current;
      if (aim) {
        const local = t.parent.worldToLocal(scratch.v.copy(aim));
        yaw = Math.atan2(local.x, local.z - t.position.z);
      }
      let d = yaw - t.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      t.rotation.y += d * Math.min(1, delta * 4);
    }
    // Rail gun: kicks back and flares when it fires, then glows softly as it charges.
    const since = railFiredAt === undefined ? Infinity : now - railFiredAt;
    const kick = since < RECOIL_MS ? Math.pow(1 - since / RECOIL_MS, 2) : 0;
    if (rail.current) rail.current.position.z = -kick * 0.32;
    const pulse = 0.7 + 0.2 * Math.sin(clock.elapsedTime * 3);
    own_.core.color.copy(scratch.c.set(PALETTE.cyan)).multiplyScalar(pulse + kick * 2.5);
    // Driving: tracks run, road wheels turn, the hull rocks a little.
    if (moving) {
      own_.tread.map!.offset.y -= delta * 1.6;
      wheels.current?.children.forEach(w => { w.rotation.x += delta * 9; });
    }
    if (hull.current) hull.current.rotation.x = moving ? Math.sin(clock.elapsedTime * 7) * 0.012 : 0;
  });

  return (
    <group scale={TITAN_SCALE}>
      <ContactShadow size={[2.5, 3.1]} />
      {/* Tracks: dark belts with running treads, sprockets at each end, road wheels below the skirts. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * TRACK_X, 0, 0]}>
          <Plate size={[0.4, 0.42, 2.45]} radius={0.15} material={own_.tread} position={[0, 0.23, 0]} />
          <Wheel radius={0.18} width={0.1} segments={10} material={dark} position={[s * 0.19, 0.26, 1.08]} />
          <Wheel radius={0.18} width={0.1} segments={10} material={dark} position={[s * 0.19, 0.26, -1.08]} />
        </group>
      ))}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => ROAD_WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * (TRACK_X + 0.21), 0.17, z]}>
            <Wheel radius={0.15} width={0.05} segments={12} material={steel} />
            <Wheel radius={0.05} width={0.07} segments={6} material={black} />
          </group>
        )))}
      </group>

      <group ref={hull}>
        {/* Hull, with a row of armour blocks across the lower nose. */}
        <Prism outline={HULL} depth={1.2} axis="x" material={armour} />
        {[-0.42, -0.14, 0.14, 0.42].map(x => (
          <Plate key={x} size={[0.26, 0.17, 0.08]} material={dark} position={[x, 0.46, 1.27]} rotation={[-0.56, 0, 0]} />
        ))}
        {/* Headlights in housings at the glacis corners; small tail lights. */}
        {[-0.45, 0.45].map(x => (
          <group key={x}>
            <Plate size={[0.18, 0.07, 0.12]} material={dark} position={[x, 0.73, 1.09]} rotation={[GLACIS, 0, 0]} />
            <Strip size={[0.11, 0.035, 0.015]} material={glow(PALETTE.headlight)} position={[x, 0.735, 1.152]} />
            <Strip size={[0.08, 0.035, 0.015]} material={glow(PALETTE.warning)} position={[x, 0.86, -1.258]} />
          </group>
        ))}
        {/* Engine deck: vent slats; exhaust boxes on the rear plate. */}
        {[-1.05, -0.95, -0.85, -0.75, -0.65].map(z => <Plate key={z} size={[0.86, 0.015, 0.05]} material={black} position={[0, 0.967, z]} />)}
        {[-0.38, 0.38].map(x => <Plate key={x} size={[0.24, 0.14, 0.08]} material={dark} position={[x, 0.7, -1.29]} />)}

        {/* Side skirts: composite, with a deck over the track, add-on armour modules, two team stripes. */}
        {[-1, 1].map(s => (
          <group key={s}>
            <Prism outline={SKIRT} depth={0.08} axis="x" material={composite} position={[s * SKIRT_X, 0, 0]} />
            <Plate size={[0.44, 0.04, 2.25]} material={composite} position={[s * 0.81, 0.88, -0.175]} />
            <Plate size={[0.44, 0.04, 0.45]} material={composite} position={[s * 0.81, 0.74, 1.125]} rotation={[0.675, 0, 0]} />
            {MODULES_Z.map(z => <Plate key={z} size={[0.05, 0.4, 0.41]} material={armour} position={[s * (SKIRT_X + 0.065), 0.63, z]} />)}
            {[-0.38, -0.2].map(z => (
              <Plate key={z} size={[0.012, 0.46, 0.07]} material={paint} position={[s * (SKIRT_X + 0.095), 0.63, z]} rotation={[-0.35, 0, 0]} />
            ))}
          </group>
        ))}

        {/* Turret ring, then the turret: two angular tiers. */}
        <Turned profile={[[0.44, 0], [0.44, 0.06]]} segments={12} material={black} position={[0, 0.96, -0.2]} rotation={[-Math.PI / 2, 0, 0]} />
        <group ref={turret} position={[0, 1.02, -0.2]}>
          <Prism outline={TURRET} depth={0.26} axis="y" material={armour} />
          <Prism outline={TURRET_TOP} depth={0.1} axis="y" material={armour} position={[0, 0.26, 0]} />
          {/* Roof: team colour panel, hatch, commander's sight, remote weapon station, antennas. */}
          <Plate size={[0.6, 0.015, 0.28]} material={paint} position={[0, 0.367, -0.5]} />
          <Plate size={[0.22, 0.025, 0.22]} material={dark} position={[-0.2, 0.37, -0.12]} />
          <group position={[-0.22, 0.36, 0.22]}>
            <Turned profile={[[0.08, 0], [0.08, 0.14], [0.001, 0.14]]} segments={8} material={housing} rotation={[-Math.PI / 2, 0, 0]} />
            <Plate size={[0.08, 0.04, 0.01]} material={black} position={[0, 0.09, 0.075]} />
          </group>
          <group position={[0.2, 0.36, 0.05]}>
            <Plate size={[0.16, 0.08, 0.18]} material={dark} position={[0, 0.04, 0]} />
            <Plate size={[0.07, 0.07, 0.09]} material={housing} position={[0.1, 0.1, 0.02]} />
            <Turned profile={[[0.018, 0], [0.018, 0.3]]} segments={6} material={black} position={[-0.02, 0.1, 0.05]} />
          </group>
          {[-1, 1].map(s => (
            <group key={s} position={[s * 0.36, 0.36, -0.66]}>
              <Plate size={[0.06, 0.06, 0.06]} material={dark} position={[0, 0.03, 0]} />
              <Turned profile={[[0.008, 0], [0.005, 0.55]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
            </group>
          ))}
          {/* The rail gun on its recoil slide. */}
          <group ref={rail} position={[0, GUN_Y - 1.02, 0]}>
            <Plate size={[0.36, 0.22, 0.2]} material={dark} position={[0, 0, 0.9]} />
            <Prism outline={HOUSING} depth={0.2} axis="x" material={armour} />
            {[1.0, 1.07, 1.14, 1.21].map(z => [-1, 1].map(s => (
              <Plate key={`${z}${s}`} size={[0.012, 0.11, 0.035]} material={black} position={[s * 0.1, 0, z]} />
            )))}
            <Plate size={[0.06, 0.012, 0.4]} material={dark} position={[0, 0.105, 1.05]} />
            {/* The two rails, the charging slot glowing between them, and the clamps holding them. */}
            {[-1, 1].map(s => <Prism key={s} outline={RAIL} depth={RAIL_W} axis="x" material={armour} position={[s * (SLOT_W + RAIL_W) / 2, 0, 0]} />)}
            <Strip size={[SLOT_W - 0.025, 0.13, 0.96]} material={own_.core} position={[0, 0, 1.8]} />
            <Plate size={[SLOT_W, 0.04, 0.96]} material={black} position={[0, -0.05, 1.8]} />
            {CLAMPS_Z.map(z => <Plate key={z} size={[0.23, 0.24 - (z - 1.32) * 0.06, 0.05]} material={dark} position={[0, 0, z]} />)}
            <Plate size={[0.22, 0.17, 0.05]} material={steel} position={[0, 0, 2.3]} />
            <Turned profile={[[0.06, 0], [0.06, 0.5], [0.075, 0.5], [0.075, 0.6], [0.04, 0.6]]} segments={10} material={steel} position={[0, 0, 2.33]} />
            <mesh ref={flashRef} position={[0, 0, 3.0]} visible={false} raycast={() => null}>
              <sphereGeometry args={[0.18, 8, 6]} />
              <meshBasicMaterial color="#9be7ff" transparent opacity={0.85} toneMapped={false} depthWrite={false} />
            </mesh>
          </group>
        </group>
      </group>
      {decoy && (
        <mesh position={[0, 0.6, 0]} raycast={() => null}>
          <boxGeometry args={[2.4, 1.6, 3.2]} />
          <meshBasicMaterial color={teamColor} wireframe transparent opacity={0.2} />
        </mesh>
      )}
    </group>
  );
};
