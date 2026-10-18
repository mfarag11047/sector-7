// Health is never regained for free. It comes back only from Guardians and from standing in
// your own base's city block (repairTick). Abilities that run on their own: Guardian repairs, couriers, surveillance flights,
// Banshee leashes, Field Fabricator production, the Swarm Host and its Crawlers,
// doctrine passives, and the timers behind stuns, cooldowns, smoke and APS.
//
// Moved out of CityMap.tsx unchanged except where a comment says otherwise. Anything that
// needs the map (pathfinding, walkable tiles) is passed in, so these stay pure.

import { ABILITY_CONFIG } from '../constants';
import type { DoctrineType, StructureData, UnitData } from '../types';
import type { GridPos, Warhead } from './commands';
import { productionStep } from './economy';

export type FindPath = (from: GridPos, to: GridPos) => string[];

// --- Guardian repair ---

// Each Guardian keeps up to GUARDIAN_REPAIR_SLOTS wounded allies in range on its beams,
// holding on to current patients and filling free beams with the worst hurt.
export function guardianRepair(units: readonly UnitData[], tickMs: number) {
  const assignments = new Map<string, string[]>();
  const heal = new Map<string, number>();
  const healPerTick = ABILITY_CONFIG.GUARDIAN_REPAIR_RATE * (tickMs / 1000);
  for (const guardian of units) {
    if (guardian.type !== 'guardian') continue;
    const previous = guardian.repairTargetIds || [];
    const wounded = (unit: UnitData) => unit.health > 0 && unit.health < unit.maxHealth && !unit.decoyActive;
    const distance = (unit: UnitData) => Math.hypot(unit.gridPos.x - guardian.gridPos.x, unit.gridPos.z - guardian.gridPos.z);
    const inRange = (unit: UnitData) => unit.team === guardian.team && unit.id !== guardian.id && wounded(unit)
      && distance(unit) <= ABILITY_CONFIG.GUARDIAN_REPAIR_RANGE;
    const kept = previous.filter(id => {
      const ally = units.find(unit => unit.id === id);
      return !!ally && inRange(ally);
    });
    const openSlots = ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS - kept.length;
    const newcomers = openSlots > 0
      ? units
          .filter(unit => inRange(unit) && !kept.includes(unit.id))
          .sort((a, b) => (a.health / a.maxHealth) - (b.health / b.maxHealth) || distance(a) - distance(b))
          .slice(0, openSlots)
          .map(unit => unit.id)
      : [];
    const ids = [...kept, ...newcomers];
    assignments.set(guardian.id, ids);
    for (const id of ids) heal.set(id, (heal.get(id) || 0) + healPerTick);
  }
  return { assignments, heal };
}

// --- Base repair ---

// Roads run every ROAD_STRIDE tiles, so each city block is the lot between two road lines.
const ROAD_STRIDE = 6;
export const BASE_REPAIR = {
  // Share of a unit's full health restored each second inside its base block.
  perSecond: 0.04,
  // Heavy Metal at Tier 2: armour repairs itself this many HP a second once it has neither
  // fired nor been hit for outOfCombatMs.
  heavyMetalSelfRepair: 5,
  outOfCombatMs: 5000,
  // The cleared pad around the HQ, which spills a tile past its block.
  padRadius: 3,
};

// Whether a tile is in the same city block as a base: inside the lot or on the roads around
// it, or on the HQ's own cleared pad.
export function inBaseBlock(pos: GridPos, base: GridPos): boolean {
  const lo = (c: number) => Math.floor(c / ROAD_STRIDE) * ROAD_STRIDE;
  const bx = lo(base.x), bz = lo(base.z);
  const inBlock = pos.x >= bx && pos.x <= bx + ROAD_STRIDE && pos.z >= bz && pos.z <= bz + ROAD_STRIDE;
  const onPad = Math.abs(pos.x - base.x) <= BASE_REPAIR.padRadius && Math.abs(pos.z - base.z) <= BASE_REPAIR.padRadius;
  return inBlock || onPad;
}

