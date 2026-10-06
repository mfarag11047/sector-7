// Unit abilities a player orders: toggles, ordnance logistics, targeted strikes and links.
//
// Every ability arrives as a command from sim/commands.ts. abilityEffects checks it is
// legal for the sending team against a snapshot of the game, and either rejects it with a
// reason or returns what it does. The caller applies those effects to the live state.
// On a server, this is the gate that stops a player using the other team's units or an
// ability that is still cooling down.
//
// The rules were moved out of CityMap.tsx's click handlers. Changes are marked "Change:".

import { ABILITY_CONFIG, CITY_CONFIG } from '../constants';
import type { DecoyData, Projectile, StructureData, UnitData, UnitType } from '../types';
import type { GridPos, PlayerCommand, Team, Warhead } from './commands';
import { Economy, spend, takeWarhead, warheadCost } from './economy';

export type AbilityCommand = Extract<PlayerCommand, { type:
  | 'TOGGLE_DAMPENER' | 'TOGGLE_JAMMER' | 'TOGGLE_ANCHOR' | 'SMOKE_SCREEN' | 'ACTIVATE_APS' | 'PHANTOM_DECOY'
  | 'LOAD_AMMO' | 'TAKE_WARHEAD' | 'FABRICATE' | 'RESUPPLY_MATERIAL' | 'TRANSFER_WARHEAD'
  | 'CANNON_FIRE' | 'SURVEILLANCE' | 'FIRE_BALLISTA' | 'FIRE_SWARM' | 'BOMBARD'
  | 'HARDLINE_TETHER' | 'DISCONNECT_TETHER' | 'BATTERY_LINK' | 'DISCONNECT_BATTERY' }>;

const ABILITY_TYPES: ReadonlySet<string> = new Set<AbilityCommand['type']>([
  'TOGGLE_DAMPENER', 'TOGGLE_JAMMER', 'TOGGLE_ANCHOR', 'SMOKE_SCREEN', 'ACTIVATE_APS', 'PHANTOM_DECOY',
  'LOAD_AMMO', 'TAKE_WARHEAD', 'FABRICATE', 'RESUPPLY_MATERIAL', 'TRANSFER_WARHEAD',
  'CANNON_FIRE', 'SURVEILLANCE', 'FIRE_BALLISTA', 'FIRE_SWARM', 'BOMBARD',
  'HARDLINE_TETHER', 'DISCONNECT_TETHER', 'BATTERY_LINK', 'DISCONNECT_BATTERY',
]);
export const isAbilityCommand = (c: PlayerCommand): c is AbilityCommand => ABILITY_TYPES.has(c.type);

// What the game looks like when the command is checked.
export interface AbilityView {
  units: readonly UnitData[];
  structures: readonly StructureData[];
  economy: Economy;
}

export interface AbilityContext {
  now: number;
  offset: number;
  tileSize: number;
  isWalkable: (x: number, z: number) => boolean;
  findPath: (from: GridPos, to: GridPos) => string[];
  findAirPath: (from: GridPos, to: GridPos) => string[];
  findAdjacentSpawn: (center: GridPos) => GridPos;
  createCrawler: (host: UnitData, at: GridPos, suffix: string | number) => UnitData;
  random: () => number;
  // Unique ids for anything spawned. Ids from the clock collided when two shots shared a millisecond.
  newId: (prefix: string) => string;
}

export interface AbilityEffects {
  // Applied to the latest copy of each unit, so a tick that landed in between is kept.
  updates: Map<string, (u: UnitData) => UnitData>;
  spawnUnits: UnitData[];
  spawnDecoys: DecoyData[];
  // Ghosts whose Phantom Decoy projections should vanish.
  clearDecoysOf: string[];
  spawnProjectiles: Projectile[];
  // Cores or stockpiled warheads the order uses. Returns null if they are gone by the time it applies.
  economy?: (e: Economy) => Economy | null;
}

export type AbilityOutcome = { ok: true; effects: AbilityEffects } | { ok: false; reason: string };

const reject = (reason: string): AbilityOutcome => ({ ok: false, reason });
const effects = (partial: Partial<AbilityEffects>): AbilityOutcome => ({
  ok: true,
  effects: { updates: new Map(), spawnUnits: [], spawnDecoys: [], clearDecoysOf: [], spawnProjectiles: [], ...partial },
});

