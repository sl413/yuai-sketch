# -*- coding: utf-8 -*-
"""检索在线歌词（网易云/QQ音乐）作为时间轴的交叉验证参考。结果写入 out/online_lyrics.json。

仅用于交叉验证：最终 lyrics.json 仍以本地音频分析 + 该参考的先验区间做对齐。
"""
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

OUT = Path(r"E:\vibe知识大赏dsh\yuai-sketch\tools\audio\out")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")


def http(url, headers=None, timeout=25):
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def try_netease():
    q = urllib.parse.quote("雨爱 杨丞琳")
    url = f"https://music.163.com/api/search/get?s={q}&type=1&limit=20&offset=0"
    try:
        d = json.loads(http(url, {"Referer": "https://music.163.com/"}).decode("utf-8", "ignore"))
    except Exception as e:
        return {"error": f"search: {e}"}
    songs = (d.get("result") or {}).get("songs") or []
    rows = []
    for s in songs:
        rows.append({
            "id": s.get("id"), "name": s.get("name"),
            "artists": ", ".join(a.get("name", "") for a in s.get("artists", [])),
            "album": (s.get("album") or {}).get("name"),
            "duration_ms": s.get("duration"),
        })
    result = {"search": rows, "lyrics": {}}
    for r in rows:
        try:
            lu = f"https://music.163.com/api/song/lyric?id={r['id']}&lv=1&kv=1&tv=-1"
            ld = json.loads(http(lu, {"Referer": "https://music.163.com/"}).decode("utf-8", "ignore"))
            lrc = (ld.get("lrc") or {}).get("lyric", "")
            result["lyrics"][str(r["id"])] = lrc
        except Exception as e:
            result["lyrics"][str(r["id"])] = f"ERROR {e}"
    return result


def try_qq():
    q = urllib.parse.quote("雨爱")
    urls = [
        ("https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1"
         "&remoteplace=txt.yqq.song&searchid=0&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0"
         f"&p=1&n=20&w={q}&format=json"),
        ("https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?"
         f"key={urllib.parse.quote('雨爱 杨丞琳')}&format=json"),
    ]
    out = []
    for u in urls:
        try:
            txt = http(u, {"Referer": "https://y.qq.com/"}).decode("utf-8", "ignore")
            out.append({"url": u[:80], "body": txt[:6000]})
        except Exception as e:
            out.append({"url": u[:80], "error": str(e)})
    return out


def try_kugou():
    q = urllib.parse.quote("雨爱 杨丞琳")
    u = f"https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword={q}&page=1&pagesize=20&showtype=1"
    try:
        txt = http(u).decode("utf-8", "ignore")
        return {"body": txt[:8000]}
    except Exception as e:
        return {"error": str(e)}


def main():
    out = {
        "netease": try_netease(),
        "qq": try_qq(),
        "kugou": try_kugou(),
    }
    (OUT / "online_lyrics.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("written", OUT / "online_lyrics.json")
    for k, v in out.items():
        print(k, "ok" if "error" not in str(v)[:20] else "err")


if __name__ == "__main__":
    main()
