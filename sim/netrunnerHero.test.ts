import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { OVERRIDE, overridable, releaseOverrides, UPLINK } from './netrunnerHero';
import { unitAbilityEffects } from './unitAbilities';
import { freshSentinelNet, SENTINEL_NET, sentinelNetTick } from './sentinelNet';

const unit = (id: string, team: UnitData['team'], at: { x: number; z: number }, extra: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team, gridPos: at, path: [], visionRange: 8,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...extra,
} as UnitData);
const cipher = (at = { x: 10, z: 10 }) => unit('cipher', 'blue', at, { type: 'hero_netrunner', unitClass: 'support', health: 800, maxHealth: 800 });
const research = { tier: 3 as const, upgrades: [] };
const cast = (units: UnitData[], target: { x: number; z: number }, now = 1000) =>
  unitAbilityEffects(units, 'blue', research, { unitIds: ['cipher'], ability: 'override', target }, now);

describe('Override', () => {
  it('seizes the nearest enemy light vehicle or aircraft at the spot, for a while, then gives it back', () => {
    const car = unit('car', 'red', { x: 14, z: 10 }, { type: 'razorback', unitClass: 'armor', path: ['15,10'] });
    const r = cast([cipher(), car], { x: 14, z: 11 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const seized = r.updates.get('car')!(car);
    expect(seized).toMatchObject({ team: 'blue', overriddenBy: { team: 'red', until: 1000 + OVERRIDE.durationMs }, path: [] });
    expect(r.updates.get('cipher')!(cipher()).abilityReadyAt?.override).toBeGreaterThan(1000);
    expect(releaseOverrides([seized], 1000 + OVERRIDE.durationMs - 1)[0].team).toBe('blue');
    const back = releaseOverrides([seized], 1000 + OVERRIDE.durationMs)[0];
    expect(back.team).toBe('red');
    expect(back.overriddenBy).toBeUndefined();
  });

  it('takes no infantry, heavy armour or heroes, nor anything out of range', () => {
    expect(overridable(unit('t', 'red', { x: 0, z: 0 }), 'blue')).toBe(false);
    expect(overridable(unit('tank', 'red', { x: 0, z: 0 }, { type: 'tank' }), 'blue')).toBe(false);
    expect(overridable(unit('k', 'red', { x: 0, z: 0 }, { type: 'hero_shadow_ops' }), 'blue')).toBe(false);
    expect(overridable(unit('d', 'red', { x: 0, z: 0 }, { type: 'attack_drone' }), 'blue')).toBe(true);
    expect(cast([cipher(), unit('t', 'red', { x: 12, z: 10 })], { x: 12, z: 10 }).ok).toBe(false);
    const far = unit('car', 'red', { x: 30, z: 10 }, { type: 'razorback' });
    expect(cast([cipher(), far], { x: 30, z: 10 }).ok).toBe(false);
  });
});

describe('Uplink', () => {
  it('hacks a neutral Sentinel from further off, and faster', () => {
    const guard = unit('g', 'neutral', { x: 20, z: 20 }, { type: 'defense_drone', unitClass: 'defense', health: 300, maxHealth: 300, sentinelPost: 's' });
    const hero = cipher({ x: 20 + UPLINK.range - 0.5, z: 20 });
    let units: UnitData[] = [guard, hero];
    let net = freshSentinelNet();
    let ms = 0;
    for (; ms < SENTINEL_NET.hackMs; ms += 100) {
      const r = sentinelNetTick(net, units, [], () => 'netrunner', () => true, ms, 100, () => 'x');
      units = r.units; net = r.net;
      if (units[0].team === 'blue') break;
    }
    expect(units[0].team).toBe('blue');
    expect(ms).toBeLessThanOrEqual(SENTINEL_NET.hackMs / UPLINK.rate + 100);
  });
});

describe('the computer with Cipher', () => {
  it('casts Override on the most valuable enemy machine in reach', async () => {
    const { unitAbilityMoves, AI_PROFILES } = await import('./ai');
    const { createEconomy } = await import('./economy');
    const hero = cipher();
    const car = unit('car', 'red', { x: 13, z: 10 }, { type: 'razorback', unitClass: 'armor' });
    const scout = unit('sc', 'red', { x: 12, z: 11 }, { type: 'scout_car', unitClass: 'support' });
    const trooper = unit('t', 'red', { x: 11, z: 10 });
    const actions = unitAbilityMoves([hero], [car, scout, trooper], createEconomy().blue, 'attack', 1000, AI_PROFILES.hard, () => 0);
    expect(actions).toContainEqual({ kind: 'ability', command: { type: 'UNIT_ABILITY', unitIds: ['cipher'], ability: 'override', target: { x: 13, z: 10 } } });
  });
});
