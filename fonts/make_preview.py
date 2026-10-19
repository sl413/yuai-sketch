# -*- coding: utf-8 -*-
"""生成字体选型预览图 (1920x1080)。

1. fonts/preview-subtitle.png
   三行代表性歌词 × 3 个中文手写体 × 46px / 40px, 纸底 #f5eede、墨色 #3a342c,
   每个组合上方标注字体名与字号。用于判断"歌词可读性 + 手写感"。
2. fonts/preview-mixed.png
   中文推荐字体 + 英文 Caveat / Reenie Beanie 的混排 fallback 效果验证。

用法: python make_preview.py [--recommend LongCang]
依赖: Pillow
"""
import io
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1920, 1080
PAPER = (245, 238, 222)          # f5eede 奶油白纸底
INK = (58, 52, 44)               # 3a342c 深灰墨色
INK_SOFT = (124, 113, 96)
LINE = (216, 202, 181)

CJK_FONTS = [
    ("MaShanZheng", "MaShanZheng-subset.ttf", "马善政", "Ma Shan Zheng"),
    ("ZhiMangXing", "ZhiMangXing-subset.ttf", "志莽行书", "Zhi Mang Xing"),
    ("LongCang", "LongCang-subset.ttf", "龙藏", "Long Cang"),
]
LATIN_FONTS = [
    ("Caveat", "Caveat-subset.ttf", "Caveat", "wght 600 静态实例"),
    ("ReenieBeanie", "ReenieBeanie-subset.ttf", "Reenie Beanie", "Regular 400"),
]

LYRIC_LINES = [
    ("你的呼吸像雨滴渗入我的爱里", "长句 13 字"),
    ("真希望雨能下不停", "短句 8 字"),
    ("我爱上给我勇气的 Rainie Love", "中文 + 英文混排"),
]

UI_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
]


def _font_path(name):
    return os.path.join(HERE, name)


def load_font(ttf, size):
    return ImageFont.truetype(_font_path(ttf), size)


def load_ui(size, bold=False):
    for p in (UI_FONT_CANDIDATES if not bold else UI_FONT_CANDIDATES[1:]):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size, index=0)
            except Exception:  # noqa: BLE001
                continue
    return ImageFont.load_default()


def text_len(draw, text, font):
    return draw.textlength(text, font=font)


def draw_baseline(draw, xy, text, font, fill=INK):
    draw.text(xy, text, font=font, fill=fill, anchor="ls")


