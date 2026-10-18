// Who hurts whom each game tick: weapons fire (units, HQs, turrets), blasts, Crawler drones,
// Bombardment Drone strikes and HE clouds.
//
// Each function only reads the state it is given and reports damage; the caller applies it,
// so the same code can run on a server. Weapons, armor and damage types are in sim/units.ts.

import { ForceField, shotBlocked } from './forcefield';
import { ABILITY_CONFIG } from '../constants';
import { dropDamage } from './bombard';
import type { BuildingData, CloudData, StructureType, UnitData } from '../types';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { damageMultiplier, damageTakenMultiplier, fireRateMultiplier, hasBuff, isEmpDisabled, rangeBonus } from './unitAbilities';
import { ArmorClass, canHit, DamageType, shotDamage, STRUCTURE_RULES, UNIT_RULES, Weapon } from './units';

export type DamageMap = Map<string, number>;

const addDamage = (map: DamageMap, id: string, amount: number) => map.set(id, (map.get(id) || 0) + amount);

export interface Blast {
  position: { x: number; y: number; z: number };
  radius: number; // World units
  damage: number;
  team: UnitData['team'];
}

// Damage to every enemy unit inside a blast, falling off linearly from full at the center
// to nothing at the edge. Cloaked Ghosts are untouchable by shots but not by Crawler blasts.
// A blast outside an enemy force field doesn't reach anyone inside it (sim/forcefield.ts).
export function blastDamage(
  units: readonly UnitData[],
  blasts: readonly Blast[],
  tileSize: number,
  offset: number,
  { hitsCloaked }: { hitsCloaked: boolean },
  fields: readonly ForceField[] = [],
): DamageMap {
  const damage: DamageMap = new Map();
  for (const u of units) {
    if (!hitsCloaked && (u.health <= 0 || u.decoyActive)) continue;
    const ux = (u.gridPos.x * tileSize) - offset;
    const uz = (u.gridPos.z * tileSize) - offset;
    for (const b of blasts) {
      if (u.team === b.team) continue;
      const radius = b.radius || tileSize * 1.5;
      const dist = Math.hypot(b.position.x - ux, b.position.z - uz);
      if (dist > radius) continue;
      if (fields.length > 0 && shotBlocked(fields, b.team, { x: (b.position.x + offset) / tileSize, z: (b.position.z + offset) / tileSize }, u.gridPos)) continue;
      addDamage(damage, u.id, b.damage * (1 - dist / radius));
    }
  }
  return damage;
}

// Crawler Drones detonate when an enemy comes within 1.5 tiles.
export function crawlerDetonations(units: readonly UnitData[], tileSize: number, offset: number): { crawlerId: string; blast: Blast }[] {
  const detonations: { crawlerId: string; blast: Blast }[] = [];
  for (const u of units) {
    if (u.type !== 'crawler_drone' || u.health <= 0) continue;
    const enemyClose = units.some(e =>
      e.team !== u.team && e.team !== 'neutral' && e.health > 0 &&
      Math.hypot(u.gridPos.x - e.gridPos.x, u.gridPos.z - e.gridPos.z) < 1.5);
    if (!enemyClose) continue;
    detonations.push({
      crawlerId: u.id,
      blast: {
        position: { x: (u.gridPos.x * tileSize) - offset, y: 1, z: (u.gridPos.z * tileSize) - offset },
        radius: ABILITY_CONFIG.CRAWLER_EXPLOSION_RADIUS * tileSize,
        damage: ABILITY_CONFIG.CRAWLER_EXPLOSION_DAMAGE,
        team: u.team,
      },
    });
  }
  return detonations;
}

// --- Weapons fire ---

export interface CombatStructure {
  id: string;
  type: StructureType;
  team: 'blue' | 'red';
  gridPos: GridPos;
  health: number;
  isBlueprint: boolean;
  buildRemainingMs?: number;
  lastAttackTime?: number;
  combatTargetId?: string | null;
}

