// The Ballista's warheads: what each does when it lands, and the helpers for missile inventories.
//
// - EMP: knocks out the enemy grid and the vehicles and aircraft in the blast (CityMap, EMP cloud).
// - HE: an anti-armour blast. Full damage against heavy armour, much less against infantry and
//   aircraft (HE.vs).
// - White Phosphorus: bursts above the target into WP.canisters small canisters scattered over
//   WP.radius tiles. They lay a burning white gas that lingers for WP.durationMs, hurting the
//   enemy infantry inside it every tick. Vehicles, aircraft and structures are untouched.
//
// Pure: CityMap turns the impact into a blast and a cloud; wpGasDamage is the gas's damage per tick.

import type { CloudData, UnitData } from '../types';
import type { Warhead } from './commands';
import { ArmorClass, UNIT_RULES } from './units';
import { damageTakenMultiplier } from './unitAbilities';

export const WARHEAD_LIST: readonly Warhead[] = ['emp', 'he', 'wp'];
export const WARHEAD_LABEL: Record<Warhead, string> = { emp: 'EMP', he: 'HE', wp: 'WP' };
export const WARHEAD_NAME: Record<Warhead, string> = { emp: 'EMP', he: 'High Explosive', wp: 'White Phosphorus' };

export type MissileInventory = Record<Warhead, number>;
export const emptyInventory = (): MissileInventory => ({ emp: 0, he: 0, wp: 0 });

// A unit's missiles, with every warhead present.
export const inventoryOf = (u: Pick<UnitData, 'missileInventory'>): MissileInventory => ({
  emp: u.missileInventory?.emp || 0,
  he: u.missileInventory?.he || 0,
  wp: u.missileInventory?.wp || 0,
});

export const missilesHeld = (u: Pick<UnitData, 'missileInventory'>) => {
  const inv = inventoryOf(u);
  return inv.emp + inv.he + inv.wp;
};

// The inventory with `count` more (or fewer) of one warhead.
export function addToInventory(u: Pick<UnitData, 'missileInventory'>, warhead: Warhead, count: number): MissileInventory {
  const inv = inventoryOf(u);
  inv[warhead] += count;
  return inv;
}

export const HE = {
  damage: 150,
  radius: 4,
  // Against each armour class. Built to kill tanks; infantry and aircraft mostly shrug it off.
  vs: { heavy: 2, light: 1.25, infantry: 0.4, air: 0.4, structure: 1 } as Record<ArmorClass, number>,
};

export const heMultiplier = (u: Pick<UnitData, 'type'>) => HE.vs[UNIT_RULES[u.type]?.armor ?? 'light'];

export const WP = {
  radius: 6,
  durationMs: 20_000,
  // Damage per second to each enemy infantry unit in the gas.
  dps: 12,
  canisters: 14,
  // How high above the target the missile bursts, and how long the canisters take to come down.
  burstHeight: 14,
  fallMs: 1100,
};

// Where each canister of a WP cloud lands, as tile offsets from its centre. Fixed by the cloud's
// id, so every render scatters them the same way.
export function canisterSpots(cloudId: string, count = WP.canisters, radius = WP.radius): { x: number; z: number }[] {
  let seed = 0;
  for (let i = 0; i < cloudId.length; i++) seed = (seed * 31 + cloudId.charCodeAt(i)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    // Spread evenly round the circle, out to most of the radius, so the gas covers the area.
    const angle = (i / count) * Math.PI * 2 + rand() * 0.8;
    const r = radius * (0.15 + 0.75 * Math.sqrt(rand()));
    return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
  });
}

// One tick of the gas: damage to every enemy infantry unit inside a live WP cloud. A unit in two
// clouds burns twice.
export function wpGasDamage(units: readonly UnitData[], clouds: readonly CloudData[], now: number, tickMs: number): Map<string, number> {
  const damage = new Map<string, number>();
  const perTick = WP.dps * tickMs / 1000;
  for (const c of clouds) {
    if (c.type !== 'wp' || now - c.createdAt >= c.duration || now - c.createdAt < WP.fallMs) continue;
    for (const u of units) {
      if (u.health <= 0 || u.team === c.team || u.team === 'neutral' || UNIT_RULES[u.type]?.armor !== 'infantry') continue;
      if (Math.hypot(u.gridPos.x - c.gridPos.x, u.gridPos.z - c.gridPos.z) > c.radius) continue;
      damage.set(u.id, (damage.get(u.id) || 0) + perTick * damageTakenMultiplier(u));
    }
  }
  return damage;
}
