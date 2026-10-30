// Sound effects, played with the Web Audio API.
//
// A sound with recordings (files in public/sfx/, listed by sound in public/sfx/manifest.json;
// prompts in docs/SOUND_PROMPTS.md) plays one of its takes, picked at random and never the same
// take twice running, a touch faster or slower each time so a volley doesn't sound like one clip
// repeated. An explosion plays a small, medium or large recording by the size of the blast. The
// recordings load once the audio starts; until one has loaded, or if it can't be, that sound is
// made in code instead, as are the sounds with no recordings yet (Hornet rockets, Wasp swarms, the
// Ballista's launch).
//
// A sound made in code is built from a few oscillators and bursts of filtered noise, shaped by
// quick volume envelopes, with a little randomness:
//   - rifle, mg: a sharp crack of noise with a short low thump; machine guns a touch lower.
//   - flak: a duller, heavier pop. ciws: a short buzz-saw burst, for a gun firing thousands a minute.
//   - cannon: a deep boom falling in pitch under a burst of noise.
//   - rail: the railgun. A hard crack, an electric zap sweeping down, a metallic ring that hangs
//     in the air, and a sub-bass punch.
//   - missile (Lancer), rocket (Thunderhead), hornet_rocket, wasp_swarm, ballista_launch: a
//     rushing whoosh rising in pitch as it leaves the tube.
//   - laser: the Sentinel's beam, a buzzing tone sweeping down.
//   - blade: a quick swish.
//   - explosion: a roar of noise that darkens as it fades over a deep falling boom, longer and
//     lower the bigger the blast. emp: an electric crackle over a dropping tone. shield: a soft
//     electric thud where a shot meets a force field.
//
// Where a sound is matters: it is fainter the further it is from the middle of the view (heard
// further when zoomed out, explosions further than gunfire) and panned left or right by where it is
// on screen, from the listener the camera keeps up to date (`listen`). Each kind of sound has a
// cap on how many play at once and how soon another may start, so a big firefight stays a din and
// not a wall of noise; everything goes through a compressor so loud moments don't clip.
//
// Browsers won't play sound before the player has clicked or pressed a key on the page, so the
// audio starts on the first one. The player can mute it (the speaker button on the HUD); that is
// remembered between visits.

export type SoundKind = 'rifle' | 'mg' | 'flak' | 'ciws' | 'cannon' | 'rail' | 'missile' | 'rocket' | 'hornet_rocket' | 'wasp_swarm' | 'ballista_launch' | 'laser' | 'blade' | 'explosion' | 'emp' | 'shield';

// What the recordings are filed under in the manifest: a sound's own name, or for an explosion,
// which size of blast it is.
export type SampleKey = SoundKind | 'explosion_small' | 'explosion_large';
export const SAMPLE_MANIFEST = 'sfx/manifest.json';
// An explosion's size (its radius / 4) up to which it counts as small, then medium; past that, large.
export const EXPLOSION_SIZES = { small: 0.7, medium: 1.9 };
// How far a recording's speed (and so its pitch) varies from take to take.
const SAMPLE_RATE_SPREAD = 0.06;

// For each kind: how loud, how many at once, the least time between two starting, and how far it
// carries compared with gunfire.
const KINDS: Record<SoundKind, { gain: number; voices: number; gapMs: number; reach: number }> = {
  rifle: { gain: 0.55, voices: 8, gapMs: 35, reach: 1 },
  mg: { gain: 0.5, voices: 6, gapMs: 45, reach: 1 },
  flak: { gain: 0.55, voices: 5, gapMs: 60, reach: 1.1 },
  ciws: { gain: 0.4, voices: 3, gapMs: 90, reach: 1.1 },
  cannon: { gain: 0.6, voices: 5, gapMs: 60, reach: 1.3 },
  rail: { gain: 0.65, voices: 4, gapMs: 50, reach: 1.4 },
  missile: { gain: 0.65, voices: 4, gapMs: 80, reach: 1.2 },
  rocket: { gain: 0.6, voices: 5, gapMs: 50, reach: 1.3 },
  hornet_rocket: { gain: 0.6, voices: 5, gapMs: 50, reach: 1.3 },
  wasp_swarm: { gain: 0.55, voices: 4, gapMs: 60, reach: 1.2 },
  ballista_launch: { gain: 0.65, voices: 3, gapMs: 80, reach: 1.4 },
  laser: { gain: 0.4, voices: 3, gapMs: 140, reach: 1 },
  blade: { gain: 0.5, voices: 3, gapMs: 80, reach: 0.8 },
  explosion: { gain: 0.85, voices: 8, gapMs: 25, reach: 1.8 },
  emp: { gain: 0.6, voices: 3, gapMs: 80, reach: 1.6 },
  shield: { gain: 0.4, voices: 4, gapMs: 70, reach: 1 },
};
const MAX_VOICES = 28;
const MASTER_GAIN = 0.55;
const MUTE_KEY = 'sector7.sfx.muted';

