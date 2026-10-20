import { describe, expect, it } from 'vitest';
import { UNIT_STATS } from '../constants';
import type { StructureData, UnitType } from '../types';
import { createEconomy } from './economy';
import { isRemoteUnit, isTetherableDrone } from './jamming';
import { orderEffects, type OrdersContext } from './orders';
import { ArmorClass, dps, UNIT_RULES } from './units';

const structure = (id: string, type: StructureData['type']): StructureData => ({
  id, type, team: 'blue', gridPos: { x: 4, z: 4 }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 900, maxHealth: 900,
});
const ctx = { gridSize: 79, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } } } as unknown as OrdersContext;
const train = (s: StructureData) =>
  orderEffects({ units: [], structures: [s], buildings: [], economy: createEconomy(1000), unlimitedPop: true }, 'blue', { type: 'TRAIN_UNIT', structureId: s.id, unitType: 'attack_drone' }, ctx);
const ARMORS: ArmorClass[] = ['infantry', 'light', 'heavy', 'air'];
const perCore = (t: UnitType, a: ArmorClass) => dps(UNIT_RULES[t].weapon, a) / UNIT_STATS[t].cost;

describe('Kestrel attack drone', () => {
  it('is trained at the Airpad from Tier 1, cheap and light on population', () => {
    expect(UNIT_RULES.attack_drone).toMatchObject({ producer: 'air', tier: 1, pop: 1, armor: 'air' });
    expect(UNIT_STATS.attack_drone.cost).toBeLessThan(UNIT_STATS.wasp.cost);
    expect('effects' in train(structure('pad', 'air'))).toBe(true);
    expect('reason' in train(structure('barracks', 'infantry'))).toBe(true);
  });

  it('does decent damage to everything, ground and air', () => {
    const w = UNIT_RULES.attack_drone.weapon!;
    expect(w.hitsGround && w.hitsAir).toBe(true);
    for (const a of ARMORS) expect(dps(w, a)).toBeGreaterThanOrEqual(8);
  });

  it('is a generalist: never the best counter per core, but no armour shrugs it off', () => {
    // Troopers are better against infantry, Lancers against armour, flak against aircraft.
    expect(perCore('trooper', 'infantry')).toBeGreaterThan(perCore('attack_drone', 'infantry'));
    expect(perCore('lancer', 'heavy')).toBeGreaterThan(perCore('attack_drone', 'heavy'));
    expect(perCore('aegis', 'air')).toBeGreaterThan(perCore('attack_drone', 'air'));
    // Where rifles fall away (heavy armour), the machine gun keeps biting.
    expect(perCore('attack_drone', 'heavy')).toBeGreaterThan(perCore('trooper', 'heavy'));
  });

  it('is remote-controlled: Banshees can jam it, and hardline it', () => {
    expect(isRemoteUnit({ type: 'attack_drone' })).toBe(true);
    expect(isTetherableDrone({ type: 'attack_drone' })).toBe(true);
  });
});
