// ================================================================ UI helpers: icons, toasts, sheets, router
const ICON = {
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2 1-1.2 1.8M12 16.6v.1"/>',
  today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
  plan: '<rect x="4" y="4" width="7" height="7" rx="1.6"/><rect x="13" y="4" width="7" height="7" rx="1.6"/><rect x="4" y="13" width="7" height="7" rx="1.6"/><rect x="13" y="13" width="7" height="7" rx="1.6"/>',
  patterns: '<path d="M3 18 9 9l4 5 3-4 5 8"/><path d="M3 21h18" opacity=".45"/>',
  ask: '<path d="M5 6.5h14v9.5h-8l-4.5 3.5V16H5z"/><path d="M9 11h6" opacity=".7"/>',
  more: '<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', camera: '<path d="M4 8.5h3.2l1.6-2.3h6.4l1.6 2.3H20V19H4z"/><circle cx="12" cy="13.4" r="3.4"/>',
  shield: '<path d="M12 3.5 19 6.5v5.5c0 4.2-3 7.2-7 9-4-1.8-7-4.8-7-9V6.5z"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="M14.5 6 8.5 12l6 6"/>', right: '<path d="M9.5 6l6 6-6 6"/>', print: '<path d="M7 9V4h10v5M7 17H4.5V9H19.5v8H17"/><rect x="7" y="14" width="10" height="6"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>', spark: '<path d="M12 3.5 13.8 10 20.5 12 13.8 14 12 20.5 10.2 14 3.5 12 10.2 10z"/>', lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  dumbbell: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>', flag: '<path d="M6 21V4M6 5h11l-2.5 3.5L17 12H6"/>', book: '<path d="M5 4.5h10.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10.5" opacity=".7"/>',
};
const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;

function toastAction(msg, label, fn, ms = 7000) { const d = document.createElement('div'); d.className = 'toast'; d.append(msg + ' '); const b = document.createElement('button'); b.textContent = label; b.onclick = () => { d.remove(); fn(); }; d.append(b); $('#toasts').append(d); setTimeout(() => d.remove(), ms); }
function toast(msg, ms = 3800) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('#toasts').append(d); setTimeout(() => d.remove(), ms); }
function rewardToast(head, rewards = []) {
  const d = document.createElement('div'); d.className = 'toast'; const total = sum(rewards);
  d.innerHTML = `<b>${esc(head)}</b>${total ? ` · +${total} XP` : ''}` + rewards.filter((r) => r.kind !== 'base').map((r) => `<div class="s2">${r.kind === 'lucky' ? '✦ ' : ''}${esc(r.label)} +${r.xp}</div>`).join('');
  $('#toasts').append(d); setTimeout(() => d.remove(), 5200);
}
async function refreshBadge() { document.querySelectorAll('.badge').forEach((b) => { b.hidden = !S.sugg.length; b.textContent = S.sugg.length; }); }
function confirmDialog(msg, onYes, { yes = 'Yes', danger = false } = {}) {
  const d = $('#dlg'); d.innerHTML = `<p style="margin-top:0">${esc(msg)}</p><div class="row"><button class="sec" id="no">Cancel</button><span class="grow"></span><button class="${danger ? 'sec danger' : 'primary'}" id="yes">${esc(yes)}</button></div>`; d.showModal();
  $('#no', d).onclick = () => d.close(); $('#yes', d).onclick = async () => { d.close(); try { await onYes(); } catch (e) { toast(e.message); } };
}

