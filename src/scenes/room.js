// 室内戏 8 个镜头（set-room）
// 2.3 / 5.1 / 5.2 / 5.3 / 6.1 / 7.3 / 8.4 / 8.6
import { roomSet, letterParts, drawParts, handSketch, forearmSketch } from '../sets/room.js';
import { camTrack, slowCam, clamp, lerp, ss, seg, projector, ellipse, PAL, mix3, rgba, TAU, rng, INK } from '../core.js';
import { glow } from '../fx.js';

// ==================== 2.3 室内中景：收拾旧物，信放回箱底 ====================
function shot23() {
  const place = { x: 830, y: 870, S: 430, yaw: 1.1, pitch: .28 };
  const pr = projector(place.x, place.y, place.S, place.yaw, place.pitch);
  const handRAt = u => [lerp(.02, .24, u), lerp(.56, .497, u), lerp(.20, .40, u)];
  const uAt = t => ss(clamp((t - 1.3) / 3.4));
  const sc = roomSet({
    view: 'room', seed: 203, t0: -.5, reveal: 2.4,
    rain: .6, damp: .9, glassFog: .9, dropN: 26, veil: .045,
    case: { cx: 1046, lid: .94 },
    cup: { x: 1462, y: 726 },
    coat: false,
    windowLight: .5, floorProps: true,
    character: {
      pose: 'sit', place, t0f: .1, dur: 1.6, seed: 231,
      face: 'closed', tear: true,
      handPath: t => ({ handR: handRAt(uAt(t)) }),
    },
    cam: camTrack([[0, [884, 552, 1.15]], [3.5, [908, 592, 1.16]], [6.93, [928, 626, 1.17]]]),
  });
  // 手写信：从手里放进箱底（动态，跟着右手走）
  const parts = letterParts(132, 58, 2610, { damp: true, stamp: true });
  sc.dyn((ctx, t) => {
    const p = clamp((t - .9) / 1.4); if (p <= 0) return;
    const u = uAt(t);
    const H = pr(handRAt(u));
    const center = [H[0] + 2, H[1] + 38 + Math.sin(t * 1.8) * 1.4];
    const ang = lerp(-.34, -.06, u);
    const tf = ([x, y]) => { const c = Math.cos(ang), s = Math.sin(ang); const dx = x - 66, dy = y - 29; return [center[0] + dx * c - dy * s, center[1] + dx * s + dy * c]; };
    drawParts(ctx, parts, tf, 1, p);
  }, 'mid');
  return sc;
}

// ==================== 5.1 室内窗边中景：雨滴累积 / 旧照片 / 杯口热气 ====================
function shot51() {
  const sc = roomSet({
    view: 'room', seed: 511, t0: -.45, reveal: 2.2,
    rain: .8, damp: 1.15, glassFog: 1.2, dropN: 38, bokeh: .9, veil: .07,
    case: false, coat: true,
    cup: { x: 1462, y: 726 },
    sillPhoto: true,
    steam: { x: 1462, y: 646 },
    warmDust: true, motes: .85, lampGain: .7, windowLight: 1.0, rug: false,
    cam: camTrack([[0, [1150, 552, 1.22]], [2.1, [1160, 556, 1.25]], [4.15, [1172, 560, 1.285]]]),
  });
  // 左侧暖黄的光溢进来（只落在窗边桌、杯与照片的边缘）
  sc.dyn((ctx, t) => {
    const a = clamp((t - .5) / 1.6) * .9;
    if (a <= 0) return;
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(320, 0, 1120, 0);
    g.addColorStop(0, `rgba(232,199,138,${.22 * a})`);
    g.addColorStop(.55, `rgba(238,210,160,${.1 * a})`);
    g.addColorStop(1, 'rgba(238,210,160,0)');
    ctx.fillStyle = g; ctx.fillRect(300, 60, 900, 980); ctx.restore();
    glow(ctx, t, 520, 640, 300, PAL.lamp, .13 * a, { breathe: .16, rate: .7 });
  }, 'front');
  return sc;
}

