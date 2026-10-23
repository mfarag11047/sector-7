// Industry, after Night City's industrial districts: pale corporate plant halls with a dark band
// round their foot and a code stencilled big on the front; rusty teal and orange sheds with
// louvre vents, pipes along the walls and an external stair; corrugated warehouses under
// sawtooth roofs. On the roof: a smokestack with drifting smoke, red storage tanks, vents and
// fans, or a tower crane. Picked from where the building stands, so its twin is the same.
// Pipe gantries joining the buildings are in IndustrialGantries.tsx.

import { CITY_CONFIG } from '../constants';
import type { BuildingData } from '../types';
import { type Crown, type Facade, FACADES, type FacadeName, type Massing } from './corpoFacades';

type Footprint = NonNullable<BuildingData['footprint']>;

const CODES = ['38F', 'H5', '4H67', 'X9', 'J063', 'F12', '27X', '7AJ', '95H7', 'T3'];

const pick = <T,>(r: number, options: [T, number][]): T => {
  for (const [o, share] of options) { if (r < share) return o; r -= share; }
  return options[options.length - 1][0];
};

export function industrialLookOf(f: Footprint, gridSize = CITY_CONFIG.gridSize): Facade {
  const last = gridSize - 1;
  const tx = last - (f.x + f.w - 1), tz = last - (f.z + f.d - 1);
  const [x, z] = f.x + f.z < tx + tz || (f.x + f.z === tx + tz && f.x <= tx) ? [f.x, f.z] : [tx, tz];
  const hash = (salt: number) => { const v = Math.sin((x * gridSize + z) * 37.719 + salt * 63.17) * 43758.5453; return v - Math.floor(v); };
  const tiles = f.w * f.d;
  // The big halls are plants; long sheds are warehouses or rust sheds; single blocks are
  // utility blocks with tanks or a stack.
  const name: FacadeName = tiles >= 9 ? 'plant'
    : tiles === 1 ? pick<FacadeName>(hash(1), [['plant', 0.5], ['rustshed', 0.5]])
    : pick<FacadeName>(hash(1), [['warehouse', 0.45], ['rustshed', 0.35], ['plant', 0.2]]);
  const crown: Crown = name === 'warehouse' ? pick<Crown>(hash(2), [['crane', 0.5], ['vents', 0.5]])
    : tiles >= 9 ? 'smokestack'
    : pick<Crown>(hash(2), [['smokestack', 0.3], ['redtanks', 0.4], ['vents', 0.3]]);
  const massing: Massing = name === 'plant' && tiles > 1 ? pick<Massing>(hash(3), [['straight', 0.4], ['crownstep', 0.35], ['plinth', 0.25]]) : 'straight';
  const style = FACADES[name];
  return {
    ...style, body: style.bodies[Math.floor(hash(4) * style.bodies.length)], massing, crown,
    stencil: name === 'plant' || hash(5) < 0.3 ? CODES[Math.floor(hash(6) * CODES.length)] : undefined,
    pipes: name !== 'plant', sawtooth: name === 'warehouse', fireEscape: name === 'rustshed' && hash(7) < 0.7,
  };
}
