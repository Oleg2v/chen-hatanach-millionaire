/* 20-admin.js — Admin / CMS ("ניהול"): settings & branding, question sets with an inline table editor,
   bulk import (xlsx / csv / json) with preview, templates. Light SaaS look, RTL, full-window #admin (not scaled). */
(function (CH) {
  'use strict';
  const U = CH.u;
  const { h, $, bus, LS } = U;
  const S = () => CH.store;

  const BRAND_KEY = 'chm.v1.brand';
  const EMBLEM = ['#2a6fd6', '#3db54a', '#f7941d', '#ec4f9c', '#17b8c4', '#e63a35'];
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const HEAD = ['שאלה', 'תשובה נכונה', 'תשובה שגויה 1', 'תשובה שגויה 2', 'תשובה שגויה 3', 'מקור'];
  const EASE = 'cubic-bezier(.16,1,.3,1)';
  const TABS = [
    { key: 'settings', label: 'הגדרות', icon: 'sliders' },
    { key: 'questions', label: 'אוספי שאלות', icon: 'layers' },
    { key: 'import', label: 'ייבוא', icon: 'upload' },
  ];
  const IMPORTABLE = /\.(xlsx|xlsm|xls|ods|csv|tsv|txt|json)$/i;
  const TITLE_MAX = 40, TITLE_WARN = 30;      // the game fits long titles to width; past ~30 characters they get visibly smaller
  const LONG_Q = 110, LONG_A = 30;            // past these (letters, without nikud) the game drops to a smaller font

  // ---------------- icons: shared set + a few local ones in the same 24×24 stroke style ----------------
  const sv = (inner, sw = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const I = Object.assign({
    layers: sv('<path d="M12 3.8l8.5 4.4L12 12.6 3.5 8.2z"/><path d="M3.5 12.2l8.5 4.4 8.5-4.4"/><path d="M3.5 16.2l8.5 4.4 8.5-4.4"/>'),
    image: sv('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.8" r="1.7"/><path d="M20.5 15.2l-4.6-4.6-9.4 8.9"/>'),
    sheet: sv('<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/><path d="M8.5 12.5h7M8.5 16h7M12 12.5V19"/>'),
    braces: sv('<path d="M9 4.5H8a2 2 0 0 0-2 2v3c0 1.2-.8 2.5-2 2.5 1.2 0 2 1.3 2 2.5v3a2 2 0 0 0 2 2h1M15 4.5h1a2 2 0 0 1 2 2v3c0 1.2.8 2.5 2 2.5-1.2 0-2 1.3-2 2.5v3a2 2 0 0 1-2 2h-1"/>'),
    undo: sv('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    minus: sv('<path d="M5.5 12h13"/>', 2.2),
    plus2: sv('<path d="M12 5.5v13M5.5 12h13"/>', 2.2),
    title: sv('<path d="M5 7V5h14v2M12 5v14M9 19h6"/>'),
    trophy: sv('<path d="M8 4.5h8v5a4 4 0 0 1-8 0z"/><path d="M8 6.5H5a3 3 0 0 0 3 4M16 6.5h3a3 3 0 0 1-3 4M12 13.5v3.5M8.5 20h7l-.8-3h-5.4z"/>'),
    shield: sv('<path d="M12 3.5l7 2.8v5.2c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6.3z"/><path d="M9 12l2.2 2.2L15.5 10"/>'),
    palette: sv('<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.6 1.7-1.6h2a4 4 0 0 0 4-4c0-4-3.8-7.1-8.5-7.1z"/><circle cx="7.8" cy="11.5" r="1" fill="currentColor"/><circle cx="10.5" cy="7.6" r="1" fill="currentColor"/><circle cx="15" cy="8" r="1" fill="currentColor"/>'),
  }, (CH.ui && CH.ui.icons) || {});

  // ---------------- small helpers ----------------
  const motion = (el, kf, o = {}) => {
    if (!el || !el.animate) return null;
    const opts = { duration: 260, easing: EASE, ...o };
    if (U.reduced) opts.duration = Math.min(opts.duration, 100);
    return el.animate(kf, opts);
  };
  const ic = (name, extra = '') => h('span.ic' + extra, { html: I[name] || '', 'aria-hidden': 'true' });
  function btn(label, o = {}) {
    return h('button.a-btn.a-btn-' + (o.kind || 'secondary') + (o.size ? '.a-btn-' + o.size : '') + (label ? '' : '.a-btn-icon'),
      { type: 'button', title: o.title || null, 'aria-label': label ? null : o.title, disabled: !!o.disabled, onclick: o.onclick },
      o.icon ? ic(o.icon) : null, label ? h('span', label) : null);
  }
  const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const nf = (n) => Number(n || 0).toLocaleString('he-IL');
  // Counts with Hebrew number agreement ("שאלה אחת תימחק" / "4 שאלות יימחקו").
  const qCount = (n) => (n === 1 ? 'שאלה אחת' : `${nf(n)} שאלות`);
  const rowsTxt = (n) => (n === 1 ? 'שורה אחת' : `${nf(n)} שורות`);
  const okShort = (n) => (n === 1 ? 'תקינה אחת' : `${nf(n)} תקינות`);
  const loadedTxt = (n) => (n === 1 ? 'נטענה שאלה אחת' : `נטענו ${nf(n)} שאלות`);
  /** "בדיקה-20.xlsx" stays readable in RTL: the Latin extension is isolated at the end. */
  const fileLabel = (name) => {
    const m = String(name || '').match(/^(.*?)(\.[a-z0-9]{1,5})$/i);
    return h('span.fname', h('bdi', { dir: 'rtl' }, m ? m[1] : String(name || '')), m ? h('bdi.fext', { dir: 'ltr' }, m[2].toLowerCase()) : null);
  };
  const sizeTxt = (b) => (b < 1024 * 1024 ? `${nf(Math.max(0.1, b / 1024).toFixed(b < 10240 ? 1 : 0))} ק״ב` : `${(b / 1048576).toFixed(1)} מ״ב`);
  const okCount = (n) => (n === 1 ? 'שאלה אחת תקינה' : `${nf(n)} שאלות תקינות`);
  const valid = (q) => !S().validateQuestion(q).length;
  /** Store validation strings, with the singular case worded naturally. */
  const errTxt = (errs) => errs.map((e) => (/^חסרות 1 /.test(e) ? 'חסרה תשובה שגויה אחת' : e)).join(' · ');
  /** Shorten at a word boundary, never between a letter and its nikud. */
  function clip(s, n) {
    s = String(s || '');
    if (s.length <= n) return s;
    let end = n;
    while (end < s.length && /[֑-ׇ]/.test(s[end])) end++;
    const sp = s.lastIndexOf(' ', end);
    return (sp > n * 0.5 ? s.slice(0, sp) : s.slice(0, end)).trimEnd() + '…';
  }
  const fileSafe = (s) => String(s || 'questions').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'questions';
  /** Search key: maqaf/hyphen = space (so \u00ab\u05d0\u05dc \u05e9\u05d0\u05d5\u05dc\u00bb finds \u00ab\u05d0\u05b6\u05dc\u05be\u05e9\u05b8\u05c1\u05d0\u05d5\u05bc\u05dc\u00bb), no nikud/te'amim, one kind of quote. */
  const noMarks = (s) => String(s || '').replace(/[\u05be\-\u2010-\u2014]/g, ' ').replace(/[\u0591-\u05c7\u200e\u200f]/g, '')
    .replace(/[\u05f4"]/g, '"').replace(/[\u05f3']/g, "'").replace(/\s+/g, ' ').toLowerCase();
  /** Duplicate key: question text + correct answer, ignoring nikud and punctuation (same rule the store uses when drawing). */
  const textKey = (s) => (S().textKey ? S().textKey(s) : String(s || '').replace(/[\u0591-\u05c7]/g, '').replace(/[^\u05d0-\u05eaa-z0-9]+/gi, ' ').trim());
  const dupKey = (q) => textKey(q.q) + '|' + textKey(q.correct);
  /** Non-blocking note for rows the game will show in a smaller font. */
  const bare = (s) => String(s || '').replace(/[\u0591-\u05bd\u05bf-\u05c7\u200e\u200f]/g, '').trim();
  function longNote(q) {
    const lq = bare(q.q).length > LONG_Q, la = [q.correct, ...(q.wrong || [])].some((a) => bare(a).length > LONG_A);
    return lq && la ? '\u05e9\u05d0\u05dc\u05d4 \u05d5\u05ea\u05e9\u05d5\u05d1\u05d4 \u05d0\u05e8\u05d5\u05db\u05d5\u05ea \u2013 \u05d9\u05d5\u05e6\u05d2\u05d5 \u05d1\u05d2\u05d5\u05e4\u05df \u05e7\u05d8\u05df \u05d9\u05d5\u05ea\u05e8' : lq ? '\u05e9\u05d0\u05dc\u05d4 \u05d0\u05e8\u05d5\u05db\u05d4 \u2013 \u05ea\u05d5\u05e6\u05d2 \u05d1\u05d2\u05d5\u05e4\u05df \u05e7\u05d8\u05df \u05d9\u05d5\u05ea\u05e8' : la ? '\u05ea\u05e9\u05d5\u05d1\u05d4 \u05d0\u05e8\u05d5\u05db\u05d4 \u2013 \u05ea\u05d5\u05e6\u05d2 \u05d1\u05d2\u05d5\u05e4\u05df \u05e7\u05d8\u05df \u05d9\u05d5\u05ea\u05e8' : '';
  }
  const rtf = (() => { try { return new Intl.RelativeTimeFormat('he', { numeric: 'auto' }); } catch (e) { return null; } })();
  function ago(t) {
    if (!t || !rtf) return '';
    const s = (Date.now() - t) / 1000;
    if (s < 50) return 'עכשיו';
    if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
    return rtf.format(-Math.round(s / 86400), 'day');
  }
  const ui = (fn, ...a) => (CH.ui && CH.ui[fn] ? CH.ui[fn](...a) : Promise.resolve(fn === 'confirm' ? window.confirm(a[0]) : null));
  const toast = (text, kind = 'info') => CH.ui && CH.ui.toast && CH.ui.toast(text, { kind, theme: 'light' });
  const emblemHTML = () => {
    try { if (CH.art && CH.art.emblem) return CH.art.emblem({ shaded: true }); } catch (e) { console.error(e); }
    return '<span class="emblem-fallback">ח</span>';
  };

  // ---------------- state ----------------
  let root = null, mainEl = null, tabsEl = null, tabInd = null, subEl = null, emblemEl = null, savedEl = null, snackEl = null;
  let isOpenFlag = false, tab = 'settings', selSetId = null, savedTimer = 0, closing = null;

  // ======================================================================
  // Shell
  // ======================================================================
  function build() {
    root = $('#admin');
    if (!root) { root = h('div#admin'); document.body.append(root); }
    root.innerHTML = '';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'ניהול המשחק');
    root.setAttribute('dir', 'rtl');

    tabInd = h('span.adm-tab-ind', { 'aria-hidden': 'true' });
    tabsEl = h('nav.adm-tabs', { role: 'tablist', 'aria-label': 'אזורי ניהול' }, tabInd,
      TABS.map((t) => h('button.adm-tab', { type: 'button', role: 'tab', 'data-tab': t.key, onclick: () => setTab(t.key) }, ic(t.icon), h('span', t.label))));
    savedEl = h('div.adm-saved', { role: 'status', 'aria-live': 'polite', dataset: { state: 'idle' } },
      h('span.adm-saved-ic', { html: I.check }), h('span.adm-saved-txt', 'נשמר'));
    emblemEl = h('div.adm-emblem', { html: emblemHTML() });
    subEl = h('div.adm-sub');

    const top = h('header.adm-top',
      h('div.adm-brand', emblemEl, h('div.adm-brand-txt', h('div.adm-title', 'ניהול המשחק'), subEl)),
      tabsEl,
      h('div.adm-top-end', savedEl, btn('חזרה למשחק', { kind: 'primary', icon: 'play', onclick: close, title: 'חזרה למשחק (Esc)' })));

    mainEl = h('main.adm-main');
    snackEl = h('div.adm-snack', { role: 'status', hidden: true });
    root.append(top, mainEl, snackEl);
    refreshTitle();
    window.addEventListener('resize', () => isOpenFlag && placeTabInd(false));
  }

  function refreshTitle() { if (subEl) subEl.textContent = S().displayTitle(); }
  function refreshEmblem() { if (emblemEl) emblemEl.innerHTML = emblemHTML(); }

  function placeTabInd(animated = true) {
    if (!tabsEl) return;
    const b = tabsEl.querySelector(`.adm-tab[data-tab="${tab}"]`);
    if (!b) return;
    tabInd.style.transition = animated ? '' : 'none';
    tabInd.style.width = b.offsetWidth + 'px';
    tabInd.style.transform = `translateX(${b.offsetLeft}px)`;
    if (!animated) { void tabInd.offsetWidth; tabInd.style.transition = ''; }
  }

  function normTab(t) {
    if (t === 'sets' || t === 'questions' || t === 'q') return 'questions';
    return TABS.some((x) => x.key === t) ? t : 'settings';
  }

  function setTab(t, opts = {}) {
    const next = normTab(t);
    if (next !== tab || opts.force) leaveQuestions();
    tab = next;
    tabsEl.querySelectorAll('.adm-tab').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('is-active', on); b.setAttribute('aria-selected', String(on));
    });
    placeTabInd(!opts.instant);
    const view = tab === 'settings' ? renderSettings() : tab === 'questions' ? renderQuestions() : renderImport();
    const banner = S().storageOk ? null : h('div.adm-banner', ic('info'),
      h('div', h('b', 'האחסון בדפדפן חסום. '), 'השינויים יישמרו עד לסגירת החלון בלבד — לשמירה קבועה ייצאו את השאלות לקובץ JSON.'));
    if (banner) view.prepend(banner);              // inside the page, so it shares the content edges
    mainEl.replaceChildren(view);
    if (!opts.keepScroll) root.scrollTop = 0;
    motion(view, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
    if (tab === 'questions') afterRowsMounted();
  }

  // ---- saved indicator ----
  function markSaving() {
    if (!savedEl) return;
    clearTimeout(savedTimer);
    savedEl.dataset.state = 'saving';
    savedEl.lastChild.textContent = 'שומר…';
  }
  function markSaved() {
    if (!savedEl) return;
    clearTimeout(savedTimer);
    savedEl.dataset.state = 'saved';
    savedEl.lastChild.textContent = S().storageOk ? 'נשמר' : 'נשמר זמנית';
    savedTimer = setTimeout(() => { savedEl.dataset.state = 'idle'; }, 1900);
  }

  // ---- snackbar with undo (toasts lift above it while it is shown) ----
  let snackTimer = 0, snackGen = 0;
  function snack(text, onUndo, ms = 6000) {
    clearTimeout(snackTimer);
    const gen = ++snackGen;
    snackEl.getAnimations().forEach((a) => a.cancel());       // a hide still in flight must not swallow this one
    const bar = h('span.adm-snack-bar');
    put(snackEl, ic('trash'), h('span.adm-snack-txt', text),
      onUndo ? h('button.adm-snack-undo', { type: 'button', onclick: () => { hideSnack(); onUndo(); } }, ic('undo'), 'ביטול') : null, bar);
    snackEl.hidden = false;
    document.body.classList.add('adm-snack-on');
    motion(snackEl, [{ opacity: 0, transform: 'translate(-50%, 16px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 360 });
    motion(bar, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
    snackTimer = setTimeout(() => gen === snackGen && hideSnack(), ms);
  }
  function hideSnack() {
    clearTimeout(snackTimer);
    document.body.classList.remove('adm-snack-on');
    if (!snackEl || snackEl.hidden) return;
    const gen = snackGen;
    const a = motion(snackEl, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, 10px)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    const done = () => { if (gen === snackGen) { snackEl.hidden = true; a && a.cancel(); } };
    a ? a.finished.then(done, done) : done();
  }

  // ======================================================================
  // Open / close
  // ======================================================================
  function open(t) {
    const first = !isOpenFlag;
    if (first) bus.emit('admin:opened');                    // the game pauses its answer timer while the admin covers it
    if (!root) build();
    if (closing) { clearTimeout(closing); closing = null; }
    root.getAnimations().forEach((a) => a.cancel());        // reopened mid-close: drop the fade-out
    isOpenFlag = true;
    root.hidden = false;
    document.body.classList.add('in-admin');
    refreshTitle(); refreshEmblem();
    if (!selSetId || !S().getSet(selSetId)) selSetId = S().activeSetId();
    setTab(t || tab, { instant: first, force: true });
    if (first) {
      motion(root, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
      motion(root.firstChild, [{ transform: 'translateY(-12px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520 });
      setTimeout(() => { if (isOpenFlag) document.body.classList.add('admin-covered'); }, 320);
      requestAnimationFrame(() => placeTabInd(false));
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeTabInd(false));
    }
  }

  function close() {
    if (!isOpenFlag) return;
    leaveQuestions();
    hideSnack();
    isOpenFlag = false;
    document.body.classList.remove('admin-covered', 'in-admin');
    const a = motion(root, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.995)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    closing = setTimeout(() => { closing = null; if (!isOpenFlag) root.hidden = true; a && a.cancel(); }, 230);
    bus.emit('admin:closed');
  }

  const isOpen = () => isOpenFlag;

  // Keyboard: Esc blurs a field first, then closes. Ctrl+S just confirms the autosave.
  window.addEventListener('keydown', (e) => {
    if (!isOpenFlag) return;
    if (e.key === 'Escape' && !e.defaultPrevented && !(CH.ui && CH.ui.modalOpen)) {
      const t = document.activeElement;
      if (t && root.contains(t) && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { t.blur(); return; }
      e.preventDefault(); close();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S' || e.code === 'KeyS')) {
      e.preventDefault(); flushAllRows(); markSaved();
    }
  });
  // Never let a file dropped anywhere navigate the window away from the game (admin open or not).
  // A question file dropped on the game opens the admin on the import tab and loads it.
  const carriesFiles = (e) => !!(e.dataTransfer && Array.prototype.includes.call(e.dataTransfer.types || [], 'Files'));
  const editable = (t) => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)));
  ['dragover', 'drop'].forEach((ev) => window.addEventListener(ev, (e) => {
    if (!carriesFiles(e)) {
      // a dragged link dropped on the page would navigate too; text dropped into a field still works
      if (e.dataTransfer && Array.prototype.includes.call(e.dataTransfer.types || [], 'text/uri-list') && !editable(e.target)) e.preventDefault();
      return;
    }
    e.preventDefault();
    if (ev === 'dragover') { try { e.dataTransfer.dropEffect = 'copy'; } catch (x) { /* read-only in some engines */ } return; }
    if (e.__admHandled) return;
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    if (!IMPORTABLE.test(f.name)) {
      CH.ui && CH.ui.toast && CH.ui.toast('אפשר לגרור לכאן קובץ שאלות: Excel, CSV או JSON', { kind: 'err', theme: isOpenFlag ? 'light' : undefined });
      return;
    }
    if (!isOpenFlag) open('import'); else if (tab !== 'import') setTab('import');
    handleFile(f);
  }));
  window.addEventListener('pagehide', () => { flushAllRows(); commitDeletes(); });
  bus.on('brand:change', () => { refreshEmblem(); });

  // ======================================================================
  // Settings
  // ======================================================================
  function page(title, desc, ...children) {
    return h('section.adm-page', h('header.adm-page-head', h('h1', title), desc ? h('p', desc) : null), ...children);
  }
  function card(icon, title, desc, ...children) {
    return h('section.a-card', h('header.a-card-head', h('span.a-card-ic', { html: I[icon] || '' }),
      h('div', h('h2', title), desc ? h('p', desc) : null)), h('div.a-card-body', ...children));
  }
  function srow(label, desc, control, extra) {
    return h('div.srow' + (extra || ''), h('div.srow-txt', h('div.srow-label', label), desc ? h('div.srow-desc', desc) : null), h('div.srow-ctl', control));
  }

  function stepper(value, min, max, label, onChange) {
    const input = h('input.st-in', { type: 'text', inputmode: 'numeric', value: String(value), 'aria-label': label, dir: 'ltr' });
    let v = value, holdT = 0, holdI = 0;
    const commit = (nv, bump) => {
      nv = U.clamp(Math.round(+nv || min), min, max);
      const changed = nv !== v; v = nv; input.value = String(v);
      minus.disabled = v <= min; plus.disabled = v >= max;
      if (changed) { onChange(v); if (bump) motion(input, [{ transform: `translateY(${bump * 5}px)`, opacity: 0.35 }, { transform: 'none', opacity: 1 }], { duration: 220 }); }
    };
    const hold = (d) => (e) => {
      if (e.button) return;
      commit(v + d, d > 0 ? -1 : 1);
      clearTimeout(holdT); clearInterval(holdI);
      holdT = setTimeout(() => { holdI = setInterval(() => commit(v + d, d > 0 ? -1 : 1), 70); }, 420);
    };
    const stop = () => { clearTimeout(holdT); clearInterval(holdI); };
    const mk = (d, icon, lbl) => h('button.st-btn', { type: 'button', 'aria-label': lbl, html: I[icon], onpointerdown: hold(d), onpointerup: stop, onpointerleave: stop, onpointercancel: stop,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(v + d, d > 0 ? -1 : 1); } } });
    const plus = mk(1, 'plus2', 'הגדלה'), minus = mk(-1, 'minus', 'הקטנה');
    input.addEventListener('input', () => { input.value = input.value.replace(/[^\d]/g, '').slice(0, 4); });
    input.addEventListener('change', () => commit(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); commit(v + 1, -1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); commit(v - 1, 1); }
      else if (e.key === 'Enter') { e.preventDefault(); commit(input.value); input.blur(); }
    });
    minus.disabled = v <= min; plus.disabled = v >= max;
    return h('div.st', plus, input, minus);
  }

  function segmented(options, value, label, onChange) {
    let idx = Math.max(0, options.findIndex((o) => o.value === value));
    const wrap = h('div.seg', { role: 'radiogroup', 'aria-label': label, style: { '--n': options.length, '--i': idx } }, h('span.seg-thumb'));
    const btns = options.map((o, i) => h('button.seg-btn', { type: 'button', role: 'radio', 'aria-checked': String(i === idx), 'aria-label': o.aria || null, onclick: () => pick(i) }, o.label));
    function pick(i) {
      if (i === idx) return;
      idx = i; wrap.style.setProperty('--i', i);
      btns.forEach((b, j) => b.setAttribute('aria-checked', String(j === i)));
      onChange(options[i].value);
    }
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const d = e.key === 'ArrowLeft' ? 1 : -1;       // RTL: left = next
        const i = U.clamp(idx + d, 0, options.length - 1); pick(i); btns[i].focus();
      }
    });
    wrap.append(...btns);
    return wrap;
  }

  function toggle(on, label, onChange) {
    const b = h('button.tgl', { type: 'button', role: 'switch', 'aria-checked': String(!!on), 'aria-label': label,
      onclick: () => { on = !on; b.setAttribute('aria-checked', String(on)); onChange(on); } }, h('span.tgl-knob'));
    return b;
  }

  /** Text input with a length cap, typographic polish on blur (ASCII quotes → ״/׳) and an optional soft hint. */
  function textField(label, value, placeholder, onInput, o = {}) {
    const input = h('input.a-input', { type: 'text', value: value || '', placeholder, dir: 'rtl', spellcheck: 'false', maxlength: o.max || null });
    const hint = h('div.field-hint', { 'aria-live': 'polite' });
    const paintHint = () => {
      const n = input.value.length;
      const warn = o.warnAt && n > o.warnAt, full = o.max && n >= o.max;
      const msg = warn ? o.warn : full ? `אורך מרבי: ${o.max} תווים` : '';
      put(hint, msg ? [ic('info'), h('span', msg), warn && o.max ? h('span.field-count', { dir: 'ltr' }, `${n}/${o.max}`) : null] : []);
      hint.hidden = !msg;
    };
    input.addEventListener('input', () => { onInput(input.value); paintHint(); });
    input.addEventListener('change', () => {
      const t = U.typo(input.value);
      if (t !== input.value) { input.value = t; onInput(t); }
    });
    paintHint();
    return h('label.field', h('span.field-label', label), input, hint);
  }

  function renderSettings() {
    const st = S().getSettings();
    let saveT = 0;
    const save = (patch, debounce) => {
      S().updateSettings(patch);
      refreshTitle(); refreshPreview(); refreshPool();
      if (debounce) { markSaving(); clearTimeout(saveT); saveT = setTimeout(markSaved, 500); } else markSaved();
    };

    // --- identity: a true miniature of the splash (title big, level in a pill below), fitted like the game fits it ---
    const tpTitle = h('div.tp-title', h('span.tp-t')), tpLevel = h('div.tp-level');
    const tpStage = h('div.tp-stage', h('div.tp-emblem', { html: emblemHTML() }), tpTitle, tpLevel);
    const preview = h('div.tp', { 'aria-hidden': 'true' }, h('div.tp-rays'), tpStage, h('div.tp-cap', 'תצוגה מקדימה · מסך הפתיחה'));
    const refreshPreview = () => {
      const s = S().getSettings();
      tpTitle.firstChild.textContent = U.typo(String(s.title || '').trim() || 'כוכב התנ״ך');
      const lv = U.typo(String(s.level || '').trim());
      tpLevel.textContent = lv; tpLevel.hidden = !lv;
      fitPreview(preview);
    };
    refreshPreview();
    watchPreview(preview);
    const identity = card('title', 'שם המשחק והרמה', 'הכותרת שמופיעה במסך הפתיחה ובראש לוח הכוורות.',
      h('div.field-row',
        textField('שם המשחק', st.title, 'כוכב התנ״ך', (v) => save({ title: v }, true),
          { max: TITLE_MAX, warnAt: TITLE_WARN, warn: 'שם ארוך – במשחק הוא יוצג בגופן קטן יותר' }),
        textField('רמה / שלב', st.level, 'רמה 2', (v) => save({ level: v }, true), { max: TITLE_MAX })),
      preview);

    // --- round structure ---
    const poolNote = h('div.pool-note');
    const sumEl = h('div.round-sum');
    function refreshPool() {
      const s = S().getSettings(), a = S().activeSet();
      const okQs = a.questions.filter(valid);
      const ok = okQs.length, need = s.participants * s.perParticipant;
      // Highest score a hive can reach: per-question points when the active set has them, else the default.
      const custom = okQs.some((q) => q.points > 0);
      const ptsOf = (q) => (q.points > 0 ? q.points : s.points);
      const maxPts = custom ? okQs.map(ptsOf).sort((x, y) => y - x).slice(0, s.perParticipant).reduce((t, p) => t + p, 0) : s.perParticipant * s.points;
      sumEl.replaceChildren(
        h('div.rs-item', h('b', nf(s.participants)), h('span', s.participants === 1 ? 'כוורת' : 'כוורות')), h('span.rs-x', '×'),
        h('div.rs-item', h('b', nf(s.perParticipant)), h('span', s.perParticipant === 1 ? 'שאלה' : 'שאלות')), h('span.rs-x', '='),
        h('div.rs-item', h('b', nf(need)), h('span', need === 1 ? 'שאלה בסבב' : 'שאלות בסבב')),
        h('div.rs-sep'),
        h('div.rs-item', { title: custom ? 'לפי הנקודות שנקבעו לשאלות באוסף הפעיל' : `${nf(s.perParticipant)} × ${nf(s.points)} נקודות (ברירת המחדל לשאלה)` },
          h('b', U.fmtScore(maxPts)), h('span', 'נקודות לכל היותר בכוורת')));
      const go = btn('לעריכת השאלות', { kind: 'link', icon: 'next', onclick: () => { selSetId = a.id; setTab('questions'); } });
      if (ok < s.perParticipant) {
        poolNote.replaceChildren(h('div.callout.warn', ic('warn'), h('div',
          h('b', ok ? `באוסף הפעיל «${a.name}» יש רק ${okCount(ok)}` : `באוסף הפעיל «${a.name}» אין שאלות תקינות`),
          ` — פחות מ־${s.perParticipant} שאלות לכוורת. ${ok ? `כל כוורת תכלול ${qCount(ok)} בלבד.` : 'יש להוסיף או לייבא שאלות לפני המשחק.'}`), go));
      } else if (ok < need) {
        poolNote.replaceChildren(h('div.callout.info', ic('info'), h('div',
          `באוסף הפעיל «${a.name}» יש ${okCount(ok)} והסבב המלא דורש ${nf(need)} — שאלות יחזרו על עצמן בין כוורות (לא באותה כוורת).`)));
      } else {
        poolNote.replaceChildren(h('div.callout.ok', ic('check'), h('div', `באוסף הפעיל «${a.name}» יש ${okCount(ok)} — מספיק לסבב מלא בלי חזרות.`)));
      }
    }
    refreshPool();
    const round = card('users', 'מבנה הסבב', 'כמה כוורות על הלוח, כמה שאלות בכל כוורת, וכמה זמן ונקודות לכל שאלה.',
      srow('מספר כוורות', 'בין 1 ל־60 משבצות בלוח הכוורות', stepper(st.participants, 1, 60, 'מספר כוורות', (v) => save({ participants: v }))),
      srow('שאלות בכל כוורת', 'כמה שאלות יישאל המשתתף שבחר בכוורת',
        segmented([1, 4, 10].map((n) => ({ value: n, label: String(n) })), st.perParticipant, 'שאלות בכל כוורת', (v) => save({ perParticipant: v }))),
      srow('נקודות לשאלה', 'ברירת מחדל — אפשר לקבוע מספר נקודות אחר לשאלה מסוימת בטבלת השאלות', stepper(st.points, 1, 1000, 'נקודות לשאלה', (v) => save({ points: v }))),
      srow('זמן מענה לשאלה', 'ספירה לאחור על לוח השאלה. כשהזמן נגמר מוצגת התשובה הנכונה, ולא ניתנות נקודות.',
        segmented([0, 15, 20, 30, 45, 60].map((n) => ({ value: n, label: n ? h('span', String(n), h('small', ' שנ׳')) : 'ללא', aria: n ? `${n} שניות` : 'ללא הגבלת זמן' })),
          st.answerTime, 'זמן מענה לשאלה', (v) => save({ answerTime: v })), '.is-stack'),
      sumEl, poolNote);

    // --- behaviour toggles ---
    const behaviour = card('sparkle', 'גלגלי הצלה, תוכן וצליל', 'איך המשחק מתנהג באולם, ואיך נשמר טקסט שמודבק מתוכנות תנ״ך.',
      srow('50:50 מחצה את הנקודות', 'משתתף שנעזר בגלגל ההצלה יקבל חצי מהנקודות על אותה שאלה.',
        toggle(st.halveOn5050, '50:50 מחצה את הנקודות', (v) => save({ halveOn5050: v }))),
      srow('הסרת טעמי המקרא בהדבקה (הניקוד נשמר)', 'טקסט שמודבק מתוכנות תנ״ך או מיובא מקובץ יישמר עם ניקוד ובלי טעמים.',
        toggle(st.stripCantillation, 'הסרת טעמי המקרא בהדבקה', (v) => save({ stripCantillation: v }))),
      srow('צלילים', 'מוזיקת רקע ואפקטים קוליים במהלך המשחק.',
        toggle(st.sound, 'צלילים', (v) => {
          save({ sound: v });
          if (CH.sound) { CH.sound.setMuted && CH.sound.setMuted(!v); if (v && CH.sound.play) CH.sound.play('click'); }
          CH.ui && CH.ui.refreshDock && CH.ui.refreshDock();
        })));

    // --- branding ---
    const brand = card('palette', 'מיתוג', 'קובצי הלוגו של חן התנ״ך (PNG שקוף). בלי קבצים מוצג שחזור מובנה של הלוגו.',
      srow('סגנון רקע', 'מודרני — אופק של אור וזהב · קלאסי — קו הרקיע של ירושלים, כמו במשחק המקורי',
        segmented([{ value: 'modern', label: 'מודרני' }, { value: 'classic', label: 'קלאסי' }], st.theme || 'modern', 'סגנון רקע', (v) => save({ theme: v }))),
      h('div.brand-grid', brandSlot('wordmark', 'לוגו מילולי'), brandSlot('emblem', 'סמל')));

    // --- current round ---
    const r = S().getRound();
    const played = Object.keys(r.results || {}).filter((n) => +n <= st.participants).length;
    const cur = r.current && r.current.n;
    const cols = Math.ceil(st.participants / Math.ceil(st.participants / 12));     // even rows, no orphans (16 → 2×8)
    const tiles = h('div.rc-tiles', { 'aria-label': `${nf(played)} מתוך ${nf(st.participants)} כוורות שוחקו`, style: { '--cols': cols } },
      Array.from({ length: st.participants }, (_, i) => {
        const n = i + 1, res = S().resultOf(n);
        return h('span.rc-tile' + (res ? '.is-done' : '') + (cur === n ? '.is-now' : ''),
          { style: { '--c': EMBLEM[i % EMBLEM.length] }, title: res ? `כוורת ${n} · ${U.fmtScore(res.score)} נק׳` : cur === n ? `כוורת ${n} · במשחק עכשיו` : `כוורת ${n}` }, String(n));
      }));
    const roundCard = card('trophy', 'הסבב הנוכחי', 'משבצת צבעונית = כוורת ששוחקה.',
      h('div.rc-stat', h('div.rc-num', h('b', nf(played)), h('span', ` / ${nf(st.participants)}`)), h('div.rc-lbl', played ? 'כוורות שוחקו' : 'אף כוורת עוד לא שוחקה')),
      tiles,
      h('p.rc-note', 'איפוס מוחק את התוצאות של כל הכוורות (וגם מבטל כוורת שבאמצע המשחק) ומתחיל סבב חדש. השאלות וההגדרות נשמרות.'),
      h('div.rc-foot',
        btn('איפוס הסבב', { kind: 'danger', icon: 'refresh', onclick: async () => {
          const ok = await ui('confirm', 'איפוס הסבב', resetText(), { ok: 'איפוס הסבב', danger: true });
          if (!ok) return;
          S().resetRound(); markSaved(); toast('הסבב אופס — אפשר להתחיל מחדש', 'ok');
          setTab('settings', { keepScroll: true });
        } })));

    const offline = h('div.offline-note', ic('shield'), h('div', h('b', 'עובד ללא אינטרנט. '), S().storageOk ? 'כל הנתונים נשמרים במחשב זה בלבד.' : 'האחסון חסום — הנתונים נשמרים עד סגירת החלון.'));

    return page('הגדרות', 'כל שינוי נשמר אוטומטית ומתעדכן מיד במשחק.',
      h('div.set-grid', h('div.set-col', identity, round, behaviour), h('div.set-col', brand, roundCard, offline)));
  }

  /** Reset-round confirmation, worded for what will actually happen (results, a hive in progress, singular/plural). */
  function resetText() {
    const n = S().getSettings().participants, r = S().getRound();
    const played = Object.keys(r.results || {}).filter((k) => +k <= n).length;
    const cur = r.current && r.current.n;
    const parts = [];
    if (played) parts.push(played === 1 ? 'התוצאה של כוורת אחת תימחק' : `התוצאות של ${nf(played)} כוורות יימחקו`);
    if (cur) parts.push(`כוורת ${nf(cur)}, שנמצאת עכשיו באמצע המשחק, תבוטל`);
    const opens = 'כל הכוורות ייפתחו מחדש וסדר השאלות יעורבב מחדש.';
    return parts.length ? `${parts.join(', ')}, ו${opens}` : opens;
  }

  // ---- splash miniature: laid out in stage pixels (1920 wide) and scaled down, so long titles shrink exactly like in the game ----
  const STAGE_W = 1920, TITLE_FIT_W = 1800, TITLE_PX = 176, LEVEL_PX = 48;
  function fitPreview(tp) {
    if (!tp || !tp.isConnected) return;
    const W = tp.clientWidth; if (!W) return;
    const stage = tp.querySelector('.tp-stage'), title = tp.querySelector('.tp-title'), t = tp.querySelector('.tp-t'), lvl = tp.querySelector('.tp-level');
    title.style.fontSize = ''; lvl.style.fontSize = '';
    const tw = t.offsetWidth;                                   // layout width: unaffected by the scale transform
    if (tw > TITLE_FIT_W) title.style.fontSize = (TITLE_PX * TITLE_FIT_W / tw).toFixed(1) + 'px';
    const lw = lvl.hidden ? 0 : lvl.offsetWidth;
    if (lw > TITLE_FIT_W) lvl.style.fontSize = (LEVEL_PX * TITLE_FIT_W / lw).toFixed(1) + 'px';
    const k = W / STAGE_W;
    stage.style.transform = `scale(${k})`;
    tp.style.height = Math.ceil(stage.offsetHeight * k) + 'px';
  }
  let previewRO = null;
  function watchPreview(tp) {
    if (window.ResizeObserver) {
      // refit only when the width changes (fitPreview sets the height itself — never loop on that)
      if (!previewRO) previewRO = new ResizeObserver((entries) => entries.forEach((e) => {
        const w = Math.round(e.contentRect.width);
        if (+e.target.dataset.w !== w) { e.target.dataset.w = w; requestAnimationFrame(() => fitPreview(e.target)); }
      }));
      previewRO.disconnect(); previewRO.observe(tp);
    }
    requestAnimationFrame(() => fitPreview(tp));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPreview(tp));
  }

  // ---- branding slots ----
  const sessionBrand = new Map();     // key → data URL uploaded in this window (even when it could not be stored)
  function brandSlot(key, title) {
    const view = h('div.bs-view');
    const badge = h('span.bs-badge');
    const acts = h('div.bs-acts');
    const input = h('input', { type: 'file', accept: 'image/png,image/webp,image/svg+xml,image/jpeg', hidden: true });
    input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; if (f) take(f); });
    const slot = h('div.bs', h('div.bs-head', h('div.bs-title', title), badge), view, acts, input);

    function paint() {
      const cur = (window.CH_BRAND || {})[key];
      const stored = (LS.get(BRAND_KEY, {}) || {})[key];
      const kept = typeof stored === 'string' && stored === cur;                         // uploaded and stored
      const temp = !kept && typeof cur === 'string' && sessionBrand.get(key) === cur;   // uploaded, but too big to store
      const uploaded = kept || temp;
      const embedded = typeof cur === 'string' && !uploaded;
      try { view.innerHTML = CH.art && CH.art[key] ? CH.art[key](key === 'emblem' ? { shaded: true } : {}) : ''; } catch (e) { view.innerHTML = ''; }
      if (!view.innerHTML && cur) view.replaceChildren(h('img', { src: cur, alt: title }));
      if (!view.innerHTML) view.replaceChildren(h('span.bs-empty', ic('image')));
      badge.textContent = temp ? 'הועלה · זמני' : uploaded ? 'קובץ שהועלה' : embedded ? 'קובץ מקורי' : 'שחזור מובנה';
      badge.dataset.kind = temp ? 'temp' : uploaded || embedded ? 'file' : 'builtin';
      badge.title = temp ? 'הקובץ מוצג עד סגירת החלון: אין מספיק מקום לשמירה קבועה. אחרי סגירת החלון יוצג השחזור המובנה.' : '';
      put(acts,
        btn(uploaded ? 'החלפה' : 'העלאת PNG', { size: 'sm', icon: 'upload', onclick: () => input.click() }),
        uploaded ? btn('הסרה', { size: 'sm', kind: 'ghost-danger', icon: 'trash', onclick: () => { saveBrand(key, null); paint(); toast('הלוגו הוסר — מוצג השחזור המובנה'); } }) : null);
    }
    async function take(file) {
      if (!/^image\//.test(file.type)) { toast('יש לבחור קובץ תמונה (PNG)', 'err'); return; }
      try {
        const url = await shrinkImage(file);
        const persisted = saveBrand(key, url);
        paint();
        motion(view.firstChild, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
        toast(persisted ? 'הלוגו עודכן' : 'הלוגו עודכן עד סגירת החלון — הקובץ גדול מדי לשמירה קבועה', persisted ? 'ok' : 'info');
      } catch (e) { console.error(e); toast('לא ניתן לקרוא את התמונה', 'err'); }
    }
    view.addEventListener('dragover', (e) => { e.preventDefault(); view.classList.add('is-over'); });
    view.addEventListener('dragleave', () => view.classList.remove('is-over'));
    view.addEventListener('drop', (e) => {
      e.preventDefault(); e.__admHandled = true; view.classList.remove('is-over');
      const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) take(f);
    });
    paint();
    return slot;
  }

  /** File → data URL. Big bitmaps are scaled to ≤1000 px and re-encoded (PNG/WebP with transparency,
   *  WebP/JPEG for photos), stepping down until the result fits comfortably in localStorage. */
  const BRAND_MAX_CHARS = 600 * 1024;
  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => resolve(String(fr.result));
      fr.readAsDataURL(file);
    });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('image')); img.src = url; });
  }
  function hasAlpha(g, w, hgt) {
    try {
      const d = g.getImageData(0, 0, w, hgt).data, step = Math.max(1, Math.floor((w * hgt) / 60000)) * 4;
      for (let i = 3; i < d.length; i += step) if (d[i] < 250) return true;
      return false;
    } catch (e) { return true; }
  }
  async function shrinkImage(file) {
    const url = await readDataUrl(file);
    if (file.type === 'image/svg+xml') return url;
    const img = await loadImage(url);
    const W = img.naturalWidth, H = img.naturalHeight;
    if (url.length <= 300 * 1024 && Math.max(W, H) <= 1000) return url;          // already small: keep the original bytes
    let best = url;
    try {
      const c = document.createElement('canvas'), g = c.getContext('2d');
      for (const side of [1000, 800, 640, 480]) {
        const k = Math.min(1, side / Math.max(W, H));
        c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        const outs = hasAlpha(g, c.width, c.height)
          ? [c.toDataURL('image/png'), c.toDataURL('image/webp', 0.9)]
          : [c.toDataURL('image/webp', 0.86), c.toDataURL('image/jpeg', 0.86)];
        const out = outs.reduce((a, b) => (b.length < a.length ? b : a));
        if (out.length < best.length) best = out;
        if (best.length <= BRAND_MAX_CHARS) break;
      }
    } catch (e) { console.warn(e); }
    return best;
  }

  function saveBrand(key, dataUrl) {
    const stored = { ...(LS.get(BRAND_KEY, {}) || {}) };
    if (dataUrl) stored[key] = dataUrl; else delete stored[key];
    let ok = LS.set(BRAND_KEY, stored);
    if (dataUrl) sessionBrand.set(key, dataUrl); else sessionBrand.delete(key);
    if (!ok && dataUrl) {
      // Could not store the new logo: drop the stale stored one too, so a reload never brings back the replaced logo.
      const prev = { ...(LS.get(BRAND_KEY, {}) || {}) }; delete prev[key];
      LS.set(BRAND_KEY, prev);
    }
    const b = { ...(window.CH_BRAND || {}) };
    if (dataUrl) b[key] = dataUrl; else delete b[key];
    window.CH_BRAND = b;
    bus.emit('brand:change', { key });
    refreshEmblem();
    markSaved();
    return ok;
  }

  // ======================================================================
  // Question sets + inline table editor
  // ======================================================================
  const FIELDS = [
    { f: 'q', label: 'שאלה', cls: 'c-q', ph: 'טקסט השאלה (אפשר להדביק עם ניקוד)' },
    { f: 'correct', label: 'תשובה נכונה', cls: 'c-ok', ph: 'התשובה הנכונה' },
    { f: 'w0', label: 'תשובה שגויה 1', cls: 'c-bad', ph: 'מסיח' },
    { f: 'w1', label: 'תשובה שגויה 2', cls: 'c-bad', ph: 'מסיח' },
    { f: 'w2', label: 'תשובה שגויה 3', cls: 'c-bad', ph: 'מסיח' },
    { f: 'source', label: 'מקור', cls: 'c-src', ph: 'ספר פרק, פסוק' },
    { f: 'points', label: 'נקודות', cls: 'c-pts', ph: '—', title: 'נקודות לשאלה זו (ריק = ברירת המחדל מההגדרות)' },
  ];
  const getF = (q, f) => (f === 'points' ? (q.points > 0 ? String(q.points) : '') : (f[0] === 'w' ? (q.wrong || [])[+f[1]] : q[f]) || '');
  const parsePts = (v) => { const n = parseFloat(String(v || '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.min(1000, n) : null; };
  const Q = { setId: null, tbody: null, search: '', onlyBad: false, timers: new Map(), refs: {}, rest: null };
  const FIRST_ROWS = 60, ROW_BATCH = 90;
  const pending = new Map();         // qid → { setId, tr, timer } (deleted, waiting for undo)
  const autosize = !(window.CSS && CSS.supports && CSS.supports('field-sizing', 'content'));
  const fit = (ta) => { if (autosize) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 2 + 'px'; } };

  function readRow(tr) {
    const v = {};
    tr.querySelectorAll('textarea.q-cell').forEach((ta) => { v[ta.dataset.f] = U.cleanHebrew(ta.value); });
    return { q: v.q || '', correct: v.correct || '', wrong: [v.w0 || '', v.w1 || '', v.w2 || ''], source: v.source || '', points: parsePts(v.points) };
  }

  function rowEl(q, idx) {
    const tr = h('tr.q-row', { dataset: { id: q.id, set: Q.setId || '' } });
    tr.append(h('td.c-num', h('span.q-num', String(idx + 1)), h('span.q-flag', { html: I.warn, title: '' })));
    FIELDS.forEach(({ f, label, cls, ph, title }) => {
      const ta = h('textarea.q-cell', { rows: 1, 'data-f': f, placeholder: f === 'points' ? String(S().getSettings().points) : ph, spellcheck: 'false', dir: 'rtl', 'aria-label': label, title: title || null, inputmode: f === 'points' ? 'decimal' : null });
      ta.value = getF(q, f);
      const td = h('td.' + cls, ta);
      if (f === 'q') td.append(h('div.q-issue'), h('div.q-note'));
      tr.append(td);
    });
    tr.append(h('td.c-act', h('button.q-del', { type: 'button', title: 'מחיקת השאלה', 'aria-label': 'מחיקת השאלה', html: I.trash })));
    flagRow(tr, q);
    return tr;
  }

  function flagRow(tr, q) {
    const errs = S().validateQuestion(q || readRow(tr));
    const bad = errs.length > 0 && !tr.classList.contains('is-fresh');
    tr.classList.toggle('is-invalid', bad);
    tr.dataset.bad = errs.length ? '1' : '';
    const issue = tr.querySelector('.q-issue');
    if (issue) issue.replaceChildren(...(bad ? [ic('warn'), h('span', errTxt(errs))] : []));
    // long text is fine, just shown smaller in the game: a quiet, non-blocking note
    const ln = bad ? '' : longNote(q || readRow(tr));
    tr.classList.toggle('is-long', !!ln);
    const note = tr.querySelector('.q-note');
    if (note) note.replaceChildren(...(ln ? [ic('info'), h('span', ln)] : []));
    const flag = tr.querySelector('.q-flag'); if (flag) flag.title = bad ? errTxt(errs) : '';
    // point at the exact cells that still need text
    tr.querySelectorAll('textarea.q-cell').forEach((ta) => ta.classList.toggle('is-miss', bad && ta.dataset.f !== 'source' && ta.dataset.f !== 'points' && !ta.value.trim()));
  }

  function scheduleSave(tr) {
    const id = tr.dataset.id;
    clearTimeout(Q.timers.get(id));
    markSaving();
    Q.timers.set(id, setTimeout(() => saveRow(tr), 380));
  }
  function saveRow(tr) {
    const id = tr.dataset.id;
    clearTimeout(Q.timers.get(id)); Q.timers.delete(id);
    const setId = tr.dataset.set || Q.setId;
    if (!S().getSet(setId) || pending.has(id)) return;
    const v = readRow(tr);
    S().updateQuestion(setId, id, v);
    flagRow(tr, v);
    markSaved();
    updateCounts();
  }
  function flushAllRows() {
    if (!Q.tbody) return;
    Q.timers.forEach((t, id) => { const tr = Q.tbody.querySelector(`tr[data-id="${CSS.escape(id)}"]`); if (tr) saveRow(tr); });
    Q.timers.clear();
  }

  /** Commit queued deletions (end of undo window, leaving the view, closing). */
  function commitDeletes() {
    pending.forEach((p, qid) => { clearTimeout(p.timer); S().deleteQuestion(p.setId, qid); p.tr.remove(); });
    const had = pending.size; pending.clear();
    if (had) { hideSnack(); updateCounts(); }        // the undo offer is gone with them
  }
  /** Leaving the questions view: save, commit deletions, drop rows that were never filled in. */
  function leaveQuestions() {
    flushAllRows();
    commitDeletes();
    if (Q.setId && S().getSet(Q.setId)) {
      const s = S().getSet(Q.setId);
      s.questions.filter((q) => !q.q && !q.correct && !q.source && !(q.wrong || []).some(Boolean)).forEach((q) => S().deleteQuestion(s.id, q.id));
    }
    Q.tbody = null;
  }

  function counts() {
    const s = S().getSet(Q.setId);
    const list = s ? s.questions.filter((q) => !pending.has(q.id)) : [];
    const ok = list.filter(valid).length;
    return { total: list.length, ok, bad: list.length - ok };
  }

  function updateCounts() {
    const r = Q.refs; if (!r.meta) return;
    const c = counts();
    put(r.meta,
      h('span.meta-chip', ic('layers'), qCount(c.total)),
      h('span.meta-chip.ok', h('i'), okShort(c.ok)),
      c.bad ? h('span.meta-chip.bad', h('i'), c.bad === 1 ? 'אחת דורשת תיקון' : `${nf(c.bad)} דורשות תיקון`) : null,
      h('span.meta-time', 'עודכן ' + ago((S().getSet(Q.setId) || {}).updatedAt)));
    if (r.badCount) r.badCount.textContent = c.bad ? nf(c.bad) : '';
    if (r.filterBad) r.filterBad.disabled = !c.bad && !Q.onlyBad;
    const item = r.setItems && r.setItems[Q.setId];
    if (item) item.querySelector('.set-count').textContent = nf(c.total);
    renumber();
    applyFilter();
  }

  function renumber() {
    if (!Q.tbody) return;
    let i = 0;
    Q.tbody.querySelectorAll('tr.q-row').forEach((tr) => { if (!pending.has(tr.dataset.id)) tr.querySelector('.q-num').textContent = String(++i); });
  }

  function applyFilter() {
    if (!Q.tbody) return;
    const needle = noMarks(Q.search.trim());
    let shown = 0, total = 0;
    Q.tbody.querySelectorAll('tr.q-row').forEach((tr) => {
      if (pending.has(tr.dataset.id)) { tr.hidden = true; return; }
      total++;
      let ok = true;
      if (needle) ok = noMarks(Array.from(tr.querySelectorAll('textarea'), (t) => t.value).join(' ')).includes(needle);
      if (ok && Q.onlyBad) ok = tr.dataset.bad === '1' || tr.contains(document.activeElement);
      tr.hidden = !ok; if (ok) shown++;
    });
    const r = Q.refs;
    if (r.empty) r.empty.hidden = total > 0;
    if (r.nores) r.nores.hidden = !(total > 0 && shown === 0);
    if (r.tableWrap) r.tableWrap.classList.toggle('is-empty', total === 0);
    if (r.found) r.found.textContent = needle || Q.onlyBad ? `${nf(shown)} מתוך ${nf(total)}` : '';
  }

  function afterRowsMounted() {
    if (!autosize || !Q.tbody) return;
    requestAnimationFrame(() => Q.tbody && Q.tbody.querySelectorAll('textarea.q-cell').forEach(fit));
  }

  function selectSet(id) {
    if (id === Q.setId) return;
    leaveQuestions();
    selSetId = id;
    setTab('questions', { keepScroll: true, force: true });
  }

  function renderQuestions() {
    const sets = S().getSets();
    if (!selSetId || !S().getSet(selSetId)) selSetId = S().activeSetId();
    const set = S().getSet(selSetId);
    Q.setId = set.id; Q.refs = { setItems: {} };
    const activeId = S().activeSetId();
    const r = Q.refs;

    // --- sidebar: list of sets ---
    const list = h('div.set-list', { role: 'tablist', 'aria-label': 'אוספי שאלות' }, sets.map((s, i) => {
      const it = h('button.set-item' + (s.id === set.id ? '.is-sel' : ''), { type: 'button', role: 'tab', 'aria-selected': String(s.id === set.id), onclick: () => selectSet(s.id) },
        h('span.set-gem', { style: { '--c': EMBLEM[i % EMBLEM.length] } }),
        h('span.set-txt', h('span.set-name', s.name), h('span.set-sub', s.id === activeId ? h('span.set-live', h('i'), 'פעיל במשחק') : 'עודכן ' + ago(s.updatedAt))),
        h('span.set-count', nf(s.questions.length)));
      r.setItems[s.id] = it;
      return it;
    }));
    const side = h('aside.set-side',
      h('div.set-side-head', h('h2', 'אוספי שאלות'), h('span.set-side-n', nf(sets.length))),
      list,
      h('button.set-new', { type: 'button', onclick: newSet }, ic('plus'), 'אוסף חדש'),
      h('p.set-side-tip', 'אוסף לכל תחרות או רמה. האוסף הפעיל הוא זה שמשמש את המשחק.'));

    // --- set header ---
    const isActive = set.id === activeId;
    r.meta = h('div.sh-meta');
    const head = h('div.set-head',
      h('div.sh-main',
        h('div.sh-title-row',
          h('h1.sh-title', set.name),
          btn('', { kind: 'ghost', size: 'sm', icon: 'edit', title: 'שינוי שם', onclick: renameSet }),
          isActive ? h('span.live-badge', h('i'), 'האוסף הפעיל במשחק')
            : btn('הפעלה במשחק', { kind: 'soft', size: 'sm', icon: 'play', onclick: activateSet })),
        r.meta),
      h('div.sh-actions',
        btn('שכפול', { kind: 'ghost', icon: 'copy', onclick: dupSet }),
        btn('ייצוא JSON', { kind: 'ghost', icon: 'download', onclick: exportSet }),
        btn('מחיקה', { kind: 'ghost-danger', icon: 'trash', onclick: deleteSet, disabled: sets.length <= 1, title: sets.length <= 1 ? 'לא ניתן למחוק את האוסף האחרון' : 'מחיקת האוסף' })));

    // --- toolbar ---
    const search = h('input.a-input.q-search-in', { type: 'search', placeholder: 'חיפוש בשאלות, בתשובות ובמקורות…', value: Q.search, dir: 'rtl', 'aria-label': 'חיפוש' });
    search.addEventListener('input', () => { flushRest(); Q.search = search.value; applyFilter(); });
    r.badCount = h('span.seg-count');
    r.filterBad = h('button.chip-toggle' + (Q.onlyBad ? '.is-on' : ''), { type: 'button', 'aria-pressed': String(Q.onlyBad),
      onclick: () => { Q.onlyBad = !Q.onlyBad; r.filterBad.classList.toggle('is-on', Q.onlyBad); r.filterBad.setAttribute('aria-pressed', String(Q.onlyBad)); applyFilter(); } },
    ic('warn'), 'דורשות תיקון', r.badCount);
    r.found = h('span.q-found');
    const toolbar = h('div.q-toolbar',
      h('label.q-search', ic('search'), search),
      r.filterBad, r.found, h('span.q-spacer'),
      btn('הוספת שאלה', { kind: 'primary', icon: 'plus', onclick: () => addRow() }));

    // --- table ---
    const tbody = h('tbody');
    Q.tbody = tbody;
    tbody.dataset.set = set.id;
    const all = set.questions.slice();
    all.slice(0, FIRST_ROWS).forEach((q, i) => tbody.append(rowEl(q, i)));
    Q.rest = null;
    if (all.length > FIRST_ROWS) renderRest(tbody, all, FIRST_ROWS);
    const thead = h('thead', h('tr', h('th.c-num', '#'), FIELDS.map(({ label, cls }) => h('th.' + cls, cls === 'c-ok' || cls === 'c-bad' ? h('i.dot') : null, label)), h('th.c-act', h('span.sr', 'פעולות'))));
    const colgroup = h('colgroup', h('col.w-num'), h('col.w-q'), h('col.w-a'), h('col.w-a'), h('col.w-a'), h('col.w-a'), h('col.w-src'), h('col.w-pts'), h('col.w-act'));
    const table = h('table.qt', colgroup, thead, tbody);
    bindTable(tbody);

    r.empty = h('div.q-empty', h('div.q-empty-art', { html: I.book }), h('h3', 'האוסף עדיין ריק'),
      h('p', 'הוסיפו שאלה ראשונה, או טענו קובץ Excel עם הרבה שאלות בבת אחת.'),
      h('div.q-empty-acts', btn('הוספת שאלה', { kind: 'primary', icon: 'plus', onclick: () => addRow() }), btn('ייבוא מקובץ', { icon: 'upload', onclick: () => setTab('import') })));
    r.nores = h('div.q-nores', ic('search'), h('span', 'לא נמצאו שאלות מתאימות'), btn('ניקוי החיפוש', { kind: 'link', onclick: () => { Q.search = ''; search.value = ''; Q.onlyBad = false; r.filterBad.classList.remove('is-on'); applyFilter(); } }));
    r.tableWrap = h('div.qt-card', table, r.empty, r.nores, h('button.qt-add', { type: 'button', onclick: () => addRow() }, ic('plus'), 'שאלה חדשה'));

    updateCounts();
    const tip = h('p.q-tip', ic('info'), h('span', h('kbd', 'Enter'), ' עובר לשורה הבאה · ', h('kbd', 'Tab'), ' לתא הבא · אפשר להדביק כמה שורות ועמודות ישירות מ־Excel',
      S().getSettings().stripCantillation ? ' · ניקוד נשמר, טעמים מוסרים בהדבקה' : ''));
    return h('section.adm-page.is-wide', h('div.qs', side, h('div.qs-main', head, toolbar, r.tableWrap, tip)));
  }

  /** Big sets: the first screenful renders at once, the rest streams in small batches (keeps the tab switch instant). */
  function renderRest(tbody, list, from) {
    let i = from;
    const step = (sync) => {
      if (Q.tbody !== tbody) { Q.rest = null; return; }
      const frag = document.createDocumentFragment();
      const end = sync ? list.length : Math.min(list.length, i + ROW_BATCH);
      for (; i < end; i++) if (!pending.has(list[i].id)) frag.append(rowEl(list[i], i));
      tbody.append(frag);
      if (Q.search || Q.onlyBad) applyFilter();
      if (i < list.length) setTimeout(step, 24);
      else { Q.rest = null; afterRowsMounted(); }
    };
    Q.rest = step;
    setTimeout(step, 60);
  }
  const flushRest = () => { if (Q.rest) Q.rest(true); };

  function bindTable(tbody) {
    tbody.addEventListener('input', (e) => {
      const ta = e.target; if (!ta.classList || !ta.classList.contains('q-cell')) return;
      fit(ta);
      const tr = ta.closest('tr'); scheduleSave(tr);
    });
    tbody.addEventListener('paste', onPaste);
    tbody.addEventListener('keydown', (e) => {
      const ta = e.target; if (!ta.classList || !ta.classList.contains('q-cell')) return;
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        let tr = ta.closest('tr').nextElementSibling;
        while (tr && tr.hidden) tr = tr.nextElementSibling;
        const next = tr && tr.querySelector(`textarea[data-f="${ta.dataset.f}"]`);
        if (next) { next.focus(); next.select(); } else ta.blur();
      }
    });
    tbody.addEventListener('focusout', (e) => {
      const tr = e.target.closest && e.target.closest('tr.q-row'); if (!tr) return;
      if (e.relatedTarget && tr.contains(e.relatedTarget)) return;
      if (Q.timers.has(tr.dataset.id)) saveRow(tr);
      tr.classList.remove('is-fresh');
      // show the cleaned value that was stored
      const s = S().getSet(Q.setId), q = s && s.questions.find((x) => x.id === tr.dataset.id);
      if (q) tr.querySelectorAll('textarea.q-cell').forEach((ta) => { const v = getF(q, ta.dataset.f); if (ta.value !== v) { ta.value = v; fit(ta); } });
      flagRow(tr);
      updateCounts();
    });
    tbody.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('.q-del'); if (b) deleteRow(b.closest('tr'));
    });
  }

  /** Paste: clean bidi marks/cantillation (nikud kept). Tab-separated text (copied from Excel) fills several cells. */
  function onPaste(e) {
    const ta = e.target; if (!ta.classList || !ta.classList.contains('q-cell')) return;
    const text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text == null || text === '') return;
    e.preventDefault();
    const strip = !!S().getSettings().stripCantillation;
    const clean = (s) => U.cleanHebrew(s, { stripCantillation: strip });
    if (!text.includes('\t')) { insertText(ta, clean(text)); return; }

    const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n').map((l) => l.split('\t'));
    const start = FIELDS.findIndex((x) => x.f === ta.dataset.f);
    const tr = ta.closest('tr');
    lines[0].forEach((cell, j) => {
      const fd = FIELDS[start + j]; if (!fd) return;
      const t = tr.querySelector(`textarea[data-f="${fd.f}"]`); t.value = clean(cell); fit(t);
    });
    saveRow(tr);
    const extra = lines.slice(1).map((cells) => {
      const raw = { wrong: ['', '', ''] };
      cells.forEach((cell, j) => {
        const fd = FIELDS[start + j]; if (!fd) return;
        if (fd.f[0] === 'w') raw.wrong[+fd.f[1]] = cell; else raw[fd.f] = cell;
      });
      return raw;
    }).filter((raw) => [raw.q, raw.correct, raw.source, ...raw.wrong].some((x) => String(x || '').trim()));
    if (extra.length) {
      flushRest();
      const s = S().getSet(Q.setId), before = s.questions.length;
      S().appendQuestions(Q.setId, extra);
      s.questions.slice(before).forEach((q, i) => { const row = rowEl(q, before + i); Q.tbody.append(row); motion(row, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: i * 30 }); });
      afterRowsMounted();
      toast(`הודבקו ${nf(extra.length + 1)} שורות מהגיליון`, 'ok');
    }
    markSaved(); updateCounts();
  }

  function insertText(ta, s) {
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, s); } catch (e) { ok = false; }
    if (!ok) {
      ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  function addRow() {
    if (!Q.tbody) return;
    flushRest();
    if (Q.search || Q.onlyBad) {
      Q.search = ''; Q.onlyBad = false;
      const si = root.querySelector('.q-search-in'); if (si) si.value = '';
      Q.refs.filterBad && Q.refs.filterBad.classList.remove('is-on');
    }
    const q = S().addQuestion(Q.setId, {});
    const tr = rowEl(q, counts().total - 1);
    tr.classList.add('is-fresh');
    Q.tbody.append(tr);
    updateCounts();
    afterRowsMounted();
    motion(tr, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 380 });
    tr.querySelectorAll('td').forEach((td) => motion(td, [{ boxShadow: 'inset 0 0 0 999px rgba(42,111,214,.10)' }, { boxShadow: 'inset 0 0 0 999px rgba(42,111,214,0)' }], { duration: 1400, easing: 'ease-out' }));
    tr.scrollIntoView({ block: 'center', behavior: U.reduced ? 'auto' : 'smooth' });
    const first = tr.querySelector('textarea');
    first && first.focus({ preventScroll: true });
    markSaved();
  }

  function deleteRow(tr) {
    commitDeletes();                                 // one level of undo
    const id = tr.dataset.id, setId = Q.setId;
    clearTimeout(Q.timers.get(id)); Q.timers.delete(id);
    const s = S().getSet(setId), q = s && s.questions.find((x) => x.id === id);
    const v = readRow(tr);
    if (q) S().updateQuestion(setId, id, v);
    const empty = !v.q && !v.correct && !v.source && !v.wrong.some(Boolean);
    const out = motion(tr, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-28px)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
    const finish = () => {
      if (empty) { S().deleteQuestion(setId, id); tr.remove(); updateCounts(); return; }
      pending.set(id, { setId, tr, timer: setTimeout(commitDeletes, 6500) });
      updateCounts();
      snack(v.q ? `השאלה «${clip(v.q, 32)}» נמחקה` : 'השאלה נמחקה', () => undoDelete(id), 6500);
    };
    out ? out.finished.then(finish, finish) : finish();
  }

  function undoDelete(id) {
    const p = pending.get(id); if (!p) return;
    clearTimeout(p.timer); pending.delete(id);
    p.tr.getAnimations().forEach((a) => a.cancel());
    updateCounts();
    motion(p.tr, [{ opacity: 0, transform: 'translateX(-20px)' }, { opacity: 1, transform: 'none' }], { duration: 360 });
    toast('השאלה שוחזרה', 'ok');
  }

  // ---- set actions ----
  async function newSet() {
    const name = await ui('prompt', 'אוסף שאלות חדש', '', { ok: 'יצירה', placeholder: 'לדוגמה: רמה 3 · גמר מחוזי' });
    if (!name) return;
    leaveQuestions();
    const s = S().createSet(name);
    selSetId = s.id; markSaved();
    setTab('questions', { keepScroll: true, force: true });
    toast(s.name === name ? `האוסף «${s.name}» נוצר` : `כבר יש אוסף בשם «${name}» — נוצר «${s.name}»`, 'ok');
  }
  async function renameSet() {
    const s = S().getSet(Q.setId); if (!s) return;
    const name = await ui('prompt', 'שינוי שם האוסף', s.name, { ok: 'שמירה' });
    if (!name || name === s.name) return;
    const got = S().renameSet(s.id, name) || (S().getSet(s.id) || {}).name; markSaved();
    setTab('questions', { keepScroll: true, force: true });
    if (got && got !== name) toast(`כבר יש אוסף בשם «${name}» — השם נקבע ל־«${got}»`);
  }
  function dupSet() {
    leaveQuestions();
    const c = S().duplicateSet(Q.setId); if (!c) return;
    selSetId = c.id; markSaved();
    setTab('questions', { keepScroll: true, force: true });
    toast(`נוצר עותק: «${c.name}»`, 'ok');
  }
  async function deleteSet() {
    const s = S().getSet(Q.setId); if (!s || S().getSets().length <= 1) return;
    const ok = await ui('confirm', `מחיקת האוסף «${s.name}»`,
      (s.questions.length ? (s.questions.length === 1 ? 'שאלה אחת תימחק לצמיתות. ' : `${nf(s.questions.length)} שאלות יימחקו לצמיתות. `) : 'האוסף ריק. ') + (s.id === S().activeSetId() ? 'זה האוסף הפעיל — אוסף אחר יופעל במקומו. ' : '') + (s.questions.length ? 'מומלץ לייצא קודם לקובץ JSON.' : ''),
      { ok: 'מחיקת האוסף', danger: true });
    if (!ok) return;
    leaveQuestions();
    S().deleteSet(s.id);
    selSetId = S().activeSetId(); markSaved();
    setTab('questions', { keepScroll: true, force: true });
    toast(`האוסף «${s.name}» נמחק`);
  }
  function activateSet() {
    flushAllRows();
    S().setActive(Q.setId); markSaved();
    setTab('questions', { keepScroll: true, force: true });
    const s = S().getSet(Q.setId);
    toast(`«${s.name}» הוא עכשיו האוסף הפעיל במשחק`, 'ok');
  }
  function exportSet() {
    flushAllRows(); commitDeletes();
    const data = S().exportSet(Q.setId); if (!data) return;
    U.download(fileSafe(data.name) + '.json', JSON.stringify(data, null, 2), 'application/json');
    const n = data.questions.length;
    toast(n === 1 ? 'יוצאה שאלה אחת לקובץ JSON' : `יוצאו ${nf(n)} שאלות לקובץ JSON`, 'ok');
  }

  // ======================================================================
  // Import: parsing (pure) — xlsx / xls / ods / csv (utf-8 or windows-1255) / json
  // ======================================================================
  /** Header text → field key ('q' | 'correct' | 'source' | 'points' | {w: digit|null}) or null.
   *  Patterns are anchored and the cell must be short, so a real question row is never mistaken for a header. */
  function headerKey(raw) {
    const s = String(raw == null ? '' : raw).replace(/[֑-ׇ‎‏﻿]/g, '')
      .replace(/[״"'׳`]/g, '').replace(/[\s_\-–—:.,()[\]#*]+/g, ' ').trim().toLowerCase();
    if (!s || s.length > 32) return null;
    const c = s.replace(/ /g, '');
    const words = s.split(' ').length;
    const d = (s.match(/[1-3]/) || [])[0] || null;
    // negation first: 'תשובה לא נכונה 2', 'אינה נכונה', 'שגויה', 'מסיח', 'incorrect' are wrong answers, never the correct one
    if (/(לא|אינה|אינו|אין)נכונ|שגוי|מסיח|wrong|incorrect|distractor|false/.test(c)) return { w: d };
    // 'תשובה א׳ / ב׳ / ג׳ / ד׳' (or 1–4, a–d): the first one is the correct answer
    const m = c.match(/^(?:ה?תשובה|answer|option)([אבגד]|[1-4]|[a-d])$/);
    if (m) {
      const i = 'אבגד'.includes(m[1]) ? 'אבגד'.indexOf(m[1]) : /\d/.test(m[1]) ? +m[1] - 1 : 'abcd'.indexOf(m[1]);
      return i === 0 ? 'correct' : { w: String(i) };
    }
    if (/^(ה?תשובה)?ה?נכונה$|^ה?תשובה$|^(the)?correct(answer)?$|^(right)?answer$|^ans$/.test(c)) return 'correct';
    if (/^(ה?שאלה|ה?שאלות|טקסטה?שאלה|נוסחה?שאלה|question(text)?|q)\d*$/.test(c) || (/^ה?שאלה /.test(s) && words <= 3)) return 'q';
    if (/^(ה?מקור|מקורות|מראהמקום|ה?פסוק|source|ref|reference)/.test(c) && words <= 4) return 'source';
    if (/^(ה?נקודות|ה?ניקוד|points?|score|pts)/.test(c) && words <= 3) return 'points';
    return null;
  }

  /** Column keys for a header row (first q/correct/source wins; wrong answers without digits fill free slots). */
  function mapColumns(keys) {
    const out = keys.map((k) => (typeof k === 'string' ? k : null));
    const seen = new Set();
    out.forEach((k, i) => { if (k) { if (seen.has(k)) out[i] = null; else seen.add(k); } });
    const used = new Set();
    keys.forEach((k, i) => { if (k && typeof k === 'object' && k.w && !used.has(+k.w - 1)) { used.add(+k.w - 1); out[i] = 'w' + (+k.w - 1); } });
    keys.forEach((k, i) => {
      if (!k || typeof k !== 'object' || out[i]) return;
      const slot = [0, 1, 2].find((x) => !used.has(x));
      if (slot != null) { used.add(slot); out[i] = 'w' + slot; }
    });
    return out;
  }

  const POS = ['q', 'correct', 'w0', 'w1', 'w2', 'source', 'points'];
  /** Array-of-arrays (sheet) → raw question objects. */
  function rowsFromAoa(aoa) {
    const rows = aoa.filter((r) => Array.isArray(r) && r.some((c) => String(c == null ? '' : c).trim()));
    if (!rows.length) return [];
    let cols = null, start = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const keys = rows[i].map(headerKey);
      const hits = keys.filter(Boolean);
      const filled = rows[i].filter((c) => String(c == null ? '' : c).trim()).length;
      const kinds = new Set(hits.map((k) => (typeof k === 'object' ? 'w' : k)));
      // a header row is mostly recognised labels, and names the question (or both answer kinds)
      if (hits.length >= 2 && hits.length >= filled / 2 && (kinds.has('q') || (kinds.has('correct') && kinds.has('w')))) { cols = mapColumns(keys); start = i + 1; break; }
    }
    if (!cols) {
      // No header: by position. Skip a leading running-number column if there is one.
      const numFirst = rows.filter((r) => /^\s*\d{1,5}\s*$/.test(String(r[0] == null ? '' : r[0]))).length > rows.length * 0.6 && rows.some((r) => r.length >= 7);
      cols = numFirst ? [null, ...POS] : POS.slice();
    }
    return rows.slice(start).map((r) => {
      const raw = { q: '', correct: '', wrong: ['', '', ''], source: '', points: '' };
      cols.forEach((k, i) => {
        if (!k) return;
        const v = String(r[i] == null ? '' : r[i]);
        if (k[0] === 'w') raw.wrong[+k[1]] = v; else raw[k] = v;
      });
      return raw;
    }).filter((raw) => [raw.q, raw.correct, raw.source, ...raw.wrong].some((x) => x.trim()));
  }

  /** JSON object → raw question (export format, english keys or Hebrew column names). */
  function rawFromObject(o) {
    if (Array.isArray(o)) return rowsFromAoa([o])[0] || null;
    if (!o || typeof o !== 'object') return null;
    const raw = { q: '', correct: '', wrong: ['', '', ''], source: '', points: o.points != null ? String(o.points) : '' };
    const keys = Object.keys(o);
    if (Array.isArray(o.wrong)) o.wrong.slice(0, 3).forEach((w, i) => { raw.wrong[i] = String(w == null ? '' : w); });
    const cols = mapColumns(keys.map((k) => (k === 'wrong' && Array.isArray(o.wrong) ? null : headerKey(k))));
    keys.forEach((k, i) => {
      const f = cols[i]; if (!f) return;
      const v = o[k] == null ? '' : typeof o[k] === 'object' ? '' : String(o[k]);
      if (f[0] === 'w') raw.wrong[+f[1]] = v; else raw[f] = v;
    });
    return [raw.q, raw.correct, raw.source, ...raw.wrong].some((x) => x.trim()) ? raw : null;
  }

  function parseJsonText(text) {
    let data;
    try { data = JSON.parse(text.replace(/^\ufeff/, '')); } catch (e) { throw new Error('הקובץ אינו JSON תקין.'); }
    let name = null, list = null;
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.questions)) { list = data.questions; name = data.name || null; }
    else if (data && typeof data === 'object') { const k = Object.keys(data).find((x) => Array.isArray(data[x])); if (k) { list = data[k]; name = k; } }
    if (!list) throw new Error('לא נמצאה רשימת שאלות בקובץ ה־JSON.');
    const rows = list.every(Array.isArray) ? rowsFromAoa(list) : list.map(rawFromObject).filter(Boolean);
    return { name, sheets: [{ name: name || 'שאלות', rows }] };
  }

  /** Bytes → text: UTF-16 (Excel 'Unicode Text'), UTF-8 (with or without BOM), else Hebrew Windows (windows-1255). */
  function decodeText(buf) {
    const b = new Uint8Array(buf);
    const dec = (enc, from) => new TextDecoder(enc).decode(b.subarray(from));
    if (b[0] === 0xff && b[1] === 0xfe) return dec('utf-16le', 2);
    if (b[0] === 0xfe && b[1] === 0xff) return dec('utf-16be', 2);
    if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return dec('utf-8', 3);
    // UTF-16 without a BOM: ASCII (tabs, digits, newlines) leaves a zero in every other byte
    const n = Math.min(b.length, 1024);
    let z0 = 0, z1 = 0;
    for (let i = 0; i < n; i++) if (!b[i]) (i % 2 ? z1++ : z0++);
    if (z1 >= 4 && z0 <= z1 / 16) return dec('utf-16le', 0);       // UTF-8 and windows-1255 text never contain NUL bytes
    if (z0 >= 4 && z1 <= z0 / 16) return dec('utf-16be', 0);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch (e) { /* not utf-8 */ }
    try { return new TextDecoder('windows-1255').decode(b); } catch (e) { return new TextDecoder('utf-8').decode(b); }
  }

  /** File → { name, kind, sheets:[{name, rows:[raw]}] } */
  async function parseFile(file) {
    const fname = String(file.name || 'questions');
    const ext = ((fname.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    const base = fname.replace(/\.[a-z0-9]+$/i, '');
    const buf = await file.arrayBuffer();
    if (ext === 'json') {
      const r = parseJsonText(decodeText(buf));
      return { name: r.name || base, kind: 'json', sheets: r.sheets };
    }
    if (!['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'txt', 'tsv'].includes(ext)) throw new Error('סוג קובץ לא נתמך. אפשר לטעון \u200e.xlsx, \u200e.xls, \u200e.csv או \u200e.json');
    if (!window.XLSX) throw new Error('רכיב הקריאה של Excel לא נטען. אפשר לטעון קובץ JSON.');
    const text = ['csv', 'txt', 'tsv'].includes(ext);
    const CORRUPT = 'הקובץ פגום או שאינו קובץ Excel. פתחו אותו ב־Excel, שמרו שוב ונסו שנית.';
    if (!text) {
      // A spreadsheet is a zip (xlsx/xlsm/ods: "PK") or an OLE container (Excel 97–2003 .xls: D0 CF 11 E0).
      // Anything else (a renamed web page, a broken download) would otherwise be read as one line of text.
      const b = new Uint8Array(buf, 0, Math.min(8, buf.byteLength));
      const zip = b[0] === 0x50 && b[1] === 0x4b;
      const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
      if (!(zip || (ole && ext !== 'ods'))) throw new Error(CORRUPT);
    }
    let wb;
    try {
      wb = text ? XLSX.read(decodeText(buf).replace(/^\ufeff/, ''), { type: 'string', raw: true }) : XLSX.read(buf, { type: 'array' });
    } catch (e) {
      console.warn(e);
      if (/password/i.test(String(e && e.message))) throw new Error('הקובץ מוגן בסיסמה. הסירו את הסיסמה ב־Excel, שמרו ונסו שנית.');
      throw new Error(text ? 'לא ניתן לקרוא את הקובץ. ודאו שהוא קובץ CSV תקין.' : CORRUPT);
    }
    const sheets = wb.SheetNames.map((n) => ({ name: n, rows: rowsFromAoa(XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: '', blankrows: false })) }))
      .filter((s) => s.rows.length);
    return { name: base, kind: text ? 'csv' : 'xlsx', sheets };
  }

  // ---- templates ----
  const templateAoa = () => [[...HEAD, 'נקודות (רשות)'], ...S().DEMO_QUESTIONS.map((q) => [q.q, q.correct, ...q.wrong, q.source, ''])];
  function downloadXlsxTemplate() {
    if (!window.XLSX) { toast('רכיב Excel לא זמין', 'err'); return; }
    const ws = XLSX.utils.aoa_to_sheet(templateAoa());
    ws['!cols'] = [{ wch: 62 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 12 }];
    ws['!autofilter'] = { ref: 'A1:G1' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'שאלות');
    wb.Workbook = { Views: [{ RTL: true }] };
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    U.download('תבנית-שאלות.xlsx', new Blob([buf], { type: XLSX_MIME }));
    toast('תבנית ה־Excel הורדה', 'ok');
  }
  function downloadCsvTemplate() {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '\ufeff' + templateAoa().map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
    U.download('תבנית-שאלות.csv', csv, 'text/csv;charset=utf-8');
    toast('תבנית ה־CSV הורדה', 'ok');
  }

  // ======================================================================
  // Import: UI
  // ======================================================================
  const IM = { state: 'idle', file: null, sheets: [], sheet: 0, rows: [], target: 'add', setId: null, newName: '', skipDups: true, result: null, error: null, host: null };

  function handleFile(file) {
    if (!file) return;
    IM.state = 'parsing'; IM.error = null; IM.file = { name: file.name, size: file.size };
    paintWorkspace();
    const t0 = performance.now();
    parseFile(file).then(async (res) => {
      const wait = 450 - (performance.now() - t0); if (wait > 0) await U.sleep(wait);    // let the parse animation read
      if (!res.sheets.length) throw new Error('לא נמצאו שאלות בקובץ. ודאו שהעמודות לפי התבנית: ' + HEAD.join(' · '));
      Object.assign(IM, { state: 'preview', kind: res.kind, sheets: res.sheets, sheet: 0, newName: res.name, target: 'add', skipDups: true });
      IM.setId = selSetId && S().getSet(selSetId) ? selSetId : S().activeSetId();     // default: the set selected in "אוספי שאלות"
      if (IM.setId === S().DEMO_SET_ID) IM.target = 'new';                             // keep the demo set clean: a client's file gets its own set
      buildPreviewRows();
      paintWorkspace();
    }).catch((e) => {
      console.warn(e);
      IM.state = 'error'; IM.error = e && e.message ? e.message : 'שגיאה בקריאת הקובץ';
      paintWorkspace();
    });
  }

  function buildPreviewRows() {
    const sh = IM.sheets[IM.sheet] || { rows: [] };
    IM.rows = sh.rows.map((raw) => { const q = S().normalizeQuestion(raw, { newId: true }); const errs = S().validateQuestion(q); return { q, errs, long: errs.length ? '' : longNote(q) }; });
  }
  /** Mark valid rows that already exist in the target set ('set') or earlier in the file ('file'). */
  function markDups() {
    const tset = IM.target === 'add' ? S().getSet(IM.setId) : null;      // 'replace' and 'new' start from an empty set
    const inSet = new Set(tset ? tset.questions.map(dupKey) : []);
    const seen = new Map();
    IM.rows.forEach((r, i) => {
      r.dup = null; r.dupOf = -1;
      if (r.errs.length) return;
      const k = dupKey(r.q);
      if (inSet.has(k)) r.dup = 'set';
      else if (seen.has(k)) { r.dup = 'file'; r.dupOf = seen.get(k); }
      else seen.set(k, i);
    });
  }

  /** What restoring the demo questions will do — nothing is deleted (the store keeps every non-demo question). */
  function restoreText() {
    const d = S().getSet(S().DEMO_SET_ID);
    if (!d) return 'האוסף «רמה 2 — הדגמה» ייווצר מחדש עם 4 שאלות ההדגמה ויהיה האוסף הפעיל במשחק. שאר האוספים לא ישתנו.';
    const extra = d.questions.filter((q) => !String(q.id).startsWith('demo-')).length;
    return `4 שאלות ההדגמה המקוריות יוחזרו לאוסף «${d.name}»: שאלה שנמחקה תתווסף מחדש, ושאלה שנערכה תחזור לנוסח המקורי. `
      + (extra === 1 ? 'השאלה האחרת שבאוסף תישאר כמו שהיא. ' : extra ? `${nf(extra)} השאלות האחרות שבאוסף יישארו כמו שהן. ` : '')
      + `אחרי השחזור «${d.name}» יהיה האוסף הפעיל במשחק.`;
  }

  function renderImport() {
    IM.host = h('div.im-work');
    if (IM.state === 'done' && IM.result && !S().getSet(IM.result.setId)) IM.state = 'idle';
    if (IM.state === 'parsing') IM.state = 'idle';
    paintWorkspace(true);

    const tpl = h('section.a-card.feat',
      h('div.feat-ic.xl', { html: I.sheet }),
      h('h3', 'תבנית מוכנה למילוי'),
      h('p', 'קובץ Excel עם כותרות העמודות ו־4 שאלות לדוגמה. ממלאים, שומרים וגוררים לכאן.'),
      h('div.feat-acts', btn('הורדת תבנית Excel', { kind: 'primary', icon: 'download', onclick: downloadXlsxTemplate }),
        btn('תבנית CSV', { kind: 'ghost', icon: 'file', onclick: downloadCsvTemplate })));

    const datamil = h('section.feat.feat-pro',
      h('span.pro-badge', ic('star'), 'בגרסה המלאה'),
      h('div.feat-ic.pro', { html: I.db }),
      h('h3', 'ייבוא אוטומטי מקובץ ', h('bdi.mono', { dir: 'ltr' }, 'DataMil.xml'), ' של המשחק הישן'),
      h('p', 'מאגר השאלות הקיים של משחק הפלאש יוסב אוטומטית בלחיצה אחת — בלי הקלדה מחדש ובלי העתק־הדבק.'),
      h('ul.pro-list', ['שאלות ותשובות', 'חלוקה לרמות', 'בדיקת תקינות'].map((t) => h('li', ic('check'), t))));

    const demoSetNow = S().getSet(S().DEMO_SET_ID);
    const demoName = demoSetNow ? demoSetNow.name : 'רמה 2 — הדגמה';
    const demo = h('section.a-card.feat',
      h('div.feat-ic.demo', { html: I.refresh }),
      h('h3', 'שחזור שאלות ההדגמה'),
      h('p', `מחזיר לאוסף «${demoName}» את 4 שאלות ההדגמה המקוריות ומגדיר אותו כפעיל. שאלות אחרות לא נמחקות.`),
      h('div.feat-acts', btn('שחזור שאלות ההדגמה', { icon: 'refresh', onclick: async () => {
        const ok = await ui('confirm', 'שחזור שאלות ההדגמה', restoreText(), { ok: 'שחזור' });
        if (!ok) return;
        const s = S().restoreDemo(); selSetId = s.id; markSaved();
        toast(`שאלות ההדגמה שוחזרו — «${s.name}» הוא האוסף הפעיל`, 'ok');
        if (IM.state === 'preview') paintWorkspace(true);            // the target list shows set sizes
      } })));

    return page('ייבוא שאלות', 'טענו קובץ Excel, CSV או JSON — כל שורה נבדקת ומוצגת לאישור לפני שהיא נשמרת.',
      IM.host, h('div.feat-grid', tpl, datamil, demo));
  }

  function paintWorkspace(noAnim) {
    const host = IM.host; if (!host) return;
    let view;
    if (IM.state === 'preview') view = previewView();
    else if (IM.state === 'done') view = doneView();
    else view = dropView();
    host.replaceChildren(view);
    if (!noAnim) motion(view, [{ opacity: 0, transform: 'translateY(8px) scale(.995)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
  }

  function dropView() {
    const input = h('input', { type: 'file', accept: '.xlsx,.xlsm,.xls,.ods,.csv,.tsv,.txt,.json', hidden: true });
    input.addEventListener('change', () => { const f = input.files && input.files[0]; input.value = ''; handleFile(f); });
    const parsing = IM.state === 'parsing';
    const err = IM.state === 'error';
    const dz = h('div.dz' + (parsing ? '.is-busy' : '') + (err ? '.is-error' : ''), { role: 'button', tabindex: '0', 'aria-label': 'בחירת קובץ שאלות לייבוא',
      onclick: () => !parsing && input.click(),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
    h('div.dz-art', { 'aria-hidden': 'true' },
      h('div.dz-file.f-json', h('b', 'JSON')), h('div.dz-file.f-csv', h('b', 'CSV')), h('div.dz-file.f-xlsx', h('b', 'XLSX')),
      h('div.dz-orb', { html: parsing ? '<span class="dz-spin"></span>' : err ? I.warn : I.upload })),
    parsing ? h('div.dz-title', 'קורא את ', IM.file ? fileLabel(IM.file.name) : 'הקובץ', '…')
      : err ? h('div.dz-title.err', ic('warn'), IM.error)
        : h('div.dz-title', 'גררו לכאן קובץ שאלות'),
    h('div.dz-sub', parsing ? 'בודק כל שורה ושורה' : err ? h('span', h('u', 'לחצו לבחירת קובץ אחר'), ' או גררו קובץ לכאן') : h('span', 'או ', h('u', 'לחצו לבחירת קובץ'), ' מהמחשב')),
    h('div.dz-formats', ['.xlsx', '.xls', '.csv', '.json'].map((x) => h('span', { dir: 'ltr' }, x))),
    h('div.dz-cols', h('span.dz-cols-lbl', 'סדר העמודות:'),
      HEAD.map((t, i) => h('span.col-chip' + (i === 1 ? '.ok' : i >= 2 && i <= 4 ? '.bad' : ''), t))),
    input);
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
    dz.addEventListener('dragleave', (e) => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('is-over'); });
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); e.__admHandled = true; dz.classList.remove('is-over');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; handleFile(f);
    });
    return dz;
  }

  function previewView() {
    markDups();
    const valid = IM.rows.filter((r) => !r.errs.length), bad = IM.rows.length - valid.length;
    const dups = valid.filter((r) => r.dup).length, fresh = valid.length - dups;
    const load = valid.filter((r) => !(r.dup && IM.skipDups));
    const sets = S().getSets();
    const kindIcon = IM.kind === 'json' ? 'braces' : 'sheet';
    const sheet = IM.sheets[IM.sheet];
    const defPts = S().getSettings().points;

    const head = h('div.pv-head',
      h('div.pv-file.k-' + (IM.kind || 'xlsx'), { html: I[kindIcon] }),
      h('div.pv-file-txt', h('div.pv-name', fileLabel(IM.file ? IM.file.name : '')),
        h('div.pv-meta', rowsTxt(IM.rows.length), IM.kind === 'xlsx' ? ` · גיליון «${sheet.name}»` : '', IM.file && IM.file.size ? ` · ${sizeTxt(IM.file.size)}` : '')),
      h('div.pv-sum',
        h('span.pill.ok', ic('check'), okShort(fresh)),
        dups ? h('span.pill.dup', { title: IM.skipDups ? 'שאלות שכבר קיימות לא ייטענו שוב' : 'גם השאלות הכפולות ייטענו' }, ic('copy'), dups === 1 ? 'כפולה אחת' : `${nf(dups)} כפולות`) : null,
        bad ? h('span.pill.bad', ic('warn'), bad === 1 ? 'אחת לא תיטען' : `${nf(bad)} לא ייטענו`) : null),
      btn('', { kind: 'ghost', icon: 'close', title: 'ביטול הייבוא', onclick: () => { IM.state = 'idle'; paintWorkspace(); } }));

    const sheetsBar = IM.sheets.length > 1 ? h('div.pv-sheets', h('span', 'גיליונות בקובץ:'),
      IM.sheets.map((s, i) => h('button.chip-toggle' + (i === IM.sheet ? '.is-on' : ''), { type: 'button', onclick: () => { IM.sheet = i; buildPreviewRows(); if (IM.target === 'new') IM.newName = s.name; paintWorkspace(true); } }, s.name, h('span.seg-count', nf(s.rows.length))))) : null;

    // target choice
    const setSel = () => {
      const sel = h('select.a-select', { 'aria-label': 'אוסף יעד', onchange: () => { IM.setId = sel.value; paintWorkspace(true); } },
        sets.map((s) => h('option', { value: s.id, selected: s.id === IM.setId ? true : null }, `${s.name} (${nf(s.questions.length)})`)));
      sel.addEventListener('click', (e) => e.stopPropagation());
      return sel;
    };
    const tset = S().getSet(IM.setId) || sets[0];
    const tn = tset.questions.length;
    const nameIn = h('input.a-input', { type: 'text', value: IM.newName, dir: 'rtl', 'aria-label': 'שם האוסף החדש', placeholder: 'שם האוסף החדש' });
    nameIn.addEventListener('input', () => { IM.newName = nameIn.value; });
    const pick = (key, refocus) => {
      if (IM.target === key) return;
      IM.target = key; paintWorkspace(true);
      if (refocus) { const el = IM.host && IM.host.querySelector(`.tgt[data-key="${key}"]`); el && el.focus({ preventScroll: true }); }
    };
    const opt = (key, icon, title, desc) => h('div.tgt' + (IM.target === key ? '.is-on' : ''), { role: 'radio', tabindex: '0', 'aria-checked': String(IM.target === key), dataset: { key },
      onclick: () => pick(key),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(key, true); } } },
    h('span.tgt-radio'), h('div.tgt-txt', h('div.tgt-title', title), h('div.tgt-desc', desc)), h('span.tgt-ic', { html: I[icon] || '' }));
    const target = h('div.pv-target', { role: 'radiogroup', 'aria-label': 'לאן לטעון' },
      opt('add', 'plus', 'הוספה לאוסף', !tn ? 'האוסף ריק כרגע' : tn === 1 ? 'אחרי השאלה הקיימת' : `אחרי ${nf(tn)} השאלות הקיימות`),
      opt('replace', 'refresh', 'החלפת השאלות באוסף', !tn ? 'האוסף ריק כרגע' : tn === 1 ? 'השאלה הקיימת תוחלף' : `${nf(tn)} השאלות הקיימות יוחלפו`),
      opt('new', 'layers', 'אוסף חדש', 'אוסף נפרד לתחרות או לרמה'));
    // one destination row under the cards: which set, or the new set's name
    const dest = h('label.pv-dest', h('span.pv-dest-lbl', ic(IM.target === 'new' ? 'edit' : 'layers'),
      IM.target === 'new' ? 'שם האוסף החדש:' : IM.target === 'replace' ? 'האוסף שבו יוחלפו השאלות:' : 'האוסף שאליו יתווספו השאלות:'),
    IM.target === 'new' ? nameIn : setSel());

    // table (a narrow points column only when the file has per-question points)
    const LIM = 300;
    const showPts = IM.rows.some((r) => r.q.points > 0);
    const tb = h('tbody', IM.rows.slice(0, LIM).map((r, i) => {
      const q = r.q, isBad = r.errs.length > 0, skip = r.dup && IM.skipDups;
      const dupTxt = r.dup === 'set' ? 'כבר קיימת באוסף' : r.dup === 'file' ? `כפולה בקובץ · כמו שורה ${nf(r.dupOf + 1)}` : '';
      const st = isBad ? h('span.st-dot.bad', { html: I.x, title: errTxt(r.errs) })
        : r.dup ? h('span.st-dot.dup', { html: I.copy, title: dupTxt + (skip ? ' — לא תיטען שוב' : '') })
          : h('span.st-dot.ok', { html: I.check, title: 'תקינה' });
      return h('tr' + (isBad ? '.is-bad' : '') + (skip ? '.is-dup' : ''),
        h('td.c-num', String(i + 1)),
        h('td.c-st', st),
        h('td.c-q', h('div.pv-q', q.q || '—'),
          isBad ? h('div.pv-err', errTxt(r.errs)) : null,
          r.dup ? h('div.pv-dup', ic('copy'), h('span', dupTxt)) : null,
          !isBad && r.long ? h('div.pv-note', ic('info'), h('span', r.long)) : null),
        h('td.c-ok', q.correct || '—'),
        q.wrong.map((w) => h('td.c-bad', w || '—')),
        h('td.c-src', q.source || '—'),
        showPts ? h('td.c-pts', q.points > 0 ? U.fmtScore(q.points) : h('span.pv-def', { title: 'ברירת המחדל מההגדרות' }, U.fmtScore(defPts))) : null);
    }));
    const table = h('div.pv-table', h('table.pv',
      h('colgroup', h('col.w-num'), h('col.w-st'), h('col.w-q'), h('col.w-a'), h('col.w-a'), h('col.w-a'), h('col.w-a'), h('col.w-src'), showPts ? h('col.w-pts') : null),
      h('thead', h('tr', h('th.c-num', '#'), h('th.c-st', h('span.sr', 'מצב')), HEAD.map((t, i) => h('th' + (i === 1 ? '.c-ok' : i >= 2 && i <= 4 ? '.c-bad' : ''), t)),
        showPts ? h('th.c-pts', 'נקודות') : null)),
      tb));
    const more = IM.rows.length > LIM ? h('div.pv-more', `מוצגות ${nf(LIM)} השורות הראשונות מתוך ${nf(IM.rows.length)}`) : null;

    const go = btn(load.length ? `טעינת ${qCount(load.length)}` : valid.length ? 'אין שאלות חדשות לטעינה' : 'אין שאלות תקינות לטעינה',
      { kind: 'primary', size: 'lg', icon: 'check', disabled: !load.length, onclick: () => commitImport(load.map((r) => r.q), valid.length - load.length) });
    const dupBox = dups ? h('label.pv-check', h('input', { type: 'checkbox', checked: IM.skipDups ? true : null, onchange: (e) => { IM.skipDups = e.target.checked; paintWorkspace(true); } }),
      h('span', dups === 1 ? 'דילוג על השאלה הכפולה' : `דילוג על ${nf(dups)} השאלות הכפולות`)) : null;
    const footMsg = bad ? h('span', ic('info'), bad === 1 ? 'שורה אחת עם שגיאה לא תיטען. אפשר לתקן אותה בקובץ ולטעון שוב.' : `${nf(bad)} שורות עם שגיאות לא ייטענו. אפשר לתקן אותן בקובץ ולטעון שוב.`)
      : dups && IM.skipDups ? h('span', ic('copy'), dups === 1 ? 'שאלה אחת כבר קיימת ולא תיטען שוב.' : `${nf(dups)} שאלות כבר קיימות ולא ייטענו שוב.`)
        : h('span', ic('check'), 'כל השורות תקינות ומוכנות לטעינה.');
    const foot = h('div.pv-foot', h('div.pv-foot-txt', footMsg), dupBox,
      btn('ביטול', { kind: 'ghost', onclick: () => { IM.state = 'idle'; paintWorkspace(); } }), go);

    return h('div.a-card.pv', head, sheetsBar, h('div.pv-section-lbl', 'לאן לטעון?'), target, dest, table, more, foot);
  }

  async function commitImport(list, skipped = 0) {
    let setId, name;
    if (IM.target === 'new') {
      const s = S().createSet((IM.newName || '').trim() || 'אוסף מיובא', list);
      setId = s.id; name = s.name;                       // the store may have added " (2)" to keep names unique
    } else {
      const s = S().getSet(IM.setId) || S().activeSet(); setId = s.id; name = s.name;
      if (IM.target === 'replace') {
        const n = s.questions.length, m = list.length;
        if (n) {
          const ok = await ui('confirm', `החלפת השאלות באוסף «${s.name}»`,
            (n === 1 ? 'השאלה הקיימת תימחק ותוחלף' : `${nf(n)} השאלות הקיימות יימחקו ויוחלפו`) + (m === 1 ? ' בשאלה אחת מהקובץ.' : ` ב־${nf(m)} השאלות מהקובץ.`),
            { ok: 'החלפה', danger: true });
          if (!ok) return;
        }
        S().replaceQuestions(setId, list);
      } else S().appendQuestions(setId, list);
    }
    selSetId = setId; markSaved();
    IM.result = { count: list.length, setId, name, mode: IM.target, skipped };
    IM.state = 'done';
    paintWorkspace();
    toast(loadedTxt(list.length), 'ok');
  }

  function doneView() {
    const r = IM.result, s = S().getSet(r.setId);
    const isActive = S().activeSetId() === r.setId;
    const actBtn = isActive ? h('span.live-badge', h('i'), 'האוסף הפעיל במשחק')
      : btn('הפיכה לאוסף הפעיל', { kind: 'primary', icon: 'play', onclick: () => { S().setActive(r.setId); markSaved(); toast(`«${s.name}» הוא עכשיו האוסף הפעיל`, 'ok'); paintWorkspace(true); } });
    return h('div.a-card.done',
      h('div.done-check', { html: '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="dc-ring" cx="60" cy="60" r="50"/><path class="dc-tick" d="M38 61l15 15 30-32"/></svg>' },
        h('span.done-burst'),
        h('span.done-gems', { 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) => h('i', { style: { '--a': `${(i / 14) * 360 + (i % 2) * 9}deg`, '--d': `${70 + (i % 3) * 16}px`, '--c': EMBLEM[i % EMBLEM.length], '--t': `${(i % 4) * 40}ms` } })))),
      h('h2.done-title', loadedTxt(r.count)),
      h('p.done-sub', r.mode === 'new' ? 'לאוסף חדש: ' : r.mode === 'replace' ? 'השאלות הוחלפו באוסף ' : 'נוספו לאוסף ', h('b', `«${s ? s.name : r.name}»`),
        s ? ` · סה״כ ${qCount(s.questions.length)} באוסף` : '',
        r.skipped ? (r.skipped === 1 ? ' · שאלה כפולה אחת לא נטענה שוב' : ` · ${nf(r.skipped)} שאלות כפולות לא נטענו שוב`) : ''),
      h('div.done-acts', actBtn,
        btn('מעבר לעריכת השאלות', { icon: 'edit', onclick: () => { selSetId = r.setId; setTab('questions'); } }),
        btn('ייבוא קובץ נוסף', { kind: 'ghost', icon: 'upload', onclick: () => { IM.state = 'idle'; paintWorkspace(); } })));
  }

  CH.admin = { open, close, isOpen, importer: { parseFile, rowsFromAoa, parseJsonText, headerKey } };
})(window.CH = window.CH || {});
