# -*- coding: utf-8 -*-
"""线性频率谱图（0-6kHz）：用于人工/视觉检查人声乐句与段落结构。

用法: python specplot.py 0 30 30 60 ...   (成对给出窗口)
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
OUT = ROOT / "tools" / "audio" / "out"
SR = 22050
NFFT = 2048
HOP = 128
FMAX = 6000.0

USER_BOUNDS = [0, 10, 34, 64, 94, 124, 154, 186, 224, 260.533]


def font(size=13):
    for p in (r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\arial.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            pass
    return ImageFont.load_default()


_x = None


def load():
    global _x
    if _x is None:
        _x, sr = sf.read(str(ROOT / "assets" / "song-22k.wav"), dtype="float32", always_2d=False)
        assert sr == SR
    return _x


def stft_window(x, i0, i1):
    pad = NFFT // 2
    seg = np.pad(x, (pad, pad), mode="reflect")
    n_total = 1 + (len(seg) - NFFT) // HOP
    win = np.hanning(NFFT).astype(np.float32)
    fr_all = np.lib.stride_tricks.as_strided(
        seg, shape=(n_total, NFFT),
        strides=(seg.strides[0] * HOP, seg.strides[0]), writeable=False)[i0:i1]
    return np.fft.rfft(fr_all * win, axis=1)


def spec_image(t0, t1, name=None, W=1700, H=950, marks=()):
    x = load()
    i0 = int(t0 * SR / HOP)
    i1 = int(t1 * SR / HOP)
    S = stft_window(x, i0, i1)
    mag = 20 * np.log10(np.abs(S) + 1e-8)
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    keep = freqs <= FMAX
    M = mag[:, keep].T                        # (F, T)
    M = np.flipud(M)                          # 低频在下
    lo, hi = np.percentile(M, 8), np.percentile(M, 99.7)
    M = np.clip((M - lo) / max(hi - lo, 1e-6), 0, 1)
    img = Image.fromarray((M * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR).convert("RGB")

    top, left = 36, 54
    canvas = Image.new("RGB", (W + left + 10, H + top + 26), (248, 248, 245))
    canvas.paste(img, (left, top))
    dr = ImageDraw.Draw(canvas)
    f = font(13)
    fb = font(16)
    dur = t1 - t0
    dr.text((8, 8), f"spectrogram {t0:.1f}-{t1:.1f}s  linear 0-{FMAX/1000:.0f}kHz, hop 5.8ms", fill=(20, 20, 20), font=fb)
    # 时间刻度
    every = 2 if dur <= 16 else 5
    for tsec in np.arange(np.ceil(t0 / every) * every, t1 + 0.001, every):
        px = left + (W) * (tsec - t0) / dur
        dr.line([px, top, px, top + H], fill=(90, 90, 90), width=1)
        dr.text((px + 2, top + H + 2), f"{tsec:g}", fill=(30, 30, 30), font=f)
    # 用户边界
    for v in USER_BOUNDS:
        if t0 <= v <= t1:
            px = left + W * (v - t0) / dur
            dr.line([px, top, px, top + H], fill=(220, 30, 30), width=2)
            dr.text((px + 3, top + 2), f"{v:g}", fill=(220, 30, 30), font=f)
    # 额外标记（LRC 句起点等）
    for v, label in marks:
        if t0 <= v <= t1:
            px = left + W * (v - t0) / dur
            dr.line([px, top, px, top + H], fill=(0, 220, 255), width=1)
            dr.text((px + 1, top + H - 15), label, fill=(0, 200, 235), font=f)
    # 频率刻度
    for hz in (200, 500, 1000, 2000, 3000, 4000, 5000):
        if hz > FMAX:
            continue
        py = top + H * (1 - hz / FMAX)
        dr.line([left, py, left + W, py], fill=(255, 180, 60), width=1)
        dr.text((3, py - 6), f"{hz}", fill=(120, 80, 20), font=f)
    name = name or f"spec_{int(t0):03d}_{int(t1):03d}.png"
    p = OUT / name
    canvas.save(p)
    print("wrote", p)
    return p


if __name__ == "__main__":
    args = [float(a) for a in sys.argv[1:]]
    if len(args) < 2:
        args = [0, 30]
    for k in range(0, len(args) - 1, 2):
        spec_image(args[k], args[k + 1])
