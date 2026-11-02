# Cuts a raw sound pack down for the game: trims each clip to its first transient (the railgun to
# its shot, after the charge-up), cuts it to length with a fade, mixes it to mono, levels the takes
# of each sound to match, and adds the pack's sounds to public/sfx/manifest.json (keeping the other
# packs' entries). Needs ffmpeg.
# Usage: python3 tools/process_sfx.py weapons <unzipped pack sfx dir> <earlier rifle takes dir> public/sfx
#        python3 tools/process_sfx.py impacts <unzipped pack sfx dir> public/sfx
#        python3 tools/process_sfx.py base <unzipped pack sfx dir> public/sfx
#        python3 tools/process_sfx.py interface <unzipped pack sfx dir> public/sfx
#        python3 tools/process_sfx.py ambience <city ambience file> public/sfx
#        python3 tools/process_sfx.py single <sound key> <file> <length s> <fade from s> public/sfx
#          (one recording as the only take of one sound, trimmed to its onset; replaces any before)
#        python3 tools/process_sfx.py loop <loop key> <file> <opening s> <loop s> <crossfade s> <level dB> public/sfx
#          (one recording as the only take of a loop: the opening, from its onset, plays once, then the
#          loop repeats; replaces any before)
import json, math, os, struct, subprocess, sys

mode = sys.argv[1]
if mode == 'weapons': src, earlier, out = sys.argv[2:5]
elif mode in ('impacts', 'base', 'interface', 'ambience'): src, out = sys.argv[2:4]
elif mode == 'single':
    key, path_in, length, fade_from, out = sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5]), sys.argv[6]
    src = os.path.dirname(os.path.abspath(path_in))
elif mode == 'loop':
    key, path_in, opening, loop_s, xfade, level, out = sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7]), sys.argv[8]
    src = os.path.dirname(os.path.abspath(path_in))
else: sys.exit(f'unknown pack {mode}: weapons, impacts, base, interface, ambience or single')
SR = 44100

