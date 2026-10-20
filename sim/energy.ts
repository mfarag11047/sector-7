// The energy grid and unit batteries.
//
// Vehicles and drones spend battery to move outside their team's grid; infantry walk for
// free and only spend it on abilities. The grid is a circle around the command base plus
// a smaller one around every captured building (core nodes pay cores instead). Units
// standing in it recharge, as do units near a Helios, tethered to a Banshee or linked to an
// anchored Battery Mule. Nano clouds block Helios charging but not the grid. An EMP missile
// blacks out the enemy's grid inside its blast for a while (see Blackout).
//
// Moved out of the main loop in CityMap.tsx unchanged.

import { FORCE_FIELD } from './forcefield';
import { ABILITY_CONFIG, CITY_CONFIG } from '../constants';
import type { BuildingData, UnitData } from '../types';
import type { GridPos } from './commands';
import { CLOAK_FIELD } from './cloak';
import { tetheredIds } from './jamming';
import { HELIOS, heliosCharge, heliosMode } from './helios';

// Where an EMP missile has knocked out the grid. `team` fired it: only the other side's grid
// goes dark there.
export interface Blackout {
  gridPos: GridPos;
  radius: number;
  team: UnitData['team'];
}

export const isBlackedOut = (pos: GridPos, team: UnitData['team'], blackouts: readonly Blackout[]) =>
  blackouts.some(b => b.team !== team && Math.hypot(pos.x - b.gridPos.x, pos.z - b.gridPos.z) <= b.radius);

export function isInsideEnergyGrid(
  pos: GridPos,
  team: UnitData['team'],
  buildings: readonly BuildingData[],
  // A side's command bases: its starting HQ, plus any it has built (sim/bases.ts).
  blueBase: GridPos | readonly GridPos[],
  redBase: GridPos | readonly GridPos[],
  blackouts: readonly Blackout[] = [],
): boolean {
  if (team !== 'blue' && team !== 'red') return false;
  if (blackouts.length > 0 && isBlackedOut(pos, team, blackouts)) return false;
  const baseRadiusSq = ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS * ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS;
  const buildingRadiusSq = ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS * ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS;
  const bases = team === 'blue' ? blueBase : redBase;
  for (const base of Array.isArray(bases) ? bases : [bases as GridPos]) {
    const baseDx = pos.x - base.x;
    const baseDz = pos.z - base.z;
    if (baseDx * baseDx + baseDz * baseDz <= baseRadiusSq) return true;
  }
  for (const building of buildings) {
    if (building.destroyed || building.owner !== team || building.type === 'core_node') continue;
    const dx = pos.x - building.gridX;
    const dz = pos.z - building.gridZ;
    if (dx * dx + dz * dz <= buildingRadiusSq) return true;
  }
  return false;
}

// Map tiles inside the energy grid that a side's captured buildings put there (not its base's own
// circle, which every side has), each tile counted once however many buildings cover it. Drives
// the population cap (sim/units.ts).
export function gridTiles(buildings: readonly BuildingData[], team: UnitData['team'], gridSize: number = CITY_CONFIG.gridSize): number {
  if (team !== 'blue' && team !== 'red') return 0;
  const r = ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS;
  const covered = new Uint8Array(gridSize * gridSize);
  let count = 0;
  for (const b of buildings) {
    if (b.destroyed || b.owner !== team || b.type === 'core_node') continue;
    for (let dx = -r; dx <= r; dx++) {
      const x = b.gridX + dx;
      if (x < 0 || x >= gridSize) continue;
      for (let dz = -r; dz <= r; dz++) {
        const z = b.gridZ + dz;
        if (z < 0 || z >= gridSize || dx * dx + dz * dz > r * r) continue;
        const i = x * gridSize + z;
        if (!covered[i]) { covered[i] = 1; count++; }
      }
    }
  }
  return count;
}

type Charge = { amount: number; sourceId?: string };

export interface ChargeSources {
  // Charge a drone draws this tick from the Banshee tethered to it.
  tether: Map<string, Charge>;
  // Charge a vehicle draws this tick from the Battery Mule linked to it.
  mule: Map<string, Charge>;
  // What each Battery Mule pays out this tick.
  muleDrain: Map<string, number>;
  // The Banshee holding each tethered drone.
  tetherHosts: Map<string, UnitData>;
  // What each Banshee pays out of its hardline pack this tick, across all its drones.
  tetherDrain: Map<string, number>;
}

