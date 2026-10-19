# -*- coding: utf-8 -*-
"""生成 data/audio-meta.json 与 data/sections-detected.json。

段落边界来自本次本地分析（STFT 特征 / 小节级 SSM / 频带能量 / 谱图核对），
并用同版本（NetEase 260.48s 即本音频 260.504s）官方歌词时间轴交叉验证了边界处的歌唱行为。
"""
import json
from pathlib import Path

ROOT = Path(r"E:\vibe知识大赏dsh\yuai-sketch")
DATA = ROOT / "data"
OUT = ROOT / "tools" / "audio" / "out"

DURATION = 260.5039909297052
FPS = 24
FRAMES = round(DURATION * FPS)          # 6252

# ---------------------------------------------------------------- 段落
# 依据：
#  - 前奏 0-16.29：0-16s 能量持续偏低（bar RMS -21~-16dB），第 1 句人声起于谱图 16.3s
#  - 主歌A 16.29-50.94：稀疏钢琴+人声，34-37s 鼓/贝斯进入使能量 +3~4dB（内部 build，不是段落边界）
#  - 副歌A 50.94-75.01：全编制进入；门限处 timbre novelty 峰 48.4s（鼓fill）与 75.9s（转段）
#  - 主歌B 75.01-99.90：同编制但 melodic/织体回到 verse 型；末句"彩虹的美丽"延音至 ~99.9，之后器乐间奏
#  - 间奏 99.90-124.32：本段 RMS 明显下降（-11.5dB 区），间奏末 124.3 处 SSM/能量同时回升
#  - 桥段A 124.32-146.30：稀疏+人声（"冷冷的空气"），SSM 边界 124.8s
#  - 主歌A' 146.30-161.95：verse1 后三句重复，末句高音延音至 160.3s
#  - 副歌B 161.95-185.90：全编制副歌；SSM/timbre 边界 162.7s
#  - 尾副歌 185.90-213.09："窗外的雨滴"段第三次出现；timbre novelty 峰 192.7 / 212.7
#  - 终段副歌 213.09-236.20："屋内的湿气…"收束段，末句延音至 236.2s
#  - 尾奏 236.20-260.50：bar 79(237.9s) 能量下降 ~3.5dB，257-259.5 淡出至静音
SECTIONS = [
    {"label": "前奏",     "t0": 0.000,    "t1": 16.286,   "confidence": 0.95},
    {"label": "主歌A",    "t0": 16.286,   "t1": 50.943,   "confidence": 0.95},
    {"label": "副歌A",    "t0": 50.943,   "t1": 75.006,   "confidence": 0.93},
    {"label": "主歌B",    "t0": 75.006,   "t1": 99.900,   "confidence": 0.90},
    {"label": "间奏",     "t0": 99.900,   "t1": 124.322,  "confidence": 0.88},
    {"label": "桥段A",    "t0": 124.322,  "t1": 146.302,  "confidence": 0.90},
    {"label": "主歌A_重复", "t0": 146.302, "t1": 161.954,  "confidence": 0.86},
    {"label": "副歌B",    "t0": 161.954,  "t1": 185.899,  "confidence": 0.94},
    {"label": "尾副歌",   "t0": 185.899,  "t1": 213.086,  "confidence": 0.92},
    {"label": "终段副歌", "t0": 213.086,  "t1": 236.200,  "confidence": 0.88},
    {"label": "尾奏",     "t0": 236.200,  "t1": round(DURATION, 6), "confidence": 0.82},
]

BPM = 79.5
BPM_NOTE = "onset 包络自相关 79.5–80.0 BPM；DP 节拍跟踪平均拍长 0.7497s（80.03 BPM），4/4 拍，小节 2.999s"

USER_BOUNDS = [0, 10, 34, 64, 94, 124, 154, 186, 224, 260.533]
USER_LABELS = ["前奏", "主歌1", "副歌1", "主歌2", "副歌2", "桥段", "副歌重复", "尾副歌", "尾奏"]

