// The announcers: a corporate AI for each side who calls out what matters to the player in a
// match (lines: docs/VOICE_PROMPTS_FACTIONS.md; recordings: public/vo/vanta/ and
// public/vo/tokugen/, each listed in its folder's manifest.json).
//
// One line at a time, centred, on its own channel above the effects (components/sfx.ts
// voiceOutput), which dip while she speaks. Each line has a priority: threats over objectives
// over base reports over refusals. A threat cuts off anything less urgent; anything else that
// comes up while she is speaking waits its turn (just the most important one, and not for
// long), and a line she said a moment ago isn't repeated (each has its own cooldown).
//
// The recordings are clean; each voice's treatment is added here, the same on all its lines
// (VOICE_FX): Vanta's crystalline and wide, Tokugen's a sat-link radio with a squelch click.
//
// The scheduling (AnnouncerQueue) is pure, for testing; announce() is what the game calls.

import { duckEffects, isMuted, onAudioReady, voiceOutput } from './sfx';

export type VoKey =
  | 'vo_match_start' | 'vo_victory' | 'vo_defeat'
  | 'vo_base_under_attack' | 'vo_server_node_under_attack' | 'vo_core_node_under_attack' | 'vo_missile_launch'
  | 'vo_missile_intercepted' | 'vo_wall_breached' | 'vo_structure_lost' | 'vo_force_field_down' | 'vo_force_field_up'
  | 'vo_jammed' | 'vo_enemy_orbital_drop'
  | 'vo_core_node_captured' | 'vo_server_node_captured' | 'vo_core_node_lost' | 'vo_server_node_lost'
  | 'vo_construction_complete' | 'vo_barracks_online' | 'vo_factory_online' | 'vo_airpad_online' | 'vo_depot_online'
  | 'vo_comm_link_online' | 'vo_munitions_online' | 'vo_ordnance_fab_online' | 'vo_research_online' | 'vo_refinery_online'
  | 'vo_sentry_online' | 'vo_ciws_online' | 'vo_hq_deploying' | 'vo_hq_online' | 'vo_refinery_upgraded'
  | 'vo_research_complete' | 'vo_tier_ready' | 'vo_tier_2' | 'vo_tier_3'
  | 'vo_missile_away' | 'vo_missile_shot_down' | 'vo_orbital_drop' | 'vo_bulwark_field' | 'vo_decoys'
  | 'vo_cloaking_field' | 'vo_nano_cloud'
  | 'vo_not_enough_cores' | 'vo_cannot_build_there';

// How urgent a line is: the higher wins.
export const PRIORITY = { refusal: 0, report: 1, objective: 2, threat: 3, match: 4 } as const;
type Priority = typeof PRIORITY[keyof typeof PRIORITY];

