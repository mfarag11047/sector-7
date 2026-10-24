// The Titan main battle tank (and the orbital-drop Titan), built from the unit kit
// (components/kit): the pilot for the kit's look.
//
// Clean, defined shapes rather than surface detail: a low wedge hull over dark tracks, armoured
// side skirts with a sawtooth lower edge, and a faceted turret carrying the rail gun: two long
// pointed blades round a glowing core, lit along their sides. Team colour on the skirts' top edges,
// the nose, the turret roof and a collar round the gun; cyan light panels on the glacis and the
// turret cheeks; a roof gun, a sensor and two whip antennas.
//
// It moves: the turret turns to what the tank is shooting at, the rail gun recoils and its lights
// flare when it fires, and the tracks run and the hull rocks while it drives.
//
// Built facing +Z, about 2.5 long in its own units; Unit.tsx scales it up.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

export const TITAN_SCALE = 2.6;

// Hull side profile: [forward, up].
const UPPER_HULL: [number, number][] = [[-1.18, 0.5], [-1.18, 0.86], [-0.95, 0.94], [0.5, 0.94], [1.08, 0.76], [1.2, 0.6], [1.04, 0.5]];
// Side skirt, with a sawtooth lower edge.
const SKIRT: [number, number][] = [[-1.28, 0.8], [1.1, 0.8], [1.3, 0.58], [1.12, 0.46], [0.84, 0.6], [0.56, 0.44], [0.28, 0.6], [0, 0.44],
  [-0.28, 0.6], [-0.56, 0.44], [-0.84, 0.6], [-1.12, 0.44], [-1.28, 0.52]];
