import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { StructureData, UnitData } from '../types';
import { AbilityCommand, AbilityContext, AbilityEffects, abilityEffects, AbilityView, applyUnitEffects } from './abilities';
import { addWarheads, createEconomy, warheadCost } from './economy';
import { UPGRADES, type UpgradeId } from './upgrades';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const titan = (patch: Partial<UnitData> = {}) =>
  unit('t', { type: 'tank', unitClass: 'armor', ...patch });
const fab = (patch: Partial<StructureData> = {}): StructureData => ({
  id: 'fab', type: 'ordnance_fab', team: 'blue', gridPos: { x: 5, z: 6 }, isBlueprint: false, constructionProgress: 0,
  maxProgress: 0, health: 400, maxHealth: 400, ...patch,
});

let ids = 0;
const ctx: AbilityContext = {
  now: 50_000, offset: 0, tileSize: 14,
  isWalkable: () => true,
  findPath: (_from, to) => [`${to.x},${to.z}`],
  findAirPath: (_from, to) => [`${to.x},${to.z}`],
  findAdjacentSpawn: c => ({ x: c.x + 1, z: c.z }),
  createCrawler: (host, at, suffix) => unit(`crawler-${suffix}`, { type: 'crawler_drone', unitClass: 'ordnance', team: host.team, gridPos: at, parentId: host.id }),
  random: () => 0.5,
  newId: prefix => `${prefix}-${++ids}`,
};
const view = (units: UnitData[], patch: Partial<AbilityView> = {}): AbilityView => ({ units, structures: [], economy: createEconomy(), ...patch });

function run(v: AbilityView, command: AbilityCommand, team: 'blue' | 'red' = 'blue') {
  const outcome = abilityEffects(v, team, command, ctx);
  if ('reason' in outcome) return { refused: outcome.reason };
  return { fx: outcome.effects, units: applyUnitEffects([...v.units], outcome.effects) };
}
const after = (r: { units?: UnitData[] }, id: string) => r.units!.find(u => u.id === id)!;

describe('who may give an order', () => {
  const smoke = (unitIds: string[]) => ({ type: 'UNIT_ABILITY' as const, unitIds, ability: 'smoke_screen' });
  const tier2 = { economy: { ...createEconomy(), blue: { ...createEconomy().blue, tier: 2 as const }, red: { ...createEconomy().red, tier: 2 as const } } };
  it("refuses the other team's units", () => {
    expect(run(view([titan()], tier2), smoke(['t']), 'red').refused).toBeTruthy();
  });

  it('refuses the wrong unit type', () => {
    expect(run(view([unit('g')], tier2), smoke(['g'])).refused).toBeTruthy();
  });

  it('refuses dead units', () => {
    expect(run(view([titan({ health: 0 })], tier2), smoke(['t'])).refused).toBeTruthy();
  });

  it('lays a Smoke Screen where the tank stands, for orbital-drop Titans too', () => {
    for (const type of ['tank', 'titan_dropped'] as const) {
      const r = abilityEffects(view([titan({ type })], tier2), 'blue', smoke(['t']), { now: 1000 } as AbilityContext);
      expect('effects' in r && r.effects.smoke).toEqual([expect.objectContaining({ team: 'blue', at: { x: 5, z: 5 }, laidAt: 1000 })]);
    }
  });
});

