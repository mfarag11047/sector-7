import { describe, expect, it } from 'vitest';
import type { BuildingData, UnitData } from '../types';
import { createEconomy } from './economy';
import { createHeadlessMatch, stepMatch } from './headless';
import { aiTeamsOf, doctrineOf, incomeMultipliers, MatchConfig } from './match';
import { freshPacing, pacingJson, pacingText, pacingTick, recordArea, recordHit, recordVictory, SAMPLE_MS } from './pacing';
import { createUnit } from './production';

const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x = 10, z = 10) => createUnit(type, team, id, { x, z });
const node = (id: string, type: BuildingData['type'], owner: BuildingData['owner']): BuildingData => ({
  id, gridX: 0, gridZ: 0, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type, height: 1, blockId: 'b',
  owner, captureProgress: 0, capturingTeam: null, health: 100, maxHealth: 100,
});

describe('pacing recorder', () => {
  it('counts the starting force apart from trained units', () => {
    const r = freshPacing();
    const economy = createEconomy();
    pacingTick(r, 100, { units: [unit('a', 'trooper', 'blue')], structures: [], buildings: [], economy });
    pacingTick(r, 20_000, { units: [unit('a', 'trooper', 'blue'), unit('b', 'trooper', 'blue'), unit('c', 'tank', 'red')], structures: [], buildings: [], economy });
    expect(r.tallies.blue.trooper).toMatchObject({ started: 1, trained: 1 });
    expect(r.tallies.red.tank).toMatchObject({ started: 0, trained: 1 });
  });

  it('credits damage and kills to whoever hit the unit', () => {
    const r = freshPacing();
    const economy = createEconomy();
    const tank = unit('t', 'tank', 'blue');
    const target = unit('x', 'trooper', 'red');
    pacingTick(r, 100, { units: [tank, target], structures: [], buildings: [], economy });
    recordHit(r, 't', 'x');
    pacingTick(r, 200, { units: [tank, { ...target, health: target.health - 30 }], structures: [], buildings: [], economy });
    expect(r.tallies.blue.tank.damageToUnits).toBe(30);
    // Killed a little later: the rest of its health is the tank's too.
    pacingTick(r, 1000, { units: [tank], structures: [], buildings: [], economy });
    expect(r.tallies.blue.tank.damageToUnits).toBe(target.health);
    expect(r.tallies.red.trooper.died).toBe(1);
    expect(r.events.map(e => e.kind)).toEqual(['first_combat', 'first_loss', 'first_kill']);
  });

  it('splits a hit between everyone who fired, and keeps damage with no shooter as other', () => {
    const r = freshPacing();
    const economy = createEconomy();
    const a = unit('a', 'trooper', 'blue'), b = unit('b', 'razorback', 'blue'), x = unit('x', 'tank', 'red');
    pacingTick(r, 100, { units: [a, b, x], structures: [], buildings: [], economy });
    recordHit(r, 'a', 'x');
    recordArea(r, 'b', 'blue', x.gridPos, 1, [a, b, x], []);
    pacingTick(r, 200, { units: [a, b, { ...x, health: x.health - 40 }], structures: [], buildings: [], economy });
    expect(r.tallies.blue.trooper.damageToUnits).toBe(20);
    expect(r.tallies.blue.razorback.damageToUnits).toBe(20);
    // Long after anyone fired at it.
    pacingTick(r, 10_000, { units: [a, b, { ...x, health: x.health - 50 }], structures: [], buildings: [], economy });
    expect(r.tallies.blue.other.damageToUnits).toBe(10);
  });

  it('tallies the neutral server-node guards on their own', () => {
    const r = freshPacing();
    const economy = createEconomy();
    const guard = unit('g', 'defense_drone', 'neutral');
    const t = unit('t', 'trooper', 'blue');
    pacingTick(r, 100, { units: [guard, t], structures: [], buildings: [], economy });
    recordHit(r, 'g', 't');
    pacingTick(r, 200, { units: [guard, { ...t, health: t.health - 15 }], structures: [], buildings: [], economy });
    expect(r.neutral.damageToUnits).toBe(15);
    expect(r.tallies.blue.other).toBeUndefined();
    // Not the two sides fighting.
    expect(r.events.some(e => e.kind === 'first_combat')).toBe(false);
  });

  it('logs node captures, tiers, snapshots and the result', () => {
    const r = freshPacing();
    const economy = createEconomy();
    pacingTick(r, 100, { units: [], structures: [], buildings: [node('c1', 'core_node', null), node('s1', 'server_node', null)], economy });
    pacingTick(r, 40_000, { units: [], structures: [], buildings: [node('c1', 'core_node', 'blue'), node('s1', 'server_node', 'red')], economy: { ...economy, red: { ...economy.red, tier: 2 } } });
    pacingTick(r, 50_000, { units: [], structures: [], buildings: [node('c1', 'core_node', 'red'), node('s1', 'server_node', 'red')], economy: { ...economy, red: { ...economy.red, tier: 2 } } });
    recordVictory(r, 'red');
    expect(r.events.map(e => `${e.kind}:${e.team}`)).toEqual([
      'core_captured:blue', 'server_captured:red', 'tier:red', 'core_lost:blue', 'core_captured:red', 'victory:red',
    ]);
    expect(r.samples.map(s => s.atMs)).toEqual([100, 40_000]);
    expect(r.samples[1].blue.coreNodes).toBe(1);
    expect(SAMPLE_MS).toBe(30_000);
    expect(pacingText(r)).toContain('Tokugen won by destroying every enemy Command HQ');
    expect(JSON.parse(JSON.stringify(pacingJson(r))).events).toHaveLength(6);
  });
});

