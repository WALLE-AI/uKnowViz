---
name: article-viz
description: 把技术/数学/AI 文章（如 kexue.fm 科学空间、arXiv 论文解读、技术博客）做成交互式动画科普网页：抓取原文 → 拆解推导 → 用统一的动画组件库和 UI 规范生成单页 HTML（含公式、可拖动动画、数值验证、“通俗地说”解释、术语表），并更新项目目录页。用户只发来一个技术文章链接（如 https://kexue.fm/archives/xxxx）而没有其他说明时，默认就是要做这种解读页，应直接使用本技能；给出文章链接或内容并提到“可视化”“动画演示”“画图解释”“做成网页/html”“科普一下”“讲给外行听”“帮我看懂这篇”，或说“再做一篇”“这篇也照样做”时同样使用。
---

# article-viz：技术文章 → 交互动画科普页

一篇好的解读页让两类读者都满意：专业读者能对照原文公式、亲手验证推导；外行读者只看动画和绿色的“通俗地说”框，也能明白文章做了什么、为什么有意思。所有页面共用一套组件和配色，读者读过一篇，下一篇就不用重新学“紫色代表什么”。

## 目录约定（项目根目录 = 包含 `index.html` 与 `_lib/` 的目录）

```
<root>/
├── index.html                 # 目录页（build_index.py 自动生成，勿手改）
├── _lib/katex/                # 本地 KaTeX（vendor_katex.py 下载，所有页面共享）
└── <slug>/
    ├── index.html             # 解读页（单文件，viz-core 已内联）
    ├── _src/                  # article.md / meta.json / outline.json（出处与大纲）
    └── _check/                # 自检截图（已 gitignore）
```
`<slug>` 用英文短横线，概括主题（如 `continuous-softmax-attention`），不要用文章编号。

脚本均位于 `.claude/skills/article-viz/scripts/`，下文简写为 `$S`。所有命令在项目根目录执行。

## 工作流程

### 1. 抓取原文
```bash
python -I $S/fetch_article.py <url> --out <tmpdir>      # 新建一个空的临时目录
```
- 输出 `article.md`（保留 LaTeX 原文）和 `meta.json`。脚本会处理 cookie 和 JS 跳转（kexue.fm 用 WebFetch 会 403，用这个脚本就能取到）。
- 退出码 2 表示正文过短，可能抽取失败：先看 `raw.html`，再试 WebFetch；PDF 用 Read 读取。
- **完整读一遍 article.md**。所有公式都从这里复制，不要凭记忆重打。

### 2. 拆解文章，写大纲
阅读 `references/content-analysis.md`，把核心问题、推导链、结论、实验、术语拆出来，决定章节和每节的可视化（查 `references/components.md` 第 1 节对照表），写成 `<slug>/_src/outline.json`。

动手写代码前，给每一节回答一个问题：**读者应该看到什么在动？**回答不出来的节，就并到相邻章节里去。

**先用 node 跑原型，再写解释文字。**如果页面要展示数值实验（随机例子、搜索最优解、统计比例），先把核心数学写成一个独立的 `.js`，在 node 里多跑几个随机种子，看结论是否稳定、有没有反例、计算要多久。文字只写已经算出来的结果，否则很容易把作者的猜测写成“动画证明了……”。抽象的矩阵类文章可以缩到 2×2：正交矩阵就是旋转角，整个搜索空间能画成一张地形图（范例见 `adam-to-muon-orthogonal-slowest-descent`）。

### 3. 生成骨架
```bash
python -I $S/scaffold.py --slug <slug> --title "<中文标题>" --source-url <url> \
  --source-title "<原文标题>" --author "<作者（站点）>" \
  --hook "<一句钩子：提出问题>" --summary "<一句话结论，用于目录卡片>" --tags "A,B"
```
它会生成 `<slug>/index.html`（内联 viz-core 当前版本），确保本地 KaTeX 存在，并重建目录页。然后把 `<tmpdir>` 里的 `article.md`、`meta.json` 移到 `<slug>/_src/`。

