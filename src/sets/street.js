// 城市街巷外景 —— 可参数化的「钢笔淡彩速写页」（set-street 维护）
// 同一个 set 工厂服务 7 个外景镜头：
//   lane      巷子（一点透视，两侧店铺/卷帘门/招牌/电线/路灯）—— 4.1 / 6.3
//   puddle    贴地水洼特写（水面倒影 / 涟漪 / 雨滴打碎水镜）      —— 4.2
//   crossing  路口（斑马线、对街店面、路灯、信号灯）              —— 4.3
//   corner    空街角（近处转角楼、右侧街巷退远、远处路灯）        —— 4.4
//   wide      宽街远景（天际线、车灯、湿路面、彩虹、行人）        —— 6.4 / 9.3
// 风格不变量：钢笔墨线 + 透明淡彩两层；线会抖、会出头、会断；颜色先晕开；
// 底部字幕安全区（页 y≈918–1080）只留极淡纸面（safeVeil_）。
// 全部确定性：随机只来自 rng(seed)，动态只依赖 t。
import {
  Scene, PAL, PEN, ss, seg, clamp, lerp, TAU, rng, n2, fbm, hex, mix3, ellipse, spline,
  rgba, eio, eo, INK, PAPER, polyPath, polyRuns,
} from '../core.js';
import {
  makeRain, makeFog, glow, bokeh, makeRipples, makeSplashes, breathFog,
} from '../fx.js';
import { drawGirl, drawBoy, herWalk, herStand } from '../character.js';

// ---------------------------------------------------------------- 常量
const BR = 960, BC = 540;
const LAYERS = [{ id: 'back', par: .4 }, { id: 'mid', par: .82 }, { id: 'front', par: 1 }];
// 巷子一点透视：灭点在 (VP.x, VP.y)；r = 屏幕水平离灭点距离；f = 0 墙脚 → 1 屋檐
const VP = { x: 960, y: 592, rFar: 300, kTop: .652, kBot: .4 };
const LANE_FAR_Y = 712;
const laneHW = y => (y - VP.y) / VP.kBot;
const laneXL = y => VP.x - laneHW(y);
const laneXR = y => VP.x + laneHW(y);
const wallPt = (side, r, f) => [VP.x + side * r, lerp(VP.y + VP.kBot * r, VP.y - VP.kTop * r, f)];
const wallQuad = (side, r0, r1, f0, f1) => [
  wallPt(side, r0, f0), wallPt(side, r1, f0), wallPt(side, r1, f1), wallPt(side, r0, f1),
];
const ell = (cx, cy, rx, ry, n = 26) => ellipse(cx, cy, rx, ry, n);

// 简笔行人的走姿（不举伞，手臂自然摆）
function pedPose(ph) {
  const s = Math.sin(ph), c = Math.cos(ph);
  return {
    hipY: .515 + .008 * Math.abs(c), lean: .04, twist: .05 * s,
    legL: .32 * s, kneeL: .08 + .4 * Math.max(0, c),
    legR: -.32 * s, kneeR: .08 + .4 * Math.max(0, -c),
    armL: -.26 * s, bendL: .3, armR: .26 * s, bendR: .3, abdL: .08, abdR: .08,
    headYaw: 0, nod: .02, hairBlow: .1,
  };
}

// ---------------------------------------------------------------- 天气/时段
function mood(kind) {
  if (kind === 'after') return {
    skyTop: mix3(PAL.bluePale, [255, 255, 255], .28),
    skyBot: mix3(PAL.cream, PAL.greenPale, .38),
    cloud: mix3(PAL.greyLight, PAL.pinkPale, .5),
    cloudBelly: mix3(PAL.greyLight, PAL.violet, .2),
    haze: mix3(PAL.bluePale, PAL.greenPale, .3),
    city: mix3(PAL.stoneCool, PAL.bluePale, .45),
    city2: mix3(PAL.stone, PAL.greyLight, .4),
    wall: mix3(PAL.stone, PAL.stoneCool, .55),
    wallShade: mix3(PAL.grey, PAL.violet, .3),
    road: mix3(PAL.road, PAL.paper, .5),
    roadShade: mix3(PAL.greyDeep, PAL.blue, .35),
    puddle: mix3(PAL.bluePale, PAL.greenPale, .25),
    warm: .55, warmA: .5, glowCol: mix3(PAL.cream, PAL.greenPale, .35),
    rain: 0, inkA: .88,
  };
  if (kind === 'cold') return {
    skyTop: mix3(PAL.bluePale, PAL.blue, .5),
    skyBot: mix3(PAL.greyLight, PAL.bluePale, .5),
    cloud: mix3(PAL.greyLight, PAL.bluePale, .5),
    cloudBelly: mix3(PAL.grey, PAL.violet, .35),
    haze: PAL.bluePale,
    city: mix3(PAL.stoneCool, PAL.bluePale, .65),
    city2: mix3(PAL.grey, PAL.stoneCool, .5),
    wall: mix3(PAL.stoneCool, PAL.bluePale, .5),
    wallShade: mix3(PAL.greyDeep, PAL.violet, .35),
    road: mix3(PAL.road, PAL.bluePale, .4),
    roadShade: mix3(PAL.greyDeep, PAL.blue, .35),
    puddle: mix3(PAL.puddle, PAL.bluePale, .4),
    warm: .85, warmA: .42, glowCol: PAL.lamp,
    rain: 1, inkA: 1,
  };
  // rain（雨夜：仍以纸白为最亮，只是青灰更重）
  return {
    skyTop: mix3(PAL.blue, PAL.bluePale, .42),
    skyBot: mix3(PAL.cream, PAL.bluePale, .4),
    cloud: mix3(PAL.greyLight, PAL.bluePale, .3),
    cloudBelly: mix3(PAL.grey, PAL.violet, .35),
    haze: mix3(PAL.bluePale, PAL.greyLight, .3),
    city: mix3(PAL.stoneCool, PAL.bluePale, .58),
    city2: mix3(PAL.grey, PAL.stoneCool, .4),
    wall: mix3(PAL.stoneCool, PAL.bluePale, .42),
    wallShade: mix3(PAL.greyDeep, PAL.violet, .35),
    road: mix3(PAL.road, PAL.bluePale, .32),
    roadShade: mix3(PAL.greyDeep, PAL.blue, .3),
    puddle: mix3(PAL.puddle, PAL.bluePale, .35),
    warm: 1, warmA: .62, glowCol: PAL.lamp,
    rain: 1, inkA: 1,
  };
}

// ---------------------------------------------------------------- 通用：天空 + 云
function skyBackdrop_(sc, M, o, horizonY) {
  const R = rng((o.seed ?? 11) + 700);
  const top = -240, bot = horizonY + 320;
  const poly = [[-200, top], [2120, top], [2120, bot], [-200, bot]];
  sc.fill(poly, [253, 250, 242], { layer: 'back', j: 2, seed: 1101, t0: 0, dur: 0 });
  sc.wash([[-200, top], [2120, top], [2120, horizonY - 200], [-200, horizonY - 170]], M.skyTop, { a: .30, j: 34, layers: 2, edge: 0, seed: 1110, freq: .005 }, { layer: 'back', t0: .12, dur: 1.1 });
  sc.wash([[-200, horizonY - 330], [2120, horizonY - 300], [2120, horizonY + 190], [-200, horizonY + 170]], M.skyBot, { a: .24, j: 28, layers: 2, edge: 0, seed: 1111 }, { layer: 'back', t0: .35, dur: 1.2 });
  // 云：先留白团，再冷灰云肚 + 顶部受光
  const n = o.cloudN ?? 4;
  for (let i = 0; i < n; i++) {
    const cx = -140 + R() * 2200, cy = 40 + R() * Math.max(120, horizonY - 380);
    const rx = 200 + R() * 320, ry = rx * (.18 + R() * .14);
    const puff = [];
    for (let k = 0; k <= 10; k++) { const a = Math.PI + k / 10 * Math.PI; puff.push([cx + Math.cos(a) * rx * (.8 + .35 * R()), cy + Math.sin(a) * ry * (1.1 + .5 * R())]); }
    puff.push([cx + rx * .92, cy + ry * .3], [cx - rx * .92, cy + ry * .3]);
    sc.fill(spline(puff, 4, true), [254, 252, 246], { layer: 'back', j: 9, seed: 1130 + i, t0: .5 + i * .07, dur: .12 });
    sc.wash(ell(cx + rx * .04, cy + ry * .55, rx * .82, ry * .34, 18), M.cloudBelly, { a: .13, j: 14, layers: 1, edge: 0, seed: 1140 + i }, { layer: 'back', t0: .65 + i * .07, dur: .55 });
    sc.wash(ell(cx - rx * .18, cy - ry * .06, rx * .5, ry * .28, 16), [255, 254, 250], { a: .22, j: 10, layers: 1, edge: 0, seed: 1150 + i }, { layer: 'back', t0: .75 + i * .07, dur: .45 });
  }
  // 地平线附近的湿亮带（城市灯光/天光从雨雾里透出来）
  sc.wash([[-200, horizonY - 90], [2120, horizonY - 70], [2120, horizonY + 150], [-200, horizonY + 130]], M.glowCol, { a: .15, j: 26, layers: 2, edge: 0, seed: 1160, freq: .008 }, { layer: 'back', t0: .9, dur: 1 });
}

// ---------------------------------------------------------------- 通用：一排远处楼群
function cityRow_(sc, M, o, g) {
  const R = rng(g.seed ?? 300);
  let x = g.x0;
  let i = 0;
  while (x < g.x1) {
    const w = (g.wMin ?? 96) + R() * ((g.wMax ?? 190) - (g.wMin ?? 96));
    const top = g.topMin + R() * (g.topMax - g.topMin);
    const jt = (R() - .5) * 22;
    const warm = R() < .42;
    const baseCol = warm ? mix3(M.city2, PAL.stone, .4) : mix3(M.city, M.city2, R());
    const hgt = g.yBase - top;
    const poly = [[x, g.yBase + 40], [x, top], [x + w * .55, top + jt], [x + w, top + jt * .4], [x + w, g.yBase + 40]];
    sc.fill(poly, [252, 249, 241], { layer: 'back', j: 3, seed: g.seed + i, t0: g.t0, dur: .1 });
    sc.wash(poly, mix3(baseCol, M.haze, g.pale ?? .5), { a: g.a ?? .38, j: 7, layers: 2, edge: .14, seed: g.seed + i * 7 + 1 }, { layer: 'back', t0: g.t0 + .1, dur: .6 });
    // 背光的一侧（右）再压一层冷灰
    sc.wash([[x + w * .62, top + 30], [x + w, top + jt * .4], [x + w, g.yBase], [x + w * .62, g.yBase]], mix3(baseCol, PAL.grey, .45), { a: .16, j: 6, layers: 1, edge: 0, seed: g.seed + i * 7 + 2 }, { layer: 'back', t0: g.t0 + .2, dur: .5 });
    // 楼脚暗带（贴在街上，才站得住）
    sc.wash([[x, g.yBase - hgt * .09], [x + w, g.yBase - hgt * .09 + 4], [x + w, g.yBase + 8], [x, g.yBase + 10]], mix3(M.city2, PAL.greyDeep, .3), { a: .2, j: 5, layers: 1, edge: 0, seed: g.seed + i * 7 + 3 }, { layer: 'back', t0: g.t0 + .3, dur: .5 });
    // 屋檐 / 侧墙墨线
    sc.ink([[x - 4, top + 2], [x + w * .55, top + jt], [x + w + 3, top + jt * .4 + 2]], { w: 1.5, wob: .7, over: 4, gap: .35, seed: g.seed + i * 11 + 4 }, { layer: 'back', t0: g.t0 + .3, dur: .4, alpha: .5 });
    sc.ink([[x, top + 1], [x, g.yBase + 4]], { w: 1.2, wob: .7, over: 3, gap: .45, seed: g.seed + i * 11 + 5 }, { layer: 'back', t0: g.t0 + .35, dur: .45, alpha: .42 });
    sc.ink([[x, g.yBase + 2], [x + w, g.yBase + 2]], { w: 1.2, wob: .6, over: 4, gap: .4, seed: g.seed + i * 11 + 6 }, { layer: 'back', t0: g.t0 + .4, dur: .4, alpha: .4 });
    // 窗：成排，带窗框与十字棂；少数亮着暖光
    if (g.windows !== false) {
      const rows = g.windowRows ?? 3;
      const cols = Math.max(1, Math.round(w / 56));
      const wh = Math.max(10, Math.min(30, hgt * .095)), ww = wh * .78;
      for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
        if (R() < .34) continue;
        const sd = g.seed + i * 61 + rr * 17 + c;
        const wx = x + (w - cols * (ww + 10)) * .5 + c * (ww + 10) + (R() - .5) * 3;
        const wy = top + hgt * .16 + rr * Math.min(hgt * .2, 52) + (R() - .5) * 3;
        const q = [[wx, wy], [wx + ww, wy + 1], [wx + ww, wy + wh], [wx, wy + wh]];
        const lit = R() < .24;
        sc.fill(q, [252, 250, 244], { layer: 'back', j: 1.4, seed: sd, t0: g.t0 + .5, dur: .08 });
        sc.wash(q, lit ? mix3(PAL.lamp, PAL.cream, .3) : mix3(M.city2, PAL.bluePale, .55), { a: lit ? .5 : .3, j: 1.6, layers: 1, edge: .12, seed: sd + 1 }, { layer: 'back', t0: g.t0 + .55, dur: .4 });
        sc.inkPoly(q, { w: 1.05, wob: .35, seed: sd + 2, gap: .25 }, { layer: 'back', t0: g.t0 + .58, dur: .25, stagger: .02, alpha: .55 });
        if (ww > 11) {
          sc.ink([[wx + 2, wy + wh * .5], [wx + ww - 2, wy + wh * .5]], { w: .8, wob: .25, over: .5, seed: sd + 3 }, { layer: 'back', t0: g.t0 + .62, dur: .2, alpha: .38 });
          sc.ink([[wx + ww * .5, wy + 2], [wx + ww * .5, wy + wh - 2]], { w: .8, wob: .25, over: .5, seed: sd + 4 }, { layer: 'back', t0: g.t0 + .64, dur: .2, alpha: .38 });
        }
      }
      // 楼层横线（把一排窗连起来，楼才像楼）
      for (let rr = 1; rr < rows; rr++) {
        const fy = top + hgt * .16 + rr * Math.min(hgt * .2, 52) - 7;
        sc.ink([[x + 5, fy], [x + w * .5, fy + 1.5], [x + w - 5, fy - 1]], { w: 1.1, wob: .7, over: 3, gap: .55, seed: g.seed + i * 13 + rr }, { layer: 'back', t0: g.t0 + .48, dur: .35, alpha: .32 });
      }
      // 檐口下的一道暖灰（屋面受光）
      sc.wash([[x + 4, top + 2], [x + w - 4, top + (jt ?? 0) * .4 + 2], [x + w - 4, top + hgt * .07], [x + 4, top + hgt * .075]], mix3(M.city2, PAL.cream, .4), { a: .16, j: 4, layers: 1, edge: 0, seed: g.seed + i * 13 + 9 }, { layer: 'back', t0: g.t0 + .42, dur: .4 });
    }
    x += w + 5 + R() * 26; i++;
  }
}

// ---------------------------------------------------------------- 通用：石板路
// g: {yFar, yNear, xl, xr, rows, cols, yMax, t0, seed, alpha}
function paving_(sc, M, o, g) {
  const R = rng(g.seed ?? 71);
  const rows = g.rows ?? 7;
  const ys = [];
  for (let k = 0; k <= rows; k++) { const u = k / rows; ys.push(g.yFar + (g.yNear - g.yFar) * Math.pow(u, 1.85)); }
  const t0 = g.t0 ?? .8;
  for (let k = 1; k < ys.length; k++) {
    const y = ys[k], y2 = ys[k + 1];
    if (y > (g.yMax ?? 905)) break;
    const u = k / rows;
    const xl = g.xl(y), xr = g.xr(y);
    const a = (g.alpha ?? .5) * (.75 - .3 * u);
    // 横向石缝：2–3 段断线
    const segs = 3;
    for (let i = 0; i < segs; i++) {
      const x0 = lerp(xl + 16, xr - 16, i / segs + .03), x1 = lerp(xl + 16, xr - 16, (i + 1) / segs - .03);
      const pts = [[x0, y + (R() - .5) * 4], [lerp(x0, x1, .5), y + 3 + (R() - .5) * 3], [x1, y + (R() - .5) * 4]];
      sc.ink(pts, { w: 1.15, wob: .9, over: 2.5, gap: .55, seed: g.seed + k * 13 + i }, { layer: 'mid', t0: t0 + k * .07 + i * .02, dur: .4, alpha: a });
    }
    // 纵向石缝（一点透视自动收敛）
    if (y2 <= (g.yMax ?? 905)) {
      const cols = g.cols ?? 9;
      for (let c = 1; c < cols; c++) {
        const uu = c / cols;
        const x = xl + uu * (xr - xl), x2 = g.xl(y2) + uu * (g.xr(y2) - g.xl(y2));
        sc.ink([[x, y], [lerp(x, x2, .5) + (R() - .5) * 2, lerp(y, y2, .5)], [x2, y2]], { w: .95, wob: .75, over: 1.5, gap: .5, seed: g.seed + 500 + k * 17 + c }, { layer: 'mid', t0: t0 + .15 + k * .06 + c * .012, dur: .38, alpha: a * .68 });
      }
    }
  }
}

// ---------------------------------------------------------------- 通用：水洼
function puddleWash_(sc, p, M, seed, t0) {
  const R = rng(seed);
  const poly = ell(p.x, p.y, p.rx, p.ry, 30).map(([x, y]) => [x + (R() - .5) * 6, y + (R() - .5) * 4]);
  // 水洼外圈更湿的一层（深一点的冷灰）
  const outer = ell(p.x, p.y + p.ry * .12, p.rx * 1.08, p.ry * 1.35, 28);
  sc.wash(outer, mix3(M.roadShade, PAL.grey, .45), { a: .16, j: 12, layers: 1, edge: 0, seed: seed + 9 }, { layer: 'mid', t0, dur: .8 });
  sc.wash(poly, mix3(M.puddle, PAL.bluePale, .35), { a: .34, j: 7, layers: 2, edge: .3, seed: seed + 1 }, { layer: 'mid', t0: t0 + .1, dur: .9 });
  // 水面留白（天空亮光）
  sc.fill(ell(p.x - p.rx * .12, p.y - p.ry * .18, p.rx * .5, p.ry * .42, 20), [253, 251, 244], { layer: 'mid', j: 6, seed: seed + 2, t0: t0 + .35, dur: .1, alpha: .5 });
  // 水里的竖直亮条（倒映的天光/灯）
  sc.fill([[p.x + p.rx * .18, p.y - p.ry * .7], [p.x + p.rx * .34, p.y - p.ry * .6], [p.x + p.rx * .30, p.y + p.ry * .5], [p.x + p.rx * .16, p.y + p.ry * .45]], [254, 252, 246], { layer: 'mid', j: 5, seed: seed + 4, t0: t0 + .4, dur: .1, alpha: .42 });
  // 水洼边缘：断断续续的钢笔线（不是封口的椭圆）
  const runs = polyRuns(poly, { seed: seed + 5, maxRun: 5, gapChance: .7 });
  runs.forEach((r, i) => sc.ink(r, { w: 1.05, wob: .7, over: 2.5, gap: .5, seed: seed + 20 + i }, { layer: 'mid', t0: t0 + .3 + i * .04, dur: .4, alpha: .42 }));
  // 水边湿痕
  sc.wash(ell(p.x, p.y + p.ry * .2, p.rx * .96, p.ry * .6, 24), mix3(M.puddle, PAL.paper, .3), { a: .14, j: 9, layers: 1, edge: 0, seed: seed + 3 }, { layer: 'mid', t0: t0 + .45, dur: .7 });
  return poly;
}

