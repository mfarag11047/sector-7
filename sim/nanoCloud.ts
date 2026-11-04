// Netrunner Tier 2: the Nano-Cloud.
//
// A cloud of nanites comes down over the target for ABILITY_CONFIG.NANO_CLOUD_DURATION, and it
// works for the side that cast it:
//   - Enemy units inside it are blinded: they can't fire at all, their remote units (drones and
//     other uncrewed machines, sim/jamming.ts) lose their link and take no new orders, and a
//     Helios can't charge them.
//   - The caster's own units inside it can't be picked out by the enemy, and fire out of it as
//     normal.
// Drop it on the enemy army to silence it for a few seconds while yours shoots, or over your own
// to cover a push or a retreat. Blasts and shelling across an area still hurt everyone inside.
//
// Pure: CityMap.tsx and sim/headless.ts keep the clouds, and pass a check built here to combat,
// rail guns, charging and jamming.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { isRemoteUnit } from './jamming';

export interface NanoCloudArea { team: UnitData['team']; at: GridPos; radius: number }

// Whether a unit of `team` at `pos` is affected: 'firing' when an enemy cloud blinds it, 'target'
// when its own side's cloud hides it.
export type NanoCheck = (pos: GridPos, team: UnitData['team'], as: 'firing' | 'target') => boolean;
export const NO_NANO: NanoCheck = () => false;

const inside = (c: NanoCloudArea, p: GridPos) => Math.hypot(p.x - c.at.x, p.z - c.at.z) <= c.radius;

export function nanoCheck(clouds: readonly NanoCloudArea[]): NanoCheck {
  if (clouds.length === 0) return NO_NANO;
  return (pos, team, as) => clouds.some(c => (as === 'firing' ? c.team !== team : c.team === team && team !== 'neutral') && inside(c, pos));
}

// Enemy remote units inside a cloud: jammed, as by a Banshee.
export function nanoJammed(units: readonly UnitData[], clouds: readonly NanoCloudArea[]): Set<string> {
  const jammed = new Set<string>();
  if (clouds.length === 0) return jammed;
  for (const u of units) {
    if (u.health > 0 && isRemoteUnit(u) && clouds.some(c => c.team !== u.team && inside(c, u.gridPos))) jammed.add(u.id);
  }
  return jammed;
}
