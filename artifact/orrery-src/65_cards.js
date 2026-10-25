// ================================================================ CARDS: set tasks → deal the deck → capture. And the card itself, printed and photographed.
const freqLabel = (f) => (f >= 36 ? 'Every card' : f >= 24 ? '2× a week' : f >= 12 ? 'Weekly' : f >= 6 ? '2× a month' : f >= 3 ? 'Monthly' : 'Quarterly');
const PLAN = ROOMS.map((r, ri) => ({ ri, name: r.name, tasks: TASKS.filter((t) => t.ri === ri).map((t) => ({ name: t.name, f: t.f, effort: t.effort })) }));
const planTotal = () => PLAN.reduce((a, r) => a + r.tasks.reduce((b, t) => b + t.f, 0), 0);
const seedRnd = (n) => { const s = Math.sin(n * 91.7 + 3.3) * 43758.5453; return s - Math.floor(s); };

// ---- the printed card, and its photograph
function drawPaper(g, W, H, card, o = {}) {
  g.save(); const k = W / 260; g.scale(k, k); const w = 260, h = 390;
  g.fillStyle = o.photo ? '#e8dfca' : '#efe6d4'; g.beginPath(); g.roundRect(0, 0, w, h, 10); g.fill();
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(120,100,70,0.18)'); g.fillStyle = gr; g.fill();
  g.fillStyle = '#16140f'; g.beginPath(); g.arc(w / 2, 22, 6.5, 0, 6.283); g.fill();          // punched hole for the clamp
  g.strokeStyle = 'rgba(40,34,24,0.28)'; g.setLineDash([2, 3]); g.lineWidth = 1; g.beginPath(); g.moveTo(16, 58); g.lineTo(w - 16, 58); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(40,34,24,0.4)'; g.font = `500 7px ${FONT.mono}`; g.textAlign = 'center'; g.letterSpacing = '1.6px'; g.fillText('CLAMP HERE', w / 2, 46); g.letterSpacing = '0px';
  g.fillStyle = '#1b1a17'; g.textAlign = 'left'; g.font = `400 30px ${FONT.disp}`; g.fillText(cardLabel(card), 22, 92);
  g.font = `600 10px ${FONT.mono}`; g.letterSpacing = '2px'; g.fillStyle = '#6e5a3a'; g.fillText(SEGS[card.seg].toUpperCase().replace('–', ' · '), 22, 110); g.letterSpacing = '0px';
  const n = card.tasks.length, y0 = 138, step = Math.min(46, (h - y0 - 36) / Math.max(n, 1)); o.boxes = [];
  card.tasks.forEach((x, i) => {
    const y = y0 + i * step; g.strokeStyle = '#1b1a17'; g.lineWidth = 1.4; g.strokeRect(22, y - 11, 16, 16);
    g.fillStyle = '#1b1a17'; g.font = `500 13px ${FONT.ui}`; g.fillText(x.t.name, 48, y + 1); g.fillStyle = '#7d6c4f'; g.font = `500 7.5px ${FONT.mono}`; g.letterSpacing = '1.2px'; g.fillText(ROOMS[x.t.ri].name.toUpperCase(), 48, y + 13); g.letterSpacing = '0px';
    g.strokeStyle = 'rgba(40,34,24,0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(22, y + 20); g.lineTo(w - 22, y + 20); g.stroke();
    o.boxes.push({ x: 22 * k, y: (y - 11) * k, w: 16 * k, h: 16 * k });
    const ticked = o.ticks ? o.ticks.get(x) : x.done;
    if (ticked) { g.strokeStyle = o.photo ? '#1a2a52' : '#1b1a17'; g.lineWidth = 2.1; g.lineCap = 'round'; g.lineJoin = 'round'; const j = (a) => (seedRnd(x.t.id * 7 + a) - 0.5) * 2.4; g.beginPath(); g.moveTo(24 + j(1), y - 2 + j(2)); g.lineTo(29 + j(3), y + 4 + j(4)); g.lineTo(42 + j(5), y - 15 + j(6)); g.stroke(); }
  });
  g.fillStyle = 'rgba(40,34,24,0.38)'; g.font = `500 7px ${FONT.mono}`; g.letterSpacing = '1.4px'; g.fillText(`ORRERY · CYCLE ${Math.floor(card.c / 39) + 1}`, 22, h - 16); g.letterSpacing = '0px';
  g.restore(); return o.boxes;
}
const photoTicks = (card) => { const m = new Map(); card.tasks.forEach((x, i) => m.set(x, i === 0 || i === 1 || i === 3)); return m; };    // what the pen did today
function drawPhoto(g, W, H, card, t, det, ph) {
  g.save(); g.fillStyle = '#0b0a09'; g.fillRect(0, 0, W, H); const bg = g.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.5, W * 0.7); bg.addColorStop(0, '#3a2f22'); bg.addColorStop(1, '#0c0a08'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.06; for (let i = 0; i < 70; i++) { g.fillStyle = i % 2 ? '#fff' : '#000'; g.fillRect(0, seedRnd(i) * H, W, 1); } g.globalAlpha = 1;
  const ch = H * 0.9, cw = ch * 2 / 3, cx = W / 2, cy = H / 2; g.translate(cx, cy); g.rotate(-0.05 + Math.sin(t * 0.6) * 0.004); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 30; g.shadowOffsetY = 12; g.translate(-cw / 2, -ch / 2);
  const boxes = drawPaper(g, cw, ch, card, { photo: true, ticks: photoTicks(card) }); g.shadowBlur = 0; g.shadowOffsetY = 0;
  // detection: a scan line passes over the card and each checkbox is read as it goes
  const sc = clamp((t - ph.t0) / 1.8, 0, 1), sy = sc * ch;
  g.save(); g.beginPath(); g.rect(0, 0, cw, ch); g.clip(); const sg = g.createLinearGradient(0, sy - 30, 0, sy + 2); sg.addColorStop(0, rgba(INK.verd, 0)); sg.addColorStop(1, rgba(INK.verd, 0.35)); g.fillStyle = sg; g.fillRect(0, sy - 30, cw, 32); g.fillStyle = rgba(INK.verd, 0.95); g.fillRect(0, sy, cw, 1.4); g.restore();
  boxes.forEach((b, i) => { if (sy < b.y + b.h) return; const d = det[i], age = clamp((sy - b.y) / 60, 0, 1), col = d.amb ? INK.amber : INK.verd; g.strokeStyle = rgba(col, 0.95 * age); g.lineWidth = 1.5; const pad = 4 + (1 - age) * 8; g.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2); g.fillStyle = rgba(col, age); g.font = `600 ${Math.max(9, cw * 0.04)}px ${FONT.mono}`; g.textAlign = 'left'; g.fillText(`${d.v === 'unsure' ? '?' : d.v ? '✓' : '○'} ${Math.round(d.conf * 100)}%`, b.x + b.w + 140 * (cw / 260), b.y + b.h * 0.8); });
  // viewfinder corners
  g.restore(); g.save(); g.strokeStyle = rgba(INK.ivory, 0.85); g.lineWidth = 1.5; const m = 14, L = 22; [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, a, b]) => { g.beginPath(); g.moveTo(x, y + b * L); g.lineTo(x, y); g.lineTo(x + a * L, y); g.stroke(); }); g.restore();
}
function setTaskDone(x, v) { x.done = v; x.open = !v; if (v) x.hour = 18; const c = CARDS[CARD_OF.get(x)]; if (c) c.done = c.tasks.filter((q) => q.done).length; const a = ATT.find((q) => q.x === x); if (a) a.done = v; }
const CARD_OF = new Map(); CARDS.forEach((c) => c.tasks.forEach((x) => CARD_OF.set(x, c.c)));
function pipAt(st, x) { const c = CARD_OF.get(x), k = CARDS[c].tasks.indexOf(x), p = st._dk && st._dk.pips[c * 8 + k]; return p ? { x: p.x + p.w / 2, y: p.y + p.h / 2 } : null; }

