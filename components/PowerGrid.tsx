// The energy grid made visible (layout in powerGrid.ts): each side's power conduits in its
// colour, pulses running out from its HQ along them, and the streetlights, lit by whoever holds
// the power there and brightest by their HQ.
//
// Conduits are flat cables on the ground: a dark casing with a glowing core in the side's
// colour, all of a side's in one mesh, the pulses a texture scrolling along it. Streetlights are
// three instanced meshes (poles, heads and the pools of light under them), re-coloured when the
// grid changes, not every frame.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TEAM_COLORS } from '../constants';
import type { BuildingData, CloudData, RoadTileData } from '../types';
import { gridFeeders, lampLevels, powerNetwork, streetLamps, streetsOf, type Conduit, type LampSide } from './powerGrid';

type Team = 'blue' | 'red';
type Pos = { x: number; z: number };

// Height of the cables (just above the sidewalks), their widths in world units, and the pulses:
// one every PULSE_SPACING tiles along a cable, moving out at PULSE_SPEED tiles a second.
const CABLE_Y = 0.56;
const CASING_WIDTH = 2.6;
const CORE_WIDTH = 0.9;
// A soft glow either side of the core, so a cable reads as live power, not road paint.
const GLOW_WIDTH = 3.2;
// Each side's cables run off-centre along the road, Vanta's to one side and Tokugen's to the
// other, so where both use a street they lie side by side.
const LANE: Record<Team, number> = { blue: -2.4, red: 2.4 };
const PULSE_SPACING = 3;
const PULSE_SPEED = 2.2;
// Streetlights: sodium orange (the scenery palette, scenePalette.ts), pole height and pool size.
const LAMP_COLOR = new THREE.Color('#ffb07a');
const DEAD_HEAD = new THREE.Color('#1a1c20');
const POLE_HEIGHT = 5.5;
const POOL_RADIUS = 6;
const STEP: Record<LampSide, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

// A flat ribbon along each conduit, `width` wide, its u running with distance from the base,
// shifted `lane` off the line (+z for a stretch along x, +x for one along z).
function ribbon(conduits: readonly Conduit[], width: number, tileSize: number, offset: number, y: number, lane = 0): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], index: number[] = [];
  for (const c of conduits) {
    for (let i = 0; i + 1 < c.points.length; i++) {
      const a = c.points[i], b = c.points[i + 1];
      let ax = a.x * tileSize - offset, az = a.z * tileSize - offset, bx = b.x * tileSize - offset, bz = b.z * tileSize - offset;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-6) continue;
      if (Math.abs(bz - az) < 1e-6) { az += lane; bz += lane; } else if (Math.abs(bx - ax) < 1e-6) { ax += lane; bx += lane; }
      // Across the cable, and run past each end so the corners join.
      const nx = -(bz - az) / len * (width / 2), nz = (bx - ax) / len * (width / 2);
      const reach = width / 2 + Math.abs(lane);
      const ex = (bx - ax) / len * reach, ez = (bz - az) / len * reach;
      const base = pos.length / 3;
      pos.push(ax - ex + nx, y, az - ez + nz, ax - ex - nx, y, az - ez - nz, bx + ex + nx, y, bz + ez + nz, bx + ex - nx, y, bz + ez - nz);
      const u0 = a.d / PULSE_SPACING, u1 = b.d / PULSE_SPACING;
      uv.push(u0, 0, u0, 1, u1, 0, u1, 1);
      index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

// The pulse: a short bright stretch in each repeat, fading behind, over a steady dim glow.
function pulseTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 8;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.22)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.25)');
  grad.addColorStop(0.9, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Across a cable's glow: clear in the middle (the core lies there) and fading out at the edges.
function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 32);
  return new THREE.CanvasTexture(c);
}

// A soft round pool of light for under each lamp.
function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const casingMaterial = new THREE.MeshBasicMaterial({ color: '#0b0d12', polygonOffset: true, polygonOffsetFactor: -1 });
const poleMaterial = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.6, roughness: 0.5 });

