# -*- coding: utf-8 -*-
"""把自相似矩阵 (SSM) 画成带时间轴的图像，人工识别重复段/段落边界。"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import _font

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
D = np.load(OUT / "features.npz")
T = D["t"]
S = D["ssm"]


def ssm_image(S, T, path, cmap="viridis"):
    n = S.shape[0]
    # 归一化到 0-1（相似度通常 0.2-0.95）
    lo, hi = np.percentile(S, 3), np.percentile(S, 99.5)
    M = np.clip((S - lo) / (hi - lo), 0, 1)
    # 简单色图
    r = (np.clip(M * 1.5 - 0.4, 0, 1) * 255).astype(np.uint8)
    g = (np.clip(M * 1.2, 0, 1) * 235).astype(np.uint8)
    b = ((1 - M) * 200 + 20).astype(np.uint8)
    img = np.stack([r, g, b], axis=-1)
    size = 1200
    im = Image.fromarray(img).resize((size, size), Image.BILINEAR)
    canvas = Image.new("RGB", (size + 70, size + 50), (250, 250, 248))
    canvas.paste(im, (60, 30))
    dr = ImageDraw.Draw(canvas)
    f = _font(12)
    fb = _font(15)
    dr.text((8, 6), "self-similarity matrix (log-mel+chroma cosine, 0.5s hop)", fill=(20, 20, 20), font=fb)
    dur = T[-1]
    for sec in range(0, int(dur) + 1, 10):
        px = 60 + size * sec / dur
        dr.line([px, 30, px, 30 + size], fill=(255, 120, 40), width=1)
        dr.text((px - 8, 30 + size + 2), str(sec), fill=(30, 30, 30), font=f)
        dr.line([60, 30 + size - size * sec / dur, 60 + size, 30 + size - size * sec / dur],
                fill=(255, 120, 40), width=1)
        dr.text((2, 30 + size - size * sec / dur - 6), str(sec), fill=(30, 30, 30), font=f)
    # 用户边界
    for v in (10, 34, 64, 94, 124, 154, 186, 224):
        px = 60 + size * v / dur
        py = 30 + size - size * v / dur
        dr.line([px, 30, px, 30 + size], fill=(255, 255, 255), width=1)
        dr.line([60, py, 60 + size, py], fill=(255, 255, 255), width=1)
    canvas.save(path)
    print("wrote", path, "size", S.shape)


ssm_image(S, T, OUT / "ssm.png")

# 也画 log-mel 谱图（0.5s 分辨率，全曲概览）
LM = D["logmel"]
# 只保留 0-3000Hz 的低频段（mel 前 40 带），更利于看结构
M = LM[:, :48].T
M = np.flipud(M)
M = (M - M.min()) / (M.max() - M.min())
im = Image.fromarray((M * 255).astype(np.uint8)).resize((1400, 420), Image.BILINEAR).convert("RGB")
canvas = Image.new("RGB", (1400, 470), (250, 250, 248))
canvas.paste(im, (0, 40))
dr = ImageDraw.Draw(canvas)
f = _font(12)
dr.text((8, 8), "log-mel overview (0.5s hop, low 48 bands) - red = user bounds", fill=(20, 20, 20), font=_font(15))
for sec in range(0, 261, 10):
    px = 1400 * sec / 260.5
    dr.line([px, 40, px, 460], fill=(255, 120, 40), width=1)
    dr.text((px - 6, 442), str(sec), fill=(30, 30, 30), font=f)
for v in (10, 34, 64, 94, 124, 154, 186, 224):
    px = 1400 * v / 260.5
    dr.line([px, 40, px, 460], fill=(255, 0, 0), width=2)
canvas.save(OUT / "logmel_overview.png")
print("wrote logmel_overview.png")
