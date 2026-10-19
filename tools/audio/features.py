# -*- coding: utf-8 -*-
"""《雨爱》音频特征提取：STFT / log-mel / 色度 / RMS / 频带能量 / 谱通量 / 自相似 / BPM。

输出 data/_features.npz 与若干调试图（tools/audio/out/）。
"""
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly, find_peaks

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
OUT = ROOT / "tools" / "audio" / "out"
OUT.mkdir(parents=True, exist_ok=True)

SR = 22050
HOP = 256          # 11.61 ms
NFFT = 1024        # 46.4 ms
N_MEL = 64
FMIN, FMAX = 60.0, 10000.0
FRAME_RATE = SR / HOP


def load_audio():
    x, sr = sf.read(str(ROOT / "assets" / "song.wav"), dtype="float64", always_2d=True)
    assert sr == 44100
    mid = x.mean(axis=1)
    side = (x[:, 0] - x[:, 1]) / 2.0
    mid = resample_poly(mid, 1, 2)   # 44100 -> 22050
    side = resample_poly(side, 1, 2)
    return mid.astype(np.float32), side.astype(np.float32)


def stft_power(x):
    win = np.hanning(NFFT).astype(np.float32)
    pad = NFFT // 2
    xp = np.pad(x, (pad, pad), mode="reflect")
    n_frames = 1 + (len(xp) - NFFT) // HOP
    frames = np.lib.stride_tricks.as_strided(
        xp, shape=(n_frames, NFFT),
        strides=(xp.strides[0] * HOP, xp.strides[0]), writeable=False)
    spec = np.fft.rfft(frames * win, axis=1)     # (T, 513)
    return (np.abs(spec) ** 2).astype(np.float32), n_frames


def mel_filterbank():
    def hz2mel(f):
        return 2595.0 * np.log10(1.0 + np.asarray(f) / 700.0)

    def mel2hz(m):
        return 700.0 * (10.0 ** (np.asarray(m) / 2595.0) - 1.0)

    freqs = np.fft.rfftfreq(NFFT, 1.0 / SR)
    mels = np.linspace(hz2mel(FMIN), hz2mel(FMAX), N_MEL + 2)
    hz = mel2hz(mels)
    fb = np.zeros((N_MEL, len(freqs)), dtype=np.float32)
    for i in range(N_MEL):
        lo, ce, hi = hz[i], hz[i + 1], hz[i + 2]
        left = (freqs - lo) / max(ce - lo, 1e-9)
        right = (hi - freqs) / max(hi - ce, 1e-9)
        fb[i] = np.clip(np.minimum(left, right), 0, None)
        fb[i] /= max(fb[i].sum(), 1e-9)
    return fb, freqs


def chroma_map(freqs):
    """80Hz-2000Hz 的频率 bin -> 12 音级（按 A4=440，四舍五入到最近半音）。"""
    mask = (freqs >= 80.0) & (freqs <= 2000.0)
    midi = 69.0 + 12.0 * np.log2(freqs[mask] / 440.0)
    pc = np.mod(np.round(midi).astype(int), 12)
    return mask, pc


