import { describe, expect, it } from 'vitest';
import { addCraters, CRATER, craterOf, RUIN, ruinLayout, type Crater } from './ruinsPlan';

describe('ruins', () => {
  it('are laid out the same every time for a tile', () => {
    expect(ruinLayout('b-12-7', 30, 30, 60, ['north', 'west'])).toEqual(ruinLayout('b-12-7', 30, 30, 60, ['north', 'west']));
    expect(ruinLayout('b-12-7', 30, 30, 60, ['north'])).not.toEqual(ruinLayout('b-3-9', 30, 30, 60, ['north']));
  });

  it('stand walls only along the outside edges, stubs of the building no taller than the cap', () => {
    const w = 30, d = 30;
    for (let i = 0; i < 40; i++) {
      const l = ruinLayout(`t${i}`, w, d, 200, ['north']);
      for (const wall of l.walls) {
        // Along the north edge: z near -d/2, running along x.
        expect(wall.at[2]).toBeLessThan(-d / 2 + 2);
        expect(wall.size[0]).toBeGreaterThan(wall.size[2]);
        expect(wall.size[1]).toBeLessThanOrEqual(RUIN.tallest + 1e-9);
        expect(wall.size[1]).toBeGreaterThan(0);
      }
      expect(l.walls.length).toBeLessThanOrEqual(RUIN.piecesPerWall);
      // Rubble inside the tile.
      for (const r of l.rubble) {
        expect(Math.abs(r.at[0])).toBeLessThan(w / 2);
        expect(Math.abs(r.at[2])).toBeLessThan(d / 2);
      }
      expect(l.rubble.length).toBeGreaterThanOrEqual(RUIN.rubble[0]);
      expect(l.rubble.length).toBeLessThanOrEqual(RUIN.rubble[1]);
    }
    // An inside tile of a big building has no walls at all, just rubble.
    expect(ruinLayout('inner', w, d, 80, []).walls).toHaveLength(0);
  });

  it('keep a low building low', () => {
    for (const wall of ruinLayout('shed', 20, 20, 10, ['north', 'south', 'east', 'west']).walls) {
      expect(wall.size[1]).toBeLessThanOrEqual(Math.max(RUIN.lowest, 10 * RUIN.high) + 1e-9);
      expect(wall.size[1]).toBeGreaterThanOrEqual(RUIN.lowest - 1e-9);
    }
  });
});

describe('craters', () => {
  const blast = (radius: number, y = 1, style?: string) => ({ id: `e${radius}-${y}`, position: { x: 5, y, z: -3 }, radius, style } as Parameters<typeof craterOf>[0]);

  it('are left by heavy blasts on the ground, sized to the blast', () => {
    const c = craterOf(blast(10))!;
    expect(c).toMatchObject({ x: 5, z: -3, r: 10 * CRATER.scale });
    expect(craterOf(blast(3))!.r).toBe(CRATER.smallest);
    expect(craterOf(blast(200))!.r).toBe(CRATER.largest);
  });

  it('are not left by small hits, blasts in the air or energy effects', () => {
    expect(craterOf(blast(2.6))).toBeNull();
    expect(craterOf(blast(10, 74))).toBeNull();
    expect(craterOf(blast(10, 1, 'emp'))).toBeNull();
  });

  it('stay for the match, the oldest going once there are too many', () => {
    const one = (i: number): Crater => ({ id: `c${i}`, x: i, z: 0, r: 3, turn: 0 });
    let all: Crater[] = [];
    for (let i = 0; i < CRATER.max + 5; i++) all = addCraters(all, [one(i)]);
    expect(all).toHaveLength(CRATER.max);
    expect(all[0].id).toBe('c5');
    // Nothing new, nothing changes (so React doesn't redraw).
    expect(addCraters(all, [])).toBe(all);
  });
});
