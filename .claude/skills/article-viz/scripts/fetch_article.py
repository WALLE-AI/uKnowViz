#!/usr/bin/env python3
"""抓取技术文章正文，保留 LaTeX 公式原文，输出 Markdown 风格纯文本。

用法:
    python fetch_article.py <url> --out <dir>

输出:
    <dir>/article.md   正文（标题、段落、列表、代码块、图片链接、$...$ 公式）
    <dir>/meta.json    {title, url, final_url, site, images, chars, fetched_at}
    <dir>/raw.html     原始 HTML（排查抽取问题用）

特性:
  - 带 Cookie + 浏览器 UA；自动跟随 `window.location.href=...` 这类 JS 跳转
    （kexue.fm 首次访问会先下发 cookie 再 JS 跳转，WebFetch 会 403）
  - 站点规则优先（kexue.fm、知乎专栏、博客园、CSDN、GitHub、通用 <article>）
  - MathJax v2 的 <script type="math/tex"> 会还原为 $...$ / $$...$$
只依赖标准库。
"""
import argparse
import datetime as _dt
import gzip
import html
import http.cookiejar
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

# (域名片段, 正文容器判定, 正文结束标记)
SITE_RULES = [
    ("kexue.fm", lambda t, a: "PostContent" in a.get("class", ""), ["转载到请包括本文地址", "如果您需要引用本文"]),
    ("zhuanlan.zhihu.com", lambda t, a: "Post-RichText" in a.get("class", ""), []),
    ("cnblogs.com", lambda t, a: a.get("id") == "cnblogs_post_body", []),
    ("csdn.net", lambda t, a: a.get("id") == "content_views", []),
    ("github.com", lambda t, a: "markdown-body" in a.get("class", ""), []),
]
GENERIC = [
    lambda t, a: t == "article",
    lambda t, a: re.search(r"\b(post-content|entry-content|article-content|post-body|markdown-body|content-body)\b", a.get("class", "")),
    lambda t, a: t == "main",
]
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SKIP = {"script", "style", "noscript", "nav", "footer", "aside", "form", "button", "svg"}


def fetch(url, tries=4):
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", UA), ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"),
                         ("Accept", "text/html,application/xhtml+xml,*/*;q=0.8"), ("Accept-Encoding", "gzip")]
    last = ""
    for _ in range(tries):
        try:
            resp = opener.open(urllib.request.Request(url, headers={"Referer": url}), timeout=30)
            body, final, ctype = resp.read(), resp.geturl(), resp.headers.get("Content-Type", "")
            enc_hdr = resp.headers.get("Content-Encoding", "")
        except urllib.error.HTTPError as e:  # 有的站首个请求返回 403 但已下发 cookie，重试即可
            body, final, ctype, enc_hdr = e.read(), url, e.headers.get("Content-Type", ""), e.headers.get("Content-Encoding", "")
        if enc_hdr == "gzip" or body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
        m = re.search(r"charset=([\w-]+)", ctype) or re.search(rb'<meta[^>]+charset=["\']?([\w-]+)', body[:3000])
        enc = (m.group(1).decode() if isinstance(m.group(1), bytes) else m.group(1)) if m else "utf-8"
        text = body.decode(enc, errors="replace")
        last = text
        jump = re.search(r"""(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']""", text)
        if len(text) < 3000 and jump:
            url = urllib.parse.urljoin(final, jump.group(1))
            continue
        if len(text) < 3000:
            continue
        return text, final
    return last, url


