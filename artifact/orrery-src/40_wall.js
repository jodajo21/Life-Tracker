// ================================================================ THE WALL: a cycle as 39 small cards. Columns are weeks, rows are the three two-day cards, each bar is one task.
// lit = done · dashed = missed · pulsing = open now · faint = still ahead · gold line under a card = every task done
const SEGLAB = ['MON–TUE', 'WED–THU', 'FRI–SAT'];
function makeWall() {
  const el = document.createElement('div'); el.className = 'wall'; const W = { el, cy: null, focus: null, prev: new Map(), onCard: null, hist: true, sig: '' };
  const cyclesList = () => S.sets.slice().sort((a, b) => a.n - b.n);
  const segRateOf = (set, seg, t) => { let p = 0, d = 0; for (const c of set.cards) if (c.idx % 3 === seg && c.end_date < t && c.items.length && !isPreStart(set, c)) { p += c.items.length; d += c.items.filter((i) => i.done).length; } return p ? d / p : null; };
  const cardRate = (c, t) => (c.end_date < t && c.items.length ? c.items.filter((i) => i.done).length / c.items.length : null);
  const heatCss = (v) => `rgba(${v < 0.5 ? '229,104,60' : v < 0.8 ? '217,136,70' : '242,192,109'},${(0.25 + 0.7 * v).toFixed(2)})`;
  W.sets = cyclesList; W.current = () => { const l = cyclesList(); return l.find((s) => s.n === W.cy) || l[l.length - 1] || null; };
  W.update = ({ animate = false } = {}) => {
    const t = today(), list = cyclesList(), set = W.current(), deck = !set ? currentDeck() : null;
    if (set) W.cy = set.n;
    const cards = set ? set.cards.slice().sort((a, b) => a.idx - b.idx) : deck ? deck.cards.slice().sort((a, b) => a.idx - b.idx).map((c) => ({ ...c, start_date: null, end_date: '9999', items: c.items.map((i) => ({ ...i, done: false })) })) : Array.from({ length: 39 }, (_, i) => ({ idx: i, code: `C${pad(i + 1)}`, label: SEGNAME[i % 3], start_date: null, end_date: '9999', items: Array.from({ length: 4 }, (_, k) => ({ id: `${i}-${k}`, name: 'Task', room: '', done: false })) }));
    const ghost = !set, nowIdx = set ? (cards.find((c) => c.start_date <= t && t <= c.end_date) || {}).idx ?? -1 : -1, nowW = set && t >= set.start_date ? Math.floor(daysBetween(set.start_date, t) / 7) : -1;
    const weeks = 13, rows = [0, 1, 2], prevSet = set ? list.filter((x) => x.n < set.n).pop() : null;
    let h = `<div class="wall-top"><div class="wall-cap">${ghost ? `<b>${deck ? 'Your deck, waiting to start' : 'Your cycle will appear here'}</b>` : `<b>Cycle ${set.n}</b>${cycleRateText(set, t)}<div class="wcd">${fmtShort(set.start_date)} – ${fmtShort(cards[cards.length - 1].end_date)}</div>`}</div>${list.length > 1 ? `<div class="wall-nav"><button data-wn="-1" aria-label="Older cycle" ${W.cy === list[0].n ? 'disabled' : ''}>${icon('left')}</button><button data-wn="1" aria-label="Newer cycle" ${W.cy === list[list.length - 1].n ? 'disabled' : ''}>${icon('right')}</button></div>` : ''}</div>`;
    h += `<div class="wall-grid ${ghost ? 'ghost' : ''}"><div></div>`;
    for (let w = 0; w < weeks; w++) { const c0 = cards.find((c) => c.idx === w * 3), d = c0 && c0.start_date, hol = d && holidayNear(d, addDaysIso(d, 6)); const isNow = nowW === w; h += `<div class="wh ${isNow ? 'now' : ''}" ${hol ? `title="${esc(hol)}"` : ''}><b>${w + 1}</b>${d ? `<small>${fmtShort(d).replace(' ', ' ')}</small>` : ''}${hol ? '<u></u>' : ''}</div>`; }
    for (const s of rows) {
      const r = set ? segRateOf(set, s, t) : null, rp = prevSet ? segRateOf(prevSet, s, t) : null, dl = r != null && rp != null ? r - rp : 0;
      h += `<div class="rl"><b>${SEGLAB[s]}</b>${r != null ? `<span class="rt">${Math.round(r * 100)}${dl > 0.03 ? '<em class="u">▲</em>' : dl < -0.03 ? '<em class="d">▼</em>' : ''}</span>` : ''}</div>`;
      for (let w = 0; w < weeks; w++) {
        const c = cards.find((x) => x.idx === w * 3 + s); if (!c) { h += '<div class="cd ghost"></div>'; continue; }
        const pre = !ghost && isPreStart(set, c), locked = !ghost && !pre && isLocked(c, t), fin = !ghost && !pre && c.end_date < t, isNow = c.idx === nowIdx, started = !ghost && !pre && c.start_date <= t, rate = pre ? null : cardRate(c, t), done = c.items.filter((i) => i.done).length, sealed = c.items.length && done === c.items.length && (fin || started);
        const pips = c.items.map((i) => { const st = i.done ? 'done' : pre ? 'pre' : locked ? 'miss' : fin ? 'late' : started ? 'open' : 'fut', key = `${set ? set.id : 'x'}:${c.idx}:${i.id}`, was = W.prev.get(key), just = was === false && i.done; W.prev.set(key, !!i.done); return `<i class="pp ${st}${just ? ' just' : ''}" data-k="${esc(key)}" data-room="${esc(i.room || '')}" data-task="${esc(i.name)}"></i>`; }).join('');
        const label = `Card ${c.idx + 1} of 39, ${c.label}, week ${w + 1}. ${ghost ? 'Not started.' : `${done} of ${c.items.length} done.`}`;
        h += `<button class="cd ${isNow ? 'now' : ''} ${fin ? 'past' : ''} ${pre ? 'pre' : ''} ${sealed ? 'sealed' : ''}" data-i="${c.idx}" data-seg="${s}" style="--c:${w}" ${ghost ? 'tabindex="-1"' : ''} aria-label="${esc(label)}"><span class="pips">${pips}</span>${rate != null ? `<span class="cr" style="color:${heatCss(rate)}">${Math.round(rate * 100)}</span>` : ''}</button>`;
      }
    }
    h += '</div>';
    if (W.hist && list.length > 1) h += `<div class="wall-hist" aria-label="Cycles">${list.map((x) => `<button class="ht ${x.n === W.cy ? 'on' : ''}" data-hn="${x.n}" aria-label="Cycle ${x.n}"><svg viewBox="0 0 39 9" preserveAspectRatio="none" aria-hidden="true">${x.cards.slice().sort((a, b) => a.idx - b.idx).map((c) => { const r = cardRate(c, t), wk = Math.floor(c.idx / 3), sg = c.idx % 3; return `<rect x="${wk * 3}" y="${sg * 3}" width="2.6" height="2.6" rx=".5" fill="${r == null ? 'rgba(143,161,179,.2)' : heatCss(r)}"/>`; }).join('')}</svg><span>${x.n}</span></button>`).join('')}</div>`;
    const sig = `${set ? set.id : 'x'}|${W.cy}`, entering = animate || sig !== W.sig; W.sig = sig;
    W.el.classList.toggle('enter', entering); W.el.innerHTML = h; W.applyFocus();
    const hs = W.el.querySelector('.wall-hist'), on = hs && hs.querySelector('.ht.on'); if (on) hs.scrollLeft = on.offsetLeft - hs.clientWidth / 2 + on.offsetWidth / 2;
    if (entering) setTimeout(() => W.el.classList.remove('enter'), 1200);
    W.el.querySelectorAll('.pp.just').forEach((p) => { const r = document.createElement('b'); r.className = 'rip'; p.append(r); setTimeout(() => { r.remove(); p.classList.remove('just'); }, 1400); });
  };
  function cycleRateText(set, t) { let p = 0, d = 0; for (const c of set.cards) if (c.end_date < t && !isPreStart(set, c)) { p += c.items.length; d += c.items.filter((i) => i.done).length; } return p ? `<em>${Math.round((100 * d) / p)}% done</em>` : ''; }
  // emphasis: dim what the story is not about, ring what it is
  W.setFocus = (f) => { W.focus = f; W.applyFocus(); };
  W.applyFocus = () => {
    const f = W.focus || {}, segs = f.segs || null, rooms = f.rooms || null, tasks = f.tasks || null, link = f.link || null;
    W.el.querySelectorAll('.cd[data-seg]').forEach((c) => c.classList.toggle('dim', !!segs && segs[+c.dataset.seg] < 0.6));
    W.el.querySelectorAll('.rl').forEach((r, i) => r.classList.toggle('dim', !!segs && segs[i] < 0.6));
    W.el.querySelectorAll('.pp').forEach((p) => { const rm = p.dataset.room, tk = p.dataset.task; const roomOn = !rooms || rooms.has(rm), taskOn = !tasks || tasks.has(tk); p.classList.toggle('dim', !(roomOn && taskOn)); p.classList.toggle('hl', !!((tasks && tasks.has(tk)) || (link && link.includes(rm)))); });
    W.el.classList.toggle('focused', !!(segs || rooms || tasks || link));
  };
  W.select = (n) => { W.cy = n; W.update({ animate: true }); };
  // taps and hovers
  W.el.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-wn]'), hist = e.target.closest('[data-hn]'), cd = e.target.closest('.cd[data-i]');
    if (nav) { const l = cyclesList(), i = l.findIndex((x) => x.n === W.cy) + +nav.dataset.wn; if (l[i]) W.select(l[i].n); }
    else if (hist) W.select(+hist.dataset.hn);
    else if (cd && W.current() && W.onCard) W.onCard(W.current().id, +cd.dataset.i);
  });
  const tip = document.createElement('div'); tip.className = 'walltip'; tip.setAttribute('aria-hidden', 'true'); document.body.append(tip);
  W.el.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const cd = e.target.closest('.cd[data-i]'), set = W.current(); if (!cd || !set) { tip.classList.remove('on'); return; } const c = set.cards.find((x) => x.idx === +cd.dataset.i); if (!c) return; const t = today(), fin = c.end_date < t;
    tip.innerHTML = `<b>Card ${pad(c.idx + 1)} / 39</b><span class="s">${esc(c.label)} · ${fmtShort(c.start_date)}</span>${c.items.map((i) => `<div><span>${i.done ? '✓' : fin ? '○' : '·'} ${esc(i.name)}</span><small>${esc(i.room || '')}</small></div>`).join('')}`;
    const r = cd.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 270, Math.max(8, r.left + r.width / 2 - 120)) + 'px'; tip.style.top = (r.bottom + 8 + 150 > innerHeight ? Math.max(8, r.top - 8 - tip.offsetHeight) : r.bottom + 8) + 'px'; tip.classList.add('on'); });
  W.el.addEventListener('pointerleave', () => tip.classList.remove('on'));
  return W;
}
