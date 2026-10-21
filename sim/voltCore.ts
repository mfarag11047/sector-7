// The Battery Mule's Volt Core (Tier 2, researched at Advanced Research, sim/upgrades.ts).
//
// Passive. A Battery Mule carries a lot of charge; with the Volt Core researched, when one is
// destroyed it detonates, discharging into every enemy unit within VOLT.radius tiles, ground or
// air. The blast does VOLT.damage at the centre, falling off evenly to VOLT.edge of that at the
// rim. A mule killed by another's blast detonates too. Friendly units and structures are spared.
//
// Pure: CityMap and the headless runner call it on the tick's units before clearing the dead.

import type { UnitData } from '../types';
import type { GridPos, Team } from './commands';
import { damageTakenMultiplier } from './unitAbilities';

export const VOLT = {
  radius: 4,
  damage: 220,
  // Share of the full damage at the rim.
  edge: 0.25,
};

export interface VoltBlast { muleId: string; team: UnitData['team']; at: GridPos }

// What a blast does at `distance` tiles from its centre.
export const voltDamage = (distance: number) =>
  distance > VOLT.radius ? 0 : VOLT.damage * (1 - (1 - VOLT.edge) * (distance / VOLT.radius));

// Detonates every Battery Mule that died this tick on a side with the Volt Core, and any it sets
// off in turn. Returns the units after the blasts, the blasts, and who hit whom.
export function detonateMules(
  units: UnitData[],
  armed: (team: Team) => boolean,
): { units: UnitData[]; blasts: VoltBlast[]; hits: { attackerId: string; targetId: string }[] } {
  const blasts: VoltBlast[] = [];
  const hits: { attackerId: string; targetId: string }[] = [];
  const done = new Set<string>();
  let out = units;
  for (;;) {
    const fresh = out.filter(u => u.type === 'sun_plate' && u.health <= 0 && !done.has(u.id) && (u.team === 'blue' || u.team === 'red') && armed(u.team));
    if (fresh.length === 0) break;
    const damage = new Map<string, number>();
    for (const m of fresh) {
      done.add(m.id);
      blasts.push({ muleId: m.id, team: m.team, at: { ...m.gridPos } });
      for (const t of out) {
        if (t.health <= 0 || t.team === m.team || t.team === 'neutral') continue;
        const n = voltDamage(Math.hypot(t.gridPos.x - m.gridPos.x, t.gridPos.z - m.gridPos.z));
        if (n <= 0) continue;
        damage.set(t.id, (damage.get(t.id) || 0) + n * damageTakenMultiplier(t));
        hits.push({ attackerId: m.id, targetId: t.id });
      }
    }
    out = out.map(u => (damage.has(u.id) ? { ...u, health: Math.max(0, u.health - damage.get(u.id)!) } : u));
  }
  return { units: out, blasts, hits };
}