// --- Where the player is listening from ---

// The middle of the view on the ground, the camera's heading and its height (DroneCamera.tsx).
export interface Listener { x: number; z: number; yaw: number; height: number }
const listener: Listener = { x: 0, z: 0, yaw: 0, height: 80 };
export function listen(x: number, z: number, yaw: number, height: number): void {
  listener.x = x; listener.z = z; listener.yaw = yaw; listener.height = height;
}

// How loud (0 to 1) and how far left or right (-1 to 1) a sound at (x, z) is heard, for a kind
// that carries `reach` times as far as gunfire. Pure, for testing.
export function spatial(l: Listener, x: number, z: number, reach = 1): { gain: number; pan: number } {
  const range = (140 + l.height * 1.6) * reach;
  const dx = x - l.x, dz = z - l.z;
  const d = Math.hypot(dx, dz);
  if (d >= range) return { gain: 0, pan: 0 };
  // Zoomed right in, the battle is close: louder than from high up.
  const nearness = 1 - 0.4 * Math.min(1, Math.max(0, (l.height - 20) / 170));
  const gain = (1 - d / range) ** 1.5 * nearness;
  // Along the screen's left-to-right: the heading turned a quarter clockwise.
  const across = dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw);
  return { gain, pan: Math.max(-1, Math.min(1, across / (range * 0.45))) };
}

// --- The audio graph ---

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
// Two seconds of white noise per audio context, shared by every sound that needs it.
const noises = new WeakMap<BaseAudioContext, AudioBuffer>();
function noiseFor(c: BaseAudioContext): AudioBuffer {
  let buffer = noises.get(c);
  if (!buffer) {
    buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(c, buffer);
  }
  return buffer;
}
let muted = readMuted();
const playing: Record<string, number> = {};
const lastStart: Record<string, number> = {};
let voices = 0;

function readMuted(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}
export const isMuted = () => muted;
export function setMuted(on: boolean): void {
  muted = on;
  try { localStorage.setItem(MUTE_KEY, on ? '1' : '0'); } catch { /* private window: not remembered */ }
  if (master && ctx) master.gain.setTargetAtTime(on ? 0 : MASTER_GAIN, ctx.currentTime, 0.02);
}

// The first click or key press starts the audio (and resumes it if the browser suspended it).
function unlock(): void {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_GAIN;
    master.connect(compressor).connect(ctx.destination);
    loadSamples(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}
if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, unlock, { capture: true });
}

// --- Recordings ---

const buffers: Partial<Record<SampleKey, AudioBuffer[]>> = {};
const lastTake: Partial<Record<SampleKey, number>> = {};
const assetUrl = (path: string) => `${(import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'}${path}`;

// The manifest: for each recorded sound, its take files (paths under public/).
export type SampleManifest = Partial<Record<SampleKey, { description?: string; files: string[] }>>;

