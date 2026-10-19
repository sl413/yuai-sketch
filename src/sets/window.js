// 公寓窗：全片最核心的景 —— 窗外城市 / 雨 / 玻璃水珠 / 窗帘 / 窗台旧物 / 片名
// 一页可参数化的「速写纸」：不同镜头用不同相机、天气、道具组合复用。
// 页面坐标 1920×1200；室内地面 ≈ y 1030，窗台面 y 792–872，窗洞 x 256–1664 / y 128–768。
import {
  Scene, PAL, PEN, camTrack, slowCam, ss, seg, clamp, lerp, TAU, rng, n2, fbm,
  hex, mix3, rgba, ellipse, spline, INK, PAPER, handwriteCJK, SUB, dab,
} from '../core.js';
import { makeRain, makeGlassDrops, makeFog, breathFog, glow, bokeh, airVeil } from '../fx.js';

export const WIN = { x0: 236, y0: 104, x1: 1690, y1: 792, mull: 962, trans: 352, fw: 24, sillFront: 876 };
export const HER = { floorY: 1032, S: 690 };  // 女生站在窗前的默认比例（脚在 y=1032）

function mood(kind) {
  if (kind === 'dusk') return { skyA: PAL.bluePale, skyB: PAL.pinkPale, city: mix3(PAL.stoneCool, PAL.grey, .3), city2: PAL.grey, haze: PAL.bluePale, warm: .9 };
  if (kind === 'after') return { skyA: PAL.bluePale, skyB: PAL.cream, city: PAL.stoneCool, city2: mix3(PAL.stone, PAL.grey, .4), haze: PAL.bluePale, warm: .55 };
  if (kind === 'sunset') return { skyA: PAL.pinkPale, skyB: PAL.orange, city: PAL.stoneCool, city2: PAL.grey, haze: PAL.pinkPale, warm: 1.1 };
  return { skyA: mix3(PAL.bluePale, PAL.greyLight, .4), skyB: mix3(PAL.greyLight, PAL.cream, .5), city: PAL.stoneCool, city2: mix3(PAL.grey, PAL.blueDeep, .35), haze: PAL.bluePale, warm: .8 };
}

