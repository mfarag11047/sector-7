import { describe, expect, it } from 'vitest';
import { hudScaleFor } from './hudScale';

describe('the HUD scale', () => {
  it('keeps the HUD as laid out on a 1920x1080 window or bigger', () => {
    expect(hudScaleFor(1920, 1080)).toBe(1);
    expect(hudScaleFor(2560, 1440)).toBe(1);
    expect(hudScaleFor(3840, 2160)).toBe(1);
  });

  it('shrinks it with a smaller window, by the tighter of width and height', () => {
    expect(hudScaleFor(1440, 900)).toBe(0.75);
    expect(hudScaleFor(1536, 864)).toBe(0.8);
    expect(hudScaleFor(1366, 768)).toBe(0.71);
    // A wide but short window: its height decides.
    expect(hudScaleFor(1920, 800)).toBe(0.74);
  });

  it('never makes text too small to read', () => {
    expect(hudScaleFor(800, 600)).toBe(0.6);
  });
});
