// ================================================================ MODEL: what the visuals see, derived from the real cycles on every change
const DAYMS = 864e5, CYC = 13, FC_WEEKS = 8, FC_CARDS = FC_WEEKS * 3;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = (t) => t * t * (3 - 2 * t);
function slope(a) { const n = a.length, mx = (n - 1) / 2, my = mean(a); let num = 0, den = 0; a.forEach((y, i) => { num += (i - mx) * (y - my); den += (i - mx) ** 2; }); return den ? num / den : 0; }
let START = parse(weekMonday(today())), NOW_DAY = 0.5, WEEKS = 13, NCARDS = 39, NOW_CARD = 0, PRIOR = 0.72;
let ROWSETS = { rooms: [], pairs: [] }, HOLIDAYS = [], HEAD = { state: 'empty' }, MODEL = { recs: [], fin: [] };
const dayIdx = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - START) / DAYMS);
const dateAt = (day) => addDays(START, Math.floor(day));
const dayToCard = (d) => (d / 7) * 3, cardToDay = (c) => (c / 3) * 7;
const isoToDay = (iso) => daysBetween(ymd(START), iso);
const MAJOR = { Thanksgiving: 2, Christmas: 2, "New Year's Day": 1, 'July 4th': 1, 'Memorial Day': 1, 'Labor Day': 1, Easter: 1 };

function sampleRow(row, x, sigma) {                                         // kernel-smoothed value, weight and instability at fractional card position x
  const k = Math.ceil(sigma * 3), i0 = Math.max(0, Math.floor(x) - k), i1 = Math.min(row.w.length - 1, Math.ceil(x) + k);
  let sw = 0, sv = 0, sv2 = 0;
  for (let i = i0; i <= i1; i++) { const wt = row.w[i]; if (!wt) continue; const kk = Math.exp(-(((i - x) / sigma) ** 2) / 2) * (row.fc && i >= NOW_CARD ? 0.5 : 1) * wt; sw += kk; sv += kk * row.v[i]; sv2 += kk * row.v[i] * row.v[i]; }
  if (sw < 0.02) return { v: 0, w: 0, u: 0 };
  const m = sv / sw, shrink = sw / (sw + 0.6);                               // thin evidence is pulled toward your own norm
  return { v: lerp(PRIOR, m, shrink), w: sw, u: clamp(Math.sqrt(Math.max(0, sv2 / sw - m * m)) / 0.34, 0, 1) };
}
const sampleRowAt = (row, day, sigma) => sampleRow(row, dayToCard(day), sigma);

