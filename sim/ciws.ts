// Close-in weapon system (CIWS): an automatic rotary cannon, on the Aegis and on the Depot-built
// CIWS turret.
//
// A working Aegis (its radar on, see sim/radar.ts) hoses down any enemy aircraft or large
// ordnance in flight that comes within CIWS.range tiles, incoming missiles first. It fires in a
// sustained burst until the magazine runs dry, then must stop and reload. After a lull it tops
// the magazine back up on its own.
//
// Pure: it reads the state it is given and reports damage and gun state. The caller keeps the
// ordnance in flight and its remaining integrity (how much more fire it takes to knock down).

import { ForceField, shotBlocked } from './forcefield';
import type { StructureData, UnitData } from '../types';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { isRadarActive } from './radar';
import { damageTakenMultiplier, upgradeDamage, fireRateMultiplier, rangeBonus } from './unitAbilities';
import { DAMAGE_MULTIPLIER, UNIT_RULES } from './units';

export const CIWS = {
  range: 10,
  // Damage per second of fire. Aircraft are armoured and evasive; missiles, shells and pods
  // are what the gun is built for, so they come apart much faster.
  airDps: 32,
  ordnanceDps: 60,
  // Seconds of continuous fire in one magazine, and the reload when it runs dry.
  burstMs: 3500,
  reloadMs: 6000,
  // A part-used magazine is topped up after this long without firing.
  topUpMs: 4000,
  // CIWS turrets only: how far they reach to fall back on ground units, when the sky is clear.
  groundRange: 6,
  // Rounds a second, for drawing the tracer stream.
  roundsPerSecond: 75,
};

// How much fire each kind of ordnance takes to knock down.
// A missile takes 2 s of fire; one magazine (3.5 s) brings down anything.
export const ORDNANCE_INTEGRITY = { missile: 120, shell: 30, pod: 180 } as const;
export type OrdnanceKind = keyof typeof ORDNANCE_INTEGRITY;

// Something in the air the gun can shoot at: in fractional tiles.
export interface AirThreat {
  id: string;
  team: UnitData['team'];
  at: { x: number; z: number };
  kind: OrdnanceKind;
}

export interface CiwsLink { gunId: string; targetId: string; ordnance: boolean; fromStructure: boolean }

type GunState = Pick<UnitData, 'ciwsUsedMs' | 'ciwsReloadUntil' | 'ciwsLastFiredAt' | 'ciwsTargetId'>;

export interface CiwsResult {
  // New gun state for each Aegis, and each CIWS turret, whose state changed.
  updates: Map<string, GunState>;
  structureUpdates: Map<string, GunState>;
  unitDamage: Map<string, number>;
  ordnanceDamage: Map<string, number>;
  // Who is firing at what this tick, for the tracer stream.
  links: CiwsLink[];
}

const tiles = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const ciwsReloading = (u: GunState, now: number) => (u.ciwsReloadUntil ?? 0) > now;
// Share of the magazine left, 0 to 1 (0 while reloading).
export const ciwsMagazine = (u: GunState, now: number) => (ciwsReloading(u, now) ? 0 : 1 - Math.min(1, (u.ciwsUsedMs ?? 0) / CIWS.burstMs));

// A finished CIWS turret that can fire.
export const isCiwsTurretReady = (s: StructureData) =>
  s.type === 'aa_turret' && s.health > 0 && !s.isBlueprint && (s.buildRemainingMs || 0) <= 0 && !s.dismantle;

interface Gun {
  id: string;
  team: UnitData['team'];
  at: GridPos;
  state: GunState;
  structure: boolean;
  range: number;
  fireRate: number;
  // Damage multiplier from the carrier's upgrades (1 for the turret).
  power: number;
}