describe('AI vs AI', () => {
  const config: MatchConfig = { mode: 'spectate', seed: 1, playerTeam: 'blue', difficulty: 'hard', playerDoctrine: 'heavy_metal', aiDoctrine: 'netrunner' };

  it('has the computer play both sides, each with its own doctrine and the same income', () => {
    expect(aiTeamsOf(config)).toEqual(['blue', 'red']);
    expect(doctrineOf(config, 'blue')).toBe('heavy_metal');
    expect(doctrineOf(config, 'red')).toBe('netrunner');
    expect(incomeMultipliers(config)).toEqual({ blue: 1.35, red: 1.35 });
    expect(aiTeamsOf({ ...config, mode: 'ai' })).toEqual(['red']);
    expect(aiTeamsOf({ ...config, mode: 'sandbox' })).toEqual([]);
    expect(doctrineOf({ ...config, mode: 'ai', playerTeam: 'red' }, 'blue')).toBe('netrunner');
  });

  it('records the opening of a headless match', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    while (m.now < 3 * 60_000) stepMatch(m);
    const kinds = new Set(m.pacing.events.map(e => e.kind));
    expect(kinds.has('core_captured')).toBe(true);
    expect(kinds.has('structure_built')).toBe(true);
    for (const team of ['blue', 'red'] as const) {
      expect(m.pacing.tallies[team].trooper.started).toBe(3);
      expect(Object.values(m.pacing.tallies[team]).reduce((n, t) => n + t.trained, 0)).toBeGreaterThan(0);
    }
    expect(m.pacing.samples.length).toBe(7);
  }, 60_000);
});

describe('pacing recorder start', () => {
  it('takes the starting force from the first tick with units, however late', () => {
    const r = freshPacing();
    const economy = createEconomy();
    pacingTick(r, 100, { units: [], structures: [], buildings: [], economy });
    pacingTick(r, 6000, { units: [unit('a', 'trooper', 'blue')], structures: [], buildings: [], economy });
    pacingTick(r, 9000, { units: [unit('a', 'trooper', 'blue'), unit('b', 'trooper', 'blue')], structures: [], buildings: [], economy });
    expect(r.tallies.blue.trooper).toMatchObject({ started: 1, trained: 1 });
  });
});

describe('structures that only flicker out', () => {
  it('are not logged as lost unless something hurt them', () => {
    const r = freshPacing();
    const economy = createEconomy();
    const factory = { id: 'f', type: 'armor', team: 'red', gridPos: { x: 5, z: 5 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 1200, maxHealth: 1200 } as const;
    pacingTick(r, 100, { units: [], structures: [factory], buildings: [], economy });
    // Gone for a tick with no hit on it, then back.
    pacingTick(r, 200, { units: [], structures: [], buildings: [], economy });
    pacingTick(r, 300, { units: [], structures: [factory], buildings: [], economy });
    expect(r.events.some(e => e.kind === 'structure_destroyed')).toBe(false);
    // Shot down for real.
    const tank = unit('t', 'tank', 'blue');
    pacingTick(r, 400, { units: [tank], structures: [factory], buildings: [], economy });
    recordHit(r, 't', 'f');
    pacingTick(r, 500, { units: [tank], structures: [], buildings: [], economy });
    expect(r.events.filter(e => e.kind === 'structure_destroyed').map(e => e.team)).toEqual(['red']);
  });
});
