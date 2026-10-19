# -*- coding: utf-8 -*-
"""校验 audio-report.md 中的歌词表与 sections 表是否与 JSON 数据一致（防止手抄错）。"""
import json
import re
from pathlib import Path

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
rep = (ROOT / "data" / "audio-report.md").read_text(encoding="utf-8")
ly = json.loads((ROOT / "data" / "lyrics.json").read_text(encoding="utf-8"))
sec = json.loads((ROOT / "data" / "sections-detected.json").read_text(encoding="utf-8"))

# 歌词表：| 1 | 16.286 | 25.280 | 8.99 | 主歌A | 0.80 | 文本 |
rows = {}
for m in re.finditer(r"^\| (\d{1,2}) \| ([\d.]+) \| ([\d.]+) \| ([\d.]+) \| (\S+) \| ([\d.]+) \| (.+) \|$",
                     rep, re.M):
    rows[int(m.group(1))] = m.groups()
print("parsed lyric table rows:", len(rows))
bad = 0
for ln in ly["lines"]:
    r = rows.get(ln["id"])
    if not r:
        print("MISSING row", ln["id"])
        bad += 1
        continue
    _, t0, t1, dur, section, conf, text = r
    errs = []
    if abs(float(t0) - ln["t0"]) > 1e-6:
        errs.append(f"t0 {t0} != {ln['t0']}")
    if abs(float(t1) - ln["t1"]) > 1e-6:
        errs.append(f"t1 {t1} != {ln['t1']}")
    if abs(float(dur) - round(ln["t1"] - ln["t0"], 2)) > 0.011:
        errs.append(f"dur {dur} != {ln['t1']-ln['t0']:.2f}")
    if section != ln["section"]:
        errs.append(f"section {section} != {ln['section']}")
    if abs(float(conf) - ln["confidence"]) > 1e-6:
        errs.append(f"conf {conf} != {ln['confidence']}")
    if text.strip() != ln["text"]:
        errs.append(f"text mismatch {text.strip()!r} vs {ln['text']!r}")
    if errs:
        bad += 1
        print("ROW", ln["id"], "; ".join(errs))

# 段落表：| # | label | t0 | t1 | 时长 | conf | ... |
sec_rows = {}
for m in re.finditer(r"^\| (\d{1,2}) \| (\S+) \| ([\d.]+) \| \*\*([\d.]+)\*\* \| ([\d.]+) \| ([\d.]+) \|", rep, re.M):
    sec_rows[m.group(2)] = m.groups()
print("parsed section table rows:", len(sec_rows))
for s in sec:
    r = sec_rows.get(s["label"])
    if not r:
        print("MISSING section row", s["label"])
        bad += 1
        continue
    _, label, t0, t1, dur, conf = r
    errs = []
    if abs(float(t0) - s["t0"]) > 1e-3:
        errs.append(f"t0 {t0} != {s['t0']}")
    if abs(float(t1) - s["t1"]) > 1e-3:
        errs.append(f"t1 {t1} != {s['t1']}")
    if abs(float(dur) - (s["t1"] - s["t0"])) > 0.011:
        errs.append(f"dur {dur} != {s['t1']-s['t0']:.2f}")
    if abs(float(conf) - s["confidence"]) > 1e-6:
        errs.append(f"conf {conf} != {s['confidence']}")
    if errs:
        bad += 1
        print("SECTION", s["label"], "; ".join(errs))

print("RESULT:", "OK" if bad == 0 else f"{bad} mismatches")
