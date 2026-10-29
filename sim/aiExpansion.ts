// How the computer opens new bases (sim/bases.ts).
//
// A new Command HQ can only go up on a fully cleared city block, and city blocks only come down
// when something levels them. So when the AI wants another base (at Tier 3, or at Tier 2 once its
// building pads are all taken, while it holds fewer HQs than its difficulty allows) and has no
// cleared block on its side of the map to build on, it picks one to level with its Bombardment
// Drones (sim/aiSpecialists.ts):
//   - on its own half of the map, so the new base is one it can hold;
//   - near a core node, where the base's Core Refineries pay more (sim/refinery.ts);
//   - quick to bring down: outskirts blocks take fewer drops than the dense centre (sim/bombard.ts);
//   - with no enemy close, none of its own units under the blast, nothing of either side built on
//     it, and none of its own captured buildings in it.
// The pick doesn't depend on how much of the block is already down, so the drones keep at the same
// block until it is cleared. Then a unit goes to stand by it and the AI founds the base there once
// it can pay (aiSpecialists.ts baseMoves).
//
// Pure: plans only; sim/ai.ts acts on it.

import type { BuildingData, StructureData, UnitData } from '../types';
import { BASE_SITE, baseSites, lotCenter, lotOf, type BaseSite } from './bases';
import { BOMBARD, DROPS_TO_DESTROY, isIndestructible } from './bombard';
import type { GridPos, Team } from './commands';
import { baseProximity } from './refinery';
import type { Tier } from './units';

const dist = (a: GridPos, b: GridPos) => Math.hypot(a.x - b.x, a.z - b.z);
// How close an enemy may be to a site or a block before it is passed over.
const ENEMY_CLEARANCE = 8;
// How close its own units may be to a block it strikes: a drop hurts friend and foe.
const FRIENDLY_CLEARANCE = 3;

export interface ExpansionView {
  team: Team;
  tier: Tier;
  // Its building pads are all taken.
  padsFull: boolean;
  // How many Command HQs its difficulty lets it hold.
  maxBases: number;
  home: GridPos;
  enemyHome: GridPos;
  mine: readonly UnitData[];
  theirs: readonly UnitData[];
  structures: readonly StructureData[];
  buildings: readonly BuildingData[];
}

export interface ExpansionPlan {
  // It wants another Command HQ.
  wants: boolean;
  // Cleared blocks it could found one on, best first.
  sites: BaseSite[];
  // The block its Bombardment Drones should level for one, when it has none to build on.
  level: GridPos | null;
}

const coreNodesOf = (buildings: readonly BuildingData[]) =>
  buildings.filter(b => b.type === 'core_node' && !b.destroyed).map(b => ({ x: b.gridX, z: b.gridZ }));
const onOwnSide = (v: ExpansionView, at: GridPos) => dist(at, v.home) <= dist(at, v.enemyHome);
const enemyNear = (v: ExpansionView, at: GridPos) => v.theirs.some(t => t.type !== 'defense_drone' && dist(t.gridPos, at) <= ENEMY_CLEARANCE);

export function expansionPlan(v: ExpansionView): ExpansionPlan {
  const hqs = v.structures.filter(s => s.type === 'hq' && s.team === v.team && s.health > 0).length;
  const wants = (v.tier >= 3 || (v.tier >= 2 && v.padsFull)) && hqs < v.maxBases;
  if (!wants) return { wants, sites: [], level: null };
  const coreNodes = coreNodesOf(v.buildings);
  const payout = (at: GridPos) => baseProximity(at, coreNodes).multiplier;
  const sites = baseSites(v.buildings, v.structures)
    .filter(s => onOwnSide(v, s.at) && !enemyNear(v, s.at))
    .sort((a, b) => payout(b.at) - payout(a.at) || dist(a.at, v.home) - dist(b.at, v.home));
  return { wants, sites, level: sites.length > 0 ? null : blockToLevel(v, payout) };
}

// The city block to level for a new base, by its centre (where a Bombardment Drone strikes to
// cover the whole block), or null when there is none worth it.
function blockToLevel(v: ExpansionView, payout: (at: GridPos) => number): GridPos | null {
  const lots = new Map<string, { at: GridPos; drops: number; standing: number; blocked: boolean }>();
  for (const b of v.buildings) {
    const { ix, iz } = lotOf(b.gridX, b.gridZ);
    const key = `${ix},${iz}`;
    const lot = lots.get(key) ?? { at: lotCenter(ix, iz), drops: 0, standing: 0, blocked: false };
    // Node blocks never clear (nodes can't be destroyed); its own captured buildings feed its grid.
    if (b.type === 'core_node' || b.type === 'server_node' || (!b.destroyed && b.owner === v.team)) lot.blocked = true;
    if (!b.destroyed) lot.standing++;
    if (!b.destroyed && !isIndestructible(b)) lot.drops = Math.max(lot.drops, DROPS_TO_DESTROY[b.type]);
    lots.set(key, lot);
  }
  let best: { at: GridPos; score: number } | null = null;
  for (const lot of lots.values()) {
    if (lot.blocked || lot.standing === 0 || lot.drops > BOMBARD.magazine) continue;
    const { at } = lot;
    if (!onOwnSide(v, at) || enemyNear(v, at)) continue;
    if (v.mine.some(u => u.type !== 'bombard' && dist(u.gridPos, at) <= FRIENDLY_CLEARANCE)) continue;
    if (v.structures.some(s => { const l = lotOf(s.gridPos.x, s.gridPos.z), c = lotOf(at.x, at.z); return l.ix === c.ix && l.iz === c.iz; })) continue;
    // Near a core node pays most; then quicker to level; then nearer home, where it is safer.
    const score = payout(at) * 10 - lot.drops - dist(at, v.home) / 10;
    if (!best || score > best.score) best = { at, score };
  }
  return best ? { ...best.at } : null;
}

// Whether a unit stands close enough to found a base on `site` (BUILD_BASE).
export const canFoundAt = (mine: readonly UnitData[], site: GridPos) =>
  mine.some(u => u.health > 0 && dist(u.gridPos, site) <= BASE_SITE.reach - 0.5);
