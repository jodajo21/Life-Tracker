// ================================================================ DATA: three years of sample household behavior, and the analysis on top of it
const DAY = 864e5;
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

const NOW = new Date();
const TODAY_D = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const WEEKS = 156, CYC = 13, NCARDS = WEEKS * 3, FC_WEEKS = 8, FC_CARDS = FC_WEEKS * 3;
const START = addD(mondayOf(TODAY_D), -(WEEKS - 1) * 7);
const dayIdx = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - START) / DAY);
const dateAt = (day) => addD(START, Math.floor(day));
const NOW_DAY = (NOW - START) / DAY;
const cardDay = (c) => Math.floor(c / 3) * 7 + (c % 3) * 2;               // first day of card c
const dayToCard = (d) => (d / 7) * 3;                                      // fractional card position
const cardToDay = (c) => (c / 3) * 7;
const NOW_CARD = Math.floor(NOW_DAY / 7) * 3 + Math.min(2, Math.floor(((NOW_DAY % 7)) / 2));
const SEGS = ['Mon–Tue', 'Wed–Thu', 'Fri–Sat'];

// ---- holidays (landmarks)
function nthWd(y, m, wd, n) { if (n > 0) { const off = (wd - new Date(y, m, 1).getDay() + 7) % 7; return new Date(y, m, 1 + off + 7 * (n - 1)); } const last = new Date(y, m + 1, 0); return new Date(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7)); }
function easterD(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451); return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1); }
const HOLIDAYS = [];
for (let y = START.getFullYear(); y <= NOW.getFullYear() + 1; y++) {
  [['New Year', new Date(y, 0, 1), 1, .16, 1.2], ['MLK Day', nthWd(y, 0, 1, 3), 0, .14, 1.2], ['Easter', easterD(y), 1, .2, 1.6], ['Memorial Day', nthWd(y, 4, 1, -1), 1, .22, 1.6], ['July 4th', new Date(y, 6, 4), 2, .32, 2.2], ['Labor Day', nthWd(y, 8, 1, 1), 0, .2, 1.4],
    ['Thanksgiving', nthWd(y, 10, 4, 4), 3, .55, 5], ['Christmas', new Date(y, 11, 25), 3, .5, 6]].forEach(([name, d, rank, depth, width]) => HOLIDAYS.push({ name, date: d, day: dayIdx(d), rank, depth, width }));
}
HOLIDAYS.sort((a, b) => a.day - b.day);

// ---- the household
const ROOMS = [
  { id: 'kitchen', name: 'Kitchen' }, { id: 'laundry', name: 'Laundry' }, { id: 'bath', name: 'Bathrooms' }, { id: 'bed', name: 'Bedrooms' },
  { id: 'living', name: 'Living room' }, { id: 'entry', name: 'Entry' }, { id: 'garage', name: 'Garage' }, { id: 'plants', name: 'Plants' },
];
const roomIdx = Object.fromEntries(ROOMS.map((r, i) => [r.id, i]));
const T = (room, name, f, effort, base) => ({ room, name, f, effort, base });
const TASKS = [
  T('kitchen', 'Kitchen reset', 39, 1, .95), T('kitchen', 'Wipe the stove top', 13, 1, .9), T('kitchen', 'Clean one shelf', 7, 2, .8), T('kitchen', 'Mop the floor', 6, 2, .82), T('kitchen', 'Wipe appliances', 3, 1, .8), T('kitchen', 'Clean fridge shelves', 3, 2, .7), T('kitchen', 'Clean the oven', 1, 3, .55),
  T('laundry', 'Wash a load', 13, 1, .9), T('laundry', 'Fold and put away', 7, 1, .82), T('laundry', 'Wash sheets', 6, 2, .76), T('laundry', 'Clean lint trap', 3, 1, .86), T('laundry', 'Wipe washer and dryer', 1, 1, .66),
  T('bath', 'Clean toilets', 13, 1, .9), T('bath', 'Scrub sink and counter', 7, 1, .86), T('bath', 'Clean the shower', 3, 3, .76), T('bath', 'Wipe mirrors', 3, 1, .82), T('bath', 'Wash bath mats', 3, 1, .72),
  T('bed', 'Change bedding', 6, 2, .8), T('bed', 'Vacuum floors', 6, 2, .78), T('bed', 'Dust surfaces', 3, 1, .7), T('bed', 'Declutter one surface', 3, 1, .66),
  T('living', 'Quick tidy', 7, 1, .92), T('living', 'Vacuum floors', 7, 2, .8), T('living', 'Dust surfaces', 3, 1, .68), T('living', 'Wipe electronics', 1, 1, .62),
  T('entry', 'Tidy shoes and coats', 6, 1, .84), T('entry', 'Sweep the entry', 3, 1, .76),
  T('garage', 'Sweep the floor', 1, 2, .6), T('garage', 'Tidy storage', 1, 2, .5), T('garage', 'Wash trash cans', 1, 2, .46),
  T('plants', 'Water the plants', 13, 1, .87), T('plants', 'Prune and rotate', 1, 1, .62),
].map((t, i) => ({ ...t, id: i, ri: roomIdx[t.room] }));