const TeamConduits: React.FC<{ team: Team; conduits: Conduit[]; pulses: THREE.Texture; tileSize: number; offset: number }> = ({ team, conduits, pulses, tileSize, offset }) => {
  const casing = useMemo(() => ribbon(conduits, CASING_WIDTH, tileSize, offset, CABLE_Y, LANE[team]), [conduits, tileSize, offset, team]);
  const core = useMemo(() => ribbon(conduits, CORE_WIDTH, tileSize, offset, CABLE_Y + 0.02, LANE[team]), [conduits, tileSize, offset, team]);
  const glow = useMemo(() => ribbon(conduits, GLOW_WIDTH, tileSize, offset, CABLE_Y + 0.01, LANE[team]), [conduits, tileSize, offset, team]);
  const glowMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: TEAM_COLORS[team], map: glowTexture(), transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1.5,
  }), [team]);
  // Plain blending, not additive: cables overlapping on a shared street stay one cable's brightness.
  const coreMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: TEAM_COLORS[team], map: pulses, transparent: true, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2,
  }), [team, pulses]);
  useLayoutEffect(() => () => { casing.dispose(); core.dispose(); glow.dispose(); }, [casing, core, glow]);
  useLayoutEffect(() => () => { coreMaterial.dispose(); glowMaterial.map?.dispose(); glowMaterial.dispose(); }, [coreMaterial, glowMaterial]);
  if (conduits.length === 0) return null;
  return (
    <group>
      <mesh geometry={casing} material={casingMaterial} raycast={() => null} />
      <mesh geometry={glow} material={glowMaterial} raycast={() => null} />
      <mesh geometry={core} material={coreMaterial} raycast={() => null} />
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

  const streets = useMemo(() => streetsOf(roadTiles, gridSize), [roadTiles, gridSize]);
  const networks = useMemo(() => ({
    blue: powerNetwork(bases.blue, gridFeeders(buildings, 'blue').map(b => ({ x: b.gridX, z: b.gridZ })), streets),
    red: powerNetwork(bases.red, gridFeeders(buildings, 'red').map(b => ({ x: b.gridX, z: b.gridZ })), streets),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [feedKey, baseKey, streets]);

  const lamps = useMemo(() => streetLamps(roadTiles, gridSize), [roadTiles, gridSize]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const levels = useMemo(() => lampLevels(lamps, buildings, bases, blackouts), [lamps, feedKey, baseKey, blackoutKey]);

  const pulses = useMemo(pulseTexture, []);
  const pool = useMemo(poolTexture, []);
  useFrame((_, delta) => { pulses.offset.x -= (PULSE_SPEED / PULSE_SPACING) * Math.min(delta, 0.1); });

  const poles = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  const span = tileSize * 0.95;
  // Where each lamp stands: at the road's edge on its side, its head leaning out over the road.
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    lamps.forEach((l, i) => {
      const [dx, dz] = STEP[l.side];
      const x = l.x * tileSize - offset + dx * (span / 2 - 0.9), z = l.z * tileSize - offset + dz * (span / 2 - 0.9);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.position.set(x, POLE_HEIGHT / 2 + 0.4, z);
      o.updateMatrix();
      poles.current?.setMatrixAt(i, o.matrix);
      o.position.set(x - dx * 1.2, POLE_HEIGHT + 0.4, z - dz * 1.2);
      o.updateMatrix();
      heads.current?.setMatrixAt(i, o.matrix);
      o.position.set(x - dx * 2.2, 0.62, z - dz * 2.2);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      pools.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [poles.current, heads.current, pools.current]) if (m) { m.count = lamps.length; m.instanceMatrix.needsUpdate = true; }
  }, [lamps, tileSize, offset, span]);
  // Lit or dark, and how bright.
  useLayoutEffect(() => {
    const c = new THREE.Color();
    levels.forEach((level, i) => {
      heads.current?.setColorAt(i, level > 0 ? c.copy(LAMP_COLOR).multiplyScalar(0.6 + level) : DEAD_HEAD);
      pools.current?.setColorAt(i, c.copy(LAMP_COLOR).multiplyScalar(level));
    });
    for (const m of [heads.current, pools.current]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }, [levels]);

  return (
    <group>
      <TeamConduits team="blue" conduits={networks.blue} pulses={pulses} tileSize={tileSize} offset={offset} />
      <TeamConduits team="red" conduits={networks.red} pulses={pulses} tileSize={tileSize} offset={offset} />
      <instancedMesh ref={poles} args={[undefined, undefined, Math.max(1, lamps.length)]} material={poleMaterial} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[0.12, 0.16, POLE_HEIGHT, 6]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, Math.max(1, lamps.length)]} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={[1.1, 0.25, 1.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, Math.max(1, lamps.length)]} raycast={() => null} frustumCulled={false}>
        <circleGeometry args={[POOL_RADIUS, 20]} />
        <meshBasicMaterial map={pool} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
};
