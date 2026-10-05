// Shared helpers: formatting, local storage, API client with an offline queue.
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => new Date(s + 'T00:00:00');
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export function toast(msg, ms = 3500) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), ms);
}
/** Reward pill: always states that the log counted, then every XP source (nothing hidden). */
export function rewardToast(headline, rewards = []) {
  const t = document.createElement('div');
  t.className = 'toast reward';
  const total = rewards.reduce((s, r) => s + r.xp, 0);
  t.innerHTML = `<b>${esc(headline)}</b>${total ? `<span> · +${total} XP</span>` : ''}` +
    rewards.filter((r) => r.kind !== 'base').map((r) => `<div class="sub2">${r.kind === 'lucky' ? '✨ ' : ''}${esc(r.label)} +${r.xp}</div>`).join('');
  document.body.append(t); setTimeout(() => t.remove(), 4800);
}

// ---------------------------------------------------------------- offline queue (IndexedDB)
let dbp;
const idb = () => (dbp ||= new Promise((res, rej) => {
  const r = indexedDB.open('life-tracker', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('q', { keyPath: 'id', autoIncrement: true });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('q', mode); const out = fn(t.objectStore('q')); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); }); };
const qAdd = (item) => tx('readwrite', (s) => s.add(item));
const qAll = () => tx('readonly', (s) => s.getAll());
const qDel = (id) => tx('readwrite', (s) => s.delete(id));
export const queueCount = () => qAll().then((a) => a.length).catch(() => 0);

export class AuthError extends Error {}
let onAuthFail = () => {};
export const setAuthHandler = (fn) => (onAuthFail = fn);

async function send(path, body, method) {
  return fetch('/api' + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { authorization: 'Bearer ' + store.get('token', ''), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}
/** opts: {body, method, queue}. With queue:true a network failure is saved and retried later (returns {queued:true}). */
export async function api(path, opts = {}) {
  if (opts.queue && opts.body && !opts.body.client_id) opts.body.client_id = uuid();
  let res;
  try { res = await send(path, opts.body, opts.method); }
  catch (e) {
    if (opts.queue) { await qAdd({ path, body: opts.body, method: opts.method, at: Date.now() }); window.dispatchEvent(new Event('queue-changed')); return { queued: true }; }
    throw new Error("You're offline.");
  }
  if (res.status === 401) { onAuthFail(); throw new AuthError('Not signed in'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
let flushing = false;
export async function flushQueue() {
  if (flushing) return 0;
  flushing = true; let sent = 0;
  try {
    for (const item of await qAll()) {
      let res;
      try { res = await send(item.path, item.body, item.method); } catch { break; } // still offline
      if (res.status === 401) break;
      if (res.ok || res.status < 500) { await qDel(item.id); sent++; if (!res.ok) toast('One offline item could not be saved.'); } else break;
    }
  } catch {} finally { flushing = false; }
  if (sent) { window.dispatchEvent(new Event('queue-flushed')); window.dispatchEvent(new Event('queue-changed')); }
  return sent;
}
window.addEventListener('online', flushQueue);
