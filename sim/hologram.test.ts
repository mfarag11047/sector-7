import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { resolveAttacks } from './combat';
import { fadeHolograms, HOLOGRAM, hologramTypeFor, isHologram, spawnHolograms } from './hologram';
import { NO_NANO } from './nanoCloud';
import { createUnit } from './production';
import { wreckOf } from './salvage';
import { popUsed } from './units';

let n = 0;
const id = () => `h${++n}`;
const at = { x: 20, z: 20 };

describe('Phantom Decoys holograms', () => {
  it('copy the side\'s own units nearest the target, dearest first', () => {
    const units = [
      createUnit('trooper', 'blue', 'a', { x: 21, z: 20 }),
      createUnit('tank', 'blue', 'b', { x: 22, z: 20 }),
      createUnit('tank', 'red', 'c', { x: 20, z: 21 }),
      createUnit('razorback', 'blue', 'far', { x: 60, z: 60 }),
    ];
    const holos = spawnHolograms(units, 'blue', at, 1000, id);
    expect(holos).toHaveLength(HOLOGRAM.count);
    // Taken in turn from the copies, dearest first.
    expect(holos.map(h => h.type)).toEqual(Array.from({ length: HOLOGRAM.count }, (_, i) => (i % 2 === 0 ? 'tank' : 'trooper')));
    expect(holos.every(h => h.team === 'blue' && h.hologramUntil === 1000 + HOLOGRAM.lifeMs)).toBe(true);
  });

  it('are Troopers with nothing near to copy, and plain units for anything special', () => {
    expect(spawnHolograms([], 'red', at, 0, id).every(h => h.type === 'trooper')).toBe(true);
    expect(hologramTypeFor('howitzer')).toBe('razorback');
    expect(hologramTypeFor('hero_heavy_metal')).not.toBe('hero_heavy_metal');
    expect(hologramTypeFor('hornet')).toBe('attack_drone');
  });

  it('fade when their time is up', () => {
    const [h] = spawnHolograms([], 'blue', at, 0, id);
    const real = createUnit('trooper', 'blue', 'real', at);
    expect(fadeHolograms([h, real], HOLOGRAM.lifeMs - 1)).toHaveLength(2);
    expect(fadeHolograms([h, real], HOLOGRAM.lifeMs)).toEqual([real]);
  });

  it('are shot at like real units, break fast, and their own shots do nothing', () => {
    const [h] = spawnHolograms([], 'blue', at, 0, id);
    const enemy = createUnit('trooper', 'red', 'enemy', { x: at.x + 1, z: at.z });
    const result = resolveAttacks([h, enemy] as UnitData[], [], 10_000, NO_NANO);
    expect(result.fired.get('enemy')).toBe(h.id);
    expect(result.fired.get(h.id)).toBe('enemy');
    expect(result.unitDamage.get('enemy') ?? 0).toBe(0);
    // The same shot at a real Trooper does a quarter as much.
    const real = createUnit('trooper', 'blue', 'real', at);
    const control = resolveAttacks([real, enemy] as UnitData[], [], 10_000, NO_NANO);
    expect(result.unitDamage.get(h.id)).toBeCloseTo((control.unitDamage.get('real') ?? 0) * HOLOGRAM.damageTaken);
  });

  it('take no population and leave no wreck', () => {
    const holos = spawnHolograms([], 'blue', at, 0, () => 'x').map(h => ({ ...h, type: 'tank' as const }));
    expect(isHologram(holos[0])).toBe(true);
    expect(popUsed(holos, [], 'blue')).toBe(0);
    expect(wreckOf('tank', at, 0, 'w', 'blue', true)).toBeNull();
    expect(wreckOf('tank', at, 0, 'w', 'blue')).not.toBeNull();
  });
});
