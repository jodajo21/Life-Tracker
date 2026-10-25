// ================================================================ Trends
function rangeFor(kind) {
  const now = new Date(), t = ymd(now); let from, to, buckets = [];
  if (kind === 'week') { const m = monday(now); from = m; to = addDays(m, 6); buckets = Array.from({ length: 7 }, (_, i) => ({ label: WD[i][0], from: ymd(addDays(m, i)), to: ymd(addDays(m, i)) })); }
  else if (kind === 'month') { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); buckets = Array.from({ length: to.getDate() }, (_, i) => { const d = ymd(addDays(from, i)); return { label: String(i + 1), from: d, to: d }; }); }
  else if (kind === 'quarter') { const m = addDays(monday(now), -12 * 7); from = m; to = addDays(m, 13 * 7 - 1); buckets = Array.from({ length: 13 }, (_, i) => { const s = addDays(m, i * 7); return { label: `${s.getMonth() + 1}/${s.getDate()}`, from: ymd(s), to: ymd(addDays(s, 6)) }; }); }
  else { from = new Date(now.getFullYear(), now.getMonth() - 11, 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); buckets = Array.from({ length: 12 }, (_, i) => { const s = new Date(from.getFullYear(), from.getMonth() + i, 1); return { label: s.toLocaleString('en', { month: 'short' }), from: ymd(s), to: ymd(new Date(s.getFullYear(), s.getMonth() + 1, 0)) }; }); }
  return { from: ymd(from), to: ymd(to), today: t, buckets };
}
const KINDS = [['week', 'Week'], ['month', 'Month'], ['quarter', '3 months'], ['year', 'Year']];
function planItems(from, to) { const out = []; for (const set of S.sets) for (const c of set.cards) if (c.start_date >= from && c.start_date <= to) for (const i of c.items) out.push({ room: i.room || 'General', done: !!i.done }); return out; }
function activityHtml(kind) {
  const R = rangeFor(kind), plan = planItems(R.from, R.today < R.to ? R.today : R.to);
  const showEvery = { week: 1, month: 5, quarter: 2, year: 1 }[kind], label = { week: 'This week', month: 'This month', quarter: 'Last 13 weeks', year: 'Last 12 months' }[kind];
  const panel = (goal, title) => {
    const es = entriesOf(goal).filter((e) => e.date >= R.from && e.date <= R.to), color = COLORS[goal];
    const series = R.buckets.map((b) => ({ label: b.label, value: es.filter((e) => e.date >= b.from && e.date <= b.to).length }));
    const dayCounts = {}; es.forEach((e) => (dayCounts[e.date] = (dayCounts[e.date] || 0) + 1));
    const dow = WD.map((d, i) => ({ label: d, value: es.filter((e) => (parse(e.date).getDay() + 6) % 7 === i).length }));
    const topDay = dow.some((d) => d.value) ? dow.slice().sort((a, b) => b.value - a.value)[0].label : '–';
    const byCat = {}; es.forEach((e) => (byCat[e.activity] = (byCat[e.activity] || 0) + 1));
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, value]) => ({ label: l, value }));
    let stats, extra = '';
    if (goal === 'fitness') stats = [[Object.keys(dayCounts).length, 'active days'], [es.length, 'exercises logged'], [topDay, 'busiest day']];
    else {
      const planned = plan.length, done = plan.filter((p) => p.done).length;
      stats = [[planned ? Math.round((100 * done) / planned) + '%' : '–', 'of card tasks done'], [es.length, 'tasks completed'], [topDay, 'busiest day']];
      const rooms = {}; plan.forEach((p) => { rooms[p.room] = rooms[p.room] || { done: 0, of: 0 }; rooms[p.room].of++; if (p.done) rooms[p.room].done++; });
      const rb = Object.entries(rooms).sort((a, b) => b[1].of - a[1].of).map(([l, v]) => ({ label: l, value: v.done, of: v.of }));
      extra = rb.length ? `<div class="chart-title">Card tasks done, by room</div>${hbars(rb, color)}` : '';
      if (planned) extra = `<div class="row" style="margin-top:6px">${ring(done / planned, color, 'cards')}<div class="sub">${done} of ${planned} planned card tasks checked off so far.</div></div>` + extra;
    }
    const body = es.length || (goal === 'home' && plan.length)
      ? `<div class="stats">${stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>${extra}
         <div class="chart-title">${goal === 'fitness' ? 'Exercises' : 'Tasks'} logged · ${label.toLowerCase()}</div>${bars(series, color, { showEvery })}
         ${kind !== 'week' ? `<div class="chart-title">Daily activity</div>${heatmap(dayCounts, R.from, R.to < R.today ? R.to : R.today, color)}` : ''}
         <div class="chart-title">By day of week</div>${bars(dow, color, { height: 90 })}${top.length ? `<div class="chart-title">Most frequent</div>${hbars(top, color)}` : ''}`
      : `<div class="empty">Nothing logged ${label.toLowerCase()} yet.</div>`;
    return `<section class="panel ${goal === 'fitness' ? 'fit' : 'home'}"><h2>${title}</h2>${body}</section>`;
  };
  return panel('fitness', 'Fitness') + panel('home', 'Home tasks');
}
