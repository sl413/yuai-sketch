// 核心层：钢笔淡彩引擎的扩展 —— 相机、纸张、场景分层烘焙、素描构件、字幕、后期
// 基础笔触/水彩/人物/手写来自 engine.js（Lemo-Opuscar urban-sketch demo，OFL 风格引擎）
// 本文件的一切以确定性的方式工作：同样的 seed + t → 同样的画面。
import {
  INK, PAPER, clamp, lerp, ss, TAU, rng, n2, fbm, rgba, hex, mix3,
  penStroke, drawPen, wash, reserve, dab, ellipse, spline, rough,
} from './engine.js';
export * from './engine.js';

// ---------------- 调色板（雨 · 城 · 记忆） ----------------
export const PAL = {
  paper: PAPER,
  ink: INK,
  // 雨天：青灰 / 冷蓝
  grey: hex('#8fa3ae'), greyDeep: hex('#6c8290'), greyLight: hex('#b8c6cd'),
  blue: hex('#7f9fc4'), blueDeep: hex('#5d7fa8'), bluePale: hex('#c3d4e4'),
  // 暖：灯光 / 回忆
  lamp: hex('#e8c78a'), lampDeep: hex('#d9a95c'), warm: hex('#e9c9a8'), cream: hex('#f7efdf'),
  // 记忆里的淡粉
  pink: hex('#e8c3c0'), pinkPale: hex('#f2dcda'),
  // 结尾彩虹
  green: hex('#a8c3a0'), greenPale: hex('#cfe0c6'), orange: hex('#e8b98a'), violet: hex('#c9b8d6'), rainbow: hex('#cfe0e8'),
  // 城市
  stone: hex('#cbbba1'), stoneCool: hex('#b6b3ad'), brick: hex('#c19a7e'), glass: hex('#93aec4'),
  road: hex('#9fa9ad'), roadDeep: hex('#7d8b93'), puddle: hex('#b9cbd6'),
  // 人物
  skin: hex('#eec9ab'), knit: hex('#efe9dd'), coat: hex('#9fb0bd'), hair: hex('#7f5a42'), shoe: hex('#a98a6c'),
  him: hex('#6b7f8f'),
};

// ---------------- 缓动 / 工具 ----------------
export const eio = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const eo = t => 1 - Math.pow(1 - clamp(t), 3);
export const ei = t => Math.pow(clamp(t), 3);
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const pulse = (t, c, w) => Math.exp(-Math.pow((t - c) / w, 2));

// 手绘微晃（幅度极小）
export function handheld(t, amp = 1.6, seed = 3) {
  return [(n2(t * .9, seed, 1) - .5) * 2 * amp, (n2(t * .8, seed + 7, 2) - .5) * 2 * amp];
}