const TANKS: readonly UnitType[] = ['tank', 'titan_dropped'];
export const isTetherableDrone = (u: UnitData) => u.type === 'drone' || u.type === 'helios';
export const isBatteryLinkable = (u: UnitData) =>
  u.health > 0 && u.maxBattery > 0 && u.unitClass !== 'infantry' && u.type !== 'sun_plate' && u.type !== 'defense_drone' && u.type !== 'crawler_drone';

const distance = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
const world = (p: GridPos, y: number, ctx: AbilityContext) => ({ x: (p.x * ctx.tileSize) - ctx.offset, y, z: (p.z * ctx.tileSize) - ctx.offset });

const besideOrdnanceFab = (u: UnitData, structures: readonly StructureData[]) => structures.some(s =>
  s.type === 'ordnance_fab' && s.team === u.team && !s.isBlueprint && distance(s.gridPos, u.gridPos) < ABILITY_CONFIG.FABRICATOR_DOCK_RANGE);

// The sender's living unit of one of the given types, or a reason it can't act.
function ownUnit(view: AbilityView, team: Team, id: string, types: readonly UnitType[]): UnitData | string {
  const u = view.units.find(unit => unit.id === id);
  if (!u || u.health <= 0) return 'unit not found';
  if (u.team !== team) return 'not your unit';
  if (!types.includes(u.type)) return `${u.type} cannot do that`;
  return u;
}

