// End-to-end check of the built single file, straight from file://.
// - plays 2 participants (all correct; one with 50:50 + one wrong), then 10 questions × 24 participants
// - screenshots every screen at 1920×1080 and 1366×768
// - fails on console errors, page errors or ANY non-file/data/blob request
// Usage: node tests/e2e.mjs [outDir] [--file dist/chen-hatanach-millionaire.html] [--only 1920]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');

const args = process.argv.slice(2);
const flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outDir = path.resolve(args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'dev/shots');
const file = 'file://' + path.resolve(flag('--file', 'dist/chen-hatanach-millionaire.html'));
const only = flag('--only', '');
fs.mkdirSync(outDir, { recursive: true });

const problems = [];
const log = (...a) => console.log(...a);

async function run(vw, vh, tag, full) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[${tag}] console.error: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[${tag}] pageerror: ${e.message}`));
  page.on('request', (r) => { const u = r.url(); if (!/^(file|data|blob):/.test(u)) problems.push(`[${tag}] NETWORK REQUEST: ${u}`); });

  const shot = async (name) => { const p = path.join(outDir, `${tag}-${name}.png`); await page.screenshot({ path: p }); log('  shot', path.relative(process.cwd(), p)); };
  const wait = (ms) => page.waitForTimeout(ms);
  const phase = () => page.evaluate(() => (window.CH.play.state ? window.CH.play.state.phase : null));
  const waitPhase = async (ph, timeout = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if ((await phase()) === ph) return; await wait(100); } throw new Error(`[${tag}] timeout waiting for phase ${ph} (now ${await phase()})`); };
  const screen = () => page.evaluate(() => window.CH.ui.current);
  const waitScreen = async (s, timeout = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if ((await screen()) === s) return; await wait(100); } throw new Error(`[${tag}] timeout waiting for screen ${s}`); };
  const correctIdx = () => page.evaluate(() => window.CH.play.state.order.indexOf(true));

  await page.goto(file);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload();
  await wait(2600);
  await shot('01-splash');
  await page.keyboard.press('Space');
  await waitScreen('board'); await wait(1400);
  await shot('02-board');

  // ---- participant 1: all correct ----
  await page.click('.tile[data-n="1"]');
  await waitScreen('play'); await wait(1300);
  await shot('03-play-empty');
  await page.keyboard.press('Space');
  await waitPhase('answering');
  await wait(300);
  await shot('04-question');
  let nQ = await page.evaluate(() => window.CH.store.current().qids.length);
  for (let q = 0; q < nQ; q++) {
    if (q > 0) { await page.keyboard.press('Enter'); await waitPhase('answering'); }
    const ci = await correctIdx();
    await page.keyboard.press(String(ci + 1));
    if (q === 0) { await wait(700); await shot('05-locked'); }
    await waitPhase('revealed');
    if (q === 0) { await wait(400); await shot('06-correct'); }
  }
  await page.keyboard.press('Enter');
  await waitScreen('result'); await wait(2600);
  await shot('07-result-perfect');
  await wait(2500);
  await shot('07b-result-settled');
  await page.keyboard.press('Enter');
  await waitScreen('board'); await wait(1400);

  // ---- participant 2: 50:50 on Q1 (correct), wrong on Q2, rest correct ----
  await page.click('.tile[data-n="2"]');
  await waitScreen('play'); await wait(900);
  await page.keyboard.press('Space');
  await waitPhase('answering');
  await page.keyboard.press('h');
  await wait(1300);
  await shot('08-fifty');
  const removed = await page.evaluate(() => window.CH.play.state.removed.length);
  if (removed !== 2) problems.push(`[${tag}] 50:50 removed ${removed} answers`);
  await page.keyboard.press(String((await correctIdx()) + 1));
  await waitPhase('revealed');
  const s1 = await page.evaluate(() => window.CH.store.current().score);
  if (s1 !== 3) problems.push(`[${tag}] score after 50:50 correct = ${s1}, expected 3`);
  await page.keyboard.press('Enter'); await waitPhase('answering');
  const ci2 = await correctIdx();
  await page.keyboard.press(String(((ci2 + 1) % 4) + 1));   // a wrong one
  await waitPhase('revealed'); await wait(500);
  await shot('09-wrong');
  nQ = await page.evaluate(() => window.CH.store.current().qids.length);
  for (let q = 2; q < nQ; q++) {
    await page.keyboard.press('Enter'); await waitPhase('answering');
    await page.keyboard.press(String((await correctIdx()) + 1));
    await waitPhase('revealed');
  }
  await page.keyboard.press('Enter');
  await waitScreen('result'); await wait(4800);
  await shot('10-result-p2');
  await page.click('.rs-actions .btn');
  await waitScreen('board'); await wait(1600);
  await shot('11-board-after');
  const res = await page.evaluate(() => window.CH.store.getRound().results);
  if (!res[1] || res[1].score !== 24) problems.push(`[${tag}] p1 score ${res[1] && res[1].score}, expected 24`);
  if (!res[2] || res[2].score !== 15) problems.push(`[${tag}] p2 score ${res[2] && res[2].score}, expected 15 (3+0+6+6)`);
  const grey = await page.evaluate(() => [...document.querySelectorAll('.tile.is-played')].map((t) => t.dataset.n));
  if (grey.join() !== '1,2') problems.push(`[${tag}] played tiles = ${grey}`);

  // ---- help + exit modal ----
  await page.keyboard.press('Shift+Slash'); await wait(600);
  await shot('12-help');
  await page.keyboard.press('Escape'); await wait(400);

  if (full) {
    // ---- 10 questions × 24 participants with 20 imported questions ----
    await page.evaluate(() => {
      const S = window.CH.store;
      const demo = S.DEMO_QUESTIONS;
      const extra = Array.from({ length: 16 }, (_, i) => ({ q: `שאלת בדיקה מספר ${i + 5} — מי?`, correct: `נכונה ${i + 5}`, wrong: [`שגויה א ${i + 5}`, `שגויה ב ${i + 5}`, `שגויה ג ${i + 5}`], source: `מקור ${i + 5}` }));
      const set = S.createSet('רמה 3 — בדיקה', [...demo, ...extra]);
      S.setActive(set.id);
      S.updateSettings({ participants: 24, perParticipant: 10 });
      S.resetRound();
      window.CH.ui.go('board');
    });
    await wait(2200);
    await shot('13-board-24');
    const tiles = await page.evaluate(() => document.querySelectorAll('.tile').length);
    if (tiles !== 24) problems.push(`[${tag}] tiles = ${tiles}, expected 24`);
    await page.click('.tile[data-n="24"]');
    await waitScreen('play'); await wait(900);
    await page.keyboard.press('Space'); await waitPhase('answering');
    for (let q = 0; q < 3; q++) {
      if (q) { await page.keyboard.press('Enter'); await waitPhase('answering'); }
      await page.keyboard.press(String((await correctIdx()) + 1)); await waitPhase('revealed');
    }
    await wait(300);
    await shot('14-play-10q');
    const steps = await page.evaluate(() => window.CH.store.current().qids.length);
    if (steps !== 10) problems.push(`[${tag}] 10q participant got ${steps} questions`);
    // leave mid-round, then come back and resume
    await page.keyboard.press('Escape'); await wait(600);
    await shot('15-exit-modal');
    await page.click('.modal [data-key="leave"]');
    await waitScreen('board'); await wait(1500);
    await shot('16-board-resume');
  }
  await browser.close();
}

const sizes = [[1920, 1080, '1920', true], [1366, 768, '1366', false]].filter((s) => !only || s[2] === only);
for (const [w, h, tag, full] of sizes) { log(`== ${w}×${h}`); await run(w, h, tag, full); }
if (problems.length) { console.log('\nPROBLEMS:\n' + problems.join('\n')); process.exitCode = 1; }
else console.log('\nOK — no console errors, no network requests, all assertions passed.');
