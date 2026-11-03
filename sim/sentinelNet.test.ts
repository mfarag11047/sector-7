import { describe, expect, it } from 'vitest';
import type { BuildingData, DoctrineType, UnitData } from '../types';
import { freshSentinelNet, SENTINEL_NET, sentinelBlocker, sentinelNetTick, type SentinelNet } from './sentinelNet';
import { popUsed } from './units';
import { orderEffects } from './orders';
import { createEconomy } from './economy';
import { resolveAttacks } from './combat';

const server = (owner: BuildingData['owner'], x = 10, z = 10): BuildingData => ({
  id: `server-${x}-${z}`, gridX: x, gridZ: z, position: [0, 0, 0], scale: [1, 1, 1], color: '#fff', type: 'server_node',
  height: 11, owner, captureProgress: 0, capturingTeam: null, health: 100, maxHealth: 100,
} as BuildingData);
const unit = (id: string, team: UnitData['team'], at: { x: number; z: number }, extra: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team, gridPos: at, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...extra,
} as UnitData);
const guard = (at = { x: 20, z: 20 }) => unit('drone-g', 'neutral', at, { type: 'defense_drone', unitClass: 'defense', health: 300, maxHealth: 300, sentinelPost: 'server-20-20' });

// Runs the net for `ms`, a tick at a time.
function run(ms: number, units: UnitData[], buildings: BuildingData[], doctrine: Partial<Record<'blue' | 'red', DoctrineType>>, cracked = { blue: false, red: false }) {
  let net: SentinelNet = freshSentinelNet();
  let id = 0;
  const events = { cracked: [] as string[], hacked: [] as string[], defenders: [] as string[] };
  for (let now = 0; now < ms; now += 100) {
    const r = sentinelNetTick(net, units, buildings, t => doctrine[t] ?? null, t => cracked[t], now, 100, () => `sn-${++id}`);
    units = r.units; net = r.net;
    r.cracked.forEach(t => { cracked[t] = true; events.cracked.push(t); });
    r.hacked.forEach(h => events.hacked.push(h.id));
    r.defenders.forEach(d => events.defenders.push(d.id));
  }
  return { units, net, events, cracked };
}

describe('the Sentinel code', () => {
  it('a Netrunner side cracks it by holding a server node, and only Netrunner', () => {
    expect(run(200, [], [server('blue')], { blue: 'netrunner' }).events.cracked).toEqual(['blue']);
    expect(run(200, [], [server('blue')], { blue: 'heavy_metal' }).events.cracked).toEqual([]);
    expect(sentinelBlocker('netrunner', false)).toMatch(/server node/);
    expect(sentinelBlocker('shadow_ops', true)).toMatch(/Netrunner/);
    expect(sentinelBlocker('netrunner', true)).toBeNull();
  });

  it('lets only a cracked Netrunner side train Sentinels at its Comm Link', () => {
    const comm = { id: 'c', type: 'support', team: 'blue', gridPos: { x: 5, z: 5 }, health: 100, maxHealth: 100, isBlueprint: false, constructionProgress: 100, maxProgress: 100 } as never;
    const view = (code: boolean) => {
      const economy = createEconomy(5000);
      economy.blue.sentinelCode = code;
      return { units: [], structures: [comm], buildings: [], economy, doctrines: { blue: 'netrunner' as const }, unlimitedPop: true };
    };
    const train = { type: 'TRAIN_UNIT', structureId: 'c', unitType: 'defense_drone' } as const;
    expect(orderEffects(view(false), 'blue', train, {} as never).ok).toBe(false);
    expect(orderEffects(view(true), 'blue', train, {} as never).ok).toBe(true);
  });
});

