// ================================================================ SHEETS: a card, a room, how you are doing, fitness, logging, photographing
function setWallFocus(f, label) {
  const w = wallOf(); w.setFocus(f); const cap = $('#wallcap'); if (!cap) return;
  if (f && label) { cap.innerHTML = `Showing <b>${esc(label)}</b> only. <button class="link" id="wf-clear" style="padding:0 4px;min-height:0">Clear</button>`; $('#wf-clear').onclick = () => setWallFocus(null); }
  else cap.textContent = 'Each column is a week, each row a two-day card, each bar a task. Tap a card to open it.';
}
function openCardSheet(setId, idx) {
  const draw = () => {
    const set = S.sets.find((s) => s.id === setId), card = set && set.cards.find((c) => c.idx === idx); if (!card) return closeSheet();
    const t = today(), locked = isLocked(card, t), end = weekEnd(card), latest = latestSet() && latestSet().id === set.id && !set.demo;
    const note = locked ? `Closed. Cards close after the Sunday of their week (${fmtShort(end)}).` : card.start_date > t ? `Starts ${fmtShort(card.start_date)}.` : `Open through Sunday ${fmtShort(end)}.`;
    const past = card.end_date < t, missed = card.items.filter((i) => !i.done), hist = past && missed.length ? `<p class="sub">Missed: ${missed.map((i) => esc(i.name)).join(', ')}.</p>` : '';
    const body = openSheet({ title: `Card ${pad(card.idx + 1)} of ${set.cards.length}`, refresh: draw, html: `${paperHtml(set, card)}<p class="sub" style="margin:12px 0 4px">${esc(note)}</p>${hist}<div class="row wrap" style="margin-top:10px">${locked ? '' : `<button class="primary grow" id="cs-snap">${icon('camera')} Photograph this card</button>`}${latest && !locked ? '<button class="sec" id="cs-edit">Edit this card</button>' : ''}</div>` });
    bindPaper(body, set, card, () => { go(current, { keep: true }); draw(); });
    $('#cs-snap')?.addEventListener('click', () => $('#snapfile').click());
    $('#cs-edit')?.addEventListener('click', () => { closeSheet(); ui.week = String(Math.floor(card.idx / 3) + 1); ui.show = 'all'; goPlan('deck'); setTimeout(() => $(`#card-${card.idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120); });
  };
  draw();
}
function openRoomSheet(room) {
  const t = today(), set = latestSet(), rs = roomStats(t).find((r) => r.room === room); if (!rs) return;
  const tasks = {}; if (set) for (const c of set.cards) if (c.start_date <= t) for (const i of c.items) if ((i.room || 'General') === room) { const o = (tasks[i.name] ||= { planned: 0, done: 0 }); o.planned++; if (i.done) o.done++; }
  const rows = Object.entries(tasks).map(([label, v]) => ({ label, value: v.done, of: v.planned })).sort((a, b) => a.value / a.of - b.value / b.of);
  const sp = spaceList().find((x) => x.name === room), lit = rs.planned ? Math.round(rs.coverage * 100) : 0;
  const body = openSheet({ title: room, html: `<div class="rates three" style="margin-bottom:6px"><div class="rate"><div class="sub">This cycle</div><b class="num">${lit}%</b><div class="sub">${rs.done} of ${rs.planned} tasks</div></div><div class="rate"><div class="sub">Shards</div><b class="num">${rs.shards}</b><div class="sub">${rs.tier ? { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }[rs.tier] : 'none yet'}${rs.next ? ` · ${rs.next} to next` : ''}</div></div></div>
    ${rows.length ? `<div class="chart-title">Tasks here, so far this cycle</div>${hbars(rows, 'var(--amber)')}` : ''}<p class="sub">Clear a whole card to earn a shard in each of its rooms.</p>
    <div class="row wrap" style="margin-top:12px"><button class="ai" id="rs-show">${icon('spark')} Show only ${esc(room)} on the wall</button>${sp ? `<button class="sec" id="rs-plan">Plan this room</button>` : ''}</div>` });
  $('#rs-show', body).onclick = () => { closeSheet(); setWallFocus({ rooms: new Set([room]) }, room); scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#rs-plan', body)?.addEventListener('click', () => { closeSheet(); store.set('space', sp.key); ui.pane = 'chat'; goPlan('rooms'); });
}
function openHealthSheet() {
  const h = HEAD, ok = h.state === 'ok', pct1 = (v) => (v == null ? '–' : Math.round(v * 100));
  const row = (lab, val, unit, say, color) => `<div class="hrow"><i style="background:${color}"></i><div class="grow"><div class="lab">${lab}</div><div class="hv"><span class="num">${val}</span><small>${unit}</small></div><p class="sub" style="margin:2px 0 0">${say}</p></div></div>`;
  openSheet({ title: 'How you are doing', html: !ok ? `<div class="empty">This fills in once a few cards have finished, usually after the first week. Until then, there is nothing to judge.</div>` : `<div style="width:150px;margin:0 auto 6px">${ringSvg()}</div><p class="sub" style="text-align:center;margin:0 0 12px">System health, 0 to 100, from the four measures below.</p>
    ${row('Completion', pct1(h.completion), '%', 'Share of tasks done on cards that have finished, over the last four weeks.', '#e3a24a')}${row('Consistency', h.consistency == null ? '–' : Math.round(h.consistency * 100), '/100', h.consistency == null ? 'Needs about four weeks of cards.' : 'How steady your weeks are. Even weeks score high; boom-and-bust weeks score low.', '#c8794a')}
    ${row('Trend', h.trend == null ? '–' : (h.trend > 0 ? '+' : '') + h.trend.toFixed(1), 'pts a week', h.trend == null ? 'Needs about four weeks of cards.' : h.trend >= 0 ? 'Climbing over the last six weeks.' : 'Slipping a little over the last six weeks. Small and fixable.', '#6fb0a3')}
    ${row('Sticking points', h.sticky.length, h.sticky.length === 1 ? 'task' : 'tasks', h.sticky.length ? h.sticky.slice(0, 4).map((x) => `${esc(x.name)} (${x.d}/${x.p})`).join(' · ') : 'Nothing is resisting you right now.', '#e5683c')}
    ${row('On-track run', h.run, h.run === 1 ? 'card' : 'cards', `Cards in a row with 60% or more done. Your best is ${h.best}.`, '#8fa1b3')}` });
}
function openFitnessSheet() {
  const t = today(), mon = ymd(monday(parse(t))), target = S.settings.fitness_weekly_target, es = entriesOf('fitness');
  const days = WD.map((d, i) => { const iso = addDaysIso(mon, i), n = es.filter((e) => e.date === iso).length; return `<div class="fd ${n ? 'on' : ''} ${iso === t ? 'today' : ''}"><span>${d[0]}</span><i></i></div>`; }).join('');
  const weeks = Array.from({ length: 8 }, (_, k) => { const from = addDaysIso(mon, -7 * (7 - k)), to = addDaysIso(from, 6); return { label: fmtShort(from).replace(' ', ''), value: new Set(es.filter((e) => e.date >= from && e.date <= to).map((e) => e.date)).size }; });
  const recent = es.filter((e) => e.date >= addDaysIso(t, -14)).sort((a, b) => b.date.localeCompare(a.date) || (b.created || '').localeCompare(a.created || ''));
  const body = openSheet({ title: 'Fitness', html: `<div class="fdays">${days}</div><p class="sub">${weekActiveDays(t)} of ${target} active days this week. Your target is on the More tab.</p>
    <div class="chart-title">Active days, last 8 weeks</div>${bars(weeks.map((w) => ({ ...w })), 'var(--steel)', { height: 100, showEvery: 1 })}
    <div class="chart-title">Recent</div>${recent.length ? recent.slice(0, 12).map((e) => { const d = { ...e.details }; delete d.card; const bits = Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · '); return `<div class="entry"><div><b>${esc(e.activity)}</b><div class="sub">${parse(e.date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}${bits ? ' · ' + esc(bits) : ''}</div></div><button class="link danger" data-del="${e.id}" aria-label="Delete">✕</button></div>`; }).join('') : '<div class="empty">No workouts logged yet.</div>'}
    <div class="row wrap" style="margin-top:14px"><button class="primary grow" id="fs-log">${icon('dumbbell')} Log a workout</button>${recent[0] ? `<button class="sec" id="fs-again" title="Log ${esc(recent[0].activity)} again for today">Same as last time</button>` : ''}</div>`, refresh: openFitnessSheet });
  $('#fs-again', body)?.addEventListener('click', async () => { const l = recent[0]; const e = await addEntry({ goal: 'fitness', date: today(), activity: l.activity, cat: l.cat, details: l.details || {}, raw: 'repeat', source: 'repeat' }); rewardToast(`Logged ✓ ${e.activity}`, e.rewards); openFitnessSheet(); go(current, { keep: true }); });
  $('#fs-log', body).onclick = () => openLog('say', 'workout');
  body.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => confirmDialog('Delete this entry? Its XP is removed too.', async () => { await removeEntry(b.dataset.del); openFitnessSheet(); go(current, { keep: true }); }, { danger: true, yes: 'Delete' })));
}

// ---------------------------------------------------------------- logging by text, and photographing a card
function openLog(mode = 'say', hint = '') {
  const body = openSheet({ title: 'Log', html: `${sample ? '' : '<div class="notice">Claude isn’t available in this view, so I can’t read notes or photos. You can still tick tasks on Today.</div>'}
    <button class="bigbtn" id="lg-snap" ${sample && limits.images ? '' : 'disabled'}>${icon('camera')}<span><b>Photograph a card</b><small>Hold it flat, in good light. I find the card and read the boxes.</small></span></button>
    <div class="chart-title" style="margin-top:18px">Or tell me what you did</div>
    <textarea id="lg-text" placeholder="${hint === 'workout' ? 'e.g. legs: squats 5x5 at 185, then 2 miles on the bike' : 'e.g. cleaned both bathrooms and ran 3 miles'}" ${sample ? '' : 'disabled'}></textarea>
    <p class="sub" style="margin:6px 0">Tap the microphone on your keyboard to say it instead of typing.</p><p id="lg-status" class="sub" aria-live="polite"></p>
    <div class="row"><span class="grow"></span><button class="primary" id="lg-go" ${sample ? '' : 'disabled'}>Log it</button></div>` });
  $('#lg-snap', body).onclick = () => $('#snapfile').click();
  const submit = async () => {
    const text = $('#lg-text', body).value.trim(); if (!text) return; const b = $('#lg-go', body); b.disabled = true; $('#lg-status', body).textContent = 'Working on it…';
    try {
      const r = await logText(text, 'text');
      if (!r.saved.length) { $('#lg-status', body).textContent = r.clarification || 'I couldn’t find anything to log.'; return; }
      closeSheet(); rewardToast(`Logged ✓ ${r.saved.map((s) => s.activity).join(', ')}`, r.saved.flatMap((s) => s.rewards));
      if (r.pending.length) setTimeout(() => toast(`Not sure if ${r.pending[0].a} is the same as ${r.pending[0].b}. Check More.`), 2600);
      go(current === 'ask' ? 'today' : current, { keep: true });
    } catch (e) { $('#lg-status', body).textContent = errCopy(e); } finally { b.disabled = false; }
  };
  $('#lg-go', body).onclick = submit; $('#lg-text', body).onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); };
  if (mode === 'say') setTimeout(() => $('#lg-text', body)?.focus(), 350);
}
$('#snapfile').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) handlePhoto(f); };
$('#tbLog').onclick = () => openLog(); $('#topLog').onclick = () => openLog();
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openLog(); } });

async function handlePhoto(file) {
  const url = URL.createObjectURL(file), done = () => URL.revokeObjectURL(url);
  const shell = (title, inner, extra = {}) => openSheet({ title, html: `<div class="photo-wrap ${extra.scan ? 'scan' : ''}"><img src="${url}" alt="Your photo of the card"><i class="scanline"></i></div>${inner}`, onClose: done });
  shell('Reading your card…', '<p class="sub" style="text-align:center">Finding which card this is and which boxes are ticked.</p>', { scan: true });
  let r;
  try { r = await readCardPhoto(file); } catch (e) { shell('Could not read it', `<div class="notice">${esc(errCopy(e))}</div><div class="row"><button class="sec" id="ph-again">Try another photo</button></div>`); $('#ph-again').onclick = () => $('#snapfile').click(); return; }
  if (!r.card) { const wk = weekCards(today()); shell('Which card is this?', `<div class="notice">${esc(r.notes)}</div>${wk ? `<p class="sub">Or open one of this week’s cards and tick it by hand:</p><div class="row wrap">${wk.cards.map((c) => `<button class="sec" data-open="${c.idx}">${esc(c.label)}</button>`).join('')}</div>` : ''}<div class="row" style="margin-top:12px"><button class="primary" id="ph-again">Try another photo</button></div>`); $('#ph-again').onclick = () => $('#snapfile').click(); $('#shB').querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openCardSheet(wk.set.id, +b.dataset.open))); return; }
  const set = S.sets.find((s) => s.id === r.card.setId), added = r.proposal.filter((p) => p.checked && !p.was_done), left = r.proposal.filter((p) => !p.checked).length;
  const apply = async (ids, unids = []) => { const rw = await toggleItems(r.card.setId, r.card.code, { check: ids, uncheck: unids }); return rw; };
  const summary = `<div class="phmeta"><b>Card ${pad(r.card.idx + 1)} / ${set.cards.length}</b> · ${esc(r.card.label)} · cycle ${r.card.n}</div>`;
  if (r.sure) {
    const rw = await apply(added.map((p) => p.item_id)); const cleared = rw.some((x) => x.kind === 'card_clear'); go(current, { keep: true });
    shell(cleared ? 'Card complete' : 'Logged', `${summary}<p style="margin:6px 0 10px">${added.length ? `<b>${added.length} new tick${added.length === 1 ? '' : 's'}</b>: ${added.map((p) => esc(p.name)).join(', ')}.` : 'Nothing new to record; those boxes were already ticked.'} ${left ? `${left} still open.` : 'Every task is done.'}</p><div class="row wrap"><button class="primary" id="ph-ok">Done</button>${added.length ? '<button class="sec" id="ph-undo">Undo</button>' : ''}</div>`);
    $('#ph-ok').onclick = closeSheet; $('#ph-undo')?.addEventListener('click', async () => { await apply([], added.map((p) => p.item_id)); toast('Undone.'); closeSheet(); go(current, { keep: true }); });
    rewardToast(cleared ? `Card ${pad(r.card.idx + 1)} complete ✓` : `Card ${pad(r.card.idx + 1)}: ${added.length} new ✓`, rw); return;
  }
  const body = shell('Is this right?', `${summary}<p class="sub">I wasn’t fully sure about a few boxes. Nothing is recorded until you confirm. ${esc(r.notes)}</p><div class="paper-list">${r.proposal.map((p) => `<label class="check ${p.confidence < 0.8 ? 'unsure' : ''}"><input type="checkbox" data-id="${p.item_id}" data-was="${p.was_done ? 1 : 0}" ${p.checked ? 'checked' : ''}><span>${esc(p.name)}${p.confidence < 0.8 ? '<small>unsure — please check</small>' : ''}</span></label>`).join('')}</div><div class="row" style="margin-top:12px"><button class="sec" id="ph-cancel">Cancel</button><span class="grow"></span><button class="primary" id="ph-conf">Confirm</button></div>`);
  $('#ph-cancel', body).onclick = closeSheet;
  $('#ph-conf', body).onclick = async () => { const boxes = [...body.querySelectorAll('.paper-list input')]; try { const rw = await apply(boxes.filter((b) => b.checked && b.dataset.was === '0').map((b) => b.dataset.id), boxes.filter((b) => !b.checked && b.dataset.was === '1').map((b) => b.dataset.id)); closeSheet(); rewardToast('Card updated', rw); go(current, { keep: true }); } catch (e) { toast(e.message); } };
}
