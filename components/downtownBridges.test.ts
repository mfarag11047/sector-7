import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { downtownBridges } from './DowntownBridges';

const city = generateCity({ gridSize: CITY_CONFIG.gridSize, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const roads = new Set(city.roadTiles.filter(t => t.type !== 'open').map(t => `${t.x},${t.z}`));

describe('downtown sky-bridges', () => {
  it('spans a road between two towers, high up, each with a twin across the map', () => {
    const bridges = downtownBridges(city.buildings, CITY_CONFIG.gridSize);
    expect(bridges).toHaveLength(8);
    for (const b of bridges) {
      const under = b.alongX ? `${b.x},${Math.round(b.z)}` : `${Math.round(b.x)},${b.z}`;
      expect(roads.has(under), under).toBe(true);
      expect(b.y).toBeGreaterThan(25);
      expect(bridges.some(t => t.x === 78 - b.x && t.z === 78 - b.z && t.alongX === b.alongX)).toBe(true);
    }
  });
});
