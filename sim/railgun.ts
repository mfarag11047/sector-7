// The main battle tank's rail gun.
//
// Besides its short-range gun (sim/combat.ts), every tank (and orbital-drop Titan) carries a
// rail gun that fires on its own: a hypervelocity slug, instant hit, at any enemy ground vehicle
// or structure within long range that its side can see, its own sight or any friendly unit's or
// building's. It is an anti-armour gun: infantry are left to the short-range gun, so Lancers can
// still close on tanks. Each shot costs battery and the gun recharges between shots.
//
// Pure: it reads the state it is given and reports the shots. CityMap and the headless runner
// apply the damage and the gun's state.

import type { StructureData, UnitData } from '../types';
import type { GridPos } from './commands';
import { spottedBy } from './artillery';
import { isHidden } from './cloak';
import { damageTakenMultiplier, isEmpDisabled } from './unitAbilities';
import { ArmorClass, shotDamage, UNIT_RULES, Weapon } from './units';

export const RAILGUN = {
  damage: 120,
  // Tiles: far past the short gun's 4.
  range: 14,
  cooldownMs: 5000,
  batteryCost: 15,
};
const WEAPON: Weapon = { damage: RAILGUN.damage, cooldownMs: RAILGUN.cooldownMs, range: RAILGUN.range, type: 'ap', hitsGround: true, hitsAir: false };

export const hasRailgun = (u: Pick<UnitData, 'type'>) => u.type === 'tank' || u.type === 'titan_dropped';
export const railgunReady = (u: UnitData, now: number) => now - (u.railgunFiredAt ?? -Infinity) >= RAILGUN.cooldownMs;

export interface RailShot { attackerId: string; targetId: string; team: UnitData['team']; from: GridPos; to: GridPos; structure: boolean }

const tiles = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
// Heavy armour before light; nearer first within each.
const priority = (armor: ArmorClass) => (armor === 'heavy' ? 0 : 1);

export function fireRailguns(
  units: readonly UnitData[],
  structures: readonly StructureData[],
  now: number,
  inNanoCloud: (pos: GridPos) => boolean = () => false,
): { shots: RailShot[]; unitDamage: Map<string, number>; structureDamage: Map<string, number> } {
  const shots: RailShot[] = [];
  const unitDamage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);

  for (const u of units) {
    if (!hasRailgun(u) || u.health <= 0 || u.isStunned || isEmpDisabled(u) || u.battery < RAILGUN.batteryCost) continue;
    if (!railgunReady(u, now) || inNanoCloud(u.gridPos)) continue;
    let best: { t: UnitData; key: number } | null = null;
    for (const t of units) {
      if (t.team === u.team || t.health <= 0 || isHidden(t) || inNanoCloud(t.gridPos)) continue;
      const armor = UNIT_RULES[t.type].armor;
      if (armor === 'air' || armor === 'infantry') continue;
      const d = tiles(u.gridPos, t.gridPos);
      if (d > RAILGUN.range) continue;
      const key = priority(armor) * 1000 + d;
      if (best && key >= best.key) continue;
      if (!spottedBy(u.team, t.gridPos, units, structures)) continue;
      best = { t, key };
    }
    if (best) {
      const armor = UNIT_RULES[best.t.type].armor;
      add(unitDamage, best.t.id, shotDamage(WEAPON, armor) * damageTakenMultiplier(best.t));
      shots.push({ attackerId: u.id, targetId: best.t.id, team: u.team, from: u.gridPos, to: best.t.gridPos, structure: false });
      continue;
    }
    // Nothing to shoot at but buildings.
    let wall: { s: StructureData; d: number } | null = null;
    for (const s of structures) {
      if (s.team === u.team || u.team === 'neutral' || s.health <= 0 || s.isBlueprint) continue;
      const d = tiles(u.gridPos, s.gridPos);
      if (d > RAILGUN.range || (wall && d >= wall.d) || !spottedBy(u.team, s.gridPos, units, structures)) continue;
      wall = { s, d };
    }
    if (wall) {
      add(structureDamage, wall.s.id, shotDamage(WEAPON, 'structure'));
      shots.push({ attackerId: u.id, targetId: wall.s.id, team: u.team, from: u.gridPos, to: wall.s.gridPos, structure: true });
    }
  }
  return { shots, unitDamage, structureDamage };
}

// A gun that fired: recharging, and the battery it spent.
export const afterRailShot = (u: UnitData, now: number): UnitData =>
  ({ ...u, railgunFiredAt: now, battery: Math.max(0, u.battery - RAILGUN.batteryCost) });
