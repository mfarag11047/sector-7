// The Swarm Host, built from the unit kit (components/kit).
//
// Simple but military: a big, sturdy armoured six-legged crawler, a mobile drone hive. A massive
// faceted armoured hull (a tapering belly, a dark skirt band, sloped upper armour to a flat deck),
// with a sensor block of amber lenses and a short gun on the glacis, headlights, antennas and team
// colour on the deck. Six short, thick armoured legs close in to the hull, three a side: a thigh
// to the knee, a shin down to a broad foot, each shin faced with a big segmented armour slab. In
// the deck, a split hatch over the hive.
//
// It moves: it walks on its legs, alternating tripods stepping together. Anchored (`anchored`), it
// kneels: the hull lowers to the ground and the legs splay out, then the hatch doors swing open
// and its micro crawler drones rise into view, ready to go. Unanchored, it closes up and stands.
//
// The legs are posed each frame by a two-link solve from hip to foot (kit/legs.ts), so the feet
// stay planted.
//
// Built facing +Z, about 2.3 long and 2.9 across its feet in its own units, and scaled up here.

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, PALETTE, teamPaint } from '../kit/materials';
import { poseLeg } from '../kit/legs';
import { ContactShadow, Loft, Plate, Prism, Strip, Turned, Wheel } from '../kit/shapes';

const SCALE = 2.2;
// The hull, top views [right, forward], matched point for point: the belly's underside, the widest
// line (the skirt), and the deck.
// A big, sturdy hull: the outlines below are drawn small and scaled up by this.
const HULL = 1.35;
const hull = (o: [number, number][]) => o.map(([x, z]) => [x * HULL, z * HULL] as [number, number]);
const BELLY = hull([[-0.38, -0.5], [0.38, -0.5], [0.42, -0.4], [0.42, 0.45], [0.32, 0.58], [-0.32, 0.58], [-0.42, 0.45], [-0.42, -0.4]]);
const SKIRT = hull([[-0.5, -0.82], [0.5, -0.82], [0.64, -0.6], [0.64, 0.55], [0.42, 0.86], [-0.42, 0.86], [-0.64, 0.55], [-0.64, -0.6]]);
const DECK = hull([[-0.32, -0.55], [0.32, -0.55], [0.42, -0.4], [0.42, 0.2], [0.26, 0.42], [-0.26, 0.42], [-0.42, 0.2], [-0.42, -0.4]]);
const BELLY_Y = -0.34, SKIRT_Y = 0.04, DECK_Y = 0.54;
// The hatch in the deck: its centre, width and length; the micro crawlers in the hive under it.
const HATCH_Z = -0.18, HATCH_W = 0.74, HATCH_L = 0.76;
const BROOD: [number, number][] = [-0.17, 0, 0.17].flatMap(x => [-0.2, 0.0, 0.2].map(z => [x, z] as [number, number]));
// The six legs, three down each side: their hips, their outward heading (the front and back
// pairs splayed fore and aft), and their step phase, alternating tripods.
const LEGS = [[1, 1, 0], [-1, 1, Math.PI], [1, 0, Math.PI], [-1, 0, 0], [1, -1, 0], [-1, -1, Math.PI]].map(([sx, sz, phase]) => ({
  hip: [sx * (sz ? 0.8 : 0.86), sz * 0.72] as [number, number], yaw: Math.atan2(-sz * 0.5, sx), phase,
}));
const THIGH = 0.5, SHIN = 0.62;
// Standing and kneeling: the hull's height and how far out the feet are from the hips.
const STAND = { hull: 0.86, reach: 0.58 }, KNEEL = { hull: 0.4, reach: 0.78 };

