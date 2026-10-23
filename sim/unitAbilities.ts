// Abilities for the playable build's new units: Strike Troopers, Lancers, Razorbacks, Aegis
// and Hornets, and the main battle tank (with the orbital-drop Titan; sim/titan.ts).
//
// Each unit has two. The first comes with the unit; the second, more powerful one needs the next
// tier and then research at an Advanced Research building (sim/upgrades.ts), so a unit grows
// stronger only if its side invests in it.
//
// Most abilities give the unit a timed buff, which combat (sim/combat.ts) and movement
// (sim/movement.ts) read: faster firing, more damage, less damage taken, more speed or range.
// Two are aimed: the Hornet's Hellfire salvo at an area (sim/hornet.ts), and the Lancer's EMP rocket either at a
// tile or locked on to an enemy vehicle it can see (the rocket's flight is sim/empRocket.ts).
//
// Orders arrive as UNIT_ABILITY commands and are checked here like every other ability:
// the sender's units, the right type, the tier and upgrade researched, off cooldown, in range.

import { UNIT_STATS } from '../constants';
import type { UnitData, UnitType } from '../types';
import type { GridPos, Team } from './commands';
import type { EmpRocket } from './empRocket';
import { MiniRocket, salvoFrom } from './hornet';
import { shotDamage, Tier, UNIT_RULES } from './units';
import { abilityUnlocked, type UpgradeId } from './upgrades';
import type { SmokeScreen } from './titan';

// 'smoke': standing in a friendly Smoke Screen (sim/titan.ts). 'piercing_round': a tank's next rail
// gun slug goes down the whole lane (sim/railgun.ts).
export type BuffKind = 'stim' | 'nanoweave' | 'overcharge' | 'nitro' | 'overclock' | 'barrage' | 'radar' | 'afterburner' | 'emp' | 'smoke' | 'piercing_round' | 'shadow_cloak';
export interface Buff { kind: BuffKind; until: number }

export type UnitAbilityId = 'stim' | 'nanoweave' | 'overcharge' | 'emp_rocket' | 'nitro' | 'overclock' | 'barrage' | 'radar' | 'afterburner' | 'hellfire' | 'smoke_screen' | 'piercing_round' | 'shadow_cloak';

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
  { id: 'emp_rocket', unit: 'lancer', name: 'EMP Tandem Rocket', tier: 3, cooldownMs: 45_000, durationMs: 4_000, targeted: { range: 14, radius: 2 },
    description: 'Top-attack EMP missile, range 14. It climbs steeply, then dives onto the target from above. Lock on to an enemy vehicle or aircraft in sight and it tracks it to impact, or fire it at a location. Vehicles and aircraft in the blast shut down for 4s and lose half a battery.' },

  { id: 'nitro', unit: 'razorback', name: 'Nitro Injection', tier: 1, cooldownMs: 25_000, durationMs: 5_000,
    description: '+80% speed for 5s. Hit, run, or close the gap.' },
  { id: 'overclock', unit: 'razorback', name: 'Overclocked Autogun', tier: 2, cooldownMs: 35_000, durationMs: 6_000,
    description: 'Disables the thermal limiter: double fire rate for 6s.' },

  { id: 'barrage', unit: 'aegis', name: 'Flak Barrage', tier: 2, cooldownMs: 30_000, durationMs: 6_000,
    description: 'Overdrives the rotary cannon: double rate of fire for 6s.' },
  { id: 'radar', unit: 'aegis', name: 'Sky-Net Radar Sweep', tier: 3, cooldownMs: 40_000, durationMs: 10_000,
    description: 'Phased-array sweep: vision 14 and +2 weapon range for 10s.' },

  { id: 'smoke_screen', unit: 'tank', name: 'Smoke Screen', tier: 2, cooldownMs: 35_000, durationMs: 8_000,
    description: 'Fires a ring of smoke canisters: a cloud 1.5 tiles round the tank for 8s. Friendly units inside can\'t be targeted by enemy ground units, and take half damage from aircraft.' },
  { id: 'piercing_round', unit: 'tank', name: 'Piercing Rail Round', tier: 3, cooldownMs: 30_000, durationMs: 20_000,
    description: 'Loads a piercing slug: the next rail gun shot carries on down the whole lane, hitting every enemy in its path.' },

  { id: 'afterburner', unit: 'hornet', name: 'Afterburners', tier: 2, cooldownMs: 25_000, durationMs: 5_000,
    description: '+70% speed for 5s. Get out of flak range.' },
  { id: 'hellfire', unit: 'hornet', name: 'Hellfire Salvo', tier: 3, cooldownMs: 40_000, durationMs: 0, targeted: { range: 8, radius: 3 },
    description: 'Ripple-fires the rocket pods: a burst of small unguided rockets blankets the area, each with a small blast. Built for area damage: shreds infantry and light vehicles in the open.' },

  // Kage, the Shadow Ops hero (sim/shadowHero.ts).
  { id: 'shadow_cloak', unit: 'hero_shadow_ops', name: 'Optical Camo', tier: 1, cooldownMs: 25_000, durationMs: 15_000,
    description: 'Cloaks himself for 15s: the enemy can\'t see or target him, though blasts still hurt. His first strike from cloak deals double damage and drops it.' },
];