class Extractor(HTMLParser):
    """在命中正文容器后开始收集，把常见标签转成 Markdown 风格文本。"""

    def __init__(self, base_url, match):
        super().__init__(convert_charrefs=True)
        self.base, self.match = base_url, match
        self.depth = 0          # >0 表示在正文容器内
        self.skip = 0           # >0 表示在需要忽略的子树内
        self.out, self.images = [], []
        self.math = None        # 正在收集的 MathJax script
        self.pre = 0
        self.href = None
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        if tag == "title":
            self._in_title = True
        if self.depth == 0:
            if self.match(tag, a):
                self.depth = 1
            return
        if tag not in VOID:
            self.depth += 1
        if tag == "script" and "math/tex" in a.get("type", ""):
            self.math = {"display": "mode=display" in a.get("type", ""), "buf": []}
            return
        if tag in SKIP:
            self.skip += 1
            return
        if self.skip:
            return
        w = self.out.append
        if re.fullmatch(r"h[1-6]", tag):
            w("\n\n" + "#" * int(tag[1]) + " ")
        elif tag in ("p", "div", "section", "blockquote", "table", "tr"):
            w("\n\n" if tag != "tr" else "\n")
        elif tag == "br":
            w("\n")
        elif tag == "li":
            w("\n- ")
        elif tag in ("td", "th"):
            w(" | ")
        elif tag == "pre":
            self.pre += 1
            w("\n\n```\n")
        elif tag == "code" and not self.pre:
            w("`")
        elif tag == "img":
            src = urllib.parse.urljoin(self.base, a.get("src") or a.get("data-src", ""))
            self.images.append(src)
            w(f"\n![{a.get('alt', '')}]({src})\n")
        elif tag == "a":
            self.href = a.get("href")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        if self.depth == 0:
            return
        if tag == "script" and self.math is not None:
            tex = "".join(self.math["buf"]).strip()
            self.out.append(f"\n\n$${tex}$$\n\n" if self.math["display"] else f"${tex}$")
            self.math = None
        elif tag in SKIP and self.skip:
            self.skip -= 1
        elif not self.skip:
            if tag == "pre":
                self.pre = max(0, self.pre - 1)
                self.out.append("\n```\n")
            elif tag == "code" and not self.pre:
                self.out.append("`")
            elif tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"):
                self.out.append("\n")
        if tag not in VOID:
            self.depth -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self.math is not None:
            self.math["buf"].append(data)
            return
        if self.depth and not self.skip:
            self.out.append(data if self.pre else re.sub(r"[ \t\r\f\v]+", " ", data))


def extract(raw, url):
    host = urllib.parse.urlparse(url).netloc
    rules = [(m, ends) for dom, m, ends in SITE_RULES if dom in host] + [(m, []) for m in GENERIC]
    best = None
    for match, ends in rules:
        ex = Extractor(url, match)
        ex.feed(raw)
        text = "".join(ex.out)
        if len(text.strip()) > 300:
            best = (ex, text, ends)
            break
    if best is None:  # 兜底：整个 body
        ex = Extractor(url, lambda t, a: t == "body")
        ex.feed(raw)
        best = (ex, "".join(ex.out), [])
    ex, text, ends = best
    for e in ends:
        i = text.find(e)
        if i > 0:
            text = text[:i]
    text = html.unescape(text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    title = re.split(r"\s+[-|–_]\s+", ex.title.strip())[0] if ex.title else ""
    return title, text, ex.images


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("--out", required=True, help="输出目录（建议用一个新的空目录）")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    raw, final = fetch(args.url)
    with open(os.path.join(args.out, "raw.html"), "w", encoding="utf-8") as f:
        f.write(raw)
    title, text, images = extract(raw, final)
    with open(os.path.join(args.out, "article.md"), "w", encoding="utf-8") as f:
        f.write(f"# {title}\n\n来源：{args.url}\n\n{text}\n")
    meta = {"title": title, "url": args.url, "final_url": final, "site": urllib.parse.urlparse(final).netloc,
            "images": images, "chars": len(text), "fetched_at": _dt.datetime.now().isoformat(timespec="seconds")}
    with open(os.path.join(args.out, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(meta, ensure_ascii=False, indent=2))
    if len(text) < 500:
        print("\n[警告] 正文过短，可能抽取失败：检查 raw.html，或改用 WebFetch / 浏览器获取。", file=sys.stderr)
        sys.exit(2)
    print(f"\n正文已写入 {os.path.join(args.out, 'article.md')}（{len(text)} 字符）")


if __name__ == "__main__":
    main()
