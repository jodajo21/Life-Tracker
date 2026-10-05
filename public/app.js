import { bars, heatmap, hbars, ring } from './charts.js';
import { buildQuarter, nextMonday } from './scheduler.js';
import { $, esc, ymd, parse, addDays, monday, DOW, store, toast, api, setAuthHandler, flushQueue, queueCount } from './util.js';
import { renderToday } from './today.js';
import { initQuickAdd } from './quickadd.js';

const view = $('#view');
const COLORS = { fitness: 'var(--fit)', home: 'var(--home)' };
let current = 'today';

setAuthHandler(showLogin);
function showLogin() {
  $('#fab')?.remove();
  view.innerHTML = `<h1>Life Tracker</h1><div class="panel"><p>Enter your access token (the <code>APP_TOKEN</code> you set when deploying).</p>
    <input id="tok" type="password" placeholder="Access token" autocomplete="current-password"><p></p><button class="primary" id="go">Sign in</button><p id="err" class="warn"></p></div>`;
  $('#go').onclick = async () => {
    store.set('token', $('#tok').value.trim());
    try { await api('/ping'); location.reload(); } catch { $('#err').textContent = 'That token was not accepted.'; }
  };
}

// ------------------------------------------------------------------ router
const tabs = { today: () => renderToday(view, rerender), trends: renderTrends, ask: renderAsk, cards: renderCards, more: renderMore };
const alias = { dash: 'trends', log: 'today', tidy: 'more' };
function go(tab, { keepScroll = false } = {}) {
  tab = alias[tab] || tab;
  if (!tabs[tab]) tab = 'today';
  current = tab;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
  const y = window.scrollY;
  if (!keepScroll) view.innerHTML = '<p class="spinner">Loading…</p>';
  return tabs[tab]().catch((e) => { if (e.message !== 'Not signed in') view.innerHTML = `<div class="panel warn">${esc(e.message)}</div>`; }).then(() => window.scrollTo(0, keepScroll ? y : 0));
}
const rerender = () => go(current, { keepScroll: true });
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => go(b.dataset.tab)));
window.addEventListener('hashchange', () => { if (store.get('token', '')) go(location.hash.slice(1) || 'today'); });
window.addEventListener('data-changed', () => { if (current === 'today' || current === 'trends') rerender(); refreshBadge(); });
window.addEventListener('queue-flushed', () => { toast('Offline items synced ✓'); rerender(); refreshBadge(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && store.get('token', '')) flushQueue().then(() => current === 'today' && rerender()); });

async function refreshBadge() {
  try { const s = await api('/merge-suggestions'); const b = $('#badge'); b.hidden = !s.length; b.textContent = s.length; } catch {}
}

// ------------------------------------------------------------------ trends
let dayOffset = 0;
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
const KINDS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['quarter', '3 Months'], ['year', 'Year']];

