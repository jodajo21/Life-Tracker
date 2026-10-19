// ================================================================ DESKTOP: render loop, interaction, instruments
buildForecast();
const $ = (s, r = document) => r.querySelector(s);
const DW = 1440, DH = 900, TR = { x: 150, y: 196, w: 926, h: 552 };
const dpr = Math.min(window.devicePixelRatio || 1, 2);
function fit(cv, w, h) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g; }
const D = { st: makeState('desk'), cv: $('#dc'), mmRect: null };
D.g = fit(D.cv, DW, DH);
const coreCv = $('#core'), coreG = fit(coreCv, 118, 118);
D.mmCv = $('#mm'); D.mmG = null;

function drawCore(g, t, size = 118) {
  const k = size / 118; g.save(); g.scale(k, k); g.clearRect(0, 0, 118, 118); const cx = 59, cy = 59, vals = [HEAD.completion, HEAD.consistency, clamp(0.5 + HEAD.momentum / 8, 0, 1)], R = [50, 40, 30], cols = [INK.amber, INK.copper, INK.verd];
  g.lineCap = 'round';
  vals.forEach((v, i) => { g.lineWidth = 2; g.strokeStyle = rgba(INK.ivory, 0.08); g.beginPath(); g.arc(cx, cy, R[i], 0, 6.283); g.stroke(); const a0 = -1.5708 + t * (0.05 + i * 0.03) * (i % 2 ? -1 : 1), len = v * 6.283 * Math.min(1, t / 1.2 + 0.001); g.lineWidth = 2.6; g.strokeStyle = rgba(cols[i], 0.95); g.shadowColor = rgba(cols[i], 0.8); g.shadowBlur = 8; g.beginPath(); g.arc(cx, cy, R[i], -1.5708, -1.5708 + len); g.stroke(); g.shadowBlur = 0; const ex = cx + Math.cos(-1.5708 + len) * R[i], ey = cy + Math.sin(-1.5708 + len) * R[i]; g.fillStyle = rgba(GLINT, 1); g.beginPath(); g.arc(ex, ey, 2, 0, 6.283); g.fill(); });
  const pulse = 1 + 0.04 * Math.sin(t * 1.6); g.font = `300 30px ${FONT.disp}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = rgba(INK.ivory, 1); g.fillText(String(HEAD.health), cx, cy - 1);
  g.font = `500 7.5px ${FONT.mono}`; g.letterSpacing = '1.5px'; g.fillStyle = rgba(INK.muted, 1); g.fillText('SYSTEM', cx, cy + 16); g.letterSpacing = '0px';
  const gl = g.createRadialGradient(cx, cy, 4, cx, cy, 24 * pulse); gl.addColorStop(0, rgba(INK.amber, 0.18)); gl.addColorStop(1, rgba(INK.amber, 0)); g.fillStyle = gl; g.beginPath(); g.arc(cx, cy, 24 * pulse, 0, 6.283); g.fill(); g.restore();
}
function spark(cv, series, color, mark) { const g = fit(cv, cv.clientWidth || 140, 26), w = cv.clientWidth || 140, vs = series.filter((v) => v != null); if (vs.length < 2) return; const lo = Math.min(...vs), hi = Math.max(...vs), r = hi - lo || 1; g.strokeStyle = rgba(color, 0.95); g.lineWidth = 1.3; g.beginPath(); vs.forEach((v, i) => { const x = (i / (vs.length - 1)) * (w - 4) + 2, y = 22 - ((v - lo) / r) * 18; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); const lv = vs[vs.length - 1]; g.fillStyle = rgba(GLINT, 1); g.beginPath(); g.arc(w - 2, 22 - ((lv - lo) / r) * 18, 2.2, 0, 6.283); g.fill(); }
function fillReadouts() {
  const sp = HEAD.spark, set = (id, val, d, cls, series, col) => { const el = $(id); el.querySelector('.v span').textContent = val; const dd = el.querySelector('.d'); dd.textContent = d; dd.className = 'd ' + cls; spark(el.querySelector('canvas'), series, col); };
  set('#roC', Math.round(HEAD.completion * 100), 'last 4 weeks', '', sp.completion, INK.amber);
  set('#roK', Math.round(HEAD.consistency * 100), 'steadiness, 12 wks', '', sp.consistency, INK.copper);
  set('#roM', (HEAD.momentum > 0 ? '+' : '') + HEAD.momentum.toFixed(1), HEAD.momentum >= 0 ? '▲ climbing' : '▼ slipping', HEAD.momentum >= 0 ? 'up' : 'dn', sp.momentum || sp.completion, INK.verd);
  set('#roF', Math.round(HEAD.friction * 100), 'how hard tasks resist', '', sp.friction || sp.completion, INK.ember);
  set('#roS', HEAD.streak, 'best ' + HEAD.best, '', sp.streak || sp.completion, INK.gold || INK.amber);
}

// ---- frame
let last = performance.now(); CLK.t = 0;
function scene(g, st, rect, alphaMode) {
  const m = st.mode.v;
  g.fillStyle = INK.obsidian; g.fillRect(0, 0, DW, DH); drawAtmos(g, DW, DH, CLK.t, 1);
  if (m < 0.98) { drawTerrain(g, st, rect, { alpha: 1 - m }); drawTerrainOverlay(g, st, rect, { alpha: 1 - m }); }
  if (m > 0.02) drawConst(g, st, rect, { alpha: m });
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; CLK.dt = dt; CLK.t += dt; const st = D.st; stepState(st, dt);
  const mob = document.documentElement.classList.contains('mobile'); if (!mob) scene(D.g, st, TR);
  drawCore(coreG, CLK.t); if (typeof drawMobile === 'function') drawMobile(); prune(st); if ((crumbT += dt) > 0.25) { crumbT = 0; renderCrumbs2(); }
  if (D.mmG) { D.mmG.clearRect(0, 0, 700, 46); drawMinimap(D.mmG, st, { x: 0, y: 0, w: 700, h: 46 }); }
  requestAnimationFrame(frame);
}
fillReadouts();
requestAnimationFrame(frame);
// ---- stage: desktop and phone are logical sizes, scaled to fit whatever the window is
let layoutStage = function () {
  const vw = innerWidth, vh = innerHeight, both = vw >= 1100, gap = 44, pw = 390 + 20, ph = 844 + 20, totalW = DW + (both ? gap + pw : 0), totalH = Math.max(DH, ph);
  const s = Math.min(1, (vw - 40) / totalW, (vh - 32) / totalH);
  document.documentElement.classList.toggle('mobile', !both);
  const db = $('#deskBox'), pb = $('#phoneBox');
  db.style.width = DW * s + 'px'; db.style.height = DH * s + 'px'; $('#desk').style.transform = `scale(${s})`;
  pb.style.width = (390 * s) + 'px'; pb.style.height = (844 * s) + 'px'; $('#phone').style.transform = `scale(${s})`; pb.style.margin = `0 ${10 * s}px`;
  D.scale = s; D.rect = null;
};
addEventListener('resize', () => layoutStage()); layoutStage();

// ================================================================ interaction + intelligence panel
window.__O = { INS, INSIGHTS, D, HEAD };
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const HUEC = { ember: INK.ember, copper: INK.copper, verd: INK.verd, amber: INK.amber };
const stp = { cur: null, i: 0, timer: null, tour: false };
const st = D.st;

// -- crumbs & zoom ladder
const LEVELS = [['Life', 1092], ['Year', 365], ['Season', 120], ['Month', 40], ['Week', 14], ['Day', 5]];
function zoomTo(span, centre) { const c = centre ?? (st.t0.t + st.t1.t) / 2, lo = 0, hi = WEEKS * 7 + FC_WEEKS * 7; let a = c - span / 2, b = c + span / 2; if (a < lo) { b += lo - a; a = lo; } if (b > hi) { a -= b - hi; b = hi; } st.t0.to(Math.max(lo, a)); st.t1.to(Math.min(hi, b)); }
function renderCrumbs() {
  const lv = levelOf(st), cr = $('#crumbs'); const idx = LEVELS.findIndex((l) => l[0] === lv); cr.innerHTML = '';
  LEVELS.forEach((l, i) => { if (i > idx) return; if (i) cr.appendChild(el('i', '', '/')); const b = el('button', i === idx ? 'on' : '', l[0]); b.onclick = () => { stopStory(); zoomTo(l[1] * (l[0] === 'Life' ? 1 : 1), l[0] === 'Life' ? (WEEKS * 7 + FC_WEEKS * 7) / 2 : null); }; cr.appendChild(b); });
  const sc = $('#scale'); if (!sc.children.length) LEVELS.forEach((l) => { const b = el('button', '', l[0]); b.dataset.l = l[0]; b.onclick = () => { stopStory(); zoomTo(l[1], l[0] === 'Life' ? (WEEKS * 7 + FC_WEEKS * 7) / 2 : l[0] === 'Year' ? NOW_DAY - 100 : NOW_DAY - l[1] / 2.4); }; sc.appendChild(b); });
  [...sc.children].forEach((b) => b.classList.toggle('on', b.dataset.l === lv));
}
// -- toggles
const swR = $('#swRows'), swM = $('#swMode');
swR.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...swR.children].forEach((x) => x.classList.toggle('on', x === b)); st.rowsKind = b.dataset.r; st.rowA.forEach((t, i) => t.to(st.rowsKind === 'pairs' && i > 2 ? 0 : 1, true)); };
swM.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; stopStory(); setMode(+b.dataset.m); };
function setMode(m) { [...swM.children].forEach((x) => x.classList.toggle('on', +x.dataset.m === m)); st.mode.to(m); if (!m) { st.clusterFocus = -1; st.zoomC.to(0); } }
const tg = (id, key, onv = 1, offv = 0) => { const b = $(id); b.onclick = () => { b.classList.toggle('on'); st[key].to(b.classList.contains('on') ? onv : offv); }; };
tg('#tgPlan', 'plan'); tg('#tgCmp', 'compare'); { const b = $('#tgFc'); b.onclick = () => { b.classList.toggle('on'); st.fc.to(b.classList.contains('on') ? 0.55 : 0); }; }

// -- legend: each glyph is drawn with the same marks the picture uses
const LEG = [
  ['height', 'Height · completion', (g) => { g.strokeStyle = rgba(INK.amber, 0.95); g.beginPath(); g.moveTo(1, 12); g.quadraticCurveTo(7, -3, 13, 9); g.quadraticCurveTo(19, 3, 25, 11); g.stroke(); }],
  ['hue', 'Colour · momentum', (g) => { const gr = g.createLinearGradient(0, 0, 26, 0); RAMP.forEach((r, i) => gr.addColorStop(i / 3, rgba(r[1]))); g.fillStyle = gr; g.fillRect(1, 5, 24, 3); }],
  ['frag', 'Broken · unstable', (g) => { g.strokeStyle = rgba(INK.copper, 0.95); g.setLineDash([3, 2]); g.beginPath(); g.moveTo(1, 7); g.lineTo(25, 7); g.stroke(); g.setLineDash([]); }],
  ['links', 'Teal · AI, forecast', (g) => { g.strokeStyle = rgba(INK.verd, 0.95); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(1, 11); g.quadraticCurveTo(13, -4, 25, 11); g.stroke(); g.setLineDash([]); }],
  ['ring', 'Pulse · open now', (g) => { g.strokeStyle = rgba(INK.ember, 0.9); g.beginPath(); g.arc(13, 7, 5, 0, 6.283); g.stroke(); g.fillStyle = rgba(INK.ember, 1); g.beginPath(); g.arc(13, 7, 2, 0, 6.283); g.fill(); }],
];
(() => { const ul = $('#legend'); LEG.forEach(([k, t, f]) => { const li = el('li'), c = el('canvas'); c.width = 52; c.height = 28; const g = c.getContext('2d'); g.scale(2, 2); g.lineWidth = 1.3; f(g); li.appendChild(c); li.appendChild(el('span', '', t)); ul.appendChild(li); }); })();

// -- minimap scrub
D.mmG = fit(D.mmCv, 700, 46); { const r = D.mmCv.getBoundingClientRect(); }
let mmDrag = false;
const mmDay = (e) => { const r = D.mmCv.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * (WEEKS * 7 + FC_WEEKS * 7); };
D.mmCv.addEventListener('pointerdown', (e) => { stopStory(); mmDrag = true; D.mmCv.setPointerCapture(e.pointerId); zoomTo(st.t1.t - st.t0.t, mmDay(e)); });
D.mmCv.addEventListener('pointermove', (e) => { if (mmDrag) zoomTo(st.t1.t - st.t0.t, mmDay(e)); });
D.mmCv.addEventListener('pointerup', () => (mmDrag = false));

// -- canvas gestures: wheel = zoom at cursor, drag = pan, move = scan line, click = focus
const pos = (e) => { const r = D.cv.getBoundingClientRect(), s = D.scale || 1; return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s }; };
let drag = null;
D.cv.addEventListener('wheel', (e) => { e.preventDefault(); if (st.mode.t > 0.5) return; stopStory(); const p = pos(e), geo = st._geo; if (!geo) return; const d = geo.dayOf(p.x), k = Math.exp(e.deltaY * 0.0014), span = clamp((st.t1.t - st.t0.t) * k, 4, WEEKS * 7 + FC_WEEKS * 7), f = (p.x - TR.x) / TR.w; let a = d - span * f, b = a + span; const hi = WEEKS * 7 + FC_WEEKS * 7; if (a < 0) { b -= a; a = 0; } if (b > hi) { a -= b - hi; b = hi; } st.t0.to(Math.max(0, a)); st.t1.to(b); }, { passive: false });
D.cv.addEventListener('pointerdown', (e) => { const p = pos(e); drag = { x: p.x, t0: st.t0.t, t1: st.t1.t, moved: false }; D.cv.setPointerCapture(e.pointerId); });
D.cv.addEventListener('pointermove', (e) => {
  const p = pos(e); st.hover = p;
  if (drag && st.mode.t < 0.5) { const dx = p.x - drag.x; if (Math.abs(dx) > 3) { drag.moved = true; stopStory(); } if (drag.moved) { const dd = -(dx / TR.w) * (drag.t1 - drag.t0), hi = WEEKS * 7 + FC_WEEKS * 7, a = clamp(drag.t0 + dd, 0, hi - (drag.t1 - drag.t0)); st.t0.to(a, true); st.t1.to(a + drag.t1 - drag.t0, true); } }
  if (st.mode.t > 0.5) { const h = constHit(st, p.x, p.y); st.hoverTask = h && h.kind === 'task' ? h.id : null; D.cv.style.cursor = h ? 'pointer' : 'default'; showTip(h, p); } else { D.cv.style.cursor = drag && drag.moved ? 'grabbing' : 'crosshair'; hideTip(); }
});
D.cv.addEventListener('pointerleave', () => { st.hover = null; st.hoverTask = null; hideTip(); });
D.cv.addEventListener('pointerup', (e) => {
  const p = pos(e), moved = drag && drag.moved; drag = null; if (moved) return;
  if (st.mode.t > 0.5) { const h = constHit(st, p.x, p.y); if (h && h.kind === 'cluster') { st.clusterFocus = st.clusterFocus === h.i ? -1 : h.i; st.zoomC.to(st.clusterFocus >= 0 ? 1 : 0); st.cEmph.forEach((t, i) => t.to(st.clusterFocus < 0 || i === st.clusterFocus ? 1 : 0.35)); } else if (!h) { st.clusterFocus = -1; st.zoomC.to(0); st.cEmph.forEach((t) => t.to(1)); }
    else if (h && h.kind === 'task') st.ripples.push({ x: h.x, y: h.y, t0: CLK.t, s: 0.8 }); }
  else if (st.hoverRow >= 0) { st.focusRoom = st.focusRoom === st.hoverRow ? -1 : st.hoverRow; st.rowA.forEach((t, i) => t.to(st.focusRoom < 0 || i === st.focusRoom ? 1 : 0.28)); }
});
const tip = $('#tip');
function showTip(h, p) {
  if (!h) return hideTip(); let html;
  if (h.kind === 'task') { const t = TASKS[h.id], nv = st._nv && st._nv[h.id]; html = `<b>${t.name}</b><span class="s">${ROOMS[t.ri].name} · ${t.f}× per cycle</span><div class="r"><span>Done</span><span>${nv ? pct(nv.rate.v) : '–'}%</span></div><div class="r"><span>Effort</span><span>${'●'.repeat(t.effort)}${'○'.repeat(3 - t.effort)}</span></div>`; }
  else { const ro = st._ro && st._ro[h.i]; html = `<b>${ROOMS[h.i].name}</b><span class="s">${CONST[h.i].tasks.length} routines</span><div class="r"><span>Completion</span><span>${ro ? pct(ro.rate.v) : '–'}%</span></div><div class="r"><span>Order</span><span>${ro ? pct(ro.order.v) : '–'}</span></div><div class="r"><span>Click</span><span>zoom in</span></div>`; }
  tip.innerHTML = html; tip.style.left = Math.min(p.x + 16, DW - 600) + 'px'; tip.style.top = Math.max(60, p.y - 20) + 'px'; tip.classList.add('on');
}
const hideTip = () => tip.classList.remove('on');

// -- intelligence panel
function ring(cv, v, col) { const g = fit(cv, 34, 22); g.lineWidth = 2; g.strokeStyle = rgba(INK.ivory, 0.1); g.beginPath(); g.arc(11, 11, 8, 0, 6.283); g.stroke(); g.strokeStyle = rgba(col, 0.95); g.lineCap = 'round'; g.beginPath(); g.arc(11, 11, 8, -1.5708, -1.5708 + v * 6.283); g.stroke(); g.fillStyle = rgba(col, 1); g.beginPath(); g.arc(11, 11, 1.8, 0, 6.283); g.fill(); }
let focusIns = INSIGHTS[0];
function renderIntel() {
  $('#sigN').textContent = INSIGHTS.length + ' observed';
  const fb = $('#focusBox'); fb.innerHTML = ''; const f = focusIns;
  fb.appendChild(el('div', 'focus', `<h3>${f.title}</h3><p>${f.body}</p>`));
  const row = el('div', '', ''); row.style.cssText = 'display:flex;gap:8px;align-items:center'; const b = el('button', 'btn v', 'Show me why <span>→</span>'); b.onclick = () => playInsight(f); row.appendChild(b);
  const cf = el('span', 'num', `${pct(f.conf)}% confidence`); cf.style.cssText = 'color:var(--muted);font-size:10.5px;margin-left:auto'; row.appendChild(cf); fb.appendChild(row);
  const ul = $('#sigList'); ul.innerHTML = '';
  INSIGHTS.forEach((s) => { if (s === f) return; const li = el('li'); const c = el('canvas'); li.appendChild(c); const d = el('div', '', `<div class="t">${s.short}</div><div class="m">${s.tag}</div>`); li.appendChild(d); li.appendChild(el('span', 'num', pct(s.conf))); li.lastChild.style.cssText = 'font-size:10.5px;color:var(--muted)'; li.onclick = () => { stopStory(); focusIns = s; renderIntel(); playInsight(s); }; ul.appendChild(li); ring(c, s.conf, HUEC[s.hue]); });
}
function renderSteps() {
  const ol = $('#steps'); ol.innerHTML = ''; $('#intel').classList.toggle('playing', !!stp.cur); if (!stp.cur) { ol.hidden = true; $('#sigList').hidden = false; return; }
  ol.hidden = false; $('#sigList').hidden = true; const prog = el('div', 'prog', '<i></i>'); ol.appendChild(prog);
  stp.cur.steps.forEach((s, i) => { const li = el('li', i === stp.i ? 'on' : i < stp.i ? 'done' : '', `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="c">${s.cap}</span>`); li.onclick = () => { clearTimeout(stp.timer); goStep(i); }; ol.appendChild(li); });
  $('#steps .prog i').style.width = ((stp.i + 1) / stp.cur.steps.length) * 100 + '%';
}
function playInsight(ins) { clearTimeout(stp.timer); stp.cur = ins; focusIns = ins; stp.tour = false; setModeSilent(); renderIntel(); goStep(0); }
const setModeSilent = () => {};
function goStep(i) {
  const steps = stp.cur.steps; if (i >= steps.length) { stp.timer = setTimeout(stopStory, 6000); return; } stp.i = i; const s = steps[i];
  setMode(s.mode || 0); if (s.rows) { [...swR.children].forEach((x) => x.classList.toggle('on', x.dataset.r === s.rows)); } applyStep(st, s);
  $('#tgPlan').classList.toggle('on', !!s.plan); $('#tgFc').classList.toggle('on', (s.fc ?? 0.55) > 0);
  const cap = $('#cap'); cap.style.opacity = 0; setTimeout(() => { cap.textContent = s.cap; cap.style.opacity = 1; }, 250);
  renderSteps(); $('#tourBtn').textContent = '■ Stop'; stp.timer = setTimeout(() => goStep(i + 1), 6800);
}
function stopStory() { clearTimeout(stp.timer); if (!stp.cur && !stp.tour) return; stp.cur = null; stp.tour = false; $('#cap').style.opacity = 0; $('#tourBtn').textContent = '▶ Watch the story'; resetView(st); st.rowA.forEach((t, i) => t.to(st.rowsKind === 'pairs' && i > 2 ? 0 : 1)); st.focusRoom = -1; renderSteps(); }
$('#cap').style.transition = 'opacity .5s';

// -- the guided tour: Life → year → … → task, then the AI's first observation
function tour() {
  if (stp.cur || stp.tour) { stopStory(); return; } stp.tour = true; setMode(0); $('#tourBtn').textContent = '■ Stop';
  const seq = [
    [() => zoomTo(1092 + 56, (WEEKS * 7 + FC_WEEKS * 7) / 2), 'Life. Three years, every routine, as terrain: height is completion.', 5200],
    [() => zoomTo(365, NOW_DAY - 150), 'A year. Seasons tint the ground. Holidays stand as landmarks.', 5200],
    [() => { zoomTo(120, HOLIDAYS.find((h) => h.name === 'Thanksgiving' && h.day < NOW_DAY).day); }, 'A season. Around Thanksgiving, the whole household sags.', 5200],
    [() => zoomTo(40, NOW_DAY - 14), 'A month. Each ripple is a day; broken lines are routines in doubt.', 4800],
    [() => zoomTo(14, NOW_DAY - 4), 'A week. Three two-day cards; the pulse marks today.', 4800],
    [() => { zoomTo(1092 + 56, (WEEKS * 7 + FC_WEEKS * 7) / 2); setMode(1); st.cEmph.forEach((t) => t.to(1)); }, 'Or as a system: rooms are orbits, tasks are bodies, order is how steady they hold.', 5600],
    [() => { st.clusterFocus = 0; st.zoomC.to(1); st.cEmph.forEach((t, i) => t.to(i === 0 ? 1 : 0.35)); }, 'Down to a single room, then a single task.', 4800],
    [() => { stp.tour = false; st.clusterFocus = -1; st.zoomC.to(0); st.cEmph.forEach((t) => t.to(1)); setMode(0); playInsight(INSIGHTS[0]); }, '', 0],
  ];
  let i = 0; const next = () => { if (!stp.tour) return; const [fn, cap, ms] = seq[i++]; fn(); const c = $('#cap'); c.style.opacity = 0; setTimeout(() => { c.textContent = cap; c.style.opacity = cap ? 1 : 0; }, 250); if (ms) stp.timer = setTimeout(next, ms); }; next();
}
$('#tourBtn').onclick = tour;

// -- needs attention: today's open items; completing one sends a physical ripple through the picture
const ATT = CURRENT.tasks.filter((x) => x.open).map((x) => ({ t: x.t, done: false }));
function renderAttn() {
  const ul = $('#attn'); ul.innerHTML = ''; $('#attnCount').textContent = ATT.filter((a) => !a.done).length + ' open · card ' + String((NOW_CARD % 39) + 1).padStart(2, '0') + '/39';
  ATT.forEach((a) => { const li = el('li', a.done ? 'done' : ''); const c = el('canvas'); const g = fit(c, 20, 20); g.lineWidth = 1.4; g.strokeStyle = rgba(a.done ? INK.amber : INK.ember, 0.9); g.beginPath(); g.arc(10, 10, 6, 0, 6.283); g.stroke(); if (a.done) { g.beginPath(); g.moveTo(6.5, 10); g.lineTo(9, 12.5); g.lineTo(13.5, 7); g.stroke(); } else { g.fillStyle = rgba(INK.ember, 0.9); g.beginPath(); g.arc(10, 10, 2, 0, 6.283); g.fill(); }
    li.appendChild(c); li.appendChild(el('span', 't', a.t.name)); li.appendChild(el('span', 'r', ROOMS[a.t.ri].name)); li.onclick = () => completeTask(a); ul.appendChild(li); });
  if (typeof renderMobAttn === 'function') renderMobAttn();
}
function completeTask(a) {
  a.done = !a.done; renderAttn(); if (!a.done) return;
  if (st.mode.t > 0.5) { const n = (st._nodes || []).find((n) => n.id === a.t.id); const cl = (st._cl || []).find((c) => c.i === a.t.ri); const o = n || cl; if (o) st.ripples.push({ x: o.x, y: o.y, t0: CLK.t, s: 1 }); }
  else { const x = TR.x + TR.w * 0.78, y = (st._geo ? st._geo.base(a.t.ri) : TR.y + 300); st.ripples.push({ x: 0, y: 0, t0: -9, s: 0 }); st.pulseAt = { t0: CLK.t, x, y }; }
}
// -- ask
const askIn = $('#ask'), ans = $('#answer');
function ask(q) {
  if (!q.trim()) return; stopStory(); ans.innerHTML = '<span class="lead">Reading your data</span><div class="shim" style="width:92%"></div><div class="shim" style="width:70%"></div>';
  setTimeout(() => { const a = answerFor(q); ans.innerHTML = `<span class="lead">${INSIGHTS.find((i) => i.id === a.id)?.tag || 'Answer'} · on screen now</span>${a.text}`; const ins = INSIGHTS.find((i) => i.id === a.id); if (ins) { focusIns = ins; renderIntel(); playInsight(ins); } }, 900);
}
askIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { ask(askIn.value); } });
addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); askIn.focus(); } if (e.key === 'Escape') stopStory(); });
['Why is Friday dropping?', 'What happens at holidays?', 'What’s linked?', 'What do I keep missing?'].forEach((q) => { const b = el('button', '', q); b.onclick = () => { askIn.value = q; ask(q); }; $('#askChips').appendChild(b); });
renderIntel(); renderAttn(); renderCrumbs(); resetView(st);
let crumbT = 0; const _frame = frame;

let lastLv = ''; function renderCrumbs2() { const lv = levelOf(st); if (lv !== lastLv) { lastLv = lv; renderCrumbs(); } }
