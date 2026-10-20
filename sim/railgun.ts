// The main battle tank's rail gun.
//
// Besides its short-range gun (sim/combat.ts), every tank (and orbital-drop Titan) carries a
// rail gun that fires on its own: a hypervelocity slug, instant hit, at any enemy ground unit or
// structure within long range that its side can see, its own sight or any friendly unit's or
// building's. It is built to kill armour: it goes for vehicles first, and a slug through a
// soldier does far less than one through a hull, so Lancers can still close on tanks. Each shot
// costs battery and the gun recharges between shots.
//
// It can't pick out a unit in an enemy Smoke Screen (sim/titan.ts). With a Piercing Rail Round
// loaded (the tank's researched ability), the next slug doesn't stop at its target: it carries on
// down the lane to the end of the street, hitting every enemy within PIERCE.width of its path.
//
// Pure: it reads the state it is given and reports the shots. CityMap and the headless runner
// apply the damage and the gun's state.

import type { ShieldBlock } from './combat';
import type { StructureData, UnitData } from '../types';
import type { GridPos } from './commands';
import { spottedBy } from './artillery';
import { isHidden } from './cloak';
import { damageTakenMultiplier, hasBuff, isEmpDisabled } from './unitAbilities';
import { isScreened, PIERCE } from './titan';
import { ArmorClass, shotDamage, UNIT_RULES, Weapon } from './units';

export const RAILGUN = {
  damage: 120,
  // Tiles: far past the short gun's 4.
  range: 14,
  cooldownMs: 5000,
  batteryCost: 15,
  // Against infantry the slug does this share of its usual (anti-armour) damage.
  infantryFactor: 0.25,
};
const WEAPON: Weapon = { damage: RAILGUN.damage, cooldownMs: RAILGUN.cooldownMs, range: RAILGUN.range, type: 'ap', hitsGround: true, hitsAir: false };

export const hasRailgun = (u: Pick<UnitData, 'type'>) => u.type === 'tank' || u.type === 'titan_dropped';
export const railgunReady = (u: UnitData, now: number) => now - (u.railgunFiredAt ?? -Infinity) >= RAILGUN.cooldownMs;

export interface RailShot { attackerId: string; targetId: string; team: UnitData['team']; from: GridPos; to: GridPos; structure: boolean; pierced?: boolean }

const tiles = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
// Heavy armour, then light, then infantry; nearer first within each.
const priority = (armor: ArmorClass) => (armor === 'heavy' ? 0 : armor === 'light' ? 1 : 2);
// What one slug does to a given armour class.
export const railDamage = (armor: ArmorClass) => shotDamage(WEAPON, armor) * (armor === 'infantry' ? RAILGUN.infantryFactor : 1);

