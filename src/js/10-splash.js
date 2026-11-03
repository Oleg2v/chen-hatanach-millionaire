/* 10-splash.js — the living title screen. */
(function (CH) {
  'use strict';
  const { h, $, animate, sleep, bus } = CH.u;
  const el = document.getElementById('scr-splash');

  // Fallback emblem if the brand-art module is missing (keeps the screen whole).
  function emblemSvg(opts) {
    if (CH.art && CH.art.emblem) return CH.art.emblem(opts);
    const C = ['#e63a35', '#3db54a', '#ec4f9c', '#17b8c4', '#f7941d', '#2a6fd6'];
    const rh = C.map((c, i) => `<path transform="rotate(${i * 60} 50 50)" d="M50 50 L41.3 30 L50 10 L58.7 30 Z" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>`).join('');
    return `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#fff"/>${rh}</svg>`;
  }
  CH.emblemSvg = emblemSvg;

  /** A fine gold ring of ticks around the emblem. */
  function ringSvg(r, n, len, w, op) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x1 = 50 + Math.cos(a) * r, y1 = 50 + Math.sin(a) * r, x2 = 50 + Math.cos(a) * (r - len), y2 = 50 + Math.sin(a) * (r - len);
      s += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" />`;
    }
    return `<svg viewBox="0 0 100 100" style="width:100%;height:100%;overflow:visible"><defs><linearGradient id="rg${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#e7b448"/><stop offset="1" stop-color="#fff3c4"/></linearGradient></defs><g stroke="url(#rg${n})" stroke-width="${w}" stroke-linecap="round" opacity="${op}">${s}</g><circle cx="50" cy="50" r="${r + 1.2}" fill="none" stroke="url(#rg${n})" stroke-width="0.25" opacity="${op}"/></svg>`;
  }

  function render() {
    const s = CH.store.getSettings();
    const title = CH.u.typo(String(s.title || '').trim() || 'כוכב התנ"ך');
    const level = CH.u.typo(String(s.level || '').trim());
    el.innerHTML = '';
    const wordmark = h('div.sp-wordmark', { html: CH.art && CH.art.wordmark ? CH.art.wordmark() : '' });
    const emb = h('div.sp-emblem', h('div.glow'), h('div.ring', { html: ringSvg(49, 72, 1.6, 0.45, 0.85) }), h('div.ring.r2', { html: ringSvg(49, 36, 3.5, 0.3, 0.6) }), h('div.emb', { html: emblemSvg({ shaded: true }) }));
    const titleEl = h('h1.sp-title', h('span.t', ...title.split(' ').flatMap((w, i) => [i ? ' ' : '', h('span.w', w)])));
    const startBtn = h('button.btn.btn-gold', { type: 'button', onclick: start }, 'התחל', h('span.sep'), h('span.en', 'START'));
    const kids = [
      wordmark,
      h('div.sp-center', emb, titleEl, level ? h('div.sp-level', level) : null,
        h('div.sp-start', h('span.halo'), h('span.halo.h2'), startBtn),
        h('div.sp-hint.kbd-hint', 'לחצו ', h('kbd', 'רווח'), ' או ', h('kbd', 'Enter'), ' כדי להתחיל')),
      h('div.sp-footer', 'חן התנ״ך', h('span.dot'), 'למעלה מ־40 שנה של חידוני תנ״ך'),
    ];
    el.append(...kids);
    return { wordmark, emb, titleEl, startBtn };
  }

  let parts = null, starting = false;
  async function intro() {
    if (!parts) return;
    const { wordmark, emb, titleEl } = parts;
    const lvl = el.querySelector('.sp-level'), st = el.querySelector('.sp-start'), hint = el.querySelector('.sp-hint'), foot = el.querySelector('.sp-footer');
    [wordmark, emb, lvl, st, hint, foot].forEach((x) => x && (x.style.opacity = 0));
    titleEl.querySelectorAll('.w').forEach((w) => (w.style.opacity = 0));
    animate(emb, [{ opacity: 0, transform: 'scale(.4) rotate(-40deg)', filter: 'blur(12px)' }, { opacity: 1, transform: 'scale(1) rotate(0)', filter: 'blur(0)' }], { duration: 1100, easing: 'cubic-bezier(.34,1.4,.64,1)' });
    animate(wordmark, [{ opacity: 0, transform: 'translateY(-20px)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: 300, easing: 'cubic-bezier(.16,1,.3,1)' });
    titleEl.querySelectorAll('.w').forEach((w, i) =>
      animate(w, [{ opacity: 0, transform: 'translateY(50px) scale(.9)', filter: 'blur(14px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 1000, delay: 380 + i * 150, easing: 'cubic-bezier(.16,1,.3,1)' }));
    lvl && animate(lvl, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 820, easing: 'cubic-bezier(.16,1,.3,1)' });
    animate(st, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900, delay: 1000, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    animate(hint, [{ opacity: 0 }, { opacity: 1 }], { duration: 800, delay: 1400 });
    animate(foot, [{ opacity: 0 }, { opacity: 1 }], { duration: 1200, delay: 1500 });
  }

  async function start() {
    if (starting) return; starting = true;
    CH.sound && (CH.sound.unlock(), CH.sound.play('start'));
    const r = CH.stage.rectOf(parts.startBtn);
    CH.fx && CH.fx.burst && CH.fx.burst(r.cx, r.cy, { kind: 'stars', count: 48 });
    await animate(parts.startBtn, [{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1.06)' }], { duration: 260, easing: 'ease-out' });
    await CH.ui.go('board');
    starting = false;
  }

  CH.ui.register('splash', {
    enter() { parts = render(); intro(); CH.fx && CH.fx.setBackgroundIntensity && CH.fx.setBackgroundIntensity(1.35); },
    leave() {},
    onKey(e) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); start(); }
    },
  });
  bus.on('admin:closed', () => { if (CH.ui.current === 'splash') { parts = render(); } });
  bus.on('brand:change', () => { if (CH.ui.current === 'splash') { parts = render(); } });
})(window.CH = window.CH || {});
