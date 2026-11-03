// Generates test import files: 20 questions (4 demo + 16 clearly-marked placeholders).
//   questions-20.xlsx, questions-20-cp1255.csv, questions-20.json
import fs from 'node:fs'; import vm from 'node:vm'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'src/vendor/xlsx.mini.min.js'), 'utf8'), ctx);
const XLSX = ctx.XLSX;
// pull the demo questions straight from the store source so the text stays byte-identical
const storeSrc = fs.readFileSync(path.join(root, 'src/js/01-store.js'), 'utf8');
const demo = [...storeSrc.matchAll(/\{ id: 'demo-\d', q: '([^']+)', correct: '([^']+)', wrong: \['([^']+)', '([^']+)', '([^']+)'\], source: '([^']+)' \}/g)].map((m) => m.slice(1));
if (demo.length !== 4) throw new Error('demo parse failed');
const head = ['שאלה', 'תשובה נכונה', 'תשובה שגויה 1', 'תשובה שגויה 2', 'תשובה שגויה 3', 'מקור'];
const rows = [...demo, ...Array.from({ length: 16 }, (_, i) => [`שאלת בדיקה מספר ${i + 5}`, `תשובה נכונה ${i + 5}`, `שגויה א ${i + 5}`, `שגויה ב ${i + 5}`, `שגויה ג ${i + 5}`, `מקור בדיקה ${i + 5}`])];
const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'שאלות'); wb.Workbook = { Views: [{ RTL: true }] };
fs.writeFileSync(path.join(here, 'questions-20.xlsx'), Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
// cp1255 CSV (no nikud in cp1255 for safety: placeholders only + demo answers) — Excel "CSV" on Hebrew Windows
const csv = [head, ...rows.slice(4)].map((r) => r.map((c) => `"${c}"`).join(',')).join('\r\n');
const enc = (s) => Buffer.from([...s].map((ch) => { const c = ch.codePointAt(0); if (c < 128) return c; if (c >= 0x05D0 && c <= 0x05EA) return c - 0x05D0 + 0xE0; throw new Error('char ' + ch); }));
fs.writeFileSync(path.join(here, 'questions-16-cp1255.csv'), enc(csv));
fs.writeFileSync(path.join(here, 'questions-20.json'), JSON.stringify({ format: 'chen-hatanach-questions', version: 1, name: 'בדיקה 20', questions: rows.map(([q, correct, w1, w2, w3, source]) => ({ q, correct, wrong: [w1, w2, w3], source })) }, null, 2));
console.log('fixtures written:', fs.readdirSync(here).filter((f) => !f.endsWith('.mjs')).join(', '));
