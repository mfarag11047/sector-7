// City generation: roads, building blocks, core nodes and guarded server nodes.
//
// The map is point-symmetric. Whatever stands at tile (x, z) also stands at
// (size-1-x, size-1-z), so both bases face the same city. That needs the road grid to mirror
// too: roads run every 6 tiles, so the map is 79 tiles across (roads at 0, 6, ... 78).
// The city is the same every match: roads, nodes and landmarks are placed here by rule, and every
// other building is drawn by hand in sim/cityPlan.ts.

import { BUILDING_COLORS, BUILDING_HEALTH, UNIT_STATS } from '../constants';
import type { BuildingBlock, BuildingData, RoadTileData, RoadType, UnitData } from '../types';
import type { GridPos } from './commands';
import { districtOfBlock, type District } from './districts';
import { CITY_PLAN } from './cityPlan';

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
  gridSize: number;
  tileSize: number;
  // The buildings, drawn by hand (sim/cityPlan.ts); tests pass their own.
  plan?: readonly string[];
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
  // The blast wall round each starting base (see BASE_WALL): tiles nothing can cross, and the
  // gates where the roads run out through it.
  baseWalls: BaseWall[];
  baseGates: GridPos[];
}

// Each starting base is a walled compound: its paved square and the map-edge roads beside it,
// ringed on its two open sides by a blast wall BASE_WALL.reach tiles out from the HQ. Wherever a
// road crosses the ring there is a gate; the rest of the ring can't be crossed, so everything
// leaves through the gates.
export const BASE_WALL = { reach: 4 };
export interface BaseWall {
  at: GridPos;
  // The way the wall runs through this tile, or 'corner'.
  runs: 'x' | 'z' | 'corner';
}

