// In-memory stand-in for window.claude (db, sample, downloads) for local testing only.
(() => {
  const store = new Map(); const listeners = [];
  const rid = () => Math.random().toString(36).slice(2, 10);
  const colOf = (p) => p.split('/').slice(0, -1).join('/');
  const snapDoc = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => (store.has(path) ? JSON.parse(JSON.stringify(store.get(path))) : undefined), metadata: {} });
  const notify = (path) => listeners.slice().forEach((l) => { if (l.kind === 'doc' && l.path === path) l.fire(); if (l.kind === 'col' && colOf(path) === l.path) l.fire(); });
  const docRef = (path) => ({ id: path.split('/').pop(), path,
    get: async () => snapDoc(path),
    set: async (d) => { store.set(path, JSON.parse(JSON.stringify(d))); notify(path); },
    update: async (d) => { if (!store.has(path)) throw { code: 'invalid_argument', message: 'missing ' + path }; store.set(path, { ...store.get(path), ...JSON.parse(JSON.stringify(d)) }); notify(path); },
    delete: async () => { store.delete(path); notify(path); },
    onSnapshot: (next) => { const l = { kind: 'doc', path, fire: () => setTimeout(() => next(snapDoc(path)), 0) }; listeners.push(l); l.fire(); return () => listeners.splice(listeners.indexOf(l), 1); } });
  const colRef = (path) => ({ path,
    doc: (id) => docRef(`${path}/${id || rid()}`),
    onSnapshot: (next) => { const snap = () => { const docs = [...store.keys()].filter((k) => colOf(k) === path).sort().map(snapDoc); return { docs, size: docs.length, empty: !docs.length }; };
      const l = { kind: 'col', path, fire: () => setTimeout(() => next(snap()), 0) }; listeners.push(l); l.fire(); return () => listeners.splice(listeners.indexOf(l), 1); } });
  window.__db = store; window.__calls = [];
  const sample = async (input, opts = {}) => {
    const text = typeof input === 'string' ? input : input[0].content;
    window.__calls.push({ kind: 'sample', tools: !!opts.tools, text: text.slice(0, 60) });
    if (opts.tools && text.includes('helping plan ONE space')) { // room planner chat
      const t = Object.fromEntries(opts.tools.map((x) => [x.name, x])); const last = input[input.length - 1].content;
      window.__planner = window.__planner || []; window.__planner.push({ last, instr: text });
      let out;
      if (/applied your suggestion|dismissed/.test(last)) { out = 'Done. Anything else in this room?'; t.quick_replies.execute({ options: ['That is all', 'Add more'] }, {}); }
      else if (/shelves|shelf/.test(last)) {
        t.propose_changes.execute({ summary: 'A starter plan for the shelves and stove', adds: [{ name: 'Clean one shelf', per_quarter: 7, area: 'Pantry shelves', parts: 6, why: 'covers all 6 in about 3 months' }, { name: 'Wipe the stove top', per_quarter: 13, area: 'Stove' }], updates: [], removes: [] }, {});
        t.quick_replies.execute({ options: ['Looks good', 'Make it lighter'] }, {}); t.save_notes.execute({ notes: '6 pantry shelves, a stove' }, {});
        out = 'Here is a start. Want me to add these?';
      } else { out = 'Tell me what is in the room: shelves, drawers, appliances?'; t.quick_replies.execute({ options: ['6 shelves and a stove', 'Mostly cabinets'] }, {}); }
      opts.onText?.({ text: out.slice(0, 10), delta: out.slice(0, 10) }); await new Promise((r) => setTimeout(r, 60)); opts.onText?.({ text: out, delta: out.slice(10) }); return { text: out, truncated: false };
    }
    if (opts.tools) { // chat: call tools like Claude would
      const t = Object.fromEntries(opts.tools.map((x) => [x.name, x]));
      const rows = t.aggregate.execute({ source: 'entries', group_by: 'weekday', metric: 'count' }, {});
      t.show_chart.execute({ kind: 'bars', title: 'Entries by weekday', group_by: 'weekday', metric: 'count', source: 'entries' }, {});
      const out = 'Most of your entries land on ' + rows.slice().sort((a, b) => b.value - a.value)[0].label + '.\nTiny move: log one thing on your quietest day.';
      opts.onText?.({ text: out, delta: out }); return { text: out, truncated: false };
    }
    return { text: 'ok', truncated: false };
  };
  sample.json = async (input, opts = {}) => {
    const text = typeof input === 'string' ? input : input[0].content;
    window.__calls.push({ kind: 'json', images: !!opts.images, text: text.slice(0, 50) });
    if (text.includes('printed 4x6 paper checklist')) {
      const code = text.match(/\n(C\d+) \(card/)[1]; const ids = [...text.split(code)[1].matchAll(/item ([\w-]+):/g)].map((m) => m[1]).slice(0, 6);
      return { card_code: code, card_confidence: 0.95, items: ids.map((id, i) => ({ item_id: id, checked: i < 2, confidence: 0.95 })), notes: '' };
    }
    const today = text.match(/Today is (\d{4}-\d\d-\d\d)/)[1];
    if (/tickit/i.test(text.split('Note:')[1] || '')) { const want = (text.split('Note:')[1].match(/tickit\s+([^"\\]+)/i) || [])[1].trim().toLowerCase(); const m = [...text.matchAll(/\[([^\]]+)\] home: ([^\n(]+)/g)].find((x) => x[2].trim().toLowerCase() === want); return { entries: [{ goal: 'home', date: today, activity: m ? m[2].trim() : want, best_match_id: m ? m[1] : null, match_confidence: m ? 0.95 : 0, details: {} }], clarification: null }; }
    if (/vacuum|hoover/i.test(text.split('Note:')[1])) return { entries: [{ goal: 'home', date: today, activity: 'Hoovered downstairs', best_match_id: [...text.matchAll(/\[([^\]]+)\] home: Vacuum main floors/g)][0]?.[1] || null, match_confidence: 0.9, details: { room: 'downstairs' } }], clarification: null };
    return { entries: [{ goal: 'fitness', date: today, activity: 'Bench Press', best_match_id: null, match_confidence: 0, details: { sets: 4, reps: 8, weight: 135 } }, { goal: 'fitness', date: today, activity: 'Jog', best_match_id: null, match_confidence: 0.6, details: { distance_mi: 3 } }], clarification: null };
  };
  sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 2e7, mediaTypes: ['image/jpeg'] }, tools: { maxCount: 8 } });
  window.__downloads = [];
  const downloads = { save: async (r) => { window.__downloads.push(r); return { status: 'saved' }; } };
  window.claude = { use: async (n) => ({ db: { doc: docRef, collection: colRef }, sample, downloads }[n] ?? null) };
})();