const T = PRIORITY.threat, O = PRIORITY.objective, R = PRIORITY.report, X = PRIORITY.refusal, M = PRIORITY.match;
// For each line: its priority, and how long before the same line may play again.
export const LINES: Record<VoKey, { priority: Priority; cooldownMs: number }> = {
  vo_match_start: { priority: M, cooldownMs: 60_000 },
  vo_victory: { priority: M, cooldownMs: 60_000 },
  vo_defeat: { priority: M, cooldownMs: 60_000 },
  vo_base_under_attack: { priority: T, cooldownMs: 20_000 },
  vo_server_node_under_attack: { priority: T, cooldownMs: 15_000 },
  vo_core_node_under_attack: { priority: T, cooldownMs: 15_000 },
  vo_missile_launch: { priority: T, cooldownMs: 4_000 },
  vo_missile_intercepted: { priority: O, cooldownMs: 4_000 },
  vo_wall_breached: { priority: T, cooldownMs: 10_000 },
  vo_structure_lost: { priority: T, cooldownMs: 8_000 },
  vo_force_field_down: { priority: T, cooldownMs: 8_000 },
  vo_force_field_up: { priority: R, cooldownMs: 8_000 },
  vo_jammed: { priority: T, cooldownMs: 10_000 },
  vo_enemy_orbital_drop: { priority: T, cooldownMs: 10_000 },
  vo_core_node_captured: { priority: O, cooldownMs: 3_000 },
  vo_server_node_captured: { priority: O, cooldownMs: 3_000 },
  vo_core_node_lost: { priority: T, cooldownMs: 3_000 },
  vo_server_node_lost: { priority: T, cooldownMs: 3_000 },
  vo_construction_complete: { priority: R, cooldownMs: 3_000 },
  vo_barracks_online: { priority: R, cooldownMs: 3_000 },
  vo_factory_online: { priority: R, cooldownMs: 3_000 },
  vo_airpad_online: { priority: R, cooldownMs: 3_000 },
  vo_depot_online: { priority: R, cooldownMs: 3_000 },
  vo_comm_link_online: { priority: R, cooldownMs: 3_000 },
  vo_munitions_online: { priority: R, cooldownMs: 3_000 },
  vo_ordnance_fab_online: { priority: R, cooldownMs: 3_000 },
  vo_research_online: { priority: R, cooldownMs: 3_000 },
  vo_refinery_online: { priority: R, cooldownMs: 3_000 },
  vo_sentry_online: { priority: R, cooldownMs: 3_000 },
  vo_ciws_online: { priority: R, cooldownMs: 3_000 },
  vo_hq_deploying: { priority: R, cooldownMs: 5_000 },
  vo_hq_online: { priority: O, cooldownMs: 5_000 },
  vo_refinery_upgraded: { priority: R, cooldownMs: 5_000 },
  vo_research_complete: { priority: R, cooldownMs: 4_000 },
  vo_tier_ready: { priority: R, cooldownMs: 60_000 },
  vo_tier_2: { priority: O, cooldownMs: 10_000 },
  vo_tier_3: { priority: O, cooldownMs: 10_000 },
  vo_missile_away: { priority: R, cooldownMs: 4_000 },
  vo_missile_shot_down: { priority: O, cooldownMs: 4_000 },
  vo_orbital_drop: { priority: O, cooldownMs: 5_000 },
  vo_bulwark_field: { priority: O, cooldownMs: 5_000 },
  vo_decoys: { priority: O, cooldownMs: 5_000 },
  vo_cloaking_field: { priority: O, cooldownMs: 5_000 },
  vo_nano_cloud: { priority: O, cooldownMs: 5_000 },
  vo_not_enough_cores: { priority: X, cooldownMs: 3_000 },
  vo_cannot_build_there: { priority: X, cooldownMs: 3_000 },
};

// How long a line that had to wait is still worth saying.
export const STALE_MS = 3_500;

export type Decision = 'play' | 'interrupt' | 'queued' | 'dropped';

// Which line plays, which waits, which is dropped. Times are milliseconds on any one clock.
export class AnnouncerQueue {
  // The line being spoken, until when.
  current: { key: VoKey; priority: Priority; until: number } | null = null;
  // The one line waiting its turn, and when it was asked for.
  pending: { key: VoKey; priority: Priority; at: number } | null = null;
  private lastSaid: Partial<Record<VoKey, number>> = {};

  // A line is asked for. 'play' and 'interrupt' mean say it now (cutting off the current line);
  // call started() with how long it lasts.
  request(key: VoKey, now: number): Decision {
    const { priority, cooldownMs } = LINES[key];
    if (now - (this.lastSaid[key] ?? -Infinity) < cooldownMs) return 'dropped';
    if (this.pending?.key === key) return 'dropped';
    const speaking = this.current && this.current.until > now ? this.current : null;
    if (!speaking) return 'play';
    if (speaking.key === key) return 'dropped';
    // A threat (or the match result) cuts off anything less urgent.
    if (priority >= PRIORITY.threat && priority > speaking.priority) return 'interrupt';
    // Otherwise it waits, if nothing more urgent is already waiting.
    if (this.pending && now - this.pending.at < STALE_MS && this.pending.priority > priority) return 'dropped';
    this.pending = { key, priority, at: now };
    return 'queued';
  }

  // The line now playing, for `ms`.
  started(key: VoKey, now: number, ms: number): void {
    this.current = { key, priority: LINES[key].priority, until: now + ms };
    this.lastSaid[key] = now;
    if (this.pending?.key === key) this.pending = null;
  }

  // The line waiting, if the current one is over and it is still worth saying.
  next(now: number): VoKey | null {
    if (this.current && this.current.until > now) return null;
    const p = this.pending;
    this.pending = null;
    if (!p || now - p.at >= STALE_MS) return null;
    if (now - (this.lastSaid[p.key] ?? -Infinity) < LINES[p.key].cooldownMs) return null;
    return p.key;
  }

  reset(): void {
    this.current = null;
    this.pending = null;
    this.lastSaid = {};
  }
}

// --- Playback ---

// Two announcers, one for each side (docs/VOICE_PROMPTS_FACTIONS.md): Vanta's KAMI-OS, a composed
// female arbiter, and Tokugen's TAC-NET, a male combat controller. Each speaks only to its own
// side's player (spectating, to the side being viewed: setAnnouncerSide), from its own folder of
// recordings, through its own treatment.
export type Voice = 'vanta' | 'tokugen';
export const SIDE_VOICE: Record<'blue' | 'red', Voice> = { blue: 'vanta', red: 'tokugen' };

