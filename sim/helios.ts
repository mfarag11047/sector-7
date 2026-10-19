// The Helios microwave drone: a support drone with two modes, one at a time, switched from its
// menu (SET_HELIOS_MODE).
//
//   - Charge (the default): beams power to every friendly unit within HELIOS_RADIUS tiles, itself
//     included, a slow trickle that tops batteries up over time. Because it charges itself, a
//     Helios left in this mode never runs flat.
//   - Microwave: cooks every enemy unit within the same radius for slow damage over time. It
//     charges nothing, itself included, and the beam drains its own battery; it stops when the
//     battery is flat.
// A Helios knocked out by an EMP or stunned does neither. A Bulwark force field stops the
// microwave beam like any other enemy fire (sim/forcefield.ts).
//
// Pure: energy.ts asks who is charging, CityMap and headless matches apply the damage.

import type { UnitData } from '../types';
import { ABILITY_CONFIG } from '../constants';
import { shotBlocked, type ForceField } from './forcefield';
import { isEmpDisabled } from './unitAbilities';

export const HELIOS = {
  // Tiles.
  radius: ABILITY_CONFIG.HELIOS_RADIUS,
  // Battery given to each friendly unit in range every 100 ms tick in Charge mode (3 a second).
  chargePerTick: 0.3,
  // Damage a second to each enemy in range in Microwave mode.
  burnDps: 4,
  // Battery the beam costs the Helios every tick in Microwave mode (1.5 a second).
  burnDrainPerTick: 0.15,
};

export type HeliosMode = 'charge' | 'burn';
export const heliosMode = (u: Pick<UnitData, 'heliosMode'>): HeliosMode => u.heliosMode ?? 'charge';

const working = (u: UnitData) => u.type === 'helios' && u.health > 0 && !u.isStunned && !isEmpDisabled(u);
// Charging needs no battery of its own: the Helios is charging itself.
export const isChargingHelios = (u: UnitData) => working(u) && heliosMode(u) === 'charge';
export const isBurningHelios = (u: UnitData) => working(u) && heliosMode(u) === 'burn' && u.battery > 0;

const inRange = (a: UnitData, b: UnitData) => Math.hypot(a.gridPos.x - b.gridPos.x, a.gridPos.z - b.gridPos.z) <= HELIOS.radius;

// Battery each unit gets from Helios chargers this tick.
export function heliosCharge(u: UnitData, chargers: readonly UnitData[]): number {
  let amount = 0;
  for (const c of chargers) if (c.team === u.team && isChargingHelios(c) && inRange(c, u)) amount += HELIOS.chargePerTick;
  return amount;
}

// Microwave damage this tick to each enemy unit in a burning Helios' radius.
export function microwaveDamage(units: readonly UnitData[], dtMs: number, fields: readonly ForceField[] = []): Map<string, number> {
  const damage = new Map<string, number>();
  const burners = units.filter(isBurningHelios);
  if (burners.length === 0) return damage;
  const dose = HELIOS.burnDps * dtMs / 1000;
  for (const u of units) {
    if (u.health <= 0 || u.team === 'neutral') continue;
    for (const h of burners) {
      if (h.team === u.team || !inRange(h, u)) continue;
      // An enemy dome in the way stops the beam (not one the Helios is already inside).
      if (fields.length > 0 && shotBlocked(fields, h.team, h.gridPos, u.gridPos)) continue;
      damage.set(u.id, (damage.get(u.id) || 0) + dose);
    }
  }
  return damage;
}

// Each burning Helios and the area it cooks, for the pacing report's damage tally.
export const heliosBeams = (units: readonly UnitData[]) =>
  units.filter(isBurningHelios).map(h => ({ attackerId: h.id, team: h.team, at: h.gridPos, radius: HELIOS.radius }));