// ---------------------------------------------------------------- 通用：路灯
// 返回 {x,y(灯头),baseY,gx(地面光池x)}
function lampStatic_(sc, M, o, x, yBase, h, dir, seed, t0) {
  const R = rng(seed);
  const topY = yBase - h;
  // 灯杆（双线，速写里常画两根）
  sc.ink([[x, yBase + 4], [x + 1.5, topY + 6]], { w: 2.6, wob: 1.0, over: 6, gap: .35, seed: seed + 1 }, { layer: 'mid', t0, dur: .7, alpha: .9 });
  sc.ink([[x - 5, yBase + 2], [x - 4, topY + 18]], { w: 1.1, wob: .8, over: 3, gap: .6, seed: seed + 2 }, { layer: 'mid', t0: t0 + .1, dur: .7, alpha: .55 });
  // 灯臂
  const armX = x + dir * 92, headY = topY + 12;
  sc.ink([[x, topY + 14], [x + dir * 40, topY + 2 + (R() - .5) * 3], [armX - dir * 12, headY - 10]], { w: 2.1, wob: .7, over: 3, seed: seed + 3 }, { layer: 'mid', t0: t0 + .2, dur: .55, alpha: .9 });
  sc.ink([[x, topY + 26], [x + dir * 46, topY + 18]], { w: 1.0, wob: .5, over: 2, seed: seed + 4 }, { layer: 'mid', t0: t0 + .3, dur: .5, alpha: .5 });
  // 灯罩（小梯形，暖色留白）
  const hw = 30;
  const head = [[armX - hw, headY], [armX + hw, headY], [armX + hw * .6, headY + 22], [armX - hw * .6, headY + 22]];
  sc.fill(head, [253, 250, 240], { layer: 'mid', j: 1.5, seed: seed + 5, t0: t0 + .3, dur: .1 });
  sc.wash(head, mix3(PAL.lamp, PAL.cream, .3), { a: .55, j: 2.5, layers: 1, edge: .35, seed: seed + 6 }, { layer: 'mid', t0: t0 + .4, dur: .5 });
  sc.inkPoly(head, { w: 2.0, wob: .5, seed: seed + 7, gap: .25 }, { layer: 'mid', t0: t0 + .45, dur: .4, stagger: .04, alpha: .9 });
  sc.ink([[armX - hw * .6, headY + 22], [armX + hw * .6, headY + 22]], { w: 2.2, wob: .5, over: 3, seed: seed + 8 }, { layer: 'mid', t0: t0 + .55, dur: .3, alpha: .95 });
  // 灯罩上的小挂钩
  sc.ink([[armX - 5, headY], [armX - 3, headY - 9], [armX + 3, headY - 9]], { w: 1.5, wob: .3, over: 2, seed: seed + 9 }, { layer: 'mid', t0: t0 + .5, dur: .3, alpha: .8 });
  return { x: armX, y: headY + 12, baseY: yBase, gx: x + dir * 34, r: 240 };
}

// 灯光动态：光晕呼吸 + 湿地面光池 + 湿柱倒影 + 湿地碎光
function lampDyn_(sc, lamps, M, o, layer = 'mid') {
  sc.dyn((ctx, t) => {
    for (const L of lamps) {
      const rate = L.rate ?? 1.15, ph = L.ph ?? 0, gain = (L.a ?? 1) * (M.warmA ?? .6);
      const br = 1 + .07 * Math.sin(t * rate + ph);
      const gy = L.gy ?? (L.baseY ?? L.y) + 46;
      const gx = L.gx ?? L.x;
      // 湿柱倒影：从灯头一直落到地面光池（雨夜里最亮的竖直一笔）
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      const col = ctx.createLinearGradient(0, L.y + 6, 0, gy + 26);
      col.addColorStop(0, rgba(mix3(PAL.lamp, PAL.cream, .35), .26 * gain));
      col.addColorStop(.55, rgba(PAL.lamp, .13 * gain));
      col.addColorStop(1, rgba(PAL.lamp, 0));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(L.x - 13, L.y + 8); ctx.lineTo(L.x + 13, L.y + 8);
      ctx.lineTo(gx + 34, gy + 18); ctx.lineTo(gx - 30, gy + 18);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // 雨幕里晕开的暖光（大气光晕，三层）
      glow(ctx, t, L.x, L.y, (L.r ?? 240) * 1.5 * br, PAL.lamp, .17 * gain, { breathe: .16, rate, phase: ph });
      glow(ctx, t, L.x, L.y, (L.r ?? 240) * br, PAL.lamp, .46 * gain, { breathe: .16, rate, phase: ph });
      glow(ctx, t, L.x, L.y, 66 * br, mix3(PAL.lamp, [255, 250, 236], .55), .55 * gain, { breathe: .08, rate, phase: ph });
      // 湿地面上的暖光池（椭圆，透视压扁）
      ctx.save();
      ctx.translate(gx, gy); ctx.scale(1, .28);
      const rr = (L.poolR ?? 250) * br;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, rgba(PAL.lamp, .48 * gain));
      g.addColorStop(.42, rgba(PAL.lamp, .24 * gain));
      g.addColorStop(1, rgba(PAL.lamp, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill();
      ctx.restore();
      // 湿地上的碎光（一排小横线，抖动）
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 8; k++) {
        const u = k / 7, xx = gx + Math.sin(t * .8 + k * 1.7 + ph) * (16 + k * 12) + (u - .5) * 160;
        const yy = gy + 6 + u * 66;
        ctx.globalAlpha = .18 * gain * (1 + .35 * Math.sin(t * 2.1 + k * 2.3));
        ctx.strokeStyle = rgba(mix3(PAL.lamp, [255, 255, 255], .3), .8);
        ctx.lineWidth = 1.6 + (1 - u) * 2.2;
        ctx.beginPath(); ctx.moveTo(xx - 14 - u * 12, yy); ctx.lineTo(xx + 14 + u * 12, yy); ctx.stroke();
      }
      ctx.restore();
    }
  }, layer);
}

// ---------------------------------------------------------------- 通用：电线
function wires_(sc, M, o, list, seed, t0) {
  const R = rng(seed);
  list.forEach((pair, i) => {
    const [a, b] = pair, sag = pair[2] ?? 46;
    for (let k = 0; k < 3; k++) {
      const off = k * 7;
      const pts = [];
      for (let j = 0; j <= 10; j++) {
        const u = j / 10;
        const x = lerp(a[0], b[0], u), y = lerp(a[1], b[1], u) + Math.sin(u * Math.PI) * sag + off;
        pts.push([x, y]);
      }
      sc.ink(pts, { w: 1.25 - k * .2, wob: .9, over: 4, gap: .75, seed: seed + i * 5 + k }, { layer: 'mid', t0: t0 + i * .12 + k * .06, dur: .9, alpha: .62 - k * .12 });
    }
  });
}

// ---------------------------------------------------------------- 街景细节构件（第二轮：信息量 / 质感）
// 行道树剪影：树干 + 分叉 + 树冠碎笔；淡彩极淡，远处当剪影读
function streetTree_(sc, M, o, x, yBase, h, seed, t0, far = true) {
  const R = rng(seed);
  const layer = far ? 'back' : 'mid';
  const topY = yBase - h;
  const cr = h * (.26 + R() * .1), cy = topY + cr * .75;
  const crown = [];
  for (let k = 0; k <= 12; k++) { const a = k / 12 * TAU; const rr = cr * (.72 + R() * .5); crown.push([x + Math.cos(a) * rr * 1.18, cy + Math.sin(a) * rr * .78]); }
  const cpoly = spline(crown, 4, true);
  sc.fill(cpoly, [252, 250, 242], { layer, j: 8, seed: seed + 1, t0, dur: .1, alpha: far ? .45 : .8 });
  sc.wash(cpoly, mix3(PAL.green, M.haze, far ? .6 : .4), { a: far ? .15 : .2, j: 12, layers: 1, edge: 0, seed: seed + 2 }, { layer, t0: t0 + .1, dur: .7 });
  sc.ink([[x + (R() - .5) * 4, yBase + 2], [x + (R() - .5) * 5, yBase - h * .55]], { w: 2.1, wob: .85, over: 4, gap: .3, seed: seed + 3 }, { layer, t0: t0 + .15, dur: .6, alpha: far ? .5 : .7 });
  for (let k = 0; k < 4; k++) {
    const a = -Math.PI * .5 + (k - 1.5) * .58 + (R() - .5) * .2;
    const L = h * (.2 + R() * .14);
    const b0 = [x, yBase - h * .54];
    const b1 = [b0[0] + Math.cos(a) * L * .5, b0[1] + Math.sin(a) * L * .5];
    const b2 = [b0[0] + Math.cos(a) * L, b0[1] + Math.sin(a) * L];
    sc.ink([b0, b1, b2], { w: 1.25, wob: .6, over: 2, gap: .35, seed: seed + 10 + k }, { layer, t0: t0 + .25 + k * .05, dur: .5, alpha: far ? .42 : .55 });
  }
  for (let k = 0; k < 10; k++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * cr * .95;
    const px = x + Math.cos(a) * rr * 1.1, py = cy + Math.sin(a) * rr * .72;
    const arc = [];
    for (let j = 0; j <= 5; j++) { const th = -1 + j * .55; arc.push([px + Math.cos(th) * (6 + R() * 8), py + Math.sin(th) * (4 + R() * 6)]); }
    sc.ink(arc, { w: 1.05, wob: .6, over: 2, gap: .3, seed: seed + 20 + k }, { layer, t0: t0 + .4 + k * .04, dur: .45, alpha: far ? .25 : .36 });
  }
}

// 电线杆 + 横担 + 变压器；返回可挂电线的点
function utilityPole_(sc, M, o, x, yBase, h, seed, t0, layer = 'mid') {
  const R = rng(seed);
  const topY = yBase - h;
  sc.ink([[x, yBase + 2], [x + (R() - .5) * 3, topY]], { w: 2.5, wob: .9, over: 5, gap: .3, seed: seed + 1 }, { layer, t0, dur: .7, alpha: .85 });
  sc.ink([[x - 6, yBase], [x - 4, topY + 20]], { w: 1.0, wob: .7, over: 3, gap: .5, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .7, alpha: .45 });
  const arms = [];
  for (let k = 0; k < 2; k++) {
    const ay = topY + 38 + k * 50, aw = 42 - k * 6;
    sc.ink([[x - aw, ay + 3], [x + aw, ay]], { w: 1.6, wob: .5, over: 3, seed: seed + 10 + k }, { layer, t0: t0 + .2 + k * .08, dur: .5, alpha: .65 });
    for (const j of [-1, 1]) {
      sc.ink([[x + j * aw * .8, ay + 2], [x + j * aw * .8, ay - 9]], { w: 1.2, wob: .3, over: 1, seed: seed + 14 + k * 3 + j }, { layer, t0: t0 + .3 + k * .08, dur: .3, alpha: .55 });
      arms.push([x + j * aw * .8, ay - 9]);
    }
  }
  const tx = x + 24, ty = topY + 76;
  const tq = [[tx - 15, ty], [tx + 15, ty], [tx + 12, ty + 32], [tx - 12, ty + 32]];
  sc.fill(tq, [251, 249, 241], { layer, j: 1.5, seed: seed + 30, t0: t0 + .25, dur: .1 });
  sc.wash(tq, mix3(M.wallShade, PAL.greyLight, .4), { a: .28, j: 2, layers: 1, edge: .2, seed: seed + 31 }, { layer, t0: t0 + .3, dur: .5 });
  sc.inkPoly(tq, { w: 1.25, wob: .35, seed: seed + 32, gap: .2 }, { layer, t0: t0 + .35, dur: .4, stagger: .03, alpha: .68 });
  sc.ink([[x + 7, topY + 148], [x + 19, topY + 150], [x + 19, topY + 170], [x + 7, topY + 168], [x + 7, topY + 148]], { w: 1.15, wob: .3, seed: seed + 40 }, { layer, t0: t0 + .45, dur: .35, alpha: .5 });
  return { top: [x, topY + 22], arms };
}

// 靠墙的自行车（钢笔画：两轮 + 车架 + 车把 + 淡彩）
function bike_(sc, x, yBase, s, seed, t0, dir = 1, layer = 'mid') {
  const R = rng(seed);
  const wr = s * .20, front = [x + dir * s * .40, yBase - wr], back = [x - dir * s * .40, yBase - wr];
  const lw = Math.max(1.0, s * .012);
  for (let wi = 0; wi < 2; wi++) {
    const c = wi ? back : front;
    const ep = ellipse(c[0], c[1], wr, wr, 20); ep.push(ep[0]);
    sc.ink(ep, { w: lw * 1.3, wob: .5, over: 1.5, gap: .3, seed: seed + wi * 7 }, { layer, t0: t0 + .1, dur: .5, alpha: .72 });
    for (let k = 0; k < 3; k++) {
      const a = k * 1.05 + R() * .2;
      sc.ink([[c[0] - Math.cos(a) * wr * .82, c[1] - Math.sin(a) * wr * .82], [c[0] + Math.cos(a) * wr * .82, c[1] + Math.sin(a) * wr * .82]], { w: lw * .55, wob: .3, over: .5, seed: seed + 10 + k }, { layer, t0: t0 + .2, dur: .3, alpha: .38 });
    }
    sc.wash(ellipse(c[0], c[1], wr * .92, wr * .92, 14), mix3(PAL.bluePale, PAL.grey, .4), { a: .1, j: 3, layers: 1, edge: 0, seed: seed + 30 + wi }, { layer, t0: t0 + .4, dur: .4 });
  }
  const seat = [back[0] + dir * s * .06, yBase - s * .5], head = [front[0] - dir * s * .02, yBase - s * .44];
  const crank = [x, yBase - s * .19];
  sc.ink([back, seat, [x - dir * s * .02, yBase - s * .23], back], { w: lw * 1.2, wob: .4, over: 1, seed: seed + 20 }, { layer, t0: t0 + .3, dur: .5, alpha: .68 });
  sc.ink([seat, crank, head, [head[0] + dir * s * .05, head[1] - s * .11]], { w: lw * 1.2, wob: .4, over: 1, seed: seed + 21 }, { layer, t0: t0 + .35, dur: .5, alpha: .68 });
  sc.ink([[head[0] + dir * s * .04, head[1] - s * .11], [head[0] + dir * s * .15, head[1] - s * .19]], { w: lw * 1.4, wob: .3, over: 2, seed: seed + 22 }, { layer, t0: t0 + .45, dur: .35, alpha: .66 });
  sc.ink([[seat[0] - s * .07, seat[1] - s * .01], [seat[0] + s * .07, seat[1] - s * .02]], { w: lw * 1.5, wob: .3, over: 2, seed: seed + 23 }, { layer, t0: t0 + .5, dur: .3, alpha: .66 });
}

// 盆栽（门边的小植物）
function potPlant_(sc, x, yBase, s, seed, t0, layer = 'mid') {
  const R = rng(seed);
  const pot = [[x - s * .32, yBase], [x + s * .32, yBase], [x + s * .25, yBase - s * .48], [x - s * .25, yBase - s * .48]];
  sc.fill(pot, [251, 248, 240], { layer, j: 1.2, seed: seed + 1, t0, dur: .1 });
  sc.wash(pot, mix3(PAL.brick, PAL.cream, .45), { a: .3, j: 2, layers: 1, edge: .2, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .4 });
  sc.inkPoly(pot, { w: 1.2, wob: .35, seed: seed + 3, gap: .2 }, { layer, t0: t0 + .1, dur: .35, stagger: .03, alpha: .68 });
  const leafCol = mix3(PAL.green, PAL.cream, .3);
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI * .5 + (k - 2.5) * .42 + (R() - .5) * .2;
    const L = s * (.4 + R() * .55);
    const p0 = [x + (R() - .5) * s * .18, yBase - s * .46];
    const p1 = [p0[0] + Math.cos(a) * L * .55, p0[1] + Math.sin(a) * L * .55 - s * .08];
    const p2 = [p0[0] + Math.cos(a) * L, p0[1] + Math.sin(a) * L * .8 - s * .22];
    sc.ink([p0, p1, p2], { w: 1.0, wob: .5, over: 1, gap: .15, seed: seed + 10 + k }, { layer, t0: t0 + .15 + k * .03, dur: .3, alpha: .5 });
    sc.wash(ellipse(p1[0], p1[1] - s * .06, 6 + s * .05, 3.4 + s * .03, 10), leafCol, { a: .22, j: 2, layers: 1, edge: 0, seed: seed + 20 + k }, { layer, t0: t0 + .2 + k * .03, dur: .35 });
  }
}

// 垃圾桶（小圆柱 + 盖）
function bin_(sc, x, yBase, s, seed, t0, layer = 'mid') {
  const body = [[x - s * .34, yBase], [x + s * .34, yBase], [x + s * .3, yBase - s * .95], [x - s * .3, yBase - s * .95]];
  sc.fill(body, [251, 249, 241], { layer, j: 1.5, seed: seed + 1, t0, dur: .1 });
  sc.wash(body, mix3(PAL.grey, PAL.cream, .35), { a: .26, j: 3, layers: 1, edge: .15, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .4 });
  sc.inkPoly(body, { w: 1.3, wob: .4, seed: seed + 3, gap: .2 }, { layer, t0: t0 + .1, dur: .4, stagger: .04, alpha: .7 });
  const lid = [[x - s * .38, yBase - s * .95], [x + s * .38, yBase - s * .98], [x + s * .34, yBase - s * 1.08], [x - s * .34, yBase - s * 1.05]];
  sc.inkPoly(lid, { w: 1.2, wob: .3, seed: seed + 4, gap: .2 }, { layer, t0: t0 + .2, dur: .35, stagger: .03, alpha: .65 });
  sc.ink([[x - s * .28, yBase - s * .5], [x + s * .28, yBase - s * .53]], { w: 1.0, wob: .3, over: 1, seed: seed + 5 }, { layer, t0: t0 + .3, dur: .3, alpha: .5 });
}

// 墙上的空海报板（无字：色块 + 胶带角 + 撕口）
function poster_(sc, x, y, w, h, seed, t0, rot = 0, col = null, layer = 'mid') {
  const R = rng(seed);
  const co = Math.cos(rot), si = Math.sin(rot);
  const P = (u, v) => [x + (u - .5) * w * co - (v - .5) * h * si, y + (u - .5) * w * si + (v - .5) * h * co];
  const q = [P(0, 0), P(1, 0), P(1, 1), P(0, 1)];
  const c = col ?? mix3(R() < .5 ? PAL.pinkPale : PAL.cream, PAL.greyLight, .25);
  sc.fill(q, [252, 249, 241], { layer, j: 1.5, seed: seed + 1, t0, dur: .1, alpha: .9 });
  sc.wash(q, c, { a: .24, j: 4, layers: 1, edge: .25, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .45 });
  sc.inkPoly(q, { w: 1.1, wob: .4, seed: seed + 3, gap: .25 }, { layer, t0: t0 + .1, dur: .4, stagger: .03, alpha: .55 });
  // 胶带角
  for (const [u, v] of [[.1, .08], [.9, .1]]) {
    const p = P(u, v);
    sc.ink([[p[0] - 5, p[1] - 3], [p[0] + 5, p[1] + 3]], { w: 1.4, wob: .3, over: 1, seed: seed + 10 + u * 10 | 0 }, { layer, t0: t0 + .2, dur: .25, alpha: .5 });
  }
  // 板上的一道旧痕
  sc.ink([P(.15, .42), P(.85, .4)], { w: .95, wob: .5, over: 1.5, gap: .5, seed: seed + 20 }, { layer, t0: t0 + .25, dur: .3, alpha: .4 });
}

// 店门口的小灯箱（暖光点：返回给动态层做呼吸）
function lightbox_(sc, M, o, x, y, w, h, seed, t0, layer = 'mid') {
  const q = [[x - w / 2, y - h], [x + w / 2, y - h + 2], [x + w / 2, y], [x - w / 2, y + 1]];
  sc.fill(q, [253, 250, 240], { layer, j: 1.2, seed: seed + 1, t0, dur: .1 });
  sc.wash(q, mix3(PAL.lamp, PAL.cream, .25), { a: .55, j: 2, layers: 1, edge: .3, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .5 });
  sc.inkPoly(q, { w: 1.3, wob: .4, seed: seed + 3, gap: .2 }, { layer, t0: t0 + .1, dur: .4, stagger: .03, alpha: .75 });
  // 支架
  sc.ink([[x, y - h - 2], [x - 8, y - h - 12], [x + 8, y - h - 12]], { w: 1.0, wob: .3, over: 1, seed: seed + 4 }, { layer, t0: t0 + .15, dur: .3, alpha: .55 });
  return { x, y: y - h * .5, r: Math.max(w, h) * 1.1 };
}

