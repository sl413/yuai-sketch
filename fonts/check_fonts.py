# -*- coding: utf-8 -*-
"""离线字体自检: 逐字体逐字验证所需字符都有真实字形。

校验口径:
  * CJK 手写字体 (MaShanZheng / ZhiMangXing / LongCang):
        必须覆盖 charset.txt 的全部字符 (歌词 160 字 + 片名/标注/标点等)
  * 拉丁手写字体 (Caveat / ReenieBeanie):
        只用于英文混排 (Rainie Love), 要求覆盖 charset.txt 里的全部 ASCII 可打印字符;
        不要求中文字形 (字体本身不含中日韩), 中文缺字在报告中标注为"不适用/预期"
  * fonts.css 的 unicode-range:
        中文字体必须声明 unicode-range 覆盖全部非 ASCII 字符, 且排除 ASCII
        (这样英文/数字无论 font-family 链顺序如何都会落到拉丁手写体)

双重校验:
  A. fontTools cmap: 字符必须映射到 glyph (且不是 .notdef)
  B. Pillow 实际渲染: 该字符必须画出非空像素 (排除有 cmap 记录但字形为空白)
另单独检查 U+0020 空格的 advance width > 0。

输出:
  - 终端 PASS/FAIL 表
  - fonts/font-coverage.json (供 README 引用)
退出码: 全部 PASS -> 0, 否则 1。

用法: python check_fonts.py
依赖: fontTools, Pillow
"""
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
LYRICS = os.path.join(PROJECT, "data", "lyrics-source.txt")
CSS = os.path.join(HERE, "fonts.css")

# key, ttf 文件, 显示名, 模式, font-family 名
FONT_FILES = [
    ("MaShanZheng", "MaShanZheng-subset.ttf", "马善政 Ma Shan Zheng", "cjk", "Ma Shan Zheng"),
    ("ZhiMangXing", "ZhiMangXing-subset.ttf", "志莽行书 Zhi Mang Xing", "cjk", "Zhi Mang Xing"),
    ("LongCang", "LongCang-subset.ttf", "龙藏 Long Cang", "cjk", "Long Cang"),
    ("Caveat", "Caveat-subset.ttf", "Caveat (拉丁手写)", "latin", "Caveat"),
    ("ReenieBeanie", "ReenieBeanie-subset.ttf", "Reenie Beanie (拉丁手写)", "latin", "Reenie Beanie"),
]

RENDER_SIZE = 64


def read_charset():
    with io.open(os.path.join(HERE, "charset.txt"), encoding="utf-8") as f:
        raw = f.read()
    chars, seen = [], set()
    for ch in raw:
        if ch in "\r\n\t\ufeff ":
            continue
        if ch not in seen:
            seen.add(ch)
            chars.append(ch)
    return chars


def read_lyrics_chars():
    with io.open(LYRICS, encoding="utf-8") as f:
        text = f.read()
    return {ch for ch in text if ch not in "\r\n\t\ufeff "}


# ---------------- fonts.css unicode-range 解析 ----------------

def parse_css_faces(path):
    txt = io.open(path, encoding="utf-8").read()
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    faces = []
    for m in re.finditer(r"@font-face\s*{(.*?)}", txt, re.S):
        body = m.group(1)
        fam = re.search(r'font-family\s*:\s*["\']([^"\']+)["\']', body)
        ur = re.search(r"unicode-range\s*:\s*([^;]+);", body)
        faces.append({
            "family": fam.group(1) if fam else None,
            "unicode_range": ur.group(1).strip() if ur else None,
        })
    return faces


def in_unicode_range(spec, ch):
    cp = ord(ch)
    for tok in spec.split(","):
        tok = tok.strip()
        m = re.match(r"U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$", tok)
        if not m:
            continue
        a, b = m.group(1), m.group(2)
        if "?" in a:
            lo = int(a.replace("?", "0"), 16)
            hi = int(a.replace("?", "F"), 16)
        else:
            lo = int(a, 16)
            hi = int(b, 16) if b else lo
        if lo <= cp <= hi:
            return True
    return False


def check_css_unicode_range(charset):
    """中文字体 face 的 unicode-range 必须: 覆盖全部非 ASCII + 排除 ASCII(空格除外)。"""
    faces = parse_css_faces(CSS)
    by_family = {f["family"]: f for f in faces if f["family"]}
    non_ascii = [c for c in charset if ord(c) >= 0x80]
    ascii_printable = [c for c in charset if 0x20 < ord(c) < 0x7F]
    details, ok = [], True
    for _key, _fname, label, mode, family in FONT_FILES:
        if mode != "cjk":
            continue
        face = by_family.get(family)
        if face is None:
            details.append("%s: fonts.css 缺少 @font-face" % family)
            ok = False
            continue
        spec = face["unicode_range"]
        if not spec:
            details.append("%s: 未声明 unicode-range (英文会被中文字体抢走)" % family)
            ok = False
            continue
        missing = [c for c in non_ascii if not in_unicode_range(spec, c)]
        leaked = [c for c in ascii_printable if in_unicode_range(spec, c)]
        if missing:
            ok = False
            details.append("%s: unicode-range 漏掉 %d 个非 ASCII 字符: %s"
                           % (family, len(missing), "".join(missing[:20])))
        if leaked:
            ok = False
            details.append("%s: unicode-range 误含 ASCII 字符: %s"
                           % (family, "".join(leaked[:20])))
        if not missing and not leaked:
            details.append("%s: 覆盖 %d 个非 ASCII, 排除 %d 个 ASCII ✓"
                           % (family, len(non_ascii), len(ascii_printable)))
    return ok, details, faces


