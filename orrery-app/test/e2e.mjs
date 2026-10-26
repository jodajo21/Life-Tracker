// End-to-end check of the stand-alone app on your own machine: a local copy of the Worker with a local database, and a stand-in for Claude.
//   node test/e2e.mjs        (needs `npm install` first; Playwright and a browser for the page tests)
import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startMock } from './mock-anthropic.mjs';
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node-tools/node_modules/playwright/index.mjs')); }

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, '..'), state = path.join(root, '.e2e-state'), PORT = 8799, BASE = `http://127.0.0.1:${PORT}`, TOKEN = 'test-access-code';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
fs.rmSync(state, { recursive: true, force: true });

const mock = await startMock(9911);
execSync(`npx wrangler d1 migrations apply orrery --local --persist-to ${state}`, { cwd: root, stdio: 'pipe' });
const dev = spawn('npx', ['wrangler', 'dev', '--local', '--port', String(PORT), '--persist-to', state, '--var', `APP_TOKEN:${TOKEN}`, '--var', 'ANTHROPIC_API_KEY:test-key', '--var', 'ANTHROPIC_BASE_URL:http://127.0.0.1:9911', '--var', 'DAILY_CALL_LIMIT:40', '--var', 'TZ_NAME:UTC'], { cwd: root, stdio: 'pipe' });
let log = ''; dev.stdout.on('data', (d) => (log += d)); dev.stderr.on('data', (d) => (log += d));
const stop = async () => { dev.kill('SIGKILL'); mock.close(); try { execSync(`pkill -f "wrangler.*${PORT}" || true; pkill -f workerd || true`, { stdio: 'ignore' }); } catch { /* none */ } };
process.on('exit', () => dev.kill('SIGKILL'));
for (let i = 0; i < 80; i++) { try { const r = await fetch(`${BASE}/api/ping`); if (r.status === 401) break; } catch { /* not up yet */ } await sleep(500); if (i === 79) { console.log(log); await stop(); process.exit(1); } }

const api = (p, opt = {}) => fetch(BASE + p, { ...opt, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json', ...(opt.headers || {}) } });
// ---------------------------------------------------------------- the API
ok((await fetch(`${BASE}/api/sync?since=0`)).status === 401, 'API refuses a request with no access code');
ok((await fetch(`${BASE}/api/ping`, { headers: { authorization: 'Bearer nope' } })).status === 401, 'API refuses a wrong code');
ok((await (await api('/api/ping')).json()).ok === true, 'API accepts the right code');
let r = await (await api('/api/write', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'set', path: 'notes/a', data: { text: 'one', n: 1 } }, { op: 'update', path: 'notes/a', data: { n: 2 } }, { op: 'set', path: 'notes/b', data: { text: 'two' } }] }) })).json();
ok(r.ok && r.seq >= 2, 'writes apply in order (set then update)');
let s = await (await api('/api/sync?since=0')).json();
ok(s.docs.length === 2 && s.docs.find((d) => d.path === 'notes/a').data.n === 2, 'sync returns the merged documents');
await api('/api/write', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'delete', path: 'notes/b' }] }) });
const s2 = await (await api(`/api/sync?since=${s.seq}`)).json();
ok(s2.docs.length === 1 && s2.docs[0].data === null, 'a delete reaches other devices as an empty row');
ok((await api('/api/write', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'set', path: 'bad path', data: {} }] }) })).status === 400, 'bad paths are refused');
await api('/api/write', { method: 'POST', body: JSON.stringify({ ops: [{ op: 'set', path: 'categories/c1', data: { goal: 'fitness', name: 'Running', aliases: ['jog'] } }] }) });