export function fireRailguns(
  units: readonly UnitData[],
  structures: readonly StructureData[],
  now: number,
  inNanoCloud: (pos: GridPos) => boolean = () => false,
  // An enemy force field in the way (sim/forcefield.ts): targets behind one come last, and a shot
  // at one hits the dome instead.
  shieldOf: (team: UnitData['team'], from: GridPos, to: GridPos) => ShieldBlock | null = () => null,
  // Open ground a piercing slug carries on down; it stops at the first tile that isn't.
  laneOpen: (x: number, z: number) => boolean = () => true,
): { shots: RailShot[]; unitDamage: Map<string, number>; structureDamage: Map<string, number>; shieldDamage: Map<string, number>; pierceHits: { attackerId: string; targetId: string }[] } {
  const pierceHits: { attackerId: string; targetId: string }[] = [];
  const shieldDamage = new Map<string, number>();
  const shots: RailShot[] = [];
  const unitDamage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);

  for (const u of units) {
    if (!hasRailgun(u) || u.health <= 0 || u.isStunned || isEmpDisabled(u) || u.battery < RAILGUN.batteryCost) continue;
    if (!railgunReady(u, now) || inNanoCloud(u.gridPos)) continue;
    let best: { t: UnitData; key: number } | null = null;
    for (const t of units) {
      if (t.team === u.team || t.health <= 0 || isHidden(t) || isScreened(t) || inNanoCloud(t.gridPos)) continue;
      const armor = UNIT_RULES[t.type].armor;
      if (armor === 'air') continue;
      const d = tiles(u.gridPos, t.gridPos);
      if (d > RAILGUN.range) continue;
      const key = priority(armor) * 1000 + d + (shieldOf(u.team, u.gridPos, t.gridPos) ? 10_000 : 0);
      if (best && key >= best.key) continue;
      if (!spottedBy(u.team, t.gridPos, units, structures)) continue;
      best = { t, key };
    }
    if (best) {
      const shield = shieldOf(u.team, u.gridPos, best.t.gridPos);
      if (shield) {
        add(shieldDamage, shield.fieldId, RAILGUN.damage);
        shots.push({ attackerId: u.id, targetId: best.t.id, team: u.team, from: u.gridPos, to: shield.at, structure: false });
        continue;
      }
      if (hasBuff(u, 'piercing_round')) {
        // Down the whole lane: everything in the slug's path, the target first.
        const end = laneEnd(u.gridPos, best.t.gridPos, laneOpen);
        for (const t of units) {
          if (t.team === u.team || t.team === 'neutral' || t.health <= 0 || UNIT_RULES[t.type].armor === 'air') continue;
          if (t !== best.t && offPath(u.gridPos, end, t.gridPos) > PIERCE.width) continue;
          add(unitDamage, t.id, railDamage(UNIT_RULES[t.type].armor) * damageTakenMultiplier(t));
          pierceHits.push({ attackerId: u.id, targetId: t.id });
        }
        for (const s of structures) {
          if (s.team === u.team || u.team === 'neutral' || s.health <= 0 || offPath(u.gridPos, end, s.gridPos) > PIERCE.width) continue;
          add(structureDamage, s.id, shotDamage(WEAPON, 'structure'));
          pierceHits.push({ attackerId: u.id, targetId: s.id });
        }
        shots.push({ attackerId: u.id, targetId: best.t.id, team: u.team, from: u.gridPos, to: end, structure: false, pierced: true });
        continue;
      }
      const armor = UNIT_RULES[best.t.type].armor;
      add(unitDamage, best.t.id, railDamage(armor) * damageTakenMultiplier(best.t));
      shots.push({ attackerId: u.id, targetId: best.t.id, team: u.team, from: u.gridPos, to: best.t.gridPos, structure: false });
      continue;
    }
    // Nothing to shoot at but buildings.
    let wall: { s: StructureData; d: number } | null = null;
    for (const s of structures) {
      if (s.team === u.team || u.team === 'neutral' || s.health <= 0 || s.isBlueprint) continue;
      const d = tiles(u.gridPos, s.gridPos);
      if (d > RAILGUN.range || (wall && d >= wall.d) || shieldOf(u.team, u.gridPos, s.gridPos) || !spottedBy(u.team, s.gridPos, units, structures)) continue;
      wall = { s, d };
    }
    if (wall) {
      add(structureDamage, wall.s.id, shotDamage(WEAPON, 'structure'));
      shots.push({ attackerId: u.id, targetId: wall.s.id, team: u.team, from: u.gridPos, to: wall.s.gridPos, structure: true });
    }
  }
  return { shots, unitDamage, structureDamage, shieldDamage, pierceHits };
}

// Where a piercing slug fired from `from` through `through` stops: the last open tile along the
// line before the street ends, at most PIERCE.length tiles out, and never short of its target.
export function laneEnd(from: GridPos, through: GridPos, open: (x: number, z: number) => boolean): GridPos {
  const d = tiles(from, through) || 1;
  const dir = { x: (through.x - from.x) / d, z: (through.z - from.z) / d };
  let end = { ...through };
  for (let step = Math.ceil(d); step <= PIERCE.length; step++) {
    const p = { x: Math.round(from.x + dir.x * step), z: Math.round(from.z + dir.z * step) };
    if (!open(p.x, p.z)) break;
    end = p;
  }
  return end;
}

// How far a point is from the segment a slug flew along.
function offPath(a: GridPos, b: GridPos, p: GridPos): number {
  const lx = b.x - a.x, lz = b.z - a.z;
  const len2 = lx * lx + lz * lz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * lx + (p.z - a.z) * lz) / len2));
  return Math.hypot(p.x - (a.x + t * lx), p.z - (a.z + t * lz));
}

// A gun that fired: recharging, and the battery it spent.
// A Piercing Rail Round is spent with the shot.
export const afterRailShot = (u: UnitData, now: number): UnitData =>
  ({ ...u, railgunFiredAt: now, battery: Math.max(0, u.battery - RAILGUN.batteryCost), buffs: u.buffs?.filter(b => b.kind !== 'piercing_round') });
