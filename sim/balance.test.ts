// Balance guard rails. These fight equal-cost armies in the headless skirmish (sim/battle.ts)
// and check the counter relationships described in docs/GAME_DESIGN.md still hold.
//
// To see the full matchup matrix while tuning, run:
//   BALANCE_MATRIX=1 npx vitest run sim/balance.test.ts
// (PowerShell: $env:BALANCE_MATRIX=1; npx vitest run sim/balance.test.ts)

import { describe, expect, it } from 'vitest';
import type { UnitType } from '../types';
import { armyOf, ArmyEntry, simulateBattle } from './battle';

const BUDGET = 1200;
const COMBAT_UNITS: UnitType[] = ['trooper', 'lancer', 'ghost', 'razorback', 'tank', 'aegis', 'wasp', 'hornet'];

// Margin from a's point of view, averaged over both starting sides to cancel any side bias.
// +1 means a's army wins untouched, -1 means it is wiped out without loss to b.
function margin(a: ArmyEntry[], b: ArmyEntry[]) {
  const asBlue = simulateBattle(a, b);
  const asRed = simulateBattle(b, a);
  return ((asBlue.blueLeft - asBlue.redLeft) + (asRed.redLeft - asRed.blueLeft)) / 2;
}
const unitMargin = (a: UnitType, b: UnitType, budget = BUDGET) => margin(armyOf(a, budget), armyOf(b, budget));

describe('counters at equal cost', () => {
  it.each([
    // Vehicles beat infantry
    ['razorback', 'trooper'],
    ['tank', 'trooper'],
    ['razorback', 'lancer'],
    // Infantry beat air
    ['trooper', 'hornet'],
    ['trooper', 'wasp'],
    // Air beats heavy vehicles
    ['hornet', 'tank'],
    ['wasp', 'tank'],
    // Specialists
    ['lancer', 'tank'],
    ['tank', 'razorback'],
    ['aegis', 'hornet'],
    ['aegis', 'wasp'],
    ['wasp', 'hornet'],
    ['trooper', 'lancer'],
  ] as [UnitType, UnitType][])('%s beats %s', (winner, loser) => {
    expect(unitMargin(winner, loser)).toBeGreaterThan(0.15);
  });

  it('holds at smaller and larger army sizes', () => {
    for (const budget of [700, 2400]) {
      expect(unitMargin('razorback', 'trooper', budget)).toBeGreaterThan(0.1);
      expect(unitMargin('trooper', 'hornet', budget)).toBeGreaterThan(0.1);
      expect(unitMargin('hornet', 'tank', budget)).toBeGreaterThan(0.1);
      expect(unitMargin('lancer', 'tank', budget)).toBeGreaterThan(0.1);
    }
  });
});

describe('a lone tank against Lancers', () => {
  // One tank beats one Lancer squad easily, two only just, and loses to three.
  const tankLeft = (lancers: number) => {
    const asBlue = simulateBattle([{ type: 'tank', count: 1 }], [{ type: 'lancer', count: lancers }]);
    const asRed = simulateBattle([{ type: 'lancer', count: lancers }], [{ type: 'tank', count: 1 }]);
    return (asBlue.blueLeft + asRed.redLeft) / 2;
  };
  it('wins against one or two, barely against two, and loses to three', () => {
    expect(tankLeft(1)).toBeGreaterThan(0.5);
    expect(tankLeft(2)).toBeGreaterThan(0);
    expect(tankLeft(2)).toBeLessThan(0.2);
    expect(tankLeft(3)).toBe(0);
  });
});

describe('no dominant unit', () => {
  it.each(COMBAT_UNITS)('%s has a counter', unit => {
    const best = Math.max(...COMBAT_UNITS.filter(u => u !== unit).map(other => unitMargin(other, unit)));
    expect(best).toBeGreaterThan(0.2);
  });

  it('mirror matches end level', () => {
    for (const unit of ['trooper', 'razorback', 'tank', 'hornet'] as UnitType[]) {
      expect(Math.abs(unitMargin(unit, unit))).toBeLessThan(0.1);
    }
  });
});

describe('no dominant army', () => {
  // Rough equal-cost compositions (about 1200-1450 cores).
  const infantryMix: ArmyEntry[] = [{ type: 'trooper', count: 9 }, { type: 'lancer', count: 4 }];
  const vehicles: ArmyEntry[] = [{ type: 'razorback', count: 3 }, { type: 'tank', count: 2 }];
  const troopers: ArmyEntry[] = [{ type: 'trooper', count: 15 }];
  const raiders: ArmyEntry[] = [{ type: 'razorback', count: 3 }, { type: 'trooper', count: 7 }];
  const air: ArmyEntry[] = [{ type: 'hornet', count: 3 }, { type: 'wasp', count: 1 }];

  it('compositions counter each other in a cycle', () => {
    expect(margin(troopers, infantryMix)).toBeGreaterThan(0.1);
    expect(margin(infantryMix, vehicles)).toBeGreaterThan(0.1);
    expect(margin(vehicles, troopers)).toBeGreaterThan(0.1);
    expect(margin(raiders, infantryMix)).toBeGreaterThan(0);
  });

  it('air punishes armies without anti-air', () => {
    expect(margin(air, vehicles)).toBeGreaterThan(0.3);
    expect(margin(troopers, air)).toBeGreaterThan(0.3);
  });
});

it.runIf(!!process.env.BALANCE_MATRIX)('prints the matchup matrix', () => {
  const rows = ['Row army vs column army at equal cost. Positive: row wins.', '           ' + COMBAT_UNITS.map(t => t.padStart(10)).join('')];
  for (const a of COMBAT_UNITS) rows.push(a.padEnd(11) + COMBAT_UNITS.map(b => unitMargin(a, b).toFixed(2).padStart(10)).join(''));
  console.log(rows.join('\n'));
});
