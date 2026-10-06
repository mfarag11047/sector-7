import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { RoadType } from '../types';
import {
  advanceMover, arriveAtNextTile, ArrivalRules, BASE_SPEED, currentTilePosition, Mover, MovementEnv, MOVE_TICK_MS,
  speedMultiplier,
} from './movement';

const TILE = 14;
const open = (): ArrivalRules => ({ isWalkable: () => true, reroute: () => [], now: 1000 });
const env = (tiles: Record<string, RoadType> = {}, rules = open()): MovementEnv => ({
  tileSize: TILE,
  tileTypeOf: key => tiles[key],
  arrive: u => arriveAtNextTile(u, rules),
});

const unit = (patch: Partial<Mover> = {}): Mover => ({
  type: 'ghost', unitClass: 'infantry', gridPos: { x: 0, z: 0 }, path: ['1,0', '2,0'], battery: 100, ...patch,
});

// Ticks needed to cross one straight tile at this speed multiplier.
const ticksPerTile = (speed: number) => (TILE * 1000) / (BASE_SPEED * speed * MOVE_TICK_MS);

const run = (u: Mover, ticks: number, e = env()) => {
  for (let i = 0; i < ticks; i++) u = advanceMover(u, MOVE_TICK_MS, e);
  return u;
};

describe('speed', () => {
  it('uses road type, unit speed and modifiers', () => {
    const tiles: Record<string, RoadType> = { '1,0': 'main' };
    expect(speedMultiplier(unit(), k => tiles[k])).toBe(2 * UNIT_STATS.ghost.speedMod);
    expect(speedMultiplier(unit({ path: ['0,1'] }), () => 'open')).toBe(0.5);
    expect(speedMultiplier(unit({ isDampenerActive: true }), () => 'street')).toBe(ABILITY_CONFIG.GHOST_SPEED_PENALTY);
    expect(speedMultiplier(unit({ activeBuffs: ['speed'] }), () => 'street')).toBeCloseTo(1.2);
    expect(speedMultiplier(unit({ isJammed: true }), () => 'main')).toBe(0.5);
  });

  it('gives air units a flat bonus regardless of road', () => {
    expect(speedMultiplier(unit({ type: 'drone', unitClass: 'air' }), () => 'open')).toBeCloseTo(1.2 * UNIT_STATS.drone.speedMod);
  });

  it('stops vehicles with no battery, but not infantry', () => {
    expect(speedMultiplier(unit({ type: 'tank', unitClass: 'armor', battery: 0 }), () => 'street')).toBe(0);
    expect(speedMultiplier(unit({ battery: 0 }), () => 'street')).toBeGreaterThan(0);
  });

  it('holds stunned, drained, anchored, deployed and loading units', () => {
    for (const patch of [
      { isStunned: true },
      { isHacked: true, hackType: 'drain' as const },
      { isAnchored: true },
      { isDeployed: true },
      { type: 'ballista' as const, unitClass: 'support' as const, ammoState: 'loading' as const },
    ]) {
      expect(speedMultiplier(unit(patch), () => 'street')).toBe(0);
    }
  });
});

