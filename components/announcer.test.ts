import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { AnnouncerQueue, announcerVoice, BUILDING_LINES, LINES, onTransmission, PRIORITY, setAnnouncerSide, showTransmission, SIDE_VOICE, SIGN_OFFS, STALE_MS, VOICE_FX, VoKey } from './announcer';
import { STRUCTURE_INFO } from '../constants';

describe('the announcer queue', () => {
  it('says a line straight away when quiet, and not again until its cooldown is over', () => {
    const q = new AnnouncerQueue();
    expect(q.request('vo_research_complete', 0)).toBe('play');
    q.started('vo_research_complete', 0, 1300);
    expect(q.request('vo_research_complete', 2000)).toBe('dropped');
    expect(q.request('vo_research_complete', LINES.vo_research_complete.cooldownMs)).toBe('play');
  });

  it('lets a threat cut off a report, but makes everything else wait its turn', () => {
    const q = new AnnouncerQueue();
    q.started('vo_depot_online', 0, 1000);
    expect(q.request('vo_research_complete', 200)).toBe('queued');
    expect(q.request('vo_base_under_attack', 300)).toBe('interrupt');
    q.started('vo_base_under_attack', 300, 1900);
    // A threat doesn't cut off another threat.
    expect(q.request('vo_missile_launch', 400)).toBe('queued');
  });

  it('keeps only the most important waiting line, and drops it once it is stale', () => {
    const q = new AnnouncerQueue();
    q.started('vo_match_start', 0, 3000);
    expect(q.request('vo_server_node_captured', 100)).toBe('queued');
    // A less important line doesn't push it out...
    expect(q.request('vo_depot_online', 200)).toBe('dropped');
    expect(q.next(3100)).toBe('vo_server_node_captured');
    // ...and one left waiting too long isn't said.
    q.started('vo_server_node_captured', 3100, 3000);
    expect(q.request('vo_research_complete', 3200)).toBe('queued');
    expect(q.next(3200 + STALE_MS + 1)).toBeNull();
  });

  it('never queues the line being spoken or the one already waiting', () => {
    const q = new AnnouncerQueue();
    q.started('vo_construction_complete', 0, 1500);
    expect(q.request('vo_construction_complete', 100)).toBe('dropped');
    expect(q.request('vo_factory_online', 100)).toBe('queued');
    expect(q.request('vo_factory_online', 200)).toBe('dropped');
  });
});

describe('the voice lines', () => {
  for (const voice of ['vanta', 'tokugen'] as const) {
    const manifest = JSON.parse(readFileSync(resolve(__dirname, `../public/vo/${voice}/manifest.json`), 'utf8')) as Record<string, { files: string[]; lines?: string[] }>;

    it(`gives ${voice}'s announcer a recording, and its words, for every line the game can ask for, and nothing it never asks for`, () => {
      expect(Object.keys(manifest).sort()).toEqual(Object.keys(LINES).sort());
      for (const [key, entry] of Object.entries(manifest)) {
        expect(entry.files.length, key).toBeGreaterThan(0);
        expect(entry.lines?.length, key).toBe(entry.files.length);
        for (const file of entry.files) {
          expect(file.startsWith(`vo/${voice}/`), file).toBe(true);
          expect(existsSync(resolve(__dirname, '../public', file)), file).toBe(true);
        }
      }
    });
  }

  it("gives each side's announcer a sign-off after every line", () => {
    for (const file of Object.values(SIGN_OFFS)) expect(existsSync(resolve(__dirname, '../public', file)), file).toBe(true);
  });

  it('gives each side its own announcer, each with its own treatment', () => {
    expect(SIDE_VOICE).toEqual({ blue: 'vanta', red: 'tokugen' });
    // Vanta's wide and clean; Tokugen's a narrow radio band with a squelch.
    expect(VOICE_FX.vanta.highCut - VOICE_FX.vanta.lowCut).toBeGreaterThan(VOICE_FX.tokugen.highCut - VOICE_FX.tokugen.lowCut);
    expect(VOICE_FX.vanta.squelch).toBe(false);
    expect(VOICE_FX.tokugen.squelch).toBe(true);
  });

  it('speaks for the side being played, or viewed', () => {
    setAnnouncerSide('red');
    expect(announcerVoice()).toBe('tokugen');
    setAnnouncerSide('neutral');
    expect(announcerVoice()).toBe('tokugen');
    setAnnouncerSide('blue');
    expect(announcerVoice()).toBe('vanta');
  });

  it('names every base building, but not walls', () => {
    for (const type of Object.keys(STRUCTURE_INFO)) {
      if (['base_wall', 'base_gate', 'wall_tier2'].includes(type)) continue;
      const line = BUILDING_LINES[type] as VoKey | undefined;
      if (line) expect(LINES[line]).toBeDefined();
    }
    expect(BUILDING_LINES.aa_turret).toBe('vo_ciws_online');
  });
});

describe('the call window feed', () => {
  it('tells listeners when a line opens and when it closes', () => {
    vi.useFakeTimers();
    const seen: (string | null)[] = [];
    const off = onTransmission(t => seen.push(t ? t.text : null));
    showTransmission('Server node secured.', PRIORITY.objective, 2000);
    expect(seen.at(-1)).toBe('Server node secured.');
    vi.advanceTimersByTime(2100);
    expect(seen.at(-1)).toBeNull();
    // A later line hands the window over; the earlier one's end doesn't close it.
    showTransmission('First.', PRIORITY.report, 1000);
    showTransmission('Second.', PRIORITY.threat, 3000);
    vi.advanceTimersByTime(1500);
    expect(seen.at(-1)).toBe('Second.');
    off();
    vi.useRealTimers();
  });
});
