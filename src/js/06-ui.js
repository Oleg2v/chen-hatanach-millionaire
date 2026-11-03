/* 06-ui.js — icons, screen manager (zoom+blur transitions), modals, toasts, keyboard routing, dock. */
(function (CH) {
  'use strict';
  const { h, $, animate, sleep, bus } = CH.u;

  // ---------------- Icons (24×24, stroke = currentColor) ----------------
  const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;
  const svg = (inner, opts = {}) =>
    `<svg viewBox="0 0 24 24" fill="${opts.fill || 'none'}" stroke="currentColor" stroke-width="${opts.sw || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  function gearPath() {
    const teeth = 8, ro = 10.2, ri = 7.6, pts = [];
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2, w = Math.PI / teeth * 0.55;
      [[a - w * 1.25, ri], [a - w * 0.7, ro], [a + w * 0.7, ro], [a + w * 1.25, ri]].forEach(([t, r]) => pts.push([12 + r * Math.cos(t), 12 + r * Math.sin(t)]));
    }
    return 'M' + pts.map((p) => p.map((v) => v.toFixed(2)).join(' ')).join('L') + 'Z';
  }
  const icons = {
    gear: svg(P(gearPath()) + '<circle cx="12" cy="12" r="3.2"/>'),
    soundOn: svg(P('M4 9.5h3.5L12.5 5v14l-5-4.5H4z') + P('M16 9a4.2 4.2 0 0 1 0 6') + P('M18.6 6.4a8 8 0 0 1 0 11.2')),
    soundOff: svg(P('M4 9.5h3.5L12.5 5v14l-5-4.5H4z') + P('M16.5 9.5l5 5M21.5 9.5l-5 5')),
    fullscreen: svg(P('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')),
    exitFullscreen: svg(P('M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5')),
    help: svg('<circle cx="12" cy="12" r="9.5"/>' + P('M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.35-1.2 1-1.2 1.8v.6') + '<circle cx="12" cy="17.3" r=".6" fill="currentColor"/>'),
    grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
    back: svg(P('M5 12h14M13 6l6 6-6 6')),      // RTL "back" points right
    next: svg(P('M19 12H5M11 6l-6 6 6 6')),     // RTL "next" points left
    check: svg(P('M4.5 12.5l5 5L19.5 7'), { sw: 3 }),
    x: svg(P('M6 6l12 12M18 6L6 18'), { sw: 3 }),
    lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.2"/>' + P('M8 10.5V8a4 4 0 0 1 8 0v2.5')),
    unlock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.2"/>' + P('M8 10.5V8a4 4 0 0 1 7.6-1.7')),
    crown: svg(P('M3.5 8.5l4.3 3.8L12 5.5l4.2 6.8 4.3-3.8-1.8 10H5.3z') + P('M5.5 21h13'), { fill: 'currentColor', sw: 1.4 }),
    book: svg(P('M12 6.5C10 5 7 4.4 3.5 5v13.5c3.5-.6 6.5 0 8.5 1.5 2-1.5 5-2.1 8.5-1.5V5c-3.5-.6-6.5 0-8.5 1.5z') + P('M12 6.5V20')),
    play: svg(P('M8 5.5v13l11-6.5z'), { fill: 'currentColor', sw: 1.5 }),
    upload: svg(P('M12 15V4M7.5 8.5L12 4l4.5 4.5') + P('M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15')),
    download: svg(P('M12 4v11M7.5 10.5L12 15l4.5-4.5') + P('M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15')),
    trash: svg(P('M4.5 7h15M10 11v6M14 11v6') + P('M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12') + P('M9.5 7V4.8h5V7')),
    plus: svg(P('M12 5v14M5 12h14')),
    edit: svg(P('M15.5 4.5l4 4L9 19H5v-4z') + P('M13 7l4 4')),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/>' + P('M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8')),
    refresh: svg(P('M4.5 12a7.5 7.5 0 0 1 13-5.1L20 9.5') + P('M20 4.5v5h-5') + P('M19.5 12a7.5 7.5 0 0 1-13 5.1L4 14.5') + P('M4 19.5v-5h5')),
    file: svg(P('M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z') + P('M14 3.5V8h4.5')),
    table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/>' + P('M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10')),
    star: svg(P('M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z'), { fill: 'currentColor', sw: 1.2 }),
    users: svg('<circle cx="9" cy="8.5" r="3.5"/>' + P('M2.8 19.5a6.3 6.3 0 0 1 12.4 0') + P('M15.5 5.3a3.5 3.5 0 0 1 0 6.4M17.8 14.2a6.3 6.3 0 0 1 3.4 5.3')),
    search: svg('<circle cx="10.5" cy="10.5" r="6.5"/>' + P('M15.5 15.5L20 20')),
    sliders: svg(P('M4 7h9M17 7h3M4 17h3M11 17h9') + '<circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    sparkle: svg(P('M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z'), { fill: 'currentColor', sw: 1 }),
    db: svg('<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/>' + P('M4.5 6v12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8V6M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8')),
    info: svg('<circle cx="12" cy="12" r="9.5"/>' + P('M12 11v6') + '<circle cx="12" cy="7.6" r=".6" fill="currentColor"/>'),
    warn: svg(P('M12 4l9 16H3z') + P('M12 10v4.5') + '<circle cx="12" cy="17.2" r=".6" fill="currentColor"/>'),
    flag: svg(P('M5 21V4.5M5 4.5h11l-2 4 2 4H5')),
    close: svg(P('M6 6l12 12M18 6L6 18')),
  };

  // ---------------- Screen manager ----------------
  const screens = {};
  let current = null, busy = Promise.resolve();
  const screenEl = (name) => document.querySelector(`.screen[data-screen="${name}"]`);

  function register(name, impl) { screens[name] = { name, el: screenEl(name), ...impl }; }

  /** Navigate with a zoom + blur cross-transition. */
  let heading = null;
  function go(name, params = {}) {
    if (heading === name) return busy;           // e.g. BACK clicked three times
    heading = name;
    busy = busy.then(async () => {
      const from = current ? screens[current] : null, to = screens[name];
      if (!to) return;
      const low = document.body.classList.contains('lowfx');
      const blur = (px) => (low ? {} : { filter: `blur(${px}px)` });   // full-screen blur is skipped on slow machines
      let outDone = Promise.resolve();
      if (from && from !== to) {
        CH.sound && CH.sound.play('whoosh');
        const out = from.el.animate([
          { opacity: 1, transform: 'scale(1)', ...blur(0) },
          { opacity: 0, transform: 'scale(1.06)', ...blur(14) },
        ], { duration: params.fast ? 240 : 360, easing: 'cubic-bezier(.55,0,.75,.3)', fill: 'forwards' });
        outDone = out.finished.catch(() => {}).then(() => {
          from.el.classList.remove('is-active'); out.cancel();
          try { from.leave && from.leave(); } catch (e) { console.error(e); }
        });
        await sleep(params.fast ? 120 : 180);       // the two halves overlap: no dead air for the host
        from.el.style.pointerEvents = 'none';
      }
      current = name;
      document.body.dataset.screen = name;
      try { to.enter && (await to.enter(params)); } catch (e) { console.error(e); }
      to.el.style.pointerEvents = '';
      to.el.classList.add('is-active');
      const inn = to.el.animate([
        { opacity: 0, transform: 'scale(0.95)', ...blur(14) },
        { opacity: 1, transform: 'scale(1)', ...blur(0) },
      ], { duration: from ? 520 : 900, easing: 'cubic-bezier(.16,1,.3,1)' });
      await Promise.all([inn.finished.catch(() => {}), outDone]);
      if (from) from.el.style.pointerEvents = '';
      try { to.afterEnter && to.afterEnter(params); } catch (e) { console.error(e); }
      bus.emit('screen', name);
    }).catch((e) => console.error(e)).then(() => { if (heading === name) heading = null; });
    return busy;
  }

  // ---------------- Modals ----------------
  let openModals = 0;
  /**
   * modal({title, body, actions:[{key,label,en,kind:'gold'|'glass'|'danger'}], theme:'dark'|'light', input:{value,placeholder}})
   * → Promise<{action, value} | null>
   */
  function modal(opts) {
    const theme = opts.theme || (document.body.classList.contains('in-admin') ? 'light' : 'dark');
    return new Promise((resolve) => {
      const actions = opts.actions || [{ key: 'ok', label: 'אישור', kind: 'gold' }];
      // Default action (Enter / initial focus): explicit, else the gold one — but never a destructive action.
      const defKey = opts.defaultKey || (actions.find((a) => a.kind === 'gold') || actions.find((a) => a.kind !== 'danger') || actions[0]).key;
      let input = null;
      if (opts.input) input = h('input.modal-input', { type: 'text', value: opts.input.value || '', placeholder: opts.input.placeholder || '', dir: 'rtl' });
      const body = typeof opts.body === 'string' ? h('div.modal-body', { html: opts.body }) : h('div.modal-body', opts.body || '');
      const box = h('div.modal' + (theme === 'dark' ? '.glass' : ''), { role: 'dialog', 'aria-modal': 'true' },
        opts.title ? h('h2', opts.title) : null, body, input,
        h('div.modal-actions', actions.map((a) =>
          h('button.btn.btn-' + (a.kind || 'glass'), { type: 'button', 'data-key': a.key, onclick: () => close(a.key) },
            a.label, a.en ? h('span.sep') : null, a.en ? h('span.en', a.en) : null))));
      const t0 = performance.now();
      const fresh = () => performance.now() - t0 < 320;          // absorb double clicks / double Enter
      const wrap = h('div.modal-wrap.' + theme, { onmousedown: (e) => { if (e.target === wrap && opts.dismissible !== false && !fresh()) close(null); } }, box);
      const host = theme === 'dark' ? $('#layer-modal') : document.body;
      host.append(wrap); openModals++;
      CH.sound && CH.sound.play('modal');
      const onKey = (e) => {
        if (e.key === 'Escape' && opts.dismissible !== false) { e.preventDefault(); e.stopPropagation(); close(null); }
        else if ((e.key === 'Enter' || e.key === ' ') && fresh()) { e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) {
          e.preventDefault(); e.stopPropagation();
          close(defKey);
        }
      };
      window.addEventListener('keydown', onKey, true);
      setTimeout(() => { (input || box.querySelector(`[data-key="${defKey}"]`) || box.querySelector('button')).focus({ preventScroll: true }); if (input) input.select(); }, 60);
      let done = false;
      function close(key) {
        if (done) return; done = true;
        window.removeEventListener('keydown', onKey, true);
        const value = input ? input.value : undefined;
        wrap.classList.add('is-leaving');
        setTimeout(() => { wrap.remove(); openModals--; }, 210);
        resolve(key == null ? null : { action: key, value });
      }
    });
  }
  const confirm = (title, body, { ok = 'אישור', cancel = 'ביטול', danger = false, theme } = {}) =>
    modal({ title, body, theme, defaultKey: danger ? 'cancel' : 'ok', actions: [{ key: 'ok', label: ok, kind: danger ? 'danger' : 'gold' }, { key: 'cancel', label: cancel, kind: 'glass' }] })
      .then((r) => !!r && r.action === 'ok');
  const prompt = (title, value = '', { ok = 'שמירה', placeholder = '', theme } = {}) =>
    modal({ title, theme, input: { value, placeholder }, actions: [{ key: 'ok', label: ok, kind: 'gold' }, { key: 'cancel', label: 'ביטול', kind: 'glass' }] })
      .then((r) => (r && r.action === 'ok' ? String(r.value || '').trim() : null));

  // ---------------- Toasts ----------------
  let lightHost = null;
  function toast(text, { kind = 'info', theme, ms = 2600 } = {}) {
    const th = theme || (document.body.classList.contains('in-admin') ? 'light' : 'dark');
    let host = $('#layer-toast');
    if (th === 'light') { if (!lightHost) { lightHost = h('div.toast-host-light'); document.body.append(lightHost); } host = lightHost; }
    const t = h('div.toast.' + kind, { role: 'status' }, text);
    host.append(t);
    setTimeout(() => { t.classList.add('is-leaving'); setTimeout(() => t.remove(), 320); }, ms);
    return t;
  }

  // ---------------- Help ----------------
  function showHelp() {
    const rows = [
      ['רווח / Enter', 'התחל · שחק · המשך'], ['1 – 4', 'בחירת תשובה א׳–ד׳'], ['H', 'גלגל הצלה 50:50'],
      ['Esc', 'חזרה'], ['F', 'מסך מלא (יציאה: Esc ארוך)'], ['M', 'השתקה / הפעלת צליל'], ['?', 'עזרה זו'],
    ];
    const grid = h('div.keys-grid', rows.flatMap(([k, v]) => [h('div', h('kbd', k)), h('div', v)]));
    return modal({ title: 'קיצורי מקלדת למנחה', body: grid, theme: 'dark', actions: [{ key: 'ok', label: 'הבנתי', kind: 'gold' }] });
  }

  // ---------------- Keyboard routing ----------------
  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (CH.admin && CH.admin.isOpen && CH.admin.isOpen()) return;   // admin handles its own keys
    if (openModals > 0) return;
    const code = e.code;
    if (code === 'KeyF') { e.preventDefault(); CH.stage.toggleFullscreen(); return; }
    if (code === 'KeyM') { e.preventDefault(); toggleSound(); return; }
    if (e.key === '?' || (code === 'Slash' && e.shiftKey) || code === 'F1') { e.preventDefault(); showHelp(); return; }
    const scr = current && screens[current];
    if (scr && scr.onKey) scr.onKey(e);
  });

  // ---------------- Dock ----------------
  const dockBtns = {};
  function toggleSound() {
    const on = !(CH.store.getSettings().sound);
    CH.store.updateSettings({ sound: on });
    CH.sound && CH.sound.setMuted(!on);
    if (on && CH.sound) CH.sound.play('click');
    refreshDock();
    toast(on ? 'הצליל פועל' : 'הצליל מושתק', { ms: 1400 });
  }
  function refreshDock() {
    const on = CH.store.getSettings().sound;
    if (dockBtns.sound) { dockBtns.sound.innerHTML = on ? icons.soundOn : icons.soundOff; dockBtns.sound.classList.toggle('is-off', !on); dockBtns.sound.title = on ? 'השתקה (M)' : 'הפעלת צליל (M)'; }
    if (dockBtns.fs) dockBtns.fs.innerHTML = CH.stage.isFullscreen() ? icons.exitFullscreen : icons.fullscreen;
  }
  function buildDock() {
    const dock = $('#dock'); dock.innerHTML = '';
    const mk = (key, icon, title, fn) => (dockBtns[key] = h('button.icon-btn', { type: 'button', title, 'aria-label': title, html: icon, onclick: () => { CH.sound && CH.sound.play('click'); fn(); } }));
    dock.append(
      mk('admin', icons.gear, 'ניהול ושאלות', () => CH.admin && CH.admin.open()),
      mk('sound', icons.soundOn, 'צליל (M)', toggleSound),
      mk('fs', icons.fullscreen, 'מסך מלא (F)', () => CH.stage.toggleFullscreen()),
      mk('help', icons.help, 'קיצורי מקלדת (?)', showHelp),
    );
    refreshDock();
    bus.on('fullscreen', refreshDock);
    bus.on('store:change', ({ what }) => what === 'settings' && refreshDock());
  }

  CH.ui = {
    icons, register, go, get current() { return current; }, screens,
    modal, confirm, prompt, toast, showHelp, buildDock, refreshDock, toggleSound,
    get modalOpen() { return openModals > 0; },
  };
})(window.CH = window.CH || {});
