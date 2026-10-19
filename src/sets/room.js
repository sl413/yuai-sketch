// 室内戏：房间速写页 —— 墙 / 窗（雨） / 地板 / 沙发与旧物 / 行李箱 / 抽屉 / 窗台
// 一个可参数化的「速写页」，roomSet(opts) 返回 Scene，支持三种取景：
//   view:'room'   公寓房间（2.3 / 5.1 / 6.1 / 7.3）
//   view:'drawer' 抽屉特写（5.3）
//   view:'sill'   窗台特写（5.2 / 8.4 / 8.6）
// 全部确定性：seed + t 决定画面；每个元素有 t0/dur（墨线生长、淡彩晕开）。
import {
  Scene, PAL, PEN, camTrack, slowCam, ss, seg, clamp, lerp, TAU, rng, n2, fbm,
  hex, mix3, rgba, ellipse, spline, hatchLines, rough, penStroke, drawPen, wash,
  projector, polyPath, INK, PAPER,
} from '../core.js';
import { makeRain, makeGlassDrops, makeFog, glow, bokeh, airVeil, breathFog } from '../fx.js';
import { herSitFloor, herKneel, herStand, drawGirl, handClose, LOOK_HER } from '../character.js';

// 共享 character.js 的 LOOK_HER 缺 `bottom` 字段，figure() 画到腿部时会 mix3(undefined,…) 崩掉。
// 这里在运行时补上（不改共享文件），并已发消息给 lead 说明。
if (!LOOK_HER.bottom) LOOK_HER.bottom = mix3(PAL.coat, PAL.greyDeep, .42);

// ---------------- 房间几何（页面坐标 1920×1080） ----------------
export const ROOM = {
  floorY: 752,
  win: { x0: 1232, y0: 96, x1: 1738, y1: 646, fw: 18, mull: 1485, trans: 380 },
  lamp: { x: 116, shadeY: 356, shadeW: 78, baseY: 872 },
  sofa: { x0: 228, x1: 954, top: 470, seatFront: 714, skirtBot: 800 },
  table: { x0: 1352, x1: 1576, topY: 708, botY: 858 },
  caseC: { cx: 1046, baseY: 878, w: 332, h: 132, depth: 68 },
};

// ---------------- 小工具 ----------------
const PAP = [252, 249, 241];
const PAP2 = [253, 251, 244];
const shift = (poly, dx, dy) => poly.map(p => [p[0] + dx, p[1] + dy]);
const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
function rectPts(x, y, w, h, ang = 0) {
  const cx = x + w / 2, cy = y + h / 2, c = Math.cos(ang), s = Math.sin(ang);
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => {
    const dx = px - cx, dy = py - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}
// 四边形双线性插值（用于透视面里的内容/木纹）
function quadMap(q, u, v) { const a = lerpP(q[0], q[1], u), b = lerpP(q[3], q[2], u); return lerpP(a, b, v); }
// 手绘闭合轮廓：点列 → 平滑闭合多边形
const loop = (pts, n = 5) => spline(pts, n, true);

// 常用「速写构件」的薄封装
function F(sc, poly, col, layer, t0 = 0, j = 0, seed = 5, alpha = 1) {
  // 兼容两种调用：F(sc, poly, col, 'mid', t0, j, seed, alpha) 或 F(sc, poly, col, { layer, t0, j, seed, alpha })
  if (typeof layer === 'object' && layer !== null) { const o = layer; layer = o.layer ?? 'mid'; t0 = o.t0 ?? 0; j = o.j ?? 0; seed = o.seed ?? 5; alpha = o.alpha ?? 1; }
  return sc.fill(poly, col, { layer, t0, dur: 0, j, seed, alpha });
}
function Wsh(sc, poly, col, wo, layer, t0, dur, alpha = 1) {
  return sc.wash(poly, col, wo, { layer, t0, dur, alpha });
}
function Ink(sc, pts, po, layer, t0, dur, alpha = 1) {
  return sc.ink(pts, po, { layer, t0, dur, alpha });
}
function InkPoly(sc, poly, po, layer, t0, dur, stagger = .06, alpha = 1) {
  return sc.inkPoly(poly, po, { layer, t0, dur, stagger, alpha });
}
// 手绘矩形（四条边各自成笔，不圆角）
function inkQuad(sc, q, po, layer, t0, dur = .5, stagger = .07, alpha = 1) {
  for (let i = 0; i < 4; i++) {
    Ink(sc, [q[i], q[(i + 1) % 4]], { ...po, seed: (po.seed ?? 5) + i * 13 }, layer, t0 + i * stagger, dur, alpha);
  }
}

// ---------------- 道具：手写信（矢量「图元」，可静态也可动态拿在手里） ----------------
// 返回 parts：按绘制顺序的 {t:'fill'|'wash'|'ink', ...}（局部坐标 0..w, 0..h）
export function letterParts(w = 300, h = 112, seed = 901, o = {}) {
  const R = rng(seed), parts = [];
  const Q = [[3, 8], [w - 2, 0], [w + 2, h - 7], [0, h]];
  parts.push({ t: 'fill', poly: shift(Q, 13, 22), col: mix3(PAL.grey, PAL.cream, .45), a: .16 });   // 纸影
  parts.push({ t: 'fill', poly: Q, col: [253, 251, 244] });
  parts.push({ t: 'wash', poly: Q, col: mix3(PAL.cream, PAL.pinkPale, .32), a: .17, j: 7, layers: 2, edge: .18, seed: seed + 1 });
  // 边缘墨线（断笔、出头、不封口）
  const edge = (a, b, s) => { const st = penStroke([a, b], { w: 1.5 + R() * .35, wob: .8, over: 4 + R() * 3, seed: seed + s, gap: .45 }); parts.push({ t: 'ink', st, alpha: .82 }); };
  edge(Q[0], Q[1], 10); edge(Q[1], Q[2], 11); edge(Q[2], Q[3], 12); edge(Q[3], Q[0], 13);
  // 折痕（两道）
  parts.push({ t: 'ink', st: penStroke([[w * .52, 4], [w * .52 + 3, h * .5], [w * .52 - 2, h - 4]], { w: .95, wob: .55, over: 2, gap: .55, seed: seed + 20 }), alpha: .42 });
  parts.push({ t: 'ink', st: penStroke([[4, h * .44], [w * .4, h * .43], [w - 4, h * .42]], { w: .9, wob: .5, over: 2, gap: .6, seed: seed + 21 }), alpha: .36 });
  // 右上角微卷
  const curl = [[w - 46, 6], [w - 6, 1], [w + 3, 26], [w - 22, 24]];
  parts.push({ t: 'fill', poly: curl, col: [255, 253, 247], a: .85 });
  parts.push({ t: 'wash', poly: curl, col: mix3(PAL.cream, PAL.greyLight, .45), a: .3, j: 2, layers: 1, edge: .3, seed: seed + 30 });
  parts.push({ t: 'ink', st: penStroke(curl, { w: 1.1, wob: .35, over: 2, gap: .2, seed: seed + 31 }), alpha: .72 });
  // 信上的字迹：几行墨线的暗示（不是文字）
  for (let i = 0; i < 5; i++) {
    const yy = h * .22 + i * h * .135, x0 = w * .06 + (i % 2) * w * .035, x1 = w * (.86 - (i === 4 ? .3 : 0)) - i * w * .012;
    const pts = [];
    for (let k = 0; k <= 9; k++) pts.push([lerp(x0, x1, k / 9), yy + Math.sin(k * 2.7 + i * 1.3) * 1.5 + (k % 3 === 0 ? -1.2 : 0)]);
    parts.push({ t: 'ink', st: penStroke(pts, { w: .8, wob: .5, over: .5, gap: .55, seed: seed + 40 + i }), alpha: .44 });
  }
  // 湿气沿下缘晕开
  if (o.damp) parts.push({ t: 'wash', poly: [[2, h - 26], [w - 4, h - 22], [w + 3, h - 2], [-2, h + 1]], col: mix3(PAL.grey, PAL.bluePale, .5), a: .16, j: 6, layers: 1, edge: .12, seed: seed + 60 });
  if (o.stamp) parts.push({ t: 'wash', poly: ellipse(w * .82, h * .74, 16, 13, 10), col: PAL.pink, a: .18, j: 3, layers: 1, edge: .2, seed: seed + 70 });
  return parts;
}

// ---------------- 道具：旧照片 ----------------
export function photoParts(w = 210, h = 150, seed = 980, o = {}) {
  const R = rng(seed), parts = [];
  const Q = [[2, 4], [w - 3, 0], [w, h - 3], [0, h]];
  parts.push({ t: 'fill', poly: shift(Q, 11, 15), col: mix3(PAL.grey, PAL.cream, .4), a: .15 });
  parts.push({ t: 'fill', poly: Q, col: [253, 250, 242] });
  parts.push({ t: 'wash', poly: Q, col: mix3(PAL.cream, PAL.greyLight, .35), a: .12, j: 5, layers: 1, edge: .2, seed: seed + 1 });
  // 照片画面：内框
  const b = w * .075, inner = [[Q[0][0] + b, Q[0][1] + b], [Q[1][0] - b, Q[1][1] + b], [Q[2][0] - b, Q[2][1] - b], [Q[3][0] + b, Q[3][1] - b]];
  parts.push({ t: 'wash', poly: inner, col: mix3(PAL.bluePale, PAL.stoneCool, .45), a: .3, j: 7, layers: 2, edge: .1, seed: seed + 2 });
  const big = o.near ? 1.0 : .82;
  // 照片里：一条淡的地平线，两个站在一起的人（只有淡彩团 + 极少的线）
  parts.push({ t: 'wash', poly: [[inner[0][0], h * .52], [inner[1][0], h * .5], [inner[2][0], h * .56], [inner[3][0], h * .58]], col: mix3(PAL.cream, PAL.greenPale ?? PAL.greyLight, .4), a: .22, j: 6, layers: 1, edge: 0, seed: seed + 3 });
  const figs = [
    { cx: w * .40, cy: h * .42, s: 1.0, coat: mix3(PAL.warm, PAL.cream, .35), hair: mix3(PAL.hair, PAL.cream, .35) },
    { cx: w * .60, cy: h * .44, s: .94, coat: mix3(PAL.pinkPale, PAL.cream, .3), hair: mix3(PAL.hair, PAL.pinkPale, .3) },
  ];
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i], hr = w * .062 * big * f.s, hy = f.cy - h * .12 * f.s;
    // 肩 / 上半身
    parts.push({ t: 'wash', poly: loop([[f.cx - w * .14 * f.s, h * .92], [f.cx - w * .12 * f.s, f.cy + h * .02], [f.cx - w * .03 * f.s, f.cy - h * .04], [f.cx + w * .04 * f.s, f.cy - h * .04], [f.cx + w * .12 * f.s, f.cy + h * .03], [f.cx + w * .14 * f.s, h * .92]], 3), col: f.coat, a: .42, j: 7 * big, layers: 2, edge: .1, seed: seed + 4 + i * 3 });
    // 头 + 头发（头发只是覆在头顶的一团，脸留出来）
    parts.push({ t: 'wash', poly: ellipse(f.cx, hy, hr, hr * 1.12, 16), col: mix3(PAL.skin, PAL.cream, .2), a: .55, j: 4 * big, layers: 2, edge: .1, seed: seed + 5 + i * 3 });
    parts.push({ t: 'wash', poly: loop([[f.cx - hr * 1.02, hy - hr * .1], [f.cx - hr * .6, hy - hr * 1.05], [f.cx + hr * .6, hy - hr * 1.05], [f.cx + hr * 1.02, hy - hr * .1], [f.cx + hr * .72, hy - hr * .42], [f.cx - hr * .72, hy - hr * .42]], 3), col: f.hair, a: .55, j: 4 * big, layers: 2, edge: .1, seed: seed + 6 + i * 3 });
    // 柔焦里的两点眼 + 一点笑（不要清楚，只是形）
    for (const sgn of [-1, 1]) parts.push({ t: 'ink', st: penStroke([[f.cx + sgn * hr * .42 - hr * .12, hy - hr * .04], [f.cx + sgn * hr * .42, hy + hr * .02]], { w: .8, wob: .2, over: .3, seed: seed + 7 + i * 5 + sgn }), alpha: .32 });
    parts.push({ t: 'ink', st: penStroke([[f.cx - hr * .26, hy + hr * .5], [f.cx, hy + hr * .58], [f.cx + hr * .27, hy + hr * .48]], { w: .75, wob: .25, over: .3, seed: seed + 9 + i * 4 }), alpha: .3 });
    parts.push({ t: 'ink', st: penStroke([[f.cx - hr * .04, hy + hr * .12], [f.cx + hr * .02, hy + hr * .16]], { w: .6, wob: .15, over: .2, seed: seed + 11 + i * 4 }), alpha: .2 });
    // 照片里靠近边缘的柔光
    parts.push({ t: 'wash', poly: ellipse(f.cx, hy + h * .34, w * .15 * big, h * .26, 14), col: mix3(PAL.cream, PAL.warm, .3), a: .14, j: 8, layers: 1, edge: 0, seed: seed + 10 + i * 4 });
  }
  if (o.near) {
    // 近处：再压一层奶油雾，让笑颜更糊（但保留手指能对上的位置感）
    parts.push({ t: 'wash', poly: inner, col: [255, 253, 246], a: .16, j: 10, layers: 1, edge: 0, seed: seed + 20 });
  }
  // 老照片的折痕 / 白边
  parts.push({ t: 'ink', st: penStroke([[w * .2, 6], [w * .28, h * .5], [w * .24, h - 6]], { w: .75, wob: .4, over: 2, gap: .6, seed: seed + 10 }), alpha: .3 });
  parts.push({ t: 'ink', st: penStroke([[Q[0][0] + b * .5, Q[0][1] + 4], [Q[3][0] + b * .5, Q[3][1] - 6]], { w: .8, wob: .4, over: 2, gap: .5, seed: seed + 11 }), alpha: .25 });
  if (o.damp) parts.push({ t: 'wash', poly: [[0, h - 18], [w * .7, h - 14], [w, h - 2], [0, h + 2]], col: mix3(PAL.grey, PAL.bluePale, .5), a: .15, j: 5, layers: 1, edge: .1, seed: seed + 12 });
  return parts;
}

// 把 parts 画进 canvas（动态用）；tf: ([x,y])=>[X,Y]（只做平移旋转，保持尺度）
const mapPoly = (poly, tf) => poly.map(tf);
function mapStroke(st, tf) { return { ...st, P: st.P.map(tf) }; }
export function drawParts(ctx, parts, tf, alpha = 1, prog = 1) {
  for (const p of parts) {
    if (p.t === 'fill') {
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = (p.a ?? 1) * alpha * clamp(prog * 3);
      ctx.fillStyle = rgba(p.col); polyPath(ctx, mapPoly(p.poly, tf)); ctx.fill(); ctx.restore();
    } else if (p.t === 'wash') {
      ctx.save(); ctx.globalAlpha = alpha;
      wash(ctx, mapPoly(p.poly, tf), p.col, { a: p.a * clamp(prog * 1.5), j: p.j, layers: p.layers, edge: p.edge, seed: p.seed });
      ctx.restore();
    } else if (p.t === 'ink') {
      drawPen(ctx, mapStroke(p.st, tf), prog, INK, (p.alpha ?? 1) * alpha);
    }
  }
}
// 把 parts 作为静态元素加进 Scene：tf 同上，时间按 part 顺序错开生长
export function addParts(sc, parts, tf, layer, at, f0 = 0, span = .7, alpha = 1) {
  const n = parts.length;
  parts.forEach((p, i) => {
    const t0 = at(f0 + (i / n) * span * .85), dur = Math.max(.12, span * .35 / n * 3);
    if (p.t === 'fill') sc.fill(mapPoly(p.poly, tf), p.col, { layer, t0, dur: 0, j: 0, seed: p.seed ?? 5, alpha: (p.a ?? 1) * alpha });
    else if (p.t === 'wash') sc.wash(mapPoly(p.poly, tf), p.col, { a: p.a, j: p.j, layers: p.layers, edge: p.edge, seed: p.seed }, { layer, t0, dur, alpha });
    else if (p.t === 'ink') sc.add({ kind: 'ink', st: mapStroke(p.st, tf), t0, dur, alpha: (p.alpha ?? 1) * alpha, col: p.col }, layer);
  });
}

