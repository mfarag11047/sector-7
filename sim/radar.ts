// Aegis air-search radar.
//
// Every working Aegis sweeps a wide circle for things in the sky: enemy aircraft and large
// ordnance in flight (missiles, artillery shells, drop pods). A contact on radar shows only as a
// dot, on the map and the minimap, until something actually sees it: radar tells you something
// is there, not what it is.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { isEmpDisabled } from './unitAbilities';
import { UNIT_RULES } from './units';

export const RADAR = {
  // Tiles. Far beyond the Aegis' own vision (6) and weapon range (5).
  range: 16,
};

// A living Aegis that isn't knocked out by an EMP or stunned.
export const isRadarActive = (u: UnitData) => u.type === 'aegis' && u.health > 0 && !u.isStunned && !isEmpDisabled(u);

export const radarSources = (units: readonly UnitData[], team: UnitData['team']): GridPos[] =>
  units.filter(u => u.team === team && isRadarActive(u)).map(u => u.gridPos);

export const onRadar = (at: { x: number; z: number }, sources: readonly GridPos[]) =>
  sources.some(s => Math.hypot(at.x - s.x, at.z - s.z) <= RADAR.range);

// Enemy aircraft the radar holds that nothing of `team` can see.
export const radarAircraft = (units: readonly UnitData[], team: UnitData['team'], sources: readonly GridPos[], seen: (u: UnitData) => boolean) =>
  sources.length === 0 ? [] : units.filter(u => u.team !== team && u.health > 0 && UNIT_RULES[u.type].armor === 'air' && !seen(u) && onRadar(u.gridPos, sources));
