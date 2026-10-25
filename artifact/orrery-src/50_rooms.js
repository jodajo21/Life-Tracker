// ================================================================ Rooms, categories and tasks (where tasks are broken down into card items)
const ROOM_TYPES = ['Kitchen', 'Bathroom', 'Bedroom', 'Living', 'Entry', 'Laundry', 'Garage', 'Office', 'Outdoor', 'Other'];
const SCOPES = { room: 'Rooms', category: 'Category', house: 'Whole house' };
const typeGuess = (n) => (/bath/i.test(n) ? 'Bathroom' : /bed/i.test(n) ? 'Bedroom' : /kitchen/i.test(n) ? 'Kitchen' : /living|family|lounge|den/i.test(n) ? 'Living' : /entry|hall|foyer|mud/i.test(n) ? 'Entry' : /laundry|utility/i.test(n) ? 'Laundry' : /garage/i.test(n) ? 'Garage' : /office|study/i.test(n) ? 'Office' : /yard|patio|garden|outdoor|porch|deck/i.test(n) ? 'Outdoor' : 'Other');
const activeRooms = () => S.rooms.filter((r) => r.active !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
const activeCats = () => S.taskcats.filter((c) => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
const activeTpls = () => S.chores.filter((c) => c.active !== false).sort((a, b) => a.name.localeCompare(b.name));
const CATALOG = {
  Kitchen: [['Wipe counters & stove', 13], ['Clean sink', 7], ['Mop floor', 13], ['Clean microwave', 3], ['Clean fridge shelves', 3]],
  Bathroom: [['Clean toilet', 13], ['Scrub sink & counter', 13], ['Clean shower/tub', 7], ['Wipe mirror', 7], ['Wash bath mat & towels', 6]],
  Bedroom: [['Change bedding', 7], ['Dust surfaces', 7], ['Vacuum floor', 13], ['Declutter surfaces', 6]],
  Living: [['Quick tidy', 39], ['Vacuum floor', 13], ['Dust surfaces', 7], ['Wipe electronics', 3]],
  Entry: [['Tidy shoes & coats', 6], ['Sweep or vacuum entry', 7], ['Wipe door handles', 3]],
  Laundry: [['Wash a load', 13], ['Clean lint trap', 6], ['Wipe washer & dryer', 3]],
  Garage: [['Sweep floor', 3], ['Tidy storage', 3]], Office: [['Dust desk & electronics', 7], ['Declutter papers', 6]], Outdoor: [['Sweep porch', 7], ['Tidy outdoor area', 6]], Other: [],
};
const CAT_CATALOG = { plants: [['Water plants', 13], ['Prune & rotate plants', 3], ['Fertilize plants', 3]], pets: [['Wash pet bedding', 6], ['Clean pet food area', 13], ['Vacuum pet hair', 13]], car: [['Clear out car trash', 7], ['Vacuum car interior', 3], ['Wash car', 3]], outdoors: [['Water garden', 13], ['Weed beds', 6]] };
const LOWER = { 39: 13, 13: 7, 7: 3, 6: 3, 3: 1 };
const FREQ_NAME = { 39: 'every card', 13: 'weekly', 7: 'every 2 weeks', 6: 'twice a month', 3: 'monthly', 1: 'quarterly' };
const freqName = (n) => FREQ_NAME[n] || `${n}× a cycle`;

/** Breaks the task library into the individual items that go on cards: a room task becomes one item per room it applies to. */
function expandTasks() {
  const out = [];
  for (const c of S.chores.filter((x) => x.active !== false)) {
    if (c.scope === 'room') for (const rid of c.roomIds || []) { const r = S.rooms.find((x) => x.id === rid && x.active !== false); if (r) out.push({ id: `${c.id}:${r.id}`, tpl: c.id, name: c.name, room: r.name, per_quarter: c.per_quarter }); }
    else if (c.scope === 'category') { const g = S.taskcats.find((x) => x.id === c.catId && x.active !== false); if (g) out.push({ id: c.id, tpl: c.id, name: c.name, room: g.name, per_quarter: c.per_quarter }); }
    else out.push({ id: c.id, tpl: c.id, name: c.name, room: c.room || 'Whole house', per_quarter: c.per_quarter });
  }
  return out;
}
let migratingRooms = false;
async function migrateRooms() { // older data kept a room name on each task; turn those into real rooms once
  if (migratingRooms || !S.ready.rooms || !S.ready.chores || !S.ready.taskcats) return;
  const legacy = S.chores.filter((c) => !c.scope); if (!legacy.length) return;
  migratingRooms = true;
  try {
    const byName = Object.fromEntries(S.rooms.map((r) => [r.name, r.id]));
    for (const nm of new Set(legacy.map((c) => c.room || 'General').filter((n) => n !== 'General'))) if (!byName[nm]) { const ref = col('rooms').doc(), doc = { name: nm, type: typeGuess(nm), active: true, order: S.rooms.length }; S.rooms = [...S.rooms, { id: ref.id, ...doc }]; byName[nm] = ref.id; await queue(() => ref.set(doc)); }
    for (const c of legacy) { const nm = c.room || 'General', upd = nm === 'General' ? { scope: 'house', roomIds: [], catId: '' } : { scope: 'room', roomIds: [byName[nm]], catId: '' }; S.chores = S.chores.map((x) => (x.id === c.id ? { ...x, ...upd } : x)); await queue(() => col('chores').doc(c.id).update(upd)); }
  } finally { migratingRooms = false; }
}

// ---------------------------------------------------------------- recommendations
function recommendations(inst, total) {
  const dismissed = (() => { try { return JSON.parse(store.get('recdis', '[]')); } catch { return []; } })(), out = [], rooms = activeRooms(), cats = activeCats(), tpls = activeTpls();
  const push = (r) => { if (!dismissed.includes(r.id)) out.push(r); };
  const instOf = (t) => inst.filter((x) => x.tpl === t.id).length || 1;
  // 1. workload: too many placements to keep cards at 3-5
  if (total > 195) {
    let over = total - 195; const all = tpls.filter((t) => LOWER[t.per_quarter]).map((t) => ({ t, save: (t.per_quarter - LOWER[t.per_quarter]) * instOf(t) }));
    const cand = all.filter((c) => c.t.per_quarter < 39).length ? all.filter((c) => c.t.per_quarter < 39) : all; // keep the every-card tasks as the backbone unless nothing else can give
    const pick = []; while (over > 0 && pick.length < 4) { const rest = cand.filter((c) => !pick.includes(c)), fits = rest.filter((c) => c.save <= over).sort((a, b) => b.save - a.save)[0], next = fits || rest.sort((a, b) => a.save - b.save)[0]; if (!next) break; pick.push(next); over -= next.save; }
    push({ id: 'cap', title: `${total - 195} placements too many for 5 tasks a card`, why: `Your tasks add up to ${total} per cycle and 195 fits at 5 per card. Lowering the tasks below clears it, or you can accept a few 6-task cards.`, prio: 0 });
    pick.forEach((c) => push({ id: `cap:${c.t.id}`, title: `Do “${c.t.name}” ${freqName(LOWER[c.t.per_quarter])} instead of ${freqName(c.t.per_quarter)}`, why: `Saves ${c.save} placements per cycle.`, label: 'Lower it', prio: 1, apply: () => queue(() => col('chores').doc(c.t.id).update({ per_quarter: LOWER[c.t.per_quarter] })) }));
  } else if (total < 117 && inst.length) push({ id: 'low', title: 'Not enough tasks to fill the cards', why: `${total} placements; 39 cards need at least 117 to have 3 tasks each. Add a few of the suggestions below.`, prio: 0 });
  // 2. tasks that need a place to apply
  for (const t of tpls) { if (t.scope === 'room' && !(t.roomIds || []).some((id) => rooms.some((r) => r.id === id))) push({ id: `fix:${t.id}`, title: `“${t.name}” isn’t assigned to a room`, why: 'It won’t appear on any card until you tick the rooms it applies to, or switch it to a category or the whole house.', prio: 1 }); if (t.scope === 'category' && !cats.some((c) => c.id === t.catId)) push({ id: `fix:${t.id}`, title: `“${t.name}” has no category`, why: 'Pick a category for it below, or it won’t appear on any card.', prio: 1 }); }
  // 3. empty rooms and common tasks that are missing
  const room = (r) => r.name, hasTask = (r, name) => tpls.some((t) => t.scope === 'room' && (t.roomIds || []).includes(r.id) && t.name.toLowerCase() === name.toLowerCase());
  for (const r of rooms) if (!inst.some((x) => x.room === room(r))) push({ id: `empty:${r.id}`, title: `${r.name} has no tasks yet`, why: 'Nothing on your cards touches this room.', prio: 2 });
  if (total <= 190) for (const r of rooms) (CATALOG[r.type] || []).filter(([n]) => !hasTask(r, n)).slice(0, 2).forEach(([n, f]) => push({ id: `add:${r.id}:${n}`, title: `Add “${n}” to ${r.name}`, why: `Usually done ${freqName(f)} in a ${r.type.toLowerCase()}.`, label: 'Add it', prio: 4, apply: () => { const ex = tpls.find((t) => t.scope === 'room' && t.name.toLowerCase() === n.toLowerCase()); return queue(() => (ex ? col('chores').doc(ex.id).update({ roomIds: [...new Set([...(ex.roomIds || []), r.id])] }) : col('chores').doc().set({ name: n, scope: 'room', roomIds: [r.id], catId: '', per_quarter: f, active: true }))); } }));
  if (total <= 190) for (const g of cats) (CAT_CATALOG[g.name.trim().toLowerCase()] || []).filter(([n]) => !tpls.some((t) => t.name.toLowerCase() === n.toLowerCase())).slice(0, 2).forEach(([n, f]) => push({ id: `addc:${g.id}:${n}`, title: `Add “${n}” to ${g.name}`, why: `Usually done ${freqName(f)}.`, label: 'Add it', prio: 4, apply: () => queue(() => col('chores').doc().set({ name: n, scope: 'category', catId: g.id, roomIds: [], per_quarter: f, active: true })) }));
  // 4. what your own history says
  const fin = cardRecords().filter((r) => r.finished);
  if (rateOf(fin).planned >= 20) {
    const stats = {}; fin.forEach((r) => r.items.forEach((i) => { (stats[i.name] ||= { planned: 0, done: 0 }).planned++; if (i.done) stats[i.name].done++; }));
    Object.entries(stats).filter(([, v]) => v.planned >= 3 && v.done / v.planned <= 0.5).sort((a, b) => a[1].done / a[1].planned - b[1].done / b[1].planned).slice(0, 3).forEach(([n, v]) => { const t = tpls.find((x) => x.name === n); push({ id: `skip:${n}`, title: `“${n}” keeps getting skipped`, why: `Done ${v.done} of ${v.planned} times.${t && LOWER[t.per_quarter] ? ` Doing it ${freqName(LOWER[t.per_quarter])} may suit you better.` : ' Splitting it into smaller steps may help.'}`, label: t && LOWER[t.per_quarter] ? 'Lower it' : '', prio: 3, apply: t && LOWER[t.per_quarter] ? () => queue(() => col('chores').doc(t.id).update({ per_quarter: LOWER[t.per_quarter] })) : null }); });
    const wseg = weakestSeg(); if (wseg != null) { const w = rateOf(fin.filter((r) => r.seg === wseg)); push({ id: `seg:${wseg}`, title: `${SEGNAME[wseg]} cards are your hardest`, why: `${pctS(w.rate)} done, against ${pctS(rateOf(fin).rate)} overall. When you generate the next deck, “Keep Fri–Sat lighter” is on for you${wseg === 2 ? '' : ' (it applies to Fri–Sat only)'}.`, prio: 3 }); }
    const rooms2 = {}; fin.forEach((r) => r.items.forEach((i) => { const k = i.room || 'General'; (rooms2[k] ||= { planned: 0, done: 0 }).planned++; if (i.done) rooms2[k].done++; }));
    Object.entries(rooms2).filter(([, v]) => v.planned >= 12 && v.done / v.planned < 0.5).slice(0, 2).forEach(([k, v]) => push({ id: `room:${k}`, title: `${k} is only ${pctS(v.done / v.planned)} done`, why: 'Fewer or smaller tasks there, or moving them to your stronger days, may help.', prio: 3 }));
  }
  return out.sort((a, b) => a.prio - b.prio).slice(0, 9);
}

// ---------------------------------------------------------------- the Rooms tab: one planner per room, built around a chat
const FREQS = [39, 13, 7, 6, 3, 1];
const normFreq = (n) => FREQS.reduce((best, f) => (Math.abs(f - Number(n || 13)) < Math.abs(best - Number(n || 13)) ? f : best), 13);
let roomBusy = false, roomCtl = null;
const drafts = {};
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
const dayLabel = (iso) => { const d = iso.slice(0, 10), t = ymd(new Date(iso)); return t === today() ? 'Today' : t === addDaysIso(today(), -1) ? 'Yesterday' : parse(t).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }); };

