// 镜头表：唯一时间源。
// 分段边界以**音频实测**为准（audio-lyrics 的 data/sections-detected.json，BPM≈80）：
//   0 / 16.286 / 50.943 / 75.006 / 99.900 / 124.322 / 146.302 / 161.954 / 185.899 / 213.086 / 236.200 / 260.504
// 用户分镜的段落顺序与内容保留；段落内按标称镜头时长等比例缩放，保证整片 = 音频长度（6252 帧 = 260.5 s）。
import { Scene, PAL, clamp } from './core.js';
// 并行开发期：任何一组场景文件语法/加载出错，只让那一组镜头退化成空白纸面，不拖垮整页渲染。
async function loadGroup(path, tag) {
  try { const m = await import(path); return m.SCENES || {}; }
  catch (e) { console.warn('[shots] scene group failed:', tag, String(e && e.message || e).slice(0, 200)); return {}; }
}
const SC_LEAD = await loadGroup('./scenes/lead-window.js', 'lead-window');
const SC_ROOM = await loadGroup('./scenes/room.js', 'room');
const SC_STREET = await loadGroup('./scenes/street.js', 'street');
const SC_SKY = await loadGroup('./scenes/sky.js', 'sky');

export const FPS = 24;
export const DUR = 6252 / 24; // 260.5 s（音频实测 260.504 s）

// 音频段落（真实歌声结构）↔ 用户分镜内容
const SECS = [
  { name: '前奏', t0: 0.0, t1: 16.286, shots: [['1.1', 5], ['1.2', 5]] },
  { name: '主歌1', t0: 16.286, t1: 50.943, shots: [['2.1', 6], ['2.2', 6], ['2.3', 6], ['2.4', 6], ['2.5', 6]] },
  { name: '副歌1', t0: 50.943, t1: 75.006, shots: [['3.1', 6], ['3.2', 6], ['3.3', 6], ['3.4', 6], ['3.5', 6], ['3.6', 6]] },
  { name: '副歌1b', t0: 75.006, t1: 99.900, shots: [['5.1', 6], ['5.2', 6], ['5.3', 6], ['5.4', 6], ['5.5', 6], ['5.6', 6]] },
  { name: '间奏', t0: 99.900, t1: 124.322, shots: [['4.1', 8], ['4.2', 8]] },
  { name: '桥段', t0: 124.322, t1: 146.302, shots: [['4.3', 7], ['4.4', 7]] },
  { name: '主歌重复', t0: 146.302, t1: 161.954, shots: [['6.1', 8], ['6.2', 8], ['6.3', 7], ['6.4', 7]] },
  { name: '副歌B', t0: 161.954, t1: 185.899, shots: [['7.1', 6], ['7.2', 6], ['7.3', 5], ['7.4', 5], ['7.5', 5], ['7.6', 5]] },
  { name: '尾副歌', t0: 185.899, t1: 213.086, shots: [['8.1', 7], ['8.2', 7], ['8.3', 6], ['8.4', 6], ['8.5', 6], ['8.6', 6]] },
  { name: '终段副歌', t0: 213.086, t1: 236.200, shots: [['9.1', 8], ['9.2', 8]] },
  { name: '尾奏', t0: 236.200, t1: DUR, shots: [['9.3', 7], ['9.4', 7], ['9.5', 6]] },
];

export const REG = { ...SC_ROOM, ...SC_STREET, ...SC_SKY, ...SC_LEAD };

export function blankScene(cam) {
  const sc = new Scene({ w: 1920, h: 1080, layers: [{ id: 'mid', par: 1 }] });
  sc.fill([[0, 0], [1920, 0], [1920, 1080], [0, 1080]], PAL.paper, { layer: 'mid' });
  sc.finish(0.1);
  sc.cam = cam ?? (() => ({ cx: 960, cy: 540, z: 1, rot: 0 }));
  return sc;
}

const list = [];
for (const sec of SECS) {
  const sum = sec.shots.reduce((a, s) => a + s[1], 0);
  const k = (sec.t1 - sec.t0) / sum;
  let t = sec.t0;
  for (const [id, nominal] of sec.shots) {
    const d = nominal * k;
    list.push({ id, t0: +t.toFixed(6), dur: +d.toFixed(6), section: sec.name });
    t += d;
  }
}
export const SHOTS = list.map(s => ({
  ...s,
  make: () => { const f = REG[s.id]; return f ? f() : blankScene(); },
}));

export function shotAt(t) {
  for (const q of SHOTS) if (t >= q.t0 - 1e-6 && t < q.t0 + q.dur) return q;
  return null;
}
export function shotById(id) { return SHOTS.find(s => s.id === id); }
export { SECS };
