import type { UpgradeId } from './upgrades';
import { describe, expect, it } from 'vitest';
import type { BuildingData, StructureData, UnitData } from '../types';
import { AbilityCommand, AbilityContext, abilityEffects, applyUnitEffects } from './abilities';
import { ARTILLERY, artilleryRange, fireArtillery, landShells, shellBuildingDamage, shellBuildings } from './artillery';
import { dropDamage } from './bombard';
import { resolveAttacks } from './combat';
import { createEconomy, Economy } from './economy';
import { applyOrderToUnits, orderEffects } from './orders';
import { createUnit } from './production';
import { DAMAGE_MULTIPLIER } from './units';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
const gun = (patch: Partial<UnitData> = {}) => ({ ...at(createUnit('howitzer', 'blue', 'h', { x: 0, z: 0 }), 0), ...patch });
const planted = (patch: Partial<UnitData> = {}) => gun({ isDeployed: true, anchoredAt: 0, ...patch });
const enemy = (type: UnitData['type'], x: number, id = 'e', z = 0) => at(createUnit(type, 'red', id, { x: 0, z: 0 }), x, z);
const hq = (team: 'blue' | 'red', x: number, id = `hq-${team}`): StructureData => ({
  id, type: 'hq', team, gridPos: { x, z: 0 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 3000, maxHealth: 3000,
});
// At a tier with the Thunderhead's shell upgrades of that tier researched (sim/upgrades.ts).
const withTier = (tier: 1 | 2 | 3): Economy => {
  const e = createEconomy();
  const upgrades: UpgradeId[] = tier >= 3 ? ['long_range_shells', 'guided_shells'] : tier === 2 ? ['long_range_shells'] : [];
  return { ...e, blue: { ...e.blue, tier, upgrades } };
};

let n = 0;
const ctx: AbilityContext = {
  now: 10_000, offset: 0, tileSize: 14, isWalkable: () => true,
  findPath: (_f, to) => [`${to.x},${to.z}`], findAirPath: (_f, to) => [`${to.x},${to.z}`],
  findAdjacentSpawn: c => c, createCrawler: h => h, random: () => 0.5, newId: p => `${p}-${++n}`,
};
const order = (units: UnitData[], command: AbilityCommand, tier: 1 | 2 | 3 = 1) => {
  const r = abilityEffects({ units, structures: [], economy: withTier(tier) }, 'blue', command, ctx);
  return 'reason' in r ? { refused: r.reason } : { units: applyUnitEffects([...units], r.effects) };
};
// A spotter standing next to the target so the battery may fire on sight.
const spotter = (x: number) => at(createUnit('trooper', 'blue', `spot-${x}`, { x: 0, z: 0 }), x, 2);
const fire = (units: UnitData[], now: number, structures: StructureData[] = [], tier: 1 | 2 | 3 = 1) =>
  fireArtillery(units, structures, now, () => tier, () => 0, () => `s-${++n}`);

describe('anchoring', () => {
  it('only plants while stationary, then needs time to set up', () => {
    expect(order([gun({ path: ['1,0'] })], { type: 'TOGGLE_ANCHOR', unitIds: ['h'] }).refused).toMatch(/stop/);
    const [h] = order([gun()], { type: 'TOGGLE_ANCHOR', unitIds: ['h'] }).units!;
    expect(h).toMatchObject({ isDeployed: true, anchoredAt: ctx.now });
    const targets = [h, enemy('tank', 8), spotter(8)];
    expect(fire(targets, ctx.now + ARTILLERY.setupMs - 1).shells).toHaveLength(0);
    expect(fire(targets, ctx.now + ARTILLERY.setupMs).shells).toHaveLength(1);
  });

  it('cannot fire while mobile', () => {
    expect(fire([gun(), enemy('tank', 8), spotter(8)], 99_999).shells).toHaveLength(0);
  });

  it('packs up when ordered to move, dropping its fire mission', () => {
    const h = planted({ artilleryTarget: { x: 10, z: 0 } });
    const r = orderEffects({ units: [h], structures: [], buildings: [], economy: createEconomy() }, 'blue',
      { type: 'MOVE', unitIds: ['h'], target: { x: 5, z: 5 } },
      { gridSize: 79, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, isWalkable: () => true, findPath: (_f, to) => [`${to.x},${to.z}`], findAirPath: (_f, to) => [`${to.x},${to.z}`], canBuildOn: () => true, newId: p => p });
    if ('reason' in r) throw new Error(r.reason);
    const [moved] = applyOrderToUnits([h], r.effects);
    expect(moved).toMatchObject({ isDeployed: false, artilleryTarget: null, path: ['5,5'] });
  });

  it('never fires through the ordinary weapons pass', () => {
    expect(resolveAttacks([planted(), enemy('trooper', 2)], [], 99_999, () => false).fired.has('h')).toBe(false);
  });
});

describe('fire missions', () => {
  it('needs the battery anchored, and the target between the dead zone and its range', () => {
    expect(order([gun()], { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 8, z: 0 } }).refused).toMatch(/anchor/);
    expect(order([planted()], { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 2, z: 0 } }).refused).toMatch(/close/);
    expect(order([planted()], { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 14, z: 0 } }).refused).toMatch(/12 tiles/);
    const [h] = order([planted()], { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 10, z: 0 } }).units!;
    expect(h.artilleryTarget).toEqual({ x: 10, z: 0 });
    // No target ceases fire.
    expect(order([h], { type: 'ARTILLERY_FIRE', unitIds: ['h'] }).units![0].artilleryTarget).toBeNull();
  });

  it('reaches further with the shell upgrades', () => {
    expect([1, 2, 3].map(t => artilleryRange(t as 1 | 2 | 3))).toEqual([12, 16, 20]);
    // Tier 3 alone doesn't do it: the shells have to be researched.
    const unresearched = abilityEffects({ units: [planted()], structures: [], economy: { ...createEconomy(), blue: { ...createEconomy().blue, tier: 3 } } }, 'blue', { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 14, z: 0 } }, ctx);
    expect('reason' in unresearched).toBe(true);
    expect(order([planted()], { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 19, z: 0 } }, 2).refused).toBeTruthy();
    expect(order([planted()], { type: 'ARTILLERY_FIRE', unitIds: ['h'], target: { x: 19, z: 0 } }, 3).refused).toBeUndefined();
  });

  it('shells the ordered tile blind, ahead of anything it could see', () => {
    const { shells } = fire([planted({ artilleryTarget: { x: 11, z: 0 } }), enemy('tank', 6), spotter(6)], 99_999);
    expect(shells[0].at).toMatchObject({ x: 11 });
  });

  it('with no orders, fires only at ground enemies its side can see', () => {
    expect(fire([planted(), enemy('tank', 8)], 99_999).shells).toHaveLength(0);
    expect(fire([planted(), enemy('hornet', 8), spotter(8)], 99_999).shells).toHaveLength(0);
    expect(fire([planted(), enemy('tank', 8), spotter(8)], 99_999).shells).toHaveLength(1);
    // Its own HQ spots for it, and enemy structures in range are fair game.
    expect(fire([planted()], 99_999, [hq('red', 9), hq('blue', 20)]).shells).toHaveLength(0);
    expect(fire([planted()], 99_999, [hq('red', 9), hq('blue', 6)]).shells).toHaveLength(1);
  });

  it('firing on sight, goes for the nearest armed enemy before unarmed ones and structures', () => {
    const units = [planted(), enemy('scout_car', 6, 'car'), enemy('razorback', 9, 'raider'), spotter(6), spotter(9)];
    expect(fire(units, 99_999, [hq('red', 5)]).fired.get('h')).toEqual({ x: 9, z: 0 });
    // With no armed enemy in view, the unarmed one; with no units at all, the structure.
    expect(fire(units.filter(u => u.id !== 'raider'), 99_999, [hq('red', 5)]).fired.get('h')).toEqual({ x: 6, z: 0 });
    expect(fire([planted(), spotter(6)], 99_999, [hq('red', 5)]).fired.get('h')).toEqual({ x: 5, z: 0 });
  });

  it('fires on what it sees itself, and a fire mission takes priority', () => {
    const self = planted();
    const close = Math.min(self.visionRange, artilleryRange(1));
    expect(fire([self, enemy('tank', close)], 99_999).fired.get('h')).toEqual({ x: close, z: 0 });
    expect(fire([planted({ artilleryTarget: { x: 10, z: 3 } }), enemy('tank', close), spotter(8)], 99_999).fired.get('h')).toEqual({ x: 10, z: 3 });
  });

  it('reloads between shots', () => {
    const h = planted({ artilleryTarget: { x: 10, z: 0 }, lastAttackTime: 50_000 });
    expect(fire([h], 50_000 + ARTILLERY.cooldownMs - 1).shells).toHaveLength(0);
    expect(fire([h], 50_000 + ARTILLERY.cooldownMs).shells).toHaveLength(1);
  });
});

