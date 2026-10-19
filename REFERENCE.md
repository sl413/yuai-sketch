# 人物绘制参考（公开资料）与实现对照

本次重修人物时使用公开的绘画教学资料来确定比例（只作为比例依据，画面仍全部由代码绘制，不使用任何图片素材）。

## 采用的比例（公开资料）

**全身（7.5–8 头身）**
- 成人全身约 7–8 个头高（`head` 从头顶到下巴）——[Clip Studio「MANABI JOURNEY #3」](https://tips.clip-studio.com/en-us/articles/1722)
- 肩宽约 1.5 个头宽；胯/大转子在全高的一半；膝盖在「胯到脚」的一半；手腕落在胯线，手从腕再往下伸。
- 女性肘部约在腰线（男性在肚脐）。

**面部（Loomis 三庭）**
- 眉毛—鼻底—下巴三段大致等长；眼睛在头部高度的中线，两眼间距 = 一只眼的宽度；鼻底在「眼—下巴」一半，嘴在「鼻底—下巴」一半——[Clip Studio「How to draw anime-styled portraits」](https://tips.clip-studio.com/en-us/articles/4035)；[Proko – Human Proportions](https://www.proko.com/course-lesson/human-proportions-idealistic-figures)
- 耳从眼线到鼻底之间；侧脸按同样的三庭定位。

**手**
- 手掌是一个上缘略窄的梯形，手指是第二个更窄的梯形；中指最长，无名指略短、食指再略短、小指最短；手指从掌部以倾斜角度长出；放松时手指像「铲」一样并拢微曲——[Clip Studio「How to draw hands」](https://tips.clip-studio.com/en-us/articles/3278)

**头发**
- 先分组（大块发束），再在组内细分细发；发丝从发根流向发梢，避免完全对称；后层头发整体压暗——同上 Clip Studio 肖像教程的 Hair 部分。

## 落实到代码

| 参考 | 代码位置 |
|---|---|
| 7.5–8 头身、肩宽 1.5 头宽、胯在 1/2、膝在 1/4 | `src/engine.js` 的 `BODY` 常量与 `skeleton()`（保持原比例，本次只修渲染） |
| 三庭：眼在头高中线、鼻底 1/2、嘴 1/2 | `src/head.js` 的 `frontFace()` / `profileFace()` 常量 |
| 两眼间一只眼、眼宽 = 脸宽 1/5 | `frontFace()` 中 `eyeGap / eyeW` |
| 侧脸轮廓：额—眉弓—鼻梁—鼻尖—人中—上下唇—下巴 | `profileFace()` 的剖面点列 |
| 手掌梯形 + 指节 + 拇指 | `src/character.js` 的 `drawHand()` |
| 发束分组、后发压暗、偏分刘海 | `src/head.js` 的 `drawBackHair()` / `drawFrontHair()` |

> 说明：以上链接为公开教学资料，仅用于比例依据；成片无任何外部图片/视频素材，仍是 Canvas 逐帧绘制。
