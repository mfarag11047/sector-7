import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { baseMoves, specialistAbilities, specialistMoves, specialistPick, type AbilityContext2 } from './aiSpecialists';
import { createEconomy } from './economy';
import type { UpgradeId } from './upgrades';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team: 'red', gridPos: { x: 40, z: 40 }, path: [], visionRange: 4,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const structure = (id: string, type: StructureData['type'], patch: Partial<StructureData> = {}): StructureData => ({
  id, type, team: 'red', gridPos: { x: 70, z: 70 }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 900, maxHealth: 900, ...patch,
});
const random = () => 0;
const abilities = (patch: Partial<AbilityContext2>) => specialistAbilities({
  team: 'red', tier: 3, mode: 'attack', objective: { x: 30, z: 30 }, home: { x: 74, z: 74 }, mine: [], theirs: [],
  structures: [], economy: createEconomy(), attention: 1, random, ...patch,
});
const commands = (actions: { command: { type: string } }[]) => actions.map(a => a.command.type);

describe('computer opponent: what it trains', () => {
  const needs = { tier: 1 as const, mine: [] as UnitData[], structures: [] as StructureData[], army: 0, needInfantry: false, hard: false, random };
  it('a scout car from the HQ, Ghosts once Troopers are out, and a drone from the Airpad', () => {
    expect(specialistPick('hq', needs)).toBe('scout_car');
    expect(specialistPick('hq', { ...needs, mine: [unit('s', { type: 'scout_car' })] })).toBeNull();
    expect(specialistPick('infantry', needs)).toBe('ghost');
    expect(specialistPick('infantry', { ...needs, needInfantry: true })).toBeNull();
    expect(specialistPick('air', needs)).toBe('drone');
  });

  it('support, logistics and siege units as the army and tech grow', () => {
    const vehicles = Array.from({ length: 6 }, (_, i) => unit(`v${i}`, { type: 'tank', unitClass: 'armor' }));
    expect(specialistPick('armor', { ...needs, tier: 2, mine: vehicles })).toBe('sun_plate');
    expect(specialistPick('support', { ...needs, army: 12 })).toBe('helios');
    const helios = [unit('h1', { type: 'helios' }), unit('h2', { type: 'helios' })];
    expect(specialistPick('support', { ...needs, tier: 2, army: 12, mine: helios })).toBe('banshee');
    const fab = structure('fab', 'ordnance_fab');
    expect(specialistPick('support', { ...needs, tier: 3, army: 12, mine: [...helios, unit('b', { type: 'banshee' })], structures: [fab] })).toBe('ballista');
    expect(specialistPick('ordnance_fab', { ...needs, tier: 2, army: 8 })).toBe('swarm_host');
    expect(specialistPick('builder', needs)).toBe('mason');
  });
});