export interface VoiceFx {
  // The band: below and above this (Hz) is rolled off.
  lowCut: number;
  highCut: number;
  // A lift in the presence range.
  presenceHz: number;
  presenceDb: number;
  // A shelf over the top (Hz, dB): a faint shimmer.
  shelfHz: number;
  shelfDb: number;
  // A short doubling: copies a few milliseconds behind.
  doubling: { ms: number; gain: number }[];
  // Ring modulation: the voice times a low tone, mixed in under it.
  ringHz: number;
  ring: number;
  // Bit reduction: the voice quantised to this many levels, mixed in under it.
  crushLevels: number;
  crush: number;
  // Soft saturation: how hard the voice is driven (1 is clean).
  drive: number;
  // How much of the clean (filtered) voice.
  dry: number;
  // A radio squelch click at the start and end of each line.
  squelch: boolean;
  // How far the effects dip while the announcer speaks.
  duck: number;
}
export const VOICE_FX: Record<Voice, VoiceFx> = {
  // Crystalline and expensive: a wide, clean band, a faint high shimmer and a very short glassy
  // doubling, nothing of a radio about it.
  vanta: {
    lowCut: 110, highCut: 10500, presenceHz: 3200, presenceDb: 1.5, shelfHz: 7000, shelfDb: 3,
    doubling: [{ ms: 3.5, gain: 0.16 }, { ms: 7, gain: 0.08 }], ringHz: 180, ring: 0.04, crushLevels: 48, crush: 0,
    drive: 1, dry: 0.9, squelch: false, duck: 0.5,
  },
  // A sat-link radio: a narrow comms band, a push in the mids, light saturation and a squelch
  // click keying each transmission in and out.
  tokugen: {
    lowCut: 320, highCut: 3900, presenceHz: 1800, presenceDb: 4, shelfHz: 6000, shelfDb: 0,
    doubling: [{ ms: 11, gain: 0.1 }], ringHz: 90, ring: 0.06, crushLevels: 28, crush: 0.07,
    drive: 2.2, dry: 0.85, squelch: true, duck: 0.5,
  },
};

const MANIFESTS: Record<Voice, string> = { vanta: 'vo/vanta/manifest.json', tokugen: 'vo/tokugen/manifest.json' };
// Each voice's recordings of each line, with the words said in each (the manifest's "lines"),
// for the call window's transcript.
const takes: Record<Voice, Partial<Record<VoKey, AudioBuffer[]>>> = { vanta: {}, tokugen: {} };
const words: Record<Voice, Partial<Record<VoKey, string[]>>> = { vanta: {}, tokugen: {} };
const lastTake: Partial<Record<string, number>> = {};
const queue = new AnnouncerQueue();
let voice: Voice = 'vanta';
let chain: { ctx: AudioContext; inputs: Record<Voice, AudioNode>; squelch: AudioBuffer } | null = null;
let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wake: ReturnType<typeof setTimeout> | undefined;
const assetUrl = (path: string) => `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}${path}`;

// Which side's announcer speaks: the player's side, or the side being viewed when spectating.
export function setAnnouncerSide(team: string): void {
  if (team === 'blue' || team === 'red') voice = SIDE_VOICE[team];
}
export const announcerVoice = (): Voice => voice;

// The recordings load as soon as the audio starts, both voices (a spectator can switch sides).
onAudioReady(c => {
  for (const v of Object.keys(MANIFESTS) as Voice[]) {
    fetch(assetUrl(MANIFESTS[v]))
      .then(r => (r.ok ? r.json() as Promise<Record<string, { files: string[]; lines?: string[] }>> : Promise.reject(new Error(`${r.status}`))))
      .then(manifest => {
        for (const [key, entry] of Object.entries(manifest)) {
          if (!(key in LINES)) continue;
          entry.files.forEach((file, i) => {
            fetch(assetUrl(file))
              .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
              .then(data => c.decodeAudioData(data))
              .then(buffer => {
                (takes[v][key as VoKey] ??= []).push(buffer);
                (words[v][key as VoKey] ??= []).push(entry.lines?.[i] ?? entry.lines?.[0] ?? '');
              })
              .catch(e => console.warn(`voice line ${file} didn't load:`, e));
          });
        }
      })
      .catch(e => console.warn(`the ${v} announcer's manifest didn't load; that side is silent:`, e));
  }
});

// --- The transmission, for the call window (components/CommsCall.tsx) ---

