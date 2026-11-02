// The energy grid made visible (drawn by PowerGrid.tsx): overhead power lines strung from each
// side's HQ along the streetlights to the buildings it powers, and the streetlights lit by
// whoever holds the power.
//
// The network: from each of a side's command bases, power runs out to every building that
// feeds its grid (every captured building but core nodes, sim/energy.ts), as a tree: each building
// is joined to the nearest point already on the network, starting from the bases (Prim's spanning
// tree, by grid distance). Given the streets, each cable runs along them (the shortest way through
// the road tiles, from the street nearest one end to the street nearest the other), so the network
// follows the roads, trunk lines shared by the branches off them; without, it is an L of two
// straight legs. It is drawn as wires (wireRuns): from the HQ or a building, from pole to pole
// along the streetlights on the way, and down to the building at the end.
// Every point on a cable knows how far it is from its base along the network, so pulses can run
// outward from the HQ.
//
// Streetlights: one every other street tile, at the edge of the road, on the same side all along a
// street so the wires between them run straight. A lamp inside a side's grid
// is lit, brightest by its HQ and dimmer the further out it stands (LIGHT), with a small indicator
// light on top in that side's colour; one in nobody's grid, or in a grid blacked out by an EMP,
// is dark. So the city's light follows who holds it: bright
// round each base, thinning out over contested ground, the unclaimed perimeter dark.
//
// Pure, for testing.

import { ABILITY_CONFIG } from '../constants';
import type { BuildingData, RoadTileData } from '../types';
import { isBlackedOut, type Blackout } from '../sim/energy';

type Team = 'blue' | 'red';
type Pos = { x: number; z: number };

// A cable: its corners in tiles, each with its distance from the base along the network.
export interface Conduit { points: { x: number; z: number; d: number }[] }

const manhattan = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

// The buildings that feed a side's grid.
export const gridFeeders = (buildings: readonly BuildingData[], team: Team) =>
  buildings.filter(b => !b.destroyed && b.owner === team && b.type !== 'core_node');

// The street tiles, for routing cables along them.
export interface Streets { isRoad: (x: number, z: number) => boolean; gridSize: number }

export function streetsOf(tiles: readonly RoadTileData[], gridSize: number): Streets {
  const road = new Set<number>();
  for (const t of tiles) if (t.type === 'main' || t.type === 'street') road.add(t.x * 4096 + t.z);
  return { isRoad: (x, z) => road.has(x * 4096 + z), gridSize };
}

// The road tile nearest `p` (p itself if it is one), searching out a few tiles.
function nearestRoad(p: Pos, streets: Streets): Pos | null {
  if (streets.isRoad(p.x, p.z)) return { x: p.x, z: p.z };
  for (let r = 1; r <= 5; r++) {
    let best: Pos | null = null, bestD = Infinity;
    for (let dx = -r; dx <= r; dx++) for (const dz of [-r, r]) for (const [x, z] of [[p.x + dx, p.z + dz], [p.x + dz, p.z + dx]]) {
      if (!streets.isRoad(x, z)) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bestD) { bestD = d; best = { x, z }; }
    }
    if (best) return best;
  }
  return null;
}

// The shortest way from road tile `a` to road tile `b` through the road tiles, or null.
function roadPath(a: Pos, b: Pos, streets: Streets): Pos[] | null {
  const n = streets.gridSize;
  const prev = new Int32Array(n * n).fill(-1);
  const start = a.x * n + a.z, goal = b.x * n + b.z;
  prev[start] = start;
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur === goal) break;
    const x = Math.floor(cur / n), z = cur % n;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (nx < 0 || nz < 0 || nx >= n || nz >= n || !streets.isRoad(nx, nz)) continue;
      const k = nx * n + nz;
      if (prev[k] >= 0) continue;
      prev[k] = cur;
      queue.push(k);
    }
  }
  if (prev[goal] < 0) return null;
  const path: Pos[] = [];
  for (let k = goal; ; k = prev[k]) { path.push({ x: Math.floor(k / n), z: k % n }); if (k === start) break; }
  return path.reverse();
}

