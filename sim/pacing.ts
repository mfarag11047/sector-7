// Match pacing report: a record of when a match's big moments happen and what each unit type
// did, for checking that a match flows and hits its timing goals. Fed once a tick by the game
// (CityMap.tsx, and headless matches); nothing here changes the match.
//
//   - Milestones: core and server nodes captured and lost, tiers researched, structures finished
//     and destroyed, first combat, first unit lost, Command HQs built and lost, the computer
//     players' army strategies and changes of strategy, the result.
//   - Snapshots every SAMPLE_MS: units, army value, cores, compute, tier, nodes held, per side.
//   - Unit stats, per side and unit type: how many started, were trained, died, and the damage
//     they dealt to enemy units and to enemy structures.
//
// Damage attribution: the game reports who hit whom each tick (recordHit, recordArea). Each
// unit's or structure's lost health is split among whoever hit it in the last HIT_WINDOW_MS
// (the live game's state can trail its weapons by a render or two), or else whoever hit it last
// within ATTRIBUTION_MS. Damage nobody can be named for (doctrine powers, force-field
// shocks, the Black Wall virus) is kept as 'other'. The neutral drones guarding server nodes are
// tallied on their own: the damage they deal and how many of them die.

import type { BuildingData, StructureData, UnitData } from '../types';
import type { GridPos, Team } from './commands';
import type { Economy } from './economy';
import { UNIT_STATS } from '../constants';
import { type AiStrategy, strategyArmy } from './aiStrategy';
import { upgradeDef } from './upgrades';

export const SAMPLE_MS = 30_000;
const ATTRIBUTION_MS = 3_000;
const HIT_WINDOW_MS = 1_000;
// Units on the map in the first moments of the match (from the first tick that has any, since
// the live game takes a moment to set the map up) count as the starting force.
const START_WINDOW_MS = 1_500;

export interface PacingEvent {
  atMs: number;
  team: Team | null;
  kind: 'core_captured' | 'core_lost' | 'server_captured' | 'server_lost' | 'tier' | 'upgrade' | 'structure_built' | 'structure_destroyed'
    | 'first_combat' | 'first_loss' | 'first_kill' | 'base_built' | 'victory' | 'strategy' | 'note';
  text: string;
}

export interface TeamSample {
  units: number;
  armyValue: number;
  cores: number;
  compute: number;
  tier: number;
  coreNodes: number;
  serverNodes: number;
}
export interface PacingSample { atMs: number; blue: TeamSample; red: TeamSample }

export interface UnitTally { started: number; trained: number; died: number; damageToUnits: number; damageToStructures: number }

export interface PacingRecord {
  events: PacingEvent[];
  samples: PacingSample[];
  // By side, then by unit type (or structure type, for HQs and turrets, or 'other').
  tallies: Record<Team, Record<string, UnitTally>>;
  // The neutral server-node guards.
  neutral: UnitTally;
  // Internal bookkeeping.
  lastSampleMs: number;
  seen: Map<string, { type: string; team: Owner; kind: 'unit' | 'structure' }>;
  health: Map<string, number>;
  // Target id -> attacker id -> when it last hit.
  recentHits: Map<string, Map<string, number>>;
  lastHit: Map<string, { attackerId: string; atMs: number }>;
  // When each unit or structure last lost health, by any means.
  hurtAt: Map<string, number>;
  owners: Map<string, BuildingData['owner']>;
  tiers: Record<Team, number>;
  builtTypes: Record<Team, Set<string>>;
  firsts: Set<string>;
  nowMs: number;
  // The first tick with anything on the map.
  startMs: number | null;
}

type Owner = UnitData['team'];

const emptyTally = (): UnitTally => ({ started: 0, trained: 0, died: 0, damageToUnits: 0, damageToStructures: 0 });

