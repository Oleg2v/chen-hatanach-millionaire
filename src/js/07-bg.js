/* 07-bg.js — full-window background: Kohelet text texture, Jerusalem skyline, mouse parallax. */
(function (CH) {
  'use strict';
  const { $, clamp } = CH.u;

  // Kohelet 3:1–8, without nikud (texture only, barely visible)
  const KOHELET = [
    'לכל זמן ועת לכל חפץ תחת השמים',
    'עת ללדת ועת למות עת לטעת ועת לעקור נטוע',
    'עת להרוג ועת לרפוא עת לפרוץ ועת לבנות',
    'עת לבכות ועת לשחוק עת ספוד ועת רקוד',
    'עת להשליך אבנים ועת כנוס אבנים עת לחבוק ועת לרחק מחבק',
    'עת לבקש ועת לאבד עת לשמור ועת להשליך',
    'עת לקרוע ועת לתפור עת לחשות ועת לדבר',
    'עת לאהב ועת לשנא עת מלחמה ועת שלום',
  ].join(' · ');

  function init() {
    const t = $('#bg .bg-text');
    t.textContent = Array(14).fill(KOHELET).join(' · ');

    $('#bg .bg-horizon').innerHTML = horizonSvg();
    applyTheme();
    CH.u.bus.on('store:change', ({ what }) => what === 'settings' && applyTheme());

    const art = CH.art || {};
    if (art.skyline) {
      try {
        $('#bg .sky-back').innerHTML = art.skyline('back');
        $('#bg .sky-front').innerHTML = art.skyline('front');
      } catch (e) { console.error(e); }
    }
    if (CH.fx && CH.fx.initBackground) {
      try { CH.fx.initBackground($('#bg-canvas')); } catch (e) { console.error(e); }
    }

    // Gentle parallax: layers drift opposite to the pointer.
    const layers = [
      [$('#bg .bg-rays'), 10], [$('#bg .bg-text'), 16], [$('#bg .sky-back'), 22], [$('#bg .sky-front'), 34],
    ];
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
    window.addEventListener('mousemove', (e) => {
      tx = clamp(e.clientX / innerWidth - 0.5, -0.5, 0.5);
      ty = clamp(e.clientY / innerHeight - 0.5, -0.5, 0.5);
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    function tick() {
      cx += (tx - cx) * 0.06; cy += (ty - cy) * 0.06;
      layers.forEach(([el, k]) => { if (el) el.style.translate = `${(-cx * k).toFixed(2)}px ${(-cy * k * 0.5).toFixed(2)}px`; });
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    }
  }

  /** 'modern' (default, per the client's spec: fresh concept) or 'classic' (white Jerusalem skyline). */
  function applyTheme() {
    const classic = (CH.store.getSettings().theme || 'modern') === 'classic';
    document.body.classList.toggle('theme-classic', classic);
  }

  /** Curved horizon: dark "planet" body, atmospheric glow, gold rim, travelling light and 6 emblem-colour glints. */
  function horizonSvg() {
    const W = 3840, H = 330, apex = 92;
    const rim = `M-200 ${H + 40} Q${W / 2} ${apex * 2 - (H + 40) + 0} ${W + 200} ${H + 40}`;
    // point on the quadratic rim for the glints
    const P0 = { x: -200, y: H + 40 }, C = { x: W / 2, y: apex * 2 - (H + 40) }, P1 = { x: W + 200, y: H + 40 };
    const at = (t) => ({ x: (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * C.x + t * t * P1.x, y: (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * C.y + t * t * P1.y });
    const COLORS = ['#e63a35', '#3db54a', '#ec4f9c', '#17b8c4', '#f7941d', '#2a6fd6'];
    const gems = [0.3, 0.37, 0.44, 0.56, 0.63, 0.7].map((t, i) => {
      const p = at(t);
      return `<g class="hz-gem" style="animation-delay:${(i * 0.8).toFixed(1)}s"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="46" fill="url(#hzDot${i})"/><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.2" fill="#fff"/></g>`;
    }).join('');
    const dots = COLORS.map((c, i) => `<radialGradient id="hzDot${i}"><stop offset="0" stop-color="${c}" stop-opacity=".95"/><stop offset=".35" stop-color="${c}" stop-opacity=".35"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="hzBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2a70"/><stop offset=".35" stop-color="#061a4c"/><stop offset="1" stop-color="#020820"/></linearGradient>
        <radialGradient id="hzAtmo" cx="50%" cy="100%" r="60%" fx="50%" fy="100%"><stop offset="0" stop-color="#9fe0ff" stop-opacity=".55"/><stop offset=".45" stop-color="#3fb0f0" stop-opacity=".18"/><stop offset="1" stop-color="#3fb0f0" stop-opacity="0"/></radialGradient>
        <linearGradient id="hzRim" x1="0" x2="1"><stop offset="0" stop-color="#e7b448" stop-opacity="0"/><stop offset=".25" stop-color="#e7b448" stop-opacity=".7"/><stop offset=".5" stop-color="#fff3c8"/><stop offset=".75" stop-color="#e7b448" stop-opacity=".7"/><stop offset="1" stop-color="#e7b448" stop-opacity="0"/></linearGradient>
        <linearGradient id="hzSky" x1="0" x2="1"><stop offset="0" stop-color="#7fd3ff" stop-opacity="0"/><stop offset=".5" stop-color="#bfeaff" stop-opacity=".9"/><stop offset="1" stop-color="#7fd3ff" stop-opacity="0"/></linearGradient>
        <filter id="hzBlur" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>
        <filter id="hzBlurS" x="-10%" y="-200%" width="120%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>
        ${dots}
      </defs>
      <ellipse cx="${W / 2}" cy="${H + 120}" rx="${W * 0.62}" ry="${H * 0.95}" fill="url(#hzAtmo)"/>
      <path d="${rim} L${W + 200} ${H + 400} L-200 ${H + 400} Z" fill="url(#hzBody)"/>
      <path d="${rim}" fill="none" stroke="url(#hzSky)" stroke-width="26" filter="url(#hzBlur)" opacity=".75"/>
      <path d="${rim}" fill="none" stroke="url(#hzRim)" stroke-width="7" filter="url(#hzBlurS)" opacity=".9"/>
      <path d="${rim}" fill="none" stroke="url(#hzRim)" stroke-width="2.4"/>
      <path class="hz-run" d="${rim}" fill="none" stroke="#fff6dc" stroke-width="4" stroke-linecap="round" stroke-dasharray="260 4340" filter="url(#hzBlurS)"/>
      <path class="hz-run b" d="${rim}" fill="none" stroke="#bfeaff" stroke-width="3" stroke-linecap="round" stroke-dasharray="160 4440" opacity=".8"/>
      ${gems}
    </svg>`;
  }

  CH.bg = { init, KOHELET, applyTheme };
})(window.CH = window.CH || {});
