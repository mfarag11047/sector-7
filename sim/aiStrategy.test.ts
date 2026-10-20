import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { aiThink, chooseUnit, freshAiMemory, gatherPoint, type AiContext } from './ai';
import { counterScore, freshStrategyMemory, LOSS_WINDOW_MS, STRATEGY_PLANS, updateStrategy, type AiStrategy } from './aiStrategy';
import { createHeadlessMatch } from './headless';
import { createUnit } from './production';

const unit = (id: string, type: UnitData['type'], team: UnitData['team'], x = 20, z = 20) => createUnit(type, team, id, { x, z });
const input = (nowMs: number, mine: UnitData[], theirs: UnitData[], extra: Partial<Parameters<typeof updateStrategy>[1]> = {}) =>
  ({ nowMs, tier: 2 as const, mine, theirs, armyValue: 500, random: () => 0, commitMs: 60_000, ...extra });

describe('army strategy', () => {
  it('opens with a plan and logs it', () => {
    const mem = updateStrategy(freshStrategyMemory(), input(0, [], [], { random: () => 0.6 }));
    expect(mem.strategy).toBe('air');
    expect(mem.log).toEqual([{ atMs: 0, strategy: 'air', reason: 'opening plan' }]);
  });

  it('switches to a counter after losing much of its army to one kind of enemy', () => {
    // An infantry army being shot out of the sky... by gunships.
    let mem = { ...freshStrategyMemory(), strategy: 'infantry' as AiStrategy, since: 0 };
    const troopers = Array.from({ length: 12 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    const gunships = [unit('h1', 'hornet', 'red', 21, 20), unit('h2', 'hornet', 'red', 20, 22)];
    mem = updateStrategy(mem, input(100_000, troopers, gunships));
    expect(mem.strategy).toBe('infantry');
    mem = updateStrategy(mem, input(103_000, [], gunships));
    expect(mem.strategy).toBe('armor');
    expect(mem.log.at(-1)!.reason).toBe('losing units to enemy aircraft');
    expect(mem.losses).toEqual([]);
  });

  it('sticks with its plan for a while, and on Easy for good', () => {
    const troopers = Array.from({ length: 12 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    const gunships = [unit('h1', 'hornet', 'red', 21, 20)];
    const start = { ...freshStrategyMemory(), strategy: 'infantry' as AiStrategy, since: 90_000 };
    const early = updateStrategy(updateStrategy(start, input(100_000, troopers, gunships)), input(103_000, [], gunships));
    expect(early.strategy).toBe('infantry');
    const easy = updateStrategy(updateStrategy({ ...start, since: 0 }, input(100_000, troopers, gunships, { commitMs: null })), input(103_000, [], gunships, { commitMs: null }));
    expect(easy.strategy).toBe('infantry');
  });

  it('sticks longer after a change, and does not flip straight back', () => {
    const troopers = Array.from({ length: 12 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    const gunships = [unit('h1', 'hornet', 'red', 21, 20), unit('h2', 'hornet', 'red', 20, 22)];
    const lose = (mem: ReturnType<typeof freshStrategyMemory>, at: number, theirs: UnitData[]) =>
      updateStrategy(updateStrategy(mem, input(at, troopers, theirs)), input(at + 3000, [], theirs));
    // Switched from infantry to armour at 100s, losing to aircraft.
    let mem = lose({ ...freshStrategyMemory(), strategy: 'infantry', since: 0, log: [{ atMs: 0, strategy: 'infantry', reason: 'opening plan' }] }, 100_000, gunships);
    expect(mem.strategy).toBe('armor');
    const switchedAt = mem.since;
    // Now losing to enemy infantry, which infantry would answer: not yet, one commitment on.
    const riflemen = Array.from({ length: 10 }, (_, i) => unit(`r${i}`, 'trooper', 'red', 20 + (i % 3), 20 + Math.floor(i / 3)));
    mem = lose(mem, switchedAt + 60_000, riflemen);
    expect(mem.strategy).toBe('armor');
    // Nor after twice that, since it gave up infantry only a few minutes ago.
    mem = lose(mem, switchedAt + 130_000, riflemen);
    expect(mem.strategy).not.toBe('infantry');
  });

  it('forgets old losses, and ignores units that die with no enemy about', () => {
    const troopers = Array.from({ length: 12 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    let mem = updateStrategy({ ...freshStrategyMemory(), strategy: 'infantry', since: 0 }, input(0, troopers, []));
    mem = updateStrategy(mem, input(1000, [], []));
    expect(mem.losses).toEqual([]);
    mem = updateStrategy({ ...mem, losses: [{ atMs: 0, value: 5000, by: { air: 1 } }] }, input(LOSS_WINDOW_MS + 1000, [], []));
    expect(mem.losses).toEqual([]);
    expect(mem.strategy).toBe('infantry');
  });

  it('knows what counters what', () => {
    const best = (mix: Parameters<typeof counterScore>[1]) =>
      (['infantry', 'armor', 'air', 'drones'] as AiStrategy[]).sort((a, b) => counterScore(b, mix, 2) - counterScore(a, mix, 2))[0];
    expect(best({ infantry: 1 })).toBe('armor');
    expect(best({ air: 1 })).toBe('armor');
    expect(best({ heavy: 1 })).toBe('infantry');
  });

  it('leans training toward the strategy', () => {
    const base = { counterAccuracy: 0, needInfantry: false, guardians: 0, army: 10 };
    const mix = { infantry: 0.25, light: 0.25, heavy: 0.25, air: 0.25, structure: 0 };
    let seq = 0;
    const random = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
    const tally = (strategy: AiStrategy) => {
      const counts: Record<string, number> = {};
      for (let i = 0; i < 400; i++) {
        const t = chooseUnit('air', 2, mix, { ...base, random, weights: STRATEGY_PLANS[strategy].units })!;
        counts[t] = (counts[t] || 0) + 1;
      }
      return counts;
    };
    expect(tally('air').hornet).toBeGreaterThan(tally('drones').hornet);
    expect(tally('drones').wasp).toBeGreaterThan(tally('air').wasp);
  });
});

describe('taking nodes with infantry', () => {
  // Blue's army beside the node it is going for, with its energy grid reaching it.
  const think = (units: (at: { x: number; z: number }) => UnitData[]) => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'normal', doctrine: null,
      canBuildOn: () => false, isOpenGround: () => false, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.99,
    };
    const memory = { ...freshAiMemory(), plan: { ...freshStrategyMemory(), strategy: 'armor' as AiStrategy, since: 0 } };
    const view = (army: UnitData[], buildings = m.buildings) =>
      ({ units: [...m.units.filter(u => u.team !== 'blue'), ...army], structures: m.structures, buildings, economy: m.economy, elapsedMs: 60_000 });
    // Where it would go with a small vehicle army.
    const probe = aiThink(view(units({ x: 8, z: 8 })), 'blue', memory, ctx).memory;
    const at = probe.objective!;
    const buildings = m.buildings.map(b => b.type !== 'core_node' && b.type !== 'server_node' && Math.hypot(b.gridX - at.x, b.gridZ - at.z) <= 6 ? { ...b, owner: 'blue' as const } : b);
    const out = aiThink(view(units({ x: at.x + 2, z: at.z + 2 }), buildings), 'blue', memory, ctx);
    return { out, objective: at };
  };
  const movesOf = (out: ReturnType<typeof aiThink>, id: string) => out.actions
    .filter(a => a.kind === 'order' && a.command.type === 'MOVE' && a.command.unitIds.includes(id))
    .map(a => (a.kind === 'order' && a.command.type === 'MOVE' ? a.command.target : null));
  const vehicles = (p: { x: number; z: number }) => [
    unit('r1', 'razorback', 'blue', p.x, p.z), unit('r2', 'razorback', 'blue', p.x + 1, p.z), unit('r3', 'razorback', 'blue', p.x, p.z + 1),
  ];

  it('keeps vehicles back from a node it has no infantry to capture', () => {
    const { out, objective } = think(vehicles);
    expect(out.memory.mode).toBe('expand');
    expect(movesOf(out, 'r1')).not.toContainEqual(objective);
  });

  it('sends infantry onto the node with the vehicles', () => {
    const { out, objective } = think(p => [...vehicles(p), unit('i1', 'trooper', 'blue', p.x + 1, p.z + 1), unit('i2', 'trooper', 'blue', p.x - 1, p.z)]);
    expect(out.memory.mode).toBe('expand');
    expect(movesOf(out, 'i1')).toContainEqual(objective);
    expect(movesOf(out, 'r1')).toContainEqual(objective);
  });
});

describe('server node guards', () => {
  it('only takes on a Sentinel with an army that can put it down cheaply', async () => {
    const { guardLosses } = await import('./ai');
    const guard = createUnit('defense_drone', 'neutral', 'g', { x: 9, z: 33 });
    const troopers = Array.from({ length: 4 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    const tanks = Array.from({ length: 4 }, (_, i) => unit(`k${i}`, 'tank', 'blue'));
    // Four Troopers would lose most of their number; with tanks alongside, little or nothing.
    expect(guardLosses(troopers, guard)).toBeGreaterThanOrEqual(160);
    expect(guardLosses([...troopers, ...tanks], guard)).toBeLessThan(160);
    expect(guardLosses([], guard)).toBe(Infinity);
  });
});

describe('the capture team', () => {
  const setup = () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'normal', doctrine: null,
      canBuildOn: () => false, isOpenGround: () => false, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.99,
    };
    const view = (army: UnitData[]) => ({ units: [...m.units.filter(u => u.team !== 'blue'), ...army], structures: m.structures, buildings: m.buildings, economy: m.economy, elapsedMs: 60_000 });
    return { ctx, view, gather: gatherPoint(view([]), 'blue', ctx) };
  };
  const memory = () => ({ ...freshAiMemory(), plan: { ...freshStrategyMemory(), strategy: 'armor' as AiStrategy, since: 0 } });
  const targets = (out: ReturnType<typeof aiThink>) => out.actions.flatMap(a => (a.kind === 'order' && a.command.type === 'MOVE' ? [a.command.target] : []));

  it('waits at the gather point until a few infantry are together', () => {
    const { ctx, view, gather } = setup();
    const lone = aiThink(view([unit('t1', 'trooper', 'blue', gather.x, gather.z + 1)]), 'blue', memory(), ctx);
    expect(lone.memory.captureGroup).toEqual([]);
    expect(targets(lone).every(t => Math.hypot(t.x - gather.x, t.z - gather.z) <= 1)).toBe(true);
    const three = ['t1', 't2', 't3'].map((id, i) => unit(id, 'trooper', 'blue', gather.x + i - 1, gather.z));
    const out = aiThink(view(three), 'blue', memory(), ctx);
    expect(out.memory.captureGroup).toEqual(['t1', 't2', 't3']);
    expect(targets(out).some(t => Math.hypot(t.x - gather.x, t.z - gather.z) > 5)).toBe(true);
  });

  it('calls a lone survivor back to wait for the next group', () => {
    const { ctx, view, gather } = setup();
    const out = aiThink(view([unit('t1', 'trooper', 'blue', 30, 30)]), 'blue', { ...memory(), captureGroup: ['t1', 't2', 't3'] }, ctx);
    expect(out.memory.captureGroup).toEqual([]);
    expect(targets(out)).toContainEqual(gather);
  });
});

describe('building under attack', () => {
  it('places no structures while enemy fighters are in its base, and builds once it is clear', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'normal', doctrine: null,
      canBuildOn: () => true, isOpenGround: () => true, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.99,
    };
    const placed = (units: UnitData[]) => aiThink({ units, structures: m.structures, buildings: m.buildings, economy: m.economy, elapsedMs: 60_000 }, 'blue', freshAiMemory(), ctx)
      .actions.some(a => a.kind === 'order' && a.command.type === 'PLACE_STRUCTURE');
    expect(placed(m.units)).toBe(true);
    expect(placed([...m.units, unit('raider', 'razorback', 'red', 9, 9)])).toBe(false);
  });
});

describe('researching upgrades', () => {
  it('researches an upgrade for the units it fields at an idle Advanced Research', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'normal', doctrine: null,
      canBuildOn: () => false, isOpenGround: () => false, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.1,
    };
    const lab = { id: 'lab', type: 'research_lab' as const, team: 'blue' as const, gridPos: { x: 7, z: 4 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 800, maxHealth: 800 };
    const economy = { ...m.economy, blue: { ...m.economy.blue, tier: 2 as const, cores: 2000 } };
    const razorbacks = ['r1', 'r2', 'r3'].map((id, i) => unit(id, 'razorback', 'blue', 8 + i, 8));
    const memory = { ...freshAiMemory(), plan: { ...freshStrategyMemory(), strategy: 'armor' as AiStrategy, since: 0 } };
    const think = (structures = [...m.structures, lab]) => aiThink({ units: [...m.units.filter(u => u.team !== 'blue'), ...razorbacks], structures, buildings: m.buildings, economy, elapsedMs: 8 * 60_000 }, 'blue', memory, ctx)
      .actions.flatMap(a => (a.kind === 'order' && a.command.type === 'RESEARCH_UPGRADE' ? [a.command.upgrade] : []));
    expect(think()).toEqual(['overclock']);
    // Busy: nothing new.
    expect(think([...m.structures, { ...lab, research: { upgrade: 'nanoweave' as const, remainingMs: 1000, totalMs: 30_000 } }])).toEqual([]);
  });
});

describe('think timing', () => {
  it('staggers two computer players and varies every interval a little, so their order keeps changing', async () => {
    const { nextThinkDelay, thinkOffsets, THINK_JITTER } = await import('./ai');
    expect(thinkOffsets('red', 3500)).toEqual({ blue: 1750, red: 0 });
    let seq = 1;
    const random = () => ((seq = (seq * 16807) % 2147483647) / 2147483647);
    const delays = Array.from({ length: 200 }, () => nextThinkDelay(3500, random));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(3500 * (1 - THINK_JITTER));
    expect(Math.max(...delays)).toBeLessThanOrEqual(3500 * (1 + THINK_JITTER));
    // Two timers that start on the same tick: which is ahead keeps swapping as they drift.
    let blue = 0, red = 0, swaps = 0, ahead = 0;
    for (let i = 0; i < 300; i++) {
      blue += nextThinkDelay(3500, random);
      red += nextThinkDelay(3500, random);
      const now = Math.sign(blue - red);
      if (now !== 0 && ahead !== 0 && now !== ahead) swaps++;
      if (now !== 0) ahead = now;
    }
    expect(swaps).toBeGreaterThan(5);
  });
});