// ---------------- 近景手（素描手：掌心 + 四指 + 拇指，可指向任意方向） ----------------
// 局部坐标：掌心中心为原点，手指朝 +x；ang 为手指指向角
export function handSketch(ctx, x, y, s, ang, o = {}) {
  // 统一用 character.js 的简笔手：掌 + 圆头手指 + 拇指，不再画"魔爪"
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  handClose(ctx, x, y, s * 1.02, ang + Math.PI / 2, { seed: o.seed, curled: o.curl });
  ctx.restore();
}
// 前臂 / 袖口：从画面外伸进来（简单锥形 + 袖口线）
export function forearmSketch(ctx, from, to, w1, w2, o = {}) {
  const dx = from[0] - to[0], dy = from[1] - to[1], dl = Math.hypot(dx, dy) || 1, nx = -dy / dl, ny = dx / dl;
  const band = [[to[0] + nx * w1, to[1] + ny * w1], [from[0] + nx * w2, from[1] + ny * w2], [from[0] - nx * w2, from[1] - ny * w2], [to[0] - nx * w1, to[1] - ny * w1]];
  const a = o.alpha ?? 1;
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(PAP, .96 * a); polyPath(ctx, band); ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalAlpha = a; wash(ctx, band, o.col ?? mix3(PAL.coat, PAL.cream, .4), { a: .3, j: 7, layers: 2, edge: .25, seed: 511 }); ctx.restore();
  ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = rgba(INK, .65); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(band[0][0], band[0][1]); ctx.lineTo(band[1][0], band[1][1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(band[3][0], band[3][1]); ctx.lineTo(band[2][0], band[2][1]); ctx.stroke();
  // 袖子的针织竖纹（沿手臂方向）+ 袖口
  for (let i = -1; i <= 2; i++) {
    const off = i * w1 * .5;
    ctx.strokeStyle = rgba(INK, .16); ctx.lineWidth = 1.0;
    ctx.beginPath(); ctx.moveTo(to[0] + nx * off, to[1] + ny * off); ctx.lineTo(from[0] + nx * off * 1.35, from[1] + ny * off * 1.35); ctx.stroke();
  }
  { // 袖口：靠手腕的一段更暗 + 两道罗纹
    const c0 = lerpP(to, from, .05), c1 = lerpP(to, from, .17);
    const cw0 = [c0[0] + nx * w1, c0[1] + ny * w1], cw1 = [c0[0] - nx * w1, c0[1] - ny * w1];
    const cw2 = [c1[0] + nx * (w1 * 1.02), c1[1] + ny * (w1 * 1.02)], cw3 = [c1[0] - nx * w1 * 1.02, c1[1] - ny * w1 * 1.02];
    wash(ctx, [cw0, cw2, cw3, cw1], mix3(INK, PAL.coat, .5), { a: .12, j: 2, layers: 1, edge: .2, seed: 512 });
    ctx.strokeStyle = rgba(INK, .35); ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(cw2[0], cw2[1]); ctx.lineTo(cw3[0], cw3[1]); ctx.stroke();
  }
  // 袖口的针织罗纹
  const cuff = lerpP(to, from, .1);
  for (let i = 0; i < 4; i++) {
    const u = .06 + i * .045;
    ctx.strokeStyle = rgba(INK, .3); ctx.lineWidth = .9;
    ctx.beginPath(); ctx.moveTo(lerpP(band[0], band[1], u)[0], lerpP(band[0], band[1], u)[1]); ctx.lineTo(lerpP(band[3], band[2], u)[0], lerpP(band[3], band[2], u)[1]); ctx.stroke();
  }
  ctx.restore();
}

// ---------------- 动态：杯口热气 / 湿气凝结 / 暖光斑点 / 彩虹光带 ----------------
export function steamFx(o = {}) {
  const R = rng(o.seed ?? 88), n = o.n ?? 7, wisps = [];
  for (let i = 0; i < n; i++) wisps.push({ dx: (R() - .5) * (o.w ?? 40), ph: R(), sp: .16 + R() * .12, amp: 6 + R() * 16, len: (o.h ?? 150) * (.6 + R() * .5), w: 2 + R() * 5, wob: R() * 6 });
  return (ctx, t, oo = {}) => {
    const gain = (oo.gain ?? 1) * clamp((t - (o.t0 ?? 0)) / (o.fadeIn ?? 1));
    if (gain <= .01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
    for (const p of wisps) {
      const u = ((t * p.sp + p.ph) % 1);
      const yy = (o.y ?? 600) - u * p.len;
      const xx = (o.x ?? 900) + p.dx + Math.sin(t * 1.15 + p.ph * 7) * p.amp * (.25 + u);
      const a = Math.sin(clamp(u / .8) * Math.PI) * .22 * gain * (1 - u * .3);
      ctx.strokeStyle = `rgba(255,253,247,${a})`;
      ctx.lineWidth = p.w * (1.15 - u * .3);
      ctx.beginPath();
      const x2 = xx + Math.sin(t * 1.6 + p.ph * 4) * 9 * u;
      const y2 = yy - 34;
      ctx.moveTo(xx, yy);
      ctx.quadraticCurveTo(xx + p.wob, (yy + y2) / 2, x2, y2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,254,250,${a * .6})`;
      ctx.beginPath(); ctx.arc(x2, y2, p.w * .9, 0, TAU); ctx.fill();
    }
    // 杯口上方的一团湿白气
    const g0 = ctx.createRadialGradient(o.x ?? 900, (o.y ?? 600) - 18, 2, o.x ?? 900, (o.y ?? 600) - 18, (o.w ?? 40) * .9);
    g0.addColorStop(0, `rgba(255,253,248,${.1 * gain})`); g0.addColorStop(1, 'rgba(255,253,248,0)');
    ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(o.x ?? 900, (o.y ?? 600) - 18, (o.w ?? 40) * .9, 0, TAU); ctx.fill();
    ctx.restore();
  };
}
// 空气里的暖色微尘（呼吸、缓慢漂）
export function moteFx(o = {}) {
  const R = rng(o.seed ?? 91), n = o.n ?? 26, pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: (o.x0 ?? 300) + R() * ((o.x1 ?? 1600) - (o.x0 ?? 300)), y: (o.y0 ?? 120) + R() * ((o.y1 ?? 800) - (o.y0 ?? 120)), r: .9 + R() * 2.4, sp: .1 + R() * .3, ph: R() * TAU, a: .12 + R() * .3 });
  return (ctx, t, oo = {}) => {
    const gain = oo.gain ?? 1;
    ctx.save();
    for (const p of pts) {
      const x = p.x + Math.sin(t * p.sp + p.ph) * 20;
      const y = p.y - ((t * (3 + p.sp * 8) + p.ph * 40) % 200) + 60;
      const tw = .55 + .45 * Math.sin(t * 1.4 + p.ph * 3);
      ctx.fillStyle = rgba(oo.col ?? mix3(PAL.lamp, [255, 252, 238], .35), p.a * tw * gain);
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
}
// 彩虹光带：极淡的透明色带落在纸面（乘法），一条条分开的光带，缓慢流动
export function rainbowFx(o = {}) {
  const COLS = [[196, 220, 186], [232, 200, 158], [240, 226, 172], [180, 210, 226], [200, 186, 220]];
  return (ctx, t, oo = {}) => {
    const u = clamp((t - (o.t0 ?? 0)) / ((o.t1 ?? 4) - (o.t0 ?? 0)));
    if (u <= 0) return;
    const gain = (oo.gain ?? 1) * u;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.translate(o.x ?? 960, o.y ?? 540); ctx.rotate(o.ang ?? -.4);
    const len = 2800, bw = o.bandW ?? 17, gap = o.gap ?? 32;
    for (let i = 0; i < COLS.length; i++) {
      const off = (i - (COLS.length - 1) / 2) * gap + Math.sin(t * .45 + i) * 5 * (o.shift ?? 1);
      const c = COLS[i];
      const a = (o.a ?? .16) * gain * (.82 + .18 * Math.sin(t * .85 + i * 1.4));
      if (a <= .003) continue;
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * .35})`;
      ctx.fillRect(-len / 2, off - bw * 1.8, len, bw * 3.6);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      ctx.fillRect(-len / 2, off - bw * .42, len, bw * .84);
    }
    ctx.restore();
  };
}
// 湿气/雾气：物件边缘的凝结（雾气缓慢漂 + 极低 alpha）
export function dampFx(o = {}) {
  const fog = makeFog({ seed: o.seed ?? 61, n: o.n ?? 12 });
  return (ctx, t, oo = {}) => {
    const gain = (oo.gain ?? 1) * (o.gain ?? 1);
    fog(ctx, t, o.x0 ?? 0, o.y0 ?? 0, (o.x1 ?? 1920) - (o.x0 ?? 0), (o.y1 ?? 1080) - (o.y0 ?? 0), { gain, col: o.col ?? [255, 253, 247] });
  };
}
// 水珠在光里闪：极小的白色高光点，时隐时现
export function glintFx(o = {}) {
  const R = rng(o.seed ?? 71), n = o.n ?? 18, pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: (o.x0 ?? 0) + R() * ((o.x1 ?? 1920) - (o.x0 ?? 0)), y: (o.y0 ?? 0) + R() * ((o.y1 ?? 1080) - (o.y0 ?? 0)), r: 1.2 + R() * 3.2, ph: R() * TAU, per: 1.4 + R() * 2.6 });
  return (ctx, t, oo = {}) => {
    const gain = oo.gain ?? 1; if (gain <= 0) return;
    ctx.save();
    for (const p of pts) {
      const u = ((t + p.ph) % p.per) / p.per;
      const a = Math.sin(u * Math.PI) ** 3 * .75 * gain;
      if (a < .02) continue;
      const rr = p.r * (.7 + .5 * Math.sin(u * Math.PI));
      ctx.fillStyle = `rgba(255,255,251,${a})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,251,${a * .5})`; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(p.x - rr * 2.2, p.y); ctx.lineTo(p.x + rr * 2.2, p.y);
      ctx.moveTo(p.x, p.y - rr * 2.2); ctx.lineTo(p.x, p.y + rr * 2.2); ctx.stroke();
    }
    ctx.restore();
  };
}

// ---------------- 人物：被画出来的过程（墨线 0→1 + 淡彩渐显）+ 呼吸 ----------------
export function herDyn(sc, o) {
  if (o.shadow !== false) {
    const p = o.place;
    Wsh(sc, ellipse(p.x, p.y - 8, (p.S ?? 420) * .19, (p.S ?? 420) * .035, 22), mix3(PAL.grey, PAL.cream, .35), { a: .18, j: 4, layers: 1, edge: 0, seed: o.seed ?? 41 }, 'mid', o.t0 ?? 0, .8);
  }
  sc.dyn((ctx, t) => {
    const u = clamp((t - (o.t0 ?? 0)) / (o.dur ?? 1.6));
    if (u <= 0) return;
    const pose = o.poseAt ? o.poseAt(t) : o.pose;
    const place = { ...o.place };
    place.y += Math.sin(t * 1.65 + .8) * 1.5 * (o.breathe ?? 1);      // 呼吸
    drawGirl(ctx, pose, place, {
      seed: o.seed ?? 31, boil: Math.floor(t * (o.boil ?? 12)),
      face: o.face, eyesOpen: o.eyesOpen, tear: o.tear,
      ink: clamp(u * 1.25), color: clamp((u - .18) / .7), knock: clamp((u - .1) / .55),
      alpha: o.alpha ?? 1,
    });
    if (o.face && u > .6) { /* 近景脸由 drawGirl 的 face 参数负责 */ }
  }, o.layer ?? 'mid');
}
// 一只手 + 袖口（手从画面外伸进来）：用于 5.2 / 8.4 / 8.6 / 2.3 的近景
export function handArmFx(sc, o) {
  sc.dyn((ctx, t) => {
    const st = o.at(t);
    if (!st || st.alpha <= 0) return;
    const s = st.s ?? 220, ang = st.ang ?? -.2;
    const wrist = [st.x - Math.cos(ang) * s * .3, st.y - Math.sin(ang) * s * .3];
    if (o.sleeve) {
      const from = o.sleeve.from(t) ?? [wrist[0] + 520, wrist[1] + 130];
      const dx = from[0] - wrist[0], dy = from[1] - wrist[1], dl = Math.hypot(dx, dy) || 1;
      const nx = -dy / dl, ny = dx / dl;
      const w1 = s * .3, w2 = s * .46;
      const band = [[wrist[0] + nx * w1, wrist[1] + ny * w1], [from[0] + nx * w2, from[1] + ny * w2], [from[0] - nx * w2, from[1] - ny * w2], [wrist[0] - nx * w1, wrist[1] - ny * w1]];
      ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(PAP, (st.alpha ?? 1) * .96);
      polyPath(ctx, band); ctx.fill();
      wash(ctx, band, o.sleeve.col ?? mix3(PAL.coat, PAL.cream, .35), { a: .3, j: 7, layers: 2, edge: .25, seed: 511 });
      ctx.strokeStyle = rgba(INK, .7 * (st.alpha ?? 1)); ctx.lineWidth = Math.max(1.1, s * .012); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(band[0][0], band[0][1]); ctx.lineTo(band[1][0], band[1][1]); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(band[3][0], band[3][1]); ctx.lineTo(band[2][0], band[2][1]); ctx.stroke();
      // 袖口的针织罗纹
      for (let i = 0; i < 4; i++) {
        const u = .07 + i * .05, a = lerpP(wrist, from, u), b = lerpP([wrist[0] - nx * w1, wrist[1] - ny * w1], [from[0] - nx * w2, from[1] - ny * w2], u);
        ctx.strokeStyle = rgba(INK, .3 * (st.alpha ?? 1)); ctx.lineWidth = .9;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      ctx.restore();
    }
    handClose(ctx, st.x, st.y, s, ang, { seed: o.seed ?? 3, curled: st.curl ?? .45 });
  }, o.layer ?? 'front');
}

// ---------------- 窗（雨天的玻璃 + 窗外城市） ----------------
function drawWindowBack(sc, o) {
  const Wn = ROOM.win, R = rng((o.seed ?? 11) + 7), at = o.at;
  const pad = 200;
  const sky = [[Wn.x0 - pad, Wn.y0 - pad], [Wn.x1 + pad, Wn.y0 - pad], [Wn.x1 + pad, Wn.y1 + pad], [Wn.x0 - pad, Wn.y1 + pad]];
  F(sc, sky, [252, 250, 243], 'back', 0, 0);
  // 雨天天空：青灰湿画（多叠两层，边缘不规则）
  Wsh(sc, sky, mix3(PAL.bluePale, PAL.greyLight, .25), { a: .42, j: 34, layers: 2, edge: 0, seed: 11, freq: .007 }, 'back', at(.02), 1.0);
  Wsh(sc, [[Wn.x0 - pad, Wn.y0 - pad], [Wn.x1 + pad, Wn.y0 - pad], [Wn.x1 + pad, 330], [Wn.x0 - pad, 360]], mix3(PAL.blue, PAL.bluePale, .45), { a: .2, j: 40, layers: 2, edge: 0, seed: 12, freq: .005 }, 'back', at(.06), 1.2);
  Wsh(sc, [[Wn.x0 - pad, 240], [Wn.x1 + pad, 200], [Wn.x1 + pad, 470], [Wn.x0 - pad, 500]], mix3(PAL.greyLight, PAL.cream, .45), { a: .16, j: 42, layers: 2, edge: 0, seed: 13, freq: .006 }, 'back', at(.1), 1.2);
  // 云：只是更深的湿灰横带（不画纸白团，免得像撕纸）
  for (let i = 0; i < 3; i++) {
    const cx = Wn.x0 + 60 + R() * (Wn.x1 - Wn.x0 - 120), cy = 150 + R() * 90, rx = 190 + R() * 130, ry = rx * (.16 + R() * .08);
    Wsh(sc, ellipse(cx, cy, rx, ry, 22), mix3(PAL.grey, PAL.bluePale, .45), { a: .09 + R() * .05, j: 40, layers: 2, edge: 0, seed: 210 + i, freq: .008 }, 'back', at(.08 + i * .03), 1.0);
  }
  // 远处的楼（湿、浅，但有墨线骨架）
  for (let i = 0; i < 7; i++) {
    const x = Wn.x0 + 16 + i * 74 + R() * 18, hw = 24 + R() * 32, top = 372 + R() * 120;
    const poly = [[x - hw, Wn.y1 + 130], [x - hw, top], [x + hw, top], [x + hw, Wn.y1 + 130]];
    F(sc, poly, [251, 248, 240], 'back', at(.1 + i * .02), 3, 300 + i);
    Wsh(sc, poly, mix3(PAL.stoneCool, PAL.bluePale, .5), { a: .32, j: 5, layers: 2, edge: .1, seed: 310 + i }, 'back', at(.12 + i * .02), .5);
    Wsh(sc, [[x - hw, top + 20], [x + hw, top + 16], [x + hw, Wn.y1 + 130], [x - hw, Wn.y1 + 130]], mix3(PAL.grey, PAL.bluePale, .5), { a: .14, j: 8, layers: 1, edge: 0, seed: 314 + i }, 'back', at(.16 + i * .02), .6);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) {
      const wx = x - hw + 7 + c * 20, wy = top + 16 + r * 28;
      if (R() < .3) Wsh(sc, [[wx, wy], [wx + 11, wy], [wx + 11, wy + 14], [wx, wy + 14]], mix3(PAL.lamp, PAL.cream, .25), { a: .45, j: 1, layers: 1, edge: 0, seed: 320 + i * 20 + r * 2 + c }, 'back', at(.16 + i * .02), .3);
      else Wsh(sc, [[wx, wy], [wx + 11, wy], [wx + 11, wy + 14], [wx, wy + 14]], mix3(PAL.greyDeep, PAL.bluePale, .5), { a: .2, j: 1, layers: 1, edge: 0, seed: 340 + i * 20 + r * 2 + c }, 'back', at(.16 + i * .02), .3);
      Ink(sc, [[wx, wy], [wx + 11, wy], [wx + 11, wy + 14], [wx, wy + 14]], { w: 1.0, wob: .3, seed: 330 + i * 20 + r * 2 + c, gap: .4 }, 'back', at(.16 + i * .02), .15, .6);
    }
    Ink(sc, [[x - hw, top], [x - hw, Wn.y1 + 60]], { w: 1.6, wob: .5, seed: 340 + i, over: 2 }, 'back', at(.14 + i * .02), .35, .7);
    Ink(sc, [[x - hw - 4, top], [x + hw + 4, top]], { w: 1.6, wob: .45, seed: 344 + i, over: 3 }, 'back', at(.16 + i * .02), .3, .7);
  }
  // 近一层：屋顶 / 树冠剪影（更深，压住天空）
  for (let i = 0; i < 5; i++) {
    const x = Wn.x0 + 10 + i * 108 + R() * 30, hw = 58 + R() * 46, top = 486 + R() * 70;
    const poly = [[x - hw, Wn.y1 + 90], [x - hw, top], [x - hw * .4, top - 16], [x + hw * .2, top - 8], [x + hw, top + 8], [x + hw, Wn.y1 + 90]];
    F(sc, poly, [251, 247, 238], 'back', at(.18 + i * .03), 2, 400 + i);
    Wsh(sc, poly, mix3(PAL.greyDeep, PAL.bluePale, .4), { a: .3, j: 6, layers: 2, edge: .15, seed: 410 + i }, 'back', at(.2 + i * .03), .5);
    Wsh(sc, poly, mix3(PAL.greyDeep, PAL.stone, .3), { a: .16, j: 10, layers: 1, edge: 0, seed: 414 + i }, 'back', at(.24 + i * .03), .6);
    Ink(sc, [[x - hw, top + 2], [x - hw * .4, top - 14], [x + hw * .2, top - 6], [x + hw, top + 8]], { w: 1.7, wob: .5, seed: 420 + i, over: 3 }, 'back', at(.22 + i * .03), .35, .7);
  }
  // 雨（窗外，动态）
  const rain = makeRain({ seed: (o.seed ?? 11) + 90, n: o.rainN ?? 260, w: Wn.x1 - Wn.x0 + 80, h: Wn.y1 - Wn.y0 + 80, slant: .3 });
  const lights = [];
  for (let i = 0; i < 6; i++) lights.push({ x: Wn.x0 + 40 + R() * (Wn.x1 - Wn.x0 - 80), y: 520 + R() * 90, r: 16 + R() * 24, a: .2 + R() * .24, col: R() < .6 ? PAL.lamp : PAL.pinkPale, rate: .7 + R() * .9, ph: R() * 6 });
  sc.dyn((ctx, t) => {
    ctx.save();
    ctx.beginPath(); polyPath(ctx, sky); ctx.clip();
    ctx.translate(Wn.x0 - 20, Wn.y0 - 20);
    rain(ctx, t, { w: Wn.x1 - Wn.x0 + 40, h: Wn.y1 - Wn.y0 + 40, alpha: (o.rain ?? 1) * 1.0 * clamp((t - .5) / 1.0), col: mix3(PAL.greyDeep, PAL.blue, .3) });
    bokeh(ctx, t, lights.map(p => ({ ...p, x: p.x - Wn.x0 + 20, y: p.y - Wn.y0 + 20 })), { gain: clamp((t - 1.1) / 1.4) * (o.bokeh ?? .8) });
    ctx.restore();
  }, 'back');
}
function drawWindowMid(sc, o) {
  const Wn = ROOM.win, at = o.at;
  const inner = { x0: Wn.x0 + Wn.fw, y0: Wn.y0 + Wn.fw, x1: Wn.x1 - Wn.fw, y1: Wn.y1 - Wn.fw };
  // 窗框四边的纸色（把窗洞外的城市盖住，边框是实心的）
  const bands = [
    [[Wn.x0, Wn.y0], [Wn.x1, Wn.y0], [Wn.x1, inner.y0], [Wn.x0, inner.y0]],
    [[Wn.x0, inner.y1], [Wn.x1, inner.y1], [Wn.x1, Wn.y1], [Wn.x0, Wn.y1]],
    [[Wn.x0, inner.y0], [inner.x0, inner.y0], [inner.x0, inner.y1], [Wn.x0, inner.y1]],
    [[inner.x1, inner.y0], [Wn.x1, inner.y0], [Wn.x1, inner.y1], [inner.x1, inner.y1]],
  ];
  for (const b of bands) F(sc, b, PAPER, 'mid', at(.95), 2, 735);
  for (const b of bands) Wsh(sc, b, mix3(PAL.cream, PAL.stoneCool, .35), { a: .34, j: 4, layers: 2, edge: .2, seed: 736 }, 'mid', at(1.0), .6);
  // 玻璃：淡淡一层，让窗外雨色蒙住
  const glass = [[inner.x0, inner.y0], [inner.x1, inner.y0], [inner.x1, inner.y1], [inner.x0, inner.y1]];
  Wsh(sc, glass, mix3(PAL.greyLight, PAL.bluePale, .6), { a: .16, j: 16, layers: 1, edge: 0, seed: 740 }, 'mid', at(1.12), .9);
  // 窗格：竖中梃 + 横档 + 玻璃反光
  const panes = [
    [[inner.x0, inner.y0], [Wn.mull - 7, inner.y0], [Wn.mull - 7, Wn.trans - 6], [inner.x0, Wn.trans - 6]],
    [[Wn.mull + 7, inner.y0], [inner.x1, inner.y0], [inner.x1, Wn.trans - 6], [Wn.mull + 7, Wn.trans - 6]],
    [[inner.x0, Wn.trans + 6], [Wn.mull - 7, Wn.trans + 6], [Wn.mull - 7, inner.y1], [inner.x0, inner.y1]],
    [[Wn.mull + 7, Wn.trans + 6], [inner.x1, Wn.trans + 6], [inner.x1, inner.y1], [Wn.mull + 7, inner.y1]],
  ];
  panes.forEach((p, i) => Wsh(sc, p, mix3(PAL.greyLight, PAL.bluePale, .5), { a: .12, j: 14, layers: 1, edge: 0, seed: 750 + i }, 'mid', at(1.16 + i * .03), .8));
  // 斜的玻璃反光（留白）
  F(sc, [[inner.x0 + 40, inner.y1], [inner.x0 + 128, inner.y1], [inner.x0 + 366, inner.y0], [inner.x0 + 286, inner.y0]], [255, 254, 250], 'mid', at(1.32), 12, 751, .42);
  Ink(sc, [[inner.x1 - 60, inner.y0 + 14], [inner.x1 - 230, inner.y1 - 20]], { w: 1.2, wob: .8, seed: 752, over: 5, gap: .7 }, 'mid', at(1.42), .5, .4);
  // 中梃 / 横档（纸色 + 淡彩 + 双线）
  const bars = [
    [[Wn.mull - 7, inner.y0], [Wn.mull + 7, inner.y0], [Wn.mull + 7, inner.y1], [Wn.mull - 7, inner.y1]],
    [[inner.x0, Wn.trans - 6], [inner.x1, Wn.trans - 6], [inner.x1, Wn.trans + 6], [inner.x0, Wn.trans + 6]],
  ];
  for (const b of bars) { F(sc, b, PAPER, 'mid', at(1.08)); Wsh(sc, b, mix3(PAL.cream, PAL.stoneCool, .4), { a: .3, j: 2, layers: 1, edge: 0, seed: 760 }, 'mid', at(1.1), .4); }
  Ink(sc, [[Wn.mull - 7, inner.y0], [Wn.mull - 6, inner.y1]], { w: 2.3, wob: .7, seed: 762, over: 4 }, 'mid', at(1.22), .5);
  Ink(sc, [[Wn.mull + 7, inner.y0], [Wn.mull + 6, inner.y1]], { w: 2.4, wob: .7, seed: 763, over: 4 }, 'mid', at(1.25), .5);
  Ink(sc, [[Wn.mull + 8, inner.y0 + 30], [Wn.mull + 8, inner.y1 - 20]], { w: 1.1, wob: .5, seed: 766, over: 2, gap: .5 }, 'mid', at(1.34), .4, .5);
  Ink(sc, [[inner.x0, Wn.trans - 6], [inner.x1, Wn.trans - 5]], { w: 2.1, wob: .6, seed: 764, over: 4 }, 'mid', at(1.28), .45);
  Ink(sc, [[inner.x1, Wn.trans + 6], [inner.x0, Wn.trans + 7]], { w: 2.1, wob: .6, seed: 765, over: 4 }, 'mid', at(1.31), .45);
  Ink(sc, [[inner.x0 + 20, Wn.trans + 8], [inner.x1 - 30, Wn.trans + 8]], { w: 1.0, wob: .5, seed: 767, over: 3, gap: .5 }, 'mid', at(1.38), .4, .5);
  // 玻璃水珠（动态，只在四格里）
  const glassX0 = inner.x0 + 6, glassX1 = inner.x1 - 6;
  const drops = makeGlassDrops({ seed: (o.seed ?? 11) + 200, n: o.dropN ?? 30, x0: glassX0, x1: glassX1, y0: inner.y0 + 20, y1: inner.y1 - 8, bornSpan: 2.6, slideMin: 1.4, slideMax: 4.2, minR: 2.4, maxR: 7.5 });
  const drops2 = makeGlassDrops({ seed: (o.seed ?? 11) + 201, n: Math.round((o.dropN ?? 30) * .5), x0: glassX0 + 40, x1: glassX1 - 40, y0: inner.y0 + 60, y1: inner.y1 - 12, bornSpan: 3.4, slideMin: 2.4, slideMax: 5.0, minR: 1.6, maxR: 4.5 });
  sc.dyn((ctx, t) => {
    ctx.save();
    for (const p of panes) { ctx.beginPath(); ctx.rect(p[0][0], p[0][1], p[1][0] - p[0][0], p[2][1] - p[0][1]); ctx.clip(); }
    drops(ctx, t, { gain: 1, alpha: clamp((t - .9) / 1.3) });
    drops2(ctx, t, { gain: .8, alpha: clamp((t - 1.3) / 1.5) });
    ctx.restore();
  }, 'mid');
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.beginPath(); ctx.rect(inner.x0, inner.y0, inner.x1 - inner.x0, inner.y1 - inner.y0); ctx.clip();
    const fog = makeFog({ seed: (o.seed ?? 11) + 210, n: 7 });
    fog(ctx, t, inner.x0, inner.y0, inner.x1 - inner.x0, inner.y1 - inner.y0, { gain: clamp((t - 1.2) / 2.2) * .6 * (o.glassFog ?? 1), col: [255, 253, 246] });
    ctx.restore();
  }, 'mid');
  // 窗框（外框 + 内沿双线），画在玻璃前面
  const fr = (x0, y0, x1, y1, s) => {
    Ink(sc, [[x0 - 7, y0], [x1 + 6, y0 - 2]], { w: 3.6, wob: .8, seed: s, over: 8 }, 'mid', at(1.0), .6);
    Ink(sc, [[x1, y0 - 3], [x1 + 3, y1 + 5]], { w: 3.8, wob: .8, seed: s + 1, over: 8 }, 'mid', at(1.06), .6);
    Ink(sc, [[x1 + 3, y1], [x0 - 6, y1 + 3]], { w: 3.6, wob: .8, seed: s + 2, over: 8 }, 'mid', at(1.12), .6);
    Ink(sc, [[x0, y1 + 4], [x0 - 3, y0 - 5]], { w: 3.7, wob: .8, seed: s + 3, over: 8 }, 'mid', at(1.18), .6);
    Ink(sc, [[x0 + 8, y0 + 7], [x1 - 8, y0 + 6]], { w: 1.3, wob: .55, seed: s + 4, over: 2, gap: .5 }, 'mid', at(1.3), .35, .65);
    Ink(sc, [[x1 - 7, y0 + 8], [x1 - 8, y1 - 8]], { w: 1.3, wob: .55, seed: s + 5, over: 2, gap: .5 }, 'mid', at(1.34), .35, .65);
    Ink(sc, [[x1 - 8, y1 - 7], [x0 + 8, y1 - 6]], { w: 1.3, wob: .55, seed: s + 6, over: 2, gap: .5 }, 'mid', at(1.38), .35, .65);
  };
  fr(Wn.x0, Wn.y0, Wn.x1, Wn.y1, 770);
  // 窗台：一块薄薄的台面，前面留出墙
  const sill = [[Wn.x0 - 26, Wn.y1 + 3], [Wn.x1 + 26, Wn.y1 - 1], [Wn.x1 + 34, Wn.y1 + 26], [Wn.x0 - 34, Wn.y1 + 32]];
  F(sc, sill, [252, 249, 240], 'mid', at(1.1), 2, 780);
  Wsh(sc, sill, mix3(PAL.cream, PAL.stoneCool, .4), { a: .36, j: 6, layers: 2, edge: .25, seed: 781 }, 'mid', at(1.14), .7);
  Ink(sc, [[Wn.x0 - 36, Wn.y1 + 33], [Wn.x1 + 36, Wn.y1 + 27]], { w: 2.6, wob: .65, seed: 782, over: 8 }, 'mid', at(1.2), .55);
  Ink(sc, [[Wn.x0 - 28, Wn.y1 + 2], [Wn.x1 + 28, Wn.y1 - 2]], { w: 1.8, wob: .6, seed: 784, over: 5 }, 'mid', at(1.24), .45, .7);
  // 窗台下沿的湿气/阴影
  Wsh(sc, [[Wn.x0 - 30, Wn.y1 + 34], [Wn.x1 + 30, Wn.y1 + 28], [Wn.x1 + 26, Wn.y1 + 54], [Wn.x0 - 26, Wn.y1 + 62]], mix3(PAL.grey, PAL.greyLight, .5), { a: .16, j: 8, layers: 1, edge: 0, seed: 785 }, 'mid', at(1.3), .8);
}