export const freshPacing = (): PacingRecord => ({
  events: [], samples: [], tallies: { blue: {}, red: {} }, neutral: emptyTally(), lastSampleMs: -Infinity,
  seen: new Map(), health: new Map(), recentHits: new Map(), lastHit: new Map(), hurtAt: new Map(), owners: new Map(),
  tiers: { blue: 1, red: 1 }, builtTypes: { blue: new Set(), red: new Set() }, firsts: new Set(), nowMs: 0, startMs: null,
});

const isSide = (t: unknown): t is Team => t === 'blue' || t === 'red';
const sideName = (t: Team) => (t === 'blue' ? 'Blue' : 'Red');
const tally = (r: PacingRecord, team: Owner, type: string) =>
  team === 'neutral' ? r.neutral : (r.tallies[team][type] ??= emptyTally());

export function recordEvent(r: PacingRecord, team: Team | null, kind: PacingEvent['kind'], text: string) {
  r.events.push({ atMs: r.nowMs, team, kind, text });
}

// `attackerId` (a unit or structure) hit `targetId` this tick.
export function recordHit(r: PacingRecord, attackerId: string, targetId: string) {
  if (!attackerId || !targetId) return;
  const hits = r.recentHits.get(targetId) ?? new Map<string, number>();
  hits.set(attackerId, r.nowMs);
  r.recentHits.set(targetId, hits);
  // Also the fallback for damage that only shows up later (the live game's state can trail).
  r.lastHit.set(targetId, { attackerId, atMs: r.nowMs });
}

// Everything of the other side within `radius` tiles of `at` was hit by `attackerId`.
export function recordArea(r: PacingRecord, attackerId: string, team: UnitData['team'], at: GridPos, radius: number,
  units: readonly UnitData[], structures: readonly StructureData[]) {
  for (const u of units) if (u.team !== team && u.health > 0 && Math.hypot(u.gridPos.x - at.x, u.gridPos.z - at.z) <= radius) recordHit(r, attackerId, u.id);
  for (const s of structures) if (s.team !== team && s.health > 0 && Math.hypot(s.gridPos.x - at.x, s.gridPos.z - at.z) <= radius + 1) recordHit(r, attackerId, s.id);
}

export interface PacingState {
  units: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
  economy: Economy;
}

