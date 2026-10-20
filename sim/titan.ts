// The main battle tank's two abilities (the orbital-drop Titan has them too).
//
//   - Smoke Screen (comes with the tank, Tier 2): the tank fires a ring of smoke canisters that
//     burst into a cloud SMOKE.radius tiles round it, where it stands. For SMOKE.durationMs every
//     friendly unit inside the cloud is screened: enemy ground units, turrets and HQs can't pick
//     it as a target, and enemy aircraft do half damage to it. The cloud stays where it was laid,
//     so units can drive into or out of it. Splash from shells and blasts still lands.
//   - Piercing Rail Round (Tier 3, researched at Advanced Research): loads a slug that, on the
//     tank's next rail gun shot, doesn't stop at the target but carries on down the whole lane,
//     hitting every enemy within PIERCE.width of its path until it reaches the end of the street
//     or PIERCE.length tiles (sim/railgun.ts).
//
// Pure: CityMap and the headless runner keep the clouds and mark the units inside each tick.

import type { UnitData } from '../types';
import type { GridPos } from './commands';

export const SMOKE = {
  radius: 1.5,
  durationMs: 8000,
  // Damage from aircraft to a screened unit, as a share of the usual.
  airDamage: 0.5,
  // How long the canisters take to land and burst into the cloud.
  launchMs: 600,
};

export const PIERCE = {
  // How far the slug carries past the tank, at most, and how close to its path a unit must be to be hit.
  length: 30,
  width: 0.75,
};

export interface SmokeScreen { id: string; team: UnitData['team']; at: GridPos; laidAt: number; until: number }

export const smokeLive = (s: SmokeScreen, now: number) => now >= s.laidAt + SMOKE.launchMs && now < s.until;
const inside = (s: SmokeScreen, p: GridPos) => Math.hypot(p.x - s.at.x, p.z - s.at.z) <= SMOKE.radius;

// Units in one of their own side's live clouds, marked as screened until the next tick or so.
// Returns the same list when nobody is.
export function markScreened(units: UnitData[], screens: readonly SmokeScreen[], now: number): UnitData[] {
  const live = screens.filter(s => smokeLive(s, now));
  if (live.length === 0) return units;
  let changed = false;
  const out = units.map(u => {
    if (u.health <= 0 || !live.some(s => s.team === u.team && inside(s, u.gridPos))) return u;
    changed = true;
    return { ...u, buffs: [...(u.buffs || []).filter(b => b.kind !== 'smoke'), { kind: 'smoke' as const, until: now + 250 }] };
  });
  return changed ? out : units;
}

export const isScreened = (u: { buffs?: UnitData['buffs'] }) => !!u.buffs?.some(b => b.kind === 'smoke');

// Damage an aircraft does to a unit, screened or not.
export const airHitMultiplier = (target: { buffs?: UnitData['buffs'] }) => (isScreened(target) ? SMOKE.airDamage : 1);

// Clouds still worth keeping.
export const pruneSmoke = (screens: SmokeScreen[], now: number) => (screens.some(s => s.until <= now) ? screens.filter(s => s.until > now) : screens);
