/* 01-store.js — data model + persistence (localStorage via CH.u.LS, always optional). */
(function (CH) {
  'use strict';
  const { LS, uid, shuffle, bus, cleanHebrew } = CH.u;

  const KEY = { settings: 'chm.v1.settings', sets: 'chm.v1.sets', active: 'chm.v1.activeSet', round: 'chm.v1.round' };

  const DEFAULT_SETTINGS = {
    title: 'כוכב התנ״ך',
    level: 'רמה 2',
    participants: 16,
    perParticipant: 4,          // 1 | 4 | 10
    points: 6,
    halveOn5050: true,
    stripCantillation: true,    // when pasting/importing: remove te'amim, keep nikud
    sound: true,
    answerTime: 30,             // seconds per question (0 = no timer) — "זמן מענה מוגדר"
    theme: 'modern',            // 'modern' (fresh concept, per the client's spec) | 'classic' (Jerusalem skyline)
  };

  // Demo questions — text copied verbatim from the brief (do not edit nikud).
  const DEMO_QUESTIONS = [
    { id: 'demo-1', q: 'בָּחוּר וָטוֹב מִשִּׁכְמוֹ וָמַעְלָה גָּבֹהַּ מִכָּל הָעָם', correct: 'שאול', wrong: ['שמשון', 'אליאב', 'דוד'], source: 'שמואל א׳ ט, ב' },
    { id: 'demo-2', q: 'וַיַּאַסְרוּהוּ בַּנְחֻשְׁתַּיִם וַיְהִי טוֹחֵן בְּבֵית הָאֲסוּרִים', correct: 'שמשון', wrong: ['מיכיהו', 'סיסרא', 'יוסף'], source: 'שופטים טז, כא' },
    { id: 'demo-3', q: 'אִישׁ בְּמָעוֹן וְלוֹ צֹאן שְׁלֹשֶׁת אֲלָפִים וְאֶלֶף עִזִּים', correct: 'נבל', wrong: ['איוב', 'כלב בן יפונה', 'ברזילי'], source: 'שמואל א׳ כה, ב' },
    { id: 'demo-4', q: 'לְמִי הִגִּישׁוּ לוֹ עֻגַת רְצָפִים וְצַפַּחַת מָיִם?', correct: 'אליהו', wrong: ['האיש המצרי', 'הגר', 'יונה'], source: 'מלכים א׳ יט, ו' },
  ];
  const DEMO_SET_ID = 'set-demo';
  const demoSet = () => ({ id: DEMO_SET_ID, name: 'רמה 2 — הדגמה', questions: DEMO_QUESTIONS.map((q) => ({ ...q, wrong: q.wrong.slice() })), updatedAt: Date.now() });

  const emptyRound = () => ({ id: uid(), results: {}, deck: [], current: null, startedAt: Date.now() });

  // ---------- state ----------
  let settings = { ...DEFAULT_SETTINGS, ...(LS.get(KEY.settings, {}) || {}) };
  let sets = LS.get(KEY.sets, null);
  if (!Array.isArray(sets) || !sets.length) sets = [demoSet()];
  let activeSetId = LS.get(KEY.active, null);
  if (!sets.some((s) => s.id === activeSetId)) activeSetId = sets[0].id;
  let round = LS.get(KEY.round, null);
  if (!round || typeof round !== 'object' || !round.results) round = emptyRound();

  const persist = {
    settings: () => LS.set(KEY.settings, settings),
    sets: () => { LS.set(KEY.sets, sets); LS.set(KEY.active, activeSetId); },
    round: () => LS.set(KEY.round, round),
  };
  const changed = (what) => { persist[what] && persist[what](); bus.emit('store:change', { what }); };

  // ---------- question helpers ----------
  /** Normalize any raw question-ish object into {id,q,correct,wrong[3],source}. */
  function normalizeQuestion(raw, opts = {}) {
    const clean = (s) => cleanHebrew(s, { stripCantillation: opts.stripCantillation ?? settings.stripCantillation });
    const wrong = Array.isArray(raw.wrong) ? raw.wrong : [raw.wrong1, raw.wrong2, raw.wrong3];
    return {
      id: raw.id && !opts.newId ? String(raw.id) : 'q-' + uid(),
      q: clean(raw.q ?? raw.question ?? ''),
      correct: clean(raw.correct ?? raw.answer ?? ''),
      wrong: [0, 1, 2].map((i) => clean(wrong[i] ?? '')),
      source: clean(raw.source ?? ''),
      points: (() => { const p = parseFloat(String(raw.points ?? raw['נקודות'] ?? raw['ניקוד'] ?? '').replace(',', '.')); return Number.isFinite(p) && p > 0 ? p : null; })(),
    };
  }
  /** Comparable text key (ignores nikud, te'amim, punctuation, spacing). */
  const textKey = (s) => String(s || '').replace(/[\u0591-\u05C7]/g, '').replace(/[^\u05D0-\u05EAa-z0-9]+/gi, ' ').trim();
  /** A set name not used by another set: 'רמה 1' → 'רמה 1 (2)'. */
  function uniqueName(name, exceptId) {
    const base = String(name || 'אוסף חדש').trim() || 'אוסף חדש';
    const taken = new Set(sets.filter((s) => s.id !== exceptId).map((s) => s.name));
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base} (${i})`)) return `${base} (${i})`;
  }
  /** Points a question is worth (its own value, or the game default). */
  function pointsOf(q) { return (q && q.points > 0 ? q.points : settings.points); }
  /** Returns array of Hebrew error strings (empty = valid). */
  function validateQuestion(q) {
    const errs = [];
    if (!q.q) errs.push('חסר טקסט שאלה');
    if (!q.correct) errs.push('חסרה תשובה נכונה');
    const w = (q.wrong || []).filter(Boolean);
    if (w.length < 3) errs.push(3 - w.length === 1 ? 'חסרה תשובה שגויה אחת' : `חסרות ${3 - w.length} תשובות שגויות`);
    const all = [q.correct, ...w].map((s) => s.trim());
    if (new Set(all).size !== all.length) errs.push('יש תשובות כפולות');
    return errs;
  }

  // ---------- sets ----------
  const getSet = (id) => sets.find((s) => s.id === id) || null;
  const activeSet = () => getSet(activeSetId) || sets[0];

  const api = {
    KEY, DEFAULT_SETTINGS, DEMO_QUESTIONS, DEMO_SET_ID,
    storageOk: LS.ok,
    normalizeQuestion, validateQuestion, pointsOf,

    // settings
    getSettings: () => ({ ...settings }),
    updateSettings(patch) {
      settings = { ...settings, ...patch };
      settings.participants = Math.max(1, Math.min(60, Math.round(+settings.participants || 16)));
      settings.perParticipant = [1, 4, 10].includes(+settings.perParticipant) ? +settings.perParticipant : 4;
      settings.points = Math.max(1, Math.min(1000, +settings.points || 6));
      settings.answerTime = [0, 10, 15, 20, 30, 45, 60, 90].includes(+settings.answerTime) ? +settings.answerTime : 30;
      settings.theme = settings.theme === 'classic' ? 'classic' : 'modern';
      changed('settings');
      return api.getSettings();
    },
    displayTitle() {
      const t = String(settings.title || '').trim(), l = String(settings.level || '').trim();
      return CH.u.typo(t && l ? `${t} – ${l}` : t || l || 'כוכב התנ״ך');
    },

    // sets
    getSets: () => sets,
    getSet,
    activeSet,
    activeSetId: () => activeSetId,
    setActive(id) { if (getSet(id)) { activeSetId = id; round.deck = []; changed('sets'); changed('round'); } },
    createSet(name, questions = []) {
      const s = { id: 'set-' + uid(), name: uniqueName(name), questions: questions.map((q) => normalizeQuestion(q, { newId: true })), updatedAt: Date.now() };
      sets.push(s); changed('sets'); return s;
    },
    renameSet(id, name) { const s = getSet(id); if (s && String(name).trim()) { s.name = uniqueName(name, id); s.updatedAt = Date.now(); changed('sets'); } return s && s.name; },
    duplicateSet(id) { const s = getSet(id); if (!s) return null; return api.createSet(s.name + ' (עותק)', s.questions); },
    deleteSet(id) {
      if (sets.length <= 1) return false;
      sets = sets.filter((s) => s.id !== id);
      if (activeSetId === id) { activeSetId = sets[0].id; round.deck = []; changed('round'); }
      changed('sets'); return true;
    },
    addQuestion(setId, raw = {}) {
      const s = getSet(setId); if (!s) return null;
      const q = normalizeQuestion(raw, { newId: true }); s.questions.push(q); s.updatedAt = Date.now(); changed('sets'); return q;
    },
    updateQuestion(setId, qid, patch) {
      const s = getSet(setId); if (!s) return null;
      const q = s.questions.find((x) => x.id === qid); if (!q) return null;
      Object.assign(q, patch); if (patch.wrong) q.wrong = patch.wrong.slice(0, 3);
      s.updatedAt = Date.now(); changed('sets'); return q;
    },
    deleteQuestion(setId, qid) {
      const s = getSet(setId); if (!s) return;
      s.questions = s.questions.filter((x) => x.id !== qid); s.updatedAt = Date.now();
      round.deck = round.deck.filter((x) => x !== qid); changed('sets'); changed('round');
    },
    appendQuestions(setId, list) { const s = getSet(setId); if (!s) return 0; const n = list.map((q) => normalizeQuestion(q, { newId: true })); s.questions.push(...n); s.updatedAt = Date.now(); changed('sets'); return n.length; },
    replaceQuestions(setId, list) { const s = getSet(setId); if (!s) return 0; s.questions = list.map((q) => normalizeQuestion(q, { newId: true })); s.updatedAt = Date.now(); round.deck = []; changed('sets'); changed('round'); return s.questions.length; },
    restoreDemo() {
      // Non-destructive: put back the 4 original demo questions (re-add missing, reset edited), keep everything else.
      const d = getSet(DEMO_SET_ID);
      if (d) {
        const fresh = demoSet().questions;
        const others = d.questions.filter((q) => !String(q.id).startsWith('demo-'));
        d.questions = [...fresh, ...others]; d.updatedAt = Date.now();
      } else sets.unshift(demoSet());
      activeSetId = DEMO_SET_ID; round.deck = []; changed('sets'); changed('round');
      return getSet(DEMO_SET_ID);
    },
    exportSet(id) {
      const s = getSet(id); if (!s) return null;
      return { format: 'chen-hatanach-questions', version: 1, name: s.name, exportedAt: new Date().toISOString(),
        questions: s.questions.map(({ q, correct, wrong, source, points }) => (points ? { q, correct, wrong, source, points } : { q, correct, wrong, source })) };
    },

    // ---------- round ----------
    getRound: () => round,
    /** Number of questions each participant actually gets (clamped by pool size). */
    questionsPerParticipant() { const ok = activeSet().questions.filter((q) => !validateQuestion(q).length); return Math.min(settings.perParticipant, new Set(ok.map((q) => textKey(q.q) + '|' + textKey(q.correct))).size); },
    resultOf: (n) => round.results[n] || null,
    resetRound() { round = emptyRound(); changed('round'); },
    textKey,
    /** Finish the in-progress hive if all its questions were answered; returns the result or null. */
    settleCurrent() { const c = round.current; return c && c.idx >= c.qids.length ? api.finishParticipant() : null; },
    unlockParticipant(n) { delete round.results[n]; if (round.current && round.current.n === n) round.current = null; changed('round'); },

    /** Draw k questions without repeats across participants until the pool runs out, then reshuffle. */
    drawQuestions(k) {
      const pool = activeSet().questions.filter((q) => !validateQuestion(q).length);
      const ids = new Set(pool.map((q) => q.id));
      round.deck = (round.deck || []).filter((id) => ids.has(id));
      const picked = [], keys = new Set(), byId = new Map(pool.map((q) => [q.id, q]));
      const want = Math.min(k, new Set(pool.map((q) => textKey(q.q) + '|' + textKey(q.correct))).size);
      let guard = pool.length * 3 + 10;
      while (picked.length < want && guard-- > 0) {
        if (!round.deck.length) round.deck = shuffle(pool.map((q) => q.id).filter((id) => !picked.includes(id)));
        if (!round.deck.length) break;
        const id = round.deck.shift(), q = byId.get(id), key = textKey(q.q) + '|' + textKey(q.correct);
        if (keys.has(key)) continue;            // same question text twice in one hive → skip the copy
        keys.add(key); picked.push(id);
      }
      changed('round');
      return picked.map((id) => pool.find((q) => q.id === id));
    },
    startParticipant(n) {
      if (round.current && round.current.n === n) return round.current; // resume
      const qs = api.drawQuestions(api.questionsPerParticipant());
      round.current = { n, qids: qs.map((q) => q.id), idx: 0, score: 0, correct: 0, used5050: 0, log: [], startedAt: Date.now() };
      changed('round'); return round.current;
    },
    current: () => round.current,
    currentQuestions() {
      const c = round.current; if (!c) return [];
      const s = activeSet();
      return c.qids.map((id) => s.questions.find((q) => q.id === id) || sets.flatMap((x) => x.questions).find((q) => q.id === id)).filter(Boolean);
    },
    saveCurrent(patch) { if (round.current) { Object.assign(round.current, patch); changed('round'); } },
    abandonCurrent() { round.current = null; changed('round'); },
    finishParticipant() {
      const c = round.current; if (!c) return null;
      const res = { n: c.n, score: c.score, correct: c.correct, total: c.qids.length, used5050: c.used5050 || 0, at: Date.now(),
        log: (c.log || []).map((l) => (l ? { ok: !!l.ok, pts: l.pts || 0, used5050: !!l.used5050 } : null)) };
      round.results[c.n] = res; round.current = null; changed('round'); return res;
    },
    leaderboard() {
      return Object.values(round.results).filter((r) => r.n <= settings.participants)
        .sort((a, b) => b.score - a.score || b.correct - a.correct || a.at - b.at);
    },
  };

  // A hive whose every question was already answered (e.g. reload before 'לתוצאה') is recorded, never lost.
  if (round.current && round.current.qids && round.current.idx >= round.current.qids.length) api.finishParticipant();
  CH.store = api;
})(window.CH = window.CH || {});
