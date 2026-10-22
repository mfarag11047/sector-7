import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { districtOfTile, groundOfTile } from './districtTheme';
import { downtownLayout } from './DowntownDressing';

const { gridSize, tileSize } = CITY_CONFIG;
const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const layout = downtownLayout(city.roadTiles, city.buildings, gridSize);
const key = (e: { x: number; z: number; side: string }) => `${e.x},${e.z},${e.side}`;
const turn = { n: 's', s: 'n', e: 'w', w: 'e' } as const;

describe('downtown dressing', () => {
  it('paves downtown in granite along the streets round plaza stone', () => {
    const open = city.roadTiles.filter(t => t.type === 'open' && districtOfTile(t.x, t.z, gridSize) === 'downtown');
    const styles = new Set(open.map(t => groundOfTile(t.x, t.z, gridSize)));
    expect(styles).toEqual(new Set(['granite', 'plazaStone']));
  });

  it('lights the kerb of every granite edge onto a street and plants the foot of every tower, mirrored', () => {
    expect(layout.neon.length).toBeGreaterThan(40);
    expect(layout.planters.length).toBeGreaterThan(40);
    for (const list of [layout.neon, layout.planters]) {
      const all = new Set(list.map(key));
      for (const e of list) expect(all.has(`${78 - e.x},${78 - e.z},${turn[e.side]}`)).toBe(true);
    }
    const tower = new Set(city.buildings.filter(b => b.type === 'commercial').map(b => `${b.gridX},${b.gridZ}`));
    const step = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] } as const;
    for (const p of layout.planters) expect(tower.has(`${p.x + step[p.side][0]},${p.z + step[p.side][1]}`)).toBe(true);
  });
});
