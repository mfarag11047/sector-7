// How a match is won: destroy every enemy Command HQ, its starting HQ and any it has built
// (sim/bases.ts). Holding territory brings income, population and tech, but never wins by itself.

import type { StructureData } from '../types';
import type { Team } from './commands';

export type VictoryReason = 'destruction';
export interface Victory { winner: Team; reason: VictoryReason }

export function checkVictory(structures: readonly StructureData[]): Victory | null {
  const hqAlive = (team: Team) => structures.some(s => s.type === 'hq' && s.team === team && s.health > 0);
  const blueAlive = hqAlive('blue');
  const redAlive = hqAlive('red');
  if (blueAlive && redAlive) return null;
  // Both falling on the same tick is vanishingly rare; call it for the side still standing, else blue.
  return { winner: redAlive ? 'red' : 'blue', reason: 'destruction' };
}
