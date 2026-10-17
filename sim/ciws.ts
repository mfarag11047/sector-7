// Aegis close-in weapon system (CIWS): an automatic rotary cannon.
//
// A working Aegis (its radar on, see sim/radar.ts) hoses down any enemy aircraft or large
// ordnance in flight that comes within CIWS.range tiles, incoming missiles first. It fires in a
// sustained burst until the magazine runs dry, then must stop and reload. After a lull it tops
// the magazine back up on its own.
//
// Pure: it reads the state it is given and reports damage and gun state. The caller keeps the
// ordnance in flight and its remaining integrity (how much more fire it takes to knock down).

import type { UnitData } from '../types';
import { isRadarActive } from './radar';
import { damageTakenMultiplier, fireRateMultiplier, rangeBonus } from './unitAbilities';
import { UNIT_RULES } from './units';

export const CIWS = {
  range: 10,
  // Damage per second of fire. Aircraft are armoured and evasive; missiles, shells and pods
  // are what the gun is built for, so they come apart much faster.
  airDps: 32,
  ordnanceDps: 60,
  // Seconds of continuous fire in one magazine, and the reload when it runs dry.
  burstMs: 3500,
  reloadMs: 6000,
  // A part-used magazine is topped up after this long without firing.
  topUpMs: 4000,
  // Rounds a second, for drawing the tracer stream.
  roundsPerSecond: 75,
};

// How much fire each kind of ordnance takes to knock down.
// A missile takes 2 s of fire; one magazine (3.5 s) is enough for anything but a nuke.
export const ORDNANCE_INTEGRITY = { missile: 120, nuke: 240, shell: 30, pod: 180 } as const;
export type OrdnanceKind = keyof typeof ORDNANCE_INTEGRITY;

// Something in the air the gun can shoot at: in fractional tiles.
export interface AirThreat {
  id: string;
  team: UnitData['team'];
  at: { x: number; z: number };
  kind: OrdnanceKind;
}

export interface CiwsLink { aegisId: string; targetId: string; ordnance: boolean }

export interface CiwsResult {
  // New gun state for each Aegis whose state changed.
  updates: Map<string, Pick<UnitData, 'ciwsUsedMs' | 'ciwsReloadUntil' | 'ciwsLastFiredAt' | 'ciwsTargetId'>>;
  unitDamage: Map<string, number>;
  ordnanceDamage: Map<string, number>;
  // Who is firing at what this tick, for the tracer stream.
  links: CiwsLink[];
}

const tiles = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
export const ciwsReloading = (u: UnitData, now: number) => (u.ciwsReloadUntil ?? 0) > now;
// Share of the magazine left, 0 to 1 (0 while reloading).
export const ciwsMagazine = (u: UnitData, now: number) => (ciwsReloading(u, now) ? 0 : 1 - Math.min(1, (u.ciwsUsedMs ?? 0) / CIWS.burstMs));

export function ciwsTick(units: readonly UnitData[], ordnance: readonly AirThreat[], now: number, dtMs: number): CiwsResult {
  const result: CiwsResult = { updates: new Map(), unitDamage: new Map(), ordnanceDamage: new Map(), links: [] };
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) || 0) + n);
  for (const u of units) {
    if (u.type !== 'aegis') continue;
    const state = { ciwsUsedMs: u.ciwsUsedMs ?? 0, ciwsReloadUntil: u.ciwsReloadUntil ?? 0, ciwsLastFiredAt: u.ciwsLastFiredAt ?? 0, ciwsTargetId: u.ciwsTargetId ?? null };
    const before = JSON.stringify(state);
    const done = () => { if (JSON.stringify(state) !== before) result.updates.set(u.id, state); };

    if (!isRadarActive(u) || state.ciwsReloadUntil > now) { state.ciwsTargetId = null; done(); continue; }
    if (state.ciwsUsedMs > 0 && now - state.ciwsLastFiredAt >= CIWS.topUpMs) state.ciwsUsedMs = 0;

    // Incoming ordnance first (it is about to land on something), then the nearest aircraft.
    const range = CIWS.range + rangeBonus(u);
    let target: { id: string; ordnance: boolean } | null = null;
    let best = Infinity;
    for (const o of ordnance) {
      if (o.team === u.team) continue;
      const d = tiles(u.gridPos, o.at);
      if (d <= range && d < best) { best = d; target = { id: o.id, ordnance: true }; }
    }
    if (!target) {
      for (const t of units) {
        if (t.team === u.team || t.health <= 0 || t.decoyActive || UNIT_RULES[t.type].armor !== 'air') continue;
        const d = tiles(u.gridPos, t.gridPos);
        // Stick with the current target rather than flicking between equals.
        const score = t.id === state.ciwsTargetId ? d - 1 : d;
        if (d <= range && score < best) { best = score; target = { id: t.id, ordnance: false }; }
      }
    }
    if (!target) { state.ciwsTargetId = null; done(); continue; }

    const rate = fireRateMultiplier(u) * (dtMs / 1000);
    if (target.ordnance) add(result.ordnanceDamage, target.id, CIWS.ordnanceDps * rate);
    else add(result.unitDamage, target.id, CIWS.airDps * rate * damageTakenMultiplier(units.find(t => t.id === target!.id)!));
    result.links.push({ aegisId: u.id, targetId: target.id, ordnance: target.ordnance });
    state.ciwsTargetId = target.id;
    state.ciwsLastFiredAt = now;
    state.ciwsUsedMs += dtMs;
    if (state.ciwsUsedMs >= CIWS.burstMs) {
      // Magazine empty: stop and reload.
      state.ciwsUsedMs = 0;
      state.ciwsReloadUntil = now + CIWS.reloadMs;
    }
    done();
  }
  return result;
}

// Apply a tick's gun state to the units.
export const applyCiwsState = (units: UnitData[], updates: CiwsResult['updates']) =>
  updates.size === 0 ? units : units.map(u => { const s = updates.get(u.id); return s ? { ...u, ...s } : u; });
