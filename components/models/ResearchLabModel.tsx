// Advanced Research, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military, and a little ominous: a dome of security glass on a heavy drum, and inside
// it, held up off the floor by bundles of cable from the dome's crown, a supercomputer. A chamfered
// base; the drum (a dark plinth, armoured wall panels, a team band, vents, an airlock at the front);
// over it the glass, held in a cage of ribs and a ring at its waist. The machine: a tall black
// monolith tapering to a narrower lower module, faceted down its front, stacked rack modules down
// both sides with small red lights, and below it a column of red data running down into a socket
// in the floor. Round the dome, as the lab always had, a ring in the team's colour turns with a
// node on it.
//
// While research runs (`active`), the data column flickers bright, the rack lights blink and the
// ring turns fast; idle, the column glows low and the ring turns slowly.
//
// Built facing +Z, about 12 across and 10 tall to the ring's top, in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Loft, Plate, Strip, Turned } from '../kit/shapes';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const BASE_H = 0.5;
// The drum, and the dome on it.
const DRUM = { r: 5.0, top: 2.3 };
const DOME = { r: 4.7 };
// The machine inside: its lower module, its body, the data column below and the socket.
const BODY = { y0: 3.0, y1: 6.4, hx: 1.0, hz: 0.7 };
const COLUMN = { y0: BASE_H + 0.5, hx: 0.38, hz: 0.28 };
const RING = { y: 5.6, r: 5.6 };
const RACKS = 4;

// Security glass, shared by every lab: tinted, glossy, see-through.
let glassMaterial: THREE.MeshStandardMaterial | null = null;
const glass = () => (glassMaterial ??= new THREE.MeshStandardMaterial({
  color: '#8fa6bb', transparent: true, opacity: 0.2, roughness: 0.05, metalness: 0.7,
  depthWrite: false, side: THREE.DoubleSide,
}));

// The dome's profile, waist to crown, as [radius, height above the drum].
const domeProfile = (r: number, n = 10): [number, number][] =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = (k / n) * (Math.PI / 2);
    return [Math.max(0.001, Math.cos(a) * r), Math.sin(a) * r];
  });