function spaceList() {
  return [...activeRooms().map((r) => ({ key: 'room:' + r.id, kind: 'room', id: r.id, name: r.name, type: r.type })), ...activeCats().map((c) => ({ key: 'cat:' + c.id, kind: 'cat', id: c.id, name: c.name, type: 'Category' })), { key: 'house', kind: 'house', id: 'house', name: 'Whole house', type: 'House' }];
}
const currentSpace = () => { const l = spaceList(); return l.find((x) => x.key === store.get('space', '')) || l[0]; };
function planOf(sp) {
  return S.chores.filter((c) => c.active !== false && (sp.kind === 'room' ? c.scope === 'room' && (c.roomIds || []).includes(sp.id) : sp.kind === 'cat' ? c.scope === 'category' && c.catId === sp.id : c.scope === 'house'))
    .sort((a, b) => (a.area || '~').localeCompare(b.area || '~') || a.name.localeCompare(b.name));
}
const placementsOf = (tasks) => tasks.reduce((a, c) => a + Math.min(c.per_quarter, 39), 0);
const chatDoc = (key) => S.chats.find((c) => c.id === key) || { id: key, messages: [], notes: '' };
async function saveChat(doc) {
  doc.messages = doc.messages.slice(-60); S.chats = [...S.chats.filter((c) => c.id !== doc.id), doc];
  const { id, ...rest } = doc; await queue(() => col('roomchats').doc(id).set(rest));
}
const taskLine = (c) => `${esc(c.name)}`;