export function abilityEffects(view: AbilityView, team: Team, command: AbilityCommand, ctx: AbilityContext): AbilityOutcome {
  switch (command.type) {
    // --- Toggles: act on every listed unit of the right type that the sender owns ---
    case 'TOGGLE_DAMPENER':
      return toggleEach(view, team, command.unitIds, ['ghost'], u => ({ ...u, isDampenerActive: !u.isDampenerActive }));
    case 'TOGGLE_JAMMER':
      return toggleEach(view, team, command.unitIds, ['banshee'], u => ({ ...u, jammerActive: !u.jammerActive }));
    case 'TOGGLE_ANCHOR':
      return toggleAnchor(view, team, command.unitIds, ctx);
    case 'SMOKE_SCREEN':
      return titanCountermeasure(view, team, command.unitIds, 'smoke');
    case 'ACTIVATE_APS':
      return titanCountermeasure(view, team, command.unitIds, 'aps');
    case 'PHANTOM_DECOY':
      return phantomDecoy(view, team, command.unitId, ctx);

    // --- Ordnance logistics ---
    case 'LOAD_AMMO': {
      const u = ownUnit(view, team, command.unitId, ['ballista']);
      if (typeof u === 'string') return reject(u);
      if ((u.missileInventory?.[command.warhead] || 0) <= 0) return reject(`no ${command.warhead} missile on board`);
      // Change: loading again used to throw away the missile already loaded or armed.
      if (u.ammoState === 'loading' || u.ammoState === 'armed') return reject('already loaded');
      const warhead = command.warhead;
      return effects({ updates: new Map([[u.id, b => ({
        ...b,
        missileInventory: { eclipse: b.missileInventory?.eclipse || 0, he: b.missileInventory?.he || 0, [warhead]: (b.missileInventory?.[warhead] || 0) - 1 },
        ammoState: 'loading' as const,
        loadedAmmo: warhead,
        loadingProgress: 0,
      })]]) });
    }
    case 'TAKE_WARHEAD': {
      const u = ownUnit(view, team, command.unitId, ['ballista']);
      if (typeof u === 'string') return reject(u);
      if (!besideOrdnanceFab(u, view.structures)) return reject('not beside an Ordnance Fab');
      if (!takeWarhead(view.economy, team, command.warhead)) return reject(`no ${command.warhead} in the stockpile`);
      const warhead = command.warhead;
      return effects({
        economy: e => takeWarhead(e, team, warhead),
        updates: new Map([[u.id, b => ({ ...b, missileInventory: addMissile(b, warhead, 1) })]]),
      });
    }
    case 'FABRICATE': {
      const u = ownUnit(view, team, command.unitId, ['mule']);
      if (typeof u === 'string') return reject(u);
      if (u.fabrication?.active) return reject('already fabricating');
      if ((u.ordnanceMaterial || 0) <= 0) return reject('no material');
      const cost = warheadCost(command.warhead);
      if (!spend(view.economy, team, cost)) return reject('not enough cores');
      const item = command.warhead;
      return effects({
        economy: e => spend(e, team, cost),
        updates: new Map([[u.id, m => ({ ...m, fabrication: { active: true, item, progress: 0, totalTime: ABILITY_CONFIG.FABRICATOR_BUILD_TIME } })]]),
      });
    }
    case 'RESUPPLY_MATERIAL': {
      const u = ownUnit(view, team, command.unitId, ['mule']);
      if (typeof u === 'string') return reject(u);
      if (!besideOrdnanceFab(u, view.structures)) return reject('not beside an Ordnance Fab');
      // Material plus missiles carried never exceeds capacity.
      const held = (u.missileInventory?.eclipse || 0) + (u.missileInventory?.he || 0);
      const room = ABILITY_CONFIG.FABRICATOR_MATERIAL_CAPACITY - held;
      if (room <= 0 || (u.ordnanceMaterial || 0) >= room) return reject('already full');
      return effects({ updates: new Map([[u.id, m => ({ ...m, ordnanceMaterial: room })]]) });
    }
    case 'TRANSFER_WARHEAD': {
      const u = ownUnit(view, team, command.unitId, ['mule']);
      if (typeof u === 'string') return reject(u);
      if ((u.missileInventory?.[command.warhead] || 0) <= 0) return reject(`no ${command.warhead} missile on board`);
      let nearest: UnitData | null = null;
      let best = ABILITY_CONFIG.FABRICATOR_DOCK_RANGE;
      for (const b of view.units) {
        if (b.type !== 'ballista' || b.team !== u.team || b.health <= 0) continue;
        const d = distance(b.gridPos, u.gridPos);
        if (d < best) { best = d; nearest = b; }
      }
      if (!nearest) return reject('no Ballista alongside');
      const warhead = command.warhead;
      return effects({ updates: new Map([
        [u.id, m => ({ ...m, missileInventory: addMissile(m, warhead, -1) })],
        [nearest.id, b => ({ ...b, missileInventory: addMissile(b, warhead, 1) })],
      ]) });
    }

    // --- Aimed at a tile ---
    case 'CANNON_FIRE': {
      // Change: any unit could fire this, and the cooldown was set but never checked.
      const u = ownUnit(view, team, command.unitId, TANKS);
      if (typeof u === 'string') return reject(u);
      if ((u.cooldowns.mainCannon || 0) > 0) return reject('main cannon reloading');
      const start = world(u.gridPos, 1.5, ctx);
      const target = world(command.target, 1.0, ctx);
      const dx = target.x - start.x;
      const dz = target.z - start.z;
      const dist = Math.hypot(dx, dz);
      if (dist === 0) return reject('cannot fire at own tile');
      const speed = ABILITY_CONFIG.TITAN_CANNON_SPEED;
      return effects({
        updates: new Map([[u.id, t => ({
          ...t,
          battery: Math.max(0, t.battery - ABILITY_CONFIG.TITAN_CANNON_COST),
          cooldowns: { ...t.cooldowns, mainCannon: ABILITY_CONFIG.TITAN_CANNON_COOLDOWN },
        })]]),
        spawnProjectiles: [{
          id: ctx.newId('proj'), ownerId: u.id, team: u.team, position: start,
          velocity: { x: (dx / dist) * speed, y: 0, z: (dz / dist) * speed },
          damage: ABILITY_CONFIG.TITAN_CANNON_DAMAGE, radius: 0.5,
          maxDistance: ABILITY_CONFIG.TITAN_CANNON_PROJECTILE_RANGE * CITY_CONFIG.tileSize, distanceTraveled: 0,
          targetPos: target, trajectory: 'direct',
        }],
      });
    }
    case 'SURVEILLANCE': {
      const u = ownUnit(view, team, command.unitId, ['drone']);
      if (typeof u === 'string') return reject(u);
      const there = u.gridPos.x === command.target.x && u.gridPos.z === command.target.z;
      const path = there ? [] : ctx.findPath(u.gridPos, command.target);
      if (!there && path.length === 0) return reject('no route there');
      const center = { ...command.target };
      const returnPos = { ...u.gridPos };
      const now = ctx.now;
      return effects({ updates: new Map([[u.id, d => ({
        ...d,
        path,
        surveillance: { active: true, status: there ? 'active' as const : 'traveling' as const, center, returnPos, startTime: there ? now : 0 },
      })]]) });
    }
    case 'FIRE_BALLISTA': {
      const u = ownUnit(view, team, command.unitId, ['ballista']);
      if (typeof u === 'string') return reject(u);
      if (u.ammoState !== 'armed' || !u.loadedAmmo) return reject('no missile armed');
      const start = world(u.gridPos, 2.0, ctx);
      const target = world(command.target, 1.0, ctx);
      const flight = Math.hypot(target.x - start.x, target.z - start.z);
      return effects({
        updates: new Map([[u.id, b => ({ ...b, ammoState: 'empty' as const, loadedAmmo: null })]]),
        spawnProjectiles: [{
          id: ctx.newId('missile'), ownerId: u.id, team: u.team, position: start, velocity: { x: 0, y: 0, z: 0 },
          damage: 0, radius: 1.0, maxDistance: flight, distanceTraveled: 0, targetPos: target,
          trajectory: 'ballistic', payload: u.loadedAmmo, startPos: start, startTime: ctx.now,
        }],
      });
    }
    case 'FIRE_SWARM': {
      const u = ownUnit(view, team, command.unitId, ['wasp']);
      if (typeof u === 'string') return reject(u);
      if (!u.charges?.swarm || u.charges.swarm <= 0) return reject('no swarm charges left');
      // Change: the cooldown was set but never checked.
      if ((u.cooldowns.swarmLaunch || 0) > 0) return reject('swarm launcher reloading');
      const start = world(u.gridPos, 75.0, ctx); // Wasps hover at 75
      const target = world(command.target, 0.5, ctx);
      const baseAngle = Math.atan2(target.z - start.z, target.x - start.x);
      const speed = ABILITY_CONFIG.WASP_MISSILE_SPEED;
      const swarm: Projectile[] = [];
      for (let i = 0; i < ABILITY_CONFIG.WASP_MISSILES_PER_VOLLEY; i++) {
        // A wide cone, about +/- 80 degrees, climbing first so the darts fan out.
        const angle = baseAngle + (ctx.random() - 0.5) * 2.8;
        swarm.push({
          id: ctx.newId('microdrone'), ownerId: u.id, team: u.team, position: { ...start },
          velocity: { x: Math.cos(angle) * speed, y: ctx.random() * 3 + 2, z: Math.sin(angle) * speed },
          damage: ABILITY_CONFIG.WASP_DAMAGE_PER_MISSILE, radius: 0.5, maxDistance: 200, distanceTraveled: 0,
          targetPos: target, trajectory: 'swarm', startPos: start, startTime: ctx.now, phase: 'ascent',
        });
      }
      return effects({
        updates: new Map([[u.id, w => ({
          ...w,
          charges: { ...w.charges, swarm: (w.charges?.swarm || 1) - 1 },
          cooldowns: { ...w.cooldowns, swarmLaunch: ABILITY_CONFIG.WASP_SWARM_COOLDOWN },
        })]]),
        spawnProjectiles: swarm,
      });
    }
    case 'BOMBARD': {
      const u = ownUnit(view, team, command.unitId, ['bombard']);
      if (typeof u === 'string') return reject(u);
      const there = u.gridPos.x === command.target.x && u.gridPos.z === command.target.z;
      const path = there ? [] : ctx.findAirPath(u.gridPos, command.target);
      if (!there && path.length === 0) return reject('no route there');
      const target = { ...command.target };
      return effects({ updates: new Map([[u.id, b => ({ ...b, path, bombardmentTarget: target })]]) });
    }

    // --- Links between units ---
    case 'HARDLINE_TETHER': {
      const u = ownUnit(view, team, command.unitId, ['banshee']);
      if (typeof u === 'string') return reject(u);
      const target = view.units.find(t => t.id === command.targetUnitId);
      if (!target || !isTetherableDrone(target) || target.team !== u.team || target.id === u.id) return reject('can only tether a friendly drone');
      if (distance(u.gridPos, target.gridPos) > ABILITY_CONFIG.BANSHEE_TETHER_RANGE) return reject('out of tether range');
      const updates = new Map<string, (x: UnitData) => UnitData>([[u.id, b => ({ ...b, tetherTargetId: target.id })]]);
      // One hardline per drone: any other Banshee holding it lets go.
      for (const other of view.units) {
        if (other.id !== u.id && other.tetherTargetId === target.id) updates.set(other.id, b => ({ ...b, tetherTargetId: null }));
      }
      return effects({ updates });
    }
    case 'DISCONNECT_TETHER': {
      const u = ownUnit(view, team, command.unitId, ['banshee']);
      if (typeof u === 'string') return reject(u);
      return effects({ updates: new Map([[u.id, b => ({ ...b, tetherTargetId: null })]]) });
    }
    case 'BATTERY_LINK': {
      const u = ownUnit(view, team, command.unitId, ['sun_plate']);
      if (typeof u === 'string') return reject(u);
      if (!u.isDeployed) return reject('anchor the Battery Mule first');
      const target = view.units.find(t => t.id === command.targetUnitId);
      if (!target || !isBatteryLinkable(target) || target.team !== u.team) return reject('cannot link that unit');
      if (distance(u.gridPos, target.gridPos) > ABILITY_CONFIG.BATTERY_MULE_RANGE) return reject('out of range');
      const links = u.batteryTetherIds || [];
      // Clicking a linked vehicle unlinks it.
      if (links.includes(target.id)) {
        return effects({ updates: new Map([[u.id, m => ({ ...m, batteryTetherIds: (m.batteryTetherIds || []).filter(id => id !== target.id) })]]) });
      }
      if (links.length >= ABILITY_CONFIG.BATTERY_MULE_SLOTS) return reject('all links in use');
      const updates = new Map<string, (x: UnitData) => UnitData>([[u.id, m => ({ ...m, batteryTetherIds: [...(m.batteryTetherIds || []), target.id] })]]);
      // A vehicle draws from one mule at a time.
      for (const other of view.units) {
        if (other.id !== u.id && other.batteryTetherIds?.includes(target.id)) {
          updates.set(other.id, m => ({ ...m, batteryTetherIds: (m.batteryTetherIds || []).filter(id => id !== target.id) }));
        }
      }
      return effects({ updates });
    }
    case 'DISCONNECT_BATTERY': {
      const u = ownUnit(view, team, command.unitId, ['sun_plate']);
      if (typeof u === 'string') return reject(u);
      return effects({ updates: new Map([[u.id, m => ({ ...m, batteryTetherIds: [] })]]) });
    }
  }
}

