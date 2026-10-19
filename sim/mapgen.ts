// City generation: roads, building blocks, core nodes and guarded server nodes.
//
// The map is point-symmetric. Whatever stands at tile (x, z) also stands at
// (size-1-x, size-1-z), so both bases face the same city. That needs the road grid to mirror
// too: roads run every 6 tiles, so the map is 79 tiles across (roads at 0, 6, ... 78).
// Generation is seeded, so the same seed always produces the same city.
//
// The building rules were moved here from CityMap.tsx; the changes are the mirroring, the
// seed, and the four fixed server nodes, which used to appear by chance near the centre.

import { BUILDING_COLORS, BUILDING_HEALTH, UNIT_STATS } from '../constants';
import type { BuildingBlock, BuildingData, RoadTileData, RoadType, UnitData } from '../types';
import type { GridPos } from './commands';
import { districtOfBlock, type District } from './districts';

// Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1).
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CityOptions {
  seed: number;
  gridSize: number;
  tileSize: number;
  // Scales every district's fill: 1 is the standard city.
  buildingDensity: number;
  blueBase: GridPos;
  redBase: GridPos;
}

export interface City {
  buildings: BuildingData[];
  blocks: BuildingBlock[];
  roadTiles: RoadTileData[];
  roadTileSet: Set<string>;
  tileTypeMap: Record<string, RoadType>;
  // A Sentinel drone guarding each server node.
  sentinels: UnitData[];
  // The corporate megatowers around the centre (see LANDMARKS).
  landmarks: Landmark[];
}

// The four corporate arcologies that ring the central server node, one on each diagonal block.
// They are scenery with a footprint: each fills its whole 5x5 block, can't be driven through,
// captured or destroyed, and never becomes a base site. Their lots mirror, so the map stays fair;
// the towers themselves are all different.
export type LandmarkKind = 'tokugen' | 'nexum' | 'axiom' | 'vanta';
export interface Landmark {
  id: string;
  kind: LandmarkKind;
  // The middle tile of its block.
  center: GridPos;
  // Every tile it stands on.
  tiles: GridPos[];
}
const LANDMARK_LOTS: { kind: LandmarkKind; dx: number; dz: number }[] = [
  { kind: 'tokugen', dx: -1, dz: -1 },
  { kind: 'nexum', dx: 1, dz: 1 },
  { kind: 'axiom', dx: -1, dz: 1 },
  { kind: 'vanta', dx: 1, dz: -1 },
];

const ROAD_STRIDE = 6;

// The Corpo Plaza roundabout round the centre server node (components/CorpoPlaza.tsx): its lower
// elevated deck reaches 59 world units out from the centre tile. Nothing is built on a tile that
// comes within that reach, plus clearance for the deck's lamps and the towers' signs.
export const PLAZA_CLEAR_RADIUS = 64;

// How each district builds up its blocks.
//   fill:       share of a block's lot that gets built on (scaled by CityOptions.buildingDensity)
//   footprints: building sizes in tiles, picked at random and turned either way
//   perimeter:  buildings line the street front around an open courtyard
//   height:     range of building heights
//   podium:     chance a multi-tile building is a tower on a low podium
interface DistrictStyle {
  fill: number;
  footprints: [number, number][];
  perimeter: boolean;
  height: [number, number];
  types: BuildingData['type'][];
  podium: number;
}
export const DISTRICT_STYLES: Record<District, DistrictStyle> = {
  // Megablocks and towers: few, big and very tall.
  core: { fill: 0.5, footprints: [[2, 2], [2, 3]], perimeter: false, height: [40, 70], types: ['commercial'], podium: 0.4 },
  downtown: { fill: 0.48, footprints: [[2, 2], [2, 3], [3, 3], [1, 2]], perimeter: false, height: [30, 60], types: ['commercial'], podium: 0.35 },
  // Mid-rise frontage around open courtyards.
  midtown: { fill: 0.38, footprints: [[1, 2], [1, 3], [2, 2], [1, 1]], perimeter: true, height: [16, 34], types: ['hightech'], podium: 0 },
  // Long low sheds with yards around them.
  industrial: { fill: 0.33, footprints: [[1, 3], [1, 4], [2, 3], [2, 4]], perimeter: false, height: [7, 14], types: ['industrial'], podium: 0 },
  // Scattered housing with plenty of open ground.
  outskirts: { fill: 0.25, footprints: [[1, 1], [1, 2], [2, 2]], perimeter: false, height: [10, 22], types: ['residential'], podium: 0 },
  fringe: { fill: 0.18, footprints: [[1, 1], [1, 2]], perimeter: false, height: [6, 14], types: ['residential', 'industrial'], podium: 0 },
  base: { fill: 0.15, footprints: [[1, 1], [1, 2]], perimeter: false, height: [8, 16], types: ['residential'], podium: 0 },
};

