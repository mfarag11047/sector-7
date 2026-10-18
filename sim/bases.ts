// New command bases on cleared ground.
//
// Once every building in a city block (the 5x5 lot between roads) has been destroyed, the rubble
// is cleared away and the block becomes a base site, marked at its centre. Either side can build
// a new Command HQ there: it is expensive, costing cores and compute, needs one of the side's
// units close by, and takes a while to go up.
//
// A new HQ is a full HQ: it extends the energy grid around it, repairs units in its block, has
// the HQ's gun and health, and opens the same command menu. A side is only beaten by
// destruction once every one of its HQs has fallen (sim/victory.ts).

import { STRUCTURE_INFO } from '../constants';
import type { BuildingData, StructureData, UnitData } from '../types';
import type { GridPos, Team } from './commands';
import { Economy, setCompute, spend } from './economy';

export const BASE_SITE = {
  cores: 2000,
  compute: 200,
  buildMs: 60_000,
  // One of the side's units must be within this many tiles of the site.
  reach: 6,
};

const STRIDE = 6;
const lotOf = (x: number, z: number) => ({ ix: Math.floor(x / STRIDE), iz: Math.floor(z / STRIDE) });
const lotKey = (ix: number, iz: number) => `${ix},${iz}`;
export const lotCenter = (ix: number, iz: number): GridPos => ({ x: ix * STRIDE + 3, z: iz * STRIDE + 3 });

// Blocks whose buildings are all destroyed, as lot keys. Node blocks never count.
export function clearedBlocks(buildings: readonly BuildingData[]): Set<string> {
  const lots = new Map<string, { alive: number; node: boolean }>();
  for (const b of buildings) {
    const { ix, iz } = lotOf(b.gridX, b.gridZ);
    const k = lotKey(ix, iz);
    const lot = lots.get(k) ?? { alive: 0, node: false };
    if (!b.destroyed) lot.alive++;
    if (b.type === 'core_node' || b.type === 'server_node') lot.node = true;
    lots.set(k, lot);
  }
  const cleared = new Set<string>();
  lots.forEach((lot, k) => { if (lot.alive === 0 && !lot.node) cleared.add(k); });
  return cleared;
}

// Whether a building's rubble has been cleared away with the rest of its block.
export const rubbleCleared = (b: Pick<BuildingData, 'gridX' | 'gridZ' | 'destroyed'>, cleared: ReadonlySet<string>) => {
  const { ix, iz } = lotOf(b.gridX, b.gridZ);
  return !!b.destroyed && cleared.has(lotKey(ix, iz));
};

export interface BaseSite { id: string; at: GridPos }

// Cleared blocks with nothing built on them yet.
export function baseSites(buildings: readonly BuildingData[], structures: readonly StructureData[]): BaseSite[] {
  const sites: BaseSite[] = [];
  for (const k of clearedBlocks(buildings)) {
    const [ix, iz] = k.split(',').map(Number);
    const at = lotCenter(ix, iz);
    const taken = structures.some(s => {
      const lot = lotOf(s.gridPos.x, s.gridPos.z);
      return s.type === 'hq' && lot.ix === ix && lot.iz === iz || (s.gridPos.x === at.x && s.gridPos.z === at.z);
    });
    if (!taken) sites.push({ id: `site-${ix}-${iz}`, at });
  }
  return sites;
}

// Pays for a base: cores and compute. Null when the team can't afford both.
export function payForBase(economy: Economy, team: Team): Economy | null {
  if (economy[team].compute < BASE_SITE.compute) return null;
  const paid = spend(economy, team, BASE_SITE.cores);
  return paid ? setCompute(paid, team, paid[team].compute - BASE_SITE.compute) : null;
}

export type BaseOrderOutcome = { ok: true; structure: StructureData; pay: (e: Economy) => Economy | null } | { ok: false; reason: string };

export function baseOrder(
  view: { units: readonly UnitData[]; structures: readonly StructureData[]; buildings: readonly BuildingData[]; economy: Economy },
  team: Team,
  at: GridPos,
  newId: (prefix: string) => string,
): BaseOrderOutcome {
  const site = baseSites(view.buildings, view.structures).find(s => s.at.x === at.x && s.at.z === at.z);
  if (!site) return { ok: false, reason: 'a base needs a fully cleared city block' };
  if (!view.units.some(u => u.team === team && u.health > 0 && Math.hypot(u.gridPos.x - at.x, u.gridPos.z - at.z) <= BASE_SITE.reach)) {
    return { ok: false, reason: `needs one of your units within ${BASE_SITE.reach} tiles of the site` };
  }
  if (view.economy[team].cores < BASE_SITE.cores) return { ok: false, reason: `needs ${BASE_SITE.cores} cores` };
  if (view.economy[team].compute < BASE_SITE.compute) return { ok: false, reason: `needs ${BASE_SITE.compute} compute` };
  const info = STRUCTURE_INFO.hq;
  return {
    ok: true,
    pay: e => payForBase(e, team),
    structure: {
      id: newId(`hq-${team}`), type: 'hq', team, gridPos: { ...at }, isBlueprint: false,
      constructionProgress: 0, maxProgress: 0, health: info.maxHealth, maxHealth: info.maxHealth,
      buildRemainingMs: BASE_SITE.buildMs, buildTotalMs: BASE_SITE.buildMs,
    },
  };
}

// Where a side's command bases stand: every HQ that is up and standing, and its starting HQ
// always (so its home grid and repair hold until the match is decided).
export function commandPosts(structures: readonly StructureData[], team: Team, home: GridPos): GridPos[] {
  const posts = [home];
  for (const s of structures) {
    if (s.type !== 'hq' || s.team !== team || s.health <= 0 || (s.buildRemainingMs || 0) > 0) continue;
    if (s.gridPos.x === home.x && s.gridPos.z === home.z) continue;
    posts.push(s.gridPos);
  }
  return posts;
}