// ---- reading a real photo: resize, ask Claude which boxes are ticked, map the answer onto the card's tasks
let SAMPLE = null, SLIM = {}; (async () => { try { SAMPLE = window.claude ? await window.claude.use('sample') : null; if (SAMPLE) SLIM = await SAMPLE.limits().catch(() => ({})); } catch (e) { SAMPLE = null; } })();
async function resizePhoto(file, max = 1600) { const bmp = await createImageBitmap(file), k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); const blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.85)); return { blob, bmp: c }; }
async function readCardPhoto(file, card) {
  const { blob, bmp } = await resizePhoto(file); if (!SAMPLE || !SLIM.images) return { bmp, err: 'Reading photos needs Claude access, which this view doesn’t have. Your photo is shown, but nothing was read.' };
  const list = card.tasks.map((x, i) => `  item ${i}: ${x.t.name} (${ROOMS[x.t.ri].name})`).join('\n');
  const out = await SAMPLE.json(`This is a photo of a printed 4x6 paper checklist card hung up at home. The card prints its place like "${cardLabel(card)}", the day pair, and 3-6 tasks each with a checkbox. A box counts as checked if it has a check, X, fill or scribble. The card should be this one (tasks listed below); if what you see is clearly a different card or list, set "card_matches" false. Report each item's state, in the order printed. Be conservative: if a box is ambiguous give confidence below 0.7.
Expected tasks:
${list}

Reply with only JSON: {"card_matches":true,"card_code":"${cardLabel(card).replace(/ /g, '')}"|null,"items":[{"item":0,"checked":true,"confidence":0.95}],"notes":""}`, { images: [blob], modelTier: 'default', cache: false });
  const dec = card.tasks.map((x, i) => { const f = (out.items || []).find((q) => Number(q.item) === i), conf = f ? Number(f.confidence) || 0 : 0; return !f || conf < 0.7 ? { amb: true, v: 'unsure', conf: Math.max(conf, 0.3) } : { v: !!f.checked, conf }; });
  return { bmp, dec, note: out.card_matches === false ? 'That doesn’t look like this card — check the number in the corner.' : out.notes || '' };
}
function drawUserPhoto(g, W, H, bmp, t, reading) {
  g.save(); g.fillStyle = '#0b0a09'; g.fillRect(0, 0, W, H); const k = Math.min(W / bmp.width, H / bmp.height), w = bmp.width * k, h = bmp.height * k; g.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
  if (reading) { const y = ((t * 0.7) % 1) * H, sg = g.createLinearGradient(0, y - 40, 0, y); sg.addColorStop(0, rgba(INK.verd, 0)); sg.addColorStop(1, rgba(INK.verd, 0.4)); g.fillStyle = sg; g.fillRect(0, y - 40, W, 40); g.fillStyle = rgba(INK.verd, 0.95); g.fillRect(0, y, W, 1.5); }
  g.strokeStyle = rgba(INK.ivory, 0.85); g.lineWidth = 1.5; const m = 14, L = 22; [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, a, b]) => { g.beginPath(); g.moveTo(x, y + b * L); g.lineTo(x, y); g.lineTo(x + a * L, y); g.stroke(); }); g.restore();
}
// a hidden picker shared by desktop and phone: on an iPhone this offers the camera or the library
const picker = el('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.hidden = true; document.body.appendChild(picker); let pickCb = null;
picker.addEventListener('change', () => { const f = picker.files[0]; picker.value = ''; if (f && pickCb) pickCb(f); });
function pickPhoto(cb) { pickCb = cb; picker.click(); }
async function saveCardImage(card) { const dl = window.claude ? await window.claude.use('downloads').catch(() => null) : null; if (!dl) return toast('Saving files isn’t available in this view.');
  const c = document.createElement('canvas'); c.width = 1040; c.height = 1560; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1040, 1560); g.scale(4, 4); drawPaper(g, 260, 390, card, { ticks: new Map() });
  const blob = await new Promise((r) => c.toBlob(r, 'image/png')); try { await dl.save({ filename: `orrery-card-${String((card.c % 39) + 1).padStart(2, '0')}-of-39.png`, data: blob }); toast('Saved. Print it at 4×6, tick it with a pen, then photograph it.'); } catch (e) { if (e && e.code !== 'declined') toast('Couldn’t save the file.'); } }

