// How a match is won.
//
//   Destruction: every enemy Command HQ is destroyed (its starting HQ and any it has built,
//   sim/bases.ts).
//   Domination: hold DOMINATION_NODES of the core nodes for DOMINATION_MS without a break.
//
// Domination is what stops a turtling player from sitting on a lead forever: the side that
// controls the city's power wins even if it can't crack the enemy base.

import type { BuildingData, StructureData } from '../types';
import type { Team } from './commands';
import { coreNodesHeld } from './orders';

export const DOMINATION_NODES = 4;
export const DOMINATION_MS = 120_000;

export type VictoryReason = 'destruction' | 'domination';
export interface Victory { winner: Team; reason: VictoryReason }

// When each side started holding enough nodes, or null when it isn't.
export type DominationClock = Record<Team, number | null>;
export const freshDominationClock = (): DominationClock => ({ blue: null, red: null });

export function checkVictory(
  structures: readonly StructureData[],
  buildings: readonly BuildingData[],
  clock: DominationClock,
  now: number,
): { victory: Victory | null; clock: DominationClock } {
  const hqAlive = (team: Team) => structures.some(s => s.type === 'hq' && s.team === team && s.health > 0);
  const blueAlive = hqAlive('blue');
  const redAlive = hqAlive('red');
  if (!blueAlive || !redAlive) {
    // Both falling on the same tick is vanishingly rare; call it for the side still standing, else blue.
    return { victory: { winner: redAlive ? 'red' : 'blue', reason: 'destruction' }, clock };
  }

  const next: DominationClock = { ...clock };
  for (const team of ['blue', 'red'] as const) {
    const dominating = coreNodesHeld(buildings, team) >= DOMINATION_NODES;
    next[team] = dominating ? (clock[team] ?? now) : null;
    if (dominating && now - next[team]! >= DOMINATION_MS) return { victory: { winner: team, reason: 'domination' }, clock: next };
  }
  return { victory: null, clock: next };
}

// Milliseconds left until a team wins by domination, or null when it isn't dominating.
export const dominationRemaining = (clock: DominationClock, team: Team, now: number) =>
  clock[team] === null ? null : Math.max(0, DOMINATION_MS - (now - clock[team]!));
