import { describe, expect, it } from 'vitest';
import type { BuildingData, RoadTileData } from '../types';
import { ABILITY_CONFIG } from '../constants';
import { gridRoadLines, LIGHT, lampLevels, lampStates, streetLamps } from './powerGridPlan';

const building = (id: string, x: number, z: number, owner: BuildingData['owner'], type: BuildingData['type'] = 'residential'): BuildingData =>
  ({ id, gridX: x, gridZ: z, owner, type, destroyed: false, position: [0, 0, 0] } as unknown as BuildingData);

describe('grid lines on the streets', () => {
  // A street along z = 0 from x = 0 to 39.
  const tiles = Array.from({ length: 40 }, (_, x) => ({ x, z: 0, type: 'street' })) as RoadTileData[];

  it("run along the road as far as a side's power reaches and stop there, one line per street, none inside the base", () => {
    // Vanta's HQ at x = 0 powers 6 tiles round it; a building captured at x = 20 four more each way.
    const lines = gridRoadLines(tiles, 40, [building('b', 20, 1, 'blue')], { blue: [{ x: 0, z: 1 }], red: [] });
    const runs = lines.map(l => [l.team, l.points[0].x, l.points[1].x]);
    expect(runs).toContainEqual(['blue', 17, 23]);
    // Nothing past the edge of the grid, nothing in the base's own circle, and only along the road:
    // one line, not one per building.
    expect(lines).toHaveLength(1);
    // A building captured next to the base: its line runs in to the base's edge and stops there.
    const near = gridRoadLines(tiles, 40, [building('n', 9, 1, 'blue')], { blue: [{ x: 0, z: 1 }], red: [] });
    expect(near.map(l => [l.points[0].x, l.points[1].x])).toEqual([[6, 12]]);
    // Distance from the HQ grows along a line, so its pulses run outward.
    const far = lines.find(l => l.points[0].x === 17)!;
    expect(far.points[1].d).toBeGreaterThan(far.points[0].d);
  });

  it("give a street both sides' grids reach to the side whose HQ is nearer, and leave blacked-out stretches dark", () => {
    const bases = { blue: [{ x: 0, z: 1 }], red: [{ x: 39, z: 1 }] };
    const both = [building('b', 20, 1, 'blue'), building('r', 22, 1, 'red')];
    const lines = gridRoadLines(tiles, 40, both, bases);
    const owner = (x: number) => lines.find(l => l.points[0].x <= x && x <= l.points[1].x)?.team;
    expect(owner(17)).toBe('blue');
    expect(owner(25)).toBe('red');
    // An enemy EMP over Vanta's HQ cuts its line there.
    const dark = gridRoadLines(tiles, 40, both, bases, [{ gridPos: { x: 2, z: 0 }, radius: 10, team: 'red' }]);
    expect(dark.some(l => l.team === 'blue' && l.points[0].x <= 3)).toBe(false);
  });
});

describe('streetlights', () => {
  // A road along z = 5 from x = 0 to 9, lots either side.
  const tiles = Array.from({ length: 10 }, (_, x) => ({ x, z: 5, type: 'street' })) as RoadTileData[];

  it('stand on every other street tile, at an edge facing a lot', () => {
    const lamps = streetLamps(tiles, 20);
    expect(lamps).toHaveLength(5);
    for (const l of lamps) {
      expect((l.x + l.z) % 2).toBe(0);
      // All on one side of the street, in a line.
      expect(l.side).toBe('n');
    }
  });

  it('are lit inside a grid, brightest by the HQ, dark outside it or in an EMP blackout', () => {
    const lamps = [{ x: 1, z: 0, side: 'n' as const }, { x: 30, z: 0, side: 'n' as const }, { x: 60, z: 0, side: 'n' as const }];
    const bases = { blue: [{ x: 0, z: 0 }], red: [] };
    // A building captured out at x = 30 carries the grid there; nothing at x = 60.
    const owned = [building('b', 30, 1, 'blue'), building('c', 60, 1, 'blue', 'core_node')];
    const [near, out, none] = lampLevels(lamps, owned, bases);
    // Whose they are, for the indicator on top: the powered ones Vanta's, the dark one nobody's.
    expect(lampStates(lamps, owned, bases).map(s => s.team)).toEqual(['blue', 'blue', null]);
    // Where both sides' grids reach, the one whose HQ is nearer holds the lamp.
    expect(lampStates([{ x: 30, z: 0, side: 'n' }], [building('b', 30, 1, 'blue'), building('r', 31, 0, 'red')], { blue: [{ x: 0, z: 0 }], red: [{ x: 40, z: 0 }] })[0].team).toBe('red');
    expect(near).toBeGreaterThan(0.9);
    expect(out).toBeCloseTo(LIGHT.least);
    // A core node doesn't feed the grid.
    expect(none).toBe(0);
    // An enemy EMP over the HQ puts its lights out; the side's own doesn't.
    expect(lampLevels(lamps, owned, bases, [{ gridPos: { x: 0, z: 0 }, radius: 3, team: 'red' }])[0]).toBe(0);
    expect(lampLevels(lamps, owned, bases, [{ gridPos: { x: 0, z: 0 }, radius: 3, team: 'blue' }])[0]).toBeGreaterThan(0);
    expect(ABILITY_CONFIG.ENERGY_GRID_BUILDING_RADIUS).toBeGreaterThanOrEqual(1);
  });
});