// ---- inspector (desktop): the card, its photo, and what was read
const INSP = { open: false, c: NOW_CARD, t0: 0, dec: [], edit: false, bmp: null, reading: false, note: '' };
const insp = el('div', 'insp'); insp.id = 'insp'; $('#desk').appendChild(insp);
insp.innerHTML = `<div class="veil"></div><div class="mod"><div class="mh"><div><span class="lab" id="iK">Card</span><h3 id="iT"></h3></div><button class="x" id="iX">Close ✕</button></div>
<div class="mb"><div class="col1"><div class="lab">The printed card</div><canvas id="iPaper"></canvas><div class="row"><button class="btn" id="iEdit">Edit tasks</button><button class="btn" id="iPrint">Save to print</button></div><div class="note" id="iNote"></div></div>
<div class="col2"><div class="lab">Your photo → what Orrery read</div><canvas id="iPhoto"></canvas><ul class="dets" id="iDets"></ul><div class="row"><button class="btn v" id="iMine">◉ Use my photo</button><button class="btn" id="iRe">Sample photo</button><button class="btn" id="iSave">Save card image</button></div><div class="row"><button class="btn pri" id="iOk">Confirm &amp; log</button><span class="note" id="iMsg"></span></div></div></div></div>`;
const iPaper = $('#iPaper'), iPhoto = $('#iPhoto'); let iPg = null, iPh = null;
function detFor(c) { const card = CARDS[c], tk = photoTicks(card); return card.tasks.map((x, i) => { const amb = c === NOW_CARD && i === 2; return amb ? { amb: true, v: 'unsure', conf: 0.62 } : { v: tk.get(x), conf: 0.93 + seedRnd(i * 3 + c) * 0.06 }; }); }
function inspDetections() { return detFor(INSP.c); }
function openInspector(c, photo) {
  INSP.open = true; INSP.c = c; INSP.t0 = CLK.t; INSP.edit = false; INSP.bmp = null; INSP.reading = false; INSP.note = ''; INSP.dec = inspDetections(); const card = CARDS[c], live = c === NOW_CARD;
  insp.classList.add('open'); $('#iK').textContent = `Card ${cardLabel(card)} · ${SEGS[card.seg]} · Week ${Math.floor((c % 39) / 3) + 1}`; $('#iT').textContent = live ? 'Today’s card' : card.finished ? `Finished · ${card.done} of ${card.planned} done` : 'Coming up';
  iPg = fit(iPaper, 260, 390); iPh = fit(iPhoto, 560, 330); iPaper.style.width = '260px'; iPaper.style.height = '390px'; iPhoto.style.width = '560px'; iPhoto.style.height = '330px';
  $('#iOk').style.display = $('#iRe').style.display = $('#iDets').style.display = $('#iMine').style.display = $('#iSave').style.display = live ? '' : 'none'; $('#iMsg').textContent = live ? '' : '';
  $('#iNote').innerHTML = live ? 'Hang it, tick it with a pen. Edit before printing — the card is yours.' : 'Past cards are locked once their week is over, so you never chase old ones.'; $('#iEdit').style.display = live || !card.finished ? '' : 'none';
  if (!live) $('.col2 .lab', insp).textContent = card.finished ? 'Logged from your photo' : 'Not yet photographed';
  renderDets();
}
function renderDets() {
  const ul = $('#iDets'), card = CARDS[INSP.c]; ul.innerHTML = '';
  card.tasks.forEach((x, i) => { const d = INSP.dec[i], li = el('li', d.amb && d.v === 'unsure' ? 'amb' : ''); const val = d.v === 'unsure' ? '?' : d.v ? '✓' : '○';
    li.innerHTML = `<span class="s ${d.v === true ? 'ok' : ''}">${val}</span><span class="n">${x.t.name}</span><span class="r">${ROOMS[x.t.ri].name}</span><span class="c">${d.amb && d.v === 'unsure' ? '<button data-v="1">Done</button><button data-v="0">Not done</button>' : Math.round(d.conf * 100) + '%'}</span>`; li.querySelectorAll('button').forEach((b) => (b.onclick = () => { d.v = b.dataset.v === '1'; d.amb = false; d.conf = 1; renderDets(); })); ul.appendChild(li); });
  const open = INSP.dec.filter((d) => d.v === 'unsure').length; $('#iOk').disabled = open > 0; $('#iOk').style.opacity = open ? 0.45 : 1; if (!INSP.reading) $('#iMsg').textContent = INSP.note || (open ? 'One mark is unclear — tell it which.' : '');
}
function closeInspector() { INSP.open = false; insp.classList.remove('open'); }
$('#iX').onclick = closeInspector; $('.veil', insp).onclick = closeInspector;
$('#iRe').onclick = () => { INSP.bmp = null; INSP.note = ''; INSP.t0 = CLK.t; INSP.dec = inspDetections(); renderDets(); };
$('#iSave').onclick = () => saveCardImage(CARDS[INSP.c]);
$('#iMine').onclick = () => pickPhoto(async (file) => { const card = CARDS[INSP.c]; INSP.reading = true; INSP.note = ''; $('#iMsg').textContent = 'Reading your photo…'; $('#iOk').disabled = true;
  try { const r = await readCardPhoto(file, card); INSP.bmp = r.bmp; if (r.dec) { INSP.dec = r.dec; INSP.note = r.note; } else INSP.note = r.err; } catch (e) { INSP.note = e && e.code === 'not_granted' ? 'Claude access is off for this page. Allow it when prompted.' : e && e.code === 'rate_limited' ? 'Too many requests — try again in a minute.' : 'That read failed. Try a closer, brighter photo.'; }
  INSP.reading = false; renderDets(); $('#iMsg').textContent = INSP.note || ''; });
