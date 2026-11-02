// The energy grid made visible (drawn by PowerGrid.tsx): each side's stretch of the city shown on
// its streets, and the streetlights lit by whoever holds the power.
//
// Who powers a tile (powerAt): a side whose grid covers it (sim/energy.ts: round its command bases
// and every captured building but core nodes) and isn't blacked out there by an enemy EMP. Where
// both sides' grids reach, the side whose HQ is nearer holds it.
//
// Grid lines (gridRoadLines): every street inside a side's grid carries a line in its colour along
// the road, running on as far as the side's power reaches and stopping where it ends, so a side's
// territory reads as its streets lit up, one line per street, with no branches off to the
// buildings themselves.
//
// Streetlights: one every other street tile, at the edge of the road, on the same side all along a
// street. A lamp inside a side's grid is lit, brightest by its HQ and dimmer the further out it
// stands (LIGHT), with a small indicator light on top in that side's colour; one in nobody's grid,
// or in a grid blacked out by an EMP, is dark.
//
// Pure, for testing.

import { ABILITY_CONFIG } from '../constants';
import type { BuildingData, RoadTileData } from '../types';
import { isBlackedOut, type Blackout } from '../sim/energy';

type Team = 'blue' | 'red';
type Pos = { x: number; z: number };

// The buildings that feed a side's grid.
export const gridFeeders = (buildings: readonly BuildingData[], team: Team) =>
  buildings.filter(b => !b.destroyed && b.owner === team && b.type !== 'core_node');

export const LIGHT = {
  // A lit lamp's brightness at its HQ, and the least it falls to out at the grid's far reaches.
  full: 1,
  least: 0.3,
  // Over how many tiles from the nearest HQ it fades to `least`.
  falloffTiles: 30,
};

// Who powers tiles, from the two sides' grids: for each tile, the side (or null) and how bright
// its lamps burn there.
export function powerAt(buildings: readonly BuildingData[], bases: Record<Team, readonly Pos[]>, blackouts: readonly Blackout[] = []) {
  const baseR = ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS, buildingR = ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS;
  const feeders = { blue: gridFeeders(buildings, 'blue'), red: gridFeeders(buildings, 'red') };
  return (p: Pos): { team: Team | null; level: number; fromBase: number } => {
    let best: { team: Team | null; level: number; fromBase: number } = { team: null, level: 0, fromBase: Infinity };
    for (const team of ['blue', 'red'] as const) {
      if (bases[team].length === 0) continue;
      let nearestBase = Infinity;
      for (const b of bases[team]) nearestBase = Math.min(nearestBase, Math.hypot(p.x - b.x, p.z - b.z));
      const powered = nearestBase <= baseR || feeders[team].some(f => (p.x - f.gridX) ** 2 + (p.z - f.gridZ) ** 2 <= buildingR * buildingR);
      if (!powered || (blackouts.length > 0 && isBlackedOut(p, team, blackouts))) continue;
      const level = LIGHT.full - (LIGHT.full - LIGHT.least) * Math.min(1, nearestBase / LIGHT.falloffTiles);
      if (level > best.level) best = { team, level, fromBase: nearestBase };
    }
    return best;
  };
}

// --- Grid lines along the streets ---

// A straight line along a street, in tiles, each end with its distance from the side's nearest HQ.
export interface GridLine { team: Team; points: { x: number; z: number; d: number }[] }

// Each side's lines: along every run of two or more street tiles in a row that it powers.
export function gridRoadLines(
  tiles: readonly RoadTileData[],
  gridSize: number,
  buildings: readonly BuildingData[],
  bases: Record<Team, readonly Pos[]>,
  blackouts: readonly Blackout[] = [],
): GridLine[] {
  const power = powerAt(buildings, bases, blackouts);
  const held = new Map<number, { team: Team; d: number }>();
  for (const t of tiles) {
    if (t.type !== 'main' && t.type !== 'street') continue;
    const p = power(t);
    if (p.team) held.set(t.x * 4096 + t.z, { team: p.team, d: p.fromBase });
  }
  const at = (x: number, z: number) => held.get(x * 4096 + z);
  const lines: GridLine[] = [];
  // Runs along x on each row, then along z on each column.
  for (const alongX of [true, false]) {
    for (let a = 0; a < gridSize; a++) {
      let start = -1;
      let team: Team | null = null;
      for (let b = 0; b <= gridSize; b++) {
        const h = b < gridSize ? (alongX ? at(b, a) : at(a, b)) : undefined;
        if (h && h.team === team) continue;
        // The run before this tile ends.
        if (team && b - 1 > start) {
          const p0 = alongX ? { x: start, z: a } : { x: a, z: start }, p1 = alongX ? { x: b - 1, z: a } : { x: a, z: b - 1 };
          lines.push({ team, points: [{ ...p0, d: at(p0.x, p0.z)!.d }, { ...p1, d: at(p1.x, p1.z)!.d }] });
        }
        start = b;
        team = h ? h.team : null;
      }
    }
  }
  return lines;
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

// Each lamp: how bright it is (0 dark, up to LIGHT.full), and whose grid powers it (null for
// none). Where both sides' grids reach, the side whose HQ is nearer holds it.
export function lampStates(
  lamps: readonly Lamp[],
  buildings: readonly BuildingData[],
  bases: Record<Team, readonly Pos[]>,
  blackouts: readonly Blackout[] = [],
): { level: number; team: Team | null }[] {
  const power = powerAt(buildings, bases, blackouts);
  return lamps.map(l => { const p = power(l); return { level: p.level, team: p.team }; });
}

// How bright each lamp is (see lampStates).
export const lampLevels = (...args: Parameters<typeof lampStates>) => lampStates(...args).map(s => s.level);