// The wall and gate tiles round a base at `base`, on a map `gridSize` tiles across. The ring is on
// the side of the base facing the middle of the map.
export function baseCompound(base: GridPos, gridSize: number): { walls: BaseWall[]; gates: GridPos[] } {
  const centre = (gridSize - 1) / 2;
  const sx = base.x <= centre ? 1 : -1, sz = base.z <= centre ? 1 : -1;
  const wx = base.x + sx * BASE_WALL.reach, wz = base.z + sz * BASE_WALL.reach;
  const onRoad = (x: number, z: number) => x % ROAD_STRIDE === 0 || z % ROAD_STRIDE === 0;
  const walls: BaseWall[] = [];
  const gates: GridPos[] = [];
  for (let i = -BASE_WALL.reach; i <= BASE_WALL.reach; i++) {
    for (const [x, z, runs] of [[wx, base.z - sz * i, 'z'], [base.x - sx * i, wz, 'x']] as [number, number, BaseWall['runs']][]) {
      if (x < 0 || z < 0 || x >= gridSize || z >= gridSize) continue;
      if (x === wx && z === wz && runs === 'x') continue; // The corner, once.
      if (onRoad(x, z)) gates.push({ x, z });
      else walls.push({ at: { x, z }, runs: x === wx && z === wz ? 'corner' : runs });
    }
  }
  return { walls, gates };
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

// How tall each district builds and what it builds. The buildings themselves are drawn by hand in
// sim/cityPlan.ts; a digit there picks a height in its district's range.
interface DistrictStyle {
  height: [number, number];
  types: BuildingData['type'][];
}
export const DISTRICT_STYLES: Record<District, DistrictStyle> = {
  core: { height: [40, 70], types: ['commercial'] },
  downtown: { height: [30, 60], types: ['commercial'] },
  midtown: { height: [16, 34], types: ['hightech'] },
  industrial: { height: [8, 22], types: ['industrial'] },
  outskirts: { height: [10, 22], types: ['residential'] },
  // Shacks, and scrap sheds where a building spans more than one tile.
  fringe: { height: [6, 14], types: ['residential', 'industrial'] },
  base: { height: [8, 16], types: ['residential'] },
};
// The low base under a tower-on-podium.
const PODIUM_HEIGHT = 10;

export interface PlanBuilding {
  // block-N, and block-N-m for its mirror twin.
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  // The plan's height digit, 1-9.
  tier: number;
  tower?: GridPos;
}

// The buildings drawn in sim/cityPlan.ts, each with its twin across the centre. Throws if the plan
// breaks a rule: a building that isn't a rectangle, a tower without a height, or a building
// without a twin to match it.
export function planBuildings(gridSize: number, plan: readonly string[] = CITY_PLAN): PlanBuilding[] {
  if (plan.length !== gridSize || plan.some(row => row.length !== gridSize)) throw new Error(`city plan: must be ${gridSize} x ${gridSize}`);
  const last = gridSize - 1;
  const isBuilding = (x: number, z: number) => x >= 0 && z >= 0 && x < gridSize && z < gridSize && /[1-9T]/.test(plan[z][x]);
  const seen = new Set<string>();
  const found: Omit<PlanBuilding, 'id'>[] = [];
  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      if (!isBuilding(x, z) || seen.has(`${x},${z}`)) continue;
      // The building is every tile joined to this one side to side.
      const tiles: GridPos[] = [];
      const queue = [{ x, z }];
      seen.add(`${x},${z}`);
      while (queue.length) {
        const t = queue.pop()!;
        tiles.push(t);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = { x: t.x + dx, z: t.z + dz };
          if (isBuilding(n.x, n.z) && !seen.has(`${n.x},${n.z}`)) { seen.add(`${n.x},${n.z}`); queue.push(n); }
        }
      }
      const x0 = Math.min(...tiles.map(t => t.x)), z0 = Math.min(...tiles.map(t => t.z));
      const w = Math.max(...tiles.map(t => t.x)) - x0 + 1, d = Math.max(...tiles.map(t => t.z)) - z0 + 1;
      if (tiles.length !== w * d) throw new Error(`city plan: building at ${x0},${z0} is not a rectangle`);
      const towers = tiles.filter(t => plan[t.z][t.x] === 'T');
      const digits = new Set(tiles.map(t => plan[t.z][t.x]).filter(c => c !== 'T'));
      if (towers.length > 1 || digits.size !== 1) throw new Error(`city plan: building at ${x0},${z0} needs one height digit and at most one tower`);
      found.push({ x: x0, z: z0, w, d, tier: Number([...digits][0]), tower: towers[0] });
    }
  }
  // Pair each building with its twin; the one on blue's side of the map is named first.
  const blocks = Math.floor(last / ROAD_STRIDE);
  const blueSide = (b: Omit<PlanBuilding, 'id'>) => {
    const ix = Math.floor(b.x / ROAD_STRIDE), iz = Math.floor(b.z / ROAD_STRIDE);
    return ix + iz < blocks - 1 || (ix + iz === blocks - 1 && ix < iz);
  };
  const at = new Map(found.map(b => [`${b.x},${b.z}`, b]));
  const out: PlanBuilding[] = [];
  let n = 0;
  for (const b of found.filter(blueSide)) {
    const twin = at.get(`${last - (b.x + b.w - 1)},${last - (b.z + b.d - 1)}`);
    const towerTwin = b.tower && { x: last - b.tower.x, z: last - b.tower.z };
    if (!twin || twin.w !== b.w || twin.d !== b.d || twin.tier !== b.tier || twin.tower?.x !== towerTwin?.x || twin.tower?.z !== towerTwin?.z) {
      throw new Error(`city plan: building at ${b.x},${b.z} has no matching twin across the centre`);
    }
    out.push({ id: `block-${n}`, ...b }, { id: `block-${n}-m`, ...twin });
    n++;
  }
  if (out.length !== found.length) throw new Error('city plan: a building straddles the centre line without a twin');
  return out;
}

