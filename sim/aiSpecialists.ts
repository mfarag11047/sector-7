// The computer opponent's specialist units: everything beyond the line army, capture team and
// Thunderheads that sim/ai.ts handles itself. Like the rest of the AI it only returns commands,
// which go through the same checks as a player's.
//
//   - What to train: scouts, Ghosts, support vehicles, the Battery Mule, Swarm Hosts,
//     Bombardment Drones, Ballistas and Masons, in modest numbers alongside the army.
//   - How to move them: the scout car runs ahead to look, drones and support vehicles keep with
//     the army, the Battery Mule plants at the staging point, Swarm Hosts anchor in a fight,
//     Ballistas stay by the Ordnance Fab, Bombardment Drones fly their own strikes.
//   - When to use their abilities: Ghost Dampener and Phantom Decoy, Banshee jammer and
//     tether, Helios mode, Wasp swarm volleys, drone Surveillance, Battery Mule
//     links, warheads for the Ballista, turrets for the Masons, and new Command HQs.

import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { BuildingData, StructureData, StructureType, UnitData, UnitType } from '../types';
import type { AbilityCommand } from './abilities';
import { BASE_SITE, baseSites } from './bases';
import { munitionsOf } from './bombard';
import type { GridPos, Team, Warhead } from './commands';
import type { Economy } from './economy';
import { structureCost, warheadCost } from './economy';
import { isInsideEnergyGrid } from './energy';
import { hasUpgrade } from './upgrades';
import { HELIOS } from './helios';
import { isRemoteUnit, isTetherableDrone, MAX_TETHERS, tetheredIds } from './jamming';
import type { OrderCommand } from './orders';
import { isOperational } from './orders';
import { freePadsFor } from './baseLayout';
import { type Tier, UNIT_RULES } from './units';
import { HE, inventoryOf, missilesHeld, WARHEAD_LIST, WP } from './warheads';
import type { AiStrategy } from './aiStrategy';

type Action = { kind: 'order'; command: OrderCommand } | { kind: 'ability'; command: AbilityCommand };
type Mode = 'gather' | 'expand' | 'tech' | 'attack' | 'defend' | 'retreat';

const dist = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
const value = (u: UnitData) => (UNIT_STATS[u.type].cost || 150) * (u.health / u.maxHealth);
const count = (units: readonly UnitData[], type: UnitType) => units.filter(u => u.type === type).length;

// Units sim/ai.ts leaves to this module to move.
export const SPECIALIST_MOVERS: readonly UnitType[] = ['scout_car', 'drone', 'sun_plate', 'swarm_host', 'ballista', 'bombard', 'mason'];
// Support units that simply keep with the army (moved by sim/ai.ts like fighters).
export const ESCORTS: readonly UnitType[] = ['helios', 'banshee'];

// --- What to train ---

export interface SupportNeeds {
  tier: Tier;
  mine: readonly UnitData[];
  structures: readonly StructureData[];
  // Fighting units in the army.
  army: number;
  needInfantry: boolean;
  hard: boolean;
  random: () => number;
  // The army strategy (sim/aiStrategy.ts): a drone army fields many more Helios, Banshees and
  // Swarm Hosts, an air army more Bombardment Drones.
  strategy?: AiStrategy;
  // A scout car was lost recently: it waits a while before sending another (SCOUT_REPLACE_MS).
  scoutLostRecently?: boolean;
}

// How long after losing a scout car it waits before training another.
export const SCOUT_REPLACE_MS = 3 * 60_000;
// How close an enemy gets before a scout car turns back, and how far short of the enemy base it
// stops to watch: it is unarmed and fragile, there to look, not to be shot.
const SCOUT_WARY = 7;
const SCOUT_WATCH = 14;

