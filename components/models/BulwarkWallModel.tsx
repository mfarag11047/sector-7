// The Bulwark Wall, the heavy buildable barrier, built from the unit kit (components/kit) in the base
// structures' greys.
//
// Simple but military, with the city's edge: a tall poured-concrete barrier running the length of
// its tile the way the wall runs (`run`, sim/walls.ts). Its profile is a blast wall's: a broad foot
// stepping in to a near-upright face that chamfers in at the top. Each face carries two recessed
// panels with a diagonal brace in the corner, a hazard plaque between them, and a strip of white
// light along the foot's step; along each top edge runs a line of the side's colour, and the top
// is capped in dark steel.
//
// Walls side by side running the same way click together (`joined`): the ends that meet a
// neighbour run right to the tile's edge with no cap, so a line of them reads as one wall. An end
// with no neighbour stops just short of the edge behind a dark steel end cap.
//
// Built along +X in world units, a tile long and about 5.6 tall; `run` 'z' turns it a quarter.

import React from 'react';
import { glow, kitMaterial, teamPaint } from '../kit/materials';
import { ContactShadow, Plate, Prism, Strip } from '../kit/shapes';

// The barrier's profile across it, [across, up]: foot, step, face, chamfered top.
const PROFILE: [number, number][] = [
  [-1.8, 0], [1.8, 0], [1.8, 0.6], [1.05, 1.4], [0.85, 5.25], [0.6, 5.5], [-0.6, 5.5], [-0.85, 5.25], [-1.05, 1.4], [-1.8, 0.6],
];
const TOP_Y = 5.5;
// The face between the step and the top chamfer: how far out it stands at each height, and its tilt.
const FACE = { y0: 1.4, y1: 5.25, z0: 1.05, z1: 0.85 };
const FACE_TILT = Math.atan2(FACE.z0 - FACE.z1, FACE.y1 - FACE.y0);
const faceZ = (y: number) => FACE.z0 + (FACE.z1 - FACE.z0) * (y - FACE.y0) / (FACE.y1 - FACE.y0);
// The foot's step: the middle of its slope, and the slope's angle up from the ground.
const STEP = { z: (1.8 + 1.05) / 2, y: (0.6 + 1.4) / 2, tilt: Math.atan2(1.8 - 1.05, 1.4 - 0.6) };
// How far short of the tile's edge an end with no neighbour stops, and its cap.
const GAP = 0.25;
const CAP = 0.18;
const JOIN_OVERLAP = 0.02;
const HAZARD = '#6e5c24';

export const BulwarkWallModel: React.FC<{
  teamColor: string;
  tileSize: number;
  run?: 'x' | 'z';
  // Which ends meet a Bulwark Wall beside it running the same way: toward -x (start) and +x (end).
  joined?: { start: boolean; end: boolean };
}> = ({ teamColor, tileSize, run = 'x', joined = { start: false, end: false } }) => {
  const concrete = kitMaterial('structLight'), seam = kitMaterial('structGrey'), dark = kitMaterial('structDark'), black = kitMaterial('black');
  const hazard = teamPaint(HAZARD), light = glow('#eaf4ff'), team = glow(teamColor);
  const half = tileSize / 2;
  // A joined end runs a hair past the tile's edge, so the two meet without a hairline between them.
  const from = joined.start ? -half - JOIN_OVERLAP : -half + GAP;
  const to = joined.end ? half + JOIN_OVERLAP : half - GAP;
  const length = to - from, mid = (from + to) / 2;
  // Each face's panels, a third of the wall long apiece either side of the plaque.
  const panel = tileSize * 0.32;
  return (
    <group rotation={[0, run === 'z' ? Math.PI / 2 : 0, 0]}>
      <ContactShadow size={[tileSize + 0.6, 5]} />
      <Prism outline={PROFILE} depth={length} axis="x" material={concrete} position={[mid, 0, 0]} />
      <Plate size={[length, 0.12, 1.2]} material={dark} position={[mid, TOP_Y + 0.06, 0]} />
      {[-1, 1].map(s => (
        <group key={s} position={[mid, 0, 0]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          {/* The side's colour along the top edge; white light along the foot's step. */}
          <Strip size={[length, 0.08, 0.05]} material={team} position={[0, FACE.y1 - 0.12, faceZ(FACE.y1 - 0.12) + 0.03]} rotation={[-FACE_TILT, 0, 0]} />
          <Strip size={[length, 0.12, 0.04]} material={light} position={[0, STEP.y + 0.015, STEP.z + 0.015]} rotation={[-STEP.tilt, 0, 0]} />
          {/* Two recessed panels with a corner brace, and a hazard plaque between them. */}
          <group position={[0, (FACE.y0 + FACE.y1) / 2, faceZ((FACE.y0 + FACE.y1) / 2) + 0.005]} rotation={[-FACE_TILT, 0, 0]}>
            {[-1, 1].map(p => (
              <group key={p} position={[p * (panel / 2 + 1.0), 0, 0]}>
                <Plate size={[panel, 2.9, 0.02]} material={seam} />
                <Plate size={[panel - 0.24, 2.66, 0.025]} material={concrete} />
                <Plate size={[2.8, 0.1, 0.03]} material={seam} position={[p * (panel / 2 - 1.2), -0.75, 0]} rotation={[0, 0, p * 0.6]} />
              </group>
            ))}
            <Plate size={[1.5, 0.8, 0.03]} material={hazard} position={[0, 0.25, 0]} />
            {[-0.45, -0.15, 0.15, 0.45].map(x => <Plate key={x} size={[0.12, 0.62, 0.035]} material={black} position={[x, 0.25, 0]} rotation={[0, 0, 0.6]} />)}
            <Plate size={[1.6, 0.06, 0.035]} material={black} position={[0, -0.18, 0]} />
          </group>
        </group>
      ))}
      {/* A dark steel cap on each end with no neighbour. */}
      {([['start', from], ['end', to]] as const).map(([side, x]) => !joined[side] && (
        <Prism key={side} outline={PROFILE.map(([z, y]) => [z * 1.03, y + (y > 0 ? 0.04 : 0)] as [number, number])} depth={CAP} axis="x" material={dark}
          position={[x + (side === 'start' ? CAP / 2 : -CAP / 2), 0, 0]} />
      ))}
    </group>
  );
};
