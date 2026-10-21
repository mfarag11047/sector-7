// Moving, training and building, as validated commands.
//
// orderEffects checks a MOVE, TRAIN_UNIT, PLACE_STRUCTURE or BUILD_BASE command for the sending team and
// returns what it does, or a reason it was refused. The player's clicks and the AI both go
// through here, so the computer opponent plays by exactly the same rules.
//
// Also here: the per-team numbers those rules need (population, tech tier, nodes held).

import { ABILITY_CONFIG, BUILDING_VALUES, STRUCTURE_INFO } from '../constants';
import type { BuildingData, StructureData, StructureType, UnitData } from '../types';
import type { GridPos, PlayerCommand, Team, Warhead } from './commands';
import { Economy, research, researchCost, spend, spendCompute, structureCost, unitCost, warheadBuildTime, warheadCost } from './economy';
import { Blackout, gridTiles, isBlackedOut, isInsideEnergyGrid } from './energy';
import { baseOrder } from './bases';
import { researchBlocker, upgradeDef, type UpgradeId } from './upgrades';
import { REFINERY, refineriesOf, refineryLimit, upgradeBlocker } from './refinery';
import { BUILDING_PADS, freePadsFor, isPad, padKindOf, TURRET_PADS } from './baseLayout';
import { isAirType, popCap, popUsed, STRUCTURE_RULES, Tier, UNIT_RULES } from './units';
import { tetheredIds, unjammedIds } from './jamming';

export { popUsed };

export const MAX_QUEUE = 5;
const MASON_BUILT: readonly StructureType[] = ['wall_tier1', 'wall_tier2', 'defense', 'aa_turret'];
// Base buildings and turrets only go on the pads around one of the side's Command HQs (its
// starting HQ or one it has built): six for buildings, four turret corners (sim/baseLayout.ts).
// Walls can go anywhere on the grid.

// --- Team numbers ---

const held = (buildings: readonly BuildingData[], team: Team, type: BuildingData['type']) =>
  buildings.filter(b => b.type === type && b.owner === team && !b.destroyed).length;
export const coreNodesHeld = (buildings: readonly BuildingData[], team: Team) => held(buildings, team, 'core_node');
export const serverNodesHeld = (buildings: readonly BuildingData[], team: Team) => held(buildings, team, 'server_node');
export const teamTier = (economy: Economy, team: Team): Tier => economy[team].tier;
export const teamPopCap = (buildings: readonly BuildingData[], team: Team) => popCap(coreNodesHeld(buildings, team), gridTiles(buildings, team));

// A structure that has finished going up and still stands.
export const isOperational = (s: StructureData) => !s.isBlueprint && !((s.buildRemainingMs || 0) > 0) && s.health > 0;

// --- Commands ---

export type OrderCommand = Extract<PlayerCommand, { type: 'MOVE' | 'TRAIN_UNIT' | 'PLACE_STRUCTURE' | 'SET_RALLY' | 'RESEARCH_TIER' | 'BUILD_BASE' | 'BUILD_WARHEAD' | 'RESEARCH_UPGRADE' | 'UPGRADE_REFINERY' }>;
export const isOrderCommand = (c: PlayerCommand): c is OrderCommand =>
  c.type === 'MOVE' || c.type === 'TRAIN_UNIT' || c.type === 'PLACE_STRUCTURE' || c.type === 'SET_RALLY' || c.type === 'RESEARCH_TIER' || c.type === 'BUILD_BASE' || c.type === 'BUILD_WARHEAD' || c.type === 'RESEARCH_UPGRADE' || c.type === 'UPGRADE_REFINERY';

export interface OrdersView {
  units: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
  economy: Economy;
  // Live EMP blackouts: no building where your grid is down.
  blackouts?: readonly Blackout[];
  // Sandbox play-testing: no population cap.
  unlimitedPop?: boolean;
}

