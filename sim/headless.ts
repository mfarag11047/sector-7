// A whole match without the browser: the map, both armies, the economy, production, orders,
// movement, combat, capture, the energy grid and victory, on the same rules as CityMap.
//
// Used to run computer-vs-computer matches in tests (sim/ai.test.ts) and for balance work.
// It is also a first draft of the authoritative game server: everything here runs on the
// sim/ modules alone, including warhead production and Ballista loading. Not yet included: projectiles and unit abilities other than Titan
// smoke, clouds, doctrine powers other than Orbital Drop, Masons and walls, and breaching.

import { CITY_CONFIG, STRUCTURE_INFO, TEAM_BASES } from '../constants';
import type { BuildingData, DoctrineType, RoadType, StructureData, UnitData } from '../types';
import { abilityEffects, applyUnitEffects } from './abilities';
import { AiMemory, AI_PROFILES, aiThink, freshAiMemory, nextThinkDelay, thinkOffsets } from './ai';
import { afterRailShot, fireRailguns } from './railgun';
import { fireHornetRockets, landSalvo, MiniRocket } from './hornet';
import { fireGrenades } from './heavyMetalHero';
import { fireFlechettes, regenerateShield, shieldedHit } from './kestrel';
import { markScreened, pruneSmoke, SmokeScreen } from './titan';
import { armMules, dueCharges, VoltCharge, voltBlasts } from './voltCore';
import { advanceRefineryUpgrades } from './refinery';
import { advanceDismantling } from './dismantle';
import { addUpgrades, advanceResearch, applyResearch, applyUpgradeBonuses, artilleryTierOf, hasUpgrade } from './upgrades';
import { EmpRocket, empRocketImpact, empRocketTick, mergeUnitUpdates } from './empRocket';
import { ArtilleryShell, fireArtillery, landShells, shellGroundPos } from './artillery';
import { clearedBlocks, rubbleCleared } from './bases';
import { captureTick } from './capture';
import { applyCiwsState, ciwsTick, ORDNANCE_INTEGRITY } from './ciws';
import type { GridPos, Team } from './commands';
import { applyStructureCombat, resolveAttacks } from './combat';
import { addWarheads, advanceWarheadProduction, createEconomy, Economy, payIncome, productionStep, refund } from './economy';
import { chargeSources, isInsideEnergyGrid, powerTick } from './energy';
import { generateCity, seededRandom } from './mapgen';
import { Difficulty, MatchConfig, startingRoster } from './match';
import { advanceMover, arriveAtNextTile, MovementEnv, MOVE_TICK_MS } from './movement';
import { applyOrderToStructures, applyOrderToUnits, OrderCommand, orderEffects, OrdersContext } from './orders';
import { advanceProduction, applyProduction, createUnit } from './production';
import { ballistaLoadStep, repairTick } from './support';
import { isAirType } from './units';
import { airPath, fastestPath, sentinelHazardOf } from './pathfinding';
import { hasBuff, spendOvercharge } from './unitAbilities';
import { applyFieldCloak, fieldCloakedIds } from './cloak';
import { kageCharges } from './shadowHero';
import { checkVictory, Victory } from './victory';
import { DOCTRINE_CONFIG } from '../constants';
import { jammingUpdates } from './jamming';
import { heliosBeams, microwaveDamage } from './helios';
import { freshPacing, pacingTick, PacingRecord, recordStrategies, recordVictory, recordWeaponHits } from './pacing';

export interface HeadlessOptions {
  seed: number;
  difficulty: Record<Team, Difficulty>;
  doctrine: Record<Team, DoctrineType | null>;
  // Income multiplier per side (the AI difficulty bonus in a real match).
  income?: Partial<Record<Team, number>>;
  startingCores?: number;
  // Which computer player thinks first (sim/ai.ts thinkOffsets); by default picked from the seed.
  firstThinker?: Team;
}

