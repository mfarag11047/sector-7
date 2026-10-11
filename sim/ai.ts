// The computer opponent.
//
// aiThink looks at the match and returns the commands it wants to send. It never changes
// the world itself: CityMap sends its commands through the same checks as the player's
// (sim/orders.ts, sim/abilities.ts, doctrine powers), so the computer can't do anything a
// player couldn't. Difficulty changes how often it thinks, how well it counters, how soon
// it attacks and which doctrine powers it uses; its income multiplier is in sim/match.ts.
//
// How it plays, in the spirit of the design:
//   1. Builds a Barracks and Factory, then an Airpad and Comm Link once it reaches Tier 2.
//   2. Sends a capture team of infantry to the nearest free core node, then the next.
//   3. Gathers its army at the front of its energy grid and trains units that counter what
//      it sees the enemy fielding.
//   4. When strong enough it takes a server node (for Tier 2 and 3), then enemy core nodes,
//      then the enemy HQ. It pulls back if outmatched, defends its base and nodes, and sends
//      vehicles low on battery home to recharge.

import { ABILITY_CONFIG, DOCTRINE_CONFIG, UNIT_STATS } from '../constants';
import type { BuildingData, DoctrineType, StructureData, StructureType, UnitData, UnitType } from '../types';
import type { AbilityCommand } from './abilities';
import type { GridPos, Team } from './commands';
import { Economy, structureCost, unitCost } from './economy';
import { isInsideEnergyGrid } from './energy';
import type { Difficulty } from './match';
import { isOperational, MAX_QUEUE, OrderCommand, popUsed, teamPopCap, teamTier } from './orders';
import { ArmorClass, dps, Tier, UNIT_RULES, unitsProducedBy } from './units';
import { DOMINATION_NODES } from './victory';

export interface AiView {
  units: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
  economy: Economy;
  // Milliseconds since the match started.
  elapsedMs: number;
}

export interface AiContext {
  gridSize: number;
  bases: Record<Team, GridPos>;
  difficulty: Difficulty;
  doctrine: DoctrineType | null;
  // Free to build on (no building, structure or base pad, with road beside it).
  canBuildOn: (x: number, z: number) => boolean;
  // Open ground, not a road: building there won't block a lane.
  isOpenGround: (x: number, z: number) => boolean;
  isWalkable: (x: number, z: number) => boolean;
  // Milliseconds until each doctrine power is ready.
  doctrineCooldowns: { tier2: number; tier3: number };
  random: () => number;
}

export type AiAction =
  | { kind: 'order'; command: OrderCommand }
  | { kind: 'ability'; command: AbilityCommand }
  | { kind: 'doctrine'; tier: 2 | 3; target: GridPos };

export interface AiMemory {
  // The last move each unit was given, so orders aren't repeated every think.
  lastOrder: Record<string, string>;
  // What the army is doing.
  mode: 'gather' | 'expand' | 'tech' | 'attack' | 'defend' | 'retreat';
  objective: GridPos | null;
  objectiveId: string | null;
  // When the army last pulled back, to wait before trying again.
  retreatedAt: number;
}

export const freshAiMemory = (): AiMemory => ({ lastOrder: {}, mode: 'gather', objective: null, objectiveId: null, retreatedAt: -Infinity });

// How each difficulty plays.
export interface AiProfile {
  thinkMs: number;
  // Army value (cores) needed before it leaves home to fight.
  attackValue: number;
  // Earliest it will attack the enemy, and push for a server node.
  firstAttackMs: number;
  firstTechMs: number;
  // Trains to counter the enemy army; otherwise picks at random.
  counters: boolean;
  // How many units it keeps queued per structure.
  queueDepth: number;
  doctrineTiers: (2 | 3)[];
  secondBarracks: boolean;
  capturers: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: { thinkMs: 4000, attackValue: 2400, firstAttackMs: 9 * 60_000, firstTechMs: 6 * 60_000, counters: false, queueDepth: 1, doctrineTiers: [], secondBarracks: false, capturers: 3 },
  normal: { thinkMs: 2000, attackValue: 1800, firstAttackMs: 5 * 60_000, firstTechMs: 3 * 60_000, counters: true, queueDepth: 1, doctrineTiers: [2], secondBarracks: false, capturers: 3 },
  hard: { thinkMs: 1200, attackValue: 1400, firstAttackMs: 3 * 60_000, firstTechMs: 2 * 60_000, counters: true, queueDepth: 2, doctrineTiers: [2, 3], secondBarracks: true, capturers: 4 },
};

