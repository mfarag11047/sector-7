// The Ghost EW specialist's abilities, researched at Advanced Research (sim/upgrades.ts).
//
//   - Tier 1: the Ghost can be trained, with no abilities yet: a fast capturer.
//   - Dampener (Tier 2 research): switched on, the Ghost and every friendly unit within
//     GHOST_DAMPENER_RADIUS tiles of it drop off the enemy minimap and enemy radar (Aegis
//     air-search contacts and Infiltrator ground-search blips). They can still be seen in the world
//     and shot at; only the map and the sensors lose them. Runs off the Ghost's battery and slows
//     it; drops when the battery runs flat.
//   - Phantom Decoy (Tier 3 research): cloaks the Ghost and sends out holographic copies (sim/abilities.ts).
//
// Pure: the minimap (UIOverlay.tsx) and the radar (sim/radar.ts) ask who is masked.

import { ABILITY_CONFIG } from '../constants';
import type { UnitData } from '../types';
import { isEmpDisabled } from './unitAbilities';

// A Ghost whose Dampener is running: switched on, alive and powered.
export const isDampening = (g: UnitData) =>
  g.type === 'ghost' && !!g.isDampenerActive && g.health > 0 && g.battery > 0 && !g.isStunned && !isEmpDisabled(g);

// Units hidden from the enemy's minimap and radar: within a running Dampener of their own side.
export function dampenedUnits(units: readonly UnitData[]): Set<string> {
  const ghosts = units.filter(isDampening);
  const out = new Set<string>();
  if (ghosts.length === 0) return out;
  for (const u of units) {
    if (u.health <= 0) continue;
    if (ghosts.some(g => g.team === u.team && Math.hypot(g.gridPos.x - u.gridPos.x, g.gridPos.z - u.gridPos.z) <= ABILITY_CONFIG.GHOST_DAMPENER_RADIUS)) out.add(u.id);
  }
  return out;
}
