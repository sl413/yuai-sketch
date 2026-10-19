# 《雨爱》MV · 字幕手写字体（离线自托管 / OFL）

为《雨爱》MV（1920×1080）准备的**离线自托管 OFL 手写字体**：页面通过 `@font-face` 加载，
由 headless Chromium 逐帧渲染烧录歌词字幕，**渲染期完全不联网**。

## 结论（直接抄）

| 用途 | 推荐字体 | `font-family` 名 | 说明 |
| --- | --- | --- | --- |
| **歌词正文（推荐）** | 马善政 Ma Shan Zheng | `"Ma Shan Zheng"` | 硬笔楷书手写，46px / 40px 下每个字轮廓清楚，手写感与钢笔墨线淡彩最协调 |
| 备用 / 片名装饰 | 龙藏 Long Cang | `"Long Cang"` | 行楷，手写味更足，但笔画偏细、40px 下略吃亏 |
| 英文 / 数字混排（推荐） | Caveat（wght 600） | `"Caveat"` | 马克笔手写，粗细与马善政协调；字号 = 中文字号 − 2px |
| 英文备选 | Reenie Beanie | `"Reenie Beanie"` | 更细更随意，`&` 等符号辨识度略低，仅备选 |
| ~~不建议正文~~ | 志莽行书 Zhi Mang Xing | `"Zhi Mang Xing"` | 行书连笔过重，长句第一眼辨认慢；仅片名/章节大字可用 |

**接入**（页面已在 `index.html` 里 `<link rel="stylesheet" href="fonts/fonts.css">`）：

```css
/* 写法 A（推荐）：拉丁字体放链首 */
.subtitle { font-family: "Caveat", "Ma Shan Zheng", "Microsoft YaHei", sans-serif; }

/* 写法 B（与 src/core.js 现有代码一致）：中文字体在前 —— 同样正确 */
.subtitle { font-family: "Ma Shan Zheng", "Caveat", "KaiTi", serif; }

/* 也可直接用 fonts.css 提供的变量 */
.subtitle { font-family: var(--sub-font); }        /* = Caveat, Ma Shan Zheng, Microsoft YaHei */
```

> **为什么两种顺序都对**：中文字体的 `@font-face` 用 `unicode-range` 只声明了 CJK 区（不含 ASCII），
> 所以 `"Ma Shan Zheng"` 永远不会被用来渲染英文/数字，`"Rainie Love"` 必然落到后面的 `"Caveat"`。
> CSS 逐字符选择字体，无需给英文套 `<span>`；中文标点（，。！？）留在中文字体。

## 文件清单

| 文件 | 说明 | 大小 |
| --- | --- | --- |
| `fonts.css` | 5 个 `@font-face`（相对路径、`font-display: block`、CJK `unicode-range`）+ CSS 变量 | 3.7 KB |
| `charset.txt` | 子集字符集，413 字符 | 1.1 KB |
| `MaShanZheng-subset.woff2` / `.ttf` | 中文主字体（woff2 供浏览器 / ttf 供 Pillow） | 130.0 / 228.0 KB |
| `LongCang-subset.woff2` / `.ttf` | 中文备用 | 116.8 / 197.2 KB |
| `ZhiMangXing-subset.woff2` / `.ttf` | 中文装饰 | 97.0 / 165.0 KB |
| `Caveat-subset.woff2` / `.ttf` | 拉丁主字体（wght 600 静态实例） | 44.0 / 99.4 KB |
| `ReenieBeanie-subset.woff2` / `.ttf` | 拉丁备选 | 21.2 / 51.7 KB |
| `OFL/OFL-*.txt` | 五个字体的 SIL OFL 1.1 全文（含版权行） | — |
| `preview-subtitle.png` | 可读性对比图（1920×1080） | 304 KB |
| `preview-mixed.png` | 英文混排 fallback 验证图（1920×1080） | 177 KB |
| `preview.html` | 浏览器加载自检页（file:// / http:// 均可打开） | — |
| `build_fonts.py` | 下载完整 OFL 字体 → 本地子集化 → 输出 ttf/woff2 + OFL 的构建脚本 | — |
| `check_fonts.py` | 逐字体逐字覆盖 + `fonts.css` unicode-range 自检 | — |
| `verify_browser.py` | headless Chrome 加载自检（file:// 与 http:// 双协议、双链顺序） | — |
| `make_preview.py` | 生成两张预览图 | — |
| `font-coverage.json` | 自检结果机器可读版 | — |

