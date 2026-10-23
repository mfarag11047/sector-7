import { describe, expect, it } from 'vitest';
import type { StructureData } from '../types';
import { createUnit } from './production';
import { fireGrenades, GOLIATH } from './heavyMetalHero';
import { HORNET, landSalvo } from './hornet';
import { UNIT_RULES } from './units';

const goliath = (patch = {}) => ({ ...createUnit('hero_heavy_metal', 'blue', 'g', { x: 10, z: 10 }), combatTargetId: 'e', ...patch });
const enemy = (type: 'trooper' | 'tank' | 'hornet' = 'trooper', at = { x: 14, z: 10 }) => createUnit(type, 'red', 'e', at);

describe('Goliath, the Heavy Metal hero', () => {
  it('carries a heavy machine gun that hits ground and air', () => {
    const w = UNIT_RULES.hero_heavy_metal.weapon!;
    expect(w.type).toBe('mg');
    expect(w.hitsGround && w.hitsAir).toBe(true);
  });

  it('lobs a volley of grenades at what his gun is on, then reloads', () => {
    const { grenades, fired } = fireGrenades([goliath(), enemy()], [], 1000);
    expect(fired.has('g')).toBe(true);
    expect(grenades).toHaveLength(GOLIATH.grenades.count);
    expect(grenades[0].at).toEqual({ x: 14, z: 10 });
    expect(grenades.every(g => g.kind === 'grenade' && g.landsAt > g.firedAt)).toBe(true);
    // Reloading.
    expect(fireGrenades([goliath({ grenadeAt: 1000 }), enemy()], [], 1000 + GOLIATH.grenades.cooldownMs - 1).fired.size).toBe(0);
    expect(fireGrenades([goliath({ grenadeAt: 1000 }), enemy()], [], 1000 + GOLIATH.grenades.cooldownMs).fired.size).toBe(1);
  });

  it('does not lob at aircraft, out of range, or with no target', () => {
    expect(fireGrenades([goliath(), enemy('hornet')], [], 0).fired.size).toBe(0);
    expect(fireGrenades([goliath(), enemy('trooper', { x: 10 + GOLIATH.grenades.range + 1, z: 10 })], [], 0).fired.size).toBe(0);
    expect(fireGrenades([goliath({ combatTargetId: undefined }), enemy()], [], 0).fired.size).toBe(0);
  });

  it('lobs at structures too', () => {
    const s: StructureData = { id: 'e', type: 'defense', team: 'red', gridPos: { x: 13, z: 10 }, isBlueprint: false, constructionProgress: 100, maxProgress: 100, health: 500, maxHealth: 500 };
    expect(fireGrenades([goliath()], [s], 0).fired.has('g')).toBe(true);
  });

  it('bursts on landing with its own damage and a wider blast than a salvo rocket', () => {
    const { grenades } = fireGrenades([goliath(), enemy()], [], 0);
    const first = grenades[0];
    // Just inside the grenade's blast, beyond a salvo rocket's.
    const near = createUnit('trooper', 'red', 'n', { x: first.at.x + (HORNET.salvo.blast + GOLIATH.grenades.blast) / 2, z: first.at.z });
    const out = landSalvo([first], first.landsAt, [enemy(), near], []);
    expect(out.landed).toHaveLength(1);
    expect(out.unitDamage.get('e')).toBeCloseTo(GOLIATH.grenades.damage * 1.25);
    expect(out.unitDamage.get('n')).toBeGreaterThan(0);
  });
});
