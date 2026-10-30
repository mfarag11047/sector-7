# Cuts a raw sound pack down for the game: trims each clip to its first transient (the railgun to
# its shot, after the charge-up), cuts it to length with a fade, mixes it to mono, levels the takes
# of each sound to match, and writes public/sfx/manifest.json. Needs ffmpeg.
# Usage: python3 tools/process_sfx.py <unzipped pack sfx dir> <earlier rifle takes dir> public/sfx
import json, math, os, struct, subprocess, sys

src, earlier, out = sys.argv[1:4]
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

# kind: [(file, start, length, fade_from, fade_in)], target loudest-50ms RMS in dBFS
O = 'onset'
SPECS = {
    'rifle': ([(f'rifle_{i}.mp3', O, 0.45, 0.22, 0) for i in range(1, 5)], -12),
    'mg': ([(f'mg_{i}.mp3', O, 0.32, 0.15, 0) for i in range(1, 5)], -12),
    'flak': ([(f'flak_{i}.mp3', O, 0.6, 0.3, 0) for i in range(1, 5)], -12),
    'ciws': ([('ciws_1.mp3', 0.0, 0.36, 0.24, 0.01), ('ciws_2.mp3', 0.5, 0.36, 0.24, 0.01), ('ciws_3.mp3', 0.1, 0.36, 0.24, 0.01), ('ciws_4.mp3', 0.5, 0.36, 0.24, 0.01)], -14),
    'cannon': ([('cannon_1.mp3', O, 1.2, 0.6, 0), ('cannon_2.mp3', O, 1.2, 0.6, 0), ('cannon_3.mp3', O, 0.62, 0.4, 0), ('cannon_4.mp3', O, 1.2, 0.6, 0)], -12),
    'rail': ([(f'rail_{i}.mp3', 'last', 0.9, 0.5, 0) for i in range(1, 4)], -12),
    'missile': ([(f'missile_{i}.mp3', O, 1.6, 1.0, 0) for i in range(1, 4)], -12),
    'rocket': ([('rocket_1.mp3', O, 2.0, 1.4, 0), ('rocket_2.mp3', O, 2.4, 1.6, 0), ('rocket_3.mp3', O, 2.0, 1.4, 0)], -12),
    'laser': ([(f'laser_{i}.mp3', O, 0.45, 0.25, 0) for i in range(1, 3)], -14),
    'blade': ([(f'blade_{i}.mp3', O, 0.5, 0.3, 0) for i in range(1, 3)], -12),
    'explosion_small': ([(f'explosion_small_{i}.mp3', O, 1.4, 0.7, 0) for i in range(1, 3)], -12),
    'explosion': ([(f'explosion_{i}.mp3', O, 2.4, 1.2, 0) for i in range(1, 3)], -12),
    'explosion_large': ([(f'explosion_large_{i}.mp3', O, 4.0, 2.0, 0) for i in range(1, 3)], -12),
    'emp': ([(f'emp_{i}.mp3', O, 1.6, 0.8, 0) for i in range(1, 3)], -12),
    'shield': ([(f'shield_{i}.mp3', O, 0.5, 0.25, 0) for i in range(1, 3)], -14),
}
DESCRIPTIONS = json.load(open(os.path.join(src, 'manifest.json')))

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
for n, name in enumerate(sorted(os.listdir(earlier)), 5):
    dest = f'rifle_{n}.mp3'
    wav = os.path.join(out, '_cut.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(earlier, name), '-ac', '1', '-ar', str(SR), wav], check=True)
    s = pcm(wav)
    gain = min(SPECS['rifle'][1] - db(max(frames(s, 50))), -3 - db(max(abs(x) for x in s)))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-af', f'volume={gain:.2f}dB', '-b:a', '112k', os.path.join(out, dest)], check=True)
    os.remove(wav)
    manifest['rifle']['files'].append(f'sfx/{dest}')
    report.append(f'{dest:24} earlier take {name}')

json.dump(manifest, open(os.path.join(out, 'manifest.json'), 'w'), indent=2)
open(os.path.join(out, 'manifest.json'), 'a').write('\n')
print('\n'.join(report))