export function windowSet(o = {}) {
  const view = o.view ?? 'city';
  const M = mood(o.weather ?? 'rain');
  const base = o.base ?? { x: 960, y: 600 };
  const flat = !!o.flatPar;
  const layers = flat ? [{ id: 'back', par: 1 }, { id: 'mid', par: 1 }, { id: 'front', par: 1 }]
    : [{ id: 'back', par: .38 }, { id: 'mid', par: .82 }, { id: 'front', par: 1 }];
  const sc = new Scene({ w: 1920, h: 1200, base, layers });
  const R = rng(o.seed ?? 101);
  const W = WIN;
  const iw = { x0: W.x0 + W.fw, y0: W.y0 + W.fw, x1: W.x1 - W.fw, y1: W.y1 - W.fw };

  // ================= BACK：窗外 =================
  const skyArea = [[W.x0 - 80, W.y0 - 90], [W.x1 + 80, W.y0 - 90], [W.x1 + 80, W.y1 + 30], [W.x0 - 80, W.y1 + 30]];
  sc.fill(skyArea, [253, 251, 245], { layer: 'back', j: 2, seed: 9, t0: 0, dur: 0 });
  if (view === 'city') backCity2(sc, M, R, o);
  else backSky2(sc, M, R, o);

  // 窗外空气：一层很淡的雨雾把城市推远、柔化\n  sc.wash([[W.x0 - 120, W.y0 - 120], [W.x1 + 120, W.y0 - 120], [W.x1 + 120, W.y1 + 40], [W.x0 - 120, W.y1 + 40]], mix3(PAL.cream, PAL.bluePale, .45), { a: .26, j: 44, layers: 2, edge: 0, seed: 1801 }, { layer: 'back', t0: 1.9, dur: 1.4 });\n  sc.wash([[W.x0 - 120, 470], [W.x1 + 120, 450], [W.x1 + 120, W.y1 + 40], [W.x0 - 120, W.y1 + 40]], mix3(PAL.bluePale, PAL.cream, .5), { a: .2, j: 40, layers: 1, edge: 0, seed: 1802 }, { layer: 'back', t0: 2.1, dur: 1.2 });\n  // 雨（窗外）：从左上斜向右下
  const rain = makeRain({ seed: 601, n: o.rainN ?? 300, w: W.x1 - W.x0 + 160, h: W.y1 - W.y0 + 120, slant: .34, minSpeed: 620, maxSpeed: 1180 });
  const rain2 = makeRain({ seed: 602, n: Math.round((o.rainN ?? 300) * .45), w: W.x1 - W.x0 + 160, h: W.y1 - W.y0 + 120, slant: .30, minSpeed: 380, maxSpeed: 700, minLen: 8, maxLen: 18 });
  const bokehPts = (o.bokeh ?? defaultBokeh(R));
  sc.dyn((ctx, t) => {
    const g = clamp((t - .25) / 1.1) * (o.rainGain ?? 1);
    if (g <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(W.x0 - 4, W.y0 - 4, W.x1 - W.x0 + 8, W.y1 - W.y0 + 8); ctx.clip();
    ctx.translate(W.x0 - 80, W.y0 - 60);
    const w = W.x1 - W.x0 + 160, h = W.y1 - W.y0 + 120;
    rain(ctx, t, { w, h, alpha: 1.0 * g, col: mix3(PAL.greyDeep, PAL.blueDeep, .4), wMul: 1.25 });
    rain2(ctx, t, { w, h, alpha: .6 * g, col: mix3(PAL.blueDeep, PAL.grey, .35), wMul: .8, lenMul: .85, gain: .9 });
    // 雨幕里晕开的暖光斑（路灯 / 对面亮着的窗）
    bokeh(ctx, t, bokehPts.map(p => ({ ...p, x: p.x - W.x0 + 80, y: p.y - W.y0 + 60 })), { gain: clamp((t - .8) / 1.6) * M.warm * (view === 'sky' ? (o.bokehGain ?? .4) : (o.bokehGain ?? 1)) });
    // 一层雨雾的空气
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, `rgba(240,244,248,${.10 * g})`); vg.addColorStop(.5, `rgba(238,242,246,${.16 * g})`); vg.addColorStop(1, `rgba(246,242,232,${.12 * g})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }, 'back');

  // ================= MID：墙 / 窗框 / 窗帘 / 玻璃 =================
  // 墙：四块平涂纸色（把窗外城市只留在窗洞里）
  const wallPolys = [
    [[-20, -20], [W.x0, -20], [W.x0, 1220], [-20, 1220]],
    [[W.x1, -20], [1940, -20], [1940, 1220], [W.x1, 1220]],
    [[W.x0, -20], [W.x1, -20], [W.x1, W.y0], [W.x0, W.y0]],
    [[W.x0, W.y1], [W.x1, W.y1], [W.x1, 1220], [W.x0, 1220]],
  ];
  for (const w of wallPolys) sc.fill(w, PAPER, { layer: 'mid', t0: 0, dur: 0 });
  // 窗框的木框带（比墙暖一点、厚一点）
  const fw2 = W.fw;
  const framePolys = [
    [[W.x0, W.y0], [W.x0 + fw2, W.y0], [W.x0 + fw2, W.y1], [W.x0, W.y1]],
    [[W.x1 - fw2, W.y0], [W.x1, W.y0], [W.x1, W.y1], [W.x1 - fw2, W.y1]],
    [[W.x0 + fw2, W.y0], [W.x1 - fw2, W.y0], [W.x1 - fw2, W.y0 + fw2], [W.x0 + fw2, W.y0 + fw2]],
    [[W.x0 + fw2, W.y1 - fw2], [W.x1 - fw2, W.y1 - fw2], [W.x1 - fw2, W.y1], [W.x0 + fw2, W.y1]],
  ];
  for (const w of framePolys) {
    sc.fill(w, mix3(PAL.cream, PAL.stoneCool, .22), { layer: 'mid', t0: 0, dur: 0 });
    sc.wash(w, mix3(PAL.cream, PAL.stone, .42), { a: .3, j: 6, layers: 2, edge: 0, seed: 700, speckle: 12 }, { layer: 'mid', t0: .2, dur: .9 });
  }
  // 墙的冷暖：左上暖、右下冷；几道水渍
  sc.wash([[-20, -20], [W.x0, -20], [W.x0 - 60, 1220], [-20, 1220]], mix3(PAL.cream, PAL.warm, .35), { a: .3, j: 28, layers: 2, edge: 0, seed: 701, speckle: 24 }, { layer: 'mid', t0: .1, dur: 1 });
  sc.wash([[W.x1, -20], [1940, -20], [1940, 1220], [W.x1 + 30, 1220]], mix3(PAL.greyLight, PAL.bluePale, .5), { a: .34, j: 24, layers: 2, edge: 0, seed: 702, speckle: 20 }, { layer: 'mid', t0: .25, dur: 1.1 });
  sc.wash([[W.x0, 940], [W.x1, 930], [W.x1, 1220], [W.x0, 1220]], mix3(PAL.cream, PAL.greyLight, .4), { a: .22, j: 20, layers: 1, edge: 0, seed: 703 }, { layer: 'mid', t0: .4, dur: 1 });
  // 右侧窗帘被（暖）灯映到的一点暖
  sc.wash([[W.x1 - 60, 0], [1940, 0], [1940, 620], [W.x1 + 40, 640]], mix3(PAL.lamp, PAL.cream, .55), { a: .14, j: 26, layers: 1, edge: 0, seed: 704 }, { layer: 'mid', t0: .6, dur: 1 });
  for (let i = 0; i < 3; i++) {
    const x = W.x0 - 90 - i * 26 + R() * 12;
    sc.wash([[x, 60 + R() * 80], [x + 40 + R() * 30, 80], [x + 20, 500 + R() * 300], [x - 20, 460]], mix3(PAL.greyLight, PAL.cream, .4), { a: .12 + R() * .05, j: 16, layers: 1, edge: 0, seed: 710 + i }, { layer: 'mid', t0: .5 + i * .1, dur: .9 });
  }
  // 窗框：外框（粗、带墨晕）+ 内线
  frame2_(sc, W, iw, o, R);
  // 玻璃四格 + 反光 + 凝结的水汽
  const panes = [
    [[iw.x0, iw.y0], [W.mull - 9, iw.y0], [W.mull - 9, W.trans - 8], [iw.x0, W.trans - 8]],
    [[W.mull + 9, iw.y0], [iw.x1, iw.y0], [iw.x1, W.trans - 8], [W.mull + 9, W.trans - 8]],
    [[iw.x0, W.trans + 8], [W.mull - 9, W.trans + 8], [W.mull - 9, iw.y1], [iw.x0, iw.y1]],
    [[W.mull + 9, W.trans + 8], [iw.x1, W.trans + 8], [iw.x1, iw.y1], [W.mull + 9, iw.y1]],
  ];
  panes.forEach((p, i) => {
    sc.wash(p, mix3(PAL.greyLight, PAL.bluePale, .45), { a: .16, j: 16, layers: 1, edge: 0, seed: 740 + i, speckle: 12 }, { layer: 'mid', t0: 1.15 + i * .06, dur: .9 });
    // 玻璃底部的凝结：更"湿"的一条
    sc.wash([[p[0][0], p[2][1] - 70], [p[1][0], p[2][1] - 64], [p[2][0], p[2][1] - 6], [p[3][0], p[2][1] - 10]], mix3(PAL.bluePale, [255, 255, 255], .3), { a: .16, j: 12, layers: 1, edge: 0, seed: 745 + i }, { layer: 'mid', t0: 1.5 + i * .06, dur: .9 });
  });
  // 反光：两道斜长的留白 + 一道淡蓝
  sc.fill([[iw.x0 + 24, iw.y1], [iw.x0 + 106, iw.y1], [iw.x0 + 470, iw.y0], [iw.x0 + 388, iw.y0]], [255, 254, 250], { layer: 'mid', j: 12, seed: 750, t0: 1.35, dur: .1, alpha: .10 });
  sc.fill([[iw.x0 + 196, iw.y1], [iw.x0 + 226, iw.y1], [iw.x0 + 566, iw.y0], [iw.x0 + 536, iw.y0]], [255, 255, 255], { layer: 'mid', j: 10, seed: 751, t0: 1.45, dur: .1, alpha: .10 });
  sc.wash([[iw.x1 - 90, iw.y0 + 10], [iw.x1 - 30, iw.y0 + 10], [iw.x1 - 260, iw.y1 - 20], [iw.x1 - 330, iw.y1 - 20]], mix3(PAL.bluePale, [255, 255, 255], .5), { a: .12, j: 14, layers: 1, edge: 0, seed: 752 }, { layer: 'mid', t0: 1.55, dur: .9 });
  // 窗帘：左侧薄纱 + 右侧厚帘（构图不对称）
  curtain2_(sc, R, W, o);
  // 窗台上表面（木/石），前脸留给字幕安全区
  const sillTop = [[W.x0 - 8, W.y1 - 4], [W.x1 + 8, W.y1 - 8], [W.x1 + 26, W.sillFront], [W.x0 - 26, W.sillFront + 6]];
  sc.fill(sillTop, [252, 248, 238], { layer: 'mid', j: 2, seed: 760, t0: 1.3, dur: .1 });
  sc.wash(sillTop, mix3(PAL.cream, PAL.stone, .55), { a: .4, j: 8, layers: 2, edge: .22, seed: 761, speckle: 18 }, { layer: 'mid', t0: 1.4, dur: .8 });
  sc.ink2([[W.x0 - 30, W.y1 - 2], [W.x1 + 30, W.y1 - 10]], { w: 2.8, wob: .8, seed: 762, over: 9 }, { layer: 'mid', t0: 1.45, dur: .55 });
  // 窗框投在窗台上的影\n  sc.wash([[W.x0 - 6, W.y1 + 2], [W.x1 + 6, W.y1 - 6], [W.x1 + 6, W.y1 + 26], [W.x0 - 6, W.y1 + 34]], mix3(PAL.grey, PAL.blueDeep, .25), { a: .2, j: 10, layers: 1, edge: 0, seed: 766 }, { layer: 'mid', t0: 1.5, dur: .7 });\n  // 前脸的极淡木纹（安全区：非常淡）
  const front = [[W.x0 - 26, W.sillFront + 4], [W.x1 + 26, W.sillFront - 2], [W.x1 + 26, 1220], [W.x0 - 26, 1220]];
  sc.wash(front, mix3(PAL.cream, PAL.greyLight, .22), { a: .18, j: 18, layers: 1, edge: 0, seed: 770 }, { layer: 'mid', t0: 1.6, dur: .9 });
  for (let i = 0; i < 3; i++) sc.ink([[140 + i * 60, W.sillFront + 40 + i * 46], [W.x1 - 140 - i * 40, W.sillFront + 34 + i * 44]], { w: .8, wob: .9, seed: 771 + i, over: 2, gap: .8 }, { layer: 'mid', t0: 1.7 + i * .06, dur: .7, alpha: .18 });

  // ---- 玻璃上的动态：水珠 + 雾气 ----
  const glassDrops = makeGlassDrops({ seed: 801, n: o.dropN ?? 52, x0: iw.x0 + 8, x1: iw.x1 - 8, y0: iw.y0 + 30, y1: iw.y1 - 6, bornSpan: 2.2, slideMin: .8, slideMax: 3.6, minR: 2.6, maxR: 9, slMin: 16, slMax: 64 });
  const glassDrops2 = makeGlassDrops({ seed: 802, n: Math.round((o.dropN ?? 52) * .55), x0: iw.x0 + 30, x1: iw.x1 - 30, y0: iw.y0 + 50, y1: iw.y1 - 12, bornSpan: 3.4, slideMin: 1.8, slideMax: 5, minR: 1.6, maxR: 5.5, slMin: 8, slMax: 28 });
  sc.dyn((ctx, t) => {
    ctx.save();
    for (const p of panes) { ctx.beginPath(); ctx.rect(p[0][0], p[0][1], p[2][0] - p[0][0], p[2][1] - p[0][1]); ctx.clip(); }
    glassDrops(ctx, t, { gain: 1, alpha: clamp((t - .6) / 1.3) });
    glassDrops2(ctx, t, { gain: .8, alpha: clamp((t - 1.1) / 1.5) });
    ctx.restore();
  }, 'mid');
  const fog = makeFog({ seed: 851, n: 10 });
  sc.dyn((ctx, t) => {
    const a = clamp((t - .9) / 1.8) * (o.fog ?? 1);
    if (a <= .01) return;
    ctx.save(); ctx.beginPath(); ctx.rect(iw.x0, iw.y0, iw.x1 - iw.x0, iw.y1 - iw.y0); ctx.clip();
    fog(ctx, t, iw.x0, iw.y0, iw.x1 - iw.x0, iw.y1 - iw.y0, { gain: a * .5, col: [255, 253, 246] });
    ctx.restore();
  }, 'mid');

// ================= 室内静物与光（窗边那一小块生活） =================
function stillLife_(sc, R, W, o) {
  const t0 = o.stillT0 ?? 1.75;
  // ---- 左墙：小画框（海与远山）+ 钉子与细绳 ----
  const fx = 44, fy = 400, fw = 152, fh = 176;
  sc.fill([[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh]], [250, 243, 228], { layer: 'mid', j: 3, seed: 901, t0: t0 + .05 });
  sc.wash([[fx + 8, fy + 8], [fx + fw - 8, fy + 8], [fx + fw - 8, fy + fh - 8], [fx + 8, fy + fh - 8]], mix3(PAL.bluePale, PAL.greyLight, .45), { a: .3, j: 9, layers: 2, edge: .12, seed: 902, speckle: 12 }, { layer: 'mid', t0: t0 + .15, dur: .9 });
  sc.wash([[fx + 8, fy + 96], [fx + 54, fy + 52], [fx + 92, fy + 88], [fx + 128, fy + 62], [fx + fw - 8, fy + 108], [fx + fw - 8, fy + fh - 8], [fx + 8, fy + fh - 8]], mix3(PAL.greyDeep, PAL.bluePale, .35), { a: .3, j: 10, layers: 2, edge: .1, seed: 903 }, { layer: 'mid', t0: t0 + .3, dur: 1 });
  sc.ink([[fx + 10, fy + 96], [fx + 54, fy + 52], [fx + 92, fy + 88], [fx + 128, fy + 62], [fx + fw - 10, fy + 108]], { w: 1.3, wob: .6, seed: 904, over: 3 }, { layer: 'mid', t0: t0 + .5, dur: .7, alpha: .5 });
  sc.fill([[fx + 112, fy + 40], [fx + 130, fy + 50], [fx + 122, fy + 68], [fx + 104, fy + 58]], [252, 247, 233], { layer: 'mid', j: 2, seed: 905, t0: t0 + .55, alpha: .85 });
  sc.ink2([[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh], [fx, fy]], { w: 2.0, wob: .5, seed: 906, over: 5 }, { layer: 'mid', t0: t0 + .35, dur: .7 });
  sc.ink([[fx + fw / 2, fy - 4], [fx + fw / 2, fy - 22], [fx + fw / 2 - 4, fy - 34]], { w: 1.2, wob: .5, seed: 907, over: 2 }, { layer: 'mid', t0: t0 + .2, dur: .5, alpha: .55 });
  sc.ink([[fx + fw / 2 - 26, fy - 34], [fx + fw / 2, fy - 30], [fx + fw / 2 + 26, fy - 34]], { w: 1.0, wob: .5, seed: 908, over: 2 }, { layer: 'mid', t0: t0 + .25, dur: .5, alpha: .45 });

  // ---- 右墙：挂着的一小束干花 ----
  const hx = 1806, hy = 316;
  sc.ink([[hx, hy - 26], [hx - 2, hy], [hx + 1, hy + 10]], { w: 1.6, wob: .5, seed: 921, over: 3 }, { layer: 'mid', t0: t0 + .5, dur: .6 });
  const stems = 5;
  for (let i = 0; i < stems; i++) {
    const a = (-.5 + i / (stems - 1)) * 1.25 + (R() - .5) * .12;
    const L = 62 + R() * 40;
    const ex = hx + Math.sin(a) * L, ey = hy + 18 + Math.cos(a) * L * .9;
    sc.ink([[hx, hy + 12], [hx + Math.sin(a) * L * .5, hy + 26 + Math.cos(a) * L * .5], [ex, ey]], { w: 1.1, wob: .6, seed: 930 + i, over: 2 }, { layer: 'mid', t0: t0 + .55 + i * .05, dur: .5, alpha: .6 });
    sc.wash([[ex - 7, ey - 10], [ex + 8, ey - 12], [ex + 9, ey + 4], [ex - 4, ey + 7]], mix3(PAL.lamp, PAL.brick, .25), { a: .42, j: 5, layers: 1, edge: .2, seed: 940 + i }, { layer: 'mid', t0: t0 + .65 + i * .05, dur: .6 });
  }
  sc.wash([[hx - 22, hy + 14], [hx + 22, hy + 12], [hx + 18, hy + 58], [hx - 18, hy + 60]], mix3(PAL.cream, PAL.stone, .4), { a: .28, j: 7, layers: 1, edge: .2, seed: 950 }, { layer: 'mid', t0: t0 + .5, dur: .7 });
  sc.ink([[hx - 12, hy + 20], [hx + 10, hy + 18]], { w: 1.8, wob: .4, seed: 951, over: 3 }, { layer: 'mid', t0: t0 + .6, dur: .4, alpha: .7 });

  // ---- 窗台左：玻璃瓶插干枝 ----
  const bx = 336, by = W.y1 + 6;
  sc.fill([[bx - 15, by + 6], [bx + 15, by + 5], [bx + 13, by - 58], [bx - 13, by - 58]], [252, 248, 238], { layer: 'mid', j: 2, seed: 961, t0: t0 + .5 });
  sc.wash([[bx - 14, by], [bx + 14, by], [bx + 12, by - 56], [bx - 12, by - 56]], mix3(PAL.bluePale, PAL.cream, .5), { a: .26, j: 5, layers: 1, edge: .2, seed: 962 }, { layer: 'mid', t0: t0 + .6, dur: .7 });
  sc.ink2([[bx - 14, by - 56], [bx - 15, by - 4], [bx, by + 8], [bx + 15, by - 4], [bx + 14, by - 56]], { w: 1.5, wob: .5, seed: 963, over: 3 }, { layer: 'mid', t0: t0 + .65, dur: .63, alpha: .7 });
  for (let i = 0; i < 4; i++) {
    const a = -.5 + i * .32, L = 54 + R() * 34;
    sc.ink([[bx, by - 50], [bx + Math.sin(a) * L * .5, by - 50 - Math.cos(a) * L * .55], [bx + Math.sin(a) * L, by - 50 - Math.cos(a) * L]], { w: .9, wob: .6, seed: 970 + i, over: 2 }, { layer: 'mid', t0: t0 + .8 + i * .05, dur: .5, alpha: .5 });
  }

  // ---- 窗台右：折布 + 铅笔 + 一叠相纸 ----
  const px = 1452, py = W.y1 + 8;
  sc.wash([[px, py], [px + 120, py - 4], [px + 128, py + 30], [px + 6, py + 36]], mix3(PAL.coat, PAL.cream, .5), { a: .34, j: 7, layers: 2, edge: .22, seed: 981 }, { layer: 'mid', t0: t0 + .55, dur: .8 });
  sc.ink([[px + 4, py + 2], [px + 118, py - 2], [px + 124, py + 26]], { w: 1.2, wob: .7, seed: 982, over: 3 }, { layer: 'mid', t0: t0 + .6, dur: .55, alpha: .55 });
  sc.ink([[px + 30, py - 10], [px + 96, py - 12]], { w: 1.6, wob: .4, seed: 983, over: 3 }, { layer: 'mid', t0: t0 + .7, dur: .4, alpha: .55 });
  sc.fill([[px + 116, py - 14], [px + 170, py - 20], [px + 174, py + 8], [px + 120, py + 14]], [252, 249, 240], { layer: 'mid', j: 2, seed: 984, t0: t0 + .62 });
  sc.ink([[px + 118, py - 13], [px + 170, py - 19], [px + 173, py + 7], [px + 121, py + 13]], { w: 1.0, wob: .5, seed: 985, over: 2 }, { layer: 'mid', t0: t0 + .66, dur: .5, alpha: .45 });

  // ---- 暖灯：右侧墙/帘上的光池 ----
  sc.wash([[W.x1 - 60, 120], [1940, 80], [1940, 760], [W.x1 - 10, 700]], mix3(PAL.lamp, PAL.cream, .5), { a: .16, j: 26, layers: 2, edge: 0, seed: 991 }, { layer: 'mid', t0: t0 + .1, dur: 1.2 });
  sc.wash([[W.x1 - 260, W.y1 - 120], [W.x1 - 40, W.y1 - 150], [W.x1 - 30, W.y1 + 40], [W.x1 - 280, W.y1 + 30]], mix3(PAL.lamp, PAL.cream, .4), { a: .1, j: 18, layers: 1, edge: 0, seed: 992 }, { layer: 'mid', t0: t0 + .3, dur: 1 });
  // 窗光在窗台上的一道亮（纸白 + 一点冷）
  sc.fill([[W.mull + 30, W.y1 + 8], [W.mull + 250, W.y1 + 4], [W.mull + 300, W.y1 + 54], [W.mull + 60, W.y1 + 58]], [255, 253, 246], { layer: 'mid', j: 5, seed: 993, t0: t0 + .45, alpha: .3 });
}

  // ================= FRONT：窗台旧物 =================
  const props = o.props ?? {};
  if (props.letter !== false) letter_(sc, R, o.letterState ?? {});
  if (props.suitcase !== false) suitcase_(sc, R, o.suitcaseState ?? {});
  if (props.photo) photo_(sc, R, o.photoState ?? {});
  if (props.cup) cup_(sc, R, o.cupState ?? {});
  if (o.still !== false) stillLife_(sc, R, W, o);
  // 前景的柔光纸边（增加层次，不抢主体）
  sc.dyn((ctx, t) => {
    const a = o.foreground ?? 1; if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(0, 990, 0, 1200);
    g.addColorStop(0, 'rgba(150,148,140,0)'); g.addColorStop(1, 'rgba(150,152,146,.12)');
    ctx.fillStyle = g; ctx.fillRect(0, 990, 1920, 210); ctx.restore();
  }, 'front');

  // ================= 片名（手写，前 5 秒） =================
  if (o.title) {
    sc.dyn((ctx, t) => {
      const a = clamp((t - 1.4) / .7) * clamp((o.titleOut ?? 4.9) - t) * (o.titleGain ?? 1);
      if (a <= .01) return;
      ctx.save();
      const g = ctx.createRadialGradient(930, 236, 30, 930, 236, 370);
      g.addColorStop(0, `rgba(252,249,242,${.5 * a})`); g.addColorStop(1, 'rgba(252,249,242,0)');
      ctx.fillStyle = g; ctx.fillRect(520, 90, 820, 400);
      ctx.globalAlpha = a;
      handwriteCJK(ctx, '雨爱', 960, 262, 124, clamp((t - 1.45) / 1.15), { col: [48, 41, 36], alpha: .96, align: 'center', font: SUB.font });
      ctx.restore();
    }, 'front');
  }

  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? slowCam({ x: base.x, y: base.y, z0: 1.0, z1: 1.05, dx: 12, dur: 5 });
  return sc;
}

// ---------------- 窗外：城市 ----------------
function defaultBokeh(R) {
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push({ x: WIN.x0 + 40 + R() * (WIN.x1 - WIN.x0 - 80), y: 646 + R() * 120, r: 10 + R() * 20, a: .16 + R() * .2, col: R() < .72 ? PAL.lamp : PAL.pinkPale, rate: .7 + R() * 1.1, ph: R() * 6 });
  return pts;
}
function backCity(sc, M, R, o) {
  const W = WIN;
  const SK = [[W.x0 - 80, W.y0 - 90], [W.x1 + 80, W.y0 - 90], [W.x1 + 80, 760], [W.x0 - 80, 760]];
  // 天空：上冷下暖，越靠上越淡；颜色很克制
  sc.wash(SK, M.skyA, { a: .38, j: 34, layers: 2, edge: 0, seed: 11, freq: .006, speckle: 24 }, { layer: 'back', t0: .05, dur: 1.0 });
  sc.wash([[W.x0 - 80, 330], [W.x1 + 80, 300], [W.x1 + 80, 780], [W.x0 - 80, 780]], mix3(M.skyB, PAL.cream, .4), { a: .26, j: 40, layers: 2, edge: 0, seed: 12 }, { layer: 'back', t0: .25, dur: 1.1 });
  // 云：不是白色块，是纸的留白 + 淡淡的冷紫云底
  for (let i = 0; i < 6; i++) {
    const cx = W.x0 + 90 + R() * (W.x1 - W.x0 - 180), cy = 150 + R() * 190, rx = 150 + R() * 210, ry = rx * (.2 + R() * .16);
    const puff = [];
    for (let k = 0; k <= 10; k++) { const a = Math.PI + k / 10 * Math.PI; puff.push([cx + Math.cos(a) * rx * (0.8 + .3 * R()), cy + Math.sin(a) * ry * (1.1 + .6 * R())]); }
    puff.push([cx + rx * .9, cy + ry * .4], [cx - rx * .9, cy + ry * .4]);
    sc.fill(spline(puff, 4, true), [254, 252, 247], { layer: 'back', j: 7, seed: 200 + i, t0: .35 + i * .06, dur: .08, alpha: .85 });
    sc.wash(ellipse(cx + rx * .05, cy + ry * .62, rx * .8, ry * .34, 18), mix3(PAL.greyLight, PAL.violet, .3), { a: .2, j: 12, layers: 1, edge: 0, seed: 210 + i }, { layer: 'back', t0: .55 + i * .06, dur: .6 });
  }
  // 远楼（浅、雾、没有细节）
  for (let i = 0; i < 8; i++) {
    const x = W.x0 + 30 + i * 176 + R() * 55, hw = 52 + R() * 52, top = 430 + R() * 140;
    const poly = [[x - hw, 792], [x - hw, top], [x + hw, top], [x + hw, 792]];
    sc.fill(poly, [253, 251, 245], { layer: 'back', j: 3, seed: 300 + i, t0: .7 + i * .05, dur: .08 });
    sc.wash(poly, mix3(M.city, M.haze, .6), { a: .26, j: 6, layers: 1, edge: 0, seed: 310 + i }, { layer: 'back', t0: .8 + i * .05, dur: .6 });
  }
  // 近楼：两三栋，有窗格、空调、屋顶水塔/天线（速写的暗示，不画满）
  const blds = [
    { x: 420, w: 300, top: 372, col: mix3(PAL.stoneCool, PAL.grey, .45), tank: 0, seed: 41 },
    { x: 830, w: 240, top: 468, col: mix3(PAL.stone, PAL.grey, .5), tank: 1, seed: 42 },
    { x: 1310, w: 330, top: 338, col: mix3(PAL.stoneCool, PAL.blueDeep, .22), tank: 0, seed: 43 },
    { x: 1640, w: 260, top: 430, col: mix3(PAL.grey, PAL.blueDeep, .3), tank: 0, seed: 44, side: 1 },
  ];
  for (const b of blds) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, top = b.top, bot = 792;
    const poly = [[x0, bot], [x0, top], [x1, top], [x1, bot]];
    sc.fill(poly, [252, 250, 243], { layer: 'back', j: 3, seed: b.seed, t0: .95 + b.x / 6000, dur: .08 });
    sc.wash(poly, b.col, { a: .5, j: 7, layers: 2, edge: .35, seed: b.seed + 1, speckle: 14 }, { layer: 'back', t0: 1.05 + b.x / 6000, dur: .7 });
    // 背光面
    sc.wash([[x0 + b.w * (b.side ? .55 : .62), bot], [x0 + b.w * (b.side ? .55 : .62), top], [x1, top], [x1, bot]], mix3(b.col, PAL.blueDeep, .4), { a: .22, j: 5, layers: 1, edge: 0, seed: b.seed + 2 }, { layer: 'back', t0: 1.2 + b.x / 6000, dur: .6 });
    // 窗格：一片片短笔触，稀疏；少数亮着暖光
    const cols = Math.max(3, Math.round(b.w / 52)), rows = Math.max(3, Math.round((bot - top) / 58));
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x0 + 16 + c * (b.w - 32) / cols, wy = top + 30 + r * (bot - top - 40) / rows;
      if (fbm(wx * .02, wy * .03, b.seed, 2) < .42) continue;
      const lit = R() < .17;
      const ww = (b.w - 32) / cols * .52, wh = 26 + R() * 8;
      if (lit) sc.wash([[wx, wy], [wx + ww, wy], [wx + ww, wy + wh], [wx, wy + wh]], mix3(PAL.lamp, PAL.cream, .3), { a: .62, j: 1.5, layers: 1, edge: 0, seed: b.seed * 40 + r * 9 + c }, { layer: 'back', t0: 1.3 + r * .02 + c * .01, dur: .25 });
      sc.inkPoly([[wx, wy], [wx + ww, wy], [wx + ww, wy + wh], [wx, wy + wh]], { w: 1.1, wob: .5, seed: b.seed * 40 + r * 9 + c, gap: .55 }, { layer: 'back', t0: 1.25 + r * .02 + c * .01, dur: .16, stagger: .01, alpha: .75 });
    }
    // 轮廓墨线（近楼粗一点）
    sc.ink2([[x0, bot + 4], [x0 - 2, top - 2]], { w: 1.9, wob: .8, seed: b.seed + 10, over: 6 }, { layer: 'back', t0: 1.15, dur: .5 });
    sc.ink2([[x1 + 2, top - 3], [x1, bot + 4]], { w: 2.1, wob: .8, seed: b.seed + 11, over: 6 }, { layer: 'back', t0: 1.2, dur: .5 });
    sc.ink2([[x0 - 6, top], [x1 + 6, top - 2]], { w: 2.0, wob: .7, seed: b.seed + 12, over: 5 }, { layer: 'back', t0: 1.25, dur: .45 });
    // 屋顶：水塔 / 天线 / 女儿墙
    if (b.tank) {
      sc.ink([[x0 + b.w * .62, top], [x0 + b.w * .6, top - 42], [x0 + b.w * .82, top - 44], [x0 + b.w * .84, top - 2]], { w: 1.6, wob: .6, seed: b.seed + 20, over: 3 }, { layer: 'back', t0: 1.35, dur: .4 });
      sc.ink([[x0 + b.w * .55, top - 42], [x0 + b.w * .71, top - 62], [x0 + b.w * .87, top - 44]], { w: 1.4, wob: .5, seed: b.seed + 21, over: 2 }, { layer: 'back', t0: 1.4, dur: .35 });
    } else if (b.x > 1200) {
      sc.ink([[x0 + b.w * .3, top], [x0 + b.w * .3, top - 52], [x0 + b.w * .38, top - 34]], { w: 1.3, wob: .4, seed: b.seed + 22, over: 2 }, { layer: 'back', t0: 1.4, dur: .4 });
      sc.ink([[x0 + b.w * .3, top - 52], [x0 + b.w * .36, top - 52]], { w: 1.1, wob: .3, seed: b.seed + 23, over: 1 }, { layer: 'back', t0: 1.45, dur: .25 });
    }
  }
  // 街道：湿的路面反光 + 路灯 + 远处车灯
  sc.wash([[W.x0 - 80, 700], [W.x1 + 80, 688], [W.x1 + 80, 790], [W.x0 - 80, 798]], mix3(PAL.grey, PAL.blueDeep, .25), { a: .4, j: 14, layers: 2, edge: 0, seed: 500, speckle: 20 }, { layer: 'back', t0: 1.2, dur: .8 });
  sc.ink([[W.x0 - 70, 706], [W.x1 + 70, 694]], { w: 1.4, wob: .8, seed: 501, over: 10, gap: .6 }, { layer: 'back', t0: 1.6, dur: .6, alpha: .7 });
  // 路灯（剪影 + 暖光）
  const lampX = 1180, lampTop = 470;
  sc.ink2([[lampX, 792], [lampX - 4, lampTop + 40], [lampX + 2, lampTop + 8]], { w: 2.2, wob: .5, seed: 520, over: 4 }, { layer: 'back', t0: 1.5, dur: .5 });
  sc.ink2([[lampX - 22, lampTop + 6], [lampX + 24, lampTop + 4], [lampX + 16, lampTop + 30], [lampX - 14, lampTop + 30]], { w: 1.8, wob: .4, seed: 521, over: 3 }, { layer: 'back', t0: 1.6, dur: .45 });
  sc.wash([[lampX - 16, lampTop + 8], [lampX + 18, lampTop + 7], [lampX + 13, lampTop + 27], [lampX - 11, lampTop + 27]], mix3(PAL.lamp, [255, 246, 220], .4), { a: .7, j: 1.5, layers: 1, edge: 0, seed: 522 }, { layer: 'back', t0: 1.65, dur: .4 });
  // 天空的电线（速写里的城市感）
  for (let i = 0; i < 3; i++) {
    const y0 = 236 + i * 34, sag = 26 + i * 10;
    const pts = []; for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push([W.x0 - 60 + u * (W.x1 - W.x0 + 120), y0 + Math.sin(u * Math.PI) * sag]); }
    sc.ink(pts, { w: 1.15, wob: .35, seed: 530 + i, over: 0, gap: .2 }, { layer: 'back', t0: 1.3 + i * .1, dur: 1.0, alpha: .55 });
  }
  // 鸟：两三笔
  for (let i = 0; i < 3; i++) {
    const bx = W.x0 + 380 + R() * 500, by = 210 + R() * 90, s = 7 + R() * 6;
    sc.ink([[bx - s, by], [bx, by - s * .5], [bx + s * .9, by - s * .1]], { w: 1.2, wob: .3, seed: 540 + i, over: 1 }, { layer: 'back', t0: 1.8 + i * .2, dur: .3, alpha: .6 });
  }
}
// ---------------- 窗外：天空（雨后/云层/彩虹） ----------------
function backSky(sc, M, R, o) {
  const W = WIN;
  const area = [[W.x0 - 80, W.y0 - 90], [W.x1 + 80, W.y0 - 90], [W.x1 + 80, W.y1 + 10], [W.x0 - 80, W.y1 + 10]];
  sc.wash(area, mix3(PAL.bluePale, PAL.greyLight, .4), { a: .3, j: 34, layers: 2, edge: 0, seed: 1101, freq: .005, speckle: 30 }, { layer: 'back', t0: .2, dur: 1.1 });
  sc.wash([[W.x0 - 80, 320], [W.x1 + 80, 300], [W.x1 + 80, W.y1 + 10], [W.x0 - 80, W.y1 + 10]], mix3(PAL.cream, PAL.warm, .4), { a: .26, j: 30, layers: 2, edge: 0, seed: 1102 }, { layer: 'back', t0: .5, dur: 1.2 });
  // 云层：三层，柔和的纸留白 + 冷紫云底
  const cl = [
    { x: 560, y: 250, rx: 340, ry: 108, a: .28 }, { x: 1180, y: 208, rx: 420, ry: 130, a: .26 },
    { x: 1560, y: 360, rx: 300, ry: 96, a: .24 }, { x: 380, y: 430, rx: 280, ry: 86, a: .2 },
    { x: 900, y: 560, rx: 460, ry: 96, a: .2 }, { x: 1420, y: 620, rx: 340, ry: 80, a: .17 },
  ];
  cl.forEach((c, i) => {
    const puff = [];
    for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; puff.push([c.x + Math.cos(a) * c.rx * (.8 + .32 * R()), c.y + Math.sin(a) * c.ry * (1.1 + .55 * R())]); }
    puff.push([c.x + c.rx * .95, c.y + c.ry * .4], [c.x - c.rx * .95, c.y + c.ry * .35]);
    sc.fill(spline(puff, 4, true), [254, 252, 247], { layer: 'back', j: 10, seed: 1110 + i, t0: .5 + i * .09, dur: .1, alpha: .9 });
    sc.wash(ellipse(c.x + c.rx * .03, c.y + c.ry * .62, c.rx * .84, c.ry * .32, 18), mix3(PAL.greyLight, PAL.violet, .3), { a: c.a, j: 14, layers: 1, edge: 0, seed: 1120 + i, speckle: 18 }, { layer: 'back', t0: .7 + i * .09, dur: .7 });
    sc.wash(ellipse(c.x - c.rx * .22, c.y - c.ry * .02, c.rx * .5, c.ry * .3, 16), [255, 255, 252], { a: .3, j: 12, layers: 1, edge: 0, seed: 1130 + i }, { layer: 'back', t0: .8 + i * .09, dur: .6 });
  });
  // 远处屋脊 + 城市轮廓（低低的，压住画面底）
  for (let i = 0; i < 10; i++) {
    const x = W.x0 - 20 + i * 160 + R() * 46, w = 62 + R() * 90, top = 690 + R() * 70;
    const poly = [[x - w, W.y1 + 10], [x - w, top], [x - w * .5, top - 12], [x + w * .35, top - 6], [x + w, top + 8], [x + w, W.y1 + 10]];
    sc.fill(poly, [252, 250, 243], { layer: 'back', j: 2, seed: 1150 + i, t0: 1.1 + i * .06, dur: .08 });
    sc.wash(poly, mix3(PAL.stoneCool, PAL.bluePale, .5), { a: .32, j: 8, layers: 1, edge: .15, seed: 1160 + i }, { layer: 'back', t0: 1.2 + i * .06, dur: .6 });
    sc.ink2([[x - w, top + 2], [x - w * .5, top - 12], [x + w * .35, top - 6], [x + w, top + 8]], { w: 1.3, wob: .6, seed: 1170 + i, over: 4 }, { layer: 'back', t0: 1.25 + i * .06, dur: .4 });
  }
  // 光柱（云缝打下，动态呼吸）
  if (o.lightBeam !== false) {
    sc.dyn((ctx, t) => {
      const a = clamp((t - 1.9) / 2.6) * (o.beamGain ?? 1);
      if (a <= .01) return;
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 4; k++) {
        const bx = 1090 + k * 52, g = ctx.createLinearGradient(bx, 240, bx - 240, W.y1);
        g.addColorStop(0, `rgba(255,247,226,${(0.17 - k * .03) * a * (1 + .07 * Math.sin(t * .8 + k * 1.7))})`);
        g.addColorStop(.5, `rgba(255,247,226,${(0.08 - k * .014) * a})`);
        g.addColorStop(1, 'rgba(255,247,226,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - 34 - k * 26, 230); ctx.lineTo(bx + 46 - k * 22, 220);
        ctx.lineTo(bx - 150 - k * 70, W.y1 + 20); ctx.lineTo(bx - 400 - k * 90, W.y1 + 20);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }, 'back');
  }
  // 彩虹：透明淡彩的色带（很淡、很薄、慢慢铺开）
  if (o.rainbow) {
    const rb = o.rainbow === true ? { t0: 2.0, t1: 5.0, cx: 1080, cy: 1020, r0: 560, gain: 1 } : o.rainbow;
    const COLS = [[232, 186, 178], [238, 202, 158], [236, 224, 168], [196, 216, 186], [178, 202, 222], [190, 184, 218], [224, 190, 214]];
    sc.dyn((ctx, t) => {
      const u = clamp((t - rb.t0) / (rb.t1 - rb.t0));
      if (u <= 0) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(W.x0, W.y0, W.x1 - W.x0, W.y1 - W.y0); ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      const bandW = (o.rainbowW ?? 15), rr = (o.rainbowR ?? rb.r0);
      const a0 = Math.PI + .1, a1 = TAU - .1, span = (a1 - a0) * clamp(u * (o.rainbowReveal ?? 1));
      for (let i = 0; i < COLS.length; i++) {
        const c = COLS[i];
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(o.rainbowA ?? .13) * u * (rb.gain ?? 1)})`;
        ctx.lineWidth = bandW;
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rr - i * bandW * .95, a0, a0 + span); ctx.stroke();
      }
      ctx.restore();
    }, 'back');
  }
}