// Who feeds whom this tick, worked out before any unit changes.
export function chargeSources(units: readonly UnitData[]): ChargeSources {
  const sources: ChargeSources = { tether: new Map(), mule: new Map(), muleDrain: new Map(), tetherHosts: new Map(), tetherDrain: new Map() };

  // A Banshee's hardline pack feeds each of its drones in turn while it has charge left.
  for (const u of units) {
    if (u.type !== 'banshee') continue;
    for (const id of tetheredIds(u)) sources.tetherHosts.set(id, u);
    let remaining = u.secondaryBattery || 0;
    for (const id of tetheredIds(u)) {
      if (remaining <= 0) break;
      const tethered = units.find(t => t.id === id && t.health > 0);
      if (!tethered || tethered.battery >= tethered.maxBattery) continue;
      const amount = Math.min(ABILITY_CONFIG.BANSHEE_TETHER_CHARGE_RATE, remaining, tethered.maxBattery - tethered.battery);
      if (amount <= 0) continue;
      remaining -= amount;
      sources.tether.set(tethered.id, { amount, sourceId: u.id });
      sources.tetherDrain.set(u.id, (sources.tetherDrain.get(u.id) || 0) + amount);
    }
  }

  for (const mule of units) {
    if (mule.type !== 'sun_plate' || !mule.isDeployed || mule.health <= 0) continue;
    let remaining = mule.battery;
    for (const linkId of mule.batteryTetherIds || []) {
      const target = units.find(t => t.id === linkId && t.health > 0 && t.team === mule.team);
      if (!target || target.battery >= target.maxBattery || sources.mule.has(target.id)) continue;
      const dist = Math.hypot(target.gridPos.x - mule.gridPos.x, target.gridPos.z - mule.gridPos.z);
      if (dist > ABILITY_CONFIG.BATTERY_MULE_RANGE) continue;
      const amount = Math.min(ABILITY_CONFIG.BATTERY_MULE_CHARGE_RATE, remaining, target.maxBattery - target.battery);
      if (amount <= 0) continue;
      remaining -= amount;
      sources.mule.set(target.id, { amount, sourceId: mule.id });
      sources.muleDrain.set(mule.id, (sources.muleDrain.get(mule.id) || 0) + amount);
    }
  }
  return sources;
}

// Battery spent this tick: moving off-grid, plus anything switched on.
export function batteryDrain(u: UnitData, isMoving: boolean, onGrid: boolean): number {
  let drain = (u.unitClass === 'infantry' || onGrid) ? 0 : (isMoving ? ABILITY_CONFIG.BATTERY_DRAIN_MOVE : ABILITY_CONFIG.BATTERY_DRAIN_IDLE);
  if (u.type === 'banshee' && u.jammerActive) drain += ABILITY_CONFIG.DRAIN_STATIC_JAMMER;
  // A Helios' microwave beam runs off its own battery.
  if (u.type === 'helios' && heliosMode(u) === 'burn') drain += HELIOS.burnDrainPerTick;
  // The Cloaking Field runs off the generator's battery, on the grid or off it, while switched on.
  if (u.type === 'cloak_generator' && !u.cloakFieldOff) drain += CLOAK_FIELD.drainPerTick;
  // So does the Bulwark Force Field while its dome is up (not while it reboots).
  if (u.type === 'field_generator' && u.fieldDownUntil === undefined) drain += FORCE_FIELD.drainPerTick;
  if (u.type === 'ghost' && u.isDampenerActive) drain += ABILITY_CONFIG.GHOST_SPEED_PENALTY + ABILITY_CONFIG.DRAIN_STATIC_DOME;
  if (u.type === 'ghost' && u.decoyActive) {
    drain += ABILITY_CONFIG.PHANTOM_DECOY_DRAIN * (isMoving ? 1 : ABILITY_CONFIG.PHANTOM_DECOY_STILL_FACTOR);
  }
  return drain;
}

export interface PowerContext {
  units: readonly UnitData[]; // Living units this tick
  sources: ChargeSources;
  onGrid: boolean;
  inNanoCloud: boolean;
  helios: readonly UnitData[];
}