export interface OrdersContext {
  gridSize: number;
  // Each side's command bases: its starting HQ and any it has built.
  bases: Record<Team, GridPos | readonly GridPos[]>;
  isWalkable: (x: number, z: number) => boolean;
  findPath: (from: GridPos, to: GridPos) => string[];
  findAirPath: (from: GridPos, to: GridPos) => string[];
  // The tile is free to build on (not a road junction, building, structure or base pad).
  canBuildOn: (x: number, z: number) => boolean;
  newId: (prefix: string) => string;
}

export interface OrderEffects {
  unitUpdates: Map<string, (u: UnitData) => UnitData>;
  structureUpdates: Map<string, (s: StructureData) => StructureData>;
  newStructures: StructureData[];
  economy?: (e: Economy) => Economy | null;
}

export type OrderOutcome = { ok: true; effects: OrderEffects } | { ok: false; reason: string };

const reject = (reason: string): OrderOutcome => ({ ok: false, reason });
const effects = (partial: Partial<OrderEffects>): OrderOutcome => ({
  ok: true,
  effects: { unitUpdates: new Map(), structureUpdates: new Map(), newStructures: [], ...partial },
});

export function orderEffects(view: OrdersView, team: Team, command: OrderCommand, ctx: OrdersContext): OrderOutcome {
  switch (command.type) {
    case 'MOVE': {
      // Jammed units don't hear the order (sim/jamming.ts); the rest of the group still goes.
      const reachable = unjammedIds(view.units, command.unitIds);
      if ('reason' in reachable) return reject(reachable.reason);
      return moveOrder(view, team, reachable.ids, command.target, !!command.attackMove, ctx);
    }
    case 'TRAIN_UNIT': return trainOrder(view, team, command.structureId, command.unitType);
    case 'PLACE_STRUCTURE': return placeOrder(view, team, command.structureType, command.at, ctx);
    case 'SET_RALLY': return rallyOrder(view, team, command.structureId, command.at, ctx);
    case 'RESEARCH_TIER': return researchOrder(view, team, command.tier);
    case 'BUILD_WARHEAD': return warheadOrder(view, team, command.structureId, command.warhead);
    case 'RESEARCH_UPGRADE': return upgradeOrder(view, team, command.structureId, command.upgrade);
    case 'UPGRADE_REFINERY': return refineryUpgradeOrder(view, team, command.structureId);
    case 'BUILD_BASE': {
      const outcome = baseOrder(view, team, command.at, ctx.newId);
      if ('reason' in outcome) return reject(outcome.reason);
      return effects({ economy: outcome.pay, newStructures: [outcome.structure] });
    }
  }
}

// An Ordnance Fab starts building one warhead for the stockpile.
function warheadOrder(view: OrdersView, team: Team, structureId: string, warhead: Warhead): OrderOutcome {
  const s = view.structures.find(x => x.id === structureId);
  if (!s || s.team !== team || s.type !== 'ordnance_fab') return reject('not your Ordnance Fab');
  if (!isOperational(s)) return reject('the Ordnance Fab is not finished');
  if (s.production?.active) return reject('already building a warhead');
  const cost = warheadCost(warhead);
  if (!spend(view.economy, team, cost)) return reject('not enough cores');
  const totalTime = warheadBuildTime(warhead);
  return effects({
    economy: e => spend(e, team, cost),
    structureUpdates: new Map([[s.id, x => ({ ...x, production: { active: true, item: warhead, progress: 0, totalTime } })]]),
  });
}

// An Advanced Research building starts researching a unit upgrade (sim/upgrades.ts).
function upgradeOrder(view: OrdersView, team: Team, structureId: string, upgrade: UpgradeId): OrderOutcome {
  const s = view.structures.find(x => x.id === structureId);
  if (!s || s.team !== team || s.type !== 'research_lab') return reject('not your Advanced Research');
  if (!isOperational(s)) return reject('Advanced Research is not finished');
  if (s.research) return reject(`already researching ${upgradeDef(s.research.upgrade)?.name ?? 'an upgrade'}`);
  const blocked = researchBlocker(view.economy, team, view.structures, upgrade);
  if (blocked) return reject(blocked);
  const def = upgradeDef(upgrade)!;
  if (!spend(view.economy, team, def.cost)) return reject(`needs ${def.cost} cores`);
  if (!spendCompute(view.economy, team, def.compute)) return reject(`needs ${def.compute} compute`);
  return effects({
    economy: e => { const paid = spend(e, team, def.cost); return paid && spendCompute(paid, team, def.compute); },
    structureUpdates: new Map([[s.id, x => ({ ...x, research: { upgrade, remainingMs: def.researchMs, totalMs: def.researchMs } })]]),
  });
}