// ==================== 6.1 室内中景：她合上行李箱（信纸在风里轻颤） ====================
function shot61() {
  const place = { x: 1236, y: 896, S: 430, yaw: -1.08, pitch: .28 };
  const pr = projector(place.x, place.y, place.S, place.yaw, place.pitch);
  const thetaAt = t => {
    const u = ss(clamp((t - .95) / 2.5));
    return lerp(.36, .012, u) + Math.sin(t * 1.25) * .004 * (1 - u);
  };
  const handAt = t => {
    const u = ss(clamp((t - .9) / 2.6));
    const bx = lerp(-.336, -.257, u), by = lerp(.574, .422, u), bz = lerp(.35, .38, u);
    return { handL: [bx - .06, by + .015, bz], handR: [bx + .08, by - .008, bz - .02], elbL: [-.2, -.2, .9], elbR: [.2, -.2, .9] };
  };
  const sc = roomSet({
    view: 'room', seed: 611, t0: -.45, reveal: 2.2,
    rain: .42, damp: .8, glassFog: .8, dropN: 20, veil: .06,
    lampGain: .4, candle: false, windowLight: .28, floorProps: true,
    case: { cx: 1046, dynLid: true, theta: thetaAt },
    letter: { mode: 'onSofa', x: 560, y: 648, ang: -.07, flutter: true, t0: .5, dur: 1.2 },
    character: {
      pose: 'kneel', place, t0f: .05, dur: 1.4, seed: 631,
      headYaw: .08,
      handPath: t => handAt(t),
    },
    cam: camTrack([[0, [1005, 580, 1.2]], [2.1, [968, 596, 1.2]], [4.17, [936, 608, 1.2]]]),
  });
  // 暖黄只落在手边：跟随她双手的一小团暖光
  sc.dyn((ctx, t) => {
    const h = handAt(t);
    const H = pr(h.handR);
    const a = clamp((t - .9) / 1.4);
    if (a <= 0) return;
    glow(ctx, t, H[0] - 20, H[1] - 8, 190, PAL.lamp, .15 * a, { breathe: .2, rate: .9 });
    glow(ctx, t, H[0] + 30, H[1] + 2, 120, PAL.warm, .11 * a, { breathe: .25, rate: 1.1, phase: 1.7 });
  }, 'front');
  return sc;
}

// ==================== 7.3 室内广角：旧物都在湿气里 ====================
function shot73() {
  return roomSet({
    view: 'room', seed: 713, t0: -.5, reveal: 2.5,
    rain: .7, damp: 1.6, glassFog: 1.3, dropN: 30, veil: .1,
    case: { cx: 1046, lid: 0 },
    cup: { x: 1462, y: 726 },
    coat: true,
    sillPhoto: true,
    letter: { mode: 'onSofa', x: 556, y: 648, ang: -.06, flutter: true, t0: .5, dur: 1.2 },
    steam: { x: 1462, y: 646 },
    warmDust: true, motes: .85, lampGain: 1.0, windowLight: 1.0, floorProps: true,
    cam: camTrack([[0, [1002, 618, 1.0]], [1.9, [954, 596, 1.0]], [3.74, [908, 574, 1.0]]]),
  });
}