export interface HeadlessMatch {
  opts: HeadlessOptions;
  now: number;
  units: UnitData[];
  structures: StructureData[];
  buildings: BuildingData[];
  economy: Economy;
  memory: Record<Team, AiMemory>;
  nextThink: Record<Team, number>;
  // Varies each think interval a little (sim/ai.ts nextThinkDelay), apart from the match's own dice.
  thinkRandom: () => number;
  doctrineReadyAt: Record<Team, { tier2: number; tier3: number }>;
  victory: Victory | null;
  // Milestones and unit stats for the pacing report (sim/pacing.ts).
  pacing: PacingRecord;
  // How much of each side's strategy log the pacing report has.
  strategiesLogged: Record<Team, number>;
  lastShot: Map<string, number>;
  // Thunderhead shells in the air.
  shells: ArtilleryShell[];
  // Fire each shell has taken from Aegis cannons.
  shellHits: Map<string, number>;
  // Lancer EMP rockets in flight.
  rockets: EmpRocket[];
  // Hornet Hellfire Salvo rockets in flight.
  salvo: MiniRocket[];
  // Tank Smoke Screens on the ground (sim/titan.ts).
  smoke: SmokeScreen[];
  // Battery Mule Volt Cores counting down (sim/voltCore.ts).
  volt: VoltCharge[];
  nextId: number;
  // Seeded, so the same options always play out the same match.
  random: () => number;
  // Static map data.
  gridSize: number;
  roads: Set<string>;
  tileType: Record<string, string>;
  log: string[];
}

const key = (x: number, z: number) => `${x},${z}`;

export function createHeadlessMatch(opts: HeadlessOptions): HeadlessMatch {
  const { gridSize, tileSize } = CITY_CONFIG;
  const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
  const config: MatchConfig = { mode: 'ai', seed: opts.seed, playerTeam: 'blue', difficulty: 'normal', playerDoctrine: null, aiDoctrine: null };
  const hq = (team: Team): StructureData => ({
    id: `hq-${team}`, type: 'hq', team, gridPos: { ...TEAM_BASES[team] }, isBlueprint: false, constructionProgress: 0,
    maxProgress: 0, health: STRUCTURE_INFO.hq.maxHealth, maxHealth: STRUCTURE_INFO.hq.maxHealth,
  });
  return {
    opts, now: 0,
    units: [...startingRoster(config, gridSize, TEAM_BASES.blue), ...city.sentinels],
    structures: [hq('blue'), hq('red')],
    buildings: city.buildings,
    economy: createEconomy(opts.startingCores ?? 1000),
    memory: { blue: freshAiMemory(), red: freshAiMemory() },
    nextThink: thinkOffsets(opts.firstThinker ?? (seededRandom(opts.seed ^ 0xf1257)() < 0.5 ? 'blue' : 'red'),
      Math.min(AI_PROFILES[opts.difficulty.blue].thinkMs, AI_PROFILES[opts.difficulty.red].thinkMs)),
    doctrineReadyAt: { blue: { tier2: 0, tier3: 0 }, red: { tier2: 0, tier3: 0 } },
    victory: null,
    pacing: freshPacing(),
    strategiesLogged: { blue: 0, red: 0 },
    lastShot: new Map(),
    shells: [],
    shellHits: new Map(),
    rockets: [],
    salvo: [],
    smoke: [],
    volt: [],
    nextId: 0,
    random: seededRandom(opts.seed ^ 0x5eed),
    thinkRandom: seededRandom(opts.seed ^ 0x7a1c),
    gridSize,
    roads: new Set([...city.roadTileSet]),
    tileType: city.tileTypeMap,
    log: [],
  };
}

// --- Pathing on the current map (roads minus structures and the HQ pads) ---

function blockedTiles(m: HeadlessMatch): Set<string> {
  const blocked = new Set<string>();
  for (const s of m.structures) blocked.add(key(s.gridPos.x, s.gridPos.z));
  return blocked;
}