// A Core Refinery starts its upgrade to level 2: more flat income from that one refinery.
function refineryUpgradeOrder(view: OrdersView, team: Team, structureId: string): OrderOutcome {
  const s = view.structures.find(x => x.id === structureId);
  const blocked = upgradeBlocker(s, team, view.economy[team].tier);
  if (blocked) return reject(blocked);
  if (!spend(view.economy, team, REFINERY.upgrade.cost)) return reject(`needs ${REFINERY.upgrade.cost} cores`);
  const totalMs = REFINERY.upgrade.ms;
  return effects({
    economy: e => spend(e, team, REFINERY.upgrade.cost),
    structureUpdates: new Map([[s!.id, x => ({ ...x, refineryUpgrade: { remainingMs: totalMs, totalMs } })]]),
  });
}

function researchOrder(view: OrdersView, team: Team, tier: 2 | 3): OrderOutcome {
  const e = view.economy[team];
  if (tier <= e.tier) return reject(`Tier ${tier} is already researched`);
  if (tier !== e.tier + 1) return reject(`research Tier ${e.tier + 1} first`);
  if (!view.structures.some(s => s.type === 'hq' && s.team === team && s.health > 0)) return reject('needs your HQ');
  if (!research(view.economy, team, tier)) return reject(`needs ${researchCost(tier)} compute`);
  return effects({ economy: econ => research(econ, team, tier) });
}

function rallyOrder(view: OrdersView, team: Team, structureId: string, at: GridPos, ctx: OrdersContext): OrderOutcome {
  const s = view.structures.find(x => x.id === structureId);
  if (!s || s.team !== team) return reject('not your structure');
  if (at.x < 0 || at.z < 0 || at.x >= ctx.gridSize || at.z >= ctx.gridSize) return reject('off the map');
  return effects({ structureUpdates: new Map([[s.id, x => ({ ...x, rallyPoint: { ...at } })]]) });
}

function trainOrder(view: OrdersView, team: Team, structureId: string, unitType: UnitData['type']): OrderOutcome {
  const s = view.structures.find(x => x.id === structureId);
  if (!s || s.team !== team) return reject('not your structure');
  if (!isOperational(s)) return reject(`${STRUCTURE_INFO[s.type].label} is not finished`);
  const rules = UNIT_RULES[unitType];
  if (rules.producer !== s.type) return reject(`${STRUCTURE_INFO[s.type].label} cannot train that`);
  const tier = teamTier(view.economy, team);
  if (rules.tier > tier) return reject(`needs Tier ${rules.tier}`);
  if ((s.queue?.length || 0) >= MAX_QUEUE) return reject('queue full');
  const cap = view.unlimitedPop ? Infinity : teamPopCap(view.buildings, team);
  if (popUsed(view.units, view.structures, team) + rules.pop > cap) return reject(`population cap reached (${cap}); spread your grid or hold more core nodes`);
  const cost = unitCost(unitType);
  if (!spend(view.economy, team, cost)) return reject('not enough cores');
  return effects({
    economy: e => spend(e, team, cost),
    structureUpdates: new Map([[s.id, x => ({
      ...x,
      queue: [...(x.queue || []), { unitType, remainingMs: rules.buildTimeMs, totalMs: rules.buildTimeMs }],
    })]]),
  });
}

