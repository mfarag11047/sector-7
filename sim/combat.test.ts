import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG, UNIT_STATS } from '../constants';
import type { BuildingData, CloudData, UnitData } from '../types';
import {
  applyDamage, autoAttacks, blastDamage, bombardBuildings, bombardUnitDamage, crawlerDetonations, heCloudDamage,
  isBombardStrike, sentinelFire,
} from './combat';

const TILE = 14;
const OFFSET = 0;

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 0, z: 0 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});

const building = (patch: Partial<BuildingData> = {}): BuildingData => ({
  id: 'b', gridX: 5, gridZ: 5, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'server_node', height: 1,
  blockId: 'b', owner: null, captureProgress: 0, capturingTeam: null, health: 450, maxHealth: 450, ...patch,
});

describe('blastDamage', () => {
  const blast = { position: { x: 0, y: 0, z: 0 }, radius: 2 * TILE, damage: 100, team: 'red' as const };

  it('falls off linearly from the center and spares the blast owner', () => {
    const units = [unit('center'), unit('edge', { gridPos: { x: 1, z: 0 } }), unit('out', { gridPos: { x: 3, z: 0 } }), unit('ally', { team: 'red' })];
    const dmg = blastDamage(units, [blast], TILE, OFFSET, { hitsCloaked: false });
    expect(dmg.get('center')).toBe(100);
    expect(dmg.get('edge')).toBeCloseTo(50);
    expect(dmg.has('out')).toBe(false);
    expect(dmg.has('ally')).toBe(false);
  });

  it('only Crawler-style blasts reach a cloaked Ghost', () => {
    const cloaked = [unit('ghost', { decoyActive: true })];
    expect(blastDamage(cloaked, [blast], TILE, OFFSET, { hitsCloaked: false }).size).toBe(0);
    expect(blastDamage(cloaked, [blast], TILE, OFFSET, { hitsCloaked: true }).get('ghost')).toBe(100);
  });
});

describe('crawlerDetonations', () => {
  it('goes off when an enemy is within 1.5 tiles, not otherwise', () => {
    const crawler = unit('c', { type: 'crawler_drone', unitClass: 'ordnance', team: 'red' });
    expect(crawlerDetonations([crawler, unit('far', { gridPos: { x: 2, z: 0 } })], TILE, OFFSET)).toHaveLength(0);
    const [boom] = crawlerDetonations([crawler, unit('near', { gridPos: { x: 1, z: 1 } })], TILE, OFFSET);
    expect(boom.crawlerId).toBe('c');
    expect(boom.blast.damage).toBe(ABILITY_CONFIG.CRAWLER_EXPLOSION_DAMAGE);
  });
});

describe('sentinelFire', () => {
  const sentinel = unit('s', { type: 'defense_drone', unitClass: 'defense', team: 'neutral', gridPos: { x: 5, z: 5 } });

  it('only fires while its server node is being captured', () => {
    const intruder = unit('g', { gridPos: { x: 6, z: 5 } });
    expect(sentinelFire([sentinel, intruder], [building()]).damage.size).toBe(0);
    const fire = sentinelFire([sentinel, intruder], [building({ captureProgress: 10, capturingTeam: 'blue' })]);
    expect(fire.damage.get('g')).toBe(ABILITY_CONFIG.DEFENSE_DRONE_DAMAGE);
    expect(fire.targets.get('s')).toBe('g');
    expect(fire.retaliation.get('s')).toBe(ABILITY_CONFIG.UNIT_RETALIATION_DAMAGE);
  });

  it('ignores units out of range', () => {
    const far = unit('g', { gridPos: { x: 9, z: 5 } });
    expect(sentinelFire([sentinel, far], [building({ captureProgress: 10, capturingTeam: 'blue' })]).damage.size).toBe(0);
  });
});

