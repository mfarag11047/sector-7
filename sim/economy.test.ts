import { describe, expect, it } from 'vitest';
import { BUILDING_VALUES, DOCTRINE_CONFIG, UNIT_STATS } from '../constants';
import { COMPUTE_PER_SERVER_NODE, HQ_COMPUTE, TIER_RESEARCH_COST } from './units';
import type { BuildingData, StructureData, UnitData } from '../types';
import {
  addWarheads, advanceWarheadProduction, canAfford, createEconomy, doctrinePowerCost, HQ_INCOME, incomeFor, payIncome,
  productionStep, setCores, spend, STARTING_CORES, takeWarhead, teamStats, unitCost, warheadBuildTime, computeRateFor, research, setCompute,
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
    expect(e.blue).toEqual({ cores: STARTING_CORES, lifetimeIncome: 0, stockpile: { emp: 0, he: 0 }, compute: 0, lifetimeCompute: 0, tier: 1 });
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
    expect(e.red.stockpile).toEqual({ emp: 0, he: 1 });
    expect(e.blue.stockpile).toEqual({ emp: 0, he: 0 });
  });

  it('cannot draw from an empty stockpile', () => {
    expect(takeWarhead(createEconomy(), 'blue', 'emp')).toBeNull();
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

  it('is the HQ trickle plus live, owned core nodes', () => {
    expect(incomeFor(map, 'blue')).toBe(HQ_INCOME + 2 * CORE_INCOME);
    expect(incomeFor(map, 'red')).toBe(HQ_INCOME + CORE_INCOME);
  });

  it('adds to cores and lifetime income each tick', () => {
    const e = payIncome(payIncome(createEconomy(0), map), map);
    expect(e.blue).toMatchObject({ cores: 2 * (HQ_INCOME + 2 * CORE_INCOME), lifetimeIncome: 2 * (HQ_INCOME + 2 * CORE_INCOME) });
    expect(e.red).toMatchObject({ cores: 2 * (HQ_INCOME + CORE_INCOME), lifetimeIncome: 2 * (HQ_INCOME + CORE_INCOME) });
  });

  it('scales by a per-team multiplier (AI difficulty)', () => {
    const e = payIncome(createEconomy(0), map, { red: 2 });
    expect(e.red.cores).toBe(2 * (HQ_INCOME + CORE_INCOME));
    expect(e.blue.cores).toBe(HQ_INCOME + 2 * CORE_INCOME);
  });

  it('is unaffected by spending, so tiers never re-lock', () => {
    let e = payIncome(createEconomy(0), map);
    e = spend(e, 'blue', e.blue.cores)!;
    expect(e.blue.cores).toBe(0);
    expect(e.blue.lifetimeIncome).toBe(HQ_INCOME + 2 * CORE_INCOME);
  });
});

describe('compute and research', () => {
  const servers = [building('s1', 'server_node', 'blue'), building('s2', 'server_node', 'blue'), building('s3', 'server_node', 'red'), building('s4', 'server_node', 'blue', true)];

  it('pays the HQ trickle plus each live server node held', () => {
    expect(computeRateFor(servers, 'blue')).toBe(HQ_COMPUTE + 2 * COMPUTE_PER_SERVER_NODE);
    expect(computeRateFor([], 'red')).toBe(HQ_COMPUTE);
    const e = payIncome(createEconomy(0), servers);
    expect(e.blue.compute).toBe(HQ_COMPUTE + 2 * COMPUTE_PER_SERVER_NODE);
    expect(e.red.compute).toBe(HQ_COMPUTE + COMPUTE_PER_SERVER_NODE);
  });

  it('researches one tier at a time, permanently', () => {
    let e = setCompute(createEconomy(0), 'blue', TIER_RESEARCH_COST[2] + TIER_RESEARCH_COST[3]);
    expect(research(e, 'blue', 3)).toBeNull();
    e = research(e, 'blue', 2)!;
    expect(e.blue).toMatchObject({ tier: 2, compute: TIER_RESEARCH_COST[3] });
    e = research(e, 'blue', 3)!;
    expect(e.blue).toMatchObject({ tier: 3, compute: 0 });
    // Losing every server node afterwards changes nothing.
    expect(payIncome(e, []).blue.tier).toBe(3);
  });

  it('refuses research without the compute', () => {
    expect(research(setCompute(createEconomy(0), 'red', TIER_RESEARCH_COST[2] - 1), 'red', 2)).toBeNull();
  });
});

describe('doctrine powers', () => {
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
    const units = [{ team: 'blue', type: 'trooper', health: 1 }, { team: 'blue', type: 'tank', health: 1 }, { team: 'red', type: 'trooper', health: 1 }] as UnitData[];
    const map = [building('c1', 'core_node', 'blue'), building('s1', 'server_node', 'blue'), building('s2', 'server_node', 'blue', true)];
    const econ = research(setCompute(addWarheads(createEconomy(500), 'blue', 'emp'), 'blue', 200), 'blue', 2)!;
    const stats = teamStats(econ, 'blue', map, units);
    expect(stats).toMatchObject({
      resources: 500,
      income: HQ_INCOME + CORE_INCOME,
      compute: 200 - TIER_RESEARCH_COST[2],
      computeRate: HQ_COMPUTE + COMPUTE_PER_SERVER_NODE,
      tier: 2,
      units: 2,
      pop: 1 + 3,
      popCap: 28,
      stockpile: { emp: 1, he: 0 },
      // Doctrine powers unlock with the researched tier.
      doctrine: { unlockedTiers: 2 },
    });
    expect(stats.buildings).toMatchObject({ core_node: 1, server_node: 1 });
  });
});