// Units the computer fields. The rest (Ballistas, Banshees, Battery Mules...) need a player's hand.
const FIGHTERS: UnitType[] = ['trooper', 'lancer', 'razorback', 'tank', 'aegis', 'hornet', 'wasp', 'guardian'];
const CAPTURERS: UnitType[] = ['trooper', 'ghost'];
const ARMORS: ArmorClass[] = ['infantry', 'light', 'heavy', 'air'];

const dist = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
const posOf = (b: BuildingData): GridPos => ({ x: b.gridX, z: b.gridZ });
const alive = (u: UnitData) => u.health > 0;
const isFighter = (u: UnitData) => !!UNIT_RULES[u.type].weapon || u.type === 'guardian';
// Rough fighting worth: what it cost, scaled by health left.
const valueOf = (u: UnitData) => (UNIT_STATS[u.type].cost || 150) * (u.health / u.maxHealth);
const needsGrid = (u: UnitData) => u.unitClass !== 'infantry';

export function aiThink(view: AiView, team: Team, memory: AiMemory, ctx: AiContext): { actions: AiAction[]; memory: AiMemory } {
  const profile = AI_PROFILES[ctx.difficulty];
  const enemy: Team = team === 'blue' ? 'red' : 'blue';
  const home = ctx.bases[team];
  const enemyHome = ctx.bases[enemy];
  const actions: AiAction[] = [];
  const mem: AiMemory = { ...memory, lastOrder: { ...memory.lastOrder } };
  const now = view.elapsedMs;

  const mine = view.units.filter(u => u.team === team && alive(u));
  const theirs = view.units.filter(u => u.team === enemy && alive(u));
  const myStructures = view.structures.filter(s => s.team === team);
  const tier = teamTier(view.buildings, team);
  let cores = view.economy[team].cores;

  // --- 1. Build order ---
  const have = (type: StructureType) => myStructures.filter(s => s.type === type).length;
  const building = myStructures.some(s => (s.buildRemainingMs || 0) > 0);
  const wants: StructureType[] = ['infantry', 'armor'];
  if (tier >= 2) wants.push('air', 'support');
  if (profile.secondBarracks && now > 6 * 60_000) wants.push('infantry');
  const counts: Partial<Record<StructureType, number>> = {};
  const nextBuild = wants.find(type => {
    counts[type] = (counts[type] || 0) + 1;
    return have(type) < counts[type]!;
  });
  // Save up for the next structure before spending on units, unless under attack.
  let reserve = 0;
  if (nextBuild && !building) {
    const cost = structureCost(nextBuild);
    const spot = cores >= cost ? findBuildSpot(view, team, ctx) : null;
    if (spot) {
      actions.push({ kind: 'order', command: { type: 'PLACE_STRUCTURE', structureType: nextBuild, at: spot } });
      cores -= cost;
    } else {
      reserve = cost;
    }
  }

  // --- 2. Where the army stands and what it's for ---
  const gather = gatherPoint(view, team, ctx);
  const threat = threatNear(view, team, enemy, home, ctx.difficulty === 'easy' ? 0 : 250);
  const armyUnits = mine.filter(u => isFighter(u) && u.type !== 'defense_drone');
  const armyValue = armyUnits.reduce((sum, u) => sum + valueOf(u), 0);

  // Free core nodes (and server nodes once the army can take a Sentinel) to capture.
  const coreNodes = view.buildings.filter(b => b.type === 'core_node' && !b.destroyed);
  const serverNodes = view.buildings.filter(b => b.type === 'server_node' && !b.destroyed);
  const sentinelAt = (b: BuildingData) => view.units.find(u => u.type === 'defense_drone' && alive(u) && dist(u.gridPos, posOf(b)) <= 1.5);
  // Prefer nodes nearer us than the enemy.
  const lean = (b: BuildingData) => dist(posOf(b), home) - 0.5 * dist(posOf(b), enemyHome);
  const freeCores = coreNodes.filter(b => b.owner === null).sort((a, b) => lean(a) - lean(b));
  const enemyCores = coreNodes.filter(b => b.owner === enemy).sort((a, b) => lean(a) - lean(b));
  const freeServers = serverNodes.filter(b => b.owner !== team).sort((a, b) => lean(a) - lean(b));

  // Capture team: a few infantry that go after free core nodes while the army does its job.
  const infantry = mine.filter(u => CAPTURERS.includes(u.type)).sort((a, b) => a.id.localeCompare(b.id));
  const captureTarget = freeCores[0] ?? null;
  const capturers = captureTarget ? infantry.slice(0, profile.capturers) : [];
  const capturerIds = new Set(capturers.map(u => u.id));

  // The army's objective, most urgent first.
  const enemyNear = (at: GridPos, r: number) => theirs.filter(u => dist(u.gridPos, at) <= r).reduce((s, u) => s + valueOf(u), 0);
  let mode: AiMemory['mode'] = 'gather';
  let objective: GridPos = gather;
  let objectiveId: string | null = null;
  const canAttack = now >= profile.firstAttackMs && armyValue >= profile.attackValue;
  const canTech = now >= profile.firstTechMs && armyValue >= profile.attackValue * 0.6;
  const retreating = now - mem.retreatedAt < 30_000;
  // The enemy is close to a domination win: break their hold on a node whatever it takes.
  const enemyDominating = enemyCores.length >= DOMINATION_NODES && armyValue >= 400;
  if (threat) {
    mode = 'defend'; objective = threat;
  } else if (enemyDominating) {
    mode = 'attack'; objective = posOf(enemyCores[0]); objectiveId = enemyCores[0].id;
  } else if (!retreating && tier < 3 && canTech && freeServers.length > 0) {
    mode = 'tech'; objective = posOf(freeServers[0]); objectiveId = freeServers[0].id;
  } else if (!retreating && canAttack && enemyCores.length > 0) {
    mode = 'attack'; objective = posOf(enemyCores[0]); objectiveId = enemyCores[0].id;
  } else if (!retreating && canAttack && armyValue >= profile.attackValue * 1.6) {
    mode = 'attack'; objective = enemyHome; objectiveId = `hq-${enemy}`;
  } else if (freeCores.length > 1 && armyValue >= 600) {
    // Escort a second capture at the next free node.
    mode = 'expand'; objective = posOf(freeCores[1]); objectiveId = freeCores[1].id;
  }
  // Outmatched where it's heading: fall back and try again later (unless the match is at stake).
  if (mode !== 'defend' && mode !== 'gather' && !enemyDominating) {
    const front = armyUnits.length > 0 ? centroid(armyUnits.map(u => u.gridPos)) : gather;
    const opposition = enemyNear(objective, 7) + enemyNear(front, 6);
    if (opposition > armyValue * 1.4) {
      mode = 'retreat'; objective = gather; objectiveId = null;
      mem.retreatedAt = now;
    }
  }
  mem.mode = mode; mem.objective = objective; mem.objectiveId = objectiveId;

  // --- 3. Movement ---
  const groups = new Map<string, { target: GridPos; attackMove: boolean; ids: string[] }>();
  const send = (u: UnitData, target: GridPos, attackMove: boolean) => {
    const key = `${target.x},${target.z},${attackMove ? 'a' : 'm'}`;
    const near = dist(u.gridPos, target) <= 2.5;
    const idle = u.path.length === 0;
    // Same order as last time: only resend if it stopped short of the target.
    if (mem.lastOrder[u.id] === key && (near || !idle)) return;
    if (near && idle) { mem.lastOrder[u.id] = key; return; }
    mem.lastOrder[u.id] = key;
    const g = groups.get(key) ?? { target, attackMove, ids: [] };
    g.ids.push(u.id);
    groups.set(key, g);
  };

  // How far the objective lies beyond our grid, and where to stage short of it. Vehicles and
  // aircraft only go further than VEHICLE_REACH past the grid once infantry have captured
  // buildings to bring the grid closer. Until then they hold at the staging point.
  const gridAnchors = gridCoverage(view, team, ctx);
  const gap = gridGap(objective, gridAnchors);
  const staging = mode === 'gather' || mode === 'retreat' || mode === 'defend' ? objective : stagingPoint(objective, gridAnchors, view, team, ctx) ?? gather;
  const stone = gap > 4 ? steppingStone(objective, gridAnchors, view, team) : null;
  // Units still on their way from base gather at the staging point first, so the army arrives
  // together rather than one at a time.
  const pushing = mode === 'attack' || mode === 'tech' || mode === 'expand';
  const joined = (u: UnitData) => dist(u.gridPos, staging) <= 8 || dist(u.gridPos, objective) <= dist(staging, objective) + 2;

  for (const u of mine) {
    // Fighters and capturers take orders; Masons, scouts and drones look after themselves.
    if (!FIGHTERS.includes(u.type) && !CAPTURERS.includes(u.type) && u.type !== 'titan_dropped') continue;
    const onGrid = isInsideEnergyGrid(u.gridPos, team, view.buildings, ctx.bases.blue, ctx.bases.red);
    // Vehicles low on battery off the grid go back to recharge.
    if (needsGrid(u) && u.battery < u.maxBattery * 0.3 && !onGrid) {
      send(u, staging === objective ? gather : staging, false);
      continue;
    }
    if (capturerIds.has(u.id) && captureTarget && mode !== 'defend') {
      send(u, posOf(captureTarget), true);
      continue;
    }
    if (!pushing) {
      send(u, objective, mode !== 'retreat');
      continue;
    }
    if (!joined(u)) {
      send(u, staging, true);
      continue;
    }
    if (needsGrid(u)) {
      // Out of reach on battery: hold at the staging point while infantry move the grid up.
      send(u, gap > VEHICLE_REACH ? staging : objective, true);
    } else {
      // Infantry capture the building that brings the grid closest to the objective, then go on.
      send(u, stone ?? objective, true);
    }
  }
  for (const g of groups.values()) {
    actions.push({ kind: 'order', command: { type: 'MOVE', unitIds: g.ids, target: g.target, attackMove: g.attackMove } });
  }
  // Forget orders for units that are gone.
  const living = new Set(mine.map(u => u.id));
  for (const id of Object.keys(mem.lastOrder)) if (!living.has(id)) delete mem.lastOrder[id];

  // --- 4. Production ---
  const spendable = () => cores - (threat ? 0 : reserve);
  let pop = popUsed(view.units, view.structures, team);
  const cap = teamPopCap(view.buildings, team);
  const enemyMix = armorMix(theirs);
  const infantryCount = mine.filter(u => UNIT_RULES[u.type].armor === 'infantry').length;
  const guardians = mine.filter(u => u.type === 'guardian').length;
  for (const s of myStructures) {
    if (!isOperational(s) || unitsProducedBy(s.type).length === 0) continue;
    if ((s.queue?.length || 0) >= Math.min(MAX_QUEUE, profile.queueDepth)) continue;
    // New units head for the gather point.
    if (!s.rallyPoint || s.rallyPoint.x !== gather.x || s.rallyPoint.z !== gather.z) {
      actions.push({ kind: 'order', command: { type: 'SET_RALLY', structureId: s.id, at: gather } });
    }
    const pick = chooseUnit(s.type, tier, enemyMix, {
      counters: profile.counters, random: ctx.random,
      needInfantry: infantryCount < 6, guardians, army: armyUnits.length,
    });
    if (!pick) continue;
    const cost = unitCost(pick);
    if (cost > spendable() || pop + UNIT_RULES[pick].pop > cap) continue;
    actions.push({ kind: 'order', command: { type: 'TRAIN_UNIT', structureId: s.id, unitType: pick } });
    cores -= cost;
    pop += UNIT_RULES[pick].pop;
  }

  // --- 5. Abilities and doctrine powers ---
  for (const u of mine) {
    if (u.type !== 'tank' && u.type !== 'titan_dropped') continue;
    const pressed = theirs.some(t => dist(t.gridPos, u.gridPos) <= 5);
    if (pressed && u.health < u.maxHealth * 0.5 && (u.charges?.smoke || 0) > 0 && !u.smoke?.active && !(u.cooldowns?.titanSmoke > 0)) {
      actions.push({ kind: 'ability', command: { type: 'SMOKE_SCREEN', unitIds: [u.id] } });
    }
  }
  const power = ctx.doctrine ? doctrineMove(ctx.doctrine, profile, tier, cores, ctx.doctrineCooldowns, mode, objective, armyUnits, theirs) : null;
  if (power) actions.push(power);

  return { actions, memory: mem };
}

