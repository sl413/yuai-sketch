# -*- coding: utf-8 -*-
"""段落检测与 BPM：SSM 自相似 + Foote novelty + 频带能量变化 + onset 自相关。

输出 data/_sections_debug.json 与调试图。
"""
import json
from pathlib import Path

import numpy as np

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
OUT = ROOT / "tools" / "audio" / "out"
D = np.load(OUT / "features.npz")
T = D["t"]
SSM = D["ssm"]
LM = D["logmel"]
CH = D["chroma"]
RMS = D["rms"]
EV = D["ev"]
step = float(D["step"])
FR = float(D["frame_rate"])
hop_sec = step / FR


def smooth_curve(x, win):
    """按秒数平滑 1D 曲线（frames 采样）。"""
    n = max(1, int(round(win / hop_sec)))
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def checkerboard(L):
    K = np.ones((2 * L, 2 * L), dtype=np.float64)
    K[:L, :L] = -1
    K[L:, L:] = -1
    return K


def foote_novelty(ssm, L):
    """Foote 棋盘核 novelty；返回与 ssm 对齐的曲线。"""
    K = checkerboard(L)
    Tn = len(ssm)
    nov = np.zeros(Tn)
    for n in range(Tn):
        a0, a1 = n - L, n + L
        if a0 < 0 or a1 > Tn:
            continue
        nov[n] = float((ssm[a0:a1, a0:a1] * K).sum())
    nov = np.maximum(nov, 0)
    return nov


def zs(x):
    s = x.std() + 1e-12
    return (x - x.mean()) / s


# --- 1) 多尺度 Foote novelty ---
novs = {}
for L in (8, 12, 16, 20):     # 4s,6s,8s,10s 半宽
    novs[L] = zs(foote_novelty(SSM, L))
nov = np.mean([novs[L] for L in novs], axis=0)
nov_s = smooth_curve(nov, 2.0)

# --- 2) 音色变化：相邻 4s 窗口平均特征的余弦距离 ---
def win_mean(F, i, w=8):
    a, b = max(0, i - w), min(len(F), i + w)
    return F[a:b].mean(axis=0)


def timbre_novelty(F, w=8):
    out = np.zeros(len(F))
    for i in range(w, len(F) - w):
        a = F[i - w:i].mean(axis=0)
        b = F[i:i + w].mean(axis=0)
        cos = a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
        out[i] = 1 - cos
    return smooth_curve(zs(out), 2.0)


tn_logmel = timbre_novelty(LM, 8)
tn_chroma = timbre_novelty(CH, 8)

# --- 3) 频带能量阶跃（低/中/高） ---
# 用对数频谱能量分组：低频 0-4 mel band, 中 4-32, 高 32-64
lm = LM
low_e = 10 ** (lm[:, :6].mean(axis=1) / 10) if False else lm[:, :6].mean(axis=1)
mid_e = lm[:, 6:34].mean(axis=1)
high_e = lm[:, 34:].mean(axis=1)


def step_novelty(x, w=6):
    x = smooth_curve(x, 1.0)
    out = np.zeros(len(x))
    for i in range(w, len(x) - w):
        out[i] = abs(x[i:i + w].mean() - x[i - w:i].mean())
    return smooth_curve(zs(out), 1.5)


low_step = step_novelty(low_e)
mid_step = step_novelty(mid_e)
high_step = step_novelty(high_e)

# --- 4) 组合 novelty ---
comb = (np.maximum(nov_s, 0) * 1.0 + np.maximum(tn_logmel, 0) * 0.6
        + np.maximum(tn_chroma, 0) * 0.3 + np.maximum(low_step, 0) * 0.5
        + np.maximum(high_step, 0) * 0.3 + np.maximum(mid_step, 0) * 0.2)
comb = smooth_curve(comb, 1.0)


def pick(score, min_dist_sec=6.0, prominence_k=0.35, exclude=6.0):
    from scipy.signal import find_peaks
    dist = int(round(min_dist_sec / hop_sec))
    pk, props = find_peaks(score, distance=dist,
                           prominence=max(0.35, prominence_k * score.std()),
                           height=score.mean() + 0.2 * score.std())
    keep = [i for i in pk if exclude <= T[i] <= T[-1] - exclude]
    return keep, props


peaks, props = pick(comb)
print("=== combined novelty peaks ===")
for i in peaks:
    print(f"  {T[i]:7.2f}s  score={comb[i]:.3f}")