// The orbital-drop Titan is a main battle tank, with the tank's abilities.
const abilityUnit = (type: UnitType): UnitType => (type === 'titan_dropped' ? 'tank' : type);
export const abilitiesFor = (type: UnitType) => UNIT_ABILITIES.filter(a => a.unit === abilityUnit(type));
export const abilityDef = (id: string) => UNIT_ABILITIES.find(a => a.id === id);

export const STIM_HEALTH_COST = 15;
const OVERCHARGE_MULTIPLIER = 2.5;

// --- Buffs as the rest of the game reads them ---

export const hasBuff = (u: { buffs?: Buff[] }, kind: BuffKind) => !!u.buffs?.some(b => b.kind === kind);

// Weapon cooldowns are divided by this.
export const fireRateMultiplier = (u: { buffs?: Buff[] }) =>
  (hasBuff(u, 'stim') ? 1.5 : 1) * (hasBuff(u, 'overclock') ? 2 : 1) * (hasBuff(u, 'barrage') ? 2 : 1);
// Each upgrade researched for a unit's type adds this share of its base health and damage
// (sim/upgrades.ts applyUpgradeBonuses keeps UnitData.upgradeLevel and the health up to date).
export const UPGRADE_BONUS = { health: 0.2, damage: 0.15 };
export const upgradeDamage = (u: { upgradeLevel?: number }) => 1 + UPGRADE_BONUS.damage * (u.upgradeLevel ?? 0);
// Kage's strike from Optical Camo: an ambush, double damage (sim/shadowHero.ts).
const AMBUSH_MULTIPLIER = 2;
export const damageMultiplier = (u: { buffs?: Buff[]; upgradeLevel?: number }) =>
  (hasBuff(u, 'overcharge') ? OVERCHARGE_MULTIPLIER : 1) * (hasBuff(u, 'shadow_cloak') ? AMBUSH_MULTIPLIER : 1) * upgradeDamage(u);
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

// After a unit fires, an Overcharged Warhead is spent, and Optical Camo drops.
const SPENT_ON_FIRING: readonly BuffKind[] = ['overcharge', 'shadow_cloak'];
export const spendOvercharge = <T extends { buffs?: Buff[] }>(u: T): T =>
  u.buffs?.some(b => SPENT_ON_FIRING.includes(b.kind)) ? { ...u, buffs: u.buffs.filter(b => !SPENT_ON_FIRING.includes(b.kind)) } : u;

export const addBuff = (u: UnitData, kind: BuffKind, until: number): UnitData =>
  ({ ...u, buffs: [...(u.buffs || []).filter(b => b.kind !== kind), { kind, until }] });

// Milliseconds until a unit can use an ability again.
export const abilityCooldownLeft = (u: UnitData, id: UnitAbilityId, now: number) => Math.max(0, (u.abilityReadyAt?.[id] ?? 0) - now);

// --- The order ---

export type UnitAbilityOutcome =
  | { ok: true; updates: Map<string, (u: UnitData) => UnitData>; strike?: { at: GridPos; radius: number; kind: 'emp' | 'hellfire' }; rockets?: EmpRocket[]; salvo?: MiniRocket[]; smoke?: SmokeScreen[] }
  | { ok: false; reason: string };