// --- Helpers ---

function centroid(points: GridPos[]): GridPos {
  const x = points.reduce((s, p) => s + p.x, 0) / points.length;
  const z = points.reduce((s, p) => s + p.z, 0) / points.length;
  return { x: Math.round(x), z: Math.round(z) };
}

// The share of the enemy army's value in each armor class.
function armorMix(units: readonly UnitData[]): Record<ArmorClass, number> {
  const mix: Record<ArmorClass, number> = { infantry: 0, light: 0, heavy: 0, air: 0, structure: 0 };
  let total = 0;
  for (const u of units) {
    if (u.type === 'defense_drone' || u.type === 'crawler_drone') continue;
    const v = valueOf(u);
    mix[UNIT_RULES[u.type].armor] += v;
    total += v;
  }
  // Nothing seen yet: expect the usual opening of infantry and light vehicles.
  if (total === 0) return { infantry: 0.6, light: 0.3, heavy: 0.1, air: 0, structure: 0 };
  for (const k of ARMORS) mix[k] /= total;
  return mix;
}

// What to train next at a structure: whatever does the most damage per core against the
// enemy's mix, with a little health thrown in so it doesn't only build glass cannons.
export function chooseUnit(
  producer: StructureType,
  tier: Tier,
  enemyMix: Record<ArmorClass, number>,
  opts: { counters: boolean; random: () => number; needInfantry: boolean; guardians: number; army: number },
): UnitType | null {
  const options = unitsProducedBy(producer).filter(t => FIGHTERS.includes(t) && UNIT_RULES[t].tier <= tier);
  if (options.length === 0) return null;
  if (producer === 'infantry' && opts.needInfantry) return 'trooper';
  if (producer === 'support') return opts.guardians < Math.floor(opts.army / 8) ? 'guardian' : null;
  if (!opts.counters) return options[Math.floor(opts.random() * options.length)];
  const score = (t: UnitType) => {
    const rules = UNIT_RULES[t];
    let damage = 0;
    for (const a of ARMORS) damage += enemyMix[a] * dps(rules.weapon, a);
    return (damage * Math.sqrt(UNIT_STATS[t].maxHealth)) / unitCost(t);
  };
  const ranked = options.filter(t => t !== 'guardian').sort((a, b) => score(b) - score(a));
  // A little variety: one time in four take the runner-up.
  return ranked.length > 1 && opts.random() < 0.25 ? ranked[1] : ranked[0] ?? null;
}