// One tick of every Aegis and CIWS turret. Turrets carry their own tracking radar, so they need
// no Aegis nearby; with nothing in the air they fall back on nearby ground units, at a fraction
// of the damage.
export function ciwsTick(
  units: readonly UnitData[],
  ordnance: readonly AirThreat[],
  now: number,
  dtMs: number,
  structures: readonly StructureData[] = [],
  // Enemy force fields (sim/forcefield.ts): the guns can't shoot into one from outside.
  fields: readonly ForceField[] = [],
): CiwsResult {
  const result: CiwsResult = { updates: new Map(), structureUpdates: new Map(), unitDamage: new Map(), ordnanceDamage: new Map(), links: [] };
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);
  const stateOf = (g: GunState): GunState => ({ ciwsUsedMs: g.ciwsUsedMs ?? 0, ciwsReloadUntil: g.ciwsReloadUntil ?? 0, ciwsLastFiredAt: g.ciwsLastFiredAt ?? 0, ciwsTargetId: g.ciwsTargetId ?? null });

  const guns: (Gun & { active: boolean })[] = [];
  for (const u of units) {
    if (u.type !== 'aegis') continue;
    guns.push({ id: u.id, team: u.team, at: u.gridPos, state: stateOf(u), structure: false, range: CIWS.range + rangeBonus(u), fireRate: fireRateMultiplier(u), power: upgradeDamage(u), active: isRadarActive(u) });
  }
  for (const s of structures) {
    if (s.type !== 'aa_turret') continue;
    guns.push({ id: s.id, team: s.team, at: s.gridPos, state: stateOf(s), structure: true, range: CIWS.range, fireRate: 1, power: 1, active: isCiwsTurretReady(s) });
  }

  for (const gun of guns) {
    const state = gun.state;
    const before = JSON.stringify(state);
    const done = () => { if (JSON.stringify(state) !== before) (gun.structure ? result.structureUpdates : result.updates).set(gun.id, state); };

    if (!gun.active || (state.ciwsReloadUntil ?? 0) > now) { state.ciwsTargetId = null; done(); continue; }
    if ((state.ciwsUsedMs ?? 0) > 0 && now - (state.ciwsLastFiredAt ?? 0) >= CIWS.topUpMs) state.ciwsUsedMs = 0;

    // Incoming ordnance first (it is about to land on something), then the nearest aircraft,
    // then, for turrets only, the nearest ground unit.
    let target: { id: string; ordnance: boolean; ground: boolean } | null = null;
    let best = Infinity;
    for (const o of ordnance) {
      if (o.team === gun.team) continue;
      const d = tiles(gun.at, o.at);
      if (shotBlocked(fields, gun.team, gun.at, o.at)) continue;
      if (d <= gun.range && d < best) { best = d; target = { id: o.id, ordnance: true, ground: false }; }
    }
    const pickUnit = (air: boolean, range: number) => {
      for (const t of units) {
        if (t.team === gun.team || t.health <= 0 || isHidden(t) || (UNIT_RULES[t.type].armor === 'air') !== air) continue;
        const d = tiles(gun.at, t.gridPos);
        if (shotBlocked(fields, gun.team, gun.at, t.gridPos)) continue;
        // Stick with the current target rather than flicking between equals.
        const score = t.id === state.ciwsTargetId ? d - 1 : d;
        if (d <= range && score < best) { best = score; target = { id: t.id, ordnance: false, ground: !air }; }
      }
    };
    if (!target) pickUnit(true, gun.range);
    if (!target && gun.structure) pickUnit(false, CIWS.groundRange);
    if (!target) { state.ciwsTargetId = null; done(); continue; }
    const hit: { id: string; ordnance: boolean; ground: boolean } = target;

    const rate = gun.fireRate * (dtMs / 1000);
    if (hit.ordnance) add(result.ordnanceDamage, hit.id, CIWS.ordnanceDps * rate);
    else {
      const victim = units.find(t => t.id === hit.id)!;
      // Against ground units the rounds are far less effective: flak multipliers, then halved.
      const dps = hit.ground ? (CIWS.airDps / 2) * DAMAGE_MULTIPLIER.flak[UNIT_RULES[victim.type].armor] : CIWS.airDps;
      add(result.unitDamage, hit.id, dps * gun.power * rate * damageTakenMultiplier(victim));
    }
    result.links.push({ gunId: gun.id, targetId: hit.id, ordnance: hit.ordnance, fromStructure: gun.structure });
    state.ciwsTargetId = hit.id;
    state.ciwsLastFiredAt = now;
    state.ciwsUsedMs = (state.ciwsUsedMs ?? 0) + dtMs;
    if (state.ciwsUsedMs >= CIWS.burstMs) {
      // Magazine empty: stop and reload.
      state.ciwsUsedMs = 0;
      state.ciwsReloadUntil = now + CIWS.reloadMs;
    }
    done();
  }
  return result;
}

// Apply a tick's gun state to the units, or to the structures.
export const applyCiwsState = <T extends { id: string }>(list: T[], updates: Map<string, GunState>): T[] =>
  updates.size === 0 ? list : list.map(x => { const s = updates.get(x.id); return s ? { ...x, ...s } : x; });
