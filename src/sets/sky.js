// 天空速写页：云层 / 云缝 / 光柱 / 雨丝渐小 / 远处城市屋脊 / 彩虹透明色带
// 全片「窗外仰视」的独立一页（5.4 / 8.2 直接用它），也给室内镜头提供可复用的天光参数。
//
// skySet(opts) → Scene（1920×1080，base (960,540)，4 层视差：skyfar .4 / back .55 / mid .82 / front 1）
// 画法（钢笔淡彩）：天光湿画淡彩打底 → 暗云顶（乘法）→ 云缘暖光 → 亮白云缘小球 → 短速写墨线
//                    → 远处城市屋脊 → 雨/雾/光柱/彩虹（动态层）。
// 不生成文字、不用景深模糊、不露黑；底部字幕安全区渐隐留白。
//
// opts:
//   weather   'rain' | 'after' | 'dusk'        天光配色（默认 'after'）
//   seed      数字                              随机种子（决定云形/城市/雨）
//   ceiling   'rain' | 'break' | 'soft' | []    暗云顶（大面积阴云）预设或自定义
//   clouds    'heavy' | 'break' | 'soft' | []   亮白云缘预设或自定义云团数组
//             cloud mass = { x, y, rx, ry, a 云肚浓度, warm 0..1 云缘暖光, ink 0..1 墨线, n 团数, t0 }
//   warmth    0..1.6                            云缘暖光总强度
//   horizon   数字                              远处屋脊基准线（默认 800）
//   city      0..1                              远处城市屋脊强度（0 = 不画）
//   cityWarm  0..1                              屋脊上落下来的暖光
//   rain      false | { n, a0, a1, slant, t0, t1, len }   a0→a1 雨量（渐小）
//   beam      false | { x, y, tx, ty, w0, w1, t0, t1, gain }   云缝光柱
//   glowAt    false | { x, y, r, a, t0, t1 }    云缝里的暖光核
//   rainbow   false | { mode:'arc'|'sheen', t0, t1, cx, cy, r0, bandW, a, gain, reveal, layer }
//   birds     false | { t0, n, x, y }
//   mist      0..1.4                            低空雾气
//   drift     云层漂移强度（0 = 不动）
//   bottomFade 0..1                             底部字幕安全区的留白渐隐
//   bakeAt    数字                              静态层烘焙时间
import {
  Scene, PAL, PEN, camTrack, slowCam, seg, clamp, lerp, ss, TAU, rng, n2, fbm,
  hex, mix3, rgba, ellipse, spline, INK,
} from '../core.js';
import { makeRain, makeFog, glow, airVeil } from '../fx.js';

// ---------------- 天光配色 ----------------
export function skyMood(kind) {
  if (kind === 'rain') return {
    top: mix3(PAL.blue, PAL.grey, .55), topA: .34,
    mid: mix3(PAL.grey, PAL.bluePale, .42), midA: .26,
    low: mix3(PAL.cream, PAL.lamp, .34), lowA: .16,
    deck: mix3(PAL.grey, PAL.blueDeep, .32), deck2: mix3(PAL.greyDeep, PAL.violet, .3),
    cloud: mix3(PAL.greyLight, PAL.violet, .32), deep: mix3(PAL.grey, PAL.blue, .3),
    rim: mix3(PAL.lamp, PAL.cream, .5), rimA: .2,
    rainCol: mix3(PAL.greyDeep, PAL.blue, .3),
    city: mix3(PAL.stoneCool, PAL.bluePale, .6), cityWarm: mix3(PAL.lamp, PAL.cream, .55),
    ink: .9, warm: .5,
  };
  if (kind === 'dusk') return {
    top: mix3(PAL.bluePale, PAL.violet, .3), topA: .3,
    mid: mix3(PAL.pinkPale, PAL.bluePale, .38), midA: .26,
    low: mix3(PAL.cream, PAL.orange, .5), lowA: .34,
    deck: mix3(PAL.grey, PAL.violet, .36), deck2: mix3(PAL.greyDeep, PAL.violet, .42),
    cloud: mix3(PAL.greyLight, PAL.violet, .4), deep: mix3(PAL.grey, PAL.violet, .32),
    rim: mix3(PAL.orange, PAL.cream, .35), rimA: .28,
    rainCol: mix3(PAL.greyDeep, PAL.blue, .3),
    city: mix3(PAL.stoneCool, PAL.pinkPale, .45), cityWarm: mix3(PAL.lamp, PAL.orange, .35),
    ink: .85, warm: 1,
  };
  // after：雨停，青灰 → 淡粉 → 淡橙
  return {
    top: mix3(PAL.bluePale, PAL.grey, .5), topA: .32,
    mid: mix3(PAL.pinkPale, PAL.bluePale, .4), midA: .26,
    low: mix3(PAL.cream, PAL.warm, .55), lowA: .32,
    deck: mix3(PAL.grey, PAL.violet, .32), deck2: mix3(PAL.greyDeep, PAL.violet, .3),
    cloud: mix3(PAL.greyLight, PAL.violet, .28), deep: mix3(PAL.grey, PAL.blue, .28),
    rim: mix3(PAL.lamp, PAL.cream, .35), rimA: .3,
    rainCol: mix3(PAL.greyDeep, PAL.blue, .25),
    city: mix3(PAL.stoneCool, PAL.bluePale, .5), cityWarm: mix3(PAL.lamp, PAL.cream, .4),
    ink: .85, warm: 1,
  };
}

