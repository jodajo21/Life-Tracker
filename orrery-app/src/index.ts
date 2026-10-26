// Orrery as its own app: serves the page, keeps the data (a document store on D1), lets the page talk to Claude
// without ever seeing your API key, and takes notes from a Siri Shortcut.
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  MODEL?: string;
  MODEL_QUICK?: string;
  TZ_NAME?: string;
  DAILY_CALL_LIMIT?: string;
  ANTHROPIC_BASE_URL?: string; // for local testing against a stand-in
}
type Json = Record<string, any>;
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const plain = (text: string, status = 200) => new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!authorized(req, env)) throw new HttpError(401, 'Wrong or missing access code');
      return await route(req, env, url);
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({ error: e.message || 'error' }, status);
    }
  },
  async scheduled(_: ScheduledController, env: Env) {
    const cut = Date.now() - 90 * 864e5;
    await env.DB.prepare('DELETE FROM docs WHERE data IS NULL AND updated < ?1').bind(cut).run();
    await env.DB.prepare('DELETE FROM usage WHERE day < ?1').bind(new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)).run();
  },
};

function authorized(req: Request, env: Env) {
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const want = env.APP_TOKEN || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
const today = (env: Env) => new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ_NAME || 'America/Chicago' }).format(new Date());
const validDate = (s: unknown) => (typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s) ? s : null);

async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const p = url.pathname, m = req.method;
  if (p === '/api/ping') return json({ ok: true, today: today(env) });
  if (p === '/api/sync' && m === 'GET') return sync(env, Math.max(0, Number(url.searchParams.get('since')) || 0));
  if (p === '/api/write' && m === 'POST') return write(env, await req.json());
  if (p === '/api/claude' && m === 'POST') return claude(req, env);
  if (p === '/api/siri' && m === 'POST') return siri(req, env, url);
  throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- the document store
