// The Battery Mule (sim type `sun_plate`), built from the unit kit (components/kit).
//
// Simple but military: a short, wide, heavily armoured tracked carrier. A heavy sloped cab at the
// front with armoured vision slits; thick composite skirts over the tracks, hung with armour
// modules and team stripes; and an armoured bay behind holding six upright battery cells, each an
// armoured six-sided casing with power glowing in the bands between its sections and on top.
// Power-yellow light also shows through the vent slits in the bay walls and at the charging port
// on the back.
//
// It moves: the tracks run while it drives. Anchored, it settles onto four stabiliser jacks and
// its cells glow brighter while it powers the vehicles round it.
//
// Built facing +Z, about 2.5 long in its own units, and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.35;
// Where charging links leave the battery cells, in the unit's own (unscaled) space.
export const BATTERY_MULE_LINK_Y = 1.55 * SCALE;

// Hull side profile: [forward, up].
const HULL: [number, number][] = [[-1.15, 0.3], [-1.15, 0.85], [1.0, 0.85], [1.22, 0.6], [1.22, 0.45], [1.05, 0.3]];
// Skirt, side view.
const SKIRT: [number, number][] = [[-1.2, 0.26], [-1.2, 0.9], [1.0, 0.9], [1.26, 0.6], [1.26, 0.42], [1.1, 0.26]];
// Cab, side view: a tall back, a long heavy sloped front.
const CAB: [number, number][] = [[0.12, 0.85], [0.12, 1.25], [0.5, 1.25], [1.02, 0.86], [1.02, 0.85]];
const CAB_SLOPE = Math.atan2(1.25 - 0.86, 1.02 - 0.5);
// Battery cells: upright six-sided armoured casings, three across and two deep.
const CELLS: [number, number][] = [-0.82, -0.36].flatMap(z => [-0.4, 0, 0.4].map(x => [x, z] as [number, number]));
const CELL_R = 0.17, CELL_H = 0.62;
const BAY = { y: 0.85, h: 0.3, front: 0.12, back: -1.15, x: 0.68 };
const TRACK_X = 0.82;
// How far the hull settles when anchored.
const SETTLE = 0.1;