// ---------------- 墙 / 地板 / 踢脚线 ----------------
function drawShell(sc, o) {
  const at = o.at, Wn = ROOM.win, Fy = ROOM.floorY;
  const inner = { x0: Wn.x0 + Wn.fw, y0: Wn.y0 + Wn.fw, x1: Wn.x1 - Wn.fw, y1: Wn.y1 - Wn.fw };
  // 墙（用纸色挖出窗洞：四块平涂）
  const wallPieces = [
    [[0, 0], [inner.x0, 0], [inner.x0, Fy], [0, Fy]],
    [[inner.x1, 0], [1920, 0], [1920, Fy], [inner.x1, Fy]],
    [[inner.x0, 0], [inner.x1, 0], [inner.x1, inner.y0], [inner.x0, inner.y0]],
    [[inner.x0, inner.y1], [inner.x1, inner.y1], [inner.x1, Fy], [inner.x0, Fy]],
  ];
  for (const w of wallPieces) F(sc, w, PAPER, 'mid', 0, 0);
  // 墙面：把淡彩画得比画面更大，边缘的毛边留在画面外（纸面更干净）
  Wsh(sc, [[-160, -160], [2080, -160], [2080, Fy + 60], [-160, Fy + 60]], mix3(PAL.cream, PAL.greyLight, .4), { a: .18, j: 56, layers: 2, edge: 0, seed: 700, freq: .003 }, 'mid', at(.02), 1.4);
  Wsh(sc, [[1500, -80], [2080, -80], [2080, Fy + 40], [1440, Fy + 40]], mix3(PAL.greyLight, PAL.bluePale, .5), { a: .12, j: 46, layers: 2, edge: 0, seed: 702, freq: .004 }, 'mid', at(.06), 1.4);
  // 墙脚的一点点湿灰（横向，别太重）
  Wsh(sc, [[-80, Fy - 90], [2000, Fy - 110], [2000, Fy + 8], [-80, Fy + 8]], mix3(PAL.grey, PAL.cream, .5), { a: .1, j: 26, layers: 2, edge: 0, seed: 703, freq: .008 }, 'mid', at(.1), 1.4);
  // 阴湿：窗框左侧的竖向水汽痕
  for (let i = 0; i < 3; i++) {
    const x = 1102 + i * 34, wd = 16 + i * 8;
    Wsh(sc, loop([[x - 8, 150 + i * 40], [x + wd, 144 + i * 40], [x + wd + 10, 480 + i * 26], [x - 12, 500 + i * 26]], 3), mix3(PAL.greyLight, PAL.bluePale, .5), { a: .075, j: 14, layers: 1, edge: 0, seed: 704 + i }, 'mid', at(.16 + i * .03), 1.8);
  }
  // 挂画（直边木框 + 抽象远山）
  const pic = [[474, 176], [676, 171], [680, 316], [478, 322]];
  F(sc, pic, [252, 249, 241], 'mid', at(.3), 1, 706);
  Wsh(sc, pic, mix3(PAL.stone, PAL.cream, .3), { a: .3, j: 7, layers: 2, edge: .25, seed: 707 }, 'mid', at(.34), .9);
  sc.box(474, 176, 680, 316, { w: 2.8, wob: .6, seed: 708 }, { layer: 'mid', t0: at(.38), dur: .55, stagger: .08 });
  const picIn = [[490, 190], [662, 186], [666, 303], [494, 308]];
  sc.box(494, 188, 666, 304, { w: 1.4, wob: .5, seed: 709 }, { layer: 'mid', t0: at(.44), dur: .45, stagger: .07, alpha: .75 });
  Wsh(sc, [[494, 268], [566, 226], [634, 244], [666, 268], [666, 303], [494, 308]], mix3(PAL.bluePale, PAL.stoneCool, .45), { a: .34, j: 5, layers: 2, edge: .15, seed: 710 }, 'mid', at(.48), .8);
  Wsh(sc, [[494, 290], [560, 254], [650, 278], [666, 303], [494, 308]], mix3(PAL.grey, PAL.bluePale, .45), { a: .18, j: 4, layers: 1, edge: 0, seed: 711 }, 'mid', at(.52), .7);
  Wsh(sc, ellipse(612, 222, 18, 15, 14), mix3(PAL.pinkPale, PAL.cream, .25), { a: .45, j: 3, layers: 1, edge: .2, seed: 712 }, 'mid', at(.54), .6);
  Ink(sc, [[496, 286], [532, 252], [566, 230], [602, 248], [636, 262], [664, 284]], { w: 1.5, wob: .5, seed: 713, over: 3, gap: .3 }, 'mid', at(.58), .5, .7);
  // 窗帘杆 + 环
  Ink(sc, [[1036, 46], [1270, 36]], { w: 2.6, wob: .4, seed: 7140, over: 6 }, 'mid', at(.36), .5);
  Ink(sc, ellipse(1276, 35, 7, 5, 10), { w: 1.8, wob: .3, seed: 7141, over: 1 }, 'mid', at(.4), .35, .8);
  for (let i = 0; i < 5; i++) Ink(sc, ellipse(1084 + i * 38, 43 - i * 2, 5, 7, 10), { w: 1.4, wob: .3, seed: 7142 + i, over: 1 }, 'mid', at(.42 + i * .02), .3, .65);
  // 窗帘（窗左侧，半掩）：一整片布 + 折
  const curt = loop([[1108, 52], [1156, 44], [1210, 40], [1252, 230], [1264, 480], [1272, 704], [1222, 726], [1176, 560], [1146, 360], [1120, 180]], 3);
  F(sc, curt, [252, 249, 242], 'mid', at(.42), 3, 7143);
  Wsh(sc, curt, mix3(PAL.cream, PAL.greyLight, .3), { a: .36, j: 10, layers: 2, edge: .22, seed: 7144 }, 'mid', at(.46), 1.0);
  Wsh(sc, loop([[1150, 80], [1204, 66], [1224, 300], [1238, 640], [1198, 690], [1174, 420]], 3), mix3(PAL.greyLight, PAL.bluePale, .4), { a: .22, j: 8, layers: 2, edge: 0, seed: 7145 }, 'mid', at(.5), 1.0);
  for (let i = 0; i < 4; i++) Ink(sc, [[1120 + i * 32, 60 + i * 4], [1152 + i * 30, 260], [1162 + i * 28, 480], [1188 + i * 26, 712]], { w: 1.7, wob: 1.0, seed: 7146 + i, gap: .5, over: 3 }, 'mid', at(.62 + i * .04), .8, .62);
  Ink(sc, [[1252, 240], [1262, 460], [1270, 704]], { w: 2.4, wob: .7, seed: 7151, over: 5 }, 'mid', at(.7), .6, .8);
  // 踢脚线
  F(sc, [[0, Fy - 16], [1920, Fy - 10], [1920, Fy + 4], [0, Fy + 4]], [251, 247, 237], 'mid', at(1.0), 1, 722);
  Wsh(sc, [[0, Fy - 16], [1920, Fy - 10], [1920, Fy + 4], [0, Fy + 4]], mix3(PAL.cream, PAL.greyLight, .4), { a: .32, j: 5, layers: 1, edge: .15, seed: 723 }, 'mid', at(1.02), .6);
  Ink(sc, [[-6, Fy - 15], [1926, Fy - 9]], { w: 2.4, wob: .8, seed: 724, over: 8 }, 'mid', at(1.05), .55, .9);
  Ink(sc, [[-6, Fy + 2], [1926, Fy - 2]], { w: 1.4, wob: .6, seed: 725, over: 4 }, 'mid', at(1.1), .5, .5);
  // 地板：横向木板的底子
  F(sc, [[-40, Fy], [1960, Fy], [1960, 1120], [-40, 1120]], PAP2, 'mid', 0, 0);
  Wsh(sc, [[-160, Fy - 60], [2080, Fy - 70], [2080, 1140], [-160, 1140]], mix3(PAL.stone, PAL.greyLight, .45), { a: .3, j: 48, layers: 2, edge: 0, seed: 730, freq: .005 }, 'mid', at(.12), 1.3);
  Wsh(sc, [[-160, Fy - 60], [2080, Fy - 70], [2080, 1140], [-160, 1140]], mix3(PAL.grey, PAL.stone, .5), { a: .12, j: 40, layers: 2, edge: 0, seed: 731, freq: .007 }, 'mid', at(.2), 1.3);
  // 木地板：横向板缝（越靠下越疏），两条错开的短竖缝
  const ys = [770, 788, 812, 844, 886, 942, 1014, 1080];
  for (let i = 0; i < ys.length; i++) {
    const y = ys[i], xoff = (i % 2) * 40;
    Ink(sc, [[-30 + xoff, y + 2], [620, y - 1], [1300, y + 2], [1950, y - 2]], { w: 1.25, wob: .9, seed: 740 + i, over: 6, gap: .55 }, 'mid', at(.3 + i * .03), .8, .26 - i * .012);
    if (i < ys.length - 1) {
      for (const x of [240 + i * 210, 900 + i * 270]) {
        if (x > 1900) continue;
        Ink(sc, [[x, y + 2], [x + 2, ys[i + 1] - 1]], { w: 1.05, wob: .7, seed: 750 + i * 2 + (x > 600 ? 1 : 0), over: 3, gap: .5 }, 'mid', at(.4 + i * .03), .6, .18);
      }
    }
  }
  // 板与板之间的一点浅色差（交替的淡彩条）
  for (let i = 0; i < ys.length - 1; i += 2) {
    Wsh(sc, [[-40, ys[i]], [1960, ys[i] - 2], [1960, ys[i + 1] - 2], [-40, ys[i + 1] + 2]], mix3(PAL.cream, PAL.stone, .45), { a: .1, j: 14, layers: 1, edge: 0, seed: 760 + i }, 'mid', at(.42 + i * .03), .9);
  }
  // 地板近处的几笔干笔
  for (let i = 0; i < 4; i++) {
    const x = 160 + i * 460, y = 900 + (i % 2) * 74;
    Ink(sc, [[x, y], [x + 170 + i * 20, y - 4], [x + 340, y + 2]], { w: 1.05, wob: .9, seed: 762 + i, over: 6, gap: .7 }, 'mid', at(.5 + i * .03), .7, .15);
  }
}

// ---------------- 家具：沙发 / 枕头 / 旧外套 ----------------
function drawSofa(sc, o) {
  const at = o.at;
  const fab = mix3(PAL.warm, PAL.stoneCool, .45);
  const fabDk = mix3(PAL.greyDeep, PAL.stoneCool, .45);
  const paperHL = [255, 253, 247];
  // 地面影
  Wsh(sc, ellipse(602, 802, 448, 32, 24), mix3(PAL.greyDeep, PAL.cream, .25), { a: .32, j: 10, layers: 2, edge: 0, seed: 801 }, 'mid', at(.16), 1.0);
  // ---- 靠背 ----
  const back = loop([[250, 568], [286, 522], [360, 502], [470, 494], [600, 496], [740, 502], [850, 518], [900, 548], [916, 600], [920, 646], [252, 654]], 3);
  F(sc, back, PAP, 'mid', at(.22), 3, 802);
  Wsh(sc, back, fab, { a: .5, j: 16, layers: 2, edge: .32, seed: 803 }, 'mid', at(.26), 1.1);
  Wsh(sc, [[700, 500], [912, 530], [920, 646], [704, 648]], fabDk, { a: .24, j: 12, layers: 2, edge: 0, seed: 804 }, 'mid', at(.34), 1.0);
  F(sc, loop([[300, 514], [420, 504], [546, 506], [470, 558], [320, 562]], 3), paperHL, { layer: 'mid', t0: at(.4), j: 6, seed: 805, alpha: .45 });
  // 靠背上的布褶（靠近两端）
  for (let i = 0; i < 3; i++) Ink(sc, [[300 + i * 24, 508 + i * 2], [318 + i * 24, 566], [308 + i * 22, 640]], { w: 1.5, wob: .9, seed: 806 + i, over: 3, gap: .5 }, 'mid', at(.46 + i * .03), .6, .5);
  for (let i = 0; i < 3; i++) Ink(sc, [[868 - i * 22, 528 + i * 2], [858 - i * 22, 580], [864 - i * 20, 634]], { w: 1.4, wob: .9, seed: 809 + i, over: 3, gap: .5 }, 'mid', at(.5 + i * .03), .6, .45);
  // ---- 扶手（卷边，先画，坐垫压在前面） ----
  for (const [sx, sd, sgn] of [[250, 850, -1], [914, 856, 1]]) {
    const arm = loop([[sx - 24 * sgn, 562], [sx + 20 * sgn, 550], [sx + 34 * sgn, 590], [sx + 30 * sgn, 652], [sx + 22 * sgn, 706], [sx - 2 * sgn, 720], [sx - 24 * sgn, 678], [sx - 26 * sgn, 614]], 3);
    F(sc, arm, PAP, 'mid', at(.3), 3, sd);
    Wsh(sc, arm, mix3(PAL.warm, PAL.stoneCool, .5), { a: .46, j: 8, layers: 2, edge: .32, seed: sd + 1 }, 'mid', at(.34), 1.0);
    Wsh(sc, [[sx + 6 * sgn, 566], [sx + 30 * sgn, 574], [sx + 26 * sgn, 686], [sx + 4 * sgn, 704]], fabDk, { a: .18, j: 7, layers: 1, edge: 0, seed: sd + 2 }, 'mid', at(.42), .8);
    InkPoly(sc, arm, { w: 2.6, wob: .75, seed: sd + 3, gap: .28 }, 'mid', at(.44), .7, .06, .9);
    Ink(sc, [[sx - 6 * sgn, 584], [sx + 6 * sgn, 620], [sx + 2 * sgn, 692]], { w: 1.5, wob: .7, seed: sd + 4, over: 3, gap: .45 }, 'mid', at(.52), .55, .5);
  }
  // ---- 坐垫（两块，各有顶面 + 前脸） ----
  const cush = [
    { top: [[256, 646], [560, 640], [566, 692], [250, 700]], face: [[250, 700], [566, 692], [562, 742], [252, 750]], sd: 820 },
    { top: [[578, 640], [912, 634], [918, 686], [584, 692]], face: [[584, 692], [918, 686], [914, 736], [586, 742]], sd: 830 },
  ];
  for (const c of cush) {
    F(sc, c.top, PAP, 'mid', at(.26), 2, c.sd);
    Wsh(sc, c.top, mix3(PAL.warm, PAL.stoneCool, .42), { a: .4, j: 9, layers: 2, edge: .3, seed: c.sd + 1 }, 'mid', at(.3), 1.0);
    F(sc, c.face, PAP, 'mid', at(.28), 2, c.sd + 2);
    Wsh(sc, c.face, mix3(PAL.warm, PAL.stoneCool, .52), { a: .44, j: 7, layers: 2, edge: .3, seed: c.sd + 3 }, 'mid', at(.32), 1.0);
    // 前脸底下的暗影
    Wsh(sc, shift(c.face, 0, 4), fabDk, { a: .15, j: 6, layers: 1, edge: 0, seed: c.sd + 4 }, 'mid', at(.4), .8);
    inkQuad(sc, c.top, { w: 1.9, wob: .7, seed: c.sd + 8, gap: .4 }, 'mid', at(.4), .55, .07, .6);
    inkQuad(sc, c.face, { w: 2.5, wob: .75, seed: c.sd + 5, gap: .3 }, 'mid', at(.42), .65, .07, .92);
    // 坐垫角上的压痕
    Ink(sc, [[c.face[0][0] + 20, c.face[0][1] + 8], [c.face[0][0] + 34, c.face[0][1] + 26], [c.face[0][0] + 26, c.face[0][1] + 42]], { w: 1.2, wob: .6, seed: c.sd + 7, over: 2, gap: .5 }, 'mid', at(.54), .5, .4);
    Ink(sc, [[c.face[1][0] - 30, c.face[1][1] + 10], [c.face[1][0] - 16, c.face[1][1] + 28]], { w: 1.1, wob: .6, seed: c.sd + 9, over: 2, gap: .5 }, 'mid', at(.56), .45, .35);
  }
  // 两块坐垫之间的缝（纸白 + 线）
  F(sc, [[560, 642], [578, 641], [580, 694], [564, 744]], [255, 253, 246], { layer: 'mid', t0: at(.44), j: 3, seed: 840, alpha: .5 });
  Ink(sc, [[568, 640], [572, 690], [570, 740]], { w: 1.9, wob: .6, seed: 841, over: 4, gap: .35 }, 'mid', at(.46), .55, .7);
  // ---- 前裙 / 底座 ----
  const base = [[258, 744], [906, 734], [900, 786], [264, 798]];
  F(sc, base, PAP2, 'mid', at(.3), 2, 842);
  Wsh(sc, base, mix3(PAL.grey, PAL.stone, .35), { a: .36, j: 7, layers: 2, edge: .24, seed: 843 }, 'mid', at(.34), .9);
  Wsh(sc, [[470, 748], [900, 738], [894, 782], [478, 792]], fabDk, { a: .16, j: 6, layers: 1, edge: 0, seed: 844 }, 'mid', at(.42), .8);
  inkQuad(sc, base, { w: 2.3, wob: .75, seed: 845, gap: .32 }, 'mid', at(.46), .6, .07, .85);
  Ink(sc, [[264, 796], [580, 790], [900, 784]], { w: 2.2, wob: .75, seed: 846, over: 6 }, 'mid', at(.5), .6);
  sc.hatch([[268, 752], [898, 742], [892, 778], [274, 790]], { ang: Math.PI / 2.8, gap: 18, w: 1.0, seed: 847, thin: .45 }, { layer: 'mid', t0: at(.54), dur: 1.0, alpha: .14 });
  // ---- 腿 ----
  for (const [lx, ly, sd] of [[306, 798, 860], [864, 786, 861]]) {
    Ink(sc, [[lx, ly], [lx - 6, ly + 44]], { w: 3.1, wob: .35, seed: sd, over: 2 }, 'mid', at(.5), .45);
    Ink(sc, [[lx + 11, ly + 1], [lx + 8, ly + 42]], { w: 1.4, wob: .35, seed: sd + 1, over: 2 }, 'mid', at(.52), .4, .6);
    Wsh(sc, ellipse(lx, ly + 46, 24, 6, 10), mix3(PAL.greyDeep, PAL.cream, .4), { a: .2, j: 3, layers: 1, edge: 0, seed: sd + 2 }, 'mid', at(.54), .6);
  }
  // ---- 轮廓（速写的双线、出头、断笔） ----
  Ink(sc, [[244, 590], [282, 528], [360, 508], [470, 500], [602, 502], [742, 508], [852, 524], [904, 554], [918, 610], [920, 648]], { w: 3.3, wob: .8, seed: 870, over: 9, gap: .2 }, 'mid', at(.4), .8);
  Ink(sc, [[262, 596], [302, 540], [372, 520], [470, 512]], { w: 1.7, wob: .7, seed: 871, over: 4, gap: .5 }, 'mid', at(.5), .6, .45);
  // ---- 枕头 ×2（靠在靠背上） ----
  const pillow = (cx, cy, w, h, ang, sd) => {
    const q = rectPts(cx - w / 2, cy - h / 2, w, h, ang);
    const p = loop([q[0], lerpP(q[0], q[1], .5), q[1], lerpP(q[1], q[2], .5), q[2], lerpP(q[2], q[3], .5), q[3], lerpP(q[3], q[0], .5)], 4);
    F(sc, p, PAP, 'mid', at(.42), 3, sd);
    Wsh(sc, p, mix3(PAL.pinkPale, PAL.stoneCool, .3), { a: .52, j: 7, layers: 2, edge: .34, seed: sd + 1 }, 'mid', at(.46), 1.0);
    Wsh(sc, ellipse(cx - w * .1, cy + h * .14, w * .3, h * .2, 14), mix3(PAL.grey, PAL.cream, .35), { a: .2, j: 6, layers: 1, edge: 0, seed: sd + 2 }, 'mid', at(.52), .8);
    InkPoly(sc, p, { w: 2.5, wob: .7, seed: sd + 3, gap: .26 }, 'mid', at(.5), .65, .07, .92);
    Ink(sc, [[cx - w * .34, cy - h * .12], [cx - w * .1, cy - h * .03], [cx + w * .14, cy - h * .14]], { w: 1.4, wob: .6, seed: sd + 4, over: 3, gap: .5 }, 'mid', at(.6), .45, .5);
    Ink(sc, [[cx - w * .3, cy + h * .3], [cx + w * .26, cy + h * .26]], { w: 1.2, wob: .6, seed: sd + 5, over: 2, gap: .55 }, 'mid', at(.62), .4, .4);
  };
  pillow(352, 574, 156, 118, -.09, 880);
  pillow(714, 562, 166, 122, .06, 890);
  // 旧外套：挂在墙上的一颗钉上（比搭在沙发上读得清）
  if (o.coat !== false) drawHangingCoat(sc, o);
}