function buildModel() {
  const t = today(), recs = cardRecords(), fin = recs.filter((r) => r.finished);
  const first = recs.length ? recs[0].weekStart : weekMonday(t);
  START = parse(first); const nowOff = daysBetween(first, t); NOW_DAY = nowOff + 0.5;
  WEEKS = Math.max(CYC, Math.floor(nowOff / 7) + 1); NCARDS = WEEKS * 3; NOW_CARD = Math.floor(nowOff / 7) * 3 + clamp(Math.floor((nowOff % 7) / 2), 0, 2);
  const total = NCARDS + FC_CARDS, gi = (r) => Math.floor(daysBetween(first, r.weekStart) / 7) * 3 + r.seg;
  const mk = (id, name) => ({ id, name, v: new Float32Array(total), w: new Float32Array(total), fc: false, p: 0, d: 0 });
  // rooms, busiest first; anything past ten is folded into one row so the landscape stays readable
  const byRoom = {}; for (const r of recs) for (const i of r.items) { const k = i.room || 'General'; byRoom[k] = (byRoom[k] || 0) + 1; }
  let names = Object.keys(byRoom).sort((a, b) => byRoom[b] - byRoom[a]); const roomRow = {};
  const keep = names.slice(0, names.length > 10 ? 9 : 10); if (names.length > 10) keep.push('Other');
  const rooms = keep.map((n, i) => { const row = mk('room' + i, n); row.i = i; return row; }); names.forEach((n) => { roomRow[n] = rooms[keep.indexOf(n) >= 0 ? keep.indexOf(n) : rooms.length - 1]; });
  const pairs = SEGNAME.map((n, i) => { const row = mk('seg' + i, n); row.i = i; return row; });
  for (const r of fin) { const g = gi(r); if (g < 0 || g >= NCARDS) continue; for (const i of r.items) { const rw = roomRow[i.room || 'General']; for (const row of [rw, pairs[r.seg]]) { if (!row) continue; row.w[g] += 1; row.v[g] += i.done ? 1 : 0; row.p++; if (i.done) row.d++; } } }
  for (const row of [...rooms, ...pairs]) for (let c = 0; c < NCARDS; c++) if (row.w[c]) row.v[c] /= row.w[c];
  const tp = fin.reduce((a, r) => a + r.planned, 0), td = fin.reduce((a, r) => a + r.done, 0); PRIOR = tp >= 12 ? clamp(td / tp, 0.35, 0.9) : 0.72;
  ROWSETS = { rooms, pairs };
  // holidays as landmarks on the ground
  HOLIDAYS = []; const y0 = START.getFullYear(), y1 = new Date().getFullYear() + 1;
  for (let y = y0; y <= y1; y++) for (const h of holidayList(y)) HOLIDAYS.push({ name: h.name, date: parse(h.date), day: isoToDay(h.date), rank: MAJOR[h.name] || 0 });
  HOLIDAYS.sort((a, b) => a.day - b.day);
  MODEL = { recs, fin, first, gi };
  HEAD = headline(fin, recs);
  buildForecast();
  MODEL.ins = computeInsights(fin).items; for (const k in MMC) delete MMC[k];
  return MODEL;
}
function weekRates(fin) { const m = {}; for (const r of fin) { const o = (m[r.weekStart] ||= { p: 0, d: 0 }); o.p += r.planned; o.d += r.done; } return Object.keys(m).sort().map((k) => ({ week: k, rate: m[k].p ? m[k].d / m[k].p : null, p: m[k].p })).filter((x) => x.rate != null); }
function headline(fin, recs) {
  const wr = weekRates(fin); if (!fin.length) return { state: 'empty', weeks: 0 };
  const last4 = wr.slice(-4), comp = last4.reduce((a, w) => a + w.rate * w.p, 0) / Math.max(1, last4.reduce((a, w) => a + w.p, 0));
  const w12 = wr.slice(-12).map((w) => w.rate), med = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; }, mad = (a) => med(a.map((x) => Math.abs(x - med(a)))) * 1.4826;
  const consistency = w12.length >= 4 ? clamp(1 - (0.5 * mad(w12) + 0.5 * stdev(w12)) / 0.24, 0, 1) : null;
  const w6 = wr.slice(-6).map((w) => w.rate), trend = w6.length >= 4 ? clamp(slope(w6) * 100, -9, 9) : null;
  const recent = fin.filter((r) => wr.slice(-8).some((w) => w.week === r.weekStart)), tk = {}; recent.forEach((r) => r.items.forEach((i) => { const o = (tk[i.name + '|' + (i.room || '')] ||= { name: i.name, room: i.room || 'General', p: 0, d: 0 }); o.p++; if (i.done) o.d++; }));
  const tasks = Object.values(tk).filter((x) => x.p >= 3), sticky = tasks.filter((x) => x.d / x.p < 0.6).sort((a, b) => a.d / a.p - b.d / b.p), stickShare = tasks.length ? sticky.length / tasks.length : 0;
  const health = Math.round(100 * (0.5 * comp + 0.2 * (consistency ?? comp) + 0.15 * clamp(0.5 + (trend ?? 0) / 8, 0, 1) + 0.15 * (1 - stickShare)));
  let run = 0; for (let i = fin.length - 1; i >= 0 && fin[i].done / fin[i].planned >= 0.6; i--) run++;
  let best = 0, cur = 0; for (const r of fin) { if (r.done / r.planned >= 0.6) { cur++; best = Math.max(best, cur); } else cur = 0; }
  return { state: wr.length < 2 ? 'early' : 'ok', weeks: wr.length, completion: comp, consistency, trend, sticky, health, run, best, spark: wr.slice(-14).map((w) => w.rate) };
}
function buildForecast() {                                                  // the same ridge continued: your recent level, a widening band, and last year's seasonal shape when you have a last year
  if (!fin_enough()) { for (const kind of ['rooms', 'pairs']) for (const row of ROWSETS[kind]) row.fc = false; return; }
  for (const kind of ['rooms', 'pairs']) for (const row of ROWSETS[kind]) {
    const tail = []; for (let c = Math.max(0, NOW_CARD - 24); c < NOW_CARD; c++) if (row.w[c]) tail.push(row.v[c]);
    const level = tail.length ? mean(tail) : PRIOR, sd = tail.length > 3 ? stdev(tail) : 0.12;
    const hasYr = NOW_CARD >= 156 + 12, lastYr = (c) => sampleRow({ ...row, fc: false }, c - 156, 2.2).v, ref = hasYr ? mean(Array.from({ length: 24 }, (_, i) => lastYr(NOW_CARD - 24 + i))) : 1;
    row.fc = true; row.band = new Float32Array(NCARDS + FC_CARDS);
    for (let c = NOW_CARD; c < NCARDS + FC_CARDS; c++) { const ratio = hasYr ? clamp(lastYr(c) / Math.max(0.3, ref), 0.5, 1.08) : 1, d = c - NOW_CARD; row.v[c] = clamp(level * ratio, 0.2, 0.99); row.w[c] = 1.2; row.band[c] = Math.min(0.22, Math.max(0.05, sd) * 0.9 * (1 + d / 18)); }
  }
}
const fin_enough = () => MODEL.fin.length >= 12;
