// FX：雨、玻璃水珠、雾气、灯光光晕、水洼涟漪、呼吸白雾、光斑 —— 都是 t 的确定性函数
import { clamp, lerp, ss, TAU, rng, n2, fbm, rgba, hex, mix3, ellipse, rough, penStroke, drawPen, INK } from './engine.js';
import { PAL, eo, ei, seg, polyPath } from './core.js';

// ---------------- 室外雨丝 ----------------
// 预生成雨点参数；每帧只按 t 算位置，画成短促的钢笔斜线
export function makeRain(o = {}) {
  const R = rng(o.seed ?? 21), n = o.n ?? 240;
  const drops = [];
  for (let i = 0; i < n; i++) {
    drops.push({
      x: R() * (o.w ?? 2200) - 200, y: R() * (o.h ?? 1400) - 200,
      sp: (o.minSpeed ?? 520) + R() * (o.maxSpeed ?? 500),
      len: (o.minLen ?? 14) + R() * (o.maxLen ?? 34),
      a: .1 + R() * .5, w: .8 + R() * 1.6, ph: R() * 900, slant: o.slant ?? .34,
    });
  }
  return (ctx, t, oo = {}) => {
    const H = oo.h ?? 1400, W = oo.w ?? 2200;
    const alpha = (oo.alpha ?? 1);
    ctx.save(); ctx.strokeStyle = rgba(oo.col ?? PAL.greyDeep, .7); ctx.lineCap = 'round';
    for (const d of drops) {
      const fall = (d.y + d.sp * t + d.ph * 7) % (H + 160) - 80;
      const x = ((d.x + d.slant * (fall + 80) * 1.0) % (W + 200)) - 100;
      const len = d.len * (oo.lenMul ?? 1);
      const ax = x - d.slant * len, ay = fall - len;
      ctx.globalAlpha = d.a * alpha * (oo.gain ?? 1);
      ctx.lineWidth = d.w * (oo.wMul ?? 1);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(x, fall); ctx.stroke();
      // 高光断点：有些雨丝只有一半
      if (d.a > .45) { ctx.globalAlpha *= .6; ctx.beginPath(); ctx.moveTo(ax + (x - ax) * .55 + 1, ay + (fall - ay) * .55); ctx.lineTo(x - 1.5, fall - 1.2); ctx.stroke(); }
    }
    ctx.restore();
  };
}

