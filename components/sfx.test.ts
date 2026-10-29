import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { pickTake, SAMPLES, SOUNDS, spatial } from './sfx';

describe('where a sound is heard from', () => {
  // Looking along -Z (heading 0), so +X is to the right of the screen.
  const l = { x: 0, z: 0, yaw: 0, height: 80 };

  it('is loudest in the middle of the view and fades with distance, to nothing', () => {
    const centre = spatial(l, 0, 0).gain;
    const near = spatial(l, 0, -60).gain;
    const far = spatial(l, 0, -200).gain;
    expect(centre).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(far);
    expect(spatial(l, 0, -2000).gain).toBe(0);
  });

  it('pans by where the sound is across the screen, turning with the camera', () => {
    expect(spatial(l, 50, 0).pan).toBeGreaterThan(0);
    expect(spatial(l, -50, 0).pan).toBeLessThan(0);
    expect(spatial(l, 0, -50).pan).toBeCloseTo(0, 5);
    // Turned half round, right and left swap.
    expect(spatial({ ...l, yaw: Math.PI }, 50, 0).pan).toBeLessThan(0);
  });

  it('carries further for kinds that reach further, and is quieter from high up', () => {
    expect(spatial(l, 0, -280, 1).gain).toBe(0);
    expect(spatial(l, 0, -280, 1.8).gain).toBeGreaterThan(0);
    expect(spatial({ ...l, height: 190 }, 0, 0).gain).toBeLessThan(spatial({ ...l, height: 20 }, 0, 0).gain);
  });
});

describe('recorded sounds', () => {
  it('has every listed take in public/sfx', () => {
    for (const files of Object.values(SAMPLES)) {
      for (const file of files!) expect(existsSync(resolve(__dirname, '../public/sfx', file)), file).toBe(true);
    }
  });

  it('has a made-in-code version of every sound, to play until (or unless) its recording loads', () => {
    for (const kind of Object.keys(SAMPLES)) expect(SOUNDS[kind as keyof typeof SOUNDS]).toBeTypeOf('function');
  });

  it('never plays the same take twice running when there is a choice', () => {
    expect(pickTake(1, 0)).toBe(0);
    for (let last = 0; last < 3; last++) {
      for (const r of [0, 0.3, 0.5, 0.7, 0.99]) {
        const take = pickTake(3, last, () => r);
        expect(take).not.toBe(last);
        expect(take).toBeGreaterThanOrEqual(0);
        expect(take).toBeLessThan(3);
      }
    }
    // Every other take still comes up.
    expect(new Set([0, 0.6].map(r => pickTake(3, 1, () => r)))).toEqual(new Set([0, 2]));
  });
});
