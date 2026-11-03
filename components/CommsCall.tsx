// The announcer's call window: while a side's announcer speaks (components/announcer.ts), a
// holo-call opens on top of the system message box, joined to it: the caller's name over a
// portrait frame, the voice's waveform beside it, and the words being said below. It flickers
// in when a line starts, stays a moment after it ends, and closes. Each side's caller wears its
// side's colour (Vanta's KAMI-OS deep red, Tokugen's TAC-NET green); a threat turns the frame
// alarm red and makes it pulse. The portrait is the profile's (announcerProfile.ts), or, until
// there is one, a placeholder feed: scanlines over a dim silhouette.

import React, { useEffect, useRef, useState } from 'react';
import { onTransmission, PRIORITY, voiceLevel, type Transmission } from './announcer';
import { ANNOUNCER_PROFILES, type AnnouncerProfile } from './announcerProfile';

// Each caller's colours, and a threat's.
const LOOKS = {
  vanta: { frame: 'border-[#c8102e] shadow-[0_0_12px_rgba(200,16,46,0.55)]', ink: 'text-rose-200', bar: 'bg-[#e2344f]', dot: 'bg-[#c8102e]' },
  tokugen: { frame: 'border-lime-300 shadow-[0_0_12px_rgba(141,255,122,0.45)]', ink: 'text-lime-200', bar: 'bg-lime-300', dot: 'bg-lime-300' },
  threat: { frame: 'border-red-500 shadow-[0_0_16px_rgba(239,68,68,0.75)]', ink: 'text-red-300', bar: 'bg-red-400', dot: 'bg-red-500' },
};

// How long the window stays after she stops, and how long it takes to open and close.
const LINGER_MS = 1600;
const BARS = 14;

const assetUrl = (path: string) => `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}${path}`;

// Her waveform: bars that follow her voice's level, with a little life of their own.
const Waveform: React.FC<{ live: boolean; tone: string }> = ({ live, tone }) => {
  const bars = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      const level = live ? Math.max(voiceLevel() * 1.2, 0.45 + 0.25 * Math.sin(t / 90)) : 0.05;
      bars.current.forEach((b, i) => {
        if (!b) return;
        const wobble = 0.6 + 0.4 * Math.sin(t / (70 + i * 13) + i * 1.7);
        b.style.height = `${Math.max(8, Math.min(100, level * wobble * 100))}%`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live]);
  return (
    <div className="flex items-center gap-[3px] h-8">
      {Array.from({ length: BARS }, (_, i) => (
        <div key={i} ref={el => { bars.current[i] = el; }} className={`w-[3px] rounded-sm ${tone}`} style={{ height: '8%' }} />
      ))}
    </div>
  );
};

// The portrait frame: the profile's image or video, or a placeholder feed.
const Portrait: React.FC<{ frame: string; profile: AnnouncerProfile }> = ({ frame, profile }) => {
  const src = profile.portrait;
  return (
    <div className={`relative w-36 h-44 shrink-0 border ${frame} bg-slate-950/90 overflow-hidden`}>
      {src ? (
        /\.(webm|mp4)$/i.test(src)
          ? <video src={assetUrl(src)} autoPlay loop muted playsInline className="w-full h-full object-cover" />
          : <img src={assetUrl(src)} alt={profile.name} className="w-full h-full object-cover" />
      ) : (
        <>
          {/* A dim head-and-shoulders silhouette where the portrait will go. */}
          <svg viewBox="0 0 96 112" className="absolute inset-0 w-full h-full opacity-40">
            <defs>
              <linearGradient id="comms-sil" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#cbd5e1" stopOpacity="0.5" />
                <stop offset="1" stopColor="#475569" stopOpacity="0.15" />
              </linearGradient>
            </defs>
            <ellipse cx="48" cy="44" rx="17" ry="21" fill="url(#comms-sil)" />
            <path d="M14 112 C16 84 30 72 48 72 C66 72 80 84 82 112 Z" fill="url(#comms-sil)" />
          </svg>
          <div className="absolute bottom-1 inset-x-0 text-center text-[8px] font-mono tracking-widest text-slate-300/60">NO FEED</div>
        </>
      )}
      {/* Scanlines and a slow roll over the feed. */}
      <div className="absolute inset-0 pointer-events-none comms-scanlines" />
      <div className="absolute inset-x-0 h-6 pointer-events-none comms-roll" />
    </div>
  );
};

export const CommsCall: React.FC = () => {
  const [line, setLine] = useState<Transmission | null>(null);
  const [live, setLive] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => onTransmission(t => {
    clearTimeout(linger.current);
    if (t) { setLine(t); setLive(true); return; }
    setLive(false);
    linger.current = setTimeout(() => setLine(null), LINGER_MS);
  }), []);
  useEffect(() => () => clearTimeout(linger.current), []);
  if (!line) return null;
  const threat = line.priority >= PRIORITY.threat && line.priority < PRIORITY.match;
  const profile = ANNOUNCER_PROFILES[line.voice];
  const look = threat ? LOOKS.threat : LOOKS[line.voice];
  const { frame, ink, bar, dot } = look;
  return (
    <div key={line.startedAt} className="relative comms-open mb-2 pb-2 border-b border-cyan-400/25">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={`inline-block w-1.5 h-1.5 ${dot} ${live ? 'animate-pulse' : 'opacity-40'}`} />
        <span className={`text-[11px] font-mono font-bold tracking-widest uppercase ${ink}`}>{profile.name}</span>
        <span className="text-[9px] font-mono uppercase tracking-wide text-slate-500">· {profile.role}</span>
      </div>
      <div className="flex gap-3 items-end">
        <Portrait frame={`${frame} ${threat && live ? 'animate-pulse' : ''}`} profile={profile} />
        <div className="flex flex-col gap-1 min-w-0">
          <Waveform live={live} tone={bar} />
          <span className={`text-[9px] font-mono uppercase tracking-widest ${live ? ink : 'text-slate-500'}`}>{live ? (threat ? 'Priority channel' : 'Transmitting') : 'Link closed'}</span>
        </div>
      </div>
      {line.text && <p className={`mt-2 text-xs font-mono leading-snug ${ink}`}>"{line.text}"</p>}
    </div>
  );
};