export const BatteryMuleModel: React.FC<{
  teamColor: string;
  moving?: boolean;
  // Anchored, powering the vehicles round it.
  planted?: boolean;
}> = ({ teamColor, moving, planted }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), paint = teamPaint(teamColor);
  // This Mule's own: its tracks scroll, and its power light brightens when it anchors.
  const own_ = useMemo(() => ({ tread: own(kitMaterial('tread'), true), power: own(glow(PALETTE.power)) as THREE.MeshBasicMaterial }), []);
  useEffect(() => () => { own_.tread.map?.dispose(); own_.tread.dispose(); own_.power.dispose(); }, [own_]);
  own_.tread.map!.repeat.set(1, 7);

  const hull = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, delta) => {
    if (moving) own_.tread.map!.offset.y -= delta * 1.4;
    const h = hull.current;
    if (h) h.position.y += ((planted ? -SETTLE : 0) - h.position.y) * Math.min(1, delta * 4);
    const level = planted ? 1.1 + 0.25 * Math.sin(clock.elapsedTime * 5) : 0.65 + 0.1 * Math.sin(clock.elapsedTime * 2);
    own_.power.color.copy(scratch.set(PALETTE.power)).multiplyScalar(level);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.6, 2.9]} />
      {/* Tracks: wide belts, sprockets at each end. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * TRACK_X, 0, 0]}>
          <Plate size={[0.44, 0.44, 2.3]} radius={0.15} material={own_.tread} position={[0, 0.24, 0]} />
          <Wheel radius={0.18} width={0.1} segments={10} material={dark} position={[s * 0.21, 0.27, 1.0]} />
          <Wheel radius={0.18} width={0.1} segments={10} material={dark} position={[s * 0.21, 0.27, -1.0]} />
        </group>
      ))}

      {/* Stabiliser jacks, down when anchored: a ram at each corner on a pad. */}
      {planted && [-1, 1].flatMap(sx => [-1, 1].map(sz => (
        <group key={`${sx}${sz}`} position={[sx * 1.2, 0, sz * 0.9]}>
          <Plate size={[0.3, 0.05, 0.3]} material={composite} position={[0, 0.025, 0]} />
          <Strip size={[0.31, 0.012, 0.31]} material={own_.power} position={[0, 0.045, 0]} />
          <Turned profile={[[0.05, 0.05], [0.05, 0.5]]} segments={6} material={steel} rotation={[-Math.PI / 2, 0, 0]} />
          <Plate size={[0.16, 0.16, 0.16]} material={dark} position={[-sx * 0.04, 0.55, 0]} />
        </group>
      )))}

      <group ref={hull}>
        <Prism outline={HULL} depth={1.24} axis="x" material={armour} />
        {/* Heavy skirts with a deck over the tracks, armour modules and two team stripes. */}
        {[-1, 1].map(s => (
          <group key={s}>
            <Prism outline={SKIRT} depth={0.12} axis="x" material={composite} position={[s * 1.1, 0, 0]} />
            <Plate size={[0.46, 0.05, 2.2]} material={composite} position={[s * 0.85, 0.875, -0.1]} />
            {[-0.82, -0.27, 0.28].map(z => <Plate key={z} size={[0.06, 0.44, 0.52]} material={armour} position={[s * 1.19, 0.6, z]} />)}
            {[0.62, 0.78].map(z => (
              <Plate key={z} size={[0.012, 0.44, 0.07]} material={paint} position={[s * 1.165, 0.6, z]} rotation={[-0.35, 0, 0]} />
            ))}
          </group>
        ))}
        {/* Bumper blocks across the nose; headlights in housings; tail lights. */}
        {[-0.38, 0, 0.38].map(x => <Plate key={x} size={[0.34, 0.2, 0.1]} material={dark} position={[x, 0.5, 1.25]} rotation={[-0.5, 0, 0]} />)}
        {[-0.48, 0.48].map(x => (
          <group key={x}>
            <Plate size={[0.18, 0.08, 0.06]} material={dark} position={[x, 0.75, 1.12]} />
            <Strip size={[0.12, 0.04, 0.012]} material={glow(PALETTE.headlight)} position={[x, 0.75, 1.152]} />
            <Strip size={[0.1, 0.04, 0.012]} material={glow(PALETTE.warning)} position={[x, 0.75, -1.157]} />
          </group>
        ))}

        {/* The cab: heavy sloped front with armoured vision slits, a hatch, a periscope, team colour, an antenna. */}
        <Prism outline={CAB} depth={1.5} axis="x" material={armour} />
        <group position={[0, 1.06, 0.76]} rotation={[CAB_SLOPE, 0, 0]}>
          {[-0.42, 0, 0.42].map(x => <Plate key={x} size={[0.3, 0.02, 0.06]} material={black} position={[x, 0.005, 0.08]} />)}
          <Plate size={[1.3, 0.04, 0.05]} material={dark} position={[0, 0.01, -0.12]} />
        </group>
        <Plate size={[0.5, 0.015, 0.3]} material={paint} position={[-0.3, 1.258, 0.31]} />
        <Plate size={[0.28, 0.03, 0.26]} material={dark} position={[0.38, 1.265, 0.3]} />
        <Plate size={[0.1, 0.1, 0.08]} material={dark} position={[0.38, 1.33, 0.4]} />
        <group position={[-0.6, 1.25, 0.2]}>
          <Turned profile={[[0.008, 0], [0.005, 0.5]]} segments={4} material={black} rotation={[-Math.PI / 2 + 0.1, 0, 0]} />
        </group>

        {/* The battery bay: armoured walls with glowing vent slits. */}
        {[-1, 1].map(s => (
          <group key={s} position={[s * BAY.x, BAY.y + BAY.h / 2, (BAY.front + BAY.back) / 2]}>
            <Plate size={[0.1, BAY.h, BAY.front - BAY.back]} material={armour} />
            {[-0.06, 0.04].map(y => (
              <group key={y}>
                <Plate size={[0.012, 0.035, 0.9]} material={black} position={[s * 0.052, y, -0.05]} />
                <Strip size={[0.012, 0.015, 0.84]} material={own_.power} position={[s * 0.055, y, -0.05]} />
              </group>
            ))}
          </group>
        ))}
        <Plate size={[BAY.x * 2 + 0.1, BAY.h, 0.1]} material={armour} position={[0, BAY.y + BAY.h / 2, BAY.back + 0.05]} />
        {/* Charging port on the back. */}
        <Plate size={[0.3, 0.2, 0.06]} material={dark} position={[0, BAY.y + 0.2, BAY.back - 0.03]} />
        <Strip size={[0.18, 0.06, 0.012]} material={own_.power} position={[0, BAY.y + 0.2, BAY.back - 0.066]} />

        {/* Battery cells: upright armoured casings in sections, power glowing in the bands between
            them and through the window on top; steel terminals; cables run forward to the cab. */}
        {CELLS.map(([x, z]) => (
          <group key={`${x}${z}`} position={[x, BAY.y, z]}>
            <Turned profile={[[CELL_R, 0], [CELL_R, 0.2], [0.001, 0.2]]} segments={6} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[CELL_R - 0.012, 0.2], [CELL_R - 0.012, 0.27]]} segments={6} material={own_.power} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[CELL_R, 0.27], [CELL_R, 0.45], [0.001, 0.45]]} segments={6} material={dark} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[CELL_R - 0.012, 0.45], [CELL_R - 0.012, 0.51]]} segments={6} material={own_.power} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[CELL_R + 0.01, 0.51], [CELL_R + 0.01, CELL_H], [0.001, CELL_H]]} segments={6} material={armour} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[0.07, CELL_H], [0.07, CELL_H + 0.006], [0.001, CELL_H + 0.006]]} segments={6} material={own_.power} rotation={[-Math.PI / 2, 0, 0]} />
            <Turned profile={[[0.022, CELL_H], [0.022, CELL_H + 0.05]]} segments={6} material={steel} position={[0.1, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} />
          </group>
        ))}
        {[-0.4, 0, 0.4].map(x => <Plate key={x} size={[0.04, 0.04, 0.6]} material={black} position={[x, BAY.y + 0.16, -0.18]} />)}
      </group>
    </group>
  );
};
