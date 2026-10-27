import { describe, expect, it } from 'vitest';
import type { StructureData } from '../types';
import { otherRun, snapRun } from './walls';

const wall = (x: number, z: number, wallRun: 'x' | 'z' = 'x', patch: Partial<StructureData> = {}): StructureData => ({
  id: `w${x}-${z}`, type: 'wall_tier1', team: 'blue', gridPos: { x, z }, isBlueprint: false, constructionProgress: 100,
  maxProgress: 100, health: 400, maxHealth: 400, wallRun, ...patch,
});

describe('which way a placed wall runs', () => {
  it('has nothing to join on open ground', () => {
    expect(snapRun({ x: 5, z: 5 }, [], 'blue')).toBeNull();
  });

  it('carries on the line of a wall beside it running toward it', () => {
    expect(snapRun({ x: 6, z: 5 }, [wall(5, 5, 'x')], 'blue')).toBe('x');
    expect(snapRun({ x: 5, z: 6 }, [wall(5, 5, 'z')], 'blue')).toBe('z');
  });

  it('lines up along the axis its neighbours lie on, even where they run across it', () => {
    expect(snapRun({ x: 5, z: 6 }, [wall(5, 5, 'x')], 'blue')).toBe('z');
  });

  it('at a corner, follows the neighbour already running its way', () => {
    expect(snapRun({ x: 6, z: 5 }, [wall(5, 5, 'x'), wall(6, 6, 'x')], 'blue')).toBe('x');
    expect(snapRun({ x: 6, z: 5 }, [wall(5, 5, 'z'), wall(6, 6, 'z')], 'blue')).toBe('z');
  });

  it('joins Bulwark Walls too, but not the other side\'s walls or other structures', () => {
    expect(snapRun({ x: 6, z: 5 }, [wall(5, 5, 'x', { type: 'wall_tier2' })], 'blue')).toBe('x');
    expect(snapRun({ x: 6, z: 5 }, [wall(5, 5, 'x', { team: 'red' })], 'blue')).toBeNull();
    expect(snapRun({ x: 6, z: 5 }, [wall(5, 5, 'x', { type: 'defense' })], 'blue')).toBeNull();
  });

  it('turns either way', () => {
    expect(otherRun('x')).toBe('z');
    expect(otherRun('z')).toBe('x');
  });
});
