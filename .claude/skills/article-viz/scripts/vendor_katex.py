#!/usr/bin/env python3
"""把 KaTeX（css/js/auto-render/woff2 字体）下载到本地目录，供所有页面共享、离线可用。

用法:  python vendor_katex.py [<dest>]     默认 dest=./_lib/katex
已存在则跳过。
"""
import os
import re
import sys
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

VERSION = "0.16.11"
CDN = f"https://cdn.jsdelivr.net/npm/katex@{VERSION}/dist/"
FILES = ["katex.min.css", "katex.min.js", "contrib/auto-render.min.js"]


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def ensure(dest):
    marker = os.path.join(dest, ".version")
    if os.path.exists(marker) and open(marker).read().strip() == VERSION:
        print(f"[KaTeX] 已存在 {dest}")
        return
    os.makedirs(os.path.join(dest, "contrib"), exist_ok=True)
    os.makedirs(os.path.join(dest, "fonts"), exist_ok=True)
    for f in FILES:
        with open(os.path.join(dest, f), "wb") as fh:
            fh.write(_get(CDN + f))
    css = open(os.path.join(dest, "katex.min.css"), encoding="utf-8").read()
    fonts = sorted(set(re.findall(r"fonts/([\w-]+\.woff2)", css)))
    for fn in fonts:
        with open(os.path.join(dest, "fonts", fn), "wb") as fh:
            fh.write(_get(CDN + "fonts/" + fn))
    # 只下载了 woff2：去掉 css 里 woff/ttf 的回退源，避免 404 噪音
    css = re.sub(r',url\(fonts/[\w-]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)', "", css)
    open(os.path.join(dest, "katex.min.css"), "w", encoding="utf-8").write(css)
    open(marker, "w").write(VERSION)
    print(f"[KaTeX] 已下载到 {dest}（{len(fonts)} 个字体）")


if __name__ == "__main__":
    ensure(os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(".", "_lib", "katex")))
