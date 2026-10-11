// A headless skirmish for checking balance. Two armies start apart on open ground, close
// in at their real speeds and fight with the real weapons code (resolveAttacks) until one
// side is gone, neither can hurt the other, or time runs out. No pathing, abilities,
// healing or terrain: this measures the raw counter relationships between units.

import { UNIT_STATS } from '../constants';
import type { UnitData, UnitType } from '../types';
import { applyDamage, resolveAttacks } from './combat';
import { BASE_SPEED, MOVE_TICK_MS } from './movement';
import { UNIT_RULES } from './units';

export interface ArmyEntry { type: UnitType; count: number }

export interface BattleResult {
  winner: 'blue' | 'red' | 'draw';
  seconds: number;
  // Share of each army's starting value still alive, 0 to 1.
  blueLeft: number;
  redLeft: number;
}

const TILE = 14;
const START_GAP = 16; // Tiles between the front lines

const value = (units: readonly UnitData[], team: 'blue' | 'red') =>
  units.filter(u => u.team === team && u.health > 0).reduce((sum, u) => sum + UNIT_STATS[u.type].cost * (u.health / u.maxHealth), 0);

function deploy(army: ArmyEntry[], team: 'blue' | 'red'): UnitData[] {
  const units: UnitData[] = [];
  let i = 0;
  for (const { type, count } of army) {
    for (let n = 0; n < count; n++, i++) {
      // Ranks of 6, one tile apart, facing each other.
      const rank = Math.floor(i / 6);
      const file = (i % 6) - 2.5;
      units.push({
        id: `${team}-${i}`, type, unitClass: UNIT_STATS[type].unitClass, team,
        gridPos: { x: team === 'blue' ? -rank : START_GAP + rank, z: file },
        path: [], visionRange: UNIT_STATS[type].visionRange,
        health: UNIT_STATS[type].maxHealth, maxHealth: UNIT_STATS[type].maxHealth,
        battery: 100, maxBattery: 100, cooldowns: {},
      });
    }
  }
  return units;
}

// Tiles per second on open street, as in sim/movement.ts.
const speedOf = (type: UnitType) =>
  (BASE_SPEED * UNIT_STATS[type].speedMod * (UNIT_RULES[type].armor === 'air' ? 1.2 : 1)) / TILE;

export function simulateBattle(blue: ArmyEntry[], red: ArmyEntry[], maxSeconds = 240): BattleResult {
  let units = [...deploy(blue, 'blue'), ...deploy(red, 'red')];
  const startBlue = value(units, 'blue');
  const startRed = value(units, 'red');
  let lastHit = 0;
  let now = 0;

  for (; now < maxSeconds * 1000; now += MOVE_TICK_MS) {
    const attack = resolveAttacks(units, [], now, () => false);
    if (attack.fired.size > 0) lastHit = now;
    units = applyDamage(units, attack.unitDamage).map(u => ({
      ...u,
      combatTargetId: attack.aiming.get(u.id) ?? null,
      lastAttackTime: attack.fired.has(u.id) ? now : u.lastAttackTime,
    })).filter(u => u.health > 0);

    // Anyone armed with nothing in range closes on the nearest enemy it could hit.
    units = units.map(u => {
      const weapon = UNIT_RULES[u.type].weapon;
      if (!weapon || u.combatTargetId) return u;
      let nearest: UnitData | null = null;
      let best = Infinity;
      for (const e of units) {
        if (e.team === u.team) continue;
        const isAir = UNIT_RULES[e.type].armor === 'air';
        if (isAir ? !weapon.hitsAir : !weapon.hitsGround) continue;
        const d = Math.hypot(e.gridPos.x - u.gridPos.x, e.gridPos.z - u.gridPos.z);
        if (d < best) { best = d; nearest = e; }
      }
      if (!nearest || best <= weapon.range) return u;
      const step = Math.min(best - weapon.range + 0.01, speedOf(u.type) * (MOVE_TICK_MS / 1000));
      const dx = (nearest.gridPos.x - u.gridPos.x) / best;
      const dz = (nearest.gridPos.z - u.gridPos.z) / best;
      return { ...u, gridPos: { x: u.gridPos.x + dx * step, z: u.gridPos.z + dz * step } };
    });

    const blueAlive = units.some(u => u.team === 'blue');
    const redAlive = units.some(u => u.team === 'red');
    if (!blueAlive || !redAlive) break;
    // Nobody has landed a shot for 20 s: neither side can hurt the other.
    if (now - lastHit > 20000 && now > 20000) break;
  }

  const blueLeft = value(units, 'blue') / startBlue;
  const redLeft = value(units, 'red') / startRed;
  const winner = Math.abs(blueLeft - redLeft) < 0.05 ? 'draw' : blueLeft > redLeft ? 'blue' : 'red';
  return { winner, seconds: now / 1000, blueLeft, redLeft };
}

// An army of `type` worth about `budget` cores.
export const armyOf = (type: UnitType, budget: number): ArmyEntry[] =>
  [{ type, count: Math.max(1, Math.round(budget / UNIT_STATS[type].cost)) }];
