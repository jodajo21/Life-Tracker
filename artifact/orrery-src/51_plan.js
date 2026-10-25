// ================================================================ PLAN: 1 rooms & tasks → 2 deal and review the deck → 3 print and start the cycle
let PV = null;                                                                   // the element the Plan sub-pages draw into
function setupState() {
  const tasks = expandTasks(), total = tasks.reduce((a, c) => a + Math.min(c.per_quarter, 39), 0), deck = currentDeck(), cycle = latestSet();
  const reviewed = deck ? deck.cards.filter((c) => c.reviewed).length : 0, allReviewed = !!deck && reviewed === deck.cards.length;
  const printed = !!deck && S.settings.printed_deck === deck.id, ticked = S.entries.some((e) => e.source === 'card' && !e.demo) || (cycle && cycle.cards.some((c) => c.items.some((i) => i.done)));
  const hasTasks = tasks.length > 0 && total >= 117;
  const next = !hasTasks ? 'rooms' : !deck ? 'deck' : !allReviewed ? 'review' : !printed && !cycle ? 'print' : !cycle ? 'cycle' : !ticked ? 'tick' : 'done';
  const begins = cycle && cycle.start_date > today() ? cycle.start_date : null;
  return { tasks, total, deck, cycle, reviewed, allReviewed, printed, ticked, hasTasks, begins, next };
}
function stepperHtml(st) {
  const sub = ui.sub, step = (k, n, label, done, note) => `<button class="step ${sub === k ? 'on' : ''} ${done ? 'done' : ''}" data-sub="${k}" aria-current="${sub === k}"><i>${done ? icon('check') : n}</i><span><b>${label}</b><small>${esc(note)}</small></span></button>`;
  return `<nav class="steps" aria-label="Plan steps">${step('rooms', 1, 'Rooms & tasks', st.hasTasks, st.tasks.length ? `${st.tasks.length} tasks · ${st.total} placements` : 'Start here')}${step('deck', 2, 'Deck', st.allReviewed, st.deck ? `${st.reviewed}/${st.deck.cards.length} reviewed` : 'Not dealt yet')}${step('print', 3, 'Print & start', !!st.cycle, st.cycle ? `Cycle ${st.cycle.n} running` : st.printed ? 'Printed · start it' : 'Not printed yet')}</nav>`;
}
function renderPlan() {
  const st = setupState(); if (!['rooms', 'deck', 'print'].includes(ui.sub)) ui.sub = 'rooms';
  view.innerHTML = `<h1>Plan</h1><div id="planchrome"></div><div id="planBody"></div>`; PV = $('#planBody'); drawPlanChrome();
  ({ rooms: renderPlanRooms, deck: renderPlanDeck, print: renderPlanPrint }[ui.sub])();
}
function nextBanner(st) {
  const n = st.next, rem = st.deck ? st.deck.cards.filter((c) => !c.reviewed).length : 0;
  const T = { deck: ['Your tasks fit the cards.', 'Next: deal your deck', 'deck'], review: [`${rem} card${rem === 1 ? '' : 's'} left to review.`, 'Review the cards', 'review'], print: ['Every card is reviewed.', 'Next: print them', 'print'], cycle: ['Printed.', 'Start your cycle', 'cycle'] }[n];
  if (!T || (n === 'deck' && ui.sub === 'deck') || (n === 'review' && ui.sub === 'deck') || (['print', 'cycle'].includes(n) && ui.sub === 'print')) return '';
  return `<div class="nextbar"><span>${T[0]}</span><button class="primary sm" id="nb-go" data-to="${T[2]}">${T[1]} ${icon('right')}</button></div>`;
}
function drawPlanChrome() {
  const host = $('#planchrome'); if (!host) return; const st = setupState(); host.innerHTML = stepperHtml(st) + nextBanner(st);
  $('#nb-go')?.addEventListener('click', (e) => { const k = e.currentTarget.dataset.to; if (k === 'review') ui.show = 'review'; goPlan(k === 'review' ? 'deck' : k === 'cycle' ? 'print' : k); });
  host.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { ui.sub = b.dataset.sub; store.set('plansub', ui.sub); go('plan'); }));
}
const goPlan = (sub) => { ui.sub = sub; store.set('plansub', sub); go('plan'); };

