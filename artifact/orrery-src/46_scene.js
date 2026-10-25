// ================================================================ LANDSCAPE COMPONENT + STORIES: an insight re-forms the picture to show why it is true
const dpr = Math.min(window.devicePixelRatio || 1, 2);
function fit(cv, w, h) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g; }
const TOTAL_DAYS = () => (WEEKS + FC_WEEKS) * 7;
const LAND = { items: new Set(), raf: 0, last: 0, acc: 0 };
function landFrame(now) {
  LAND.raf = 0; const dt = Math.min(0.06, (now - LAND.last) / 1000); LAND.last = now; LAND.acc += dt;
  for (const inst of [...LAND.items]) if (!inst.cv.isConnected) LAND.items.delete(inst);
  if (LAND.items.size) {
    if (LAND.acc >= (RM ? 0.25 : 0.028) && !document.hidden) { const step = LAND.acc; LAND.acc = 0; if (!RM) CLK.t += step; CLK.dt = step;
      for (const inst of LAND.items) { inst.size(); if (!inst.g) continue; stepLand(inst.st, step); const { g, w, h, rect } = inst; g.clearRect(0, 0, w, h); drawTerrain(g, inst.st, rect, {}); drawTerrainOverlay(g, inst.st, rect, {}); inst.after && inst.after(); } }
    LAND.raf = requestAnimationFrame(landFrame);
  }
}
const startLand = () => { if (!LAND.raf) { LAND.last = performance.now(); LAND.raf = requestAnimationFrame(landFrame); } };
function mountLandscape(cv, st = makeLandState(), { fullLabels } = {}) {
  const inst = { cv, st, g: null, w: 0, h: 0, rect: null };
  inst.size = () => { const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) { inst.g = null; return; } if (w !== inst.w || h !== inst.h || !inst.g) { inst.w = w; inst.h = h; inst.g = fit(cv, w, h); } const lx = w < 520 ? 64 : 132; inst.rect = { x: lx, y: 30, w: w - lx - 14, h: h - 30 - 34 }; };
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { const p = pos(e); drag = { x: p.x, t0: st.t0.t, t1: st.t1.t, moved: false }; st.hover = p; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { const p = pos(e); if (e.pointerType === 'mouse' || drag) st.hover = p; if (drag && inst.rect) { const dx = p.x - drag.x; if (Math.abs(dx) > 6) drag.moved = true; if (drag.moved) { const span = drag.t1 - drag.t0, a = clamp(drag.t0 - (dx / inst.rect.w) * span, 0, Math.max(0, TOTAL_DAYS() - span)); st.t0.to(a, true); st.t1.to(a + span, true); } } });
  cv.addEventListener('pointerup', (e) => { const d = drag; drag = null; if (!d || d.moved || !inst.rect) return; const p = pos(e);
    if (p.x < inst.rect.x && st.hoverRow >= 0) { st.focusRoom = st.focusRoom === st.hoverRow ? -1 : st.hoverRow; st.rowA.forEach((t, i) => t.to(st.focusRoom < 0 || i === st.focusRoom ? 1 : 0.25)); } });
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') st.hover = null; }); cv.addEventListener('pointercancel', () => { drag = null; });
  cv.addEventListener('wheel', (e) => { if (!inst.rect || !(e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX))) return; e.preventDefault(); const p = pos(e), geo = st._geo; if (!geo) return; const d = geo.dayOf(p.x), k = Math.exp(e.deltaY * 0.0014), span = clamp((st.t1.t - st.t0.t) * k, 7, TOTAL_DAYS()), f = (p.x - inst.rect.x) / inst.rect.w; let a = d - span * f, b = a + span; if (a < 0) { b -= a; a = 0; } if (b > TOTAL_DAYS()) { a -= b - TOTAL_DAYS(); b = TOTAL_DAYS(); } st.t0.to(Math.max(0, a)); st.t1.to(b); }, { passive: false });
  LAND.items.add(inst); startLand(); return inst;
}
function landRange(st, key) {
  const total = TOTAL_DAYS(), span = { m3: 91, m6: 182, y1: 365 }[key];
  if (!span || span >= NOW_DAY + 30) { st.t0.to(0); st.t1.to(total); return; }
  st.t0.to(Math.max(0, NOW_DAY - span * 0.78)); st.t1.to(Math.min(total, NOW_DAY + span * 0.22 + 7));
}
const landLevel = (st) => { const d = st.t1.t - st.t0.t; return d > 420 ? 'All time' : d > 200 ? 'A year' : d > 100 ? '6 months' : d > 45 ? '3 months' : d > 14 ? 'A month' : 'A few weeks'; };

