/* 03a-art-brand.js — brand art as inline SVG strings: emblem, wordmark, Jerusalem skyline, book-cube.
   Pure string builders (no DOM). Real brand PNGs (window.CH_BRAND) win over the SVG recreations. */
(function (CH) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const EMBLEM_COLORS = ['#e63a35', '#3db54a', '#ec4f9c', '#17b8c4', '#f7941d', '#2a6fd6'];
  const COLOR_NAMES = { red: 0, green: 1, pink: 2, teal: 3, turquoise: 3, orange: 4, blue: 5 };
  const BRAND_ALT = 'חן התנ״ך';

  const N = (v) => Math.round(v * 10) / 10;                 // compact coordinates (0.1 precision)
  let seq = 0;
  const uid = (p) => p + (++seq).toString(36) + Math.random().toString(36).slice(2, 6);

  // ---- colour helpers ----
  function rgb(hex) {
    let s = String(hex || '').trim().replace('#', '');
    if (s.length === 3) s = s.replace(/./g, '$&$&');
    return /^[0-9a-f]{6}$/i.test(s) ? [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)) : null;
  }
  const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => v + (B[i] - v) * t)); };
  const tint = (c, t) => mix(c, '#ffffff', t);
  const shade = (c, t) => mix(c, '#000000', t);

  /** Real brand image (data URL) if one is configured at call time. */
  function brandImg(key) {
    const b = window.CH_BRAND, src = b && b[key];
    if (typeof src !== 'string' || !/^data:image\//i.test(src)) return '';
    return `<img class="brand-img" src="${src.replace(/"/g, '%22')}" alt="${BRAND_ALT}" draggable="false">`;
  }

  // ======================================================================
  // Emblem — hexagram tiled by six 60° rhombi in a white disc
  // ======================================================================
  function emblem({ shaded = false, ring = true } = {}) {
    const img = brandImg('emblem');
    if (img) return img;
    const id = uid('em'), c = 100;
    const R = ring ? 79 : 97;                       // star tip radius
    const s = R / Math.sqrt(3);                     // rhombus side
    const gap = R * 0.036;                          // white gap between rhombi
    const k = 1 - (gap / 2) / (s * Math.sin(Math.PI / 3) / 2);   // inset (homothety about rhombus centre)
    const P = (a, r) => [c + r * Math.cos(a), c + r * Math.sin(a)];
    const pts2 = (pts) => pts.map(([x, y]) => `${N(x)},${N(y)}`).join(' ');
    let defs = '', body = '';

    if (ring) {
      if (shaded) {
        defs += `<radialGradient id="${id}d" cx="42%" cy="34%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".72" stop-color="#f7f9fc"/><stop offset="1" stop-color="#e3eaf4"/></radialGradient>`;
        body += `<circle cx="${c}" cy="${c}" r="97" fill="url(#${id}d)"/><circle cx="${c}" cy="${c}" r="96.4" fill="none" stroke="#0a2a64" stroke-opacity=".1" stroke-width="1.2"/>`;
      } else {
        body += `<circle cx="${c}" cy="${c}" r="97" fill="#fff"/>`;
      }
    }

    const light = (-125 * Math.PI) / 180;           // light from the top-left
    EMBLEM_COLORS.forEach((col, i) => {
      const th = ((-90 + 60 * i) * Math.PI) / 180, d30 = Math.PI / 6;
      const mc = P(th, R / 2);
      const pts = [P(th, 0), P(th - d30, s), P(th, R), P(th + d30, s)]
        .map(([x, y]) => [mc[0] + (x - mc[0]) * k, mc[1] + (y - mc[1]) * k]);
      if (!shaded) { body += `<polygon points="${pts2(pts)}" fill="${col}"/>`; return; }

      // Shaded: soft gradient along the axis + bevelled facets + a fine inner highlight.
      const g = `${id}g${i}`;
      defs += `<linearGradient id="${g}" gradientUnits="userSpaceOnUse" x1="${N(pts[0][0])}" y1="${N(pts[0][1])}" x2="${N(pts[2][0])}" y2="${N(pts[2][1])}">` +
        `<stop offset="0" stop-color="${tint(col, 0.28)}"/><stop offset=".5" stop-color="${col}"/><stop offset="1" stop-color="${shade(col, 0.12)}"/></linearGradient>`;
      body += `<polygon points="${pts2(pts)}" fill="url(#${g})"/>`;
      [[pts[0], pts[1], pts[2], th - Math.PI / 2], [pts[0], pts[2], pts[3], th + Math.PI / 2]].forEach(([a, b, t, n]) => {
        const lam = Math.cos(n - light);
        body += lam > 0
          ? `<polygon points="${pts2([a, b, t])}" fill="#fff" fill-opacity="${N(lam * 0.16 * 100) / 100}"/>`
          : `<polygon points="${pts2([a, b, t])}" fill="#001030" fill-opacity="${N(-lam * 0.14 * 100) / 100}"/>`;
      });
      const hi = pts.map(([x, y]) => [mc[0] + (x - mc[0]) * 0.86, mc[1] + (y - mc[1]) * 0.86]);
      body += `<polygon points="${pts2(hi)}" fill="none" stroke="#fff" stroke-opacity=".32" stroke-width=".7" stroke-linejoin="round"/>`;
    });

    return `<svg class="art-emblem" xmlns="${NS}" viewBox="0 0 200 200" role="img" aria-label="${BRAND_ALT}">` +
      (defs ? `<defs>${defs}</defs>` : '') + body + '</svg>';
  }

  // ======================================================================
  // Wordmark — "חן" over "התנ״ך", Frank Ruhl Libre, white
  // ======================================================================
  function wordmark({ color = '#fff' } = {}) {
    const img = brandImg('wordmark');
    if (img) return img;
    const font = `font-family="FrankRuhl, 'Frank Ruhl Libre', 'NotoSerifHeb', serif"`;
    // Fine ornamental rule: two hairlines tapering into a small diamond flanked by dots.
    const rule = `<path d="M18 239.2h63.5l4 .8-4 .8H18zM182 239.2h-63.5l-4 .8 4 .8H182z"/>` +
      `<path d="M100 232.5l7.5 7.5-7.5 7.5-7.5-7.5z"/><circle cx="88.6" cy="240" r="1.5"/><circle cx="111.4" cy="240" r="1.5"/>`;
    return `<svg class="art-wordmark" xmlns="${NS}" viewBox="0 0 200 330" role="img" aria-label="${BRAND_ALT}">` +
      `<g fill="${color}">` +
      `<text x="100" y="196" ${font} font-size="214" font-weight="900" text-anchor="middle" direction="rtl">חן</text>` +
      rule +
      `<text x="100" y="304" ${font} font-size="76" font-weight="700" letter-spacing="2" text-anchor="middle" direction="rtl">התנ״ך</text>` +
      '</g></svg>';
  }

  // ======================================================================
  // Skyline — Jerusalem in white, layered paper-cut planes
  // ======================================================================
  const SW = 3840, SH = 320, FLOOR = 304;   // FLOOR: hidden base line for buildings

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Path snippets (absolute coordinates)
  const rect = (x, y, w, h) => `M${N(x)} ${N(y)}h${N(w)}v${N(h)}h${N(-w)}z`;
  const arch = (x, y, w, h) => { const r = w / 2; return `M${N(x)} ${N(y + h)}V${N(y + r)}a${N(r)} ${N(r)} 0 0 1 ${N(w)} 0V${N(y + h)}z`; };
  const pointed = (x, y, w, h, k = 0.8) => {
    const R = w * k, rise = Math.sqrt(R * R - (R - w / 2) ** 2);
    return `M${N(x)} ${N(y + h)}V${N(y + rise)}A${N(R)} ${N(R)} 0 0 1 ${N(x + w / 2)} ${N(y)}A${N(R)} ${N(R)} 0 0 1 ${N(x + w)} ${N(y + rise)}V${N(y + h)}z`;
  };
  const dome = (cx, by, rx, ry) => `M${N(cx - rx)} ${N(by)}A${N(rx)} ${N(ry)} 0 0 1 ${N(cx + rx)} ${N(by)}z`;
  const ell = (cx, cy, rx, ry = rx) => `M${N(cx - rx)} ${N(cy)}a${N(rx)} ${N(ry)} 0 1 0 ${N(2 * rx)} 0a${N(rx)} ${N(ry)} 0 1 0 ${N(-2 * rx)} 0z`;
  const poly = (pts) => 'M' + pts.map(([x, y]) => `${N(x)} ${N(y)}`).join('L') + 'z';
  const el = (d, eo) => `<path${eo ? ' fill-rule="evenodd"' : ''} d="${d}"/>`;
  const slit = (x, y, h = 9) => arch(x, y, 2.4, h);

  /** Open Catmull–Rom spline through pts → "C…" segments (caller emits the M). */
  function spline(pts, tension = 1) {
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + ((p2[0] - p0[0]) / 6) * tension, p1[1] + ((p2[1] - p0[1]) / 6) * tension];
      const c2 = [p2[0] - ((p3[0] - p1[0]) / 6) * tension, p2[1] - ((p3[1] - p1[1]) / 6) * tension];
      d += `C${N(c1[0])} ${N(c1[1])} ${N(c2[0])} ${N(c2[1])} ${N(p2[0])} ${N(p2[1])}`;
    }
    return d;
  }

  /** Smooth ground line y(x) through control points (cubic Hermite, finite-difference slopes). */
  function contour(cp) {
    const m = cp.map((p, i) => {
      const a = cp[Math.max(0, i - 1)], b = cp[Math.min(cp.length - 1, i + 1)];
      return (b[1] - a[1]) / (b[0] - a[0] || 1);
    });
    const y = (x) => {
      let i = 0;
      while (i < cp.length - 2 && x > cp[i + 1][0]) i++;
      const [x0, y0] = cp[i], [x1, y1] = cp[i + 1], h = x1 - x0, t = Math.max(0, Math.min(1, (x - x0) / h));
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1];
    };
    // Exact Bézier form of the same Hermite curve, closed down to the bottom edge.
    let d = `M${cp[0][0]} ${SH}V${N(cp[0][1])}`;
    for (let i = 0; i < cp.length - 1; i++) {
      const [x0, y0] = cp[i], [x1, y1] = cp[i + 1], h = x1 - x0;
      d += `C${N(x0 + h / 3)} ${N(y0 + (m[i] * h) / 3)} ${N(x1 - h / 3)} ${N(y1 - (m[i + 1] * h) / 3)} ${N(x1)} ${N(y1)}`;
    }
    d += `V${SH}z`;
    return { y, d };
  }

  /** Block with a crenellated top (Jerusalem merlons: rectangles with small pyramidal caps). */
  function cren(x0, x1, y, bottom = FLOOR, m = {}) {
    const mw = m.w || 9, gap = m.gap || 6.5, mh = m.h || 6.5, cap = m.cap == null ? 3 : m.cap;
    const n = Math.max(1, Math.round((x1 - x0 + gap) / (mw + gap)));
    const w = (x1 - x0 - (n - 1) * gap) / n;
    let d = `M${N(x0)} ${N(bottom)}V${N(y - mh)}`;
    for (let i = 0; i < n; i++) {
      d += `l${N(w / 2)} ${N(-cap)}l${N(w / 2)} ${N(cap)}`;
      if (i < n - 1) d += `v${N(mh)}h${N(gap)}v${N(-mh)}`;
    }
    return d + `V${N(bottom)}z`;
  }

  // ---- reusable silhouettes (defined once, placed with translate-only <use>, so halos stay uniform) ----
  function cypressD(h, { lean = 0, asym = 1, slim = 1 } = {}) {
    const w = h * 0.2 * slim, tw = w * 0.07;
    const prof = [[0.035, 0.4], [0.12, 0.49], [0.25, 0.5], [0.41, 0.45], [0.57, 0.36], [0.72, 0.26], [0.85, 0.15], [0.94, 0.06]];
    const lx = (t) => lean * w * t * t;
    const right = prof.map(([t, hw]) => [lx(t) + hw * w * (2 - asym) / 2, -t * h]);
    const left = prof.slice().reverse().map(([t, hw]) => [lx(t) - (hw * w * asym) / 2, -t * h]);
    const tip = [lx(1), -h];
    return `M${N(tw)} 2V${N(-0.02 * h)}L${N(right[0][0])} ${N(right[0][1])}` + spline([...right, tip]) +
      spline([tip, ...left]) + `L${N(-tw)} ${N(-0.02 * h)}V2z`;
  }

  function oliveD(W, H, seed) {
    const r = rng(seed);
    // Gnarled trunk splitting into two limbs
    const T = [[-0.06, 0.05], [-0.04, -0.12], [-0.065, -0.25], [-0.03, -0.37], [-0.15, -0.52], [-0.13, -0.545], [-0.005, -0.44],
      [0.025, -0.46], [0.15, -0.56], [0.165, -0.535], [0.055, -0.37], [0.04, -0.24], [0.07, -0.11], [0.075, 0.05]];
    const trunk = poly(T.map(([x, y]) => [x * W, y * H]));
    // Airy crown: clumps on an ellipse envelope, scalloped with small bumps
    let crown = '';
    const clumps = [[-0.31, -0.6, 0.17], [-0.13, -0.76, 0.2], [0.1, -0.79, 0.19], [0.31, -0.64, 0.17], [-0.02, -0.6, 0.22], [-0.43, -0.5, 0.085], [0.44, -0.52, 0.08]];
    clumps.forEach(([cx, cy, rr], i) => {
      const jx = (r() - 0.5) * 0.04, jy = (r() - 0.5) * 0.04;
      const X = (cx + jx) * W, Y = (cy + jy) * H, RX = rr * W, RY = rr * W * 0.62;
      crown += ell(X, Y, RX, RY);
      if (i < 5) for (let a = -165; a <= -15; a += 30 + r() * 12) {
        const t = (a * Math.PI) / 180, br = W * (0.035 + r() * 0.025);
        crown += ell(X + Math.cos(t) * RX * 0.92, Y + Math.sin(t) * RY * 0.92, br, br * 0.85);
      }
    });
    return `<path d="${trunk}"/><path d="${crown}"/>`;
  }

  /** Assemble paper-cut planes: every plane is knocked out (with a thin halo) by all planes in front of it. */
  function assemble(defs, planes, halo = 5) {
    let s = `<defs>${defs}<linearGradient id="@f" x2="${SW}" gradientUnits="userSpaceOnUse">` +
      '<stop offset="0" stop-color="#000"/><stop offset=".045" stop-color="#fff"/><stop offset=".955" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>';
    planes.forEach(([els], i) => { s += `<g id="@p${i}">${els.join('')}</g>`; });
    planes.forEach((_, i) => {
      s += `<mask id="@m${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${SW}" height="${SH}"><rect width="${SW}" height="${SH}" fill="url(#@f)"/>`;
      if (i < planes.length - 1) {
        s += `<g fill="#000" stroke="#000" color="#000" stroke-width="${halo}" stroke-linejoin="round">`;
        for (let j = i + 1; j < planes.length; j++) s += `<use href="#@p${j}"/>`;
        s += '</g>';
      }
      s += '</mask>';
    });
    s += '</defs><g fill="#fff" color="#fff">';
    planes.forEach(([, op], i) => { s += `<g mask="url(#@m${i})"${op < 1 ? ` opacity="${op}"` : ''}><use href="#@p${i}"/></g>`; });
    return s + '</g>';
  }

  // ---- landmarks ----
  /** Hurva-like synagogue: cubic hall, corner turrets, tall arcaded drum, great dome, lantern. */
  function hurva(cx) {
    const o = [], bw = 220, bx = cx - bw / 2, by = 150;
    o.push(el(rect(bx, by, bw, FLOOR - by) + arch(cx - 10, 163, 20, 70) + arch(cx - 64, 170, 13, 60) + arch(cx + 51, 170, 13, 60) +
      rect(bx + 4, by + 5, bw - 8, 1.4), true));
    o.push(el(rect(bx - 5, by - 5, bw + 10, 5.5)));                          // cornice
    [bx - 2, bx + bw - 24].forEach((tx) => {                                // corner turrets
      o.push(el(rect(tx, by - 30, 26, 30) + arch(tx + 10, by - 24, 6, 14), true));
      o.push(el(rect(tx - 2.5, by - 34, 31, 4.5) + dome(tx + 13, by - 34, 11, 10) + rect(tx + 12.3, by - 50, 1.4, 7)));
    });
    const dw = 128, dx = cx - dw / 2, dt = 98;                              // drum with arcade
    let d = rect(dx, dt, dw, by - dt + 1);
    for (let i = 0; i < 6; i++) d += arch(dx + 9 + i * 19.6, dt + 13, 10, 29);
    d += rect(dx + 3, by - 7, dw - 6, 1.3);
    o.push(el(d, true));
    o.push(el(rect(dx - 5, dt - 5, dw + 10, 5.5) + rect(dx - 1, dt - 8, dw + 2, 3.5)));
    o.push(el(dome(cx, dt - 8, 63, 60)));                                   // great dome
    o.push(el(rect(cx - 7.5, dt - 80, 15, 13) + rect(cx - 9, dt - 81.5, 18, 2.5) + dome(cx, dt - 81.5, 8, 7.5) +
      rect(cx - 0.7, dt - 97, 1.4, 9) + ell(cx, dt - 91, 1.8)));            // lantern + finial
    return o;
  }

  /** Tower of David: citadel corner tower carrying the slender minaret with two balcony rings. */
  function davidTower(cx, top) {
    const o = [];
    o.push(el(cren(cx - 34, cx + 34, top, FLOOR, { w: 8.5, gap: 6, h: 6, cap: 2.5 }) + slit(cx - 18, top + 14) + slit(cx + 15.6, top + 14) +
      rect(cx - 32, top + 4, 64, 1.3), true));
    o.push(el(poly([[cx - 21, top], [cx - 21, top - 9], [cx - 16, top - 14], [cx + 16, top - 14], [cx + 21, top - 9], [cx + 21, top]])));
    let d = rect(cx - 14, top - 70, 28, 57) + arch(cx - 2.6, top - 44, 5.2, 15) + arch(cx - 2.2, top - 62, 4.4, 10) + rect(cx - 14, top - 30, 28, 1.3);
    o.push(el(d, true));                                                     // lower shaft
    const ring = (y, w0, w1) => {                                            // corbel + slab + pierced parapet
      let p = poly([[cx - w0 / 2, y + 9], [cx - w1 / 2, y + 1], [cx + w1 / 2, y + 1], [cx + w0 / 2, y + 9]]) + rect(cx - w1 / 2 - 2.5, y - 2.5, w1 + 5, 3.5);
      let q = rect(cx - w1 / 2, y - 10.5, w1, 8.2);
      const n = Math.floor((w1 - 4) / 5.6);
      for (let i = 0; i < n; i++) q += rect(cx - (n * 5.6) / 2 + i * 5.6 + 1.6, y - 8.6, 2.4, 4.6);
      o.push(el(p), el(q, true));
    };
    ring(top - 79, 28, 42);
    o.push(el(rect(cx - 10, top - 120, 20, 32) + arch(cx - 2.2, top - 112, 4.4, 11), true));   // upper shaft
    ring(top - 125, 20, 32);
    o.push(el(rect(cx - 8, top - 147, 16, 12) + arch(cx - 5.6, top - 144.5, 3.6, 7.5) + arch(cx + 2, top - 144.5, 3.6, 7.5), true));
    o.push(el(rect(cx - 9.6, top - 150, 19.2, 3.2) + dome(cx, top - 150, 8.4, 8.5) + rect(cx - 0.7, top - 172, 1.4, 15) + ell(cx, top - 162, 2.1) + ell(cx, top - 169, 1.3)));
    return o;
  }

  /** Jaffa-Gate-like gatehouse: crenellated block, pointed arch in a recessed frame, machicolation. */
  function gate(x0, x1, top, ground) {
    const cx = (x0 + x1) / 2, aw = 36, at = ground - 58;
    let d = cren(x0, x1, top, FLOOR, { w: 9, gap: 6.5 }) + rect(x0 + 3, top + 5, x1 - x0 - 6, 1.3);
    d += rect(cx - 27, at - 9, 54, ground - at + 9) + rect(cx - 25.4, at - 7.4, 50.8, ground - at + 9);  // thin frame line
    d += pointed(cx - aw / 2, at, aw, ground - at + 4, 0.78);
    d += rect(cx - 12, top + 13, 24, 1.2) + rect(cx - 12, top + 22, 24, 1.2);  // inscription panel lines
    d += slit(x0 + 14, top + 20) + slit(x1 - 16.4, top + 20);
    const o = [el(d, true)];
    // machicolation box on corbels above the arch
    o.push(el(rect(cx - 11, at - 30, 22, 13) + poly([[cx - 11, at - 17], [cx - 7, at - 12], [cx - 4, at - 17]]) + poly([[cx - 2, at - 17], [cx, at - 12], [cx + 2, at - 17]]) +
      poly([[cx + 4, at - 17], [cx + 7, at - 12], [cx + 11, at - 17]])));
    return o;
  }

  /** A dome on a drum on a cubic base (secondary domes). */
  function domed(cx, baseTop, bw, dw, drumH, rx, ry, opts = {}) {
    const o = [];
    let d = rect(cx - bw / 2, baseTop, bw, FLOOR - baseTop);
    if (opts.windows) for (let i = 0; i < opts.windows; i++) d += arch(cx - (opts.windows * 14) / 2 + i * 14 + 4, baseTop + 9, 6, 16);
    o.push(el(d, true), el(rect(cx - bw / 2 - 3, baseTop - 3, bw + 6, 3.5)));
    d = rect(cx - dw / 2, baseTop - drumH, dw, drumH);
    const nw = Math.max(2, Math.floor(dw / 13));
    for (let i = 0; i < nw; i++) d += arch(cx - dw / 2 + (dw / nw) * (i + 0.5) - 2.6, baseTop - drumH + 5, 5.2, drumH - 9);
    o.push(el(d, true), el(rect(cx - dw / 2 - 2.5, baseTop - drumH - 2.5, dw + 5, 3)));
    o.push(el(dome(cx, baseTop - drumH - 2.5, rx, ry) + (opts.finial ? rect(cx - 0.6, baseTop - drumH - ry - 12, 1.2, 11) + ell(cx, baseTop - drumH - ry - 7, 1.7) : '')));
    return o;
  }

  /** Montefiore-style windmill: tapered stone tower, domed cap, lattice sails (stroked). */
  function windmill(cx, ground) {
    const o = [], top = ground - 66;
    let d = poly([[cx - 20, ground + 6], [cx - 14, top], [cx + 14, top], [cx + 20, ground + 6]]);
    d += arch(cx - 3, top + 16, 6, 11) + arch(cx - 2.6, top + 38, 5.2, 9) + rect(cx - 15, top + 6, 30, 1.3);
    o.push(el(d, true));
    o.push(el(`M${N(cx - 17)} ${N(top + 1)}Q${N(cx - 16)} ${N(top - 15)} ${N(cx)} ${N(top - 18)}Q${N(cx + 16)} ${N(top - 15)} ${N(cx + 17)} ${N(top + 1)}z` + ell(cx, top - 19, 2)));
    const hx = cx, hy = top - 5;
    let sp = '', lat = '';
    [24, 114, 204, 294].forEach((deg) => {
      const a = (deg * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, L = 56;
      sp += `M${N(hx)} ${N(hy)}l${N(ux * L)} ${N(uy * L)}`;
      const P = (s, t) => `${N(hx + ux * s + vx * t)} ${N(hy + uy * s + vy * t)}`;
      lat += `M${P(14, 0)}L${P(14, 8.5)}L${P(L, 8.5)}L${P(L, 0)}`;
      for (let s = 20; s < L; s += 6) lat += `M${P(s, 0)}L${P(s, 8.5)}`;
    });
    o.push(`<path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" d="${sp}"/>`);
    o.push(`<path fill="none" stroke="currentColor" stroke-width="1.1" d="${lat}"/>`);
    o.push(el(ell(hx, hy, 3.2)));
    return o;
  }

  /** Row of Old-City stone houses: flat roofs, little domes, roof rooms, arched windows. */
  function houses(out, x0, x1, rnd, env, opts = {}) {
    const clip = opts.clip || 0;  // windows only above this y (hidden part behind the wall)
    let x = x0;
    while (x < x1 - 12) {
      const w = Math.min(x1 - x, (opts.wMin || 22) + rnd() * (opts.wVar || 44));
      const top = env(x + w / 2) + (rnd() - 0.5) * (opts.jitter || 22);
      let d = rect(x, top, w, FLOOR - top);
      const wy = top + 6 + rnd() * 4;
      if (!clip || wy + 9 < clip - 2) {
        const n = Math.max(1, Math.floor((w - 6) / 11)), pair = rnd() < 0.35 && n >= 2;
        for (let i = 0; i < n; i++) {
          if (pair && i % 2) continue;
          const wx = x + w / 2 - (n * 11) / 2 + i * 11 + 3.3;
          d += pair ? arch(wx, wy, 4, 8.5) + arch(wx + 5.2, wy, 4, 8.5) : arch(wx, wy, 4.2, 8.5);
        }
      }
      out.push(el(d, true));
      const q = rnd();
      if (q < 0.42 && w > 26) {
        const rx = w * (0.24 + rnd() * 0.1), cxd = x + w * (0.36 + rnd() * 0.28);
        out.push(el(rect(cxd - rx, top - 2.5, rx * 2, 3) + dome(cxd, top - 2.5, rx, rx * (0.55 + rnd() * 0.25))));
      } else if (q < 0.64) {
        const rw = w * (0.3 + rnd() * 0.22), rx0 = rnd() < 0.5 ? x + 3 : x + w - rw - 3;
        out.push(el(rect(rx0, top - 9, rw, 9.5)));
      } else if (q < 0.8) {
        out.push(el(rect(x - 1, top - 2.2, w + 2, 2.4)));
      }
      x += w;
    }
  }

  function buildFront() {
    const rnd = rng(1948);
    const city = [], mid = [], land = [], wall = [], fore = [];
    const defs = [];
    // tree silhouettes
    const CY = { a: [62, {}], b: [82, { lean: 0.15, asym: 1.06 }], c: [102, { lean: -0.1 }], d: [124, { slim: 0.9, lean: 0.12, asym: 0.95 }], e: [146, { slim: 0.86, lean: -0.08 }] };
    Object.entries(CY).forEach(([k, [h, o]]) => defs.push(`<path id="@c${k}" d="${cypressD(h, o)}"/>`));
    defs.push(`<g id="@oa">${oliveD(60, 44, 3)}</g>`, `<g id="@ob">${oliveD(80, 54, 11)}</g>`, `<g id="@oc">${oliveD(100, 64, 23)}</g>`);
    const use = (k, x, y) => `<use href="#@${k}" x="${N(x)}" y="${N(y)}"/>`;

    // ---- ground lines ----
    const gCity = contour([[0, 282], [300, 266], [620, 256], [900, 250], [1920, 246], [2900, 252], [3240, 258], [3560, 268], [3840, 284]]);
    const gWall = contour([[0, 294], [240, 286], [520, 276], [760, 268], [900, 268], [2800, 268], [3000, 262], [3200, 270], [3460, 280], [3700, 288], [3840, 296]]);
    const gFore = contour([[0, 306], [240, 300], [500, 294], [720, 290], [880, 293], [1200, 295], [1600, 294], [1920, 296], [2300, 294], [2720, 292], [2900, 288], [3140, 290], [3380, 296], [3640, 300], [3840, 306]]);

    // ---- city plane (behind the walls) ----
    city.push(el(gCity.d));
    const env = (x) => 196 - 34 * Math.exp(-(((x - 1920) / 640) ** 2));
    houses(city, 900, 2790, rnd, env, { clip: 204 });
    houses(city, 330, 860, rnd, (x) => gCity.y(x) - 22, { wMin: 18, wVar: 26, jitter: 10 });
    houses(city, 2860, 3330, rnd, (x) => gCity.y(x) - 22, { wMin: 18, wVar: 26, jitter: 10 });
    [[1130, 'c'], [1470, 'd'], [1502, 'b'], [2150, 'd'], [2172, 'b'], [2490, 'c'], [2680, 'd'], [2700, 'b'], [980, 'b']].forEach(([x, k]) => city.push(use('c' + k, x, 200)));
    [[120, 'ob'], [200, 'oa'], [470, 'oc'], [3420, 'ob'], [3560, 'oc'], [3700, 'oa']].forEach(([x, k]) => city.push(use(k, x, gCity.y(x) + 2)));
    [[60, 'b'], [540, 'c'], [3490, 'd'], [3770, 'b']].forEach(([x, k]) => city.push(use('c' + k, x, gCity.y(x) + 2)));

    // ---- mid plane: secondary domes ----
    mid.push(...domed(1712, 178, 66, 38, 15, 21, 19, { finial: true }));
    mid.push(...domed(2262, 168, 110, 52, 20, 30, 27, { windows: 3, finial: true }));
    mid.push(use('cd', 1790, 206), use('ce', 2060, 206), use('cc', 2078, 206), use('cc', 1648, 206));

    // ---- landmark plane: Hurva at the centre, windmill outside the walls ----
    land.push(...hurva(1920));
    land.push(...windmill(3000, gWall.y(3000) - 6));

    // ---- wall plane: walls, towers, Jaffa Gate, citadel with the Tower of David ----
    wall.push(el(gWall.d));
    const W = (x0, x1, top, m) => wall.push(el(cren(x0, x1, top, FLOOR, m) + rect(x0 + 1, top + 4.5, x1 - x0 - 2, 1.2), true));
    const tower = (x0, x1, top) => wall.push(el(cren(x0, x1, top, FLOOR, { w: 8, gap: 6 }) + rect(x0 + 2, top + 4.5, x1 - x0 - 4, 1.2) +
      slit((x0 + x1) / 2 - 1.2, top + 18) + slit((x0 + x1) / 2 - 1.2, top + 40), true));
    tower(866, 928, 182);
    W(928, 1080, 210);
    tower(1080, 1118, 192);
    W(1118, 1206, 208);
    wall.push(...gate(1206, 1316, 176, gFore.y(1261)));
    W(1316, 1354, 198);
    wall.push(...davidTower(1388, 168));
    W(1422, 1548, 190, { w: 8.5, gap: 6 });
    wall.push(el(cren(1548, 1646, 148, FLOOR, { w: 9, gap: 6.5, h: 7 }) + rect(1550, 152.5, 94, 1.3) + arch(1606, 168, 8, 16) + slit(1572, 170) + slit(1626, 170) +
      slit(1572, 200) + slit(1626, 200), true));
    wall.push(el(cren(1556, 1584, 132, 150, { w: 7, gap: 5, h: 5, cap: 2 }) + slit(1568.8, 138, 7), true));    // turret
    W(1646, 1766, 204);
    tower(1766, 1802, 188);
    W(1802, 2084, 206);
    tower(2084, 2124, 186);
    W(2124, 2402, 206);
    tower(2402, 2444, 188);
    W(2444, 2586, 208);
    tower(2586, 2622, 192);
    W(2622, 2742, 210);
    tower(2742, 2806, 182);
    // Mishkenot-style long house with crenellated parapet, at the foot of the windmill
    let mk = cren(2862, 3110, 256, FLOOR, { w: 6, gap: 5, h: 4.5, cap: 1.6 });
    for (let x = 2872; x < 3100; x += 13) mk += arch(x, 263, 5, 11);
    wall.push(el(mk, true));
    // a few outlying domed houses
    houses(wall, 560, 690, rnd, (x) => gWall.y(x) - 24, { wMin: 22, wVar: 20, jitter: 8 });
    houses(wall, 3240, 3360, rnd, (x) => gWall.y(x) - 24, { wMin: 22, wVar: 20, jitter: 8 });

    // ---- foreground: hill, olive groves, cypresses ----
    fore.push(el(gFore.d));
    [[300, 'ob'], [420, 'oa'], [612, 'oc'], [742, 'ob'], [3170, 'oc'], [3290, 'ob'], [3420, 'oa'], [3640, 'ob'], [120, 'oa'], [3790, 'oa']].forEach(([x, k]) => fore.push(use(k, x, gFore.y(x) + 3)));
    [[812, 'd'], [834, 'b'], [1010, 'c'], [2520, 'c'], [2542, 'a'], [2830, 'e'], [2852, 'c'], [3112, 'b'], [3360, 'c'], [3500, 'b'], [210, 'c'], [520, 'b'], [3740, 'c']]
      .forEach(([x, k]) => fore.push(use('c' + k, x, gFore.y(x) + 3)));

    return assemble(defs.join(''), [[city, 0.5], [mid, 0.78], [land, 1], [wall, 1], [fore, 1]]);
  }

  function buildBack() {
    const rnd = rng(70);
    const far = [], near = [];
    const defs = [`<path id="@cs" d="${cypressD(40, {})}"/>`, `<path id="@ct" d="${cypressD(54, { lean: 0.1 })}"/>`];
    const use = (k, x, y) => `<use href="#@${k}" x="${N(x)}" y="${N(y)}"/>`;
    const ridge = contour([[0, 214], [260, 196], [560, 184], [820, 192], [1100, 176], [1400, 168], [1700, 178], [2000, 170], [2300, 150], [2560, 158],
      [2820, 172], [3100, 166], [3380, 184], [3640, 196], [3840, 210]]);
    far.push(el(ridge.d));
    const hills = contour([[0, 246], [300, 232], [620, 222], [900, 228], [1200, 218], [1560, 222], [1920, 214], [2300, 220], [2700, 216], [3000, 224],
      [3300, 218], [3600, 232], [3840, 244]]);
    near.push(el(hills.d));
    // distant villages along the hills
    [[180, 420], [700, 980], [1240, 1520], [1700, 2140], [2360, 2640], [2900, 3180], [3420, 3640]].forEach(([a, b]) =>
      houses(near, a, b, rnd, (x) => hills.y(x) - 14, { wMin: 12, wVar: 18, jitter: 10 }));
    // distant towers and domes on the ridge
    near.push(...domed(1330, hills.y(1330) - 26, 40, 22, 10, 12, 11, {}));
    near.push(...domed(2890, hills.y(2890) - 22, 34, 20, 8, 11, 10, {}));
    near.push(el(cren(2600, 2626, hills.y(2613) - 70, FLOOR, { w: 6, gap: 4, h: 4, cap: 1.5 }) + slit(2611.8, hills.y(2613) - 58, 8)));
    near.push(el(cren(980, 1004, hills.y(992) - 58, FLOOR, { w: 6, gap: 4, h: 4, cap: 1.5 })));
    near.push(el(rect(2210, hills.y(2216) - 58, 14, 60) + rect(2208, hills.y(2216) - 61, 18, 3) + dome(2217, hills.y(2216) - 61, 7, 7)));
    // cypress rows
    for (let x = 90; x < SW - 60; x += 40 + rnd() * 120) near.push(use(rnd() < 0.5 ? 'cs' : 'ct', x, hills.y(x) + 2));
    return assemble(defs.join(''), [[far, 0.55], [near, 1]], 3);
  }

  const skyCache = {};
  /** skyline('front'|'back') → SVG string (wide viewBox 3840×320, white silhouettes). */
  function skyline(layer = 'front') {
    const key = layer === 'back' ? 'back' : 'front';
    if (!skyCache[key]) skyCache[key] = key === 'back' ? buildBack() : buildFront();
    const id = uid('sk');
    return `<svg class="art-skyline art-skyline-${key}" xmlns="${NS}" viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false" style="will-change:transform">` +
      skyCache[key].replace(/@/g, id) + '</svg>';
  }

  // ======================================================================
  // Book-cube — isometric hardcover book (standalone SVG: no fonts, no CSS vars)
  // ======================================================================
  // Frank Ruhl Libre (OFL) Hebrew letter outlines, bold: 'x0 y0 x1 y1|path' in 200 units/em, y-down, baseline 0.
  const GLYPHS = {'א':'7 -119 103 2|M88 2Q88 1 87-2Q86-4 83-8L16-83Q12-87 11-90Q11-94 11-97Q11-104 13-109Q16-115 18-119H22V-118Q22-115 24-113Q26-111 28-109L91-38Q95-34 97-29Q99-24 99-18Q99-12 97-7Q95-2 92 2ZM7 0V-7H11Q14-7 15-9Q15-12 13-19L11-29Q10-35 10-39Q11-43 13-48Q15-53 20-61L28-74L34-67L29-58Q26-54 26-50Q25-46 27-43L37-25Q41-17 41-11Q42-5 40 0ZM80-48 71-58Q71-61 73-64Q75-67 77-70L82-76L89-75L86-71Q83-66 81-62Q80-59 80-55Q79-52 80-48ZM97-71Q96-73 95-74Q94-74 90-75L78-77Q70-78 68-82Q65-87 65-93Q65-102 68-109Q71-116 72-119H76V-117Q76-114 77-112Q78-110 82-110L92-109Q98-108 100-103Q103-99 103-92Q103-87 102-82Q101-77 99-71Z','ב':'6 -119 92 0|M6 0 12-34H69Q72-39 73-42Q74-46 75-49Q75-53 75-58Q75-65 74-69Q73-73 69-74Q66-76 60-76H24Q17-76 14-80Q11-84 11-91Q11-98 13-104Q14-110 16-114Q17-118 18-119H22V-115Q22-112 23-111Q24-110 26-110H66Q72-110 76-108Q80-105 83-101Q85-96 85-89V-60Q85-51 83-44Q81-38 79-34H92L86 0Z','ג':'4 -119 71 0|M4 0 11-34H35Q39-34 41-37Q44-40 45-44Q46-48 46-52L47-65Q47-70 46-72Q44-74 40-75L25-77Q19-78 17-80Q15-83 15-89Q15-97 17-105Q20-113 22-119H26V-116Q26-113 27-112Q29-111 33-110L48-108Q54-107 56-104Q59-101 59-93L57-65Q57-60 58-55Q59-50 61-46Q63-42 65-38Q67-34 68-30Q71-23 71-15Q71-8 70 0H66Q65-8 63-13Q61-19 58-23Q54-28 49-32L37 0Z','ד':'4 -119 86 1|M19-76Q11-76 8-79Q4-83 4-92Q4-99 5-104Q7-110 8-114Q10-118 10-119H14V-116Q14-113 15-112Q17-110 20-110H79Q83-110 85-108Q86-106 86-103V-76ZM60 1Q59 1 58 1Q56 1 55 0V-1Q56-3 57-5Q57-7 57-15V-46Q57-56 60-62Q62-69 65-72Q68-75 68-75V-82H77V-76Q74-72 72-68Q71-65 70-61Q70-57 70-50L72-15Q72-6 69-3Q65 1 60 1Z','ה':'11 -119 96 1|M81 1Q80 1 79 1Q78 1 77 0V-1Q78-3 78-6Q79-8 79-15V-47Q79-57 80-63Q81-69 83-72Q84-75 85-75V-76H26Q19-76 15-79Q11-82 11-92Q11-99 13-104Q14-110 16-114Q17-118 17-119H21V-117Q21-113 23-112Q24-110 27-110H91Q96-110 96-105V-78L94-76Q91-73 91-66Q90-59 91-48L93-18Q94-8 91-4Q88 1 81 1ZM17 1Q15 1 12 0V-1Q13-2 14-4Q14-6 14-9V-38Q14-48 18-53Q21-58 26-58Q27-58 27-58Q28-58 29-57V-56Q28-55 27-53Q27-50 27-47L28-14Q29-6 25-3Q22 1 17 1Z','ו':'6 -120 53 1|M42 1Q41 1 39 1Q38 1 37 0V-1Q38-3 39-5Q39-7 39-15V-60Q39-69 37-71Q36-74 30-75L14-77Q9-78 8-81Q6-85 6-90Q6-96 7-102Q9-108 11-113Q13-118 13-120H17V-117Q17-114 18-112Q19-111 22-110L36-108Q44-107 46-103Q48-98 49-89L53-18Q53-9 51-4Q48 1 42 1Z','ז':'6 -119 52 1|M32 1Q31 1 29 1Q28 1 27 0V-1Q28-2 28-5Q29-7 27-15L22-40Q21-47 21-53Q21-59 23-65Q24-71 27-78L33-77Q32-73 32-66Q31-60 33-51L41-18Q43-9 41-4Q38 1 32 1ZM44-70Q44-71 43-72Q43-73 40-73L19-77Q11-78 9-81Q6-84 6-91Q6-97 7-103Q9-108 11-113Q12-117 13-119H17V-117Q17-114 18-112Q19-111 23-110L39-108Q46-107 49-102Q52-97 52-90Q52-82 49-77Q47-72 46-70Z','ח':'12 -119 98 1|M84 1Q82 1 81 1Q80 1 79 0V-1Q80-3 81-6Q81-8 81-15V-47Q81-57 82-63Q84-69 86-72Q87-75 88-75V-76H26Q20-76 16-79Q12-82 12-92Q12-99 14-104Q15-110 17-114Q18-118 18-119H22V-117Q22-113 24-112Q25-110 28-110H93Q98-110 98-105V-78L96-76Q94-73 93-66Q92-59 93-48L96-18Q96-9 93-4Q90 1 84 1ZM19 1Q18 1 17 1Q16 1 15 0V-1Q16-2 16-4Q17-6 17-11V-46Q17-54 20-60Q22-67 25-70Q27-74 29-75V-80H36V-76Q34-72 32-66Q29-59 29-48L31-13Q31-7 28-3Q25 1 19 1Z','ט':'7 -119 101 0|M24 0Q23-7 22-14Q20-21 19-28Q18-35 17-40Q16-46 16-50Q16-58 19-66Q21-74 22-78L30-76Q29-73 28-68Q27-63 27-57Q27-53 28-49Q28-46 29-42Q30-38 31-33H87Q89-39 90-45Q92-51 92-58Q92-69 88-74Q84-79 75-79Q72-79 69-78Q66-77 63-74Q59-71 57-66L56-62H50L52-72Q53-83 57-92Q60-101 65-107Q70-112 78-112Q85-112 89-108Q94-105 96-98Q99-92 100-84Q101-76 101-67Q101-57 100-46Q98-36 94-25Q90-14 84 0ZM38-71Q38-73 37-73Q36-74 32-75L20-76Q12-77 10-82Q7-86 7-92Q7-101 10-108Q13-115 14-119H18V-116Q18-114 19-112Q21-111 24-110L34-109Q40-108 42-103Q44-98 44-92Q44-88 44-82Q43-77 40-71Z','י':'4 -119 56 -40|M31-40 28-45Q36-50 40-56Q45-61 45-67Q45-72 42-74Q40-76 35-76H19Q11-76 8-79Q4-83 4-92Q4-99 6-104Q7-110 8-114Q10-118 10-119H14V-116Q14-113 16-112Q17-110 20-110H39Q46-110 49-107Q52-104 53-102Q54-100 54-97Q55-93 55-89Q56-85 56-81Q56-71 53-63Q50-56 46-52Q42-47 38-44Q33-41 31-40Z','ך':'5 -119 88 32|M77 32Q76 32 75 32Q74 32 73 32V30Q74 29 74 26Q75 24 75 16V-66Q75-72 73-74Q71-76 66-76H20Q13-76 9-79Q5-82 5-92Q5-99 7-104Q8-110 10-114Q11-118 11-119H15V-117Q15-113 17-112Q18-110 21-110H76Q82-110 85-107Q88-104 88-95Q88-89 87-83Q85-76 85-66L88 14Q89 22 86 27Q84 32 77 32Z','כ':'6 -119 89 0|M6 0 14-34H66Q71-34 73-36Q76-38 77-43Q79-47 79-53Q79-64 75-70Q71-76 60-76H24Q17-76 15-80Q12-83 12-91Q12-98 13-104Q14-110 16-114Q17-118 18-119H22V-115Q22-113 23-111Q24-110 27-110H62Q70-110 74-107Q79-103 82-97Q83-96 84-91Q86-86 88-76Q89-67 89-53Q89-35 86-25Q83-15 78-9Q75-5 70-2Q66 0 61 0Z','ל':'4 -160 94 2|M46 2Q42 2 39-1Q36-4 36-10Q36-18 41-25Q46-32 53-38L73-53Q77-55 78-59Q79-62 79-66Q79-71 77-73Q75-76 69-76H21Q16-76 14-81Q12-86 12-94Q12-100 12-106Q13-112 14-116Q16-121 16-125Q17-129 17-131Q17-132 17-133Q16-133 15-133L10-134Q7-135 6-137Q4-139 4-144Q4-149 6-154Q7-158 8-160H12V-158Q12-156 14-155L24-153Q28-152 29-149Q30-146 30-145Q30-139 28-134Q26-129 24-124Q22-120 22-116Q22-112 25-111Q28-110 33-110H82Q85-110 87-109Q89-107 90-105Q91-103 92-97Q94-90 94-81Q94-76 93-69Q92-63 89-57Q87-50 81-46L61-30Q57-28 56-25Q55-23 55-21Q55-18 56-15Q57-13 57-9Q57-5 54-1Q52 2 46 2Z','ם':'9 -119 97 0|M14 0 14-48Q14-56 17-63Q20-69 26-75V-76H22Q16-76 13-80Q9-83 9-91Q9-97 11-103Q12-109 13-114Q15-118 16-119H19V-116Q19-113 21-111Q22-110 24-110H77Q83-110 87-108Q92-105 94-100Q97-96 97-88V0ZM30-34H85V-60Q85-69 82-72Q79-76 70-76H32Q30-71 28-67Q27-63 26-59Q26-56 26-50V-39Q26-35 27-35Q28-34 30-34Z','מ':'7 -119 100 0|M14 0Q14-15 15-25Q16-36 18-44Q20-52 24-59L30-70Q31-72 30-74Q30-75 28-75L18-77Q13-77 10-81Q7-85 7-92Q7-98 9-104Q10-110 12-114Q14-118 14-119H18V-117Q18-113 20-112Q21-111 23-110L34-109Q38-108 41-106Q43-103 44-99Q44-96 44-92Q44-89 44-86Q44-84 43-82L44-82Q48-84 51-88Q55-92 58-98Q60-104 62-112H64Q66-112 69-110Q73-109 77-107Q81-104 84-101Q90-96 94-88Q97-80 99-71Q100-62 100-54Q100-46 99-36Q98-26 97-16Q96-7 95 0H40L46-34H91Q92-37 92-40Q92-43 92-46Q92-54 89-61Q87-68 81-73Q75-77 65-77Q57-77 52-74Q46-72 43-68Q39-65 38-63Q32-57 29-48Q26-38 24-26Q23-15 23 0Z','ן':'3 -119 47 32|M27 32Q26 32 25 32Q24 32 23 32V30Q24 29 24 26Q25 24 25 16V-44Q25-52 26-56Q27-60 29-64Q30-66 31-67Q32-69 32-72Q32-74 31-75Q30-76 27-76H18Q10-76 7-79Q3-82 3-92Q3-99 4-104Q6-110 7-114Q9-118 9-119H13V-117Q13-113 14-112Q16-110 19-110H36Q42-110 44-107Q47-105 47-97V-86Q47-80 44-74Q42-69 40-65Q37-60 37-55Q36-50 36-44L38 14Q39 22 37 27Q34 32 27 32Z','נ':'5 -119 62 0|M5 0 11-34H47Q47-36 47-38Q46-41 46-45Q46-48 46-53L47-66Q47-70 46-72Q44-74 40-75L25-77Q20-78 17-80Q15-83 15-89Q15-97 17-105Q20-112 22-119H26V-116Q26-113 27-112Q29-111 33-110L48-108Q54-107 57-104Q59-101 59-93L57-57Q56-51 58-45Q59-39 61-32Q62-26 62-18Q62-12 61-8Q60-4 59 0Z','ס':'8 -119 92 2|M51 2Q31 2 20-9Q10-20 10-39Q10-49 12-56Q14-63 17-68Q20-73 22-75V-82H30V-76Q28-73 26-70Q25-67 23-63Q22-59 22-53Q22-41 29-35Q36-30 51-30Q67-30 74-36Q81-42 81-55Q81-62 80-66Q78-71 74-73Q70-76 64-76H21Q14-76 11-80Q8-83 8-91Q8-98 10-104Q11-110 12-114Q14-118 15-119H18V-115Q18-113 20-111Q21-110 23-110H65Q72-110 77-107Q82-103 85-97Q85-96 87-91Q89-86 90-77Q92-68 92-54Q92-36 87-23Q83-11 73-4Q64 2 51 2Z','ע':'7 -119 92 22|M10 22V-12L54-32Q58-33 60-36Q62-39 63-42Q64-46 65-50Q67-54 69-58L73-68Q75-71 74-73Q74-75 71-75L63-77Q58-78 56-82Q54-85 54-90Q54-95 56-101Q57-107 59-112Q61-117 61-119H65V-117Q65-114 66-112Q67-111 70-110L80-109Q86-108 89-104Q92-100 92-94V-89Q92-87 91-84Q90-81 89-78Q88-75 87-73L82-62Q82-61 80-58Q79-55 78-51Q77-47 77-43V-37Q77-27 74-19Q70-11 63-5Q56 1 44 6ZM42-25Q42-27 42-29Q41-30 41-32Q40-33 39-34L26-48Q23-51 22-56Q21-60 21-65Q21-69 22-73Q23-76 24-78L30-77Q29-74 29-70Q30-67 34-63L45-53Q49-49 51-45Q53-41 53-37Q54-33 54-29ZM39-71Q38-73 37-73Q37-74 34-74L20-76Q13-77 10-82Q7-86 7-92Q7-101 10-108Q13-115 14-119H18V-116Q18-114 19-112Q20-111 24-110L34-109Q40-108 42-103Q45-98 45-92Q45-88 44-82Q43-77 40-71Z','ף':'4 -119 88 32|M77 32Q76 32 74 32Q73 32 72 32V30Q73 29 74 26Q74 24 74 16V-62Q74-70 71-73Q69-76 62-76H19Q12-76 8-79Q4-82 4-92Q4-99 6-104Q7-110 9-114Q10-118 10-119H14V-117Q14-113 16-112Q17-110 20-110H63Q70-110 75-108Q79-105 82-99Q84-93 84-81L88 14Q88 19 87 23Q86 27 84 30Q81 32 77 32ZM12-37Q12-40 12-41Q11-43 11-45Q11-52 13-58Q15-64 18-68Q20-73 22-76V-79H31V-76Q29-73 27-70Q25-66 25-62H35Q39-62 41-60Q42-58 42-55V-38H38Q37-41 35-42Q33-43 29-43Q25-43 23-42Q21-40 20-37Z','פ':'7 -119 91 0|M7 0 13-34H70Q73-34 76-36Q78-39 79-43Q81-48 81-55Q81-66 77-71Q73-76 65-76H21Q18-76 15-77Q12-79 10-82Q8-86 8-92Q8-98 10-104Q11-109 12-114Q14-118 15-119H18V-116Q18-113 20-111Q21-110 23-110H64Q71-110 76-107Q81-104 84-98Q85-96 86-90Q88-85 90-76Q91-67 91-55Q91-46 90-37Q89-28 87-19Q85-10 82 0ZM13-42Q13-44 13-46Q13-47 13-49Q13-56 15-61Q16-67 19-70Q21-74 23-76V-78H32V-76Q30-74 28-71Q27-68 27-66H36Q39-66 41-64Q44-62 44-59V-43H40Q39-45 37-46Q34-47 31-47Q23-47 21-42Z','ץ':'3 -119 96 32|M32 32Q31 32 30 32Q28 32 27 32V30Q28 29 29 26Q30 24 29 16L24-44Q23-51 24-56Q25-61 27-65Q28-67 29-68Q30-70 30-72Q30-74 29-75Q28-76 25-76H18Q11-76 7-79Q3-82 3-92Q3-99 5-104Q6-110 8-114Q9-118 9-119H13V-117Q13-113 15-112Q16-110 19-110H34Q40-110 42-107Q45-105 45-97V-86Q45-80 42-75Q40-70 38-67Q35-62 34-57Q33-52 35-44L43 13Q44 21 42 27Q39 32 32 32ZM39-14 36-16 35-39Q36-42 41-47Q46-53 53-60L73-77L82-77L59-52Q52-45 47-39Q43-33 41-27Q38-21 39-14ZM90-71Q89-73 89-73Q88-74 86-74L67-76Q60-77 57-82Q55-87 55-92Q55-102 58-109Q61-116 62-119H66V-116Q66-114 67-112Q68-110 72-110L86-109Q90-108 92-106Q94-104 95-100Q96-97 96-92Q96-87 95-81Q93-76 92-71Z','צ':'7 -119 94 0|M8 0 17-33H64Q65-34 63-36Q62-37 59-39L38-51Q35-53 34-56Q33-58 33-63V-71Q33-74 32-75Q31-76 29-76H22Q15-76 11-79Q7-82 7-92Q7-99 9-104Q10-110 12-114Q13-118 13-119H17V-117Q17-113 19-112Q20-110 23-110H31Q36-110 39-107Q42-105 42-97V-76Q42-71 43-69Q44-66 48-64L82-43Q88-40 89-34Q90-28 88-20L83 0ZM67-51 57-56Q57-58 59-62Q61-66 65-70L73-77L81-76L71-64Q68-60 67-56Q66-52 67-51ZM88-71Q88-72 87-73Q86-74 84-74L68-77Q62-77 60-80Q57-82 56-86Q55-89 55-93Q55-102 58-109Q61-116 62-119H66V-117Q66-114 67-112Q68-110 72-110L83-109Q90-108 92-103Q94-98 94-92Q94-87 93-82Q92-76 90-71Z','ק':'9 -119 95 32|M45 2Q42 2 41 0Q39-1 39-4V-5Q39-13 41-17Q43-20 47-24L75-50Q79-53 80-57Q81-60 81-63Q81-70 78-73Q74-76 66-76H22Q15-76 12-80Q9-83 9-91Q9-98 11-104Q12-110 13-114Q15-118 16-119H19V-116Q19-113 21-111Q22-110 24-110H73Q80-110 84-107Q89-104 92-97Q93-94 94-89Q95-85 95-77Q95-69 94-63Q93-57 91-52Q88-47 83-42L57-19Q54-16 53-14Q51-11 51-5V-4Q51-1 50 0Q49 2 45 2ZM14 32Q12 32 10 32V30Q10 29 11 27Q12 26 12 20V-39Q12-52 16-56Q20-61 24-61Q26-61 27-60V-59Q27-58 26-56Q25-53 25-48V16Q25 23 22 28Q19 32 14 32Z','ר':'4 -119 85 1|M74 1Q73 1 72 1Q71 1 70 0V-1Q71-3 71-5Q71-7 71-15V-61Q71-70 69-73Q67-76 61-76H19Q11-76 8-79Q4-83 4-92Q4-99 5-104Q7-110 8-114Q10-118 10-119H14V-116Q14-113 15-112Q17-110 20-110H61Q73-110 77-105Q81-99 82-89L85-18Q86-9 83-4Q81 1 74 1Z','ש':'6 -119 125 0|M28 0Q25-15 22-25Q20-35 18-42Q17-50 17-56Q17-65 19-71Q21-77 24-84L31-81Q31-80 30-78Q29-75 28-71Q28-67 28-62Q28-54 29-49Q30-43 32-39Q34-36 35-33H87Q90-40 92-45Q95-50 97-55Q100-59 102-63L106-69Q108-72 109-74Q109-76 106-76L100-77Q95-78 93-81Q91-85 91-89Q91-95 93-101Q94-107 96-112Q98-117 98-119H102V-117Q102-114 103-112Q104-111 107-110L116-109Q121-108 123-106Q125-104 125-99V-90Q125-86 125-83Q124-80 123-77Q122-75 121-73L114-63Q109-56 105-47Q101-39 99-30Q96-21 94-11L91 0ZM42-23 67-85 77-83 52-23ZM37-71Q37-73 36-73Q35-74 32-74L19-76Q11-77 9-82Q6-86 6-92Q6-101 9-108Q12-115 13-119H17V-117Q17-114 18-112Q20-111 23-110L32-109Q39-108 41-103Q43-98 43-92Q43-88 42-82Q41-77 39-71ZM80-71Q79-73 78-73Q77-74 73-75L61-76Q54-77 51-82Q49-86 49-92Q49-101 51-108Q54-115 56-119H60V-117Q60-114 61-112Q62-111 66-110L75-109Q82-108 84-103Q86-98 86-92Q86-88 85-82Q84-77 82-71Z','ת':'3 -119 102 1|M90 1Q89 1 88 1Q87 1 86 0V-1Q87-3 87-5Q88-7 88-15V-61Q88-70 86-73Q84-76 77-76H29Q22-76 18-79Q15-83 15-92Q15-99 16-104Q17-110 19-114Q20-118 21-119H25V-116Q25-113 26-112Q27-110 30-110H78Q90-110 94-105Q98-99 98-89L102-18Q102-9 99-4Q97 1 90 1ZM3 0 9-34H25Q25-37 25-40Q25-43 25-47Q24-50 25-53Q25-56 25-59Q26-64 28-68Q29-72 31-75V-79H41V-76Q41-75 39-72Q38-70 37-66Q36-62 36-56Q36-50 37-43Q38-36 40-29Q41-22 41-17Q41-12 40-8Q39-4 36 0Z'};

  function bookCube(color, { letter, ornament = true, size = 100 } = {}) {
    if (typeof color === 'number') color = EMBLEM_COLORS[((color % 6) + 6) % 6];
    else if (color in COLOR_NAMES) color = EMBLEM_COLORS[COLOR_NAMES[color]];
    if (!rgb(color)) color = EMBLEM_COLORS[5];
    const id = uid('bk');
    const a = 48, t = 38, b = 3.4, o = 2.4, sp = 2.6;       // cover size, thickness, board, page recess, spine wrap
    const ox = 50, oy = 7;
    const C = 0.8660254;
    const iso = (X, Y, Z) => [ox + C * (X - Y), oy + 0.5 * (X + Y) + (t - Z)];
    const pt = (X, Y, Z) => iso(X, Y, Z).map(N).join(' ');
    const pg = (...p) => 'M' + p.map((q) => pt(...q)).join('L') + 'z';

    const top = tint(color, 0.08), cover = color, spine = shade(color, 0.16), edge = shade(color, 0.34), inner = shade(color, 0.08);
    const gold = `url(#${id}gd)`;
    let defs = `<linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="${pt(0, 0, t).split(' ')[0]}" y1="${oy}" x2="${ox}" y2="${oy + a}">` +
      `<stop offset="0" stop-color="${tint(top, 0.18)}"/><stop offset="1" stop-color="${cover}"/></linearGradient>`;
    // spine roundness: gradient across the thickness
    const [sx0, sy0] = iso(a / 2, a, t);
    defs += `<linearGradient id="${id}s" gradientUnits="userSpaceOnUse" x1="${N(sx0)}" y1="${N(sy0)}" x2="${N(sx0 - 0.5 * t * C)}" y2="${N(sy0 + 0.866 * t * C)}">` +
      `<stop offset="0" stop-color="${shade(spine, 0.12)}"/><stop offset=".3" stop-color="${tint(spine, 0.1)}"/><stop offset=".62" stop-color="${spine}"/><stop offset="1" stop-color="${shade(spine, 0.2)}"/></linearGradient>`;
    // page block: cream, a touch darker toward the spine
    const [px0, py0] = iso(a - o, 0, t / 2), [px1, py1] = iso(a - o, a - sp, t / 2);
    defs += `<linearGradient id="${id}p" gradientUnits="userSpaceOnUse" x1="${N(px0)}" y1="${N(py0)}" x2="${N(px1)}" y2="${N(py1)}">` +
      '<stop offset="0" stop-color="#fbf4e2"/><stop offset=".7" stop-color="#f1e6c8"/><stop offset="1" stop-color="#ddcca2"/></linearGradient>';
    defs += `<linearGradient id="${id}gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1bf"/><stop offset=".45" stop-color="#f6c64e"/><stop offset="1" stop-color="#c98a1e"/></linearGradient>`;

    let g = '';
    // right face (tail): boards + recessed page block
    g += `<path fill="${edge}" d="${pg([a, 0, 0], [a, a, 0], [a, a, b], [a, 0, b])}"/>`;
    g += `<path fill="${inner}" d="${pg([a - o, 0, b], [a, 0, b], [a, a, b], [a - o, a, b])}"/>`;
    g += `<path fill="url(#${id}p)" d="${pg([a - o, 0, b], [a - o, a - sp, b], [a - o, a - sp, t - b], [a - o, 0, t - b])}"/>`;
    let lines = '';
    for (let z = b + 1.6; z < t - b - 0.8; z += 1.55) lines += `M${pt(a - o, 0.6, z)}L${pt(a - o, a - sp - 0.4, z)}`;
    g += `<path d="${lines}" stroke="#a88b55" stroke-opacity=".38" stroke-width=".32" fill="none"/>`;
    g += `<path fill="#5a4320" fill-opacity=".16" d="${pg([a - o, 0, t - b], [a - o, a - sp, t - b], [a - o, a - sp, t - b - 2.4], [a - o, 0, t - b - 2.4])}"/>`;
    g += `<path fill="${spine}" d="${pg([a - o, a - sp, b], [a, a, b], [a, a, t - b], [a - o, a - sp, t - b])}"/>`;   // spine wrap (joint)
    g += `<path fill="${edge}" d="${pg([a, 0, t - b], [a, a, t - b], [a, a, t], [a, 0, t])}"/>`;
    // left face: spine with two gold bands
    g += `<path fill="url(#${id}s)" d="${pg([0, a, 0], [a, a, 0], [a, a, t], [0, a, t])}"/>`;
    [t * 0.2, t * 0.8].forEach((z) => {
      g += `<path fill="${gold}" d="${pg([0.8, a, z - 1.1], [a - 0.4, a, z - 1.1], [a - 0.4, a, z + 1.1], [0.8, a, z + 1.1])}"/>`;
      g += `<path fill="#fff6d6" fill-opacity=".55" d="${pg([0.8, a, z + 0.7], [a - 0.4, a, z + 0.7], [a - 0.4, a, z + 1.1], [0.8, a, z + 1.1])}"/>`;
    });
    // top face: cover with blind-tooled frame and gold ornament / letter
    g += `<path fill="url(#${id}t)" d="${pg([0, 0, t], [a, 0, t], [a, a, t], [0, a, t])}"/>`;
    const f = 4.6;
    g += `<path fill="none" stroke="${shade(color, 0.22)}" stroke-opacity=".55" stroke-width=".7" d="${pg([f, f, t], [a - f, f, t], [a - f, a - f, t], [f, a - f, t])}"/>`;
    g += `<path fill="none" stroke="#fff" stroke-opacity=".22" stroke-width=".5" d="${pg([f + 0.9, f + 0.9, t], [a - f - 0.9, f + 0.9, t], [a - f - 0.9, a - f - 0.9, t], [f + 0.9, a - f - 0.9, t])}"/>`;
    // bevel highlights on the near cover edges
    g += `<path fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".8" stroke-linecap="round" d="M${pt(0.5, a, t)}L${pt(a, a, t)}L${pt(a, 0.5, t)}"/>`;
    g += `<path fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".6" d="M${pt(0, 0, t)}L${pt(0, a, t)}"/>`;

    const [cx, cy] = iso(a / 2, a / 2, t);
    const onCover = `translate(${N(cx)} ${N(cy)}) matrix(${C} .5 ${-C} .5 0 0)`;
    const glyph = letter && GLYPHS[String(letter)[0]];
    if (glyph) {
      const [box, d] = glyph.split('|'), [x0, y0, x1, y1] = box.split(' ').map(Number);
      const sc = Math.min((a * 0.5) / 120, (a * 0.62) / Math.max(x1 - x0, y1 - y0));
      const tr = `${onCover} scale(${N(sc * 1000) / 1000}) translate(${N(-(x0 + x1) / 2)} ${N(-(y0 + y1) / 2)})`;
      g += `<path transform="translate(-.5 .6) ${tr}" fill="${shade(color, 0.45)}" fill-opacity=".45" d="${d}"/>`;
      g += `<path transform="${tr}" fill="${gold}" stroke="#8f5c12" stroke-opacity=".5" stroke-width="${N(0.5 / sc * 10) / 10}" d="${d}"/>`;
    } else if (ornament) {
      // small gold hexagram of six rhombi (echoes the emblem)
      let st = '';
      const r = 7.2, s6 = r / Math.sqrt(3);
      for (let i = 0; i < 6; i++) {
        const th = ((-90 + 60 * i) * Math.PI) / 180, d30 = Math.PI / 6, kk = 0.84;
        const P = (ang, rr) => [rr * Math.cos(ang), rr * Math.sin(ang)];
        const mc = P(th, r / 2);
        const q = [P(th, 0), P(th - d30, s6), P(th, r), P(th + d30, s6)].map(([x, y]) => [mc[0] + (x - mc[0]) * kk, mc[1] + (y - mc[1]) * kk]);
        st += 'M' + q.map(([x, y]) => `${N(x)} ${N(y)}`).join('L') + 'z';
      }
      g += `<path transform="translate(-.5 .6) ${onCover}" fill="${shade(color, 0.45)}" fill-opacity=".45" d="${st}"/>`;
      g += `<path transform="${onCover}" fill="${gold}" d="${st}"/>`;
    }

    return `<svg xmlns="${NS}" viewBox="0 0 100 100" width="${size}" height="${size}">` +
      `<defs>${defs}</defs>${g}</svg>`;
  }

  /** Data URL of a book-cube (for canvas sprites: new Image().src = bookCubeURL(...)). */
  const bookCubeURL = (color, opts) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(bookCube(color, opts));

  // ---- stored brand override (admin uploads) → window.CH_BRAND ----
  try {
    const LS = CH.u && CH.u.LS;
    const stored = LS && LS.get('chm.v1.brand', null);
    if (stored && typeof stored === 'object') {
      const add = {};
      ['wordmark', 'emblem'].forEach((k) => { if (typeof stored[k] === 'string' && /^data:image\//i.test(stored[k])) add[k] = stored[k]; });
      if (Object.keys(add).length) window.CH_BRAND = Object.assign(window.CH_BRAND || {}, add);
    }
  } catch (e) { /* ignore */ }

  CH.art = Object.assign(CH.art || {}, { EMBLEM_COLORS, emblem, wordmark, skyline, bookCube, bookCubeURL });
})(window.CH = window.CH || {});