export function unitAbilityEffects(
  units: readonly UnitData[],
  team: Team,
  // The side's tier and upgrades.
  research: { tier: Tier; upgrades?: readonly UpgradeId[] },
  command: { unitIds: string[]; ability: string; target?: GridPos; targetUnitId?: string },
  now: number,
  // Whether `team` can see a unit, for locking on. Defaults to any friendly unit's vision.
  canSee: (u: UnitData) => boolean = u => units.some(f => f.team === team && f.health > 0 && Math.hypot(f.gridPos.x - u.gridPos.x, f.gridPos.z - u.gridPos.z) <= visionOf(f)),
): UnitAbilityOutcome {
  const def = abilityDef(command.ability);
  if (!def) return { ok: false, reason: 'unknown ability' };
  if (research.tier < def.tier) return { ok: false, reason: `${def.name} needs Tier ${def.tier}` };
  if (!abilityUnlocked(def, { tier: research.tier, upgrades: [...(research.upgrades ?? [])] })) {
    return { ok: false, reason: `${def.name} needs research at Advanced Research` };
  }
  const ids = new Set(command.unitIds);
  let casters = units.filter(u => ids.has(u.id) && u.team === team && abilityUnit(u.type) === def.unit && u.health > 0 && !isEmpDisabled(u));
  if (casters.length === 0) return { ok: false, reason: `no ${UNIT_STATS[def.unit].label} of yours selected` };
  casters = casters.filter(u => abilityCooldownLeft(u, def.id, now) === 0);
  if (casters.length === 0) return { ok: false, reason: `${def.name} is recharging` };

  const updates = new Map<string, (u: UnitData) => UnitData>();
  const ready = (u: UnitData): UnitData => ({ ...u, abilityReadyAt: { ...(u.abilityReadyAt || {}), [def.id]: now + def.cooldownMs } });

  // Smoke Screen: each tank lays a cloud where it stands (sim/titan.ts).
  if (def.id === 'smoke_screen') {
    for (const c of casters) updates.set(c.id, ready);
    const smoke = casters.map((c): SmokeScreen => ({ id: `smoke-${c.id}-${now}`, team, at: { ...c.gridPos }, laidAt: now, until: now + def.durationMs }));
    return { ok: true, updates, smoke };
  }
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

  // Locked on: every selected Lancer in range fires a rocket that chases the target.
  let locked: UnitData | undefined;
  if (command.targetUnitId) {
    if (def.id !== 'emp_rocket') return { ok: false, reason: `${def.name} can't lock on` };
    locked = units.find(u => u.id === command.targetUnitId);
    if (!locked || locked.team === team || locked.health <= 0 || UNIT_RULES[locked.type].armor === 'infantry') return { ok: false, reason: 'lock on to an enemy vehicle or aircraft' };
    if (!canSee(locked) || locked.decoyActive || locked.fieldCloaked) return { ok: false, reason: 'no line of sight to lock on' };
  }
  // Aimed: every selected caster in range fires once at the same tile.
  const target = locked ? locked.gridPos : command.target;
  if (!target) return { ok: false, reason: 'pick a target' };
  const inRange = casters.filter(c => Math.hypot(c.gridPos.x - target.x, c.gridPos.z - target.z) <= def.targeted!.range);
  if (inRange.length === 0) return { ok: false, reason: `out of range (${def.targeted.range} tiles)` };
  // Firing an aimed strike gives the caster away (a Cloaking Field drops, sim/cloak.ts).
  for (const c of inRange) updates.set(c.id, u => ({ ...ready(u), lastAttackTime: now }));

  // The EMP rocket flies (sim/empRocket.ts); its pulse goes off where it lands.
  if (def.id === 'emp_rocket') {
    const rockets = inRange.map((c): EmpRocket => ({
      id: `rocket-${c.id}-${now}`, team, attackerId: c.id, from: { ...c.gridPos }, at: { ...c.gridPos }, aim: { ...target },
      targetUnitId: locked?.id ?? null, firedAt: now,
    }));
    return { ok: true, updates, rockets };
  }
  // Hellfire Salvo: every Hornet in range ripple-fires its pods; the rockets fly (sim/hornet.ts).
  const salvo = inRange.flatMap(c => salvoFrom(c, target, def.targeted!.radius, now));
  return { ok: true, updates, salvo };

}
