import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { CIWS, ciwsTick } from './ciws';
import { resolveAttacks } from './combat';
import { speedMultiplier } from './movement';
import { createUnit } from './production';
import { EMP_ROCKET, EmpRocket, empRocketImpact, empRocketTick, topAttackHeight } from './empRocket';
import { abilitiesFor, empVictims, HELLFIRE_DAMAGE, pruneBuffs, spendOvercharge, STIM_HEALTH_COST, unitAbilityEffects, UNIT_ABILITIES } from './unitAbilities';
import { shotDamage, UNIT_RULES } from './units';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
const apply = (units: UnitData[], updates: Map<string, (u: UnitData) => UnitData>) => units.map(u => updates.get(u.id)?.(u) ?? u);
const use = (units: UnitData[], tier: 1 | 2 | 3, command: { unitIds: string[]; ability: string; target?: { x: number; z: number } }, now = 1000) => {
  const r = unitAbilityEffects(units, 'blue', tier, command, now);
  return 'reason' in r ? { refused: r.reason } : { units: apply(units, r.updates), strike: r.strike };
};

// Flies rockets in 100 ms steps until the first one goes off.
const flyRockets = (rockets: EmpRocket[], units: UnitData[], from: number) => {
  let now = from;
  for (let i = 0; i < 100; i++) {
    now += 100;
    const step = empRocketTick(rockets, units, now, 100);
    if (step.detonated.length > 0) return { landed: true, at: step.detonated[0].at, now };
    rockets = step.flying;
  }
  return { landed: false, at: { x: NaN, z: NaN }, now };
};

describe('the ability roster', () => {
  it('gives each new unit two abilities: one at its own tier and a stronger one at the next', () => {
    for (const type of ['trooper', 'lancer', 'razorback', 'aegis', 'hornet'] as const) {
      const defs = abilitiesFor(type);
      expect(defs, type).toHaveLength(2);
      expect(defs[0].tier, type).toBe(UNIT_RULES[type].tier);
      expect(defs[1].tier, type).toBe(UNIT_RULES[type].tier + 1);
    }
    expect(new Set(UNIT_ABILITIES.map(a => a.id)).size).toBe(UNIT_ABILITIES.length);
  });
});

describe('using an ability', () => {
  const trooper = createUnit('trooper', 'blue', 't', { x: 0, z: 0 });

  it('needs the tier researched', () => {
    expect(use([trooper], 1, { unitIds: ['t'], ability: 'nanoweave' }).refused).toMatch(/Tier 2/);
    expect(use([trooper], 2, { unitIds: ['t'], ability: 'nanoweave' }).refused).toBeUndefined();
  });

  it("refuses the other team's units and the wrong unit type", () => {
    const red = createUnit('trooper', 'red', 'r', { x: 0, z: 0 });
    expect(use([red], 3, { unitIds: ['r'], ability: 'stim' }).refused).toBeTruthy();
    expect(use([trooper], 3, { unitIds: ['t'], ability: 'nitro' }).refused).toBeTruthy();
  });

  it('starts a cooldown', () => {
    const after = use([trooper], 1, { unitIds: ['t'], ability: 'stim' }).units!;
    expect(use(after, 1, { unitIds: ['t'], ability: 'stim' }, 2000).refused).toMatch(/recharging/);
    expect(use(after, 1, { unitIds: ['t'], ability: 'stim' }, 1000 + 30_000).refused).toBeUndefined();
  });

  it('Stim costs health and lapses when its time is up', () => {
    const [stimmed] = use([trooper], 1, { unitIds: ['t'], ability: 'stim' }).units!;
    expect(stimmed.health).toBe(trooper.health - STIM_HEALTH_COST);
    expect(stimmed.buffs?.map(b => b.kind)).toEqual(['stim']);
    expect(pruneBuffs(stimmed, 1000 + 5_999).buffs).toHaveLength(1);
    expect(pruneBuffs(stimmed, 1000 + 6_000).buffs).toHaveLength(0);
  });
});

