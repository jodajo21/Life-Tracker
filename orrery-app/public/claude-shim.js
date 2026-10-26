// A stand-in for the `window.claude` that Claude provides to artifacts, so the same Orrery page runs as its own app.
//   db        documents kept on your Worker (D1), mirrored here so the app opens instantly and works offline; writes queue until you are back online
//   sample    Claude, through the Worker (your API key never reaches this page); tools run here, exactly as in the artifact
//   downloads the share sheet on iPhone, a normal download elsewhere
// Inside Claude the real window.claude exists and this file does nothing.
(() => {
  if (window.claude) return;
  const TOKEN = 'orrery-token', CACHE = 'orrery-cache-v1', QUEUE = 'orrery-queue-v1';
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* ignore */ } } };
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), (b) => (b % 36).toString(36)).join('');
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const err = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

  // ------------------------------------------------------------ access code
  let asking = null;
  function askToken(msg = '') {
    if (asking) return asking;
    asking = new Promise((resolve) => {
      const o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#060818;color:#eef1ff;display:grid;place-items:center;padding:24px;font:16px/1.5 system-ui,-apple-system,sans-serif';
      o.innerHTML = `<form style="width:100%;max-width:340px;display:grid;gap:14px"><div style="font:400 30px Georgia,serif">Orrery</div><div style="color:#9ba3d6">Enter your access code. You only do this once on this device.</div>
        <input id="oc" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" style="font:inherit;font-size:16px;padding:13px 14px;border-radius:14px;border:1px solid #3a4180;background:#0b0f2c;color:inherit">
        <div id="oe" style="color:#ff8fb0;min-height:1.4em">${msg}</div><button style="font:600 16px system-ui;padding:13px;border:0;border-radius:14px;background:#3fe3f5;color:#031319">Unlock</button></form>`;
      document.body.append(o); const inp = o.querySelector('#oc'); setTimeout(() => inp.focus(), 50);
      o.querySelector('form').onsubmit = async (e) => {
        e.preventDefault(); const t = inp.value.trim(); if (!t) return;
        o.querySelector('#oe').textContent = 'Checking…';
        try { const r = await fetch('/api/ping', { headers: { authorization: 'Bearer ' + t } }); if (r.ok) { ls.set(TOKEN, t); o.remove(); asking = null; resolve(t); } else o.querySelector('#oe').textContent = 'That code did not work.'; }
        catch { o.querySelector('#oe').textContent = 'Can’t reach the server. Check your connection.'; }
      };
    });
    return asking;
  }
  const getToken = () => (ls.get(TOKEN) ? Promise.resolve(ls.get(TOKEN)) : askToken());
  async function api(path, { method = 'GET', body, signal } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await getToken();
      const res = await fetch(path, { method, signal, headers: { authorization: 'Bearer ' + token, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 401) { ls.del(TOKEN); await askToken('That code did not work. Try again.'); continue; }
      return res;
    }
    throw err('session_expired', 'Not signed in');
  }

  // ------------------------------------------------------------ db
  const mirror = new Map(), text = new Map();                 // path -> data, path -> its JSON (to tell real changes from echoes)
  let seq = 0, pending = [], synced = false, offline = false; const listeners = new Set();
  try { const c = JSON.parse(ls.get(CACHE) || 'null'); if (c) { for (const [p, d] of c.docs) { mirror.set(p, d); text.set(p, JSON.stringify(d)); } seq = c.seq || 0; synced = true; } pending = JSON.parse(ls.get(QUEUE) || '[]'); } catch { /* start clean */ }
  let persistT = 0; const persist = () => { clearTimeout(persistT); persistT = setTimeout(() => { ls.set(CACHE, JSON.stringify({ seq, docs: [...mirror] })); ls.set(QUEUE, JSON.stringify(pending)); }, 400); };
  const parentOf = (p) => p.slice(0, p.lastIndexOf('/')), idOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  const snapDoc = (path) => ({ id: idOf(path), exists: mirror.has(path), data: () => clone(mirror.get(path)), metadata: {} });
  const snapCol = (path) => { const docs = [...mirror.keys()].filter((k) => parentOf(k) === path).sort().map(snapDoc); return { docs, size: docs.length, empty: !docs.length }; };
  const fire = (l) => { try { l.next(l.kind === 'doc' ? snapDoc(l.path) : snapCol(l.path)); } catch (e) { console.error(e); } };
  const notify = (paths) => setTimeout(() => { for (const l of listeners) if (paths.some((p) => (l.kind === 'doc' ? p === l.path : parentOf(p) === l.path))) fire(l); }, 0);

  const pill = document.createElement('div');
  pill.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 4px);right:10px;z-index:90;font:600 11.5px system-ui;padding:3px 10px;border-radius:999px;background:rgba(6,8,24,.85);color:#ffc65c;border:1px solid rgba(255,198,92,.4);pointer-events:none;display:none';
  const showPill = () => { const waiting = pending.length; pill.textContent = offline ? `Offline${waiting ? ` · ${waiting} change${waiting === 1 ? '' : 's'} waiting` : ''}` : `Saving ${waiting}…`; pill.style.display = offline || waiting ? 'block' : 'none'; };
  document.addEventListener('DOMContentLoaded', () => document.body.append(pill)); if (document.body) document.body.append(pill);

  let pulling = null;
  function pull() {
    if (pulling) return pulling;
    pulling = (async () => {
      await 0;
      try {
        const changed = [], held = new Set(pending.map((o) => o.path));
        for (let more = true; more;) {
          const res = await api(`/api/sync?since=${seq}`); if (!res.ok) throw new Error('sync ' + res.status);
          const j = await res.json();
          for (const d of j.docs) {
            if (held.has(d.path)) continue;                                           // a change of ours is still waiting to be sent: ours wins
            const t = d.data == null ? null : JSON.stringify(d.data);
            if ((text.get(d.path) ?? null) === t) continue;
            if (t == null) { mirror.delete(d.path); text.delete(d.path); } else { mirror.set(d.path, d.data); text.set(d.path, t); }
            changed.push(d.path);
          }
          seq = j.seq; more = j.more;
        }
        const first = !synced; synced = true; offline = false; persist(); showPill();
        if (first) listeners.forEach(fire); else if (changed.length) notify(changed);
      } catch (e) {
        offline = true; showPill();
        if (!synced) listeners.forEach((l) => l.err && l.err(err('unavailable', 'Can’t reach your data. Check your connection.')));
      } finally { pulling = null; }
    })();
    return pulling;
  }
  let flushing = null, flushT = 0, inflight = [];
  const flushSoon = () => { clearTimeout(flushT); flushT = setTimeout(flush, 150); };
  function flush() {
    if (flushing) return flushing;
    if (!pending.length) return Promise.resolve();
    flushing = (async () => {
      await 0;                                                                              // never finish before `flushing` is assigned
      try {
        while (pending.length) {
          const batch = inflight = pending.slice(0, 100), res = await api('/api/write', { method: 'POST', body: { ops: batch } });
          if (!res.ok && (res.status >= 500 || res.status === 429)) throw new Error('write ' + res.status);
          if (!res.ok) console.error('Dropped a change the server refused', res.status, await res.text());
          pending = pending.filter((o) => !batch.includes(o)); inflight = []; persist(); showPill();
        }
        offline = false; showPill(); pull();
      } catch { offline = true; showPill(); setTimeout(flush, 5000); }                   // try again shortly
      finally { flushing = null; }
    })();
    return flushing;
  }
  function writeOp(op, path, data) {
    const same = (o) => o.path === path;
    if (op === 'set') { pending = pending.filter((o) => !same(o)); mirror.set(path, clone(data)); text.set(path, JSON.stringify(data)); pending.push({ op, path, data: clone(data) }); }
    else if (op === 'update') {
      mirror.set(path, { ...(mirror.get(path) || {}), ...clone(data) }); text.set(path, JSON.stringify(mirror.get(path)));
      const prev = pending.find((o) => same(o) && o.op === 'set' && !inflight.includes(o)); if (prev) prev.data = { ...prev.data, ...clone(data) }; else pending.push({ op, path, data: clone(data) });
    } else { pending = pending.filter((o) => !same(o)); mirror.delete(path); text.delete(path); pending.push({ op, path }); }
    persist(); showPill(); notify([path]); flushSoon();
  }
  const docRef = (path) => ({ id: idOf(path), path, get: async () => snapDoc(path),
    set: async (d) => writeOp('set', path, d), update: async (d) => { if (!mirror.has(path)) throw err('not_found', 'No such document: ' + path); writeOp('update', path, d); }, delete: async () => writeOp('delete', path),
    onSnapshot: (next, e) => addListener({ kind: 'doc', path, next, err: e }) });
  const colRef = (path) => ({ path, doc: (id) => docRef(`${path}/${id || rid()}`), onSnapshot: (next, e) => addListener({ kind: 'col', path, next, err: e }) });
  function addListener(l) { listeners.add(l); if (synced) setTimeout(() => fire(l), 0); else pull(); return () => listeners.delete(l); }
  const db = { doc: docRef, collection: colRef };
  setInterval(() => { if (document.visibilityState === 'visible') { flush(); pull(); } }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { flush(); pull(); } });
  addEventListener('online', () => { flush(); pull(); });
  if (pending.length) flushSoon();

  // ------------------------------------------------------------ Claude
  const normalize = (input) => (typeof input === 'string' ? [{ role: 'user', content: input }] : input.map((m) => ({ role: m.role, content: m.content })));
  const blobToImage = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ type: 'image', source: { type: 'base64', media_type: blob.type || 'image/jpeg', data: String(r.result).split(',')[1] } }); r.onerror = () => rej(err('invalid_input', 'Could not read the image')); r.readAsDataURL(blob); });
  async function httpError(res) {
    let msg = ''; try { const j = await res.json(); msg = j?.error?.message || (typeof j?.error === 'string' ? j.error : ''); } catch { /* not JSON */ }
    if (res.status === 429) return err('rate_limited', msg || 'Too many requests right now. Try again in a minute.');
    if (res.status === 401 || res.status === 403) return err('upstream_error', 'The AI key on your server isn’t accepted. Check ANTHROPIC_API_KEY.');
    return err('upstream_error', msg || 'That request failed. Try again.');
  }
  async function once(body, signal) {
    const res = await api('/api/claude', { method: 'POST', body, signal }); if (!res.ok) throw await httpError(res);
    const j = await res.json(); return { content: j.content || [], stop_reason: j.stop_reason };
  }
  async function stream(body, signal, onDelta) {
    const res = await api('/api/claude', { method: 'POST', body: { ...body, stream: true }, signal }); if (!res.ok) throw await httpError(res);
    const reader = res.body.getReader(), dec = new TextDecoder(), blocks = []; let buf = '', stop = null;
    const handle = (ev) => {
      if (ev.type === 'content_block_start') blocks[ev.index] = { ...ev.content_block, _json: '' };
      else if (ev.type === 'content_block_delta') { const b = blocks[ev.index]; if (ev.delta.type === 'text_delta') { b.text = (b.text || '') + ev.delta.text; onDelta(ev.delta.text); } else if (ev.delta.type === 'input_json_delta') b._json += ev.delta.partial_json; }
      else if (ev.type === 'message_delta') stop = ev.delta.stop_reason || stop;
      else if (ev.type === 'error') throw err('upstream_error', ev.error?.message || 'That request failed. Try again.');
    };
    for (;;) {
      const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
      for (let i; (i = buf.indexOf('\n\n')) >= 0;) { const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data:')); buf = buf.slice(i + 2); if (!line) continue; let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; } handle(ev); }
    }
    return { content: blocks.filter(Boolean).map((b) => (b.type === 'tool_use' ? { type: 'tool_use', id: b.id, name: b.name, input: b._json ? JSON.parse(b._json) : {} } : { type: 'text', text: b.text || '' })), stop_reason: stop };
  }
  async function run(input, opts = {}) {
    const tools = (opts.tools || []).slice(0, 8), defs = tools.map((t) => ({ name: t.name, description: t.description || '', input_schema: t.inputSchema || { type: 'object', properties: {} } })), msgs = normalize(input);
    if (opts.images && opts.images.length) { const imgs = await Promise.all(opts.images.map(blobToImage)), last = msgs[msgs.length - 1]; last.content = [...imgs, { type: 'text', text: String(last.content) }]; }
    const tier = opts.modelTier === 'quick' ? 'quick' : 'default';
    let latest = '';
    try {
      for (let turn = 0; turn < 8; turn++) {
        let turnText = '';
        const body = { tier, ...(opts.system ? { system: opts.system } : {}), messages: msgs, ...(defs.length ? { tools: defs } : {}) };
        const r = opts.onText ? await stream(body, opts.signal, (d) => { turnText += d; latest = turnText; opts.onText({ text: turnText, delta: d }); }) : await once(body, opts.signal);
        turnText = r.content.filter((b) => b.type === 'text').map((b) => b.text).join(''); latest = turnText;
        const calls = r.content.filter((b) => b.type === 'tool_use');
        if (r.stop_reason !== 'tool_use' || !calls.length) return { text: turnText, truncated: r.stop_reason === 'max_tokens' };
        const results = [];
        for (const c of calls) {
          const t = tools.find((x) => x.name === c.name);
          try { const out = t ? await t.execute(c.input) : 'Unknown tool'; results.push({ type: 'tool_result', tool_use_id: c.id, content: typeof out === 'string' ? out : JSON.stringify(out ?? null) }); }
          catch (e) { results.push({ type: 'tool_result', tool_use_id: c.id, content: String(e && e.message || e), is_error: true }); }
        }
        msgs.push({ role: 'assistant', content: r.content }, { role: 'user', content: results });
      }
      return { text: latest, truncated: true };
    } catch (e) { if (e && e.name === 'AbortError') throw err('cancelled', 'Cancelled', { text: latest }); throw e; }
  }
  const sample = (input, opts) => run(input, opts);
  sample.json = async (input, opts = {}) => {
    const r = await run(input, { ...opts, onText: null, tools: null, system: 'Reply with only valid JSON. No prose, no code fences.' });
    const a = r.text.indexOf('{'), z = r.text.lastIndexOf('}');
    try { return JSON.parse(a >= 0 ? r.text.slice(a, z + 1) : r.text); } catch { throw err('invalid_json', 'I couldn’t read that. Try rephrasing.'); }
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 5e6, mediaTypes: ['image/jpeg', 'image/png'] }, tools: { maxCount: 8 } });

  // ------------------------------------------------------------ files
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: /\.json$/.test(filename) ? 'application/json' : 'text/plain' });
      try { const file = new File([blob], filename, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return { status: 'saved' }; } }
      catch (e) { if (e && e.name === 'AbortError') throw err('declined', 'Cancelled'); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      return { status: 'saved' };
    },
  };

  window.claude = { use: async (name) => { if (name === 'db' || name === 'sample') await getToken(); return { db, sample, downloads }[name] ?? null; } };
  window.__shim = { pull, flush, get state() { return { seq, pending: pending.length, offline, synced, docs: mirror.size }; } };
})();
