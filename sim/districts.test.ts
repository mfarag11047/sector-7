import { describe, expect, it } from 'vitest';
import { blocksAcross, districtAt, districtBorders, districtLayout, districtOfBlock } from './districts';

const SIZE = 79;

describe('districts', () => {
  const n = blocksAcross(SIZE);
  const last = n - 1;

  it('covers the 13x13 blocks of the map', () => {
    expect(n).toBe(13);
    expect(districtLayout(SIZE)).toHaveLength(169);
  });

  it('mirrors, so both bases face the same city', () => {
    for (let ix = 0; ix < n; ix++) for (let iz = 0; iz < n; iz++) {
      expect(districtOfBlock(ix, iz, SIZE)).toBe(districtOfBlock(last - ix, last - iz, SIZE));
    }
  });

  it('rings out from the core to the fringe', () => {
    expect(districtOfBlock(6, 6, SIZE)).toBe('core');
    expect(districtOfBlock(5, 5, SIZE)).toBe('core');
    expect(districtOfBlock(4, 6, SIZE)).toBe('downtown');
    expect(districtOfBlock(6, 3, SIZE)).toBe('midtown');
    expect(districtOfBlock(1, 6, SIZE)).toBe('outskirts');
    expect(districtOfBlock(0, 6, SIZE)).toBe('fringe');
    expect(districtOfBlock(0, 0, SIZE)).toBe('base');
    expect(districtOfBlock(12, 12, SIZE)).toBe('base');
    expect(districtOfBlock(3, 1, SIZE)).toBe('industrial');
    expect(districtOfBlock(1, 3, SIZE)).toBe('industrial');
    expect(districtOfBlock(9, 11, SIZE)).toBe('industrial');
  });

  it('puts every district on the map', () => {
    const kinds = new Set(districtLayout(SIZE).map(b => b.district));
    expect([...kinds].sort()).toEqual(['base', 'core', 'downtown', 'fringe', 'industrial', 'midtown', 'outskirts']);
  });

  it('gives lot tiles a district and roads none', () => {
    expect(districtAt(39, 39, SIZE)).toBeNull();
    expect(districtAt(6, 10, SIZE)).toBeNull();
    expect(districtAt(40, 40, SIZE)).toBe('core');
    expect(districtAt(1, 40, SIZE)).toBe('fringe');
  });
});

describe('district outlines', () => {
  const edges = districtBorders(SIZE);

  it('outline every district but the bases', () => {
    const outlined = new Set(edges.map(e => e.district));
    expect([...outlined].sort()).toEqual(['core', 'downtown', 'fringe', 'industrial', 'midtown', 'outskirts']);
  });

  it('are straight lines that stay in the streets, never across a block', () => {
    const lots = districtLayout(SIZE);
    for (const e of edges) {
      expect(e.x1 === e.x2 || e.z1 === e.z2).toBe(true);
      for (const b of lots) {
        // A line inside a lot would cut through its buildings.
        const inside = (x: number, z: number) => x > b.x && x < b.x + b.size && z > b.z && z < b.z + b.size;
        expect(inside((e.x1 + e.x2) / 2, (e.z1 + e.z2) / 2)).toBe(false);
      }
    }
  });

  it('mirror, like the districts', () => {
    const key = (e: { x1: number; z1: number; x2: number; z2: number }) => [Math.min(e.x1, e.x2), Math.min(e.z1, e.z2), Math.max(e.x1, e.x2), Math.max(e.z1, e.z2)].map(v => v.toFixed(2)).join(',');
    const all = new Set(edges.map(e => `${e.district}:${key(e)}`));
    for (const e of edges) {
      const m = { x1: SIZE - e.x1, z1: SIZE - e.z1, x2: SIZE - e.x2, z2: SIZE - e.z2 };
      expect(all.has(`${e.district}:${key(m)}`), `${e.district} ${key(e)}`).toBe(true);
    }
  });
});
