// The match pacing report (sim/pacing.ts): when the big moments happened, how the two sides'
// armies and economies grew, and what each unit type did. Opened from the HUD, and from the
// end screen. Refreshes once a second while open.

import React, { useEffect, useState } from 'react';
import { clock, pacingJson, pacingText, unitLabel, type PacingEvent, type PacingRecord, type PacingSample, type TeamSample, type UnitTally } from '../sim/pacing';

type Tab = 'milestones' | 'timeline' | 'units';

interface Snapshot {
  nowMs: number;
  events: PacingEvent[];
  samples: PacingSample[];
  tallies: PacingRecord['tallies'];
  neutral: UnitTally;
}

const snapshot = (r: PacingRecord): Snapshot => ({
  nowMs: r.nowMs,
  events: [...r.events],
  samples: [...r.samples],
  tallies: { blue: { ...r.tallies.blue }, red: { ...r.tallies.red } },
  neutral: { ...r.neutral },
});

const SIDE_TEXT = { blue: 'text-blue-300', red: 'text-red-300' } as const;
const SIDE_STROKE = { blue: '#60a5fa', red: '#f87171' } as const;

const eventTone = (e: PacingEvent) =>
  e.kind === 'victory' ? 'text-amber-300 font-bold'
    : e.team === 'blue' ? 'text-blue-200' : e.team === 'red' ? 'text-red-200' : 'text-slate-200';

const KIND_TAG: Record<PacingEvent['kind'], string> = {
  core_captured: 'CORE', core_lost: 'CORE', server_captured: 'SERVER', server_lost: 'SERVER', tier: 'TIER', upgrade: 'UPGRADE',
  structure_built: 'BUILD', structure_destroyed: 'LOSS', first_combat: 'COMBAT', first_loss: 'COMBAT',
  first_kill: 'COMBAT', base_built: 'BASE', victory: 'END', strategy: 'PLAN', note: 'NOTE',
};

// A small line chart of one snapshot value over the match, a line per side.
const Chart: React.FC<{ samples: PacingSample[]; value: (s: TeamSample) => number; label: string }> = ({ samples, value, label }) => {
  const W = 320, H = 110, PAD = 22;
  if (samples.length < 2) return <div className="text-[11px] text-slate-500 font-mono">{label}: waiting for a second snapshot…</div>;
  const end = samples[samples.length - 1].atMs || 1;
  const max = Math.max(1, ...samples.flatMap(s => [value(s.blue), value(s.red)]));
  const x = (ms: number) => PAD + (ms / end) * (W - PAD - 6);
  const y = (v: number) => H - 14 - (v / max) * (H - 24);
  const line = (team: 'blue' | 'red') => samples.map((s, i) => `${i ? 'L' : 'M'}${x(s.atMs).toFixed(1)},${y(value(s[team])).toFixed(1)}`).join(' ');
  return (
    <div>
      <div className="hud-label text-[10px] uppercase mb-1">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-black/30 border border-slate-800 rounded">
        <text x={2} y={12} fill="#64748b" fontSize={9} fontFamily="monospace">{Math.round(max)}</text>
        <text x={2} y={H - 4} fill="#64748b" fontSize={9} fontFamily="monospace">0:00</text>
        <text x={W - 4} y={H - 4} fill="#64748b" fontSize={9} fontFamily="monospace" textAnchor="end">{clock(end)}</text>
        <line x1={PAD} x2={W - 6} y1={H - 14} y2={H - 14} stroke="#334155" strokeWidth={1} />
        {(['blue', 'red'] as const).map(t => <path key={t} d={line(t)} fill="none" stroke={SIDE_STROKE[t]} strokeWidth={1.8} />)}
      </svg>
    </div>
  );
};

