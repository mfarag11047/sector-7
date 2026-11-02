import { describe, expect, it } from 'vitest';
import type { BuildingData, RoadTileData } from '../types';
import { ABILITY_CONFIG } from '../constants';
import { LIGHT, lampLevels, lampStates, powerNetwork, streetLamps, streetsOf, wireRuns } from './powerGrid';

const building = (id: string, x: number, z: number, owner: BuildingData['owner'], type: BuildingData['type'] = 'residential'): BuildingData =>
  ({ id, gridX: x, gridZ: z, owner, type, destroyed: false, position: [0, 0, 0] } as unknown as BuildingData);

describe('power conduits', () => {
  it('join every building feeding the grid to a base along the streets, distance growing outward', () => {
    const net = powerNetwork([{ x: 0, z: 0 }], [{ x: 5, z: 0 }, { x: 5, z: 4 }, { x: 0, z: 9 }]);
    expect(net).toHaveLength(3);
    for (const c of net) {
      // Straight legs only, along x or z.
      for (let i = 0; i + 1 < c.points.length; i++) {
        const a = c.points[i], b = c.points[i + 1];
        expect(a.x === b.x || a.z === b.z).toBe(true);
        expect(b.d - a.d).toBeCloseTo(Math.abs(b.x - a.x) + Math.abs(b.z - a.z));
      }
    }
    // The far building hangs off the near one rather than running all the way back to the base.
    const far = net.find(c => c.points.at(-1)!.z === 4)!;
    expect(far.points[0]).toMatchObject({ x: 5, z: 0, d: 5 });
    expect(far.points.at(-1)!.d).toBe(9);
  });

  it('starts from every base a side has, and draws nothing without one', () => {
    const net = powerNetwork([{ x: 0, z: 0 }, { x: 40, z: 40 }], [{ x: 41, z: 40 }]);
    expect(net[0].points[0]).toMatchObject({ x: 40, z: 40, d: 0 });
    expect(powerNetwork([], [{ x: 1, z: 1 }])).toEqual([]);
  });
});

describe('power conduits along the streets', () => {
  it('run through the road tiles between the streets nearest each end', () => {
    // Roads: along z = 0 and along x = 10, an L; the base by the first, a building by the second.
    const tiles = [...Array.from({ length: 11 }, (_, x) => ({ x, z: 0, type: 'street' })), ...Array.from({ length: 10 }, (_, z) => ({ x: 10, z: z + 1, type: 'street' }))] as RoadTileData[];
    const streets = streetsOf(tiles, 20);
    const [c] = powerNetwork([{ x: 0, z: 1 }], [{ x: 11, z: 8 }], streets);
    // From the base onto the road, along it to the corner, up the second road, then off to the building.
    const corners = c.points.map(p => `${p.x},${p.z}`);
    expect(corners[0]).toBe('0,1');
    expect(corners).toContain('10,0');
    expect(corners.at(-1)).toBe('11,8');
    for (const p of c.points.slice(1, -1)) expect(streets.isRoad(p.x, p.z)).toBe(true);
    // Distance runs on along the way.
    expect(c.points.at(-1)!.d).toBe(1 + 10 + 8 + 1);
  });
});

describe('the wires', () => {
  it('run from the base over the posts along the way, in order, to the building', () => {
    const tiles = [...Array.from({ length: 11 }, (_, x) => ({ x, z: 0, type: 'street' })), ...Array.from({ length: 10 }, (_, z) => ({ x: 10, z: z + 1, type: 'street' }))] as RoadTileData[];
    const lamps = streetLamps(tiles, 20);
    const net = powerNetwork([{ x: 0, z: 1 }], [{ x: 11, z: 8 }], streetsOf(tiles, 20));
    const [run] = wireRuns(net, lamps);
    expect(run.startIsBase).toBe(true);
    expect(run.end).toEqual({ x: 11, z: 8 });
    // Every lamp on the way, first along the first street then up the second, none twice.
    const seq = run.poles.map(i => lamps[i]);
    expect(seq.length).toBeGreaterThan(5);
    expect(new Set(run.poles).size).toBe(run.poles.length);
    const along = seq.filter(l => l.z === 0).map(l => l.x);
    expect(along).toEqual([...along].sort((a, b) => a - b));
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
      // All on one side of the street, so the wires between them run straight.
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