describe('Ballista and Field Fabricator', () => {
  const ballista = (patch: Partial<UnitData> = {}) => unit('b', { type: 'ballista', unitClass: 'support', missileInventory: { emp: 1, he: 1, wp: 0 }, ammoState: 'empty', ...patch });

  it('loads a missile from the inventory', () => {
    expect(after(run(view([ballista()]), { type: 'LOAD_AMMO', unitId: 'b', warhead: 'he' }), 'b'))
      .toMatchObject({ ammoState: 'loading', loadedAmmo: 'he', missileInventory: { emp: 1, he: 0, wp: 0 } });
  });

  it('will not load over an armed missile, which used to throw it away', () => {
    expect(run(view([ballista({ ammoState: 'armed', loadedAmmo: 'emp' })]), { type: 'LOAD_AMMO', unitId: 'b', warhead: 'he' }).refused).toBeTruthy();
  });

  it('fires only when armed', () => {
    expect(run(view([ballista()]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 30, z: 5 } }).refused).toBeTruthy();
    const r = run(view([ballista({ ammoState: 'armed', loadedAmmo: 'emp' })]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 30, z: 5 } });
    expect(r.fx!.spawnProjectiles[0]).toMatchObject({ trajectory: 'ballistic', payload: 'emp' });
    expect(after(r, 'b')).toMatchObject({ ammoState: 'empty', loadedAmmo: null });
  });

  it('reaches only half the map across, so it can\'t hit the far base from home', () => {
    // The Ballista stands at (5, 5).
    const armed = ballista({ ammoState: 'armed', loadedAmmo: 'he' });
    expect(run(view([armed]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 44, z: 5 } }).refused).toBeUndefined();
    expect(run(view([armed]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 46, z: 5 } }).refused).toMatch(/out of range \(39 tiles\)/);
    expect(run(view([armed]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 74, z: 74 } }).refused).toMatch(/out of range/);
  });

  it('draws from the stockpile only beside an Ordnance Fab', () => {
    const economy = addWarheads(createEconomy(), 'blue', 'emp');
    expect(run(view([ballista()], { economy }), { type: 'TAKE_WARHEAD', unitId: 'b', warhead: 'emp' }).refused).toMatch(/Fab/);
    const r = run(view([ballista()], { economy, structures: [fab()] }), { type: 'TAKE_WARHEAD', unitId: 'b', warhead: 'emp' });
    expect(r.fx!.economy!(economy)!.blue.stockpile.emp).toBe(0);
    expect(after(r, 'b').missileInventory).toEqual({ emp: 2, he: 1, wp: 0 });
  });

  it('charges cores to fabricate and refuses when broke', () => {
    const mule = unit('m', { type: 'mule', unitClass: 'ordnance', ordnanceMaterial: 2 });
    const r = run(view([mule]), { type: 'FABRICATE', unitId: 'm', warhead: 'he' });
    expect(r.fx!.economy!(createEconomy(1000))!.blue.cores).toBe(1000 - warheadCost('he'));
    expect(run(view([mule], { economy: createEconomy(0) }), { type: 'FABRICATE', unitId: 'm', warhead: 'he' }).refused).toMatch(/cores/);
  });
});

describe('Wasp swarm', () => {
  it('launches a volley, spends a charge and must reload', () => {
    const wasp = unit('w', { type: 'wasp', unitClass: 'air', charges: { swarm: 2 } });
    const r = run(view([wasp]), { type: 'FIRE_SWARM', unitId: 'w', target: { x: 10, z: 10 } });
    expect(r.fx!.spawnProjectiles).toHaveLength(ABILITY_CONFIG.WASP_MISSILES_PER_VOLLEY);
    expect(new Set(r.fx!.spawnProjectiles.map(p => p.id)).size).toBe(ABILITY_CONFIG.WASP_MISSILES_PER_VOLLEY);
    expect(run(view([after(r, 'w')]), { type: 'FIRE_SWARM', unitId: 'w', target: { x: 10, z: 10 } }).refused).toMatch(/reloading/);
  });
});

describe('links', () => {
  const banshee = (id: string, patch: Partial<UnitData> = {}) => unit(id, { type: 'banshee', unitClass: 'support', ...patch });
  const drone = unit('d', { type: 'drone', unitClass: 'air', gridPos: { x: 7, z: 5 } });

  it('tethers a friendly drone in range and takes it from any other Banshee', () => {
    const r = run(view([banshee('b1'), banshee('b2', { tetherTargetIds: ['d'] }), drone]), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: 'd' });
    expect(after(r, 'b1').tetherTargetIds).toEqual(['d']);
    expect(after(r, 'b2').tetherTargetIds).toEqual([]);
  });

  it('holds up to three drones, and lets one go when it is picked again', () => {
    const drones = ['d1', 'd2', 'd3', 'd4'].map((id, i) => unit(id, { type: i % 2 ? 'wasp' : 'drone', unitClass: 'air', gridPos: { x: 6 + i, z: 5 } }));
    let units: UnitData[] = [banshee('b1'), ...drones];
    for (const id of ['d1', 'd2', 'd3']) units = run(view(units), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: id }).units!;
    expect(units.find(u => u.id === 'b1')!.tetherTargetIds).toEqual(['d1', 'd2', 'd3']);
    expect(run(view(units), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: 'd4' }).refused).toMatch(/3 drones/);
    units = run(view(units), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: 'd2' }).units!;
    expect(units.find(u => u.id === 'b1')!.tetherTargetIds).toEqual(['d1', 'd3']);
    units = run(view(units), { type: 'DISCONNECT_TETHER', unitId: 'b1' }).units!;
    expect(units.find(u => u.id === 'b1')!.tetherTargetIds).toEqual([]);
  });

  it('only tethers remote-controlled units', () => {
    const tank = unit('t', { type: 'tank', unitClass: 'armor', gridPos: { x: 6, z: 5 } });
    expect(run(view([banshee('b1'), tank]), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: 't' }).refused).toMatch(/drone/);
  });

  it('will not tether out of range', () => {
    const far = { ...drone, gridPos: { x: 5 + ABILITY_CONFIG.BANSHEE_TETHER_RANGE + 1, z: 5 } };
    expect(run(view([banshee('b1'), far]), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: 'd' }).refused).toMatch(/range/);
  });

  it('links and unlinks a vehicle to an anchored Battery Mule', () => {
    const mule = unit('m', { type: 'sun_plate', unitClass: 'armor', isDeployed: true, batteryTetherIds: [] });
    const tank = titan({ gridPos: { x: 8, z: 5 } });
    const linked = run(view([mule, tank]), { type: 'BATTERY_LINK', unitId: 'm', targetUnitId: 't' });
    expect(after(linked, 'm').batteryTetherIds).toEqual(['t']);
    const unlinked = run(view(linked.units!), { type: 'BATTERY_LINK', unitId: 'm', targetUnitId: 't' });
    expect(after(unlinked, 'm').batteryTetherIds).toEqual([]);
    expect(run(view([{ ...mule, isDeployed: false }, tank]), { type: 'BATTERY_LINK', unitId: 'm', targetUnitId: 't' }).refused).toMatch(/anchor/);
  });
});

