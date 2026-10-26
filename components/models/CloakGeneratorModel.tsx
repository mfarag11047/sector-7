// The Cloaking Field Generator, Shadow Ops' Tier 3, built from the unit kit (components/kit).
//
// Simple but military: a low twelve-sided armoured drum, the pod it comes down in, on four short
// pads. Round its wall, a ring of lens intakes, a lit lens set back in each deep housing, and a
// second ring of smaller lenses on the chamfer above, tilted up: the generator watching the ground
// round it. A team-colour band at the wall's top. On the deck, a squat core with a faceted violet
// crystal, and four docking cradles; and above it four floating projectors, small faceted pods
// with an emitter lens at the front, each throwing a faint cone of violet light out and down: the
// cloaking field.
//
// While the field is up (`active`), the projectors hover high, bobbing, and circle the core
// slowly, their cones lit; a brighter sweep runs round the lens rings, scanning; the crystal
// pulses. Down (switched off, no power, EMP'd), the projectors settle onto their cradles, the
// cones and lenses go dark and an amber standby light comes on.
//
// Built facing +Z, about 1.7 across and 1.4 tall (to the hovering projectors) in its own units,
// and scaled up here.

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glow, kitMaterial, own, PALETTE, teamPaint } from '../kit/materials';
import { ContactShadow, Loft, Plate, Strip, Turned } from '../kit/shapes';

