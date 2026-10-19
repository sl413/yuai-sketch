# -*- coding: utf-8 -*-
"""小节级分析：以跟踪到的节拍/小节为网格，计算每小节特征、小节级 SSM、能量，
用于识别歌曲曲式（intro/verse/chorus/bridge）。"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import uniform_filter

sys.path.insert(0, str(Path(__file__).parent))
from plothelp import _font, plot_stack

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
D = np.load(OUT / "features.npz")
HOP = float(D["step"]) / float(D["frame_rate"])   # 0.5s
T = D["t"]
LM = D["logmel"]
CH = D["chroma"]
RMS = D["rms"]
EV = D["ev"]
tempo = json.loads((OUT / "tempo.json").read_text())
bars = np.array(tempo["bars"], dtype=float)
DUR = 260.504

# 补齐最后一个不完整小节
bar_edges = list(bars)
if bar_edges[-1] < DUR - 1.5:
    bar_edges.append(bar_edges[-1] + np.diff(bars).mean())
bar_edges = np.array(bar_edges)
nbar = len(bar_edges) - 1
print(f"bars: {nbar}, from {bar_edges[0]:.2f}s to {bar_edges[-1]:.2f}s")


def frames_in(a, b):
    i0 = int(round(a / HOP))
    i1 = int(round(b / HOP))
    return max(0, i0), min(len(T), max(i1, i0 + 1))


# 小节特征
feat_rows, meta = [], []
for k in range(nbar):
    a, b = bar_edges[k], bar_edges[k + 1]
    i0, i1 = frames_in(a, b)
    lm = LM[i0:i1].mean(axis=0)
    ch = CH[i0:i1].mean(axis=0)
    feat_rows.append((lm, ch))
    meta.append({
        "i": k,
        "t0": float(a), "t1": float(b),
        "rms": float(np.sqrt(np.mean(RMS[i0:i1] ** 2))),
        "rms_db": float(10 * np.log10(np.mean(RMS[i0:i1] ** 2) + 1e-12)),
        "ev_db": float(10 * np.log10(np.mean(EV[i0:i1] ** 2) + 1e-12)),
        "low": float(lm[:8].mean()),
        "mid": float(lm[8:36].mean()),
        "high": float(lm[36:].mean()),
    })

LMb = np.stack([r[0] for r in feat_rows])   # (nbar, 64)
CHb = np.stack([r[1] for r in feat_rows])   # (nbar, 12)


def zn(M):
    return (M - M.mean(axis=0)) / (M.std(axis=0) + 1e-9)


F = np.concatenate([zn(LMb), zn(CHb) * 0.5], axis=1)
F = F / (np.linalg.norm(F, axis=1, keepdims=True) + 1e-9)
SSMb = F @ F.T

# 打印每小节 meta
print("\nbar |  t0     rms_dB  ev_dB   low    mid    high")
for m in meta:
    print(f"{m['i']:3d} | {m['t0']:7.2f}  {m['rms_db']:6.2f} {m['ev_db']:6.2f}  {m['low']:6.1f} {m['mid']:7.1f} {m['high']:6.1f}")

# 小节级 SSM 图
def ssm_img(Sm, meta, path, title):
    n = Sm.shape[0]
    lo, hi = np.percentile(Sm, 5), np.percentile(Sm, 99)
    M = np.clip((Sm - lo) / (hi - lo), 0, 1)
    r = (np.clip(M * 1.6 - 0.5, 0, 1) * 255).astype(np.uint8)
    g = (np.clip(M * 1.35 - 0.1, 0, 1) * 240).astype(np.uint8)
    b = ((1 - M) * 210 + 15).astype(np.uint8)
    img = np.stack([r, g, b], -1)
    size = 1000
    im = Image.fromarray(img).resize((size, size), Image.NEAREST)
    left, top = 70, 34
    canvas = Image.new("RGB", (size + left + 14, size + top + 28), (250, 250, 248))
    canvas.paste(im, (left, top))
    dr = ImageDraw.Draw(canvas)
    f = _font(11)
    dr.text((8, 8), title, fill=(20, 20, 20), font=_font(15))
    for k in range(0, n, 4):
        px = left + size * k / n
        py = top + size * k / n
        col = (255, 140, 40) if k % 8 else (255, 240, 100)
        dr.line([px, top, px, top + size], fill=col, width=1)
        dr.line([left, py, left + size, py], fill=col, width=1)
        dr.text((px - 8, top + size + 2), f"{meta[k]['t0']:.0f}", fill=(30, 30, 30), font=f)
        dr.text((2, py - 5), f"{meta[k]['t0']:.0f}", fill=(30, 30, 30), font=f)
    # 用户边界
    for v in (10, 34, 64, 94, 124, 154, 186, 224):
        # 找最近小节
        i = int(np.argmin([abs(m["t0"] - v) for m in meta]))
        px = left + size * i / n
        dr.line([px, top, px, top + size], fill=(255, 255, 255), width=2)
        dr.line([left, top + size * i / n, left + size, top + size * i / n], fill=(255, 255, 255), width=2)
    canvas.save(path)
    print("wrote", path)


ssm_img(SSMb, meta, OUT / "ssm_bars.png", f"bar-level SSM ({nbar} bars, 4/4, ~80bpm) - white = user bounds nearest bar")

# 小节能量曲线
tt = [m["t0"] for m in meta]
series = [
    (tt, [m["rms_db"] for m in meta], "bar RMS dB", (30, 30, 30)),
    (tt, [m["low"] for m in meta], "bar low band", (30, 100, 200)),
    (tt, [m["mid"] for m in meta], "bar mid band", (200, 60, 30)),
    (tt, [m["high"] for m in meta], "bar high band", (120, 60, 180)),
]
plot_stack(OUT / "bar_energy.png", series, title="bar-level energy (~3s bars)", xmax=260.5,
           vlines=[10, 34, 64, 94, 124, 154, 186, 224])
print("wrote bar_energy.png")

# 保存
np.savez(OUT / "bars.npz", bar_edges=bar_edges, LMb=LMb, CHb=CHb, SSMb=SSMb,
         meta=json.dumps(meta, ensure_ascii=False))
print("saved bars.npz")