describe('advanceMover', () => {
  it('reaches the next tile after the expected number of ticks', () => {
    const ticks = Math.ceil(ticksPerTile(1));
    const before = run(unit(), ticks - 1);
    expect(before.gridPos).toEqual({ x: 0, z: 0 });
    const after = run(before, 1);
    expect(after.gridPos).toEqual({ x: 1, z: 0 });
    expect(after.path).toEqual(['2,0']);
  });

  it('carries leftover progress into the next step', () => {
    const ticks = Math.ceil(ticksPerTile(1));
    const after = run(unit(), ticks);
    const expected = ticks / ticksPerTile(1) - 1;
    expect(after.moveProgress).toBeCloseTo(expected);
  });

  it('takes longer on diagonals', () => {
    const straight = run(unit({ path: ['1,0'] }), Math.ceil(ticksPerTile(1)));
    const diagonal = run(unit({ path: ['1,1'] }), Math.ceil(ticksPerTile(1)));
    expect(straight.gridPos).toEqual({ x: 1, z: 0 });
    expect(diagonal.gridPos).toEqual({ x: 0, z: 0 });
  });

  it('does not depend on frame rate: the same ticks give the same position', () => {
    const a = run(unit(), 25);
    const b = run(unit(), 25);
    expect(a).toEqual(b);
  });

  it('returns the same object for a unit that is not moving', () => {
    const idle = unit({ path: [] });
    expect(advanceMover(idle, MOVE_TICK_MS, env())).toBe(idle);
    const stunned = unit({ isStunned: true, moveTarget: '1,0' });
    expect(advanceMover(stunned, MOVE_TICK_MS, env())).toBe(stunned);
  });

  it('drops a half-finished step when a new order changes the next tile', () => {
    const halfway = run(unit(), 3);
    expect(halfway.moveProgress).toBeGreaterThan(0);
    const reordered = advanceMover({ ...halfway, path: ['0,1'] }, MOVE_TICK_MS, env());
    expect(reordered.moveTarget).toBe('0,1');
    expect(reordered.moveProgress).toBeLessThan(halfway.moveProgress!);
  });

  it('clears movement state when the path runs out', () => {
    const done = run(unit({ path: ['1,0'] }), 30);
    expect(done.path).toEqual([]);
    expect(done.moveProgress).toBe(0);
    expect(done.moveTarget).toBeUndefined();
  });

  it('reroutes when the next tile has been walled off', () => {
    const walled = env({}, { isWalkable: (x, z) => !(x === 1 && z === 0), reroute: () => ['0,1', '1,1', '2,0'], now: 0 });
    const after = run(unit(), Math.ceil(ticksPerTile(1)), walled);
    expect(after.gridPos).toEqual({ x: 0, z: 0 });
    expect(after.path).toEqual(['0,1', '1,1', '2,0']);
    expect(after.moveProgress).toBe(0);
  });

  it('lets Bombardment Drones fly over blocked tiles', () => {
    const blocked = env({}, { isWalkable: () => false, reroute: () => [], now: 0 });
    const bombard = unit({ type: 'bombard', unitClass: 'air', battery: 100 });
    const after = run(bombard, Math.ceil(ticksPerTile(1.2 * UNIT_STATS.bombard.speedMod)), blocked);
    expect(after.gridPos).toEqual({ x: 1, z: 0 });
  });
});

describe('arriveAtNextTile', () => {
  it('starts and ends surveillance at the right tiles', () => {
    const traveling = unit({
      path: ['1,0'],
      surveillance: { active: true, status: 'traveling', center: { x: 1, z: 0 }, returnPos: { x: 0, z: 0 } },
    });
    expect(arriveAtNextTile(traveling, open()).surveillance).toMatchObject({ status: 'active', startTime: 1000 });

    const returning = unit({
      path: ['1,0'],
      surveillance: { active: true, status: 'returning', center: { x: 5, z: 5 }, returnPos: { x: 1, z: 0 } },
    });
    expect(arriveAtNextTile(returning, open()).surveillance).toBeUndefined();
  });
});

describe('currentTilePosition', () => {
  it('interpolates between tiles while moving', () => {
    expect(currentTilePosition({ gridPos: { x: 2, z: 2 }, path: ['3,3'], moveProgress: 0.5, moveTarget: '3,3' })).toEqual({ x: 2.5, z: 2.5 });
  });

  it('ignores progress toward a tile that is no longer next', () => {
    expect(currentTilePosition({ gridPos: { x: 2, z: 2 }, path: ['2,3'], moveProgress: 0.5, moveTarget: '3,3' })).toEqual({ x: 2, z: 2 });
  });
});

describe('moveSpeed', () => {
  it('reports world speed while moving and zero once held or finished', () => {
    const moving = advanceMover(unit(), MOVE_TICK_MS, env());
    expect(moving.moveSpeed).toBeCloseTo(BASE_SPEED * UNIT_STATS.ghost.speedMod);
    expect(advanceMover({ ...moving, isStunned: true }, MOVE_TICK_MS, env()).moveSpeed).toBe(0);
    expect(run(unit({ path: ['1,0'] }), 30).moveSpeed).toBe(0);
  });
});
