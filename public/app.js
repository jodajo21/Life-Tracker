import { bars, heatmap, hbars, ring } from './charts.js';
import { buildQuarter, nextMonday } from './scheduler.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const view = $('#view');
const COLORS = { fitness: 'var(--fit)', home: 'var(--home)' };
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ------------------------------------------------------------------ api
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.body ? 'POST' : opts.method || 'GET',
    headers: { authorization: 'Bearer ' + store.get('token', ''), ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { showLogin(); throw new Error('Not signed in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const toast = (msg) => { const t = document.createElement('div'); t.textContent = msg; t.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;background:#111d;color:#fff;padding:10px 16px;border-radius:12px;z-index:20;max-width:90%'; document.body.append(t); setTimeout(() => t.remove(), 3500); };

function showLogin() {
  view.innerHTML = `<h1>Life Tracker</h1><div class="panel"><p>Enter your access token (the <code>APP_TOKEN</code> you set when deploying).</p>
    <input id="tok" type="password" placeholder="Access token" autocomplete="current-password"><p></p><button class="primary" id="go">Sign in</button><p id="err" class="warn"></p></div>`;
  $('#go').onclick = async () => {
    store.set('token', $('#tok').value.trim());
    try { await api('/ping'); location.reload(); } catch { $('#err').textContent = 'That token was not accepted.'; }
  };
}

// ------------------------------------------------------------------ router
const tabs = { dash: renderDash, log: renderLog, ask: renderAsk, cards: renderCards, tidy: renderTidy };
function go(tab) {
  if (!tabs[tab]) tab = 'dash';
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  history.replaceState(null, '', '#' + tab);
  view.innerHTML = '<p class="spinner">Loading…</p>';
  tabs[tab]().catch((e) => { view.innerHTML = `<div class="panel warn">${esc(e.message)}</div>`; });
  window.scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
async function refreshBadge() {
  try { const s = await api('/merge-suggestions'); const b = $('#badge'); b.hidden = !s.length; b.textContent = s.length; } catch {}
}

// ------------------------------------------------------------------ dashboard
function rangeFor(kind) {
  const now = new Date(); const today = ymd(now);
  let from, to, buckets = [];
  if (kind === 'week') {
    const m = monday(now); from = m; to = addDays(m, 6);
    buckets = Array.from({ length: 7 }, (_, i) => ({ label: DOW[(i + 1) % 7][0], from: ymd(addDays(m, i)), to: ymd(addDays(m, i)) }));
  } else if (kind === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    buckets = Array.from({ length: to.getDate() }, (_, i) => { const d = ymd(addDays(from, i)); return { label: String(i + 1), from: d, to: d }; });
  } else if (kind === 'quarter') {
    const m = addDays(monday(now), -12 * 7); from = m; to = addDays(m, 13 * 7 - 1);
    buckets = Array.from({ length: 13 }, (_, i) => { const s = addDays(m, i * 7); return { label: `${s.getMonth() + 1}/${s.getDate()}`, from: ymd(s), to: ymd(addDays(s, 6)) }; });
  } else {
    from = new Date(now.getFullYear(), now.getMonth() - 11, 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    buckets = Array.from({ length: 12 }, (_, i) => { const s = new Date(from.getFullYear(), from.getMonth() + i, 1); return { label: s.toLocaleString('en', { month: 'short' }), from: ymd(s), to: ymd(new Date(s.getFullYear(), s.getMonth() + 1, 0)) }; });
  }
  return { from: ymd(from), to: ymd(to), today, buckets };
}

async function renderDash() {
  const kind = store.get('range', 'week');
  const R = rangeFor(kind);
  const [entries, plan] = await Promise.all([api(`/entries?from=${R.from}&to=${R.to}`), api(`/card-stats?from=${R.from}&to=${R.today < R.to ? R.today : R.to}`)]);
  const showEvery = { week: 1, month: 5, quarter: 2, year: 1 }[kind];
  const label = { week: 'This week', month: 'This month', quarter: 'Last 13 weeks', year: 'Last 12 months' }[kind];

  const goalPanel = (goal, title) => {
    const es = entries.filter((e) => e.goal === goal);
    const color = COLORS[goal];
    const series = R.buckets.map((b) => ({ label: b.label, value: es.filter((e) => e.date >= b.from && e.date <= b.to).length }));
    const dayCounts = {}; es.forEach((e) => (dayCounts[e.date] = (dayCounts[e.date] || 0) + 1));
    const dow = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ label: DOW[d], value: es.filter((e) => parse(e.date).getDay() === d).length }));
    const topDay = dow.some((d) => d.value) ? dow.slice().sort((a, b) => b.value - a.value)[0].label : '–';
    const byCat = {}; es.forEach((e) => (byCat[e.activity] = (byCat[e.activity] || 0) + 1));
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
    let stats, extra = '';
    if (goal === 'fitness') {
      stats = [[Object.keys(dayCounts).length, 'active days'], [es.length, 'exercises logged'], [topDay, 'strongest day']];
    } else {
      const planned = plan.length, done = plan.filter((p) => p.done).length;
      stats = [[planned ? Math.round((100 * done) / planned) + '%' : '–', 'of card tasks done'], [es.length, 'tasks completed'], [topDay, 'strongest day']];
      const rooms = {}; plan.forEach((p) => { const r = p.room || 'General'; rooms[r] = rooms[r] || { done: 0, of: 0 }; rooms[r].of++; if (p.done) rooms[r].done++; });
      const roomBars = Object.entries(rooms).sort((a, b) => b[1].of - a[1].of).map(([label, v]) => ({ label, value: v.done, of: v.of }));
      extra = roomBars.length ? `<div class="chart-title">Card tasks done, by room</div>${hbars(roomBars, color)}` : '';
      if (planned) extra = `<div class="row" style="margin-top:6px">${ring(done / planned, color, 'cards')}<div class="sub">${done} of ${planned} planned card tasks checked off so far.</div></div>` + extra;
    }
    const body = es.length || (goal === 'home' && plan.length)
      ? `<div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
         ${extra}
         <div class="chart-title">${goal === 'fitness' ? 'Exercises' : 'Tasks'} logged · ${label.toLowerCase()}</div>${bars(series, color, { showEvery })}
         ${kind !== 'week' ? `<div class="chart-title">Daily activity</div>${heatmap(dayCounts, R.from, R.to < R.today ? R.to : R.today, color)}` : ''}
         <div class="chart-title">By day of week</div>${bars(dow, color, { height: 90 })}
         ${top.length ? `<div class="chart-title">Most frequent</div>${hbars(top, color)}` : ''}`
      : `<div class="empty">Nothing logged ${label.toLowerCase()} yet. Tell it what you did on the Log tab.</div>`;
    return `<section class="panel ${goal === 'fitness' ? 'fit' : 'home'}"><h2>${title}</h2>${body}</section>`;
  };
  view.innerHTML = `<h1>Dashboard</h1>
    <div class="seg">${['week', 'month', 'quarter', 'year'].map((k) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    ${goalPanel('fitness', 'Fitness')}${goalPanel('home', 'Home life')}`;
  view.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { store.set('range', b.dataset.k); go('dash'); }));
}

