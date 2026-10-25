// Smoke test: first run -> quick start -> deal -> review -> PDF -> start cycle -> tick -> text log.
// The page is loaded with test/mock-claude.js standing in for window.claude (in-memory db, canned sample, downloads).
//   node artifact/orrery-src/test/smoke.mjs            (needs `playwright` and a chromium; jsPDF comes from cdnjs,
//   or set JSPDF_PATH=/path/to/jspdf.umd.min.js when offline)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }
const here = path.dirname(fileURLToPath(import.meta.url));
const page_url = 'file://' + path.resolve(here, '..', '..', 'orrery.html');
const FAKE_DATE = process.env.FAKE_DATE || '2026-10-21T10:00:00';          // a Wednesday: a card is open today

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; let failed = 0;
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_|Failed to load/.test(m.text())) errs.push(m.text()); });
await p.route(/fonts\.(googleapis|gstatic)/, (r) => r.abort());
if (process.env.JSPDF_PATH) await p.route('**/jspdf.umd.min.js', (r) => r.fulfill({ path: process.env.JSPDF_PATH, contentType: 'text/javascript' }));
await p.addInitScript('window.__ORRERY_DEBUG=1');
await p.addInitScript({ content: fs.readFileSync(path.join(here, 'mock-claude.js'), 'utf8') });
await p.clock.setFixedTime(new Date(FAKE_DATE));
await p.goto(page_url); await p.waitForTimeout(900);

const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failed++; };
const txt = async (s) => ((await p.locator(s).first().textContent().catch(() => '')) || '').trim().replace(/\s+/g, ' ');
const wait = (ms = 400) => p.waitForTimeout(ms);

ok((await txt('.hero h1')).startsWith('Let’s set up your home'), 'first run starts empty with a guided next step');
await p.locator('[data-setup=rooms]').click(); await wait(); await p.locator('#qs-go').click(); await wait(1500);
await p.locator('[data-sub=deck]').click(); await wait(); await p.locator('#deal').click(); await wait(1500);
ok(await p.locator('#card-0').count() === 1, 'deck dealt, cards editable');
await p.locator('#approve').click(); await wait(); await p.locator('#to-print').click(); await wait(700);
await p.locator('#pdf-all').click(); await wait(2500);
const pdf = await p.evaluate(async () => { const d = window.__downloads.find((x) => /\.pdf$/.test(x.filename)); if (!d) return null; const t = typeof d.data.text === 'function' ? await d.data.text() : ''; return { name: d.filename, head: t.slice(0, 5), pages: (t.match(/\/Type\s*\/Page[^s]/g) || []).length }; });
ok(!!pdf && pdf.head === '%PDF-', 'PDF saved: ' + (pdf ? `${pdf.name}, ${pdf.pages} pages` : 'none'));
ok(!!pdf && pdf.pages === 20, '39 cards -> 20 sheets, two per sheet');
await p.locator('#cyc-go').click(); await wait(1200);
await p.locator('#tabbar [data-tab=today]').click(); await wait(800);
const before = await p.locator('.paper .pi.done').count();
await p.locator('.paper .pi input[type=checkbox]').first().evaluate((el) => el.click()); await wait(700);
ok(await p.locator('.paper .pi.done').count() === before + 1, 'tick on the card updates it');
const logged = await p.evaluate(async () => { const r = await window.__O.logText('Hoovered downstairs', 'text'); return r.saved.length; });
ok(logged >= 1, 'text log saves an entry');
// notes: add one tagged for the next deck, see it at deal time, back up with it, and switch theme
await p.locator('#cnote').click(); await wait(500);
await p.locator('[data-ntag=deck]').click(); await p.fill('#nt-text', 'Quick tidy is too often, every other week is plenty'); await p.selectOption('#nt-item', { index: 1 }); await p.locator('#nt-save').click(); await wait(500);
ok(await p.locator('#nt-list .note').count() === 1, 'note saved on the card');
await p.keyboard.press('Escape'); await wait(500);
await p.locator('#tabbar [data-tab=plan]').click(); await wait(500); await p.locator('[data-sub=deck]').click(); await wait(600);
ok(await p.locator('#deck-notes .note').count() === 1, 'next-deck note is shown on the Deck step');
await p.locator('#topMore').click(); await wait(600);
ok(await p.locator('#notes-panel .note').count() === 1, 'note listed under More');
await p.locator('[data-theme-pick=ember]').click(); await wait(500);
ok(await p.evaluate(() => document.documentElement.getAttribute('data-theme') === 'ember'), 'theme switch applies at once');
ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); process.exit(failed ? 1 : 0);
