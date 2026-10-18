// The Thunderhead mobile artillery battery.
//
// It is a truck on the move and a gun only when planted: it can't fire while mobile, anchors
// down only when stationary, and then takes a few seconds to set up. Anchored, it shells
// whatever tile the player orders (a fire mission, blind if need be) or, with no orders, the
// nearest enemy its side can see within range. Shells take time to fly, so moving targets can
// get out from under them. Its range grows with the side's researched tier.
//
// Everything here is pure: it reads the state it is given and reports what happens. CityMap and
// the headless runner keep the shells in flight and apply the damage.

import type { StructureData, UnitData } from '../types';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { damageTakenMultiplier, isEmpDisabled, visionOf } from './unitAbilities';
import { ArmorClass, DAMAGE_MULTIPLIER, Tier, UNIT_RULES } from './units';

export const ARTILLERY = {
  // Range in tiles at each researched tier, and the dead zone it can't drop shells into.
  range: { 1: 12, 2: 16, 3: 20 } as Record<Tier, number>,
  minRange: 3,
  setupMs: 3000,
  cooldownMs: 5000,
  damage: 70,
  // Splash radius in tiles; damage falls off to edgeFactor at the edge.
  splash: 1.6,
  edgeFactor: 0.4,
  // A shell drifts up to this many tiles from where it was aimed.
  scatter: 0.7,
  // Flight time: a fixed part plus a little per tile.
  flightBaseMs: 1200,
  flightPerTileMs: 90,
  // Friendly structures see this far, for counter-battery fire around the base.
  structureVision: 5,
};

export interface ArtilleryShell {
  id: string;
  team: UnitData['team'];
  attackerId: string;
  from: GridPos;
  // Where it lands, in fractional tiles.
  at: { x: number; z: number };
  firedAt: number;
  landsAt: number;
}

const tiles = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// Where a shell is over the ground right now, in fractional tiles.
export const shellGroundPos = (s: ArtilleryShell, now: number) => {
  const t = Math.min(1, Math.max(0, (now - s.firedAt) / (s.landsAt - s.firedAt)));
  return { x: s.from.x + (s.at.x - s.from.x) * t, z: s.from.z + (s.at.z - s.from.z) * t };
};

export const isArtillery = (u: Pick<UnitData, 'type'>) => u.type === 'howitzer';
export const artilleryRange = (tier: Tier) => ARTILLERY.range[tier];
export const inArtilleryReach = (from: GridPos, to: GridPos, tier: Tier) => {
  const d = tiles(from, to);
  return d >= ARTILLERY.minRange && d <= artilleryRange(tier);
};

// Planted and finished setting up.
export const isArtilleryReady = (u: UnitData, now: number) =>
  isArtillery(u) && !!u.isDeployed && now - (u.anchoredAt ?? 0) >= ARTILLERY.setupMs;

// Whether `team` can see a tile: a living friendly unit within its vision, or a friendly structure nearby.
export function spottedBy(team: UnitData['team'], at: GridPos, units: readonly UnitData[], structures: readonly StructureData[]): boolean {
  for (const f of units) if (f.team === team && f.health > 0 && tiles(f.gridPos, at) <= visionOf(f)) return true;
  for (const s of structures) if (s.team === team && s.health > 0 && !s.isBlueprint && tiles(s.gridPos, at) <= ARTILLERY.structureVision) return true;
  return false;
}

// What each ready battery fires at this tick: its fire mission, or failing that the nearest enemy
// ground unit it can see in range, then the nearest enemy structure. Aircraft are out of reach.
export function fireArtillery(
  units: readonly UnitData[],
  structures: readonly StructureData[],
  now: number,
  tierOf: (team: UnitData['team']) => Tier,
  random: () => number,
  newId: () => string,
): { shells: ArtilleryShell[]; fired: Map<string, GridPos> } {
  const shells: ArtilleryShell[] = [];
  const fired = new Map<string, GridPos>();
  for (const u of units) {
    if (u.health <= 0 || u.isStunned || isEmpDisabled(u) || !isArtilleryReady(u, now)) continue;
    if (now - (u.lastAttackTime || 0) < ARTILLERY.cooldownMs) continue;
    const tier = tierOf(u.team);
    let aim: GridPos | null = u.artilleryTarget && inArtilleryReach(u.gridPos, u.artilleryTarget, tier) ? u.artilleryTarget : null;
    if (!aim) {
      let best = Infinity;
      for (const t of units) {
        if (t.team === u.team || t.health <= 0 || isHidden(t) || UNIT_RULES[t.type].armor === 'air') continue;
        const d = tiles(u.gridPos, t.gridPos);
        if (d < best && inArtilleryReach(u.gridPos, t.gridPos, tier) && spottedBy(u.team, t.gridPos, units, structures)) { best = d; aim = t.gridPos; }
      }
      if (!aim) {
        for (const s of structures) {
          if (s.team === u.team || s.health <= 0) continue;
          const d = tiles(u.gridPos, s.gridPos);
          if (d < best && inArtilleryReach(u.gridPos, s.gridPos, tier) && spottedBy(u.team, s.gridPos, units, structures)) { best = d; aim = s.gridPos; }
        }
      }
    }
    if (!aim) continue;
    const angle = random() * Math.PI * 2;
    const drift = random() * ARTILLERY.scatter;
    const at = { x: aim.x + Math.cos(angle) * drift, z: aim.z + Math.sin(angle) * drift };
    shells.push({
      id: newId(), team: u.team, attackerId: u.id, from: { ...u.gridPos }, at, firedAt: now,
      landsAt: now + ARTILLERY.flightBaseMs + ARTILLERY.flightPerTileMs * tiles(u.gridPos, aim),
    });
    fired.set(u.id, { ...aim });
  }
  return { shells, fired };
}

const shellDamage = (armor: ArmorClass, distance: number) =>
  ARTILLERY.damage * DAMAGE_MULTIPLIER.explosive[armor] * (1 - (1 - ARTILLERY.edgeFactor) * Math.min(1, distance / ARTILLERY.splash));

// Shells that have come down by `now`, and what they hit: enemy ground units and structures
// inside the splash. Friendly troops under the barrage are spared, as with every other weapon.
export function landShells(
  shells: readonly ArtilleryShell[],
  now: number,
  units: readonly UnitData[],
  structures: readonly StructureData[],
): { landed: ArtilleryShell[]; flying: ArtilleryShell[]; unitDamage: Map<string, number>; structureDamage: Map<string, number> } {
  const landed: ArtilleryShell[] = [];
  const flying: ArtilleryShell[] = [];
  const unitDamage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, n: number) => map.set(id, (map.get(id) || 0) + n);
  for (const shell of shells) {
    if (shell.landsAt > now) { flying.push(shell); continue; }
    landed.push(shell);
    for (const u of units) {
      if (u.team === shell.team || u.health <= 0) continue;
      const armor = UNIT_RULES[u.type].armor;
      const d = tiles(u.gridPos, shell.at);
      if (armor === 'air' || d > ARTILLERY.splash) continue;
      add(unitDamage, u.id, shellDamage(armor, d) * damageTakenMultiplier(u));
    }
    for (const s of structures) {
      if (s.team === shell.team || s.health <= 0) continue;
      const d = tiles(s.gridPos, shell.at);
      if (d <= ARTILLERY.splash) add(structureDamage, s.id, shellDamage('structure', d));
    }
  }
  return { landed, flying, unitDamage, structureDamage };
}
