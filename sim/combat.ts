// Who hurts whom each game tick: blasts, auto-attacks, Sentinel drones, Crawler drones,
// Bombardment Drone strikes and HE clouds.
//
// These rules were moved out of the main loop in CityMap.tsx unchanged, except where a
// comment says otherwise. Each function only reads the units it is given and reports
// damage; the caller applies it, so the same code can run on a server.

import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { BuildingData, CloudData, UnitData } from '../types';
import type { GridPos } from './commands';

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
export function blastDamage(
  units: readonly UnitData[],
  blasts: readonly Blast[],
  tileSize: number,
  offset: number,
  { hitsCloaked }: { hitsCloaked: boolean },
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
      if (dist <= radius) addDamage(damage, u.id, b.damage * (1 - dist / radius));
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

// Sentinel drones guard their server node: while a team is capturing it, the drone fires
// on that team's nearest unit in range. Infantry and armor shoot back.
export function sentinelFire(units: readonly UnitData[], buildings: readonly BuildingData[]) {
  const damage: DamageMap = new Map();
  const retaliation: DamageMap = new Map();
  const targets = new Map<string, string>();
  for (const drone of units) {
    if (drone.type !== 'defense_drone' || drone.health <= 0) continue;
    const building = buildings.find(b => b.gridX === drone.gridPos.x && b.gridZ === drone.gridPos.z);
    if (!building || building.captureProgress <= 0 || !building.capturingTeam) continue;
    const target = units.find(u =>
      u.team === building.capturingTeam && u.health > 0 && !u.decoyActive &&
      Math.abs(u.gridPos.x - drone.gridPos.x) <= ABILITY_CONFIG.DEFENSE_DRONE_RANGE &&
      Math.abs(u.gridPos.z - drone.gridPos.z) <= ABILITY_CONFIG.DEFENSE_DRONE_RANGE);
    if (!target) continue;
    addDamage(damage, target.id, ABILITY_CONFIG.DEFENSE_DRONE_DAMAGE);
    targets.set(drone.id, target.id);
    if (['tank', 'ghost', 'ballista'].includes(target.type) || target.unitClass === 'armor' || target.unitClass === 'infantry') {
      addDamage(retaliation, drone.id, ABILITY_CONFIG.UNIT_RETALIATION_DAMAGE);
    }
  }
  return { damage, retaliation, targets };
}

// Every armed unit fires at the nearest visible enemy within 2 tiles when off cooldown.
// Units inside a nano cloud can neither shoot nor be shot.
// Change from before: dead units no longer fire or draw fire in the tick they die.
export function autoAttacks(units: readonly UnitData[], now: number, inNanoCloud: (pos: GridPos) => boolean) {
  const damage: DamageMap = new Map();
  const fired = new Set<string>();
  for (const attacker of units) {
    const stats = UNIT_STATS[attacker.type];
    if (attacker.health <= 0 || !stats.attackDamage) continue;
    if (now - (attacker.lastAttackTime || 0) < (stats.attackCooldown || 1000)) continue;
    if (inNanoCloud(attacker.gridPos)) continue;
    let targetId: string | null = null;
    let nearest = Infinity;
    for (const enemy of units) {
      if (enemy.team === attacker.team || enemy.team === 'neutral' || enemy.decoyActive || enemy.health <= 0) continue;
      if (inNanoCloud(enemy.gridPos)) continue;
      const d = Math.hypot(attacker.gridPos.x - enemy.gridPos.x, attacker.gridPos.z - enemy.gridPos.z);
      if (d <= 2 && d < nearest) {
        nearest = d;
        targetId = enemy.id;
      }
    }
    if (!targetId) continue;
    addDamage(damage, targetId, stats.attackDamage);
    fired.add(attacker.id);
  }
  return { damage, fired };
}

// Bombardment Drones strike once they hover over their target square.
export const isBombardStrike = (u: UnitData) =>
  u.type === 'bombard' && u.health > 0 && !!u.bombardmentTarget && u.path.length === 0 &&
  u.gridPos.x === u.bombardmentTarget.x && u.gridPos.z === u.bombardmentTarget.z;

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
    const health = (b.health ?? b.maxHealth) - hits * ABILITY_CONFIG.BOMBARD_BUILDING_DAMAGE;
    if (health <= 0) return { ...b, health: 0, destroyed: true, owner: null, capturingTeam: null, captureProgress: 0 };
    return { ...b, health };
  });
  return changed ? next : (buildings as BuildingData[]);
}

// Units caught under a strike take flat damage, friend or foe. The drone itself is spared.
export function bombardUnitDamage(units: readonly UnitData[], strikes: readonly { droneId: string; at: GridPos }[]): DamageMap {
  const damage: DamageMap = new Map();
  for (const u of units) {
    if (u.health <= 0 || strikes.some(s => s.droneId === u.id)) continue;
    for (const s of strikes) {
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
