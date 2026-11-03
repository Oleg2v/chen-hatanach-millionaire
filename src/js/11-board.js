/* 11-board.js — participants field: wave-in tiles with 3D tilt, played = grey + score, leaderboard with crown. */
(function (CH) {
  'use strict';
  const { h, animate, bus, fmtScore, clamp } = CH.u;
  const el = document.getElementById('scr-board');
  const COLORS = ['--e-red', '--e-green', '--e-pink', '--e-teal', '--e-orange', '--e-blue'];
  const colorOf = (n) => `var(${COLORS[(n - 1) % COLORS.length]})`;
  CH.participantColor = colorOf;

  const AREA = { w: 1290, h: 730, gap: 24 };
  let tiles = [], focusN = 0, digitBuf = '', digitTimer = 0, flashN = 0;

  /** Honeycomb layout: pointy-top hexagons in offset rows. Picks the column count that gives the largest cells
   *  (ties → fewer empty cells). Returns cell width w, height hh, and each cell's position (RTL: first cell top-right). */
  const HEX = 2 / Math.sqrt(3), GX = 14, GY = 10;
  function layout(n) {
    let best = null;
    for (let c = Math.max(1, Math.ceil(Math.sqrt(n)) - 1); c <= Math.min(n, 12); c++) {
      const r = Math.ceil(n / c), e = r * c - n;
      if (e >= c) continue;
      const half = r > 1 ? 0.5 : 0;
      const wByW = (AREA.w - (c - 1) * GX - half * GX) / (c + half);
      const wByH = (AREA.h - (r - 1) * GY) / (HEX * (1 + 0.75 * (r - 1)));
      const w = Math.min(wByW, wByH, 250);
      if (!best || w > best.w + 0.5 || (Math.abs(w - best.w) <= 0.5 && e < best.empty)) best = { cols: c, rows: r, empty: e, w };
    }
    const w = Math.floor(best.w), hh = Math.round(w * HEX), step = hh * 0.75 + GY;
    const half = best.rows > 1 ? (w + GX) / 2 : 0;
    const W = best.cols * w + (best.cols - 1) * GX + half, H = hh + (best.rows - 1) * step;
    const pos = (i) => { const r = Math.floor(i / best.cols), c = i % best.cols; return { right: c * (w + GX) + (r % 2 ? half : 0), top: r * step }; };
    return { ...best, w, hh, W: Math.ceil(W), H: Math.ceil(H), pos, tw: w, th: hh };
  }

  /** Rounded pointy-top hexagon path in a w×hh box (for clip-path and the gold hairline). */
  function hexPath(w, hh, r, inset = 0) {
    const i = inset, V = [[w / 2, i], [w - i, hh / 4 + i * 0.5], [w - i, hh * 0.75 - i * 0.5], [w / 2, hh - i], [i, hh * 0.75 - i * 0.5], [i, hh / 4 + i * 0.5]];
    const towards = (a, b, d) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [a[0] + (dx / L) * d, a[1] + (dy / L) * d]; };
    let d = '';
    V.forEach((v, k) => {
      const prev = V[(k + 5) % 6], next = V[(k + 1) % 6];
      const p1 = towards(v, prev, r), p2 = towards(v, next, r);
      d += (k ? 'L' : 'M') + p1.map((x) => x.toFixed(1)).join(' ') + 'Q' + v.map((x) => x.toFixed(1)).join(' ') + ' ' + p2.map((x) => x.toFixed(1)).join(' ');
    });
    return d + 'Z';
  }

  function render() {
    const s = CH.store.getSettings();
    const n = s.participants;
    const played = Object.keys(CH.store.getRound().results).filter((k) => +k <= n).length;
    const cur = CH.store.current();
    el.innerHTML = '';

    // header
    const resetBtn = h('button.btn.btn-glass.btn-sm', { type: 'button', onclick: resetRound, html: CH.ui.icons.refresh + '<span>סבב חדש</span>' });
    el.append(h('header.scr-head',
      h('div.emb', { html: CH.emblemSvg({ shaded: true }) }),
      h('div.titles', h('h1.gold-text', CH.store.displayTitle()), h('div.sub', 'לוח הכוורות · בחרו כוורת כדי להתחיל')),
      h('div.spacer'),
      h('div.head-chip', { html: `${CH.ui.icons.users.replace('<svg', '<svg style="width:30px;height:30px"')}<span>שוחקו <b>${played}</b> מתוך <b>${n}</b> כוורות</span>` }),
      resetBtn));

    // grid
    const L = layout(n);
    const grid = h('div.board-grid.hexgrid', { style: { width: L.W + 'px', height: L.H + 'px' } });
    if (L.w < 140) grid.classList.add('dense');
    grid.style.setProperty('--num', Math.round(L.w * 0.42) + 'px');
    grid.style.setProperty('--lbl', Math.round(clamp(L.w * 0.11, 15, 26)) + 'px');
    grid.style.setProperty('--sc', Math.round(L.w * 0.3) + 'px');
    const clip = `path('${hexPath(L.w, L.hh, L.w * 0.09)}')`;
    const line = hexPath(L.w, L.hh, L.w * 0.09, 1.5);
    grid.append(h('div.hex-defs', { html: '<svg width="0" height="0"><defs><linearGradient id="hexGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".3" stop-color="#e7b448"/><stop offset=".55" stop-color="#8f5c12"/><stop offset=".8" stop-color="#f5d27a"/><stop offset="1" stop-color="#b27a1f"/></linearGradient></defs></svg>' }));
    tiles = [];
    for (let i = 1; i <= n; i++) {
      const res = CH.store.resultOf(i);
      const resume = cur && cur.n === i;
      const p = L.pos(i - 1);
      const t = h('button.tile', { type: 'button', 'data-n': i, 'aria-label': `כוורת ${i}` + (res ? `, שוחקה, ${fmtScore(res.score)} נקודות` : ''),
        style: { '--c': colorOf(i), width: L.w + 'px', height: L.hh + 'px', right: p.right + 'px', top: p.top + 'px', clipPath: clip } },
        h('span.hex-line', { html: `<svg viewBox="0 0 ${L.w} ${L.hh}"><path d="${line}"/></svg>` }),
        h('i.gem'), h('span.lbl', res ? `כוורת ${i}` : 'כוורת'), h('span.num', String(i)),
        h('span.score', h('b', res ? fmtScore(res.score) : ''), h('span', res && res.score === 1 ? 'נקודה' : 'נקודות'),
          res ? h('em' + (res.correct ? '' : '.zero'), { html: `<bdi>${res.correct}/${res.total}</bdi>` + (res.correct ? CH.ui.icons.check : '') }) : null),
        h('span.lock', { html: CH.ui.icons.lock }),
        h('span.badge', 'בתהליך'));
      if (res) t.classList.add('is-played');
      if (resume) t.classList.add('is-resume');
      t.addEventListener('click', () => choose(i));
      t.addEventListener('pointermove', tilt);
      t.addEventListener('pointerleave', untilt);
      t.addEventListener('pointerenter', () => { if (!res) CH.sound && CH.sound.play('hover'); });
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); if (res) offerUnlock(i); });
      grid.append(t); tiles.push(t);
    }
    el.append(h('div.board-grid-wrap', grid));
    el.append(renderLeader());
    CH.u.fitWidth(el.querySelector('.scr-head h1'), 68, 36);

    if (CH.store.questionsPerParticipant() === 0) {
      el.append(h('div.board-note.toast.err', 'אין שאלות תקינות באוסף הפעיל — פתחו את מסך הניהול (⚙)'));
    }
    return grid;
  }

  function renderLeader() {
    const rows = CH.store.leaderboard();
    const box = h('aside.leader.glass', h('h2', h('span.ic', { html: CH.ui.icons.crown }), h('span.gold-text', 'טבלת המובילים')));
    if (!rows.length) {
      box.append(h('div.lb-empty', h('div.ic', { html: CH.ui.icons.star }), 'עדיין אין תוצאות.', h('br'), 'בחרו כוורת ראשונה!'));
      return box;
    }
    const MAX = rows.length > 7 ? 6 : 7;           // the panel holds 7 rows (6 + "ועוד…" line)
    const ol = h('ol');
    const top = rows[0].score;
    let rank = 0;
    rows.slice(0, MAX).forEach((r, i) => {
      // competition ranking: equal score and correct count share a rank
      if (i === 0 || r.score !== rows[i - 1].score || r.correct !== rows[i - 1].correct) rank = i + 1;
      const lead = r.score > 0 && r.score === top;
      const li = h('li.lb-row' + (lead ? '.first' : ''), { style: { '--c': colorOf(r.n) }, 'data-n': r.n },
        lead ? h('span.crown', { html: CH.ui.icons.crown }) : null,
        h('span.rk', String(rank)),
        h('span.nm', h('bdi', `כוורת ${r.n}`), h('small' + (r.correct ? '' : '.zero'), { html: `<bdi>${r.correct}/${r.total}</bdi>` + (r.correct ? CH.ui.icons.check : '') })),
        h('span.pt', fmtScore(r.score)));
      if (r.n === flashN) li.classList.add('is-new');
      ol.append(li);
    });
    box.append(ol);
    const more = rows.length - MAX;
    if (more > 0) box.append(h('div.lb-more', more === 1 ? 'ועוד כוורת אחת' : `ועוד ${more} כוורות`));
    return box;
  }

  function wave() {
    const L = layout(CH.store.getSettings().participants);
    tiles.forEach((t, i) => {
      const r = Math.floor(i / L.cols), c = i % L.cols;
      const base = t.classList.contains('is-played') ? 'saturate(0) brightness(.78) ' : '';
      animate(t, [
        { opacity: 0, transform: 'translateY(40px) scale(.7) rotateX(28deg)', filter: base + 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: base + 'blur(0px)' },
      ], { duration: 760, delay: 120 + (r + c) * 55, easing: 'cubic-bezier(.34,1.4,.64,1)', fill: 'backwards' });
    });
    el.querySelectorAll('.lb-row').forEach((row, i) =>
      animate(row, [{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 300 + i * 70, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
    if (flashN) {
      const t = tiles[flashN - 1]; if (t) { t.classList.add('is-flash'); setTimeout(() => t.classList.remove('is-flash'), 1700); }
      flashN = 0;
    }
  }

  // ---- 3D tilt + glare ----
  function tilt(e) {
    const t = e.currentTarget; if (t.classList.contains('is-played')) return;
    const r = t.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    t.style.transform = `translateY(-6px) scale(1.06) rotateY(${((px - 0.5) * 18).toFixed(2)}deg) rotateX(${((0.5 - py) * 16).toFixed(2)}deg)`;
    t.style.setProperty('--gx', (px * 100).toFixed(1) + '%'); t.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  }
  function untilt(e) { e.currentTarget.style.transform = ''; }

  // ---- actions ----
  let choosing = false;
  async function choose(n) {
    if (choosing) return;
    const res = CH.store.resultOf(n);
    if (res) { CH.sound && CH.sound.play('click'); return offerUnlock(n); }
    if (CH.store.questionsPerParticipant() === 0) {
      const r = await CH.ui.modal({ title: 'אין שאלות זמינות', body: 'באוסף השאלות הפעיל אין שאלות תקינות. היכנסו לניהול כדי לטעון שאלות.',
        actions: [{ key: 'admin', label: 'לניהול השאלות', kind: 'gold' }, { key: 'x', label: 'סגירה', kind: 'glass' }] });
      if (r && r.action === 'admin') CH.admin && CH.admin.open('questions');
      return;
    }
    // Another hive is in progress → never overwrite it silently.
    const settled = CH.store.settleCurrent();               // all its questions answered → just record it
    if (settled) { refresh(); CH.ui.toast(`כוורת ${settled.n} נרשמה: ${fmtScore(settled.score)} נקודות`, { kind: 'ok' }); }
    const cur = CH.store.current();
    if (cur && cur.n !== n) {
      if (cur.idx > 0) {
        const r = await CH.ui.modal({
          title: `כוורת ${cur.n} באמצע המשחק`,
          body: `נענו ${cur.idx} מתוך ${cur.qids.length} שאלות · ${fmtScore(cur.score)} נקודות.<br>מה לעשות בה לפני שעוברים לכוורת ${n}?`,
          defaultKey: 'resume',
          actions: [{ key: 'resume', label: `המשך בכוורת ${cur.n}`, kind: 'gold' }, { key: 'finish', label: 'לסיים עם הניקוד הנוכחי', kind: 'glass' }, { key: 'drop', label: 'לבטל את הכוורת', kind: 'danger' }],
        });
        if (!r) return;
        if (r.action === 'resume') return choose(cur.n);
        if (r.action === 'finish') { const res = CH.store.finishParticipant(); refresh(); res && CH.ui.toast(`כוורת ${res.n} נרשמה: ${fmtScore(res.score)} נקודות`, { kind: 'ok' }); return; }
        CH.store.abandonCurrent();
      } else CH.store.abandonCurrent();                       // opened but nothing answered — nothing to lose
    }
    choosing = true;
    const t = tiles[n - 1];
    CH.sound && CH.sound.play('tile');
    if (t) {
      const r = CH.stage.rectOf(t);
      CH.fx && CH.fx.burst && CH.fx.burst(r.cx, r.cy, { kind: 'stars', count: 40 });
      await animate(t, [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', boxShadow: '0 0 0 4px #fff, 0 0 80px rgba(255,230,150,.9)' }, { transform: 'scale(1.08)' }], { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    CH.store.startParticipant(n);
    await CH.ui.go('play', { n });
    choosing = false;
  }

  async function offerUnlock(n) {
    const res = CH.store.resultOf(n);
    const ok = await CH.ui.confirm(`כוורת ${n} כבר שוחקה`, `התוצאה: <b>${fmtScore(res.score)}</b> נקודות (${res.correct} מתוך ${res.total} נכונות).<br>הכוורת נעולה. לפתוח אותה מחדש ולמחוק את התוצאה?`,
      { ok: 'פתיחה מחדש', cancel: 'להשאיר נעולה', danger: true });
    if (ok) { CH.store.unlockParticipant(n); refresh(); CH.ui.toast(`כוורת ${n} נפתחה מחדש`); }
  }

  async function resetRound() {
    CH.sound && CH.sound.play('click');
    const ok = await CH.ui.confirm('להתחיל סבב חדש?', 'כל התוצאות יימחקו וכל הכוורות ייפתחו מחדש.', { ok: 'סבב חדש', cancel: 'ביטול', danger: true });
    if (ok) { CH.store.resetRound(); refresh(); CH.ui.toast('סבב חדש התחיל', { kind: 'ok' }); }
  }

  function refresh() { render(); wave(); }

  function setFocus(n) {
    tiles.forEach((t) => t.classList.remove('is-focus'));
    focusN = n;
    const t = tiles[n - 1]; if (t) { t.classList.add('is-focus'); CH.sound && CH.sound.play('hover'); }
  }

  CH.ui.register('board', {
    enter(params = {}) {
      if (params.flash) flashN = params.flash;
      render(); wave();
      CH.fx && CH.fx.setBackgroundIntensity && CH.fx.setBackgroundIntensity(0.9);
    },
    leave() { tiles = []; },
    onKey(e) {
      const n = CH.store.getSettings().participants;
      const d = /^(Digit|Numpad)(\d)$/.exec(e.code);
      if (d) {
        e.preventDefault();
        digitBuf = (digitBuf + d[2]).slice(-2);
        if (+digitBuf > n) digitBuf = d[2];
        clearTimeout(digitTimer); digitTimer = setTimeout(() => (digitBuf = ''), 1400);
        if (+digitBuf >= 1) setFocus(+digitBuf);
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const L = layout(n); let f = focusN || 1;
        if (focusN) {
          if (e.code === 'ArrowLeft') f += 1; else if (e.code === 'ArrowRight') f -= 1;   // RTL
          else if (e.code === 'ArrowDown') f += L.cols; else f -= L.cols;
        }
        setFocus(clamp(f, 1, n)); return;
      }
      if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') && focusN) { e.preventDefault(); const f = focusN; focusN = 0; choose(f); return; }
      if (e.code === 'Escape') { e.preventDefault(); CH.sound && CH.sound.play('back'); CH.ui.go('splash'); }
    },
  });

  bus.on('admin:closed', () => { if (CH.ui.current === 'board') refresh(); });
  bus.on('brand:change', () => { if (CH.ui.current === 'board') refresh(); });
})(window.CH = window.CH || {});
