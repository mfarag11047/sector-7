// The Thunderhead mobile artillery battery.
//
// It is a truck on the move and a gun only when planted: it can't fire while mobile, anchors
// down only when stationary, and then takes a few seconds to set up. Anchored, it shells
// whatever tile the player orders (a fire mission, blind if need be) or, with no orders, fires on
// sight: the nearest armed enemy that it or any friendly unit can see within range, then any other
// enemy ground unit, then an enemy structure. Shells take time to fly, so moving targets can get
// out from under them. Its range grows with the side's researched tier. Shells also knock down
// city buildings, though far more slowly than a Bombardment Drone.
//
// Everything here is pure: it reads the state it is given and reports what happens. CityMap and
// the headless runner keep the shells in flight and apply the damage.

import { ForceField, impactAbsorbed, shotBlocked } from './forcefield';
import type { BuildingData, StructureData, UnitData } from '../types';
import { dropDamage, isIndestructible } from './bombard';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { damageTakenMultiplier, upgradeDamage, isEmpDisabled, visionOf } from './unitAbilities';
import { isScreened } from './titan';
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
  // Each shell does this share of a Bombardment Drone drop to every city building in its splash
  // (sim/bombard.ts), so a block that takes 2 drops takes 8 shells.
  buildingShare: 0.25,
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
  // The gun's damage multiplier when it fired (its upgrades).
  power?: number;
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

// What each ready battery fires at this tick: its fire mission, or failing that (firing on sight)
// the nearest armed enemy ground unit it or its side can see in range, then the nearest unarmed
// one, then the nearest enemy structure. Aircraft are out of reach.
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
    if (!aim) aim = onSight(u, units, structures, tier);
    if (!aim) continue;
    const angle = random() * Math.PI * 2;
    const drift = random() * ARTILLERY.scatter;
    const at = { x: aim.x + Math.cos(angle) * drift, z: aim.z + Math.sin(angle) * drift };
    shells.push({
      id: newId(), team: u.team, attackerId: u.id, from: { ...u.gridPos }, at, firedAt: now, power: upgradeDamage(u),
      landsAt: now + ARTILLERY.flightBaseMs + ARTILLERY.flightPerTileMs * tiles(u.gridPos, aim),
    });
    fired.set(u.id, { ...aim });
  }
  return { shells, fired };
}

// The fire-on-sight pick for a battery with no fire mission, or null when nothing is in view.
function onSight(gun: UnitData, units: readonly UnitData[], structures: readonly StructureData[], tier: Tier): GridPos | null {
  // Armed enemies first (0), then unarmed ones (1); nearest within each.
  let best: { at: GridPos; rank: number; d: number } | null = null;
  for (const t of units) {
    // Nothing to aim at inside an enemy Smoke Screen (sim/titan.ts); a fire mission on the tile still lands.
    if (t.team === gun.team || t.health <= 0 || isHidden(t) || isScreened(t) || UNIT_RULES[t.type].armor === 'air') continue;
    const rank = UNIT_RULES[t.type].weapon ? 0 : 1;
    const d = tiles(gun.gridPos, t.gridPos);
    if (best && (rank > best.rank || (rank === best.rank && d >= best.d))) continue;
    if (inArtilleryReach(gun.gridPos, t.gridPos, tier) && spottedBy(gun.team, t.gridPos, units, structures)) best = { at: t.gridPos, rank, d };
  }
  if (best) return best.at;
  let near: { at: GridPos; d: number } | null = null;
  for (const s of structures) {
    if (s.team === gun.team || s.health <= 0) continue;
    const d = tiles(gun.gridPos, s.gridPos);
    if ((!near || d < near.d) && inArtilleryReach(gun.gridPos, s.gridPos, tier) && spottedBy(gun.team, s.gridPos, units, structures)) near = { at: s.gridPos, d };
  }
  return near?.at ?? null;
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
  // Enemy force fields (sim/forcefield.ts): a shell from outside coming down inside one is
  // absorbed, and a burst outside one doesn't reach in.
  fields: readonly ForceField[] = [],
): { landed: ArtilleryShell[]; flying: ArtilleryShell[]; absorbed: ArtilleryShell[]; unitDamage: Map<string, number>; structureDamage: Map<string, number> } {
  const absorbed: ArtilleryShell[] = [];
  const landed: ArtilleryShell[] = [];
  const flying: ArtilleryShell[] = [];
  const unitDamage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const add = (map: Map<string, number>, id: string, n: number) => map.set(id, (map.get(id) || 0) + n);
  for (const shell of shells) {
    if (shell.landsAt > now) { flying.push(shell); continue; }
    if (impactAbsorbed(fields, shell.team, shell.at, shell.from)) { absorbed.push(shell); continue; }
    landed.push(shell);
    for (const u of units) {
      if (u.team === shell.team || u.health <= 0) continue;
      const armor = UNIT_RULES[u.type].armor;
      const d = tiles(u.gridPos, shell.at);
      if (armor === 'air' || d > ARTILLERY.splash || shotBlocked(fields, shell.team, shell.at, u.gridPos)) continue;
      add(unitDamage, u.id, shellDamage(armor, d) * (shell.power ?? 1) * damageTakenMultiplier(u));
    }
    for (const s of structures) {
      if (s.team === shell.team || s.health <= 0) continue;
      const d = tiles(s.gridPos, shell.at);
      if (d <= ARTILLERY.splash && !shotBlocked(fields, shell.team, shell.at, s.gridPos)) add(structureDamage, s.id, shellDamage('structure', d) * (shell.power ?? 1));
    }
  }
  return { landed, flying, absorbed, unitDamage, structureDamage };
}

// Damage one shell does to a city building: a share of a Bombardment Drone drop.
export const shellBuildingDamage = (b: BuildingData) => Math.ceil(dropDamage(b) * ARTILLERY.buildingShare);

// Landed shells knock down the city buildings in their splash, as Bombardment Drone drops do, only
// slower. A side's own captured buildings are spared, as its troops are.
export function shellBuildings(buildings: readonly BuildingData[], landed: readonly Pick<ArtilleryShell, 'team' | 'at'>[]): BuildingData[] {
  if (landed.length === 0) return buildings as BuildingData[];
  let changed = false;
  const next = buildings.map(b => {
    if (b.destroyed || isIndestructible(b)) return b;
    const hits = landed.filter(s => b.owner !== s.team && tiles({ x: b.gridX, z: b.gridZ }, s.at) <= ARTILLERY.splash).length;
    if (hits === 0) return b;
    changed = true;
    const health = (b.health ?? b.maxHealth) - hits * shellBuildingDamage(b);
    if (health <= 0) return { ...b, health: 0, destroyed: true, owner: null, capturingTeam: null, captureProgress: 0 };
    return { ...b, health };
  });
  return changed ? next : (buildings as BuildingData[]);
}
