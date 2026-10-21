import { describe, expect, it } from 'vitest';
import type { StructureData } from '../types';
import { createEconomy, Economy } from './economy';
import { applyOrderToStructures, orderEffects, OrdersContext } from './orders';
import { abilityDef } from './unitAbilities';
import {
  abilityUnlocked, addUpgrades, advanceResearch, applyResearch, artilleryTierOf, researchBlocker, upgradeClasses, upgradeDef, UPGRADES,
} from './upgrades';

const lab = (patch: Partial<StructureData> = {}): StructureData => ({
  id: 'lab', type: 'research_lab', team: 'blue', gridPos: { x: 7, z: 4 }, isBlueprint: false, constructionProgress: 100,
  maxProgress: 100, health: 800, maxHealth: 800, ...patch,
});
const atTier = (tier: 1 | 2 | 3, cores = 2000, compute = 500): Economy => { const e = createEconomy(cores); e.blue = { ...e.blue, tier, compute }; return e; };
const ctx = {} as OrdersContext;
const research = (economy: Economy, structures: StructureData[], upgrade: string) =>
  orderEffects({ units: [], structures, buildings: [], economy }, 'blue', { type: 'RESEARCH_UPGRADE', structureId: 'lab', upgrade: upgrade as never }, ctx);

describe('unit upgrades', () => {
  it('lists the upgrades by unit class, then unit', () => {
    const classes = upgradeClasses();
    expect(classes.map(c => c.unitClass)).toEqual(['infantry', 'armor', 'air']);
    expect(classes[0].units).toEqual(['trooper', 'ghost', 'lancer']);
    // Every later-tier unit ability is an upgrade.
    for (const id of ['nanoweave', 'emp_rocket', 'overclock', 'radar', 'hellfire']) expect(upgradeDef(id)).toBeDefined();
  });

  it('starts research at a finished Advanced Research, paid for, one at a time', () => {
    const r = research(atTier(2), [lab()], 'nanoweave');
    expect('effects' in r).toBe(true);
    if (!('effects' in r)) return;
    const after = applyOrderToStructures([lab()], r.effects);
    expect(after[0].research).toMatchObject({ upgrade: 'nanoweave', remainingMs: 30_000 });
    expect(r.effects.economy!(atTier(2))!.blue).toMatchObject({ cores: 2000 - 250, compute: 500 - 50 });
    expect(research(atTier(2), after, 'overclock')).toMatchObject({ ok: false, reason: expect.stringMatching(/already researching/) });
    expect(research(atTier(2), [lab({ buildRemainingMs: 1000 })], 'nanoweave')).toMatchObject({ reason: expect.stringMatching(/not finished/) });
  });

  it('needs the tier, any earlier upgrade, the cores and the compute', () => {
    expect(research(atTier(1), [lab()], 'nanoweave')).toMatchObject({ reason: expect.stringMatching(/Tier 2/) });
    expect(research(atTier(3), [lab()], 'guided_shells')).toMatchObject({ reason: expect.stringMatching(/Long-Range Shells first/) });
    expect(research(atTier(2, 100), [lab()], 'nanoweave')).toMatchObject({ reason: expect.stringMatching(/cores/) });
    expect(research(atTier(2, 2000, 49), [lab()], 'nanoweave')).toMatchObject({ reason: 'needs 50 compute' });
    expect(research(atTier(3, 2000, 99), [lab()], 'radar')).toMatchObject({ reason: 'needs 100 compute' });
    const done = atTier(2); done.blue = { ...done.blue, upgrades: ['nanoweave'] };
    expect(researchBlocker(done, 'blue', [], 'nanoweave')).toMatch(/already researched/);
    expect(researchBlocker(atTier(2), 'blue', [lab({ research: { upgrade: 'nanoweave', remainingMs: 5, totalMs: 10 } })], 'nanoweave')).toMatch(/already being researched/);
  });

  it('finishes research over time and gives the side the upgrade', () => {
    let structures = [lab({ research: { upgrade: 'overclock', remainingMs: 250, totalMs: 30_000 } })];
    let economy = atTier(2);
    for (let i = 0; i < 3; i++) {
      const tick = advanceResearch(structures, () => 100);
      structures = applyResearch(structures, tick);
      economy = addUpgrades(economy, tick.finished);
    }
    expect(structures[0].research).toBeUndefined();
    expect(economy.blue.upgrades).toEqual(['overclock']);
    // Destroyed mid-research: nothing.
    expect(advanceResearch([lab({ health: 0, research: { upgrade: 'radar', remainingMs: 50, totalMs: 100 } })], () => 100).finished).toEqual([]);
  });

  it('unlocks abilities and Thunderhead range only once researched', () => {
    const nanoweave = abilityDef('nanoweave')!;
    const stim = abilityDef('stim')!;
    expect(abilityUnlocked(stim, { tier: 1, upgrades: [] })).toBe(true);
    expect(abilityUnlocked(nanoweave, { tier: 3, upgrades: [] })).toBe(false);
    expect(abilityUnlocked(nanoweave, { tier: 2, upgrades: ['nanoweave'] })).toBe(true);
    expect(artilleryTierOf({ upgrades: [] })).toBe(1);
    expect(artilleryTierOf({ upgrades: ['long_range_shells'] })).toBe(2);
    expect(artilleryTierOf({ upgrades: ['long_range_shells', 'guided_shells'] })).toBe(3);
    expect(UPGRADES.every(u => u.cost > 0 && u.compute > 0 && u.researchMs > 0)).toBe(true);
  });
});
