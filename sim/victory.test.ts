import { describe, expect, it } from 'vitest';
import type { BuildingData, StructureData } from '../types';
import { checkVictory, DOMINATION_MS, DOMINATION_NODES, freshDominationClock } from './victory';

const hq = (team: 'blue' | 'red', health = 5000): StructureData => ({
  id: `hq-${team}`, type: 'hq', team, gridPos: { x: 0, z: 0 }, isBlueprint: false, constructionProgress: 0,
  maxProgress: 0, health, maxHealth: 5000,
});
const core = (i: number, owner: BuildingData['owner']): BuildingData => ({
  id: `c${i}`, gridX: i, gridZ: i, position: [0, 0, 0], scale: [1, 1, 1], color: '', type: 'core_node', height: 6,
  blockId: `c${i}`, owner, captureProgress: 0, capturingTeam: null, health: 100, maxHealth: 100,
});

describe('victory', () => {
  it('goes to the side whose HQ still stands', () => {
    expect(checkVictory([hq('blue'), hq('red', 0)], [], freshDominationClock(), 0).victory).toEqual({ winner: 'blue', reason: 'destruction' });
    expect(checkVictory([hq('blue', 0), hq('red')], [], freshDominationClock(), 0).victory).toEqual({ winner: 'red', reason: 'destruction' });
  });

  it('needs the core nodes held without a break for the full time', () => {
    const structures = [hq('blue'), hq('red')];
    const held = Array.from({ length: DOMINATION_NODES }, (_, i) => core(i, 'red'));
    let r = checkVictory(structures, held, freshDominationClock(), 1000);
    expect(r.victory).toBeNull();
    expect(r.clock.red).toBe(1000);
    r = checkVictory(structures, held, r.clock, 1000 + DOMINATION_MS - 1);
    expect(r.victory).toBeNull();
    // Losing one node resets the clock.
    const lost = [...held.slice(1), core(9, 'blue')];
    r = checkVictory(structures, lost, r.clock, 1000 + DOMINATION_MS);
    expect(r.clock.red).toBeNull();
    r = checkVictory(structures, held, r.clock, 5000 + DOMINATION_MS);
    r = checkVictory(structures, held, r.clock, 5000 + 2 * DOMINATION_MS);
    expect(r.victory).toEqual({ winner: 'red', reason: 'domination' });
  });
});
