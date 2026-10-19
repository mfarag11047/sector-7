import { describe, expect, it } from 'vitest';
import type { StructureData } from '../types';
import { checkVictory } from './victory';

const hq = (team: 'blue' | 'red', health = 5000, id = `hq-${team}`): StructureData => ({
  id, type: 'hq', team, gridPos: { x: 0, z: 0 }, isBlueprint: false, constructionProgress: 0,
  maxProgress: 0, health, maxHealth: 5000,
});

describe('victory', () => {
  it('goes to the side whose HQ still stands', () => {
    expect(checkVictory([hq('blue'), hq('red', 0)])).toEqual({ winner: 'blue', reason: 'destruction' });
    expect(checkVictory([hq('blue', 0), hq('red')])).toEqual({ winner: 'red', reason: 'destruction' });
  });

  it('is never decided while both sides have a Command HQ, however much ground one holds', () => {
    expect(checkVictory([hq('blue'), hq('red')])).toBeNull();
    // A side whose starting HQ fell fights on from one it built.
    expect(checkVictory([hq('blue', 0), hq('blue', 5000, 'hq-blue-2'), hq('red')])).toBeNull();
  });
});