// ---- applying a scene: where the landscape looks, which rows are lit, what is spotlighted, what the wall emphasises
const clearOld = (st) => { st.links.forEach((l) => l.p.to(0)); st.callouts.forEach((c) => c.a.to(0)); };
function landApply(st, sc) {
  clearOld(st); const total = TOTAL_DAYS();
  if (sc.win) { st.t0.to(clamp(sc.win[0], 0, total)); st.t1.to(clamp(sc.win[1], 8, total)); }
  if (sc.rows) st.rowsKind = sc.rows; const rows = ROWSETS[st.rowsKind];
  st.rowA.forEach((t, i) => t.to(i < rows.length ? (sc.emph ? sc.emph[i] ?? 1 : 1) : 0)); st.focusRoom = -1;
  st.fc.to(sc.fc === false ? 0 : 0.55);
  if (sc.band) { st.band.a.to(sc.band[0]); st.band.b.to(sc.band[1]); st.band.s.to(1); st.band.label = sc.band[2] || ''; } else st.band.s.to(0);
  (sc.callouts || []).forEach((c) => { const o = { ...c, a: new Tw(0, 3) }; o.a.to(1); st.callouts.push(o); });
  st.links = st.links.filter((l) => l.p.t > 0 || l.p.v > 0.02); st.callouts = st.callouts.filter((c) => c.a.t > 0 || c.a.v > 0.02);
}
const pruneLand = (st) => { st.callouts = st.callouts.filter((c) => c.a.t > 0 || c.a.v > 0.02); };
function wallApply(w, sc) { if (sc.cycle != null && sc.cycle !== w.cy) { w.cy = sc.cycle; w.update({ animate: true }); } w.setFocus(sc.focus || null); }

