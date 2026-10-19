// 天空 / 彩虹 / 雨后窗光（set-sky 维护）
// 镜头（音频实测时长）：8.1 5.01s / 8.3 4.29s / 8.5 4.29s / 9.1 11.56s / 9.2 11.56s / 9.4 8.51s / 9.5 7.28s
// 5.4 / 8.2 已由 lead 的 skyWide 接管，本文件不再登记这两个 id。
// 复用 src/sets/window.js 的 windowSet({view:'sky'})（v2：更厚的窗框/窗帘、城市屋脊、光柱、彩虹），
// 再在本文件里补：室内光斑/冷暖对比、尘埃与湿气、玻璃水痕、窗台小物、彩虹落在纸面、人物窗光。
import {
  Scene, PAL, PEN, camTrack, slowCam, seg, clamp, lerp, ss, TAU, rng, n2,
  hex, mix3, rgba, ellipse, spline, eio, eo, ei, handheld, INK, dab,
} from '../core.js';
import { windowSet, WIN, HER, letter_, photo_, cup_ } from '../sets/window.js';
import { makeRain, makeGlassDrops, makeFog, glow, bokeh, airVeil, breathFog } from '../fx.js';
import {
  herStand, herTouchGlass, herReachOut, herLookUp, herSmileDown, mixPose,
  drawGirl, handClose, LOOK_HER,
} from '../character.js';

// 窗洞内沿（玻璃可见区域）
const IN = { x0: WIN.x0 + WIN.fw, y0: WIN.y0 + WIN.fw, x1: WIN.x1 - WIN.fw, y1: WIN.y1 - WIN.fw };
const BOW = [[233, 180, 170], [240, 202, 152], [240, 228, 164], [196, 220, 186], [176, 206, 226], [190, 182, 220]];