// ---------------------------------------------------------------- Siri
const siri = await api('/api/siri?plain=1', { method: 'POST', body: JSON.stringify({ text: 'did squats five by five at one eighty five yesterday', date: '2026-10-21', client_id: 'abc' }) });
const said = await siri.text();
ok(siri.status === 200 && /^Logged: Back Squat, 5 sets of 5 at 185 lb\.$/.test(said), 'Siri endpoint answers in plain words: ' + said);
const again = await api('/api/siri?plain=1', { method: 'POST', body: JSON.stringify({ text: 'did squats five by five at one eighty five yesterday', date: '2026-10-21', client_id: 'abc' }) }); await again.text();
s = await (await api('/api/sync?since=0')).json();
ok(s.docs.filter((d) => d.path.startsWith('inbox/')).length === 1, 'the same Siri note posted twice is stored once');
const unclear = await (await api('/api/siri?plain=1', { method: 'POST', body: JSON.stringify({ text: 'hmm' }) })).text();
ok(/What did you do/.test(unclear), 'an unclear note gets a question back');
ok((await api('/api/siri?plain=1', { method: 'POST', body: JSON.stringify({ text: '' }) })).status === 400, 'an empty note is refused');

// ---------------------------------------------------------------- the page
const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const newPage = async (ctx) => { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); p.on('console', (m) => {  if (m.type() === 'error' && !/Failed to load|ERR_|favicon|fonts/.test(m.text())) p.errs.push(m.text()); }); await p.route(/fonts\.(googleapis|gstatic)/, (rt) => rt.abort()); return p; };
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true };
const ctx = await b.newContext(phone); const p = await newPage(ctx);
await p.addInitScript('window.__ORRERY_DEBUG=1'); await p.clock.setFixedTime(new Date('2026-10-22T10:00:00Z'));
await p.goto(BASE); await sleep(800);
ok(await p.locator('input[type=password]').count() === 1, 'the page asks for the access code on a new device');
await p.fill('input[type=password]', 'wrong'); await p.keyboard.press('Enter'); await sleep(500);
ok(/did not work/.test(await p.locator('form').innerText()), 'a wrong code is turned down');
await p.fill('input[type=password]', TOKEN); await p.keyboard.press('Enter'); await sleep(1500);
ok(await p.locator('.hero').count() === 1, 'the right code opens the app');
ok(/Let’s set up your home/.test(await p.locator('.hero h1').innerText()), 'it starts empty (the notes/categories from the API tests are not Orrery data)');

// set up, deal, review, make the PDF, start the cycle
await p.locator('[data-setup=rooms]').click(); await sleep(300); await p.locator('#qs-go').click(); await sleep(2500);
await p.locator('[data-sub=deck]').click(); await sleep(300); await p.locator('#deal').click(); await sleep(2500);
await p.locator('#approve').click(); await sleep(500); await p.locator('#to-print').click(); await sleep(900);
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.locator('#pdf-all').click()]);
const pdfPath = await dl.path(); ok(/^orrery-cards-deck-1\.pdf$/.test(dl.suggestedFilename()) && fs.readFileSync(pdfPath).subarray(0, 5).toString() === '%PDF-', 'the PDF downloads: ' + dl.suggestedFilename());
await sleep(500); await p.locator('#cyc-go').click(); await sleep(2500);
ok(/Cycle 1/.test(await p.locator('.wall-cap').first().innerText().catch(() => '')) || (await p.locator('.paper').count()) >= 1, 'the cycle starts and today’s card shows');

// everything reached the server
await p.evaluate(() => window.__shim.flush()); await sleep(1500);
s = await (await api('/api/sync?since=0')).json();
const colls = new Set(s.docs.map((d) => d.path.split('/')[0]));
ok(['decks', 'cardsets', 'chores', 'rooms', 'categories'].every((c) => colls.has(c)), 'the server holds decks, cycles, tasks and rooms: ' + [...colls].join(', '));
ok((await p.evaluate(() => window.__shim.state.pending)) === 0, 'nothing is left waiting to sync');

// it survives a reload, and a second device sees the same thing
await p.reload(); await sleep(1500);
ok(await p.locator('.paper').count() >= 1, 'after a reload the card is still there');
const ctx2 = await b.newContext(phone); const p2 = await newPage(ctx2); await p2.clock.setFixedTime(new Date('2026-10-22T10:00:00Z')); await p2.goto(BASE); await sleep(600);
await p2.fill('input[type=password]', TOKEN); await p2.keyboard.press('Enter'); await sleep(2500);
ok(await p2.locator('.paper').count() >= 1, 'a second device signs in and sees the same cycle');

