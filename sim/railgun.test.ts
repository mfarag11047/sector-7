import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { createUnit } from './production';
import { afterRailShot, fireRailguns, RAILGUN } from './railgun';
import { addBuff } from './unitAbilities';
import { shotDamage } from './units';

const unit = (type: UnitData['type'], team: 'blue' | 'red', id: string, x: number, z = 0) => createUnit(type, team, id, { x, z });
const NOW = 100_000;
const spotter = (x: number) => unit('drone', 'blue', 'eye', x);
// Shots by our tank 't' (enemy tanks fire back).
const ours = (r: ReturnType<typeof fireRailguns>) => r.shots.filter(s => s.attackerId === 't');

describe('tank rail gun', () => {
  it('hits a far enemy vehicle that a friendly unit can see, not one nobody sees', () => {
    const tank = unit('tank', 'blue', 't', 0);
    const target = unit('razorback', 'red', 'rb', 12);
    expect(fireRailguns([tank, target], [], NOW).shots).toHaveLength(0);
    const r = fireRailguns([tank, target, spotter(11)], [], NOW);
    expect(r.shots.map(s => s.targetId)).toEqual(['rb']);
    expect(r.unitDamage.get('rb')).toBeCloseTo(shotDamage({ damage: RAILGUN.damage, cooldownMs: 0, range: 0, type: 'ap', hitsGround: true, hitsAir: false }, 'light'));
  });

  it('is out of reach past its range', () => {
    const units = [unit('tank', 'blue', 't', 0), unit('tank', 'red', 'far', RAILGUN.range + 1), spotter(RAILGUN.range)];
    expect(fireRailguns(units, [], NOW).shots).toHaveLength(0);
  });

  it('leaves infantry and aircraft alone and prefers heavy armour', () => {
    const units = [unit('tank', 'blue', 't', 0), unit('trooper', 'red', 'inf', 3), unit('hornet', 'red', 'air', 3), unit('razorback', 'red', 'light', 3, 1), unit('tank', 'red', 'heavy', 5)];
    expect(ours(fireRailguns(units, [], NOW)).map(s => s.targetId)).toEqual(['heavy']);
    expect(fireRailguns(units.slice(0, 3), [], NOW).shots).toHaveLength(0);
  });

  it('falls back on a seen enemy building', () => {
    const wall: StructureData = { id: 'w', type: 'wall_tier1', team: 'red', gridPos: { x: 8, z: 0 }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 500, maxHealth: 500 };
    const r = fireRailguns([unit('tank', 'blue', 't', 0), spotter(7)], [wall], NOW);
    expect(r.shots.map(s => s.targetId)).toEqual(['w']);
    expect(r.structureDamage.get('w')).toBeGreaterThan(0);
  });

  it('recharges between shots, pays battery, and holds fire when knocked out or flat', () => {
    const tank = unit('tank', 'blue', 't', 0);
    const units = (t: UnitData) => [t, unit('tank', 'red', 'e', 5)];
    const fired = afterRailShot(tank, NOW);
    expect(fired.battery).toBe(tank.battery - RAILGUN.batteryCost);
    expect(ours(fireRailguns(units(fired), [], NOW + RAILGUN.cooldownMs - 1))).toHaveLength(0);
    expect(ours(fireRailguns(units(fired), [], NOW + RAILGUN.cooldownMs))).toHaveLength(1);
    expect(ours(fireRailguns(units(addBuff(tank, 'emp', NOW + 1000)), [], NOW))).toHaveLength(0);
    expect(ours(fireRailguns(units({ ...tank, battery: RAILGUN.batteryCost - 1 }), [], NOW))).toHaveLength(0);
    expect(ours(fireRailguns(units({ ...tank, isStunned: true }), [], NOW))).toHaveLength(0);
  });

  it('cannot target a cloaked unit', () => {
    const units = [unit('tank', 'blue', 't', 0), { ...unit('tank', 'red', 'e', 5), fieldCloaked: true }];
    expect(ours(fireRailguns(units, [], NOW))).toHaveLength(0);
  });
});
