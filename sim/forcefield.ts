// Heavy Metal Tier 3: the Bulwark Force Field.
//
// A generator comes down in a drop pod and throws up a dome about one city block across. It runs
// for as long as it has power: its battery drains while the dome is up, but inside your energy
// grid it is topped up as fast as it drains, so there the field holds indefinitely. A side has one
// generator at a time; dropping a new one removes the old.
//
// While the dome is up:
//   - The owner's side fires out through it freely.
//   - Enemy fire from outside can't get in. Shots at anything inside or behind the dome hit the
//     dome instead, and shells, rockets, missiles and bombs that come down on it are stopped on
//     its skin. Everything it stops wears down the shield's own health.
//   - Enemy units that walk in can fight from inside, but the field shocks them for slight damage
//     every second they stay.
// Battered down to nothing, the shield collapses and the generator spends a minute and a half
// rebooting before the dome comes back at full strength. The generator itself sits inside its own
// dome, so it can only be destroyed by enemies who go in after it; an EMP from inside knocks the
// field down while it lasts.
//
// Pure: everything here reads the state it is given. CityMap applies it to every weapon.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { isEmpDisabled } from './unitAbilities';

export const FORCE_FIELD = {
  // Tiles: about one 5x5 city block.
  radius: 3,
  // The shield's own health, worn down by everything it stops.
  shieldHp: 6000,
  // How long a collapsed shield takes to come back up.
  rebootMs: 90_000,
  // Battery spent per 100 ms tick while the dome is up (about 75 s on a full charge off the grid).
  drainPerTick: 0.13,
  // Damage a second to each enemy inside.
  shockDps: 8,
  // What the shield takes from ordnance it stops (direct fire uses the weapon's own damage).
  absorb: { shell: 70, mini: 20, empRocket: 60, missile: 150, pod: 100, bombard: 400, virus: 300 },
};

export interface ForceField {
  id: string;
  team: 'blue' | 'red';
  center: GridPos;
  radius: number;
  // Shield health left, and its full strength.
  hp: number;
  maxHp: number;
}

export const isFieldGenerator = (u: Pick<UnitData, 'type'>) => u.type === 'field_generator';

export const shieldHpOf = (g: UnitData) => g.fieldShieldHp ?? FORCE_FIELD.shieldHp;

// Rebooting after the shield was battered down.
export const isRebooting = (g: UnitData, now: number) => (g.fieldDownUntil ?? 0) > now;

// Projecting: alive, powered, not knocked out and not rebooting.
export const isForceFieldUp = (g: UnitData, now: number) =>
  isFieldGenerator(g) && g.health > 0 && (g.team === 'blue' || g.team === 'red') &&
  g.battery > 0 && !isRebooting(g, now) && !g.isStunned && !isEmpDisabled(g);

export function activeFields(units: readonly UnitData[], now: number): ForceField[] {
  const fields: ForceField[] = [];
  for (const g of units) {
    if (!isForceFieldUp(g, now)) continue;
    fields.push({ id: g.id, team: g.team as 'blue' | 'red', center: { ...g.gridPos }, radius: FORCE_FIELD.radius, hp: shieldHpOf(g), maxHp: FORCE_FIELD.shieldHp });
  }
  return fields;
}

export const insideField = (f: ForceField, p: GridPos) => Math.hypot(p.x - f.center.x, p.z - f.center.z) <= f.radius;

// Where the straight line from `a` to `b` first meets the field's dome, or null if it misses.
function entry(f: ForceField, a: GridPos, b: GridPos): GridPos | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const fx = a.x - f.center.x;
  const fz = a.z - f.center.z;
  const A = dx * dx + dz * dz;
  if (A === 0) return insideField(f, a) ? { ...a } : null;
  const B = 2 * (fx * dx + fz * dz);
  const C = fx * fx + fz * fz - f.radius * f.radius;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  if (t > 1) return null;
  if (t < 0) return C <= 0 ? { ...a } : null;
  return { x: a.x + dx * t, z: a.z + dz * t };
}

// The enemy dome that stops a shot by `team` from `from` at `to`, and where it hits: one the
// shooter isn't already inside, standing in the way.
export function shotBlockedBy(fields: readonly ForceField[], team: UnitData['team'], from: GridPos, to: GridPos): { field: ForceField; at: GridPos } | null {
  let best: { field: ForceField; at: GridPos; d: number } | null = null;
  for (const f of fields) {
    if (f.team === team || insideField(f, from)) continue;
    const at = entry(f, from, to);
    if (!at) continue;
    const d = Math.hypot(at.x - from.x, at.z - from.z);
    if (!best || d < best.d) best = { field: f, at, d };
  }
  return best ? { field: best.field, at: best.at } : null;
}

export const shotBlocked = (fields: readonly ForceField[], team: UnitData['team'], from: GridPos, to: GridPos) =>
  shotBlockedBy(fields, team, from, to) !== null;

// The enemy dome that absorbs something of `team`'s coming down at `at` (fired from `from`, when
// known): one it lands inside without having started inside.
export const absorbingField = (fields: readonly ForceField[], team: UnitData['team'], at: GridPos, from?: GridPos) =>
  fields.find(f => f.team !== team && insideField(f, at) && (!from || !insideField(f, from)));

export const impactAbsorbed = (fields: readonly ForceField[], team: UnitData['team'], at: GridPos, from?: GridPos) =>
  absorbingField(fields, team, at, from) !== undefined;

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

// One tick of every generator's shield: the hits it took wear it down, a shield battered to
// nothing collapses and starts rebooting, and one whose reboot is over comes back at full
// strength. `hits` is shield damage this tick by generator id.
export function shieldTick(units: readonly UnitData[], now: number, hits: ReadonlyMap<string, number>) {
  const updates = new Map<string, (u: UnitData) => UnitData>();
  for (const g of units) {
    if (!isFieldGenerator(g) || g.health <= 0) continue;
    if (g.fieldDownUntil !== undefined && now >= g.fieldDownUntil) {
      updates.set(g.id, x => ({ ...x, fieldShieldHp: FORCE_FIELD.shieldHp, fieldDownUntil: undefined }));
      continue;
    }
    const hit = hits.get(g.id) ?? 0;
    if (hit <= 0 || isRebooting(g, now)) continue;
    const hp = shieldHpOf(g) - hit;
    updates.set(g.id, hp > 0
      ? x => ({ ...x, fieldShieldHp: hp })
      : x => ({ ...x, fieldShieldHp: 0, fieldDownUntil: now + FORCE_FIELD.rebootMs }));
  }
  return updates;
}

// A side's generators, all of which a newly dropped one replaces.
export const generatorsOf = (units: readonly UnitData[], team: UnitData['team']) =>
  units.filter(u => isFieldGenerator(u) && u.team === team && u.health > 0).map(u => u.id);

// Adds `n` to a field's shield damage for this tick.
export const addShieldHit = (hits: Map<string, number>, fieldId: string, n: number) => hits.set(fieldId, (hits.get(fieldId) || 0) + n);