export function generateCity(opts: CityOptions): City {
  const { gridSize, tileSize, blueBase, redBase } = opts;
  const offset = (gridSize * tileSize) / 2;
  const last = gridSize - 1;
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
    buildings.push(building(id, x, z, 'core_node', 8, id, [tileSize * 0.62, 8, tileSize * 0.62]));
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
    buildings.push(building(id, x, z, 'server_node', 11, id, [tileSize * 0.86, 11, tileSize * 0.86]));
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

  // --- The starting bases' blast walls: nothing stands on them or crosses them ---
  const baseWalls: BaseWall[] = [];
  const baseGates: GridPos[] = [];
  for (const base of [blueBase, redBase]) {
    const c = baseCompound(base, gridSize);
    baseWalls.push(...c.walls);
    baseGates.push(...c.gates);
  }
  const walled = new Set(baseWalls.map(w => key(w.at.x, w.at.z)));
  for (const k of walled) occupied.add(k);

  // --- Keep the ground under the Corpo Plaza decks clear ---
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const dx = Math.max(0, Math.abs(x - center) - 0.5);
      const dz = Math.max(0, Math.abs(z - center) - 0.5);
      if (Math.hypot(dx, dz) * tileSize < PLAZA_CLEAR_RADIUS) occupied.add(key(x, z));
    }
  }

  // --- Ordinary buildings: drawn by hand in sim/cityPlan.ts ---
  for (const p of planBuildings(gridSize, opts.plan)) {
    const tiles: GridPos[] = [];
    for (let x = p.x; x < p.x + p.w; x++) for (let z = p.z; z < p.z + p.d; z++) tiles.push({ x, z });
    const clash = tiles.find(t => occupied.has(key(t.x, t.z)) || buildingMap.has(key(t.x, t.z)));
    if (clash) throw new Error(`city plan: building at ${clash.x},${clash.z} stands on a road, node, landmark or the plaza`);
    const district = districtOfBlock(blockIndexOf(p.x), blockIndexOf(p.z), gridSize);
    const style = DISTRICT_STYLES[district];
    const type = style.types.length > 1 && tiles.length > 1 ? style.types[1] : style.types[0];
    const [lo, hi] = style.height;
    const height = lo + ((hi - lo) * (p.tier - 1)) / 8;
    // Multi-tile buildings fill their tiles so they read as one mass; single tiles stand alone.
    const width = tileSize * (tiles.length > 1 ? 0.96 : 0.7);
    const footprint: NonNullable<BuildingData['footprint']> = { x: p.x, z: p.z, w: p.w, d: p.d };
    if (p.tower) footprint.tower = { ...p.tower };
    const blockId = p.id;
    const own = tiles.map(t => {
      const h = !p.tower ? height : t.x === p.tower.x && t.z === p.tower.z ? Math.min(hi * 1.25, height * 1.2) : PODIUM_HEIGHT;
      occupied.add(key(t.x, t.z));
      buildingMap.set(key(t.x, t.z), blockId);
      return { ...building(`b-${t.x}-${t.z}`, t.x, t.z, type, h, blockId, [width, h, width]), footprint };
    });
    buildings.push(...own);
    blocks.push({ id: blockId, type, buildingIds: own.map(b => b.id), owner: null });
  }

  // --- Everything that isn't a building can be driven on ---
  const roadTiles: RoadTileData[] = [];
  const roadTileSet = new Set<string>();
  const tileTypeMap: Record<string, RoadType> = {};
  for (let x = 0; x < gridSize; x++) {
    for (let z = 0; z < gridSize; z++) {
      const k = key(x, z);
      if (buildingMap.has(k) || walled.has(k)) continue;
      roadTileSet.add(k);
      const type = reservedTypeMap.get(k) ?? 'open';
      tileTypeMap[k] = type;
      roadTiles.push({ x, z, type });
    }
  }

  // City lots a street or main avenue runs through are two half-blocks, not one whole block:
  // their buildings say so, and clearing them never makes a base site (sim/bases.ts).
  const lotSplit = (x: number, z: number) => {
    const x0 = Math.floor(x / ROAD_STRIDE) * ROAD_STRIDE, z0 = Math.floor(z / ROAD_STRIDE) * ROAD_STRIDE;
    for (let tx = x0 + 1; tx < x0 + ROAD_STRIDE; tx++) {
      for (let tz = z0 + 1; tz < z0 + ROAD_STRIDE; tz++) {
        const type = tileTypeMap[key(tx, tz)];
        if (type === 'main' || type === 'street') return true;
      }
    }
    return false;
  };
  for (const b of buildings) if (lotSplit(b.gridX, b.gridZ)) b.splitLot = true;

  return { buildings, blocks, roadTiles, roadTileSet, tileTypeMap, sentinels, landmarks, baseWalls, baseGates };
}
