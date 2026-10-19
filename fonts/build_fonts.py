# -*- coding: utf-8 -*-
"""构建《雨爱》MV 离线自托管字体子集。

流程:
  1. 从 data/lyrics-source.txt 提取全部字符, 并补充片名 / 英文 / 预览标注所需字符
     -> fonts/charset.txt
  2. 从 google/fonts (OFL) 下载完整字体到临时缓存目录(仅首次)
  3. 用 fontTools pyftsubset 子集化, 输出 TTF(Pillow 用) + WOFF2(浏览器用)
  4. 从 OFL.txt 复制许可证到 fonts/OFL/

用法:  python build_fonts.py
依赖:  fontTools (>=4.40), brotli  (Anaconda 环境自带有)
"""
import hashlib
import io
import os
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
LYRICS = os.path.join(PROJECT, "data", "lyrics-source.txt")
CACHE = os.path.join(tempfile.gettempdir(), "yuai-fonts-src")

RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl"

# key: 输出文件名前缀; 值为下载信息
FONTS = {
    "MaShanZheng": {
        "cn": "马善政",
        "url": RAW + "/mashanzheng/MaShanZheng-Regular.ttf",
        "src": "MaShanZheng-Regular.ttf",
        "ofl": RAW + "/mashanzheng/OFL.txt",
        "ofl_out": "OFL-MaShanZheng.txt",
        "kinds": ["ttf", "woff2"],
    },
    "ZhiMangXing": {
        "cn": "志莽行书",
        "url": RAW + "/zhimangxing/ZhiMangXing-Regular.ttf",
        "src": "ZhiMangXing-Regular.ttf",
        "ofl": RAW + "/zhimangxing/OFL.txt",
        "ofl_out": "OFL-ZhiMangXing.txt",
        "kinds": ["ttf", "woff2"],
    },
    "LongCang": {
        "cn": "龙藏",
        "url": RAW + "/longcang/LongCang-Regular.ttf",
        "src": "LongCang-Regular.ttf",
        "ofl": RAW + "/longcang/OFL.txt",
        "ofl_out": "OFL-LongCang.txt",
        "kinds": ["ttf", "woff2"],
    },
    "Caveat": {
        "cn": "Caveat(拉丁手写)",
        "url": RAW + "/caveat/Caveat%5Bwght%5D.ttf",
        "src": "Caveat-VF.ttf",
        "ofl": RAW + "/caveat/OFL.txt",
        "ofl_out": "OFL-Caveat.txt",
        # variable font -> 实例化到 wght=600 再子集, 静态文件更省事
        "instance": 600,
        "kinds": ["ttf", "woff2"],
    },
    "ReenieBeanie": {
        "cn": "Reenie Beanie(拉丁手写)",
        "url": RAW + "/reeniebeanie/ReenieBeanie.ttf",
        "src": "ReenieBeanie.ttf",
        "ofl": RAW + "/reeniebeanie/OFL.txt",
        "ofl_out": "OFL-ReenieBeanie.txt",
        "kinds": ["ttf", "woff2"],
    },
}

# 歌词正文之外、页面/预览/标注可能用到的字符。
# 只放常用字, 保证三个中文字体(GB2312 级覆盖)都有字形。
EXTRA_CN = (
    # 片名 / 曲目信息补充
    "雨爱演唱作词作曲编曲专辑偶像剧片尾曲"
    # 字体名 (预览标注/README 截图演示用)
    "马善政志莽行书龙藏楷体正楷手写行楷"
    # 预览图 / 页面标签用字
    "字体字号推荐备用混排预览对比可读性英文中文正文字幕长句短句含标注上方"
    "名称渲染验证结论来源许可子集化文件大小路径建议字重常规粗体细体测试"
    "加载成功失败缺字覆盖率字符集钢笔墨线淡彩纸底奶油白墨色深灰浅灰背景"
    "前景颜色透明清晰辨识认难错位连笔"
    # 数字/日期/单位常用
    "年第月日时分秒帧张页版本尺寸像素点线面"
    # 常用连接词, 便于说明文字
    "的了是在有无不和与也都就这那以及或等其中为对从到会能可应该请见图表说明备注"
    # 片头可能用到的
    "导演出品制作人摄影剪辑美术音乐音效"
    # 分镜/段落名（src/shots.js 的段落名, 以防片尾/章节字卡用到）
    "主副歌桥段复奏"
)

