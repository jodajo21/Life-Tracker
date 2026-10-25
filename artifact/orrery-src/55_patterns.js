// ================================================================ PATTERNS: the landscape, what the system has noticed, and the numbers behind it
let PLAND = null, PLINST = null;
function centerOn(st, day) { const span = st.t1.t - st.t0.t, a = clamp(day - span / 2, 0, Math.max(0, TOTAL_DAYS() - span)); st.t0.to(a); st.t1.to(a + span); }
function renderPatterns() {
  buildModel(); const R = completionRates(), fin = R.fin, ins = MODEL.ins, kind = store.get('range', 'quarter'), t = today();
  if (!PLAND) PLAND = makeLandState(); PLAND.rowsKind = PLAND.rowsKind || 'rooms';
  const needed = 5, have = fin.length;
  if (!have) { view.innerHTML = `<h1>Patterns</h1><section class="panel"><h2>Nothing to see yet, and that is normal</h2><p class="sub" style="margin-top:0">Patterns come from finished cards. After about two weeks you get the landscape, and after about five cards the first plain-language observations.</p>
      <div class="bar"><i style="width:${Math.min(100, (100 * have) / needed)}%"></i></div><p class="sub">${have} of about ${needed} finished cards.</p>${PREVIEW ? '' : '<div class="row wrap"><button class="primary" id="pv-go">See it with sample data</button></div>'}</section>
      <section class="panel fit"><h2>Activity</h2><div class="seg" id="actseg">${KINDS.map(([k, n]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${n}</button>`).join('')}</div><div id="acthost">${activityHtml(kind)}</div></section>`; $('#pv-go')?.addEventListener('click', startPreview); bindActivity(); return; }
  const weeksMap = {}; fin.forEach((r) => (weeksMap[r.weekStart] ||= []).push(r));
  const series = Object.keys(weeksMap).sort().slice(-26).map((w) => ({ label: fmtShort(w).replace(/\s/g, ''), value: Math.round((rateOf(weeksMap[w]).rate || 0) * 100) }));
  const segRows = [0, 1, 2].map((g) => ({ label: SEGNAME[g], v: rateOf(fin.filter((r) => r.seg === g)).rate || 0 }));
  const rm = {}; fin.forEach((r) => r.items.forEach((i) => { const k = i.room || 'General'; (rm[k] ||= { planned: 0, done: 0 }).planned++; if (i.done) rm[k].done++; }));
  const roomRows = Object.entries(rm).map(([label, v]) => ({ label, v: v.done / v.planned })).sort((a, b) => a.v - b.v);
  view.innerHTML = `<h1>Patterns</h1>
    <section class="panel home"><h2>Card completion</h2><div class="rates">${rateTile('This week', R.week, R.lastWeek, 'last week')}${rateTile('This month', R.month, R.lastMonth, 'last month')}${rateTile('Year to date', R.ytd)}${rateTile('Lifetime', R.life)}</div><p class="sub" style="margin:10px 0 0">Counts tasks on cards whose two days are over. An open card is not counted as missed yet.</p></section>
    <section class="panel landpanel"><div class="row wrap" style="margin-bottom:8px"><h2 class="grow" style="margin:0">The landscape</h2><div class="seg mini" id="lrows" role="group" aria-label="Group by"><button data-r="rooms" class="${PLAND.rowsKind === 'rooms' ? 'on' : ''}">Rooms</button><button data-r="pairs" class="${PLAND.rowsKind === 'pairs' ? 'on' : ''}">Day pairs</button></div></div>
      <div class="landwrap"><canvas id="pl" aria-label="Completion over time. Height is completion; colour is momentum; broken lines are unstable stretches; dashed teal is the forecast."></canvas></div>
      <canvas id="mmc" class="mmc" aria-label="Whole history. Drag to move."></canvas>
      <div class="row wrap" style="justify-content:space-between;margin-top:6px"><div class="seg mini" id="lrange" role="group" aria-label="Range">${[['m3', '3 mo'], ['m6', '6 mo'], ['y1', 'Year'], ['all', 'All']].map(([k, n]) => `<button data-k="${k}">${n}</button>`).join('')}</div><span class="sub" id="llevel"></span></div>
      <details style="margin-top:10px"><summary class="sub" style="cursor:pointer;min-height:36px">How to read this</summary><ul class="legend">${[['Height', 'how much of the work got done'], ['Colour', 'ember to gold: slipping to climbing'], ['Broken line', 'an unstable stretch'], ['Dashed teal', 'what the AI expects next'], ['Diamonds', 'holidays'], ['Name at the left', 'tap to look at one room']].map(([a, b]) => `<li><b>${a}</b> ${b}</li>`).join('')}</ul></details></section>
    <section class="panel"><h2>What I’m noticing</h2>${ins.length ? ins.map((x, i) => `<div class="ins"><div class="ins-t">${esc(x.title)}</div><div class="sub" style="font-size:15px;color:var(--ink2)">${esc(x.detail)}</div>${x.bars ? pbars(x.bars, 'var(--amber)') : ''}<div class="row wrap" style="margin-top:8px"><button class="ai sm" data-why="${i}">${icon('spark')} Show me why</button><span class="sub">${x.strength}</span></div></div>`).join('') : `<div class="empty">Observations appear after about five finished cards.</div>`}
      <p class="sub" style="margin:8px 0 0">Patterns only, from ${R.fin.reduce((a, r) => a + r.planned, 0)} finished tasks. Small samples can mislead, so treat these as hints.</p></section>
    <section class="panel"><h2>Every cycle at a glance</h2><div id="wallhost2"></div></section>
    <details class="panel"><summary><h2 style="margin:0">The numbers</h2></summary><div style="margin-top:12px">${recoveryHtml(fin)}<div class="chart-title">Weekly completion</div>${series.length > 1 ? bars(series, 'var(--amber)', { height: 120, showEvery: Math.ceil(series.length / 8) }) : '<div class="empty">More weeks needed.</div>'}<div class="chart-title">By day pair</div>${pbars(segRows, 'var(--amber)')}<div class="chart-title">By room (lowest first)</div>${pbars(roomRows, 'var(--amber)')}<div class="chart-title">Cycle heat map</div>${cycleHeat(fin)}</div></details>
    <section class="panel fit"><h2>Activity</h2><div class="seg" id="actseg">${KINDS.map(([k, n]) => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${n}</button>`).join('')}</div><div id="acthost">${activityHtml(kind)}</div></section>`;
  const wall = wallOf(); wall.hist = true; $('#wallhost2').append(wall.el); wall.update();
  // the landscape
  PLINST = mountLandscape($('#pl'), PLAND); const st = PLAND, mm = $('#mmc'); st.rowA.forEach((t, i) => t.to(i < ROWSETS[st.rowsKind].length ? 1 : 0, true));
  $('#lrows').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; st.rowsKind = b.dataset.r; st.focusRoom = -1; st.rowA.forEach((t, i) => t.to(i < ROWSETS[st.rowsKind].length ? 1 : 0)); view.querySelectorAll('#lrows button').forEach((x) => x.classList.toggle('on', x === b)); };
  $('#lrange').onclick = (e) => { const b = e.target.closest('button'); if (b) landRange(st, b.dataset.k); };
  let mg = null; const mmRect = () => ({ x: 0, y: 2, w: mm.clientWidth, h: mm.clientHeight - 4 });
  PLINST.after = () => { if (!mg || mg._w !== mm.clientWidth) { if (!mm.clientWidth) return; mg = fit(mm, mm.clientWidth, mm.clientHeight); mg._w = mm.clientWidth; } mg.clearRect(0, 0, mm.clientWidth, mm.clientHeight); drawMinimap(mg, st, mmRect()); pruneLand(st); const lv = $('#llevel'); if (lv) lv.textContent = landLevel(st); };
  let md = false; const mday = (e) => { const r = mm.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * TOTAL_DAYS(); };
  mm.addEventListener('pointerdown', (e) => { md = true; mm.setPointerCapture(e.pointerId); centerOn(st, mday(e)); }); mm.addEventListener('pointermove', (e) => { if (md) centerOn(st, mday(e)); }); mm.addEventListener('pointerup', () => (md = false));
  view.querySelectorAll('[data-why]').forEach((b) => (b.onclick = () => openStory(ins[+b.dataset.why])));
  $('#cyc-pick')?.addEventListener('change', (e) => { ui.cyc = +e.target.value; go('patterns', { keep: true }); });
  bindActivity();
}
function bindActivity() { view.querySelectorAll('#actseg button').forEach((b) => (b.onclick = () => { store.set('range', b.dataset.k); $('#acthost').innerHTML = activityHtml(b.dataset.k); view.querySelectorAll('#actseg button').forEach((x) => x.classList.toggle('on', x === b)); })); }
