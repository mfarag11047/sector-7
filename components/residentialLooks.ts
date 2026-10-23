// The outskirts' cheap housing (and the shacks of the fringe and the bases): lower-class
// apartment blocks and houses. Each building gets a window style (tenement windows, a concrete
// housing project with access balconies, or patched mismatched panels), a weathered paint
// colour, a shape (mostly sheer; some with a narrower top storey added on, some on a plinth), a
// roof (a shack built on top, satellite dishes, a laundry line or water tanks), AC units bolted
// on its walls, a zigzag fire escape on the taller ones, and on a few a corner shop at street
// level. Picked from where the building stands, so its twin across the map is the same.

import { CITY_CONFIG } from '../constants';
import type { BuildingData } from '../types';
import { type Crown, type Facade, FACADES, type FacadeName, type Massing } from './corpoFacades';

type Footprint = NonNullable<BuildingData['footprint']>;

const pick = <T,>(r: number, options: [T, number][]): T => {
  for (const [o, share] of options) { if (r < share) return o; r -= share; }
  return options[options.length - 1][0];
};

export function residentialLookOf(f: Footprint, gridSize = CITY_CONFIG.gridSize): Facade {
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  const [x, z] = f.x + f.z < tx + tz || (f.x + f.z === tx + tz && f.x <= tx) ? [f.x, f.z] : [tx, tz];
  const hash = (salt: number) => { const v = Math.sin((x * gridSize + z) * 91.345 + salt * 47.853) * 43758.5453; return v - Math.floor(v); };
  const big = f.w * f.d >= 2;
  const windows = pick<FacadeName>(hash(1), big
    ? [['projects', 0.45], ['tenement', 0.35], ['patched', 0.2]]
    : [['tenement', 0.55], ['patched', 0.45]]);
  const massing = pick<Massing>(hash(2), [['straight', 0.6], ['crownstep', 0.25], ['plinth', 0.15]]);
  const crown = pick<Crown>(hash(3), [['shack', 0.3], ['dishes', 0.25], ['laundry', 0.2], ['tanks', 0.25]]);
  const style = FACADES[windows];
  return {
    ...style, body: style.bodies[Math.floor(hash(4) * style.bodies.length)],
    massing, crown, shops: hash(5) < 0.25, clutter: true, fireEscape: hash(6) < 0.6,
  };
}
