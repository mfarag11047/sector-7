import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { StructureData } from '../types';
import { createEconomy } from './economy';
import { isRemoteUnit } from './jamming';
import { orderEffects, type OrdersContext } from './orders';
import { createUnit } from './production';
import { UNIT_RULES } from './units';

const structure = (id: string, type: StructureData['type']): StructureData => ({
  id, type, team: 'blue', gridPos: { x: 4, z: 4 }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 900, maxHealth: 900,
});
const ctx = { gridSize: 79, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } } } as unknown as OrdersContext;
const train = (s: StructureData) =>
  orderEffects({ units: [], structures: [s], buildings: [], economy: createEconomy(1000), unlimitedPop: true }, 'blue', { type: 'TRAIN_UNIT', structureId: s.id, unitType: 'scout_car' }, ctx);

describe('Jackrabbit scout RC car', () => {
  it('is trained at the Command HQ from Tier 1, and nowhere else', () => {
    expect(UNIT_RULES.scout_car).toMatchObject({ producer: 'hq', tier: 1, weapon: null });
    expect('effects' in train(structure('hq-blue', 'hq'))).toBe(true);
    expect('reason' in train(structure('barracks', 'infantry'))).toBe(true);
  });

  it('is fast, far-sighted, fragile and carries a big battery', () => {
    const car = createUnit('scout_car', 'blue', 'c', { x: 5, z: 5 });
    expect(car.maxBattery).toBe(ABILITY_CONFIG.SCOUT_CAR_BATTERY);
    expect(car.maxBattery).toBeGreaterThan(createUnit('razorback', 'blue', 'r', { x: 5, z: 5 }).maxBattery);
    const others = Object.entries(UNIT_STATS).filter(([t, s]) => t !== 'scout_car' && UNIT_RULES[t as keyof typeof UNIT_RULES].producer && s.speedMod > 0);
    for (const [, s] of others) {
      expect(UNIT_STATS.scout_car.speedMod).toBeGreaterThan(s.speedMod);
      expect(UNIT_STATS.scout_car.visionRange).toBeGreaterThan(s.visionRange);
    }
    expect(car.maxHealth).toBeLessThanOrEqual(40);
  });

  it('is remote-controlled, so a Banshee can jam it', () => {
    expect(isRemoteUnit({ type: 'scout_car' })).toBe(true);
  });
});