// A specialist worth training at this structure now, or null to train the usual fighter.
export function specialistPick(producer: StructureType, n: SupportNeeds): UnitType | null {
  const { tier, mine, army, random } = n;
  const have = (t: UnitType) => count(mine, t);
  const vehicles = mine.filter(u => u.unitClass === 'armor').length;
  const hasFab = n.structures.some(s => s.type === 'ordnance_fab' && isOperational(s));
  const drones = n.strategy === 'drones';
  const air = n.strategy === 'air';
  switch (producer) {
    case 'hq':
      return !n.scoutLostRecently && have('scout_car') < (n.hard ? 2 : 1) ? 'scout_car' : null;
    case 'infantry':
      // Ghosts join the capture team once the first Troopers are out.
      return !n.needInfantry && have('ghost') < (n.hard ? 3 : 2) && random() < 0.35 ? 'ghost' : null;
    case 'armor':
      return tier >= 2 && vehicles >= 5 && have('sun_plate') < 1 ? 'sun_plate' : null;
    case 'air':
      if (have('drone') < 1) return 'drone';
      if (tier >= 3 && have('bombard') < (n.hard ? 2 : 1) + (air || drones ? 1 : 0) && random() < 0.5) return 'bombard';
      return null;
    case 'support':
      if (drones ? have('helios') < Math.max(2, Math.floor(army / 3)) : have('helios') < Math.min(2, Math.floor(army / 6))) return 'helios';
      if (tier >= 2 && army >= (drones ? 3 : 6) && have('banshee') < (drones ? 2 : 1)) return 'banshee';
      if (tier >= 3 && hasFab && have('ballista') < 1) return 'ballista';
      return null;
    case 'ordnance_fab':
      return tier >= 2 && army >= (drones ? 3 : 6) && have('swarm_host') < (drones ? 3 : 1) ? 'swarm_host' : null;
    case 'builder':
      return have('mason') < 1 ? 'mason' : null;
    default:
      return null;
  }
}

// --- Moving the specialists ---

export interface MoveContext {
  team: Team;
  tier: Tier;
  mode: Mode;
  objective: GridPos;
  staging: GridPos;
  gather: GridPos;
  home: GridPos;
  mine: readonly UnitData[];
  theirs: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
  bases: Record<Team, GridPos>;
  // The neutral Sentinels still guarding server nodes.
  sentinels: readonly GridPos[];
  // sim/ai.ts' de-duplicating move order.
  send: (u: UnitData, target: GridPos, attackMove: boolean) => void;
}

export function specialistMoves(c: MoveContext): Action[] {
  const actions: Action[] = [];
  const anchor: string[] = [];
  const enemyEnemy = c.team === 'blue' ? 'red' : 'blue';
  const enemiesNear = (p: GridPos, r: number) => c.theirs.filter(t => t.type !== 'defense_drone' && dist(t.gridPos, p) <= r);
  const pushing = c.mode === 'attack' || c.mode === 'tech' || c.mode === 'expand';
  const fab = c.structures.find(s => s.team === c.team && s.type === 'ordnance_fab' && isOperational(s));

  for (const u of c.mine) {
    switch (u.type) {
      case 'scout_car': {
        // Runs ahead of the army to look, and backs off home from anything that could catch it.
        if (enemiesNear(u.gridPos, SCOUT_WARY).length > 0) { c.send(u, c.gather, false); break; }
        const withArmy = pushing || c.mode === 'defend';
        const ahead = withArmy ? c.objective : c.bases[enemyEnemy];
        // Stop short of the target so it watches rather than drives in; well short of their base.
        const d = dist(ahead, u.gridPos) || 1;
        const back = Math.min(d, withArmy ? 6 : SCOUT_WATCH);
        const spot = { x: Math.round(ahead.x + ((u.gridPos.x - ahead.x) / d) * back), z: Math.round(ahead.z + ((u.gridPos.z - ahead.z) / d) * back) };
        // Never parked under a Sentinel's guns.
        const guarded = (p: GridPos) => c.sentinels.some(g => dist(g, p) <= SENTINEL_CLEARANCE);
        c.send(u, guarded(spot) ? (guarded(c.staging) ? c.gather : c.staging) : spot, false);
        break;
      }
      case 'drone':
        // Keeps over the army, its radar showing what is ahead (Surveillance is in specialistAbilities).
        if (!u.surveillance?.active) c.send(u, pushing ? c.staging : c.gather, false);
        break;
      case 'sun_plate': {
        // Plants at the staging point and powers the vehicles around it; packs up to follow.
        const spot = c.mode === 'retreat' || c.mode === 'gather' ? c.gather : c.staging;
        if (u.isDeployed) {
          if (dist(u.gridPos, spot) > ABILITY_CONFIG.BATTERY_MULE_RANGE) anchor.push(u.id);
        } else if (dist(u.gridPos, spot) <= 2.5 && u.path.length === 0) {
          anchor.push(u.id);
        } else {
          c.send(u, spot, false);
        }
        break;
      }
      case 'swarm_host': {
        // Anchors to release Crawlers when a fight is close, packs up when it is over.
        const fight = enemiesNear(u.gridPos, ABILITY_CONFIG.CRAWLER_RADIUS || 7).length > 0;
        if (u.isAnchored) {
          if (!fight && enemiesNear(u.gridPos, 10).length === 0 && pushing) anchor.push(u.id);
          break;
        }
        if (fight && u.path.length === 0) { anchor.push(u.id); break; }
        c.send(u, pushing ? c.staging : c.objective, true);
        break;
      }
      case 'ballista':
        // Stays by the Ordnance Fab, where it loads warheads; fires from there at what's within its range (half the map).
        if (fab && dist(u.gridPos, fab.gridPos) >= ABILITY_CONFIG.FABRICATOR_DOCK_RANGE - 0.5) c.send(u, fab.gridPos, false);
        break;
      case 'bombard':
      case 'mason':
        // Bombardment Drones fly their strike missions; Masons build on their own.
        break;
    }
  }
  if (anchor.length > 0) actions.push({ kind: 'ability', command: { type: 'TOGGLE_ANCHOR', unitIds: anchor } });
  return actions;
}