function pathfinder(m: HeadlessMatch) {
  const blocked = blockedTiles(m);
  const walkable = (x: number, z: number) => x >= 0 && z >= 0 && x < m.gridSize && z < m.gridSize && m.roads.has(key(x, z)) && !blocked.has(key(x, z));
  const hazard = sentinelHazardOf(m.units);
  return {
    walkable,
    findPath: (from: GridPos, to: GridPos) => fastestPath(from, to, m.gridSize, walkable, (x, z) => m.tileType[key(x, z)] as RoadType | undefined, hazard),
    findAirPath: (from: GridPos, to: GridPos) => airPath(from, to),
  };
}

// --- One tick ---

export function stepMatch(m: HeadlessMatch): void {
  const now = (m.now += MOVE_TICK_MS);
  const paths = pathfinder(m);
  const bases = { blue: TEAM_BASES.blue, red: TEAM_BASES.red };

  // Banshee jamming: mark who can't take orders before anyone sends any (sim/jamming.ts).
  const jam = jammingUpdates(m.units);
  if (jam.size > 0) m.units = m.units.map(u => jam.get(u.id)?.(u) ?? u);

  // Computer players think and send their commands through the normal checks.
  for (const team of ['blue', 'red'] as const) {
    if (now < m.nextThink[team]) continue;
    m.nextThink[team] = now + nextThinkDelay(AI_PROFILES[m.opts.difficulty[team]].thinkMs, m.thinkRandom);
    think(m, team, paths, bases);
  }

  // Movement.
  const env: MovementEnv = {
    tileSize: CITY_CONFIG.tileSize,
    tileTypeOf: k => m.tileType[k] as never,
    arrive: u => arriveAtNextTile(u, {
      isWalkable: (x, z) => isAirType(u.type as never) || paths.walkable(x, z),
      reroute: (from, path) => {
        if (path.length === 0) return [];
        const [gx, gz] = path[path.length - 1].split(',').map(Number);
        return paths.findPath(from, { x: gx, z: gz });
      },
      now,
    }),
  };
  m.units = m.units.map(u => advanceMover(u, MOVE_TICK_MS, env));
  // Kage's Optical Camo hides him (sim/cloak.ts; Cloaking Fields aren't modelled here).
  m.units = applyFieldCloak(m.units, fieldCloakedIds(m.units, now));

  // Combat.
  const reloaded = <T extends { id: string; lastAttackTime?: number }>(x: T): T => {
    const shot = m.lastShot.get(x.id);
    return shot && shot > (x.lastAttackTime || 0) ? { ...x, lastAttackTime: shot } : x;
  };
  // Units in a friendly Smoke Screen are screened this tick (sim/titan.ts).
  m.smoke = pruneSmoke(m.smoke, now);
  m.units = markScreened(m.units, m.smoke, now);
  const attacks = resolveAttacks(m.units.map(reloaded), m.structures.map(reloaded) as never, now, () => false);
  attacks.fired.forEach((_, id) => m.lastShot.set(id, now));
  m.structures = applyStructureCombat(m.structures, attacks, now);
  // Artillery: new shells go up, and the ones whose flight is over come down.
  const volley = fireArtillery(m.units.map(reloaded), m.structures, now, team => (team === 'neutral' ? 1 : artilleryTierOf(m.economy[team])), m.random, () => `shell-${++m.nextId}`);
  volley.fired.forEach((_, id) => { m.lastShot.set(id, now); attacks.fired.set(id, ''); });
  // Tank rail guns: long-range shots at what the side can see.
  const rail = fireRailguns(m.units, m.structures, now, undefined, undefined, paths.walkable);
  const railFired = new Set(rail.shots.map(s => s.attackerId));
  if (railFired.size > 0) m.units = m.units.map(u => railFired.has(u.id) ? afterRailShot(u, now) : u);
  rail.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  if (rail.structureDamage.size > 0) m.structures = applyStructureCombat(m.structures, { structureDamage: rail.structureDamage, fired: new Map(), aiming: new Map() }, now);
  // Hornet rockets: the Tier 3 anti-vehicle rocket, and Hellfire Salvo rockets coming down.
  const hornets = fireHornetRockets(m.units, m.structures, now, team => team !== 'neutral' && hasUpgrade(m.economy[team], 'hunter_rockets'));
  const hornetFired = new Set(hornets.shots.map(s => s.attackerId));
  if (hornetFired.size > 0) m.units = m.units.map(u => hornetFired.has(u.id) ? { ...u, hornetRocketAt: now } : u);
  // Kestrel Flechette Bursts alongside their machine guns (sim/kestrel.ts).
  const flechettes = fireFlechettes(m.units, now, team => (team === 'blue' || team === 'red') && hasUpgrade(m.economy[team], 'flechette_burst'));
  const burst = new Set(flechettes.shots.map(s => s.attackerId));
  if (burst.size > 0) m.units = m.units.map(u => burst.has(u.id) ? { ...u, flechetteAt: now } : u);
  flechettes.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  // Goliath's grenade volleys go up, and land with the salvo rockets (sim/heavyMetalHero.ts).
  const lobbed = fireGrenades(m.units, m.structures, now);
  if (lobbed.fired.size > 0) {
    m.units = m.units.map(u => lobbed.fired.has(u.id) ? { ...u, grenadeAt: now } : u);
    m.salvo.push(...lobbed.grenades);
  }
  // Volt Cores whose countdown is over detonate (sim/voltCore.ts).
  const due = dueCharges(m.volt, now);
  const volt = voltBlasts(m.units, due);
  if (due.length > 0) {
    m.volt = m.volt.filter(c => !due.includes(c));
    volt.damage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  }
  const salvo = landSalvo(m.salvo, now, m.units, m.structures);
  m.salvo = salvo.flying;
  for (const map of [hornets.unitDamage, salvo.unitDamage]) map.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  for (const map of [hornets.structureDamage, salvo.structureDamage]) {
    if (map.size > 0) m.structures = applyStructureCombat(m.structures, { structureDamage: map, fired: new Map(), aiming: new Map() }, now);
  }
  // Aegis rotary cannons: aircraft, and Thunderhead shells (the only ordnance flown here).
  const ciws = ciwsTick(m.units, m.shells.map(s => ({ id: s.id, team: s.team, at: shellGroundPos(s, now), kind: 'shell' as const })), now, MOVE_TICK_MS, m.structures);
  m.structures = applyCiwsState(m.structures, ciws.structureUpdates);
  ciws.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  ciws.ordnanceDamage.forEach((n, id) => m.shellHits.set(id, (m.shellHits.get(id) || 0) + n));
  m.shells = m.shells.filter(s => (m.shellHits.get(s.id) || 0) < ORDNANCE_INTEGRITY.shell);
  m.units = applyCiwsState(m.units, ciws.updates);
  const impact = landShells([...m.shells, ...volley.shells], now, m.units, m.structures);
  m.shells = impact.flying;
  impact.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  // Lancer EMP rockets: the ones that arrive go off.
  if (m.rockets.length > 0) {
    const flight = empRocketTick(m.rockets, m.units, now, MOVE_TICK_MS);
    m.rockets = flight.flying;
    const pulse = new Map<string, (u: UnitData) => UnitData>();
    for (const { rocket, at } of flight.detonated) mergeUnitUpdates(pulse, empRocketImpact(m.units, at, rocket.team, now));
    if (pulse.size > 0) m.units = m.units.map(u => pulse.get(u.id)?.(u) ?? u);
  }
  if (impact.structureDamage.size > 0) m.structures = applyStructureCombat(m.structures, { structureDamage: impact.structureDamage, fired: new Map(), aiming: new Map() }, now);
  // Who hit whom, for the pacing report's damage tally.
  recordWeaponHits(m.pacing, {
    fired: attacks.fired, shots: [...(attacks.splashed ?? []), ...rail.shots, ...rail.pierceHits, ...hornets.shots, ...flechettes.shots, ...volt.hits], ciws: ciws.links,
    blasts: [
      ...impact.landed.map(s => ({ attackerId: s.attackerId, team: s.team, at: s.at, radius: 2 })),
      ...salvo.landed.map(s => ({ attackerId: s.attackerId, team: s.team, at: s.at, radius: 2 })),
    ],
    beams: heliosBeams(m.units),
  }, m.units, m.structures);

  // Capture.
  m.buildings = captureTick(m.buildings, m.units);

  // Production.
  const build = advanceProduction(m.structures, team => m.opts.doctrine[team]);
  m.structures = applyProduction(m.structures, build);
  // Ordnance Fabs finish warheads into the stockpile.
  const fab = advanceWarheadProduction(m.structures, team => m.opts.doctrine[team]);
  if (fab.updates.size > 0) m.structures = m.structures.map(s => fab.updates.has(s.id) ? { ...s, production: fab.updates.get(s.id) } : s);
  for (const { team, warhead } of fab.finished) m.economy = addWarheads(m.economy, team, warhead);
  // Advanced Research finishes upgrades for its side (sim/upgrades.ts).
  const lab = advanceResearch(m.structures, team => productionStep(team === 'blue' || team === 'red' ? m.opts.doctrine[team] : null));
  m.structures = applyResearch(m.structures, lab);
  m.economy = addUpgrades(m.economy, lab.finished);
  // Buildings being taken down (sim/dismantle.ts).
  const teardown = advanceDismantling(m.structures, productionStep(null));
  m.structures = teardown.structures;
  for (const d of teardown.done) m.economy = refund(m.economy, d.team, d.refund);
  // Core Refinery upgrades (sim/refinery.ts).
  m.structures = advanceRefineryUpgrades(m.structures, team => productionStep(team === 'blue' || team === 'red' ? m.opts.doctrine[team] : null)).structures;
  for (const { structure, unitType } of build.trained) {
    const taken = new Set(m.units.map(u => key(u.gridPos.x, u.gridPos.z)));
    let spawn = { ...structure.gridPos };
    search: for (let r = 1; r <= 3; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = structure.gridPos.x + dx;
        const z = structure.gridPos.z + dz;
        if (paths.walkable(x, z) && !taken.has(key(x, z))) { spawn = { x, z }; break search; }
      }
    }
    const unit = createUnit(unitType, structure.team, `h-${++m.nextId}`, spawn);
    if (structure.rallyPoint) unit.path = isAirType(unitType) ? paths.findAirPath(spawn, structure.rallyPoint) : paths.findPath(spawn, structure.rallyPoint);
    m.units.push(unit);
  }
  // Researched upgrades add health and damage to their units, new ones included.
  m.units = applyUpgradeBonuses(m.units, m.economy);

  // Damage, repair and batteries.
  const power = chargeSources(m.units);
  const repair = repairTick(m.units, MOVE_TICK_MS, bases, team => (team === 'blue' || team === 'red') ? m.opts.doctrine[team] : null, team => m.economy[team].tier, now);
  const helios = m.units.filter(u => u.type === 'helios');
  // Helios in Microwave mode cook the enemies around them (sim/helios.ts).
  const microwave = microwaveDamage(m.units, MOVE_TICK_MS);
  const living = m.units;
  m.units = m.units.map(u => {
    const draft: UnitData = { ...u };
    const aim = attacks.aiming.get(u.id) ?? null;
    if (attacks.aiming.has(u.id) || u.combatTargetId) draft.combatTargetId = aim;
    if (volley.fired.has(u.id)) draft.artilleryAim = volley.fired.get(u.id);
    if (attacks.fired.has(u.id)) {
      draft.lastAttackTime = now;
      Object.assign(draft, spendOvercharge(draft));
    }
    if (draft.buffs?.length) draft.buffs = draft.buffs.filter(b => b.until > now);
    const hit = (attacks.unitDamage.get(u.id) || 0) + (microwave.get(u.id) || 0);
    if (hit > 0) draft.lastDamageTime = now;
    // A Kestrel's Regenerative Shield soaks hits first, and recharges when left alone.
    Object.assign(draft, shieldedHit(draft, hit));
    if (draft.type === 'attack_drone' && (draft.team === 'blue' || draft.team === 'red')) {
      Object.assign(draft, regenerateShield(draft, now, MOVE_TICK_MS, hasUpgrade(m.economy[draft.team], 'regen_shield')));
    }
    const heal = repair.heal.get(u.id) || 0;
    if (heal > 0 && draft.health > 0) draft.health = Math.min(draft.maxHealth, draft.health + heal);
    if (draft.health > 0) {
      ballistaLoadStep(u, draft, MOVE_TICK_MS);
      powerTick(u, draft, {
        units: living, sources: power, helios, inNanoCloud: false,
        onGrid: isInsideEnergyGrid(u.gridPos, u.team, m.buildings, bases.blue, bases.red),
      });
    }
    return draft;
  });
  // A Battery Mule with the Volt Core goes critical where it dies (sim/voltCore.ts).
  m.volt.push(...armMules(m.units, team => hasUpgrade(m.economy[team], 'volt_core'), now));
  m.units = m.units.filter(u => u.health > 0);

  // Once a second: income and victory.
  if (now % 1000 === 0) {
    m.economy = payIncome(m.economy, m.buildings, m.opts.income ?? {}, m.structures);
    const victory = checkVictory(m.structures);
    if (victory && !m.victory) {
      m.victory = victory;
      recordVictory(m.pacing, victory.winner);
    }
  }
  pacingTick(m.pacing, now, { units: m.units, structures: m.structures, buildings: m.buildings, economy: m.economy });
}

