// Moving, training and building, as validated commands.
//
// orderEffects checks a MOVE, TRAIN_UNIT or PLACE_STRUCTURE command for the sending team and
// returns what it does, or a reason it was refused. The player's clicks and the AI both go
// through here, so the computer opponent plays by exactly the same rules.
//
// Also here: the per-team numbers those rules need (population, tech tier, nodes held).

import { ABILITY_CONFIG, BUILDING_VALUES, STRUCTURE_INFO } from '../constants';
import type { BuildingData, StructureData, StructureType, UnitData } from '../types';
import type { GridPos, PlayerCommand, Team } from './commands';
import { Economy, research, researchCost, spend, structureCost, unitCost } from './economy';
import { Blackout, isBlackedOut, isInsideEnergyGrid } from './energy';
import { isAirType, popCap, popUsed, STRUCTURE_RULES, Tier, UNIT_RULES } from './units';

export { popUsed };

export const MAX_QUEUE = 5;
const MASON_BUILT: readonly StructureType[] = ['wall_tier1', 'wall_tier2', 'defense'];

// --- Team numbers ---

const held = (buildings: readonly BuildingData[], team: Team, type: BuildingData['type']) =>
  buildings.filter(b => b.type === type && b.owner === team && !b.destroyed).length;
export const coreNodesHeld = (buildings: readonly BuildingData[], team: Team) => held(buildings, team, 'core_node');
export const serverNodesHeld = (buildings: readonly BuildingData[], team: Team) => held(buildings, team, 'server_node');
export const teamTier = (economy: Economy, team: Team): Tier => economy[team].tier;
export const teamPopCap = (buildings: readonly BuildingData[], team: Team) => popCap(coreNodesHeld(buildings, team));

// A structure that has finished going up and still stands.
export const isOperational = (s: StructureData) => !s.isBlueprint && !((s.buildRemainingMs || 0) > 0) && s.health > 0;

// --- Commands ---

export type OrderCommand = Extract<PlayerCommand, { type: 'MOVE' | 'TRAIN_UNIT' | 'PLACE_STRUCTURE' | 'SET_RALLY' | 'RESEARCH_TIER' }>;
export const isOrderCommand = (c: PlayerCommand): c is OrderCommand =>
  c.type === 'MOVE' || c.type === 'TRAIN_UNIT' || c.type === 'PLACE_STRUCTURE' || c.type === 'SET_RALLY' || c.type === 'RESEARCH_TIER';

export interface OrdersView {
  units: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
  economy: Economy;
  // Live EMP blackouts: no building where your grid is down.
  blackouts?: readonly Blackout[];
}

export interface OrdersContext {
  gridSize: number;
  bases: Record<Team, GridPos>;
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
    case 'MOVE': return moveOrder(view, team, command.unitIds, command.target, !!command.attackMove, ctx);
    case 'TRAIN_UNIT': return trainOrder(view, team, command.structureId, command.unitType);
    case 'PLACE_STRUCTURE': return placeOrder(view, team, command.structureType, command.at, ctx);
    case 'SET_RALLY': return rallyOrder(view, team, command.structureId, command.at, ctx);
    case 'RESEARCH_TIER': return researchOrder(view, team, command.tier);
  }
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
  const cap = teamPopCap(view.buildings, team);
  if (popUsed(view.units, view.structures, team) + rules.pop > cap) return reject(`population cap reached (${cap}); hold more core nodes`);
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
  const movers = view.units.filter(u => ids.has(u.id) && u.team === team && u.health > 0 && !(u.type === 'sun_plate' && u.isDeployed));
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

  const unitUpdates = new Map<string, (u: UnitData) => UnitData>();
  for (const u of movers) {
    if (u.type === 'bombard') {
      const there = u.gridPos.x === target.x && u.gridPos.z === target.z;
      const path = there ? [] : ctx.findAirPath(u.gridPos, target);
      if (there || path.length > 0) unitUpdates.set(u.id, x => ({ ...x, path, bombardmentTarget: null, attackMove }));
      continue;
    }
    let dest = findFreeTile(target.x, target.z);
    // A drone on a Banshee hardline can't be sent beyond its leash.
    const host = view.units.find(src => src.tetherTargetId === u.id);
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