// ---------------- 窗框 ----------------
function frame_(sc, W, iw, o) {
  // 外框四条：粗墨线 + 墨晕；四角出头、不封口
  const M = 10;
  const edges = [
    [[W.x0 - M, W.y0], [W.x1 + M, W.y0 - 3]], [[W.x1, W.y0 - M], [W.x1 + 3, W.y1 + M]],
    [[W.x1 + M, W.y1], [W.x0 - M, W.y1 + 3]], [[W.x0, W.y1 + M], [W.x0 - 3, W.y0 - M]],
  ];
  edges.forEach((e, i) => sc.ink2(e, { w: 3.6, wob: .9, seed: 780 + i, over: 9 }, { layer: 'mid', t0: .25 + i * .13, dur: .6 }));
  // 框的内侧第二道线（速写双线），偶尔断
  sc.ink([[W.x0 + 9, W.y0 + 10], [W.x0 + 9, W.y1 - 10]], { w: 1.2, wob: .7, seed: 790, over: 2, gap: .6 }, { layer: 'mid', t0: .75, dur: .5, alpha: .55 });
  sc.ink([[W.x0 + 10, W.y0 + 9], [W.x1 - 10, W.y0 + 10]], { w: 1.2, wob: .7, seed: 791, over: 2, gap: .6 }, { layer: 'mid', t0: .8, dur: .5, alpha: .55 });
  sc.ink([[W.x1 - 10, W.y1 - 9], [W.x0 + 10, W.y1 - 9]], { w: 1.2, wob: .7, seed: 792, over: 2, gap: .6 }, { layer: 'mid', t0: .85, dur: .5, alpha: .55 });
  // 窗洞内沿的厚度（左亮右暗，下面最暗）
  const inn = [[iw.x0, iw.y0], [iw.x1, iw.y0], [iw.x1, iw.y0 + 12], [iw.x0, iw.y0 + 12]];
  sc.wash(inn, mix3(PAL.greyLight, [255, 255, 255], .35), { a: .4, j: 3, layers: 1, edge: 0, seed: 795 }, { layer: 'mid', t0: .9, dur: .4 });
  const inb = [[iw.x0, iw.y1 - 14], [iw.x1, iw.y1 - 14], [iw.x1, iw.y1], [iw.x0, iw.y1]];
  sc.wash(inb, mix3(PAL.grey, PAL.blueDeep, .2), { a: .3, j: 3, layers: 1, edge: 0, seed: 796 }, { layer: 'mid', t0: .95, dur: .4 });
  // 中梃（竖）
  const mx = W.mull, mw = 9;
  sc.fill([[mx - mw, W.y0 + W.fw], [mx + mw, W.y0 + W.fw], [mx + mw, W.y1 - W.fw], [mx - mw, W.y1 - W.fw]], PAPER, { layer: 'mid', t0: .85, dur: 0 });
  sc.wash([[mx - mw, W.y0 + W.fw], [mx + mw, W.y0 + W.fw], [mx + mw, W.y1 - W.fw], [mx - mw, W.y1 - W.fw]], mix3(PAL.cream, PAL.stoneCool, .55), { a: .34, j: 2, layers: 1, edge: 0, seed: 720 }, { layer: 'mid', t0: .95, dur: .45 });
  sc.ink2([[mx - mw, W.y0 + W.fw - 3], [mx - mw + 1, W.y1 - W.fw + 5]], { w: 2.6, wob: .6, seed: 721, over: 6 }, { layer: 'mid', t0: 1.0, dur: .55 });
  sc.ink2([[mx + mw, W.y0 + W.fw + 4], [mx + mw - 1, W.y1 - W.fw + 2]], { w: 2.8, wob: .6, seed: 722, over: 6 }, { layer: 'mid', t0: 1.08, dur: .55 });
  // 横档（上亮子）
  const ty = W.trans, tw = 8;
  sc.fill([[iw.x0, ty - tw], [iw.x1, ty - tw], [iw.x1, ty + tw], [iw.x0, ty + tw]], PAPER, { layer: 'mid', t0: .9, dur: 0 });
  sc.wash([[iw.x0, ty - tw], [iw.x1, ty - tw], [iw.x1, ty + tw], [iw.x0, ty + tw]], mix3(PAL.cream, PAL.stoneCool, .5), { a: .3, j: 2, layers: 1, edge: 0, seed: 730 }, { layer: 'mid', t0: 1.0, dur: .45 });
  sc.ink2([[iw.x0 - 2, ty - tw], [iw.x1 + 3, ty - tw + 1]], { w: 2.4, wob: .6, seed: 731, over: 5 }, { layer: 'mid', t0: 1.05, dur: .5 });
  sc.ink2([[iw.x1, ty + tw], [iw.x0 - 3, ty + tw - 1]], { w: 2.4, wob: .6, seed: 732, over: 5 }, { layer: 'mid', t0: 1.12, dur: .5 });
  // 框上的一点排线（暗部）
  sc.hatch([[W.x0 + 6, W.y0 + 6], [W.x0 + W.fw, W.y0 + 6], [W.x0 + W.fw, W.y1 - 6], [W.x0 + 6, W.y1 - 6]], { ang: Math.PI * .75, gap: 7, w: .9, seed: 733 }, { layer: 'mid', t0: 1.2, dur: .8, alpha: .3 });
}