// ---- stories: the steps behind each kind of insight. Every number comes from the same data the insight did.
function evidenceCycle() { const l = S.sets.slice().sort((a, b) => a.n - b.n), t = today(); return [...l].reverse().find((s) => s.cards.some((c) => c.end_date < t && c.items.length)) || l[l.length - 1] || null; }
function storyFor(ins) {
  const ev = evidenceCycle(), cy = ev ? ev.n : null, rowsR = ROWSETS.rooms, rowsP = ROWSETS.pairs, idxR = (n) => rowsR.findIndex((r) => r.name === n), eR = (names) => rowsR.map((r) => (names.has(r.name) ? 1 : 0.2)), eP = (seg) => rowsP.map((_, i) => (i === seg ? 1 : 0.2));
  const back = (w) => [NOW_DAY - 7 * w, NOW_DAY + 7 * 3], P = (v) => Math.round(v * 100) + '%', intro = { cap: 'This is your latest cycle. Each column is a week, each row a two-day card, and each bar a task: lit when done, dashed when missed.', land: { win: back(26), rows: 'rooms' }, wall: { cycle: cy } };
  const act = {};
  switch (ins.kind) {
    case 'seg': {
      const w = ins.seg; return { steps: [intro,
        { cap: `${SEGNAME[w]} is where the bars go hollow: ${P(ins.rate)} done, against ${P(ins.overall)} overall.`, land: { win: back(26), rows: 'pairs', emph: eP(w) }, wall: { cycle: cy, focus: { segs: [0, 1, 2].map((i) => (i === w ? 1 : 0.2)) } } },
        { cap: `Over the last two months the ${SEGNAME[w]} line sits below the other two. ${SEGNAME[ins.best]} is your strongest.`, land: { win: back(13), rows: 'pairs', emph: eP(w), band: [NOW_DAY - 56, NOW_DAY, 'Last 8 weeks'], callouts: [{ day: NOW_DAY - 14, row: w, side: -1, color: 'ember', text: `${SEGNAME[w]} ${P(ins.rate)}`, sub: 'lowest of the three' }] }, wall: { cycle: cy, focus: { segs: [0, 1, 2].map((i) => (i === w ? 1 : 0.2)) } } }],
        action: { label: `Keep ${SEGNAME[w]} lighter in the next deck`, run: () => goPlan('deck') } };
    }
    case 'holiday': {
      const name = ins.worst[0], hs = HOLIDAYS.filter((h) => h.name === name && h.day < NOW_DAY - 3 && h.day > 7 && MODEL.fin.some((r) => Math.abs(isoToDay(r.start) - h.day) < 5)), h = hs[hs.length - 1] || HOLIDAYS.find((x) => x.rank >= 1 && x.day < NOW_DAY);
      return { steps: [intro, h ? { cap: `Around ${h.name}, the ground sags: look at the weeks either side of the marker.`, land: { win: [h.day - 49, h.day + 35], rows: 'rooms', band: [h.day - 8, h.day + 5, h.name], callouts: [{ day: h.day, fy: 0.3, side: 1, color: 'ember', text: h.name }] }, wall: { cycle: cy } } : intro,
        { cap: `Cards on or next to a holiday are ${P(ins.near)} done, against ${P(ins.far)} on other days.${ins.worst.length > 1 ? ` Hardest hit: ${ins.worst.join(', ')}.` : ''}`, land: { win: back(52), rows: 'rooms' }, wall: { cycle: cy } }],
        action: { label: 'Plan a lighter card for the next holiday week', run: () => goPlan('deck') } };
    }
    case 'room': { const r = ins.room; return { steps: [intro, { cap: `${r}: ${P(ins.rate)} of its tasks get done, against ${P(ins.overall)} overall. Its bars are the ones going dashed.`, land: { win: back(26), rows: 'rooms', emph: eR(new Set([r])) }, wall: { cycle: cy, focus: { rooms: new Set([r]) } } }], action: { label: `Plan the ${r}`, run: () => { const sp = spaceList().find((x) => x.name === r); if (sp) store.set('space', sp.key); ui.pane = 'chat'; goPlan('rooms'); } } }; }
    case 'skipped': return { steps: [intro, { cap: `These are the tasks that keep getting skipped: ${ins.tasks.join(', ')}. Every bar for them is ringed.`, land: { win: back(26), rows: 'rooms' }, wall: { cycle: cy, focus: { tasks: new Set(ins.tasks) } } }], action: { label: 'Lower how often, or split them smaller', run: () => { ui.pane = 'chat'; goPlan('rooms'); } } };
    case 'trend': return { steps: [intro, { cap: ins.detail, land: { win: back(20), rows: 'rooms', band: [NOW_DAY - 28, NOW_DAY, 'Last 4 weeks'] }, wall: { cycle: cy } }] };
    case 'pair': return { steps: [intro, { cap: `${ins.a} and ${ins.b} rise and fall together (r = ${ins.r.toFixed(2)}). Their bars are ringed in teal. When one goes dashed, the other usually does too.`, land: { win: back(40), rows: 'rooms', emph: eR(new Set([ins.a, ins.b])) }, wall: { cycle: cy, focus: { link: [ins.a, ins.b] } } }], action: { label: 'Plan them as one block', run: () => goPlan('rooms') } };
    default: return { steps: [intro, { cap: ins.detail, land: { win: back(26), rows: 'rooms' }, wall: { cycle: cy } }] };
  }
}
function openStory(ins) {
  if (!ins) return; buildModel(); const story = storyFor(ins); let i = 0;
  const body = openSheet({ title: ins.title, wide: true, onClose: () => { LAND.items.forEach((x) => { if (x.cv.id === 'stc') LAND.items.delete(x); }); }, html: `<div class="story"><div class="st-vis"><div class="st-land"><canvas id="stc" aria-label="Landscape of your completion over time"></canvas></div><div class="st-wall" id="stw"></div></div><div class="st-side"><div class="lab" id="stn"></div><p class="st-cap" id="stcap" aria-live="polite"></p><div class="st-nav"><button class="sec" id="st-prev">${icon('left')} Back</button><button class="primary grow" id="st-next">Next ${icon('right')}</button></div><div class="dots-n" id="stdots"></div><div id="sta"></div></div></div>` });
  const st = makeLandState(), inst = mountLandscape($('#stc', body), st), w = makeWall(); w.hist = false; $('#stw', body).append(w.el); w.cy = story.steps[0].wall?.cycle ?? null; w.update({ animate: true });
  const show = () => { const s = story.steps[i]; $('#stn', body).textContent = `Step ${i + 1} of ${story.steps.length}`; const cap = $('#stcap', body); cap.style.opacity = 0; setTimeout(() => { cap.textContent = s.cap; cap.style.opacity = 1; }, 180);
    landApply(st, s.land || {}); wallApply(w, s.wall || {}); $('#stdots', body).innerHTML = story.steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join(''); $('#st-prev', body).disabled = i === 0; const last = i === story.steps.length - 1; $('#st-next', body).innerHTML = last ? 'Done' : `Next ${icon('right')}`;
    $('#sta', body).innerHTML = last && story.action ? `<button class="ai" id="st-act" style="margin-top:14px;width:100%">${esc(story.action.label)} ${icon('right')}</button>` : ''; $('#st-act', body)?.addEventListener('click', () => { closeSheet(); story.action.run(); }); };
  $('#st-prev', body).onclick = () => { if (i > 0) { i--; show(); } }; $('#st-next', body).onclick = () => { if (i < story.steps.length - 1) { i++; show(); } else closeSheet(); };
  inst.after = () => pruneLand(st); setTimeout(show, 120);
}