const SCALE = 2.0;
// The field's colour (Unit.tsx draws its edge and dome in it).
export const CLOAK_VIOLET = '#c084fc';
// Upright: the kit's turned parts point along +Z; this turns +Z to +Y.
const UP: [number, number, number] = [-Math.PI / 2, 0, 0];
const SIDES = 12;
// A twelve-sided outline of radius r (to its corners).
const ring = (r: number): [number, number][] => Array.from({ length: SIDES }, (_, k) => {
  const a = k * Math.PI * 2 / SIDES;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
// The drum, bottom up: a skirt, the wall, a chamfer in to the deck.
const SKIRT = { y: 0.04, h: 0.08, bottom: 0.72, top: 0.8 };
const WALL = { y: 0.12, h: 0.3, r: 0.8 };
const CHAMFER = { y: 0.42, h: 0.12, top: 0.6 };
const DECK_Y = CHAMFER.y + CHAMFER.h;
// Facet centres round the drum: their heading, and how far out the facet lies (to a corner, r).
const FACETS = Array.from({ length: SIDES }, (_, k) => (k + 0.5) * Math.PI * 2 / SIDES);
const apothem = (r: number) => r * Math.cos(Math.PI / SIDES);
// The small upper lenses, on every other chamfer facet.
const UPPER = FACETS.filter((_, k) => k % 2 === 0);
// The projectors: docked on the deck, or hovering out and up, tilted down to throw their cones.
const DOCKED = { r: 0.38, y: DECK_Y + 0.14, tilt: 0 };
const HOVER = { r: 0.68, y: DECK_Y + 0.74, tilt: 0.7 };
// The projectors' size, against the parts they are built from.
const POD_SCALE = 1.45;
// The lengths of the nested cones each projector throws.
const BEAM = [0.3, 0.55, 0.85];
const PROJECTORS = [0, 1, 2, 3].map(k => k * Math.PI / 2 + Math.PI / 4);

// A rotation turning a part's +Z to face out at `heading` (an angle in the top view, from +X).
const facing = (heading: number): [number, number, number] => [0, Math.PI / 2 - heading, 0];

export const CloakGeneratorModel: React.FC<{ teamColor: string; active: boolean }> = ({ teamColor, active }) => {
  const armour = kitMaterial('armour'), dark = kitMaterial('armourDark'), steel = kitMaterial('steel'), black = kitMaterial('black');
  const composite = kitMaterial('composite'), paint = teamPaint(teamColor);

  // This generator's own lights, so they can scan and pulse: a lens each, the crystal and
  // emitters, the projectors' cones, and the standby light.
  // They keep their look while the generator is cloaked in its own field (Unit.tsx), so the owner
  // still sees it scanning and projecting.
  const mats = useMemo(() => {
    const light = (color: string, opacity?: number) => {
      const m = own(glow(color, opacity)) as THREE.MeshBasicMaterial;
      m.userData.cloakExempt = true;
      return m;
    };
    return {
      lenses: FACETS.map(() => light(CLOAK_VIOLET)),
      upper: UPPER.map(() => light(CLOAK_VIOLET)),
      emit: light(CLOAK_VIOLET),
      // The cones add their light rather than tint what is behind them, so they glow faintly
      // over the dark streets instead of staining them; nested (BEAM), they add up brightest at
      // the projector and fade out along the beam.
      cone: Object.assign(light(CLOAK_VIOLET, 0.05), { blending: THREE.AdditiveBlending }),
      standby: light(PALETTE.amber),
    };
  }, []);
  useEffect(() => () => [...mats.lenses, ...mats.upper, mats.emit, mats.cone, mats.standby].forEach(m => m.dispose()), [mats]);
  const tint = useMemo(() => new THREE.Color(), []);
  const violet = useMemo(() => new THREE.Color(CLOAK_VIOLET), []);

  const orbit = useRef<THREE.Group>(null);
  const pods = useRef<(THREE.Group | null)[]>([]);
  const cones = useRef<(THREE.Group | null)[]>([]);
  const state = useMemo(() => ({ up: active ? 1 : 0, sweep: 0 }), []);

  useFrame(({ clock }, delta) => {
    const dt = Math.min(delta, 0.05), t = clock.elapsedTime;
    state.up += ((active ? 1 : 0) - state.up) * (1 - Math.exp(-dt * 3));
    const up = state.up;
    // The projectors lift off their cradles, swing out and tilt down; once up they bob and circle.
    if (orbit.current && active) orbit.current.rotation.y += dt * 0.35;
    PROJECTORS.forEach((_, i) => {
      const pod = pods.current[i];
      if (!pod) return;
      const bob = Math.sin(t * 2 + i * 1.7) * 0.04 * up;
      pod.position.set(0, THREE.MathUtils.lerp(DOCKED.y, HOVER.y, up) + bob, THREE.MathUtils.lerp(DOCKED.r, HOVER.r, up));
      pod.rotation.x = THREE.MathUtils.lerp(DOCKED.tilt, HOVER.tilt, up);
      const cone = cones.current[i];
      if (cone) { cone.visible = up > 0.05; cone.scale.setScalar(Math.max(up, 0.001)); }
    });
    // A bright sweep round the lens rings while the field is up.
    if (active) state.sweep += dt * 2.2;
    const lit = (heading: number) => {
      const d = Math.cos(heading - state.sweep);
      return active ? 0.35 + 0.65 * Math.pow(Math.max(d, 0), 12) : 0.08;
    };
    FACETS.forEach((a, k) => mats.lenses[k].color.copy(violet).multiplyScalar(lit(a)));
    UPPER.forEach((a, k) => mats.upper[k].color.copy(violet).multiplyScalar(lit(a + 0.4)));
    mats.emit.color.copy(violet).multiplyScalar(0.1 + 0.9 * up * (0.8 + 0.2 * Math.sin(t * 3)));
    mats.cone.opacity = 0.05 * up * (0.75 + 0.25 * Math.sin(t * 4));
    mats.standby.color.copy(tint.set(PALETTE.amber)).multiplyScalar(active ? 0.1 : 1);
  });

  return (
    <group scale={SCALE}>
      <ContactShadow size={[2, 2]} />

      {/* Four short pads under the drum. */}
      {PROJECTORS.map(a => (
        <group key={a} rotation={facing(a)}>
          <Plate size={[0.22, 0.05, 0.16]} material={black} position={[0, 0.025, 0.62]} />
        </group>
      ))}

      {/* The drum: a dark skirt, the armoured wall, a team band, a chamfer in to the deck. */}
      <Loft bottom={ring(SKIRT.bottom)} top={ring(SKIRT.top)} height={SKIRT.h} material={composite} position={[0, SKIRT.y, 0]} />
      <Loft bottom={ring(WALL.r)} top={ring(WALL.r)} height={WALL.h} material={dark} position={[0, WALL.y, 0]} />
      <Loft bottom={ring(WALL.r + 0.012)} top={ring(WALL.r + 0.012)} height={0.035} material={paint} position={[0, WALL.y + WALL.h - 0.05, 0]} />
      <Loft bottom={ring(WALL.r)} top={ring(CHAMFER.top)} height={CHAMFER.h} material={armour} position={[0, CHAMFER.y, 0]} />

      {/* The lens intakes round the wall: a deep housing, the lens set back in it. */}
      {FACETS.map((a, k) => (
        <group key={a} rotation={facing(a)} position={[0, WALL.y + WALL.h * 0.42, 0]}>
          <group position={[0, 0, apothem(WALL.r)]}>
            <Plate size={[0.16, 0.16, 0.02]} material={composite} position={[0, 0, 0.005]} />
            <Turned profile={[[0.07, 0], [0.07, 0.05], [0.06, 0.05], [0.055, 0.008]]} segments={10} material={steel} />
            <Turned profile={[[0.055, 0.008], [0.001, 0.025]]} segments={10} material={mats.lenses[k]} />
          </group>
        </group>
      ))}
      {/* Smaller lenses on the chamfer, tilted up. */}
      {UPPER.map((a, k) => (
        <group key={a} rotation={facing(a)} position={[0, CHAMFER.y + CHAMFER.h / 2, 0]}>
          <group position={[0, 0, apothem((WALL.r + CHAMFER.top) / 2)]} rotation={[-Math.atan2(WALL.r - CHAMFER.top, CHAMFER.h), 0, 0]}>
            <Turned profile={[[0.04, -0.01], [0.04, 0.025], [0.032, 0.025], [0.03, 0.006]]} segments={8} material={black} />
            <Turned profile={[[0.03, 0.006], [0.001, 0.018]]} segments={8} material={mats.upper[k]} />
          </group>
        </group>
      ))}
      <Strip size={[0.05, 0.03, 0.03]} material={mats.standby} position={[0, DECK_Y + 0.02, apothem(CHAMFER.top) - 0.06]} />

      {/* The deck: the core and its crystal, and four cradles for the projectors. */}
      <Turned profile={[[0.001, 0], [0.2, 0], [0.2, 0.06], [0.13, 0.12], [0.11, 0.28], [0.15, 0.31], [0.001, 0.31]]} segments={6} material={armour} rotation={UP} position={[0, DECK_Y, 0]} />
      <Turned profile={[[0.001, -0.14], [0.09, 0], [0.07, 0.06], [0.001, 0.2]]} segments={4} material={mats.emit} rotation={UP} position={[0, DECK_Y + 0.45, 0]} />
      {PROJECTORS.map(a => (
        <group key={a} rotation={facing(a)}>
          <Plate size={[0.26, 0.05, 0.2]} material={steel} position={[0, DECK_Y + 0.025, DOCKED.r]} />
          {[-1, 1].map(s => <Plate key={s} size={[0.03, 0.08, 0.18]} material={dark} position={[s * 0.13, DECK_Y + 0.06, DOCKED.r]} />)}
        </group>
      ))}

      {/* The four floating projectors, circling the core. */}
      <group ref={orbit}>
        {PROJECTORS.map((a, i) => (
          <group key={a} rotation={facing(a)}>
            <group ref={g => { pods.current[i] = g; }} scale={POD_SCALE}>
              {/* A faceted pod, its emitter lens at the front, short fins at the sides. */}
              <Turned profile={[[0.001, -0.16], [0.07, -0.1], [0.09, 0.02], [0.07, 0.09], [0.06, 0.09]]} segments={6} material={armour} />
              <Turned profile={[[0.06, 0.09], [0.06, 0.11], [0.05, 0.11]]} segments={10} material={steel} />
              <Turned profile={[[0.05, 0.105], [0.001, 0.125]]} segments={10} material={mats.emit} />
              {[-1, 1].map(s => <Plate key={s} size={[0.08, 0.015, 0.12]} material={dark} position={[s * 0.11, 0, -0.03]} />)}
              <Strip size={[0.03, 0.012, 0.03]} material={mats.emit} position={[0, -0.075, -0.02]} />
              {/* The field it throws: a faint cone out from the lens. */}
              <group ref={g => { cones.current[i] = g; }} position={[0, 0, 0.12]}>
                {BEAM.map(l => <Turned key={l} profile={[[0.04, 0], [0.04 + 0.37 * l, l]]} segments={14} material={mats.cone} shadow={false} />)}
              </group>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
};
