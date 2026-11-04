import { describe, expect, it } from 'vitest';
import { applyTuning } from './tuning';

describe('sweep tuning overrides', () => {
  it('sets numbers by dotted path, nested ones too', () => {
    const tables = { A: { x: 1, inner: { y: 2 } } };
    expect(applyTuning('A.x=5; A.inner.y=0.5', tables)).toEqual(['A.x=5', 'A.inner.y=0.5']);
    expect(tables.A).toEqual({ x: 5, inner: { y: 0.5 } });
  });

  it('refuses a path that is not an existing number', () => {
    const tables = { A: { x: 1, name: 'n' } };
    expect(() => applyTuning('A.y=1', tables)).toThrow(/can't tune/);
    expect(() => applyTuning('A.name=1', tables)).toThrow(/can't tune/);
    expect(() => applyTuning('B.x=1', tables)).toThrow(/can't tune/);
    expect(() => applyTuning('A.x=abc', tables)).toThrow(/can't tune/);
  });

  it('does nothing for an empty spec', () => {
    expect(applyTuning('', {})).toEqual([]);
  });
});