// ---------------- 玻璃上的水珠（汇聚、滑落、拖出水痕） ----------------
export function makeGlassDrops(o = {}) {
  const R = rng(o.seed ?? 31), n = o.n ?? 34;
  const drops = [];
  for (let i = 0; i < n; i++) {
    const x = (o.x0 ?? 0) + R() * ((o.x1 ?? 1600) - (o.x0 ?? 0));
    const y = (o.y0 ?? 0) + R() * ((o.y1 ?? 900) - (o.y0 ?? 0));
    drops.push({
      x, y, r: (o.minR ?? 3) + R() * (o.maxR ?? 9),
      tb: R() * (o.bornSpan ?? 3), slide: (o.slideMin ?? 1.2) + R() * (o.slideMax ?? 4),
      sp: (o.slMin ?? 12) + R() * (o.slMax ?? 50), wob: 1 + R() * 3, ph: R() * TAU,
      trail: R() < (o.trailChance ?? .8) ? .5 + R() * .5 : 0, light: R() < .6,
    });
  }
  const bottom = o.y1 ?? 900;
  return (ctx, t, oo = {}) => {
    const gain = oo.gain ?? 1, alpha = oo.alpha ?? 1;
    ctx.save();
    for (const d of drops) {
      const age = t - d.tb; if (age < 0) continue;
      const grow = clamp(age / .7) * (d.r * (oo.growMul ?? 1));
      const st = age - d.slide;                      // 开始下滑的时刻
      let y = d.y, moved = 0;
      if (st > 0) { moved = d.sp * st * (1 + st * .25); y = d.y + moved; }
      if (y > bottom) continue;
      const x = d.x + Math.sin(d.ph + st * 2.1) * d.wob * clamp(st * .8);
      // 拖尾水痕：一条湿的、微微蜿蜒的线
      if (d.trail > 0 && moved > 8) {
        ctx.globalCompositeOperation = 'multiply';
        const n = 5, top = d.y + 4;
        ctx.strokeStyle = rgba(PAL.grey, .18 * d.trail * gain * alpha); ctx.lineWidth = d.r * .5;
        ctx.beginPath();
        for (let k = 0; k <= n; k++) {
          const u = k / n, yy = lerp(top, y - grow * .4, u), xx = d.x + Math.sin(d.ph + u * 3 + st) * d.wob * .7;
          k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
        ctx.strokeStyle = rgba([255, 255, 255], .5 * d.trail * gain * alpha); ctx.lineWidth = Math.max(.7, d.r * .22);
        ctx.beginPath();
        for (let k = 0; k <= n; k++) {
          const u = k / n, yy = lerp(top, y - grow * .4, u), xx = d.x + Math.sin(d.ph + u * 3 + st) * d.wob * .7 + d.r * .22;
          k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      // 水珠：透明淡彩 + 墨线勾边 + 高光点
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha * gain;
      const rr = Math.max(1.2, grow);
      ctx.fillStyle = rgba(PAL.greyLight, .32); ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 1.08, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(INK, .42); ctx.lineWidth = Math.max(.7, rr * .18);
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 1.08, .2, .15, TAU - .35); ctx.stroke();
      if (d.light) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(x - rr * .3, y - rr * .35, Math.max(.6, rr * .26), 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  };
}

// ---------------- 玻璃上的雾气 / 呼吸白雾 ----------------
// 每帧生成软边白雾斑（source-over，极低 alpha）
export function makeFog(o = {}) {
  const R = rng(o.seed ?? 41), n = o.n ?? 14;
  const blobs = [];
  for (let i = 0; i < n; i++) blobs.push({ x: R(), y: R(), r: .1 + R() * .3, ph: R() * TAU, sp: .02 + R() * .05, a: .04 + R() * .08 });
  return (ctx, t, x0, y0, w, h, oo = {}) => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (const b of blobs) {
      const x = x0 + (b.x + Math.sin(t * b.sp * 2 + b.ph) * .06) * w;
      const y = y0 + (b.y + Math.cos(t * b.sp * 1.7 + b.ph) * .05) * h;
      const r = b.r * Math.min(w, h) * (1 + .08 * Math.sin(t * .7 + b.ph));
      const a = b.a * (oo.gain ?? 1) * (oo.alpha ?? 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(oo.col ?? [255, 253, 248], a));
      g.addColorStop(.55, rgba(oo.col ?? [255, 253, 248], a * .5));
      g.addColorStop(1, rgba(oo.col ?? [255, 253, 248], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };
}

// 呼吸白雾：在玻璃某处一呼一吸地凝结又消散
export function breathFog(ctx, t, x, y, rx, ry, o = {}) {
  const cyc = o.cycle ?? 4.4, ph = o.phase ?? 0;
  const u = ((t + ph) % cyc) / cyc;                       // 0..1
  const a = Math.sin(clamp(u / .55) * Math.PI) * .5 + (u > .6 ? (1 - (u - .6) / .4) * .4 : 0);
  if (a <= .02) return;
  ctx.save(); ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,253,247,${a * .55})`);
  g.addColorStop(.6, `rgba(255,253,247,${a * .3})`);
  g.addColorStop(1, 'rgba(255,253,247,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, rx * (0.8 + u * .35), ry * (0.8 + u * .35), o.rot ?? -.05, 0, TAU); ctx.fill();
  // 细小的凝结水汽点
  const R = rng((o.seed ?? 3) + Math.floor(t * 12));
  ctx.fillStyle = `rgba(255,255,255,${a * .5})`;
  for (let i = 0; i < 14; i++) {
    const ang = R() * TAU, rr = R();
    ctx.beginPath(); ctx.arc(x + Math.cos(ang) * rx * rr, y + Math.sin(ang) * ry * rr, .8 + R() * 1.8, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ---------------- 灯光光晕 / 暖色光斑 ----------------
export function glow(ctx, t, x, y, r, col = PAL.lamp, a = .5, o = {}) {
  const br = (o.breathe ?? .12) * Math.sin(t * (o.rate ?? 1.3) + (o.phase ?? 0));
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * (1 + br));
  const cc = rgba(col, 1);
  g.addColorStop(0, rgba(col, clamp(a * (1 + br))));
  g.addColorStop(.35, rgba(col, a * .55));
  g.addColorStop(.72, rgba(col, a * .18));
  g.addColorStop(1, rgba(col, 0));
  ctx.save(); ctx.globalCompositeOperation = o.op ?? 'source-over';
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * (1 + br), 0, TAU); ctx.fill(); ctx.restore();
}
// 雨幕中被晕开的暖光斑（一圈圈柔光 + 中心亮点）
export function bokeh(ctx, t, pts, o = {}) {
  for (const p of pts) {
    const sc = 1 + .06 * Math.sin(t * (p.rate ?? 1.1) + (p.ph ?? 0));
    glow(ctx, t, p.x, p.y, (p.r ?? 26) * sc, p.col ?? PAL.lamp, (p.a ?? .5) * (o.gain ?? 1), { breathe: .18, rate: p.rate ?? 1.1, phase: p.ph ?? 0 });
    if (p.core !== false) { ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = rgba(mix3(p.col ?? PAL.lamp, [255, 255, 255], .45), .55 * (p.a ?? .5)); ctx.beginPath(); ctx.arc(p.x, p.y, (p.r ?? 26) * .13, 0, TAU); ctx.fill(); ctx.restore(); }
  }
}

// ---------------- 水洼涟漪 ----------------
export function makeRipples(o = {}) {
  const R = rng(o.seed ?? 55), n = o.n ?? 8, hits = [];
  for (let i = 0; i < n; i++) hits.push({ x: (o.x0 ?? 0) + R() * ((o.x1 ?? 800) - (o.x0 ?? 0)), y: (o.y0 ?? 0) + R() * ((o.y1 ?? 300) - (o.y0 ?? 0)), t: R() * (o.span ?? 8), per: 1.2 + R() * 2.2, r0: 4 + R() * 10, amp: .2 + R() * .25 });
  return (ctx, t, oo = {}) => {
    ctx.save(); ctx.strokeStyle = rgba(INK, .5 * (oo.alpha ?? 1)); ctx.lineCap = 'round';
    for (const h of hits) {
      for (let k = 0; k < 3; k++) {
        const tt = t - h.t - k * (h.per * .34);
        if (tt < 0) continue;
        const u = (tt % h.per) / h.per;
        const r = h.r0 + u * (oo.spread ?? 34);
        const a = (1 - u) * h.amp * (oo.gain ?? 1);
        ctx.globalAlpha = a; ctx.lineWidth = .9;
        ctx.beginPath(); ctx.ellipse(h.x, h.y, r, r * (oo.squash ?? .3), 0, 0, TAU); ctx.stroke();
      }
    }
    ctx.restore();
  };
}

// ---------------- 细雨落在伞面上溅起的小水花 ----------------
export function makeSplashes(o = {}) {
  const R = rng(o.seed ?? 66), n = o.n ?? 20, ev = [];
  for (let i = 0; i < n; i++) ev.push({ x: R(), y: R(), t: R() * (o.span ?? 6), per: .7 + R() * 1.6, sz: 2 + R() * 4 });
  return (ctx, t, x0, y0, w, h, oo = {}) => {
    ctx.save(); ctx.strokeStyle = rgba(oo.col ?? [255, 255, 255], .55);
    for (const e of ev) {
      const u = ((t + e.t) % e.per) / e.per;
      const cx = x0 + e.x * w, cy = y0 + e.y * h;
      const a = (1 - u) * .7 * (oo.gain ?? 1);
      for (let k = 0; k < 5; k++) {
        const ang = -Math.PI / 2 + (k - 2) * .5, L = e.sz * u * 3.2;
        ctx.globalAlpha = a; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L - u * u * 4); ctx.stroke();
      }
    }
    ctx.restore();
  };
}

// ---------------- 极淡的雨雾面（整片场景的空气感） ----------------
export function airVeil(ctx, t, o = {}) {
  const a = (o.a ?? .1) * (1 + .18 * Math.sin(t * .6 + (o.phase ?? 0)));
  const g = ctx.createLinearGradient(0, o.y0 ?? 0, 0, o.y1 ?? 1080);
  g.addColorStop(0, rgba(o.col ?? PAL.bluePale, a * (o.top ?? .6)));
  g.addColorStop(.5, rgba(o.col ?? PAL.bluePale, a));
  g.addColorStop(1, rgba(o.col ?? PAL.bluePale, a * (o.bottom ?? .4)));
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g;
  ctx.fillRect(0, o.y0 ?? 0, 1920, (o.y1 ?? 1080) - (o.y0 ?? 0)); ctx.restore();
}
