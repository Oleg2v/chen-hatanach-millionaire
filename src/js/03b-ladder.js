/* 03b-ladder.js — the play-screen "ladder": an olive tree with numbered pegs, a climbing sage and the star of the
   Tanakh in its crown; plus the gold victory wreath of the result screen.
   CH.ladder.create(container, { steps, level }) · CH.wreath.create(container)   (see docs/ARCHITECTURE.md) */
(function (CH) {
  'use strict';

  const W = 360, H = 880;                     // design size in stage px (the scene is scaled to fit its container)
  const G = 846;                              // feet at level 0 (top of the mound)
  const TOP = 374;                            // feet on the highest rung
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const f1 = (v) => Math.round(v * 10) / 10;
  const reduced = !!(CH.u && CH.u.reduced);
  let seq = 0;

  function rng(seed) {                        // mulberry32 — the tree is identical on every screen
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  /** Catmull-Rom spline through points → SVG path data. */
  function smooth(p, closed = false, k = 1 / 6) {
    const n = p.length;
    const at = (i) => (closed ? p[(i + n) % n] : p[clamp(i, 0, n - 1)]);
    let d = `M${f1(p[0][0])} ${f1(p[0][1])}`;
    for (let i = 0, segs = closed ? n : n - 1; i < segs; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      d += `C${f1(p1[0] + (p2[0] - p0[0]) * k)} ${f1(p1[1] + (p2[1] - p0[1]) * k)} ` +
        `${f1(p2[0] - (p3[0] - p1[0]) * k)} ${f1(p2[1] - (p3[1] - p1[1]) * k)} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d + (closed ? 'Z' : '');
  }
  /** Tapered tube around a centre line (branches, roots). width(t) with t 0→1 along the line. */
  function taper(c, width) {
    const n = c.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = c[Math.max(0, i - 1)], b = c[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const w = width(i / (n - 1)) / 2;
      L.push([c[i][0] - dy * w, c[i][1] + dx * w]); R.push([c[i][0] + dy * w, c[i][1] - dx * w]);
    }
    const tip = c[n - 1];
    return smooth(L.concat([tip], R.reverse()), true);
  }
  // ================================================================ tree geometry
  const tcx = (y) => { const t = (y - 260) / 600; return 178 - 17 * Math.sin(t * Math.PI * 1.1) + 8 * t; };   // trunk centre
  const thw = (y) => {                                                                                         // trunk half-width
    const t = clamp((y - 260) / 600, 0, 1);
    return 23 + 13 * t + 2.2 * Math.sin(y / 31) + 30 * Math.pow(Math.max(0, (y - 776) / 78), 2);
  };
  const rungY = (i, n) => (n === 1 ? (G + TOP) / 2 + 20 : G - ((G - TOP) * i) / n);
  /** Where the sage's feet are at level k. */
  function feetAt(k, n) {
    if (k <= 0) return { x: 246, y: G };
    const y = rungY(Math.min(k, n), n);
    return { x: tcx(y + 5) + thw(y + 5) + 9, y };
  }

  // ---------------------------------------------------------------- trunk, roots, mound (static, cached)
  let TREE = null;
  function treeMarkup() {
    if (TREE) return TREE;
    const rnd = rng(1948);
    let defs = '', s = '';
    const lg = (id, x1, y1, x2, y2, stops, user) => `<linearGradient id="@${id}"${user ? ' gradientUnits="userSpaceOnUse"' : ''} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      stops.map(([o, c, op]) => `<stop offset="${o}" stop-color="${c}"${op != null ? ` stop-opacity="${op}"` : ''}/>`).join('') + '</linearGradient>';
    const BARK = [[0, '#cfa173'], [0.16, '#a67852'], [0.44, '#7a543b'], [0.76, '#4e3426'], [1, '#3a2822']];
    defs += lg('bark', 116, 0, 246, 0, BARK, true);
    defs += lg('root', 0, 0, 1, 0, [[0, '#b88a5e'], [0.5, '#7a543b'], [1, '#4a3124']]);
    defs += lg('branch', 0, 0, 1, 0, [[0, '#a87b55'], [0.5, '#6e4a33'], [1, '#3e2a20']]);
    defs += lg('shade', 0, 150, 0, 480, [[0, '#120904', 0.4], [0.55, '#120904', 0.72], [1, '#120904', 0]], true);
    defs += lg('mound', 0, 0, 0, 1, [[0, '#76c453'], [0.16, '#46994a'], [0.5, '#256a3c'], [1, '#0f3a2a']]);
    defs += '<radialGradient id="@mfade" cx=".5" cy=".18" r=".62"><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>';
    defs += '<mask id="@mmask" maskUnits="userSpaceOnUse" x="-40" y="780" width="440" height="200"><rect x="-40" y="780" width="440" height="200" fill="url(#@mfade)"/></mask>';
    defs += '<radialGradient id="@stone" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fbf1da"/><stop offset=".55" stop-color="#dccaa3"/><stop offset="1" stop-color="#9c8763"/></radialGradient>';
    defs += '<radialGradient id="@knot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1b0f08"/><stop offset=".6" stop-color="#3a2416"/><stop offset="1" stop-color="#8a6243"/></radialGradient>';
    defs += '<radialGradient id="@cshadow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#06210f" stop-opacity=".6"/><stop offset="1" stop-color="#06210f" stop-opacity="0"/></radialGradient>';

    // mound (edges fade into the skyline; it runs past the box bottom so it never shows an edge)
    const mtop = [];
    for (let x = -40; x <= 400; x += 30) mtop.push([x, 840 + Math.pow((x - 182) / 190, 2) * 62 + (rnd() - 0.5) * 4]);
    s += `<g mask="url(#@mmask)"><path d="${smooth(mtop)}L400 980L-40 980Z" fill="url(#@mound)"/>` +
      `<path d="${smooth(mtop)}" fill="none" stroke="#c4f088" stroke-opacity=".6" stroke-width="2.5"/></g>`;
    const stone = (x, y, w, h, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M${-w} ${h * 0.35}C${-w} ${-h * 0.6} ${-w * 0.4} ${-h} ${w * 0.15} ${-h}C${w * 0.8} ${-h} ${w} ${-h * 0.4} ${w} ${h * 0.25}C${w} ${h * 0.8} ${-w} ${h * 0.9} ${-w} ${h * 0.35}Z" fill="url(#@stone)" stroke="#5e4c35" stroke-opacity=".55" stroke-width="1.4"/>` +
      `<path d="M${-w * 0.55} ${-h * 0.45}C${-w * 0.2} ${-h * 0.75} ${w * 0.25} ${-h * 0.8} ${w * 0.5} ${-h * 0.55}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/></g>`;
    s += stone(66, 874, 20, 14, -8) + stone(92, 884, 11, 8, 6) + stone(306, 874, 16, 11, 10);
    s += '<ellipse cx="190" cy="856" rx="118" ry="15" fill="url(#@cshadow)"/>';

    // wood: trunk + roots share one silhouette outline (stroked first, fills on top)
    const cxB = tcx(846);
    const roots = [
      [[[cxB - 24, 808], [cxB - 56, 838], [cxB - 96, 854], [cxB - 132, 861]], 32],
      [[[cxB + 26, 806], [cxB + 60, 836], [cxB + 100, 851], [cxB + 134, 858]], 30],
      [[[cxB - 12, 828], [cxB - 30, 856], [cxB - 42, 878], [cxB - 48, 900]], 26],
      [[[cxB + 14, 830], [cxB + 32, 858], [cxB + 38, 882], [cxB + 42, 904]], 24],
    ];
    const rootPaths = roots.map(([pts, w]) => taper(pts, (t) => lerp(w, 3, Math.pow(t, 0.8))));
    const cl = [];
    for (let y = 900; y >= 296; y -= 22) cl.push([tcx(y), y]);
    const trunkD = taper(cl, (t) => thw(lerp(900, 296, t)) * 2);
    s += `<g fill="none" stroke="#21120a" stroke-width="3.6" stroke-opacity=".85">${[trunkD, ...rootPaths].map((d) => `<path d="${d}"/>`).join('')}</g>`;
    s += rootPaths.map((d) => `<path d="${d}" fill="url(#@root)"/>`).join('');
    s += `<path d="${trunkD}" fill="url(#@bark)"/>`;

    // bark: long twisting fissures (dark) with lit ridges beside them, clipped to the wood
    let fis = '', lit = '';
    for (let i = 0; i < 17; i++) {
      const u0 = -0.88 + (i / 16) * 1.76, ph = rnd() * 6, y0 = 290 + rnd() * 280, len = 140 + rnd() * 300, pts = [];
      for (let y = y0; y <= Math.min(870, y0 + len); y += 16) {
        const u = clamp(u0 + 0.16 * Math.sin(y / 64 + ph) + (rnd() - 0.5) * 0.03, -0.95, 0.95);
        pts.push([tcx(y) + u * thw(y), y]);
      }
      if (pts.length < 3) continue;
      const d = smooth(pts);
      fis += `<path d="${d}" stroke-width="${f1(1.4 + rnd() * 2.2)}" stroke-opacity="${f1(0.26 + rnd() * 0.32)}"/>`;
      if (u0 < 0.3) lit += `<path d="${d}" transform="translate(-2.8 0)" stroke-width="${f1(1 + rnd() * 1.2)}" stroke-opacity="${f1(0.16 + rnd() * 0.22)}"/>`;
    }
    s += '<clipPath id="@tclip">' + [trunkD, ...rootPaths].map((d) => `<path d="${d}"/>`).join('') + '</clipPath>';
    s += `<g clip-path="url(#@tclip)" fill="none" stroke-linecap="round"><g stroke="#ffdcae">${lit}</g><g stroke="#1e1009">${fis}</g>`;
    [[tcx(548) - 9, 548, 9, 13], [tcx(706) + 13, 706, 6, 8]].forEach(([x, y, rx, ry]) => {
      s += `<ellipse cx="${f1(x)}" cy="${y}" rx="${rx + 4}" ry="${ry + 4.5}" fill="none" stroke="#2a180e" stroke-opacity=".45" stroke-width="2.2"/>` +
        `<ellipse cx="${f1(x)}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#@knot)"/>` +
        `<path d="M${f1(x - rx)} ${y - 2}a${rx} ${ry} 0 0 1 ${rx * 2} 0" fill="none" stroke="#e6b98a" stroke-opacity=".55" stroke-width="1.5"/>`;
    });
    s += '</g>';
    // rims: cool sky light on the right edge, warm light on the left
    const edge = (sgn, y0, y1, off) => { const p = []; for (let y = y0; y <= y1; y += 20) p.push([tcx(y) + sgn * (thw(y) - off), y]); return smooth(p); };
    s += `<path d="${edge(1, 330, 790, 2.4)}" fill="none" stroke="#a6e1ff" stroke-opacity=".42" stroke-width="2.4" stroke-linecap="round"/>`;
    s += `<path d="${edge(-1, 350, 780, 2.6)}" fill="none" stroke="#ffe2b4" stroke-opacity=".38" stroke-width="2" stroke-linecap="round"/>`;

    // branches spread from the trunk into the crown (their fork hides behind the front foliage)
    const yb = 330, bx = tcx(yb);
    const branches = [
      [[[bx - 4, yb], [bx - 30, yb - 46], [bx - 64, yb - 94], [bx - 100, yb - 128], [bx - 124, yb - 146]], 30],
      [[[bx + 6, yb], [bx + 30, yb - 44], [bx + 62, yb - 96], [bx + 96, yb - 138], [bx + 114, yb - 158]], 28],
      [[[bx + 2, yb - 4], [bx + 8, yb - 70], [bx + 2, yb - 140], [bx + 8, yb - 200], [bx + 4, yb - 236]], 28],
      [[[bx - 46, yb - 72], [bx - 60, yb - 116], [bx - 58, yb - 168]], 11],
      [[[bx + 52, yb - 84], [bx + 74, yb - 124], [bx + 70, yb - 176]], 11],
    ];
    const brD = branches.map(([pts, w]) => taper(pts, (t) => lerp(w, 4, t)));
    s += brD.map((d) => `<path d="${d}" fill="url(#@branch)" stroke="#21120a" stroke-opacity=".7" stroke-width="1.5"/>`).join('');
    // the crown's shade over the branches and the top of the trunk
    s += `<clipPath id="@bclip"><path d="${trunkD}"/>${brD.map((d) => `<path d="${d}"/>`).join('')}</clipPath>` +
      '<rect x="40" y="150" width="280" height="330" fill="url(#@shade)" clip-path="url(#@bclip)"/>';

    // grass tufts in front of the roots, anemones, chamomile
    const tuft = (x, y, sc, col) => {
      let d = '';
      for (let i = 0; i < 6; i++) {
        const a = -70 + i * 28 + (rnd() - 0.5) * 16, l = (11 + rnd() * 9) * sc, bx2 = x + (i - 2.5) * 2.4 * sc;
        const tx = bx2 + Math.sin(a * D2R) * l, ty = y - Math.cos(a * D2R) * l;
        d += `M${f1(bx2 - 1.6 * sc)} ${y}Q${f1((bx2 + tx) / 2 - 1)} ${f1((y + ty) / 2)} ${f1(tx)} ${f1(ty)}Q${f1((bx2 + tx) / 2 + 1.5)} ${f1((y + ty) / 2 + 1)} ${f1(bx2 + 1.6 * sc)} ${y}Z`;
      }
      return `<path d="${d}" fill="${col}"/>`;
    };
    [[40, 878, 1, '#5aa845'], [112, 864, 0.9, '#6dbb50'], [146, 872, 1.1, '#4f9a40'], [222, 874, 1, '#5fb048'],
      [282, 862, 0.9, '#6dbb50'], [326, 878, 1, '#4a9440'], [182, 890, 1.2, '#3f8a3a'], [256, 888, 1.1, '#3f8a3a']]
      .forEach(([x, y, sc, c]) => (s += tuft(x, y, sc, c)));
    const anemone = (x, y, r, rot) => {
      let p = '';
      for (let i = 0; i < 6; i++) p += `<ellipse cx="0" cy="${-r * 0.62}" rx="${f1(r * 0.48)}" ry="${f1(r * 0.66)}" transform="rotate(${rot + i * 60})"/>`;
      return `<path d="M${x} ${y + r}q-1 9 1 16" stroke="#2f7a3a" stroke-width="1.8" fill="none"/>` +
        `<g transform="translate(${x} ${y})"><g fill="#e8343a" stroke="#8e1622" stroke-width=".8">${p}</g>` +
        `<circle r="${f1(r * 0.36)}" fill="#22142e"/><circle cx="${f1(-r * 0.12)}" cy="${f1(-r * 0.14)}" r="${f1(r * 0.12)}" fill="#5a4a7a"/></g>`;
    };
    s += anemone(48, 860, 6.5, 8) + anemone(128, 862, 5.5, 22) + anemone(300, 858, 6, 40) + anemone(284, 878, 5, 15) + anemone(76, 892, 5.5, 30);
    const daisy = (x, y, r) => {
      let p = '';
      for (let i = 0; i < 8; i++) p += `<ellipse cx="0" cy="${-r * 0.6}" rx="${f1(r * 0.24)}" ry="${f1(r * 0.5)}" transform="rotate(${i * 45})"/>`;
      return `<g transform="translate(${x} ${y})"><g fill="#fffaf0">${p}</g><circle r="${f1(r * 0.3)}" fill="#f6c64e"/></g>`;
    };
    s += daisy(100, 880, 5) + daisy(232, 894, 4.5) + daisy(322, 866, 4);

    TREE = { defs, body: s };
    return TREE;
  }

  // ---------------------------------------------------------------- crown (back + front foliage, cached)
  /** Foliage pad: an ellipse with a leafy scalloped top and a flatter, gently bumpy underside. */
  function pad(x, y, rx, ry, rnd) {
    const m = Math.max(10, Math.round((Math.PI * (rx + ry)) / 12.5));
    const step = (2 * Math.PI) / m, a0 = rnd() * step, pts = [];
    const ryAt = (a) => (Math.sin(a) < 0 ? ry : ry * 0.8);
    for (let j = 0; j < m; j++) {
      const a = a0 + (j + (rnd() - 0.5) * 0.35) * step, k = 0.93 + rnd() * 0.06;
      pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ryAt(a) * k]);
    }
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let j = 0; j < m; j++) {
      const q = pts[(j + 1) % m], a = a0 + (j + 0.5) * step, top = Math.sin(a) < 0;
      const b = (top ? 1.13 : 1.05) + rnd() * 0.05;
      d += `Q${f1(x + Math.cos(a) * rx * b)} ${f1(y + Math.sin(a) * ryAt(a) * b)} ${f1(q[0])} ${f1(q[1])}`;
    }
    return d + 'Z';
  }
  let CROWN = null;
  function crownMarkup() {
    if (CROWN) return CROWN;
    const rnd = rng(613);
    let defs = '<path id="@lf" d="M0 0C3.4-2.4 8.8-2.6 14 0C8.8 2.6 3.4 2.4 0 0Z"/>';
    const vg = (id, stops) => `<linearGradient id="@${id}" x1="0" y1="0" x2=".22" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    defs += vg('fb', [[0, '#3f7d52'], [0.45, '#22573d'], [1, '#0f3123']]);
    defs += vg('fm', [[0, '#8cc46a'], [0.3, '#4f9447'], [0.75, '#2a6439'], [1, '#1a4730']]);
    defs += vg('ff', [[0, '#c6e68c'], [0.28, '#7ab857'], [0.7, '#3f8541'], [1, '#245a34']]);

    defs += '<linearGradient id="@side" gradientUnits="userSpaceOnUse" x1="40" y1="60" x2="340" y2="300">' +
      '<stop offset="0" stop-color="#fff4c8" stop-opacity=".16"/><stop offset=".42" stop-color="#fff4c8" stop-opacity="0"/>' +
      '<stop offset=".62" stop-color="#03163a" stop-opacity="0"/><stop offset="1" stop-color="#03163a" stop-opacity=".42"/></linearGradient>';
    let layer = 0;
    // pads + one light pass across the whole layer (lit from the upper left, like the trunk)
    const pads = (list, grad, rim, rimOp) => {
      const ds = list.map(([x, y, rx, ry]) => pad(x, y, rx, ry, rnd));
      const cp = `@cp${++layer}`;
      return ds.map((d) => `<path d="${d}" fill="${rim}" fill-opacity="${rimOp}" transform="translate(-1.6 -3)"/><path d="${d}" fill="url(#@${grad})"/>`).join('') +
        `<clipPath id="${cp}">${ds.map((d) => `<path d="${d}"/>`).join('')}</clipPath><rect x="0" y="0" width="360" height="360" fill="url(#@side)" clip-path="url(#${cp})"/>`;
    };
    // leaves: bright ones fanning out of the lit top edge, dark ones hanging under the shaded bottom
    const leaves = (list, nTop, nBot, topCols, botCols) => {
      let o = '';
      list.forEach(([x, y, rx, ry]) => {
        for (let i = 0; i < nTop + nBot; i++) {
          const top = i < nTop;
          const a = top ? (-170 + rnd() * 160) * D2R : (25 + rnd() * 130) * D2R;
          const k = top ? 0.86 + rnd() * 0.2 : 0.7 + rnd() * 0.16;
          const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * (top ? ry : ry * 0.8) * k;
          const rot = a / D2R + (rnd() - 0.5) * 60, sc = (top ? 0.8 : 0.7) + rnd() * 0.4;
          const cols = top ? topCols : botCols;
          o += `<use href="#@lf" transform="translate(${f1(px)} ${f1(py)}) rotate(${f1(rot)}) scale(${f1(sc * 100) / 100})" fill="${cols[(rnd() * cols.length) | 0]}"/>`;
        }
      });
      return o;
    };
    // silvery olive sprays sitting on the lit tops
    const sprays = (list, n) => {
      let o = '';
      list.forEach(([x, y, rx, ry]) => {
        for (let i = 0; i < n; i++) {
          const px = x + (rnd() - 0.65) * rx * 1.1, py = y - ry * (0.25 + rnd() * 0.45);
          for (let j = 0; j < 3; j++) {
            o += `<use href="#@lf" transform="translate(${f1(px)} ${f1(py)}) rotate(${f1(-150 + j * 50 + (rnd() - 0.5) * 30)}) scale(${f1(55 + rnd() * 25) / 100})" fill="${['#e4f2c6', '#cfe6a4', '#b4d88a'][j]}" fill-opacity=".85"/>`;
          }
        }
      });
      return o;
    };

    const back = [[182, 96, 96, 64], [94, 152, 88, 60], [268, 148, 90, 60], [56, 222, 62, 50], [304, 222, 62, 50],
      [180, 196, 122, 84], [118, 276, 84, 46], [244, 278, 84, 46], [22, 196, 30, 22], [340, 186, 28, 22], [118, 70, 44, 28], [252, 64, 44, 28]];
    const mid = [[180, 80, 70, 42], [110, 128, 68, 42], [252, 124, 70, 44], [54, 190, 50, 36], [306, 192, 50, 36],
      [150, 182, 72, 42], [238, 186, 68, 42], [92, 244, 64, 38], [272, 248, 62, 38]];
    const front = [[138, 114, 48, 28], [228, 106, 50, 28], [74, 172, 44, 28], [292, 170, 44, 28], [182, 152, 54, 30],
      [122, 226, 56, 30], [244, 228, 56, 30], [180, 288, 66, 32], [58, 256, 40, 24], [304, 256, 40, 24]];

    // olives: small clusters (ripe violet-black and young green) hanging under a few front pads
    defs += '<radialGradient id="@olp" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#9b7bb8"/><stop offset=".45" stop-color="#4c2f66"/><stop offset="1" stop-color="#1e1030"/></radialGradient>' +
      '<radialGradient id="@olg" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#eef6a8"/><stop offset=".5" stop-color="#a8c24a"/><stop offset="1" stop-color="#55701f"/></radialGradient>';
    const olives = (list) => {
      let o = '';
      list.forEach(([x, y, rx, ry]) => {
        const n = 2 + ((rnd() * 2) | 0), bx = x + (rnd() - 0.5) * rx * 0.9, by = y + ry * 0.62;
        for (let j = 0; j < n; j++) {
          const off = j - (n - 1) / 2, rot = -off * 34 + (rnd() - 0.5) * 14, ripe = rnd() < 0.55;
          const ox = bx + off * 5.6, oy = by + 5.5 - Math.abs(off) * 1.5;
          o += `<g transform="translate(${f1(ox)} ${f1(oy)}) rotate(${f1(rot)})"><path d="M0-5.4 0-8" stroke="#3d5a26" stroke-width="1.2" stroke-linecap="round"/>` +
            `<ellipse cy="-.4" rx="2.9" ry="4.9" fill="url(#@ol${ripe ? 'p' : 'g'})" stroke="#140b1e" stroke-opacity=".45" stroke-width=".7"/>` +
            '<ellipse cx="-1" cy="-2.4" rx=".8" ry="1.5" fill="#fff" fill-opacity=".7"/></g>';
        }
      });
      return o;
    };

    let b = '<ellipse cx="182" cy="292" rx="132" ry="26" fill="#04142e" fill-opacity=".22"/>';
    b += pads(back, 'fb', '#a6e1ff', 0.55);
    b += leaves(back, 6, 3, ['#3e7d52', '#4f8f5e', '#8fcfee'], ['#123a28', '#1a4632']);
    b += pads(mid, 'fm', '#d7f0a8', 0.5);
    b += leaves(mid, 7, 4, ['#7fbb5c', '#98cd6c', '#5e9e4c'], ['#1d4b31', '#24563a']);
    let f = pads(front, 'ff', '#f1ffcf', 0.6);
    f += leaves(front, 9, 5, ['#a9d872', '#c2e48c', '#86c25c', '#dcefb4'], ['#2a6038', '#235532', '#2f6a3c']);
    f += sprays(front.concat(mid.slice(0, 3)), 2);
    f += olives([front[0], front[3], front[5], front[6], front[2]]);
    CROWN = { defs, back: b, front: f };
    return CROWN;
  }

  // ---------------------------------------------------------------- star (emblem in a gold glow) and book-cubes
  function starInner() {
    try { if (CH.art && CH.art.emblem) return CH.art.emblem({ shaded: true }); } catch (e) { console.error(e); }
    return hexagram();
  }
  function hexagram() {
    const id = 'lhx' + (++seq);
    const tri = (r, a0) => [0, 1, 2].map((i) => { const a = (a0 + i * 120) * D2R; return `${f1(50 + r * Math.cos(a))},${f1(50 + r * Math.sin(a))}`; }).join(' ');
    return `<svg viewBox="0 0 100 100"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1bf"/><stop offset=".45" stop-color="#ffd56a"/><stop offset="1" stop-color="#c98a1e"/></linearGradient>` +
      `<radialGradient id="${id}b" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#2f66c4"/><stop offset="1" stop-color="#0b2459"/></radialGradient></defs>` +
      `<circle cx="50" cy="50" r="50" fill="url(#${id}b)"/><g fill="url(#${id})" stroke="#8f5c12" stroke-width="2" stroke-linejoin="round"><polygon points="${tri(40, -90)}"/><polygon points="${tri(40, 90)}"/></g>` +
      `<circle cx="50" cy="50" r="10" fill="#fff6d6" fill-opacity=".5"/></svg>`;
  }
  /** Faceted gold star behind the emblem disc: 6 long points (aligned with the emblem's rhombi) + 6 short ones,
   *  each point split into a lit and a shaded facet (light from the top-left). Flat fills → no ids, cached. */
  let BURST = null;
  function burstSVG() {
    if (BURST) return BURST;
    const light = -125 * D2R;
    const RAMP = [[122, 74, 14], [226, 160, 50], [255, 244, 200]];
    const gold = (t) => {
      const [a, b, u] = t < 0.5 ? [RAMP[0], RAMP[1], t * 2] : [RAMP[1], RAMP[2], (t - 0.5) * 2];
      return `rgb(${a.map((v, i) => Math.round(lerp(v, b[i], u))).join(',')})`;
    };
    const P = (a, r) => `${f1(Math.cos(a) * r)} ${f1(Math.sin(a) * r)}`;
    const points = (n, R, r, a0, k) => {
      let s = '';
      for (let i = 0; i < n; i++) {
        const a = a0 + (i * 2 * Math.PI) / n, h = Math.PI / n;
        [-1, 1].forEach((sg) => {
          const lam = Math.cos(a + sg * h * 0.5 - light);
          s += `<path d="M0 0L${P(a + sg * h, r)}L${P(a, R)}Z" fill="${gold(clamp((lam + 1) / 2 * k + (sg < 0 ? 0.04 : 0), 0, 1))}"/>`;
        });
      }
      return s;
    };
    const main = -90 * D2R, sub = -60 * D2R;
    const outline = (n, R, r, a0) => {
      const pts = [];
      for (let i = 0; i < n * 2; i++) pts.push(P(a0 + (i * Math.PI) / n, i % 2 ? r : R));
      return `M${pts.join('L')}Z`;
    };
    BURST = '<svg viewBox="-100 -100 200 200" aria-hidden="true">' +
      `<g stroke-linejoin="round">${points(6, 80, 30, sub, 0.82)}<path d="${outline(6, 80, 30, sub)}" fill="none" stroke="#6b3f08" stroke-opacity=".5" stroke-width="1.2"/>` +
      `${points(6, 99, 36, main, 1)}<path d="${outline(6, 99, 36, main)}" fill="none" stroke="#6b3f08" stroke-opacity=".55" stroke-width="1.3"/></g></svg>`;
    return BURST;
  }
  /** Static light rays (rotated as a composited layer — no per-frame masking). */
  function raysSVG(id) {
    let d = '';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 360 + (i % 2) * 4, w = i % 3 ? 2.2 : 3.6;
      const p = (deg, r) => `${f1(150 + Math.cos(deg * D2R) * r)} ${f1(150 + Math.sin(deg * D2R) * r)}`;
      d += `M${p(a - w, 18)}L${p(a, 150)}L${p(a + w, 18)}Z`;
    }
    return `<svg viewBox="0 0 300 300"><defs><radialGradient id="${id}ry" cx=".5" cy=".5" r=".5"><stop offset=".08" stop-color="#fff1c4" stop-opacity=".9"/>` +
      `<stop offset=".45" stop-color="#ffd56a" stop-opacity=".32"/><stop offset="1" stop-color="#ffd56a" stop-opacity="0"/></radialGradient></defs>` +
      `<path d="${d}" fill="url(#${id}ry)"/></svg>`;
  }
  const CUBE_COLORS = ['#e63a35', '#3db54a', '#ec4f9c', '#17b8c4', '#f7941d', '#2a6fd6'];
  const LETTERS = ['א', 'ב', 'ת', 'ש', 'ה', 'ל'];
  function cubeSVG(i) {
    try { if (CH.art && CH.art.bookCube) return CH.art.bookCube(i % 6, { letter: LETTERS[i % 6], size: 100 }); } catch (e) { console.error(e); }
    const c = CUBE_COLORS[i % 6];
    return `<svg viewBox="0 0 100 100"><path d="M50 8 88 30 50 52 12 30Z" fill="${c}"/><path d="M12 30 50 52V94L12 72Z" fill="${c}" opacity=".78"/>` +
      `<path d="M88 30 50 52V94L88 72Z" fill="#f4ead2"/><path d="M50 8 88 30 50 52 12 30Z" fill="#fff" fill-opacity=".22"/>` +
      '<path d="M50 8 88 30V72L50 94 12 72V30Z" fill="none" stroke="#0a1a40" stroke-opacity=".35" stroke-width="2"/></svg>';
  }

  // ================================================================ the sage (rigged SVG)
  // Local units: origin at the feet, facing left (−x). Angles: positive = forward (toward the trunk) for limbs,
  // forward lean for the torso, chin-up for the head.
  const LEG = { thigh: 27, shin: 25, foot: 6.5 };
  function sageSVG(id) {
    const lg = (n, x1, y1, x2, y2, stops) => `<linearGradient id="${id}${n}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</linearGradient>';
    const rg = (n, cx, cy, r, stops) => `<radialGradient id="${id}${n}" cx="${cx}" cy="${cy}" r="${r}">` +
      stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</radialGradient>';
    const defs =
      lg('rb', 0, 0, 1, 1, [[0, '#7cc0ff'], [0.35, '#3d8ff0'], [1, '#1d4fb0']]) +          // robe (near)
      lg('rk', 0, 0, 1, 1, [[0, '#3f7fd8'], [1, '#173f8f']]) +                              // robe (far)
      lg('sk', 0, 0, 0, 1, [[0, '#2f6fd0'], [1, '#1a438f']]) +                              // skirt back panel
      lg('gd', 0, 0, 0, 1, [[0, '#fff1bf'], [0.45, '#f6c64e'], [1, '#b97a18']]) +           // gold
      rg('sn', 0.4, 0.35, 0.75, [[0, '#ffdcc0'], [0.6, '#f2b48c'], [1, '#d68e66']]) +      // skin
      lg('sf', 0, 0, 1, 0, [[0, '#e9a985'], [1, '#c9805e']]) +                              // skin (far limbs)
      lg('bd', 0, 0, 0.3, 1, [[0, '#ffffff'], [0.55, '#eef3fb'], [1, '#bccbe2']]) +         // beard
      lg('cl', 0, 0, 1, 1, [[0, '#fffaf0'], [0.6, '#f1e4c6'], [1, '#d3bd8f']]) +           // head cloth
      lg('sd', 0, 0, 0, 1, [[0, '#9a6236'], [1, '#5a3218']]);                               // sandal

    const shin = (far) => `<path class="ol" d="M-4.4 -1C-4.8 8-4.1 17-3.6 25.5L3.6 25.5C4.1 17 4.8 8 4.4-1Z" fill="url(#${id}${far ? 'sf' : 'sn'})"/>` +
      '<path d="M-4 13 4 17.5M-3.9 18.5 3.9 14M-3.7 23 3.7 21.5" stroke="#6a3a1a" stroke-width="1.7" stroke-linecap="round" fill="none"/>';
    const foot = (far) => `<path class="ol" d="M3.6-1.5C4 3 3 5.2-1 5.4L-14 5.4C-17.6 5.4-18.6 1.6-15.4-.4C-11.4-2.6-6-3.4-2.4-4.6Z" fill="url(#${id}${far ? 'sf' : 'sn'})"/>` +
      `<path class="ol" d="M4.4 4.4 4.4 7.2Q-6 8.4-17.6 7.2Q-19.2 6-17.4 4.6Z" fill="url(#${id}sd)"/>` +
      '<path d="M-9.5-1.6-8.6 5.2M-3 -3 -2.6 5.2" stroke="#6a3a1a" stroke-width="2" stroke-linecap="round"/>';
    const thigh = (far) => `<path class="ol" d="M-11.5-7C-12.6 5-11.4 17-10.4 28.5Q0 31.6 10.4 28.5C11.4 17 12.6 5 11.5-7Z" fill="url(#${id}${far ? 'rk' : 'rb'})"/>` +
      `<path d="M-10.6 24.6Q0 27.6 10.6 24.6L10.5 28.6Q0 31.6-10.5 28.6Z" fill="url(#${id}gd)"/>` +
      '<path d="M-3 2C-2 10-2.5 16-4 21" stroke="#0d2a6a" stroke-opacity=".3" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
    const upper = (far) => `<path class="ol" d="M-7.2-4C-7.8 5-7.2 14-6.6 22.6L6.6 22.6C7.2 14 7.8 5 7.2-4C5-9.6-5-9.6-7.2-4Z" fill="url(#${id}${far ? 'rk' : 'rb'})"/>`;
    const fore = (far) => `<path class="ol" d="M-6.6-1C-7.2 6-8.2 12-9.4 18.6L9.4 18.6C8.2 12 7.2 6 6.6-1Z" fill="url(#${id}${far ? 'rk' : 'rb'})"/>` +
      `<path d="M-8.9 15.4 8.9 15.4 9.4 18.6-9.4 18.6Z" fill="url(#${id}gd)"/>` +
      `<g transform="translate(0 23)"><path class="ol" d="M-5.6-4.6C-7-1-6 4.6-.6 5.8C4.6 6.6 7 2 6-2.6C5.2-5.6 1.6-6.4-1-6.2C-3-6-4.8-5.6-5.6-4.6Z" fill="url(#${id}${far ? 'sf' : 'sn'})"/>` +
      `<path class="ol" d="M-5.2-3C-8.6-3.4-10.2-.6-8.6 1.4C-7.4 2.6-5.6 2-4.6.6" fill="url(#${id}${far ? 'sf' : 'sn'})"/></g>`;
    const arm = (key, far) => `<g data-j="${key}">${upper(far)}<g data-j="${key}2">${fore(far)}</g></g>`;
    const leg = (key, far) => `<g data-j="${key}">${thigh(far)}<g data-j="${key}2">${shin(far)}<g data-j="${key}3">${foot(far)}</g></g></g>`;

    // torso (pivot = hips)
    const robe = `<path class="ol" d="M-15.5 4C-20-6-19.4-19-15-30.5C-12.4-37.6-6.4-42.4 2-42.4C10.6-42.4 16.8-38 18.4-29.6C20.4-17.6 18.4-6 16 4Z" fill="url(#${id}rb)"/>` +
      '<path d="M5-36C8-24 8-10 6 2M-6-30C-8-20-8.6-10-8 0" stroke="#0d2a6a" stroke-opacity=".28" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M15.6-30C17.6-18 17-7 15 2" stroke="#a9dcff" stroke-opacity=".55" stroke-width="1.8" fill="none" stroke-linecap="round"/>';
    const skirt = `<path class="ol" d="M-14 0C-16.2 10-17.4 22-18.2 33Q0 37.4 19.2 33C18.4 22 17.4 10 15.6 0Z" fill="url(#${id}sk)"/>` +
      `<path d="M-17.8 29.2Q0 33.4 18.8 29.2L19.2 33Q0 37.4-18.2 33Z" fill="url(#${id}gd)"/>`;
    const sash = `<path class="ol" d="M-17.6-8.6Q0-5 17.6-9L18 .6Q0 4.4-17.2 .8Z" fill="url(#${id}gd)"/>` +
      '<path d="M-17-4.4Q0-.8 17.8-4.6" stroke="#c0392b" stroke-width="1.6" fill="none"/>' +
      `<path class="ol" d="M-14.6-2C-17.4 6-18.6 13-17 20L-13 19.4C-13.6 13-12.4 6-10.4-1Z" fill="url(#${id}gd)"/>` +
      `<path class="ol" d="M-10.8-1.6C-11.4 5-10 11-7.6 16.8L-4.4 15.4C-6.4 9.6-7 4.4-6.6-1.2Z" fill="url(#${id}gd)"/>` +
      `<ellipse class="ol" cx="-12.6" cy="-3.6" rx="4.4" ry="4" fill="url(#${id}gd)"/>`;
    const collar = '<path d="M-9.2-40.6-1.6-30.4 5.4-41.4Q-2-43.6-9.2-40.6Z" fill="#f5efe2" stroke="#1b1238" stroke-width="1.6" stroke-linejoin="round"/>';

    // head (pivot = neck)
    const drape = `<path class="ol" d="M4-50C18-50 25.4-36 24.6-16C24.2-4 21.4 0 17 5L6.4 2.6C8.8-8 8-24 3-34Z" fill="url(#${id}cl)"/>` +
      '<path d="M15.4-30C17.6-20 17.4-8 15 1" stroke="#b49a68" stroke-opacity=".55" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
    const face = `<path class="ol" d="M-17.8-27C-19.4-37-12.6-44-2.8-44C7.4-44 13.8-36.6 13.6-26.2C13.4-15.6 6.2-8.4-3-8.4C-11.6-8.4-16.6-15.6-17.8-27Z" fill="url(#${id}sn)"/>` +
      '<ellipse cx="-7.4" cy="-17.4" rx="5.4" ry="3.6" fill="#ff7f72" fill-opacity=".45"/>';
    const beard = `<g data-j="beard"><path class="ol" d="M14.2-12.4C15.4 2 12 16 4.6 28C1.4 33-1.4 37-4.6 42.4C-6 36.2-9.6 32-11.6 26.4C-15.2 30-17.6 30.8-19.4 30.4C-19.2 24-21 18-24.2 12.6C-27.4 7-26.4-1.6-23.6-6.4C-17.8-2.6-10.4-3.4-4.4-6.8C2.4-10.6 9.4-12.6 14.2-12.4Z" fill="url(#${id}bd)"/>` +
      '<path d="M5-4C6 8 3 19-2 30M-6-3C-6 8-8 16-10 23M-15-1C-16 7-18 13-20 18M10-6C11 4 9 12 6 20" stroke="#9fb3d4" stroke-opacity=".65" stroke-width="1.3" fill="none" stroke-linecap="round"/>' +
      '<path d="M-21-4C-20 4-19 10-20 15" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".9"/></g>';
    const mouth = '<path class="cl-smile" d="M-20-10.6Q-15.6-6.2-10.8-9.6" stroke="#6b2a2a" stroke-width="1.8" fill="none" stroke-linecap="round"/>' +
      '<path class="cl-open ol" d="M-21.4-11.6Q-15.6-9.6-10-11.8Q-11.2-2.6-16-2.6Q-20.4-2.6-21.4-11.6Z" fill="#7a2230"/>' +
      '<path class="cl-open" d="M-18.8-5.8Q-15.8-7.6-12.6-5.8Q-14-3.4-15.8-3.4Q-17.6-3.4-18.8-5.8Z" fill="#ff8f8f"/>';
    const stache = '<path class="ol" d="M-24.2-11.6C-25-15.6-21.6-18.4-17.6-16.4C-15.4-18.6-11-18.4-8.6-15.6C-6-16.4-3.2-14.6-3.4-12C-6.4-10.6-9.4-11-11.6-12.4C-14-10.6-17.6-10.4-19.6-12.2C-21-10.6-23.2-10.4-24.2-11.6Z" fill="url(#' + id + 'bd)"/>';
    const nose = `<path class="ol" d="M-14.4-24.6C-19.8-25.8-25.6-22.6-25.2-17.6C-24.8-13.4-19.6-12.4-15.4-14.8Z" fill="url(#${id}sn)"/>` +
      '<ellipse cx="-21.6" cy="-20.8" rx="1.9" ry="1.3" fill="#fff" fill-opacity=".75"/>';
    const eye = '<g class="cl-eye"><ellipse cx="-9.8" cy="-26.4" rx="2.9" ry="3.7" fill="#1b1238"/><circle cx="-10.8" cy="-27.8" r="1.25" fill="#fff"/><circle cx="-8.8" cy="-24.9" r=".55" fill="#fff" fill-opacity=".8"/></g>' +
      '<path class="cl-happy" d="M-13.4-25.6Q-9.8-30.4-6.2-25.6" stroke="#1b1238" stroke-width="2.1" fill="none" stroke-linecap="round"/>' +
      '<path d="M-4.4-22.4C-3.4-20.6-3.6-19-4.6-18" stroke="#b86a4a" stroke-opacity=".5" stroke-width="1.2" fill="none" stroke-linecap="round"/>';
    const brow = '<path class="ol" d="M-16.8-33.2C-14.8-37-9-37.6-5-34C-4.4-33.2-5-32.2-6-32.4C-9.4-34.6-13.4-34.4-15.8-31.8C-16.6-31.8-17-32.4-16.8-33.2Z" fill="#fff"/>';
    const wrap = `<path class="ol" d="M-21-38.6C-21.6-49.6-12.4-57.4.8-57.4C14.6-57.4 23.6-48.6 23.2-36C23-29 20.4-22.4 17.2-17L9.4-18.8C10-25.8 6.6-33-1-35.6C-7.8-38-15-38.2-21-38.6Z" fill="url(#${id}cl)"/>` +
      '<path d="M-15.6-45C-10-53.6 4-56.4 13.6-50" stroke="#fff" stroke-opacity=".8" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<path d="M7-55C12.6-49 16-42 16.8-33" stroke="#b49a68" stroke-opacity=".5" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
      '<path class="ol" d="M-21.6-41.6C-14.6-44.6-3-44.2 5.6-40.2C12-37.2 17-32.4 20.4-26L19-21.6C15.8-27.6 11.2-32 5-34.8C-3-38.4-13.8-38.6-20.8-36.6Z" fill="#2a6fd6"/>' +
      `<path d="M-21.2-39.2C-14-42-3.4-41.6 5.2-37.8C11.4-35 16-30.6 19.6-24.2" stroke="url(#${id}gd)" stroke-width="1.7" fill="none" stroke-dasharray="3.2 2.2"/>`;

    return `<svg class="lad-sage" viewBox="-90 -190 180 210" width="180" height="210" overflow="visible" aria-hidden="true"><defs>${defs}</defs>` +
      '<ellipse class="cl-ground" cx="2" cy="1" rx="30" ry="5.5" fill="#06210f" fill-opacity=".38"/>' +
      '<g class="cl-root">' +
      leg('legB', true) +
      `<g data-j="torsoB">${arm('armB', true)}${skirt}${robe}${collar}</g>` +
      leg('legF', false) +
      `<g data-j="torsoF">${sash}${arm('armF', false)}<g data-j="head">${drape}${face}${beard}${mouth}${stache}${nose}${eye}${wrap}${brow}</g></g>` +
      '</g></svg>';
  }

  // Joint anchors (parent-relative translate) — hip y is solved per pose so the lower foot touches the ground.
  const J = {
    legF: [-2, 0], legF2: [0, LEG.thigh], legF3: [0, LEG.shin],
    legB: [5, 0], legB2: [0, LEG.thigh], legB3: [0, LEG.shin],
    torsoB: [2, 0], torsoF: [2, 0],
    armF: [-3, -36], armF2: [0, 21.5], armB: [7, -37], armB2: [0, 21.5],
    head: [-3, -41], beard: [-6, -10],
  };
  // Poses: lean, head, legs (thigh, shin, foot), arms (upper, elbow). Positive = forward.
  const POSES = {
    idle:   { lean: 2, head: 22, tF: 6, sF: -4, fF: 0, tB: -8, sB: 4, fB: 0, uF: 10, eF: 14, uB: 116, eB: 14 },
    climbA: { lean: 12, head: 16, tF: 74, sF: -112, fF: 26, tB: 6, sB: -8, fB: 0, uF: 150, eF: 4, uB: 106, eB: 30 },
    climbB: { lean: 12, head: 16, tF: 6, sF: -8, fF: 0, tB: 70, sB: -108, fB: 26, uF: 112, eF: 26, uB: 146, eB: 6 },
    crouch: { lean: 18, head: 8, tF: 82, sF: -128, fF: 20, tB: 44, sB: -86, fB: 10, uF: 120, eF: 34, uB: 100, eB: 44 },
    reach:  { lean: 6, head: 22, tF: 22, sF: -26, fF: -10, tB: -4, sB: -14, fB: -14, uF: 138, eF: 6, uB: 120, eB: 10 },
    cheer:  { lean: -7, head: 20, tF: 4, sF: -4, fF: 0, tB: -10, sB: 6, fB: 0, uF: 142, eF: 4, uB: 236, eB: -14 },
    cheerR: { lean: -5, head: 20, tF: 46, sF: -70, fF: 16, tB: 4, sB: -6, fB: 0, uF: 142, eF: 4, uB: 234, eB: -14 },
  };
  const KEYS = Object.keys(POSES.idle);
  const blendPose = (a, b, t) => { const o = {}; KEYS.forEach((k) => (o[k] = lerp(a[k], b[k], t))); return o; };
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  function legDrop(t, s) {                       // vertical extent of a leg from hip to sole
    const a = t * D2R, b = (t + s) * D2R;
    return LEG.thigh * Math.cos(a) + LEG.shin * Math.cos(b) + LEG.foot;
  }

  // ================================================================ ladder instance
  function create(container, opts = {}) {
    const id = 'lad' + (++seq) + '_';
    let N = clamp(Math.round(opts.steps || 4), 1, 15);
    let level = clamp(Math.round(opts.level || 0), 0, N);
    let destroyed = false, raf = 0, queue = Promise.resolve(), anim = null, cheerTimer = 0;

    const root = el('div', 'ladder');
    root.dataset.steps = N;
    const scene = el('div', 'lad-scene');
    root.append(scene);

    const tree = treeMarkup(), crown = crownMarkup();
    const sub = (s) => s.replace(/@/g, id);
    const aura = el('div', 'lad-aura');
    const crownB = el('div', 'lad-crown lad-crown-b', `<svg viewBox="0 0 ${W} 360" width="${W}" height="360" overflow="visible"><defs>${sub(crown.defs)}</defs>${sub(crown.back)}</svg>`);
    const trunk = el('div', 'lad-trunk', `<svg viewBox="0 0 ${W} 960" width="${W}" height="960" overflow="visible"><defs>${sub(tree.defs)}</defs>${sub(tree.body)}</svg>`);
    const crownF = el('div', 'lad-crown lad-crown-f', `<svg viewBox="0 0 ${W} 360" width="${W}" height="360" overflow="visible"><defs>${sub(crown.defs)}</defs>${sub(crown.front)}</svg>`);
    const star = el('div', 'lad-star', `<i class="glow"></i><i class="rays">${raysSVG(id)}</i><i class="burst">${burstSVG()}</i><i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i>`);
    const disc = el('div', 'disc', starInner());
    star.append(disc);
    const rungs = el('div', 'lad-rungs');
    const orbit = el('div', 'lad-orbit');
    const sage = el('div', 'lad-climber', sageSVG(id));
    const fx = el('div', 'lad-fx');
    scene.append(aura, crownB, trunk, crownF, star, rungs, orbit, sage, fx);
    container.append(root);

    // ---- fit the 360×880 design into the container (it is 360×880 in the game; anything else scales)
    const fit = () => {
      const w = container.clientWidth || W, h = container.clientHeight || H;
      scene.style.setProperty('--lad-k', Math.min(w / W, h / H).toFixed(4));
    };
    fit();
    let ro = null;
    try { ro = new ResizeObserver(fit); ro.observe(container); } catch (e) { /* old engine */ }

    // ---- book-cubes orbiting the crown (WAAPI keyframes sampled from a tilted ellipse; back half behind the crown)
    const cubeAnims = [];
    const NC = 6, PERIOD = 34000;
    for (let i = 0; i < NC; i++) {
      const c = el('div', 'lad-cube');
      const inner = el('div', 'bob', cubeSVG(i));
      inner.style.animationDelay = (-i * 1.37).toFixed(2) + 's';
      inner.style.animationDuration = (5.2 + (i % 3) * 0.9).toFixed(1) + 's';
      c.append(inner); orbit.append(c);
      const frames = [], S = 48, tilt = -9 * D2R, rx = 186 - (i % 2) * 12, ry = 54 + (i % 3) * 8, cy = 186 + (i % 2) * 18;
      for (let s = 0; s <= S; s++) {
        const th = (s / S) * Math.PI * 2;
        const ex = Math.cos(th) * rx, ey = Math.sin(th) * ry;
        const x = 180 + ex * Math.cos(tilt) - ey * Math.sin(tilt), y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
        const d = Math.sin(th), sc = 0.62 + 0.3 * (d + 1) / 2;
        frames.push({ offset: s / S, transform: `translate(${f1(x - 26)}px, ${f1(y - 26)}px) scale(${sc.toFixed(3)})`, opacity: (0.7 + 0.3 * (d + 1) / 2).toFixed(3), zIndex: d > 0 ? 6 : 1 });
      }
      // sharpen the z-index flips so a cube never sits "between" layers
      const keyed = [];
      frames.forEach((f, k) => {
        if (k && f.zIndex !== frames[k - 1].zIndex) keyed.push({ ...frames[k - 1], offset: f.offset, zIndex: f.zIndex });
        keyed.push(f);
      });
      try {
        const a = c.animate(keyed, { duration: PERIOD, iterations: Infinity, delay: -(i / NC) * PERIOD - 4000, easing: 'linear' });
        cubeAnims.push(a);
      } catch (e) { /* ignore */ }
    }

    // ---- rungs (pegs + badges)
    let rungEls = [];
    function buildRungs() {
      rungs.innerHTML = '';
      rungEls = [];
      root.dataset.steps = N;
      if (N > 10) root.dataset.dense = ''; else delete root.dataset.dense;
      const r = N <= 4 ? 21 : N <= 8 ? 18 : N <= 12 ? 16 : 14.5;
      const zig = N > 6;
      for (let i = 1; i <= N; i++) {
        const y = rungY(i, N), yc = y + 5, cx = tcx(yc), hw = thw(yc);
        const alt = i % 2 ? 1 : -1;
        const lenL = zig ? (alt > 0 ? 16 : 34) : 22, lenR = 26;
        const rung = el('div', 'lad-rung');
        const pegR = el('i', 'peg r');
        Object.assign(pegR.style, { left: f1(cx + hw - 6) + 'px', top: f1(yc - 5.5) + 'px', width: lenR + 6 + 'px', transform: `rotate(${-6 + alt * 2}deg)` });
        const pegL = el('i', 'peg l');
        Object.assign(pegL.style, { left: f1(cx - hw - lenL) + 'px', top: f1(yc - 5.5) + 'px', width: lenL + 6 + 'px', transform: `rotate(${6 - alt * 2}deg)` });
        const bx = cx - hw - lenL - r + 5, by = yc - (lenL * Math.sin((6 - alt * 2) * D2R)) + 1;
        const glow = el('i', 'glow');
        Object.assign(glow.style, { left: f1(bx) + 'px', top: f1(by) + 'px', width: f1(r * 3.6) + 'px', height: f1(r * 3.6) + 'px' });
        const badge = el('b', 'badge');
        badge.textContent = String(i);
        Object.assign(badge.style, { left: f1(bx) + 'px', top: f1(by) + 'px' });
        badge.style.setProperty('--r', r + 'px');
        rung.append(glow, pegL, pegR, badge);
        rungs.append(rung);
        rungEls.push({ rung, badge });
      }
      markRungs();
    }
    function markRungs(popAt) {
      rungEls.forEach(({ rung, badge }, i) => {
        const n = i + 1;
        rung.classList.toggle('is-done', n <= level);
        rung.classList.toggle('is-next', n === level + 1);
        if (n === popAt && badge.animate && !reduced) {
          badge.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.45)', offset: 0.35 }, { transform: 'translate(-50%,-50%) scale(1)' }],
            { duration: 620, easing: 'cubic-bezier(.34,1.56,.64,1)' });
        }
      });
      star.classList.toggle('is-lit', level >= N);
    }

    // ---- sage rig
    const svg = sage.querySelector('svg');
    const joints = {};
    svg.querySelectorAll('[data-j]').forEach((g) => (joints[g.dataset.j] = g));
    const st = { x: 0, y: 0, sx: 1, sy: 1, pose: { ...POSES.idle }, beard: 0, bv: 0 };
    const setJ = (k, x, y, a) => { const g = joints[k]; if (g) g.setAttribute('transform', `translate(${f1(x)} ${f1(y)}) rotate(${f1(a)})`); };
    function render() {
      const p = st.pose;
      const hip = -Math.max(legDrop(p.tF, p.sF), legDrop(p.tB, p.sB));
      setJ('legF', J.legF[0], hip, p.tF); setJ('legF2', 0, LEG.thigh, p.sF); setJ('legF3', 0, LEG.shin, p.fF - p.tF - p.sF);
      setJ('legB', J.legB[0], hip, p.tB); setJ('legB2', 0, LEG.thigh, p.sB); setJ('legB3', 0, LEG.shin, p.fB - p.tB - p.sB);
      setJ('torsoB', J.torsoB[0], hip, -p.lean); setJ('torsoF', J.torsoF[0], hip, -p.lean);   // he faces −x: forward lean is CCW
      setJ('armF', J.armF[0], J.armF[1], p.uF); setJ('armF2', 0, J.armF2[1], p.eF);
      setJ('armB', J.armB[0], J.armB[1], p.uB); setJ('armB2', 0, J.armB2[1], p.eB);
      setJ('head', J.head[0], J.head[1], p.head);
      setJ('beard', J.beard[0], J.beard[1], st.beard);
      sage.style.transform = `translate3d(${f1(st.x - 90)}px, ${f1(st.y - 190)}px, 0) scale(${st.sx.toFixed(3)}, ${st.sy.toFixed(3)})`;
    }
    const restPose = (k) => (k <= 0 ? POSES.idle : k % 2 ? POSES.climbA : POSES.climbB);
    function place(k) {
      const f = feetAt(k, N);
      st.x = f.x; st.y = f.y; st.sx = st.sy = 1; st.beard = 0; st.bv = 0;
      st.pose = { ...restPose(k) };
      sage.classList.toggle('on-ground', k <= 0);
      svg.classList.remove('is-cheer');
      render();
    }

    // ---- animation driver (one rAF loop per instance, only while something moves)
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (anim) { const a = anim; anim = null; a.done(); }
    }
    function run(step) {
      return new Promise((resolve) => {
        stop();
        let last = performance.now(), t = 0;     // simulated clock: frame-rate independent, never skips a phase
        anim = { done: resolve };
        const frame = (now) => {
          if (destroyed) { resolve(); return; }
          const dt = Math.min(1 / 15, Math.max(0, (now - last) / 1000)); last = now; t += dt;
          const finished = step(t, dt);
          render();
          if (finished) { raf = 0; anim = null; resolve(); } else raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      });
    }
    // beard: damped spring driven by vertical velocity
    function beardStep(vy, dt) {
      const target = clamp(vy * 0.018, -16, 16);
      for (let h = dt / 4, i = 0; i < 4; i++) { st.bv += (-(st.beard - target) * 180 - st.bv * 14) * h; st.beard += st.bv * h; }
    }

    /** Spring jump from the current spot to level `to`. */
    function jump(to) {
      const from = { x: st.x, y: st.y }, dst = feetAt(to, N), startPose = { ...st.pose }, endPose = restPose(to);
      const up = dst.y < from.y, SQ = reduced ? 0.01 : 0.12;
      let p = 0, v = 0, landed = false, launched = false, prevY = st.y;
      const K = 128, C = 14;                       // spring stiffness / damping (≈ one 9% overshoot, settles ~0.65s)
      if (!reduced && up && to > 0) setTimeout(() => !destroyed && leaves(), SQ * 1000);
      return run((t, dt) => {
        if (t < SQ) {                              // anticipation: crouch & squash
          const e = ease(t / SQ);
          st.pose = blendPose(startPose, POSES.crouch, e);
          st.sy = 1 - 0.1 * e; st.sx = 1 + 0.07 * e;
          return false;
        }
        if (!launched) { launched = true; CH.sound && CH.sound.play && CH.sound.play('climb'); }
        for (let h = dt / 6, i = 0; i < 6; i++) { v += (-(p - 1) * K - v * C) * h; p += v * h; }
        const q = clamp(p, 0, 1);
        st.x = lerp(from.x, dst.x, p) + Math.sin(q * Math.PI) * (up ? 16 : 6);
        st.y = lerp(from.y, dst.y, p);
        // stretch while flying up, squash as the spring overshoots and pulls back
        const s = clamp(v * 0.022, -0.07, 0.08);
        st.sy = 1 + s; st.sx = 1 - s * 0.55;
        // pose: crouch → reach (take-off) → rest (landing), pose switch mid-air
        st.pose = q < 0.45 ? blendPose(POSES.crouch, POSES.reach, ease(q / 0.4)) : blendPose(POSES.reach, endPose, ease((q - 0.45) / 0.45));
        beardStep((st.y - prevY) / Math.max(dt, 1e-3), dt); prevY = st.y;
        const settled = t > SQ + 0.3 && Math.abs(p - 1) < 0.003 && Math.abs(v) < 0.05 && Math.abs(st.beard) < 0.4;
        const done = settled || t > SQ + 1.1;
        if (!landed && (p > 0.92 || done)) {
          landed = true; level = to; markRungs(to);
          sage.classList.toggle('on-ground', to <= 0);
          sparkleAt(to);
          if (up && to >= N) flareStar();          // reaching the top lights the star of the Tanakh
        }
        if (done) { st.x = dst.x; st.y = dst.y; st.sx = st.sy = 1; st.pose = { ...endPose }; st.beard = 0; return true; }
        return false;
      });
    }

    function sparkleAt(k) {
      if (k <= 0 || !CH.fx || !CH.fx.burst || !CH.stage || !rungEls[k - 1]) return;
      try {
        const r = CH.stage.rectOf(rungEls[k - 1].badge);
        if (r.w > 0) CH.fx.burst(r.cx, r.cy, { kind: 'sparkle', count: 16, color: '#ffd56a' });
      } catch (e) { /* ignore */ }
    }
    // a few leaves flick off the tree as he jumps
    const LEAF = '<svg viewBox="-1 -4 15 8" width="15" height="8"><path d="M0 0C3.2-2.7 8.4-3 13 0C8.4 3 3.2 2.7 0 0Z" fill="#7cc04f" stroke="#2b6d36" stroke-width=".8"/></svg>';
    function leaves() {
      for (let i = 0; i < 3; i++) {
        const lf = el('i', 'leaf', LEAF);
        const x0 = st.x - 22 + Math.random() * 18, y0 = st.y - 150 + Math.random() * 40;
        fx.append(lf);
        const dx = (Math.random() - 0.35) * 70, dy = 90 + Math.random() * 90, r0 = Math.random() * 360, r1 = r0 + (Math.random() > 0.5 ? 1 : -1) * (260 + Math.random() * 300);
        const a = lf.animate([
          { transform: `translate(${f1(x0)}px, ${f1(y0)}px) rotate(${f1(r0)}deg) scale(.4)`, opacity: 0 },
          { transform: `translate(${f1(x0 + dx * 0.25)}px, ${f1(y0 - 14)}px) rotate(${f1(r0 + 60)}deg) scale(1)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${f1(x0 + dx)}px, ${f1(y0 + dy)}px) rotate(${f1(r1)}deg) scale(.9)`, opacity: 0 },
        ], { duration: 1400 + Math.random() * 500, delay: i * 70, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'both' });
        a.finished.catch(() => {}).then(() => lf.remove());
      }
    }

    function flareStar() {
      star.classList.add('is-lit');
      const opts = { duration: 1300, easing: 'cubic-bezier(.16,1,.3,1)' };
      const g = star.querySelector('.glow'), rays = star.querySelector('.rays'), burst = star.querySelector('.burst');
      burst.animate && burst.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: 'translate(-50%,-50%) scale(1.4)', offset: 0.28 }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 1200, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      g.animate && g.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(2.1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }], opts);
      rays.animate && rays.animate([{ opacity: 0.7, scale: '1' }, { opacity: 1, scale: '1.7', offset: 0.25 }, { opacity: 0.7, scale: '1' }], opts);
      disc.animate && disc.animate([{ transform: 'translate(-50%,-50%) scale(1) rotate(0deg)' }, { transform: 'translate(-50%,-50%) scale(1.3) rotate(30deg)', offset: 0.3 }, { transform: 'translate(-50%,-50%) scale(1) rotate(60deg)' }], { duration: 1100, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      if (CH.fx && CH.fx.burst && CH.stage) {
        try { const r = CH.stage.rectOf(disc); if (r.w > 0) CH.fx.burst(r.cx, r.cy, { kind: 'sparkle', count: 40, color: '#ffe49a' }); } catch (e) { /* ignore */ }
      }
    }

    function cheerAnim() {
      clearTimeout(cheerTimer);
      const startPose = { ...st.pose }, cp = level > 0 ? POSES.cheerR : POSES.cheer, base = feetAt(level, N);
      svg.classList.add('is-cheer');
      if (level >= N) flareStar();
      const hop = reduced ? 0 : 1;
      return run((t, dt) => {
        st.pose = blendPose(startPose, cp, ease(t / 0.22));
        // two happy hops with a damped bounce
        const ph = t / 0.36, y = hop * (t < 0.72 ? -Math.abs(Math.sin(ph * Math.PI)) * (t < 0.36 ? 20 : 11) : 0);
        const prev = st.y; st.y = base.y + y; st.x = base.x;
        const land = t < 0.72 ? Math.max(0, 1 - Math.abs(Math.sin(ph * Math.PI)) * 6) : 0;
        st.sy = 1 - 0.07 * land * hop; st.sx = 1 + 0.05 * land * hop;
        beardStep((st.y - prev) / Math.max(dt, 1e-3), dt);
        if (t > 1.0) { st.y = base.y; st.sx = st.sy = 1; return true; }
        return false;
      }).then(() => {
        const cheering = () => !destroyed && !raf && svg.classList.contains('is-cheer');
        if (level >= N) { celebrate(cheering); return; }
        cheerTimer = setTimeout(() => {           // relax back into the resting pose
          if (!cheering()) return;
          const from = { ...st.pose }, to = restPose(level);
          run((t) => { st.pose = blendPose(from, to, ease(t / 0.4)); if (t > 0.4) { svg.classList.remove('is-cheer'); return true; } return false; });
        }, 2600);
      });
    }
    /** At the top he keeps celebrating (result screen): a small happy hop every few seconds until something else moves him. */
    function celebrate(cheering) {
      if (reduced) return;
      cheerTimer = setTimeout(() => {
        if (!cheering()) return;
        const base = feetAt(level, N);
        run((t, dt) => {
          const prev = st.y;
          st.y = base.y - Math.max(0, Math.sin((t / 0.42) * Math.PI)) * 12;
          const land = t > 0.42 ? Math.max(0, 1 - (t - 0.42) / 0.16) : 0;
          st.sy = 1 - 0.06 * land; st.sx = 1 + 0.04 * land;
          beardStep((st.y - prev) / Math.max(dt, 1e-3), dt);
          if (t > 0.62 && (Math.abs(st.beard) < 0.4 || t > 1.2)) { st.y = base.y; st.sx = st.sy = 1; return true; }
          return false;
        }).then(() => cheering() && celebrate(cheering));
      }, 2600 + Math.random() * 1400);
    }

    let gen = 0;                                   // bumped by direct setLevel/setSteps: queued animations are dropped
    const enqueue = (fn) => { const g = gen; return (queue = queue.then(() => (destroyed || g !== gen ? undefined : fn())).catch((e) => console.error(e))); };

    const api = {
      el: root,
      get level() { return level; },
      get steps() { return N; },
      setLevel(k, o = {}) {
        k = clamp(Math.round(k), 0, N);
        if (!o.animate) {
          gen++; clearTimeout(cheerTimer); stop();
          level = k; place(k); markRungs();
          return Promise.resolve();
        }
        return enqueue(() => (k === level ? Promise.resolve() : jump(k)));
      },
      climb() {
        return enqueue(() => (level >= N ? Promise.resolve() : (clearTimeout(cheerTimer), svg.classList.remove('is-cheer'), jump(level + 1))));
      },
      cheer() { return enqueue(() => cheerAnim()); },
      setSteps(n) {
        N = clamp(Math.round(n) || 1, 1, 15);
        level = clamp(level, 0, N);
        gen++; clearTimeout(cheerTimer); stop();
        buildRungs(); place(level);
      },
      _pose(name) { if (POSES[name]) { stop(); st.pose = { ...POSES[name] }; svg.classList.toggle('is-cheer', /^cheer/.test(name)); render(); } },   // dev aid
      destroy() {
        destroyed = true; clearTimeout(cheerTimer); stop();
        cubeAnims.forEach((a) => a.cancel());
        if (ro) ro.disconnect();
        root.remove();
      },
    };
    buildRungs();
    place(level);
    return api;
  }

  // ================================================================ victory wreath
  const SPRING = (() => {                          // linear() easing sampled from a damped spring (fallback: back-out)
    try {
      if (!CSS.supports('animation-timing-function', 'linear(0, 1)')) throw 0;
      const pts = [];
      for (let i = 0; i <= 40; i++) { const t = i / 40, x = 1 - Math.exp(-6.2 * t) * Math.cos(11 * t); pts.push(x.toFixed(4)); }
      pts[40] = '1';
      return `linear(${pts.join(',')})`;
    } catch (e) { return 'cubic-bezier(.34,1.56,.64,1)'; }
  })();

  function wreathCreate(container) {
    const id = 'wr' + (++seq) + '_';
    const C = 280, R = 222, V = 560;
    const gold = (n, x1, y1, x2, y2, stops) => `<linearGradient id="${id}${n}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    let defs =
      gold('la', 0, 0, 0, 1, [[0, '#fff6cf'], [0.4, '#ffd979'], [1, '#e2a032']]) +       // leaf lit half
      gold('lb', 0, 0, 0, 1, [[0, '#e9ac3e'], [0.6, '#b8761c'], [1, '#7c4a0c']]) +       // leaf shade half
      gold('st', 0, 0, 1, 1, [[0, '#fff1bf'], [0.45, '#e7b448'], [1, '#8f5c12']]) +      // stem
      gold('rb', 0, 0, 0, 1, [[0, '#ff6b6b'], [0.45, '#d42a36'], [1, '#7e1220']]) +      // ribbon
      gold('rd', 0, 0, 0, 1, [[0, '#b81f2c'], [1, '#5e0c16']]) +
      `<radialGradient id="${id}ol" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff8dc"/><stop offset=".35" stop-color="#ffd56a"/><stop offset="1" stop-color="#9a6212"/></radialGradient>` +
      `<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
      `<radialGradient id="${id}gl" cx=".5" cy=".5" r=".5"><stop offset=".62" stop-color="#ffd56a" stop-opacity="0"/><stop offset=".8" stop-color="#ffd56a" stop-opacity=".22"/><stop offset="1" stop-color="#ffd56a" stop-opacity="0"/></radialGradient>`;

    // stems: from the bottom crossing, up each side, open gap at the top
    const P = (aDeg, r) => [C + Math.cos(aDeg * D2R) * r, C + Math.sin(aDeg * D2R) * r];
    const side = (s) => {                          // s = -1 left, +1 right
      const a0 = 90 - s * 16, a1 = 90 - s * 154, n = 40, pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = lerp(a0, a1, t), r = R + 5 * Math.sin(t * Math.PI) - 16 * Math.pow(1 - t, 3);
        pts.push(P(a, r).concat(a));
      }
      return pts;
    };
    const leafD = (L, w) => `M0 0C${f1(L * 0.2)} ${f1(-w * 0.64)} ${f1(L * 0.62)} ${f1(-w * 0.66)} ${L} 0Z`;
    const leafE = (L, w) => `M0 0C${f1(L * 0.2)} ${f1(w * 0.6)} ${f1(L * 0.62)} ${f1(w * 0.6)} ${L} 0Z`;
    const rnd = rng(77);
    let stemsSvg = '', leavesSvg = '', olivesSvg = '', maskSvg = '';
    [-1, 1].forEach((s) => {
      const pts = side(s);
      const d = smooth(pts.map((p) => [p[0], p[1]]));
      stemsSvg += `<path class="wr-stem" d="${d}" pathLength="1" fill="none" stroke="#6b3f08" stroke-opacity=".55" stroke-width="8.5" stroke-linecap="round"/>` +
        `<path class="wr-stem" d="${d}" pathLength="1" fill="none" stroke="url(#${id}st)" stroke-width="6" stroke-linecap="round"/>` +
        `<path class="wr-stem" d="${d}" pathLength="1" fill="none" stroke="#fff3c4" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round" transform="translate(${-s * 0.8} -1)"/>`;
      maskSvg += `<path d="${d}" fill="none" stroke="#fff" stroke-width="6"/>`;
      const n = 17;
      for (let i = 0; i < n; i++) {
        const t = 0.035 + (i / (n - 1)) * 0.925, k = Math.round(t * (pts.length - 1));
        const [x, y, a] = pts[k];
        const tan = a - s * 90;                    // direction of growth (toward the top)
        const last = i === n - 1;
        [1, -1].forEach((side2, j) => {
          if (last && j) return;
          const L = lerp(60, 34, t) * (0.92 + rnd() * 0.16), w = L * 0.4;
          const ang = tan + side2 * s * (last ? 6 : 32 + j * 6 + (rnd() - 0.5) * 8);
          const off = (tan + side2 * 90 * s) * D2R;
          const ox = x + Math.cos(off) * 2.5, oy = y + Math.sin(off) * 2.5;
          const lit = side2 * s < 0;              // outer leaves catch the light
          const body = `<path d="${leafD(L, w)}" fill="url(#${id}${lit ? 'la' : 'lb'})"/><path d="${leafE(L, w)}" fill="url(#${id}${lit ? 'lb' : 'la'})" fill-opacity=".94"/>` +
            `<path d="M3 0Q${f1(L * 0.5)} ${f1(-w * 0.06)} ${f1(L * 0.88)} 0" stroke="#7c4a0c" stroke-opacity=".6" stroke-width="1.2" fill="none" stroke-linecap="round"/>` +
            `<path d="${leafD(L, w)}${leafE(L, w)}" fill="none" stroke="#6b3f08" stroke-opacity=".38" stroke-width=".9"/>` +
            `<path d="M${f1(L * 0.14)} ${f1(-w * 0.3)}C${f1(L * 0.3)} ${f1(-w * 0.52)} ${f1(L * 0.55)} ${f1(-w * 0.52)} ${f1(L * 0.74)} ${f1(-w * 0.3)}" fill="none" stroke="#fffbe6" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/>`;
          const tr = `translate(${f1(ox)} ${f1(oy)}) rotate(${f1(ang)})`;
          leavesSvg += `<g transform="${tr}"><g class="wr-leaf" data-t="${t.toFixed(3)}">${body}</g></g>`;
          maskSvg += `<path transform="${tr}" d="${leafD(L, w)}${leafE(L, w)}" fill="#fff"/>`;
        });
        if (i % 3 === 2 && i < n - 2) {            // glossy olives in pairs, on the inner side
          [0, 1].forEach((q) => {
            const oa = tan - s * (q ? 62 : 104), ln = q ? 17 : 14;
            const ox = x + Math.cos(oa * D2R) * ln, oy = y + Math.sin(oa * D2R) * ln;
            olivesSvg += `<g class="wr-olive" data-t="${t.toFixed(3)}" style="transform-origin:${f1(x)}px ${f1(y)}px">` +
              `<path d="M${f1(x)} ${f1(y)}L${f1(ox)} ${f1(oy)}" stroke="url(#${id}st)" stroke-width="2.2"/>` +
              `<ellipse cx="${f1(ox)}" cy="${f1(oy)}" rx="7.6" ry="10.4" transform="rotate(${f1(oa - 90)} ${f1(ox)} ${f1(oy)})" fill="url(#${id}ol)" stroke="#6b3f08" stroke-opacity=".55" stroke-width="1"/>` +
              `<ellipse cx="${f1(ox - 2.4)}" cy="${f1(oy - 3.4)}" rx="2.4" ry="3" fill="#fff" fill-opacity=".85"/></g>`;
            maskSvg += `<ellipse cx="${f1(ox)}" cy="${f1(oy)}" rx="7.6" ry="10.4" fill="#fff"/>`;
          });
        }
      }
    });

    // ribbon bow at the bottom
    const by = C + R + 4;
    const loop = (sg) => {
      const X = (v) => C + sg * v;
      return `<path d="M${X(6)} ${by - 2}C${X(26)} ${by - 34} ${X(78)} ${by - 38} ${X(80)} ${by - 8}C${X(82)} ${by + 18} ${X(36)} ${by + 20} ${X(6)} ${by + 6}Z" fill="url(#${id}rb)" stroke="#5e0c16" stroke-opacity=".6" stroke-width="1.4"/>` +
        `<path d="M${X(14)} ${by + 2}C${X(34)} ${by - 10} ${X(56)} ${by - 10} ${X(70)} ${by - 4}C${X(56)} ${by + 4} ${X(36)} ${by + 8} ${X(14)} ${by + 4}Z" fill="#5e0c16" fill-opacity=".45"/>` +
        `<path d="M${X(14)} ${by - 6}C${X(30)} ${by - 26} ${X(62)} ${by - 30} ${X(72)} ${by - 12}" fill="none" stroke="#ffb3aa" stroke-opacity=".75" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M${X(80)} ${by - 8}C${X(82)} ${by + 18} ${X(36)} ${by + 20} ${X(6)} ${by + 6}" fill="none" stroke="#ffd56a" stroke-opacity=".85" stroke-width="1.8"/>`;
    };
    const tail = (sg, g) => {
      const X = (v) => C + sg * v;
      return `<path d="M${X(-4)} ${by + 6}C${X(10)} ${by + 40} ${X(30)} ${by + 72} ${X(50)} ${by + 104}L${X(34)} ${by + 98}L${X(30)} ${by + 118}C${X(10)} ${by + 84} ${X(-6)} ${by + 48} ${X(-12)} ${by + 12}Z" fill="url(#${id}${g})" stroke="#5e0c16" stroke-opacity=".5" stroke-width="1.2"/>` +
        `<path d="M${X(-2)} ${by + 14}C${X(10)} ${by + 46} ${X(26)} ${by + 74} ${X(44)} ${by + 100}" fill="none" stroke="#ffd56a" stroke-opacity=".7" stroke-width="1.5"/>`;
    };
    const ribbon = `<g class="wr-ribbon" style="transform-origin:${C}px ${by}px">` + tail(-1, 'rd') + tail(1, 'rb') + loop(-1) + loop(1) +
      `<rect x="${C - 13}" y="${by - 13}" width="26" height="26" rx="8" fill="url(#${id}rb)" stroke="#5e0c16" stroke-opacity=".65" stroke-width="1.4"/>` +
      `<rect x="${C - 10}" y="${by - 10}" width="20" height="20" rx="6" fill="none" stroke="#ffd56a" stroke-opacity=".9" stroke-width="1.5"/>` +
      `<path d="M${C - 7} ${by - 6}Q${C} ${by - 10} ${C + 7} ${by - 6}" stroke="#fff" stroke-opacity=".65" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`;

    // twinkles
    const tw = [[-122, -168, 1], [178, -96, 0.8], [-206, 64, 0.7], [150, 168, 0.9], [36, -222, 0.75]].map(([dx, dy, s]) =>
      `<g transform="translate(${C + dx} ${C + dy}) scale(${s})"><path class="wr-tw" d="M0-14C1.4-3 3-1.4 14 0C3 1.4 1.4 3 0 14C-1.4 3-3 1.4-14 0C-3-1.4-1.4-3 0-14Z" fill="#fff8dc"/></g>`).join('');

    defs += `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${V}" height="${V}">${maskSvg}</mask>`;
    const html = `<svg viewBox="0 0 ${V} ${V}" overflow="visible" aria-hidden="true"><defs>${defs}</defs>` +
      `<circle class="wr-glow" cx="${C}" cy="${C}" r="${R + 60}" fill="url(#${id}gl)"/>` +
      `<g class="wr-body">${stemsSvg}${leavesSvg}${olivesSvg}${ribbon}</g>` +
      `<g mask="url(#${id}m)"><g transform="rotate(24 ${C} ${C})"><rect class="wr-shine" x="-200" y="-80" width="120" height="${V + 160}" fill="url(#${id}sh)"/></g></g>` +
      `<g class="wr-tws">${tw}</g></svg>`;

    const root = el('div', 'wreath', html);
    container.append(root);
    const q = (s) => Array.from(root.querySelectorAll(s));
    const stems = q('.wr-stem'), leafEls = q('.wr-leaf'), oliveEls = q('.wr-olive');
    const ribbonEl = root.querySelector('.wr-ribbon'), shine = root.querySelector('.wr-shine'), glowEl = root.querySelector('.wr-glow'), tws = q('.wr-tw');
    let anims = [];

    function reset() {
      anims.forEach((a) => a.cancel()); anims = [];
      root.classList.remove('is-played');
    }
    function play() {
      reset();
      root.classList.add('is-played');
      const k = reduced ? 0.25 : 1;
      const A = (elx, kf, o) => { if (!elx.animate) return null; const a = elx.animate(kf, { fill: 'both', ...o, duration: o.duration * k, delay: (o.delay || 0) * k }); anims.push(a); return a; };
      A(ribbonEl, [{ transform: 'scale(.2) rotate(-25deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 700, easing: SPRING });
      const DRAW0 = 100, DRAW = 780;
      stems.forEach((s) => A(s, [{ strokeDashoffset: 1, strokeDasharray: '1 1' }, { strokeDashoffset: 0, strokeDasharray: '1 1' }], { duration: DRAW, delay: DRAW0, easing: 'cubic-bezier(.45,.05,.3,1)' }));
      // leaf i appears when the stem has grown past it
      const at = (t) => DRAW0 + DRAW * (1 - Math.pow(1 - t, 1.6)) * 0.94;
      leafEls.forEach((lf, i) => {
        const t = +lf.dataset.t;
        A(lf, [{ transform: 'scale(0) rotate(-30deg)', opacity: 0 }, { opacity: 1, offset: 0.25 }, { transform: 'none', opacity: 1 }], { duration: 560, delay: at(t) + (i % 2) * 40, easing: SPRING });
      });
      oliveEls.forEach((o) => A(o, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: at(+o.dataset.t) + 220, easing: SPRING }));
      A(glowEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 800, easing: 'ease-out' });
      const sh = A(shine, [{ transform: 'translateX(0px)' }, { transform: `translateX(${V + 380}px)` }], { duration: 640, delay: 1000, easing: 'cubic-bezier(.45,0,.25,1)' });
      tws.forEach((t, i) => A(t, [{ transform: 'scale(0) rotate(0deg)', opacity: 0 }, { transform: 'scale(1) rotate(45deg)', opacity: 1, offset: 0.4 }, { transform: 'scale(0) rotate(90deg)', opacity: 0 }], { duration: 800, delay: 1000 + i * 120, easing: 'ease-out' }));
      return (sh ? sh.finished.catch(() => {}) : Promise.resolve()).then(() => undefined);
    }
    return { el: root, play, reset };
  }

  CH.ladder = { create };
  CH.wreath = { create: wreathCreate };
})(window.CH = window.CH || {});