describe('autoAttacks', () => {
  const tank = unit('t', { type: 'tank', unitClass: 'armor' });
  const near = unit('near', { team: 'red', gridPos: { x: 1, z: 0 } });
  const nearer = unit('nearer', { team: 'red', gridPos: { x: 0, z: 1 } });
  const noCloud = () => false;

  it('hits the nearest enemy within 2 tiles', () => {
    const far = unit('far', { team: 'red', gridPos: { x: 3, z: 0 } });
    const { damage, fired } = autoAttacks([tank, far, near], 10_000, noCloud);
    expect(damage.get('near')).toBe(UNIT_STATS.tank.attackDamage);
    expect(damage.has('far')).toBe(false);
    expect(fired.has('t')).toBe(true);
  });

  it('waits out its cooldown', () => {
    const justFired = { ...tank, lastAttackTime: 10_000 - UNIT_STATS.tank.attackCooldown + 1 };
    expect(autoAttacks([justFired, near], 10_000, noCloud).fired.has('t')).toBe(false);
  });

  it('cannot see into or out of a nano cloud', () => {
    expect(autoAttacks([tank, near], 10_000, () => true).damage.size).toBe(0);
  });

  it('ignores cloaked and dead targets', () => {
    const units = [tank, { ...near, decoyActive: true }, { ...nearer, health: 0 }];
    expect(autoAttacks(units, 10_000, noCloud).fired.has('t')).toBe(false);
  });
});

describe('Bombardment Drone strikes', () => {
  it('strike only when hovering over the target with no path left', () => {
    const drone = unit('d', { type: 'bombard', unitClass: 'air', gridPos: { x: 4, z: 4 }, bombardmentTarget: { x: 4, z: 4 } });
    expect(isBombardStrike(drone)).toBe(true);
    expect(isBombardStrike({ ...drone, path: ['5,4'] })).toBe(false);
    expect(isBombardStrike({ ...drone, bombardmentTarget: null })).toBe(false);
  });

  it('damage buildings in the square and destroy them at zero', () => {
    const inside = building({ id: 'in', gridX: 6, gridZ: 6, health: ABILITY_CONFIG.BOMBARD_BUILDING_DAMAGE });
    const outside = building({ id: 'out', gridX: 8, gridZ: 4 });
    const [hit, missed] = bombardBuildings([inside, outside], [{ x: 4, z: 4 }]);
    expect(hit).toMatchObject({ destroyed: true, health: 0, owner: null });
    expect(missed).toBe(outside);
  });

  it('hurt every unit under the strike except the drone', () => {
    const units = [unit('d', { type: 'bombard' }), unit('friend', { gridPos: { x: 2, z: 2 } }), unit('away', { gridPos: { x: 3, z: 0 } })];
    const dmg = bombardUnitDamage(units, [{ droneId: 'd', at: { x: 0, z: 0 } }]);
    expect(dmg.get('friend')).toBe(ABILITY_CONFIG.BOMBARD_UNIT_DAMAGE);
    expect(dmg.has('d')).toBe(false);
    expect(dmg.has('away')).toBe(false);
  });
});

describe('heCloudDamage', () => {
  it('burns infantry and light air units, not armor', () => {
    const cloud: CloudData = { id: 'c', type: 'he', team: 'red', gridPos: { x: 0, z: 0 }, radius: 5, duration: 1000, createdAt: 0 };
    const units = [unit('ghost'), unit('drone', { type: 'drone', unitClass: 'air' }), unit('tank', { type: 'tank', unitClass: 'armor' })];
    const dmg = heCloudDamage(units, [cloud]);
    expect(dmg.get('ghost')).toBe(ABILITY_CONFIG.HE_DAMAGE_PER_TICK);
    expect(dmg.get('drone')).toBe(ABILITY_CONFIG.HE_DAMAGE_PER_TICK);
    expect(dmg.has('tank')).toBe(false);
  });
});

describe('applyDamage', () => {
  it('sums maps, stops at zero and leaves untouched units as they were', () => {
    const a = unit('a');
    const b = unit('b');
    const [hurt, same] = applyDamage([a, b], new Map([['a', 70]]), new Map([['a', 70]]));
    expect(hurt.health).toBe(0);
    expect(same).toBe(b);
    const units = [a];
    expect(applyDamage(units, new Map())).toBe(units);
  });
});
