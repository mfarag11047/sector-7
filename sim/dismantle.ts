// Disassembling base buildings, to change course.
//
// Any building on a Command HQ's pads (sim/baseLayout.ts), production, tech, refinery or turret,
// can be taken down by its owner (DISASSEMBLE_STRUCTURE). Not the HQ, and not walls.
// - Still going up (under construction, or a turret blueprint): cancelled at once, its full cost
//   back.
// - Finished: it stops working and comes down over DISMANTLE.ms, then is gone and pays back
//   DISMANTLE.refundShare of what was spent on it (a Core Refinery's level 2 upgrade included).
//   The refund comes only when it is down, so taking down a building about to be destroyed
//   gains nothing. The same order again before then stops the dismantling.
// Whatever it was doing is cancelled and refunded in full straight away: units in its queue, a
// warhead being built, research in progress, a refinery upgrade.
//
// Pure: sim/orders.ts starts and cancels; CityMap and the headless runner advance it.

import { STRUCTURE_INFO, UNIT_STATS } from '../constants';
import type { StructureData, StructureType } from '../types';
import type { Team } from './commands';
import { padKindOf } from './baseLayout';
import { REFINERY } from './refinery';
import { upgradeDef } from './upgrades';
import { warheadCost } from './economy';

export const DISMANTLE = { ms: 8000, refundShare: 0.5 };

export const canDismantle = (type: StructureType) => padKindOf(type) !== null;
export const isDismantling = (s: Pick<StructureData, 'dismantle'>) => !!s.dismantle;
export const isUnfinished = (s: StructureData) => s.isBlueprint || (s.buildRemainingMs ?? 0) > 0;

// What was spent on the building itself.
export const builtCost = (s: StructureData) =>
  STRUCTURE_INFO[s.type].cost + (s.type === 'refinery' && s.refineryLevel === 2 ? REFINERY.upgrade.cost : 0);

// What taking a finished building down pays back.
export const dismantleRefund = (s: StructureData) => Math.floor(builtCost(s) * DISMANTLE.refundShare);

// What it was paid for but hasn't delivered: queued units, a warhead, research, a refinery
// upgrade. All of it comes back when it is taken down.
export function cancelledWork(s: StructureData): { cores: number; compute: number } {
  let cores = 0;
  let compute = 0;
  for (const q of s.queue ?? []) cores += UNIT_STATS[q.unitType].cost;
  if (s.production?.active) cores += warheadCost(s.production.item);
  if (s.research) {
    const def = upgradeDef(s.research.upgrade);
    cores += def?.cost ?? 0;
    compute += def?.compute ?? 0;
  }
  if (s.refineryUpgrade) cores += REFINERY.upgrade.cost;
  return { cores, compute };
}

// The building as it starts coming down: idle, with its refund noted.
export const startDismantling = (s: StructureData): StructureData => ({
  ...s,
  queue: [],
  production: s.production ? { ...s.production, active: false, progress: 0 } : undefined,
  research: undefined,
  refineryUpgrade: undefined,
  dismantle: { remainingMs: DISMANTLE.ms, totalMs: DISMANTLE.ms, refund: dismantleRefund(s) },
});

// Advances every dismantling by `stepMs`. Finished ones are gone; `done` says who gets what back.
export function advanceDismantling(structures: StructureData[], stepMs: number): { structures: StructureData[]; done: { team: Team; type: StructureType; refund: number }[] } {
  if (!structures.some(isDismantling)) return { structures, done: [] };
  const done: { team: Team; type: StructureType; refund: number }[] = [];
  const next: StructureData[] = [];
  for (const s of structures) {
    if (!s.dismantle || s.health <= 0) { next.push(s); continue; }
    const remainingMs = s.dismantle.remainingMs - stepMs;
    if (remainingMs > 0) { next.push({ ...s, dismantle: { ...s.dismantle, remainingMs } }); continue; }
    done.push({ team: s.team, type: s.type, refund: s.dismantle.refund });
  }
  return { structures: next, done };
}
