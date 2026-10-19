// 《雨爱》钢笔淡彩短片 —— 页面入口：确定性 render(t)
import {
  initPaper, paperBase, paperTooth, vignette, drawSubtitle, clamp, ss, seg, PAL, TAU, rng, rgba,
} from './src/core.js';
import { shotAt, SHOTS, DUR, FPS, blankScene, REG } from './src/shots.js';
import { CUES } from './src/lyrics.js';
import { spritesReady } from './src/sprites.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d', { alpha: false });
const W = 1920, H = 1080;
// 开发用：?shot=2.3 只渲这一个镜头（本地时间从 0 开始），?dur=20 只渲前 20 秒
const QS = new URLSearchParams(location.search);
const ONLY = QS.get('shot');
const CAP = parseFloat(QS.get('dur') || '0');
let onlyShot = ONLY ? SHOTS.find(s => s.id === ONLY) : null;
if (ONLY && !onlyShot && REG[ONLY]) onlyShot = { id: ONLY, t0: 0, dur: 6, section: 'dbg', make: REG[ONLY] };
if (ONLY && !onlyShot) console.warn('no such shot:', ONLY);

// 字体：先等页面上的 @font-face 就绪（缺字体时用系统楷体兜底，渲染不报错）
async function loadFonts() {
  const fams = ['"Ma Shan Zheng"', '"Zhi Mang Xing"', '"Long Cang"', 'Caveat', '"Reenie Beanie"', 'KaiTi'];
  await Promise.all(fams.map(f => document.fonts.load(`46px ${f}`).catch(() => {})));
  await document.fonts.ready;
}
await loadFonts();
await spritesReady;
initPaper();

