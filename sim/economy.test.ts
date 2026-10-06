import { describe, expect, it } from 'vitest';
import { BUILDING_VALUES, DOCTRINE_CONFIG, TIER_UNLOCK_COSTS, UNIT_STATS } from '../constants';
import type { BuildingData, StructureData, UnitData } from '../types';
import {
  addWarheads, advanceWarheadProduction, canAfford, createEconomy, doctrinePowerCost, incomeFor, payIncome,
  productionStep, setCores, spend, STARTING_CORES, takeWarhead, teamStats, unitCost, unlockedTier, warheadBuildTime,
} from './economy';

const building = (id: string, type: BuildingData['type'], owner: BuildingData['owner'], destroyed = false): BuildingData => ({
  id, type, owner, destroyed, gridX: 0, gridZ: 0, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', height: 1,
  blockId: id, captureProgress: 0, capturingTeam: null, health: 1, maxHealth: 1,
});

const fab = (id: string, team: 'blue' | 'red', production?: StructureData['production']): StructureData => ({
  id, type: 'ordnance_fab', team, gridPos: { x: 0, z: 0 }, isBlueprint: false, constructionProgress: 0, maxProgress: 0,
  health: 1, maxHealth: 1, production,
});

const CORE_INCOME = BUILDING_VALUES.core_node.income;

describe('spending', () => {
  it('starts both teams with the same cores and empty stockpiles', () => {
    const e = createEconomy();
    expect(e.blue).toEqual({ cores: STARTING_CORES, lifetimeIncome: 0, stockpile: { eclipse: 0, he: 0 } });
    expect(e.red).toEqual(e.blue);
  });

  it('pays only for the team that bought, and never mutates the original', () => {
    const before = createEconomy(1000);
    const after = spend(before, 'blue', 300)!;
    expect(after.blue.cores).toBe(700);
    expect(after.red.cores).toBe(1000);
    expect(before.blue.cores).toBe(1000);
  });

  it('refuses what a team cannot afford', () => {
    const e = createEconomy(100);
    expect(spend(e, 'blue', 101)).toBeNull();
    expect(canAfford(e, 'blue', 100)).toBe(true);
  });

  it('refuses negative or non-numeric prices, which would otherwise add cores', () => {
    const e = createEconomy(100);
    expect(spend(e, 'blue', -500)).toBeNull();
    expect(spend(e, 'blue', NaN)).toBeNull();
    expect(spend(e, 'blue', Infinity)).toBeNull();
  });

  it('prices units from the unit table', () => {
    expect(unitCost('tank')).toBe(UNIT_STATS.tank.cost);
  });

  it('clamps cheat-set cores at zero', () => {
    expect(setCores(createEconomy(), 'red', -5).red.cores).toBe(0);
  });
});

describe('warhead stockpile', () => {
  it('adds and draws per team and type', () => {
    let e = addWarheads(createEconomy(), 'red', 'he', 2);
    e = takeWarhead(e, 'red', 'he')!;
    expect(e.red.stockpile).toEqual({ eclipse: 0, he: 1 });
    expect(e.blue.stockpile).toEqual({ eclipse: 0, he: 0 });
  });

  it('cannot draw from an empty stockpile', () => {
    expect(takeWarhead(createEconomy(), 'blue', 'eclipse')).toBeNull();
  });
});

describe('income', () => {
  const map = [
    building('c1', 'core_node', 'blue'),
    building('c2', 'core_node', 'blue'),
    building('c3', 'core_node', 'red'),
    building('c4', 'core_node', 'blue', true),
    building('c5', 'core_node', null),
    building('r1', 'residential', 'blue'),
    building('s1', 'server_node', 'red'),
  ];

  it('comes only from live, owned core nodes', () => {
    expect(incomeFor(map, 'blue')).toBe(2 * CORE_INCOME);
    expect(incomeFor(map, 'red')).toBe(CORE_INCOME);
  });

  it('adds to cores and lifetime income each tick', () => {
    const e = payIncome(payIncome(createEconomy(0), map), map);
    expect(e.blue).toMatchObject({ cores: 4 * CORE_INCOME, lifetimeIncome: 4 * CORE_INCOME });
    expect(e.red).toMatchObject({ cores: 2 * CORE_INCOME, lifetimeIncome: 2 * CORE_INCOME });
  });

  it('is unaffected by spending, so tiers never re-lock', () => {
    let e = payIncome(createEconomy(0), map);
    e = spend(e, 'blue', e.blue.cores)!;
    expect(e.blue.cores).toBe(0);
    expect(e.blue.lifetimeIncome).toBe(2 * CORE_INCOME);
  });
});

describe('doctrine tiers', () => {
  it('unlock at the configured lifetime income', () => {
    expect(unlockedTier(0)).toBe(1);
    expect(unlockedTier(TIER_UNLOCK_COSTS.TIER2 - 1)).toBe(1);
    expect(unlockedTier(TIER_UNLOCK_COSTS.TIER2)).toBe(2);
    expect(unlockedTier(TIER_UNLOCK_COSTS.TIER3)).toBe(3);
  });

  it('price powers from the doctrine table', () => {
    expect(doctrinePowerCost('heavy_metal', 2)).toBe(DOCTRINE_CONFIG.heavy_metal.tier2_cost);
    expect(doctrinePowerCost('shadow_ops', 3)).toBe(DOCTRINE_CONFIG.shadow_ops.tier3_cost);
  });
});

describe('warhead production', () => {
  it('runs 10% faster under Skunkworks', () => {
    expect(productionStep(null)).toBe(100);
    expect(productionStep('skunkworks')).toBeCloseTo(110);
  });

  it('finishes exactly once and reports the team and warhead', () => {
    const totalTime = warheadBuildTime('he');
    let structures = [fab('f1', 'blue', { active: true, item: 'he', progress: 0, totalTime })];
    const finished: { team: string; warhead: string }[] = [];
    for (let tick = 0; tick < totalTime / 100 + 5; tick++) {
      const result = advanceWarheadProduction(structures, () => null);
      structures = structures.map(s => ({ ...s, production: result.updates.get(s.id) ?? s.production }));
      finished.push(...result.finished);
    }
    expect(finished).toEqual([{ team: 'blue', warhead: 'he' }]);
    expect(structures[0].production).toMatchObject({ active: false, progress: 0 });
  });

  it('ignores idle fabs', () => {
    const result = advanceWarheadProduction([fab('f1', 'red')], () => null);
    expect(result.updates.size).toBe(0);
  });
});

describe('HUD stats', () => {
  it('summarises a team', () => {
    const units = [{ team: 'blue' }, { team: 'blue' }, { team: 'red' }] as UnitData[];
    const map = [building('c1', 'core_node', 'blue'), building('s1', 'server_node', 'blue'), building('s2', 'server_node', 'blue', true)];
    const stats = teamStats(addWarheads(createEconomy(500), 'blue', 'eclipse'), 'blue', map, units, 2);
    expect(stats).toMatchObject({
      resources: 500,
      income: CORE_INCOME,
      compute: 1 + 2,
      units: 2,
      stockpile: { eclipse: 1, he: 0 },
      doctrine: { unlockedTiers: 1 },
    });
    expect(stats.buildings).toMatchObject({ core_node: 1, server_node: 1 });
  });
});
