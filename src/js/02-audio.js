/* 02-audio.js — CH.sound: an original, fully synthesized WebAudio sound design (no samples, no recordings).
 *
 * Every sound is a function (ctx, d, t0, opts) that schedules nodes into d = { out, fx } (dry bus + reverb send),
 * so it renders identically on a live AudioContext and on an OfflineAudioContext (CH.sound.render, for tests).
 * Master: dry+reverb → HPF 35 Hz → DynamicsCompressor → trim → soft ceiling (WaveShaper, max ≈ −1.2 dBFS) → mute.
 * 60 fps: the room/noise and START are prepared in idle time before the first gesture; after unlock the bigger sounds
 * are baked offline into stems, so play() costs well under 1 ms of main thread at the big moments.
 * Musical frame: the whole game lives in D major (pentatonic D E F♯ A B). "lock" hangs on A (the dominant), so
 * "correct" lands home on D and "wrong" sinks to D minor.
 */
(function (CH) {
  'use strict';

  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;

  // ───────────────────────── small math ─────────────────────────
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PENTA = [0, 2, 4, 7, 9];
  /** i-th note of the D-major pentatonic counted up from `base` (a MIDI D; default D4). */
  const penta = (i, base = 62) => base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = Math.random;                       // swapped for a seeded PRNG during offline renders
  const rr = (a, b) => a + rnd() * (b - a);

  // ───────────────────────── envelopes ─────────────────────────
  /** Percussive: linear attack, exponential decay to −60 dB at t+dur, then a tiny ramp to true zero. */
  function envPerc(p, t, peak, a, dur) {
    const end = t + Math.max(dur, a + 0.006);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(peak * 0.001, end);
    p.linearRampToValueAtTime(0, end + 0.006);
  }
  /** Sustained: attack → decay to peak·s → hold → release (time-constant) starting at tr, ~silent at tr+r. */
  function envASR(p, t, peak, a, d, s, tr, r) {
    tr = Math.max(tr, t + a + 0.004);
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (s !== 1) p.setTargetAtTime(peak * s, t + a, d / 3);
    p.setTargetAtTime(0, tr, r / 6);
    return tr + r;
  }
  /** Smooth swell 0 → 1 → 0 whose maximum sits at `at` (0..1) — for noise sweeps. */
  const swell = (at) => { const k = Math.log(0.5) / Math.log(at); return (x) => Math.pow(Math.sin(Math.PI * Math.pow(x, k)), 2); };
  function envCurve(p, t, dur, peak, shape) {
    const n = 96, c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = peak * shape(i / (n - 1));
    c[0] = 0; c[n - 1] = 0;
    p.value = 0;
    p.setValueCurveAtTime(c, t, dur);
  }

  // ───────────────────────── node helpers ─────────────────────────
  function gainNode(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function filter(ctx, type, f, q = 0.707) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  /** StereoPanner into dest (or dest itself when panning isn't available / not needed). */
  function panner(ctx, dest, x) {
    if (!x || !ctx.createStereoPanner) return dest;
    const p = ctx.createStereoPanner(); p.pan.value = x; p.connect(dest); return p;
  }
  /** Sub-bus inside a voice: gain → (high-pass) → pan → dry, plus a reverb send of `wet`.
   *  `hp` cleans bright layers: very fast mallet attacks otherwise leave a faint low "tock" on hall speakers. */
  function layer(ctx, d, { gain = 1, wet = 0, pan = 0, hp = 0 } = {}) {
    const g = gainNode(ctx, gain);
    let src = g;
    if (hp) { src = filter(ctx, 'highpass', hp, 0.6); g.connect(src); }
    src.connect(panner(ctx, d.out, pan));
    if (wet > 0) { const s = gainNode(ctx, wet); src.connect(s); s.connect(d.fx); }
    return g;
  }

  // ───────────────────────── procedural buffers (cached per sample rate, context-free) ─────────────────────────
  /** AudioBuffers aren't tied to a context, so they can be prepared before the first gesture (see warm()). */
  function mkBuffer(ch, n, sr, ctx) {
    try { return new AudioBuffer({ numberOfChannels: ch, length: n, sampleRate: sr }); } catch (e) { return (ctx || {}).createBuffer(ch, n, sr); }
  }
  const noiseCache = new Map();
  function noiseBuffer(ctx, sr = ctx.sampleRate) {
    let b = noiseCache.get(sr);
    if (!b) {
      const n = Math.floor(sr * 2), r = mulberry32(99);
      b = mkBuffer(1, n, sr, ctx);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
      noiseCache.set(sr, b);
    }
    return b;
  }

  /** Karplus–Strong plucked string rendered into a buffer (allpass-tuned, normalised, cached). */
  const ksCache = new Map();
  function ksBuffer(ctx, f, dur, bright, t60, sr = ctx.sampleRate) {
    const key = sr + '|' + f.toFixed(2) + '|' + dur + '|' + bright + '|' + t60;
    let b = ksCache.get(key);
    if (b) return b;
    const n = Math.ceil(sr * dur), P = sr / f - 0.5;
    const L = Math.max(2, Math.floor(P - 0.1)), D = P - L, C = (1 - D) / (1 + D);
    const ring = new Float32Array(L), r = mulberry32(Math.round(f * 100));
    // excitation: triangular pluck shape (stable fundamental) + a little noise for grit, one-pole lowpassed
    const k = 0.06 + 0.9 * bright, mix = 0.12 + 0.5 * bright, bp = Math.max(1, Math.round(L * 0.27));
    let lp = 0, mean = 0;
    for (let i = 0; i < L; i++) {
      const tri = i < bp ? i / bp : (L - i) / (L - bp);
      lp += ((1 - mix) * (2 * tri - 1) + mix * (r() * 2 - 1) - lp) * k;
      ring[i] = lp; mean += lp;
    }
    mean /= L;
    for (let i = 0; i < L; i++) ring[i] -= mean;
    const rho = Math.pow(10, -3 / (t60 * f));
    b = mkBuffer(1, n, sr, ctx);
    const out = b.getChannelData(0);
    let idx = 0, prev = 0, apx = 0, apy = 0, peak = 1e-9;
    for (let i = 0; i < n; i++) {
      const cur = ring[idx];
      out[i] = cur;
      const ab = cur < 0 ? -cur : cur; if (ab > peak) peak = ab;
      const avg = 0.5 * (cur + prev); prev = cur;
      const ap = C * avg + apx - C * apy; apx = avg; apy = ap;
      ring[idx] = ap * rho;
      if (++idx === L) idx = 0;
    }
    const g = 1 / peak, fade = Math.min(n, Math.floor(sr * 0.03));
    for (let i = 0; i < n; i++) out[i] *= g;
    for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
    if (ksCache.size > 96) ksCache.delete(ksCache.keys().next().value);
    ksCache.set(key, b);
    return b;
  }

  /** Oscillator with percussive envelope and optional exponential glide f → f1. */
  function tone(ctx, dest, t, f, { type = 'sine', amp = 0.1, a = 0.003, dur = 0.3, f1 = 0, glide = 0, detune = 0 } = {}) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + (glide || dur));
    if (detune) o.detune.value = detune;
    const g = gainNode(ctx, 0);
    envPerc(g.gain, t, amp, a, dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
    return o;
  }

  /** Struck metal: additive partials [ratio, level, decay-scale]. glock = tuned bar, celesta = soft bar, chime = warm bell. */
  const TIMBRE = {
    glock: [[1, 1, 1], [2.76, 0.3, 0.32], [5.4, 0.12, 0.16], [8.93, 0.05, 0.08]],
    celesta: [[1, 1, 1], [2, 0.1, 0.5], [3.99, 0.16, 0.24], [9.9, 0.03, 0.08]],
    chime: [[1, 1, 1], [2, 0.38, 0.55], [3, 0.16, 0.38], [4.2, 0.09, 0.24], [5.43, 0.05, 0.14]],
  };
  function bell(ctx, dest, t, f, { amp = 0.1, dur = 1, kind = 'glock', a = 0.0015, beat = 0 } = {}) {
    const nyq = ctx.sampleRate * 0.45;
    for (const [r, w, k] of TIMBRE[kind]) if (f * r < nyq) tone(ctx, dest, t, f * r, { amp: amp * w, a, dur: dur * k });
    if (beat) tone(ctx, dest, t, f + beat, { amp: amp * 0.32, a: a * 6, dur });   // slow beating = shimmer
  }

  function pluck(ctx, dest, t, f, { amp = 0.2, dur = 0.8, bright = 0.5, t60 = 1, a = 0.0015 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = ksBuffer(ctx, f, dur, bright, t60);
    const g = gainNode(ctx, 0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + a);
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + dur + 0.01);
  }

  /** Filtered noise. Filter sweeps f → f1 (→ f2); amplitude percussive, or a swell curve when `shape` is given. */
  function noise(ctx, dest, t, dur, { amp = 0.1, type = 'bandpass', f = 1000, f1 = 0, f2 = 0, q = 0.8, a = 0.004, shape = null } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx); src.loop = true;
    const bq = filter(ctx, type, f, q);
    if (f1) {
      bq.frequency.setValueAtTime(f, t);
      bq.frequency.exponentialRampToValueAtTime(f1, t + (f2 ? dur * 0.55 : dur));
      if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t + dur);
    }
    const g = gainNode(ctx, 0);
    if (shape) envCurve(g.gain, t, dur, amp, shape); else envPerc(g.gain, t, amp, a, dur);
    src.connect(bq); bq.connect(g); g.connect(dest);
    src.start(t, rnd() * 1.5); src.stop(t + dur + 0.02);
  }

  /** Subtractive voice: n detuned oscillators → lowpass with its own envelope → VCA. `len` = time until release. */
  function synth(ctx, dest, t, f, len, o = {}) {
    const { type = 'sawtooth', n = 3, spread = 8, amp = 0.04, a = 0.02, d = 0.2, s = 0.7, r = 0.3,
      cut = 2000, cut0 = cut, cutS = cut, cutT = 0.08, q = 0.7, scoop = 0, vib = 0, vibAt = 0.3, vibRate = 5.4, drift = 0 } = o;
    const lp = filter(ctx, 'lowpass', cut0, q);
    lp.frequency.setValueAtTime(cut0, t);
    lp.frequency.linearRampToValueAtTime(cut, t + cutT);
    lp.frequency.setTargetAtTime(cutS, t + cutT, 0.15);
    const g = gainNode(ctx, 0);
    const end = envASR(g.gain, t, amp, a, d, s, t + len, r);
    lp.connect(g); g.connect(dest);
    let vg = null;
    if (vib) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = vibRate;
      vg = gainNode(ctx, 0);
      vg.gain.setValueAtTime(0, t + vibAt); vg.gain.linearRampToValueAtTime(vib, t + vibAt + 0.25);
      lfo.connect(vg); lfo.start(t); lfo.stop(end + 0.02);
    }
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      osc.type = type; osc.frequency.value = f;
      const det = n > 1 ? (2 * i / (n - 1) - 1) * spread : 0;
      osc.detune.setValueAtTime(det - scoop, t);
      if (scoop) osc.detune.linearRampToValueAtTime(det, t + 0.06);
      if (drift) osc.detune.linearRampToValueAtTime(det + drift, t + len);
      if (vg) vg.connect(osc.detune);
      osc.connect(lp); osc.start(t); osc.stop(end + 0.02);
    }
  }

  /** Low body hit with a pitch drop; the 2nd harmonic keeps it audible on small projector speakers. */
  function thump(ctx, dest, t, { f0 = 100, f1 = 48, amp = 0.3, dur = 0.2, harm = 0.45 } = {}) {
    tone(ctx, dest, t, f0, { f1, glide: dur * 0.6, amp, a: 0.003, dur });
    tone(ctx, dest, t, f0 * 2, { type: 'triangle', f1: f1 * 2, glide: dur * 0.5, amp: amp * harm, a: 0.003, dur: dur * 0.6 });
    noise(ctx, dest, t, 0.035, { amp: amp * 0.18, type: 'lowpass', f: 700, q: 0.6, a: 0.002 });
  }

  /** Timpani: circular-membrane modes with a slight pitch settle, plus a felt-mallet thud. */
  function timp(ctx, dest, t, f, amp, dur = 1) {
    for (const [r, w, k] of [[1, 1, 1], [1.5, 0.62, 0.75], [1.99, 0.42, 0.6], [2.44, 0.2, 0.4], [2.98, 0.1, 0.3]])
      tone(ctx, dest, t, f * r * 1.012, { f1: f * r, glide: 0.08, amp: amp * w, a: 0.004, dur: dur * k });
    noise(ctx, dest, t, 0.06, { amp: amp * 0.35, type: 'lowpass', f: 800, q: 0.6, a: 0.002 });
  }

  /** Synth brass: detuned saws, filter "blat" on the attack, a small pitch scoop, delayed vibrato on long notes. */
  function brass(ctx, dest, t, f, len, { amp = 0.04, long = false, bright = 1 } = {}) {
    synth(ctx, dest, t, f, len, {
      type: 'sawtooth', n: 3, spread: 7, amp, a: 0.028, d: 0.16, s: 0.78, r: long ? 0.45 : 0.08,
      cut0: f * 1.3, cut: Math.min(f * 7 * bright, 6500), cutS: Math.min(f * 4.2 * bright, 4200), cutT: 0.06, q: 1.1,
      scoop: 30, vib: long ? 9 : 0, vibAt: 0.35, vibRate: 5.2,
    });
  }

  /** Little glockenspiel pings from the pentatonic. ordered=true walks lo → hi (or hi → lo if lo > hi). */
  function sparkles(ctx, d, t, span, count, { base = 86, lo = 0, hi = 9, ordered = false, amp = 0.03, wet = 0.5, dur = 0.4 } = {}) {
    for (let i = 0; i < count; i++) {
      const k = count > 1 ? i / (count - 1) : 0;
      const at = t + (ordered ? k * span : rnd() * span);
      const idx = ordered ? Math.round(lo + (hi - lo) * k) : Math.floor(rr(Math.min(lo, hi), Math.max(lo, hi) + 1));
      const L = layer(ctx, d, { wet, pan: rr(-0.6, 0.6), hp: 500 });
      const fade = 1 - 0.55 * ((at - t) / (span || 1));   // the shimmer thins out as it goes
      bell(ctx, L, at, mtof(penta(idx, base)), { amp: amp * fade * rr(0.6, 1), dur: dur * rr(0.75, 1.15), kind: 'glock', a: 0.0025 });
    }
  }

  // ───────────────────────── the sounds ─────────────────────────
  function sClick(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.05, hp: 300 });
    tone(ctx, L, t, 1240, { f1: 1020, glide: 0.03, amp: 0.2, a: 0.0012, dur: 0.05 });   // woody body
    tone(ctx, L, t, 2790, { amp: 0.06, a: 0.0008, dur: 0.022 });                        // upper mode
    noise(ctx, L, t, 0.014, { amp: 0.07, type: 'bandpass', f: 4200, q: 0.9, a: 0.0006 }); // tick
  }

  function sHover(ctx, d, t) {
    // a soft wind-chime: each hover picks a high pentatonic note, so sweeping across tiles sounds musical
    const L = layer(ctx, d, { wet: 0.3, pan: rr(-0.3, 0.3), hp: 600 });
    const f = mtof(penta(Math.floor(rr(0, 5)), 98));
    tone(ctx, L, t, f, { amp: 0.026, a: 0.0015, dur: 0.09 });
    tone(ctx, L, t, f * 2.76, { amp: 0.006, a: 0.001, dur: 0.03 });
  }

  function sModal(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.35 });
    tone(ctx, L, t, 330, { f1: 720, glide: 0.07, amp: 0.13, a: 0.004, dur: 0.16 });             // bubble pop
    noise(ctx, L, t, 0.42, { amp: 0.06, type: 'bandpass', f: 700, f1: 2600, q: 1, shape: swell(0.25) }); // airy bloom
    bell(ctx, L, t + 0.03, mtof(81), { amp: 0.05, dur: 0.55, kind: 'celesta' });                  // A5 glint
  }

  function sWhoosh(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.3 });
    let dest = L;
    if (ctx.createStereoPanner) {                // travels right → left, like Hebrew reading
      const p = ctx.createStereoPanner();
      p.pan.setValueAtTime(0.55, t); p.pan.linearRampToValueAtTime(-0.55, t + 0.5);
      p.connect(L); dest = p;
    }
    noise(ctx, dest, t, 0.52, { amp: 0.22, type: 'bandpass', f: 260, f1: 2600, f2: 900, q: 1.1, shape: swell(0.45) });
    noise(ctx, dest, t, 0.5, { amp: 0.1, type: 'lowpass', f: 450, f1: 1500, f2: 600, q: 0.5, shape: swell(0.5) });
  }

  function sStart(ctx, d, t) {
    const B = layer(ctx, d, { wet: 0.38, hp: 160 });
    [74, 78, 81, 86, 90].forEach((m, i) => {          // D5 F♯5 A5 D6 F♯6 — bell + harp, rising right → left
      const at = t + i * 0.065, last = i === 4, p = panner(ctx, B, 0.3 - i * 0.15);
      bell(ctx, p, at, mtof(m), { amp: last ? 0.11 : 0.085, dur: last ? 1.35 : 0.95, kind: 'chime', beat: 1.3 });
      pluck(ctx, p, at, mtof(m - 12), { amp: 0.1, dur: 0.9, bright: 0.55, t60: 1.1 });
    });
    const P = layer(ctx, d, { wet: 0.4 });            // warm add9 pad swelling underneath
    [62, 69, 76, 78].forEach((m) => synth(ctx, P, t, mtof(m), 1.05, { amp: 0.022, a: 0.3, d: 0.4, s: 0.8, r: 0.4, cut: 1600, n: 2, spread: 10 }));
    tone(ctx, P, t, mtof(50), { amp: 0.08, a: 0.03, dur: 1.2 });
    sparkles(ctx, d, t + 0.32, 0.9, 9, { base: 86, lo: 0, hi: 9, amp: 0.03 });
    noise(ctx, B, t + 0.25, 1.15, { amp: 0.018, type: 'highpass', f: 7000, q: 0.5, shape: swell(0.35) });
  }

  function sTile(ctx, d, t) {
    const B = layer(ctx, d, { wet: 0.35, hp: 250 });
    bell(ctx, B, t, mtof(81), { amp: 0.1, dur: 0.55, kind: 'chime', beat: 1.1 });          // A5
    bell(ctx, B, t + 0.085, mtof(86), { amp: 0.12, dur: 0.7, kind: 'chime', beat: 1.4 });  // D6
    pluck(ctx, B, t + 0.085, mtof(74), { amp: 0.1, dur: 0.6, bright: 0.5, t60: 0.8 });
    sparkles(ctx, d, t + 0.12, 0.26, 7, { base: 86, lo: 2, hi: 9, ordered: true, amp: 0.035 });
    noise(ctx, B, t + 0.05, 0.55, { amp: 0.015, type: 'highpass', f: 7500, shape: swell(0.3) });
  }

  function sQuestion(ctx, d, t) {
    const H = layer(ctx, d, { wet: 0.32, hp: 150 });
    const N = 11;                                     // harp/celesta glissando D4 → D6 (pentatonic)
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1), at = t + i * 0.048, f = mtof(penta(i, 62)), p = panner(ctx, H, 0.4 - 0.8 * k);
      pluck(ctx, p, at, f, { amp: 0.085 + 0.045 * k, dur: 0.5, bright: 0.6, t60: 0.9 });
      bell(ctx, p, at, f * 2, { amp: 0.014 + 0.024 * k, dur: 0.4, kind: 'celesta' });
    }
  }

  function sAnswer(ctx, d, t, o) {
    const i = Math.max(0, Math.min(7, o.index | 0));
    const f = mtof(penta(i + 5, 62));                 // D5, E5, F♯5, A5 …
    const L = layer(ctx, d, { wet: 0.22, pan: i % 2 ? -0.22 : 0.22, hp: 200 });
    pluck(ctx, L, t, f, { amp: 0.16, dur: 0.5, bright: 0.24, t60: 0.55, a: 0.003 });
    tone(ctx, L, t, f, { amp: 0.06, a: 0.004, dur: 0.28 });
  }

  const LOCK = 1.5;
  function sLock(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.2 });
    const env = gainNode(ctx, 1);                     // whole sound is cut off, unresolved, at 1.5 s
    env.gain.setValueAtTime(1, t + LOCK - 0.06); env.gain.linearRampToValueAtTime(0, t + LOCK + 0.04);
    env.connect(L);
    // heartbeat: lub-dub, accelerating and getting stronger
    for (let x = 0, iv = 0.42; x < LOCK - 0.2; x += iv, iv *= 0.82) {
      const v = 0.6 + 0.4 * (x / LOCK);
      thump(ctx, env, t + x, { f0: 96, f1: 48, amp: 0.36 * v, dur: 0.2 });
      thump(ctx, env, t + x + iv * 0.3, { f0: 84, f1: 44, amp: 0.22 * v, dur: 0.16 });
    }
    // drone: A sus4 (A2 E3 A3 D4), filter opening and pitch slowly drifting up
    const dl = filter(ctx, 'lowpass', 160, 4.5);
    dl.frequency.setValueAtTime(160, t); dl.frequency.exponentialRampToValueAtTime(2600, t + LOCK);
    const dg = gainNode(ctx, 0);
    dg.gain.setValueAtTime(0, t); dg.gain.linearRampToValueAtTime(0.05, t + 0.35); dg.gain.linearRampToValueAtTime(0.09, t + LOCK);
    dl.connect(dg); dg.connect(env);
    for (const [m, c] of [[45, -6], [45, 7], [52, 0], [57, 4], [62, -3]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
      o.detune.setValueAtTime(c, t); o.detune.linearRampToValueAtTime(c + 45, t + LOCK);
      o.connect(dl); o.start(t); o.stop(t + LOCK + 0.06);
    }
    // shimmer: high sus cluster with an accelerating tremolo
    const sg = gainNode(ctx, 0);
    sg.gain.setValueAtTime(0, t + 0.2); sg.gain.linearRampToValueAtTime(0.028, t + LOCK);
    const tg = gainNode(ctx, 0.5), lfo = ctx.createOscillator(), la = gainNode(ctx, 0.5);
    lfo.frequency.setValueAtTime(6, t); lfo.frequency.exponentialRampToValueAtTime(17, t + LOCK);
    lfo.connect(la); la.connect(tg.gain); tg.connect(sg); sg.connect(env);
    lfo.start(t); lfo.stop(t + LOCK + 0.06);
    for (const m of [88, 93, 98]) {
      const o = ctx.createOscillator(); o.frequency.value = mtof(m); o.detune.value = rr(-6, 6);
      o.connect(tg); o.start(t); o.stop(t + LOCK + 0.06);
    }
    noise(ctx, env, t, LOCK + 0.04, { amp: 0.045, type: 'bandpass', f: 450, f1: 5000, q: 1.6, shape: (x) => x * x * (1 - Math.pow(x, 30)) });
  }

  function sCorrect(ctx, d, t) {
    const B = layer(ctx, d, { wet: 0.32, hp: 250 });
    [74, 78, 81, 86].forEach((m, i) => {              // D major bells, quick upward strum
      bell(ctx, B, t + i * 0.022, mtof(m), { amp: 0.1, dur: 1.5 - i * 0.1, kind: 'chime', beat: 1 + i * 0.4 });
      pluck(ctx, B, t + i * 0.022, mtof(m), { amp: 0.07, dur: 1, bright: 0.65, t60: 1.2 });
    });
    const P = layer(ctx, d, { wet: 0.3 });            // warm pad D3 A3 D4 F♯4
    [50, 57, 62, 66].forEach((m) => synth(ctx, P, t, mtof(m), 0.75, { amp: 0.035, a: 0.02, d: 0.3, s: 0.55, r: 0.6, cut0: 500, cut: 2600, cutS: 1300, n: 3, spread: 9 }));
    tone(ctx, P, t, mtof(50), { amp: 0.1, a: 0.01, dur: 0.9 });
    sparkles(ctx, d, t + 0.1, 0.38, 9, { base: 86, lo: 4, hi: 12, ordered: true, amp: 0.035 });
    noise(ctx, B, t, 0.5, { amp: 0.03, type: 'highpass', f: 6500, a: 0.002 });
  }

  function sWrong(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.25 });
    const note = (at, m, len, droop) => {            // soft "bwom": triangle + sine octave, closing filter
      const f = mtof(m);
      const lp = filter(ctx, 'lowpass', 1400, 0.7);
      lp.frequency.setValueAtTime(1400, at); lp.frequency.exponentialRampToValueAtTime(560, at + len);
      const g = gainNode(ctx, 0);
      const end = envASR(g.gain, at, 0.17, 0.025, 0.35, 0.55, at + len - 0.15, 0.32);
      lp.connect(g); g.connect(L);
      for (const [type, mul, lvl] of [['triangle', 1, 1], ['sine', 2, 0.4], ['sine', 0.5, 0.28]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
        if (droop) { o.detune.setValueAtTime(0, at + len * 0.3); o.detune.linearRampToValueAtTime(-55, at + len + 0.2); }
        const og = gainNode(ctx, lvl); o.connect(og); og.connect(lp);
        o.start(at); o.stop(end + 0.03);
      }
    };
    note(t, 53, 0.36, false);                         // F3
    note(t + 0.34, 50, 0.78, true);                   // D3 — minor third down, drooping
  }

  function poof(ctx, d, t, { pan, f, f1, amp, bub }) {
    const L = layer(ctx, d, { wet: 0.4, pan });
    noise(ctx, L, t, 0.42, { amp, type: 'lowpass', f, f1, q: 0.8, a: 0.012 });
    tone(ctx, L, t, bub[0], { f1: bub[1], glide: 0.2, amp: amp * 0.45, a: 0.006, dur: 0.24 });
  }
  function sFifty(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.35 });
    noise(ctx, L, t, 0.45, { amp: 0.07, type: 'bandpass', f: 1400, f1: 7000, q: 2.5, shape: swell(0.4) }); // magic swish
    sparkles(ctx, d, t + 0.02, 0.3, 7, { base: 86, lo: 12, hi: 4, ordered: true, amp: 0.03 });
    poof(ctx, d, t + 0.36, { pan: 0.35, f: 3800, f1: 260, amp: 0.16, bub: [560, 190] });
    poof(ctx, d, t + 0.64, { pan: -0.35, f: 3000, f1: 200, amp: 0.14, bub: [430, 140] });
  }

  function sClimb(ctx, d, t, o) {
    const step = Math.max(0, Math.min(9, o.step | 0));
    const f = mtof(penta(5 + step, 62));              // D5, then up the pentatonic ladder if opts.step is given
    const L = layer(ctx, d, { wet: 0.2, hp: 140 });
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * 0.5, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 13;   // spring wobble, dying away
    const dep = gainNode(ctx, 0);
    dep.gain.setValueAtTime(f * 0.06, t + 0.06); dep.gain.exponentialRampToValueAtTime(f * 0.002, t + 0.42);
    lfo.connect(dep); dep.connect(osc.frequency);
    const lp = filter(ctx, 'lowpass', 2600, 0.9), g = gainNode(ctx, 0);
    envPerc(g.gain, t, 0.16, 0.006, 0.45);
    osc.connect(lp); lp.connect(g); g.connect(L);
    osc.start(t); osc.stop(t + 0.48); lfo.start(t); lfo.stop(t + 0.48);
    pluck(ctx, L, t + 0.07, f, { amp: 0.08, dur: 0.4, bright: 0.45, t60: 0.5 });
  }

  function sScore(ctx, d, t, o) {
    const f = mtof(81 + Math.min(o.n | 0, 24) * 0.35); // rising slightly through a count-up run
    const L = layer(ctx, d, { wet: 0.12, hp: 400 });
    tone(ctx, L, t, f, { amp: 0.045, a: 0.001, dur: 0.035 });
    tone(ctx, L, t, f * 2.76, { amp: 0.012, a: 0.0008, dur: 0.015 });
  }

  function sPoints(ctx, d, t) {
    const B = layer(ctx, d, { wet: 0.3, hp: 400 });
    bell(ctx, B, t, mtof(86), { amp: 0.09, dur: 0.45, kind: 'glock' });              // D6
    bell(ctx, B, t + 0.055, mtof(93), { amp: 0.1, dur: 0.5, kind: 'glock', beat: 2 }); // A6
    tone(ctx, B, t + 0.055, mtof(98), { amp: 0.02, a: 0.001, dur: 0.3 });
    noise(ctx, B, t, 0.2, { amp: 0.02, type: 'highpass', f: 8000, a: 0.001 });
  }

  function sBack(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.18, hp: 250 });
    tone(ctx, L, t, mtof(81), { f1: mtof(74), glide: 0.1, amp: 0.09, a: 0.003, dur: 0.16 });       // A5 ↘ D5
    tone(ctx, L, t, mtof(93), { type: 'triangle', f1: mtof(86), glide: 0.1, amp: 0.015, a: 0.003, dur: 0.1 });
  }

  function sReveal(ctx, d, t) {
    const L = layer(ctx, d, { wet: 0.35, hp: 300 });
    noise(ctx, L, t, 0.55, { amp: 0.045, type: 'bandpass', f: 1600, f1: 5200, q: 1.3, shape: swell(0.35) });
    bell(ctx, L, t + 0.14, mtof(93), { amp: 0.018, dur: 0.5, kind: 'celesta' });
  }

  function sVictory(ctx, d, t) {
    const B = layer(ctx, d, { wet: 0.22 });
    // I – I – IV – V – I in D major; the top voice climbs A A B C♯ D
    const chords = [
      [0.0, 0.17, [62, 66, 69], 50],
      [0.2, 0.17, [62, 66, 69], 50],
      [0.4, 0.36, [62, 67, 71], 43],
      [0.8, 0.38, [64, 69, 73], 45],
      [1.22, 1.55, [66, 69, 74], 50],
    ];
    for (const [at, len, notes, bass] of chords) {
      const long = len > 1;
      notes.forEach((m, i) => brass(ctx, B, t + at, mtof(m), len, { amp: i === notes.length - 1 ? 0.05 : 0.038, long }));
      brass(ctx, B, t + at, mtof(bass), len, { amp: 0.045, long, bright: 0.55 });
      bell(ctx, B, t + at, mtof(notes[notes.length - 1] + 12), { amp: long ? 0.06 : 0.04, dur: long ? 1.6 : 0.5, kind: 'chime' });
    }
    // timpani: two light hits, a roll on the dominant, the big landing
    const T = layer(ctx, d, { wet: 0.25 });
    timp(ctx, T, t, mtof(50), 0.16, 0.5);
    timp(ctx, T, t + 0.2, mtof(50), 0.14, 0.5);
    for (let x = 0.8, i = 0; x < 1.19; x += 0.042, i++) timp(ctx, T, t + x, mtof(45) * (i % 2 ? 1.003 : 1), 0.03 + 0.11 * ((x - 0.8) / 0.4), 0.35);
    timp(ctx, T, t + 1.22, mtof(50), 0.3, 1.6);
    // cymbal-like sizzle: swell into the landing, then a long shimmer
    const C = layer(ctx, d, { wet: 0.4 });
    noise(ctx, C, t + 0.8, 0.44, { amp: 0.035, type: 'highpass', f: 6000, q: 0.6, shape: (x) => Math.pow(x, 3) * (1 - Math.pow(x, 40)) });
    noise(ctx, C, t + 1.22, 1.9, { amp: 0.045, type: 'highpass', f: 6500, q: 0.6, a: 0.004 });
    sparkles(ctx, d, t + 1.3, 1.2, 14, { base: 86, lo: 0, hi: 12, amp: 0.03, dur: 0.5 });
  }

  /** The mix. name → { dur (s, returned by play), db (fader), gap (ms, min re-trigger interval),
   *  bake (pre-render; `uses` names the option that makes a call render live instead), fn } */
  const SOUNDS = {
    click: { dur: 0.07, db: -6, gap: 30, fn: sClick },
    hover: { dur: 0.09, db: 0, gap: 40, fn: sHover },
    modal: { dur: 0.5, db: 1.5, gap: 60, bake: 1, fn: sModal },
    whoosh: { dur: 0.52, db: 0, gap: 120, bake: 1, fn: sWhoosh },
    start: { dur: 1.5, db: 0.5, gap: 300, bake: 1, fn: sStart },
    tile: { dur: 0.8, db: 1, gap: 120, bake: 1, fn: sTile },
    question: { dur: 0.95, db: 2.5, gap: 200, bake: 1, fn: sQuestion },
    answer: { dur: 0.5, db: 1.5, gap: 20, fn: sAnswer },
    lock: { dur: LOCK, db: -2, gap: 200, bake: 1, fn: sLock },
    correct: { dur: 1.6, db: 6, gap: 200, bake: 1, fn: sCorrect },
    wrong: { dur: 1.2, db: -2.5, gap: 200, bake: 1, fn: sWrong },
    fifty: { dur: 1.15, db: 8.5, gap: 200, bake: 1, fn: sFifty },
    climb: { dur: 0.5, db: 3, gap: 60, bake: 1, uses: 'step', fn: sClimb },
    score: { dur: 0.04, db: -4.5, gap: 45, fn: sScore },
    points: { dur: 0.5, db: 1.5, gap: 60, bake: 1, fn: sPoints },
    victory: { dur: 3.3, db: 3.5, gap: 500, bake: 1, fn: sVictory },
    back: { dur: 0.17, db: 5, gap: 60, fn: sBack },
    reveal: { dur: 0.55, db: 3, gap: 120, bake: 1, fn: sReveal },
  };
  const fader = (def) => Math.pow(10, (def.db || 0) / 20);
  const has = (name) => Object.prototype.hasOwnProperty.call(SOUNDS, name);

  // ───────────────────────── master chain ─────────────────────────
  // Chromium's compressor adds ≈ +4.9 dB automatic makeup below threshold and holds 0 dBFS input to ≈ −3 dBFS;
  // TRIM keeps most of that (loud enough for a hall), the WaveShaper is a hard guarantee: never above ≈ −1.2 dBFS.
  const CEIL = 0.88, KNEE = 0.7;     // soft ceiling: linear up to −3.1 dBFS, tanh knee above
  const TRIM = 0.89;                 // −1 dB
  let clipCurve = null;
  function softClip() {
    if (clipCurve) return clipCurve;
    const n = 4097, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x);
      c[i] = Math.sign(x) * (ax <= KNEE ? ax : KNEE + (CEIL - KNEE) * Math.tanh((ax - KNEE) / (CEIL - KNEE)));
    }
    return (clipCurve = c);
  }

  /** Procedural room: stereo decaying noise that darkens as it decays, a few early reflections (~1.8 s). */
  const irCache = new Map();
  function impulse(ctx, sr = ctx.sampleRate, secs = 1.8) {
    if (irCache.has(sr)) return irCache.get(sr);
    const n = Math.floor(sr * secs), pre = Math.floor(sr * 0.012);
    const buf = mkBuffer(2, n, sr, ctx);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch), r = mulberry32(17 + ch * 31);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        const x = (i - pre) / sr, k = 0.75 - 0.6 * (x / secs);     // one-pole: bright early, dark late
        lp += (r() * 2 - 1 - lp) * k;
        const fadeIn = Math.min(1, (i - pre) / (sr * 0.004)), fadeOut = Math.min(1, (n - i) / (sr * 0.08));
        d[i] = lp * Math.exp((-6.9 * x) / secs) * fadeIn * fadeOut;
      }
      for (const [ms, g] of [[17, 0.5], [29, 0.35], [41, 0.28], [58, 0.2]]) {
        const at = Math.floor(sr * (ms + ch * 3.1) / 1000);
        if (at < n) d[at] += g * (ch ? -1 : 1);
      }
    }
    irCache.set(sr, buf);
    return buf;
  }

  function buildChain(ctx, { reverb = true } = {}) {
    const out = gainNode(ctx), fx = gainNode(ctx), sum = gainNode(ctx);
    out.connect(sum);
    if (reverb) {
      const hp = filter(ctx, 'highpass', 220, 0.6), conv = ctx.createConvolver(), wet = gainNode(ctx, 0.55);
      conv.buffer = impulse(ctx);
      fx.connect(hp); hp.connect(conv); conv.connect(wet); wet.connect(sum);
    }
    const hpf = filter(ctx, 'highpass', 35, 0.7);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    const trim = gainNode(ctx, TRIM);
    const clip = ctx.createWaveShaper(); clip.curve = softClip(); clip.oversample = 'none';
    const master = gainNode(ctx, 1);
    sum.connect(hpf); hpf.connect(comp); comp.connect(trim); trim.connect(clip); clip.connect(master);
    master.connect(ctx.destination);
    return { out, fx, master, comp };
  }

  // ───────────────────────── live engine ─────────────────────────
  let ctx = null, chain = null, failed = false, muted = false, gestured = false, warned = false;
  const voices = new Set();
  const lastAt = {};
  let scoreRun = 0;

  const hasGesture = () => gestured || !!(navigator.userActivation && navigator.userActivation.hasBeenActive);

  function ensure() {
    if (ctx || failed) return ctx;
    if (!AC) { failed = true; return null; }
    try {
      ctx = new AC({ latencyHint: 'interactive' });
      chain = buildChain(ctx);
      chain.master.gain.value = muted ? 0 : 1;
    } catch (e) { failed = true; ctx = null; chain = null; }
    return ctx;
  }

  /** Resume the AudioContext (call from a user gesture). Resolves true when audio is running. */
  function unlock() {
    gestured = true;
    const c = ensure();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    try { return c.resume().then(() => c.state === 'running', () => false); } catch (e) { return Promise.resolve(false); }
  }

  // Auto-unlock on the first real activation (touch screens activate on pointerup/touchend; Escape never activates).
  // Creating the context outside an activation would only earn a console warning, so wait for one.
  const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown'];
  function onGesture() {
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    unlock().then((ok) => {
      if (!ok) return;
      GESTURES.forEach((ev) => window.removeEventListener(ev, onGesture, true));
      bakeAll();
    });
  }
  GESTURES.forEach((ev) => window.addEventListener(ev, onGesture, true));

  // ───────── idle prep: keep the main thread free at the big moments (60 fps) ─────────
  // the background canvas animates constantly, so true idle time is rare — cap the wait at 600 ms
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 600 }) : setTimeout(fn, 120));
  /** Run tasks one per idle slot (a task may return a Promise). */
  function idleQueue(tasks) {
    const step = () => {
      const task = tasks.shift();
      if (!task) return;
      let p = null;
      try { p = task(); } catch (e) { /* skip */ }
      Promise.resolve(p).catch(() => {}).then(() => idle(step));
    };
    idle(step);
  }

  /** Before any gesture (offline contexts need none): prepare the room and bake START at both common device rates,
   *  so the very first press costs ~0.3 ms of main thread. */
  function warm() {
    if (!AC || !OAC) return;
    const tasks = [];
    for (const sr of [48000, 44100]) tasks.push(() => impulse(null, sr), () => noiseBuffer(null, sr), () => (muted ? null : bakeInto('start', sr)));
    setTimeout(() => idleQueue(tasks), 2500);   // after the splash intro
  }

  /** After unlock: pre-render heavy sounds into 4-channel stems (dry L/R + reverb-send L/R). They still go through the
   *  live voice → reverb → compressor path, so a baked play costs ~7 nodes instead of hundreds. */
  const baked = new Map();                    // 'name@sampleRate' → AudioBuffer
  let bakeStarted = false;
  const bakeInto = (n, sr) => (baked.has(n + '@' + sr) ? null : bake(n, sr).then((b) => { if (b) baked.set(n + '@' + sr, b); }));
  function bakeAll() {
    if (bakeStarted || !ctx || !OAC || muted) return;
    bakeStarted = true;
    const sr = ctx.sampleRate;
    // in the order the game will need them
    const order = ['whoosh', 'tile', 'question', 'lock', 'correct', 'climb', 'points', 'reveal', 'wrong', 'fifty', 'victory', 'modal', 'start'];
    const tasks = order.filter((n) => SOUNDS[n].bake).map((n) => () => bakeInto(n, sr));
    setTimeout(() => idleQueue(tasks), 1500);
  }
  function bake(name, sr) {
    const def = SOUNDS[name], oc = new OAC(4, Math.ceil((def.dur + 0.3) * sr), sr);
    oc.destination.channelInterpretation = 'discrete';
    const merge = oc.createChannelMerger(4);
    merge.connect(oc.destination);
    const stem = (k) => {
      const g = oc.createGain();
      g.channelCount = 2; g.channelCountMode = 'explicit';      // mono sources up-mix to L = R, as on the live bus
      const sp = oc.createChannelSplitter(2);
      g.connect(sp); sp.connect(merge, 0, k); sp.connect(merge, 1, k + 1);
      return g;
    };
    def.fn(oc, { out: stem(0), fx: stem(2) }, 0, {});
    return oc.startRendering();
  }
  function playBaked(c, v, buf, t) {
    const src = c.createBufferSource(), sp = c.createChannelSplitter(4), mo = c.createChannelMerger(2), mf = c.createChannelMerger(2);
    src.buffer = buf; src.connect(sp);
    sp.connect(mo, 0, 0); sp.connect(mo, 1, 1); sp.connect(mf, 2, 0); sp.connect(mf, 3, 1);
    mo.connect(v.out); mf.connect(v.fx);
    src.start(t);
  }
  warm();

  function release(v) {
    if (!voices.delete(v)) return;
    clearTimeout(v.timer);
    try { v.out.disconnect(); v.fx.disconnect(); } catch (e) { /* already gone */ }
  }

  /** play(name, opts?) → { duration } — fire-and-forget; unknown names and muted/unavailable audio are no-ops. */
  function play(name, opts) {
    const def = has(name) ? SOUNDS[name] : null;
    if (!def) return { duration: 0 };
    const res = { duration: def.dur };
    if (muted || !hasGesture()) return res;
    const c = ensure();
    if (!c || c.state === 'closed') return res;
    const now = performance.now();
    if (now - (lastAt[name] || -1e9) < def.gap) return res;
    if (name === 'score') scoreRun = now - (lastAt.score || -1e9) > 400 ? 0 : scoreRun + 1;
    lastAt[name] = now;
    if (voices.size > 48 && def.dur < 0.2) return res;   // shed UI ticks under heavy load
    try {
      if (c.state !== 'running') c.resume().catch(() => {});
      const o = Object.assign(name === 'score' ? { n: scoreRun } : {}, opts || {});
      const v = { out: gainNode(c, fader(def)), fx: gainNode(c, fader(def)), timer: 0 };
      v.out.connect(chain.out); v.fx.connect(chain.fx);
      voices.add(v);
      const b = def.uses && o[def.uses] != null ? null : baked.get(name + '@' + c.sampleRate);
      const t0 = c.currentTime + 0.02;
      if (b) playBaked(c, v, b, t0); else def.fn(c, v, t0, o);
      v.timer = setTimeout(() => release(v), (def.dur + 1.2) * 1000);
    } catch (e) {
      if (!warned) { warned = true; console.warn('[sound]', name, e); }
    }
    return res;
  }

  /** Fade every playing sound out in ~50 ms (e.g. the lock tension). Shared reverb tail rings out naturally. */
  function stopAll() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of Array.from(voices)) {
      for (const g of [v.out.gain, v.fx.gain]) {
        try { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.012); } catch (e) { /* ignore */ }
      }
      clearTimeout(v.timer);
      v.timer = setTimeout(() => release(v), 150);
    }
  }

  function setMuted(b) {
    muted = !!b;
    if (!ctx || !chain) return;
    if (muted) stopAll();
    try {
      const t = ctx.currentTime;
      chain.master.gain.cancelScheduledValues(t);
      chain.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.02);
    } catch (e) { /* ignore */ }
    if (!muted && ctx.state === 'running') bakeAll();
  }

  /** Offline render through the full master chain (tests/tools) → Promise<AudioBuffer|null>. Deterministic per seed.
   *  `what` is a name, or a timeline [[name, atSeconds, opts?], …] mixed through one shared chain.
   *  A fresh compressor starts gain-reduced and needs its release time to settle, so the sound is scheduled after a
   *  0.6 s pre-roll that is trimmed off — the result matches what the live, idling chain plays. */
  function render(what, opts, { sampleRate = 48000, tail = 2, reverb = true, seed = 1, preroll = 0.6 } = {}) {
    const events = (Array.isArray(what) ? what : [[what, 0, opts]]).filter((e) => has(e[0]));
    if (!events.length || !OAC) return Promise.resolve(null);
    const end = Math.max(...events.map(([n, at]) => (at || 0) + SOUNDS[n].dur));
    const pre = Math.round(preroll * sampleRate), len = Math.ceil((end + tail) * sampleRate);
    const oc = new OAC(2, pre + len, sampleRate);
    const ch = buildChain(oc, { reverb });
    const prev = rnd;
    rnd = mulberry32(seed);
    try {
      for (const [n, at, o] of events) {
        const v = { out: gainNode(oc, fader(SOUNDS[n])), fx: gainNode(oc, fader(SOUNDS[n])) };
        v.out.connect(ch.out); v.fx.connect(ch.fx);
        SOUNDS[n].fn(oc, v, pre / sampleRate + (at || 0), Object.assign({}, o || {}));
      }
    } finally { rnd = prev; }
    return oc.startRendering().then((full) => {
      const out = mkBuffer(2, len, sampleRate, oc);
      for (let c = 0; c < 2; c++) out.copyToChannel(full.getChannelData(c).subarray(pre), c);
      return out;
    });
  }

  CH.sound = {
    play, unlock, stopAll, setMuted, render,
    get muted() { return muted; },
    get context() { return ctx; },
    get baked() { return Array.from(baked.keys()).filter((k) => !ctx || k.endsWith('@' + ctx.sampleRate)).map((k) => k.split('@')[0]); },
    names: Object.keys(SOUNDS),
  };
})(window.CH = window.CH || {});