// one 39-card cycle: spread every task evenly, never more than five a card
function placeCycle() {
  const load = Array(39).fill(0), slots = Array.from({ length: 39 }, () => []);
  [...TASKS].sort((a, b) => b.f - a.f).forEach((t, ti) => {
    const phase = (ti * 0.37) % 1;
    for (let k = 0; k < t.f; k++) {
      const ideal = Math.floor(((k + phase) * 39) / t.f) % 39; let best = -1, bs = 1e9;
      for (let d = 0; d < 39; d++) { for (const s of d ? [ideal - d, ideal + d] : [ideal]) { const sl = ((s % 39) + 39) % 39; if (slots[sl].includes(t) || load[sl] >= 5) continue; const sc = load[sl] + d * 0.6; if (sc < bs) { bs = sc; best = sl; } } if (best >= 0 && d >= Math.max(1, Math.floor(39 / t.f / 2))) break; }
      if (best >= 0) { slots[best].push(t); load[best]++; }
    }
  });
  return slots;
}
const CYCLE_SLOTS = placeCycle();

// ---- the simulated behavior
const R = rng(20261019);
const PLANNED = Array.from({ length: WEEKS + 2 }, () => R() < 0.55);             // did a Thursday-afternoon planning session happen this week?
const SLUMP = new Set(); for (let y = 0; y < 3; y++) for (let k = 0; k < 3; k++) SLUMP.add(Math.min(WEEKS - 12, Math.floor(y * 52 + 4 + R() * 46)));  // never in the last few weeks
function holFactor(day) { let f = 1; for (const h of HOLIDAYS) { const d = day - h.day; if (d < -14 || d > 14) continue; const c = h.rank === 3 ? -3 : 0; f *= 1 - h.depth * Math.exp(-(((d - c) / h.width) ** 2)); } return f; }
function seasonF(date) { const m = date.getMonth(); return m >= 5 && m <= 7 ? 0.94 : m <= 1 ? 0.96 : 1; }
const HOUR = { kitchen: [8, 1.6, 19], laundry: [18, 2, 18], bath: [10, 2, 10], bed: [9.5, 2, 9.5], living: [17, 2, 17], entry: [17.5, 1, 17.5], garage: [11, 2, 11], plants: [7.5, 1, 7.5] };
const CARDS = [];
for (let c = 0; c < NCARDS; c++) CARDS.push({ c, w: Math.floor(c / 3), seg: c % 3, day: cardDay(c), tasks: [] });
for (let cy = 0; cy < WEEKS / CYC; cy++) CYCLE_SLOTS.forEach((ts, slot) => { const card = CARDS[cy * 39 + slot]; ts.forEach((t) => card.tasks.push({ t, done: false, hour: 0 })); });
const CR = rng(777), COUPLE = { laundry: 'A', bed: 'A', kitchen: 'B', plants: 'B' }, CZ = { A: Array.from({ length: WEEKS + 2 }, () => clamp(gauss(CR), -2, 2)), B: Array.from({ length: WEEKS + 2 }, () => clamp(gauss(CR), -2, 2)) };
const lateFri = (w) => clamp((w - (WEEKS - 78)) / 78, 0, 1);
function prob(t, card) {
  const { w, seg, day } = card, date = dateAt(day);
  let p = t.base * 1.04 * (0.92 + 0.1 * (w / (WEEKS - 1)));
  p *= [1.07, 1, 0.95][seg];
  if (seg === 2) { p *= 1 - 0.18 * lateFri(w) * (t.room === 'kitchen' || t.room === 'laundry' ? 1.45 : 0.55); p *= PLANNED[w] ? 1.15 : 0.96; }
  p *= holFactor(day) * seasonF(date) * (SLUMP.has(w) ? 0.4 : 1);
  if (COUPLE[t.room]) p *= 1 + (COUPLE[t.room] === 'A' ? 0.13 : 0.06) * CZ[COUPLE[t.room]][w];   // rooms that move together
  return clamp(p, 0.04, 0.985);
}
for (const card of CARDS) {
  const past = card.c < NOW_CARD;
  for (const x of card.tasks) {
    if (!past) { x.done = false; x.open = true; continue; }
    x.done = R() < prob(x.t, card);
    if (x.done) { const [m, sd, e] = HOUR[x.t.room]; x.hour = clamp(gauss(R) * sd + (R() < 0.35 ? e + 2 : m) + (card.seg === 2 ? 1.4 : 0), 5, 23.5); }
  }
  card.finished = past; card.planned = card.tasks.length; card.done = card.tasks.filter((x) => x.done).length;
}
const CURRENT = CARDS[NOW_CARD];

