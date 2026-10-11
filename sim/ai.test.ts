import { describe, expect, it } from 'vitest';
import { chooseUnit } from './ai';
import { createHeadlessMatch, stepMatch } from './headless';

const noRandom = () => 0.9;
const opts = { counters: true, random: noRandom, needInfantry: false, guardians: 0, army: 0 };

describe('what the computer trains', () => {
  it('counters infantry with Razorbacks and armour with rockets', () => {
    expect(chooseUnit('armor', 1, { infantry: 1, light: 0, heavy: 0, air: 0, structure: 0 }, opts)).toBe('razorback');
    expect(chooseUnit('infantry', 2, { infantry: 0, light: 0.3, heavy: 0.7, air: 0, structure: 0 }, opts)).toBe('lancer');
  });

  it('answers aircraft with flak', () => {
    expect(chooseUnit('armor', 2, { infantry: 0, light: 0, heavy: 0, air: 1, structure: 0 }, opts)).toBe('aegis');
  });

  it('never trains above its tier, and keeps a floor of infantry for capturing', () => {
    expect(chooseUnit('infantry', 1, { infantry: 0, light: 0, heavy: 1, air: 0, structure: 0 }, opts)).toBe('trooper');
    expect(chooseUnit('air', 1, { infantry: 1, light: 0, heavy: 0, air: 0, structure: 0 }, opts)).toBeNull();
    expect(chooseUnit('infantry', 3, { infantry: 0, light: 0, heavy: 1, air: 0, structure: 0 }, { ...opts, needInfantry: true })).toBe('trooper');
  });
});

describe('a computer-vs-computer match', () => {
  it('builds, trains and takes its core node within four minutes, on both sides', () => {
    const m = createHeadlessMatch({ seed: 11, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    while (m.now < 4 * 60_000) stepMatch(m);
    for (const team of ['blue', 'red'] as const) {
      const types = m.structures.filter(s => s.team === team).map(s => s.type);
      expect(types).toEqual(expect.arrayContaining(['hq', 'infantry', 'armor']));
      expect(m.units.filter(u => u.team === team).length).toBeGreaterThan(6);
      expect(m.buildings.some(b => b.type === 'core_node' && b.owner === team)).toBe(true);
    }
  }, 60_000);
});
