// ================================================================ NOTES: a short note on a card, tagged by what it is for
// note = stays with the card (Ask can read it) · deck = shown when the next deck is dealt · idea = collected in More for the app itself
const NOTE_TAGS = [
  ['note', 'Just a note', 'e.g. Guests came, so the kitchen got messy this week.', 'Stays with this card. Ask can read it.'],
  ['deck', 'Next deck', 'e.g. Wipe the mirror every other week, not every week.', 'Shown when you deal the next deck, next to the task it is about.'],
  ['idea', 'App idea', 'e.g. Let me snooze a task for a week.', 'Collected under More so you can pass it on.'],
];
const themeNow = () => document.documentElement.getAttribute('data-theme') === 'ember' ? 'ember' : 'nebula';
function setTheme(name) { document.documentElement.setAttribute('data-theme', name); store.set('orrery-theme', name); syncPalette(); for (const k in MMC) delete MMC[k]; WALL = null; PLAND = null; }
const noteTagName = (t) => (NOTE_TAGS.find((x) => x[0] === t) || NOTE_TAGS[0])[1];
const notesOfCard = (setId, idx) => S.notes.filter((n) => n.set_id === setId && n.card_idx === idx).sort((a, b) => b.created.localeCompare(a.created));
const openDeckNotes = () => S.notes.filter((n) => n.tag === 'deck' && n.status !== 'done').sort((a, b) => a.created.localeCompare(b.created));

async function addNote({ tag, text, set = null, card = null, item = null }) {
  text = String(text || '').trim().slice(0, 600); if (!text) throw new Error('Write something first.');
  const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const doc = { tag: NOTE_TAGS.some((x) => x[0] === tag) ? tag : 'note', text, date: today(), status: 'open', created: new Date().toISOString(),
    set_id: set ? set.id : null, cycle: set ? set.n : null, card_idx: card ? card.idx : null, card_label: card ? card.label : null,
    item_id: item ? item.id : null, item_name: item ? item.name : null, chore_id: item ? item.chore_id || null : null, room: item ? item.room || null : null };
  S.notes = [...S.notes, { id, ...doc }]; await queue(() => col('notes').doc(id).set(doc)); return doc;
}
async function setNoteStatus(id, status) { S.notes = S.notes.map((n) => (n.id === id ? { ...n, status } : n)); await queue(() => col('notes').doc(id).update({ status })); }
async function removeNote(id) { S.notes = S.notes.filter((n) => n.id !== id); await queue(() => col('notes').doc(id).delete()); }

function noteRowHtml(n, { where = true } = {}) {
  const ref = [n.card_idx != null ? `Card ${pad(n.card_idx + 1)}` : '', n.item_name || ''].filter(Boolean).join(' · '), done = n.status === 'done';
  const when = parse(n.date).toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return `<div class="note ${done ? 'done' : ''}"><div class="nt-top"><span class="ntag t-${n.tag}">${esc(noteTagName(n.tag))}</span><span class="sub">${where && ref ? esc(ref) + ' · ' : ''}${when}</span></div><p>${esc(n.text)}</p>
    <div class="nt-act">${n.tag !== 'note' ? `<button class="link sm" data-nstatus="${n.id}" data-to="${done ? 'open' : 'done'}">${done ? 'Reopen' : n.tag === 'deck' ? 'Handled' : 'Done'}</button>` : ''}<button class="link danger sm" data-ndel="${n.id}">Delete</button></div></div>`;
}
function bindNotes(root, after) {
  root.querySelectorAll('[data-nstatus]').forEach((b) => (b.onclick = async () => { await setNoteStatus(b.dataset.nstatus, b.dataset.to); after && after(); }));
  root.querySelectorAll('[data-ndel]').forEach((b) => (b.onclick = () => confirmDialog('Delete this note?', async () => { await removeNote(b.dataset.ndel); after && after(); }, { danger: true, yes: 'Delete' })));
}

