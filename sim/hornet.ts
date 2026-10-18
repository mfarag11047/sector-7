// The Hornet gunship's rockets.
//
// Its gun (sim/combat.ts) fires armour-piercing rounds from Tier 2. From Tier 3 it also carries:
//   - an anti-vehicle rocket, fired on its own every few seconds at whatever the gun is shooting,
//     for a hard extra hit on top of the AP rounds;
//   - the Hellfire Salvo (sim/unitAbilities.ts), aimed by the player: a burst of small unguided
//     rockets that rain across a medium-sized area for a second or so, each with a small blast.
//     It is an area weapon: best against infantry and light vehicles caught in the open.
//
// Pure: CityMap and the headless runner keep the salvo in flight and apply the damage.

import type { StructureData, UnitData } from '../types';
import type { GridPos } from './commands';
import { isHidden } from './cloak';
import { damageTakenMultiplier, isEmpDisabled } from './unitAbilities';
import { shotDamage, Tier, UNIT_RULES, Weapon } from './units';

export const HORNET = {
  // Tier 3 passive anti-vehicle rocket.
  rocket: { damage: 60, cooldownMs: 6000, range: 5 },
  // Hellfire Salvo: rockets per Hornet, damage per rocket before armour, blast radius (tiles),
  // how long the volley takes to come down, and each rocket's flight time.
  salvo: { rockets: 16, damage: 20, blast: 1.2, spreadMs: 1400, flightMs: 700 },
};
const ROCKET: Weapon = { damage: HORNET.rocket.damage, cooldownMs: HORNET.rocket.cooldownMs, range: HORNET.rocket.range, type: 'ap', hitsGround: true, hitsAir: false };
const MINI: Weapon = { damage: HORNET.salvo.damage, cooldownMs: 0, range: 0, type: 'explosive', hitsGround: true, hitsAir: false };

const tiles = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

export interface HornetRocketShot { attackerId: string; targetId: string; team: UnitData['team']; from: GridPos; to: GridPos; structure: boolean }

// Each Tier 3 Hornet whose rocket is ready fires it at the target its gun is on.
export function fireHornetRockets(
  units: readonly UnitData[],
  structures: readonly StructureData[],
  now: number,
  tierOf: (team: UnitData['team']) => Tier,
): { shots: HornetRocketShot[]; unitDamage: Map<string, number>; structureDamage: Map<string, number> } {
  const shots: HornetRocketShot[] = [];
  const unitDamage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);
  for (const h of units) {
    if (h.type !== 'hornet' || h.health <= 0 || h.isStunned || isEmpDisabled(h) || !h.combatTargetId || tierOf(h.team) < 3) continue;
    if (now - (h.hornetRocketAt ?? -Infinity) < HORNET.rocket.cooldownMs) continue;
    const t = units.find(u => u.id === h.combatTargetId);
    if (t) {
      const armor = UNIT_RULES[t.type].armor;
      if (t.team === h.team || t.health <= 0 || isHidden(t) || armor === 'air' || tiles(h.gridPos, t.gridPos) > HORNET.rocket.range) continue;
      add(unitDamage, t.id, shotDamage(ROCKET, armor) * damageTakenMultiplier(t));
      shots.push({ attackerId: h.id, targetId: t.id, team: h.team, from: h.gridPos, to: t.gridPos, structure: false });
      continue;
    }
    const s = structures.find(x => x.id === h.combatTargetId);
    if (!s || s.team === h.team || s.health <= 0 || tiles(h.gridPos, s.gridPos) > HORNET.rocket.range) continue;
    add(structureDamage, s.id, shotDamage(ROCKET, 'structure'));
    shots.push({ attackerId: h.id, targetId: s.id, team: h.team, from: h.gridPos, to: s.gridPos, structure: true });
  }
  return { shots, unitDamage, structureDamage };
}

// --- Hellfire Salvo ---

export interface MiniRocket {
  id: string;
  team: UnitData['team'];
  attackerId: string;
  from: { x: number; z: number };
  // Where it comes down, in fractional tiles.
  at: { x: number; z: number };
  firedAt: number;
  landsAt: number;
}

// A small deterministic scatter, so the same order gives the same pattern.
const scatter = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

// One Hornet's salvo at `target`: rockets spread evenly over a disc of `radius` tiles (denser
// near the middle), launched one after another over the volley.
export function salvoFrom(hornet: UnitData, target: GridPos, radius: number, now: number): MiniRocket[] {
  const rockets: MiniRocket[] = [];
  const n = HORNET.salvo.rockets;
  const seed = now % 100_000 + hornet.id.length * 97;
  for (let i = 0; i < n; i++) {
    const r = radius * Math.sqrt(scatter(seed + i * 3.1));
    const a = scatter(seed + i * 7.7) * Math.PI * 2;
    const firedAt = now + (HORNET.salvo.spreadMs * i) / n;
    rockets.push({
      id: `mini-${hornet.id}-${now}-${i}`, team: hornet.team, attackerId: hornet.id,
      from: { ...hornet.gridPos }, at: { x: target.x + Math.cos(a) * r, z: target.z + Math.sin(a) * r },
      firedAt, landsAt: firedAt + HORNET.salvo.flightMs,
    });
  }
  return rockets;
}

// Rockets that have come down by `now`, and their blasts: enemy ground units and structures
// within the blast radius, full damage at the centre falling to half at the edge.
export function landSalvo(rockets: readonly MiniRocket[], now: number, units: readonly UnitData[], structures: readonly StructureData[]) {
  const landed: MiniRocket[] = [];
  const flying: MiniRocket[] = [];
  const unitDamage = new Map<string, number>();
  const structureDamage = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);
  const falloff = (d: number) => 1 - 0.5 * Math.min(1, d / HORNET.salvo.blast);
  for (const r of rockets) {
    if (r.landsAt > now) { flying.push(r); continue; }
    landed.push(r);
    for (const u of units) {
      if (u.team === r.team || u.health <= 0) continue;
      const armor = UNIT_RULES[u.type].armor;
      const d = tiles(u.gridPos, r.at);
      if (armor === 'air' || d > HORNET.salvo.blast) continue;
      add(unitDamage, u.id, shotDamage(MINI, armor) * falloff(d) * damageTakenMultiplier(u));
    }
    for (const s of structures) {
      if (s.team === r.team || s.health <= 0) continue;
      const d = tiles(s.gridPos, r.at);
      if (d <= HORNET.salvo.blast) add(structureDamage, s.id, shotDamage(MINI, 'structure') * falloff(d));
    }
  }
  return { landed, flying, unitDamage, structureDamage };
}