// 挂在墙钩上的旧外套
function drawHangingCoat(sc, o) {
  const at = o.at;
  const cx = 1052, top = 306;
  const col = mix3(PAL.grey, PAL.bluePale, .3);
  const dk = mix3(PAL.greyDeep, PAL.blueDeep, .35);
  // 墙上的钉 + 一小片影子
  Ink(sc, [[cx - 10, top - 8], [cx + 10, top - 8]], { w: 2.6, wob: .3, seed: 930, over: 2 }, 'mid', at(.34), .4);
  Ink(sc, ellipse(cx, top - 2, 5, 5, 10), { w: 1.6, wob: .2, seed: 931, over: 1 }, 'mid', at(.36), .4, .8);
  Wsh(sc, ellipse(cx + 24, top + 210, 108, 240, 16), mix3(PAL.grey, PAL.cream, .45), { a: .1, j: 20, layers: 1, edge: 0, seed: 932 }, 'mid', at(.36), 1.1);
  // 大衣轮廓：肩线从挂点向两侧垂，衣身到下摆
  const body = loop([[cx, top + 6], [cx - 34, top + 34], [cx - 66, top + 76], [cx - 78, top + 150], [cx - 82, top + 240], [cx - 74, top + 316], [cx - 46, top + 338], [cx + 4, top + 326], [cx + 54, top + 340], [cx + 82, top + 312], [cx + 76, top + 220], [cx + 70, top + 140], [cx + 58, top + 70], [cx + 30, top + 32]], 3);
  F(sc, body, PAP, 'mid', at(.4), 3, 933);
  Wsh(sc, body, col, { a: .48, j: 10, layers: 2, edge: .34, seed: 934 }, 'mid', at(.44), 1.1);
  // 袖子的暗面 / 衣身右侧暗面
  Wsh(sc, loop([[cx + 10, top + 40], [cx + 58, top + 74], [cx + 70, top + 200], [cx + 62, top + 300], [cx + 30, top + 318], [cx + 22, top + 240], [cx + 20, top + 140]], 3), dk, { a: .26, j: 10, layers: 2, edge: 0, seed: 935 }, 'mid', at(.52), 1.0);
  // 衣架 + 领口（挂在钉上：三角衣架 + 一道开领）
  Ink(sc, [[cx - 30, top + 34], [cx, top + 14], [cx + 30, top + 34]], { w: 2.2, wob: .35, seed: 929, over: 2 }, 'mid', at(.38), .45, .85);
  Ink(sc, [[cx, top + 14], [cx, top + 2]], { w: 1.8, wob: .25, seed: 9291, over: 1 }, 'mid', at(.4), .35, .9);
  Ink(sc, [[cx - 6, top + 6], [cx, top + 1], [cx + 6, top + 6]], { w: 1.5, wob: .2, seed: 9292, over: 1 }, 'mid', at(.4), .3, .85);
  // 领口：两片翻领（只是两道墨线 + 一点更深的淡彩，不做纸白）
  const lapelL = [[cx - 32, top + 38], [cx - 6, top + 26], [cx - 2, top + 60], [cx - 18, top + 100], [cx - 34, top + 66]];
  const lapelR = [[cx + 32, top + 38], [cx + 6, top + 26], [cx + 2, top + 60], [cx + 16, top + 100], [cx + 32, top + 66]];
  Wsh(sc, lapelL, mix3(PAL.bluePale, PAL.greyLight, .5), { a: .16, j: 4, layers: 1, edge: .25, seed: 9293 }, 'mid', at(.42), .7);
  Wsh(sc, lapelR, mix3(PAL.bluePale, PAL.greyLight, .5), { a: .14, j: 4, layers: 1, edge: .25, seed: 9294 }, 'mid', at(.44), .7);
  Ink(sc, lapelL, { w: 1.7, wob: .5, seed: 9295, over: 2, gap: .35 }, 'mid', at(.46), .45, .75);
  Ink(sc, lapelR, { w: 1.7, wob: .5, seed: 9296, over: 2, gap: .35 }, 'mid', at(.48), .45, .75);
  // 前襟：从领口到下摆
  Ink(sc, [[cx - 2, top + 80], [cx + 2, top + 160], [cx - 2, top + 240], [cx + 2, top + 320]], { w: 2.0, wob: .7, seed: 939, over: 4, gap: .35 }, 'mid', at(.56), .7, .75);
  // 袖子：两侧各一条垂下的折线 + 袖口
  Ink(sc, [[cx - 44, top + 60], [cx - 66, top + 130], [cx - 74, top + 220], [cx - 68, top + 296]], { w: 1.8, wob: .8, seed: 940, over: 3, gap: .4 }, 'mid', at(.6), .7, .7);
  Ink(sc, [[cx + 46, top + 56], [cx + 64, top + 128], [cx + 68, top + 214], [cx + 62, top + 292]], { w: 1.8, wob: .8, seed: 941, over: 3, gap: .4 }, 'mid', at(.62), .7, .7);
  Ink(sc, [[cx - 74, top + 288], [cx - 58, top + 306], [cx - 40, top + 296]], { w: 1.7, wob: .5, seed: 942, over: 2 }, 'mid', at(.66), .45, .75);
  Ink(sc, [[cx + 62, top + 286], [cx + 48, top + 306], [cx + 30, top + 298]], { w: 1.7, wob: .5, seed: 943, over: 2 }, 'mid', at(.66), .45, .75);
  // 衣褶
  const folds = [
    [[cx - 30, top + 90], [cx - 22, top + 170], [cx - 30, top + 260], [cx - 26, top + 320]],
    [[cx + 16, top + 88], [cx + 26, top + 168], [cx + 18, top + 258], [cx + 22, top + 318]],
    [[cx - 50, top + 120], [cx - 40, top + 200], [cx - 48, top + 292]],
    [[cx + 40, top + 130], [cx + 34, top + 210], [cx + 40, top + 300]],
  ];
  folds.forEach((f, i) => Ink(sc, f, { w: 1.5, wob: .7, seed: 944 + i, over: 2, gap: .5 }, 'mid', at(.64 + i * .03), .6, .6));
  // 下摆
  Ink(sc, [[cx - 76, top + 314], [cx - 46, top + 336], [cx + 2, top + 324], [cx + 52, top + 338], [cx + 80, top + 310]], { w: 2.2, wob: .8, seed: 948, over: 4, gap: .3 }, 'mid', at(.7), .6, .85);
  // 排线（暗部）+ 轮廓
  sc.hatch([[cx + 14, top + 70], [cx + 66, top + 90], [cx + 62, top + 300], [cx + 12, top + 310]], { ang: Math.PI / 3.1, gap: 14, w: 1.0, seed: 949, thin: .4 }, { layer: 'mid', t0: at(.74), dur: 1.0, alpha: .16 });
  InkPoly(sc, body, { w: 2.8, wob: .85, seed: 951, gap: .28 }, 'mid', at(.6), .9, .07, .92);
}
function drawSideTable(sc, o) {
  const at = o.at, T = ROOM.table;
  const wood = mix3(PAL.stone, PAL.brick, .35);
  const top = [[T.x0, T.topY], [T.x1, T.topY - 5], [T.x1 + 18, T.topY + 18], [T.x0 - 18, T.topY + 24]];
  Wsh(sc, ellipse((T.x0 + T.x1) / 2, T.botY + 8, 158, 22, 16), mix3(PAL.grey, PAL.cream, .3), { a: .22, j: 6, layers: 2, edge: 0, seed: 900 }, 'mid', at(.36), .9);
  F(sc, top, PAP, 'mid', at(.36), 2, 901);
  Wsh(sc, top, wood, { a: .34, j: 6, layers: 2, edge: .25, seed: 902 }, 'mid', at(.4), .9);
  // 桌面木纹
  for (let i = 0; i < 3; i++) Ink(sc, [[T.x0 - 10, T.topY + 6 + i * 5], [T.x1 + 10, T.topY + 1 + i * 5]], { w: 1.0, wob: .6, seed: 903 + i, over: 3, gap: .5 }, 'mid', at(.48), .45, .3);
  // 前脸
  const face = [[T.x0 - 18, T.topY + 24], [T.x1 + 18, T.topY + 18], [T.x1 + 14, T.topY + 44], [T.x0 - 22, T.topY + 52]];
  F(sc, face, PAP2, 'mid', at(.38), 2, 906);
  Wsh(sc, face, mix3(PAL.cream, PAL.stone, .4), { a: .3, j: 5, layers: 2, edge: .2, seed: 907 }, 'mid', at(.42), .8);
  // 腿（前两条 + 里侧两条的暗示）
  for (const [lx, ly, sd] of [[T.x0 + 34, T.topY + 48, 908], [T.x1 - 26, T.topY + 42, 909]]) {
    Ink(sc, [[lx, ly], [lx - 7, T.botY]], { w: 3.0, wob: .4, seed: sd, over: 2 }, 'mid', at(.46), .55);
    Ink(sc, [[lx + 11, ly], [lx + 9, T.botY - 4]], { w: 1.3, wob: .4, seed: sd + 1, over: 2 }, 'mid', at(.5), .5, .55);
  }
  Ink(sc, [[T.x0 + 60, T.topY + 52], [T.x0 + 62, T.botY - 30]], { w: 1.2, wob: .4, seed: 910, over: 2 }, 'mid', at(.54), .45, .35);
  Ink(sc, [[T.x1 - 60, T.topY + 46], [T.x1 - 58, T.botY - 34]], { w: 1.2, wob: .4, seed: 911, over: 2 }, 'mid', at(.56), .45, .35);
  // 桌沿双线
  Ink(sc, [[T.x0 - 24, T.topY + 25], [T.x1 + 20, T.topY + 18]], { w: 2.5, wob: .6, seed: 912, over: 5 }, 'mid', at(.46), .55);
  Ink(sc, [[T.x0 - 26, T.topY + 53], [T.x1 + 16, T.topY + 45]], { w: 1.5, wob: .6, seed: 913, over: 4 }, 'mid', at(.52), .45, .55);
  // 桌面受窗光的一点纸白
  F(sc, [[T.x0 + 40, T.topY + 6], [T.x1 - 20, T.topY + 2], [T.x1 - 30, T.topY + 12], [T.x0 + 34, T.topY + 15]], [255, 253, 247], { layer: 'mid', t0: at(.54), j: 5, seed: 914, alpha: .4 });
}
function drawLamp(sc, o) {
  const at = o.at, Lp = ROOM.lamp;
  const sx = Lp.x, sy = Lp.shadeY;
  // 灯光在墙 / 地上的暖晕（静态只留很淡的一点，主要靠动态 glow）
  Wsh(sc, ellipse(sx + 70, 800, 300, 100, 22), mix3(PAL.lamp, PAL.warm, .3), { a: .12, j: 30, layers: 2, edge: 0, seed: 922 }, 'mid', at(.22), 1.5);
  // 底座 + 立杆
  Wsh(sc, ellipse(sx, Lp.baseY + 6, 66, 14, 18), mix3(PAL.grey, PAL.cream, .3), { a: .3, j: 4, layers: 2, edge: .25, seed: 923 }, 'mid', at(.24), .7);
  Ink(sc, [[sx - 48, Lp.baseY], [sx - 8, Lp.baseY + 11], [sx + 34, Lp.baseY + 6], [sx + 54, Lp.baseY - 7]], { w: 2.6, wob: .5, seed: 924, over: 5 }, 'mid', at(.26), .55);
  Ink(sc, [[sx - 36, Lp.baseY + 3], [sx - 4, Lp.baseY + 15], [sx + 30, Lp.baseY + 10]], { w: 1.2, wob: .4, seed: 925, over: 2 }, 'mid', at(.3), .4, .5);
  Ink(sc, [[sx, sy + 84], [sx - 5, 640], [sx - 3, Lp.baseY + 10]], { w: 2.8, wob: .4, seed: 926, over: 3 }, 'mid', at(.28), .6);
  Ink(sc, [[sx + 10, sy + 84], [sx + 5, 700], [sx + 6, Lp.baseY + 6]], { w: 1.4, wob: .35, seed: 927, over: 3 }, 'mid', at(.32), .55, .55);
  // 灯罩：梯形，暖黄里子
  const shade = loop([[sx - Lp.shadeW, sy], [sx + Lp.shadeW, sy + 5], [sx + Lp.shadeW - 18, sy + 88], [sx - Lp.shadeW + 20, sy + 94]], 2);
  F(sc, shade, [253, 249, 239], 'mid', at(.3), 2, 928);
  Wsh(sc, shade, mix3(PAL.lamp, PAL.cream, .28), { a: .5, j: 5, layers: 2, edge: .3, seed: 929 }, 'mid', at(.34), .8);
  Wsh(sc, [[sx - Lp.shadeW + 12, sy + 50], [sx + Lp.shadeW - 8, sy + 54], [sx + Lp.shadeW - 20, sy + 90], [sx - Lp.shadeW + 18, sy + 94]], mix3(PAL.lampDeep, PAL.warm, .3), { a: .26, j: 4, layers: 1, edge: 0, seed: 930 }, 'mid', at(.4), .6);
  InkPoly(sc, shade, { w: 2.6, wob: .6, seed: 931, gap: .28 }, 'mid', at(.36), .6, .06);
  Ink(sc, [[sx - Lp.shadeW + 18, sy + 92], [sx + Lp.shadeW - 20, sy + 87]], { w: 2.0, wob: .5, seed: 932, over: 3 }, 'mid', at(.42), .45, .8);
  // 灯罩底部漏出的光（很淡的一团纸白）
  F(sc, ellipse(sx, sy + 100, Lp.shadeW - 12, 16, 14), [255, 252, 240], { layer: 'mid', t0: at(.46), j: 6, seed: 933, alpha: .5 });
}
function drawCup(sc, o) {
  const at = o.at, x = o.x ?? 1456, y = o.y ?? 714, w = o.w ?? 68, h = o.h ?? 78;
  const body = [[x - w / 2, y], [x - w / 2 + 7, y - h], [x + w / 2 - 7, y - h], [x + w / 2, y]];
  // 托碟
  Wsh(sc, ellipse(x, y + 2, 50, 11, 16), mix3(PAL.grey, PAL.cream, .3), { a: .24, j: 4, layers: 2, edge: .2, seed: 1000 }, 'mid', at(.46), .7);
  F(sc, ellipse(x, y - 2, 46, 10, 16), [252, 249, 241], { layer: 'mid', t0: at(.46), j: 2, seed: 1001 });
  Wsh(sc, ellipse(x, y - 2, 46, 10, 16), mix3(PAL.cream, PAL.stone, .3), { a: .26, j: 3, layers: 1, edge: .2, seed: 1002 }, 'mid', at(.5), .6);
  Ink(sc, ellipse(x, y - 2, 46, 10, 16), { w: 1.5, wob: .35, seed: 1003, over: 2 }, 'mid', at(.56), .4, .7);
  // 杯身
  F(sc, body, [253, 250, 243], 'mid', at(.5), 2, 1004);
  Wsh(sc, body, mix3(PAL.cream, PAL.greyLight, .3), { a: .26, j: 3, layers: 2, edge: .25, seed: 1005 }, 'mid', at(.54), .7);
  // 茶水
  Wsh(sc, ellipse(x, y - h + 7, w * .3, 7, 14), mix3(PAL.lampDeep, PAL.stone, .35), { a: .35, j: 2, layers: 1, edge: .2, seed: 1006 }, 'mid', at(.6), .6);
  InkPoly(sc, body, { w: 2.0, wob: .35, seed: 1007, gap: .25 }, 'mid', at(.56), .5, .05);
  Ink(sc, [[x - w / 2 + 8, y - h + 2], [x + w / 2 - 8, y - h + 1]], { w: 1.5, wob: .3, seed: 1008, over: 2 }, 'mid', at(.6), .35);
  // 杯柄
  Ink(sc, [[x + w / 2 - 5, y - h * .74], [x + w / 2 + 20, y - h * .68], [x + w / 2 + 22, y - h * .38], [x + w / 2 - 3, y - h * .3]], { w: 2.1, wob: .4, seed: 1009, over: 2 }, 'mid', at(.62), .45);
  Ink(sc, [[x + w / 2 - 1, y - h * .62], [x + w / 2 + 12, y - h * .56]], { w: 1.0, wob: .3, seed: 1010, over: 1 }, 'mid', at(.64), .3, .5);
  // 杯口纸白（高光）
  F(sc, [[x - w * .3, y - h + 4], [x + w * .1, y - h + 2], [x + w * .05, y - h + 9], [x - w * .28, y - h + 10]], [255, 254, 249], { layer: 'mid', t0: at(.62), j: 3, seed: 1011, alpha: .55 });
  return { x, y: y - h };
}