// ==================== 5.2 旧照片特写：焦点从模糊笑颜转到手指 ====================
function shot52() {
  const sc = roomSet({
    view: 'sill', seed: 521, t0: -.4, reveal: 1.9,
    mode: 'photoOnly',
    photo: { x: 398, y: 292, w: 648, h: 486, ang: .026 },
    photoNear: true, photoDamp: true,
    underLetter: { x: 360, y: 330, w: 660, h: 260, ang: .04 },
    printStack: true, sprig: true,
    damp: .9, glint: .7, warmDust: true, motes: .7,
    hand: { keys: [[1280, 576], [1220, 590], [1160, 600]], s: 196, ang0: 3.04, ang1: 2.94, t0: .25, t1: 1.9, curl: .42, sleeveFrom: [1880, 648] },
    cam: camTrack([[0, [902, 596, 1.4]], [2.0, [962, 600, 1.45]], [4.15, [1014, 604, 1.5]]]),
  });
  // 焦点转移：照片的柔焦纱先厚后薄，手指一侧的光先亮起来
  sc.dyn((ctx, t) => {
    const a = 1 - clamp((t - .7) / 2.4) * .72;
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const g = ctx.createRadialGradient(720, 520, 120, 720, 520, 620);
    g.addColorStop(0, `rgba(255,253,246,${.3 * a})`);
    g.addColorStop(.6, `rgba(255,253,246,${.18 * a})`);
    g.addColorStop(1, 'rgba(255,253,246,0)');
    ctx.fillStyle = g; ctx.fillRect(120, 120, 1400, 800); ctx.restore();
    glow(ctx, t, 1180, 620, 260, PAL.lamp, .1 * clamp((t - .6) / 1.8), { breathe: .15, rate: .8 });
  }, 'front');
  return sc;
}

// ==================== 5.3 把照片放回抽屉：过肩 + 轻下摇 ====================
function shot53() {
  return roomSet({
    view: 'drawer', seed: 533, t0: -.4, reveal: 2.2,
    damp: .9,
    handPhoto: { t0: .3, t1: 2.5 },
    cam: camTrack([[0, [958, 596, 1.16]], [2.1, [950, 616, 1.16]], [4.15, [942, 636, 1.17]]]),
  });
}

