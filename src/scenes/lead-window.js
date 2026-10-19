// Lead 负责的镜头：公寓窗 / 玻璃 / 窗台旧物 / 女生的室内近景
import {
  Scene, PAL, PEN, camTrack, slowCam, ss, seg, clamp, lerp, TAU, rng, n2, fbm,
  hex, mix3, rgba, ellipse, spline, INK, PAPER, handwriteCJK, SUB, dab,
} from '../core.js';
import { windowSet, letter_, photo_, cup_, suitcase_, HER, WIN } from '../sets/window.js';
import { makeGlassDrops, makeFog, makeRain, breathFog, glow, bokeh, makeSplashes, airVeil } from '../fx.js';
import { SPR } from '../sprites.js';
import { drawGirl, drawBoy, herStand, herTouchGlass, herLookUp, herReachOut, herSmileDown, LOOK_HER } from '../character.js';

const G = { floor: HER.floorY, S: HER.S };   // 脚底 y=1032，身高 690

// 把女生放进 Scene 的某一层（dynamic，每帧重画；12fps boil）
function addGirl(sc, layer, poseFn, place, o = {}) {
  sc.dyn((ctx, t) => {
    const pose = poseFn(t);
    const place2 = { x: place.x, y: place.y ?? G.floor, S: place.S ?? G.S, yaw: place.yaw ?? 0, pitch: place.pitch ?? .28 };
    ctx.save();
    if (o.clip) { ctx.beginPath(); o.clip(ctx); ctx.clip(); }
    drawGirl(ctx, pose, place2, {
      seed: o.seed ?? 51, boil: Math.floor(t * 12), face: o.face, eyesOpen: o.eyesOpen,
      tear: o.tear, alpha: o.alpha, ink: o.ink ?? 1, color: o.color ?? 1, lw: o.lw, knit: o.knit,
      clip: null,
    });
    ctx.restore();
  }, layer);
}
// 人物身上的光：窗光/暖灯在轮廓上的一层极淡色
function addRimLight(sc, layer, x, y, S, col, t0 = 1.2) {
  sc.dyn((ctx, t) => {
    const a = clamp((t - t0) / 1.4) * .5;
    if (a <= .01) return;
    const g = ctx.createRadialGradient(x, y - S * .6, S * .1, x, y - S * .6, S * .8);
    g.addColorStop(0, rgba(col, a * .35)); g.addColorStop(1, rgba(col, 0));
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y - S * .6, S * .8, 0, TAU); ctx.fill(); ctx.restore();
  }, layer);
}
// 窗台上的一些水珠（贴台面微距用）
function sillDrops(sc, x0, x1, y0, y1, n, seed) {
  const R = rng(seed);
  const drops = [];
  for (let i = 0; i < n; i++) drops.push({ x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0), r: 2 + R() * 7, tb: R() * 2.4, sp: 8 + R() * 28, ph: R() * TAU, slide: R() < .4 });
  sc.dyn((ctx, t) => {
    const gain = clamp((t - .5) / 1.2);
    if (gain <= .01) return;
    ctx.save();
    for (const d of drops) {
      const age = t - d.tb; if (age < 0) continue;
      const r = Math.min(d.r, d.r * age * 1.4);
      let y = d.y, x = d.x;
      if (d.slide && age > 1.2) { y += (age - 1.2) * d.sp; x += Math.sin(d.ph + age * 2) * 2; }
      if (y > y1 + 20) continue;
      ctx.globalAlpha = gain;
      ctx.fillStyle = rgba(PAL.greyLight, .3); ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.1, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(INK, .4); ctx.lineWidth = Math.max(.7, r * .2); ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.1, .2, .2, TAU - .3); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .35, Math.max(.6, r * .26), 0, TAU); ctx.fill();
      // 高光里的一点彩虹（结尾镜头用）
      if (d.r > 6) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(180,210,200,.18)'; ctx.beginPath(); ctx.ellipse(x + r * .2, y + r * .3, r * .7, r * .5, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }, 'front');
}

// ---------------- 1.1 / 1.2 前奏 ----------------
function shot11() {
  return windowSet({
    weather: 'rain', seed: 101, title: true, titleOut: 4.85,
    props: { letter: true, suitcase: true },
    cam: slowCam({ x: 962, y: 566, z0: 1.0, z1: 1.075, dx: 20, dy: -6, dur: 8.1 }),
  });
}
function shot12() {
  const sc = windowSet({
    weather: 'rain', seed: 102, flatPar: true,
    props: { letter: true, suitcase: false },
    cam: camTrack([[0, [600, 812, 2.0]], [3.6, [652, 818, 2.09]], [8.1, [710, 826, 2.2]]]),
    letterState: { x: 470, y: 800 },
  });
  // 信纸上的水汽 + 一滴滴落下的水
  sc.dyn((ctx, t) => {
    const a = clamp((t - .8) / 1.5);
    if (a <= .01) return;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(560, 830, 10, 560, 830, 240);
    g.addColorStop(0, `rgba(255,253,246,${.16 * a})`); g.addColorStop(1, 'rgba(255,253,246,0)');
    ctx.fillStyle = g; ctx.fillRect(320, 640, 520, 380); ctx.restore();
  }, 'front');
  return sc;
}

