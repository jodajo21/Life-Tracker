import { Env, Json, HttpError, today, q, run, loadCards } from './db';
import { awardEntry, awardCardClear, revokeCardClear, todayPayload, roomStats, getSettings, type Reward } from './game';
import { shieldsAvailable } from './core.mjs';
export type { Env } from './db';
const GOALS = ['fitness', 'home'];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (!authorized(req, env)) throw new HttpError(401, 'Unauthorized');
      return await route(req, env, url);
    } catch (e: any) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json({ error: e.message || 'error' }, status);
    }
  },
  async scheduled(_: ScheduledController, env: Env) {
    const key = `backups/${today(env)}.json`;
    await env.PHOTOS.put(key, JSON.stringify(await dumpAll(env)), { httpMetadata: { contentType: 'application/json' } });
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


// ---------------------------------------------------------------- routing
async function route(req: Request, env: Env, url: URL): Promise<Response> {
  const m = req.method, p = url.pathname;
  const body = async (): Promise<Json> => (m === 'GET' || m === 'DELETE' ? {} : await req.json());
  let r: RegExpMatchArray | null;

  if (p === '/api/ping') return json({ ok: true, today: today(env) });
  if (p === '/api/log' && m === 'POST') {
    const b = await body();
    const res = await idem(env, b.client_id, () => logText(env, String(b.text || ''), b.date, b.source || 'text', b.client_today));
    if (url.searchParams.get('plain')) return new Response(res.message, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return json(res);
  }
  if (p === '/api/chat' && m === 'POST') return json(await chat(env, (await body()).messages || []));
  if (p === '/api/today' && m === 'GET') {
    const t = validDate(url.searchParams.get('date')) || today(env);
    const data = await todayPayload(env, t);
    if (url.searchParams.get('plain')) {
      // For a Shortcuts automation: empty body = nothing open, so no notification is shown.
      const c = data.domains.home.card;
      const text = data.open_items > 0 ? `${data.open_items} box${data.open_items === 1 ? '' : 'es'} open on today's card (${c?.label}).` : '';
      return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return json(data);
  }
  if (p === '/api/rooms' && m === 'GET') return json(await roomStats(env, today(env)));
  if (p === '/api/settings' && m === 'GET') return json(await getSettings(env));
  if (p === '/api/settings' && m === 'POST') {
    const b = await body();
    const n = Math.round(Number(b.fitness_weekly_target));
    if (n >= 1 && n <= 7) await run(env, `INSERT INTO settings (key, value) VALUES ('fitness_weekly_target', ?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, String(n));
    return json(await getSettings(env));
  }
  if (p === '/api/shield' && (m === 'POST' || m === 'DELETE')) {
    const b = m === 'POST' ? await body() : Object.fromEntries(url.searchParams);
    if (!GOALS.includes(b.domain)) throw new HttpError(400, 'domain required');
    const start = validDate(b.date) || today(env);
    if (m === 'DELETE') { await run(env, 'DELETE FROM shields WHERE domain=?1 AND date=?2', b.domain, start); return json({ ok: true }); }
    const days = Math.max(1, Math.min(3, Math.round(Number(b.days) || 1)));
    const [cnt] = await q(env, 'SELECT COUNT(DISTINCT date) AS n FROM entries WHERE goal=?1', b.domain);
    const [used] = await q(env, 'SELECT COUNT(*) AS n FROM shields WHERE domain=?1', b.domain);
    if (shieldsAvailable(cnt.n, used.n) < days) throw new HttpError(400, 'Not enough shields yet (you earn one for every 7 active days).');
    for (let i = 0; i < days; i++) await run(env, 'INSERT OR IGNORE INTO shields (domain, date) VALUES (?1, ?2)', b.domain, shiftDate(start, i));
    return json({ ok: true });
  }
  if (p === '/api/entries' && m === 'GET') {
    const from = url.searchParams.get('from') || '0000', to = url.searchParams.get('to') || '9999';
    return json(await q(env, `SELECT e.id,e.date,e.goal,e.category_id,c.name AS activity,e.details,e.source,e.raw_text
      FROM entries e JOIN categories c ON c.id=e.category_id WHERE e.date BETWEEN ?1 AND ?2 ORDER BY e.date DESC, e.id DESC`, from, to));
  }
  if ((r = p.match(/^\/api\/entries\/(\d+)$/)) && m === 'DELETE') {
    const [ci] = await q(env, 'SELECT card_id FROM card_items WHERE entry_id=?1', +r[1]);
    await run(env, 'UPDATE card_items SET done=0, done_at=NULL, entry_id=NULL WHERE entry_id=?1', +r[1]);
    await run(env, 'DELETE FROM xp_events WHERE entry_id=?1', +r[1]);
    await run(env, 'DELETE FROM entries WHERE id=?1', +r[1]);
    if (ci) await revokeCardClear(env, ci.card_id);
    return json({ ok: true });
  }
  if (p === '/api/categories' && m === 'GET') {
    return json(await q(env, `SELECT c.*, (SELECT COUNT(*) FROM entries e WHERE e.category_id=c.id) AS uses FROM categories c ORDER BY goal, name`));
  }
  if (p === '/api/merge-suggestions' && m === 'GET') {
    return json(await q(env, `SELECT s.id, s.confidence, a.id AS a_id, a.name AS a_name, b.id AS b_id, b.name AS b_name, a.goal
      FROM merge_suggestions s JOIN categories a ON a.id=s.a_id JOIN categories b ON b.id=s.b_id WHERE s.status='open' ORDER BY s.confidence DESC`));
  }
  if (p === '/api/merge' && m === 'POST') {
    const b = await body();
    await mergeCategories(env, +b.keep_id, +b.drop_id);
    return json({ ok: true });
  }
  if ((r = p.match(/^\/api\/merge-suggestions\/(\d+)\/dismiss$/)) && m === 'POST') {
    await run(env, `UPDATE merge_suggestions SET status='dismissed' WHERE id=?1`, +r[1]);
    return json({ ok: true });
  }

  // chores + cards
  if (p === '/api/chores' && m === 'GET') return json(await q(env, 'SELECT * FROM chores ORDER BY room, name'));
  if (p === '/api/chores' && m === 'POST') {
    const b = await body();
    const name = String(b.name || '').trim();
    if (!name) throw new HttpError(400, 'name required');
    const catId = await ensureCategory(env, 'home', name);
    if (b.id) await run(env, 'UPDATE chores SET name=?1, room=?2, per_quarter=?3, active=?4, category_id=?5 WHERE id=?6', name, b.room || 'General', +b.per_quarter, b.active === 0 ? 0 : 1, catId, +b.id);
    else await run(env, 'INSERT INTO chores (name, room, per_quarter, category_id) VALUES (?1,?2,?3,?4)', name, b.room || 'General', +b.per_quarter, catId);
    return json({ ok: true });
  }
  if ((r = p.match(/^\/api\/chores\/(\d+)$/)) && m === 'DELETE') {
    await run(env, 'UPDATE chores SET active=0 WHERE id=?1', +r[1]); // soft delete keeps history intact
    return json({ ok: true });
  }
  if (p === '/api/card-sets' && m === 'GET') {
    return json(await q(env, `SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.set_id=s.id) AS cards FROM card_sets s ORDER BY id DESC`));
  }
  if (p === '/api/card-sets' && m === 'POST') return json(await createCardSet(env, await body()));
  if ((r = p.match(/^\/api\/card-sets\/(\d+)$/)) && m === 'GET') return json(await loadCards(env, 'c.set_id=?1', +r[1]));
  if (p === '/api/cards/current' && m === 'GET') {
    const t = today(env);
    // today's card, or (Sunday) the next upcoming one
    const rows = await loadCards(env, 'c.end_date>=?1 AND c.set_id=(SELECT MAX(id) FROM card_sets)', t);
    return json(rows[0] || null);
  }
  if ((r = p.match(/^\/api\/cards\/(\d+)\/items$/)) && m === 'POST') {
    const b = await body();
    const rewards = await setItems(env, +r[1], b.check || [], b.uncheck || []);
    return json({ ...(await loadCards(env, 'c.id=?1', +r[1]))[0], rewards });
  }
  if (p === '/api/card-stats' && m === 'GET') {
    const from = url.searchParams.get('from') || '0000', to = url.searchParams.get('to') || '9999';
    return json(await q(env, `SELECT cd.code, cd.start_date, ci.name, ch.room, ci.done FROM card_items ci
      JOIN cards cd ON cd.id=ci.card_id LEFT JOIN chores ch ON ch.id=ci.chore_id WHERE cd.start_date BETWEEN ?1 AND ?2`, from, to));
  }
  if (p === '/api/photo' && m === 'POST') {
    const b = await body();
    const res = await idem(env, b.client_id, () => readCardPhoto(env, b));
    if (url.searchParams.get('plain')) return new Response(photoMessage(res), { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    return json(res);
  }
  if (p === '/api/export' && m === 'GET') return json(await dumpAll(env));
  throw new HttpError(404, 'Not found');
}

// ---------------------------------------------------------------- Claude
async function claude(env: Env, body: Json): Promise<Json> {
  const res = await fetch((env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', ...body }),
  });
  if (!res.ok) throw new HttpError(502, `Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
const toolInput = (resp: Json, name: string): Json => {
  const b = (resp.content || []).find((c: Json) => c.type === 'tool_use' && c.name === name);
  if (!b) throw new HttpError(502, 'Model did not return structured output');
  return b.input;
};

// ---------------------------------------------------------------- helpers
const validDate = (d: unknown): string | null => (typeof d === 'string' && /^\d{4}-\d\d-\d\d$/.test(d) ? d : null);
function shiftDate(iso: string, n: number) {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}
/** Replays the stored response if the offline queue retries a request that already succeeded. */
async function idem<T>(env: Env, clientId: unknown, fn: () => Promise<T>): Promise<T> {
  if (typeof clientId !== 'string' || !clientId) return fn();
  const [seen] = await q(env, 'SELECT response FROM seen_requests WHERE client_id=?1', clientId);
  if (seen) return JSON.parse(seen.response);
  const out = await fn();
  await run(env, 'INSERT OR REPLACE INTO seen_requests (client_id, response) VALUES (?1, ?2)', clientId, JSON.stringify(out));
  return out;
}
function photoMessage(r: Json) {
  if (!r.card) return r.notes || "Couldn't tell which card that was.";
  const left = (r.proposal || []).filter((p: Json) => !p.checked).length;
  if (!r.auto_applied) return `Card ${r.card.code}: I wasn't sure about a few boxes — open the app to confirm.`;
  return `Card ${r.card.code}: recorded. ${left ? `${left} left.` : 'All clear!'}${(r.rewards || []).length ? ' +' + r.rewards.reduce((s: number, x: Reward) => s + x.xp, 0) + ' XP' : ''}`;
}

// ---------------------------------------------------------------- categories
async function ensureCategory(env: Env, goal: string, name: string): Promise<number> {
  return (await ensureCategoryX(env, goal, name)).id;
}
async function ensureCategoryX(env: Env, goal: string, name: string): Promise<{ id: number; created: boolean }> {
  const rows = await q(env, 'SELECT id, name, aliases FROM categories WHERE goal=?1', goal);
  const low = name.trim().toLowerCase();
  const hit = rows.find((c) => c.name.toLowerCase() === low || JSON.parse(c.aliases).some((a: string) => a.toLowerCase() === low));
  if (hit) return { id: hit.id, created: false };
  const res = await run(env, 'INSERT INTO categories (goal, name) VALUES (?1, ?2)', goal, name.trim());
  return { id: res.meta.last_row_id as number, created: true };
}

async function mergeCategories(env: Env, keep: number, drop: number) {
  if (keep === drop) throw new HttpError(400, 'Same category');
  const [k] = await q(env, 'SELECT * FROM categories WHERE id=?1', keep);
  const [d] = await q(env, 'SELECT * FROM categories WHERE id=?1', drop);
  if (!k || !d || k.goal !== d.goal) throw new HttpError(400, 'Categories must exist and share a goal');
  const aliases = new Set<string>([...JSON.parse(k.aliases), ...JSON.parse(d.aliases), d.name]);
  await env.DB.batch([
    env.DB.prepare('UPDATE entries SET category_id=?1 WHERE category_id=?2').bind(keep, drop),
    env.DB.prepare('UPDATE chores SET category_id=?1 WHERE category_id=?2').bind(keep, drop),
    env.DB.prepare('UPDATE categories SET aliases=?1 WHERE id=?2').bind(JSON.stringify([...aliases]), keep),
    env.DB.prepare(`UPDATE merge_suggestions SET status='merged' WHERE (a_id=?1 AND b_id=?2) OR (a_id=?2 AND b_id=?1)`).bind(drop, keep),
    env.DB.prepare(`DELETE FROM merge_suggestions WHERE a_id=?1 OR b_id=?1`).bind(drop),
    env.DB.prepare('DELETE FROM categories WHERE id=?1').bind(drop),
  ]);
}

// ---------------------------------------------------------------- natural-language logging
async function logText(env: Env, text: string, date: string | undefined, source: string, clientToday?: string) {
  text = text.trim();
  if (!text) throw new HttpError(400, 'text required');
  const t = validDate(clientToday) || today(env); // the phone's local date, so queued offline logs resolve "yesterday" correctly
  const cats = await q(env, 'SELECT id, goal, name, aliases FROM categories ORDER BY goal, name');
  const catList = cats.map((c) => `[${c.id}] ${c.goal}: ${c.name}${JSON.parse(c.aliases).length ? ` (aka ${JSON.parse(c.aliases).join(', ')})` : ''}`).join('\n');

  const resp = await claude(env, {
    max_tokens: 1500,
    system: `You turn a person's casual spoken/typed notes into structured log entries for a personal goals tracker.
Goals: "fitness" (workouts, runs, stretching, sports...) and "home" (cleaning, chores, household tasks).
Today is ${t} (${new Date(t + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })}). Resolve "yesterday", "this morning", weekdays etc. to a YYYY-MM-DD date; default to today.
One entry per distinct activity (e.g. "bench and squats" = two entries). Put numbers in details: sets, reps, weight (lb), duration_min, distance_mi, notes, room.
Reuse an existing category whenever the activity is the same thing said differently (e.g. "jog" = "Running", "hoovered" = "Vacuum main floors"). Set best_match_id to that category's id and match_confidence 0-1 (>=0.8 means certain it's the same; 0.5-0.8 means probably but not sure; below 0.5 means no real match). Use a short Title Case name for "activity" (use the existing category name when matched).
Existing categories:\n${catList || '(none yet)'}`,
    tools: [{
      name: 'record_entries',
      description: 'Record the log entries extracted from the note.',
      input_schema: {
        type: 'object',
        properties: {
          entries: { type: 'array', items: { type: 'object', properties: {
            goal: { type: 'string', enum: GOALS }, date: { type: 'string' }, activity: { type: 'string' },
            best_match_id: { type: ['integer', 'null'] }, match_confidence: { type: 'number' },
            details: { type: 'object', additionalProperties: true },
          }, required: ['goal', 'date', 'activity', 'match_confidence'] } },
          clarification: { type: ['string', 'null'], description: 'Only if the note was too unclear to log; a short question.' },
        },
        required: ['entries'],
      },
    }],
    tool_choice: { type: 'tool', name: 'record_entries' },
    messages: [{ role: 'user', content: text }],
  });
  const out = toolInput(resp, 'record_entries');

  const saved: Json[] = [];
  const rewards: Reward[] = [];
  const pending: Json[] = [];
  for (const e of out.entries || []) {
    if (!GOALS.includes(e.goal)) continue;
    const conf = Number(e.match_confidence) || 0;
    const match = cats.find((c) => c.id === e.best_match_id && c.goal === e.goal);
    let catId: number, created = false;
    if (match && conf >= 0.8) {
      catId = match.id;
      const aliases: string[] = JSON.parse(match.aliases);
      if (e.activity.toLowerCase() !== match.name.toLowerCase() && !aliases.some((a) => a.toLowerCase() === e.activity.toLowerCase())) {
        aliases.push(e.activity);
        await run(env, 'UPDATE categories SET aliases=?1 WHERE id=?2', JSON.stringify(aliases), match.id);
        match.aliases = JSON.stringify(aliases);
      }
    } else {
      const x = await ensureCategoryX(env, e.goal, e.activity);
      catId = x.id; created = x.created;
      if (match && conf >= 0.5 && catId !== match.id) {
        const exists = await q(env, `SELECT 1 FROM merge_suggestions WHERE status='open' AND a_id=?1 AND b_id=?2`, catId, match.id);
        if (!exists.length) await run(env, 'INSERT INTO merge_suggestions (a_id, b_id, confidence) VALUES (?1,?2,?3)', catId, match.id, conf);
        pending.push({ a: e.activity, b: match.name });
      }
      if (created) cats.push({ id: catId, goal: e.goal, name: e.activity, aliases: '[]' });
    }
    const when = validDate(e.date) || validDate(date) || t;
    const res = await run(env, 'INSERT INTO entries (goal, date, category_id, details, raw_text, source) VALUES (?1,?2,?3,?4,?5,?6)',
      e.goal, when, catId, JSON.stringify(e.details || {}), text, source);
    const entryId = res.meta.last_row_id as number;
    const rw = await awardEntry(env, { entryId, goal: e.goal, date: when, newCategory: created ? e.activity : undefined });
    rewards.push(...rw);
    saved.push({ id: entryId, goal: e.goal, date: when, activity: e.activity, details: e.details || {}, xp: rw.reduce((s, x) => s + x.xp, 0), rewards: rw });
  }
  const describe = (s: Json) => `${s.activity}${describeDetails(s.details)}`;
  let message = saved.length ? `Logged: ${saved.map(describe).join('; ')}.` : out.clarification || "I couldn't find anything to log.";
  if (pending.length) message += ` (Not sure if ${pending[0].a} is the same as ${pending[0].b} — check the Tidy tab.)`;
  const xp = rewards.reduce((s, x) => s + x.xp, 0);
  if (xp) message += ` +${xp} XP${rewards.some((r) => r.kind === 'lucky') ? ' (lucky drop!)' : ''}`;
  return { counted: saved.length > 0, saved, rewards, xp, message, clarification: out.clarification || null };
}
function describeDetails(d: Json) {
  const bits: string[] = [];
  if (d.sets && d.reps) bits.push(`${d.sets}x${d.reps}`);
  if (d.weight) bits.push(`@${d.weight}`);
  if (d.duration_min) bits.push(`${d.duration_min} min`);
  if (d.distance_mi) bits.push(`${d.distance_mi} mi`);
  return bits.length ? ` (${bits.join(', ')})` : '';
}

// ---------------------------------------------------------------- conversational analysis
async function chat(env: Env, messages: { role: string; content: string }[]) {
  const t = today(env);
  const status = await todayPayload(env, t);
  const snapshot = {
    today: t,
    fitness: { week_bar: status.domains.fitness.bar.label, momentum: status.domains.fitness.momentum.value, season_level: status.domains.fitness.season.level },
    home: { card_bar: status.domains.home.bar.label, momentum: status.domains.home.momentum.value, season_level: status.domains.home.season.level },
    rooms_near_next_tier: status.rooms.filter((r) => r.heat || (r.next > 0 && r.next <= 2)).map((r) => ({ room: r.room, coverage_pct: Math.round(r.coverage * 100), shards_to_next_trophy: r.next })),
  };
  const system = `You are the answer engine inside the user's personal habit app. They discover their own patterns by asking you questions; you are not a coach or a nag.
Today is ${t}. Cards run Mon-Sat (Sunday is a rest day). In SQL, weekday numbers are 0=Sunday..6=Saturday. Domains: fitness and home.
You can query their data with run_sql (read-only SQLite) and draw charts with show_chart. Tables/views:
- v_entries(id, date, weekday, goal, activity, details JSON, source, raw_text): every logged workout/chore. Use json_extract(details,'$.weight') etc.
- v_card_items(id, card_code, start_date, end_date, chore, room, done 0/1, done_at): printed 2-day cards; each row is one planned checkbox. done=0 on a past card = not done.
- v_xp(date, domain, kind, xp, label); categories(id, goal, name, aliases); chores(id, name, room, per_quarter, active); shards(room, card_id, date).
Current status snapshot (use it only if relevant, e.g. "how close am I to..."): ${JSON.stringify(snapshot)}
How to answer: query first, look at the data from a couple of angles, then answer plainly with real numbers and dates. Prefer showing the evidence with show_chart (1-2 charts max) over describing it at length. Be warm and brief. Say so when the sample is small. Never invent data.
Rules: do not lecture, do not moralize about misses, do not suggest a weekly review or routine, and do not add motivational filler. Only if it flows naturally, finish with one line starting "Tiny move:" giving a single optional, concrete suggestion. If the user asks about near-misses ("how close am I"), use the snapshot.`;
  const tools = [
    {
      name: 'run_sql',
      description: 'Run one read-only SELECT (or WITH...SELECT) against the tracker database. Returns up to 300 rows as JSON.',
      input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] },
    },
    {
      name: 'show_chart',
      description: 'Display a chart to the user from a read-only query. bars/hbars need columns label,value (bars keep row order, so ORDER BY yourself). heatmap needs columns date (YYYY-MM-DD),value.',
      input_schema: {
        type: 'object',
        properties: { kind: { type: 'string', enum: ['bars', 'hbars', 'heatmap'] }, title: { type: 'string' }, goal: { type: 'string', enum: GOALS }, sql: { type: 'string' } },
        required: ['kind', 'title', 'sql'],
      },
    },
  ];
  const msgs: Json[] = messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'last message must be from user');
  const charts: Json[] = [];

  for (let i = 0; i < 8; i++) {
    const resp = await claude(env, { max_tokens: 2000, system, tools, messages: msgs });
    if (resp.stop_reason !== 'tool_use') {
      const reply = (resp.content || []).filter((c: Json) => c.type === 'text').map((c: Json) => c.text).join('\n').trim();
      return { reply, charts };
    }
    msgs.push({ role: 'assistant', content: resp.content });
    const results: Json[] = [];
    for (const c of resp.content.filter((c: Json) => c.type === 'tool_use')) {
      let content: string, is_error = false;
      try {
        const rows = await readOnlyQuery(env, c.input.sql);
        if (c.name === 'show_chart') {
          charts.push({ kind: c.input.kind, title: c.input.title, goal: c.input.goal || 'home', rows: rows.slice(0, 200) });
          content = `Chart displayed to the user (${rows.length} rows).`;
        } else content = JSON.stringify(rows);
      } catch (e: any) { content = `Error: ${e.message}`; is_error = true; }
      results.push({ type: 'tool_result', tool_use_id: c.id, content, is_error });
    }
    msgs.push({ role: 'user', content: results });
  }
  return { reply: "I couldn't finish analyzing that — try a narrower question.", charts };
}

async function readOnlyQuery(env: Env, sql: string) {
  sql = String(sql || '').trim().replace(/;+\s*$/, '');
  if (sql.includes(';')) throw new Error('One statement only');
  if (!/^(select|with)\b/i.test(sql)) throw new Error('Only SELECT queries are allowed');
  // Wrapping in a subquery makes it impossible for the statement to modify data.
  return q(env, `SELECT * FROM (${sql}) LIMIT 300`);
}

// ---------------------------------------------------------------- cards
async function createCardSet(env: Env, b: Json) {
  const cards: Json[] = b.cards;
  if (!Array.isArray(cards) || !cards.length) throw new HttpError(400, 'cards required');
  const set = await run(env, 'INSERT INTO card_sets (start_date) VALUES (?1)', b.start_date);
  const setId = set.meta.last_row_id as number;
  for (const c of cards) {
    const code = `S${setId}-${String(c.idx + 1).padStart(2, '0')}`;
    const res = await run(env, 'INSERT INTO cards (set_id, idx, code, start_date, end_date, label) VALUES (?1,?2,?3,?4,?5,?6)', setId, c.idx, code, c.start_date, c.end_date, c.label);
    const cardId = res.meta.last_row_id as number;
    await env.DB.batch(c.items.map((it: Json, pos: number) =>
      env.DB.prepare('INSERT INTO card_items (card_id, chore_id, name, pos) VALUES (?1,?2,?3,?4)').bind(cardId, it.chore_id ?? null, it.name, pos)));
  }
  return { set_id: setId };
}

async function setItems(env: Env, cardId: number, check: number[], uncheck: number[]): Promise<Reward[]> {
  const [card] = await q(env, 'SELECT * FROM cards WHERE id=?1', cardId);
  if (!card) throw new HttpError(404, 'card not found');
  const t = today(env);
  const date = t < card.start_date ? card.start_date : t > card.end_date ? card.end_date : t;
  const rewards: Reward[] = [];
  for (const id of check) {
    const [it] = await q(env, `SELECT ci.*, ch.category_id FROM card_items ci LEFT JOIN chores ch ON ch.id=ci.chore_id WHERE ci.id=?1 AND ci.card_id=?2`, id, cardId);
    if (!it || it.done) continue;
    const cat = it.category_id ?? (await ensureCategory(env, 'home', it.name));
    const e = await run(env, `INSERT INTO entries (goal, date, category_id, details, raw_text, source) VALUES ('home',?1,?2,?3,?4,'card')`,
      date, cat, JSON.stringify({ card: card.code }), `Card ${card.code}: ${it.name}`);
    await run(env, 'UPDATE card_items SET done=1, done_at=?1, entry_id=?2 WHERE id=?3', date, e.meta.last_row_id, id);
    // seeded by item id: unchecking and re-checking a box can never re-roll a lucky drop
    rewards.push(...(await awardEntry(env, { entryId: e.meta.last_row_id as number, goal: 'home', date, seed: `card-item-${id}` })));
  }
  for (const id of uncheck) {
    const [it] = await q(env, 'SELECT * FROM card_items WHERE id=?1 AND card_id=?2', id, cardId);
    if (!it || !it.done) continue;
    if (it.entry_id) { await run(env, 'DELETE FROM xp_events WHERE entry_id=?1', it.entry_id); await run(env, 'DELETE FROM entries WHERE id=?1', it.entry_id); }
    await run(env, 'UPDATE card_items SET done=0, done_at=NULL, entry_id=NULL WHERE id=?1', id);
  }
  const [full] = await loadCards(env, 'c.id=?1', cardId);
  if (full.items.every((i: Json) => i.done)) rewards.push(...(await awardCardClear(env, full, date)));
  else await revokeCardClear(env, cardId);
  return rewards;
}

async function readCardPhoto(env: Env, b: Json) {
  const data = String(b.image || '');
  const mediaType = b.media_type || 'image/jpeg';
  if (!data) throw new HttpError(400, 'image required');
  const t = today(env);
  const cards = await loadCards(env, `c.end_date >= date(?1,'-45 days') AND c.start_date <= date(?1,'+7 days') AND c.set_id=(SELECT MAX(id) FROM card_sets)`, t);
  if (!cards.length) throw new HttpError(400, 'No card set found. Generate cards first.');
  const listing = cards.map((c) => `${c.code} (${c.label}, ${c.start_date}):\n` + c.items.map((i: Json) => `  item ${i.id}: ${i.name}`).join('\n')).join('\n');

  const resp = await claude(env, {
    max_tokens: 1500,
    system: `You read photos of printed 4x6 paper checklist cards. Each card prints a card code like "S1-07" in a corner, the day pair, and 3-6 tasks each with a checkbox. A box counts as checked if it has a check, X, fill or scribble. Match the card code to one of these known cards and report each of its items' state. If a code is unreadable, identify the card from the task list and say so with lower confidence. Be conservative: if a box is ambiguous give confidence below 0.7.
Known cards:\n${listing}`,
    tools: [{
      name: 'report_card',
      description: 'Report which card is in the photo and which boxes are checked.',
      input_schema: {
        type: 'object',
        properties: {
          card_code: { type: ['string', 'null'] }, card_confidence: { type: 'number' },
          items: { type: 'array', items: { type: 'object', properties: { item_id: { type: 'integer' }, checked: { type: 'boolean' }, confidence: { type: 'number' } }, required: ['item_id', 'checked', 'confidence'] } },
          notes: { type: 'string' },
        },
        required: ['card_code', 'card_confidence', 'items'],
      },
    }],
    tool_choice: { type: 'tool', name: 'report_card' },
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data } }, { type: 'text', text: 'Which card is this and what is checked?' }] }],
  });
  const out = toolInput(resp, 'report_card');
  const card = cards.find((c) => c.code === out.card_code);

  const bytes = Uint8Array.from(atob(data), (ch) => ch.charCodeAt(0));
  const key = `photos/${t}-${crypto.randomUUID()}.jpg`;
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mediaType } });
  await run(env, 'INSERT INTO photos (r2_key, card_id, result) VALUES (?1,?2,?3)', key, card?.id ?? null, JSON.stringify(out));
  if (!card) return { card: null, auto_applied: false, notes: out.notes || 'Could not tell which card this is.' };

  const proposal = card.items.map((i: Json) => {
    const f = (out.items || []).find((x: Json) => x.item_id === i.id);
    return { item_id: i.id, name: i.name, was_done: !!i.done, checked: f ? !!f.checked : !!i.done, confidence: f ? f.confidence : 0 };
  });
  const sure = out.card_confidence >= 0.85 && proposal.every((p: Json) => p.confidence >= 0.8);
  let rewards: Reward[] = [];
  if (sure) rewards = await setItems(env, card.id, proposal.filter((p: Json) => p.checked && !p.was_done).map((p: Json) => p.item_id), []);
  return { card: { id: card.id, code: card.code, label: card.label, start_date: card.start_date }, proposal, auto_applied: sure, rewards, notes: out.notes || '' };
}

// ---------------------------------------------------------------- backup
async function dumpAll(env: Env) {
  const tables = ['categories', 'entries', 'merge_suggestions', 'chores', 'card_sets', 'cards', 'card_items', 'photos', 'xp_events', 'shields', 'shards', 'settings'];
  const out: Json = { exported_at: new Date().toISOString() };
  for (const t of tables) out[t] = await q(env, `SELECT * FROM ${t}`);
  return out;
}