// ---------------------------------------------------------------- quick start: pick your spaces, get a sensible starter plan
const QS_TYPES = [['Kitchen', 'Kitchen'], ['Bathroom', 'Bathroom'], ['Bedroom', 'Bedroom'], ['Living', 'Living room'], ['Entry', 'Entry'], ['Laundry', 'Laundry'], ['Garage', 'Garage'], ['Office', 'Office'], ['Outdoor', 'Outdoor']];
const QS_MULTI = new Set(['Bathroom', 'Bedroom']);
ui.qs = { types: { Kitchen: 1, Bathroom: 1, Bedroom: 1, Living: 1, Laundry: 1 }, cats: { plants: true } }; ui.qsOpen = false;
function quickStartHtml() {
  const first = !activeRooms().length && !activeCats().length;
  if (!first && !ui.qsOpen) return '';
  const q = ui.qs;
  return `<section class="panel home" id="qs"><h2>${first ? 'Tell me about your home' : 'Add several rooms at once'}</h2><p class="sub" style="margin-top:0">Pick the spaces you have. I'll add each one with a few sensible starter tasks, sized so your cards stay at 3 to 5 tasks. You can change every task afterward.</p>
    <div class="qsgrid">${QS_TYPES.map(([t, label]) => { const n = q.types[t] || 0; return `<div class="qsc ${n ? 'on' : ''}" data-qt="${t}"><button class="qsb" aria-pressed="${!!n}">${esc(label)}</button>${QS_MULTI.has(t) && n ? `<span class="qsn"><button data-qd="${t}" aria-label="Fewer ${esc(label)}s">−</button><b>${n}</b><button data-qu="${t}" aria-label="More ${esc(label)}s">＋</button></span>` : ''}</div>`; }).join('')}</div>
    <div class="chart-title">Things that are not places</div><div class="qsgrid">${[['plants', 'Plants'], ['pets', 'Pets'], ['car', 'Car']].map(([k, l]) => `<div class="qsc ${q.cats[k] ? 'on' : ''}" data-qc="${k}"><button class="qsb" aria-pressed="${!!q.cats[k]}">${l}</button></div>`).join('')}</div>
    <div class="row wrap" style="margin-top:14px"><button class="primary" id="qs-go">Build my plan</button>${first ? '' : '<button class="link" id="qs-x">Cancel</button>'}<span class="sub" id="qs-note"></span></div></section>`;
}
function bindQuickStart() {
  const root = $('#qs'); if (!root) return; const q = ui.qs, redraw = () => { const y = scrollY; PV.innerHTML = ''; renderPlanRooms(); scrollTo(0, y); };
  root.querySelectorAll('[data-qt] .qsb').forEach((b) => (b.onclick = () => { const t = b.closest('[data-qt]').dataset.qt; q.types[t] = q.types[t] ? 0 : 1; redraw(); }));
  root.querySelectorAll('[data-qc] .qsb').forEach((b) => (b.onclick = () => { const k = b.closest('[data-qc]').dataset.qc; q.cats[k] = !q.cats[k]; redraw(); }));
  root.querySelectorAll('[data-qu]').forEach((b) => (b.onclick = () => { q.types[b.dataset.qu] = Math.min(6, q.types[b.dataset.qu] + 1); redraw(); }));
  root.querySelectorAll('[data-qd]').forEach((b) => (b.onclick = () => { q.types[b.dataset.qd] = Math.max(1, q.types[b.dataset.qd] - 1); redraw(); }));
  $('#qs-x')?.addEventListener('click', () => { ui.qsOpen = false; redraw(); });
  $('#qs-go').onclick = async () => { const b = $('#qs-go'); b.disabled = true; $('#qs-note').textContent = 'Setting up…'; try { const r = await buildFromQuickStart(); toast(`Added ${r.rooms} spaces and ${r.tasks} tasks (${r.total} placements).`); ui.qsOpen = false; go('plan'); } catch (e) { toast(e.message); b.disabled = false; } };
}
async function buildFromQuickStart() {
  const q = ui.qs, plan = [], names = new Set(S.rooms.filter((r) => r.active !== false).map((r) => r.name.toLowerCase())); let order = S.rooms.length;
  for (const [type, label] of QS_TYPES) {
    const n = q.types[type] || 0; if (!n) continue; const rooms = [];
    for (let k = 1; k <= n; k++) { const name = k === 1 ? label : `${label} ${k}`; if (names.has(name.toLowerCase())) continue; names.add(name.toLowerCase()); rooms.push({ ref: col('rooms').doc(), doc: { name, type, active: true, order: order++ } }); }
    if (rooms.length) plan.push({ rooms, tasks: (CATALOG[type] || []).slice(0, 4).map(([name, f]) => ({ name, f })) });
  }
  const cats = Object.keys(q.cats).filter((k) => q.cats[k] && !S.taskcats.some((c) => c.active !== false && c.name.toLowerCase() === k)).map((k) => ({ ref: col('taskcats').doc(), doc: { name: k[0].toUpperCase() + k.slice(1), active: true }, tasks: (CAT_CATALOG[k] || []).slice(0, 2).map(([name, f]) => ({ name, f })) }));
  if (!plan.length && !cats.length) throw new Error('Pick at least one space that is not already added.');
  const all = [...plan.map((p) => ({ count: p.rooms.length, tasks: p.tasks })), ...cats.map((c) => ({ count: 1, tasks: c.tasks }))], tot = () => all.reduce((a, g) => a + g.tasks.reduce((b, t) => b + Math.min(t.f, 39), 0) * g.count, 0), have = setupState().total;
  for (let guard = 0; have + tot() > 188 && guard < 80; guard++) {                        // keep every card at 5 or fewer: lower the heaviest tasks first, then drop the last ones
    const heavy = all.flatMap((g) => g.tasks.map((t) => ({ g, t, w: Math.min(t.f, 39) * g.count }))).filter((x) => LOWER[x.t.f] && x.t.f < 39).sort((a, b) => b.w - a.w)[0];
    if (heavy) heavy.t.f = LOWER[heavy.t.f]; else { const g = all.filter((x) => x.tasks.length > 1).sort((a, b) => b.tasks.length - a.tasks.length)[0]; if (!g) break; g.tasks.pop(); }
  }
  const writes = [], addChore = (doc) => { const ref = col('chores').doc(); S.chores = [...S.chores, { id: ref.id, ...doc }]; writes.push(() => queue(() => ref.set(doc))); writes.push(() => ensureCategory('home', doc.name)); return doc; };
  let nTasks = 0; const total0 = have;
  for (const p of plan) { for (const r of p.rooms) { S.rooms = [...S.rooms, { id: r.ref.id, ...r.doc }]; writes.push(() => queue(() => r.ref.set(r.doc))); } const ids = p.rooms.map((r) => r.ref.id); for (const t of p.tasks) { addChore({ name: t.name, scope: 'room', roomIds: ids, catId: '', per_quarter: t.f, area: '', parts: 0, active: true }); nTasks++; } }
  for (const c of cats) { S.taskcats = [...S.taskcats, { id: c.ref.id, ...c.doc }]; writes.push(() => queue(() => c.ref.set(c.doc))); for (const t of c.tasks) { addChore({ name: t.name, scope: 'category', catId: c.ref.id, roomIds: [], per_quarter: t.f, area: '', parts: 0, active: true }); nTasks++; } }
  const first = plan[0]?.rooms[0]?.ref.id; if (first) store.set('space', 'room:' + first);
  await pool(writes, 4);
  return { rooms: plan.reduce((a, p) => a + p.rooms.length, 0) + cats.length, tasks: nTasks, total: setupState().total - 0 };
}

