#!/usr/bin/env python3
"""生成新的可视化页面骨架：<root>/<slug>/index.html

用法（在项目根目录执行）:
    python .claude/skills/article-viz/scripts/scaffold.py --slug continuous-softmax-attention \
        --title "连续化 Softmax Attention" --source-url https://kexue.fm/archives/11980 \
        --author 苏剑林 --source-title "连续化 Softmax Attention" \
        --hook "把求和换成积分，会得到什么？" --summary "连续化 Softmax Attention ≈ 给注意力矩阵加 Short Conv" \
        --tags "Attention,Transformer"

会做三件事:
  1. 把 assets/template.html 填好占位符，并内联 viz-core.css / viz-core.js 的当前快照
  2. 确保 <root>/_lib/katex/ 存在（不存在则从 jsDelivr 下载，含字体）
  3. 重新生成 <root>/index.html 目录页
已存在的页面不会被覆盖，除非传 --force。
"""
import argparse
import datetime as _dt
import html
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), "assets")
sys.path.insert(0, HERE)
import build_index  # noqa: E402
import vendor_katex  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=".", help="项目根目录（默认当前目录）")
    ap.add_argument("--slug", required=True, help="英文短横线目录名，如 continuous-softmax-attention")
    ap.add_argument("--title", required=True)
    ap.add_argument("--source-url", required=True)
    ap.add_argument("--source-title", default=None)
    ap.add_argument("--author", default="原作者")
    ap.add_argument("--hook", default="", help="标题下的一句话钩子（提出问题）")
    ap.add_argument("--summary", default="", help="首页卡片上的一句话结论")
    ap.add_argument("--tags", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-katex", action="store_true", help="跳过 KaTeX 本地化（离线环境）")
    a = ap.parse_args()

    root = os.path.abspath(a.root)
    out_dir = os.path.join(root, a.slug)
    out = os.path.join(out_dir, "index.html")
    if os.path.exists(out) and not a.force:
        sys.exit(f"[已存在] {out}（如需覆盖加 --force）")

    def rd(name):
        with open(os.path.join(ASSETS, name), encoding="utf-8") as f:
            return f.read()

    esc = lambda s: html.escape(s or "", quote=True)  # noqa: E731
    page = rd("template.html")
    fills = {
        "{{TITLE}}": esc(a.title), "{{HOOK}}": esc(a.hook), "{{SUMMARY}}": esc(a.summary),
        "{{SOURCE_URL}}": esc(a.source_url), "{{SOURCE_TITLE}}": esc(a.source_title or a.title),
        "{{AUTHOR}}": esc(a.author), "{{DATE}}": _dt.date.today().isoformat(), "{{TAGS}}": esc(a.tags),
        "{{KATEX_BASE}}": "../_lib/katex/",
    }
    for k, v in fills.items():
        page = page.replace(k, v)
    # 最后再内联 css/js，避免其内容被当作占位符替换
    page = page.replace("{{VIZ_CSS}}", rd("viz-core.css")).replace("{{VIZ_JS}}", rd("viz-core.js"))

    os.makedirs(out_dir, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"[页面] {out}")

    if not a.no_katex:
        try:
            vendor_katex.ensure(os.path.join(root, "_lib", "katex"))
        except Exception as e:  # 下载失败不致命：viz-core 会回退 CDN
            print(f"[KaTeX] 本地化失败，将回退 CDN：{e}")
    build_index.build(root)


if __name__ == "__main__":
    main()
