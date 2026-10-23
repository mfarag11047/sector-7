import { describe, expect, it } from 'vitest';
import type { DoctrineType, StructureData, UnitData } from '../types';
import { createEconomy, Economy } from './economy';
import { applyOrderToStructures, orderEffects, OrdersContext, OrdersView } from './orders';
import { createUnit } from './production';
import { HEROES, heroBlocker } from './heroes';
import { applyUpgradeBonuses, researchBlocker, upgradeClasses, upgradeLevelOf, upgradesFor, type UpgradeId } from './upgrades';

const lab = (patch: Partial<StructureData> = {}): StructureData => ({
  id: 'lab', type: 'research_lab', team: 'blue', gridPos: { x: 7, z: 4 }, isBlueprint: false, constructionProgress: 100,
  maxProgress: 100, health: 800, maxHealth: 800, ...patch,
});
const econ = (tier: 1 | 2 | 3, upgrades: UpgradeId[] = []): Economy => {
  const e = createEconomy(3000);
  e.blue = { ...e.blue, tier, compute: 500, upgrades };
  return e;
};
const ctx = {} as OrdersContext;
const view = (economy: Economy, patch: Partial<OrdersView> = {}): OrdersView => ({
  units: [], structures: [lab()], buildings: [], economy, unlimitedPop: true, doctrines: { blue: 'heavy_metal', red: 'netrunner' }, ...patch,
});
const train = (v: OrdersView, unitType: UnitData['type']) => {
  const o = orderEffects(v, 'blue', { type: 'TRAIN_UNIT', structureId: 'lab', unitType }, ctx);
  return 'reason' in o ? o.reason : null;
};
const study = (v: OrdersView, upgrade: UpgradeId) => {
  const o = orderEffects(v, 'blue', { type: 'RESEARCH_UPGRADE', structureId: 'lab', upgrade }, ctx);
  return 'reason' in o ? o.reason : null;
};

describe('doctrine heroes', () => {
  it('gives each doctrine its own hero, with an unlock and two refits up to Tier 3', () => {
    for (const d of Object.keys(HEROES) as DoctrineType[]) {
      const ups = upgradesFor(HEROES[d].unit);
      expect(ups.map(u => u.id)).toEqual([`hero_${d}_unlock`, `hero_${d}_mk2`, `hero_${d}_mk3`]);
      expect(ups.map(u => u.tier)).toEqual([1, 2, 3]);
      expect(ups.every(u => u.doctrine === d)).toBe(true);
    }
    // Not listed with the ordinary unit classes.
    expect(upgradeClasses().flatMap(c => c.units).some(u => u.startsWith('hero_'))).toBe(false);
  });

  it('can only be researched by a side with that doctrine', () => {
    const e = econ(1);
    expect(researchBlocker(e, 'blue', [], 'hero_heavy_metal_unlock', 'heavy_metal')).toBeNull();
    expect(researchBlocker(e, 'blue', [], 'hero_netrunner_unlock', 'heavy_metal')).toMatch(/own doctrine/);
    expect(researchBlocker(e, 'blue', [], 'hero_heavy_metal_unlock', null)).toMatch(/own doctrine/);
    expect(study(view(e), 'hero_heavy_metal_unlock')).toBeNull();
    expect(study(view(e), 'hero_shadow_ops_unlock')).toMatch(/own doctrine/);
  });

  it('refits in order, Mk II at Tier 2 and Mk III at Tier 3', () => {
    expect(study(view(econ(1, ['hero_heavy_metal_unlock'])), 'hero_heavy_metal_mk2')).toMatch(/Tier 2/);
    expect(study(view(econ(2)), 'hero_heavy_metal_mk2')).toMatch(/Unlock first/);
    expect(study(view(econ(2, ['hero_heavy_metal_unlock'])), 'hero_heavy_metal_mk2')).toBeNull();
    expect(study(view(econ(3, ['hero_heavy_metal_unlock'])), 'hero_heavy_metal_mk3')).toMatch(/Mk II first/);
    expect(study(view(econ(3, ['hero_heavy_metal_unlock', 'hero_heavy_metal_mk2'])), 'hero_heavy_metal_mk3')).toBeNull();
  });

  it('is trained at Advanced Research once unlocked, only for its own doctrine', () => {
    expect(train(view(econ(1)), 'hero_heavy_metal')).toMatch(/unlock it/);
    const unlocked = view(econ(1, ['hero_heavy_metal_unlock']));
    expect(train(unlocked, 'hero_heavy_metal')).toBeNull();
    expect(train(view(econ(1, ['hero_heavy_metal_unlock'])), 'hero_netrunner')).toMatch(/own doctrine/);
    // Without a doctrine, no hero at all.
    expect(train(view(econ(1, ['hero_heavy_metal_unlock']), { doctrines: {} }), 'hero_heavy_metal')).toMatch(/own doctrine/);
  });

  it('allows one hero at a time, alive or in training', () => {
    const e = econ(1, ['hero_heavy_metal_unlock']);
    const v = view(e);
    const o = orderEffects(v, 'blue', { type: 'TRAIN_UNIT', structureId: 'lab', unitType: 'hero_heavy_metal' }, ctx);
    if ('reason' in o) throw new Error(o.reason);
    const queued = applyOrderToStructures([...v.structures], o.effects);
    expect(train(view(e, { structures: queued }), 'hero_heavy_metal')).toMatch(/one hero/);
    const hero = createUnit('hero_heavy_metal', 'blue', 'h1', { x: 5, z: 5 });
    expect(train(view(e, { units: [hero] }), 'hero_heavy_metal')).toMatch(/one hero/);
    // Once it falls, another can be trained.
    expect(train(view(e, { units: [{ ...hero, health: 0 }] }), 'hero_heavy_metal')).toBeNull();
    // The other side's hero doesn't count.
    expect(heroBlocker('hero_heavy_metal', 'blue', 'heavy_metal', e.blue.upgrades, [{ ...hero, team: 'red' }], [])).toBeNull();
  });

  it('gets the upgrade bonus from its refits, not from the unlock', () => {
    expect(upgradeLevelOf({ upgrades: ['hero_shadow_ops_unlock'] }, 'hero_shadow_ops')).toBe(0);
    expect(upgradeLevelOf({ upgrades: ['hero_shadow_ops_unlock', 'hero_shadow_ops_mk2', 'hero_shadow_ops_mk3'] }, 'hero_shadow_ops')).toBe(2);
    const e = createEconomy(0);
    e.blue = { ...e.blue, upgrades: ['hero_shadow_ops_unlock', 'hero_shadow_ops_mk2'] };
    const hero = createUnit('hero_shadow_ops', 'blue', 'h1', { x: 5, z: 5 });
    const [up] = applyUpgradeBonuses([hero], e);
    expect(up.upgradeLevel).toBe(1);
    expect(up.maxHealth).toBeGreaterThan(hero.maxHealth);
  });
});
