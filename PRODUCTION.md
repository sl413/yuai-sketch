# PRODUCTION — 《雨爱》钢笔淡彩 MV 制作规范（给协作队友）

项目根：`E:\vibe知识大赏dsh\yuai-sketch`。片子：1920×1080 / 16:9 / 24 fps / 总长 260.5417 s
（= 音频 260.5333 s 取整帧）。画面 100% 由代码确定性生成，headless Chromium 逐帧渲染。

先读这三个文件再动手（顺序）：
1. `TREATMENT.md` —— 导演阐述与 40 个镜头的分镜表（用户给定，不要改故事）。
2. `src/sets/window.js` —— **参考实现**（公寓窗：窗框/玻璃/水珠/城市/旧物/片名）。照它的写法做。
3. `out/review/t_2.5.jpg` —— 当前质量基准静帧（还只是初稿，你可以做得更好）。

---

## 0. 硬规则（违反会毁片）

- **确定性**：任何一帧必须能单独渲染，禁止 `Date.now()`、未播种 `Math.random()`、跨帧状态。
  所有随机用 `rng(seed)` / `n2` / `fbm`，所有时间从 `t`（镜头内秒数）算。
- **画幅 1920×1080**，页面坐标也用 1920×1080 视口；`Scene.draw(ctx,t,cam)` 内部自己设相机变换。
- **底部字幕安全区**：屏幕 y≈918–1080 保持低细节（干净纸面/极淡淡彩/虚化远景），不放主体、
  高对比线条、运动。安全区在页面坐标里随镜头换算：一般在页 y>900 的区域只放极淡的东西。
- **不生成任何文字**（除 Lead 已做的片名和后期字幕）、无水印、无 logo、无乱码。
- **不碰别人的文件**：只写你拥有的文件（见第 7 节）。共享文件（`main.js` `src/core.js`
  `src/shots.js` `src/sets/window.js` `src/character.js` `src/fx.js` `index.html`）只读。
  需要改共享文件或加公共函数 → 发消息给 lead，不要自己改。
- **风格不变量**（Urban Sketch · Pen & Wash）：钢笔墨线 + 透明淡彩两层，永远两层都有；
  墨线会抖、出头、断笔、不封口；淡彩错位 1–3px、有积色边、有颗粒、留白；纸是奶白色冷压纸；
  线先长出来，颜色再晕开；不要纯水彩、纯线稿、不要硬边数码描线、不要 3D/景深/霓虹/暗黑。
- **色彩**：青灰/冷蓝（雨天）↔ 暖黄/淡粉（回忆/灯光）↔ 结尾透明淡绿/淡橙/淡紫（彩虹）。
  暗部用交叉排线 + 透明冷灰，**不用黑色压暗**。纸白是最亮的。
- **镜头语言**：每镜至少一个明确运动（慢推/慢拉/横移/跟拍/低角度/过肩/焦点转移/微距…），
  切镜之间用"雨线方向、窗框同构图、水洼倒影、灯光光斑、纸页翻动、淡彩光点"匹配，不用黑场。

---

## 1. 场景（Scene）API —— 你主要用这个

`src/core.js` 导出 `Scene`。一个镜头 = 一个 Scene 实例（页面坐标 1920×1080，base 默认 (960,540)）；
`Scene` 内部按深度分层（`back` 视差 .4 / `mid` .82 / `front` 1.0），每个元素有 `t0/dur`（墨线长出来
/ 颜色晕开的开始时间与时长），全部画完的时间以后会自动"烘焙"成位图缓存（性能）。

