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
//   2. Sends a capture team of infantry to the nearest free core node, then the next. Only
//      infantry capture, so every push on a node takes infantry along to stand on it, and the
//      vehicles wait for them rather than go in alone.
//   3. Gathers its army at the front of its energy grid and trains units that counter what
//      it sees the enemy fielding.
//   4. When strong enough it takes a server node (for Tier 2 and 3), then enemy core nodes,
//      then the enemy HQ. It pulls back if outmatched, defends its base and nodes, and sends
//      vehicles low on battery home to recharge.
//   5. Alongside the army it fields the specialists a player would (sim/aiSpecialists.ts):
//      scouts, Ghosts, support and EW vehicles, Battery Mules, Swarm Hosts, Bombardment Drones,
//      Ballistas with warheads, turrets from its Masons and, late on, new Command HQs.
//   6. Plays to an army strategy (infantry, armour, air or drones; sim/aiStrategy.ts) picked at
//      the start, and changes it when it keeps losing units to one kind of enemy.

import { ABILITY_CONFIG, DOCTRINE_CONFIG, UNIT_STATS } from '../constants';
import type { BuildingData, DoctrineType, StructureData, StructureType, UnitData, UnitType } from '../types';
import type { AbilityCommand } from './abilities';
import type { GridPos, Team } from './commands';
import { Economy, researchCost, structureCost, unitCost } from './economy';
import { isInsideEnergyGrid } from './energy';
import type { Difficulty } from './match';
import { isOperational, MAX_QUEUE, OrderCommand, popUsed, teamPopCap, teamTier } from './orders';
import { ArmorClass, dps, Tier, UNIT_RULES, unitsProducedBy } from './units';
import { abilitiesFor, abilityCooldownLeft } from './unitAbilities';
import { artilleryRange, inArtilleryReach } from './artillery';
import { baseMoves, ESCORTS, specialistAbilities, specialistMoves, specialistPick, SPECIALIST_MOVERS } from './aiSpecialists';
import { freshStrategyMemory, lossMix, STRATEGY_PLANS, StrategyMemory, updateStrategy } from './aiStrategy';

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
  // Human-like delays (see AiProfile): when it last placed a structure, when it first had the
  // compute for its next tier, and when it first noticed the current threat.
  lastBuildAt: number;
  lastProductionAt: number;
  researchReadySince: number | null;
  threatSince: number | null;
  // The army strategy and the losses that may change it (sim/aiStrategy.ts).
  plan: StrategyMemory;
}

export const freshAiMemory = (): AiMemory => ({
  lastOrder: {}, mode: 'gather', objective: null, objectiveId: null, retreatedAt: -Infinity,
  lastBuildAt: -Infinity, lastProductionAt: -Infinity, researchReadySince: null, threatSince: null,
  plan: freshStrategyMemory(),
});

// How each difficulty plays.
//
// Easier levels are not just slower but less attentive, like a person juggling a base and a
// fight: they don't look at every structure every time, leave gaps between buildings, notice
// threats and spare compute late, and don't always pick the right counter.
export interface AiProfile {
  thinkMs: number;
  // Army value (cores) needed before it leaves home to fight.
  attackValue: number;
  // Earliest it will attack the enemy, and push for a server node.
  firstAttackMs: number;
  firstTechMs: number;
  // Chance of training the best counter to the enemy army, rather than a random unit.
  counterAccuracy: number;
  // How many units it keeps queued per structure.
  queueDepth: number;
  // How often it goes round its production structures to queue units, and then the chance
  // of tending each one. A finished unit leaves its structure idle until the next round.
  productionCycleMs: number;
  attention: number;
  // Minimum time between placing structures.
  buildGapMs: number;
  // How long after having the compute it gets around to researching.
  researchDelayMs: number;
  // How long a threat to its base or nodes must last before the army reacts.
  reactionMs: number;
  doctrineTiers: (2 | 3)[];
  secondBarracks: boolean;
  capturers: number;
  // Sentry Turrets its Masons put up, and Command HQs it will hold.
  turrets: number;
  bases: number;
  // How long it sticks with an army strategy before heavy losses can change it, or null to
  // never change.
  adaptMs: number | null;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    thinkMs: 6000, attackValue: 2600, firstAttackMs: 10 * 60_000, firstTechMs: 7 * 60_000, counterAccuracy: 0,
    queueDepth: 1, productionCycleMs: 30_000, attention: 0.5, buildGapMs: 90_000, researchDelayMs: 60_000, reactionMs: 15_000,
    doctrineTiers: [], secondBarracks: false, capturers: 3, turrets: 0, bases: 1, adaptMs: null,
  },
  normal: {
    thinkMs: 3500, attackValue: 2200, firstAttackMs: 7 * 60_000, firstTechMs: 4 * 60_000, counterAccuracy: 0.55,
    queueDepth: 1, productionCycleMs: 15_000, attention: 0.7, buildGapMs: 45_000, researchDelayMs: 25_000, reactionMs: 6_000,
    doctrineTiers: [2], secondBarracks: false, capturers: 3, turrets: 1, bases: 2, adaptMs: 120_000,
  },
  hard: {
    thinkMs: 1500, attackValue: 1500, firstAttackMs: 3.5 * 60_000, firstTechMs: 2.5 * 60_000, counterAccuracy: 0.9,
    queueDepth: 2, productionCycleMs: 0, attention: 0.95, buildGapMs: 10_000, researchDelayMs: 3_000, reactionMs: 0,
    doctrineTiers: [2, 3], secondBarracks: true, capturers: 4, turrets: 2, bases: 3, adaptMs: 60_000,
  },
};

