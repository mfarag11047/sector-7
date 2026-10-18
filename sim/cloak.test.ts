import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { applyFieldCloak, CLOAK_FIELD, fieldCloakedIds, generatorsReplacedBy, isCloakFieldUp, isHidden } from './cloak';
import { AbilityContext, abilityEffects, applyUnitEffects } from './abilities';
import { resolveAttacks } from './combat';
import { createEconomy } from './economy';
import { RADAR, radarSources, radarUnits } from './radar';
import { batteryDrain } from './energy';
import { createUnit } from './production';
import { addBuff } from './unitAbilities';

const unit = (type: UnitData['type'], team: 'blue' | 'red', id: string, x: number, z = 0) => createUnit(type, team, id, { x, z });
const NOW = 100_000;
const CTX: AbilityContext = {
  now: NOW, offset: 0, tileSize: 14, isWalkable: () => true, findPath: () => [], findAirPath: () => [],
  findAdjacentSpawn: c => c, createCrawler: (h, at, s) => createUnit('crawler_drone', h.team, `c-${s}`, at), random: () => 0.5, newId: p => p,
};

describe('Cloaking Field', () => {
  it('cloaks the generator and friendly units inside the field, not enemies or anyone outside', () => {
    const units = [unit('cloak_generator', 'blue', 'g', 0), unit('tank', 'blue', 'in', 2), unit('tank', 'blue', 'out', CLOAK_FIELD.radius + 1), unit('tank', 'red', 'foe', 1)];
    expect([...fieldCloakedIds(units, NOW)]).toEqual(['g', 'in']);
  });

  it('the generator shows itself when its field is down or it is hit', () => {
    const gen = unit('cloak_generator', 'blue', 'g', 0);
    expect(fieldCloakedIds([{ ...gen, battery: 0 }], NOW).size).toBe(0);
    expect(fieldCloakedIds([{ ...gen, lastDamageTime: NOW - 100 }], NOW).size).toBe(0);
  });

  it('an Aegis radar still picks up field-cloaked units as contacts, ground or air', () => {
    const units = [
      unit('aegis', 'red', 'radar', 0),
      { ...unit('cloak_generator', 'blue', 'g', 10), fieldCloaked: true },
      { ...unit('tank', 'blue', 'hidden-tank', 11), fieldCloaked: true },
      unit('tank', 'blue', 'plain-tank', 12),
      { ...unit('tank', 'blue', 'too-far', RADAR.range + 2), fieldCloaked: true },
    ];
    expect(radarUnits(units, 'red', radarSources(units, 'red'), () => false).map(u => u.id)).toEqual(['g', 'hidden-tank']);
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
    expect([...fieldCloakedIds([gen, shooter, hit], NOW)]).toEqual(['g']);
    expect([...fieldCloakedIds([gen, shooter, hit], NOW - 1000 + CLOAK_FIELD.revealMs)]).toEqual(['g', 's', 'h']);
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
    const units = [unit('cloak_generator', 'blue', 'g', 0), unit('tank', 'blue', 't', 1), unit('tank', 'blue', 'far', 9)];
    const once = applyFieldCloak(units, fieldCloakedIds(units, NOW));
    expect(once.map(u => !!u.fieldCloaked)).toEqual([true, true, false]);
    expect(once[2]).toBe(units[2]);
    expect(applyFieldCloak(once, fieldCloakedIds(once, NOW))).toBe(once);
  });

  it('its owner can switch the field off and on, and it spends no battery while off', () => {
    const gen = unit('cloak_generator', 'blue', 'g', 0);
    const units = [gen, unit('tank', 'blue', 't', 1)];
    const off = abilityEffects({ units, structures: [], economy: createEconomy(0) }, 'blue', { type: 'TOGGLE_CLOAK_FIELD', unitIds: ['g'] }, CTX);
    if ('reason' in off) throw new Error(off.reason);
    const switchedOff = applyUnitEffects(units, off.effects);
    expect(switchedOff[0].cloakFieldOff).toBe(true);
    expect(isCloakFieldUp(switchedOff[0])).toBe(false);
    expect(fieldCloakedIds(switchedOff, NOW).size).toBe(0);
    expect(batteryDrain(switchedOff[0], false, true)).toBe(0);
    const on = abilityEffects({ units: switchedOff, structures: [], economy: createEconomy(0) }, 'blue', { type: 'TOGGLE_CLOAK_FIELD', unitIds: ['g'] }, CTX);
    if ('reason' in on) throw new Error(on.reason);
    expect([...fieldCloakedIds(applyUnitEffects(switchedOff, on.effects), NOW)]).toEqual(['g', 't']);
    // Not the other side's generator.
    expect('reason' in abilityEffects({ units, structures: [], economy: createEconomy(0) }, 'red', { type: 'TOGGLE_CLOAK_FIELD', unitIds: ['g'] }, CTX)).toBe(true);
  });
});
