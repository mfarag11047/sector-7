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
}

const ROAD_STRIDE = 6;

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

  // --- Server nodes: four, mirrored around the centre, each alone in its block and guarded
  // by a Sentinel. Holding them unlocks tech tiers. ---
  const mid = blockIndexOf(center);
  const serverBlocks = [
    { ix: mid - 1, iz: mid - 1 }, { ix: mid + 1, iz: mid + 1 },
    { ix: mid - 1, iz: mid + 1 }, { ix: mid + 1, iz: mid - 1 },
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

  // --- Ordinary buildings, generated in one half of the map and mirrored into the other.
  // The half stops two tiles short of the anti-diagonal so a block and its mirror never touch.
  const inHalf = (x: number, z: number) => x + z <= last - 2;
  const free = (x: number, z: number) => {
    const m = mirror({ x, z });
    return !occupied.has(key(x, z)) && !occupied.has(key(m.x, m.z));
  };
  let blockCounter = 0;
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      if (!inHalf(x, z) || !free(x, z)) continue;
      if (rng() >= buildingDensity) continue;
      const blockSize = 3 + Math.floor(rng() * 4);
      const blockId = `block-${blockCounter}`;
      const dist = Math.hypot(x - gridSize / 2, z - gridSize / 2);
      let type: BuildingData['type'] = 'residential';
      if (dist < 10) type = 'commercial';
      else if (dist < 20) type = 'hightech';
      else if (rng() > 0.5) type = 'industrial';

      const tiles: { x: number; z: number; height: number }[] = [];
      const taken = new Set<string>();
      const stack: [number, number][] = [[x, z]];
      while (stack.length > 0 && tiles.length < blockSize) {
        const [cx, cz] = stack.splice(Math.floor(rng() * stack.length), 1)[0];
        const k = key(cx, cz);
        if (cx < 0 || cx >= gridSize || cz < 0 || cz >= gridSize) continue;
        if (taken.has(k) || !inHalf(cx, cz) || !free(cx, cz)) continue;
        const neighbors: [number, number][] = [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]];
        if (neighbors.some(([nx, nz]) => buildingMap.has(key(nx, nz)))) continue;
        taken.add(k);
        tiles.push({ x: cx, z: cz, height: 10 + rng() * (type === 'commercial' ? 50 : 20) });
        stack.push(...neighbors);
      }
      if (tiles.length < 3) continue;

      const mirrorId = `${blockId}-m`;
      const original: BuildingData[] = [];
      const mirrored: BuildingData[] = [];
      for (const t of tiles) {
        const m = mirror(t);
        occupied.add(key(t.x, t.z));
        occupied.add(key(m.x, m.z));
        buildingMap.set(key(t.x, t.z), blockId);
        buildingMap.set(key(m.x, m.z), mirrorId);
        original.push(building(`b-${t.x}-${t.z}`, t.x, t.z, type, t.height, blockId, [tileSize * 0.7, t.height, tileSize * 0.7]));
        mirrored.push(building(`b-${m.x}-${m.z}`, m.x, m.z, type, t.height, mirrorId, [tileSize * 0.7, t.height, tileSize * 0.7]));
      }
      buildings.push(...original, ...mirrored);
      blocks.push({ id: blockId, type, buildingIds: original.map(b => b.id), owner: null });
      blocks.push({ id: mirrorId, type, buildingIds: mirrored.map(b => b.id), owner: null });
      blockCounter++;
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

  return { buildings, blocks, roadTiles, roadTileSet, tileTypeMap, sentinels };
}
