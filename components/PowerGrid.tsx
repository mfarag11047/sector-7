// The energy grid made visible (layout in powerGrid.ts): the streets each side's captured buildings
// power outside its base carry a line in its colour, as far as that power reaches and in to the
// base's edge (none inside the base), and the streetlights are lit by whoever holds the power
// there, brightest by their HQ, with an indicator light on top in that side's colour.
//
// The lines lie on the road, just off its centre line: a dark casing with a faint glow and a slim
// core in the side's colour, pulses running along it outward from the HQ. One line per street, no
// branches off to the buildings. All of a side's lines are one mesh, rebuilt only when the grid
// changes. The streetlights are instanced meshes (poles, heads, indicators and the pools of light
// under them), re-coloured when the grid changes, not every frame.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import type { BuildingData, CloudData, RoadTileData } from '../types';
import { gridRoadLines, lampStates, streetLamps, type GridLine, type Lamp, type LampSide } from './powerGrid';

type Team = 'blue' | 'red';
type Pos = { x: number; z: number };

// The lines: height above the road, widths (world units), how far off the road's centre line they
// run, and the pulses, one every PULSE_SPACING tiles moving out at PULSE_SPEED tiles a second.
const LINE_Y = 0.32;
const CASING_WIDTH = 1.6;
const CORE_WIDTH = 0.6;
const GLOW_WIDTH = 2.6;
const OFF_CENTRE = 2.2;
const PULSE_SPACING = 3;
const PULSE_SPEED = 2.2;
// Streetlights: sodium orange (the scenery palette, scenePalette.ts), pole height and pool size.
const LAMP_COLOR = new THREE.Color('#ffb07a');
const DEAD = new THREE.Color('#1a1c20');
const POLE_HEIGHT = 5.5;
const POOL_RADIUS = 6;
const STEP: Record<LampSide, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

// A flat ribbon along each line, `width` wide, its u running with distance from the HQ, shifted
// OFF_CENTRE off the road's centre line (+z for a run along x, +x for one along z), and run on past
// each end by half the width so lines meeting at a corner join.
function ribbon(lines: readonly GridLine[], width: number, tileSize: number, offset: number, y: number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  for (const line of lines) {
    const [a, b] = line.points;
    let ax = a.x * tileSize - offset, az = a.z * tileSize - offset, bx = b.x * tileSize - offset, bz = b.z * tileSize - offset;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    if (az === bz) { az += OFF_CENTRE; bz += OFF_CENTRE; } else { ax += OFF_CENTRE; bx += OFF_CENTRE; }
    const nx = -(bz - az) / len * (width / 2), nz = (bx - ax) / len * (width / 2);
    const ex = (bx - ax) / len * (width / 2 + OFF_CENTRE), ez = (bz - az) / len * (width / 2 + OFF_CENTRE);
    const base = pos.length / 3;
    pos.push(ax - ex + nx, y, az - ez + nz, ax - ex - nx, y, az - ez - nz, bx + ex + nx, y, bz + ez + nz, bx + ex - nx, y, bz + ez - nz);
    const u0 = a.d / PULSE_SPACING, u1 = b.d / PULSE_SPACING;
    uv.push(u0, 0, u0, 1, u1, 0, u1, 1);
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, wrap = false) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = THREE.RepeatWrapping;
  return t;
};
// Along a line: a dim steady glow with a bright pulse in each repeat.
const pulseTexture = () => canvasTexture(128, 8, g => {
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.3)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.32)');
  grad.addColorStop(0.9, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0.3)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 8);
}, true);
// Across a line's glow: strongest beside the core, fading out to the edges.
const glowTexture = () => canvasTexture(4, 32, g => {
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.58, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 32);
});
// A soft round pool of light for under each lamp.
const poolTexture = () => canvasTexture(64, 64, g => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
});

const casingMaterial = new THREE.MeshBasicMaterial({ color: '#0b0d12', polygonOffset: true, polygonOffsetFactor: -1 });
const poleMaterial = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.6, roughness: 0.5 });

const TeamLines: React.FC<{ team: Team; lines: GridLine[]; pulses: THREE.Texture; glow: THREE.Texture; tileSize: number; offset: number }> = ({ team, lines, pulses, glow, tileSize, offset }) => {
  const geometries = useMemo(() => ({
    casing: ribbon(lines, CASING_WIDTH, tileSize, offset, LINE_Y),
    glow: ribbon(lines, GLOW_WIDTH, tileSize, offset, LINE_Y + 0.01),
    core: ribbon(lines, CORE_WIDTH, tileSize, offset, LINE_Y + 0.02),
  }), [lines, tileSize, offset]);
  const materials = useMemo(() => ({
    glow: new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team], map: glow, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1.5 }),
    // Plain blending, not additive, so crossing lines stay one line's brightness.
    core: new THREE.MeshBasicMaterial({ color: TEAM_COLORS[team], map: pulses, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  }), [team, pulses, glow]);
  useLayoutEffect(() => () => { geometries.casing.dispose(); geometries.glow.dispose(); geometries.core.dispose(); }, [geometries]);
  useLayoutEffect(() => () => { materials.glow.dispose(); materials.core.dispose(); }, [materials]);
  if (lines.length === 0) return null;
  return (
    <group>
      <mesh geometry={geometries.casing} material={casingMaterial} raycast={() => null} />
      <mesh geometry={geometries.glow} material={materials.glow} raycast={() => null} />
      <mesh geometry={geometries.core} material={materials.core} raycast={() => null} />
    </group>
  );
};