// ================= 通用小工具 =================
// 纸色软纱（焦点虚化/留白）
function veil(ctx, x, y, rx, ry, a, col = [246, 240, 228]) {
  if (a <= .002) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, rgba(col, a)); g.addColorStop(.6, rgba(col, a * .55)); g.addColorStop(1, rgba(col, 0));
  ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore();
}
// 人物下缘"未画完"留白（同时保护字幕安全区）
function bottomWash(ctx, o = {}) {
  const y0 = o.y0 ?? 900, a = o.a ?? .8;
  const g = ctx.createLinearGradient(0, y0, 0, 1120);
  g.addColorStop(0, 'rgba(245,238,222,0)');
  g.addColorStop(.5, `rgba(245,238,222,${a * .55})`);
  g.addColorStop(1, `rgba(245,238,222,${a})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(-40, y0, 2000, 1120 - y0); ctx.restore();
}
// 女孩：墨线+淡彩一起长出来，boil 手绘抖动
function girl(ctx, t, place, pose, o = {}) {
  const p = clamp((t - (o.t0 ?? .25)) / (o.dur ?? 1.3));
  if (p <= 0) return null;
  return drawGirl(ctx, pose, place, {
    seed: o.seed ?? 37, boil: Math.floor(t * 12),
    face: o.face, eyesOpen: o.eyesOpen, tear: o.tear, knit: o.knit,
    color: (o.color ?? 1) * clamp(p * 1.7),
    ink: (o.ink ?? 1) * clamp(p * 2),
    alpha: (o.alpha ?? 1) * clamp(p * 1.5),
  });
}
// 窗外/玻璃上的雨（画在 back 层，被窗框遮住）
function paneRain(o = {}) {
  const rain = makeRain({
    seed: o.seed ?? 11, n: o.n ?? 200, w: IN.x1 - IN.x0, h: IN.y1 - IN.y0,
    slant: o.slant ?? .3, minLen: o.len ?? 13, maxLen: (o.len ?? 13) * 2.2,
  });
  return (ctx, t) => {
    const a = lerp(o.a0 ?? .8, o.a1 ?? .2, seg(t, o.t0 ?? 0, o.t1 ?? 6)) * clamp(t / .6);
    if (a <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0 - 6, IN.y0 - 6, IN.x1 - IN.x0 + 12, IN.y1 - IN.y0 + 12); ctx.clip();
    ctx.translate(IN.x0, IN.y0);
    rain(ctx, t, { w: IN.x1 - IN.x0, h: IN.y1 - IN.y0, alpha: a, col: o.col ?? mix3(PAL.greyDeep, PAL.blue, .3), wMul: 1.15 });
    ctx.restore();
  };
}
// 窗台上的暖光（彩虹/天光落下来）
function sillLight(ctx, t, o = {}) {
  const a = (o.a ?? .3) * clamp((t - (o.t0 ?? .8)) / (o.dur ?? 1.6));
  if (a <= .01) return;
  const g = ctx.createLinearGradient(0, 660, 0, 900);
  g.addColorStop(0, 'rgba(255,246,224,0)');
  g.addColorStop(.5, `rgba(255,246,224,${a})`);
  g.addColorStop(1, `rgba(255,242,214,${a * .6})`);
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(WIN.x0 - 40, 660, WIN.x1 - WIN.x0 + 80, 240); ctx.restore();
}
// ================= 室内"信息量" dyn =================
// 空气里的尘埃：在窗光里缓慢浮动（确定性）
function dust(sc, o = {}) {
  const R = rng(o.seed ?? 77), n = o.n ?? 26;
  const x0 = o.x0 ?? IN.x0 + 40, x1 = o.x1 ?? IN.x1 - 40, y0 = o.y0 ?? 240, y1 = o.y1 ?? 900;
  const motes = [];
  for (let i = 0; i < n; i++) motes.push({
    x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0),
    r: .9 + R() * 2.1, sp: .4 + R() * 1.3, ph: R() * TAU, drift: 6 + R() * 22,
  });
  sc.dyn((ctx, t) => {
    const g = clamp((t - (o.t0 ?? .8)) / 1.6) * (o.a ?? .5);
    if (g <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0 - 40, y0 - 20, (x1 - x0) + 80, (y1 - y0) + 260); ctx.clip();
    for (const m of motes) {
      const x = m.x + Math.sin(t * m.sp * .6 + m.ph) * m.drift;
      const y = m.y + Math.cos(t * m.sp * .5 + m.ph) * m.drift * .5 + Math.sin(t * .3 + m.ph) * 6;
      const a = g * (.35 + .65 * (0.5 + 0.5 * Math.sin(t * m.sp + m.ph)));
      ctx.fillStyle = `rgba(255,250,232,${a * .8})`;
      ctx.beginPath(); ctx.arc(x, y, m.r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'front');
}
// 室内冷暖对比：右侧墙冷影 + 窗光暖斑（静态淡彩，烘焙后清晰）
function roomLight(sc, o = {}) {
  const y0 = o.y0 ?? 300, y1 = o.y1 ?? 990;
  sc.wash([[WIN.x1 - 20, y0 - 80], [1930, y0 - 110], [1930, y1 + 60], [WIN.x1 - 30, y1]], mix3(PAL.bluePale, PAL.greyLight, .45),
    { a: .22, j: 26, layers: 2, edge: 0, seed: 3101, speckle: 16 }, { layer: 'mid', t0: .5, dur: 1.1 });
  sc.wash([[30, y0 + 80], [WIN.x0 - 24, y0 + 30], [WIN.x0 - 6, y1 - 60], [60, y1]],
    mix3(PAL.cream, PAL.lamp, .32), { a: .18, j: 30, layers: 2, edge: 0, seed: 3102, speckle: 18 }, { layer: 'mid', t0: .7, dur: 1.2 });
  sc.wash([[WIN.x0 - 20, WIN.sillFront - 8], [WIN.x1 + 20, WIN.sillFront - 16], [WIN.x1 + 20, WIN.sillFront + 62], [WIN.x0 - 20, WIN.sillFront + 70]],
    mix3(PAL.cream, PAL.warm, .4), { a: .18, j: 16, layers: 1, edge: 0, seed: 3103 }, { layer: 'mid', t0: .9, dur: 1.0 });
  sc.dyn((ctx, t) => {
    const a = .1 * (1 + .3 * Math.sin(t * .55)) * clamp((t - 1) / 2);
    if (a <= .005) return;
    glow(ctx, t, WIN.x0 + 90, 640, 300, mix3(PAL.lamp, PAL.cream, .3), a, { breathe: .16, rate: .6 });
    glow(ctx, t, WIN.x1 - 60, 560, 260, mix3(PAL.cream, PAL.bluePale, .3), a * .6, { breathe: .2, rate: .45, phase: 2 });
  }, 'mid');
}
// 窗台小物：小玻璃瓶+干枝、折起的布、细笔（速写式，不抢主体）
function sillStill(sc, o = {}) {
  const R = rng(o.seed ?? 4101);
  const base = o.y ?? WIN.sillFront - 2;
  const bx = o.bottleX ?? 1218, bw = 34, bh = 84;
  sc.fill([[bx - bw / 2, base], [bx - bw / 2 + 3, base - bh], [bx + bw / 2 - 3, base - bh], [bx + bw / 2, base]], [253, 251, 244], { layer: 'front', j: 1.5, seed: 4102, t0: .85, dur: .1 });
  sc.wash([[bx - bw / 2, base], [bx - bw / 2 + 3, base - bh], [bx + bw / 2 - 3, base - bh], [bx + bw / 2, base]], mix3(PAL.greyLight, PAL.bluePale, .5),
    { a: .24, j: 3, layers: 2, edge: .2, seed: 4103 }, { layer: 'front', t0: .95, dur: .6 });
  sc.ink2([[bx - bw / 2, base], [bx - bw / 2 + 3, base - bh]], { w: 1.3, wob: .35, seed: 4104, over: 2 }, { layer: 'front', t0: 1.0, dur: .4 });
  sc.ink2([[bx + bw / 2, base - 2], [bx + bw / 2 - 3, base - bh]], { w: 1.3, wob: .35, seed: 4105, over: 2 }, { layer: 'front', t0: 1.05, dur: .4 });
  sc.ink2([[bx - bw / 2 + 3, base - bh], [bx + bw / 2 - 3, base - bh]], { w: 1.2, wob: .3, seed: 4106, over: 1 }, { layer: 'front', t0: 1.1, dur: .35 });
  sc.wash([[bx - bw / 2 + 4, base - 6], [bx + bw / 2 - 4, base - 6], [bx + bw / 2 - 4, base - bh + 22], [bx - bw / 2 + 4, base - bh + 22]],
    mix3(PAL.bluePale, PAL.greyLight, .4), { a: .2, j: 2, layers: 1, edge: 0, seed: 4107 }, { layer: 'front', t0: 1.1, dur: .5 });
  for (let i = 0; i < 3; i++) {
    const a0 = -1.9 + i * .5 + R() * .2, L = 70 + R() * 74;
    const pts = [...Array(6)].map((_, k) => {
      const u = k / 5, ang = a0 + Math.sin(u * 3 + i) * .16;
      return [bx + Math.cos(ang) * u * L * .4 + Math.sin(u * 5 + i) * 3, base - bh + 16 - u * L];
    });
    sc.ink(pts, { w: 1.0 + R() * .3, wob: .55, seed: 4110 + i, over: 1, gap: .4 }, { layer: 'front', t0: 1.2 + i * .07, dur: .6, alpha: .62 });
    for (let k = 1; k < 4; k++) {
      const p = pts[k], s = 4 + R() * 3;
      sc.wash(ellipse(p[0] + (R() - .5) * 10, p[1] - 3, s, s * .6, 8), mix3(PAL.stone, PAL.cream, .4),
        { a: .34, j: 2, layers: 1, edge: .15, seed: 4120 + i * 4 + k }, { layer: 'front', t0: 1.35 + k * .08, dur: .5 });
    }
  }
  const cx = o.clothX ?? 1420, cy = o.clothY ?? base - 6;
  const cloth = [[cx - 96, cy], [cx - 82, cy - 34], [cx + 40, cy - 40], [cx + 92, cy - 8], [cx + 60, cy + 16], [cx - 60, cy + 20]];
  sc.fill(cloth, [253, 250, 242], { layer: 'front', j: 2, seed: 4130, t0: 1.1, dur: .1 });
  sc.wash(cloth, mix3(PAL.cream, PAL.pinkPale, .3), { a: .26, j: 6, layers: 2, edge: .18, seed: 4131 }, { layer: 'front', t0: 1.2, dur: .7 });
  sc.inkPoly(cloth, { w: 1.4, wob: .5, seed: 4132, gap: .35 }, { layer: 'front', t0: 1.3, dur: .55, stagger: .05, alpha: .8 });
  for (let i = 0; i < 3; i++) sc.ink([[cx - 60 + i * 44, cy + 12], [cx - 30 + i * 44, cy - 34]], { w: .9, wob: .5, seed: 4135 + i, over: 1, gap: .6 }, { layer: 'front', t0: 1.45 + i * .06, dur: .45, alpha: .35 });
  const px = o.penX ?? 700, py = o.penY ?? base - 2;
  sc.ink2([[px - 60, py + 4], [px + 70, py - 8]], { w: 1.9, wob: .3, seed: 4140, over: 3 }, { layer: 'front', t0: 1.2, dur: .5 });
  sc.wash([[px + 70, py - 10], [px + 96, py - 13], [px + 96, py - 4], [px + 68, py - 1]], mix3(PAL.lampDeep, PAL.stoneCool, .4),
    { a: .4, j: 2, layers: 1, edge: .15, seed: 4141 }, { layer: 'front', t0: 1.35, dur: .4 });
}
// 玻璃上的水痕/水珠（更密，慢慢流）
function glassStreaks(sc, o = {}) {
  const R = rng(o.seed ?? 5101), n = o.n ?? 14;
  const streaks = [];
  for (let i = 0; i < n; i++) streaks.push({
    x: IN.x0 + 40 + R() * (IN.x1 - IN.x0 - 80),
    y0: IN.y0 + 20 + R() * (IN.y1 - IN.y0 - 220),
    len: 80 + R() * 220, per: 5 + R() * 6, ph: R() * TAU, w: .9 + R() * 1.4,
  });
  sc.dyn((ctx, t) => {
    const g = clamp((t - (o.t0 ?? 1)) / 1.6) * (o.a ?? .5);
    if (g <= .01) return;
    const panes = [
      [IN.x0, IN.y0, WIN.mull - 9, WIN.trans - 8],
      [WIN.mull + 9, IN.y0, IN.x1, WIN.trans - 8],
      [IN.x0, WIN.trans + 8, WIN.mull - 9, IN.y1],
      [WIN.mull + 9, WIN.trans + 8, IN.x1, IN.y1],
    ];
    ctx.save();
    for (const p of panes) { ctx.beginPath(); ctx.rect(p[0], p[1], p[2] - p[0], p[3] - p[1]); ctx.clip(); }
    for (const s of streaks) {
      const u = ((t + s.ph) % s.per) / s.per;
      const len = s.len * (.35 + .65 * Math.min(1, u * 2));
      const y = s.y0 + u * 40, headY = y + len;
      ctx.strokeStyle = rgba(mix3(PAL.grey, PAL.bluePale, .4), g * .3 * (1 - u * .4));
      ctx.lineWidth = s.w;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const q = k / 6, yy = y + (headY - y) * q, xx = s.x + Math.sin(q * 4.2 + s.ph) * 3.5;
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
      const rr = 1.8 + s.w, hx = s.x + Math.sin(4.2 + s.ph) * 3.5;
      ctx.fillStyle = rgba(PAL.greyLight, g * .5);
      ctx.beginPath(); ctx.ellipse(hx, headY, rr, rr * 1.25, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(INK, g * .35); ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(hx, headY, rr, rr * 1.25, .2, .1, TAU - .4); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${g * .8})`;
      ctx.beginPath(); ctx.arc(hx - rr * .3, headY - rr * .4, rr * .3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'mid');
}
// 彩虹光带落在窗台/纸面（乘法，透明淡彩）
function bowOnSill(sc, o = {}) {
  const t0 = o.t0 ?? .6, t1 = o.t1 ?? 9.6, aMax = o.a ?? .26;
  const tilt = o.tilt ?? .42;
  sc.dyn((ctx, t) => {
    const u = clamp((t - t0) / (t1 - t0));
    if (u <= .001) return;
    const a = aMax * (.18 + .82 * ss(u));
    ctx.save();
    ctx.beginPath(); ctx.rect(WIN.x0 - 20, WIN.y1 - 40, WIN.x1 - WIN.x0 + 40, 260); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < BOW.length; i++) {
      const off = i * 30 + u * 26;
      ctx.strokeStyle = rgba(BOW[i], a * (.72 + .28 * Math.sin(i / 5 * Math.PI)));
      ctx.lineWidth = 34;
      ctx.beginPath();
      ctx.moveTo(WIN.x0 - 200 + off * tilt, WIN.sillFront + 120);
      ctx.lineTo(WIN.x0 + 500 + off, WIN.sillFront - 120);
      ctx.stroke();
    }
    ctx.restore();
    const q = .1 + .1 * Math.sin(t * .5);
    ctx.save();
    const g = ctx.createRadialGradient(760, WIN.y1 + 50, 20, 760, WIN.y1 + 50, 460);
    g.addColorStop(0, `rgba(255,248,226,${q * (o.warm ?? 1)})`); g.addColorStop(1, 'rgba(255,248,226,0)');
    ctx.fillStyle = g; ctx.fillRect(WIN.x0, WIN.y1 - 80, WIN.x1 - WIN.x0, 320);
    ctx.restore();
  }, 'front');
}
// 人物身上的窗光（一束暖光 + 边缘光）
function charLight(sc, o = {}) {
  const t0 = o.t0 ?? .6;
  sc.dyn((ctx, t) => {
    const a = clamp((t - t0) / 1.6) * (o.a ?? .3);
    if (a <= .005) return;
    const x = o.x ?? 1400, y = o.y ?? 620, rx = o.rx ?? 520, ry = o.ry ?? 520;
    const g = ctx.createLinearGradient(x + rx * .7, y - ry * .6, x - rx * .9, y + ry * .8);
    g.addColorStop(0, `rgba(255,248,228,${a})`);
    g.addColorStop(.5, `rgba(255,246,222,${a * .45})`);
    g.addColorStop(1, 'rgba(255,244,216,0)');
    ctx.save();
    ctx.beginPath();
    if (o.clip) o.clip(ctx); else ctx.rect(0, 0, 1920, 1200);
    ctx.clip(); ctx.fillStyle = g; ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
    ctx.restore();
    if (o.rim !== false) glow(ctx, t, x + rx * .55, y - ry * .1, rx * .7, mix3(PAL.lamp, [255, 255, 255], .35), a * .5, { breathe: .12, rate: .7 });
  }, 'front');
}
// 窗帘被风带着极轻地动（纸色明暗在帘上横移）
function curtainAir(sc, o = {}) {
  sc.dyn((ctx, t) => {
    const a = clamp((t - (o.t0 ?? 1)) / 2) * (o.a ?? .2);
    if (a <= .005) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(1574, -20, 360, 1240); ctx.clip();
    for (let i = 0; i < 4; i++) {
      const x = 1600 + i * 62 + Math.sin(t * .45 + i * 1.2) * 6;
      const g = ctx.createLinearGradient(x - 26, 0, x + 26, 0);
      g.addColorStop(0, 'rgba(255,252,244,0)');
      g.addColorStop(.5, `rgba(255,252,244,${a * (.5 + .3 * Math.sin(t * .6 + i))})`);
      g.addColorStop(1, 'rgba(255,252,244,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 26, 0, 52, 1240);
    }
    ctx.restore();
  }, 'mid');
}
// 窗内极淡的空气湿气
function airMist(sc, o = {}) {
  const fog = makeFog({ seed: o.seed ?? 6101, n: o.n ?? 8 });
  sc.dyn((ctx, t) => {
    const g = (o.a ?? .5) * clamp((t - (o.t0 ?? 1)) / 2) * (o.gainFn ? o.gainFn(t) : 1);
    if (g <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0 - 30, IN.y0, IN.x1 - IN.x0 + 60, 620); ctx.clip();
    fog(ctx, t, IN.x0, IN.y0 + 60, IN.x1 - IN.x0, 540, { gain: g, col: o.col ?? [255, 253, 246] });
    ctx.restore();
  }, 'mid');
}

// ================= 8.1（5.01s）室内窗边中景：雨渐小、天光变暖 =================
function shot81() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 8101, rainN: 0, dropN: 40, fog: .55,
    lightBeam: false, bokehGain: .2,
    props: { letter: true, photo: true, cup: true, suitcase: false },
    cam: slowCam({ x: 956, y: 604, z0: 1.0, z1: 1.07, dx: 16, dy: 4, dur: 5.01 }),
    bakeAt: 2.8,
  });
  roomLight(sc, { y0: 320 });
  sillStill(sc, { seed: 8102, bottleX: 1236, clothX: 1400, penX: 690, y: WIN.sillFront - 2 });
  curtainAir(sc, { a: .18 });
  sc.dyn(paneRain({ seed: 8112, n: 260, a0: .95, a1: .08, t0: 0, t1: 4.9, len: 14 }), 'back');
  glassStreaks(sc, { seed: 8113, n: 12, a: .45 });
  airMist(sc, { a: .5, seed: 8114 });
  dust(sc, { seed: 8115, n: 22, a: .5, t0: .9 });
  // 雨渐小时，云后的天光在玻璃上亮起来（暖黄→淡粉）
  sc.dyn((ctx, t) => {
    const a = .4 * clamp((t - .8) / 3.4);
    if (a <= .005) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    const g = ctx.createLinearGradient(0, 380, 0, IN.y1);
    g.addColorStop(0, `rgba(255,248,226,${a * .45})`);
    g.addColorStop(.5, `rgba(255,246,228,${a * .8})`);
    g.addColorStop(1, `rgba(250,236,230,${a})`);
    ctx.fillStyle = g; ctx.fillRect(IN.x0, 360, IN.x1 - IN.x0, IN.y1 - 360);
    ctx.restore();
    glow(ctx, t, 1080, 560, 420, mix3(PAL.lamp, PAL.pinkPale, .45), .26 * clamp((t - 1.4) / 2.6), { breathe: .14, rate: .7 });
  }, 'front');
  return sc;
}