// Fetch the manifest, then fetch and decode every take. Each sound can use its takes as soon as
// they are in; one that fails to load is left out, and a sound with none keeps its made-in-code version.
function loadSamples(c: AudioContext): void {
  const load = (key: SampleKey, file: string) => fetch(assetUrl(file))
    .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
    .then(data => c.decodeAudioData(data))
    .then(buffer => { (buffers[key] ??= []).push(buffer); })
    .catch(e => console.warn(`sound ${file} didn't load:`, e));
  fetch(assetUrl(SAMPLE_MANIFEST))
    .then(r => (r.ok ? r.json() as Promise<SampleManifest> : Promise.reject(new Error(`${r.status}`))))
    .then(manifest => {
      for (const [key, entry] of Object.entries(manifest) as [SampleKey, { files: string[] }][]) for (const file of entry.files) void load(key, file);
    })
    .catch(e => console.warn("sound manifest didn't load; every sound is made in code:", e));
}

// Which recordings a sound plays: its own, or for an explosion, the ones for its size.
export function sampleKey(kind: SoundKind, size: number): SampleKey {
  if (kind !== 'explosion') return kind;
  return size <= EXPLOSION_SIZES.small ? 'explosion_small' : size <= EXPLOSION_SIZES.medium ? 'explosion' : 'explosion_large';
}

// Which take to play out of `count`: any but the one played last, when there is a choice.
export function pickTake(count: number, last: number | undefined, random = Math.random): number {
  if (count <= 1) return 0;
  const pick = Math.floor(random() * (count - 1));
  return last !== undefined && pick >= last ? pick + 1 : pick;
}

// Plays a take of `kind`'s recording into `out` at `t`, returning how long it lasts, or null when
// it has none loaded. An explosion whose size has no recordings loaded uses the medium ones.
function playSample(c: BaseAudioContext, kind: SoundKind, size: number, out: AudioNode, t: number): number | null {
  let key = sampleKey(kind, size);
  if (!buffers[key]?.length) key = kind;
  const takes = buffers[key];
  if (!takes?.length) return null;
  const take = pickTake(takes.length, lastTake[key]);
  lastTake[key] = take;
  const src = c.createBufferSource();
  src.buffer = takes[take];
  src.playbackRate.value = rand(1 - SAMPLE_RATE_SPREAD, 1 + SAMPLE_RATE_SPREAD);
  src.connect(out);
  src.start(t);
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) ((window as unknown as { __SFX_TAKES?: string[] }).__SFX_TAKES ??= []).push(`${key}_${take + 1}`);
  return takes[take].duration / src.playbackRate.value;
}

// --- Building blocks: each starts at `t`, plays into `out`, and is gone by `t + dur` ---

const rand = (a: number, b: number) => a + Math.random() * (b - a);

// A volume envelope: up to `peak` in `attack` seconds, then dying away exponentially over `decay`.
function envelope(c: BaseAudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

// A burst of noise through a filter whose frequency glides from `f0` to `f1`.
function noiseBurst(c: BaseAudioContext, out: AudioNode, t: number, o: { type: BiquadFilterType; f0: number; f1?: number; q?: number; peak: number; attack?: number; decay: number }) {
  const src = c.createBufferSource();
  src.buffer = noiseFor(c);
  src.playbackRate.value = rand(0.9, 1.1);
  const filter = c.createBiquadFilter();
  filter.type = o.type;
  filter.Q.value = o.q ?? 0.8;
  filter.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) filter.frequency.exponentialRampToValueAtTime(o.f1, t + (o.attack ?? 0.002) + o.decay);
  const env = envelope(c, t, o.peak, o.attack ?? 0.002, o.decay);
  src.connect(filter).connect(env).connect(out);
  // Start somewhere different in the buffer each time.
  src.start(t, Math.random() * 1.5, (o.attack ?? 0.002) + o.decay + 0.05);
}

// A tone gliding from `f0` to `f1` Hz.
function tone(c: BaseAudioContext, out: AudioNode, t: number, o: { type: OscillatorType; f0: number; f1: number; peak: number; attack?: number; decay: number; glide?: number }) {
  const osc = c.createOscillator();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f0, t);
  osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.glide ?? o.decay));
  const env = envelope(c, t, o.peak, o.attack ?? 0.002, o.decay);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + (o.attack ?? 0.002) + o.decay + 0.05);
}