// the form: pick what it is for, write it, optionally pin it to one task on the card
function openNoteSheet(setId, idx, { tag } = {}) {
  const set = S.sets.find((s) => s.id === setId), card = set && set.cards.find((c) => c.idx === idx); if (!card) return;
  let cur = tag || store.get('notetag', 'note'); if (!NOTE_TAGS.some((x) => x[0] === cur)) cur = 'note';
  const meta = () => NOTE_TAGS.find((x) => x[0] === cur);
  const list = () => { const ns = notesOfCard(setId, idx); return ns.length ? ns.map((n) => noteRowHtml(n, { where: false })).join('') : '<p class="sub" style="margin:0">No notes on this card yet.</p>'; };
  const drawList = () => { const h = $('#nt-list'); if (!h) return; h.innerHTML = list(); bindNotes(h, () => { drawList(); }); };
  const body = openSheet({ title: `Note · card ${pad(idx + 1)}`, refresh: drawList, onClose: () => go(current, { keep: true }), html: `<p class="sub" style="margin:0 0 10px">${esc(card.label)} · ${fmtShort(card.start_date)}</p>
    <div class="seg mini" id="nt-tags" role="group" aria-label="What kind of note">${NOTE_TAGS.map(([k, n]) => `<button data-ntag="${k}" class="${k === cur ? 'on' : ''}" aria-pressed="${k === cur}">${n}</button>`).join('')}</div>
    <p class="sub" id="nt-help" style="margin:0 0 8px"></p>
    <textarea id="nt-text" maxlength="600" aria-label="Your note" style="min-height:92px"></textarea>
    <div class="row" style="margin-top:10px"><label class="sub grow" for="nt-item" style="margin:0">About</label><select id="nt-item" style="flex:2"><option value="">The whole card</option>${card.items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:12px"><span class="grow"></span><button class="primary" id="nt-save">Save note</button></div>
    <div class="chart-title">On this card</div><div id="nt-list"></div>` });
  const paint = () => { $('#nt-help', body).textContent = meta()[3]; $('#nt-text', body).placeholder = meta()[2]; body.querySelectorAll('[data-ntag]').forEach((b) => { const on = b.dataset.ntag === cur; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); };
  body.querySelectorAll('[data-ntag]').forEach((b) => (b.onclick = () => { cur = b.dataset.ntag; store.set('notetag', cur); paint(); $('#nt-text', body).focus(); }));
  $('#nt-save', body).onclick = async () => {
    const text = $('#nt-text', body).value, itemId = $('#nt-item', body).value, btn = $('#nt-save', body); btn.disabled = true;
    try { await addNote({ tag: cur, text, set, card, item: card.items.find((i) => i.id === itemId) || null }); $('#nt-text', body).value = ''; toast(cur === 'deck' ? 'Saved. You will see it when you deal the next deck.' : 'Note saved.'); drawList(); }
    catch (e) { toast(e.message); } finally { btn.disabled = false; }
  };
  paint(); drawList(); setTimeout(() => $('#nt-text', body)?.focus(), 350);
}

// shown on the Deck step: what you asked to change, next to the thing you are about to deal
function deckNotesPanel() {
  const ns = openDeckNotes(); if (!ns.length) return '';
  const rooms = [...new Set(ns.map((n) => n.room).filter(Boolean))];
  return `<section class="panel notespanel" id="deck-notes"><div class="row wrap"><h2 class="grow" style="margin:0">Your notes for the next deck</h2><span class="sub">${ns.length} open</span></div>
    <p class="sub" style="margin:4px 0 6px">Tasks and frequencies live on the Rooms step. Change them there, then mark a note handled.</p>${ns.map((n) => noteRowHtml(n)).join('')}
    ${rooms.length ? `<div class="chart-title">Ask the planner</div><div class="row wrap">${rooms.map((r) => `<button class="ai sm" data-nplan="${esc(r)}">${icon('spark')} ${esc(r)}</button>`).join('')}</div>` : ''}</section>`;
}
function bindDeckNotes() {
  const host = $('#deck-notes'); if (!host) return;
  bindNotes(host, () => go('plan', { keep: true }));
  host.querySelectorAll('[data-nplan]').forEach((b) => (b.onclick = () => {
    const room = b.dataset.nplan, sp = spaceList().find((x) => x.name === room); if (!sp) return toast(`There is no “${room}” space to plan.`);
    const mine = openDeckNotes().filter((n) => n.room === room).map((n) => `${n.item_name ? n.item_name + ': ' : ''}${n.text}`).join(' / ');
    store.set('space', sp.key); ui.pane = 'chat'; drafts[sp.key] = `Here are my notes for this room: ${mine} What would you change?`; goPlan('rooms');
  }));
}
// what the planner should know about a space before it proposes anything
function plannerNotes(sp, tasks) {
  const ids = new Set(tasks.map((t) => t.id)), ns = openDeckNotes().filter((n) => (n.chore_id && ids.has(n.chore_id)) || (sp.kind === 'room' && n.room === sp.name) || (sp.kind === 'house' && !n.room));
  return ns.length ? `\nThe user left these notes for the next deck about this space (consider them when proposing changes): ${ns.map((n) => `"${n.item_name ? n.item_name + ': ' : ''}${n.text}"`).join('; ')}.` : '';
}

// the one place app ideas and everything else can be read back
function notesPanel() {
  const filter = store.get('notefilter', 'all'), all = S.notes.slice().sort((a, b) => b.created.localeCompare(a.created)), ns = all.filter((n) => filter === 'all' || n.tag === filter);
  const count = (k) => all.filter((n) => k === 'all' || n.tag === k).length;
  return `<section class="panel" id="notes-panel"><div class="row wrap"><h2 class="grow" style="margin:0">Notes</h2><span class="sub">${all.length ? `${all.length} total` : ''}</span></div>
    <p class="sub" style="margin:4px 0 10px">Add notes from any card. They are filed by what they are for.</p>
    ${all.length ? `<div class="seg mini" id="nt-filter" style="margin-bottom:8px">${[['all', 'All'], ...NOTE_TAGS.map((x) => [x[0], x[1]])].map(([k, n]) => `<button data-nf="${k}" class="${k === filter ? 'on' : ''}">${n} ${count(k)}</button>`).join('')}</div>
      ${ns.length ? ns.map((n) => noteRowHtml(n)).join('') : '<div class="empty">Nothing under this tag.</div>'}
      ${all.some((n) => n.tag === 'idea') ? `<div class="row wrap" style="margin-top:10px"><button class="sec" id="nt-copy">Copy app ideas</button></div>` : ''}` : `<div class="empty">No notes yet. Open any card and tap “Add a note”.</div>`}</section>`;
}
function bindNotesPanel() {
  const host = $('#notes-panel'); if (!host) return;
  bindNotes(host, () => go('more', { keep: true }));
  host.querySelectorAll('[data-nf]').forEach((b) => (b.onclick = () => { store.set('notefilter', b.dataset.nf); go('more', { keep: true }); }));
  $('#nt-copy', host)?.addEventListener('click', async () => {
    const text = 'App ideas\n\n' + S.notes.filter((n) => n.tag === 'idea').sort((a, b) => a.created.localeCompare(b.created)).map((n) => `- ${n.text}${n.status === 'done' ? ' (done)' : ''} [${n.date}]`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Copied.'); } catch { const b = openSheet({ title: 'App ideas', html: `<p class="sub">Select all and copy.</p><textarea id="nt-all" readonly style="min-height:200px">${esc(text)}</textarea>` }); const ta = $('#nt-all', b); ta.focus(); ta.select(); }
  });
}