export const PowerGrid: React.FC<{
  buildings: readonly BuildingData[];
  bases: Record<Team, readonly Pos[]>;
  roadTiles: readonly RoadTileData[];
  clouds: readonly CloudData[];
  tileSize: number;
  offset: number;
}> = ({ buildings, bases, roadTiles, clouds, tileSize, offset }) => {
  const gridSize = Math.round((offset * 2) / tileSize);
  // Recomputed only when what the grid is made of changes: who holds which building, the bases,
  // an EMP blackout coming or going (not every capture tick).
  const feedKey = useMemo(() => {
    let key = '';
    for (const b of buildings) if (!b.destroyed && b.owner && b.type !== 'core_node') key += `${b.id}:${b.owner},`;
    return key;
  }, [buildings]);
  const baseKey = `${bases.blue.map(b => `${b.x},${b.z}`).join(';')}|${bases.red.map(b => `${b.x},${b.z}`).join(';')}`;
  const blackouts = useMemo(() => clouds.filter(c => c.type === 'emp' && Date.now() - c.createdAt < c.duration).map(c => ({ gridPos: c.gridPos, radius: c.radius, team: c.team })), [clouds]);
  const blackoutKey = blackouts.map(b => `${b.gridPos.x},${b.gridPos.z},${b.team}`).join(';');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lines = useMemo(() => gridRoadLines(roadTiles, gridSize, buildings, bases, blackouts), [roadTiles, gridSize, feedKey, baseKey, blackoutKey]);
  const byTeam = useMemo(() => ({ blue: lines.filter(l => l.team === 'blue'), red: lines.filter(l => l.team === 'red') }), [lines]);
  const lamps = useMemo(() => streetLamps(roadTiles, gridSize), [roadTiles, gridSize]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const states = useMemo(() => lampStates(lamps, buildings, bases, blackouts), [lamps, feedKey, baseKey, blackoutKey]);

  const pulses = useMemo(pulseTexture, []);
  const glow = useMemo(glowTexture, []);
  const pool = useMemo(poolTexture, []);
  useFrame((_, delta) => { pulses.offset.x -= (PULSE_SPEED / PULSE_SPACING) * Math.min(delta, 0.1); });

  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const beacons = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  // Where each lamp stands: at the road's edge on its side, its head leaning out over the road.
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const edge = (tileSize * 0.95) / 2 - 0.9;
    lamps.forEach((l: Lamp, i) => {
      const [dx, dz] = STEP[l.side];
      const x = l.x * tileSize - offset + dx * edge, z = l.z * tileSize - offset + dz * edge;
      o.rotation.set(0, 0, 0);
      o.position.set(x, POLE_HEIGHT / 2 + 0.4, z);
      o.updateMatrix();
      poles.current?.setMatrixAt(i, o.matrix);
      o.position.set(x - dx * 1.2, POLE_HEIGHT + 0.4, z - dz * 1.2);
      o.updateMatrix();
      heads.current?.setMatrixAt(i, o.matrix);
      // The indicator light on top of the post.
      o.position.set(x, POLE_HEIGHT + 0.95, z);
      o.updateMatrix();
      beacons.current?.setMatrixAt(i, o.matrix);
      o.position.set(x - dx * 2.2, 0.62, z - dz * 2.2);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      pools.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [poles.current, heads.current, beacons.current, pools.current]) if (m) { m.count = lamps.length; m.instanceMatrix.needsUpdate = true; }
  }, [lamps, tileSize, offset]);
  // Lit or dark, how bright, and whose: the indicator on top shows the side holding the power there.
  useLayoutEffect(() => {
    const c = new THREE.Color();
    states.forEach(({ level, team }, i) => {
      heads.current?.setColorAt(i, level > 0 ? c.copy(LAMP_COLOR).multiplyScalar(0.6 + level) : DEAD);
      pools.current?.setColorAt(i, c.copy(LAMP_COLOR).multiplyScalar(level));
      beacons.current?.setColorAt(i, team ? c.set(TEAM_COLORS[team]).multiplyScalar(1.6) : DEAD);
    });
    for (const m of [heads.current, beacons.current, pools.current]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }, [states]);

  const n = Math.max(1, lamps.length);
  return (
    <group>
      <TeamLines team="blue" lines={byTeam.blue} pulses={pulses} glow={glow} tileSize={tileSize} offset={offset} />
      <TeamLines team="red" lines={byTeam.red} pulses={pulses} glow={glow} tileSize={tileSize} offset={offset} />
      <instancedMesh ref={poles} args={[undefined, undefined, n]} material={poleMaterial} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[0.12, 0.16, POLE_HEIGHT, 6]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, n]} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={[1.1, 0.25, 1.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={beacons} args={[undefined, undefined, n]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[0.55, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, n]} raycast={() => null} frustumCulled={false}>
        <circleGeometry args={[POOL_RADIUS, 20]} />
        <meshBasicMaterial map={pool} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
};
