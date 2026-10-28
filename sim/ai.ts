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
import { Economy, researchCost, structureCost, TeamEconomy, unitCost } from './economy';
import { isInsideEnergyGrid } from './energy';
import type { Difficulty } from './match';
import { isOperational, MAX_QUEUE, OrderCommand, popUsed, teamPopCap, teamTier } from './orders';
import { dps, Tier, UNIT_RULES, unitsProducedBy } from './units';
import { abilitiesFor, abilityCooldownLeft, hasBuff } from './unitAbilities';
import { artilleryRange, inArtilleryReach } from './artillery';
import { freePadsFor } from './baseLayout';
import { abilityUnlocked, artilleryTierOf, researchBlocker, UPGRADES, type UpgradeId } from './upgrades';
import { REFINERY, upgradeBlocker } from './refinery';
import { heroBlocker, heroOf, isHeroType } from './heroes';
import { baseMoves, ESCORTS, SCOUT_REPLACE_MS, specialistAbilities, specialistMoves, specialistPick, SPECIALIST_MOVERS } from './aiSpecialists';
import { freshStrategyMemory, lossTypeMix, STRATEGY_PLANS, StrategyMemory, updateStrategy } from './aiStrategy';
import { blendMix, EnemyMix, matchup, typeMix } from './counters';
import { expansionPlan } from './aiExpansion';
import { BASE_SITE } from './bases';

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
  // The capture team members out together taking nodes; empty while it gathers.
  captureGroup: string[];
  // Scout cars last think, and when one was last lost, to wait before replacing it.
  scouts: number;
  scoutLostAt: number;
}

// When each computer player first thinks in a match with two of them. They think on staggered
// timers, half a think apart, rather than on the same tick, and which goes first is picked per
// match: if one always went first it would always act on the fresher picture, a built-in edge
// for one colour.
export function thinkOffsets(firstTeam: Team, thinkMs: number): Record<Team, number> {
  const second = Math.round(thinkMs / 2);
  return firstTeam === 'blue' ? { blue: 0, red: second } : { blue: second, red: 0 };
}

// The wait until a computer player's next think: its profile's interval, give or take up to
// THINK_JITTER of it at random each time. Two players' timers drift past each other through the
// match, so neither stays the one that acts first.
export const THINK_JITTER = 0.1;
export const nextThinkDelay = (thinkMs: number, random: () => number) =>
  Math.round(thinkMs * (1 + THINK_JITTER * (2 * random() - 1)));

