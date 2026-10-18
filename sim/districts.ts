// City districts: the city is zoned into areas with their own character, laid out in rings from
// the corporate core out to the Blackwall fringe at the map edge.
//
//   core       the 3x3 blocks in the middle: the corporate towers and the central server node
//   downtown   the ring of blocks around the core
//   midtown    most of the map between downtown and the outskirts
//   industrial two patches on the flanks of each base
//   outskirts  the ring of blocks just inside the edge
//   fringe     the outermost ring of blocks, along the map edge
//   base       each side's starting corner
//
// Zoning is by city block (the 5x5 lots between roads) and mirrors like the rest of the map:
// block (ix, iz) and block (last-ix, last-iz) are always the same district. For now districts only
// colour the minimap; the buildings in them are unchanged.

const ROAD_STRIDE = 6;

export type District = 'core' | 'downtown' | 'midtown' | 'industrial' | 'outskirts' | 'fringe' | 'base';

export const DISTRICT_COLORS: Record<District, string> = {
  core: '#e879f9',
  downtown: '#22d3ee',
  midtown: '#34d399',
  industrial: '#f59e0b',
  outskirts: '#7dd3fc',
  fringe: '#fb7185',
  base: '#94a3b8',
};

// How many blocks there are along each side of a map `gridSize` tiles across.
export const blocksAcross = (gridSize: number) => Math.floor((gridSize - 1) / ROAD_STRIDE);

// The district of block (ix, iz). The bases start in the corners at block (0, 0) and its mirror.
export function districtOfBlock(ix: number, iz: number, gridSize: number): District {
  const last = blocksAcross(gridSize) - 1;
  const mid = last / 2;
  // Fold the map onto blue's half: the layout is the same seen from either base.
  const [x, z] = ix + iz > last ? [last - ix, last - iz] : [ix, iz];
  if (x <= 1 && z <= 1) return 'base';
  const ring = Math.max(Math.abs(ix - mid), Math.abs(iz - mid));
  if (ring <= 1) return 'core';
  if (ring <= 2) return 'downtown';
  // Beside the base, along both edges it opens onto.
  if ((x >= 2 && x <= 4 && z >= 1 && z <= 2) || (z >= 2 && z <= 4 && x >= 1 && x <= 2)) return 'industrial';
  const edge = Math.min(ix, iz, last - ix, last - iz);
  if (edge === 0) return 'fringe';
  if (edge === 1) return 'outskirts';
  return 'midtown';
}

// The district a lot tile stands in, or null on a road (the grid streets and the two main
// boulevards through the middle).
export function districtAt(x: number, z: number, gridSize: number): District | null {
  const boulevard = Math.floor(gridSize / 2);
  if (x % ROAD_STRIDE === 0 || z % ROAD_STRIDE === 0 || x === boulevard || z === boulevard) return null;
  const n = blocksAcross(gridSize);
  const ix = Math.floor(x / ROAD_STRIDE);
  const iz = Math.floor(z / ROAD_STRIDE);
  if (ix >= n || iz >= n) return null;
  return districtOfBlock(ix, iz, gridSize);
}

export interface DistrictBlock {
  ix: number;
  iz: number;
  district: District;
  // The block's lot, in tiles: x, z of its first tile and its size.
  x: number;
  z: number;
  size: number;
}

// Every block on the map with its district.
export function districtLayout(gridSize: number): DistrictBlock[] {
  const n = blocksAcross(gridSize);
  const out: DistrictBlock[] = [];
  for (let ix = 0; ix < n; ix++) {
    for (let iz = 0; iz < n; iz++) {
      out.push({ ix, iz, district: districtOfBlock(ix, iz, gridSize), x: ix * ROAD_STRIDE + 1, z: iz * ROAD_STRIDE + 1, size: ROAD_STRIDE - 1 });
    }
  }
  return out;
}
