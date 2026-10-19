# -*- coding: utf-8 -*-
"""用 headless Chrome 验证 fonts.css 能在离线环境加载, 且 fallback 链真实生效。

验证内容 (页面 fonts/preview.html 内 JS 自检, 本脚本只负责驱动 Chrome 与抓取):
  1. document.fonts.load()/check(): 5 个 @font-face 均加载成功
  2. canvas 宽度探针: 3 个中文字体渲染同一句中文, 宽度互不相同 (证明不是同一个 fallback)
  3. fallback 链 `"Caveat", "Ma Shan Zheng"`: 英文宽度 == Caveat, 中文宽度 == Ma Shan Zheng
     (证明 CSS 逐字符 fallback 方案可行, 无需给英文套 span)

两种协议都测:
  file://  —— 直接打开本地文件
  http://  —— 本地静态服务 (最终渲染就用这种方式)

用法: python verify_browser.py [--mode file|http|both] [--screenshot]
依赖: 系统 Chrome; Python 标准库
"""
import argparse
import http.server
import os
import re
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(HERE)
PAGE = os.path.join(HERE, "preview.html")

CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    for name in ("chrome", "google-chrome", "chromium", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    return None


def run_chrome(chrome, url, screenshot=None):
    profile = tempfile.mkdtemp(prefix="yuai-chrome-")
    args = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        "--mute-audio",
        "--user-data-dir=" + profile,
        "--allow-file-access-from-files",
        "--virtual-time-budget=15000",
        "--window-size=1920,1080",
    ]
    if screenshot:
        args.append("--screenshot=" + screenshot)
    else:
        args.append("--dump-dom")
    args.append(url)
    try:
        r = subprocess.run(args, capture_output=True, timeout=180)
        return r
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def extract_result(html_bytes):
    txt = html_bytes.decode("utf-8", "replace")
    m = re.search(r'<div id="result"[^>]*>(.*?)</div>', txt, re.S)
    block = m.group(1) if m else txt
    lines = [ln.strip() for ln in re.split(r"[\r\n]+", block) if ln.strip()]
    verdict = None
    for ln in lines:
        if "RESULT:" in ln:
            verdict = "ALL_PASS" if "ALL_PASS" in ln else "FAIL"
    return lines, verdict


def serve_project():
    os.chdir(PROJECT)

    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):  # noqa: D401
            pass

    class Server(socketserver.ThreadingTCPServer):
        allow_reuse_address = True

    httpd = Server(("127.0.0.1", 0), Quiet)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", default="both", choices=["file", "http", "both"])
    ap.add_argument("--screenshot", action="store_true", help="额外截图到临时目录")
    args = ap.parse_args()

    chrome = find_chrome()
    if not chrome:
        print("[ERROR] 未找到 Chrome/Edge")
        return 2
    print("chrome:", chrome)
    print("page  :", PAGE)
    modes = ["file", "http"] if args.mode == "both" else [args.mode]
    all_ok = True
    httpd = None
    try:
        for mode in modes:
            if mode == "file":
                url = "file:///" + PAGE.replace(os.sep, "/")
            else:
                httpd, port = serve_project()
                url = "http://127.0.0.1:%d/fonts/preview.html" % port
            print("\n=== %s: %s ===" % (mode, url))
            shot = None
            if args.screenshot:
                shot = os.path.join(tempfile.gettempdir(), "yuai-font-check-%s.png" % mode)
                run_chrome(chrome, url, screenshot=shot)
                print("screenshot:", shot, "->", os.path.getsize(shot), "bytes")
            r = run_chrome(chrome, url)
            lines, verdict = extract_result(r.stdout)
            for ln in lines:
                print("  " + ln)
            print("  >> %s: %s" % (mode.upper(), verdict or "NO_RESULT"))
            if verdict != "ALL_PASS":
                all_ok = False
                if r.stderr:
                    err = r.stderr.decode("utf-8", "replace").strip().splitlines()
                    print("  [chrome stderr]", "\n  ".join(err[-5:]))
    finally:
        if httpd is not None:
            httpd.shutdown()
            httpd.server_close()
    print("\n浏览器验证:", "ALL_PASS" if all_ok else "FAIL")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