// ---------------- 窗帘 ----------------
function curtain_(sc, R, W, o) {
  // 右侧厚帘
  const cR = [[1608, -30], [1770, -10], [1810, 260], [1852, 640], [1888, 1220], [1596, 1220], [1612, 760], [1588, 330]];
  sc.fill(cR, [252, 249, 241], { layer: 'mid', j: 3, seed: 800, t0: 1.2, dur: .1 });
  sc.wash(cR, mix3(PAL.greyLight, PAL.bluePale, .4), { a: .34, j: 16, layers: 2, edge: .1, seed: 801, speckle: 16 }, { layer: 'mid', t0: 1.3, dur: 1 });
  for (let i = 0; i < 4; i++) {
    const x = 1630 + i * 62;
    sc.wash([[x, 20], [x + 30, 10], [x + 46, 400], [x + 20, 1210], [x - 16, 1210], [x - 6, 560]], mix3(PAL.grey, PAL.greyLight, .5), { a: .12 + i * .02, j: 10, layers: 1, edge: 0, seed: 810 + i }, { layer: 'mid', t0: 1.5 + i * .1, dur: .9 });
    sc.ink([[x + 6, 40], [x + 22, 320], [x + 14, 700], [x + 26, 1190]], { w: 1.4, wob: 1.2, seed: 820 + i, gap: .55, over: 4 }, { layer: 'mid', t0: 1.8 + i * .1, dur: 1.0, alpha: .6 });
  }
  // 左侧薄纱（透光）
  const cL = [[0, -20], [170, -10], [200, 400], [236, 900], [252, 1220], [0, 1220]];
  sc.fill(cL, [253, 250, 243], { layer: 'mid', j: 3, seed: 850, t0: 1.35, dur: .1 });
  sc.wash(cL, mix3(PAL.bluePale, [255, 255, 255], .35), { a: .26, j: 18, layers: 2, edge: 0, seed: 851, speckle: 18 }, { layer: 'mid', t0: 1.45, dur: 1.0 });
  for (let i = 0; i < 3; i++) sc.ink([[52 + i * 52, 10], [64 + i * 52, 420], [56 + i * 52, 900], [66 + i * 52, 1200]], { w: 1.1, wob: 1.4, seed: 860 + i, gap: .6, over: 3 }, { layer: 'mid', t0: 1.9 + i * .1, dur: 1.0, alpha: .4 });
  // 窗帘杆
  sc.ink2([[40, 66], [1880, 46]], { w: 2.2, wob: .7, seed: 870, over: 10 }, { layer: 'mid', t0: 1.5, dur: .7, alpha: .8 });
  sc.ink2([[40, 66], [60, 96]], { w: 1.6, wob: .5, seed: 871, over: 2 }, { layer: 'mid', t0: 1.65, dur: .35 });
  sc.ink2([[1880, 46], [1860, 78]], { w: 1.6, wob: .5, seed: 872, over: 2 }, { layer: 'mid', t0: 1.7, dur: .35 });
}