// ---------------- 2.1 站在窗边，手触玻璃 ----------------
function shot21() {
  const sc = windowSet({
    weather: 'rain', seed: 201, props: { letter: true, suitcase: true, cup: true }, fogGain: 1,
    cam: camTrack([[0, [880, 546, 1.42], 0], [3.4, [864, 539, 1.445], -.005], [6.9, [846, 532, 1.47], -.01]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => {
    const reach = ss(seg(t, .7, 2.1));
    const breathe = .04 * Math.sin(t * 1.1);
    return herTouchGlass({ reach, headYaw: -.18 + breathe, nod: -.04, hairBlow: .12 + .03 * Math.sin(t * 1.3), lean: .05 });
  }, { x: 640, yaw: -0.92, S: 690, pitch: .26 }, { seed: 201, face: 'profile', eyesOpen: false });
  addRimLight(sc, 'front', 706, 1032, 690, PAL.bluePale, 1.4);
  // 指尖处的呼吸白雾
  sc.dyn((ctx, t) => {
    const a = clamp((t - 1.2) / 1.2);
    if (a <= .01) return;
    breathFog(ctx, t, 700 + 0, 520, 110, 150, { cycle: 4.6, phase: .6, seed: 7, rot: -.1 });
  }, 'mid');
  return sc;
}

// ---------------- 2.2 玻璃倒影：他的剪影 ----------------
function shot22() {
  const sc = windowSet({
    weather: 'rain', seed: 202, props: { letter: true, suitcase: true },
    cam: camTrack([[0, [980, 470, 1.28]], [3.4, [1000, 466, 1.34]], [6.9, [1020, 462, 1.40]]]),
    bakeAt: 3.2,
  });
  // 玻璃里的倒影：他的背影，被雨痕与横向水纹揉碎（永远看不清）
  sc.dyn((ctx, t) => {
    const a = clamp((t - 1.15) / 1.9) * .46;
    if (a <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(WIN.x0 + 24, WIN.y0 + 26, WIN.x1 - WIN.x0 - 48, WIN.y1 - WIN.y0 - 52); ctx.clip();
    drawBoy(ctx, herStand({ headYaw: .12, nod: -.02, lean: .02 }), { x: 690, y: 792, S: 330, yaw: .35, pitch: .2 },
      { seed: 2261, alpha: a, backlight: 0, color: 1, ink: 1 });
    // 横向的水纹：把倒影打碎又聚合
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 14; i++) {
      const y = 380 + i * 26 + Math.sin(t * .55 + i) * 6;
      ctx.fillStyle = rgba([252, 250, 244], .05 + .06 * Math.sin(t * .9 + i));
      ctx.fillRect(WIN.x0 + 30, y, WIN.x1 - WIN.x0 - 60, 7 + Math.sin(t * .7 + i) * 3);
    }
    ctx.restore();
  }, 'mid');
  addGirl(sc, 'front', t => herStand({ headYaw: -.34, nod: -.03, hairBlow: .12, lean: .02 }), { x: 1190, yaw: -2.0, S: 700, pitch: .24 }, { seed: 221, face: 'profile', eyesOpen: true, ink: 1 });
  addRimLight(sc, 'front', 1190, 1032, 700, PAL.bluePale, 1.2);
  return sc;
}
// ---------------- 2.4 侧脸特写：闭眼，泪没有落下 ----------------
function shot24() {
  const sc = windowSet({
    weather: 'rain', seed: 204, props: { letter: false, suitcase: false },
    cam: camTrack([[0, [812, 372, 2.9]], [3.4, [806, 368, 3.0]], [6.9, [800, 363, 3.13]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => {
    const nod = -.06 + .03 * Math.sin(t * .8);
    return herStand({ headYaw: -.5, nod, hairBlow: .18 + .04 * Math.sin(t * 1.5), lean: .02 });
  }, { x: 812, yaw: -1.3, S: 690, pitch: .24 }, { seed: 241, expr: 'tear' });
  addRimLight(sc, 'front', 812, 1032, 690, PAL.bluePale, .8);
  return sc;
}

// ---------------- 2.5 窗外雨幕（画中画） ----------------
function shot25() {
  return windowSet({
    weather: 'rain', seed: 205, rainGain: 1.15, rainN: 340,
    cam: camTrack([[0, [1120, 520, 1.36]], [6.9, [1096, 470, 1.345]]]),
    bakeAt: 3.2,
  });
}

// ---------------- 3.1 窗框特写：雨滴 → 室内的呼吸 ----------------
function shot31() {
  const sc = windowSet({
    weather: 'rain', seed: 301, props: { letter: false, suitcase: false }, dropN: 64,
    cam: camTrack([[0, [1080, 430, 2.05]], [2.0, [1104, 424, 2.14]], [4.01, [1130, 418, 2.23]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => herTouchGlass({ reach: 1, headYaw: -.3, nod: -.05, hairBlow: .08 }), { x: 1480, yaw: -0.9, S: 690 }, { seed: 311, echo: 1 });
  addRimLight(sc, 'front', 1560, 1032, 690, PAL.cream, .9);
  return sc;
}

// ---------------- 3.2 过肩侧脸：呼吸渗入空气 ----------------
function shot32() {
  const sc = windowSet({
    weather: 'rain', seed: 302, props: { letter: true, suitcase: false }, fog: 1.2,
    cam: camTrack([[0, [880, 520, 1.66]], [2.0, [901, 514, 1.7]], [4.01, [922, 508, 1.75]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => {
    const br = .05 * Math.sin(t * 1.05);
    return herStand({ headYaw: -.62 + br, nod: -.04, lean: .03, hairBlow: .15 + .04 * Math.sin(t * 1.4) });
  }, { x: 760, yaw: -1.15, S: 690 }, { seed: 321, face: 'profile', eyesOpen: false });
  addRimLight(sc, 'front', 760, 1032, 690, PAL.bluePale, 1.0);
  sc.dyn((ctx, t) => {
    const a = clamp((t - 1.0) / 1.4); if (a <= .01) return;
    breathFog(ctx, t, 830, 520, 120, 160, { cycle: 4.2, phase: 1.2, seed: 33 });
  }, 'mid');
  return sc;
}

// ---------------- 3.3 室内广角：湿气储存记忆 ----------------
function shot33() {
  const sc = windowSet({
    weather: 'rain', seed: 303, props: { letter: true, suitcase: true, cup: true, photo: true },
    cam: camTrack([[0, [980, 588, .98]], [2.0, [1004, 568, 1.02]], [4.01, [1030, 548, 1.06]]]),
    bakeAt: 3.2,
  });
  // 左侧：挂在墙钩上的旧外套（肩线/袖子/下摆分开画，才像一件衣服）
  sc.wash([[188, 292], [268, 284], [286, 520], [300, 760], [168, 776], [154, 520]], mix3(PAL.coat, PAL.greyDeep, .3), { a: .4, j: 8, layers: 2, edge: .28, seed: 332 }, { layer: 'mid', t0: 1.0, dur: .9 });
  sc.fill([[178, 286], [256, 282], [250, 430], [192, 436]], [252, 249, 241], { layer: 'mid', j: 2, seed: 331, t0: .95, dur: .1 });
  sc.wash([[178, 286], [256, 282], [250, 430], [192, 436]], mix3(PAL.coat, PAL.greyDeep, .35), { a: .36, j: 6, layers: 2, edge: .2, seed: 333 }, { layer: 'mid', t0: 1.05, dur: .8 });
  sc.wash([[272, 300], [330, 330], [344, 470], [300, 470]], mix3(PAL.coat, PAL.greyDeep, .5), { a: .34, j: 6, layers: 1, edge: .15, seed: 336 }, { layer: 'mid', t0: 1.2, dur: .8 });
  sc.ink2([[186, 292], [176, 360], [172, 520], [168, 764]], { w: 2.1, wob: .9, seed: 334, over: 4 }, { layer: 'mid', t0: 1.15, dur: .7, alpha: .85 });
  sc.ink([[176, 360], [166, 540], [162, 772]], { w: 1.5, wob: .8, seed: 3341, gap: .4, over: 2 }, { layer: 'mid', t0: 1.3, dur: .6, alpha: .5 });
  sc.ink2([[182, 292], [182, 318], [266, 314], [268, 296]], { w: 1.9, wob: .6, seed: 335, over: 3 }, { layer: 'mid', t0: 1.25, dur: .5 });
  sc.ink2([[266, 300], [292, 330], [322, 400], [330, 470]], { w: 1.7, wob: .8, seed: 337, gap: .3, over: 3 }, { layer: 'mid', t0: 1.4, dur: .6, alpha: .8 });
  sc.ink([[300, 470], [286, 620], [272, 760]], { w: 1.3, wob: .9, seed: 338, gap: .5, over: 2 }, { layer: 'mid', t0: 1.5, dur: .6, alpha: .5 });
  // 墙钩
  sc.ink([[208, 292], [206, 262], [198, 252]], { w: 2.4, wob: .4, seed: 339, over: 2 }, { layer: 'mid', t0: 1.3, dur: .35 });
  // 墙上的一盏小灯（暖）
  sc.wash([[330, 196], [420, 188], [442, 236], [352, 246]], mix3(PAL.lamp, PAL.cream, .35), { a: .45, j: 4, layers: 1, edge: .2, seed: 336 }, { layer: 'mid', t0: 1.3, dur: .7 });
  sc.dyn((ctx, t) => { const a = clamp((t - 1.5) / 1.5); if (a > .01) glow(ctx, t, 386, 240, 210, PAL.lamp, .3 * a, { breathe: .18, rate: .8 }); }, 'mid');
  // 右下：一把旧椅子，椅背上搭着围巾/枕头（湿气里堆着的记忆）
  const seat = [[1470, 940], [1496, 862], [1690, 856], [1712, 936]];
  sc.wash(seat, mix3(PAL.stone, PAL.grey, .45), { a: .4, j: 8, layers: 2, edge: .25, seed: 340 }, { layer: 'front', t0: 1.35, dur: .8 });
  sc.inkPoly(seat, { w: 2.2, wob: .7, seed: 341, gap: .3 }, { layer: 'front', t0: 1.45, dur: .6, stagger: .06 });
  // 椅背
  const back = [[1500, 866], [1508, 690], [1682, 682], [1690, 858]];
  sc.fill(back, [252, 249, 241], { layer: 'front', j: 2, seed: 345, t0: 1.5, dur: .1 });
  sc.wash(back, mix3(PAL.stone, PAL.grey, .35), { a: .36, j: 7, layers: 2, edge: .22, seed: 346 }, { layer: 'front', t0: 1.6, dur: .8 });
  sc.ink2([[1500, 864], [1508, 692], [1680, 684], [1688, 856]], { w: 2.3, wob: .6, seed: 347, over: 5 }, { layer: 'front', t0: 1.6, dur: .7, alpha: .9 });
  sc.ink([[1528, 860], [1534, 742]], { w: 1.4, wob: .5, seed: 348, gap: .3, over: 2 }, { layer: 'front', t0: 1.75, dur: .5, alpha: .6 });
  sc.ink([[1620, 858], [1616, 746]], { w: 1.4, wob: .5, seed: 349, gap: .3, over: 2 }, { layer: 'front', t0: 1.8, dur: .5, alpha: .6 });
  // 椅子腿
  sc.ink2([[1488, 936], [1472, 1030]], { w: 2.2, wob: .6, seed: 350, over: 3 }, { layer: 'front', t0: 1.8, dur: .5, alpha: .85 });
  sc.ink2([[1696, 934], [1712, 1026]], { w: 2.2, wob: .6, seed: 351, over: 3 }, { layer: 'front', t0: 1.85, dur: .5, alpha: .85 });
  // 椅背上的枕头
  const pil = [[1522, 700], [1660, 692], [1674, 780], [1532, 792]];
  sc.fill(pil, [253, 250, 242], { layer: 'front', j: 2, seed: 342, t0: 1.9, dur: .1 });
  sc.wash(pil, mix3(PAL.cream, PAL.pinkPale, .45), { a: .34, j: 8, layers: 2, edge: .2, seed: 343 }, { layer: 'front', t0: 1.95, dur: .8 });
  sc.inkPoly(pil, { w: 1.9, wob: .6, seed: 344, gap: .3 }, { layer: 'front', t0: 2.0, dur: .6, stagger: .06 });
  sc.wash([[1532, 784], [1668, 772], [1640, 900], [1548, 908]], mix3(PAL.cream, PAL.greyLight, .35), { a: .2, j: 8, layers: 1, edge: 0, seed: 352 }, { layer: 'front', t0: 2.1, dur: .8 });
  return sc;
}

// ---------------- 3.4 窗外：雨滴累积（低角度） ----------------
function shot34() {
  return windowSet({
    weather: 'rain', seed: 304, rainGain: 1.25, rainN: 380, dropN: 70,
    cam: camTrack([[0, [960, 330, 1.5]], [2.0, [984, 322, 1.57]], [4.01, [1008, 314, 1.65]]]),
    bakeAt: 3.2,
  });
}

// ---------------- 3.5 回到窗前，极慢拉远 ----------------
function shot35() {
  const sc = windowSet({
    weather: 'rain', seed: 305, props: { letter: true, suitcase: true }, fog: 1.1,
    cam: camTrack([[0, [860, 540, 1.56]], [2.0, [880, 547, 1.45]], [4.01, [900, 553, 1.33]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => herTouchGlass({ reach: 1, headYaw: -.2, nod: -.05, hairBlow: .12 }), { x: 650, yaw: -0.92, S: 690 }, { seed: 351, face: 'profile', eyesOpen: false });
  addRimLight(sc, 'front', 700, 1032, 690, PAL.bluePale, 1.1);
  return sc;
}

// ---------------- 3.6 窗台水珠特写 ----------------
function shot36() {
  const sc = windowSet({
    weather: 'rain', seed: 306, flatPar: true, props: { letter: true, photo: true, suitcase: false },
    cam: camTrack([[0, [640, 838, 2.3]], [2.0, [704, 842, 2.42]], [4.01, [768, 846, 2.55]]]),
    bakeAt: 3.2,
  });
  sillDrops(sc, 430, 1050, 800, 872, 22, 361);
  sc.dyn((ctx, t) => {
    const a = clamp((t - 1.2) / 1.4);
    if (a > .01) glow(ctx, t, 860, 800, 260, PAL.cream, .18 * a, { breathe: .15, rate: .6 });
  }, 'front');
  return sc;
}

// ---------------- 5.5 抬头看窗外 ----------------
function shot55() {
  const sc = windowSet({
    weather: 'rain', seed: 505, rainGain: .8, rainN: 240, fog: 1.2,
    cam: camTrack([[0, [900, 540, 1.5]], [2.0, [911, 534, 1.56]], [4.15, [922, 528, 1.63]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => herLookUp({ headYaw: -.26, nod: .28, hairBlow: .1 + .03 * Math.sin(t * 1.2) }), { x: 760, yaw: -0.9, S: 690 }, { seed: 551, face: 'profile', eyesOpen: true, ink: .9 });
  addRimLight(sc, 'front', 820, 1032, 690, PAL.cream, 1.2);
  return sc;
}

// ---------------- 5.6 窗台旧物特写 ----------------
function shot56() {
  const sc = windowSet({
    weather: 'rain', seed: 506, flatPar: true, props: { letter: true, photo: true, cup: true, suitcase: false },
    cam: camTrack([[0, [820, 838, 2.1]], [2.0, [884, 834, 2.2]], [4.15, [948, 830, 2.3]]]),
    bakeAt: 3.2,
  });
  sillDrops(sc, 700, 1250, 800, 870, 16, 561);
  // 暖光在纸面上轻轻晕开
  sc.dyn((ctx, t) => {
    const a = clamp((t - 1.0) / 1.6); if (a <= .01) return;
    const g = ctx.createRadialGradient(980, 790, 30, 980, 790, 420);
    g.addColorStop(0, `rgba(255,240,208,${.18 * a})`); g.addColorStop(1, 'rgba(255,240,208,0)');
    ctx.fillStyle = g; ctx.fillRect(560, 560, 900, 480);
  }, 'front');
  return sc;
}

// ---------------- 6.2 过肩侧影：焦点从脸到窗外 ----------------
function shot62() {
  const sc = windowSet({
    weather: 'rain', seed: 602, props: { letter: true, suitcase: true },
    cam: camTrack([[0, [940, 470, 2.0]], [2.0, [955, 462, 2.1]], [4.17, [970, 454, 2.2]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => herStand({ headYaw: -.5, nod: -.02, lean: .02, hairBlow: .14 }), { x: 1230, yaw: -1.95, S: 700, pitch: .24 }, { seed: 621, face: 'profile', eyesOpen: false });
  addRimLight(sc, 'front', 1230, 1032, 700, PAL.bluePale, .9);
  return sc;
}

// ---------------- 7.1 窗内特写：雨痕与水珠 ----------------
function shot71() {
  return windowSet({
    weather: 'rain', seed: 701, dropN: 60, rainN: 300,
    cam: camTrack([[0, [1040, 400, 2.3]], [2.2, [1068, 392, 2.42]], [4.49, [1098, 384, 2.55]]]),
    bakeAt: 3.2,
  });
}

// ---------------- 7.2 过肩侧脸：呼吸像雨滴渗入空气 ----------------
function shot72() {
  const sc = windowSet({
    weather: 'rain', seed: 702, props: { letter: true, suitcase: false }, fog: 1.3,
    cam: camTrack([[0, [860, 510, 1.7]], [2.2, [880, 504, 1.76]], [4.49, [900, 498, 1.83]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => {
    const br = .06 * Math.sin(t * 1.1);
    return herStand({ headYaw: -.6 + br, nod: -.03, lean: .03, hairBlow: .18 + .05 * Math.sin(t * 1.5) });
  }, { x: 690, yaw: -0.92, S: 690 }, { seed: 721, face: 'profile', eyesOpen: false });
  addRimLight(sc, 'front', 750, 1032, 690, PAL.bluePale, 1.0);
  sc.dyn((ctx, t) => { const a = clamp((t - 1.1) / 1.4); if (a > .01) breathFog(ctx, t, 820, 520, 130, 170, { cycle: 4.4, phase: .4, seed: 73 }); }, 'mid');
  return sc;
}

// ---------------- 7.4 窗外：雨势渐小 ----------------
function shot74() {
  return windowSet({
    weather: 'rain', seed: 704, rainGain: .7, rainN: 210, dropN: 56,
    cam: camTrack([[0, [980, 320, 1.55]], [1.9, [1004, 314, 1.61]], [3.74, [1028, 308, 1.68]]]),
    bakeAt: 3.2,
  });
}

// ---------------- 7.5 伸手接窗沿的雨水（手部特写） ----------------
function shot75() {
  const sc = windowSet({
    weather: 'rain', seed: 705, flatPar: true, props: { letter: true, suitcase: false },
    cam: camTrack([[0, [905, 800, 2.2]], [1.9, [930, 806, 2.34]], [3.74, [956, 812, 2.48]]]),
    bakeAt: 3.2,
  });
  // 手：直接用用户提供的手部素材（只取手指+手掌，袖子/前臂另外补），接窗沿滴下的雨
  sc.dyn((ctx, t) => {
    const a = clamp((t - .5) / 1.1);
    if (a <= .01) return;
    const hx = 930 + 6 * Math.sin(t * .7), hy = 812;
    ctx.save(); ctx.globalAlpha = a;
    // 手部素材
    const img = SPR.hand;
    if (img) {
      const cropH = img.height * .88;
      const handH = 300;
      const handW = img.width * (handH / cropH);
      const top = hy - handH * .42;
      ctx.filter = 'saturate(.96) contrast(.99)';
      ctx.drawImage(img, 0, 0, img.width, cropH, hx - handW / 2, top, handW, handH);
      ctx.filter = 'none';
    }
    // 袖子/袖口（盖住手素材下缘的平切边，从画面下缘伸上来）
    const sleeveCx = hx + 22;
    ctx.beginPath();
    ctx.moveTo(sleeveCx - 44, 975); ctx.lineTo(sleeveCx - 52, 1110);
    ctx.lineTo(sleeveCx + 60, 1110); ctx.lineTo(sleeveCx + 46, 975); ctx.closePath();
    ctx.fillStyle = rgba(mix3(PAL.coat, PAL.cream, .28), .97); ctx.fill();
    ctx.strokeStyle = rgba(INK, .55); ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = rgba(INK, .28); ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const yy = 988 + i * 22;
      ctx.beginPath(); ctx.moveTo(sleeveCx - 42 + i * 3, yy); ctx.lineTo(sleeveCx + 44 - i * 3, yy); ctx.stroke();
    }
    // 掌心的水 + 一滴正在落下
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createRadialGradient(hx - 4, hy + 26, 2, hx - 4, hy + 26, 52);
    g.addColorStop(0, 'rgba(150,182,196,.38)'); g.addColorStop(1, 'rgba(150,182,196,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(hx - 4, hy + 26, 52, 18, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 3; k++) {
      const u = ((t * .9 + k * .33) % 1);
      const yy = hy - 170 + u * 190, xx = hx - 30 + k * 30;
      ctx.globalAlpha = a * (1 - u) * .85;
      ctx.fillStyle = 'rgba(255,255,255,.65)';
      ctx.beginPath(); ctx.ellipse(xx, yy, 2.4, 4.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(INK, .4); ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(xx, yy - 8 - u * 8); ctx.lineTo(xx, yy - 4); ctx.stroke();
    }
    ctx.restore();
  }, 'front');
  sillDrops(sc, 720, 1140, 780, 862, 16, 752);
  sc.dyn((ctx, t) => { const a = clamp((t - .8) / 1.4); if (a > .01) glow(ctx, t, 960, 800, 300, PAL.cream, .2 * a, { breathe: .16, rate: .7 }); }, 'front');
  return sc;
}
// ---------------- 7.6 低头微笑，雾气消散 ----------------
function shot76() {
  const sc = windowSet({
    weather: 'rain', seed: 706, rainGain: .55, rainN: 170, fog: .7, props: { letter: true, suitcase: true },
    cam: camTrack([[0, [860, 540, 1.46]], [1.9, [872, 546, 1.5]], [3.74, [884, 552, 1.55]]]),
    bakeAt: 3.2,
  });
  addGirl(sc, 'front', t => herSmileDown({ headYaw: -.2, nod: -.14 + .02 * Math.sin(t), hairBlow: .08 }), { x: 680, yaw: -0.95, S: 690 }, { seed: 761, face: 'profile', eyesOpen: false, tear: false });
  addRimLight(sc, 'front', 740, 1032, 690, PAL.cream, 1.2);
  return sc;
}

export const SCENES = {
  '1.1': shot11, '1.2': shot12, '5.4': shot54, '8.2': shot82, 'dbg-face': dbgFace, 'dbg-face2': dbgFace2, 'dbg-body': dbgBody,
  '2.3': shot23_photo, '6.1': shot61_photo, '7.3': shot73_photo, '5.1': shot51_photo, '5.2': shot52_photo, '5.3': shot53_photo,
  '2.1': shot21, '2.2': shot22, '2.4': shot24, '2.5': shot25,
  '3.1': shot31, '3.2': shot32, '3.3': shot33, '3.4': shot34, '3.5': shot35, '3.6': shot36,
  '5.5': shot55, '5.6': shot56,
  '6.2': shot62,
  '7.1': shot71, '7.2': shot72, '7.4': shot74, '7.5': shot75, '7.6': shot76,
};

// ================= 5.4 / 8.2 窗外云层（纯天空，无窗框） =================
// 自己搭一页"天空速写"：柔和的淡彩云、雨丝、云缝光柱、极淡彩虹。比单独布景更干净。
function skyWide(o = {}) {
  const W = 2200, H = 1240;
  const sc = new Scene({ w: W, h: H, base: { x: 1100, y: 620 }, layers: [{ id: 'back', par: .5 }, { id: 'mid', par: .85 }, { id: 'front', par: 1 }] });
  const R = rng(o.seed ?? 901);
  sc.fill([[0, 0], [W, 0], [W, H], [0, H]], [253, 251, 245], { layer: 'back', j: 2, seed: 1, t0: 0, dur: 0 });
  // 天光：上冷下暖
  sc.wash([[0, 0], [W, 0], [W, H], [0, H]], mix3(PAL.bluePale, PAL.greyLight, .38), { a: .44, j: 60, layers: 2, edge: 0, seed: 11, freq: .004, speckle: 44 }, { layer: 'back', t0: .05, dur: 1.2 });
  sc.wash([[0, H * .42], [W, H * .38], [W, H], [0, H]], mix3(PAL.cream, PAL.warm, .42), { a: .32, j: 52, layers: 2, edge: 0, seed: 12 }, { layer: 'back', t0: .25, dur: 1.3 });
  // 云团：每团 4 层柔和淡彩（上亮下冷紫），没有硬白块
  const cloud = (cx, cy, rx, ry, a, sd) => {
    for (let k = 0; k < 3; k++) {
      const dx = (k - 1) * rx * .34, dy = ry * (.22 + k * .2);
      sc.wash(ellipse(cx + dx, cy + dy, rx * (.62 + .12 * R()), ry * .52, 20), mix3(PAL.greyLight, PAL.violet, .3 - k * .05),
        { a: a * (1 - k * .12), j: 18, layers: 1, edge: 0, seed: sd + k, speckle: 14 }, { layer: 'back', t0: .35 + R() * .5, dur: .9 });
    }
    // 受光上缘
    sc.wash(ellipse(cx - rx * .16, cy - ry * .28, rx * .58, ry * .38, 18), [255, 255, 251], { a: a * .85, j: 16, layers: 1, edge: 0, seed: sd + 7 }, { layer: 'back', t0: .5 + R() * .4, dur: .8 });
    sc.wash(ellipse(cx + rx * .3, cy - ry * .18, rx * .26, ry * .24, 14), [255, 255, 253], { a: a * .5, j: 12, layers: 1, edge: 0, seed: sd + 9 }, { layer: 'back', t0: .6 + R() * .3, dur: .7 });
    // 云缘：几笔很轻的断线（不是描边）
    for (let k = 0; k < 2; k++) {
      const a0 = Math.PI * (.2 + R() * .6), rr = rx * (.75 + R() * .2);
      const px = cx + Math.cos(a0) * rr, py = cy + Math.sin(a0) * ry * .62;
      sc.ink([[px, py], [px + rx * .16, py - ry * .04], [px + rx * .3, py + ry * .02]], { w: 1.0, wob: .45, seed: sd + 20 + k, over: 2, gap: .4 }, { layer: 'back', t0: .7 + R() * .5, dur: .5, alpha: .28 });
    }
  };
  const cl = o.clouds ?? [
    [430, 250, 380, 118, .3], [1120, 190, 460, 140, .32], [1810, 300, 360, 110, .28],
    [700, 470, 340, 96, .24], [1420, 520, 400, 104, .22], [2000, 540, 300, 86, .2],
    [300, 640, 320, 84, .18], [980, 700, 420, 90, .16],
  ];
  cl.forEach((c, i) => cloud(c[0], c[1], c[2], c[3], c[4], 1200 + i * 40));
  // 云缝：一道被光打亮的空（8.2）
  if (o.crack) {
    sc.wash([[980, 100], [1350, 70], [1420, 300], [1080, 360]], [255, 253, 247], { a: .6, j: 24, layers: 2, edge: 0, seed: 1500 }, { layer: 'back', t0: .4, dur: 1.2 });
    sc.wash([[900, 120], [1450, 70], [1560, 380], [1000, 440]], mix3(PAL.cream, PAL.warm, .35), { a: .16, j: 30, layers: 1, edge: 0, seed: 1501 }, { layer: 'back', t0: .7, dur: 1.4 });
  }
  // 远处屋脊（5.4）
  if (o.roofs !== false) {
    for (let i = 0; i < 9; i++) {
      const x = -40 + i * 260 + R() * 50, w = 90 + R() * 110, top = H - 210 + R() * 50;
      const poly = [[x - w, H + 20], [x - w, top], [x - w * .5, top - 16], [x + w * .3, top - 8], [x + w, top + 10], [x + w, H + 20]];
      sc.wash(poly, mix3(PAL.stoneCool, PAL.blueDeep, .4), { a: .34, j: 10, layers: 1, edge: .12, seed: 1600 + i }, { layer: 'back', t0: 1.0 + i * .05, dur: .6 });
      sc.ink2([[x - w, top + 2], [x - w * .5, top - 14], [x + w * .3, top - 6], [x + w, top + 10]], { w: 1.4, wob: .6, seed: 1610 + i, over: 4 }, { layer: 'back', t0: 1.1 + i * .05, dur: .4, alpha: .7 });
    }
  }
  // 雨丝（渐小）
  const rain = makeRain({ seed: (o.seed ?? 901) + 5, n: o.rainN ?? 300, w: W, h: H, slant: .3 });
  sc.dyn((ctx, t) => {
    const g = (o.rainA ?? 1) * (o.rainFade ? clamp(1 - (t - o.rainFade[0]) / (o.rainFade[1] - o.rainFade[0])) : 1) * clamp(t / 1.2);
    if (g <= .01) return;
    rain(ctx, t, { w: W, h: H, alpha: .9 * g, col: mix3(PAL.greyDeep, PAL.blueDeep, .3), wMul: 1.2 });
  }, 'back');
  // 云层缓慢漂移（几团半透明云影横移）
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5; i++) {
      const x = ((350 + i * 480 + t * (10 + i * 4)) % (W + 500)) - 250, y = 180 + i * 150;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 260);
      g.addColorStop(0, `rgba(255,254,248,${.1 + .03 * Math.sin(t * .5 + i)})`); g.addColorStop(1, 'rgba(255,254,248,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 300, 90, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'mid');
  // 云缝里的暖光（8.2）：一小团呼吸的暖核
  if (o.crack) {
    sc.dyn((ctx, t) => {
      const a = clamp((t - .5) / 1.8);
      if (a <= .01) return;
      const g = ctx.createRadialGradient(1170, 290, 10, 1170, 290, 420);
      g.addColorStop(0, 'rgba(255,242,206,' + (.3 * a * (1 + .09 * Math.sin(t * .8))) + ')');
      g.addColorStop(.45, 'rgba(255,244,214,' + (.13 * a) + ')');
      g.addColorStop(1, 'rgba(255,244,214,0)');
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(600, 0, 1200, 900); ctx.restore();
    }, 'back');
  }
  // 光柱（8.2）：从云缝打下，呼吸
  if (o.beam) {
    sc.dyn((ctx, t) => {
      const a = clamp((t - .8) / 2.2);
      if (a <= .01) return;
      ctx.save();
      for (let k = 0; k < 5; k++) {
        const bx = 1080 + k * 58, g = ctx.createLinearGradient(bx, 160, bx - 260, H);
        g.addColorStop(0, `rgba(255,247,226,${(0.2 - k * .03) * a * (1 + .08 * Math.sin(t * .9 + k * 1.6))})`);
        g.addColorStop(.5, `rgba(255,247,226,${(0.09 - k * .013) * a})`);
        g.addColorStop(1, 'rgba(255,247,226,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - 26 - k * 24, 150); ctx.lineTo(bx + 52 - k * 20, 140);
        ctx.lineTo(bx - 120 - k * 70, H + 30); ctx.lineTo(bx - 360 - k * 90, H + 30);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }, 'mid');
  }
  // 极淡彩虹（8.2 尾段）
  if (o.rainbow) {
    const COLS = [[230, 184, 176], [236, 200, 156], [234, 222, 166], [194, 214, 184], [176, 200, 220], [188, 182, 216], [222, 188, 212]];
    sc.dyn((ctx, t) => {
      const u = clamp((t - (o.rainbow.t0 ?? 2.8)) / ((o.rainbow.t1 ?? 5.0) - (o.rainbow.t0 ?? 2.8)));
      if (u <= 0) return;
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      const bw = 18, rr = o.rainbow.r ?? 760, cx = o.rainbow.cx ?? 1150, cy = o.rainbow.cy ?? 1250;
      const a0 = Math.PI + .12, a1 = TAU - .12, span = (a1 - a0) * clamp(u * 1.1);
      for (let i = 0; i < COLS.length; i++) {
        const c = COLS[i];
        ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${(o.rainbow.a ?? .1) * u})`;
        ctx.lineWidth = bw;
        ctx.beginPath(); ctx.arc(cx, cy, rr - i * bw * .95, a0, a0 + span); ctx.stroke();
      }
      ctx.restore();
    }, 'back');
  }
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? slowCam({ x: 1100, y: 640, z0: 1.0, z1: 1.05, dy: -60, dx: 40, dur: 4.2 });
  return sc;
}

function shot54() {
  return skyWide({
    seed: 541, crack: false, roofs: true, rainN: 320, rainA: 1, beam: false, rainbow: false,
    clouds: [[420, 250, 360, 112, .3], [1080, 200, 440, 132, .32], [1760, 300, 340, 104, .28], [700, 470, 330, 92, .24], [1400, 520, 380, 100, .22], [260, 650, 300, 82, .18]],
    cam: camTrack([[0, [1100, 680, 1.0]], [2.0, [1120, 640, 1.03]], [4.15, [1150, 596, 1.06]]]),
  });
}
function shot82() {
  return skyWide({
    seed: 821, crack: true, roofs: false, rainN: 240, rainA: 1, rainFade: [1.2, 3.6], beam: true,
    rainbow: { t0: 2.2, t1: 4.8, cx: 1160, cy: 1160, r: 660, a: .16 },
    clouds: [[380, 220, 380, 120, .32], [1060, 160, 480, 140, .34], [1800, 240, 400, 118, .3], [620, 500, 360, 98, .26], [1500, 480, 420, 104, .24], [240, 640, 320, 86, .2]],
    cam: camTrack([[0, [1080, 660, 1.0]], [2.5, [1120, 620, 1.03]], [5.01, [1160, 570, 1.06], .006]]),
  });
}

// ================= 调试用：头部/表情检查表（?shot=dbg-face） =================
function dbgFace() {
  const sc = new Scene({ w: 1920, h: 1080, layers: [{ id: 'front', par: 1 }] });
  sc.fill([[-10, -10], [1930, -10], [1930, 1090], [-10, 1090]], PAL.paper, { layer: 'front', j: 2, seed: 9, t0: 0, dur: 0 });
  const S = 860, fy = 1215;
  const cases = [
    { x: 175, yaw: 0.0, expr: 'calm' },
    { x: 470, yaw: -0.72, expr: 'calm' },
    { x: 765, yaw: -1.62, expr: 'down' },
    { x: 1060, yaw: -2.36, expr: 'calm' },
    { x: 1350, yaw: Math.PI, expr: 'smile' },
    { x: 1650, yaw: 2.36, expr: 'tear' },
  ];
  sc.dyn((ctx, t) => {
    cases.forEach((cs, i) => {
      const pose = herStand({ headYaw: 0, nod: i === 3 ? -.06 : 0 });
      drawGirl(ctx, pose, { x: cs.x, y: fy, S, yaw: cs.yaw, pitch: .26 }, { seed: 40 + i, boil: 0, expr: cs.expr });
    });
  }, 'front');
  sc.finish(0.1);
  sc.cam = () => ({ cx: 960, cy: 560, z: 1, rot: 0 });
  return sc;
}

// 大尺寸脸部检查：四个角度/表情（?shot=dbg-face2）
function dbgFace2() {
  const sc = new Scene({ w: 1920, h: 1080, layers: [{ id: 'front', par: 1 }] });
  sc.fill([[-10, -10], [1930, -10], [1930, 1090], [-10, 1090]], PAL.paper, { layer: 'front', j: 2, seed: 9, t0: 0, dur: 0 });
  const cases = [
    { x: 742, y: 2437, S: 1500, yaw: -2.75, expr: 'calm' },   // 3/4 front-left
    { x: 1178, y: 2437, S: 1500, yaw: -1.52, expr: 'down' },  // profile left, eyes closed
  ];
  sc.dyn((ctx, t) => {
    cases.forEach((cs, i) => {
      drawGirl(ctx, herStand({ headYaw: 0, nod: i === 1 ? -.04 : 0 }), { x: cs.x, y: cs.y, S: cs.S, yaw: cs.yaw, pitch: .26 }, { seed: 70 + i, boil: 0, expr: cs.expr });
    });
  }, 'front');
  sc.finish(0.1);
  sc.cam = () => ({ cx: 960, cy: 1080, z: 2, rot: 0 });
  return sc;
}

// 人物全身比例检查（?shot=dbg-body）：4 个角度 + 八头身参考线
function dbgBody() {
  const sc = new Scene({ w: 1920, h: 1080, layers: [{ id: 'front', par: 1 }] });
  sc.fill([[-10, -10], [1930, -10], [1930, 1090], [-10, 1090]], PAL.paper, { layer: 'front', j: 2, seed: 9, t0: 0, dur: 0 });
  sc.dyn((ctx, t) => {
    const S = 700, fy = 1012;
    const hl = 2.04 * .063 * S;   // 头长（含发顶到下巴）
    ctx.save(); ctx.strokeStyle = 'rgba(120,150,170,.28)'; ctx.lineWidth = 1; ctx.setLineDash([7, 9]);
    for (let i = 0; i <= 8; i++) { const y = fy - hl * i; ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(1890, y); ctx.stroke(); }
    ctx.restore();
    const cases = [
      { x: 280, yaw: Math.PI, expr: 'calm' },
      { x: 760, yaw: -2.45, expr: 'calm' },
      { x: 1240, yaw: -1.55, expr: 'down' },
      { x: 1700, yaw: 0, expr: 'calm' },
    ];
    cases.forEach((cs, i) => {
      drawGirl(ctx, herStand({ headYaw: 0 }), { x: cs.x, y: fy, S, yaw: cs.yaw, pitch: .22 }, { seed: 90 + i, boil: 0, expr: cs.expr });
    });
  }, 'front');
  sc.finish(0.1);
  sc.cam = () => ({ cx: 960, cy: 540, z: 1, rot: 0 });
  return sc;
}

// ================= 用参考插画直接做的室内镜头（2.3 / 6.1 / 7.3 / 5.1） =================
// 用户提供的整幅室内插画（assets/char/room_scene.png）直接用作场景，
// 只做缓慢的推拉/横移 + 纸色与胶片调色，让画面动起来。
function photoRoom(cfg) {
  const dur = cfg.dur ?? 4.5;
  const sc = new Scene({ w: 1920, h: 1080, layers: [{ id: 'front', par: 1 }] });
  sc.fill([[-10, -10], [1930, -10], [1930, 1090], [-10, 1090]], PAL.paper, { layer: 'front', t0: 0, dur: 0 });
  sc.dyn((ctx, t) => {
    const img = SPR.room_scene;
    if (!img) return;
    const u = clamp(t / dur);
    const e = u * u * (3 - 2 * u);
    const c0 = cfg.from, c1 = cfg.to;
    const fx = lerp(c0[0], c1[0], e), fy = lerp(c0[1], c1[1], e);
    const fw = lerp(c0[2], c1[2], e), fh = lerp(c0[3], c1[3], e);
    // 插画缩放到取景框（cover），并做轻微纸色/胶片调色
    const iw = img.width, ih = img.height;
    const ar = 1920 / 1080;
    let sw = fw * iw, sh = fh * ih;
    if (sw / sh > ar) { sw = sh * ar; } else { sh = sw / ar; }
    const sx = fx * iw, sy = fy * ih;
    ctx.save();
    ctx.filter = 'saturate(.93) contrast(.98) brightness(1.02)';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 1920, 1080);
    ctx.filter = 'none';
    // 纸色/冷暖统一
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(0, 0, 0, 1080);
    g.addColorStop(0, 'rgba(236,226,208,.18)');
    g.addColorStop(.55, 'rgba(232,226,216,.12)');
    g.addColorStop(1, 'rgba(214,214,222,.14)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(248,241,226,.06)'; ctx.fillRect(0, 0, 1920, 1080);
    // 底部字幕带留白（让字幕有干净底）
    const vg = ctx.createLinearGradient(0, 900, 0, 1080);
    vg.addColorStop(0, 'rgba(248,241,226,0)'); vg.addColorStop(1, 'rgba(248,241,226,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 900, 1920, 180);
    ctx.restore();
  }, 'front');
  sc.finish(0.1);
  sc.cam = () => ({ cx: 960, cy: 540, z: 1, rot: 0 });
  return sc;
}

// 每个镜头在整幅插画里的取景（image 坐标 0..1）
function shot23_photo() { return photoRoom({ dur: 6.93, from: [.32, .16, .58, .62], to: [.36, .24, .46, .5] }); }
function shot61_photo() { return photoRoom({ dur: 4.17, from: [.42, .30, .48, .54], to: [.46, .40, .38, .44] }); }
function shot73_photo() { return photoRoom({ dur: 3.74, from: [.03, .02, .94, .80], to: [.10, .05, .82, .72] }); }
function shot51_photo() { return photoRoom({ dur: 6.92, from: [.62, .20, .36, .52], to: [.68, .26, .28, .40] }); }

function shot52_photo() { return photoRoom({ dur: 6.92, from: [.60, .34, .32, .42], to: [.64, .38, .24, .32] }); }
function shot53_photo() { return photoRoom({ dur: 6.92, from: [.24, .43, .36, .26], to: [.26, .47, .30, .22] }); }
