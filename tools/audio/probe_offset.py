# -*- coding: utf-8 -*-
"""用官方 LRC（同版本 260.48s）的逐句起点做先验，在本地音频中定位每句真实的起音时刻。

方法：对每个 LRC 句起点，在 ±0.8s 窗口内寻找"起音证据"峰的偏移：
  - 谱通量 flux 的局部峰
  - 人声频带 200-4000Hz 能量的一阶正向跃升
  - 4-10kHz 高频瞬态（辅音）
输出每句的偏移量，统计整体偏移（我们音频相对 LRC 可能有一个固定时移）。
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy.signal import find_peaks

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
OUT = ROOT / "tools" / "audio" / "out"
D = np.load(OUT / "fine.npz")
FR = 22050 / 256.0
t = np.asarray(D["t"])
flux = np.asarray(D["flux"], dtype=np.float64)
ev = np.asarray(D["e_voc"], dtype=np.float64)
hi = np.asarray(D["e_high"], dtype=np.float64)   # 4-10k
rms = np.asarray(D["rms"], dtype=np.float64)


def smooth(x, sec):
    n = max(1, int(round(sec * FR)))
    return np.convolve(x, np.ones(n) / n, mode="same")


logev = 10 * np.log10(ev + 1e-12)
loghi = 10 * np.log10(hi + 1e-12)
logrms = 10 * np.log10(rms ** 2 + 1e-12)
f = smooth(flux, 0.04)
d_ev = smooth(np.diff(logev, prepend=logev[0]), 0.04)
d_hi = smooth(np.diff(loghi, prepend=loghi[0]), 0.04)


def zs(x, lo=2, hi=98):
    a, b = np.percentile(x, lo), np.percentile(x, hi)
    return (x - a) / max(b - a, 1e-9)


onf = zs(f) + 0.6 * zs(np.maximum(d_ev, 0)) + 0.4 * zs(np.maximum(d_hi, 0))
onf = smooth(onf, 0.03)
onf = zs(onf)
np.save(OUT / "onset_fn.npy", onf)

# 解析 LRC
lrc = (OUT / "netease_lrc_316100.txt").read_text(encoding="utf-8")
phrases = []
for line in lrc.splitlines():
    line = line.strip()
    if not line.startswith("["):
        continue
    try:
        ts, txt = line.split("]", 1)
        mm, ss = ts[1:].split(":")
        tsec = int(mm) * 60 + float(ss)
    except Exception:
        continue
    txt = txt.strip()
    if not txt:
        continue
    phrases.append((tsec, txt))

lyric_phrases = [p for p in phrases if 10.0 < p[0] < 240.0]
print(f"{len(lyric_phrases)} lyric phrase starts")

print("\n=== per-phrase onset offset search (window ±0.8s) ===")
rows = []
for ts, txt in lyric_phrases:
    i0 = int((ts - 0.8) * FR)
    i1 = int((ts + 0.8) * FR)
    i0, i1 = max(0, i0), min(len(onf), i1)
    seg = onf[i0:i1]
    # 局部峰
    pk, props = find_peaks(seg, distance=int(0.12 * FR), prominence=0.05)
    best_off, best_val = None, -1e9
    for k in pk:
        off = (i0 + k) / FR - ts
        val = seg[k]
        if val > best_val:
            best_val, best_off = val, off
    # 也记录窗口内最大值位置
    kmax = int(np.argmax(seg))
    rows.append({"lrc": ts, "text": txt, "peak_off": best_off, "peak_val": float(best_val),
                 "argmax_off": (i0 + kmax) / FR - ts, "argmax_val": float(seg[kmax])})
    print(f"  {ts:8.3f}  off={best_off:+6.3f}s val={best_val:5.2f}  argmax={rows[-1]['argmax_off']:+6.3f}  {txt}")

offs = np.array([r["peak_off"] for r in rows if r["peak_off"] is not None])
vls = np.array([r["peak_val"] for r in rows if r["peak_off"] is not None])
# 只用高置信度（峰明显）的句
sel = vls > np.percentile(vls, 40)
print(f"\noffset median(all)={np.median(offs):+.3f}s  mean={offs.mean():+.3f}s  std={offs.std():.3f}")
print(f"offset median(strong {sel.sum()})={np.median(offs[sel]):+.3f}s")
print("offset histogram:", np.histogram(offs, bins=np.arange(-0.9, 0.91, 0.1))[0])
(OUT / "lrc_offset_probe.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