// How far from a Sentinel a scout car keeps (its gun reaches 3 tiles).
const SENTINEL_CLEARANCE = 6;

// --- Abilities ---

export interface AbilityContext2 {
  team: Team;
  tier: Tier;
  mode: Mode;
  objective: GridPos;
  home: GridPos;
  mine: readonly UnitData[];
  theirs: readonly UnitData[];
  structures: readonly StructureData[];
  economy: Economy;
  attention: number;
  random: () => number;
}

export function specialistAbilities(c: AbilityContext2): Action[] {
  const actions: Action[] = [];
  const pushing = c.mode === 'attack' || c.mode === 'tech' || c.mode === 'expand' || c.mode === 'defend';
  const near = (p: GridPos, r: number, f: (t: UnitData) => boolean = () => true) =>
    c.theirs.filter(t => t.type !== 'defense_drone' && f(t) && dist(t.gridPos, p) <= r);
  const flipDampener: string[] = [];
  const jammerFlip: string[] = [];
  const toCharge: string[] = [];
  const toBurn: string[] = [];
  const enemy: Team = c.team === 'blue' ? 'red' : 'blue';

  for (const u of c.mine) {
    if (c.random() > c.attention) continue;
    const battery = u.maxBattery > 0 ? u.battery / u.maxBattery : 1;
    switch (u.type) {
      case 'ghost': {
        // Dampener (researched) on while the army is on the move, off at home to save battery.
        if (hasUpgrade(c.economy[c.team], 'dampener')) {
          const want = pushing && battery > 0.25;
          if (!!u.isDampenerActive !== want && (want || battery < 0.9 || !pushing)) flipDampener.push(u.id);
        }
        // Phantom Decoy (researched) to slip away when caught.
        if (hasUpgrade(c.economy[c.team], 'phantom_decoy') && !u.decoyActive && u.health < u.maxHealth * 0.5 && near(u.gridPos, 4).length > 0 && battery > 0.3) {
          actions.push({ kind: 'ability', command: { type: 'PHANTOM_DECOY', unitId: u.id } });
        }
        break;
      }
      case 'banshee': {
        // Jams whenever enemy remote units come within reach.
        const targets = near(u.gridPos, ABILITY_CONFIG.BANSHEE_JAMMER_RADIUS + 1, isRemoteUnit).length > 0;
        const want = targets && battery > 0.15;
        if (!!u.jammerActive !== want) jammerFlip.push(u.id);
        // Hardlines its side's drones nearby, so enemy jammers can't take them.
        const held = tetheredIds(u);
        if (held.length < MAX_TETHERS) {
          const drone = c.mine.find(d => d.id !== u.id && isTetherableDrone(d) && !held.includes(d.id)
            && !c.mine.some(o => o.id !== u.id && tetheredIds(o).includes(d.id))
            && dist(d.gridPos, u.gridPos) <= ABILITY_CONFIG.BANSHEE_TETHER_RANGE - 1);
          if (drone) actions.push({ kind: 'ability', command: { type: 'HARDLINE_TETHER', unitId: u.id, targetUnitId: drone.id } });
        }
        break;
      }
      case 'helios': {
        // Microwaves enemies in reach while it has the battery; otherwise charges friends.
        const burn = near(u.gridPos, HELIOS.radius).length > 0 && battery > 0.4;
        const mode = u.heliosMode ?? 'charge';
        if (burn && mode !== 'burn') toBurn.push(u.id);
        else if (!burn && mode === 'burn' && (battery < 0.2 || near(u.gridPos, HELIOS.radius + 1).length === 0)) toCharge.push(u.id);
        break;
      }
      case 'wasp': {
        // A swarm volley into the thickest enemy group in reach.
        if ((u.charges?.swarm || 0) <= 0 || (u.cooldowns?.swarmLaunch || 0) > 0) break;
        const best = densest(near(u.gridPos, 6, t => UNIT_RULES[t.type].armor !== 'air'), 2);
        if (best && best.value >= 300) actions.push({ kind: 'ability', command: { type: 'FIRE_SWARM', unitId: u.id, target: best.at } });
        break;
      }
      case 'drone':
        // Loiters over the objective while the army pushes on it.
        if (!u.surveillance?.active && pushing && c.mode !== 'defend' && dist(u.gridPos, c.objective) <= 14) {
          actions.push({ kind: 'ability', command: { type: 'SURVEILLANCE', unitId: u.id, target: c.objective } });
        }
        break;
      case 'sun_plate': {
        // Links the vehicles around it that need charge.
        if (!u.isDeployed) break;
        const links = u.batteryTetherIds || [];
        if (links.length >= ABILITY_CONFIG.BATTERY_MULE_SLOTS) break;
        const needy = c.mine.find(v => v.id !== u.id && v.unitClass !== 'infantry' && v.type !== 'sun_plate' && v.type !== 'defense_drone'
          && !links.includes(v.id) && v.battery < v.maxBattery * 0.7 && dist(v.gridPos, u.gridPos) <= ABILITY_CONFIG.BATTERY_MULE_RANGE - 0.5
          && !c.mine.some(o => o.id !== u.id && o.batteryTetherIds?.includes(v.id)));
        if (needy) actions.push({ kind: 'ability', command: { type: 'BATTERY_LINK', unitId: u.id, targetUnitId: needy.id } });
        break;
      }
      case 'bombard': {
        // Strikes when loaded and idle: enemy production first, nearest our side.
        if (u.bombardmentTarget || u.bombardReturning || munitionsOf(u) <= 0) break;
        const target = bombardTarget(c, enemy);
        if (target) actions.push({ kind: 'ability', command: { type: 'BOMBARD', unitId: u.id, target } });
        break;
      }
      case 'ballista':
        actions.push(...ballistaMoves(u, c, enemy));
        break;
    }
  }
  if (flipDampener.length > 0) actions.push({ kind: 'ability', command: { type: 'TOGGLE_DAMPENER', unitIds: flipDampener } });
  if (jammerFlip.length > 0) actions.push({ kind: 'ability', command: { type: 'TOGGLE_JAMMER', unitIds: jammerFlip } });
  if (toBurn.length > 0) actions.push({ kind: 'ability', command: { type: 'SET_HELIOS_MODE', unitIds: toBurn, mode: 'burn' } });
  if (toCharge.length > 0) actions.push({ kind: 'ability', command: { type: 'SET_HELIOS_MODE', unitIds: toCharge, mode: 'charge' } });
  return actions;
}