export interface Shot {
  attackerId: string;
  targetId: string;
  from: GridPos;
  to: GridPos;
  type: DamageType;
  // The target is an aircraft, so the shot is drawn upward.
  toAir: boolean;
  fromAir: boolean;
}

export interface AttackResult {
  unitDamage: DamageMap;
  structureDamage: DamageMap;
  // Damage to enemy force fields' shields, by generator id.
  shieldDamage: DamageMap;
  // Everyone who fired this tick, and at what.
  fired: Map<string, string>;
  // Every armed unit's current target in range, or null. Attack-move holds while it has one.
  aiming: Map<string, string | null>;
  shots: Shot[];
}

// A shot stopped by a force field: which generator's dome, and where it hits.
export type ShieldBlock = { fieldId: string; at: GridPos };
// Added to a target's score when it is behind an enemy dome, so it is picked only as a last resort.
const SHIELDED_PENALTY = 1000;

type Target = { id: string; gridPos: GridPos; armor: ArmorClass; isAir: boolean; structure: boolean };

const hostile = (a: UnitData['team'], b: UnitData['team']) => a !== b;
const tiles = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);

// One tick of weapons fire for every armed unit, the HQs and finished Sentry Turrets.
//
// Each picks a target its weapon can reach: it keeps its last target while that stays valid,
// otherwise the nearest enemy unit, and only shoots buildings when no unit is in range.
// Cloaked Ghosts and anything inside a nano cloud can neither shoot nor be shot.
// Neutral Sentinels are hostile to both teams and both teams to them.
// `shieldOf` says whether a shot by a team between two tiles is stopped by an enemy force field
// (sim/forcefield.ts), and where. Guns prefer targets in the open; a shot at one behind a dome
// hits the dome instead (shieldDamage), and splash never reaches in.
export function resolveAttacks(
  units: readonly UnitData[],
  structures: readonly CombatStructure[],
  now: number,
  inNanoCloud: (pos: GridPos) => boolean,
  shieldOf: (team: UnitData['team'], from: GridPos, to: GridPos) => ShieldBlock | null = () => null,
): AttackResult {
  const result: AttackResult = { unitDamage: new Map(), structureDamage: new Map(), shieldDamage: new Map(), fired: new Map(), aiming: new Map(), shots: [] };
  const blocked = (team: UnitData['team'], from: GridPos, to: GridPos) => shieldOf(team, from, to) !== null;

  const unitTargets = units.filter(u => u.health > 0 && !isHidden(u) && !inNanoCloud(u.gridPos));
  const structureTargets = structures.filter(s => s.health > 0);

  const pick = (team: UnitData['team'], at: GridPos, weapon: Weapon, current: string | null | undefined): Target | null => {
    let best: Target | null = null;
    let bestDist = Infinity;
    for (const t of unitTargets) {
      if (!hostile(team, t.team)) continue;
      const armor = UNIT_RULES[t.type].armor;
      const isAir = armor === 'air';
      if (!canHit(weapon, isAir)) continue;
      const d = tiles(at, t.gridPos);
      if (d > weapon.range) continue;
      // Stick with the current target rather than flicking between equals; anything behind an
      // enemy force field only when there is nothing in the open.
      const score = (t.id === current ? -1 : d) + (blocked(team, at, t.gridPos) ? SHIELDED_PENALTY : 0);
      if (score < bestDist) {
        bestDist = score;
        best = { id: t.id, gridPos: t.gridPos, armor, isAir, structure: false };
      }
    }
    if (best || !weapon.hitsGround || team === 'neutral') return best;
    for (const s of structureTargets) {
      if (!hostile(team, s.team)) continue;
      const d = tiles(at, s.gridPos);
      if (d > weapon.range) continue;
      const score = (s.id === current ? -1 : d) + (blocked(team, at, s.gridPos) ? SHIELDED_PENALTY : 0);
      if (score < bestDist) {
        bestDist = score;
        best = { id: s.id, gridPos: s.gridPos, armor: 'structure', isAir: false, structure: true };
      }
    }
    return best;
  };

  // Nano-Weave and the like reduce what a unit takes.
  const takenBy = new Map(unitTargets.map(t => [t.id, damageTakenMultiplier(t)]));
  const hitUnit = (id: string, damage: number) => addDamage(result.unitDamage, id, damage * (takenBy.get(id) ?? 1));

  const fire = (attackerId: string, team: UnitData['team'], from: GridPos, fromAir: boolean, weapon: Weapon, target: Target) => {
    // Stopped by an enemy force field: the dome takes the hit.
    const shield = shieldOf(team, from, target.gridPos);
    if (shield) {
      addDamage(result.shieldDamage, shield.fieldId, shotDamage(weapon, 'structure'));
      result.fired.set(attackerId, target.id);
      result.shots.push({ attackerId, targetId: target.id, from, to: shield.at, type: weapon.type, toAir: false, fromAir });
      return;
    }
    const damage = shotDamage(weapon, target.armor);
    if (target.structure) addDamage(result.structureDamage, target.id, damage);
    else hitUnit(target.id, damage);
    if (weapon.splash) {
      // Splash stays on the target's own layer: shells burst on the ground, flak in the air.
      for (const t of unitTargets) {
        if (t.id === target.id || !hostile(team, t.team)) continue;
        const armor = UNIT_RULES[t.type].armor;
        if ((armor === 'air') !== target.isAir || tiles(t.gridPos, target.gridPos) > weapon.splash || blocked(team, from, t.gridPos)) continue;
        hitUnit(t.id, shotDamage(weapon, armor) * (weapon.splashFactor ?? 0.5));
      }
    }
    result.fired.set(attackerId, target.id);
    result.shots.push({ attackerId, targetId: target.id, from, to: target.gridPos, type: weapon.type, toAir: target.isAir, fromAir });
  };

  for (const u of units) {
    const base = UNIT_RULES[u.type].weapon;
    if (!base || base.indirect || base.ciws || u.health <= 0 || u.decoyActive || u.isStunned || isEmpDisabled(u) || inNanoCloud(u.gridPos)) continue;
    // Ability buffs (sim/unitAbilities.ts): range, damage and, for Flak Barrage, air splash.
    const weapon: Weapon = u.buffs?.length ? {
      ...base,
      range: base.range + rangeBonus(u),
      damage: base.damage * damageMultiplier(u),
      ...(hasBuff(u, 'barrage') ? { splash: 1.5, splashFactor: 0.5 } : {}),
    } : base;
    const target = pick(u.team, u.gridPos, weapon, u.combatTargetId);
    result.aiming.set(u.id, target ? target.id : null);
    if (!target || now - (u.lastAttackTime || 0) < weapon.cooldownMs / fireRateMultiplier(u)) continue;
    fire(u.id, u.team, u.gridPos, UNIT_RULES[u.type].armor === 'air', weapon, target);
  }

  for (const s of structures) {
    const weapon = STRUCTURE_RULES[s.type].weapon;
    if (!weapon || weapon.ciws || s.health <= 0 || s.isBlueprint || (s.buildRemainingMs || 0) > 0) continue;
    const target = pick(s.team, s.gridPos, weapon, s.combatTargetId);
    result.aiming.set(s.id, target ? target.id : null);
    if (!target || now - (s.lastAttackTime || 0) < weapon.cooldownMs) continue;
    fire(s.id, s.team, s.gridPos, false, weapon, target);
  }
  return result;
}

