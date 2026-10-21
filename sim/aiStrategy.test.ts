import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { aiThink, bestCounters, chooseUnit, freshAiMemory, gatherPoint, type AiContext } from './ai';
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
    // An infantry army cut down by a Kestrel swarm. Troopers can shoot back at aircraft, but the
    // machine guns shred them: the answer is the Aegis's flak, in the armoured army.
    let mem = { ...freshStrategyMemory(), strategy: 'infantry' as AiStrategy, since: 0 };
    const troopers = Array.from({ length: 12 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    const kestrels = Array.from({ length: 6 }, (_, i) => unit(`k${i}`, 'attack_drone', 'red', 20 + (i % 3), 21 + Math.floor(i / 3)));
    mem = updateStrategy(mem, input(100_000, troopers, kestrels));
    expect(mem.strategy).toBe('infantry');
    mem = updateStrategy(mem, input(103_000, [], kestrels));
    expect(mem.strategy).toBe('armor');
    expect(mem.log.at(-1)!.reason).toBe('losing units to enemy aircraft (mostly "Kestrel" Attack Drones)');
    expect(mem.losses).toEqual([]);
  });

  it('answers what actually did it: gunships that can\'t shoot back at aircraft lose to drones', () => {
    let mem = { ...freshStrategyMemory(), strategy: 'infantry' as AiStrategy, since: 0 };
    const troopers = Array.from({ length: 12 }, (_, i) => unit(`t${i}`, 'trooper', 'blue'));
    const gunships = [unit('h1', 'hornet', 'red', 21, 20), unit('h2', 'hornet', 'red', 20, 22)];
    mem = updateStrategy(updateStrategy(mem, input(100_000, troopers, gunships)), input(103_000, [], gunships));
    expect(mem.strategy).toBe('drones');
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
    // Switched from infantry to a drone swarm at 100s, losing to gunships.
    let mem = lose({ ...freshStrategyMemory(), strategy: 'infantry', since: 0, log: [{ atMs: 0, strategy: 'infantry', reason: 'opening plan' }] }, 100_000, gunships);
    expect(mem.strategy).toBe('drones');
    const switchedAt = mem.since;
    // Now losing to enemy infantry, which infantry would answer: not yet, one commitment on.
    const riflemen = Array.from({ length: 10 }, (_, i) => unit(`r${i}`, 'trooper', 'red', 20 + (i % 3), 20 + Math.floor(i / 3)));
    mem = lose(mem, switchedAt + 60_000, riflemen);
    expect(mem.strategy).toBe('drones');
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
    expect(best({ trooper: 1 })).toBe('armor');
    // Tanks can't shoot aircraft: gunships are the answer to a pure tank army.
    expect(best({ tank: 1 })).toBe('air');
    // With flak to cover them, Lancers' rockets are.
    expect(best({ tank: 0.5, aegis: 0.5 })).toBe('infantry');
    // Losing to a Kestrel swarm: infantry can shoot back, but the machine guns cut it down. The
    // answer is the Aegis's flak, in the armoured army.
    expect(best({ attack_drone: 0.8, wasp: 0.2 })).toBe('armor');
    expect(counterScore('infantry', { attack_drone: 1 }, 2)).toBeLessThan(counterScore('armor', { attack_drone: 1 }, 2));
  });

  it('leans training toward the strategy', () => {
    const base = { counterAccuracy: 0, needInfantry: false, guardians: 0, army: 10 };
    const mix = { trooper: 0.25, razorback: 0.25, tank: 0.25, attack_drone: 0.25 };
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
    let economy = { ...m.economy, blue: { ...m.economy.blue, tier: 2 as const, cores: 2000, compute: 420 } };
    const razorbacks = ['r1', 'r2', 'r3'].map((id, i) => unit(id, 'razorback', 'blue', 8 + i, 8));
    const memory = { ...freshAiMemory(), plan: { ...freshStrategyMemory(), strategy: 'armor' as AiStrategy, since: 0 } };
    const think = (structures = [...m.structures, lab]) => aiThink({ units: [...m.units.filter(u => u.team !== 'blue'), ...razorbacks], structures, buildings: m.buildings, economy, elapsedMs: 8 * 60_000 }, 'blue', memory, ctx)
      .actions.flatMap(a => (a.kind === 'order' && a.command.type === 'RESEARCH_UPGRADE' ? [a.command.upgrade] : []));
    expect(think()).toEqual(['overclock']);
    // The compute for Tier 3 comes first.
    economy = { ...economy, blue: { ...economy.blue, compute: 400 } };
    expect(think()).toEqual([]);
    // Busy: nothing new.
    expect(think([...m.structures, { ...lab, research: { upgrade: 'nanoweave' as const, remainingMs: 1000, totalMs: 30_000 } }])).toEqual([]);
  });
});