def smooth(x, n):
    if n <= 1:
        return x
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def band_power(P, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return P[:, m].sum(axis=1)


def main():
    print("load...")
    mid, side = load_audio()
    print("mid", mid.shape, mid.dtype)
    P, n_frames = stft_power(mid)
    print("P", P.shape)
    fb, freqs = mel_filterbank()
    mel = P @ fb.T                                   # (T, 64)
    logmel = np.log10(mel + 1e-10)

    mask, pc = chroma_map(freqs)
    Pc = P[:, mask]
    w = np.sqrt(Pc)                                  # 压缩动态范围
    chroma = np.zeros((n_frames, 12), dtype=np.float32)
    for k in range(12):
        chroma[:, k] = w[:, pc == k].sum(axis=1)
    chroma /= (chroma.sum(axis=1, keepdims=True) + 1e-9)

    m2 = mid.astype(np.float64) ** 2
    pad = n_frames * HOP - len(m2)
    if pad > 0:
        m2 = np.pad(m2, (0, pad))
    rms = np.sqrt(m2[: n_frames * HOP].reshape(n_frames, HOP).mean(axis=1))
    total = P.sum(axis=1) + 1e-12
    e_low = band_power(P, freqs, 20, 200)
    e_voc = band_power(P, freqs, 200, 4000)
    e_high = band_power(P, freqs, 4000, 10000)
    e_hi2 = band_power(P, freqs, 6000, 10000)
    centroid = (P * freqs[None, :]).sum(axis=1) / total
    flatness = np.exp(np.log(P + 1e-12).mean(axis=1)) / (P.mean(axis=1) + 1e-12)

    # 谱通量（正半波差分的 log-mel 距离）
    d = np.diff(logmel, axis=0)
    flux = np.sqrt((np.maximum(d, 0) ** 2).sum(axis=1))
    flux = np.concatenate([[0.0], flux])
    flux_s = smooth(flux, 5)

    # 能量包络（dB，25ms 平滑）
    def env(x):
        y = 10.0 * np.log10(x + 1e-12)
        return smooth(y, 5)

    e_rms_db = env(rms.astype(np.float64) ** 2)
    e_voc_db = env(e_voc.astype(np.float64))
    e_low_db = env(e_low.astype(np.float64))
    e_high_db = env(e_high.astype(np.float64))
    voc_ratio = e_voc / total

    # 以 0.5s hop 降采样用于 SSM
    step = int(round(0.5 * FRAME_RATE))     # 43 帧 = 0.499 s
    T = len(logmel)
    idx = np.arange(0, T, step)
    logmel_ds = np.array([logmel[max(0, i - 1): i + 2].mean(axis=0) for i in idx])
    chroma_ds = np.array([chroma[max(0, i - 1): i + 2].mean(axis=0) for i in idx])
    rms_ds = np.array([rms[max(0, i - 1): i + 2].mean() for i in idx])
    ev_ds = np.array([e_voc[max(0, i - 1): i + 2].mean() for i in idx])
    t_ds = idx / FRAME_RATE

    def znorm(m):
        m = m - m.mean(axis=0)
        s = m.std(axis=0) + 1e-9
        return (m / s).astype(np.float32)

    feat = np.concatenate([znorm(logmel_ds), znorm(chroma_ds) * 0.5], axis=1)
    feat /= np.linalg.norm(feat, axis=1, keepdims=True) + 1e-9
    ssm = feat @ feat.T
    ssm_ = ssm.copy()
    np.savez_compressed(
        OUT / "features.npz",
        t=t_ds, logmel=logmel_ds, chroma=chroma_ds, rms=rms_ds, ev=ev_ds,
        ssm=ssm_, step=step, frame_rate=FRAME_RATE, hop=HOP, sr=SR,
        rms_db_full=e_rms_db, voc_db_full=e_voc_db, low_db_full=e_low_db,
        high_db_full=e_high_db, voc_ratio_full=voc_ratio, flux_full=flux_s,
        centroid_full=centroid, flatness_full=flatness,
        rms_full=rms, ev_full=e_voc, side_rms=float(np.sqrt(np.mean(side.astype(np.float64)**2))),
    )
    np.savez_compressed(
        OUT / "fine.npz", rms=rms, e_voc=e_voc, e_low=e_low, e_high=e_hi2,
        flux=flux, centroid=centroid, flatness=flatness, t=np.arange(n_frames) / FRAME_RATE,
        voc_ratio=voc_ratio, logmel_energy=10*np.log10(mel+1e-10),
    )
    print("saved features", ssm.shape, logmel.shape)
    print("duration from frames:", n_frames / FRAME_RATE)
    print("side rms:", float(np.sqrt(np.mean(side.astype(np.float64)**2))))

    # 调试图
    try:
        from plothelp import plot_stack
        t = np.arange(n_frames) / FRAME_RATE
        plot_stack(
            OUT / "energy.png",
            [
                (t, e_rms_db, "full RMS db", (40, 40, 40)),
                (t, e_voc_db, "vocal band 200-4k db", (200, 60, 30)),
                (t, e_low_db, "low 20-200 db", (30, 100, 200)),
                (t, np.log10(np.maximum(e_high, 1e-9)), "high 4k-10k log", (120, 60, 180)),
                (t, flux_s / (np.percentile(flux_s, 99) + 1e-9), "flux norm", (20, 130, 60)),
                (t, centroid / 3000.0, "centroid/3000", (150, 80, 0)),
            ],
            title="Rainie Love - band energy / spectral features", xmax=260.6,
        )
    except Exception as e:  # noqa
        print("plot failed:", e)


if __name__ == "__main__":
    main()