```js
import { Scene, PAL, PEN, camTrack, slowCam, ss, seg, clamp, lerp, TAU, rng, n2, fbm, hex, mix3, ellipse, spline } from '../core.js';
import { makeRain, makeGlassDrops, makeFog, glow, bokeh, airVeil, makeRipples, makeSplashes, breathFog } from '../fx.js';

const sc = new Scene({ w: 1920, h: 1080, layers: [{ id: 'back', par: .4 }, { id: 'mid', par: .82 }, { id: 'front', par: 1 }] });
// 墨线：pts 点列；po: {w 线宽, wob 抖动, over 出头, gap 断笔概率, seed, smooth}
sc.ink([[x,y],[x2,y2]], { w: 2, wob: .8, over: 5, seed: 1 }, { layer: 'mid', t0: .2, dur: .5, alpha: 1 });
// 多边形轮廓 → 自动断成几笔
sc.inkPoly(poly, { w: 1.8, wob: .6, seed: 7, gap: .4 }, { layer: 'mid', t0: .4, dur: .6, stagger: .08 });
// 手绘矩形（四边出头、角不闭合）
sc.box(x0, y0, x1, y1, { w: 2, seed: 3 }, { layer: 'mid', t0: .3, dur: .5 });
// 淡彩：poly 多边形；wo: {a 浓度, j 边缘粗糙度, layers 层数, edge 积色边, dx/dy 错位, seed}
sc.wash(poly, PAL.grey, { a: .4, j: 8, layers: 2, edge: .3, seed: 5 }, { layer: 'back', t0: .5, dur: .8 });
// 平涂纸色（遮挡/留白/墙面），立刻生效
sc.fill(poly, PAL.paper, { layer: 'mid' });
// 交叉排线（暗部）：clip 在 poly 内
sc.hatch(poly, { ang: Math.PI/3, gap: 8, w: 1.1, seed: 2 }, { layer: 'mid', t0: .6, dur: .8, alpha: .45 });
// 动态元素（每帧都画；在 bake 之后依然会画）：
sc.dyn((ctx, t) => { /* 用页面坐标画 */ }, 'front');
// 收尾：bakeAt = 所有静态元素画完的时间；之后缓存成图（性能关键）
sc.finish();                       // = maxEnd + .18
sc.cam = t => ({ cx: 960, cy: 540, z: 1, rot: 0 });   // 相机（整个镜头的时间函数）
return sc;
```

相机工具：
```js
sc.cam = slowCam({ x: 960, y: 540, z0: 1.0, z1: 1.06, dx: 14, dy: -4, dur: 6 }); // 固定+极慢推+平移
sc.cam = camTrack([[0, [x,y,z]], [3, [x2,y2,z2], rot], ...]);                     // 关键帧平滑曲线
```
视差：元素放不同 layer 即可（`back` 远景，`mid` 中景，`front` 近景）；相机移动时自动有分层视差。
窗/门框等需要"挖洞"时不要用 destination-out，而是用平涂纸色把墙分成几块画（参考 `window.js`）。
镜头之间的对象衔接（例如同一个房间）由各自的 Scene 负责，不用共享状态。

其它工具（`src/core.js`）：`PEN(o)` 默认笔触参数、`runsOf/polyRuns/boxRuns`（速写断线）、
`hatchLines`（排线）、`setCam`、`camView`、`handwriteCJK`（手写字）、`drawSubtitle`。
`src/engine.js` 还导出底层：`penStroke/drawPen/wash/rough/dab/ellipse/spline/figure/drawPrims` 等。

---

## 2. 人物 API（`src/character.js`）

```js
import { herStand, herTouchGlass, herSitFloor, herKneel, herWalk, herReachOut, herLookUp, herSmileDown,
         drawGirl, drawBoy, umbrella, handClose, LOOK_HER, mixPose } from '../character.js';
// place: { x 脚底世界x, y 脚底世界y(越大越近), S 身高像素, yaw 朝向(0=背对, -PI/2=朝画面左), pitch 俯视 .28 }
const prims = drawGirl(ctx, herTouchGlass({reach:.9}), { x: 700, y: 700, S: 420, yaw: -1.2 }, {
  seed: 5, boil: Math.floor(t*12),   // 人物线 12fps 抖动（boil）
  face: 'profile', eyesOpen: false,  // 近景才加脸：'profile'|'closed'|'smile'
  color: 1, ink: 1, alpha: 1,
});
// 男生：只以背影/倒影出现，永远不正面、不清晰
drawBoy(ctx, herWalk(ph, {}), { x: 900, y: 700, S: 300, yaw: 0 }, { alpha: .7, backlight: 1 });
// 近景手
handClose(ctx, x, y, 120, -.3, { seed: 2, curled: .6 });
// 雨伞：c 伞心, r 半径, rot 倾斜
umbrella(ctx, [x, y-380], 260, -.18, { seed: 3 });
```
注意：`drawGirl/drawBoy` 会设置并恢复 ctx 状态；在 `sc.dyn` 里调用最方便。人物必须"被画出来"时，
用 `o.ink`（0→1）+ 一个渐显的淡彩 bloom 剪裁；不要一帧突然出现（除非是刻意的叠化）。