// Applies a tick of weapons fire to structures: damage taken, plus the HQ and turrets'
// own firing state. Destroyed structures are removed, except an HQ, which stays at zero
// health so the match can see it fell.
export function applyStructureCombat<S extends { id: string; type: StructureType; health: number; lastAttackTime?: number; combatTargetId?: string | null }>(
  structures: S[],
  attack: Pick<AttackResult, 'structureDamage' | 'fired' | 'aiming'>,
  now: number,
): S[] {
  let changed = false;
  const next: S[] = [];
  for (const s of structures) {
    let after = s;
    const damage = attack.structureDamage.get(s.id) || 0;
    if (damage > 0) after = { ...after, health: Math.max(0, after.health - damage) };
    if (attack.fired.has(s.id)) after = { ...after, lastAttackTime: now };
    if (attack.aiming.has(s.id) && (s.combatTargetId ?? null) !== attack.aiming.get(s.id)) {
      after = { ...after, combatTargetId: attack.aiming.get(s.id) ?? null };
    }
    if (after !== s) changed = true;
    if (after.health <= 0 && after.type !== 'hq') {
      changed = true;
      continue;
    }
    next.push(after);
  }
  return changed ? next : structures;
}

// Square blast, BOMBARD_RADIUS tiles each way (2 covers a 5x5 patch).
const inBombardBlast = (x: number, z: number, origin: GridPos) =>
  Math.max(Math.abs(x - origin.x), Math.abs(z - origin.z)) <= ABILITY_CONFIG.BOMBARD_RADIUS;

