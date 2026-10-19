# -*- coding: utf-8 -*-
"""区域调试图：在细时间分辨率下把多个频带能量画出来，人工检查段落/歌词间隙。"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import plot_stack, plot_image

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
OUT = ROOT / "tools" / "audio" / "out"
D = np.load(OUT / "fine.npz")
FR = 22050 / 256.0

t = D["t"]
rms = 10 * np.log10(D["rms"] ** 2 + 1e-12)
voc = 10 * np.log10(D["e_voc"] + 1e-12)
low = 10 * np.log10(D["e_low"] + 1e-12)
high = 10 * np.log10(D["e_high"] + 1e-12)
flux = D["flux"]
cent = D["centroid"]
vr = D["voc_ratio"]


def norm_percentile(x, lo=2, hi=98):
    a, b = np.percentile(x, lo), np.percentile(x, hi)
    if b - a < 1e-9:
        b = a + 1
    return np.clip((x - a) / (b - a), 0, 1)


def smooth(x, n):
    return np.convolve(x, np.ones(n) / n, mode="same")


def region_plot(t0, t1, name):
    i0, i1 = int(t0 * FR), int(t1 * FR)
    sl = slice(i0, i1)
    tt = t[sl]
    # 每条曲线在各自全曲范围内做稳健归一化（dB -> 相对 5%-95% 分位）
    def nrm(x):
        a, b = np.percentile(x, 5), np.percentile(x, 95)
        return (x - a) / max(b - a, 1e-9)

    series = [
        (tt, nrm(rms[sl]), "RMS(dB)", (30, 30, 30)),
        (tt, nrm(voc[sl]), "vocal 200-4k(dB)", (200, 60, 30)),
        (tt, nrm(low[sl]), "low 20-200(dB)", (30, 100, 200)),
        (tt, nrm(high[sl]), "high 6-10k(dB)", (120, 60, 180)),
        (tt, nrm(smooth(flux[sl], 9)), "flux(30ms)", (20, 130, 60)),
        (tt, nrm(cent[sl] / 1000.0), "centroid kHz", (150, 80, 0)),
        (tt, nrm(vr[sl]), "vocal/total ratio", (180, 20, 120)),
    ]
    # 降低分辨率，避免 PIL 画太多点
    step = max(1, len(tt) // 2600)
    series = [(s[0][::step] - t0, s[1][::step], s[2], s[3]) for s in series]
    p = plot_stack(OUT / name, series,
                   title=f"zoom {t0}-{t1}s  (grid every 10s from {t0:.0f}s, fine hop 11.6ms)", xmax=t1 - t0,
                   vlines=[v - t0 for v in (10, 34, 64, 94, 124, 154, 186, 224) if t0 <= v <= t1])
    print("wrote", p)


if __name__ == "__main__":
    regions = [(0, 40), (30, 72), (60, 100), (90, 130), (120, 160), (150, 190), (178, 228), (214, 260.6)]
    for a, b in regions:
        region_plot(a, b, f"zoom_{int(a):03d}_{int(b):03d}.png")