// ------------------------------------------------------------------ log
async function renderLog() {
  const recent = await api(`/entries?from=${ymd(addDays(new Date(), -14))}`);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  view.innerHTML = `<h1>Log</h1>
    <div class="panel"><textarea id="txt" placeholder="e.g. “Did chest and triceps for an hour, bench 4 sets of 8 at 135, and vacuumed the whole downstairs”"></textarea>
      <div class="row" style="margin-top:10px">${SR ? '<button class="sec" id="mic">🎤 Dictate</button>' : ''}<span class="grow"></span><button class="primary" id="save">Log it</button></div>
      <p id="out" class="sub"></p></div>
    <div class="panel"><h2>Last 2 weeks</h2>${recent.length ? recent.map(entryRow).join('') : '<div class="empty">No entries yet.</div>'}</div>`;
  $('#save').onclick = async () => {
    const text = $('#txt').value.trim(); if (!text) return;
    $('#save').disabled = true; $('#out').textContent = 'Working on it…';
    try { const r = await api('/log', { body: { text, source: 'text' } }); $('#out').textContent = r.message; $('#txt').value = ''; refreshBadge(); setTimeout(() => go('log'), 1500); }
    catch (e) { $('#out').textContent = e.message; $('#save').disabled = false; }
  };
  if (SR) $('#mic').onclick = () => {
    const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false;
    rec.onresult = (ev) => { $('#txt').value = ($('#txt').value + ' ' + ev.results[0][0].transcript).trim(); };
    rec.onerror = () => toast('Microphone not available'); rec.start(); toast('Listening…');
  };
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this entry?')) { await api('/entries/' + b.dataset.del, { method: 'DELETE' }); go('log'); } }));
}
function entryRow(e) {
  const d = JSON.parse(e.details || '{}'); delete d.card;
  const bits = Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
  return `<div class="entry"><div><span class="tag ${e.goal}">${e.goal}</span> <b>${esc(e.activity)}</b><div class="sub">${parse(e.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}${bits ? ' · ' + esc(bits) : ''}</div></div><button class="link danger" data-del="${e.id}">✕</button></div>`;
}