// ---------------------------------------------------------------- step 2: deal and review the deck
function dealControls(tasks, rs, deckExists) {
  const wseg = weakestSeg(), lightSeg = wseg ?? 2, total = tasks.reduce((a, c) => a + Math.min(c.per_quarter, 39), 0);
  return `<p class="sub" style="margin-top:0">Builds 39 undated cards (13 weeks × Mon–Tue / Wed–Thu / Fri–Sat) from your ${tasks.length} tasks (${total} placements). You review and edit every card before anything is printed.</p>
    <label class="row" style="margin:6px 0;min-height:44px"><input type="checkbox" id="light" ${wseg != null ? 'checked' : ''} style="width:22px;height:22px;min-height:0;flex:none"><span class="sub">Keep ${SEGNAME[lightSeg]} cards lighter (4 tasks when there is room)${wseg != null ? `. Those are the cards you finish least.` : ''}</span></label>
    ${rs.length ? `<label class="row" style="margin:6px 0;min-height:44px"><input type="checkbox" id="boost" checked style="width:22px;height:22px;min-height:0;flex:none"><span class="sub">Give extra attention to rooms under 60% last cycle: <b>${rs.map((r) => `${esc(r.room)} (${Math.round(r.coverage * 100)}%)`).join(', ')}</b></span></label>` : ''}
    <div class="row wrap"><button class="primary" id="deal" ${tasks.length ? '' : 'disabled'}>${deckExists ? 'Deal a new deck' : 'Deal my deck'}</button><button class="sec" id="gen" ${tasks.length ? '' : 'disabled'}>Preview first</button></div>${tasks.length ? '' : '<p class="sub">Add rooms and tasks first.</p>'}<div id="preview"></div>`;
}
function buildPreview(active, weak) {
  const boostRooms = $('#boost')?.checked ? weak.map((r) => r.room) : [], wseg = weakestSeg() ?? 2, soft = [5, 5, 5]; if ($('#light')?.checked) soft[wseg] = 4;
  return buildQuarter(active.map((c) => ({ id: c.id, name: c.name, room: c.room, per_quarter: c.per_quarter })), today(), { boostRooms, softBySeg: $('#light')?.checked ? soft : undefined });
}
async function createDeck(pv) {
  let n = Math.max(0, ...S.decks.map((d) => d.n)) + 1; while (S.decks.some((d) => d.id === `d${n}`) || S.sets.some((x) => x.deck === `d${n}`)) n++;
  const id = `d${n}`, deck = { n, created: new Date().toISOString(), cards: pv.cards.map((c) => ({ idx: c.idx, code: `C${pad(c.idx + 1)}`, label: c.label, reviewed: false, items: c.items.map((it) => ({ id: uid(), chore_id: it.chore_id || null, name: it.name, room: it.room })) })) };
  S.decks = [...S.decks, { id, ...deck }]; store.set('deck', id); ui.week = 'all'; ui.show = 'all'; await queue(() => col('decks').doc(id).set(deck)); return n;
}
function renderPlanDeck() {
  const tasks = expandTasks(), deck = currentDeck(), rs = roomStats(today()).filter((r) => r.planned >= 3 && r.coverage < 0.6);
  PV.innerHTML = `${deckNotesPanel()}${deck ? '' : `<section class="panel home"><h2>Deal your first deck</h2>${dealControls(tasks, rs, false)}</section>`}${deck ? editorHtml(deck) : ''}
    ${deck ? `<details class="panel" id="dealmore"><summary><h2 style="margin:0">Deal a new deck</h2></summary><div style="margin-top:10px">${dealControls(tasks, rs, true)}</div></details>` : ''}
    <datalist id="tasklib">${tasks.map((x) => `<option value="${esc(x.name)} · ${esc(x.room)}">`).join('')}</datalist><datalist id="rooms">${[...new Set(tasks.map((x) => x.room))].map((r) => `<option value="${esc(r)}">`).join('')}</datalist>`;
  const deal = async () => { const b = $('#deal'); b.disabled = true; try { const pv = buildPreview(tasks, rs); const n = await createDeck(pv); toast(`Deck ${n} dealt. Look through the cards, edit anything, then tick Reviewed.`); go('plan', { keep: false }); setTimeout(() => $('#editor')?.scrollIntoView({ behavior: 'smooth' }), 80); } catch (e) { toast(e.message); b.disabled = false; } };
  $('#deal')?.addEventListener('click', deal);
  $('#gen')?.addEventListener('click', () => { const pv = buildPreview(tasks, rs); preview = pv;
    $('#preview').innerHTML = `${pv.warnings.map((w) => `<p class="warn">⚠ ${esc(w)}</p>`).join('')}<div class="chart-title">Tasks per card (39 cards)</div><div class="strip">${pv.cards.map((c) => `<i style="height:${(c.items.length / 6) * 100}%" title="${c.items.length}"></i>`).join('')}</div>
      <div class="chart-title">Placements by room</div>${hbars(Object.entries(pv.roomCoverage).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), 'var(--amber)')}
      ${pv.sixes ? `<p class="sub"><b>${pv.sixes} card${pv.sixes === 1 ? ' has' : 's have'} 6 tasks.</b> Your list adds up to ${pv.total} placements and 5 per card fits ${pv.softMax * 39}. Remove or lower about ${pv.overBy} placements on the Rooms step, or fix it by hand afterward.</p>` : '<p class="sub">Every card has 3 to 5 tasks.</p>'}
      <div class="row"><button class="primary" id="make-deck">Create this deck</button></div>`;
    $('#make-deck').onclick = deal; });
  bindDeckNotes(); if (deck) bindEditor(deck);
}

