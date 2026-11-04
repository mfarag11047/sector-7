import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { damageTakenMultiplier, fireRateMultiplier, HERO_ULTS, isEmpDisabled, addBuff, unitAbilityEffects } from './unitAbilities';

const unit = (id: string, team: UnitData['team'], at: { x: number; z: number }, extra: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team, gridPos: at, path: [], visionRange: 8,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...extra,
} as UnitData);
const cast = (units: UnitData[], caster: string, ability: string, upgrades: string[], target?: { x: number; z: number }) =>
  unitAbilityEffects(units, 'blue', { tier: 1, upgrades: upgrades as never }, { unitIds: [caster], ability, target }, 1000);

describe('heroes\' big abilities', () => {
  it('need their pick on the doctrine track', () => {
    const goliath = unit('g', 'blue', { x: 5, z: 5 }, { type: 'hero_heavy_metal' });
    expect(cast([goliath], 'g', 'juggernaut', []).ok).toBe(false);
    expect(cast([goliath], 'g', 'juggernaut', ['juggernaut']).ok).toBe(true);
  });

  it('Juggernaut: far less damage taken, twice the fire rate, no EMP shutdown', () => {
    const g = addBuff(unit('g', 'blue', { x: 5, z: 5 }, { type: 'hero_heavy_metal' }), 'juggernaut', 9e9);
    expect(damageTakenMultiplier(g)).toBeCloseTo(HERO_ULTS.juggernautTaken);
    expect(fireRateMultiplier(g)).toBe(2);
    expect(isEmpDisabled(addBuff(g, 'emp', 9e9))).toBe(false);
  });

  it('Thousand Cuts: every enemy on the ground about Kage is cut, twice as hard from a cloak', () => {
    const kage = unit('k', 'blue', { x: 5, z: 5 }, { type: 'hero_shadow_ops' });
    const near = unit('a', 'red', { x: 6, z: 5 }, { health: 500, maxHealth: 500 });
    const far = unit('b', 'red', { x: 9, z: 5 }, { health: 500, maxHealth: 500 });
    const drone = unit('c', 'red', { x: 5, z: 6 }, { type: 'attack_drone', unitClass: 'armor' });
    const r = cast([kage, near, far, drone], 'k', 'thousand_cuts', ['thousand_cuts']);
    if (!r.ok) throw new Error('refused');
    const hit = r.updates.get('a')!(near).health;
    expect(hit).toBeLessThan(500);
    expect(r.updates.has('b')).toBe(false);
    expect(r.updates.has('c')).toBe(false);
    const cloaked = cast([{ ...kage, fieldCloaked: true }, near], 'k', 'thousand_cuts', ['thousand_cuts']);
    if (!cloaked.ok) throw new Error('refused');
    expect(500 - cloaked.updates.get('a')!(near).health).toBeCloseTo((500 - hit) * 2);
  });

  it('Botnet: seizes several machines at once', () => {
    const cipher = unit('ci', 'blue', { x: 10, z: 10 }, { type: 'hero_netrunner' });
    const cars = [0, 1, 2, 3, 4].map(i => unit(`car${i}`, 'red', { x: 14, z: 9 + i * 0.5 }, { type: 'razorback', unitClass: 'armor' }));
    const r = cast([cipher, ...cars], 'ci', 'botnet', ['botnet'], { x: 14, z: 10 });
    if (!r.ok) throw new Error('refused');
    const seized = cars.filter(c => r.updates.get(c.id)?.(c).team === 'blue');
    expect(seized.length).toBe(HERO_ULTS.botnetMax);
  });
});
