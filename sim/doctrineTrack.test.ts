import { describe, expect, it } from 'vitest';
import type { BuildingData } from '../types';
import { createEconomy, type TeamEconomy } from './economy';
import { advanceTrack, EDGES, hasPower, nextOpenRank, pickBlocker, POINT_EVERY_MS, powersOf, RANK_OPENS_MS, STARTING_POINTS, takePick, TRACK, trackPowerCooldown, trackPowerCost } from './doctrineTrack';
import { DOCTRINE_CONFIG } from '../constants';
import { orderEffects } from './orders';

const server = (owner: BuildingData['owner']) => ({ id: 's', type: 'server_node', owner, destroyed: false } as BuildingData);
const run = (ms: number, buildings: BuildingData[] = []) => {
  let e = createEconomy(5000);
  for (let t = 0; t < ms; t += 1000) e = advanceTrack(e, buildings, 1000);
  return e;
};

describe('doctrine points', () => {
  it('come with time, faster for each server node held', () => {
    expect(run(0).blue.track!.points).toBe(STARTING_POINTS);
    expect(run(POINT_EVERY_MS).blue.track!.points).toBe(STARTING_POINTS + 1);
    // Two server nodes: half again as fast.
    expect(run(POINT_EVERY_MS * 2, [server('blue'), server('blue')]).blue.track!.points).toBe(STARTING_POINTS + 3);
    expect(run(POINT_EVERY_MS * 2, [server('blue'), server('blue')]).red.track!.points).toBe(STARTING_POINTS + 2);
  });
});

describe('ranks', () => {
  it('open on time, cost their points, go in order, and take one option of two', () => {
    let e = run(1000).blue;
    expect(nextOpenRank(e, 'heavy_metal')).toBe(1);
    expect(pickBlocker(e, 'heavy_metal', 2, 'heavy_metal_tier2')).toMatch(/rank 1 first/);
    expect(pickBlocker(e, 'heavy_metal', 1, 'nope')).toMatch(/not an option/);
    e = takePick(e, 'heavy_metal', 1, 'hm_scrap');
    expect(pickBlocker(e, 'heavy_metal', 1, 'hm_welders')).toMatch(/already chosen/);
    expect(pickBlocker(e, 'heavy_metal', 2, 'heavy_metal_tier2')).toMatch(/opens at 4:00/);
    e = run(RANK_OPENS_MS[1]).blue;
    e = takePick(e, 'heavy_metal', 1, 'hm_scrap');
    expect(pickBlocker(e, 'heavy_metal', 2, 'heavy_metal_tier2')).toBeNull();
  });

  it('every doctrine has four ranks of two: rank 2 its two powers, rank 3 its hero ability or an edge', () => {
    for (const d of ['heavy_metal', 'shadow_ops', 'netrunner'] as const) {
      expect(TRACK[d].length).toBe(4);
      expect(TRACK[d][1].map(o => o.power)).toEqual(['tier2', 'tier3']);
      expect(TRACK[d][2].filter(o => o.heroAbility).length).toBe(1);
    }
  });

  it('powers come from the track: the one taken at rank 2, both with Arsenal, cheaper with Overdrive', () => {
    let e: TeamEconomy = { ...createEconomy().blue, track: { points: 99, progressMs: 0, elapsedMs: 99 * 60_000, picks: [] } };
    expect(powersOf(e, 'netrunner')).toEqual([]);
    e = takePick(takePick(e, 'netrunner', 1, 'nr_brute'), 'netrunner', 2, 'netrunner_tier3');
    expect(powersOf(e, 'netrunner')).toEqual(['tier3']);
    expect(hasPower(e, 'netrunner', 'tier2')).toBe(false);
    const hero = takePick(e, 'netrunner', 3, 'nr_hero');
    expect(hero.upgrades).toContain('botnet');
    const arsenal = takePick(hero, 'netrunner', 4, 'netrunner_arsenal');
    expect(powersOf(arsenal, 'netrunner')).toEqual(['tier2', 'tier3']);
    const over = takePick(hero, 'netrunner', 4, 'netrunner_overdrive');
    expect(trackPowerCost(over, 'netrunner', 'tier3')).toBe(Math.round(DOCTRINE_CONFIG.netrunner.tier3_cost / 2));
    expect(trackPowerCooldown(over, 'netrunner', 'tier3')).toBe(DOCTRINE_CONFIG.netrunner.tier3_cooldown / 2);
  });

  it('a pick is an order, checked like any other', () => {
    const economy = run(1000);
    const view = { units: [], structures: [], buildings: [], economy, doctrines: { blue: 'shadow_ops' as const } };
    const ok = orderEffects(view, 'blue', { type: 'PICK_DOCTRINE', rank: 1, option: 'so_silent' }, {} as never);
    expect(ok.ok).toBe(true);
    expect(orderEffects(view, 'blue', { type: 'PICK_DOCTRINE', rank: 1, option: 'hm_scrap' }, {} as never).ok).toBe(false);
  });
});

describe('what the edges do', () => {
  it('Hardened Plate and Killing Ground reach combat', async () => {
    const { trackCombatPerks } = await import('./doctrineTrack');
    const plated = { ...createEconomy().blue, track: { points: 0, progressMs: 0, elapsedMs: 0, picks: ['hm_welders', 'heavy_metal_tier2', 'hm_plate'] } };
    const killing = { ...createEconomy().red, track: { points: 0, progressMs: 0, elapsedMs: 0, picks: ['so_killing'] } };
    const perks = trackCombatPerks(t => (t === 'blue' ? plated : killing));
    expect(perks.damageTaken({ type: 'tank', team: 'blue' } as never)).toBeCloseTo(EDGES.plateDamageTaken);
    expect(perks.damageTaken({ type: 'trooper', team: 'blue' } as never)).toBe(1);
    expect(perks.ambushOf('red')).toBe(2);
    expect(perks.ambushOf('blue')).toBeNull();
  });

  it('Sentinel Foundry makes Sentinels cheaper and quicker to train', () => {
    const economy = createEconomy(5000);
    economy.blue.sentinelCode = true;
    economy.blue.track = { points: 0, progressMs: 0, elapsedMs: 0, picks: ['nr_foundry'] };
    const comm = { id: 'c', type: 'support', team: 'blue', gridPos: { x: 5, z: 5 }, health: 100, maxHealth: 100, isBlueprint: false, constructionProgress: 100, maxProgress: 100 } as never;
    const out = orderEffects({ units: [], structures: [comm], buildings: [], economy, doctrines: { blue: 'netrunner' }, unlimitedPop: true }, 'blue', { type: 'TRAIN_UNIT', structureId: 'c', unitType: 'defense_drone' }, {} as never);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.effects.economy!(economy)!.blue.cores).toBe(5000 - 180);
    expect(out.effects.structureUpdates.get('c')!(comm).queue![0].totalMs).toBe(12_000);
  });
});