// ---------------- 暗云顶：起伏的云顶边界 + 下方大面积湿画阴云 ----------------
// 用几个不同高度/宽度的圆丘拼出云顶轮廓（比单纯正弦起伏更像积云）
function bankEdge(x0, x1, y, amp, seed, lobes = 6) {
  const pts = [];
  const n = Math.max(26, Math.round((x1 - x0) / 38));
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = lerp(x0, x1, u);
    let h = 0;
    for (let k = 0; k < lobes; k++) {
      const c = (k + .5) / lobes + (n2(k * 3.1, seed, 1) - .5) * .2;
      const w = .16 + n2(k * 1.7, seed + 1, 2) * .26;
      const A = .4 + n2(k * 2.3, seed + 2, 3) * .85;
      const d = (u - c) / w;
      h += A * Math.exp(-d * d * 2.1);
    }
    h += (n2(u * 9, seed, 4) - .5) * .22 + (n2(u * 23, seed + 5, 6) - .5) * .1;
    pts.push([x, y - Math.max(0, h) * amp]);
  }
  return pts;
}
// 云顶的亮白云缘：沿云顶压出几条扁长的白，像被光咬过的边
function rimPuffs(sc, R, edge, M, o, d) {
  const seed = (o.seed ?? 1) + (d.seed ?? 1) + 90;
  const step = d.rimStep ?? 7;
  for (let i = 3; i + 3 < edge.length; i += step) {
    const [ex, ey] = edge[i];
    const [nx, ny] = edge[Math.min(edge.length - 1, i + 2)];
    const rx = (d.rimRx ?? 150) * (.6 + R() * .55);
    const ry = (d.rimRy ?? 30) * (.65 + R() * .5);
    const cx = (ex + nx) * .5 + (R() - .5) * 40, cy = (ey + ny) * .5 + 4 + (R() - .5) * 8;
    const poly = puffPoly(R, cx, cy, rx, ry, 9 + Math.floor(R() * 3));
    sc.fill(poly, [254, 252, 245], { layer: 'back', j: 7, seed: seed + i, t0: (d.t0 ?? .4) + .35 + i * .01, dur: .16, alpha: .9 });
    // 白云的暖光边 + 冷云肚
    if ((d.rimA ?? .2) > .05) sc.wash(ellipse(cx + rx * .1, cy - ry * .3, rx * .9, ry * .7, 16), [255, 253, 246],
      { a: .18, j: 12, layers: 1, edge: 0, seed: seed + i + 3 }, { layer: 'back', t0: (d.t0 ?? .4) + .42 + i * .01, dur: .5 });
    sc.wash(ellipse(cx + rx * .03, cy + ry * .46, rx * .78, ry * .26, 14), M.cloud,
      { a: (d.rimA ?? .2) * .7, j: 14, layers: 1, edge: 0, seed: seed + i + 5 }, { layer: 'back', t0: (d.t0 ?? .4) + .45 + i * .01, dur: .6 });
    // 云缘上的一两笔速写线
    if (R() < .55) {
      const arc = [];
      for (let k = 0; k <= 4; k++) { const u = k / 4; arc.push([cx + (u - .5) * rx * 1.5, cy - ry * .85 - Math.sin(u * Math.PI) * ry * .25]); }
      sc.ink(arc, { w: 1.0 + R() * .6, wob: 1.1, over: 2 + R() * 3, seed: seed + i + 7, smooth: true },
        { layer: 'back', t0: (d.t0 ?? .4) + .6 + i * .01, dur: .35, alpha: .16 + R() * .14 });
    }
  }
}
function addBank(sc, R, d, M, o) {
  const t0 = d.t0 ?? (.3 + R() * .3);
  const x0 = d.x0 ?? -90, x1 = d.x1 ?? 2010;
  const y = d.y ?? 240, amp = d.amp ?? 110;
  const edge = bankEdge(x0, x1, y, amp, (o.seed ?? 1) + (d.seed ?? 1), d.lobes ?? 6);
  const bot = d.bottom ?? 1090;
  const col = d.col === 'deep' ? M.deck2 : M.deck;
  const a = d.a ?? .2;
  const skewL = d.skewL ?? 0, skewR = d.skewR ?? 0;
  // 主体：湿画阴云（乘法，不压黑）；顶部与底部都是起伏的云缘
  const botEdge = bankEdge(x0 - 70 + skewL, x1 + 70 + skewR, bot, d.botAmp ?? 54, (o.seed ?? 1) + (d.seed ?? 1) + 3, Math.max(4, (d.lobes ?? 6) - 1));
  const poly = [...edge, ...botEdge.slice().reverse()];
  sc.wash(poly, col, { a, j: 30, layers: 2, edge: 0, seed: (d.seed ?? 1) + 10, freq: .006 },
    { layer: 'back', t0, dur: .8 });
  // 云顶下方更沉（有重量）
  const band = [...edge, ...edge.slice().reverse().map(([px, py]) => [lerp(px, (x0 + x1) / 2, .08), Math.min(bot, py + (d.depth ?? 150))])];
  sc.wash(band, mix3(col, M.deck2, .55), { a: a * .55, j: 24, layers: 1, edge: 0, seed: (d.seed ?? 1) + 12 },
    { layer: 'back', t0: t0 + .2, dur: .8 });
  // 云缘暖光：贴着云顶上方的一条窄暖光（极淡）
  const rim = (d.rim ?? 0) * (o.warmth ?? 1);
  if (rim > .02) {
    const rimH = d.rimH ?? 34;
    const rp = [...edge.map(([px, py]) => [px, py - rimH]), ...edge.slice().reverse()];
    sc.wash(rp, M.rim, { a: M.rimA * rim * .7, j: 22, layers: 1, edge: 0, seed: (d.seed ?? 1) + 14 },
      { layer: 'back', t0: t0 + .35, dur: 1.0 });
    const rp2 = [...edge.map(([px, py]) => [px, py - rimH * .4]), ...edge.slice().reverse()];
    sc.wash(rp2, mix3(M.rim, [255, 252, 244], .35), { a: M.rimA * rim, j: 26, layers: 1, edge: 0, seed: (d.seed ?? 1) + 15 },
      { layer: 'back', t0: t0 + .45, dur: 1.0 });
  }
  // 裂缝内侧的暖光边（云被光咬开的那一侧）
  if (d.rimSide && rim > .02) {
    const w = d.rimSideW ?? 92;
    const last = edge[edge.length - 1], first = edge[0];
    let sp;
    if (d.rimSide === 'right') {
      sp = [[last[0] + 64, last[1] - 10], [last[0] + 64 + skewR * .3, bot], [last[0] + 64 + skewR * .3 - w, bot], [last[0] + 64 - w, last[1] + 6]];
    } else {
      sp = [[first[0] - 64, first[1] - 10], [first[0] - 64 + skewL * .3, bot], [first[0] - 64 + skewL * .3 + w, bot], [first[0] - 64 + w, first[1] + 6]];
    }
    sc.wash(sp, M.rim, { a: M.rimA * rim * .85, j: 18, layers: 1, edge: 0, seed: (d.seed ?? 1) + 16 },
      { layer: 'back', t0: t0 + .5, dur: 1.1 });
    // 缝边的短墨线
    const n = 4;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const px = lerp(sp[0][0], sp[1][0], u), py = lerp(sp[0][1], sp[1][1], u);
      if (R() < .5) sc.ink([[px, py], [px + (R() - .5) * 8, py + 40 + R() * 40]], { w: 1.0 + R() * .5, wob: .9, seed: (d.seed ?? 1) + 30 + k, over: 2, gap: .5 },
        { layer: 'back', t0: t0 + .7 + k * .05, dur: .4, alpha: .18 + R() * .12 });
    }
  }
  // 亮白云缘小球
  if (d.rimPuffs !== false) rimPuffs(sc, R, edge, M, o, { t0, ...d, seed: d.seed });
  // 速写墨线：沿云顶的短断线（不画长线）
  const inkAmt = (d.ink ?? 1) * (M.ink ?? .85);
  if (inkAmt > .04) {
    for (let i = 3; i + 4 < edge.length; i += 5 + Math.floor(R() * 4)) {
      const run = edge.slice(i, i + 3 + Math.floor(R() * 3)).map(([px, py]) => [px, py + 1 + R() * 2]);
      if (run.length < 2) continue;
      sc.ink(run, { w: 1.1 + R() * .9, wob: 1.3, over: 2 + R() * 4, seed: (d.seed ?? 1) + 20 + i, smooth: true },
        { layer: 'back', t0: t0 + .5 + (i / edge.length) * .4, dur: .4, alpha: .2 + .3 * inkAmt });
    }
  }
  return edge;
}

