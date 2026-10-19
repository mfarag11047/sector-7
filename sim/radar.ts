// Radar: the Aegis air-search radar and the Infiltrator Drone's ground-search radar.
//
// Every working Aegis sweeps a wide circle for things in the sky: enemy aircraft and large
// ordnance in flight (missiles, artillery shells, drop pods). It also picks up units hidden by a
// Cloaking Field, air or ground.
//
// Every working Infiltrator Drone carries a smaller ground-search radar: it picks up enemy ground
// units (cloaked ones too) and large aircraft, the Bombardment Drone, but not small or medium
// aircraft. On a Surveillance loiter its reach grows by half.
//
// A contact on radar shows only as a dot, on the map and the minimap, until something actually
// sees it: radar tells you something is there, not what it is.

import type { UnitData, UnitType } from '../types';
import type { GridPos } from './commands';
import { isEmpDisabled } from './unitAbilities';
import { UNIT_RULES } from './units';
import { dampenedUnits } from './ghost';

export const RADAR = {
  // Tiles. Far beyond the Aegis' own vision (6) and weapon range (5).
  range: 16,
};

// Infiltrator Drone ground-search radar, in tiles: on patrol, and loitering on Surveillance.
export const SEARCH_RADAR = {
  range: 8,
  surveillanceRange: 12,
};
// Aircraft big enough for the ground-search radar to hold.
export const LARGE_AIRCRAFT: readonly UnitType[] = ['bombard'];

// A living Aegis that isn't knocked out by an EMP or stunned.
export const isRadarActive = (u: UnitData) => u.type === 'aegis' && u.health > 0 && !u.isStunned && !isEmpDisabled(u);

export const radarSources = (units: readonly UnitData[], team: UnitData['team']): GridPos[] =>
  units.filter(u => u.team === team && isRadarActive(u)).map(u => u.gridPos);

export const onRadar = (at: { x: number; z: number }, sources: readonly GridPos[]) =>
  sources.some(s => Math.hypot(at.x - s.x, at.z - s.z) <= RADAR.range);

// A living Infiltrator Drone that isn't knocked out, and how far it sweeps.
export const isSearchRadarActive = (u: UnitData) => u.type === 'drone' && u.health > 0 && !u.isStunned && !isEmpDisabled(u);
export const searchRadarRange = (u: UnitData) => u.surveillance?.status === 'active' ? SEARCH_RADAR.surveillanceRange : SEARCH_RADAR.range;
export interface SearchRadar { at: GridPos; range: number }
export const searchRadarSources = (units: readonly UnitData[], team: UnitData['team']): SearchRadar[] =>
  units.filter(u => u.team === team && isSearchRadarActive(u)).map(u => ({ at: u.gridPos, range: searchRadarRange(u) }));
// Ground units and large aircraft; small and medium aircraft slip under it.
export const searchRadarSees = (u: UnitData) => UNIT_RULES[u.type].armor !== 'air' || LARGE_AIRCRAFT.includes(u.type);
// The radar a unit carries, for drawing its sweep: its reach in tiles, or 0.
export const radarRangeOf = (u: UnitData) => isRadarActive(u) ? RADAR.range : isSearchRadarActive(u) ? searchRadarRange(u) : 0;

// Units a Ghost's Dampener hides from radar don't show at all (sim/ghost.ts).
const unmasked = (units: readonly UnitData[]) => {
  const masked = dampenedUnits(units);
  return masked.size === 0 ? units : units.filter(u => !masked.has(u.id));
};

// Enemy units the radar holds that nothing of `team` can see: aircraft, and anything hidden by a
// Cloaking Field (sim/cloak.ts), on the ground or in the air, under an Aegis; ground units and
// large aircraft under an Infiltrator's search radar. The field beats eyes, not radar.
export const radarUnits = (
  units: readonly UnitData[], team: UnitData['team'], sources: readonly GridPos[], seen: (u: UnitData) => boolean,
  search: readonly SearchRadar[] = [],
) =>
  sources.length === 0 && search.length === 0 ? [] : unmasked(units).filter(u => {
    if (u.team === team || u.team === 'neutral' || u.health <= 0 || seen(u)) return false;
    if ((UNIT_RULES[u.type].armor === 'air' || u.fieldCloaked) && onRadar(u.gridPos, sources)) return true;
    return searchRadarSees(u) && search.some(s => Math.hypot(u.gridPos.x - s.at.x, u.gridPos.z - s.at.z) <= s.range);
  });
