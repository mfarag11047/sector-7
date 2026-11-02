import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { ciwsTick, ORDNANCE_INTEGRITY } from './ciws';
import { damageDrones, dronesOf, emptySwarm, MICRODRONE, shieldWasps, Swarm, swarmThreats, swarmTick } from './microdrones';
import { createUnit } from './production';
import { DAMAGE_MULTIPLIER, UNIT_RULES } from './units';

const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x: number, z = 0, patch: Partial<UnitData> = {}) =>
  ({ ...createUnit(type, team, id, { x, z }), ...patch });
const TICK = 100;
let n = 0;
const newId = () => `md-${++n}`;

// Steps the swarm for `ms`, with the units standing still; returns the last tick and the damage
// done over the whole run.
function run(units: UnitData[], ms: number, swarm: Swarm = emptySwarm(), start = 0) {
  let tick = swarmTick(swarm, units, start, TICK, newId);
  const damage = new Map<string, number>();
  for (let t = start; t < start + ms; t += TICK) {
    tick = swarmTick(tick.swarm, units, t, TICK, newId);
    tick.unitDamage.forEach((v, id) => damage.set(id, (damage.get(id) ?? 0) + v));
  }
  return { tick, damage };
}

describe('Wasp micro-drones', () => {
  it('between fights, builds up a full swarm of 10 that circles the Wasp, and no more', () => {
    const wasp = unit('w', 'wasp', 'blue', 10, 10);
    const { tick } = run([wasp], 30_000);
    expect(MICRODRONE.max).toBe(10);
    expect(dronesOf(tick.swarm, 'w')).toBe(MICRODRONE.max);
    for (const d of tick.swarm.drones) {
      expect(d.mode).toBe('escort');
      expect(Math.hypot(d.at.x - 10, d.at.z - 10)).toBeLessThan(MICRODRONE.orbit + 0.6);
    }
    expect(tick.engaged.size).toBe(0);
  });

  it('builds one drone every so often, not all at once', () => {
    const wasp = unit('w', 'wasp', 'blue', 10, 10);
    expect(dronesOf(run([wasp], MICRODRONE.buildMs * 2 - TICK).tick.swarm, 'w')).toBe(2);
  });

  it('sends the swarm at enemies in reach, spread over them, and builds up to the full swarm', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const escort = run([wasp], 10_000).tick.swarm;
    const foes = [unit('t1', 'trooper', 'red', 4, 0), unit('t2', 'trooper', 'red', 0, 4)];
    const first = swarmTick(escort, [wasp, ...foes], 10_000, TICK, newId);
    expect(first.engaged.get('w')).toBeDefined();
    const targets = first.swarm.drones.filter(d => d.mode === 'attack').map(d => d.targetId);
    expect(new Set(targets)).toEqual(new Set(['t1', 't2']));
    // Struck home: each strike is spent, and does machine-gun damage by armour.
    const { damage, tick } = run([wasp, ...foes], 1500, first.swarm, 10_100);
    expect((damage.get('t1') ?? 0) + (damage.get('t2') ?? 0)).toBeGreaterThan(0);
    expect(((damage.get('t1') ?? 0) / (MICRODRONE.damage * DAMAGE_MULTIPLIER.mg.infantry)) % 1).toBeCloseTo(0);
    expect(tick.swarm.drones.length).toBeLessThanOrEqual(MICRODRONE.max);
  });

  it('detonates on its target: everything else bunched on that tile is caught too, the next tile is not', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    // A drone on top of its target, two troopers sharing its tile and one a tile away.
    const swarm: Swarm = { buildAt: { w: Infinity }, drones: [{
      id: 'd', waspId: 'w', team: 'blue', at: { x: 3, z: 0 }, mode: 'attack', targetId: 'a', slot: 0, hp: MICRODRONE.integrity,
    }] };
    const units = [wasp, unit('a', 'trooper', 'red', 3), unit('b', 'trooper', 'red', 3.3), unit('next', 'trooper', 'red', 4),
      unit('own', 'trooper', 'blue', 3.2), unit('air', 'hornet', 'red', 3)];
    const tick = swarmTick(swarm, units, 0, TICK, newId);
    const each = MICRODRONE.damage * DAMAGE_MULTIPLIER.mg.infantry;
    expect(tick.unitDamage.get('a')).toBeCloseTo(each);
    expect(tick.unitDamage.get('b')).toBeCloseTo(each * MICRODRONE.splash);
    expect(tick.unitDamage.has('next')).toBe(false);
    expect(tick.unitDamage.has('own')).toBe(false);
    // A blast on the ground doesn't reach an aircraft overhead.
    expect(tick.unitDamage.has('air')).toBe(false);
    expect(tick.strikes).toHaveLength(1);
    expect(tick.hits.map(h => h.targetId).sort()).toEqual(['a', 'b']);
    expect(MICRODRONE.blast).toBeLessThanOrEqual(1);
  });

  it('hits aircraft too, and never its own side or the neutral Sentinels', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const { damage } = run([wasp, unit('h', 'hornet', 'red', 3), unit('own', 'tank', 'blue', 2), unit('s', 'defense_drone', 'neutral', 0, 3)], 8000);
    expect(damage.get('h')).toBeGreaterThan(0);
    expect(damage.has('own')).toBe(false);
    expect(damage.has('s')).toBe(false);
  });

  it('leaves enemies out of reach alone', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const { damage, tick } = run([wasp, unit('far', 'tank', 'red', MICRODRONE.seekRadius + 1)], 8000);
    expect(damage.size).toBe(0);
    expect(tick.engaged.size).toBe(0);
  });

  it('after the fight, the survivors form up round the Wasp again', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    // A full swarm out with nothing left to fight.
    const swarm: Swarm = { buildAt: { w: Infinity }, drones: Array.from({ length: MICRODRONE.max }, (_, i) => ({
      id: `d${i}`, waspId: 'w', team: 'blue', at: { x: 5, z: 0 }, mode: 'attack', targetId: 'gone', slot: i, hp: MICRODRONE.integrity,
    })) };
    const { tick } = run([wasp], 3000, swarm);
    expect(dronesOf(tick.swarm, 'w')).toBe(MICRODRONE.max);
    expect(tick.swarm.drones.every(d => d.mode === 'escort')).toBe(true);
  });

  it('opens a fight with its whole swarm at once, and keeps launching at the same rate', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const full = run([wasp], 20_000).tick.swarm;
    // A tank in reach: every drone dives at once.
    const tank = unit('t', 'tank', 'red', 4, 0, { health: 1e6, maxHealth: 1e6 });
    const first = swarmTick(full, [wasp, tank], 20_000, TICK, newId);
    expect(first.swarm.drones.filter(d => d.mode === 'attack')).toHaveLength(MICRODRONE.max);
    // Over the next 6 s it launches another every 1.5 s, all of them striking.
    let launched = 0, hits = 0, sw = first.swarm;
    for (let t = 20_100; t < 26_000; t += TICK) {
      const r = swarmTick(sw, [wasp, tank], t, TICK, newId);
      launched += r.launched.length; hits += r.hits.length; sw = r.swarm;
    }
    expect(launched).toBeGreaterThanOrEqual(Math.floor(6000 / MICRODRONE.buildMs) - 1);
    expect(hits).toBeGreaterThan(MICRODRONE.max);
  });

  it('shields its Wasp: drones near it take the fire first, each soaking a share and spent', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const swarm = run([wasp], 20_000).tick.swarm;
    // A light hit is taken whole by one drone.
    const light = shieldWasps(swarm, new Map([['w', 20], ['x', 50]]), [wasp], 20_000);
    expect(light.damage.get('w')).toBe(0);
    expect(light.damage.get('x')).toBe(50);
    expect(light.spent).toHaveLength(1);
    expect(dronesOf(light.swarm, 'w')).toBe(MICRODRONE.max - 1);
    // A heavy one is soaked by as many as it takes, a share each, until they run out.
    const heavy = shieldWasps(swarm, new Map([['w', 1000]]), [wasp], 20_000);
    expect(heavy.spent).toHaveLength(MICRODRONE.max);
    expect(heavy.damage.get('w')).toBeCloseTo(1000 - MICRODRONE.max * MICRODRONE.absorb);
    // Drones off hunting, out of reach of the Wasp, don't shield it.
    const away: Swarm = { ...swarm, drones: swarm.drones.map(d => ({ ...d, at: { x: 5, z: 0 } })) };
    expect(shieldWasps(away, new Map([['w', 20]]), [wasp], 20_000).damage.get('w')).toBe(20);
  });

  it('keeps a few drones back to guard a Wasp under fire, while the rest hunt', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const full = run([wasp], 20_000).tick.swarm;
    const tank = unit('t', 'tank', 'red', 4, 0, { health: 1e6, maxHealth: 1e6 });
    const hit = shieldWasps(full, new Map([['w', 1]]), [wasp], 20_000).swarm;
    const r = swarmTick(hit, [wasp, tank], 20_100, TICK, newId);
    expect(r.swarm.drones.filter(d => d.mode === 'escort')).toHaveLength(MICRODRONE.guard);
    expect(r.swarm.drones.filter(d => d.mode === 'attack').length).toBeGreaterThan(0);
    // Not hit for a while: they all hunt again.
    const later = swarmTick(r.swarm, [wasp, tank], 20_000 + MICRODRONE.guardMs + 100, TICK, newId);
    expect(later.swarm.drones.filter(d => d.mode === 'escort')).toHaveLength(0);
  });

  it('drops with its Wasp, and an EMPed Wasp builds no more', () => {
    const wasp = unit('w', 'wasp', 'blue', 0, 0);
    const swarm = run([wasp], 5000).tick.swarm;
    expect(swarm.drones.length).toBeGreaterThan(0);
    expect(swarmTick(swarm, [{ ...wasp, health: 0 }], 5000, TICK, newId).swarm.drones).toEqual([]);
    expect(dronesOf(run([{ ...wasp, isStunned: true }], 5000).tick.swarm, 'w')).toBe(0);
  });

  it('is shot down by Aegis guns like any ordnance', () => {
    const wasp = unit('w', 'wasp', 'red', 5, 0);
    const swarm = run([wasp], 5000).tick.swarm;
    const aegis = unit('a', 'aegis', 'blue', 0, 0, { ciwsSpunMs: 1200 });
    const ciws = ciwsTick([aegis, wasp], swarmThreats(swarm), 5000, TICK);
    expect(ciws.links[0].ordnance).toBe(true);
    const hit = damageDrones(swarm, ciws.ordnanceDamage);
    expect(hit.downed).toHaveLength(1);
    expect(hit.swarm.drones).toHaveLength(swarm.drones.length - 1);
    expect(ORDNANCE_INTEGRITY.microdrone).toBe(MICRODRONE.integrity);
  });

  it('matches what the Wasp shows as its weapon in menus and balance', () => {
    const w = UNIT_RULES.wasp.weapon!;
    expect(w.indirect).toBe(true);
    expect([w.damage, w.cooldownMs, w.range, w.type]).toEqual([MICRODRONE.damage, MICRODRONE.buildMs, MICRODRONE.seekRadius, 'mg']);
  });
});
