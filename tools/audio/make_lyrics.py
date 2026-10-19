# -*- coding: utf-8 -*-
"""生成 data/lyrics.json：《雨爱》36 行歌词逐行时间轴。

时间来源（详见 data/audio-report.md）：
  1) 本地音频分析（STFT/谱图/能量）确认音频就是官方 260.48s 版本（本项目 wav 260.504s），
     并用 iTunes 官方试听片段做色度互相关（score 0.99）验证；
  2) 逐句起点采用同版本官方歌词时间轴（tools/audio/reference-lrc.txt，
     NetEase 云音乐 曲目 316100，时长 260480ms）作为先验，
     再逐句在谱图上核对起音位置（16.3/50.9/124.3/146.3/…/231.5 等均与本地起音一致，误差 <0.1s）；
  3) 长音句尾（延音）与内部切分点用本地谱图/能量确定：
     16.286→尾音 25.28；彩虹的美丽 96.507→延音至 99.90；冷冷的空气…句尾 133.30；
     "很彻底/让爱消失无息" 内部切分 142.30/142.50；我的泪流在心里…学会放弃 尾音 160.30；
     末句 231.508→延音至 236.20。

输出格式：{"duration":..., "fps":24, "lines":[{id,text,t0,t1,section,confidence,note?}]}
"""
import json
import re
from pathlib import Path

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
LYRICS_SRC = ROOT / "data" / "lyrics-source.txt"
LRC = ROOT / "tools" / "audio" / "reference-lrc.txt"
OUT_JSON = ROOT / "data" / "lyrics.json"
DEBUG = ROOT / "tools" / "audio" / "out" / "lyrics_debug.json"

DURATION = 260.5039909297052
FPS = 24
GAP = 0.25          # 相邻两行字幕之间的默认留白

# 官方歌词 43 个乐句（行）起点，按 reference-lrc.txt 解析
LRC_SUNG_RANGE = (10.0, 240.0)


def parse_lrc():
    phrases = []
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
        txt = txt.strip()
        if txt and LRC_SUNG_RANGE[0] < t < LRC_SUNG_RANGE[1]:
            phrases.append((round(t, 3), txt))
    assert len(phrases) == 43, f"expected 43 lyric phrases, got {len(phrases)}"
    return phrases


def parse_source_lyrics():
    texts = []
    pat = re.compile(r"^\[(\d{2})\]\s?(.*)$")
    for line in LYRICS_SRC.read_text(encoding="utf-8").splitlines():
        m = pat.match(line.strip())
        if m:
            texts.append((int(m.group(1)), m.group(2).strip()))
    assert len(texts) == 36, f"expected 36 lyric lines, got {len(texts)}"
    assert [i for i, _ in texts] == list(range(1, 37))
    return texts


def main():
    P = parse_lrc()
    src = parse_source_lyrics()

    # 36 行 -> 官方 LRC 乐句下标（一个源行可能合并 2 个乐句）
    MAP = {
        1: [0, 1], 2: [2], 3: [3], 4: [4], 5: [5], 6: [6, 7],
        7: [8], 8: [9], 9: [10], 10: [11], 11: [12],
        12: [13], 13: [14], 14: [15], 15: [16], 16: [17, 18],
        17: [19, 20], 18: [21, "22a"], 19: ["22b"],
        20: [23], 21: [24], 22: [25, 26],
        23: [27], 24: [28], 25: [29], 26: [30], 27: [31],
        28: [32], 29: [33], 30: [34], 31: [35], 32: [36, 37],
        33: [38], 34: [39], 35: [40], 36: [41, 42],
    }
    # 乐句 22 = "很彻底 让爱消失无息" 被源第 18/19 行拆分；谱图估定的切分点：
    SPLIT_22 = (140.754, 142.500)     # (很彻底起点, 让爱消失无息起点)

    def idx_time(key):
        if key == "22a":
            return SPLIT_22[0]
        if key == "22b":
            return SPLIT_22[1]
        return P[key][0]

    # 各源行起点
    t0 = {i: idx_time(MAP[i][0]) for i in range(1, 37)}

    # 特殊尾时间（本地谱图/能量判定，见文件头说明）
    SPECIAL_T1 = {
        1: 25.28,
        16: 99.90,
        17: 133.30,
        18: 142.30,
        19: 146.18,
        22: 160.30,
        36: 236.20,
    }

    # 段落归属
    SEC = {
        **{i: "主歌A" for i in range(1, 7)},
        **{i: "副歌A" for i in range(7, 12)},
        **{i: "主歌B" for i in range(12, 17)},
        **{i: "桥段A" for i in range(17, 20)},
        **{i: "主歌A_重复" for i in range(20, 23)},
        **{i: "副歌B" for i in range(23, 28)},
        **{i: "尾副歌" for i in range(28, 33)},
        **{i: "终段副歌" for i in range(33, 37)},
    }

    CONF = {i: 0.92 for i in range(1, 37)}
    CONF.update({
        1: 0.80, 6: 0.90, 11: 0.90, 15: 0.90, 16: 0.85, 17: 0.78, 18: 0.72, 19: 0.72,
        20: 0.90, 22: 0.82, 27: 0.90, 31: 0.90, 32: 0.90, 35: 0.92, 36: 0.85,
    })
    NOTES = {
        1: "两乐句合并行：尾句延音到 ~25.3s，t1 由谱图估定（乐句约 9.0s，接近 9s 上限）",
        6: "两乐句合并行（我的泪流在心里 / 学会放弃）",
        11: "尾句较长，t1 = 下一句起点 - 0.25s",
        16: "两乐句合并行；末句“彩虹的美丽”高音延音到 ~99.9s，之后是 24s 器乐间奏",
        17: "两乐句合并行（冷冷的空气 / 很窒息 我无法呼吸）；句尾按谱图定在 ~133.3s（9s 上限内）",
        18: "t0 取“一万颗雨滴的距离”起点；t1 为“很彻底/让爱消失无息”内部切分（谱图估定 ~142.3s）",
        19: "t0 为官方乐句“很彻底 让爱消失无息”内部切分点（谱图估定 ~142.5s），存在 ±0.2s 不确定",
        22: "两乐句合并行；末句“学会放弃”高音延音到 ~160.3s（谱图确认延音结束 158.5-160.3）",
        36: "两乐句合并行；末句“彩虹的美丽”延音到 ~236.2s（全曲最后一次人声）",
    }

    lines = []
    for i, text in src:
        a = round(t0[i], 3)
        b = SPECIAL_T1.get(i)
        if b is None:
            b = round(t0[i + 1] - GAP, 3) if i < 36 else round(DURATION - 0.5, 3)
        b = round(b, 3)
        entry = {
            "id": i,
            "text": text,
            "t0": a,
            "t1": b,
            "section": SEC[i],
            "confidence": CONF[i],
        }
        if i in NOTES:
            entry["note"] = NOTES[i]
        lines.append(entry)

    out = {"duration": round(DURATION, 6), "fps": FPS, "lines": lines}
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", OUT_JSON, len(lines), "lines")

    # debug 表
    dbg = []
    for e in lines:
        dbg.append({**e, "dur": round(e["t1"] - e["t0"], 3)})
    DEBUG.write_text(json.dumps(dbg, ensure_ascii=False, indent=1), encoding="utf-8")
    for e in dbg:
        print(f"{e['id']:2d} {e['t0']:8.3f} {e['t1']:8.3f} {e['dur']:6.2f}s {e['section']:<10} "
              f"{e['confidence']:.2f} {e['text'][:26]}")


if __name__ == "__main__":
    main()
