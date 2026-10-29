import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import type { StructureData, UnitData } from '../types';
import { expansionPlan, type ExpansionView } from './aiExpansion';
import { baseMoves } from './aiSpecialists';
import { lotOf } from './bases';
import { createEconomy, setCompute } from './economy';
import { generateCity } from './mapgen';
import { createUnit } from './production';

const N = CITY_CONFIG.gridSize;
const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const hq = (team: 'blue' | 'red'): StructureData => ({
  id: `hq-${team}`, type: 'hq', team, gridPos: { ...TEAM_BASES[team] }, isBlueprint: false, constructionProgress: 0, maxProgress: 0, health: 5000, maxHealth: 5000,
});
const view = (patch: Partial<ExpansionView> = {}): ExpansionView => ({
  team: 'red', tier: 3, padsFull: false, maxBases: 2, home: TEAM_BASES.red, enemyHome: TEAM_BASES.blue,
  mine: [], theirs: [], structures: [hq('blue'), hq('red')], buildings: city.buildings, ...patch,
});
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const sameLot = (a: { x: number; z: number }, x: number, z: number) => { const l = lotOf(a.x, a.z), m = lotOf(x, z); return l.ix === m.ix && l.iz === m.iz; };
const levelled = (at: { x: number; z: number }) => city.buildings.map(b => sameLot(at, b.gridX, b.gridZ) ? { ...b, destroyed: true, health: 0 } : b);

describe('the computer opening new bases', () => {
  it('wants one at Tier 3, or at Tier 2 with its pads full, while it holds fewer HQs than allowed', () => {
    expect(expansionPlan(view({ tier: 2 })).wants).toBe(false);
    expect(expansionPlan(view({ tier: 2, padsFull: true })).wants).toBe(true);
    expect(expansionPlan(view()).wants).toBe(true);
    expect(expansionPlan(view({ maxBases: 1 })).wants).toBe(false);
  });

  it('with nowhere to build, picks a city block on its own side to level, not a node block', () => {
    const plan = expansionPlan(view());
    expect(plan.sites).toEqual([]);
    expect(plan.level).not.toBeNull();
    const at = plan.level!;
    expect(dist(at, TEAM_BASES.red)).toBeLessThan(dist(at, TEAM_BASES.blue));
    const lot = city.buildings.filter(b => sameLot(at, b.gridX, b.gridZ));
    expect(lot.length).toBeGreaterThan(0);
    expect(lot.some(b => b.type === 'core_node' || b.type === 'server_node')).toBe(false);
    // Nor one a road runs through, which would never be a site.
    expect(lot.some(b => b.splitLot)).toBe(false);
    // The same block think after think, however much of it is down.
    const half = city.buildings.map((b, i) => sameLot(at, b.gridX, b.gridZ) && i % 2 === 0 ? { ...b, destroyed: true, health: 0 } : b);
    expect(expansionPlan(view({ buildings: half })).level).toEqual(at);
  });

  it('passes over a block with enemies close or its own units under the blast', () => {
    const at = expansionPlan(view()).level!;
    const enemy: UnitData = createUnit('tank', 'blue', 'e', { x: at.x + 2, z: at.z });
    expect(expansionPlan(view({ theirs: [enemy] })).level).not.toEqual(at);
    const own: UnitData = createUnit('trooper', 'red', 'o', { x: at.x, z: at.z + 1 });
    expect(expansionPlan(view({ mine: [own] })).level).not.toEqual(at);
  });

  it('once the block is down, builds there: a unit goes to stand by it, then it founds the base', () => {
    const at = expansionPlan(view()).level!;
    const buildings = levelled(at);
    const plan = expansionPlan(view({ buildings }));
    expect(plan.level).toBeNull();
    expect(plan.sites[0].at).toEqual(at);
    const sent: string[] = [];
    const scout = createUnit('scout_car', 'red', 'sc', { x: TEAM_BASES.red.x, z: TEAM_BASES.red.z - 25 });
    const base = (mine: UnitData[]) => baseMoves({
      team: 'red', tier: 3, cores: 5000, mine, theirs: [], structures: [hq('blue'), hq('red')], buildings, economy: setCompute(createEconomy(5000), 'red', 500),
      bases: TEAM_BASES, gather: TEAM_BASES.red, canBuildOn: () => false, maxTurrets: 0, gridSize: N, expansion: plan,
      send: (u, target) => sent.push(`${u.id}->${target.x},${target.z}`),
    });
    expect(base([scout]).actions.some(a => a.command.type === 'BUILD_BASE')).toBe(false);
    expect(sent).toEqual([`sc->${at.x},${at.z}`]);
    const there = base([{ ...scout, gridPos: { x: at.x + 2, z: at.z } }]);
    expect(there.actions.find(a => a.command.type === 'BUILD_BASE')?.command).toMatchObject({ at });
  });
});
