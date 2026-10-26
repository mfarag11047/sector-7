import { describe, expect, it } from 'vitest';
import { CITY_CONFIG, TEAM_BASES } from '../constants';
import type { StructureData, UnitData } from '../types';
import { blocksPath, COMPOUND, compoundStructures, heldAtGate, hostileGateAt } from './compound';
import { createHeadlessMatch, stepMatch } from './headless';
import { generateCity } from './mapgen';
import { advanceMover, MovementEnv } from './movement';
import { createUnit } from './production';

const { gridSize, tileSize } = CITY_CONFIG;
const city = generateCity({ gridSize, tileSize, blueBase: TEAM_BASES.blue, redBase: TEAM_BASES.red });

describe('the starting bases\' walls and gates', () => {
  const pieces = compoundStructures(city.baseWalls, city.baseGates, gridSize);

  it('makes every wall tile and gate a structure of the side it rings', () => {
    const walls = pieces.filter(s => s.type === 'base_wall');
    const gates = pieces.filter(s => s.type === 'base_gate');
    expect(walls).toHaveLength(city.baseWalls.length);
    expect(gates).toHaveLength(city.baseGates.length);
    for (const team of ['blue', 'red'] as const) {
      expect(walls.filter(w => w.team === team)).toHaveLength(city.baseWalls.length / 2);
      expect(gates.filter(g => g.team === team)).toHaveLength(city.baseGates.length / 2);
    }
    expect(walls.filter(w => w.health === COMPOUND.cornerHealth)).toHaveLength(2);
    expect(pieces.every(s => s.health === s.maxHealth && s.health > 0)).toBe(true);
  });

  it('plans paths through gates but not walls', () => {
    expect(blocksPath({ type: 'base_wall' })).toBe(true);
    expect(blocksPath({ type: 'base_gate' })).toBe(false);
    expect(blocksPath({ type: 'hq' })).toBe(true);
  });

  it('shuts a standing gate to the other side only', () => {
    const gate = pieces.find(s => s.type === 'base_gate' && s.team === 'blue')!;
    const tile = `${gate.gridPos.x},${gate.gridPos.z}`;
    expect(hostileGateAt(pieces, 'blue', tile)).toBe(false);
    expect(hostileGateAt(pieces, 'red', tile)).toBe(true);
    expect(heldAtGate(pieces, 'red', [tile, '0,0'])).toBe(true);
    expect(heldAtGate(pieces, 'red', ['0,0', tile])).toBe(false);
    // Once it is down, it stops nobody.
    const down: StructureData[] = pieces.filter(s => s.id !== gate.id);
    expect(hostileGateAt(down, 'red', tile)).toBe(false);
  });

  it('holds a unit whose next tile is shut instead of stepping it there', () => {
    const unit: UnitData = { ...createUnit('tank', 'red', 't', { x: 0, z: 0 }), path: ['1,0'] };
    const env: MovementEnv = { tileSize, tileTypeOf: () => 'street', arrive: u => u, shut: () => true };
    const after = advanceMover(unit, 1000, env);
    expect(after.gridPos).toEqual({ x: 0, z: 0 });
    expect(after.moveProgress ?? 0).toBe(0);
    expect(after.moveSpeed ?? 0).toBe(0);
  });
});

describe('a gate in a match', () => {
  // Blue's gate on the road east out of its base, and the tiles either side of it.
  const gate = city.baseGates.find(g => g.x > TEAM_BASES.blue.x && g.z === 6) ?? city.baseGates[0];
  const outside = { x: gate.x + 2, z: gate.z };
  const inside = { x: gate.x - 1, z: gate.z };
  const quiet = () => {
    const m = createHeadlessMatch({ seed: 1, difficulty: { blue: 'normal', red: 'normal' }, doctrine: { blue: null, red: null } });
    m.nextThink = { blue: Infinity, red: Infinity };
    return m;
  };
  const route = (from: { x: number; z: number }, to: { x: number; z: number }) => {
    const step = Math.sign(to.x - from.x);
    const path: string[] = [];
    for (let x = from.x + step; x !== to.x + step; x += step) path.push(`${x},${from.z}`);
    return path;
  };
  const gateId = `gate-${gate.x}-${gate.z}`;

  it('lets its own side straight through', () => {
    const m = quiet();
    m.units = [{ ...createUnit('tank', 'blue', 'b', inside), path: route(inside, outside) }];
    for (let i = 0; i < 100; i++) stepMatch(m);
    expect(m.units[0].gridPos).toEqual(outside);
    const g = m.structures.find(s => s.id === gateId)!;
    expect(g.health).toBe(g.maxHealth);
  });

  it('stops the other side at it until they have shot it down, then lets them in', () => {
    const m = quiet();
    m.units = [{ ...createUnit('tank', 'red', 'r', outside), path: route(outside, inside) }];
    let reachedGateWhileStanding = false;
    let hurt = false;
    for (let i = 0; i < 3000 && m.units.length > 0; i++) {
      stepMatch(m);
      const g = m.structures.find(s => s.id === gateId);
      const t = m.units.find(u => u.id === 'r');
      if (!t) break;
      if (g && t.gridPos.x === gate.x && t.gridPos.z === gate.z) reachedGateWhileStanding = true;
      if (g && g.health < g.maxHealth) hurt = true;
      if (!g && t.gridPos.x <= gate.x) break;
    }
    expect(reachedGateWhileStanding).toBe(false);
    expect(hurt).toBe(true);
    expect(m.structures.some(s => s.id === gateId)).toBe(false);
    const t = m.units.find(u => u.id === 'r');
    if (t) expect(t.gridPos.x).toBeLessThanOrEqual(gate.x);
  });
});