// The tile the army waits on: the edge of our grid nearest the enemy.
export function gatherPoint(view: AiView, team: Team, ctx: AiContext): GridPos {
  const enemyHome = ctx.bases[team === 'blue' ? 'red' : 'blue'];
  const home = ctx.bases[team];
  const anchors: GridPos[] = [home, ...view.buildings.filter(b => b.owner === team && !b.destroyed && b.type !== 'core_node').map(posOf)];
  anchors.sort((a, b) => dist(a, enemyHome) - dist(b, enemyHome));
  const anchor = anchors[0];
  // A walkable tile a couple of steps from the anchor toward the enemy, still inside the grid.
  const dx = Math.sign(enemyHome.x - anchor.x);
  const dz = Math.sign(enemyHome.z - anchor.z);
  for (const step of [3, 2, 1, 0]) {
    const base = { x: anchor.x + dx * step, z: anchor.z + dz * step };
    for (let r = 0; r <= 2; r++) {
      for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
        const p = { x: base.x + ox, z: base.z + oz };
        if (ctx.isWalkable(p.x, p.z) && isInsideEnergyGrid(p, team, view.buildings, ctx.bases.blue, ctx.bases.red)) return p;
      }
    }
  }
  return { x: home.x + Math.sign(enemyHome.x - home.x) * 3, z: home.z + Math.sign(enemyHome.z - home.z) * 3 };
}

