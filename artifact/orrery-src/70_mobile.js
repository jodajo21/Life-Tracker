// ================================================================ MOBILE: today's card in your hand, the cycle as a wall above it
const P = { st: makeState('phone'), ss: makeState('sheet'), W: 390, HH: 224, open: null, stepI: 0, timer: null, cap: { t0: 0, dec: [] } };
const ph = $('#phone');
ph.innerHTML = `
<div class="sb"><span>9:41</span><span>●●● ▮</span></div><div class="island"></div>
<div class="m-head"><div class="mark"><svg width="20" height="20" viewBox="0 0 22 22" fill="none" stroke="#efe6d4" stroke-width="1"><circle cx="11" cy="11" r="9.5" opacity=".35"/><ellipse cx="11" cy="11" rx="9.5" ry="3.8" transform="rotate(-24 11 11)" opacity=".8"/><circle cx="11" cy="11" r="2" fill="#e3a24a" stroke="none"/></svg>Orrery</div><div class="when" id="mWhen"></div><canvas id="mCore"></canvas></div>
<div class="m-say"><h2 id="mSay"></h2><p id="mSub"></p></div>
<div class="m-hero" id="mHero"><canvas id="mHeroC"></canvas></div>
<div class="m-low" id="mLow">
  <div class="m-card" id="mCard"><i class="hole"></i><div class="ch"><b id="mCardN"></b><span id="mCardS"></span></div><ul class="m-today" id="mToday"></ul>
    <div class="acts"><button class="btn v" id="mShoot">◉ Photograph</button><button class="btn" id="mEdit">Edit card</button><button class="btn" id="mSay2">Tell it</button></div></div>
  <div class="m-ai"><div class="lab"><span class="lab" style="margin:0;color:var(--verd)">Observed</span><span class="num" id="mConf" style="font-size:10px;color:var(--muted)"></span></div><h3 id="mAiT"></h3><p id="mAiB"></p><div class="btns"><button class="btn v" id="mWhy">Show me why →</button><button class="btn" id="mNext">Next</button></div></div>
</div>
<div class="m-bar"><button class="m-pill" id="mAsk"><i></i>Ask about what you see</button><button class="m-ex" id="mEx" aria-label="Explore the landscape"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#efe6d4" stroke-width="1.2" stroke-linecap="round"><path d="M2 16 L7 9 L11 13 L15 5 L20 14"/><path d="M2 19.5H20" opacity=".4"/></svg></button></div>
<div class="m-sheet" id="mSheet"><div class="veil" id="mVeil"></div><div class="pan"><div class="grab"></div><div class="sh"><span class="lab" id="mShT"></span><button id="mClose">Close</button></div><canvas class="t" id="mSheetC"></canvas><div class="sb2" id="mSb"></div></div></div>`;
const mHeroC = $('#mHeroC'), mSheetC = $('#mSheetC'), mCoreC = $('#mCore');
const M = { hg: null, sg: null, cg: null, sh: 300 };
function sizePhone() {
  const w = Math.round(ph.clientWidth || 390), h = ph.clientHeight || 844; P.W = w; P.HH = clamp(Math.round(h * 0.27), 200, 250);
  M.hg = fit(mHeroC, w, P.HH); mHeroC.style.height = P.HH + 'px'; M.sg = fit(mSheetC, w, M.sh); mSheetC.style.height = M.sh + 'px'; M.cg = fit(mCoreC, 46, 46);
}
const _ls = layoutStage; layoutStage = function () { _ls(); sizePhone(); }; // eslint-disable-line
sizePhone();
P.st.mode.to(1, true); P.st.deckT0 = 0;

(() => { $('#mWhen').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); const word = HEAD.health >= 80 ? 'Strong' : HEAD.health >= 68 ? 'Steady' : 'Strained'; $('#mSay').innerHTML = `${word}, with <em>one thing</em> slipping.`; $('#mSub').textContent = `Health ${HEAD.health} · ${pct(HEAD.completion)}% done · ${HEAD.streak}-card run`; })();
let mi = 0;
function renderMAi() { const f = INSIGHTS[mi % INSIGHTS.length]; $('#mAiT').textContent = f.title; $('#mAiB').textContent = f.body; $('#mConf').textContent = pct(f.conf) + '% confident'; }
$('#mNext').onclick = () => { mi++; renderMAi(); }; renderMAi();