export const ResearchLabModel: React.FC<{ teamColor: string; active: boolean }> = ({ teamColor, active }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe');

  // The data column and rack lights, red; the ring's node: this lab's own, so they can change.
  const data = useMemo(() => own(glow(PALETTE.warning)) as THREE.MeshBasicMaterial, []);
  const racks = useMemo(() => own(glow(PALETTE.warning)) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => { data.dispose(); racks.dispose(); }, [data, racks]);
  const tint = useMemo(() => new THREE.Color(), []);
  const ring = useRef<THREE.Group>(null);
  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime, dt = Math.min(delta, 0.05);
    if (ring.current) ring.current.rotation.y += dt * (active ? 1.6 : 0.3);
    const flicker = active ? 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 5.3) : 0.35 + 0.05 * Math.sin(t * 1.5);
    data.color.copy(tint.set(PALETTE.warning)).multiplyScalar(flicker);
    racks.color.copy(tint.set(PALETTE.warning)).multiplyScalar(active ? (Math.sin(t * 9) > 0 ? 1.1 : 0.2) : 0.5);
  });

  // The cage's ribs: half-circles over the dome, as meshes of a half torus.
  const rib = useMemo(() => new THREE.TorusGeometry(DOME.r + 0.03, 0.07, 4, 20, Math.PI), []);
  useEffect(() => () => rib.dispose(), [rib]);

  return (
    <group>
      {/* --- The base and the drum --- */}
      <Loft bottom={[[-6.2, -5.0], [-5.0, -6.2], [5.0, -6.2], [6.2, -5.0], [6.2, 5.0], [5.0, 6.2], [-5.0, 6.2], [-6.2, 5.0]]}
        top={[[-6.0, -4.9], [-4.9, -6.0], [4.9, -6.0], [6.0, -4.9], [6.0, 4.9], [4.9, 6.0], [-4.9, 6.0], [-6.0, 4.9]]} height={BASE_H} material={dark} />
      <Turned profile={[[DRUM.r + 0.25, BASE_H], [DRUM.r + 0.25, BASE_H + 0.5], [DRUM.r, BASE_H + 0.6], [DRUM.r, DRUM.top - 0.2], [DRUM.r + 0.12, DRUM.top - 0.2], [DRUM.r + 0.12, DRUM.top], [0.001, DRUM.top]]}
        segments={16} material={grey} rotation={UP} />
      <Turned profile={[[DRUM.r + 0.03, 1.55], [DRUM.r + 0.03, 1.7]]} segments={16} material={paint} rotation={UP} />
      {/* Armoured wall panels and vents round the drum. */}
      {Array.from({ length: 16 }, (_, k) => (k / 16) * Math.PI * 2 + Math.PI / 16).map((a, k) => (
        <group key={a} rotation={[0, a, 0]}>
          <Plate size={[1.5, 0.75, 0.1]} material={k % 4 === 1 ? dark : light} position={[0, 1.05, DRUM.r * Math.cos(Math.PI / 16) + 0.04]} />
          {k % 4 === 1 && [0.9, 1.05, 1.2].map(y => <Plate key={y} size={[1.2, 0.05, 0.05]} material={black} position={[0, y, DRUM.r * Math.cos(Math.PI / 16) + 0.1]} />)}
        </group>
      ))}
      {/* An airlock at the front. */}
      <group position={[0, BASE_H, DRUM.r - 0.1]}>
        <Plate size={[2.2, 2.2, 1.4]} material={light} position={[0, 1.1, 0.5]} />
        <Plate size={[2.4, 0.2, 1.6]} material={dark} position={[0, 2.25, 0.5]} />
        <Plate size={[1.2, 1.6, 0.06]} material={dark} position={[0, 0.85, 1.22]} />
        <Plate size={[0.03, 1.6, 0.03]} material={grey} position={[0, 0.85, 1.26]} />
        <Strip size={[0.5, 0.06, 0.04]} material={lamp} position={[0, 1.8, 1.25]} />
        <Strip size={[0.1, 0.2, 0.04]} material={glow(PALETTE.warning)} position={[0.85, 1.0, 1.25]} />
      </group>

      {/* --- The security glass, its cage of ribs and its waist ring --- */}
      <Turned profile={domeProfile(DOME.r)} segments={24} material={glass()} rotation={UP} position={[0, DRUM.top, 0]} shadow={false} />
      {[0, 1, 2, 3].map(k => (
        <mesh key={k} geometry={rib} material={dark} position={[0, DRUM.top, 0]} rotation={[0, (k * Math.PI) / 4, 0]} />
      ))}
      <Turned profile={[[DOME.r + 0.08, 0], [DOME.r + 0.08, 0.25]]} segments={24} material={dark} rotation={UP} position={[0, DRUM.top, 0]} />
      {(() => {
        const y = DOME.r * Math.sin(Math.PI / 4), r = DOME.r * Math.cos(Math.PI / 4) + 0.04;
        return <Turned profile={[[r + 0.06, -0.08], [r + 0.06, 0.08]]} segments={24} material={dark} rotation={UP} position={[0, DRUM.top + y, 0]} />;
      })()}
      <Turned profile={[[0.8, 0], [0.8, 0.3], [0.4, 0.5], [0.001, 0.55]]} segments={12} material={grey} rotation={UP} position={[0, DRUM.top + DOME.r - 0.05, 0]} />

      {/* --- The supercomputer, hung from the crown --- */}
      {/* The floor socket and the column of red data running down into it. */}
      <Plate size={[1.6, 0.5, 1.3]} material={dark} position={[0, BASE_H + 0.25, 0]} />
      <Plate size={[COLUMN.hx * 2, BODY.y0 - COLUMN.y0, COLUMN.hz * 2]} material={black} position={[0, (COLUMN.y0 + BODY.y0) / 2, 0]} />
      <Plate size={[COLUMN.hx * 2 - 0.12, BODY.y0 - COLUMN.y0 - 0.25, 0.04]} material={data} position={[0, (COLUMN.y0 + BODY.y0) / 2, COLUMN.hz + 0.02]} />
      {[-1, 1].map(s => <Plate key={s} size={[0.1, BODY.y0 - COLUMN.y0 - 0.2, 0.1]} material={grey} position={[s * (COLUMN.hx + 0.1), (COLUMN.y0 + BODY.y0) / 2, 0.1]} />)}
      {/* The lower module, tapering in, then the body. */}
      <Loft bottom={[[-0.6, -0.45], [0.6, -0.45], [0.6, 0.45], [-0.6, 0.45]]} top={[[-BODY.hx, -BODY.hz], [BODY.hx, -BODY.hz], [BODY.hx, BODY.hz], [-BODY.hx, BODY.hz]]}
        height={0.9} material={dark} position={[0, BODY.y0, 0]} />
      <Plate size={[BODY.hx * 2, BODY.y1 - BODY.y0 - 0.9, BODY.hz * 2]} material={black} position={[0, (BODY.y0 + 0.9 + BODY.y1) / 2, 0]} />
      {/* Faceted down its front: a chevron of plates, a red mark. */}
      {[-1, 1].map(s => (
        <Plate key={s} size={[0.9, 2.2, 0.08]} material={dark} position={[s * 0.45, BODY.y0 + 2.0, BODY.hz + 0.03]} rotation={[0, s * -0.25, 0]} />
      ))}
      <Strip size={[0.14, 0.14, 0.04]} material={racks} position={[0.4, BODY.y1 - 0.8, BODY.hz + 0.09]} />
      {/* Rack modules stacked down both sides, each with a small red light. */}
      {[-1, 1].flatMap(s => Array.from({ length: RACKS }, (_, k) => BODY.y0 + 1.1 + k * 0.62).map(y => (
        <group key={`${s}${y}`} position={[s * (BODY.hx + 0.16), y, 0]}>
          <Plate size={[0.3, 0.55, BODY.hz * 1.6]} material={dark} />
          <Strip size={[0.04, 0.06, 0.06]} material={racks} position={[s * 0.16, 0.12, 0.25]} />
        </group>
      )))}
      {/* Cable bundles up from the body's shoulders to the crown. */}
      {[[-0.75, -0.5], [0.75, -0.5], [-0.75, 0.5], [0.75, 0.5]].map(([x, z]) => {
        const top = DRUM.top + Math.sqrt(DOME.r ** 2 - (x * 1.6) ** 2 - (z * 1.6) ** 2) - 0.1;
        return (
          <group key={`${x}${z}`}>
            {[-0.06, 0.06].map(d => (
              <Plate key={d} size={[0.07, top - BODY.y1, 0.07]} material={grey} position={[x + d, (BODY.y1 + top) / 2, z]}
                rotation={[-z * 0.18, 0, x * 0.18]} />
            ))}
          </group>
        );
      })}
      <Plate size={[BODY.hx * 2 + 0.1, 0.2, BODY.hz * 2 + 0.1]} material={steel} position={[0, BODY.y1 + 0.1, 0]} />

      {/* --- The ring round the dome, in the team's colour, with its node --- */}
      <group ref={ring} position={[0, RING.y, 0]}>
        <Turned profile={[[RING.r, -0.08], [RING.r + 0.18, -0.08], [RING.r + 0.18, 0.08], [RING.r, 0.08]]} segments={32} material={glow(teamColor)} rotation={UP} shadow={false} />
        {[0, Math.PI].map(a => (
          <group key={a} rotation={[0, a, 0]}>
            <Plate size={[0.5, 0.5, 0.5]} material={grey} position={[RING.r + 0.09, 0, 0]} />
            <Strip size={[0.2, 0.2, 0.52]} material={lamp} position={[RING.r + 0.09, 0, 0]} />
          </group>
        ))}
      </group>
      {/* Two pylons carrying the ring's track. */}
      {[1, -1].map(s => (
        <group key={s} position={[s * (RING.r + 0.09), 0, 0]}>
          <Plate size={[0.35, RING.y - 0.35 - BASE_H, 0.35]} material={grey} position={[0, (BASE_H + RING.y - 0.35) / 2, 0]} />
          <Plate size={[0.6, 0.4, 0.6]} material={dark} position={[0, BASE_H + 0.2, 0]} />
        </group>
      ))}
    </group>
  );
};