// ---------------------------------------------------------------- step 3: print and start
const pageCount = (deck) => Math.ceil(deck.cards.length / 2);
function startOptions(sets) {
  const t = today(), dow = parse(t).getDay(), thisMon = ymd(monday(parse(t))), nextMon = addDaysIso(thisMon, 7), fmt = (iso) => parse(iso).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
  if (sets.length) { const after = nextMonday(addDaysIso(sets[0].cards[sets[0].cards.length - 1].end_date, 1)); return `<option value="${after}">Right after cycle ${sets[0].n}, from ${fmt(after)}</option>`; }
  return (dow >= 1 && dow <= 6 ? `<option value="${thisMon}">This week, from ${fmt(thisMon)}</option>` : '') + `<option value="${nextMon}">Next week, from ${fmt(nextMon)}</option>`;
}
function sheetPreview(deck, i) {
  const cs = deck.cards.slice().sort((a, b) => a.idx - b.idx), a = cs[2 * i], b = cs[2 * i + 1], weeks = Math.ceil(deck.cards.length / 3);
  const card = (c) => (c ? `<div class="pvc"><div class="pvc-clamp">clamp space</div><div class="pvc-h"><b>${esc(c.label.replace('–', ' · ').toUpperCase())}</b><span>${cardNo(deck, c)}</span></div><div class="pvc-w">Week ${weekOf(c)} of ${weeks}</div>${c.items.map((it) => `<div class="pvc-i"><i></i><span>${esc(it.name)}<small>${esc(it.room || '')}</small></span></div>`).join('')}</div>` : '<div class="pvc ghost"></div>');
  return `<div class="pvsheet" role="img" aria-label="Sheet ${i + 1} of ${pageCount(deck)}: card ${a ? pad(a.idx + 1) : ''} and card ${b ? pad(b.idx + 1) : ''}, side by side, with a blank strip across the top of each">${card(a)}${card(b)}</div>`;
}
function cardsPdf(deck, size, { test = false } = {}) {
  const J = window.jspdf && window.jspdf.jsPDF; if (!J) return null;
  const doc = new J({ orientation: 'landscape', unit: 'pt', format: 'letter' });          // 11 × 8.5 in
  const k = size === 'half' ? 1.3125 : 1, cw = 288 * k, ch = 432 * k, left = (792 - 2 * cw) / 2, top = (612 - ch) / 2;
  const cards = deck.cards.slice().sort((a, b) => a.idx - b.idx), end = test ? Math.min(2, cards.length) : cards.length;
  for (let i = 0; i < end; i += 2) {
    if (i) doc.addPage('letter', 'landscape');
    [0, 1].forEach((j) => { if (cards[i + j]) drawCard(doc, deck, cards[i + j], left + j * cw, top, k); });
    doc.setDrawColor(170).setLineWidth(0.5).setLineDashPattern([4, 3], 0);                 // dashed cut guides at each card's edge
    [0, 1].forEach((j) => { if (cards[i + j]) doc.rect(left + j * cw, top, cw, ch); });
    doc.setLineDashPattern([], 0);
  }
  return doc.output('blob');
}
async function saveCardsFile(deck, { test = false } = {}) {
  if (!downloads) { toast('Saving files isn’t available in this view.'); return false; }
  const pdf = cardsPdf(deck, store.get('cardsize', 'index'), { test });
  if (!pdf) { toast('The PDF tool didn’t load. Reload the page and try again.'); return false; }
  try { await downloads.save({ filename: `orrery-cards-deck-${deck.n}${test ? '-test-sheet' : ''}.pdf`, data: pdf }); } catch (e) { if (e.code !== 'declined') toast(e.message || 'Could not save the file.'); return false; }
  if (!test) { S.settings = { ...S.settings, printed_deck: deck.id, printed_at: today() }; await queue(() => db.doc('settings/main').set(S.settings)); }
  return true;
}
function renderPlanPrint() {
  const deck = currentDeck(), sets = S.sets.slice().sort((a, b) => b.n - a.n), st = setupState();
  if (!deck) { PV.innerHTML = `<section class="panel"><h2>Print & start</h2><div class="empty">Deal and review a deck first.<div style="margin-top:12px"><button class="primary" id="go-deck">Go to the deck</button></div></div></section>`; $('#go-deck').onclick = () => goPlan(st.hasTasks ? 'deck' : 'rooms'); return; }
  const rem = deck.cards.filter((c) => !c.reviewed).length, off = deck.cards.filter(offTarget).length, pages = pageCount(deck), size = store.get('cardsize', 'index');
  ui.sheet = clamp(ui.sheet || 0, 0, pages - 1);
  const row = (ok, text, action) => `<div class="ready ${ok ? 'ok' : 'no'}"><i>${ok ? icon('check') : '!'}</i><span>${text}</span>${action || ''}</div>`;
  PV.innerHTML = `<section class="panel home"><h2>Print your cards</h2>
      ${row(true, `${deck.cards.length} cards dealt (deck ${deck.n})`)}${row(rem === 0, rem ? `${rem} card${rem === 1 ? '' : 's'} not reviewed yet` : 'Every card reviewed', rem ? '<button class="sec sm" id="go-review">Review them</button>' : '')}${off ? row(true, `${off} card${off === 1 ? ' is' : 's are'} not at 3 to 5 tasks. That is fine if it is on purpose.`) : ''}
      <div class="chart-title">What prints: 2 cards per letter sheet, landscape</div>
      <div class="row" style="justify-content:space-between;margin-bottom:8px"><button class="sec sm" id="sh-prev" ${ui.sheet === 0 ? 'disabled' : ''} aria-label="Previous sheet">${icon('left')}</button><b>Sheet ${ui.sheet + 1} of ${pages}</b><button class="sec sm" id="sh-next" ${ui.sheet >= pages - 1 ? 'disabled' : ''} aria-label="Next sheet">${icon('right')}</button></div>
      <div id="sheetpv">${sheetPreview(deck, ui.sheet)}</div><p class="sub" style="margin:8px 0 0">The blank strip at the top of each card is for a clip or clamp. Dashed lines are cut guides.</p>
      <div class="row wrap" style="margin-top:14px"><select id="pdf-size" aria-label="Paper layout" style="flex:1 1 220px;width:auto"><option value="index" ${size === 'index' ? 'selected' : ''}>4 × 6 in cards · 2 per letter sheet</option><option value="half" ${size === 'half' ? 'selected' : ''}>5.5 × 8.5 in cards · 2 per letter sheet</option></select></div>
      <div class="row wrap" style="margin-top:12px"><button class="primary" id="pdf-all" ${rem ? 'disabled' : ''}>${icon('print')} Make the PDF · ${pages} sheets</button><button class="sec" id="pdf-test" ${rem ? 'disabled' : ''}>Test sheet only</button></div>
      <p class="sub" style="margin:8px 0 0">${rem ? 'The PDF unlocks once every card is reviewed.' : st.printed ? `You saved this deck on ${esc(S.settings.printed_at || '')}. Print at 100% scale, landscape, US Letter, then cut along the dashed lines.` : 'Print the test sheet first to check your printer’s scaling, then the whole deck. Use 100% scale, landscape, US Letter.'}</p></section>
    <section class="panel"><h2>Start a cycle</h2>${sets.length ? '' : '<p class="sub" style="margin-top:0">Printed cards carry no dates, only their place in the cycle (like 07 / 39), so the same deck runs again and again. Starting a cycle puts dates on it and opens card 01.</p>'}
      ${S.decks.length ? `<div class="row wrap"><select id="cyc-deck" style="flex:1 1 140px;width:auto" aria-label="Deck">${S.decks.slice().sort((a, b) => b.n - a.n).map((d) => `<option value="${d.id}" ${d.id === deck.id ? 'selected' : ''}>Deck ${d.n}</option>`).join('')}</select><select id="cyc-start" aria-label="When to start" style="flex:2 1 220px;width:auto">${startOptions(sets)}</select><button class="primary" id="cyc-go">Start cycle</button></div>
      <p class="sub">${sets.length ? '' : 'Starting this week keeps all three of this week’s cards open, so you can tick what you have already done. '}Edits to a deck flow into its newest cycle and keep your check-offs.</p>` : ''}
      <div class="chart-title">Cycles</div>${sets.length ? sets.map((x) => { const done = cycleDone(x); return `<div class="entry"><div><div>${x.demo ? 'Sample cycle ' + x.n : 'Cycle ' + x.n} · starts ${x.start_date}${x.demo ? '' : ' · deck ' + esc(String(x.deck || '').replace('d', ''))}${x.n === sets[0].n && !x.demo ? ' <span class="tag home">current</span>' : ''}</div><div class="sub">${done} tasks checked off</div></div>
        <div class="row" style="gap:0"><button class="link" data-cyc-reset="${x.id}">Reset</button><button class="link danger" data-cyc-del="${x.id}">Delete</button></div></div>`; }).join('') + `<p class="sub" style="margin:8px 0 0"><b>Reset</b> un-checks everything in a cycle and keeps its dates. <b>Delete</b> removes the cycle. Both also remove the check-offs they cover and their XP, and you get an Undo.</p>` : '<div class="empty">No cycle running yet.</div>'}</section>`;
  $('#go-review')?.addEventListener('click', () => { ui.show = 'review'; goPlan('deck'); });
  $('#sh-prev').onclick = () => { ui.sheet--; renderPlanPrint(); }; $('#sh-next').onclick = () => { ui.sheet++; renderPlanPrint(); };
  $('#pdf-size').onchange = (e) => store.set('cardsize', e.target.value);
  const make = (test) => async () => { const ok = await saveCardsFile(deck, { test }); if (ok) { toast(test ? 'Saved the test sheet. Print it at 100% scale.' : 'Saved. Print at 100% scale, landscape, US Letter.'); go('plan', { keep: true }); } };
  $('#pdf-all').onclick = make(false); $('#pdf-test').onclick = make(true);
  $('#cyc-go')?.addEventListener('click', () => { const d = S.decks.find((x) => x.id === $('#cyc-deck').value); if (d) startCycle(d, $('#cyc-start').value).then(() => { go('today'); }).catch((e) => toast(e.message)); });
  PV.querySelectorAll('[data-cyc-reset]').forEach((b) => (b.onclick = () => { const x = S.sets.find((y) => y.id === b.dataset.cycReset), n = cycleDone(x); confirmDialog(`Reset ${x.demo ? 'this sample cycle' : 'cycle ' + x.n}? This un-checks ${n} task${n === 1 ? '' : 's'} and removes those check-offs and their XP. The dates stay.`, async () => { const bk = await wipeCycle(x, false); toastAction('Cycle reset.', 'Undo', () => restoreCycle(bk).then(() => go('plan', { keep: true }))); go('plan', { keep: true }); }); }));
  PV.querySelectorAll('[data-cyc-del]').forEach((b) => (b.onclick = () => { const x = S.sets.find((y) => y.id === b.dataset.cycDel), n = cycleDone(x); confirmDialog(`Delete ${x.demo ? 'this sample cycle' : 'cycle ' + x.n}? This removes the cycle and its ${n} check-off${n === 1 ? '' : 's'} with their XP. Your decks and other cycles stay.`, async () => { const bk = await wipeCycle(x, true); toastAction('Cycle deleted.', 'Undo', () => restoreCycle(bk).then(() => go('plan', { keep: true }))); go('plan', { keep: true }); }, { danger: true, yes: 'Delete' }); }));
}