function addMissile(u: UnitData, warhead: Warhead, count: number) {
  const inv = { eclipse: u.missileInventory?.eclipse || 0, he: u.missileInventory?.he || 0 };
  inv[warhead] += count;
  return inv;
}

// Applies `change` to each listed unit the sender owns that is of the right type.
function toggleEach(view: AbilityView, team: Team, ids: readonly string[], types: readonly UnitType[], change: (u: UnitData) => UnitData): AbilityOutcome {
  const updates = new Map<string, (u: UnitData) => UnitData>();
  for (const id of ids) {
    const u = ownUnit(view, team, id, types);
    if (typeof u !== 'string') updates.set(u.id, change);
  }
  return updates.size > 0 ? effects({ updates }) : reject('no unit can do that');
}

// Battery Mule plants or packs up. A Swarm Host anchoring releases its opening crawlers.
function toggleAnchor(view: AbilityView, team: Team, ids: readonly string[], ctx: AbilityContext): AbilityOutcome {
  const updates = new Map<string, (u: UnitData) => UnitData>();
  const spawnUnits: UnitData[] = [];
  for (const id of ids) {
    const u = ownUnit(view, team, id, ['sun_plate', 'swarm_host']);
    if (typeof u === 'string') continue;
    if (u.type === 'sun_plate') {
      const anchoring = !u.isDeployed;
      updates.set(u.id, m => ({ ...m, isDeployed: anchoring, path: [], batteryTetherIds: anchoring ? (m.batteryTetherIds || []) : [] }));
      continue;
    }
    const anchoring = !u.isAnchored;
    if (anchoring) {
      const batch = ctx.newId('swarm');
      for (let i = 0; i < ABILITY_CONFIG.SWARM_HOST_INITIAL_DRONES; i++) {
        spawnUnits.push(ctx.createCrawler(u, ctx.findAdjacentSpawn(u.gridPos), `${batch}-${i}`));
      }
    }
    const now = ctx.now;
    updates.set(u.id, h => ({
      ...h,
      isAnchored: anchoring,
      path: [],
      anchorTime: anchoring ? now : undefined,
      cooldowns: { ...h.cooldowns, spawnCrawler: anchoring ? ABILITY_CONFIG.SWARM_HOST_SPAWN_INTERVAL : 0 },
    }));
  }
  return updates.size > 0 ? effects({ updates, spawnUnits }) : reject('no unit can do that');
}