// ---------------- 行李箱（开 / 合 / 动态合盖） ----------------
function caseGeom(o) {
  const cx = o.cx ?? ROOM.caseC.cx, baseY = o.baseY ?? ROOM.caseC.baseY;
  const w = o.w ?? ROOM.caseC.w, h = o.h ?? ROOM.caseC.h, depth = o.depth ?? ROOM.caseC.depth, side = -26, bow = 9;
  const FL = [cx - w / 2, baseY], FR = [cx + w / 2, baseY - bow];
  const FLt = [cx - w / 2, baseY - h], FRt = [cx + w / 2, baseY - h - bow];
  const BLt = [FLt[0] + side, FLt[1] - depth], BRt = [FRt[0] + side, FRt[1] - depth];
  return { cx, baseY, w, h, depth, bow, FL, FR, FLt, FRt, BLt, BRt, side };
}
// 箱体（静态）：箱盖由调用方决定（静态或动态）
function drawCaseBody(sc, o) {
  const at = o.at; const g = caseGeom(o);
  const { cx, baseY, w, h, FL, FR, FLt, FRt, BLt, BRt } = g;
  const front = [FL, FR, FRt, FLt], topFace = [FLt, FRt, BRt, BLt];
  // 影子
  Wsh(sc, ellipse(cx - 6, baseY + 22, w * .58, 26, 22), mix3(PAL.greyDeep, PAL.cream, .3), { a: .28, j: 8, layers: 2, edge: 0, seed: 950 }, 'mid', at(.3), .9);
  // 箱内（打开时看得到）
  if (o.open !== false) {
    F(sc, topFace, [250, 246, 236], 'mid', at(.34), 2, 951);
    Wsh(sc, topFace, mix3(PAL.cream, PAL.pinkPale, .35), { a: .26, j: 7, layers: 2, edge: .15, seed: 952 }, 'mid', at(.38), .9);
    // 箱底的衣物（几块折好的旧衣）
    const g1 = [quadMap(topFace, .1, .12), quadMap(topFace, .4, .05), quadMap(topFace, .42, .48), quadMap(topFace, .12, .55)];
    Wsh(sc, g1, mix3(PAL.bluePale, PAL.greyLight, .45), { a: .38, j: 5, layers: 2, edge: .25, seed: 953 }, 'mid', at(.46), .8);
    const g2 = [quadMap(topFace, .44, .28), quadMap(topFace, .74, .16), quadMap(topFace, .76, .62), quadMap(topFace, .46, .74)];
    Wsh(sc, g2, mix3(PAL.pinkPale, PAL.cream, .35), { a: .34, j: 5, layers: 2, edge: .25, seed: 954 }, 'mid', at(.5), .8);
    const g3 = [quadMap(topFace, .18, .62), quadMap(topFace, .5, .52), quadMap(topFace, .52, .9), quadMap(topFace, .2, .98)];
    Wsh(sc, g3, mix3(PAL.warm, PAL.cream, .45), { a: .36, j: 5, layers: 2, edge: .2, seed: 955 }, 'mid', at(.54), .8);
    // 衣物折边 + 箱内壁的排线
    Ink(sc, [quadMap(topFace, .12, .12), quadMap(topFace, .4, .05)], { w: 1.3, wob: .5, seed: 956, over: 2, gap: .4 }, 'mid', at(.56), .4, .6);
    Ink(sc, [quadMap(topFace, .46, .28), quadMap(topFace, .74, .16)], { w: 1.2, wob: .5, seed: 957, over: 2, gap: .4 }, 'mid', at(.58), .4, .55);
    sc.hatch([quadMap(topFace, .02, .04), quadMap(topFace, .98, .0), quadMap(topFace, .98, .12), quadMap(topFace, .02, .16)], { ang: Math.PI / 3.4, gap: 9, w: 1.0, seed: 958, thin: .4 }, { layer: 'mid', t0: at(.6), dur: .8, alpha: .2 });
    sc.hatch([quadMap(topFace, .0, .9), quadMap(topFace, 1, .9), quadMap(topFace, 1, 1), quadMap(topFace, .0, 1)], { ang: Math.PI / 2.6, gap: 11, w: .9, seed: 9581, thin: .4 }, { layer: 'mid', t0: at(.62), dur: .8, alpha: .16 });
    // 箱口内沿
    inkQuad(sc, topFace, { w: 2.0, wob: .7, seed: 959, gap: .3 }, 'mid', at(.5), .5, .07, .85);
  }
  // 箱体正面：旧皮革的灰蓝（湿、暗），下面更暗
  F(sc, front, [249, 245, 235], 'mid', at(.3), 2, 960);
  Wsh(sc, front, mix3(PAL.greyDeep, PAL.blueDeep, .42), { a: .5, j: 7, layers: 2, edge: .32, seed: 961 }, 'mid', at(.34), .9);
  Wsh(sc, [[FL[0] + 8, FL[1] - 30], [FR[0] - 10, FR[1] - 34], [FR[0] - 14, FR[1] - 4], [FL[0] + 6, FL[1] - 2]], mix3(PAL.greyDeep, PAL.bluePale, .3), { a: .24, j: 6, layers: 2, edge: 0, seed: 9615 }, 'mid', at(.4), .8);
  // 皮革纸白高光
  F(sc, [quadMap(front, .06, .08), quadMap(front, .34, .04), quadMap(front, .32, .2), quadMap(front, .08, .26)], [253, 251, 244], { layer: 'mid', t0: at(.46), j: 5, seed: 9616, alpha: .3 });
  // 正面竖棱 / 角包 / 锁扣 / 提手
  for (let i = 0; i < 4; i++) {
    const u = .16 + i * .22;
    Ink(sc, [quadMap(front, u, .05), quadMap(front, u + .04, .96)], { w: 1.6, wob: .55, seed: 962 + i, over: 2, gap: .45 }, 'mid', at(.48 + i * .03), .45, .7);
  }
  for (const [u, sd] of [[.04, 970], [.94, 971]]) {
    const c1 = quadMap(front, u, .06), c2 = quadMap(front, u + .06, .06), c3 = quadMap(front, u + .06, .3), c4 = quadMap(front, u, .3);
    Ink(sc, [c1, c2, c3, c4, c1], { w: 1.7, wob: .4, seed: sd, over: 2 }, 'mid', at(.52), .4, .75);
  }
  for (const u of [.36, .68]) {
    const a = quadMap(front, u, .52), b = quadMap(front, u + .1, .52), c = quadMap(front, u + .1, .72), d = quadMap(front, u, .72);
    F(sc, [a, b, c, d], [252, 249, 240], 'mid', at(.54), 1, 972);
    Wsh(sc, [a, b, c, d], mix3(PAL.lampDeep, PAL.stone, .35), { a: .5, j: 2, layers: 1, edge: .3, seed: 973 }, 'mid', at(.56), .5);
    Ink(sc, [a, b, c, d, a], { w: 1.7, wob: .3, seed: 974, over: 1 }, 'mid', at(.58), .4, .85);
  }
  // 提手（正面顶部）
  const ha = quadMap(front, .42, .1), hb = quadMap(front, .58, .1);
  Ink(sc, [ha, [ha[0] - 6, ha[1] - 22], [hb[0] + 6, hb[1] - 24], hb], { w: 2.6, wob: .35, seed: 975, over: 3 }, 'mid', at(.6), .5);
  Ink(sc, [ha, [ha[0] + 2, ha[1] + 6]], { w: 1.2, wob: .3, seed: 976, over: 1 }, 'mid', at(.62), .3, .6);
  Ink(sc, [hb, [hb[0] - 2, hb[1] + 6]], { w: 1.2, wob: .3, seed: 977, over: 1 }, 'mid', at(.62), .3, .6);
  // 底边 + 侧边
  Ink(sc, [[FL[0] - 5, FL[1] + 1], [FR[0] + 5, FR[1]]], { w: 3.0, wob: .7, seed: 978, over: 7 }, 'mid', at(.44), .6);
  Ink(sc, [[FL[0], FL[1] + 3], [FLt[0], FLt[1]]], { w: 3.0, wob: .7, seed: 979, over: 6 }, 'mid', at(.46), .6);
  Ink(sc, [[FR[0], FR[1] - 1], [FRt[0], FRt[1]]], { w: 3.0, wob: .7, seed: 980, over: 6 }, 'mid', at(.48), .6);
  Ink(sc, [[FLt[0] + 4, FLt[1] + 2], [FRt[0] - 4, FRt[1] - 1]], { w: 1.6, wob: .6, seed: 9805, over: 5 }, 'mid', at(.5), .5, .7);
  // 左上角伸出的旧贴纸/旅行标签（不是文字，只是色块与线）
  Wsh(sc, ellipse(FL[0] + 46, FL[1] - 34, 20, 13, 12), mix3(PAL.pink, PAL.cream, .35), { a: .3, j: 3, layers: 1, edge: .2, seed: 981 }, 'mid', at(.64), .5);
  Ink(sc, ellipse(FL[0] + 46, FL[1] - 34, 20, 13, 12), { w: 1.2, wob: .4, seed: 982, over: 1 }, 'mid', at(.66), .35, .6);
  return g;
}
// 静态箱盖：theta = 张开角（0 = 合上，1 = 全开）
function lidCorners(g, theta, lift = 0) {
  const th = theta * (Math.PI * .55);                      // 0..~99°
  // 开盖轨迹：合上时盖面正好压在箱口上（偏移 = 箱口深度），打开时转到上方
  const dx = 26 - 22 * theta;
  const sy = 78 * Math.cos(th) - 150 * Math.sin(th);
  const d = [dx, sy - lift];
  return [[g.BLt[0], g.BLt[1]], [g.BRt[0], g.BRt[1]], [g.BRt[0] + d[0], g.BRt[1] + d[1]], [g.BLt[0] + d[0], g.BLt[1] + d[1]]];
}
function drawLidStatic(sc, o) {
  const at = o.at, g = caseGeom(o), th = Math.max(.02, o.lid ?? 1);
  const q = lidCorners(g, th);
  F(sc, q, [250, 246, 236], 'mid', at(.6), 2, 990);
  Wsh(sc, q, mix3(PAL.cream, PAL.stone, .48), { a: .38, j: 7, layers: 2, edge: .28, seed: 991 }, 'mid', at(.64), .9);
  // 盖里：上沿的阴影 + 左缘的暗
  Wsh(sc, [lerpP(q[0], q[3], .1), lerpP(q[1], q[2], .1), lerpP(q[1], q[2], .34), lerpP(q[0], q[3], .34)], mix3(PAL.grey, PAL.cream, .35), { a: .18, j: 5, layers: 1, edge: 0, seed: 9905 }, 'mid', at(.66), .7);
  Wsh(sc, [q[0], lerpP(q[0], q[1], .18), lerpP(q[3], q[2], .18), q[3]], mix3(PAL.greyDeep, PAL.stone, .5), { a: .14, j: 5, layers: 1, edge: 0, seed: 9906 }, 'mid', at(.68), .7);
  // 箱盖内侧的绑带
  for (const u of [.2, .5, .8]) {
    const a = lerpP(q[0], q[3], u), b = lerpP(q[1], q[2], u);
    Ink(sc, [a, b], { w: 1.4, wob: .5, seed: 992 + Math.round(u * 10), over: 1, gap: .3 }, 'mid', at(.72), .5, .72);
  }
  const band = [quadMap(q, .1, .58), quadMap(q, .9, .58), quadMap(q, .9, .82), quadMap(q, .1, .82)];
  Wsh(sc, band, mix3(PAL.grey, PAL.pinkPale, .4), { a: .26, j: 4, layers: 1, edge: .2, seed: 993 }, 'mid', at(.74), .6);
  inkQuad(sc, q, { w: 2.1, wob: .7, seed: 994, gap: .3 }, 'mid', at(.68), .55, .07, .88);
  // 合上时：顶面提手
  if (th < .04) {
    const ha = quadMap(q, .42, .06), hb = quadMap(q, .58, .06);
    Ink(sc, [ha, [ha[0] - 2, ha[1] - 22], [hb[0] + 2, hb[1] - 24], hb], { w: 2.3, wob: .35, seed: 996, over: 3 }, 'mid', at(.78), .5);
  }
}
// 动态箱盖（6.1 合上）：theta 随时变化
export function caseLidFx(o = {}) {
  const g = caseGeom(o);
  return (ctx, t) => {
    const th = Math.max(.015, o.theta(t));
    const q = lidCorners(g, th);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba([250, 246, 236], .97); polyPath(ctx, q); ctx.fill(); ctx.restore();
    ctx.save(); wash(ctx, q, mix3(PAL.cream, PAL.stone, .48), { a: .38, j: 7, layers: 2, edge: .28, seed: 991 }); ctx.restore();
    ctx.save(); ctx.strokeStyle = rgba(INK, .62); ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    for (const u of [.2, .5, .8]) {
      const a = lerpP(q[0], q[3], u), b = lerpP(q[1], q[2], u);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    const p0 = quadMap(q, .1, .58), p1 = quadMap(q, .9, .58), p2 = quadMap(q, .9, .84), p3 = quadMap(q, .1, .84);
    wash(ctx, [p0, p1, p2, p3], mix3(PAL.grey, PAL.pinkPale, .4), { a: .24, j: 4, layers: 1, edge: .2, seed: 993 });
    ctx.restore();
    // 轮廓
    ctx.save(); ctx.strokeStyle = rgba(INK, .8); ctx.lineWidth = 2.0; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.lineTo(q[3][0], q[3][1]); ctx.stroke();
    ctx.restore();
    // 合上后加提手
    if (th < .05) {
      const ha = quadMap(q, .42, .06), hb = quadMap(q, .58, .06);
      ctx.save(); ctx.strokeStyle = rgba(INK, .8); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ha[0], ha[1]); ctx.quadraticCurveTo((ha[0] + hb[0]) / 2, ha[1] - 22, hb[0], hb[1]); ctx.stroke(); ctx.restore();
    }
  };
}