print("\n=== 各特征强峰 ===")
for nm, sc in [("foote", nov_s), ("timbre", tn_logmel), ("lowStep", low_step), ("highStep", high_step)]:
    p, _ = pick(sc, min_dist_sec=8.0, prominence_k=0.6)
    print(f"  {nm}: " + ", ".join(f"{T[i]:.1f}" for i in p))

# --- 5) BPM：onset 自相关 ---
flux = zs(np.asarray(D["flux_full"], dtype=np.float64))
flux = smooth_curve(flux, 0.02).clip(0)
# 对数压缩谱通量
fps = FR
min_bpm, max_bpm = 55, 190
lags = np.arange(int(60 / max_bpm * fps), int(60 / min_bpm * fps) + 1)
acf = np.array([np.dot(flux[:-l], flux[l:]) / (len(flux) - l) for l in lags])
# 用对数正态先验（中心 120 BPM）
bpm_c = 60.0 * fps / lags
prior = np.exp(-0.5 * (np.log2(bpm_c / 120.0) / 0.45) ** 2)
score = acf * prior
# 二次插值
k = int(np.argmax(score))
best_lag = lags[k]
def refine(l, y):
    if 0 < l < len(y) - 1:
        a, b, c = y[l - 1], y[l], y[l + 1]
        d = a - 2 * b + c
        if abs(d) > 1e-12:
            return l + 0.5 * (a - c) / d
    return float(l)
bl = refine(k, score)
bpm0 = 60.0 * fps / bl
print(f"\nBPM raw={bpm0:.2f} (lag={bl:.2f} frames = {bl/fps*1000:.1f}ms)")
# 尝试 2x/0.5x 候选
for mult in (0.5, 2.0):
    lb = bl * mult
    if int(60 / max_bpm * fps) <= lb <= int(60 / min_bpm * fps):
        print(f"  candidate {bpm0*mult:.2f} bpm, lag {lb:.2f} frames")
# 节拍相位：网格搜索
period = bl
best = None
for ph in np.arange(0, period, 0.25):
    pos = np.arange(ph, len(flux) - 1, period)
    idx = pos.astype(int)
    s = flux[idx].mean()
    if best is None or s > best[0]:
        best = (s, ph)
print(f"  beat phase offset={best[1]:.2f} frames ({best[1]/fps*1000:.0f} ms), score={best[0]:.3f}")

# --- 6) 保存 ---
out = {
    "t": T.tolist(),
    "nov_foote": nov_s.tolist(),
    "nov_timbre_logmel": tn_logmel.tolist(),
    "nov_timbre_chroma": tn_chroma.tolist(),
    "nov_low_step": low_step.tolist(),
    "nov_high_step": high_step.tolist(),
    "nov_mid_step": mid_step.tolist(),
    "comb": comb.tolist(),
    "peaks": [{"t": float(T[i]), "score": float(comb[i])} for i in peaks],
    "bpm": float(bpm0),
    "bpm_beat_phase_frames": float(best[1]),
    "low_e": low_e.tolist(),
    "mid_e": mid_e.tolist(),
    "high_e": high_e.tolist(),
}
(OUT / "sections_debug.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

# --- 7) 调试图 ---
try:
    import sys
    sys.path.insert(0, str(Path(__file__).parent))
    from plothelp import plot_stack
    series = [
        (T, smooth_curve(nov_s, 1), "Foote novelty (multi-scale)", (200, 60, 30)),
        (T, smooth_curve(tn_logmel, 1), "timbre novelty (logmel)", (30, 100, 200)),
        (T, smooth_curve(tn_chroma, 1), "timbre novelty (chroma)", (120, 60, 180)),
        (T, smooth_curve(low_step, 1), "low band step", (20, 130, 60)),
        (T, smooth_curve(high_step, 1), "high band step", (150, 80, 0)),
        (T, comb, "combined", (30, 30, 30)),
        (T, (np.asarray(D["rms"]) / np.percentile(D["rms"], 99)), "rms (ds)", (140, 140, 140)),
    ]
    plot_stack(OUT / "novelty.png", series, title="section novelty (0.5s frames), red lines = user storyboard bounds",
               xmax=260.5, vlines=[10, 34, 64, 94, 124, 154, 186, 224])
    print("wrote novelty.png")
except Exception as e:
    print("plot failed", e)
