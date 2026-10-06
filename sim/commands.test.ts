import { describe, expect, it } from 'vitest';
import { COMMAND_TYPES, isPlayerCommand } from './commands';

describe('isPlayerCommand', () => {
  it.each([
    { type: 'MOVE', unitIds: ['u1', 'u2'], target: { x: 3, z: 9 } },
    { type: 'TRAIN_UNIT', structureId: 's1', unitType: 'ghost' },
    { type: 'PLACE_STRUCTURE', structureType: 'wall_tier2', at: { x: 1, z: 2 } },
    { type: 'LOAD_AMMO', unitId: 'b1', warhead: 'he' },
    { type: 'DOCTRINE_POWER', tier: 3 },
    { type: 'DOCTRINE_POWER', tier: 2, target: { x: 0, z: 0 } },
  ])('accepts $type', command => {
    expect(isPlayerCommand(command)).toBe(true);
  });

  it.each([
    ['an empty selection', { type: 'MOVE', unitIds: [], target: { x: 3, z: 9 } }],
    ['a fractional tile', { type: 'MOVE', unitIds: ['u1'], target: { x: 3.5, z: 9 } }],
    ['an unknown unit type', { type: 'TRAIN_UNIT', structureId: 's1', unitType: 'mothership' }],
    ['an unknown warhead', { type: 'LOAD_AMMO', unitId: 'b1', warhead: 'nuke' }],
    ['a tier that does not exist', { type: 'DOCTRINE_POWER', tier: 4 }],
    ['a made-up command', { type: 'SET_RESOURCES', amount: 99999 }],
    ['an inherited property name', { type: 'toString' }],
    ['null', null],
    ['a bare string', 'MOVE'],
  ])('rejects %s', (_, command) => {
    expect(isPlayerCommand(command)).toBe(false);
  });

  it('covers every command type', () => {
    expect(COMMAND_TYPES).toHaveLength(26);
  });
});
