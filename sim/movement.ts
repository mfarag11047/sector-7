// How far each unit travels per game tick, and what happens when it reaches a tile.
//
// Units used to move inside their 3D model: each animation frame nudged the model,
// and the game only learned a unit had arrived when the model touched the tile.
// That tied game speed to frame rate. Here a unit's position is plain data,
// gridPos plus moveProgress toward path[0], advanced by a fixed amount every tick.
// Unit.tsx only animates toward that position.

import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { RoadType, UnitData, UnitType } from '../types';
import type { GridPos } from './commands';

// Movement advances on the main logic tick.
export const MOVE_TICK_MS = 100;
// World units per second at speed multiplier 1.
export const BASE_SPEED = 12;

const AIR_TYPES: ReadonlySet<UnitType> = new Set(['wasp', 'drone', 'helios', 'bombard']);
export const isAirUnit = (type: UnitType) => AIR_TYPES.has(type);

// The fields movement reads. Units and decoys both satisfy it.
export interface Mover {
  type: UnitType;
  unitClass: UnitData['unitClass'];
  gridPos: GridPos;
  path: string[];
  battery: number;
  moveProgress?: number;
  moveTarget?: string;
  isStunned?: boolean;
  isHacked?: boolean;
  hackType?: UnitData['hackType'];
  isJammed?: boolean;
  isDampenerActive?: boolean;
  activeBuffs?: UnitData['activeBuffs'];
  ammoState?: UnitData['ammoState'];
  isAnchored?: boolean;
  isDeployed?: boolean;
  surveillance?: UnitData['surveillance'];
}

export const parseTile = (key: string): GridPos => {
  const [x, z] = key.split(',').map(Number);
  return { x, z };
};

// Out of power, stunned or drained by a hack. Infantry don't need battery to walk.
export const isPoweredDown = (u: Mover) =>
  (u.unitClass !== 'infantry' && u.battery <= 0) || (!!u.isHacked && u.hackType === 'drain') || !!u.isStunned;

// Planted, loading or anchored units hold position even with a path queued.
export const isHeldInPlace = (u: Mover) =>
  !!u.isDeployed || !!u.isAnchored || (u.type === 'ballista' && u.ammoState === 'loading');

// Speed relative to BASE_SPEED for the step toward path[0]. Zero means not moving.
export function speedMultiplier(u: Mover, tileTypeOf: (key: string) => RoadType | undefined): number {
  if (u.path.length === 0 || isPoweredDown(u) || isHeldInPlace(u)) return 0;
  if (u.isJammed) return 0.5;

  let speed = 1;
  if (isAirUnit(u.type)) {
    speed = 1.2;
  } else {
    const tile = tileTypeOf(u.path[0]);
    if (tile === 'main') speed = 2;
    if (tile === 'open') speed = 0.5;
  }
  speed *= UNIT_STATS[u.type].speedMod || 1;
  if (u.type === 'ghost' && u.isDampenerActive) speed *= ABILITY_CONFIG.GHOST_SPEED_PENALTY;
  if (u.activeBuffs?.includes('speed')) speed *= 1.2;
  return speed;
}

export interface ArrivalRules {
  isWalkable: (x: number, z: number) => boolean;
  // Fresh route to the end of `path`, or [] when there is none.
  reroute: (from: GridPos, path: string[]) => string[];
  now: number;
}

// The unit steps onto path[0]. A wall or building that appeared on that tile sends it
// around instead. Bombardment Drones fly over everything.
export function arriveAtNextTile<T extends Mover>(u: T, rules: ArrivalRules): T {
  if (u.path.length === 0) return u;
  const next = parseTile(u.path[0]);
  if (u.type !== 'bombard' && !rules.isWalkable(next.x, next.z)) {
    return { ...u, path: rules.reroute(u.gridPos, u.path) };
  }

  // Infiltrator Drone surveillance: start circling at the center, finish back home.
  let surveillance = u.surveillance;
  if (surveillance?.status === 'traveling' && next.x === surveillance.center.x && next.z === surveillance.center.z) {
    surveillance = { ...surveillance, status: 'active', startTime: rules.now };
  } else if (surveillance?.status === 'returning' && next.x === surveillance.returnPos.x && next.z === surveillance.returnPos.z) {
    surveillance = undefined;
  }

  const moved = { ...u, gridPos: next, path: u.path.slice(1) };
  return surveillance === u.surveillance ? moved : { ...moved, surveillance };
}

export interface MovementEnv {
  tileSize: number;
  tileTypeOf: (key: string) => RoadType | undefined;
  // Called when a unit reaches path[0]. Returns the unit after arriving. If it
  // returns the unit still on its old tile (rerouted, blocked), the step restarts.
  arrive: <T extends Mover>(unit: T) => T;
}

// One movement tick for one unit. Returns the same object when nothing changed.
export function advanceMover<T extends Mover>(unit: T, dtMs: number, env: MovementEnv): T {
  // A new order or a reroute changed the next tile, so the half-finished step no longer applies.
  if (unit.path.length === 0) {
    return unit.moveProgress || unit.moveTarget ? { ...unit, moveProgress: 0, moveTarget: undefined } : unit;
  }
  let u = unit.moveTarget === unit.path[0] ? unit : { ...unit, moveProgress: 0, moveTarget: unit.path[0] };

  const speed = speedMultiplier(u, env.tileTypeOf);
  if (speed <= 0) return u;

  let progress = (u.moveProgress || 0) + stepFraction(u, speed, dtMs, env.tileSize);
  // Never more than a couple of tiles per tick; guards against a huge dt.
  for (let hops = 0; progress >= 1 && u.path.length > 0 && hops < 4; hops++) {
    const from = u.gridPos;
    const arrived = env.arrive(u);
    if (arrived.gridPos.x === from.x && arrived.gridPos.z === from.z) {
      return { ...arrived, moveProgress: 0, moveTarget: arrived.path[0] };
    }
    u = arrived;
    progress = u.path.length > 0 ? progress - 1 : 0;
  }
  return { ...u, moveProgress: progress, moveTarget: u.path[0] };
}

// Fraction of the current step covered in dtMs. Diagonal steps are longer.
function stepFraction(u: Mover, speed: number, dtMs: number, tileSize: number) {
  const next = parseTile(u.path[0]);
  const stepLength = Math.hypot(next.x - u.gridPos.x, next.z - u.gridPos.z) * tileSize || tileSize;
  return (BASE_SPEED * speed * dtMs) / 1000 / stepLength;
}

// Where the unit is right now, in tiles. Fractional while between tiles.
export function currentTilePosition(u: Pick<Mover, 'gridPos' | 'path' | 'moveProgress' | 'moveTarget'>): GridPos {
  const t = u.moveProgress || 0;
  if (u.path.length === 0 || t <= 0 || u.moveTarget !== u.path[0]) return u.gridPos;
  const next = parseTile(u.path[0]);
  return { x: u.gridPos.x + (next.x - u.gridPos.x) * t, z: u.gridPos.z + (next.z - u.gridPos.z) * t };
}