// ---------------- 道具：手写信 ----------------
function letterOld_(sc, R, o = {}) {
  const x = o.x ?? 470, y = o.y ?? 780, w = o.w ?? 330, h = o.h ?? 96;
  // 平放在窗台上的透视四边形
  const quad = [[x, y + 26], [x + w, y - 4], [x + w + 14, y + h - 22], [x + 12, y + h + 6]];
  sc.wash(quad.map(([a, b]) => [a + 12, b + 20]), mix3(PAL.grey, PAL.bluePale, .3), { a: .22, j: 10, layers: 1, edge: 0, seed: 901 }, { layer: 'front', t0: .2, dur: .7 });
  sc.fill(quad, [253, 250, 241], { layer: 'front', j: 2, seed: 902, t0: .3, dur: .1 });
  sc.wash(quad, mix3(PAL.cream, PAL.pinkPale, .3), { a: .16, j: 12, layers: 2, edge: .08, seed: 903, speckle: 14 }, { layer: 'front', t0: .4, dur: .9 });
  // 信封的三角形封口
  sc.ink([[quad[0][0] + 8, quad[0][1] + 8], [x + w * .55, y + 14], [quad[1][0] - 10, quad[1][1] + 14]], { w: 1.3, wob: .5, seed: 904, over: 3 }, { layer: 'front', t0: .55, dur: .45, alpha: .8 });
  sc.inkPoly(quad, { w: 1.6, wob: .55, seed: 905, gap: .35 }, { layer: 'front', t0: .5, dur: .55, stagger: .05, alpha: .9 });
  // 边缘微卷（近角翘起）
  const curl = [[quad[3][0] + 6, quad[3][1] - 4], [quad[3][0] + 34, quad[3][1] - 10], [quad[3][0] + 40, quad[3][1] + 16], [quad[3][0] + 10, quad[3][1] + 18]];
  sc.fill(curl, [255, 252, 245], { layer: 'front', j: 1.5, seed: 906, t0: .8, dur: .1 });
  sc.wash(curl, mix3(PAL.cream, PAL.greyLight, .45), { a: .28, j: 3, layers: 1, edge: .15, seed: 907 }, { layer: 'front', t0: .9, dur: .4 });
  sc.inkPoly(curl, { w: 1.0, wob: .3, seed: 908, gap: .2 }, { layer: 'front', t0: .95, dur: .35, alpha: .75 });
  // 折痕
  sc.ink([[x + w * .5, y + 8], [x + w * .52, y + h - 8]], { w: .9, wob: .6, seed: 909, over: 2, gap: .6 }, { layer: 'front', t0: 1.0, dur: .35, alpha: .4 });
  // 信上的字迹（几行墨线的暗示）
  for (let i = 0; i < 5; i++) {
    const yy = y + 34 + i * 12, x0 = x + 30, x1 = x + w - 40 - (i === 4 ? 110 : 0);
    const pts = []; for (let k = 0; k <= 8; k++) pts.push([lerp(x0, x1, k / 8), yy + Math.sin(k * 3.1 + i * 1.7) * 1.5]);
    sc.ink(pts, { w: .9, wob: .5, seed: 920 + i, over: .5, gap: .5 }, { layer: 'front', t0: 1.1 + i * .07, dur: .45, alpha: .55 });
  }
}
// 旧行李箱的一角（右前景）
function suitcaseOld_(sc, R, o = {}) {
  const x = o.x ?? 1850, y = o.y ?? 1035;
  const body = [[x - 470, y], [x - 440, y - 250], [x + 40, y - 272], [x + 30, y - 4]];
  sc.wash(body.map(([a, b]) => [a + 14, b + 22]), mix3(PAL.grey, PAL.bluePale, .2), { a: .3, j: 12, layers: 1, edge: 0, seed: 950 }, { layer: 'front', t0: .25, dur: .8 });
  sc.fill(body, [250, 247, 238], { layer: 'front', j: 2, seed: 951, t0: .35, dur: .1 });
  sc.wash(body, mix3(PAL.him, PAL.stoneCool, .5), { a: .55, j: 6, layers: 2, edge: .4, seed: 952, speckle: 20 }, { layer: 'front', t0: .45, dur: .9 });
  // 受光的一面
  sc.wash([[x - 430, y - 30], [x - 402, y - 236], [x - 210, y - 246], [x - 232, y - 16]], mix3(PAL.him, [255, 245, 230], .18), { a: .2, j: 4, layers: 1, edge: 0, seed: 953 }, { layer: 'front', t0: .7, dur: .7 });
  // 箱壳的棱与皮革的划痕
  sc.ink2([[x - 462, y + 2], [x - 432, y - 248]], { w: 2.4, wob: .6, seed: 954, over: 6 }, { layer: 'front', t0: .6, dur: .55 });
  sc.ink2([[x - 436, y - 250], [x + 34, y - 272]], { w: 2.6, wob: .6, seed: 955, over: 6 }, { layer: 'front', t0: .7, dur: .55 });
  sc.ink2([[x + 32, y - 276], [x + 26, y + 4]], { w: 2.4, wob: .6, seed: 956, over: 6 }, { layer: 'front', t0: .8, dur: .55 });
  for (let i = 0; i < 4; i++) sc.ink([[x - 380 + i * 104, y - 18 - i * 2], [x - 372 + i * 104, y - 246 + i * 3]], { w: 1.3, wob: .8, seed: 960 + i, gap: .5, over: 2 }, { layer: 'front', t0: .95 + i * .07, dur: .55, alpha: .55 });
  for (let i = 0; i < 7; i++) sc.ink([[x - 420 + R() * 380, y - 60 - R() * 170], [x - 400 + R() * 360, y - 40 - R() * 160]], { w: .8, wob: .5, seed: 965 + i, over: 0, gap: .3 }, { layer: 'front', t0: 1.2 + i * .05, dur: .5, alpha: .3 });
  // 两道皮带 + 缝线（让箱子读得出来）\n  for (let i = 0; i < 2; i++) {\n    const bx = x - (i ? 300 : 130);\n    sc.wash([[bx, y - 2], [bx + 30, y - 4], [bx + 34, y - 300], [bx + 6, y - 302]], mix3(PAL.lampDeep, PAL.him, .5), { a: .42, j: 3, layers: 1, edge: .2, seed: 958 + i }, { layer: 'front', t0: .95 + i * .1, dur: .6 });\n    sc.ink([[bx + 1, y - 8], [bx + 29, y - 10], [bx + 33, y - 298], [bx + 7, y - 300]], { w: 1.6, wob: .4, seed: 959 + i, gap: .25, over: 3 }, { layer: 'front', t0: 1.0 + i * .1, dur: .55, alpha: .7 });\n    for (let k = 0; k < 8; k++) sc.ink([[bx + 10 + k * 2.4, y - 24 - k * 32], [bx + 12 + k * 2.4, y - 32 - k * 32]], { w: .9, wob: .2, seed: 968 + i * 10 + k, over: 0 }, { layer: 'front', t0: 1.2 + k * .03, dur: .3, alpha: .5 });\n  }\n  // 提手与铜扣
  sc.ink2([[x - 300, y - 262], [x - 292, y - 300], [x - 214, y - 306], [x - 204, y - 264]], { w: 2.4, wob: .4, seed: 970, over: 3 }, { layer: 'front', t0: 1.05, dur: .55 });
  const lock = [[x - 52, y - 150], [x - 26, y - 152], [x - 24, y - 112], [x - 50, y - 110]];
  sc.fill(lock, [250, 246, 236], { layer: 'front', j: 1, seed: 971, t0: 1.15, dur: .1 });
  sc.wash(lock, mix3(PAL.lampDeep, PAL.stoneCool, .35), { a: .5, j: 2, layers: 1, edge: .2, seed: 972 }, { layer: 'front', t0: 1.2, dur: .4 });
  sc.inkPoly(lock, { w: 1.5, wob: .3, seed: 973, gap: .15 }, { layer: 'front', t0: 1.2, dur: .35 });
  sc.ink([[x - 40, y - 140], [x - 34, y - 128]], { w: 1.2, wob: .2, seed: 974, over: 1 }, { layer: 'front', t0: 1.35, dur: .25 });
  // 箱底的湿痕
  sc.wash([[x - 460, y - 6], [x + 20, y - 22], [x + 20, y + 16], [x - 460, y + 24]], mix3(PAL.grey, PAL.bluePale, .3), { a: .2, j: 8, layers: 1, edge: 0, seed: 975 }, { layer: 'front', t0: 1.3, dur: .7 });
}
// 旧照片（一角）
function photoOld_(sc, R, o = {}) {
  const x = o.x ?? 1010, y = o.y ?? 790, w = o.w ?? 200, h = o.h ?? 140, ang = o.ang ?? -.05;
  const P = (u, v) => { const cx = x + w / 2, cy = y + h / 2, du = u - cx, dv = v - cy; return [cx + du * Math.cos(ang) - dv * Math.sin(ang), cy + du * Math.sin(ang) + dv * Math.cos(ang)]; };
  const quad = [P(x, y), P(x + w, y + 4), P(x + w - 8, y + h), P(x + 2, y + h - 6)];
  sc.wash(quad.map(([a, b]) => [a + 12, b + 16]), mix3(PAL.grey, PAL.bluePale, .3), { a: .2, j: 8, layers: 1, edge: 0, seed: 980 }, { layer: 'front', t0: .35, dur: .7 });
  sc.fill(quad, [253, 250, 241], { layer: 'front', j: 1.5, seed: 981, t0: .45, dur: .1 });
  sc.wash(quad, mix3(PAL.cream, PAL.greyLight, .3), { a: .17, j: 6, layers: 1, edge: 0, seed: 982, speckle: 10 }, { layer: 'front', t0: .6, dur: .7 });
  sc.inkPoly(quad, { w: 1.4, wob: .5, seed: 983, gap: .35 }, { layer: 'front', t0: .7, dur: .5, stagger: .05 });
  // 照片里：模糊的笑颜（两团暖色 + 几根线）
  const cx = x + w * .5, cy = y + h * .46;
  sc.wash(ellipse(cx - 28, cy - 4, 24, 28, 16), mix3(PAL.warm, PAL.cream, .5), { a: .3, j: 6, layers: 1, edge: 0, seed: 984 }, { layer: 'front', t0: .9, dur: .6 });
  sc.wash(ellipse(cx + 26, cy, 22, 26, 16), mix3(PAL.pinkPale, PAL.cream, .4), { a: .26, j: 6, layers: 1, edge: 0, seed: 985 }, { layer: 'front', t0: .95, dur: .6 });
  sc.ink([[cx - 44, cy + 24], [cx - 24, cy + 22], [cx - 6, cy + 26]], { w: .9, wob: .4, seed: 986, over: 1, gap: .5 }, { layer: 'front', t0: 1.05, dur: .35, alpha: .45 });
  sc.ink([[cx + 8, cy + 24], [cx + 26, cy + 22], [cx + 42, cy + 26]], { w: .9, wob: .4, seed: 987, over: 1, gap: .5 }, { layer: 'front', t0: 1.1, dur: .35, alpha: .45 });
}
// 没喝完的杯子
function cupOld_(sc, R, o = {}) {
  const x = o.x ?? 900, y = o.y ?? 820, w = o.w ?? 78, h = o.h ?? 92;
  const body = [[x - w / 2, y], [x - w / 2 + 7, y - h], [x + w / 2 - 7, y - h], [x + w / 2, y]];
  sc.wash([[x - w / 2, y + 4], [x + w / 2 + 12, y + 2], [x + w / 2 + 6, y + 20], [x - w / 2 - 6, y + 18]], mix3(PAL.greyLight, PAL.bluePale, .3), { a: .22, j: 4, layers: 1, edge: 0, seed: 990 }, { layer: 'front', t0: .3, dur: .6 });
  sc.fill(body, [253, 251, 244], { layer: 'front', j: 1.5, seed: 991, t0: .4, dur: .1 });
  sc.wash(body, PAL.greyLight, { a: .24, j: 3, layers: 2, edge: .2, seed: 992 }, { layer: 'front', t0: .5, dur: .6 });
  sc.inkPoly(body, { w: 1.5, wob: .4, seed: 993, gap: .2 }, { layer: 'front', t0: .6, dur: .5 });
  sc.ink2([[x - w / 2 + 8, y - h + 4], [x + w / 2 - 8, y - h + 3]], { w: 1.4, wob: .3, seed: 994, over: 2 }, { layer: 'front', t0: .75, dur: .35 });
  return { x, y: y - h };
}