export function generateCity(opts: CityOptions): City {
  const { gridSize, tileSize, buildingDensity, blueBase, redBase } = opts;
  const rng = seededRandom(opts.seed);
  const offset = (gridSize * tileSize) / 2;
  const last = gridSize - 1;
  const mirror = (p: GridPos): GridPos => ({ x: last - p.x, z: last - p.z });
  const key = (x: number, z: number) => `${x},${z}`;

  // --- Roads ---
  const reservedTypeMap = new Map<string, RoadType>();
  const center = Math.floor(gridSize / 2);
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const isMainBoulevard = x === center || z === center;
      const isConnector = x % ROAD_STRIDE === 0 || z % ROAD_STRIDE === 0;
      const isBaseArea = (Math.abs(x - blueBase.x) < 4 && Math.abs(z - blueBase.z) < 4) || (Math.abs(x - redBase.x) < 4 && Math.abs(z - redBase.z) < 4);
      if (isMainBoulevard) reservedTypeMap.set(key(x, z), 'main');
      else if (isConnector || isBaseArea) reservedTypeMap.set(key(x, z), 'street');
    }
  }

  const buildings: BuildingData[] = [];
  const blocks: BuildingBlock[] = [];
  const sentinels: UnitData[] = [];
  const buildingMap = new Map<string, string>();
  const occupied = new Set<string>(reservedTypeMap.keys());

  // Roads sit on every 6th line, so the lot between them is a 5x5 city block.
  const blockIndexOf = (coord: number) => Math.floor(coord / ROAD_STRIDE);
  const blockCenter = (index: number) => index * ROAD_STRIDE + 3;
  const lastBlockIndex = Math.floor(last / ROAD_STRIDE) - 1;
  const keepBlockEmpty = (ix: number, iz: number) => {
    if (ix < 0 || iz < 0 || ix > lastBlockIndex || iz > lastBlockIndex) return;
    for (let x = ix * ROAD_STRIDE + 1; x <= ix * ROAD_STRIDE + 5; x++) {
      for (let z = iz * ROAD_STRIDE + 1; z <= iz * ROAD_STRIDE + 5; z++) occupied.add(key(x, z));
    }
  };

  const building = (id: string, x: number, z: number, type: BuildingData['type'], height: number, blockId: string, scale: [number, number, number]): BuildingData => ({
    id, gridX: x, gridZ: z,
    position: [(x * tileSize) - offset, 0, (z * tileSize) - offset],
    scale, color: BUILDING_COLORS[type], type, height, blockId,
    owner: null, captureProgress: 0, capturingTeam: null,
    health: BUILDING_HEALTH[type], maxHealth: BUILDING_HEALTH[type],
  });

  // --- Core nodes: one two blocks from each base, the two empty corners, and a pair on
  // the line equidistant from both bases. All in mirrored pairs. ---
  const blueBlock = { ix: blockIndexOf(blueBase.x), iz: blockIndexOf(blueBase.z) };
  const redBlock = { ix: blockIndexOf(redBase.x), iz: blockIndexOf(redBase.z) };
  const corePlacements: { ix: number; iz: number; clearSurroundings: boolean }[] = [
    { ix: blueBlock.ix + 2, iz: blueBlock.iz + 2, clearSurroundings: false },
    { ix: redBlock.ix - 2, iz: redBlock.iz - 2, clearSurroundings: false },
    { ix: blueBlock.ix, iz: redBlock.iz, clearSurroundings: true },
    { ix: redBlock.ix, iz: blueBlock.iz, clearSurroundings: true },
    { ix: blueBlock.ix + 3, iz: redBlock.iz - 3, clearSurroundings: false },
    { ix: redBlock.ix - 3, iz: blueBlock.iz + 3, clearSurroundings: false },
  ];
  for (const node of corePlacements) {
    if (node.clearSurroundings) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) keepBlockEmpty(node.ix + dx, node.iz + dz);
    }
    keepBlockEmpty(node.ix, node.iz);
    const x = blockCenter(node.ix);
    const z = blockCenter(node.iz);
    const id = `core-${x}-${z}`;
    buildingMap.set(key(x, z), id);
    buildings.push(building(id, x, z, 'core_node', 6, id, [3.4, 6, 3.4]));
  }

  // --- Server nodes: five, each alone in its block and guarded by a Sentinel. They produce
  // compute, which is spent researching tech tiers. Spread out so no single fight decides
  // everyone's tech:
  //   - one in each side's own half, off to the flank: every side can tech without winning
  //     the middle, but has to go out and hold it;
  //   - two on the line halfway between the bases, beside the outer core nodes: the
  //     contested flanks;
  //   - one in the very centre.
  const mid = blockIndexOf(center);
  const serverBlocks = [
    { ix: blueBlock.ix + 1, iz: blueBlock.iz + 5 }, { ix: redBlock.ix - 1, iz: redBlock.iz - 5 },
    { ix: mid - 2, iz: mid + 2 }, { ix: mid + 2, iz: mid - 2 },
    { ix: mid, iz: mid },
  ];
  for (const sb of serverBlocks) {
    keepBlockEmpty(sb.ix, sb.iz);
    const x = blockCenter(sb.ix);
    const z = blockCenter(sb.iz);
    const id = `server-${x}-${z}`;
    buildingMap.set(key(x, z), id);
    buildings.push(building(id, x, z, 'server_node', 8, id, [tileSize * 0.7, 8, tileSize * 0.7]));
    blocks.push({ id, type: 'server_node', buildingIds: [id], owner: null });
    sentinels.push({
      id: `drone-${id}`, type: 'defense_drone', unitClass: 'defense', team: 'neutral',
      gridPos: { x, z }, path: [], visionRange: UNIT_STATS.defense_drone.visionRange,
      health: UNIT_STATS.defense_drone.maxHealth, maxHealth: UNIT_STATS.defense_drone.maxHealth,
      battery: 100, maxBattery: 100, cooldowns: {},
    });
  }

  // --- Landmarks: the corporate towers on the four diagonal blocks around the centre ---
  const landmarks: Landmark[] = LANDMARK_LOTS.map(({ kind, dx, dz }) => {
    const ix = mid + dx;
    const iz = mid + dz;
    keepBlockEmpty(ix, iz);
    const id = `landmark-${kind}`;
    const tiles: GridPos[] = [];
    for (let x = ix * ROAD_STRIDE + 1; x <= ix * ROAD_STRIDE + 5; x++) {
      for (let z = iz * ROAD_STRIDE + 1; z <= iz * ROAD_STRIDE + 5; z++) {
        tiles.push({ x, z });
        buildingMap.set(key(x, z), id);
      }
    }
    return { id, kind, center: { x: blockCenter(ix), z: blockCenter(iz) }, tiles };
  });

  // --- Keep the ground under the Corpo Plaza decks clear ---
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const dx = Math.max(0, Math.abs(x - center) - 0.5);
      const dz = Math.max(0, Math.abs(z - center) - 0.5);
      if (Math.hypot(dx, dz) * tileSize < PLAZA_CLEAR_RADIUS) occupied.add(key(x, z));
    }
  }

  // --- Ordinary buildings, laid out block by block in the style of the district the block is in
  // (DISTRICT_STYLES). Each block of a mirrored pair is laid out once and copied into its twin.
  // Rules for every block:
  //   - a building is a footprint of one or more tiles; two buildings never touch side to side, so
  //     there is always at least a one-tile alley between them;
  //   - every open tile in the block stays reachable from the street around it, so no courtyard
  //     is ever sealed in.
  let blockCounter = 0;
  for (let ix = 0; ix <= lastBlockIndex; ix++) {
    for (let iz = 0; iz <= lastBlockIndex; iz++) {
      // The twin of (ix, iz) is (last-ix, last-iz): lay out the half below the anti-diagonal, and
      // one of each pair on it. The centre block is its own twin (and is the server node's).
      if (ix + iz > lastBlockIndex || (ix + iz === lastBlockIndex && ix >= iz)) continue;
      const style = DISTRICT_STYLES[districtOfBlock(ix, iz, gridSize)];
      const x0 = ix * ROAD_STRIDE + 1;
      const z0 = iz * ROAD_STRIDE + 1;
      const lot: GridPos[] = [];
      for (let x = x0; x < x0 + 5; x++) for (let z = z0; z < z0 + 5; z++) if (!occupied.has(key(x, z))) lot.push({ x, z });
      if (lot.length === 0) continue;
      const lotSet = new Set(lot.map(t => key(t.x, t.z)));

      // Every open tile in the lot can still be walked to from the street.
      const allReachable = () => {
        const open = lot.filter(t => !buildingMap.has(key(t.x, t.z)));
        const seen = new Set<string>();
        const queue: GridPos[] = [];
        for (const t of open) {
          const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !lotSet.has(key(t.x + dx, t.z + dz)) && !buildingMap.has(key(t.x + dx, t.z + dz)));
          if (edge) { seen.add(key(t.x, t.z)); queue.push(t); }
        }
        while (queue.length) {
          const t = queue.pop()!;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = key(t.x + dx, t.z + dz);
            if (lotSet.has(k) && !buildingMap.has(k) && !seen.has(k)) { seen.add(k); queue.push({ x: t.x + dx, z: t.z + dz }); }
          }
        }
        return seen.size === open.length;
      };

      const target = Math.round(lot.length * style.fill * buildingDensity);
      let built = 0;
      for (let attempt = 0; attempt < 200 && built < target; attempt++) {
        let [w, d] = style.footprints[Math.floor(rng() * style.footprints.length)];
        if (rng() < 0.5) [w, d] = [d, w];
        const lx = Math.floor(rng() * (6 - w));
        const lz = Math.floor(rng() * (6 - d));
        // Perimeter blocks keep their buildings on the street front, leaving the middle open.
        if (style.perimeter && !(lx === 0 || lz === 0 || lx + w === 5 || lz + d === 5)) continue;
        if (built + w * d > target + 2) continue;
        const tiles: GridPos[] = [];
        for (let x = x0 + lx; x < x0 + lx + w; x++) for (let z = z0 + lz; z < z0 + lz + d; z++) tiles.push({ x, z });
        const own = new Set(tiles.map(t => key(t.x, t.z)));
        const fits = tiles.every(t => lotSet.has(key(t.x, t.z)) && !buildingMap.has(key(t.x, t.z)) &&
          [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => { const k = key(t.x + dx, t.z + dz); return own.has(k) || !buildingMap.has(k); }));
        if (!fits) continue;
        const blockId = `block-${blockCounter}`;
        for (const k of own) buildingMap.set(k, blockId);
        if (!allReachable()) {
          for (const k of own) buildingMap.delete(k);
          continue;
        }
        built += tiles.length;

        const type = style.types[Math.floor(rng() * style.types.length)];
        const [lo, hi] = style.height;
        const height = lo + rng() * (hi - lo);
        // Tower on podium: one tall tower on a low base filling the rest of the footprint.
        const tower = tiles.length > 1 && rng() < style.podium ? Math.floor(rng() * tiles.length) : -1;
        // Multi-tile buildings fill their tiles so they read as one mass; single tiles stand alone.
        const width = tileSize * (tiles.length > 1 ? 0.96 : 0.7);
        const mirrorId = `${blockId}-m`;
        const footprint: NonNullable<BuildingData['footprint']> = { x: x0 + lx, z: z0 + lz, w, d };
        if (tower >= 0) footprint.tower = { ...tiles[tower] };
        const corner = mirror({ x: footprint.x + w - 1, z: footprint.z + d - 1 });
        const mirroredFootprint: NonNullable<BuildingData['footprint']> = { x: corner.x, z: corner.z, w, d };
        if (footprint.tower) mirroredFootprint.tower = mirror(footprint.tower);
        const original: BuildingData[] = [];
        const mirrored: BuildingData[] = [];
        tiles.forEach((t, i) => {
          const h = tower < 0 ? height : i === tower ? Math.min(hi * 1.25, height * 1.2) : 8 + rng() * 4;
          const m = mirror(t);
          occupied.add(key(t.x, t.z));
          occupied.add(key(m.x, m.z));
          buildingMap.set(key(m.x, m.z), mirrorId);
          original.push({ ...building(`b-${t.x}-${t.z}`, t.x, t.z, type, h, blockId, [width, h, width]), footprint });
          mirrored.push({ ...building(`b-${m.x}-${m.z}`, m.x, m.z, type, h, mirrorId, [width, h, width]), footprint: mirroredFootprint });
        });
        buildings.push(...original, ...mirrored);
        blocks.push({ id: blockId, type, buildingIds: original.map(b => b.id), owner: null });
        blocks.push({ id: mirrorId, type, buildingIds: mirrored.map(b => b.id), owner: null });
        blockCounter++;
      }
    }
  }

  // --- Everything that isn't a building can be driven on ---
  const roadTiles: RoadTileData[] = [];
  const roadTileSet = new Set<string>();
  const tileTypeMap: Record<string, RoadType> = {};
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const k = key(x, z);
      if (buildingMap.has(k)) continue;
      roadTileSet.add(k);
      const type = reservedTypeMap.get(k) ?? 'open';
      tileTypeMap[k] = type;
      roadTiles.push({ x, z, type });
    }
  }

  return { buildings, blocks, roadTiles, roadTileSet, tileTypeMap, sentinels, landmarks };
}