// ---- one reusable sheet. open({title, html, wide, refresh}) returns the body element; refresh() is called when data changes underneath it
const SH = { refresh: null, onClose: null };
const sheetEl = $('#sheet');
function openSheet({ title = '', html = '', wide = false, refresh = null, onClose = null } = {}) {
  SH.refresh = refresh; SH.onClose = onClose; $('#shT').textContent = title; $('#shB').innerHTML = html; sheetEl.classList.toggle('wide', wide);
  if (!sheetEl.open) sheetEl.showModal(); $('#shB').scrollTop = 0; return $('#shB');
}
function closeSheet() { if (sheetEl.open) sheetEl.close(); }
sheetEl.addEventListener('close', () => { const f = SH.onClose; SH.refresh = null; SH.onClose = null; $('#shB').innerHTML = ''; if (f) f(); });
$('#shX').onclick = closeSheet;
sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeSheet(); });
(() => { // drag the grabber or the title down to dismiss
  let y0 = null; const h = (e) => { if (e.target.closest('button')) return; y0 = e.clientY; sheetEl.setPointerCapture?.(e.pointerId); };
  for (const el of [$('#shGrab'), $('.sh-head')]) { el.addEventListener('pointerdown', h); }
  addEventListener('pointermove', (e) => { if (y0 == null) return; const dy = Math.max(0, e.clientY - y0); sheetEl.style.transform = `translateY(${dy}px)`; sheetEl.style.transition = 'none'; });
  addEventListener('pointerup', (e) => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; sheetEl.style.transition = 'transform .25s'; sheetEl.style.transform = ''; if (dy > 110) closeSheet(); setTimeout(() => (sheetEl.style.transition = ''), 300); });
})();

// ---- router
const view = $('#view');
const TABS = [['today', 'Today'], ['plan', 'Plan'], ['patterns', 'Patterns'], ['ask', 'Ask'], ['more', 'More']];
const tabs = { today: () => renderToday(), plan: () => renderPlan(), patterns: () => renderPatterns(), ask: () => renderAsk(), more: () => renderMore() };
(() => {
  const tb = $('#tabbar'), dn = $('#dnav');
  const order = ['today', 'plan', 'log', 'patterns', 'ask'];
  tb.innerHTML = order.map((k) => (k === 'log' ? `<button class="logbtn" id="tbLog" aria-label="Log something"><span class="orb">${icon('plus')}</span></button>` : `<button data-tab="${k}">${icon(k)}<span>${TABS.find((t) => t[0] === k)[1]}</span></button>`)).join('');
  dn.innerHTML = TABS.map(([k, n]) => `<button data-tab="${k}">${icon(k)}<span>${n}</span>${k === 'more' ? '<span class="badge" hidden></span>' : ''}</button>`).join('');
  $('#topLog').innerHTML = `${icon('plus')} Log`; $('#topMore').insertAdjacentHTML('afterbegin', icon('more')); $('#topHelp').innerHTML = icon('help');
})();
function shouldRerender() {
  if (editing() || $('#dlg').open) return false;
  if (sheetEl.open) { try { SH.refresh && SH.refresh(); } catch (e) { /* sheet closed under us */ } return false; }
  if (current === 'ask' || (current === 'plan' && ui.sub === 'rooms')) return false;      // chats keep their own state
  if (current === 'plan' && ui.sub === 'deck' && Date.now() - lastLocalDeckEdit < 2500) return false;
  return true;
}
function go(tab, { keep = false } = {}) {
  if (!tabs[tab]) tab = 'today'; current = tab;
  document.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  $('#app').classList.toggle('wide', tab === 'plan' || tab === 'patterns' || tab === 'today');
  $('#topMore').classList.toggle('on', tab === 'more');
  const y = window.scrollY; disposeViews();
  if (!allReady() && !loadGaveUp) { view.innerHTML = '<div class="skel" aria-busy="true"><i style="width:60%"></i><i style="width:90%;height:150px"></i><i style="width:75%"></i><p class="sub" style="text-align:center">Opening your data…</p></div>'; return; }
  try { buildModel(); } catch (e) { console.error(e); }
  try { tabs[tab](); } catch (e) { console.error(e); view.innerHTML = `<div class="panel warn">${esc(e.message)}</div>`; }
  window.scrollTo(0, keep ? y : 0);
}
document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { try { history.replaceState(null, '', '#' + b.dataset.tab); } catch { /* sandboxed */ } go(b.dataset.tab); }));
$('#topMore').onclick = () => go('more');
const viewDisposers = []; function onDispose(fn) { viewDisposers.push(fn); } function disposeViews() { while (viewDisposers.length) { try { viewDisposers.pop()(); } catch { /* ignore */ } } }
