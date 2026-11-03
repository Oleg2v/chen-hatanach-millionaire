// Regression checks for QA round-1 bugs (state safety, modal defaults, timer pause, result guard).
import { createRequire } from 'node:module'; import path from 'node:path';
const { chromium } = createRequire(import.meta.url)('playwright');
const file = 'file://' + path.resolve('dist/chen-hatanach-millionaire.html') + '?fx=low';
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'PASS ' : 'FAIL ') + m); };
const W = (ms) => p.waitForTimeout(ms);
const phase = () => p.evaluate(() => CH.play.state && CH.play.state.phase);
const until = async (fn, t = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < t) { if (await fn()) return true; await W(150); } return false; };
const answer = async (right = true) => { await until(async () => (await phase()) === 'answering'); const o = await p.evaluate(() => CH.play.state.order); const i = right ? o.indexOf(true) : o.indexOf(false); await p.keyboard.press(String(i + 1)); await until(async () => (await phase()) === 'revealed'); };
await p.goto(file); await p.evaluate(() => localStorage.clear()); await p.reload(); await W(1500);
await p.evaluate(() => CH.store.updateSettings({ answerTime: 30 })); await p.keyboard.press('Space'); await until(async () => (await p.evaluate(() => CH.ui.current)) === 'board'); await W(800);

// 1) in-progress hive is protected
await p.click('.tile[data-n="7"]'); await until(async () => (await phase()) === 'pre'); await p.keyboard.press('Space');
await answer(true); await p.keyboard.press('Enter'); await answer(true);
await p.keyboard.press('Escape'); await W(500); await p.click('.modal [data-key="leave"]'); await until(async () => (await p.evaluate(() => CH.ui.current)) === 'board'); await W(800);
await p.click('.tile[data-n="8"]'); await W(700);
ok(await p.locator('.modal [data-key="resume"]').count() === 1, 'choosing another hive asks about hive 7 in progress');
await p.keyboard.press('Enter'); await W(200); await p.keyboard.press('Enter'); await W(900);   // Enter = resume (default), double Enter absorbed
ok((await p.evaluate(() => CH.ui.current)) === 'play' && (await p.evaluate(() => CH.store.current().n)) === 7, 'default action resumes hive 7');
await until(async () => (await phase()) === 'pre'); await p.keyboard.press('Escape'); await W(500); await p.click('.modal [data-key="leave"]'); await until(async () => (await p.evaluate(() => CH.ui.current)) === 'board'); await W(800);
await p.click('.tile[data-n="8"]'); await W(700); await p.click('.modal [data-key="finish"]'); await W(800);
ok((await p.evaluate(() => CH.store.resultOf(7) && CH.store.resultOf(7).score)) === 12, 'finish records hive 7 with 12 points');

// 2) fully answered hive survives a reload
await p.click('.tile[data-n="2"]'); await until(async () => (await phase()) === 'pre'); await p.keyboard.press('Space');
for (let q = 0; q < 4; q++) { if (q) await p.keyboard.press('Enter'); await answer(true); }
await p.reload(); await W(1800);
ok((await p.evaluate(() => CH.store.resultOf(2) && CH.store.resultOf(2).score)) === 24, 'answered-but-unfinished hive 2 recorded after reload (24)');

// 3) destructive modal defaults to cancel
await p.keyboard.press('Space'); await until(async () => (await p.evaluate(() => CH.ui.current)) === 'board'); await W(900);
await p.click('.tile[data-n="2"]'); await W(600); await p.keyboard.press('Enter'); await W(500); await p.keyboard.press('Enter'); await W(500);
ok((await p.evaluate(() => !!CH.store.resultOf(2))), 'Enter on the unlock dialog keeps the result');

// 4) timer frozen under the help dialog
await p.click('.tile[data-n="5"]'); await until(async () => (await phase()) === 'pre'); await p.keyboard.press('Space'); await until(async () => (await phase()) === 'answering');
const t1 = +(await p.textContent('.q-timer b')); await p.keyboard.press('Shift+Slash'); await W(3500);
const t2 = +(await p.textContent('.q-timer b')); await p.keyboard.press('Escape'); await W(300);
ok(t1 - t2 <= 1, `timer paused under help (${t1} → ${t2})`);
ok(t1 <= 30, `timer never shows more than 30 (${t1})`);

// 5) result: a stray Enter doesn't skip the celebration
await answer(true); await p.keyboard.press('Escape'); await W(500); await p.click('.modal [data-key="leave"]'); await until(async () => (await p.evaluate(() => CH.ui.current)) === 'board'); await W(800);
await p.evaluate(() => CH.store.updateSettings({ perParticipant: 1 }));
await p.click('.tile[data-n="9"]'); await W(700); await p.click('.modal [data-key="drop"]'); await W(300);
await until(async () => (await phase()) === 'pre');
ok((await p.evaluate(() => CH.store.current().n === 9 && !CH.store.resultOf(5))), 'drop cancels hive 5 without recording and opens hive 9');
await p.keyboard.press('Space');
await answer(true); await p.keyboard.press('Enter'); await until(async () => (await p.evaluate(() => CH.ui.current)) === 'result');
await W(400); await p.keyboard.press('Enter'); await W(800);
ok((await p.evaluate(() => CH.ui.current)) === 'result', 'early Enter on result is ignored');

console.log(errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no console errors');
await b.close(); process.exitCode = fails.length || errs.length ? 1 : 0;