// The line army. Specialists are in sim/aiSpecialists.ts.
const FIGHTERS: UnitType[] = ['trooper', 'lancer', 'razorback', 'tank', 'aegis', 'hornet', 'wasp', 'guardian'];
// Infantry: the only units that capture.
const CAPTURERS: UnitType[] = ['trooper', 'ghost', 'lancer'];
const canCapture = (u: UnitData) => CAPTURERS.includes(u.type);
// Infantry that go with the army onto a node it is taking.
const NODE_SQUAD = 2;
// Cores in hand that count as piling up.
const BANKED_CORES = 600;
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
  const tier = teamTier(view.economy, team);
  const armyUnits = mine.filter(u => isFighter(u) && u.type !== 'defense_drone');
  const armyValue = armyUnits.reduce((sum, u) => sum + valueOf(u), 0);
  // The army strategy: picked at the start, changed when losses call for it.
  mem.plan = updateStrategy(memory.plan ?? freshStrategyMemory(), {
    nowMs: now, tier, mine, theirs, armyValue, random: ctx.random, commitMs: profile.adaptMs,
  });
  const plan = STRATEGY_PLANS[mem.plan.strategy!];
  // Research the next tier a while after there's compute for it.
  if (tier < 3) {
    const next = (tier + 1) as 2 | 3;
    if (view.economy[team].compute >= researchCost(next)) {
      mem.researchReadySince ??= now;
      if (now - mem.researchReadySince >= profile.researchDelayMs) {
        actions.push({ kind: 'order', command: { type: 'RESEARCH_TIER', tier: next } });
        mem.researchReadySince = null;
      }
    } else {
      mem.researchReadySince = null;
    }
  }
  let cores = view.economy[team].cores;

  // --- 1. Build order ---
  const have = (type: StructureType) => myStructures.filter(s => s.type === type).length;
  const building = myStructures.some(s => (s.buildRemainingMs || 0) > 0);
  const wants: StructureType[] = ['infantry', 'armor'];
  if (tier >= 2) wants.push('air', 'support', 'ordnance_fab');
  // A Depot, so the Masons can put up turrets.
  if (tier >= 2 && profile.turrets > 0) wants.push('builder');
  if (profile.secondBarracks && now > 6 * 60_000) wants.push('infantry');
  // The strategy's own extra production structure.
  // Sooner if cores are piling up, as they do for an army of cheap units.
  if (tier >= plan.extra.tier && (now > 4 * 60_000 || cores >= structureCost(plan.extra.type) + 300)) wants.push(plan.extra.type);
  const counts: Partial<Record<StructureType, number>> = {};
  const nextBuild = wants.find(type => {
    counts[type] = (counts[type] || 0) + 1;
    return have(type) < counts[type]!;
  });
  // Save up for the next structure before spending on units, unless under attack.
  let reserve = 0;
  if (nextBuild && !building && now - mem.lastBuildAt >= profile.buildGapMs) {
    const cost = structureCost(nextBuild);
    const spot = cores >= cost ? findBuildSpot(view, team, ctx) : null;
    if (spot) {
      actions.push({ kind: 'order', command: { type: 'PLACE_STRUCTURE', structureType: nextBuild, at: spot } });
      cores -= cost;
      mem.lastBuildAt = now;
    } else {
      reserve = cost;
    }
  }

  // --- 2. Where the army stands and what it's for ---
  const gather = gatherPoint(view, team, ctx);
  // A threat only counts once it has lasted the profile's reaction time.
  const seenThreat = threatNear(view, team, enemy, home, ctx.difficulty === 'easy' ? 0 : 250);
  if (seenThreat) mem.threatSince ??= now; else mem.threatSince = null;
  const threat = seenThreat && now - (mem.threatSince ?? now) >= profile.reactionMs ? seenThreat : null;
  // Free core nodes (and server nodes once the army can take a Sentinel) to capture.
  const coreNodes = view.buildings.filter(b => b.type === 'core_node' && !b.destroyed);
  const serverNodes = view.buildings.filter(b => b.type === 'server_node' && !b.destroyed);
  const sentinelAt = (b: BuildingData) => view.units.find(u => u.type === 'defense_drone' && alive(u) && dist(u.gridPos, posOf(b)) <= 1.5);
  // Prefer nodes nearer us than the enemy. Several of the contested nodes are the same distance
  // from both bases, so nodes nearer our own infantry break the tie.
  const infantry = mine.filter(canCapture).sort((a, b) => a.id.localeCompare(b.id));
  const infantryAt = infantry.length > 0 ? centroid(infantry.map(u => u.gridPos)) : home;
  const lean = (b: BuildingData) => dist(posOf(b), home) - 0.5 * dist(posOf(b), enemyHome) + 0.1 * dist(posOf(b), infantryAt);
  const freeCores = coreNodes.filter(b => b.owner === null).sort((a, b) => lean(a) - lean(b));
  const enemyCores = coreNodes.filter(b => b.owner === enemy).sort((a, b) => lean(a) - lean(b));
  const freeServers = serverNodes.filter(b => b.owner !== team).sort((a, b) => lean(a) - lean(b));

  // The army's objective, most urgent first.
  const enemyNear = (at: GridPos, r: number) => theirs.filter(u => dist(u.gridPos, at) <= r).reduce((s, u) => s + valueOf(u), 0);
  // Capture team: a few infantry that take free core nodes. With an army to escort them, the
  // army goes to the same node; on their own they skip nodes with enemies about.
  const escorted = armyValue >= 400;
  const captureTarget = (escorted ? freeCores[0] : freeCores.find(b => enemyNear(posOf(b), 8) < 150)) ?? null;
  let mode: AiMemory['mode'] = 'gather';
  let objective: GridPos = gather;
  let objectiveId: string | null = null;
  const canAttack = now >= profile.firstAttackMs && armyValue >= profile.attackValue;
  // Air and drone strategies need Tier 2 for most of their units, so push for compute sooner.
  const canTech = plan.techRush
    ? now >= profile.firstTechMs * 0.75 && armyValue >= profile.attackValue * 0.4
    : now >= profile.firstTechMs && armyValue >= profile.attackValue * 0.6;
  const retreating = now - mem.retreatedAt < 30_000;
  // The only way to win is to destroy every enemy Command HQ: the nearest one still standing.
  const enemyHq = view.structures.filter(s => s.type === 'hq' && s.team === enemy && s.health > 0)
    .sort((a, b) => dist(a.gridPos, home) - dist(b.gridPos, home))[0] ?? null;
  // A big enough army goes for it rather than the enemy's nodes; late on it takes less.
  const hqPush = profile.attackValue * (tier >= 3 || now > 15 * 60_000 ? 1.2 : 1.6);
  const ownCores = coreNodes.filter(b => b.owner === team).length;
  if (threat) {
    mode = 'defend'; objective = threat;
  } else if (!retreating && captureTarget && escorted) {
    // Land first: income and population come from core nodes.
    mode = 'expand'; objective = posOf(captureTarget); objectiveId = captureTarget.id;
  } else if (!retreating && tier < 3 && canTech && freeServers.length > 0 && (ownCores >= 2 || dist(posOf(freeServers[0]), home) < dist(posOf(freeServers[0]), enemyHome))) {
    // Compute: the server node in our own half early, the contested ones once we hold some land.
    mode = 'tech'; objective = posOf(freeServers[0]); objectiveId = freeServers[0].id;
  } else if (!retreating && canAttack && enemyHq && armyValue >= hqPush) {
    mode = 'attack'; objective = enemyHq.gridPos; objectiveId = enemyHq.id;
  } else if (!retreating && canAttack && enemyCores.length > 0) {
    mode = 'attack'; objective = posOf(enemyCores[0]); objectiveId = enemyCores[0].id;
  } else if (!retreating && tier < 3 && canTech && freeServers.length > 0) {
    mode = 'tech'; objective = posOf(freeServers[0]); objectiveId = freeServers[0].id;
  }
  // Outmatched where it's heading: fall back and try again later.
  if (mode !== 'defend' && mode !== 'gather') {
    const front = armyUnits.length > 0 ? centroid(armyUnits.map(u => u.gridPos)) : gather;
    const opposition = enemyNear(objective, 7) + enemyNear(front, 6);
    if (opposition > armyValue * 1.4) {
      mode = 'retreat'; objective = gather; objectiveId = null;
      mem.retreatedAt = now;
    }
  }
  mem.mode = mode; mem.objective = objective; mem.objectiveId = objectiveId;

  // Only infantry capture. When the army is going for a node it takes a squad of infantry along
  // to stand on it, so the capture team gives up members if that leaves the army without. When
  // the army is escorting the capture team's own node, the team simply marches with it as its
  // node squad, so they arrive together.
  const nodeObjective = mode !== 'defend' && mode !== 'retreat' && mode !== 'gather' &&
    view.buildings.some(b => b.id === objectiveId && (b.type === 'core_node' || b.type === 'server_node'));
  const escorting = mode === 'expand' && !!captureTarget && objectiveId === captureTarget.id;
  const teamSize = !captureTarget || escorting ? 0
    : nodeObjective ? Math.min(profile.capturers, Math.max(0, infantry.length - NODE_SQUAD)) : profile.capturers;
  const capturers = infantry.slice(0, teamSize);
  const capturerIds = new Set(capturers.map(u => u.id));
  // The node squad: the army's infantry nearest the objective.
  const nodeSquad = nodeObjective
    ? infantry.filter(u => !capturerIds.has(u.id)).sort((a, b) => dist(a.gridPos, objective) - dist(b.gridPos, objective))
      .slice(0, escorting ? Math.max(NODE_SQUAD, profile.capturers) : NODE_SQUAD)
    : [];
  const squadIds = new Set(nodeSquad.map(u => u.id));
  // No infantry to take the node: the vehicles hold back until some arrive, rather than clear
  // a node nobody can capture.
  const waitingForInfantry = nodeObjective && nodeSquad.length === 0;

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

  const anchorIds: string[] = [];
  for (const u of mine) {
    if (u.type === 'howitzer') {
      // Thunderheads trail the army, plant when something is in reach and shell it, and pack up
      // to follow when nothing is left in range.
      const reach = (p: GridPos) => inArtilleryReach(u.gridPos, p, tier);
      const targets = theirs.some(t => UNIT_RULES[t.type].armor !== 'air' && reach(t.gridPos)) ||
        view.structures.some(s => s.team === enemy && reach(s.gridPos)) ||
        (mode !== 'gather' && mode !== 'retreat' && reach(objective));
      if (targets && mode !== 'retreat') {
        if (!u.isDeployed && u.path.length === 0) anchorIds.push(u.id);
        if (u.isDeployed || u.path.length === 0) continue;
      }
      if (u.isDeployed && mode !== 'retreat' && !pushing) continue;
      // Stand off short of the objective, toward home.
      const away = dist(objective, home) || 1;
      const back = Math.min(away, artilleryRange(tier) * 0.6);
      const standoff = mode === 'gather' || mode === 'retreat' ? objective : {
        x: Math.round(objective.x + ((home.x - objective.x) / away) * back),
        z: Math.round(objective.z + ((home.z - objective.z) / away) * back),
      };
      send(u, standoff, false);
      continue;
    }
    // Specialists move by their own rules (sim/aiSpecialists.ts); support vehicles keep with the army.
    if (SPECIALIST_MOVERS.includes(u.type)) continue;
    if (!FIGHTERS.includes(u.type) && !CAPTURERS.includes(u.type) && !ESCORTS.includes(u.type) && u.type !== 'titan_dropped') continue;
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
    if (!canCapture(u)) {
      // Out of reach on battery, or no infantry yet to take the node: hold at the staging point
      // while infantry move the grid up or come forward.
      send(u, gap > VEHICLE_REACH || (waitingForInfantry && needsGrid(u)) ? staging : objective, true);
    } else if (squadIds.has(u.id) && (gap <= VEHICLE_REACH || !stone)) {
      // The node squad goes onto the node itself, with the vehicles.
      send(u, objective, true);
    } else {
      // Other infantry capture the building that brings the grid closest to the objective, then go on.
      send(u, stone ?? objective, true);
    }
  }
  actions.push(...specialistMoves({
    team, tier, mode, objective, staging, gather, home, mine, theirs, structures: view.structures, buildings: view.buildings,
    bases: ctx.bases, send,
  }));
  for (const g of groups.values()) {
    actions.push({ kind: 'order', command: { type: 'MOVE', unitIds: g.ids, target: g.target, attackMove: g.attackMove } });
  }
  if (anchorIds.length > 0) actions.push({ kind: 'ability', command: { type: 'TOGGLE_ANCHOR', unitIds: anchorIds } });
  // Forget orders for units that are gone.
  const living = new Set(mine.map(u => u.id));
  for (const id of Object.keys(mem.lastOrder)) if (!living.has(id)) delete mem.lastOrder[id];

  // --- 4. Production ---
  const spendable = () => cores - (threat ? 0 : reserve);
  let pop = popUsed(view.units, view.structures, team);
  const cap = teamPopCap(view.buildings, team);
  // What to counter: the enemy army, leaning toward whatever has been killing our units.
  const enemyMix = armorMix(theirs);
  const recent = lossMix(mem.plan.losses);
  const threatMix = Object.keys(recent).length === 0 ? enemyMix
    : Object.fromEntries(ARMORS.map(a => [a, 0.5 * enemyMix[a] + 0.5 * (recent[a] ?? 0)])) as Record<ArmorClass, number>;
  // Enough infantry for the capture team and a node squad, and more for an infantry army.
  const infantryWanted = profile.capturers + NODE_SQUAD + (mem.plan.strategy === 'infantry' ? 3 : 0);
  const needInfantry = infantry.length < infantryWanted;
  const guardians = mine.filter(u => u.type === 'guardian').length;
  const howitzers = mine.filter(u => u.type === 'howitzer').length;
  // Under attack it gets around to production more often.
  // Cores piling up get noticed: it tends production every think and queues deeper until they're spent.
  const banked = cores >= BANKED_CORES;
  const productionRound = banked || now - mem.lastProductionAt >= (threat ? profile.productionCycleMs / 2 : profile.productionCycleMs);
  if (productionRound) mem.lastProductionAt = now;
  for (const s of productionRound ? myStructures : []) {
    if (!isOperational(s) || unitsProducedBy(s.type).length === 0) continue;
    if ((s.queue?.length || 0) >= Math.min(MAX_QUEUE, profile.queueDepth + (banked ? 1 : 0))) continue;
    // Not every structure gets looked at every time, so production has idle gaps.
    if (ctx.random() > profile.attention) continue;
    // The strategy leans on some structures more than others; Barracks always keep the
    // infantry up.
    // Air and drone armies play a normal mixed army until Tier 2 unlocks their units.
    const share = plan.techRush && tier < 2 ? 1 : plan.producers[s.type] ?? 1;
    if (share < 1 && !(s.type === 'infantry' && needInfantry) && ctx.random() > share) continue;
    // New units head for the gather point.
    if (!s.rallyPoint || s.rallyPoint.x !== gather.x || s.rallyPoint.z !== gather.z) {
      actions.push({ kind: 'order', command: { type: 'SET_RALLY', structureId: s.id, at: gather } });
    }
    const pick = specialistPick(s.type, {
      tier, mine, structures: myStructures, army: armyUnits.length, needInfantry,
      hard: ctx.difficulty === 'hard', random: ctx.random, strategy: mem.plan.strategy!,
    }) ?? chooseUnit(s.type, tier, threatMix, {
      counterAccuracy: profile.counterAccuracy, random: ctx.random,
      needInfantry, guardians, howitzers, army: armyUnits.length, weights: plan.units,
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
  actions.push(...unitAbilityMoves(mine, theirs, tier, mode, now, profile, ctx.random));
  actions.push(...specialistAbilities({
    team, tier, mode, objective, home, mine, theirs, structures: view.structures, economy: view.economy,
    attention: profile.attention, random: ctx.random,
  }));
  // Warheads, turrets and new Command HQs.
  const base = baseMoves({
    team, tier, cores, mine, theirs, structures: view.structures, buildings: view.buildings, economy: view.economy,
    bases: ctx.bases, gather, canBuildOn: ctx.canBuildOn, isOpenGround: ctx.isOpenGround,
    maxTurrets: profile.turrets, maxBases: profile.bases,
  });
  actions.push(...base.actions);
  cores -= base.spent;
  const power = ctx.doctrine ? doctrineMove(ctx.doctrine, profile, tier, cores, ctx.doctrineCooldowns, mode, objective, armyUnits, theirs) : null;
  if (power) actions.push(power);

  return { actions, memory: mem };
}

// --- Helpers ---

// When to use the new units' abilities (sim/unitAbilities.ts). Each think, casters of the same
// ability are grouped into one order. Easier levels notice the moment less often.
function unitAbilityMoves(
  mine: readonly UnitData[], theirs: readonly UnitData[], tier: Tier, mode: AiMemory['mode'], now: number,
  profile: AiProfile, random: () => number,
): AiAction[] {
  const near = (u: UnitData, r: number, filter: (t: UnitData) => boolean = () => true) =>
    theirs.filter(t => t.type !== 'defense_drone' && filter(t) && dist(t.gridPos, u.gridPos) <= r);
  const armorOf = (t: UnitData) => UNIT_RULES[t.type].armor;
  const isMachine = (t: UnitData) => armorOf(t) !== 'infantry';
  const groups = new Map<string, string[]>();
  const aimed: AiAction[] = [];
  const want = (ability: string, u: UnitData) => groups.set(ability, [...(groups.get(ability) || []), u.id]);
  for (const u of mine) {
    const defs = abilitiesFor(u.type).filter(d => d.tier <= tier && abilityCooldownLeft(u, d.id, now) === 0);
    if (defs.length === 0 || random() > profile.attention) continue;
    const hurt = u.health < u.maxHealth * 0.5;
    for (const d of defs) {
      switch (d.id) {
        case 'stim': if (near(u, 4).length > 0 && !hurt) want(d.id, u); break;
        case 'nanoweave': if (near(u, 4).length > 0 && u.health < u.maxHealth * 0.75) want(d.id, u); break;
        case 'overcharge': if (near(u, 5, isMachine).length > 0) want(d.id, u); break;
        case 'nitro': if (mode === 'retreat' || (hurt && near(u, 5).length > 0)) want(d.id, u); break;
        case 'overclock': if (near(u, 4).length >= 2) want(d.id, u); break;
        case 'barrage': if (near(u, 6, t => armorOf(t) === 'air').length > 0) want(d.id, u); break;
        case 'radar': if (near(u, 9).length > 0) want(d.id, u); break;
        case 'afterburner': if (hurt && near(u, 6).length > 0) want(d.id, u); break;
        case 'emp_rocket':
        case 'hellfire': {
          // Aim at the enemy unit with the most valid victims around it, if that's worth a shot.
          const victims = (t: UnitData) => d.id === 'emp_rocket' ? isMachine(t) : armorOf(t) !== 'air';
          let best: { at: GridPos; count: number } | null = null;
          // The EMP rocket reaches 14 tiles, but the AI only aims at what a Lancer would see.
          const reach = d.id === 'emp_rocket' ? Math.min(d.targeted!.range, 7) : d.targeted!.range;
          for (const t of near(u, reach, victims)) {
            const count = theirs.filter(o => victims(o) && dist(o.gridPos, t.gridPos) <= d.targeted!.radius).length;
            if (!best || count > best.count) best = { at: { ...t.gridPos }, count };
          }
          if (best && best.count >= 2) aimed.push({ kind: 'ability', command: { type: 'UNIT_ABILITY', unitIds: [u.id], ability: d.id, target: best.at } });
          break;
        }
      }
    }
  }
  return [...[...groups].map(([ability, unitIds]): AiAction => ({ kind: 'ability', command: { type: 'UNIT_ABILITY', unitIds, ability } })), ...aimed];
}

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
  opts: {
    counterAccuracy: number; random: () => number; needInfantry: boolean; guardians: number; army: number; howitzers?: number;
    // How much the army strategy favours each unit (sim/aiStrategy.ts).
    weights?: Partial<Record<UnitType, number>>;
  },
): UnitType | null {
  const options = unitsProducedBy(producer).filter(t => FIGHTERS.includes(t) && UNIT_RULES[t].tier <= tier);
  if (options.length === 0) return null;
  if (producer === 'infantry' && opts.needInfantry) return 'trooper';
  if (producer === 'support') return opts.guardians < Math.floor(opts.army / 8) ? 'guardian' : null;
  // A Thunderhead for every six or so in the army, once there's an army to screen it.
  if (producer === 'armor' && (opts.howitzers ?? 0) < Math.floor(opts.army / 6) && opts.random() < 0.5) return 'howitzer';
  const fighters = options.filter(t => t !== 'guardian');
  const weight = (t: UnitType) => opts.weights?.[t] ?? 1;
  if (opts.random() >= opts.counterAccuracy) {
    // Not the best counter: a pick weighted toward the strategy's units.
    const total = fighters.reduce((s, t) => s + weight(t), 0);
    let roll = opts.random() * total;
    for (const t of fighters) if ((roll -= weight(t)) < 0) return t;
    return fighters[fighters.length - 1] ?? null;
  }
  const score = (t: UnitType) => {
    const rules = UNIT_RULES[t];
    let damage = 0;
    for (const a of ARMORS) damage += enemyMix[a] * dps(rules.weapon, a);
    return (damage * Math.sqrt(UNIT_STATS[t].maxHealth) * weight(t)) / unitCost(t);
  };
  const ranked = fighters.sort((a, b) => score(b) - score(a));
  return ranked[0] ?? null;
}

// The tile the army waits on: the edge of our grid nearest the enemy.
export function gatherPoint(view: AiView, team: Team, ctx: AiContext): GridPos {
  const enemyHome = ctx.bases[team === 'blue' ? 'red' : 'blue'];
  const home = ctx.bases[team];
  // Anchor on ground it actually holds: buildings near its base or its nodes, not ones a stray
  // squad captured deep in enemy territory, or new units would trickle out there one by one.
  const held = [home, ...view.buildings.filter(b => b.owner === team && !b.destroyed && (b.type === 'core_node' || b.type === 'server_node')).map(posOf)];
  const anchors: GridPos[] = [home, ...view.buildings
    .filter(b => b.owner === team && !b.destroyed && b.type !== 'core_node' && held.some(h => dist(posOf(b), h) <= HELD_GROUND))
    .map(posOf)];
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

// How far from its base or one of its nodes a captured building counts as ground it holds.
const HELD_GROUND = 12;

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
      // Bulwark Force Field over its own army once it is locked in a real fight.
      if (t === 3 && army.length >= 4 && engaged >= 600 && (mode === 'attack' || mode === 'defend')) return { kind: 'doctrine', tier: 3, target: front };
    } else if (doctrine === 'shadow_ops') {
      if (t === 2 && mode === 'attack') return { kind: 'doctrine', tier: 2, target: objective };
      // Cloaking Field over the army as it moves in, before the shooting gives it away.
      if (t === 3 && army.length >= 4 && (mode === 'attack' || mode === 'defend')) return { kind: 'doctrine', tier: 3, target: front };
    } else if (doctrine === 'netrunner') {
      // Nano clouds stop all fire inside them: cover a retreat.
      if (t === 2 && mode === 'retreat' && army.length >= 4) return { kind: 'doctrine', tier: 2, target: front };
      // Black Wall Infect into the thick of the enemy, where the virus has the most friends to jump to.
      if (t === 3 && (mode === 'attack' || mode === 'defend') && cluster && cluster.value >= 500) return { kind: 'doctrine', tier: 3, target: cluster.at };
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
