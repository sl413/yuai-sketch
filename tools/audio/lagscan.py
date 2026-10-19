# -*- coding: utf-8 -*-
"""用 46 个官方 LRC 句起点做脉冲串，与本地起音函数做互相关，求全局时移。"""
import json
from pathlib import Path

import numpy as np

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
FR = 22050 / 256.0
onf = np.load(OUT / "onset_fn.npy")
t = np.arange(len(onf)) / FR

# 解析 LRC 句起点
lrc = (OUT / "netease_lrc_316100.txt").read_text(encoding="utf-8")
starts = []
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
    if txt.strip() and 10.0 < tsec < 240.0:
        starts.append(tsec)
starts = np.array(starts)
print("n starts", len(starts))

lags = np.arange(-2.0, 2.0001, 0.01)
scores = []
for lag in lags:
    idx = np.round((starts + lag) * FR).astype(int)
    ok = (idx >= 0) & (idx < len(onf))
    scores.append(float(onf[idx[ok]].mean()))
scores = np.array(scores)
k = int(np.argmax(scores))
print(f"best lag = {lags[k]:+.3f}s score={scores[k]:.4f}  (baseline mean={scores.mean():.4f}, std={scores.std():.4f})")
# 顶部若干
order = np.argsort(scores)[::-1][:10]
print("top lags:", [(round(float(lags[i]), 2), round(float(scores[i]), 3)) for i in order])

# 每句在最优 lag 处的 onf 值（看哪些句支持/不支持）
lag = lags[k]
print(f"\nper-phrase onf at lag {lag:+.3f}:")
lrc_lines = []
for i, s in enumerate(starts):
    idx = int(round((s + lag) * FR))
    idx = min(max(idx, 0), len(onf) - 1)
    # 在 ±0.25s 内的最大值
    a = max(0, int((s + lag - 0.25) * FR))
    b = min(len(onf), int((s + lag + 0.25) * FR))
    v = float(onf[a:b].max())
    print(f"  {s:8.3f}  onf={onf[idx]:5.2f} max±0.25={v:5.2f}")

# 保存曲线，用于画图
np.savez(OUT / "lag_scan.npz", lags=lags, scores=scores)
