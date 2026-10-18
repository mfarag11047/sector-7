import { describe, expect, it } from 'vitest';
import { blocksAcross, districtAt, districtLayout, districtOfBlock } from './districts';

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
