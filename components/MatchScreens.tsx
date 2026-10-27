// The screens around a match: setup before it, results after it.

import React, { useState } from 'react';
import { DOCTRINE_CONFIG } from '../constants';
import type { DoctrineType } from '../types';
import type { Difficulty, MatchConfig, MatchMode } from '../sim/match';
import type { Victory } from '../sim/victory';
import type { Team } from '../sim/commands';

export interface MatchSummary {
  durationMs: number;
  teams: Record<Team, { trained: number; lost: number; earned: number; coreNodes: number; serverNodes: number }>;
}

const DIFFICULTY_NOTE: Record<Difficulty, string> = {
  easy: 'Slow to react, 70% income. Learn the ropes.',
  normal: 'Plays a full build and counters your army.',
  hard: 'Fast, aggressive, 135% income.',
};

const Choice: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; tone?: string }> = ({ active, onClick, children, tone }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded border text-left font-mono text-xs transition-colors ${
      active ? `border-cyan-300 bg-cyan-400/15 text-white ${tone || ''}` : 'border-slate-700 bg-black/30 text-slate-400 hover:text-white hover:border-slate-500'
    }`}
  >
    {children}
  </button>
);

export const MatchSetup: React.FC<{ initial?: Partial<MatchConfig>; onStart: (config: MatchConfig) => void }> = ({ initial, onStart }) => {
  const [mode, setMode] = useState<MatchMode>(initial?.mode ?? 'ai');
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? 'normal');
  const [playerTeam, setPlayerTeam] = useState<Team>(initial?.playerTeam ?? 'blue');
  const [doctrine, setDoctrine] = useState<DoctrineType | null>(initial?.playerDoctrine ?? 'heavy_metal');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  // AI vs AI: red's doctrine, or null to take it from the seed like a normal computer opponent.
  const [redDoctrine, setRedDoctrine] = useState<DoctrineType | null>(null);
  const spectate = mode === 'spectate';

  const start = () => {
    const doctrines = Object.keys(DOCTRINE_CONFIG) as DoctrineType[];
    onStart({
      mode, seed, playerTeam: spectate ? 'blue' : playerTeam, difficulty,
      playerDoctrine: doctrine,
      // The computer picks its own doctrine from the map seed, so a replay of a seed is the same match.
      aiDoctrine: (spectate && redDoctrine) || doctrines[seed % doctrines.length],
    });
  };

  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-y-auto p-4">
      <div className="hud-plate hud-corners w-full max-w-3xl p-6 md:p-8 text-slate-200 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold font-mono tracking-[0.3em] text-cyan-300 hud-glow-cyan">SECTOR 7</h1>
          <p className="text-sm text-slate-400 mt-2 max-w-xl">
            Take the core node by your base for income. Push your energy grid out by capturing buildings, because
            vehicles and drones only recharge inside it. Seize server nodes to unlock Tier 2 and Tier 3.
            Destroy every enemy Command HQ to win.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="hud-label text-[10px] uppercase">Opponent</h2>
            <div className="grid grid-cols-3 gap-2">
              <Choice active={mode === 'ai'} onClick={() => setMode('ai')}>Computer</Choice>
              <Choice active={mode === 'sandbox'} onClick={() => setMode('sandbox')}>Sandbox (control both)</Choice>
              <Choice active={spectate} onClick={() => setMode('spectate')}>AI vs AI (pacing test)</Choice>
            </div>
            {mode !== 'sandbox' ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
                    <Choice key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d.toUpperCase()}</Choice>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  {spectate
                    ? 'Two computer players fight each other at this level while you watch with full vision. A pacing report logs milestones, army sizes and unit stats: open it from the Pacing button.'
                    : DIFFICULTY_NOTE[difficulty]}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-slate-500 font-mono">The old test bed: a unit of nearly every kind on both sides, 5000 cores, and a team switch. No opponent.</p>
            )}
          </section>

          <section className="flex flex-col gap-2">
            {!spectate && (
              <>
                <h2 className="hud-label text-[10px] uppercase">Side</h2>
                <div className="grid grid-cols-2 gap-2">
                  <Choice active={playerTeam === 'blue'} onClick={() => setPlayerTeam('blue')}><span className="text-blue-400">■</span> Blue (north-west)</Choice>
                  <Choice active={playerTeam === 'red'} onClick={() => setPlayerTeam('red')}><span className="text-red-400">■</span> Red (south-east)</Choice>
                </div>
              </>
            )}
            <h2 className={`hud-label text-[10px] uppercase ${spectate ? '' : 'mt-2'}`}>Match seed</h2>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={seed}
                onChange={e => setSeed(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                onKeyDown={e => e.stopPropagation()}
                className="flex-1 bg-black/40 border border-slate-700 rounded px-2 py-1.5 font-mono text-xs text-white"
                title="Match seed: picks the computer's doctrine and its choices. The city is the same every match."
              />
              <button onClick={() => setSeed(Math.floor(Math.random() * 1e6))} className="px-3 py-1.5 border border-slate-700 rounded font-mono text-xs hover:border-cyan-400">Random</button>
            </div>
          </section>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="hud-label text-[10px] uppercase">{spectate ? <><span className="text-blue-400">■</span> Blue doctrine</> : 'Doctrine'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {(Object.keys(DOCTRINE_CONFIG) as DoctrineType[]).map(d => {
              const c = DOCTRINE_CONFIG[d];
              return (
                <Choice key={d} active={doctrine === d} onClick={() => setDoctrine(d)}>
                  <div className="text-white font-bold mb-1">{c.label}</div>
                  <div className="text-[10px] text-slate-400 leading-snug">{c.tier1_passive}</div>
                  <div className="text-[10px] text-slate-500 leading-snug mt-1">T2 {c.tier2_name} · T3 {c.tier3_name}</div>
                </Choice>
              );
            })}
          </div>
          {spectate && (
            <>
              <h2 className="hud-label text-[10px] uppercase mt-2"><span className="text-red-400">■</span> Red doctrine</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Choice active={redDoctrine === null} onClick={() => setRedDoctrine(null)}>From seed</Choice>
                {(Object.keys(DOCTRINE_CONFIG) as DoctrineType[]).map(d => (
                  <Choice key={d} active={redDoctrine === d} onClick={() => setRedDoctrine(d)}>{DOCTRINE_CONFIG[d].label}</Choice>
                ))}
              </div>
            </>
          )}
        </section>

        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between border-t border-slate-700 pt-4">
          <p className="text-[11px] text-slate-500 font-mono leading-relaxed">
            Left-click select / move · drag to box-select · Ctrl-click or F: attack-move<br />
            Click a + pad to build · WASD: move camera · wheel: zoom
          </p>
          <button onClick={start} className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-mono font-bold tracking-widest rounded">
            DEPLOY
          </button>
        </div>
      </div>
    </div>
  );
};

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const MatchEnd: React.FC<{ victory: Victory; playerTeam: Team; summary: MatchSummary; onRematch: () => void; onSetup: () => void; onContinue: () => void; spectate?: boolean; onReport?: () => void }> = ({ victory, playerTeam, summary, onRematch, onSetup, onContinue, spectate, onReport }) => {
  const won = spectate ? victory.winner === 'blue' : victory.winner === playerTeam;
  const side = victory.winner === 'blue' ? 'Blue' : 'Red';
  const reason = spectate
    ? `${side} destroyed every enemy Command HQ.`
    : won ? 'Every enemy Command HQ is destroyed.' : 'Your last Command HQ has fallen.';
  const heading = spectate ? `${side.toUpperCase()} WINS` : won ? 'VICTORY' : 'DEFEAT';
  const headingTone = spectate ? (victory.winner === 'blue' ? 'text-blue-300' : 'text-red-300') : won ? 'text-cyan-300 hud-glow-cyan' : 'text-rose-400 hud-glow-red';
  const rows: [string, keyof MatchSummary['teams']['blue']][] = [
    ['Units trained', 'trained'], ['Units lost', 'lost'], ['Cores earned', 'earned'], ['Core nodes held', 'coreNodes'], ['Server nodes held', 'serverNodes'],
  ];
  return (
    <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="hud-plate hud-corners w-full max-w-lg p-6 md:p-8 text-slate-200 flex flex-col gap-5">
        <div className="text-center">
          <h1 className={`text-4xl font-bold font-mono tracking-[0.3em] ${headingTone}`}>{heading}</h1>
          <p className="text-sm text-slate-400 mt-2">{reason}</p>
          <p className="text-[11px] text-slate-500 font-mono mt-1">Match time {clock(summary.durationMs)}</p>
        </div>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="text-slate-500"><th className="text-left font-normal pb-2"></th><th className="pb-2 text-blue-400">BLUE</th><th className="pb-2 text-red-400">RED</th></tr>
          </thead>
          <tbody>
            {rows.map(([label, key]) => (
              <tr key={key} className="border-t border-slate-800">
                <td className="py-1.5 text-slate-400">{label}</td>
                <td className="text-center text-white">{Math.round(summary.teams.blue[key])}</td>
                <td className="text-center text-white">{Math.round(summary.teams.red[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {onReport && (
          <button onClick={onReport} className="px-3 py-2 border border-cyan-500/60 rounded font-mono text-xs text-cyan-200 hover:border-cyan-300 hover:text-white">Pacing report: milestones, armies, unit stats</button>
        )}
        <div className="grid grid-cols-3 gap-2">
          <button onClick={onContinue} className="px-3 py-2 border border-slate-700 rounded font-mono text-xs hover:border-cyan-400">Keep watching</button>
          <button onClick={onSetup} className="px-3 py-2 border border-slate-700 rounded font-mono text-xs hover:border-cyan-400">New match</button>
          <button onClick={onRematch} className="px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded font-mono text-xs font-bold">Rematch</button>
        </div>
      </div>
    </div>
  );
};