// Titan smoke and APS. Change: charges were never spent and cooldowns never checked, so
// both could be used endlessly. Orbital-drop Titans can now use theirs too.
function titanCountermeasure(view: AbilityView, team: Team, ids: readonly string[], kind: 'smoke' | 'aps'): AbilityOutcome {
  const cooldownKey = kind === 'smoke' ? 'titanSmoke' : 'titanAps';
  const cooldown = kind === 'smoke' ? ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN : ABILITY_CONFIG.TITAN_APS_COOLDOWN;
  const duration = kind === 'smoke' ? ABILITY_CONFIG.TITAN_SMOKE_DURATION : ABILITY_CONFIG.TITAN_APS_DURATION;
  const updates = new Map<string, (u: UnitData) => UnitData>();
  let reason = 'no unit can do that';
  for (const id of ids) {
    const u = ownUnit(view, team, id, TANKS);
    if (typeof u === 'string') continue;
    if ((u.cooldowns[cooldownKey] || 0) > 0) { reason = `${kind} recharging`; continue; }
    if ((u.charges?.[kind] ?? 0) <= 0) { reason = `no ${kind} charges left`; continue; }
    updates.set(u.id, t => ({
      ...t,
      charges: { ...t.charges, [kind]: Math.max(0, (t.charges?.[kind] ?? 0) - 1) },
      cooldowns: { ...t.cooldowns, [cooldownKey]: cooldown },
      [kind]: { active: true, remainingTime: duration },
    }));
  }
  return updates.size > 0 ? effects({ updates }) : reject(reason);
}

