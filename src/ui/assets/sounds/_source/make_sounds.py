"""Detective Suru 音效合成。全部用數學產生，不取用任何外部音源。
用法：python3 make_sounds.py <輸出資料夾>
"""
import sys, os, wave
import numpy as np

SR = 44100
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def t(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, attack=0.005, release=0.05, decay=None):
    """attack/release in seconds; decay = exponential time constant."""
    e = np.ones(n)
    a = max(1, int(SR * attack))
    r = max(1, int(SR * release))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    if decay:
        e *= np.exp(-np.arange(n) / SR / decay)
    return e


def tone(freq, dur, partials=((1, 1.0),), attack=0.005, release=0.05, decay=None):
    x = t(dur)
    s = sum(a * np.sin(2 * np.pi * freq * m * x) for m, a in partials)
    return s * env(len(x), attack, release, decay)


def bell(freq, dur, decay=0.5):
    # 輕微不和諧泛音，像小玻璃鐘
    x = t(dur)
    parts = [(1, 1.0, decay), (2.01, 0.35, decay * 0.6), (2.76, 0.18, decay * 0.4), (5.4, 0.06, decay * 0.2)]
    s = sum(a * np.sin(2 * np.pi * freq * m * x) * np.exp(-x / d) for m, a, d in parts)
    return s * env(len(x), 0.002, 0.03)


def place(total, *items):
    """items: (start_sec, signal)"""
    out = np.zeros(int(SR * total))
    for start, sig in items:
        i = int(SR * start)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += sig[:n]
    return out


def lowpass(x, cutoff):
    # 簡單一階低通
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def norm(x, peak_db):
    return x / np.max(np.abs(x)) * 10 ** (peak_db / 20)


def save(name, x):
    pcm = np.clip(x, -1, 1)
    pcm = (pcm * 32767).astype(np.int16)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


soft = ((1, 1.0), (2, 0.15), (3, 0.05))

# 1 出現在意的地方：輕輕上揚兩音「嗯？」
save('clue_spotted', norm(place(0.55,
    (0.0, tone(659.3, 0.16, soft, 0.01, 0.08, decay=0.2)),
    (0.12, tone(880.0, 0.4, soft, 0.01, 0.2, decay=0.18)),
), -10))

# 2 翻成疑點：短前導 + 清亮小鐘
save('clue_found', norm(place(1.6,
    (0.0, bell(783.99, 0.3, decay=0.12) * 0.5),
    (0.09, bell(1046.5, 1.5, decay=0.45)),
    (0.09, bell(1568.0, 1.2, decay=0.25) * 0.25),
), -6))

# 3 答錯：短悶響
x = t(0.22)
f = 150 * np.exp(-x * 6)
thud = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(x), 0.003, 0.05, decay=0.07)
noise = lowpass(np.random.default_rng(1).standard_normal(len(x)), 900) * env(len(x), 0.001, 0.02, decay=0.02)
save('clue_wrong', norm(thud + noise * 0.4, -9))

# 4 來電：原創的柔和顫音鈴，一段 2.4 秒可循環
def trill(dur):
    x = t(dur)
    gate = (np.sin(2 * np.pi * 16 * x) > 0).astype(float)
    gate = lowpass(gate, 200)
    s = (np.sin(2 * np.pi * 740 * x) * 0.6 + np.sin(2 * np.pi * 932.3 * x) * 0.4
         + 0.12 * np.sin(2 * np.pi * 1480 * x))
    return s * gate * env(len(x), 0.02, 0.05)

save('call_ring', norm(place(2.4, (0.0, trill(0.45)), (0.65, trill(0.45))), -9))

# 5 定位／登入確認：不和諧兩下低沉脈衝
def pulse(start):
    a = tone(349.2, 0.32, soft, 0.01, 0.12, decay=0.25)
    b = tone(493.9, 0.32, soft, 0.01, 0.12, decay=0.25) * 0.8
    c = tone(352.0, 0.32, soft, 0.01, 0.12, decay=0.25) * 0.4  # 微走音
    return (start, a + b + c)

save('login_alert', norm(place(1.0, pulse(0.0), pulse(0.38)), -8))

# 6 破案：沉穩和弦（先輕輕琶音再合）
notes = [261.63, 329.63, 392.0, 493.88]
items = [(i * 0.09, tone(fq, 3.0 - i * 0.09, soft, 0.04, 0.8, decay=1.4) * (1 - i * 0.12))
         for i, fq in enumerate(notes)]
items.append((0.36, bell(1046.5, 2.0, decay=0.8) * 0.15))
save('solved', norm(place(3.2, *items), -7))

# 7 站不住／指錯人：低沉小二度悶音
low = tone(146.83, 1.4, ((1, 1.0), (2, 0.3)), 0.02, 0.4, decay=0.5) \
    + tone(155.56, 1.4, ((1, 1.0), (2, 0.3)), 0.02, 0.4, decay=0.5) * 0.6
save('case_failed', norm(lowpass(low, 1200), -8))

# 8 沒電：一條持續往下滑的音高，上面打三下脈衝，像電量一路往下掉。
# 音高從 G4 滑到 C4 附近，節奏和音色都是自己的設計（奇數泛音、柔和起音）
x = t(1.0)
f = 392.0 * (261.63 / 392.0) ** np.clip(x / 0.75, 0, 1)
ph = 2 * np.pi * np.cumsum(f) / SR
body = np.sin(ph) + 0.22 * np.sin(3 * ph) + 0.06 * np.sin(5 * ph)
amp = np.zeros_like(x)
for start, length, level in ((0.0, 0.16, 1.0), (0.21, 0.16, 0.9), (0.44, 0.5, 0.8)):
    seg = (x >= start) & (x < start + length)
    k = x[seg] - start
    amp[seg] = np.maximum(amp[seg], level * np.minimum(k / 0.008, 1) * np.exp(-k / (0.07 if length < 0.3 else 0.18)))
save('power_off', norm(lowpass(body * lowpass(amp, 300), 2200), -9))

# 10 開場 Suru 醒來：慢慢浮上來的和弦（Am9），帶一點懸疑，跟破案的和弦區分
# 改版：小調大七（A C E G#）加九度，更神秘；低音持續音、慢慢浮起、遠處微走音的鐘聲
def detuned(fq, dur, attack, release, decay):
    return (tone(fq, dur, soft, attack, release, decay) * 0.6
            + tone(fq * 1.004, dur, soft, attack, release, decay) * 0.4)

wake_notes = [220.0, 261.63, 329.63, 415.30, 493.88]
# 第三版：縮短到約 2.5 秒
items = [(0.0, tone(110.0, 2.5, ((1, 1.0), (2, 0.2)), 0.6, 0.9, decay=2.0) * 0.5)]
items += [(0.1 + i * 0.14, detuned(fq, 2.4 - i * 0.14, 0.45, 0.9, 1.4) * (1 - i * 0.12))
          for i, fq in enumerate(wake_notes)]
items.append((0.8, bell(1661.2, 1.7, decay=0.6) * 0.07))
items.append((0.82, bell(1668.0, 1.7, decay=0.6) * 0.05))
items.append((1.15, bell(1244.5, 1.35, decay=0.5) * 0.05))
save('wake', norm(lowpass(place(2.5, *items), 2500), -9))

print('ok')
