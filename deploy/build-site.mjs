// Builds deploy/site/ from dist/: the single-file game + demo-mode SEO guards (noindex), headers, 404, sitemap, og image.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = 'https://chen-hatanach.kikkey.com';
const out = path.join(here, 'site');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });

const TITLE = 'כוכב התנ״ך · חן התנ״ך';
const DESC = 'הדגמה: משחק הטריוויה „כוכב התנ״ך” של חן התנ״ך בגרסה חדשה ומודרנית — עובד גם ללא אינטרנט.';
const headTags = `
<meta name="robots" content="noindex,nofollow">
<meta name="description" content="${DESC}">
<link rel="canonical" href="${ORIGIN}/">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
<meta property="og:site_name" content="חן התנ״ך">
<meta property="og:title" content="${TITLE}">
<meta property="og:description" content="${DESC}">
<meta property="og:url" content="${ORIGIN}/">
<meta property="og:image" content="${ORIGIN}/og-image.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${ORIGIN}/og-image.jpg">`;

let html = fs.readFileSync(path.join(here, '..', 'dist', 'chen-hatanach-millionaire.html'), 'utf8');
if (!html.includes('</title>')) throw new Error('no <title> in dist');
html = html.replace('</title>', '</title>' + headTags);
fs.writeFileSync(path.join(out, 'index.html'), html);

const icon = (html.match(/<link rel="icon"[^>]+>/) || [''])[0];
fs.writeFileSync(path.join(out, '404.html'), `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>הדף לא נמצא · חן התנ״ך</title>${icon}
<style>html,body{margin:0;height:100%}body{display:grid;place-items:center;font-family:system-ui,'Segoe UI',Arial,sans-serif;color:#fff;
background:radial-gradient(ellipse 120% 80% at 50% 0%,#2fa8ec 0%,#1279cf 30%,#0b3a8c 58%,#061a4c 82%,#030b26 100%)}
main{text-align:center;padding:24px}h1{font-size:64px;margin:0;color:#ffd56a}p{font-size:20px;opacity:.85}
a{display:inline-block;margin-top:12px;padding:12px 28px;border-radius:999px;background:linear-gradient(180deg,#fff1bf,#ffd56a 38%,#e9a42c 70%,#b9771a);color:#3a2303;font-weight:700;text-decoration:none}</style>
</head><body><main><h1>404</h1><p>הדף שחיפשתם לא נמצא.</p><a href="/">למשחק כוכב התנ״ך</a></main></body></html>
`);

fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nDisallow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGIN}/</loc></url>
</urlset>
`);
fs.writeFileSync(path.join(out, '_headers'), `/*
  X-Robots-Tag: noindex, nofollow
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  X-Frame-Options: SAMEORIGIN
  Cache-Control: public, max-age=0, must-revalidate, no-transform
`);
const og = path.join(here, 'og-image.jpg');
if (fs.existsSync(og)) fs.copyFileSync(og, path.join(out, 'og-image.jpg')); else throw new Error('missing deploy/og-image.jpg (run: node make-og.mjs)');

const banned = /claude|anthropic|openai|chatgpt|codex/i;
for (const f of fs.readdirSync(out)) { const t = fs.readFileSync(path.join(out, f)); if (!f.endsWith('.png') && banned.test(t.toString('utf8'))) throw new Error('banned word in ' + f); }
console.log('site/:', fs.readdirSync(out).map((f) => `${f} (${Math.round(fs.statSync(path.join(out, f)).size / 1024)} KB)`).join(', '));