// One tick of battery for one unit. `u` is the unit as the tick started; `draft` is the
// caller's working copy, updated in place. Returns whether anything changed.
export function powerTick(u: UnitData, draft: UnitData, ctx: PowerContext): boolean {
  let changed = false;
  const isMoving = u.path.length > 0;
  const drain = batteryDrain(u, isMoving, ctx.onGrid);

  // Battery Mule links break when the mule packs up or the vehicle drives out of range.
  if (u.type === 'sun_plate') {
    const previousLinks = u.batteryTetherIds || [];
    const keptLinks = u.isDeployed
      ? previousLinks.filter(linkId => {
          const target = ctx.units.find(t => t.id === linkId);
          return !!target && target.team === u.team && target.health > 0
            && Math.hypot(target.gridPos.x - u.gridPos.x, target.gridPos.z - u.gridPos.z) <= ABILITY_CONFIG.BATTERY_MULE_RANGE;
        })
      : [];
    if (keptLinks.length !== previousLinks.length || keptLinks.some((linkId, index) => previousLinks[index] !== linkId)) {
      draft.batteryTetherIds = keptLinks;
      changed = true;
    }
  }

  // Banshee tether: let go of drones that died, and pay for what the drones drew.
  if (u.type === 'banshee' && tetheredIds(u).length > 0) {
    const kept = tetheredIds(u).filter(id => ctx.units.some(t => t.id === id));
    if (kept.length !== tetheredIds(u).length) {
      draft.tetherTargetIds = kept;
      changed = true;
    }
    const paid = ctx.sources.tetherDrain.get(u.id) || 0;
    if (paid > 0) {
      draft.secondaryBattery = Math.max(0, (u.secondaryBattery || 0) - paid);
      changed = true;
    }
  }

  // A parked Banshee tops up its hardline pack from its main battery.
  if (u.type === 'banshee' && !isMoving && u.battery > 10 && (!u.secondaryBattery || u.secondaryBattery < (u.maxSecondaryBattery || 0))) {
    const transfer = ABILITY_CONFIG.BANSHEE_INTERNAL_CHARGE_RATE;
    if (draft.battery >= transfer) {
      draft.battery -= transfer;
      draft.secondaryBattery = Math.min(u.maxSecondaryBattery || 0, (u.secondaryBattery || 0) + transfer);
      changed = true;
    }
  }

  if (u.battery > 0 && u.type !== 'defense_drone') {
    // Crawlers inside their anchored host's radius run on the host.
    const parent = u.type === 'crawler_drone' && u.parentId ? ctx.units.find(p => p.id === u.parentId) : undefined;
    const hostFed = !!parent && !!parent.isAnchored
      && Math.hypot(u.gridPos.x - parent.gridPos.x, u.gridPos.z - parent.gridPos.z) <= (ABILITY_CONFIG.CRAWLER_RADIUS || 7);
    if (hostFed) {
      draft.battery = u.maxBattery;
      if (draft.battery !== u.battery) changed = true;
    } else {
      draft.battery = Math.max(0, draft.battery - drain);
      if (draft.battery !== u.battery) changed = true;
    }
  }
  if (u.type === 'sun_plate' && u.isDeployed) {
    const paid = ctx.sources.muleDrain.get(u.id) || 0;
    if (paid > 0) {
      draft.battery = Math.max(0, draft.battery - paid);
      changed = true;
    }
  }

  // Flat infantry battery switches their abilities off.
  if (u.unitClass === 'infantry' && draft.battery <= 0) {
    if (u.decoyActive) {
      draft.decoyActive = false;
      draft.isStealthed = false;
      changed = true;
    }
    if (u.isDampenerActive) {
      draft.isDampenerActive = false;
      changed = true;
    }
  }

  // Charging. Status 1 = grid, Helios or Banshee; 2 = Battery Mule (drawn by Unit.tsx).
  let chargeAmount = 0;
  let status = 0;
  const tether = ctx.sources.tether.get(u.id);
  if (tether) {
    chargeAmount += tether.amount;
    status = 1;
  }
  const mule = ctx.sources.mule.get(u.id);
  if (mule) {
    chargeAmount += mule.amount;
    status = 2;
  }
  if (ctx.onGrid && draft.battery < draft.maxBattery) {
    chargeAmount += ABILITY_CONFIG.ENERGY_GRID_CHARGE_RATE;
    status = Math.max(status, 1);
  }
  if (!ctx.inNanoCloud) {
    // Helios in Charge mode, including a Helios charging itself (sim/helios.ts).
    const helios = heliosCharge(u, ctx.helios);
    if (helios > 0) {
      chargeAmount += helios;
      status = Math.max(status, 1);
    }
  }
  if (chargeAmount > 0 && draft.battery < draft.maxBattery) {
    draft.battery = Math.min(draft.maxBattery, draft.battery + chargeAmount);
    changed = true;
  }
  if (draft.chargingStatus !== status) {
    draft.chargingStatus = status;
    changed = true;
  }
  if (!!draft.isInNanoCloud !== ctx.inNanoCloud) {
    draft.isInNanoCloud = ctx.inNanoCloud;
    changed = true;
  }
  return changed;
}