export function bombardBuildings(buildings: readonly BuildingData[], strikes: readonly GridPos[]): BuildingData[] {
  if (strikes.length === 0) return buildings as BuildingData[];
  let changed = false;
  const next = buildings.map(b => {
    if (b.destroyed) return b;
    const hits = strikes.filter(origin => inBombardBlast(b.gridX, b.gridZ, origin)).length;
    if (hits === 0) return b;
    changed = true;
    // Each drop takes a fixed share of the building's health (sim/bombard.ts).
    const health = (b.health ?? b.maxHealth) - hits * dropDamage(b);
    if (health <= 0) return { ...b, health: 0, destroyed: true, owner: null, capturingTeam: null, captureProgress: 0 };
    return { ...b, health };
  });
  return changed ? next : (buildings as BuildingData[]);
}

// Units caught under a strike take flat damage, friend or foe. The drone itself is spared, and
// an enemy force field keeps the blast out (sim/forcefield.ts).
export function bombardUnitDamage(units: readonly UnitData[], strikes: readonly { droneId: string; at: GridPos; team?: UnitData['team'] }[], fields: readonly ForceField[] = []): DamageMap {
  const damage: DamageMap = new Map();
  for (const u of units) {
    if (u.health <= 0 || strikes.some(s => s.droneId === u.id)) continue;
    for (const s of strikes) {
      if (s.team && shotBlocked(fields, s.team, s.at, u.gridPos)) continue;
      if (inBombardBlast(u.gridPos.x, u.gridPos.z, s.at)) addDamage(damage, u.id, ABILITY_CONFIG.BOMBARD_UNIT_DAMAGE);
    }
  }
  return damage;
}

// HE clouds burn infantry and light air units standing in them, every tick.
export function heCloudDamage(units: readonly UnitData[], clouds: readonly CloudData[]): DamageMap {
  const damage: DamageMap = new Map();
  for (const cloud of clouds) {
    if (cloud.type !== 'he') continue;
    for (const u of units) {
      const soft = u.unitClass === 'infantry' || u.unitClass === 'air' || u.type === 'drone' || u.type === 'helios';
      if (soft && Math.hypot(u.gridPos.x - cloud.gridPos.x, u.gridPos.z - cloud.gridPos.z) <= cloud.radius) {
        addDamage(damage, u.id, ABILITY_CONFIG.HE_DAMAGE_PER_TICK);
      }
    }
  }
  return damage;
}

// Apply one or more damage maps. Health never goes below zero. Untouched units keep their identity.
export function applyDamage(units: UnitData[], ...maps: DamageMap[]): UnitData[] {
  let changed = false;
  const next = units.map(u => {
    let total = 0;
    for (const m of maps) total += m.get(u.id) || 0;
    if (total <= 0) return u;
    changed = true;
    return { ...u, health: Math.max(0, u.health - total) };
  });
  return changed ? next : units;
}
