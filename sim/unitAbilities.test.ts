import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { resolveAttacks } from './combat';
import { speedMultiplier } from './movement';
import { createUnit } from './production';
import { abilitiesFor, HELLFIRE_DAMAGE, pruneBuffs, spendOvercharge, STIM_HEALTH_COST, unitAbilityEffects, UNIT_ABILITIES } from './unitAbilities';
import { shotDamage, UNIT_RULES } from './units';

const at = (u: UnitData, x: number, z = 0): UnitData => ({ ...u, gridPos: { x, z } });
const apply = (units: UnitData[], updates: Map<string, (u: UnitData) => UnitData>) => units.map(u => updates.get(u.id)?.(u) ?? u);
const use = (units: UnitData[], tier: 1 | 2 | 3, command: { unitIds: string[]; ability: string; target?: { x: number; z: number } }, now = 1000) => {
  const r = unitAbilityEffects(units, 'blue', tier, command, now);
  return 'reason' in r ? { refused: r.reason } : { units: apply(units, r.updates), strike: r.strike };
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

  it('EMP shuts down vehicles and aircraft in the blast, not infantry', () => {
    const lancer = at(createUnit('lancer', 'blue', 'l', { x: 0, z: 0 }), 0);
    const units = [lancer, enemy('razorback', 5, 'rb'), enemy('hornet', 5, 'h'), enemy('trooper', 5, 'tr'), enemy('tank', 9, 'far')];
    const r = use(units, 3, { unitIds: ['l'], ability: 'emp_rocket', target: { x: 5, z: 0 } });
    const hitBy = (id: string) => r.units!.find(u => u.id === id)!.buffs?.some(b => b.kind === 'emp') ?? false;
    expect([hitBy('rb'), hitBy('h'), hitBy('tr'), hitBy('far')]).toEqual([true, true, false, false]);
    expect(r.strike).toMatchObject({ kind: 'emp', at: { x: 5, z: 0 } });
    // A disabled Razorback can't move or shoot.
    const rb = { ...r.units!.find(u => u.id === 'rb')!, path: ['4,0'] };
    expect(speedMultiplier(rb, () => 'street')).toBe(0);
    expect(fire([rb, at(createUnit('trooper', 'blue', 'b', { x: 0, z: 0 }), 4)], 50_000).fired.has('rb')).toBe(false);
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
    const wasp = enemy('wasp', UNIT_RULES.aegis.weapon!.range + 1.5, 'w');
    expect(fire([aegis, wasp], 10_000).fired.has('a')).toBe(false);
    expect(fire([{ ...aegis, buffs: [{ kind: 'radar', until: 99_999 }] }, wasp], 10_000).fired.has('a')).toBe(true);
    const rb = { ...createUnit('razorback', 'blue', 'r', { x: 0, z: 0 }), path: ['1,0'] };
    expect(speedMultiplier({ ...rb, buffs: [{ kind: 'nitro', until: 9 }] }, () => 'street')).toBeCloseTo(speedMultiplier(rb, () => 'street') * 1.8);
  });
});
