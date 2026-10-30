import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { EXPLOSION_SIZES, liveLoops, pickTake, SAMPLE_MANIFEST, sampleKey, SampleManifest, setLoops, SOUNDS, spatial } from './sfx';

const PUBLIC = resolve(__dirname, '../public');
const manifest = JSON.parse(readFileSync(resolve(PUBLIC, SAMPLE_MANIFEST), 'utf8')) as SampleManifest;

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
  it('has every take the manifest lists, under a name the game plays', () => {
    const playable = new Set<string>([...Object.keys(SOUNDS), 'explosion_small', 'explosion_large', 'laser_beam']);
    for (const [key, entry] of Object.entries(manifest)) {
      expect(playable.has(key), key).toBe(true);
      expect(entry!.files.length, key).toBeGreaterThan(0);
      for (const file of entry!.files) expect(existsSync(resolve(PUBLIC, file)), file).toBe(true);
    }
  });

  it('has recordings for every weapon and blast, and made-in-code sounds to fall back on', () => {
    for (const kind of ['rifle', 'mg', 'flak', 'ciws', 'cannon', 'rail', 'missile', 'rocket', 'laser_beam', 'blade', 'explosion', 'explosion_small', 'explosion_large', 'emp', 'shield']) {
      expect(manifest[kind as keyof SampleManifest]?.files.length, kind).toBeGreaterThan(0);
    }
    for (const kind of Object.keys(manifest).filter(k => k !== 'laser_beam')) expect(SOUNDS[kind.startsWith('explosion') ? 'explosion' : kind as keyof typeof SOUNDS]).toBeTypeOf('function');
  });

  it('plays a small, medium or large explosion by the size of the blast', () => {
    expect(sampleKey('explosion', 1.8 / 4)).toBe('explosion_small');
    expect(sampleKey('explosion', 3.5 / 4)).toBe('explosion');
    expect(sampleKey('explosion', 5 / 4)).toBe('explosion');
    expect(sampleKey('explosion', 25 / 4)).toBe('explosion_large');
    expect(sampleKey('explosion', EXPLOSION_SIZES.medium + 0.01)).toBe('explosion_large');
    expect(sampleKey('rifle', 9)).toBe('rifle');
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

describe('the Sentinel beam loop', () => {
  it('loops between points inside every take, after an opening that plays once', () => {
    const beam = manifest.laser_beam!;
    const [start, end] = beam.loop!;
    expect(start).toBeGreaterThan(0);
    expect(end - start).toBeGreaterThan(1);
    for (const file of beam.files) {
      // The take runs past the loop's end, so a decoder's small offset can't land it on silence.
      const bytes = readFileSync(resolve(PUBLIC, file)).length;
      expect(bytes / (112_000 / 8), file).toBeGreaterThan(end);
    }
  });

  it('starts nothing before the audio is running, and stops on an empty list', () => {
    setLoops('laser_beam', [{ id: 'sentinel', x: 0, z: 0 }]);
    expect(liveLoops()).toBe(0);
    setLoops('laser_beam', []);
    expect(liveLoops()).toBe(0);
  });
});
