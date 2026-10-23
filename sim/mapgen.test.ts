import { describe, expect, it } from 'vitest';
import { PLAZA_CLEAR_RADIUS, generateCity, planBuildings, seededRandom } from './mapgen';
import { CITY_PLAN } from './cityPlan';
import { districtAt } from './districts';

const SIZE = 79;
const BLUE = { x: 4, z: 4 };
const RED = { x: 74, z: 74 };
const options = () => ({ gridSize: SIZE, tileSize: 14, blueBase: { x: 4, z: 4 }, redBase: { x: 74, z: 74 } });
const mirror = (x: number, z: number) => `${SIZE - 1 - x},${SIZE - 1 - z}`;

describe('generateCity', () => {
  it('is point-symmetric', () => {
    const city = generateCity(options());
    const at = new Map(city.buildings.map(b => [`${b.gridX},${b.gridZ}`, b]));
    for (const b of city.buildings) {
      const twin = at.get(mirror(b.gridX, b.gridZ));
      expect(twin, `building at ${b.gridX},${b.gridZ}`).toBeDefined();
      expect(twin!.type).toBe(b.type);
      expect(twin!.height).toBeCloseTo(b.height);
    }
    for (const tile of city.roadTileSet) {
      const [x, z] = tile.split(',').map(Number);
      expect(city.roadTileSet.has(mirror(x, z))).toBe(true);
      expect(city.tileTypeMap[mirror(x, z)]).toBe(city.tileTypeMap[tile]);
    }
  });

  it('places 6 core nodes and 5 guarded server nodes', () => {
    const city = generateCity(options());
    expect(city.buildings.filter(b => b.type === 'core_node')).toHaveLength(6);
    const servers = city.buildings.filter(b => b.type === 'server_node');
    expect(servers).toHaveLength(5);
    expect(city.sentinels).toHaveLength(5);
    for (const s of servers) expect(city.sentinels.some(d => d.gridPos.x === s.gridX && d.gridPos.z === s.gridZ)).toBe(true);
  });

  it('gives each side a server node in its own half, two contested ones and one in the centre', () => {
    const city = generateCity(options());
    const servers = city.buildings.filter(b => b.type === 'server_node');
    const toBlue = (b: typeof servers[0]) => Math.hypot(b.gridX - BLUE.x, b.gridZ - BLUE.z);
    const toRed = (b: typeof servers[0]) => Math.hypot(b.gridX - RED.x, b.gridZ - RED.z);
    expect(servers.filter(b => toBlue(b) < toRed(b) - 10)).toHaveLength(1);
    expect(servers.filter(b => toRed(b) < toBlue(b) - 10)).toHaveLength(1);
    expect(servers.filter(b => Math.abs(toBlue(b) - toRed(b)) < 1)).toHaveLength(3);
  });

  it('rings the centre with four solid, mirrored corporate landmarks', () => {
    const city = generateCity(options());
    expect(city.landmarks.map(l => l.kind).sort()).toEqual(['axiom', 'nexum', 'tokugen', 'vanta']);
    const centre = (SIZE - 1) / 2;
    const lots = new Set(city.landmarks.map(l => `${l.center.x},${l.center.z}`));
    for (const l of city.landmarks) {
      expect(Math.abs(l.center.x - centre)).toBe(6);
      expect(Math.abs(l.center.z - centre)).toBe(6);
      expect(lots.has(mirror(l.center.x, l.center.z))).toBe(true);
      expect(l.tiles).toHaveLength(25);
      for (const t of l.tiles) {
        expect(city.roadTileSet.has(`${t.x},${t.z}`)).toBe(false);
        expect(city.buildings.some(b => b.gridX === t.x && b.gridZ === t.z)).toBe(false);
      }
    }
  });

  it('is the same city every time', () => {
    const a = generateCity(options());
    const b = generateCity(options());
    expect(a.buildings).toEqual(b.buildings);
  });

  it('never seals open ground off from the streets', () => {
    const city = generateCity(options());
    const seen = new Set(['4,5']);
    const queue = ['4,5'];
    while (queue.length) {
      const [x, z] = queue.pop()!.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${z + dz}`;
        if (city.roadTileSet.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
      }
    }
    expect(seen.size).toBe(city.roadTileSet.size);
  });

  it('keeps an alley between buildings', () => {
    const city = generateCity(options());
    const groupAt = new Map(city.buildings.filter(b => b.blockId.startsWith('block-')).map(b => [`${b.gridX},${b.gridZ}`, b.blockId]));
    for (const [k, id] of groupAt) {
      const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const other = groupAt.get(`${x + dx},${z + dz}`);
        if (other) expect(other).toBe(id);
      }
    }
  });

  it('builds up densest and tallest in the middle, thinning out to the edge', () => {
    const city = generateCity(options());
    const stats: Record<string, { lots: number; built: number; height: number }> = {};
    const at = new Map(city.buildings.filter(b => b.blockId.startsWith('block-')).map(b => [`${b.gridX},${b.gridZ}`, b]));
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) {
      const d = districtAt(x, z, SIZE);
      if (!d) continue;
      const s = stats[d] ??= { lots: 0, built: 0, height: 0 };
      s.lots++;
      const b = at.get(`${x},${z}`);
      if (b) { s.built++; s.height += b.height; }
    }
    const fill = (d: string) => stats[d].built / stats[d].lots;
    const height = (d: string) => stats[d].height / stats[d].built;
    expect(fill('downtown')).toBeGreaterThan(fill('outskirts'));
    expect(fill('midtown')).toBeGreaterThan(fill('outskirts'));
    expect(fill('outskirts')).toBeGreaterThan(fill('fringe'));
    expect(height('downtown')).toBeGreaterThan(height('midtown'));
    expect(height('midtown')).toBeGreaterThan(height('industrial'));
  });

  it('lets both bases reach every node', () => {
    const city = generateCity(options());
    const reach = (from: string) => {
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length) {
        const [x, z] = queue.shift()!.split(',').map(Number);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${x + dx},${z + dz}`;
          if (city.roadTileSet.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
        }
      }
      return seen;
    };
    for (const base of ['4,5', '74,73']) {
      const reached = reach(base);
      for (const node of city.buildings.filter(b => b.type === 'core_node' || b.type === 'server_node')) {
        const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => reached.has(`${node.gridX + dx},${node.gridZ + dz}`));
        expect(touching, `${base} reaches ${node.id}`).toBe(true);
      }
    }
  });
});