// ---- 画面"呼吸"用的低分辨率缓冲（柔光/泛光） ----
const glowCv = document.createElement('canvas'); glowCv.width = 480; glowCv.height = 270;
const glowCtx = glowCv.getContext('2d');
// 细微的纸面墨点/纤维（乘在一层，让空白纸面不空）
let speckC = null;
function initSpeck() {
  if (speckC) return; const W2 = 1024, H2 = 1024;
  speckC = document.createElement('canvas'); speckC.width = W2; speckC.height = H2;
  const c = speckC.getContext('2d'); const R = rng(707);
  for (let i = 0; i < 1400; i++) {
    const x = R() * W2, y = R() * H2, l = 1 + R() * 2.6, a = R() * Math.PI;
    c.strokeStyle = `rgba(120,104,86,${.05 + R() * .12})`; c.lineWidth = .4 + R() * .8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  for (let i = 0; i < 700; i++) {
    const x = R() * W2, y = R() * H2;
    c.fillStyle = `rgba(146,128,104,${.04 + R() * .1})`;
    c.beginPath(); c.arc(x, y, .5 + R() * 1.4, 0, TAU); c.fill();
  }
}
initSpeck();
// 尘埃点：在光里慢慢浮（screen 合成，不抢主体）
const MOTES = [...Array(26)].map((_, i) => { const R = rng(31 + i); return { x: R(), y: R(), r: .8 + R() * 1.8, sp: .02 + R() * .06, ph: R() * 6, a: .1 + R() * .22 }; });
function drawMotes(t) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
  for (const m of MOTES) {
    const x = ((m.x + t * m.sp * .12) % 1) * 1920, y = ((m.y - t * m.sp * .05 + 1) % 1) * 1080 + Math.sin(t * .7 + m.ph) * 6;
    const a = m.a * (.6 + .4 * Math.sin(t * .9 + m.ph));
    ctx.fillStyle = `rgba(255,250,238,${a})`;
    ctx.beginPath(); ctx.arc(x, y, m.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// 泛光：把画面缩到 480×270 再放大叠加（水彩的柔光，不是数码辉光）
function drawBloom() {
  glowCtx.clearRect(0, 0, 480, 270);
  glowCtx.drawImage(cv, 0, 0, 480, 270);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .16;
  ctx.drawImage(glowCv, 0, 0, 1920, 1080);
  ctx.globalAlpha = .1; ctx.globalCompositeOperation = 'soft-light';
  ctx.drawImage(glowCv, 0, 0, 1920, 1080);
  ctx.restore();
}
// 纸面细点 + 一层偏冷偏暖的光（随镜头缓慢变化）
function drawSpecks(cam) {
  const p = ctx.createPattern(speckC, 'repeat');
  ctx.save(); ctx.setTransform(1, 0, 0, 1, (-cam.cx * .3) % 1024, (-cam.cy * .3) % 1024);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .5; ctx.fillStyle = p; ctx.fillRect(0, 0, 1920 + 1024, 1080 + 1024);
  ctx.restore();
}
function drawLightLeak(t) {
  const a = .05 + .02 * Math.sin(t * .21);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'soft-light';
  const g = ctx.createRadialGradient(1720, 90, 40, 1720, 120, 1200);
  g.addColorStop(0, `rgba(255,232,196,${a * 2.2})`); g.addColorStop(.5, `rgba(255,238,212,${a})`); g.addColorStop(1, 'rgba(255,238,212,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
  const g2 = ctx.createRadialGradient(160, 980, 40, 160, 1000, 1000);
  g2.addColorStop(0, `rgba(150,178,204,${a * 1.6})`); g2.addColorStop(1, 'rgba(150,178,204,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, 1920, 1080);
  ctx.restore();
}

// 场景缓存：视频渲染按帧顺序取，缓存当前 3 个镜头就够
const cache = new Map();
function sceneFor(shot) {
  let e = cache.get(shot.id);
  if (!e) {
    e = { sc: shot.make() };
    cache.set(shot.id, e);
    if (cache.size > 3) { const first = cache.keys().next().value; if (first !== shot.id) cache.delete(first); }
  }
  return e.sc;
}
function camOf(sc, lt) { return sc.cam ? sc.cam(lt) : { cx: 960, cy: 540, z: 1, rot: 0 }; }

// 切镜的"淡彩光点叠化"：在剪切点前后 0.42s 里，几团奶油色柔光缓缓涨开又散去，
// 把硬切藏进纸与颜料里（全片统一的转场语法之一）。
const CUTS = SHOTS.slice(1).map(s => s.t0);
const CUT_POINTS = CUTS.map(c => { const R = rng(Math.round(c * 1000)); return [...Array(9)].map(() => ({ x: R() * W, y: (R() * .82 + .02) * H, r: 90 + R() * 190, a: .5 + R() * .5, d: R() })); });
function cutBloom(t) {
  for (let ci = 0; ci < CUTS.length; ci++) {
    const c = CUTS[ci], half = .26, u = (t - (c - half)) / (half * 2);
    if (u <= 0 || u >= 1) continue;
    const a = Math.sin(u * Math.PI) * .55;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
    for (const p of CUT_POINTS[ci]) {
      const r = p.r * (.65 + u * 1.25 + p.d * .4), x = p.x, y = p.y - u * 20;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(250,245,233,${a * p.a})`);
      g.addColorStop(.55, `rgba(249,243,229,${a * p.a * .45})`);
      g.addColorStop(1, 'rgba(249,243,229,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
// 全片统一的调色：上方偏冷、下方偏暖，soft-light 把各镜头拉进同一个"清晨纸面"
function grade() {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(139,176,204,0.20)');
  g.addColorStop(.52, 'rgba(255,248,232,0.10)');
  g.addColorStop(1, 'rgba(232,190,148,0.16)');
  ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
// 片尾淡出到暖黑
function fadeEnvelope(t, total) {
  const fin = ss(seg(t, 0, .9));
  const fout = 1 - ss(seg(t, total - 2.6, total - .12));
  if (fin < 1) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(245,238,222,${1 - fin})`; ctx.fillRect(0, 0, W, H); }
  if (fout < 1) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(24,21,18,${1 - fout})`; ctx.fillRect(0, 0, W, H); }
}

window.DUR = onlyShot ? onlyShot.dur : (CAP > 0 ? Math.min(CAP, DUR) : DUR);
window.render = (t) => {
  const total = window.DUR;
  t = clamp(t, 0, total);
  const shot = onlyShot || shotAt(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (!shot) { ctx.fillStyle = 'rgb(245,238,222)'; ctx.fillRect(0, 0, W, H); return; }
  const sc = sceneFor(shot);
  const lt = onlyShot ? t : clamp(t - shot.t0, 0, shot.dur - 1e-4);
  const cam = camOf(sc, lt);
  paperBase(ctx, cam, W, H);
  sc.draw(ctx, lt, cam);
  drawBloom();
  grade();
  drawSpecks(cam);
  drawMotes(t);
  drawLightLeak(t);
  if (!onlyShot) cutBloom(t);
  paperTooth(ctx, cam, W, H);
  vignette(ctx, 0.20, W, H);
  if (!onlyShot) fadeEnvelope(t, total);
  drawSubtitle(ctx, CUES, onlyShot ? t + onlyShot.t0 : t);
};

// 字幕由 .srt 检查（readcheck 不查字幕）
window.TEXTS = () => [];
window.READY = true;
