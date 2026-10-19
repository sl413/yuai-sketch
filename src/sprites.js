// 人物贴图：用户提供的四视图参考图（透明底 PNG，放在 assets/char/）
// 用参考图直接代替代码画的"简笔人"，只在站/走类镜头使用；坐/跪仍用简笔骨架画。
const SRC = {
  front: 'assets/char/front.png',
  front34: 'assets/char/front34.png',
  side: 'assets/char/side.png',
  back: 'assets/char/back.png',
  back_up: 'assets/char/back_up.png',
  umbrella: 'assets/char/umbrella.png',
  room_scene: 'assets/char/room_scene.png',
  hand: 'assets/char/hand.png',
};

export const SPR = {};
export const spritesReady = Promise.all(Object.entries(SRC).map(([k, url]) => new Promise(res => {
  const img = new Image();
  img.onload = () => { SPR[k] = img; res(); };
  img.onerror = () => { res(); };
  img.src = url;
})));

// 贴图里"举起来的那只手"的相对位置（0..1，左上原点）
export const HAND_ANCHOR = { back_up: { x: .63, y: .05 } };

// 根据朝向/是否举手选视图
export function pickView(pose, yaw) {
  const a = yaw + (pose.twist ?? 0);
  const facing = -Math.cos(a);
  const lat = Math.sin(a);
  const raised = (() => {
    const hr = pose.handR, hl = pose.handL;
    const high = h => Array.isArray(h) ? h[1] > .82 : (h && h.y !== undefined ? h.y > .82 : false);
    return high(hr) || high(hl);
  })();
  if (raised) return { view: 'back_up', flip: false };   // 举伞/举手只有这张图，优先用它
  if (facing > .82 && Math.abs(lat) < .4) return { view: 'front', flip: false };
  if (facing < -.5) return { view: 'back', flip: false };
  if (Math.abs(lat) > .8) return { view: 'side', flip: lat > 0 };
  return { view: 'front34', flip: lat > 0 };
}

export function drawSpriteGirl(ctx, pose, place, o = {}) {
  const v = pickView(pose, place.yaw ?? 0);
  const img = SPR[v.view] || SPR.front;
  if (!img) return false;
  const S = place.S;
  const h = S * 1.01;                       // 参考图从头顶到鞋底 ≈ 身高
  const w = img.width * h / img.height;
  const x = place.x, groundY = place.y;
  const walking = Math.abs(pose.legL ?? 0) + Math.abs(pose.legR ?? 0) > .05;
  const bob = walking ? Math.abs(Math.sin((pose.legL ?? 0) * 8)) * S * .008 : 0;
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
  // 脚尖下的淡影（让贴图落在地上）
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  const sh = ctx.createRadialGradient(x, groundY - S * .01, 0, x, groundY - S * .01, S * .22);
  sh.addColorStop(0, 'rgba(120,116,132,.26)'); sh.addColorStop(1, 'rgba(120,116,132,0)');
  ctx.fillStyle = sh;
  ctx.beginPath(); ctx.ellipse(x, groundY - S * .012, S * .2, S * .035, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 贴图本体（轻微降饱和，融入水彩纸面）
  ctx.translate(x, groundY - bob);
  if (v.flip) ctx.scale(-1, 1);
  ctx.filter = 'saturate(.9) contrast(.97) brightness(1.02)';
  ctx.drawImage(img, -w / 2, -h, w, h);
  ctx.filter = 'none';
  ctx.restore();
  // 举手贴图：把手在屏幕上的位置算出来，交给伞/雨滴等对齐
  let hand = null;
  const an = HAND_ANCHOR[v.view];
  if (an) {
    const lx = (an.x - .5) * w * (v.flip ? -1 : 1);
    hand = [x + lx, groundY - (1 - an.y) * h];
  }
  return { view: v.view, hand };
}

// 伞的贴图（可选，直接画在伞的位置）
export function drawSpriteUmbrella(ctx, c, r, rot = 0, o = {}) {
  const img = SPR.umbrella;
  if (!img) return false;
  const S = r * 2.25;
  ctx.save();
  ctx.translate(c[0], c[1] - S * .18);
  ctx.rotate(rot * .5);
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.filter = 'saturate(.85) contrast(.96)';
  ctx.drawImage(img, -S / 2, -S * .68, S, S);
  ctx.filter = 'none';
  ctx.restore();
  return true;
}
