// ================================================================ MOBILE: a focused portal onto the same living system
const P = { st: makeState('phone'), ss: makeState('sheet'), W: 390, HH: 250, span: 7 * 12, open: null, stepI: 0, timer: null };
const ph = $('#phone');
ph.innerHTML = `
<div class="sb"><span>9:41</span><span>●●● ▮</span></div><div class="island"></div>
<div class="m-head"><div class="mark"><svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="#efe6d4" stroke-width="1"><circle cx="11" cy="11" r="9.5" opacity=".35"/><ellipse cx="11" cy="11" rx="9.5" ry="3.8" transform="rotate(-24 11 11)" opacity=".8"/><circle cx="11" cy="11" r="2" fill="#e3a24a" stroke="none"/></svg>Orrery</div><div class="when" id="mWhen"></div><canvas id="mCore"></canvas></div>
<div class="m-say"><h2 id="mSay"></h2><p id="mSub"></p></div>
<div class="m-hero" id="mHero"><canvas id="mHeroC"></canvas><span class="hint">Tap a room · swipe to move through time</span></div>
<div class="m-time"><canvas id="mTime"></canvas><div class="row"><span class="rng" id="mRng"></span><div class="ch" id="mCh"><button data-s="28">4 wk</button><button data-s="84" class="on">12 wk</button><button data-s="365">Year</button><button data-s="1148">All</button></div></div></div>
<div class="m-low" id="mLow">
  <div class="m-ai"><div class="lab"><span class="lab" style="margin:0;color:var(--verd)">Observed</span><span class="num" id="mConf" style="font-size:10px;color:var(--muted)"></span></div><h3 id="mAiT"></h3><p id="mAiB"></p><div class="btns"><button class="btn v" id="mWhy">Show me why →</button><button class="btn" id="mNext">Next</button></div></div>
  <div class="m-sec"><div class="lab"><span>Today · Mon–Tue</span><span class="num" id="mTodayN"></span></div><ul class="m-today" id="mToday"></ul></div>
</div>
<div class="m-bar"><button class="m-pill" id="mAsk"><i></i>Ask about what you see</button><button class="m-ex" id="mEx" aria-label="Explore the landscape"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#efe6d4" stroke-width="1.2" stroke-linecap="round"><path d="M2 16 L7 9 L11 13 L15 5 L20 14"/><path d="M2 19.5H20" opacity=".4"/></svg></button></div>
<div class="m-sheet" id="mSheet"><div class="veil" id="mVeil"></div><div class="pan"><div class="grab"></div><div class="sh"><span class="lab" id="mShT"></span><button id="mClose">Close</button></div><canvas class="t" id="mSheetC"></canvas><div class="sb2" id="mSb"></div></div></div>`;
const mHeroC = $('#mHeroC'), mTimeC = $('#mTime'), mSheetC = $('#mSheetC'), mCoreC = $('#mCore');
const M = { hg: null, tg: null, sg: null, cg: null, sh: 300 };
function sizePhone() {
  const w = Math.round(ph.clientWidth || 390), h = ph.clientHeight || 844; P.W = w; P.HH = clamp(Math.round(h * 0.285), 200, 280);
  M.hg = fit(mHeroC, w, P.HH); mHeroC.style.height = P.HH + 'px'; M.tg = fit(mTimeC, w - 44, 44); M.sg = fit(mSheetC, w, M.sh); mSheetC.style.height = M.sh + 'px'; M.cg = fit(mCoreC, 46, 46);
}
const _ls = layoutStage; layoutStage = function () { _ls(); sizePhone(); }; // eslint-disable-line
sizePhone();

// ---- say: one sentence for the state of the system
(() => {
  const dow = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); $('#mWhen').textContent = dow;
  const worst = INSIGHTS[0]; const word = HEAD.health >= 80 ? 'Strong' : HEAD.health >= 68 ? 'Steady' : 'Strained';
  $('#mSay').innerHTML = `${word}, with <em>one thing</em> slipping.`; $('#mSub').textContent = `Health ${HEAD.health} · ${pct(HEAD.completion)}% done · ${HEAD.streak}-card run`;
})();
// ---- observation card cycles through the insights
let mi = 0;
function renderMAi() { const f = INSIGHTS[mi % INSIGHTS.length]; $('#mAiT').textContent = f.title; $('#mAiB').textContent = f.body; $('#mConf').textContent = pct(f.conf) + '% confident'; }
$('#mNext').onclick = () => { mi++; renderMAi(); }; renderMAi();
// ---- today
function renderMobAttn() {
  const ul = $('#mToday'); if (!ul) return; ul.innerHTML = ''; $('#mTodayN').textContent = ATT.filter((a) => !a.done).length + ' open';
  ATT.forEach((a) => { const li = el('li', a.done ? 'done' : ''), c = el('canvas'), g = fit(c, 26, 26); g.lineWidth = 1.5; g.strokeStyle = rgba(a.done ? INK.amber : INK.ember, 0.95); g.beginPath(); g.arc(13, 13, 8, 0, 6.283); g.stroke(); if (a.done) { g.fillStyle = rgba(INK.amber, 0.18); g.fill(); g.beginPath(); g.moveTo(9, 13); g.lineTo(12, 16); g.lineTo(17.5, 9.5); g.stroke(); } else { g.fillStyle = rgba(INK.ember, 0.95); g.beginPath(); g.arc(13, 13, 2.4, 0, 6.283); g.fill(); }
    li.appendChild(c); li.appendChild(el('span', 't', a.t.name)); li.appendChild(el('span', 'r', ROOMS[a.t.ri].name));
    li.onclick = () => { const was = a.done; completeTask(a); if (!was) { const n = (P.st._nodes || []).find((n) => n.id === a.t.id) || (P.st._cl || []).find((c) => c.i === a.t.ri); if (n) { P.st.ripples.push({ x: n.x, y: n.y, t0: CLK.t, s: 1 }); P.st.hoverTask = null; } if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* no haptics */ } } };
    ul.appendChild(li); });
}
renderMobAttn();