woff2 合计 **408.9 KB**，ttf 合计 **741.4 KB**（ttf 仅本地工具/Pillow 使用，页面只下载 woff2）。

## 推荐依据（可读性 + 手写感 + 与淡彩钢笔画协调）

对比图见 `preview-subtitle.png`（三行代表性歌词 × 3 个中文字体 × 46px / 40px，纸底 `#f5eede`、墨色 `#3a342c`）。

**马善政 Ma Shan Zheng —— 推荐**
- 硬笔楷书结构，笔画独立、不连写；「呼 / 吸 / 像 / 滴 / 渗 / 入」这类高密度字在一行 13 字的长句里仍能逐字读清，46px 与 40px 两个字号都成立。
- 手写感来自笔锋的提按与轻微欹侧，不是印刷楷体；和"钢笔墨线 + 淡彩"的画风同一视觉语言。
- 歌词字幕观众只有 1–3 秒阅读时间，**先可读、再风格**，它是三者中唯一两个字号都稳的。

**龙藏 Long Cang —— 备用，不做首选**
- 行楷，字形更潇洒，适合片名/大字号；但笔画整体偏细，与淡彩底色对比度偏低，40px 时「呼」「吸」「渗」等字容易糊。
- 长句里连笔虽比志莽少，仍有个别字的笔画合并，属于"第二眼才读清"，不满足字幕瞬时阅读。

**志莽行书 Zhi Mang Xing —— 不建议正文**
- 行书连笔重：「呼吸」两字笔画相连、「像」简化、「滴/渗」三点水与右部件粘连，一行 13 字需要连续辨认。
- 46px 下已明显慢读，40px 更严重；只建议用于片名 / 章节大字等"不需要逐字读"的场景。

**英文为什么用 Caveat 而不是中文字体自带拉丁**
- 中文字体自带的拉丁字形是"顺带做的"，小写偏小、字距紧，与中文并排时视觉重量不一致（见 `preview-mixed.png` 方案 A 对照）。
- Caveat 600 的字重与马善政的墨色深度接近，字高/基线对齐后混排自然；字号取中文 − 2px 时视觉等大。
- Reenie Beanie 更细、更随意，`&` 的写法接近 ξ，用于曲名 `Rainie & Love....?` 时辨识度不如 Caveat，故仅作备选。

## 字符集（`charset.txt`，413 字符）

| 类别 | 数量 | 来源 |
| --- | --- | --- |
| 汉字 | 283 | `data/lyrics-source.txt` 全部字符 160 字 + 片名「雨爱」/ 标注用字 / 分镜段落名等 123 字 |
| 中文标点 | 14 | 歌词 + 常用「，。！？、；：""''《》（）」 |
| 全角符号 | 14 | `～／＼｜＋－＝〈〉「」『』` 等 |
| ASCII 可打印 | 94 | 英文字母、数字（[01]–[36]、46px）、`Rainie Love`、标点 |
| 其他 | 8 | `""''—…×÷` |

- 每个**中文字体**子集都包含全部 413 字符（逐字校验 PASS，含歌词核心 160/160）。
- 每个**拉丁字体**子集包含 94 个 ASCII 可打印字符（不要求中文字形）。
- 中文字体的 `unicode-range` 覆盖 **319 个非 ASCII 字符**、排除 **94 个 ASCII**（空格 U+0020 除外，
  故意留给中文字体以保持中文排版的空格宽度）。
- 若以后歌词/片头增加新字符，重跑 `python build_fonts.py` 即可重新子集化。

## 自检结果

### 1）字形覆盖 —— `check_fonts.py`：全部 PASS

逐字体逐字做 cmap 检查 + Pillow 实际渲染非空像素检查（排除"有 cmap 但字形空白"），
并解析 `fonts.css` 校验 unicode-range 覆盖是否正确：