// The warhead that best fits what the enemy fields: White Phosphorus against an infantry army,
// EMP against a big air wing, otherwise high explosive for the armour.
export function preferredWarhead(theirs: readonly UnitData[]): Warhead {
  const army = theirs.filter(t => !!UNIT_RULES[t.type].weapon || t.unitClass === 'infantry');
  if (army.length === 0) return 'he';
  const count = (armor: string) => army.filter(t => UNIT_RULES[t.type].armor === armor).length;
  const infantry = count('infantry');
  const armour = count('heavy') + count('light');
  if (count('air') > army.length * 0.35) return 'emp';
  return infantry >= armour ? 'wp' : 'he';
}

// Where an armed Ballista's missile does the most good, within its reach (half the map across).
function ballistaTarget(u: UnitData, c: AbilityContext2, enemy: Team): GridPos | null {
  const reach = (p: GridPos) => dist(p, u.gridPos) <= ABILITY_CONFIG.BALLISTA_RANGE;
  const inReach = c.theirs.filter(t => t.type !== 'defense_drone' && reach(t.gridPos));
  const structure = c.structures.filter(s => s.team === enemy && s.health > 0 && s.type !== 'hq' && !s.isBlueprint && reach(s.gridPos))
    .sort((a, b) => dist(a.gridPos, c.home) - dist(b.gridPos, c.home))[0];
  if (u.loadedAmmo === 'wp') {
    // The gas only burns infantry, and it covers a wide area: the thickest crowd of them.
    const crowd = densest(inReach.filter(t => UNIT_RULES[t.type].armor === 'infantry'), WP.radius * 0.6);
    return crowd && crowd.value >= 240 ? crowd.at : null;
  }
  if (u.loadedAmmo === 'he') {
    // Anti-armour: the thickest knot of vehicles, else a building.
    const armour = densest(inReach.filter(t => UNIT_RULES[t.type].armor === 'heavy' || UNIT_RULES[t.type].armor === 'light'), HE.radius * 0.6);
    return armour && armour.value >= 500 ? armour.at : structure?.gridPos ?? (armour && armour.value >= 250 ? armour.at : null);
  }
  const cluster = densest(inReach, 2.5);
  return cluster && cluster.value >= 450 ? cluster.at : structure?.gridPos ?? (cluster && cluster.value >= 200 ? cluster.at : null);
}