// Turret top view: [right, forward].
const TURRET: [number, number][] = [[-0.56, -0.62], [0.56, -0.62], [0.64, 0.05], [0.36, 0.56], [-0.36, 0.56], [-0.64, 0.05]];
// A rail gun blade, top view: [right, forward], pointed at the muzzle.
const BLADE: [number, number][] = [[-0.15, 0.6], [0.15, 0.6], [0.17, 2.2], [0, 2.8], [-0.17, 2.2]];
const WHEELS_Z = [-0.88, -0.44, 0, 0.44, 0.88];
const TRACK_X = 0.8;
const RECOIL_MS = 450;
// The turret's angled front cheeks: the yaw that lays a panel along the right one, and where it sits.
const CHEEK_YAW = Math.atan2(0.51, 0.28);

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
  const paint = teamPaint(teamColor), light = glow(PALETTE.cyan);
  // This tank's own: its tracks scroll, and its rail gun's lights flare.
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
    // Rail gun: kicks back and flares when it fires, then pulses softly as it charges.
    const since = railFiredAt === undefined ? Infinity : now - railFiredAt;
    const kick = since < RECOIL_MS ? Math.pow(1 - since / RECOIL_MS, 2) : 0;
    if (rail.current) rail.current.position.z = -kick * 0.32;
    const pulse = 0.75 + 0.2 * Math.sin(clock.elapsedTime * 3);
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
      <ContactShadow size={[2.4, 3.0]} />
      {/* Tracks: dark belts with running treads, drive wheels at each end, road wheels below the skirts. */}
      {[-1, 1].map(s => (
        <group key={s} position={[s * TRACK_X, 0, 0]}>
          <Plate size={[0.42, 0.5, 2.5]} radius={0.16} material={own_.tread} position={[0, 0.27, 0]} />
          <Wheel radius={0.17} width={0.1} material={dark} position={[s * 0.2, 0.32, 1.12]} />
          <Wheel radius={0.17} width={0.1} material={dark} position={[s * 0.2, 0.32, -1.12]} />
        </group>
      ))}
      <group ref={wheels}>
        {[-1, 1].flatMap(s => WHEELS_Z.map(z => (
          <group key={`${s}${z}`} position={[s * (TRACK_X + 0.22), 0.2, z]}>
            <Wheel radius={0.15} width={0.06} material={dark} />
            <Wheel radius={0.06} width={0.08} material={black} />
          </group>
        )))}
      </group>

      <group ref={hull}>
        {/* Lower hull and the sloped upper hull, team colour across the nose. */}
        <Plate size={[1.2, 0.32, 2.3]} radius={0.06} material={dark} position={[0, 0.46, 0]} />
        <Prism outline={UPPER_HULL} depth={1.3} axis="x" material={armour} />
        <Plate size={[1.1, 0.06, 0.08]} radius={0.02} material={paint} position={[0, 0.6, 1.18]} />
        {/* Side skirts: team colour along the top, a light at the front. */}
        {[-1, 1].map(s => (
          <group key={s} position={[s * 1.04, 0, 0]}>
            <Prism outline={SKIRT} depth={0.08} axis="x" material={armour} />
            <Plate size={[0.09, 0.07, 2.2]} radius={0.02} material={paint} position={[0, 0.8, -0.08]} />
            <Strip size={[0.02, 0.06, 0.26]} material={light} position={[s * 0.045, 0.68, 0.86]} />
          </group>
        ))}
        {/* Light panels along the top of the glacis, below the turret. */}
        {[-0.4, 0, 0.4].map(x => <Strip key={x} size={[0.2, 0.025, 0.07]} material={light} position={[x, 0.945, 0.56]} />)}
        {/* Engine deck: a dark panel with vent slots, and two exhausts. */}
        <Plate size={[0.9, 0.04, 0.55]} radius={0.015} material={dark} position={[0, 0.955, -0.72]} />
        {[-0.18, -0.06, 0.06, 0.18].map(z => <Plate key={z} size={[0.74, 0.03, 0.05]} radius={0.01} material={black} position={[0, 0.97, -0.72 + z]} />)}
        {[-0.42, 0.42].map(x => (
          <group key={x} position={[x, 0.78, -1.2]} rotation={[0, Math.PI, 0]}>
            <Turned profile={[[0.08, 0], [0.09, 0.05], [0.09, 0.14], [0.075, 0.16]]} material={dark} />
            <Strip size={[0.1, 0.1, 0.01]} material={glow('#ff8a3d', 0.7)} position={[0, 0, 0.15]} />
          </group>
        ))}
        {/* Headlights and tow hooks on the nose. */}
        {[-0.45, 0.45].map(x => (
          <group key={x}>
            <Strip size={[0.12, 0.06, 0.02]} material={glow(PALETTE.headlight)} position={[x, 0.72, 1.135]} rotation={[-0.6, 0, 0]} />
            <Plate size={[0.08, 0.06, 0.1]} radius={0.015} material={dark} position={[x * 0.7, 0.52, 1.2]} />
          </group>
        ))}

        {/* The turret. */}
        <group ref={turret} position={[0, 0.94, -0.12]}>
          <Prism outline={TURRET} depth={0.4} axis="y" bevel={0.035} material={armour} />
          {/* Light panels on the angled front cheeks. */}
          {[-1, 1].map(s => (
            <Strip key={s} size={[0.34, 0.08, 0.02]} material={light} position={[s * 0.51, 0.22, 0.31]} rotation={[0, s * CHEEK_YAW, 0]} />
          ))}
          {/* Roof: team colour panel, hatch, sensor, roof gun and antennas. */}
          <Plate size={[0.8, 0.04, 0.36]} radius={0.015} material={paint} position={[0, 0.42, -0.34]} />
          <Wheel radius={0.14} width={0.06} material={dark} position={[0.2, 0.43, 0.08]} rotation={[0, 0, Math.PI / 2]} />
          <group position={[0.42, 0.45, 0.2]}>
            <Plate size={[0.18, 0.14, 0.16]} radius={0.025} material={dark} />
            <Strip size={[0.1, 0.05, 0.01]} material={light} position={[0, 0, 0.085]} />
          </group>
          <group position={[-0.24, 0.42, 0.02]}>
            <Plate size={[0.16, 0.12, 0.2]} radius={0.025} material={dark} position={[0, 0.06, 0]} />
            <Turned profile={[[0.022, 0], [0.022, 0.32], [0.03, 0.34], [0.03, 0.38]]} segments={8} material={black} position={[0, 0.08, 0.08]} />
          </group>
          {[-1, 1].map(s => (
            <group key={s} position={[s * 0.44, 0.4, -0.52]}>
              <Turned profile={[[0.01, 0], [0.006, 0.32]]} segments={5} material={black} rotation={[-Math.PI / 2 + 0.15, 0, 0]} />
              {s < 0 && <Strip size={[0.035, 0.035, 0.035]} material={glow(PALETTE.warning)} position={[0, 0.31, 0.05]} />}
            </group>
          ))}
          {/* Bustle: a stowage box behind. */}
          <Plate size={[0.9, 0.2, 0.2]} radius={0.04} material={dark} position={[0, 0.17, -0.72]} />
          {/* Mantlet, and the rail gun on its recoil slide: two pointed blades round a glowing core,
              lit along their sides, a team-colour collar near the base. */}
          <Plate size={[0.46, 0.3, 0.22]} radius={0.05} material={dark} position={[0, 0.2, 0.62]} />
          <group ref={rail} position={[0, 0.22, 0]}>
            <Plate size={[0.4, 0.4, 0.42]} radius={0.05} material={dark} position={[0, 0, 0.86]} />
            <Prism outline={BLADE} depth={0.14} axis="y" bevel={0.025} material={armour} position={[0, -0.17, 0]} />
            <Prism outline={BLADE} depth={0.14} axis="y" bevel={0.025} material={armour} position={[0, 0.03, 0]} />
            <Strip size={[0.08, 0.035, 1.9]} material={own_.core} position={[0, 0, 1.6]} />
            {[-1, 1].map(s => [-0.1, 0.1].map(y => (
              <Strip key={`${s}${y}`} size={[0.02, 0.05, 1.1]} material={own_.core} position={[s * 0.163, y, 1.6]} />
            )))}
            <Strip size={[0.12, 0.012, 0.4]} material={own_.core} position={[0, 0.175, 2.2]} />
            <Plate size={[0.42, 0.42, 0.12]} radius={0.03} material={paint} position={[0, 0, 1.15]} />
            <mesh ref={flashRef} position={[0, 0, 2.9]} visible={false} raycast={() => null}>
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
