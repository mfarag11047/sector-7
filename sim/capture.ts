// Capturing buildings and core nodes.
//
// Infantry standing within 1.5 tiles of a building push its capture bar toward their team,
// at the building's capture speed times their capture power. Opposing infantry cancel out.
// A bar left alone drains away. Moved out of the main loop in CityMap.tsx unchanged.

import { BUILDING_VALUES, UNIT_STATS } from '../constants';
import type { BuildingData, UnitData } from '../types';

// Progress lost per tick by an abandoned capture.
const ABANDONED_DECAY = 4;

export function captureTick(buildings: BuildingData[], units: readonly UnitData[]): BuildingData[] {
  const living = units.filter(u => u.health > 0);
  let anyChanged = false;
  const next = buildings.map(b => {
    const after = captureStep(b, living);
    if (after !== b) anyChanged = true;
    return after;
  });
  return anyChanged ? next : buildings;
}

function captureStep(b: BuildingData, units: readonly UnitData[]): BuildingData {
  if (b.destroyed) return b;
  let bluePower = 0;
  let redPower = 0;
  for (const u of units) {
    if (u.team === 'neutral') continue;
    if (Math.abs(u.gridPos.x - b.gridX) > 1.5 || Math.abs(u.gridPos.z - b.gridZ) > 1.5) continue;
    const stats = UNIT_STATS[u.type];
    // Buildings and core nodes are captured by infantry only.
    if (stats.unitClass !== 'infantry') continue;
    if (u.team === 'blue') bluePower += stats.captureMultiplier || 0;
    else redPower += stats.captureMultiplier || 0;
  }

  if (bluePower === 0 && redPower === 0) {
    if (b.captureProgress > 0 && b.capturingTeam) {
      const progress = Math.max(0, b.captureProgress - ABANDONED_DECAY);
      if (progress !== b.captureProgress) return { ...b, captureProgress: progress, capturingTeam: progress === 0 ? null : b.capturingTeam };
    }
    return b;
  }
  if (bluePower === redPower) return b;

  const team = bluePower > redPower ? 'blue' : 'red';
  const push = Math.abs(bluePower - redPower) * BUILDING_VALUES[b.type].captureSpeed;

  // Taking it over, or someone else's partial capture to wind back first.
  if (b.owner !== team) {
    if (!b.capturingTeam || b.capturingTeam === team) {
      const progress = Math.min(100, b.captureProgress + push);
      if (progress >= 100) return { ...b, owner: team, captureProgress: 0, capturingTeam: null };
      return { ...b, capturingTeam: team, captureProgress: progress };
    }
    const progress = Math.max(0, b.captureProgress - push);
    return { ...b, captureProgress: progress, capturingTeam: progress === 0 ? null : b.capturingTeam };
  }

  // Already ours: wind back an enemy attempt.
  if (b.captureProgress > 0) {
    const progress = Math.max(0, b.captureProgress - push);
    return { ...b, captureProgress: progress, capturingTeam: progress === 0 ? null : b.capturingTeam };
  }
  return b;
}