describe('shells landing', () => {
  it('land after their flight and hurt enemy ground units and structures in the splash only', () => {
    const { shells } = fire([planted({ artilleryTarget: { x: 10, z: 0 } })], 99_999);
    const s = shells[0];
    expect(s.landsAt).toBeGreaterThan(99_999);
    const units = [planted(), enemy('trooper', 10, 'hit'), enemy('trooper', 13, 'far'), enemy('hornet', 10, 'air'), at(createUnit('trooper', 'blue', 'friend', { x: 0, z: 0 }), 10)];
    expect(landShells(shells, s.landsAt - 1, units, []).landed).toHaveLength(0);
    const r = landShells(shells, s.landsAt, units, [hq('red', 11)]);
    expect(r.flying).toHaveLength(0);
    expect(r.unitDamage.get('hit')).toBeCloseTo(ARTILLERY.damage * DAMAGE_MULTIPLIER.explosive.infantry);
    expect([...r.unitDamage.keys()]).toEqual(['hit']);
    expect(r.structureDamage.get('hq-red')).toBeGreaterThan(0);
  });
});

describe('shells and city buildings', () => {
  const building = (x: number, patch: Partial<BuildingData> = {}): BuildingData => ({
    id: `b-${x}`, gridX: x, gridZ: 0, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'residential', height: 1,
    blockId: 'blk', owner: null, captureProgress: 0, capturingTeam: null, health: 400, maxHealth: 400, ...patch,
  });
  const shot = (x: number) => ({ team: 'blue' as const, at: { x, z: 0 } });

  it('damage buildings in the splash, less than a Bombardment Drone drop', () => {
    const [hit, missed] = shellBuildings([building(10), building(13)], [shot(10)]);
    expect(hit.health).toBe(400 - shellBuildingDamage(hit));
    expect(shellBuildingDamage(hit)).toBeLessThan(dropDamage(hit));
    expect(missed.health).toBe(400);
  });

  it('bring a building down after enough hits, and spare the side\'s own', () => {
    let b = [building(10), building(11, { owner: 'blue' })];
    for (let i = 0; i < Math.ceil(400 / shellBuildingDamage(b[0])); i++) b = shellBuildings(b, [shot(10)]);
    expect(b[0]).toMatchObject({ destroyed: true, owner: null, health: 0 });
    expect(b[1].health).toBe(400);
  });
});
