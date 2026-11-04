// A whole match without the browser: the map, both armies, the economy, production, orders,
// movement, combat, capture, the energy grid and victory, on the same rules as CityMap.
//
// Used to run computer-vs-computer matches in tests (sim/ai.test.ts) and for balance work.
// It is also a first draft of the authoritative game server: everything here runs on the
// sim/ modules alone, including warhead production and Ballista loading, and every doctrine power
// (castPower). Not yet included: projectiles and unit abilities other than Titan smoke, warhead
// clouds, Masons and walls, and breaching. Phantom Decoys put up their holograms as in the game
// (sim/hologram.ts).

import { ABILITY_CONFIG, CITY_CONFIG, STRUCTURE_INFO, TEAM_BASES } from '../constants';
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
import { ArtilleryShell, fireArtillery, landShells, shellBuildings, shellGroundPos } from './artillery';
import { clearedBlocks, commandPosts, rubbleCleared } from './bases';
import { bombardTick } from './bombard';
import { baseCentreOf, spawnTile } from './baseLayout';
import { captureTick } from './capture';
import { freshSentinelNet, SentinelNet, sentinelNetTick } from './sentinelNet';
import { salvageTick, type Wreck, wreckOf } from './salvage';
import { releaseOverrides } from './netrunnerHero';
import { advanceTrack, hasPower, perk, trackCombatPerks, trackPowerCooldown, trackPowerCost } from './doctrineTrack';
import { applyCiwsState, ciwsTick, ORDNANCE_INTEGRITY } from './ciws';
import { damageDrones, emptySwarm, shieldWasps, Swarm, swarmThreats, swarmTick } from './microdrones';
import type { GridPos, Team } from './commands';
import { coverMap, damageBuildings } from './cover';
import { applyStructureCombat, bombardBuildings, bombardUnitDamage, resolveAttacks } from './combat';
import { addWarheads, advanceWarheadProduction, createEconomy, Economy, payIncome, advanceTierResearch, productionStep, refund } from './economy';
import { chargeSources, isInsideEnergyGrid, muleRange, powerTick } from './energy';
import { generateCity, seededRandom } from './mapgen';
import { Difficulty, MatchConfig, startingRoster } from './match';
import { advanceMover, arriveAtNextTile, MovementEnv, MOVE_TICK_MS } from './movement';
import { applyOrderToStructures, applyOrderToUnits, OrderCommand, orderEffects, OrdersContext } from './orders';
import { advanceProduction, applyProduction, createUnit } from './production';
import { ballistaLoadStep, landCrawlers, repairTick } from './support';
import { fliesOver } from './units';
import { airPath, fastestPath, sentinelHazardOf } from './pathfinding';
import { blocksPath, compoundGround, compoundStructures, heldAtGate, hostileGateAt } from './compound';
import { hasBuff, spendOvercharge } from './unitAbilities';
import { applyFieldCloak, fieldCloakedIds, generatorsReplacedBy } from './cloak';
import { absorbingField, activeFields, addShieldHit, FORCE_FIELD, generatorsOf, impactAbsorbed, shieldTick, shockDamage, shotBlocked, shotBlockedBy } from './forcefield';
import { BLACKWALL, blackwallImpact, blackwallTick } from './blackwall';
import type { PowerKey } from './doctrineTrack';
import { kageCharges } from './shadowHero';
import { checkVictory, Victory } from './victory';
import { DOCTRINE_CONFIG } from '../constants';
import { jammingUpdates } from './jamming';
import { nanoCheck, nanoJammed } from './nanoCloud';
import { fadeHolograms, spawnHolograms } from './hologram';
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
  // The landmark towers' tiles, cover nothing knocks down (sim/cover.ts).
  landmarkTiles: GridPos[];
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
  // Wasps' micro-drones (sim/microdrones.ts).
  swarm: Swarm;
  nextId: number;
  // Netrunner's Sentinel Net (sim/sentinelNet.ts).
  sentinelNet: SentinelNet;
  // Wrecks for Heavy Metal to salvage (sim/salvage.ts).
  wrecks: Wreck[];
  // Netrunner Nano-Clouds on the ground (sim/nanoCloud.ts).
  nanoClouds: NanoCloud[];
  // Black Wall virus bombs on their way down (sim/blackwall.ts).
  virusBombs: VirusBomb[];
  // Every doctrine power each side has cast, in order, for balance work.
  powersCast: { team: Team; doctrine: DoctrineType; key: PowerKey; at: number }[];
  // Seeded, so the same options always play out the same match.
  random: () => number;
  // Static map data.
  gridSize: number;
  roads: Set<string>;
  tileType: Record<string, string>;
  log: string[];
}