function ceilingPlan(kind) {
  if (kind === 'rain') return [
    { x0: -120, x1: 2040, y: 96, amp: 70, lobes: 8, a: .2, bottom: 380, depth: 160, rim: .35, seed: 11, ink: .55 },
    { x0: -120, x1: 2040, y: 318, amp: 100, lobes: 8, a: .19, bottom: 640, depth: 180, rim: .8, seed: 12, ink: .95 },
    { x0: -120, x1: 2040, y: 600, amp: 78, lobes: 10, a: .15, bottom: 792, depth: 140, rim: 1, seed: 13, ink: 1, rimStep: 9, rimPuffs: false },
  ];
  if (kind === 'break') return [
    { x0: -160, x1: 1010, y: 110, amp: 92, lobes: 5, a: .2, bottom: 470, depth: 170, rim: .5, seed: 21, ink: .8, skewR: -220, rimSide: 'right' },
    { x0: -160, x1: 900, y: 372, amp: 104, lobes: 4, a: .17, bottom: 560, depth: 180, rim: 1, seed: 22, ink: 1, skewR: -300, rimSide: 'right' },
    { x0: 1240, x1: 2080, y: 76, amp: 86, lobes: 5, a: .2, bottom: 450, depth: 170, rim: .5, seed: 23, ink: .8, skewL: 260, rimSide: 'left' },
    { x0: 1220, x1: 2080, y: 350, amp: 102, lobes: 4, a: .17, bottom: 560, depth: 180, rim: 1, seed: 24, ink: 1, skewL: 340, rimSide: 'left' },
  ];
  if (kind === 'soft') return [
    { x0: -120, x1: 2040, y: 180, amp: 80, lobes: 7, a: .13, bottom: 620, depth: 160, rim: .6, seed: 31, ink: .5 },
    { x0: -120, x1: 2040, y: 480, amp: 90, lobes: 6, a: .1, bottom: 820, depth: 150, rim: .8, seed: 32, ink: .5 },
  ];
  return [];
}

