import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { BuildingData, CloudData, UnitData } from '../types';
import {
  applyDamage, blastDamage, bombardBuildings, bombardUnitDamage, CombatStructure, crawlerDetonations, heCloudDamage,
  resolveAttacks,
} from './combat';
import { DAMAGE_MULTIPLIER, UNIT_RULES } from './units';

const TILE = 14;
const OFFSET = 0;

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 0, z: 0 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});

const building = (patch: Partial<BuildingData> = {}): BuildingData => ({
  id: 'b', gridX: 5, gridZ: 5, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'residential', height: 1,
  blockId: 'b', owner: null, captureProgress: 0, capturingTeam: null, health: 200, maxHealth: 200, ...patch,
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

describe('resolveAttacks', () => {
  const noCloud = () => false;
  const trooper = (id: string, patch: Partial<UnitData> = {}) => unit(id, { type: 'trooper', ...patch });
  const hq = (patch: Partial<CombatStructure> = {}): CombatStructure => ({
    id: 'hq-red', type: 'hq', team: 'red', gridPos: { x: 4, z: 0 }, health: 5000, isBlueprint: false, ...patch,
  });

  it('shoots the nearest enemy in range for weapon damage times the armor multiplier', () => {
    const near = trooper('near', { team: 'red', gridPos: { x: 2, z: 0 } });
    const far = trooper('far', { team: 'red', gridPos: { x: 3, z: 0 } });
    const out = trooper('out', { team: 'red', gridPos: { x: 9, z: 0 } });
    const r = resolveAttacks([trooper('t'), far, near, out], [], 10_000, noCloud);
    expect(r.fired.get('t')).toBe('near');
    const rifle = UNIT_RULES.trooper.weapon!;
    expect(r.unitDamage.get('near')).toBe(rifle.damage * DAMAGE_MULTIPLIER.rifle.infantry);
  });

  it('waits out its cooldown but still reports what it is aiming at', () => {
    const enemy = trooper('e', { team: 'red', gridPos: { x: 1, z: 0 }, lastAttackTime: 10_000 });
    const r = resolveAttacks([trooper('t', { lastAttackTime: 9_500 }), enemy], [], 10_000, noCloud);
    expect(r.fired.has('t')).toBe(false);
    expect(r.aiming.get('t')).toBe('e');
  });

  it('only shoots aircraft with a weapon that can reach them', () => {
    const hornet = unit('h', { type: 'hornet', unitClass: 'air', team: 'red', gridPos: { x: 2, z: 0 } });
    const tank = unit('tk', { type: 'tank', unitClass: 'armor' });
    expect(resolveAttacks([tank, hornet], [], 10_000, noCloud).fired.has('tk')).toBe(false);
    expect(resolveAttacks([trooper('t'), hornet], [], 10_000, noCloud).fired.get('t')).toBe('h');
  });

  it('prefers units, then attacks buildings when no unit is in range', () => {
    const r = resolveAttacks([trooper('t', { gridPos: { x: 2, z: 0 } })], [hq()], 10_000, noCloud);
    expect(r.fired.get('t')).toBe('hq-red');
    expect(r.structureDamage.get('hq-red')).toBeCloseTo(UNIT_RULES.trooper.weapon!.damage * DAMAGE_MULTIPLIER.rifle.structure);
    const withGuard = resolveAttacks([trooper('t', { gridPos: { x: 2, z: 0 } }), trooper('g', { team: 'red', gridPos: { x: 4, z: 1 } })], [hq()], 10_000, noCloud);
    expect(withGuard.fired.get('t')).toBe('g');
  });

  it('lets the HQ fire back, but not a structure still under construction', () => {
    const attacker = trooper('t', { gridPos: { x: 2, z: 0 } });
    expect(resolveAttacks([attacker], [hq()], 10_000, noCloud).fired.get('hq-red')).toBe('t');
    expect(resolveAttacks([attacker], [hq({ buildRemainingMs: 1000 })], 10_000, noCloud).fired.has('hq-red')).toBe(false);
  });

  it('treats Sentinels as hostile to both teams', () => {
    const sentinel = unit('s', { type: 'defense_drone', unitClass: 'defense', team: 'neutral', gridPos: { x: 2, z: 0 } });
    const r = resolveAttacks([trooper('t'), sentinel], [], 10_000, noCloud);
    expect(r.fired.get('t')).toBe('s');
    expect(r.fired.get('s')).toBe('t');
  });

  it('splashes explosive shells onto neighbours, never friends or aircraft', () => {
    const tank = unit('tk', { type: 'tank', unitClass: 'armor' });
    // The red troopers have just fired, so only the tank shoots this tick.
    const target = trooper('a', { team: 'red', gridPos: { x: 3, z: 0 }, lastAttackTime: 10_000 });
    const beside = trooper('b', { team: 'red', gridPos: { x: 3, z: 1 }, lastAttackTime: 10_000 });
    const friend = trooper('f', { gridPos: { x: 4, z: 0 } });
    const r = resolveAttacks([tank, target, beside, friend], [], 10_000, noCloud);
    expect(r.unitDamage.get('b')).toBeGreaterThan(0);
    expect(r.unitDamage.get('b')!).toBeLessThan(r.unitDamage.get('a')!);
    expect(r.unitDamage.has('f')).toBe(false);
  });

  it('ignores cloaked Ghosts and anything in a nano cloud', () => {
    const cloaked = unit('g', { type: 'ghost', team: 'red', gridPos: { x: 1, z: 0 }, decoyActive: true });
    expect(resolveAttacks([trooper('t'), cloaked], [], 10_000, noCloud).fired.size).toBe(0);
    const enemy = trooper('e', { team: 'red', gridPos: { x: 1, z: 0 } });
    expect(resolveAttacks([trooper('t'), enemy], [], 10_000, () => true).fired.size).toBe(0);
  });
});

describe('Bombardment Drone strikes', () => {
  it('damage buildings in the square and destroy them at zero', () => {
    const inside = building({ id: 'in', gridX: 6, gridZ: 6, health: 1 });
    const outside = building({ id: 'out', gridX: 8, gridZ: 4 });
    const [hit, missed] = bombardBuildings([inside, outside], [{ x: 4, z: 4 }]);
    expect(hit).toMatchObject({ destroyed: true, health: 0, owner: null });
    expect(missed).toBe(outside);
  });

  it('never touch core or server nodes', () => {
    const nodes = [building({ id: 'core', type: 'core_node', gridX: 4, gridZ: 4, health: 1 }), building({ id: 'srv', type: 'server_node', gridX: 5, gridZ: 4, health: 1 })];
    expect(bombardBuildings(nodes, [{ x: 4, z: 4 }])).toEqual(nodes);
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
