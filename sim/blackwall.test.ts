import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { BLACKWALL, blackwallImpact, blackwallTick, infectionLeft, isInfected } from './blackwall';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'tank', unitClass: 'armor', team: 'red', gridPos: { x: 10, z: 10 }, path: [], visionRange: 4,
  health: 400, maxHealth: 400, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});

const apply = (units: UnitData[], updates: Map<string, (u: UnitData) => UnitData>) => units.map(u => updates.get(u.id)?.(u) ?? u);

// Runs the virus for `ms`, in game ticks.
function run(units: UnitData[], ms: number, from = 0, step = 100) {
  let list = units;
  for (let t = from + step; t <= from + ms; t += step) list = apply(list, blackwallTick(list, step, t));
  return list;
}

describe('Black Wall virus bomb', () => {
  it('takes a quarter of max health from enemies in the blast and infects them', () => {
    const units = [unit('hit'), unit('edge', { gridPos: { x: 11, z: 11 } }), unit('far', { gridPos: { x: 13, z: 10 } }), unit('own', { team: 'blue' })];
    const after = apply(units, blackwallImpact(units, { x: 10, z: 10 }, 'blue', 1000));
    const [hit, edge, far, own] = after;
    expect(hit.health).toBe(300);
    expect(isInfected(hit)).toBe(true);
    expect(isInfected(edge)).toBe(true);
    expect(far).toBe(units[2]);
    expect(own).toBe(units[3]);
  });

  it('leaves the neutral Sentinels alone', () => {
    const units = [unit('s', { team: 'neutral', type: 'defense_drone' })];
    expect(blackwallImpact(units, { x: 10, z: 10 }, 'blue', 0).size).toBe(0);
  });
});

describe('Black Wall infection', () => {
  it('burns an infected unit for its time, then wears off', () => {
    const sick = unit('sick', { blackwallInfectedAt: 0, health: 300 });
    const after10s = run([sick], 10_000)[0];
    expect(after10s.health).toBeCloseTo(300 - 400 * BLACKWALL.burnPerSecond * 10);
    expect(infectionLeft(after10s, 10_000)).toBeCloseTo(1 - 10_000 / BLACKWALL.durationMs);
    // Hit at full health by the bomb (75% left), it comes through with an eighth.
    const later = run([sick], 60_000)[0];
    expect(isInfected(later)).toBe(false);
    expect(later.health).toBeCloseTo(300 - 400 * BLACKWALL.burnPerSecond * BLACKWALL.durationMs / 1000);
    expect(later.health).toBeGreaterThan(0);
  });

  it('still kills a unit that was already wounded, unless it is repaired through it', () => {
    const wounded = unit('w', { blackwallInfectedAt: 0, health: 200 });
    expect(run([wounded], 30_000)[0].health).toBe(0);
    // A Guardian's 15 HP a second on a 400 HP tank burning 10 a second keeps it up.
    let list = [wounded];
    for (let t = 100; t <= 30_000; t += 100) list = apply(list, blackwallTick(list, 100, t)).map(u => ({ ...u, health: Math.min(u.maxHealth, u.health + 1.5) }));
    expect(list[0].health).toBeGreaterThan(0);
    expect(isInfected(list[0])).toBe(false);
  });

  it('a unit that shook it off cannot catch it again from a friend for a while', () => {
    // Two clumped units infected 6 s apart, as a spread would leave them.
    const units = [unit('a', { blackwallInfectedAt: 0 }), unit('b', { gridPos: { x: 11, z: 10 }, blackwallInfectedAt: 6000 })];
    const cured = run(units, BLACKWALL.durationMs + 100);
    expect(isInfected(cured[0])).toBe(false);
    expect(isInfected(cured[1])).toBe(true);
    // b is still burning next to a for well over the 6 s it takes to catch it: a stays clear.
    const later = run(cured, BLACKWALL.spreadMs + 2000, BLACKWALL.durationMs + 100);
    expect(isInfected(later[0])).toBe(false);
    expect(later[0].blackwallExposureMs).toBeUndefined();
  });

  it('a fresh bomb infects even an immune unit and starts its time again', () => {
    const units = [unit('a', { blackwallImmuneUntil: 50_000 }), unit('b', { blackwallInfectedAt: 1000, gridPos: { x: 10.5, z: 10 } })];
    const [a, b] = apply(units, blackwallImpact(units, { x: 10, z: 10 }, 'blue', 20_000));
    expect(a.blackwallInfectedAt).toBe(20_000);
    expect(a.blackwallImmuneUntil).toBeUndefined();
    expect(b.blackwallInfectedAt).toBe(20_000);
  });

  it('spreads to a friend who stays within two tiles for 2.5 s', () => {
    const units = [unit('sick', { blackwallInfectedAt: 0 }), unit('buddy', { gridPos: { x: 12, z: 10 } })];
    const almost = run(units, BLACKWALL.spreadMs - 200);
    expect(isInfected(almost[1])).toBe(false);
    expect(almost[1].blackwallExposureMs).toBeGreaterThan(0);
    const caught = run(units, BLACKWALL.spreadMs + 100);
    expect(isInfected(caught[1])).toBe(true);
  });

  it('does not spread to the other side or to units out of range', () => {
    const units = [unit('sick', { blackwallInfectedAt: 0 }), unit('enemy', { team: 'blue', gridPos: { x: 11, z: 10 } }), unit('far', { gridPos: { x: 13, z: 10 } })];
    const after = run(units, 10_000);
    expect(isInfected(after[1])).toBe(false);
    expect(isInfected(after[2])).toBe(false);
  });

  it('resets exposure when the friend moves away in time', () => {
    const near = [unit('sick', { blackwallInfectedAt: 0 }), unit('buddy', { gridPos: { x: 11, z: 10 } })];
    const exposed = run(near, 1500);
    const away = run([exposed[0], { ...exposed[1], gridPos: { x: 20, z: 10 } }], 200, 1500);
    expect(away[1].blackwallExposureMs).toBeUndefined();
    expect(isInfected(away[1])).toBe(false);
  });

  it('chains along a column of units', () => {
    const column = [0, 1, 2, 3].map(i => unit(`u${i}`, { gridPos: { x: 10 + i * 2, z: 10 }, ...(i === 0 ? { blackwallInfectedAt: 0 } : {}) }));
    const after = run(column, BLACKWALL.spreadMs * 3 + 500);
    expect(after.every(isInfected)).toBe(true);
  });
});
