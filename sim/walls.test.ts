import { describe, expect, it } from 'vitest';
import type { StructureData } from '../types';
import { bulwarkJoins, otherRun, snapRun } from './walls';

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

describe('Bulwark Walls clicking together', () => {
  const bulwark = (x: number, z: number, run: 'x' | 'z', patch: Partial<StructureData> = {}) => wall(x, z, run, { type: 'wall_tier2', id: `b${x}-${z}`, ...patch });
  it('joins the ends that meet a finished Bulwark of the side running the same way', () => {
    const line = [bulwark(4, 5, 'x'), bulwark(5, 5, 'x'), bulwark(6, 5, 'x')];
    expect(bulwarkJoins(line[0], line)).toEqual({ start: false, end: true });
    expect(bulwarkJoins(line[1], line)).toEqual({ start: true, end: true });
    expect(bulwarkJoins(line[2], line)).toEqual({ start: true, end: false });
  });

  it('maps a line along z to the turned model\'s ends', () => {
    const line = [bulwark(5, 4, 'z'), bulwark(5, 5, 'z')];
    // Turned a quarter, the model's +x end points to -z.
    expect(bulwarkJoins(line[1], line)).toEqual({ start: false, end: true });
    expect(bulwarkJoins(line[0], line)).toEqual({ start: true, end: false });
  });

  it('leaves a gap beside one running across, a blueprint, Dragon\'s Teeth or the other side\'s', () => {
    const me = bulwark(5, 5, 'x');
    for (const other of [bulwark(6, 5, 'z'), bulwark(6, 5, 'x', { isBlueprint: true }), wall(6, 5, 'x'), bulwark(6, 5, 'x', { team: 'red' })]) {
      expect(bulwarkJoins(me, [me, other])).toEqual({ start: false, end: false });
    }
  });
});