function think(m: HeadlessMatch, team: Team, paths: ReturnType<typeof pathfinder>, bases: Record<Team, GridPos>) {
  const cleared = clearedBlocks(m.buildings);
  const ctx: OrdersContext = {
    gridSize: m.gridSize, bases, isWalkable: paths.walkable, findPath: paths.findPath, findAirPath: paths.findAirPath,
    newId: prefix => `${prefix}-h${++m.nextId}`,
    canBuildOn: (x, z) => {
      if (Math.abs(x - bases.blue.x) <= 1 && Math.abs(z - bases.blue.z) <= 1) return false;
      if (Math.abs(x - bases.red.x) <= 1 && Math.abs(z - bases.red.z) <= 1) return false;
      if (m.structures.some(s => s.gridPos.x === x && s.gridPos.z === z)) return false;
      // Rubble on a cleared block is gone: a new base's pads are free ground.
      if (m.buildings.some(b => b.gridX === x && b.gridZ === z && !rubbleCleared(b, cleared))) return false;
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => paths.walkable(x + dx, z + dz));
    },
  };
  const readyAt = m.doctrineReadyAt[team];
  const { actions, memory } = aiThink(
    { units: m.units, structures: m.structures, buildings: m.buildings, economy: m.economy, elapsedMs: m.now },
    team, m.memory[team],
    {
      gridSize: m.gridSize, bases, difficulty: m.opts.difficulty[team], doctrine: m.opts.doctrine[team],
      canBuildOn: ctx.canBuildOn,
      isOpenGround: (x, z) => m.tileType[key(x, z)] === 'open',
      isWalkable: paths.walkable,
      doctrineCooldowns: { tier2: Math.max(0, readyAt.tier2 - m.now), tier3: Math.max(0, readyAt.tier3 - m.now) },
      random: m.random,
    },
  );
  m.memory[team] = memory;
  m.strategiesLogged[team] = recordStrategies(m.pacing, team, memory.plan.log, m.strategiesLogged[team]);
  for (const action of actions) {
    if (action.kind === 'order') applyOrder(m, team, action.command, ctx);
    else if (action.kind === 'ability') {
      const outcome = abilityEffects({ units: m.units, structures: m.structures, economy: m.economy }, team, action.command, {
        now: m.now, offset: 0, tileSize: CITY_CONFIG.tileSize, isWalkable: paths.walkable, findPath: paths.findPath, findAirPath: paths.findAirPath,
        findAdjacentSpawn: c => c, createCrawler: (h, at, s) => createUnit('crawler_drone', h.team, `c-${s}`, at), random: m.random,
        newId: prefix => `${prefix}-h${++m.nextId}`,
      });
      if (!('reason' in outcome)) {
        m.units = applyUnitEffects(m.units, outcome.effects);
        if (outcome.effects.rockets) m.rockets.push(...outcome.effects.rockets);
        if (outcome.effects.salvo) m.salvo.push(...outcome.effects.salvo);
        if (outcome.effects.smoke) m.smoke.push(...outcome.effects.smoke);
        if (outcome.effects.economy) m.economy = outcome.effects.economy(m.economy) ?? m.economy;
      }
    } else if (action.kind === 'doctrine') {
      // Only Orbital Drop is modelled here: a Titan lands at the target.
      const doctrine = m.opts.doctrine[team];
      if (doctrine !== 'heavy_metal' || action.tier !== 2) continue;
      const cfg = DOCTRINE_CONFIG[doctrine];
      if (readyAt.tier2 > m.now || m.economy[team].cores < cfg.tier2_cost) continue;
      m.economy = { ...m.economy, [team]: { ...m.economy[team], cores: m.economy[team].cores - cfg.tier2_cost } };
      readyAt.tier2 = m.now + cfg.tier2_cooldown;
      const titan = createUnit('titan_dropped', team, `drop-${++m.nextId}`, action.target);
      m.units.push(titan);
      m.log.push(`${Math.round(m.now / 1000)}s ${team} orbital drop`);
    }
  }
  // Kage charges what he sees with his blade (sim/shadowHero.ts).
  for (const c of kageCharges(m.units)) {
    if (c.team === team) applyOrder(m, team, { type: 'MOVE', unitIds: [c.unitId], target: c.target, attackMove: true }, ctx);
  }
}

