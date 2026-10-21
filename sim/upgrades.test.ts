import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { UNIT_STATS } from '../constants';
import { landShells } from './artillery';
import { createHeadlessMatch, stepMatch } from './headless';
import { createUnit } from './production';
import { UNIT_RULES } from './units';
import { createEconomy, Economy } from './economy';
import { applyOrderToStructures, orderEffects, OrdersContext } from './orders';
import { abilityDef, damageMultiplier, upgradeDamage } from './unitAbilities';
import {
  abilityUnlocked, addUpgrades, applyUpgradeBonuses, upgradesFor, upgradeLevelOf, type UpgradeId, advanceResearch, applyResearch, artilleryTierOf, researchBlocker, upgradeClasses, upgradeDef, UPGRADES,
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
    expect(classes.map(c => c.unitClass)).toEqual(['infantry', 'armor', 'air', 'support', 'builder', 'ordnance']);
    expect(classes[0].units).toEqual(['trooper', 'ghost', 'lancer']);
    // Every later-tier unit ability is an upgrade.
    for (const id of ['nanoweave', 'emp_rocket', 'overclock', 'radar', 'hellfire']) expect(upgradeDef(id)).toBeDefined();
  });

  it('gives every unit you can train two upgrades, a refit where there is no ability for it yet', () => {
    const trainable = (Object.keys(UNIT_RULES) as UnitData['type'][]).filter(t => UNIT_RULES[t].producer);
    for (const t of trainable) {
      const ups = upgradesFor(t);
      expect(ups.length, t).toBe(2);
      // Tier 2 first, never below the unit's own tier.
      expect(ups.every(u => u.tier >= UNIT_RULES[t].tier && u.tier >= 2), t).toBe(true);
      expect(ups[0].tier <= ups[1].tier, t).toBe(true);
    }
    expect(upgradesFor('trooper').map(u => u.id)).toEqual(['nanoweave', 'trooper_mk3']);
    expect(upgradesFor('lancer').map(u => u.id)).toEqual(['lancer_mk2', 'emp_rocket']);
    expect(upgradesFor('ballista').map(u => u.tier)).toEqual([3, 3]);
    // A refit unlocks no ability, but counts toward the bonus.
    expect(upgradeLevelOf({ upgrades: ['scout_car_mk2'] }, 'scout_car')).toBe(1);
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

describe('upgrade bonuses: +20% health and +15% damage per upgrade', () => {
  const unit = (id: string, type: UnitData['type'], team: UnitData['team'] = 'blue', patch: Partial<UnitData> = {}) =>
    ({ ...createUnit(type, team, id, { x: 0, z: 0 }), ...patch });
  const researched = (...upgrades: UpgradeId[]) => { const e = createEconomy(); e.blue = { ...e.blue, upgrades }; return e; };

  it('raises the health of every unit of the upgraded type, adding the extra to what it has', () => {
    const units = [unit('full', 'trooper'), unit('hurt', 'trooper', 'blue', { health: 50 }), unit('tank', 'tank'), unit('red', 'trooper', 'red')];
    const after = applyUpgradeBonuses(units, researched('nanoweave'));
    const by = (id: string) => after.find(u => u.id === id)!;
    expect(by('full')).toMatchObject({ upgradeLevel: 1, maxHealth: 120, health: 120 });
    expect(by('hurt')).toMatchObject({ maxHealth: 120, health: 70 });
    expect(by('tank')).toBe(units[2]);
    expect(by('red')).toBe(units[3]);
    // Already up to date: nothing changes.
    expect(applyUpgradeBonuses(after, researched('nanoweave'))).toBe(after);
  });

  it('stacks for each upgrade of the same unit', () => {
    expect(upgradeLevelOf(researched('long_range_shells', 'guided_shells', 'nanoweave').blue, 'howitzer')).toBe(2);
    const [howitzer] = applyUpgradeBonuses([unit('h', 'howitzer')], researched('long_range_shells', 'guided_shells'));
    expect(howitzer.maxHealth).toBe(Math.round(UNIT_STATS.howitzer.maxHealth * 1.4));
    expect(damageMultiplier(howitzer)).toBeCloseTo(1.3);
    expect(damageMultiplier(unit('t', 'trooper'))).toBe(1);
  });

  it('adds the damage bonus to the special weapons too', () => {
    const level = (n: number) => ({ upgradeLevel: n });
    expect(upgradeDamage(level(1))).toBeCloseTo(1.15);
    // A Thunderhead shell carries its gun's bonus to where it lands.
    const target = unit('t', 'trooper', 'red', { gridPos: { x: 0, z: 0 } });
    const shell = (power?: number) => ({ id: 's', team: 'blue' as const, attackerId: 'h', from: { x: 9, z: 0 }, at: { x: 0, z: 0 }, firedAt: 0, landsAt: 0, power });
    const plain = landShells([shell()], 1, [target], []).unitDamage.get('t')!;
    expect(landShells([shell(1.3)], 1, [target], []).unitDamage.get('t')).toBeCloseTo(plain * 1.3);
  });

  it('applies in a match once the research is done', () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    m.units.push(unit('tr', 'trooper', 'blue', { gridPos: { x: 6, z: 6 } }));
    m.economy = { ...m.economy, blue: { ...m.economy.blue, upgrades: ['nanoweave'] } };
    stepMatch(m);
    expect(m.units.find(u => u.id === 'tr')).toMatchObject({ upgradeLevel: 1, maxHealth: 120 });
  });
});