// ---- time: the window slides; the hero constellation is always "this window"
function setWin(span, centre) { const hi = WEEKS * 7 + FC_WEEKS * 7, end = clamp((centre ?? (P.st.t0.t + P.st.t1.t) / 2) + span / 2, span, hi); P.span = span; P.st.t0.to(end - span); P.st.t1.to(end); }
P.st.mode.to(1, true); P.st.rowA.forEach((t) => t.to(1, true)); P.st.t0.to(NOW_DAY - 84, true); P.st.t1.to(NOW_DAY + 0.5, true);
$('#mCh').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...$('#mCh').children].forEach((x) => x.classList.toggle('on', x === b)); const s = +b.dataset.s; setWin(Math.min(s, NOW_DAY), s >= 1148 ? NOW_DAY / 2 : NOW_DAY - s / 2 + 0.5 + (s < 100 ? 0 : 0)); };
let tdrag = false;
const tDay = (e) => { const r = mTimeC.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1) * (WEEKS * 7 + FC_WEEKS * 7); };
mTimeC.addEventListener('pointerdown', (e) => { tdrag = true; mTimeC.setPointerCapture(e.pointerId); setWin(P.span, Math.min(tDay(e), NOW_DAY - P.span / 2 + P.span / 2)); });
mTimeC.addEventListener('pointermove', (e) => { if (tdrag) setWin(P.span, tDay(e)); }); mTimeC.addEventListener('pointerup', () => (tdrag = false));
// swipe on the hero steps through time by a quarter window
let sw = null; const hero = $('#mHero');
hero.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, y: e.clientY, c: (P.st.t0.t + P.st.t1.t) / 2, moved: false }; });
hero.addEventListener('pointermove', (e) => { if (!sw) return; const dx = e.clientX - sw.x; if (Math.abs(dx) > 10) { sw.moved = true; setWin(P.span, sw.c - (dx / P.W) * P.span * 1.2); } });
hero.addEventListener('pointerup', (e) => { const s = sw; sw = null; if (!s || s.moved) return; const r = mHeroC.getBoundingClientRect(), p = { x: e.clientX - r.left, y: e.clientY - r.top }, h = constHit(P.st, p.x, p.y);
  if (h && h.kind === 'cluster') { P.st.clusterFocus = P.st.clusterFocus === h.i ? -1 : h.i; P.st.zoomC.to(P.st.clusterFocus >= 0 ? 1 : 0); P.st.cEmph.forEach((t, i) => t.to(P.st.clusterFocus < 0 || i === P.st.clusterFocus ? 1 : 0.3)); }
  else if (h && h.kind === 'task') { P.st.hoverTask = P.st.hoverTask === h.id ? null : h.id; P.st.ripples.push({ x: h.x, y: h.y, t0: CLK.t, s: 0.8 }); }
  else { P.st.clusterFocus = -1; P.st.zoomC.to(0); P.st.cEmph.forEach((t) => t.to(1)); P.st.hoverTask = null; } });