// Launch whooshes, shared by the missiles and rockets that don't have recordings of their own.
function missileWhoosh(c: BaseAudioContext, out: AudioNode, t: number) {
  noiseBurst(c, out, t, { type: 'bandpass', f0: 500, f1: 2600, q: 1.4, peak: 1, attack: 0.03, decay: 0.42 });
  tone(c, out, t, { type: 'sine', f0: 160, f1: 60, peak: 0.4, decay: 0.08 });
  return 0.5;
}
function rocketWhoosh(c: BaseAudioContext, out: AudioNode, t: number) {
  noiseBurst(c, out, t, { type: 'bandpass', f0: 400, f1: 2000, q: 1.2, peak: 1, attack: 0.04, decay: 0.6 });
  tone(c, out, t, { type: 'sine', f0: 140, f1: 50, peak: 0.45, decay: 0.1 });
  return 0.7;
}

// Each sound made in code, played into `out` at `t`; `size` scales an explosion. Returns how long it lasts.
// Exported to render previews offline (an OfflineAudioContext).
export const SOUNDS: Record<SoundKind, (c: BaseAudioContext, out: AudioNode, t: number, size: number) => number> = {
  rifle: (c, out, t) => {
    noiseBurst(c, out, t, { type: 'bandpass', f0: rand(2200, 3000), q: 0.7, peak: 1, decay: 0.07 });
    tone(c, out, t, { type: 'sine', f0: 220, f1: 80, peak: 0.45, decay: 0.05 });
    return 0.1;
  },
  mg: (c, out, t) => {
    noiseBurst(c, out, t, { type: 'bandpass', f0: rand(1500, 2000), q: 0.8, peak: 1, decay: 0.06 });
    tone(c, out, t, { type: 'sine', f0: 180, f1: 70, peak: 0.5, decay: 0.05 });
    return 0.09;
  },
  flak: (c, out, t) => {
    noiseBurst(c, out, t, { type: 'bandpass', f0: rand(900, 1300), q: 0.9, peak: 1, decay: 0.12 });
    tone(c, out, t, { type: 'sine', f0: 150, f1: 55, peak: 0.6, decay: 0.09 });
    return 0.15;
  },
  ciws: (c, out, t) => {
    // A rapid string of cracks run together.
    for (let i = 0; i < 6; i++) noiseBurst(c, out, t + i * 0.018, { type: 'bandpass', f0: rand(1800, 2400), q: 1.2, peak: 0.9, decay: 0.022 });
    tone(c, out, t, { type: 'square', f0: 55, f1: 50, peak: 0.25, decay: 0.11 });
    return 0.14;
  },
  cannon: (c, out, t) => {
    tone(c, out, t, { type: 'sine', f0: rand(100, 120), f1: 36, peak: 1, attack: 0.004, decay: 0.38 });
    noiseBurst(c, out, t, { type: 'lowpass', f0: 1600, f1: 300, peak: 0.8, attack: 0.002, decay: 0.3 });
    noiseBurst(c, out, t, { type: 'highpass', f0: 3000, peak: 0.5, decay: 0.03 });
    return 0.42;
  },
  rail: (c, out, t) => {
    noiseBurst(c, out, t, { type: 'highpass', f0: 2600, peak: 1, decay: 0.05 });
    // The zap: a bright buzz sweeping down through a resonant filter.
    const zap = c.createBiquadFilter();
    zap.type = 'bandpass';
    zap.Q.value = 3;
    zap.frequency.setValueAtTime(3200, t);
    zap.frequency.exponentialRampToValueAtTime(500, t + 0.2);
    zap.connect(out);
    tone(c, zap, t, { type: 'sawtooth', f0: 2600, f1: 180, peak: 0.9, decay: 0.2 });
    // The ring: a few inharmonic partials, as struck metal has, dying slowly.
    for (const [f, p] of [[1420, 0.32], [2270, 0.2], [3190, 0.12]] as const) tone(c, out, t, { type: 'sine', f0: f * rand(0.98, 1.02), f1: f * 0.94, peak: p, attack: 0.004, decay: 0.7 });
    tone(c, out, t, { type: 'sine', f0: 75, f1: 32, peak: 0.85, attack: 0.003, decay: 0.3 });
    return 0.78;
  },
  missile: (c, out, t) => missileWhoosh(c, out, t),
  ballista_launch: (c, out, t) => missileWhoosh(c, out, t),
  rocket: (c, out, t) => rocketWhoosh(c, out, t),
  hornet_rocket: (c, out, t) => rocketWhoosh(c, out, t),
  wasp_swarm: (c, out, t) => rocketWhoosh(c, out, t),
  laser: (c, out, t) => {
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 2;
    filter.connect(out);
    tone(c, filter, t, { type: 'sawtooth', f0: 1300, f1: 620, peak: 0.9, attack: 0.01, decay: 0.2 });
    tone(c, out, t, { type: 'sine', f0: 2600, f1: 1800, peak: 0.25, attack: 0.01, decay: 0.16 });
    return 0.25;
  },
  blade: (c, out, t) => {
    noiseBurst(c, out, t, { type: 'bandpass', f0: 3200, f1: 900, q: 1.5, peak: 1, attack: 0.02, decay: 0.12 });
    return 0.16;
  },
  explosion: (c, out, t, size) => {
    const s = Math.min(3, Math.max(0.5, size));
    const dur = 0.8 + 0.45 * s;
    noiseBurst(c, out, t, { type: 'lowpass', f0: rand(2200, 3000), f1: 160, q: 0.6, peak: 1, attack: 0.004, decay: dur });
    tone(c, out, t, { type: 'sine', f0: 75 / Math.sqrt(s), f1: 26, peak: 1, attack: 0.006, decay: dur * 0.75 });
    noiseBurst(c, out, t, { type: 'highpass', f0: 1800, peak: 0.6, decay: 0.05 });
    // A few late crackles of debris.
    for (let i = 0; i < 3; i++) noiseBurst(c, out, t + rand(0.12, 0.5) * s, { type: 'bandpass', f0: rand(1500, 3500), q: 1, peak: rand(0.15, 0.3), decay: 0.04 });
    return dur + 0.1;
  },
  emp: (c, out, t) => {
    tone(c, out, t, { type: 'sawtooth', f0: 900, f1: 60, peak: 0.6, attack: 0.005, decay: 0.7 });
    for (let i = 0; i < 8; i++) noiseBurst(c, out, t + rand(0, 0.5), { type: 'bandpass', f0: rand(2500, 5000), q: 2, peak: rand(0.3, 0.6), decay: 0.03 });
    tone(c, out, t, { type: 'sine', f0: 60, f1: 28, peak: 0.8, attack: 0.005, decay: 0.5 });
    return 0.8;
  },
  shield: (c, out, t) => {
    tone(c, out, t, { type: 'triangle', f0: 620, f1: 260, peak: 0.7, attack: 0.003, decay: 0.18 });
    noiseBurst(c, out, t, { type: 'lowpass', f0: 1200, peak: 0.4, decay: 0.1 });
    return 0.22;
  },
};

