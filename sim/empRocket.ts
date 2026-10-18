// The Lancer's EMP Tandem Rocket in flight.
//
// It has two fire modes. Locked on, it is fired at an enemy vehicle or aircraft the Lancer's side
// can see and steers after it until it hits, wherever the target runs. Fired at a location, it
// flies straight to a tile, for when nothing is in sight.
//
// Where it goes off, every enemy vehicle and aircraft in the blast shuts down for a few seconds
// and loses half a full battery of charge. Infantry shrug it off.
//
// Pure: it reads the state it is given and reports what happens. CityMap and the headless runner
// keep the rockets in flight and apply the effects.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { abilityDef, addBuff, empVictims } from './unitAbilities';
import { UNIT_RULES } from './units';

export const EMP_ROCKET = {
  // Tiles a second.
  speed: 9,
  // A rocket that can't catch its target burns out and goes off where it is.
  maxFlightMs: 4000,
  radius: abilityDef('emp_rocket')!.targeted!.radius,
  empMs: abilityDef('emp_rocket')!.durationMs,
  // Share of a full battery each victim loses.
  batteryDrain: 0.5,
};

export interface EmpRocket {
  id: string;
  team: UnitData['team'];
  attackerId: string;
  // Where it was fired from, in tiles.
  from: { x: number; z: number };
  // Where it is now and where it is heading, in fractional tiles.
  at: { x: number; z: number };
  aim: { x: number; z: number };
  // Locked on: the unit it is chasing. The aim follows it while it lives.
  targetUnitId: string | null;
  firedAt: number;
}

// Vehicles and aircraft: what the rocket can lock on to and what its pulse knocks out.
export const isEmpTarget = (u: UnitData) => u.health > 0 && UNIT_RULES[u.type].armor !== 'infantry';

// One step of every rocket in flight. Locked rockets turn after their target as it moves; a lost
// target (destroyed) leaves the rocket heading for where it last saw it.
export function empRocketTick(rockets: readonly EmpRocket[], units: readonly UnitData[], now: number, dtMs: number) {
  const flying: EmpRocket[] = [];
  const detonated: { rocket: EmpRocket; at: { x: number; z: number } }[] = [];
  const step = EMP_ROCKET.speed * (dtMs / 1000);
  for (const r of rockets) {
    const target = r.targetUnitId ? units.find(u => u.id === r.targetUnitId && u.health > 0) : undefined;
    const aim = target ? { x: target.gridPos.x, z: target.gridPos.z } : r.aim;
    const dx = aim.x - r.at.x;
    const dz = aim.z - r.at.z;
    const d = Math.hypot(dx, dz);
    if (d <= step) { detonated.push({ rocket: r, at: aim }); continue; }
    const at = { x: r.at.x + (dx / d) * step, z: r.at.z + (dz / d) * step };
    if (now - r.firedAt >= EMP_ROCKET.maxFlightMs) { detonated.push({ rocket: r, at }); continue; }
    flying.push({ ...r, at, aim, targetUnitId: target ? r.targetUnitId : null });
  }
  return { flying, detonated };
}

// What a rocket going off at `at` does: shuts down the enemy vehicles and aircraft in the blast
// and drains half a battery from each.
export function empRocketImpact(units: readonly UnitData[], at: GridPos | { x: number; z: number }, team: UnitData['team'], now: number) {
  const updates = new Map<string, (u: UnitData) => UnitData>();
  for (const victim of empVictims(units, at as GridPos, EMP_ROCKET.radius, team)) {
    updates.set(victim.id, u => ({
      ...addBuff(u, 'emp', now + EMP_ROCKET.empMs),
      battery: Math.max(0, u.battery - u.maxBattery * EMP_ROCKET.batteryDrain),
    }));
  }
  return updates;
}

// Several rockets may go off on the same unit in one tick: chain their effects.
export function mergeUnitUpdates(into: Map<string, (u: UnitData) => UnitData>, from: Map<string, (u: UnitData) => UnitData>) {
  from.forEach((f, id) => {
    const prev = into.get(id);
    into.set(id, prev ? u => f(prev(u)) : f);
  });
  return into;
}
