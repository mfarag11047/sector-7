import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { fireHornetRockets, HORNET, landSalvo, salvoFrom } from './hornet';
import { createUnit } from './production';
import { UNIT_RULES } from './units';

const unit = (type: UnitData['type'], team: 'blue' | 'red', id: string, x: number, z = 0) => createUnit(type, team, id, { x, z });
const NOW = 100_000;
const tier = (t: 1 | 2 | 3) => () => t;

describe('Hornet gun', () => {
  it('fires armour-piercing rounds from Tier 2', () => {
    expect(UNIT_RULES.hornet.tier).toBe(2);
    expect(UNIT_RULES.hornet.weapon?.type).toBe('ap');
  });
});

describe('Hornet Tier 3 anti-vehicle rocket', () => {
  const hornet = { ...unit('hornet', 'blue', 'h', 0), combatTargetId: 't' };
  const tank = unit('tank', 'red', 't', 3);

  it("fires at the gun's current target only from Tier 3", () => {
    expect(fireHornetRockets([hornet, tank], [], NOW, tier(2)).shots).toHaveLength(0);
    const r = fireHornetRockets([hornet, tank], [], NOW, tier(3));
    expect(r.shots.map(s => s.targetId)).toEqual(['t']);
    expect(r.unitDamage.get('t')).toBeGreaterThan(HORNET.rocket.damage);
  });

  it('reloads between rockets and needs a target', () => {
    expect(fireHornetRockets([{ ...hornet, hornetRocketAt: NOW - 1000 }, tank], [], NOW, tier(3)).shots).toHaveLength(0);
    expect(fireHornetRockets([{ ...hornet, hornetRocketAt: NOW - HORNET.rocket.cooldownMs }, tank], [], NOW, tier(3)).shots).toHaveLength(1);
    expect(fireHornetRockets([{ ...hornet, combatTargetId: null }, tank], [], NOW, tier(3)).shots).toHaveLength(0);
  });
});

describe('Hellfire Salvo', () => {
  const hornet = unit('hornet', 'blue', 'h', 0);
  it('rains rockets over the area through the volley, damaging ground units but not aircraft', () => {
    const rockets = salvoFrom(hornet, { x: 6, z: 0 }, 3, NOW);
    expect(rockets).toHaveLength(HORNET.salvo.rockets);
    expect(rockets[rockets.length - 1].landsAt - rockets[0].landsAt).toBeGreaterThan(HORNET.salvo.spreadMs / 2);
    const units = [hornet, unit('trooper', 'red', 'inf', 6), unit('tank', 'red', 'tank', 6, 1), unit('wasp', 'red', 'air', 6)];
    expect(landSalvo(rockets, NOW, units, []).landed).toHaveLength(0);
    const all = landSalvo(rockets, NOW + 10_000, units, []);
    expect(all.landed).toHaveLength(rockets.length);
    expect(all.unitDamage.get('inf') ?? 0).toBeGreaterThan(0);
    expect(all.unitDamage.has('air')).toBe(false);
  });

  it('is an area weapon: harder on infantry than on heavy armour', () => {
    const rocket = { id: 'r', team: 'blue' as const, attackerId: 'h', from: { x: 0, z: 0 }, at: { x: 6, z: 0 }, firedAt: 0, landsAt: 0 };
    const units = [unit('trooper', 'red', 'inf', 6), unit('tank', 'red', 'tank', 6)];
    const d = landSalvo([rocket], 1, units, []).unitDamage;
    expect(d.get('inf')!).toBeGreaterThan(d.get('tank')!);
  });
});