### 4. 填充页面
开始前阅读：
- `references/style-guide.md`：页面结构、章节解剖、配色语义、控件约定
- `references/components.md`：VIZ API 与动画配方
- `references/pedagogy.md`：怎么写“通俗地说”
- `assets/examples/continuous-softmax-attention.body.html`：完整范例，遇到不确定的写法时照着它来

只修改骨架中标了 TODO 的区域，以及“页面脚本”和“页面专属样式”。viz-core 的内联快照不要手改：需要新能力时，改 `assets/viz-core.js`（保持向后兼容），让以后所有页面都受益；然后用 `python -I $S/update_core.py <slug>/index.html` 把新版本同步进页面（`--all` 同步全部页面，之后逐个重跑 check_page）。

每个可视化都写成「状态 S + 纯绘制函数 draw」，用 `VIZ.onRender` 注册，脚本最后一行是 `VIZ.start()`。

### 5. 自检
```bash
python -I $S/check_page.py <slug>/index.html [--height 10000]
```
它会检查 JS 语法、运行时错误、KaTeX 渲染情况和 TODO 残留，并在 `<slug>/_check/shot.png` 截取整页。**用 Read 查看截图**。整页太长看不清时，用 PIL 裁剪出各章节分别查看。重点看：
- 每个画布的首帧有没有信息量，文字是否重叠、越界
- 图例颜色是否与画面一致，读数是否显示 ✓
- 动画中间状态是否正确：可以临时把某个播放器的初值改成 0.5 截图确认，确认后改回

检查动画中间帧时用 `--eval` 在 `VIZ.start()` 前注入状态，不用改页面本身：
```bash
python -I $S/check_page.py <slug>/index.html --eval "S1.u=0.5; S4.p=0.6;"   # 截图写到 _check/shot-eval.png
```
有错误就修，直到结果为“通过 ✅”。

### 6. 交付
- 如果修改了标题或摘要，重新运行 `python -I $S/build_index.py .` 更新目录页。
- 告诉用户：页面路径、章节清单（每节演示了什么）、哪些图是示意图（原文无数据），以及任何未能核实的地方。

## 原则（以及为什么）

- **公式忠于原文**：读者会拿原文对照，一处抄错就会让人怀疑整页。LaTeX 从 article.md 复制；改写为分步推导时逐步核对。
- **数字现场计算，并尽量核对**：读数里放“闭式解 vs 数值积分”“恒等式两侧”“近似 vs 精确”和 ✓。这样读者会相信，你自己也能在第一时间发现推导或代码的错误。
- **不编造数据**：原文没有给数字的实验，只能用 `VIZ.schematic` 画示意（自带水印），并在图下注明依据原文哪句话。作者的“猜测”在页面上也要写成猜测。
- **动画服务于结论**：每个动起来的东西都必须对应文章中的一个说法。纯装饰的动画会分散注意力。
- **首帧即有信息、处处可拖动**：很多读者不会点播放；能拖动进度条的读者会停在关键帧仔细看。
- **配色和控件全站统一**：按 style-guide 的语义使用颜色，不为单篇另起配色。
- **科普层要准确**：比喻必须结构同构（见 pedagogy.md 对应表），宁可说“这个比喻在 X 处不成立”，也不要让外行带走错误理解。

## 参考文件索引

| 文件 | 何时读 |
|---|---|
| `references/content-analysis.md` | 第 2 步：拆解文章、写大纲、规划章节 |
| `references/components.md` | 第 2、4 步：选可视化、查 API 与配方 |
| `references/style-guide.md` | 第 4 步：页面结构、配色、控件、读数规范 |
| `references/pedagogy.md` | 第 4 步：写 ⓪ 大白话版、通俗地说、小结、术语表 |
| `assets/examples/continuous-softmax-attention.body.html` | 第 4 步：完整范例（7 个可视化 + 全部文字层） |
| `assets/viz-core.js` / `viz-core.css` | 需要扩展组件库时（改完运行 `scripts/update_core.py`） |