def pcm(path, start=0.0, length=None):
    args = ['ffmpeg', '-v', 'error', '-ss', str(start), '-i', path]
    if length: args += ['-t', str(length)]
    d = subprocess.run(args + ['-ac', '1', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return struct.unpack('<%dh' % (len(d) // 2), d)

def frames(s, ms):
    w = int(SR * ms / 1000)
    return [math.sqrt(sum(x * x for x in s[i:i + w]) / w) for i in range(0, len(s) - w + 1, w)]

db = lambda v: 20 * math.log10(max(v, 1e-9) / 32768)

def onset(path):
    s = pcm(path)
    pk = max(abs(x) for x in s)
    i = next(i for i, x in enumerate(s) if abs(x) > pk * 0.1)
    return max(0, i - int(0.002 * SR)) / SR

def last_onset(path):
    # The last jump out of near-silence: the railgun's shot after its charge-up.
    f = frames(pcm(path), 10)
    hits = [i for i in range(10, len(f)) if max(db(v) for v in f[i - 10:i]) < -60 and db(f[i]) > -60]
    return max(0, hits[-1] * 0.01 - 0.005)

# kind: [(file, start, length, fade_from, fade_in)], target loudest-50ms RMS in dBFS. A take starts
# at its onset, at the railgun's last onset ('last'), or at a set time in seconds.
O = 'onset'
WEAPONS = {
    'rifle': ([(f'rifle_{i}.mp3', O, 0.45, 0.22, 0) for i in range(1, 5)], -12),
    'mg': ([(f'mg_{i}.mp3', O, 0.32, 0.15, 0) for i in range(1, 5)], -12),
    'flak': ([(f'flak_{i}.mp3', O, 0.6, 0.3, 0) for i in range(1, 5)], -12),
    'cannon': ([('cannon_1.mp3', O, 1.2, 0.6, 0), ('cannon_2.mp3', O, 1.2, 0.6, 0), ('cannon_3.mp3', O, 0.62, 0.4, 0), ('cannon_4.mp3', O, 1.2, 0.6, 0)], -12),
    'rail': ([(f'rail_{i}.mp3', 'last', 0.9, 0.5, 0) for i in range(1, 4)], -12),
    'missile': ([(f'missile_{i}.mp3', O, 1.6, 1.0, 0) for i in range(1, 4)], -12),
    'rocket': ([('rocket_1.mp3', O, 2.0, 1.4, 0), ('rocket_2.mp3', O, 2.4, 1.6, 0), ('rocket_3.mp3', O, 2.0, 1.4, 0)], -12),
    'blade': ([(f'blade_{i}.mp3', O, 0.5, 0.3, 0) for i in range(1, 3)], -12),
    'explosion_small': ([(f'explosion_small_{i}.mp3', O, 1.4, 0.7, 0) for i in range(1, 3)], -12),
    'explosion': ([(f'explosion_{i}.mp3', O, 2.4, 1.2, 0) for i in range(1, 3)], -12),
    'explosion_large': ([(f'explosion_large_{i}.mp3', O, 4.0, 2.0, 0) for i in range(1, 3)], -12),
    'emp': ([(f'emp_{i}.mp3', O, 1.6, 0.8, 0) for i in range(1, 3)], -12),
    'shield': ([(f'shield_{i}.mp3', O, 0.5, 0.25, 0) for i in range(1, 3)], -14),
}
IMPACTS = {
    'hit_metal': ([(f'hit_metal_{i}.mp3', O, 0.7, 0.35, 0) for i in (1, 2)], -12),
    'hit_concrete': ([(f'hit_concrete_{i}.mp3', O, 0.6, 0.3, 0) for i in (1, 2)], -12),
    'hit_heavy_building': ([('hit_heavy_building_1.mp3', O, 2.4, 1.6, 0), ('hit_heavy_building_2.mp3', O, 2.0, 1.2, 0)], -12),
    'building_collapse': ([(f'building_collapse_{i}.mp3', O, 4.5, 2.5, 0) for i in (1, 2)], -12),
    'wall_breach': ([(f'wall_breach_{i}.mp3', O, 3.0, 1.6, 0) for i in (1, 2)], -12),
    # The doors hiss and grind for seconds before their thud; each take starts late in the hiss so
    # the thud lands about 0.6 s in, as the door (0.9 s to move) is nearly there.
    'gate_cycle': ([('gate_cycle_1.mp3', 1.9, 1.5, 1.0, 0.05), ('gate_cycle_2.mp3', 2.8, 1.5, 1.0, 0.05)], -12),
    'unit_destroyed_infantry': ([(f'unit_destroyed_infantry_{i}.mp3', O, 1.2, 0.6, 0) for i in (1, 2)], -12),
    # The first take is the pop and sputter; the second, quieter, has its crash 3.5 s in.
    'unit_destroyed_drone': ([('unit_destroyed_drone_1.mp3', O, 1.8, 1.0, 0), ('unit_destroyed_drone_2.mp3', 3.3, 1.6, 0.9, 0.03)], -12),
}
BASE = {
    # The clunk, a beat, then the power-up hum.
    'structure_complete': ([('structure_complete_1.mp3', O, 3.2, 2.6, 0)], -12),
    'unit_ready': ([('unit_ready_1.mp3', O, 2.5, 1.6, 0)], -12),
    'research_complete': ([('research_complete_1.mp3', O, 1.8, 1.0, 0)], -12),
    # The riser, then the impact two seconds in.
    'tier_up': ([('tier_up_1.mp3', 0.0, 4.5, 3.5, 0.02)], -12),
    'building_captured': ([('building_captured_1.mp3', O, 2.0, 1.4, 0)], -12),
    'node_captured': ([('node_captured_1.mp3', 0.0, 4.0, 3.0, 0.02)], -12),
    'node_lost': ([('node_lost_1.mp3', O, 3.0, 2.2, 0)], -12),
    # The landing thud, the hydraulics, and the second thud.
    'base_founded': ([('base_founded_1.mp3', O, 3.5, 2.5, 0)], -12),
}
INTERFACE = {
    # Heard often: kept short and a little under the rest.
    'ui_click': ([('ui_click_1.mp3', O, 0.12, 0.06, 0)], -16),
    'ui_order_move': ([('ui_order_move_1.mp3', O, 0.4, 0.25, 0)], -16),
    # The take beeps on for a second and a half; the order is told in its first few.
    'ui_order_attack': ([('ui_order_attack_1.mp3', O, 0.45, 0.3, 0)], -16),
    'ui_error': ([('ui_error_1.mp3', O, 0.4, 0.15, 0)], -14),
    'ui_notice': ([('ui_notice_1.mp3', O, 1.2, 0.7, 0)], -14),
    # Three of its half-second pulses, and two sweeps of the radar warning.
    'alert_under_attack': ([('alert_under_attack_1.mp3', O, 2.8, 2.4, 0)], -12),
    'alert_missile': ([('alert_missile_1.mp3', O, 2.0, 1.6, 0)], -12),
    'victory': ([('victory_1.mp3', O, 5.0, 3.5, 0)], -12),
    'defeat': ([('defeat_1.mp3', O, 4.0, 3.0, 0)], -12),
}
SPECS = {'weapons': WEAPONS, 'impacts': IMPACTS, 'base': BASE, 'interface': INTERFACE, 'ambience': {},
         'single': {key: ([(os.path.basename(path_in), O, length, fade_from, 0)], -12)} if mode == 'single' else {}, 'loop': {}}[mode]
DESCRIPTIONS = {key: {'description': f'{key}, from {os.path.basename(path_in)}'}} if mode == 'single' else {} if mode in ('ambience', 'loop') else json.load(open(os.path.join(src, {'weapons': 'manifest.json', 'impacts': 'manifest_impacts.json', 'base': 'manifest_base.json', 'interface': 'manifest_interface.json'}[mode])))

manifest, report = {}, []
for kind, (takes, target) in SPECS.items():
    files = []
    for n, (name, start, length, fade_from, fade_in) in enumerate(takes, 1):
        path = os.path.join(src, name)
        t0 = onset(path) if start == O else last_onset(path) if start == 'last' else start
        # The cut, as mono audio first, so what is measured is exactly what gets levelled.
        wav = os.path.join(out, '_cut.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t0), '-t', str(length), '-i', path, '-ac', '1', '-ar', str(SR), wav], check=True)
        s = pcm(wav)
        loud = db(max(frames(s, 50)))
        peak = db(max(abs(x) for x in s))
        gain = min(target - loud, -3 - peak)
        dest = f'{kind}_{n}.mp3'
        fades = f'afade=t=out:st={fade_from}:d={length - fade_from}' + (f',afade=t=in:d={fade_in}' if fade_in else '')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={gain:.2f}dB,{fades}', '-b:a', '112k', os.path.join(out, dest)], check=True)
        os.remove(wav)
        files.append(f'sfx/{dest}')
        report.append(f'{dest:24} from {name:22} at {t0:5.2f}s for {length}s, gain {gain:+5.1f} dB')
    manifest[kind] = {'description': DESCRIPTIONS[kind]['description'], 'files': files}

# Earlier rifle takes, already trimmed: levelled like the rest and kept as more variety.
for n, name in enumerate(sorted(os.listdir(earlier)) if mode == 'weapons' else [], 5):
    dest = f'rifle_{n}.mp3'
    wav = os.path.join(out, '_cut.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(earlier, name), '-ac', '1', '-ar', str(SR), wav], check=True)
    s = pcm(wav)
    gain = min(SPECS['rifle'][1] - db(max(frames(s, 50))), -3 - db(max(abs(x) for x in s)))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={gain:.2f}dB', '-b:a', '112k', os.path.join(out, dest)], check=True)
    os.remove(wav)
    manifest['rifle']['files'].append(f'sfx/{dest}')
    report.append(f'{dest:24} earlier take {name}')

# Loops: sounds held for as long as something lasts (components/sfx.ts setLoops). Each take is cut
# from its onset: `attack` seconds that play once, then `body` seconds that repeat, whose last
# `xfade` seconds are crossfaded (equal power) into the audio just before the body starts, so the
# end runs back into the start without a click. A little of the body's start follows its end in the
# file, in case a decoder shifts the loop points. Takes are levelled on the body's RMS (`target`
# dBFS), peaks still kept under -3.
TAIL = 0.15

def write_wav(path, samples):
    import wave
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(struct.pack('<%dh' % len(samples), *[max(-32768, min(32767, round(v))) for v in samples]))

def make_loop(key, description, sources, attack, body_s, xfade, target):
    files = []
    for n, name in enumerate(sources, 1):
        path = os.path.join(src, name)
        x = pcm(path)
        o = round(onset(path) * SR)
        l0, l1, f, m = o + round(attack * SR), o + round((attack + body_s) * SR), round(xfade * SR), round(TAIL * SR)
        body = list(x[l0:l1])
        for i in range(f):
            a = (i + 0.5) / f
            body[len(body) - f + i] = x[l1 - f + i] * math.cos(a * math.pi / 2) + x[l0 - f + i] * math.sin(a * math.pi / 2)
        y = list(x[o:l0]) + body + body[:m]
        level = db(math.sqrt(sum(v * v for v in body) / len(body)))
        peak = db(max(abs(v) for v in y))
        gain = 10 ** (min(target - level, -3 - peak) / 20)
        y = [v * gain for v in y]
        for i in range(round(0.005 * SR)):
            y[i] *= i / (0.005 * SR)
        wav = os.path.join(out, '_cut.wav')
        write_wav(wav, y)
        dest = f'{key}_{n}.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-b:a', '112k', os.path.join(out, dest)], check=True)
        os.remove(wav)
        files.append(f'sfx/{dest}')
        report.append(f'{dest:24} from {name} at {o / SR:5.2f}s: {attack}s opening, {body_s}s loop, gain {20 * math.log10(gain):+5.1f} dB')
    manifest[key] = {'description': description, 'files': files, 'loop': [attack, attack + body_s]}

if mode == 'weapons':
    # The Sentinel's beam: the opening zap, then the steady hum.
    make_loop('laser_beam', 'Sentinel drone energy beam, looped while it fires', ['laser_1.mp3', 'laser_2.mp3'], 0.9, 2.4, 0.25, -20)
    # (The CIWS guns' roar, ciws_fire, was made from this pack too; it is now a minigun recording
    # with its wind-up, made with the loop mode: see docs/SOUND_PROMPTS.md.)

if mode == 'base':
    # The building-site bed, repeating for as long as a site is at work.
    make_loop('construction', 'Robotic construction site, looped while a building goes up', ['construction_1.mp3'], 0.3, 7.5, 0.5, -20)

if mode == 'loop':
    make_loop(key, f'{key}, from {os.path.basename(path_in)}, looped', [os.path.basename(path_in)], opening, loop_s, xfade, level)

if mode == 'ambience':
    # The city's background, a stereo bed looping under the whole match (components/sfx.ts
    # startAmbience). The recording rises for half a minute, swells hard at 30 s and fades out,
    # so the loop is the steady stretch from FROM to TO: its slow drift in level evened out (each
    # moment brought to the stretch's level, judged over two seconds either side), and its end
    # crossfaded into the audio before its start. A quarter-second lead-in (the audio just before
    # the loop) keeps the loop points inside the file, clear of any decoder padding at its start.
    FROM, TO, XF, BED, LEAD = 5.0, 27.0, 3.0, -26, 0.25
    d = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '2', '-ar', str(SR), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    both = struct.unpack('<%dh' % (len(d) // 2), d)
    L, R = list(both[0::2]), list(both[1::2])
    a, b, f = round(FROM * SR), round(TO * SR), round(XF * SR)
    # Evened out: a gain curve from the level in 0.5 s steps, smoothed over 4 s.
    step = SR // 2
    level = [math.sqrt(sum(L[i + k] ** 2 + R[i + k] ** 2 for k in range(0, step, 8)) / (2 * step / 8)) for i in range(a - f - 4 * step, b + 4 * step, step)]
    smooth = [sum(level[max(0, j - 4):j + 5]) / len(level[max(0, j - 4):j + 5]) for j in range(len(level))]
    target = sum(smooth) / len(smooth)
    def gain_at(i):
        j = (i - (a - f - 4 * step)) / step
        j0 = min(len(smooth) - 2, max(0, int(j)))
        g0, g1 = target / smooth[j0], target / smooth[j0 + 1]
        return g0 + (g1 - g0) * (j - j0)
    for ch in (L, R):
        for i in range(a - f, b):
            ch[i] *= gain_at(i)
    loop = []
    for ch in (L, R):
        body = ch[a:b]
        for i in range(f):
            t = (i + 0.5) / f
            body[len(body) - f + i] = ch[b - f + i] * math.cos(t * math.pi / 2) + ch[a - f + i] * math.sin(t * math.pi / 2)
        loop.append(ch[a - round(LEAD * SR):a] + body + body[:round(0.2 * SR)])
    rms = math.sqrt(sum(v * v for ch in loop for v in ch[round(LEAD * SR):round(LEAD * SR) + b - a]) / (2 * (b - a)))
    peak = max(abs(v) for ch in loop for v in ch)
    g = 10 ** (min(BED - db(rms), -3 - db(peak)) / 20)
    import wave
    wav = os.path.join(out, '_cut.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(struct.pack('<%dh' % (2 * len(loop[0])), *[max(-32768, min(32767, round(v * g))) for pair in zip(*loop) for v in pair]))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-b:a', '128k', os.path.join(out, 'city_ambience_1.mp3')], check=True)
    os.remove(wav)
    manifest['city_ambience'] = {'description': 'Night-time megacity ambience, looped under the match', 'files': ['sfx/city_ambience_1.mp3'], 'loop': [LEAD, LEAD + TO - FROM]}
    report.append(f'city_ambience_1.mp3      from {os.path.basename(src)} {FROM}-{TO}s, evened out, {XF}s crossfade, gain {20 * math.log10(g):+5.1f} dB')

# Into the manifest the game reads, beside the other packs' sounds.
path = os.path.join(out, 'manifest.json')
merged = json.load(open(path)) if os.path.exists(path) else {}
merged.update(manifest)
json.dump(merged, open(path, 'w'), indent=2)
open(os.path.join(out, 'manifest.json'), 'a').write('\n')
print('\n'.join(report))
