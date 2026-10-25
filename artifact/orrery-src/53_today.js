// ================================================================ TODAY: one glance (the wall), one action (today's card), one observation
let WALL = null;
const wallOf = () => { if (!WALL) { WALL = makeWall(); WALL.onCard = (setId, idx) => openCardSheet(setId, idx); } return WALL; };
const wordFor = (h) => (h >= 80 ? 'Strong' : h >= 68 ? 'Steady' : 'Strained');
function shortInsight(i) { if (!i) return ''; return { seg: `${SEGNAME[i.seg]} is the hard one`, holiday: 'holidays knock you off course', room: `${i.room} needs attention`, skipped: 'a few tasks keep getting skipped', trend: i.up ? 'climbing' : 'dipping lately', pair: `${i.a} and ${i.b} move together`, late: 'month-ends are harder', workout: 'workouts and chores go together', sweep: 'a clean sweep is within reach', recovery: 'bounce-backs are worth a look' }[i.kind] || ''; }
function ringSvg(h) {
  const arc = (r, v, c, i) => { const L = 2 * Math.PI * r; return `<circle cx="50" cy="50" r="${r}" fill="none" style="stroke:rgb(var(--ink-rgb) / .1)" stroke-width="5"/><circle class="arc" cx="50" cy="50" r="${r}" fill="none" stroke-width="5" stroke-linecap="round" stroke-dasharray="${L}" style="stroke:${c};--L:${L};--to:${L * (1 - clamp(v, 0, 1))}px;animation-delay:${i * 0.12}s" transform="rotate(-90 50 50)"/>`; };
  const ok = HEAD.state === 'ok';
  return `<svg class="ring" viewBox="0 0 100 100" role="img" aria-label="${ok ? `System health ${HEAD.health} out of 100` : 'System health: not enough data yet'}">${ok ? arc(44, HEAD.completion, 'var(--amber)', 0) + arc(35, HEAD.consistency ?? HEAD.completion, 'var(--copper)', 1) + arc(26, 0.5 + (HEAD.trend ?? 0) / 18, 'var(--verd)', 2) : arc(44, 0, 'var(--amber)', 0) + arc(35, 0, 'var(--copper)', 1) + arc(26, 0, 'var(--verd)', 2)}<text x="50" y="${ok ? 54 : 55}" text-anchor="middle" style="font:300 24px var(--display);fill:var(--ink)">${ok ? HEAD.health : '–'}</text></svg>`;
}
function statusFor(st) {
  const ins = MODEL.ins[0];
  const T = { rooms: ['Let’s set up your home.', 'A few quick steps and your first card is on the wall.'], deck: ['Next: deal your deck.', 'Your tasks become 39 two-day cards.'], review: ['Next: look over your cards.', 'Edit anything, then tick Reviewed.'], print: ['Next: print your cards.', 'Two per sheet, ready to hang.'], cycle: ['Last step: start your cycle.', 'That puts dates on the deck and opens card 01.'], tick: ['Your cycle is running.', 'Tick your first task, on paper or here.'] };
  if (st.next === 'tick' && st.begins) return [`Your cycle starts ${fmtDay(st.begins)}.`, 'Hang card 01 before then. The wall fills in as you tick.'];
  if (T[st.next]) return T[st.next];
  if (HEAD.state === 'empty') return ['Your cycle is under way.', 'The wall lights up as each card finishes.'];
  if (HEAD.state === 'early') return ['Off to a start.', 'Patterns appear after about two weeks of cards.'];
  const s = shortInsight(ins); return [`${wordFor(HEAD.health)}${s ? ' — ' + s : ''}.`, `${Math.round(HEAD.completion * 100)}% of tasks done lately · ${HEAD.run}-card run`];
}
const SETUP_STEPS = [['rooms', 'Rooms & tasks'], ['deck', 'Deal the deck'], ['review', 'Review the cards'], ['print', 'Print'], ['cycle', 'Start the cycle'], ['tick', 'First tick']];
function setupCard(st) {
  if (st.next === 'done') return '';
  const idx = SETUP_STEPS.findIndex((x) => x[0] === st.next), rem = st.deck ? st.deck.cards.filter((c) => !c.reviewed).length : 0;
  const copy = { rooms: ['Tell me about your home', 'Pick your rooms and I’ll add starter tasks sized to fit your cards. About two minutes.', 'Set up my home', 'rooms'], deck: ['Deal your deck', 'Orrery spreads your tasks over 39 two-day cards, 3 to 5 on each, so no day is a pile-up.', 'Deal my deck', 'deck'], review: ['Look over your cards', `Skim them, fix anything, tick Reviewed. ${rem} to go. “Approve remaining” does the rest.`, 'Review the cards', 'deck'], print: ['Print your cards', 'Two cards per letter sheet, with a blank strip at the top for a clamp.', 'Make the PDF', 'print'], cycle: ['Start your cycle', 'Choose when card 01 begins. Starting this week keeps all three of this week’s cards open.', 'Start the cycle', 'print'], tick: st.begins ? ['Hang card 01', `Your first day is ${fmtDay(st.begins)}. Hang card 01 where you will see it. Then tick a box with a pen and photograph it here, or tick it on this screen.`, '', ''] : ['Do your first task', 'Hang card 01, tick a box with a pen, then photograph it here. Or just tick it below.', '', ''] }[st.next];
  return `<section class="panel home setup"><div class="lab">Getting started · step ${idx + 1} of ${SETUP_STEPS.length}</div><h2>${copy[0]}</h2><p class="sub" style="margin:0 0 12px">${copy[1]}</p>${copy[2] ? `<button class="primary" data-setup="${copy[3]}" data-show="${st.next === 'review' ? 'review' : ''}">${copy[2]} ${icon('right')}</button>` : ''}
    <ol class="dots6">${SETUP_STEPS.map(([k, n], i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><i></i><span>${n}</span></li>`).join('')}</ol>${PREVIEW || !['rooms', 'deck'].includes(st.next) ? '' : `<button class="link" id="pv-go" style="padding-left:0">Look around with sample data first</button>`}</section>`;
}
function rolloverBanner() {
  const set = latestSet(); if (!set || set.demo || PREVIEW) return ''; const t = today(), end = set.cards[set.cards.length - 1].end_date, left = daysBetween(t, end), newer = S.decks.some((d) => d.n > (set.n || 0) && !S.sets.some((x) => x.deck === d.id));
  if (left > 14) return '';
  if (left < 0) return `<section class="panel hint"><b>Cycle ${set.n} is complete.</b> ${newer ? 'Your next deck is ready to print and start.' : 'Deal the next deck: it can keep your hard days lighter and give extra attention to rooms that slipped.'}<div style="margin-top:10px"><button class="primary sm" data-setup="${newer ? 'print' : 'deck'}">${newer ? 'Print and start it' : 'Deal the next deck'}</button></div></section>`;
  return `<section class="panel hint"><b>Cycle ${set.n} ends ${fmtShort(end)}.</b> ${newer ? 'Your next deck is dealt. Print it before then.' : 'Deal the next deck now so it is printed and ready.'}<div style="margin-top:10px"><button class="sec sm" data-setup="${newer ? 'print' : 'deck'}">${newer ? 'Print the next deck' : 'Plan the next deck'}</button></div></section>`;
}
function paperHtml(set, card, { t = today(), compact = false } = {}) {
  const locked = isLocked(card, t), done = card.items.filter((i) => i.done).length, tot = card.items.length, w = Math.floor(card.idx / 3) + 1, started = card.start_date <= t, S = segOf(card);
  return `<div class="paper ${tot && done === tot ? 'sealed' : ''}" data-card="${card.idx}" style="${segVars(S)}">
    <div class="ph"><div><div class="pt">${esc(card.label.replace('–', ' · ').toUpperCase())}</div><div class="pw">Week ${w} of ${Math.ceil(set.cards.length / 3)} · ${fmtShort(card.start_date)}${card.start_date !== card.end_date ? '–' + fmtShort(card.end_date).replace(/^\w+\s/, '') : ''}</div></div><span class="pm">${motifSvg(S)}</span></div>
    <div class="pl">${card.items.map((i) => `<label class="pi ${i.done ? 'done' : ''}"><input type="checkbox" data-id="${i.id}" ${i.done ? 'checked' : ''} ${locked ? 'disabled' : ''}><span class="bx">${icon('check')}</span><span class="pnm"><b>${esc(i.name)}</b>${i.room ? `<small>${esc(i.room)}</small>` : ''}</span></label>`).join('')}</div>
    <div class="pmsg">${esc(cardMsg(card))}</div>
    <div class="pf"><span>${done} of ${tot} done${locked ? ' · closed' : !started ? ' · not started' : ''}</span><div class="bar"><i style="width:${tot ? (100 * done) / tot : 0}%"></i></div><span class="pn">${pad(card.idx + 1)} / ${set.cards.length}</span></div></div>`;
}
function bindPaper(root, set, card, after) {
  root.querySelectorAll('.paper input[type=checkbox]').forEach((cb) => (cb.onchange = async () => {
    const was = card.items.find((i) => i.id === cb.dataset.id)?.done; cb.closest('.pi').classList.toggle('done', cb.checked);
    try { const r = await toggleItems(set.id, card.code, cb.checked ? { check: [cb.dataset.id] } : { uncheck: [cb.dataset.id] });
      if (cb.checked) { const cleared = r.some((x) => x.kind === 'card_clear'); rewardToast(cleared ? `Card ${pad(card.idx + 1)} complete ✓` : 'Done ✓', r); if (cleared && navigator.vibrate) try { navigator.vibrate([10, 40, 20]); } catch { /* no haptics */ } } else toast('Unchecked. XP for that task removed.');
    } catch (e) { toast(e.message); }
    after && after();
  }));
}
function renderToday() {
  buildModel(); const t = today(), st = setupState(), [say, sub] = statusFor(st), wall = wallOf();
  const wk = weekCards(t); let cc;
  if (wk) { const pick = wk.cards.find((c) => c.idx === ui.todayCard), dflt = wk.cards.find((c) => c.start_date <= t && t <= c.end_date) || wk.cards[wk.cards.length - 1]; cc = { set: wk.set, card: pick || dflt, week: wk.cards }; } else cc = currentCard(t);
  const hs = domainSummary('home', t), fs = domainSummary('fitness', t), target = S.settings.fitness_weekly_target, fdone = weekActiveDays(t), ins = MODEL.ins[0], s = hs.season, lastAct = S.entries.map((e) => e.date).sort().pop();
  const away = lastAct && !PREVIEW ? daysBetween(lastAct, t) : 0, xpToday = sum(S.entries.filter((e) => e.date === t).flatMap((e) => e.rewards || []));
  const rooms = roomStats(t).filter((r) => r.planned);
  view.innerHTML = `${S.err && !PREVIEW ? `<div class="notice">Storage problem: ${esc(S.err)}</div>` : ''}
    <section class="hero"><button class="ringbtn" id="ringbtn" aria-label="How you are doing">${ringSvg()}</button><div class="hero-t"><div class="lab">${new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' })}</div><h1 class="say">${esc(say)}</h1><p class="sub" style="margin:2px 0 0">${esc(sub)}</p></div></section>
    ${away >= 4 ? `<div class="hint"><b>Welcome back.</b> Cards from before this week are closed, so there is nothing to catch up on. Just tick what is in front of you.</div>` : ''}
    ${setupCard(st)}${rolloverBanner()}
    <div class="today-grid"><div class="tg-a">
      <section class="panel wallpanel"><div class="row wrap" style="margin-bottom:6px"><h2 style="margin:0" class="grow">${st.cycle ? 'This cycle' : 'The wall'}</h2><button class="link" id="wall-more">${icon('patterns')} Patterns</button></div><div id="wallhost"></div>
        ${rooms.length ? `<div class="chips-scroll" id="roomchips">${rooms.map((r) => `<button class="rchip ${r.heat ? 'hot' : ''}" data-room="${esc(r.room)}"><b>${esc(r.room)}</b><span>${Math.round(r.coverage * 100)}%</span>${r.tier ? `<em class="tier ${r.tier}"></em>` : ''}</button>`).join('')}</div>` : ''}
        <p class="sub" style="margin:10px 0 0" id="wallcap">Each column is a week, each row a two-day card, each bar a task. Tap a card to open it.</p></section>
      ${ins ? obsHtml(ins) : ''}</div>
    <div class="tg-b">${cc ? cardPanel(cc, t) : `<section class="panel"><h2>Today’s card</h2><div class="empty">${st.deck ? 'Print your cards and start a cycle to see today’s card here.' : 'Your card appears here once you have dealt a deck and started a cycle.'}</div></section>`}
      <section class="panel fitpanel fit"><div class="row"><div class="grow"><div class="lab">Fitness this week</div><div class="barlabel">${fdone} of ${target} active days${fdone >= target ? ' · all set' : ''}</div></div><button class="sec" id="fitlog">${icon('dumbbell')} Log workout</button></div><div class="bar"><i style="width:${Math.min(100, (100 * fdone) / target)}%"></i></div><button class="link" id="fitmore" style="padding-left:0">This week and recent workouts ›</button></section>
      <section class="panel prog"><div class="row wrap"><div class="grow"><div class="lab">${esc(s.name)} season</div><div class="barlabel">Level ${s.level} <span class="sub">· ${s.xp} XP${xpToday ? ` · +${xpToday} today` : ''}</span></div></div>
        <div class="momentum" title="Momentum rises with active days and dips gently after 2+ missed days. XP never goes down.">${Array.from({ length: MOMENTUM_MAX }, (_, i) => `<i class="${i < hs.momentum ? 'on' : ''}"></i>`).join('')}</div></div>
        <div class="bar"><i style="width:${Math.round((100 * s.into) / s.need)}%"></i></div><div class="row wrap" style="margin-top:6px"><span class="sub grow">${s.need - s.into} XP to level ${s.level + 1} · momentum ${hs.momentum} of ${MOMENTUM_MAX}</span>
        ${hs.shields.protected_today ? `<button class="sec sm" id="unshield">${icon('shield')} Soft day on · undo</button>` : `<button class="sec sm" id="shield" ${hs.shields.available ? '' : 'disabled'} title="Protects momentum for today. You earn one for every 7 active days (hold up to 3).">${icon('shield')} Soft day · ${hs.shields.available} ready</button>`}</div></section></div></div>`;
  wall.hist = true; $('#wallhost').append(wall.el); wall.update();
  bindToday(st, cc, t);
}
function obsHtml(ins) { return `<section class="panel obs"><div class="row"><span class="lab" style="color:var(--verd)">Noticed</span><span class="grow"></span><span class="sub">${ins.strength}</span></div><h3 class="obs-t">${esc(ins.title)}</h3><p class="sub" style="margin:4px 0 12px;font-size:15px;color:var(--ink2)">${esc(ins.detail)}</p><div class="row wrap"><button class="ai" id="obs-why">${icon('spark')} Show me why</button>${MODEL.ins.length > 1 ? `<button class="link" id="obs-more">${MODEL.ins.length - 1} more in Patterns ›</button>` : ''}</div></section>`; }
function cardPanel(cc, t) {
  const left = Math.round((parse(weekEnd(cc.card)) - parse(t)) / 864e5), pills = cc.week ? `<div class="seg wkseg" style="margin:0 0 10px">${cc.week.map((c) => `<button data-pick="${c.idx}" class="${c.idx === cc.card.idx ? 'on' : ''}"><i class="sdot" style="background:${segOf(c).band}"></i>${esc(c.label)} <span class="num">${c.items.filter((i) => i.done).length}/${c.items.length}</span></button>`).join('')}</div>` : '';
  return `<section class="panel cardpanel"><div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Today’s card</h2><span class="sub">${cc.week ? (left > 0 ? `open ${left} more day${left === 1 ? '' : 's'}` : 'last day to tick') : ''}</span></div>${pills}${paperHtml(cc.set, cc.card, { t })}
    <div class="row wrap actrow"><button class="primary grow" id="snap">${icon('camera')} Photograph card</button><button class="sec" id="tell">Tell it</button></div>
    <button class="link sm" id="cnote" style="padding-left:0;margin-top:2px">${icon('note')} ${notesOfCard(cc.set.id, cc.card.idx).length ? `${notesOfCard(cc.set.id, cc.card.idx).length} note${notesOfCard(cc.set.id, cc.card.idx).length === 1 ? '' : 's'} · ` : ''}Add a note</button>
    <p class="sub" style="margin:4px 0 0">${cc.week ? 'This week’s cards stay open through Sunday. After that they close, so there is never a backlog to catch up on.' : `Starts ${fmtShort(cc.card.start_date)}.`}</p></section>`;
}
function bindToday(st, cc, t) {
  view.querySelectorAll('[data-setup]').forEach((b) => (b.onclick = () => { if (b.dataset.show) ui.show = b.dataset.show; goPlan(b.dataset.setup); }));
  $('#pv-go')?.addEventListener('click', () => startPreview());
  view.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => { ui.todayCard = +b.dataset.pick; go('today', { keep: true }); }));
  $('#wall-more').onclick = () => go('patterns'); $('#ringbtn').onclick = openHealthSheet;
  $('#obs-why')?.addEventListener('click', () => openStory(MODEL.ins[0])); $('#obs-more')?.addEventListener('click', () => go('patterns'));
  $('#roomchips')?.addEventListener('click', (e) => { const b = e.target.closest('[data-room]'); if (b) openRoomSheet(b.dataset.room); });
  $('#snap')?.addEventListener('click', () => $('#snapfile').click()); $('#tell')?.addEventListener('click', () => openLog('say')); $('#cnote')?.addEventListener('click', () => openNoteSheet(cc.set.id, cc.card.idx));
  $('#fitlog').onclick = () => openLog('say', 'workout'); $('#fitmore').onclick = openFitnessSheet;
  if (cc) bindPaper(view, cc.set, cc.card, () => go('today', { keep: true }));
  const dom = 'home', setShield = (on) => async () => { try { const id = `${dom}_${t}`; if (on) { S.shields = [...S.shields, { id, domain: dom, date: t }]; go('today', { keep: true }); await queue(() => col('shields').doc(id).set({ domain: dom, date: t })); } else { S.shields = S.shields.filter((x) => x.id !== id); go('today', { keep: true }); await queue(() => col('shields').doc(id).delete()); } } catch (e) { toast(e.message); } };
  $('#shield')?.addEventListener('click', setShield(true)); $('#unshield')?.addEventListener('click', setShield(false));
}
