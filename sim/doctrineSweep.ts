// Doctrine balance: every doctrine against every other, on several map seeds and from both sides,
// played out as headless computer-vs-computer matches (sim/headless.ts), and summed up.
//
// What it reports, per doctrine: its score (a win 1, a draw at the time limit ½), wins, losses
// and draws, each matchup, the powers it cast, and how each track pick fared (the score of the
// matches where the doctrine took it), so a pick that wins far more than its partner shows up.
//
// The computer takes track options at a coin's toss (sim/ai.ts), so over enough seeds each option
// gets played. tools/doctrineSweep.ts runs it from the command line, spread over the CPU's cores;
// sim/doctrineBalance.test.ts holds the doctrines to a score band.

import { UNIT_STATS } from '../constants';
import type { DoctrineType } from '../types';
import type { Team } from './commands';
import type { Difficulty } from './match';
import { runMatch } from './headless';

export const DOCTRINES: readonly DoctrineType[] = ['heavy_metal', 'shadow_ops', 'netrunner'];

export interface Matchup { seed: number; blue: DoctrineType; red: DoctrineType }

export interface SideResult {
  doctrine: DoctrineType;
  picks: string[];
  powers: number;
  // Army value at the end (cost scaled by health), and the Command HQ's health.
  armyValue: number;
  hqHealth: number;
}
export interface MatchResult extends Matchup {
  winner: Team | null;
  minutes: number;
  sides: Record<Team, SideResult>;
}

// Each pair of doctrines on each seed, once from each side, so map side never favours one.
export function matchups(seeds: readonly number[], doctrines: readonly DoctrineType[] = DOCTRINES): Matchup[] {
  const out: Matchup[] = [];
  for (let i = 0; i < doctrines.length; i++) {
    for (let j = i + 1; j < doctrines.length; j++) {
      for (const seed of seeds) {
        out.push({ seed, blue: doctrines[i], red: doctrines[j] });
        out.push({ seed, blue: doctrines[j], red: doctrines[i] });
      }
    }
  }
  return out;
}

export function playMatchup(mu: Matchup, opts: { minutes?: number; difficulty?: Difficulty } = {}): MatchResult {
  const difficulty = opts.difficulty ?? 'normal';
  const m = runMatch({ seed: mu.seed, difficulty: { blue: difficulty, red: difficulty }, doctrine: { blue: mu.blue, red: mu.red } }, opts.minutes ?? 30);
  const side = (team: Team): SideResult => ({
    doctrine: mu[team],
    picks: [...(m.economy[team].track?.picks ?? [])],
    powers: m.powersCast.filter(p => p.team === team).length,
    armyValue: Math.round(m.units.filter(u => u.team === team).reduce((v, u) => v + (UNIT_STATS[u.type]?.cost || 0) * (u.health / u.maxHealth), 0)),
    hqHealth: Math.round(m.structures.filter(s => s.team === team && s.type === 'hq').reduce((h, s) => h + s.health, 0)),
  });
  return { ...mu, winner: m.victory?.winner ?? null, minutes: Math.round(m.now / 6000) / 10, sides: { blue: side('blue'), red: side('red') } };
}

interface Tally { games: number; wins: number; losses: number; draws: number }
const tally = (): Tally => ({ games: 0, wins: 0, losses: 0, draws: 0 });
const add = (t: Tally, outcome: 'win' | 'loss' | 'draw') => {
  t.games++;
  if (outcome === 'win') t.wins++; else if (outcome === 'loss') t.losses++; else t.draws++;
};
export const score = (t: Tally) => (t.games === 0 ? 0 : (t.wins + t.draws / 2) / t.games);

export interface Summary {
  matches: number;
  draws: number;
  averageMinutes: number;
  doctrines: Record<string, Tally & { score: number; powersPerMatch: number }>;
  // "heavy_metal vs shadow_ops": the first doctrine's record against the second.
  matchups: Record<string, Tally & { score: number }>;
  // Each track option by the doctrine that took it.
  picks: Record<string, Tally & { score: number }>;
}

export function summarize(results: readonly MatchResult[]): Summary {
  const doctrines: Record<string, Tally & { powers: number }> = {};
  const vs: Record<string, Tally> = {};
  const picks: Record<string, Tally> = {};
  for (const r of results) {
    for (const team of ['blue', 'red'] as const) {
      const other: Team = team === 'blue' ? 'red' : 'blue';
      const me = r.sides[team];
      const outcome = r.winner === null ? 'draw' : r.winner === team ? 'win' : 'loss';
      add(doctrines[me.doctrine] ??= { ...tally(), powers: 0 }, outcome);
      doctrines[me.doctrine].powers += me.powers;
      add(vs[`${me.doctrine} vs ${r.sides[other].doctrine}`] ??= tally(), outcome);
      for (const p of me.picks) add(picks[p] ??= tally(), outcome);
    }
  }
  const scored = <T extends Tally>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).map(([k, t]) => [k, { ...t, score: score(t) }]));
  return {
    matches: results.length,
    draws: results.filter(r => r.winner === null).length,
    averageMinutes: results.length === 0 ? 0 : Math.round(results.reduce((s, r) => s + r.minutes, 0) / results.length * 10) / 10,
    doctrines: Object.fromEntries(Object.entries(doctrines).map(([k, t]) => [k, { games: t.games, wins: t.wins, losses: t.losses, draws: t.draws, score: score(t), powersPerMatch: t.games === 0 ? 0 : Math.round(t.powers / t.games * 10) / 10 }])),
    matchups: scored(vs),
    picks: scored(picks),
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);

// The summary as a few plain-text tables.
export function report(s: Summary): string {
  const lines: string[] = [];
  lines.push(`${s.matches} matches, ${s.draws} drawn at the time limit, ${s.averageMinutes} min on average`);
  lines.push('', 'Doctrine       score  W  L  D  powers/match');
  for (const [d, t] of Object.entries(s.doctrines)) lines.push(`${d.padEnd(14)} ${pct(t.score)}  ${String(t.wins).padStart(2)} ${String(t.losses).padStart(2)} ${String(t.draws).padStart(2)}  ${t.powersPerMatch}`);
  lines.push('', 'Matchup                      score  W  L  D');
  for (const [k, t] of Object.entries(s.matchups).sort()) lines.push(`${k.padEnd(28)} ${pct(t.score)}  ${String(t.wins).padStart(2)} ${String(t.losses).padStart(2)} ${String(t.draws).padStart(2)}`);
  lines.push('', 'Track pick                   score  taken');
  for (const [k, t] of Object.entries(s.picks).sort()) lines.push(`${k.padEnd(28)} ${pct(t.score)}  ${t.games}`);
  return lines.join('\n');
}
