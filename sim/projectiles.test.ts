import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { Projectile, UnitData } from '../types';
import { blastDamage } from './combat';
import { cloneProjectile, drawnShotPosition, FlightWorld, LiveFlight, stepProjectiles } from './projectiles';

const TILE = 14;

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'ghost', unitClass: 'infantry', team: 'red', gridPos: { x: 10, z: 0 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});

const world = (units: UnitData[]): FlightWorld => ({ offset: 0, tileSize: TILE, gridSize: 80, units, buildings: [], structures: [], decoys: [] });

// A Titan cannon shell fired east along the x axis from the origin.
const shell = (id = 'shell'): Projectile => ({
  id, ownerId: 'tank', team: 'blue', position: { x: 0, y: 1.5, z: 0 },
  velocity: { x: ABILITY_CONFIG.TITAN_CANNON_SPEED, y: 0, z: 0 }, damage: ABILITY_CONFIG.TITAN_CANNON_DAMAGE,
  radius: 0.5, maxDistance: ABILITY_CONFIG.TITAN_CANNON_PROJECTILE_RANGE * TILE, distanceTraveled: 0, trajectory: 'direct',
});

const flights = (...shots: Projectile[]) => new Map<string, LiveFlight>(shots.map(s => [s.id, { shot: cloneProjectile(s), impacted: false }]));

// Fly until the shot lands, returning the tick it landed on and what happened.
function flyUntilImpact(live: Map<string, LiveFlight>, w: FlightWorld, tickMs: number, trophy = new Map<string, number>()) {
  for (let tick = 1; tick <= 1000; tick++) {
    const result = stepProjectiles(live, tickMs, tick * tickMs, w, trophy);
    if (result.impactedIds.length > 0) return { ms: tick * tickMs, result };
  }
  throw new Error('shot never landed');
}

describe('stepProjectiles', () => {
  it('lands a shell on the enemy it was fired at, for full damage', () => {
    const target = unit('target');
    const { result } = flyUntilImpact(flights(shell()), world([target]), 100);
    const damage = result.events.find(e => e.kind === 'damage');
    if (damage?.kind !== 'damage') throw new Error('no damage event');
    // Regression: the blast used to sit where the shell stopped, short of the unit and out of reach.
    expect(blastDamage([target], [damage], TILE, 0, { hitsCloaked: false }).get('target')).toBe(ABILITY_CONFIG.TITAN_CANNON_DAMAGE);
    // The explosion still shows where the shell stopped, just short of the unit.
    const flash = result.events.find(e => e.kind === 'explosion');
    if (flash?.kind !== 'explosion') throw new Error('no explosion');
    expect(10 * TILE - flash.position.x).toBeGreaterThan(0);
    expect(10 * TILE - flash.position.x).toBeLessThan(TILE);
  });

  it('gives the same flight whether the game ticks every 100 ms or every frame', () => {
    const units = [unit('target')];
    const perTick = flyUntilImpact(flights(shell()), world(units), 100);
    const perFrame = flyUntilImpact(flights(shell()), world(units), 1000 / 60);
    const at = (r: typeof perTick) => r.result.events.find(e => e.kind === 'damage')!;
    expect(at(perTick)).toEqual(at(perFrame));
    expect(Math.abs(perTick.ms - perFrame.ms)).toBeLessThanOrEqual(100);
  });

  it('flies the full range when nothing is in the way', () => {
    const { result } = flyUntilImpact(flights(shell()), world([]), 100);
    const damage = result.events.find(e => e.kind === 'damage');
    if (damage?.kind !== 'damage') throw new Error();
    expect(damage.position.x).toBeGreaterThanOrEqual(ABILITY_CONFIG.TITAN_CANNON_PROJECTILE_RANGE * TILE - 1);
  });

  it('lets an enemy Guardian knock down one heavy shot per cooldown', () => {
    const guardian = unit('guard', { type: 'guardian', unitClass: 'support', gridPos: { x: 3, z: 0 } });
    const w = world([guardian, unit('target')]);
    const trophy = new Map<string, number>();
    const first = flyUntilImpact(flights(shell('a')), w, 100, trophy);
    expect(first.result.trophyFired).toEqual(['guard']);
    expect(first.result.events.some(e => e.kind === 'damage')).toBe(false);

    // Fired straight after, while the Trophy system is recharging: it gets through.
    const second = flyUntilImpact(flights(shell('b')), w, 100, trophy);
    expect(second.result.trophyFired).toEqual([]);
    expect(second.result.events.some(e => e.kind === 'damage')).toBe(true);
    expect(trophy.get('guard')).toBeGreaterThan(0);
  });

  it('brings a ballistic missile down on its target when its flight time is up', () => {
    const start = { x: 0, y: 2, z: 0 };
    const target = { x: 300, y: 1, z: 0 };
    const missile: Projectile = {
      id: 'm', ownerId: 'ballista', team: 'blue', position: { ...start }, velocity: { x: 0, y: 0, z: 0 }, damage: 0, radius: 1,
      maxDistance: 300, distanceTraveled: 0, targetPos: target, trajectory: 'ballistic', payload: 'he', startPos: start, startTime: 1, // 0 reads as "no start time" to the flight code
    };
    const flightMs = (300 / ABILITY_CONFIG.MISSILE_CRUISE_SPEED) * 1000;
    const { ms, result } = flyUntilImpact(flights(missile), world([]), 100);
    expect(ms).toBeGreaterThanOrEqual(flightMs + 1);
    expect(ms).toBeLessThan(flightMs + 1 + 100);
    expect(result.events.find(e => e.kind === 'damage')).toMatchObject({ position: target, damage: 150 });
  });
});

describe('drawnShotPosition', () => {
  it('carries a straight shot forward between ticks, but not far', () => {
    const s = shell();
    expect(drawnShotPosition(s, 0, 0.05).position.x).toBeCloseTo(ABILITY_CONFIG.TITAN_CANNON_SPEED * 0.05);
    expect(drawnShotPosition(s, 0, 5).position.x).toBeCloseTo(ABILITY_CONFIG.TITAN_CANNON_SPEED * 0.15);
  });
});
