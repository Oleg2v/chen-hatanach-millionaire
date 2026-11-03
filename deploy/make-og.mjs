// Renders the 1200×630 share image from the splash screen of the built game.
import { createRequire } from 'node:module'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await p.goto('file://' + path.join(here, '..', 'dist', 'chen-hatanach-millionaire.html'));
await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.reload();
await p.waitForTimeout(3200);
await p.evaluate(() => { const d = document.getElementById('dock'); if (d) d.style.display = 'none'; });
await p.screenshot({ path: path.join(here, 'og-image.jpg'), type: 'jpeg', quality: 88 }); await b.close();
console.log('og-image.jpg written');
