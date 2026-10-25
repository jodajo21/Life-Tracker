// ================================================================ Completion analytics (cards)
const SEGNAME = ['Mon–Tue', 'Wed–Thu', 'Fri–Sat'];
const pctS = (r) => (r == null ? '–' : Math.round(r * 100) + '%');
const fmtShort = (iso) => parse(iso).toLocaleDateString('en', { month: 'short', day: 'numeric' });
const fmtDay = (iso) => parse(iso).toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
function nthWeekday(y, m, wd, n) { if (n > 0) { const off = (wd - new Date(y, m, 1).getDay() + 7) % 7; return ymd(new Date(y, m, 1 + off + 7 * (n - 1))); } const last = new Date(y, m + 1, 0); return ymd(new Date(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7))); }
function easter(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1; return ymd(new Date(y, mo - 1, da)); }
function holidaysFor(y) {
  return [["New Year's Day", `${y}-01-01`], ['MLK Day', nthWeekday(y, 0, 1, 3)], ["Presidents' Day", nthWeekday(y, 1, 1, 3)], ['Easter', easter(y)], ['Memorial Day', nthWeekday(y, 4, 1, -1)], ['Juneteenth', `${y}-06-19`], ['July 4th', `${y}-07-04`], ['Labor Day', nthWeekday(y, 8, 1, 1)],
    ['Columbus Day', nthWeekday(y, 9, 1, 2)], ['Halloween', `${y}-10-31`], ['Thanksgiving', nthWeekday(y, 10, 4, 4)], ['Christmas Eve', `${y}-12-24`], ['Christmas', `${y}-12-25`], ["New Year's Eve", `${y}-12-31`]].map(([name, date]) => ({ name, date }));
}
const holidayList = (() => { const m = {}; return (y) => (m[y] ||= holidaysFor(y)); })();
function holidayNear(start, end) { // a holiday on the card's days or the day on either side
  const lo = addDaysIso(start, -1), hi = addDaysIso(end, 1);
  for (const y of new Set([+lo.slice(0, 4), +hi.slice(0, 4)])) for (const h of holidayList(y)) if (h.date >= lo && h.date <= hi) return h.name;
  return null;
}
/** One record per card of every cycle. `finished` = the card's two days are over. */
const isPreStart = (set, c) => !set.demo && !!set.created && c.end_date < set.created.slice(0, 10);
function cardRecords() {
  const t = today(), out = [];
  for (const set of S.sets) for (const c of set.cards) {
    if (!c.items.length) continue;
    if (isPreStart(set, c)) continue;                                           // cards that ended before the cycle was started are not misses
    out.push({ cycle: set.n, demo: !!set.demo, idx: c.idx, seg: c.idx % 3, start: c.start_date, end: c.end_date, weekStart: weekMonday(c.start_date), planned: c.items.length, done: c.items.filter((i) => i.done).length, finished: c.end_date < t, items: c.items, holiday: holidayNear(c.start_date, c.end_date) });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
const rateOf = (rs) => { const planned = rs.reduce((a, r) => a + r.planned, 0), done = rs.reduce((a, r) => a + r.done, 0); return { planned, done, rate: planned ? done / planned : null, cards: rs.length }; };
function completionRates() {
  const fin = cardRecords().filter((r) => r.finished), t = today(), mon = weekMonday(t), prevMon = addDaysIso(mon, -7), ym = t.slice(0, 7), prevYm = ymd(new Date(+t.slice(0, 4), +t.slice(5, 7) - 2, 1)).slice(0, 7);
  return {
    fin,
    week: rateOf(fin.filter((r) => r.weekStart === mon)), lastWeek: rateOf(fin.filter((r) => r.weekStart === prevMon)),
    month: rateOf(fin.filter((r) => r.start.slice(0, 7) === ym)), lastMonth: rateOf(fin.filter((r) => r.start.slice(0, 7) === prevYm)),
    ytd: rateOf(fin.filter((r) => r.start.slice(0, 4) === t.slice(0, 4))), life: rateOf(fin),
  };
}
function computeInsights(fin) {
  const tot = rateOf(fin), out = [], add = (score, i) => out.push({ score, ...i });
  if (tot.planned < 20) return { tot, items: [] };
  // 1. weakest day pair
  const segs = [0, 1, 2].map((s) => ({ s, ...rateOf(fin.filter((r) => r.seg === s)) })).filter((x) => x.planned >= 12);
  if (segs.length > 1) { const w = segs.reduce((a, b) => (b.rate < a.rate ? b : a)), b = segs.reduce((a, c) => (c.rate > a.rate ? c : a)), gap = b.rate - w.rate;
    if (gap >= 0.08) add(gap + 0.15, { kind: 'seg', seg: w.s, best: b.s, rate: w.rate, overall: tot.rate, title: `You miss ${SEGNAME[w.s]} cards more than any others`, detail: `${pctS(w.rate)} of their tasks get done, against ${pctS(tot.rate)} overall. ${SEGNAME[b.s]} is your strongest at ${pctS(b.rate)}.`, bars: segs.map((x) => ({ label: SEGNAME[x.s], v: x.rate })) }); }
  // 2. holidays
  const near = fin.filter((r) => r.holiday), far = fin.filter((r) => !r.holiday), nr = rateOf(near), fr = rateOf(far);
  if (near.length >= 3 && nr.planned >= 10 && fr.rate - nr.rate >= 0.08) {
    const by = {}; near.forEach((r) => (by[r.holiday] ||= []).push(r));
    const worst = Object.entries(by).map(([name, rs]) => ({ name, ...rateOf(rs) })).filter((x) => x.rate < fr.rate).sort((a, b) => a.rate - b.rate).slice(0, 3);
    add(fr.rate - nr.rate + 0.12, { kind: 'holiday', worst: worst.map((x) => x.name), near: nr.rate, far: fr.rate, title: 'Tasks slip around holidays', detail: `Cards on or next to a holiday are ${pctS(nr.rate)} done, against ${pctS(fr.rate)} on other days.${worst.length ? ` Hardest hit: ${worst.map((x) => `${x.name} (${pctS(x.rate)})`).join(', ')}.` : ''}`, bars: [{ label: 'Near a holiday', v: nr.rate }, { label: 'Other days', v: fr.rate }] });
  }
  // 3. weakest room
  const rooms = {}; fin.forEach((r) => r.items.forEach((i) => { const k = i.room || 'General'; (rooms[k] ||= { planned: 0, done: 0 }).planned++; if (i.done) rooms[k].done++; }));
  const rl = Object.entries(rooms).filter(([, v]) => v.planned >= 12).map(([name, v]) => ({ name, rate: v.done / v.planned, ...v })).sort((a, b) => a.rate - b.rate);
  if (rl.length > 2 && tot.rate - rl[0].rate >= 0.1) add(tot.rate - rl[0].rate + 0.05, { kind: 'room', room: rl[0].name, rate: rl[0].rate, overall: tot.rate, title: `${rl[0].name} gets the least attention`, detail: `${rl[0].done} of ${rl[0].planned} tasks done (${pctS(rl[0].rate)}), against ${pctS(tot.rate)} overall.`, bars: rl.slice(0, 3).map((x) => ({ label: x.name, v: x.rate })) });
  // 4. most-skipped tasks
  const tasks = {}; fin.forEach((r) => r.items.forEach((i) => { (tasks[i.name] ||= { planned: 0, done: 0 }).planned++; if (i.done) tasks[i.name].done++; }));
  const skipped = Object.entries(tasks).filter(([, v]) => v.planned >= 3 && v.done / v.planned <= 0.5).map(([name, v]) => ({ name, ...v, rate: v.done / v.planned })).sort((a, b) => a.rate - b.rate || b.planned - a.planned).slice(0, 4);
  if (skipped.length) add(0.1 + (0.5 - skipped[0].rate) * 0.3, { kind: 'skipped', tasks: skipped.map((x) => x.name), title: 'Tasks that often get skipped', detail: skipped.map((x) => `${x.name}: ${x.done} of ${x.planned}`).join(' · ') });
  // 5. recent trend (last 4 finished weeks vs the 4 before)
  const weeks = [...new Set(fin.map((r) => r.weekStart))].sort(), last = weeks.slice(-4), prev = weeks.slice(-8, -4);
  if (last.length === 4 && prev.length === 4) { const a = rateOf(fin.filter((r) => last.includes(r.weekStart))), b = rateOf(fin.filter((r) => prev.includes(r.weekStart))), d = a.rate - b.rate;
    if (Math.abs(d) >= 0.05) add(Math.abs(d) + 0.1, { kind: 'trend', up: d > 0, from: prev[0], to: last[last.length - 1], title: d > 0 ? 'You’re on an upswing' : 'Your last month dipped', detail: `The last 4 weeks are ${pctS(a.rate)} done, ${d > 0 ? 'up' : 'down'} ${Math.round(Math.abs(d) * 100)} points from the 4 weeks before (${pctS(b.rate)}).` }); }
  // 6. late in the month
  const late = fin.filter((r) => +r.start.slice(8) >= 22), early = fin.filter((r) => +r.start.slice(8) < 22), lr = rateOf(late), er = rateOf(early);
  if (lr.planned >= 15 && er.rate - lr.rate >= 0.08) add(er.rate - lr.rate + 0.02, { kind: 'late', title: 'The end of the month is harder', detail: `Cards from the 22nd on are ${pctS(lr.rate)} done, against ${pctS(er.rate)} earlier in the month.` });
  // 7. workout days vs card completion
  const wdays = new Set(entriesOf('fitness').map((e) => e.date));
  const withW = fin.filter((r) => { for (let d = r.start; d <= r.end; d = addDaysIso(d, 1)) if (wdays.has(d)) return true; return false; }), noW = fin.filter((r) => !withW.includes(r)), a = rateOf(withW), b = rateOf(noW);
  if (a.planned >= 15 && b.planned >= 15 && Math.abs(a.rate - b.rate) >= 0.08) add(Math.abs(a.rate - b.rate) + 0.03, { kind: 'workout', title: a.rate > b.rate ? 'Workout days are good home days too' : 'Workout days cost you home tasks', detail: `Cards that overlap a workout are ${pctS(a.rate)} done, against ${pctS(b.rate)} when there was no workout.` });
  // 8. best run of fully cleared cards
  let best = { n: 0 }, run = null; for (const r of fin) { if (r.done === r.planned) { run = run ? { ...run, n: run.n + 1, to: r.end } : { n: 1, from: r.start, to: r.end }; if (run.n > best.n) best = run; } else run = null; }
  if (best.n >= 3) add(0.2 + best.n * 0.01, { kind: 'sweep', run: best, title: `Your longest clean sweep is ${best.n} cards in a row`, detail: `Every task on ${best.n} straight cards, ${fmtShort(best.from)} to ${fmtShort(best.to)}.` });
  // 9. recovery after a weak card
  const rc = recoveryStats(fin);
  if (rc.afterWeak >= 5) add(Math.abs(rc.bounce - 0.5) * 1.0 + 0.12, rc.bounce >= 0.5 ? { kind: 'recovery', title: `You bounce back after a bad card ${pctS(rc.bounce)} of the time`, detail: `After a card under 50% done, the next one is 80%+ in ${rc.strong} of ${rc.afterWeak} cases. It usually takes ${rc.median ?? '–'} card${rc.median === 1 ? '' : 's'} to get fully back.` } : { kind: 'recovery', title: 'A weak card is often followed by another', detail: `After a card under 50% done, the next one is weak again ${pctS(rc.again)} of the time (${rc.weak} of ${rc.afterWeak}). Your longest slump is ${rc.longest} cards.` });
  // 10. two rooms that rise and fall together (weekly completion, with the household's overall swing taken out)
  const cp = coupledRooms(fin); if (cp && cp.r >= 0.5) add(0.12 + (cp.r - 0.5) * 0.4, { kind: 'pair', a: cp.a, b: cp.b, r: cp.r, title: `${cp.a} and ${cp.b} move together`, detail: `Their weekly completion rises and falls in step (r = ${cp.r.toFixed(2)} over ${cp.weeks} weeks). When one slips, the other usually does too, so plan them as a single block.` });
  const strength = tot.planned >= 400 ? 'Strong evidence' : tot.planned >= 150 ? 'Fairly clear' : 'Early hint';
  return { tot, items: out.sort((x, y) => y.score - x.score).slice(0, 7).map((x, i) => ({ id: x.kind + ':' + i, strength, ...x })) };
}
/** Recovery: what happens after a weak card (under 50% of its tasks done). Strong = 80% or more. */
function recoveryStats(fin) {
  const rate = (r) => r.done / r.planned; let afterWeak = 0, strong = 0, mid = 0, weak = 0, longest = 0, run = 0; const lens = [];
  for (let i = 0; i < fin.length; i++) {
    const w = rate(fin[i]) < 0.5; run = w ? run + 1 : 0; longest = Math.max(longest, run);
    if (w && fin[i + 1]) { afterWeak++; const nx = rate(fin[i + 1]); if (nx >= 0.8) strong++; else if (nx < 0.5) weak++; else mid++; }
    if (w && (i === 0 || rate(fin[i - 1]) >= 0.5)) { let k = 0; while (fin[i + k] && rate(fin[i + k]) < 0.8 && k < 12) k++; if (fin[i + k]) lens.push(k); }
  }
  lens.sort((a, b) => a - b);
  return { afterWeak, strong, mid, weak, bounce: afterWeak ? strong / afterWeak : null, again: afterWeak ? weak / afterWeak : null, median: lens.length ? lens[Math.floor(lens.length / 2)] : null, longest, slumps: lens.length };
}
function recoveryHtml(fin) {
  const r = recoveryStats(fin);
  if (r.afterWeak < 3) return `<section class="panel"><h2>Recovery</h2><div class="empty">Recovery needs a few weak cards (under 50% done) to measure. That's a good problem to have.</div></section>`;
  return `<section class="panel"><h2>Recovery</h2><div class="rates three">
      <div class="rate"><div class="sub">Bounce-back rate</div><b class="num">${pctS(r.bounce)}</b><div class="sub">next card is 80%+ after a weak one · ${r.afterWeak} cases</div></div>
      <div class="rate"><div class="sub">Typical recovery</div><b class="num">${r.median == null ? '–' : r.median}</b><div class="sub">${r.median === 1 ? 'card' : 'cards'} to get back to a strong card</div></div>
      <div class="rate"><div class="sub">Longest slump</div><b class="num">${r.longest}</b><div class="sub">weak cards in a row · ${r.slumps} slump${r.slumps === 1 ? '' : 's'} in all</div></div></div>
    <div class="chart-title">After a weak card, the next card is</div>${pbars([{ label: 'Strong (80%+)', v: r.strong / r.afterWeak }, { label: 'Middling', v: r.mid / r.afterWeak }, { label: 'Weak again', v: r.weak / r.afterWeak }], 'var(--home)')}
    <p class="sub" style="margin:8px 0 0">A weak card is under 50% of its tasks done. Recovery is how quickly the next cards climb back.</p></section>`;
}
function pbars(items, color) {
  return items.map((i) => `<div style="display:grid;grid-template-columns:104px 1fr 44px;gap:8px;align-items:center;margin:5px 0;font-size:13px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(i.label)}">${esc(i.label)}</span>
    <div style="background:var(--heat);border-radius:6px;height:12px;overflow:hidden"><div style="width:${Math.round(i.v * 100)}%;height:100%;background:${color}"></div></div><span class="sub" style="text-align:right">${pctS(i.v)}</span></div>`).join('');
}
function rateTile(label, r, prev, prevLabel) {
  let delta = '';
  if (prev && prev.rate != null && r.rate != null) { const d = Math.round((r.rate - prev.rate) * 100); delta = d === 0 ? `<span class="sub">same as ${prevLabel}</span>` : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)} pts vs ${prevLabel}</span>`; }
  return `<div class="rate"><div class="sub">${label}</div><b class="num">${pctS(r.rate)}</b><div class="sub">${r.planned ? `${r.done} of ${r.planned} tasks · ${r.cards} cards` : 'No finished cards yet'}</div><div class="sub">${delta}</div></div>`;
}
function cycleHeat(fin) {
  const cycles = [...new Set(S.sets.map((x) => x.n))].sort((a, b) => b - a), withData = cycles.filter((n) => fin.some((r) => r.cycle === n)); if (!withData.length) return '';
  const sel = withData.includes(ui.cyc) ? ui.cyc : withData[0], set = S.sets.find((x) => x.n === sel), t = today();
  const cell = (c) => { if (!c) return '<div class="cell none">–</div>'; const done = c.items.filter((i) => i.done).length, v = c.items.length ? done / c.items.length : 0, fin2 = c.end_date < t;
    return fin2 ? `<div class="cell" style="--v:${v}" title="${esc(c.label)} · ${fmtShort(c.start_date)} · ${done} of ${c.items.length} done${holidayNear(c.start_date, c.end_date) ? ' · near ' + esc(holidayNear(c.start_date, c.end_date)) : ''}">${Math.round(v * 100)}</div>` : '<div class="cell none" title="Not finished yet">·</div>'; };
  const weeks = Math.ceil(set.cards.length / 3);
  return `<div class="row wrap" style="margin-bottom:8px"><span class="sub" style="flex:1 1 100%">Each square is one 2-day card (percent of its tasks done).</span><select id="cyc-pick" style="width:auto" aria-label="Cycle">${withData.map((n) => { const x = S.sets.find((y) => y.n === n); return `<option value="${n}" ${n === sel ? 'selected' : ''}>${x.demo ? 'Demo cycle ' + Math.abs(n) : 'Cycle ' + n} · from ${fmtShort(x.start_date)}</option>`; }).join('')}</select></div>
    <div class="cyc"><span></span>${SEGNAME.map((n) => `<span class="sub" style="text-align:center">${n}</span>`).join('')}${Array.from({ length: weeks }, (_, w) => `<span class="sub">Wk ${w + 1}</span>${[0, 1, 2].map((g) => cell(set.cards.find((c) => c.idx === w * 3 + g))).join('')}`).join('')}</div>`;
}
function completionHtml() {
  const R = completionRates(), fin = R.fin;
  if (!fin.length) return `<section class="panel home"><h2>Card completion</h2><div class="empty">Rates and insights appear once some cards have finished. To try the screens now, load sample data on the More tab (you can clear it any time).<div style="margin-top:10px"><button class="sec" id="demo-go">Load sample data</button></div></div></section>`;
  const I = computeInsights(fin);
  const weeksMap = {}; fin.forEach((r) => (weeksMap[r.weekStart] ||= []).push(r));
  const series = Object.keys(weeksMap).sort().slice(-26).map((w) => ({ label: fmtShort(w).replace(/\s/g, ''), value: Math.round((rateOf(weeksMap[w]).rate || 0) * 100) }));
  const segRows = [0, 1, 2].map((g) => ({ label: SEGNAME[g], v: rateOf(fin.filter((r) => r.seg === g)).rate || 0 }));
  const rooms = {}; fin.forEach((r) => r.items.forEach((i) => { const k = i.room || 'General'; (rooms[k] ||= { planned: 0, done: 0 }).planned++; if (i.done) rooms[k].done++; }));
  const roomRows = Object.entries(rooms).map(([label, v]) => ({ label, v: v.done / v.planned })).sort((a, b) => a.v - b.v);
  return `<section class="panel home"><h2>Card completion</h2>
      <div class="rates">${rateTile('This week', R.week, R.lastWeek, 'last week')}${rateTile('This month', R.month, R.lastMonth, 'last month')}${rateTile('Year to date', R.ytd)}${rateTile('Lifetime', R.life)}</div>
      <p class="sub" style="margin:10px 0 0">Counts the tasks on cards whose two days are over. A card that is still open isn't counted as missed yet.</p></section>
    <section class="panel"><h2>What I'm noticing</h2>${I.items.length ? I.items.map((x) => `<div class="ins"><div class="ins-t">${esc(x.title)}</div><div class="sub" style="font-size:14px;color:var(--ink)">${esc(x.detail)}</div>${x.bars ? pbars(x.bars, 'var(--home)') : ''}</div>`).join('') : '<div class="empty">Insights appear after about five finished cards.</div>'}
      <p class="sub" style="margin:8px 0 0">Patterns only, from ${I.tot.planned} finished tasks. Small samples can mislead, so treat these as hints.</p></section>
    ${recoveryHtml(fin)}
    <section class="panel"><h2>Weekly completion</h2>${series.length > 1 ? bars(series, 'var(--home)', { height: 120, showEvery: Math.ceil(series.length / 10) }) : '<div class="empty">More weeks needed.</div>'}
      <div class="chart-title">By day pair</div>${pbars(segRows, 'var(--home)')}<div class="chart-title">By room (lowest first)</div>${pbars(roomRows, 'var(--home)')}</section>
    <section class="panel"><h2>Cycle heat map</h2>${cycleHeat(fin)}</section>`;
}

function coupledRooms(fin) {
  const weeks = [...new Set(fin.map((r) => r.weekStart))].sort(); if (weeks.length < 8) return null;
  const rm = {}; fin.forEach((r) => r.items.forEach((i) => { const k = i.room || 'General'; ((rm[k] ||= {})[r.weekStart] ||= { p: 0, d: 0 }).p++; if (i.done) rm[k][r.weekStart].d++; }));
  const names = Object.keys(rm).filter((k) => Object.values(rm[k]).reduce((a, x) => a + x.p, 0) >= 30); if (names.length < 2) return null;
  const rate = (k, w) => (rm[k][w] && rm[k][w].p >= 2 ? rm[k][w].d / rm[k][w].p : null), all = (w) => { const v = names.map((k) => rate(k, w)).filter((x) => x != null); return v.length ? mean(v) : null; };
  let best = null;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const pairs = weeks.map((w) => { const o = all(w), a = rate(names[i], w), b = rate(names[j], w); return o == null || a == null || b == null ? null : [a - o, b - o]; }).filter(Boolean); if (pairs.length < 8) continue;
    const ma = mean(pairs.map((p) => p[0])), mb = mean(pairs.map((p) => p[1])); let num = 0, da = 0, db = 0; pairs.forEach(([a, b]) => { num += (a - ma) * (b - mb); da += (a - ma) ** 2; db += (b - mb) ** 2; });
    const r = num / Math.sqrt(da * db || 1); if (!best || r > best.r) best = { a: names[i], b: names[j], r, weeks: pairs.length };
  }
  return best;
}