// ---------------- 亮白云缘（小团白云） ----------------
function puffPoly(R, x, y, rx, ry, n = 10) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const a = Math.PI + (k / n) * Math.PI;
    const rr = .82 + .26 * R();
    pts.push([x + Math.cos(a) * rx * rr, y + Math.sin(a) * ry * rr * (1.02 + .24 * R())]);
  }
  pts.push([x + rx * .9, y + ry * .34], [x + rx * .2, y + ry * .46], [x - rx * .5, y + ry * .4], [x - rx * .92, y + ry * .24]);
  return spline(pts, 4, true);
}
function topEnvelope(puffs) {
  const x0 = Math.min(...puffs.map(p => p.x - p.rx)), x1 = Math.max(...puffs.map(p => p.x + p.rx));
  const pts = [];
  for (let x = x0 + 10; x <= x1 - 10; x += 26) {
    let y = 1e9;
    for (const p of puffs) {
      const u = (x - p.x) / p.rx;
      if (Math.abs(u) < .97) y = Math.min(y, p.y - p.ry * Math.sqrt(1 - u * u));
    }
    if (y < 1e8) pts.push([x, y]);
  }
  return pts;
}
function addCloud(sc, R, m, M, o) {
  const x = m.x, y = m.y, rx = m.rx, ry = m.ry;
  const a = m.a ?? .24, warm = (m.warm ?? 0) * (o.warmth ?? 1);
  const t0 = m.t0 ?? (.3 + R() * .32);
  const seed = m.seed ?? (1000 + Math.round(x));
  const n = m.n ?? (3 + Math.round(R() * 2));
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? .5 : i / (n - 1);
    const lift = Math.sin(u * Math.PI) * (.5 + .5 * R());
    puffs.push({
      x: x + (u - .5) * rx * 1.7 + (R() - .5) * rx * .16,
      y: y - lift * ry * .32 + (R() - .5) * ry * .12,
      rx: rx * (.3 + .14 * R()) * (m.lump ?? 1),
      ry: ry * (.72 + .32 * R()),
    });
  }
  // 1) 云缘暖光（只从白云边缘透出极淡的一圈）
  if (warm > .02) {
    sc.wash(ellipse(x + rx * .06, y - ry * .22, rx * .96, ry * .85, 22), M.rim,
      { a: M.rimA * warm * .8, j: 20, layers: 1, edge: 0, seed: seed + 1, freq: .012 },
      { layer: 'back', t0: t0 + .18, dur: .9 });
    sc.wash(ellipse(x + rx * .24, y - ry * .1, rx * .5, ry * .55, 18), mix3(M.rim, [255, 251, 242], .45),
      { a: M.rimA * warm * .6, j: 24, layers: 1, edge: 0, seed: seed + 2 },
      { layer: 'back', t0: t0 + .3, dur: 1 });
  }
  // 2) 云体：几团白，粗糙边
  for (let i = 0; i < puffs.length; i++) {
    const p = puffs[i];
    const poly = puffPoly(R, p.x, p.y, p.rx, p.ry, 9 + (i % 3));
    sc.fill(poly, [254, 252, 245], { layer: 'back', j: 8, seed: seed + 10 + i, t0: t0 + i * .055, dur: .14, alpha: m.alpha ?? .95 });
  }
  // 3) 云肚
  sc.wash(ellipse(x + rx * .03, y + ry * .4, rx * .92, ry * .34, 20), M.cloud,
    { a: a * 1.15, j: 20, layers: 2, edge: 0, seed: seed + 20 }, { layer: 'back', t0: t0 + .38, dur: .9 });
  sc.wash(ellipse(x - rx * .2, y + ry * .24, rx * .5, ry * .24, 16), M.deep,
    { a: a * .62, j: 24, layers: 1, edge: 0, seed: seed + 21 }, { layer: 'back', t0: t0 + .5, dur: .9 });
  // 4) 云顶留白
  sc.wash(ellipse(x - rx * .16, y - ry * .58, rx * .58, ry * .26, 18), [255, 254, 250],
    { a: .28 * (o.topWhite ?? 1), j: 16, layers: 1, edge: 0, seed: seed + 22 }, { layer: 'back', t0: t0 + .55, dur: .8 });
  // 5) 墨线：沿云顶轮廓的短断线
  const inkAmt = (m.ink ?? 1) * (M.ink ?? .85) * (m.inkAmt ?? 1);
  if (inkAmt > .04) {
    const env = topEnvelope(puffs).map(([px, py]) => [px, py + 3]);
    for (let q = 1; q + 2 < env.length; q += 4 + Math.floor(R() * 3)) {
      const run = env.slice(q, q + 3 + Math.floor(R() * 2));
      if (run.length < 2) continue;
      sc.ink(run, { w: 1.0 + R() * .9, wob: 1.4, over: 2 + R() * 4, seed: seed + 30 + q, smooth: true },
        { layer: 'back', t0: t0 + .6 + q * .008, dur: .4, alpha: .2 + .28 * inkAmt });
    }
  }
  return puffs;
}