describe('answering a threat', () => {
  it('names the best counters it can train to what has been killing it', () => {
    const all = new Set<StructureData['type']>(['infantry', 'armor', 'air']);
    expect(bestCounters({ attack_drone: 1 }, 2, all, 2)[0]).toBe('aegis');
    // Only what it has a producer for.
    expect(bestCounters({ attack_drone: 1 }, 2, new Set(['infantry']), 2)).not.toContain('aegis');
  });

  it('trains Aegis at its Factory when losing to Kestrels, even as an infantry army that hardly uses it', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'hard', red: 'hard' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'hard', doctrine: null,
      canBuildOn: () => false, isOpenGround: () => false, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.6,
    };
    const factory: StructureData = { id: 'fac', type: 'armor', team: 'blue', gridPos: { x: 5, z: 1 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 1200, maxHealth: 1200 };
    const kestrels = Array.from({ length: 6 }, (_, i) => createUnit('attack_drone', 'red', `k${i}`, { x: 30 + i, z: 30 }));
    const plan = { ...freshStrategyMemory(), strategy: 'infantry' as AiStrategy, since: 0,
      losses: [{ atMs: 7 * 60_000, value: 900, by: { air: 1 }, byType: { attack_drone: 1 } }] };
    const trained = aiThink({
      units: [...m.units, ...kestrels], structures: [...m.structures, factory], buildings: m.buildings,
      economy: { ...m.economy, blue: { ...m.economy.blue, tier: 2, cores: 5000 } }, elapsedMs: 8 * 60_000,
    }, 'blue', { ...freshAiMemory(), plan }, ctx).actions
      .flatMap(a => (a.kind === 'order' && a.command.type === 'TRAIN_UNIT' && a.command.structureId === 'fac' ? [a.command.unitType] : []));
    expect(trained).toContain('aegis');
  });
});

describe('Core Refineries', () => {
  it('upgrades its refinery at Tier 2 with cores to spare', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'normal', doctrine: null,
      canBuildOn: () => false, isOpenGround: () => false, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.1,
    };
    const refinery: StructureData = { id: 'ref', type: 'refinery', team: 'blue', gridPos: { x: 5, z: 1 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 900, maxHealth: 900 };
    const think = (tier: 1 | 2, cores: number) => aiThink({
      units: m.units, structures: [...m.structures, refinery], buildings: m.buildings,
      economy: { ...m.economy, blue: { ...m.economy.blue, tier, cores } }, elapsedMs: 8 * 60_000,
    }, 'blue', freshAiMemory(), ctx).actions.some(a => a.kind === 'order' && a.command.type === 'UPGRADE_REFINERY');
    expect(think(2, 5000)).toBe(true);
    expect(think(1, 5000)).toBe(false);
    expect(think(2, 200)).toBe(false);
  });
});

describe('a full base', () => {
  it('keeps training when every building pad is taken, instead of saving for a building it cannot place', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    const ctx: AiContext = {
      gridSize: m.gridSize, bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, difficulty: 'normal', doctrine: null,
      canBuildOn: () => true, isOpenGround: () => true, isWalkable: () => true,
      doctrineCooldowns: { tier2: 0, tier3: 0 }, random: () => 0.1,
    };
    // Six producers on Blue's six pads; an armour plan still wants a second Factory.
    const pads: [StructureData['type'], number, number][] = [['infantry', 3, 1], ['armor', 5, 1], ['air', 1, 3], ['research_lab', 1, 5], ['support', 7, 4], ['builder', 4, 7]];
    const structures = [...m.structures, ...pads.map(([type, x, z], i): StructureData => ({
      id: `p${i}`, type, team: 'blue', gridPos: { x, z }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 900, maxHealth: 900,
    }))];
    const economy = { ...m.economy, blue: { ...m.economy.blue, tier: 2 as const, cores: 600 } };
    const memory = { ...freshAiMemory(), plan: { ...freshStrategyMemory(), strategy: 'armor' as AiStrategy, since: 0 } };
    const out = aiThink({ units: m.units, structures, buildings: m.buildings, economy, elapsedMs: 9 * 60_000 }, 'blue', memory, ctx);
    const orders = out.actions.flatMap(a => (a.kind === 'order' ? [a.command.type] : []));
    expect(orders).not.toContain('PLACE_STRUCTURE');
    expect(orders).toContain('TRAIN_UNIT');
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
