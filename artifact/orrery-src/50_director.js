// ================================================================ DIRECTOR: what the system has noticed, and how the picture re-forms to explain it
const pct = (v) => Math.round(v * 100);
const N0 = NOW_CARD, rm = (name) => roomIdx[name];
const INS = {};
// -- Friday erosion: first two cycles of the last six vs the most recent two
INS.fri = (() => {
  const a0 = N0 - 233, a1 = N0 - 156, b0 = N0 - 77, b1 = N0, seg2 = (x, c) => c.seg === 2;
  const r1 = rateIn(a0, a1, seg2).r, r2 = rateIn(b0, b1, seg2).r, others1 = rateIn(a0, a1, (x, c) => c.seg !== 2).r, others2 = rateIn(b0, b1, (x, c) => c.seg !== 2).r;
  const drops = ROOMS.map((r, i) => { const f = (x, c) => c.seg === 2 && x.t.ri === i, p = rateIn(b0, b1, f).p; return { i, name: r.name, drop: rateIn(a0, a1, f).r - rateIn(b0, b1, f).r, p }; }).filter((d) => d.p > 6).sort((x, y) => y.drop * y.p - x.drop * x.p);
  return { r1, r2, change: (r2 - r1) / r1, others: others2 - others1, drops, top: drops.slice(0, 2) };
})();
// -- Thursday planning: Fri–Sat completion on weeks that had a Thursday planning session vs those that did not
INS.plan = (() => { const f = (on) => rateIn(N0 - 233, N0, (x, c) => c.seg === 2 && PLANNED[c.w] === on).r; return { yes: f(true), no: f(false) }; })();
// -- Holiday: the last Thanksgiving, measured against the weeks before it
INS.hol = (() => {
  const h = [...HOLIDAYS].reverse().find((x) => x.name === 'Thanksgiving' && x.day < NOW_DAY - 10), c0 = dayToCard(h.day), at = (k) => rateIn(Math.round(c0 + (k * 3) / 7) - 1, Math.round(c0 + (k * 3) / 7) + 1).r;
  const base = rateIn(Math.round(c0 - 18), Math.round(c0 - 6)).r; let onset = -9, rec = 6;
  for (let k = -25; k <= 0; k++) if (at(k) < base - 0.14 && at(k + 2) < base - 0.1) { onset = k; break; }
  let low = 1, kLow = 0; for (let k = -10; k <= 8; k++) if (at(k) < low) { low = at(k); kLow = k; }
  for (let k = Math.max(1, kLow + 1); k <= 24; k++) if (at(k) >= base - 0.1 && at(k + 2) >= base - 0.1) { rec = k; break; }
  rec = Math.max(rec, 4);
  const nextH = HOLIDAYS.find((x) => x.name === 'Thanksgiving' && x.day > NOW_DAY);
  return { h, base, onset, rec, low, next: nextH, nextIn: nextH ? Math.round(nextH.day - NOW_DAY) : null };
})();
INS.pair = CORR[0];
INS.tasks = (() => { const w = windowStats(N0 - 90, N0), ts = TASKS.map((t, i) => ({ t, r: w.tasks[i].rate, p: w.tasks[i].p })).filter((x) => x.p >= 4); ts.sort((a, b) => a.r - b.r); return { worst: ts.slice(0, 3), best: ts.filter((x) => x.t.f >= 12).slice(-2).reverse() }; })();
INS.fcast = (() => { const d = INS.hol.next ? INS.hol.next.day : NOW_DAY + 30; const v = mean(ROWSETS.rooms.map((r) => sampleRowAt(r, d - 3, 2.2).v)); return { day: d, v }; })();