function cloudPlan(kind) {
  if (kind === 'rainclouds') return [
    { x: 620, y: 250, rx: 330, ry: 96, a: .26, warm: .12, n: 5 },
    { x: 1220, y: 205, rx: 360, ry: 100, a: .26, warm: .22, n: 5 },
    { x: 380, y: 430, rx: 280, ry: 84, a: .22, warm: .1, n: 4 },
    { x: 1320, y: 420, rx: 320, ry: 92, a: .24, warm: .3, n: 4 },
    { x: 880, y: 600, rx: 420, ry: 90, a: .2, warm: .34, n: 5 },
    { x: 1640, y: 640, rx: 300, ry: 78, a: .18, warm: .36, n: 4 },
    { x: 560, y: 740, rx: 380, ry: 76, a: .16, warm: .3, n: 4 },
  ];
  if (kind === 'heavy') return [
    { x: 320, y: 300, rx: 230, ry: 54, a: .22, warm: .2, n: 4 },
    { x: 900, y: 250, rx: 250, ry: 56, a: .22, warm: .28, n: 4 },
    { x: 1520, y: 300, rx: 260, ry: 58, a: .2, warm: .45, n: 4 },
    { x: 560, y: 520, rx: 240, ry: 56, a: .2, warm: .3, n: 4 },
    { x: 1200, y: 540, rx: 250, ry: 56, a: .2, warm: .45, n: 4 },
    { x: 860, y: 720, rx: 300, ry: 52, a: .16, warm: .4, n: 4 },
  ];
  if (kind === 'break') return [
    { x: 300, y: 280, rx: 230, ry: 58, a: .2, warm: .45, n: 4 },
    { x: 700, y: 520, rx: 210, ry: 52, a: .17, warm: .9, n: 3 },
    { x: 420, y: 700, rx: 250, ry: 54, a: .14, warm: 1, n: 4 },
    { x: 1560, y: 240, rx: 270, ry: 64, a: .2, warm: .85, n: 4 },
    { x: 1740, y: 500, rx: 220, ry: 54, a: .17, warm: 1, n: 3 },
    { x: 1480, y: 700, rx: 250, ry: 52, a: .14, warm: 1, n: 3 },
    { x: 460, y: 806, rx: 300, ry: 26, a: .12, warm: 1.2, n: 3 },
    { x: 1180, y: 818, rx: 260, ry: 22, a: .1, warm: 1.2, n: 3 },
    { x: 1720, y: 796, rx: 240, ry: 22, a: .1, warm: 1.1, n: 3 },
  ];
  if (kind === 'soft') return [
    { x: 380, y: 260, rx: 260, ry: 70, a: .16, warm: .5, n: 4 },
    { x: 1080, y: 210, rx: 280, ry: 74, a: .15, warm: .6, n: 4 },
    { x: 760, y: 470, rx: 260, ry: 62, a: .14, warm: .7, n: 4 },
    { x: 1480, y: 500, rx: 240, ry: 60, a: .14, warm: .7, n: 3 },
    { x: 1050, y: 690, rx: 300, ry: 58, a: .12, warm: .8, n: 4 },
  ];
  return [];
}

// ---------------- 远处城市屋脊（低对比、底部渐隐） ----------------
function cityBand(sc, R, M, o) {
  const hz = o.horizon ?? 810;
  const city = o.city ?? 1;
  if (city <= .01) return;
  const R2 = rng((o.seed ?? 1) + 360);
  let x = -80;
  while (x < 2000) {
    const w = 46 + R2() * 118;
    const tall = R2() < .14;
    const top = hz - 22 + (R2() - .5) * 26 - (tall ? 26 + R2() * 42 : 0);
    const bot = hz + 130;
    const roof = R2();
    let poly;
    if (roof < .2) poly = [[x, bot], [x, top + 10], [x + w * .34, top + 10], [x + w * .5, top - 8], [x + w * .66, top + 10], [x + w, top + 10], [x + w, bot]];
    else if (roof < .34) poly = [[x, bot], [x, top + 14], [x + w * .3, top + 14], [x + w * .3, top], [x + w * .55, top], [x + w * .55, top + 14], [x + w, top + 14], [x + w, bot]];
    else poly = [[x, bot], [x, top], [x + w, top], [x + w, bot]];
    const tt = top + (roof < .2 ? 10 : roof < .34 ? 14 : 0);
    const t0 = 1.2 + x / 2600 * .3;
    // 远景屋脊：只用很淡的乘法冷灰，只让屋顶读出来
    sc.wash(poly, mix3(M.city, M.low, .42), { a: .2 * city, j: 6, layers: 1, edge: .1, seed: 360 + Math.round(x) },
      { layer: 'back', t0, dur: .6 });
    const inkA = .12 + .1 * R2();
    sc.ink([[x + 4, tt + 1.5], [x + w * (.4 + R2() * .3), tt - .5]], { w: .8 + R2() * .3, wob: .7, seed: 380 + Math.round(x), over: 2 + R2() * 3, gap: .5 },
      { layer: 'back', t0: t0 + .2, dur: .3, alpha: inkA });
    x += w + (R2() < .32 ? 6 + R2() * 24 : 0);
  }
  // 城市底部的湿雾带
  sc.wash([[-40, hz - 6], [1960, hz - 16], [1960, hz + 160], [-40, hz + 170]], mix3(PAL.cream, M.low, .35),
    { a: .4, j: 26, layers: 1, edge: 0, seed: 405 }, { layer: 'back', t0: 1.9, dur: 1.0 });
  if ((o.cityWarm ?? 0) > .02) {
    sc.wash([[80, hz - 52], [1860, hz - 72], [1900, hz + 30], [60, hz + 46]], M.cityWarm,
      { a: .16 * o.cityWarm, j: 16, layers: 1, edge: 0, seed: 399 }, { layer: 'back', t0: o.cityWarmT0 ?? 2.2, dur: 1.1 });
  }
}

