import { describe, expect, it } from 'vitest';
import { follow, MAX_EXTRAPOLATION_S, predictPosition, walkAlong } from './glide';

describe('walkAlong', () => {
  const route = [{ x: 10, z: 0 }, { x: 10, z: 10 }];

  it('follows the route around corners', () => {
    expect(walkAlong({ x: 0, z: 0 }, route, 5)).toEqual({ x: 5, z: 0 });
    expect(walkAlong({ x: 0, z: 0 }, route, 15)).toEqual({ x: 10, z: 5 });
  });

  it('stops at the end of the route', () => {
    expect(walkAlong({ x: 0, z: 0 }, route, 99)).toEqual({ x: 10, z: 10 });
  });
});

describe('predictPosition', () => {
  const route = [{ x: 100, z: 0 }];

  it('carries the unit forward at its speed', () => {
    expect(predictPosition({ x: 0, z: 0 }, route, 20, 0.1)).toEqual({ x: 2, z: 0 });
  });

  it('caps how far ahead it guesses', () => {
    expect(predictPosition({ x: 0, z: 0 }, route, 20, 5).x).toBeCloseTo(20 * MAX_EXTRAPOLATION_S);
  });

  it('holds still units in place', () => {
    expect(predictPosition({ x: 3, z: 4 }, route, 0, 1)).toEqual({ x: 3, z: 4 });
    expect(predictPosition({ x: 3, z: 4 }, [], 20, 1)).toEqual({ x: 3, z: 4 });
  });
});

describe('follow', () => {
  it('converges on a fixed point', () => {
    let p = { x: 0, z: 0 };
    for (let i = 0; i < 120; i++) p = follow(p, { x: 5, z: 0 }, 1 / 60, 14);
    expect(p.x).toBeCloseTo(5, 2);
  });

  it('eases in more slowly from far away', () => {
    const near = follow({ x: 0, z: 0 }, { x: 10, z: 0 }, 1 / 60, 14);
    const far = follow({ x: 0, z: 0 }, { x: 100, z: 0 }, 1 / 60, 14);
    expect(far.x / 100).toBeLessThan(near.x / 10);
  });
});

// The bug this module fixes: updates reach the screen late and unevenly, worst when a
// unit enters a new tile. The drawn unit must still move at a steady speed.
describe('motion under uneven updates', () => {
  it('neither stalls nor lurches', () => {
    const TILE = 14, SPEED = 17.28, TICK = 100, FRAME = 1000 / 60;
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    const updates: { shownAt: number; tickAt: number; x: number }[] = [];
    let lastShown = 0;
    for (let k = 1; k <= 120; k++) {
      const tickAt = k * TICK;
      const x = (SPEED * tickAt) / 1000;
      const enteredTile = Math.floor(x / TILE) !== Math.floor((SPEED * (tickAt - TICK)) / 1000 / TILE);
      lastShown = Math.max(lastShown, tickAt + 15 + rand() * 25 + (enteredTile ? 80 : 0));
      updates.push({ shownAt: lastShown, tickAt, x });
    }

    let drawn = { x: 0, z: 0 };
    let report = { x: 0, z: 0, at: 0 };
    let next = 0;
    const speeds: number[] = [];
    for (let now = 0; now < 11500; now += FRAME) {
      while (next < updates.length && updates[next].shownAt <= now) {
        report = { x: updates[next].x, z: 0, at: updates[next].tickAt };
        next++;
      }
      const predicted = predictPosition(report, [{ x: 1e6, z: 0 }], SPEED, (now - report.at) / 1000);
      const moved = follow(drawn, predicted, FRAME / 1000, TILE);
      if (now > 1000) speeds.push((moved.x - drawn.x) / (FRAME / 1000) / SPEED);
      drawn = moved;
    }

    expect(Math.min(...speeds)).toBeGreaterThan(0.8);
    expect(Math.max(...speeds)).toBeLessThan(1.2);
  });
});
