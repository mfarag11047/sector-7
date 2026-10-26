// The Core Refinery, built from the unit kit (components/kit) in the base structures' greys.
//
// Simple but military: a reactor sphere held in four arms, under a cooling stack. On a stepped
// round dais with a team band, four heavy arms rise from footings at the corners, bend at an elbow
// where a clamp reaches in to grip the sphere, and carry a collar ring above it. The sphere:
// armoured, a band of light round its waist in the yellow of core energy (CoreNode.tsx), and
// capsule prongs standing out from it above and below, each with a lit collar where it meets the
// shell. On the collar, a cooling stack in the shape of a reactor tower, curving in to its waist
// and out to its lip, steam rising from it. Between the arms' feet, an electric security fence:
// posts with insulators, a see-through mesh, live wires humming in core yellow, a warning sign, and
// now and then an arc cracking across a panel.
//
// Level 2 (`level`) stands its stack taller, lights a second band on the sphere and every prong's
// collar. While it upgrades (`upgrading`) the light pulses fast and the collar ring turns.
//
// Built facing +Z, about 12 across and 13 tall to the stack's lip (15 at level 2), in world units.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { Strut } from '../kit/strut';
import { CORE_COLOR } from '../CoreNode';
import { Plate, Strip, Turned } from '../kit/shapes';

// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const DAIS_H = 0.8;
// The sphere is big enough to stand out round the cooling stack's foot when seen from above.
const SPHERE = { y: 5.4, r: 4.4 };
const COLLAR = { y: 9.6, r: 2.6 };
// The prongs' size, against the sphere's.
const PRONG = SPHERE.r / 2.2;
// The arms: their heading (the corners), and the radius and height of foot, elbow and top.
const ARMS = [0, 1, 2, 3].map(k => (k * Math.PI) / 2 + Math.PI / 4);
const FOOT = { r: 5.8, y: DAIS_H }, ELBOW = { r: 5.2, y: 5.4 }, TOP = { r: COLLAR.r + 0.1, y: COLLAR.y };
// The prongs: their heading round the sphere and their elevation.
const PRONGS = [
  ...[0, 1, 2, 3].map(k => ({ h: (k * Math.PI) / 2, e: 0.7 })),
  ...[0, 1, 2, 3].map(k => ({ h: (k * Math.PI) / 2 + Math.PI / 4, e: -0.75 })),
];
const PUFFS = 3;
// The electric fence between the arms' feet: the panels stand on the chord between each pair, this
// far in from the centre, and run between the footings; its posts and live wires.
const FENCE = { d: FOOT.r * Math.cos(Math.PI / 4), half: FOOT.r * Math.sin(Math.PI / 4) - 0.75, h: 2.2 };
const FENCE_POSTS = 5;
const FENCE_WIRES = [0.55, 1.05, 1.55, 2.05];
// The cooling stack's radius at its foot, waist and lip: short and broad.
const STACK = { foot: 3.1, waist: 1.9, lip: 2.4 };

