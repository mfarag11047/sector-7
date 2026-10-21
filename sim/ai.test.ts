import { describe, expect, it } from 'vitest';
import { chooseUnit } from './ai';
import { createHeadlessMatch, stepMatch } from './headless';

const noRandom = () => 0.9;
const opts = { counterAccuracy: 1, random: noRandom, needInfantry: false, guardians: 0, army: 0 };

describe('what the computer trains', () => {
  it('counters infantry with Razorbacks and armour with rockets', () => {
    expect(chooseUnit('armor', 1, { trooper: 1 }, opts)).toBe('razorback');
    expect(chooseUnit('infantry', 2, { razorback: 0.3, tank: 0.7 }, opts)).toBe('lancer');
  });

  it('answers aircraft with flak', () => {
    expect(chooseUnit('armor', 2, { attack_drone: 1 }, opts)).toBe('aegis');
    expect(chooseUnit('armor', 2, { hornet: 0.5, wasp: 0.5 }, opts)).toBe('aegis');
  });

  it('never trains above its tier, and keeps a floor of infantry for capturing', () => {
    expect(chooseUnit('infantry', 1, { tank: 1 }, opts)).toBe('trooper');
    // At Tier 1 the Airpad's only fighter is the Kestrel attack drone, never the Tier 2 gunships.
    expect(chooseUnit('air', 1, { trooper: 1 }, opts)).toBe('attack_drone');
    expect(chooseUnit('infantry', 3, { tank: 1 }, { ...opts, needInfantry: true })).toBe('trooper');
  });
});

describe('a computer-vs-computer match', () => {
  it('builds, trains and takes its core node within four minutes, on both sides', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    while (m.now < 4 * 60_000) stepMatch(m);
    for (const team of ['blue', 'red'] as const) {
      const types = m.structures.filter(s => s.team === team).map(s => s.type);
      expect(types).toEqual(expect.arrayContaining(['hq', 'infantry', 'armor']));
      // Trained beyond its starting five (an armoured army fields fewer, dearer units).
      expect(m.units.filter(u => u.team === team).length).toBeGreaterThan(5);
      expect(m.buildings.some(b => b.type === 'core_node' && b.owner === team)).toBe(true);
    }
  }, 60_000);
});