// A route from `from` to `to`: along the streets when there are some, else an L.
function route(from: Pos, to: Pos, streets?: Streets): Pos[] {
  if (streets) {
    const a = nearestRoad(from, streets), b = nearestRoad(to, streets);
    const path = a && b ? roadPath(a, b, streets) : null;
    if (path) {
      const all = [from, ...path, to];
      // Only the corners: drop each point in a straight line between its neighbours.
      const kept: Pos[] = [all[0]];
      for (let i = 1; i < all.length - 1; i++) {
        const p = kept[kept.length - 1], c = all[i], q = all[i + 1];
        if ((c.x === p.x && c.x === q.x) || (c.z === p.z && c.z === q.z)) continue;
        if (c.x === p.x && c.z === p.z) continue;
        kept.push(c);
      }
      if (all.length > 1) kept.push(all[all.length - 1]);
      return kept;
    }
  }
  return [from, { x: to.x, z: from.z }, to];
}

// A side's conduits, from its bases out to every building feeding its grid.
export function powerNetwork(bases: readonly Pos[], feeders: readonly Pos[], streets?: Streets): Conduit[] {
  if (bases.length === 0) return [];
  // On the network so far, with their distance from a base.
  const tree: { x: number; z: number; d: number }[] = bases.map(b => ({ x: b.x, z: b.z, d: 0 }));
  const left = feeders.map(f => ({ x: f.x, z: f.z }));
  // For each building not yet joined: the nearest tree point and how far.
  const best = left.map(f => { let k = 0; for (let i = 1; i < tree.length; i++) if (manhattan(f, tree[i]) < manhattan(f, tree[k])) k = i; return { k, dist: manhattan(f, tree[k]) }; });
  const joined = new Array(left.length).fill(false);
  const out: Conduit[] = [];
  for (let n = 0; n < left.length; n++) {
    let pick = -1;
    for (let i = 0; i < left.length; i++) if (!joined[i] && (pick < 0 || best[i].dist < best[pick].dist)) pick = i;
    joined[pick] = true;
    const from = tree[best[pick].k], to = left[pick];
    const points: Conduit['points'] = [{ ...from }];
    for (const p of route(from, to, streets).slice(1)) {
      const last = points[points.length - 1];
      points.push({ x: p.x, z: p.z, d: last.d + Math.abs(p.x - last.x) + Math.abs(p.z - last.z) });
    }
    const end = points[points.length - 1];
    if (best[pick].dist > 0) out.push({ points });
    tree.push({ x: to.x, z: to.z, d: end.d });
    const t = tree.length - 1;
    for (let i = 0; i < left.length; i++) {
      if (joined[i]) continue;
      const dist = manhattan(left[i], end);
      if (dist < best[i].dist) best[i] = { k: t, dist };
    }
  }
  return out;
}

// --- Streetlights ---

export type LampSide = 'n' | 's' | 'e' | 'w';
const STEP: Record<LampSide, [number, number]> = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
export interface Lamp { x: number; z: number; side: LampSide }

// One lamp on every other street tile, on an edge of the road facing a lot: the north side of a
// street running east-west and the west side of one running north-south (or the other side where
// that has no lot), so a street's lamps stand in a line.
export function streetLamps(tiles: readonly RoadTileData[], gridSize: number): Lamp[] {
  const road = new Set<number>();
  for (const t of tiles) if (t.type === 'main' || t.type === 'street') road.add(t.x * 4096 + t.z);
  const isRoad = (x: number, z: number) => road.has(x * 4096 + z);
  const lamps: Lamp[] = [];
  for (const t of tiles) {
    if ((t.type !== 'main' && t.type !== 'street') || (t.x + t.z) % 2 !== 0) continue;
    const alongX = isRoad(t.x - 1, t.z) || isRoad(t.x + 1, t.z);
    const alongZ = isRoad(t.x, t.z - 1) || isRoad(t.x, t.z + 1);
    const order: LampSide[] = alongX && !alongZ ? ['n', 's'] : alongZ && !alongX ? ['w', 'e'] : ['n', 'w', 's', 'e'];
    for (const side of order) {
      const [dx, dz] = STEP[side];
      const nx = t.x + dx, nz = t.z + dz;
      if (nx < 0 || nz < 0 || nx >= gridSize || nz >= gridSize || road.has(nx * 4096 + nz)) continue;
      lamps.push({ x: t.x, z: t.z, side });
      break;
    }
  }
  return lamps;
}

