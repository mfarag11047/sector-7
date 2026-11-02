import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtAt } from '../sim/districts';
import { RULERS, streetFurniture } from './streetFurniture';

const N = CITY_CONFIG.gridSize;
const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const pieces = streetFurniture(city.roadTiles, city.buildings, N);
const tallAt = new Set(city.buildings.filter(b => b.scale[1] >= RULERS.minHeight).map(b => `${b.gridX},${b.gridZ}`));

describe('everyday rulers', () => {
  it('stand on the pavement at the foot of tall buildings, facing the road, the same every time', () => {
    expect(streetFurniture(city.roadTiles, city.buildings, N)).toEqual(pieces);
    expect(pieces.length).toBeGreaterThan(40);
    for (const p of pieces) {
      // The tall building it stands in front of: one step from the road tile in the direction it faces away from.
      const road = { x: Math.round(p.x - Math.sin(p.turn) * -RULERS.out), z: Math.round(p.z - Math.cos(p.turn) * -RULERS.out) };
      const building = `${road.x - Math.round(Math.sin(p.turn))},${road.z - Math.round(Math.cos(p.turn))}`;
      expect(tallAt.has(building)).toBe(true);
    }
  });

  it('keep dumpsters out of the corporate districts, and put some at the centerpieces', () => {
    const kinds = new Set(pieces.map(p => p.kind));
    expect(kinds).toEqual(new Set(['bench', 'vending', 'dumpster', 'bollards']));
    for (const p of pieces.filter(p => p.kind === 'dumpster')) {
      const d = districtAt(Math.round(p.x - Math.sin(p.turn)), Math.round(p.z - Math.cos(p.turn)), N);
      expect(['core', 'downtown']).not.toContain(d);
    }
  });
});
