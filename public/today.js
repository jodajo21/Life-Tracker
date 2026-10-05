import { $, esc, api, toast, rewardToast, store, ymd, parse, queueCount } from './util.js';

const DOMAINS = { fitness: 'Fitness', home: 'Home' };
const TIER = { bronze: '🥉', silver: '🥈', gold: '🥇' };

export async function renderToday(view, rerender) {
  const date = ymd(new Date());
  const [d, pending] = await Promise.all([api('/today?date=' + date), queueCount()]);
  let dom = store.get('domain', 'home'); if (!DOMAINS[dom]) dom = 'home';
  const D = d.domains[dom];
  const cls = dom === 'fitness' ? 'fit' : 'home';
  const s = D.season;
  const pulse = sessionStorage.getItem('pulse') === '1'; sessionStorage.removeItem('pulse');
  const entryName = Object.fromEntries(D.entries.map((e) => [e.id, e.activity]));
  const events = d.xp_events.filter((e) => e.domain === dom);
  const xpToday = events.reduce((a, e) => a + e.xp, 0);
  const pct = (n, of) => (of ? Math.round((100 * n) / of) : 0);

  view.innerHTML = `
    ${pending ? `<div class="sync">↻ ${pending} waiting to sync</div>` : ''}
    <div class="seg dom">${Object.entries(DOMAINS).map(([k, n]) => `<button data-dom="${k}" class="${k === dom ? 'on' : ''}">${n} <small>Lv ${d.domains[k].season.level}</small></button>`).join('')}</div>

    <section class="panel ${cls}">
      <div class="row"><div><div class="sub">${esc(s.name)} season</div><h2 style="margin:0">Level ${s.level}</h2></div><span class="grow"></span><div style="text-align:right"><b>${s.xp} XP</b><div class="sub">${xpToday ? `+${xpToday} today` : 'this season'}</div></div></div>
      <div class="bar" title="${s.into} of ${s.need} XP to next level"><i style="width:${pct(s.into, s.need)}%"></i></div>
      <div class="sub">${s.need - s.into} XP to level ${s.level + 1}</div>

      <div class="chart-title">Today</div>
      <div class="bar big" data-near="${D.bar.left === 1 ? 1 : 0}"><i style="width:${pct(D.bar.done, D.bar.total)}%"></i></div>
      <div class="barlabel">${esc(D.bar.label)}</div>

      <div class="row wrap" style="margin-top:14px">
        <div class="momentum" title="Momentum rises with active days and dips gently after 2+ missed days. Your XP never goes down."><span class="sub">Momentum</span> ${Array.from({ length: D.momentum.max }, (_, i) => `<i class="${i < D.momentum.value ? 'on' : ''}"></i>`).join('')}</div>
        <span class="grow"></span>
        ${D.shields.protected_today
          ? `<button class="sec" id="unshield">🛡 Soft day on · undo</button>`
          : `<button class="sec" id="shield" ${D.shields.available ? '' : 'disabled'} title="Protects momentum for today. You earn one for every 7 active days (hold up to 3).">🛡 Soft day <small>${D.shields.available} ready</small></button>`}
      </div>
    </section>

    ${dom === 'home' ? homeSection(D) : fitnessSection(D)}
    ${dom === 'home' ? houseMap(d.rooms) : ''}

    <section class="panel"><h2>XP today${xpToday ? ` · +${xpToday}` : ''}</h2>
      ${events.length ? events.map((e) => `<div class="entry"><span>${e.kind === 'lucky' ? '✨ ' : ''}${esc(e.label)}${e.entry_id && entryName[e.entry_id] ? ` <span class="sub">· ${esc(entryName[e.entry_id])}</span>` : ''}</span><b>+${e.xp}</b></div>`).join('') : '<div class="empty">Nothing yet today — tap + to add something.</div>'}
      <p class="sub" style="margin:10px 0 0">Every log earns base XP. About ${Math.round(d.lucky_odds * 100)}% also drop a bonus — it's always shown here.</p></section>`;

  view.querySelectorAll('[data-dom]').forEach((b) => (b.onclick = () => { store.set('domain', b.dataset.dom); rerender(); }));
  const shield = (method) => async () => {
    try { await api(method === 'POST' ? '/shield' : `/shield?domain=${dom}&date=${date}`, { body: method === 'POST' ? { domain: dom, date } : undefined, method }); rerender(); } catch (e) { toast(e.message); }
  };
  $('#shield')?.addEventListener('click', shield('POST'));
  $('#unshield')?.addEventListener('click', shield('DELETE'));

  view.querySelectorAll('#items input').forEach((cb) => (cb.onchange = async () => {
    cb.closest('.check').classList.toggle('done', cb.checked);
    const y = window.scrollY;
    try {
      const r = await api(`/cards/${D.card.id}/items`, { body: cb.checked ? { check: [+cb.dataset.id] } : { uncheck: [+cb.dataset.id] }, queue: true });
      if (r.queued) { toast('Saved offline — will sync.'); return; }
      if (cb.checked) rewardToast('Done ✓', r.rewards || []); else toast('Unchecked — XP for that task removed.');
      await rerender(); window.scrollTo(0, y);
    } catch (e) { cb.checked = !cb.checked; cb.closest('.check').classList.toggle('done', cb.checked); toast(e.message); }
  }));
  view.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => { if (confirm('Delete this entry? Its XP is removed too.')) { await api('/entries/' + b.dataset.del, { method: 'DELETE' }); rerender(); } }));
  if (pulse && D.bar.left === 1) view.querySelector('#items .check:not(.done)')?.classList.add('pulse');
}