// 井盖
function manhole_(sc, x, y, r, seed, t0, layer = 'mid') {
  const ep = ellipse(x, y, r, r * .42, 20); ep.push(ep[0]);
  sc.fill(ellipse(x, y, r * .96, r * .4, 18), [251, 248, 240], { layer, j: 1.5, seed: seed + 1, t0, dur: .1, alpha: .8 });
  sc.wash(ellipse(x, y, r, r * .44, 18), mix3(PAL.grey, PAL.cream, .3), { a: .3, j: 3, layers: 1, edge: .25, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .45 });
  sc.ink(ep, { w: 1.4, wob: .5, over: 2, gap: .3, seed: seed + 3 }, { layer, t0: t0 + .1, dur: .45, alpha: .6 });
  for (let k = 0; k < 4; k++) {
    const yy = y - r * .28 + k * r * .18;
    sc.ink([[x - r * .6, yy], [x + r * .6, yy + 1]], { w: .9, wob: .3, over: 1, seed: seed + 10 + k }, { layer, t0: t0 + .2 + k * .03, dur: .25, alpha: .4 });
  }
}

// 湿地面上的落叶（暖色小点 + 两三笔）
function leaves_(sc, x0, x1, y0, y1, n, seed, M, t0, layer = 'mid') {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + R() * (x1 - x0), y = y0 + R() * (y1 - y0);
    const s = 3 + R() * 5, a = R() * TAU;
    const col = mix3(R() < .5 ? PAL.orange : PAL.brick, PAL.cream, .35);
    sc.wash(ellipse(x, y, s * 1.3, s * .7, 10), col, { a: .3, j: 2, layers: 1, edge: 0, seed: seed + i * 7 }, { layer, t0: t0 + (i % 10) * .03, dur: .4 });
    sc.ink([[x - Math.cos(a) * s, y - Math.sin(a) * s], [x + Math.cos(a) * s, y + Math.sin(a) * s]], { w: .8, wob: .3, over: .5, seed: seed + i * 7 + 1 }, { layer, t0: t0 + .1 + (i % 10) * .03, dur: .25, alpha: .45 });
  }
}

// 排水篦子（靠路缘）
function drain_(sc, x, y, w, seed, t0, layer = 'mid') {
  const h = w * .34;
  const q = [[x - w / 2, y], [x + w / 2, y - 1], [x + w / 2, y + h], [x - w / 2, y + h]];
  sc.fill(q, [250, 247, 238], { layer, j: 1.2, seed: seed + 1, t0, dur: .1, alpha: .8 });
  sc.wash(q, mix3(PAL.greyDeep, PAL.cream, .45), { a: .3, j: 2, layers: 1, edge: .2, seed: seed + 2 }, { layer, t0: t0 + .05, dur: .4 });
  sc.inkPoly(q, { w: 1.1, wob: .3, seed: seed + 3, gap: .2 }, { layer, t0: t0 + .1, dur: .35, stagger: .03, alpha: .6 });
  for (let k = 0; k < 4; k++) {
    const xx = x - w * .36 + k * w * .24;
    sc.ink([[xx, y + 1], [xx, y + h - 1]], { w: .9, wob: .2, over: .5, seed: seed + 10 + k }, { layer, t0: t0 + .15 + k * .02, dur: .2, alpha: .45 });
  }
}

// 更远一层天际线（比 cityRow 更淡更模糊，用来推远）
function farSkyline_(sc, M, o, g) {
  const R = rng(g.seed ?? 900);
  let x = g.x0;
  let i = 0;
  while (x < g.x1) {
    const w = (g.wMin ?? 120) + R() * ((g.wMax ?? 240) - (g.wMin ?? 120));
    const top = g.topMin + R() * (g.topMax - g.topMin);
    const poly = [[x, g.yBase + 20], [x, top], [x + w * .5, top - 10 - R() * 16], [x + w, top + 4], [x + w, g.yBase + 20]];
    sc.fill(poly, [254, 252, 247], { layer: 'back', j: 4, seed: (g.seed ?? 900) + i, t0: g.t0, dur: .1, alpha: .55 });
    sc.wash(poly, mix3(M.city2, M.haze, .7), { a: .2, j: 10, layers: 1, edge: 0, seed: (g.seed ?? 900) + i * 5 + 1 }, { layer: 'back', t0: g.t0 + .05, dur: .6 });
    x += w * (g.overlap ?? .62) + R() * 40; i++;
  }
}

// 远处的一层青灰薄雾（把楼推远）
function farMist_(sc, M, o, y0, y1) {
  sc.wash([[-220, y0], [2140, y0 - 10], [2140, y1], [-220, y1 + 8]], mix3(M.haze, PAL.bluePale, .35),
    { a: .16, j: 26, layers: 2, edge: 0, seed: (o.seed ?? 11) + 860, freq: .006 }, { layer: 'back', t0: .9, dur: 1.2 });
}

// 地面上雨点溅起的小水花（动态）
function groundSplashDyn_(sc, o, x0, x1, y0, y1, n = 26, layer = 'mid') {
  const R = rng((o.seed ?? 11) + 700);
  const ev = [];
  for (let i = 0; i < n; i++) ev.push({ x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0), t: R() * 3, per: .7 + R() * 1.3, sz: 2 + R() * 3.4 });
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.strokeStyle = 'rgba(96,108,116,.55)'; ctx.lineCap = 'round';
    for (const e of ev) {
      const u = ((t + e.t) % e.per) / e.per;
      if (u > .3) continue;
      const a = (1 - u / .3) * .55;
      ctx.globalAlpha = a; ctx.lineWidth = .9;
      for (let k = 0; k < 4; k++) {
        const ang = -Math.PI * .5 + (k - 1.5) * .5, L = e.sz * u * 4.2;
        ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(ang) * L, e.y + Math.sin(ang) * L * .7 - u * 3); ctx.stroke();
      }
      // 水面小圆
      ctx.globalAlpha = a * .7;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + 1, 2 + u * 8, 1 + u * 3.2, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }, layer);
}

// 店招暖光在湿地上的竖向倒影（动态，轻微抖动）
function shopReflectDyn_(sc, M, o, lights, layer = 'mid') {
  if (!lights.length) return;
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      const a = L.a ?? 1, wob = Math.sin(t * 1.3 + i * 1.7) * 4;
      const g = ctx.createLinearGradient(0, L.y, 0, L.y + L.len);
      g.addColorStop(0, rgba(mix3(PAL.lamp, PAL.cream, .35), .30 * a * M.warmA));
      g.addColorStop(.5, rgba(PAL.lamp, .12 * a * M.warmA));
      g.addColorStop(1, rgba(PAL.lamp, 0));
      ctx.fillStyle = g;
      ctx.fillRect(L.x - L.w / 2 + wob, L.y, L.w, L.len);
      // 断掉的光段
      ctx.fillStyle = rgba(mix3(PAL.lamp, [255, 255, 255], .45), .3 * a);
      for (let k = 0; k < 3; k++) {
        const yy = L.y + 14 + ((t * 16 + k * 37) % Math.max(20, L.len * .7));
        ctx.beginPath(); ctx.ellipse(L.x + wob + Math.sin(t * 2 + k) * 5, yy, L.w * .22, 1.4, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }, layer);
}

// 近景压暗（冷灰，只在画面左右边缘；不碰字幕安全区中间）
function nearDarkDyn_(sc, o) {
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const gl = ctx.createLinearGradient(0, 0, 260, 0);
    gl.addColorStop(0, 'rgba(126,138,148,.20)');
    gl.addColorStop(1, 'rgba(126,138,148,0)');
    ctx.fillStyle = gl; ctx.fillRect(-40, -40, 310, 1160);
    const gr = ctx.createLinearGradient(1920, 0, 1660, 0);
    gr.addColorStop(0, 'rgba(126,138,148,.20)');
    gr.addColorStop(1, 'rgba(126,138,148,0)');
    ctx.fillStyle = gr; ctx.fillRect(1640, -40, 340, 1160);
    ctx.restore();
  }, 'front');
}

// ---------------------------------------------------------------- 通用：雨
function rainLayer_(sc, o, layer, cfg) {
  const rain = makeRain({
    seed: (o.seed ?? 11) * 13 + layer.length, n: cfg.n ?? 220,
    w: 2200, h: 1320, slant: cfg.slant ?? (o.slant ?? .42),
    minSpeed: cfg.minSpeed ?? 480, maxSpeed: cfg.maxSpeed ?? 1000,
    minLen: cfg.minLen ?? 12, maxLen: cfg.maxLen ?? 34,
  });
  sc.dyn((ctx, t) => {
    const a = clamp((t - (cfg.t0 ?? .3)) / (cfg.ramp ?? 1.2)) * (cfg.alpha ?? 1);
    if (a <= .01) return;
    ctx.save();
    if (cfg.clipB !== undefined) { ctx.beginPath(); ctx.rect(-140, -140, 2200, cfg.clipB + 140); ctx.clip(); }
    ctx.translate(-110, -120);
    rain(ctx, t, {
      w: 2200, h: 1320, alpha: a, gain: cfg.gain ?? 1,
      col: cfg.col ?? mix3(PAL.greyDeep, PAL.blue, .3),
      lenMul: cfg.len ?? 1, wMul: cfg.wMul ?? 1,
    });
    ctx.restore();
  }, layer);
}

// ---------------------------------------------------------------- 通用：雾气 / 空气
function fogDyn_(sc, M, o) {
  const fog = makeFog({ seed: (o.seed ?? 11) + 331, n: o.fogN ?? 9 });
  sc.dyn((ctx, t) => {
    const g = clamp((t - .6) / 2.2) * (o.fog ?? .75) * (M.rain ? 1 : .55);
    if (g <= .02) return;
    fog(ctx, t, -160, 120, 2240, 950, { gain: g, col: [255, 253, 246] });
  }, 'back');
  // 雨雾空气层（前层，极淡；带一点摇晃）
  sc.dyn((ctx, t) => {
    const a = (o.air ?? .07) * (1 + .2 * Math.sin(t * .55 + (o.seed ?? 0)));
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const gr = ctx.createLinearGradient(0, -80, 0, 1140);
    gr.addColorStop(0, rgba(M.haze, a * .5));
    gr.addColorStop(.55, rgba(M.haze, a));
    gr.addColorStop(1, rgba(PAL.cream, a * .7));
    ctx.fillStyle = gr; ctx.fillRect(-160, -120, 2240, 1280);
    ctx.restore();
  }, 'front');
}

// ---------------------------------------------------------------- 通用：字幕安全区（底部只留纸面）
function safeVeil_(sc, o) {
  sc.dyn((ctx, t) => {
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    const y0 = o.veilY0 ?? 858, y1 = 1120;
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, 'rgba(247,240,226,0)');
    g.addColorStop(.42, 'rgba(247,240,226,.26)');
    g.addColorStop(1, 'rgba(247,240,226,.52)');
    ctx.fillStyle = g; ctx.fillRect(-160, y0, 2240, y1 - y0 + 60);
    ctx.restore();
  }, 'front');
}

// ---------------------------------------------------------------- 通用：水洼动态（倒影/涟漪/波光）
function puddleDyn_(sc, puddles, M, o) {
  const rips = puddles.map((p, i) => makeRipples({
    seed: (o.seed ?? 11) + 500 + i * 31, n: p.ripN ?? 5,
    x0: p.x - p.rx * .78, x1: p.x + p.rx * .78,
    y0: p.y - p.ry * .5, y1: p.y + p.ry * .55, span: 6,
  }));
  sc.dyn((ctx, t) => {
    for (let i = 0; i < puddles.length; i++) {
      const p = puddles[i];
      ctx.save();
      ctx.beginPath(); polyPath(ctx, ell(p.x, p.y, p.rx * .97, p.ry * .9, 26)); ctx.clip();
      // 冷天光倒影：竖向淡带
      const sky = ctx.createLinearGradient(0, p.y - p.ry, 0, p.y + p.ry);
      sky.addColorStop(0, rgba(mix3(M.puddle, PAL.paper, .45), .26));
      sky.addColorStop(.55, rgba(mix3(M.puddle, PAL.bluePale, .2), .18));
      sky.addColorStop(1, rgba(PAL.paper, .05));
      ctx.fillStyle = sky; ctx.fillRect(p.x - p.rx, p.y - p.ry, p.rx * 2, p.ry * 2);
      // 路灯倒影（竖着的一条暖光，抖动断裂）
      if (p.lamp) {
        const lx = p.x + (p.lampDX ?? 0);
        const wob = Math.sin(t * 1.4 + i) * 7;
        for (let k = 0; k < 4; k++) {
          const w = p.rx * (.34 - k * .06), xx = lx + wob + (k - 1.5) * 7;
          const g2 = ctx.createLinearGradient(0, p.y - p.ry, 0, p.y + p.ry);
          g2.addColorStop(0, rgba(PAL.lamp, 0));
          g2.addColorStop(.30, rgba(PAL.lamp, .62 * M.warmA));
          g2.addColorStop(.66, rgba(mix3(PAL.lamp, PAL.cream, .45), .44 * M.warmA));
          g2.addColorStop(1, rgba(PAL.lamp, 0));
          ctx.fillStyle = g2;
          ctx.fillRect(xx - w * .5, p.y - p.ry, w, p.ry * 2);
        }
        // 断掉的光点
        ctx.fillStyle = rgba(mix3(PAL.lamp, [255, 255, 255], .5), .75 * M.warmA);
        for (let k = 0; k < 5; k++) {
          const yy = p.y - p.ry * .6 + ((t * 26 + k * 13.7) % (p.ry * 1.4));
          ctx.beginPath(); ctx.ellipse(lx + Math.sin(t * 2 + k) * 10, yy, 6 - k * .6, 1.7, 0, 0, TAU); ctx.fill();
        }
      }
      // 波纹
      rips[i](ctx, t, { gain: .9, alpha: .55, spread: p.ripR ?? 30, squash: .3 });
      // 雨滴打出的亮碎点
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      const R = rng((o.seed ?? 11) + 900 + i);
      for (let k = 0; k < 7; k++) {
        const ph = R() * 6.3, sp = .8 + R() * 1.6;
        const u = ((t * sp + ph) % 2.2) / 2.2;
        const xx = p.x + (R() * 2 - 1) * p.rx * .7, yy = p.y + (R() * 2 - 1) * p.ry * .6;
        if (u < .25) { ctx.globalAlpha = (1 - u / .25) * .5; ctx.beginPath(); ctx.arc(xx, yy, 1.6 + u * 2, 0, TAU); ctx.fill(); }
      }
      ctx.restore();
    }
  }, 'mid');
}

// ---------------------------------------------------------------- 通用：远处车灯
function carDyn_(sc, M, o, cars, layer = 'back') {
  const list = cars.map((c, i) => ({ ...c, ph: c.ph ?? i * 1.7, rate: c.rate ?? .9 }));
  sc.dyn((ctx, t) => {
    for (const c of list) {
      const a = clamp((t - (c.t0 ?? .8)) / 1.2) * (c.a ?? 1) * (o.carGain ?? 1);
      if (a <= .01) continue;
      const x = c.x + (c.vx ?? 0) * t + Math.sin(t * .5 + c.ph) * 4;
      const y = c.y + (c.vy ?? 0) * t;
      // 雨幕里晕开的车灯光斑（三层：大晕、光斑、核心）
      for (const s of [-1, 1]) {
        const cx = x + s * (c.gap ?? 26);
        glow(ctx, t, cx, y, (c.r ?? 34) * 2.6, PAL.lamp, a * .26 * M.warmA, { breathe: .22, rate: c.rate, phase: c.ph + s });
        glow(ctx, t, cx, y, (c.r ?? 34) * 1.35, mix3(PAL.lamp, PAL.cream, .25), a * .6 * M.warmA, { breathe: .2, rate: c.rate, phase: c.ph + s });
        glow(ctx, t, cx, y, (c.r ?? 34) * .55, mix3(PAL.lamp, [255, 250, 236], .5), a * .85 * M.warmA, { breathe: .14, rate: c.rate, phase: c.ph + s });
      }
      // 车灯的横向光带（雨幕里被拉长的光）
      ctx.save(); ctx.globalCompositeOperation = 'source-over';
      const hb = ctx.createLinearGradient(x - 190, y, x + 190, y);
      hb.addColorStop(0, rgba(PAL.lamp, 0));
      hb.addColorStop(.5, rgba(mix3(PAL.lamp, PAL.cream, .4), .34 * a * M.warmA));
      hb.addColorStop(1, rgba(PAL.lamp, 0));
      ctx.fillStyle = hb; ctx.fillRect(x - 200, y - 13, 400, 26);
      // 雨幕里的环状光斑（散在车灯周围）
      ctx.fillStyle = rgba(mix3(PAL.lamp, PAL.cream, .35), .18 * a);
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.arc(x + (k - 1.5) * 46, y - 14 - (k % 2) * 22, 9 + (k % 3) * 4, 0, TAU); ctx.fill();
      }
      // 车灯光柱（沿湿路面向观察者铺开）
      const g = ctx.createLinearGradient(x, y - 20, x, y + 230);
      g.addColorStop(0, rgba(mix3(PAL.lamp, PAL.cream, .4), .38 * a));
      g.addColorStop(1, rgba(PAL.lamp, 0));
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo(x - (c.gap ?? 26) - 22, y + 4); ctx.lineTo(x + (c.gap ?? 26) + 22, y + 4);
      ctx.lineTo(x + 160, y + 250); ctx.lineTo(x - 150, y + 250); ctx.closePath(); ctx.fill();
      // 湿地反射的竖条
      ctx.fillStyle = rgba(mix3(PAL.lamp, PAL.cream, .35), .25 * a);
      ctx.fillRect(x - 9, y + 10, 18, 155);
      ctx.restore();
    }
  }, layer);
}

// ---------------------------------------------------------------- 通用：彩虹（极淡透明；只画在地平线以上）
function rainbowDyn_(sc, rb, gain = 1) {
  const COLS = [[233, 180, 170], [240, 200, 150], [240, 226, 160], [196, 220, 186], [170, 204, 226], [190, 182, 220], [226, 186, 214]];
  sc.dyn((ctx, t) => {
    const u = clamp((t - rb.t0) / (rb.t1 - rb.t0));
    if (u <= .01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(-240, -260, 2400, (rb.clipY ?? 660) + 260); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < COLS.length; i++) {
      const c = COLS[i];
      ctx.strokeStyle = rgba(c, (rb.a ?? .11) * u * gain);
      ctx.lineWidth = rb.bandW ?? 12;
      ctx.beginPath();
      const a0 = Math.PI + (rb.pad ?? .10), a1 = TAU - (rb.pad ?? .10);
      ctx.arc(rb.cx, rb.cy, rb.r - i * (rb.bandW ?? 12) * .92, a0, a0 + (a1 - a0) * clamp(u * (rb.reveal ?? 1)));
      ctx.stroke();
    }
    ctx.restore();
  }, 'back');
}