// How far past the edge of our grid vehicles may be sent on battery.
const VEHICLE_REACH = 10;

interface GridAnchor { at: GridPos; radius: number }

function gridCoverage(view: AiView, team: Team, ctx: AiContext): GridAnchor[] {
  return [
    { at: ctx.bases[team], radius: ABILITY_CONFIG.ENERGY_GRID_BASE_RADIUS },
    ...view.buildings
      .filter(b => b.owner === team && !b.destroyed && b.type !== 'core_node')
      .map(b => ({ at: posOf(b), radius: ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS })),
  ];
}

// Tiles from a point to the nearest edge of our grid (0 inside it).
const gridGap = (p: GridPos, anchors: readonly GridAnchor[]) =>
  Math.max(0, Math.min(...anchors.map(a => dist(p, a.at) - a.radius)));

// A walkable tile inside our grid, as near the objective as we can get.
function stagingPoint(objective: GridPos, anchors: readonly GridAnchor[], view: AiView, team: Team, ctx: AiContext): GridPos | null {
  const best = [...anchors].sort((a, b) => dist(a.at, objective) - dist(b.at, objective))[0];
  if (!best) return null;
  // Step from the anchor toward the objective, staying inside its radius.
  const d = dist(best.at, objective) || 1;
  const reach = Math.min(best.radius - 1, d);
  const base = { x: Math.round(best.at.x + ((objective.x - best.at.x) / d) * reach), z: Math.round(best.at.z + ((objective.z - best.at.z) / d) * reach) };
  for (let r = 0; r <= 3; r++) {
    for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
      const p = { x: base.x + ox, z: base.z + oz };
      if (ctx.isWalkable(p.x, p.z) && isInsideEnergyGrid(p, team, view.buildings, ctx.bases.blue, ctx.bases.red)) return p;
    }
  }
  return null;
}