// log by text (Claude through the Worker)
await p.locator('#tbLog').click(); await sleep(500); await p.fill('#lg-text', 'back squats five by five at 185'); await p.locator('#lg-go').click(); await sleep(2500);
ok(/Back Squat/.test((await p.locator('.toast').allTextContents()).join(' ')), 'logging by text goes through Claude and saves');
await p.evaluate(() => window.__shim.flush()); await sleep(1200);
s = await (await api('/api/sync?since=0')).json();
ok(s.docs.some((d) => d.path.startsWith('entries/') && d.data.activity === 'Back Squat' && d.data.details.weight === 185), 'the entry is on the server');

// a photo of the card
await p.evaluate(() => scrollTo(0, 0));
await p.setInputFiles('#snapfile', new URL('./card.png', import.meta.url).pathname); await sleep(3500);
ok(await p.locator('#sheet[open]').count() === 1 && /Logged|Is this right|Card complete/.test(await p.locator('#shT').innerText()), 'a photo is read through Claude: ' + (await p.locator('#shT').innerText()));
await p.keyboard.press('Escape'); await sleep(400);

// Ask: streaming plus a tool loop that runs in the page
await p.locator('#tabbar [data-tab=ask]').click(); await sleep(500);
const hadChips = await p.locator('.chips button').count(); if (hadChips) await p.locator('.chips button').first().click(); else { await p.fill('#q', 'when do I slip?'); await p.locator('#send').click(); }
await sleep(3500);
ok(/Wednesday/.test(await p.locator('#chat').innerText()), 'Ask answers after running its tool in the page');
ok(mock.calls.some((c) => c.stream && c.tools.includes('aggregate')), 'Ask used a streamed request with tools');
ok(mock.calls.every((c) => c.key === 'test-key'), 'the API key came from the Worker, not the page');

// Siri note arrives while the app is open: it is logged by the app's own rules
await p.locator('#tabbar [data-tab=today]').click(); await sleep(400);
await api('/api/siri?plain=1', { method: 'POST', body: JSON.stringify({ text: 'went for a run yesterday', date: '2026-10-21', client_id: 'run1' }) });
await p.evaluate(() => window.__shim.pull()); await sleep(2500);
await p.evaluate(() => window.__shim.flush()); await sleep(1200);
s = await (await api('/api/sync?since=0')).json();
const run = s.docs.find((d) => d.path.startsWith('entries/') && d.data && d.data.activity === 'Running');
if (!run) console.log('  debug:', await p.evaluate(() => JSON.stringify(window.__shim.state)));
ok(!!run && run.data.date === '2026-10-20' && run.data.source === 'siri', 'a Siri note becomes a logged workout on the day it was said (yesterday, as spoken)');
const sq = s.docs.find((d) => d.path.startsWith('entries/') && d.data && d.data.source === 'siri' && d.data.activity === 'Back Squat');
ok(!!sq, 'and so does the earlier Siri note');
ok(!s.docs.some((d) => d.path.startsWith('inbox/') && d.data), 'the inbox is empty afterwards');

// offline: changes wait, then go through
await ctx.setOffline(true); await sleep(300);
await p.locator('.paper .pi input').first().evaluate((el) => el.click()); await sleep(800);
ok((await p.evaluate(() => window.__shim.state.pending)) > 0, 'offline: the tick is kept and waits');
await ctx.setOffline(false); for (let i = 0; i < 6 && (await p.evaluate(() => window.__shim.state.pending)) > 0; i++) { await sleep(1500); await p.evaluate(() => window.__shim.flush()); }
ok((await p.evaluate(() => window.__shim.state.pending)) === 0, 'back online: it goes through');

ok(p.errs.length === 0, 'no errors in the page' + (p.errs.length ? ': ' + p.errs.slice(0, 3).join(' | ') : ''));
await b.close(); await stop();
fs.rmSync(state, { recursive: true, force: true });
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
