import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG, BUILDING_VALUES, UNIT_STATS } from '../constants';
import type { BuildingData, UnitData } from '../types';
import { captureTick } from './capture';
import { ballistaLoadStep, BASE_REPAIR, courierStep, guardianRepair, inBaseBlock, repairTick, slowTick, SlowTickContext, surveillanceStep } from './support';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const building = (patch: Partial<BuildingData> = {}): BuildingData => ({
  id: 'b', gridX: 5, gridZ: 6, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'residential', height: 1,
  blockId: 'b', owner: null, captureProgress: 0, capturingTeam: null, health: 200, maxHealth: 200, ...patch,
});

describe('captureTick', () => {
  const push = UNIT_STATS.ghost.captureMultiplier * BUILDING_VALUES.residential.captureSpeed;

  it('lets infantry push the bar, and only infantry', () => {
    const [b] = captureTick([building()], [unit('g')]);
    expect(b).toMatchObject({ capturingTeam: 'blue', captureProgress: push });
    const tank = unit('t', { type: 'tank', unitClass: 'armor' });
    expect(captureTick([building()], [tank])[0].captureProgress).toBe(0);
  });

  it('hands the building over at 100', () => {
    const [b] = captureTick([building({ capturingTeam: 'blue', captureProgress: 100 - push })], [unit('g')]);
    expect(b).toMatchObject({ owner: 'blue', captureProgress: 0, capturingTeam: null });
  });

  it('stalls when both sides are equally matched', () => {
    const buildings = [building({ capturingTeam: 'blue', captureProgress: 40 })];
    expect(captureTick(buildings, [unit('g'), unit('r', { team: 'red' })])).toBe(buildings);
  });

  it('drains an abandoned capture', () => {
    const [b] = captureTick([building({ capturingTeam: 'blue', captureProgress: 10 })], []);
    expect(b.captureProgress).toBe(6);
  });

  it('winds an enemy capture back before starting its own', () => {
    const [b] = captureTick([building({ capturingTeam: 'red', captureProgress: 50 })], [unit('g')]);
    expect(b).toMatchObject({ capturingTeam: 'red', captureProgress: 50 - push });
  });
});

describe('guardianRepair', () => {
  it('heals the worst hurt allies in range, up to its beam count', () => {
    const guardian = unit('gd', { type: 'guardian', unitClass: 'support' });
    const hurt = [10, 50, 90, 30].map((hp, i) => unit(`a${i}`, { health: hp, gridPos: { x: 6, z: 5 } }));
    const enemy = unit('e', { team: 'red', health: 5, gridPos: { x: 6, z: 5 } });
    const { assignments, heal } = guardianRepair([guardian, ...hurt, enemy], 100);
    expect(assignments.get('gd')).toEqual(['a0', 'a3', 'a1'].slice(0, ABILITY_CONFIG.GUARDIAN_REPAIR_SLOTS));
    expect(heal.get('a0')).toBeCloseTo(ABILITY_CONFIG.GUARDIAN_REPAIR_RATE / 10);
    expect(heal.has('e')).toBe(false);
  });
});

describe('ballistaLoadStep', () => {
  it('arms after BALLISTA_LOAD_TIME of game time', () => {
    let b = unit('b', { type: 'ballista', unitClass: 'support', ammoState: 'loading', loadingProgress: 0 });
    const ticks = ABILITY_CONFIG.BALLISTA_LOAD_TIME / 100;
    for (let i = 0; i < ticks - 1; i++) {
      const draft = { ...b };
      ballistaLoadStep(b, draft, 100);
      b = draft;
    }
    expect(b.ammoState).toBe('loading');
    const draft = { ...b };
    ballistaLoadStep(b, draft, 100);
    expect(draft).toMatchObject({ ammoState: 'armed', loadingProgress: 100 });
  });
});

describe('surveillanceStep', () => {
  it('sends the drone home when its time is up', () => {
    const drone = unit('d', {
      type: 'drone', unitClass: 'air',
      surveillance: { active: true, status: 'active', center: { x: 5, z: 5 }, returnPos: { x: 1, z: 1 }, startTime: 1 },
    });
    const draft = { ...drone };
    expect(surveillanceStep(draft, 1 + ABILITY_CONFIG.SURVEILLANCE_DURATION, () => ['1,1'])).toBe(false);
    expect(surveillanceStep(draft, 2 + ABILITY_CONFIG.SURVEILLANCE_DURATION, () => ['1,1'])).toBe(true);
    expect(draft).toMatchObject({ path: ['1,1'], surveillance: { status: 'returning' } });
  });
});

describe('courierStep', () => {
  it('hands its warhead over beside the Ballista, then heads home', () => {
    const ballista = unit('b', { type: 'ballista', unitClass: 'support', gridPos: { x: 6, z: 5 } });
    const courier = unit('c', { type: 'courier', unitClass: 'support', courierTargetId: 'b', courierPayload: 'he' });
    const fab = { id: 'f', type: 'ordnance_fab' as const, team: 'blue' as const, gridPos: { x: 0, z: 0 }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 1, maxHealth: 1 };
    const draft = { ...courier };
    const result = courierStep(courier, draft, [courier, ballista], [fab], () => ['0,0']);
    expect(result.delivery).toEqual({ targetId: 'b', payload: 'he' });
    expect(draft).toMatchObject({ path: ['0,0'], courierPayload: undefined });
  });
});