$('#iOk').onclick = () => { const card = CARDS[INSP.c]; card.tasks.forEach((x, i) => { const v = INSP.dec[i].v === true; if (v && !x.done) { setTaskDone(x, true); const p = pipAt(st, x); if (p) st.ripples.push({ x: p.x, y: p.y, t0: CLK.t + i * 0.12, s: 1 }); } }); renderAttn(); closeInspector(); toast(`Logged ${card.tasks.filter((x) => x.done).length} of ${card.planned}. The deck just lit up.`); if (st.mode.t < 0.5) setMode(1); };
$('#iEdit').onclick = () => { INSP.edit = !INSP.edit; $('#iEdit').textContent = INSP.edit ? 'Done editing' : 'Edit tasks'; renderEdit(); };
$('#iPrint').onclick = () => saveCardImage(CARDS[INSP.c]);
function renderEdit() { const card = CARDS[INSP.c], note = $('#iNote'); if (!INSP.edit) { note.innerHTML = 'Hang it, tick it with a pen. Edit before printing — the card is yours.'; return; }
  note.innerHTML = '<div class="edit">' + card.tasks.map((x, i) => `<div><span>${x.t.name}</span><button data-r="${i}" title="Remove">✕</button></div>`).join('') + `<div class="add"><select id="iAdd"><option value="">+ Add a task…</option>${TASKS.filter((t) => !card.tasks.some((x) => x.t === t)).map((t) => `<option value="${t.id}">${ROOMS[t.ri].name} · ${t.name}</option>`).join('')}</select></div><small>${card.tasks.length} of 3–5 · a 6th only if truly needed</small></div>`;
  note.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { if (card.tasks.length <= 3) return toast('A card keeps at least 3 tasks.'); card.tasks.splice(+b.dataset.r, 1); card.planned = card.tasks.length; INSP.dec = inspDetections(); renderDets(); renderEdit(); renderAttn(); }));
  $('#iAdd').onchange = (e) => { if (!e.target.value) return; if (card.tasks.length >= 6) return toast('Six is the ceiling.'); const x = { t: TASKS[+e.target.value], done: false, open: true, hour: 0 }; card.tasks.push(x); CARD_OF.set(x, card.c); card.planned = card.tasks.length; INSP.dec = inspDetections(); renderDets(); renderEdit(); renderAttn(); }; }
