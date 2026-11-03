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

    const hash = (location.hash || '').replace('#', '');
    if (hash === 'admin' && CH.admin) { CH.ui.go('splash'); CH.admin.open(); }
    else CH.ui.go(CH.ui.screens[hash] ? hash : 'splash');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window.CH = window.CH || {});