// ---------------- 相机 ----------------
// keys: [[t, [cx, cy, z], rot?], ...]；返回 t => {cx,cy,z,rot}
export function camTrack(keys) {
  const n = keys.length, T = keys.map(k => k[0]);
  const M = keys.map((k, i) => {
    if (k[3]) return k[3];
    const a = keys[Math.max(0, i - 1)], b = keys[Math.min(n - 1, i + 1)];
    const dt = b[0] - a[0] || 1;
    return [(b[1][0] - a[1][0]) / dt, (b[1][1] - a[1][1]) / dt, (b[1][2] - a[1][2]) / dt];
  });
  return t => {
    if (t <= T[0]) { const k = keys[0]; return { cx: k[1][0], cy: k[1][1], z: k[1][2], rot: k[2] ?? 0 }; }
    if (t >= T[n - 1]) { const k = keys[n - 1]; return { cx: k[1][0], cy: k[1][1], z: k[1][2], rot: k[2] ?? 0 }; }
    let i = 0; while (t > T[i + 1]) i++;
    const h = T[i + 1] - T[i], u = (t - T[i]) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const v = [0, 1, 2].map(j => h00 * keys[i][1][j] + h10 * h * M[i][j] + h01 * keys[i + 1][1][j] + h11 * h * M[i + 1][j]);
    const r0 = keys[i][2] ?? 0, r1 = keys[i + 1][2] ?? 0;
    return { cx: v[0], cy: v[1], z: v[2], rot: lerp(r0, r1, u) };
  };
}
export const CAM = { cx: 960, cy: 600, z: 1, rot: 0 };
// 固定 + 极慢推/拉/移 的简写
export function slowCam({ x = 960, y = 600, z0 = 1, dx = 0, dy = 0, z1 = z0, dur = 5, rot = 0 }) {
  return t => { const u = ss(seg(t, 0, dur)); return { cx: x + dx * u, cy: y + dy * u, z: lerp(z0, z1, u), rot }; };
}
// 把相机变换写进 ctx（视差 par：0 = 极远，1 = 前景）
export function setCam(ctx, c, par = 1, base, W = 1920, H = 1080) {
  const z = 1 + (c.z - 1) * par;
  const b = base || { x: W / 2, y: H / 2 };
  const cx = b.x + (c.cx - b.x) * par, cy = b.y + (c.cy - b.y) * par;
  const rot = (c.rot ?? 0) * par;
  const co = Math.cos(rot), si = Math.sin(rot);
  ctx.setTransform(z * co, z * si, -z * si, z * co,
    W / 2 - z * (co * cx - si * cy), H / 2 - z * (si * cx + co * cy));
}
// 某个相机参数下的页面可视矩形（世界坐标）
export function camView(c, W = 1920, H = 1080, pad = 1.08) {
  const z = c.z || 1;
  const w = W / z * pad, h = H / z * pad;
  return { x: c.cx - w / 2, y: c.cy - h / 2, w, h };
}

