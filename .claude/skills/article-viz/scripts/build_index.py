#!/usr/bin/env python3
"""扫描 <root>/*/index.html 的 <meta name="viz:*">，重新生成 <root>/index.html 目录页。

用法:  python build_index.py [<root>]     默认 root=.
页面缺少 viz:* 元信息时回退到 <title>。
"""
import html
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), "assets")


def _meta(src, name):
    m = re.search(rf'<meta\s+name="viz:{name}"\s+content="([^"]*)"', src)
    return html.unescape(m.group(1)) if m else ""


def build(root):
    root = os.path.abspath(root)
    items = []
    for d in sorted(os.listdir(root)):
        p = os.path.join(root, d, "index.html")
        if d.startswith((".", "_")) or not os.path.isfile(p):
            continue
        src = open(p, encoding="utf-8").read()
        t = _meta(src, "title") or re.sub(r"\s*·.*$", "", (re.search(r"<title>(.*?)</title>", src, re.S) or [None, d])[1])
        items.append({"slug": d, "title": t, "summary": _meta(src, "summary"), "source": _meta(src, "source"),
                      "author": _meta(src, "author"), "date": _meta(src, "date") or "", "tags": _meta(src, "tags")})
    items.sort(key=lambda x: x["date"], reverse=True)
    e = html.escape
    cards = "\n".join(
        f'''  <a class="item" href="{e(i["slug"])}/index.html">
    <h3>{e(i["title"])}</h3>
    <p>{e(i["summary"])}</p>
    <div class="meta">{e(i["author"])} · {e(i["date"])}{" · " + e(i["tags"]) if i["tags"] else ""}</div>
  </a>''' for i in items)
    css = open(os.path.join(ASSETS, "viz-core.css"), encoding="utf-8").read()
    page = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>uKnowViz · 技术文章可视化解读</title>
<style>
{css}
</style>
</head>
<body>
<header class="hero">
  <h1>uKnowViz</h1>
  <p>把硬核技术文章变成看得懂、玩得动的交互动画</p>
  <p class="src">共 {len(items)} 篇</p>
</header>
<main>
<div class="cards">
{cards}
</div>
</main>
<footer>由 article-viz 技能生成 · 本页由 build_index.py 自动生成，请勿手改</footer>
</body>
</html>
'''
    out = os.path.join(root, "index.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"[目录] {out}（{len(items)} 篇）")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else ".")
