// 人物（简笔画版）：单线勾勒 + 平涂淡彩的朴素小人
// 比例依据见 REFERENCE.md：7.5–8 头身、肩宽≈1.5 头宽、肘在腰线、腕在胯线；
// 面部只用最少的笔画（点眼 / 短眉 / 一笔鼻 / 微笑），侧脸只画轮廓需要的几笔。
// 这一版替代之前的"半写实"画法：线条干净、形状简单，和钢笔淡彩的整体气质一致。
import { PAL, PAPER, mix3, clamp, lerp, TAU, rng, ellipse, spline, R3 } from './core.js';
import { skeleton, projector, BODY } from './engine.js';
import { SPR, drawSpriteGirl } from './sprites.js';
const { V } = R3;

// ---------------------------------------------------------------- 配色
const INK = [43, 37, 32];
const HAIR_C = mix3(PAL.hair, [190, 150, 112], .55);
const HAIR_D = mix3(PAL.hair, [80, 58, 44], .45);
const SKIN_C = PAL.skin;
const COAT_C = PAL.coat;
const PANTS_C = mix3(PAL.coat, PAL.greyDeep, .5);
const SHOE_C = PAL.shoe;

export const LOOK_HER = {
  skin: SKIN_C, top: COAT_C, hair: HAIR_C, bottom: PANTS_C,
  shoe: SHOE_C, sleeve: 'long', pants: 1, hairLong: 1, torso: [.094, .076, .098],
};
export const LOOK_HIM = {
  skin: mix3(SKIN_C, [120, 124, 130], .35), top: mix3(COAT_C, PAL.greyDeep, .45),
  hair: mix3(HAIR_D, [60, 56, 54], .3), bottom: mix3(PANTS_C, PAL.greyDeep, .35),
  shoe: mix3(SHOE_C, PAL.greyDeep, .4), sleeve: 'long', torso: [.082, .084, .1],
};

export const mixPose = (a, b, t) => {
  const o = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k], y = b[k];
    if (x === undefined) o[k] = y;
    else if (y === undefined) o[k] = x;
    else if (Array.isArray(x)) o[k] = x.map((v, i) => lerp(v, y[i], t));
    else o[k] = lerp(x, y, t);
  }
  return o;
};

// ---------------------------------------------------------------- 姿势
export function herStand(o = {}) {
  return {
    hipY: .52, hipZ: 0, lean: o.lean ?? .01, side: o.side ?? 0, twist: o.twist ?? 0,
    headYaw: o.headYaw ?? 0, nod: o.nod ?? 0, headSide: o.headSide ?? 0,
    armL: .04 + (o.armL ?? 0), armR: -.04 + (o.armR ?? 0), bendL: .22, bendR: .22, abdL: .07, abdR: .07,
    handL: o.handL, handR: o.handR, elbL: o.elbL, elbR: o.elbR,
    footL: o.footL, footR: o.footR, kneePole: o.kneePole, hairBlow: o.hairBlow ?? 0,
  };
}
export function herTouchGlass(o = {}) {
  const reach = o.reach ?? 1;
  return herStand({
    ...o, lean: .05, headYaw: o.headYaw ?? -.15, nod: o.nod ?? -.04,
    armR: lerp(-.05, -1.02, reach), bendR: lerp(.22, .82, reach), abdR: lerp(.07, .22, reach),
    armL: .06, bendL: .26, abdL: .09,
    handR: undefined, elbR: undefined, handL: o.handL,
    footL: V(-.06, .02, .01), footR: V(.065, .02, -.02),
  });
}
export function herSitFloor(o = {}) {
  return {
    hipY: .115, hipZ: 0, lean: o.lean ?? .38, side: o.side ?? .04, twist: o.twist ?? -.12,
    headYaw: o.headYaw ?? -.25, nod: o.nod ?? -.42, headSide: o.headSide ?? .05,
    footL: o.footL ?? V(-.11, .03, .30), footR: o.footR ?? V(.11, .03, .24),
    kneePole: V(0, .9, .2),
    handL: o.handL ?? V(-.12, .26, .27), handR: o.handR ?? V(.13, .24, .30),
    elbL: V(-.8, -.2, .2), elbR: V(.8, -.2, .2), hairBlow: o.hairBlow ?? 0,
  };
}
export function herKneel(o = {}) {
  return {
    hipY: .30, hipZ: 0, lean: o.lean ?? .42, side: o.side ?? 0, twist: o.twist ?? -.06,
    headYaw: o.headYaw ?? -.12, nod: o.nod ?? -.3,
    footL: o.footL ?? V(-.08, .03, -.26), footR: o.footR ?? V(.09, .03, -.30),
    kneePole: V(0, .2, 1),
    handL: o.handL ?? V(-.14, .48, .26), handR: o.handR ?? V(.15, .46, .24),
    elbL: V(-1, 0, .2), elbR: V(1, 0, .2), hairBlow: o.hairBlow ?? 0,
  };
}
export function herWalk(ph, o = {}) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return {
    hipY: .515 + .008 * Math.abs(c), lean: .04, legL: .34 * s, kneeL: .08 + .42 * Math.max(0, c),
    legR: -.34 * s, kneeR: .08 + .42 * Math.max(0, -c), headYaw: o.headYaw ?? 0, nod: o.nod ?? -.03,
    twist: .05 * s,
    handR: [.14 + .03 * s, 1.02, .12], elbR: V(.8, -.2, .8),
    armL: -.28 * s, bendL: .3, abdL: .08, hairBlow: o.hairBlow ?? .15,
  };
}
export function herReachOut(o = {}) {
  return herStand({
    ...o, lean: .1, headYaw: o.headYaw ?? -.1, nod: o.nod ?? -.12,
    handR: [lerp(.1, .2, o.reach ?? 1), lerp(.62, 1.02, o.reach ?? 1), lerp(.14, .34, o.reach ?? 1)],
    elbR: V(1, -.1, .3), footL: V(-.05, .02, .04), footR: V(.06, .02, -.04),
  });
}
export function herLookUp(o = {}) {
  return herStand({ ...o, nod: o.nod ?? .30, headYaw: o.headYaw ?? -.12, lean: o.lean ?? -.02, handL: o.handL, handR: o.handR });
}
export function herSmileDown(o = {}) {
  return herStand({ ...o, nod: o.nod ?? -.16, headYaw: o.headYaw ?? -.08, headSide: o.headSide ?? .06, lean: .03 });
}