function placeOrder(view: OrdersView, team: Team, type: StructureType, at: GridPos, ctx: OrdersContext): OrderOutcome {
  const masonBuilt = MASON_BUILT.includes(type);
  if (!STRUCTURE_RULES[type].buildable && !masonBuilt) return reject('cannot build that');
  if (masonBuilt && !view.structures.some(s => s.team === team && s.type === 'builder' && isOperational(s))) {
    return reject('needs a finished Depot');
  }
  if (view.blackouts && isBlackedOut(at, team, view.blackouts)) return reject('the grid is down there (EMP)');
  if (!ctx.canBuildOn(at.x, at.z)) return reject('cannot build there');
  // Holding ground is what lets you build forward: only inside your own energy grid.
  if (!isInsideEnergyGrid(at, team, view.buildings, ctx.bases.blue, ctx.bases.red)) return reject('must be inside your energy grid');
  const pads = freePadsFor(type, view.structures, team, ctx.gridSize);
  if (pads && !isPad(at, pads)) {
    if (pads.length > 0) return reject(padKindOf(type) === 'turret' ? 'turrets go on the corner pads of a Command HQ' : 'base buildings go on the pads around a Command HQ');
    return reject(padKindOf(type) === 'turret'
      ? `every turret corner is taken: ${TURRET_PADS} per Command HQ`
      : `every building pad is taken: ${BUILDING_PADS} per Command HQ. Build another Command HQ for more`);
  }
  // Core Refineries: REFINERY.perHq for each Command HQ (sim/refinery.ts).
  if (type === 'refinery' && refineriesOf(view.structures, team).length >= refineryLimit(view.structures, team)) {
    return reject(`at most ${REFINERY.perHq} Core Refineries per Command HQ: build another Command HQ for more`);
  }
  const cost = structureCost(type);
  if (!spend(view.economy, team, cost)) return reject('not enough cores');

  const info = STRUCTURE_INFO[type];
  const buildMs = STRUCTURE_RULES[type].buildTimeMs;
  const structure: StructureData = {
    id: ctx.newId('struct'), type, team, gridPos: { ...at },
    // Walls and turrets are blueprints that Masons haul materials to; base structures build themselves.
    isBlueprint: masonBuilt,
    constructionProgress: 0,
    maxProgress: info.maxProgress || 100,
    health: info.maxHealth,
    maxHealth: info.maxHealth,
    ...(masonBuilt ? {} : { buildRemainingMs: buildMs, buildTotalMs: buildMs }),
  };
  return effects({ economy: e => spend(e, team, cost), newStructures: [structure] });
}

