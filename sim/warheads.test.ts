import { describe, expect, it } from 'vitest';
import type { CloudData, Projectile, UnitData } from '../types';
import { preferredWarhead, specialistAbilities, type AbilityContext2 } from './aiSpecialists';
import { blastDamage } from './combat';
import { createEconomy, warheadCost } from './economy';
import { createUnit } from './production';
import { advanceFlight } from './projectiles';
import { addBuff } from './unitAbilities';
import { canisterSpots, HE, WP, wpGasDamage } from './warheads';

const NOW = 100_000;
const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x: number, z = 0, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, team, id, { x, z }), ...patch });
const wpCloud = (patch: Partial<CloudData> = {}): CloudData =>
  ({ id: 'wp-1', type: 'wp', team: 'blue', gridPos: { x: 0, z: 0 }, radius: WP.radius, duration: WP.durationMs, createdAt: NOW, ...patch });

const missile = (payload: Projectile['payload']): Projectile => ({
  id: 'm', ownerId: 'bal', team: 'blue', position: { x: 0, y: 80, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
  speed: 1, damage: 0, maxDistance: 10, distanceTraveled: 0, trajectory: 'ballistic', payload,
  startPos: { x: 0, y: 0, z: 0 }, targetPos: { x: 10, y: 0, z: 10 }, startTime: 1,
} as unknown as Projectile);
const land = (p: Projectile) => advanceFlight(p, 0.016, NOW, 0, 1, 80, [], [], [], [])!;

describe('Ballista HE missile: anti-armour', () => {
  it('hits tanks far harder than infantry or aircraft at the same distance', () => {
    const units = [unit('tank', 'tank', 'red', 1), unit('trooper', 'trooper', 'red', 1), unit('wasp', 'wasp', 'red', 1), unit('razor', 'razorback', 'red', 1)];
    const blast = { position: { x: 0, y: 0, z: 0 }, radius: HE.radius, damage: HE.damage, team: 'blue' as const, vs: HE.vs };
    const damage = blastDamage(units, [blast], 1, 0, { hitsCloaked: false });
    const plain = HE.damage * (1 - 1 / HE.radius);
    expect(damage.get('tank')).toBeCloseTo(plain * HE.vs.heavy);
    expect(damage.get('trooper')).toBeCloseTo(plain * HE.vs.infantry);
    expect(damage.get('tank')!).toBeGreaterThan(damage.get('razor')!);
    expect(damage.get('razor')!).toBeGreaterThan(damage.get('trooper')!);
    expect(damage.get('wasp')).toBeCloseTo(plain * HE.vs.air);
  });

  it('carries the armour table on its impact; other blasts stay flat', () => {
    const events = land(missile('he'));
    expect(events.find(e => e.kind === 'damage')).toMatchObject({ damage: HE.damage, vs: HE.vs });
    expect(blastDamage([unit('t', 'trooper', 'red', 0)], [{ position: { x: 0, y: 0, z: 0 }, radius: 2, damage: 50, team: 'blue' }], 1, 0, { hitsCloaked: false }).get('t')).toBe(50);
  });
});

describe('Ballista White Phosphorus missile', () => {
  it('bursts over the target and lays a gas cloud, with no blast of its own', () => {
    const events = land(missile('wp'));
    expect(events.find(e => e.kind === 'explosion')).toMatchObject({ style: 'airburst', position: { x: 10, y: WP.burstHeight, z: 10 } });
    expect(events.find(e => e.kind === 'cloud')).toMatchObject({ cloudType: 'wp', team: 'blue' });
    expect(events.some(e => e.kind === 'damage')).toBe(false);
  });

  it('scatters its canisters the same way every time, across the area', () => {
    const spots = canisterSpots('wp-1');
    expect(spots).toHaveLength(WP.canisters);
    expect(canisterSpots('wp-1')).toEqual(spots);
    expect(spots.every(s => Math.hypot(s.x, s.z) <= WP.radius)).toBe(true);
    expect(Math.max(...spots.map(s => Math.hypot(s.x, s.z)))).toBeGreaterThan(WP.radius * 0.5);
  });

  it('burns enemy infantry in the gas every tick, once the canisters are down, until it clears', () => {
    const units = [
      unit('in', 'trooper', 'red', 3), unit('lancer', 'lancer', 'red', 0, 5), unit('out', 'trooper', 'red', 7),
      unit('tank', 'tank', 'red', 1), unit('wasp', 'wasp', 'red', 1), unit('own', 'trooper', 'blue', 1),
    ];
    const tick = 100;
    const at = (t: number) => wpGasDamage(units, [wpCloud()], NOW + t, tick);
    expect(at(WP.fallMs - 1).size).toBe(0);
    const damage = at(WP.fallMs);
    expect(damage.get('in')).toBeCloseTo(WP.dps * tick / 1000);
    expect(damage.has('lancer')).toBe(true);
    expect([...damage.keys()].sort()).toEqual(['in', 'lancer']);
    expect(at(WP.durationMs).size).toBe(0);
    // A trooper with Nano-Weave up takes less.
    const woven = [addBuff(unit('w', 'trooper', 'red', 0), 'nanoweave', NOW + 60_000)];
    expect(wpGasDamage(woven, [wpCloud()], NOW + WP.fallMs, tick).get('w')!).toBeLessThan(WP.dps * tick / 1000);
  });

  it('kills a squad that stays in it over the gas cloud\'s life', () => {
    expect(WP.dps * (WP.durationMs - WP.fallMs) / 1000).toBeGreaterThan(createUnit('trooper', 'red', 't', { x: 0, z: 0 }).maxHealth);
    expect(warheadCost('wp')).toBeGreaterThan(0);
  });
});

describe('computer opponent: Ballista warheads', () => {
  const ctx = (patch: Partial<AbilityContext2>) => specialistAbilities({
    team: 'red', tier: 3, mode: 'attack', objective: { x: 30, z: 30 }, home: { x: 74, z: 74 }, mine: [], theirs: [],
    structures: [], economy: createEconomy(), attention: 1, random: () => 0, ...patch,
  });
  const infantry = [0, 1, 2, 3, 4].map(i => unit(`i${i}`, 'trooper', 'blue', 30 + i, 30));
  const tanks = [0, 1, 2].map(i => unit(`t${i}`, 'tank', 'blue', 50 + i, 30));

  it('picks White Phosphorus against infantry, HE against armour, EMP against an air wing', () => {
    expect(preferredWarhead(infantry)).toBe('wp');
    expect(preferredWarhead([...tanks, unit('i', 'trooper', 'blue', 0)])).toBe('he');
    expect(preferredWarhead([0, 1, 2].map(i => unit(`w${i}`, 'wasp', 'blue', i)))).toBe('emp');
  });

  it('loads the warhead that suits the enemy and fires it where it counts', () => {
    const ballista = unit('bal', 'ballista', 'red', 40, 40, { ammoState: 'empty', missileInventory: { emp: 0, he: 1, wp: 1 } });
    const load = ctx({ mine: [ballista], theirs: infantry }).find(a => a.command.type === 'LOAD_AMMO');
    expect(load?.command).toMatchObject({ warhead: 'wp' });
    const fire = (loadedAmmo: UnitData['loadedAmmo']) => ctx({ mine: [{ ...ballista, ammoState: 'armed', loadedAmmo }], theirs: [...infantry, ...tanks] })
      .find(a => a.command.type === 'FIRE_BALLISTA')?.command as { target: { x: number } } | undefined;
    expect(fire('wp')!.target.x).toBeLessThan(40);
    expect(fire('he')!.target.x).toBeGreaterThanOrEqual(50);
  });
});