// A micro crawler drone waiting in the hive: a small rounded shell, four legs, an amber eye
// (CrawlerDroneModel is the drone itself).
const MicroCrawler: React.FC<{ body: THREE.Material; legs: THREE.Material; eye: THREE.Material; position: [number, number, number] }> = ({ body, legs, eye, position }) => (
  <group position={position} scale={1.3}>
    <Turned profile={[[0.04, 0], [0.05, 0.015], [0.036, 0.035], [0.001, 0.045]]} segments={8} material={body} position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    {[[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => (
      <Plate key={`${sx}${sz}`} size={[0.05, 0.012, 0.012]} material={legs} position={[sx * 0.06, 0.02, sz * 0.03]} rotation={[0, sx * sz * -0.5, sx * -0.5]} />
    ))}
    <Strip size={[0.024, 0.014, 0.01]} material={eye} position={[0, 0.03, 0.05]} />
  </group>
);

export const SwarmHostModel: React.FC<{ teamColor: string; anchored?: boolean; moving?: boolean }> = ({ teamColor, anchored, moving }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), housing = kitMaterial('housing'), paint = teamPaint(teamColor);
  const amber = glow(PALETTE.amber);

  const body = useRef<THREE.Group>(null);
  const hips = useRef<(THREE.Group | null)[]>([]);
  const thighs = useRef<(THREE.Group | null)[]>([]);
  const knees = useRef<(THREE.Group | null)[]>([]);
  const feet = useRef<(THREE.Group | null)[]>([]);
  const doors = useRef<(THREE.Group | null)[]>([]);
  const brood = useRef<THREE.Group>(null);
  const state = useMemo(() => ({ kneel: anchored ? 1 : 0, walk: 0, stride: 0 }), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = 1 - Math.exp(-dt * 2.5);
    state.kneel += ((anchored ? 1 : 0) - state.kneel) * k;
    state.walk += ((moving && !anchored ? 1 : 0) - state.walk) * (1 - Math.exp(-dt * 6));
    state.stride += dt * 5 * state.walk;
    const a = state.kneel;
    const hullY = STAND.hull + (KNEEL.hull - STAND.hull) * a;
    const reach = STAND.reach + (KNEEL.reach - STAND.reach) * a;
    const bob = Math.abs(Math.sin(state.stride)) * 0.03 * state.walk;
    if (body.current) body.current.position.y = hullY + bob;

    LEGS.forEach(({ hip, phase }, i) => {
      const h = hips.current[i], th = thighs.current[i], kn = knees.current[i], ft = feet.current[i];
      if (!h || !th || !kn || !ft) return;
      const hipY = hullY + bob - 0.02;
      h.position.set(hip[0], hipY, hip[1]);
      // The foot: out from the hip on the ground, lifted and swung while it steps.
      const s = state.stride + phase;
      const fx = reach + Math.cos(s) * 0.06 * state.walk;
      const fy = -hipY + Math.max(0, Math.sin(s)) * 0.12 * state.walk;
      ft.position.set(fx, fy, 0);
      poseLeg(THIGH, SHIN, fx, fy, th, kn);
    });

    // The hatch opens once it is down, and the brood rises into view.
    const open = Math.max(0, Math.min(1, (a - 0.6) / 0.4)) * 2.0;
    doors.current.forEach((d, i) => { if (d) d.rotation.z = (i ? 1 : -1) * open; });
    if (brood.current) {
      brood.current.visible = open > 1.0;
      brood.current.position.y = DECK_Y + 0.03 * Math.min(1, (open - 1.0));
    }
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2.9, 3.2]} />
      {/* The hull: belly, skirt band, sloped armour to the deck. */}
      <group ref={body} position={[0, STAND.hull, 0]}>
        <Loft top={SKIRT} bottom={BELLY} height={SKIRT_Y - BELLY_Y} material={dark} position={[0, BELLY_Y, 0]} />
        <Prism outline={SKIRT.map(([x, z]) => [x * 1.03, z * 1.03] as [number, number])} depth={0.06} axis="y" material={composite} position={[0, SKIRT_Y - 0.04, 0]} />
        <Loft top={DECK} bottom={SKIRT} height={DECK_Y - SKIRT_Y} material={armour} position={[0, SKIRT_Y, 0]} />

        {/* On the glacis: the sensor block of amber lenses, a short gun; headlights below. */}
        <group position={[0.27, 0.26, 0.9]}>
          <Plate size={[0.24, 0.18, 0.2]} material={dark} />
          {[[-0.04, 0.03], [0.04, 0.03], [-0.04, -0.03], [0.04, -0.03]].map(([x, y]) => (
            <Strip key={`${x}${y}`} size={[0.035, 0.035, 0.01]} material={amber} position={[x, y, 0.102]} />
          ))}
        </group>
        <group position={[-0.2, 0.26, 0.88]}>
          <Plate size={[0.18, 0.13, 0.18]} material={dark} />
          <Turned profile={[[0.025, 0.06], [0.025, 0.28], [0.034, 0.28], [0.034, 0.31]]} segments={6} material={black} />
        </group>
        {[-1, 1].map(s => <Strip key={s} size={[0.12, 0.035, 0.012]} material={glow(PALETTE.headlight)} position={[s * 0.32, -0.04, 1.12]} />)}

        {/* The deck: team colour, antennas, the hip housings at the corners. */}
        <Plate size={[0.5, 0.012, 0.08]} material={paint} position={[0, DECK_Y + 0.006, 0.42]} />
        {([[-0.44, -0.62, 0.5], [0.42, -0.62, 0.38], [0.32, -0.67, 0.3]] as const).map(([x, z, h]) => (
          <Turned key={`${x}${z}`} profile={[[0.012, 0], [0.008, h]]} segments={4} material={black} position={[x, DECK_Y, z]} rotation={[-Math.PI / 2, 0, 0]} />
        ))}
        {LEGS.map(({ hip }, i) => (
          <Plate key={i} size={[0.3, 0.34, 0.36]} material={composite} position={[hip[0] * 0.94, -0.02, hip[1]]} />
        ))}

        {/* The hatch over the hive: a dark well, the brood of micro crawlers on an amber-lit floor
            (in view once the doors are open), and two doors hinged at their outer edges. */}
        <group position={[0, 0, HATCH_Z]}>
          <Plate size={[HATCH_W, 0.01, HATCH_L]} material={black} position={[0, DECK_Y + 0.001, 0]} />
          <group ref={brood} position={[0, DECK_Y, 0]} visible={false}>
            <Plate size={[HATCH_W - 0.06, 0.006, HATCH_L - 0.06]} material={glow(PALETTE.amber, 0.35)} position={[0, 0.006, 0]} />
            {BROOD.map(([x, z]) => <MicroCrawler key={`${x}${z}`} body={housing} legs={black} eye={amber} position={[x, 0.008, z]} />)}
          </group>
          {[1, -1].map((s, i) => (
            <group key={s} ref={g => { doors.current[i] = g; }} position={[s * HATCH_W / 2, DECK_Y + 0.02, 0]}>
              <Plate size={[HATCH_W / 2, 0.04, HATCH_L]} material={armour} position={[-s * HATCH_W / 4, 0, 0]} />
              <Plate size={[HATCH_W / 2 - 0.08, 0.012, 0.04]} material={dark} position={[-s * HATCH_W / 4, 0.025, -HATCH_L / 4]} />
              <Plate size={[HATCH_W / 2 - 0.08, 0.012, 0.04]} material={dark} position={[-s * HATCH_W / 4, 0.025, HATCH_L / 4]} />
            </group>
          ))}
        </group>
      </group>

      {/* The legs, posed every frame: hip, thigh, knee, shin with its armour slab, foot. */}
      {LEGS.map(({ yaw }, i) => (
        <group key={i} ref={g => { hips.current[i] = g; }} rotation={[0, yaw, 0]}>
          <group ref={g => { thighs.current[i] = g; }}>
            <Plate size={[THIGH, 0.26, 0.3]} material={dark} position={[THIGH / 2, 0, 0]} />
            <Plate size={[THIGH * 0.85, 0.06, 0.36]} material={armour} position={[THIGH * 0.5, 0.15, 0]} />
            <Turned profile={[[0.028, 0], [0.028, THIGH * 0.7]]} segments={6} material={steel} position={[0.06, -0.16, 0]} rotation={[0, Math.PI / 2, 0]} />
          </group>
          <group ref={g => { knees.current[i] = g; }}>
            <Wheel radius={0.16} width={0.34} segments={8} material={composite} rotation={[0, Math.PI / 2, 0]} />
            <Plate size={[SHIN, 0.22, 0.24]} material={dark} position={[SHIN / 2, 0, 0]} />
            <Plate size={[SHIN * 0.82, 0.09, 0.52]} material={armour} position={[SHIN * 0.46, 0.15, 0]} />
            {[0.25, 0.46, 0.67].map(f => <Plate key={f} size={[0.014, 0.096, 0.52]} material={dark} position={[SHIN * f, 0.15, 0]} />)}
            <Plate size={[SHIN * 0.82, 0.096, 0.014]} material={dark} position={[SHIN * 0.46, 0.15, 0]} />
          </group>
          <group ref={g => { feet.current[i] = g; }}>
            <Plate size={[0.42, 0.1, 0.5]} material={composite} position={[0.04, 0.05, 0]} />
            {[-0.16, 0, 0.16].map(z => <Plate key={z} size={[0.1, 0.06, 0.09]} material={black} position={[0.28, 0.03, z]} />)}
          </group>
        </group>
      ))}
    </group>
  );
};
