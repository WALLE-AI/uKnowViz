# 组件库与动画配方（viz-core.js v1）

页面里的 `VIZ` 对象来自 `assets/viz-core.js`，由 scaffold.py 内联进页面。本文件分三部分：

1. [内容类型 → 可视化 对照表](#1-内容类型--可视化-对照表)：先查这里决定画什么
2. [API 速查](#2-api-速查)：怎么画
3. [配方](#3-配方)：常见动画的完整写法（可直接改）

完整的真实范例见 `assets/examples/continuous-softmax-attention.body.html`（7 个可视化，覆盖本文件大部分配方）。

---

## 1. 内容类型 → 可视化 对照表

先问一句：**读者看完这一节，脑子里应该“动”起来的是什么？** 让那个东西在画面上真的动起来。

| 文章里出现的东西 | 推荐可视化 | 关键交互 | 配方 |
|---|---|---|---|
| 求和 ↔ 积分、离散 ↔ 连续 | 柱子渐隐 + 曲线下面积从左扫到右 | 播放器（形变进度） | [A](#a-离散--连续形变) |
| 一个量被拆成几部分 / 权重分配 | 堆叠面积或堆叠柱，A/B 两色 | 滑块改参数，右侧显示比例柱 | [B](#b-面积权重分解) |
| 新定义的函数、恒等式 | 函数曲线 + 竖线游标 + 读数里核对恒等式 | x 滑块 | [C](#c-函数族--游标) |
| 多步代数推导 | `VIZ.stepper` 逐步展开，每步一句“为什么” | 上一步 / 下一步 | [D](#d-公式分步展开) |
| 逐项求和、合并同类项、聚合 | 小块从来源“飞”到目标并堆叠 | 播放器（逐段推进） | [E](#e-飞入堆叠聚合过程) |
| 矩阵（注意力、相关性、转移矩阵） | 并排热力图（基线 / 新方法 / 差值），点击一行看细节 | 点击行、尺度滑块、重采样 | [F](#f-矩阵对比--行检视) |
| 局部算子（卷积、差分、平滑、邻居依赖） | 邻居柱 + 修正后柱 + 近似 vs 精确曲线 | 三个邻居滑块 | 范例 ⑥ |
| 向量、旋转、投影（RoPE、正交化、梯度方向） | 等比例坐标系里的箭头，角度随位置/时间变化 | 角度/位置滑块、播放 | [G](#g-向量与旋转) |
| 迭代算法（优化器、递推、RNN 状态、幂迭代） | 轨迹逐步延伸 + 当前状态读数 | 单步 / 播放 / 重置 / 超参滑块 | [H](#h-迭代轨迹) |
| 分布、采样、损失曲面 | 密度曲线 / 直方图 / 等高线 + 采样点 | 参数滑块、重新采样 | 用 `fn` + `area` + `dot` 组合 |
| 复杂度、显存、速度对比 | 数字卡（`.stat`）或简单柱状图 | 无（静态即可） | 范例 ⑦ 实验卡 |
| 训练曲线但**原文没给数据** | `VIZ.schematic`（自带“示意图”水印） | 播放 | [I](#i-示意曲线) |
| 原文给了实验数据表 | 用原文真实数字画柱/折线，标注“数据来源：原文表 X” | 悬停或读数 | — |

没有合适配方时，用 `VIZ.plot` 的基本图元自己组合，保持同样的配色语义和控件约定即可。

---

## 2. API 速查

### 生命周期（页面脚本的骨架）
```js
const { $, C, fmt } = VIZ;                 // C 是配色（启动后才有值，绘制函数里用即可）
VIZ.onReady(() => VIZ.stepper('st1', steps));   // 一次性初始化（KaTeX 就绪后）
const draw1 = VIZ.onRender(() => { ... });       // 注册绘制：启动/缩放时自动调用
VIZ.slider('r1', draw1);                         // 控件变化时重绘
VIZ.start();                                     // 脚本最后一行
```
- 每个可视化 = **状态对象 S + 一个纯绘制函数 draw**。draw 只读状态、从头重画整张画布，这样缩放、拖动、播放都走同一条路径，不会出现残影。
- 不要在顶层直接调用 draw —— `VIZ.start()` 会在 KaTeX 和配色准备好之后统一调用。

### 数学
| 函数 | 说明 |
|---|---|
| `clamp(x,a,b)` `lerp(a,b,u)` `linspace(a,b,n)` `sum(arr)` | 基础 |
| `softmax(arr)` | `-Infinity` 视为 mask；`logsumexp(arr)` |
| `randn(r?)` `rng(seed)` | 正态随机数；`const r=VIZ.rng(7); VIZ.randn(r)` 可复现 |
| `integrate(f,a,b,n=2000)` | Simpson 数值积分，用来在读数里核对闭式解 |
| `fmt(x,n=4)` `fmtE(x)` | 定宽数字（正数补空格，列对齐） |
| `ease.inOut / out / linear` | 缓动 |

### 颜色
`C.new C.base C.pa C.pb C.approx C.warn C.text C.muted C.dim C.line`，含义见 style-guide.md。
`VIZ.alpha(C.pa, .6)` 加透明度；`VIZ.cmap.seq(u)` 顺序色带；`VIZ.cmap.div(x, m)` 发散色带（负蓝正红）。

### Plot：坐标系 + 图元（全部可链式调用）
```js
const p = VIZ.plot('c1', { x:[0,T], y:[0,ymax], m:{l:46,r:16,t:16,b:30} })
  .axes({ xTicks:'auto'|[...], yTicks:'auto'|[...], xLabel, yLabel, grid:true, zero:true,
         xFmt:v=>..., yFmt:v=>... });   // 刻度文字格式；tickFmt 会同时作用于两轴，一般只想改一轴时用 xFmt/yFmt
```
| 方法 | 用途 |
|---|---|
| `fn(f,{from,to,n,color,width,dash})` | 函数曲线（默认按 y 范围裁剪） |
| `path([[x,y],...],{...})` | 折线 |
| `area(f, g=0, {from,to,fill})` | 两曲线之间填色（g 可以是数或函数） |
| `bar(x,h,{w,dx,base,fill,stroke,dash,label})` | 竖柱；`base` 用于堆叠；`fill:null` 只画框 |
| `dot(x,y,{r,color})` `arrow(x0,y0,x1,y1,{color,label})` | 点、箭头 |
| `vline(x)` `hline(y)` | 参考虚线 |
| `text(s,x,y,{px,align,color,size,bold})` | 文字；`px:true` 表示 x,y 是像素坐标 |
| `X(v) Y(v)` / `sx(d) sy(d)` | 数据 → 像素坐标 / 长度（自己用 `p.ctx` 画特殊形状时用） |

选项：
- `equal:true`：x、y 等比例（向量、旋转、几何图必须开）。
- `box:[x0,y0,x1,y1]` + `keep:true`：在同一画布的一部分再建一个坐标系，用于上下分栏、左右分栏、双 y 轴。第一个 plot 不加 `keep`（它负责清屏），后面的加。

### 热力图
```js
VIZ.heatmap('c5a', M, { mask:(r,c)=>c>r, color:v=>VIZ.cmap.seq(Math.sqrt(v)),
  highlightRow:k, onClick:({r,c})=>{...}, rowLabel:'t ↓', colLabel:'i →', values:false });
```
概率矩阵用 `seq(√v)`（开方让小概率也看得见），有正有负的量用 `div(v, m)`。

### 动画与控件
```js
VIZ.player({ button:'b1', range:'r1', label:'v1', ms:2500, onUpdate:u=>{ S.u=u; draw(); } });
// 按钮=播放/暂停；滑块=手动拖进度（min=0 max=1 step=0.001）；label 显示百分比
VIZ.slider('rX', draw, 2);   // 自动更新 <span class="val" data-for="rX">
VIZ.num('rX');               // 读滑块数值
VIZ.animate(ms, u=>{...});   // 一次性动画（不需要进度条时）
VIZ.readout('o1', html);     // 写读数区（等宽字体；<b> 高亮，.ok/.bad 着色）
```

### 公式分步展开
```js
VIZ.onReady(() => VIZ.stepper('st4', [
  { tex: String.raw`...`, why: '这一步做了什么（大白话）' }, ...
], { onStep: k => { S.step = k; draw(); } }));   // 可选：与画布联动
```
LaTeX 一律用 ``String.raw`...` ``，否则反斜杠会被 JS 吃掉。

### 示意曲线
```js
VIZ.schematic('c7', { y:[lo,hi], progress:u, xLabel, yLabel, marks:[{x:.45,label:'切换点'}],
  curves:[{ name, color:C.base, f:x=>..., dash:[6,4] }, ...] });
```

---

## 3. 配方

### A. 离散 ↔ 连续形变
```js
const sweep = T * Math.min(1, S.m * 1.25);          // 面积从左往右扫
if (sweep > 0) p.area(g, 0, { to: sweep, fill: VIZ.alpha(C.new,.28) }).fn(g, { to: sweep, color: C.new });
const fade = Math.max(0, 1 - S.m * 1.6);              // 柱子同步淡出
for (let i=1;i<=T;i++) p.bar(i, h[i], { w: bw, fill: VIZ.alpha(C.base, .2 + .65*fade) });
```
要点：柱子不要完全消失（保留 0.2 透明度），读者需要对照“原来在哪”。

### B. 面积/权重分解
```js
p.area(partA, 0, { fill: VIZ.alpha(C.pa,.65) })      // 下层：A 部分
 .area(total, partA, { fill: VIZ.alpha(C.pb,.6) })   // 上层：total − A = B 部分
 .fn(total, { color: C.new, width: 2.5 });           // 总轮廓
// 右侧比例柱：同一画布 box 分栏
const q = VIZ.plot('c2', { keep:true, x:[0,1], y:[0,tot*1.15], box:[p.R+30,0,p.w,p.h], m:{l:10,r:110,t:16,b:30} });
q.bar(.4, A, { w:44, fill:VIZ.alpha(C.pa,.85) }).bar(.4, B, { w:44, base:A, fill:VIZ.alpha(C.pb,.85) });
```
读数里同时给出 **闭式解** 和 `VIZ.integrate` 的 **数值积分**，并显示 ✓。

### C. 函数族 + 游标
```js
p.fn(f1,{color:C.new}).fn(f2,{color:C.pa}).fn(f3,{color:C.pb,width:4})
 .fn(x=>f1(x)-f2(x),{color:'rgba(255,255,255,.8)',width:1.4,dash:[5,5]})   // 恒等式另一侧画成虚线叠在上面
 .vline(x0);
[[f1(x0),C.new],[f2(x0),C.pa]].forEach(([y,c]) => p.dot(x0,y,{color:c}));
```
恒等式 = 两条曲线完全重合（粗实线 + 细虚线叠放），这比文字证明直观得多。

### D. 公式分步展开
把原文的多行 `aligned` 推导拆成 3–6 步，每步配一句 why，说明用了哪个技巧（换元、恒等式、下标平移、合并同类项…）。如果有对应的动画，用 `onStep` 让画布跟着步数高亮。

### E. 飞入堆叠（聚合过程）
```js
const P = S.p * N;                                    // N 个来源依次飞
for (let j = 0; j < N; j++) {
  const u = VIZ.clamp(P - j, 0, 1), e = VIZ.ease.inOut(u);
  // 来源区域随 u 变淡：fill 透明度 × (1 - .75*u)
  if (u <= 0) continue;
  const h = bot.sy(share), sx = ..., sy = ..., tx = bot.X(target)-bw/2, ty = bot.Y(stack[target]) - h;
  ctx.fillRect(VIZ.lerp(sx,tx,e), VIZ.lerp(sy,ty,e), bw, h);
  if (u >= 1) stack[target] += share;                 // 落地后才计入堆叠高度
}
```
上下分栏：`top = VIZ.plot(cv,{box:[0,0,W,mid]})`，`bot = VIZ.plot(cv,{keep:true, box:[0,mid,W,H]})`，两者用同一个 y 尺度，飞行块的高度才前后一致。目标位置画基线方法的虚线框（`bar(...,{fill:null, stroke:C.base, dash:[4,3]})`）方便对比。

### F. 矩阵对比 + 行检视
三张热力图：基线 / 新方法 / 差值或修正项，共享 `highlightRow` 与 `onClick`，下方一张柱状图展示选中行（基线绿柱 + 新方法紫柱 + 近似黄线）。读数给出一个**总结性指标**（熵、总变差距离、最大误差），并用 ok/bad 判定。提供“重新采样”和一个改变数据性质的开关（如“独立随机 / 平滑相关”），让读者看到方法在什么条件下差异最大。

### G. 向量与旋转
```js
const p = VIZ.plot('c', { x:[-1.4,1.4], y:[-1.4,1.4], equal:true }).axes({ zero:true });
const R = (v, th) => [v[0]*Math.cos(th) - v[1]*Math.sin(th), v[0]*Math.sin(th) + v[1]*Math.cos(th)];
const q = R(q0, m*theta), k = R(k0, n*theta);
p.arrow(0,0,...q,{color:C.new,label:'q_m'}).arrow(0,0,...k,{color:C.pb,label:'k_n'});
// 读数：q·k 只取决于 m−n —— 拖动 m、n 同时增加时数值不变（RoPE 的核心性质）
```

### H. 迭代轨迹
```js
const S = { hist:[x0], k:0 };
const step = () => { S.hist.push(update(S.hist.at(-1))); draw(); };
// draw：等高线/目标函数背景 → path(S.hist) → dot(当前点) → 读数（第 k 步、损失、梯度范数）
// 控件：单步 / 播放（VIZ.animate 内按帧调用 step）/ 重置 / 学习率等超参滑块
```
对比两种算法时，同一背景上画两条不同颜色的轨迹（基线绿、新方法紫）。

**页面内的数值搜索（求最优点、驻点）要稳**：固定步长在陡峭的峡谷里会来回震荡，停在“看似最优”的地方，导致核对读数误报 ✗。用自适应步长（目标值变大就拒绝这一步并把步长减半，否则接受并放大 1.2 倍），以梯度范数 < 1e-7 作为停止条件；给动画用的轨迹另加单步上限（如 0.06），让画面平滑，求最优点时不加上限。结果用 Map 按参数缓存，避免每帧重算。批量实验（如“200 个随机例子”）先在 readout 显示“计算中…”，再用 `setTimeout` 执行。

### I. 示意曲线
仅当原文**只有文字描述没有数字**时使用。曲线形状必须忠实于文字（例如“前期好、后期重合”就要真的在末端重合），并在图下放 `<p class="schematic-note">…</p>` 说明依据的是原文哪句话。