// ---------------------------------------------------------------- 巷子：远景（巷口对面的街）
function laneFar_(sc, M, o, R) {
  const seed = (o.seed ?? 11) + 210;
  // 巷口对面的楼：远一层 + 近一层（近的稍暗、有暖窗）
  cityRow_(sc, M, o, {
    x0: 500, x1: 1440, yBase: 672, topMin: 318, topMax: 430,
    wMin: 64, wMax: 116, t0: .9, seed: seed, a: .34, pale: .42, windowRows: 2, warmA: .5,
  });
  cityRow_(sc, M, o, {
    x0: 520, x1: 1420, yBase: 702, topMin: 452, topMax: 552,
    wMin: 80, wMax: 150, t0: 1.0, seed: seed + 60, a: .36, pale: .24, windowRows: 1, warmA: .65,
  });
  // 巷口的地面（横着的一条湿街）+ 路缘
  sc.fill([[560, 668], [1360, 668], [1390, 724], [520, 724]], [252, 249, 241], { layer: 'back', j: 2, seed: 1201, t0: .85, dur: .1 });
  sc.wash([[560, 670], [1360, 670], [1390, 728], [520, 728]], mix3(M.roadShade, PAL.greyLight, .45), { a: .34, j: 10, layers: 2, edge: 0, seed: 1202 }, { layer: 'back', t0: .95, dur: .8 });
  sc.ink([[530, 700], [1376, 696]], { w: 1.6, wob: .9, over: 7, gap: .45, seed: 1203 }, { layer: 'back', t0: 1.2, dur: .5, alpha: .55 });
  sc.ink([[540, 716], [1366, 712]], { w: 1.1, wob: .7, over: 4, gap: .5, seed: 1204 }, { layer: 'back', t0: 1.3, dur: .5, alpha: .35 });
  // 巷口远处的路灯：小剪影 + 暖点 + 光晕
  const lx = 1032, ly = 706;
  sc.ink([[lx, ly], [lx + 1, ly - 196]], { w: 1.7, wob: .7, over: 3, gap: .4, seed: 1205 }, { layer: 'back', t0: 1.25, dur: .55, alpha: .72 });
  sc.ink([[lx, ly - 194], [lx - 26, ly - 182]], { w: 1.6, wob: .5, over: 2, seed: 1206 }, { layer: 'back', t0: 1.35, dur: .45, alpha: .7 });
  sc.fill([[lx - 34, ly - 184], [lx - 14, ly - 180], [lx - 16, ly - 168], [lx - 32, ly - 171]], [253, 250, 240], { layer: 'back', j: 1.2, seed: 1207, t0: 1.3, dur: .1 });
  sc.wash(ell(lx - 24, ly - 176, 12, 6, 12), mix3(PAL.lamp, PAL.cream, .3), { a: .55, j: 1.5, layers: 1, edge: 0, seed: 1208 }, { layer: 'back', t0: 1.4, dur: .4 });
  sc.wash(ell(lx - 24, ly - 176, 46, 40, 16), mix3(PAL.lamp, PAL.cream, .4), { a: .18, j: 8, layers: 1, edge: 0, seed: 1209 }, { layer: 'back', t0: 1.45, dur: .5 });
  // 远处车灯（两团暖色）+ 湿地面反光
  sc.wash(ell(858, 702, 30, 9, 14), mix3(PAL.lamp, PAL.pinkPale, .3), { a: .3, j: 2, layers: 1, edge: 0, seed: 1210 }, { layer: 'back', t0: 1.45, dur: .5 });
  sc.wash(ell(898, 700, 22, 7, 14), mix3(PAL.lamp, PAL.cream, .4), { a: .26, j: 2, layers: 1, edge: 0, seed: 1211 }, { layer: 'back', t0: 1.5, dur: .5 });
  sc.wash([[840, 706], [916, 704], [930, 740], [826, 742]], mix3(PAL.lamp, PAL.cream, .4), { a: .12, j: 6, layers: 1, edge: 0, seed: 1212 }, { layer: 'back', t0: 1.55, dur: .5 });
  // 远处的窗 / 门洞的小墨点
  for (let i = 0; i < 22; i++) {
    const x = 540 + R() * 840, y = 470 + R() * 200;
    sc.ink([[x, y], [x + 7, y + 9]], { w: .8, wob: .3, over: .5, seed: 1215 + i, smooth: false }, { layer: 'back', t0: 1.4 + i * .02, dur: .08, alpha: .38 });
  }
}

// ---------------------------------------------------------------- 巷子：两侧的墙与店面
function laneWalls_(sc, M, o, R, lights) {
  const seed = o.seed ?? 11;
  for (const side of [-1, 1]) {
    const sd = seed + (side > 0 ? 600 : 0);
    // 墙面：纸色底 + 冷灰淡彩（上浅下深，墙脚湿）
    const poly = [wallPt(side, 1200, 1), wallPt(side, 300, 1), wallPt(side, 300, 0), wallPt(side, 1200, 0)];
    sc.fill(poly, [252, 249, 240], { layer: 'mid', j: 3, seed: sd + 1, t0: .05, dur: .12 });
    sc.wash(poly, mix3(M.wall, PAL.paper, .34), { a: .34, j: 16, layers: 2, edge: .06, seed: sd + 2, freq: .006 }, { layer: 'mid', t0: .2, dur: 1.1 });
    // 雨天的冷罩：让墙退到雨雾里
    sc.wash(poly, mix3(PAL.bluePale, PAL.grey, .45), { a: .10, j: 24, layers: 1, edge: 0, seed: sd + 11, freq: .008 }, { layer: 'mid', t0: .35, dur: 1.1 });
    sc.wash(wallQuad(side, 300, 1200, 0, .12), M.wallShade, { a: .24, j: 10, layers: 2, edge: 0, seed: sd + 3 }, { layer: 'mid', t0: .45, dur: .9 });
    sc.wash(wallQuad(side, 300, 1200, .62, 1), mix3(M.wall, M.wallShade, .2), { a: .13, j: 18, layers: 1, edge: 0, seed: sd + 4 }, { layer: 'mid', t0: .6, dur: 1 });
    // 屋檐墨线 / 墙脚线 / 巷口远的竖边（速写双线）
    sc.ink([wallPt(side, 300, 1), wallPt(side, 1200, 1)], { w: 2.5, wob: .95, over: 8, gap: .35, seed: sd + 5 }, { layer: 'mid', t0: .45, dur: .8, alpha: .78 });
    sc.ink([wallPt(side, 300, 0), wallPt(side, 1200, 0)], { w: 2.0, wob: .9, over: 6, gap: .4, seed: sd + 6 }, { layer: 'mid', t0: .55, dur: .8, alpha: .6 });
    sc.ink([wallPt(side, 300, 1), wallPt(side, 300, 0)], { w: 2.6, wob: .8, over: 6, seed: sd + 7 }, { layer: 'mid', t0: .6, dur: .5, alpha: .85 });
    sc.ink([wallPt(side, 304, .97), wallPt(side, 304, .03)], { w: 1.1, wob: .7, over: 2, gap: .5, seed: sd + 8 }, { layer: 'mid', t0: .8, dur: .4, alpha: .5 });
    // 檐口下的一道投影（排线）
    sc.hatch(wallQuad(side, 300, 1200, .88, .99), { ang: side * 1.2, gap: 13, w: 1.0, seed: sd + 9 }, { layer: 'mid', t0: 1.0, dur: .7, alpha: .16 });
    // 楼与楼之间的竖向接缝（速写里一道压重的线）+ 接缝两侧的浅影
    const seams = [356, 443, 563, 712, 906];
    seams.forEach((r, k) => {
      sc.ink([wallPt(side, r, .01), wallPt(side, r, .96)], { w: 1.5, wob: .85, over: 5, gap: .4, seed: sd + 20 + k }, { layer: 'mid', t0: .7 + k * .05, dur: .55, alpha: .52 });
      sc.wash(wallQuad(side, r - 17, r + 17, .04, .96), mix3(M.wallShade, PAL.greyLight, .55), { a: .11, j: 6, layers: 1, edge: 0, seed: sd + 30 + k }, { layer: 'mid', t0: .8 + k * .05, dur: .6 });
    });
    // 楼层线（细、断，让楼的结构读得出来）
    [.55, .73, .88].forEach((f, k) => {
      sc.ink([wallPt(side, 300, f), wallPt(side, 1200, f)], { w: 1.0, wob: 1.2, over: 3, gap: .6, seed: sd + 40 + k }, { layer: 'mid', t0: .85 + k * .1, dur: .9, alpha: .22 });
    });
    // 檐口：一道压重的屋顶线 + 檐下阴影带
    sc.wash(wallQuad(side, 300, 1200, .94, 1), mix3(M.wallShade, PAL.greyLight, .5), { a: .16, j: 8, layers: 1, edge: 0, seed: sd + 50 }, { layer: 'mid', t0: .9, dur: .7 });
    // 每栋楼的冷暖差（一点点就够）
    [304, 360, 448, 570].forEach((rA, k) => {
      const rB = [352, 438, 560, 708][k];
      const tint = k % 2 ? mix3(M.wall, PAL.pinkPale, .16) : mix3(M.wall, PAL.greyLight, .3);
      sc.wash(wallQuad(side, rA, rB, .05, .96), tint, { a: .12, j: 10, layers: 1, edge: 0, seed: sd + 60 + k }, { layer: 'mid', t0: .5 + k * .08, dur: .8 });
    });
    // 店面 + 墙上的杂物
    laneShops_(sc, side, M, o, R, sd, lights);
    laneWallProps_(sc, side, M, o, R, sd);
  }
}

// ---------------------------------------------------------------- 巷子：店铺
function laneShops_(sc, side, M, o, R, sd, lights) {
  const units = o.shopUnits ?? [[300, 352], [360, 438], [448, 560], [570, 708], [722, 900]];
  units.forEach((u, i) => {
    const r0 = u[0], r1 = u[1];
    const t0 = .85 + i * .11;
    const seed = sd + 100 + i * 17;
    const fTop = clamp(.40 + (i % 2) * .05 + R() * .05, .36, .52);
    const Q = (fA, fB, ra = r0, rb = r1) => wallQuad(side, ra, rb, fA, fB);
    // 店面的纸色底 + 淡彩
    const face = Q(.015, fTop);
    sc.fill(face, [252, 249, 240], { layer: 'mid', j: 2, seed: seed + 1, t0, dur: .12 });
    sc.wash(face, mix3(M.wall, R() < .5 ? PAL.stoneCool : PAL.greyLight, .4), { a: .24, j: 5, layers: 1, edge: .16, seed: seed + 2 }, { layer: 'mid', t0: t0 + .1, dur: .65 });
    sc.inkPoly(face, { w: 1.85, wob: .75, seed: seed + 3, gap: .4 }, { layer: 'mid', t0: t0 + .2, dur: .55, stagger: .05, alpha: .82 });
    const kind = R() < .55 ? 'shutter' : 'door';
    if (kind === 'shutter') {
      // 卷帘门：整面先压一层冷灰（比墙暗，才立得住）
      sc.wash(Q(.025, fTop * .94), mix3(M.wallShade, PAL.greyLight, .4), { a: .18, j: 4, layers: 1, edge: .12, seed: seed + 9 }, { layer: 'mid', t0: t0 + .25, dur: .55 });
      // 一排横向板条（每根沿深度方向，透视里自然收敛）
      const n = 6;
      for (let k = 0; k < n; k++) {
        const f = .035 + (fTop - .09) * k / (n - 1);
        sc.ink([wallPt(side, r0 + 2, f), wallPt(side, r1 - 2, f)], { w: 1.05, wob: .45, over: 1.5, gap: .45, seed: seed + 10 + k }, { layer: 'mid', t0: t0 + .32 + k * .04, dur: .3, alpha: .6 });
      }
      // 两侧门框
      sc.ink([wallPt(side, r0 + 3, .015), wallPt(side, r0 + 3, fTop * .95)], { w: 1.7, wob: .4, over: 2, seed: seed + 20 }, { layer: 'mid', t0: t0 + .3, dur: .4, alpha: .78 });
      sc.ink([wallPt(side, r1 - 3, .015), wallPt(side, r1 - 3, fTop * .95)], { w: 1.7, wob: .4, over: 2, seed: seed + 21 }, { layer: 'mid', t0: t0 + .34, dur: .4, alpha: .78 });
      // 板条上的竖向接缝 + 卷帘底轨 + 拉绳
      for (let k = 1; k < 3; k++) {
        const rr = lerp(r0 + 8, r1 - 8, k / 3);
        sc.ink([wallPt(side, rr, .04), wallPt(side, rr, fTop * .9)], { w: .9, wob: .4, over: 1, seed: seed + 12 + k }, { layer: 'mid', t0: t0 + .4 + k * .04, dur: .3, alpha: .35 });
      }
      sc.ink([wallPt(side, r0 + 4, .04), wallPt(side, r1 - 4, .04)], { w: 1.9, wob: .4, over: 2, seed: seed + 15 }, { layer: 'mid', t0: t0 + .5, dur: .35, alpha: .7 });
      const cord = wallPt(side, r1 - 8, .28);
      sc.ink([[cord[0], cord[1]], [cord[0] + (side < 0 ? -3 : 3), cord[1] + 30], [cord[0] + (side < 0 ? -1 : 1), cord[1] + 52]], { w: .85, wob: .5, over: 1, seed: seed + 16 }, { layer: 'mid', t0: t0 + .55, dur: .35, alpha: .4 });
      // 卷帘门底的把手
      const pm = wallPt(side, (r0 + r1) / 2, .12);
      sc.ink([[pm[0] - 7, pm[1] + 12], [pm[0] + 7, pm[1] + 12]], { w: 1.5, wob: .3, over: 1, seed: seed + 22 }, { layer: 'mid', t0: t0 + .55, dur: .25, alpha: .8 });
    } else {
      // 木门 / 玻璃门：两扇 + 暗一点的玻璃
      const rMid = (r0 + r1) / 2;
      // 门洞里先压一层暗（纸白是最亮的，门内不用黑）
      sc.wash(Q(.025, fTop * .9), mix3(M.wallShade, PAL.bluePale, .45), { a: .16, j: 5, layers: 1, edge: 0, seed: seed + 29 }, { layer: 'mid', t0: t0 + .2, dur: .5 });
      const glass = Q(.05, fTop * .8, r0 + 8, r1 - 8);
      sc.fill(glass, [250, 249, 243], { layer: 'mid', j: 1.5, seed: seed + 30, t0: t0 + .3, dur: .1 });
      sc.wash(glass, mix3(PAL.glass, PAL.greyLight, .45), { a: .34, j: 3, layers: 2, edge: .14, seed: seed + 31 }, { layer: 'mid', t0: t0 + .4, dur: .5 });
      sc.inkPoly(glass, { w: 1.4, wob: .5, seed: seed + 32, gap: .3 }, { layer: 'mid', t0: t0 + .45, dur: .45, stagger: .04, alpha: .8 });
      sc.ink([wallPt(side, rMid, .02), wallPt(side, rMid, fTop * .9)], { w: 1.9, wob: .4, over: 2, seed: seed + 33 }, { layer: 'mid', t0: t0 + .4, dur: .4, alpha: .85 });
      // 玻璃反光
      sc.ink([[wallPt(side, r0 + 14, fTop * .25)[0], wallPt(side, r0 + 14, fTop * .25)[1]], [wallPt(side, r0 + 26, fTop * .7)[0], wallPt(side, r0 + 26, fTop * .7)[1]]], { w: 1.1, wob: .6, over: 3, gap: .6, seed: seed + 34 }, { layer: 'mid', t0: t0 + .6, dur: .4, alpha: .4 });
    }
    // 招牌（无字：只有轮廓 + 一道旧痕 + 檐下阴影）
    const fS = fTop + .02, fE = fTop + .115;
    const sign = Q(fS, fE);
    sc.fill(sign, [251, 248, 239], { layer: 'mid', j: 1.6, seed: seed + 40, t0: t0 + .3, dur: .1 });
    sc.wash(sign, mix3(PAL.cream, PAL.lamp, .42), { a: .28, j: 3, layers: 1, edge: .32, seed: seed + 41 }, { layer: 'mid', t0: t0 + .4, dur: .5 });
    sc.inkPoly(sign, { w: 1.7, wob: .6, seed: seed + 42, gap: .3 }, { layer: 'mid', t0: t0 + .45, dur: .5, stagger: .05, alpha: .85 });
    sc.ink([wallPt(side, r0 + 10, (fS + fE) / 2), wallPt(side, r1 - 10, (fS + fE) / 2)], { w: .9, wob: .5, over: 2, gap: .6, seed: seed + 43 }, { layer: 'mid', t0: t0 + .65, dur: .35, alpha: .32 });
    // 招牌下沿的投影（让招牌“挂”在墙上）
    sc.wash(wallQuad(side, r0 + 4, r1 - 4, fS - .022, fS - .002), mix3(M.wallShade, PAL.greyLight, .5), { a: .18, j: 4, layers: 1, edge: 0, seed: seed + 44 }, { layer: 'mid', t0: t0 + .55, dur: .45 });
    // 雨棚（部分店）
    if (i % 2 === 0) {
      const a0 = wallPt(side, r0 + 6, fTop - .005), a1 = wallPt(side, r1 - 6, fTop - .005);
      const k = Math.max(14, (r1 - r0) * .2);
      const b0 = [a0[0] - side * k, a0[1] + 18], b1 = [a1[0] - side * k, a1[1] + 18];
      const aw = [a0, a1, b1, b0];
      sc.fill(aw, [251, 248, 239], { layer: 'mid', j: 2, seed: seed + 50, t0: t0 + .25, dur: .1 });
      sc.wash(aw, mix3(M.wallShade, PAL.pinkPale, .35), { a: .3, j: 4, layers: 1, edge: .2, seed: seed + 51 }, { layer: 'mid', t0: t0 + .35, dur: .5 });
      sc.inkPoly(aw, { w: 1.55, wob: .6, seed: seed + 52, gap: .35 }, { layer: 'mid', t0: t0 + .4, dur: .5, stagger: .05, alpha: .8 });
      // 雨棚条纹（等宽，沿出挑方向）
      for (let j = 1; j < 6; j++) {
        const u2 = j / 6;
        const pA = [lerp(a0[0], a1[0], u2), lerp(a0[1], a1[1], u2)];
        const pB = [lerp(b0[0], b1[0], u2), lerp(b0[1], b1[1], u2)];
        sc.ink([pA, [(pA[0] + pB[0]) / 2 + (R() - .5) * 2, (pA[1] + pB[1]) / 2 + 3], pB], { w: .95, wob: .35, over: 1, seed: seed + 55 + j }, { layer: 'mid', t0: t0 + .55 + j * .02, dur: .3, alpha: .33 });
      }
      // 雨棚边的小波浪
      const pts = [];
      for (let j = 0; j <= 6; j++) { const u2 = j / 6; pts.push([lerp(b0[0], b1[0], u2), lerp(b0[1], b1[1], u2) + Math.sin(u2 * Math.PI * 3) * 4]); }
      sc.ink(pts, { w: 1.1, wob: .5, over: 2, seed: seed + 53 }, { layer: 'mid', t0: t0 + .6, dur: .4, alpha: .55 });
      // 雨棚下的暗
      sc.wash([a0, a1, [a1[0], a1[1] + 26], [a0[0], a0[1] + 26]], mix3(M.wallShade, PAL.greyLight, .35), { a: .16, j: 4, layers: 1, edge: 0, seed: seed + 54 }, { layer: 'mid', t0: t0 + .5, dur: .45 });
    }
    // 楼上的窗（两排）
    for (let row = 0; row < 2; row++) {
      const f0 = .60 + row * .15, f1 = f0 + .085;
      if (f1 > .97) continue;
      const n = (r1 - r0) > 130 ? 3 : 2;
      for (let c = 0; c < n; c++) {
        const ra = lerp(r0 + 10, r1 - 10, (c + .18) / n), rb = lerp(r0 + 10, r1 - 10, (c + .82) / n);
        const wq = Q(f0, f1, ra, rb);
        const lit = R() < .26;
        sc.fill(wq, [251, 249, 242], { layer: 'mid', j: 1.4, seed: seed + 60 + row * 7 + c, t0: t0 + .4, dur: .1 });
        sc.wash(wq, lit ? mix3(PAL.lamp, PAL.cream, .3) : mix3(PAL.glass, PAL.greyLight, .4), { a: lit ? .5 : .32, j: 2, layers: 1, edge: .12, seed: seed + 61 + row * 7 + c }, { layer: 'mid', t0: t0 + .5, dur: .45 });
        sc.inkPoly(wq, { w: 1.2, wob: .4, seed: seed + 62 + row * 7 + c, gap: .3 }, { layer: 'mid', t0: t0 + .52, dur: .35, stagger: .03, alpha: .7 });
        // 窗棂（十字）+ 窗台
        const rMid2 = (ra + rb) / 2, fMid = (f0 + f1) / 2;
        sc.ink([wallPt(side, ra + 2, fMid), wallPt(side, rb - 2, fMid)], { w: .9, wob: .3, over: 1, seed: seed + 64 + row * 7 + c }, { layer: 'mid', t0: t0 + .58, dur: .3, alpha: .5 });
        sc.ink([wallPt(side, rMid2, f0 + .01), wallPt(side, rMid2, f1 - .01)], { w: .9, wob: .3, over: 1, seed: seed + 65 + row * 7 + c }, { layer: 'mid', t0: t0 + .6, dur: .3, alpha: .5 });
        sc.ink([wallPt(side, ra - 2, f0 - .005), wallPt(side, rb + 2, f0 - .005)], { w: 1.5, wob: .4, over: 2, seed: seed + 63 + row * 7 + c }, { layer: 'mid', t0: t0 + .62, dur: .3, alpha: .68 });
        // 一些窗里透出的暖光（湿的窗玻璃）
        if (lit) sc.wash(wallQuad(side, ra + 3, rb - 3, f0 + .01, f1 - .01), mix3(PAL.lamp, PAL.cream, .25), { a: .22, j: 2, layers: 1, edge: 0, seed: seed + 66 + row * 7 + c }, { layer: 'mid', t0: t0 + .7, dur: .4 });
      }
    }
    // ---- 第二轮补充：门口灯箱 / 空海报板 / 盆栽 / 垃圾桶 / 自行车 ----
    // 门口灯箱（暖光小方块，挂在门边墙上）
    if (i % 2 === 1 || i === 3) {
      const fLb0 = .22, fLb1 = .32;
      const lb = Q(fLb0, fLb1, r0 + 8, r0 + 8 + Math.max(10, (r1 - r0) * .1));
      sc.fill(lb, [253, 250, 240], { layer: 'mid', j: 1.2, seed: seed + 80, t0: t0 + .35, dur: .1 });
      sc.wash(lb, mix3(PAL.lamp, PAL.cream, .2), { a: .55, j: 2, layers: 1, edge: .35, seed: seed + 81 }, { layer: 'mid', t0: t0 + .4, dur: .5 });
      sc.inkPoly(lb, { w: 1.3, wob: .4, seed: seed + 82, gap: .2 }, { layer: 'mid', t0: t0 + .45, dur: .4, stagger: .03, alpha: .72 });
      const lp = wallPt(side, r0 + 8 + (r1 - r0) * .05, (fLb0 + fLb1) / 2);
      lights.push({ x: lp[0], y: lp[1] + 4, r: 26 + (r1 - r0) * .08, a: .5, t0: t0 + .6 });
      // 灯下的暖色反光底（映在湿墙上）
      sc.wash(Q(.02, .2, r0 + 4, r0 + 4 + (r1 - r0) * .22), mix3(PAL.lamp, PAL.cream, .45), { a: .12, j: 6, layers: 1, edge: 0, seed: seed + 83 }, { layer: 'mid', t0: t0 + .55, dur: .5 });
    }
    // 空海报板（无字：色块 + 胶带角）
    if (i === 1 || i === 4) {
      const pw = Math.max(24, (r1 - r0) * .2);
      const ra0 = side < 0 ? r0 + 12 : r1 - 12 - pw;
      const pq = Q(.20, .33, ra0, ra0 + pw);
      const pcol = mix3(i === 1 ? PAL.pinkPale : PAL.cream, PAL.greyLight, .3);
      sc.fill(pq, [252, 249, 241], { layer: 'mid', j: 1.4, seed: seed + 90, t0: t0 + .45, dur: .1, alpha: .9 });
      sc.wash(pq, pcol, { a: .26, j: 3, layers: 1, edge: .25, seed: seed + 91 }, { layer: 'mid', t0: t0 + .5, dur: .45 });
      sc.inkPoly(pq, { w: 1.15, wob: .4, seed: seed + 92, gap: .25 }, { layer: 'mid', t0: t0 + .55, dur: .4, stagger: .03, alpha: .6 });
      sc.ink([wallPt(side, ra0 + pw * .1, .225), wallPt(side, ra0 + pw * .9, .222)], { w: .9, wob: .4, over: 1.5, gap: .5, seed: seed + 93 }, { layer: 'mid', t0: t0 + .7, dur: .3, alpha: .35 });
    }
    // 门口的地面小物：盆栽 / 垃圾桶 / 靠墙自行车（沿墙脚，透视里缩）
    const base = wallPt(side, (r0 + r1) / 2, 0);
    const scl = (r0 + r1) / 2;
    if (i === 2) { potPlant_(sc, base[0] - side * 16, base[1] + 2, scl * .10, seed + 100, t0 + .6, 'mid'); }
    if (i === 3) { bin_(sc, base[0] - side * 26, base[1] + 4, scl * .10, seed + 110, t0 + .65, 'mid'); }
    if (i === 3) {
      const b = wallPt(side, r0 + (r1 - r0) * .18, 0);
      bike_(sc, b[0] - side * 34, b[1] + 4, scl * .11, seed + 120, t0 + .7, side < 0 ? 1 : -1, 'mid');
    }
  });
}