---

## 3. FX API（`src/fx.js`）

```js
const rain = makeRain({ seed: 1, n: 260, w: 1200, h: 800, slant: .3 });  // 预生成
rain(ctx, t, { w, h, alpha: 1, col: PAL.greyDeep });                    // 在 sc.dyn 里画
const drops = makeGlassDrops({ seed: 2, n: 40, x0, x1, y0, y1 });        // 玻璃水珠
drops(ctx, t, { gain: 1, alpha: 1 });
const fog = makeFog({ seed: 3, n: 12 });
fog(ctx, t, x0, y0, w, h, { gain: .8, col: [255,253,246] });
glow(ctx, t, x, y, r, PAL.lamp, .5, { breathe: .15, rate: 1.2 });        // 灯光光晕
bokeh(ctx, t, [{x,y,r,a,col,rate,ph}], { gain: 1 });                    // 雨幕里的暖光斑
makeRipples({seed,x0,x1,y0,y1,n})(ctx, t, {gain:1});                     // 水洼涟漪
makeSplashes({seed,x0,x1,y0,y1,n})(ctx, t, x0,y0,w,h, {gain:1});         // 雨点水花
breathFog(ctx, t, x, y, rx, ry, { cycle: 4.4, phase: 0 });                // 呼吸白雾
airVeil(ctx, t, { a: .1, y0: 0, y1: 1080, col: PAL.bluePale });          // 空气/雨雾面
```
所有函数都确定性；`make*` 在场景构建时调用一次，返回的函数在 `sc.dyn` 里每帧调用。

---

## 4. 调色板（`PAL`，`src/core.js`）

`paper #f5eede`、`ink #2b2520`；雨天 `grey #8fa3ae / greyDeep #6c8290 / blue #7f9fc4 / bluePale #c3d4e4`；
暖 `lamp #e8c78a / warm #e9c9a8 / cream #f7efdf`；记忆 `pink #e8c3c0 / pinkPale #f2dcda`；
雨后/彩虹 `green #a8c3a0 / greenPale #cfe0c6 / orange #e8b98a / violet #c9b8d6`；
城市 `stone #cbbba1 / stoneCool #b6b3ad / brick #c19a7e / glass #93aec4 / road #9fa9ad / puddle #b9cbd6`。
规则：**暗部 = 局部色混冷紫/冷灰 + 排线**，不用黑；**纸白留给高光**；同一镜头颜色克制，2–4 个主色。

---

## 5. 怎么渲染和检查（每次改完都做）

```powershell
. "C:\Users\sl\.dsh\skills\lemo-opuscar\scripts\env.ps1"   # 每次新 shell 都要
cd $env:LIB                                                 # = C:\Users\sl\lemo-opuscar
# 渲你负责的某个镜头在若干时刻的静帧（?shot=镜头号，本地时间从 0 开始）
node core/render/still.mjs "E:/vibe知识大赏dsh/yuai-sketch" 0.8 2.0 3.6 4.8 --q "shot=4.1" --out "E:/vibe知识大赏dsh/yuai-sketch/out/review-street/4.1"
```
- 输出是 JPEG；**用 read_image 工具看**（不要只凭代码想象），对照 `out/review/t_2.5.jpg` 的质量基准。
- 页面报错 = 立刻退出；按报错行号修。控制台打印的 `Xms` 是每帧渲染耗时，目标 <300ms。
- 静态画面画完以后应触发烘焙（`sc.finish()` 之后）——如果你发现某镜头始终很慢，检查 `bakeAt`。
- 每个镜头至少看 3 个时刻：开头（墨线生长中）、中段（完成态）、结尾（动态最高潮/最后定格）。
- 不要跑 `core/render/video.mjs`（整片渲染由 lead 统一做）；不要起服务器；不要动系统设置。

