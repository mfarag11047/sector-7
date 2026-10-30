// The Battery Mule's Volt Core (Tier 2, researched at Advanced Research, sim/upgrades.ts).
//
// Passive. A Battery Mule carries a lot of charge; with the Volt Core researched, when one is
// destroyed its core goes critical where it fell: a flashing red warning and a VOLT.fuseMs
// countdown, then it detonates, two ways at once:
//   - the electrical discharge, into every enemy unit within VOLT.radius tiles, ground or air:
//     VOLT.damage at the centre, falling off evenly to VOLT.edge of that at the rim;
//   - the physical blast, VOLT.blast: an explosion tearing through enemy ground units and enemy
//     structures within its own radius, by the usual explosive multipliers (hardest on infantry
//     and structures, least on heavy armour; aircraft are above it).
// Friendly units and structures are spared. A mule killed by the blast goes critical in turn, so a
// cluster of mules goes off in a rolling chain.
//
// Pure: CityMap and the headless runner keep the charges, arm them as mules die, and add each
// detonation's damage to the tick's weapons fire.

import type { StructureData, UnitData } from '../types';
import type { GridPos, Team } from './commands';
import { damageTakenMultiplier, upgradeDamage } from './unitAbilities';
import { DAMAGE_MULTIPLIER, UNIT_RULES } from './units';

export const VOLT = {
  radius: 4,
  damage: 220,
  // Share of the full damage at the rim.
  edge: 0.25,
  // The countdown between the mule dying and the blast.
  fuseMs: 3000,
  // The physical blast: explosive damage at the centre, its reach in tiles, and the share left at the rim.
  blast: { damage: 260, radius: 3, edge: 0.3 },
};

// A mule's core counting down where it died.
// power: the mule's damage multiplier (its upgrades).
export interface VoltCharge { muleId: string; team: UnitData['team']; at: GridPos; armedAt: number; blowsAt: number; power?: number }

// What a blast does at `distance` tiles from its centre.
export const voltDamage = (distance: number) =>
  distance > VOLT.radius ? 0 : VOLT.damage * (1 - (1 - VOLT.edge) * (distance / VOLT.radius));

// What the physical blast does at `distance` tiles from its centre, before armour.
export const voltBlastDamage = (distance: number) =>
  distance > VOLT.blast.radius ? 0 : VOLT.blast.damage * (1 - (1 - VOLT.blast.edge) * (distance / VOLT.blast.radius));

// Charges for every Battery Mule that died this tick on a side with the Volt Core.
export const armMules = (units: readonly UnitData[], armed: (team: Team) => boolean, now: number): VoltCharge[] =>
  units.filter(u => u.type === 'sun_plate' && u.health <= 0 && (u.team === 'blue' || u.team === 'red') && armed(u.team))
    .map(u => ({ muleId: u.id, team: u.team, at: { ...u.gridPos }, armedAt: now, blowsAt: now + VOLT.fuseMs, power: upgradeDamage(u) }));

// The charges whose countdown is over.
export const dueCharges = (charges: readonly VoltCharge[], now: number) => charges.filter(c => c.blowsAt <= now);

// The damage these charges' detonations do, discharge and blast together, to the living units and
// the structures round them, and who hit whom.
export function voltBlasts(
  units: readonly UnitData[],
  blasts: readonly VoltCharge[],
  structures: readonly Pick<StructureData, 'id' | 'team' | 'gridPos' | 'health'>[] = [],
): { damage: Map<string, number>; structureDamage: Map<string, number>; hits: { attackerId: string; targetId: string }[] } {
  const damage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const hits: { attackerId: string; targetId: string }[] = [];
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);
  for (const b of blasts) {
    const power = b.power ?? 1;
    for (const t of units) {
      if (t.health <= 0 || t.team === b.team || t.team === 'neutral') continue;
      const d = Math.hypot(t.gridPos.x - b.at.x, t.gridPos.z - b.at.z);
      const n = voltDamage(d) + voltBlastDamage(d) * DAMAGE_MULTIPLIER.explosive[UNIT_RULES[t.type].armor];
      if (n <= 0) continue;
      add(damage, t.id, n * power * damageTakenMultiplier(t));
      hits.push({ attackerId: b.muleId, targetId: t.id });
    }
    for (const s of structures) {
      if (s.health <= 0 || s.team === b.team) continue;
      const n = voltBlastDamage(Math.hypot(s.gridPos.x - b.at.x, s.gridPos.z - b.at.z)) * DAMAGE_MULTIPLIER.explosive.structure;
      if (n <= 0) continue;
      add(structureDamage, s.id, n * power);
      hits.push({ attackerId: b.muleId, targetId: s.id });
    }
  }
  return { damage, structureDamage, hits };
}

// Seconds left on a charge's countdown, for the warning (3, 2, 1).
export const countdownOf = (c: VoltCharge, now: number) => Math.max(1, Math.ceil((c.blowsAt - now) / 1000));