// ================= v2 美术升级：更明确的色阶、更柔的云、更对的物件 =================
// ---------------- 窗外：城市（雨） ----------------
function backCity2(sc, M, R, o) {
  const W = WIN;
  const SK = [[W.x0 - 90, W.y0 - 100], [W.x1 + 90, W.y0 - 100], [W.x1 + 90, 780], [W.x0 - 90, 780]];
  // 天空：顶部冷、底部暖，有明确的明度层次
  sc.wash(SK, mix3(PAL.bluePale, PAL.blueDeep, .28), { a: .46, j: 36, layers: 2, edge: 0, seed: 11, freq: .005, speckle: 30 }, { layer: 'back', t0: .05, dur: 1.0 });
  sc.wash([[W.x0 - 90, 250], [W.x1 + 90, 230], [W.x1 + 90, 640], [W.x0 - 90, 660]], mix3(PAL.bluePale, PAL.cream, .45), { a: .34, j: 40, layers: 2, edge: 0, seed: 12 }, { layer: 'back', t0: .2, dur: 1.1 });
  sc.wash([[W.x0 - 90, 560], [W.x1 + 90, 540], [W.x1 + 90, 792], [W.x0 - 90, 792]], mix3(PAL.cream, PAL.warm, .5), { a: .3, j: 30, layers: 2, edge: 0, seed: 13 }, { layer: 'back', t0: .4, dur: 1.1 });
  // 云：纸的留白 + 冷紫云底（没有硬白块）
  for (let i = 0; i < 5; i++) {
    const cx = W.x0 + 160 + R() * (W.x1 - W.x0 - 300), cy = 165 + R() * 140, rx = 110 + R() * 130, ry = rx * (.24 + R() * .14);
    sc.wash(ellipse(cx + rx * .04, cy + ry * .5, rx, ry * .55, 20), mix3(PAL.greyLight, PAL.violet, .28), { a: .22, j: 14, layers: 2, edge: 0, seed: 210 + i }, { layer: 'back', t0: .55 + i * .08, dur: .7 });
    sc.wash(ellipse(cx - rx * .1, cy - ry * .05, rx * .7, ry * .42, 18), [255, 255, 252], { a: .34, j: 12, layers: 1, edge: 0, seed: 220 + i }, { layer: 'back', t0: .65 + i * .08, dur: .6 });
    sc.wash(ellipse(cx + rx * .35, cy - ry * .1, rx * .34, ry * .3, 14), [255, 255, 253], { a: .26, j: 10, layers: 1, edge: 0, seed: 230 + i }, { layer: 'back', t0: .75 + i * .08, dur: .5 });
  }
  // 远处天际线（淡、碎、低）
  for (let i = 0; i < 8; i++) {
    const x = W.x0 + 20 + i * 186 + R() * 44, hw = 42 + R() * 40, top = 512 + R() * 96;
    const poly = [[x - hw, 792], [x - hw, top], [x + hw, top], [x + hw, 792]];
    sc.wash(poly, mix3(M.city, M.haze, .62), { a: .34, j: 6, layers: 1, edge: 0, seed: 310 + i }, { layer: 'back', t0: .75 + i * .05, dur: .6 });
  }
  // 近楼三栋（明度差拉开：中景最深的蓝灰）
  const blds = [
    { x: 404, w: 214, top: 492, col: mix3(PAL.stone, PAL.blueDeep, .22), tank: 1, lit: 1, seed: 41 },
    { x: 806, w: 232, top: 432, col: mix3(PAL.stoneCool, PAL.blueDeep, .5), tank: 0, lit: 3, seed: 42 },
    { x: 1378, w: 258, top: 500, col: mix3(PAL.grey, PAL.blueDeep, .52), tank: 0, lit: 0, seed: 43 },
  ];
  const litSpots = [];
  for (const b of blds) {
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, top = b.top, bot = 792;
    const poly = [[x0, bot], [x0, top], [x1, top], [x1, bot]];
    sc.fill(poly, [251, 249, 242], { layer: 'back', j: 3, seed: b.seed, t0: .9 + b.x / 7000, dur: .06 });
    sc.wash(poly, b.col, { a: .56, j: 7, layers: 2, edge: .3, seed: b.seed + 1, speckle: 18 }, { layer: 'back', t0: 1.0 + b.x / 7000, dur: .8 });
    // 背光面
    sc.wash([[x0 + b.w * .6, bot], [x0 + b.w * .6, top], [x1, top], [x1, bot]], mix3(b.col, PAL.blueDeep, .45), { a: .3, j: 5, layers: 1, edge: 0, seed: b.seed + 2 }, { layer: 'back', t0: 1.15 + b.x / 7000, dur: .7 });
    // 受光的一侧（上缘留一道亮）
    sc.wash([[x0 + 6, top + 6], [x1 - 6, top + 6], [x1 - 10, top + 44], [x0 + 10, top + 44]], mix3(b.col, PAL.cream, .5), { a: .26, j: 4, layers: 1, edge: 0, seed: b.seed + 3 }, { layer: 'back', t0: 1.2 + b.x / 7000, dur: .6 });
    // 窗：稀疏的短笔触，少量暖灯
    const cols = Math.max(3, Math.round(b.w / 58)), rows = Math.max(3, Math.round((bot - top) / 64));
    for (let r = 1; r < rows; r++) for (let c = 0; c < cols; c++) {
      const wx = x0 + 18 + c * (b.w - 36) / cols, wy = top + 34 + r * (bot - top - 46) / rows;
      if (fbm(wx * .021, wy * .033, b.seed, 2) < .34) continue;
      const ww = (b.w - 36) / cols * .55, wh = 22 + R() * 10;
      const lit = R() < .16;
      if (lit) { litSpots.push([wx + ww / 2, wy + wh / 2]); sc.wash([[wx, wy], [wx + ww, wy + 1], [wx + ww, wy + wh], [wx, wy + wh + 1]], mix3(PAL.lamp, [255, 250, 232], .3), { a: .95, j: 1.0, layers: 1, edge: 0, seed: b.seed * 40 + r * 9 + c }, { layer: 'back', t0: 1.25 + r * .02, dur: .3 }); }
      sc.inkPoly([[wx, wy], [wx + ww, wy + 1], [wx + ww, wy + wh], [wx, wy + wh + 1]], { w: 1.15, wob: .45, seed: b.seed * 40 + r * 9 + c, gap: .5, smooth: false }, { layer: 'back', t0: 1.2 + r * .02 + c * .008, dur: .16, stagger: .01, alpha: .72 });
    }
    // 轮廓：近楼更粗
    sc.ink2([[x0, bot + 6], [x0 - 2, top - 2]], { w: 2.2, wob: .8, seed: b.seed + 10, over: 7 }, { layer: 'back', t0: 1.1, dur: .55 });
    sc.ink2([[x1 + 2, top - 3], [x1, bot + 6]], { w: 2.4, wob: .8, seed: b.seed + 11, over: 7 }, { layer: 'back', t0: 1.15, dur: .55 });
    sc.ink2([[x0 - 7, top], [x1 + 7, top - 2]], { w: 2.3, wob: .7, seed: b.seed + 12, over: 6 }, { layer: 'back', t0: 1.2, dur: .5 });
    // 屋顶设施
    if (b.tank) {
      sc.ink2([[x0 + b.w * .58, top], [x0 + b.w * .56, top - 46], [x0 + b.w * .82, top - 48], [x0 + b.w * .84, top - 2]], { w: 1.9, wob: .6, seed: b.seed + 20, over: 4 }, { layer: 'back', t0: 1.3, dur: .45 });
      sc.ink2([[x0 + b.w * .5, top - 46], [x0 + b.w * .69, top - 70], [x0 + b.w * .88, top - 48]], { w: 1.7, wob: .5, seed: b.seed + 21, over: 3 }, { layer: 'back', t0: 1.35, dur: .4 });
    } else {
      sc.ink2([[x0 + b.w * .28, top], [x0 + b.w * .28, top - 58], [x0 + b.w * .37, top - 36]], { w: 1.5, wob: .4, seed: b.seed + 22, over: 3 }, { layer: 'back', t0: 1.35, dur: .4 });
      sc.ink2([[x0 + b.w * .28, top - 58], [x0 + b.w * .34, top - 58]], { w: 1.2, wob: .3, seed: b.seed + 23, over: 1 }, { layer: 'back', t0: 1.4, dur: .25 });
    }
  }
  // 空气雾：把楼往后推\n  sc.wash([[W.x0 - 90, 560], [W.x1 + 90, 540], [W.x1 + 90, 792], [W.x0 - 90, 800]], mix3(PAL.cream, PAL.bluePale, .35), { a: .22, j: 30, layers: 1, edge: 0, seed: 599 }, { layer: 'back', t0: 1.6, dur: 1.0 });\n  // 暖窗的光晕（模糊的一点点光，让城市有呼吸）
  sc.dyn((ctx, t) => {
    const g = clamp((t - 1.4) / 1.6) * M.warm;
    if (g <= .01) return;
    for (let i = 0; i < litSpots.length; i++) {
      glow(ctx, t, litSpots[i][0], litSpots[i][1], 26 + (i % 3) * 8, PAL.lamp, .22 * g, { breathe: .2, rate: .8 + i * .07, phase: i });
    }
  }, 'back');
  // 街道 + 路灯 + 车灯
  sc.wash([[W.x0 - 90, 700], [W.x1 + 90, 688], [W.x1 + 90, 792], [W.x0 - 90, 800]], mix3(PAL.grey, PAL.blueDeep, .5), { a: .58, j: 14, layers: 2, edge: 0, seed: 500, speckle: 22 }, { layer: 'back', t0: 1.25, dur: .8 });
  sc.wash([[W.x0 - 90, 742], [W.x1 + 90, 730], [W.x1 + 90, 792], [W.x0 - 90, 800]], mix3(PAL.cream, PAL.warm, .45), { a: .1, j: 20, layers: 1, edge: 0, seed: 502 }, { layer: 'back', t0: 1.5, dur: .8 });
  const lampX = 1122, lampTop = 466;
  sc.ink2([[lampX, 792], [lampX - 4, lampTop + 44], [lampX + 2, lampTop + 10]], { w: 2.6, wob: .5, seed: 520, over: 5 }, { layer: 'back', t0: 1.4, dur: .5 });
  sc.ink2([[lampX - 24, lampTop + 8], [lampX + 26, lampTop + 6], [lampX + 18, lampTop + 32], [lampX - 16, lampTop + 32]], { w: 2.1, wob: .4, seed: 521, over: 3 }, { layer: 'back', t0: 1.5, dur: .45 });
  sc.wash([[lampX - 17, lampTop + 9], [lampX + 19, lampTop + 8], [lampX + 14, lampTop + 29], [lampX - 12, lampTop + 29]], mix3(PAL.lamp, [255, 248, 226], .35), { a: .85, j: 1.5, layers: 1, edge: 0, seed: 522 }, { layer: 'back', t0: 1.55, dur: .4 });
  // 远处车灯
  const cars = [[640, 726, .8], [1520, 712, .7], [780, 748, .5]];
  sc.dyn((ctx, t) => { const g = clamp((t - 1.6) / 1.4) * M.warm; if (g <= .01) return; for (const [x, y, a] of cars) { glow(ctx, t, x, y, 22, PAL.lampDeep, .3 * a * g, { breathe: .3, rate: 1.4 }); glow(ctx, t, x + 26, y, 16, PAL.lamp, .22 * a * g, { breathe: .25, rate: 1.1 }); } }, 'back');
  // 电线
  for (let i = 0; i < 3; i++) {
    const y0 = 232 + i * 36, sag = 30 + i * 12;
    const pts = []; for (let k = 0; k <= 24; k++) { const u = k / 24; pts.push([W.x0 - 70 + u * (W.x1 - W.x0 + 140), y0 + Math.sin(u * Math.PI) * sag]); }
    sc.ink(pts, { w: 1.3, wob: .35, seed: 530 + i, over: 0, gap: .15 }, { layer: 'back', t0: 1.25 + i * .1, dur: 1.1, alpha: .62 });
  }
  // 鸟
  for (let i = 0; i < 3; i++) {
    const bx = W.x0 + 420 + R() * 460, by = 196 + R() * 80, s = 8 + R() * 6;
    sc.ink([[bx - s, by], [bx, by - s * .55], [bx + s * .9, by - s * .1]], { w: 1.4, wob: .3, seed: 540 + i, over: 1 }, { layer: 'back', t0: 1.7 + i * .2, dur: .35, alpha: .66 });
  }
}