describe('computer opponent: abilities', () => {
  it('jams enemy drones with the Banshee, and switches the jammer off when there are none', () => {
    const banshee = unit('b', { type: 'banshee', unitClass: 'support' });
    const drone = unit('d', { type: 'drone', unitClass: 'air', team: 'blue', gridPos: { x: 43, z: 40 } });
    expect(commands(abilities({ mine: [banshee], theirs: [drone] }))).toContain('TOGGLE_JAMMER');
    expect(commands(abilities({ mine: [{ ...banshee, jammerActive: true }], theirs: [] }))).toContain('TOGGLE_JAMMER');
    expect(commands(abilities({ mine: [{ ...banshee, jammerActive: true }], theirs: [drone] }))).not.toContain('TOGGLE_JAMMER');
  });

  it('hardlines its own drones to the Banshee', () => {
    const banshee = unit('b', { type: 'banshee', unitClass: 'support' });
    const own = unit('d', { type: 'drone', unitClass: 'air', gridPos: { x: 42, z: 40 } });
    expect(commands(abilities({ mine: [banshee, own] }))).toContain('HARDLINE_TETHER');
  });

  it('puts the Helios on microwave when enemies are in reach, back on charge when they are gone', () => {
    const helios = unit('h', { type: 'helios', unitClass: 'support' });
    const enemy = unit('e', { team: 'blue', gridPos: { x: 41, z: 40 } });
    expect(abilities({ mine: [helios], theirs: [enemy] }).find(a => a.command.type === 'SET_HELIOS_MODE')?.command).toMatchObject({ mode: 'burn' });
    expect(abilities({ mine: [{ ...helios, heliosMode: 'burn' }], theirs: [] }).find(a => a.command.type === 'SET_HELIOS_MODE')?.command).toMatchObject({ mode: 'charge' });
  });

  it('runs the Ghost Dampener while the army moves, and Phantom Decoy when caught, once researched', () => {
    const researched = (...upgrades: UpgradeId[]) => { const e = createEconomy(); e.red = { ...e.red, upgrades }; return e; };
    const ghost = unit('g', { type: 'ghost' });
    expect(commands(abilities({ tier: 2, mine: [ghost] }))).not.toContain('TOGGLE_DAMPENER');
    expect(commands(abilities({ tier: 2, mine: [ghost], economy: researched('dampener') }))).toContain('TOGGLE_DAMPENER');
    const caught = { ...ghost, health: 30 };
    const enemy = [unit('e', { team: 'blue', gridPos: { x: 42, z: 40 } })];
    expect(commands(abilities({ tier: 3, mine: [caught], theirs: enemy }))).not.toContain('PHANTOM_DECOY');
    expect(commands(abilities({ tier: 3, mine: [caught], theirs: enemy, economy: researched('phantom_decoy') }))).toContain('PHANTOM_DECOY');
  });

  it('takes, loads and fires Ballista warheads', () => {
    const ballista = unit('bal', { type: 'ballista', unitClass: 'support', ammoState: 'empty' });
    const economy = createEconomy();
    economy.red = { ...economy.red, stockpile: { emp: 0, he: 1 } };
    expect(commands(abilities({ mine: [ballista], economy }))).toContain('TAKE_WARHEAD');
    expect(commands(abilities({ mine: [{ ...ballista, missileInventory: { emp: 0, he: 1 } }] }))).toContain('LOAD_AMMO');
    const cluster = [0, 1, 2, 3].map(i => unit(`e${i}`, { type: 'tank', unitClass: 'armor', team: 'blue', gridPos: { x: 20 + i, z: 20 }, health: 600, maxHealth: 600 }));
    const fired = abilities({ mine: [{ ...ballista, ammoState: 'armed', loadedAmmo: 'he' }], theirs: cluster }).find(a => a.command.type === 'FIRE_BALLISTA');
    expect(fired).toBeDefined();
  });

  it('sends Bombardment Drones against enemy production, not on top of its own army', () => {
    const bombard = unit('bm', { type: 'bombard', unitClass: 'air' });
    const factory = structure('f', 'armor', { team: 'blue', gridPos: { x: 10, z: 10 } });
    const strike = abilities({ mine: [bombard], structures: [factory] }).find(a => a.command.type === 'BOMBARD');
    expect(strike?.command).toMatchObject({ target: { x: 10, z: 10 } });
    expect(abilities({ mine: [bombard, unit('t', { gridPos: { x: 11, z: 10 } })], structures: [factory] }).find(a => a.command.type === 'BOMBARD')).toBeUndefined();
  });
});