// Chain-link for the fence: see-through, shared by every refinery.
let fenceMaterial: THREE.MeshStandardMaterial | null = null;
const fenceMesh = () => (fenceMaterial ??= new THREE.MeshStandardMaterial({ color: '#3a3e44', transparent: true, opacity: 0.35, roughness: 0.8, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));

const at = (heading: number, r: number, y: number) => new THREE.Vector3(Math.sin(heading) * r, y, Math.cos(heading) * r);

export const RefineryModel: React.FC<{ teamColor: string; level: 1 | 2; upgrading: boolean }> = ({ teamColor, level, upgrading }) => {
  const light = kitMaterial('structLight'), grey = kitMaterial('structGrey'), dark = kitMaterial('structDark');
  const black = kitMaterial('black'), steel = kitMaterial('steel'), paint = teamPaint(teamColor);
  const lamp = glow('#dbeafe');
  const stackTop = level === 2 ? 14.7 : 13.3;

  // The reactor's light (its bands and the prongs' collars), and the steam: this refinery's own.
  const core = useMemo(() => own(glow(CORE_COLOR)) as THREE.MeshBasicMaterial, []);
  const dim = useMemo(() => own(glow(CORE_COLOR)) as THREE.MeshBasicMaterial, []);
  // The fence's live wires, and the arc that now and then jumps between two of them.
  const wire = useMemo(() => own(glow(CORE_COLOR)) as THREE.MeshBasicMaterial, []);
  const arc = useMemo(() => own(glow('#fff4c2')) as THREE.MeshBasicMaterial, []);
  useEffect(() => () => { wire.dispose(); arc.dispose(); }, [wire, arc]);
  const arcs = useRef<(THREE.Group | null)[]>([]);
  const steam = useMemo(() => Array.from({ length: PUFFS }, () => new THREE.MeshBasicMaterial({ color: '#c8d3de', transparent: true, opacity: 0.2, depthWrite: false })), []);
  useEffect(() => () => { core.dispose(); dim.dispose(); steam.forEach(m => m.dispose()); }, [core, dim, steam]);
  const tint = useMemo(() => new THREE.Color(), []);
  const collar = useRef<THREE.Group>(null);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const puffGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  useEffect(() => () => puffGeometry.dispose(), [puffGeometry]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const pulse = upgrading ? 0.6 + 0.4 * Math.sin(t * 9) : 0.8 + 0.2 * Math.sin(t * (level === 2 ? 3 : 1.8));
    core.color.copy(tint.set(CORE_COLOR)).multiplyScalar(pulse);
    dim.color.copy(tint.set(CORE_COLOR)).multiplyScalar(level === 2 ? pulse : 0.15);
    if (collar.current && upgrading) collar.current.rotation.y += Math.min(delta, 0.05) * 1.2;
    // The fence hums, flickering; every so often an arc cracks across one panel.
    wire.color.copy(tint.set(CORE_COLOR)).multiplyScalar(0.7 + 0.15 * Math.sin(t * 31) + 0.15 * Math.sin(t * 13.7));
    const beat = Math.floor(t * 3), side = beat % 4, chance = Math.abs(Math.sin(beat * 12.9898) * 43758.5) % 1;
    arcs.current.forEach((g, k) => { if (g) g.visible = k === side && chance > 0.55 && (t * 3) % 1 < 0.35; });
    // Steam: puffs rising from the lip, swelling and thinning, one after another.
    puffs.current.forEach((p, k) => {
      if (!p) return;
      const u = ((t * 0.25 + k / PUFFS) % 1);
      p.position.set(Math.sin(k * 2.1) * 0.3 + u * 0.8, stackTop + 0.4 + u * 4, Math.cos(k * 2.1) * 0.3);
      p.scale.setScalar(1.1 + u * 1.7);
      steam[k].opacity = 0.16 * (1 - u) * Math.min(1, u * 6);
    });
  });

  // The cooling stack's profile: a curved tower, wide foot, narrow waist, flared lip.
  const stack = useMemo<[number, number][]>(() => {
    const y0 = COLLAR.y + 0.3, h = stackTop - y0, waist = 0.7;
    return Array.from({ length: 9 }, (_, k) => {
      const v = k / 8, y = y0 + v * h;
      const r = STACK.waist + (v < waist ? STACK.foot - STACK.waist : STACK.lip - STACK.waist) * Math.pow((v - waist) / (v < waist ? waist : 1 - waist), 2);
      return [r, y] as [number, number];
    });
  }, [stackTop]);

  return (
    <group>
      {/* --- The dais: stepped, a team band, a lit ring round its top --- */}
      <Turned profile={[[6.3, 0], [6.3, 0.35], [5.6, 0.45], [5.6, DAIS_H], [0.001, DAIS_H]]} segments={16} material={grey} rotation={UP} />
      <Turned profile={[[6.32, 0.12], [6.32, 0.26]]} segments={16} material={paint} rotation={UP} />
      <Turned profile={[[2.9, DAIS_H + 0.01], [3.1, DAIS_H + 0.01]]} segments={24} material={core} rotation={UP} />
      <Turned profile={[[2.2, DAIS_H], [2.2, SPHERE.y - SPHERE.r + 0.3], [1.6, SPHERE.y - SPHERE.r + 0.45]]} segments={12} material={dark} rotation={UP} />
      {/* Floor hatches between the arms, inside the fence. */}
      {ARMS.map(a => (
        <group key={a} rotation={[0, a + Math.PI / 4, 0]}>
          <Plate size={[1.2, 0.05, 0.7]} material={black} position={[0, DAIS_H + 0.02, 3.6]} />
          <Strip size={[0.15, 0.04, 0.1]} material={glow(PALETTE.warning)} position={[0.45, DAIS_H + 0.05, 3.6]} />
        </group>
      ))}

      {/* --- The electric security fence between the arms --- */}
      {ARMS.map((a, i) => (
        <group key={a} rotation={[0, a + Math.PI / 4, 0]} position={[0, DAIS_H, 0]}>
          <group position={[0, 0, FENCE.d]}>
            {/* Posts with insulators and caps, a see-through mesh, the live wires. */}
            {Array.from({ length: FENCE_POSTS }, (_, k) => -FENCE.half + (k * 2 * FENCE.half) / (FENCE_POSTS - 1)).map(x => (
              <group key={x} position={[x, 0, 0]}>
                <Plate size={[0.14, FENCE.h, 0.14]} material={dark} position={[0, FENCE.h / 2, 0]} />
                <Plate size={[0.24, 0.1, 0.24]} material={grey} position={[0, 0.05, 0]} />
                {FENCE_WIRES.map(y => <Plate key={y} size={[0.1, 0.1, 0.18]} material={black} position={[0, y, 0.06]} />)}
                <Turned profile={[[0.06, 0], [0.06, 0.12], [0.1, 0.14], [0.001, 0.2]]} segments={6} material={steel} rotation={UP} position={[0, FENCE.h, 0]} />
              </group>
            ))}
            <Plate size={[FENCE.half * 2, FENCE.h - 0.3, 0.02]} material={fenceMesh()} position={[0, (FENCE.h - 0.3) / 2 + 0.15, -0.04]} shadow={false} />
            {FENCE_WIRES.map(y => <Strip key={y} size={[FENCE.half * 2, 0.035, 0.035]} material={wire} position={[0, y, 0.12]} />)}
            {/* A warning sign on the middle post. */}
            <Plate size={[0.55, 0.45, 0.03]} material={glow(CORE_COLOR)} position={[0, 1.3, 0.2]} />
            <Plate size={[0.4, 0.08, 0.035]} material={black} position={[0, 1.3, 0.21]} rotation={[0, 0, 0.6]} />
            {/* An arc, now and then, cracking between two wires. */}
            <group ref={g => { arcs.current[i] = g; }} position={[FENCE.half * 0.4 * (i % 2 ? 1 : -1), 0, 0.14]} visible={false}>
              {[[0.55, 0.8, 0.5], [0.8, 1.05, -0.5]].map(([y0, y1, lean]) => (
                <Strip key={y0} size={[0.04, (y1 - y0) * 1.2, 0.04]} material={arc} position={[lean * 0.1, (y0 + y1) / 2, 0]} rotation={[0, 0, lean]} />
              ))}
            </group>
          </group>
        </group>
      ))}

      {/* --- The four arms --- */}
      {ARMS.map(a => {
        const foot = at(a, FOOT.r, FOOT.y), elbow = at(a, ELBOW.r, ELBOW.y), top = at(a, TOP.r, TOP.y);
        const clampIn = at(a, SPHERE.r + 0.15, SPHERE.y);
        return (
          <group key={a}>
            <group position={foot}>
              <Plate size={[1.4, 0.9, 1.4]} material={dark} position={[0, 0.0, 0]} rotation={[0, a, 0]} />
            </group>
            <Strut a={foot} b={elbow} t={0.8} material={light} />
            <Strut a={elbow} b={top} t={0.7} material={light} />
            {/* The elbow block, and the clamp reaching in to the sphere. */}
            <group position={elbow} rotation={[0, a, 0]}>
              <Plate size={[1.1, 1.1, 1.1]} material={grey} />
              <Strip size={[0.2, 0.5, 0.04]} material={lamp} position={[0, 0, 0.57]} />
            </group>
            <Strut a={elbow} b={clampIn} t={0.45} material={grey} />
            <group position={clampIn} rotation={[0, a, 0]}>
              <Plate size={[0.8, 0.9, 0.3]} material={dark} />
            </group>
            {/* A cable run down the arm's outer face. */}
            <Strut a={at(a, FOOT.r + 0.45, FOOT.y + 0.2)} b={at(a, ELBOW.r + 0.45, ELBOW.y)} t={0.14} material={black} />
          </group>
        );
      })}

      {/* --- The sphere, its bands and prongs --- */}
      <group position={[0, SPHERE.y, 0]}>
        <Turned profile={Array.from({ length: 13 }, (_, k) => {
          const e = -Math.PI / 2 + (k * Math.PI) / 12;
          return [Math.max(0.001, Math.cos(e) * SPHERE.r), Math.sin(e) * SPHERE.r] as [number, number];
        })} segments={20} material={light} rotation={UP} />
        <Turned profile={[[SPHERE.r + 0.04, -0.18], [SPHERE.r + 0.04, 0.18]]} segments={24} material={core} rotation={UP} />
        <Turned profile={[[SPHERE.r * 0.877 + 0.05, SPHERE.r * 0.48 - 0.1], [SPHERE.r * 0.877 + 0.05, SPHERE.r * 0.48 + 0.1]]} segments={24} material={dim} rotation={UP} />
        <Turned profile={[[SPHERE.r * 0.877 + 0.06, -SPHERE.r * 0.48 - 0.12], [SPHERE.r * 0.877 + 0.06, -SPHERE.r * 0.48 + 0.12]]} segments={24} material={grey} rotation={UP} />
        {/* A dark panel with the team's mark on its front. */}
        <Plate size={[2.0, 1.4, 0.1]} material={dark} position={[0, SPHERE.r * 0.24, SPHERE.r * 0.95]} rotation={[-0.25, 0, 0]} />
        <Plate size={[1.0, 0.18, 0.05]} material={paint} position={[0, SPHERE.r * 0.26, SPHERE.r * 0.95 + 0.06]} rotation={[-0.25, 0, 0]} />
        {PRONGS.map(({ h, e }, k) => {
          const dir = new THREE.Vector3(Math.sin(h) * Math.cos(e), Math.sin(e), Math.cos(h) * Math.cos(e));
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
          return (
            <group key={k} quaternion={q}>
              <group position={[0, 0, SPHERE.r]} scale={PRONG}>
                <Turned profile={[[0.42, -0.3], [0.42, 0.05]]} segments={10} material={dark} />
                <Turned profile={[[0.46, 0.05], [0.46, 0.15]]} segments={12} material={k % 2 ? dim : core} />
                <Turned profile={[[0.32, 0.15], [0.32, 1.1], [0.24, 1.3], [0.001, 1.35]]} segments={10} material={steel} />
                <Turned profile={[[0.34, 0.6], [0.34, 0.72]]} segments={10} material={grey} />
              </group>
            </group>
          );
        })}
      </group>

      {/* --- The collar ring above the sphere, carried by the arms --- */}
      <group ref={collar} position={[0, COLLAR.y, 0]}>
        <Turned profile={[[COLLAR.r - 0.9, -0.3], [COLLAR.r + 0.4, -0.3], [COLLAR.r + 0.4, 0.4], [COLLAR.r - 0.9, 0.4]]} segments={24} material={grey} rotation={UP} />
        {Array.from({ length: 24 }, (_, k) => (k / 24) * Math.PI * 2).map(a => (
          <group key={a} rotation={[0, a, 0]}>
            <Plate size={[0.2, 0.5, 0.3]} material={dark} position={[0, 0.05, COLLAR.r + 0.45]} />
          </group>
        ))}
      </group>

      {/* --- The cooling stack and its steam --- */}
      <Turned profile={stack} segments={20} material={light} rotation={UP} />
      <Turned profile={[[stack[stack.length - 1][0] + 0.08, stackTop - 0.25], [stack[stack.length - 1][0] + 0.08, stackTop]]} segments={20} material={dark} rotation={UP} />
      <Turned profile={[[stack[stack.length - 1][0] - 0.05, stackTop], [0.001, stackTop - 0.6]]} segments={20} material={black} rotation={UP} />
      <Turned profile={[[stack[1][0] + 0.06, stack[1][1] - 0.12], [stack[1][0] + 0.06, stack[1][1] + 0.12]]} segments={20} material={paint} rotation={UP} />
      <Strip size={[0.2, 0.2, 0.2]} material={glow(PALETTE.warning)} position={[stack[stack.length - 1][0], stackTop + 0.1, 0]} />
      {steam.map((m, k) => <mesh key={k} ref={el => { puffs.current[k] = el; }} geometry={puffGeometry} material={m} raycast={() => null} />)}
    </group>
  );
};
