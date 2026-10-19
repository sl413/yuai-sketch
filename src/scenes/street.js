// 城市街巷外景 7 个镜头（set-street 维护）
//   4.1 城市街巷中景：低角度跟拍 + 轻左摇，她撑伞独行，水洼倒影波动（12.21s，纯器乐间奏）
//   4.2 水洼倒影特写：贴地极慢横移 + 轻下压，倒映路灯与她的剪影，最后焦点到鞋尖（12.21s）
//   4.3 她停在路口：固定中景 + 极慢推近，呼出白雾，雨点在伞面溅开，雾气沿伞沿流动（10.99s）
//   4.4 空荡街角：极慢拉远 + 轻上摇，男生背影在远处路灯下模糊成剪影，她没有追（10.99s）
//   6.3 街巷雨夜：低角度跟拍 + 轻右摇，她撑伞走过路灯，暖光在湿地面晕开（3.65s）
//   6.4 街角远景：固定广角 + 极慢拉远，雨丝被风吹斜，远处车灯晕成暖色光斑（3.65s）
//   9.3 窗外街巷：固定广角 + 极慢拉远，雨停了，湿路面倒映天空与淡彩虹，行人成简笔（8.51s）
import {
  Scene, PAL, slowCam, camTrack, clamp, lerp, ss, seg, pulse, TAU, rng, mix3, rgba,
} from '../core.js';
import {
  laneSet, puddleSet, crossingSet, cornerSet, wideSet,
} from '../sets/street.js';
import { drawGirl, drawBoy, umbrella, herWalk } from '../character.js';
import { makeRain, breathFog, glow, bokeh } from '../fx.js';

const BR = 960, BC = 540;
// 新时间轴（lead 按实测音频重切）：镜头内秒数
const DUR = { '4.1': 12.21, '4.2': 12.21, '4.3': 10.99, '4.4': 10.99, '6.3': 3.65, '6.4': 3.65, '9.3': 8.51 };

// 把「屏幕上想要的位置/身高」换算成某层的页面坐标（相机+视差之后仍停在想停的地方）
function screenPlace(cam, par, sx, sy, Sscreen) {
  const z = 1 + (cam.z - 1) * par;
  const cx = BR + (cam.cx - BR) * par;
  const cy = BC + (cam.cy - BC) * par;
  return { x: cx + (sx - BR) / z, y: cy + (sy - BC) / z, S: Sscreen / z };
}

