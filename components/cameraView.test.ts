import { describe, expect, it } from 'vitest';
import { CAMERA_PITCH, CITY_CONFIG, MAX_ZOOM } from '../constants';
import { lookAhead, viewFootprint } from './cameraView';

describe('the camera view', () => {
  it('looks down a little off straight down', () => {
    expect(CAMERA_PITCH * 180 / Math.PI).toBeGreaterThan(70);
    expect(CAMERA_PITCH * 180 / Math.PI).toBeLessThan(85);
    // The middle of the view is a short way ahead of the point under it.
    expect(lookAhead(100)).toBeCloseTo(26.8, 1);
  });

  it('takes in a patch round the middle of the view, a little behind the point under it to well ahead', () => {
    const v = viewFootprint(100, 16 / 9);
    expect(v.near).toBeLessThan(0);
    expect(v.far).toBeGreaterThan(lookAhead(100));
    expect(v.width).toBeGreaterThan(v.far - v.near);
    // Wider at the top of the screen, further away, than at the bottom.
    expect(v.farHalf).toBeGreaterThan(v.nearHalf);
    expect(v.farHalf * 2).toBeGreaterThan(v.width);
    expect(v.nearHalf * 2).toBeLessThan(v.width);
  });

  it('zoomed right out, sees a good stretch but nowhere near the whole map', () => {
    const map = CITY_CONFIG.gridSize * CITY_CONFIG.tileSize;
    const v = viewFootprint(MAX_ZOOM, 16 / 9);
    expect(v.width).toBeGreaterThan(map * 0.2);
    expect(v.width).toBeLessThan(map * 0.35);
  });
});