# ---------------- 字形检查 ----------------

def cmap_check(path, chars):
    from fontTools.ttLib import TTFont

    font = TTFont(path, lazy=True)
    cmap = font.getBestCmap()
    missing = [ch for ch in chars if ord(ch) not in cmap]
    notdef = [ch for ch in chars if ch not in missing and cmap[ord(ch)] == ".notdef"]
    space_ok = True
    if ord(" ") in cmap:
        space_ok = font["hmtx"][cmap[ord(" ")]][0] > 0
    glyph_count = len(font.getGlyphOrder())
    font.close()
    return missing, notdef, glyph_count, space_ok


def render_check(path, chars):
    """Pillow 逐字渲染; 返回 (空白字符列表, 错误信息)"""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None, "Pillow 未安装, 跳过渲染校验"
    font = ImageFont.truetype(path, RENDER_SIZE)
    blank = []
    for ch in chars:
        if ch == " ":
            continue
        img = Image.new("L", (RENDER_SIZE * 2, RENDER_SIZE * 2), 0)
        draw = ImageDraw.Draw(img)
        try:
            draw.text((RENDER_SIZE // 2, RENDER_SIZE // 2), ch, fill=255, font=font)
        except Exception as exc:  # noqa: BLE001
            return None, "渲染 %r 失败: %s" % (ch, exc)
        if not img.getbbox():
            blank.append(ch)
    return blank, None


def main():
    charset = read_charset()
    lyrics_chars = read_lyrics_chars()
    core = [ch for ch in charset if ch in lyrics_chars]
    ascii_chars = [ch for ch in charset if 0x20 <= ord(ch) < 0x7F and ch != " "]
    print("charset.txt: %d 字符 (歌词源文本 %d 字, ASCII 可打印 %d 个)"
          % (len(charset), len(core), len(ascii_chars)))
    print("-" * 80)
    results = []
    all_pass = True
    for key, fname, label, mode, family in FONT_FILES:
        path = os.path.join(HERE, fname)
        if not os.path.exists(path):
            print("[MISS] %-24s 文件不存在" % fname)
            all_pass = False
            continue
        required = charset if mode == "cjk" else ascii_chars
        missing, notdef, glyphs, space_ok = cmap_check(path, required)
        blank, render_err = render_check(path, required)
        covered = len(required) - len(missing)
        core_missing = [ch for ch in missing if ch in lyrics_chars]
        ok = not missing and not notdef and (blank is None or not blank) and space_ok
        all_pass = all_pass and ok
        size = os.path.getsize(path)
        row = {
            "key": key,
            "file": fname,
            "label": label,
            "family": family,
            "mode": mode,
            "bytes": size,
            "glyphs": glyphs,
            "required": len(required),
            "covered": covered,
            "missing": "".join(missing),
            "core_missing": "".join(core_missing),
            "blank_render": "".join(blank) if blank else "",
            "space_advance_ok": space_ok,
            "render_check": "skipped" if blank is None else "ok",
            "render_error": render_err,
            "pass": ok,
        }
        results.append(row)
        status = "PASS" if ok else "FAIL"
        scope = "CJK全字符" if mode == "cjk" else "Latin-ASCII"
        print("[%s] %-22s %-11s %3d/%3d  glyphs=%-4d %6.1f KB"
              % (status, fname, scope, covered, len(required), glyphs, size / 1024.0))
        if mode == "cjk":
            print("       歌词核心覆盖: %d/%d"
                  % (len(core) - len([c for c in core if c in missing]), len(core)))
        else:
            print("       中文 %d 字不适用(拉丁手写体仅用于英文混排), 歌词中文由 CJK 字体承担"
                  % (len(charset) - len(ascii_chars)))
        if missing:
            print("       缺字 (%d): %s" % (len(missing), "".join(missing)))
        if core_missing:
            print("       !! 歌词核心缺字 (%d): %s" % (len(core_missing), "".join(core_missing)))
        if notdef:
            print("       .notdef 映射: %s" % "".join(notdef))
        if blank:
            print("       渲染为空白 (%d): %s" % (len(blank), "".join(blank)))
        if not space_ok:
            print("       U+0020 空格 advance = 0")
        if render_err:
            print("       渲染校验: %s" % render_err)
    # ---- fonts.css unicode-range ----
    print("-" * 80)
    ur_ok, ur_details, _faces = check_css_unicode_range(charset)
    all_pass = all_pass and ur_ok
    print("[%s] fonts.css unicode-range (CJK 字体只声明 CJK 区, ASCII 交给拉丁字体)"
          % ("PASS" if ur_ok else "FAIL"))
    for d in ur_details:
        print("       " + d)
    print("-" * 80)
    print("总结: %s" % ("全部 PASS" if all_pass else "存在 FAIL"))
    out = {
        "charset_total": len(charset),
        "lyrics_chars": len(core),
        "ascii_chars": len(ascii_chars),
        "all_pass": all_pass,
        "css_unicode_range_ok": ur_ok,
        "css_unicode_range_details": ur_details,
        "fonts": results,
    }
    with io.open(os.path.join(HERE, "font-coverage.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print("已写 font-coverage.json")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