function itemRow(i) {
  return `<label class="check ${i.done ? 'done' : ''}"><input type="checkbox" data-id="${i.id}" ${i.done ? 'checked' : ''}><span>${esc(i.name)}${i.room ? `<small>${esc(i.room)}</small>` : ''}</span></label>`;
}
function homeSection(D) {
  const c = D.card;
  const logged = D.entries.filter((e) => e.source !== 'card');
  return `<section class="panel home"><h2>${c ? `${esc(c.label)} card <span class="sub">${c.code}${D.card_is_today ? '' : ' · starts ' + parse(c.start_date).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span>` : 'Cards'}</h2>
    ${c ? `<div id="items">${c.items.map(itemRow).join('')}</div>` : '<div class="empty">No card yet — generate a quarter on the Cards tab.</div>'}
    ${c ? '<p class="sub" style="margin:10px 0 0">Tap to check off, or snap a photo of the paper card with +.</p>' : ''}</section>
    ${logged.length ? `<section class="panel"><h2>Also logged today</h2>${logged.map(entryRow).join('')}</section>` : ''}`;
}
function fitnessSection(D) {
  return `<section class="panel fit"><h2>Logged today</h2>${D.entries.length ? D.entries.map(entryRow).join('') : '<div class="empty">Nothing yet. Tap + and say what you did.</div>'}</section>`;
}
function entryRow(e) {
  const d = JSON.parse(e.details || '{}'); delete d.card;
  const bits = Object.entries(d).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ');
  return `<div class="entry"><div><b>${esc(e.activity)}</b>${bits ? `<div class="sub">${esc(bits)}</div>` : ''}</div><button class="link danger" data-del="${e.id}" aria-label="Delete">✕</button></div>`;
}

function houseMap(rooms) {
  if (!rooms.length) return '';
  const near = rooms.filter((r) => r.heat && r.coverage < 1);
  return `<section class="panel home"><h2>House</h2><div class="rooms">${rooms.map((r) => `
      <div class="room ${r.heat ? 'heat' : ''} ${r.planned ? '' : 'idle'}" style="--cov:${r.coverage}" title="${r.done} of ${r.planned} planned tasks done this quarter">
        <b>${esc(r.room)}</b><span>${r.planned ? Math.round(r.coverage * 100) + '% lit' : 'not planned'}</span>
        <small>${r.tier ? TIER[r.tier] + ' ' : ''}${r.shards} shard${r.shards === 1 ? '' : 's'}${r.next ? ` · ${r.next} to next` : ''}</small></div>`).join('')}</div>
    ${near.length ? `<p class="sub" style="margin:10px 0 0">${near.map((r) => `${esc(r.room)} is ${Math.round(r.coverage * 100)}% lit`).join(' · ')}.</p>` : ''}
    <p class="sub" style="margin:6px 0 0">Rooms light up as their card tasks get done. Clear a whole card for a shard in each of its rooms.</p></section>`;
}