// ---- series: per row, per card, a value and a weight (how many tasks stand behind it)
function buildRows(kind) {
  const rows = kind === 'rooms' ? ROOMS.map((r, i) => ({ id: r.id, name: r.name, i })) : SEGS.map((n, i) => ({ id: 'seg' + i, name: n, i }));
  for (const row of rows) { row.v = new Float32Array(NCARDS + FC_CARDS); row.w = new Float32Array(NCARDS + FC_CARDS); row.fc = false; }
  for (const card of CARDS) { if (!card.finished) continue; for (const x of card.tasks) { const ri = kind === 'rooms' ? x.t.ri : card.seg, row = rows[ri]; row.w[card.c] += 1; row.v[card.c] += x.done ? 1 : 0; } }
  for (const row of rows) for (let c = 0; c < NCARDS; c++) if (row.w[c]) row.v[c] /= row.w[c];
  return rows;
}
const ROWSETS = { rooms: buildRows('rooms'), pairs: buildRows('pairs') };
const PRIOR = 0.72;
// kernel-smoothed value, weight and instability at fractional card position x
function sampleRow(row, x, sigma) {
  const k = Math.ceil(sigma * 3), i0 = Math.max(0, Math.floor(x) - k), i1 = Math.min(row.w.length - 1, Math.ceil(x) + k);
  let sw = 0, sv = 0, sv2 = 0;
  for (let i = i0; i <= i1; i++) { const wt = row.w[i]; if (!wt) continue; const kk = Math.exp(-(((i - x) / sigma) ** 2) / 2) * (row.fc && i >= NCARDS ? 0.5 : 1) * wt; sw += kk; sv += kk * row.v[i]; sv2 += kk * row.v[i] * row.v[i]; }
  if (sw < 1e-4) return { v: PRIOR, w: 0, u: 0 };
  const m = sv / sw, shrink = sw / (sw + 0.6);                               // thin evidence is pulled toward the household norm
  return { v: lerp(PRIOR, m, shrink), w: sw, u: clamp(Math.sqrt(Math.max(0, sv2 / sw - m * m)) / 0.34, 0, 1) };
}