// ---- today's card, as paper
function renderMobAttn() {
  const ul = $('#mToday'); if (!ul) return; ul.innerHTML = ''; $('#mCardN').textContent = cardLabel(CURRENT); $('#mCardS').textContent = `${SEGS[CURRENT.seg]} · ${CURRENT.tasks.filter((x) => x.done).length}/${CURRENT.tasks.length} done`;
  ATT.forEach((a) => { const li = el('li', a.done ? 'done' : ''); li.innerHTML = `<span class="bx">${a.done ? '<svg viewBox="0 0 20 20"><path d="M3 11 L8 16 L18 3"/></svg>' : ''}</span><span class="t">${a.t.name}</span><span class="r">${ROOMS[a.t.ri].name}</span>`;
    li.onclick = () => { completeTask(a); if (a.done && navigator.vibrate) try { navigator.vibrate(8); } catch (e) { /* no haptics */ } }; ul.appendChild(li); });
}
renderMobAttn();

// ---- the wall: tap a cycle tile to switch cycles, swipe sideways to move between cycles, tap a card to open it
let sw = null; const hero = $('#mHero');
hero.addEventListener('pointerdown', (e) => { sw = { x: e.clientX, moved: false }; });
hero.addEventListener('pointermove', (e) => { if (!sw || sw.moved) return; const dx = e.clientX - sw.x; if (Math.abs(dx) > 40) { sw.moved = true; setDeckCycle(P.st, P.st.deckCy + (dx < 0 ? 1 : -1)); } });
hero.addEventListener('pointerup', (e) => { const s = sw; sw = null; if (!s || s.moved) return; const r = mHeroC.getBoundingClientRect(), h = deckHit(P.st, e.clientX - r.left, e.clientY - r.top);
  if (h && h.kind === 'cycle') setDeckCycle(P.st, h.cy); else if (h && h.kind === 'card') { P.st.ripples.push({ x: h.x, y: h.y, t0: CLK.t, s: 0.7 }); openSheet('card', null, h.c); } });

// ---- sheets
const sheet = $('#mSheet'), sb = $('#mSb');
function openSheet(kind, ins, c) {
  P.open = kind; sheet.classList.add('open'); clearTimeout(P.timer); sb.innerHTML = ''; const ss = P.ss;
  ss.mode.to(0, true); ss.rowsKind = 'rooms'; ss.t0.to(NOW_DAY - 7 * 52, true); ss.t1.to(NOW_DAY + 7 * 6, true); ss.rowA.forEach((t) => t.to(1, true)); ss.plan.to(0, true); ss.fc.to(0.55, true); ss.band.s.to(0, true); ss.links = []; ss.callouts = []; ss.cLinks = [];
  mSheetC.style.display = kind === 'why' || kind === 'ask' || kind === 'explore' ? '' : 'none';
  if (kind === 'why') { P.ins = ins; $('#mShT').textContent = ins.tag + ' · ' + pct(ins.conf) + '% confident'; sb.innerHTML = '<div class="dots" id="mDots"></div><div class="cap2" id="mCap"></div><div class="nav"><button class="btn" id="mPrev">← Back</button><button class="btn v" id="mNx">Next →</button></div>'; $('#mPrev').onclick = () => stepM(P.stepI - 1); $('#mNx').onclick = () => stepM(P.stepI + 1); stepM(0); }
  else if (kind === 'ask') { $('#mShT').textContent = 'Ask'; sb.innerHTML = '<input id="mQ" placeholder="Ask about what you’re looking at" autocomplete="off"><div class="chips" id="mChips"></div><div id="mAns"></div>'; ['Why is Friday dropping?', 'What happens at holidays?', 'What’s linked?', 'What do I keep missing?'].forEach((q) => { const b = el('button', '', q); b.onclick = () => askM(q); $('#mChips').appendChild(b); }); $('#mQ').addEventListener('keydown', (e) => { if (e.key === 'Enter') askM(e.target.value); }); }
  else if (kind === 'capture') captureSheet();
  else if (kind === 'card') cardSheet(c ?? NOW_CARD);
  else if (kind === 'say') saySheet();
  else { $('#mShT').textContent = 'The whole landscape'; sb.innerHTML = '<div class="cap2" style="font-size:17px;min-height:0">Height is completion, colour is momentum. Rooms stack; time runs left to right across three years.</div><div class="chips" id="mRows"><button class="on">Rooms</button><button>Day pairs</button></div>'; $('#mRows').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...$('#mRows').children].forEach((x) => x.classList.toggle('on', x === b)); ss.rowsKind = b.textContent === 'Rooms' ? 'rooms' : 'pairs'; ss.rowA.forEach((t, i) => t.to(ss.rowsKind === 'pairs' && i > 2 ? 0 : 1)); }; }
}
function stepM(i) {
  const steps = P.ins.steps; if (i < 0) i = 0; if (i >= steps.length) { closeSheet(); return; } P.stepI = i; const s = steps[i], ss = P.ss;
  const sm = s.mode ? { ...s, mode: 0, win: [NOW_DAY - 7 * 26, NOW_DAY + 14], rows: 'pairs', emph: s.segs || [0.3, 0.3, 1] } : s; applyStep(ss, { ...sm, deckCy: null, task: null, cLinks: [] }); const cap = $('#mCap'); cap.style.opacity = 0; setTimeout(() => { cap.textContent = s.cap; cap.style.opacity = 1; }, 200);
  $('#mDots').innerHTML = steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join(''); $('#mNx').textContent = i === steps.length - 1 ? 'Done' : 'Next →';
  clearTimeout(P.timer); P.timer = setTimeout(() => { if (P.open === 'why') stepM(i + 1); }, 7500);
}
function askM(q) { const a = answerFor(q), ans = $('#mAns'); ans.innerHTML = '<span class="lead" style="color:var(--verd);font:500 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:6px">Reading your data</span><div class="shim" style="width:90%"></div><div class="shim" style="width:64%"></div>'; setTimeout(() => { const ins = INSIGHTS.find((x) => x.id === a.id); ans.innerHTML = `<span class="lead" style="color:var(--verd);font:500 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:6px">${ins.tag} · shown above</span>${a.text}<div style="margin-top:12px"><button class="btn v" id="mGo">Walk me through it →</button></div>`; $('#mGo').onclick = () => openSheet('why', ins); const first = ins.steps.find((x) => !x.mode) || ins.steps[0]; applyStep(P.ss, { ...first, mode: 0, deckCy: null, task: null, cLinks: [] }); }, 800); }
function closeSheet() { P.open = null; sheet.classList.remove('open'); clearTimeout(P.timer); }

