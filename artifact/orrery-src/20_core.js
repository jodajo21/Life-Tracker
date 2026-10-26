// ================================================================ helpers
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addDaysIso = (s, n) => ymd(addDays(parse(s), n));
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const today = () => ymd(new Date());
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
const COLORS = { fitness: 'var(--fit)', home: 'var(--home)' };
const GOALS = ['fitness', 'home'];


// ================================================================ game rules (pure)
const XP = { fitness: 15, home: 10, card_clear: 25, discovery: 10, comeback: 15 };
const LUCKY_P = 0.1, LUCKY_AMOUNTS = [10, 15, 20, 25, 40], MOMENTUM_MAX = 7, SHIELD_CAP = 3;
function levelFor(xp) { let level = 1, floor = 0; for (;;) { const need = 60 + 20 * (level - 1); if (xp < floor + need) return { level, into: xp - floor, need }; floor += need; level++; } }
function seasonOf(d) {
  const [y, m] = d.split('-').map(Number); const q = Math.floor((m - 1) / 3);
  return { id: `${y}-Q${q + 1}`, name: `${['Winter', 'Spring', 'Summer', 'Fall'][q]} ${y}`, start: `${y}-${pad(q * 3 + 1)}-01`, end: ymd(new Date(y, q * 3 + 3, 0)) };
}
function hashUnit(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return ((h >>> 0) % 1000003) / 1000003; }
function luckyRoll(r) { if (r >= LUCKY_P) return null; return { xp: LUCKY_AMOUNTS[Math.min(LUCKY_AMOUNTS.length - 1, Math.floor((r / LUCKY_P) * LUCKY_AMOUNTS.length))], label: 'Lucky drop' }; }
function momentum(active, shielded, t, skipSunday) {
  let m = 0, gap = 0;
  for (let i = 45; i >= 0; i--) {
    const d = addDaysIso(t, -i);
    if (active.has(d)) { m = Math.min(MOMENTUM_MAX, m + 1); gap = 0; continue; }
    if (d === t || shielded.has(d) || (skipSunday && parse(d).getDay() === 0)) continue;
    gap++; if (gap >= 2) m = Math.max(0, m - 1);
  }
  return m;
}
const shieldsAvailable = (activeDays, used) => Math.max(0, Math.min(SHIELD_CAP, Math.floor(activeDays / 7) - used));
function trophyFor(n) { const tiers = [[30, 'gold'], [15, 'silver'], [5, 'bronze']]; const hit = tiers.find(([k]) => n >= k); const next = [...tiers].reverse().find(([k]) => n < k); return { tier: hit ? hit[1] : null, next: next ? next[0] - n : 0 }; }

