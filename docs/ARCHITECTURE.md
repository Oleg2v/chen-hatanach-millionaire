# כוכב התנ״ך — demo architecture & module contract

Single self-contained HTML file. `node build.mjs` inlines `src/**` into `dist/chen-hatanach-millionaire.html`
(fonts base64, SheetJS, every script and style). It must work from `file://`, with **zero network requests**
(a strict CSP in `src/index.html` enforces this: only inline scripts/styles, `data:`/`blob:` images and fonts).
Use `OUT=dev/<you>/build.html node build.mjs` to build a private copy, so parallel work doesn't collide on `dist/`.

## Runtime model
- Plain browser JS, no frameworks, no modules. Each file in `src/js/` is wrapped in its own `<script>` in
  filename order and is an IIFE: `(function (CH) { 'use strict'; … CH.thing = api; })(window.CH = window.CH || {});`
  A syntax error in one file does not kill the others, so always guard optional deps: `CH.sound && CH.sound.play('x')`.
- Target: Chromium (Electron later). ES2020+ is fine.
- CSS: `src/css/*.css` concatenated in order base → screens → ladder → admin → others. Scope your CSS
  (`#admin …`, `.ladder …`) so modules can't collide.

## Stage
- All game UI lives in `#stage`, a fixed **1920×1080** box scaled with `transform: scale(var(--s))` to fit the
  window (16:9 letterbox). Design everything in stage pixels.
- Background (`#bg`) is full-window (fills the letterbox too): gradient, rotating rays, Kohelet text texture,
  `#bg-canvas` (rising book-cubes), skyline (`.sky-back`, `.sky-front`), vignette.
- `#fx-canvas` is a full-window overlay canvas (above the stage, below the admin) for confetti/sparkles.
- `CH.stage`: `W, H, scale, toViewport(x,y), fromViewport(x,y), rectOf(el) → {x,y,w,h,cx,cy}` (stage coords),
  `onResize(fn)`, `isFullscreen()`, `toggleFullscreen()`.

## Shared modules (already written)
| File | Global | What |
|---|---|---|
| `00-util.js` | `CH.u` | `$, $$, h()` hyperscript, `esc, sleep, nextFrame, clamp, lerp, rand, uid, shuffle` (Fisher–Yates), `LS` (safe localStorage), `bus` (on/off/emit), `typo()` (title typography), `cleanHebrew(s,{stripCantillation})`, `animate(el, keyframes, opts)` → Promise, `countUp`, `fmtScore`, `LETTERS` (א׳ ב׳ ג׳ ד׳), `download(name, data, type)` |
| `01-store.js` | `CH.store` | settings, question sets, round state. See file. Emits `bus 'store:change' {what}` |
| `05-stage.js` | `CH.stage` | scaling, fullscreen, idle cursor |
| `06-ui.js` | `CH.ui` | `icons` (24×24 stroke SVG strings), screen manager `register/go`, `modal/confirm/prompt` (theme `'dark'` in-game, `'light'` in admin) → Promise, `toast`, `showHelp`, dock, keyboard routing |
| `07-bg.js` | `CH.bg` | background init: calls `CH.art.skyline('back'|'front')` and `CH.fx.initBackground(canvas)` |
| `99-main.js` | — | boot |

## Modules built in parallel (each owner edits ONLY their files)
| Owner | Files | Global API |
|---|---|---|
| brand art | `src/js/03a-art-brand.js` | `CH.art.emblem(opts)`, `CH.art.wordmark(opts)`, `CH.art.skyline(layer)`, `CH.art.bookCube(color, opts)`, `CH.art.EMBLEM_COLORS` |
| ladder | `src/js/03b-ladder.js`, `src/css/ladder.css` | `CH.ladder.create(container, {steps})`, `CH.wreath.create(container)` |
| audio | `src/js/02-audio.js` | `CH.sound.play(name, opts)`, `setMuted(b)`, `muted`, `unlock()` |
| fx | `src/js/04-fx.js` | `CH.fx.initBackground(canvas)`, `confetti(opts)`, `burst(x,y,opts)`, `dissolve(el,opts)`, `trail(from,to,opts)` |
| admin | `src/js/20-admin.js`, `src/css/admin.css` | `CH.admin.open(tab)`, `close()`, `isOpen()` |
| game (lead) | `10-splash.js`, `11-board.js`, `12-play.js`, `13-result.js`, `src/css/screens.css` | screens |

## Design language
- Deep azure → navy gradient (projector contrast), slowly rotating light rays, glass panels with a thin gold
  hairline (`.glass`), gold accents (`--gold-*`), emblem colours `--e-red --e-green --e-pink --e-teal --e-orange --e-blue`
  for participant tiles and confetti.
- Fonts (embedded): `--f-serif` Noto Serif Hebrew (questions/answers — full nikud), `--f-title` Frank Ruhl Libre
  (titles), `--f-ui` Rubik (UI, buttons, numbers). Hebrew with nikud needs generous line-height (≥1.45) and no
  `overflow:hidden` clipping above/below glyphs. Never Unicode-normalize Hebrew text.
- RTL everywhere (`<html dir="rtl">`). Readability from far away: question ≥64px, answers ≥46px at 1080p.
- Motion: 60fps, CSS + Web Animations API, canvas for particles. Easing `--ease-out`, `--ease-spring`.
- Don't copy the TV show's logo/graphics/music — only the general quiz format.

## Data
Question: `{ id, q, correct, wrong: [w1, w2, w3], source }`. Settings & sets & round are in `CH.store`.
Brand images: if `window.CH_BRAND.wordmark` / `.emblem` (data URLs) exist, use them instead of the SVG recreations.
Admin may set them at runtime (stored in localStorage key `chm.v1.brand`) and emits `bus 'brand:change'`.