// Play a sound of `kind` at world point (x, z). `size` scales an explosion (its radius / 4).
export function playSound(kind: SoundKind, x: number, z: number, size = 1): void {
  if (muted || !ctx || !master || ctx.state !== 'running') return;
  const spec = KINDS[kind];
  const { gain, pan } = spatial(listener, x, z, spec.reach);
  if (gain < 0.02) return;
  const now = performance.now();
  if ((playing[kind] ?? 0) >= spec.voices || voices >= MAX_VOICES || now - (lastStart[kind] ?? -Infinity) < spec.gapMs) return;
  lastStart[kind] = now;
  const out = ctx.createGain();
  out.gain.value = spec.gain * gain;
  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  out.connect(panner).connect(master);
  const t = ctx.currentTime + 0.005;
  const dur = playSample(ctx, kind, size, out, t) ?? SOUNDS[kind](ctx, out, t, size);
  playing[kind] = (playing[kind] ?? 0) + 1;
  voices++;
  // In development, a log of what played, for checking from the console.
  if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) ((window as unknown as { __SFX?: string[] }).__SFX ??= []).push(kind);
  setTimeout(() => {
    playing[kind]--;
    voices--;
    out.disconnect();
    panner.disconnect();
  }, (dur + 0.1) * 1000);
}