function drawInspector() { if (!INSP.open || !iPg) return; const card = CARDS[INSP.c]; iPg.clearRect(0, 0, 260, 390); drawPaper(iPg, 260, 390, card, {});
  if (INSP.c === NOW_CARD && INSP.bmp) drawUserPhoto(iPh, 560, 330, INSP.bmp, CLK.t, INSP.reading); else if (INSP.c === NOW_CARD) { const det = INSP.dec; drawPhoto(iPh, 560, 330, card, CLK.t, det, { t0: INSP.t0 }); } else { iPh.clearRect(0, 0, 560, 330); iPh.fillStyle = '#0b0a09'; iPh.fillRect(0, 0, 560, 330); drawPhoto(iPh, 560, 330, card, CLK.t, card.tasks.map((x) => ({ v: x.done, conf: 0.97 })), { t0: INSP.t0 }); } }
// ---- toast
const toastEl = el('div', 'toast'); $('#desk').appendChild(toastEl); let toastT; function toast(m) { toastEl.textContent = m; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), 3600); }

// ---- the Cards workspace
const work = $('#work');
work.innerHTML = `<div class="wh"><h2>Your cards</h2><p>You do this once a quarter. After that the paper does the work — you tick, photograph, and Orrery keeps the books.</p></div>
<div class="steps3">
<section class="st"><div class="sn"><i>1</i><b>Set tasks</b></div><p class="sd">Break each room into small jobs — one shelf, one sink — and say how often.</p><div class="plist" id="wPlan"></div><div class="chat" id="wChat"></div></section>
<section class="st"><div class="sn"><i>2</i><b>Deal the deck</b></div><p class="sd">Orrery spreads every job across 39 cards — 3 to 5 each — so no two days are a pile-up.</p><canvas id="wDeck"></canvas><div class="stats" id="wStats"></div><div class="row"><button class="btn" id="wRev">Review cards</button><button class="btn" id="wPrn">Save card to print</button></div></section>
<section class="st"><div class="sn"><i>3</i><b>Capture</b></div><p class="sd">Photograph the card at day’s end, or just say what you did. Past cards lock after their week.</p><button class="shoot" id="wShoot"><span class="cr"><i></i><i></i><i></i><i></i></span><b>Photograph today’s card</b><small>Card <span id="wCardN"></span> · reads checkmarks, asks only when unsure</small></button><div class="say"><div class="lab">Or tell it</div><div class="askrow"><input id="wSay" placeholder="“did the toilets and wiped the stove top”" autocomplete="off"></div><div id="wSayOut"></div></div><div class="lab" style="margin-top:14px">Recently captured</div><ul class="caps" id="wCaps"></ul></section></div>`;
function renderPlan() {
  const box = $('#wPlan'); box.innerHTML = ''; PLAN.forEach((r) => { const g = el('div', 'pg'); g.innerHTML = `<div class="ph"><b>${r.name}</b><span class="num">${r.tasks.length}</span></div>` + r.tasks.map((t) => `<div class="pt${t.fresh ? ' fresh' : ''}"><span>${t.name}</span><em>${freqLabel(t.f)}</em><i>${'●'.repeat(t.effort)}<u>${'●'.repeat(3 - t.effort)}</u></i></div>`).join(''); box.appendChild(g); });
  renderDealStats();
}
function renderDealStats() { const tot = planTotal(); $('#wStats').innerHTML = `<div><b>${tot}</b><span>placements</span></div><div><b>39</b><span>cards</span></div><div><b>${(tot / 39).toFixed(1)}</b><span>per card</span></div><div><b class="${tot > 195 ? 'bad' : ''}">${tot > 195 ? 'Over' : 'OK'}</b><span>195 budget</span></div>`; }
const CHAT = [['Kitchen is one big job. Want to break it by shelf?', ['Break kitchen by shelf', 'Add a plants routine']]];
function renderChat(extra) { const c = $('#wChat'); c.innerHTML = '<div class="lab">Plan with AI</div>'; (extra || [{ me: false, t: CHAT[0][0] }]).forEach((m) => c.appendChild(el('div', m.me ? 'me' : 'ai', m.t))); const chips = el('div', 'chips'); (extra && extra.chips ? extra.chips : CHAT[0][1]).forEach((q) => { const b = el('button', '', q); b.onclick = () => planAsk(q); chips.appendChild(b); }); c.appendChild(chips); }
let planMsgs = [{ me: false, t: CHAT[0][0] }];
function planAsk(q) { planMsgs.push({ me: true, t: q }); renderChat(Object.assign(planMsgs.slice(), { chips: [] })); setTimeout(() => { if (/shelf/i.test(q)) { const k = PLAN[0]; if (!k.tasks.some((t) => t.name === 'Wipe one shelf')) k.tasks.push({ name: 'Wipe one shelf', f: 7, effort: 1, fresh: true }); planMsgs.push({ me: false, t: 'Added “Wipe one shelf” to the kitchen, about every other week — one shelf per visit. It fits: no card goes over 5.' }); } else { const k = PLAN[7]; if (!k.tasks.some((t) => t.name === 'Mist the ferns')) k.tasks.push({ name: 'Mist the ferns', f: 13, effort: 1, fresh: true }); planMsgs.push({ me: false, t: 'Added “Mist the ferns”, weekly. Plants stay a short job.' }); } renderChat(Object.assign(planMsgs.slice(), { chips: ['Break bathrooms by sink', 'Show me the deal'] })); renderPlan(); drawWorkDeck(true); }, 700); }
function drawWorkDeck(replay) { const cv = $('#wDeck'), W = 320, H = 150; if (!cv._g) cv._g = fit(cv, W, H); if (replay) cv._t0 = CLK.t; cv._draw = true; }
function paintWorkDeck() { const cv = $('#wDeck'), g = cv._g; if (!g) return; const W = 320, H = 150, rv = CLK.t - (cv._t0 ?? -9); g.clearRect(0, 0, W, H); const cw = W / 13, ch = (H - 10) / 3, extra = planTotal() - 193; for (let i = 0; i < 39; i++) { const c = CARDS[i], x = Math.floor(i / 3) * cw, y = (i % 3) * ch, n = c.tasks.length + (extra > 0 && i % Math.max(1, Math.floor(39 / extra)) === 0 ? 1 : 0), d = clamp((rv - i * 0.025) / 0.4, 0, 1); g.globalAlpha = d; const yy = y + (1 - d) * -10; g.fillStyle = 'rgba(239,230,212,0.04)'; g.strokeStyle = rgba(INK.ivory, 0.14); g.beginPath(); g.roundRect(x + 1.5, yy + 1.5, cw - 3, ch - 3, 2); g.fill(); g.stroke(); for (let k = 0; k < n; k++) { g.fillStyle = n > 5 ? rgba(INK.ember, 0.95) : rgba(tone(0.5 + n * 0.09, 0, 0), 0.9); g.fillRect(x + 4, yy + 4 + k * ((ch - 8) / 5.6), cw - 8, Math.max(2, (ch - 8) / 5.6 - 2)); } g.globalAlpha = 1; } }
$('#wRev').onclick = () => openInspector(NOW_CARD); $('#wPrn').onclick = () => saveCardImage(CARDS[NOW_CARD]);
$('#wShoot').onclick = () => openInspector(NOW_CARD); $('#wCardN').textContent = cardLabel(CARDS[NOW_CARD]);
function renderCaps() { const ul = $('#wCaps'); ul.innerHTML = ''; for (let k = 1; k <= 3; k++) { const c = CARDS[NOW_CARD - k]; if (!c) continue; const li = el('li', '', `<span class="num">${cardLabel(c)}</span><span>${SEGS[c.seg]}</span><em>${c.done}/${c.planned} read</em>`); li.onclick = () => openInspector(c.c); ul.appendChild(li); } }
$('#wSay').addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; const q = e.target.value.toLowerCase(), hit = ATT.filter((a) => !a.done && a.t.name.toLowerCase().split(/\s+/).some((w) => w.length > 3 && q.includes(w.replace(/s$/, '')))); const out = $('#wSayOut'); if (!hit.length) { out.innerHTML = '<span class="mut">I couldn’t match that to anything open on today’s card.</span>'; return; } hit.forEach((a, i) => setTimeout(() => completeTask(a), i * 200)); out.innerHTML = 'Marked: ' + hit.map((a) => `<b>${a.t.name}</b>`).join(', '); e.target.value = ''; });
renderPlan(); renderChat(); drawWorkDeck(true); renderCaps();