// ---------------- 房间视图组装 ----------------
// ==================== 第二轮：丰富度补充（小物 / 光影 / 质感笔触） ====================
// 点是否在多边形内（用于在面里撒颗粒）
function ptInPoly(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a[1] > y) !== (b[1] > y)) && (x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1] + 1e-9) + a[0])) c = !c;
  }
  return c;
}
// 在纸面/墙面上撒极淡的颗粒（颜料的沉淀、尘埃）
function speckle(sc, poly, o = {}) {
  const R = rng(o.seed ?? 7), n = o.n ?? 120;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of poly) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const col = o.col ?? mix3(PAL.grey, PAL.cream, .55);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
    if (!ptInPoly(poly, x, y)) continue;
    const r = (o.minR ?? .7) + R() * (o.maxR ?? 1.7);
    sc.fill(ellipse(x, y, r, r * (.5 + R() * .9), 8), col, { layer: o.layer ?? 'mid', t0: o.t0 ?? .5, dur: 0, j: 0, seed: 5, alpha: (o.a ?? .07) * (.5 + R() * .8) });
  }
}
// 极淡的竖向墙纸纹（速写的纸感，不抢主体）
function wallpaper(sc, o) {
  const at = o.at;
  for (let i = 0; i < 7; i++) {
    const x = 40 + i * 280;
    Wsh(sc, [[x, 40], [x + 90, 34], [x + 95, 700], [x + 5, 712]], mix3(PAL.grey, PAL.cream, .55), { a: .035, j: 20, layers: 1, edge: 0, seed: 1700 + i }, 'mid', at(.14 + i * .02), 1.6);
  }
}
// 照片墙：三张小相框 + 图钉（左侧墙面）
function drawPhotoWall(sc, o) {
  const at = o.at, R = rng((o.seed ?? 11) + 720);
  const frames = [
    { x: 214, y: 158, w: 112, h: 136, ang: -.03, col: mix3(PAL.pinkPale, PAL.greyLight, .35), sd: 1710 },
    { x: 330, y: 214, w: 92, h: 116, ang: .04, col: mix3(PAL.bluePale, PAL.stoneCool, .4), sd: 1720 },
    { x: 236, y: 316, w: 104, h: 88, ang: .02, col: mix3(PAL.warm, PAL.greyLight, .35), sd: 1730 },
    { x: 880, y: 240, w: 94, h: 116, ang: -.02, col: mix3(PAL.cream, PAL.bluePale, .4), sd: 1740 },
  ];
  frames.forEach((f, i) => {
    const q = rectPts(f.x, f.y, f.w, f.h, f.ang);
    F(sc, q, [252, 249, 241], 'mid', at(.3 + i * .03), 2, f.sd);
    Wsh(sc, q, mix3(PAL.stone, PAL.cream, .3), { a: .3, j: 5, layers: 2, edge: .25, seed: f.sd + 1 }, 'mid', at(.33 + i * .03), .7);
    inkQuad(sc, q, { w: 2.2, wob: .55, seed: f.sd + 2, gap: .3 }, 'mid', at(.36 + i * .03), .5, .06, .85);
    // 相片内容：一片模糊的暖色 + 地平线 + 一个人影（只作暗示）
    const inner = [lerpP(q[0], q[1], .12), lerpP(q[1], q[2], .1), lerpP(q[2], q[3], .1), lerpP(q[3], q[0], .12)];
    Wsh(sc, inner, mix3(f.col, PAL.greyDeep, .28), { a: .46, j: 4, layers: 2, edge: .15, seed: f.sd + 3 }, 'mid', at(.4 + i * .03), .7);
    Wsh(sc, [lerpP(inner[0], inner[3], .55), lerpP(inner[1], inner[2], .55), lerpP(inner[1], inner[2], .78), lerpP(inner[0], inner[3], .78)], mix3(PAL.grey, PAL.cream, .4), { a: .26, j: 4, layers: 1, edge: 0, seed: f.sd + 7 }, 'mid', at(.44 + i * .03), .6);
    // 人影
    const fx = (inner[0][0] + inner[1][0]) / 2 + f.w * .02, fy = inner[0][1] + f.h * .38;
    Wsh(sc, ellipse(fx, fy, f.w * .12, f.h * .16, 12), mix3(PAL.skin, PAL.cream, .35), { a: .42, j: 3, layers: 1, edge: 0, seed: f.sd + 4 }, 'mid', at(.46 + i * .03), .6);
    Wsh(sc, loop([[fx - f.w * .16, inner[0][1] + f.h * .68], [fx - f.w * .1, fy + f.h * .12], [fx + f.w * .1, fy + f.h * .12], [fx + f.w * .16, inner[0][1] + f.h * .68]], 3), mix3(PAL.bluePale, PAL.stone, .35), { a: .4, j: 4, layers: 1, edge: .1, seed: f.sd + 8 }, 'mid', at(.48 + i * .03), .6);
    Ink(sc, [[inner[0][0] + 8, inner[0][1] + f.h * .62], [inner[1][0] - 6, inner[0][1] + f.h * .64]], { w: 1.1, wob: .5, seed: f.sd + 5, over: 2, gap: .4 }, 'mid', at(.5 + i * .03), .4, .45);
    // 图钉
    Ink(sc, ellipse(f.x + f.w * .5, f.y + 2, 3.2, 3.2, 8), { w: 1.1, wob: .2, seed: f.sd + 6, over: 0 }, 'mid', at(.42 + i * .03), .3, .7);
  });
  // 墙钩 + 一小束垂下来的干花（靠窗一侧）
  const bx = 1156, by = 256;
  Ink(sc, [[bx - 8, by + 2], [bx + 8, by + 2]], { w: 2.2, wob: .3, seed: 1750, over: 2 }, 'mid', at(.5), .4, .8);
  Ink(sc, ellipse(bx, by + 6, 4, 4, 10), { w: 1.3, wob: .2, seed: 1751, over: 1 }, 'mid', at(.51), .35, .8);
  Ink(sc, [[bx, by + 8], [bx + 1, by + 16]], { w: 1.4, wob: .3, seed: 1752, over: 1 }, 'mid', at(.52), .35, .7);
  for (let i = 0; i < 4; i++) {
    const a = .42 + i * .3, L = 46 + R() * 26;
    const mx = bx + Math.cos(a) * L * .45, my = by + 16 + Math.sin(a) * L * .5;
    const tx = bx + Math.cos(a) * L * .92, ty = by + 16 + Math.sin(a) * L * .95;
    Ink(sc, [[bx + (R() - .5) * 4, by + 16], [mx, my], [tx, ty]], { w: 1.3, wob: .6, seed: 1760 + i, over: 2, gap: .4 }, 'mid', at(.56 + i * .04), .55, .5);
    Wsh(sc, ellipse(tx, ty + 4, 3.6, 7, 9), mix3(PAL.violet, PAL.pinkPale, .45), { a: .42, j: 2, layers: 1, edge: .2, seed: 1770 + i }, 'mid', at(.6 + i * .04), .5);
  }
}
// 地毯（在沙发/行李箱前，软边、低对比，不进字幕带）
function drawRug(sc, o) {
  const at = o.at;
  const rug = [[286, 790], [1004, 776], [1116, 838], [1042, 882], [336, 892], [252, 848]];
  F(sc, rug, [250, 244, 232], 'mid', at(.3), 3, 1800);
  Wsh(sc, rug, mix3(PAL.greyLight, PAL.pinkPale, .32), { a: .34, j: 10, layers: 2, edge: .28, seed: 1801 }, 'mid', at(.34), 1.1);
  Wsh(sc, [[380, 812], [980, 800], [1050, 842], [420, 860]], mix3(PAL.grey, PAL.cream, .45), { a: .14, j: 8, layers: 1, edge: 0, seed: 1802 }, 'mid', at(.4), 1.0);
  // 毯边（内缩一圈的边线）+ 织纹
  const inset = [[306, 800], [996, 787], [1094, 840], [1030, 872], [348, 880], [272, 846]];
  Ink(sc, [[inset[0][0], inset[0][1]], [inset[1][0], inset[1][1]], [inset[2][0], inset[2][1]]], { w: 1.8, wob: .8, seed: 1803, over: 5 }, 'mid', at(.46), .7, .42);
  Ink(sc, [[inset[3][0], inset[3][1]], [inset[4][0], inset[4][1]], [inset[5][0], inset[5][1]]], { w: 1.8, wob: .8, seed: 1804, over: 5 }, 'mid', at(.48), .7, .38);
  Ink(sc, [[inset[0][0], inset[0][1]], [inset[5][0], inset[5][1]]], { w: 1.5, wob: .8, seed: 1805, over: 4 }, 'mid', at(.5), .55, .36);
  Ink(sc, [[inset[2][0], inset[2][1]], [inset[3][0], inset[3][1]]], { w: 1.5, wob: .8, seed: 1806, over: 4 }, 'mid', at(.52), .55, .34);
  for (let i = 0; i < 6; i++) Ink(sc, [[430 + i * 108, 812 + (i % 2) * 10], [468 + i * 108, 854 + (i % 3) * 6]], { w: 1.0, wob: .6, seed: 1810 + i, over: 2, gap: .5 }, 'mid', at(.56 + i * .03), .5, .16);
  // 两端的流苏
  for (let i = 0; i < 5; i++) {
    Ink(sc, [[300 + i * 14, 790 + i * 1], [288 + i * 14, 776 + i * 2]], { w: 1.0, wob: .5, seed: 1820 + i, over: 1 }, 'mid', at(.6 + i * .02), .4, .3);
    Ink(sc, [[1050 + i * 12, 880 + i * 1], [1062 + i * 12, 892 + i * 2]], { w: 1.0, wob: .5, seed: 1826 + i, over: 1 }, 'mid', at(.62 + i * .02), .4, .28);
  }
}
// 边桌上的小物：两本书 + 眼镜 + 钥匙 + 杯垫
function drawClutter(sc, o) {
  const at = o.at;
  // 两本书（叠着，微微歪）
  const b1 = rectPts(1366, 704, 62, 12, -.05), b2 = rectPts(1370, 696, 56, 10, .04);
  F(sc, b1, [251, 247, 238], 'mid', at(.5), 1, 1820);
  Wsh(sc, b1, mix3(PAL.blueDeep, PAL.stone, .4), { a: .42, j: 2, layers: 1, edge: .3, seed: 1821 }, 'mid', at(.53), .5);
  inkQuad(sc, b1, { w: 1.3, wob: .35, seed: 1822, gap: .2 }, 'mid', at(.55), .4, .05, .8);
  F(sc, b2, [252, 248, 239], 'mid', at(.52), 1, 1823);
  Wsh(sc, b2, mix3(PAL.brick, PAL.cream, .3), { a: .42, j: 2, layers: 1, edge: .3, seed: 1824 }, 'mid', at(.55), .5);
  inkQuad(sc, b2, { w: 1.2, wob: .35, seed: 1825, gap: .2 }, 'mid', at(.57), .4, .05, .75);
  Ink(sc, [[1370, 696], [1420, 693]], { w: 1.1, wob: .4, seed: 1826, over: 2 }, 'mid', at(.58), .3, .5);
  // 折起来放在书上的眼镜
  Ink(sc, ellipse(1396, 690, 9, 5.5, 12), { w: 1.4, wob: .3, seed: 1827, over: 1 }, 'mid', at(.6), .4, .7);
  Ink(sc, ellipse(1414, 688, 9, 5.5, 12), { w: 1.4, wob: .3, seed: 1828, over: 1 }, 'mid', at(.61), .4, .7);
  Ink(sc, [[1405, 689], [1407, 688]], { w: 1.1, wob: .2, seed: 1829, over: 1 }, 'mid', at(.62), .3, .7);
  Ink(sc, [[1422, 688], [1434, 692]], { w: 1.1, wob: .3, seed: 1830, over: 1 }, 'mid', at(.63), .3, .55);
  // 钥匙（一串）
  Ink(sc, ellipse(1436, 726, 7, 5, 10), { w: 1.4, wob: .3, seed: 1831, over: 1 }, 'mid', at(.62), .35, .7);
  Ink(sc, [[1442, 726], [1464, 731], [1464, 733]], { w: 1.2, wob: .3, seed: 1832, over: 1 }, 'mid', at(.64), .3, .6);
  Ink(sc, [[1462, 731], [1468, 728], [1468, 739]], { w: 1.1, wob: .3, seed: 1833, over: 1 }, 'mid', at(.65), .3, .55);
  Ink(sc, [[1446, 732], [1452, 734]], { w: 1.0, wob: .2, seed: 1834, over: 1 }, 'mid', at(.66), .25, .45);
  // 桌上的一小片杯垫（在杯下）
  Wsh(sc, ellipse(1462, 716, 44, 10, 14), mix3(PAL.stone, PAL.cream, .35), { a: .3, j: 3, layers: 1, edge: .2, seed: 1835 }, 'mid', at(.5), .6);
}
// 窗台上的一小支干花（插在小铁罐里）
function drawDriedFlowers(sc, o) {
  const at = o.at, R = rng((o.seed ?? 11) + 760);
  const x = 1612, y = 640;
  // 小铁罐
  F(sc, [[x - 16, y], [x - 13, y - 34], [x + 14, y - 32], [x + 17, y + 2]], [252, 249, 240], 'mid', at(.56), 2, 1850);
  Wsh(sc, [[x - 16, y], [x - 13, y - 34], [x + 14, y - 32], [x + 17, y + 2]], mix3(PAL.grey, PAL.stone, .4), { a: .4, j: 3, layers: 2, edge: .3, seed: 1851 }, 'mid', at(.58), .7);
  Ink(sc, [[x - 17, y], [x - 14, y - 34]], { w: 1.6, wob: .3, seed: 1852, over: 2 }, 'mid', at(.6), .35);
  Ink(sc, [[x + 17, y + 2], [x + 14, y - 32]], { w: 1.6, wob: .3, seed: 1853, over: 2 }, 'mid', at(.61), .35);
  Ink(sc, ellipse(x, y - 33, 14, 4, 12), { w: 1.3, wob: .3, seed: 1854, over: 1 }, 'mid', at(.62), .3, .7);
  // 干花枝
  for (let i = 0; i < 6; i++) {
    const a = -2.2 + i * .26 + (R() - .5) * .12, L = 58 + R() * 40;
    const tx = x + Math.cos(a) * L * .7, ty = y - 34 + Math.sin(a) * L * .8;
    Ink(sc, [[x + (R() - .5) * 8, y - 34], [x + Math.cos(a) * L * .4, y - 34 + Math.sin(a) * L * .5], [tx, ty]], { w: 1.2, wob: .6, seed: 1860 + i, over: 2, gap: .4 }, 'mid', at(.64 + i * .03), .5, .5);
    Wsh(sc, ellipse(tx, ty, 4 + R() * 3, 7 + R() * 4, 10), mix3(PAL.pinkPale, PAL.violet, .5), { a: .3, j: 2, layers: 1, edge: .2, seed: 1870 + i }, 'mid', at(.68 + i * .03), .45);
  }
}
// 角落的盆栽（左墙脚，几片叶子）
function drawPlant(sc, o) {
  const at = o.at;
  const x = 196, y = 858;
  // 花盆
  const pot = [[x - 30, y - 56], [x + 30, y - 58], [x + 22, y], [x - 22, y + 2]];
  F(sc, pot, [252, 248, 238], 'mid', at(.44), 2, 1880);
  Wsh(sc, pot, mix3(PAL.brick, PAL.stone, .45), { a: .44, j: 4, layers: 2, edge: .3, seed: 1881 }, 'mid', at(.47), .7);
  inkQuad(sc, pot, { w: 1.9, wob: .45, seed: 1882, gap: .25 }, 'mid', at(.5), .45, .06, .85);
  Ink(sc, [[x - 32, y - 56], [x + 32, y - 58]], { w: 1.6, wob: .4, seed: 1883, over: 3 }, 'mid', at(.52), .35, .75);
  // 叶（墨线 + 淡彩，朝窗歪）
  const leaves = [[-0.4, 120], [0.3, 140], [1.0, 112], [1.7, 128], [2.3, 96], [-1.1, 92]];
  leaves.forEach(([ang, L], i) => {
    const a = ang - .5 + Math.sin(i * 1.7) * .2;
    const tx = x + Math.cos(a) * L * .55, ty = y - 58 + Math.sin(a) * L * .8 - L * .25;
    const mx = x + Math.cos(a) * L * .3, my = y - 58 - L * .3;
    Ink(sc, [[x + (i - 2.5) * 4, y - 58], [mx, my], [tx, ty]], { w: 1.5, wob: .6, seed: 1890 + i, over: 2, gap: .35 }, 'mid', at(.54 + i * .03), .6, .55);
    Wsh(sc, loop([[mx - 12, my + 8], [mx + 2, my - 16], [mx + 16, my + 4], [mx + 2, my + 16]], 3), mix3(PAL.green, PAL.greyLight, .35), { a: .3, j: 5, layers: 1, edge: .2, seed: 1900 + i }, 'mid', at(.58 + i * .03), .6);
  });
  Wsh(sc, ellipse(x, y + 4, 42, 9, 12), mix3(PAL.grey, PAL.cream, .35), { a: .22, j: 3, layers: 1, edge: 0, seed: 1910 }, 'mid', at(.5), .6);
}
// 边桌上的小蜡烛（暖点光源，火苗会呼吸）
function drawCandle(sc, o) {
  const at = o.at, x = 1548, y = 706;
  Wsh(sc, ellipse(x, y + 2, 26, 7, 12), mix3(PAL.grey, PAL.cream, .3), { a: .24, j: 3, layers: 1, edge: 0, seed: 1920 }, 'mid', at(.54), .6);
  F(sc, [[x - 13, y], [x - 12, y - 40], [x + 12, y - 40], [x + 13, y]], [253, 250, 242], 'mid', at(.55), 2, 1921);
  Wsh(sc, [[x - 13, y], [x - 12, y - 40], [x + 12, y - 40], [x + 13, y]], mix3(PAL.cream, PAL.pinkPale, .3), { a: .34, j: 3, layers: 2, edge: .3, seed: 1922 }, 'mid', at(.57), .6);
  inkQuad(sc, [[x - 13, y], [x - 12, y - 40], [x + 12, y - 40], [x + 13, y]], { w: 1.5, wob: .35, seed: 1923, gap: .2 }, 'mid', at(.59), .4, .05, .8);
  Ink(sc, ellipse(x, y - 40, 12, 3.4, 10), { w: 1.2, wob: .3, seed: 1924, over: 1 }, 'mid', at(.6), .3, .7);
  // 火苗（静态底 + 动态光晕在 addAirDyn）
  Wsh(sc, ellipse(x, y - 47, 3.4, 7.5, 10), mix3(PAL.lamp, [255, 250, 220], .4), { a: .55, j: 1, layers: 1, edge: .2, seed: 1925 }, 'mid', at(.62), .5);
  Ink(sc, [[x, y - 40], [x + .8, y - 45], [x, y - 52], [x - .6, y - 45]], { w: 1.0, wob: .2, seed: 1926, over: 0 }, 'mid', at(.64), .3, .65);
}
// 行李旁的旧鞋 / 折好的衣服（收拾旧物的现场感）
function drawFloorProps(sc, o) {
  const at = o.at;
  // 一双旧鞋（鞋尖朝左前方）
  for (const [sx, sy, sd] of [[1216, 848, 1940], [1262, 854, 1945]]) {
    const q = loop([[sx - 34, sy - 6], [sx + 12, sy - 18], [sx + 30, sy - 8], [sx + 18, sy + 10], [sx - 26, sy + 8]], 3);
    F(sc, q, [252, 248, 239], 'mid', at(.5), 2, sd);
    Wsh(sc, q, mix3(PAL.brick, PAL.stone, .4), { a: .38, j: 5, layers: 2, edge: .25, seed: sd + 1 }, 'mid', at(.53), .7);
    InkPoly(sc, q, { w: 1.7, wob: .55, seed: sd + 2, gap: .3 }, 'mid', at(.56), .5, .06, .8);
    Ink(sc, [[sx - 20, sy - 2], [sx + 4, sy - 8]], { w: 1.1, wob: .4, seed: sd + 3, over: 1 }, 'mid', at(.6), .3, .55);
  }
  // 折好的旧毛衣（在箱子右边）
  const sw = loop([[1300, 838], [1392, 828], [1410, 862], [1398, 892], [1314, 898], [1292, 872]], 3);
  F(sc, sw, [252, 249, 240], 'mid', at(.52), 2, 1950);
  Wsh(sc, sw, mix3(PAL.pinkPale, PAL.greyLight, .35), { a: .34, j: 6, layers: 2, edge: .25, seed: 1951 }, 'mid', at(.55), .7);
  InkPoly(sc, sw, { w: 1.7, wob: .6, seed: 1952, gap: .3 }, 'mid', at(.58), .5, .06, .8);
  Ink(sc, [[1314, 850], [1390, 842]], { w: 1.2, wob: .6, seed: 1953, over: 2, gap: .4 }, 'mid', at(.62), .4, .5);
  Ink(sc, [[1322, 866], [1396, 858]], { w: 1.1, wob: .6, seed: 1954, over: 2, gap: .4 }, 'mid', at(.64), .4, .45);
}
// 窗光落在地板 / 墙上的亮斑 + 空气里的尘（动态）
function windowLightDyn(sc, o) {
  const gain = o.windowLight ?? 1;
  if (gain <= 0) return;
  sc.dyn((ctx, t) => {
    const a = clamp((t - .5) / 1.6) * gain;
    if (a <= 0) return;
    const br = 1 + .06 * Math.sin(t * .55);
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    // 地板上的窗光亮斑（只在地板范围 y>752）
    const g = ctx.createLinearGradient(1300, 760, 1480, 1010);
    g.addColorStop(0, `rgba(255,246,222,${.18 * a})`);
    g.addColorStop(.55, `rgba(250,240,218,${.09 * a * br})`);
    g.addColorStop(1, 'rgba(250,240,218,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(1256, 762); ctx.lineTo(1730, 756); ctx.lineTo(1624, 1006); ctx.lineTo(1092, 1002); ctx.closePath(); ctx.fill();
    // 窗框投在地板上的斜影
    ctx.strokeStyle = `rgba(138,144,148,${.055 * a})`; ctx.lineWidth = 3;
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(1318 + i * 246, 764); ctx.lineTo(1160 + i * 292, 998); ctx.stroke(); }
    // 窗台右下的暖反光（不越过窗台）
    const g2 = ctx.createLinearGradient(1580, 640, 1860, 760);
    g2.addColorStop(0, `rgba(255,242,218,${.1 * a})`); g2.addColorStop(1, 'rgba(255,242,218,0)');
    ctx.fillStyle = g2; ctx.fillRect(1560, 640, 300, 140);
    ctx.restore();
    // 光柱里的尘埃
    glow(ctx, t, 1450, 830, 320, PAL.lamp, .045 * a, { breathe: .14, rate: .7 });
  }, 'front');
  const motes = moteFx({ seed: (o.seed ?? 11) + 930, n: 26, x0: 1040, x1: 1740, y0: 700, y1: 1000 });
  sc.dyn((ctx, t) => motes(ctx, t, { gain: clamp((t - .7) / 1.6) * .9 * gain }), 'front');
}
// 蜡烛火苗的光晕（呼吸 + 轻微跳动）
function candleGlowDyn(sc, o) {
  if (o.candle === false) return;
  sc.dyn((ctx, t) => {
    const a = clamp((t - .8) / 1.4); if (a <= 0) return;
    const flick = .8 + .2 * Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1);
    glow(ctx, t, 1548, 656, 140, PAL.lamp, .14 * a * flick, { breathe: .2, rate: 2.2 });
    glow(ctx, t, 1548, 690, 220, PAL.warm, .07 * a, { breathe: .18, rate: 1.1, phase: .6 });
    // 火苗本体
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const fl = 1 + .12 * Math.sin(t * 6.1);
    const g = ctx.createRadialGradient(1548, 650, 0, 1548, 650, 10 * fl);
    g.addColorStop(0, `rgba(255,250,225,${.85 * a})`); g.addColorStop(.6, `rgba(248,214,140,${.5 * a})`); g.addColorStop(1, 'rgba(248,214,140,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(1548, 650, 5 * fl, 11 * fl, 0, 0, TAU); ctx.fill(); ctx.restore();
  }, 'mid');
}
// 墙面 / 地面 / 家具的颗粒质感
function grainPass(sc, o, at) {
  speckle(sc, [[0, 0], [1200, 0], [1180, 752], [0, 752]], { n: 150, seed: (o.seed ?? 11) + 940, a: .05, col: mix3(PAL.grey, PAL.cream, .5), t0: at(.55) });
  speckle(sc, [[200, 768], [1700, 768], [1700, 1080], [200, 1080]], { n: 130, seed: (o.seed ?? 11) + 941, a: .045, col: mix3(PAL.stone, PAL.cream, .4), t0: at(.6) });
  speckle(sc, [[240, 640], [940, 640], [940, 800], [240, 800]], { n: 70, seed: (o.seed ?? 11) + 942, a: .04, col: mix3(PAL.cream, PAL.grey, .35), t0: at(.62) });
}
// 更深的木地板：长纹 + 节疤
function drawFloorExtra(sc, o) {
  const at = o.at;
  for (let i = 0; i < 9; i++) {
    const y = 800 + i * 30, x0 = -60 + (i % 3) * 90;
    Ink(sc, [[x0, y], [x0 + 400, y - 3], [x0 + 900, y + 2], [x0 + 1500, y - 2]], { w: 1.0, wob: .8, seed: 1960 + i, over: 5, gap: .55 }, 'mid', at(.48 + i * .02), .7, .14);
  }
  for (const [x, y, sd] of [[520, 900, 1990], [1180, 960, 1995], [860, 1010, 1999]]) {
    Ink(sc, ellipse(x, y, 26, 8, 12), { w: 1.0, wob: .5, seed: sd, over: 2 }, 'mid', at(.62), .45, .2);
    Ink(sc, ellipse(x + 4, y + 1, 12, 3.6, 10), { w: .9, wob: .4, seed: sd + 1, over: 1 }, 'mid', at(.64), .4, .18);
  }
}

function roomWide(o) {
  const layers = o.flat ? [{ id: 'back', par: 1 }, { id: 'mid', par: 1 }, { id: 'front', par: 1 }]
    : [{ id: 'back', par: .45 }, { id: 'mid', par: .9 }, { id: 'front', par: 1 }];
  const sc = new Scene({ w: 1920, h: 1080, base: o.base ?? { x: 960, y: 545 }, layers });
  const R = rng(o.seed ?? 501);
  const at = f => (o.t0 ?? 0) + f * (o.reveal ?? 2.4);
  const ctxO = { seed: o.seed, at, t0: o.t0 ?? 0, reveal: o.reveal ?? 2.4 };

  drawWindowBack(sc, { ...ctxO, rain: o.rain ?? 1, bokeh: o.bokeh ?? .8, dropN: o.dropN ?? 30, rainN: o.rainN });
  drawShell(sc, ctxO);
  if (o.wallpaper !== false) wallpaper(sc, ctxO);
  if (o.photoWall !== false) drawPhotoWall(sc, ctxO);
  if (o.rug !== false) drawRug(sc, ctxO);
  drawWindowMid(sc, { ...ctxO, glassFog: o.glassFog ?? 1 });
  if (o.flowers !== false) drawDriedFlowers(sc, ctxO);
  drawLamp(sc, ctxO);
  drawSofa(sc, { ...ctxO, coat: o.coat });
  drawSideTable(sc, ctxO);
  if (o.clutter !== false) drawClutter(sc, ctxO);
  if (o.candle !== false) drawCandle(sc, ctxO);
  if (o.plant !== false) drawPlant(sc, ctxO);
  if (o.floorExtra !== false) drawFloorExtra(sc, ctxO);
  // 窗台旧物：一张靠玻璃立着的旧照片（底部落在窗台上，微微后仰）
  if (o.sillPhoto !== false) {
    Wsh(sc, [[1256, 646], [1398, 641], [1406, 660], [1252, 666]], mix3(PAL.grey, PAL.cream, .35), { a: .2, j: 4, layers: 1, edge: 0, seed: 300 }, 'mid', at(.5), .7);
    const tf = ([x, y]) => { const c = Math.cos(.02), s = Math.sin(.02); const yy = y * .9; return [1268 + x * c - yy * s, 562 + x * s + yy * c]; };
    addParts(sc, photoParts(118, 94, (o.seed ?? 11) + 300, { near: false }), tf, 'mid', at, .55, .7);
  }
  // 杯 / 行李箱 / 信
  if (o.cup) drawCup(sc, { ...ctxO, ...o.cup });
  if (o.case !== false) {
    const cg = { ...ROOM.caseC, ...(o.case || {}) };
    if (o.case && o.case.dynLid) {
      drawCaseBody(sc, { ...ctxO, ...cg, open: true });
      sc.dyn(caseLidFx({ ...cg, theta: o.case.theta }), 'mid');
    } else {
      drawCaseBody(sc, { ...ctxO, ...cg, open: (cg.lid ?? 1) > .05 });
      drawLidStatic(sc, { ...ctxO, ...cg });
    }
  }
  // 搭在沙发上的信（可轻颤）
  if (o.letter && o.letter.mode === 'onSofa') {
    const L = o.letter;
    const tf = ([x, y]) => { const c = Math.cos(L.ang ?? -.08), s = Math.sin(L.ang ?? -.08); const dx = x, dy = y; return [(L.x ?? 520) + dx * c - dy * s, (L.y ?? 640) + dx * s + dy * c]; };
    const parts = letterParts(240, 88, (o.seed ?? 11) + 400, { damp: true });
    if (L.flutter) {
      sc.dyn((ctx, t) => {
        const p = clamp((t - (L.t0 ?? .6)) / (L.dur ?? 1.2));
        if (p <= 0) return;
        const fl = Math.sin(t * 2.1 + 1) * .012 + Math.sin(t * 5.3) * .004;
        const tf2 = ([x, y]) => { const c = Math.cos((L.ang ?? -.08) + fl), s = Math.sin((L.ang ?? -.08) + fl); const c2 = Math.cos((L.ang ?? -.08)), s2 = Math.sin((L.ang ?? -.08)); const dx = x, dy = y; return [(L.x ?? 520) + dx * c - dy * s + 2 * Math.sin(t * 2.6), (L.y ?? 640) + dx * s + dy * c + 1.2 * Math.sin(t * 3.1)]; };
        drawParts(ctx, parts, tf2, 1, p);
      }, 'mid');
    } else addParts(sc, parts, tf, 'mid', at, L.t0f ?? .55, .8);
  }
  // 人物
  if (o.character) buildCharacter(sc, o, at);
  // 收拾旧物的现场：鞋 / 折好的毛衣
  if (o.floorProps) drawFloorProps(sc, ctxO);
  // 纸面颗粒质感（墙 / 地 / 沙发）
  grainPass(sc, o, at);
  // 动态空气层
  addAirDyn(sc, o, at);
  windowLightDyn(sc, o);
  candleGlowDyn(sc, o);
  return sc;
}