// The Ballista's cycle beside the Ordnance Fab: take a warhead, load it, fire it.
function ballistaMoves(u: UnitData, c: AbilityContext2, enemy: Team): Action[] {
  if (u.ammoState === 'armed') {
    const at = ballistaTarget(u, c, enemy);
    return at ? [{ kind: 'ability', command: { type: 'FIRE_BALLISTA', unitId: u.id, target: { ...at } } }] : [];
  }
  if (u.ammoState === 'loading') return [];
  const want = preferredWarhead(c.theirs);
  // The one that suits the enemy best, else whatever there is.
  const pick = (have: Record<Warhead, number>): Warhead | null =>
    have[want] > 0 ? want : WARHEAD_LIST.find(w => have[w] > 0) ?? null;
  const carried = pick(inventoryOf(u));
  if (carried) return [{ kind: 'ability', command: { type: 'LOAD_AMMO', unitId: u.id, warhead: carried } }];
  const stocked = pick(c.economy[c.team].stockpile);
  return stocked ? [{ kind: 'ability', command: { type: 'TAKE_WARHEAD', unitId: u.id, warhead: stocked } }] : [];
}

function bombardTarget(c: AbilityContext2, enemy: Team): GridPos | null {
  // Not on top of our own units.
  const clear = (p: GridPos) => !c.mine.some(u => u.type !== 'bombard' && dist(u.gridPos, p) <= 3);
  const structures = c.structures.filter(s => s.team === enemy && s.health > 0 && !s.isBlueprint && clear(s.gridPos))
    .sort((a, b) => (a.type === 'hq' ? 1 : 0) - (b.type === 'hq' ? 1 : 0) || dist(a.gridPos, c.home) - dist(b.gridPos, c.home));
  return structures[0] ? { ...structures[0].gridPos } : null;
}

// --- Structures: warheads, turrets and new bases ---

