// ================================================================ Ask (conversational, with tools + charts)
function aggregate(a) {
  const from = a.from || '0000', to = a.to || '9999', t = today();
  if ((a.source || 'entries') === 'entries') {
    const es = S.entries.filter((e) => (!a.goal || e.goal === a.goal) && e.date >= from && e.date <= to);
    const key = (e) => ({ weekday: WD[(parse(e.date).getDay() + 6) % 7], week: ymd(monday(parse(e.date))), month: e.date.slice(0, 7), date: e.date, activity: e.activity }[a.group_by]);
    const m = new Map(); if (a.group_by === 'weekday') WD.forEach((d) => m.set(d, 0));
    for (const e of es) { const k = key(e); if (k == null) continue; m.set(k, (m.get(k) || 0) + (a.metric === 'xp' ? e.xp || 0 : 1)); }
    let rows = [...m].map(([label, value]) => ({ label, value }));
    if (a.group_by === 'activity') rows = rows.sort((x, y) => y.value - x.value).slice(0, 15); else if (a.group_by !== 'weekday') rows.sort((x, y) => (x.label < y.label ? -1 : 1));
    return rows;
  }
  const m = new Map();
  for (const set of S.sets) for (const c of set.cards) {
    if (c.start_date > t || c.start_date < from || c.start_date > to) continue;
    const past = c.end_date < t;
    for (const i of c.items) {
      const k = { room: i.room || 'General', weekday: c.label, week: ymd(monday(parse(c.start_date))), month: c.start_date.slice(0, 7) }[a.group_by || 'room']; if (k == null) continue;
      const r = m.get(k) || { planned: 0, done: 0, ppast: 0, dpast: 0 }; r.planned++; if (i.done) r.done++; if (past) { r.ppast++; if (i.done) r.dpast++; } m.set(k, r);
    }
  }
  const metric = a.metric || 'done_pct';
  const rows = [...m].map(([label, r]) => ({ label, value: metric === 'planned' ? r.planned : metric === 'done' ? r.done : metric === 'missed' ? r.ppast - r.dpast : r.ppast ? Math.round((100 * r.dpast) / r.ppast) : 0 }));
  if (a.group_by === 'weekday') rows.sort((x, y) => ['Mon–Tue', 'Wed–Thu', 'Fri–Sat'].indexOf(x.label) - ['Mon–Tue', 'Wed–Thu', 'Fri–Sat'].indexOf(y.label)); else if (a.group_by !== 'room') rows.sort((x, y) => (x.label < y.label ? -1 : 1));
  return rows;
}
const AGG_PROPS = {
  source: { type: 'string', enum: ['entries', 'cards'], description: 'entries = logged workouts/chores; cards = printed card checkboxes (planned vs done).' },
  goal: { type: 'string', enum: GOALS, description: 'Only for source=entries.' },
  group_by: { type: 'string', enum: ['weekday', 'week', 'month', 'date', 'activity', 'room'], description: 'room only for cards; activity/date only for entries. For cards, weekday = which 2-day card (Mon–Tue, Wed–Thu, Fri–Sat).' },
  metric: { type: 'string', enum: ['count', 'xp', 'planned', 'done', 'missed', 'done_pct'], description: 'entries: count|xp. cards: planned|done|missed|done_pct (missed and done_pct only count cards whose days are over).' },
  from: { type: 'string', description: 'YYYY-MM-DD inclusive.' }, to: { type: 'string', description: 'YYYY-MM-DD inclusive.' },
};
function drawChart(c) {
  const color = COLORS[c.goal] || COLORS.home, rows = c.rows || []; let body;
  if (!rows.length) body = '<div class="empty">No data for that.</div>';
  else if (c.kind === 'heatmap') { const counts = Object.fromEntries(rows.map((r) => [r.label, r.value])), ds = Object.keys(counts).sort(); body = heatmap(counts, ds[0], ds[ds.length - 1], color); }
  else if (c.kind === 'hbars') body = hbars(rows, color); else body = bars(rows, color, { showEvery: Math.ceil(rows.length / 12) });
  return `<div class="panel" style="padding:12px"><div class="chart-title" style="margin-top:0">${esc(c.title)}</div>${body}</div>`;
}
function chatInstructions() {
  const t = today(), es = S.entries;
  const first = es.map((e) => e.date).sort()[0] || 'none';
  return `You are the answer engine inside the user's personal habit app. They discover their own patterns by asking you questions; you are not a coach or a nag.
Today is ${t} (${parse(t).toLocaleDateString('en-US', { weekday: 'long' })}). Printed cards run Mon-Sat; Sunday is a rest day. Domains: fitness and home.
Data: ${es.length} logged entries since ${first}; ${S.sets.length} card sets; ${S.notes.length} notes the user wrote on cards (use get_notes; they often explain a bad week). Use the tools to look at the data before answering: aggregate (counts/xp/planned-vs-done by weekday, week, month, activity, room), get_entries (raw rows), and show_chart (draws a chart for the user from the same arguments as aggregate; the app computes the numbers, so do not pass numbers yourself).
Already noticed by the app (you can refer to these): ${MODEL.ins.map((x) => x.title).join('; ') || 'nothing yet'}.
Current status: fitness bar "${statusBar('fitness')}"; home bar "${statusBar('home')}".
How to answer: query first and look from a couple of angles, then answer plainly with real numbers and dates. Prefer showing evidence with 1-2 charts over long prose. Be warm and brief. Say so when the sample is small. Never invent data.
Rules: do not lecture, do not moralize about misses, do not suggest a weekly review or routine, no motivational filler. Only if it flows naturally, finish with one line starting "Tiny move:" giving a single optional, concrete suggestion.`;
}
function statusBar(g) { const t = today(); if (g === 'fitness') return `${weekActiveDays(t)} of ${S.settings.fitness_weekly_target} active days this week`; const cc = currentCard(t); return cc ? `${cc.card.items.filter((i) => i.done).length} of ${cc.card.items.length} on the ${cc.card.label} card` : 'no card'; }
function renderAsk() {
  const top = MODEL.ins[0], lead = top ? ({ seg: `Why is ${SEGNAME[top.seg]} my weakest?`, holiday: 'What happens around holidays?', room: `Why does ${top.room} lag?`, skipped: 'Which tasks do I keep skipping?', trend: 'Why did my last month change?', pair: `Why do ${top.a} and ${top.b} move together?` }[top.kind]) : null;
  const hasData = S.entries.length || S.sets.some((set) => set.cards.some((c) => c.items.some((i) => i.done)));
  const ideas = [lead, 'When do I tend to slip?', 'Which rooms get the least attention?', 'What does my workout mix look like?', 'How close am I to the next level?'].filter(Boolean);
  view.innerHTML = `<h1>Ask</h1><p class="sub" style="margin:-6px 0 12px">Ask anything about your cards and workouts. I look at your real data first, then answer.</p>${sample ? '' : '<div class="notice">Claude isn’t available in this view, so chat is off.</div>'}
    ${chatHistory.length ? '' : !hasData ? `<div class="panel"><p class="sub" style="margin:0 0 10px">There’s nothing to look at yet. Ask reads what you tick and log, so it gets useful after a few days. Ask it anything now and it will say so honestly.</p>${PREVIEW ? '' : '<button class="sec" id="ask-pv">See it on sample data</button>'}</div>` : `<div class="chips">${ideas.map((i) => `<button>${esc(i)}</button>`).join('')}</div>`}<div class="chat" id="chat"></div>
    <div class="askbar"><div class="row"><input id="q" placeholder="Ask about what you see…" aria-label="Your question" ${sample ? '' : 'disabled'}><button class="primary" id="send" ${sample ? '' : 'disabled'}>Send</button><button class="sec" id="stop" hidden>Stop</button></div></div>`;
  const draw = () => { $('#chat').innerHTML = chatHistory.map((m) => `<div class="bubble ${m.role === 'user' ? 'user' : 'ai'}">${esc(m.content)}</div>${(m.charts || []).map(drawChart).join('')}`).join(''); };
  let ctl;
  const send = async (text) => {
    if (!text.trim() || chatBusy || !sample) return; chatBusy = true; chatHistory.push({ role: 'user', content: text }); draw(); $('#q').value = '';
    const charts = [], bubble = document.createElement('div'); bubble.className = 'bubble ai spinner'; bubble.textContent = 'Looking through your data…'; $('#chat').append(bubble);
    ctl = new AbortController(); $('#stop').hidden = false; $('#send').disabled = true;
    const tools = limits.tools ? [
      { name: 'aggregate', description: 'Summarize the tracker data. Returns [{label,value}] rows (max ~15-60).', inputSchema: { type: 'object', properties: AGG_PROPS, required: ['group_by'] }, execute: (a) => aggregate(a) },
      { name: 'get_entries', description: 'List raw log entries, newest first (max 80), as lines "date goal activity details".', inputSchema: { type: 'object', properties: { goal: AGG_PROPS.goal, from: AGG_PROPS.from, to: AGG_PROPS.to, activity: { type: 'string', description: 'Case-insensitive substring of the activity name.' } } },
        execute: (a) => S.entries.filter((e) => (!a.goal || e.goal === a.goal) && (!a.from || e.date >= a.from) && (!a.to || e.date <= a.to) && (!a.activity || e.activity.toLowerCase().includes(String(a.activity).toLowerCase()))).sort((x, y) => y.date.localeCompare(x.date)).slice(0, 80).map((e) => `${e.date} ${e.goal} ${e.activity} ${JSON.stringify(e.details || {})}`) },
      { name: 'get_notes', description: 'List the notes the user wrote on their cards, newest first (max 60). tag: note (context), deck (changes wanted for the next deck), idea (ideas for the app).', inputSchema: { type: 'object', properties: { tag: { type: 'string', enum: ['note', 'deck', 'idea'] }, from: AGG_PROPS.from, to: AGG_PROPS.to } },
        execute: (a) => S.notes.filter((n) => (!a.tag || n.tag === a.tag) && (!a.from || n.date >= a.from) && (!a.to || n.date <= a.to)).sort((x, y) => y.created.localeCompare(x.created)).slice(0, 60).map((n) => `${n.date} [${n.tag}${n.status === 'done' ? ', handled' : ''}]${n.card_idx != null ? ` card ${n.card_idx + 1} ${n.card_label}` : ''}${n.item_name ? ` (${n.item_name})` : ''}: ${n.text}`).join('\n') || 'No notes.' },
      { name: 'show_chart', description: 'Show a chart to the user. kind: bars (ordered), hbars (ranked), heatmap (needs group_by=date). Other args as in aggregate.', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['bars', 'hbars', 'heatmap'] }, title: { type: 'string' }, ...AGG_PROPS }, required: ['kind', 'title', 'group_by'] },
        execute: (a) => { const rows = aggregate(a); charts.push({ kind: a.kind, title: a.title, goal: a.goal || 'home', rows }); bubble.dataset.c = charts.length; return `Chart shown (${rows.length} rows).`; } },
    ] : undefined;
    const turns = [{ role: 'user', content: chatInstructions() + (tools ? '' : '\n\nRecent entries (no tools available):\n' + S.entries.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150).map((e) => `${e.date} ${e.goal} ${e.activity}`).join('\n')) }, ...chatHistory.map(({ role, content }) => ({ role, content }))];
    try {
      const r = await sample(turns, { tools, signal: ctl.signal, cache: false, onText: ({ text }) => { bubble.classList.remove('spinner'); bubble.textContent = text; } });
      chatHistory.push({ role: 'assistant', content: r.text, charts });
    } catch (e) { if (e.code === 'cancelled') chatHistory.push({ role: 'assistant', content: e.text || '(stopped)', charts }); else { chatHistory.pop(); toast(errCopy(e)); } }
    chatBusy = false; draw(); $('#stop').hidden = true; $('#send').disabled = false; $('#q').focus();
  };
  $('#send').onclick = () => send($('#q').value); $('#q').onkeydown = (e) => { if (e.key === 'Enter') send($('#q').value); }; $('#stop').onclick = () => ctl?.abort();
  $('#ask-pv')?.addEventListener('click', () => startPreview());
  view.querySelectorAll('.chips button').forEach((b) => (b.onclick = () => { send(b.textContent); b.parentElement.remove(); })); draw();
}