// Spreads a group over free tiles around the target, nearest first, as the click handler did.
function moveOrder(view: OrdersView, team: Team, unitIds: readonly string[], target: GridPos, attackMove: boolean, ctx: OrdersContext): OrderOutcome {
  const ids = new Set(unitIds);
  const movers = view.units.filter(u => ids.has(u.id) && u.team === team && u.health > 0 && u.type !== 'cloak_generator' && u.type !== 'field_generator');
  if (movers.length === 0) return reject('no unit of yours can move');
  if (target.x < 0 || target.z < 0 || target.x >= ctx.gridSize || target.z >= ctx.gridSize) return reject('off the map');

  // Tiles other units stand on or are heading to.
  const occupied = new Set<string>();
  for (const u of view.units) {
    if (ids.has(u.id)) continue;
    occupied.add(u.path.length > 0 ? u.path[u.path.length - 1] : `${u.gridPos.x},${u.gridPos.z}`);
  }
  const reserved = new Set<string>();
  const findFreeTile = (cx: number, cz: number): GridPos | null => {
    const queue = [{ x: cx, z: cz }];
    const visited = new Set([`${cx},${cz}`]);
    for (let i = 0; i < queue.length && i < 300; i++) {
      const cur = queue[i];
      const k = `${cur.x},${cur.z}`;
      if (ctx.isWalkable(cur.x, cur.z) && !occupied.has(k) && !reserved.has(k)) return cur;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const n = { x: cur.x + dx, z: cur.z + dz };
        const nk = `${n.x},${n.z}`;
        if (visited.has(nk) || n.x < 0 || n.z < 0 || n.x >= ctx.gridSize || n.z >= ctx.gridSize) continue;
        visited.add(nk);
        queue.push(n);
      }
    }
    return null;
  };

  // A mixed group moves as an army: the fighters take the tiles at the target, and the support
  // units (anything without a gun of its own: Helios, Banshees, Battery Mules, scouts...) take the
  // ground behind them, on the side the army is coming from.
  const support = (u: UnitData) => !UNIT_RULES[u.type].weapon;
  const fighters = movers.filter(u => !support(u));
  let rear: GridPos | null = null;
  if (fighters.length > 0 && fighters.length < movers.length) {
    const from = {
      x: movers.reduce((s, u) => s + u.gridPos.x, 0) / movers.length,
      z: movers.reduce((s, u) => s + u.gridPos.z, 0) / movers.length,
    };
    const d = Math.hypot(target.x - from.x, target.z - from.z);
    if (d >= 1) {
      const depth = Math.ceil(Math.sqrt(fighters.length) / 2) + 2;
      rear = {
        x: Math.min(ctx.gridSize - 1, Math.max(0, Math.round(target.x - ((target.x - from.x) / d) * Math.min(depth, d)))),
        z: Math.min(ctx.gridSize - 1, Math.max(0, Math.round(target.z - ((target.z - from.z) / d) * Math.min(depth, d)))),
      };
    }
  }

  const unitUpdates = new Map<string, (u: UnitData) => UnitData>();
  for (const u of [...fighters, ...movers.filter(support)]) {
    if (u.type === 'bombard') {
      const there = u.gridPos.x === target.x && u.gridPos.z === target.z;
      const path = there ? [] : ctx.findAirPath(u.gridPos, target);
      if (there || path.length > 0) unitUpdates.set(u.id, x => ({ ...x, path, bombardmentTarget: null, bombardReturning: false, attackMove }));
      continue;
    }
    const spot = rear && support(u) ? rear : target;
    let dest = findFreeTile(spot.x, spot.z);
    // A drone on a Banshee hardline can't be sent beyond its leash.
    const host = view.units.find(src => tetheredIds(src).includes(u.id));
    if (dest && host) {
      const leash = Math.hypot(dest.x - host.gridPos.x, dest.z - host.gridPos.z);
      if (leash > ABILITY_CONFIG.BANSHEE_TETHER_RANGE) {
        const scale = ABILITY_CONFIG.BANSHEE_TETHER_RANGE / leash;
        dest = findFreeTile(
          Math.round(host.gridPos.x + (dest.x - host.gridPos.x) * scale),
          Math.round(host.gridPos.z + (dest.z - host.gridPos.z) * scale),
        );
      }
    }
    if (!dest) continue;
    reserved.add(`${dest.x},${dest.z}`);
    // Aircraft fly straight there; ground units take the quickest road.
    const path = isAirType(u.type) ? ctx.findAirPath(u.gridPos, dest) : ctx.findPath(u.gridPos, dest);
    // A planted Thunderhead packs up to move, dropping its fire mission.
    const packUp = (x: UnitData): UnitData => x.type === 'howitzer' && x.isDeployed ? { ...x, isDeployed: false, anchoredAt: undefined, artilleryTarget: null, artilleryAim: null } : x;
    if (path.length > 0) unitUpdates.set(u.id, x => ({ ...packUp(x), path, attackMove }));
    else if (attackMove !== !!u.attackMove) unitUpdates.set(u.id, x => ({ ...x, attackMove }));
  }
  return unitUpdates.size > 0 ? effects({ unitUpdates }) : reject('no route there');
}

// Applies an outcome's unit and structure changes.
export function applyOrderToUnits(units: UnitData[], fx: OrderEffects): UnitData[] {
  if (fx.unitUpdates.size === 0) return units;
  return units.map(u => fx.unitUpdates.get(u.id)?.(u) ?? u);
}
export function applyOrderToStructures(structures: StructureData[], fx: OrderEffects): StructureData[] {
  if (fx.structureUpdates.size === 0 && fx.newStructures.length === 0) return structures;
  const next = structures.map(s => fx.structureUpdates.get(s.id)?.(s) ?? s);
  return fx.newStructures.length > 0 ? [...next, ...fx.newStructures] : next;
}

// Core income a team earns per economy tick before any modifiers, for the HUD.
export const nodeIncome = (buildings: readonly BuildingData[], team: Team) => coreNodesHeld(buildings, team) * BUILDING_VALUES.core_node.income;
