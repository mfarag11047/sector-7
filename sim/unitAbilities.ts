// Abilities for the playable build's new units: Strike Troopers, Lancers, Razorbacks, Aegis
// and Hornets.
//
// Each unit has two. The first unlocks at the tier the unit itself unlocks; the second, more
// powerful one at the next tier, so a unit grows stronger as its side researches.
//
// Most abilities give the unit a timed buff, which combat (sim/combat.ts) and movement
// (sim/movement.ts) read: faster firing, more damage, less damage taken, more speed or range.
// Two are aimed at a tile: the Lancer's EMP rocket and the Hornet's Hellfire salvo.
//
// Orders arrive as UNIT_ABILITY commands and are checked here like every other ability:
// the sender's units, the right type, the tier researched, off cooldown, in range.

import { UNIT_STATS } from '../constants';
import type { UnitData, UnitType } from '../types';
import type { GridPos, Team } from './commands';
import { shotDamage, Tier, UNIT_RULES } from './units';

export type BuffKind = 'stim' | 'nanoweave' | 'overcharge' | 'nitro' | 'overclock' | 'barrage' | 'radar' | 'afterburner' | 'emp';
export interface Buff { kind: BuffKind; until: number }

export type UnitAbilityId = 'stim' | 'nanoweave' | 'overcharge' | 'emp_rocket' | 'nitro' | 'overclock' | 'barrage' | 'radar' | 'afterburner' | 'hellfire';

export interface UnitAbilityDef {
  id: UnitAbilityId;
  unit: UnitType;
  name: string;
  tier: Tier;
  cooldownMs: number;
  // How long the buff lasts (0 for an instant strike).
  durationMs: number;
  // Aimed at a tile within `range`, hitting everything within `radius` of it.
  targeted?: { range: number; radius: number };
  description: string;
}

export const UNIT_ABILITIES: readonly UnitAbilityDef[] = [
  { id: 'stim', unit: 'trooper', name: 'Stim Injector', tier: 1, cooldownMs: 30_000, durationMs: 6_000,
    description: 'Combat stims: +50% fire rate and +30% speed for 6s. Costs 15 health.' },
  { id: 'nanoweave', unit: 'trooper', name: 'Nano-Weave Mesh', tier: 2, cooldownMs: 40_000, durationMs: 6_000,
    description: 'Armour weave hardens on impact: takes 50% less damage for 6s.' },

  { id: 'overcharge', unit: 'lancer', name: 'Overcharged Warhead', tier: 2, cooldownMs: 25_000, durationMs: 15_000,
    description: 'Routes the suit battery into the next rocket: 2.5x damage.' },
  { id: 'emp_rocket', unit: 'lancer', name: 'EMP Tandem Rocket', tier: 3, cooldownMs: 45_000, durationMs: 4_000, targeted: { range: 6, radius: 2 },
    description: 'Electromagnetic pulse warhead: vehicles and aircraft in the blast shut down for 4s, unable to move or fire.' },

  { id: 'nitro', unit: 'razorback', name: 'Nitro Injection', tier: 1, cooldownMs: 25_000, durationMs: 5_000,
    description: '+80% speed for 5s. Hit, run, or close the gap.' },
  { id: 'overclock', unit: 'razorback', name: 'Overclocked Autogun', tier: 2, cooldownMs: 35_000, durationMs: 6_000,
    description: 'Disables the thermal limiter: double fire rate for 6s.' },

  { id: 'barrage', unit: 'aegis', name: 'Flak Barrage', tier: 2, cooldownMs: 30_000, durationMs: 6_000,
    description: 'Overdrives the rotary cannon: double rate of fire for 6s.' },
  { id: 'radar', unit: 'aegis', name: 'Sky-Net Radar Sweep', tier: 3, cooldownMs: 40_000, durationMs: 10_000,
    description: 'Phased-array sweep: vision 14 and +2 weapon range for 10s.' },

  { id: 'afterburner', unit: 'hornet', name: 'Afterburners', tier: 2, cooldownMs: 25_000, durationMs: 5_000,
    description: '+70% speed for 5s. Get out of flak range.' },
  { id: 'hellfire', unit: 'hornet', name: 'Hellfire Salvo', tier: 3, cooldownMs: 40_000, durationMs: 0, targeted: { range: 6, radius: 1.5 },
    description: 'Ripple-fires the rocket pods: heavy anti-armour damage to every enemy ground unit in the area.' },
];

export const abilitiesFor = (type: UnitType) => UNIT_ABILITIES.filter(a => a.unit === type);
export const abilityDef = (id: string) => UNIT_ABILITIES.find(a => a.id === id);

// Hellfire: AP damage before armour.
export const HELLFIRE_DAMAGE = 90;
export const STIM_HEALTH_COST = 15;
const OVERCHARGE_MULTIPLIER = 2.5;

// --- Buffs as the rest of the game reads them ---

export const hasBuff = (u: { buffs?: Buff[] }, kind: BuffKind) => !!u.buffs?.some(b => b.kind === kind);

// Weapon cooldowns are divided by this.
export const fireRateMultiplier = (u: { buffs?: Buff[] }) =>
  (hasBuff(u, 'stim') ? 1.5 : 1) * (hasBuff(u, 'overclock') ? 2 : 1) * (hasBuff(u, 'barrage') ? 2 : 1);