// 墙上的杂物：落水管 / 空调 / 电箱 / 挂招牌
function laneWallProps_(sc, side, M, o, R, sd) {
  // 落水管两根
  for (const r of [352, 722]) {
    const b = wallPt(side, r, .02), t = wallPt(side, r, .94);
    sc.ink([[b[0] + (R() - .5) * 3, b[1] - 4], [b[0] + (R() - .5) * 3, t[1] + 8]], { w: 1.5, wob: .7, over: 4, gap: .4, seed: sd + 200 + r }, { layer: 'mid', t0: 1.25, dur: .6, alpha: .7 });
    const m1 = wallPt(side, r + 8, .16);
    sc.ink([[b[0] + 2, m1[1]], [b[0] + 6, m1[1]]], { w: 1.0, wob: .3, over: 1, seed: sd + 210 + r }, { layer: 'mid', t0: 1.45, dur: .3, alpha: .5 });
  }
  // 空调外机
  const ac = wallQuad(side, 600, 668, .66, .78);
  sc.fill(ac, [251, 248, 239], { layer: 'mid', j: 1.5, seed: sd + 230, t0: 1.3, dur: .1 });
  sc.wash(ac, mix3(M.wallShade, PAL.greyLight, .5), { a: .2, j: 2, layers: 1, edge: .2, seed: sd + 231 }, { layer: 'mid', t0: 1.4, dur: .5 });
  sc.inkPoly(ac, { w: 1.3, wob: .4, seed: sd + 232, gap: .25 }, { layer: 'mid', t0: 1.45, dur: .4, stagger: .04, alpha: .7 });
  // 电箱
  const eb = wallQuad(side, 452, 486, .18, .30);
  sc.fill(eb, [251, 248, 239], { layer: 'mid', j: 1.2, seed: sd + 240, t0: 1.35, dur: .1 });
  sc.wash(eb, mix3(M.wall, PAL.greyLight, .6), { a: .2, j: 2, layers: 1, edge: .15, seed: sd + 241 }, { layer: 'mid', t0: 1.45, dur: .4 });
  sc.inkPoly(eb, { w: 1.2, wob: .35, seed: sd + 242, gap: .2 }, { layer: 'mid', t0: 1.5, dur: .35, stagger: .03, alpha: .65 });
  // 挂出来的招牌（无字：暖色小灯箱 + 两根吊杆，别太亮）
  const rA = side < 0 ? 505 : 500;
  const pTop = wallPt(side, rA, .58), pBot = wallPt(side, rA, .46);
  const off = 42;
  const sx0 = pTop[0] - side * off, sy0 = pTop[1] + 8, sw = 30, shh = 54;
  const sq = [[sx0, sy0], [sx0 + sw, sy0 + 4], [sx0 + sw, sy0 + shh], [sx0, sy0 + shh - 4]];
  sc.ink([[pTop[0], pTop[1]], [sx0 + (side < 0 ? 4 : sw - 4), sy0]], { w: 1.4, wob: .4, over: 2, seed: sd + 250 }, { layer: 'mid', t0: 1.55, dur: .4, alpha: .75 });
  sc.ink([[pBot[0], pBot[1]], [sx0 + (side < 0 ? 4 : sw - 4), sy0 + shh - 4]], { w: 1.2, wob: .4, over: 2, seed: sd + 251 }, { layer: 'mid', t0: 1.6, dur: .4, alpha: .6 });
  sc.fill(sq, [252, 249, 240], { layer: 'mid', j: 1.5, seed: sd + 252, t0: 1.55, dur: .1 });
  sc.wash(sq, mix3(PAL.lamp, PAL.pinkPale, .45), { a: .4, j: 2, layers: 1, edge: .3, seed: sd + 253 }, { layer: 'mid', t0: 1.65, dur: .45 });
  sc.inkPoly(sq, { w: 1.5, wob: .45, seed: sd + 254, gap: .2 }, { layer: 'mid', t0: 1.7, dur: .4, stagger: .04, alpha: .8 });
  // 灯箱里的旧痕（不是字）
  sc.ink([[sx0 + 6, sy0 + 20], [sx0 + sw - 6, sy0 + 22]], { w: 1.0, wob: .5, over: 1.5, gap: .5, seed: sd + 255 }, { layer: 'mid', t0: 1.85, dur: .3, alpha: .3 });
  sc.ink([[sx0 + 8, sy0 + 34], [sx0 + sw - 9, sy0 + 36]], { w: .9, wob: .5, over: 1.5, gap: .5, seed: sd + 256 }, { layer: 'mid', t0: 1.9, dur: .3, alpha: .24 });
}

// ---------------------------------------------------------------- 巷子：地面
function laneRoad_(sc, M, o, R) {
  const yF = LANE_FAR_Y, yN = 1200;
  const poly = [[laneXL(yF), yF], [laneXR(yF), yF], [laneXR(yN), yN], [laneXL(yN), yN]];
  sc.fill(poly, [252, 249, 241], { layer: 'mid', j: 2, seed: 900, t0: .12, dur: .1 });
  sc.wash(poly, mix3(M.road, PAL.bluePale, .25), { a: .42, j: 16, layers: 2, edge: 0, seed: 901, freq: .007 }, { layer: 'mid', t0: .25, dur: 1.1 });
  // 路中间的反光湿带
  const band = [[laneXL(760), 760], [laneXR(760), 760], [laneXR(985), 985], [laneXL(985), 985]];
  sc.wash(band, mix3(M.road, PAL.bluePale, .4), { a: .17, j: 18, layers: 2, edge: 0, seed: 902 }, { layer: 'mid', t0: .55, dur: .9 });
  // 石板缝
  paving_(sc, M, o, { yFar: 718, yNear: yN, rows: 7, cols: 9, xl: laneXL, xr: laneXR, yMax: 900, t0: .7, alpha: .62, seed: (o.seed ?? 11) + 71 });
  // 路缘 / 排水沟
  for (const side of [-1, 1]) {
    const p0 = wallPt(side, 300, 0), p1 = wallPt(side, 1200, 0);
    const q0 = [p0[0] - side * 13, p0[1] + 8], q1 = [p1[0] - side * 13, p1[1] + 8];
    sc.wash([p0, p1, q1, q0], mix3(M.roadShade, PAL.greyLight, .55), { a: .26, j: 8, layers: 1, edge: 0, seed: 910 + side }, { layer: 'mid', t0: .6, dur: .8 });
    sc.ink([q0, q1], { w: 1.7, wob: .8, over: 5, gap: .45, seed: 912 + side }, { layer: 'mid', t0: .75, dur: .6, alpha: .55 });
    // 路缘石的分块（小刻线，越近越长）
    for (let k = 0; k < 9; k++) {
      const u = k / 9, r = 320 + u * 860;
      const p = wallPt(side, r, 0), qq = [p[0] - side * 15, p[1] + 9];
      sc.ink([[p[0], p[1] + 2], [qq[0], qq[1]]], { w: 1.0, wob: .35, over: 1.5, seed: 916 + side * 13 + k }, { layer: 'mid', t0: .95 + k * .03, dur: .3, alpha: .34 });
    }
    // 积水沟（靠墙一条更湿的痕）
    const g0 = [p0[0] - side * 34, p0[1] + 16], g1 = [p1[0] - side * 34, p1[1] + 16];
    sc.wash([q0, q1, g1, g0], mix3(M.roadShade, PAL.puddle, .4), { a: .18, j: 14, layers: 1, edge: 0, seed: 914 + side }, { layer: 'mid', t0: .9, dur: .7 });
  }
  // 湿地上的长条反光（店招 / 窗光 / 路灯落在地上的倒影）
  const reflR = rng((o.seed ?? 11) + 77);
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1;
    const r = 360 + reflR() * 640;
    const x = 960 + side * r;
    const yb = VP.y + VP.kBot * r;
    const len = 80 + reflR() * 150, wdt = 22 + reflR() * 46;
    const warm = reflR() < .5;
    sc.wash([[x - wdt * .35, yb + 8], [x + wdt * .35, yb + 8], [x + wdt * .6, yb + 8 + len], [x - wdt * .6, yb + 8 + len]],
      warm ? mix3(PAL.lamp, PAL.cream, .5) : mix3(PAL.bluePale, PAL.greyLight, .35),
      { a: warm ? .17 : .14, j: 8, layers: 1, edge: 0, seed: 920 + i }, { layer: 'mid', t0: 1.05 + i * .05, dur: .7 });
  }
  // 井盖 / 落叶 / 排水篦子（第二轮：路面信息量）
  manhole_(sc, 1128, 838, 52, (o.seed ?? 11) + 930, 1.1); 
  manhole_(sc, 690, 792, 34, (o.seed ?? 11) + 931, 1.2);
  drain_(sc, laneXL(884) + 46, 884, 62, (o.seed ?? 11) + 940, 1.15);
  drain_(sc, laneXR(896) - 46, 896, 58, (o.seed ?? 11) + 941, 1.2);
  leaves_(sc, 380, 1620, 770, 902, 16, (o.seed ?? 11) + 950, M, 1.2);
  // 再补几道暖反光（贴着灯箱/招牌的湿地倒影）
  sc.wash([[960 - 250, 862], [960 - 190, 858], [960 - 170, 930], [960 - 280, 936]], mix3(PAL.lamp, PAL.cream, .5), { a: .2, j: 8, layers: 1, edge: 0, seed: 960 }, { layer: 'mid', t0: 1.35, dur: .7 });
  sc.wash([[960 + 210, 852], [960 + 272, 848], [960 + 300, 928], [960 + 228, 934]], mix3(PAL.lamp, PAL.cream, .5), { a: .18, j: 8, layers: 1, edge: 0, seed: 961 }, { layer: 'mid', t0: 1.4, dur: .7 });
}

// ================================================================ 巷子镜头（4.1 / 6.3）
export function laneSet(o = {}) {
  const M = mood(o.weather === 'cold' ? 'cold' : (o.weather ?? 'rain'));
  const sc = new Scene({ w: 1920, h: 1080, base: { x: BR, y: BC }, layers: LAYERS });
  const seed = o.seed ?? 11;
  const R = rng(seed);
  skyBackdrop_(sc, M, o, 720);
  laneFar_(sc, M, o, R);
  // 更远一层天际线 + 青灰薄雾（把楼推远）
  farSkyline_(sc, M, o, { x0: 420, x1: 1520, yBase: 664, topMin: 300, topMax: 420, wMin: 80, wMax: 170, t0: .55, seed: seed + 880 });
  farMist_(sc, M, o, 470, 700);
  // 巷口对面的行道树剪影
  streetTree_(sc, M, o, 610, 690, 240, seed + 870, .9, true);
  streetTree_(sc, M, o, 1320, 692, 225, seed + 871, .95, true);
  const shopLights = [];
  laneWalls_(sc, M, o, R, shopLights);
  laneRoad_(sc, M, o, R);
  // 门口灯箱的暖光（动态呼吸）
  if (shopLights.length) {
    sc.dyn((ctx, t) => {
      for (let i = 0; i < shopLights.length; i++) {
        const L = shopLights[i];
        const a = clamp((t - L.t0) / .8) * L.a;
        if (a <= .01) continue;
        glow(ctx, t, L.x, L.y, L.r, mix3(PAL.lamp, PAL.cream, .3), a * .55 * M.warmA, { breathe: .1, rate: 1.3, phase: i * 1.7 });
      }
    }, 'mid');
  }
  // 电线（两个灯杆之间 + 一根向巷口去 + 更密的几根）
  if (o.wires !== false) {
    wires_(sc, M, o, [
      [[330, 300], [1420, 262], 52],
      [[250, 470], [1500, 430], 66],
      [[300, 356], [1460, 322], 58],
    ], seed + 300, 1.2);
    // 电线杆 + 变压器（左侧墙脚，半挡在墙前）
    const pole = utilityPole_(sc, M, o, 222, 918, 700, seed + 820, 1.15, 'mid');
    wires_(sc, M, o, [
      [[pole.top[0], pole.top[1]], [1480, 226], 44],
      [pole.arms[0], [1470, 260], 40],
      [pole.arms[1], [1500, 300], 46],
    ], seed + 340, 1.35);
  }
  // 路灯
  const lamps = [];
  const specs = o.lamps ?? [{ x: 386, yBase: 828, h: 556, dir: 1, rate: 1.1, ph: .4 }];
  specs.forEach((L, i) => {
    const head = lampStatic_(sc, M, o, L.x, L.yBase, L.h, L.dir, seed + 400 + i * 11, 1.15 + i * .1);
    lamps.push({ ...head, gx: L.gx ?? L.x + L.dir * 46, gy: L.gy, poolR: L.poolR ?? 260, rate: L.rate, ph: L.ph, a: L.a });
  });
  // 水洼
  const puddles = o.puddles ?? [
    { x: 700, y: 848, rx: 240, ry: 36, lamp: true, lampX: 420, ripN: 5 },
    { x: 1230, y: 792, rx: 150, ry: 22, lamp: false, ripN: 4 },
    { x: 930, y: 752, rx: 96, ry: 13, lamp: true, ripN: 3 },
  ];
  puddles.forEach((p, i) => puddleWash_(sc, p, M, seed + 500 + i * 41, 1.0 + i * .1));
  // 雨 / 雾
  if (M.rain) {
    rainLayer_(sc, o, 'back', { n: o.rainBackN ?? 220, gain: .6, alpha: .75, len: .9, t0: .3 });
    rainLayer_(sc, o, 'mid', { n: o.rainN ?? 430, gain: 1.35, alpha: 1, t0: .25 });
    rainLayer_(sc, o, 'front', { n: o.rainFrontN ?? 70, gain: .9, alpha: .85, len: 2.2, wMul: 1.7, clipB: 900, t0: .4 });
  }
  fogDyn_(sc, M, o);
  lampDyn_(sc, lamps, M, o);
  puddleDyn_(sc, puddles, M, o);
  // 店招/灯箱暖光在湿地上的竖向倒影
  shopReflectDyn_(sc, M, o, shopLights.filter((L) => L.x > 120 && L.x < 1800).map((L) => ({ x: L.x, y: 830 + (L.x % 7) * 6, w: 26 + L.r * .5, len: 150 + L.r, a: .9 })), 'mid');
  // 地面上的雨点小水花
  groundSplashDyn_(sc, o, 260, 1660, 760, 902, 30, 'mid');
  if (o.farCars !== false) carDyn_(sc, M, o, o.cars ?? [{ x: 900, y: 676, r: 30, gap: 22, a: .9, rate: .8, t0: 1.0 }], 'back');
  nearDarkDyn_(sc, o);
  safeVeil_(sc, o);
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? (t => ({ cx: 960, cy: 545, z: 1, rot: 0 }));
  return sc;
}