// ---------------------------------------------------------------- 画笔
let GA = 1;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a * GA})`;
function path(ctx, pts, closed = true) {
  if (!pts.length) return;
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  const P = pts, n = P.length, g = i => closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
// 平涂：纸色混一点颜色，画出"淡彩平涂"的感觉
function flat(ctx, pts, col, o = {}) {
  const mixA = o.mix ?? .62;
  const c = mix3(PAPER, col, mixA);
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = rgba(c, o.a ?? 1);
  path(ctx, pts, true); ctx.fill();
  if (o.wash !== false) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(col, o.washA ?? .16);
    path(ctx, pts, true); ctx.fill();
  }
  ctx.restore();
}
function line(ctx, pts, w, a = .72, closed = false) {
  ctx.save(); ctx.strokeStyle = rgba(INK, a); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(ctx, pts, closed); ctx.stroke(); ctx.restore();
}
// 锥形"胶囊链"：手臂 / 腿 / 伞杆
function band(pts, rads) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    L.push([pts[i][0] + nx * rads[i], pts[i][1] + ny * rads[i]]);
    R.push([pts[i][0] - nx * rads[i], pts[i][1] - ny * rads[i]]);
  }
  return [...L, ...R.reverse()];
}
const neg = p => p;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const norm2 = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };

// ---------------------------------------------------------------- 手
// 简笔手：手掌 + 四指 + 拇指（全部为圆头的"胶囊"）
function handShape(ctx, at, dir, size, o = {}) {
  const [dx, dy] = dir, px = -dy, py = dx;
  const s = size;
  const P = (f, w) => [at[0] + dx * f * s + px * w * s, at[1] + dy * f * s + py * w * s];
  const palm = [P(-.04, -.55), P(.5, -.62), P(.82, -.3), P(.84, .3), P(.5, .62), P(-.04, .55)];
  const tb = P(.12, -.5), tt = P(.5, -.95);
  const thumb = band([tb, mid(tb, tt), tt], [s * .2, s * .18, s * .14]);
  flat(ctx, thumb, o.skin ?? SKIN_C, { mix: .62, wash: false });
  flat(ctx, palm, o.skin ?? SKIN_C, { mix: .62, wash: false });
  line(ctx, palm, o.lw ?? Math.max(.8, s * .06), .66, true);
  line(ctx, thumb, o.lw ?? Math.max(.8, s * .06), .6, true);
}

// ---------------------------------------------------------------- 头
// 头/发型/脸：正面、3/4、侧面、背面
function headView(prims) { return prims.__hv; }
function drawSimpleHead(ctx, hc, R, phi, pose, o = {}) {
  const front = -Math.cos(phi), turnX = Math.sin(phi);
  const fv = clamp((front + .15) / .85);
  const prof = clamp((Math.abs(turnX) - .72) / .26);
  const side = turnX < 0 ? -1 : 1;
  const expr = o.expr || 'calm';
  const roll = (pose.headSide ?? 0) * .5;
  const cosr = Math.cos(roll), sinr = Math.sin(roll);
  const H = (x, y) => [hc[0] + (x * R) * cosr - (y * R) * sinr, hc[1] + (x * R) * sinr + (y * R) * cosr];
  const lw = Math.max(1.0, R * .045);
  const hairC = o.hairCol ?? HAIR_C;
  if (o.short) {
    // 男生短发：贴头骨的帽形 + 后颈一点
    const cap = [
      H(-.03, -1.12), H(.4, -1.06), H(.7, -.9), H(.88, -.56), H(.94, -.12),
      H(.96, .28), H(.9, .62), H(.74, .88), H(.5, 1.0), H(.2, 1.04),
      H(-.2, 1.04), H(-.5, 1.0), H(-.74, .88), H(-.9, .62), H(-.96, .28),
      H(-.94, -.12), H(-.88, -.56), H(-.7, -.9), H(-.4, -1.06),
    ];
    flat(ctx, cap, hairC, { mix: .66 });
    line(ctx, cap, lw, .7, true);
    line(ctx, [H(-.3, -.9), H(-.2, -.4), H(-.14, .2)], lw * .6, .26);
    line(ctx, [H(.1, -.95), H(.16, -.5), H(.2, .0)], lw * .6, .22);
    return;
  }

  // ---- 后发 / 周围发（长直发：整块轮廓 + 两束落到肩前） ----
  const hairPoly = [
    H(-.02, -1.14), H(.4, -1.08), H(.72, -.94), H(.9, -.62), H(.98, -.18),
    H(.98, .32), H(.94, .82), H(.86, 1.22), H(.74, 1.62), H(.58, 1.92), H(.42, 2.06),
    H(.28, 1.8), H(.33, 1.42), H(.3, 1.02), H(.3, .62),
    H(.22, .5), H(0, .58), H(-.22, .5),
    H(-.3, .62), H(-.3, 1.02), H(-.33, 1.42), H(-.28, 1.8),
    H(-.42, 2.06), H(-.58, 1.92), H(-.74, 1.62), H(-.86, 1.22), H(-.94, .82), H(-.98, .32), H(-.98, -.18),
    H(-.9, -.62), H(-.72, -.94), H(-.4, -1.08),
  ];
  flat(ctx, hairPoly, hairC, { mix: .78 });
  line(ctx, hairPoly, lw, .66, true);
  // 头发暗部（很简单的一块）
  flat(ctx, [H(-.86, -.1), H(-.5, -.4), H(-.5, 1.0), H(-.7, 1.7), H(-.9, 1.1), H(-.95, .2)], mix3(hairC, HAIR_D, .5), { mix: .8, wash: false, a: .55 });
  // 发丝：两三笔
  for (let i = 0; i < 3; i++) {
    const u = i / 2;
    line(ctx, [H(-.22 + u * .42, -1.05), H(-.36 + u * .5, -.3), H(-.4 + u * .55, .9), H(-.36 + u * .5, 1.8)], lw * .55, .3);
  }

  if (fv < .14) {
    // ---- 背面：只有发缝和两笔发丝 ----
    line(ctx, [H(.02, -1.12), H(-.02, -.5), H(-.04, .4)], lw * .8, .4);
    return;
  }

  // ---- 脸 ----
  if (prof > .52) {
    // 侧脸：额头—鼻—唇—下巴—下颌的简笔轮廓
    const S2 = (x, y) => H(x * side, y);
    const face = [
      S2(.08, -.94), S2(.4, -.82), S2(.58, -.6), S2(.6, -.36), S2(.54, -.16),
      S2(.72, .0), S2(.52, .08), S2(.52, .18), S2(.58, .24), S2(.52, .3),
      S2(.54, .38), S2(.5, .56), S2(.38, .74), S2(.2, .82), S2(.06, .7),
      S2(-.04, .5), S2(-.08, .2), S2(-.06, -.2), S2(.0, -.6), S2(.08, -.84),
    ];
    flat(ctx, face, SKIN_C, { mix: .5, wash: false });
    line(ctx, face, lw, .6, true);
    // 头发（盖住颅顶和脑后）
    const hair = [
      S2(-.02, -1.02), S2(-.3, -1.06), S2(-.66, -.97), S2(-.9, -.74),
      S2(-1.0, -.36), S2(-1.0, .18), S2(-.95, .62), S2(-.86, 1.05),
      S2(-.72, 1.45), S2(-.56, 1.82), S2(-.4, 2.05), S2(-.26, 1.86),
      S2(-.2, 1.35), S2(-.17, .85), S2(-.14, .35), S2(-.12, .02),
      S2(-.07, -.28), S2(-.02, -.62),
    ];
    flat(ctx, hair, hairC, { mix: .78 });
    line(ctx, hair, lw, .6, true);
    for (let i = 0; i < 2; i++) line(ctx, [S2(.28 - i * .16, -1.0), S2(.18 - i * .1, -.6), S2(.1 - i * .06, -.24)], lw * .5, .28);
    // 眼睛（一点 + 睫毛）
    const ex = S2(.38, -.1);
    ctx.save(); ctx.fillStyle = rgba([60, 48, 40], .95); ctx.beginPath(); ctx.arc(ex[0], ex[1], R * .06, 0, TAU); ctx.fill(); ctx.restore();
    line(ctx, [S2(.24, -.14), S2(.4, -.2), S2(.54, -.12)], lw * .8, .6);
    // 眉
    line(ctx, [S2(.3, -.26), S2(.42, -.3), S2(.52, -.26)], lw * .6, .3);
    // 唇
    line(ctx, [S2(.5, .22), S2(.58, .25), S2(.53, .29)], lw * .6, .45);
    // 耳
    line(ctx, [S2(-.02, -.02), S2(.03, .06), S2(.02, .18), S2(-.05, .2)], lw * .6, .4);
    return;
  }

  // 正面 / 3/4 脸
  const shift = turnX * R * .06;
  const face = [
    H(-.03 + turnX * .02, -1.0), H(.3, -.97), H(.58, -.84), H(.74, -.6), H(.8, -.28),
    H(.8, .06), H(.75, .38), H(.6, .64), H(.38, .82), H(.12, .93), H(-.08, .93),
    H(-.34, .82), H(-.56, .64), H(-.71, .38), H(-.76, .06), H(-.76, -.28),
    H(-.7, -.6), H(-.54, -.84), H(-.28, -.97),
  ];
  flat(ctx, face, SKIN_C, { mix: .5, wash: false });
  line(ctx, face, lw, .55, true);
  // 下颌一点的阴影
  flat(ctx, [H(-.4, .78), H(0, .92), H(.4, .78), H(.2, .72), H(-.2, .72)], mix3(SKIN_C, [200, 160, 150], .4), { mix: .7, wash: false, a: .5 });
  // 刘海（偏分，斜扫）
  const fringe = [
    H(-.92, -.46), H(-.86, -.78), H(-.6, -1.0), H(-.12, -1.12), H(.34, -1.04), H(.7, -.88), H(.9, -.6), H(.96, -.24),
    H(.88, -.36), H(.72, -.42), H(.56, -.34), H(.4, -.46), H(.22, -.38), H(.04, -.5), H(-.14, -.44), H(-.34, -.54), H(-.54, -.48), H(-.72, -.56), H(-.88, -.46),
  ];
  flat(ctx, fringe, hairC, { mix: .8 });
  line(ctx, [H(-.92, -.46), H(-.86, -.78), H(-.6, -1.0), H(-.12, -1.12), H(.34, -1.04), H(.7, -.88), H(.9, -.6), H(.96, -.24)], lw, .62);
  line(ctx, [H(.96, -.24), H(.88, -.36), H(.72, -.42), H(.56, -.34), H(.4, -.46), H(.22, -.38), H(.04, -.5), H(-.14, -.44), H(-.34, -.54), H(-.54, -.48), H(-.72, -.56), H(-.88, -.46), H(-.92, -.46)], lw * .9, .6);
  // 分缝
  line(ctx, [H(.12, -1.1), H(.06, -.86), H(-.08, -.66)], lw * .6, .35);
  // 两笔发丝
  line(ctx, [H(.2, -1.06), H(.3, -.8), H(.44, -.58)], lw * .5, .28);
  line(ctx, [H(-.1, -1.1), H(-.3, -.86), H(-.56, -.68)], lw * .5, .26);

  // ---- 五官（点眼 + 短眉 + 一笔鼻 + 微笑） ----
  const eyeY = H(0, -.1)[1];
  const eyeDX = R * .33, eyeR = R * .075;
  const fy = H(0, -.1);
  const nearX = fy[0] + side * eyeDX + shift, farX = fy[0] - side * eyeDX + shift;
  // 远眼略小
  const eyes = side > 0 ? [[nearX, eyeR], [farX, eyeR * .9]] : [[farX, eyeR * .9], [nearX, eyeR]];
  for (const [ex, er] of eyes) {
    const open = expr !== 'down' && expr !== 'smile';
    if (open) {
      // 眼白（极淡）+ 瞳（点）
      ctx.save(); ctx.fillStyle = rgba([252, 247, 238], .85);
      ctx.beginPath(); ctx.ellipse(ex, eyeY, er * 1.6, er * 1.15, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba([58, 46, 38], .95);
      ctx.beginPath(); ctx.arc(ex + (expr === 'up' ? 0 : 0), eyeY - (expr === 'up' ? er * .3 : 0), er, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,253,248,.9)';
      ctx.beginPath(); ctx.arc(ex - er * .3, eyeY - er * .3, er * .3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    // 睫毛线
    line(ctx, [[ex - er * 2, eyeY + er * .2], [ex - er * .6, eyeY - er * .9], [ex + er * 1.2, eyeY - er * .7], [ex + er * 2.1, eyeY + er * .1]], lw * .9, .72);
    // 眉
    line(ctx, [[ex - er * 1.7, eyeY - er * 3.1], [ex, eyeY - er * 3.6], [ex + er * 1.9, eyeY - er * 3.0]], lw * .6, .3);
    if (!open) line(ctx, [[ex - er * 1.7, eyeY + er * .2], [ex, eyeY + er * .9], [ex + er * 1.8, eyeY + er * .1]], lw * .9, .68);
  }
  // 鼻：一竖一点
  line(ctx, [H(-.02 + turnX * .04, .14), H(.02 + turnX * .04, .26), H(-.03 + turnX * .04, .3)], lw * .55, .32);
  // 嘴：微笑
  const mc = H(turnX * .03, .58);
  const smile = expr === 'smile' ? .12 : expr === 'down' ? -.08 : .05;
  line(ctx, [[mc[0] - R * .18, mc[1] - smile * R * .2], [mc[0], mc[1] + R * .06], [mc[0] + R * .18, mc[1] - smile * R * .3]], lw * .7, .5);
  // 腮红
  ctx.save(); ctx.globalCompositeOperation = 'multiply';
  for (const s of [-1, 1]) {
    const p = H(s * .48, .22), g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], R * .28);
    g.addColorStop(0, rgba([230, 178, 164], .28)); g.addColorStop(1, 'rgba(230,178,164,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], R * .28, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 画一个人
function drawFigure(ctx, pose, place, look, o = {}) {
  const S = place.S, yaw = place.yaw ?? 0, pitch = place.pitch ?? .24;
  const pr = projector(place.x, place.y, S, yaw, pitch);
  const j = skeleton(pose);
  const lw = Math.max(1.0, S * .0036);
  const P = k => pr(j[k]);
  const GA0 = ctx.globalAlpha;
  GA = GA0 * (o.alpha ?? 1);
  ctx.save(); ctx.globalAlpha = 1;

  const headC = P('head');
  const R = .062 * S;
  const phi = yaw + (j.headYaw ?? 0);

  const pel = P('pel'), neck = P('neck'), shL = P('shL'), shR = P('shR'), ch = P('chest');

  // ---- 腿 / 鞋（先画，衣服盖住上面） ----
  const lowBody = (pose.hipY ?? .52) < .4;   // 坐 / 跪：腿收在衣服下
  for (const s of (lowBody ? [] : ['L', 'R'])) {
    const hp = P('hp' + s), kn = P('kn' + s), an = P('an' + s), to = P('to' + s);
    const leg = band([hp, kn, an], [S * .058, S * .042, S * .028]);
    flat(ctx, leg, look.bottom, { mix: .7 });
    line(ctx, leg, lw, .7, true);
    // 裤脚
    const dir = norm2(kn, an), px = -dir[1], py = dir[0];
    line(ctx, [[an[0] + px * S * .028, an[1] + py * S * .028], [an[0] - px * S * .028, an[1] - py * S * .028]], lw * .8, .6);
    // 鞋：脚踝到脚尖的小圆角形
    const shoe = [
      [an[0] - S * .022, an[1] - S * .01], [to[0], to[1] - S * .008],
      [to[0] + S * .022, to[1] + S * .004], [to[0] + S * .01, to[1] + S * .022],
      [an[0] + S * .01, an[1] + S * .022],
    ];
    flat(ctx, shoe, look.shoe, { mix: .6 });
    line(ctx, shoe, lw, .7, true);
  }

  // ---- 外套 ----
  let up = norm2(pel, neck), right = norm2(shL, shR);
  const A = (base, u, r) => [base[0] + up[0] * u * S + right[0] * r * S, base[1] + up[1] * u * S + right[1] * r * S];
  const hem = A(pel, -.01, 0), waist = A(ch, -.02, 0), chest = A(ch, .02, 0);
  const coat = [
    A(pel, -.02, -.105), A(ch, .02, -.088), A(ch, .12, -.098),
    A(neck, -.025, -.104), A(neck, .035, -.038),
    A(neck, .035, .038), A(neck, -.025, .104), A(ch, .12, .098), A(ch, .02, .088), A(pel, -.02, .105),
    A(pel, -.05, .075), A(pel, -.05, -.075),
  ];
  flat(ctx, coat, look.top, { mix: .72 });
  line(ctx, coat, lw, .74, true);
  // 衣摆线 / 门襟 / 领口
  line(ctx, [A(pel, -.02, -.11), A(pel, -.03, 0), A(pel, -.02, .11)], lw * .7, .6);
  line(ctx, [A(neck, .07, .01), A(ch, .05, .005), A(pel, -.02, .01)], lw * .7, .55);
  // 领口（两笔小 V 领）
  line(ctx, [A(neck, .045, -.04), A(neck, .0, -.012), A(neck, -.01, 0)], lw * .7, .55);
  line(ctx, [A(neck, .045, .04), A(neck, .0, .012), A(neck, -.01, 0)], lw * .7, .55);
  // 两颗扣子
  for (let i = 0; i < 2; i++) {
    const p = A(ch, .1 - i * .12, .012);
    ctx.save(); ctx.fillStyle = rgba(INK, .45); ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(.8, S * .0035), 0, TAU); ctx.fill(); ctx.restore();
  }

  // ---- 手臂 ----
  for (const s of ['L', 'R']) {
    const sh0 = P('sh' + s), el = P('el' + s), ha = P('ha' + s);
    const d0 = norm2(sh0, el);
    const sh = [sh0[0] + d0[0] * S * .012, sh0[1] + d0[1] * S * .012];
    const arm = band([sh, el, ha], [S * .042, S * .033, S * .026]);
    const spt = A(neck, -.02, (s === 'L' ? -1 : 1) * .1);
    line(ctx, [spt, [sh[0] - d0[0] * S * .004, sh[1] - d0[1] * S * .004]], lw * .7, .5);
    flat(ctx, arm, look.top, { mix: .72 });
    line(ctx, arm, lw, .72, true);
    // 袖口
    const dir = norm2(el, ha), px = -dir[1], py = dir[0];
    line(ctx, [[ha[0] + px * S * .026, ha[1] + py * S * .026], [ha[0] - px * S * .026, ha[1] - py * S * .026]], lw * .8, .6);
    // 手
    const hdir = norm2(el, ha);
    handShape(ctx, ha, hdir, S * .055, { lw: lw * .9, skin: look.skin });
  }

  if (lowBody) {
    // 坐/跪：衣摆垂到地面，盖住腿；脚边露出一点鞋尖
    const up2 = norm2(pel, neck), rt2 = norm2(shL, shR);
    const B2 = (base, u, r) => [base[0] + up2[0] * u * S + rt2[0] * r * S, base[1] + up2[1] * u * S + rt2[1] * r * S];
    const gndL = B2(pel, -.47, -.1), gndR = B2(pel, -.47, .1);
    const skirt = [
      B2(pel, -.02, -.105), gndL, B2(pel, -.42, -.055), B2(pel, -.42, .055), gndR, B2(pel, -.02, .105),
      B2(pel, -.06, .06), B2(pel, -.06, -.06),
    ];
    flat(ctx, skirt, look.top, { mix: .72 });
    line(ctx, skirt, lw, .7, true);
    // 鞋尖
    for (const s of ['L', 'R']) {
      const an = P('an' + s), to = P('to' + s);
      const dx = to[0] - an[0], dy = to[1] - an[1];
      const shoe = [[to[0] - dx * .5, to[1] - dy * .5], [to[0] + dx * .3, to[1] + dy * .2 + S * .01], [to[0] + dx * .1, to[1] + dy * .3], [to[0] - dx * .6, to[1] - dy * .2]];
      flat(ctx, shoe, look.shoe, { mix: .6 });
      line(ctx, shoe, lw * .9, .62, true);
    }
  }

  // ---- 脖子 ----
  const neckPts = [
    [neck[0] - S * .026, neck[1] + S * .012], [neck[0] + S * .026, neck[1] + S * .012],
    [headC[0] + S * .022, headC[1] + R * .55], [headC[0] - S * .022, headC[1] + R * .55],
  ];
  flat(ctx, neckPts, look.skin, { mix: .6, wash: false });
  line(ctx, [[neckPts[0][0], neckPts[0][1]], [neckPts[3][0], neckPts[3][1]]], lw * .7, .5);
  line(ctx, [[neckPts[1][0], neckPts[1][1]], [neckPts[2][0], neckPts[2][1]]], lw * .7, .5);

  // ---- 头 ----
  drawSimpleHead(ctx, headC, R, phi, pose, {
    expr: o.expr || 'calm',
    short: !!o.short,
    hairCol: look.hair,
  });

  ctx.restore();
  GA = 1;

  // 对外返回：手/头的位置（street.js 的伞要用 hand.R）
  const hinfo = {};
  for (const s of ['L', 'R']) {
    const p0 = P('el' + s), p1 = P('ha' + s);
    hinfo[s] = { p: p1, dir: norm2(p0, p1) };
  }
  return {
    head: { c: headC, r: R, fwd: [Math.sin(phi), 0, Math.cos(phi)] },
    hand: { L: P('haL'), R: P('haR') },
    handInfo: hinfo,
    pj: {
      neck, chest: ch, pel, shL, shR, elL: P('elL'), elR: P('elR'), haL: P('haL'), haR: P('haR'),
      hpL: P('hpL'), hpR: P('hpR'), knL: P('knL'), knR: P('knR'), anL: P('anL'), anR: P('anR'),
      toL: P('toL'), toR: P('toR'),
    },
    S,
  };
}

export function drawGirl(ctx, pose, place, o = {}) {
  // 站立/行走类镜头：直接用用户给的参考图（贴图）；坐/跪仍用简笔骨架
  const standing = (pose.hipY ?? .52) > .36;
  if (standing && SPR.front && o.sprite !== false) {
    const S = place.S, yaw = place.yaw ?? 0, pitch = place.pitch ?? .24;
    const pr = projector(place.x, place.y, S, yaw, pitch);
    const j = skeleton(pose);
    const sres = drawSpriteGirl(ctx, pose, place, o);
    const P = k => pr(j[k]);
    const phi = yaw + (j.headYaw ?? 0);
    const hinfo = {};
    for (const s of ['L', 'R']) { const p0 = P('el' + s), p1 = P('ha' + s); hinfo[s] = { p: p1, dir: norm2(p0, p1) }; }
    let handR = P('haR');
    if (sres && sres.view === 'back_up' && sres.hand) { handR = sres.hand; hinfo.R = { p: handR, dir: [0, -1] }; }
    return {
      head: { c: P('head'), r: .062 * S, fwd: [Math.sin(phi), 0, Math.cos(phi)] },
      hand: { L: P('haL'), R: handR },
      handInfo: hinfo, S,
    };
  }
  return drawFigure(ctx, pose, place, LOOK_HER, { ...o, short: false });
}
export function drawBoy(ctx, pose, place, o = {}) {
  return drawFigure(ctx, pose, place, LOOK_HIM, { ...o, short: true, alpha: o.alpha ?? .9 });
}

// ---------------------------------------------------------------- 雨伞
// c：伞面中心（在手上方）；伞面朝上、伞杆朝下（手握住手柄）
export function umbrella(ctx, c, r, rot = 0, o = {}) {
  r = r * .78;                       // 伞面别大得像帐篷
  const seg = o.seg ?? 8, lw = o.lw ?? Math.max(1.4, r * .03);
  const cos = Math.cos(rot), sin = Math.sin(rot);
  const rp = (x, y) => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos];
  const H = r * .42;                 // 伞面高度
  // 伞面：上缘弧（左→右）+ 下缘波峰（右→左）
  const domeN = 24, rimN = seg * 4;
  const dome = [], rim = [];
  for (let i = 0; i <= domeN; i++) {
    const u = i / domeN;
    dome.push(rp(-r + 2 * r * u, -H * Math.sin(Math.PI * u)));
  }
  for (let i = rimN; i >= 0; i--) {
    const u = i / rimN;
    const x = -r + 2 * r * u;
    const scallop = .5 + .5 * Math.cos(u * Math.PI * 2 * seg);   // 0..1
    rim.push(rp(x, r * .03 + r * .055 * scallop));
  }
  const canopy = [...dome, ...rim];
  // 伞布
  flat(ctx, canopy, mix3(PAL.bluePale, PAL.greyLight, .4), { mix: .55, wash: false });
  // 下缘的一条暗
  flat(ctx, [...rim.map(p => [p[0], p[1]]), ...rim.map(p => [p[0], p[1] - r * .09]).reverse()], mix3(PAL.greyDeep, PAL.bluePale, .5), { mix: .5, wash: false, a: .45 });
  line(ctx, canopy, lw * 1.05, .75, true);
  // 伞骨：从伞心到每个波峰
  ctx.save(); ctx.strokeStyle = rgba(INK, .55); ctx.lineWidth = lw * .7; ctx.lineCap = 'round';
  const apex = rp(0, -H);
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const x = -r + 2 * r * u, y = r * .03 + r * .09;
    const p = rp(x * .98, y);
    ctx.beginPath(); ctx.moveTo(apex[0], apex[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  }
  ctx.restore();
  // 伞杆：从伞顶往下，穿过伞心，手柄朝下
  const top = rp(0, -H - r * .05), grip = rp(0, r * .3);
  ctx.save(); ctx.strokeStyle = rgba(INK, .8); ctx.lineWidth = lw * 1.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(grip[0], grip[1]); ctx.stroke();
  // 手柄小弯钩（朝一侧）
  const h1 = rp(r * .03, r * .33), h2 = rp(r * .02, r * .38);
  ctx.beginPath(); ctx.moveTo(grip[0], grip[1]); ctx.quadraticCurveTo(h1[0], h1[1], h2[0], h2[1]); ctx.stroke();
  ctx.restore();
  return { tip: top, top: rim.slice().reverse(), poly: canopy, grip };
}

// ---------------------------------------------------------------- 手部特写
// 简笔的手：手掌 + 四根圆头手指 + 拇指；ang 为手掌朝向（弧度）
export function handClose(ctx, x, y, s, ang = 0, o = {}) {
  // 优先用用户提供的"手"素材（透明底），没有才退回简笔手
  const img = SPR.hand;
  if (img) {
    const GA0 = ctx.globalAlpha;
    const H = (o.handScale ?? 1.0) * s * 1.9;
    const w = img.width * H / img.height;
    ctx.save();
    ctx.globalAlpha = GA0 * (o.alpha ?? 1);
    ctx.translate(x, y);
    ctx.rotate(ang + (o.handRot ?? 0));
    ctx.filter = 'saturate(.95) contrast(1.0)';
    ctx.drawImage(img, -w * .5, -H * .56, w, H);
    ctx.filter = 'none';
    ctx.restore();
    return;
  }
  const lw = Math.max(1.1, s * .045);
  const skin = o.skin ?? SKIN_C;
  const oldGA = GA; GA = ctx.globalAlpha; ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.globalAlpha = 1;
  const k = o.curled ?? .4;
  // 手掌（圆角梯形）
  const palm = [
    [-.34 * s, -.18 * s], [.16 * s, -.24 * s], [.34 * s, -.12 * s],
    [.34 * s, .18 * s], [-.06 * s, .26 * s], [-.32 * s, .18 * s],
  ];
  // 四指（s 是手掌宽度尺度）
  const fingers = [];
  const xs = [-.28, -.1, .08, .26], lens = [.44, .56, .54, .4];
  for (let i = 0; i < 4; i++) {
    const bx = xs[i] * s, by = -.2 * s;
    const len = lens[i] * s * (1 - k * .25);
    const tipx = bx + (i - 1.5) * s * .03, tipy = by - len;
    fingers.push(band([[bx, by], [(bx + tipx) / 2, (by + tipy) / 2], [tipx, tipy]], [s * .078, s * .072, s * .06]));
  }
  // 拇指
  const thumb = band([[-.3 * s, .06 * s], [-.44 * s, -.08 * s], [-.5 * s, -.26 * s]], [s * .09, s * .082, s * .062]);
  // 画：先纸色（遮住后面的东西），再淡彩，再线
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(PAPER, .94);
  for (const f of fingers) { path(ctx, f, true); ctx.fill(); }
  path(ctx, thumb, true); ctx.fill();
  path(ctx, palm, true); ctx.fill();
  ctx.restore();
  flat(ctx, palm, skin, { mix: .55, wash: false });
  for (const f of fingers) flat(ctx, f, skin, { mix: .55, wash: false });
  flat(ctx, thumb, skin, { mix: .55, wash: false });
  line(ctx, palm, lw, .72, true);
  for (const f of fingers) line(ctx, f, lw * .9, .7, true);
  line(ctx, thumb, lw * .9, .7, true);
  // 指节 + 指甲（极少几笔）
  for (let i = 0; i < 4; i++) {
    const bx = xs[i] * s, by = -.2 * s;
    const len = lens[i] * s * (1 - k * .25);
    line(ctx, [[bx - s * .055, by - len * .5], [bx + s * .055, by - len * .52]], lw * .5, .3);
  }
  ctx.restore();
  GA = oldGA;
}
