// Goliath, Heavy Metal's doctrine hero (sim/heroes.ts): a full-borg heavy who carries a heavy
// machine gun in both hands, and a grenade launcher on an arm over his shoulder.
//
//   - Heavy machine gun: his main weapon (UNIT_RULES), a fast, hard-hitting machine gun that
//     hits everything, aircraft included.
//   - Back-mounted grenade launcher (passive): every few seconds, while his gun is on a ground
//     target, it lobs a volley of grenades over his shoulder onto it. They come down around the
//     target a moment later and burst, hurting every enemy ground unit and structure nearby.
//
// The grenades fly and land through the Hellfire Salvo's pipeline (sim/hornet.ts MiniRocket and
// landSalvo), so force fields stop them the same way. Pure: CityMap and the headless runner keep
// them in flight and apply the damage.

import type { StructureData, UnitData } from '../types';
import { isHidden } from './cloak';
import type { MiniRocket } from './hornet';
import { UNIT_RULES } from './units';
import { isEmpDisabled, upgradeDamage } from './unitAbilities';

export const GOLIATH = {
  grenades: {
    cooldownMs: 8000,
    range: 7,
    // Grenades per volley, launched one after another, and how far they scatter round the target.
    count: 3,
    intervalMs: 250,
    scatter: 1.2,
    flightMs: 1100,
    // Each grenade's damage (explosive, before armour) and blast radius in tiles.
    damage: 40,
    blast: 1.5,
  },
};

const tiles = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const scatter = (seed: number) => { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// Each Goliath whose launcher is ready lobs a volley at the ground unit or structure his gun is on.
export function fireGrenades(units: readonly UnitData[], structures: readonly StructureData[], now: number): { grenades: MiniRocket[]; fired: Set<string> } {
  const grenades: MiniRocket[] = [];
  const fired = new Set<string>();
  const g = GOLIATH.grenades;
  for (const h of units) {
    if (h.type !== 'hero_heavy_metal' || h.health <= 0 || h.isStunned || isEmpDisabled(h) || !h.combatTargetId) continue;
    if (now - (h.grenadeAt ?? -Infinity) < g.cooldownMs) continue;
    const u = units.find(x => x.id === h.combatTargetId);
    const s = u ? undefined : structures.find(x => x.id === h.combatTargetId);
    const at = u && u.team !== h.team && u.health > 0 && !isHidden(u) && UNIT_RULES[u.type].armor !== 'air' ? u.gridPos
      : s && s.team !== h.team && s.health > 0 ? s.gridPos : null;
    if (!at || tiles(h.gridPos, at) > g.range) continue;
    fired.add(h.id);
    for (let i = 0; i < g.count; i++) {
      // The first lands on the target; the rest scatter round it.
      const r = i === 0 ? 0 : g.scatter * Math.sqrt(scatter(now + i * 3.1 + h.id.length));
      const a = scatter(now + i * 7.7) * Math.PI * 2;
      const firedAt = now + i * g.intervalMs;
      grenades.push({
        id: `grenade-${h.id}-${now}-${i}`, team: h.team, attackerId: h.id, kind: 'grenade',
        from: { ...h.gridPos }, at: { x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r },
        firedAt, landsAt: firedAt + g.flightMs, power: upgradeDamage(h), damage: g.damage, blast: g.blast,
      });
    }
  }
  return { grenades, fired };
}