describe('computer opponent: specialist movement and the base', () => {
  it('plants the Battery Mule at the staging point and keeps the scout car clear of enemies', () => {
    const sent: string[] = [];
    const mule = unit('m', { type: 'sun_plate', unitClass: 'armor', gridPos: { x: 50, z: 50 } });
    const scout = unit('s', { type: 'scout_car', unitClass: 'support', gridPos: { x: 30, z: 30 } });
    const actions = specialistMoves({
      team: 'red', tier: 2, mode: 'attack', objective: { x: 20, z: 20 }, staging: { x: 50, z: 50 }, gather: { x: 60, z: 60 }, home: { x: 74, z: 74 },
      mine: [mule, scout], theirs: [unit('e', { team: 'blue', gridPos: { x: 31, z: 31 } })], structures: [], buildings: [],
      bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, sentinels: [],
      send: (u, target) => sent.push(`${u.id}->${target.x},${target.z}`),
    });
    expect(actions.find(a => a.command.type === 'TOGGLE_ANCHOR')?.command).toMatchObject({ unitIds: ['m'] });
    // The scout car backs off home.
    expect(sent).toContain('s->60,60');
  });

  it('keeps the scout car out from under a Sentinel and back from the enemy base', () => {
    const scoutAt = (gridPos: { x: number; z: number }, objective: { x: number; z: number }, sentinels: { x: number; z: number }[], mode: 'gather' | 'attack' = 'attack') => {
      const sent: { x: number; z: number }[] = [];
      specialistMoves({
        team: 'red', tier: 1, mode, objective, staging: { x: 50, z: 50 }, gather: { x: 60, z: 60 }, home: { x: 74, z: 74 },
        mine: [unit('s', { type: 'scout_car', unitClass: 'support', gridPos })], theirs: [], structures: [], buildings: [],
        bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, sentinels, send: (_u, target) => sent.push(target),
      });
      return sent[0];
    };
    // Its watching spot beside a server node's Sentinel: it waits at the staging point instead.
    expect(scoutAt({ x: 50, z: 50 }, { x: 36, z: 36 }, [{ x: 39, z: 39 }])).toEqual({ x: 50, z: 50 });
    expect(scoutAt({ x: 50, z: 50 }, { x: 36, z: 36 }, [])).not.toEqual({ x: 50, z: 50 });
    // Nothing to do with the army: it watches the enemy base from well outside it.
    const watch = scoutAt({ x: 40, z: 40 }, { x: 60, z: 60 }, [], 'gather');
    expect(Math.hypot(watch.x - 4, watch.z - 4)).toBeGreaterThanOrEqual(13);
  });

  it('waits a while before replacing a lost scout car', () => {
    const needs = { tier: 1 as const, mine: [], structures: [], army: 0, needInfantry: false, hard: false, random: () => 0 };
    expect(specialistPick('hq', needs)).toBe('scout_car');
    expect(specialistPick('hq', { ...needs, scoutLostRecently: true })).toBeNull();
  });

  it('keeps warheads coming for its Ballista', () => {
    const r = baseMoves({
      team: 'red', tier: 3, cores: 3000, mine: [unit('bal', { type: 'ballista' })], theirs: [],
      structures: [structure('fab', 'ordnance_fab')], buildings: [], economy: createEconomy(),
      bases: { blue: { x: 4, z: 4 }, red: { x: 74, z: 74 } }, gather: { x: 60, z: 60 },
      canBuildOn: () => false, maxTurrets: 0, maxBases: 1, gridSize: 79, padsFull: false,
    });
    expect(commands(r.actions)).toContain('BUILD_WARHEAD');
    expect(r.spent).toBeGreaterThan(0);
  });
});

describe('BUILD_WARHEAD order', () => {
  it('starts a warhead at a finished Ordnance Fab, paid for, one at a time', async () => {
    const { orderEffects, applyOrderToStructures } = await import('./orders');
    const fab = structure('fab', 'ordnance_fab');
    const view = { units: [], structures: [fab], buildings: [], economy: createEconomy(2000) };
    const ctx = {} as never;
    const r = orderEffects(view, 'red', { type: 'BUILD_WARHEAD', structureId: 'fab', warhead: 'he' }, ctx);
    expect('effects' in r).toBe(true);
    if (!('effects' in r)) return;
    const after = applyOrderToStructures([fab], r.effects);
    expect(after[0].production).toMatchObject({ active: true, item: 'he' });
    expect(r.effects.economy!(view.economy)!.red.cores).toBeLessThan(2000);
    expect('reason' in orderEffects({ ...view, structures: after }, 'red', { type: 'BUILD_WARHEAD', structureId: 'fab', warhead: 'he' }, ctx)).toBe(true);
  });
});
