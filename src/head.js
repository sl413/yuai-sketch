// 头部 v6：按公开绘画比例（三庭 / 五眼 / Loomis 侧脸）重写的速写人物头
// 参考比例见 REFERENCE.md：眼在头高中线、鼻底在眼—下巴一半、嘴在鼻底—下巴一半、
// 两眼间距=一眼宽、脸宽≈5 眼宽；侧脸按额—眉弓—鼻梁—鼻尖—人中—唇—下巴。
// 依赖 engine.figure() 返回的 prims.head { c:[x,y], r, fwd:[fx,fy,fz] }；
// front = -fwd[2]（>0 朝镜头），turnX = fwd[0]（<0 脸朝画面左）。
import { PAL, PAPER, mix3, clamp, lerp, TAU, rng, n2 } from './core.js';

// —— 颜色 ——
const HAIR = [150, 110, 82];        // 暖棕（比旧版亮一点，少一点"假发感"）
const HAIR_D = [94, 68, 52];
const HAIR_L = [212, 178, 142];
const SKIN = [244, 214, 188];
const SKIN_SH = [214, 176, 154];
const SKIN_WARM = [252, 226, 204];
const BLUSH = [232, 178, 164];
const INKC = [44, 38, 32];
let GA = 1;
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a * GA})`;

// —— 画笔 ——
function smoothPath(ctx, pts, closed = false) {
  const P = pts, n = P.length; if (n < 2) return;
  const g = i => closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)];
  ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
function penSmooth(ctx, pts, w = 1.2, alpha = .6) {
  if (!pts || pts.length < 2) return;
  ctx.save(); ctx.strokeStyle = rgba(INKC, alpha); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  smoothPath(ctx, pts); ctx.stroke(); ctx.restore();
}
function pen(ctx, pts, w = 1.2, alpha = .6, wob = .15) {
  if (!pts || pts.length < 2) return;
  ctx.save(); ctx.strokeStyle = rgba(INKC, alpha); ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const j = (i > 0 && i < pts.length - 1) ? (n2(i * 2.6, w * 6, 2) - .5) * wob : 0;
    if (i === 0) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0] + j, pts[i][1] + j * .4);
  }
  ctx.stroke(); ctx.restore();
}
function fillPoly(ctx, pts, style, alpha = 1, op = 'multiply') {
  ctx.save(); ctx.globalCompositeOperation = op; ctx.globalAlpha = alpha * GA; ctx.fillStyle = style;
  smoothPath(ctx, pts, true); ctx.fill(); ctx.restore();
}
const paperFill = (ctx, pts, a = .95) => fillPoly(ctx, pts, `rgb(${PAPER[0]},${PAPER[1]},${PAPER[2]})`, a, 'source-over');
const skinFill = (ctx, pts, a = .9) => fillPoly(ctx, pts, `rgba(${SKIN[0]},${SKIN[1]},${SKIN[2]},${a})`, 1, 'source-over');
// 头发渐变：上亮下暗、一侧更暗
function hairGrad(ctx, pts, a = 1, darkRight = true) {
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const g = ctx.createLinearGradient(
    darkRight ? Math.min(...xs) : Math.max(...xs), Math.min(...ys),
    darkRight ? Math.max(...xs) : Math.min(...xs), Math.max(...ys));
  g.addColorStop(0, rgba(HAIR_L, .5 * a));
  g.addColorStop(.24, rgba(HAIR, .78 * a));
  g.addColorStop(.7, rgba(HAIR, .8 * a));
  g.addColorStop(1, rgba(HAIR_D, .72 * a));
  ctx.fillStyle = g; smoothPath(ctx, pts, true); ctx.fill(); ctx.restore();
}
// 一条发丝（两端细、中间粗）
function strand(ctx, pts, w, alpha = .4) {
  if (!pts || pts.length < 2) return;
  ctx.save(); ctx.strokeStyle = rgba(INKC, alpha); ctx.lineCap = 'round';
  for (let i = 0; i < pts.length - 1; i++) {
    const u = i / (pts.length - 2);
    ctx.lineWidth = w * (.45 + .55 * Math.sin(Math.PI * (0.15 + u * .7)));
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
  }
  ctx.restore();
}

// ======================= 头 =======================
export function drawHead(ctx, prims, pose, place, o = {}) {
  const h = prims.head; if (!h) return;
  GA = ctx.globalAlpha;
  const c = h.c, r = h.r, f = h.fwd;
  const front = -f[2], turnX = f[0];
  const fv = clamp((front + .16) / .84);          // 0 背 → 1 正
  const prof = clamp((Math.abs(turnX) - .72) / .26); // 1 纯侧
  const side = turnX < 0 ? -1 : 1;
  const expr = o.expr || 'calm';
  const seed = o.seed ?? 31, R = rng(seed * 13 + 5);
  const detail = r > 30 ? 1 : r > 19 ? .62 : .3;
  const lw = Math.max(.8, r * .026);
  const roll = (pose.headSide ?? 0) * .42;
  const cro = Math.cos(roll), sro = Math.sin(roll);
  const RP = (x, y) => [c[0] + (x * r) * cro - (y * r) * sro, c[1] + (x * r) * sro + (y * r) * cro];
  const hb = pose.hairBlow ?? 0;
  const sway = -hb * .45;
  ctx.save();
  if (o.alpha !== undefined) GA *= o.alpha;
  ctx.globalAlpha = 1;

  const H = { ctx, c, r, RP, side, turnX, fv, prof, expr, detail, lw, R, sway, hb, o };

  // 1) 后发（在脖子后面）
  backHair(H);
  // 2) 脖子
  neck(H);
  // 3) 脸
  let facePts = null;
  if (o.short) { /* 男生：画短发、不画脸 */ }
  else if (fv > .12) {
    facePts = prof > .52 ? profileFace(H) : frontFace(H);
  } else {
    backHeadDetail(H);
  }
  // 4) 前发（刘海 / 鬓发 / 两侧长发）
  frontHair(H, facePts);
  // 5) 高光与飞发
  hairShine(H);

  ctx.restore();
}

// ---------- 后发 ----------
function backHair(H) {
  const { ctx, r, RP, sway, fv, prof, side, R, detail, o, lw } = H;
  if (prof > .5 && fv >= .22 && !o.short) {
    // 纯侧脸：后脑 + 后颈长发（x<0 是脑后一侧；x>0 是脸朝的方向）
    const P2 = (x, y) => RP(x * side, y);
    const pts = [
      P2(-.05, -1.02), P2(-.36, -1.08), P2(-.7, -.96), P2(-.94, -.7), P2(-1.04, -.3),
      P2(-1.05, .3), P2(-1.0, .9), P2(-.9, 1.4), P2(-.78, 1.9), P2(-.6, 2.26),
      P2(-.42, 2.44), P2(-.28, 2.2), P2(-.22, 1.7), P2(-.2, 1.1), P2(-.18, .6),
      P2(-.14, .18), P2(-.08, -.22), P2(-.01, -.6),
    ];
    paperFill(ctx, pts, .95);
    hairGrad(ctx, pts, 1, false);
    fillPoly(ctx, [P2(-.2, -.5), P2(-.5, -.65), P2(-.9, -.3), P2(-.95, .6), P2(-.7, 1.2), P2(-.4, .4), P2(-.25, -.2)], rgba(HAIR_D, .85), .22 + .14 * detail);
    fillPoly(ctx, [P2(-.4, 1.2), P2(-.6, 1.9), P2(-.45, 2.3), P2(-.26, 2.1), P2(-.3, 1.4)], rgba(HAIR_D, .85), .18);
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      strand(ctx, [P2(-.1 - u * .4, -.95), P2(-.3 - u * .45, -.3), P2(-.4 - u * .4, .8), P2(-.36 - u * .25, 1.9)], r * .012, .14);
    }
    return;
  }
  if (o.short) {
    // 男生短发：贴头骨的短发轮廓，后颈露出一点
    const pts = [
      RP(-.02, -1.12), RP(.4, -1.07), RP(.72, -.9), RP(.9, -.58), RP(.96, -.14),
      RP(.98, .28), RP(.94, .64), RP(.82, .92), RP(.6, 1.06), RP(.32, 1.1),
      RP(-.32, 1.1), RP(-.6, 1.06), RP(-.82, .92), RP(-.94, .64), RP(-.98, .28),
      RP(-.96, -.14), RP(-.9, -.58), RP(-.72, -.9), RP(-.4, -1.07),
    ];
    paperFill(ctx, pts, .95);
    hairGrad(ctx, pts, 1, true);
    for (let i = 0; i < 5; i++) {
      const x = lerp(-.5, .5, i / 4);
      strand(ctx, [RP(x * .3, -1.02), RP(x * .6, -.6), RP(x, -.2)], r * .012, .12);
    }
    fillPoly(ctx, [RP(-.96, .2), RP(-.6, -.2), RP(-.5, .8), RP(-.84, .9)], rgba(HAIR_D, .8), .18);
    fillPoly(ctx, [RP(.6, -.4), RP(.96, .0), RP(.9, .8), RP(.66, .4)], rgba(HAIR_D, .8), .1);
    return;
  }
  const backView = fv < .22;
  const longPts = [
    RP(-.03, -1.15), RP(.36, -1.1), RP(.7, -.96), RP(.92, -.62), RP(1.0, -.16),
    RP(1.03, .4), RP(1.0, .98), RP(.94 + sway * .3, 1.5), RP(.84 + sway * .5, 1.98),
    RP(.7 + sway * .75, 2.36), RP(.52 + sway, 2.58), RP(.3 + sway, 2.4), RP(.06 + sway, 2.56),
    RP(-.18 + sway, 2.4), RP(-.42 + sway, 2.52), RP(-.64 + sway, 2.3), RP(-.8 + sway * .8, 1.9),
    RP(-.92 + sway * .5, 1.35), RP(-1.0 + sway * .3, .75), RP(-1.03, .15), RP(-1.0, -.4),
    RP(-.9, -.75), RP(-.64, -1.0), RP(-.34, -1.12),
  ];
  const pts = backView ? longPts : [
    RP(-.03, -1.15), RP(.36, -1.1), RP(.7, -.96), RP(.92, -.62), RP(1.0, -.16),
    RP(1.03, .4), RP(1.0, .9), RP(.92, 1.22), RP(.66, 1.3), RP(.24, 1.34),
    RP(-.24, 1.34), RP(-.66, 1.3), RP(-.92, 1.22), RP(-1.0, .9), RP(-1.03, .4),
    RP(-1.0, -.4), RP(-.9, -.75), RP(-.64, -1.0), RP(-.34, -1.12),
  ];
  paperFill(ctx, pts, .95);
  hairGrad(ctx, pts, 1, true);
  fillPoly(ctx, [RP(-.98, -.1), RP(-.66, -.35), RP(-.6, .6), RP(-.86 + sway * .6, 1.3), RP(-1.0 + sway * .4, .7)], rgba(HAIR_D, .8), .22 + .16 * detail);
  fillPoly(ctx, [RP(.7, -.7), RP(1.0, -.2), RP(.96, .7), RP(.76 + sway * .6, 1.5), RP(.6, .2)], rgba(HAIR_D, .8), .1 + .06 * detail);
  const nS = Math.round(4 + detail * 4);
  for (let i = 0; i < nS; i++) {
    const u = i / Math.max(1, nS - 1);
    const x0 = lerp(-.42, .5, u), x1 = lerp(-.9, .96, u), x2 = lerp(-1.0, 1.0, u) + sway;
    const y2 = backView ? lerp(1.5, 2.44, ((i * 37) % 10) / 10) : lerp(1.0, 1.3, ((i * 37) % 10) / 10);
    const pts2 = [];
    for (let k = 0; k <= 8; k++) {
      const q = k / 8;
      pts2.push(RP((1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * x1 + q * q * x2,
        (1 - q) * (1 - q) * (-1.06) + 2 * (1 - q) * q * (.4) + q * q * y2));
    }
    strand(ctx, pts2, lw * .6, .1 + .05 * detail);
  }
  if (backView) {
    pen(ctx, [RP(.02, -1.14), RP(-.02, -.7), RP(-.07, -.3)], lw * .9, .35, .3);
    for (let i = 0; i < 2 + Math.round(detail * 2); i++) {
      const x = lerp(-.6, .55, R());
      pen(ctx, [RP(x * .5, -1.0), RP(x * .8, -.6), RP(x, -.25 + R() * .15)], lw * .55, .18, .3);
    }
  }
}

// ---------- 脖子（细长，正常比例） ----------
function neck(H) {
  const { ctx, r, RP, lw, detail } = H;
  const pts = [RP(-.22, .7), RP(-.2, .94), RP(-.24, 1.16), RP(-.19, 1.3),
  RP(.19, 1.3), RP(.24, 1.16), RP(.2, .94), RP(.22, .7)];
  paperFill(ctx, pts, .95); skinFill(ctx, pts, .95);
  fillPoly(ctx, [RP(-.26, .72), RP(0, .84), RP(.26, .72), RP(.2, .98), RP(0, 1.04), RP(-.2, .98)], rgba(SKIN_SH, .9), .28);
  pen(ctx, [RP(-.24, .86), RP(-.22, 1.02), RP(-.25, 1.2)], lw * .6, .24, .12);
  pen(ctx, [RP(.24, .86), RP(.22, 1.02), RP(.25, 1.2)], lw * .6, .22, .12);
  fillPoly(ctx, [RP(-.25, .8), RP(-.2, 1.05), RP(-.24, 1.26), RP(-.25, .95)], rgba(SKIN_SH, .8), .14 * detail + .04);
}

// ---------- 正 / 3/4 脸 ----------
function frontFace(H) {
  const { ctx, r, RP, side, turnX, expr, lw, detail, R } = H;
  const fc = [H.c[0] + turnX * r * .07, H.c[1] + r * .08];
  const F = (x, y) => [fc[0] + x * r, fc[1] + y * r];
  const eyeY = -.10, browY = -.31, noseTip = .40, mouthY = .62;
  const face = [
    F(-.06, -1.0), F(.26, -.97), F(.52, -.86), F(.72, -.66), F(.83, -.38),
    F(.86, -.06), F(.83, .26), F(.74, .5), F(.56, .7), F(.3, .86), F(.06, .93),
    F(-.06, .93), F(-.3, .86), F(-.56, .7), F(-.74, .5), F(-.83, .26), F(-.86, -.06),
    F(-.83, -.38), F(-.72, -.66), F(-.52, -.86), F(-.26, -.97),
  ];
  paperFill(ctx, face, .97); skinFill(ctx, face, .95);
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  const wg = ctx.createRadialGradient(F(.06, -.45)[0], F(.06, -.45)[1], 0, F(.06, -.45)[0], F(.06, -.45)[1], r * 1.15);
  wg.addColorStop(0, rgba(SKIN_WARM, .5)); wg.addColorStop(1, 'rgba(252,226,204,0)');
  ctx.fillStyle = wg; smoothPath(ctx, face, true); ctx.fill(); ctx.restore();
  fillPoly(ctx, [F(side * .55, -.5), F(side * .86, -.05), F(side * .8, .45), F(side * .45, .78), F(side * .3, .15)], rgba([210, 178, 176], 1), .1 * detail + .03);
  fillPoly(ctx, [F(-.46, .78), F(0, .92), F(.46, .78), F(.3, .7), F(0, .75), F(-.3, .7)], rgba(SKIN_SH, 1), .1);
  fillPoly(ctx, [F(-.6, .16), F(-.42, .04), F(-.3, .16), F(-.44, .3), F(-.6, .28)], rgba(SKIN_SH, 1), .06);
  fillPoly(ctx, [F(.6, .16), F(.42, .04), F(.3, .16), F(.44, .3), F(.6, .28)], rgba(SKIN_SH, 1), .06);
  penSmooth(ctx, [F(-.84, .02), F(-.8, .3), F(-.7, .52), F(-.52, .72), F(-.28, .87), F(-.03, .93)], lw * .9, .34);
  penSmooth(ctx, [F(.84, .02), F(.8, .3), F(.7, .52), F(.52, .72), F(.28, .87)], lw * .9, .28);
  const e = F(side * .88, .02);
  if (detail > .4) pen(ctx, [[e[0] - side * r * .02, e[1] - r * .18], [e[0] + side * r * .1, e[1] - r * .06], [e[0] + side * r * .06, e[1] + r * .16], [e[0] - side * r * .02, e[1] + r * .2]], lw * .6, .3, .15);

  const eyeW = .34 * r, eyeH = .19 * r, eyeGap = .34 * r;
  const farK = clamp(1 - Math.abs(turnX) * .34, .64, 1);
  const shift = turnX * r * .05;
  drawEyeFront(H, fc[0] + side * eyeGap + shift, fc[1] + eyeY * r, eyeW, eyeH, expr, 1, side);
  drawEyeFront(H, fc[0] - side * eyeGap + shift, fc[1] + eyeY * r, eyeW * farK, eyeH * (.92 + .08 * farK), expr, -1, side);
  drawBrowFront(H, fc[0] + side * eyeGap + shift, fc[1] + browY * r, eyeW * 1.02, expr);
  drawBrowFront(H, fc[0] - side * eyeGap + shift, fc[1] + browY * r, eyeW * 1.02 * farK, expr);

  const nx = fc[0] + turnX * r * .06;
  if (detail > .3) {
    fillPoly(ctx, [[nx - r * .015, fc[1] - r * .06], [nx + r * .05, fc[1] + r * .12], [nx + r * .1, fc[1] + noseTip * r], [nx + r * .02, fc[1] + noseTip * r]], rgba(SKIN_SH, .9), .13);
    pen(ctx, [[nx + r * .02, fc[1] + (noseTip - .06) * r], [nx + r * .06, fc[1] + (noseTip - .01) * r], [nx - r * .03, fc[1] + (noseTip + .03) * r]], lw * .45, .26, .08);
    fillPoly(ctx, [[nx - r * .04, fc[1] + (noseTip + .02) * r], [nx + r * .07, fc[1] + (noseTip + .01) * r], [nx + r * .05, fc[1] + (noseTip + .05) * r]], rgba(SKIN_SH, 1), .18);
  } else {
    pen(ctx, [[nx + r * .02, fc[1] + (noseTip - .06) * r], [nx + r * .06, fc[1] + noseTip * r]], lw * .45, .22, .1);
  }
  drawMouthFront(H, fc[0] + turnX * r * .04, fc[1] + mouthY * r, r * .34, expr, detail);

  if (detail > .45) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    for (const s of [-1, 1]) {
      const p = F(s * .56, .24), gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * .3);
      gg.addColorStop(0, rgba(BLUSH, .16)); gg.addColorStop(1, 'rgba(232,178,164,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p[0], p[1], r * .3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  fillPoly(ctx, [F(-.62, -1.0), F(.62, -1.0), F(.56, -.72), F(0, -.6), F(-.56, -.72)], rgba(SKIN_SH, 1), .12 * detail + .03);
  return face;
}

// 眼睛
function drawEyeFront(H, cx, cy, w, h, expr, dir, side) {
  const { ctx, lw, detail, r } = H;
  const rx = w * .5, ry = h * .5;
  const closed = expr === 'down' || expr === 'smile';
  const lookY = expr === 'up' ? -.2 : expr === 'tear' ? 0 : .06;
  if (closed) {
    penSmooth(ctx, [[cx - rx, cy + ry * .3], [cx - rx * .3, cy + ry * .95], [cx + rx * .45, cy + ry * .7], [cx + rx * .95, cy + ry * .05]], lw * 1.15, .8);
    if (detail > .45) for (let k = 0; k < 2; k++) pen(ctx, [[cx + rx * (.5 + k * .16), cy + ry * (.55 - k * .1)], [cx + rx * (.66 + k * .2), cy + ry * (1.0 - k * .2)]], lw * .5, .42, .08);
    return;
  }
  const sc = [[cx - rx * .94, cy + ry * .1], [cx - rx * .55, cy - ry * .5], [cx + rx * .1, cy - ry * .62], [cx + rx * .85, cy - ry * .22], [cx + rx * .94, cy + ry * .1], [cx + rx * .35, cy + ry * .55], [cx - rx * .42, cy + ry * .5]];
  fillPoly(ctx, sc, rgba([250, 242, 230], .85), 1, 'source-over');
  penSmooth(ctx, [[cx - rx * .96, cy + ry * .14], [cx - rx * .48, cy - ry * .46], [cx + rx * .2, cy - ry * .58], [cx + rx * .82, cy - ry * .2], [cx + rx * .98, cy - ry * .02]], lw * .95, .8);
  if (detail > .4) penSmooth(ctx, [[cx - rx * .75, cy - ry * .75], [cx - rx * .2, cy - ry * 1.05], [cx + rx * .5, cy - ry * .9], [cx + rx * .85, cy - ry * .55]], lw * .4, .22);
  pen(ctx, [[cx + rx * .8, cy + ry * .2], [cx + rx * .3, cy + ry * .62], [cx - rx * .35, cy + ry * .52], [cx - rx * .82, cy + ry * .22]], lw * .4, .2, .08);
  const ir = Math.min(rx * .36, ry * .9), ix = cx + rx * .02, iy = cy + ry * .14 + lookY * ry;
  ctx.save();
  const eg = ctx.createRadialGradient(ix, iy - ir * .2, ir * .15, ix, iy, ir);
  eg.addColorStop(0, rgba([164, 118, 80], .95)); eg.addColorStop(.55, rgba([104, 72, 52], .95)); eg.addColorStop(1, rgba([52, 38, 30], .95));
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
  ctx.fillStyle = rgba([24, 18, 16], .9); ctx.beginPath(); ctx.arc(ix, iy, ir * .34, 0, TAU); ctx.fill();
  if (detail > .35) { ctx.fillStyle = 'rgba(255,253,248,.8)'; ctx.beginPath(); ctx.arc(ix - ir * .28, iy - ir * .3, ir * .2, 0, TAU); ctx.fill(); }
  ctx.restore();
  // 上眼睑压住虹膜上缘
  penSmooth(ctx, [[cx - rx * .9, cy + ry * .1], [cx - rx * .4, cy - ry * .4], [cx + rx * .2, cy - ry * .52], [cx + rx * .8, cy - ry * .18]], lw * .8, .62);
  // 卧蚕（很淡）
  if (detail > .5) {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const p2 = [cx, cy + ry * .72];
    const g2 = ctx.createRadialGradient(p2[0], p2[1], 0, p2[0], p2[1], rx * .55);
    g2.addColorStop(0, rgba([255, 246, 236], .5)); g2.addColorStop(1, 'rgba(255,246,236,0)');
    ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(p2[0], p2[1], rx * .55, ry * .5, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (detail > .4) for (let k = 0; k < 2; k++) pen(ctx, [[cx + rx * (.85 + k * .04), cy - ry * (.12 + k * .1)], [cx + rx * (1.0 + k * .08), cy + ry * (.12 + k * .04)]], lw * .45, .5, .08);
  if (expr === 'tear' && detail > .4) {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const p = [cx - rx * .02, cy + ry * .5];
    const gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rx * .7);
    gg.addColorStop(0, rgba([255, 253, 247], .5)); gg.addColorStop(1, 'rgba(255,253,247,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p[0], p[1], rx * .7, 0, TAU); ctx.fill(); ctx.restore();
  }
}
function drawBrowFront(H, cx, cy, w, expr) {
  const { ctx, lw } = H;
  const hw = w * .5, lift = expr === 'up' ? -hw * .12 : 0, tilt = expr === 'down' ? .05 : 0;
  penSmooth(ctx, [[cx - hw, cy + hw * tilt], [cx - hw * .15, cy - hw * .18 + lift], [cx + hw, cy + hw * .02]], lw * .55, .26);
}
function drawMouthFront(H, cx, cy, w, expr, detail) {
  const { ctx, lw } = H;
  const hw = w * .5;
  const smile = expr === 'smile' ? .36 : expr === 'down' ? -.24 : expr === 'tear' ? -.1 : .16;
  penSmooth(ctx, [[cx - hw, cy - smile * hw * .2], [cx - hw * .4, cy + hw * .1 + smile * hw * .5], [cx - hw * .12, cy + hw * .06], [cx, cy + hw * .16 + smile * hw * .45], [cx + hw * .34, cy + hw * .08], [cx + hw, cy - smile * hw * .25]], lw * .7, .5);
  if (detail > .5) {
    fillPoly(ctx, [[cx - hw * .7, cy + hw * .22], [cx, cy + hw * .32], [cx + hw * .7, cy + hw * .2]], rgba([224, 164, 152], 1), .22);
    pen(ctx, [[cx - hw * .6, cy + hw * .06], [cx, cy + hw * .1], [cx + hw * .6, cy + hw * .04]], lw * .3, .14, .05);
  }
}

// ---------- 侧脸 ----------
function profileFace(H) {
  const { ctx, r, RP, side, expr, lw, detail } = H;
  const P2 = (x, y) => RP(x * side, y);
  // 侧面头型：额头到下巴（前面 x>0），后脑交给头发盖住
  const pts = [
    P2(.02, -1.02), P2(.4, -.94), P2(.62, -.74), P2(.74, -.46), P2(.74, -.24),
    P2(.7, -.1), P2(.94, .04), P2(.78, .12), P2(.74, .3), P2(.72, .5),
    P2(.8, .56), P2(.76, .62), P2(.78, .68), P2(.74, .76), P2(.6, .88),
    P2(.34, .8), P2(.08, .62), P2(-.04, .32), P2(-.06, .0), P2(-.02, -.42), P2(.12, -.76),
  ];
  paperFill(ctx, pts, .97); skinFill(ctx, pts, .95);
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  const wg = ctx.createRadialGradient(P2(.4, -.5)[0], P2(.4, -.5)[1], 0, P2(.4, -.5)[0], P2(.4, -.5)[1], r * 1.0);
  wg.addColorStop(0, rgba(SKIN_WARM, .5)); wg.addColorStop(1, 'rgba(252,226,204,0)');
  ctx.fillStyle = wg; smoothPath(ctx, pts, true); ctx.fill(); ctx.restore();
  // 前缘（额—鼻—唇—下巴）
  penSmooth(ctx, [pts[1], pts[2], pts[3], pts[4], pts[5], pts[6], pts[7], pts[8], pts[9], pts[10], pts[11], pts[12], pts[13], pts[14]], lw * 1.0, .55);
  // 下颌线
  penSmooth(ctx, [pts[14], pts[15], pts[16], pts[17], pts[18]], lw * .85, .28);
  // 颊侧冷影
  fillPoly(ctx, [P2(.3, -.3), P2(.56, .1), P2(.42, .5), P2(.14, .44), P2(.08, -.05)], rgba([210, 178, 176], 1), .16 * detail + .04);
  // 眼睛（中线，靠前）
  const eyeC = P2(.5, -.1), eyeW = r * .33, eyeH = r * .17;
  const closed = expr === 'down' || expr === 'smile';
  if (closed) {
    penSmooth(ctx, [[eyeC[0] - eyeW * .5, eyeC[1]], [eyeC[0] - eyeW * .05, eyeC[1] + eyeH * .55], [eyeC[0] + eyeW * .45, eyeC[1] - eyeH * .05]], lw * 1.0, .78);
    if (detail > .4) pen(ctx, [[eyeC[0] + eyeW * .3, eyeC[1] + eyeH * .1], [eyeC[0] + eyeW * .5, eyeC[1] + eyeH * .8]], lw * .45, .4, .08);
  } else {
    penSmooth(ctx, [[eyeC[0] - eyeW * .5, eyeC[1] + eyeH * .18], [eyeC[0] - eyeW * .08, eyeC[1] - eyeH * .5], [eyeC[0] + eyeW * .38, eyeC[1] - eyeH * .38], [eyeC[0] + eyeW * .5, eyeC[1] + eyeH * .1]], lw * 1.0, .8);
    const ir = eyeH * .5;
    ctx.save(); ctx.fillStyle = rgba([96, 68, 50], .95); ctx.beginPath(); ctx.arc(eyeC[0] + eyeW * .02, eyeC[1] - eyeH * .06, ir, 0, TAU); ctx.fill();
    if (detail > .4) { ctx.fillStyle = 'rgba(255,253,248,.85)'; ctx.beginPath(); ctx.arc(eyeC[0] + eyeW * .0 - ir * .3, eyeC[1] - eyeH * .2, ir * .26, 0, TAU); ctx.fill(); }
    ctx.restore();
    pen(ctx, [[eyeC[0] + eyeW * .48, eyeC[1] + eyeH * .1], [eyeC[0] + eyeW * .68, eyeC[1] + eyeH * .5]], lw * .4, .4, .08);
  }
  // 眉
  penSmooth(ctx, [[eyeC[0] - eyeW * .5, eyeC[1] - r * .2], [eyeC[0] + eyeW * .02, eyeC[1] - r * .24], [eyeC[0] + eyeW * .5, eyeC[1] - r * .2]], lw * .55, .24);
  // 眉弓下方的眼窝影
  fillPoly(ctx, [P2(.34, -.34), P2(.56, -.28), P2(.56, -.12), P2(.32, -.16)], rgba(SKIN_SH, 1), .18);
  // 鼻梁影 / 鼻翼 / 鼻底
  fillPoly(ctx, [P2(.56, -.28), P2(.66, -.02), P2(.6, .12), P2(.44, .06), P2(.44, -.16)], rgba([214, 180, 176], 1), .15);
  pen(ctx, [P2(.74, .05), P2(.8, .08)], lw * .5, .32, .06);
  // 唇：上唇 + 下唇两条弧，唇间一点深色
  penSmooth(ctx, [P2(.62, .54), P2(.78, .54), P2(.84, .58), P2(.74, .6)], lw * .55, .48);
  penSmooth(ctx, [P2(.72, .62), P2(.8, .62), P2(.74, .66)], lw * .5, .42);
  if (detail > .45) fillPoly(ctx, [P2(.67, .61), P2(.76, .62), P2(.74, .66), P2(.66, .65)], rgba([224, 164, 152], 1), .24);
  if (detail > .45) penSmooth(ctx, [P2(.66, .66), P2(.74, .68), P2(.71, .71)], lw * .4, .26);
  // 下巴的影
  fillPoly(ctx, [P2(.6, .72), P2(.72, .78), P2(.6, .86), P2(.44, .78), P2(.5, .68)], rgba(SKIN_SH, 1), .16);
  fillPoly(ctx, [P2(.26, .1), P2(.44, .02), P2(.54, .2), P2(.36, .3)], rgba(SKIN_WARM, .8), 1, 'source-over');
  // 耳（在眼—鼻底之间、耳后）
  if (detail > .35) {
    const ear = [P2(-.04, .0), P2(.04, -.02), P2(.1, .08), P2(.08, .22), P2(-.01, .26), P2(-.08, .2), P2(-.08, .06)];
    paperFill(ctx, ear, .9); skinFill(ctx, ear, .9);
    penSmooth(ctx, [P2(-.02, .03), P2(.04, .05), P2(.05, .16), P2(-.01, .2), P2(-.06, .14)], lw * .45, .3);
    penSmooth(ctx, [P2(.02, .0), P2(.07, .06), P2(.06, .16)], lw * .4, .24);
  }
  // 腮红 / 刘海投影
  if (detail > .45) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const p = P2(.3, .18), gg = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * .22);
    gg.addColorStop(0, rgba(BLUSH, .45)); gg.addColorStop(1, 'rgba(232,178,164,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p[0], p[1], r * .22, 0, TAU); ctx.fill(); ctx.restore();
  }
  fillPoly(ctx, [P2(.1, -.95), P2(.68, -.85), P2(.64, -.55), P2(.4, -.5), P2(.15, -.6)], rgba(SKIN_SH, 1), .12);
  return pts;
}



// ---------- 前发：偏分刘海 + 脸侧发 + 肩前长发 ----------
function frontHair(H) {
  const { ctx, c, r, RP, side, turnX, prof, lw, detail, fv } = H;
  if (H.o.short || fv < .22) return;
  if (prof > .5) {
    // 侧脸：发际线从额顶斜扫到眉上，额头大部分被头发盖住
    const P2 = (x, y) => RP(x * side, y);
    const fr = [
      P2(-.06, -1.04), P2(.3, -1.02), P2(.56, -.88), P2(.68, -.66), P2(.7, -.44),
      P2(.6, -.4), P2(.5, -.52), P2(.38, -.38), P2(.24, -.52), P2(.12, -.4),
      P2(.02, -.5), P2(-.08, -.72),
    ];
    paperFill(ctx, fr, .55);
    hairGrad(ctx, fr, 1, false);
    strand(ctx, [P2(.46, -.98), P2(.44, -.8), P2(.5, -.62), P2(.56, -.46)], r * .014, .2);
    strand(ctx, [P2(.24, -1.0), P2(.16, -.8), P2(.22, -.6), P2(.3, -.44)], r * .013, .18);
    strand(ctx, [P2(.02, -.98), P2(-.04, -.8), P2(.02, -.66)], r * .012, .16);
    return;
  }
  const partX = .14, partY = -1.06;
  const fringe = [
    RP(-.98, -.48), RP(-.9, -.8), RP(-.55, -1.02), RP(-.05, -1.12), RP(.45, -1.05), RP(.8, -.85), RP(.98, -.5), RP(1.0, -.1),
    RP(.94, -.3), RP(.8, -.36), RP(.66, -.3), RP(.5, -.44), RP(.3, -.5), RP(.12, -.44), RP(-.06, -.54),
    RP(-.24, -.5), RP(-.42, -.6), RP(-.6, -.56), RP(-.76, -.64), RP(-.9, -.52), RP(-.98, -.38),
  ];
  paperFill(ctx, fringe, .55);
  hairGrad(ctx, fringe, 1, false);
  pen(ctx, [RP(partX, partY), RP(partX - .1, -.86), RP(partX - .26, -.66)], lw * .9, .4, .25);
  strand(ctx, [RP(partX - .02, -1.04), RP(-.2, -.82), RP(-.5, -.6), RP(-.82, -.46)], lw * .7, .26);
  strand(ctx, [RP(partX + .12, -1.0), RP(.36, -.82), RP(.62, -.64), RP(.86, -.5)], lw * .55, .2);
  strand(ctx, [RP(partX - .1, -1.02), RP(-.34, -.78), RP(-.66, -.6)], lw * .5, .18);
  // 发际线处的几根碎发，破一破"头盔"感
  for (let i = 0; i < 4; i++) {
    const x = -.72 + i * .42;
    pen(ctx, [RP(x, -.72 + Math.sin(i) * .05), RP(x + .06, -.6), RP(x + .1, -.5 + Math.cos(i) * .04)], lw * .4, .14, .25);
  }

  if (prof < .55) {
    for (const s2 of [-side, side]) {
      const ox = s2 * (.92 - Math.abs(turnX) * .04);
      const len = s2 === side ? .55 : .95;
      const ptsL = [RP(ox, -.42), RP(ox + s2 * .02, -.1), RP(ox + s2 * .01, .25), RP(ox + s2 * .03, len)];
      const w0 = .055, w1 = .012;
      const left = [], right = [];
      for (let i = 0; i < ptsL.length; i++) {
        const u = i / (ptsL.length - 1), w = lerp(w0, w1, u) * r;
        const a = ptsL[Math.max(0, i - 1)], b = ptsL[Math.min(ptsL.length - 1, i + 1)];
        let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        left.push([ptsL[i][0] + nx * w, ptsL[i][1] + ny * w]); right.push([ptsL[i][0] - nx * w, ptsL[i][1] - ny * w]);
      }
      const poly = [...left, ...right.reverse()];
      paperFill(ctx, poly, .35); fillPoly(ctx, poly, rgba(HAIR, .8), .85);
      pen(ctx, left, lw * .55, .26, .18); pen(ctx, right, lw * .55, .26, .18);
    }
  }
  const falls = prof > .5 ? [-side] : [-1, 1];   // 侧脸：长发在脑后，不在脸前
  for (const s2 of falls) {
    const off = turnX * r * .08;
    const outer = [[.9, -.3], [1.03, .2], [1.06, .8], [1.02, 1.35], [.94, 1.85], [.76, 2.26], [.54, 2.5]];
    const inner = [[.92, -.4], [.88, .2], [.86, .8], [.78, 1.3], [.62, 1.72], [.44, 2.12], [.34, 2.4]];
    const t = [...outer.map(([x, y]) => [c[0] + s2 * x * r + off, c[1] + y * r]),
    ...inner.slice().reverse().map(([x, y]) => [c[0] + s2 * x * r + off, c[1] + y * r])];
    paperFill(ctx, t, .95);
    hairGrad(ctx, t, 1, s2 < 0);
    fillPoly(ctx, [t[7], t[8], t[9], t[10], [c[0] + s2 * .9 * r + off, c[1] + 1.1 * r], [c[0] + s2 * .93 * r + off, c[1] + .2 * r]], rgba(HAIR_D, .85), .18 * detail + .05);
    for (let k = 0; k < 2; k++) {
      const x0 = s2 * (.95 + k * .035);
      strand(ctx, [[c[0] + x0 * r + off, c[1] - .2 * r], [c[0] + (x0 + s2 * .04) * r + off, c[1] + .7 * r], [c[0] + (x0 + s2 * .02) * r + off, c[1] + 1.6 * r]], lw * .55, .16);
    }
  }
}

// ---------- 高光与飞发 ----------
function hairShine(H) {
  const { ctx, c, r, lw, detail, R } = H;
  if (detail < .35) return;
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgb(250,241,226)'; ctx.lineCap = 'round';
  ctx.globalAlpha = GA * (.22 + .1 * detail); ctx.lineWidth = Math.max(1.6, r * .09);
  ctx.beginPath(); ctx.arc(c[0] - r * .12, c[1] - r * .1, r * .8, Math.PI * 1.05, Math.PI * 1.38); ctx.stroke();
  ctx.globalAlpha = GA * (.1 + .06 * detail);
  ctx.beginPath(); ctx.arc(c[0] + r * .28, c[1] - r * .02, r * .82, Math.PI * 1.55, Math.PI * 1.7); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 2; i++) {
    const a = -Math.PI * (.32 + R() * .22), L = r * (.24 + R() * .18);
    const x0 = c[0] + Math.cos(a) * r * .84, y0 = c[1] + Math.sin(a) * r * .84;
    pen(ctx, [[x0, y0], [x0 + Math.cos(a) * L * .5, y0 + Math.sin(a) * L * .5 + r * .05],
    [x0 + Math.cos(a + .45) * L, y0 + Math.sin(a + .45) * L + r * .1]], lw * .5, .2, .5);
  }
}

function backHeadDetail(H) {
  const { ctx, RP, lw, detail, R } = H;
  pen(ctx, [RP(.02, -1.13), RP(-.02, -.7), RP(-.06, -.3)], lw * .9, .36, .3);
  for (let i = 0; i < 3 + Math.round(detail * 2); i++) {
    const x = lerp(-.6, .5, R());
    pen(ctx, [RP(x * .5, -1.0), RP(x * .8, -.6), RP(x, -.24 + R() * .14)], lw * .5, .16, .3);
  }
}
