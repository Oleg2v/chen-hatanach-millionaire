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

  /** Columns: smallest count ≥ ceil(√n) that leaves the fewest empty cells (16→4×4, 24→6×4, 10→5×2). */
  function layout(n) {
    const base = Math.ceil(Math.sqrt(n));
    let best = { cols: base, rows: Math.ceil(n / base), empty: Infinity };
    for (let c = base; c <= base + 3 && c <= n; c++) {
      const r = Math.ceil(n / c), e = r * c - n;
      if (e < best.empty) best = { cols: c, rows: r, empty: e };
    }
    let tw = (AREA.w - AREA.gap * (best.cols - 1)) / best.cols;
    let th = (AREA.h - AREA.gap * (best.rows - 1)) / best.rows;
    tw = Math.min(tw, th * 1.7, 330); th = Math.min(th, tw * 1.05, 300);
    return { ...best, tw: Math.floor(tw), th: Math.floor(th) };
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
      h('div.titles', h('h1.gold-text', CH.store.displayTitle()), h('div.sub', 'בחרו משתתף כדי להתחיל')),
      h('div.spacer'),
      h('div.head-chip', { html: `${CH.ui.icons.users.replace('<svg', '<svg style="width:30px;height:30px"')}<span>שיחקו <b>${played}</b> מתוך <b>${n}</b></span>` }),
      resetBtn));

    // grid
    const L = layout(n);
    const grid = h('div.board-grid', { style: { gridTemplateColumns: `repeat(${L.cols}, ${L.tw}px)`, gridAutoRows: `${L.th}px` } });
    const numSize = Math.round(Math.min(L.th * 0.5, L.tw * 0.42));
    grid.style.setProperty('--num', numSize + 'px');
    grid.style.setProperty('--lbl', Math.round(clamp(L.th * 0.12, 16, 26)) + 'px');
    grid.style.setProperty('--sc', Math.round(Math.min(L.th * 0.36, L.tw * 0.3)) + 'px');
    tiles = [];
    for (let i = 1; i <= n; i++) {
      const res = CH.store.resultOf(i);
      const resume = cur && cur.n === i;
      const t = h('button.tile', { type: 'button', 'data-n': i, 'aria-label': `משתתף ${i}` + (res ? `, שיחק, ${fmtScore(res.score)} נקודות` : ''), style: { '--c': colorOf(i) } },
        h('i.gem'), L.th > 120 ? h('span.lbl', 'משתתף') : null, h('span.num', String(i)),
        h('span.score', h('b', res ? fmtScore(res.score) : ''), h('span', 'נקודות'), res ? h('em', { html: `<bdi>${res.correct}/${res.total}</bdi>` + CH.ui.icons.check }) : null),
        h('span.lock', { html: CH.ui.icons.lock }),
        h('span.badge', 'בהמשך…'));
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

    if (CH.store.questionsPerParticipant() === 0) {
      el.append(h('div.board-note.toast.err', 'אין שאלות תקינות באוסף הפעיל — פתחו את מסך הניהול (⚙)'));
    }
    return grid;
  }

  function renderLeader() {
    const rows = CH.store.leaderboard();
    const box = h('aside.leader.glass', h('h2', h('span.ic', { html: CH.ui.icons.crown }), h('span.gold-text', 'טבלת המובילים')));
    if (!rows.length) {
      box.append(h('div.lb-empty', h('div.ic', { html: CH.ui.icons.star }), 'עדיין אין תוצאות.', h('br'), 'בחרו משתתף ראשון!'));
      return box;
    }
    const MAX = 8;
    const ol = h('ol');
    rows.slice(0, MAX).forEach((r, i) => {
      const rank = i === 0 || r.score !== rows[i - 1].score ? i + 1 : null;
      const li = h('li.lb-row' + (i === 0 ? '.first' : ''), { style: { '--c': colorOf(r.n) }, 'data-n': r.n },
        i === 0 ? h('span.crown', { html: CH.ui.icons.crown }) : null,
        h('span.rk', String(rank || '·')),
        h('span.nm', h('bdi', `משתתף ${r.n}`), h('small', { html: `<bdi>${r.correct}/${r.total}</bdi>` + CH.ui.icons.check })),
        h('span.pt', fmtScore(r.score)));
      if (r.n === flashN) li.classList.add('is-new');
      ol.append(li);
    });
    box.append(ol);
    if (rows.length > MAX) box.append(h('div.lb-more', `ועוד ${rows.length - MAX} משתתפים`));
    return box;
  }

  function wave() {
    const L = layout(CH.store.getSettings().participants);
    tiles.forEach((t, i) => {
      const r = Math.floor(i / L.cols), c = i % L.cols;
      animate(t, [
        { opacity: 0, transform: 'translateY(40px) scale(.8) rotateX(28deg)', filter: 'blur(6px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' },
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
    t.style.transform = `translateY(-8px) scale(1.04) rotateY(${((px - 0.5) * 16).toFixed(2)}deg) rotateX(${((0.5 - py) * 14).toFixed(2)}deg)`;
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
    const ok = await CH.ui.confirm(`משתתף ${n} כבר שיחק`, `התוצאה שלו: <b>${fmtScore(res.score)}</b> נקודות (${res.correct} מתוך ${res.total} נכונות).<br>לפתוח את המשבצת מחדש ולמחוק את התוצאה?`,
      { ok: 'פתיחה מחדש', cancel: 'השאר נעול', danger: true });
    if (ok) { CH.store.unlockParticipant(n); refresh(); CH.ui.toast(`משתתף ${n} נפתח מחדש`); }
  }

  async function resetRound() {
    CH.sound && CH.sound.play('click');
    const ok = await CH.ui.confirm('להתחיל סבב חדש?', 'כל התוצאות של המשתתפים יימחקו והלוח יתאפס.', { ok: 'סבב חדש', cancel: 'ביטול', danger: true });
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