// ---- changes the user approves from a proposal card
function taskBase(sp) { return sp.kind === 'room' ? { scope: 'room', roomIds: [sp.id], catId: '' } : sp.kind === 'cat' ? { scope: 'category', catId: sp.id, roomIds: [] } : { scope: 'house', roomIds: [], catId: '' }; }
async function addTaskTo(sp, a) {
  const ref = col('chores').doc(), doc = { name: String(a.name).trim(), ...taskBase(sp), per_quarter: normFreq(a.per_quarter), area: String(a.area || '').trim(), parts: Math.max(0, Math.round(Number(a.parts) || 0)), active: true };
  S.chores = [...S.chores, { id: ref.id, ...doc }]; await queue(() => ref.set(doc)); await ensureCategory('home', doc.name); return ref.id;
}
async function removeTaskFrom(sp, c) {
  if (c.scope === 'room' && (c.roomIds || []).length > 1) { const ids = c.roomIds.filter((x) => x !== sp.id); S.chores = S.chores.map((x) => (x.id === c.id ? { ...x, roomIds: ids } : x)); await queue(() => col('chores').doc(c.id).update({ roomIds: ids })); return () => queue(() => col('chores').doc(c.id).update({ roomIds: c.roomIds })).then(() => { S.chores = S.chores.map((x) => (x.id === c.id ? { ...x, roomIds: c.roomIds } : x)); }); }
  S.chores = S.chores.map((x) => (x.id === c.id ? { ...x, active: false } : x)); await queue(() => col('chores').doc(c.id).update({ active: false }));
  return () => queue(() => col('chores').doc(c.id).update({ active: true })).then(() => { S.chores = S.chores.map((x) => (x.id === c.id ? { ...x, active: true } : x)); });
}
async function applyProposal(sp, idx, picks) {
  const doc = structuredClone(chatDoc(sp.key)), m = doc.messages[idx], p = m.proposal, added = [], changed = [], removed = [];
  for (const i of picks.adds) { const a = p.adds[i]; if (a) { await addTaskTo(sp, a); added.push(a.name); } }
  for (const i of picks.updates) { const u = p.updates[i], c = S.chores.find((x) => x.id === u.task_id); if (!c) continue; const patch = {}; if (u.name) patch.name = u.name; if (u.per_quarter) patch.per_quarter = normFreq(u.per_quarter); if (u.area != null) patch.area = u.area; S.chores = S.chores.map((x) => (x.id === c.id ? { ...x, ...patch } : x)); await queue(() => col('chores').doc(c.id).update(patch)); changed.push(c.name); }
  for (const i of picks.removes) { const r = p.removes[i], c = S.chores.find((x) => x.id === r.task_id); if (c) { await removeTaskFrom(sp, c); removed.push(c.name); } }
  p.status = 'applied'; p.result = { added: added.length, changed: changed.length, removed: removed.length };
  const bits = [added.length && `added ${added.join(', ')}`, changed.length && `changed ${changed.join(', ')}`, removed.length && `removed ${removed.join(', ')}`].filter(Boolean).join('; ');
  doc.messages.push({ role: 'user', hidden: true, content: `(The user applied your suggestion: ${bits || 'nothing selected'}.)`, ts: new Date().toISOString() }); await saveChat(doc);
}
async function dismissProposal(sp, idx) { const doc = structuredClone(chatDoc(sp.key)); doc.messages[idx].proposal.status = 'dismissed'; doc.messages.push({ role: 'user', hidden: true, content: '(The user dismissed that suggestion.)', ts: new Date().toISOString() }); await saveChat(doc); }

