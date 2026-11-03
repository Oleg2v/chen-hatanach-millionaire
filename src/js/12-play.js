/* 12-play.js — the participant's round: empty boards + PLAY → question word-by-word → lock (1.5s) → reveal. */
(function (CH) {
  'use strict';
  const { h, animate, sleep, shuffle, fmtScore, countUp, LETTERS } = CH.u;
  const el = document.getElementById('scr-play');
  const LOCK_MS = 1500;

  let st = null;   // per-participant runtime state
  let refs = {};

  const settings = () => CH.store.getSettings();
  const fxOn = (fn) => CH.fx && typeof CH.fx[fn] === 'function';
  const snd = (name, opts) => (CH.sound ? CH.sound.play(name, opts) : null);

  const ORN = `<svg viewBox="0 0 260 18"><defs><linearGradient id="ornG" x1="0" x2="1"><stop offset="0" stop-color="#e7b448" stop-opacity="0"/><stop offset=".5" stop-color="#fff1c0"/><stop offset="1" stop-color="#e7b448" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="8" width="260" height="2" fill="url(#ornG)"/><path d="M130 1 L137 9 L130 17 L123 9 Z" fill="#ffd56a" stroke="#fff3c4" stroke-width="1"/><path d="M108 9 l4-4 4 4-4 4z M144 9 l4-4 4 4-4 4z" fill="#e7b448"/></svg>`;

  // ---------------- layout ----------------
  function build() {
    const c = st.cur;
    el.innerHTML = '';
    refs = {};
    refs.scoreVal = h('div.val.gold-text', fmtScore(c.score));
    refs.score = h('div.score-panel.glass', h('div.lbl', { html: CH.ui.icons.star + '<span>ניקוד</span>' }), refs.scoreVal);
    refs.dots = h('div.dots', st.qs.map(() => h('i')));
    refs.progLbl = h('div.lbl');
    el.append(h('header.scr-head',
      h('div.ph-brand',
        h('div.emb', { html: CH.emblemSvg({ shaded: true }) }),
        h('div', h('div.t1.gold-text', CH.store.displayTitle()), h('div.who', { style: { '--c': CH.participantColor(c.n) } }, h('i'), `משתתף ${c.n}`))),
      h('div.spacer'),
      refs.score));
    el.append(h('div.ph-progress', { style: { top: '96px' } }, refs.progLbl, refs.dots));

    // ladder (tree + climber)
    refs.ladderBox = h('div.ladder-box');
    el.append(refs.ladderBox);
    st.ladder = makeLadder(refs.ladderBox, st.qs.length, c.correct);

    // question + answers
    refs.qTag = h('div.q-tag', `שאלה ${st.idx + 1}`);
    refs.qText = h('p.q-text.heb', { lang: 'he' });
    refs.qBoard = h('div.q-board.glass.empty', h('div.orn.top', { html: ORN }), refs.qTag, refs.qText, h('div.orn.bot', { html: ORN }));
    refs.source = h('div.q-source', { html: CH.ui.icons.book + '<span></span>' });
    refs.half = h('div.q-half', '');
    refs.ans = []; refs.slots = [];
    const answers = h('div.answers');
    for (let i = 0; i < 4; i++) {
      const b = h('button.ans.empty', { type: 'button', 'data-i': i, 'aria-label': `תשובה ${LETTERS[i]}` },
        h('span.letter', LETTERS[i]), h('span.txt.heb', { lang: 'he' }), h('span.mark'));
      b.addEventListener('click', () => select(i));
      const slot = h('div.ans-slot', b);
      refs.ans.push(b); refs.slots.push(slot); answers.append(slot);
    }
    refs.fifty = h('button.lifeline', { type: 'button', title: 'גלגל הצלה 50:50 (H)', onclick: fifty, disabled: true }, '50:50', h('span.k', 'H'));
    refs.next = h('button.btn.btn-gold.next-btn', { type: 'button', onclick: next, hidden: true });
    el.append(h('div.q-area', refs.qBoard, h('div.q-meta', refs.source, refs.half), answers, h('div.q-actions', refs.fifty, refs.next)));

    // PLAY call-to-action (centred on the empty question board)
    refs.playBtn = h('button.btn.btn-gold', { type: 'button', onclick: play, html: `${CH.ui.icons.play}<span>שחק</span><span class="sep"></span><span class="en">PLAY</span>` });
    refs.cta = h('div.play-cta', h('span.ring'), h('span.ring.r2'), refs.playBtn,
      h('div.kbd-hint', 'רווח / Enter'));
    el.append(refs.cta);
    updateProgress();
  }

  /** Ladder from the ladder module, or a minimal fallback so the screen still works. */
  function makeLadder(box, steps, level) {
    if (CH.ladder && CH.ladder.create) {
      try { return CH.ladder.create(box, { steps, level }); } catch (e) { console.error(e); }
    }
    const bar = h('div', { style: { position: 'absolute', inset: '0 150px', borderRadius: '30px', background: 'rgba(255,255,255,.08)' } });
    const fill = h('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, borderRadius: '30px', background: 'var(--gold-grad)', transition: 'height .8s' } });
    bar.append(fill); box.append(bar);
    let k = level; const set = () => (fill.style.height = (k / Math.max(1, steps)) * 100 + '%'); set();
    return { el: bar, setLevel(v) { k = v; set(); return Promise.resolve(); }, climb() { k++; set(); return sleep(800); }, cheer: () => Promise.resolve(), setSteps() {}, destroy() { bar.remove(); } };
  }

  function updateProgress() {
    const c = st.cur;
    refs.dots.querySelectorAll('i').forEach((d, i) => {
      const lg = c.log[i];
      d.className = lg ? (lg.ok ? 'ok' : 'bad') : i === st.idx ? 'cur' : '';
    });
    refs.progLbl.innerHTML = `שאלה <b>${Math.min(st.idx + 1, st.qs.length)}</b> מתוך <b>${st.qs.length}</b>`;
  }

  // ---------------- text fitting ----------------
  function fit(elm, sizes, maxH) {
    for (const s of sizes) { elm.style.fontSize = s + 'px'; if (elm.scrollHeight <= maxH + 1) return s; }
    return sizes[sizes.length - 1];
  }
  function wordsInto(elm, text) {
    elm.textContent = '';
    const words = String(text).split(/ +/);
    words.forEach((w, i) => { if (i) elm.append(' '); elm.append(h('span.w', w)); });
    return Array.from(elm.querySelectorAll('.w'));
  }

  // ---------------- flow ----------------
  async function play() {
    if (st.phase !== 'pre') return;
    st.phase = 'showing';
    snd('click');
    const r = CH.stage.rectOf(refs.playBtn);
    fxOn('burst') && CH.fx.burst(r.cx, r.cy, { kind: 'ring', count: 30 });
    await animate(refs.cta, [{ opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(.86)', filter: 'blur(10px)' }], { duration: 380, easing: 'cubic-bezier(.55,0,.75,.3)' });
    refs.cta.hidden = true;
    await showQuestion();
  }

  async function showQuestion() {
    st.phase = 'showing';
    const q = st.qs[st.idx];
    st.order = shuffle([{ text: q.correct, correct: true }, ...q.wrong.map((w) => ({ text: w, correct: false }))]);
    st.removed = new Set(); st.used5050 = false;
    updateProgress();
    refs.qTag.textContent = `שאלה ${st.idx + 1}`;
    refs.qBoard.classList.remove('empty');
    refs.half.style.opacity = 0; refs.source.style.opacity = 0;
    refs.next.hidden = true;
    refs.fifty.disabled = true; refs.fifty.classList.remove('used');

    // question text, word by word
    const words = wordsInto(refs.qText, q.q);
    fit(refs.qText, [76, 72, 68, 64, 58, 52], 282);
    words.forEach((w) => (w.style.opacity = 0));
    snd('question');
    animate(refs.qTag, [{ opacity: 0, transform: 'translateY(10px) scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    const per = Math.max(55, Math.min(110, 900 / words.length));
    await Promise.all(words.map((w, i) => animate(w, [
      { opacity: 0, transform: 'translateY(26px)', filter: 'blur(10px)' },
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
    ], { duration: 620, delay: i * per, easing: 'cubic-bezier(.16,1,.3,1)' })));

    // answers, staggered
    st.order.forEach((a, i) => {
      const b = refs.ans[i];
      b.className = 'ans';
      b.querySelector('.mark').innerHTML = '';
      const t = b.querySelector('.txt');
      t.textContent = a.text;
      b.style.opacity = '0';
      fit(t, [52, 50, 48, 46], 92) === 46 && t.scrollHeight > 93 && fit(t, [44, 42, 40, 38], 122);
    });
    await sleep(120);
    await Promise.all(refs.ans.map((b, i) => sleep(i * 150).then(() => {
      snd('answer', { index: i });
      return animate(b, [
        { opacity: 0, transform: 'translateY(24px) scale(.94)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' },
      ], { duration: 560, easing: 'cubic-bezier(.16,1,.3,1)' }).then((an) => { b.style.opacity = ''; an && an.cancel && an.cancel(); });
    })));
    refs.ans.forEach((b) => b.classList.add('is-ready'));
    refs.fifty.disabled = false;
    st.phase = 'answering';
  }

  async function select(i) {
    if (!st || st.phase !== 'answering' || st.removed.has(i)) return;
    st.phase = 'locked';
    const b = refs.ans[i];
    refs.fifty.disabled = true;
    refs.ans.forEach((x, j) => { x.classList.remove('is-ready'); if (j !== i && !st.removed.has(j)) x.classList.add('is-dim'); });
    b.classList.add('is-locked');
    snd('lock');
    await sleep(LOCK_MS);
    CH.sound && CH.sound.stopAll && CH.sound.stopAll();

    const ci = st.order.findIndex((a) => a.correct);
    const ok = i === ci;
    const s = settings();
    const pts = ok ? (st.used5050 && s.halveOn5050 ? s.points / 2 : s.points) : 0;
    const c = st.cur;
    b.classList.remove('is-locked');
    const climbs = [];
    if (ok) {
      b.classList.add('is-correct');
      b.querySelector('.mark').innerHTML = CH.ui.icons.check;
      snd('correct');
      const r = CH.stage.rectOf(b);
      fxOn('burst') && CH.fx.burst(r.cx, r.cy, { kind: 'sparkle', count: 46, color: '#8dffc0' });
      const newScore = c.score + pts;
      climbs.push(flyPoints(b, pts, c.score, newScore));
      climbs.push(sleep(350).then(() => st.ladder.climb()));
      c.score = newScore; c.correct += 1;
    } else {
      b.classList.add('is-wrong', 'shake');
      b.querySelector('.mark').innerHTML = CH.ui.icons.x;
      snd('wrong');
      await sleep(650);
      const cb = refs.ans[ci];
      cb.classList.remove('is-dim', 'is-gone');
      cb.classList.add('is-correct', 'is-reveal');
      cb.querySelector('.mark').innerHTML = CH.ui.icons.check;
    }
    c.log[st.idx] = { qid: st.qs[st.idx].id, ok, pts, used5050: st.used5050, chosen: st.order[i].text };
    if (st.used5050) c.used5050 = (c.used5050 || 0) + 1;
    CH.store.saveCurrent({ idx: st.idx + 1, score: c.score, correct: c.correct, used5050: c.used5050, log: c.log });
    updateProgress();

    // source (bonus) + next button
    await sleep(ok ? 500 : 250);
    const src = st.qs[st.idx].source;
    if (src) {
      refs.source.querySelector('span').textContent = src;
      snd('reveal');
      animate(refs.source, [{ opacity: 0, transform: 'translateY(-14px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    await Promise.all(climbs);
    const last = st.idx + 1 >= st.qs.length;
    refs.next.innerHTML = last
      ? `<span>לתוצאה</span><span class="sep"></span><span class="en">RESULT</span>${CH.ui.icons.next}`
      : `<span>השאלה הבאה</span><span class="sep"></span><span class="en">NEXT</span>${CH.ui.icons.next}`;
    refs.fifty.hidden = true;
    refs.next.hidden = false;
    animate(refs.next, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    st.phase = 'revealed';
  }

  /** "+6" pops at the answer and flies along a curve into the score counter. */
  async function flyPoints(fromEl, pts, oldScore, newScore) {
    const a = CH.stage.rectOf(fromEl), bR = CH.stage.rectOf(refs.scoreVal);
    const from = { x: a.cx, y: a.cy }, to = { x: bR.cx, y: bR.cy };
    const ctrl = fxOn('trailControl') ? CH.fx.trailControl(from, to) : { x: (from.x + to.x) / 2 + 120, y: Math.min(from.y, to.y) - 220 };
    const bez = fxOn('bezierPoint') ? CH.fx.bezierPoint : (p0, cc, p1, t) => ({ x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * cc.x + t * t * p1.x, y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * cc.y + t * t * p1.y });
    const label = h('div.fly-points', '+' + fmtScore(pts));
    CH.stage.el.append(label);
    const w = label.offsetWidth, hh = label.offsetHeight;
    const at = (p, s) => `translate(${(p.x - w / 2).toFixed(1)}px, ${(p.y - hh / 2).toFixed(1)}px) scale(${s})`;
    await animate(label, [
      { transform: at(from, 0.2), opacity: 0 },
      { transform: at({ x: from.x, y: from.y - 30 }, 1.35), opacity: 1, offset: 0.6 },
      { transform: at({ x: from.x, y: from.y - 20 }, 1.1), opacity: 1 },
    ], { duration: 520, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    const DUR = 820, N = 28, frames = [];
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const start = { x: from.x, y: from.y - 20 };
    for (let i = 0; i <= N; i++) { const t = ease(i / N); frames.push({ transform: at(bez(start, ctrl, to, t), 1.1 - 0.55 * t), opacity: i === N ? 0.2 : 1 }); }
    fxOn('trail') && CH.fx.trail(start, to, { duration: DUR });
    await animate(label, frames, { duration: DUR, easing: 'linear' });
    label.remove();
    snd('points');
    fxOn('burst') && CH.fx.burst(to.x, to.y, { kind: 'stars', count: 30 });
    refs.score.classList.remove('bump'); void refs.score.offsetWidth; refs.score.classList.add('bump');
    await countUp(refs.scoreVal, oldScore, newScore, 700);
  }

  async function fifty() {
    if (!st || st.phase !== 'answering' || st.used5050) return;
    st.used5050 = true;
    refs.fifty.classList.add('used'); refs.fifty.disabled = true;
    snd('fifty');
    const wrong = st.order.map((a, j) => (a.correct ? -1 : j)).filter((j) => j >= 0);
    const gone = shuffle(wrong).slice(0, 2);
    gone.forEach((j) => { st.removed.add(j); refs.ans[j].classList.remove('is-ready'); });
    const s = settings();
    if (s.halveOn5050) {
      refs.half.innerHTML = `50:50 · השאלה שווה <b>${fmtScore(s.points / 2)}</b> נק׳`;
      animate(refs.half, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    }
    await Promise.all(gone.map((j, k) => sleep(k * 220).then(() => (fxOn('dissolve')
      ? CH.fx.dissolve(refs.ans[j])
      : animate(refs.ans[j], [{ opacity: 1, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(12px)', transform: 'scale(.96)' }], { duration: 700 })))));
    gone.forEach((j) => { refs.ans[j].classList.add('is-gone'); refs.slots[j].classList.add('is-gone'); });
  }

  async function next() {
    if (!st || st.phase !== 'revealed') return;
    st.phase = 'leaving';
    snd('click');
    if (st.idx + 1 >= st.qs.length) {
      const res = CH.store.finishParticipant();
      CH.ui.go('result', { res, steps: st.qs.length });
      return;
    }
    // clear the boards
    animate(refs.next, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], { duration: 260 }).then(() => (refs.next.hidden = true));
    animate(refs.source, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    animate(refs.half, [{ opacity: getComputedStyle(refs.half).opacity }, { opacity: 0 }], { duration: 300 });
    await Promise.all([
      animate(refs.qText, [{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: 'blur(12px)', transform: 'translateY(-20px)' }], { duration: 420, easing: 'ease-in' }),
      ...refs.ans.map((b, i) => animate(b, [{ opacity: b.classList.contains('is-gone') ? 0 : 1, transform: 'none' }, { opacity: 0, transform: 'scale(.95)' }], { duration: 360, delay: i * 50, easing: 'ease-in' })),
    ]);
    refs.qText.getAnimations().forEach((a) => a.cancel());
    refs.slots.forEach((sl) => sl.classList.remove('is-gone'));
    refs.ans.forEach((b) => { b.getAnimations().forEach((a) => a.cancel()); b.className = 'ans empty'; b.querySelector('.txt').textContent = ''; b.querySelector('.mark').innerHTML = ''; b.style.visibility = ''; });
    refs.fifty.hidden = false;
    st.idx += 1;
    await showQuestion();
  }

  async function exitPrompt() {
    if (!st || st.phase === 'locked' || st.phase === 'showing') return;
    const r = await CH.ui.modal({
      title: `לצאת מהמשחק של משתתף ${st.cur.n}?`,
      body: 'ההתקדמות נשמרת — אפשר לחזור ולהמשיך מאותה נקודה.',
      actions: [{ key: 'stay', label: 'המשך לשחק', kind: 'gold' }, { key: 'leave', label: 'חזרה ללוח', kind: 'glass' }],
    });
    if (r && r.action === 'leave') { snd('back'); CH.ui.go('board'); }
  }

  CH.ui.register('play', {
    enter() {
      const cur = CH.store.current();
      const qs = CH.store.currentQuestions();
      if (!cur || !qs.length) { CH.store.abandonCurrent(); setTimeout(() => CH.ui.go('board'), 0); return; }
      cur.log = cur.log || [];
      st = { cur, qs, idx: Math.min(cur.idx, qs.length), phase: 'pre', order: [], removed: new Set(), used5050: false, ladder: null };
      if (st.idx >= qs.length) {   // everything answered (e.g. reload after the last reveal) → straight to result
        const res = CH.store.finishParticipant();
        setTimeout(() => CH.ui.go('result', { res, steps: qs.length }), 0);
        return;
      }
      build();
      CH.fx && CH.fx.setBackgroundIntensity && CH.fx.setBackgroundIntensity(0.5);
    },
    afterEnter() {
      if (st && st.ladder && st.ladder.el) animate(st.ladder.el, [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }], { duration: 900, easing: 'cubic-bezier(.16,1,.3,1)' });
    },
    leave() { if (st && st.ladder) { try { st.ladder.destroy(); } catch (e) { /* ignore */ } } st = null; CH.sound && CH.sound.stopAll && CH.sound.stopAll(); },
    onKey(e) {
      if (!st) return;
      const code = e.code;
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
        e.preventDefault();
        if (st.phase === 'pre') play(); else if (st.phase === 'revealed') next();
        return;
      }
      const d = /^(Digit|Numpad)([1-4])$/.exec(code);
      if (d) { e.preventDefault(); select(+d[2] - 1); return; }
      if (code === 'KeyH') { e.preventDefault(); fifty(); return; }
      if (code === 'Escape') { e.preventDefault(); exitPrompt(); }
    },
  });

  // test hook (used by the automated e2e checks)
  CH.play = { get state() { return st && { phase: st.phase, idx: st.idx, order: st.order.map((a) => a.correct), removed: [...st.removed] }; } };
})(window.CH = window.CH || {});
