# -*- coding: utf-8 -*-
"""节拍 BPM 估计 + DP 节拍跟踪 + 小节网格，用于段落分析。"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.ndimage import median_filter, uniform_filter
from scipy.signal import find_peaks

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import plot_stack

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
D = np.load(OUT / "fine.npz")
FR = 22050 / 256.0
flux = np.asarray(D["flux"], dtype=np.float64)
rms = np.asarray(D["rms"], dtype=np.float64)
e_low = np.asarray(D["e_low"], dtype=np.float64)

# --- onset envelope ---
oe = flux - median_filter(flux, size=int(0.2 * FR) | 1, mode="nearest")
oe = np.maximum(oe, 0)
oe = uniform_filter(oe, size=int(0.02 * FR) | 1)
oe = oe / (np.percentile(oe, 99) + 1e-9)
print("onset env frames", len(oe), "duration", len(oe) / FR)


def acf_score(env, bpm_min=40, bpm_max=220, prior_center=100.0, prior_oct=0.55):
    fps = FR
    lags = np.arange(int(60 / bpm_max * fps), int(60 / bpm_min * fps) + 1)
    acf = np.array([np.dot(env[:-l], env[l:]) / (len(env) - l) for l in lags])
    bpm = 60.0 * fps / lags
    prior = np.exp(-0.5 * (np.log2(bpm / prior_center) / prior_oct) ** 2)
    return lags, acf, bpm, prior


# 全局 ACF（可能被摇摆），先做全局粗估
lags, acf, bpm, prior = acf_score(oe)
score = acf * prior
k = int(np.argmax(score))
print(f"global best: bpm={bpm[k]:.2f} lag={lags[k]:.2f}f acf={acf[k]:.4f}")
# 打印前若干峰
pk, _ = find_peaks(acf, distance=3)
order = pk[np.argsort(acf[pk])[::-1][:12]]
print("top ACF lag peaks:")
for i in sorted(order):
    print(f"   bpm={bpm[i]:7.2f}  lag={lags[i]:6.2f}f ({lags[i]/FR*1000:7.1f}ms)  acf={acf[i]:.4f} prior={prior[i]:.3f}")

# --- 局部 tempogram：每 8s 窗口做 ACF，取最强 tempo，观察稳定性 ---
fps = FR
qs = []
win = int(8 * fps)
step = int(2 * fps)
for s in range(0, len(oe) - win, step):
    seg = oe[s:s + win]
    l2, a2, b2, p2 = acf_score(seg, 40, 220, prior_center=100.0, prior_oct=0.8)
    sc = a2 * p2
    kk = int(np.argmax(sc))
    qs.append(((s + win / 2) / fps, b2[kk], a2[kk]))
qs = np.array(qs)
print("\nlocal tempo every 2s (first 20):")
for row in qs[:20]:
    print(f"  t={row[0]:6.1f}  bpm={row[1]:6.2f} acf={row[2]:.3f}")
print("local tempo median:", np.median(qs[:, 1]), "IQR:", np.percentile(qs[:, 1], [25, 75]))

# --- 用全局 tempo 做 DP 节拍跟踪 ---
def track_beats(env, period, tightness=100.0):
    T = len(env)
    period = float(period)
    lo = max(1, int(round(period * 0.85)))
    hi = int(round(period * 1.15))
    score = np.zeros(T)
    back = np.zeros(T, dtype=int)
    for t in range(T):
        if t < lo:
            score[t] = env[t]
            back[t] = -1
            continue
        best = -1e18
        besti = t - lo
        for lag in range(lo, min(hi, t) + 1):
            s = score[t - lag] - tightness * (np.log(lag / period) ** 2)
            if s > best:
                best = s
                besti = t - lag
        score[t] = env[t] + best
        back[t] = besti
    # 回溯：从最后一个"局部高"点开始
    cand = np.arange(len(env) - 1, max(0, len(env) - int(period * 2)), -1)
    i = int(cand[np.argmax(score[cand])])
    beats = [i]
    while back[i] >= 0:
        i = back[i]
        beats.append(i)
    return np.array(sorted(beats), dtype=float)


period = lags[k]
beats = track_beats(oe, period)
bt = beats / fps
print(f"\nbeat count={len(bt)}, first={bt[:5]}, last={bt[-5:]}")
if len(bt) > 2:
    ibi = np.diff(bt)
    print(f"IBI mean={ibi.mean():.4f}s std={ibi.std():.4f}s -> bpm={60/ibi.mean():.2f}")

# --- 小节网格：4 拍一小节，选相位让底鼓位置能量最大 ---
bar_candidates = []
if len(bt) >= 8:
    for ph in range(4):
        pos = bt[ph::4]
        idx = np.clip((pos * fps).astype(int), 0, len(e_low) - 1)
        sc = np.log(e_low[idx] + 1e-12).mean()
        bar_candidates.append((sc, ph))
    sc, ph = max(bar_candidates)
    bar_t = bt[ph::4]
    print(f"\nbar phase={ph}, first bar at {bar_t[:3]}, bar interval mean={np.diff(bar_t).mean():.3f}s")
else:
    bar_t = np.array([])

out = {
    "bpm_global": float(bpm[k]),
    "beat_period_s": float(period / fps),
    "beats": bt.tolist(),
    "bars": bar_t.tolist(),
    "local_tempo": qs.tolist(),
}
(OUT / "tempo.json").write_text(json.dumps(out), encoding="utf-8")

# --- 作图：onset env + 节拍线 + RMS/低频 ---
t = np.arange(len(oe)) / fps
n = len(t)
dec = 4
series = [
    (t[::dec], oe[::dec], "onset envelope", (20, 120, 60)),
    (t[::dec], np.log10(e_low[::dec] + 1e-12), "log low-band", (30, 100, 200)),
    (t[::dec], rms[::dec] / (np.percentile(rms, 99) + 1e-9), "rms", (60, 60, 60)),
]
plot_stack(OUT / "tempo.png", series, title=f"onset env + low band, bpm={bpm[k]:.2f}, bars={len(bar_t)}",
           xmax=260.5, vlines=[10, 34, 64, 94, 124, 154, 186, 224])
print("wrote tempo.png")