// ---- the chat
function plannerInstructions(sp, tasks, doc, total) {
  const idm = tasks.map((c, i) => `t${i + 1}: ${c.name} · ${freqName(c.per_quarter)}${c.area ? ` · area: ${c.area}` : ''}${c.parts ? ` · ${c.parts} to rotate through` : ''}`).join('\n') || '(nothing planned yet)';
  const where = sp.kind === 'room' ? `the ${sp.name} (a ${sp.type.toLowerCase()})` : sp.kind === 'cat' ? `the "${sp.name}" category, which is a set of tasks about a thing rather than a place` : 'the whole house (tasks that are not tied to one room)';
  return `You are a warm, practical home-planning assistant inside the user's chores app. You are helping plan ONE space: ${where}.
How the app works: chores are printed on 2-day cards (Mon-Tue, Wed-Thu, Fri-Sat), 3 to 5 small tasks per card, 39 cards per 13-week cycle. The whole home has a budget of about 195 task placements per cycle; ${total} are used now and this space uses ${placementsOf(tasks)}. Allowed frequencies (per_quarter, meaning times per cycle): 39 = every card, 13 = weekly, 7 = every 2 weeks, 6 = twice a month, 3 = monthly, 1 = once per cycle.
How this user plans: they break a space into SMALL parts. For example "clean one shelf" in the kitchen is a single task. A task like that means rotating through the parts over time, so set "parts" to how many there are (6 shelves) and pick a frequency that covers them all about once or twice a cycle. Each task should be a specific action that takes roughly 5 to 15 minutes ("Clean one shelf", "Wipe the stove top", "Empty and wipe one drawer"). Prefer several small tasks over one big one. Group related tasks with a short "area" label (like "Pantry shelves").
What you know about this space: ${doc.notes || 'nothing yet'}.
Current plan (use these ids when changing or removing):
${idm}
How to talk: brief (1 to 3 short sentences), friendly, one question at a time. If you don't yet know what is in the space, ask about it before proposing anything. When you have enough, call propose_changes with a small, realistic set (3 to 6 tasks) and keep the total workload modest. Never change the plan silently: always propose, then wait for the user. Use quick_replies to offer 2 to 4 short tappable answers when a quick answer would help. Use save_notes to keep a concise summary of durable facts you learn (what is in the space, sizes, counts, preferences). Never mention tools, ids, JSON or "per_quarter" to the user; talk about "weekly", "every 2 weeks" and so on.`;
}
const AREA_PROPS = { name: { type: 'string', description: 'A short action, like "Clean one shelf".' }, per_quarter: { type: 'integer', enum: FREQS, description: '39 every card, 13 weekly, 7 every 2 weeks, 6 twice a month, 3 monthly, 1 once a cycle.' }, area: { type: 'string', description: 'Optional grouping label, like "Pantry shelves".' }, parts: { type: 'integer', description: 'If the task rotates through several similar parts (6 shelves), how many.' }, why: { type: 'string', description: 'One short reason or coverage note.' } };
function plannerTools(sp, tasks, out) {
  const idOf = (tid) => { const m = /^t(\d+)$/.exec(String(tid)); return m ? tasks[+m[1] - 1]?.id : null; };
  return [
    { name: 'propose_changes', description: 'Show the user a card with suggested plan changes they can accept or dismiss. Use for every change. After calling it, end your turn with one short sentence.',
      inputSchema: { type: 'object', properties: { summary: { type: 'string', description: 'One short line describing the suggestion.' }, adds: { type: 'array', items: { type: 'object', properties: AREA_PROPS, required: ['name', 'per_quarter'] } }, updates: { type: 'array', items: { type: 'object', properties: { task_id: { type: 'string' }, name: { type: 'string' }, per_quarter: AREA_PROPS.per_quarter, area: { type: 'string' } }, required: ['task_id'] } }, removes: { type: 'array', items: { type: 'string', description: 'task id like t2' } } }, required: ['summary'] },
      execute: (a) => {
        const adds = (a.adds || []).filter((x) => x && x.name).slice(0, 8).map((x) => ({ name: String(x.name).trim().slice(0, 80), per_quarter: normFreq(x.per_quarter), area: String(x.area || '').slice(0, 40), parts: Math.max(0, Math.round(Number(x.parts) || 0)), why: String(x.why || '').slice(0, 140) }));
        const updates = (a.updates || []).map((u) => ({ task_id: idOf(u.task_id), name: u.name ? String(u.name).slice(0, 80) : '', per_quarter: u.per_quarter ? normFreq(u.per_quarter) : 0, area: u.area != null ? String(u.area).slice(0, 40) : null })).filter((u) => u.task_id);
        const removes = (a.removes || []).map((t) => idOf(t)).filter(Boolean).map((id) => ({ task_id: id }));
        if (!adds.length && !updates.length && !removes.length) return 'Nothing to propose.';
        out.proposal = { summary: String(a.summary || '').slice(0, 160), adds, updates, removes, status: 'open' }; return 'The suggestion is now shown to the user as a card. Do not repeat it. Finish with one short sentence and stop.';
      } },
    { name: 'quick_replies', description: 'Offer 2 to 4 short tappable replies for the user (each under 40 characters).', inputSchema: { type: 'object', properties: { options: { type: 'array', items: { type: 'string' } } }, required: ['options'] }, execute: (a) => { out.replies = (a.options || []).map((x) => String(x).slice(0, 44)).slice(0, 4); return 'Shown.'; } },
    { name: 'save_notes', description: 'Save a concise summary of durable facts about this space (contents, counts, sizes, preferences). Replaces the previous notes.', inputSchema: { type: 'object', properties: { notes: { type: 'string' } }, required: ['notes'] }, execute: (a) => { out.notes = String(a.notes || '').slice(0, 800); return 'Saved.'; } },
  ];
}
async function sendRoom(sp, text) {
  text = String(text || '').trim(); if (!text || roomBusy || !sample) return;
  roomBusy = true; drafts[sp.key] = '';
  const doc = structuredClone(chatDoc(sp.key)); doc.messages.push({ role: 'user', content: text, ts: new Date().toISOString() }); S.chats = [...S.chats.filter((c) => c.id !== doc.id), doc];
  const tasks = planOf(sp), out = {}; roomCtl = new AbortController(); drawMessages(sp, { typing: true }); setBusy(true);
  saveChat(structuredClone(doc)).catch(() => {});
  const total = expandTasks().reduce((a, x) => a + Math.min(x.per_quarter, 39), 0);
  const turns = [{ role: 'user', content: plannerInstructions(sp, tasks, doc, total) }, ...doc.messages.slice(-24).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))];
  let live = '';
  try {
    const r = await sample(turns, { tools: limits.tools ? plannerTools(sp, tasks, out) : undefined, signal: roomCtl.signal, cache: false, modelTier: 'quick', onText: ({ text: t }) => { live = t; drawMessages(sp, { live }); } });
    doc.messages.push({ role: 'assistant', content: r.text, ts: new Date().toISOString(), ...(out.proposal ? { proposal: out.proposal } : {}), ...(out.replies ? { replies: out.replies } : {}) });
  } catch (e) {
    if (e.code === 'cancelled') { if (live) doc.messages.push({ role: 'assistant', content: live + ' (stopped)', ts: new Date().toISOString() }); }
    else { toast(errCopy(e)); doc.messages.push({ role: 'assistant', content: 'Sorry, I couldn’t answer that. Try again in a moment.', ts: new Date().toISOString(), error: true }); }
  }
  if (out.notes != null) doc.notes = out.notes;
  roomBusy = false; await saveChat(doc).catch((e) => toast(e.message));
  if (current === 'plan' && ui.sub === 'rooms' && PV && currentSpace().key === sp.key) { drawMessages(sp); setBusy(false); refreshPlanPane(sp); }
}
function setBusy(b) { const s = $('#c-send'), st = $('#c-stop'), ta = $('#c-in'); if (!s) return; s.hidden = b; st.hidden = !b; if (ta) ta.disabled = false; $('#ch-status') && ($('#ch-status').textContent = b ? 'typing…' : 'Room planner'); }
function proposalHtml(sp, m, idx) {
  const p = m.proposal; if (!p) return '';
  const f = (a) => `${freqName(a)}`;
  if (p.status !== 'open') return `<div class="prop done">${p.status === 'applied' ? `✓ ${[p.result.added && `Added ${p.result.added} task${p.result.added === 1 ? '' : 's'}`, p.result.changed && `Changed ${p.result.changed}`, p.result.removed && `Removed ${p.result.removed}`].filter(Boolean).join(' · ') || 'Applied'}` : 'Dismissed'}<span class="sub"> · ${esc(p.summary)}</span></div>`;
  const rows = [
    ...p.adds.map((a, i) => `<label class="pr"><input type="checkbox" data-k="adds" data-i="${i}" checked><span><b>${esc(a.name)}</b><small>${f(a.per_quarter)}${a.area ? ' · ' + esc(a.area) : ''}${a.parts ? ` · ${a.parts} to rotate through (each comes round about every ${Math.max(1, Math.round((13 * a.parts) / Math.max(1, a.per_quarter)))} weeks)` : ''}${a.why ? ` · ${esc(a.why)}` : ''}</small></span></label>`),
    ...p.updates.map((u, i) => { const c = S.chores.find((x) => x.id === u.task_id); return `<label class="pr"><input type="checkbox" data-k="updates" data-i="${i}" checked><span><b>Change: ${esc(c ? c.name : 'task')}</b><small>${u.name ? 'rename to “' + esc(u.name) + '” ' : ''}${u.per_quarter ? '· now ' + f(u.per_quarter) : ''}${u.area != null && u.area !== '' ? ' · area ' + esc(u.area) : ''}</small></span></label>`; }),
    ...p.removes.map((r, i) => { const c = S.chores.find((x) => x.id === r.task_id); return `<label class="pr"><input type="checkbox" data-k="removes" data-i="${i}" checked><span><b>Remove: ${esc(c ? c.name : 'task')}</b></span></label>`; }),
  ].join('');
  return `<div class="prop" data-prop="${idx}"><div class="prop-h">${esc(p.summary || 'Suggested changes')}</div>${rows}<div class="row" style="margin-top:8px"><button class="primary" data-apply="${idx}">Add to plan</button><button class="link" data-dismiss-prop="${idx}">Not now</button></div></div>`;
}
function greetingFor(sp) {
  const body = sp.kind === 'room' ? `Hi! Let’s plan the ${sp.name}. Tell me what’s in it, like how many shelves, drawers or big items, and I’ll help break it into small tasks.` : sp.kind === 'cat' ? `Hi! Let’s plan ${sp.name}. Tell me what’s involved and I’ll help turn it into small, regular tasks.` : 'Hi! This is for tasks that belong to the whole home, like decluttering or checking supplies. What would you like to keep on top of?';
  const chips = sp.kind === 'room' ? ['Suggest a simple starter plan', 'Break it into shelves and drawers', 'It’s small, keep it light'] : ['Suggest a simple starter plan', 'Break it into small parts'];
  return { body, chips };
}
function drawMessages(sp, { typing = false, live = '' } = {}) {
  const box = $('#cmsgs'); if (!box) return;
  const doc = chatDoc(sp.key), msgs = doc.messages.map((m, i) => ({ ...m, i })).filter((m) => !m.hidden), g = greetingFor(sp);
  const all = msgs.length ? msgs : [{ role: 'assistant', content: g.body, ts: new Date().toISOString(), greeting: true, i: -1 }];
  let html = '', lastDay = '';
  all.forEach((m, k) => {
    const mine = m.role === 'user', next = all[k + 1], lastInGroup = !next || next.role !== m.role, firstInGroup = !all[k - 1] || all[k - 1].role !== m.role, day = dayLabel(m.ts);
    if (day !== lastDay) { html += `<div class="csep">${day}</div>`; lastDay = day; }
    html += `<div class="crow ${mine ? 'me' : 'bot'}">${mine ? '' : lastInGroup && !typing ? `<span class="av sm" aria-hidden="true">${esc(sp.name[0].toUpperCase())}</span>` : '<span class="sp"></span>'}<div class="cb ${mine ? 'me' : 'bot'} ${firstInGroup ? 'f' : ''} ${lastInGroup ? 'l' : ''}">${esc(m.content)}</div></div>`;
    if (m.proposal) html += proposalHtml(sp, m, m.i);
    if (lastInGroup) html += `<div class="cmeta ${mine ? 'me' : ''}">${m.greeting ? '' : hhmm(m.ts)}</div>`;
  });
  if (typing || live) html += `<div class="crow bot"><span class="av sm" aria-hidden="true">${esc(sp.name[0].toUpperCase())}</span>${live ? `<div class="cb bot f l">${esc(live)}</div>` : '<div class="cb bot f l typing" aria-label="Typing"><i></i><i></i><i></i></div>'}</div>`;
  box.innerHTML = html;
  const last = msgs.length ? msgs[msgs.length - 1] : null, chips = $('#cchips');
  const opts = roomBusy ? [] : !msgs.length ? g.chips : last && last.role === 'assistant' && last.replies ? last.replies : [];
  chips.innerHTML = opts.map((o) => `<button data-reply="${esc(o)}">${esc(o)}</button>`).join('');
  box.scrollTop = box.scrollHeight;
}
function chatShell(sp) {
  return `<div class="chatbox"><div class="ch-h"><span class="av" aria-hidden="true">${esc(sp.name[0].toUpperCase())}</span><div class="grow"><div class="ch-t">${esc(sp.name)}</div><div class="sub" id="ch-status">Room planner</div></div><button class="link" id="c-clear">Clear chat</button></div>
    ${sample ? '' : '<div class="notice" style="margin:10px">Claude isn’t available in this view, so the planner chat is off. You can still add tasks by hand in the plan.</div>'}
    <div class="cmsgs" id="cmsgs" aria-live="polite"></div><div class="cchips" id="cchips"></div>
    <div class="composer"><textarea id="c-in" rows="1" placeholder="Message the planner" aria-label="Message" ${sample ? '' : 'disabled'}></textarea>
      <button class="send" id="c-send" aria-label="Send" ${sample ? '' : 'disabled'}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
      <button class="send stop" id="c-stop" aria-label="Stop" hidden><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg></button></div></div>`;
}
function planPane(sp) {
  const tasks = planOf(sp), doc = chatDoc(sp.key), groups = {};
  tasks.forEach((c) => (groups[c.area || ''] ||= []).push(c));
  const row = (c) => `<div class="plrow" data-id="${c.id}"><input data-f="name" value="${esc(c.name)}" aria-label="Task name"><select data-f="per_quarter" aria-label="How often">${(FREQS.includes(c.per_quarter) ? FREQS : [...FREQS, c.per_quarter]).map((n) => `<option value="${n}" ${n === c.per_quarter ? 'selected' : ''}>${freqName(n)}</option>`).join('')}</select><button class="link danger" data-del aria-label="Remove task">✕</button>
    ${c.parts || (c.scope === 'room' && (c.roomIds || []).length > 1) ? `<span class="sub plnote">${c.parts ? `${c.parts} to rotate through` : ''}${c.parts && (c.roomIds || []).length > 1 ? ' · ' : ''}${(c.roomIds || []).length > 1 ? 'shared with ' + esc((c.roomIds || []).filter((x) => x !== sp.id).map((x) => S.rooms.find((r) => r.id === x)?.name).filter(Boolean).join(', ')) : ''}</span>` : ''}</div>`;
  return `<div class="plan"><div class="row"><h2 class="grow" style="margin:0">${esc(sp.name)} plan</h2><span class="sub">${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${placementsOf(tasks)} a cycle</span></div>
    ${tasks.length ? Object.entries(groups).sort((a, b) => (a[0] || '~').localeCompare(b[0] || '~')).map(([area, cs]) => `${area ? `<div class="chart-title" style="margin:12px 0 2px">${esc(area)}</div>` : Object.keys(groups).length > 1 ? '<div class="chart-title" style="margin:12px 0 2px">Other</div>' : ''}${cs.map(row).join('')}`).join('') : '<div class="empty" style="padding:22px 0">Nothing planned yet. Chat with the planner, or add a task below.</div>'}
    <div class="plrow add"><input id="pl-new" placeholder="Add a task by hand" aria-label="New task"><select id="pl-freq" aria-label="How often">${FREQS.map((n) => `<option value="${n}" ${n === 13 ? 'selected' : ''}>${freqName(n)}</option>`).join('')}</select><button class="sec" id="pl-add">Add</button></div>
    <details style="margin-top:12px"><summary class="sub" style="cursor:pointer">What the planner knows about this ${sp.kind === 'room' ? 'room' : 'space'}</summary><textarea id="pl-notes" style="margin-top:8px" placeholder="Nothing yet. It fills in as you chat, and you can edit it.">${esc(doc.notes || '')}</textarea></details></div>`;
}
function refreshPlanPane(sp) { const pane = $('.ppane'); if (!pane) return; if (typeof drawPlanChrome === 'function') drawPlanChrome(); pane.innerHTML = planPane(sp); bindPlan(sp); const tabBtn = $('[data-pane=plan] .sub'); if (tabBtn) tabBtn.textContent = planOf(sp).length; const chip = $(`.spaces [data-space="${sp.key}"] small`); if (chip) chip.textContent = placementsOf(planOf(sp)); updateLoad(); }
function updateLoad() { const total = expandTasks().reduce((a, x) => a + Math.min(x.per_quarter, 39), 0), el = $('#loadline'); if (!el) return; $('b', el).textContent = total; const bar = $('i', el); bar.style.width = Math.min(100, (total / 195) * 100) + '%'; bar.style.background = total > 195 ? 'var(--fit)' : ''; $('#loadnote').textContent = total > 195 ? `${total - 195} over: some cards would need a 6th task.` : total < 117 ? 'Under 117 leaves some cards with fewer than 3 tasks.' : `Fits 3 to 5 per card (${195 - total} spare).`; }

