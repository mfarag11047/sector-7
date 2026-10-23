import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { residentialLookOf } from './residentialLooks';

const city = generateCity({ gridSize: CITY_CONFIG.gridSize, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
const homes = new Map(city.buildings.filter(b => b.type === 'residential' && b.footprint).map(b => [`${b.footprint!.x},${b.footprint!.z}`, b.footprint!]));

describe('cheap housing', () => {
  it('gives each home and its twin the same look, with plenty of variety', () => {
    const looks = new Set<string>();
    for (const f of homes.values()) {
      const twin = homes.get(`${78 - (f.x + f.w - 1)},${78 - (f.z + f.d - 1)}`)!;
      expect(residentialLookOf(twin)).toEqual(residentialLookOf(f));
      const l = residentialLookOf(f);
      looks.add(`${l.name} ${l.body} ${l.massing} ${l.crown} ${l.shops} ${l.fireEscape}`);
    }
    expect(looks.size).toBeGreaterThan(homes.size / 3);
    const crowns = new Set([...homes.values()].map(f => residentialLookOf(f).crown));
    expect(crowns).toEqual(new Set(['shack', 'dishes', 'laundry', 'tanks']));
  });
});