// ------------------------------------------------------------------ ask (conversational)
let chatHistory = [];
async function renderAsk() {
  const ideas = ['When do I tend to slip on my goals?', 'How consistent have I been this month?', 'Which rooms am I neglecting?', 'What patterns do you see in my workouts?', 'Which days do I skip my cards most?'];
  view.innerHTML = `<h1>Ask</h1>
    ${chatHistory.length ? '' : `<div class="chips">${ideas.map((i) => `<button>${esc(i)}</button>`).join('')}</div>`}
    <div class="chat" id="chat"></div>
    <div class="row"><input id="q" placeholder="Ask anything about your goals…"><button class="primary" id="send">Send</button></div>`;
  const draw = () => { $('#chat').innerHTML = chatHistory.map((m) => `<div class="bubble ${m.role === 'user' ? 'user' : 'ai'}">${esc(m.content)}</div>`).join(''); };
  const send = async (text) => {
    if (!text.trim()) return; chatHistory.push({ role: 'user', content: text }); draw(); $('#q').value = '';
    $('#chat').insertAdjacentHTML('beforeend', '<div class="bubble ai spinner" id="think">Looking through your data…</div>');
    try { const r = await api('/chat', { body: { messages: chatHistory } }); chatHistory.push({ role: 'assistant', content: r.reply }); }
    catch (e) { chatHistory.pop(); toast(e.message); }
    draw(); $('#q').focus();
  };
  $('#send').onclick = () => send($('#q').value);
  $('#q').onkeydown = (e) => { if (e.key === 'Enter') send($('#q').value); };
  view.querySelectorAll('.chips button').forEach((b) => (b.onclick = () => { send(b.textContent); b.parentElement.remove(); }));
  draw();
}

// ------------------------------------------------------------------ cards
const PRESETS = [[39, 'Every card'], [13, 'Weekly'], [7, 'Every 2 weeks'], [6, 'Twice a month'], [3, 'Monthly'], [1, 'Quarterly']];
let preview = null;

