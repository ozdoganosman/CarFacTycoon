"""Synthesises the promo soundtrack: a ragtime piano bed plus sound effects cued to src/timeline.json.

Everything is generated from scratch (no samples), so the result is free to use anywhere.
Usage: python3 audio/make_audio.py   (needs numpy) -> public/audio/soundtrack.wav
"""
import json
import os
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TL = json.load(open(os.path.join(ROOT, "src", "timeline.json")))
FPS = TL["fps"]
SC = {k: v[0] for k, v in TL["scenes"].items()}
TOTAL = max(v[1] for v in TL["scenes"].values()) / FPS
SR = 44100
rng = np.random.default_rng(1900)

mix = np.zeros((2, int((TOTAL + 1.0) * SR)))


def sec(frame):
    return frame / FPS


def tarr(dur):
    return np.arange(int(dur * SR)) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def add(start, sig, gain=1.0, pan=0.0):
    """Places a mono (or stereo) signal at `start` seconds with a constant-power pan (-1 left .. 1 right)."""
    i = int(start * SR)
    if i < 0:
        sig = sig[..., -i:]
        i = 0
    if sig.ndim == 1:
        a = (pan + 1) * np.pi / 4
        sig = np.stack([sig * np.cos(a), sig * np.sin(a)]) * np.sqrt(2)
    n = min(sig.shape[1], mix.shape[1] - i)
    if n > 0:
        mix[:, i : i + n] += sig[:, :n] * gain


