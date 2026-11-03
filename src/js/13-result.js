/* 13-result.js — end of a participant's round: wreath draws around the score, confetti, correct count, BACK. */
(function (CH) {
  'use strict';
  const { h, animate, sleep, fmtScore, countUp } = CH.u;
  const U_fmt = (n) => fmtScore(n);
  const el = document.getElementById('scr-result');
  let ctx = null;

  function headline(res) {
    if (!res.total) return 'יישר כוח!';
    if (res.correct === res.total) return 'מושלם!';
    if (res.correct * 2 >= res.total) return 'כל הכבוד!';
    return 'יישר כוח!';
  }

  function render(res, steps) {
    el.innerHTML = '';
    const log = res;
    const marks = h('div.rs-marks');
    (ctx.log || []).forEach((l) => marks.append(h('i.' + (l && l.ok ? 'ok' : 'bad'), { html: l && l.ok ? CH.ui.icons.check : CH.ui.icons.x })));
    const val = h('div.val.gold-text', '0');
    const wreathHost = h('div.wreath-host');
    const backBtn = h('button.btn.btn-gold', { type: 'button', onclick: back, html: `${CH.ui.icons.back}<span>חזור</span><span class="sep"></span><span class="en">BACK</span>` });
    const ladderBox = h('div.ladder-box');
    el.append(
      h('header.scr-head', h('div.ph-brand', h('div.emb', { html: CH.emblemSvg({ shaded: true }) }), h('div', h('div.t1.gold-text', CH.store.displayTitle())))),
      ladderBox,
      h('div.rs-main',
        h('div.rs-who', { style: { '--c': CH.participantColor(log.n) } }, h('i'), `כוורת ${log.n}`),
        h('h1.rs-head.gold-text', headline(log)),
        h('div.rs-wreath', wreathHost, h('div.rs-score', val, h('div.unit', log.score === 1 ? 'נקודה' : 'נקודות'))),
        h('div.rs-stats', log.total === 1 ? h('span', log.correct ? 'תשובה נכונה' : 'תשובה לא נכונה') : h('span', h('b', String(log.correct)), ` מתוך ${log.total} תשובות נכונות`), marks)),
      h('div.rs-actions', backBtn));
    ctx.val = val; ctx.backBtn = backBtn;
    const len = U_fmt(log.score).length; val.style.fontSize = (len <= 3 ? 196 : len === 4 ? 160 : 128) + 'px';
    CH.u.fitWidth(el.querySelector('.ph-brand .t1'), 44, 26);
    ctx.wreath = CH.wreath && CH.wreath.create ? safe(() => CH.wreath.create(wreathHost)) : null;
    ctx.ladder = CH.ladder && CH.ladder.create ? safe(() => CH.ladder.create(ladderBox, { steps: steps || log.total || 1, level: log.correct })) : null;
  }
  const safe = (fn) => { try { return fn(); } catch (e) { console.error(e); return null; } };

  async function choreo() {
    const my = ctx; const res = my.res;
    const head = el.querySelector('.rs-head'), who = el.querySelector('.rs-who'), stats = el.querySelector('.rs-stats'), acts = el.querySelector('.rs-actions');
    animate(who, [{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
    animate(head, [{ opacity: 0, transform: 'scale(.6)', filter: 'blur(14px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 900, delay: 150, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    const wreathP = my.wreath ? my.wreath.play() : sleep(800);
    await sleep(500);
    if (my !== ctx) return;
    // score counts up
    const ticks = setInterval(() => CH.sound && CH.sound.play('score'), 90);
    await countUp(my.val, 0, res.score, Math.min(1600, 500 + res.score * 40));
    clearInterval(ticks);
    if (my !== ctx) return;
    CH.sound && CH.sound.play('victory');
    const r = CH.stage.rectOf(my.val);
    if (CH.fx && CH.fx.confetti) {
      const big = res.correct * 2 >= res.total && res.score > 0;
      // cannons from beside the wreath, aimed outward so the score stays readable
      CH.fx.confetti({ x: r.cx - 420, y: r.cy + 180, count: big ? 170 : 90, angle: -120, spread: 50, power: 1.15 });
      CH.fx.confetti({ x: r.cx + 420, y: r.cy + 180, count: big ? 170 : 90, angle: -60, spread: 50, power: 1.15 });
      if (big) setTimeout(() => my === ctx && CH.fx.confetti({ rain: true, duration: 3200, count: 220 }), 450);
    }
    CH.fx && CH.fx.burst && CH.fx.burst(r.cx, r.cy, { kind: 'ring', count: 40 });
    my.ladder && my.ladder.cheer && my.ladder.cheer();
    animate(my.val.parentElement, [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 700, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    await wreathP;
    animate(stats, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
    stats.querySelectorAll('.rs-marks i').forEach((m, i) => animate(m, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 500, delay: 200 + i * 90, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'backwards' }));
    await sleep(500);
    animate(acts, [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    my.ready = true;
  }

  function back() {
    if (!ctx || ctx.leaving) return;
    ctx.leaving = true;
    CH.sound && CH.sound.play('back');
    const n = ctx.res.n;
    CH.ui.go('board', { flash: n });
  }

  CH.ui.register('result', {
    enter(params = {}) {
      const res = params.res || { n: 0, score: 0, correct: 0, total: 0 };
      ctx = { res, log: res.log || [] };
      render(res, params.steps);
      el.querySelectorAll('.rs-who, .rs-head').forEach((x) => (x.style.opacity = 0));
      CH.fx && CH.fx.setBackgroundIntensity && CH.fx.setBackgroundIntensity(1.2);
      choreo();
    },
    leave() { if (ctx) { ctx.ladder && safe(() => ctx.ladder.destroy()); } ctx = null; CH.fx && CH.fx.clear && CH.fx.clear(); CH.sound && CH.sound.stopAll && CH.sound.stopAll(); },
    onKey(e) {
      if (e.code === 'Escape') { e.preventDefault(); back(); return; }
      // Space/Enter only once the celebration has played (a stray second press must not skip it)
      if ((e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && ctx && ctx.ready) { e.preventDefault(); back(); }
    },
  });
})(window.CH = window.CH || {});