// ==================== 8.4 窗台特写：彩虹光落在纸面上 ====================
function shot84() {
  const L = { x: 318, y: 442, w: 570, h: 300, ang: -.045 };
  const sc = roomSet({
    view: 'sill', seed: 841, t0: -.4, reveal: 2.0,
    letter: L,
    photo: { x: 1252, y: 424, w: 430, h: 330, ang: .05 },
    photoDamp: true, photoNear: false,
    underLetter: false, printStack: true, sprig: true,
    rainbow: { t0: 1.0, t1: 4.29, gain: 1.2, a: .16, gap: 34, ang: -.34, y: 548, x: 880 },
    glint: 1.6, damp: 1.2, warmDust: true, motes: .95,
    cam: camTrack([[0, [962, 650, 1.48]], [2.1, [930, 644, 1.53]], [4.29, [898, 638, 1.58]]]),
  });
  // 彩虹光更明确地落在信纸与照片上（只在纸面范围内再压一层色带）
  sc.dyn((ctx, t) => {
    const u = clamp((t - 1.0) / 2.2); if (u <= 0) return;
    const COLS = [[196, 220, 186], [232, 200, 158], [240, 226, 172], [180, 210, 226], [200, 186, 220]];
    const tf = ([x, y]) => { const c = Math.cos(L.ang), s = Math.sin(L.ang); return [L.x + x * c - y * s, L.y + x * s + y * c]; };
    const q = [[0, 0], [L.w, 0], [L.w, L.h], [0, L.h]].map(tf);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.translate(880, 548); ctx.rotate(-.34);
    for (let i = 0; i < COLS.length; i++) {
      const off = (i - 2) * 34 + Math.sin(t * .45 + i) * 5;
      const c = COLS[i], a = .22 * u * (.8 + .2 * Math.sin(t * .85 + i * 1.4));
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a * .4})`;
      ctx.fillRect(-1400, off - 30, 2800, 60);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      ctx.fillRect(-1400, off - 7, 2800, 14);
    }
    ctx.restore();
    // 光在纸上的一点点暖反光
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createRadialGradient(620, 560, 30, 620, 560, 420);
    g.addColorStop(0, `rgba(255,248,226,${.1 * u})`); g.addColorStop(1, 'rgba(255,248,226,0)');
    ctx.fillStyle = g; ctx.fillRect(200, 350, 900, 600); ctx.restore();
  }, 'front');
  // 信的边缘、照片一角上的水珠（在光里闪）
  sc.dyn((ctx, t) => {
    const R = rng(8420);
    const a0 = clamp((t - .8) / 1.4);
    if (a0 <= 0) return;
    const spots = [];
    for (let i = 0; i < 12; i++) spots.push([330 + R() * 570, 448 + R() * 300, 1.6 + R() * 3.4, R() * 6]);
    for (let i = 0; i < 7; i++) spots.push([1256 + R() * 120, 430 + R() * 300, 1.4 + R() * 3, R() * 6]);
    for (let i = 0; i < 14; i++) spots.push([300 + R() * 1200, 760 + R() * 90, 1.2 + R() * 2.6, R() * 6]);
    ctx.save();
    for (const [x, y, rr, ph] of spots) {
      const tw = .5 + .5 * Math.sin(t * 1.3 + ph * 2);
      ctx.globalAlpha = a0 * (.35 + .3 * tw);
      ctx.fillStyle = rgba(mix3(PAL.greyLight, [255, 255, 255], .5), .55);
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 1.12, .2, 0, TAU); ctx.fill();
      ctx.globalAlpha = a0 * .4;
      ctx.strokeStyle = rgba(INK, .5); ctx.lineWidth = .8;
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 1.12, .2, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a0 * (.35 + .65 * tw);
      ctx.fillStyle = 'rgba(255,255,252,.95)';
      ctx.beginPath(); ctx.arc(x - rr * .3, y - rr * .35, Math.max(.7, rr * .32), 0, TAU); ctx.fill();
    }
    ctx.restore();
    // 窗光从上方斜落在纸面（很淡的暖）
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(600, 280, 1300, 820);
    g.addColorStop(0, `rgba(255,240,205,${.1 * a0})`); g.addColorStop(.6, `rgba(250,238,214,${.05 * a0})`); g.addColorStop(1, 'rgba(250,238,214,0)');
    ctx.fillStyle = g; ctx.fillRect(300, 280, 1400, 700); ctx.restore();
  }, 'front');
  return sc;
}

// ==================== 8.6 手写信被拿起的手部微距 ====================
function shot86() {
  const L = { x: 596, y: 428, w: 560, h: 238 };
  const lift = t => ss(clamp((t - .55) / 3.3));
  const sc = roomSet({
    view: 'sill', seed: 861, t0: -.4, reveal: 1.9,
    mode: 'photoOnly', photo: false,
    underLetter: false, printStack: false, sprig: false,
    glint: .5, damp: .9, warmDust: true, motes: 1.0,
    cam: camTrack([[0, [948, 566, 2.0]], [2.2, [944, 562, 2.12]], [4.29, [940, 558, 2.24]]]),
  });
  const parts = letterParts(L.w, L.h, 8610, { damp: true, stamp: true });
  const pos = t => { const u = lift(t); return { x: L.x - 32 * u, y: L.y - 22 * u + Math.sin(t * 1.5) * 1.5, ang: -.02 - .05 * u, u }; };
  // 手（在信的后面：掌与腕露在信的右外侧，手指掖在纸下）
  sc.dyn((ctx, t) => {
    const a = clamp((t - .3) / .8); if (a <= 0) return;
    const p = pos(t);
    const palm = [p.x + L.w + 30, p.y + L.h * .62];
    const ang = 2.84;
    const dir = [Math.cos(ang), Math.sin(ang)];
    const wrist = [palm[0] - dir[0] * 168 * .46, palm[1] - dir[1] * 168 * .46];
    forearmSketch(ctx, [1880, 786], wrist, 168 * .2, 168 * .3, { alpha: a, col: mix3(PAL.coat, PAL.cream, .42) });
    handSketch(ctx, palm[0], palm[1], 168, ang, { curl: .5, alpha: a, seed: 862 });
  }, 'mid');
  // 信（盖在手指上面，只有指尖露出来）
  sc.dyn((ctx, t) => {
    const p = pos(t);
    const tf = ([x, y]) => { const c = Math.cos(p.ang), s = Math.sin(p.ang); return [p.x + x * c - y * s, p.y + x * s + y * c]; };
    drawParts(ctx, parts, tf, 1, clamp((t - .25) / 1.1));
  }, 'mid');
  // 纸边上的四个指尖 + 拇指（贴在纸的上表面）
  sc.dyn((ctx, t) => {
    const a = clamp((t - .5) / .9); if (a <= 0) return;
    const p = pos(t);
    const c = Math.cos(p.ang), s = Math.sin(p.ang);
    const at = (x, y) => [p.x + x * c - y * s, p.y + x * s + y * c];
    for (let i = 0; i < 4; i++) {
      const e = at(L.w - 10 - i * 2, L.h * .52 + i * 22 + Math.sin(t * 1.11 + i) * .8);
      ctx.save();
      // 纸上的小影
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba([140, 120, 105], .12 * a);
      ctx.beginPath(); ctx.ellipse(e[0] + 2, e[1] + 3, 8.5, 10.5, .1, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba([252, 249, 241], .9 * a);
      ctx.beginPath(); ctx.ellipse(e[0], e[1], 8.6, 10.6, .1, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba(PAL.skin, .38 * a);
      ctx.beginPath(); ctx.ellipse(e[0], e[1] - 1, 7.8, 9.4, .1, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(INK, .45 * a); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(e[0] + 1, e[1] + 1, 8.4, -1.15, 1.7); ctx.stroke();
      // 指甲的一点纸白
      ctx.fillStyle = rgba([255, 253, 247], .5 * a);
      ctx.beginPath(); ctx.ellipse(e[0] + 3, e[1] - 4, 2.6, 3.2, .2, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 拇指从纸的下缘露出来
    const th = at(L.w - 44, L.h + 6);
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba([252, 249, 241], .9 * a);
    ctx.beginPath(); ctx.ellipse(th[0], th[1], 22, 14, .18, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgba(mix3(PAL.skin, PAL.warm, .4), .4 * a);
    ctx.beginPath(); ctx.ellipse(th[0], th[1], 21, 13, .18, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = rgba(INK, .5 * a); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(th[0] - 2, th[1] - 3, 19, -1.9, .9); ctx.stroke(); ctx.restore();
  }, 'mid');
  // 暖光：从左上方的窗光落下来（跟着信移动）
  sc.dyn((ctx, t) => {
    const p = pos(t), u = lift(t);
    const a = clamp((t - .4) / 1.6);
    if (a <= 0) return;
    glow(ctx, t, p.x + 120, p.y + 100, 420, PAL.lamp, .14 * a, { breathe: .12, rate: .6 });
    glow(ctx, t, p.x + 420, p.y + 60, 300, PAL.warm, .1 * a, { breathe: .18, rate: .8, phase: 1.2 });
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const g = ctx.createLinearGradient(p.x - 200, p.y - 160, p.x + 620, p.y + 380);
    g.addColorStop(0, `rgba(255,244,218,${.2 * a * (.6 + u * .4)})`);
    g.addColorStop(.55, `rgba(250,236,214,${.09 * a})`);
    g.addColorStop(1, 'rgba(250,236,214,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - 400, p.y - 300, 1500, 1100); ctx.restore();
    // 窗光里的细小光斑
    ctx.save();
    const R = rng(8650);
    for (let i = 0; i < 7; i++) {
      const x = p.x + 60 + R() * 480, y = p.y - 40 + R() * 260, rr = 8 + R() * 20, ph = R() * 6;
      const aa = (0.1 + R() * .1) * a * (.6 + .4 * Math.sin(t * 1.3 + ph));
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rr);
      gg.addColorStop(0, `rgba(255,250,236,${aa})`); gg.addColorStop(1, 'rgba(255,250,236,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }, 'front');
  return sc;
}

export const SCENES = {
  '2.3': shot23,
  '5.1': shot51,
  '5.2': shot52,
  '5.3': shot53,
  '6.1': shot61,
  '7.3': shot73,
  '8.4': shot84,
  '8.6': shot86,
};