// --- Wires ---

// One run of wire: from `start` (a base or a building, in tiles), over the poles of lamps `poles`
// (indices into the lamps) in order, down to the building at `end`.
export interface WireRun { start: Pos; startIsBase: boolean; poles: number[]; end: Pos }

// The wire runs along each cable of the network, over the lamps on the road tiles it passes.
export function wireRuns(conduits: readonly Conduit[], lamps: readonly Lamp[]): WireRun[] {
  const lampAt = new Map<number, number>();
  lamps.forEach((l, i) => lampAt.set(l.x * 4096 + l.z, i));
  return conduits.map(c => {
    const poles: number[] = [];
    for (let i = 0; i + 1 < c.points.length; i++) {
      const a = c.points[i], b = c.points[i + 1];
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.z - a.z));
      const sx = Math.sign(b.x - a.x), sz = Math.sign(b.z - a.z);
      const straight = a.x === b.x || a.z === b.z;
      // Only the straight legs along the road (the stubs on and off it go straight to their ends).
      if (!straight) continue;
      for (let k = 0; k <= steps; k++) {
        const pole = lampAt.get((a.x + sx * k) * 4096 + (a.z + sz * k));
        if (pole !== undefined && poles[poles.length - 1] !== pole) poles.push(pole);
      }
    }
    const first = c.points[0], last = c.points[c.points.length - 1];
    return { start: { x: first.x, z: first.z }, startIsBase: first.d === 0, poles, end: { x: last.x, z: last.z } };
  });
}

export const LIGHT = {
  // A lit lamp's brightness at its HQ, and the least it falls to out at the grid's far reaches.
  full: 1,
  least: 0.3,
  // Over how many tiles from the nearest HQ it fades to `least`.
  falloffTiles: 30,
};

// Each lamp: how bright it is (0 dark, up to LIGHT.full), and whose grid powers it (null for
// none), from the two sides' grids. Where both reach, the side whose HQ is nearer holds it.
export function lampStates(
  lamps: readonly Lamp[],
  buildings: readonly BuildingData[],
  bases: Record<Team, readonly Pos[]>,
  blackouts: readonly Blackout[] = [],
): { level: number; team: Team | null }[] {
  const baseR = ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS, buildingR = ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS;
  const feeders = { blue: gridFeeders(buildings, 'blue'), red: gridFeeders(buildings, 'red') };
  return lamps.map(l => {
    let level = 0;
    let holder: Team | null = null;
    for (const team of ['blue', 'red'] as const) {
      if (bases[team].length === 0) continue;
      let nearestBase = Infinity;
      for (const b of bases[team]) nearestBase = Math.min(nearestBase, Math.hypot(l.x - b.x, l.z - b.z));
      const powered = nearestBase <= baseR || feeders[team].some(f => (l.x - f.gridX) ** 2 + (l.z - f.gridZ) ** 2 <= buildingR * buildingR);
      if (!powered || (blackouts.length > 0 && isBlackedOut(l, team, blackouts))) continue;
      const k = Math.min(1, nearestBase / LIGHT.falloffTiles);
      const lit = LIGHT.full - (LIGHT.full - LIGHT.least) * k;
      if (lit > level) { level = lit; holder = team; }
    }
    return { level, team: holder };
  });
}

// How bright each lamp is (see lampStates).
export const lampLevels = (...args: Parameters<typeof lampStates>) => lampStates(...args).map(s => s.level);