// The ordinary building just beyond our grid that would bring it closest to the objective.
function steppingStone(objective: GridPos, anchors: readonly GridAnchor[], view: AiView, team: Team): GridPos | null {
  const current = gridGap(objective, anchors);
  let best: BuildingData | null = null;
  let bestGap = current - 2;
  for (const b of view.buildings) {
    if (b.owner === team || b.destroyed || b.type === 'core_node' || b.type === 'server_node') continue;
    const p = posOf(b);
    if (gridGap(p, anchors) > 6) continue;
    const after = Math.max(0, dist(p, objective) - ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS);
    if (after < bestGap) { best = b; bestGap = after; }
  }
  return best ? posOf(best) : null;
}

// Enemy units at our HQ, or a raid on one of our nodes worth at least `minRaid`: where to
// defend, if anywhere. Small raids on nodes are left to the capture team and the node's
// own infantry, so a trickle of enemies can't pin the whole army at home.
function threatNear(view: AiView, team: Team, enemy: Team, home: GridPos, minRaid: number): GridPos | null {
  const enemies = view.units.filter(u => u.team === enemy && alive(u));
  const atHome = enemies.filter(u => dist(u.gridPos, home) <= 10);
  if (atHome.length > 0) return centroid(atHome.map(u => u.gridPos));
  let worst: { at: GridPos; value: number } | null = null;
  for (const b of view.buildings) {
    if (b.owner !== team || (b.type !== 'core_node' && b.type !== 'server_node')) continue;
    const value = enemies.filter(u => dist(u.gridPos, posOf(b)) <= 4).reduce((s, u) => s + valueOf(u), 0);
    // A raid actually taking the node always counts, however small.
    const taking = b.capturingTeam === enemy && b.captureProgress > 0;
    if (value > 0 && (value >= minRaid || taking) && (!worst || value > worst.value)) worst = { at: posOf(b), value };
  }
  return worst?.at ?? null;
}