```
charset.txt: 413 字符 (歌词源文本 160 字, ASCII 可打印 94 个)
[PASS] MaShanZheng-subset.ttf  CJK全字符  413/413  glyphs=496   228.0 KB  歌词核心 160/160
[PASS] ZhiMangXing-subset.ttf  CJK全字符  413/413  glyphs=416   165.0 KB  歌词核心 160/160
[PASS] LongCang-subset.ttf     CJK全字符  413/413  glyphs=415   197.2 KB  歌词核心 160/160
[PASS] Caveat-subset.ttf       Latin-ASCII 94/94  glyphs=250    99.4 KB  中文 319 字不适用(拉丁体仅用于英文混排)
[PASS] ReenieBeanie-subset.ttf Latin-ASCII 94/94  glyphs=104    51.7 KB
[PASS] fonts.css unicode-range (CJK 字体只声明 CJK 区, ASCII 交给拉丁字体)
       Ma Shan Zheng: 覆盖 319 个非 ASCII, 排除 94 个 ASCII ✓
       Zhi Mang Xing: 覆盖 319 个非 ASCII, 排除 94 个 ASCII ✓
       Long Cang:     覆盖 319 个非 ASCII, 排除 94 个 ASCII ✓
总结: 全部 PASS
```

### 2）浏览器离线加载 —— `verify_browser.py`：file:// 与 http:// 均 ALL_PASS

headless Chrome 实测（`fonts/preview.html` 内 JS 自检 + canvas 像素签名），三组关键证据：

```
[PASS] face Ma Shan Zheng  files=1 status=loaded check=true
[PASS] face Zhi Mang Xing  files=1 status=loaded check=true
[PASS] face Long Cang      files=1 status=loaded check=true
[PASS] face Caveat         files=1 status=loaded check=true
[PASS] face Reenie Beanie  files=1 status=loaded check=true
width-CN  ma=598 zhi=538.2 long=598 sans=598
width-EN  caveat=176.73 reenie=171.07 ma=244.32          ← 马善政单独用时英文已落到系统字体(unicode-range 生效)
width-MIX en=176.73 cn=598                                ← "Caveat","Ma Shan Zheng"：英文=Caveat, 中文=马善政
width-MIX2(CJK-first) en=175.35 cn=598                    ← "Ma Shan Zheng","Caveat"：空格由中文字体承担, 窄 1.38px
width-MIX2b no-space en=165.37 vs caveat=165.37           ← 去掉空格后与 Caveat 完全一致 = 字母确实用 Caveat
pixelsig  ma=4174769403:9085 zhi=3635330364:7558 long=402425474:6734 sans=1664212227:11310
[PASS] 3 CJK faces render distinct glyph pixels (not a shared fallback)
[PASS] EN in chain falls back to Caveat
[PASS] CN in chain falls through to Ma Shan Zheng
[PASS] EN still uses Caveat when CJK font is FIRST (unicode-range)
[PASS] CN still uses Ma Shan Zheng when CJK font is first
RESULT: ALL_PASS
```

- `pixelsig` 四个值互不相同 → 三个中文字体都是**各自的字形**在渲染，不是同一个系统 fallback。
- 两种字体链顺序下英文都落到 Caveat、中文都用马善政 → **`src/core.js` 现有的
  `"Ma Shan Zheng", Caveat, "KaiTi", serif` 写法无需修改即可获得正确混排**。

## 实现要点：为什么加 `unicode-range`

中文字体子集里其实**包含 ASCII 字形**（文件名/数字等在字体里都有），如果不做限制，
`font-family: "Ma Shan Zheng", "Caveat"` 会把 `Rainie Love` 也用马善政的拉丁字形渲染，Caveat 形同虚设。
因此三个中文 `@font-face` 声明：

```css
unicode-range: U+0020, U+00D7, U+00F7, U+2014, U+2018-201D, U+2026,
               U+3000-303F, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FFEF;
```

效果：ASCII 永远不匹配中文字体 → 英文/数字必然使用后面的 `Caveat`（或系统 fallback），
**与 font-family 链顺序无关**；中文/中文标点仍由马善政出字。

## 字体来源与许可

全部字体来自 **Google Fonts**（`github.com/google/fonts` 的 `ofl/` 目录），**SIL Open Font License 1.1**，
许可全文与版权行保存在 `fonts/OFL/`。

