/* 00-util.js — tiny shared helpers. Everything hangs off window.CH. */
(function (CH) {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** h('div.cls#id', {attrs}, ...children) — tiny hyperscript. Strings are text, not HTML. */
  function h(tag, attrs, ...children) {
    const m = String(tag).match(/^([a-z0-9-]+)?((?:[.#][^.#]+)*)$/i);
    const el = document.createElement((m && m[1]) || 'div');
    if (m && m[2]) m[2].replace(/([.#])([^.#]+)/g, (_, t, v) => { t === '.' ? el.classList.add(v) : (el.id = v); });
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = null; }
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  /** Fisher–Yates shuffle (returns a new array). */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Safe localStorage — every access in try/catch, falls back to memory. */
  const mem = new Map();
  const LS = {
    ok: (() => { try { const k = '__ch_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })(),
    get(key, fallback) {
      try { const v = localStorage.getItem(key); if (v != null) return JSON.parse(v); } catch (e) { /* ignore */ }
      return mem.has(key) ? mem.get(key) : fallback;
    },
    set(key, value) {
      mem.set(key, value);
      try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove(key) { mem.delete(key); try { localStorage.removeItem(key); } catch (e) { /* ignore */ } },
  };

  /** Event bus */
  const listeners = {};
  const bus = {
    on(ev, fn) { (listeners[ev] = listeners[ev] || new Set()).add(fn); return () => bus.off(ev, fn); },
    off(ev, fn) { listeners[ev] && listeners[ev].delete(fn); },
    emit(ev, data) { (listeners[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } }); },
  };

  /** Typographic polish for UI strings (titles): ASCII " and ' between Hebrew letters -> gershayim/geresh.
   *  Never applied to question/answer/source text (those are shown exactly as entered). */
  function typo(s) {
    return String(s ?? '')
      .replace(/([א-ת])"(?=[א-ת])/g, '$1״')
      .replace(/([א-ת])'(?=\s|$|[,.)\-–])/g, '$1׳')
      .replace(/ - /g, ' – ');
  }

  /** Clean text pasted from Tanakh software / Excel: drop invisible bidi controls & BOM, unify spaces.
   *  Optionally remove cantillation (te'amim, U+0591–U+05AF) and paseq while keeping nikud, meteg, maqaf, sof pasuq.
   *  No Unicode normalization on purpose: NFC/NFD can reorder Hebrew marks. */
  function cleanHebrew(s, opts = {}) {
    let t = String(s ?? '');
    t = t.replace(/[‎‏‪-‮⁦-⁩﻿­]/g, '');
    t = t.replace(/[  -​  　\t\r\n]+/g, ' ');
    if (opts.stripCantillation) t = t.replace(/[\u0591-\u05AF\u05BD\u05C0]/g, '');
    return t.replace(/ {2,}/g, ' ').trim();
  }

  /** WAAPI helper → Promise. Respects reduced motion by shortening. */
  const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  function animate(el, keyframes, opts) {
    if (!el || !el.animate) return Promise.resolve();
    const o = typeof opts === 'number' ? { duration: opts } : { ...opts };
    if (reduced) o.duration = Math.min(o.duration || 0, 120);
    const a = el.animate(keyframes, { fill: 'both', ...o });
    return a.finished.catch(() => {}).then(() => a);
  }

  /** Count a number up inside an element. */
  function countUp(el, from, to, dur = 900, fmt = fmtScore) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = clamp((now - t0) / dur, 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        el.textContent = fmt(from + (to - from) * e, t < 1);
        if (t < 1) requestAnimationFrame(step); else { el.textContent = fmt(to, false); res(); }
      };
      requestAnimationFrame(step);
    });
  }

  /** Scores may be halves (50:50). Show 7.5 as "7.5", whole numbers plain. */
  function fmtScore(n, rolling) {
    if (rolling) return String(Math.round(n));
    const r = Math.round(n * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  }

  /** Hebrew letters for answers */
  const LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳'];

  /** Download a Blob / string as a file (works from file:// and in Electron). */
  function download(filename, data, type = 'application/octet-stream') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1500);
  }

  /** Shrink a single-line element's font until it fits its box (nowrap titles). */
  function fitWidth(el, maxPx, minPx) {
    if (!el) return;
    let px = maxPx; el.style.fontSize = px + 'px';
    while (px > minPx && el.scrollWidth > el.clientWidth + 1) { px -= 2; el.style.fontSize = px + 'px'; }
    return px;
  }

  CH.u = { fitWidth, $, $$, h, esc, sleep, nextFrame, clamp, lerp, rand, uid, shuffle, LS, bus, typo, cleanHebrew, animate, countUp, fmtScore, LETTERS, download, reduced };
})(window.CH = window.CH || {});