// 伞：从画出的手上接过去；伞面雨点 + 湿的伞沿
function umbrellaAt(ctx, t, prims, o = {}) {
  const hand = (o.hand ?? prims.hand?.R) || [0, 0];
  const S = o.S ?? 400;
  const r = o.r ?? S * .52;
  const c = [hand[0] + (o.dx ?? 6), hand[1] - r * .2];
  // 伞柄（墨线，从伞心到手里）
  ctx.save();
  ctx.strokeStyle = 'rgba(43,37,32,.5)';
  ctx.lineWidth = Math.max(1.3, S * .006);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c[0] + 2, c[1] + r * .12); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
  ctx.restore();
  const res = umbrella(ctx, c, r, o.rot ?? -.14, { seed: o.seed ?? 5, lw: Math.max(1.5, r * .022) });
  // 伞布：压一层透明冷色 + 受光侧留白，让伞面立得住（否则只剩骨架浮在纸上）
  if (res.poly && res.poly.length > 2) {
    const pathP = () => { ctx.beginPath(); ctx.moveTo(res.poly[0][0], res.poly[0][1]); for (const p of res.poly) ctx.lineTo(p[0], p[1]); ctx.closePath(); };
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(c[0] - r, c[1] - r * .45, c[0] + r, c[1] + r * .25);
    g.addColorStop(0, 'rgba(176,196,210,.42)');
    g.addColorStop(.45, 'rgba(156,176,194,.30)');
    g.addColorStop(1, 'rgba(120,140,162,.20)');
    ctx.fillStyle = g; pathP(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    const g2 = ctx.createLinearGradient(c[0] - r * .7, c[1] - r * .5, c[0] + r * .1, c[1] + r * .05);
    g2.addColorStop(0, 'rgba(255,253,246,.34)');
    g2.addColorStop(.55, 'rgba(255,253,246,.10)');
    g2.addColorStop(1, 'rgba(255,253,246,0)');
    ctx.fillStyle = g2; pathP(); ctx.fill();
    ctx.restore();
  }
  // 伞面上溅开的雨点
  if (o.splash) {
    const tops = res.top || [];
    const R = rng(o.splashSeed ?? 9);
    ctx.save(); ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const u = (i + .5) / 8;
      const p = tops[Math.min(tops.length - 1, Math.floor(u * (tops.length - 1)))];
      if (!p) continue;
      const cyc = .9 + R() * 1.5, off = R() * 3;
      const q = ((t + off) % cyc) / cyc;
      if (q > .42) continue;
      const a = (1 - q / .42) * (o.splash ?? 1) * .8;
      const L = (2 + q * 9) * (S / 400);
      ctx.strokeStyle = `rgba(255,255,255,${.55 * a})`;
      for (let k = 0; k < 4; k++) {
        const ang = -Math.PI * .5 + (k - 1.5) * .52;
        ctx.globalAlpha = 1; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(p[0], p[1] - 1);
        ctx.lineTo(p[0] + Math.cos(ang) * L, p[1] - 1 + Math.sin(ang) * L * .9); ctx.stroke();
      }
      // 溅开的小水珠
      ctx.fillStyle = `rgba(255,255,255,${.5 * a})`;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(p[0] + (k - 1) * L * 1.1, p[1] - L * .7, 1.1, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }
  // 伞沿流动的雾气
  if (o.mist) {
    const tops = res.top || [];
    ctx.save();
    for (let i = 0; i < tops.length; i += 3) {
      const p = tops[i];
      const a = (.045 + .035 * Math.sin(t * .85 + i * .7)) * o.mist;
      const rr = r * .22;
      const g = ctx.createRadialGradient(p[0], p[1] + 3, 0, p[0], p[1] + 3, rr);
      g.addColorStop(0, `rgba(255,253,247,${a})`);
      g.addColorStop(1, 'rgba(255,253,247,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1] + 3, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // 伞沿滴落后溅在鞋边的水花
  if (o.drips) {
    const R = rng((o.splashSeed ?? 9) + 33);
    ctx.save();
    for (let k = 0; k < 4; k++) {
      const off = R() * 2.4, per = 1.8 + R() * 1.4;
      const q = ((t + off) % per) / per;
      if (q < .55) continue;
      const u = (q - .55) / .45;
      const px = hand[0] + (R() * 2 - 1) * r * .5, py = hand[1] + r * 1.5 + u * 190;
      ctx.strokeStyle = `rgba(150,165,175,${.35 * (1 - u)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1, py + 12); ctx.stroke();
    }
    ctx.restore();
  }
  return { c, r, res, hand };
}

// 地上的湿影子
function wetShadow(ctx, x, y, S, col, a = .16) {
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = rgba(col ?? mix3(PAL.greyDeep, PAL.blue, .35), a);
  ctx.beginPath(); ctx.ellipse(x + S * .04, y + S * .012, S * .21, S * .045, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// 男生走远的背影（不清晰：低 alpha + 逆光 + 雾）
function boyWalkPose(ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return {
    hipY: .515 + .008 * Math.abs(c), lean: .05, twist: .05 * s,
    legL: .3 * s, kneeL: .08 + .38 * Math.max(0, c),
    legR: -.3 * s, kneeR: .08 + .38 * Math.max(0, -c),
    armL: -.24 * s, bendL: .28, armR: .24 * s, bendR: .28, abdL: .07, abdR: .07,
    headYaw: 0, nod: .02, hairBlow: .05,
  };
}

// 脚边：湿地面上的倒影 + 一小块湿的亮斑（第二轮：人物也"站在雨里"）
function feetMirror(ctx, t, P, pose, o = {}) {
  const y0 = P.y + (o.dy ?? 2);
  const shear = (o.shear ?? .014) * Math.sin(t * 1.6 + (o.ph ?? 0));
  ctx.save();
  ctx.beginPath(); ctx.rect(P.x - P.S * 1.3, y0 - 2, P.S * 2.6, P.S * (o.len ?? .42)); ctx.clip();
  ctx.translate(0, y0 * 2); ctx.scale(1, -1);
  ctx.transform(1, 0, shear, 1, 0, 0);
  drawGirl(ctx, pose, { x: P.x, y: y0, S: P.S, yaw: o.yaw ?? 0, pitch: o.pitch ?? .16 },
    { seed: o.seed ?? 91, boil: Math.floor(t * 12), ink: .8, color: .32, alpha: o.alpha ?? .17, knit: false });
  ctx.restore();
  // 脚边的湿亮斑
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, P.S * .32);
  g.addColorStop(0, `rgba(255,250,238,${o.glow ?? .16})`);
  g.addColorStop(.6, `rgba(255,250,238,${(o.glow ?? .16) * .4})`);
  g.addColorStop(1, 'rgba(255,250,238,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(P.x, P.y + 3, P.S * .32, P.S * .1, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// 雨势的呼吸（长镜头用：中段雨更大，结尾收一点）
function gustRain(sc, o, seed, layer, { n = 260, len = 1.15, slant = .5, peak = 8.2, wdt = 2.2, gain = 1.1 } = {}) {
  const rain = makeRain({ seed, n, w: 2200, h: 1320, slant, minLen: 14, maxLen: 38, minSpeed: 540, maxSpeed: 1050 });
  sc.dyn((ctx, t) => {
    const e = clamp(pulse(t, peak, wdt) * 1.15 + .12);
    if (e <= .03) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(-140, -140, 2200, 1040); ctx.clip();
    ctx.translate(-110, -120);
    rain(ctx, t, {
      w: 2200, h: 1320, alpha: e, gain,
      col: mix3(PAL.greyDeep, PAL.blue, .2), lenMul: len,
    });
    ctx.restore();
  }, layer);
}

// ================================================================
// 4.1 城市街巷中景：低角度跟拍 + 轻左摇（12.21s，长镜头，雨在她周围呼吸）
// ================================================================
function shot41() {
  const dur = DUR['4.1'];
  const sc = laneSet({
    seed: 4101, weather: 'rain',
    lamps: [{ x: 1500, yBase: 812, h: 556, dir: -1, rate: 1.05, ph: .6, a: 1.2 }],
    puddles: [
      { x: 700, y: 850, rx: 240, ry: 36, lamp: false, ripN: 5 },
      { x: 1232, y: 798, rx: 170, ry: 24, lamp: true, lampDX: 44, ripN: 4 },
      { x: 962, y: 754, rx: 104, ry: 14, lamp: true, lampDX: -30, ripN: 3 },
    ],
    rainN: 420, rainFrontN: 66, carGain: .8,
    cars: [
      { x: 906, y: 678, r: 30, gap: 22, a: .85, rate: .8, t0: .9, vx: -3 },
      { x: 1130, y: 690, r: 24, gap: 18, a: .7, rate: 1.1, t0: 2.2, vx: -7 },
    ],
    cam: camTrack([
      [0, [938, 549, 1.0], 0],
      [4, [1010, 546, 1.012], .0022],
      [8, [1082, 543, 1.022], .0038],
      [dur, [1156, 540, 1.032], .0056],
    ]),
  });
  // 第二层动态：中后段来一阵更大的雨，伞上噼啪响
  gustRain(sc, null, 4111, 'mid', { n: 300, len: 1.2, slant: .46, peak: 8.4, wdt: 2.4, gain: 1.15 });
  // 人物：低角度跟拍，她一直往前走（走到灯下，暖光从伞面扫过）
  sc.dyn((ctx, t, cam) => {
    const u = t / dur;
    const ph = 1.9 + t * 4.0;
    const P = screenPlace(cam, .82, 892 + 34 * u, 884 - 2 * Math.sin(u * 3.1), 404);
    wetShadow(ctx, P.x, P.y, P.S, undefined, .15);
    const emerge = clamp((t - .35) / 1.5);
    const pose = herWalk(ph, { hairBlow: .2 + .08 * Math.sin(t * .5), nod: -.05 });
    feetMirror(ctx, t, P, pose, { yaw: -.5, pitch: .16, alpha: .16, glow: .18, len: .4 });
    const prims = drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: -.5, pitch: .16 },
      { seed: 11, boil: Math.floor(t * 12), ink: emerge, color: emerge, alpha: 1 });
    // 走近路灯时，暖光从伞面/肩膀扫过（越靠近越亮）
    const nearLamp = clamp(1 - Math.abs(P.x - 1360) / 520) * .5 + .06;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(P.x + P.S * .3, P.y - P.S * .95, P.S * .1, P.x + P.S * .3, P.y - P.S * .95, P.S * 1.15);
    g.addColorStop(0, `rgba(232,199,138,${.14 * nearLamp})`);
    g.addColorStop(1, 'rgba(232,199,138,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x + P.S * .3, P.y - P.S * .95, P.S * 1.15, 0, TAU); ctx.fill();
    ctx.restore();
    umbrellaAt(ctx, t, prims, { S: P.S, r: P.S * .49, rot: -.16, seed: 5, splash: 1, splashSeed: 41, drips: 1 });
  }, 'mid');
  // 第三层：被风斜吹到镜头前的雨（避开字幕安全区）
  return sc;
}

// ================================================================
// 4.2 水洼倒影特写：贴地极慢横移 + 轻下压（12.21s；焦点从倒影转到鞋尖）
// ================================================================
function shot42() {
  const dur = DUR['4.2'];
  const lineY = 298;
  const sc = puddleSet({
    seed: 4202, weather: 'rain', lineY, lampX: 1376,
    rainN: 140, rainFrontN: 30,
    cam: camTrack([
      [0, [932, 512, 1.0], 0],
      [4, [988, 530, 1.004], 0],
      [8, [1050, 546, 1.010], 0],
      [dur, [1112, 560, 1.016], 0],
    ]),
  });
  // 倒影里扫过的一道车灯（暖光在水面横向移过去，倒影被照亮又暗下去）
  sc.dyn((ctx, t) => {
    const u = clamp((t - 6.4) / 3.4);
    if (u <= 0 || u >= 1) return;
    const x = lerp(260, 1700, u), a = Math.sin(u * Math.PI) * .5;
    ctx.save();
    ctx.beginPath(); ctx.rect(-120, lineY + 4, 2160, 760); ctx.clip();
    ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(x - 150, lineY, x + 150, lineY + 320);
    g.addColorStop(0, 'rgba(255,244,220,0)');
    g.addColorStop(.5, `rgba(255,244,220,${.22 * a})`);
    g.addColorStop(1, 'rgba(255,244,220,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 150, lineY, 300, 340);
    // 水面被照亮的碎光
    ctx.fillStyle = `rgba(255,250,236,${.5 * a})`;
    for (let k = 0; k < 14; k++) {
      const yy = lineY + 30 + ((k * 53 + t * 12) % 420);
      ctx.beginPath(); ctx.ellipse(x + (k % 5 - 2) * 26 + Math.sin(t * 3 + k) * 8, yy, 9 - (k % 4), 1.6, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'mid');
  sc.dyn((ctx, t, cam) => {
    const u = t / dur;
    // 真实世界只入画一小截：小腿 + 鞋尖（站在水线边上）
    const P = screenPlace(cam, .82, 812 - 12 * u, lineY - 9, 470);
    const pose = herWalk(.4 + t * .30, { hairBlow: .04 });
    const emerge = clamp((t - .3) / 1.2);
    drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: -.58, pitch: .10 },
      { seed: 21, boil: Math.floor(t * 12), ink: emerge, color: emerge, alpha: 1 });
    // 水里的倒影：绕水线翻转 + 波动剪切 + 低 alpha（雨滴打碎又聚合）
    const shear = .020 * Math.sin(t * 1.9) + .012 * Math.sin(t * 3.3 + 1.1);
    const breakA = .5 + .5 * Math.sin(t * 1.15 + .4);          // 碎 / 聚 的呼吸
    const reflA = lerp(.74, .52, breakA * .8) * (1 - .5 * seg(t, 8.6, 11.4));
    ctx.save();
    ctx.beginPath(); ctx.rect(-140, lineY + 2, 2200, 1200); ctx.clip();
    ctx.translate(0, lineY * 2); ctx.scale(1, -1);
    ctx.transform(1, 0, shear, 1, 0, 0);
    drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: -.58, pitch: .10 },
      { seed: 21, boil: Math.floor(t * 12), ink: .95, color: .5, alpha: reflA, knit: false });
    ctx.restore();
    // 水面上打碎倒影的横向水纹（随雨点移动）
    ctx.save();
    ctx.beginPath(); ctx.rect(-140, lineY + 4, 2200, 1100); ctx.clip();
    for (let k = 0; k < 13; k++) {
      const yy = lineY + 16 + ((k * 61 + t * 9) % 760);
      const a = .3 * (1 - (yy - lineY) / 820);
      ctx.strokeStyle = `rgba(252,250,245,${a})`;
      ctx.lineWidth = 1.6 + (k % 3) * 1.1;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const xx = -60 + i * 260, yy2 = yy + Math.sin(i * .9 + t * 1.7 + k) * 6;
        i ? ctx.lineTo(xx, yy2) : ctx.moveTo(xx, yy2);
      }
      ctx.stroke();
    }
    // 鞋尖落水处的几圈涟漪（强调"鞋尖"这个落点）
    ctx.strokeStyle = 'rgba(90,100,108,.42)'; ctx.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) {
      const per = 2.6 + k * .5, u = ((t + k * 1.1) % per) / per;
      ctx.globalAlpha = (1 - u) * .55;
      ctx.beginPath(); ctx.ellipse(P.x, lineY + 40, 30 + u * 160, (30 + u * 160) * .26, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // 焦点转到鞋尖：结尾给鞋尖一点点暖的湿光
    const focus = seg(t, 8.4, 11);
    if (focus > .01) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(P.x, P.y - P.S * .06, 0, P.x, P.y - P.S * .06, P.S * .2);
      g.addColorStop(0, `rgba(255,246,226,${.4 * focus})`);
      g.addColorStop(.5, `rgba(255,246,226,${.16 * focus})`);
      g.addColorStop(1, 'rgba(255,246,226,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(P.x, P.y - P.S * .05, P.S * .2, P.S * .09, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 水面极淡的暖光（路灯在画外，只在倒影里）
    glow(ctx, t, 1420, lineY + 240, 210, PAL.lamp, .12, { breathe: .25, rate: .8, phase: 1.2 });
  }, 'mid');
  return sc;
}

// ================================================================
// 4.3 她停在路口：固定中景 + 极慢推近（10.99s；呼出白雾 / 伞上溅开 / 伞沿雾气）
// ================================================================
function shot43() {
  const dur = DUR['4.3'];
  const sc = crossingSet({
    seed: 4303, weather: 'rain', crossCx: 902, crossW: 138,
    rainN: 260, rainFrontN: 52,
    cam: slowCam({ x: 934, y: 546, z0: 1.0, z1: 1.072, dx: 10, dy: -6, dur }),
  });
  // 对街扫过的车灯（远景的动态层，让她停下来时世界还在走）
  sc.dyn((ctx, t) => {
    const u = clamp((t - 3.6) / 5.4);
    if (u <= 0 || u >= 1) return;
    const x = lerp(-180, 2100, u), a = Math.sin(u * Math.PI);
    bokeh(ctx, t, [
      { x, y: 672, r: 26, a: .5 * a, col: PAL.lamp, rate: 1.2, ph: .4 },
      { x: x + 44, y: 676, r: 20, a: .42 * a, col: PAL.lamp, rate: 1.4, ph: 1.2 },
    ], { gain: 1 });
    // 车灯在湿路面上的长倒影
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(x, 676, x, 1050);
    g.addColorStop(0, `rgba(240,222,180,${.14 * a})`);
    g.addColorStop(1, 'rgba(240,222,180,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 90, 676, 180, 380);
    ctx.restore();
  }, 'back');
  sc.dyn((ctx, t, cam) => {
    const u = t / dur;
    const P = screenPlace(cam, .82, 878, 690, 396);
    const sway = .05 * Math.sin(t * .8) + .02 * Math.sin(t * 1.7);
    const pose = herWalk(.42 + sway, { hairBlow: .12 + .05 * Math.sin(t * .7), nod: -.02 });
    feetMirror(ctx, t, P, pose, { yaw: -1.16, pitch: .15, alpha: .11, glow: .13, len: .3, shear: .01 });
    const prims = drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: -1.16, pitch: .15 },
      { seed: 31, boil: Math.floor(t * 12), ink: 1, color: 1, face: 'profile', eyesOpen: true });
    umbrellaAt(ctx, t, prims, {
      S: P.S, r: P.S * .47, rot: -.12 + .02 * Math.sin(t * .6), seed: 7, splash: 1.1, splashSeed: 43, mist: 1, drips: 1,
    });
    // 呼出的白雾（在她脸前，向左飘一点）
    const h = prims.head || { c: [P.x, P.y - P.S], r: P.S * .06, fwd: [-1, 0, 0] };
    const fx = h.fwd ? h.fwd[0] : -1;
    const bx = h.c[0] + fx * h.r * 2.1;
    const by = h.c[1] + h.r * .85;
    breathFog(ctx, t, bx, by, h.r * 1.5, h.r * .95, { cycle: 4.4, phase: 1.2, seed: 43 });
    breathFog(ctx, t, bx - h.r * 1.4, by + h.r * .2, h.r * 1.9, h.r * .8, { cycle: 5.6, phase: 2.9, seed: 44 });
    // 贴着湿地面的一层冷雾
    ctx.save();
    const g = ctx.createLinearGradient(0, P.y - 40, 0, P.y + 120);
    g.addColorStop(0, 'rgba(255,253,247,0)');
    g.addColorStop(.55, `rgba(255,253,247,${.10 + .03 * Math.sin(t * .7)})`);
    g.addColorStop(1, 'rgba(255,253,247,0)');
    ctx.fillStyle = g; ctx.fillRect(P.x - P.S * 1.2, P.y - 40, P.S * 2.4, 160);
    ctx.restore();
    wetShadow(ctx, P.x, P.y, P.S, undefined, .14);
  }, 'mid');
  return sc;
}

// ================================================================
// 4.4 空荡街角：极慢拉远 + 轻上摇（10.99s；冷蓝加重，他没有回头）
// ================================================================
function shot44() {
  const dur = DUR['4.4'];
  const sc = cornerSet({
    seed: 4404, weather: 'cold', slant: .5,
    rainN: 230, rainFrontN: 40,
    lamp: { x: 1150, yBase: 700, h: 430, dir: -1, rate: .95, ph: 1.2, a: 1.7 },
    puddles: [
      { x: 760, y: 872, rx: 300, ry: 42, lamp: true, ripN: 5 },
      { x: 1420, y: 762, rx: 170, ry: 24, lamp: false, ripN: 3 },
    ],
    cam: slowCam({ x: 962, y: 550, z0: 1.078, z1: 1.0, dx: -14, dy: -20, dur, rot: -.002 }),
  });
  // 男生：远处路灯下的背影，慢慢走远、淡进雾里（永远看不清、不正面）
  sc.dyn((ctx, t, cam) => {
    const u = t / dur;
    const B = screenPlace(cam, .82, 1118 + 26 * u, 706 + 4 * u, 138 - 7 * u);
    const fade = 1 - .55 * seg(t, 5.4, 10.4);
    drawBoy(ctx, boyWalkPose(t * 2.4 + .4), { x: B.x, y: B.y, S: B.S, yaw: .04, pitch: .18 },
      { seed: 61, boil: Math.floor(t * 12), alpha: .5 * fade, color: .62, ink: .75, backlight: 1 });
    // 他在湿地面上的倒影（更淡，和雾一起化掉）
    ctx.save();
    ctx.beginPath(); ctx.rect(B.x - B.S * 1.3, B.y - 2, B.S * 2.6, B.S * .55); ctx.clip();
    ctx.translate(0, B.y * 2); ctx.scale(1, -1);
    drawBoy(ctx, boyWalkPose(t * 2.4 + .4), { x: B.x, y: B.y, S: B.S, yaw: .04, pitch: .18 },
      { seed: 61, boil: Math.floor(t * 12), alpha: .15 * fade, color: .55, ink: .55 });
    ctx.restore();
    // 一层很淡的雨雾盖住他，让他永远糊着
    ctx.save();
    const g = ctx.createRadialGradient(B.x, B.y - B.S * .5, B.S * .2, B.x, B.y - B.S * .5, B.S * 1.1);
    g.addColorStop(0, `rgba(250,250,246,${.2 * fade})`);
    g.addColorStop(.65, `rgba(250,250,246,${.09 * fade})`);
    g.addColorStop(1, 'rgba(250,250,246,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(B.x, B.y - B.S * .5, B.S * 1.0, B.S * .85, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }, 'mid');
  // 她：近处左下，站着没有追（背对镜头，只有头发在风里动）
  sc.dyn((ctx, t, cam) => {
    const P = screenPlace(cam, .82, 330, 872, 344);
    const pose = herWalk(.35 + .045 * Math.sin(t * .7), { hairBlow: .12 + .07 * Math.sin(t * 1.1), nod: -.03 });
    feetMirror(ctx, t, P, pose, { yaw: .22, pitch: .16, alpha: .12, glow: .12, len: .34 });
    const prims = drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: .22, pitch: .16 },
      { seed: 41, boil: Math.floor(t * 12), ink: 1, color: 1, alpha: 1 });
    umbrellaAt(ctx, t, prims, { S: P.S, r: P.S * .47, rot: .12, seed: 8, splash: .7, splashSeed: 44, drips: 1 });
    wetShadow(ctx, P.x, P.y, P.S, undefined, .13);
  }, 'mid');
  // 冷蓝加重（前层极淡的冷色罩，不压黑）
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, -100, 0, 1100);
    g.addColorStop(0, `rgba(148,174,205,${.06 + .014 * Math.sin(t * .5)})`);
    g.addColorStop(.55, 'rgba(148,174,205,.035)');
    g.addColorStop(1, 'rgba(180,195,210,.02)');
    ctx.fillStyle = g; ctx.fillRect(-160, -120, 2240, 1280);
    ctx.restore();
  }, 'front');
  return sc;
}

// ================================================================
// 6.3 街巷雨夜：低角度跟拍 + 轻右摇（3.65s，紧一点）
// ================================================================
function shot63() {
  const dur = DUR['6.3'];
  const sc = laneSet({
    seed: 6303, weather: 'rain',
    lamps: [{ x: 1348, yBase: 782, h: 548, dir: -1, rate: 1.15, ph: 1.5, a: 1.35 }],
    puddles: [
      { x: 1206, y: 846, rx: 250, ry: 36, lamp: true, lampDX: 40, ripN: 5 },
      { x: 700, y: 796, rx: 150, ry: 22, lamp: false, ripN: 4 },
      { x: 980, y: 748, rx: 104, ry: 14, lamp: true, lampDX: -20, ripN: 3 },
    ],
    rainN: 400, rainFrontN: 58, carGain: .95,
    cars: [{ x: 906, y: 678, r: 28, gap: 20, a: .9, rate: .9, t0: .6, vx: -5 }],
    cam: camTrack([
      [0, [1000, 549, 1.0], -.002],
      [1.8, [1050, 546, 1.018], -.0038],
      [dur, [1104, 542, 1.034], -.0056],
    ]),
  });
  sc.dyn((ctx, t, cam) => {
    const u = t / dur;
    const ph = 2.4 + t * 4.6;
    const P = screenPlace(cam, .82, 1012 - 44 * u, 884, 400);
    wetShadow(ctx, P.x, P.y, P.S, undefined, .15);
    const emerge = clamp((t - .2) / .9);
    const pose = herWalk(ph, { hairBlow: .2, nod: -.04 });
    feetMirror(ctx, t, P, pose, { yaw: .42, pitch: .16, alpha: .17, glow: .18, len: .4 });
    const prims = drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: .42, pitch: .16 },
      { seed: 51, boil: Math.floor(t * 12), ink: emerge, color: emerge, alpha: 1 });
    umbrellaAt(ctx, t, prims, { S: P.S, r: P.S * .49, rot: .1, seed: 6, splash: 1, splashSeed: 63, drips: 1 });
    // 走过路灯时，暖光在她肩头/伞沿扫过
    const g = ctx.createRadialGradient(1250, 300, 20, 1250, 300, 460);
    g.addColorStop(0, 'rgba(232,199,138,.13)');
    g.addColorStop(1, 'rgba(232,199,138,0)');
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(1250, 300, 460, 0, TAU); ctx.fill();
    ctx.restore();
  }, 'mid');
  return sc;
}

// ================================================================
// 6.4 街角远景：固定广角 + 极慢拉远（3.65s；雨丝被风吹斜 / 车灯成暖色光斑）
// ================================================================
function shot64() {
  const dur = DUR['6.4'];
  const sc = wideSet({
    seed: 6404, weather: 'rain', slant: .55,
    rainN: 440, rainFrontN: 80,
    cars: [
      { x: 1150, y: 648, r: 52, gap: 36, a: 1, rate: .85, t0: .5, vx: 26 },
      { x: 1400, y: 662, r: 36, gap: 26, a: .85, rate: 1.2, t0: .8, vx: 17 },
    ],
    carFront: [{ x: 780, y: 764, r: 72, gap: 48, a: .5, rate: .7, t0: 1.2, vx: -12 }],
    farCars2: [],
    puddles: [
      { x: 760, y: 872, rx: 330, ry: 44, lamp: true, ripN: 5 },
      { x: 1450, y: 800, rx: 200, ry: 26, lamp: true, ripN: 4 },
      { x: 1080, y: 740, rx: 120, ry: 14, lamp: false, ripN: 3 },
      { x: 300, y: 886, rx: 250, ry: 32, lamp: true, lampDX: 26, ripN: 4 },
    ],
    cam: slowCam({ x: 962, y: 552, z0: 1.052, z1: .982, dy: -12, dur, rot: .002 }),
  });
  // 她站在街角边缘，撑伞不动
  sc.dyn((ctx, t, cam) => {
    const P = screenPlace(cam, .82, 432, 878, 306);
    wetShadow(ctx, P.x, P.y, P.S, undefined, .14);
    const pose = herWalk(.52 + .09 * Math.sin(t * 1.1), { hairBlow: .24, nod: -.05 });
    feetMirror(ctx, t, P, pose, { yaw: .34, pitch: .16, alpha: .13, glow: .14, len: .34 });
    const prims = drawGirl(ctx, pose, { x: P.x, y: P.y, S: P.S, yaw: .34, pitch: .16 },
      { seed: 71, boil: Math.floor(t * 12), ink: 1, color: 1, alpha: 1 });
    umbrellaAt(ctx, t, prims, { S: P.S, r: P.S * .49, rot: .13, seed: 9, splash: .9, splashSeed: 64, drips: 1 });
  }, 'mid');
  return sc;
}

// ================================================================
// 9.3 窗外街巷：固定广角 + 极慢拉远（8.51s；雨停 / 湿路面倒映天空与淡彩虹 / 行人简笔）
// ================================================================
function shot93() {
  const dur = DUR['9.3'];
  const sc = wideSet({
    seed: 9309, weather: 'after', slant: .3,
    rainbow: { t0: .8, t1: 7.2, cx: 1060, cy: 1180, r: 850, bandW: 18, a: .24, reveal: 1, pad: .08, clipY: 688 },
    rainbowGain: 1,
    farCars2: [],
    lamps: [
      { x: 214, yBase: 806, h: 512, dir: 1, rate: .8, ph: 1.1, a: .5 },
      { x: 1712, yBase: 800, h: 500, dir: -1, rate: .9, ph: .3, a: .55 },
    ],
    puddles: [
      { x: 780, y: 876, rx: 330, ry: 46, lamp: true, ripN: 3 },
      { x: 1440, y: 802, rx: 200, ry: 26, lamp: true, ripN: 3 },
      { x: 1080, y: 742, rx: 120, ry: 14, lamp: false, ripN: 2 },
      { x: 300, y: 886, rx: 240, ry: 30, lamp: true, lampDX: 20, ripN: 3 },
    ],
    pedestrians: [
      { x: 604, y: 782, S: 148, vx: 26, rate: .95, yaw: .42, ph: 1.2, a: .46, color: .12, seed: 71 },
      { x: 1292, y: 762, S: 126, vx: -22, rate: 1.1, yaw: -.5, ph: 3.4, a: .4, color: .10, seed: 72 },
      { x: 942, y: 722, S: 102, vx: 14, rate: .85, yaw: .1, ph: 5.1, a: .32, color: .08, seed: 73 },
    ],
    cam: slowCam({ x: 962, y: 548, z0: 1.052, z1: .984, dy: -8, dur }),
  });
  // 天光已开：路灯还亮着，但只是淡淡的暖；湿路面有细碎的天光
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createLinearGradient(0, -80, 0, 700);
    g.addColorStop(0, `rgba(255,250,238,${.12 + .02 * Math.sin(t * .5)})`);
    g.addColorStop(.6, 'rgba(255,250,238,.06)');
    g.addColorStop(1, 'rgba(255,250,238,0)');
    ctx.fillStyle = g; ctx.fillRect(-160, -120, 2240, 860);
    // 湿路面上的天光碎闪（缓慢呼吸）
    const R = rng(9301);
    ctx.fillStyle = 'rgba(255,255,252,.55)';
    for (let i = 0; i < 26; i++) {
      const x = 60 + R() * 1800, y = 660 + R() * 235;
      const a = .16 + .3 * Math.max(0, Math.sin(t * .7 + i * 1.3));
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.ellipse(x, y, 7 + R() * 16, 1.4, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'front');
  return sc;
}

export const SCENES = {
  '4.1': shot41,
  '4.2': shot42,
  '4.3': shot43,
  '4.4': shot44,
  '6.3': shot63,
  '6.4': shot64,
  '9.3': shot93,
};