# 标点 / 符号 (全角为主; 注意: 三个中文手写字体都没有 U+00B7 中点, 不要放进来)
EXTRA_PUNCT = (
    "，。！？、；：“”‘’《》（）【】〔〕—…～～／＼｜＋－×÷＝"
    "“”‘’〈〉「」『』【】…—～"
    "!?,.;:'\"()[]{}<>-_/\\|@#$%^&*+=~`"
)

# 完整 ASCII 可打印字符(确保拉丁/数字/符号全在, 页面上随便写英文都不缺字)
ASCII_PRINTABLE = "".join(chr(c) for c in range(0x20, 0x7F))


def read_lyrics_chars():
    with io.open(LYRICS, encoding="utf-8") as f:
        text = f.read()
    seen, out = set(), []
    for ch in text:
        if ch in ("\n", "\r", "\t", "\ufeff"):
            continue
        if ch == " ":
            continue
        if ch not in seen:
            seen.add(ch)
            out.append(ch)
    return out


def build_charset():
    chars = read_lyrics_chars()
    seen = set(chars)
    for ch in EXTRA_CN + EXTRA_PUNCT + ASCII_PRINTABLE:
        if ch not in seen:
            seen.add(ch)
            chars.append(ch)
    return chars


def write_charset(chars):
    # charset.txt: 一行一个分段, 无空白字符; 供 pyftsubset --text-file 使用
    path = os.path.join(HERE, "charset.txt")
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write("".join(chars).replace(" ", ""))
        f.write("\n")
    return path


def download(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 1024:
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def instantiate(src, dest, wght):
    from fontTools import ttLib
    from fontTools.varLib import instancer

    font = ttLib.TTFont(src)
    try:
        inst = instancer.instantiateVariableFont(font, {"wght": wght}, updateFontNames=True)
    except ValueError:
        # Caveat 的 STAT 表没有 wght=600 的命名实例, 放弃改 name table 即可
        font = ttLib.TTFont(src)
        inst = instancer.instantiateVariableFont(font, {"wght": wght}, updateFontNames=False)
    inst.save(dest)
    return dest


def subset(src, dest, text_file, flavor=None):
    from fontTools import subset as ftsubset

    args = [
        src,
        "--text-file=" + text_file,
        "--unicodes=U+0020",
        "--layout-features=*",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-IDs=*",
        "--name-legacy",
        "--name-languages=*",
        "--glyph-names",
        "--output-file=" + dest,
    ]
    if flavor:
        args.append("--flavor=" + flavor)
    ftsubset.main(args)
    return dest


def main():
    try:
        import fontTools  # noqa: F401
    except ImportError:
        sys.exit("缺少 fontTools: 用 Anaconda python 或 pip install fonttools brotli")
    chars = build_charset()
    charset_path = write_charset(chars)
    print("[charset] %d 字符 -> %s" % (len(chars), charset_path))

    os.makedirs(CACHE, exist_ok=True)
    ofl_dir = os.path.join(HERE, "OFL")
    os.makedirs(ofl_dir, exist_ok=True)
    report = []
    for key, info in FONTS.items():
        src = download(info["url"], os.path.join(CACHE, info["src"]))
        if info.get("instance"):
            inst = os.path.join(CACHE, key + "-inst%d.ttf" % info["instance"])
            if not os.path.exists(inst):
                instantiate(src, inst, info["instance"])
            src = inst
        out_ttf = os.path.join(HERE, key + "-subset.ttf")
        out_woff2 = os.path.join(HERE, key + "-subset.woff2")
        subset(src, out_ttf, charset_path)
        subset(src, out_woff2, charset_path, flavor="woff2")
        # OFL 许可证
        ofl_path = os.path.join(ofl_dir, info["ofl_out"])
        download(info["ofl"], ofl_path)
        row = {
            "key": key,
            "ttf": out_ttf,
            "ttf_bytes": os.path.getsize(out_ttf),
            "woff2": out_woff2,
            "woff2_bytes": os.path.getsize(out_woff2),
            "sha256": hashlib.sha256(open(out_woff2, "rb").read()).hexdigest()[:16],
        }
        report.append(row)
        print("[subset] %-14s ttf=%6d B  woff2=%6d B" % (key, row["ttf_bytes"], row["woff2_bytes"]))
    print("\n完成。")


if __name__ == "__main__":
    main()