// ---------------- 纸张 ----------------
let _paperC = null, _toothC = null;
export function initPaper() {
  if (_paperC) return;
  // 大块晕染 + 冷压纸纹（低频 fbm；生成一次）
  const W = 2048, H = 1280;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const im = x.createImageData(W, H);
  const d = im.data;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const m = fbm(i * .0018, j * .0018, 11, 4) * .65 + fbm(i * .0071, j * .0071, 23, 3) * .35;
      const warm = fbm(i * .0007 + 9, j * .0007 + 4, 31, 2) - .5;
      const k = (j * W + i) * 4;
      d[k] = 245 - (m - .5) * 26 + warm * 10;
      d[k + 1] = 238 - (m - .5) * 24 + warm * 5;
      d[k + 2] = 222 - (m - .5) * 20 - warm * 6;
      d[k + 3] = 255;
    }
  }
  x.putImageData(im, 0, 0);
  // 细纤维
  const R = rng(77); x.globalAlpha = .05; x.strokeStyle = '#8d806c'; x.lineWidth = 1;
  for (let i = 0; i < 420; i++) {
    const px = R() * W, py = R() * H, a = R() * TAU, L = 10 + R() * 60;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L * .3); x.stroke();
  }
  _paperC = c;
  // 齿纹（网点噪声），乘法叠在全片上
  const T = 512, tc = document.createElement('canvas'); tc.width = tc.height = T;
  const tx = tc.getContext('2d'); const tim = tx.createImageData(T, T); const td = tim.data; const RR = rng(909);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const v = n2(i * .31, j * .31, 3) * .55 + n2(i * .07, j * .07, 5) * .45;
    const grain = 255 - Math.max(0, v - .52) * 60 - (RR() < .006 ? 26 : 0) - RR() * 6;
    const k = (j * T + i) * 4; td[k] = grain; td[k + 1] = grain * .998; td[k + 2] = grain * .99; td[k + 3] = 255;
  }
  tx.putImageData(tim, 0, 0);
  _toothC = tc;
}
// 底层纸张：奶白纸 + 大块晕染（随相机轻微位移，像在纸面上）
export function paperBase(ctx, cam = CAM, W = 1920, H = 1080) {
  initPaper();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = rgba(PAL.paper); ctx.fillRect(0, 0, W, H);
  const sc = 1.25;
  const ox = -(((cam.cx * .2) % 64) + 64) % 64, oy = -(((cam.cy * .2) % 64) + 64) % 64;
  ctx.setTransform(sc, 0, 0, sc, ox, oy);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .92;
  ctx.drawImage(_paperC, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
// 顶层纸张齿纹 + 呼吸的大块明暗（乘法）
export function paperTooth(ctx, cam = CAM, W = 1920, H = 1080) {
  initPaper();
  const p = ctx.createPattern(_toothC, 'repeat');
  ctx.setTransform(1, 0, 0, 1, (-cam.cx * .5) % 512 - 256, (-cam.cy * .5) % 512 - 256);
  ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = .55;
  ctx.fillStyle = p; ctx.fillRect(0, 0, W + 512, H + 512);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}
// 极淡的暗角 + 纸边空气（不是黑角，是冷灰）
export function vignette(ctx, amt = .2, W = 1920, H = 1080) {
  if (amt <= 0) return;
  const g = ctx.createRadialGradient(W / 2, H * .46, H * .32, W / 2, H * .5, H * .95);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, `rgba(96,104,110,${amt})`);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
}

// ---------------- 素描构件（把速写语言变成可复用的图元） ----------------
export const PEN = (o = {}) => ({ w: 2.1, wob: .95, over: 4.5, gap: .32, seed: 1, ...o });

// 一条折线 → 2~5 段带缺口/出头的速写线（点列数组）
export function runsOf(poly, o = {}) {
  const seed = o.seed ?? 1, R = rng(seed), closed = o.closed ?? false;
  const P = closed ? [...poly, poly[0]] : poly.slice();
  if (P.length < 2) return [P];
  const out = []; let i = 0;
  while (i < P.length - 1) {
    const n = Math.min(P.length - i - 1, 2 + Math.floor(R() * (o.maxRun ?? 7)));
    out.push(P.slice(i, i + n + 1)); i += n;
    if (R() < (o.gapChance ?? .45)) i += 1;   // 断笔
  }
  return out.filter(r => r.length > 1);
}
// 多边形轮廓 → 速写线段（不封口的闭合形）
export function polyRuns(poly, o = {}) { return runsOf(poly, { closed: true, seed: o.seed ?? 7, maxRun: 7, gapChance: .5, ...o }); }

// 手绘矩形：四条边各自带出头，角不闭合
export function boxRuns(x0, y0, x1, y1, seed = 3) {
  const R = rng(seed);
  const j = () => (R() - .5) * 4;
  const o = 3 + R() * 4;
  return [
    [[x0 - o, y0 + j()], [x1 + o * .6, y0 + j()]],
    [[x1 + j(), y0 - o * .5], [x1 + j(), y1 + o]],
    [[x1 - o * .4, y1 + j()], [x0 - o, y1 + j()]],
    [[x0 + j(), y1 + o * .5], [x0 + j(), y0 - o]],
  ];
}

// 多边形内的排线：返回线段数组 [{a,b}]
export function hatchLines(poly, o = {}) {
  const ang = o.ang ?? Math.PI / 3, gap = o.gap ?? 9, seed = o.seed ?? 1;
  const R = rng(seed), ca = Math.cos(-ang), sa = Math.sin(-ang);
  const rp = poly.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
  let y0 = 1e9, y1 = -1e9;
  for (const p of rp) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const lines = [];
  for (let y = y0 + gap * .6; y < y1; y += gap) {
    const xs = [];
    for (let i = 0; i < rp.length; i++) {
      const a = rp[i], b = rp[(i + 1) % rp.length];
      if ((a[1] - y) * (b[1] - y) < 0) { const u = (y - a[1]) / (b[1] - a[1]); xs.push(a[0] + (b[0] - a[0]) * u); }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      if (R() < (o.thin ?? .25)) continue;
      const x0 = xs[k] + gap * .2 * R(), x1 = xs[k + 1] - gap * .2 * R();
      if (x1 - x0 < gap * .5) continue;
      const c = Math.cos(ang), s = Math.sin(ang);
      lines.push({ a: [x0 * c - y * s, x0 * s + y * c], b: [x1 * c - y * s, x1 * s + y * c] });
    }
  }
  return lines;
}

// ---------------- 场景：分层 + 铅笔线逐帧生长 + 完成即烘焙 ----------------
export class Scene {
  constructor(o = {}) {
    this.w = o.w ?? 1920; this.h = o.h ?? 1080;
    this.base = o.base ?? { x: this.w / 2, y: this.h / 2 };
    this.layers = o.layers ?? [{ id: 'back', par: .45 }, { id: 'mid', par: .82 }, { id: 'front', par: 1 }];
    this.items = {}; this.dynItems = {};
    for (const L of this.layers) { this.items[L.id] = []; this.dynItems[L.id] = []; }
    this.baked = {};
    this.bakeAt = o.bakeAt ?? Infinity;
    this.cam = o.cam ?? (() => CAM);
    this.maxEnd = 0;
    this._built = false;
  }
  _L(id) { return this.layers.find(l => l.id === id) || this.layers[this.layers.length - 1]; }
  add(item, layer = 'mid') { item.layer = layer; item._dyn = false; this.items[layer].push(item); this.maxEnd = Math.max(this.maxEnd, (item.t0 ?? 0) + (item.dur ?? 0)); return item; }
  dyn(fn, layer = 'mid') { const d = { fn, layer }; this.dynItems[layer].push(d); return d; }
  // 墨线（点列）
  ink(pts, po = {}, tl = {}) { return this.add({ kind: 'ink', st: penStroke(pts, { ...PEN(), ...po }), t0: tl.t0 ?? 0, dur: tl.dur ?? .34, alpha: tl.alpha ?? 1, col: tl.col }, tl.layer ?? 'mid'); }
  // 带"墨水渗开"的墨线：先一层更宽的极淡墨晕，再压主笔
  ink2(pts, po = {}, tl = {}) {
    const halo = this.ink(pts, { ...po, w: (po.w ?? 2.1) * 2.4, wob: (po.wob ?? .95) * 1.5, over: (po.over ?? 4.5) * 1.2, gap: 0 }, { ...tl, alpha: (tl.alpha ?? 1) * .14, dur: (tl.dur ?? .34) * 1.4 });
    const line = this.ink(pts, po, tl);
    return [halo, line];
  }
  // 墨线（多边形轮廓，断成数笔）
  inkPoly(poly, po = {}, tl = {}) {
    const seed = po.seed ?? 5; const list = polyRuns(poly, { seed });
    return list.map((r, i) => this.ink(r, { ...po, seed: seed + i * 17 }, { ...tl, t0: (tl.t0 ?? 0) + (tl.stagger ?? .06) * i, dur: tl.dur ?? .3 }));
  }
  // 手绘矩形
  box(x0, y0, x1, y1, po = {}, tl = {}) { return boxRuns(x0, y0, x1, y1, po.seed ?? 7).map((r, i) => this.ink(r, { ...po }, { ...tl, t0: (tl.t0 ?? 0) + (tl.stagger ?? .05) * i })); }
  // 排线（暗部）
  hatch(poly, o = {}, tl = {}) {
    const lines = hatchLines(poly, o);
    return this.add({ kind: 'hatch', lines, clip: poly, t0: tl.t0 ?? 0, dur: tl.dur ?? .5, alpha: tl.alpha ?? .5, w: o.w ?? 1.2, seed: o.seed ?? 1 }, tl.layer ?? 'mid');
  }
  // 淡彩
  wash(poly, col, wo = {}, tl = {}) {
    const a = wo.a ?? .5, seed = wo.seed ?? 7, layers = wo.layers ?? 2, j = wo.j ?? 5;
    const polys = [];
    const seedR = rng(seed);
    for (let l = 0; l < layers; l++) {
      const off = wo.dx || wo.dy ? poly.map(p => [p[0] + (wo.dx ?? 0), p[1] + (wo.dy ?? 0)]) : poly;
      polys.push(rough(off, j * (1 + l * .3), seed + l * 31, Math.max(4, j * 1.3), wo.freq ?? .02));
    }
    return this.add({
      kind: 'wash', polys, col, a, t0: tl.t0 ?? 0, dur: tl.dur ?? .55, alpha: tl.alpha ?? 1,
      edge: wo.edge ?? .25, edgeW: wo.edgeW ?? 1.4, mode: 'multiply',
      speckle: wo.speckle ?? 0, speckCol: wo.speckCol, seed,
    }, tl.layer ?? 'mid');
  }
  // 平涂纸色（遮挡/留白）
  fill(poly, col = PAL.paper, tl = {}) { return this.add({ kind: 'fill', poly, col, t0: tl.t0 ?? 0, dur: tl.dur ?? 0, alpha: tl.alpha ?? 1, j: tl.j ?? 2, seed: tl.seed ?? 5 }, tl.layer ?? 'mid'); }
  // 静态即完成
  finish(at) { this.bakeAt = at ?? (this.maxEnd + .18); return this; }

  _bbox(layer) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const inc = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const it of this.items[layer]) {
      if (it.kind === 'ink') for (const p of it.st.P) inc(p[0], p[1]);
      else if (it.kind === 'wash' || it.kind === 'fill') for (const q of (it.polys || [it.poly])[0]) inc(q[0], q[1]);
      else if (it.kind === 'hatch') for (const q of it.clip) inc(q[0], q[1]);
    }
    if (x0 > x1) return { x: 0, y: 0, w: 1, h: 1 };
    const pad = layer === 'front' ? 24 : 40;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    return { x: Math.floor(x0), y: Math.floor(y0), w: Math.ceil(x1 - x0), h: Math.ceil(y1 - y0) };
  }
  _drawItem(ctx, it, p) {
    if (p <= 0) return;
    if (it.kind === 'fill') {
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = it.alpha;
      ctx.fillStyle = rgba(it.col); polyPath(ctx, it.j > 0 ? rough(it.poly, it.j, it.seed) : it.poly); ctx.fill(); ctx.restore();
    } else if (it.kind === 'wash') {
      ctx.save(); ctx.globalCompositeOperation = it.mode; ctx.globalAlpha = it.alpha;
      const n = it.polys.length;
      for (let l = 0; l < n; l++) {
        ctx.globalAlpha = it.alpha * it.a * clamp(p * 1.6 - l * .18);
        ctx.fillStyle = rgba(it.col);
        polyPath(ctx, it.polys[l]); ctx.fill();
        if (it.edge > 0) { ctx.globalAlpha = it.alpha * it.a * it.edge * p; ctx.strokeStyle = rgba(mix3(it.col, [60, 50, 40], .15)); ctx.lineWidth = it.edgeW; ctx.stroke(); }
      }
      // 颜料在纸纹里的深浅斑驳（水彩的"活"）
      if (it.speckle > 0 && p > .2) {
        const P0 = it.polys[0]; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const q of P0) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
        const RR = rng(it.seed + 77);
        ctx.globalCompositeOperation = it.mode; ctx.beginPath(); polyPath(ctx, P0); ctx.clip();
        for (let i = 0; i < it.speckle; i++) {
          const x = x0 + RR() * (x1 - x0), y = y0 + RR() * (y1 - y0);
          const col = it.speckCol && RR() < .35 ? it.speckCol : (RR() < .5 ? mix3(it.col, [90, 78, 66], .28) : mix3(it.col, [255, 255, 255], .3));
          ctx.globalAlpha = it.alpha * it.a * (.25 + RR() * .55) * p;
          dab(ctx, x, y, 6 + RR() * 26, RR() * TAU, col, .35 + RR() * .4, i + it.seed);
        }
      }
      ctx.restore();
    } else if (it.kind === 'ink') {
      ctx.save(); ctx.globalAlpha = it.alpha; drawPen(ctx, it.st, p, it.col ?? INK, 1); ctx.restore();
    } else if (it.kind === 'hatch') {
      ctx.save(); ctx.globalAlpha = it.alpha * clamp(p);
      ctx.beginPath(); polyPath(ctx, it.clip); ctx.clip();
      ctx.strokeStyle = rgba(INK, .8); ctx.lineCap = 'round';
      const n = it.lines.length, R = rng(it.seed);
      for (let i = 0; i < n; i++) {
        const q = i / n; if (q > p * 1.15) break;
        const L = it.lines[i];
        ctx.lineWidth = it.w * (.7 + R() * .6);
        ctx.beginPath(); ctx.moveTo(L.a[0], L.a[1]); ctx.lineTo(L.b[0], L.b[1]); ctx.stroke();
      }
      ctx.restore();
    }
  }
  _bake(layer) {
    const bb = this._bbox(layer);
    const c = document.createElement('canvas'); c.width = Math.max(2, bb.w); c.height = Math.max(2, bb.h);
    const x = c.getContext('2d');
    x.translate(-bb.x, -bb.y);
    for (const it of this.items[layer]) this._drawItem(x, it, 1);
    this.baked[layer] = { c, x: bb.x, y: bb.y };
  }
  draw(ctx, t, cam) {
    const bake = t >= this.bakeAt;
    if (bake) for (const L of this.layers) if (!this.baked[L.id]) this._bake(L.id);
    for (const L of this.layers) {
      setCam(ctx, cam, L.par, this.base);
      if (bake) { const b = this.baked[L.id]; ctx.globalAlpha = 1; ctx.drawImage(b.c, b.x, b.y); }
      else for (const it of this.items[L.id]) {
        const p = it.dur > 0 ? clamp((t - it.t0) / it.dur) : (t >= it.t0 ? 1 : 0);
        this._drawItem(ctx, it, p);
      }
      for (const d of this.dynItems[L.id]) d.fn(ctx, t, cam);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
export function polyPath(ctx, poly) {
  if (!poly || poly.length < 2) return; ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath();
}

// ---------------- 字幕（底部 12–15% 安全区，手写体，逐行淡入） ----------------
export const SUB = { font: '"Ma Shan Zheng"', latin: 'Caveat', size: 50, latinSize: 42, ink: '#2f2a23', y: 1004, maxW: 1460 };
export function drawSubtitle(ctx, cues, t, o = {}) {
  if (!cues || !cues.length) return;
  let cue = null;
  for (const c of cues) if (t >= c.t0 && t <= c.t1) { cue = c; break; }
  if (!cue) return;
  const aIn = clamp((t - (cue.t0 - .12)) / .38), aOut = clamp(((cue.t1 + .35) - t) / .3);
  const a = Math.min(eo(aIn), eo(aOut));
  if (a <= .01) return;
  const rise = (1 - eo(aIn)) * 5;
  const size = o.size ?? SUB.size, font = o.font ?? SUB.font, lat = o.latin ?? SUB.latin;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.font = `${size}px ${font}, ${lat}, "KaiTi", serif`;
  try { ctx.letterSpacing = '2px'; } catch (e) { /* 老浏览器忽略 */ }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const txt = cue.text;
  const w = ctx.measureText(txt).width;
  const y = (o.y ?? SUB.y) + rise;
  // 极淡奶油纸带（不遮雨线/主体）
  const bw = Math.min(SUB.maxW, w + 90), bh = size * 1.5;
  ctx.globalAlpha = .62 * a;
  const g = ctx.createLinearGradient(960 - bw / 2, 0, 960 + bw / 2, 0);
  g.addColorStop(0, 'rgba(247,239,223,0)'); g.addColorStop(.16, 'rgba(247,239,223,.85)');
  g.addColorStop(.84, 'rgba(247,239,223,.85)'); g.addColorStop(1, 'rgba(247,239,223,0)');
  ctx.fillStyle = g; ctx.fillRect(960 - bw / 2, y - size * 1.14, bw, bh);
  // 深灰墨色手写字（极轻的错位重影，像钢笔压过两次）
  ctx.globalAlpha = a; ctx.fillStyle = SUB.ink;
  ctx.fillText(txt, 960 + .6, y + .4);
  ctx.globalAlpha = a * .55; ctx.fillText(txt, 960 - .5, y - .3);
  ctx.restore();
}

// 手写字逐渐写出来（用于片名/角落注记，世界坐标）
export function handwriteCJK(ctx, text, x, y, size, p, o = {}) {
  if (p <= 0) return;
  const font = o.font ?? SUB.font;
  ctx.save();
  ctx.font = `${o.weight ?? 400} ${size}px ${font}, ${o.latin ?? SUB.latin}, "KaiTi", serif`;
  ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(text).width;
  const a = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  if (o.rot) { ctx.translate(a, y); ctx.rotate(o.rot); ctx.fillText(text, 0, 0); }
  else {
    ctx.beginPath(); ctx.rect(a - size, y - size * 1.35, (w + size) * clamp(p), size * 1.9); ctx.clip();
    ctx.fillStyle = rgba(o.col ?? INK, o.alpha ?? .95); ctx.fillText(text, a, y);
  }
  ctx.restore();
  return w;
}