| 字体 | 版本 | 来源 | 版权 | 许可文件 |
| --- | --- | --- | --- | --- |
| Ma Shan Zheng 马善政 | 2.003 | [Google Fonts](https://fonts.google.com/specimen/Ma+Shan+Zheng) · [github/ofl/mashanzheng](https://github.com/google/fonts/tree/main/ofl/mashanzheng) | Copyright 2018 The Ma Shan Zheng Project Authors | `OFL/OFL-MaShanZheng.txt` |
| Zhi Mang Xing 志莽行书 | 2.001 | [Google Fonts](https://fonts.google.com/specimen/Zhi+Mang+Xing) · [github/ofl/zhimangxing](https://github.com/google/fonts/tree/main/ofl/zhimangxing) | Copyright 2018 The Zhi Mang Xing Project Authors | `OFL/OFL-ZhiMangXing.txt` |
| Long Cang 龙藏 | 2.001 | [Google Fonts](https://fonts.google.com/specimen/Long+Cang) · [github/ofl/longcang](https://github.com/google/fonts/tree/main/ofl/longcang) | Copyright 2018 The Long Cang Project Authors | `OFL/OFL-LongCang.txt` |
| Caveat | 2.000 | [Google Fonts](https://fonts.google.com/specimen/Caveat) · [github/ofl/caveat](https://github.com/google/fonts/tree/main/ofl/caveat) | Copyright 2014 The Caveat Project Authors | `OFL/OFL-Caveat.txt` |
| Reenie Beanie | 1.000 | [Google Fonts](https://fonts.google.com/specimen/Reenie+Beanie) · [github/ofl/reeniebeanie](https://github.com/google/fonts/tree/main/ofl/reeniebeanie) | Copyright (c) 2010, James Grieshaber (typeco.com) | `OFL/OFL-ReenieBeanie.txt` |

- 子集化属于 OFL 允许的修改：未改字体名、未改版权声明，OFL 全文与版权行随字体文件一并分发。
- Caveat 原始为 400–700 可变字体，**已固定到 wght 600 再子集化**（静态实例），故 CSS 中 `font-weight: 600`。

## 已知限制

1. **只覆盖 `charset.txt` 的 413 字符**。若歌词/片头变更出现新字，重新跑 `build_fonts.py`；否则新字会回落到系统字体（风格会跳）。
2. Caveat 为 600 单一字重：页面写 `font-weight: 400` 也会用这一档渲染（视觉不变，不会合成更细的字重）。
3. 空格 U+0020 被划给中文字体（`unicode-range` 含 U+0020）：中文句子里空格宽度 = 马善政的 0.21em，
   与 Caveat 的 0.24em 差约 1.4px @46px，肉眼可忽略；若需要英文空格完全跟随 Caveat，把 `U+0020,` 从 unicode-range 里删掉即可。
4. 渲染期**不要**改回 Google Fonts CDN 链接；`fonts.css` 内全部是相对路径，`file://` 与本地 `http://` 均可加载。
5. `font-display: block`：字体未就绪时浏览器暂不显示文字（首帧不会用系统字体顶替），适合逐帧截图。

## 复现 / 重建

```bash
# 环境：Anaconda Python（自带 fontTools 4.55 + brotli + Pillow）或 pip install fonttools brotli pillow
cd yuai-sketch/fonts
python build_fonts.py                 # 下载完整 OFL 字体到临时缓存 -> 子集化 -> 输出 ttf/woff2 + OFL
python check_fonts.py                 # 逐字覆盖 + unicode-range 自检（PASS/FAIL，退出码 0=全过）
python verify_browser.py --mode both  # headless Chrome 验证 file:// 与 http:// 加载
python make_preview.py --recommend MaShanZheng   # 重生成两张预览图
```

`build_fonts.py` 下载地址（可复现）：

- `https://raw.githubusercontent.com/google/fonts/main/ofl/mashanzheng/MaShanZheng-Regular.ttf`
- `https://raw.githubusercontent.com/google/fonts/main/ofl/zhimangxing/ZhiMangXing-Regular.ttf`
- `https://raw.githubusercontent.com/google/fonts/main/ofl/longcang/LongCang-Regular.ttf`
- `https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf`
- `https://raw.githubusercontent.com/google/fonts/main/ofl/reeniebeanie/ReenieBeanie.ttf`

## 预览图

- `preview-subtitle.png` —— 三个中文字体 × 46px/40px × 三行歌词（长句 / 短句 / 含英文句），
  每张卡片上方标注字体名与字号。用于判断字幕可读性。
- `preview-mixed.png` —— 英文混排验证：方案 A（整句只用中文字体）vs 方案 B（推荐混排），
  以及 Caveat / Reenie Beanie / 中文字体自带拉丁的选型对照，
  含片头曲名 `《Rainie & Love....? 雨爱》` 的整行混排。