export const freshAiMemory = (): AiMemory => ({
  lastOrder: {}, mode: 'gather', objective: null, objectiveId: null, retreatedAt: -Infinity,
  lastBuildAt: -Infinity, lastProductionAt: -Infinity, researchReadySince: null, threatSince: null,
  plan: freshStrategyMemory(), captureGroup: [], scouts: 0, scoutLostAt: -Infinity,
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
const FIGHTERS: UnitType[] = ['trooper', 'lancer', 'razorback', 'tank', 'aegis', 'hornet', 'wasp', 'attack_drone', 'guardian'];
// Infantry: the only units that capture.
const CAPTURERS: UnitType[] = ['trooper', 'ghost', 'lancer'];
const canCapture = (u: UnitData) => CAPTURERS.includes(u.type);
// Infantry that go with the army onto a node it is taking.
const NODE_SQUAD = 2;
// How many of the capture team gather before it sets out on its own.
const CAPTURE_GROUP = 3;
// Enemy fighters this close to the HQ mean the base is under attack: no building until it's clear.
const SIEGE_RADIUS = 12;
// Cores in hand that count as piling up.
const BANKED_CORES = 600;

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
  const scouts = mine.filter(u => u.type === 'scout_car').length;
  if (scouts < (memory.scouts ?? 0)) mem.scoutLostAt = now;
  mem.scouts = scouts;
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
  // Most wanted first: each Command HQ has only six building pads (sim/baseLayout.ts), so what
  // doesn't fit waits for a second HQ.
  const wants: StructureType[] = ['infantry', 'armor'];
  // Air and drone plans want an Airpad at Tier 1 for Kestrel attack drones.
  // A Core Refinery once the first producers are up (sim/refinery.ts), and on Hard a second at Tier 2.
  if (now > 90_000) wants.push('refinery');
  if (tier >= 2 || plan.earlyAirpad) wants.push('air');
  if (tier >= 2 && profile.secondBarracks) wants.push('refinery');
  // The strategy's own extra production structure.
  // Sooner if cores are piling up, as they do for an army of cheap units.
  if (tier >= plan.extra.tier && (now > 4 * 60_000 || cores >= structureCost(plan.extra.type) + 300)) wants.push(plan.extra.type);
  // Advanced Research, for the upgrades of the units it is committed to.
  if (tier >= 2) wants.push('research_lab');
  if (tier >= 2) wants.push('support');
  // A Depot, so the Masons can put up turrets.
  if (tier >= 2 && profile.turrets > 0) wants.push('builder');
  if (tier >= 2) wants.push('ordnance_fab');
  if (profile.secondBarracks && now > 6 * 60_000) wants.push('infantry');
  const counts: Partial<Record<StructureType, number>> = {};
  const nextBuild = wants.find(type => {
    counts[type] = (counts[type] || 0) + 1;
    return have(type) < counts[type]!;
  });
  // Save up for the next structure before spending on units, unless under attack. With enemy
  // fighters in the base it builds nothing: a new structure would only be knocked down half-built.
  // It spends on units from the producers still standing, and rebuilds once the base is clear.
  const besieged = theirs.some(u => isFighter(u) && dist(u.gridPos, home) <= SIEGE_RADIUS);
  let reserve = 0;
  // Only with a pad free for it: with every pad taken it waits for another Command HQ, and keeps
  // spending on units and research rather than hoarding for a building it has nowhere to put.
  const spot = nextBuild ? findBuildSpot(view, team, ctx, nextBuild) : null;
  if (nextBuild && spot && !building && !besieged && now - mem.lastBuildAt >= profile.buildGapMs) {
    const cost = structureCost(nextBuild);
    if (cores >= cost) {
      actions.push({ kind: 'order', command: { type: 'PLACE_STRUCTURE', structureType: nextBuild, at: spot } });
      cores -= cost;
      mem.lastBuildAt = now;
    } else {
      reserve = cost;
    }
  }

  // New bases: whether it wants one, where it could go, and the city block its Bombardment Drones
  // should level when it has nowhere (sim/aiExpansion.ts).
  const padsFull = (freePadsFor('infantry', view.structures, team, ctx.gridSize) ?? []).length === 0;
  const expansion = expansionPlan({
    team, tier, padsFull, maxBases: profile.bases, home, enemyHome, mine, theirs, structures: view.structures, buildings: view.buildings,
  });

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
  // Prefer nodes nearer us than the enemy. Several nodes are the same distance from both bases;
  // ties are broken in the side's own frame (the map is point-symmetric), so the two sides make
  // mirror-image choices rather than both heading for whichever node is listed first.
  const infantry = mine.filter(canCapture).sort((a, b) => a.id.localeCompare(b.id));
  const lean = (b: BuildingData) => Math.round(2 * (dist(posOf(b), home) - 0.5 * dist(posOf(b), enemyHome))) / 2;
  const ownFrame = (b: BuildingData) => (home.x <= enemyHome.x ? b.gridX : ctx.gridSize - 1 - b.gridX);
  const byLean = (a: BuildingData, b: BuildingData) => lean(a) - lean(b) || ownFrame(a) - ownFrame(b);
  const freeCores = coreNodes.filter(b => b.owner === null).sort(byLean);
  const enemyCores = coreNodes.filter(b => b.owner === enemy).sort(byLean);
  // A server node still guarded by its Sentinel is only worth going for with an army that can
  // put it down without being shot to pieces; early on, a handful of Troopers would just die.
  const freeServers = serverNodes.filter(b => b.owner !== team)
    .filter(b => { const guard = sentinelAt(b); return !guard || guardLosses(armyUnits, guard) <= armyValue * GUARD_LOSS_SHARE; })
    .sort(byLean);

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
  // The capture team sets out together: it waits at the gather point until enough of it is there,
  // rather than walking out one Trooper at a time to be picked off. Once out, it keeps going
  // while at least two are left; a lone survivor comes back to wait for the next group.
  let group = (memory.captureGroup ?? []).filter(id => capturerIds.has(id));
  if (group.length < 2) group = [];
  if (group.length === 0) {
    const ready = capturers.filter(u => dist(u.gridPos, gather) <= 5);
    if (ready.length >= Math.min(CAPTURE_GROUP, profile.capturers)) group = ready.map(u => u.id);
  }
  mem.captureGroup = group;
  const setOut = new Set(group);
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
  // Thunderhead range grows with its shell upgrades (sim/upgrades.ts).
  const gunTier = artilleryTierOf(view.economy[team]);
  for (const u of mine) {
    if (u.type === 'howitzer') {
      // Thunderheads trail the army, plant when something is in reach and shell it, and pack up
      // to follow when nothing is left in range.
      const reach = (p: GridPos) => inArtilleryReach(u.gridPos, p, gunTier);
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
      const back = Math.min(away, artilleryRange(gunTier) * 0.6);
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
      send(u, setOut.has(u.id) ? posOf(captureTarget) : gather, true);
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
    sentinels: view.units.filter(u => u.type === 'defense_drone' && alive(u)).map(u => u.gridPos),
  }));
  for (const g of groups.values()) {
    actions.push({ kind: 'order', command: { type: 'MOVE', unitIds: g.ids, target: g.target, attackMove: g.attackMove } });
  }
  if (anchorIds.length > 0) actions.push({ kind: 'ability', command: { type: 'TOGGLE_ANCHOR', unitIds: anchorIds } });
  // Forget orders for units that are gone.
  const living = new Set(mine.map(u => u.id));
  for (const id of Object.keys(mem.lastOrder)) if (!living.has(id)) delete mem.lastOrder[id];

  // --- 4. Production ---
  // With a cleared block ready for a new base (sim/aiExpansion.ts), it saves up for the HQ:
  // production and research only spend what is over the base's price, unless it is under attack.
  const saveForBase = expansion.sites.length > 0 ? { cores: BASE_SITE.cores + 500, compute: BASE_SITE.compute } : { cores: 0, compute: 0 };
  const spendable = () => cores - (threat ? 0 : reserve + saveForBase.cores);
  let pop = popUsed(view.units, view.structures, team);
  const cap = teamPopCap(view.buildings, team);
  // What to counter, by unit type (sim/counters.ts): the enemy army, leaning toward whatever has
  // been killing our units.
  const seen = typeMix(theirs);
  const enemyMix = Object.keys(seen).length > 0 ? seen : OPENING_MIX;
  const killers = lossTypeMix(mem.plan.losses);
  const lostLately = mem.plan.losses.reduce((n, l) => n + l.value, 0);
  const threatMix = Object.keys(killers).length === 0 ? enemyMix : blendMix(enemyMix, killers, 0.5);
  // After real losses, the best answers to what did it are trained whatever the strategy: from
  // whichever structure makes them, even one the strategy hardly uses, and favoured there.
  const producing = new Set(myStructures.filter(isOperational).map(s => s.type));
  const answers = lostLately >= THREAT_LOSSES ? bestCounters(killers, tier, producing, 2) : [];
  const weights: Partial<Record<UnitType, number>> = { ...plan.units };
  for (const a of answers) weights[a] = Math.max(1, weights[a] ?? 1) * ANSWER_BOOST;
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
    if (!isOperational(s) || !unitsProducedBy(s.type).some(t => !isHeroType(t))) continue;
    if ((s.queue?.length || 0) >= Math.min(MAX_QUEUE, profile.queueDepth + (banked ? 1 : 0))) continue;
    // Not every structure gets looked at every time, so production has idle gaps.
    if (ctx.random() > profile.attention) continue;
    // The strategy leans on some structures more than others; Barracks always keep the
    // infantry up.
    // An air force waits on Tier 2 gunships, so it plays a normal mixed army until then.
    const share = plan.techRush && tier < 2 ? 1 : plan.producers[s.type] ?? 1;
    const answersHere = answers.some(a => UNIT_RULES[a].producer === s.type);
    if (share < 1 && !(s.type === 'infantry' && needInfantry) && !answersHere && ctx.random() > share) continue;
    // New units head for the gather point.
    if (!s.rallyPoint || s.rallyPoint.x !== gather.x || s.rallyPoint.z !== gather.z) {
      actions.push({ kind: 'order', command: { type: 'SET_RALLY', structureId: s.id, at: gather } });
    }
    const pick = specialistPick(s.type, {
      tier, mine, structures: myStructures, army: armyUnits.length, needInfantry,
      hard: ctx.difficulty === 'hard', random: ctx.random, strategy: mem.plan.strategy!,
      scoutLostRecently: now - (mem.scoutLostAt ?? -Infinity) < SCOUT_REPLACE_MS,
      levelBlock: !!expansion.level,
    }) ?? chooseUnit(s.type, tier, threatMix, {
      counterAccuracy: profile.counterAccuracy, random: ctx.random,
      needInfantry, guardians, howitzers, army: armyUnits.length, weights,
    });
    if (!pick) continue;
    const cost = unitCost(pick);
    if (cost > spendable() || pop + UNIT_RULES[pick].pop > cap) continue;
    actions.push({ kind: 'order', command: { type: 'TRAIN_UNIT', structureId: s.id, unitType: pick } });
    cores -= cost;
    pop += UNIT_RULES[pick].pop;
  }

  // --- Research: upgrades for the units it fields and its strategy leans on (sim/upgrades.ts) ---
  const fielded = (t: UnitType) => mine.filter(u => u.type === t).length;
  const started = new Set<UpgradeId>();
  let compute = view.economy[team].compute;
  for (const lab of myStructures.filter(s => s.type === 'research_lab' && isOperational(s) && !s.research)) {
    if (ctx.random() > profile.attention) continue;
    const pick = UPGRADES
      .filter(u => !started.has(u.id) && !researchBlocker(view.economy, team, view.structures, u.id, ctx.doctrine))
      // Its doctrine hero's research always interests it.
      .filter(u => u.doctrine || fielded(u.unit) > 0 || (plan.units[u.unit] ?? 1) > 1.2)
      .map(u => ({ u, score: u.doctrine ? 2 : fielded(u.unit) + 3 * ((plan.units[u.unit] ?? 1) - 1) }))
      .sort((a, b) => b.score - a.score)[0];
    // Never at the expense of the army: only with cores to spare. And never at the expense of the
    // next tier: its compute comes first.
    if (!pick || spendable() < pick.u.cost + 150) continue;
    if (compute - pick.u.compute < (tier < 3 ? researchCost((tier + 1) as 2 | 3) : 0) + saveForBase.compute) continue;
    actions.push({ kind: 'order', command: { type: 'RESEARCH_UPGRADE', structureId: lab.id, upgrade: pick.u.id } });
    started.add(pick.u.id);
    cores -= pick.u.cost;
    compute -= pick.u.compute;
  }

  // --- Its doctrine hero, once unlocked, at an idle Advanced Research (sim/heroes.ts) ---
  const hero = heroOf(ctx.doctrine);
  const heroLab = myStructures.find(s => s.type === 'research_lab' && isOperational(s) && !(s.queue?.length));
  if (hero && heroLab && !heroBlocker(hero.unit, team, ctx.doctrine, view.economy[team].upgrades ?? [], view.units, view.structures)
    && spendable() >= unitCost(hero.unit) && pop + UNIT_RULES[hero.unit].pop <= cap) {
    actions.push({ kind: 'order', command: { type: 'TRAIN_UNIT', structureId: heroLab.id, unitType: hero.unit } });
    cores -= unitCost(hero.unit);
    pop += UNIT_RULES[hero.unit].pop;
  }

  // --- Core Refinery upgrades: with cores to spare at Tier 2 (sim/refinery.ts) ---
  for (const r of myStructures.filter(s => s.type === 'refinery')) {
    if (upgradeBlocker(r, team, tier) || spendable() < REFINERY.upgrade.cost + 300) continue;
    actions.push({ kind: 'order', command: { type: 'UPGRADE_REFINERY', structureId: r.id } });
    cores -= REFINERY.upgrade.cost;
  }

  // --- 5. Abilities and doctrine powers ---
  actions.push(...unitAbilityMoves(mine, theirs, view.economy[team], mode, now, profile, ctx.random));
  actions.push(...specialistAbilities({
    team, tier, mode, objective, home, mine, theirs, structures: view.structures, economy: view.economy,
    attention: profile.attention, random: ctx.random, levelAt: expansion.level,
  }));
  // Warheads, turrets and new Command HQs.
  const base = baseMoves({
    team, tier, cores, mine, theirs, structures: view.structures, buildings: view.buildings, economy: view.economy,
    bases: ctx.bases, gather, canBuildOn: ctx.canBuildOn,
    maxTurrets: profile.turrets, gridSize: ctx.gridSize, expansion, send,
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
  mine: readonly UnitData[], theirs: readonly UnitData[], research: TeamEconomy, mode: AiMemory['mode'], now: number,
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
    const defs = abilitiesFor(u.type).filter(d => abilityUnlocked(d, research) && abilityCooldownLeft(u, d.id, now) === 0);
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
        // Tanks: smoke when hurt or swarmed, a piercing slug when there's a column of ground targets in rail range.
        case 'smoke_screen': if (near(u, 6).length > 0 && (u.health < u.maxHealth * 0.6 || near(u, 6).length >= 4)) want(d.id, u); break;
        // Kage: slip under Optical Camo as enemies come near, to strike from it.
        case 'shadow_cloak': if (!hasBuff(u, 'shadow_cloak') && near(u, 7, t => armorOf(t) !== 'air').length > 0) want(d.id, u); break;
        case 'piercing_round': if (!hasBuff(u, 'piercing_round') && near(u, 14, t => armorOf(t) !== 'air').length >= 3) want(d.id, u); break;
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

// What to train next at a structure: whatever does the most damage per core against the
// enemy's mix, with a little health thrown in so it doesn't only build glass cannons.
// Before anything of the enemy's is seen: the usual opening of infantry and light vehicles.
const OPENING_MIX: EnemyMix = { trooper: 0.6, razorback: 0.3, tank: 0.1 };
// Losses (cores' worth, in the strategy's loss window) that make it train the answers to what did it.
const THREAT_LOSSES = 300;
const ANSWER_BOOST = 2;

// The `n` units it can train now that best counter an enemy mix (sim/counters.ts).
export function bestCounters(enemy: EnemyMix, tier: Tier, producing: ReadonlySet<StructureType>, n: number): UnitType[] {
  return FIGHTERS.filter(t => t !== 'guardian' && UNIT_RULES[t].tier <= tier && producing.has(UNIT_RULES[t].producer as StructureType))
    .map(t => ({ t, score: matchup(t, enemy) })).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score).slice(0, n).map(x => x.t);
}

export function chooseUnit(
  producer: StructureType,
  tier: Tier,
  enemyMix: EnemyMix,
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
  // The best counter: kills them and survives them, per core (sim/counters.ts).
  const score = (t: UnitType) => matchup(t, enemyMix) * weight(t);
  const ranked = fighters.sort((a, b) => score(b) - score(a));
  return ranked[0] ?? null;
}

// The share of the army's worth it will accept losing to take out a server node's Sentinel.
const GUARD_LOSS_SHARE = 0.2;

// What the army would lose killing a Sentinel: it focuses one unit at a time while the whole army
// fires back. Infinity if the army can't put it down at all.
export function guardLosses(army: readonly UnitData[], guard: UnitData): number {
  const gun = UNIT_RULES[guard.type].weapon;
  const fighters = army.filter(u => dps(UNIT_RULES[u.type].weapon, 'heavy') > 0 || dps(gun, UNIT_RULES[u.type].armor) > 0)
    .sort((a, b) => valueOf(b) - valueOf(a));
  let hp = guard.health;
  let lost = 0;
  let firing = fighters.reduce((s, u) => s + dps(UNIT_RULES[u.type].weapon, UNIT_RULES[guard.type].armor), 0);
  for (const u of fighters) {
    if (firing <= 0) return Infinity;
    const hurt = dps(gun, UNIT_RULES[u.type].armor);
    const lasts = hurt > 0 ? u.health / hurt : Infinity;
    if (firing * lasts >= hp) return lost;
    hp -= firing * lasts;
    lost += valueOf(u);
    firing -= dps(UNIT_RULES[u.type].weapon, UNIT_RULES[guard.type].armor);
  }
  return Infinity;
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

// A free building pad for the next structure (sim/baseLayout.ts): at the HQ nearest home first,
// inside the grid and buildable.
function findBuildSpot(view: AiView, team: Team, ctx: AiContext, type: StructureType): GridPos | null {
  const home = ctx.bases[team];
  return (freePadsFor(type, view.structures, team, ctx.gridSize) ?? [])
    .filter(p => ctx.canBuildOn(p.x, p.z) && isInsideEnergyGrid(p, team, view.buildings, ctx.bases.blue, ctx.bases.red))
    .sort((a, b) => dist(a, home) - dist(b, home))[0] ?? null;
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
