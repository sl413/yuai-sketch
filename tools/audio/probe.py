# -*- coding: utf-8 -*-
"""精确读取 WAV 头信息，确认采样数/时长，并计算 24fps 帧数。"""
import json
import struct
import sys
import wave
from pathlib import Path

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")


def parse_wav_chunks(path: Path):
    with open(path, "rb") as f:
        raw = f.read(4096)
    assert raw[:4] == b"RIFF" and raw[8:12] == b"WAVE", "not a canonical RIFF/WAVE"
    riff_size = struct.unpack("<I", raw[4:8])[0]
    pos = 12
    chunks = []
    while pos + 8 <= len(raw):
        cid = raw[pos : pos + 4].decode("latin1")
        size = struct.unpack("<I", raw[pos + 4 : pos + 8])[0]
        chunks.append({"id": cid, "size": size, "offset": pos})
        if cid == "data":
            break
        pos += 8 + size + (size & 1)
    return riff_size, chunks


def main():
    out = {}
    for name in ("song.wav", "song-22k.wav"):
        p = ROOT / "assets" / name
        riff_size, chunks = parse_wav_chunks(p)
        data_chunk = next(c for c in chunks if c["id"] == "data")
        with wave.open(str(p), "rb") as w:
            nch, sw, sr, nframes = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        info = {
            "file": str(p),
            "bytes": p.stat().st_size,
            "chunks": [{"id": c["id"], "size": c["size"]} for c in chunks],
            "riff_size": riff_size,
            "channels": nch,
            "sample_width": sw,
            "sample_rate": sr,
            "frames": nframes,
            "duration": nframes / sr,
            "bytes_per_sample_frame": nch * sw,
            "data_chunk_size": data_chunk["size"],
            "data_chunk_frames": data_chunk["size"] // (nch * sw),
        }
        out[name] = info
        print(json.dumps(info, ensure_ascii=False, indent=2))

    main_dur = out["song.wav"]["duration"]
    print(f"\n[24fps] round({main_dur}*24) = {round(main_dur * 24)}")
    print(f"[24fps] ceil          = {int(-(-main_dur * 24 // 1))}")
    print(f"[nominal 260.5333] round = {round(260.5333 * 24)}")
    out["_24fps"] = {
        "measured_duration": main_dur,
        "frames_round": round(main_dur * 24),
        "frames_ceil": int(-(-main_dur * 24 // 1)),
        "nominal_260.5333_frames": round(260.5333 * 24),
        "measured_frames_seconds": round(main_dur * 24) / 24,
    }
    (ROOT / "tools" / "audio" / "out" / "_probe.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\nwritten tools/audio/out/_probe.json")


if __name__ == "__main__":
    main()
