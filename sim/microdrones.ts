// The Wasp's micro-drones: a swarm that hunts on its own and rides along with the Wasp between
// fights, like the Swarm Host's Crawlers but in the air and without anchoring.
//
// A Wasp builds a drone every MICRODRONE.buildMs, launched from its pods, always, up to
// MICRODRONE.max out at once. With no enemy near they circle it as it flies, so it arrives at a
// fight with a full swarm; once an enemy comes within MICRODRONE.seekRadius every drone peels off
// and dives at an enemy near the Wasp, spreading over the targets rather than piling onto one, and
// it keeps launching more at the same rate as the fight goes on. A drone is
// spent when it strikes: it detonates on its target (machine-gun damage by armour, so it hurts
// everything a little, aircraft included) in a small blast (MICRODRONE.blast, well inside a tile)
// that also catches every other enemy there for MICRODRONE.splash of that, so units bunched on one
// tile are all hit, but the next tile over is not. A blast on an aircraft stays in the air and one on the ground stays on the
// ground. A drone never chases further than MICRODRONE.leash from its Wasp. When the fight is over
// the survivors form up round it again. A Wasp that is destroyed takes its swarm down with it, and
// one knocked out by an EMP or stun builds no more until it recovers.
//
// The drones also shield their Wasp (shieldWasps): fire that hits it is taken first by its drones
// within MICRODRONE.shieldRange, each soaking up to MICRODRONE.absorb and spent doing it, so a
// big hit still partly gets through. Once the Wasp is under fire it keeps the MICRODRONE.guard
// drones nearest it back as guards, circling it rather than diving, so the shield lasts the fight.
//
// The drones are small and fragile: Aegis and CIWS guns shoot them out of the air like missiles
// (sim/ciws.ts, swarmThreats), and an enemy force field stops one that dives at a unit inside it.
//
// Pure: CityMap, the headless runner and the balance skirmish keep the swarm, step it each tick
// and apply the damage it reports.

import type { UnitData } from '../types';
import type { AirThreat } from './ciws';
import { isHidden } from './cloak';
import { ForceField, shotBlocked } from './forcefield';
import { damageTakenMultiplier, isEmpDisabled, upgradeDamage } from './unitAbilities';
import { DAMAGE_MULTIPLIER, UNIT_RULES } from './units';

export const MICRODRONE = {
  // Drones a Wasp has out at once, in a fight or not.
  max: 10,
  // One built every this long, whenever it has fewer.
  buildMs: 1500,
  // How far from the Wasp they find enemies, and the furthest they chase one.
  seekRadius: 6,
  leash: 9,
  // Tiles a second, and how close a drone has to get to strike.
  speed: 9,
  hitRange: 0.6,
  // Damage a strike does to its target before armour (machine-gun multipliers), and the share of
  // it every other enemy within `blast` tiles takes. (Infantry chasing a Wasp bunch up, so a full
  // blast would turn the Trooper's edge over it round: sim/balance.test.ts.)
  damage: 14,
  blast: 0.6,
  splash: 0.4,
  // The escort's circle round the Wasp: radius in tiles and one lap's time.
  orbit: 0.9,
  orbitMs: 5000,
  // Fire a drone takes to bring down (sim/ciws.ts ORDNANCE_INTEGRITY).
  integrity: 6,
  // Shielding the Wasp: how near a drone has to be to take fire for it, how much of a hit one
  // soaks before it is spent, how many stay back to guard a Wasp under fire, and for how long
  // after the last hit.
  shieldRange: 1.5,
  absorb: 25,
  guard: 3,
  guardMs: 3000,
};

export type DroneMode = 'escort' | 'attack';

export interface Microdrone {
  id: string;
  waspId: string;
  team: UnitData['team'];
  // Where it is, in fractional tiles.
  at: { x: number; z: number };
  mode: DroneMode;
  targetId: string | null;
  // Its place in the Wasp's escort circle.
  slot: number;
  // Fire it can still take.
  hp: number;
}

