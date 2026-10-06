import { describe, expect, it } from 'vitest';
import { ABILITY_CONFIG } from '../constants';
import type { StructureData, UnitData } from '../types';
import { AbilityCommand, AbilityContext, AbilityEffects, abilityEffects, AbilityView, applyUnitEffects } from './abilities';
import { addWarheads, createEconomy, warheadCost } from './economy';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'ghost', unitClass: 'infantry', team: 'blue', gridPos: { x: 5, z: 5 }, path: [], visionRange: 3,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const titan = (patch: Partial<UnitData> = {}) =>
  unit('t', { type: 'tank', unitClass: 'armor', charges: { smoke: 2, aps: 1 }, ...patch });
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
  it("refuses the other team's units", () => {
    expect(run(view([titan()]), { type: 'SMOKE_SCREEN', unitIds: ['t'] }, 'red').refused).toBeTruthy();
  });

  it('refuses the wrong unit type, which the old handlers allowed for the cannon', () => {
    expect(run(view([unit('g')]), { type: 'CANNON_FIRE', unitId: 'g', target: { x: 9, z: 5 } }).refused).toMatch(/cannot/);
  });

  it('refuses dead units', () => {
    expect(run(view([titan({ health: 0 })]), { type: 'SMOKE_SCREEN', unitIds: ['t'] }).refused).toBeTruthy();
  });
});

describe('Titan countermeasures', () => {
  it('spend a charge, start the cooldown and switch on', () => {
    const r = run(view([titan()]), { type: 'SMOKE_SCREEN', unitIds: ['t'] });
    expect(after(r, 't')).toMatchObject({
      charges: { smoke: 1, aps: 1 },
      cooldowns: { titanSmoke: ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN },
      smoke: { active: true, remainingTime: ABILITY_CONFIG.TITAN_SMOKE_DURATION },
    });
  });

  it('are refused while cooling down or out of charges', () => {
    expect(run(view([titan({ cooldowns: { titanSmoke: 1000 } })]), { type: 'SMOKE_SCREEN', unitIds: ['t'] }).refused).toMatch(/recharging/);
    expect(run(view([titan({ charges: { smoke: 0, aps: 1 } })]), { type: 'SMOKE_SCREEN', unitIds: ['t'] }).refused).toMatch(/charges/);
  });

  it('work for orbital-drop Titans too', () => {
    const dropped = titan({ type: 'titan_dropped', charges: { smoke: 3, aps: 2 } });
    expect(after(run(view([dropped]), { type: 'ACTIVATE_APS', unitIds: ['t'] }), 't').aps?.active).toBe(true);
  });
});

describe('Titan cannon', () => {
  it('fires a shell, pays battery and starts reloading', () => {
    const r = run(view([titan()]), { type: 'CANNON_FIRE', unitId: 't', target: { x: 9, z: 5 } });
    expect(r.fx!.spawnProjectiles).toHaveLength(1);
    expect(r.fx!.spawnProjectiles[0].velocity.x).toBeCloseTo(ABILITY_CONFIG.TITAN_CANNON_SPEED);
    expect(after(r, 't')).toMatchObject({ battery: 100 - ABILITY_CONFIG.TITAN_CANNON_COST, cooldowns: { mainCannon: ABILITY_CONFIG.TITAN_CANNON_COOLDOWN } });
  });

  it('cannot fire again while reloading', () => {
    expect(run(view([titan({ cooldowns: { mainCannon: 500 } })]), { type: 'CANNON_FIRE', unitId: 't', target: { x: 9, z: 5 } }).refused).toMatch(/reloading/);
  });
});

describe('Ballista and Field Fabricator', () => {
  const ballista = (patch: Partial<UnitData> = {}) => unit('b', { type: 'ballista', unitClass: 'support', missileInventory: { eclipse: 1, he: 1 }, ammoState: 'empty', ...patch });

  it('loads a missile from the inventory', () => {
    expect(after(run(view([ballista()]), { type: 'LOAD_AMMO', unitId: 'b', warhead: 'he' }), 'b'))
      .toMatchObject({ ammoState: 'loading', loadedAmmo: 'he', missileInventory: { eclipse: 1, he: 0 } });
  });

  it('will not load over an armed missile, which used to throw it away', () => {
    expect(run(view([ballista({ ammoState: 'armed', loadedAmmo: 'eclipse' })]), { type: 'LOAD_AMMO', unitId: 'b', warhead: 'he' }).refused).toBeTruthy();
  });

  it('fires only when armed', () => {
    expect(run(view([ballista()]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 30, z: 5 } }).refused).toBeTruthy();
    const r = run(view([ballista({ ammoState: 'armed', loadedAmmo: 'eclipse' })]), { type: 'FIRE_BALLISTA', unitId: 'b', target: { x: 30, z: 5 } });
    expect(r.fx!.spawnProjectiles[0]).toMatchObject({ trajectory: 'ballistic', payload: 'eclipse' });
    expect(after(r, 'b')).toMatchObject({ ammoState: 'empty', loadedAmmo: null });
  });

  it('draws from the stockpile only beside an Ordnance Fab', () => {
    const economy = addWarheads(createEconomy(), 'blue', 'eclipse');
    expect(run(view([ballista()], { economy }), { type: 'TAKE_WARHEAD', unitId: 'b', warhead: 'eclipse' }).refused).toMatch(/Fab/);
    const r = run(view([ballista()], { economy, structures: [fab()] }), { type: 'TAKE_WARHEAD', unitId: 'b', warhead: 'eclipse' });
    expect(r.fx!.economy!(economy)!.blue.stockpile.eclipse).toBe(0);
    expect(after(r, 'b').missileInventory).toEqual({ eclipse: 2, he: 1 });
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
    const r = run(view([banshee('b1'), banshee('b2', { tetherTargetId: 'd' }), drone]), { type: 'HARDLINE_TETHER', unitId: 'b1', targetUnitId: 'd' });
    expect(after(r, 'b1').tetherTargetId).toBe('d');
    expect(after(r, 'b2').tetherTargetId).toBeNull();
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
  it('Phantom Decoy cloaks and scatters projections; ordering it again ends it', () => {
    const ghost = unit('g');
    const on = run(view([ghost]), { type: 'PHANTOM_DECOY', unitId: 'g' });
    expect(after(on, 'g')).toMatchObject({ decoyActive: true, isStealthed: true });
    expect(on.fx!.spawnDecoys).toHaveLength(ABILITY_CONFIG.PHANTOM_DECOY_COUNT);
    const off = run(view(on.units!), { type: 'PHANTOM_DECOY', unitId: 'g' });
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
    const r = run(view([unit('g1'), unit('g2'), unit('enemy', { team: 'red' })]), { type: 'TOGGLE_DAMPENER', unitIds: ['g1', 'enemy'] });
    expect(after(r, 'g1').isDampenerActive).toBe(true);
    expect(after(r, 'g2').isDampenerActive).toBeFalsy();
    expect(after(r, 'enemy').isDampenerActive).toBeFalsy();
  });
});

it('applyUnitEffects leaves the roster untouched when there is nothing to do', () => {
  const units = [unit('a')];
  const empty: AbilityEffects = { updates: new Map(), spawnUnits: [], spawnDecoys: [], clearDecoysOf: [], spawnProjectiles: [] };
  expect(applyUnitEffects(units, empty)).toBe(units);
});
