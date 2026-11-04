import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DOCTRINE_CONFIG } from '../constants';
import { AI_DOCTRINE, AI_PROFILES, ambushSpot, powerSaving } from './ai';
import type { TeamEconomy } from './economy';
import { createHeadlessMatch } from './headless';
import { createUnit } from './production';
import { UNIT_RULES } from './units';

// A side's economy with the given doctrine-track picks.
const withPicks = (picks: string[]): TeamEconomy => {
  const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: 'netrunner', red: null } });
  return { ...m.economy.blue, track: { points: 0, progressMs: 0, elapsedMs: 0, picks } };
};
const ready = { tier2: 0, tier3: 0 };

// Both behaviours are off in the game for now (sim/ai.ts AI_DOCTRINE); these tests switch them on.
const defaults = { ...AI_DOCTRINE };
beforeEach(() => Object.assign(AI_DOCTRINE, { savePowers: 1, ambushLookahead: 4 }));
afterEach(() => Object.assign(AI_DOCTRINE, defaults));

describe('the computer saves up for its doctrine power', () => {
  it('keeps the price of a ready power in the bank while its army is out fighting', () => {
    const e = withPicks(['nr_brute', 'netrunner_tier3']);
    expect(powerSaving('netrunner', AI_PROFILES.normal, e, ready, 'attack')).toBe(DOCTRINE_CONFIG.netrunner.tier3_cost);
    expect(powerSaving('netrunner', AI_PROFILES.normal, e, ready, 'defend')).toBe(DOCTRINE_CONFIG.netrunner.tier3_cost);
  });

  it('saves nothing while switched off, as in the game for now', () => {
    AI_DOCTRINE.savePowers = 0;
    expect(powerSaving('netrunner', AI_PROFILES.normal, withPicks(['nr_brute', 'netrunner_tier3']), ready, 'attack')).toBe(0);
  });

  it('spends everything on the army while gathering, while the power recharges, and on Easy', () => {
    const e = withPicks(['nr_brute', 'netrunner_tier3']);
    expect(powerSaving('netrunner', AI_PROFILES.normal, e, ready, 'gather')).toBe(0);
    expect(powerSaving('netrunner', AI_PROFILES.normal, e, { tier2: 0, tier3: 30_000 }, 'attack')).toBe(0);
    expect(powerSaving('netrunner', AI_PROFILES.easy, e, ready, 'attack')).toBe(0);
    expect(powerSaving('netrunner', AI_PROFILES.normal, withPicks(['nr_brute']), ready, 'attack')).toBe(0);
  });

  it('saves for the cheaper of two ready powers on Hard', () => {
    const e = withPicks(['nr_brute', 'netrunner_tier3', 'nr_hero', 'netrunner_arsenal']);
    expect(powerSaving('netrunner', AI_PROFILES.hard, e, ready, 'attack')).toBe(DOCTRINE_CONFIG.netrunner.tier2_cost);
  });
});

describe('Shadow Ops waits for the enemy from the dark', () => {
  const open = () => true;
  const range = UNIT_RULES.trooper.weapon!.range;
  const trooper = (x: number, quietSince = -Infinity) => ({ ...createUnit('trooper', 'blue', 'me', { x, z: 10 }), lastAttackTime: quietSince });
  const enemy = createUnit('trooper', 'red', 'them', { x: 10, z: 10 });

  it('stops on a tile just inside its range of the nearest enemy, on its own side', () => {
    const u = trooper(10 - range - 2);
    const spot = ambushSpot(u, [enemy], 60_000, 6000, open)!;
    expect(spot).not.toBeNull();
    expect(Math.hypot(spot.x - 10, spot.z - 10)).toBeLessThanOrEqual(range);
    expect(spot.x).toBeLessThan(10);
  });

  it('has nothing to wait for once in range, with the enemy far off, or after a fight', () => {
    expect(ambushSpot(trooper(10 - range), [enemy], 60_000, 6000, open)).toBeNull();
    expect(ambushSpot(trooper(0), [enemy], 60_000, 6000, open)).toBeNull();
    expect(ambushSpot(trooper(10 - range - 2, 58_000), [enemy], 60_000, 6000, open)).toBeNull();
    // Quick Fade: quiet for 2 s is enough.
    expect(ambushSpot(trooper(10 - range - 2, 58_000), [enemy], 60_000, 2000, open)).not.toBeNull();
  });

  it('never waits while switched off, as in the game for now', () => {
    AI_DOCTRINE.ambushLookahead = 0;
    expect(ambushSpot(trooper(10 - range - 2), [enemy], 60_000, 6000, open)).toBeNull();
  });

  it('never picks a tile it cannot stand on', () => {
    expect(ambushSpot(trooper(10 - range - 2), [enemy], 60_000, 6000, () => false)).toBeNull();
  });

  it('leaves heavy armour and artillery to the usual orders', () => {
    const tank = { ...createUnit('tank', 'blue', 'tank', { x: 4, z: 10 }) };
    expect(ambushSpot(tank, [enemy], 60_000, 6000, open)).toBeNull();
  });
});
