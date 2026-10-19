#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""歌词字幕：data/lyrics.json → cues.json + yuai-sketch.srt（手写体字幕的文本与时间轴）"""
import json, os, sys, io

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = os.path.join(HERE, 'data', 'lyrics.json')
out_srt = os.path.join(HERE, 'yuai-sketch.srt')
out_cues = os.path.join(HERE, 'data', 'cues.json')

if not os.path.exists(src):
    print('[srt] no data/lyrics.json yet — skipped')
    sys.exit(0)

with io.open(src, encoding='utf-8') as f:
    data = json.load(f)

lines = sorted(data.get('lines', []), key=lambda l: float(l['t0']))
cues = []
for i, l in enumerate(lines):
    t0, t1 = float(l['t0']), float(l['t1'])
    a = max(0.0, t0 - 0.12)
    b = t1 + 0.35
    if i + 1 < len(lines):
        b = min(b, float(lines[i + 1]['t0']) - 0.16)     # 不压到下一句
    b = min(b, float(data.get('duration', 1e9)))
    cues.append({'t0': round(a, 3), 't1': round(max(a + 0.8, b), 3), 'text': l['text']})

with io.open(out_cues, 'w', encoding='utf-8') as f:
    json.dump(cues, f, ensure_ascii=False, indent=1)


def ts(t):
    h = int(t // 3600); m = int((t % 3600) // 60); s = t % 60
    return ('%02d:%02d:%06.3f' % (h, m, s)).replace('.', ',')


with io.open(out_srt, 'w', encoding='utf-8-sig') as f:
    for i, c in enumerate(cues, 1):
        f.write('%d\n%s --> %s\n%s\n\n' % (i, ts(c['t0']), ts(c['t1']), c['text']))

print('[srt] %d cues -> %s, %s' % (len(cues), out_srt, out_cues))
