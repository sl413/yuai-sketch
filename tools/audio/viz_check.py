# -*- coding: utf-8 -*-
"""生成核对图：全曲能量 + 段落边界 + 36 行字幕 cue，便于人眼复查。"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from plothelp import _font

ROOT = HERE.parent.parent
OUT = HERE / "out"
D = np.load(OUT / "fine.npz")
FR = 22050 / 256.0
t = np.asarray(D["t"])
rms = 10 * np.log10(np.asarray(D["rms"], dtype=float) ** 2 + 1e-12)
ev = 10 * np.log10(np.asarray(D["e_voc"], dtype=float) + 1e-12)
hi = 10 * np.log10(np.asarray(D["e_high"], dtype=float) + 1e-12)

ly = json.loads((ROOT / "data" / "lyrics.json").read_text(encoding="utf-8"))
sec = json.loads((ROOT / "data" / "sections-detected.json").read_text(encoding="utf-8"))
user_bounds = [0, 10, 34, 64, 94, 124, 154, 186, 224, 260.533]
DUR = 260.5

W, H = 1800, 1180
LEFT, TOP = 70, 40
canvas = Image.new("RGB", (W, H + 60), (250, 250, 248))
dr = ImageDraw.Draw(canvas)
f = _font(12)
fb = _font(16)
dr.text((8, 8), "Rainie Love — lyric cue check (top: band energy; middle: 36 cues; bottom: sections)",
        fill=(20, 20, 20), font=fb)


def X(x):
    return LEFT + (W - LEFT - 20) * x / DUR


dec = 8
tt = t[::dec]


def plot_band(y, y0, h, color, label, ymin=None, ymax=None):
    y = y[::dec]
    lo = ymin if ymin is not None else np.percentile(y, 2)
    hh = ymax if ymax is not None else np.percentile(y, 98)
    dr.rectangle([LEFT, y0, W - 20, y0 + h], outline=(220, 220, 215))
    pts = [(X(ti), y0 + h - 2 - (yi - lo) / max(hh - lo, 1e-9) * (h - 4))
           for ti, yi in zip(tt, y) if 0 <= ti <= DUR]
    dr.line(pts, fill=color, width=1)
    dr.text((8, y0 + 2), label, fill=color, font=f)


# 能量面板
plot_band(rms, TOP, 130, (30, 30, 30), "RMS dB")
plot_band(ev, TOP + 140, 130, (200, 60, 30), "vocal band 200-4k dB")
plot_band(hi, TOP + 280, 120, (120, 60, 180), "high 6-10k dB")

# 时间轴
axis_y = TOP + 410
for s in range(0, 261, 10):
    x = X(s)
    dr.line([x, TOP, x, axis_y], fill=(235, 235, 232))
    dr.text((x - 8, axis_y + 2), str(s), fill=(60, 60, 60), font=f)

# 段落背景
colors = [(235, 240, 250), (225, 240, 230), (250, 235, 220), (230, 235, 245),
          (245, 240, 225), (235, 230, 245), (225, 245, 240), (250, 228, 228),
          (238, 240, 225), (240, 232, 245), (230, 230, 230)]
for k, s in enumerate(sec):
    dr.rectangle([X(s["t0"]), axis_y + 18, X(s["t1"]), axis_y + 40], fill=colors[k % len(colors)])
    dr.text((X(s["t0"]) + 2, axis_y + 18), s["label"], fill=(60, 60, 60), font=_font(11))

# 36 行 cue（每行一条）
base = axis_y + 52
rowh = 15
for i, ln in enumerate(ly["lines"]):
    y = base + i * rowh
    dr.text((6, y - 1), f"{ln['id']:02d}", fill=(80, 80, 80), font=_font(10))
    conf = ln["confidence"]
    col = (40, 120, 60) if conf >= 0.9 else ((210, 140, 30) if conf >= 0.8 else (200, 50, 50))
    dr.rectangle([X(ln["t0"]), y, X(ln["t1"]), y + rowh - 3], fill=col)
    dr.text((X(ln["t0"]) + 1, y - 1), ln["text"][:14], fill=(255, 255, 255), font=_font(9))

# 检测边界（蓝）与用户分镜边界（红）
bottom = base + 36 * rowh + 16
for s in sec[1:]:
    x = X(s["t0"])
    dr.line([x, TOP, x, bottom], fill=(20, 80, 220), width=1)
for b in user_bounds[1:-1]:
    x = X(b)
    for yy in range(TOP, bottom, 10):
        dr.line([x, yy, x, yy + 5], fill=(220, 20, 20), width=2)
    dr.text((x - 8, bottom + 2), f"{b:g}", fill=(220, 20, 20), font=f)

dr.text((8, H - 20), "green=conf>=0.9  orange=0.8-0.9  red=<0.8 | blue=detected section bounds | red dashes=user storyboard bounds",
        fill=(90, 90, 90), font=f)
canvas.save(OUT / "lyrics_timeline.png")
print("wrote", OUT / "lyrics_timeline.png")