// -- choreography helpers
const dayWin = (a, b) => ({ a, b });
function stepsFor(id) {
  const D0 = NOW_DAY, I = INS;
  if (id === 'fri') return [
    { cap: 'Three rhythms, one week. Mon–Tue and Wed–Thu hold steady…', win: [D0 - 7 * 78, D0 + 14], rows: 'pairs', emph: [1, 1, 1], band: [D0 - 7 * 78 + 7 * 2, D0 - 7 * 78 + 7 * 28, 'Earlier'], },
    { cap: `…but Fri–Sat has slid ${Math.abs(Math.round(I.fri.change * 100))}% — from ${pct(I.fri.r1)}% to ${pct(I.fri.r2)}%.`, win: [D0 - 7 * 78, D0 + 14], rows: 'pairs', emph: [0.25, 0.25, 1], band: [D0 - 7 * 26, D0, 'Last 2 cycles'], callouts: [{ day: D0 - 7 * 8, row: 2, side: -1, color: 'ember', text: `Fri–Sat ${pct(I.fri.r2)}%`, sub: `was ${pct(I.fri.r1)}% two years ago` }] },
    { cap: 'The same story on the cards. Every lit bar is a task done — the bottom row, Fri–Sat, is where they go hollow.', mode: 1, segs: [0.3, 0.3, 1], emph: ROOMS.map(() => 1), win: [D0 - 7 * 26, D0 + 14], deckCy: CUR_CY - 1 },
    { cap: `Rooms break it down: ${I.fri.top.map((d) => d.name).join(' and ')} account for most of the loss.`, win: [D0 - 7 * 40, D0 + 14], rows: 'rooms', emph: ROOMS.map((r, i) => (I.fri.top.some((d) => d.i === i) ? 1 : 0.18)), band: [D0 - 7 * 26, D0, 'Fri–Sat only'], callouts: I.fri.top.map((d, k) => ({ day: D0 - 7 * (10 + k * 5), row: d.i, side: k ? 1 : -1, color: 'ember', text: d.name, sub: `−${Math.round(d.drop * 100)} pts on Fri–Sat` })) },
    { cap: `Weeks with a Thursday planning session finish Fri–Sat at ${pct(I.plan.yes)}%. Without: ${pct(I.plan.no)}%.`, win: [D0 - 7 * 52, D0 + 14], rows: 'pairs', emph: [0.25, 0.25, 1], plan: 1, band: [D0 - 7 * 52, D0, 'Planning marks, below'], links: planLinks(), },
    { cap: 'So the next move is small: protect Thursday afternoon. Forecast shows the effect.', win: [D0 - 7 * 26, D0 + 56], rows: 'pairs', emph: [0.4, 0.4, 1], plan: 1, fc: 1, band: [D0, D0 + 56, 'Next 8 weeks'] },
  ];
  if (id === 'hol') return [
    { cap: `${I.hol.h.name}. Look at the ground in the weeks around it.`, win: [I.hol.h.day - 56, I.hol.h.day + 42], rows: 'rooms', emph: ROOMS.map(() => 1), band: [I.hol.h.day - 56, I.hol.h.day + 42, 'The season'] },
    { cap: `Household routines start slipping ${Math.abs(I.hol.onset)} days before — down to ${pct(I.hol.low)}% from a ${pct(I.hol.base)}% norm.`, win: [I.hol.h.day - 42, I.hol.h.day + 28], rows: 'rooms', emph: ROOMS.map(() => 1), band: [I.hol.h.day + I.hol.onset, I.hol.h.day, 'Slipping'], callouts: [{ day: I.hol.h.day + I.hol.onset, fy: 0.25, side: -1, color: 'ember', text: `Onset −${Math.abs(I.hol.onset)}d`, sub: 'first rooms to dip' }] },
    { cap: `Recovery takes about ${I.hol.rec} days after. Same pattern repeated at Christmas.`, win: [I.hol.h.day - 28, I.hol.h.day + 42], rows: 'rooms', emph: ROOMS.map(() => 1), band: [I.hol.h.day, I.hol.h.day + I.hol.rec, 'Recovering'], callouts: [{ day: I.hol.h.day + I.hol.rec, fy: 0.3, side: 1, color: 'amber', text: `Back by +${I.hol.rec}d` }] },
    { cap: `Next one is ${I.hol.nextIn} days out — the forecast already shows it. A lighter card that week would hold the line.`, win: [NOW_DAY - 21, NOW_DAY + 56], rows: 'rooms', emph: ROOMS.map(() => 1), fc: 1, band: [I.hol.next.day - 9, I.hol.next.day + 6, 'Expected dip'] },
  ];
  if (id === 'pair') return [
    { cap: `${ROOMS[I.pair.a].name} and ${ROOMS[I.pair.b].name} rise and fall together. Teal outlines mark both.`, mode: 1, emph: ROOMS.map((r, i) => (i === I.pair.a || i === I.pair.b ? 1 : 0.25)), cLinks: [{ a: I.pair.a, b: I.pair.b, s: 1 }], deckCy: CUR_CY - 1 },
    { cap: 'When a card has one hollow, it usually has the other. Plan them as a single block.', mode: 1, emph: ROOMS.map((r, i) => (i === I.pair.a || i === I.pair.b ? 1 : 0.25)), cLinks: [{ a: I.pair.a, b: I.pair.b, s: 1 }], deckCy: CUR_CY },
  ];
  if (id === 'tasks') return [
    { cap: 'Every task on every card of the cycle. Hollow bars are what keeps getting missed.', mode: 1, emph: ROOMS.map(() => 1), deckCy: CUR_CY - 1 },
    { cap: `“${I.tasks.worst[0].t.name}” — done ${pct(I.tasks.worst[0].r)}% of the time this quarter. Teal marks every place it appears.`, mode: 1, emph: ROOMS.map((r, i) => (i === I.tasks.worst[0].t.ri ? 1 : 0.3)), task: I.tasks.worst[0].t.id, deckCy: CUR_CY - 1 },
  ];
  return [];
}
function planLinks() {
  const w1 = [], w0 = []; for (let w = WEEKS - 40; w < WEEKS - 1; w++) (PLANNED[w] ? w1 : w0).push(w);
  const pick = (arr, k) => arr.filter((w, i) => i % Math.ceil(arr.length / k) === 0).slice(0, k);
  return pick(w1, 3).map((w) => ({ a: { day: w * 7 + 3.5, row: 'plan' }, b: { day: w * 7 + 5, row: 2 } }));
}
const INSIGHTS = [
  { id: 'fri', tag: 'Pattern', title: `Friday–Saturday is slipping`, short: 'Fri–Sat completion', body: `Mon–Tue and Wed–Thu hold; Fri–Sat has lost ${Math.abs(Math.round(INS.fri.change * 100))}% over two years — mostly ${INS.fri.top.map((d) => d.name.toLowerCase()).join(' and ')}.`, conf: 0.86, hue: 'ember', get steps() { return stepsFor('fri'); } },
  { id: 'hol', tag: 'Seasonal', title: `Routines dip ${Math.abs(INS.hol.onset)} days before Thanksgiving`, short: 'Holiday dip', body: `Every year, household routines slip ${Math.abs(INS.hol.onset)} days ahead and return ${INS.hol.rec} days after. The next one is ${INS.hol.nextIn} days away.`, conf: 0.9, hue: 'copper', get steps() { return stepsFor('hol'); } },
  { id: 'plan', tag: 'Cause', title: 'Thursday planning protects the weekend', short: 'Planning effect', body: `Fri–Sat finishes at ${pct(INS.plan.yes)}% after a planning session, ${pct(INS.plan.no)}% without one.`, conf: 0.78, hue: 'verd', get steps() { return stepsFor('fri').slice(4); } },
  { id: 'pair', tag: 'Link', title: `${ROOMS[INS.pair.a].name} & ${ROOMS[INS.pair.b].name} move together`, short: 'Coupled rooms', body: `Their weekly completion rises and falls in step (r = ${INS.pair.r.toFixed(2)}). Two tasks, one habit.`, conf: 0.7, hue: 'verd', get steps() { return stepsFor('pair'); } },
  { id: 'tasks', tag: 'Friction', title: `“${INS.tasks.worst[0].t.name}” keeps getting missed`, short: 'Stubborn task', body: `${pct(INS.tasks.worst[0].r)}% this quarter — the one routine that resists you most.`, conf: 0.8, hue: 'ember', get steps() { return stepsFor('tasks'); } },
];

