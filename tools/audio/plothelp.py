# -*- coding: utf-8 -*-
"""极简 PIL 绘图工具：把多条时间序列画成纵向堆叠图，用于人工检查音频特征。"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def _font(size=13):
    for p in (
        r"C:\Windows\Fonts\consola.ttf",
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\msyh.ttc",
    ):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def plot_stack(path, series, title="", xmax=None, W=1600, H=None, hline=None, vlines=()):
    """series: list of (t, y, label, color). 每条一条横向色带。"""
    n = len(series)
    band = 130
    top = 46
    H = H or top + n * band + 30
    img = Image.new("RGB", (W, H), (250, 250, 248))
    dr = ImageDraw.Draw(img)
    f = _font(13)
    fb = _font(15)
    dr.text((8, 8), title, fill=(20, 20, 20), font=fb)
    tmax = xmax if xmax else max(float(np.max(s[0])) for s in series)

    def X(t):
        return 8 + (W - 16) * float(t) / tmax

    for k, (t, y, label, color) in enumerate(series):
        y0 = top + k * band
        y1 = y0 + band - 22
        dr.rectangle([8, y0, W - 8, y1], outline=(225, 225, 220))
        # 时间网格
        for tsec in range(0, int(tmax) + 1, 10):
            x = X(tsec)
            dr.line([x, y0, x, y1], fill=(235, 235, 232))
            if k == 0:
                dr.text((x + 1, y0 - 16), str(tsec), fill=(120, 120, 120), font=f)
        y = np.asarray(y, dtype=float)
        if y.size == 0:
            continue
        lo, hi = np.percentile(y, 1), np.percentile(y, 99)
        if hi - lo < 1e-9:
            lo, hi = lo - 1, hi + 1
        yy = (y - lo) / (hi - lo)
        pts = [(X(ti), y1 - 4 - yy[i] * (band - 30)) for i, ti in enumerate(t) if 0 <= ti <= tmax]
        if len(pts) > 1:
            dr.line(pts, fill=color, width=1)
        dr.text((12, y0 + 1), label, fill=color, font=f)
        if hline is not None:
            hx = X(hline)
            dr.line([hx, y0, hx, y1], fill=(20, 20, 20), width=1)
    for v in vlines:
        if 0 <= v <= tmax:
            x = X(v)
            dr.line([x, top - 6, x, H - 24], fill=(200, 30, 30), width=2)
            dr.text((x + 2, H - 22), f"{v:.0f}", fill=(200, 30, 30), font=f)
    img.save(path)
    return path


def plot_image(path, mat, title="", cmap="gray", xlabel="", ylabel=""):
    """把矩阵画成灰度图（自动缩放到 1000 宽）。"""
    m = np.asarray(mat, dtype=float)
    m = m - m.min()
    m = m / (m.max() + 1e-9)
    h, w = m.shape
    W = 1000
    H = max(200, int(W * h / max(w, 1)))
    img = Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR).convert("RGB")
    canvas = Image.new("RGB", (W + 16, H + 40), (250, 250, 248))
    canvas.paste(img, (8, 30))
    dr = ImageDraw.Draw(canvas)
    dr.text((8, 8), title, fill=(20, 20, 20), font=_font(15))
    canvas.save(path)
    return path
