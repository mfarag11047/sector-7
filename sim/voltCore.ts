// The Battery Mule's Volt Core (Tier 2, researched at Advanced Research, sim/upgrades.ts).
//
// Passive. A Battery Mule carries a lot of charge; with the Volt Core researched, when one is
// destroyed its core goes critical where it fell: a flashing red warning and a VOLT.fuseMs
// countdown, then it detonates, discharging into every enemy unit within VOLT.radius tiles, ground
// or air. The blast does VOLT.damage at the centre, falling off evenly to VOLT.edge of that at the
// rim. Friendly units and structures are spared. A mule killed by the blast goes critical in turn,
// so a cluster of mules goes off in a rolling chain.
//
// Pure: CityMap and the headless runner keep the charges, arm them as mules die, and add each
// detonation's damage to the tick's weapons fire.

import type { UnitData } from '../types';
import type { GridPos, Team } from './commands';
import { damageTakenMultiplier, upgradeDamage } from './unitAbilities';

export const VOLT = {
  radius: 4,
  damage: 220,
  // Share of the full damage at the rim.
  edge: 0.25,
  // The countdown between the mule dying and the blast.
  fuseMs: 3000,
};

// A mule's core counting down where it died.
// power: the mule's damage multiplier (its upgrades).
export interface VoltCharge { muleId: string; team: UnitData['team']; at: GridPos; armedAt: number; blowsAt: number; power?: number }

// What a blast does at `distance` tiles from its centre.
export const voltDamage = (distance: number) =>
  distance > VOLT.radius ? 0 : VOLT.damage * (1 - (1 - VOLT.edge) * (distance / VOLT.radius));

// Charges for every Battery Mule that died this tick on a side with the Volt Core.
export const armMules = (units: readonly UnitData[], armed: (team: Team) => boolean, now: number): VoltCharge[] =>
  units.filter(u => u.type === 'sun_plate' && u.health <= 0 && (u.team === 'blue' || u.team === 'red') && armed(u.team))
    .map(u => ({ muleId: u.id, team: u.team, at: { ...u.gridPos }, armedAt: now, blowsAt: now + VOLT.fuseMs, power: upgradeDamage(u) }));

// The charges whose countdown is over.
export const dueCharges = (charges: readonly VoltCharge[], now: number) => charges.filter(c => c.blowsAt <= now);

// The damage these charges' blasts do to the living units round them, and who hit whom.
export function voltBlasts(units: readonly UnitData[], blasts: readonly VoltCharge[]): { damage: Map<string, number>; hits: { attackerId: string; targetId: string }[] } {
  const damage = new Map<string, number>();
  const hits: { attackerId: string; targetId: string }[] = [];
  for (const b of blasts) {
    for (const t of units) {
      if (t.health <= 0 || t.team === b.team || t.team === 'neutral') continue;
      const n = voltDamage(Math.hypot(t.gridPos.x - b.at.x, t.gridPos.z - b.at.z));
      if (n <= 0) continue;
      damage.set(t.id, (damage.get(t.id) || 0) + n * (b.power ?? 1) * damageTakenMultiplier(t));
      hits.push({ attackerId: b.muleId, targetId: t.id });
    }
  }
  return { damage, hits };
}

// Seconds left on a charge's countdown, for the warning (3, 2, 1).
export const countdownOf = (c: VoltCharge, now: number) => Math.max(1, Math.ceil((c.blowsAt - now) / 1000));