// ---- sheet: why / ask / explore, all drawn on the same terrain
const sheet = $('#mSheet'), sb = $('#mSb');
function openSheet(kind, ins) {
  P.open = kind; sheet.classList.add('open'); clearTimeout(P.timer); sb.innerHTML = ''; const ss = P.ss;
  ss.mode.to(0, true); ss.rowsKind = 'rooms'; ss.t0.to(NOW_DAY - 7 * 52, true); ss.t1.to(NOW_DAY + 7 * 6, true); ss.rowA.forEach((t) => t.to(1, true)); ss.plan.to(0, true); ss.fc.to(0.55, true); ss.band.s.to(0, true); ss.links = []; ss.callouts = []; ss.cLinks = [];
  if (kind === 'why') { P.ins = ins; $('#mShT').textContent = ins.tag + ' · ' + pct(ins.conf) + '% confident'; sb.innerHTML = '<div class="dots" id="mDots"></div><div class="cap2" id="mCap"></div><div class="nav"><button class="btn" id="mPrev">← Back</button><button class="btn v" id="mNx">Next →</button></div>'; $('#mPrev').onclick = () => stepM(P.stepI - 1); $('#mNx').onclick = () => stepM(P.stepI + 1); stepM(0); }
  else if (kind === 'ask') { $('#mShT').textContent = 'Ask'; sb.innerHTML = '<input id="mQ" placeholder="Ask about what you’re looking at" autocomplete="off"><div class="chips" id="mChips"></div><div id="mAns"></div>'; ['Why is Friday dropping?', 'What happens at holidays?', 'What’s linked?', 'What do I keep missing?'].forEach((q) => { const b = el('button', '', q); b.onclick = () => askM(q); $('#mChips').appendChild(b); }); $('#mQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') askM(e.target.value); }); }
  else { $('#mShT').textContent = 'The whole landscape'; sb.innerHTML = '<div class="cap2" style="font-size:17px;min-height:0">Height is completion, colour is momentum. Drag along the bar to move through three years.</div><div class="chips" id="mRows"><button class="on">Rooms</button><button>Day pairs</button></div>'; $('#mRows').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...$('#mRows').children].forEach((x) => x.classList.toggle('on', x === b)); ss.rowsKind = b.textContent === 'Rooms' ? 'rooms' : 'pairs'; ss.rowA.forEach((t, i) => t.to(ss.rowsKind === 'pairs' && i > 2 ? 0 : 1)); }; }
}
function stepM(i) {
  const steps = P.ins.steps; if (i < 0) i = 0; if (i >= steps.length) { closeSheet(); return; } P.stepI = i; const s = steps[i], ss = P.ss;
  const sm = { ...s, mode: 0 }; applyStep(ss, sm); const cap = $('#mCap'); cap.style.opacity = 0; setTimeout(() => { cap.textContent = s.cap; cap.style.opacity = 1; }, 200);
  $('#mDots').innerHTML = steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join(''); $('#mNx').textContent = i === steps.length - 1 ? 'Done' : 'Next →';
  clearTimeout(P.timer); P.timer = setTimeout(() => { if (P.open === 'why') stepM(i + 1); }, 7500);
}
function askM(q) { const a = answerFor(q), ans = $('#mAns'); ans.innerHTML = '<span class="lead" style="color:var(--verd);font:500 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:6px">Reading your data</span><div class="shim" style="width:90%"></div><div class="shim" style="width:64%"></div>'; setTimeout(() => { const ins = INSIGHTS.find((x) => x.id === a.id); ans.innerHTML = `<span class="lead" style="color:var(--verd);font:500 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:6px">${ins.tag} · shown above</span>${a.text}<div style="margin-top:12px"><button class="btn v" id="mGo">Walk me through it →</button></div>`; $('#mGo').onclick = () => openSheet('why', ins); const ss = P.ss; applyStep(ss, { ...ins.steps[Math.min(1, ins.steps.length - 1)], mode: 0 }); }, 800); }
function closeSheet() { P.open = null; sheet.classList.remove('open'); clearTimeout(P.timer); }
$('#mWhy').onclick = () => openSheet('why', INSIGHTS[mi % INSIGHTS.length]); $('#mAsk').onclick = () => openSheet('ask'); $('#mEx').onclick = () => openSheet('explore'); $('#mClose').onclick = closeSheet; $('#mVeil').onclick = closeSheet;

// ---- draw
function drawMobile() {
  if (!M.hg) return; const st = P.st, g = M.hg;
  stepState(st, CLK.dt); prune(st); P.ss.mode.to(0); stepState(P.ss, CLK.dt); prune(P.ss);
  const R = { x: 0, y: 2, w: P.W, h: P.HH - 28 };
  g.clearRect(0, 0, P.W, P.HH); drawConst(g, st, R, { alpha: 1 });
  // time strip
  const tg = M.tg, w = P.W - 44; tg.clearRect(0, 0, w, 44); drawMinimap(tg, st, { x: 0, y: 4, w, h: 36 });
  const a = new Date(dateAt(Math.max(0, st.t0.v))), b = new Date(dateAt(Math.min(WEEKS * 7 - 1, st.t1.v))), f = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' }); $('#mRng').textContent = `${f(a)} – ${f(b)}`;
  // sheet terrain
  if (P.open) { const sg = M.sg, ss = P.ss; sg.clearRect(0, 0, P.W, M.sh); sg.fillStyle = INK.obsidian; sg.fillRect(0, 0, P.W, M.sh); const rr = { x: 62, y: 52, w: P.W - 80, h: M.sh - 88 }; drawTerrain(sg, ss, rr, {}); drawTerrainOverlay(sg, ss, rr, {}); }
  drawCore(M.cg, CLK.t, 46);
}
