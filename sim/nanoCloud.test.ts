import { describe, expect, it } from 'vitest';
import { createUnit } from './production';
import { nanoCheck, nanoJammed, NO_NANO } from './nanoCloud';

const cloud = { team: 'blue' as const, at: { x: 10, z: 10 }, radius: 3 };

describe('the Nano-Cloud works for the side that cast it', () => {
  const check = nanoCheck([cloud]);

  it('blinds enemies inside it, never the caster\'s own units', () => {
    expect(check({ x: 11, z: 10 }, 'red', 'firing')).toBe(true);
    expect(check({ x: 11, z: 10 }, 'neutral', 'firing')).toBe(true);
    expect(check({ x: 11, z: 10 }, 'blue', 'firing')).toBe(false);
    expect(check({ x: 20, z: 10 }, 'red', 'firing')).toBe(false);
  });

  it('hides the caster\'s units inside it, never the enemy\'s', () => {
    expect(check({ x: 11, z: 10 }, 'blue', 'target')).toBe(true);
    expect(check({ x: 11, z: 10 }, 'red', 'target')).toBe(false);
    expect(check({ x: 20, z: 10 }, 'blue', 'target')).toBe(false);
  });

  it('does nothing with no clouds', () => {
    expect(nanoCheck([])).toBe(NO_NANO);
  });

  it('jams enemy remote units inside it, not crewed units or the caster\'s drones', () => {
    const units = [
      createUnit('attack_drone', 'red', 'enemy-drone', { x: 10, z: 11 }),
      createUnit('trooper', 'red', 'enemy-trooper', { x: 10, z: 11 }),
      createUnit('attack_drone', 'blue', 'own-drone', { x: 10, z: 11 }),
      createUnit('attack_drone', 'red', 'far-drone', { x: 30, z: 30 }),
    ];
    expect([...nanoJammed(units, [cloud])]).toEqual(['enemy-drone']);
  });
});
