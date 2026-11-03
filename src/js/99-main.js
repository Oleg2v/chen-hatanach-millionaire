/* 99-main.js — boot sequence. */
(function (CH) {
  'use strict';
  async function boot() {
    CH.stage.fit();
    try { CH.bg.init(); } catch (e) { console.error(e); }
    CH.ui.buildDock();
    if (CH.sound) CH.sound.setMuted(!CH.store.getSettings().sound);

    // Wait for embedded fonts so nothing re-flows (with a safety timeout).
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }
    document.body.classList.remove('booting');

    probePerformance();
    const hash = (location.hash || '').replace('#', '');
    if (hash === 'admin' && CH.admin) { CH.ui.go('splash'); CH.admin.open(); }
    else CH.ui.go(CH.ui.screens[hash] ? hash : 'splash');
  }
  /** Measure ~1.5 s of frames; on a slow machine switch to low-effects mode (?fx=full / ?fx=low force it). */
  function probePerformance() {
    const q = /[?&]fx=(full|low)/.exec(location.search);
    if (q) { document.body.classList.toggle('lowfx', q[1] === 'low'); return; }
    const times = []; let last = 0, n = 0;
    const step = (t) => {
      if (last) times.push(t - last); last = t;
      if (++n < 90 && !document.hidden) requestAnimationFrame(step);
      else if (times.length > 30) {
        times.sort((a, b) => a - b);
        const med = times[Math.floor(times.length / 2)];
        if (med > 30) {
          document.body.classList.add('lowfx');
          if (CH.fx && CH.fx.setBackgroundIntensity) {        // cap the ambience from now on
            const orig = CH.fx.setBackgroundIntensity.bind(CH.fx);
            CH.fx.setBackgroundIntensity = (x) => orig(Math.min(x, 0.45));
            orig(0.4);
          }
          console.info('[chen] low-effects mode: median frame ' + med.toFixed(1) + 'ms');
        }
      }
    };
    setTimeout(() => requestAnimationFrame(step), 2500);   // after the intro settles
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.CH = window.CH || {});