// ================================================================ 水洼特写（4.2）
export function puddleSet(o = {}) {
  const M = mood(o.weather ?? 'rain');
  const sc = new Scene({ w: 1920, h: 1080, base: { x: BR, y: BC }, layers: LAYERS });
  const seed = o.seed ?? 21;
  const R = rng(seed);
  const lineY = o.lineY ?? 298;
  // ---- 上方：湿的地面（只露一条贴地的缝）
  sc.fill([[-200, -240], [2120, -240], [2120, lineY + 30], [-200, lineY + 30]], [252, 249, 240], { layer: 'mid', j: 3, seed: 1301, t0: .05, dur: .1 });
  sc.wash([[-200, -240], [2120, -240], [2120, lineY - 6], [-200, lineY - 2]], mix3(M.road, PAL.paper, .3), { a: .3, j: 18, layers: 2, edge: 0, seed: 1302, freq: .007 }, { layer: 'mid', t0: .2, dur: 1 });
  sc.wash([[-200, lineY - 150], [2120, lineY - 170], [2120, lineY + 6], [-200, lineY + 2]], mix3(M.roadShade, PAL.bluePale, .55), { a: .18, j: 16, layers: 1, edge: 0, seed: 1303 }, { layer: 'mid', t0: .4, dur: .8 });
  // 地面上的碎石 / 湿的斑
  for (let i = 0; i < 16; i++) {
    const x = R() * 1920, y = -20 + R() * (lineY - 40);
    sc.wash(ell(x, y, 8 + R() * 26, 2 + R() * 5, 12), mix3(M.roadShade, PAL.greyLight, .6), { a: .16, j: 4, layers: 1, edge: 0, seed: 1310 + i }, { layer: 'mid', t0: .5 + i * .02, dur: .5 });
  }
  // 路缘石：贴地的一条横线（微斜），石缝
  sc.ink([[-200, lineY - 26], [2120, lineY - 12]], { w: 2.4, wob: 1.3, over: 7, gap: .35, seed: 1320 }, { layer: 'mid', t0: .6, dur: .6, alpha: .72 });
  sc.ink([[-200, lineY - 8], [2120, lineY + 5]], { w: 1.6, wob: 1.1, over: 5, gap: .5, seed: 1321 }, { layer: 'mid', t0: .75, dur: .55, alpha: .5 });
  for (let i = 0; i < 9; i++) {
    const x = -100 + i * 240 + (R() - .5) * 40;
    sc.ink([[x, lineY - 24], [x + 2, lineY - 2]], { w: 1.0, wob: .5, over: 1.5, gap: .4, seed: 1330 + i }, { layer: 'mid', t0: .8 + i * .03, dur: .3, alpha: .38 });
  }
  // ---- 水面：从路缘往下整片
  sc.fill([[-200, lineY + 2], [2120, lineY + 2], [2120, 1240], [-200, 1240]], [251, 249, 243], { layer: 'mid', j: 2, seed: 1340, t0: .2, dur: .1 });
  sc.wash([[-200, lineY - 4], [2120, lineY + 4], [2120, 1240], [-200, 1240]], mix3(M.puddle, PAL.greyLight, .35), { a: .34, j: 22, layers: 2, edge: 0, seed: 1341, freq: .006 }, { layer: 'mid', t0: .45, dur: 1.2 });
  // 水里偏暗的几块（倒映着街，不是一整片平色）
  for (let i = 0; i < 6; i++) {
    const x = -160 + i * 320 + (R() - .5) * 90, y = lineY + 60 + R() * 520;
    const rx = 160 + R() * 220, ry = 70 + R() * 120;
    sc.wash(ell(x, y, rx, ry, 20), mix3(M.roadShade, PAL.bluePale, .45), { a: .16, j: 20, layers: 1, edge: 0, seed: 1345 + i }, { layer: 'mid', t0: .75 + i * .06, dur: .9 });
  }
  // 水面上的天光留白条（湿画法的大块留白）
  for (let i = 0; i < 6; i++) {
    const x = 60 + R() * 1600, w = 110 + R() * 300;
    sc.fill([[x, lineY + 40], [x + w, lineY + 28], [x + w + 34, lineY + 130], [x + 10, lineY + 150]], [254, 252, 247], { layer: 'mid', j: 14, seed: 1350 + i, t0: .6 + i * .07, dur: .1, alpha: .55 });
  }
  // 水面上部：倒映的街市（建筑/灯的深色竖带，很淡）
  for (let i = 0; i < 7; i++) {
    const x = -120 + i * 300 + R() * 70, wid = 90 + R() * 150;
    const d1 = 90 + R() * 110, d2 = 90 + R() * 110;
    sc.wash([[x, lineY + 12], [x + wid, lineY + 14], [x + wid - 12, lineY + 14 + d2], [x + 10, lineY + 14 + d1]],
      mix3(M.city2, PAL.grey, .4), { a: .2, j: 12, layers: 1, edge: 0, seed: 1380 + i }, { layer: 'mid', t0: .85 + i * .05, dur: .7 });
  }
  // 水面的横纹（湿画法的层叠）
  for (let i = 0; i < 12; i++) {
    const yy = lineY + 60 + Math.pow(i / 12, 1.6) * 760;
    const hh = 6 + (yy - lineY) * .045;
    sc.wash([[-200, yy], [2120, yy + (R() - .5) * 8], [2120, yy + hh], [-200, yy + hh + (R() - .5) * 6]],
      mix3(M.puddle, PAL.greyLight, .5), { a: .07, j: 8, layers: 1, edge: 0, seed: 1390 + i }, { layer: 'mid', t0: 1.0 + i * .03, dur: .6 });
  }
  // 水边的一道暗（湿泥/水膜）
  sc.wash([[-200, lineY - 2], [2120, lineY + 6], [2120, lineY + 46], [-200, lineY + 38]], mix3(M.roadShade, PAL.blue, .35), { a: .2, j: 10, layers: 2, edge: 0, seed: 1355 }, { layer: 'mid', t0: .7, dur: .7 });
  // 水边不规则的一条湿痕（不是直线）
  const wetEdge = [];
  for (let i = 0; i <= 14; i++) { const x = -200 + i / 14 * 2320; wetEdge.push([x, lineY + 2 + Math.sin(i * 1.9) * 3 + (R() - .5) * 4]); }
  sc.ink(wetEdge, { w: 1.5, wob: .9, over: 4, gap: .55, seed: 1356 }, { layer: 'mid', t0: .8, dur: .6, alpha: .42 });
  // 水面的细波（静态淡彩，动态里再叠）
  for (let i = 0; i < 22; i++) {
    const x = -100 + R() * 2120, y = lineY + 40 + R() * 720;
    const wl = 40 + R() * 150;
    sc.ink([[x, y], [x + wl * .5, y + (R() - .5) * 3], [x + wl, y + (R() - .5) * 2]], { w: .9, wob: .55, over: 1.5, gap: .3, seed: 1360 + i, smooth: true }, { layer: 'mid', t0: .9 + (i % 8) * .05, dur: .45, alpha: .22 });
  }
  // 水面上漂着的落叶 / 水边的碎屑（第二轮：信息量）
  leaves_(sc, 120, 1800, lineY + 60, lineY + 620, 7, seed + 1600, M, 1.05, 'mid');
  for (let i = 0; i < 10; i++) {
    const x = -60 + R() * 2040, y = lineY + 16 + R() * 26;
    sc.wash(ell(x, y, 4 + R() * 8, 1.6 + R() * 3, 10), mix3(M.roadShade, PAL.greyLight, .5), { a: .32, j: 3, layers: 1, edge: 0, seed: seed + 1610 + i }, { layer: 'mid', t0: 1.0 + i * .02, dur: .4 });
  }
  // 第二根暖光倒影（画外的店招/小灯），水面有自己的第二处暖反光
  sc.wash([[420, lineY + 30], [478, lineY + 34], [462, lineY + 520], [408, lineY + 500]], mix3(PAL.lamp, PAL.cream, .45), { a: .22, j: 12, layers: 2, edge: 0, seed: seed + 1620 }, { layer: 'mid', t0: 1.0, dur: .8 });
  sc.wash([[438, lineY + 40], [460, lineY + 42], [456, lineY + 300], [432, lineY + 296]], [255, 252, 242], { a: .28, j: 6, layers: 1, edge: 0, seed: seed + 1621 }, { layer: 'mid', t0: 1.1, dur: .7 });
  // 路灯倒影（静态底色：几根竖的暖条，动态里再抖动断裂）
  const reflX = o.lampX ?? 1370;
  sc.wash([[reflX - 42, lineY + 16], [reflX + 8, lineY + 18], [reflX + 2, lineY + 620], [reflX - 34, lineY + 600]], mix3(PAL.lamp, PAL.cream, .4), { a: .2, j: 10, layers: 2, edge: 0, seed: 1370 }, { layer: 'mid', t0: .8, dur: .9 });
  sc.wash([[reflX + 16, lineY + 24], [reflX + 40, lineY + 22], [reflX + 46, lineY + 460], [reflX + 26, lineY + 470]], mix3(PAL.lamp, [255, 252, 240], .4), { a: .22, j: 6, layers: 1, edge: 0, seed: 1371 }, { layer: 'mid', t0: .9, dur: .7 });
  sc.wash([[reflX - 8, lineY + 30], [reflX + 12, lineY + 30], [reflX + 10, lineY + 300], [reflX - 6, lineY + 296]], [255, 252, 242], { a: .26, j: 4, layers: 1, edge: 0, seed: 1372 }, { layer: 'mid', t0: 1.0, dur: .7 });
  // 水面上的雨点涟漪
  const rips = [
    makeRipples({ seed: seed + 1400, n: 12, x0: 60, x1: 1860, y0: lineY + 30, y1: lineY + 760, span: 7 }),
    makeRipples({ seed: seed + 1401, n: 8, x0: 200, x1: 1700, y0: lineY + 90, y1: lineY + 500, span: 9 }),
  ];
  sc.dyn((ctx, t) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(-120, lineY - 10, 2160, 1300); ctx.clip();
    rips[0](ctx, t, { gain: 1.25, alpha: .85, spread: 44, squash: .26 });
    rips[1](ctx, t, { gain: 1, alpha: .65, spread: 30, squash: .3 });
    // 雨滴打水的小水花
    const R2 = rng(seed + 1420);
    ctx.strokeStyle = 'rgba(90,100,105,.5)';
    for (let k = 0; k < 26; k++) {
      const cx = 20 + R2() * 1880, cy = lineY + 30 + R2() * 700, per = 1.1 + R2() * 1.9, off = R2() * 6;
      const u = ((t + off) % per) / per;
      if (u > .35) continue;
      const a2 = (1 - u / .35) * .5;
      for (let j = 0; j < 5; j++) {
        const ang = -Math.PI / 2 + (j - 2) * .45, L = 3 + u * 12;
        ctx.globalAlpha = a2; ctx.lineWidth = .9;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * L, cy + Math.sin(ang) * L - u * 3); ctx.stroke();
      }
    }
    ctx.restore();
  }, 'mid');
  // 水面的光斑（暖光呼吸）
  const spots = [{ x: reflX, y: lineY + 120, r: 120, a: .34, rate: .9, ph: .4 }];
  sc.dyn((ctx, t) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(-120, lineY, 2160, 1000); ctx.clip();
    for (const s of spots) {
      const wob = Math.sin(t * 1.2 + s.ph) * 6;
      glow(ctx, t, s.x + wob, s.y, s.r, PAL.lamp, s.a * M.warmA * .7, { breathe: .2, rate: s.rate, phase: s.ph });
      // 长长的竖向暖色反射
      const g = ctx.createLinearGradient(0, lineY + 20, 0, lineY + 700);
      g.addColorStop(0, rgba(PAL.lamp, .24 * M.warmA));
      g.addColorStop(.45, rgba(mix3(PAL.lamp, PAL.cream, .4), .14 * M.warmA));
      g.addColorStop(1, rgba(PAL.lamp, 0));
      ctx.fillStyle = g;
      ctx.fillRect(s.x - 46 + wob * .6, lineY + 20, 92, 700);
      // 断掉的光段（水面波纹切断光柱）
      ctx.fillStyle = rgba(mix3(PAL.lamp, [255, 255, 255], .45), .32 * M.warmA);
      for (let k = 0; k < 6; k++) {
        const yy = lineY + 40 + ((t * 20 + k * 61) % 480);
        ctx.beginPath(); ctx.ellipse(s.x + Math.sin(t * 1.7 + k) * 10, yy, 30 - k * 3, 2.2, 0, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }, 'mid');
  // 雨 / 雾 / 安全区
  if (M.rain) {
    rainLayer_(sc, o, 'mid', { n: o.rainN ?? 130, gain: .9, alpha: .9, t0: .2, len: 1.25, wMul: 1.3 });
    rainLayer_(sc, o, 'front', { n: o.rainFrontN ?? 30, gain: .8, alpha: .7, len: 2.1, wMul: 1.8, clipB: 900, t0: .3 });
  }
  fogDyn_(sc, M, o);
  safeVeil_(sc, { ...o, veilY0: o.veilY0 ?? 860 });
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? (t => ({ cx: 960, cy: 520, z: 1, rot: 0 }));
  return sc;
}
export const PUDDLE = { lineY: 298 };

// ================================================================ 路口（4.3）
export function crossingSet(o = {}) {
  const M = mood(o.weather ?? 'rain');
  const sc = new Scene({ w: 1920, h: 1080, base: { x: BR, y: BC }, layers: LAYERS });
  const seed = o.seed ?? 31;
  const R = rng(seed);
  const horizon = 556, farKerb = 700;
  skyBackdrop_(sc, M, o, horizon);
  // 对街楼群（横着一排，店面朝我们）
  cityRow_(sc, M, o, {
    x0: -140, x1: 2060, yBase: 650, topMin: 150, topMax: 340,
    wMin: 220, wMax: 420, t0: 1.0, seed: seed + 210, a: .36, pale: .35, windowRows: 4,
  });
  // 更远一层天际线 + 青灰薄雾（把对街推远）
  farSkyline_(sc, M, o, { x0: -200, x1: 2200, yBase: 638, topMin: 120, topMax: 280, wMin: 140, wMax: 320, t0: .55, seed: seed + 880 });
  farMist_(sc, M, o, 430, 660);
  // 对街的行道树剪影
  streetTree_(sc, M, o, 150, 660, 300, seed + 870, .95, true);
  streetTree_(sc, M, o, 880, 664, 280, seed + 871, 1.0, true);
  streetTree_(sc, M, o, 1660, 662, 310, seed + 872, 1.05, true);
  const shopLights = [];
  // 对街店面：门洞 / 卷帘 / 招牌（正面看，勾出轮廓与暗部）
  for (let i = 0; i < 6; i++) {
    const x = -40 + i * 330 + R() * 60, w = 150 + R() * 110, h = 118 + R() * 46;
    const yb = 646 + R() * 10;
    const sd = seed + 300 + i * 9;
    const q = [[x, yb], [x, yb - h], [x + w, yb - h + 4], [x + w, yb]];
    sc.fill(q, [252, 249, 240], { layer: 'mid', j: 2, seed: sd, t0: 1.1 + i * .05, dur: .1 });
    // 门洞里压暗（不用黑）
    sc.wash([[x + 5, yb - 4], [x + 5, yb - h + 10], [x + w - 5, yb - h + 12], [x + w - 5, yb - 2]], mix3(M.wallShade, PAL.bluePale, .55), { a: .2, j: 4, layers: 1, edge: 0, seed: sd + 1 }, { layer: 'mid', t0: 1.2 + i * .05, dur: .55 });
    // 卷帘门（暗灰）+ 横板条
    sc.wash([[x + 12, yb - 6], [x + 12, yb - h * .72], [x + w - 12, yb - h * .72 + 3], [x + w - 12, yb - 4]], mix3(M.wallShade, PAL.greyLight, .42), { a: .22, j: 3, layers: 1, edge: .1, seed: sd + 2 }, { layer: 'mid', t0: 1.28 + i * .05, dur: .5 });
    for (let k = 0; k < 5; k++) {
      const yy = yb - h * (.09 + k * .15);
      sc.ink([[x + 10, yy], [x + w - 10, yy + 1]], { w: 1.05, wob: .45, over: 1.5, gap: .4, seed: sd + 10 + k }, { layer: 'mid', t0: 1.4 + i * .05 + k * .03, dur: .35, alpha: .55 });
    }
    sc.inkPoly(q, { w: 1.9, wob: .6, seed: sd + 20, gap: .3 }, { layer: 'mid', t0: 1.3 + i * .05, dur: .5, stagger: .05, alpha: .82 });
    // 两侧门框（压重）
    sc.ink([[x + 8, yb - 4], [x + 8, yb - h + 8]], { w: 1.7, wob: .4, over: 2, seed: sd + 21 }, { layer: 'mid', t0: 1.38 + i * .05, dur: .4, alpha: .8 });
    sc.ink([[x + w - 8, yb - 4], [x + w - 8, yb - h + 10]], { w: 1.7, wob: .4, over: 2, seed: sd + 22 }, { layer: 'mid', t0: 1.42 + i * .05, dur: .4, alpha: .8 });
    // 招牌（暖色横板，无字）
    const sg = [[x - 4, yb - h - 36], [x + w + 4, yb - h - 32], [x + w + 4, yb - h - 6], [x - 4, yb - h - 10]];
    sc.fill(sg, [251, 248, 239], { layer: 'mid', j: 1.5, seed: sd + 30, t0: 1.3 + i * .05, dur: .1 });
    sc.wash(sg, mix3(PAL.cream, PAL.lamp, .45), { a: .3, j: 2, layers: 1, edge: .3, seed: sd + 31 }, { layer: 'mid', t0: 1.4 + i * .05, dur: .5 });
    sc.inkPoly(sg, { w: 1.6, wob: .5, seed: sd + 32, gap: .25 }, { layer: 'mid', t0: 1.45 + i * .05, dur: .45, stagger: .04, alpha: .78 });
    // 招牌下的阴影
    sc.wash([[x, yb - h - 8], [x + w, yb - h - 4], [x + w, yb - h + 8], [x, yb - h + 4]], mix3(M.wallShade, PAL.greyLight, .4), { a: .14, j: 3, layers: 1, edge: 0, seed: sd + 33 }, { layer: 'mid', t0: 1.5 + i * .05, dur: .4 });
    // 一半店有雨棚
    if (i % 2 === 0) {
      const aw = [[x + 4, yb - h * .66], [x + w - 4, yb - h * .66 + 2], [x + w - 26, yb - h * .58], [x + 26, yb - h * .58]];
      sc.fill(aw, [251, 248, 239], { layer: 'mid', j: 2, seed: sd + 40, t0: 1.35 + i * .05, dur: .1 });
      sc.wash(aw, mix3(M.wallShade, PAL.pinkPale, .4), { a: .28, j: 3, layers: 1, edge: .2, seed: sd + 41 }, { layer: 'mid', t0: 1.45 + i * .05, dur: .5 });
      sc.inkPoly(aw, { w: 1.5, wob: .55, seed: sd + 42, gap: .3 }, { layer: 'mid', t0: 1.5 + i * .05, dur: .45, stagger: .04, alpha: .75 });
      // 雨棚条纹
      for (let j = 1; j < 7; j++) {
        const u2 = j / 7, xx = lerp(aw[0][0], aw[1][0], u2);
        sc.ink([[xx, lerp(aw[0][1], aw[1][1], u2)], [xx + 20, lerp(aw[2][1], aw[3][1], u2)]], { w: .95, wob: .3, over: 1, seed: sd + 50 + j }, { layer: 'mid', t0: 1.6 + j * .02, dur: .3, alpha: .3 });
      }
    }
    // 门口灯箱（暖光点）
    if (i % 2 === 1) {
      const lb = lightbox_(sc, M, o, x + 22, yb - 6, 20, 26, sd + 60, 1.55 + i * .04, 'mid');
      shopLights.push({ ...lb, a: .5, t0: 1.8 + i * .04 });
    }
    // 空海报板 / 小物（门边）
    if (i === 1 || i === 3) poster_(sc, x + w - 52, yb - h * .42, 40, 54, sd + 70, 1.6 + i * .04, -.03, i === 1 ? PAL.pinkPale : PAL.cream, 'mid');
    if (i === 2) potPlant_(sc, x + 16, yb - 2, 26, sd + 80, 1.65, 'mid');
    if (i === 4) bin_(sc, x + w - 24, yb - 2, 24, sd + 90, 1.7, 'mid');
  }
  // 对街人行道上的自行车 / 垃圾桶 / 盆栽
  bike_(sc, 760, 706, 40, seed + 700, 1.7, -1, 'mid');
  bike_(sc, 1420, 704, 34, seed + 701, 1.75, 1, 'mid');
  bin_(sc, 1160, 706, 24, seed + 702, 1.8, 'mid');
  potPlant_(sc, 560, 704, 30, seed + 703, 1.8, 'mid');
  potPlant_(sc, 1730, 704, 32, seed + 704, 1.85, 'mid');
  // 对街人行道 + 路缘（石缝）
  sc.fill([[-200, 640], [2120, 640], [2120, farKerb + 6], [-200, farKerb]], [252, 249, 241], { layer: 'mid', j: 2, seed: 1400, t0: .9, dur: .1 });
  sc.wash([[-200, 634], [2120, 634], [2120, farKerb], [-200, farKerb]], mix3(M.road, PAL.bluePale, .35), { a: .3, j: 12, layers: 2, edge: 0, seed: 1401 }, { layer: 'mid', t0: 1.0, dur: .8 });
  sc.ink([[-200, farKerb - 2], [-30, farKerb - 4], [420, farKerb - 5], [960, farKerb - 3], [1500, farKerb + 1], [2120, farKerb + 4]], { w: 2.3, wob: 1.2, over: 9, gap: .35, seed: 1402 }, { layer: 'mid', t0: 1.25, dur: .7, alpha: .7 });
  sc.ink([[-200, farKerb + 14], [2120, farKerb + 20]], { w: 1.2, wob: .8, over: 4, gap: .5, seed: 1403 }, { layer: 'mid', t0: 1.35, dur: .6, alpha: .42 });
  for (let k = 0; k < 12; k++) {
    const x = -100 + k * 180 + (R() - .5) * 26;
    sc.ink([[x, farKerb], [x + 2, farKerb + 16]], { w: 1.0, wob: .4, over: 1.5, seed: 1405 + k }, { layer: 'mid', t0: 1.4 + k * .02, dur: .3, alpha: .3 });
  }
  // 路面（整幅宽）
  const yF = farKerb + 4, yN = 1240;
  sc.wash([[-260, yF], [2180, yF], [2180, yN], [-260, yN]], mix3(M.road, PAL.bluePale, .3), { a: .38, j: 18, layers: 2, edge: 0, seed: 1410, freq: .006 }, { layer: 'mid', t0: 1.0, dur: 1.1 });
  const xl = y => 960 - (y - horizon) * 2.6, xr = y => 960 + (y - horizon) * 2.6;
  paving_(sc, M, o, { yFar: 716, yNear: 1240, rows: 6, cols: 8, xl, xr, yMax: 900, t0: 1.15, alpha: .6, seed: seed + 71 });
  // 斑马线：从画面前沿通向她的脚下（一排白条，透视里越近越宽）
  const crossCx = o.crossCx ?? 900, crossW = o.crossW ?? 130;
  const cwid = y => crossW + (y - farKerb) * .72;
  const stripes = 8;
  for (let k = 0; k < stripes; k++) {
    const u0 = k / stripes;
    const y0 = farKerb + 8 + (918 - farKerb - 8) * Math.pow(u0, 1.22);
    const y1 = y0 + (5 + (y0 - farKerb) * .075);
    const hw0 = cwid(y0), hw1 = cwid(Math.min(y1, 918));
    const quad = [[crossCx - hw0, y0], [crossCx + hw0, y0 + 1], [crossCx + hw1, Math.min(y1, 918)], [crossCx - hw1, Math.min(y1, 918) - 1]];
    const fade = clamp((925 - y0) / 300);
    sc.fill(quad, [253, 251, 245], { layer: 'mid', j: 2, seed: seed + 400 + k, t0: 1.5 + k * .04, dur: .1, alpha: .62 * fade });
    sc.wash(quad, mix3(PAL.cream, PAL.greyLight, .35), { a: .14, j: 3, layers: 1, edge: .25, seed: seed + 401 + k }, { layer: 'mid', t0: 1.55 + k * .04, dur: .4, alpha: fade });
    sc.ink([quad[0], quad[1]], { w: 1.15, wob: .5, over: 2.5, gap: .4, seed: seed + 402 + k }, { layer: 'mid', t0: 1.6 + k * .04, dur: .3, alpha: .35 * fade });
    sc.ink([quad[3], quad[2]], { w: 1.05, wob: .5, over: 2, gap: .4, seed: seed + 403 + k }, { layer: 'mid', t0: 1.64 + k * .04, dur: .3, alpha: .3 * fade });
  }
  // 路面细节：井盖 / 落叶 / 排水篦子
  manhole_(sc, 700, 820, 46, seed + 730, 1.25);
  manhole_(sc, 1380, 880, 60, seed + 731, 1.3);
  drain_(sc, 330, 902, 66, seed + 740, 1.3);
  drain_(sc, 1600, 898, 62, seed + 741, 1.35);
  leaves_(sc, 200, 1760, 730, 902, 20, seed + 750, M, 1.3);
  // 路灯（右）
  const lamps = [];
  [{ x: 1490, yBase: 690, h: 470, dir: -1, rate: 1.05, ph: .7 }, { x: 262, yBase: 700, h: 430, dir: 1, rate: 1.2, ph: 2.1 }].forEach((L, i) => {
    const head = lampStatic_(sc, M, o, L.x, L.yBase, L.h, L.dir, seed + 500 + i * 13, 1.2 + i * .1);
    lamps.push({ ...head, gx: L.x + L.dir * 46, poolR: 230, rate: L.rate, ph: L.ph, a: i === 0 ? 1.35 : 1.1 });
  });
  // 信号灯（左，无字）
  const tx = 300, tyb = 700;
  sc.ink([[tx, tyb], [tx + 1, tyb - 300]], { w: 2.2, wob: .7, over: 4, seed: seed + 520 }, { layer: 'mid', t0: 1.4, dur: .6, alpha: .8 });
  const tl = [[tx - 22, tyb - 300], [tx + 22, tyb - 300], [tx + 22, tyb - 356], [tx - 22, tyb - 356]];
  sc.fill(tl, [252, 249, 240], { layer: 'mid', j: 1.2, seed: seed + 521, t0: 1.5, dur: .1 });
  sc.wash(tl, mix3(M.wall, PAL.greyLight, .5), { a: .26, j: 2, layers: 1, edge: .2, seed: seed + 522 }, { layer: 'mid', t0: 1.6, dur: .4 });
  sc.inkPoly(tl, { w: 1.3, wob: .4, seed: seed + 523, gap: .2 }, { layer: 'mid', t0: 1.65, dur: .4, stagger: .03, alpha: .7 });
  for (let k = 0; k < 3; k++) {
    const cy = tyb - 346 + k * 20;
    sc.wash(ell(tx, cy, 7, 7, 12), k === 0 ? mix3(PAL.lamp, PAL.cream, .2) : mix3(PAL.grey, PAL.paper, .5), { a: k === 0 ? .5 : .2, j: 1, layers: 1, edge: .1, seed: seed + 530 + k }, { layer: 'mid', t0: 1.7, dur: .4 });
  }
  // 电线杆 + 更密的电线
  const cpole = utilityPole_(sc, M, o, 1772, 700, 566, seed + 760, 1.2, 'mid');
  wires_(sc, M, o, [
    [[-140, 330], [cpole.top[0], cpole.top[1]], 48],
    [[-120, 394], [cpole.arms[0][0], cpole.arms[0][1]], 56],
    [[-100, 452], [cpole.arms[1][0], cpole.arms[1][1]], 62],
  ], seed + 380, 1.3);
  wires_(sc, M, o, [[[cpole.arms[0][0], cpole.arms[0][1]], [2010, 300], 42]], seed + 390, 1.45);
  // 水洼
  const puddles = o.puddles ?? [
    { x: 1230, y: 830, rx: 250, ry: 34, lamp: true, ripN: 5 },
    { x: 620, y: 890, rx: 170, ry: 26, lamp: false, ripN: 4 },
    { x: 980, y: 760, rx: 110, ry: 15, lamp: true, ripN: 3 },
  ];
  puddles.forEach((p, i) => puddleWash_(sc, p, M, seed + 600 + i * 37, 1.1 + i * .1));
  if (M.rain) {
    rainLayer_(sc, o, 'back', { n: 150, gain: .45, alpha: .6, len: .85, t0: .3 });
    rainLayer_(sc, o, 'mid', { n: o.rainN ?? 220, gain: 1, alpha: 1, t0: .25 });
    rainLayer_(sc, o, 'front', { n: o.rainFrontN ?? 40, gain: .8, alpha: .8, len: 2, wMul: 1.5, clipB: 900, t0: .4 });
  }
  fogDyn_(sc, M, o);
  lampDyn_(sc, lamps, M, o);
  puddleDyn_(sc, puddles, M, o);
  // 店招暖光在湿地上的竖向倒影 + 地面水花 + 近景冷灰压暗
  shopReflectDyn_(sc, M, o, shopLights.map((L) => ({ x: L.x, y: 712, w: 30, len: 180, a: .8 })), 'mid');
  groundSplashDyn_(sc, o, 180, 1760, 730, 902, 34, 'mid');
  nearDarkDyn_(sc, o);
  safeVeil_(sc, o);
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? (t => ({ cx: 930, cy: 545, z: 1, rot: 0 }));
  return sc;
}

// ================================================================ 空街角（4.4）
export function cornerSet(o = {}) {
  const M = mood(o.weather === 'cold' ? 'cold' : (o.weather ?? 'cold'));
  const sc = new Scene({ w: 1920, h: 1080, base: { x: BR, y: BC }, layers: LAYERS });
  const seed = o.seed ?? 41;
  const R = rng(seed);
  const horizon = 540;
  skyBackdrop_(sc, M, o, horizon + 40);
  // 远处右侧的街巷（退远的楼排）
  cityRow_(sc, M, o, {
    x0: 470, x1: 2080, yBase: 620, topMin: 300, topMax: 452,
    wMin: 110, wMax: 220, t0: 1.0, seed: seed + 210, a: .3, pale: .55, windowRows: 3, warmA: .3,
  });
  // 更远一层天际线 + 青灰薄雾
  farSkyline_(sc, M, o, { x0: 380, x1: 2200, yBase: 610, topMin: 240, topMax: 400, wMin: 120, wMax: 260, t0: .55, seed: seed + 880 });
  farMist_(sc, M, o, 380, 640);
  // 右侧街巷的行道树剪影（沿街退远）
  streetTree_(sc, M, o, 610, 700, 300, seed + 870, 1.0, true);
  streetTree_(sc, M, o, 1120, 694, 270, seed + 871, 1.05, true);
  streetTree_(sc, M, o, 1700, 690, 300, seed + 872, 1.1, true);
  // 近处的转角楼（左）：正面 + 转角竖边
  const bx0 = -140, bx1 = 436, byB = 902, byT = 52;
  const face = [[bx0, byB], [bx0, byT], [bx1, byT - 6], [bx1, byB - 18]];
  sc.fill(face, [252, 249, 240], { layer: 'mid', j: 3, seed: 1500, t0: .1, dur: .12 });
  sc.wash(face, mix3(M.wall, PAL.paper, .2), { a: .3, j: 12, layers: 2, edge: .08, seed: 1501, freq: .006 }, { layer: 'mid', t0: .3, dur: 1 });
  // 转角竖边（双线 + 湿痕）
  sc.ink([[bx1, byT - 6], [bx1, byB - 18]], { w: 2.7, wob: .9, over: 7, gap: .3, seed: 1502 }, { layer: 'mid', t0: .5, dur: .7, alpha: .9 });
  sc.ink([[bx1 - 7, byT + 4], [bx1 - 7, byB - 26]], { w: 1.1, wob: .7, over: 3, gap: .5, seed: 1503 }, { layer: 'mid', t0: .65, dur: .7, alpha: .5 });
  sc.wash([[bx1 - 34, byT], [bx1, byT], [bx1, byB], [bx1 - 34, byB]], mix3(M.wallShade, PAL.greyLight, .45), { a: .16, j: 14, layers: 1, edge: 0, seed: 1504 }, { layer: 'mid', t0: .8, dur: .7 });
  // 楼上的窗（正面，四排，带窗台与层线）
  for (let r2 = 0; r2 < 4; r2++) for (let c = 0; c < 5; c++) {
    const wx = 4 + c * 88, wy = 92 + r2 * 108, ww = 46, wh = 58;
    if (wy + wh > byB - 320) continue;
    const q = [[wx, wy], [wx + ww, wy + 4], [wx + ww, wy + wh], [wx, wy + wh - 4]];
    const lit = R() < .16;
    sc.fill(q, [251, 249, 242], { layer: 'mid', j: 1.5, seed: seed + 310 + r2 * 7 + c, t0: 1.0 + r2 * .06, dur: .1 });
    sc.wash(q, lit ? mix3(PAL.lamp, PAL.cream, .3) : mix3(PAL.glass, PAL.greyLight, .4), { a: lit ? .46 : .28, j: 2, layers: 1, edge: .14, seed: seed + 311 + r2 * 7 + c }, { layer: 'mid', t0: 1.1 + r2 * .06, dur: .5 });
    sc.inkPoly(q, { w: 1.15, wob: .4, seed: seed + 312 + r2 * 7 + c, gap: .25 }, { layer: 'mid', t0: 1.15 + r2 * .06, dur: .35, stagger: .03, alpha: .62 });
    // 窗棂
    sc.ink([[wx + 2, wy + wh * .5], [wx + ww - 2, wy + wh * .5]], { w: .8, wob: .25, over: .5, seed: seed + 313 + r2 * 7 + c }, { layer: 'mid', t0: 1.2 + r2 * .06, dur: .25, alpha: .42 });
    // 窗台线 + 层线
    sc.ink([[wx - 5, wy + wh + 2], [wx + ww + 5, wy + wh - 1]], { w: 1.25, wob: .4, over: 2, seed: seed + 314 + r2 * 7 + c }, { layer: 'mid', t0: 1.25 + r2 * .06, dur: .3, alpha: .55 });
  }
  // 楼层横线（把窗排连起来）
  for (let r2 = 1; r2 < 4; r2++) {
    const yy = 92 + r2 * 108 - 12;
    sc.ink([[0, yy], [200, yy + 2], [430, yy - 2]], { w: 1.1, wob: .8, over: 3, gap: .55, seed: seed + 330 + r2 }, { layer: 'mid', t0: 1.05 + r2 * .05, dur: .5, alpha: .3 });
  }
  // 落水管 + 空调外机
  sc.ink([[452, byB - 24], [454, 120]], { w: 1.5, wob: .7, over: 4, gap: .45, seed: seed + 340 }, { layer: 'mid', t0: 1.2, dur: .7, alpha: .6 });
  const acq = [[478, 400], [520, 404], [520, 444], [478, 440]];
  sc.fill(acq, [251, 248, 239], { layer: 'mid', j: 1.2, seed: seed + 341, t0: 1.3, dur: .1 });
  sc.wash(acq, mix3(M.wallShade, PAL.greyLight, .5), { a: .26, j: 2, layers: 1, edge: .2, seed: seed + 342 }, { layer: 'mid', t0: 1.35, dur: .45 });
  sc.inkPoly(acq, { w: 1.2, wob: .35, seed: seed + 343, gap: .2 }, { layer: 'mid', t0: 1.4, dur: .35, stagger: .03, alpha: .65 });
  // 底层店面：门框 / 卷帘 / 招牌
  const shop = [[-40, byB - 12], [-40, 620], [400, 614], [400, byB - 26]];
  sc.fill(shop, [252, 249, 240], { layer: 'mid', j: 2, seed: 1600, t0: .8, dur: .1 });
  sc.wash(shop, mix3(M.wall, PAL.stoneCool, .45), { a: .24, j: 6, layers: 1, edge: .18, seed: 1601 }, { layer: 'mid', t0: .9, dur: .7 });
  sc.inkPoly(shop, { w: 1.8, wob: .65, seed: 1602, gap: .3 }, { layer: 'mid', t0: 1.0, dur: .6, stagger: .05, alpha: .8 });
  for (let k = 0; k < 6; k++) {
    const yy = byB - 24 - k * 40;
    sc.ink([[-26, yy], [388, yy - 4]], { w: 1.0, wob: .5, over: 2, gap: .45, seed: 1610 + k }, { layer: 'mid', t0: 1.2 + k * .04, dur: .35, alpha: .5 });
  }
  // 招牌（无字）
  const sg = [[-30, 596], [404, 588], [404, 540], [-30, 548]];
  sc.fill(sg, [251, 248, 239], { layer: 'mid', j: 1.6, seed: 1620, t0: 1.2, dur: .1 });
  sc.wash(sg, mix3(PAL.cream, PAL.lamp, .45), { a: .3, j: 3, layers: 1, edge: .3, seed: 1621 }, { layer: 'mid', t0: 1.3, dur: .5 });
  sc.inkPoly(sg, { w: 1.6, wob: .55, seed: 1622, gap: .25 }, { layer: 'mid', t0: 1.35, dur: .5, stagger: .05, alpha: .8 });
  // 转角楼门口的小物：灯箱 / 空海报板 / 盆栽 / 垃圾桶 / 自行车 / 屋顶水箱
  const cornerLights = [];
  const clb = lightbox_(sc, M, o, 322, 632, 26, 34, seed + 650, 1.4, 'mid');
  cornerLights.push({ ...clb, a: .7, t0: 1.6 });
  poster_(sc, 396, 560, 46, 62, seed + 660, 1.5, .02, PAL.pinkPale, 'mid');
  potPlant_(sc, 358, 872, 34, seed + 670, 1.55, 'mid');
  bin_(sc, 240, 870, 30, seed + 675, 1.6, 'mid');
  bike_(sc, 120, 876, 52, seed + 680, 1.65, 1, 'mid');
  // 屋顶：小水箱 + 天线（让转角楼的剪影有东西）
  sc.ink([[120, 60], [120, 16], [252, 12], [252, 52]], { w: 1.7, wob: .6, over: 4, gap: .35, seed: seed + 690 }, { layer: 'mid', t0: 1.3, dur: .6, alpha: .6 });
  sc.ink([[186, 12], [186, -40]], { w: 1.3, wob: .4, over: 2, seed: seed + 691 }, { layer: 'mid', t0: 1.4, dur: .5, alpha: .5 });
  sc.ink([[150, -20], [222, -22]], { w: 1.1, wob: .4, over: 2, seed: seed + 692 }, { layer: 'mid', t0: 1.45, dur: .4, alpha: .45 });
  sc.wash([[120, 18], [252, 14], [252, 54], [120, 58]], mix3(M.wallShade, PAL.greyLight, .45), { a: .24, j: 4, layers: 1, edge: .2, seed: seed + 693 }, { layer: 'mid', t0: 1.35, dur: .5 });
  // 右侧街巷：路面 + 路缘（斜向退远）
  const kerb0 = [470, 916], kerb1 = [1930, 604];
  sc.fill([[470, 900], [1960, 592], [2120, 700], [2120, 1240], [470, 1240]], [251, 248, 240], { layer: 'mid', j: 2, seed: 1700, t0: .7, dur: .1 });
  sc.wash([[470, 900], [1960, 592], [2120, 700], [2120, 1240], [470, 1240]], mix3(M.road, PAL.bluePale, .3), { a: .42, j: 18, layers: 2, edge: 0, seed: 1701, freq: .006 }, { layer: 'mid', t0: .8, dur: 1.1 });
  // 远处地面（街对面的路缘带，把楼上和街面接起来）
  sc.wash([[470, 600], [2080, 548], [2080, 660], [470, 720]], mix3(M.road, PAL.cream, .3), { a: .26, j: 16, layers: 1, edge: 0, seed: 1716 }, { layer: 'mid', t0: .95, dur: .9 });
  // 路缘带（灰的一条，沿街斜着退）
  sc.wash([[kerb0[0], kerb0[1]], [kerb1[0], kerb1[1]], [kerb1[0], kerb1[1] + 18], [kerb0[0], kerb0[1] + 18]], mix3(M.roadShade, PAL.greyLight, .45), { a: .3, j: 8, layers: 1, edge: 0, seed: 1705 }, { layer: 'mid', t0: 1.05, dur: .8 });
  sc.ink([kerb0, kerb1], { w: 2.5, wob: 1.1, over: 8, gap: .35, seed: 1702 }, { layer: 'mid', t0: 1.0, dur: .7, alpha: .8 });
  sc.ink([[kerb0[0], kerb0[1] + 16], [kerb1[0], kerb1[1] + 16]], { w: 1.4, wob: .8, over: 5, gap: .5, seed: 1703 }, { layer: 'mid', t0: 1.15, dur: .7, alpha: .5 });
  // 路缘石分块
  for (let i = 0; i < 12; i++) {
    const u = i / 12;
    const p = [lerp(kerb0[0], kerb1[0], u), lerp(kerb0[1], kerb1[1], u)];
    sc.ink([[p[0], p[1] + 2], [p[0] + 4, p[1] + 17]], { w: 1.0, wob: .4, over: 1.5, seed: 1706 + i }, { layer: 'mid', t0: 1.25 + i * .03, dur: .3, alpha: .36 });
  }
  // 人行道（路缘上方）：更亮的纸面色 + 石缝
  sc.wash([[470, 900], [1960, 592], [2100, 470], [520, 800]], mix3(M.wall, PAL.cream, .5), { a: .18, j: 16, layers: 1, edge: 0, seed: 1704 }, { layer: 'mid', t0: .95, dur: .9 });
  for (let i = 0; i < 10; i++) {
    const u = i / 10;
    const p = [lerp(kerb0[0], kerb1[0], u), lerp(kerb0[1], kerb1[1], u)];
    sc.ink([p, [p[0] - 16, p[1] - 84]], { w: .95, wob: .6, over: 2, gap: .45, seed: 1710 + i }, { layer: 'mid', t0: 1.2 + i * .03, dur: .35, alpha: .32 });
  }
  // 街面上的湿反光（斜向的淡彩）
  sc.wash([[500, 980], [1500, 700], [1700, 760], [700, 1080]], mix3(M.road, PAL.bluePale, .5), { a: .18, j: 20, layers: 2, edge: 0, seed: 1715 }, { layer: 'mid', t0: 1.3, dur: 1 });
  // 街面上暖光的长倒影（路灯的光顺着湿路面朝我们铺过来）
  sc.wash([[1080, 736], [1220, 748], [1300, 1010], [1010, 1020]], mix3(PAL.lamp, PAL.cream, .45), { a: .16, j: 16, layers: 2, edge: 0, seed: 1717 }, { layer: 'mid', t0: 1.4, dur: .9 });
  // 路面细节：井盖 / 落叶 / 排水篦子
  manhole_(sc, 830, 838, 46, seed + 730, 1.3);
  manhole_(sc, 1520, 760, 36, seed + 731, 1.35);
  drain_(sc, 560, 900, 60, seed + 740, 1.35);
  leaves_(sc, 480, 1780, 720, 902, 18, seed + 750, M, 1.35);
  // 电线杆 + 电线（街角的一根，把天空连起来）
  const kpole = utilityPole_(sc, M, o, 1900, 760, 620, seed + 760, 1.15, 'mid');
  wires_(sc, M, o, [
    [[250, 250], [kpole.top[0], kpole.top[1]], 46],
    [[300, 310], [kpole.arms[0][0], kpole.arms[0][1]], 52],
    [[340, 368], [kpole.arms[1][0], kpole.arms[1][1]], 60],
  ], seed + 380, 1.25);
  // 路灯（远处，男孩站的地方）
  const lamps = [];
  const spec = o.lamp ?? { x: 1150, yBase: 700, h: 430, dir: -1, rate: .95, ph: 1.2 };
  {
    const head = lampStatic_(sc, M, o, spec.x, spec.yBase, spec.h, spec.dir, seed + 520, 1.2);
    // 挪到街对面：灯杆画在人行道上，光池落在街面
    lamps.push({ ...head, gx: spec.x + spec.dir * 70, gy: 748, poolR: 260, rate: spec.rate, ph: spec.ph, a: spec.a ?? 1.3 });
  }
  // 水洼
  const puddles = o.puddles ?? [
    { x: 760, y: 872, rx: 300, ry: 44, lamp: true, ripN: 5 },
    { x: 1410, y: 760, rx: 170, ry: 24, lamp: false, ripN: 3 },
  ];
  puddles.forEach((p, i) => puddleWash_(sc, p, M, seed + 600 + i * 43, 1.1 + i * .1));
  if (M.rain) {
    rainLayer_(sc, o, 'back', { n: 140, gain: .4, alpha: .55, len: .8, t0: .3, slant: o.slant ?? .5 });
    rainLayer_(sc, o, 'mid', { n: o.rainN ?? 210, gain: 1, alpha: 1, t0: .25, slant: o.slant ?? .5 });
    rainLayer_(sc, o, 'front', { n: o.rainFrontN ?? 36, gain: .8, alpha: .75, len: 2, wMul: 1.5, clipB: 900, t0: .4, slant: o.slant ?? .5 });
  }
  fogDyn_(sc, M, o);
  lampDyn_(sc, lamps, M, o);
  puddleDyn_(sc, puddles, M, o);
  // 转角楼灯箱的暖光 + 湿地倒影 + 地面水花 + 近景冷灰压暗
  sc.dyn((ctx, t) => {
    for (let i = 0; i < cornerLights.length; i++) {
      const L = cornerLights[i];
      const a = clamp((t - L.t0) / .8) * L.a;
      if (a <= .01) continue;
      glow(ctx, t, L.x, L.y, L.r, mix3(PAL.lamp, PAL.cream, .3), a * .5 * M.warmA, { breathe: .1, rate: 1.2, phase: i * 2.1 });
    }
  }, 'mid');
  shopReflectDyn_(sc, M, o, cornerLights.map((L) => ({ x: L.x, y: 700, w: 32, len: 190, a: .9 })), 'mid');
  groundSplashDyn_(sc, o, 300, 1900, 720, 905, 30, 'mid');
  nearDarkDyn_(sc, o);
  safeVeil_(sc, o);
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? (t => ({ cx: 960, cy: 540, z: 1, rot: 0 }));
  return sc;
}

// ================================================================ 宽街（6.4 / 9.3）
export function wideSet(o = {}) {
  const M = mood(o.weather ?? 'rain');
  const sc = new Scene({ w: 1920, h: 1080, base: { x: BR, y: BC }, layers: LAYERS });
  const seed = o.seed ?? 51;
  const R = rng(seed);
  const horizon = 548, farY = 600;
  skyBackdrop_(sc, M, o, horizon + 30);
  // 街对面的楼群
  cityRow_(sc, M, o, {
    x0: -160, x1: 2100, yBase: 604, topMin: 318, topMax: 470,
    wMin: 150, wMax: 300, t0: 1.0, seed: seed + 210, a: .36, pale: .35, windowRows: 3,
  });
  // 更远一层天际线 + 青灰薄雾（两层天际线，远的更淡）
  farSkyline_(sc, M, o, { x0: -220, x1: 2200, yBase: 580, topMin: 230, topMax: 400, wMin: 150, wMax: 340, t0: .55, seed: seed + 880 });
  farMist_(sc, M, o, 340, 620);
  // 两侧的行道树剪影（远处一排 + 近处一棵）
  streetTree_(sc, M, o, 96, 700, 300, seed + 870, .95, true);
  streetTree_(sc, M, o, 470, 692, 280, seed + 871, 1.0, true);
  streetTree_(sc, M, o, 1480, 690, 290, seed + 872, 1.05, true);
  streetTree_(sc, M, o, 1836, 712, 340, seed + 873, 1.1, true);
  streetTree_(sc, M, o, 156, 860, 420, seed + 874, 1.15, false);
  streetTree_(sc, M, o, 1790, 856, 430, seed + 875, 1.2, false);
  // 对面人行道上的一排小物：自行车 / 长椅 / 垃圾桶 / 行道树
  {
    const sy = 606;
    bike_(sc, 520, sy, 34, seed + 700, 1.4, 1, 'mid');
    bike_(sc, 1540, sy, 30, seed + 701, 1.45, -1, 'mid');
    // 长椅（几笔 + 淡彩）
    const bx = 830, bw = 150;
    sc.fill([[bx, sy - 8], [bx + bw, sy - 10], [bx + bw, sy - 2], [bx, sy]], [251, 248, 240], { layer: 'mid', j: 1.4, seed: seed + 710, t0: 1.45, dur: .1 });
    sc.wash([[bx, sy - 8], [bx + bw, sy - 10], [bx + bw, sy - 2], [bx, sy]], mix3(M.roadShade, PAL.greyLight, .5), { a: .22, j: 3, layers: 1, edge: .2, seed: seed + 711 }, { layer: 'mid', t0: 1.5, dur: .45 });
    sc.inkPoly([[bx, sy - 8], [bx + bw, sy - 10], [bx + bw, sy - 2], [bx, sy]], { w: 1.2, wob: .4, seed: seed + 712, gap: .25 }, { layer: 'mid', t0: 1.55, dur: .4, stagger: .03, alpha: .6 });
    for (let k = 0; k < 2; k++) sc.ink([[bx + 16 + k * (bw - 32), sy - 2], [bx + 16 + k * (bw - 32), sy + 22]], { w: 1.4, wob: .3, over: 1, seed: seed + 713 + k }, { layer: 'mid', t0: 1.6, dur: .35, alpha: .6 });
    bin_(sc, 1000, sy + 2, 22, seed + 720, 1.55, 'mid');
    potPlant_(sc, 676, sy + 2, 26, seed + 730, 1.6, 'mid');
    potPlant_(sc, 1630, sy + 2, 26, seed + 731, 1.62, 'mid');
  }
  // 对面人行道 + 路缘（手绘的、断的线，不要一条死直线）
  sc.fill([[-240, 596], [2200, 596], [2200, farY + 16], [-240, farY + 10]], [252, 249, 241], { layer: 'mid', j: 2, seed: 1800, t0: .9, dur: .1 });
  sc.wash([[-240, 590], [2200, 590], [2200, farY + 14], [-240, farY + 6]], mix3(M.road, PAL.cream, .3), { a: .3, j: 14, layers: 2, edge: 0, seed: 1801 }, { layer: 'mid', t0: 1.0, dur: .8 });
  sc.ink([[-240, farY - 4], [-40, farY - 7], [420, farY - 8], [960, farY - 6], [1480, farY - 3], [2200, farY + 4]], { w: 1.9, wob: .9, over: 8, gap: .45, seed: 1802 }, { layer: 'mid', t0: 1.2, dur: .7, alpha: .55 });
  sc.ink([[-240, farY + 12], [2200, farY + 16]], { w: 1.1, wob: .7, over: 5, gap: .55, seed: 1803 }, { layer: 'mid', t0: 1.3, dur: .6, alpha: .3 });
  // 远处的车（小剪影 + 车灯暖点）
  for (const car of (o.farCars2 ?? [{ x: 636, y: 676, w: 92 }, { x: 1306, y: 682, w: 74 }])) {
    const cy = car.y, cw = car.w;
    const body = [[car.x, cy], [car.x + cw * .12, cy - 30], [car.x + cw * .78, cy - 32], [car.x + cw, cy]];
    sc.fill(body, [252, 249, 241], { layer: 'mid', j: 1.5, seed: 1810 + Math.round(car.x), t0: 1.3, dur: .1 });
    sc.wash(body, mix3(M.city2, PAL.grey, .4), { a: .34, j: 2, layers: 1, edge: .2, seed: 1811 + Math.round(car.x) }, { layer: 'mid', t0: 1.4, dur: .5 });
    sc.inkPoly(body, { w: 1.3, wob: .5, seed: 1812 + Math.round(car.x), gap: .25 }, { layer: 'mid', t0: 1.45, dur: .4, stagger: .03, alpha: .68 });
    sc.wash(ell(car.x + cw * .92, cy - 6, 7, 4, 10), mix3(PAL.lamp, PAL.cream, .3), { a: .5, j: 1, layers: 1, edge: 0, seed: 1813 + Math.round(car.x) }, { layer: 'mid', t0: 1.5, dur: .4 });
    sc.wash(ell(car.x + cw * .92, cy - 6, 30, 14, 12), mix3(PAL.lamp, PAL.cream, .4), { a: .2, j: 4, layers: 1, edge: 0, seed: 1814 + Math.round(car.x) }, { layer: 'mid', t0: 1.55, dur: .4 });
  }
  // 路面：远处窄、近处占满整幅
  const hw = y => 300 + (y - farY) * 2.5;
  const xl = y => 960 - hw(y), xr = y => 960 + hw(y);
  const road = [[xl(farY), farY], [xr(farY), farY], [xr(1240), 1240], [xl(1240), 1240]];
  sc.wash(road, mix3(M.road, PAL.bluePale, .3), { a: .4, j: 18, layers: 2, edge: 0, seed: 1810, freq: .006 }, { layer: 'mid', t0: 1.0, dur: 1.2 });
  // 湿路面：天空的倒影（竖向淡带）
  for (let i = 0; i < 5; i++) {
    const u = .12 + i * .2;
    sc.wash([[lerp(xl(760), xr(760), u) - 60, 700], [lerp(xl(760), xr(760), u) + 60, 700], [lerp(xl(1080), xr(1080), u) + 130, 1080], [lerp(xl(1080), xr(1080), u) - 130, 1080]], mix3(M.puddle, PAL.bluePale, .25), { a: .16, j: 18, layers: 2, edge: 0, seed: 1820 + i }, { layer: 'mid', t0: 1.2 + i * .05, dur: 1 });
  }
  paving_(sc, M, o, { yFar: 636, yNear: 1240, rows: 6, cols: 10, xl, xr, yMax: 900, t0: 1.15, seed: seed + 71 });
  // 路缘（两侧斜线，向灭点收）
  for (const side of [-1, 1]) {
    const p0 = [960 + side * hw(farY), farY], p1 = [960 + side * hw(1240), 1240];
    const q0 = [p0[0] - side * 16, p0[1] + 10], q1 = [p1[0] - side * 16, p1[1] + 10];
    sc.ink([p0, p1], { w: 2.1, wob: 1.0, over: 7, gap: .4, seed: 1830 + side }, { layer: 'mid', t0: 1.25, dur: .7, alpha: .6 });
    sc.wash([p0, p1, q1, q0], mix3(M.roadShade, PAL.greyLight, .5), { a: .22, j: 10, layers: 1, edge: 0, seed: 1832 + side }, { layer: 'mid', t0: 1.3, dur: .8 });
    // 人行道：靠边的淡彩 + 路缘石分块
    const o0 = [p0[0] + side * 240, p0[1] + 34], o1 = [p1[0] + side * 300, p1[1] + 66];
    sc.wash([p0, p1, o1, o0], mix3(M.wall, PAL.cream, .3), { a: .18, j: 16, layers: 1, edge: 0, seed: 1834 + side }, { layer: 'mid', t0: 1.35, dur: .8 });
    for (let k = 0; k < 7; k++) {
      const u = k / 7, r = [p0, p1];
      const px = lerp(p0[0], p1[0], u), py = lerp(p0[1], p1[1], u);
      sc.ink([[px, py + 3], [px - side * 15, py + 12]], { w: 1.0, wob: .4, over: 1.5, seed: 1836 + side * 11 + k }, { layer: 'mid', t0: 1.45 + k * .03, dur: .3, alpha: .3 });
    }
  }
  // 路面细节：井盖 / 落叶 / 排水篦子
  manhole_(sc, 760, 800, 44, seed + 730, 1.25);
  manhole_(sc, 1440, 862, 54, seed + 731, 1.3);
  drain_(sc, 420, 898, 64, seed + 740, 1.3);
  drain_(sc, 1560, 894, 60, seed + 741, 1.35);
  leaves_(sc, 200, 1760, 700, 902, 22, seed + 750, M, 1.3);
  // 电线杆 + 电线（宽街一根高杆，把天空连起来）
  const wpole = utilityPole_(sc, M, o, 1720, 790, 640, seed + 760, 1.15, 'mid');
  wires_(sc, M, o, [
    [[-140, 250], [wpole.top[0], wpole.top[1]], 44],
    [[-120, 312], [wpole.arms[0][0], wpole.arms[0][1]], 52],
    [[-100, 370], [wpole.arms[1][0], wpole.arms[1][1]], 58],
  ], seed + 380, 1.25);
  // 路灯（两侧各一）
  const lamps = [];
  const lampSpecs = o.lamps ?? [
    { x: 214, yBase: 806, h: 512, dir: 1, rate: 1.05, ph: 1.1, a: .9 },
    { x: 1712, yBase: 800, h: 500, dir: -1, rate: 1.18, ph: .3, a: 1 },
  ];
  lampSpecs.forEach((L, i) => {
    const head = lampStatic_(sc, M, o, L.x, L.yBase, L.h, L.dir, seed + 500 + i * 17, 1.2 + i * .1);
    lamps.push({ ...head, gx: L.x + L.dir * 60, gy: L.yBase + 60, poolR: 230, rate: L.rate, ph: L.ph, a: L.a });
  });
  // 水洼
  const puddles = o.puddles ?? [
    { x: 780, y: 876, rx: 330, ry: 46, lamp: true, ripN: 5 },
    { x: 1440, y: 802, rx: 200, ry: 26, lamp: true, ripN: 4 },
    { x: 1080, y: 742, rx: 120, ry: 14, lamp: false, ripN: 3 },
  ];
  puddles.forEach((p, i) => puddleWash_(sc, p, M, seed + 600 + i * 47, 1.1 + i * .1));
  // 远处横过的斑马线（暗示路口）
  if (o.crosswalk !== false) {
    for (let k = 0; k < 5; k++) {
      const yy = 640 + k * 13;
      const u0 = .18, u1 = .82;
      const x0 = lerp(xl(yy), xr(yy), u0), x1 = lerp(xl(yy), xr(yy), u1);
      sc.fill([[x0, yy], [x1, yy], [x1 + 6, yy + 7], [x0 + 6, yy + 7]], [253, 251, 245], { layer: 'mid', j: 1.5, seed: 1840 + k, t0: 1.35 + k * .04, dur: .1, alpha: .45 });
      sc.ink([[x0, yy], [x1, yy]], { w: 1.0, wob: .5, over: 3, gap: .45, seed: 1845 + k }, { layer: 'mid', t0: 1.45 + k * .04, dur: .3, alpha: .28 });
    }
  }
  // 雨 / 车灯 / 彩虹 / 行人
  if (M.rain) {
    rainLayer_(sc, o, 'back', { n: 140, gain: .45, alpha: .6, len: .85, t0: .3, slant: o.slant ?? .5 });
    rainLayer_(sc, o, 'mid', { n: o.rainN ?? 220, gain: 1, alpha: 1, t0: .25, slant: o.slant ?? .5 });
    rainLayer_(sc, o, 'front', { n: o.rainFrontN ?? 40, gain: .8, alpha: .8, len: 2.1, wMul: 1.6, clipB: 900, t0: .4, slant: o.slant ?? .5 });
  }
  fogDyn_(sc, M, o);
  lampDyn_(sc, lamps, M, o);
  puddleDyn_(sc, puddles, M, o);
  // 远处车灯画在中景层（画在路面之后，才不会被湿路面的纸色盖住）
  if (M.rain && o.cars !== false) carDyn_(sc, M, o, o.cars ?? [
    { x: 1170, y: 650, r: 42, gap: 30, a: 1, rate: .9, t0: .9, vx: 6 },
    { x: 1420, y: 662, r: 30, gap: 22, a: .8, rate: 1.3, t0: 1.2, vx: 4 },
  ], 'mid');
  if (M.rain && o.carFront) carDyn_(sc, M, o, o.carFront, 'mid');
  if (o.rainbow) rainbowDyn_(sc, o.rainbow, o.rainbowGain ?? 1);
  // 雨后：湿路面倒映天空 / 淡彩虹（竖的彩带）
  if (!M.rain && o.skyReflect !== false) {
    sc.dyn((ctx, t) => {
      const a = clamp((t - .8) / 2.5);
      if (a <= .01) return;
      ctx.save();
      const grd = ctx.createLinearGradient(0, 620, 0, 1010);
      grd.addColorStop(0, rgba(mix3(PAL.bluePale, PAL.greenPale, .35), .3 * a));
      grd.addColorStop(.6, rgba(mix3(PAL.pinkPale, PAL.violet, .3), .18 * a));
      grd.addColorStop(1, rgba(PAL.cream, .05 * a));
      ctx.fillStyle = grd;
      for (let i = 0; i < 7; i++) {
        const u = .06 + i * .14, x = lerp(xl(760), xr(760), u) + Math.sin(t * .5 + i) * 8;
        const w = 50 + (i % 3) * 34;
        ctx.fillRect(x - w, 630, w * 2, 420);
      }
      // 彩虹倒影：极淡的彩色横带
      const COLS = [[233, 180, 170], [240, 204, 160], [196, 220, 186], [176, 206, 226], [190, 182, 220]];
      for (let i = 0; i < COLS.length; i++) {
        ctx.strokeStyle = rgba(COLS[i], .13 * a);
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(-100, 790 + i * 9);
        for (let xx = 0; xx <= 1920; xx += 120) ctx.lineTo(xx, 790 + i * 9 + Math.sin(xx * .006 + t * .4 + i) * 6);
        ctx.stroke();
      }
      ctx.restore();
    }, 'mid');
  }
  if (o.pedestrians) {
    const peds = o.pedestrians;
    const R2 = rng(seed + 1900);
    sc.dyn((ctx, t) => {
      for (const p of peds) {
        const ph = (p.ph ?? 0) + t * (p.rate ?? 1.1) * 4.2;
        const x = p.x + (p.vx ?? 0) * t;
        const S = p.S ?? 130, y = p.y;
        const a = (p.a ?? .5) * clamp((t - (p.t0 ?? .4)) / 1.2);
        if (a <= .01) continue;
        // 简笔行人：只要钢笔轮廓 + 极淡的一点色
        drawGirl(ctx, pedPose(ph), { x, y, S, yaw: p.yaw ?? -.2, pitch: .2 },
          { seed: p.seed ?? 61, boil: Math.floor(t * 12), alpha: a, color: p.color ?? .18, ink: .55, knit: false });
        // 脚边的湿痕
        ctx.save(); ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = rgba(mix3(M.roadShade, PAL.grey, .4), .18 * a);
        ctx.beginPath(); ctx.ellipse(x, y + 2, S * .18, S * .04, 0, 0, TAU); ctx.fill();
        ctx.restore();
      }
    }, 'mid');
  }
  // 地面上的雨点小水花 + 近景冷灰压暗
  groundSplashDyn_(sc, o, 180, 1760, 690, 902, 30, 'mid');
  nearDarkDyn_(sc, o);
  safeVeil_(sc, o);
  sc.finish(o.bakeAt);
  sc.cam = o.cam ?? (t => ({ cx: 960, cy: 540, z: 1, rot: 0 }));
  return sc;
}

// ================================================================ 统一入口
export function streetSet(o = {}) {
  const kind = o.kind ?? 'lane';
  if (kind === 'puddle') return puddleSet(o);
  if (kind === 'crossing') return crossingSet(o);
  if (kind === 'corner') return cornerSet(o);
  if (kind === 'wide') return wideSet(o);
  return laneSet(o);
}

export { mood as streetMood, VP as STREET_VP, LANE_FAR_Y, laneHW, laneXL, laneXR, wallPt, wallQuad, ell };
