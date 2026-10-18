// Heavy Metal Tier 3: the Bulwark Force Field.
//
// A generator comes down in a drop pod and throws up a dome about one city block across. For as
// long as it stands:
//   - The owner's side fires out through it freely.
//   - The enemy can't shoot in. A shot or projectile from outside aimed at, passing over or
//     landing inside the dome is stopped at its skin: direct fire can't pick targets behind it,
//     and shells, rockets, missiles and bombs that come down inside are absorbed.
//   - Enemy units that walk in are no longer shielded from: they can fight from inside, but the
//     field shocks them for slight damage every second they stay.
// The generator runs for a fixed time and then burns out. It can be destroyed sooner, by enemies
// who walk in to do it, and an EMP from inside knocks the field down while it lasts.
//
// Pure: everything here reads the state it is given. CityMap applies it to every weapon.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { isEmpDisabled } from './unitAbilities';

export const FORCE_FIELD = {
  // Tiles: about one 5x5 city block.
  radius: 3,
  // How long the generator runs after landing.
  lifetimeMs: 60_000,
  // Damage a second to each enemy inside.
  shockDps: 8,
};

export interface ForceField {
  id: string;
  team: 'blue' | 'red';
  center: GridPos;
  radius: number;
}

export const isFieldGenerator = (u: Pick<UnitData, 'type'>) => u.type === 'field_generator';

// Projecting: alive, still within its run time and not knocked out.
export const isForceFieldUp = (g: UnitData, now: number) =>
  isFieldGenerator(g) && g.health > 0 && (g.team === 'blue' || g.team === 'red') &&
  now < (g.fieldExpiresAt ?? Infinity) && !g.isStunned && !isEmpDisabled(g);

export function activeFields(units: readonly UnitData[], now: number): ForceField[] {
  const fields: ForceField[] = [];
  for (const g of units) {
    if (!isForceFieldUp(g, now)) continue;
    fields.push({ id: g.id, team: g.team as 'blue' | 'red', center: { ...g.gridPos }, radius: FORCE_FIELD.radius });
  }
  return fields;
}

export const insideField = (f: ForceField, p: GridPos) => Math.hypot(p.x - f.center.x, p.z - f.center.z) <= f.radius;

// Does the straight line from `a` to `b` pass through the field's dome?
function crosses(f: ForceField, a: GridPos, b: GridPos) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((f.center.x - a.x) * dx + (f.center.z - a.z) * dz) / len2));
  return Math.hypot(a.x + dx * t - f.center.x, a.z + dz * t - f.center.z) <= f.radius;
}

// A shot by `team` from `from` at `to` is stopped when it has to pass through an enemy dome the
// shooter isn't already inside.
export const shotBlocked = (fields: readonly ForceField[], team: UnitData['team'], from: GridPos, to: GridPos) =>
  fields.some(f => f.team !== team && !insideField(f, from) && crosses(f, from, to));

// Something of `team`'s coming down at `at` (fired from `from`, when known) is absorbed when it
// lands inside an enemy dome it didn't start inside.
export const impactAbsorbed = (fields: readonly ForceField[], team: UnitData['team'], at: GridPos, from?: GridPos) =>
  fields.some(f => f.team !== team && insideField(f, at) && (!from || !insideField(f, from)));

// The field that absorbs an impact at `at`, for drawing the hit on its skin.
export const absorbingField = (fields: readonly ForceField[], team: UnitData['team'], at: GridPos, from?: GridPos) =>
  fields.find(f => f.team !== team && insideField(f, at) && (!from || !insideField(f, from)));

// Damage this tick to every enemy unit standing inside a field.
export function shockDamage(units: readonly UnitData[], fields: readonly ForceField[], dtMs: number) {
  const damage = new Map<string, number>();
  if (fields.length === 0) return damage;
  const dose = FORCE_FIELD.shockDps * dtMs / 1000;
  for (const u of units) {
    if (u.health <= 0) continue;
    for (const f of fields) {
      if (f.team === u.team || !insideField(f, u.gridPos)) continue;
      damage.set(u.id, (damage.get(u.id) || 0) + dose);
    }
  }
  return damage;
}

// Who the field is shocking right now, by field, for the lightning drawn to them.
export function shockedBy(units: readonly UnitData[], fields: readonly ForceField[]) {
  const out = new Map<string, UnitData[]>();
  for (const f of fields) out.set(f.id, units.filter(u => u.health > 0 && u.team !== f.team && insideField(f, u.gridPos)));
  return out;
}

// Generators whose run time is over: they burn out.
export const burntOutGenerators = (units: readonly UnitData[], now: number) =>
  units.filter(u => isFieldGenerator(u) && u.health > 0 && now >= (u.fieldExpiresAt ?? Infinity)).map(u => u.id);
