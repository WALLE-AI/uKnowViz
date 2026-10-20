#!/usr/bin/env python3
"""把页面中内联的 viz-core.css / viz-core.js 快照替换为 assets/ 中的最新版本。

用法:  python update_core.py <page.html> [<page.html> ...]
       python update_core.py --all [<root>]       更新 <root>/*/index.html（默认 root=.）

修改 assets/viz-core.* 后，对需要新能力的页面运行本脚本。
viz-core 尽量保持向后兼容，但更新后仍应对页面重新运行 check_page.py。
"""
import glob
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
CSS_A, CSS_B = "/* ==== viz-core.css（内联快照，勿手改；页面专属样式写在下方） ==== */\n", "\n/* ==== 页面专属样式 ==== */"
JS_A, JS_B = "/* ==== viz-core.js（内联快照，勿手改） ==== */\n", "\n</script>"


def splice(src, a, b, new):
    i = src.index(a) + len(a)
    j = src.index(b, i)
    return src[:i] + new + src[j:]


def update(path):
    src = open(path, encoding="utf-8").read()
    if CSS_A not in src or JS_A not in src:
        print(f"[跳过] {path}：没有 viz-core 快照标记（不是由 scaffold.py 生成的页面？）")
        return
    css = open(os.path.join(ASSETS, "viz-core.css"), encoding="utf-8").read().rstrip("\n")
    js = open(os.path.join(ASSETS, "viz-core.js"), encoding="utf-8").read().rstrip("\n")
    out = splice(splice(src, CSS_A, CSS_B, css), JS_A, JS_B, js)
    if out != src:
        open(path, "w", encoding="utf-8").write(out)
        print(f"[已更新] {path}")
    else:
        print(f"[无变化] {path}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    if args[0] == "--all":
        root = args[1] if len(args) > 1 else "."
        args = sorted(glob.glob(os.path.join(root, "*", "index.html")))
    for p in args:
        update(p)