// ---------------- 彩虹：透明淡彩色带（乘法叠色，低饱和） ----------------
const BOW = [[233, 180, 170], [240, 202, 152], [240, 228, 164], [196, 220, 186], [176, 206, 226], [190, 182, 220], [226, 186, 214]];
function rainbowLayer(sc, o) {
  if (!o.rainbow) return;
  const rb = o.rainbow === true ? {} : o.rainbow;
  const mode = rb.mode ?? 'arc';
  const lay = rb.layer ?? 'skyfar';
  const t0 = rb.t0 ?? 1.2, t1 = rb.t1 ?? 4.8;
  const gain = rb.gain ?? 1, aMax = rb.a ?? .12;
  if (mode === 'sheen') {
    const x0 = rb.x0 ?? 240, y0 = rb.y0 ?? 840, x1 = rb.x1 ?? 1650, y1 = rb.y1 ?? 120;
    const halfW = rb.w ?? 150;
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    const nx = -dy / L, ny = dx / L;
    const band = [
      [x0 + nx * halfW, y0 + ny * halfW], [x1 + nx * halfW * .7, y1 + ny * halfW * .7],
      [x1 - nx * halfW * .7, y1 - ny * halfW * .7], [x0 - nx * halfW, y0 - ny * halfW],
    ];
    sc.dyn((ctx, t) => {
      const u = clamp((t - t0) / (t1 - t0));
      if (u <= .001) return;
      const a = aMax * gain * u * (.85 + .15 * Math.sin(t * .5));
      const g = ctx.createLinearGradient(x0 + nx * halfW, y0 + ny * halfW, x0 - nx * halfW, y0 - ny * halfW);
      for (let i = 0; i < BOW.length; i++) {
        const c = BOW[i], q = i / (BOW.length - 1);
        g.addColorStop(clamp(q * .92 + .04), rgba(c, a * (.7 + .3 * Math.sin(q * Math.PI))));
      }
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(band[0][0], band[0][1]); for (let i = 1; i < band.length; i++) ctx.lineTo(band[i][0], band[i][1]);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }, lay);
    return;
  }
  // 弧：远处的虹，中心在地平线以下
  const cx = rb.cx ?? 1080, cy = rb.cy ?? 1420, r0 = rb.r0 ?? 720;
  const bandW = rb.bandW ?? 18;
  const a0 = rb.a0 ?? Math.PI + .1, a1 = rb.a1 ?? TAU - .1;
  const reveal = rb.reveal ?? 1;
  sc.dyn((ctx, t) => {
    const u = clamp((t - t0) / (t1 - t0));
    if (u <= 0) return;
    const span = clamp(u * reveal);
    const a = aMax * gain * clamp(u * 1.25);
    if (a <= .002) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1920, 940); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < BOW.length; i++) {
      const c = BOW[i];
      ctx.strokeStyle = rgba(c, a * (.72 + .28 * Math.sin(i / 6 * Math.PI)));
      ctx.lineWidth = bandW;
      ctx.beginPath();
      ctx.arc(cx, cy, r0 - i * bandW * .9, a0, a0 + (a1 - a0) * span);
      ctx.stroke();
    }
    // 虹内侧的极淡二次虹（只在大彩虹时）
    if (rb.secondary) {
      ctx.globalAlpha = .5;
      for (let i = 0; i < BOW.length; i++) {
        const c = BOW[BOW.length - 1 - i];
        ctx.strokeStyle = rgba(c, a * .3);
        ctx.lineWidth = bandW * .7;
        ctx.beginPath();
        ctx.arc(cx, cy, r0 - 120 - i * bandW * .9 * .8, a0, a0 + (a1 - a0) * span);
        ctx.stroke();
      }
    }
    ctx.restore();
  }, lay);
}

