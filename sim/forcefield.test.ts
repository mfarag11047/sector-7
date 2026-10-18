import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { FORCE_FIELD, activeFields, burntOutGenerators, impactAbsorbed, shockDamage, shotBlocked } from './forcefield';
import { resolveAttacks } from './combat';
import { landShells, type ArtilleryShell } from './artillery';
import { addBuff } from './unitAbilities';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team: 'blue', gridPos: { x: 20, z: 20 }, path: [], visionRange: 4,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const generator = (patch: Partial<UnitData> = {}) => unit('gen', { type: 'field_generator', health: 900, maxHealth: 900, fieldExpiresAt: 60_000, ...patch });
const fieldsOf = (units: UnitData[], now = 0) => activeFields(units, now);

describe('Bulwark Force Field', () => {
  const fields = fieldsOf([generator()]);

  it('is up while the generator lives and runs, and burns out after its run time', () => {
    expect(fields).toHaveLength(1);
    expect(fieldsOf([generator()], 60_000)).toHaveLength(0);
    expect(fieldsOf([generator({ health: 0 })])).toHaveLength(0);
    expect(fieldsOf([addBuff(generator(), 'emp', 5000)], 1000)).toHaveLength(0);
    expect(burntOutGenerators([generator()], 59_000)).toEqual([]);
    expect(burntOutGenerators([generator()], 60_000)).toEqual(['gen']);
  });

  it('blocks enemy shots from outside into or across the dome, not the owner', () => {
    const inside = { x: 21, z: 20 };
    const outside = { x: 26, z: 20 };
    const beyond = { x: 14, z: 20 };
    expect(shotBlocked(fields, 'red', outside, inside)).toBe(true);
    expect(shotBlocked(fields, 'red', outside, beyond)).toBe(true);
    expect(shotBlocked(fields, 'red', { x: 26, z: 10 }, { x: 30, z: 10 })).toBe(false);
    expect(shotBlocked(fields, 'blue', inside, outside)).toBe(false);
    // An enemy who walked in can shoot from inside.
    expect(shotBlocked(fields, 'red', { x: 22, z: 20 }, inside)).toBe(false);
  });

  it('absorbs enemy ordnance landing inside that came from outside', () => {
    expect(impactAbsorbed(fields, 'red', { x: 20, z: 21 }, { x: 30, z: 30 })).toBe(true);
    expect(impactAbsorbed(fields, 'red', { x: 20, z: 21 })).toBe(true);
    expect(impactAbsorbed(fields, 'red', { x: 26, z: 20 }, { x: 30, z: 30 })).toBe(false);
    expect(impactAbsorbed(fields, 'blue', { x: 20, z: 21 }, { x: 30, z: 30 })).toBe(false);
  });

  it('shocks enemies inside, slightly, and nobody else', () => {
    const units = [generator(), unit('friend', { gridPos: { x: 21, z: 20 } }), unit('intruder', { team: 'red', gridPos: { x: 22, z: 20 } }), unit('away', { team: 'red', gridPos: { x: 30, z: 20 } })];
    const dmg = shockDamage(units, fieldsOf(units), 1000);
    expect(dmg.get('intruder')).toBeCloseTo(FORCE_FIELD.shockDps);
    expect(dmg.has('friend')).toBe(false);
    expect(dmg.has('away')).toBe(false);
  });

  it('keeps enemy guns outside from picking targets inside, but lets defenders shoot out', () => {
    const defender = unit('def', { gridPos: { x: 21, z: 20 } });
    const attacker = unit('att', { team: 'red', gridPos: { x: 23.5, z: 20 } });
    const units = [generator(), defender, attacker];
    const f = fieldsOf(units);
    const blocked = (team: UnitData['team'], from: { x: number; z: number }, to: { x: number; z: number }) => shotBlocked(f, team, from, to);
    const r = resolveAttacks(units, [] as StructureData[], 10_000, () => false, blocked);
    expect(r.fired.get('att')).toBeUndefined();
    expect(r.fired.get('def')).toBe('att');
  });

  it('stops artillery shells coming down inside it', () => {
    const units = [generator(), unit('def', { gridPos: { x: 21, z: 20 } })];
    const shell: ArtilleryShell = { id: 's', team: 'red', attackerId: 'gun', from: { x: 30, z: 30 }, at: { x: 21, z: 20 }, firedAt: 0, landsAt: 100 };
    const out = landShells([shell], 200, units, [], fieldsOf(units));
    expect(out.absorbed).toHaveLength(1);
    expect(out.unitDamage.size).toBe(0);
    const unshielded = landShells([shell], 200, units, []);
    expect(unshielded.unitDamage.get('def')).toBeGreaterThan(0);
  });
});
