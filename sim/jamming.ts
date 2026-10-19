// Banshee communications jamming.
//
// A Banshee with its jammer on floods the area within BANSHEE_JAMMER_RADIUS tiles with noise.
// Enemy remote-controlled units inside it lose their link to their operator: they carry on with
// whatever they were last told (finishing a move, firing at anything in range on their own), but
// they take no new orders, neither moves nor attacks nor abilities, until they drift out of the
// field or the jammer goes quiet.
//
// Only remote-controlled units are affected: drones and other uncrewed machines. Crewed units
// and infantry are not. A drone on a Banshee's hardline tether is wired to its operator and can't
// be jammed.
//
// Pure: CityMap marks jammed units every tick (isJammed), and orders.ts / abilities.ts refuse
// commands to them.

import { ABILITY_CONFIG } from '../constants';
import type { UnitData, UnitType } from '../types';
import { isEmpDisabled } from './unitAbilities';

// Uncrewed units flown or driven over a radio link.
const REMOTE: ReadonlySet<UnitType> = new Set<UnitType>(['drone', 'wasp', 'helios', 'bombard', 'crawler_drone']);
export const isRemoteUnit = (u: Pick<UnitData, 'type'>) => REMOTE.has(u.type);

// Drones a Banshee can put on its hardline: any remote unit it can steer (Crawlers are
// autonomous once released).
export const isTetherableDrone = (u: Pick<UnitData, 'type'>) => isRemoteUnit(u) && u.type !== 'crawler_drone';

// How many drones one Banshee can hold on its hardline at once.
export const MAX_TETHERS = 3;

export const tetheredIds = (banshee: Pick<UnitData, 'tetherTargetIds'>) => banshee.tetherTargetIds ?? [];

// A Banshee whose jammer is actually broadcasting: switched on, alive and powered.
export const isJamming = (u: UnitData) =>
  u.type === 'banshee' && !!u.jammerActive && u.health > 0 && u.battery > 0 && !u.isStunned && !isEmpDisabled(u);

// Every unit jammed right now.
export function jammedUnits(units: readonly UnitData[]): Set<string> {
  const jammers = units.filter(isJamming);
  const jammed = new Set<string>();
  if (jammers.length === 0) return jammed;
  const hardlined = new Set<string>();
  for (const b of units) if (b.type === 'banshee' && b.health > 0) for (const id of tetheredIds(b)) hardlined.add(id);
  for (const u of units) {
    if (u.health <= 0 || !isRemoteUnit(u) || hardlined.has(u.id)) continue;
    const inField = jammers.some(j => j.team !== u.team &&
      Math.hypot(j.gridPos.x - u.gridPos.x, j.gridPos.z - u.gridPos.z) <= ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS);
    if (inField) jammed.add(u.id);
  }
  return jammed;
}

// Updates that set or clear isJammed on every unit whose state changed.
export function jammingUpdates(units: readonly UnitData[]) {
  const jammed = jammedUnits(units);
  const updates = new Map<string, (u: UnitData) => UnitData>();
  for (const u of units) {
    const now = jammed.has(u.id);
    if (now !== !!u.isJammed) updates.set(u.id, x => ({ ...x, isJammed: now }));
  }
  return updates;
}

export const JAMMED_REASON = 'signal jammed: the unit cannot receive new orders';

// The ids from a command's unit list that can still take orders, or a refusal when none can.
// Units that aren't the sender's are left for the command's own checks to refuse.
export function unjammedIds(units: readonly UnitData[], ids: readonly string[]): { ids: string[] } | { reason: string } {
  const jammed = new Set(units.filter(u => u.isJammed).map(u => u.id));
  const kept = ids.filter(id => !jammed.has(id));
  return kept.length === 0 && ids.length > 0 ? { reason: JAMMED_REASON } : { ids: kept };
}
