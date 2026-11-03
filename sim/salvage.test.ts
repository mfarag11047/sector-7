import { describe, expect, it } from 'vitest';
import type { DoctrineType, UnitData } from '../types';
import { SALVAGE, salvageTick, salvageValue, type Wreck, wreckOf } from './salvage';
import { unitCost } from './economy';

const unit = (id: string, team: UnitData['team'], at: { x: number; z: number }, extra: Partial<UnitData> = {}): UnitData => ({
  id, type: 'razorback', unitClass: 'armor', team, gridPos: at, path: [], visionRange: 3,
  health: 50, maxHealth: 200, battery: 100, maxBattery: 100, cooldowns: {}, ...extra,
} as UnitData);

function run(ms: number, wrecks: Wreck[], units: UnitData[], doctrine: Partial<Record<'blue' | 'red', DoctrineType>>) {
  const payouts: { team: string; cores: number }[] = [];
  const repairs = new Map<string, number>();
  for (let now = 0; now < ms; now += 100) {
    const r = salvageTick(wrecks, units, t => doctrine[t] ?? null, now, 100);
    wrecks = r.wrecks; payouts.push(...r.payouts); r.repairs.forEach((v, k) => repairs.set(k, v));
  }
  return { wrecks, payouts, repairs };
}

describe('salvage', () => {
  it('only vehicles leave wrecks, worth a share of their cost', () => {
    expect(salvageValue('tank')).toBe(Math.round(unitCost('tank') * SALVAGE.share));
    expect(salvageValue('titan_dropped')).toBe(salvageValue('tank'));
    expect(salvageValue('trooper')).toBe(0);
    expect(salvageValue('attack_drone')).toBe(0);
    expect(wreckOf('trooper', { x: 1, z: 1 }, 0, 'w')).toBeNull();
  });

  it('Heavy Metal strips a wreck it stands at: cores, and its vehicles patched up', () => {
    const w = wreckOf('tank', { x: 10, z: 10 }, 0, 'w')!;
    const r = run(SALVAGE.ms + 200, [w], [unit('hm', 'blue', { x: 11, z: 10 })], { blue: 'heavy_metal' });
    expect(r.payouts).toEqual([expect.objectContaining({ team: 'blue', cores: w.value })]);
    expect(r.repairs.get('hm')).toBeCloseTo(200 * SALVAGE.repair);
    expect(r.wrecks).toEqual([]);
  });

  it('not for another doctrine, nor while contested; it burns out in time', () => {
    const w = wreckOf('tank', { x: 10, z: 10 }, 0, 'w')!;
    expect(run(SALVAGE.ms * 2, [w], [unit('s', 'blue', { x: 11, z: 10 })], { blue: 'shadow_ops' }).payouts).toEqual([]);
    expect(run(SALVAGE.ms * 2, [w], [unit('hm', 'blue', { x: 11, z: 10 }), unit('r', 'red', { x: 10, z: 11 })], { blue: 'heavy_metal' }).payouts).toEqual([]);
    expect(run(SALVAGE.lifeMs + 100, [w], [], {}).wrecks).toEqual([]);
  });
});
