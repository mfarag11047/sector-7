import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtOfTile, groundOfTile } from './districtTheme';
import { corruptedBuildings, corruptedTiles } from './BlackwallCorruption';

const { gridSize, tileSize } = CITY_CONFIG;
const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });

describe('the fringe, corrupted by the Blackwall', () => {
  it('lays the fringe in concrete slabs', () => {
    for (const t of city.roadTiles.filter(t => t.type === 'open' && districtOfTile(t.x, t.z, gridSize) === 'fringe')) {
      expect(groundOfTile(t.x, t.z, gridSize)).toBe('slab');
    }
  });

  it('cracks about a quarter of its open slabs, the same on both sides of the map', () => {
    const cracks = corruptedTiles(city.roadTiles, gridSize);
    const open = city.roadTiles.filter(t => t.type === 'open' && districtOfTile(t.x, t.z, gridSize) === 'fringe');
    expect(cracks.length / open.length).toBeGreaterThan(0.15);
    expect(cracks.length / open.length).toBeLessThan(0.4);
    const at = new Set(cracks.map(c => `${c.x},${c.z}`));
    for (const c of cracks) expect(at.has(`${78 - c.x},${78 - c.z}`)).toBe(true);
  });

  it('corrupts every standing fringe building once, and lets go of it when it falls', () => {
    const shells = corruptedBuildings(city.buildings, gridSize);
    const fringe = new Set(city.buildings.filter(b => b.footprint && districtOfTile(b.gridX, b.gridZ, gridSize) === 'fringe').map(b => b.blockId));
    expect(fringe.size).toBeGreaterThan(50);
    expect(shells).toHaveLength(fringe.size);
    const one = city.buildings.find(b => b.footprint && districtOfTile(b.gridX, b.gridZ, gridSize) === 'fringe' && b.footprint.w * b.footprint.d === 1)!;
    const fallen = city.buildings.map(b => (b.id === one.id ? { ...b, destroyed: true } : b));
    expect(corruptedBuildings(fallen, gridSize)).toHaveLength(fringe.size - 1);
  });
});