describe('Ghost and Swarm Host', () => {
  // The side at a given research tier.
  // ...with every upgrade of that tier researched, unless told otherwise.
  const atTier = (tier: 1 | 2 | 3, upgrades: UpgradeId[] = UPGRADES.filter(u => u.tier <= tier).map(u => u.id)) => { const economy = createEconomy(); economy.blue = { ...economy.blue, tier, upgrades }; return economy; };

  it('Phantom Decoy cloaks and scatters projections; ordering it again ends it', () => {
    const ghost = unit('g');
    const on = run(view([ghost], { economy: atTier(3) }), { type: 'PHANTOM_DECOY', unitId: 'g' });
    expect(after(on, 'g')).toMatchObject({ decoyActive: true, isStealthed: true });
    expect(on.fx!.spawnDecoys).toHaveLength(ABILITY_CONFIG.PHANTOM_DECOY_COUNT);
    const off = run(view(on.units!, { economy: atTier(3) }), { type: 'PHANTOM_DECOY', unitId: 'g' });
    expect(after(off, 'g')).toMatchObject({ decoyActive: false, isStealthed: false });
    expect(off.fx!.clearDecoysOf).toEqual(['g']);
  });

  it('an anchoring Swarm Host releases its opening crawlers', () => {
    const host = unit('h', { type: 'swarm_host', unitClass: 'ordnance' });
    const r = run(view([host]), { type: 'TOGGLE_ANCHOR', unitIds: ['h'] });
    expect(after(r, 'h').isAnchored).toBe(true);
    expect(r.units!.filter(u => u.type === 'crawler_drone')).toHaveLength(ABILITY_CONFIG.SWARM_HOST_INITIAL_DRONES);
  });

  it('toggles only the listed units the sender owns', () => {
    const r = run(view([unit('g1'), unit('g2'), unit('enemy', { team: 'red' })], { economy: atTier(2) }), { type: 'TOGGLE_DAMPENER', unitIds: ['g1', 'enemy'] });
    expect(after(r, 'g1').isDampenerActive).toBe(true);
    expect(after(r, 'g2').isDampenerActive).toBeFalsy();
    expect(after(r, 'enemy').isDampenerActive).toBeFalsy();
  });

  it('needs the Dampener and Phantom Decoy researched at Advanced Research', () => {
    expect(run(view([unit('g')], { economy: atTier(1) }), { type: 'TOGGLE_DAMPENER', unitIds: ['g'] }).refused).toMatch(/research/);
    expect(run(view([unit('g')], { economy: atTier(2, []) }), { type: 'TOGGLE_DAMPENER', unitIds: ['g'] }).refused).toMatch(/Advanced Research/);
    expect(run(view([unit('g')], { economy: atTier(2) }), { type: 'TOGGLE_DAMPENER', unitIds: ['g'] }).refused).toBeUndefined();
    expect(run(view([unit('g')], { economy: atTier(2) }), { type: 'PHANTOM_DECOY', unitId: 'g' }).refused).toMatch(/Advanced Research/);
    expect(run(view([unit('g')], { economy: atTier(3) }), { type: 'PHANTOM_DECOY', unitId: 'g' }).refused).toBeUndefined();
  });
});

it('applyUnitEffects leaves the roster untouched when there is nothing to do', () => {
  const units = [unit('a')];
  const empty: AbilityEffects = { updates: new Map(), spawnUnits: [], spawnDecoys: [], clearDecoysOf: [], spawnProjectiles: [] };
  expect(applyUnitEffects(units, empty)).toBe(units);
});
