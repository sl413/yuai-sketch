# -*- coding: utf-8 -*-
"""检验立体声中心/侧向能量：主唱通常居中，看能否作为人声活动线索。"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import plot_stack

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
OUT = ROOT / "tools" / "audio" / "out"
SR = 22050
HOP = 256
NFFT = 1024

x, sr = sf.read(str(ROOT / "assets" / "song.wav"), dtype="float64", always_2d=True)
L = resample_poly(x[:, 0], 1, 2)
R = resample_poly(x[:, 1], 1, 2)
win = np.hanning(NFFT)
pad = NFFT // 2
n_frames = 1 + (len(L) + 2 * pad - NFFT) // HOP


def specs(v):
    vp = np.pad(v, (pad, pad), mode="reflect")
    fr = np.lib.stride_tricks.as_strided(
        vp, shape=(n_frames, NFFT), strides=(vp.strides[0] * HOP, vp.strides[0]), writeable=False)
    return np.fft.rfft(fr * win, axis=1)


SL = specs(L)
SR_ = specs(R)
PL = np.abs(SL) ** 2
PR = np.abs(SR_) ** 2
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
cross = SL * np.conj(SR_)
t = np.arange(n_frames) / (SR / HOP)


def band_energy(P, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return P[:, m].sum(axis=1)


bands = [(100, 300), (300, 1000), (1000, 3000), (3000, 8000)]
series = []
for lo, hi in bands:
    el = band_energy(PL, lo, hi)
    er = band_energy(PR, lo, hi)
    mid = band_energy(np.abs((SL + SR_) / 2) ** 2, lo, hi)
    side = band_energy(np.abs((SL - SR_) / 2) ** 2, lo, hi)
    ratio = mid / (mid + side + 1e-12)
    # 互相关（归一化）：中心成分 -> corr 高
    m = (freqs >= lo) & (freqs < hi)
    c = np.real(cross[:, m].sum(axis=1)) / np.sqrt(el * er + 1e-12)
    db = 10 * np.log10(mid + 1e-12)
    series.append((t, ratio, f"center ratio {lo}-{hi}", (200, 60, 30)))
    series.append((t, c, f"L/R corr {lo}-{hi}", (30, 100, 200)))
    series.append((t, db, f"mid dB {lo}-{hi}", (30, 30, 30)))

step = 10
series = [(s[0][::step], s[1][::step], s[2], s[3]) for s in series]
plot_stack(OUT / "stereo_center_full.png", series, title="stereo center/coherence (10x decimated), grid 10s", xmax=260.5)
print("wrote stereo_center_full.png")

# 分区域放大（3 个频带，中心比 + 相关）
for tag, (a, b) in {"stereo_0_40": (0, 40), "stereo_30_72": (30, 72), "stereo_70_110": (70, 110),
                    "stereo_110_160": (110, 160), "stereo_150_200": (150, 200), "stereo_200_260": (200, 260.5)}.items():
    i0, i1 = int(a * SR / HOP), int(b * SR / HOP)
    series2 = []
    for lo, hi in bands:
        mid = band_energy(np.abs((SL + SR_) / 2) ** 2, lo, hi)
        side = band_energy(np.abs((SL - SR_) / 2) ** 2, lo, hi)
        ratio = mid / (mid + side + 1e-12)
        series2.append((t[i0:i1] - a, ratio[i0:i1] * 2 - 1, f"center ratio {lo}-{hi} (x2-1)", (200, 60, 30)))
    ss = 2
    series2 = [(s[0][::ss], s[1][::ss], s[2], s[3]) for s in series2]
    plot_stack(OUT / f"{tag}.png", series2, title=f"stereo center ratio {a}-{b}s", xmax=b - a,
               vlines=[v - a for v in (10, 34, 64, 94, 124, 154, 186, 224) if a <= v <= b])
    print("wrote", tag)