export interface NanoCloud { team: Team; at: GridPos; radius: number; until: number }
export interface VirusBomb { team: Team; at: GridPos; landAt: number }

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
    structures: [hq('blue'), hq('red'), ...compoundStructures(city.baseWalls, city.baseGates, gridSize)],
    buildings: city.buildings,
    landmarkTiles: city.landmarks.flatMap(l => l.tiles),
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
    swarm: emptySwarm(),
    nextId: 0,
    sentinelNet: freshSentinelNet(),
    wrecks: [],
    nanoClouds: [],
    virusBombs: [],
    powersCast: [],
    random: seededRandom(opts.seed ^ 0x5eed),
    thinkRandom: seededRandom(opts.seed ^ 0x7a1c),
    gridSize,
    roads: new Set([...city.roadTileSet, ...compoundGround(city.baseWalls)]),
    tileType: city.tileTypeMap,
    log: [],
  };
}

// --- Pathing on the current map (roads and fallen wall minus structures and the HQ pads) ---

function blockedTiles(m: HeadlessMatch): Set<string> {
  const blocked = new Set<string>();
  // A blast gate is open road to plan through; the other side is stopped at it as it moves.
  for (const s of m.structures) if (blocksPath(s)) blocked.add(key(s.gridPos.x, s.gridPos.z));
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

  // Banshee jamming, and enemy Nano-Clouds over remote units: mark who can't take orders before
  // anyone sends any (sim/jamming.ts, sim/nanoCloud.ts).
  m.nanoClouds = m.nanoClouds.filter(c => c.until > m.now);
  const jam = jammingUpdates(m.units, nanoJammed(m.units, m.nanoClouds));
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
      isWalkable: (x, z) => fliesOver(u.type as never) || (paths.walkable(x, z) && !hostileGateAt(m.structures, u.team, key(x, z))),
      reroute: (from, path) => {
        if (path.length === 0) return [];
        const [gx, gz] = path[path.length - 1].split(',').map(Number);
        return paths.findPath(from, { x: gx, z: gz });
      },
      now,
    }),
    shut: u => heldAtGate(m.structures, u.team, u.path),
  };
  m.units = m.units.map(u => advanceMover(u, MOVE_TICK_MS, env));
  // Machines seized by Override go back when their time is up (sim/netrunnerHero.ts), and
  // Phantom Decoys holograms fade (sim/hologram.ts).
  m.units = fadeHolograms(releaseOverrides(m.units, now), now);
  // Kage's Optical Camo, Cloaking Fields and Shadow Ops going dark hide their units (sim/cloak.ts).
  m.units = applyFieldCloak(m.units, fieldCloakedIds(m.units, now, team => (team === 'blue' || team === 'red') ? m.opts.doctrine[team] : null, team => (team === 'blue' || team === 'red') ? perk.darkAfterMs(m.economy[team]) : null));

  // Heavy Metal force fields up this tick (sim/forcefield.ts): every weapon below checks them, and
  // what they stop wears their shields down.
  const fields = activeFields(m.units, now);
  const shieldOf = (team: UnitData['team'], from: GridPos, to: GridPos) => {
    const b = shotBlockedBy(fields, team, from, to);
    return b ? { fieldId: b.field.id, at: b.at } : null;
  };
  const shieldHits = new Map<string, number>();
  const absorbHit = (team: UnitData['team'], at: GridPos, damage: number, from?: GridPos) => {
    const f = absorbingField(fields, team, at, from);
    if (f) addShieldHit(shieldHits, f.id, damage);
  };
  // Netrunner Nano-Clouds (sim/nanoCloud.ts): enemies inside are blinded, the caster's units hidden.
  const inNanoCloud = nanoCheck(m.nanoClouds);

  // Combat.
  const reloaded =<T extends { id: string; lastAttackTime?: number }>(x: T): T => {
    const shot = m.lastShot.get(x.id);
    return shot && shot > (x.lastAttackTime || 0) ? { ...x, lastAttackTime: shot } : x;
  };
  // Units in a friendly Smoke Screen are screened this tick (sim/titan.ts).
  m.smoke = pruneSmoke(m.smoke, now);
  m.units = markScreened(m.units, m.smoke, now);
  // City buildings and enemy walls stop direct fire (sim/cover.ts).
  const cover = coverMap(m.buildings, m.structures, m.landmarkTiles);
  const attacks = resolveAttacks(m.units.map(reloaded), m.structures.map(reloaded) as never, now, inNanoCloud, shieldOf, cover, trackCombatPerks(team => m.economy[team]));
  attacks.shieldDamage.forEach((n, id) => addShieldHit(shieldHits, id, n));
  attacks.fired.forEach((_, id) => m.lastShot.set(id, now));
  m.structures = applyStructureCombat(m.structures, attacks, now);
  // Artillery: new shells go up, and the ones whose flight is over come down.
  const volley = fireArtillery(m.units.map(reloaded), m.structures, now, team => (team === 'neutral' ? 1 : artilleryTierOf(m.economy[team])), m.random, () => `shell-${++m.nextId}`);
  volley.fired.forEach((_, id) => { m.lastShot.set(id, now); attacks.fired.set(id, ''); });
  // Tank rail guns: long-range shots at what the side can see.
  const rail = fireRailguns(m.units, m.structures, now, inNanoCloud, shieldOf, paths.walkable, cover);
  rail.shieldDamage.forEach((n, id) => addShieldHit(shieldHits, id, n));
  m.buildings = damageBuildings(damageBuildings(m.buildings, attacks.buildingDamage), rail.buildingDamage);
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
  const volt = voltBlasts(m.units, due, m.structures);
  if (due.length > 0) {
    m.volt = m.volt.filter(c => !due.includes(c));
    volt.damage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
    if (volt.structureDamage.size > 0) m.structures = applyStructureCombat(m.structures, { structureDamage: volt.structureDamage, fired: new Map(), aiming: new Map() }, now);
  }
  const salvo = landSalvo(m.salvo, now, m.units, m.structures, fields);
  m.salvo = salvo.flying;
  salvo.absorbed.forEach(r => absorbHit(r.team, r.at, FORCE_FIELD.absorb.mini, r.from));
  for (const map of [hornets.unitDamage, salvo.unitDamage]) map.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  for (const map of [hornets.structureDamage, salvo.structureDamage]) {
    if (map.size > 0) m.structures = applyStructureCombat(m.structures, { structureDamage: map, fired: new Map(), aiming: new Map() }, now);
  }
  // Wasps' micro-drones hunt what is near their Wasps (sim/microdrones.ts).
  const drones = swarmTick(m.swarm, m.units, now, MOVE_TICK_MS, () => `md-${++m.nextId}`);
  drones.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  drones.engaged.forEach((target, waspId) => attacks.aiming.set(waspId, target));
  // Aegis rotary cannons: aircraft, and Thunderhead shells and micro-drones (the only ordnance flown here).
  const ciws = ciwsTick(m.units, [...m.shells.map(s => ({ id: s.id, team: s.team, at: shellGroundPos(s, now), kind: 'shell' as const })), ...swarmThreats(drones.swarm)], now, MOVE_TICK_MS, m.structures);
  m.swarm = damageDrones(drones.swarm, ciws.ordnanceDamage).swarm;
  m.structures = applyCiwsState(m.structures, ciws.structureUpdates);
  ciws.unitDamage.forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  const shellIds = new Set(m.shells.map(sh => sh.id));
  ciws.ordnanceDamage.forEach((n, id) => { if (shellIds.has(id)) m.shellHits.set(id, (m.shellHits.get(id) || 0) + n); });
  m.shells = m.shells.filter(s => (m.shellHits.get(s.id) || 0) < ORDNANCE_INTEGRITY.shell);
  m.units = applyCiwsState(m.units, ciws.updates);
  const impact = landShells([...m.shells, ...volley.shells], now, m.units, m.structures, fields);
  m.shells = impact.flying;
  impact.absorbed.forEach(s => absorbHit(s.team, s.at, FORCE_FIELD.absorb.shell, s.from));
  m.buildings = shellBuildings(m.buildings, impact.landed);
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
  // Bombardment Drones over their target drop their strikes, levelling city buildings and hurting
  // the units under them; empty, they fly home to rearm (sim/bombard.ts), as in the game.
  const bombard = bombardTick(m.units, now, team => (team === 'blue' || team === 'red') ? commandPosts(m.structures, team, TEAM_BASES[team]) : [], paths.findAirPath);
  if (bombard.updates.size > 0) m.units = m.units.map(u => bombard.updates.get(u.id)?.(u) ?? u);
  // A drop over an enemy force field is absorbed by its dome.
  const strikes = bombard.strikes.map(s => ({ ...s, team: m.units.find(u => u.id === s.droneId)?.team ?? 'neutral' as const })).filter(s => {
    if (!impactAbsorbed(fields, s.team, s.at)) return true;
    absorbHit(s.team, s.at, FORCE_FIELD.absorb.bombard);
    return false;
  });
  if (strikes.length > 0) {
    m.buildings = bombardBuildings(m.buildings, strikes.map(s => s.at));
    bombardUnitDamage(m.units, strikes).forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  }
  // Force fields shock the enemies standing inside them.
  shockDamage(m.units, fields, MOVE_TICK_MS).forEach((n, id) => attacks.unitDamage.set(id, (attacks.unitDamage.get(id) || 0) + n));
  // Black Wall virus bombs that land infect the enemies under them, unless a dome takes the bomb or
  // stands between it and them; the infected burn and pass it on (sim/blackwall.ts).
  const virus = blackwallTick(m.units, MOVE_TICK_MS, now);
  const landedBombs = m.virusBombs.filter(b => b.landAt <= now);
  if (landedBombs.length > 0) {
    m.virusBombs = m.virusBombs.filter(b => b.landAt > now);
    for (const b of landedBombs) {
      if (impactAbsorbed(fields, b.team, b.at)) { absorbHit(b.team, b.at, FORCE_FIELD.absorb.virus); continue; }
      const hits = blackwallImpact(m.units, b.at, b.team, now);
      for (const id of [...hits.keys()]) {
        const victim = m.units.find(u => u.id === id);
        if (victim && shotBlocked(fields, b.team, b.at, victim.gridPos)) hits.delete(id);
      }
      mergeUnitUpdates(virus, hits);
    }
  }
  if (virus.size > 0) m.units = m.units.map(u => virus.get(u.id)?.(u) ?? u);
  // This tick's hits wear the domes down; one battered to nothing reboots (sim/forcefield.ts).
  const shields = shieldTick(m.units, now, shieldHits);
  if (shields.size > 0) m.units = m.units.map(u => shields.get(u.id)?.(u) ?? u);

  // Fire on the Wasps is taken first by their drones (sim/microdrones.ts).
  const shield = shieldWasps(m.swarm, attacks.unitDamage, m.units, now);
  m.swarm = shield.swarm;
  attacks.unitDamage.clear();
  shield.damage.forEach((n, id) => attacks.unitDamage.set(id, n));
  // Who hit whom, for the pacing report's damage tally.
  recordWeaponHits(m.pacing, {
    fired: attacks.fired, shots: [...(attacks.splashed ?? []), ...rail.shots, ...rail.pierceHits, ...hornets.shots, ...flechettes.shots, ...volt.hits, ...drones.hits], ciws: ciws.links,
    blasts: [
      ...impact.landed.map(s => ({ attackerId: s.attackerId, team: s.team, at: s.at, radius: 2 })),
      ...salvo.landed.map(s => ({ attackerId: s.attackerId, team: s.team, at: s.at, radius: 2 })),
      ...strikes.map(s => ({ attackerId: s.droneId, team: s.team, at: s.at, radius: ABILITY_CONFIG.BOMBARD_RADIUS })),
    ],
    beams: heliosBeams(m.units),
  }, m.units, m.structures);

  // Capture.
  m.buildings = captureTick(m.buildings, m.units);
  // Netrunner's Sentinel Net: the code, hacking neutral guards, defenders (sim/sentinelNet.ts).
  const net = sentinelNetTick(m.sentinelNet, m.units, m.buildings, team => m.opts.doctrine[team], team => !!m.economy[team].sentinelCode, now, MOVE_TICK_MS, () => `sn-${++m.nextId}`, { hackMsOf: t => perk.hackMs(m.economy[t]), defenderAfterOf: t => perk.defenderAfterMs(m.economy[t]) });
  m.units = net.units;
  m.sentinelNet = net.net;
  for (const team of net.cracked) m.economy = { ...m.economy, [team]: { ...m.economy[team], sentinelCode: true } };

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
    const spawn = spawnTile(structure.gridPos, baseCentreOf(structure.gridPos, m.structures, structure.team),
      (x, z) => paths.walkable(x, z) && !taken.has(key(x, z)));
    const unit = createUnit(unitType, structure.team, `h-${++m.nextId}`, spawn);
    if (structure.rallyPoint) unit.path = fliesOver(unitType) ? paths.findAirPath(spawn, structure.rallyPoint) : paths.findPath(spawn, structure.rallyPoint);
    m.units.push(unit);
  }
  // Swarm Host canisters that have landed become Crawler Drones.
  m.units = landCrawlers(m.units, now, (h, at) => ({ ...createUnit('crawler_drone', h.team, `c-${++m.nextId}`, at), parentId: h.id }));
  // Researched upgrades add health and damage to their units, new ones included.
  m.units = applyUpgradeBonuses(m.units, m.economy);

  // Damage, repair and batteries.
  // A Battery Mule reaches further once its side has its last upgrade (sim/energy.ts).
  const muleRangeOf = (mule: UnitData) => muleRange(mule.team === 'blue' || mule.team === 'red' ? m.economy[mule.team] : undefined);
  const power = chargeSources(m.units, muleRangeOf);
  const repair = repairTick(m.units, MOVE_TICK_MS, bases, team => (team === 'blue' || team === 'red') ? m.opts.doctrine[team] : null, team => m.economy[team].tier, now, team => perk.welders(m.economy[team]));
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
        units: living, sources: power, helios, inNanoCloud: inNanoCloud(u.gridPos, u.team, 'firing'), muleRangeOf,
        onGrid: isInsideEnergyGrid(u.gridPos, u.team, m.buildings, bases.blue, bases.red),
      });
    }
    return draft;
  });
  // A Battery Mule with the Volt Core goes critical where it dies (sim/voltCore.ts).
  m.volt.push(...armMules(m.units, team => hasUpgrade(m.economy[team], 'volt_core'), now));
  // Vehicles leave wrecks for Heavy Metal to salvage (sim/salvage.ts).
  for (const u of m.units) {
    if (u.health > 0) continue;
    const w = wreckOf(u.type, u.gridPos, now, `wreck-${++m.nextId}`, u.team, u.hologramUntil !== undefined);
    if (w) m.wrecks.push(w);
  }
  m.units = m.units.filter(u => u.health > 0);
  if (m.wrecks.length > 0) {
    const salvage = salvageTick(m.wrecks, m.units, team => m.opts.doctrine[team], now, MOVE_TICK_MS, team => perk.salvageMultiplier(m.economy[team]));
    m.wrecks = salvage.wrecks;
    for (const p of salvage.payouts) m.economy = { ...m.economy, [p.team]: { ...m.economy[p.team], cores: m.economy[p.team].cores + p.cores, lifetimeIncome: m.economy[p.team].lifetimeIncome + p.cores } };
    if (salvage.repairs.size > 0) m.units = m.units.map(u => { const hp = salvage.repairs.get(u.id); return hp ? { ...u, health: Math.min(u.maxHealth, u.health + hp) } : u; });
  }

  // Once a second: income and victory.
  if (now % 1000 === 0) {
    m.economy = advanceTrack(payIncome(m.economy, m.buildings, m.opts.income ?? {}, m.structures), m.buildings, 1000);
    // Tier research under way (sim/economy.ts).
    m.economy = advanceTierResearch(m.economy, m.structures, 1000).economy;
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
        const silo = outcome.effects.structureUpdates;
        if (silo?.size) m.structures = m.structures.map(s => silo.get(s.id)?.(s) ?? s);
      }
    } else if (action.kind === 'doctrine') castPower(m, team, action.tier, action.target);
  }
  // Kage charges what he sees with his blade (sim/shadowHero.ts).
  for (const c of kageCharges(m.units)) {
    if (c.team === team) applyOrder(m, team, { type: 'MOVE', unitIds: [c.unitId], target: c.target, attackMove: true }, ctx);
  }
}