// All the healing in a tick: Guardian beams, plus repair for units in their own base's block.
// Heavy Metal's passive makes both repair armour half as fast again, and from Tier 2 its armour
// also repairs itself out of combat, the one exception to "no free healing".
export function repairTick(
  units: readonly UnitData[],
  tickMs: number,
  // Each side's command bases (one, or several once it has built more: sim/bases.ts).
  bases: Record<'blue' | 'red', GridPos | readonly GridPos[]>,
  doctrineOf: (team: UnitData['team']) => DoctrineType | null | undefined,
  tierOf: (team: 'blue' | 'red') => number = () => 1,
  now = 0,
) {
  const { assignments, heal } = guardianRepair(units, tickMs);
  const add = (id: string, n: number) => heal.set(id, (heal.get(id) || 0) + n);
  const heavyMetalArmour = (u: UnitData) => u.unitClass === 'armor' && doctrineOf(u.team) === 'heavy_metal';
  for (const u of units) {
    if (u.health <= 0 || u.health >= u.maxHealth || (u.team !== 'blue' && u.team !== 'red')) continue;
    const own = bases[u.team];
    if ((Array.isArray(own) ? own : [own as GridPos]).some(b => inBaseBlock(u.gridPos, b))) add(u.id, u.maxHealth * BASE_REPAIR.perSecond * (tickMs / 1000));
  }
  for (const [id, amount] of heal) {
    const u = units.find(x => x.id === id);
    if (u && heavyMetalArmour(u)) heal.set(id, amount * 1.5);
  }
  for (const u of units) {
    if (u.health <= 0 || u.health >= u.maxHealth || (u.team !== 'blue' && u.team !== 'red') || !heavyMetalArmour(u) || tierOf(u.team) < 2) continue;
    const quiet = now - Math.max(u.lastAttackTime ?? -Infinity, u.lastDamageTime ?? -Infinity) >= BASE_REPAIR.outOfCombatMs;
    if (quiet) add(u.id, BASE_REPAIR.heavyMetalSelfRepair * (tickMs / 1000));
  }
  return { assignments, heal };
}

// --- Per-unit steps. `u` is the unit as the tick started; `draft` is the caller's working
// copy, updated in place. Each returns whether it changed anything. ---

export interface Delivery { targetId: string; payload: Warhead }

// Ordnance Courier: run a warhead to its Ballista, then head back to the nearest Ordnance
// Fab and despawn. It also despawns if the Ballista is lost or there is no fab to go home to.
export function courierStep(
  u: UnitData,
  draft: UnitData,
  units: readonly UnitData[],
  structures: readonly StructureData[],
  findPath: FindPath,
): { changed: boolean; delivery?: Delivery } {
  if (u.type !== 'courier') return { changed: false };

  if (u.courierTargetId && u.courierPayload) {
    const target = units.find(t => t.id === u.courierTargetId);
    if (!target) {
      draft.health = 0;
      return { changed: true };
    }
    if (Math.hypot(u.gridPos.x - target.gridPos.x, u.gridPos.z - target.gridPos.z) < 1.5) {
      const delivery = { targetId: target.id, payload: u.courierPayload };
      draft.courierTargetId = undefined;
      draft.courierPayload = undefined;
      const fabs = structures.filter(s => s.type === 'ordnance_fab' && s.team === u.team);
      if (fabs.length > 0) {
        let nearestFab = fabs[0];
        let minD = Infinity;
        for (const f of fabs) {
          const d = Math.hypot(f.gridPos.x - u.gridPos.x, f.gridPos.z - u.gridPos.z);
          if (d < minD) { minD = d; nearestFab = f; }
        }
        draft.path = findPath(u.gridPos, nearestFab.gridPos);
      } else {
        draft.health = 0;
      }
      return { changed: true, delivery };
    }
    if (u.path.length === 0) {
      draft.path = findPath(u.gridPos, target.gridPos);
      return { changed: true };
    }
    return { changed: false };
  }

  // Home again with nothing to carry.
  if (!u.courierPayload && u.path.length === 0) {
    draft.health = 0;
    return { changed: true };
  }
  return { changed: false };
}

// Infiltrator Drone surveillance ends after SURVEILLANCE_DURATION and the drone flies home.
export function surveillanceStep(draft: UnitData, now: number, findPath: FindPath): boolean {
  const s = draft.surveillance;
  if (!s || s.status !== 'active' || !s.startTime || now - s.startTime <= ABILITY_CONFIG.SURVEILLANCE_DURATION) return false;
  const returnPath = findPath(draft.gridPos, s.returnPos);
  if (returnPath.length > 0) {
    draft.surveillance = { ...s, status: 'returning' };
    draft.path = returnPath;
  } else {
    draft.surveillance = undefined;
  }
  return true;
}

