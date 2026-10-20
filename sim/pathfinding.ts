// Routes across the city.
//
// Ground units take the quickest route, not the one with fewest tiles: a unit moves twice as
// fast on a main road and half as fast on open ground (sim/movement.ts), so a detour onto a
// highway often beats the direct line through side streets and empty lots. fastestPath is A*
// over travel time, with each tile costing the time it takes to cross.
//
// Ground routes also steer clear of the neutral Sentinels guarding server nodes where a detour
// is reasonable: each tile in a Sentinel's reach costs extra (sentinelHazard), so a squad on its
// way somewhere else goes round the block rather than file past the guns. A route that has to
// go there, to take the node, still does.
//
// Aircraft ignore the ground entirely: airPath is a straight line, diagonals included, over
// buildings and blocks alike.

import type { RoadType, UnitData } from '../types';
import type { GridPos } from './commands';
import { UNIT_RULES } from './units';

// Seconds-per-tile relative to a street: the inverse of the speed multiplier for each surface.
export const TILE_COST: Record<RoadType, number> = { main: 0.5, street: 1, open: 2 };
const MIN_COST = TILE_COST.main;

// A small binary heap of [priority, id], for A*'s open set.
class MinHeap {
  private items: { p: number; id: number }[] = [];
  get size() { return this.items.length; }
  push(p: number, id: number) {
    const a = this.items;
    a.push({ p, id });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].p <= a[i].p) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items;
    const top = a[0].id;
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// The quickest route from `from` to `to` over walkable tiles, as tile keys after `from`.
// Returns [] when `to` can't be reached (or is `from`).
export function fastestPath(
  from: GridPos,
  to: GridPos,
  gridSize: number,
  isOpen: (x: number, z: number) => boolean,
  tileType: (x: number, z: number) => RoadType | undefined,
  // Extra cost of crossing a tile, on top of its surface.
  hazard?: (x: number, z: number) => number,
): string[] {
  if (from.x === to.x && from.z === to.z) return [];
  if (to.x < 0 || to.z < 0 || to.x >= gridSize || to.z >= gridSize || !isOpen(to.x, to.z)) return [];
  const n = gridSize;
  const start = from.x * n + from.z;
  const goal = to.x * n + to.z;
  const cost = new Float64Array(n * n).fill(Infinity);
  const prev = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  cost[start] = 0;
  prev[start] = start;
  const open = new MinHeap();
  // Manhattan distance at highway speed never overestimates, so the route is the fastest.
  const h = (x: number, z: number) => (Math.abs(x - to.x) + Math.abs(z - to.z)) * MIN_COST;
  open.push(h(from.x, from.z), start);
  while (open.size > 0) {
    const cur = open.pop();
    if (closed[cur]) continue;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = Math.floor(cur / n);
    const cz = cur - cx * n;
    for (let k = 0; k < 4; k++) {
      const x = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const z = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const id = x * n + z;
      if (closed[id] || !isOpen(x, z)) continue;
      const next = cost[cur] + TILE_COST[tileType(x, z) ?? 'street'] + (hazard ? hazard(x, z) : 0);
      if (next >= cost[id]) continue;
      cost[id] = next;
      prev[id] = cur;
      open.push(next + h(x, z), id);
    }
  }
  if (prev[goal] === -1) return [];
  const path: string[] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push(`${Math.floor(c / n)},${c % n}`);
  return path.reverse();
}

// What a tile in a Sentinel's reach adds to a route: about a block's detour for a walk past one.
export const SENTINEL_HAZARD = 8;

// The extra cost of each tile within reach of one of these Sentinels, or undefined if there are none.
export function sentinelHazard(sentinels: readonly GridPos[], reach: number): ((x: number, z: number) => number) | undefined {
  if (sentinels.length === 0) return undefined;
  const r = reach + 0.5;
  return (x, z) => (sentinels.some(s => (s.x - x) ** 2 + (s.z - z) ** 2 <= r * r) ? SENTINEL_HAZARD : 0);
}

// The hazard from the Sentinels still standing among these units.
export const sentinelHazardOf = (units: readonly UnitData[]) =>
  sentinelHazard(units.filter(u => u.type === 'defense_drone' && u.health > 0).map(u => u.gridPos), UNIT_RULES.defense_drone.weapon!.range);

// A straight flight from `from` to `to`, stepping diagonally where it can, over anything.
export function airPath(from: GridPos, to: GridPos): string[] {
  const path: string[] = [];
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const steps = Math.max(Math.abs(dx), Math.abs(dz));
  for (let i = 1; i <= steps; i++) {
    path.push(`${from.x + Math.round((dx * i) / steps)},${from.z + Math.round((dz * i) / steps)}`);
  }
  return path;
}
