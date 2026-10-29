// The Bombardment Drone's strike cycle.
//
// Ordered onto a tile, the drone flies there and keeps dropping a cluster strike on the 5x5
// patch below it every few seconds, until it is told to stop or its five munitions are spent.
// Empty, it flies itself home to the nearest friendly command base and rearms there; it then
// waits for new orders. Any drone parked by a base tops itself back up the same way.
//
// How many drops a city building takes depends on what it is: the blue residential blocks on the
// outskirts fall to two, and the denser districts toward the centre take progressively more, so
// carving lanes gets harder the closer the fighting gets to the middle of the map.
//
// Pure: reads the state it is given and reports the strikes and unit updates. CityMap applies
// them (sim/combat.ts does the damage).

import type { BuildingData, UnitData } from '../types';
import type { GridPos } from './commands';

export const BOMBARD = {
  // Drops per load.
  magazine: 5,
  // Time between drops over the target.
  intervalMs: 4000,
  // Time spent by a base reloading an emptied (or part-used) magazine.
  rearmMs: 6000,
  // How close to a command base (tiles) counts as home.
  rearmRange: 3,
};

// Core and server (compute) nodes are the map's objectives: nothing ever damages or destroys
// them, whether Bombardment Drone drops, Thunderhead shells or shots stopped by them as cover.
type NodeType = 'core_node' | 'server_node';
export const isIndestructible = (b: Pick<BuildingData, 'type'>): b is Pick<BuildingData, 'type'> & { type: NodeType } =>
  b.type === 'core_node' || b.type === 'server_node';

// Drops it takes to bring down each kind of building, rising toward the city centre.
export const DROPS_TO_DESTROY: Record<Exclude<BuildingData['type'], NodeType>, number> = {
  residential: 2, // outskirts, blue
  industrial: 3, // outskirts, orange
  hightech: 4, // the ring around the centre, green
  commercial: 5, // downtown, purple
};

// Damage one drop does to a building, so that DROPS_TO_DESTROY of them bring it down; none to a node.
export const dropDamage = (b: BuildingData) => (isIndestructible(b) ? 0 : Math.ceil(b.maxHealth / DROPS_TO_DESTROY[b.type]));

export const munitionsOf = (u: UnitData) => u.bombardMunitions ?? BOMBARD.magazine;

export type BombardState = 'idle' | 'approach' | 'bombarding' | 'returning' | 'rearming';

// What a drone is doing, for its menu.
export function bombardState(u: UnitData): BombardState {
  if (u.bombardmentTarget) {
    const over = u.path.length === 0 && u.gridPos.x === u.bombardmentTarget.x && u.gridPos.z === u.bombardmentTarget.z;
    return over ? 'bombarding' : 'approach';
  }
  if (u.bombardReturning) return 'returning';
  if (u.bombardRearmStartedAt !== undefined) return 'rearming';
  return 'idle';
}

const nearest = (from: GridPos, bases: readonly GridPos[]) =>
  bases.reduce<GridPos | null>((best, b) => (!best || Math.hypot(b.x - from.x, b.z - from.z) < Math.hypot(best.x - from.x, best.z - from.z) ? b : best), null);

export interface BombardTickResult {
  strikes: { droneId: string; at: GridPos }[];
  updates: Map<string, (u: UnitData) => UnitData>;
}

// One tick of every Bombardment Drone. `basesOf` lists a team's command bases; `findAirPath`
// routes a drone home. `lastStrikeOf` may report strikes the units given don't show yet (a
// caller whose unit list lags a tick), so a drone never drops twice for one.
export function bombardTick(
  units: readonly UnitData[],
  now: number,
  basesOf: (team: UnitData['team']) => readonly GridPos[],
  findAirPath: (from: GridPos, to: GridPos) => string[],
  lastStrikeOf: (id: string) => number | undefined = () => undefined,
): BombardTickResult {
  const strikes: BombardTickResult['strikes'] = [];
  const updates = new Map<string, (u: UnitData) => UnitData>();
  for (const u of units) {
    if (u.type !== 'bombard' || u.health <= 0) continue;
    const ammo = munitionsOf(u);
    const state = bombardState(u);

    if (state === 'bombarding') {
      if (ammo <= 0) {
        updates.set(u.id, x => ({ ...x, bombardmentTarget: null }));
        continue;
      }
      const last = Math.max(u.bombardLastStrikeAt ?? -Infinity, lastStrikeOf(u.id) ?? -Infinity);
      if (now - last < BOMBARD.intervalMs) continue;
      strikes.push({ droneId: u.id, at: { ...u.gridPos } });
      const left = ammo - 1;
      if (left > 0) {
        updates.set(u.id, x => ({ ...x, bombardMunitions: left, bombardLastStrikeAt: now }));
        continue;
      }
      // Empty: break off and head home to rearm.
      const home = nearest(u.gridPos, basesOf(u.team));
      const path = home ? findAirPath(u.gridPos, home) : [];
      updates.set(u.id, x => ({
        ...x, bombardMunitions: 0, bombardLastStrikeAt: now, bombardmentTarget: null,
        path, bombardReturning: !!home,
      }));
      continue;
    }

    if (state === 'approach') continue;

    // Not on a strike order: rearm when parked by a base with an incomplete magazine.
    const home = nearest(u.gridPos, basesOf(u.team));
    const atHome = !!home && u.path.length === 0 && Math.hypot(home.x - u.gridPos.x, home.z - u.gridPos.z) <= BOMBARD.rearmRange;
    if (!atHome || ammo >= BOMBARD.magazine) {
      // Flying home, or not short of anything.
      if (u.bombardReturning && u.path.length === 0) updates.set(u.id, x => ({ ...x, bombardReturning: false }));
      else if (u.bombardRearmStartedAt !== undefined) updates.set(u.id, x => ({ ...x, bombardRearmStartedAt: undefined }));
      continue;
    }
    if (u.bombardRearmStartedAt === undefined) {
      updates.set(u.id, x => ({ ...x, bombardReturning: false, bombardRearmStartedAt: now }));
    } else if (now - u.bombardRearmStartedAt >= BOMBARD.rearmMs) {
      updates.set(u.id, x => ({ ...x, bombardMunitions: BOMBARD.magazine, bombardRearmStartedAt: undefined, bombardReturning: false }));
    }
  }
  return { strikes, updates };
}