// A doctrine power, on the same checks as CityMap's runDoctrinePower: the side's doctrine, taken
// on its track, off cooldown and paid for. Drop pods land at once here rather than falling.
export function castPower(m: HeadlessMatch, team: Team, tier: 2 | 3, target: GridPos): boolean {
  const doctrine = m.opts.doctrine[team];
  const key: PowerKey = tier === 2 ? 'tier2' : 'tier3';
  if (!doctrine || !hasPower(m.economy[team], doctrine, key)) return false;
  const readyAt = m.doctrineReadyAt[team];
  const cost = trackPowerCost(m.economy[team], doctrine, key);
  if (readyAt[key] > m.now || m.economy[team].cores < cost) return false;
  m.economy = { ...m.economy, [team]: { ...m.economy[team], cores: m.economy[team].cores - cost } };
  readyAt[key] = m.now + trackPowerCooldown(m.economy[team], doctrine, key);
  const at = { ...target };
  const power = `${doctrine}_${key}`;
  if (power === 'heavy_metal_tier2') {
    // Orbital Drop: a Titan lands at the target.
    m.units.push(createUnit('titan_dropped', team, `drop-${++m.nextId}`, at));
  } else if (power === 'heavy_metal_tier3') {
    // Bulwark Force Field: one generator per side, the old one goes.
    const old = new Set(generatorsOf(m.units, team));
    m.units = [...m.units.filter(u => !old.has(u.id)), createUnit('field_generator', team, `fieldgen-${++m.nextId}`, at)];
  } else if (power === 'shadow_ops_tier3') {
    // Cloaking Field: one generator per side, the old one blows.
    const old = new Set(generatorsReplacedBy(m.units, team));
    m.units = [...m.units.filter(u => !old.has(u.id)), createUnit('cloak_generator', team, `cloakgen-${++m.nextId}`, at)];
  } else if (power === 'shadow_ops_tier2') {
    // Phantom Decoys: holograms of its nearest units come up at the target (sim/hologram.ts).
    const { walkable } = pathfinder(m);
    m.units.push(...spawnHolograms(m.units, team, at, m.now, () => `holo-${++m.nextId}`, walkable));
  } else if (power === 'netrunner_tier2') {
    m.nanoClouds.push({ team, at, radius: ABILITY_CONFIG.NANO_CLOUD_RADIUS, until: m.now + ABILITY_CONFIG.NANO_CLOUD_DURATION });
  } else if (power === 'netrunner_tier3') {
    m.virusBombs.push({ team, at, landAt: m.now + BLACKWALL.fallMs });
  }
  m.powersCast.push({ team, doctrine, key, at: m.now });
  m.log.push(`${Math.round(m.now / 1000)}s ${team} ${power}`);
  return true;
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
