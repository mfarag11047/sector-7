// Cover: city buildings and enemy walls stop direct fire.
//
// A ground gun firing at a ground target needs a clear line to it. The first standing city
// building, landmark tower, or wall or gate of the other side, that the line passes through takes the shot
// instead (sim/combat.ts, sim/railgun.ts). Its own side's walls don't stop a side's fire: they
// are built with firing ports, so defenders can shoot out from behind their walls while the
// attackers have to break through. A unit behind cover can still be picked as a target when it
// is seen, but guns go for targets in the open first.
//
// City buildings take only a share of a stopped shot's damage, by the shooter's weight: a rifle
// barely chips a building, a tank shell or rail slug knocks chunks out of it. Walls take a stopped
// shot as they would one aimed at them. The landmark towers stand whatever hits them.
//
// Out of it: aircraft and Sentinels (they fire from above the rooftops and are shot at above
// them), shots at aircraft, and anything lobbed (Thunderhead shells, missiles, grenades).
//
// Pure: callers build the cover map once per tick from the buildings and structures.

import type { BuildingData, StructureData, UnitData } from '../types';
import type { GridPos } from './commands';
import type { ArmorClass } from './units';
import { isIndestructible } from './bombard';

export const COVER = {
  // Share of a stopped shot's damage (as against a structure) a city building takes, by the
  // shooter's armour class: infantry barely mark one, heavy vehicles knock it down.
  buildingShare: { infantry: 0.2, light: 0.5, heavy: 1, air: 0, structure: 0.5 } as Record<ArmorClass, number>,
  // A line counts as passing through a tile when it comes within this far of the tile's centre
  // on both axes, so one that only clips a corner of a building gets past.
  halfWidth: 0.42,
  // Along the line, how often it is checked, in tiles.
  step: 0.1,
};

// Wall pieces that stop the other side's fire. Dragon's Teeth are low enough to shoot over.
const WALLS = new Set<StructureData['type']>(['base_wall', 'base_gate', 'wall_tier2']);

export interface CoverMap {
  // Standing city buildings by tile.
  buildings: Map<string, string>;
  // Standing walls and gates by tile, with their side.
  walls: Map<string, { id: string; team: StructureData['team'] }>;
  // The landmark towers' tiles, which nothing knocks down.
  solid: Set<string>;
}

export interface CoverHit {
  kind: 'building' | 'structure' | 'landmark';
  id: string;
  // Where the line meets it, in fractional tiles.
  at: GridPos;
}

const key = (x: number, z: number) => `${x},${z}`;

const maps = new WeakMap<readonly BuildingData[], WeakMap<readonly StructureData[], CoverMap>>();
// The cover on the map, worked out once per buildings and structures list. `solid` (the landmark
// towers' tiles) never changes during a match.
export function coverMap(buildings: readonly BuildingData[], structures: readonly StructureData[], solid: readonly GridPos[] = []): CoverMap {
  let byStructures = maps.get(buildings);
  if (!byStructures) maps.set(buildings, byStructures = new WeakMap());
  let map = byStructures.get(structures);
  if (!map) {
    map = { buildings: new Map(), walls: new Map(), solid: new Set(solid.map(t => key(t.x, t.z))) };
    for (const b of buildings) if (!b.destroyed) map.buildings.set(key(b.gridX, b.gridZ), b.id);
    for (const s of structures) if (WALLS.has(s.type) && s.health > 0 && !s.isBlueprint) map.walls.set(key(s.gridPos.x, s.gridPos.z), { id: s.id, team: s.team });
    byStructures.set(structures, map);
  }
  return map;
}

// The first cover a shot by `team` from `from` to `to` runs into, or null when the line is clear.
// The shooter's and the target's own tiles never count.
export function coverBetween(map: CoverMap, team: UnitData['team'], from: GridPos, to: GridPos): CoverHit | null {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 1) return null;
  const fromTile = key(Math.round(from.x), Math.round(from.z));
  const toTile = key(Math.round(to.x), Math.round(to.z));
  const steps = Math.ceil(d / COVER.step);
  for (let i = 1; i < steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const z = from.z + ((to.z - from.z) * i) / steps;
    const tx = Math.round(x), tz = Math.round(z);
    if (Math.abs(x - tx) > COVER.halfWidth || Math.abs(z - tz) > COVER.halfWidth) continue;
    const tile = key(tx, tz);
    if (tile === fromTile || tile === toTile) continue;
    if (map.solid.has(tile)) return { kind: 'landmark', id: '', at: { x, z } };
    const building = map.buildings.get(tile);
    if (building) return { kind: 'building', id: building, at: { x, z } };
    const wall = map.walls.get(tile);
    if (wall && wall.team !== team) return { kind: 'structure', id: wall.id, at: { x, z } };
  }
  return null;
}

// Whether cover applies between a shooter and a target at all: both on the ground.
const aboveRooftops = (u: Pick<UnitData, 'type'> | null) => u?.type === 'defense_drone';
export const coverApplies = (shooter: Pick<UnitData, 'type'> | null, fromAir: boolean, target: Pick<UnitData, 'type'> | null, toAir: boolean) =>
  !fromAir && !toAir && !aboveRooftops(shooter) && !aboveRooftops(target);

// Damage stopped cover takes from a shot that would do `structureDamage` to a structure, added to
// the building or structure damage tallies.
export function hitCover(hit: CoverHit, structureDamage: number, shooterArmor: ArmorClass, buildings: Map<string, number>, structures: Map<string, number>) {
  if (hit.kind === 'building') buildings.set(hit.id, (buildings.get(hit.id) || 0) + structureDamage * COVER.buildingShare[shooterArmor]);
  else if (hit.kind === 'structure') structures.set(hit.id, (structures.get(hit.id) || 0) + structureDamage);
}

// Applies a tick's damage to city buildings; one brought to nothing is destroyed, as a
// Bombardment Drone leaves it. Core and server nodes stand whatever hits them.
export function damageBuildings(buildings: readonly BuildingData[], damage: ReadonlyMap<string, number>): BuildingData[] {
  if (damage.size === 0) return buildings as BuildingData[];
  let changed = false;
  const next = buildings.map(b => {
    const n = damage.get(b.id);
    if (!n || b.destroyed || isIndestructible(b)) return b;
    changed = true;
    const health = (b.health ?? b.maxHealth) - n;
    if (health <= 0) return { ...b, health: 0, destroyed: true, owner: null, capturingTeam: null, captureProgress: 0 };
    return { ...b, health };
  });
  return changed ? next : (buildings as BuildingData[]);
}