// capture: viewfinder → read → confirm what it was unsure of
function captureSheet() {
  const card = CURRENT; P.cap.t0 = CLK.t; P.cap.dec = detFor(NOW_CARD); $('#mShT').textContent = `Photograph · card ${cardLabel(card)}`; sb.innerHTML = '<canvas id="mPhotoC"></canvas><ul class="dets" id="mDets"></ul><div class="nav" style="margin-top:12px"><button class="btn v" id="mConfirm">Confirm &amp; log</button><button class="btn" id="mRetake">Retake</button></div><p class="note" id="mCapMsg"></p>';
  const pc = $('#mPhotoC'); P.cap.g = fit(pc, P.W - 44, 250); pc.style.width = '100%'; pc.style.height = '250px'; P.cap.w = P.W - 44; renderCapDets();
  $('#mRetake').onclick = () => { P.cap.t0 = CLK.t; P.cap.dec = detFor(NOW_CARD); renderCapDets(); };
  $('#mConfirm').onclick = () => { card.tasks.forEach((x, i) => { if (P.cap.dec[i].v === true && !x.done) setTaskDone(x, true); }); ATT.forEach((a) => { if (a.x.done) a.done = true; }); renderAttn(); closeSheet(); setTimeout(() => card.tasks.forEach((x, i) => { if (x.done) { const p = pipAt(P.st, x); if (p) P.st.ripples.push({ x: p.x, y: p.y, t0: CLK.t + i * 0.12, s: 1 }); } }), 400); };
}
function renderCapDets() { const ul = $('#mDets'); ul.innerHTML = ''; CURRENT.tasks.forEach((x, i) => { const d = P.cap.dec[i], li = el('li', d.amb && d.v === 'unsure' ? 'amb' : ''); li.innerHTML = `<span class="s ${d.v === true ? 'ok' : ''}">${d.v === 'unsure' ? '?' : d.v ? '✓' : '○'}</span><span class="n">${x.t.name}</span><span class="c">${d.v === 'unsure' ? '<button data-v="1">Done</button><button data-v="0">Not</button>' : Math.round(d.conf * 100) + '%'}</span>`; li.querySelectorAll('button').forEach((b) => (b.onclick = () => { d.v = b.dataset.v === '1'; d.amb = false; d.conf = 1; renderCapDets(); })); ul.appendChild(li); });
  const open = P.cap.dec.some((d) => d.v === 'unsure'); $('#mConfirm').disabled = open; $('#mConfirm').style.opacity = open ? 0.45 : 1; $('#mCapMsg').textContent = open ? 'One mark is unclear — tell it which.' : 'Looks right. This lights the wall.'; }
