// Shadow Ops Tier 2: Phantom Decoys.
//
// Holograms of the caster's own units come up at the target: copies of whatever of its army is
// nearest (a squad of Troopers, Razorbacks, a Tank...), HOLOGRAM.count of them. To the enemy they
// are real units: they show on its map, its guns pick them like any other, and the computer counts
// them as an army. They fight like the real thing, firing harmless shots, and their owner moves
// them like any unit, so they can walk ahead of a push or round a flank to draw the fire.
//
// But they are light: every hit does HOLOGRAM.damageTaken times its damage, so a few shots break
// one. After HOLOGRAM.lifeMs they fade. They capture nothing, hack nothing, salvage nothing, take
// no population, leave no wreck, cast no abilities and never go dark (they are there to be seen).
//
// Pure: sim/headless.ts and CityMap.tsx spawn them (spawnHolograms) and fade them (fadeHolograms);
// the systems they'd otherwise take part in check isHologram.

import { UNIT_STATS } from '../constants';
import type { UnitData, UnitType } from '../types';
import type { GridPos } from './commands';
import { createUnit } from './production';
import { UNIT_RULES } from './units';

export const HOLOGRAM = {
  count: 6,
  lifeMs: 20_000,
  // Damage a hologram takes, times what the shot would do to the real unit.
  damageTaken: 4,
  // Tiles around the target to look for units to copy.
  copyRadius: 8,
  // How far from the target they come up.
  spread: 1.5,
};

export const isHologram = (u: Pick<UnitData, 'hologramUntil'>) => u.hologramUntil !== undefined;

// What a hologram of this unit is: plain direct-fire units, so nothing a copy does can reach past
// its harmless shots (no rail guns, shells, swarms or cloaks). Anything else is copied as the
// plain unit of its kind.
const COPYABLE: ReadonlySet<UnitType> = new Set<UnitType>(['trooper', 'lancer', 'razorback', 'tank', 'attack_drone']);
export function hologramTypeFor(type: UnitType): UnitType {
  if (COPYABLE.has(type)) return type;
  const armor = UNIT_RULES[type].armor;
  if (armor === 'heavy') return 'tank';
  if (armor === 'light') return 'razorback';
  if (armor === 'air') return 'attack_drone';
  return 'trooper';
}

// The holograms for a cast at `at`: copies of the side's own units nearest it, the dearest first,
// or Troopers if it has nothing near.
export function spawnHolograms(
  units: readonly UnitData[], team: 'blue' | 'red', at: GridPos, now: number, newId: () => string,
  isWalkable: (x: number, z: number) => boolean = () => true,
): UnitData[] {
  const near = units
    .filter(u => u.team === team && u.health > 0 && !isHologram(u) && UNIT_RULES[u.type].weapon && Math.hypot(u.gridPos.x - at.x, u.gridPos.z - at.z) <= HOLOGRAM.copyRadius)
    .map(u => hologramTypeFor(u.type));
  near.sort((a, b) => (UNIT_STATS[b].cost || 0) - (UNIT_STATS[a].cost || 0));
  const types: UnitType[] = [];
  for (let i = 0; i < HOLOGRAM.count; i++) types.push(near.length > 0 ? near[i % near.length] : 'trooper');
  return types.map((type, i) => {
    const angle = (i / HOLOGRAM.count) * Math.PI * 2;
    let spot = { x: Math.round(at.x + Math.cos(angle) * HOLOGRAM.spread), z: Math.round(at.z + Math.sin(angle) * HOLOGRAM.spread) };
    if (UNIT_RULES[type].armor !== 'air' && !isWalkable(spot.x, spot.z)) spot = { x: Math.round(at.x), z: Math.round(at.z) };
    return { ...createUnit(type, team, newId(), spot), hologramUntil: now + HOLOGRAM.lifeMs };
  });
}

// Holograms past their time fade (are removed); everything else is kept as it is.
export function fadeHolograms<T extends Pick<UnitData, 'hologramUntil'>>(units: T[], now: number): T[] {
  return units.some(u => u.hologramUntil !== undefined && now >= u.hologramUntil) ? units.filter(u => u.hologramUntil === undefined || now < u.hologramUntil) : units;
}