// ================================================================ card scheduler (pure)
const SEGMENTS = [['Mon', 'Tue'], ['Wed', 'Thu'], ['Fri', 'Sat']];
function nextMonday(iso) { const d = parse(iso); d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); return ymd(d); }
function buildQuarter(chores, startDate, opts = {}) {
  const weeks = 13, min = 3, soft = 5, max = 6, n = weeks * 3, monday0 = nextMonday(startDate), warnings = [];
  const load = Array.from({ length: n }, () => []);
  const has = (slot, c) => load[slot].some((x) => x.id === c.id);
  const boostRooms = new Set(opts.boostRooms || []), boosted = [];
  const active = chores.filter((c) => c.per_quarter > 0).map((c) => ({ ...c, eff: Math.min(c.per_quarter, n) }));
  let total = active.reduce((s, c) => s + c.eff, 0);
  for (const c of active) if (boostRooms.has(c.room) && c.per_quarter <= 12 && total + 1 <= n * max - 12) { c.eff++; total++; boosted.push(c.name); }
  if (total > n * max) warnings.push(`Too many tasks: ${total} placements but only ${n * max} spots. Lower some frequencies.`);
  if (total < n * min) warnings.push(`Not enough tasks: ${total} placements but cards need at least ${n * min}. Add chores or raise frequencies.`);
  const byFreq = new Map();
  for (const c of active) { if (!byFreq.has(c.eff)) byFreq.set(c.eff, []); byFreq.get(c.eff).push(c); }
  for (const f of [...byFreq.keys()].sort((a, b) => b - a)) {
    const group = byFreq.get(f).sort((a, b) => (boosted.includes(b.name) ? 1 : 0) - (boosted.includes(a.name) ? 1 : 0));
    const interval = n / f;
    group.forEach((chore, gi) => {
      const phase = (gi * interval) / group.length, used = [];
      for (let k = 0; k < f; k++) {
        const ideal = Math.min(n - 1, Math.floor(phase + k * interval + (f > 1 ? 0 : interval / 2 - 0.5)));
        const reach = Math.max(1, Math.floor(interval / 2));
        // Prefer cards that have fewer than 5 tasks; only use a 6th slot when no card has room.
        const search = (cap, bySeg) => {
          let best = -1, bestScore = Infinity;
          for (let d = 0; d <= n; d++) {
            for (const slot of d === 0 ? [ideal] : [ideal - d, ideal + d]) {
              if (slot < 0 || slot >= n || load[slot].length >= (bySeg ? Math.min(cap, (opts.softBySeg || [])[slot % 3] ?? cap) : cap) || has(slot, chore)) continue;
              const adjacent = used.some((u) => Math.abs(u - slot) <= 1) && f < n / 2 ? 3 : 0;
              const score = load[slot].length + d * 0.6 + adjacent;
              if (score < bestScore) { bestScore = score; best = slot; }
            }
            if (best >= 0 && d >= reach) break;
          }
          return best;
        };
        let best = search(soft, true); if (best < 0) best = search(soft); if (best < 0) best = search(max);
        if (best < 0) { warnings.push(`Could not place "${chore.name}" (card capacity full).`); continue; }
        load[best].push(chore); used.push(best);
      }
    });
  }
  const nearest = (chore, slot, ignore) => { let b = Infinity; load.forEach((l, i) => { if (i !== ignore && l.some((c) => c.id === chore.id)) b = Math.min(b, Math.abs(i - slot)); }); return b; };
  for (let guard = 0; guard < n * 10; guard++) {
    const lo = load.findIndex((l) => l.length < min); if (lo < 0) break;
    let donor = -1;
    for (let i = 0; i < n; i++) if (load[i].length > min && (donor < 0 || load[i].length > load[donor].length || (load[i].length === load[donor].length && Math.abs(i - lo) < Math.abs(donor - lo))) && load[i].some((c) => !has(lo, c) && c.eff < n)) donor = i;
    if (donor < 0) { warnings.push(`Card ${lo + 1} has fewer than ${min} tasks.`); break; }
    const movable = load[donor].filter((c) => !has(lo, c) && c.eff < n).sort((a, b) => a.eff - b.eff).sort((a, b) => nearest(load, b, lo, donor) - nearest(load, a, lo, donor));
    const pick = movable[0]; load[donor].splice(load[donor].indexOf(pick), 1); load[lo].push(pick);
  }
  const cards = load.map((chs, slot) => {
    const w = Math.floor(slot / 3), s = slot % 3, start = addDaysIso(monday0, w * 7 + s * 2);
    return { idx: slot, start_date: start, end_date: addDaysIso(start, 1), label: `${SEGMENTS[s][0]}–${SEGMENTS[s][1]}`,
      items: chs.slice().sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name)).map((c) => ({ chore_id: c.id, name: c.name, room: c.room })) };
  });
  const roomCoverage = {}; for (const c of cards) for (const i of c.items) roomCoverage[i.room] = (roomCoverage[i.room] || 0) + 1;
  return { cards, warnings, roomCoverage, startDate: monday0, boosted, total, softMax: soft, overBy: Math.max(0, total - n * soft), sixes: cards.filter((c) => c.items.length > soft).length };
}