// One tick of bookkeeping, at `nowMs` into the match.
export function pacingTick(r: PacingRecord, nowMs: number, s: PacingState) {
  r.nowMs = nowMs;
  const alive = new Set<string>();

  // --- Units and structures: arrivals, damage, deaths ---
  const current: { id: string; type: string; team: Owner; kind: 'unit' | 'structure'; health: number; ready: boolean }[] = [];
  for (const u of s.units) if (u.health > 0) current.push({ id: u.id, type: u.type, team: u.team, kind: 'unit', health: u.health, ready: true });
  for (const st of s.structures) {
    if (!isSide(st.team) || st.health <= 0) continue;
    const ready = !st.isBlueprint && !((st.buildRemainingMs || 0) > 0);
    current.push({ id: st.id, type: st.type, team: st.team, kind: 'structure', health: st.health, ready });
  }
  if (r.startMs === null && current.length > 0) r.startMs = nowMs;
  const opening = r.startMs !== null && nowMs - r.startMs <= START_WINDOW_MS;
  for (const c of current) {
    alive.add(c.id);
    if (!r.seen.has(c.id)) {
      r.seen.set(c.id, { type: c.type, team: c.team, kind: c.kind });
      if (c.kind === 'unit' && isSide(c.team)) {
        if (opening) tally(r, c.team, c.type).started++;
        else tally(r, c.team, c.type).trained++;
      }
    }
    // A structure counts as built once it is finished; the first of each type is a milestone.
    if (c.kind === 'structure' && isSide(c.team) && c.ready && !r.builtTypes[c.team].has(c.id)) {
      r.builtTypes[c.team].add(c.id);
      if (!opening) {
        const firstOfType = !r.firsts.has(`built-${c.team}-${c.type}`);
        r.firsts.add(`built-${c.team}-${c.type}`);
        if (c.type === 'hq') recordEvent(r, c.team, 'base_built', `${sideName(c.team)} built a new Command HQ`);
        else if (firstOfType) recordEvent(r, c.team, 'structure_built', `${sideName(c.team)} finished its first ${structureLabel(c.type)}`);
      }
    }
    const before = r.health.get(c.id);
    if (before !== undefined && c.health < before) {
      attribute(r, c.id, before - c.health);
      r.hurtAt.set(c.id, nowMs);
    }
    r.health.set(c.id, c.health);
  }
  // Gone since last tick: the killing blow is the health it had left.
  for (const [id, hp] of r.health) {
    if (alive.has(id)) continue;
    const info = r.seen.get(id);
    r.health.delete(id);
    if (!info) continue;
    // A structure nobody has hit lately didn't fall. The live game's copy of the structure list
    // can drop a just-placed one for a tick, and it comes straight back.
    const hitLately = r.recentHits.has(id) || nowMs - (r.hurtAt.get(id) ?? -Infinity) <= ATTRIBUTION_MS;
    r.hurtAt.delete(id);
    if (info.kind === 'structure' && !hitLately) continue;
    // Only a kill if someone hit it; units also leave by detonating or being replaced.
    const killers = hp > 0 ? attribute(r, id, hp, true) : [];
    if (info.team === 'neutral') r.neutral.died++;
    else if (info.kind === 'unit') {
      tally(r, info.team, info.type).died++;
      if (!r.firsts.has(`loss-${info.team}`)) {
        r.firsts.add(`loss-${info.team}`);
        recordEvent(r, info.team, 'first_loss', `${sideName(info.team)} lost its first unit (${unitLabel(info.type)})`);
      }
      const killer: Team = info.team === 'blue' ? 'red' : 'blue';
      if (killers.includes(killer) && !r.firsts.has(`kill-${killer}`)) {
        r.firsts.add(`kill-${killer}`);
        recordEvent(r, killer, 'first_kill', `${sideName(killer)} made its first kill`);
      }
    } else {
      recordEvent(r, info.team, 'structure_destroyed', `${sideName(info.team)} lost a ${structureLabel(info.type)}`);
    }
  }
  for (const [target, hits] of r.recentHits) {
    for (const [attacker, at] of hits) if (nowMs - at >= HIT_WINDOW_MS) hits.delete(attacker);
    if (hits.size === 0 || !alive.has(target)) r.recentHits.delete(target);
  }

  // --- Nodes changing hands ---
  for (const b of s.buildings) {
    if (b.type !== 'core_node' && b.type !== 'server_node') continue;
    const was = r.owners.get(b.id) ?? null;
    const now = b.destroyed ? null : b.owner;
    if (was === now) continue;
    r.owners.set(b.id, now);
    const core = b.type === 'core_node';
    const held = (t: Team) => s.buildings.filter(x => x.type === b.type && x.owner === t && !x.destroyed).length;
    if (isSide(was)) recordEvent(r, was, core ? 'core_lost' : 'server_lost', `${sideName(was)} lost a ${core ? 'core' : 'server'} node (now holds ${held(was)})`);
    if (isSide(now)) recordEvent(r, now, core ? 'core_captured' : 'server_captured', `${sideName(now)} captured a ${core ? 'core' : 'server'} node (now holds ${held(now)})`);
  }

  // --- Tiers ---
  for (const t of ['blue', 'red'] as const) {
    const tier = s.economy[t].tier;
    if (tier > r.tiers[t]) {
      r.tiers[t] = tier;
      recordEvent(r, t, 'tier', `${sideName(t)} researched Tier ${tier}`);
    }
    // Unit upgrades from Advanced Research (sim/upgrades.ts).
    for (const id of s.economy[t].upgrades ?? []) {
      if (r.firsts.has(`upgrade:${t}:${id}`)) continue;
      r.firsts.add(`upgrade:${t}:${id}`);
      const def = upgradeDef(id);
      if (def) recordEvent(r, t, 'upgrade', `${sideName(t)} researched ${def.name} (${UNIT_STATS[def.unit].label})`);
    }
  }

  // --- Snapshots, on the first tick of every SAMPLE_MS ---
  const bucket = Math.floor(nowMs / SAMPLE_MS) * SAMPLE_MS;
  if (bucket > r.lastSampleMs) {
    r.lastSampleMs = bucket;
    r.samples.push({ atMs: nowMs, blue: sample(s, 'blue'), red: sample(s, 'red') });
  }
}