// 人物配置（2.3 / 6.1 / 5.3 / 8.6 用的近景手另算）
function buildCharacter(sc, o, at) {
  const C = o.character;
  const place = { ...C.place };
  if (C.pose === 'kneel') {
    herDyn(sc, {
      place, t0: at(0) + (C.t0f ?? .05), dur: C.dur ?? 1.5, layer: 'mid', seed: C.seed ?? 61,
      face: C.face, tear: C.tear,
      poseAt: t => {
        const pose = herKneel({ lean: .46, nod: -.34, headYaw: C.headYaw ?? -.1, hairBlow: .1 });
        if (C.handPath) {
          const h = C.handPath(t);
          pose.handL = h.handL ?? pose.handL; pose.handR = h.handR ?? pose.handR;
          pose.elbL = h.elbL ?? pose.elbL; pose.elbR = h.elbR ?? pose.elbR;
        }
        return pose;
      },
    });
  } else {
    herDyn(sc, {
      place, t0: at(0) + (C.t0f ?? .05), dur: C.dur ?? 1.5, layer: 'mid', seed: C.seed ?? 31,
      face: C.face, tear: C.tear,
      poseAt: t => {
        const pose = herSitFloor({ lean: .4, nod: -.42, headYaw: C.headYaw ?? -.22, hairBlow: .08 });
        if (C.handPath) {
          const h = C.handPath(t);
          pose.handR = h.handR ?? pose.handR; pose.handL = h.handL ?? pose.handL;
          pose.elbR = h.elbR ?? pose.elbR; pose.elbL = h.elbL ?? pose.elbL;
        }
        return pose;
      },
    });
  }
}

// 动态空气：灯晕 / 湿气 / 微尘 / 蒸汽 / 光带
function addAirDyn(sc, o, at) {
  sc.dyn((ctx, t) => {
    const a = clamp((t - .5) / 1.2) * (o.lampGain ?? 1);
    if (a <= 0) return;
    const Lp = ROOM.lamp;
    glow(ctx, t, Lp.x + 20, Lp.shadeY + 60, 520, PAL.lamp, .09 * a, { breathe: .12, rate: .8 });
    glow(ctx, t, Lp.x + 120, Lp.shadeY + 160, 660, PAL.warm, .035 * a, { breathe: .16, rate: .55, phase: 1.1 });
    // 灯罩下漏出的锥形光（极淡）
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(Lp.x, Lp.shadeY + 80, Lp.x + 220, 880);
    g.addColorStop(0, `rgba(235,205,150,${.14 * a})`);
    g.addColorStop(.6, `rgba(238,214,170,${.07 * a})`);
    g.addColorStop(1, 'rgba(238,214,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(Lp.x - 40, Lp.shadeY + 80); ctx.lineTo(Lp.x + 120, Lp.shadeY + 80); ctx.lineTo(Lp.x + 400, 900); ctx.lineTo(Lp.x - 180, 900); ctx.closePath(); ctx.fill();
    ctx.restore();
  }, 'mid');
  if (o.damp !== 0) {
    const damp = dampFx({ seed: (o.seed ?? 11) + 500, n: 10, x0: 200, y0: 120, x1: 1750, y1: 900, gain: .8 });
    sc.dyn((ctx, t) => damp(ctx, t, { gain: clamp((t - .8) / 2) * (o.damp ?? 1) * .8 }), 'mid');
  }
  if (o.warmDust) {
    const motes = moteFx({ seed: (o.seed ?? 11) + 510, n: 24, x0: 120, x1: 1500, y0: 160, y1: 760 });
    sc.dyn((ctx, t) => motes(ctx, t, { gain: clamp((t - .6) / 1.5) * (o.motes ?? .7) }), 'front');
  }
  if (o.steam) {
    const steam = steamFx({ seed: (o.seed ?? 11) + 520, x: o.steam.x, y: o.steam.y, h: 210, w: 34, n: 8 });
    sc.dyn((ctx, t) => steam(ctx, t, { gain: clamp((t - 1.2) / 1.6) }), 'front');
  }
  airLayer(sc, o);
}
// 空气雾（整片极淡）：包一层 dyn
function airLayer(sc, o) {
  sc.dyn((ctx, t) => {
    airVeilDraw(ctx, t, { a: (o.veil ?? .06), y0: 0, y1: 1080, col: o.veilCol ?? PAL.bluePale });
  }, 'front');
}
function airVeilDraw(ctx, t, o) {
  const a = (o.a ?? .1) * (1 + .18 * Math.sin(t * .6));
  const g = ctx.createLinearGradient(0, o.y0 ?? 0, 0, o.y1 ?? 1080);
  g.addColorStop(0, rgba(o.col, a * .55));
  g.addColorStop(.55, rgba(o.col, a));
  g.addColorStop(1, rgba(o.col, a * .35));
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, o.y0 ?? 0, 1920, (o.y1 ?? 1080) - (o.y0 ?? 0)); ctx.restore();
}

// ---------------- 抽屉视图（5.3） ----------------
function drawerView(o) {
  const sc = new Scene({ w: 1920, h: 1080, base: { x: 960, y: 560 }, layers: [{ id: 'back', par: 1 }, { id: 'mid', par: 1 }, { id: 'front', par: 1 }] });
  const at = f => (o.t0 ?? 0) + f * (o.reveal ?? 2.2);
  const R = rng(o.seed ?? 531);
  // ---- 背景：地板 + 窗光（虚） ----
  F(sc, [[0, 0], [1920, 0], [1920, 1080], [0, 1080]], PAPER, 'back', 0, 0);
  Wsh(sc, [[-160, -160], [2080, -160], [2080, 1140], [-160, 1140]], mix3(PAL.cream, PAL.greyLight, .4), { a: .18, j: 52, layers: 2, edge: 0, seed: 1100, freq: .004 }, 'back', at(.02), 1.4);
  Wsh(sc, [[-160, 470], [2080, 430], [2080, 1140], [-160, 1140]], mix3(PAL.stone, PAL.greyLight, .45), { a: .22, j: 44, layers: 2, edge: 0, seed: 1101, freq: .006 }, 'back', at(.06), 1.4);
  for (let i = 0; i < 5; i++) Ink(sc, [[-40, 520 + i * 96], [600, 514 + i * 96], [1300, 518 + i * 96], [1960, 512 + i * 96]], { w: 1.2, wob: 1.0, seed: 1110 + i, over: 6, gap: .55 }, 'back', at(.1 + i * .02), .8, .16);
  Wsh(sc, [[900, -100], [2080, -100], [2080, 760], [820, 940]], mix3(PAL.lamp, PAL.cream, .4), { a: .16, j: 44, layers: 2, edge: 0, seed: 1102, freq: .005 }, 'back', at(.08), 1.5);
  // ---- 抽屉（木盒） ----
  const Q = [[620, 300], [1340, 330], [1580, 806], [410, 762]];        // 内口四点（TL,TR,BR,BL）
  const B = [quadMap(Q, .04, .1), quadMap(Q, .96, .11), quadMap(Q, .95, .92), quadMap(Q, .05, .9)]; // 内底
  const outer = [[Q[0][0] - 40, Q[0][1] - 48], [Q[1][0] + 46, Q[1][1] - 34], [Q[2][0] + 66, Q[2][1] + 58], [Q[3][0] - 58, Q[3][1] + 72]];
  // 影子
  Wsh(sc, ellipse(1000, 846, 650, 104, 22), mix3(PAL.greyDeep, PAL.cream, .3), { a: .22, j: 24, layers: 2, edge: 0, seed: 1103 }, 'mid', at(.1), 1.2);
  // 外框木头
  F(sc, outer, [250, 243, 231], 'mid', at(.12), 3, 1104);
  Wsh(sc, outer, mix3(PAL.stone, PAL.brick, .55), { a: .44, j: 12, layers: 2, edge: .25, seed: 1105 }, 'mid', at(.16), 1.1);
  // 内壁（后 / 右 / 前 / 左）
  const walls = [
    [outer[0], outer[1], B[1], B[0]],
    [outer[1], outer[2], B[2], B[1]],
    [outer[3], outer[2], B[2], B[3]],
    [outer[0], outer[3], B[3], B[0]],
  ];
  walls.forEach((w, i) => {
    F(sc, w, [248, 240, 228], 'mid', at(.18 + i * .02), 2, 1110 + i);
    Wsh(sc, w, mix3(PAL.brick, PAL.stone, i === 2 ? .35 : .5), { a: i === 2 ? .34 : .4, j: 7, layers: 2, edge: .18, seed: 1120 + i }, 'mid', at(.2 + i * .02), .9);
  });
  // 内底：晒旧的衬纸
  F(sc, B, [253, 249, 240], 'mid', at(.24), 2, 1130);
  Wsh(sc, B, mix3(PAL.cream, PAL.stone, .3), { a: .28, j: 10, layers: 2, edge: .2, seed: 1131 }, 'mid', at(.28), 1.1);
  Wsh(sc, [quadMap(Q, .05, .4), quadMap(Q, .95, .4), quadMap(Q, .95, .7), quadMap(Q, .05, .7)], mix3(PAL.pinkPale, PAL.cream, .4), { a: .1, j: 12, layers: 1, edge: 0, seed: 1132 }, 'mid', at(.32), 1.1);
  // 木纹：外框上沿、两侧（顺着长边）+ 两个节疤
  for (let i = 0; i < 5; i++) {
    const v = i / 5;
    const p = [lerpP(outer[0], outer[1], .1 + v * .12), lerpP(outer[0], outer[1], .5 + v * .12), lerpP(outer[0], outer[1], .9 + v * .1)];
    Ink(sc, p.length ? [[outer[0][0] + 30, outer[0][1] - 8 + i * 8], [outer[0][0] + 300, outer[0][1] - 14 + i * 8], [outer[0][0] + 610, outer[0][1] - 10 + i * 7], [outer[0][0] + 800, outer[0][1] - 16 + i * 7]] : [], { w: 1.2, wob: .9, seed: 1140 + i, over: 5, gap: .5 }, 'mid', at(.3 + i * .02), .8, .3);
  }
  for (const [x, y, sd] of [[520, 700, 1150], [1450, 700, 1151]]) {
    Ink(sc, ellipse(x, y, 22, 8, 12), { w: 1.2, wob: .5, seed: sd, over: 2 }, 'mid', at(.38), .5, .35);
    Ink(sc, ellipse(x + 3, y + 1, 10, 3.6, 10), { w: .9, wob: .4, seed: sd + 1, over: 1 }, 'mid', at(.4), .4, .3);
  }
  // 左右木框上的短木纹
  for (let i = 0; i < 4; i++) {
    Ink(sc, [[outer[0][0] + 26, outer[0][1] + 60 + i * 40], [outer[3][0] + 36, outer[3][1] + 40 + i * 44], [outer[3][0] + 10, outer[3][1] + 52 + i * 44]], { w: 1.1, wob: .8, seed: 1155 + i, over: 4, gap: .5 }, 'mid', at(.34 + i * .02), .7, .26);
    Ink(sc, [[outer[1][0] - 24, outer[1][1] + 44 + i * 40], [outer[2][0] - 34, outer[2][1] + 30 + i * 44]], { w: 1.1, wob: .8, seed: 1159 + i, over: 4, gap: .5 }, 'mid', at(.34 + i * .02), .7, .24);
  }
  // 匣内的深度：靠墙的一圈更暗
  sc.hatch([[outer[0][0] + 20, outer[0][1] + 20], [outer[1][0] - 20, outer[1][1] + 18], [outer[1][0] - 40, outer[1][1] + 70], [outer[0][0] + 30, outer[0][1] + 78]], { ang: Math.PI / 3.3, gap: 13, w: 1.0, seed: 1165, thin: .4 }, { layer: 'mid', t0: at(.42), dur: 1.0, alpha: .14 });
  // 抽屉前沿的铜把手
  const kx = (outer[3][0] + outer[2][0]) / 2, ky = (outer[3][1] + outer[2][1]) / 2 + 26;
  Wsh(sc, ellipse(kx, ky, 26, 12, 12), mix3(PAL.lampDeep, PAL.stone, .4), { a: .4, j: 3, layers: 1, edge: .3, seed: 1160 }, 'mid', at(.44), .7);
  Ink(sc, ellipse(kx, ky, 26, 12, 12), { w: 2.0, wob: .4, seed: 1161, over: 2 }, 'mid', at(.46), .5, .8);
  Ink(sc, ellipse(kx, ky + 8, 8, 4, 10), { w: 1.1, wob: .3, seed: 1162, over: 1 }, 'mid', at(.48), .35, .5);
  // 外框轮廓（直边）
  inkQuad(sc, outer, { w: 2.6, wob: .8, seed: 1170, gap: .3 }, 'mid', at(.42), .7, .08, .9);
  inkQuad(sc, Q, { w: 1.6, wob: .7, seed: 1171, gap: .4 }, 'mid', at(.36), .6, .07, .55);
  // ---- 抽屉里的旧物 ----
  // 一叠手写信（三封，压在一起）
  const stacks = [
    { q: [quadMap(B, .05, .1), quadMap(B, .40, .06), quadMap(B, .42, .38), quadMap(B, .07, .44)], sd: 1200 },
    { q: [quadMap(B, .08, .14), quadMap(B, .43, .1), quadMap(B, .45, .44), quadMap(B, .1, .5)], sd: 1210 },
    { q: [quadMap(B, .11, .18), quadMap(B, .46, .15), quadMap(B, .48, .5), quadMap(B, .13, .56)], sd: 1220 },
  ];
  stacks.forEach((s, si) => {
    const ang = Math.atan2(s.q[1][1] - s.q[0][1], s.q[1][0] - s.q[0][0]);
    const w0 = Math.hypot(s.q[1][0] - s.q[0][0], s.q[1][1] - s.q[0][1]) / 300, h0 = Math.hypot(s.q[3][0] - s.q[0][0], s.q[3][1] - s.q[0][1]) / 118;
    const tf = ([x, y]) => { const c = Math.cos(ang), sn = Math.sin(ang); return [s.q[0][0] + (x * c - y * sn) * w0, s.q[0][1] + (x * sn + y * c) * h0]; };
    addParts(sc, letterParts(300, 118, s.sd, {}), tf, 'mid', at, .5 + si * .06, .8);
  });
  // 旧票根（散在右边）
  for (let i = 0; i < 5; i++) {
    const u = .55 + R() * .36, v = .5 + R() * .34;
    const c = quadMap(B, u, v), w = 76 + R() * 30, h = 34 + R() * 14, ang = (R() - .5) * .9;
    const q = rectPts(c[0] - w / 2, c[1] - h / 2, w, h, ang);
    F(sc, q, [253, 248, 239], 'mid', at(.6 + i * .05), 1, 1240 + i);
    Wsh(sc, q, mix3(i % 2 ? PAL.orange : PAL.pink, PAL.cream, .32), { a: .4, j: 3, layers: 1, edge: .22, seed: 1250 + i }, 'mid', at(.62 + i * .05), .5);
    inkQuad(sc, q, { w: 1.3, wob: .4, seed: 1260 + i, gap: .35 }, 'mid', at(.64 + i * .05), .4, .06, .7);
    Ink(sc, [[c[0] - w * .22, c[1]], [c[0] + w * .2, c[1] + 1]], { w: .9, wob: .4, seed: 1270 + i, over: 1, gap: .4 }, 'mid', at(.66 + i * .05), .3, .38);
    Ink(sc, ellipse(q[0][0] + 6, q[0][1] + h * .5, 2.6, 2.6, 8), { w: .8, wob: .2, seed: 1280 + i, over: 0 }, 'mid', at(.68 + i * .05), .25, .5);
  }
  // 一条旧丝带 / 红绳
  Ink(sc, [[quadMap(B, .3, .78)[0], quadMap(B, .3, .78)[1]], [quadMap(B, .4, .72)[0], quadMap(B, .4, .72)[1]], [quadMap(B, .52, .88)[0], quadMap(B, .52, .88)[1]]], { w: 2.2, wob: 1.1, seed: 1290, over: 3, gap: .2 }, 'mid', at(.72), .6, .35, .55);
  // 抽屉里的旧怀表（表盘 + 表链）
  {
    const c = quadMap(B, .8, .62);
    const rr = 22;
    Ink(sc, ellipse(c[0], c[1], rr, rr, 16), { w: 1.9, wob: .4, seed: 1294, over: 2 }, 'mid', at(.7), .5, .75);
    Wsh(sc, ellipse(c[0], c[1], rr - 4, rr - 4, 14), mix3(PAL.cream, PAL.stone, .35), { a: .3, j: 2, layers: 1, edge: .2, seed: 1295 }, 'mid', at(.72), .5);
    Ink(sc, ellipse(c[0], c[1], rr - 8, rr - 8, 12), { w: .9, wob: .3, seed: 1296, over: 1 }, 'mid', at(.74), .35, .5);
    Ink(sc, [[c[0], c[1]], [c[0] + 8, c[1] - 5]], { w: 1.2, wob: .2, seed: 1297, over: 1 }, 'mid', at(.76), .3, .7);
    Ink(sc, [[c[0], c[1]], [c[0] - 3, c[1] - 10]], { w: .9, wob: .2, seed: 1298, over: 0 }, 'mid', at(.77), .25, .6);
    // 表链：一小段弯曲的墨线
    const a0 = quadMap(B, .78, .7), a1 = quadMap(B, .86, .78), a2 = quadMap(B, .93, .74);
    Ink(sc, [a0, a1, a2], { w: 1.5, wob: .8, seed: 1299, over: 2, gap: .3 }, 'mid', at(.78), .45, .6);
  }
  // 另外两张散落的旧照片（只露一角）
  for (let i = 0; i < 2; i++) {
    const c = quadMap(B, .58 + i * .1, .22 + i * .3);
    const q = rectPts(c[0] - 54, c[1] - 38, 108, 76, .12 - i * .2);
    F(sc, q, [252, 249, 241], 'mid', at(.74 + i * .04), 1, 1490 + i);
    Wsh(sc, q, mix3(PAL.bluePale, PAL.stone, .4), { a: .22, j: 3, layers: 1, edge: .2, seed: 1492 + i }, 'mid', at(.76 + i * .04), .5);
    inkQuad(sc, q, { w: 1.1, wob: .4, seed: 1494 + i, gap: .3 }, 'mid', at(.78 + i * .04), .35, .06, .55);
  }
  // 从窗来的暖光落在抽屉内（动态）
  sc.dyn((ctx, t) => {
    const a = clamp((t - .4) / 1.6); if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(1500, 220, 900, 880);
    g.addColorStop(0, `rgba(255,244,216,${.14 * a})`); g.addColorStop(.55, `rgba(250,238,214,${.07 * a})`); g.addColorStop(1, 'rgba(250,238,214,0)');
    ctx.fillStyle = g; ctx.fillRect(300, 150, 1400, 900); ctx.restore();
    glow(ctx, t, 1380, 360, 420, PAL.lamp, .07 * a, { breathe: .12, rate: .6 });
  }, 'mid');
  // ---- 过肩：左边缘的头发 / 肩（前景，虚一点） ----
  const hairMass = loop([[-80, 420], [90, 380], [230, 440], [300, 560], [280, 700], [180, 800], [40, 820], [-80, 700]], 3);
  F(sc, hairMass, [250, 244, 233], 'front', at(.18), 4, 1300);
  Wsh(sc, hairMass, mix3(PAL.hair, PAL.greyDeep, .3), { a: .5, j: 14, layers: 2, edge: .25, seed: 1301 }, 'front', at(.22), 1.2);
  Wsh(sc, loop([[40, 430], [180, 400], [270, 480], [250, 640], [150, 760], [30, 760]], 3), mix3(PAL.hair, PAL.blueDeep, .35), { a: .26, j: 12, layers: 2, edge: 0, seed: 1302 }, 'front', at(.3), 1.1);
  for (let i = 0; i < 7; i++) Ink(sc, [[-40 + i * 40, 400 + i * 12], [80 + i * 34, 500 + i * 24], [100 + i * 30, 660 + i * 18], [30 + i * 26, 790 + i * 4]], { w: 1.4, wob: 1.1, seed: 1303 + i, over: 2, gap: .45 }, 'front', at(.34 + i * .04), .8, .5);
  const shoulder = loop([[-70, 630], [110, 610], [250, 668], [300, 786], [230, 880], [60, 900], [-80, 862]], 3);
  F(sc, shoulder, [251, 246, 236], 'front', at(.24), 3, 1310);
  Wsh(sc, shoulder, mix3(PAL.coat, PAL.cream, .3), { a: .38, j: 12, layers: 2, edge: .22, seed: 1311 }, 'front', at(.28), 1.1);
  InkPoly(sc, shoulder, { w: 2.0, wob: .8, seed: 1312, gap: .4 }, 'front', at(.4), .8, .08, .6);
  // ---- 手 + 照片：放进抽屉 ----
  if (o.handPhoto) {
    const H = o.handPhoto;
    const photoP = photoParts(300, 226, (o.seed ?? 531) + 700, { near: false, damp: true });
    const anim = t => {
      const u = ss(clamp((t - (H.t0 ?? .3)) / ((H.t1 ?? 2.6) - (H.t0 ?? .3))));
      const release = clamp((t - (H.t1 ?? 2.6) - .1) / .8);
      const cx = lerp(860, 1010, u) - release * 60;
      const cy = lerp(360, 560, u) - release * 40;
      const ang = lerp(-.3, -.04, u) + Math.sin(t * 1.3) * .01 * (1 - release);
      const alpha = clamp((t - (H.t0 ?? .3)) / .7);
      return { cx, cy, ang, u, alpha };
    };
    // 信纸的照片（先画，手盖在上面）
    sc.dyn((ctx, t) => {
      const a = anim(t); if (a.alpha <= 0) return;
      const tf = ([x, y]) => { const c = Math.cos(a.ang), s = Math.sin(a.ang); return [a.cx + (x - 150) * c - (y - 113) * s, a.cy + (x - 150) * s + (y - 113) * c]; };
      drawParts(ctx, photoP, tf, a.alpha, clamp(a.u * 1.5));
    }, 'mid');
    // 手臂 + 手
    sc.dyn((ctx, t) => {
      const a = anim(t); if (a.alpha <= 0) return;
      const palm = [a.cx - 186, a.cy + 16];
      forearmSketch(ctx, [10, palm[1] + 66], [palm[0] - 78, palm[1] + 18], 62, 92, { alpha: a.alpha, col: mix3(PAL.coat, PAL.cream, .38) });
      handSketch(ctx, palm[0], palm[1], 196, .16, { curl: .36, alpha: a.alpha, seed: 533 });
    }, 'front');
  }
  // ---- 湿气 + 微尘 + 顶部信纸轻颤 ----
  const damp = dampFx({ seed: (o.seed ?? 531) + 500, n: 10, x0: 200, y0: 120, x1: 1750, y1: 900, gain: .8 });
  sc.dyn((ctx, t) => damp(ctx, t, { gain: clamp((t - .8) / 2) * (o.damp ?? .9) * .8 }), 'mid');
  const motes = moteFx({ seed: (o.seed ?? 531) + 510, n: 22, x0: 300, x1: 1500, y0: 160, y1: 820 });
  sc.dyn((ctx, t) => motes(ctx, t, { gain: clamp((t - .6) / 1.5) * .7 }), 'front');
  sc.dyn((ctx, t) => {
    const p = clamp((t - 1.2) / 1.4); if (p <= 0) return;
    const top = [quadMap(B, .3, .2), quadMap(B, .5, .21)];
    ctx.save(); ctx.strokeStyle = rgba(INK, .5 * p); ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const u = .15 + i * .18;
      const a = lerpP(top[0], top[1], u);
      const wob = Math.sin(t * 2.2 + i * 1.3) * 2.4;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(a[0] + wob, a[1] - 5 - Math.cos(t * 2 + i) * 2.2); ctx.stroke();
    }
    ctx.restore();
  }, 'mid');
  return sc;
}
const shiftPoint = (p, dx, dy) => [p[0] + dx, p[1] + dy];



