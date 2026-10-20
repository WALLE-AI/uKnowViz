#!/usr/bin/env python3
"""页面交付前自检：JS 语法 → 无头浏览器运行 → 公式渲染 → 运行时错误 → 截图。

用法:
    python check_page.py <page.html> [--shot out.png] [--height 9000] [--width 1200] [--mobile]
    python check_page.py <page.html> --eval "S4.p=0.5; S3.tracing=true;"   # 检查动画中间帧

--eval 会在页面脚本的 VIZ.start() 之前注入一段 JS（改状态对象 / 控件值），在同目录生成
临时副本渲染后删除，截图写到 _check/shot-eval.png。用它确认播放到一半时画面是否正确。

检查项（任一失败则退出码 1）:
  1. 所有内联 <script> 通过 `node --check`（未安装 node 时跳过并提示）
  2. 无头 Chrome/Edge 加载后 html[data-viz-ready="1"]（VIZ.start 跑完）
  3. html[data-viz-errors] 为空（viz-core 捕获的所有 JS 运行时错误）
  4. KaTeX 渲染数 > 0，且无 .katex-error
  5. 页面中没有残留的 TODO 占位注释
截图默认写到页面同目录的 _check/shot.png（--mobile 额外输出 420px 宽的 shot-mobile.png），
之后用 Read 工具查看图片，检查布局与动画首帧。
"""
import argparse
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def find_browser():
    for name in ("google-chrome", "chromium", "chromium-browser", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    return next((c for c in CANDIDATES if os.path.exists(c)), None)


def run(cmd, timeout=120):
    return subprocess.run(cmd, capture_output=True, timeout=timeout, encoding="utf-8", errors="replace")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page")
    ap.add_argument("--shot", default=None)
    ap.add_argument("--width", type=int, default=1200)
    ap.add_argument("--height", type=int, default=9000)
    ap.add_argument("--mobile", action="store_true")
    ap.add_argument("--eval", default=None, help="在 VIZ.start() 前注入的 JS，用于检查动画中间帧，如 \"S1.u=0.5;\"")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    page = pathlib.Path(a.page).resolve()
    src = page.read_text(encoding="utf-8")
    ok = True
    report = []

    # 1. JS 语法
    node = shutil.which("node")
    scripts = [m.group(1) for m in re.finditer(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", src, re.S)]
    if node:
        for i, s in enumerate(scripts):
            with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
                f.write(s)
            r = run([node, "--check", f.name])
            os.unlink(f.name)
            if r.returncode:
                ok = False
                report.append(f"✗ 脚本块 #{i} 语法错误:\n{r.stderr.strip()[:800]}")
        if ok:
            report.append(f"✓ JS 语法（{len(scripts)} 个内联脚本）")
    else:
        report.append("- 未找到 node，跳过 JS 语法检查")

    # 5. TODO 残留
    todos = re.findall(r"<!--\s*TODO[^>]*-->", src)
    if todos:
        ok = False
        report.append(f"✗ 残留 {len(todos)} 处 TODO 占位：{todos[0][:60]}…")
    else:
        report.append("✓ 无 TODO 占位")

    # 2-4. 无头浏览器
    br = find_browser()
    if not br:
        report.append("- 未找到 Chrome/Edge，跳过运行时与截图检查")
    else:
        url, tmp = page.as_uri(), None
        if a.eval:
            # 在 VIZ.start() 之前注入状态修改，生成临时副本（放在同目录，相对路径不变）
            i = src.rfind("VIZ.start();")
            if i < 0:
                sys.exit("--eval 需要页面脚本中有 VIZ.start();")
            tmp = page.with_name("_vizcheck_tmp.html")
            tmp.write_text(src[:i] + a.eval + "\n" + src[i:], encoding="utf-8")
            url = tmp.as_uri()
        base = [br, "--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
                "--virtual-time-budget=10000", "--run-all-compositor-stages-before-draw"]
        dom = run(base + ["--dump-dom", url]).stdout
        ready = 'data-viz-ready="1"' in dom
        errs = re.search(r'data-viz-errors="([^"]*)"', dom)
        n_katex = len(re.findall(r'class="katex"', dom))
        n_kerr = len(re.findall(r'class="katex-error"', dom))
        body = re.sub(r"<script.*?</script>", "", dom, flags=re.S)
        body = re.sub(r'<span class="katex".*?</annotation>', "", body, flags=re.S)
        raw_math = len(re.findall(r"\$\$", re.sub(r"<[^>]+>", "", body)))
        report.append(("✓" if ready else "✗") + " VIZ.start 完成（data-viz-ready）")
        ok &= ready
        if errs and errs.group(1).strip():
            ok = False
            report.append(f"✗ 运行时错误: {errs.group(1)[:800]}")
        else:
            report.append("✓ 无运行时错误")
        if n_katex == 0 or n_kerr:
            ok = False
        report.append(f"{'✓' if n_katex and not n_kerr else '✗'} KaTeX 渲染 {n_katex} 处，错误 {n_kerr} 处")
        if raw_math:
            report.append(f"! 正文中仍有 {raw_math} 个未渲染的 $$（检查定界符是否配对）")

        shot_dir = page.parent / "_check"
        shot = pathlib.Path(a.shot).resolve() if a.shot else shot_dir / ("shot-eval.png" if a.eval else "shot.png")
        shot.parent.mkdir(parents=True, exist_ok=True)
        run(base + [f"--window-size={a.width},{a.height}", f"--screenshot={shot}", url])
        report.append(f"📷 截图 {shot}" if shot.exists() else "✗ 截图失败")
        if a.mobile:
            ms = shot.with_name(shot.stem + "-mobile.png")
            run(base + [f"--window-size=420,{a.height * 2}", f"--screenshot={ms}", url])
            report.append(f"📷 移动端截图 {ms}")
        if tmp:
            tmp.unlink(missing_ok=True)

    print("\n".join(report))
    print("\n结果：" + ("通过 ✅" if ok else "未通过 ❌"))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