// Ghost Phantom Decoy: cloak and send projections scattering in different directions.
// Ordering it again while cloaked drops the cloak and the projections.
function phantomDecoy(view: AbilityView, team: Team, id: string, ctx: AbilityContext): AbilityOutcome {
  const u = ownUnit(view, team, id, ['ghost']);
  if (typeof u === 'string') return reject(u);
  if (u.decoyActive) {
    return effects({ updates: new Map([[u.id, g => ({ ...g, decoyActive: false, isStealthed: false })]]), clearDecoysOf: [u.id] });
  }
  if (u.battery <= 1) return reject('not enough battery');

  const directions = [
    { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 },
    { x: 1, z: 1 }, { x: -1, z: 1 }, { x: 1, z: -1 }, { x: -1, z: -1 },
  ];
  const origin = u.gridPos;
  const claimed = new Set<string>([`${origin.x},${origin.z}`]);
  const spawned: DecoyData[] = [];
  for (const dir of directions) {
    if (spawned.length >= ABILITY_CONFIG.PHANTOM_DECOY_COUNT) break;
    const path: string[] = [];
    let x = origin.x;
    let z = origin.z;
    for (let step = 0; step < ABILITY_CONFIG.PHANTOM_DECOY_SCATTER; step++) {
      const candidates = [
        { x: x + dir.x, z: z + dir.z },
        { x: x + Math.sign(dir.x), z },
        { x, z: z + Math.sign(dir.z) },
        { x: x + 1, z }, { x: x - 1, z }, { x, z: z + 1 }, { x, z: z - 1 },
        { x: x + 1, z: z + 1 }, { x: x - 1, z: z - 1 }, { x: x + 1, z: z - 1 }, { x: x - 1, z: z + 1 },
      ];
      const next = candidates.find(n => !claimed.has(`${n.x},${n.z}`) && ctx.isWalkable(n.x, n.z));
      if (!next) break;
      claimed.add(`${next.x},${next.z}`);
      path.push(`${next.x},${next.z}`);
      x = next.x;
      z = next.z;
    }
    if (path.length === 0) continue;
    spawned.push({ id: ctx.newId(`decoy-${u.id}`), team, gridPos: { ...origin }, createdAt: ctx.now, ownerId: u.id, path });
  }
  const now = ctx.now;
  return effects({
    updates: new Map([[u.id, g => ({ ...g, decoyActive: true, decoyStartTime: now, isStealthed: true })]]),
    clearDecoysOf: [u.id],
    spawnDecoys: spawned,
  });
}

// Applies the unit side of an outcome to the live roster.
export function applyUnitEffects(units: UnitData[], fx: AbilityEffects): UnitData[] {
  if (fx.updates.size === 0 && fx.spawnUnits.length === 0) return units;
  const next = units.map(u => {
    const update = fx.updates.get(u.id);
    return update ? update(u) : u;
  });
  return fx.spawnUnits.length > 0 ? [...next, ...fx.spawnUnits] : next;
}
