// The announcer: a military support AI who calls out what matters to the player in a match (her
// lines: docs/VOICE_PROMPTS.md, recordings: public/vo/, listed in public/vo/manifest.json).
//
// One line at a time, centred, on its own channel above the effects (components/sfx.ts
// voiceOutput), which dip while she speaks. Each line has a priority: threats over objectives
// over base reports over refusals. A threat cuts off anything less urgent; anything else that
// comes up while she is speaking waits its turn (just the most important one, and not for
// long), and a line she said a moment ago isn't repeated (each has its own cooldown).
//
// The recordings are clean; the robotic edge is added here, the same on every line: a comms
// band-pass, a short metallic doubling, a touch of ring modulation and of bit reduction (VOICE_FX).
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
  | 'vo_research_complete' | 'vo_tier_ready' | 'vo_tier_2' | 'vo_tier_3' | 'vo_unit_ready'
  | 'vo_missile_away' | 'vo_missile_shot_down' | 'vo_orbital_drop' | 'vo_bulwark_field' | 'vo_decoys'
  | 'vo_cloaking_field' | 'vo_nano_cloud'
  | 'vo_not_enough_cores' | 'vo_cannot_build_there' | 'vo_unable';

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
  // Units come out all the time: said now and then, not for every one.
  vo_unit_ready: { priority: R, cooldownMs: 12_000 },
  vo_missile_away: { priority: R, cooldownMs: 4_000 },
  vo_missile_shot_down: { priority: O, cooldownMs: 4_000 },
  vo_orbital_drop: { priority: O, cooldownMs: 5_000 },
  vo_bulwark_field: { priority: O, cooldownMs: 5_000 },
  vo_decoys: { priority: O, cooldownMs: 5_000 },
  vo_cloaking_field: { priority: O, cooldownMs: 5_000 },
  vo_nano_cloud: { priority: O, cooldownMs: 5_000 },
  vo_not_enough_cores: { priority: X, cooldownMs: 3_000 },
  vo_cannot_build_there: { priority: X, cooldownMs: 3_000 },
  vo_unable: { priority: X, cooldownMs: 3_000 },
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

// The robotic treatment, the same on every line.
export const VOICE_FX = {
  // The comms band: below and above this (Hz) is rolled off.
  lowCut: 260,
  highCut: 5200,
  // A lift in the presence range, for a radio edge.
  presenceHz: 2000,
  presenceDb: 3,
  // A short metallic doubling: two copies a few milliseconds behind.
  doubling: [{ ms: 9, gain: 0.3 }, { ms: 17, gain: 0.16 }],
  // Ring modulation: the voice times a low tone, mixed in under it.
  ringHz: 95,
  ring: 0.14,
  // Bit reduction: the voice quantised to this many levels, mixed in under it.
  crushLevels: 24,
  crush: 0.1,
  // How much of the clean (band-passed) voice.
  dry: 0.85,
  // How far the effects dip while she speaks.
  duck: 0.5,
};

const MANIFEST = 'vo/manifest.json';
const takes: Partial<Record<VoKey, AudioBuffer[]>> = {};
const lastTake: Partial<Record<VoKey, number>> = {};
const queue = new AnnouncerQueue();
let chain: { ctx: AudioContext; input: AudioNode } | null = null;
let playing: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let wake: ReturnType<typeof setTimeout> | undefined;
const assetUrl = (path: string) => `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}${path}`;

// The recordings load as soon as the audio starts.
onAudioReady(c => {
  fetch(assetUrl(MANIFEST))
    .then(r => (r.ok ? r.json() as Promise<Record<string, { files: string[] }>> : Promise.reject(new Error(`${r.status}`))))
    .then(manifest => {
      for (const [key, entry] of Object.entries(manifest)) {
        if (!(key in LINES)) continue;
        for (const file of entry.files) {
          fetch(assetUrl(file))
            .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
            .then(data => c.decodeAudioData(data))
            .then(buffer => { (takes[key as VoKey] ??= []).push(buffer); })
            .catch(e => console.warn(`voice line ${file} didn't load:`, e));
        }
      }
    })
    .catch(e => console.warn("announcer manifest didn't load; the announcer is silent:", e));
});

// The treatment chain, built once, into the voice channel.
function voiceChain(): { ctx: AudioContext; input: AudioNode } | null {
  const outlet = voiceOutput();
  if (!outlet) return null;
  if (chain?.ctx === outlet.ctx) return chain;
  chain = { ctx: outlet.ctx, input: buildVoiceChain(outlet.ctx, outlet.out) };
  return chain;
}

// The robotic treatment (VOICE_FX) from the returned input into `out`. Exported so a line can be
// rendered offline through it, to hear the treatment outside a match.
export function buildVoiceChain(c: BaseAudioContext, out: AudioNode, fx = VOICE_FX): AudioNode {
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
  input.connect(low).connect(high).connect(presence);
  const mix = (node: AudioNode, level: number) => { const g = c.createGain(); g.gain.value = level; node.connect(g).connect(out); };
  mix(presence, fx.dry);
  for (const d of fx.doubling) {
    const delay = c.createDelay(0.05);
    delay.delayTime.value = d.ms / 1000;
    presence.connect(delay);
    mix(delay, d.gain);
  }
  // Ring modulation: a gain whose level is driven by a low tone.
  const ring = c.createGain();
  ring.gain.value = 0;
  const carrier = c.createOscillator();
  carrier.frequency.value = fx.ringHz;
  carrier.connect(ring.gain);
  carrier.start();
  presence.connect(ring);
  mix(ring, fx.ring);
  // Bit reduction: a staircase transfer curve.
  const crusher = c.createWaveShaper();
  const curve = new Float32Array(4096);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.round(x * fx.crushLevels) / fx.crushLevels;
  }
  crusher.curve = curve;
  presence.connect(crusher);
  mix(crusher, fx.crush);
  return input;
}

function speak(key: VoKey, interrupt: boolean): void {
  const ch = voiceChain();
  const options = takes[key];
  if (!ch || !options?.length) return;
  const { ctx: c, input } = ch;
  if (interrupt && playing) {
    const old = playing;
    old.gain.gain.setTargetAtTime(0, c.currentTime, 0.03);
    old.src.stop(c.currentTime + 0.12);
  }
  let pick = Math.floor(Math.random() * options.length);
  if (options.length > 1 && pick === lastTake[key]) pick = (pick + 1) % options.length;
  lastTake[key] = pick;
  const buffer = options[pick];
  const src = c.createBufferSource();
  src.buffer = buffer;
  const gain = c.createGain();
  src.connect(gain).connect(input);
  const at = c.currentTime + (interrupt ? 0.1 : 0.01);
  src.start(at);
  playing = { src, gain };
  src.onended = () => { if (playing?.src === src) playing = null; };
  duckEffects(VOICE_FX.duck, at, at + buffer.duration);
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) ((window as unknown as { __VO?: string[] }).__VO ??= []).push(key);
  const ms = buffer.duration * 1000 + (interrupt ? 100 : 10);
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
  if (!takes[key]?.length || !voiceOutput()) {
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