// ================================================================ charts (SVG strings)
function bars(data, color, { height = 110, showEvery = 1 } = {}) {
  const W = 320, pad2 = 18, H = height, max = Math.max(1, ...data.map((d) => d.value)), bw = (W - 4) / Math.max(1, data.length);
  const out = data.map((d, i) => {
    const h = Math.round(((H - pad2 - 12) * d.value) / max), x = 2 + i * bw;
    return `<rect x="${x + bw * 0.12}" y="${H - pad2 - h}" width="${bw * 0.76}" height="${Math.max(h, d.value ? 2 : 0)}" rx="2" fill="${color}"><title>${esc(d.label)}: ${d.value}</title></rect>` +
      (d.value ? `<text x="${x + bw / 2}" y="${H - pad2 - h - 3}" text-anchor="middle">${d.value}</text>` : '') +
      (i % showEvery === 0 ? `<text x="${i === 0 ? x : i === data.length - 1 ? x + bw : x + bw / 2}" y="${H - 4}" text-anchor="${i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}">${esc(d.label)}</text>` : '');
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${out}<line x1="0" x2="${W}" y1="${H - pad2}" y2="${H - pad2}" stroke="var(--line)"/></svg>`;
}
function heatmap(counts, fromIso, toIso, color) {
  const start = parse(fromIso); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = parse(toIso), cell = 14, gap = 3, left = 14, weeks = Math.ceil((end - start) / 864e5 / 7) + 1, max = Math.max(1, ...Object.values(counts));
  let out = ''; ['M', '', 'W', '', 'F', '', ''].forEach((l, r) => { if (l) out += `<text x="0" y="${r * (cell + gap) + 11}">${l}</text>`; });
  for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) {
    const d = new Date(start); d.setDate(start.getDate() + w * 7 + r);
    if (d > end || d < parse(fromIso)) continue;
    const key = ymd(d), n = counts[key] || 0;
    out += `<rect x="${left + w * (cell + gap)}" y="${r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${n ? color : 'var(--heat)'}" fill-opacity="${n ? 0.3 + 0.7 * (n / max) : 1}"><title>${key}: ${n}</title></rect>`;
  }
  const W = left + weeks * (cell + gap), H = 7 * (cell + gap);
  return `<svg viewBox="0 0 ${W} ${H}" style="max-height:${Math.round(H * 1.6)}px" role="img">${out}</svg>`;
}
function hbars(items, color) {
  if (!items.length) return '';
  const max = Math.max(1, ...items.map((i) => i.of ?? i.value));
  return items.map((i) => `<div style="display:grid;grid-template-columns:110px 1fr 54px;gap:8px;align-items:center;margin:5px 0;font-size:13px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(i.label)}">${esc(i.label)}</span>
    <div style="background:var(--heat);border-radius:6px;height:12px;overflow:hidden"><div style="width:${(100 * i.value) / max}%;height:100%;background:${color}"></div></div><span class="sub" style="text-align:right">${i.of != null ? `${i.value}/${i.of}` : i.value}</span></div>`).join('');
}
function ring(frac, color, label) {
  const r = 34, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 90 90" style="width:92px"><circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--heat)" stroke-width="10"/><circle cx="45" cy="45" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * frac} ${c}" transform="rotate(-90 45 45)"/>
    <text x="45" y="49" text-anchor="middle" style="font:800 18px var(--display);fill:var(--ink)">${Math.round(frac * 100)}%</text>${label ? `<text x="45" y="62" text-anchor="middle" style="font-size:8px">${esc(label)}</text>` : ''}</svg>`;
}

// ================================================================ capabilities + data layer
const claudeRt = window.claude;
const db = claudeRt ? await claudeRt.use('db').catch(() => null) : null;
const sample = claudeRt ? await claudeRt.use('sample').catch(() => null) : null;
const downloads = claudeRt ? await claudeRt.use('downloads').catch(() => null) : null;
const limits = sample ? await sample.limits().catch(() => ({})) : {};
const R = { entries: [], cats: [], chores: [], chats: [], rooms: [], taskcats: [], decks: [], sets: [], shields: [], sugg: [], notes: [], inbox: [], settings: { fitness_weekly_target: 3 }, ready: {}, err: '' };
let S = R, PREVIEW = false;   // S is what the screens read: your real data, or an in-memory sample while previewing (nothing is written in preview)
let current = 'today', chatHistory = [], chatBusy = false;

let chain = Promise.resolve(); // one write at a time
const queue = (fn) => { if (PREVIEW) return Promise.resolve(); const p = chain.then(fn); chain = p.catch(() => {}); return p; };
const col = (n) => db.collection(n);
const sum = (rs) => rs.reduce((a, r) => a + r.xp, 0);

let rafId = 0, lastLocalDeckEdit = 0;
const schedule = () => { cancelAnimationFrame(rafId); rafId = requestAnimationFrame(() => { migrateLegacy(); migrateRooms(); processInbox(); refreshBadge(); if (shouldRerender()) go(current, { keep: true }); }); };
const editing = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#view') && a.type !== 'checkbox'; };
function listen(name, key) { return col(name).onSnapshot((snap) => { R[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); R.ready[key] = true; schedule(); }, (e) => { R.err = e.message || e.code; schedule(); }); }

// ---------------------------------------------------------------- derived state
const entriesOf = (g) => S.entries.filter((e) => e.goal === g);
const latestSet = () => S.sets.slice().sort((a, b) => b.n - a.n)[0] || null;
const weekMonday = (iso) => ymd(monday(parse(iso)));
const weekEnd = (card) => addDaysIso(weekMonday(card.start_date), 6); // the Sunday that ends the card's week
const isLocked = (card, t = today()) => t > weekEnd(card);              // cards close after that Sunday
function weekCards(t) {
  const set = latestSet(); if (!set) return null;
  const mon = weekMonday(t), cards = set.cards.filter((c) => weekMonday(c.start_date) === mon).sort((a, b) => a.idx - b.idx);
  return cards.length ? { set, cards } : null;
}
function currentCard(t) {
  const set = latestSet(); if (!set) return null;
  const card = set.cards.filter((c) => c.end_date >= t).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  return card ? { set, card } : null;
}
function seasonXp(domain, t) {
  const s = seasonOf(t), inS = (d) => d >= s.start && d <= s.end;
  let xp = entriesOf(domain).filter((e) => inS(e.date)).reduce((a, e) => a + (e.xp || 0), 0);
  if (domain === 'home') for (const set of S.sets) for (const c of set.cards) if (c.cleared && inS(c.cleared_date)) xp += XP.card_clear;
  return xp;
}
function domainSummary(domain, t) {
  const s = seasonOf(t), xp = seasonXp(domain, t), es = entriesOf(domain);
  const active = new Set(es.map((e) => e.date)), shielded = new Set(S.shields.filter((x) => x.domain === domain).map((x) => x.date));
  const used = S.shields.filter((x) => x.domain === domain).length;
  return { season: { ...s, xp, ...levelFor(xp) }, momentum: momentum(active, shielded, t, domain === 'home'), shields: { available: shieldsAvailable(active.size, used), protected_today: shielded.has(t) } };
}
function roomStats(t) {
  const set = latestSet(), planned = {};
  if (set) for (const c of set.cards) if (c.start_date <= t) for (const i of c.items) { const r = i.room || 'General'; planned[r] = planned[r] || { planned: 0, done: 0 }; planned[r].planned++; if (i.done) planned[r].done++; }
  const shards = {}; for (const st of S.sets) for (const c of st.cards) if (c.cleared) for (const r of new Set(c.items.map((i) => i.room || 'General'))) shards[r] = (shards[r] || 0) + 1;
  const names = [...new Set([...expandTasks().map((x) => x.room), ...Object.keys(planned), ...Object.keys(shards)])].sort();
  return names.map((room) => { const p = planned[room], n = shards[room] || 0, coverage = p && p.planned ? p.done / p.planned : 0; return { room, planned: p?.planned || 0, done: p?.done || 0, coverage, heat: coverage >= 0.7, shards: n, ...trophyFor(n) }; });
}
function weekActiveDays(t) { const from = ymd(monday(parse(t))); return new Set(entriesOf('fitness').filter((e) => e.date >= from && e.date <= t).map((e) => e.date)).size; }
function openItems(t) { const cc = currentCard(t); return cc && cc.card.start_date <= t ? cc.card.items.filter((i) => !i.done).length : 0; }

// ---------------------------------------------------------------- writes
function awardRewards({ goal, date, seed, newCat }) {
  const r = [{ kind: 'base', xp: XP[goal] || 10, label: 'Logged' }];
  const prev = entriesOf(goal).filter((e) => e.date < date).map((e) => e.date).sort().pop();
  if (prev && daysBetween(prev, date) >= 4 && !entriesOf(goal).some((e) => e.date === date && (e.rewards || []).some((x) => x.kind === 'comeback'))) r.push({ kind: 'comeback', xp: XP.comeback, label: 'Welcome back' });
  if (newCat) r.push({ kind: 'discovery', xp: XP.discovery, label: `New: ${newCat}` });
  const roll = luckyRoll(hashUnit(seed || uuid()));
  if (roll) r.push({ kind: 'lucky', xp: roll.xp, label: roll.label });
  return r;
}
async function addEntry(e) {
  const rewards = awardRewards(e), ref = e.id ? col('entries').doc(e.id) : col('entries').doc();
  const doc = { goal: e.goal, date: e.date, activity: e.activity, cat: e.cat || '', details: e.details || {}, raw: e.raw || '', source: e.source, rewards, xp: sum(rewards), created: new Date().toISOString() };
  S.entries = [...S.entries, { id: ref.id, ...doc }];
  await queue(() => ref.set(doc));
  return { id: ref.id, ...doc };
}
async function removeEntry(id) {
  S.entries = S.entries.filter((e) => e.id !== id);
  const set = S.sets.find((s) => s.cards.some((c) => c.items.some((i) => i.entry_id === id)));
  if (set) { const copy = structuredClone(set); for (const c of copy.cards) for (const i of c.items) if (i.entry_id === id) { i.done = false; i.done_at = null; i.entry_id = null; c.cleared = false; c.cleared_date = null; } S.sets = S.sets.map((s) => (s.id === set.id ? copy : s)); await queue(() => col('cardsets').doc(set.id).set(stripId(copy))); }
  await queue(() => col('entries').doc(id).delete());
}
const stripId = (o) => { const { id, ...rest } = o; return rest; };
async function pool(tasks, n = 8) { const it = tasks[Symbol.iterator](); await Promise.all(Array.from({ length: n }, async () => { for (const f of it) await f(); })); }

async function ensureCategory(goal, name) {
  const low = name.trim().toLowerCase();
  const hit = S.cats.find((c) => c.goal === goal && (c.name.toLowerCase() === low || (c.aliases || []).some((a) => a.toLowerCase() === low)));
  if (hit) return { cat: hit, created: false };
  const ref = col('categories').doc(), doc = { goal, name: name.trim(), aliases: [] };
  S.cats = [...S.cats, { id: ref.id, ...doc }];
  await queue(() => ref.set(doc));
  return { cat: { id: ref.id, ...doc }, created: true };
}
async function toggleItems(setId, cardCode, { check = [], uncheck = [] }) {
  const copy = structuredClone(S.sets.find((s) => s.id === setId));
  const card = copy.cards.find((c) => c.code === cardCode), t = today();
  if (isLocked(card, t)) throw new Error('That card is closed. Cards close after the Sunday of their week.');
  const date = t < card.start_date ? card.start_date : t > card.end_date ? card.end_date : t;
  const rewards = [];
  for (const id of check) {
    const it = card.items.find((i) => i.id === id); if (!it || it.done) continue;
    const { cat } = await ensureCategory('home', it.name);
    const e = await addEntry({ goal: 'home', date, activity: it.name, cat: cat.id, details: { card: card.code }, raw: `Card ${card.code}: ${it.name}`, source: 'card', seed: `card-item-${copy.n}-${id}` });
    it.done = true; it.done_at = date; it.entry_id = e.id; rewards.push(...e.rewards);
  }
  for (const id of uncheck) {
    const it = card.items.find((i) => i.id === id); if (!it || !it.done) continue;
    if (it.entry_id) await removeEntry2(it.entry_id);
    it.done = false; it.done_at = null; it.entry_id = null;
  }
  const all = card.items.every((i) => i.done);
  if (all && !card.cleared) { card.cleared = true; card.cleared_date = date; rewards.push({ kind: 'card_clear', xp: XP.card_clear, label: `Card ${card.code} cleared` }); }
  else if (!all) { card.cleared = false; card.cleared_date = null; }
  S.sets = S.sets.map((s) => (s.id === setId ? copy : s));
  await queue(() => col('cardsets').doc(setId).set(stripId(copy)));
  return rewards;
}
async function removeEntry2(id) { S.entries = S.entries.filter((e) => e.id !== id); await queue(() => col('entries').doc(id).delete()); }

async function mergeCategories(keepId, dropId) {
  const keep = S.cats.find((c) => c.id === keepId), drop = S.cats.find((c) => c.id === dropId);
  if (!keep || !drop || keep.goal !== drop.goal || keepId === dropId) throw new Error('Pick two categories from the same goal.');
  for (const e of S.entries.filter((x) => x.cat === dropId)) await queue(() => col('entries').doc(e.id).update({ cat: keepId, activity: keep.name }));
  const aliases = [...new Set([...(keep.aliases || []), ...(drop.aliases || []), drop.name])];
  await queue(() => col('categories').doc(keepId).update({ aliases }));
  await queue(() => col('categories').doc(dropId).delete());
  for (const s of S.sugg.filter((x) => x.a === dropId || x.b === dropId)) await queue(() => col('suggestions').doc(s.id).delete());
}

const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function openCardItemFor(cat, date) {
  const wk = weekCards(date); if (!wk) return null; const names = new Set([cat.name, ...(cat.aliases || [])].map(normName));
  const rank = (c) => (c.start_date <= date && date <= c.end_date ? 0 : c.end_date < date ? 1 + (date > c.end_date ? daysBetween(c.end_date, date) / 10 : 0) : 5);   // today's card first, then the ones before it, then the ones still to come
  for (const card of [...wk.cards].sort((a, b) => rank(a) - rank(b))) { if (isLocked(card, today())) continue; const item = card.items.find((i) => !i.done && names.has(normName(i.name))); if (item) return { set: wk.set, card, item }; }
  return null;
}
const allReady = () => PREVIEW || ['entries', 'cats', 'chores', 'sets', 'decks', 'rooms', 'taskcats', 'chats', 'shields', 'sugg', 'notes'].every((k) => R.ready[k]);
let loadGaveUp = false;
// ---------------------------------------------------------------- Claude: natural-language logging
const COPY = { not_granted: 'Claude access is off for this page. Allow it when prompted to log by text or photo.', rate_limited: 'Too many requests right now. Try again in a minute.', upstream_error: 'That request failed. Try again.', invalid_json: 'I couldn’t read that. Try rephrasing.', session_expired: 'Sign in to Claude again, then retry.' };
const errCopy = (e) => COPY[e?.code] || e?.message || 'Something went wrong.';

async function logText(text, source, dateHint) {
  if (!sample) throw new Error('Claude isn’t available in this view, so I can’t read the note.');
  const t = dateHint || today();
  const catList = S.cats.map((c) => `[${c.id}] ${c.goal}: ${c.name}${(c.aliases || []).length ? ` (aka ${c.aliases.join(', ')})` : ''}`).join('\n') || '(none yet)';
  const out = await sample.json(logPrompt(text, t, catList), { modelTier: 'quick', cache: false });
  return applyParsed(out, text, source, t);
}
const logPrompt = (text, t, catList) => `You turn a person's casual spoken/typed notes into structured log entries for a personal goals tracker.
Goals: "fitness" (workouts, runs, stretching, sports) and "home" (cleaning, chores, household tasks).
Today is ${t} (${parse(t).toLocaleDateString('en-US', { weekday: 'long' })}). Resolve "yesterday", "this morning", weekdays etc. to a YYYY-MM-DD date; default to today.
One entry per distinct activity (e.g. "bench and squats" = two entries). Put numbers in details: sets, reps, weight (lb), duration_min, distance_mi, notes, room.
Reuse an existing category whenever the activity is the same thing said differently ("jog" = "Running", "hoovered" = "Vacuum main floors"). Set best_match_id to that category's id and match_confidence 0-1 (>=0.8 certain it is the same; 0.5-0.8 probably; below 0.5 no real match). Use a short Title Case name for "activity" (the existing category name when matched).
Existing categories:
${catList}

Note: ${JSON.stringify(text)}

Reply with only JSON: {"entries":[{"goal":"fitness|home","date":"YYYY-MM-DD","activity":"Bench Press","best_match_id":null,"match_confidence":0,"details":{}}],"clarification":null}
Set "clarification" to a short question only if the note was too unclear to log.`;

// turn what Claude understood into saved entries. idBase makes the entry ids stable, so a note processed twice overwrites itself.
async function applyParsed(out, text, source, t, idBase) {
  const saved = [], pending = [];
  let n = 0;
  for (const e of out.entries || []) {
    if (!GOALS.includes(e.goal) || !e.activity) continue;
    const conf = Number(e.match_confidence) || 0, match = S.cats.find((c) => c.id === e.best_match_id && c.goal === e.goal);
    let cat, created = false;
    if (match && conf >= 0.8) {
      cat = match;
      const low = e.activity.toLowerCase();
      if (low !== match.name.toLowerCase() && !(match.aliases || []).some((a) => a.toLowerCase() === low)) {
        const aliases = [...(match.aliases || []), e.activity]; S.cats = S.cats.map((c) => (c.id === match.id ? { ...c, aliases } : c));
        await queue(() => col('categories').doc(match.id).update({ aliases }));
      }
    } else {
      const r = await ensureCategory(e.goal, e.activity); cat = r.cat; created = r.created;
      if (match && conf >= 0.5 && cat.id !== match.id && !S.sugg.some((s) => s.a === cat.id && s.b === match.id)) {
        const ref = col('suggestions').doc(), doc = { a: cat.id, b: match.id, a_name: cat.name, b_name: match.name, goal: e.goal, confidence: conf };
        S.sugg = [...S.sugg, { id: ref.id, ...doc }]; await queue(() => ref.set(doc)); pending.push({ a: cat.name, b: match.name });
      }
    }
    const date = /^\d{4}-\d\d-\d\d$/.test(e.date) ? e.date : t;
    if (e.goal === 'home') { const hit = openCardItemFor(cat, date); if (hit) { const rw = await toggleItems(hit.set.id, hit.card.code, { check: [hit.item.id] }); saved.push({ goal: 'home', activity: hit.item.name, rewards: rw, onCard: true }); continue; } }   // said it, and it is on this week's card: tick the card
    saved.push(await addEntry({ id: idBase ? `${idBase}_${n++}` : undefined, goal: e.goal, date, activity: cat.name, cat: cat.id, details: e.details || {}, raw: text, source, newCat: created ? cat.name : '' }));
  }
  return { saved, pending, clarification: out.clarification || null };
}

// notes that arrived while the app was closed (a Siri Shortcut posts them to the inbox, already understood): log them now
let inboxBusy = false;
async function processInbox() {
  if (PREVIEW || inboxBusy || !allReady()) return;
  const items = R.inbox.filter((x) => x.status === 'pending'); if (!items.length) return;
  inboxBusy = true;
  try {
    const said = [];
    for (const it of items) {
      try { const r = await applyParsed(it.parsed || { entries: [] }, it.text || '', 'siri', it.date || today(), `siri_${it.id}`); said.push(...r.saved.map((s) => s.activity)); } catch (e) { console.error(e); continue; }
      await queue(() => col('inbox').doc(it.id).delete()); R.inbox = R.inbox.filter((x) => x.id !== it.id);
    }
    if (said.length) { toast(`Logged from Siri: ${said.join(', ')}`); go(current, { keep: true }); }
  } finally { inboxBusy = false; }
}
// ---------------------------------------------------------------- Claude: photo of a card
async function resizeToBlob(file, max = 1600) {
  const bmp = await createImageBitmap(file), s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.85));
}
async function readCardPhoto(file) {                     // reads the photo and PROPOSES what is ticked; nothing is recorded until the caller applies it
  if (!sample || !limits.images) throw new Error('Reading photos isn’t available in this view.');
  const t = today(), set = latestSet(); if (!set) throw new Error('Start a cycle on the Cards tab first.');
  const cards = set.cards;
  const listing = cards.map((c) => `${c.code} (card ${c.idx + 1} of ${set.cards.length}, ${c.label}):\n` + c.items.map((i) => `  item ${i.id}: ${i.name}`).join('\n')).join('\n');
  const out = await sample.json(`These are photos of a printed 4x6 paper checklist card. Each card prints its place in the series like "07 / 39" in a corner (that is card C07), the day pair, and "Week N of 13", and 3-6 tasks each with a checkbox. A box counts as checked if it has a check, X, fill or scribble. Match the printed number to one of the known cards below (answer with its code, like C07) and report each of its items' state. If the code is unreadable, identify the card from the task list and say so with lower confidence. Be conservative: if a box is ambiguous give confidence below 0.7.
Known cards:
${listing}

Reply with only JSON: {"card_code":"C07"|null,"card_confidence":0.9,"items":[{"item_id":"4-0","checked":true,"confidence":0.95}],"notes":""}`, { images: [await resizeToBlob(file)], modelTier: 'default', cache: false });
  const card = cards.find((c) => c.code === out.card_code);
  if (card && isLocked(card, t)) return { card: null, notes: `That card belongs to the week of ${parse(weekMonday(card.start_date)).toLocaleDateString('en', { month: 'short', day: 'numeric' })}, which has closed. Cards close after Sunday.` };
  if (!card) return { card: null, notes: out.notes || 'I couldn’t tell which card that is. Try a closer, brighter photo.' };
  const proposal = card.items.map((i) => { const f = (out.items || []).find((x) => String(x.item_id) === i.id); return { item_id: i.id, name: i.name, was_done: !!i.done, checked: f ? !!f.checked : !!i.done, confidence: f ? Number(f.confidence) || 0 : 0 }; });
  const sure = out.card_confidence >= 0.85 && proposal.every((p) => p.confidence >= 0.8);
  return { card: { setId: set.id, code: card.code, idx: card.idx, label: card.label, n: set.n }, proposal, sure, notes: out.notes || '' };
}