// edit a card: the printed card, and its tasks
function cardSheet(c) {
  const card = CARDS[c], live = c === NOW_CARD; $('#mShT').textContent = `Card ${cardLabel(card)} · ${SEGS[card.seg]}`;
  const draw = () => { sb.innerHTML = `<div class="paperwrap"><canvas id="mPaper"></canvas></div><p class="note">${live ? 'Edit before you print — 3 to 5 tasks, 6 only if you must.' : card.finished ? `Finished · ${card.done} of ${card.planned}. Locked once its week ends.` : 'Coming up.'}</p>${live || !card.finished ? '<div class="edit">' + card.tasks.map((x, i) => `<div><span>${x.t.name}</span><button data-r="${i}">✕</button></div>`).join('') + `<select id="mAdd"><option value="">+ Add a task…</option>${TASKS.filter((t) => !card.tasks.some((x) => x.t === t)).map((t) => `<option value="${t.id}">${ROOMS[t.ri].name} · ${t.name}</option>`).join('')}</select></div>` : ''}`;
    const pc = $('#mPaper'), g = fit(pc, 156, 234); pc.style.width = '156px'; pc.style.height = '234px'; g.scale(0.6, 0.6); drawPaper(g, 260, 390, card, {});
    sb.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { if (card.tasks.length <= 3) return; card.tasks.splice(+b.dataset.r, 1); card.planned = card.tasks.length; if (live) { ATT.length = 0; card.tasks.forEach((x) => ATT.push({ t: x.t, x, done: x.done })); renderAttn(); } draw(); }));
    const add = $('#mAdd'); if (add) add.onchange = (e) => { if (!e.target.value || card.tasks.length >= 6) return; const x = { t: TASKS[+e.target.value], done: false, open: true, hour: 0 }; card.tasks.push(x); CARD_OF.set(x, card.c); card.planned = card.tasks.length; if (live) { ATT.push({ t: x.t, x, done: false }); renderAttn(); } draw(); }; };
  draw();
}
function saySheet() { $('#mShT').textContent = 'Tell it'; sb.innerHTML = '<input id="mSayIn" placeholder="“did the toilets and wiped the stove top”" autocomplete="off"><div class="chips" id="mSayCh"></div><div id="mSayOut" style="margin-top:10px;font-size:14px"></div>';
  const run = (q) => { q = q.toLowerCase(); const hit = ATT.filter((a) => !a.done && a.t.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && q.includes(w.replace(/s$/, '')))); $('#mSayOut').innerHTML = hit.length ? 'Marked: ' + hit.map((a) => `<b>${a.t.name}</b>`).join(', ') : '<span style="color:var(--muted)">Nothing open on today’s card matches that.</span>'; hit.forEach((a, i) => setTimeout(() => completeTask(a), 250 + i * 200)); };
  $('#mSayIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(e.target.value); }); ['I did the toilets and the stove top', 'Vacuumed the bedrooms'].forEach((q) => { const b = el('button', '', q); b.onclick = () => run(q); $('#mSayCh').appendChild(b); }); }
$('#mWhy').onclick = () => openSheet('why', INSIGHTS[mi % INSIGHTS.length]); $('#mAsk').onclick = () => openSheet('ask'); $('#mEx').onclick = () => openSheet('explore'); $('#mClose').onclick = closeSheet; $('#mVeil').onclick = closeSheet;
$('#mShoot').onclick = () => openSheet('capture'); $('#mEdit').onclick = () => openSheet('card', null, NOW_CARD); $('#mSay2').onclick = () => openSheet('say');

// ---- draw
function drawMobile() {
  if (!M.hg) return; const st = P.st, g = M.hg;
  stepState(st, CLK.dt); prune(st); P.ss.mode.to(0); stepState(P.ss, CLK.dt); prune(P.ss);
  g.clearRect(0, 0, P.W, P.HH); drawDeck(g, st, { x: 34, y: 18, w: P.W - 44, h: P.HH - 22 }, { alpha: 1 });
  if (P.open === 'why' || P.open === 'ask' || P.open === 'explore') { const sg = M.sg, ss = P.ss; sg.clearRect(0, 0, P.W, M.sh); sg.fillStyle = INK.obsidian; sg.fillRect(0, 0, P.W, M.sh); const rr = { x: 62, y: 52, w: P.W - 80, h: M.sh - 88 }; drawTerrain(sg, ss, rr, {}); drawTerrainOverlay(sg, ss, rr, {}); }
  if (P.open === 'capture' && P.cap.g) { const pg = P.cap.g; drawPhoto(pg, P.cap.w, 250, CURRENT, CLK.t, P.cap.dec, { t0: P.cap.t0 }); }
  drawCore(M.cg, CLK.t, 46);
}