// ---- apply a step to a view state: the picture reforms; nothing jumps
const clearOld = (st) => { st.links.forEach((l) => l.p.to(0)); st.callouts.forEach((c) => c.a.to(0)); st.cLinks.forEach((l) => l.p.to(0)); st.marks.forEach((m) => m.a && m.a.to(0)); };
function applyStep(st, s) {
  clearOld(st);
  if (s.win) { st.t0.to(s.win[0]); st.t1.to(s.win[1]); }
  if (s.rows && s.rows !== st.rowsKind) { st.rowsKind = s.rows; }
  st.mode.to(s.mode || 0); st.plan.to(s.plan || 0); st.fc.to(s.fc ?? 0.55);
  const em = s.emph || ROOMS.map(() => 1), pairs = (s.rows || st.rowsKind) === 'pairs';
  if (pairs) { st.rowA.forEach((t, i) => t.to(i < 3 ? em[i] ?? 1 : 0)); st.cEmph.forEach((t) => t.to(1)); }
  else { st.rowA.forEach((t, i) => t.to(em[i] ?? 1)); st.cEmph.forEach((t, i) => t.to(em[i] ?? 1)); }
  const sg = s.segs || (pairs && s.emph ? em : [1, 1, 1]); st.segA.forEach((t, i) => t.to(sg[i] ?? 1));
  if (s.deckCy != null) setDeckCycle(st, s.deckCy); else if (s.mode) setDeckCycle(st, CUR_CY);
  st.hoverTask = s.task ?? null;
  if (s.band) { st.band.a.to(s.band[0]); st.band.b.to(s.band[1]); st.band.s.to(1); st.band.label = s.band[2] || ''; } else st.band.s.to(0);
  (s.links || []).forEach((l) => { const o = { ...l, p: new Tw(0, 2.5) }; o.p.to(1); st.links.push(o); });
  (s.callouts || []).forEach((c) => { const o = { ...c, a: new Tw(0, 3) }; o.a.to(1); st.callouts.push(o); });
  (s.cLinks || []).forEach((l) => { const o = { ...l, p: new Tw(0, 2.5) }; o.p.to(1); st.cLinks.push(o); });
  st.marks = [];
}
function resetView(st) { applyStep(st, { win: [NOW_DAY - 7 * 52, NOW_DAY + 7 * 6], rows: st.rowsKind, emph: ROOMS.map(() => 1), mode: st.mode.t, deckCy: st.deckCy }); st.band.s.to(0); }
const prune = (st) => { st.links = st.links.filter((l) => l.p.t > 0 || l.p.v > 0.02); st.callouts = st.callouts.filter((c) => c.a.t > 0 || c.a.v > 0.02); st.cLinks = st.cLinks.filter((l) => l.p.t > 0 || l.p.v > 0.02); };

