// The Kestrel attack drone's two abilities, beyond its machine gun.
//
//   - Flechette Burst (Tier 1, passive, comes with the drone): every few seconds, alongside its
//     machine gun, it fires a shotgun burst of flechettes at the unit it is shooting. The burst
//     hits that unit hard and peppers enemies right beside it. Flechettes shred infantry and do
//     much less to armour.
//   - Regenerative Shield (Tier 2, researched at Advanced Research, sim/upgrades.ts): an energy
//     shield worth a quarter of the drone's health on top of it. Hits drain the shield first, and
//     it takes 25% less damage than the hull would. Once the drone has gone SHIELD.regenDelayMs
//     without being hit, the shield recharges on its own.
//
// Pure: CityMap and the headless runner apply the damage and keep the shield.

import type { UnitData } from '../types';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { ForceField, shotBlockedBy } from './forcefield';
import { ArmorClass, UNIT_RULES } from './units';
import { damageTakenMultiplier, upgradeDamage, isEmpDisabled } from './unitAbilities';
import { airHitMultiplier } from './titan';

export const FLECHETTE = {
  cooldownMs: 5000,
  range: 3,
  // Damage to the unit it is shooting, and to each enemy within `spread` tiles of it.
  damage: 18,
  spreadDamage: 8,
  spread: 1.3,
  // Flechettes against each armour class.
  vs: { infantry: 1, light: 0.45, heavy: 0.2, air: 0.5, structure: 0 } as Record<ArmorClass, number>,
};

export const SHIELD = {
  // Shield worth this share of the drone's maximum health.
  share: 0.25,
  // Damage the shield takes, as a share of what the hull would.
  takes: 0.75,
  // No hits for this long, then it recharges at `regenPerSecond` of its full strength a second.
  regenDelayMs: 10_000,
  regenPerSecond: 0.5,
};

const tiles = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);

export interface FlechetteShot { attackerId: string; targetId: string; team: UnitData['team']; from: GridPos; to: GridPos }

// Each Kestrel whose burst is ready fires it at the unit its gun is on.
export function fireFlechettes(
  units: readonly UnitData[],
  now: number,
  fields: readonly ForceField[] = [],
): { shots: FlechetteShot[]; unitDamage: Map<string, number>; shieldDamage: Map<string, number> } {
  const shots: FlechetteShot[] = [];
  const unitDamage = new Map<string, number>();
  const shieldDamage = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);
  for (const k of units) {
    if (k.type !== 'attack_drone' || k.health <= 0 || k.isStunned || isEmpDisabled(k) || !k.combatTargetId) continue;
    if (now - (k.flechetteAt ?? -Infinity) < FLECHETTE.cooldownMs) continue;
    const t = units.find(u => u.id === k.combatTargetId);
    if (!t || t.team === k.team || t.team === 'neutral' || t.health <= 0 || isHidden(t) || tiles(k.gridPos, t.gridPos) > FLECHETTE.range) continue;
    const blocked = shotBlockedBy(fields, k.team, k.gridPos, t.gridPos);
    if (blocked) {
      add(shieldDamage, blocked.field.id, FLECHETTE.damage * upgradeDamage(k));
      shots.push({ attackerId: k.id, targetId: t.id, team: k.team, from: k.gridPos, to: blocked.at });
      continue;
    }
    const hurt = (u: UnitData, n: number) => add(unitDamage, u.id, n * upgradeDamage(k) * FLECHETTE.vs[UNIT_RULES[u.type].armor] * damageTakenMultiplier(u) * airHitMultiplier(u));
    hurt(t, FLECHETTE.damage);
    shots.push({ attackerId: k.id, targetId: t.id, team: k.team, from: k.gridPos, to: t.gridPos });
    for (const o of units) {
      if (o === t || o.team === k.team || o.team === 'neutral' || o.health <= 0 || isHidden(o)) continue;
      if (tiles(o.gridPos, t.gridPos) > FLECHETTE.spread) continue;
      hurt(o, FLECHETTE.spreadDamage);
      shots.push({ attackerId: k.id, targetId: o.id, team: k.team, from: k.gridPos, to: o.gridPos });
    }
  }
  return { shots, unitDamage, shieldDamage };
}

// --- Regenerative Shield ---

export const shieldMax = (u: Pick<UnitData, 'type' | 'maxHealth'>) => (u.type === 'attack_drone' ? Math.round(u.maxHealth * SHIELD.share) : 0);

// A hit on a unit: its shield (if any) soaks it first, at the reduced rate, and what gets through
// comes off its health. Returns the unit's new health and shield.
export function shieldedHit(u: Pick<UnitData, 'health' | 'regenShield'>, hit: number): { health: number; regenShield: number | undefined } {
  const shield = u.regenShield ?? 0;
  if (hit <= 0 || shield <= 0) return { health: Math.max(0, u.health - hit), regenShield: u.regenShield };
  const onShield = hit * SHIELD.takes;
  if (onShield <= shield) return { health: u.health, regenShield: shield - onShield };
  // The shield breaks; the rest of the hit lands on the hull at full strength.
  const through = (onShield - shield) / SHIELD.takes;
  return { health: Math.max(0, u.health - through), regenShield: 0 };
}

// Recharges a Kestrel's shield once it has gone long enough without being hit. `researched` is
// whether its side has the Regenerative Shield. Returns the same unit when nothing changes.
export function regenerateShield<T extends Pick<UnitData, 'type' | 'maxHealth' | 'health' | 'regenShield' | 'lastDamageTime'>>(
  u: T, now: number, dtMs: number, researched: boolean,
): T {
  const max = researched ? shieldMax(u) : 0;
  if (max === 0) return u.regenShield ? { ...u, regenShield: undefined } : u;
  const shield = u.regenShield ?? 0;
  if (shield >= max || u.health <= 0 || now - (u.lastDamageTime ?? -Infinity) < SHIELD.regenDelayMs) return u;
  return { ...u, regenShield: Math.min(max, shield + max * SHIELD.regenPerSecond * (dtMs / 1000)) };
}