// ---------------- 主工厂 ----------------
export function skySet(o = {}) {
  const weather = o.weather ?? 'after';
  const M = skyMood(weather);
  const seed = o.seed ?? 501;
  const R = rng(seed);
  const sc = new Scene({
    w: 1920, h: 1080, base: { x: 960, y: 540 },
    layers: [{ id: 'skyfar', par: .4 }, { id: 'back', par: .55 }, { id: 'mid', par: .82 }, { id: 'front', par: 1 }],
  });
  const hz = o.horizon ?? 800;
  const boost = o.skyBoost ?? 1;

  // ---------- 天光：整页湿画淡彩（上冷下暖） ----------
  sc.fill([[0, 0], [1920, 0], [1920, 1080], [0, 1080]], [252, 249, 240], { layer: 'skyfar', t0: 0, dur: 0 });
  sc.wash([[-20, -20], [1940, -20], [1940, 540], [-20, 580]], M.top,
    { a: M.topA * boost, j: 34, layers: 2, edge: 0, seed: seed + 1, freq: .006 }, { layer: 'skyfar', t0: .05, dur: .5 });
  sc.wash([[-30, 260], [1950, 220], [1950, hz + 40], [-30, hz + 70]], M.mid,
    { a: M.midA * boost, j: 30, layers: 2, edge: 0, seed: seed + 2, freq: .008 }, { layer: 'skyfar', t0: .18, dur: .6 });
  sc.wash([[-40, hz - 170], [1960, hz - 210], [1960, hz + 130], [-40, hz + 170]], M.low,
    { a: M.lowA, j: 26, layers: 2, edge: 0, seed: seed + 3 }, { layer: 'skyfar', t0: .3, dur: .7 });
  // 云缝里的天光（淡粉/淡橙，从缝里透出来）
  if (o.gapGlow !== false) {
    sc.wash([[790, 30], [1250, 10], [1200, 660], [730, 700]], mix3(M.low, [255, 252, 244], .35),
      { a: .26 * (M.warm), j: 28, layers: 2, edge: 0, seed: seed + 4 }, { layer: 'skyfar', t0: .35, dur: .9 });
  }
  // 云缝里更明确的一道光柱底色：青灰 → 淡粉 → 淡橙
  if (o.gapLight) {
    const gl = o.gapLight === true ? {} : o.gapLight;
    const gx0 = gl.x0 ?? 900, gx1 = gl.x1 ?? 1290, gt = gl.top ?? -20, gb = gl.bot ?? 820;
    sc.wash([[gx0, gt], [gx1, gt], [gx1 + 70, gb], [gx0 - 70, gb]], mix3(M.mid, M.low, .5),
      { a: .34, j: 26, layers: 2, edge: 0, seed: seed + 6, freq: .01 }, { layer: 'skyfar', t0: .45, dur: 1.0 });
    sc.wash([[gx0 + 70, gt + 160], [gx1 - 40, gt + 140], [gx1 - 10, gb], [gx0 + 10, gb]], M.low,
      { a: .36, j: 24, layers: 2, edge: 0, seed: seed + 7 }, { layer: 'skyfar', t0: .6, dur: 1.1 });
    sc.wash([[gx0 + 130, gt + 340], [gx1 - 100, gt + 320], [gx1 - 60, gb], [gx0 + 50, gb]], mix3(M.low, PAL.orange, .3),
      { a: .24, j: 22, layers: 1, edge: 0, seed: seed + 8 }, { layer: 'skyfar', t0: .8, dur: 1.1 });
  }

  // ---------- 暗云顶 ----------
  const ceilKind = Array.isArray(o.ceiling) ? null : (o.ceiling ?? (weather === 'rain' ? 'rain' : 'break'));
  const ceil = Array.isArray(o.ceiling) ? o.ceiling : ceilingPlan(ceilKind);
  for (const d of ceil) addBank(sc, R, d, M, o);

  // ---------- 亮白云缘 ----------
  const planKind = Array.isArray(o.clouds) ? null : (o.clouds ?? (weather === 'rain' ? 'heavy' : 'break'));
  const mass = Array.isArray(o.clouds) ? o.clouds : cloudPlan(planKind);
  for (const m of mass) addCloud(sc, R, m, M, o);
  // 云缘暖光的呼吸（动态，极淡；让"极淡暖光"在云边一明一暗）
  if (o.rimBreath !== false && mass.length) {
    const glows = mass.filter(m => (m.warm ?? 0) > .25).map(m => ({
      x: m.x + m.rx * .1, y: m.y - m.ry * .95, r: m.rx * .9,
      ph: ((m.x * .013 + m.y * .007) % TAU + TAU) % TAU,
    }));
    if (glows.length) {
      const rba = (o.rimBreathA ?? .04) * (o.warmth ?? 1);
      sc.dyn((ctx, t) => {
        for (const g of glows) {
          const a = rba * (.6 + .4 * Math.sin(t * .5 + g.ph));
          if (a <= .002) continue;
          glow(ctx, t, g.x, g.y, g.r, M.rim, a, { breathe: .12, rate: .45, phase: g.ph });
        }
      }, 'back');
    }
  }

  // ---------- 地平线附近的低云带 ----------
  if (o.lowBand !== false) {
    sc.wash([[-40, hz - 120], [1960, hz - 160], [1960, hz + 10], [-40, hz + 40]],
      mix3(M.cloud, PAL.greyLight, .4), { a: .14, j: 26, layers: 2, edge: 0, seed: seed + 5 }, { layer: 'back', t0: 1.0, dur: .9 });
    for (let i = 0; i < 5; i++) {
      const x = 140 + i * 410 + R() * 100, y = hz - 80 + R() * 34, rx = 150 + R() * 110, ry = 30 + R() * 20;
      sc.fill(puffPoly(R, x, y, rx, ry, 8), [253, 251, 244], { layer: 'back', j: 8, seed: seed + 40 + i, t0: 1.1 + i * .06, dur: .12 });
      sc.wash(ellipse(x, y + ry * .5, rx * .8, ry * .36, 16), M.cloud, { a: .18, j: 16, layers: 1, edge: 0, seed: seed + 50 + i }, { layer: 'back', t0: 1.25 + i * .06, dur: .7 });
    }
  }

  // ---------- 远处城市屋脊 ----------
  cityBand(sc, R, M, { ...o, horizon: hz });

  // ---------- 动态：云层漂移（极慢） ----------
  const drift = o.drift ?? 1;
  const cloudFog = makeFog({ seed: seed + 61, n: 9 });
  sc.dyn((ctx, t) => {
    if (drift <= .01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      const px = 140 + i * 350 + Math.sin(t * .07 + i * 1.4) * (18 + i * 3) * drift;
      const py = 120 + (i % 3) * 220 + Math.cos(t * .05 + i) * 12 * drift;
      const r = 170 + (i % 4) * 60;
      const a = .035 + .015 * Math.sin(t * .2 + i);
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(253,251,246,${a})`);
      g.addColorStop(.6, `rgba(253,251,246,${a * .45})`);
      g.addColorStop(1, 'rgba(253,251,246,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
    }
    cloudFog(ctx, t, 0, hz - 280, 1920, 320, { gain: .4 * (o.mist ?? .8), col: [246, 243, 236] });
    ctx.restore();
  }, 'back');

  // ---------- 动态：云缝里的光核 + 光柱 ----------
  if (o.glowAt) {
    const gAt = o.glowAt === true ? {} : o.glowAt;
    const gx = gAt.x ?? 1080, gy = gAt.y ?? 150, gr = gAt.r ?? 150;
    const gt0 = gAt.t0 ?? 1.4, gt1 = gAt.t1 ?? 3.4, ga = gAt.a ?? .3;
    sc.dyn((ctx, t) => {
      const u = clamp((t - gt0) / (gt1 - gt0));
      if (u <= 0) return;
      glow(ctx, t, gx, gy, gr * (.7 + .3 * u), mix3(M.rim, [255, 253, 245], .3), ga * u, { breathe: .18, rate: .8 });
    }, 'back');
  }
  if (o.beam) {
    const b = o.beam === true ? {} : o.beam;
    const bx = b.x ?? 1080, by = b.y ?? 110, tx = b.tx ?? 720, ty = b.ty ?? 860;
    const w0 = b.w0 ?? 40, w1 = b.w1 ?? 240;
    const bt0 = b.t0 ?? 1.6, bt1 = b.t1 ?? 3.6, gain = b.gain ?? 1;
    const N = b.strips ?? 34;
    const dust = (() => { const R3 = rng(seed + 7); return [...Array(46)].map(() => [R3(), R3() - .5, .8 + R3() * 1.7, R3()]); })();
    sc.dyn((ctx, t) => {
      const u = clamp((t - bt0) / (bt1 - bt0));
      if (u <= .001) return;
      const gg = gain * u * u * (3 - 2 * u);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, -40, 1920, 980); ctx.clip();
      ctx.globalCompositeOperation = 'source-over';
      for (let i = 0; i < N; i++) {
        const u0 = (i / N) * 2 - 1, u1 = ((i + 1) / N) * 2 - 1;
        const bell = Math.exp(-Math.pow(((u0 + u1) / 2) / .46, 2));
        if (bell < .03) continue;
        const breathe = 1 + .08 * Math.sin(t * .75 + i * .35);
        const aa = .16 * gg * bell * breathe;
        const g = ctx.createLinearGradient(bx, by, tx, ty);
        g.addColorStop(0, `rgba(255,247,222,${aa})`);
        g.addColorStop(.45, `rgba(255,243,210,${aa * .78})`);
        g.addColorStop(1, 'rgba(255,236,198,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx + u0 * w0, by - 24); ctx.lineTo(bx + u1 * w0, by - 24);
        ctx.lineTo(tx + u1 * w1, ty); ctx.lineTo(tx + u0 * w1, ty);
        ctx.closePath(); ctx.fill();
      }
      // 光核（云缝最亮处）+ 光柱里的水汽点
      glow(ctx, t, bx + 8, by + 26, 88 + 26 * u, [255, 250, 232], .18 * gg, { breathe: .16, rate: .9 });
      for (const [q, v, r, ph] of dust) {
        const px = lerp(bx, tx, q) + v * (w0 + (w1 - w0) * q) * 1.15 + Math.sin(t * .5 + ph * 6) * 3;
        const py = lerp(by, ty, q) + Math.sin(t * .3 + ph * 4) * 4;
        ctx.fillStyle = `rgba(255,252,240,${.16 * gg * (.4 + .6 * Math.sin(ph * 9 + t * .4) ** 2)})`;
        ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }, 'back');
  }

  // ---------- 动态：雨丝（可渐小；深色云上画浅、浅色天上画深，两层叠） ----------
  if (o.rain) {
    const r = o.rain === true ? {} : o.rain;
    const rain = makeRain({ seed: seed + 11, n: r.n ?? 230, w: 2000, h: 1080, slant: r.slant ?? .3, minLen: r.len ?? 16, maxLen: (r.len ?? 16) * 2.3 });
    const rt0 = r.t0 ?? 0, rt1 = r.t1 ?? 6;
    sc.dyn((ctx, t) => {
      const u = seg(t, rt0, rt1);
      const a = lerp(r.a0 ?? .8, r.a1 ?? .5, u) * clamp((t - rt0) / .5);
      if (a <= .01) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(-20, -40, 1960, 930); ctx.clip();       // 底部字幕区不落雨
      rain(ctx, t, { alpha: a * .55, col: mix3([255, 252, 244], M.rainCol, .2), gain: 1, wMul: 1.35, lenMul: 1.5 });
      rain(ctx, t, { alpha: a * .85, col: M.rainCol, gain: 1, wMul: 1.2, lenMul: 1.4 });
      ctx.restore();
    }, 'mid');
  }

  // ---------- 动态：低空雾气 ----------
  if ((o.mist ?? 0) > .01) {
    const fog = makeFog({ seed: seed + 71, n: 12 });
    sc.dyn((ctx, t) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(-40, hz - 340, 2000, 560); ctx.clip();
      fog(ctx, t, -40, hz - 340, 2000, 520, { gain: (o.mist ?? 1) * .75, col: [252, 248, 238] });
      ctx.restore();
    }, 'mid');
  }

  // ---------- 彩虹 / 透明色带 ----------
  rainbowLayer(sc, o);

  // ---------- 小鸟（雨停后的生气，只是几笔） ----------
  if (o.birds) {
    const b = o.birds === true ? {} : o.birds;
    const bt = b.t0 ?? 3.6, n = b.n ?? 3, bx = b.x ?? 700, by = b.y ?? 260;
    sc.dyn((ctx, t) => {
      const u = clamp((t - bt) / 1.2);
      if (u <= .01) return;
      ctx.save(); ctx.strokeStyle = rgba(INK, .38 * u); ctx.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const px = bx + i * (52 + i * 14) + t * (10 + i * 4);
        const py = by + i * 26 - t * (5 + i * 2) + Math.sin(t * 1.3 + i) * 3;
        const fl = Math.sin(t * 6 + i * 2.1) * 4;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(px - 13, py + 3 + fl * .3);
        ctx.quadraticCurveTo(px - 5, py - 4 - fl, px, py);
        ctx.quadraticCurveTo(px + 5, py - 4 - fl, px + 13, py + 3 + fl * .3);
        ctx.stroke();
      }
      ctx.restore();
    }, 'mid');
  }

  // ---------- 底部字幕安全区：向纸色渐隐 ----------
  const fade = o.bottomFade ?? 1;
  if (fade > .01) {
    sc.dyn((ctx) => {
      const g = ctx.createLinearGradient(0, 862, 0, 1096);
      g.addColorStop(0, 'rgba(245,238,222,0)');
      g.addColorStop(.28, `rgba(245,238,222,${.32 * fade})`);
      g.addColorStop(.6, `rgba(245,238,222,${.78 * fade})`);
      g.addColorStop(1, `rgba(245,238,222,${.96 * fade})`);
      ctx.fillStyle = g; ctx.fillRect(-40, 862, 2000, 240);
    }, 'front');
  }

  sc.finish(o.bakeAt ?? 2.6);
  sc.cam = o.cam ?? slowCam({ x: 960, y: 550, z0: 1.0, z1: 1.03, dx: 14, dy: -8, dur: 6 });
  return sc;
}