def band(sig, lo, hi):
    """Brick-wall band-pass through the FFT (fine for noise colouring)."""
    spec = np.fft.rfft(sig)
    f = np.fft.rfftfreq(len(sig), 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(spec, len(sig))


def noise(dur, lo=20, hi=20000):
    return band(rng.standard_normal(int(dur * SR)), lo, hi)


def env(n, attack=0.003, decay=0.2):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def mx(*sigs):
    """Sums mono signals of different lengths."""
    out = np.zeros(max(len(x) for x in sigs))
    for x in sigs:
        out[: len(x)] += x
    return out


def fade(sig, fin=0.01, fout=0.05):
    n = len(sig)
    a, b = int(fin * SR), int(fout * SR)
    if a:
        sig[:a] *= np.linspace(0, 1, a)
    if b:
        sig[n - b :] *= np.linspace(1, 0, b)
    return sig


# ------------------------------------------------------------------ instruments


def piano(note, dur, vel=1.0, detune=0.0):
    f0 = midi(note) * 2 ** (detune / 1200)
    t = tarr(dur)
    s = np.zeros_like(t)
    for k in range(1, 10):
        f = f0 * k * (1 + 0.0004 * k * k)
        if f > SR / 2.2:
            break
        decay = 1 / ((1.2 + 0.8 * k) * (f0 / 260) ** 0.35)
        s += (1 / k**1.15) * np.exp(-t / decay) * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
    s *= np.minimum(1, t / 0.003) * vel * 0.3
    return fade(s, 0, 0.03)


def honky(note, dur, vel=1.0):
    """Saloon piano: two slightly detuned strings."""
    return 0.6 * (piano(note, dur, vel, 7) + piano(note, dur, vel, -7))


def bell(freq, dur=0.8, vel=1.0):
    t = tarr(dur)
    s = sum(a * np.exp(-t / d) * np.sin(2 * np.pi * freq * r * t) for r, a, d in [(1, 1, dur * 0.5), (2.76, 0.5, dur * 0.25), (5.4, 0.25, dur * 0.12)])
    return s * np.minimum(1, t / 0.002) * vel * 0.4


def thump(freq=60, dur=0.25, vel=1.0, drop=0.5):
    t = tarr(dur)
    ph = 2 * np.pi * np.cumsum(freq * (1 + drop * np.exp(-t / 0.03))) / SR
    return np.sin(ph) * env(len(t), 0.002, dur / 3) * vel


def snare(vel=1.0):
    return noise(0.18, 900, 6000) * env(int(0.18 * SR), 0.001, 0.05) * vel * 0.5


def hat(vel=1.0):
    return noise(0.05, 6000, 16000) * env(int(0.05 * SR), 0.001, 0.012) * vel * 0.35


def whoosh(dur=0.45, lo=500, hi=5000, vel=1.0):
    n = int(dur * SR)
    x = np.linspace(0, 1, n)
    return noise(dur, lo, hi) * np.sin(np.pi * x) ** 2 * vel * 0.6


def stamp_hit(vel=1.0):
    body = thump(95, 0.25, 1.0, 0.8)
    slap = np.zeros_like(body)
    s = noise(0.07, 250, 3000) * env(int(0.07 * SR), 0.001, 0.02)
    slap[: len(s)] = s * 1.6
    return (body + slap) * vel


def boom(vel=1.0):
    dur = 1.6
    t = tarr(dur)
    ph = 2 * np.pi * np.cumsum(38 + 60 * np.exp(-t / 0.15)) / SR
    low = np.sin(ph) * env(len(t), 0.004, 0.5)
    rumble = noise(dur, 20, 180) * env(len(t), 0.01, 0.45) * 1.5
    crack = np.zeros_like(t)
    c = noise(0.09, 400, 4000) * env(int(0.09 * SR), 0.001, 0.025)
    crack[: len(c)] = c * 1.4
    return (low + rumble + crack) * vel


def flash_pop(vel=1.0):
    t = tarr(0.12)
    chirp = np.sin(2 * np.pi * np.cumsum(2500 + 3000 * t / 0.12) / SR) * np.exp(-t / 0.03) * 0.3
    return (noise(0.12, 2000, 12000) * env(len(t), 0.001, 0.035) + chirp) * vel


def clap_crowd(dur=2.0, density=260, vel=1.0):
    out = np.zeros(int(dur * SR))
    clap = noise(0.02, 800, 5000) * env(int(0.02 * SR), 0.001, 0.006)
    for _ in range(int(density * dur)):
        i = rng.integers(0, len(out) - len(clap))
        out[i : i + len(clap)] += clap * rng.uniform(0.3, 1.0)
    x = np.linspace(0, 1, len(out))
    return out * np.minimum(1, x * 6) * np.minimum(1, (1 - x) * 3) * vel * 0.5


def clank(freq=420, vel=1.0):
    t = tarr(0.35)
    s = sum(a * np.exp(-t / d) * np.sin(2 * np.pi * freq * r * t) for r, a, d in [(1, 1, 0.12), (2.71, 0.6, 0.08), (5.13, 0.4, 0.05), (8.2, 0.25, 0.03)])
    return (s * 0.35 + noise(0.35, 1500, 8000) * env(len(t), 0.001, 0.01) * 0.4) * vel


# ------------------------------------------------------------------ music

# chord: (bass root, chord tones for the left-hand "stride", melody tones)
CH = {
    "C": (36, [60, 64, 67], [72, 76, 79, 84]),
    "A7": (33, [61, 64, 67], [73, 76, 79, 81]),
    "D7": (38, [60, 62, 66], [74, 78, 81, 84]),
    "G7": (31, [59, 62, 65], [71, 74, 77, 79]),
    "F": (29, [60, 65, 69], [72, 77, 81, 84]),
}
RHYTHMS = [[1, 0, 1, 1, 0, 1, 0, 1], [0, 1, 1, 0, 1, 1, 1, 0], [1, 1, 0, 1, 0, 1, 1, 0], [1, 0, 0, 1, 1, 0, 1, 1]]


def rag(start, bars, bar_len, chords, melody=True, drums=True, vel=1.0):
    beat = bar_len / 4
    last = 76
    for b in range(bars):
        name = chords[b % len(chords)]
        root, chord, mel = CH[name]
        t0 = start + b * bar_len
        # left hand: bass on 1 and 3, chord on 2 and 4
        add(t0, honky(root, beat * 1.6, 0.9 * vel) + honky(root + 12, beat * 1.6, 0.5 * vel), 1.0, -0.35)
        add(t0 + 2 * beat, honky(root + 7, beat * 1.6, 0.8 * vel) + honky(root + 19, beat * 1.6, 0.45 * vel), 1.0, -0.35)
        for k in (1, 3):
            add(t0 + k * beat, sum(honky(n, beat * 0.9, 0.55 * vel) for n in chord), 1.0, 0.25)
        if drums:
            for k in range(4):
                add(t0 + k * beat, thump(55, 0.2, 0.5 * vel), 1.0)
                if k in (1, 3):
                    add(t0 + k * beat, snare(0.8 * vel), 1.0, 0.15)
            for k in range(8):
                add(t0 + k * beat / 2, hat(0.6 * vel if k % 2 else 0.35 * vel), 1.0, 0.3)
        if melody:
            rh = RHYTHMS[(b * 7 + len(name)) % len(RHYTHMS)]
            for k, on in enumerate(rh):
                if not on:
                    continue
                # walk to a nearby chord tone, now and then a chromatic lower neighbour
                cand = sorted(mel, key=lambda n: abs(n - last) + rng.uniform(0, 4))
                note = cand[0] if cand[0] != last else cand[1]
                if rng.uniform() < 0.18:
                    add(t0 + k * beat / 2 - beat / 8, honky(note - 1, beat / 4, 0.5 * vel), 1.0, 0.05)
                add(t0 + k * beat / 2, mx(honky(note, beat * 0.7, 0.75 * vel), honky(note + 12, beat * 0.5, 0.18 * vel)), 1.0, 0.05)
                last = note


A0, A1 = sec(SC["cars"]), sec(SC["crisis"])
B0, B1 = sec(SC["research"]), sec(SC["end"])
# The same tempo whatever the length of the first part (about 1.9 s a bar).
bars_a = max(1, round((A1 - A0) / 1.914))
bar_a = (A1 - A0) / bars_a
rag(A0, bars_a, bar_a, ["C", "C", "A7", "A7", "D7", "G7", "C", "G7"])
bar_b = (B1 - B0) / 3
rag(B0, 3, bar_b, ["F", "D7", "G7"])

# The engine-sound scene: the piano steps back for the game's own engine voice.
V0, V1 = sec(SC["sound"]), sec(SC["susp"])
duck = np.ones(mix.shape[1])
i0, i1, ramp = int(V0 * SR), int(V1 * SR), int(0.3 * SR)
duck[i0:i1] = 0.1
duck[i0 - ramp : i0] = np.linspace(1, 0.1, ramp)
duck[i1 : i1 + ramp] = np.linspace(0.1, 1, ramp)
mix *= duck

# final "ta-da": big C chord rolled up the keyboard, then a sparkle when the play button pops
END = sec(SC["end"])
for i, n in enumerate([24, 36, 43, 52, 55, 60, 64, 67, 72, 76, 79, 84]):
    add(END + i * 0.018, honky(n, 4.6, 0.9), 0.9, -0.4 + i * 0.07)
add(END, thump(50, 0.6, 1.2), 1.0)
for i, n in enumerate([84, 88, 91, 96]):
    add(END + sec(40) + i * 0.06, bell(midi(n), 1.2, 0.8), 0.6, 0.2)

# ------------------------------------------------------------------ effects

# hook: projector clatter, typewriter, bell, and a low piano hit on the question
H = sec(SC["hook"])
proj = np.zeros(int(sec(SC["cars"]) * SR))
click = noise(0.006, 2000, 9000) * env(int(0.006 * SR), 0.0005, 0.002)
for k in range(int(len(proj) / SR * 18)):
    i = int(k / 18 * SR)
    proj[i : i + len(click)] += click * (0.8 if k % 2 else 0.4)
proj += noise(len(proj) / SR, 40, 300) * 0.05
add(H, fade(proj, 0.2, 0.6), 0.35)
typed = len("Bir atölye. 2 mühendis. 40 bin dolar.")
for i in range(typed):
    fr = 8 + i * 28 / typed
    key = noise(0.03, 1500, 7000) * env(int(0.03 * SR), 0.001, 0.008) + thump(180, 0.03, 0.3, 0.2)
    add(sec(fr), key, 0.9, rng.uniform(-0.3, 0.3))
add(sec(37), bell(2100, 0.9), 0.8, 0.4)
for n in (24, 36, 48):
    add(sec(40), honky(n, 2.2, 1.0), 0.8, -0.2)
add(sec(40), thump(45, 0.7, 1.0), 0.9)

# cuts
for fr in ("cars", "engine", "susp", "launch", "map", "factory", "rivals", "research", "score"):
    add(sec(SC[fr]) - 0.2, whoosh(0.45), 0.55, rng.uniform(-0.5, 0.5))

# cars sliding in
per = (TL["scenes"]["cars"][1] - SC["cars"] - 18) / 8
for i in range(1, 8):
    add(sec(SC["cars"] + i * per) - 0.05, whoosh(0.3, 900, 7000), 0.35, 0.6 - i * 0.15)

# engine: a four-cylinder chugging along
E0, E1 = sec(SC["engine"]), sec(SC["sound"])
dur = E1 - E0
eng = np.zeros(int(dur * SR))
pulse = thump(70, 0.09, 1.0, 0.6) + noise(0.09, 60, 900) * env(int(0.09 * SR), 0.002, 0.025) * 0.8
fire = 11.0
for k in range(int(dur * fire)):
    i = int(k / fire * SR)
    eng[i : i + len(pulse)] += pulse[: len(eng) - i] * (1.0 if k % 4 == 0 else 0.7)
add(E0, fade(eng, 0.15, 0.3), 0.5)

# the engine heard: rendered from the game's engine voice by capture/shots.mjs (section "sound")
with wave.open(os.path.join(ROOT, "public", "audio", "engine.wav")) as w:
    raw = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").reshape(-1, w.getnchannels()).T / 32767.0
roar = raw[:, : int((V1 - V0) * SR)].copy()
fin, fout = int(0.02 * SR), int(0.25 * SR)
roar[:, :fin] *= np.linspace(0, 1, fin)
roar[:, -fout:] *= np.linspace(1, 0, fout)
add(V0, roar, 0.72)

# suspension: bumps in the road
S0 = sec(SC["susp"])
for k in range(9):
    add(S0 + 0.2 + k * 0.38 + rng.uniform(0, 0.12), mx(thump(85, 0.2, 0.7), noise(0.05, 300, 2000) * 0.2), 0.55, rng.uniform(-0.3, 0.3))

# launch: curtain, camera flashes, applause, magazine verdicts, fanfare
L0 = SC["launch"]
add(sec(L0 + 4), whoosh(1.1, 250, 2500, 1.2), 0.6)
for fr in (20, 34, 48):
    add(sec(L0 + fr), flash_pop(), 0.45, rng.uniform(-0.6, 0.6))
add(sec(L0 + 28), clap_crowd(2.2), 0.8)
for fr in (84, 106, 128):
    add(sec(L0 + fr), stamp_hit(), 0.9)
for i, n in enumerate([60, 64, 67, 72]):
    add(sec(L0 + 136) + i * 0.09, mx(honky(n, 1.4, 0.9), honky(n + 12, 1.0, 0.5)), 0.8, 0.1)
add(sec(L0 + 146), clap_crowd(1.8, 380), 0.9)

# map: a stamp for each year the network grows
M0, M1 = SC["map"], TL["scenes"]["map"][1]
steps = len(json.load(open(os.path.join(ROOT, "src", "map.json"))))
per_m = (M1 - M0 - 12) / steps
for i in range(steps):
    add(sec(M0 + i * per_m + 2), stamp_hit(0.8), 0.7, -0.3 + 0.6 * i / max(1, steps - 1))
    add(sec(M0 + i * per_m + 4), bell(midi(72 + 3 * i), 0.6), 0.35, 0.2)

# rivals: a boom as the rival strikes, the cash register as the board counts the dividend
R0r, R1r = SC["rivals"], TL["scenes"]["rivals"][1]
split = round((R1r - R0r) * 0.52)
add(sec(R0r), boom(0.9), 0.9, -0.2)
tk2 = tarr(0.9)
coins2 = noise(0.9, 3000, 12000) * np.exp(-tk2 / 0.25) * 0.3 * (1 + np.sin(2 * np.pi * 30 * tk2))
add(sec(R0r + split), mx(bell(1760, 1.0), coins2), 0.7, 0.2)

# newspaper: spin and slap
P0 = SC["paper"]
add(sec(P0), whoosh(0.75, 300, 6000, 1.2), 0.7)
add(sec(P0 + 22), stamp_hit(1.2), 1.0)

# factory: presses and conveyor
F0, F1 = sec(SC["factory"]), sec(SC["crisis"])
hum = noise(F1 - F0, 60, 240) * 0.25
add(F0, fade(hum, 0.2, 0.3), 0.6)
k = 0
t = F0 + 0.1
while t < F1 - 0.2:
    add(t, clank(380 if k % 2 else 520), 0.55, 0.4 if k % 2 else -0.4)
    t += 0.47
    k += 1

# crises: low drone and a boom for each headline
C0, C1 = sec(SC["crisis"]), sec(SC["research"])
tt = tarr(C1 - C0)
drone = (np.sin(2 * np.pi * 55 * tt) + 0.5 * np.sin(2 * np.pi * 82.4 * tt) + 0.3 * np.sin(2 * np.pi * 110.5 * tt)) * (0.7 + 0.3 * np.sin(2 * np.pi * 5 * tt))
add(C0, fade(drone * 0.25, 0.3, 0.2), 0.8)
for i in range(4):
    add(sec(SC["crisis"] + 12 + i * 27), boom(), 1.0, [-0.3, 0.3, -0.2, 0.2][i])
roll = np.zeros(int(0.9 * SR))
for j in range(40):
    s = snare(0.3 + j / 40)
    i = int(j * 0.9 / 40 * SR)
    roll[i : i + len(s)] += s[: len(roll) - i]
add(C1 - 0.9, roll, 0.5)

# research: the idea bell; racing: a car flashing past
add(sec(SC["research"] + 3), bell(1760, 1.0), 0.7, -0.2)
R0 = sec(SC["racing"]) - 0.15
tt = tarr(1.2)
f = 260 * (1.25 - 0.5 * np.tanh((tt - 0.5) * 5))
ph = 2 * np.pi * np.cumsum(f) / SR
car = sum(np.sin(k * ph) / k for k in range(1, 8)) * (1 / (1 + ((tt - 0.5) * 5) ** 2))
car = np.stack([car * np.clip(1 - tt / 1.2, 0, 1), car * np.clip(tt / 1.2, 0, 1)]) * 0.5
add(R0, car + noise(1.2, 200, 3000) * (1 / (1 + ((tt - 0.5) * 5) ** 2)) * 0.2, 0.8)

# score: a note for each rank climbed, the cash register, then the question
Q0 = SC["score"]
for fr, n in zip((16, 35.2, 40.8, 60), (72, 76, 79, 84)):
    add(sec(Q0 + fr), bell(midi(n), 0.9), 0.7, 0.1)
tk = tarr(0.9)
coins = noise(0.9, 3000, 12000) * np.exp(-tk / 0.25) * 0.3 * (1 + np.sin(2 * np.pi * 30 * tk))
add(sec(Q0 + 62), mx(bell(1760, 1.2), bell(2637, 1.0), coins), 0.8, 0.2)
for i, n in enumerate([69, 72, 75, 78]):
    add(sec(Q0 + 66) + i * 0.05, honky(n, 1.6, 0.6), 0.6, 0.3)

# end: curtains
add(END, whoosh(1.0, 250, 2500, 1.2), 0.6)

# ------------------------------------------------------------------ master

out = mix[:, : int(TOTAL * SR)]
out = np.tanh(out * 1.3) / np.tanh(1.3)
out *= 0.89 / np.max(np.abs(out))
n = out.shape[1]
tail = int(0.4 * SR)
out[:, n - tail :] *= np.linspace(1, 0, tail)
os.makedirs(os.path.join(ROOT, "public", "audio"), exist_ok=True)
path = os.path.join(ROOT, "public", "audio", "soundtrack.wav")
with wave.open(path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out.T * 32767).astype("<i2").tobytes())
print(f"{path}: {TOTAL:.1f} s")
