import { describe, expect, it } from 'vitest';
import type { StructureData, UnitData } from '../types';
import { FORCE_FIELD, activeFields, generatorsOf, impactAbsorbed, shieldTick, shockDamage, shotBlocked, shotBlockedBy } from './forcefield';
import { resolveAttacks } from './combat';
import { landShells, type ArtilleryShell } from './artillery';
import { batteryDrain } from './energy';
import { addBuff } from './unitAbilities';

const unit = (id: string, patch: Partial<UnitData> = {}): UnitData => ({
  id, type: 'trooper', unitClass: 'infantry', team: 'blue', gridPos: { x: 20, z: 20 }, path: [], visionRange: 4,
  health: 100, maxHealth: 100, battery: 100, maxBattery: 100, cooldowns: {}, ...patch,
});
const generator = (patch: Partial<UnitData> = {}) => unit('gen', { type: 'field_generator', unitClass: 'armor', health: 2000, maxHealth: 2000, ...patch });
const fieldsOf = (units: UnitData[], now = 0) => activeFields(units, now);
const apply = (units: UnitData[], updates: Map<string, (u: UnitData) => UnitData>) => units.map(u => updates.get(u.id)?.(u) ?? u);

describe('Bulwark Force Field', () => {
  const fields = fieldsOf([generator()]);

  it('stays up with no time limit while the generator lives and has power', () => {
    expect(fields).toHaveLength(1);
    expect(fieldsOf([generator()], 10 * 60_000)).toHaveLength(1);
    expect(fieldsOf([generator({ battery: 0 })])).toHaveLength(0);
    expect(fieldsOf([generator({ health: 0 })])).toHaveLength(0);
    expect(fieldsOf([addBuff(generator(), 'emp', 5000)], 1000)).toHaveLength(0);
  });

  it('runs off the generator battery while the dome is up, not while it reboots', () => {
    const up = batteryDrain(generator(), false, true);
    expect(up).toBeCloseTo(FORCE_FIELD.drainPerTick);
    expect(batteryDrain(generator({ fieldDownUntil: 90_000 }), false, true)).toBe(0);
  });

  it('collapses when battered to nothing, reboots for 90 s, then comes back at full strength', () => {
    let units = [generator()];
    units = apply(units, shieldTick(units, 1000, new Map([['gen', 1500]])));
    expect(units[0].fieldShieldHp).toBe(FORCE_FIELD.shieldHp - 1500);
    expect(fieldsOf(units, 1000)).toHaveLength(1);
    units = apply(units, shieldTick(units, 2000, new Map([['gen', FORCE_FIELD.shieldHp]])));
    expect(units[0].fieldShieldHp).toBe(0);
    expect(units[0].fieldDownUntil).toBe(2000 + FORCE_FIELD.rebootMs);
    expect(fieldsOf(units, 2000 + FORCE_FIELD.rebootMs - 1)).toHaveLength(0);
    // Hits while it reboots do nothing.
    units = apply(units, shieldTick(units, 3000, new Map([['gen', 500]])));
    expect(units[0].fieldShieldHp).toBe(0);
    units = apply(units, shieldTick(units, 2000 + FORCE_FIELD.rebootMs, new Map()));
    expect(units[0].fieldShieldHp).toBe(FORCE_FIELD.shieldHp);
    expect(units[0].fieldDownUntil).toBeUndefined();
    expect(fieldsOf(units, 2000 + FORCE_FIELD.rebootMs)).toHaveLength(1);
  });

  it('blocks enemy shots from outside into or across the dome, not the owner', () => {
    const inside = { x: 21, z: 20 };
    const outside = { x: 26, z: 20 };
    const beyond = { x: 14, z: 20 };
    expect(shotBlocked(fields, 'red', outside, inside)).toBe(true);
    expect(shotBlocked(fields, 'red', outside, beyond)).toBe(true);
    expect(shotBlockedBy(fields, 'red', outside, inside)!.at.x).toBeCloseTo(20 + FORCE_FIELD.radius);
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

  it('turns enemy fire at units inside into damage on the dome, and lets defenders shoot out', () => {
    const defender = unit('def', { gridPos: { x: 21, z: 20 } });
    const attacker = unit('att', { team: 'red', gridPos: { x: 23.5, z: 20 } });
    const units = [generator(), defender, attacker];
    const f = fieldsOf(units);
    const shieldOf = (team: UnitData['team'], from: { x: number; z: number }, to: { x: number; z: number }) => {
      const b = shotBlockedBy(f, team, from, to);
      return b ? { fieldId: b.field.id, at: b.at } : null;
    };
    const r = resolveAttacks(units, [] as StructureData[], 10_000, () => false, shieldOf);
    expect(r.fired.get('att')).toBe('def');
    expect(r.unitDamage.has('def')).toBe(false);
    expect(r.shieldDamage.get('gen')).toBeGreaterThan(0);
    expect(r.fired.get('def')).toBe('att');
    expect(r.unitDamage.get('att')).toBeGreaterThan(0);
  });

  it('prefers targets in the open over ones behind a dome', () => {
    const units = [generator(), unit('def', { gridPos: { x: 21, z: 20 } }), unit('att', { team: 'red', gridPos: { x: 23.5, z: 20 } }), unit('open', { gridPos: { x: 25, z: 21 } })];
    const f = fieldsOf(units);
    const shieldOf = (team: UnitData['team'], from: { x: number; z: number }, to: { x: number; z: number }) => {
      const b = shotBlockedBy(f, team, from, to);
      return b ? { fieldId: b.field.id, at: b.at } : null;
    };
    expect(resolveAttacks(units, [], 10_000, () => false, shieldOf).fired.get('att')).toBe('open');
  });

  it('stops artillery shells coming down inside it', () => {
    const units = [generator(), unit('def', { gridPos: { x: 21, z: 20 } })];
    const shell: ArtilleryShell = { id: 's', team: 'red', attackerId: 'gun', from: { x: 30, z: 30 }, at: { x: 21, z: 20 }, firedAt: 0, landsAt: 100 };
    const out = landShells([shell], 200, units, [], fieldsOf(units));
    expect(out.absorbed).toHaveLength(1);
    expect(out.unitDamage.size).toBe(0);
    expect(landShells([shell], 200, units, []).unitDamage.get('def')).toBeGreaterThan(0);
  });

  it('lists the generators a new drop replaces: one per side', () => {
    const units = [generator(), generator({ id: 'gen2' }), generator({ id: 'redgen', team: 'red' }), generator({ id: 'dead', health: 0 })];
    expect(generatorsOf(units, 'blue')).toEqual(['gen', 'gen2']);
    expect(generatorsOf(units, 'red')).toEqual(['redgen']);
  });
});
