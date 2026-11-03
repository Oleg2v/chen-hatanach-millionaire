// Build: inlines every CSS/JS/font/image into ONE self-contained HTML file.
// Usage: node build.mjs            -> dist/chen-hatanach-millionaire.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const S = (...p) => path.join(root, 'src', ...p);
const read = (p) => fs.readFileSync(p, 'utf8');
const b64 = (p) => fs.readFileSync(p).toString('base64');
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

const HEB = 'U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F';
const LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const FONTS = [
  ['NotoSerifHeb', 'noto-serif-hebrew-hebrew-wght-normal.woff2', HEB, '100 900'],
  ['NotoSerifHeb', 'noto-serif-hebrew-latin-wght-normal.woff2', LAT, '100 900'],
  ['FrankRuhl', 'frank-ruhl-libre-hebrew-wght-normal.woff2', HEB, '300 900'],
  ['FrankRuhl', 'frank-ruhl-libre-latin-wght-normal.woff2', LAT, '300 900'],
  ['Rubik', 'rubik-hebrew-wght-normal.woff2', HEB, '300 900'],
  ['Rubik', 'rubik-latin-wght-normal.woff2', LAT, '300 900'],
];
const fontCss = FONTS.map(([fam, file, range, w]) =>
  `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:block;` +
  `src:url(data:font/woff2;base64,${b64(S('assets', 'fonts', file))}) format('woff2');unicode-range:${range};}`
).join('\n');

const cssOrder = ['base.css', 'screens.css', 'ladder.css', 'admin.css'];
const cssFiles = fs.readdirSync(S('css')).filter((f) => f.endsWith('.css'))
  .sort((a, b) => (cssOrder.indexOf(a) + 1 || 99) - (cssOrder.indexOf(b) + 1 || 99) || a.localeCompare(b));
const css = cssFiles.map((f) => `/* ── ${f} ── */\n${read(S('css', f))}`).join('\n');

// Optional real brand images: drop the client's PNGs into src/assets/brand/ and rebuild.
const brand = {};
for (const [key, name] of [['wordmark', 'chen-hatanach-wordmark.png'], ['emblem', 'chen-hatanach-emblem.png']]) {
  const p = S('assets', 'brand', name);
  if (exists(p)) brand[key] = `data:image/png;base64,${b64(p)}`;
}

const safeScript = (code) => code.replace(/<\/script/gi, '<\\/script');
const jsFiles = fs.readdirSync(S('js')).filter((f) => f.endsWith('.js')).sort();
const scripts = [
  `<script>window.CH_BUILD=${JSON.stringify({ time: new Date().toISOString(), files: jsFiles })};` +
  `window.CH_BRAND=${JSON.stringify(brand)};</script>`,
  `<script>/* SheetJS Community Edition (Apache-2.0) */\n${safeScript(read(S('vendor', 'xlsx.core.min.js')))}</script>`,
  ...jsFiles.map((f) => `<script>/* ── ${f} ── */\n${safeScript(read(S('js', f)))}\n</script>`),
].join('\n');

let html = read(S('index.html'));
html = html.replace('/*@FONTS@*/', () => fontCss)
  .replace('/*@CSS@*/', () => css)
  .replace('<!--@SCRIPTS@-->', () => scripts);

// Guard: no external resource references may slip into the build.
const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/gi)].map((m) => m[0]);
const cssUrl = [...css.matchAll(/url\(\s*["']?(https?:)?\/\//gi)].map((m) => m[0]);
const imp = [...css.matchAll(/@import/gi)];
if (ext.length || cssUrl.length || imp.length) {
  console.error('External references found:', ext, cssUrl, imp.length);
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = process.env.OUT ? path.resolve(root, process.env.OUT) : path.join(root, 'dist', 'chen-hatanach-millionaire.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Built ${path.relative(root, out)}  ${(html.length / 1024).toFixed(0)} KB  ` +
  `(css: ${cssFiles.join(', ')}; js: ${jsFiles.length} files; brand: ${Object.keys(brand).join(',') || 'svg recreation'})`);
