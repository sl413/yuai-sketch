# -*- coding: utf-8 -*-
"""data/lyrics.json 自检脚本。

用法: python check_lyrics.py
退出码 0 = 全部通过；非 0 = 有 FAIL。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
LYRICS = ROOT / "data" / "lyrics.json"
SECTIONS = ROOT / "data" / "sections-detected.json"
META = ROOT / "data" / "audio-meta.json"
SRC = ROOT / "data" / "lyrics-source.txt"
LRC = ROOT / "tools" / "audio" / "reference-lrc.txt"

MIN_DUR, MAX_DUR = 1.2, 9.0
EPS = 1e-3

fails, warns = [], []


def fail(msg):
    fails.append(msg)
    print("  FAIL:", msg)


def warn(msg):
    warns.append(msg)
    print("  WARN:", msg)


def load_expected_texts():
    pat = re.compile(r"^\[(\d{2})\]\s?(.*)$")
    out = {}
    for line in SRC.read_text(encoding="utf-8").splitlines():
        m = pat.match(line.strip())
        if m:
            out[int(m.group(1))] = m.group(2).strip()
    return out


def load_lrc_starts():
    starts = []
    for line in LRC.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("["):
            continue
        try:
            ts, txt = line.split("]", 1)
            mm, ss = ts[1:].split(":")
            t = int(mm) * 60 + float(ss)
        except Exception:
            continue
        if txt.strip() and 10 < t < 240:
            starts.append((round(t, 3), txt.strip()))
    return starts


def main():
    print("=" * 78)
    print("check_lyrics.py — data/lyrics.json sanity check")
    print("=" * 78)

    # ---------- 文件存在 ----------
    for p in (LYRICS, SECTIONS, META, SRC):
        if not p.exists():
            fail(f"missing file: {p}")
    if fails:
        print("\nRESULT: FAIL")
        return 1

    data = json.loads(LYRICS.read_text(encoding="utf-8"))
    sections = json.loads(SECTIONS.read_text(encoding="utf-8"))
    meta = json.loads(META.read_text(encoding="utf-8"))
    expected = load_expected_texts()
    lrc = load_lrc_starts()

    # ---------- 基本字段 ----------
    print("\n[1] top-level fields")
    dur = data.get("duration")
    fps = data.get("fps")
    lines = data.get("lines")
    print(f"  duration={dur}  fps={fps}  lines={len(lines) if lines else None}")
    if not isinstance(dur, (int, float)) or dur <= 0:
        fail("duration missing/invalid")
    if fps != 24:
        fail(f"fps != 24 ({fps})")
    if abs(meta.get("duration", -1) - (dur or 0)) > 1e-3:
        fail(f"lyrics.json duration {dur} != audio-meta duration {meta.get('duration')}")
    if meta.get("frames") != round(meta.get("duration", 0) * 24):
        fail("audio-meta frames != round(duration*24)")
    if not isinstance(lines, list):
        fail("lines missing")
        print("\nRESULT: FAIL")
        return 1

    # ---------- 36 行 / id ----------
    print("\n[2] line count & ids")
    if len(lines) != 36:
        fail(f"expected 36 lines, got {len(lines)}")
    ids = [ln.get("id") for ln in lines]
    if ids != list(range(1, 37)):
        fail(f"ids not 1..36 in order: {ids}")
    else:
        print("  36 lines, ids 1..36 OK")

    # ---------- 文本逐字一致 ----------
    print("\n[3] text integrity (must equal lyrics-source.txt, no edits)")
    bad_text = 0
    for ln in lines:
        i = ln.get("id")
        if expected.get(i) != ln.get("text"):
            bad_text += 1
            fail(f"line {i} text mismatch: {ln.get('text')!r} != {expected.get(i)!r}")
    print(f"  {len(lines) - bad_text}/{len(lines)} lines match source text exactly")
    rainie = [ln for ln in lines if "Rainie Love" in ln.get("text", "")]
    print(f"  lines containing 'Rainie Love': {[ln['id'] for ln in rainie]}")
    if len(rainie) != 2:
        warn(f"expected 2 'Rainie Love' lines, got {len(rainie)}")

    # ---------- 时间单调 / 不重叠 / 时长 / 边界 ----------
    print("\n[4] timing: monotonic, non-overlap, duration 1.2-9.0s, within [0,duration]")
    prev_t1 = -1e9
    for k, ln in enumerate(lines):
        i, t0, t1 = ln["id"], ln["t0"], ln["t1"]
        d = t1 - t0
        if not (isinstance(t0, (int, float)) and isinstance(t1, (int, float))):
            fail(f"line {i}: non-numeric t0/t1")
            continue
        if t0 < 0 or t1 > dur + EPS:
            fail(f"line {i}: [{t0},{t1}] outside [0,{dur:.3f}]")
        if t0 >= t1:
            fail(f"line {i}: t0 >= t1")
        if d < MIN_DUR - EPS or d > MAX_DUR + EPS:
            fail(f"line {i}: duration {d:.3f}s outside [{MIN_DUR},{MAX_DUR}]")
        if k > 0 and t0 < prev_t1 - EPS:
            fail(f"line {i}: overlaps previous line (t0={t0} < prev t1={prev_t1})")
        if k > 0 and t0 <= lines[k - 1]["t0"]:
            fail(f"line {i}: t0 not strictly increasing")
        prev_t1 = t1
    print(f"  monotonic, no overlap: {'OK' if not any('overlap' in f or 'monotonic' in f or 'increasing' in f for f in fails) else 'FAIL'}")

    # ---------- 置信度 ----------
    print("\n[5] confidence in (0,1]")
    for ln in lines:
        c = ln.get("confidence")
        if not isinstance(c, (int, float)) or not (0 < c <= 1):
            fail(f"line {ln['id']}: bad confidence {c}")
    print("  confidence OK")

    # ---------- 段落内 ----------
    print("\n[6] every line lies inside its assigned detected section")
    sec_map = {s["label"]: (s["t0"], s["t1"], s["confidence"]) for s in sections}
    if len(sec_map) != len(sections):
        fail("duplicate section labels")
    # 段落连续覆盖
    for a, b in zip(sections, sections[1:]):
        if abs(a["t1"] - b["t0"]) > 0.02:
            fail(f"section gap/overlap between {a['label']}({a['t1']}) and {b['label']}({b['t0']})")
    if abs(sections[0]["t0"]) > EPS:
        fail("sections do not start at 0")
    if abs(sections[-1]["t1"] - dur) > 0.05:
        fail(f"sections do not end at duration ({sections[-1]['t1']} vs {dur})")
    for ln in lines:
        sec = ln.get("section")
        if sec not in sec_map:
            fail(f"line {ln['id']}: unknown section {sec!r}")
            continue
        s0, s1, _ = sec_map[sec]
        if ln["t0"] < s0 - EPS or ln["t1"] > s1 + EPS:
            fail(f"line {ln['id']} [{ln['t0']},{ln['t1']}] not inside {sec} [{s0},{s1}]")
    print(f"  {len(lines)} lines checked against {len(sections)} sections")

    # ---------- 覆盖率 ----------
    print("\n[7] coverage")
    cue_sum = sum(ln["t1"] - ln["t0"] for ln in lines)
    gaps = []
    for a, b in zip(lines, lines[1:]):
        g = b["t0"] - a["t1"]
        gaps.append(g)
        if g < -EPS:
            fail(f"negative gap between line {a['id']} and {b['id']}")
    gaps_arr = sorted(gaps)
    median_gap = gaps_arr[len(gaps_arr) // 2]
    print(f"  total cue time      : {cue_sum:.2f}s / {dur:.2f}s = {cue_sum / dur * 100:.1f}% of track")
    print(f"  inter-line gap      : min={min(gaps):.3f}s median={median_gap:.3f}s max={max(gaps):.3f}s")
    # 长间隙只允许出现在“间奏/尾奏”这类器乐段
    instr = [(s["t0"], s["t1"]) for s in sections if s["label"] in ("前奏", "间奏", "尾奏")]
    for a, b in zip(lines, lines[1:]):
        g = b["t0"] - a["t1"]
        if g > 3.0 and not any(a["t1"] >= s0 - 0.3 and b["t0"] <= s1 + 0.3 for s0, s1 in instr):
            warn(f"inter-line gap {g:.2f}s between line {a['id']} and {b['id']} is not in an instrumental section")
    # 演唱段落覆盖率（不含前奏/间奏/尾奏）
    sung_labels = [s for s in sections if s["label"] not in ("前奏", "间奏", "尾奏")]
    sung_total = sum(s["t1"] - s["t0"] for s in sung_labels)
    inside = sum(ln["t1"] - ln["t0"] for ln in lines)
    print(f"  sung sections total : {sung_total:.2f}s; cue time inside = {inside:.2f}s "
          f"({inside / sung_total * 100:.1f}%)")
    if inside / sung_total < 0.85:
        warn("cue coverage of sung sections < 85%")
    # 落在每个演唱段的行数
    print("  lines per sung section:")
    for s in sung_labels:
        n = sum(1 for ln in lines if ln["section"] == s["label"])
        print(f"    {s['label']:<10} {s['t0']:7.2f}-{s['t1']:7.2f}  {n} lines  conf={s['confidence']}")

    # ---------- 与官方 LRC 先验一致性（信息性） ----------
    print("\n[8] consistency with reference LRC phrase starts (informational)")
    lrc_times = [t for t, _ in lrc]
    max_dev, dev_line = 0.0, None
    for ln in lines:
        if ln["id"] == 19:
            continue  # 内部切分行，不对应 LRC 句首
        best = min(abs(ln["t0"] - t) for t in lrc_times)
        if best > max_dev:
            max_dev, dev_line = best, ln["id"]
    print(f"  max |t0 - nearest LRC phrase start| = {max_dev:.3f}s"
          + (f" (line {dev_line})" if dev_line is not None else " (all exact)"))
    if max_dev > 0.05:
        warn(f"line {dev_line} t0 deviates {max_dev:.3f}s from reference LRC")

    # ---------- 汇总 ----------
    print("\n" + "=" * 78)
    if fails:
        print(f"RESULT: FAIL  ({len(fails)} failures, {len(warns)} warnings)")
        for f in fails:
            print("  -", f)
        return 1
    print(f"RESULT: PASS  (36 lines, {len(warns)} warnings)")
    for w in warns:
        print("  WARN:", w)
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