// Splits `amount` of damage to `targetId` among whoever hit it; returns their sides.
function attribute(r: PacingRecord, targetId: string, amount: number, needsHitter = false): Owner[] {
  const target = r.seen.get(targetId);
  if (!target) return [];
  let attackers = [...(r.recentHits.get(targetId) ?? [])].filter(([, at]) => r.nowMs - at <= HIT_WINDOW_MS).map(([id]) => id).filter(id => r.seen.get(id) && r.seen.get(id)!.team !== target.team);
  if (attackers.length > 0) r.lastHit.set(targetId, { attackerId: attackers[attackers.length - 1], atMs: r.nowMs });
  else {
    const last = r.lastHit.get(targetId);
    if (last && r.nowMs - last.atMs <= ATTRIBUTION_MS && r.seen.get(last.attackerId) && r.seen.get(last.attackerId)!.team !== target.team) attackers = [last.attackerId];
  }
  if (needsHitter && attackers.length === 0) return [];
  const enemy: Team = target.team === 'blue' ? 'red' : 'blue';
  const sidesFought = isSide(target.team) && attackers.some(id => isSide(r.seen.get(id)!.team));
  if (sidesFought && !r.firsts.has('combat')) {
    r.firsts.add('combat');
    recordEvent(r, null, 'first_combat', 'First combat between the two sides');
  }
  const share = amount / Math.max(1, attackers.length);
  const credit = (type: string, team: Owner) => {
    const t = tally(r, team, type);
    if (target.kind === 'unit') t.damageToUnits += share; else t.damageToStructures += share;
  };
  if (attackers.length === 0) {
    if (isSide(target.team)) credit('other', enemy);
    return [];
  }
  return attackers.map(id => {
    const a = r.seen.get(id)!;
    credit(a.type, a.team);
    return a.team;
  });
}

function sample(s: PacingState, team: Team): TeamSample {
  const units = s.units.filter(u => u.team === team && u.health > 0);
  return {
    units: units.length,
    armyValue: Math.round(units.reduce((v, u) => v + (UNIT_STATS[u.type]?.cost || 0) * (u.health / u.maxHealth), 0)),
    cores: Math.round(s.economy[team].cores),
    compute: Math.round(s.economy[team].compute),
    tier: s.economy[team].tier,
    coreNodes: s.buildings.filter(b => b.type === 'core_node' && b.owner === team && !b.destroyed).length,
    serverNodes: s.buildings.filter(b => b.type === 'server_node' && b.owner === team && !b.destroyed).length,
  };
}

