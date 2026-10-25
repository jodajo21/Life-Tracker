// ================================================================ Cards: decks (undated, editable) and cycles (dated runs of a deck)
const PRESETS = [[39, 'Every card'], [13, 'Weekly'], [7, 'Every 2 weeks'], [6, 'Twice a month'], [3, 'Monthly'], [1, 'Quarterly']];
const freqSelect = (v, id = '') => { const o = PRESETS.some(([n]) => n === v) ? PRESETS : [...PRESETS, [v, `${v}× / quarter`]]; return `<select ${id ? `id="${id}"` : 'data-chore="freq"'}>${o.map(([n, l]) => `<option value="${n}" ${n === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`; };
let preview = null;
const ui = { week: 'all', show: 'all', sub: store.get('plansub', 'rooms'), pane: 'chat', cyc: null, todayCard: null, sheet: 0 };
const uid = () => Math.random().toString(36).slice(2, 8);
const weekOf = (c) => Math.floor(c.idx / 3) + 1;
const cardNo = (d, c) => `${pad(c.idx + 1)} / ${d.cards.length}`;
const currentDeck = () => S.decks.find((d) => d.id === store.get('deck', '')) || S.decks.slice().sort((a, b) => b.n - a.n)[0] || null;
const offTarget = (c) => c.items.length < 3 || c.items.length > 5;

// Older data kept the card structure inside the dated set. Create a matching editable deck once.
let migrating = false;
async function migrateLegacy() {
  if (migrating || !S.ready.decks || !S.ready.sets) return;
  const missing = [...new Map(S.sets.filter((x) => !x.demo && x.deck && !S.decks.some((d) => d.id === x.deck)).map((x) => [x.deck, x])).values()]; if (!missing.length) return;
  migrating = true;
  try { for (const x of missing) { const deck = { n: Number(String(x.deck).replace(/\D/g, '')) || x.n, created: x.created || new Date().toISOString(), cards: x.cards.map((c) => ({ idx: c.idx, code: c.code, label: c.label, reviewed: true, items: c.items.map((i) => ({ id: i.id, chore_id: i.chore_id || null, name: i.name, room: i.room })) })) }; S.decks = [...S.decks, { id: x.deck, ...deck }]; await queue(() => col('decks').doc(x.deck).set(deck)); } } finally { migrating = false; }
}
async function commitDeck(deck) {
  lastLocalDeckEdit = Date.now();
  S.decks = S.decks.map((d) => (d.id === deck.id ? deck : d));
  await queue(() => col('decks').doc(deck.id).set(stripId(deck)));
  await syncCycle(deck);
}
// Keep the newest cycle that uses this deck in step with edits, preserving check-offs on unchanged tasks.
async function syncCycle(deck) {
  const set = S.sets.filter((x) => x.deck === deck.id).sort((a, b) => b.n - a.n)[0]; if (!set) return;
  const copy = structuredClone(set);
  for (const c of copy.cards) {
    const dc = deck.cards.find((x) => x.idx === c.idx); if (!dc) continue;
    const old = new Map(c.items.map((i) => [i.id, i]));
    c.items = dc.items.map((i) => (old.has(i.id) ? { ...old.get(i.id), chore_id: i.chore_id || null, name: i.name, room: i.room } : { id: i.id, chore_id: i.chore_id || null, name: i.name, room: i.room, done: false, done_at: null, entry_id: null }));
    if (!(c.cleared && c.items.length && c.items.every((i) => i.done))) { c.cleared = false; c.cleared_date = null; }
  }
  S.sets = S.sets.map((x) => (x.id === set.id ? copy : x));
  await queue(() => col('cardsets').doc(set.id).set(stripId(copy)));
}
async function startCycle(deck, startDate) {
  const n = Math.max(0, ...S.sets.map((x) => x.n)) + 1, id = `s${n}`, m0 = nextMonday(startDate);
  const set = { n, deck: deck.id, start_date: m0, created: new Date().toISOString(), cards: deck.cards.map((c) => { const w = Math.floor(c.idx / 3), seg = c.idx % 3, st = addDaysIso(m0, w * 7 + seg * 2);
    return { code: c.code, idx: c.idx, start_date: st, end_date: addDaysIso(st, 1), label: c.label, cleared: false, cleared_date: null, items: c.items.map((i) => ({ id: i.id, chore_id: i.chore_id || null, name: i.name, room: i.room, done: false, done_at: null, entry_id: null })) }; }) };
  S.sets = [...S.sets, { id, ...set }]; await queue(() => col('cardsets').doc(id).set(set)); toast(`Cycle ${n} starts ${fmtDay(m0)}`);
}

function weakestSeg() { const fin = cardRecords().filter((r) => r.finished), segs = [0, 1, 2].map((g) => ({ g, ...rateOf(fin.filter((r) => r.seg === g)) })).filter((x) => x.planned >= 12); if (segs.length < 2) return null; const w = segs.reduce((a, c) => (c.rate < a.rate ? c : a)), bst = segs.reduce((a, c) => (c.rate > a.rate ? c : a)); return bst.rate - w.rate >= 0.08 ? w.g : null; }
const cycleDone = (x) => x.cards.reduce((a, c) => a + c.items.filter((i) => i.done).length, 0);
async function wipeCycle(set, remove) {
  const ids = new Set(); set.cards.forEach((c) => c.items.forEach((i) => i.entry_id && ids.add(i.entry_id)));
  const entries = S.entries.filter((e) => ids.has(e.id)).map((e) => structuredClone(e)), backupSet = structuredClone(set), copy = structuredClone(set);
  copy.cards.forEach((c) => { c.cleared = false; c.cleared_date = null; c.items.forEach((i) => { i.done = false; i.done_at = null; i.entry_id = null; }); });
  S.entries = S.entries.filter((e) => !ids.has(e.id)); S.sets = remove ? S.sets.filter((x) => x.id !== set.id) : S.sets.map((x) => (x.id === set.id ? copy : x));
  await pool([...entries.map((e) => () => col('entries').doc(e.id).delete()), () => (remove ? col('cardsets').doc(set.id).delete() : col('cardsets').doc(set.id).set(stripId(copy)))], 8);
  return { backupSet, entries };
}
async function restoreCycle(bk) {
  S.sets = [...S.sets.filter((x) => x.id !== bk.backupSet.id), bk.backupSet]; S.entries = [...S.entries, ...bk.entries];
  await pool([() => col('cardsets').doc(bk.backupSet.id).set(stripId(bk.backupSet)), ...bk.entries.map((e) => () => col('entries').doc(e.id).set(stripId(e)))], 8);
}

// ---------------------------------------------------------------- deck editor
function cardHtml(deck, c) {
  const n = c.items.length, cls = n < 3 || n > 6 ? 'bad' : n === 6 ? 'six' : '';
  const msg = n < 3 ? `${n} task${n === 1 ? '' : 's'} · needs 3 or more` : n === 6 ? '6 tasks · use only if needed' : n > 6 ? `${n} tasks · too many` : `${n} tasks`;
  return `<article class="pc ${c.reviewed ? 'reviewed' : ''}" data-idx="${c.idx}" id="card-${c.idx}" aria-label="Card ${c.idx + 1}">
    <div class="pc-clamp" title="Left blank on the printed card so a clip or clamp can hold it">clamp space</div>
    <div class="pc-h"><div><div class="pc-t">${esc(c.label.replace('–', ' · ').toUpperCase())}</div><div class="sub">Week ${weekOf(c)} of ${Math.ceil(deck.cards.length / 3)}</div></div><div class="pc-n">${cardNo(deck, c)}</div></div>
    <ul class="pc-l">${c.items.map((i) => `<li data-id="${i.id}"><span class="grip" draggable="true" title="Drag to another card" aria-hidden="true">⠿</span><span class="box"></span><div class="pc-in"><input data-name value="${esc(i.name)}" aria-label="Task"><input data-room value="${esc(i.room || '')}" list="rooms" aria-label="Room" placeholder="Room"></div><button class="icon" data-more aria-label="Task options">⋯</button></li>`).join('')}</ul>
    <div class="pc-add"><input data-add list="tasklib" placeholder="Add a task" aria-label="Add a task to card ${c.idx + 1}"><button class="sec" data-addbtn>Add</button></div>
    <div class="pc-f"><span class="${cls}" data-count>${msg}</span><label class="rev"><input type="checkbox" data-rev ${c.reviewed ? 'checked' : ''}> Reviewed</label></div></article>`;
}
const cardVisible = (c) => (ui.week === 'all' || weekOf(c) === +ui.week) && (ui.show === 'all' || (ui.show === 'review' && !c.reviewed) || (ui.show === 'off' && offTarget(c)));
function editorHtml(deck) {
  const weeks = Math.ceil(deck.cards.length / 3), size = store.get('cardsize', 'index');
  return `<section class="panel" id="editor"><div class="row wrap"><h2 class="grow" style="margin:0">Your cards · deck ${deck.n}</h2>${S.decks.length > 1 ? `<select id="deck-pick" style="width:auto" aria-label="Deck">${S.decks.slice().sort((a, b) => b.n - a.n).map((d) => `<option value="${d.id}" ${d.id === deck.id ? 'selected' : ''}>Deck ${d.n}</option>`).join('')}</select>` : ''}</div>
    <p class="sub" style="margin:4px 0 12px">Each card keeps a blank strip at the top for a clip or clamp. Edit anything directly: rename a task, change its room, add, remove, reorder or move tasks between cards (drag on a Mac, or use ⋯). Cards are saved as you go.</p>
    <div class="deckbar"><div><div class="row"><b id="rv-count"></b><span class="grow"></span><span class="sub" id="rv-off"></span></div><div class="bar" style="margin:6px 0 0"><i id="rv-bar"></i></div></div>
      <div class="row wrap"><select id="wk" aria-label="Week"><option value="all">All weeks</option>${Array.from({ length: weeks }, (_, i) => `<option value="${i + 1}" ${ui.week == i + 1 ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select>
        <select id="show" aria-label="Show"><option value="all" ${ui.show === 'all' ? 'selected' : ''}>All cards</option><option value="review" ${ui.show === 'review' ? 'selected' : ''}>Needs review</option><option value="off" ${ui.show === 'off' ? 'selected' : ''}>Not 3 to 5 tasks</option></select>
        <button class="sec" id="approve">Approve remaining</button></div>
      <div class="row wrap"><button class="primary" id="to-print">Next: print your cards →</button></div>
      <p class="sub" id="pdf-hint" style="margin:0"></p></div>
    <div class="deckgrid" id="grid">${deck.cards.map((c) => cardHtml(deck, c)).join('')}</div></section>`;
}
function refreshChrome(deck) {
  if (typeof drawPlanChrome === 'function') drawPlanChrome();
  const rv = deck.cards.filter((c) => c.reviewed).length, off = deck.cards.filter(offTarget).length, tot = deck.cards.length, rem = tot - rv;
  $('#rv-count').textContent = `${rv} of ${tot} cards reviewed`; $('#rv-bar').style.width = `${(100 * rv) / tot}%`;
  $('#rv-off').textContent = off ? `${off} not at 3 to 5 tasks` : 'All cards have 3 to 5 tasks';
  $('#approve').hidden = rem === 0;
  $('#pdf-hint').textContent = rem ? `${rem} card${rem === 1 ? '' : 's'} left to review. Edit a card or tick Reviewed; “Approve remaining” ticks them all. The PDF unlocks when every card is reviewed.` : 'Every card is reviewed. The PDF is built from the cards exactly as shown here.';
  deck.cards.forEach((c) => { const el = $(`#card-${c.idx}`); if (!el) return; el.classList.toggle('reviewed', !!c.reviewed); el.hidden = !cardVisible(c); const n = c.items.length, ct = $('[data-count]', el); ct.className = n < 3 || n > 6 ? 'bad' : n === 6 ? 'six' : ''; ct.textContent = n < 3 ? `${n} task${n === 1 ? '' : 's'} · needs 3 or more` : n === 6 ? '6 tasks · use only if needed' : n > 6 ? `${n} tasks · too many` : `${n} tasks`; $('[data-rev]', el).checked = !!c.reviewed; });
}
function bindEditor(deck0) {
  const grid = $('#grid'); refreshChrome(deck0);
  const cur = () => currentDeck();
  // fresh clone → mutate → save. render=true re-draws the grid (structural change); otherwise only the status chrome updates.
  const edit = (fn, { render = false, undo = '' } = {}) => {
    const before = cur(), d = structuredClone(before); fn(d);
    commitDeck(d).catch((e) => toast(e.message));
    if (render) { const y = window.scrollY; $('#grid').innerHTML = d.cards.map((c) => cardHtml(d, c)).join(''); refreshChrome(d); window.scrollTo(0, y); } else refreshChrome(d);
    if (undo) toastAction(undo, 'Undo', () => { commitDeck(before).catch((e) => toast(e.message)); $('#grid').innerHTML = before.cards.map((c) => cardHtml(before, c)).join(''); refreshChrome(before); });
  };
  const find = (d, el) => { const art = el.closest('.pc'), c = d.cards.find((x) => x.idx === +art.dataset.idx), li = el.closest('li'); return { c, it: li ? c.items.find((i) => i.id === li.dataset.id) : null }; };
  grid.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-name]')) { const v = t.value.trim(); if (!v) { const { it } = find(cur(), t); t.value = it?.name || ''; return; } edit((d) => { const { c, it } = find(d, t); it.name = v; c.reviewed = true; }); }
    else if (t.matches('[data-room]')) edit((d) => { const { c, it } = find(d, t); it.room = t.value.trim() || 'General'; c.reviewed = true; });
    else if (t.matches('[data-rev]')) edit((d) => { find(d, t).c.reviewed = t.checked; });
  });
  const addTask = (art) => {
    const inp = $('[data-add]', art), name = inp.value.trim(); if (!name) return; const insts = expandTasks(), low = name.toLowerCase(), lib = insts.find((x) => `${x.name} · ${x.room}`.toLowerCase() === low) || insts.find((x) => x.name.toLowerCase() === low);
    edit((d) => { const c = d.cards.find((x) => x.idx === +art.dataset.idx); c.items.push({ id: uid(), chore_id: lib?.id || null, name: lib ? lib.name : name, room: lib?.room || 'General' }); c.reviewed = true; }, { render: true });
    $(`#card-${art.dataset.idx} [data-add]`)?.focus();
  };
  grid.addEventListener('click', (e) => {
    const t = e.target;
    if (t.matches('[data-addbtn]')) return addTask(t.closest('.pc'));
    if (t.matches('[data-more]')) return taskMenu(t, edit, cur);
  });
  grid.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-add]')) { e.preventDefault(); addTask(e.target.closest('.pc')); } else if (e.key === 'Enter' && e.target.matches('[data-name],[data-room]')) e.target.blur(); });
  // drag and drop between cards (Mac); touch devices use the ⋯ menu
  let drag = null;
  grid.addEventListener('dragstart', (e) => { const g = e.target.closest && e.target.closest('.grip'); const li = g && g.closest('li[data-id]'); if (!li) return; drag = { from: +li.closest('.pc').dataset.idx, id: li.dataset.id }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.id); try { e.dataTransfer.setDragImage(li, 12, 12); } catch {} });
  grid.addEventListener('dragover', (e) => { const art = e.target.closest('.pc'); if (drag && art) { e.preventDefault(); grid.querySelectorAll('.dragover').forEach((x) => x !== art && x.classList.remove('dragover')); art.classList.add('dragover'); } });
  grid.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('.pc')) grid.querySelectorAll('.dragover').forEach((x) => x.classList.remove('dragover')); });
  grid.addEventListener('drop', (e) => { const art = e.target.closest('.pc'); grid.querySelectorAll('.dragover').forEach((x) => x.classList.remove('dragover')); if (!drag || !art) return; e.preventDefault(); const to = +art.dataset.idx, d0 = drag; drag = null; if (to !== d0.from) moveTask(edit, d0.from, d0.id, to); });
  grid.addEventListener('dragend', () => { drag = null; grid.querySelectorAll('.dragover').forEach((x) => x.classList.remove('dragover')); });

  $('#wk').onchange = (e) => { ui.week = e.target.value; refreshChrome(cur()); }; $('#show').onchange = (e) => { ui.show = e.target.value; refreshChrome(cur()); };
  $('#deck-pick')?.addEventListener('change', (e) => { store.set('deck', e.target.value); go('plan', { keep: true }); });
  $('#approve').onclick = () => edit((d) => d.cards.forEach((c) => (c.reviewed = true)));
  $('#to-print').onclick = () => { ui.sub = 'print'; store.set('plansub', 'print'); go('plan'); };

}
function moveTask(edit, from, id, to) {
  edit((d) => { const a = d.cards.find((c) => c.idx === from), b = d.cards.find((c) => c.idx === to), i = a.items.findIndex((x) => x.id === id); if (i < 0) return; b.items.push(...a.items.splice(i, 1)); a.reviewed = true; b.reviewed = true; }, { render: true, undo: `Moved to card ${to + 1}.` });
}
function taskMenu(btn, edit, cur) {
  const art = btn.closest('.pc'), li = btn.closest('li'), idx = +art.dataset.idx, id = li.dataset.id, deck = cur(), c = deck.cards.find((x) => x.idx === idx), pos = c.items.findIndex((x) => x.id === id), it = c.items[pos];
  const d = $('#dlg');
  d.innerHTML = `<h2 style="font-size:16px">${esc(it.name)}</h2><p class="sub" style="margin:0 0 10px">Card ${idx + 1} · ${esc(c.label)}</p>
    <div style="display:grid;gap:8px"><div class="row"><button class="sec grow" id="m-up" ${pos === 0 ? 'disabled' : ''}>↑ Move up</button><button class="sec grow" id="m-down" ${pos === c.items.length - 1 ? 'disabled' : ''}>↓ Move down</button></div>
      <label class="sub" for="m-to">Move to another card</label><select id="m-to"><option value="">Choose a card…</option>${deck.cards.filter((x) => x.idx !== idx).map((x) => `<option value="${x.idx}">${pad(x.idx + 1)} · ${esc(x.label)} · week ${weekOf(x)} (${x.items.length} tasks)</option>`).join('')}</select>
      <button class="sec danger" id="m-del">Remove from this card</button><button class="link" id="m-close">Close</button></div>`;
  d.showModal(); const close = () => d.close();
  $('#m-close', d).onclick = close;
  $('#m-up', d).onclick = () => { close(); edit((dk) => { const cc = dk.cards.find((x) => x.idx === idx); [cc.items[pos - 1], cc.items[pos]] = [cc.items[pos], cc.items[pos - 1]]; cc.reviewed = true; }, { render: true }); };
  $('#m-down', d).onclick = () => { close(); edit((dk) => { const cc = dk.cards.find((x) => x.idx === idx); [cc.items[pos + 1], cc.items[pos]] = [cc.items[pos], cc.items[pos + 1]]; cc.reviewed = true; }, { render: true }); };
  $('#m-to', d).onchange = (e) => { if (e.target.value === '') return; close(); moveTask(edit, idx, id, +e.target.value); };
  $('#m-del', d).onclick = () => { close(); edit((dk) => { const cc = dk.cards.find((x) => x.idx === idx); cc.items.splice(cc.items.findIndex((x) => x.id === id), 1); cc.reviewed = true; }, { render: true, undo: `Removed “${it.name}”.` }); };
}