// A tethered drone follows its Banshee when the Banshee pulls out of tether range.
export function leashStep(u: UnitData, draft: UnitData, host: UnitData | undefined, findPath: FindPath): boolean {
  if (!host) return false;
  if (Math.hypot(u.gridPos.x - host.gridPos.x, u.gridPos.z - host.gridPos.z) <= ABILITY_CONFIG.BANSHEE_TETHER_RANGE) return false;
  const destKey = `${host.gridPos.x},${host.gridPos.z}`;
  const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;
  if (currentDest === destKey) return false;
  const followPath = findPath(u.gridPos, host.gridPos);
  if (followPath.length === 0) return false;
  draft.path = followPath;
  return true;
}

// Field Fabricator turns one onboard material charge into a missile.
export function fabricationStep(u: UnitData, draft: UnitData, doctrine: DoctrineType | null | undefined): boolean {
  if (u.type !== 'mule' || !u.fabrication?.active) return false;
  const progress = u.fabrication.progress + productionStep(doctrine);
  if (progress < u.fabrication.totalTime) {
    draft.fabrication = { ...u.fabrication, progress };
    return true;
  }
  const material = u.ordnanceMaterial || 0;
  if (material > 0) {
    const inv = { emp: u.missileInventory?.emp || 0, he: u.missileInventory?.he || 0 };
    inv[u.fabrication.item] += 1;
    draft.ordnanceMaterial = material - 1;
    draft.missileInventory = inv;
  }
  draft.fabrication = { ...u.fabrication, active: false, progress: 0 };
  return true;
}

// Ballista loading. Was a setTimeout outside the game, so it kept running through pauses
// and could arm a Ballista that had since been destroyed and rebuilt under the same id.
export function ballistaLoadStep(u: UnitData, draft: UnitData, tickMs: number): boolean {
  if (u.type !== 'ballista' || u.ammoState !== 'loading') return false;
  const progress = (u.loadingProgress || 0) + (tickMs / ABILITY_CONFIG.BALLISTA_LOAD_TIME) * 100;
  if (progress >= 100) {
    draft.ammoState = 'armed';
    draft.loadingProgress = 100;
  } else {
    draft.loadingProgress = progress;
  }
  return true;
}

// --- The once-a-second tick: Swarm Host, Crawlers, doctrine passives and timers ---

export interface SlowTickContext {
  findPath: FindPath;
  findScatteredSpawn: (center: GridPos) => GridPos;
  isWalkable: (x: number, z: number) => boolean;
  createCrawler: (host: UnitData, at: GridPos, suffix: string | number) => UnitData;
  doctrineOf: (team: UnitData['team']) => DoctrineType | null | undefined;
  now: number;
  random: () => number;
}

export const SLOW_TICK_MS = 1000;

export function slowTick(prevUnits: UnitData[], ctx: SlowTickContext): UnitData[] {
  let unitsChanged = false;
  const nextUnits = [...prevUnits];

  // Swarm Host: an anchored host tops its swarm up on an interval. Anchoring itself
  // releases the opening pair (see TOGGLE_ANCHOR in sim/abilities.ts).
  const hostMap = new Map<string, UnitData>();
  for (const host of nextUnits.filter(u => u.type === 'swarm_host')) {
    hostMap.set(host.id, host);
    if (!host.isAnchored) continue;
    const children = nextUnits.filter(u => u.type === 'crawler_drone' && u.parentId === host.id);
    const spawnReady = !host.cooldowns.spawnCrawler || host.cooldowns.spawnCrawler <= 0;
    if (children.length < ABILITY_CONFIG.SWARM_HOST_MAX_DRONES && spawnReady) {
      nextUnits.push(ctx.createCrawler(host, ctx.findScatteredSpawn(host.gridPos), children.length));
      const hIdx = nextUnits.findIndex(u => u.id === host.id);
      nextUnits[hIdx] = { ...nextUnits[hIdx], cooldowns: { ...nextUnits[hIdx].cooldowns, spawnCrawler: ABILITY_CONFIG.SWARM_HOST_SPAWN_INTERVAL } };
      unitsChanged = true;
    }
  }

  const surviving: UnitData[] = [];
  for (const u of nextUnits) {
    let unit = u;
    let keep = true;
    let changed = false;

    if (u.type === 'crawler_drone' && u.parentId) {
      const crawler = crawlerStep(u, hostMap.get(u.parentId), nextUnits, ctx);
      if (crawler === null) {
        keep = false;
        changed = true;
      } else if (crawler !== u) {
        unit = crawler;
        changed = true;
      }
    }

    const doctrine = ctx.doctrineOf(unit.team);

    // Shadow Ops: Ghosts and stealthed units move faster.
    if (doctrine === 'shadow_ops' && (unit.type === 'ghost' || unit.isStealthed) && !unit.activeBuffs?.includes('speed')) {
      unit = { ...unit, activeBuffs: [...(unit.activeBuffs || []), 'speed'] };
      changed = true;
    }

    if (unit.isStunned && unit.stunDuration) {
      unit = unit.stunDuration <= 0
        ? { ...unit, isStunned: false, stunDuration: 0 }
        : { ...unit, stunDuration: unit.stunDuration - SLOW_TICK_MS };
      changed = true;
    }

    // Cooldowns count down in milliseconds.
    if (unit.cooldowns) {
      const next = { ...unit.cooldowns };
      let counted = false;
      for (const k in next) {
        const key = k as keyof typeof next;
        if (typeof next[key] === 'number' && next[key]! > 0) {
          next[key] = Math.max(0, next[key]! - SLOW_TICK_MS);
          counted = true;
        }
      }
      if (counted) {
        unit = { ...unit, cooldowns: next };
        changed = true;
      }
    }

    // Titan smoke and APS run out. Before this nothing counted them down, so both stayed on
    // for the rest of the match once used.
    for (const effect of ['smoke', 'aps'] as const) {
      const state = unit[effect];
      if (!state?.active) continue;
      const remainingTime = state.remainingTime - SLOW_TICK_MS;
      unit = { ...unit, [effect]: remainingTime > 0 ? { active: true, remainingTime } : { active: false, remainingTime: 0 } };
      changed = true;
    }

    if (changed) unitsChanged = true;
    if (keep) surviving.push(unit);
  }
  return unitsChanged ? surviving : prevUnits;
}