const STRUCTURE_LABELS: Record<string, string> = {
  hq: 'Command HQ', infantry: 'Barracks', armor: 'Factory', air: 'Airpad', support: 'Comm Link', builder: 'Depot',
  ordnance_fab: 'Ordnance Fab', research_lab: 'Advanced Research', defense: 'Sentry Turret', aa_turret: 'AA Turret', wall_tier1: 'Wall', wall_tier2: 'Wall',
  base_wall: 'Base Wall', base_gate: 'Blast Gate',
};
export const structureLabel = (type: string) => STRUCTURE_LABELS[type] ?? type;
export const unitLabel = (type: string) =>
  type === 'other' ? 'Other (powers, fields, virus)' : (UNIT_STATS as Record<string, { label: string }>)[type]?.label ?? structureLabel(type);

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// The whole report as plain text, for copying out of the game.
export function pacingText(r: PacingRecord, title = 'Match pacing report'): string {
  const lines: string[] = [`# ${title}`, '', `Length: ${clock(r.nowMs)}`, '', '## Milestones'];
  for (const e of r.events) lines.push(`${clock(e.atMs).padStart(6)}  ${e.text}`);
  lines.push('', '## Snapshots', 'time   | side | units | army value | cores | compute | tier | core nodes | server nodes');
  for (const s of r.samples) {
    for (const t of ['blue', 'red'] as const) {
      const x = s[t];
      lines.push(`${clock(s.atMs).padStart(6)} | ${t.padEnd(4)} | ${String(x.units).padStart(5)} | ${String(x.armyValue).padStart(10)} | ${String(x.cores).padStart(5)} | ${String(x.compute).padStart(7)} | ${x.tier}    | ${String(x.coreNodes).padStart(10)} | ${x.serverNodes}`);
    }
  }
  lines.push('', '## Units', 'side | unit | started | trained | died | damage to units | damage to structures');
  for (const t of ['blue', 'red'] as const) {
    for (const [type, x] of Object.entries(r.tallies[t]).sort((a, b) => (b[1].damageToUnits + b[1].damageToStructures) - (a[1].damageToUnits + a[1].damageToStructures))) {
      lines.push(`${t} | ${unitLabel(type)} | ${x.started} | ${x.trained} | ${x.died} | ${Math.round(x.damageToUnits)} | ${Math.round(x.damageToStructures)}`);
    }
  }
  lines.push(`neutral | Server node guards | - | - | ${r.neutral.died} | ${Math.round(r.neutral.damageToUnits)} | 0`);
  return lines.join('\n');
}

// Who hit whom this tick, from every weapon the game resolves with a known shooter.
export interface WeaponHits {
  fired?: ReadonlyMap<string, string>;
  shots?: readonly { attackerId: string; targetId: string }[];
  ciws?: readonly { gunId: string; targetId: string; ordnance: boolean }[];
  // Area hits: shells, rockets, missiles, bombs, crawler blasts.
  blasts?: readonly { attackerId: string; team: UnitData['team']; at: GridPos; radius: number }[];
  // Helios microwave beams: the Helios, and the radius it cooks.
  beams?: readonly { attackerId: string; team: UnitData['team']; at: GridPos; radius: number }[];
}

export function recordWeaponHits(r: PacingRecord, hits: WeaponHits, units: readonly UnitData[], structures: readonly StructureData[]) {
  hits.fired?.forEach((target, attacker) => { if (target) recordHit(r, attacker, target); });
  for (const s of hits.shots ?? []) recordHit(r, s.attackerId, s.targetId);
  for (const l of hits.ciws ?? []) if (!l.ordnance) recordHit(r, l.gunId, l.targetId);
  for (const b of [...(hits.blasts ?? []), ...(hits.beams ?? [])]) recordArea(r, b.attackerId, b.team, b.at, b.radius, units, structures);
}

// A computer player's army strategy, newly picked or changed (sim/aiStrategy.ts). `logged` is the
// strategy log in its memory; entries past `seen` are new. Returns how many there are now.
export function recordStrategies(r: PacingRecord, team: Team, logged: readonly { strategy: AiStrategy; reason: string }[], seen: number): number {
  for (const e of logged.slice(seen)) {
    const army = strategyArmy(e.strategy);
    recordEvent(r, team, 'strategy', e.reason === 'opening plan'
      ? `${sideName(team)} plans ${army}`
      : `${sideName(team)} switches to ${army}: ${e.reason}`);
  }
  return logged.length;
}

// The match result, as the closing milestone.
export function recordVictory(r: PacingRecord, winner: Team) {
  recordEvent(r, winner, 'victory', `${sideName(winner)} won by destroying every enemy Command HQ`);
}

// The report as plain data, for saving to a file.
export const pacingJson = (r: PacingRecord) => ({
  lengthMs: r.nowMs, events: r.events, samples: r.samples, units: r.tallies, serverNodeGuards: r.neutral,
});