// ================= 8.3（4.29s）她推开窗：过肩 + 轻下摇 =================
function shot83() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 8301, rainN: 0, dropN: 52, fog: .4,
    lightBeam: true, beamGain: 1.05,
    rainbow: { t0: .7, t1: 3.9, cx: 1040, cy: 1010, r0: 540, gain: 1 }, rainbowA: .2, rainbowW: 20,
    props: { letter: true, photo: true, cup: true, suitcase: false },
    cam: camTrack([[0, [1000, 598, 1.02]], [2.2, [986, 626, 1.08]], [4.29, [978, 660, 1.13]]]),
    bakeAt: 2.8,
  });
  roomLight(sc, { y0: 280 });
  sillStill(sc, { seed: 8302, bottleX: 1246, clothX: 1430, penX: 700, y: WIN.sillFront - 2 });
  curtainAir(sc, { a: .26 });
  sc.dyn(paneRain({ seed: 8311, n: 90, a0: .4, a1: 0, t0: 0, t1: 2.6, len: 11 }), 'back');
  glassStreaks(sc, { seed: 8313, n: 16, a: .6 });
  airMist(sc, { a: .55, seed: 8314 });
  dust(sc, { seed: 8315, n: 26, a: .55, t0: .7 });
  // 人物：过肩，手贴玻璃 → 向前推
  sc.dyn((ctx, t) => {
    const u = clamp((t - .25) / 3.0);
    const pose = mixPose(
      herStand({ headYaw: -.24, nod: .02, lean: .02, hairBlow: .2 }),
      herReachOut({ reach: .9, headYaw: -.2, nod: -.05 }),
      ss(u),
    );
    pose.hairBlow = .18 + .08 * Math.sin(t * 1.2);
    girl(ctx, t, { x: 1150, y: 1200, S: 780, yaw: -.22, pitch: .26 }, pose, {
      seed: 8316, t0: .3, dur: 1.2, face: false, ink: .9, color: .85,
    });
  }, 'front');
  charLight(sc, { x: 1380, y: 640, rx: 560, ry: 540, a: .26, t0: .9 });
  // 湿气从窗口向外流动
  const fogF = makeFog({ seed: 8312, n: 9 });
  sc.dyn((ctx, t) => {
    const g = clamp((t - .4) / 2.6);
    if (g <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0 - 60, IN.y0, IN.x1 - IN.x0 + 120, IN.y1 - IN.y0); ctx.clip();
    fogF(ctx, t, IN.x0, IN.y0 + 120, IN.x1 - IN.x0, IN.y1 - IN.y0 - 60, { gain: .3 * g, col: [255, 254, 249] });
    const R = rng(8317);
    for (let i = 0; i < 8; i++) {
      const ph = R() * TAU, y0 = IN.y0 + 180 + R() * 480;
      const x = IN.x0 + 80 + ((R() * 900 + t * (46 + i * 12)) % (IN.x1 - IN.x0 - 160));
      const a = .13 * g * (1 + .35 * Math.sin(t * .9 + ph));
      const rx = 90 + R() * 90, ry = 18 + R() * 16;
      const gr = ctx.createRadialGradient(x, y0, 0, x, y0, rx);
      gr.addColorStop(0, `rgba(255,254,250,${a})`); gr.addColorStop(1, 'rgba(255,254,250,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.ellipse(x, y0, rx, ry, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'mid');
  // 光落在窗台 + 水珠闪亮
  sc.dyn((ctx, t) => {
    sillLight(ctx, t, { a: .38, t0: .6, dur: 1.6 });
    const a = clamp((t - 1.0) / 1.8);
    if (a <= .01) return;
    const R = rng(8318);
    ctx.save();
    for (let i = 0; i < 18; i++) {
      const x = IN.x0 + 60 + R() * (IN.x1 - IN.x0 - 120), y = IN.y0 + 120 + R() * (IN.y1 - IN.y0 - 160);
      const s = (1 + .5 * Math.sin(t * 2.4 + i * 1.7)) * a;
      glow(ctx, t, x, y, 9 + R() * 10, mix3(PAL.lamp, [255, 255, 255], .55), .2 * s, { breathe: .2, rate: 1.4, phase: i });
      if (R() < .5) {
        ctx.strokeStyle = `rgba(255,255,255,${.5 * s})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5); ctx.stroke();
      }
    }
    ctx.restore();
    bottomWash(ctx, { y0: 1000, a: .5 });
  }, 'front');
  return sc;
}

// ================= 8.5（4.29s）她站在窗前看彩虹：固定中景 + 焦点转移 =================
function shot85() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 8501, rainN: 0, dropN: 34, fog: .35,
    lightBeam: true, beamGain: .9,
    rainbow: { t0: .4, t1: 4.0, cx: 1000, cy: 1010, r0: 540, gain: 1 }, rainbowA: .24, rainbowW: 23,
    props: { letter: true, photo: false, cup: false, suitcase: false },
    cam: slowCam({ x: 950, y: 608, z0: 1.02, z1: 1.085, dx: 8, dy: -6, dur: 4.29 }),
    bakeAt: 2.8,
  });
  roomLight(sc, { y0: 300 });
  sillStill(sc, { seed: 8502, bottleX: 1260, clothX: 1440, penX: 720, y: WIN.sillFront - 2 });
  curtainAir(sc, { a: .22 });
  glassStreaks(sc, { seed: 8503, n: 10, a: .4 });
  airMist(sc, { a: .4, seed: 8504 });
  dust(sc, { seed: 8505, n: 26, a: .55, t0: .6 });
  // 焦点转移：开头远处彩虹虚（纸色纱），慢慢退掉；结尾人物轻退焦
  sc.dyn((ctx, t) => {
    const near = 1 - clamp((t - .2) / 2.3);
    if (near > .01) {
      ctx.save();
      ctx.beginPath(); ctx.rect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0); ctx.clip();
      veil(ctx, 1000, 470, 620, 320, .22 * near);
      ctx.restore();
    }
    const far = clamp((t - 2.3) / 1.6);
    if (far > .01) veil(ctx, 1350, 600, 340, 430, .15 * far);
  }, 'front');
  // 人物：站在窗前抬头看虹
  sc.dyn((ctx, t) => {
    const u = clamp((t - .3) / 3.2);
    const pose = mixPose(
      herLookUp({ headYaw: -.3, nod: .26, hairBlow: .16 }),
      herLookUp({ headYaw: -.08, nod: .34, hairBlow: .3 }),
      ss(u),
    );
    pose.hairBlow = .16 + .14 * Math.sin(t * 1.1);
    pose.nod += .03 * Math.sin(t * .8);
    girl(ctx, t, { x: 1370, y: 1160, S: 730, yaw: -.98, pitch: .24 }, pose, {
      seed: 8511, t0: .3, dur: 1.3, face: 'profile', eyesOpen: true, ink: .92, color: .9,
    });
    bottomWash(ctx, { y0: 1010, a: .55 });
  }, 'front');
  charLight(sc, { x: 1230, y: 620, rx: 500, ry: 520, a: .28, t0: .6 });
  return sc;
}

// ================= 9.1（11.56s）窗内广角：拉远 + 上摇，水痕蒸发、光带横扫 =================
function shot91() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 9101, rainN: 0, dropN: 30, fog: .3, lightBeam: false,
    rainbow: { t0: 0, t1: 6.4, cx: 1000, cy: 1010, r0: 520, gain: 1 }, rainbowA: .12, rainbowW: 22,
    props: { letter: true, photo: true, cup: true, suitcase: false },
    cam: camTrack([[0, [958, 622, 1.12]], [5.6, [960, 586, 1.055]], [11.56, [962, 552, 1.0]]]),
    bakeAt: 2.8,
  });
  roomLight(sc, { y0: 320 });
  sillStill(sc, { seed: 9102, bottleX: 1246, clothX: 1420, penX: 700, y: WIN.sillFront - 2 });
  curtainAir(sc, { a: .2 });
  const drops = makeGlassDrops({
    seed: 9111, n: 40, x0: IN.x0 + 20, x1: IN.x1 - 20, y0: IN.y0 + 20, y1: IN.y1 - 8,
    bornSpan: .1, slideMin: .1, slideMax: .5, slMin: 6, slMax: 22, minR: 2.2, maxR: 6.5, trailChance: 1,
  });
  sc.dyn((ctx, t) => {
    const a = 1 - .8 * clamp((t - .4) / 9.2);
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    drops(ctx, t, { gain: .85, alpha: a });
    ctx.restore();
  }, 'mid');
  glassStreaks(sc, { seed: 9112, n: 12, a: .4 });
  airMist(sc, { a: .5, seed: 9113, gainFn: t => 1 - clamp(t / 9) });
  dust(sc, { seed: 9114, n: 30, a: .6, t0: .8 });
  // 天光铺满：暖黄→淡绿
  sc.dyn((ctx, t) => {
    const a = .3 * clamp((t - .6) / 4.2);
    if (a <= .005) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    const g = ctx.createLinearGradient(IN.x0, IN.y0, IN.x1, IN.y1);
    g.addColorStop(0, `rgba(255,246,220,${a})`);
    g.addColorStop(.55, `rgba(246,246,224,${a * .8})`);
    g.addColorStop(1, `rgba(226,238,214,${a * .6})`);
    ctx.fillStyle = g; ctx.fillRect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0);
    ctx.restore();
  }, 'front');
  // 后半段：光带横扫 + 尘埃在光里浮起
  sc.dyn((ctx, t) => {
    const q = clamp((t - 4.8) / 6.6);
    if (q <= .001) return;
    const a = .22 * ss(q);
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    const cx = lerp(IN.x0 - 320, IN.x1 + 320, q);
    const g = ctx.createLinearGradient(cx - 420, IN.y0, cx + 420, IN.y1);
    g.addColorStop(0, 'rgba(255,250,232,0)');
    g.addColorStop(.5, `rgba(255,250,232,${a})`);
    g.addColorStop(1, 'rgba(255,250,232,0)');
    ctx.fillStyle = g; ctx.fillRect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0);
    const R = rng(9115);
    for (let i = 0; i < 26; i++) {
      const bx = IN.x0 + R() * (IN.x1 - IN.x0), by = IN.y0 + R() * (IN.y1 - IN.y0);
      const near = Math.exp(-Math.pow((bx - cx) / 380, 2));
      const aa = a * near * (.4 + .6 * Math.sin(t * .9 + i));
      if (aa <= .01) continue;
      ctx.fillStyle = `rgba(255,252,236,${aa * 2.2})`;
      ctx.beginPath(); ctx.arc(bx + Math.sin(t * .4 + i) * 10, by + Math.cos(t * .3 + i) * 8, .9 + R() * 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'front');
  // 后半段：又一颗水珠滑下
  sc.dyn((ctx, t) => {
    const t0 = 6.2, per = 3.4, tt = t - t0;
    if (tt < 0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    const u = (tt % per) / per;
    const x = 860 + Math.sin(u * 3.2) * 8, y = IN.y0 + 90 + u * (IN.y1 - IN.y0 - 210);
    const rr = 4.6 * (1 - u * .2);
    ctx.globalAlpha = clamp((1 - u) * 2.2);
    ctx.fillStyle = 'rgba(214,226,232,.5)';
    ctx.beginPath(); ctx.ellipse(x, y, rr * .8, rr * 1.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(43,37,32,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, rr * .8, rr * 1.5, .2, .1, TAU - .4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x - rr * .25, y - rr * .6, rr * .3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
  }, 'front');
  // 窗台光带
  sc.dyn((ctx, t) => {
    const a = .28 * clamp((t - .9) / 3.6);
    if (a <= .005) return;
    const g = ctx.createLinearGradient(0, 700, 0, 900);
    g.addColorStop(0, 'rgba(255,248,226,0)');
    g.addColorStop(.5, `rgba(255,246,220,${a})`);
    g.addColorStop(1, `rgba(240,244,222,${a * .7})`);
    ctx.save(); ctx.fillStyle = g; ctx.fillRect(WIN.x0 - 30, 700, WIN.x1 - WIN.x0 + 60, 200); ctx.restore();
  }, 'front');
  return sc;
}

// ================= 9.2（11.56s）窗台特写：彩虹最饱满的落点 =================
function shot92() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 9201, flatPar: true, rainN: 0, dropN: 26, fog: .35,
    lightBeam: true, beamGain: .8,
    rainbow: { t0: 0, t1: 7.5, cx: 1000, cy: 1010, r0: 540, gain: 1 }, rainbowA: .3, rainbowW: 24,
    props: { letter: true, photo: true, cup: false, suitcase: false },
    letterState: { x: 430, y: 806 }, photoState: { x: 980, y: 812 },
    cam: camTrack([[0, [800, 792, 1.62]], [5.5, [820, 806, 1.8]], [11.56, [842, 820, 1.98]]]),
    bakeAt: 2.8,
  });
  sillStill(sc, { seed: 9202, bottleX: 700, clothX: 1450, penX: 560, y: WIN.sillFront - 2 });
  glassStreaks(sc, { seed: 9203, n: 14, a: .55 });
  dust(sc, { seed: 9204, n: 22, a: .5, t0: .6, y0: 300, y1: 820 });
  bowOnSill(sc, { t0: .5, t1: 9.6, a: .3, tilt: .5, warm: 1.1 });
  // 信纸上的细色带（更明确的"落在纸面"）
  sc.dyn((ctx, t) => {
    const u = clamp((t - 1.2) / 8.4);
    if (u <= .001) return;
    const a = .08 + .22 * ss(u);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(430, 800); ctx.lineTo(700, 782); ctx.lineTo(712, 884); ctx.lineTo(442, 902); ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < BOW.length; i++) {
      ctx.strokeStyle = rgba(BOW[i], a * (.7 + .3 * Math.sin(i / 5 * Math.PI)));
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(400 + i * 26 + u * 16, 902);
      ctx.lineTo(620 + i * 26 + u * 16, 780);
      ctx.stroke();
    }
    ctx.restore();
  }, 'front');
  // 窗沿滴落的水珠
  const drips = [...Array(8)].map((_, i) => {
    const R = rng(9211 + i * 7);
    return { x: 420 + i * 150 + R() * 70, y0: WIN.y1 - 6 + R() * 16, t0: i * .92 + R() * .7, per: 2.4 + R() * 1.6, r: 3 + R() * 3.5 };
  });
  sc.dyn((ctx, t) => {
    ctx.save();
    for (const d of drips) {
      const tt = t - d.t0;
      if (tt < 0) continue;
      const u = (tt % d.per) / d.per;
      const y = d.y0 + u * u * 260, rr = d.r * (1 - u * .35);
      ctx.globalAlpha = clamp((1 - u) * 3);
      ctx.fillStyle = 'rgba(214,226,232,.55)';
      ctx.beginPath(); ctx.ellipse(d.x, y, rr * .8, rr * 1.5, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(43,37,32,.38)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(d.x, y, rr * .8, rr * 1.5, .2, .1, TAU - .4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(d.x - rr * .25, y - rr * .6, rr * .3, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }, 'front');
  // 水珠上的彩虹反光（越到后面越明显）
  sc.dyn((ctx, t) => {
    const u = clamp((t - 4) / 6.6);
    if (u <= .001) return;
    const R = rng(9212);
    ctx.save();
    ctx.beginPath(); ctx.rect(WIN.x0, WIN.y1 - 30, WIN.x1 - WIN.x0, 120); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 16; i++) {
      const x = 360 + R() * 1200, y = WIN.y1 - 8 + R() * 70, rr = 4 + R() * 8;
      const c = BOW[i % BOW.length];
      ctx.strokeStyle = rgba(c, .22 * u);
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(x, y, rr, .3, TAU - .3); ctx.stroke();
    }
    ctx.restore();
  }, 'front');
  // 后半段：新的一颗水珠滑落到信纸
  sc.dyn((ctx, t) => {
    const t0 = 7.6, per = 3.2, tt = t - t0;
    if (tt < 0) return;
    const u = (tt % per) / per;
    const x = 760 + u * 26, y = 700 + u * u * 190;
    const rr = 4.4 * (1 - u * .3);
    ctx.save();
    ctx.globalAlpha = clamp((1 - u) * 2.5);
    ctx.fillStyle = 'rgba(214,226,232,.5)';
    ctx.beginPath(); ctx.ellipse(x, y, rr * .85, rr * 1.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(43,37,32,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x, y, rr * .85, rr * 1.5, .2, .1, TAU - .4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(x - rr * .25, y - rr * .6, rr * .32, 0, TAU); ctx.fill();
    ctx.restore();
  }, 'front');
  return sc;
}

// ================= 9.4（8.51s）侧脸过肩：安静微笑，光落在脸上 =================
function shot94() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 9401, rainN: 0, dropN: 28, fog: .38,
    lightBeam: true, beamGain: .85,
    rainbow: { t0: .2, t1: 7.2, cx: 1000, cy: 1010, r0: 530, gain: 1 }, rainbowA: .22, rainbowW: 22,
    props: { letter: true, photo: false, cup: true, suitcase: false },
    cam: slowCam({ x: 980, y: 640, z0: 1.02, z1: 1.1, dx: 12, dy: -12, dur: 8.51 }),
    bakeAt: 2.8,
  });
  roomLight(sc, { y0: 300 });
  sillStill(sc, { seed: 9402, bottleX: 1250, clothX: 1430, penX: 700, y: WIN.sillFront - 2 });
  curtainAir(sc, { a: .28 });
  glassStreaks(sc, { seed: 9403, n: 12, a: .45 });
  airMist(sc, { a: .42, seed: 9404, gainFn: t => 1 - .5 * clamp((t - 4) / 4.2) });
  dust(sc, { seed: 9405, n: 28, a: .6, t0: .5 });
  // 人物：左侧过肩侧脸，安静微笑
  sc.dyn((ctx, t) => {
    const u = clamp((t - .3) / 7.4);
    const pose = mixPose(
      herStand({ headYaw: -.04, nod: .12, lean: .02, hairBlow: .12 }),
      herSmileDown({ headYaw: -.02, nod: -.04, headSide: .06 }),
      ss(u) * .7,
    );
    pose.hairBlow = .12 + .1 * Math.sin(t * .9);
    pose.headYaw = -.05 + .05 * Math.sin(t * .45);
    girl(ctx, t, { x: 640, y: 1210, S: 830, yaw: 1.42, pitch: .22 }, pose, {
      seed: 9411, t0: .3, dur: 1.5, face: 'profile', eyesOpen: false, ink: .94, color: .92,
    });
    bottomWash(ctx, { y0: 980, a: .55 });
  }, 'front');
  charLight(sc, { x: 860, y: 560, rx: 520, ry: 520, a: .3, t0: .5 });
  sc.dyn((ctx, t) => {
    const a = .26 * clamp((t - .8) / 3.2);
    if (a > .005) glow(ctx, t, 776, 456, 140, mix3(PAL.warm, PAL.pinkPale, .35), a, { breathe: .16, rate: .8 });
  }, 'front');
  // 窗外的空气感（后半段慢慢散）
  sc.dyn((ctx, t) => {
    const a = .18 * (1 - .55 * clamp((t - 4) / 4.2)) * clamp((t - .4) / 2.4);
    if (a <= .005) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0, IN.y0, IN.x1 - IN.x0, IN.y1 - IN.y0); ctx.clip();
    airVeil(ctx, t, { a, y0: IN.y0, y1: IN.y1, col: mix3(PAL.warm, [255, 255, 250], .4) });
    ctx.restore();
  }, 'mid');
  return sc;
}

// ================= 9.5（7.28s）雨停后的窗台空镜 → 渐留白 =================
function shot95() {
  const sc = windowSet({
    view: 'sky', weather: 'after', seed: 9501, rainN: 0, dropN: 40, fog: .4,
    lightBeam: true, beamGain: .8,
    rainbow: { t0: .3, t1: 4.8, cx: 1000, cy: 1010, r0: 540, gain: 1 }, rainbowA: .16, rainbowW: 21,
    props: { letter: true, photo: true, cup: true, suitcase: false },
    letterState: { x: 452, y: 802 }, photoState: { x: 1010, y: 808 }, cupState: { x: 866, y: 842 },
    cam: camTrack([[0, [960, 760, 1.30]], [3.6, [960, 690, 1.15]], [7.28, [960, 606, 1.02]]]),
    bakeAt: 2.8,
  });
  roomLight(sc, { y0: 300 });
  sillStill(sc, { seed: 9502, bottleX: 1230, clothX: 1430, penX: 690, y: WIN.sillFront - 2 });
  curtainAir(sc, { a: .2 });
  glassStreaks(sc, { seed: 9503, n: 12, a: .5 });
  airMist(sc, { a: .55, seed: 9504, gainFn: t => 1 - clamp(t / 5.6) });
  dust(sc, { seed: 9505, n: 26, a: .55, t0: .5 });
  bowOnSill(sc, { t0: .3, t1: 4.6, a: .2, tilt: .45, warm: .9 });
  // 窗台上的彩虹光 + 水珠闪光
  sc.dyn((ctx, t) => {
    sillLight(ctx, t, { a: .3, t0: .2, dur: 2.2 });
    const a = (1 - clamp((t - 2.2) / 4.4)) * clamp(t / 1.0);
    if (a <= .01) return;
    const R = rng(9511);
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const x = WIN.x0 + 80 + R() * (WIN.x1 - WIN.x0 - 160), y = WIN.y1 - 20 + R() * 70;
      glow(ctx, t, x, y, 8 + R() * 9, mix3(PAL.lamp, [255, 255, 255], .6), .22 * a * (1 + .4 * Math.sin(t * 2 + i)), { breathe: .2, rate: 1.2, phase: i });
    }
    ctx.restore();
  }, 'front');
  // 极轻的雾在窗内飘（雨停了，潮气还在）
  const fog = makeFog({ seed: 9512, n: 9 });
  sc.dyn((ctx, t) => {
    const g = .55 * (1 - clamp(t / 6.2));
    if (g <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(IN.x0 - 60, IN.y0, IN.x1 - IN.x0 + 120, IN.y1 - IN.y0); ctx.clip();
    fog(ctx, t, IN.x0 - 40, IN.y0 + 80, IN.x1 - IN.x0 + 80, IN.y1 - IN.y0, { gain: g, col: [255, 254, 248] });
    ctx.restore();
  }, 'mid');
  // 渐留白：纸色慢慢盖上来，但保留窗框/窗台/信/照片的幽灵（不是纯纸）
  sc.dyn((ctx, t) => {
    const u = clamp((t - 3.8) / 3.4);
    if (u <= .001) return;
    const a = .7 * ss(u);
    ctx.save();
    ctx.fillStyle = `rgba(245,238,222,${a})`;
    ctx.fillRect(-40, 20, 2000, 1200);
    // 留白里只剩极淡的水痕 + 窗框残影
    const a2 = .16 * ss(u) * (1 - .3 * u);
    const R = rng(9513);
    ctx.strokeStyle = rgba(mix3(PAL.grey, PAL.bluePale, .55), a2);
    ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const x0 = 300 + R() * 1300, y0 = 140 + R() * 560;
      const len = 90 + R() * 240;
      ctx.beginPath();
      for (let k = 0; k <= 7; k++) {
        const q = k / 7, y = y0 + len * q, x = x0 + Math.sin(q * 3.6 + i * 1.7) * 5;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(INK, .07 * ss(u));
    ctx.lineWidth = 2;
    ctx.strokeRect(WIN.x0, WIN.y0, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0);
    ctx.beginPath(); ctx.moveTo(WIN.mull, WIN.y0); ctx.lineTo(WIN.mull, WIN.y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(WIN.x0, WIN.trans); ctx.lineTo(WIN.x1, WIN.trans); ctx.stroke();
    ctx.restore();
  }, 'front');
  return sc;
}

export const SCENES = {
  '8.1': shot81,
  '8.3': shot83,
  '8.5': shot85,
  '9.1': shot91,
  '9.2': shot92,
  '9.4': shot94,
  '9.5': shot95,
};
