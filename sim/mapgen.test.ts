import { describe, expect, it } from 'vitest';
import { generateCity, seededRandom } from './mapgen';
import { districtAt } from './districts';

const SIZE = 79;
const BLUE = { x: 4, z: 4 };
const RED = { x: 74, z: 74 };
const options = (seed: number) => ({ seed, gridSize: SIZE, tileSize: 14, buildingDensity: 1, blueBase: { x: 4, z: 4 }, redBase: { x: 74, z: 74 } });
const mirror = (x: number, z: number) => `${SIZE - 1 - x},${SIZE - 1 - z}`;

describe('generateCity', () => {
  it.each([1, 42, 1234567])('is point-symmetric for seed %i', seed => {
    const city = generateCity(options(seed));
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
    const city = generateCity(options(7));
    expect(city.buildings.filter(b => b.type === 'core_node')).toHaveLength(6);
    const servers = city.buildings.filter(b => b.type === 'server_node');
    expect(servers).toHaveLength(5);
    expect(city.sentinels).toHaveLength(5);
    for (const s of servers) expect(city.sentinels.some(d => d.gridPos.x === s.gridX && d.gridPos.z === s.gridZ)).toBe(true);
  });

  it('gives each side a server node in its own half, two contested ones and one in the centre', () => {
    const city = generateCity(options(7));
    const servers = city.buildings.filter(b => b.type === 'server_node');
    const toBlue = (b: typeof servers[0]) => Math.hypot(b.gridX - BLUE.x, b.gridZ - BLUE.z);
    const toRed = (b: typeof servers[0]) => Math.hypot(b.gridX - RED.x, b.gridZ - RED.z);
    expect(servers.filter(b => toBlue(b) < toRed(b) - 10)).toHaveLength(1);
    expect(servers.filter(b => toRed(b) < toBlue(b) - 10)).toHaveLength(1);
    expect(servers.filter(b => Math.abs(toBlue(b) - toRed(b)) < 1)).toHaveLength(3);
  });

  it('rings the centre with four solid, mirrored corporate landmarks', () => {
    const city = generateCity(options(11));
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

  it('is reproducible from its seed, and different seeds differ', () => {
    const a = generateCity(options(99));
    const b = generateCity(options(99));
    const c = generateCity(options(100));
    expect(a.buildings.map(x => x.id)).toEqual(b.buildings.map(x => x.id));
    expect(a.buildings.map(x => x.id)).not.toEqual(c.buildings.map(x => x.id));
  });

  it.each([1, 42])('never seals open ground off from the streets (seed %i)', seed => {
    const city = generateCity(options(seed));
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
    const city = generateCity(options(3));
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
    const city = generateCity(options(42));
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
    const city = generateCity(options(5));
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
