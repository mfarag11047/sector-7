import { describe, expect, it } from 'vitest';
import type { UnitData } from '../types';
import { aiThink, chooseUnit, freshAiMemory, type AiContext } from './ai';
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