describe('hacking a neutral Sentinel', () => {
  it('turns it over to a cracked Netrunner side that stays beside it, and it holds fire meanwhile', () => {
    const units = [guard(), unit('t1', 'blue', { x: 21, z: 20 })];
    const half = run(SENTINEL_NET.hackMs / 2, units, [server('blue')], { blue: 'netrunner' });
    const g = half.units.find(u => u.id === 'drone-g')!;
    expect(g.team).toBe('neutral');
    expect(g.hackProgress).toMatchObject({ team: 'blue', active: true });
    const done = run(SENTINEL_NET.hackMs + 200, units, [server('blue')], { blue: 'netrunner' });
    expect(done.units.find(u => u.id === 'drone-g')!.team).toBe('blue');
    expect(done.events.hacked).toEqual(['drone-g']);
  });

  it('stalls while the other side contests it, and needs the code', () => {
    const contested = [guard(), unit('t1', 'blue', { x: 21, z: 20 }), unit('r1', 'red', { x: 22, z: 21 })];
    expect(run(SENTINEL_NET.hackMs * 2, contested, [server('blue')], { blue: 'netrunner' }).units.find(u => u.id === 'drone-g')!.team).toBe('neutral');
    // No server node held: no code, no hack.
    const noCode = [guard(), unit('t1', 'blue', { x: 21, z: 20 })];
    expect(run(SENTINEL_NET.hackMs * 2, noCode, [], { blue: 'netrunner' }).units.find(u => u.id === 'drone-g')!.team).toBe('neutral');
  });

  it('takes no population once hacked', () => {
    const done = run(SENTINEL_NET.hackMs + 200, [guard(), unit('t1', 'blue', { x: 21, z: 20 })], [server('blue')], { blue: 'netrunner' });
    expect(popUsed(done.units, [], 'blue')).toBe(1);
  });
});

describe('server node defenders', () => {
  it('a node a Netrunner side has held long enough gains a Sentinel, then another after it falls', () => {
    const before = run(SENTINEL_NET.defenderAfterMs - 1000, [], [server('blue')], { blue: 'netrunner' });
    expect(before.events.defenders).toEqual([]);
    const after = run(SENTINEL_NET.defenderAfterMs + 200, [], [server('blue')], { blue: 'netrunner' });
    expect(after.events.defenders.length).toBe(1);
    const d = after.units.find(u => u.type === 'defense_drone')!;
    expect(d).toMatchObject({ team: 'blue', sentinelPost: 'server-10-10', gridPos: { x: 10, z: 10 } });
    expect(popUsed(after.units, [], 'blue')).toBe(0);
    // Only one at a time.
    let units = after.units, net = after.net;
    for (let now = SENTINEL_NET.defenderAfterMs + 200; now < SENTINEL_NET.defenderAfterMs * 2; now += 100) {
      ({ units, net } = sentinelNetTick(net, units, [server('blue')], () => 'netrunner', () => true, now, 100, () => 'x'));
    }
    expect(units.filter(u => u.type === 'defense_drone').length).toBe(1);
    // It falls: another comes defenderAfterMs later.
    units = units.map(u => u.type === 'defense_drone' ? { ...u, health: 0 } : u);
    const fell = SENTINEL_NET.defenderAfterMs * 2;
    let spawned = 0;
    for (let now = fell; now < fell + SENTINEL_NET.defenderAfterMs + 200; now += 100) {
      const r = sentinelNetTick(net, units, [server('blue')], () => 'netrunner', () => true, now, 100, () => `y${now}`);
      units = r.units; net = r.net; spawned += r.defenders.length;
    }
    expect(spawned).toBe(1);
  });

  it('none for another doctrine', () => {
    expect(run(SENTINEL_NET.defenderAfterMs + 500, [], [server('red')], { red: 'shadow_ops' }).events.defenders).toEqual([]);
  });
});

describe('fire around a hack', () => {
  it('the Sentinel being hacked holds fire, and the hackers leave it be', () => {
    const g = { ...guard({ x: 20, z: 20 }), hackProgress: { team: 'blue' as const, ms: 2000, active: true } };
    const t = unit('t1', 'blue', { x: 21, z: 20 });
    const r = resolveAttacks([g, t], [], 10_000, () => false);
    expect(r.fired.has(g.id)).toBe(false);
    expect(r.fired.has('t1')).toBe(false);
    // Stalled, it fires again.
    const stalled = resolveAttacks([{ ...g, hackProgress: { ...g.hackProgress, active: false } }, t], [], 10_000, () => false);
    expect(stalled.fired.get(g.id)).toBe('t1');
  });
});
