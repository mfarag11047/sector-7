// The energy grid made visible (layout in powerGrid.ts): overhead power lines strung from each
// side's HQ along the streetlights to the buildings it powers, and the streetlights, lit by
// whoever holds the power there and brightest by their HQ.
//
// The wires are plain dark cable, the same for both sides. Which side powers a street shows on
// its lamp posts: each powered post carries a small indicator light on top in that side's colour
// (captured city buildings themselves aren't marked), and on its wires: a small glowing coupler
// halfway along each span, in the colour of the side whose network the wire belongs to. They sag between the tops of the lamp posts and drop to each powered
// building's wall facing the last post, all of them in one mesh, rebuilt only when the grid
// changes. The streetlights are three instanced meshes (poles, heads and the pools of light
// under them), re-coloured when the grid changes, not every frame.

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BuildingData, CloudData, RoadTileData } from '../types';
import { TEAM_COLORS } from '../constants';
import { gridFeeders, lampStates, powerNetwork, streetLamps, streetsOf, wireRuns, type Lamp, type LampSide, type WireRun } from './powerGrid';

type Team = 'blue' | 'red';
type Pos = { x: number; z: number };

// Streetlights: sodium orange (the scenery palette, scenePalette.ts), pole height and pool size.
const LAMP_COLOR = new THREE.Color('#ffb07a');
const DEAD_HEAD = new THREE.Color('#1a1c20');
const POLE_HEIGHT = 5.5;
const POOL_RADIUS = 6;
const STEP: Record<LampSide, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
// Wires: thickness (world units), where they hang from on a post and on the HQ, the sag in the
// middle of a span (a little more for longer ones), and points along each span.
const WIRE_WIDTH = 0.34;
const POST_TOP = POLE_HEIGHT + 0.2;
const HQ_ANCHOR = 11;
const SAG = 0.5;
const SAG_PER_UNIT = 0.035;
const SPAN_POINTS = 10;
// The coupler on each span: a short glowing sleeve round the wire in the colour of the side whose
// grid the wire carries.
const COUPLER_RADIUS = 0.42;
const COUPLER_LENGTH = 1.5;
const MAX_COUPLERS = 4096;
const wireMaterial = new THREE.MeshBasicMaterial({ color: '#59606c', side: THREE.DoubleSide });
const poleMaterial = new THREE.MeshStandardMaterial({ color: '#2a2d33', metalness: 0.6, roughness: 0.5 });

// A building feeding the grid, once however many tiles it has: its footprint in tiles and height.
interface Feeder { x: number; z: number; rect: { x0: number; z0: number; x1: number; z1: number }; height: number }

