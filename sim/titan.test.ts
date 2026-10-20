import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { resolveAttacks } from './combat';
import { createUnit } from './production';
import { afterRailShot, fireRailguns, laneEnd, railDamage } from './railgun';
import { isScreened, markScreened, pruneSmoke, SMOKE, SmokeScreen } from './titan';
import { addBuff, unitAbilityEffects } from './unitAbilities';

const NOW = 100_000;
const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x: number, z = 0, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, team, id, { x, z }), ...patch });
const screen = (team: UnitData['team'], at: { x: number; z: number }): SmokeScreen => ({ id: 's', team, at, laidAt: NOW - 1000, until: NOW + 5000 });

describe('tank Smoke Screen', () => {
  it("screens the side's own units inside it once the canisters land, until it clears", () => {
    const units = [unit('t', 'tank', 'blue', 10), unit('i', 'trooper', 'blue', 11), unit('far', 'trooper', 'blue', 13), unit('e', 'trooper', 'red', 10, 1)];
    const marked = markScreened(units, [screen('blue', { x: 10, z: 0 })], NOW);
    expect(marked.filter(isScreened).map(u => u.id)).toEqual(['t', 'i']);
    // Not before the canisters burst, nor after it clears.
    expect(markScreened(units, [{ ...screen('blue', { x: 10, z: 0 }), laidAt: NOW - 100 }], NOW)).toBe(units);
    expect(pruneSmoke([screen('blue', { x: 0, z: 0 })], NOW + 6000)).toEqual([]);
  });

  it('hides a unit from enemy ground fire, and halves what aircraft do to it', () => {
    const hidden = addBuff(unit('t', 'trooper', 'blue', 10), 'smoke', NOW + 250);
    const rifle = unit('r', 'trooper', 'red', 12);
    expect(resolveAttacks([hidden, rifle], [], NOW, () => false).aiming.get('r')).toBeNull();
    const wasp = unit('w', 'wasp', 'red', 12);
    const open = resolveAttacks([unit('t', 'trooper', 'blue', 10), wasp], [], NOW, () => false).unitDamage.get('t')!;
    const smoked = resolveAttacks([hidden, wasp], [], NOW, () => false).unitDamage.get('t')!;
    expect(smoked).toBeCloseTo(open * SMOKE.airDamage);
    // Rail guns can't pick it out either.
    expect(fireRailguns([unit('k', 'tank', 'red', 20), hidden, unit('s', 'scout_car', 'red', 11)], [], NOW).shots).toHaveLength(0);
  });

  it("is the tank's first ability: it lays a cloud where it stands, on a cooldown", () => {
    const tank = unit('t', 'tank', 'blue', 10, 4);
    const r = unitAbilityEffects([tank], 'blue', { tier: 2, upgrades: [] }, { unitIds: ['t'], ability: 'smoke_screen' }, NOW);
    expect(r.ok && r.smoke).toEqual([expect.objectContaining({ team: 'blue', at: { x: 10, z: 4 }, until: NOW + SMOKE.durationMs })]);
    const used = r.ok ? r.updates.get('t')!(tank) : tank;
    expect(unitAbilityEffects([used], 'blue', { tier: 2, upgrades: [] }, { unitIds: ['t'], ability: 'smoke_screen' }, NOW + 1000)).toMatchObject({ ok: false, reason: expect.stringMatching(/recharging/) });
  });
});

describe('tank Piercing Rail Round', () => {
  // A street along z = 0 from x = 0 to x = 20.
  const street = (x: number, z: number) => z === 0 && x >= 0 && x <= 20;

  it('needs Tier 3 and research, and loads the next slug', () => {
    const tank = unit('t', 'tank', 'blue', 0);
    expect(unitAbilityEffects([tank], 'blue', { tier: 3, upgrades: [] }, { unitIds: ['t'], ability: 'piercing_round' }, NOW)).toMatchObject({ ok: false, reason: expect.stringMatching(/Advanced Research/) });
    const r = unitAbilityEffects([tank], 'blue', { tier: 3, upgrades: ['piercing_round'] }, { unitIds: ['t'], ability: 'piercing_round' }, NOW);
    expect(r.ok && r.updates.get('t')!(tank).buffs?.map(b => b.kind)).toEqual(['piercing_round']);
  });

  it('carries on down the lane past its target, hitting every enemy in the way, until the street ends', () => {
    const tank = addBuff(unit('t', 'tank', 'blue', 0), 'piercing_round', NOW + 20_000);
    const units = [tank, unit('a', 'razorback', 'red', 5), unit('b', 'trooper', 'red', 9), unit('c', 'howitzer', 'red', 14), unit('off', 'razorback', 'red', 9, 3), unit('own', 'razorback', 'blue', 7)];
    const r = fireRailguns(units, [], NOW, undefined, undefined, street);
    expect([...r.unitDamage.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(r.unitDamage.get('b')).toBeCloseTo(railDamage('infantry'));
    expect(r.shots[0]).toMatchObject({ pierced: true, to: { x: 20, z: 0 } });
    expect(laneEnd({ x: 0, z: 0 }, { x: 5, z: 0 }, street)).toEqual({ x: 20, z: 0 });
    // Without it, the slug stops at the first target; and firing spends the round.
    expect([...fireRailguns(units.map(u => u.id === 't' ? unit('t', 'tank', 'blue', 0) : u), [], NOW).unitDamage.keys()]).toEqual(['a']);
    expect(afterRailShot(tank, NOW).buffs).toEqual([]);
  });
});