function applyOrder(m: HeadlessMatch, team: Team, command: OrderCommand, ctx: OrdersContext) {
  const outcome = orderEffects({ units: m.units, structures: m.structures, buildings: m.buildings, economy: m.economy, doctrines: m.opts.doctrine }, team, command, ctx);
  if ('reason' in outcome) return;
  const fx = outcome.effects;
  m.units = applyOrderToUnits(m.units, fx);
  m.structures = applyOrderToStructures(m.structures, fx);
  if (fx.economy) m.economy = fx.economy(m.economy) ?? m.economy;
  if (command.type === 'PLACE_STRUCTURE') m.log.push(`${Math.round(m.now / 1000)}s ${team} builds ${command.structureType}`);
}

// A short summary line: time, cores, nodes held, army size and structures, per side.
export function describe(m: HeadlessMatch): string {
  const side = (team: Team) => {
    const units = m.units.filter(u => u.team === team);
    const kinds = new Map<string, number>();
    for (const u of units) kinds.set(u.type, (kinds.get(u.type) || 0) + 1);
    const cores = m.buildings.filter(b => b.owner === team && b.type === 'core_node').length;
    const servers = m.buildings.filter(b => b.owner === team && b.type === 'server_node').length;
    const grid = m.buildings.filter(b => b.owner === team && b.type !== 'core_node' && b.type !== 'server_node').length;
    const hq = m.structures.find(s => s.id === `hq-${team}`)?.health ?? 0;
    return `${team}: $${Math.round(m.economy[team].cores)} core${cores} srv${servers} grid${grid} hq${Math.round(hq)} [${[...kinds].map(([k, v]) => `${k}${v}`).join(' ')}] ${m.memory[team].mode}`;
  };
  return `${Math.floor(m.now / 60000)}:${String(Math.floor(m.now / 1000) % 60).padStart(2, '0')} | ${side('blue')} | ${side('red')}`;
}

export function runMatch(opts: HeadlessOptions, maxMinutes = 30, onMinute?: (m: HeadlessMatch) => void): HeadlessMatch {
  const m = createHeadlessMatch(opts);
  while (!m.victory && m.now < maxMinutes * 60_000) {
    stepMatch(m);
    if (onMinute && m.now % 60_000 === 0) onMinute(m);
  }
  return m;
}
