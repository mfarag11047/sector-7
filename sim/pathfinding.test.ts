import { describe, expect, it } from 'vitest';
import type { RoadType } from '../types';
import { airPath, fastestPath, TILE_COST } from './pathfinding';

// A 9x9 grid: everything open ground, with a main road along row z = 0 and column x = 8.
const N = 9;
const type = (x: number, z: number): RoadType => (z === 0 || x === 8 ? 'main' : 'open');
const travel = (path: string[]) => path.reduce((s, k) => { const [x, z] = k.split(',').map(Number); return s + TILE_COST[type(x, z)]; }, 0);

describe('fastestPath', () => {
  it('takes the highway when it is quicker than the direct line', () => {
    const path = fastestPath({ x: 0, z: 0 }, { x: 8, z: 8 }, N, () => true, type);
    // Along the main roads: 16 tiles at 0.5 = 8, against 16 open tiles at 2 = 32 the direct way.
    expect(path).toContain('8,0');
    expect(travel(path)).toBe(8);
  });

  it('still prefers the shortest route when the surfaces are the same', () => {
    const path = fastestPath({ x: 1, z: 1 }, { x: 4, z: 1 }, N, () => true, () => 'street');
    expect(path).toEqual(['2,1', '3,1', '4,1']);
  });

  it('goes around blocked tiles, and returns nothing when the goal is unreachable or blocked', () => {
    const wall = (x: number, z: number) => !(x === 4 && z < 8);
    const around = fastestPath({ x: 0, z: 3 }, { x: 7, z: 3 }, N, wall, () => 'street');
    expect(around.some(k => k.startsWith('4,'))).toBe(true);
    expect(around).not.toContain('4,3');
    expect(fastestPath({ x: 0, z: 0 }, { x: 4, z: 2 }, N, wall, () => 'street')).toEqual([]);
    expect(fastestPath({ x: 0, z: 0 }, { x: 0, z: 0 }, N, () => true, type)).toEqual([]);
  });
});

describe('airPath', () => {
  it('flies straight, diagonals included', () => {
    expect(airPath({ x: 0, z: 0 }, { x: 3, z: 3 })).toEqual(['1,1', '2,2', '3,3']);
    expect(airPath({ x: 0, z: 0 }, { x: 4, z: 2 })).toHaveLength(4);
    expect(airPath({ x: 2, z: 2 }, { x: 2, z: 2 })).toEqual([]);
  });
});