// ---- headline numbers
const weeklyAll = [];
for (let w = 0; w < WEEKS; w++) { let p = 0, d = 0; for (let s = 0; s < 3; s++) { const c = CARDS[w * 3 + s]; if (c.finished) { p += c.planned; d += c.done; } } weeklyAll.push(p ? d / p : null); }
const lastFin = weeklyAll.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0).pop();
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
function slope(a) { const n = a.length, mx = (n - 1) / 2, my = mean(a); let num = 0, den = 0; a.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; }); return den ? num / den : 0; }
function rateIn(c0, c1, filter) { let p = 0, d = 0; for (let c = Math.max(0, c0); c <= Math.min(NCARDS - 1, c1); c++) { const card = CARDS[c]; if (!card.finished) continue; for (const x of card.tasks) { if (filter && !filter(x, card)) continue; p++; if (x.done) d++; } } return { p, d, r: p ? d / p : null }; }
function windowStats(c0, c1) {                                               // everything the constellation needs about a period
  const rooms = ROOMS.map(() => ({ p: 0, d: 0, weeks: {} })), tasks = TASKS.map(() => ({ p: 0, d: 0, run: 0, best: 0, miss: 0, seq: [] }));
  for (let c = Math.max(0, Math.floor(c0)); c <= Math.min(NCARDS - 1, Math.ceil(c1)); c++) { const card = CARDS[c]; if (!card.finished) continue; for (const x of card.tasks) { const rm = rooms[x.t.ri], tk = tasks[x.t.id]; rm.p++; tk.p++; (rm.weeks[card.w] ||= { p: 0, d: 0 }).p++; if (x.done) { rm.d++; tk.d++; rm.weeks[card.w].d++; tk.run++; tk.best = Math.max(tk.best, tk.run); } else tk.run = 0; tk.seq.push(x.done ? 1 : 0); } }
  rooms.forEach((rm) => { const wk = Object.keys(rm.weeks).sort((a, b) => a - b).map((k) => rm.weeks[k].d / rm.weeks[k].p); rm.rate = rm.p ? rm.d / rm.p : null; rm.sd = wk.length > 2 ? stdev(wk) : 0; rm.trend = wk.length > 3 ? slope(wk) : 0; });
  tasks.forEach((tk) => { tk.rate = tk.p ? tk.d / tk.p : null; tk.sd = tk.seq.length > 3 ? stdev(tk.seq) : 0; });
  return { rooms, tasks };
}
const L8 = (n) => Math.max(0, lastFin - n + 1);
const HEAD = (() => {
  const w4 = weeklyAll.slice(L8(4), lastFin + 1).filter((v) => v != null), w12 = weeklyAll.slice(L8(12), lastFin + 1).filter((v) => v != null), w6 = weeklyAll.slice(L8(6), lastFin + 1).filter((v) => v != null);
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }, mad = (a) => med(a.map((x) => Math.abs(x - med(a)))) * 1.4826;
  const completion = mean(w4), consistency = clamp(1 - (0.5 * mad(w12) + 0.5 * stdev(w12)) / 0.24, 0, 1), momentum = clamp(slope(w6) * 100, -9, 9);       // points per week; consistency is robust to one bad week
  const ws = windowStats(L8(8) * 3, lastFin * 3 + 2), fr = mean(ws.tasks.filter((t) => t.p >= 3).map((t, i) => (1 - t.rate) * (1 + TASKS[i].effort * 0.25))) || 0;
  const friction = clamp(fr / 0.95, 0, 1);
  const health = Math.round(100 * (0.5 * completion + 0.2 * consistency + 0.15 * clamp(0.5 + momentum / 8, 0, 1) + 0.15 * (1 - friction)));
  let streak = 0; for (let c = NOW_CARD - 1; c >= 0 && CARDS[c].finished && CARDS[c].done / CARDS[c].planned >= 0.6; c--) streak++;
  let best = 0, run = 0; for (const c of CARDS) { if (c.finished && c.done / c.planned >= 0.6) { run++; best = Math.max(best, run); } else if (c.finished) run = 0; }
  return { completion, consistency, momentum, friction, health, streak, best, spark: { completion: weeklyAll.slice(L8(14), lastFin + 1), consistency: weeklyAll.slice(L8(14), lastFin + 1).map((_, i, a) => clamp(1 - stdev(a.slice(Math.max(0, i - 4), i + 1)) / 0.2, 0, 1)), momentum: weeklyAll.slice(L8(14), lastFin + 1).map((_, i, a) => slope(a.slice(Math.max(0, i - 4), i + 1)) * 100), friction: weeklyAll.slice(L8(14), lastFin + 1).map((v) => 1 - v) } };
})();
// time-of-day: when things actually get done, recent six months vs the six before
const HOURS = (() => { const recent = Array(24).fill(0), prior = Array(24).fill(0); for (const card of CARDS) for (const x of card.tasks) if (x.done) { const h = Math.floor(x.hour); if (card.c >= NOW_CARD - 78) recent[h]++; else if (card.c >= NOW_CARD - 156) prior[h]++; } return { recent, prior }; })();

// ---- forecast: what the next weeks probably look like, from the recent level and what happened at this time last year
function buildForecast() {
  for (const kind of ['rooms', 'pairs']) for (const row of ROWSETS[kind]) {
    const tail = []; for (let c = NOW_CARD - 24; c < NOW_CARD; c++) if (row.w[c]) tail.push(row.v[c]);
    const level = tail.length ? mean(tail) : PRIOR, sd = tail.length > 3 ? stdev(tail) : 0.12;
    const lastYr = (c) => sampleRow(row, c - 156, 2.2).v, ref = mean(Array.from({ length: 24 }, (_, i) => lastYr(NOW_CARD - 24 + i)));
    row.fc = true; row.fcStart = NOW_CARD; row.band = new Float32Array(NCARDS + FC_CARDS);
    for (let c = NOW_CARD; c < NCARDS + FC_CARDS; c++) { const ratio = clamp(lastYr(c) / Math.max(0.3, ref), 0.5, 1.08), d = c - NOW_CARD; row.v[c] = clamp(level * ratio, 0.2, 0.99); row.w[c] = 1.2; row.band[c] = Math.min(0.22, sd * 0.9 * (1 + d / 18)); }
  }
}