function feedersOf(buildings: readonly BuildingData[], team: Team): Feeder[] {
  const seen = new Map<string, Feeder>();
  for (const b of gridFeeders(buildings, team)) {
    const f = b.footprint ?? { x: b.gridX, z: b.gridZ, w: 1, d: 1 };
    const key = `${f.x},${f.z}`;
    if (seen.has(key)) continue;
    seen.set(key, {
      x: Math.round(f.x + (f.w - 1) / 2), z: Math.round(f.z + (f.d - 1) / 2),
      rect: { x0: f.x - 0.45, z0: f.z - 0.45, x1: f.x + f.w - 0.55, z1: f.z + f.d - 0.55 },
      height: b.height,
    });
  }
  return [...seen.values()];
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

// The midpoint of a span, at the bottom of its sag, and its direction there: where its coupler sits.
interface Coupler { at: THREE.Vector3; dir: THREE.Vector3; team: Team }
const sagOf = (a: THREE.Vector3, b: THREE.Vector3) => SAG + Math.hypot(b.x - a.x, b.z - a.z) * SAG_PER_UNIT;

// A sagging span of wire from `a` to `b` (world), as a flat strip, into the arrays.
function span(a: THREE.Vector3, b: THREE.Vector3, pos: number[], index: number[]) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 0.5) return;
  const sag = sagOf(a, b);
  // Across the wire, flat, so it shows from the camera above.
  const nx = -(b.z - a.z) / len * (WIRE_WIDTH / 2), nz = (b.x - a.x) / len * (WIRE_WIDTH / 2);
  const base = pos.length / 3;
  for (let i = 0; i <= SPAN_POINTS; i++) {
    const t = i / SPAN_POINTS;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const y = a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t);
    pos.push(x + nx, y, z + nz, x - nx, y, z - nz);
    if (i > 0) { const k = base + (i - 1) * 2; index.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
}

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
  const lamps = useMemo(() => streetLamps(roadTiles, gridSize), [roadTiles, gridSize]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const states = useMemo(() => lampStates(lamps, buildings, bases, blackouts), [lamps, feedKey, baseKey, blackoutKey]);

  // Where a lamp post stands (world): at the road's edge on its side.
  const postAt = (l: Lamp) => {
    const [dx, dz] = STEP[l.side], edge = (tileSize * 0.95) / 2 - 0.9;
    return { x: l.x * tileSize - offset + dx * edge, z: l.z * tileSize - offset + dz * edge };
  };

  // The wires: each side's network, from its bases over the posts to the buildings it powers.
  const wires = useMemo(() => {
    const pos: number[] = [], index: number[] = [];
    const couplers: Coupler[] = [];
    const strung = new Set<string>();
    const world = (p: Pos) => ({ x: p.x * tileSize - offset, z: p.z * tileSize - offset });
    const post = (i: number) => { const w = postAt(lamps[i]); return new THREE.Vector3(w.x, POST_TOP, w.z); };
    for (const team of ['blue', 'red'] as const) {
      const feeders = feedersOf(buildings, team);
      const byTile = new Map(feeders.map(f => [`${f.x},${f.z}`, f]));
      const runs: WireRun[] = wireRuns(powerNetwork(bases[team], feeders, streets), lamps);
      // Where a wire meets a building: on its wall nearest `toward`, part way up.
      const onBuilding = (p: Pos, toward: THREE.Vector3) => {
        const f = byTile.get(`${p.x},${p.z}`);
        const w = world(p);
        if (!f) return new THREE.Vector3(w.x, 6, w.z);
        const x = Math.min(Math.max(toward.x, f.rect.x0 * tileSize - offset), f.rect.x1 * tileSize - offset);
        const z = Math.min(Math.max(toward.z, f.rect.z0 * tileSize - offset), f.rect.z1 * tileSize - offset);
        return new THREE.Vector3(x, Math.min(Math.max(f.height * 0.45, 3), 10), z);
      };
      for (const run of runs) {
        const posts = run.poles.map(post);
        const endpointToward = (from: THREE.Vector3 | undefined, fallback: Pos) => from ?? (() => { const w = world(fallback); return new THREE.Vector3(w.x, POST_TOP, w.z); })();
        const first = endpointToward(posts[0], run.end);
        const last = endpointToward(posts[posts.length - 1], run.start);
        const start = run.startIsBase ? (() => { const w = world(run.start); const d = Math.hypot(first.x - w.x, first.z - w.z) || 1; return new THREE.Vector3(w.x + (first.x - w.x) / d * 4, HQ_ANCHOR, w.z + (first.z - w.z) / d * 4); })() : onBuilding(run.start, first);
        const end = onBuilding(run.end, last);
        const chain = [start, ...posts, end];
        for (let i = 0; i + 1 < chain.length; i++) {
          // A span between two posts is strung once, however many runs pass along it.
          const a = run.poles[i - 1], b = run.poles[i];
          if (i > 0 && i < chain.length - 2) {
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (strung.has(key)) continue;
            strung.add(key);
          }
          span(chain[i], chain[i + 1], pos, index);
          // A coupler halfway along, in the colour of the side whose wire it is.
          const from = chain[i], to = chain[i + 1];
          if (Math.hypot(to.x - from.x, to.z - from.z) >= 0.5) {
            couplers.push({
              at: new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2 - sagOf(from, to), (from.z + to.z) / 2),
              dir: new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z).normalize(),
              team,
            });
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(index);
    return { geometry: g, couplers };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedKey, baseKey, streets, lamps, tileSize, offset]);
  useLayoutEffect(() => () => wires.geometry.dispose(), [wires]);
  // The couplers: one glowing sleeve on each span, turned along the wire, in its side's colour.
  const couplerMesh = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = couplerMesh.current;
    if (!m) return;
    const o = new THREE.Object3D(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const n = Math.min(wires.couplers.length, MAX_COUPLERS);
    for (let i = 0; i < n; i++) {
      const k = wires.couplers[i];
      o.position.copy(k.at);
      o.quaternion.setFromUnitVectors(up, k.dir);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(TEAM_COLORS[k.team]).multiplyScalar(1.5));
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [wires]);

  const pool = useMemo(poolTexture, []);
  const poles = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const beacons = useRef<THREE.InstancedMesh>(null);
  const pools = useRef<THREE.InstancedMesh>(null);
  // Where each lamp stands: at the road's edge on its side, its head leaning out over the road.
  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    lamps.forEach((l, i) => {
      const [dx, dz] = STEP[l.side];
      const { x, z } = postAt(l);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      o.position.set(x, POLE_HEIGHT / 2 + 0.4, z);
      o.updateMatrix();
      poles.current?.setMatrixAt(i, o.matrix);
      // A crossarm across the street's line at the top, where the wires hang from.
      o.position.set(x, POST_TOP + 0.1, z);
      o.rotation.set(0, dx !== 0 ? 0 : Math.PI / 2, 0);
      o.updateMatrix();
      arms.current?.setMatrixAt(i, o.matrix);
      o.rotation.set(0, 0, 0);
      o.position.set(x - dx * 1.2, POLE_HEIGHT + 0.4, z - dz * 1.2);
      o.updateMatrix();
      heads.current?.setMatrixAt(i, o.matrix);
      // The indicator light on top of the post.
      o.position.set(x, POST_TOP + 0.75, z);
      o.updateMatrix();
      beacons.current?.setMatrixAt(i, o.matrix);
      o.position.set(x - dx * 2.2, 0.62, z - dz * 2.2);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.updateMatrix();
      pools.current?.setMatrixAt(i, o.matrix);
    });
    for (const m of [poles.current, arms.current, heads.current, beacons.current, pools.current]) if (m) { m.count = lamps.length; m.instanceMatrix.needsUpdate = true; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lamps, tileSize, offset]);
  // Lit or dark, how bright, and whose: the indicator on top shows the side holding that stretch
  // of the grid, in its colour.
  useLayoutEffect(() => {
    const c = new THREE.Color();
    states.forEach(({ level, team }, i) => {
      heads.current?.setColorAt(i, level > 0 ? c.copy(LAMP_COLOR).multiplyScalar(0.6 + level) : DEAD_HEAD);
      pools.current?.setColorAt(i, c.copy(LAMP_COLOR).multiplyScalar(level));
      beacons.current?.setColorAt(i, team ? c.set(TEAM_COLORS[team]).multiplyScalar(1.6) : DEAD_HEAD);
    });
    for (const m of [heads.current, beacons.current, pools.current]) if (m?.instanceColor) m.instanceColor.needsUpdate = true;
  }, [states]);

  return (
    <group>
      <mesh geometry={wires.geometry} material={wireMaterial} raycast={() => null} frustumCulled={false} />
      <instancedMesh ref={couplerMesh} args={[undefined, undefined, MAX_COUPLERS]} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[COUPLER_RADIUS, COUPLER_RADIUS, COUPLER_LENGTH, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={poles} args={[undefined, undefined, Math.max(1, lamps.length)]} material={poleMaterial} raycast={() => null} frustumCulled={false}>
        <cylinderGeometry args={[0.12, 0.16, POLE_HEIGHT, 6]} />
      </instancedMesh>
      <instancedMesh ref={arms} args={[undefined, undefined, Math.max(1, lamps.length)]} material={poleMaterial} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={[2.2, 0.16, 0.16]} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, Math.max(1, lamps.length)]} raycast={() => null} frustumCulled={false}>
        <boxGeometry args={[1.1, 0.25, 1.1]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={beacons} args={[undefined, undefined, Math.max(1, lamps.length)]} raycast={() => null} frustumCulled={false}>
        <sphereGeometry args={[0.55, 10, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, Math.max(1, lamps.length)]} raycast={() => null} frustumCulled={false}>
        <circleGeometry args={[POOL_RADIUS, 20]} />
        <meshBasicMaterial map={pool} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  );
};
