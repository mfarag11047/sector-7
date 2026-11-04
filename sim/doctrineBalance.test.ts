import { describe, expect, it } from 'vitest';
import { DOCTRINES, matchups, MatchResult, playMatchup, summarize } from './doctrineSweep';

const result = (blue: MatchResult['blue'], red: MatchResult['red'], winner: MatchResult['winner'], bluePicks: string[] = [], redPicks: string[] = []): MatchResult => ({
  seed: 1, blue, red, winner, minutes: 20,
  sides: {
    blue: { doctrine: blue, picks: bluePicks, powers: 2, armyValue: 0, hqHealth: 0 },
    red: { doctrine: red, picks: redPicks, powers: 0, armyValue: 0, hqHealth: 0 },
  },
});

describe('the doctrine sweep', () => {
  it('plays every pair of doctrines on every seed from both sides', () => {
    const list = matchups([1, 2]);
    expect(list).toHaveLength(3 * 2 * 2);
    for (const d of DOCTRINES) expect(list.filter(m => m.blue === d)).toHaveLength(4);
  });

  it('scores a win 1 and a draw a half, per doctrine, matchup and track pick', () => {
    const s = summarize([
      result('heavy_metal', 'shadow_ops', 'blue', ['hm_scrap'], ['so_silent']),
      result('shadow_ops', 'heavy_metal', null, ['so_killing'], ['hm_scrap']),
    ]);
    expect(s.doctrines.heavy_metal).toMatchObject({ games: 2, wins: 1, draws: 1, score: 0.75 });
    expect(s.doctrines.shadow_ops).toMatchObject({ games: 2, losses: 1, draws: 1, score: 0.25 });
    expect(s.matchups['heavy_metal vs shadow_ops'].score).toBe(0.75);
    expect(s.picks.hm_scrap).toMatchObject({ games: 2, score: 0.75 });
    expect(s.picks.so_killing.score).toBe(0.5);
    expect(s.draws).toBe(1);
  });
});

// The real thing: every doctrine within a band of an even score over a sweep of full matches.
// Slow (minutes), so it runs only when asked: SWEEP_BALANCE=1 npx vitest run sim/doctrineBalance.test.ts
// (`npm run sweep` plays the same matches spread over all cores, with the full report).
describe.skipIf(!process.env.SWEEP_BALANCE)('doctrine balance', () => {
  it('keeps every doctrine between 40% and 60%', () => {
    const s = summarize(matchups([1, 2, 3, 4]).map(mu => playMatchup(mu)));
    for (const d of DOCTRINES) {
      expect(s.doctrines[d].score, d).toBeGreaterThanOrEqual(0.4);
      expect(s.doctrines[d].score, d).toBeLessThanOrEqual(0.6);
    }
  }, 60 * 60_000);
});
