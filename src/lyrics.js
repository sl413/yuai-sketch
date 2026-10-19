// 字幕 cue（由 data/lyrics.json 生成；音频对齐结果先占位）
let data = { lines: [] };
try {
  const r = await fetch('data/lyrics.json');
  if (r.ok) data = await r.json();
} catch (e) { /* 允许缺失：先出画面测试 */ }
// 显示时间：稍微提前进入、尾巴留一点，但不和前一句重叠（字幕逐句淡入淡出）
const _lines = (data.lines || []).slice().sort((a, b) => a.t0 - b.t0);
export const CUES = _lines.map((l, i) => {
  const next = _lines[i + 1];
  const t0 = Math.max(0, l.t0 - .12);
  let t1 = l.t1 + .35;
  if (next) t1 = Math.min(t1, next.t0 - .16);
  return { id: l.id, t0: +t0.toFixed(3), t1: Math.max(t0 + .8, +t1.toFixed(3)), text: l.text, section: l.section };
});
export const LYRICS_META = data;
