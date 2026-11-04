// Shadow Ops Tier 3: the Cloaking Field Generator.
//
// Dropped from orbit like a Titan, the generator sits where it lands and projects a small field.
// Every friendly unit inside it is cloaked: the enemy can't see it or aim at it, though blasts
// and shelling across an area still hurt. Firing, or being hit, breaks a unit's cloak; it
// slips back under once it has been quiet for a few seconds. The generator itself is hidden
// while its field is up. An Aegis' radar still picks up everything in the field as blips
// (sim/radar.ts): it shows something is there, not what.
//
// The field runs off the generator's battery. Inside your energy grid that is topped up as fast
// as it drains, so it holds indefinitely; out in the field it lasts a minute or so, and a
// Battery Mule or Helios can keep it going. An EMP shuts it down. A side has one generator at a
// time: dropping a new one destroys the old. Its owner can switch the field off and on again;
// while off it spends no battery, and it and everything in the field can be seen.
//
// Pure: CityMap and the headless runner apply the result.

import type { DoctrineType, UnitData } from '../types';
import { UNIT_RULES } from './units';
import { hasBuff, isEmpDisabled } from './unitAbilities';

export const CLOAK_FIELD = {
  // Tiles.
  radius: 3,
  // Battery spent per 100 ms tick while the field is up (about 75 s on a full charge).
  drainPerTick: 0.13,
  // How long firing or being hit shows a unit gone dark (Shadow Ops' passive).
  revealMs: 6000,
  // Inside a Cloaking Field a unit slips back under this soon after firing or being hit, so a
  // fight inside the field flickers: the enemy gets only moments to shoot back.
  fieldRevealMs: 2000,
};

export const isCloakGenerator = (u: Pick<UnitData, 'type'>) => u.type === 'cloak_generator';

// Projecting: switched on, alive, charged and not knocked out.
export const isCloakFieldUp = (g: UnitData) =>
  isCloakGenerator(g) && !g.cloakFieldOff && g.health > 0 && g.battery > 0 && !g.isStunned && !isEmpDisabled(g);

// Fired or was hit recently.
export const revealedByCombat = (u: UnitData, now: number, revealMs = CLOAK_FIELD.fieldRevealMs) =>
  now - Math.max(u.lastAttackTime ?? -Infinity, u.lastDamageTime ?? -Infinity, u.ciwsLastFiredAt || -Infinity, u.railgunFiredAt ?? -Infinity) < revealMs;

// Units the enemy can neither see nor target: a Ghost under Phantom Decoy, or anything in a field.
export const isHidden = (u: Pick<UnitData, 'decoyActive' | 'fieldCloaked'>) => !!u.decoyActive || !!u.fieldCloaked;

// Shadow Ops' passive, Going Dark: its infantry and light vehicles on the ground slip under the
// same cloak whenever they hold still and haven't fought for CLOAK_FIELD.revealMs. Moving, firing
// or being hit shows them. A Shadow Ops army waiting in position can't be seen, and its first shots
// from the dark are an ambush (AMBUSH_DARK, sim/combat.ts).
export const goesDark = (u: UnitData, now: number, afterMs = CLOAK_FIELD.revealMs) =>
  // A Phantom Decoys hologram (sim/hologram.ts) is there to be seen.
  u.health > 0 && u.hologramUntil === undefined && u.path.length === 0 && now - Math.max(u.lastAttackTime ?? -Infinity, u.lastDamageTime ?? -Infinity, u.ciwsLastFiredAt || -Infinity, u.railgunFiredAt ?? -Infinity) >= afterMs
  && (UNIT_RULES[u.type].armor === 'infantry' || UNIT_RULES[u.type].armor === 'light')
  && u.type !== 'courier' && u.type !== 'defense_drone';
// A strike from any cloak but Kage's own (which doubles, sim/unitAbilities.ts) does this much more.
export const AMBUSH_DARK = 1.5;

// Who is cloaked by a field right now: friendly units inside a working generator's field that
// haven't given themselves away, the generator among them. Kage's Optical Camo (sim/shadowHero.ts)
// cloaks him the same way, field or not, until it runs out or he strikes. And Shadow Ops' units
// gone dark (goesDark).
export function fieldCloakedIds(
  units: readonly UnitData[], now: number,
  doctrineOf: (team: UnitData['team']) => DoctrineType | null | undefined = () => null,
  // Shadow Ops' Quick Fade (sim/doctrineTrack.ts): how soon after a fight its units go dark.
  darkAfterOf: (team: UnitData['team']) => number | null = () => null,
): Set<string> {
  const fields = units.filter(isCloakFieldUp);
  const cloaked = new Set<string>();
  for (const u of units) if (u.health > 0 && hasBuff(u, 'shadow_cloak')) cloaked.add(u.id);
  for (const u of units) if (u.team !== 'neutral' && doctrineOf(u.team) === 'shadow_ops' && goesDark(u, now, darkAfterOf(u.team) ?? CLOAK_FIELD.revealMs)) cloaked.add(u.id);
  if (fields.length === 0) return cloaked;
  for (const u of units) {
    // The generator hides inside its own field too.
    if (u.health <= 0 || revealedByCombat(u, now)) continue;
    if (fields.some(g => g.team === u.team && Math.hypot(g.gridPos.x - u.gridPos.x, g.gridPos.z - u.gridPos.z) <= CLOAK_FIELD.radius)) cloaked.add(u.id);
  }
  return cloaked;
}

// Sets each unit's `fieldCloaked`, keeping the same object for units that didn't change.
export function applyFieldCloak(units: UnitData[], cloaked: ReadonlySet<string>): UnitData[] {
  let changed = false;
  const next = units.map(u => {
    const on = cloaked.has(u.id);
    if (!!u.fieldCloaked === on) return u;
    changed = true;
    return { ...u, fieldCloaked: on };
  });
  return changed ? next : units;
}

// A new generator for `team` replaces the old: the ids of that side's existing ones to destroy.
export const generatorsReplacedBy = (units: readonly UnitData[], team: UnitData['team']) =>
  units.filter(u => isCloakGenerator(u) && u.team === team && u.health > 0).map(u => u.id);
