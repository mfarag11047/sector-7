import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG, DOCTRINE_CONFIG } from '../constants';
import type { DoctrineType } from '../types';
import { BLACKWALL } from './blackwall';
import type { GridPos, Team } from './commands';
import { activeFields } from './forcefield';
import { castPower, createHeadlessMatch, HeadlessMatch, stepMatch } from './headless';
import { createUnit } from './production';

// A quiet match: the two doctrines, plenty of cores, the computer players asleep and the field
// cleared, so only what a test puts down is on the map.
function quiet(doctrine: Partial<Record<Team, DoctrineType>>, picks: Partial<Record<Team, string[]>>): HeadlessMatch {
  const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: doctrine.blue ?? null, red: doctrine.red ?? null } });
  m.nextThink = { blue: Infinity, red: Infinity };
  m.units = [];
  for (const team of ['blue', 'red'] as const) {
    m.economy = { ...m.economy, [team]: { ...m.economy[team], cores: 10_000, track: { points: 0, progressMs: 0, elapsedMs: 0, picks: picks[team] ?? [] } } };
  }
  return m;
}
const put = (m: HeadlessMatch, type: Parameters<typeof createUnit>[0], team: Team, at: GridPos) => {
  const u = createUnit(type, team, `t-${team}-${m.units.length}`, at);
  m.units.push(u);
  return u.id;
};
const unit = (m: HeadlessMatch, id: string) => m.units.find(u => u.id === id);
const steps = (m: HeadlessMatch, ms: number) => { const end = m.now + ms; while (m.now < end) stepMatch(m); };
const at = { x: 30, z: 30 };

describe('doctrine powers in headless matches', () => {
  it('casts only a power taken on the track, and holds it to its cost and cooldown', () => {
    const m = quiet({ blue: 'heavy_metal' }, { blue: [] });
    expect(castPower(m, 'blue', 2, at)).toBe(false);
    m.economy.blue.track!.picks.push('hm_scrap', 'heavy_metal_tier2');
    expect(castPower(m, 'blue', 3, at)).toBe(false);
    expect(castPower(m, 'blue', 2, at)).toBe(true);
    expect(m.economy.blue.cores).toBe(10_000 - DOCTRINE_CONFIG.heavy_metal.tier2_cost);
    expect(castPower(m, 'blue', 2, at)).toBe(false);
    expect(m.powersCast).toHaveLength(1);
  });

  it('Orbital Drop lands a Titan', () => {
    const m = quiet({ blue: 'heavy_metal' }, { blue: ['hm_scrap', 'heavy_metal_tier2'] });
    castPower(m, 'blue', 2, at);
    expect(m.units.filter(u => u.type === 'titan_dropped' && u.team === 'blue')).toHaveLength(1);
  });

  it('Bulwark Force Field raises a dome that stops fire from outside, one generator per side', () => {
    // Without the dome, the same two troopers trade fire.
    const control = quiet({ blue: 'heavy_metal' }, {});
    const exposed = put(control, 'trooper', 'blue', { x: at.x + 1, z: at.z });
    put(control, 'trooper', 'red', { x: at.x + 4, z: at.z });
    steps(control, 6000);
    expect(unit(control, exposed)?.health ?? 0).toBeLessThan(createUnit('trooper', 'blue', 'x', at).maxHealth);

    const m = quiet({ blue: 'heavy_metal' }, { blue: ['hm_scrap', 'heavy_metal_tier3', 'hm_plate', 'heavy_metal_overdrive'] });
    castPower(m, 'blue', 3, at);
    const sheltered = put(m, 'trooper', 'blue', { x: at.x + 1, z: at.z });
    put(m, 'trooper', 'red', { x: at.x + 4, z: at.z });
    steps(m, 6000);
    expect(activeFields(m.units, m.now)).toHaveLength(1);
    expect(unit(m, sheltered)!.health).toBe(unit(m, sheltered)!.maxHealth);
    // The dome took the hits instead.
    expect(m.units.find(u => u.type === 'field_generator')!.fieldShieldHp).toBeLessThan(6000);
    // Dropping a new one replaces it.
    m.doctrineReadyAt.blue.tier3 = 0;
    castPower(m, 'blue', 3, { x: at.x + 10, z: at.z });
    expect(m.units.filter(u => u.type === 'field_generator')).toHaveLength(1);
  });

  it('Cloaking Field hides friendly units inside it', () => {
    const m = quiet({ red: 'shadow_ops' }, { red: ['so_silent', 'shadow_ops_tier3'] });
    castPower(m, 'red', 3, at);
    const hidden = put(m, 'tank', 'red', { x: at.x + 1, z: at.z });
    steps(m, 200);
    expect(unit(m, hidden)!.fieldCloaked).toBe(true);
  });

  it('Nano-Cloud stops all fire inside it until it clears', () => {
    const m = quiet({ blue: 'netrunner' }, { blue: ['nr_brute', 'netrunner_tier2'] });
    castPower(m, 'blue', 2, at);
    const a = put(m, 'trooper', 'blue', at);
    const b = put(m, 'trooper', 'red', { x: at.x + 1, z: at.z });
    steps(m, 5000);
    expect(unit(m, a)!.health).toBe(unit(m, a)!.maxHealth);
    expect(unit(m, b)!.health).toBe(unit(m, b)!.maxHealth);
    steps(m, ABILITY_CONFIG.NANO_CLOUD_DURATION);
    expect(m.nanoClouds).toHaveLength(0);
    expect((unit(m, a)?.health ?? 0) < 120 || (unit(m, b)?.health ?? 0) < 120).toBe(true);
  });

  it('Black Wall Infect falls, takes a quarter of the health of the enemies under it and infects them', () => {
    const m = quiet({ blue: 'netrunner' }, { blue: ['nr_brute', 'netrunner_tier3'] });
    const victim = put(m, 'tank', 'red', at);
    const max = unit(m, victim)!.maxHealth;
    castPower(m, 'blue', 3, at);
    steps(m, BLACKWALL.fallMs + 100);
    const v = unit(m, victim)!;
    expect(v.blackwallInfectedAt).toBeDefined();
    expect(v.health).toBeLessThanOrEqual(max * (1 - BLACKWALL.impactShare));
    steps(m, 10_000);
    expect(unit(m, victim)!.health).toBeLessThan(v.health);
  });

  it('Phantom Decoys are paid for and recorded', () => {
    const m = quiet({ red: 'shadow_ops' }, { red: ['so_silent', 'shadow_ops_tier2'] });
    expect(castPower(m, 'red', 2, at)).toBe(true);
    expect(m.economy.red.cores).toBe(10_000 - DOCTRINE_CONFIG.shadow_ops.tier2_cost);
  });
});
