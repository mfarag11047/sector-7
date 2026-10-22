import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from './mapgen';
import { sandboxRoster, sandboxStructures } from './match';
import { STRUCTURE_RULES } from './units';

describe('sandbox start', () => {
  const { gridSize, tileSize } = CITY_CONFIG;
  const structures = sandboxStructures(gridSize);
  const buildable = Object.entries(STRUCTURE_RULES).filter(([, r]) => r.buildable).map(([t]) => t).sort();

  it('gives each side one of every base building, finished', () => {
    for (const team of ['blue', 'red'] as const) {
      const own = structures.filter(s => s.team === team);
      expect(own.map(s => s.type).sort()).toEqual(buildable);
      for (const s of own) expect(s.isBlueprint || (s.buildRemainingMs || 0) > 0).toBe(false);
    }
  });

  it('puts them on free ground: off the HQ pad, the starting units and the city', () => {
    const units = sandboxRoster(gridSize);
    const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
    const taken = new Set([...units.map(u => `${u.gridPos.x},${u.gridPos.z}`), ...city.buildings.map(b => `${b.gridX},${b.gridZ}`)]);
    for (const s of structures) {
      const base = TEAM_BASES[s.team as 'blue' | 'red'];
      expect(Math.abs(s.gridPos.x - base.x) <= 1 && Math.abs(s.gridPos.z - base.z) <= 1, s.id).toBe(false);
      expect(taken.has(`${s.gridPos.x},${s.gridPos.z}`), s.id).toBe(false);
      expect(city.roadTileSet.has(`${s.gridPos.x},${s.gridPos.z}`), s.id).toBe(true);
    }
    expect(new Set(structures.map(s => `${s.gridPos.x},${s.gridPos.z}`)).size).toBe(structures.length);
  });
});
