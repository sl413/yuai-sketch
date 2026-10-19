# -*- coding: utf-8 -*-
"""SSM 可视化（修正版：y 轴 0 在顶部，与图像行方向一致）。"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import uniform_filter

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import _font

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
D = np.load(OUT / "features.npz")
T = D["t"]
S = D["ssm"]
USER = [10, 34, 64, 94, 124, 154, 186, 224]
DUR = T[-1]


def ssm_image(Sm, T, path, title, marks=()):
    n = Sm.shape[0]
    lo, hi = np.percentile(Sm, 3), np.percentile(Sm, 99.5)
    M = np.clip((Sm - lo) / (hi - lo), 0, 1)
    r = (np.clip(M * 1.6 - 0.5, 0, 1) * 255).astype(np.uint8)
    g = (np.clip(M * 1.35 - 0.1, 0, 1) * 240).astype(np.uint8)
    b = ((1 - M) * 210 + 15).astype(np.uint8)
    img = np.stack([r, g, b], axis=-1)
    size = 1180
    im = Image.fromarray(img).resize((size, size), Image.BILINEAR)
    left, top = 64, 34
    canvas = Image.new("RGB", (size + left + 16, size + top + 30), (250, 250, 248))
    canvas.paste(im, (left, top))
    dr = ImageDraw.Draw(canvas)
    f = _font(12)
    dr.text((8, 8), title, fill=(20, 20, 20), font=_font(15))
    for sec in range(0, int(DUR) + 1, 10):
        px = left + size * sec / DUR
        py = top + size * sec / DUR
        dr.line([px, top, px, top + size], fill=(255, 140, 40), width=1)
        dr.text((px - 8, top + size + 3), str(sec), fill=(30, 30, 30), font=f)
        dr.line([left, py, left + size, py], fill=(255, 140, 40), width=1)
        dr.text((6, py - 6), str(sec), fill=(30, 30, 30), font=f)
    for v in USER:
        px = left + size * v / DUR
        py = top + size * v / DUR
        dr.line([px, top, px, top + size], fill=(255, 255, 255), width=2)
        dr.line([left, py, left + size, py], fill=(255, 255, 255), width=2)
        dr.text((px + 1, top + 2), f"{v}", fill=(255, 255, 255), font=f)
    for v in marks:
        px = left + size * v / DUR
        py = top + size * v / DUR
        dr.line([px, top, px, top + size], fill=(0, 255, 255), width=1)
        dr.line([left, py, left + size, py], fill=(0, 255, 255), width=1)
    canvas.save(path)
    print("wrote", path)


ssm_image(S, T, OUT / "ssm.png", "self-similarity (0.5s hop) - white=user storyboard bounds")
S3 = uniform_filter(S, size=5, mode="nearest")
ssm_image(S3, T, OUT / "ssm_smooth.png", "self-similarity smoothed 2.5s - white=user storyboard bounds")
