import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { applyFieldCloak, CLOAK_FIELD, fieldCloakedIds, generatorsReplacedBy, isCloakFieldUp, isHidden } from './cloak';
import { resolveAttacks } from './combat';
import { batteryDrain } from './energy';
import { createUnit } from './production';
import { addBuff } from './unitAbilities';

const unit = (type: UnitData['type'], team: 'blue' | 'red', id: string, x: number, z = 0) => createUnit(type, team, id, { x, z });
const NOW = 100_000;

describe('Cloaking Field', () => {
  it('cloaks friendly units inside the field, not the generator, enemies or anyone outside', () => {
    const units = [unit('cloak_generator', 'blue', 'g', 0), unit('tank', 'blue', 'in', 2), unit('tank', 'blue', 'out', CLOAK_FIELD.radius + 1), unit('tank', 'red', 'foe', 1)];
    expect([...fieldCloakedIds(units, NOW)]).toEqual(['in']);
  });

  it('drops with a flat battery, an EMP or a dead generator', () => {
    const gen = unit('cloak_generator', 'blue', 'g', 0);
    expect(isCloakFieldUp(gen)).toBe(true);
    expect(isCloakFieldUp({ ...gen, battery: 0 })).toBe(false);
    expect(isCloakFieldUp({ ...gen, health: 0 })).toBe(false);
    expect(isCloakFieldUp(addBuff(gen, 'emp', NOW + 1000))).toBe(false);
    expect(fieldCloakedIds([{ ...gen, battery: 0 }, unit('tank', 'blue', 't', 1)], NOW).size).toBe(0);
  });

  it('firing or being hit shows a unit for a few seconds, then it is cloaked again', () => {
    const gen = unit('cloak_generator', 'blue', 'g', 0);
    const shooter = { ...unit('tank', 'blue', 's', 1), lastAttackTime: NOW - 1000 };
    const hit = { ...unit('tank', 'blue', 'h', 1, 1), lastDamageTime: NOW - 1000 };
    expect(fieldCloakedIds([gen, shooter, hit], NOW).size).toBe(0);
    expect(fieldCloakedIds([gen, shooter, hit], NOW - 1000 + CLOAK_FIELD.revealMs).size).toBe(2);
  });

  it('cloaked units are never picked as a target', () => {
    const tank = unit('tank', 'red', 'enemy', 0);
    const target = { ...unit('tank', 'blue', 'hidden', 2), fieldCloaked: true };
    expect(resolveAttacks([tank, target], [], NOW, () => false).fired.has('enemy')).toBe(false);
    expect(resolveAttacks([tank, { ...target, fieldCloaked: false }], [], NOW, () => false).fired.has('enemy')).toBe(true);
    expect(isHidden(target)).toBe(true);
  });

  it('cloaked units can still open fire', () => {
    const shooter = { ...unit('tank', 'blue', 'hidden', 0), fieldCloaked: true };
    expect(resolveAttacks([shooter, unit('tank', 'red', 'e', 2)], [], NOW, () => false).fired.has('hidden')).toBe(true);
  });

  it('runs off the generator battery, on the grid or off it', () => {
    const gen = unit('cloak_generator', 'blue', 'g', 0);
    expect(batteryDrain(gen, false, true)).toBeCloseTo(CLOAK_FIELD.drainPerTick);
    expect(batteryDrain(gen, false, false)).toBeGreaterThan(CLOAK_FIELD.drainPerTick);
  });

  it("a new drop replaces only that side's generator", () => {
    const units = [unit('cloak_generator', 'blue', 'b1', 0), unit('cloak_generator', 'red', 'r1', 9), unit('tank', 'blue', 't', 1)];
    expect(generatorsReplacedBy(units, 'blue')).toEqual(['b1']);
  });

  it('keeps unchanged units as the same objects', () => {
    const units = [unit('cloak_generator', 'blue', 'g', 0), unit('tank', 'blue', 't', 1)];
    const once = applyFieldCloak(units, fieldCloakedIds(units, NOW));
    expect(once[1].fieldCloaked).toBe(true);
    expect(applyFieldCloak(once, fieldCloakedIds(once, NOW))).toBe(once);
  });
});
