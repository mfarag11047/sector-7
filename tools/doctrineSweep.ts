// Doctrine balance sweep from the command line: `npm run sweep`.
//
// Plays every doctrine against every other on SWEEP_SEEDS map seeds (default 6), from both sides,
// as headless computer-vs-computer matches (sim/doctrineSweep.ts), and prints each doctrine's
// score, each matchup, and how every track pick fared. The matches are spread over the CPU's
// cores, each worker a copy of this script playing its share (SWEEP_SHARD=k/n).
//
//   SWEEP_SEEDS=10       how many seeds (1..n), or a list: SWEEP_SEEDS=3,7,11
//   SWEEP_MINUTES=30     the time limit; a match still going then is a draw
//   SWEEP_DIFFICULTY=normal
//   SWEEP_JOBS=8         workers (default: cores less one)
//   SWEEP_JSON=out.json  also write every match's result and the summary
//   SWEEP_TUNE="SALVAGE.share=0.2;BASE_REPAIR.heavyMetalBoost=1"
//                        try other numbers for this run only (sim/tuning.ts lists the tables)

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import path from 'node:path';
import { matchups, MatchResult, playMatchup, report, summarize } from '../sim/doctrineSweep';
import type { Difficulty } from '../sim/match';
import { applyTuning } from '../sim/tuning';

const env = process.env;
const seedsArg = env.SWEEP_SEEDS ?? '6';
const seeds = seedsArg.includes(',') ? seedsArg.split(',').map(Number) : Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
const minutes = Number(env.SWEEP_MINUTES ?? 30);
const difficulty = (env.SWEEP_DIFFICULTY ?? 'normal') as Difficulty;
const all = matchups(seeds);
// Checked in the parent too, so a bad path fails before any worker starts.
const tuned = applyTuning(env.SWEEP_TUNE ?? '');

if (env.SWEEP_SHARD) {
  // A worker: play every n-th matchup from k, one JSON line each.
  const [k, n] = env.SWEEP_SHARD.split('/').map(Number);
  all.forEach((mu, i) => {
    if (i % n !== k) return;
    process.stdout.write(`RESULT ${JSON.stringify(playMatchup(mu, { minutes, difficulty }))}\n`);
  });
} else {
  const jobs = Math.max(1, Math.min(all.length, Number(env.SWEEP_JOBS ?? Math.max(1, cpus().length - 1))));
  const started = Date.now();
  console.log(`${all.length} matches (${seeds.length} seeds, ${minutes} min limit, ${difficulty}) on ${jobs} workers...`);
  if (tuned.length > 0) console.log(`Tuned: ${tuned.join(', ')}`);
  const viteNode = path.resolve('node_modules/vite-node/vite-node.mjs');
  const results: MatchResult[] = [];
  const workers = Array.from({ length: jobs }, (_, k) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [viteNode, 'tools/doctrineSweep.ts'], { env: { ...env, SWEEP_SHARD: `${k}/${jobs}` }, stdio: ['ignore', 'pipe', 'inherit'] });
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('RESULT ')) continue;
        const r: MatchResult = JSON.parse(line.slice(7));
        results.push(r);
        const who = r.winner ? r.sides[r.winner].doctrine : 'draw';
        console.log(`[${String(results.length).padStart(3)}/${all.length}] seed ${r.seed} ${r.blue} (blue) vs ${r.red} (red): ${who} at ${r.minutes} min`);
      }
    });
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`worker ${k} exited with ${code}`))));
  }));
  await Promise.all(workers);
  const summary = summarize(results);
  console.log(`\n${report(summary)}\n\n${Math.round((Date.now() - started) / 1000)} s`);
  if (env.SWEEP_JSON) writeFileSync(env.SWEEP_JSON, JSON.stringify({ seeds, minutes, difficulty, tuned, results, summary }, null, 2));
}
