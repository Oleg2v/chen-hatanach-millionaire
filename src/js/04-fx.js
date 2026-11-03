/* 04-fx.js — canvas particle FX.
   Background (#bg-canvas, viewport px): rising book-cubes in three depth layers + twinkling dust and bokeh.
   Overlay (#fx-canvas, callers pass STAGE coords 1920×1080): confetti, sparkle bursts, 50:50 dissolve, comet trail.
   Both loops are DPR- and resize-aware and pause while the tab is hidden; the overlay loop sleeps when idle. */
(function (CH) {
  'use strict';

  const TAU = Math.PI * 2;
  const FALLBACK_COLORS = ['#e63a35', '#3db54a', '#ec4f9c', '#17b8c4', '#f7941d', '#2a6fd6'];
  const GOLD = '#ffd56a';
  const DUST = ['#ffe6a3', '#ffd56a', '#fff3d1', '#ffcf6e', '#cfe9ff', '#a8d8ff'];
  const CUBE_LETTERS = ['א', 'ב', 'ת', 'נ', 'ך', 'ש'];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const easeOut3 = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
  const easeInOut3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const reduced = () => !!(CH.u && CH.u.reduced);
  const emblemColors = () => (CH.art && Array.isArray(CH.art.EMBLEM_COLORS) && CH.art.EMBLEM_COLORS.length >= 6 ? CH.art.EMBLEM_COLORS : FALLBACK_COLORS);

  // ---------------------------------------------------------------- colour helpers
  const probe = document.createElement('canvas').getContext('2d');
  const rgbCache = new Map();
  /** Any CSS colour → [r,g,b] (via the canvas parser; unknown → gold). */
  function rgbOf(color) {
    const key = String(color);
    let v = rgbCache.get(key);
    if (v) return v;
    probe.fillStyle = GOLD; probe.fillStyle = key;
    const s = probe.fillStyle;
    if (s[0] === '#') v = [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    else { const m = s.match(/[\d.]+/g) || [255, 213, 106]; v = [+m[0], +m[1], +m[2]]; }
    rgbCache.set(key, v);
    return v;
  }
  const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
  const mixRGB = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  // ---------------------------------------------------------------- pre-rendered sprites
  function canvasOf(w, h = w) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function radial(g, m, r, stops) {
    const gr = g.createRadialGradient(m, m, 0, m, m, r);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(m - r, m - r, 2 * r, 2 * r);
  }
  const SPRITES = {
    /** soft glow with a hot core */
    glow(c) {
      const S = 64, cv = canvasOf(S), g = cv.getContext('2d'), m = S / 2;
      radial(g, m, m, [[0, rgba(mixRGB(c, WHITE, 0.8), 1)], [0.14, rgba(mixRGB(c, WHITE, 0.4), 0.85)], [0.38, rgba(c, 0.34)], [0.68, rgba(c, 0.08)], [1, rgba(c, 0)]]);
      return cv;
    },
    /** tight dust mote */
    dot(c) {
      const S = 32, cv = canvasOf(S), g = cv.getContext('2d'), m = S / 2;
      radial(g, m, m, [[0, rgba(mixRGB(c, WHITE, 0.85), 1)], [0.22, rgba(mixRGB(c, WHITE, 0.3), 0.95)], [0.5, rgba(c, 0.3)], [1, rgba(c, 0)]]);
      return cv;
    },
    /** four-point star glint with diagonal sparkles and a halo */
    glint(c) {
      const S = 128, cv = canvasOf(S), g = cv.getContext('2d'), m = S / 2;
      radial(g, m, m * 0.5, [[0, rgba(c, 0.5)], [0.5, rgba(c, 0.14)], [1, rgba(c, 0)]]);
      const ray = (len, wid, rot) => {
        g.save(); g.translate(m, m); g.rotate(rot);
        const rg = g.createRadialGradient(0, 0, 0, 0, 0, len);
        rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, rgba(mixRGB(c, WHITE, 0.45), 0.9)); rg.addColorStop(1, rgba(c, 0));
        g.fillStyle = rg;
        g.beginPath(); g.moveTo(-len, 0); g.lineTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.closePath(); g.fill();
        g.restore();
      };
      ray(m * 0.98, m * 0.075, 0); ray(m * 0.98, m * 0.075, Math.PI / 2);
      ray(m * 0.42, m * 0.05, Math.PI / 4); ray(m * 0.42, m * 0.05, -Math.PI / 4);
      radial(g, m, m * 0.16, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      return cv;
    },
    /** thin luminous ring (shockwave) */
    ring(c) {
      const S = 256, cv = canvasOf(S), g = cv.getContext('2d'), m = S / 2;
      radial(g, m, m, [[0, rgba(c, 0)], [0.6, rgba(c, 0)], [0.8, rgba(c, 0.22)], [0.9, rgba(mixRGB(c, WHITE, 0.55), 0.85)], [0.95, rgba(c, 0.3)], [1, rgba(c, 0)]]);
      return cv;
    },
    /** soft bokeh disc with a slightly brighter rim */
    bokeh(c) {
      const S = 128, cv = canvasOf(S), g = cv.getContext('2d'), m = S / 2;
      radial(g, m, m, [[0, rgba(c, 0.5)], [0.72, rgba(c, 0.62)], [0.86, rgba(c, 0.85)], [0.93, rgba(c, 0.4)], [1, rgba(c, 0)]]);
      return cv;
    },
    /** vertical light band (dissolve front) */
    band(c) {
      const W = 64, H = 256, cv = canvasOf(W, H), g = cv.getContext('2d');
      const gx = g.createLinearGradient(0, 0, W, 0);
      gx.addColorStop(0, rgba(c, 0)); gx.addColorStop(0.32, rgba(c, 0.28)); gx.addColorStop(0.5, rgba(mixRGB(c, WHITE, 0.7), 0.9));
      gx.addColorStop(0.68, rgba(c, 0.28)); gx.addColorStop(1, rgba(c, 0));
      g.fillStyle = gx; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'destination-in';
      const gy = g.createLinearGradient(0, 0, 0, H);
      gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.2, '#000'); gy.addColorStop(0.8, '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gy; g.fillRect(0, 0, W, H);
      return cv;
    },
  };
  const spriteCache = new Map();
  function sprite(kind, color) {
    const key = kind + '|' + color;
    let s = spriteCache.get(key);
    if (!s) { s = SPRITES[kind](rgbOf(color)); spriteCache.set(key, s); }
    return s;
  }

  /** Confetti face shades (index 0 = edge-on/dark … 7 = face-on/lit); metallic pieces get a wider range. */
  const shadeCache = new Map();
  function shadesOf(color, metal) {
    const key = color + (metal ? '|m' : '');
    let arr = shadeCache.get(key);
    if (arr) return arr;
    const c = rgbOf(color);
    arr = [];
    for (let i = 0; i < 8; i++) {
      const f = i / 7;
      const col = metal
        ? (f < 0.55 ? mixRGB(c, [70, 40, 5], 0.62 * (1 - f / 0.55)) : mixRGB(c, WHITE, ((f - 0.55) / 0.45) * 0.62))
        : (f < 0.86 ? mixRGB(c, BLACK, 0.48 * (1 - f / 0.86)) : mixRGB(c, WHITE, ((f - 0.86) / 0.14) * 0.2));
      arr.push(rgba(col, 1));
    }
    shadeCache.set(key, arr);
    return arr;
  }

  // ---------------------------------------------------------------- stage mapping (CH.stage loads after this file)
  function view() {
    const st = CH.stage;
    if (st && typeof st.toViewport === 'function') { const o = st.toViewport(0, 0); return { s: st.scale, ox: o.x, oy: o.y }; }
    const vw = window.innerWidth, vh = window.innerHeight, s = Math.min(vw / 1920, vh / 1080);
    return { s, ox: (vw - 1920 * s) / 2, oy: (vh - 1080 * s) / 2 };
  }
  function stageRect(el) {
    if (CH.stage && typeof CH.stage.rectOf === 'function') return CH.stage.rectOf(el);
    const r = el.getBoundingClientRect(), v = view();
    const x = (r.left - v.ox) / v.s, y = (r.top - v.oy) / v.s, w = r.width / v.s, h = r.height / v.s;
    return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }
  /** Visible window bounds in stage coords (includes letterbox areas). */
  function stageBounds() {
    const v = view();
    return { left: -v.ox / v.s, top: -v.oy / v.s, right: (window.innerWidth - v.ox) / v.s, bottom: (window.innerHeight - v.oy) / v.s };
  }

  // ================================================================ BACKGROUND
  const B = {
    cv: null, ctx: null, dpr: 1, w: 0, h: 0, unit: 1, dirty: true, raf: 0, last: 0, T: 0,
    cubes: [], motes: [], discs: [], spr: null, artSpr: false,
    I: 1, It: 1, q: 1, ema: 16.7, slowMs: 0, fastMs: 0,
    mx: 0, my: 0, tmx: 0, tmy: 0,
  };
  // depth layers: far (small, blurred, hazy) → near (big, crisp, soft shadow)
  const LEVELS = [
    { px: 76, blur: 2.4, haze: 0.26, shadow: 0 },
    { px: 120, blur: 0.8, haze: 0.1, shadow: 0 },
    { px: 192, blur: 0, haze: 0, shadow: 1 },
  ];
  const PAD = 1.36; // sprite canvas = cube size × PAD (room for blur + shadow)

  function rasterLevel(src, L) {
    const S = Math.ceil(L.px * PAD), cv = canvasOf(S), g = cv.getContext('2d'), o = (S - L.px) / 2;
    if (L.blur && 'filter' in g) g.filter = `blur(${L.blur}px)`;
    if (L.shadow) { g.shadowColor = 'rgba(2, 12, 45, 0.42)'; g.shadowBlur = L.px * 0.1; g.shadowOffsetY = L.px * 0.05; }
    g.drawImage(src, o, o, L.px, L.px);
    g.filter = 'none'; g.shadowColor = 'transparent';
    if (L.haze) { // atmospheric perspective: tint toward the sky blue
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = `rgba(52, 128, 214, ${L.haze})`; g.fillRect(0, 0, S, S);
    }
    return cv;
  }
  /** Own isometric book-cube (used only if CH.art.bookCube is unavailable). */
  function fallbackCube(color, size = 192) {
    const cv = canvasOf(size), g = cv.getContext('2d'), c = rgbOf(color);
    g.scale(size / 100, size / 100);
    const a = 48, t = 38, ox = 50, oy = 7, C = 0.8660254;
    const iso = (X, Y, Z) => [ox + C * (X - Y), oy + 0.5 * (X + Y) + (t - Z)];
    const poly = (fill, pts) => {
      g.beginPath();
      pts.forEach((p, i) => { const [x, y] = iso(p[0], p[1], p[2]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    poly(rgba(mixRGB(c, BLACK, 0.34), 1), [[a, 0, 0], [a, a, 0], [a, a, t], [a, 0, t]]);              // boards (tail edge)
    poly('#f3e7c6', [[a, 0, 3.4], [a, a - 2.6, 3.4], [a, a - 2.6, t - 3.4], [a, 0, t - 3.4]]);        // page block
    g.strokeStyle = 'rgba(150, 120, 70, 0.35)'; g.lineWidth = 0.35; g.beginPath();
    for (let z = 5; z < t - 4; z += 1.6) { const [x0, y0] = iso(a, 0.6, z), [x1, y1] = iso(a, a - 3, z); g.moveTo(x0, y0); g.lineTo(x1, y1); }
    g.stroke();
    poly(rgba(mixRGB(c, BLACK, 0.16), 1), [[0, a, 0], [a, a, 0], [a, a, t], [0, a, t]]);              // spine
    [t * 0.2, t * 0.8].forEach((z) => poly('#e7b448', [[1, a, z - 1.1], [a - 0.5, a, z - 1.1], [a - 0.5, a, z + 1.1], [1, a, z + 1.1]]));
    poly(rgba(mixRGB(c, WHITE, 0.1), 1), [[0, 0, t], [a, 0, t], [a, a, t], [0, a, t]]);               // cover
    poly('#f6c64e', [[a / 2, a / 2 - 7, t], [a / 2 + 5, a / 2, t], [a / 2, a / 2 + 7, t], [a / 2 - 5, a / 2, t]]);
    return cv;
  }
  function svgImage(svg) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  /** sprites[colour][variant: 0 ornament | 1 letter][level] */
  function buildSpriteSet(sources) {
    return sources.map((pair) => pair.map((src) => LEVELS.map((L) => rasterLevel(src, L))));
  }
  let spriteJob = null, recheckTimers = [];
  function loadSprites() {
    const colors = emblemColors().slice(0, 6);
    const art = CH.art && typeof CH.art.bookCube === 'function';
    if (!art) {
      if (!B.spr) B.spr = buildSpriteSet(colors.map((c) => { const s = fallbackCube(c); return [s, s]; }));
      if (!recheckTimers.length) recheckTimers = [1200, 4000].map((ms) => setTimeout(() => { if (!B.artSpr && !spriteJob && CH.art && CH.art.bookCube) loadSprites(); }, ms));
      return;
    }
    let jobs;
    try {
      jobs = colors.map((c, i) => [
        svgImage(CH.art.bookCube(c, { size: LEVELS[2].px })),
        svgImage(CH.art.bookCube(c, { size: LEVELS[2].px, letter: CUBE_LETTERS[i] })),
      ]);
    } catch (e) { console.error(e); CH.art.bookCube = null; return loadSprites(); }
    spriteJob = Promise.all(jobs.map((p) => Promise.all(p)))
      .then((imgs) => { B.spr = buildSpriteSet(imgs); B.artSpr = true; })
      .catch(() => { if (!B.spr) B.spr = buildSpriteSet(colors.map((c) => { const s = fallbackCube(c); return [s, s]; })); })
      .then(() => { spriteJob = null; });
  }

  function makeCube(i, n, lv, rank) {
    const z = (lv + Math.random()) / 3;
    return {
      z, lv, rank,
      col: i % 6, letter: Math.random() < 0.34 ? 1 : 0,
      size: lerp(30, 118, Math.pow(z, 1.12)) * rand(0.88, 1.12),          // css px @1080p
      speed: lerp(9, 40, z) * rand(0.85, 1.15),                           // css px/s @1080p
      x: (((i * 7) % n) + Math.random()) / n, y: 0,
      swA: rand(8, 22) * (0.5 + z), swF: rand(0.12, 0.32), ph: rand(0, TAU),
      r0: rand(-0.3, 0.3), rA: rand(0.06, 0.24), rF: rand(0.08, 0.22),
      spin: Math.random() < 0.22 ? rand(-0.22, 0.22) : 0,
      a: lerp(0.34, 0.86, z), vis: 0,
    };
  }
  function buildScene() {
    const n = clamp(Math.round(30 * Math.sqrt((B.w * B.h) / (1920 * 1080))), 24, 36);
    const ranks = (CH.u && CH.u.shuffle ? CH.u.shuffle : (a) => a)([...Array(n).keys()]);
    const cols = (CH.u && CH.u.shuffle ? CH.u.shuffle : (a) => a)([...Array(n).keys()].map((i) => i % 6));
    B.cubes = [];
    for (let i = 0; i < n; i++) {
      const lv = i < n * 0.44 ? 0 : i < n * 0.78 ? 1 : 2;
      const c = makeCube(i, n, lv, ranks[i]);
      c.col = cols[i];
      c.y = rand(-0.05, 1.08) * B.h;
      B.cubes.push(c);
    }
    B.cubes.sort((a, b) => a.z - b.z);
    B.motes = [];
    for (let i = 0; i < 54; i++) {
      const z = Math.random();
      B.motes.push({
        z, x: Math.random(), y: Math.random() * B.h,
        r: lerp(3, 14, z * z) * rand(0.8, 1.2), a: lerp(0.18, 0.55, z) * rand(0.7, 1),
        img: Math.random() < 0.62 ? 'gold' : 'blue',
        twF: rand(0.6, 2.2), ph: rand(0, TAU), speed: lerp(4, 18, z), swA: rand(6, 20), swF: rand(0.1, 0.35),
      });
    }
    B.discs = [];
    for (let i = 0; i < 8; i++) {
      B.discs.push({ x: Math.random(), y: Math.random() * B.h, r: rand(50, 150), a: rand(0.035, 0.07), speed: rand(3, 8),
        swA: rand(20, 60), swF: rand(0.04, 0.1), ph: rand(0, TAU), img: Math.random() < 0.5 ? 'gold' : 'blue' });
    }
  }
  function fitBg() {
    const dpr = B.q < 0.7 ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth, h = window.innerHeight;
    B.dirty = false;
    if (w === B.w && h === B.h && dpr === B.dpr && B.cv.width) return;
    if (B.h && h !== B.h) { const k = h / B.h; B.cubes.forEach((c) => (c.y *= k)); B.motes.forEach((m) => (m.y *= k)); B.discs.forEach((d) => (d.y *= k)); }
    B.w = w; B.h = h; B.dpr = dpr;
    B.unit = clamp(Math.sqrt((w * h) / (1920 * 1080)), 0.45, 1.8);
    B.cv.width = Math.round(w * dpr); B.cv.height = Math.round(h * dpr);
  }
  function respawn(c, s) {
    c.y = B.h + s * rand(0.6, 1.6);
    c.x = Math.random();
    c.letter = Math.random() < 0.34 ? 1 : 0;
  }
  /** Adaptive quality: drop cubes/motes and DPR if frames are slow; recover slowly. */
  function adapt(dtms) {
    if (dtms > 250) return;
    B.ema += (dtms - B.ema) * 0.05;
    if (B.T < 2.5) return;
    if (B.ema > 24) {
      B.fastMs = 0; B.slowMs += dtms;
      if (B.slowMs > 1500 && B.q > 0.45) { B.q = Math.max(0.45, B.q - 0.2); B.slowMs = 0; B.dirty = true; }
    } else if (B.ema < 18) {
      B.slowMs = 0; B.fastMs += dtms;
      if (B.fastMs > 9000 && B.q < 1) { B.q = Math.min(1, B.q + 0.1); B.fastMs = 0; B.dirty = true; }
    } else { B.slowMs = 0; B.fastMs = 0; }
  }
  function bgFrame(ts) {
    B.raf = 0;
    if (!B.cv || document.hidden) return;
    const dtms = B.last ? ts - B.last : 16.7;
    B.last = ts;
    const dt = clamp(dtms / 1000, 0, 0.05);
    B.T += dt;
    adapt(dtms);
    if (B.dirty) fitBg();
    const kI = 1 - Math.exp(-dt / 0.9), kM = 1 - Math.exp(-dt / 0.6);
    B.I += (B.It - B.I) * kI;
    B.mx += (B.tmx - B.mx) * kM; B.my += (B.tmy - B.my) * kM;
    drawBg(dt);
    B.raf = requestAnimationFrame(bgFrame);
  }
  function drawBg(dt) {
    const ctx = B.ctx, dpr = B.dpr, w = B.w, h = B.h, u = B.unit, T = B.T, I = B.I;
    const aMul = I <= 1 ? 0.3 + 0.7 * I : 1 + (I - 1) * 0.45;
    const vMul = (0.45 + 0.55 * I) * (reduced() ? 0.3 : 1);
    const active = Math.round(B.cubes.length * clamp(0.5 + 0.34 * I, 0.3, 1) * B.q);
    const kVis = 1 - Math.exp(-dt / 1.2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, B.cv.width, B.cv.height);

    // far bokeh discs (additive, behind the cubes)
    ctx.globalCompositeOperation = 'lighter';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gB = sprite('bokeh', '#ffe7a8'), bB = sprite('bokeh', '#a9dcff');
    for (const d of B.discs) {
      d.y -= d.speed * u * vMul * dt;
      const r = d.r * u;
      if (d.y < -r * 2) { d.y = h + r * 2; d.x = Math.random(); }
      const x = d.x * w + Math.sin(T * d.swF + d.ph) * d.swA * u - B.mx * 4 * u;
      ctx.globalAlpha = d.a * Math.min(aMul, 1.2) * smooth(-r, h * 0.3, d.y);
      ctx.drawImage(d.img === 'gold' ? gB : bB, x - r, d.y - r, 2 * r, 2 * r);
    }

    // book-cubes, far → near
    ctx.globalCompositeOperation = 'source-over';
    for (const c of B.cubes) {
      const s = c.size * u;
      c.y -= c.speed * u * vMul * dt;
      if (c.y < -s) respawn(c, s);
      c.vis += ((c.rank < active ? 1 : 0) - c.vis) * kVis;
      if (!B.spr || c.vis < 0.005) continue;
      const a = Math.min(1, c.a * aMul) * c.vis * smooth(-s * 0.6, h * 0.24, c.y);
      if (a < 0.004) continue;
      const X = c.x * w + Math.sin(T * c.swF + c.ph) * c.swA * u - B.mx * (6 + 30 * c.z) * u;
      const Y = c.y - B.my * (3 + 14 * c.z) * u;
      const rot = c.r0 + Math.sin(T * c.rF + c.ph * 1.7) * c.rA + c.spin * T;
      const cr = Math.cos(rot) * dpr, sr = Math.sin(rot) * dpr, d = s * PAD;
      ctx.globalAlpha = a;
      ctx.setTransform(cr, sr, -sr, cr, X * dpr, Y * dpr);
      ctx.drawImage(B.spr[c.col % B.spr.length][c.letter][c.lv], -d / 2, -d / 2, d, d);
    }

    // dust motes (additive, twinkling)
    ctx.globalCompositeOperation = 'lighter';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gM = sprite('glow', '#ffe3a0'), bM = sprite('glow', '#bfe6ff');
    const nM = Math.round(B.motes.length * (B.q < 1 ? 0.6 : 1));
    for (let i = 0; i < nM; i++) {
      const m = B.motes[i], r = m.r * u;
      m.y -= m.speed * u * vMul * dt;
      if (m.y < -r) { m.y = h + r; m.x = Math.random(); }
      const tw = 0.5 + 0.5 * Math.sin(T * m.twF + m.ph);
      const a = m.a * aMul * (0.2 + 0.8 * tw * tw) * smooth(-r, h * 0.15, m.y);
      if (a < 0.004) continue;
      const x = m.x * w + Math.sin(T * m.swF + m.ph) * m.swA * u - B.mx * (4 + 22 * m.z) * u;
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(m.img === 'gold' ? gM : bM, x - r, m.y - B.my * 8 * m.z * u - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function startBg() {
    if (B.cv && !B.raf && !document.hidden) { B.last = 0; B.raf = requestAnimationFrame(bgFrame); }
  }

  let listening = false;
  function listen() {
    if (listening) return;
    listening = true;
    window.addEventListener('resize', () => { B.dirty = true; });
    window.addEventListener('mousemove', (e) => {
      B.tmx = clamp(e.clientX / (window.innerWidth || 1) - 0.5, -0.5, 0.5);
      B.tmy = clamp(e.clientY / (window.innerHeight || 1) - 0.5, -0.5, 0.5);
    }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (B.raf) { cancelAnimationFrame(B.raf); B.raf = 0; }
        if (O.raf) { cancelAnimationFrame(O.raf); O.raf = 0; }
      } else {
        startBg();
        if (alive()) wake();
      }
    });
  }

  /** Start the ambient background on #bg-canvas (called once by 07-bg.js). */
  function initBackground(canvas) {
    if (!canvas || !canvas.getContext || B.cv === canvas) return;
    B.cv = canvas;
    B.ctx = canvas.getContext('2d');
    if (!B.ctx) { B.cv = null; return; }
    listen();
    B.w = 0; fitBg();
    buildScene();
    loadSprites();
    startBg();
  }
  /** 0 = off … 1 = normal … 1.5 = boosted; eased over ~1s. */
  function setBackgroundIntensity(x) {
    const v = Number(x);
    B.It = clamp(Number.isFinite(v) ? v : 1, 0, 1.5);
  }

  // ================================================================ OVERLAY
  const O = { cv: null, ctx: null, dpr: 1, vw: 0, vh: 0, raf: 0, last: 0, T: 0, ema: 16.7, wind: 0, pieces: [], sparks: [], ents: [] };
  const MAX_PIECES = 1600, MAX_SPARKS = 3200;
  const G = 980; // stage px/s²

  function overlay() {
    if (O.cv && O.ctx && O.cv.isConnected) return true;
    O.cv = document.getElementById('fx-canvas');
    if (!O.cv) {
      if (!document.body) return false;
      O.cv = document.createElement('canvas');
      O.cv.id = 'fx-canvas'; O.cv.setAttribute('aria-hidden', 'true');
      Object.assign(O.cv.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '50', pointerEvents: 'none' });
      document.body.append(O.cv);
    }
    O.ctx = O.cv.getContext('2d');
    O.vw = 0;
    listen();
    return !!O.ctx;
  }
  function fitOverlay() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), vw = window.innerWidth, vh = window.innerHeight;
    if (vw === O.vw && vh === O.vh && dpr === O.dpr) return;
    O.vw = vw; O.vh = vh; O.dpr = dpr;
    O.cv.width = Math.round(vw * dpr); O.cv.height = Math.round(vh * dpr);
  }
  const alive = () => O.pieces.length > 0 || O.sparks.length > 0 || O.ents.length > 0;
  function wake() {
    if (!overlay()) return;
    if (!O.raf && !document.hidden) { O.last = 0; O.raf = requestAnimationFrame(frame); }
  }
  /** Spawn-count multiplier: reduced motion and slow machines get fewer particles. */
  function quality() {
    const ema = Math.max(B.cv ? B.ema : 0, O.raf ? O.ema : 0);
    return (reduced() ? 0.45 : 1) * (ema > 28 ? 0.55 : ema > 22 ? 0.75 : 1);
  }

  function frame(ts) {
    O.raf = 0;
    if (document.hidden) return;
    const dtms = O.last ? ts - O.last : 16.7;
    if (O.last && dtms < 250) O.ema += (dtms - O.ema) * 0.08;
    O.last = ts;
    const dt = clamp(dtms / 1000, 0, 0.05);
    O.T += dt;
    fitOverlay();
    step(dt);
    render();
    if (alive()) O.raf = requestAnimationFrame(frame);
    else { O.ctx.setTransform(1, 0, 0, 1, 0, 0); O.ctx.clearRect(0, 0, O.cv.width, O.cv.height); O.last = 0; }
  }

  function step(dt) {
    const T = O.T;
    O.wind = 34 * Math.sin(T * 0.7) + 16 * Math.sin(T * 1.9 + 1.3);
    // confetti: gravity, orientation-dependent air drag (flutter), sideways lift, wobble
    const P = O.pieces;
    let n = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.age += dt;
      if (p.age >= 0) {
        if (p.age > p.life || p.y > p.maxY) continue;
        const face = Math.abs(Math.cos(p.flip));
        const k = p.drag * (0.3 + 0.7 * face);
        p.vy += G * dt;
        p.vx += (O.wind * p.windK + Math.sin(p.age * p.wobF + p.ph) * p.wob + Math.sin(p.flip * 2) * p.lift) * dt;
        const d = Math.exp(-k * dt);
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt; p.flip += p.vf * dt; p.curl += p.vc * dt;
      }
      P[n++] = p;
    }
    P.length = n;
    // glow particles: curl-noise turbulence, acceleration, drag
    const S = O.sparks;
    n = 0;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      s.age += dt;
      if (s.age >= 0) {
        if (s.age >= s.life) continue;
        if (s.turb) {
          const A = s.x * 0.019 + T * 1.3 + s.seed, Bv = s.y * 0.023 - T * 1.1;
          s.vx -= Math.sin(A) * Math.sin(Bv) * s.turb * dt;
          s.vy -= Math.cos(A) * Math.cos(Bv) * s.turb * dt;
        }
        s.vx += s.ax * dt; s.vy += s.ay * dt;
        if (s.drag) { const d = Math.exp(-s.drag * dt); s.vx *= d; s.vy *= d; }
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
      }
      S[n++] = s;
    }
    S.length = n;
    const E = O.ents;
    n = 0;
    for (let i = 0; i < E.length; i++) if (E[i].step(dt)) E[n++] = E[i];
    E.length = n;
  }

  function render() {
    const ctx = O.ctx, v = view(), dpr = O.dpr;
    const S = v.s * dpr, ox = v.ox * dpr, oy = v.oy * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, O.cv.width, O.cv.height);

    // confetti (normal blending)
    const P = O.pieces;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      if (p.age < 0) continue;
      const left = p.life - p.age;
      ctx.globalAlpha = left < p.fade ? Math.max(0, left / p.fade) : 1;
      const cf = Math.cos(p.flip), face = Math.abs(cf);
      let idx = (face * 7.99) | 0;
      if (cf < 0 && idx > 0) idx--;           // back side a touch darker
      ctx.fillStyle = p.shades[idx];
      const cr = Math.cos(p.rot), sr = Math.sin(p.rot);
      if (p.shape === 2) {                    // curly streamer
        ctx.setTransform(S * cr, S * sr, -S * sr, S * cr, S * p.x + ox, S * p.y + oy);
        ctx.strokeStyle = p.shades[clamp(3 + ((Math.sin(p.curl) * 4) | 0), 0, 7)];
        ctx.lineWidth = p.h; ctx.lineCap = 'round';
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const f = k / 10, x = (f - 0.5) * p.w, y = Math.sin(f * 9.5 + p.curl) * p.amp * (0.4 + f * 0.6);
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
        continue;
      }
      const sx = cf < 0 ? Math.min(cf, -0.06) : Math.max(cf, 0.06);
      ctx.setTransform(S * cr * sx, S * sr * sx, -S * sr, S * cr, S * p.x + ox, S * p.y + oy);
      if (p.shape === 0) {                    // 60° rhombus — echo of the emblem
        ctx.beginPath(); ctx.moveTo(0, -p.h); ctx.lineTo(p.w, 0); ctx.lineTo(0, p.h); ctx.lineTo(-p.w, 0); ctx.closePath(); ctx.fill();
      } else ctx.fillRect(-p.w, -p.h, p.w * 2, p.h * 2);
    }

    // light (additive)
    ctx.globalCompositeOperation = 'lighter';
    const E = O.ents;
    for (let i = 0; i < E.length; i++) E[i].draw(ctx, S, ox, oy);
    const L = O.sparks;
    let plain = false;
    for (let i = 0; i < L.length; i++) {
      const s = L[i];
      if (s.age < 0) continue;
      const t = s.age / s.life;
      let a = s.a * (t < s.fin ? t / s.fin : 1) * Math.pow(1 - t, s.fo);
      if (s.tw) a *= 0.5 + 0.5 * Math.sin(s.age * s.tw + s.seed);
      if (a < 0.004) continue;
      const z = s.s0 + (s.s1 - s.s0) * t;
      ctx.globalAlpha = a > 1 ? 1 : a;
      if (s.streak) {
        const sp = Math.hypot(s.vx, s.vy), len = z * (1 + sp * s.streak);
        const c = sp ? s.vx / sp : 1, sn = sp ? s.vy / sp : 0;
        ctx.setTransform(S * c, S * sn, -S * sn, S * c, S * s.x + ox, S * s.y + oy);
        ctx.drawImage(s.img, -len * 0.75, -z / 2, len, z);
        plain = false;
      } else if (s.rot) {
        const c = Math.cos(s.rot), sn = Math.sin(s.rot);
        ctx.setTransform(S * c, S * sn, -S * sn, S * c, S * s.x + ox, S * s.y + oy);
        ctx.drawImage(s.img, -z / 2, -z / 2, z, z);
        plain = false;
      } else {
        if (!plain) { ctx.setTransform(S, 0, 0, S, ox, oy); plain = true; }
        ctx.drawImage(s.img, s.x - z / 2, s.y - z / 2, z, z);
      }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- particle factories
  function addSpark(img, x, y, vx, vy, life, size, o) {
    if (O.sparks.length >= MAX_SPARKS) return null;
    const s = {
      img, x, y, vx, vy, ax: 0, ay: 0, drag: 0, turb: 0, age: 0, life, s0: size, s1: size * 0.3,
      a: 1, fin: 0.04, fo: 1.6, tw: 0, rot: 0, vr: 0, streak: 0, seed: Math.random() * 100,
    };
    if (o) Object.assign(s, o);
    O.sparks.push(s);
    return s;
  }
  function makePiece(x, y, vx, vy, life) {
    if (O.pieces.length >= MAX_PIECES) return null;
    const r = Math.random();
    const metal = r < 0.13, cream = !metal && r < 0.18;
    const col = metal ? GOLD : cream ? '#fff4d8' : pick(emblemColors());
    const sh = Math.random();
    const shape = sh < 0.07 ? 2 : sh < 0.52 ? 0 : 1;
    const p = {
      x, y, vx, vy, age: 0, life, fade: Math.min(0.8, life * 0.25), maxY: stageBounds().bottom + 40,
      rot: rand(0, TAU), vr: rand(-5, 5), flip: rand(0, TAU), vf: rand(5, 12) * (Math.random() < 0.5 ? -1 : 1),
      drag: rand(2.5, 3.5), wob: rand(25, 80), wobF: rand(2, 5), ph: rand(0, TAU), lift: rand(140, 340), windK: rand(0.6, 1.4),
      shape, shades: shadesOf(col, metal), w: 0, h: 0, curl: rand(0, TAU), vc: 0, amp: 0,
    };
    if (shape === 0) { p.w = rand(5.2, 7); p.h = p.w * 1.732; }               // half-diagonals of a 60° rhombus
    else if (shape === 1) { p.w = rand(5, 7.5); p.h = rand(2.8, 4.2); }      // half-sizes
    else { p.w = rand(34, 56); p.h = rand(3.2, 4.2); p.amp = rand(4, 7); p.vc = rand(4, 8); p.drag *= 1.3; p.vr *= 0.5; p.vf = 0; p.lift = 0; }
    O.pieces.push(p);
    return p;
  }

  // ---------------------------------------------------------------- entities (rings, flashes, rain, trails, sweeps)
  function ringEnt(x, y, col, r0, r1, life, delay = 0, alpha = 1) {
    const img = sprite('ring', col);
    let age = -delay;
    return {
      step(dt) { age += dt; return age < life; },
      draw(ctx, S, ox, oy) {
        if (age < 0) return;
        const t = age / life, r = r0 + (r1 - r0) * easeOut3(t);
        ctx.globalAlpha = alpha * Math.pow(1 - t, 1.4);
        ctx.setTransform(S, 0, 0, S, ox, oy);
        ctx.drawImage(img, x - r, y - r, 2 * r, 2 * r);
      },
    };
  }
  function flashEnt(x, y, col, size, life, alpha = 1) {
    const img = sprite('glow', col);
    let age = 0;
    return {
      step(dt) { age += dt; return age < life; },
      draw(ctx, S, ox, oy) {
        const t = age / life, z = size * (0.55 + 0.6 * easeOut3(t));
        ctx.globalAlpha = alpha * (1 - t) * (1 - t);
        ctx.setTransform(S, 0, 0, S, ox, oy);
        ctx.drawImage(img, x - z / 2, y - z / 2, z, z);
      },
    };
  }
  const noDraw = () => {};

  // ================================================================ public effects
  /** Celebratory confetti cannon (or rain:true → falls from the top across the whole window). */
  function confetti(opts = {}) {
    if (!overlay()) return;
    const o = Object.assign({ x: 960, y: 540, count: 160, spread: 70, power: 1, angle: -90, rain: false, duration: 4000 }, opts);
    const q = quality();
    if (o.rain) {
      const total = Math.round((Number(o.count) || 160) * q), dur = Math.max(0.2, o.duration / 1000);
      let age = 0, acc = 0;
      O.ents.push({
        step(dt) {
          age += dt;
          if (age > dur) return false;
          acc += (total / dur) * dt;
          const b = stageBounds();
          while (acc >= 1) {
            acc -= 1;
            const p = makePiece(rand(b.left, b.right), b.top - rand(10, 70), rand(-40, 40), rand(60, 240), 30);
            if (p) { p.fade = 0.01; p.vf *= 0.8; }
          }
          return true;
        },
        draw: noDraw,
      });
      wake();
      return;
    }
    const n = Math.round((Number(o.count) || 160) * q), life = Math.max(0.6, o.duration / 1000);
    for (let i = 0; i < n; i++) {
      const ang = (o.angle + (Math.random() + Math.random() - 1) * o.spread * 0.5) * (Math.PI / 180);
      const sp = o.power * 2150 * Math.pow(rand(0.12, 1), 0.55);
      const p = makePiece(o.x + rand(-8, 8), o.y + rand(-8, 8), Math.cos(ang) * sp, Math.sin(ang) * sp, life * rand(0.72, 1.05));
      if (!p) break;
      p.age = -Math.random() * 0.05;
    }
    // muzzle pop: a soft flash + a few glints shooting along the cannon
    O.ents.push(flashEnt(o.x, o.y, '#fff1c4', 260, 0.32, 0.8));
    const gl = sprite('glint', GOLD);
    for (let i = 0; i < 10 * q; i++) {
      const ang = (o.angle + rand(-0.5, 0.5) * o.spread) * (Math.PI / 180), sp = rand(400, 1300) * o.power;
      addSpark(gl, o.x, o.y, Math.cos(ang) * sp, Math.sin(ang) * sp, rand(0.4, 0.8), rand(14, 26), { drag: 3.2, ay: 500, vr: rand(-6, 6), rot: 0.01, tw: rand(16, 26) });
    }
    wake();
  }

  /** Quick sparkle burst: kind 'sparkle' (glints + streaks + ring), 'ring' (shockwave), 'stars' (twinkling star shower). */
  function burst(x, y, opts = {}) {
    if (!overlay() || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const o = Object.assign({ color: GOLD, count: 36, kind: 'sparkle' }, opts);
    const q = quality(), n = Math.max(4, Math.round((Number(o.count) || 36) * q)), col = o.color || GOLD;
    const glint = sprite('glint', col), dot = sprite('dot', col), white = sprite('glint', '#fffaf0'), glow = sprite('glow', col);
    if (o.kind === 'ring') {
      O.ents.push(flashEnt(x, y, col, 240, 0.3, 0.75));
      O.ents.push(ringEnt(x, y, col, 26, 250, 0.75, 0, 0.95));
      O.ents.push(ringEnt(x, y, '#fff6dc', 16, 160, 0.6, 0.08, 0.6));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rand(-0.08, 0.08), sp = rand(420, 620);
        addSpark(i % 3 ? dot : glint, x + Math.cos(a) * 20, y + Math.sin(a) * 20, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 0.8), i % 3 ? rand(8, 13) : rand(18, 28),
          { drag: 3.4, streak: i % 3 ? 0.006 : 0, rot: i % 3 ? 0 : 0.01, vr: rand(-4, 4), fo: 1.3 });
      }
    } else if (o.kind === 'stars') {
      O.ents.push(flashEnt(x, y, col, 200, 0.35, 0.7));
      O.ents.push(ringEnt(x, y, col, 18, 140, 0.55, 0, 0.55));
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(140, 640);
        const big = Math.random() < 0.55;
        addSpark(big ? (Math.random() < 0.3 ? white : glint) : dot, x, y, Math.cos(a) * sp, Math.sin(a) * sp - rand(80, 240), rand(0.8, 1.5),
          big ? rand(18, 40) : rand(6, 11), { drag: 2.4, ay: 520, rot: big ? rand(0, 1) : 0, vr: rand(-3, 3), tw: rand(10, 22), s1: big ? 6 : 2, fo: 1.1 });
      }
    } else {
      O.ents.push(flashEnt(x, y, col, 230, 0.26, 0.9));
      O.ents.push(ringEnt(x, y, col, 14, 170, 0.5, 0, 0.75));
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), sp = rand(260, 980), streak = i % 5 < 3;
        addSpark(streak ? dot : (i % 2 ? glint : white), x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.42, 0.9),
          streak ? rand(7, 12) : rand(14, 30), { drag: 4.2, ay: 300, streak: streak ? 0.012 : 0, rot: streak ? 0 : rand(0, 1), vr: rand(-5, 5), tw: streak ? 0 : rand(18, 30) });
      }
      for (let i = 0; i < 6; i++) addSpark(glow, x + rand(-30, 30), y + rand(-30, 30), rand(-60, 60), rand(-80, 20), rand(0.4, 0.7), rand(30, 60), { a: 0.35, drag: 2 });
    }
    wake();
  }

  /** Quadratic-bezier control point for a "+N" flight from → to (bulges upward / outward). */
  function trailControl(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy) || 1;
    let nx = -dy / d, ny = dx / d;
    if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
    const k = clamp(d * 0.32, 60, 340);
    return { x: (from.x + to.x) / 2 + nx * k, y: (from.y + to.y) / 2 + ny * k };
  }
  function bezierPoint(p0, c, p1, t) {
    const u = 1 - t;
    return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
  }

  /** Comet of gold sparkles along trailControl's curve; head follows ease-in-out-cubic (same as the "+N" label). */
  function trail(from, to, opts = {}) {
    const o = Object.assign({ duration: 800, color: GOLD, ease: easeInOut3 }, opts);
    const dur = Math.max(0.05, (Number(o.duration) || 800) / 1000);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      setTimeout(finish, dur * 1000 + 80); // safety (hidden tab / clear)
      if (!overlay() || !from || !to) return;
      const ease = typeof o.ease === 'function' ? o.ease : easeInOut3;
      const c = o.control || trailControl(from, to), col = o.color || GOLD;
      const glow = sprite('glow', col), hot = sprite('glow', '#fff4d6'), glint = sprite('glint', col), white = sprite('glint', '#fffaf0'), dot = sprite('dot', col);
      const TAIL = 0.2, M = 30, rate = 260 * quality();
      const pos = (tt) => bezierPoint(from, c, to, ease(clamp(tt, 0, 1)));
      let age = 0, acc = 0, prev = pos(0);
      O.ents.push({
        resolve: finish,
        step(dt) {
          age += dt;
          const t = age / dur;
          if (t <= 1) {
            const h = pos(t), vx = (h.x - prev.x) / (dt || 1 / 60), vy = (h.y - prev.y) / (dt || 1 / 60);
            acc += rate * dt;
            while (acc >= 1) {
              acc -= 1;
              const f = Math.random(), x = prev.x + (h.x - prev.x) * f + rand(-7, 7), y = prev.y + (h.y - prev.y) * f + rand(-7, 7);
              const g = Math.random() < 0.35;
              addSpark(g ? (Math.random() < 0.3 ? white : glint) : dot, x, y, -vx * rand(0.02, 0.12) + rand(-50, 50), -vy * rand(0.02, 0.12) + rand(-50, 50), rand(0.35, 0.85),
                g ? rand(12, 24) : rand(5, 10), { drag: 2.2, ay: 160, tw: rand(14, 30), rot: g ? rand(0, 1) : 0, vr: rand(-4, 4), s1: g ? 3 : 1.5 });
            }
            prev = h;
          } else finish();
          return t < 1 + TAIL / dur + 0.02;
        },
        draw(ctx, S, ox, oy) {
          const t = age / dur;
          ctx.setTransform(S, 0, 0, S, ox, oy);
          for (let j = M; j >= 1; j--) {           // tail: earlier positions, tapering
            const tt = t - (j / M) * (TAIL / dur);
            if (tt < 0 || tt > 1) continue;
            const p = pos(tt), f = 1 - j / M, z = 8 + 44 * Math.pow(f, 1.25);
            ctx.globalAlpha = 0.5 * Math.pow(f, 1.5);
            ctx.drawImage(glow, p.x - z / 2, p.y - z / 2, z, z);
          }
          if (t > 1) return;
          const h = pos(t), pulse = 1 + 0.08 * Math.sin(age * 40);
          let z = 110 * pulse;
          ctx.globalAlpha = 0.9; ctx.drawImage(glow, h.x - z / 2, h.y - z / 2, z, z);
          z = 46; ctx.globalAlpha = 1; ctx.drawImage(hot, h.x - z / 2, h.y - z / 2, z, z);
          const r = age * 2.2, cr = Math.cos(r), sr = Math.sin(r);
          z = 84 * pulse;
          ctx.setTransform(S * cr, S * sr, -S * sr, S * cr, S * h.x + ox, S * h.y + oy);
          ctx.drawImage(glint, -z / 2, -z / 2, z, z);
        },
      });
      wake();
    });
  }

  /** 50:50 — the element blows away right→left into glowing dust. Resolves when gone (element left visibility:hidden). */
  function dissolve(el, opts = {}) {
    if (!el || !el.isConnected) return Promise.resolve();
    const o = Object.assign({ colors: DUST, duration: 880, count: 440 }, opts);
    const colors = Array.isArray(o.colors) && o.colors.length ? o.colors : DUST;
    const D = reduced() ? 380 : Math.max(200, Number(o.duration) || 880);
    const r = stageRect(el);
    const W = el.offsetWidth || r.w, H = el.offsetHeight || r.h;
    const M = 150, Sz = Math.max(140, W * 0.42), span = W + 2 * M;       // mask: opaque | soft edge Sz | transparent
    const st = el.style;
    const pfx = 'maskImage' in st ? 'mask' : 'webkitMaskImage' in st ? 'webkitMask' : null;
    const props = ['Image', 'Size', 'Repeat', 'Position', 'Clip', 'Origin'].map((k) => pfx + k);
    const saved = pfx ? props.map((p) => st[p]) : [];
    const x0 = -M, x1 = -M - span - Sz;
    let anim = null;
    if (pfx) {
      st[pfx + 'Image'] = `linear-gradient(90deg, #000 0px, #000 ${span}px, transparent ${span + Sz}px, transparent ${2 * span + Sz}px)`;
      st[pfx + 'Size'] = `${2 * span + Sz}px ${H + 2 * M}px`;
      st[pfx + 'Repeat'] = 'no-repeat';
      st[pfx + 'Origin'] = 'border-box';
      st[pfx + 'Clip'] = 'no-clip';                     // keep the box-shadow until the front reaches it
      st[pfx + 'Position'] = `${x0}px ${-M}px`;
    }
    if (el.animate) {
      const P = (f) => ({ [pfx + 'Position']: `${(x0 + (x1 - x0) * f).toFixed(1)}px ${-M}px` });
      const kf = pfx ? [
        { ...P(0), filter: 'brightness(1) saturate(1) blur(0px)', opacity: 1 },
        { ...P(0.25), filter: 'brightness(1.3) saturate(1.1) blur(0px)', opacity: 1, offset: 0.25 },
        { ...P(1), filter: 'brightness(1.9) saturate(0.8) blur(3px)', opacity: 0.8 },
      ] : [{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(10px)' }];
      try { anim = el.animate(kf, { duration: D, easing: 'linear', fill: 'forwards' }); } catch (e) { anim = null; }
    }

    // dust: each grain appears when the soft front (mask midpoint) passes its x
    if (overlay()) {
      const q = quality(), n = Math.round((Number(o.count) || 440) * q);
      const kx = r.w / W, rad = Math.min(28, r.h / 2);
      const travel = span + Sz, edge0 = W + M + Sz / 2;            // front position (element px) at t=0, distance travelled
      const imgs = colors.map((c) => [sprite('dot', c), sprite('glow', c), sprite('glint', c)]);
      for (let i = 0; i < n; i++) {
        let u = Math.random(), v = Math.random();
        const px = u * r.w, py = v * r.h;                        // reject points outside the rounded corners
        const cx = clamp(px, rad, r.w - rad), cy = clamp(py, rad, r.h - rad);
        if ((px - cx) ** 2 + (py - cy) ** 2 > rad * rad) { u = 0.5 + (u - 0.5) * 0.9; v = 0.5 + (v - 0.5) * 0.7; }
        const delay = ((edge0 - u * W) / travel) * (D / 1000) + rand(-0.03, 0.05);
        const set = imgs[(Math.random() * imgs.length) | 0], k = Math.random();
        const kind = k < 0.78 ? 0 : k < 0.9 ? 1 : 2;
        const s = addSpark(set[kind], r.x + u * r.w, r.y + v * r.h, rand(-240, -40), rand(-120, 20), rand(0.55, 1.2),
          kind === 0 ? rand(4, 10) : kind === 1 ? rand(16, 30) : rand(10, 20),
          { ax: -260, ay: -70, drag: 1.1, turb: rand(320, 720), a: kind === 1 ? 0.32 : 0.95, fin: 0.12, fo: 1.3,
            s1: kind === 1 ? 6 : 1.5, tw: kind === 2 ? rand(16, 28) : 0, rot: kind === 2 ? rand(0, 1) : 0, vr: kind === 2 ? rand(-4, 4) : 0 });
        if (!s) break;
        s.age = -delay;
      }
      // luminous front sweeping across the box
      const band = sprite('band', '#ffe2a0');
      let age = 0;
      O.ents.push({
        step(dt) { age += dt; return age < D / 1000; },
        draw(ctx, S, ox, oy) {
          const t = age / (D / 1000), ex = r.x + (edge0 - travel * t) * kx;
          const a = 0.6 * smooth(r.x - 40, r.x + 50, ex) * (1 - smooth(r.x + r.w - 50, r.x + r.w + 40, ex));
          if (a < 0.01) return;
          const bw = Sz * kx * 0.55, bh = r.h * 1.3;
          ctx.globalAlpha = a * (0.85 + 0.15 * Math.sin(age * 37));
          ctx.setTransform(S, 0, 0, S, ox, oy);
          ctx.drawImage(band, ex - bw / 2, r.cy - bh / 2, bw, bh);
        },
      });
      wake();
    }

    return new Promise((resolve) => {
      let done = false;
      const fin = () => {
        if (done) return;
        done = true;
        st.visibility = 'hidden';
        if (anim) { try { anim.cancel(); } catch (e) { /* ignore */ } }
        if (pfx) props.forEach((p, i) => { st[p] = saved[i]; });
        resolve();
      };
      if (anim && anim.finished) anim.finished.then(fin, fin);
      setTimeout(fin, D + 300);
    });
  }

  /** Remove every overlay particle now (pending trail promises resolve). */
  function clear() {
    O.ents.forEach((e) => { if (e.resolve) e.resolve(); });
    O.pieces.length = 0; O.sparks.length = 0; O.ents.length = 0;
    if (O.raf) { cancelAnimationFrame(O.raf); O.raf = 0; }
    if (O.ctx) { O.ctx.setTransform(1, 0, 0, 1, 0, 0); O.ctx.clearRect(0, 0, O.cv.width, O.cv.height); }
  }

  /** Debug/perf snapshot. */
  function stats() {
    return {
      bgFps: Math.round(1000 / B.ema), fxFps: Math.round(1000 / O.ema), quality: B.q, intensity: +B.I.toFixed(2),
      cubes: B.cubes.filter((c) => c.vis > 0.5).length, artSprites: B.artSpr,
      pieces: O.pieces.length, sparks: O.sparks.length, ents: O.ents.length, overlayRunning: !!O.raf,
    };
  }

  CH.fx = { initBackground, setBackgroundIntensity, confetti, burst, dissolve, trail, trailControl, bezierPoint, clear, stats };
})(window.CH = window.CH || {});
