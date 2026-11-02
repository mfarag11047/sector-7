import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtAt } from '../sim/districts';
import { estateGrounds, GROUNDS } from './estateGrounds';

const N = CITY_CONFIG.gridSize, last = N - 1;
const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const g = estateGrounds(city.roadTiles, city.buildings, N);
const near = (x: number, z: number) => [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => districtAt(Math.round(x) + dx, Math.round(z) + dz, N) === 'estates'));

describe('the estates\' grounds', () => {
  it('fill both estates the same, turned round, with palms, hedges and pools', () => {
    expect(g.palms.length).toBeGreaterThan(40);
    expect(g.hedges.length).toBeGreaterThan(20);
    expect(g.pools.length).toBeGreaterThan(4);
    const key = (x: number, z: number) => `${x.toFixed(3)},${z.toFixed(3)}`;
    const palms = new Set(g.palms.map(p => key(p.x, p.z)));
    for (const p of g.palms) expect(palms.has(key(last - p.x, last - p.z))).toBe(true);
    const pools = new Set(g.pools.map(p => key(p.x, p.z)));
    for (const p of g.pools) expect(pools.has(key(last - p.x, last - p.z))).toBe(true);
  });

  it('stay in the estates and clear of the core nodes', () => {
    const nodes = city.buildings.filter(b => b.type === 'core_node');
    for (const p of [...g.palms, ...g.pools, ...g.hedges]) {
      expect(near(p.x, p.z)).toBe(true);
      for (const n of nodes) expect(Math.max(Math.abs(n.gridX - p.x), Math.abs(n.gridZ - p.z))).toBeGreaterThan(GROUNDS.nodeClear - 0.5);
    }
  });
});