async function renderCards() {
  const [current, sets, chores] = await Promise.all([api('/cards/current'), api('/card-sets'), api('/chores')]);
  const active = chores.filter((c) => c.active);
  const startDefault = nextMonday(ymd(addDays(new Date(), sets.length ? 0 : 0)));
  view.innerHTML = `<h1>Cards</h1>
    <section class="panel home"><h2>${current ? `Current card · ${esc(current.label)}` : 'No card yet'}</h2>
      ${current ? `<div class="sub">${current.code} · ${parse(current.start_date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}–${parse(current.end_date).toLocaleDateString('en', { day: 'numeric' })}</div>
        <div id="items">${current.items.map(itemRow).join('')}</div>` : '<div class="empty">Generate your first quarter of cards below.</div>'}
      <div class="row" style="margin-top:12px"><label class="primary" style="cursor:pointer;text-align:center;flex:1;padding:11px">📷 Photo of a card<input id="photo" type="file" accept="image/*" capture="environment" hidden></label></div>
      <p class="sub">Snap a card (or pick a photo from your library) and it reads which boxes are checked.</p></section>

    <section class="panel"><h2>Generate a quarter of cards</h2>
      <div class="row wrap"><div class="grow"><label class="sub">First Monday</label><input type="date" id="start" value="${startDefault}"></div><button class="primary" id="gen">Preview</button></div>
      <div id="preview"></div></section>

    <section class="panel"><h2>Printed sets</h2>${sets.length ? sets.map((s) => `<div class="entry"><span>Set ${s.id} · starts ${s.start_date} · ${s.cards} cards</span><button class="sec" data-print="${s.id}">Print</button></div>`).join('') : '<div class="empty">None yet.</div>'}
      <p class="sub">Printing uses 4×6 in paper (AirPrint on iPhone, or the print dialog on Mac with a 4×6 paper size).</p></section>

    <section class="panel"><h2>House tasks</h2><p class="sub">${active.reduce((s, c) => s + Math.min(c.per_quarter, 39), 0)} placements across 39 cards (aim for 117–234).</p>
      ${active.map(choreRow).join('')}
      <div class="chore"><input id="nc-name" placeholder="New task"><div class="row"><input id="nc-room" placeholder="Room">${freqSelect(13, 'nc-freq')}<button class="sec" id="nc-add">Add</button></div></div></section>
    <dialog id="dlg"></dialog>`;

  view.querySelectorAll('#items input').forEach((cb) => (cb.onchange = async () => {
    await api(`/cards/${current.id}/items`, { body: cb.checked ? { check: [+cb.dataset.id] } : { uncheck: [+cb.dataset.id] } });
    cb.closest('.check').classList.toggle('done', cb.checked);
  }));
  $('#photo').onchange = (e) => e.target.files[0] && handlePhoto(e.target.files[0]);
  $('#gen').onclick = () => generate(active);
  view.querySelectorAll('[data-print]').forEach((b) => (b.onclick = async () => printCards(await api('/card-sets/' + b.dataset.print))));
  view.querySelectorAll('[data-chore]').forEach((el) => (el.onchange = () => saveChore(el.closest('.chore'), chores)));
  view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { if (confirm('Remove this task from future cards?')) { await api('/chores/' + b.dataset.rm, { method: 'DELETE' }); go('cards'); } }));
  $('#nc-add').onclick = async () => {
    const name = $('#nc-name').value.trim(); if (!name) return;
    await api('/chores', { body: { name, room: $('#nc-room').value.trim() || 'General', per_quarter: +$('#nc-freq').value } }); go('cards');
  };
}
const itemRow = (i) => `<label class="check ${i.done ? 'done' : ''}"><input type="checkbox" data-id="${i.id}" ${i.done ? 'checked' : ''}><span>${esc(i.name)}${i.room ? `<small>${esc(i.room)}</small>` : ''}</span></label>`;
function freqSelect(v, id = '') {
  const opts = PRESETS.some(([n]) => n === v) ? PRESETS : [...PRESETS, [v, `${v}× / quarter`]];
  return `<select ${id ? `id="${id}"` : 'data-chore="freq"'}>${opts.map(([n, l]) => `<option value="${n}" ${n === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
const choreRow = (c) => `<div class="chore" data-id="${c.id}"><input data-chore="name" value="${esc(c.name)}"><div class="row"><input data-chore="room" value="${esc(c.room)}">${freqSelect(c.per_quarter)}<button class="link danger" data-rm="${c.id}">✕</button></div></div>`;
async function saveChore(tr, chores) {
  const id = +tr.dataset.id; const c = chores.find((x) => x.id === id);
  await api('/chores', { body: { id, name: $('[data-chore=name]', tr).value, room: $('[data-chore=room]', tr).value, per_quarter: +$('select', tr).value, active: c.active } });
  toast('Saved');
}

function generate(chores) {
  const start = $('#start').value;
  preview = buildQuarter(chores, start);
  const counts = preview.cards.map((c) => c.items.length);
  $('#preview').innerHTML = `${preview.warnings.map((w) => `<p class="warn">⚠ ${esc(w)}</p>`).join('')}
    <div class="chart-title">Tasks per card (13 weeks × Mon–Tue / Wed–Thu / Fri–Sat)</div>
    <div class="strip">${counts.map((n) => `<i style="height:${(n / 6) * 100}%" title="${n}"></i>`).join('')}</div>
    <div class="chart-title">Placements by room</div>${hbars(Object.entries(preview.roomCoverage).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), 'var(--home)')}
    <p class="sub">Starts Monday ${preview.startDate}. Saving does not touch your existing cards.</p>
    <div class="row"><button class="primary" id="save-set">Save & print</button><button class="sec" id="save-only">Save only</button></div>`;
  const save = async (print) => {
    const r = await api('/card-sets', { body: { start_date: preview.startDate, cards: preview.cards } });
    if (print) printCards(await api('/card-sets/' + r.set_id)); else { toast('Saved'); go('cards'); }
  };
  $('#save-set').onclick = () => save(true); $('#save-only').onclick = () => save(false);
}

function printCards(cards) {
  const fmtR = (c) => { const a = parse(c.start_date), b = parse(c.end_date); const m = (d) => d.toLocaleDateString('en', { month: 'short' }); return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getDate()}–${b.getDate()}` : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}`; };
  $('#print-root').innerHTML = cards.map((c) => `<section class="pcard"><header><div><h3>${esc(c.label.replace('–', ' · ').toUpperCase())}</h3><div class="dates">${fmtR(c)}</div></div><div class="code">${c.code}</div></header>
    <ul>${c.items.map((i) => `<li><span class="box"></span><span>${esc(i.name)}${i.room ? `<span class="room">${esc(i.room)}</span>` : ''}</span></li>`).join('')}</ul>
    <footer><span>Home · 2-day card</span><span>Check the box when done</span></footer></section>`).join('');
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(() => window.print(), 100);
}

async function resizeToJpeg(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}
async function handlePhoto(file) {
  toast('Reading your card…');
  try {
    const r = await api('/photo', { body: { image: await resizeToJpeg(file), media_type: 'image/jpeg' } });
    if (!r.card) { toast(r.notes || "Couldn't tell which card that is"); return; }
    if (r.auto_applied) { toast(`Card ${r.card.code}: recorded ${r.proposal.filter((p) => p.checked && !p.was_done).length} new tasks`); go('cards'); return; }
    const dlg = $('#dlg');
    dlg.innerHTML = `<h2>Is this right? · ${esc(r.card.code)}</h2><p class="sub">I wasn't fully sure about a few boxes. ${esc(r.notes)}</p>
      ${r.proposal.map((p) => `<label class="check"><input type="checkbox" data-id="${p.item_id}" data-was="${p.was_done ? 1 : 0}" ${p.checked ? 'checked' : ''}><span>${esc(p.name)}${p.confidence < 0.8 ? '<small>unsure</small>' : ''}</span></label>`).join('')}
      <div class="row" style="margin-top:12px"><button class="sec" id="cancel">Cancel</button><span class="grow"></span><button class="primary" id="ok">Confirm</button></div>`;
    dlg.showModal();
    $('#cancel', dlg).onclick = () => dlg.close();
    $('#ok', dlg).onclick = async () => {
      const boxes = [...dlg.querySelectorAll('input')];
      await api(`/cards/${r.card.id}/items`, { body: { check: boxes.filter((b) => b.checked && b.dataset.was === '0').map((b) => +b.dataset.id), uncheck: boxes.filter((b) => !b.checked && b.dataset.was === '1').map((b) => +b.dataset.id) } });
      dlg.close(); go('cards');
    };
  } catch (e) { toast(e.message); }
}

// ------------------------------------------------------------------ tidy: merges, backup
async function renderTidy() {
  const [sugs, cats] = await Promise.all([api('/merge-suggestions'), api('/categories')]);
  const opt = (c) => `<option value="${c.id}">${c.goal} · ${esc(c.name)} (${c.uses})</option>`;
  view.innerHTML = `<h1>Tidy</h1>
    <section class="panel"><h2>Possible duplicates</h2>${sugs.length ? sugs.map((s) => `<div class="sug"><b>${esc(s.a_name)}</b> and <b>${esc(s.b_name)}</b> — same thing? <span class="sub">(${Math.round(s.confidence * 100)}% sure)</span>
      <div class="row" style="margin-top:8px"><button class="primary" data-keep="${s.b_id}" data-drop="${s.a_id}">Merge into “${esc(s.b_name)}”</button><button class="sec" data-keep="${s.a_id}" data-drop="${s.b_id}">…into “${esc(s.a_name)}”</button><button class="link" data-dismiss="${s.id}">Different</button></div></div>`).join('') : '<div class="empty">Nothing to review. New wording that’s clearly the same is merged automatically.</div>'}</section>
    <section class="panel"><h2>Merge categories yourself</h2><div class="row wrap"><select id="m-drop" class="grow">${cats.map(opt).join('')}</select><span>→</span><select id="m-keep" class="grow">${cats.map(opt).join('')}</select></div><p></p><button class="sec" id="m-go">Merge</button></section>
    <section class="panel"><h2>Your data</h2><p class="sub">Everything lives in your own database and is backed up nightly. You can also download a full copy any time.</p>
      <div class="row"><button class="sec" id="export">Download backup (JSON)</button><button class="sec" id="signout">Sign out</button></div></section>`;
  const merge = async (keep, drop) => { await api('/merge', { body: { keep_id: keep, drop_id: drop } }); toast('Merged'); refreshBadge(); go('tidy'); };
  view.querySelectorAll('[data-keep]').forEach((b) => (b.onclick = () => merge(+b.dataset.keep, +b.dataset.drop)));
  view.querySelectorAll('[data-dismiss]').forEach((b) => (b.onclick = async () => { await api(`/merge-suggestions/${b.dataset.dismiss}/dismiss`, { body: {} }); refreshBadge(); go('tidy'); }));
  $('#m-go').onclick = () => { const d = $('#m-drop').value, k = $('#m-keep').value; if (d !== k && confirm('Merge these? This cannot be undone.')) merge(+k, +d).catch((e) => toast(e.message)); };
  $('#export').onclick = async () => {
    const blob = new Blob([JSON.stringify(await api('/export'), null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `life-tracker-${ymd(new Date())}.json` }); a.click();
  };
  $('#signout').onclick = () => { store.set('token', ''); location.reload(); };
}

window.addEventListener('hashchange', () => { if (store.get('token', '')) go(location.hash.slice(1) || 'dash'); });
// ------------------------------------------------------------------ boot
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (!store.get('token', '')) showLogin();
else { go(location.hash.slice(1) || 'dash'); refreshBadge(); }
