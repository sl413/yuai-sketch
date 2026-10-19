# -*- coding: utf-8 -*-
"""把 iTunes 官方试听片段与项目音频做色度/频谱互相关，确认是否是同一首歌并求时间偏移。"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
SR = 22050
HOP = 512
NFFT = 2048


def load(p):
    x, sr = sf.read(str(p), dtype="float32", always_2d=False)
    if x.ndim > 1:
        x = x.mean(axis=1)
    assert sr == SR, (p, sr)
    return x


def feat(x):
    win = np.hanning(NFFT).astype(np.float32)
    pad = NFFT // 2
    xp = np.pad(x, (pad, pad), mode="reflect")
    n = 1 + (len(xp) - NFFT) // HOP
    fr = np.lib.stride_tricks.as_strided(
        xp, shape=(n, NFFT), strides=(xp.strides[0] * HOP, xp.strides[0]), writeable=False)
    S = np.fft.rfft(fr * win, axis=1)
    P = (np.abs(S) ** 2).astype(np.float32)
    freqs = np.fft.rfftfreq(NFFT, 1 / SR)
    mask = (freqs >= 80) & (freqs <= 2000)
    midi = 69 + 12 * np.log2(freqs[mask] / 440)
    pc = np.mod(np.round(midi).astype(int), 12)
    w = np.sqrt(P[:, mask])
    ch = np.zeros((n, 12), dtype=np.float32)
    for k in range(12):
        ch[:, k] = w[:, pc == k].sum(axis=1)
    ch /= (ch.sum(axis=1, keepdims=True) + 1e-9)
    return ch


x = load(OUT / "ref_preview.wav")
y = load(r"E:\vibe知识大赏dsh\yuai-sketch\assets\song-22k.wav")
print("preview", len(x) / SR, "s; song", len(y) / SR, "s")

CHp = feat(x)
CHs = feat(y)
hop_sec = HOP / SR
# 平滑到 1s 分辨率
def pool(C, k=43):
    n = len(C) // k
    return C[: n * k].reshape(n, k, 12).mean(axis=1)

P_ = pool(CHp)
S_ = pool(CHs)
print("pooled shapes", P_.shape, S_.shape)

# 互相关：preview 的每个 0.5s 特征与 song 对应位置
def zn(M):
    M = M - M.mean(axis=1, keepdims=True)
    return M / (np.linalg.norm(M, axis=1, keepdims=True) + 1e-9)

Pz = zn(P_)
Sz = zn(S_)
# 局部归一化的匹配分：song 里每个起点 offset，取连续 len(P) 帧的平均相似度
L = len(P_)
scores = []
for off in range(0, len(S_) - L + 1):
    seg = Sz[off:off + L]
    scores.append(float((seg * Pz).sum(axis=1).mean()))
scores = np.array(scores)
best = int(np.argmax(scores))
print(f"best offset = {scores[best]:.4f} at t={best * 1.0:.1f}s (pooled 1s)")
order = np.argsort(scores)[::-1][:10]
print("top offsets:", [(round(float(o), 1), round(float(scores[int(o)]), 4)) for o in order])
# 也给出 song 全长上的得分曲线
np.savez(OUT / "refmatch.npz", scores=scores)