const UnitTable: React.FC<{ team: 'blue' | 'red'; tallies: Record<string, UnitTally> }> = ({ team, tallies }) => {
  const rows = Object.entries(tallies).sort((a, b) => (b[1].damageToUnits + b[1].damageToStructures) - (a[1].damageToUnits + a[1].damageToStructures) || b[1].trained - a[1].trained);
  const total = rows.reduce((t, [, x]) => ({
    started: t.started + x.started, trained: t.trained + x.trained, died: t.died + x.died,
    damageToUnits: t.damageToUnits + x.damageToUnits, damageToStructures: t.damageToStructures + x.damageToStructures,
  }), { started: 0, trained: 0, died: 0, damageToUnits: 0, damageToStructures: 0 });
  const cell = 'py-1 px-1.5 text-right tabular-nums';
  return (
    <div className="overflow-x-auto">
      <h3 className={`hud-label text-[10px] uppercase mb-1 ${SIDE_TEXT[team]}`}>{team === 'blue' ? 'Blue' : 'Red'}</h3>
      <table className="w-full font-mono text-[11px] min-w-[480px]">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-normal py-1">Unit</th>
            <th className={`${cell} font-normal`} title="On the map when the match began">Start</th>
            <th className={`${cell} font-normal`}>Trained</th>
            <th className={`${cell} font-normal`}>Died</th>
            <th className={`${cell} font-normal`}>Dmg to units</th>
            <th className={`${cell} font-normal`}>Dmg to structures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([type, x]) => (
            <tr key={type} className="border-t border-slate-800 text-slate-200">
              <td className="py-1 pr-2 text-left">{unitLabel(type)}</td>
              <td className={cell}>{x.started}</td>
              <td className={cell}>{x.trained}</td>
              <td className={cell}>{x.died}</td>
              <td className={cell}>{Math.round(x.damageToUnits)}</td>
              <td className={cell}>{Math.round(x.damageToStructures)}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-600 text-white font-bold">
            <td className="py-1 text-left">Total</td>
            <td className={cell}>{total.started}</td>
            <td className={cell}>{total.trained}</td>
            <td className={cell}>{total.died}</td>
            <td className={cell}>{Math.round(total.damageToUnits)}</td>
            <td className={cell}>{Math.round(total.damageToStructures)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export const PacingReport: React.FC<{ pacingRef: React.MutableRefObject<PacingRecord | null>; onClose: () => void; title?: string }> = ({ pacingRef, onClose, title = 'Match pacing report' }) => {
  const [tab, setTab] = useState<Tab>('milestones');
  const [snap, setSnap] = useState<Snapshot | null>(() => (pacingRef.current ? snapshot(pacingRef.current) : null));
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => { if (pacingRef.current) setSnap(snapshot(pacingRef.current)); }, 1000);
    return () => clearInterval(timer);
  }, [pacingRef]);

  const copy = async () => {
    if (!pacingRef.current) return;
    const text = pacingText(pacingRef.current, title);
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  };
  const download = () => {
    if (!pacingRef.current) return;
    const blob = new Blob([JSON.stringify(pacingJson(pacingRef.current), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sector7-pacing-${clock(pacingRef.current.nowMs).replace(':', 'm')}s.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const tabButton = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded border font-mono text-[11px] uppercase tracking-wider ${tab === t ? 'border-cyan-300 bg-cyan-400/15 text-white' : 'border-slate-700 text-slate-400 hover:text-white'}`}>{label}</button>
  );

  return (
    <div className="absolute inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 pointer-events-auto" onKeyDown={e => e.stopPropagation()}>
      <div className="hud-plate hud-corners w-full max-w-3xl max-h-[90vh] p-5 md:p-6 text-slate-200 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-mono tracking-[0.2em] text-cyan-300 hud-glow-cyan uppercase">{title}</h2>
            <p className="text-[11px] text-slate-500 font-mono mt-1">Match time {clock(snap?.nowMs ?? 0)} · snapshots every 30 s</p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 border border-slate-700 rounded font-mono text-xs hover:border-cyan-400">Close</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabButton('milestones', 'Milestones')}
          {tabButton('timeline', 'Armies over time')}
          {tabButton('units', 'Units')}
          <div className="flex-1" />
          <button onClick={copy} className="px-3 py-1.5 border border-slate-700 rounded font-mono text-[11px] hover:border-cyan-400">{copied ? 'Copied' : 'Copy as text'}</button>
          <button onClick={download} className="px-3 py-1.5 border border-slate-700 rounded font-mono text-[11px] hover:border-cyan-400">Download JSON</button>
        </div>
        <div className="overflow-y-auto min-h-0 flex-1 pr-1">
          {!snap ? <p className="text-sm text-slate-400">No report for this match.</p>
            : tab === 'milestones' ? (
              snap.events.length === 0 ? <p className="text-sm text-slate-400 font-mono">Nothing has happened yet.</p> : (
                <ol className="font-mono text-xs flex flex-col">
                  {snap.events.map((e, i) => (
                    <li key={i} className="flex gap-3 py-1 border-t border-slate-800 first:border-t-0">
                      <span className="w-12 text-right text-slate-400 tabular-nums shrink-0">{clock(e.atMs)}</span>
                      <span className="w-14 text-[10px] text-slate-500 shrink-0 pt-px">{KIND_TAG[e.kind]}</span>
                      <span className={eventTone(e)}>{e.text}</span>
                    </li>
                  ))}
                </ol>
              )
            ) : tab === 'timeline' ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Chart samples={snap.samples} value={s => s.units} label="Units" />
                  <Chart samples={snap.samples} value={s => s.armyValue} label="Army value (cores)" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-[11px] min-w-[560px]">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="text-left font-normal py-1">Time</th>
                        <th className="text-left font-normal">Side</th>
                        {['Units', 'Army value', 'Cores', 'Compute', 'Tier', 'Core nodes', 'Server nodes'].map(h => <th key={h} className="text-right font-normal px-1.5">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {snap.samples.flatMap(s => (['blue', 'red'] as const).map(t => {
                        const x = s[t];
                        return (
                          <tr key={`${s.atMs}-${t}`} className={`${t === 'blue' ? 'border-t border-slate-800' : ''} text-slate-200`}>
                            <td className="py-0.5 text-slate-400 tabular-nums">{t === 'blue' ? clock(s.atMs) : ''}</td>
                            <td className={SIDE_TEXT[t]}>{t}</td>
                            {[x.units, x.armyValue, x.cores, x.compute, x.tier, x.coreNodes, x.serverNodes].map((v, i) => <td key={i} className="text-right px-1.5 tabular-nums">{v}</td>)}
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <UnitTable team="blue" tallies={snap.tallies.blue} />
                <UnitTable team="red" tallies={snap.tallies.red} />
                <p className="text-[11px] text-slate-500 font-mono">
                  Server node guards (neutral): {snap.neutral.died} destroyed, {Math.round(snap.neutral.damageToUnits)} damage dealt to units.
                  "Other" is damage nobody could be named for: doctrine powers, force-field shocks, the Black Wall virus.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