// What the announcer is saying right now: whose voice, the line, its words, how urgent, and how
// long it runs.
export interface Transmission { voice: Voice; key: VoKey; text: string; priority: number; startedAt: number; durationMs: number }
const listeners = new Set<(t: Transmission | null) => void>();
let current: Transmission | null = null;
function emit(t: Transmission | null) {
  current = t;
  listeners.forEach(l => l(t));
}
// Shows a transmission in the call window without playing anything, for testing the window
// (GAME_CHEATS.call in CityMap.tsx): it closes after its duration.
export function showTransmission(text: string, priority: number = PRIORITY.report, durationMs = 3000): void {
  const t: Transmission = { voice, key: 'vo_match_start', text, priority, startedAt: performance.now(), durationMs };
  emit(t);
  setTimeout(() => { if (current === t) emit(null); }, durationMs);
}
// Calls `listener` whenever a line starts (with it) and when it stops (with null); returns the
// unsubscribe.
export function onTransmission(listener: (t: Transmission | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}
let meter: AnalyserNode | null = null;
const meterData = new Uint8Array(128);
// How loud the voice is right now, 0 to 1.
export function voiceLevel(): number {
  if (!meter) return 0;
  meter.getByteTimeDomainData(meterData);
  let sum = 0;
  for (let i = 0; i < meterData.length; i++) { const v = (meterData[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / meterData.length) * 4);
}

// A radio squelch click: a short burst of filtered noise that snaps off.
function squelchBuffer(c: BaseAudioContext): AudioBuffer {
  const n = Math.floor(c.sampleRate * 0.07);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  let seed = 9;
  for (let i = 0; i < n; i++) {
    seed = (seed * 16807) % 2147483647;
    const env = i < n * 0.08 ? i / (n * 0.08) : Math.pow(1 - (i - n * 0.08) / (n * 0.92), 3);
    d[i] = ((seed / 2147483647) * 2 - 1) * env * 0.35;
  }
  return b;
}

// Both voices' treatment chains, built once, into the voice channel.
function voiceChain() {
  const outlet = voiceOutput();
  if (!outlet) return null;
  if (chain?.ctx === outlet.ctx) return chain;
  // A level meter on the voice, for the call window's waveform.
  meter = outlet.ctx.createAnalyser();
  meter.fftSize = 256;
  const tap = outlet.ctx.createGain();
  tap.connect(outlet.out);
  tap.connect(meter);
  chain = {
    ctx: outlet.ctx,
    inputs: { vanta: buildVoiceChain(outlet.ctx, tap, VOICE_FX.vanta), tokugen: buildVoiceChain(outlet.ctx, tap, VOICE_FX.tokugen) },
    squelch: squelchBuffer(outlet.ctx),
  };
  return chain;
}

// A voice's treatment (VoiceFx) from the returned input into `out`. Exported so a line can be
// rendered offline through it, to hear the treatment outside a match.
export function buildVoiceChain(c: BaseAudioContext, out: AudioNode, fx: VoiceFx = VOICE_FX.vanta): AudioNode {
  const input = c.createGain();
  const low = c.createBiquadFilter();
  low.type = 'highpass';
  low.frequency.value = fx.lowCut;
  const high = c.createBiquadFilter();
  high.type = 'lowpass';
  high.frequency.value = fx.highCut;
  const presence = c.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = fx.presenceHz;
  presence.gain.value = fx.presenceDb;
  const shelf = c.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = fx.shelfHz;
  shelf.gain.value = fx.shelfDb;
  // Soft saturation, then the filters.
  let head: AudioNode = input;
  if (fx.drive > 1) {
    const shaper = c.createWaveShaper();
    const curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * fx.drive) / Math.tanh(fx.drive);
    }
    shaper.curve = curve;
    input.connect(shaper);
    head = shaper;
  }
  head.connect(low).connect(high).connect(presence).connect(shelf);
  const voiced = shelf;
  const mix = (node: AudioNode, level: number) => { const g = c.createGain(); g.gain.value = level; node.connect(g).connect(out); };
  mix(voiced, fx.dry);
  for (const d of fx.doubling) {
    const delay = c.createDelay(0.05);
    delay.delayTime.value = d.ms / 1000;
    voiced.connect(delay);
    mix(delay, d.gain);
  }
  // Ring modulation: a gain whose level is driven by a low tone.
  if (fx.ring > 0) {
    const ring = c.createGain();
    ring.gain.value = 0;
    const carrier = c.createOscillator();
    carrier.frequency.value = fx.ringHz;
    carrier.connect(ring.gain);
    carrier.start();
    voiced.connect(ring);
    mix(ring, fx.ring);
  }
  // Bit reduction: a staircase transfer curve.
  if (fx.crush > 0) {
    const crusher = c.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * fx.crushLevels) / fx.crushLevels;
    }
    crusher.curve = curve;
    voiced.connect(crusher);
    mix(crusher, fx.crush);
  }
  return input;
}