---

## 6. 镜头任务表（你只做分配给你的镜头；分镜原文在 `TREATMENT.md` 第 4 节）

每个镜头都要求：一个 Scene（`sc.cam` 自带运动）、气氛对（见分镜）、底部字幕安全区干净、
墨线生长 + 淡彩晕开、至少一个动态层（雨/水珠/雾/光斑/人物呼吸/纸页/倒影波动）。

### ✅ 分配（登记在你自己的 `src/scenes/*.js` 的 `SCENES` 里）

**set-room（`src/scenes/room.js` + `src/sets/room.js` 等）**
| 镜头 | 内容 |
|---|---|
| 2.3 | 室内中景，极慢下摇+轻横移：女生坐在沙发边/地上收拾旧物，行李箱打开，手写信放回箱底；冷灰+暖黄灯光；旧物边缘微卷 |
| 5.1 | 室内窗边中景，极慢推近+微右移：窗外雨滴累积，屋内湿气，旧照片、杯口热气；暖黄与青灰交叠 |
| 5.2 | 旧照片特写，贴手微距+极慢横移：焦点从照片上模糊笑颜转到女生手指（用 `handClose` + `photo_` 思路） |
| 5.3 | 她把照片放回抽屉，过肩+轻下摇：抽屉里还有手写信、旧票根；木纹墨线；信纸轻颤 |
| 6.1 | 室内中景，缓慢横移+轻左摇：她把行李箱合上；冷灰为主，暖黄只落在手边；信纸在风里轻颤 |
| 7.3 | 室内广角，极慢横移+轻上摇：旧外套、杯子、枕头、手写信都在湿气里，雾气在物件边缘凝结 |
| 8.4 | 窗台特写，贴台面极慢横移+轻推近：水珠、手写信边缘、旧照片一角沾着湿气，**彩虹光落在纸面上**（淡彩虹色带），水珠闪烁 |
| 8.6 | 手写信被拿起的手部微距，极慢推近：她没有打开，只把信放在窗台光里（手 + 信 + 暖光） |

**set-street（`src/scenes/street.js` + `src/sets/street.js` 等）**
| 镜头 | 内容 |
|---|---|
| 4.1 | 城市街巷中景，低角度跟拍+轻左摇：湿石板路、店铺门框、路灯，暖黄在雨幕晕开；女生撑伞独行；水洼倒影波动 |
| 4.2 | 水洼倒影特写，贴地极慢横移+轻下压：倒映路灯与她的剪影，雨滴打碎倒影又聚合；焦点从倒影转到鞋尖 |
| 4.3 | 她停在路口，固定中景+极慢推近：呼出白雾，雨滴在伞面溅开，雾气沿伞沿流动 |
| 4.4 | 空荡街角，极慢拉远+轻上摇：男生背影在远处路灯下模糊成剪影（**不清晰**），她没有追；冷蓝加重 |
| 6.3 | 街巷雨夜，低角度跟拍+轻右摇：她撑伞走过路灯，路灯暖光在湿地面晕开，水洼倒影波动 |
| 6.4 | 街角远景，固定广角+极慢拉远：雨丝被气流吹斜，远处车灯在雨幕晕成暖色光斑，她站在街角边缘 |
| 9.3 | 窗外街巷，固定广角+极慢拉远：雨停了，湿路面倒映天空和淡彩虹，行人模糊成钢笔简笔，路灯还亮但天光已开 |