describe('slowTick', () => {
  const ctx: SlowTickContext = {
    findPath: () => [], findScatteredSpawn: c => c, isWalkable: () => true,
    createCrawler: (host, at, n) => unit(`c${n}`, { type: 'crawler_drone', unitClass: 'ordnance', team: host.team, gridPos: at, parentId: host.id }),
    doctrineOf: () => null, now: 100_000, random: () => 0.5,
  };

  it('counts cooldowns down and ends smoke when its time runs out (it never used to)', () => {
    const titan = unit('t', {
      type: 'tank', unitClass: 'armor', cooldowns: { titanSmoke: 1500 },
      smoke: { active: true, remainingTime: 1000 },
    });
    const [after] = slowTick([titan], ctx);
    expect(after.cooldowns.titanSmoke).toBe(500);
    expect(after.smoke).toEqual({ active: false, remainingTime: 0 });
  });

  it('wears off stuns', () => {
    const [after] = slowTick([unit('g', { isStunned: true, stunDuration: 1000 })], ctx);
    expect(after.stunDuration).toBe(0);
  });

  it('lets an anchored Swarm Host add a crawler when ready, and removes orphans', () => {
    const host = unit('h', { type: 'swarm_host', unitClass: 'ordnance', isAnchored: true });
    const orphan = unit('o', { type: 'crawler_drone', unitClass: 'ordnance', parentId: 'gone' });
    const next = slowTick([host, orphan], ctx);
    expect(next.some(u => u.id === 'o')).toBe(false);
    expect(next.filter(u => u.type === 'crawler_drone')).toHaveLength(1);
    // Set and then counted down in the same pass, as before.
    expect(next.find(u => u.id === 'h')!.cooldowns.spawnCrawler).toBe(ABILITY_CONFIG.SWARM_HOST_SPAWN_INTERVAL - 1000);
  });

  it('returns the same array when nothing happens', () => {
    const units = [unit('g')];
    expect(slowTick(units, ctx)).toBe(units);
  });
});

describe('repairTick', () => {
  const bases = { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } };
  const hurt = (id: string, x: number, z: number, patch: Partial<UnitData> = {}): UnitData => ({
    id, type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x, z }, path: [], visionRange: 3,
    health: 100, maxHealth: 700, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
  });

  it('repairs only units in their own base block; nothing heals on its own elsewhere', () => {
    const units = [hurt('home', 6, 2), hurt('pad', 7, 7), hurt('field', 20, 20), hurt('enemy-base', 74, 72), hurt('red-home', 75, 73, { team: 'red' })];
    const { heal } = repairTick(units, 1000, bases, () => null);
    expect(heal.get('home')).toBeCloseTo(700 * BASE_REPAIR.perSecond);
    expect(heal.get('pad')).toBeCloseTo(700 * BASE_REPAIR.perSecond);
    expect(heal.has('field')).toBe(false);
    expect(heal.has('enemy-base')).toBe(false);
    expect(heal.get('red-home')).toBeCloseTo(700 * BASE_REPAIR.perSecond);
  });

  it('knows the base block from the road grid', () => {
    expect(inBaseBlock({ x: 0, z: 6 }, bases.blue)).toBe(true);
    expect(inBaseBlock({ x: 8, z: 4 }, bases.blue)).toBe(false);
    expect(inBaseBlock({ x: 12, z: 12 }, bases.blue)).toBe(false);
  });

  it('Heavy Metal repairs armour half as fast again', () => {
    const { heal } = repairTick([hurt('home', 5, 5)], 1000, bases, () => 'heavy_metal');
    expect(heal.get('home')).toBeCloseTo(700 * BASE_REPAIR.perSecond * 1.5);
  });

  it('Heavy Metal armour repairs itself out of combat, but only from Tier 2', () => {
    const field = hurt('field', 30, 30, { lastAttackTime: 0, lastDamageTime: 0 });
    const hm = () => 'heavy_metal' as const;
    expect(repairTick([field], 1000, bases, hm, () => 1, 10_000).heal.has('field')).toBe(false);
    expect(repairTick([field], 1000, bases, hm, () => 2, 10_000).heal.get('field')).toBeCloseTo(BASE_REPAIR.heavyMetalSelfRepair);
    // Still in a fight: just fired or just hit.
    expect(repairTick([{ ...field, lastDamageTime: 9_000 }], 1000, bases, hm, () => 2, 10_000).heal.has('field')).toBe(false);
    expect(repairTick([{ ...field, lastAttackTime: 9_000 }], 1000, bases, hm, () => 2, 10_000).heal.has('field')).toBe(false);
    // Other doctrines, and infantry, never self-repair.
    expect(repairTick([field], 1000, bases, () => 'shadow_ops', () => 3, 10_000).heal.has('field')).toBe(false);
    expect(repairTick([{ ...field, unitClass: 'infantry', type: 'trooper' }], 1000, bases, hm, () => 3, 10_000).heal.has('field')).toBe(false);
  });
});