// ---------------- 窗台视图（5.2 / 8.4 / 8.6） ----------------
function sillView(o) {
  const sc = new Scene({ w: 1920, h: 1080, base: { x: 960, y: 556 }, layers: [{ id: 'back', par: 1 }, { id: 'mid', par: 1 }, { id: 'front', par: 1 }] });
  const at = f => (o.t0 ?? 0) + f * (o.reveal ?? 2.2);
  const R = rng(o.seed ?? 841);
  // ---- 上面的窗（玻璃、雨、微光，浅浅一层） ----
  F(sc, [[0, 0], [1920, 0], [1920, 330], [0, 330]], [252, 250, 243], 'back', 0, 0);
  Wsh(sc, [[0, 0], [1920, 0], [1920, 360], [0, 380]], mix3(PAL.bluePale, PAL.greyLight, .35), { a: .3, j: 34, layers: 2, edge: 0, seed: 1300, freq: .008 }, 'back', at(.02), 1.1);
  Wsh(sc, [[700, 0], [1920, 0], [1920, 380], [500, 400]], mix3(PAL.cream, PAL.pinkPale, .4), { a: .2, j: 30, layers: 2, edge: 0, seed: 1301, freq: .006 }, 'back', at(.06), 1.2);
  // 窗外模糊的街（只有几块淡彩 + 极少的线，像失焦）
  for (let i = 0; i < 5; i++) {
    const x = 120 + i * 380 + R() * 120, w = 150 + R() * 160, top = 90 + R() * 90;
    Wsh(sc, [[x - w / 2, 350], [x - w / 2, top], [x + w / 2, top], [x + w / 2, 350]], mix3(PAL.stoneCool, PAL.bluePale, .5), { a: .14, j: 16, layers: 1, edge: 0, seed: 1310 + i }, 'back', at(.1 + i * .04), .9);
    if (i % 2 === 0) Wsh(sc, ellipse(x, top + 60, w * .2, 24, 12), mix3(PAL.lamp, PAL.cream, .3), { a: .16, j: 10, layers: 1, edge: 0, seed: 1320 + i }, 'back', at(.14 + i * .04), .8);
  }
  // 玻璃上的雨痕（挂在窗上的水珠，动态）
  const dropsTop = makeGlassDrops({ seed: 1330, n: 26, x0: 160, x1: 1760, y0: 20, y1: 300, bornSpan: 2.4, slideMin: 1.4, slideMax: 4, minR: 2, maxR: 6 });
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1920, 322); ctx.clip();
    dropsTop(ctx, t, { gain: .9, alpha: clamp((t - .6) / 1.2) });
    ctx.restore();
  }, 'back');
  // 窗框下沿（木）：横贯画面
  F(sc, [[0, 300], [1920, 300], [1920, 372], [0, 380]], [251, 247, 238], 'mid', at(.2), 2, 1340);
  Wsh(sc, [[0, 300], [1920, 300], [1920, 372], [0, 380]], mix3(PAL.cream, PAL.stone, .45), { a: .3, j: 8, layers: 2, edge: .15, seed: 1341 }, 'mid', at(.24), .9);
  Ink(sc, [[-10, 302], [1930, 300]], { w: 2.8, wob: .7, seed: 1342, over: 8 }, 'mid', at(.3), .7);
  Ink(sc, [[-10, 374], [1930, 366]], { w: 2.4, wob: .7, seed: 1343, over: 8 }, 'mid', at(.34), .7);
  Ink(sc, [[60, 306], [480, 304]], { w: 1.2, wob: .5, seed: 1344, over: 3, gap: .5 }, 'mid', at(.4), .4, .5);
  // ---- 窗台面（木，向观众展开） ----
  const SILL = [[0, 380], [1920, 364], [1920, 1080], [0, 1080]];
  F(sc, SILL, [252, 248, 239], 'mid', at(.22), 2, 1350);
  Wsh(sc, SILL, mix3(PAL.cream, PAL.stone, .5), { a: .26, j: 30, layers: 2, edge: 0, seed: 1351, freq: .006 }, 'mid', at(.26), 1.2);
  Wsh(sc, [[0, 640], [1920, 610], [1920, 1080], [0, 1080]], mix3(PAL.warm, PAL.greyLight, .5), { a: .12, j: 26, layers: 2, edge: 0, seed: 1352 }, 'mid', at(.32), 1.2);
  // 木头长纹（顺着窗台方向，靠近观众的一侧更疏）
  for (let i = 0; i < 13; i++) {
    const v0 = .04 + i * .072;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const u = -.02 + k / 8 * 1.04;
      const y = lerp(150, 1080, v0) + Math.sin(u * 4.2 + i * 1.3) * 5 + (i % 2 ? 3 : -3);
      pts.push([u * 1920, y]);
    }
    Ink(sc, pts, { w: .9 + (i % 4) * .22, wob: 1.1, seed: 1360 + i, over: 6, gap: .55 }, 'mid', at(.3 + i * .022), .85, .22 + (i % 3) * .04);
  }
  for (const [x, y, sd] of [[380, 800, 1380], [1480, 700, 1381]]) {
    Ink(sc, ellipse(x, y, 26, 9, 14), { w: 1.0, wob: .5, seed: sd, over: 2 }, 'mid', at(.5), .5, .3);
    Ink(sc, ellipse(x + 3, y + 1, 13, 4.5, 12), { w: .8, wob: .4, seed: sd + 1, over: 1 }, 'mid', at(.52), .4, .25);
  }
  // 窗台上湿气的淡淡水渍（不是主体，很淡）
  Wsh(sc, loop([[240, 780], [520, 810], [700, 880], [420, 940], [180, 890]], 4), mix3(PAL.grey, PAL.bluePale, .5), { a: .08, j: 18, layers: 1, edge: 0, seed: 1390 }, 'mid', at(.5), 1.3);
  Wsh(sc, loop([[1250, 690], [1560, 700], [1690, 760], [1500, 830], [1230, 790]], 4), mix3(PAL.grey, PAL.cream, .5), { a: .08, j: 16, layers: 1, edge: 0, seed: 1391 }, 'mid', at(.54), 1.3);
  // 更密的木纹（第二遍，含结疤）与纸面颗粒
  for (let i = 0; i < 8; i++) {
    const v0 = .09 + i * .11, pts = [];
    for (let k = 0; k <= 7; k++) {
      const u = -.02 + k / 7 * 1.04;
      const y = lerp(150, 1080, v0) + Math.sin(u * 5.1 + i * 2.1) * 4 + (i % 2 ? 2 : -2);
      pts.push([u * 1920, y]);
    }
    Ink(sc, pts, { w: .8 + (i % 3) * .18, wob: .9, seed: 1590 + i, over: 5, gap: .6 }, 'mid', at(.46 + i * .02), .8, .12 + (i % 3) * .03);
  }
  for (const [x, y, sd] of [[940, 760, 1600], [1780, 690, 1601]]) {
    Ink(sc, ellipse(x, y, 20, 7, 12), { w: .95, wob: .45, seed: sd, over: 2 }, 'mid', at(.5), .5, .22);
    Ink(sc, ellipse(x + 3, y + 1, 10, 3.4, 10), { w: .8, wob: .35, seed: sd + 1, over: 1 }, 'mid', at(.52), .4, .2);
  }
  speckle(sc, [[0, 384], [1920, 368], [1920, 1080], [0, 1080]], { n: 130, seed: (o.seed ?? 841) + 1200, a: .04, col: mix3(PAL.stone, PAL.cream, .4), t0: at(.5) });
  // 玻璃反光的两道斜亮
  F(sc, [[1240, 0], [1330, 0], [1060, 316], [980, 312]], [255, 254, 249], 'back', at(.03), 10, 1335, .22);
  F(sc, [[1600, 0], [1660, 0], [1480, 318], [1420, 316]], [255, 254, 249], 'back', at(.05), 10, 1336, .16);
  // ---- 道具 ----
  // 压在下面的旧信（photoOnly 镜头的底衬，让照片有依托）
  if (o.mode === 'photoOnly' && o.underLetter !== false) {
    const L2 = o.underLetter || { x: 360, y: 322, w: 620, h: 250, ang: .035 };
    const parts2 = letterParts(L2.w, L2.h, (o.seed ?? 841) + 460, { damp: true });
    const tf2 = ([x, y]) => { const c = Math.cos(L2.ang ?? .035), s = Math.sin(L2.ang ?? .035); return [(L2.x ?? 360) + x * c - y * s, (L2.y ?? 322) + x * s + y * c]; };
    addParts(sc, parts2, tf2, 'mid', at, .22, 1.0);
  }
  if (o.mode !== 'photoOnly') {
    // 手写信（主物）
    const L = o.letter ?? { x: 350, y: 452, w: 560, h: 300, ang: -.045 };
    const parts = letterParts(L.w ?? 560, L.h ?? 300, (o.seed ?? 841) + 400, { damp: true, stamp: true });
    const tf = ([x, y]) => { const c = Math.cos(L.ang ?? -.045), s = Math.sin(L.ang ?? -.045); return [(L.x ?? 350) + x * c - y * s, (L.y ?? 452) + x * s + y * c]; };
    if (o.letterFlutter) {
      sc.dyn((ctx, t) => {
        const p = clamp((t - .8) / 1.2); if (p <= 0) return;
        const fl = Math.sin(t * 1.9 + .6) * .009;
        const tf2 = ([x, y]) => { const c = Math.cos((L.ang ?? -.045) + fl), s = Math.sin((L.ang ?? -.045) + fl); return [(L.x ?? 350) + x * c - y * s + Math.sin(t * 2.2) * 1.5, (L.y ?? 452) + x * s + y * c]; };
        drawParts(ctx, parts, tf2, 1, p);
      }, 'mid');
    } else addParts(sc, parts, tf, 'mid', at, .3, 1.1);
  }
  // 旧照片（8.4 只露一角；5.2 是主体）
  if (o.photo !== false) {
    const P = o.photo ?? { x: 1120, y: 430, w: 420, h: 310, ang: .055 };
    const parts = photoParts(P.w, P.h, (o.seed ?? 841) + 500, { near: o.photoNear, damp: o.photoDamp });
    const tf = ([x, y]) => { const c = Math.cos(P.ang ?? .055), s = Math.sin(P.ang ?? .055); return [(P.x ?? 1120) + x * c - y * s, (P.y ?? 430) + x * s + y * c]; };
    addParts(sc, parts, tf, 'mid', at, .45, 1.0);
  }
  // 一叠旧照片（散在窗台上，只露边）
  if (o.printStack !== false) {
    for (let i = 0; i < 3; i++) {
      const x = 1004 + i * 16, y = 706 + i * 6, w = 140, h = 96, ang = -.06 + i * .05;
      const q = rectPts(x, y, w, h, ang);
      F(sc, q, [252, 249, 241], 'mid', at(.62 + i * .04), 1, 1440 + i);
      Wsh(sc, q, mix3(PAL.cream, PAL.stone, .35), { a: .22, j: 4, layers: 1, edge: .2, seed: 1444 + i }, 'mid', at(.64 + i * .04), .5);
      inkQuad(sc, q, { w: 1.2, wob: .4, seed: 1448 + i, gap: .3 }, 'mid', at(.66 + i * .04), .4, .06, .6);
      Wsh(sc, [lerpP(q[0], q[1], .15), lerpP(q[1], q[2], .16), lerpP(q[2], q[3], .2), lerpP(q[3], q[0], .2)], mix3(PAL.bluePale, PAL.greyLight, .4), { a: .2, j: 3, layers: 1, edge: 0, seed: 1452 + i }, 'mid', at(.68 + i * .04), .5);
    }
  }
  // 窗台上的干花小枝
  if (o.sprig !== false) {
    const sx = 332, sy = 812;
    for (let i = 0; i < 5; i++) {
      const a = -2.4 + i * .26, L = 58 + R() * 34;
      const tx = sx + Math.cos(a) * L * .8, ty = sy + Math.sin(a) * L * .7;
      Ink(sc, [[sx, sy], [sx + Math.cos(a) * L * .45, sy + Math.sin(a) * L * .4], [tx, ty]], { w: 1.3, wob: .6, seed: 1470 + i, over: 2, gap: .4 }, 'mid', at(.62 + i * .03), .5, .5);
      Wsh(sc, ellipse(tx, ty, 4.5, 7.5, 9), mix3(PAL.violet, PAL.pinkPale, .45), { a: .3, j: 2, layers: 1, edge: .2, seed: 1480 + i }, 'mid', at(.66 + i * .03), .45);
    }
  }
  // 窗台上的水珠（静态淡彩）+ 动态闪光
  const dropSpots = [];
  for (let i = 0; i < 22; i++) {
    const x = 80 + R() * 1760, y = 400 + R() * 470;
    dropSpots.push([x, y]);
    const rr = 2 + R() * 5;
    Wsh(sc, ellipse(x, y, rr, rr * 1.05, 10), mix3(PAL.greyLight, [255, 255, 255], .35), { a: .3, j: 1.5, layers: 1, edge: .2, seed: 1400 + i }, 'mid', at(.55 + i * .01), .5);
    Ink(sc, ellipse(x, y, rr, rr * 1.05, 10), { w: .8, wob: .3, seed: 1420 + i, over: 1 }, 'mid', at(.6 + i * .01), .3, .4);
  }
  // 窗台上的光/湿气
  addAirDyn(sc, { ...o, damp: o.damp ?? .9, warmDust: true, motes: .8, lampGain: o.lampGain ?? .6 }, at);
  const glint = glintFx({ seed: (o.seed ?? 841) + 900, n: 26, x0: 60, x1: 1860, y0: 380, y1: 900 });
  sc.dyn((ctx, t) => glint(ctx, t, { gain: clamp((t - 1) / 2) * (o.glint ?? 1) }), 'front');
  // ---- 8.4：彩虹光落在纸面 ----
  if (o.rainbow) {
    const rb = rainbowFx({ t0: o.rainbow.t0 ?? 1.4, t1: o.rainbow.t1 ?? 5, x: o.rainbow.x ?? 900, y: o.rainbow.y ?? 560, ang: o.rainbow.ang ?? -.38, gap: o.rainbow.gap ?? 50, a: o.rainbow.a ?? .2, shift: o.rainbow.shift ?? 1 });
    sc.dyn((ctx, t) => rb(ctx, t, { gain: o.rainbow.gain ?? 1 }), 'front');
    // 光落在纸上的暖斑（彩虹里的光）
    sc.dyn((ctx, t) => {
      const u = clamp((t - (o.rainbow.t0 ?? 1.4)) / 3);
      if (u <= 0) return;
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      const g = ctx.createRadialGradient(900, 520, 40, 900, 520, 560 * (0.7 + u * .4));
      g.addColorStop(0, `rgba(255,246,224,${.13 * u})`); g.addColorStop(.6, `rgba(240,236,220,${.08 * u})`); g.addColorStop(1, 'rgba(240,236,220,0)');
      ctx.fillStyle = g; ctx.fillRect(200, 260, 1500, 700); ctx.restore();
    }, 'front');
    // 彩虹落在纸上的一点点光斑（随呼吸淡入淡出）
    sc.dyn((ctx, t) => {
      const u = clamp((t - (o.rainbow.t0 ?? 1.4)) / 2.2);
      if (u <= 0) return;
      const R = rng((o.seed ?? 841) + 950);
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 9; i++) {
        const x = 360 + R() * 1000, y = 420 + R() * 340, rr = 20 + R() * 46;
        const cols = [PAL.greenPale, PAL.pinkPale, PAL.orange, PAL.violet];
        const ph = R() * 6;
        const a = (0.05 + R() * .05) * u * (.6 + .4 * Math.sin(t * .9 + ph));
        const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, rgba(cols[i % 4], a)); g.addColorStop(1, rgba(cols[i % 4], 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }, 'front');
  }
  // ---- 手（5.2 照片 / 8.6 拿信） ----
  if (o.hand) {
    const Hd = o.hand;
    const handAt = t => {
      const t0 = Hd.t0 ?? .3, t1 = Hd.t1 ?? 2.0;
      const e = ss(clamp((t - t0) / (t1 - t0)));
      const k = Hd.keys ?? [[1300, 690], [1240, 640], [1180, 610]];
      return {
        x: lerp(k[0][0], k[k.length - 1][0], e), y: lerp(k[0][1], k[k.length - 1][1], e),
        s: Hd.s ?? 240, ang: (Hd.ang0 ?? -3.0) + ((Hd.ang1 ?? -2.9) - (Hd.ang0 ?? -3.0)) * e,
        alpha: clamp((t - t0) / .7), curl: Hd.curl ?? .4,
      };
    };
    sc.dyn((ctx, t) => {
      const h = handAt(t); if (h.alpha <= 0) return;
      const dir = [Math.cos(h.ang), Math.sin(h.ang)];
      const wrist = [h.x - dir[0] * h.s * .46, h.y - dir[1] * h.s * .46];
      const from = Hd.sleeveFrom ?? [wrist[0] - dir[0] * 900 + 60, wrist[1] - dir[1] * 900 + 260];
      forearmSketch(ctx, from, wrist, h.s * .19, h.s * .28, { alpha: h.alpha, col: mix3(PAL.coat, PAL.cream, .4) });
      handSketch(ctx, h.x, h.y, h.s, h.ang, { curl: h.curl, alpha: h.alpha, seed: (o.seed ?? 841) + 41 });
    }, 'front');
  }
  // 8.6：被拿起的信（动态跟随手）
  if (o.liftLetter) {
    const L = o.liftLetter;
    const parts = letterParts(L.w ?? 560, L.h ?? 280, (o.seed ?? 841) + 700, { damp: true });
    sc.dyn((ctx, t) => {
      const p = clamp((t - (L.t0 ?? .6)) / 1.4); if (p <= 0) return;
      const e = ss(clamp((t - (L.t0 ?? .6)) / (L.t1 ?? 3.2)));
      const ang = (L.ang ?? -.04) + e * -.06;
      const x = (L.x ?? 460) + e * 40, y = (L.y ?? 470) + e * -26 + Math.sin(t * 1.7) * 2;
      const tf = ([xx, yy]) => { const c = Math.cos(ang), s = Math.sin(ang); return [x + xx * c - yy * s, y + xx * s + yy * c]; };
      drawParts(ctx, parts, tf, 1, p);
    }, 'mid');
  }
  return sc;
}
function rb0(r) { return r && typeof r === 'object'; }

// ---------------- 工厂：roomSet(opts) ----------------
export function roomSet(o = {}) {
  const view = o.view ?? 'room';
  let sc;
  if (view === 'drawer') sc = drawerView(o);
  else if (view === 'sill') sc = sillView(o);
  else sc = roomWide(o);
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? slowCam({ x: 960, y: 560, z0: 1, z1: 1.04, dx: 16, dur: 5 });
  return sc;
}
