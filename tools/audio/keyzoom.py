# -*- coding: utf-8 -*-
"""关键窗口的高分辨率谱图 + LRC 句起点标记，用于人工核对歌词起止。"""
import sys
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import specplot  # noqa

OUT = HERE / "out"
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
    if txt.strip():
        starts.append(tsec)

WINDOWS = [
    (14, 30, "kz_014_030"),
    (28, 40, "kz_028_040"),
    (48, 62, "kz_048_062"),
    (72, 88, "kz_072_088"),
    (92, 106, "kz_092_106"),
    (104, 124, "kz_104_124"),
    (122, 138, "kz_122_138"),
    (137, 149, "kz_137_149"),
    (144, 158, "kz_144_158"),
    (154, 166, "kz_154_166"),
    (184, 200, "kz_184_200"),
    (204, 219, "kz_204_219"),
    (211, 226, "kz_211_226"),
    (226, 240, "kz_226_240"),
    (236, 258, "kz_236_258"),
]

if __name__ == "__main__":
    only = sys.argv[1:]
    for t0, t1, name in WINDOWS:
        if only and name not in only:
            continue
        marks = []
        for i, s in enumerate(starts):
            if t0 <= s <= t1:
                marks.append((s, f"#{i}"))
        specplot.spec_image(t0, t1, name=name + ".png", marks=marks)
