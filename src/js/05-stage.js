/* 05-stage.js — fit the 1920×1080 stage into any window (16:9 letterbox), fullscreen, idle cursor. */
(function (CH) {
  'use strict';
  const W = 1920, H = 1080;
  const stageEl = document.getElementById('stage');
  const root = document.documentElement;
  let scale = 1, offX = 0, offY = 0;
  const subs = new Set();

  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    offX = (vw - W * scale) / 2; offY = (vh - H * scale) / 2;
    root.style.setProperty('--s', scale.toFixed(5));
    root.style.setProperty('--vw', vw + 'px');
    root.style.setProperty('--vh', vh + 'px');
    subs.forEach((fn) => { try { fn({ scale, vw, vh, offX, offY }); } catch (e) { console.error(e); } });
  }
  window.addEventListener('resize', fit);
  fit();

  /** Stage coords -> viewport (CSS px) */
  const toViewport = (x, y) => ({ x: offX + x * scale, y: offY + y * scale });
  /** Viewport -> stage coords */
  const fromViewport = (x, y) => ({ x: (x - offX) / scale, y: (y - offY) / scale });
  /** Element bounding rect in stage coordinates */
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    const a = fromViewport(r.left, r.top);
    return { x: a.x, y: a.y, w: r.width / scale, h: r.height / scale, cx: a.x + r.width / scale / 2, cy: a.y + r.height / scale / 2 };
  }

  // ---- fullscreen ----
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  async function toggleFullscreen() {
    try {
      if (isFullscreen()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else await (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
    } catch (e) { /* not allowed (e.g. iframe) — ignore */ }
  }

  // ---- hide cursor after inactivity in fullscreen ----
  let idleTimer = 0;
  function poke() {
    document.body.classList.remove('hide-cursor');
    clearTimeout(idleTimer);
    if (isFullscreen()) idleTimer = setTimeout(() => document.body.classList.add('hide-cursor'), 2500);
  }
  ['mousemove', 'mousedown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, poke, { passive: true }));
  document.addEventListener('fullscreenchange', () => { poke(); CH.u.bus.emit('fullscreen', isFullscreen()); });

  CH.stage = {
    W, H, el: stageEl,
    get scale() { return scale; },
    fit, toViewport, fromViewport, rectOf,
    onResize(fn) { subs.add(fn); fn({ scale, vw: innerWidth, vh: innerHeight, offX, offY }); return () => subs.delete(fn); },
    isFullscreen, toggleFullscreen,
  };
})(window.CH = window.CH || {});