// Crawler Drone behavior. Returns null when the crawler is gone (host destroyed, or
// folded back into a host that packed up), the same object when nothing changed.
function crawlerStep(u: UnitData, parent: UnitData | undefined, units: readonly UnitData[], ctx: SlowTickContext): UnitData | null {
  if (!parent) return null;
  const range = ABILITY_CONFIG.CRAWLER_RADIUS;

  // Recall: the host has packed up, so the swarm folds back inside.
  if (!parent.isAnchored) {
    if (Math.hypot(u.gridPos.x - parent.gridPos.x, u.gridPos.z - parent.gridPos.z) <= ABILITY_CONFIG.CRAWLER_RECALL_DISTANCE) return null;
    const targetKey = `${parent.gridPos.x},${parent.gridPos.z}`;
    const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;
    if (currentDest === targetKey) return u;
    return { ...u, path: ctx.findPath(u.gridPos, parent.gridPos), crawlerTargetId: null };
  }

  // Hunt: every crawler picks the enemy nearest the host, so the swarm converges on one.
  let target: UnitData | null = null;
  let bestDist = Infinity;
  for (const e of units) {
    if (e.team === u.team || e.team === 'neutral' || e.health <= 0 || e.isStealthed) continue;
    const d = Math.hypot(e.gridPos.x - parent.gridPos.x, e.gridPos.z - parent.gridPos.z);
    if (d <= range && d < bestDist) { bestDist = d; target = e; }
  }
  if (target) {
    const targetKey = `${target.gridPos.x},${target.gridPos.z}`;
    const currentDest = u.path.length > 0 ? u.path[u.path.length - 1] : null;
    if (currentDest !== targetKey) {
      const path = ctx.findPath(u.gridPos, target.gridPos);
      return path.length > 0 ? { ...u, path, crawlerTargetId: target.id } : u;
    }
    return u.crawlerTargetId !== target.id ? { ...u, crawlerTargetId: target.id } : u;
  }

  // Prey died or left the radius: drop the chase and go back to patrolling.
  if (u.crawlerTargetId) return { ...u, path: [], crawlerTargetId: null };

  // Patrol: wander to a random walkable spot inside the host's radius.
  if (u.path.length === 0) {
    for (let i = 0; i < 15; i++) {
      const angle = ctx.random() * Math.PI * 2;
      const d = range * (0.2 + ctx.random() * 0.8);
      const rx = Math.round(parent.gridPos.x + Math.cos(angle) * d);
      const rz = Math.round(parent.gridPos.z + Math.sin(angle) * d);
      if (!ctx.isWalkable(rx, rz)) continue;
      const path = ctx.findPath(u.gridPos, { x: rx, z: rz });
      return path.length > 0 ? { ...u, path } : u;
    }
  }
  return u;
}
