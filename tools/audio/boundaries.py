# -*- coding: utf-8 -*-
"""从平滑 SSM 直接推段落边界：
1) 相邻窗口互相似度 sim(前窗,后窗)：段落内部高，边界处低 -> 局部极小；
2) 对角块自相似度（窗口内平均相似度）；
3) checkerboard novelty（多尺度）。
"""
import sys
from pathlib import Path

import numpy as np
from scipy.signal import find_peaks
from scipy.ndimage import uniform_filter

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import plot_stack

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
D = np.load(OUT / "features.npz")
T = D["t"]
S = D["ssm"]
S3 = uniform_filter(S, size=5, mode="nearest")
hop = float(D["step"]) / float(D["frame_rate"])   # 0.5s
N = len(T)


def zs(x):
    return (x - x.mean()) / (x.std() + 1e-12)


# --- 相邻窗口互相似度 ---
w = 6  # 3s
aba = np.full(N, np.nan)
for i in range(w, N - w):
    aba[i] = S3[i - w:i, i:i + w].mean()
aba = np.where(np.isnan(aba), np.nanmean(aba), aba)

# --- 窗口内自相似（含对角线） ---
intra = np.full(N, np.nan)
for i in range(w, N - w):
    intra[i] = S3[i - w:i + w, i - w:i + w].mean()
intra = np.where(np.isnan(intra), np.nanmean(intra), intra)

# --- 多尺度 checkerboard novelty（在平滑 SSM 上） ---
def foote(ssm, L):
    K = np.ones((2 * L, 2 * L))
    K[:L, :L] = -1
    K[L:, L:] = -1
    out = np.zeros(N)
    for n in range(L, N - L):
        out[n] = (ssm[n - L:n + L, n - L:n + L] * K).sum()
    return np.maximum(out, 0)


nov = np.mean([zs(foote(S3, L)) for L in (6, 10, 14)], axis=0)

# 边界 = aba 的局部极小（深谷）
aba_s = uniform_filter(aba, size=3, mode="nearest")
minima, props = find_peaks(-aba_s, distance=int(8 / hop), prominence=0.004)
print("=== adjacent-window similarity minima (candidate boundaries) ===")
for k, i in enumerate(minima):
    if 6 <= T[i] <= T[-1] - 6:
        print(f"  {T[i]:7.2f}s  aba={aba_s[i]:.4f}  prominence={props['prominences'][k]:.4f}  intra={intra[i]:.3f}")

peaks, pprops = find_peaks(nov, distance=int(8 / hop), prominence=0.6)
print("\n=== checkerboard novelty peaks on smoothed SSM ===")
for k, i in enumerate(peaks):
    if 4 <= T[i] <= T[-1] - 4:
        print(f"  {T[i]:7.2f}s  nov={nov[i]:.2f}")

# 每个 5s 网格打印 aba 值，方便定位边界
print("\n=== aba every 2.5s ===")
lines = []
for i in range(0, N, 5):
    lines.append(f"{T[i]:6.1f}:{aba_s[i]:.3f}")
for k in range(0, len(lines), 8):
    print("  " + "  ".join(lines[k:k + 8]))

series = [
    (T, aba_s, "adjacent-window similarity (min=boundary)", (30, 100, 200)),
    (T, intra, "intra-window self-sim", (20, 130, 60)),
    (T, nov, "checkerboard novelty", (200, 60, 30)),
    (T, np.asarray(D["rms"], dtype=float), "rms", (120, 120, 120)),
]
plot_stack(OUT / "boundaries.png", series,
           title="boundary evidence (0.5s hop), white-not-shown; red = user storyboard bounds",
           xmax=260.5, vlines=[10, 34, 64, 94, 124, 154, 186, 224])
print("\nwrote boundaries.png")
