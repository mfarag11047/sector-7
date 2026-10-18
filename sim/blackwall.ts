// Black Wall Infect: the Netrunner doctrine's Tier 3 power.
//
// A virus bomb falls on the target. Every enemy unit caught in its small blast loses a quarter of
// its maximum health at once and is infected with the Black Wall. An infected unit slowly burns
// down until it dies; nothing cures it. The virus spreads through the infected unit's own side:
// a friendly unit that stays within two tiles of an infected one for 2.5 s catches it too.
// Stepping out of range resets the exposure.
//
// Pure: reads the units it is given and reports updates. CityMap drops the bomb and applies them.

import type { UnitData } from '../types';
import type { GridPos } from './commands';

export const BLACKWALL = {
  // Blast radius of the bomb, in tiles.
  radius: 1.5,
  // Share of maximum health the blast takes.
  impactShare: 0.25,
  // Share of maximum health an infected unit loses each second. From 75% health that is 30 s.
  burnPerSecond: 0.025,
  // How close (tiles) a unit has to stay to an infected friend to catch it, and for how long.
  spreadRange: 2,
  spreadMs: 2500,
  // How long the bomb takes to fall from the sky.
  fallMs: 1200,
};

export const isInfected = (u: UnitData) => u.blackwallInfectedAt !== undefined;

// Units that can catch it: anything alive on a side (the neutral Sentinels don't count).
const susceptible = (u: UnitData) => u.health > 0 && u.team !== 'neutral';

// The bomb going off at `at`, dropped by `team`: enemy units in the blast take a quarter of their
// maximum health and are infected.
export function blackwallImpact(units: readonly UnitData[], at: GridPos, team: UnitData['team'], now: number) {
  const updates = new Map<string, (u: UnitData) => UnitData>();
  for (const u of units) {
    if (!susceptible(u) || u.team === team) continue;
    if (Math.hypot(u.gridPos.x - at.x, u.gridPos.z - at.z) > BLACKWALL.radius) continue;
    updates.set(u.id, x => ({
      ...x,
      health: Math.max(0, x.health - x.maxHealth * BLACKWALL.impactShare),
      blackwallInfectedAt: x.blackwallInfectedAt ?? now,
      blackwallExposureMs: undefined,
      lastDamageTime: now,
    }));
  }
  return updates;
}

// One tick of the virus: infected units burn, and healthy units near an infected friend build up
// exposure until they catch it.
export function blackwallTick(units: readonly UnitData[], dtMs: number, now: number) {
  const updates = new Map<string, (u: UnitData) => UnitData>();
  const carriers = units.filter(u => susceptible(u) && isInfected(u));
  if (carriers.length === 0) {
    // Nobody to catch it from: clear any leftover exposure.
    for (const u of units) if (u.blackwallExposureMs) updates.set(u.id, x => ({ ...x, blackwallExposureMs: undefined }));
    return updates;
  }
  const burn = dtMs / 1000 * BLACKWALL.burnPerSecond;
  for (const u of units) {
    if (!susceptible(u)) continue;
    if (isInfected(u)) {
      updates.set(u.id, x => ({ ...x, health: Math.max(0, x.health - x.maxHealth * burn) }));
      continue;
    }
    const exposed = carriers.some(c => c.team === u.team && Math.hypot(c.gridPos.x - u.gridPos.x, c.gridPos.z - u.gridPos.z) <= BLACKWALL.spreadRange);
    if (!exposed) {
      if (u.blackwallExposureMs) updates.set(u.id, x => ({ ...x, blackwallExposureMs: undefined }));
      continue;
    }
    const exposure = (u.blackwallExposureMs ?? 0) + dtMs;
    if (exposure >= BLACKWALL.spreadMs) {
      updates.set(u.id, x => ({ ...x, blackwallInfectedAt: now, blackwallExposureMs: undefined }));
    } else {
      updates.set(u.id, x => ({ ...x, blackwallExposureMs: exposure }));
    }
  }
  return updates;
}