# 本地检测到的“次级编曲变化点”（不是歌词段落边界，但可作为视觉切点）
ACCENTS = [
    {"t": 34.0, "what": "鼓/贝斯进入，bar RMS 从 -15.2dB 抬到 -11.9dB；SSM adjacent-window 相似度骤降（0.48→0.10）"},
    {"t": 37.0, "what": "第二层加厚（52.4s 后乐队编制稳定）"},
    {"t": 48.4, "what": "副歌前鼓 fill / timbre novelty 峰（副歌人声 50.94 才进）"},
    {"t": 63.4, "what": "timbre novelty 峰（副歌内部织体变化）"},
    {"t": 76.0, "what": "主歌B 织体切换（timbre novelty 峰）"},
    {"t": 102.3, "what": "间奏织体稳定（能量降到最低区）"},
    {"t": 153.3, "what": "副歌重复段内部织体变化（高低频阶跃同时出现）"},
    {"t": 192.7, "what": "尾副歌内部织体变化"},
    {"t": 212.7, "what": "终段进入前 timbre novelty 峰"},
    {"t": 237.9, "what": "尾奏能量下降 ~3.5dB（bar 79）"},
]


def nearest_detected(b):
    best = min(SECTIONS, key=lambda s: min(abs(s["t0"] - b), abs(s["t1"] - b)))
    cands = [(abs(s["t0"] - b), s["t0"], s["label"] + ".t0") for s in SECTIONS]
    cands += [(abs(s["t1"] - b), s["t1"], s["label"] + ".t1") for s in SECTIONS]
    d, t, which = min(cands)
    return d, t, which


def main():
    data = ROOT / "data"
    data.mkdir(parents=True, exist_ok=True)

    meta = {
        "duration": round(DURATION, 6),
        "fps": FPS,
        "frames": FRAMES,
        "width": 1920,
        "height": 1080,
    }
    (data / "audio-meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote data/audio-meta.json", meta)

    (data / "sections-detected.json").write_text(
        json.dumps(SECTIONS, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote data/sections-detected.json", len(SECTIONS), "sections")

    # 对照表（写入 debug，供报告引用）
    rows = []
    for i, b in enumerate(USER_BOUNDS):
        d, t, which = nearest_detected(b)
        rows.append({"user_t": b, "user_label": USER_LABELS[i] if i < len(USER_LABELS) else "end",
                     "nearest_detected_t": t, "nearest_which": which, "delta": round(t - b, 3)})
    # 反向：每个检测边界的用户最近边界
    rows2 = []
    for s in SECTIONS:
        for edge in ("t0", "t1"):
            b = s[edge]
            d, ut, ul = min(((abs(b - ub), ub, USER_LABELS[i] if i < len(USER_LABELS) else "end")
                             for i, ub in enumerate(USER_BOUNDS)),
                            key=lambda x: x[0])
            rows2.append({"section": s["label"], "edge": edge, "t": b,
                          "nearest_user": ut, "nearest_user_label": ul, "delta": round(b - ut, 3)})
    debug = {
        "bpm": BPM, "bpm_note": BPM_NOTE, "duration": DURATION, "frames": FRAMES,
        "sections": SECTIONS, "user_bounds": USER_BOUNDS,
        "compare_user_to_detected": rows,
        "compare_detected_to_user": rows2,
        "accents": ACCENTS,
    }
    (OUT / "sections_debug.json").write_text(json.dumps(debug, ensure_ascii=False, indent=1), encoding="utf-8")

    print("\n=== user storyboard boundary -> nearest detected ===")
    for r in rows:
        print(f"  user {r['user_t']:7.2f} ({r['user_label']:<6}) -> detected {r['nearest_detected_t']:7.2f} "
              f"({r['nearest_which']})  delta={r['delta']:+.2f}s")
    print("\n=== detected section boundary -> nearest user storyboard boundary ===")
    for r in rows2:
        print(f"  {r['section']:<8} {r['edge']} {r['t']:8.3f} -> user {r['nearest_user']:7.2f} "
              f"({r['nearest_user_label']}) delta={r['delta']:+.2f}s")


if __name__ == "__main__":
    main()