// ---------------------------------------------------------------- PDF: two cards per letter sheet
const CLAMP = 54; // points of blank card at the top (0.75 in) so a clip or clamp can hold it without covering text
function drawCard(doc, deck, c, ox, oy, k) {
  const X = (v) => ox + v * k, Y = (v) => oy + v * k, L = 24, R = 264, z = CLAMP, weeks = Math.ceil(deck.cards.length / 3);
  doc.setDrawColor(200).setLineWidth(0.5 * k); [[0, 10], [278, 288]].forEach(([a, b]) => doc.line(X(a), Y(z), X(b), Y(z))); // small ticks mark where the clamp area ends
  doc.setTextColor(0).setDrawColor(0).setFont('helvetica', 'bold').setFontSize(26 * k); doc.text(c.label.replace('–', ' · ').toUpperCase(), X(L), Y(z + 30));
  doc.setFont('helvetica', 'normal').setFontSize(11 * k); doc.text(`Week ${weekOf(c)} of ${weeks}`, X(L), Y(z + 48));
  doc.setFont('courier', 'bold').setFontSize(15 * k); const no = cardNo(deck, c), cw = doc.getTextWidth(no) + 16 * k;
  doc.setLineWidth(1.6 * k); doc.roundedRect(X(R) - cw, Y(z + 8), cw, 26 * k, 3 * k, 3 * k); doc.text(no, X(R) - cw / 2, Y(z + 26), { align: 'center' });
  doc.line(X(L), Y(z + 60), X(R), Y(z + 60));
  const top = z + 70, bottom = 402, n = c.items.length, rh = (bottom - top) / Math.max(1, n);
  c.items.forEach((it, i) => {
    const cy = top + rh * i + rh / 2;
    doc.setLineWidth(2 * k); doc.roundedRect(X(L), Y(cy - 13), 26 * k, 26 * k, 3 * k, 3 * k);
    doc.setFont('helvetica', 'normal').setFontSize(14 * k);
    const lines = doc.splitTextToSize(it.name, (R - 60) * k).slice(0, 2), y0 = cy - (lines.length - 1) * 8 + (it.room ? -3 : 5);
    doc.text(lines, X(58), Y(y0), { lineHeightFactor: 1.15 });
    if (it.room) { doc.setFontSize(8 * k).setTextColor(100); doc.text(it.room.toUpperCase(), X(58), Y(y0 + (lines.length - 1) * 16 + 12)); doc.setTextColor(0); }
  });
  doc.setFontSize(8 * k).setTextColor(100); doc.text('Home - 2-day card', X(L), Y(424)); doc.text('Check the box when done', X(R), Y(424), { align: 'right' }); doc.setTextColor(0);
}