// ---------------- 窗外：天空（雨后 / 云层 / 彩虹） ----------------
function backSky2(sc, M, R, o) {
  const W = WIN;
  const area = [[W.x0 - 90, W.y0 - 100], [W.x1 + 90, W.y0 - 100], [W.x1 + 90, W.y1 + 16], [W.x0 - 90, W.y1 + 16]];
  // 天光：顶部冷灰蓝 → 底部奶油暖
  sc.wash(area, mix3(PAL.bluePale, PAL.blue, .32), { a: .44, j: 36, layers: 2, edge: 0, seed: 1101, freq: .005, speckle: 32 }, { layer: 'back', t0: .15, dur: 1.1 });
  sc.wash([[W.x0 - 90, 300], [W.x1 + 90, 280], [W.x1 + 90, W.y1 + 16], [W.x0 - 90, W.y1 + 16]], mix3(PAL.cream, PAL.warm, .42), { a: .34, j: 34, layers: 2, edge: 0, seed: 1102 }, { layer: 'back', t0: .4, dur: 1.2 });
  // 云：一堆堆柔和的淡彩，没有硬白边
  const cl = [
    { x: 470, y: 232, rx: 240, ry: 78, a: .3 }, { x: 1010, y: 196, rx: 300, ry: 92, a: .28 },
    { x: 1470, y: 316, rx: 230, ry: 74, a: .26 }, { x: 300, y: 404, rx: 200, ry: 60, a: .22 },
    { x: 760, y: 470, rx: 300, ry: 70, a: .22 }, { x: 1290, y: 540, rx: 280, ry: 66, a: .2 },
    { x: 540, y: 600, rx: 260, ry: 60, a: .18 },
  ];
  cl.forEach((c, i) => {
    for (let k = 0; k < 3; k++) {
      sc.wash(ellipse(c.x + (k - 1) * c.rx * .45, c.y + c.ry * (.3 + k * .12), c.rx * (.62 - k * .1), c.ry * (.62 - k * .08), 18), mix3(PAL.greyLight, PAL.violet, .3 - k * .06), { a: c.a * (1 - k * .18), j: 16, layers: 1, edge: 0, seed: 1110 + i * 5 + k }, { layer: 'back', t0: .45 + i * .07 + k * .04, dur: .7 });
    }
    sc.wash(ellipse(c.x - c.rx * .16, c.y - c.ry * .22, c.rx * .55, c.ry * .4, 16), [255, 255, 252], { a: .3, j: 14, layers: 1, edge: 0, seed: 1140 + i }, { layer: 'back', t0: .55 + i * .07, dur: .6 });
  });
  // 云缝：一道被光打亮的空
  sc.wash([[930, 150], [1240, 130], [1320, 300], [1010, 340]], [255, 254, 250], { a: .5, j: 16, layers: 1, edge: 0, seed: 1150 }, { layer: 'back', t0: .8, dur: .9 });
  // 远处城市轮廓（低、安静）
  for (let i = 0; i < 8; i++) {
    const x = W.x0 - 10 + i * 196 + R() * 40, w = 70 + R() * 80, top = 700 + R() * 56;
    const poly = [[x - w, W.y1 + 12], [x - w, top], [x - w * .5, top - 12], [x + w * .35, top - 6], [x + w, top + 8], [x + w, W.y1 + 12]];
    sc.fill(poly, [252, 250, 243], { layer: 'back', j: 2, seed: 1150 + i, t0: 1.0 + i * .06, dur: .06 });
    sc.wash(poly, mix3(PAL.stoneCool, PAL.blueDeep, .35), { a: .4, j: 8, layers: 1, edge: .15, seed: 1160 + i }, { layer: 'back', t0: 1.1 + i * .06, dur: .6 });
    sc.ink2([[x - w, top + 2], [x - w * .5, top - 12], [x + w * .35, top - 6], [x + w, top + 8]], { w: 1.5, wob: .6, seed: 1170 + i, over: 4 }, { layer: 'back', t0: 1.15 + i * .06, dur: .4 });
  }
  // 光柱
  if (o.lightBeam !== false) {
    sc.dyn((ctx, t) => {
      const a = clamp((t - 1.6) / 2.6) * (o.beamGain ?? 1);
      if (a <= .01) return;
      ctx.save();
      for (let k = 0; k < 4; k++) {
        const bx = 1080 + k * 54, g = ctx.createLinearGradient(bx, 220, bx - 250, W.y1);
        g.addColorStop(0, `rgba(255,247,226,${(0.19 - k * .034) * a * (1 + .07 * Math.sin(t * .8 + k * 1.7))})`);
        g.addColorStop(.55, `rgba(255,247,226,${(0.085 - k * .015) * a})`);
        g.addColorStop(1, 'rgba(255,247,226,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - 30 - k * 26, 214); ctx.lineTo(bx + 48 - k * 22, 204);
        ctx.lineTo(bx - 140 - k * 66, W.y1 + 20); ctx.lineTo(bx - 380 - k * 86, W.y1 + 20);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }, 'back');
  }
  // 彩虹：很淡很薄的透明淡彩带
  if (o.rainbow) {
    const rb = o.rainbow === true ? { t0: 1.8, t1: 4.6, cx: 1080, cy: 1030, r0: 580, gain: 1 } : o.rainbow;
    const COLS = [[230, 184, 176], [236, 200, 156], [234, 222, 166], [194, 214, 184], [176, 200, 220], [188, 182, 216], [222, 188, 212]];
    sc.dyn((ctx, t) => {
      const u = clamp((t - rb.t0) / (rb.t1 - rb.t0));
      if (u <= 0) return;
      ctx.save();
      ctx.beginPath(); ctx.rect(W.x0, W.y0, W.x1 - W.x0, W.y1 - W.y0); ctx.clip();
      ctx.globalCompositeOperation = 'multiply';
      const bandW = (o.rainbowW ?? 14), rr = (o.rainbowR ?? rb.r0);
      const a0 = Math.PI + .1, a1 = TAU - .1, span = (a1 - a0) * clamp(u * (o.rainbowReveal ?? 1));
      for (let i = 0; i < COLS.length; i++) {
        const c = COLS[i];
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(o.rainbowA ?? .12) * u * (rb.gain ?? 1)})`;
        ctx.lineWidth = bandW;
        ctx.beginPath(); ctx.arc(rb.cx, rb.cy, rr - i * bandW * .95, a0, a0 + span); ctx.stroke();
      }
      ctx.restore();
    }, 'back');
  }
}

// ---------------- 窗框（更厚、更有分量） ----------------
function frame2_(sc, W, iw, o, R) {
  const M = 10;
  const edges = [
    [[W.x0 - M, W.y0], [W.x1 + M, W.y0 - 3]], [[W.x1, W.y0 - M], [W.x1 + 3, W.y1 + M]],
    [[W.x1 + M, W.y1], [W.x0 - M, W.y1 + 3]], [[W.x0, W.y1 + M], [W.x0 - 3, W.y0 - M]],
  ];
  edges.forEach((e, i) => sc.ink2(e, { w: 4.4, wob: .8, seed: 780 + i, over: 10 }, { layer: 'mid', t0: .2 + i * .11, dur: .55 }));
  // 内沿双线
  sc.ink([[W.x0 + 10, W.y0 + 11], [W.x0 + 10, W.y1 - 11]], { w: 1.5, wob: .7, seed: 790, over: 3, gap: .55 }, { layer: 'mid', t0: .7, dur: .5, alpha: .55 });
  sc.ink([[W.x0 + 11, W.y0 + 10], [W.x1 - 11, W.y0 + 11]], { w: 1.5, wob: .7, seed: 791, over: 3, gap: .55 }, { layer: 'mid', t0: .75, dur: .5, alpha: .55 });
  sc.ink([[W.x1 - 11, W.y1 - 10], [W.x0 + 11, W.y1 - 10]], { w: 1.5, wob: .7, seed: 792, over: 3, gap: .55 }, { layer: 'mid', t0: .8, dur: .5, alpha: .55 });
  // 木框的纹理（短竖纹，非常淡）
  for (let i = 0; i < 12; i++) {
    const ly = 60 + R() * 0 + i * 58;
    sc.ink([[W.x0 + 6, ly], [W.x0 + 19, ly + 30]], { w: .8, wob: .4, seed: 793 + i, over: 0, gap: .3 }, { layer: 'mid', t0: 1.0 + i * .03, dur: .4, alpha: .22 });
  }
  // 窗洞内沿（左上亮、下侧暗）
  sc.wash([[iw.x0, iw.y0], [iw.x1, iw.y0], [iw.x1, iw.y0 + 13], [iw.x0, iw.y0 + 13]], mix3(PAL.greyLight, [255, 255, 255], .3), { a: .42, j: 3, layers: 1, edge: 0, seed: 795 }, { layer: 'mid', t0: .85, dur: .45 });
  sc.hatch([[iw.x0, iw.y0], [iw.x0 + 14, iw.y0], [iw.x0 + 14, iw.y1], [iw.x0, iw.y1]], { ang: .9, gap: 6, w: .9, seed: 794 }, { layer: 'mid', t0: 1.0, dur: .7, alpha: .28 });
  sc.wash([[iw.x0, iw.y1 - 15], [iw.x1, iw.y1 - 15], [iw.x1, iw.y1], [iw.x0, iw.y1]], mix3(PAL.grey, PAL.blueDeep, .2), { a: .34, j: 3, layers: 1, edge: 0, seed: 796 }, { layer: 'mid', t0: .9, dur: .45 });
  // 中梃（竖）+ 横档
  const mx = W.mull, mw = 9;
  sc.fill([[mx - mw, W.y0 + W.fw], [mx + mw, W.y0 + W.fw], [mx + mw, W.y1 - W.fw], [mx - mw, W.y1 - W.fw]], mix3(PAL.cream, PAL.stoneCool, .3), { layer: 'mid', t0: .8, dur: 0 });
  sc.wash([[mx - mw, W.y0 + W.fw], [mx + mw, W.y0 + W.fw], [mx + mw, W.y1 - W.fw], [mx - mw, W.y1 - W.fw]], mix3(PAL.cream, PAL.stone, .5), { a: .4, j: 2, layers: 1, edge: 0, seed: 720 }, { layer: 'mid', t0: .9, dur: .5 });
  sc.ink2([[mx - mw, W.y0 + W.fw - 4], [mx - mw + 1, W.y1 - W.fw + 6]], { w: 3.0, wob: .55, seed: 721, over: 7 }, { layer: 'mid', t0: .95, dur: .55 });
  sc.ink2([[mx + mw, W.y0 + W.fw + 5], [mx + mw - 1, W.y1 - W.fw + 3]], { w: 3.2, wob: .55, seed: 722, over: 7 }, { layer: 'mid', t0: 1.05, dur: .55 });
  const ty = W.trans, tw = 8;
  sc.fill([[iw.x0, ty - tw], [iw.x1, ty - tw], [iw.x1, ty + tw], [iw.x0, ty + tw]], mix3(PAL.cream, PAL.stoneCool, .25), { layer: 'mid', t0: .85, dur: 0 });
  sc.wash([[iw.x0, ty - tw], [iw.x1, ty - tw], [iw.x1, ty + tw], [iw.x0, ty + tw]], mix3(PAL.cream, PAL.stone, .45), { a: .36, j: 2, layers: 1, edge: 0, seed: 730 }, { layer: 'mid', t0: .95, dur: .5 });
  sc.ink2([[iw.x0 - 3, ty - tw], [iw.x1 + 4, ty - tw + 1]], { w: 2.8, wob: .55, seed: 731, over: 6 }, { layer: 'mid', t0: 1.0, dur: .5 });
  sc.ink2([[iw.x1, ty + tw], [iw.x0 - 4, ty + tw - 1]], { w: 2.8, wob: .55, seed: 732, over: 6 }, { layer: 'mid', t0: 1.08, dur: .5 });
  // 框在暗部的排线
  sc.hatch([[W.x0 + 6, W.y0 + 6], [W.x0 + W.fw - 2, W.y0 + 6], [W.x0 + W.fw - 2, W.y1 - 6], [W.x0 + 6, W.y1 - 6]], { ang: .95, gap: 8, w: 1, seed: 733 }, { layer: 'mid', t0: 1.15, dur: .9, alpha: .3 });
}

// ---------------- 窗帘（更有布料的体积） ----------------
function curtain2_(sc, R, W, o) {
  // 右：厚帘，压在窗框上
  const cR = [[1592, -30], [1760, -14], [1800, 240], [1846, 620], [1884, 1220], [1580, 1220], [1600, 760], [1574, 320]];
  sc.fill(cR, [252, 249, 241], { layer: 'mid', j: 3, seed: 800, t0: 1.1, dur: .1 });
  sc.wash(cR, mix3(PAL.greyLight, PAL.bluePale, .45), { a: .4, j: 16, layers: 2, edge: .12, seed: 801, speckle: 18 }, { layer: 'mid', t0: 1.2, dur: 1 });
  // 布褶：几道柔和的明暗
  for (let i = 0; i < 5; i++) {
    const x = 1610 + i * 54;
    sc.wash([[x, 10], [x + 30, 0], [x + 40, 420], [x + 16, 1210], [x - 12, 1210], [x - 2, 560]], i % 2 ? mix3(PAL.grey, PAL.blueDeep, .18) : mix3(PAL.cream, [255, 255, 255], .4), { a: .14 + (i % 2) * .05, j: 10, layers: 1, edge: 0, seed: 810 + i }, { layer: 'mid', t0: 1.35 + i * .08, dur: .9 });
  }
  // 布的墨线：只画两三道，断断续续
  for (let i = 0; i < 3; i++) sc.ink([[1622 + i * 84, 24], [1640 + i * 84, 320], [1628 + i * 84, 700], [1646 + i * 84, 1190]], { w: 1.9, wob: 1.3, seed: 820 + i, gap: .55, over: 5 }, { layer: 'mid', t0: 1.6 + i * .1, dur: 1.1, alpha: .62 });
  // 帘边的暗部
  sc.wash([[1580, 120], [1606, 110], [1620, 900], [1600, 1220], [1560, 1220], [1570, 640]], mix3(PAL.grey, PAL.blueDeep, .25), { a: .2, j: 12, layers: 1, edge: 0, seed: 830 }, { layer: 'mid', t0: 1.7, dur: .9 });
  // 左：薄纱
  const cL = [[0, -20], [150, -10], [176, 400], [206, 900], [222, 1220], [0, 1220]];
  sc.fill(cL, [253, 250, 243], { layer: 'mid', j: 3, seed: 850, t0: 1.25, dur: .1 });
  sc.wash(cL, mix3(PAL.bluePale, [255, 255, 255], .3), { a: .3, j: 18, layers: 2, edge: 0, seed: 851, speckle: 20 }, { layer: 'mid', t0: 1.35, dur: 1.0 });
  for (let i = 0; i < 2; i++) sc.ink([[62 + i * 66, 20], [76 + i * 66, 440], [66 + i * 66, 920], [74 + i * 66, 1190]], { w: 1.4, wob: 1.5, seed: 860 + i, gap: .65, over: 4 }, { layer: 'mid', t0: 1.8 + i * .12, dur: 1.0, alpha: .42 });
  // 帘杆
  sc.ink2([[30, 62], [1890, 40]], { w: 3.0, wob: .6, seed: 870, over: 12 }, { layer: 'mid', t0: 1.4, dur: .7, alpha: .85 });
  sc.ink2([[30, 64], [54, 96]], { w: 1.8, wob: .5, seed: 871, over: 2 }, { layer: 'mid', t0: 1.55, dur: .35 });
  sc.ink2([[1890, 42], [1866, 76]], { w: 1.8, wob: .5, seed: 872, over: 2 }, { layer: 'mid', t0: 1.6, dur: .35 });
}

// ---------------- 手写信（安静地放在窗台上） ----------------
export function letter_(sc, R, o = {}) {
  const x = o.x ?? 470, y = o.y ?? 800, w = o.w ?? 268, h = o.h ?? 74;
  // 平放在窗台上的信封（透视很轻，形状要读得出来）
  const quad = [[x, y + 6], [x + w, y - 8], [x + w + 4, y + h - 2], [x + 6, y + h + 8]];
  // 影子
  sc.wash(quad.map(([a, b]) => [a + 9, b + 17]), mix3(PAL.grey, PAL.blueDeep, .3), { a: .28, j: 10, layers: 1, edge: 0, seed: 901 }, { layer: 'front', t0: .2, dur: .7 });
  // 纸
  sc.fill(quad, [253, 251, 243], { layer: 'front', j: 1.5, seed: 902, t0: .3, dur: .1 });
  sc.wash(quad, mix3(PAL.cream, PAL.pinkPale, .22), { a: .22, j: 8, layers: 2, edge: .12, seed: 903, speckle: 10 }, { layer: 'front', t0: .4, dur: .9 });
  // 封口：一道更明显的 V
  const flapTip = [x + w * .5, y + h * .34];
  sc.ink([[quad[0][0] + 7, quad[0][1] + 4], flapTip, [quad[1][0] - 6, quad[1][1] + 10]], { w: 1.7, wob: .45, seed: 904, over: 3 }, { layer: 'front', t0: .55, dur: .5, alpha: .8 });
  sc.wash([[quad[0][0] + 10, quad[0][1] + 8], flapTip, [quad[1][0] - 8, quad[1][1] + 12]], mix3(PAL.cream, PAL.greyLight, .5), { a: .18, j: 5, layers: 1, edge: 0, seed: 9041 }, { layer: 'front', t0: .65, dur: .6 });
  // 轮廓（粗一点、更肯定）
  sc.inkPoly(quad, { w: 2.2, wob: .45, seed: 905, gap: .25 }, { layer: 'front', t0: .5, dur: .6, stagger: .05, alpha: .92 });
  // 右上角微微翘起
  const curl = [[quad[1][0] - 34, quad[1][1] + 2], [quad[1][0] - 6, quad[1][1] - 4], [quad[1][0] - 2, quad[1][1] + 14], [quad[1][0] - 28, quad[1][1] + 18]];
  sc.fill(curl, [255, 253, 246], { layer: 'front', j: 1.2, seed: 906, t0: .8, dur: .1 });
  sc.inkPoly(curl, { w: 1.2, wob: .25, seed: 908, gap: .2 }, { layer: 'front', t0: .9, dur: .35, alpha: .8 });
  // 纸的折痕
  sc.ink([[x + w * .5, y + 6], [x + w * .51, y + h - 6]], { w: 1.0, wob: .5, seed: 909, over: 2, gap: .6 }, { layer: 'front', t0: .95, dur: .4, alpha: .32 });
  // 字迹（只在下半部分几行，别画满）
  for (let i = 0; i < 3; i++) {
    const yy = y + 46 + i * 9, x0 = x + 24, x1 = x + w - 40 - (i === 2 ? 60 : 0);
    const pts = []; for (let k = 0; k <= 8; k++) pts.push([lerp(x0, x1, k / 8), yy + Math.sin(k * 3.1 + i * 1.7) * 1.3]);
    sc.ink(pts, { w: .85, wob: .4, seed: 920 + i, over: .4, gap: .45 }, { layer: 'front', t0: 1.05 + i * .07, dur: .45, alpha: .4 });
  }
}// 旧行李箱的一角（右前景，保持在字幕安全区之上）
export function suitcase_(sc, R, o = {}) {
  const x = o.x ?? 1920, y = o.y ?? 902;
  const body = [[x - 372, y], [x - 350, y - 276], [x, y - 298], [x, y - 4]];
  sc.wash(body.map(([a, b]) => [a + 14, b + 20]), mix3(PAL.grey, PAL.bluePale, .2), { a: .3, j: 12, layers: 1, edge: 0, seed: 950 }, { layer: 'front', t0: .25, dur: .8 });
  sc.fill(body, [250, 247, 238], { layer: 'front', j: 2, seed: 951, t0: .35, dur: .1 });
  sc.wash(body, mix3(PAL.him, PAL.blueDeep, .45), { a: .6, j: 5, layers: 2, edge: .42, seed: 952 }, { layer: 'front', t0: .45, dur: .9 });
  // 受光边
  sc.wash([[x - 380, y - 20], [x - 360, y - 280], [x - 210, y - 296], [x - 226, y - 12]], mix3(PAL.him, [255, 248, 234], .24), { a: .22, j: 4, layers: 1, edge: 0, seed: 953 }, { layer: 'front', t0: .65, dur: .7 });
  sc.wash([[x - 390, y - 6], [x, y - 20], [x, y + 6], [x - 390, y + 20]], mix3(PAL.blueDeep, PAL.grey, .35), { a: .3, j: 8, layers: 1, edge: 0, seed: 954 }, { layer: 'front', t0: .8, dur: .6 });
  // 轮廓与皮面划痕
  sc.ink2([[x - 392, y], [x - 368, y - 302]], { w: 3.0, wob: .55, seed: 956, over: 7 }, { layer: 'front', t0: .55, dur: .6 });
  sc.ink2([[x - 372, y - 304], [x + 6, y - 326]], { w: 3.2, wob: .55, seed: 957, over: 7 }, { layer: 'front', t0: .65, dur: .6 });
  for (let i = 0; i < 3; i++) sc.ink([[x - 352 + i * 118, y - 14], [x - 342 + i * 118, y - 300 + i * 6]], { w: 1.5, wob: .8, seed: 960 + i, gap: .5, over: 2 }, { layer: 'front', t0: .9 + i * .08, dur: .6, alpha: .5 });
  for (let i = 0; i < 6; i++) sc.ink([[x - 360 + R() * 340, y - 60 - R() * 200], [x - 340 + R() * 320, y - 40 - R() * 190]], { w: .9, wob: .5, seed: 965 + i, over: 0, gap: .3 }, { layer: 'front', t0: 1.15 + i * .05, dur: .5, alpha: .28 });
  // 两道皮带 + 缝线（让箱子读得出来）\n  for (let i = 0; i < 2; i++) {\n    const bx = x - (i ? 300 : 130);\n    sc.wash([[bx, y - 2], [bx + 30, y - 4], [bx + 34, y - 300], [bx + 6, y - 302]], mix3(PAL.lampDeep, PAL.him, .5), { a: .42, j: 3, layers: 1, edge: .2, seed: 958 + i }, { layer: 'front', t0: .95 + i * .1, dur: .6 });\n    sc.ink([[bx + 1, y - 8], [bx + 29, y - 10], [bx + 33, y - 298], [bx + 7, y - 300]], { w: 1.6, wob: .4, seed: 959 + i, gap: .25, over: 3 }, { layer: 'front', t0: 1.0 + i * .1, dur: .55, alpha: .7 });\n    for (let k = 0; k < 8; k++) sc.ink([[bx + 10 + k * 2.4, y - 24 - k * 32], [bx + 12 + k * 2.4, y - 32 - k * 32]], { w: .9, wob: .2, seed: 968 + i * 10 + k, over: 0 }, { layer: 'front', t0: 1.2 + k * .03, dur: .3, alpha: .5 });\n  }\n  // 提手与铜扣
  sc.ink2([[x - 300, y - 314], [x - 292, y - 356], [x - 206, y - 362], [x - 196, y - 318]], { w: 2.8, wob: .4, seed: 970, over: 4 }, { layer: 'front', t0: 1.0, dur: .6 });
  const lock = [[x - 60, y - 176], [x - 30, y - 179], [x - 28, y - 136], [x - 58, y - 133]];
  sc.fill(lock, [251, 247, 237], { layer: 'front', j: 1, seed: 971, t0: 1.1, dur: .1 });
  sc.wash(lock, mix3(PAL.lampDeep, PAL.stoneCool, .3), { a: .6, j: 2, layers: 1, edge: .2, seed: 972 }, { layer: 'front', t0: 1.15, dur: .4 });
  sc.inkPoly(lock, { w: 1.7, wob: .3, seed: 973, gap: .15, smooth: false }, { layer: 'front', t0: 1.15, dur: .4 });
  // 湿痕
  sc.wash([[x - 392, y - 10], [x + 10, y - 26], [x + 10, y + 10], [x - 392, y + 16]], mix3(PAL.grey, PAL.bluePale, .35), { a: .2, j: 8, layers: 1, edge: 0, seed: 975 }, { layer: 'front', t0: 1.3, dur: .7 });
}
// 旧照片
export function photo_(sc, R, o = {}) {
  const x = o.x ?? 1010, y = o.y ?? 806, w = o.w ?? 176, h = o.h ?? 120, ang = o.ang ?? -.05;
  const P = (u, v) => { const cx = x + w / 2, cy = y + h / 2, du = u - cx, dv = v - cy; return [cx + du * Math.cos(ang) - dv * Math.sin(ang), cy + du * Math.sin(ang) + dv * Math.cos(ang)]; };
  const quad = [P(x, y), P(x + w, y + 4), P(x + w - 8, y + h), P(x + 2, y + h - 6)];
  sc.wash(quad.map(([a, b]) => [a + 12, b + 16]), mix3(PAL.grey, PAL.bluePale, .3), { a: .22, j: 8, layers: 1, edge: 0, seed: 980 }, { layer: 'front', t0: .35, dur: .7 });
  sc.fill(quad, [253, 250, 241], { layer: 'front', j: 1.5, seed: 981, t0: .45, dur: .1 });
  sc.wash(quad, mix3(PAL.cream, PAL.greyLight, .3), { a: .18, j: 6, layers: 1, edge: 0, seed: 982, speckle: 10 }, { layer: 'front', t0: .6, dur: .7 });
  sc.inkPoly(quad, { w: 1.6, wob: .45, seed: 983, gap: .3 }, { layer: 'front', t0: .7, dur: .5, stagger: .05 });
  const cx = x + w * .5, cy = y + h * .46;
  sc.wash(ellipse(cx - 24, cy - 4, 20, 24, 16), mix3(PAL.warm, PAL.cream, .5), { a: .34, j: 6, layers: 1, edge: 0, seed: 984 }, { layer: 'front', t0: .9, dur: .6 });
  sc.wash(ellipse(cx + 22, cy, 19, 22, 16), mix3(PAL.pinkPale, PAL.cream, .4), { a: .3, j: 6, layers: 1, edge: 0, seed: 985 }, { layer: 'front', t0: .95, dur: .6 });
  sc.ink([[cx - 40, cy + 22], [cx - 22, cy + 20], [cx - 6, cy + 24]], { w: .9, wob: .4, seed: 986, over: 1, gap: .5 }, { layer: 'front', t0: 1.05, dur: .35, alpha: .4 });
  sc.ink([[cx + 8, cy + 22], [cx + 24, cy + 20], [cx + 38, cy + 24]], { w: .9, wob: .4, seed: 987, over: 1, gap: .5 }, { layer: 'front', t0: 1.1, dur: .35, alpha: .4 });
}
// 杯子
export function cup_(sc, R, o = {}) {
  const x = o.x ?? 900, y = o.y ?? 838, w = o.w ?? 74, h = o.h ?? 86;
  const body = [[x - w / 2, y], [x - w / 2 + 7, y - h], [x + w / 2 - 7, y - h], [x + w / 2, y]];
  sc.wash([[x - w / 2, y + 4], [x + w / 2 + 12, y + 2], [x + w / 2 + 6, y + 20], [x - w / 2 - 6, y + 18]], mix3(PAL.greyLight, PAL.bluePale, .3), { a: .24, j: 4, layers: 1, edge: 0, seed: 990 }, { layer: 'front', t0: .3, dur: .6 });
  sc.fill(body, [253, 251, 244], { layer: 'front', j: 1.5, seed: 991, t0: .4, dur: .1 });
  sc.wash(body, PAL.greyLight, { a: .26, j: 3, layers: 2, edge: .2, seed: 992 }, { layer: 'front', t0: .5, dur: .6 });
  sc.inkPoly(body, { w: 1.7, wob: .4, seed: 993, gap: .2, smooth: false }, { layer: 'front', t0: .6, dur: .5 });
  sc.ink2([[x - w / 2 + 8, y - h + 4], [x + w / 2 - 8, y - h + 3]], { w: 1.5, wob: .3, seed: 994, over: 2 }, { layer: 'front', t0: .75, dur: .35 });
  return { x, y: y - h };
}