function renderPlanRooms() {
  const list = spaceList(), sp = currentSpace(), total = expandTasks().reduce((a, x) => a + Math.min(x.per_quarter, 39), 0), rooms = activeRooms(), cats = activeCats(), recs = recommendations(expandTasks(), total);
  const where = (name) => expandTasks().filter((x) => x.room === name).length;
  PV.innerHTML = `${quickStartHtml()}${currentDeck() ? '<div class="hint">You already have a deck. Changes here apply to the <b>next</b> deck you deal. To change the cards you have already dealt, edit them in step 2.</div>' : ''}
    <div class="loadline" id="loadline"><div><b class="num">${total}</b> of 195 placements per cycle · <span id="loadnote"></span></div><div class="bar"><i></i></div></div>
    <div class="spaces" role="tablist" aria-label="Choose a room">${list.map((x) => `<button role="tab" data-space="${x.key}" aria-selected="${x.key === sp.key}" class="${x.key === sp.key ? 'on' : ''}">${esc(x.name)}<small>${placementsOf(planOf(x))}</small></button>`).join('')}<button data-addspace>＋ Add</button></div>
    <section class="planner"><div class="seg pl-seg"><button data-pane="chat" class="${ui.pane !== 'plan' ? 'on' : ''}">Chat</button><button data-pane="plan" class="${ui.pane === 'plan' ? 'on' : ''}">Plan <span class="sub">${planOf(sp).length}</span></button></div>
      <div class="pl-grid ${ui.pane === 'plan' ? 'show-plan' : 'show-chat'}"><div class="cpane">${chatShell(sp)}</div><aside class="ppane">${planPane(sp)}</aside></div></section>
    <details class="panel" id="sugg" ${recs.length ? '' : 'hidden'}><summary><h2 style="margin:0">Suggestions</h2><span class="sub">${recs.length}</span></summary>${recs.map((r) => `<div class="rec"><div class="grow"><div class="rec-t">${esc(r.title)}</div><div class="sub">${esc(r.why)}</div></div><div class="row" style="gap:4px">${r.apply ? `<button class="sec" data-rec="${r.id}">${esc(r.label || 'Apply')}</button>` : ''}<button class="link" data-recx="${r.id}">Dismiss</button></div></div>`).join('')}</details>
    <details class="panel" id="manage"><summary><h2 style="margin:0">Manage rooms and categories</h2></summary>
      <p class="sub" style="margin:8px 0 0">Each row is one room. Name it anything. The <b>type</b> only says what kind of space it is, so the planner knows what to suggest. Categories are for things that aren’t places, like Plants or Pets.</p>
      <div class="twocol" style="margin-top:10px"><div><h2 style="font-size:15px">Rooms</h2>${rooms.length ? '<div class="rrow rhead"><span>Room name</span><span>Type of space</span><span></span></div>' : ''}${rooms.map((r) => `<div class="rrow" data-rid="${r.id}"><input data-rf="name" value="${esc(r.name)}" aria-label="Room name"><select data-rf="type" aria-label="Type of space">${ROOM_TYPES.map((t) => `<option ${t === r.type ? 'selected' : ''}>${t}</option>`).join('')}</select><button class="link danger" data-rdel aria-label="Remove room">✕</button></div>`).join('')}
        <div class="rhead sub" style="margin-top:10px">Add a room</div><div class="rrow"><input id="new-room-name" placeholder="Name, like Guest bath" aria-label="New room name"><select id="new-room-type" aria-label="Type of space">${ROOM_TYPES.map((t) => `<option>${t}</option>`).join('')}</select><button class="sec" id="new-room">Add</button></div></div>
      <div><h2 style="font-size:15px">Categories</h2>${cats.map((g) => `<div class="rrow" data-gid="${g.id}"><input data-gf="name" value="${esc(g.name)}" aria-label="Category name"><button class="link danger" data-gdel aria-label="Remove category">✕</button></div>`).join('') || '<div class="sub">None yet.</div>'}
        <div class="rhead sub" style="margin-top:10px">Add a category</div><div class="rrow"><input id="new-cat-name" placeholder="Name, like Plants" aria-label="New category name"><button class="sec" id="new-cat">Add</button></div></div></div></details>`;
  updateLoad(); drawMessages(sp); const ta = $('#c-in'); if (ta && drafts[sp.key]) ta.value = drafts[sp.key]; if (roomBusy) setBusy(true);
  bindRooms(sp, recs); bindQuickStart();
}
function bindPlan(sp) {
  const pane = $('.ppane'); if (!pane) return;
  const upd = (id, patch) => { S.chores = S.chores.map((x) => (x.id === id ? { ...x, ...patch } : x)); return queue(() => col('chores').doc(id).update(patch)).catch((e) => toast(e.message)); };
  pane.querySelectorAll('.plrow[data-id]').forEach((row) => { const id = row.dataset.id;
    $('[data-f=name]', row).onchange = (e) => { const v = e.target.value.trim(); if (v) { upd(id, { name: v }); ensureCategory('home', v); } else e.target.value = S.chores.find((x) => x.id === id)?.name || ''; };
    $('[data-f=per_quarter]', row).onchange = (e) => upd(id, { per_quarter: +e.target.value }).then(() => { refreshPlanPane(sp); });
    $('[data-del]', row).onclick = async () => { const c = S.chores.find((x) => x.id === id), undo = await removeTaskFrom(sp, c); refreshPlanPane(sp); toastAction(`Removed “${c.name}”.`, 'Undo', async () => { await undo(); refreshPlanPane(sp); }); }; });
  $('#pl-add').onclick = async () => { const name = $('#pl-new').value.trim(); if (!name) return; await addTaskTo(sp, { name, per_quarter: +$('#pl-freq').value }); refreshPlanPane(sp); $('#pl-new')?.focus(); };
  $('#pl-new').onkeydown = (e) => { if (e.key === 'Enter') $('#pl-add').click(); };
  $('#pl-notes').onchange = async (e) => { const d = structuredClone(chatDoc(sp.key)); d.notes = e.target.value.slice(0, 800); await saveChat(d); toast('Saved'); };
}
function bindRooms(sp, recs) {
  const upd = (coll, id, patch) => queue(() => col(coll).doc(id).update(patch)).catch((e) => toast(e.message));
  const upLocal = (key, id, patch) => { S[key] = S[key].map((x) => (x.id === id ? { ...x, ...patch } : x)); };
  // choose a space, switch panes
  PV.querySelectorAll('[data-space]').forEach((b) => (b.onclick = () => { store.set('space', b.dataset.space); ui.pane = 'chat'; go('plan', { keep: true }); }));
  $('[data-addspace]').onclick = () => { const d = $('#manage'); d.open = true; d.scrollIntoView({ behavior: 'smooth' }); setTimeout(() => $('#new-room-name')?.focus(), 250); };
  PV.querySelectorAll('[data-pane]').forEach((b) => (b.onclick = () => { ui.pane = b.dataset.pane; $('.pl-grid').className = 'pl-grid ' + (ui.pane === 'plan' ? 'show-plan' : 'show-chat'); PV.querySelectorAll('[data-pane]').forEach((x) => x.classList.toggle('on', x === b)); if (ui.pane === 'chat') { const m = $('#cmsgs'); m.scrollTop = m.scrollHeight; } }));
  // chat
  const ta = $('#c-in'), send = () => { const t = ta.value; ta.value = ''; ta.style.height = ''; sendRoom(sp, t); };
  ta.addEventListener('input', () => { drafts[sp.key] = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  $('#c-send').onclick = send; $('#c-stop').onclick = () => roomCtl?.abort();
  $('#cchips').addEventListener('click', (e) => { const b = e.target.closest('[data-reply]'); if (b) sendRoom(sp, b.dataset.reply); });
  $('#cmsgs').addEventListener('click', async (e) => {
    const ap = e.target.closest('[data-apply]'), dm = e.target.closest('[data-dismiss-prop]');
    if (ap) { const idx = +ap.dataset.apply, box = ap.closest('.prop'), picks = { adds: [], updates: [], removes: [] }; box.querySelectorAll('input:checked').forEach((c) => picks[c.dataset.k].push(+c.dataset.i)); ap.disabled = true; try { await applyProposal(sp, idx, picks); drawMessages(sp); refreshPlanPane(sp); toast('Plan updated'); } catch (err) { toast(err.message); ap.disabled = false; } }
    if (dm) { await dismissProposal(sp, +dm.dataset.dismissProp); drawMessages(sp); }
  });
  $('#c-clear').onclick = () => confirmDialog('Clear this conversation? Your plan stays as it is.', async () => { const d = structuredClone(chatDoc(sp.key)); d.messages = []; await saveChat(d); drawMessages(sp); });
  bindPlan(sp);
  // manage rooms and categories
  PV.querySelectorAll('.rrow[data-rid]').forEach((row) => { const id = row.dataset.rid;
    $('[data-rf=name]', row).onchange = (e) => { const v = e.target.value.trim(); if (v) { upLocal('rooms', id, { name: v }); upd('rooms', id, { name: v }).then(() => go('plan', { keep: true })); } };
    $('[data-rf=type]', row).onchange = (e) => { upLocal('rooms', id, { type: e.target.value }); upd('rooms', id, { type: e.target.value }); };
    $('[data-rdel]', row).onclick = () => confirmDialog('Remove this room? Its tasks stop appearing on new cards. Existing decks keep their cards.', async () => { upLocal('rooms', id, { active: false }); await upd('rooms', id, { active: false }); go('plan', { keep: true }); }); });
  $('#new-room').onclick = async () => { const name = $('#new-room-name').value.trim(); if (!name) return; const ref = col('rooms').doc(), doc = { name, type: $('#new-room-type').value, active: true, order: S.rooms.length }; S.rooms = [...S.rooms, { id: ref.id, ...doc }]; await queue(() => ref.set(doc)); store.set('space', 'room:' + ref.id); ui.pane = 'chat'; go('plan'); };
  $('#new-room-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#new-room').click(); });
  PV.querySelectorAll('.rrow[data-gid]').forEach((row) => { const id = row.dataset.gid;
    $('[data-gf=name]', row).onchange = (e) => { const v = e.target.value.trim(); if (v) { upLocal('taskcats', id, { name: v }); upd('taskcats', id, { name: v }).then(() => go('plan', { keep: true })); } };
    $('[data-gdel]', row).onclick = () => confirmDialog('Remove this category? Its tasks stop appearing on new cards.', async () => { upLocal('taskcats', id, { active: false }); await upd('taskcats', id, { active: false }); go('plan', { keep: true }); }); });
  $('#new-cat').onclick = async () => { const name = $('#new-cat-name').value.trim(); if (!name) return; const ref = col('taskcats').doc(), doc = { name, active: true }; S.taskcats = [...S.taskcats, { id: ref.id, ...doc }]; await queue(() => ref.set(doc)); store.set('space', 'cat:' + ref.id); ui.pane = 'chat'; go('plan'); };
  $('#new-cat-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#new-cat').click(); });
  // suggestions
  PV.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = async () => { const r = recs.find((x) => x.id === b.dataset.rec); if (!r?.apply) return; b.disabled = true; try { await r.apply(); toast('Done'); go('plan', { keep: true }); } catch (e) { toast(e.message); b.disabled = false; } }));
  PV.querySelectorAll('[data-recx]').forEach((b) => (b.onclick = () => { let d = []; try { d = JSON.parse(store.get('recdis', '[]')); } catch {} store.set('recdis', JSON.stringify([...d, b.dataset.recx])); go('plan', { keep: true }); }));
}