export const damageMultiplier = (u: { buffs?: Buff[] }) => (hasBuff(u, 'overcharge') ? OVERCHARGE_MULTIPLIER : 1);
export const damageTakenMultiplier = (u: { buffs?: Buff[] }) => (hasBuff(u, 'nanoweave') ? 0.5 : 1);
export const speedBuffMultiplier = (u: { buffs?: Buff[] }) =>
  hasBuff(u, 'emp') ? 0 : (hasBuff(u, 'stim') ? 1.3 : 1) * (hasBuff(u, 'nitro') ? 1.8 : 1) * (hasBuff(u, 'afterburner') ? 1.7 : 1);
export const rangeBonus = (u: { buffs?: Buff[] }) => (hasBuff(u, 'radar') ? 2 : 0);
export const visionOf = (u: UnitData) => (hasBuff(u, 'radar') ? Math.max(u.visionRange, 14) : u.visionRange);
// Shut down by an EMP: can neither move nor fire.
export const isEmpDisabled = (u: { buffs?: Buff[] }) => hasBuff(u, 'emp');

// Units an EMP blast at `at` knocks out: the other side's living vehicles and aircraft, anything
// that runs on a battery. Infantry shrug it off.
export const empVictims = (units: readonly UnitData[], at: GridPos, radius: number, team: UnitData['team']) =>
  units.filter(u => u.team !== team && u.health > 0 && UNIT_RULES[u.type].armor !== 'infantry' &&
    Math.hypot(u.gridPos.x - at.x, u.gridPos.z - at.z) <= radius);

// Drops expired buffs. Returns the same unit when nothing expired.
export function pruneBuffs<T extends { buffs?: Buff[] }>(u: T, now: number): T {
  if (!u.buffs || u.buffs.length === 0) return u;
  const live = u.buffs.filter(b => b.until > now);
  return live.length === u.buffs.length ? u : { ...u, buffs: live };
}

// After a unit fires, an Overcharged Warhead is spent.
export const spendOvercharge = <T extends { buffs?: Buff[] }>(u: T): T =>
  hasBuff(u, 'overcharge') ? { ...u, buffs: u.buffs!.filter(b => b.kind !== 'overcharge') } : u;

export const addBuff = (u: UnitData, kind: BuffKind, until: number): UnitData =>
  ({ ...u, buffs: [...(u.buffs || []).filter(b => b.kind !== kind), { kind, until }] });

// Milliseconds until a unit can use an ability again.
export const abilityCooldownLeft = (u: UnitData, id: UnitAbilityId, now: number) => Math.max(0, (u.abilityReadyAt?.[id] ?? 0) - now);

// --- The order ---

export type UnitAbilityOutcome =
  | { ok: true; updates: Map<string, (u: UnitData) => UnitData>; strike?: { at: GridPos; radius: number; kind: 'emp' | 'hellfire' } }
  | { ok: false; reason: string };

export function unitAbilityEffects(
  units: readonly UnitData[],
  team: Team,
  tier: Tier,
  command: { unitIds: string[]; ability: string; target?: GridPos },
  now: number,
): UnitAbilityOutcome {
  const def = abilityDef(command.ability);
  if (!def) return { ok: false, reason: 'unknown ability' };
  if (tier < def.tier) return { ok: false, reason: `${def.name} needs Tier ${def.tier}` };
  const ids = new Set(command.unitIds);
  let casters = units.filter(u => ids.has(u.id) && u.team === team && u.type === def.unit && u.health > 0 && !isEmpDisabled(u));
  if (casters.length === 0) return { ok: false, reason: `no ${UNIT_STATS[def.unit].label} of yours selected` };
  casters = casters.filter(u => abilityCooldownLeft(u, def.id, now) === 0);
  if (casters.length === 0) return { ok: false, reason: `${def.name} is recharging` };

  const updates = new Map<string, (u: UnitData) => UnitData>();
  const ready = (u: UnitData): UnitData => ({ ...u, abilityReadyAt: { ...(u.abilityReadyAt || {}), [def.id]: now + def.cooldownMs } });

  if (!def.targeted) {
    for (const c of casters) {
      updates.set(c.id, u => {
        let next = ready(addBuff(u, def.id as BuffKind, now + def.durationMs));
        if (def.id === 'stim') next = { ...next, health: Math.max(1, next.health - STIM_HEALTH_COST) };
        return next;
      });
    }
    return { ok: true, updates };
  }

  // Aimed: every selected caster in range fires once at the same tile.
  const target = command.target;
  if (!target) return { ok: false, reason: 'pick a target' };
  const inRange = casters.filter(c => Math.hypot(c.gridPos.x - target.x, c.gridPos.z - target.z) <= def.targeted!.range);
  if (inRange.length === 0) return { ok: false, reason: `out of range (${def.targeted.range} tiles)` };
  for (const c of inRange) updates.set(c.id, ready);

  if (def.id === 'emp_rocket') {
    for (const victim of empVictims(units, target, def.targeted.radius, team)) updates.set(victim.id, u => addBuff(u, 'emp', now + def.durationMs));
  }
  const hit = units.filter(u => u.team !== team && u.health > 0 && Math.hypot(u.gridPos.x - target.x, u.gridPos.z - target.z) <= def.targeted!.radius);
  for (const victim of hit) {
    const armor = UNIT_RULES[victim.type].armor;
    if (def.id === 'hellfire') {
      if (armor === 'air') continue;
      const damage = shotDamage({ damage: HELLFIRE_DAMAGE, cooldownMs: 0, range: 0, type: 'ap', hitsGround: true, hitsAir: false }, armor)
        * inRange.length * damageTakenMultiplier(victim);
      updates.set(victim.id, u => ({ ...u, health: Math.max(0, u.health - damage) }));
    }
  }
  return { ok: true, updates, strike: { at: target, radius: def.targeted.radius, kind: def.id === 'emp_rocket' ? 'emp' : 'hellfire' } };
}