// ---- Ask: answers are composed from the same computed facts the picture uses
function answerFor(q) {
  q = q.toLowerCase(); const m = (...w) => w.some((x) => q.includes(x));
  if (m('friday', 'fri', 'weekend', 'saturday')) return { id: 'fri', text: `Fri–Sat is the weak spot: ${pct(INS.fri.r2)}% now against ${pct(INS.fri.r1)}% two years ago, while Mon–Thu is only ${Math.abs(INS.fri.others * 100).toFixed(0)} pts ${INS.fri.others < 0 ? 'lower' : 'higher'}. ${INS.fri.top.map((d) => d.name).join(' and ')} carry most of it.` };
  if (m('thanks', 'holiday', 'christmas', 'season', 'november')) return { id: 'hol', text: `Holidays pull you under for about ${Math.abs(INS.hol.onset) + INS.hol.rec} days. Thanksgiving: down from ${pct(INS.hol.base)}% to ${pct(INS.hol.low)}%, starting ${Math.abs(INS.hol.onset)} days ahead. The next is ${INS.hol.nextIn} days away.` };
  if (m('plan', 'thursday', 'why', 'cause')) return { id: 'plan', text: `Thursday planning is the lever: Fri–Sat lands at ${pct(INS.plan.yes)}% when you plan, ${pct(INS.plan.no)}% when you don’t.` };
  if (m('miss', 'skip', 'hard', 'worst', 'task')) return { id: 'tasks', text: `Most missed this quarter: ${INS.tasks.worst.map((x) => `${x.t.name} (${pct(x.r)}%)`).join(', ')}.` };
  if (m('laundry', 'bed', 'together', 'link', 'connect', 'correl')) return { id: 'pair', text: `${ROOMS[INS.pair.a].name} and ${ROOMS[INS.pair.b].name} move together (r = ${INS.pair.r.toFixed(2)}) — a good pairing to batch.` };
  return { id: 'fri', text: `Overall ${pct(HEAD.completion)}% over the last four weeks, health ${HEAD.health}. The single biggest thing to look at: Fri–Sat completion.` };
}