function speak(key: VoKey, interrupt: boolean): void {
  const ch = voiceChain();
  const v = voice;
  const options = takes[v][key];
  if (!ch || !options?.length) return;
  const { ctx: c } = ch;
  const input = ch.inputs[v], fx = VOICE_FX[v];
  if (interrupt && playing) {
    const old = playing;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.03);
    old.src.stop(c.currentTime + 0.12);
  }
  const takeKey = `${v}:${key}`;
  let pick = Math.floor(Math.random() * options.length);
  if (options.length > 1 && pick === lastTake[takeKey]) pick = (pick + 1) % options.length;
  lastTake[takeKey] = pick;
  const buffer = options[pick];
  const src = c.createBufferSource();
  src.buffer = buffer;
  const gain = c.createGain();
  src.connect(gain).connect(input);
  // A radio keys in a moment before the voice and out just after it.
  const lead = fx.squelch ? 0.06 : 0;
  const at = c.currentTime + (interrupt ? 0.1 : 0.01) + lead;
  src.start(at);
  if (fx.squelch) {
    for (const when of [at - lead, at + buffer.duration + 0.02]) {
      const click = c.createBufferSource();
      click.buffer = ch.squelch;
      click.connect(input);
      click.start(when);
    }
  }
  playing = { src, gain };
  // The call window shows this line from when it starts until it ends (only this line's end
  // closes it: a line cut off by another hands the window straight over).
  const line: Transmission = { voice: v, key, text: words[v][key]?.[pick] ?? '', priority: LINES[key].priority, startedAt: 0, durationMs: buffer.duration * 1000 };
  src.onended = () => {
    if (playing?.src === src) playing = null;
    if (current === line) emit(null);
  };
  setTimeout(() => { if (playing?.src === src) { line.startedAt = performance.now(); emit(line); } }, Math.max(0, (at - c.currentTime) * 1000));
  duckEffects(fx.duck, at, at + buffer.duration);
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) ((window as unknown as { __VO?: string[] }).__VO ??= []).push(`${v}:${key}`);
  const ms = (buffer.duration + lead) * 1000 + (interrupt ? 100 : 10);
  queue.started(key, performance.now(), ms);
  // When it is done, the line waiting (if any) gets its turn.
  clearTimeout(wake);
  wake = setTimeout(() => {
    const next = queue.next(performance.now());
    if (next) speak(next, false);
  }, ms + 150);
}

// Asks the announcer to say a line, now or after `delayMs` (to follow the chime or siren for the
// same event). Silent while muted, before the audio starts, or if the line hasn't loaded, unless
// `waitMs` is given: then it waits up to that long for the audio and the line (the match's opening
// line comes as the audio is still starting up).
export function announce(key: VoKey, { delayMs = 0, waitMs = 0 } = {}): void {
  if (delayMs > 0) { setTimeout(() => announce(key, { waitMs }), delayMs); return; }
  if (isMuted()) return;
  if (!takes[voice][key]?.length || !voiceOutput()) {
    if (waitMs > 0) setTimeout(() => announce(key, { waitMs: waitMs - 250 }), 250);
    return;
  }
  const decision = queue.request(key, performance.now());
  if (decision === 'play' || decision === 'interrupt') speak(key, decision === 'interrupt');
}

// A new match: forget what was said and stop talking.
export function resetAnnouncer(): void {
  queue.reset();
  clearTimeout(wake);
  emit(null);
  if (playing && chain) {
    playing.gain.gain.setTargetAtTime(0, chain.ctx.currentTime, 0.03);
    playing.src.stop(chain.ctx.currentTime + 0.12);
    playing = null;
  }
}

// Which line a finished base building is announced with.
export const BUILDING_LINES: Partial<Record<string, VoKey>> = {
  infantry: 'vo_barracks_online',
  armor: 'vo_factory_online',
  air: 'vo_airpad_online',
  builder: 'vo_depot_online',
  support: 'vo_comm_link_online',
  ordnance: 'vo_munitions_online',
  ordnance_fab: 'vo_ordnance_fab_online',
  research_lab: 'vo_research_online',
  refinery: 'vo_refinery_online',
  defense: 'vo_sentry_online',
  aa_turret: 'vo_ciws_online',
  hq: 'vo_hq_online',
};