def make_subtitle_preview(path):
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)

    title_font = load_ui(38, bold=True)
    sub_font = load_ui(20)
    draw_baseline(draw, (24, 58), "《雨爱》字幕手写字体可读性对比", title_font)
    draw_baseline(
        draw,
        (24, 90),
        "三行歌词 × 3 个 OFL 中文手写体 × 46px / 40px　"
        "纸底 #f5eede · 墨色 #3a342c · 字幕区安全宽度参考",
        sub_font,
        INK_SOFT,
    )

    M = 24
    top = 112
    bot = 24
    gap = 14
    card_w = (W - 2 * M - 16) // 2
    card_h = (H - top - bot - 2 * gap) // 3
    sizes = (46, 40)

    for r, (key, ttf, cn, en) in enumerate(CJK_FONTS):
        for c, size in enumerate(sizes):
            cx = M + c * (card_w + 16)
            cy = top + r * (card_h + gap)
            # 卡片底与细边框
            draw.rectangle([cx, cy, cx + card_w - 1, cy + card_h - 1], fill=(247, 242, 230), outline=LINE)
            font = load_font(ttf, size)
            label_font = load_font(ttf, 24)
            # 标注行: 字体名(左) + 字号(右)
            baseline = cy + 40
            draw_baseline(draw, (cx + 24, baseline), "%s  %s" % (cn, en), label_font)
            tag = "%dpx" % size
            tag_w = text_len(draw, tag, label_font)
            draw_baseline(draw, (cx + card_w - 24 - tag_w, baseline), tag, label_font, INK_SOFT)
            draw.line([cx + 24, cy + 56, cx + card_w - 24, cy + 56], fill=LINE, width=1)
            # 三句歌词
            lh = size + 18
            content_top = cy + 56
            content_h = card_h - 56
            block_h = lh * 3
            pad = max(18, (content_h - block_h) // 2)
            asc, _desc = font.getmetrics()
            for i, (line, _note) in enumerate(LYRIC_LINES):
                by = content_top + pad + asc + i * lh
                draw_baseline(draw, (cx + 24, by), line, font)
                # 超宽保护: 实测宽度写在图上不现实, 先断言
                wdt = text_len(draw, line, font)
                if wdt > card_w - 48:
                    print("[warn] %s %dpx 行宽 %.0f > %d" % (key, size, wdt, card_w - 48))
    img.save(path)
    print("[preview] %s  (%d bytes)" % (path, os.path.getsize(path)))
    return img


def make_mixed_preview(path, recommend_key):
    """中文用推荐字体, 英文用 Caveat / Reenie Beanie 混排。"""
    rec = next(f for f in CJK_FONTS if f[0] == recommend_key)
    _key, rec_ttf, rec_cn, rec_en = rec
    caveat = ("Caveat", "Caveat-subset.ttf")
    reenie = ("ReenieBeanie", "ReenieBeanie-subset.ttf")

    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)
    title_font = load_ui(36, bold=True)
    sub_font = load_ui(19)
    note_font = load_ui(20, bold=True)
    small = load_ui(17)

    draw_baseline(draw, (24, 56), "英文混排 fallback 验证：中文 %s × 拉丁手写体" % rec_cn, title_font)
    draw_baseline(
        draw,
        (24, 88),
        "CSS 写法：font-family: \"Caveat\", \"%s\", sans-serif;  "
        "（拉丁手写体放链首：英文/数字自动用 Caveat，中文自动落到 %s，无需给英文套 span）"
        % (rec_en, rec_cn),
        sub_font,
        INK_SOFT,
    )

    def mixed_line(x, baseline_y, segments, default_font, fill=INK):
        """segments: [(text, font)]"""
        cur = x
        for text, font in segments:
            draw.text((cur, baseline_y), text, font=font, fill=fill, anchor="ls")
            cur += draw.textlength(text, font=font)
        return cur

    def split_segments(line_text, cjk_font, latin_font, cjk_size, latin_size):
        """把一行拆成 中文片段(用 cjk_font) / 非中文片段(用 latin_font, 拉丁字号略小)。

        空格按浏览器 font-fallback 的实际行为归给"前一个字符"的字体:
        CSS 逐字符选字体时 U+0020 会被首选的 CJK 字体接住, 所以这里把空格留在中文段,
        否则预览里的中英间隙会比真实渲染偏大。
        """
        segs = []
        buf = ""
        mode = None
        for ch in line_text:
            if ch == " " and mode is not None:
                m = mode
            else:
                m = "cjk" if ord(ch) > 0x2E7F else "latin"
            if mode is None:
                mode = m
            if m != mode:
                segs.append((buf, cjk_font if mode == "cjk" else latin_font))
                buf = ""
                mode = m
            buf += ch
        if buf:
            segs.append((buf, cjk_font if mode == "cjk" else latin_font))
        return segs

    # ---------------- 上半: 46px / 40px 混排 ----------------
    y = 150
    for size, label in ((46, "46px"), (40, "40px")):
        cjk = load_font(rec_ttf, size)
        lat = load_font(caveat[1], size - 2)  # 英文字号比中文小 2px, 视觉等大
        lab = load_ui(19, bold=True)
        draw_baseline(draw, (48, y + 26), "方案 B（推荐混排）· %s" % label, lab, INK_SOFT)
        line = "我爱上给我勇气的 Rainie Love"
        segs = split_segments(line, cjk, lat, size, size - 2)
        mixed_line(64, y + 30 + size, segs, cjk)
        # 方案 A: 整句只用中文字体
        draw_baseline(draw, (1000, y + 26), "方案 A（不混排）· %s" % label, lab, INK_SOFT)
        draw_baseline(draw, (1016, y + 30 + size), line, cjk)
        y += size + 110

    # 分隔
    draw.line([24, y - 12, W - 24, y - 12], fill=LINE, width=1)

    # ---------------- 下半: 拉丁手写体选型 + 片头曲名混排 ----------------
    y += 30
    draw_baseline(draw, (24, y), "拉丁手写体选型：Rainie Love  (46px 中文字旁的视觉大小)", note_font)
    y += 26
    sample = "Rainie Love"
    for i, (lkey, lttf, cn, desc) in enumerate(LATIN_FONTS):
        f46 = load_font(lttf, 46)
        x = 48 + i * 620
        draw_baseline(draw, (x, y + 20), "%s (%s)" % (cn, desc), load_ui(17), INK_SOFT)
        draw_baseline(draw, (x, y + 80), sample, f46)
    # 中文字体自带拉丁(作对照)
    cjk46 = load_font(rec_ttf, 46)
    x = 48 + 2 * 620
    draw_baseline(draw, (x, y + 20), "%s 自带拉丁（对照）" % rec_cn, load_ui(17), INK_SOFT)
    draw_baseline(draw, (x, y + 80), sample, cjk46)
    y += 130

    # 片头曲名整行: 中文推荐 + Caveat
    draw.line([24, y, W - 24, y], fill=LINE, width=1)
    y += 46
    draw_baseline(draw, (24, y), "片头曲名整行混排（42px）：", note_font)
    y += 34
    for i, size in enumerate((42, 34)):
        cjk = load_font(rec_ttf, size)
        lat = load_font(caveat[1], size - 2)
        reen = load_font(reenie[1], size - 2)
        line = "《Rainie & Love....? 雨爱》"
        yy = y + i * (size + 62)
        mixed_line(64, yy + size, split_segments(line, cjk, lat, size, size - 2), cjk)
        # 对照: Reenie Beanie
        draw_baseline(draw, (980, yy + size - 6), "替换拉丁为 Reenie Beanie →", load_ui(17), INK_SOFT)
        mixed_line(1400, yy + size, split_segments(line, cjk, reen, size, size - 2), cjk)

    # 底部建议
    bottom = H - 34
    draw.line([24, bottom - 54, W - 24, bottom - 54], fill=LINE, width=1)
    draw_baseline(
        draw,
        (24, bottom),
        "建议：中文 %s 46px/40px；英文 Rainie Love 用 Caveat 600，字号 = 中文字号 − 2px，"
        "基线对齐；font-family 链把 Caveat 放前面即可自动混排。" % rec_cn,
        small,
        INK_SOFT,
    )
    img.save(path)
    print("[preview] %s  (%d bytes)" % (path, os.path.getsize(path)))
    return img


def main():
    recommend = "MaShanZheng"
    if "--recommend" in sys.argv:
        recommend = sys.argv[sys.argv.index("--recommend") + 1]
    make_subtitle_preview(os.path.join(HERE, "preview-subtitle.png"))
    make_mixed_preview(os.path.join(HERE, "preview-mixed.png"), recommend)


if __name__ == "__main__":
    main()
