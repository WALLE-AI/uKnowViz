/* viz-core.js — uKnowViz 共享可视化运行时 v1
 * 无依赖（KaTeX 可选）。全部挂在全局 VIZ 上。API 说明见 references/components.md
 *
 *  数学      VIZ.clamp lerp linspace sum softmax logsumexp randn rng fmt fmtE integrate ease
 *  颜色      VIZ.C（从 CSS 变量读取） VIZ.alpha(hex,a) VIZ.cmap.seq(u) VIZ.cmap.div(x,m)
 *  画布      VIZ.plot(canvas, opts) → Plot（坐标映射 + 轴 + 线/面/柱/点/箭头/文字）
 *            VIZ.heatmap(canvas, M, opts)
 *  动画      VIZ.animate(ms, onFrame, onDone) VIZ.player({...})
 *  控件      VIZ.slider(id, cb, digits) VIZ.num(id) VIZ.readout(id, html) VIZ.$(id)
 *  组件      VIZ.stepper(el, steps) VIZ.schematic(canvas, opts)
 *  生命周期  VIZ.onReady(fn) VIZ.onRender(fn) VIZ.redraw() VIZ.start()
 */
(function (global) {
  'use strict';
  const VIZ = {};
  const $ = id => (typeof id === 'string' ? document.getElementById(id) : id);
  VIZ.$ = $;

  /* ============ 数学 ============ */
  VIZ.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  VIZ.lerp = (a, b, u) => a + (b - a) * u;
  VIZ.linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
  VIZ.sum = arr => arr.reduce((s, x) => s + x, 0);
  VIZ.logsumexp = arr => {
    const f = arr.filter(Number.isFinite); if (!f.length) return -Infinity;
    const m = Math.max(...f); return m + Math.log(VIZ.sum(f.map(x => Math.exp(x - m))));
  };
  /** softmax，-Infinity 视为被 mask（权重 0） */
  VIZ.softmax = arr => {
    const lse = VIZ.logsumexp(arr);
    return arr.map(x => (Number.isFinite(x) ? Math.exp(x - lse) : 0));
  };
  /** 可复现随机数：const r = VIZ.rng(42); r() ∈ [0,1) */
  VIZ.rng = seed => {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };
  /** 标准正态；可传入 VIZ.rng 生成器以复现 */
  VIZ.randn = (r = Math.random) => {
    let u = 0, v = 0; while (!u) u = r(); while (!v) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  /** 定宽数字：正数前补空格，使读数列对齐 */
  VIZ.fmt = (x, n = 4) => (!Number.isFinite(x) ? String(x) : (x >= 0 ? ' ' : '') + x.toFixed(n));
  VIZ.fmtE = (x, n = 1) => x.toExponential(n);
  /** 数值积分（复合 Simpson，n 取偶数），用于在页面上核对闭式解 */
  VIZ.integrate = (f, a, b, n = 2000) => {
    if (n % 2) n++; const h = (b - a) / n; let s = f(a) + f(b);
    for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
    return s * h / 3;
  };
  VIZ.ease = {
    inOut: u => (u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
    out: u => 1 - Math.pow(1 - u, 3),
    linear: u => u,
  };

  /* ============ 颜色 ============ */
  VIZ.C = {};
  function loadPalette() {
    const cs = getComputedStyle(document.documentElement);
    ['bg', 'panel', 'panel2', 'line', 'text', 'muted', 'dim', 'new', 'base', 'pa', 'pb', 'approx', 'warn']
      .forEach(k => { VIZ.C[k] = cs.getPropertyValue('--' + k).trim(); });
  }
  /** '#rgb' / '#rrggbb' → rgba 字符串 */
  VIZ.alpha = (hex, a) => {
    let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const SEQ = [[13, 8, 135], [84, 2, 163], [139, 10, 165], [185, 50, 137], [219, 92, 104], [244, 136, 73], [254, 188, 43], [240, 249, 33]];
  VIZ.cmap = {
    /** 顺序色带（plasma 近似），u∈[0,1] */
    seq(u) {
      u = VIZ.clamp(u, 0, 1) * (SEQ.length - 1); const i = Math.floor(u), f = u - i;
      const c0 = SEQ[i], c1 = SEQ[Math.min(i + 1, SEQ.length - 1)];
      return `rgb(${c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',')})`;
    },
    /** 发散色带：负→蓝，0→深底色，正→红；m 为饱和值 */
    div(x, m = 1) {
      const u = VIZ.clamp(x / m, -1, 1);
      return u >= 0 ? `rgb(${Math.round(30 + 225 * u)},${Math.round(34 + 30 * u)},${Math.round(64 + 10 * u)})`
        : `rgb(${Math.round(30 - 10 * u)},${Math.round(34 - 100 * u)},${Math.round(64 - 180 * u)})`;
    },
  };

  /* ============ 画布 ============ */
  /** HiDPI 适配；每次重绘前调用（同时清空画布） */
  VIZ.setup = cv => {
    cv = $(cv);
    const dpr = global.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '12px Consolas, Menlo, monospace'; ctx.lineJoin = 'round';
    return { ctx, w, h, cv };
  };

  class Plot {
    /**
     * opts.x=[x0,x1], opts.y=[y0,y1]   数据坐标范围
     * opts.m={l,r,t,b}                 边距(px)
     * opts.equal=true                  等比例（旋转、几何图）
     * opts.box=[px0,py0,px1,py1]       只占画布的一部分（上下分栏时用）
     * opts.keep=true                   不清空画布，在同一画布上叠加第二个坐标系（双 y 轴 / 分栏）
     */
    constructor(cv, opts = {}) {
      const el = $(cv);
      Object.assign(this, opts.keep ? { ctx: el.getContext('2d'), w: el.clientWidth, h: el.clientHeight, cv: el } : VIZ.setup(el));
      const m = Object.assign({ l: 46, r: 16, t: 16, b: 30 }, opts.m || {});
      const box = opts.box || [0, 0, this.w, this.h];
      this.L = box[0] + m.l; this.R = box[2] - m.r; this.T = box[1] + m.t; this.B = box[3] - m.b;
      this.x = (opts.x || [0, 1]).slice(); this.y = (opts.y || [0, 1]).slice();
      if (opts.equal) {
        const sx = (this.R - this.L) / (this.x[1] - this.x[0]), sy = (this.B - this.T) / (this.y[1] - this.y[0]);
        const s = Math.min(sx, sy), cx = (this.x[0] + this.x[1]) / 2, cy = (this.y[0] + this.y[1]) / 2;
        const hw = (this.R - this.L) / s / 2, hh = (this.B - this.T) / s / 2;
        this.x = [cx - hw, cx + hw]; this.y = [cy - hh, cy + hh];
      }
    }
    X(v) { return this.L + (this.R - this.L) * (v - this.x[0]) / (this.x[1] - this.x[0]); }
    Y(v) { return this.B - (this.B - this.T) * (v - this.y[0]) / (this.y[1] - this.y[0]); }
    /** 像素长度 ↔ 数据长度 */
    sx(d) { return d * (this.R - this.L) / (this.x[1] - this.x[0]); }
    sy(d) { return d * (this.B - this.T) / (this.y[1] - this.y[0]); }
    _style(o, defColor) {
      const c = this.ctx; c.strokeStyle = o.color || defColor || VIZ.C.text; c.lineWidth = o.width || 2;
      c.setLineDash(o.dash || []); c.globalAlpha = o.alpha == null ? 1 : o.alpha;
    }
    _reset() { this.ctx.setLineDash([]); this.ctx.globalAlpha = 1; }
    /** 坐标轴。o.xTicks/yTicks: 数组或 'auto'；o.xFmt/yFmt: 刻度文字格式（o.tickFmt 同时作用于两轴）；
     *  o.xLabel/yLabel；o.grid；o.zero（画 y=0 / x=0 线） */
    axes(o = {}) {
      const c = this.ctx, C = VIZ.C;
      const ticks = (t, r) => (t === 'auto' ? niceTicks(r[0], r[1], 5) : t || []);
      const xt = ticks(o.xTicks, this.x), yt = ticks(o.yTicks, this.y);
      c.strokeStyle = C.line; c.lineWidth = 1;
      if (o.grid) {
        c.globalAlpha = .45;
        xt.forEach(v => { c.beginPath(); c.moveTo(this.X(v), this.T); c.lineTo(this.X(v), this.B); c.stroke(); });
        yt.forEach(v => { c.beginPath(); c.moveTo(this.L, this.Y(v)); c.lineTo(this.R, this.Y(v)); c.stroke(); });
        c.globalAlpha = 1;
      }
      c.beginPath(); c.moveTo(this.L, this.T); c.lineTo(this.L, this.B); c.lineTo(this.R, this.B); c.stroke();
      if (o.zero) {
        c.setLineDash([3, 4]);
        if (this.y[0] < 0 && this.y[1] > 0) { c.beginPath(); c.moveTo(this.L, this.Y(0)); c.lineTo(this.R, this.Y(0)); c.stroke(); }
        if (this.x[0] < 0 && this.x[1] > 0) { c.beginPath(); c.moveTo(this.X(0), this.T); c.lineTo(this.X(0), this.B); c.stroke(); }
        c.setLineDash([]);
      }
      c.fillStyle = C.muted; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const def = v => +v.toFixed(3), xf = o.xFmt || o.tickFmt || def, yf = o.yFmt || o.tickFmt || def;
      xt.forEach(v => c.fillText(xf(v), this.X(v), this.B + 16));
      c.textAlign = 'right'; yt.forEach(v => c.fillText(yf(v), this.L - 6, this.Y(v) + 4));
      if (o.xLabel) { c.textAlign = 'right'; c.fillText(o.xLabel, this.R, this.B - 6); }
      if (o.yLabel) { c.textAlign = 'left'; c.fillText(o.yLabel, this.L + 6, this.T + 10); }
      return this;
    }
    /** 函数曲线 y=f(x)。o.from/o.to/o.n/o.color/o.width/o.dash/o.clip(默认 true：超出 y 范围截断) */
    fn(f, o = {}) {
      const a = o.from ?? this.x[0], b = o.to ?? this.x[1], n = o.n || 300;
      const pts = []; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; pts.push([x, f(x)]); }
      return this.path(pts, o);
    }
    /** 折线（数据坐标点数组 [[x,y],...]） */
    path(pts, o = {}) {
      const c = this.ctx, clip = o.clip !== false; this._style(o, VIZ.C.new);
      if (clip) { c.save(); c.beginPath(); c.rect(this.L, this.T - 2, this.R - this.L, this.B - this.T + 4); c.clip(); }
      c.beginPath(); let started = false;
      for (const [x, y] of pts) {
        if (!Number.isFinite(y)) { started = false; continue; }
        const px = this.X(x), py = this.Y(y); started ? c.lineTo(px, py) : c.moveTo(px, py); started = true;
      }
      c.stroke(); if (clip) c.restore(); this._reset(); return this;
    }
    /** 两曲线间填色：f 上沿，g 下沿（默认 0）。o.fill/o.from/o.to */
    area(f, g = 0, o = {}) {
      const c = this.ctx, a = o.from ?? this.x[0], b = o.to ?? this.x[1], n = o.n || 200;
      const gf = typeof g === 'function' ? g : () => g;
      c.beginPath();
      for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; const p = [this.X(x), this.Y(f(x))]; i ? c.lineTo(...p) : c.moveTo(...p); }
      for (let i = n; i >= 0; i--) { const x = a + (b - a) * i / n; c.lineTo(this.X(x), this.Y(gf(x))); }
      c.closePath(); c.fillStyle = o.fill || VIZ.alpha(VIZ.C.new, .3); c.fill(); return this;
    }
    /** 竖直柱：中心 x，高度 h（数据单位），o.w 像素宽，o.base 底部，o.fill/o.stroke/o.dash/o.label */
    bar(x, h, o = {}) {
      const c = this.ctx, w = o.w || 14, base = o.base || 0;
      const x0 = this.X(x) - w / 2 + (o.dx || 0), y0 = this.Y(base + Math.max(h, 0)), y1 = this.Y(base + Math.min(h, 0));
      if (o.fill !== null) { c.fillStyle = o.fill || VIZ.alpha(VIZ.C.base, .85); c.fillRect(x0, y0, w, y1 - y0); }
      if (o.stroke) { c.strokeStyle = o.stroke; c.lineWidth = o.lineWidth || 1.5; c.setLineDash(o.dash || []); c.strokeRect(x0, y0, w, y1 - y0); c.setLineDash([]); }
      if (o.label != null) { c.fillStyle = o.labelColor || VIZ.C.muted; c.textAlign = 'center'; c.fillText(o.label, x0 + w / 2, h >= 0 ? y0 - 4 : y1 + 12); }
      return this;
    }
    dot(x, y, o = {}) {
      const c = this.ctx; c.fillStyle = o.color || VIZ.C.text; c.globalAlpha = o.alpha ?? 1;
      c.beginPath(); c.arc(this.X(x), this.Y(y), o.r || 4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; return this;
    }
    /** 箭头（数据坐标），向量/梯度/旋转演示用 */
    arrow(x0, y0, x1, y1, o = {}) {
      const c = this.ctx, p0 = [this.X(x0), this.Y(y0)], p1 = [this.X(x1), this.Y(y1)];
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), hs = o.head || 9;
      this._style(o, VIZ.C.text); c.beginPath(); c.moveTo(...p0); c.lineTo(...p1); c.stroke(); this._reset();
      c.fillStyle = o.color || VIZ.C.text; c.beginPath(); c.moveTo(...p1);
      c.lineTo(p1[0] - hs * Math.cos(ang - .4), p1[1] - hs * Math.sin(ang - .4));
      c.lineTo(p1[0] - hs * Math.cos(ang + .4), p1[1] - hs * Math.sin(ang + .4)); c.closePath(); c.fill();
      if (o.label) { c.textAlign = 'left'; c.fillText(o.label, p1[0] + 6, p1[1] - 6); }
      return this;
    }
    vline(x, o = {}) { return this.path([[x, this.y[0]], [x, this.y[1]]], Object.assign({ color: VIZ.C.dim, width: 1, dash: [3, 4] }, o)); }
    hline(y, o = {}) { return this.path([[this.x[0], y], [this.x[1], y]], Object.assign({ color: VIZ.C.dim, width: 1, dash: [3, 4] }, o)); }
    /** 文字（数据坐标）。o.px=true 时 x,y 为像素坐标；o.align/o.color/o.size/o.bold */
    text(s, x, y, o = {}) {
      const c = this.ctx; c.fillStyle = o.color || VIZ.C.muted; c.textAlign = o.align || 'center';
      if (o.size || o.bold) c.font = `${o.bold ? 'bold ' : ''}${o.size || 12}px Consolas, Menlo, "Microsoft YaHei", monospace`;
      c.fillText(s, o.px ? x : this.X(x), o.px ? y : this.Y(y));
      c.font = '12px Consolas, Menlo, monospace'; return this;
    }
  }
  function niceTicks(a, b, n) {
    const span = b - a, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 5, 10].map(k => k * mag).find(s => span / s <= n) || 10 * mag;
    const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toFixed(10)); return out;
  }
  VIZ.niceTicks = niceTicks;
  VIZ.Plot = Plot;
  VIZ.plot = (cv, opts) => new Plot(cv, opts);

  /**
   * 热力图。M 为二维数组（行×列）。
   * opts.color(v,r,c) → css 颜色（默认 seq(√v)）
   * opts.mask(r,c) → true 表示不可见（如因果遮罩）
   * opts.highlightRow / highlightCol：白框高亮
   * opts.onClick({r,c})：点击回调（自动绑定一次）
   * opts.rowLabel/colLabel：轴说明；opts.values=true 时在格子里写数值
   */
  VIZ.heatmap = (cv, M, opts = {}) => {
    const { ctx, w, h } = VIZ.setup(cv); cv = $(cv);
    const R = M.length, Cn = Math.max(...M.map(r => r.length)), pad = opts.pad ?? 22;
    const cs = Math.min((w - pad - 6) / Cn, (h - pad - 8) / R), ox = pad + ((w - pad - 6) - cs * Cn) / 2, oy = 4;
    const color = opts.color || (v => VIZ.cmap.seq(Math.sqrt(Math.max(0, v))));
    for (let r = 0; r < R; r++) for (let c = 0; c < Cn; c++) {
      const x = ox + c * cs, y = oy + r * cs, v = M[r][c];
      ctx.fillStyle = (opts.mask && opts.mask(r, c)) || v == null ? '#0b0e1c' : color(v, r, c);
      ctx.fillRect(x, y, cs - 1, cs - 1);
      if (opts.values && v != null && !(opts.mask && opts.mask(r, c)) && cs > 22) {
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '10px Consolas';
        ctx.fillText(typeof opts.values === 'function' ? opts.values(v) : v.toFixed(2), x + cs / 2, y + cs / 2 + 3);
      }
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    if (opts.highlightRow != null) ctx.strokeRect(ox - 1, oy + opts.highlightRow * cs - 1, Cn * cs + 1, cs + 1);
    if (opts.highlightCol != null) ctx.strokeRect(ox + opts.highlightCol * cs - 1, oy - 1, cs + 1, R * cs + 1);
    ctx.fillStyle = VIZ.C.muted; ctx.textAlign = 'center'; ctx.font = '10px Consolas';
    if (opts.colLabel) ctx.fillText(opts.colLabel, ox + Cn * cs / 2, oy + R * cs + 14);
    if (opts.rowLabel) { ctx.save(); ctx.translate(10, oy + R * cs / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(opts.rowLabel, 0, 0); ctx.restore(); }
    cv._vizHeat = { ox, oy, cs, R, Cn, onClick: opts.onClick };
    if (opts.onClick) { cv.classList.add('clickable'); }
    if (!cv._vizHeatBound) {
      cv._vizHeatBound = true;
      cv.addEventListener('click', e => {
        const g = cv._vizHeat; if (!g || !g.onClick) return; const b = cv.getBoundingClientRect();
        const c = Math.floor((e.clientX - b.left - g.ox) / g.cs), r = Math.floor((e.clientY - b.top - g.oy) / g.cs);
        if (r >= 0 && r < g.R && c >= 0 && c < g.Cn) g.onClick({ r, c });
      });
    }
    return cv._vizHeat;
  };

  /* ============ 动画 ============ */
  /** 跑一段 ms 毫秒的动画，onFrame(u∈[0,1])；返回取消函数 */
  VIZ.animate = (ms, onFrame, onDone) => {
    let stop = false; const t0 = performance.now();
    const step = now => { if (stop) return; const u = Math.min(1, (now - t0) / ms); onFrame(u); u < 1 ? requestAnimationFrame(step) : onDone && onDone(); };
    requestAnimationFrame(step); return () => { stop = true; };
  };
  /**
   * 播放器：把「播放按钮 + 进度滑块 + 数值标签」绑定成一个可拖动、可播放的时间轴。
   * VIZ.player({ button:'id', range:'id', label:'id'(可选), ms:2500, from:0(可选，从头播放的起点), onUpdate:u=>draw(u) })
   * 返回 { set(u), play(), get() }。滑块需 min=0 max=1 step=0.001。
   */
  VIZ.player = o => {
    let u = 0, cancel = null; const btn = $(o.button), rg = $(o.range), lb = o.label && $(o.label);
    const txt = btn ? btn.textContent : '';
    const set = v => { u = v; if (rg) rg.value = v; if (lb) lb.textContent = Math.round(v * 100) + '%'; o.onUpdate(v); };
    const stopIt = () => { if (cancel) cancel(); cancel = null; if (btn) btn.textContent = txt; };
    const play = () => {
      if (cancel) { stopIt(); return; }
      const start = u >= 1 ? (o.from || 0) : u; if (btn) btn.textContent = '⏸ 暂停';
      cancel = VIZ.animate(o.ms * (1 - start), k => set(start + (1 - start) * k), stopIt);
    };
    if (btn) btn.addEventListener('click', play);
    if (rg) rg.addEventListener('input', e => { stopIt(); set(+e.target.value); });
    return { set, play, get: () => u };
  };

  /* ============ 控件 ============ */
  VIZ.num = id => +$(id).value;
  /**
   * 绑定滑块：自动更新 <span class="val" data-for="id"> 的显示，并在 input 时调用 cb(value)。
   * 不会立刻调用 cb（首帧由 VIZ.onRender 统一绘制）。
   */
  VIZ.slider = (id, cb, digits = 2) => {
    const el = $(id), out = document.querySelector(`.val[data-for="${id}"]`);
    const show = () => { if (out) out.textContent = (+el.value).toFixed(digits); };
    el.addEventListener('input', () => { show(); cb && cb(+el.value); }); show();
    return el;
  };
  VIZ.readout = (id, html) => { $(id).innerHTML = html; };

  /* ============ 组件 ============ */
  /**
   * 公式分步展开器：逐行显示推导，每步一句“为什么”。
   * steps: [{tex:'...LaTeX...', why:'这一步做了什么'}]
   * 容器内自动生成 ◀ ▶ 按钮；需要 KaTeX。
   */
  VIZ.stepper = (el, steps, opts = {}) => {
    el = $(el); el.classList.add('stepper'); el.innerHTML = '';
    const rows = steps.map(s => {
      const d = document.createElement('div'); d.className = 'step hidden';
      const m = document.createElement('div');
      try { global.katex.render(s.tex, m, { displayMode: true, throwOnError: false }); } catch (e) { m.textContent = s.tex; }
      d.appendChild(m);
      if (s.why) { const w = document.createElement('div'); w.className = 'why'; w.innerHTML = '↳ ' + s.why; d.appendChild(w); }
      el.appendChild(d); return d;
    });
    const bar = document.createElement('div'); bar.className = 'controls';
    bar.innerHTML = `<button data-a="prev">◀ 上一步</button><button class="primary" data-a="next">下一步 ▶</button><button data-a="all">全部展开</button><span class="note"></span>`;
    el.appendChild(bar);
    let k = opts.start ?? 0;
    const show = () => {
      rows.forEach((r, i) => { r.classList.toggle('hidden', i > k); r.classList.toggle('cur', i === k); });
      bar.querySelector('.note').textContent = `第 ${k + 1} / ${rows.length} 步`;
      opts.onStep && opts.onStep(k);
    };
    bar.addEventListener('click', e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'prev') k = Math.max(0, k - 1); if (a === 'next') k = Math.min(rows.length - 1, k + 1); if (a === 'all') k = rows.length - 1;
      show();
    });
    show(); return { go: i => { k = i; show(); } };
  };

  /**
   * 示意曲线（原文没有给数据时使用），永远带“示意图，非原文数据”水印。
   * opts: { curves:[{name,color,f,dash}], progress:0..1, x:[0,1], y:[lo,hi], xLabel, yLabel, marks:[{x,label}] }
   */
  VIZ.schematic = (cv, o) => {
    const legendW = 150, p = VIZ.plot(cv, { x: o.x || [0, 1], y: o.y, m: { l: 40, r: legendW, t: 16, b: 30 } });
    p.axes({ xLabel: o.xLabel, yLabel: o.yLabel });
    const prog = o.progress ?? 1, [x0, x1] = p.x;
    (o.marks || []).forEach(m => { if ((m.x - x0) / (x1 - x0) <= prog) { p.vline(m.x); p.text(m.label, m.x, p.y[1], { color: VIZ.C.dim }); } });
    o.curves.forEach((cv_, k) => {
      p.fn(cv_.f, { color: cv_.color, dash: cv_.dash, width: 2.2, to: x0 + (x1 - x0) * prog });
      const c = p.ctx; c.fillStyle = cv_.color; c.fillRect(p.R + 16, p.T + 8 + k * 22, 14, 3);
      c.textAlign = 'left'; c.fillText(cv_.name, p.R + 36, p.T + 13 + k * 22);
    });
    p.text('示意图，非原文数据', p.R - 4, p.B - 8, { px: true, align: 'right', color: VIZ.C.warn });
    return p;
  };

  /* ============ 生命周期 ============ */
  const renders = [], readies = [];
  /** 注册绘制函数：启动时、窗口缩放时自动重绘 */
  VIZ.onRender = fn => { renders.push(fn); return fn; };
  /** 注册一次性初始化（KaTeX 就绪后、首次绘制前执行；VIZ.stepper 应放在这里创建） */
  VIZ.onReady = fn => { readies.push(fn); return fn; };
  VIZ.redraw = () => renders.forEach(fn => { try { fn(); } catch (e) { reportError(e); } });

  const KATEX_CDN = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/';
  function loadScript(src) {
    return new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  }
  /** 本地 _lib/katex 加载失败时自动回退 CDN */
  async function ensureKatex() {
    if (global.katex && global.renderMathInElement) return true;
    try {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = KATEX_CDN + 'katex.min.css'; document.head.appendChild(l);
      if (!global.katex) await loadScript(KATEX_CDN + 'katex.min.js');
      if (!global.renderMathInElement) await loadScript(KATEX_CDN + 'contrib/auto-render.min.js');
      return true;
    } catch (e) { reportError(new Error('KaTeX 加载失败：公式将以源码显示')); return false; }
  }
  function reportError(e) {
    const msg = (e && (e.message || e.reason || e)) + '';
    const root = document.documentElement; root.dataset.vizErrors = ((root.dataset.vizErrors || '') + msg + ' | ').slice(0, 2000);
    let bar = document.getElementById('viz-errors');
    if (!bar && document.body) { bar = document.createElement('div'); bar.id = 'viz-errors'; document.body.appendChild(bar); }
    if (bar) { bar.style.display = 'block'; bar.textContent += '⚠ ' + msg + '\n'; }
    console.error(e);
  }
  global.addEventListener('error', e => reportError(e.error || e.message));
  global.addEventListener('unhandledrejection', e => reportError(e.reason));

  /** 页面脚本最后调用：渲染公式 → 读取配色 → 首次绘制 → 监听缩放 */
  VIZ.start = () => {
    const go = async () => {
      loadPalette();
      if (await ensureKatex()) {
        global.renderMathInElement(document.body, {
          delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
          throwOnError: false, ignoredClasses: ['readout', 'no-math'],
        });
      }
      readies.forEach(fn => { try { fn(); } catch (e) { reportError(e); } });
      VIZ.redraw();
      document.documentElement.dataset.vizReady = '1';
    };
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
    let t; global.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(VIZ.redraw, 120); });
  };

  global.VIZ = VIZ;
})(window);
