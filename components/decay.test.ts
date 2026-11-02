import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import { generateCity } from '../sim/mapgen';
import { blocksAcross, districtOfBlock } from '../sim/districts';
import { decayAt, decayOfBlock, decayProps, finishedHeight, UNFINISHED, type Decay } from './decay';

const N = CITY_CONFIG.gridSize;
const n = blocksAcross(N), last = n - 1;
const blocks = Array.from({ length: n * n }, (_, i) => ({ ix: Math.floor(i / n), iz: i % n }));

describe('decay by block', () => {
  it('is the same for a block and its twin across the map', () => {
    for (const { ix, iz } of blocks) expect(decayOfBlock(last - ix, last - iz, N)).toEqual(decayOfBlock(ix, iz, N));
  });

  it('never touches the core, downtown or the bases, and gets worse toward the edge', () => {
    const share = (district: string) => {
      const inIt = blocks.filter(b => districtOfBlock(b.ix, b.iz, N) === district);
      return inIt.filter(b => decayOfBlock(b.ix, b.iz, N)).length / inIt.length;
    };
    for (const d of ['core', 'downtown', 'base']) expect(share(d)).toBe(0);
    expect(share('fringe')).toBe(1);
    expect(share('fringe')).toBeGreaterThan(share('outskirts'));
    expect(share('outskirts')).toBeGreaterThan(share('midtown'));
  });

  it('shows every state on each side as a primary, and mixes in traces of others', () => {
    const states = blocks.filter(b => b.ix + b.iz < last).map(b => decayOfBlock(b.ix, b.iz, N)).filter(Boolean);
    expect(new Set(states.map(s => s!.primary))).toEqual(new Set<Decay>(['deconstruction', 'deterioration', 'redevelopment']));
    expect(states.some(s => s!.secondary)).toBe(true);
    for (const s of states) expect(s!.secondary).not.toBe(s!.primary);
  });
});

describe('unfinished buildings', () => {
  it('are finished to whole storeys, a good part of the way up', () => {
    for (let h = UNFINISHED.minHeight; h < 40; h += 1.3) {
      const f = finishedHeight(h);
      expect(f % UNFINISHED.storey).toBeCloseTo(0);
      expect(f).toBeLessThan(h);
      expect(f).toBeGreaterThanOrEqual(UNFINISHED.storey * 2);
    }
  });
});

describe('street props', () => {
  const city = generateCity({ gridSize: N, tileSize: CITY_CONFIG.tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });
  const props = decayProps(city.roadTiles, N);

  it('lie only along deteriorating blocks, the same every time', () => {
    expect(decayProps(city.roadTiles, N)).toEqual(props);
    expect(props.puddles.length).toBeGreaterThan(20);
    expect(props.drifts.length).toBeGreaterThan(props.puddles.length);
    expect(props.weeds.length).toBeGreaterThan(20);
    // Each weed on a pavement beside a deteriorating block.
    const deteriorating = (x: number, z: number) => { const d = decayAt(x, z, N); return !!d && (d.primary === 'deterioration' || d.secondary === 'deterioration'); };
    for (const w of props.weeds) {
      const x = Math.round(w.x), z = Math.round(w.z);
      expect([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => deteriorating(x + dx, z + dz))).toBe(true);
    }
  });
});