**set-sky（`src/scenes/sky.js` + `src/sets/sky.js`；室内镜头可直接复用 `windowSet({view:'sky', ...})`）**
| 镜头 | 内容 |
|---|---|
| 5.4 | 窗外云层，仰拍极慢上摇+微右摇：雨还在下，云层边缘出现极淡暖光，彩虹尚未出现只留一道极淡透明色带 |
| 8.1 | 室内窗边中景（`windowSet({view:'sky', weather:'after'})`），极慢推近+微右移：雨渐小，雾气在玻璃上凝结 |
| 8.2 | 窗外云层，仰拍极慢上摇+微右摇：云层裂开一道缝，一束暖光打下来，淡彩青灰→淡粉→淡橙，彩虹透明色带极淡出现，光晕缓慢铺开 |
| 8.3 | 她推开窗，过肩+轻下摇：湿气从窗口散出，光落在窗台，水珠闪亮，雾向外流动 |
| 8.5 | 她站在窗前看彩虹，固定中景+焦点转移：焦点从侧脸转到远处彩虹，光晕柔和，发丝在光里微动 |
| 9.1 | 城市公寓窗内广角，极慢拉远+轻上摇：雨停了，玻璃剩水痕，暖黄与淡绿透进来，水痕缓缓蒸发 |
| 9.2 | 窗台特写，极慢推近+轻横移：水珠从窗沿滴落，手写信和旧照片在光里，淡彩彩虹色带轻轻落在纸面 |
| 9.4 | 她侧脸过肩，极慢推近：看窗外安静微笑，淡彩光落在脸上，发丝微动 |
| 9.5 | 空镜：窗台、手写信、水珠、彩虹光，极慢拉远+轻上摇；画面渐留白只剩纸纹与极淡水痕，雾气消散（片尾黑场由 main 加） |

**Lead 自己做**：1.1 1.2 2.1 2.2 2.4 2.5 3.1–3.6 5.5 5.6 6.2 7.1 7.2 7.4 7.5 7.6。
**不要**做别人的镜头；需要用到别人的 set（例如 windowSet）就直接 import 用。

---

## 7. 文件所有权 & 登记方式

- 你拥有：`src/scenes/room.js` + `src/sets/room.js` + 你需要的其它 `src/sets/*.js`
  （或 `src/scenes/street.js` + `src/sets/street.js`；或 `src/scenes/sky.js` + `src/sets/sky*.js`）。
- 共享文件只读：`main.js`、`src/core.js`、`src/engine.js`、`src/fx.js`、`src/character.js`、
  `src/shots.js`、`src/sets/window.js`、`index.html`、`data/`、`fonts/`。
- 登记：在你的 `src/scenes/<group>.js` 里
  ```js
  export const SCENES = {
    '2.3': () => { const sc = roomSet({...}); return sc; },
    ...
  };
  ```
  `src/shots.js` 已经按 id 合并了 `SCENES`，没有登记的镜头先返回空白纸面。**不要改 `src/shots.js`**。
- 你的 set 文件可以导出工厂函数给 lead/别人复用；**先写 set，再写镜头**，set 要有参数化
  （例如 `roomSet({ suitcaseOpen: true, lamp: true, camera... })`）。
- 完成一个镜头就渲静帧自检；全部完成后：标记共享任务完成 + 用 `send_message` 给 `lead` 报告：
  每个镜头的完成状态、静帧路径、你引入的 set 文件、已知问题、有没有动共享文件（应该没有）。

## 8. 质量自查清单（提交前逐条过）

□ 墨线和淡彩两层都在，线有抖动/出头/断笔；淡彩有错位、积色边、颗粒、留白
□ 底部 y≈918–1080 低细节、无主体、字幕放上去能读
□ 镜头有运动（且是分镜要求的那个运动方向/类型）
□ 人物比例合理（身高 ≈ 画面高度 1/3 起，近景可更大），脸留白，男生不清晰
□ 至少一个动态层在动（雨/雾/水珠/倒影/光斑/呼吸/头发）
□ 暗部不是黑色，是冷灰/冷紫；纸白是最亮的
□ 颜色克制：青灰冷蓝为主，暖黄/淡粉点缀；结尾镜头才有彩虹色
□ 首帧不是空白（开始就有东西可看）；最后一帧留有余味
□ 没有文字/乱码/水印；没有真实景深模糊/3D 环绕/高饱和霓虹
