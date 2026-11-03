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
    refs.score = h('div.score-panel.glass', h('div.lbl', { html: CH.ui.icons.star + '<span>נקודות</span>' }), refs.scoreVal);
    sizeScore(fmtScore(c.score));
    refs.dots = h('div.dots', st.qs.map(() => h('i')));
    refs.progLbl = h('div.lbl');
    el.append(h('header.scr-head',
      h('div.ph-brand',
        h('div.emb', { html: CH.emblemSvg({ shaded: true }) }),
        h('div', h('div.t1.gold-text', CH.store.displayTitle()), h('div.who', { style: { '--c': CH.participantColor(c.n) } }, h('i'), `כוורת ${c.n}`))),
      h('div.spacer'),
      refs.score));
    el.append(h('div.ph-progress', { style: { top: '64px', left: '770px' } }, refs.progLbl, refs.dots));
    CH.u.fitWidth(el.querySelector('.ph-brand .t1'), 44, 26);

    // ladder (tree + climber)
    refs.ladderBox = h('div.ladder-box');
    el.append(refs.ladderBox);
    st.ladder = makeLadder(refs.ladderBox, st.qs.length, c.correct);

    // question + answers
    refs.qTag = h('div.q-tag', `שאלה ${st.idx + 1}`);
    refs.qText = h('p.q-text.heb', { lang: 'he' });
    refs.timer = h('div.q-timer', { hidden: true, html: `<svg viewBox="0 0 100 100"><defs><linearGradient id="tmG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#f6c64e"/><stop offset="1" stop-color="#c4801c"/></linearGradient></defs><circle class="trk" cx="50" cy="50" r="44"/><circle class="arc" cx="50" cy="50" r="44" pathLength="100"/></svg><b>${settings().answerTime}</b>` });
    refs.qBoard = h('div.q-board.glass.empty', h('div.orn.top', { html: ORN }), refs.timer, refs.qText, h('div.orn.bot', { html: ORN }));
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

  /** Long scores (1000+, 7.5…) step the counter font down so they never collide with the label. */
  function sizeScore(text) { const n = String(text).length; refs.scoreVal.style.fontSize = (n <= 3 ? 78 : n === 4 ? 62 : 50) + 'px'; }

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
    fxOn('burst') && CH.fx.burst(r.cx, r.cy, { kind: 'stars', count: 18 });
    await animate(refs.cta, [{ opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }, { opacity: 0, transform: 'scale(.86)', filter: 'blur(10px)' }], { duration: 380, easing: 'cubic-bezier(.55,0,.75,.3)' });
    refs.cta.hidden = true;
    await showQuestion();
  }

  async function showQuestion() {
    const my = st;
    st.phase = 'showing';
    const q = st.qs[st.idx];
    st.order = shuffle([{ text: q.correct, correct: true }, ...q.wrong.map((w) => ({ text: w, correct: false }))]);
    st.removed = new Set(); st.used5050 = false;
    updateProgress();
    refs.qBoard.classList.remove('empty');
    [refs.source, refs.half].forEach((x) => { x.getAnimations().forEach((a) => a.cancel()); x.hidden = true; x.style.opacity = 0; });
    refs.half.classList.remove('is-timeout');
    refs.timer.classList.remove('warn', 'out'); refs.timer.style.setProperty('--p', 100); refs.timer.querySelector('b').textContent = settings().answerTime;
    refs.next.hidden = true;
    refs.fifty.disabled = true; refs.fifty.classList.remove('used');

    // question text, word by word
    const words = wordsInto(refs.qText, q.q);
    refs.qBoard.classList.toggle('has-timer', !!settings().answerTime);
    const qMax = settings().answerTime ? 268 : 284;
    refs.qText.style.lineHeight = '';
    if (fit(refs.qText, [76, 72, 68, 64], qMax) === 64 && refs.qText.scrollHeight > qMax + 1) {
      refs.qText.style.lineHeight = '1.36';      // three comfortable lines at the 64px minimum before going smaller
      fit(refs.qText, [64, 60, 56, 52, 48, 44, 40], qMax);
    }
    words.forEach((w) => (w.style.opacity = 0));
    snd('question');
    const per = Math.max(55, Math.min(110, 900 / words.length));
    const lowfx = document.body.classList.contains('lowfx');
    await Promise.all(words.map((w, i) => animate(w, [
      { opacity: 0, transform: 'translateY(26px)', ...(lowfx ? {} : { filter: 'blur(10px)' }) },
      { opacity: 1, transform: 'none', ...(lowfx ? {} : { filter: 'blur(0)' }) },
    ], { duration: 620, delay: i * per, easing: 'cubic-bezier(.16,1,.3,1)' })));
    if (st !== my) return;

    // answers, staggered
    st.order.forEach((a, i) => {
      const b = refs.ans[i];
      b.className = 'ans';
      b.querySelector('.mark').innerHTML = '';
      const t = b.querySelector('.txt');
      t.textContent = a.text;
      b.style.opacity = '0';
    });
    // one font size for all four boards: the largest that fits every answer (1 line ≥46px, else 2 lines)
    const txts = refs.ans.map((b) => b.querySelector('.txt'));
    const fitsAt = (px, maxH) => txts.every((t) => { t.style.fontSize = px + 'px'; return t.scrollHeight <= maxH + 1; });
    const size = [52, 50, 48, 46].find((px) => fitsAt(px, 92)) || [44, 42, 40, 38, 36, 34].find((px) => fitsAt(px, 122)) || 34;
    txts.forEach((t) => (t.style.fontSize = size + 'px'));
    await sleep(120);
    if (st !== my) return;
    await Promise.all(refs.ans.map((b, i) => sleep(i * 150).then(() => {
      snd('answer', { index: i });
      return animate(b, [
        { opacity: 0, transform: 'translateY(24px) scale(.94)', ...(lowfx ? {} : { filter: 'blur(8px)' }) },
        { opacity: 1, transform: 'none', ...(lowfx ? {} : { filter: 'blur(0)' }) },
      ], { duration: 560, easing: 'cubic-bezier(.16,1,.3,1)' }).then((an) => { b.style.opacity = ''; an && an.cancel && an.cancel(); });
    })));
    if (st !== my) return;
    refs.ans.forEach((b) => b.classList.add('is-ready'));
    refs.fifty.disabled = false;
    st.phase = 'answering';
    startTimer();
  }

  // ---------------- answer timer ("זמן מענה מוגדר") ----------------
  const tm = { total: 0, left: 0, last: 0, raf: 0, running: false, sec: -1 };
  function startTimer() {
    const T = settings().answerTime;
    refs.timer.getAnimations().forEach((a) => a.cancel());
    refs.timer.hidden = !T;
    refs.timer.classList.remove('warn', 'out');
    if (!T) return;
    Object.assign(tm, { total: T * 1000, left: T * 1000, last: performance.now(), running: true, sec: -1 });
    animate(refs.timer, [{ opacity: 0, transform: 'scale(.5) rotate(-90deg)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    cancelAnimationFrame(tm.raf); tm.raf = requestAnimationFrame(tickTimer);
  }
  const overlayOpen = () => !!(CH.ui.modalOpen || (CH.admin && CH.admin.isOpen && CH.admin.isOpen()));
  function tickTimer(now) {
    if (!st || !tm.running) return;
    const dt = Math.max(0, now - tm.last); tm.last = Math.max(tm.last, now);
    if (!overlayOpen()) tm.left -= dt;           // frozen under help / exit dialog / admin
    const left = Math.min(tm.total, Math.max(0, tm.left)), sec = Math.ceil(left / 1000);
    refs.timer.style.setProperty('--p', (left / tm.total * 100).toFixed(2));
    if (sec !== tm.sec) {
      tm.sec = sec; refs.timer.querySelector('b').textContent = sec;
      if (sec <= 5 && sec > 0) { refs.timer.classList.add('warn'); snd('click'); }
    }
    if (left <= 0) { tm.running = false; refs.timer.classList.add('out'); timeUp(); return; }
    tm.raf = requestAnimationFrame(tickTimer);
  }
  function pauseTimer() { tm.running = false; cancelAnimationFrame(tm.raf); }
  function resumeTimer() { if (st && st.phase === 'answering' && tm.left > 0 && settings().answerTime) { tm.running = true; tm.last = performance.now(); tm.raf = requestAnimationFrame(tickTimer); } }

  /** Time ran out: no points, reveal the right answer. */
  async function timeUp() {
    if (!st || st.phase !== 'answering') return;
    st.phase = 'locked';
    refs.fifty.disabled = true;
    refs.ans.forEach((x) => { x.classList.remove('is-ready'); x.classList.add('is-dim'); });
    snd('wrong');
    refs.half.innerHTML = 'הזמן נגמר';
    refs.half.classList.add('is-timeout');
    refs.half.hidden = false;
    animate(refs.half, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    const my = st;
    await sleep(700);
    if (st !== my) return;
    const ci = st.order.findIndex((a) => a.correct);
    const cb = refs.ans[ci];
    cb.classList.remove('is-dim', 'is-gone');
    cb.classList.add('is-correct', 'is-reveal');
    cb.querySelector('.mark').innerHTML = CH.ui.icons.check;
    await afterReveal(false, 0, null, []);
  }

  async function select(i) {
    if (!st || st.phase !== 'answering' || st.removed.has(i)) return;
    st.phase = 'locked';
    pauseTimer();
    const b = refs.ans[i];
    refs.fifty.disabled = true;
    refs.ans.forEach((x, j) => { x.classList.remove('is-ready'); if (j !== i && !st.removed.has(j)) x.classList.add('is-dim'); });
    b.classList.add('is-locked');
    snd('lock');
    const my = st;
    await sleep(LOCK_MS);
    if (st !== my) return;
    CH.sound && CH.sound.stopAll && CH.sound.stopAll();

    const ci = st.order.findIndex((a) => a.correct);
    const ok = i === ci;
    const s = settings();
    const base = CH.store.pointsOf(st.qs[st.idx]);
    const pts = ok ? (st.used5050 && s.halveOn5050 ? base / 2 : base) : 0;
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
      if (st !== my) return;
      const cb = refs.ans[ci];
      cb.classList.remove('is-dim', 'is-gone');
      cb.classList.add('is-correct', 'is-reveal');
      cb.querySelector('.mark').innerHTML = CH.ui.icons.check;
    }
    await afterReveal(ok, pts, st.order[i].text, climbs);
  }

  /** Shared tail after a reveal: save, progress, source line, NEXT button. */
  async function afterReveal(ok, pts, chosen, climbs) {
    const c = st.cur;
    if (!refs.timer.hidden) animate(refs.timer, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.8)' }], { duration: 400, delay: 600 }).then(() => { refs.timer.hidden = true; refs.timer.getAnimations().forEach((a) => a.cancel()); });
    c.log[st.idx] = { qid: st.qs[st.idx].id, ok, pts, used5050: st.used5050, chosen, timeout: chosen == null };
    if (st.used5050) c.used5050 = (c.used5050 || 0) + 1;
    CH.store.saveCurrent({ idx: st.idx + 1, score: c.score, correct: c.correct, used5050: c.used5050, log: c.log });
    updateProgress();

    // source (bonus) + next button
    const my = st;
    await sleep(ok ? 500 : 250);
    if (st !== my) return;
    const src = st.qs[st.idx].source;
    if (src) {
      refs.source.querySelector('span').textContent = src;
      refs.source.hidden = false;
      snd('reveal');
      animate(refs.source, [{ opacity: 0, transform: 'translateY(-14px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
    await Promise.all(climbs);
    if (st !== my) return;
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
    sizeScore(fmtScore(newScore));
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
      refs.half.classList.remove('is-timeout');
      refs.half.innerHTML = `50:50 · השאלה שווה <b>${fmtScore(CH.store.pointsOf(st.qs[st.idx]) / 2)}</b> נק׳`;
      refs.half.hidden = false;
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
      st.finishing = true;
      const res = CH.store.finishParticipant();
      CH.ui.go(res ? 'result' : 'board', res ? { res, steps: st.qs.length } : {});
      return;
    }
    const my = st;
    // clear the boards
    animate(refs.next, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.9)' }], { duration: 260 }).then(() => (refs.next.hidden = true));
    animate(refs.source, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    animate(refs.half, [{ opacity: getComputedStyle(refs.half).opacity }, { opacity: 0 }], { duration: 300 });
    await Promise.all([
      animate(refs.qText, [{ opacity: 1, filter: 'blur(0)', transform: 'none' }, { opacity: 0, filter: 'blur(12px)', transform: 'translateY(-20px)' }], { duration: 420, easing: 'ease-in' }),
      ...refs.ans.map((b, i) => animate(b, [{ opacity: b.classList.contains('is-gone') ? 0 : 1, transform: 'none' }, { opacity: 0, transform: 'scale(.95)' }], { duration: 360, delay: i * 50, easing: 'ease-in' })),
    ]);
    if (st !== my) return;
    refs.qText.getAnimations().forEach((a) => a.cancel());
    refs.slots.forEach((sl) => sl.classList.remove('is-gone'));
    refs.ans.forEach((b) => { b.getAnimations().forEach((a) => a.cancel()); b.className = 'ans empty'; b.querySelector('.txt').textContent = ''; b.querySelector('.mark').innerHTML = ''; b.style.visibility = ''; });
    refs.fifty.hidden = false;
    st.idx += 1;
    await showQuestion();
  }

  async function exitPrompt() {
    if (!st || st.phase === 'locked' || st.phase === 'showing' || st.phase === 'leaving') return;
    pauseTimer();
    const r = await CH.ui.modal({
      title: `לצאת מכוורת ${st.cur.n}?`,
      body: 'ההתקדמות נשמרת — אפשר לחזור ולהמשיך מאותה נקודה.',
      actions: [{ key: 'stay', label: 'המשך לשחק', kind: 'gold' }, { key: 'leave', label: 'חזרה ללוח', kind: 'glass' }],
    });
    if (r && r.action === 'leave') {
      snd('back');
      if (st && st.phase === 'revealed' && st.idx + 1 >= st.qs.length) { st.finishing = true; const res = CH.store.finishParticipant(); return CH.ui.go('board', { flash: res && res.n }); }
      CH.ui.go('board');
    } else resumeTimer();
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
      if (st.ladder && st.ladder.el) animate(st.ladder.el, [{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 150, easing: 'cubic-bezier(.16,1,.3,1)' });
      CH.fx && CH.fx.setBackgroundIntensity && CH.fx.setBackgroundIntensity(0.5);
    },
    afterEnter() {},
    leave() { pauseTimer(); if (st && st.ladder) { try { st.ladder.destroy(); } catch (e) { /* ignore */ } } st = null; CH.sound && CH.sound.stopAll && CH.sound.stopAll(); },
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

  // The round was reset (or this hive cancelled) from the admin while it was open → leave cleanly.
  CH.u.bus.on('store:change', ({ what }) => {
    if (what !== 'round' || !st || st.finishing || CH.ui.current !== 'play') return;
    const c = CH.store.current();
    if (!c || c.n !== st.cur.n) { pauseTimer(); st.phase = 'leaving'; CH.ui.go('board'); }
  });

  // test hook (used by the automated e2e checks)
  CH.play = { get state() { return st && { phase: st.phase, idx: st.idx, order: st.order.map((a) => a.correct), removed: [...st.removed] }; } };
})(window.CH = window.CH || {});
