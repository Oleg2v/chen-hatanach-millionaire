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

  CH.bg = { init, KOHELET };
})(window.CH = window.CH || {});