it('seededRandom is deterministic and in range', () => {
  const a = seededRandom(3);
  const b = seededRandom(3);
  for (let i = 0; i < 100; i++) {
    const v = a();
    expect(v).toBe(b());
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

it('records the whole building on each of its tiles, mirrored', () => {
  const city = generateCity(options());
  const at = new Map(city.buildings.map(b => [`${b.gridX},${b.gridZ}`, b]));
  for (const b of city.buildings.filter(x => x.footprint)) {
    const f = b.footprint!;
    expect(b.gridX).toBeGreaterThanOrEqual(f.x);
    expect(b.gridX).toBeLessThan(f.x + f.w);
    expect(b.gridZ).toBeGreaterThanOrEqual(f.z);
    expect(b.gridZ).toBeLessThan(f.z + f.d);
    for (let x = f.x; x < f.x + f.w; x++) for (let z = f.z; z < f.z + f.d; z++) expect(at.get(`${x},${z}`)?.blockId).toBe(b.blockId);
    const twin = at.get(`${78 - b.gridX},${78 - b.gridZ}`)!;
    expect(twin.footprint).toMatchObject({ x: 78 - (f.x + f.w - 1), z: 78 - (f.z + f.d - 1), w: f.w, d: f.d });
    if (f.tower) expect(twin.footprint!.tower).toEqual({ x: 78 - f.tower.x, z: 78 - f.tower.z });
  }
  expect(city.buildings.some(b => b.footprint?.tower)).toBe(true);
});

it('builds nothing under the Corpo Plaza roundabout', () => {
  const city = generateCity(options());
  for (const b of city.buildings.filter(x => x.type !== 'server_node')) {
    // The nearest point of the building's tile to the centre of the map, in world units.
    const dx = Math.max(0, Math.abs(b.gridX - 39) - 0.5) * 14;
    const dz = Math.max(0, Math.abs(b.gridZ - 39) - 0.5) * 14;
    expect(Math.hypot(dx, dz), `${b.id}`).toBeGreaterThanOrEqual(PLAZA_CLEAR_RADIUS);
  }
});

describe('the hand-drawn city plan', () => {
  const plan = planBuildings(SIZE);

  it('draws every building as a rectangle with a twin across the centre, and puts something in every open block', () => {
    expect(plan.length).toBeGreaterThan(300);
    expect(plan.filter(b => b.id.endsWith('-m'))).toHaveLength(plan.length / 2);
    const city = generateCity(options());
    // Each plan building is one capture block, all its tiles together.
    for (const b of plan) expect(city.blocks.find(k => k.id === b.id)!.buildingIds).toHaveLength(b.w * b.d);
    const lotsWithBuildings = new Set(city.buildings.map(b => `${Math.floor(b.gridX / 6)},${Math.floor(b.gridZ / 6)}`));
    // The only lots with no building: the two starting bases' paved squares, the three cleared
    // blocks round each corner core node, and the four landmarks.
    expect(169 - lotsWithBuildings.size).toBe(2 + 6 + 4);
  });

  it('keeps every tile drawn off the plan the same turned round', () => {
    for (let z = 0; z < SIZE; z++) for (let x = 0; x < SIZE; x++) {
      const c = CITY_PLAN[z][x];
      const twin = CITY_PLAN[SIZE - 1 - z][SIZE - 1 - x];
      expect(/[1-9T]/.test(c), `${x},${z}`).toBe(/[1-9T]/.test(twin));
    }
  });

  it('rejects a plan that breaks the rules', () => {
    const blank = Array.from({ length: SIZE }, () => '.'.repeat(SIZE));
    const draw = (cells: [number, number, string][]) => blank.map((row, z) => row.split('').map((c, x) => cells.find(([cx, cz]) => cx === x && cz === z)?.[2] ?? c).join(''));
    // An L shape.
    expect(() => planBuildings(SIZE, draw([[10, 10, '5'], [11, 10, '5'], [10, 11, '5'], [68, 68, '5'], [67, 68, '5'], [68, 67, '5']]))).toThrow(/rectangle/);
    // No twin.
    expect(() => planBuildings(SIZE, draw([[10, 10, '5']]))).toThrow(/twin/);
    // A twin of another height.
    expect(() => planBuildings(SIZE, draw([[10, 10, '5'], [68, 68, '4']]))).toThrow(/twin/);
    // Two heights in one building.
    expect(() => planBuildings(SIZE, draw([[10, 10, '5'], [11, 10, '4'], [68, 68, '5'], [67, 68, '4']]))).toThrow(/height/);
    // On a road.
    expect(() => generateCity({ ...options(), plan: draw([[12, 10, '5'], [66, 68, '5']]) })).toThrow(/road/);
    expect(() => generateCity({ ...options(), plan: draw([[13, 10, '5'], [65, 68, '5']]) })).not.toThrow();
  });
});

describe('the starting bases\' walls', () => {
  const city = generateCity(options());
  it('rings each base on its open sides, leaving gates where the roads cross, mirrored', () => {
    expect(city.baseWalls.length).toBeGreaterThan(20);
    expect(city.baseGates).toHaveLength(8);
    for (const w of city.baseWalls) {
      expect(city.roadTileSet.has(`${w.at.x},${w.at.z}`), `wall ${w.at.x},${w.at.z}`).toBe(false);
      expect(city.buildings.some(b => b.gridX === w.at.x && b.gridZ === w.at.z)).toBe(false);
      expect(city.baseWalls.some(m => m.at.x === SIZE - 1 - w.at.x && m.at.z === SIZE - 1 - w.at.z && m.runs === w.runs)).toBe(true);
    }
    for (const g of city.baseGates) expect(city.tileTypeMap[`${g.x},${g.z}`]).toMatch(/street|main/);
    // Blue's ring: four tiles out from its HQ, on the side facing the map.
    expect(city.baseWalls.filter(w => w.at.x < 39).every(w => w.at.x === BLUE.x + 4 || w.at.z === BLUE.z + 4)).toBe(true);
  });

  it('lets the bases out only through the gates', () => {
    const blocked = new Set(city.baseGates.map(g => `${g.x},${g.z}`));
    const seen = new Set(['4,4']);
    const queue = ['4,4'];
    while (queue.length) {
      const [x, z] = queue.pop()!.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${z + dz}`;
        if (city.roadTileSet.has(k) && !blocked.has(k) && !seen.has(k)) { seen.add(k); queue.push(k); }
      }
    }
    // With the gates shut, nothing beyond the wall can be reached.
    for (const k of seen) {
      const [x, z] = k.split(',').map(Number);
      expect(x <= 8 && z <= 8, k).toBe(true);
    }
  });
});
