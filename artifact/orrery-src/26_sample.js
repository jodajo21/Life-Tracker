// ================================================================ SAMPLE: two years of made-up household behaviour, in memory only, for the read-only preview
function rngOf(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gaussOf = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
function makeSampleState() {
  const r = rngOf(20261019), t = today(), K = 8, WK = 8;                    // eight cycles; we are in week 9 of the newest one
  const rooms = ['Kitchen', 'Laundry', 'Bathrooms', 'Bedrooms', 'Living room', 'Entry', 'Garage'].map((name, i) => ({ id: 'r' + i, name, type: typeGuess(name), active: true, order: i }));
  const taskcats = [{ id: 'g0', name: 'Plants', active: true }], rid = Object.fromEntries(rooms.map((x) => [x.name, x.id]));
  const T = (room, name, f, base) => ({ room, name, f, base });
  const defs = [
    T('Kitchen', 'Kitchen reset', 39, .95), T('Kitchen', 'Wipe the stove top', 13, .9), T('Kitchen', 'Clean one shelf', 7, .8), T('Kitchen', 'Mop the floor', 6, .82), T('Kitchen', 'Wipe appliances', 3, .8), T('Kitchen', 'Clean fridge shelves', 3, .7), T('Kitchen', 'Clean the oven', 1, .5),
    T('Laundry', 'Wash a load', 13, .9), T('Laundry', 'Fold and put away', 7, .82), T('Laundry', 'Wash sheets', 6, .76), T('Laundry', 'Clean lint trap', 3, .86), T('Laundry', 'Wipe washer and dryer', 1, .6),
    T('Bathrooms', 'Clean toilets', 13, .9), T('Bathrooms', 'Scrub sink and counter', 7, .86), T('Bathrooms', 'Clean the shower', 3, .76), T('Bathrooms', 'Wipe mirrors', 3, .82), T('Bathrooms', 'Wash bath mats', 3, .72),
    T('Bedrooms', 'Change bedding', 6, .8), T('Bedrooms', 'Vacuum floors', 6, .78), T('Bedrooms', 'Dust surfaces', 3, .7), T('Bedrooms', 'Declutter one surface', 3, .66),
    T('Living room', 'Quick tidy', 7, .92), T('Living room', 'Vacuum floors', 7, .8), T('Living room', 'Dust surfaces', 3, .68), T('Living room', 'Wipe electronics', 1, .6),
    T('Entry', 'Tidy shoes and coats', 6, .84), T('Entry', 'Sweep the entry', 3, .76), T('Garage', 'Sweep the floor', 1, .55), T('Garage', 'Tidy storage', 1, .5), T('Garage', 'Wash trash cans', 1, .4),
    T('Plants', 'Water the plants', 13, .87), T('Plants', 'Prune and rotate', 1, .62),
  ];
  const chores = defs.map((d, i) => ({ id: 'c' + i, name: d.name, scope: d.room === 'Plants' ? 'category' : 'room', roomIds: d.room === 'Plants' ? [] : [rid[d.room]], catId: d.room === 'Plants' ? 'g0' : '', per_quarter: d.f, active: true, _base: d.base, _room: d.room }));
  const base = buildQuarter(chores.map((c) => ({ id: c.id, name: c.name, room: c._room, per_quarter: c.per_quarter })), '2000-01-03').cards;      // the same dealing the real app does
  const deck = { id: 'd1', n: 1, created: new Date().toISOString(), cards: base.map((c) => ({ idx: c.idx, code: `C${pad(c.idx + 1)}`, label: c.label, reviewed: true, items: c.items.map((i, p) => ({ id: `${c.idx}-${p}`, chore_id: i.chore_id, name: i.name, room: i.room })) })) };
  const m0 = ymd(monday(parse(t))), curStart = addDaysIso(m0, -7 * WK), baseOf = Object.fromEntries(chores.map((c) => [c.id, c._base]));
  const day0 = addDaysIso(curStart, -91 * (K - 1)), total = daysBetween(day0, t), slump = new Set();
  for (let y = 0; y < 3; y++) for (let k = 0; k < 3; k++) { const w = Math.floor(y * 52 + 4 + r() * 46); if (w < total / 7 - 10) slump.add(addDaysIso(day0, w * 7)); }
  const zA = {}, zB = {}; for (let w = 0; w < total / 7 + 2; w++) { const k = addDaysIso(day0, w * 7); zA[k] = clamp(gaussOf(r), -2, 2); zB[k] = clamp(gaussOf(r), -2, 2); }
  const holDip = (iso) => { let f = 1; const y = +iso.slice(0, 4); for (const yy of [y - 1, y, y + 1]) for (const h of holidayList(yy)) { const d = daysBetween(h.date, iso); if (d < -14 || d > 14) continue; const big = h.name === 'Thanksgiving' || h.name === 'Christmas', depth = big ? 0.5 : MAJOR[h.name] ? 0.15 : 0, width = big ? 5.5 : 1.3, c = big ? -3 : 0; if (depth) f *= 1 - depth * Math.exp(-(((d - c) / width) ** 2)); } return f; };
  const cats = [], catId = {}; const cat = (goal, name) => { const k = goal + name; if (!catId[k]) { catId[k] = 'k' + cats.length; cats.push({ id: catId[k], goal, name, aliases: [] }); } return catId[k]; };
  const entries = [], sets = []; let eid = 0;
  const prob = (it, card, dayIdx0, start) => {
    const prog = clamp(dayIdx0 / total, 0, 1), seg = card.idx % 3, wk = ymd(monday(parse(card.start_date))); let p = baseOf[it.chore_id] * 1.03 * (0.9 + 0.12 * prog);
    p *= [1.06, 1, 0.95][seg];
    if (seg === 2) p *= 1 - 0.2 * clamp((dayIdx0 - total * 0.45) / (total * 0.55), 0, 1) * (/kitchen|laundry/i.test(it.room) ? 1.45 : 0.55);
    p *= holDip(card.start_date) * (slump.has(wk) ? 0.4 : 1);
    if (/laundry|bedroom/i.test(it.room)) p *= 1 + 0.13 * (zA[wk] ?? 0); else if (/kitchen|plants/i.test(it.room)) p *= 1 + 0.06 * (zB[wk] ?? 0);
    return clamp(p, 0.04, 0.985);
  };
  for (let k = 0; k < K; k++) {
    const start = addDaysIso(curStart, -91 * (K - 1 - k)), cards = base.map((bc) => {
      const w = Math.floor(bc.idx / 3), seg = bc.idx % 3, st = addDaysIso(start, w * 7 + seg * 2), en = addDaysIso(st, 1), past = en < t, dayIdx0 = daysBetween(day0, st);
      const card = { code: `C${pad(bc.idx + 1)}`, idx: bc.idx, start_date: st, end_date: en, label: bc.label, cleared: false, cleared_date: null, items: [] };
      bc.items.forEach((it, p) => {
        const done = past && r() < prob(it, card, dayIdx0, start), date = done ? addDaysIso(st, r() < 0.7 ? 0 : 1) : null, item = { id: `${bc.idx}-${p}`, chore_id: it.chore_id, name: it.name, room: it.room, done, done_at: date, entry_id: null };
        if (done) { const e = { id: 'e' + eid++, goal: 'home', date, activity: it.name, cat: cat('home', it.name), details: { card: card.code }, raw: 'sample', source: 'card', rewards: [{ kind: 'base', xp: XP.home, label: 'Logged' }], xp: XP.home, created: date + 'T18:00:00Z', demo: true }; entries.push(e); item.entry_id = e.id; }
        card.items.push(item);
      });
      card.cleared = card.items.length > 0 && card.items.every((i) => i.done); card.cleared_date = card.cleared ? en : null; return card;
    });
    sets.push({ id: 's' + (k + 1), n: k + 1, deck: 'd1', demo: true, start_date: start, created: start + 'T08:00:00Z', cards });
  }
  const acts = ['Bench Press', 'Squat', 'Running', 'Yoga', 'Deadlift'], dayP = [0.2, 0.75, 0.3, 0.7, 0.25, 0.6, 0.3];
  for (let d = day0; d <= t; d = addDaysIso(d, 1)) { const wk = ymd(monday(parse(d))); if (r() > dayP[parse(d).getDay()] * (slump.has(wk) ? 0.3 : 1)) continue; const a = acts[Math.floor(r() * acts.length)]; entries.push({ id: 'e' + eid++, goal: 'fitness', date: d, activity: a, cat: cat('fitness', a), details: a === 'Running' ? { distance_mi: 2 + Math.floor(r() * 4) } : { sets: 4, reps: 8 }, raw: 'sample', source: 'text', rewards: [{ kind: 'base', xp: XP.fitness, label: 'Logged' }], xp: XP.fitness, created: d + 'T07:00:00Z', demo: true }); }
  return { entries, cats, chores, chats: [], rooms, taskcats, decks: [deck], sets, shields: [], sugg: [], notes: sampleNotes(sets, t), settings: { fitness_weekly_target: 3 }, ready: {}, err: '' };
}
function sampleNotes(sets, t) {
  const set = sets[sets.length - 1], cards = set.cards.filter((c) => c.end_date < t), pick = (i) => cards[Math.max(0, cards.length - 1 - i)], out = [];
  const add = (tag, text, c, item) => out.push({ id: 'n' + out.length, tag, text, date: c.end_date, status: 'open', created: c.end_date + 'T20:00:00Z', set_id: set.id, cycle: set.n, card_idx: c.idx, card_label: c.label, item_id: item ? item.id : null, item_name: item ? item.name : null, chore_id: item ? item.chore_id || null : null, room: item ? item.room || null : null });
  if (cards.length > 6) { const a = pick(1), b = pick(3), c = pick(5); add('deck', 'This is every week and it is too much. Every other week is plenty.', a, a.items[0]); add('note', 'Guests all weekend, so the kitchen got away from me.', b, null); add('idea', 'Let me snooze a task for a week without it counting as missed.', c, null); }
  return out;
}
