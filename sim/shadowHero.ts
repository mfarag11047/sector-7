// Kage, Shadow Ops' doctrine hero (sim/heroes.ts): a cloaking assassin with a black katana.
//
//   - Katana: melee only (UNIT_RULES, the 'blade' damage type). It cuts infantry apart and still
//     bites into vehicles and buildings, but can't reach aircraft.
//   - Optical Camo (sim/unitAbilities.ts 'shadow_cloak'): he cloaks himself for a while, the same
//     cloak as a Cloaking Field (sim/cloak.ts): the enemy can neither see nor target him, though
//     blasts still hurt. His first strike from cloak is an ambush for double damage, and drops it.
//   - Charge: with a blade he has to close in, so when he stands idle, uncloaked, and an enemy
//     ground unit he can see comes within CHARGE.range, he attack-moves onto it. Cloaked he
//     holds still: the ambush is the player's to spring.
//
// Pure: CityMap and the headless runner send the charges as ordinary attack-move orders.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { UNIT_RULES } from './units';
import { hasBuff, isEmpDisabled } from './unitAbilities';

export const CHARGE = {
  // Tiles: how far he will run at an enemy on his own.
  range: 5,
};

const tiles = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);

// Each idle Kage's charge: who he runs at, if anyone.
export function kageCharges(units: readonly UnitData[]): { unitId: string; team: UnitData['team']; target: GridPos }[] {
  const out: { unitId: string; team: UnitData['team']; target: GridPos }[] = [];
  for (const k of units) {
    if (k.type !== 'hero_shadow_ops' || k.health <= 0 || k.isStunned || isEmpDisabled(k)) continue;
    // Busy: walking somewhere, already fighting, or lying in wait under Optical Camo.
    if (k.path.length > 0 || k.combatTargetId || hasBuff(k, 'shadow_cloak')) continue;
    let best: UnitData | null = null;
    let bestD = CHARGE.range;
    for (const t of units) {
      if (t.team === k.team || t.team === 'neutral' || t.health <= 0 || isHidden(t) || t.type === 'defense_drone') continue;
      if (UNIT_RULES[t.type].armor === 'air') continue;
      const d = tiles(k.gridPos, t.gridPos);
      if (d <= bestD) { best = t; bestD = d; }
    }
    if (best) out.push({ unitId: k.id, team: k.team, target: { x: Math.round(best.gridPos.x), z: Math.round(best.gridPos.z) } });
  }
  return out;
}