export interface Swarm {
  drones: Microdrone[];
  // When each Wasp can build its next drone.
  buildAt: Record<string, number>;
  // When each Wasp last took fire (shieldWasps), for its guards.
  hitAt?: Record<string, number>;
}

export const emptySwarm = (): Swarm => ({ drones: [], buildAt: {}, hitAt: {} });

export interface SwarmTick {
  swarm: Swarm;
  unitDamage: Map<string, number>;
  // Who hit whom, by Wasp, for the pacing report: each unit a blast caught.
  hits: { attackerId: string; targetId: string }[];
  // Drones that struck this tick, where, and at what (for the bursts drawn and heard).
  strikes: { at: { x: number; z: number }; team: UnitData['team']; air: boolean }[];
  // Drones stopped by an enemy force field: where, and where they came from.
  absorbed: { at: { x: number; z: number }; team: UnitData['team']; from: { x: number; z: number } }[];
  // Drones launched this tick, by Wasp.
  launched: { waspId: string; at: { x: number; z: number } }[];
  // Each Wasp whose swarm is fighting, and the enemy nearest it (so attack-move holds there).
  engaged: Map<string, string>;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// `from` moved up to `step` tiles towards `to`.
function toward(from: { x: number; z: number }, to: { x: number; z: number }, step: number) {
  const d = dist(from, to);
  if (d <= step || d === 0) return { x: to.x, z: to.z };
  return { x: from.x + ((to.x - from.x) / d) * step, z: from.z + ((to.z - from.z) / d) * step };
}

// An enemy a Wasp's swarm can go for.
const prey = (wasp: UnitData, t: UnitData) =>
  t.team !== wasp.team && t.team !== 'neutral' && t.health > 0 && !isHidden(t) && !t.decoyActive;

export function swarmTick(
  swarm: Swarm,
  units: readonly UnitData[],
  now: number,
  dtMs: number,
  newId: () => string,
  // Enemy force fields (sim/forcefield.ts).
  fields: readonly ForceField[] = [],
): SwarmTick {
  const byId = new Map(units.map(u => [u.id, u]));
  const wasps = units.filter(u => u.type === 'wasp' && u.health > 0);
  const step = MICRODRONE.speed * (dtMs / 1000);
  const result: SwarmTick = {
    swarm, unitDamage: new Map(), hits: [], strikes: [], absorbed: [], launched: [], engaged: new Map(),
  };

  // A Wasp gone takes its swarm with it.
  let drones = swarm.drones.filter(d => (byId.get(d.waspId)?.health ?? 0) > 0);
  const buildAt: Record<string, number> = {};
  const hitAt: Record<string, number> = {};
  for (const w of wasps) {
    if (swarm.buildAt[w.id] !== undefined) buildAt[w.id] = swarm.buildAt[w.id];
    if (swarm.hitAt?.[w.id] !== undefined) hitAt[w.id] = swarm.hitAt[w.id];
  }

  // The enemies near each Wasp, nearest first.
  const foes = new Map<string, UnitData[]>();
  for (const w of wasps) {
    const near = units.filter(t => prey(w, t) && dist(t.gridPos, w.gridPos) <= MICRODRONE.seekRadius)
      .sort((a, b) => dist(a.gridPos, w.gridPos) - dist(b.gridPos, w.gridPos));
    foes.set(w.id, near);
    if (near.length > 0) result.engaged.set(w.id, near[0].id);
  }

  // Building: always, at the same rate, in a fight or not, up to the full swarm.
  for (const w of wasps) {
    const mine = drones.filter(d => d.waspId === w.id);
    if (mine.length >= MICRODRONE.max || now < (buildAt[w.id] ?? -Infinity) || w.isStunned || isEmpDisabled(w)) continue;
    const taken = new Set(mine.map(d => d.slot));
    let slot = 0;
    while (taken.has(slot)) slot++;
    drones = [...drones, { id: newId(), waspId: w.id, team: w.team, at: { ...w.gridPos }, mode: 'escort', targetId: null, slot, hp: MICRODRONE.integrity }];
    buildAt[w.id] = now + MICRODRONE.buildMs;
    result.launched.push({ waspId: w.id, at: { ...w.gridPos } });
  }

  // How many drones are already on each enemy, so new ones spread out.
  const assigned = new Map<string, number>();
  for (const d of drones) if (d.mode === 'attack' && d.targetId) assigned.set(d.targetId, (assigned.get(d.targetId) ?? 0) + 1);
  // Each drone's place in its Wasp's escort circle, by slot; and, for a Wasp under fire, the
  // drones nearest it that stay back to guard it.
  const rank = new Map<string, number>();
  const escortSize = new Map<string, number>();
  const guards = new Set<string>();
  for (const w of wasps) {
    const mine = drones.filter(d => d.waspId === w.id).sort((a, b) => a.slot - b.slot);
    mine.forEach((d, i) => rank.set(d.id, i));
    escortSize.set(w.id, mine.length);
    if (now - (hitAt[w.id] ?? -Infinity) < MICRODRONE.guardMs) {
      [...mine].sort((a, b) => dist(a.at, w.gridPos) - dist(b.at, w.gridPos)).slice(0, MICRODRONE.guard).forEach(d => guards.add(d.id));
    }
  }

  const next: Microdrone[] = [];
  for (const d of drones) {
    const w = byId.get(d.waspId)!;
    const near = foes.get(w.id)!;
    if (near.length > 0 && !guards.has(d.id)) {
      // Hunt: keep a target still worth chasing, or pick the nearest least-covered one.
      let target = d.targetId ? byId.get(d.targetId) : undefined;
      if (!target || !prey(w, target) || dist(target.gridPos, w.gridPos) > MICRODRONE.leash) {
        if (target && d.targetId) assigned.set(d.targetId, Math.max(0, (assigned.get(d.targetId) ?? 1) - 1));
        target = near.reduce((best, f) => {
          const score = (f: UnitData) => dist(d.at, f.gridPos) * (1 + 0.6 * (assigned.get(f.id) ?? 0));
          return score(f) < score(best) ? f : best;
        }, near[0]);
        assigned.set(target.id, (assigned.get(target.id) ?? 0) + 1);
      }
      if (dist(d.at, target.gridPos) <= MICRODRONE.hitRange + step) {
        // Strike: the drone is spent.
        const air = UNIT_RULES[target.type].armor === 'air';
        if (shotBlocked(fields, d.team, d.at, target.gridPos)) {
          result.absorbed.push({ at: { ...target.gridPos }, team: d.team, from: { ...d.at } });
        } else {
          // Detonate on the target: everything of the other side caught in the blast, in the same
          // layer (air or ground), cloaked units included, unless a force field shelters it.
          const at = target.gridPos;
          for (const v of units) {
            if (v.team === w.team || v.team === 'neutral' || v.health <= 0) continue;
            if ((UNIT_RULES[v.type].armor === 'air') !== air || dist(v.gridPos, at) > MICRODRONE.blast) continue;
            if (v !== target && shotBlocked(fields, d.team, d.at, v.gridPos)) continue;
            const n = (v === target ? 1 : MICRODRONE.splash) * MICRODRONE.damage * DAMAGE_MULTIPLIER.mg[UNIT_RULES[v.type].armor] * upgradeDamage(w) * damageTakenMultiplier(v);
            result.unitDamage.set(v.id, (result.unitDamage.get(v.id) ?? 0) + n);
            result.hits.push({ attackerId: w.id, targetId: v.id });
          }
          result.strikes.push({ at: { ...at }, team: d.team, air });
        }
        continue;
      }
      next.push({ ...d, mode: 'attack', targetId: target.id, at: toward(d.at, target.gridPos, step) });
      continue;
    }
    // No enemy near (or guarding a Wasp under fire): circle the Wasp.
    next.push({ ...d, mode: 'escort', targetId: null, at: toward(d.at, escortPoint(w.gridPos, rank.get(d.id)!, escortSize.get(w.id)!, now), step) });
  }
  result.swarm = { drones: next, buildAt, hitAt };
  return result;
}

// Every Wasp with a full swarm circling it, as one that has had time to build it comes to a fight
// (the balance skirmish starts this way).
export function fullSwarms(units: readonly UnitData[], newId: () => string): Swarm {
  const drones: Microdrone[] = [];
  for (const w of units) {
    if (w.type !== 'wasp' || w.health <= 0) continue;
    for (let slot = 0; slot < MICRODRONE.max; slot++) {
      drones.push({ id: newId(), waspId: w.id, team: w.team, at: escortPoint(w.gridPos, slot, MICRODRONE.max, 0), mode: 'escort', targetId: null, slot, hp: MICRODRONE.integrity });
    }
  }
  return { drones, buildAt: {}, hitAt: {} };
}

// Where escort drone `rank` of `size` flies round a Wasp at `at`, turning slowly.
export function escortPoint(at: { x: number; z: number }, rank: number, size: number, now: number) {
  const angle = (rank / Math.max(1, size)) * Math.PI * 2 + (now / MICRODRONE.orbitMs) * Math.PI * 2;
  return { x: at.x + Math.cos(angle) * MICRODRONE.orbit, z: at.z + Math.sin(angle) * MICRODRONE.orbit };
}

// Fire on the Wasps this tick (`damage`, by unit id), taken first by their drones: each drone within
// MICRODRONE.shieldRange of its Wasp, nearest first, soaks up to MICRODRONE.absorb of it and is
// spent. Returns the damage left for the units, the drones spent, and the swarm, which remembers
// each Wasp hit (so it keeps guards back).
export function shieldWasps(swarm: Swarm, damage: ReadonlyMap<string, number>, units: readonly UnitData[], now: number):
  { swarm: Swarm; damage: Map<string, number>; spent: Microdrone[] } {
  const left = new Map(damage);
  const spent: Microdrone[] = [];
  const hitAt = { ...(swarm.hitAt ?? {}) };
  let changed = false;
  for (const w of units) {
    if (w.type !== 'wasp' || w.health <= 0) continue;
    let incoming = left.get(w.id) ?? 0;
    if (incoming <= 0) continue;
    hitAt[w.id] = now;
    changed = true;
    const shields = swarm.drones.filter(d => d.waspId === w.id && dist(d.at, w.gridPos) <= MICRODRONE.shieldRange)
      .sort((a, b) => dist(a.at, w.gridPos) - dist(b.at, w.gridPos));
    for (const d of shields) {
      if (incoming <= 0) break;
      incoming -= Math.min(incoming, MICRODRONE.absorb);
      spent.push(d);
    }
    left.set(w.id, incoming);
  }
  if (!changed) return { swarm, damage: left, spent };
  const gone = new Set(spent.map(d => d.id));
  return { swarm: { ...swarm, drones: swarm.drones.filter(d => !gone.has(d.id)), hitAt }, damage: left, spent };
}

// The drones as targets for the Aegis and CIWS guns.
export const swarmThreats = (swarm: Swarm): AirThreat[] =>
  swarm.drones.map(d => ({ id: d.id, team: d.team, at: d.at, kind: 'microdrone' as const }));

// Fire taken by drones (by id). Those that come apart are gone, and reported.
export function damageDrones(swarm: Swarm, damage: ReadonlyMap<string, number>): { swarm: Swarm; downed: Microdrone[] } {
  if (!swarm.drones.some(d => damage.has(d.id))) return { swarm, downed: [] };
  const downed: Microdrone[] = [];
  const drones: Microdrone[] = [];
  for (const d of swarm.drones) {
    const n = damage.get(d.id);
    if (!n) { drones.push(d); continue; }
    if (d.hp - n <= 0) downed.push(d);
    else drones.push({ ...d, hp: d.hp - n });
  }
  return { swarm: { ...swarm, drones }, downed };
}

// How many drones a Wasp has out, for its menu.
export const dronesOf = (swarm: Swarm, waspId: string) => swarm.drones.filter(d => d.waspId === waspId).length;