describe('effects in combat and movement', () => {
  const enemy = (type: UnitData['type'], x: number, id = 'e') => at(createUnit(type, 'red', id, { x: 0, z: 0 }), x);
  const fire = (units: UnitData[], now: number) => resolveAttacks(units, [], now, () => false);

  it('Stim and Overclock fire faster', () => {
    const t = { ...at(createUnit('trooper', 'blue', 't', { x: 0, z: 0 }), 0), lastAttackTime: 1000 };
    const target = enemy('trooper', 2);
    const cooldown = UNIT_RULES.trooper.weapon!.cooldownMs;
    expect(fire([t, target], 1000 + cooldown * 0.7).fired.has('t')).toBe(false);
    const stimmed = { ...t, buffs: [{ kind: 'stim' as const, until: 99_999 }] };
    expect(fire([stimmed, target], 1000 + cooldown * 0.7).fired.has('t')).toBe(true);
  });

  it('Nano-Weave halves damage taken; Overcharge multiplies damage and is spent by firing', () => {
    const lancer = at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0);
    const tank = enemy('tank', 3, 'tank');
    const plain = fire([lancer, tank], 10_000).unitDamage.get('tank')!;
    const charged = fire([{ ...lancer, buffs: [{ kind: 'overcharge', until: 99_999 }] }, tank], 10_000).unitDamage.get('tank')!;
    expect(charged).toBeCloseTo(plain * 2.5);
    expect(spendOvercharge({ buffs: [{ kind: 'overcharge' as const, until: 1 }] }).buffs).toEqual([]);
    const woven = fire([lancer, { ...tank, buffs: [{ kind: 'nanoweave', until: 99_999 }] }], 10_000).unitDamage.get('tank')!;
    expect(woven).toBeCloseTo(plain / 2);
  });

  it('EMP rocket: fired at a location, it flies there and shuts down vehicles and aircraft in the blast, not infantry', () => {
    const lancer = at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0);
    const units = [lancer, enemy('razorback', 5, 'rb'), enemy('hornet', 5, 'h'), enemy('trooper', 5, 'tr'), enemy('tank', 9, 'far')];
    const r = unitAbilityEffects(units, 'blue', 3, { unitIds: ['l'], ability: 'emp_rocket', target: { x: 5, z: 0 } }, 1000);
    if ('reason' in r) throw new Error(r.reason);
    // Nothing happens until the rocket arrives.
    expect(r.rockets).toHaveLength(1);
    expect(r.rockets![0]).toMatchObject({ aim: { x: 5, z: 0 }, targetUnitId: null });
    expect(apply(units, r.updates).some(u => u.buffs?.some(b => b.kind === 'emp'))).toBe(false);
    const { landed, at: boom, now } = flyRockets(r.rockets!, units, 1000);
    expect(boom).toEqual({ x: 5, z: 0 });
    const hit = apply(units, empRocketImpact(units, boom, 'blue', now));
    const hitBy = (id: string) => hit.find(u => u.id === id)!.buffs?.some(b => b.kind === 'emp') ?? false;
    expect(landed).toBe(true);
    expect([hitBy('rb'), hitBy('h'), hitBy('tr'), hitBy('far')]).toEqual([true, true, false, false]);
    // A disabled Razorback can't move or shoot.
    const rb = { ...hit.find(u => u.id === 'rb')!, path: ['4,0'] };
    expect(speedMultiplier(rb, () => 'street')).toBe(0);
    expect(fire([rb, at(createUnit('trooper', 'blue', 'b', { x: 0, z: 0 }), 4)], now + 50).fired.has('rb')).toBe(false);
  });

  it('EMP rocket drains half a full battery from each victim', () => {
    const units = [at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0), { ...enemy('tank', 3, 'a'), battery: 80 }, { ...enemy('tank', 3, 'b'), battery: 30 }];
    const hit = apply(units, empRocketImpact(units, { x: 3, z: 0 }, 'blue', 1000));
    expect(hit.find(u => u.id === 'a')!.battery).toBe(80 - 50);
    expect(hit.find(u => u.id === 'b')!.battery).toBe(0);
    expect(hit.find(u => u.id === 'l')!.battery).toBe(100);
  });

  it('EMP rocket locked on tracks its target until it hits', () => {
    const lancer = at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0);
    let units = [lancer, enemy('razorback', 4, 'rb')];
    const r = unitAbilityEffects(units, 'blue', 3, { unitIds: ['l'], ability: 'emp_rocket', targetUnitId: 'rb' }, 1000);
    if ('reason' in r) throw new Error(r.reason);
    expect(r.rockets![0].targetUnitId).toBe('rb');
    // The Razorback runs; the rocket follows it.
    let rockets = r.rockets!;
    let now = 1000;
    let boom: { x: number; z: number } | null = null;
    for (let i = 0; i < 40 && !boom; i++) {
      now += 100;
      units = units.map(u => u.id === 'rb' ? { ...u, gridPos: { x: 4, z: Math.min(5, Math.floor(i / 2)) } } : u);
      const step = empRocketTick(rockets, units, now, 100);
      rockets = step.flying;
      if (step.detonated.length > 0) boom = step.detonated[0].at;
    }
    expect(boom).toEqual({ x: 4, z: units[1].gridPos.z });
    expect(units[1].gridPos.z).toBeGreaterThan(0);
  });

  it('EMP rocket can only lock on to an enemy vehicle or aircraft that is in sight and in range', () => {
    const lancer = at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0);
    const units = [lancer, enemy('trooper', 3, 'tr'), enemy('tank', 12, 'seen'), enemy('tank', 20, 'far'), at(createUnit('tank', 'blue', 'own', { x: 0, z: 0 }), 2)];
    const lock = (id: string, canSee?: (u: UnitData) => boolean) => {
      const r = unitAbilityEffects(units, 'blue', 3, { unitIds: ['l'], ability: 'emp_rocket', targetUnitId: id }, 1000, canSee);
      return 'reason' in r ? r.reason : 'ok';
    };
    expect(lock('tr')).toMatch(/vehicle or aircraft/);
    expect(lock('own')).toMatch(/vehicle or aircraft/);
    expect(lock('far')).toMatch(/line of sight|out of range/);
    expect(lock('seen', () => false)).toMatch(/line of sight/);
    expect(lock('seen', () => true)).toBe('ok');
    expect(lock('far', () => true)).toMatch(/out of range/);
  });

  it('EMP rocket reaches 14 tiles in both modes', () => {
    const lancer = at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0);
    const units = [lancer, enemy('tank', 14, 'edge'), enemy('tank', 15, 'beyond')];
    const fire = (cmd: { target?: { x: number; z: number }; targetUnitId?: string }) => {
      const r = unitAbilityEffects(units, 'blue', 3, { unitIds: ['l'], ability: 'emp_rocket', ...cmd }, 1000, () => true);
      return 'reason' in r ? r.reason : 'ok';
    };
    expect(fire({ target: { x: 14, z: 0 } })).toBe('ok');
    expect(fire({ target: { x: 15, z: 0 } })).toMatch(/out of range/);
    expect(fire({ targetUnitId: 'edge' })).toBe('ok');
    expect(fire({ targetUnitId: 'beyond' })).toMatch(/out of range/);
  });

  it('EMP rocket flies a top-attack arc: up steeply, high cruise, down onto the target', () => {
    const h = (p: number) => topAttackHeight(p, 40, 2.5, 1.5);
    expect(h(0)).toBeCloseTo(2.5);
    expect(h(0.15)).toBeGreaterThan(25);
    expect(h(0.5)).toBe(40);
    expect(h(0.9)).toBeLessThan(h(0.7));
    expect(h(1)).toBeCloseTo(1.5);
  });

  it('EMP rocket burns out and goes off where it is if it cannot catch its target', () => {
    const rocket = { id: 'r', team: 'blue' as const, attackerId: 'l', from: { x: 0, z: 0 }, at: { x: 0, z: 0 }, aim: { x: 100, z: 0 }, targetUnitId: null, firedAt: 0 };
    const { landed, at: boom } = flyRockets([rocket], [], 0);
    expect(landed).toBe(true);
    expect(boom.x).toBeCloseTo(EMP_ROCKET.speed * EMP_ROCKET.maxFlightMs / 1000, 0);
  });

  it('Hellfire hits ground units in the area, and needs to be in range', () => {
    const hornet = at(createUnit('hornet', 'blue', 'h', { x: 0, z: 0 }), 0);
    const units = [hornet, enemy('tank', 5, 'tank'), enemy('wasp', 5, 'air')];
    expect(use(units, 3, { unitIds: ['h'], ability: 'hellfire', target: { x: 12, z: 0 } }).refused).toMatch(/range/);
    const r = use(units, 3, { unitIds: ['h'], ability: 'hellfire', target: { x: 5, z: 0 } });
    const tank = r.units!.find(u => u.id === 'tank')!;
    const expected = shotDamage({ damage: HELLFIRE_DAMAGE, cooldownMs: 0, range: 0, type: 'ap', hitsGround: true, hitsAir: false }, 'heavy');
    expect(units[1].health - tank.health).toBeCloseTo(expected);
    expect(r.units!.find(u => u.id === 'air')!.health).toBe(units[2].health);
  });

  it('Radar extends weapon range; speed buffs speed units up', () => {
    const aegis = at(createUnit('aegis', 'blue', 'a', { x: 0, z: 0 }), 0);
    const wasp = enemy('wasp', CIWS.range + 1.5, 'w');
    const cannon = (units: UnitData[]) => ciwsTick(units, [], 10_000, 100).links.some(l => l.gunId === 'a');
    expect(cannon([aegis, wasp])).toBe(false);
    expect(cannon([{ ...aegis, buffs: [{ kind: 'radar', until: 99_999 }] }, wasp])).toBe(true);
    const rb = { ...createUnit('razorback', 'blue', 'r', { x: 0, z: 0 }), path: ['1,0'] };
    expect(speedMultiplier({ ...rb, buffs: [{ kind: 'nitro', until: 9 }] }, () => 'street')).toBeCloseTo(speedMultiplier(rb, () => 'street') * 1.8);
  });
});

describe('empVictims', () => {
  it("takes out the other side's vehicles and aircraft in the blast, not infantry or friends", () => {
    const blue = (type: UnitData['type'], id: string, x: number) => at(createUnit(type, 'blue', id, { x: 0, z: 0 }), x);
    const red = (type: UnitData['type'], id: string, x: number) => at(createUnit(type, 'red', id, { x: 0, z: 0 }), x);
    const units = [red('tank', 'tank', 2), red('hornet', 'air', 3), red('trooper', 'inf', 2), red('razorback', 'far', 9), blue('tank', 'mine', 2)];
    expect(empVictims(units, { x: 2, z: 0 }, 3, 'blue').map(u => u.id)).toEqual(['tank', 'air']);
  });
});