export interface BaseContext {
  team: Team;
  tier: Tier;
  cores: number;
  mine: readonly UnitData[];
  theirs: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
  economy: Economy;
  bases: Record<Team, GridPos>;
  gather: GridPos;
  canBuildOn: (x: number, z: number) => boolean;
  maxTurrets: number;
  maxBases: number;
  gridSize: number;
  // Every building pad is taken: more production needs another Command HQ.
  padsFull: boolean;
}

// Orders for the base itself. Returns the cores they spend.
export function baseMoves(c: BaseContext): { actions: Action[]; spent: number } {
  const actions: Action[] = [];
  let spent = 0;
  const mineS = c.structures.filter(s => s.team === c.team);

  // Warheads for the Ballista: keep a couple in hand, of the kind that suits the enemy's army.
  const ballistas = c.mine.filter(u => u.type === 'ballista');
  const fab = mineS.find(s => s.type === 'ordnance_fab' && isOperational(s) && !s.production?.active);
  if (fab && ballistas.length > 0) {
    const stock = c.economy[c.team].stockpile;
    const carried = ballistas.reduce((n, b) => n + missilesHeld(b), 0);
    const warhead = preferredWarhead(c.theirs);
    if (stock.he + stock.emp + stock.wp + carried < 2 && c.cores - spent >= warheadCost(warhead) + 300) {
      actions.push({ kind: 'order', command: { type: 'BUILD_WARHEAD', structureId: fab.id, warhead } });
      spent += warheadCost(warhead);
    }
  }

  // A Sentry Turret or two guarding the base, on the corner pads facing the enemy, built by the
  // Masons. Turrets only go on an HQ's corner pads (sim/baseLayout.ts).
  // Not while the base is under attack: it would only be knocked down half-built.
  const depot = mineS.some(s => s.type === 'builder' && isOperational(s));
  const turrets = mineS.filter(s => s.type === 'defense').length;
  const home = c.bases[c.team];
  const enemyHome = c.bases[c.team === 'blue' ? 'red' : 'blue'];
  const besieged = c.theirs.some(t => !!UNIT_RULES[t.type].weapon && dist(t.gridPos, home) <= 12);
  if (depot && !besieged && turrets < c.maxTurrets && !mineS.some(s => s.isBlueprint) && c.cores - spent >= structureCost('defense') + 400) {
    const spot = (freePadsFor('defense', c.structures, c.team, c.gridSize) ?? [])
      .filter(p => c.canBuildOn(p.x, p.z) && isInsideEnergyGrid(p, c.team, c.buildings, c.bases.blue, c.bases.red))
      .sort((a, b) => dist(a, enemyHome) - dist(b, enemyHome))[0];
    if (spot) {
      actions.push({ kind: 'order', command: { type: 'PLACE_STRUCTURE', structureType: 'defense', at: spot } });
      spent += structureCost('defense');
    }
  }

  // A new Command HQ on a cleared block one of its units stands by, when rich and teched, or
  // sooner once its building pads are all taken.
  const hqs = mineS.filter(s => s.type === 'hq' && s.health > 0).length;
  if ((c.tier >= 3 || (c.tier >= 2 && c.padsFull)) && hqs < c.maxBases && c.cores - spent >= BASE_SITE.cores + 500 && c.economy[c.team].compute >= BASE_SITE.compute) {
    const site = baseSites(c.buildings, c.structures).find(s => c.mine.some(u => dist(u.gridPos, s.at) <= BASE_SITE.reach - 0.5)
      && !c.theirs.some(t => dist(t.gridPos, s.at) <= 6));
    if (site) {
      actions.push({ kind: 'order', command: { type: 'BUILD_BASE', at: site.at } });
      spent += BASE_SITE.cores;
    }
  }
  return { actions, spent };
}

function densest(units: readonly UnitData[], radius: number): { at: GridPos; value: number } | null {
  let best: { at: GridPos; value: number } | null = null;
  for (const u of units) {
    const v = units.filter(o => dist(o.gridPos, u.gridPos) <= radius).reduce((s, o) => s + value(o), 0);
    if (!best || v > best.value) best = { at: { ...u.gridPos }, value: v };
  }
  return best;
}