const PATH = /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,3}$/;
async function sync(env: Env, since: number) {
  const limit = 1500;
  const rows = (await env.DB.prepare(`SELECT path, data, seq FROM docs WHERE seq > ?1 ${since === 0 ? 'AND data IS NOT NULL' : ''} ORDER BY seq LIMIT ${limit + 1}`).bind(since).all()).results as Json[];
  const more = rows.length > limit; if (more) rows.pop();
  const seq = rows.length ? rows[rows.length - 1].seq : since;
  return json({ docs: rows.map((r) => ({ path: r.path, seq: r.seq, data: r.data == null ? null : JSON.parse(r.data) })), seq, more });
}
async function write(env: Env, body: Json) {
  const ops: Json[] = Array.isArray(body.ops) ? body.ops : [];
  if (!ops.length || ops.length > 400) throw new HttpError(400, 'ops: 1 to 400');
  const paths = [...new Set(ops.map((o) => String(o.path)))];
  for (const p of paths) if (!PATH.test(p) || p.split('/').length % 2) throw new HttpError(400, `bad path ${p}`);
  const work = new Map<string, Json | null>();                       // the state of each touched document as the ops are applied in order
  for (let i = 0; i < paths.length; i += 90) {
    const chunk = paths.slice(i, i + 90);
    const rows = (await env.DB.prepare(`SELECT path, data FROM docs WHERE path IN (${chunk.map((_, k) => '?' + (k + 1)).join(',')})`).bind(...chunk).all()).results as Json[];
    for (const c of chunk) { const r = rows.find((x) => x.path === c); work.set(c, r && r.data != null ? JSON.parse(r.data) : null); }
  }
  for (const o of ops) {
    const cur = work.get(o.path) ?? null;
    if (o.op === 'set') work.set(o.path, o.data ?? {});
    else if (o.op === 'update') work.set(o.path, { ...(cur || {}), ...(o.data || {}) });
    else if (o.op === 'delete') work.set(o.path, null);
    else throw new HttpError(400, `bad op ${o.op}`);
  }
  const now = Date.now(), stmts: D1PreparedStatement[] = [];
  for (const [path, data] of work) {
    const parts = path.split('/'), id = parts[parts.length - 1], coll = parts.slice(0, -1).join('/');
    const text = data == null ? null : JSON.stringify(data);
    if (text && text.length > 900_000) throw new HttpError(413, 'document too large');
    stmts.push(env.DB.prepare(`INSERT INTO docs (path, coll, id, data, seq, updated) VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(seq), 0) + 1 FROM docs), ?5)
      ON CONFLICT(path) DO UPDATE SET data = excluded.data, seq = excluded.seq, updated = excluded.updated`).bind(path, coll, id, text, now));
  }
  await env.DB.batch(stmts);
  const [{ seq }] = (await env.DB.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM docs').all()).results as Json[];
  return json({ ok: true, seq });
}

// ---------------------------------------------------------------- Claude, with the key kept here
async function spend(env: Env) {
  const limit = Number(env.DAILY_CALL_LIMIT) || 300, day = today(env);
  const [r] = (await env.DB.prepare('INSERT INTO usage (day, calls) VALUES (?1, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1 RETURNING calls').bind(day).all()).results as Json[];
  if (r.calls > limit) throw new HttpError(429, `Daily Claude limit reached (${limit}). It resets tomorrow, or raise DAILY_CALL_LIMIT.`);
}
const modelFor = (env: Env, tier: string) => (tier === 'quick' ? env.MODEL_QUICK || 'claude-haiku-5-5' : env.MODEL || 'claude-sonnet-5-5');
function upstream(env: Env, body: Json) {
  return fetch(`${env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'}/v1/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body),
  });
}
async function claude(req: Request, env: Env) {
  if (Number(req.headers.get('content-length') || 0) > 14_000_000) throw new HttpError(413, 'Request too large');
  const b = await req.json() as Json;
  if (!Array.isArray(b.messages) || !b.messages.length) throw new HttpError(400, 'messages required');
  await spend(env);
  const body: Json = { model: modelFor(env, b.tier), max_tokens: Math.min(Number(b.max_tokens) || 4096, 8192), messages: b.messages };
  if (b.system) body.system = String(b.system);
  if (Array.isArray(b.tools) && b.tools.length) body.tools = b.tools.slice(0, 8);
  if (b.stream) body.stream = true;
  const r = await upstream(env, body);
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' } });
}
async function claudeJson(env: Env, prompt: string, tier: string): Promise<Json> {
  await spend(env);
  const r = await upstream(env, { model: modelFor(env, tier), max_tokens: 1500, system: 'Reply with only valid JSON. No prose, no code fences.', messages: [{ role: 'user', content: prompt }] });
  const j = await r.json() as Json;
  if (!r.ok) throw new HttpError(502, j?.error?.message || 'Claude request failed');
  const text = (j.content || []).filter((c: Json) => c.type === 'text').map((c: Json) => c.text).join('');
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  try { return JSON.parse(a >= 0 ? text.slice(a, z + 1) : text); } catch { throw new HttpError(502, 'Claude did not return readable JSON'); }
}

// ---------------------------------------------------------------- Siri: "log this" from a Shortcut
// The note is understood here (so Siri can answer right away) and dropped in the inbox. The app logs it, with its own rules for
// categories, XP and card ticks, the next time it opens. The same note posted twice with the same client_id is stored once.
const logPrompt = (text: string, t: string, catList: string) => `You turn a person's casual spoken/typed notes into structured log entries for a personal goals tracker.
Goals: "fitness" (workouts, runs, stretching, sports) and "home" (cleaning, chores, household tasks).
Today is ${t} (${new Date(t + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}). Resolve "yesterday", "this morning", weekdays etc. to a YYYY-MM-DD date; default to today.
One entry per distinct activity (e.g. "bench and squats" = two entries). Put numbers in details: sets, reps, weight (lb), duration_min, distance_mi, notes, room.
Reuse an existing category whenever the activity is the same thing said differently ("jog" = "Running", "hoovered" = "Vacuum main floors"). Set best_match_id to that category's id and match_confidence 0-1 (>=0.8 certain it is the same; 0.5-0.8 probably; below 0.5 no real match). Use a short Title Case name for "activity" (the existing category name when matched).
Existing categories:
${catList}

Note: ${JSON.stringify(text)}

Reply with only JSON: {"entries":[{"goal":"fitness|home","date":"YYYY-MM-DD","activity":"Bench Press","best_match_id":null,"match_confidence":0,"details":{}}],"clarification":null}
Set "clarification" to a short question only if the note was too unclear to log.`;
function describe(e: Json) {
  const d = e.details || {}, bits: string[] = [];
  if (d.sets && d.reps) bits.push(`${d.sets} sets of ${d.reps}`); else if (d.sets) bits.push(`${d.sets} sets`); else if (d.reps) bits.push(`${d.reps} reps`);
  if (d.weight) bits.push(`at ${d.weight} lb`);
  if (d.distance_mi) bits.push(`${d.distance_mi} mi`);
  if (d.duration_min) bits.push(`${d.duration_min} min`);
  return bits.length ? `${e.activity}, ${bits.join(' ')}` : String(e.activity);
}
async function siri(req: Request, env: Env, url: URL) {
  const ct = req.headers.get('content-type') || '';
  const b: Json = ct.includes('json') ? await req.json() : ct.includes('form') ? Object.fromEntries(await req.formData() as any) : { text: await req.text() };
  const text = String(b.text || '').trim().slice(0, 1000), asText = url.searchParams.has('plain') || (req.headers.get('accept') || '').includes('text/plain');
  const reply = (msg: string, extra: Json = {}, status = 200) => (asText ? plain(msg, status) : json({ message: msg, ...extra }, status));
  if (!text) return reply('I did not hear anything to log.', {}, 400);
  const t = validDate(b.date) || today(env);
  const cats = ((await env.DB.prepare(`SELECT id, data FROM docs WHERE coll = 'categories' AND data IS NOT NULL`).all()).results as Json[]).map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
  const catList = cats.map((c) => `[${c.id}] ${c.goal}: ${c.name}${(c.aliases || []).length ? ` (aka ${c.aliases.join(', ')})` : ''}`).join('\n') || '(none yet)';
  const out = await claudeJson(env, logPrompt(text, t, catList), 'quick');
  const entries = (out.entries || []).filter((e: Json) => ['fitness', 'home'].includes(e.goal) && e.activity);
  if (!entries.length) return reply(out.clarification || 'I could not find anything to log. Try saying the exercise and the numbers.', { clarification: out.clarification || null });
  const id = b.client_id ? `c_${String(b.client_id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}` : `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await write(env, { ops: [{ op: 'set', path: `inbox/${id}`, data: { status: 'pending', text, date: t, created: new Date().toISOString(), source: 'siri', parsed: { entries, clarification: null } } }] });
  const msg = `Logged: ${entries.map(describe).join('; ')}.`;
  return reply(msg, { entries });
}
