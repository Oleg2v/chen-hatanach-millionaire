/* 99-main.js — boot sequence. */
(function (CH) {
  'use strict';
  async function boot() {
    CH.stage.fit();
    wrapFx();
    try { CH.bg.init(); } catch (e) { console.error(e); }
    CH.ui.buildDock();
    if (CH.sound) CH.sound.setMuted(!CH.store.getSettings().sound);

    // Wait for embedded fonts so nothing re-flows (with a safety timeout).
    try {
      await Promise.race([
        Promise.all(['700 40px Rubik', '900 60px FrankRuhl', '600 40px NotoSerifHeb'].map((f) => document.fonts.load(f, 'אבג ABC 123'))).then(() => document.fonts.ready),
        new Promise((r) => setTimeout(r, 1500)),
      ]);
    } catch (e) { /* ignore */ }
    document.body.classList.remove('booting');

    probePerformance();
    const hash = (location.hash || '').replace('#', '');
    if (hash === 'admin' && CH.admin) { CH.ui.go('splash'); CH.admin.open(); }
    else CH.ui.go(CH.ui.screens[hash] ? hash : 'splash');
  }
  // ---- background ambience controller: remembers the screen's wish, caps it in low-effects mode, sleeps under the admin ----
  let fxWish = 1, fxLow = false;
  function wrapFx() {
    if (!CH.fx || !CH.fx.setBackgroundIntensity || CH.fx.__wrapped) return;
    const orig = CH.fx.setBackgroundIntensity.bind(CH.fx);
    const apply = () => orig(CH.admin && CH.admin.isOpen && CH.admin.isOpen() ? 0 : fxLow ? Math.min(fxWish, 0.45) : fxWish);
    CH.fx.setBackgroundIntensity = (x) => { fxWish = Number.isFinite(+x) ? +x : 1; apply(); };
    CH.fx.__wrapped = true; CH.fx.__apply = apply;
    CH.u.bus.on('admin:opened', () => setTimeout(apply, 450));
    CH.u.bus.on('admin:closed', apply);
  }
  function applyLowFx(on) {
    fxLow = !!on;
    document.body.classList.toggle('lowfx', fxLow);
    CH.fx && CH.fx.__apply && CH.fx.__apply();
  }

  /** ~1.5 s frame probe; a slow machine switches to low-effects mode. The decision is remembered for next time.
   *  ?fx=full / ?fx=low force a mode. */
  function probePerformance() {
    const q = /[?&]fx=(full|low)/.exec(location.search);
    if (q) { applyLowFx(q[1] === 'low'); return; }
    const remembered = CH.u.LS.get('chm.v1.fx', null);
    if (remembered === 'low') applyLowFx(true);
    const run = () => {
      const times = []; let last = 0, t0 = 0, n = 0;
      const step = (t) => {
        if (document.hidden) { document.addEventListener('visibilitychange', () => setTimeout(run, 800), { once: true }); return; }
        if (!t0) t0 = t; if (last) times.push(t - last); last = t;
        if (t - t0 < 1500 && ++n < 120) { requestAnimationFrame(step); return; }
        if (times.length < 6) return;
        times.sort((a, b) => a - b);
        const med = times[Math.floor(times.length / 2)];
        const slow = med > 30;
        if (slow !== fxLow) applyLowFx(slow);
        CH.u.LS.set('chm.v1.fx', slow ? 'low' : 'full');
        if (slow) console.info('[chen] low-effects mode: median frame ' + med.toFixed(1) + 'ms');
      };
      requestAnimationFrame(step);
    };
    setTimeout(run, remembered ? 4000 : 1200);   // remembered → re-check quietly later; first run → decide early
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.CH = window.CH || {});