// A tile in our base to put the next structure: open ground inside the grid, not on a road,
// not next to another structure (so lanes stay open), nearest the HQ.
function findBuildSpot(view: AiView, team: Team, ctx: AiContext): GridPos | null {
  const home = ctx.bases[team];
  const taken = view.structures.map(s => s.gridPos);
  let best: GridPos | null = null;
  let bestD = Infinity;
  for (let x = home.x - 7; x <= home.x + 7; x++) {
    for (let z = home.z - 7; z <= home.z + 7; z++) {
      const p = { x, z };
      const d = dist(p, home);
      if (d < 2.5 || d >= bestD) continue;
      if (!ctx.isOpenGround(x, z) || !ctx.canBuildOn(x, z)) continue;
      if (taken.some(t => Math.abs(t.x - x) <= 1 && Math.abs(t.z - z) <= 1)) continue;
      if (!isInsideEnergyGrid(p, team, view.buildings, ctx.bases.blue, ctx.bases.red)) continue;
      best = p; bestD = d;
    }
  }
  return best;
}

function doctrineMove(
  doctrine: DoctrineType, profile: AiProfile, tier: Tier, cores: number, cooldowns: { tier2: number; tier3: number },
  mode: AiMemory['mode'], objective: GridPos, army: readonly UnitData[], enemies: readonly UnitData[],
): AiAction | null {
  const config = DOCTRINE_CONFIG[doctrine];
  const front = army.length > 0 ? centroid(army.map(u => u.gridPos)) : objective;
  // The densest enemy cluster within reach of the fight.
  const cluster = densestCluster(enemies, 3);
  const engaged = enemies.filter(e => dist(e.gridPos, front) <= 7).reduce((s, u) => s + valueOf(u), 0);

  for (const t of [...profile.doctrineTiers].sort((a, b) => b - a) as (2 | 3)[]) {
    if (tier < t) continue;
    const cost = t === 2 ? config.tier2_cost : config.tier3_cost;
    const wait = t === 2 ? cooldowns.tier2 : cooldowns.tier3;
    // Keep a little in the bank for units.
    if (wait > 0 || cores < cost + 200) continue;
    if (doctrine === 'heavy_metal') {
      if (t === 2 && (mode === 'attack' || mode === 'defend' || mode === 'tech')) return { kind: 'doctrine', tier: 2, target: front };
      if (t === 3 && cluster && cluster.value >= 900 && !army.some(u => dist(u.gridPos, cluster.at) <= 5)) return { kind: 'doctrine', tier: 3, target: cluster.at };
    } else if (doctrine === 'shadow_ops') {
      if (t === 2 && mode === 'attack') return { kind: 'doctrine', tier: 2, target: objective };
      if (t === 3 && engaged >= 900) return { kind: 'doctrine', tier: 3, target: front };
    } else if (doctrine === 'skunkworks') {
      // Nano clouds stop all fire inside them: cover a retreat.
      if (t === 2 && mode === 'retreat' && army.length >= 4) return { kind: 'doctrine', tier: 2, target: front };
      if (t === 3 && (mode === 'attack' || mode === 'defend') && cluster) return { kind: 'doctrine', tier: 3, target: { x: Math.round((cluster.at.x + front.x) / 2), z: Math.round((cluster.at.z + front.z) / 2) } };
    }
  }
  return null;
}

function densestCluster(units: readonly UnitData[], radius: number): { at: GridPos; value: number } | null {
  let best: { at: GridPos; value: number } | null = null;
  for (const u of units) {
    if (u.type === 'defense_drone') continue;
    const value = units.filter(o => o.type !== 'defense_drone' && dist(o.gridPos, u.gridPos) <= radius).reduce((s, o) => s + valueOf(o), 0);
    if (!best || value > best.value) best = { at: { ...u.gridPos }, value };
  }
  return best;
}