async function renderTrends() {
  const kind = store.get('range', 'week');
  const seg = `<div class="seg">${KINDS.map(([k, n]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const bind = () => view.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { store.set('range', b.dataset.k); go('trends'); }));
  if (kind === 'day') return renderDay(seg, bind);

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
      stats = [[Object.keys(dayCounts).length, 'active days'], [es.length, 'exercises logged'], [topDay, 'busiest day']];
    } else {
      const planned = plan.length, done = plan.filter((p) => p.done).length;
      stats = [[planned ? Math.round((100 * done) / planned) + '%' : '–', 'of card tasks done'], [es.length, 'tasks completed'], [topDay, 'busiest day']];
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
      : `<div class="empty">Nothing logged ${label.toLowerCase()} yet.</div>`;
    return `<section class="panel ${goal === 'fitness' ? 'fit' : 'home'}"><h2>${title}</h2>${body}</section>`;
  };
  view.innerHTML = `<h1>Trends</h1>${seg}${goalPanel('fitness', 'Fitness')}${goalPanel('home', 'Home life')}`;
  bind();
}

async function renderDay(seg, bind) {
  const day = ymd(addDays(new Date(), dayOffset));
  const [entries, t] = await Promise.all([api(`/entries?from=${day}&to=${day}`), api('/today?date=' + day)]);
  const xp = (g) => t.xp_events.filter((e) => e.domain === g).reduce((a, e) => a + e.xp, 0);
  const panel = (g, title) => {
    const es = entries.filter((e) => e.goal === g);
    return `<section class="panel ${g === 'fitness' ? 'fit' : 'home'}"><div class="row"><h2 class="grow">${title}</h2><b>${xp(g) ? '+' + xp(g) + ' XP' : ''}</b></div>
      ${es.length ? es.map((e) => { const d = JSON.parse(e.details || '{}'); delete d.card; const bits = Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
        return `<div class="entry"><div><b>${esc(e.activity)}</b>${bits ? `<div class="sub">${esc(bits)}</div>` : ''}</div><span class="sub">${e.source}</span></div>`; }).join('') : '<div class="empty">Nothing logged.</div>'}</section>`;
  };
  view.innerHTML = `<h1>Trends</h1>${seg}
    <div class="row" style="margin-bottom:12px"><button class="sec" id="prev">◀</button><b class="grow" style="text-align:center">${parse(day).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' })}</b><button class="sec" id="next" ${dayOffset >= 0 ? 'disabled' : ''}>▶</button></div>
    ${panel('fitness', 'Fitness')}${panel('home', 'Home life')}`;
  bind();
  $('#prev').onclick = () => { dayOffset--; go('trends'); };
  $('#next').onclick = () => { dayOffset++; go('trends'); };
}

// ------------------------------------------------------------------ ask
let chatHistory = [];
function drawChart(c) {
  const color = COLORS[c.goal] || COLORS.home;
  const rows = c.rows || [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const [kc, vc] = [cols[0], cols[1]];
  let body = '';
  if (!rows.length) body = '<div class="empty">No data.</div>';
  else if (c.kind === 'heatmap') {
    const counts = Object.fromEntries(rows.map((r) => [r[kc], Number(r[vc]) || 0]));
    const ds = Object.keys(counts).sort(); body = heatmap(counts, ds[0], ds[ds.length - 1], color);
  } else if (c.kind === 'hbars') body = hbars(rows.map((r) => ({ label: String(r[kc]), value: Number(r[vc]) || 0 })), color);
  else body = bars(rows.map((r) => ({ label: String(r[kc]), value: Number(r[vc]) || 0 })), color, { showEvery: Math.ceil(rows.length / 12) });
  return `<div class="panel chartcard"><div class="chart-title" style="margin-top:0">${esc(c.title)}</div>${body}</div>`;
}
async function renderAsk() {
  const ideas = ['When do I tend to slip?', 'How consistent have I been this month?', 'Which rooms get the least attention?', 'What does my workout mix look like?', 'How close am I to the next level?'];
  view.innerHTML = `<h1>Ask</h1>
    ${chatHistory.length ? '' : `<div class="chips">${ideas.map((i) => `<button>${esc(i)}</button>`).join('')}</div>`}
    <div class="chat" id="chat"></div>
    <div class="row"><input id="q" placeholder="Ask anything about your patterns…"><button class="primary" id="send">Send</button></div>`;
  const draw = () => { $('#chat').innerHTML = chatHistory.map((m) => `<div class="bubble ${m.role === 'user' ? 'user' : 'ai'}">${esc(m.content)}</div>${(m.charts || []).map(drawChart).join('')}`).join(''); };
  const send = async (text) => {
    if (!text.trim()) return; chatHistory.push({ role: 'user', content: text }); draw(); $('#q').value = '';
    $('#chat').insertAdjacentHTML('beforeend', '<div class="bubble ai spinner">Looking through your data…</div>');
    try { const r = await api('/chat', { body: { messages: chatHistory.map(({ role, content }) => ({ role, content })) } }); chatHistory.push({ role: 'assistant', content: r.reply, charts: r.charts }); }
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
  const [sets, chores, rooms] = await Promise.all([api('/card-sets'), api('/chores'), api('/rooms')]);
  const active = chores.filter((c) => c.active);
  const weak = rooms.filter((r) => r.planned >= 3 && r.coverage < 0.6);
  view.innerHTML = `<h1>Cards</h1>
    <section class="panel"><h2>Generate a quarter of cards</h2>
      <div class="row wrap"><div class="grow"><label class="sub">First Monday</label><input type="date" id="start" value="${nextMonday(ymd(new Date()))}"></div><button class="primary" id="gen">Preview</button></div>
      ${weak.length ? `<label class="row" style="margin-top:10px"><input type="checkbox" id="boost" checked style="width:20px;height:20px"><span class="sub">Give extra attention to rooms that were under 60% last set: <b>${weak.map((r) => `${esc(r.room)} (${Math.round(r.coverage * 100)}%)`).join(', ')}</b></span></label>` : ''}
      <div id="preview"></div></section>

    <section class="panel"><h2>Printed sets</h2>${sets.length ? sets.map((s) => `<div class="entry"><span>Set ${s.id} · starts ${s.start_date} · ${s.cards} cards</span><button class="sec" data-print="${s.id}">Print</button></div>`).join('') : '<div class="empty">None yet.</div>'}
      <p class="sub">Printing uses 4×6 in paper (AirPrint on iPhone, or the print dialog on Mac with a 4×6 paper size).</p></section>

    <section class="panel"><h2>House tasks</h2><p class="sub">${active.reduce((s, c) => s + Math.min(c.per_quarter, 39), 0)} placements across 39 cards (aim for 117–234).</p>
      ${active.map(choreRow).join('')}
      <div class="chore"><input id="nc-name" placeholder="New task"><div class="row"><input id="nc-room" placeholder="Room">${freqSelect(13, 'nc-freq')}<button class="sec" id="nc-add">Add</button></div></div></section>`;

  $('#gen').onclick = () => generate(active, weak);
  view.querySelectorAll('[data-print]').forEach((b) => (b.onclick = async () => printCards(await api('/card-sets/' + b.dataset.print))));
  view.querySelectorAll('[data-chore]').forEach((el) => (el.onchange = () => saveChore(el.closest('.chore'), chores)));
  view.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = async () => { if (confirm('Remove this task from future cards?')) { await api('/chores/' + b.dataset.rm, { method: 'DELETE' }); go('cards'); } }));
  $('#nc-add').onclick = async () => {
    const name = $('#nc-name').value.trim(); if (!name) return;
    await api('/chores', { body: { name, room: $('#nc-room').value.trim() || 'General', per_quarter: +$('#nc-freq').value } }); go('cards');
  };
}
function freqSelect(v, id = '') {
  const opts = PRESETS.some(([n]) => n === v) ? PRESETS : [...PRESETS, [v, `${v}× / quarter`]];
  return `<select ${id ? `id="${id}"` : 'data-chore="freq"'}>${opts.map(([n, l]) => `<option value="${n}" ${n === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
const choreRow = (c) => `<div class="chore" data-id="${c.id}"><input data-chore="name" value="${esc(c.name)}"><div class="row"><input data-chore="room" value="${esc(c.room)}">${freqSelect(c.per_quarter)}<button class="link danger" data-rm="${c.id}">✕</button></div></div>`;
async function saveChore(el, chores) {
  const id = +el.dataset.id; const c = chores.find((x) => x.id === id);
  await api('/chores', { body: { id, name: $('[data-chore=name]', el).value, room: $('[data-chore=room]', el).value, per_quarter: +$('select', el).value, active: c.active } });
  toast('Saved');
}

function generate(chores, weak) {
  const boostRooms = $('#boost')?.checked ? weak.map((r) => r.room) : [];
  preview = buildQuarter(chores, $('#start').value, { boostRooms });
  const counts = preview.cards.map((c) => c.items.length);
  $('#preview').innerHTML = `${preview.warnings.map((w) => `<p class="warn">⚠ ${esc(w)}</p>`).join('')}
    <div class="chart-title">Tasks per card (13 weeks × Mon–Tue / Wed–Thu / Fri–Sat)</div>
    <div class="strip">${counts.map((n) => `<i style="height:${(n / 6) * 100}%" title="${n}"></i>`).join('')}</div>
    <div class="chart-title">Placements by room</div>${hbars(Object.entries(preview.roomCoverage).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), 'var(--home)')}
    ${preview.boosted.length ? `<p class="sub">Extra attention this round: ${preview.boosted.map(esc).join(', ')}.</p>` : ''}
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

// ------------------------------------------------------------------ more: settings, history, merges, backup
async function renderMore() {
  const [sugs, cats, settings, recent] = await Promise.all([api('/merge-suggestions'), api('/categories'), api('/settings'), api(`/entries?from=${ymd(addDays(new Date(), -14))}`)]);
  const opt = (c) => `<option value="${c.id}">${c.goal} · ${esc(c.name)} (${c.uses})</option>`;
  const origin = location.origin;
  view.innerHTML = `<h1>More</h1>
    <section class="panel"><h2>Settings</h2>
      <div class="row"><span class="grow">Fitness target: active days per week</span><select id="target" style="width:80px">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === settings.fitness_weekly_target ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <p class="sub">Only used for the "X of Y · Z left" bar. Nothing is lost for missing it.</p></section>

    <section class="panel"><h2>Possible duplicates</h2>${sugs.length ? sugs.map((s) => `<div class="sug"><b>${esc(s.a_name)}</b> and <b>${esc(s.b_name)}</b> — same thing? <span class="sub">(${Math.round(s.confidence * 100)}% sure)</span>
      <div class="row" style="margin-top:8px"><button class="primary" data-keep="${s.b_id}" data-drop="${s.a_id}">Merge into “${esc(s.b_name)}”</button><button class="sec" data-keep="${s.a_id}" data-drop="${s.b_id}">…into “${esc(s.a_name)}”</button><button class="link" data-dismiss="${s.id}">Different</button></div></div>`).join('') : '<div class="empty">Nothing to review. Wording that’s clearly the same is merged automatically.</div>'}</section>

    <section class="panel"><h2>Shortcuts & reminders</h2>
      <p class="sub">Siri “Log habit”: Dictate Text → Get Contents of URL (POST) <code>${origin}/api/log?plain=1</code>, JSON <code>text</code>. “Snap checklist”: Take Photo → Base64 Encode → POST <code>${origin}/api/photo?plain=1</code> with JSON <code>image</code>.</p>
      <p class="sub">Optional reminder: a Shortcuts automation at your time that GETs <code>${origin}/api/today?plain=1</code> and shows a notification only if the result isn’t empty. It’s empty when nothing is open. Full steps in the README.</p></section>

    <section class="panel"><h2>Last 2 weeks</h2>${recent.length ? recent.map(entryRow).join('') : '<div class="empty">No entries yet.</div>'}</section>

    <section class="panel"><h2>Merge categories yourself</h2><div class="row wrap"><select id="m-drop" class="grow">${cats.map(opt).join('')}</select><span>→</span><select id="m-keep" class="grow">${cats.map(opt).join('')}</select></div><p></p><button class="sec" id="m-go">Merge</button></section>
    <section class="panel"><h2>Your data</h2><p class="sub">Everything lives in your own database and is backed up nightly. You can also download a full copy any time.</p>
      <div class="row"><button class="sec" id="export">Download backup (JSON)</button><button class="sec" id="signout">Sign out</button></div></section>`;
  $('#target').onchange = async (e) => { await api('/settings', { body: { fitness_weekly_target: +e.target.value } }); toast('Saved'); };
  const merge = async (keep, drop) => { await api('/merge', { body: { keep_id: keep, drop_id: drop } }); toast('Merged'); refreshBadge(); go('more'); };
  view.querySelectorAll('[data-keep]').forEach((b) => (b.onclick = () => merge(+b.dataset.keep, +b.dataset.drop)));
  view.querySelectorAll('[data-dismiss]').forEach((b) => (b.onclick = async () => { await api(`/merge-suggestions/${b.dataset.dismiss}/dismiss`, { body: {} }); refreshBadge(); go('more'); }));
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this entry? Its XP is removed too.')) { await api('/entries/' + b.dataset.del, { method: 'DELETE' }); go('more'); } }));
  $('#m-go').onclick = () => { const d = $('#m-drop').value, k = $('#m-keep').value; if (d !== k && confirm('Merge these? This cannot be undone.')) merge(+k, +d).catch((e) => toast(e.message)); };
  $('#export').onclick = async () => {
    const blob = new Blob([JSON.stringify(await api('/export'), null, 2)], { type: 'application/json' });
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `life-tracker-${ymd(new Date())}.json` }).click();
  };
  $('#signout').onclick = () => { store.set('token', ''); location.reload(); };
}
function entryRow(e) {
  const d = JSON.parse(e.details || '{}'); delete d.card;
  const bits = Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
  return `<div class="entry"><div><span class="tag ${e.goal}">${e.goal}</span> <b>${esc(e.activity)}</b><div class="sub">${parse(e.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}${bits ? ' · ' + esc(bits) : ''}</div></div><button class="link danger" data-del="${e.id}" aria-label="Delete">✕</button></div>`;
}

// ------------------------------------------------------------------ boot
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
if (!store.get('token', '')) showLogin();
else {
  initQuickAdd();
  flushQueue().finally(() => { go(location.hash.slice(1) || 'today'); refreshBadge(); });
}
