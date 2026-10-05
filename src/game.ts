import { Env, Json, q, run, loadCards } from './db';
import { XP, levelFor, seasonOf, hashUnit, luckyRoll, momentum, shieldsAvailable, trophyFor, addDaysIso, daysBetween, MOMENTUM_MAX, LUCKY_P } from './core.mjs';

export type Reward = { kind: string; xp: number; label: string };
const DEFAULT_ROOM = 'General';

/** Base XP always; lucky drop ~10% (stored, so it is never hidden); comeback and discovery bonuses. */
export async function awardEntry(env: Env, a: { entryId: number; goal: string; date: string; seed?: string; newCategory?: string }): Promise<Reward[]> {
  const out: Reward[] = [];
  const add = async (kind: string, xp: number, label: string) => {
    await run(env, 'INSERT INTO xp_events (domain, date, kind, xp, label, entry_id) VALUES (?1,?2,?3,?4,?5,?6)', a.goal, a.date, kind, xp, label, a.entryId);
    out.push({ kind, xp, label });
  };
  await add('base', (XP as Json)[a.goal] ?? 10, 'Logged');
  const [prev] = await q(env, 'SELECT MAX(date) AS d FROM entries WHERE goal=?1 AND date<?2 AND id<>?3', a.goal, a.date, a.entryId);
  if (prev?.d && daysBetween(prev.d, a.date) >= 4) {
    const [dup] = await q(env, `SELECT 1 FROM xp_events WHERE domain=?1 AND date=?2 AND kind='comeback'`, a.goal, a.date);
    if (!dup) await add('comeback', XP.comeback, 'Welcome back');
  }
  if (a.newCategory) await add('discovery', XP.discovery, `New: ${a.newCategory}`);
  const roll = luckyRoll(hashUnit(a.seed ?? crypto.randomUUID()));
  if (roll) await add('lucky', roll.xp, roll.label);
  return out;
}

/** Perfect card: +XP and one shard per room on the card. Idempotent per card. */
export async function awardCardClear(env: Env, card: Json, date: string): Promise<Reward[]> {
  const [have] = await q(env, `SELECT 1 FROM xp_events WHERE card_id=?1 AND kind='card_clear'`, card.id);
  if (have) return [];
  await run(env, `INSERT INTO xp_events (domain, date, kind, xp, label, card_id) VALUES ('home',?1,'card_clear',?2,?3,?4)`, date, XP.card_clear, `Card ${card.code} cleared`, card.id);
  const rooms = [...new Set(card.items.map((i: Json) => i.room || DEFAULT_ROOM))] as string[];
  for (const r of rooms) await run(env, 'INSERT OR IGNORE INTO shards (room, card_id, date) VALUES (?1,?2,?3)', r, card.id, date);
  return [{ kind: 'card_clear', xp: XP.card_clear, label: `Card ${card.code} cleared · ${rooms.length} shard${rooms.length === 1 ? '' : 's'}` }];
}
export async function revokeCardClear(env: Env, cardId: number) {
  await run(env, `DELETE FROM xp_events WHERE card_id=?1 AND kind='card_clear'`, cardId);
  await run(env, 'DELETE FROM shards WHERE card_id=?1', cardId);
}

export async function getSettings(env: Env) {
  const rows = await q(env, 'SELECT key, value FROM settings');
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { fitness_weekly_target: Math.max(1, Math.min(7, Number(s.fitness_weekly_target) || 3)) };
}

async function domainSummary(env: Env, domain: string, today: string) {
  const season = seasonOf(today);
  const [s] = await q(env, 'SELECT COALESCE(SUM(xp),0) AS xp FROM xp_events WHERE domain=?1 AND date BETWEEN ?2 AND ?3', domain, season.start, season.end);
  const [life] = await q(env, 'SELECT COALESCE(SUM(xp),0) AS xp FROM xp_events WHERE domain=?1', domain);
  const act = await q(env, 'SELECT DISTINCT date FROM entries WHERE goal=?1 AND date>=?2', domain, addDaysIso(today, -60));
  const sh = await q(env, 'SELECT date FROM shields WHERE domain=?1 AND date>=?2', domain, addDaysIso(today, -60));
  const [cnt] = await q(env, 'SELECT COUNT(DISTINCT date) AS n FROM entries WHERE goal=?1', domain);
  const [used] = await q(env, 'SELECT COUNT(*) AS n FROM shields WHERE domain=?1', domain);
  const shieldDates = new Set(sh.map((r) => r.date));
  return {
    season: { ...season, xp: s.xp, ...levelFor(s.xp) },
    lifetime_xp: life.xp,
    momentum: { value: momentum(new Set(act.map((r) => r.date)), shieldDates, today, { skipSunday: domain === 'home' }), max: MOMENTUM_MAX },
    shields: { available: shieldsAvailable(cnt.n, used.n), protected_today: shieldDates.has(today) },
  };
}

export async function roomStats(env: Env, today: string) {
  const [set] = await q(env, 'SELECT id FROM card_sets WHERE start_date<=?1 ORDER BY id DESC LIMIT 1', today);
  const planned = set ? await q(env, `SELECT COALESCE(ch.room,?3) AS room, COUNT(*) AS planned, COALESCE(SUM(ci.done),0) AS done, MAX(ci.done_at) AS last_done
      FROM card_items ci JOIN cards cd ON cd.id=ci.card_id LEFT JOIN chores ch ON ch.id=ci.chore_id
      WHERE cd.set_id=?1 AND cd.start_date<=?2 GROUP BY room`, set.id, today, DEFAULT_ROOM) : [];
  const rooms = await q(env, 'SELECT DISTINCT room FROM chores WHERE active=1');
  const shards = await q(env, 'SELECT room, COUNT(*) AS n FROM shards GROUP BY room');
  const names = [...new Set([...rooms.map((r) => r.room), ...planned.map((p) => p.room)])].sort();
  return names.map((room) => {
    const p = planned.find((x) => x.room === room);
    const n = shards.find((x) => x.room === room)?.n ?? 0;
    const coverage = p && p.planned ? p.done / p.planned : 0;
    return { room, planned: p?.planned ?? 0, done: p?.done ?? 0, coverage, heat: coverage >= 0.7, last_done: p?.last_done ?? null, shards: n, ...trophyFor(n) };
  });
}

export async function todayPayload(env: Env, today: string) {
  const settings = await getSettings(env);
  const events = await q(env, 'SELECT id, domain, kind, xp, label, entry_id, card_id FROM xp_events WHERE date=?1 ORDER BY id', today);
  const entries = await q(env, `SELECT e.id, e.goal, c.name AS activity, e.details, e.source FROM entries e JOIN categories c ON c.id=e.category_id WHERE e.date=?1 ORDER BY e.id DESC`, today);
  const [fit, home] = await Promise.all([domainSummary(env, 'fitness', today), domainSummary(env, 'home', today)]);

  // Fitness bar: active days this week vs the (editable) weekly target.
  const dow = (new Date(today + 'T00:00:00').getDay() + 6) % 7;
  const [wk] = await q(env, `SELECT COUNT(DISTINCT date) AS n FROM entries WHERE goal='fitness' AND date BETWEEN ?1 AND ?2`, addDaysIso(today, -dow), today);
  const fitLeft = Math.max(0, settings.fitness_weekly_target - wk.n);
  const fitBar = { done: wk.n, total: settings.fitness_weekly_target, left: fitLeft, unit: 'days this week', label: fitLeft ? `${wk.n} of ${settings.fitness_weekly_target} active days · ${fitLeft} left` : `${wk.n} of ${settings.fitness_weekly_target} active days · all set` };

  // Home bar: today's card (or the next one on a rest day).
  const [card] = await loadCards(env, 'c.end_date>=?1 AND c.set_id=(SELECT MAX(id) FROM card_sets)', today);
  const isToday = !!card && card.start_date <= today;
  const hDone = card ? card.items.filter((i: Json) => i.done).length : 0, hTotal = card ? card.items.length : 0;
  const homeBar = card
    ? { done: hDone, total: hTotal, left: hTotal - hDone, unit: 'tasks', label: isToday ? (hTotal - hDone ? `${hDone} of ${hTotal} · ${hTotal - hDone} left` : `${hDone} of ${hTotal} · card cleared`) : `Next card: ${card.label} · ${hTotal} tasks` }
    : { done: 0, total: 0, left: 0, unit: 'tasks', label: 'No cards yet — generate a set on the Cards tab' };

  return {
    date: today,
    settings,
    lucky_odds: LUCKY_P,
    domains: {
      fitness: { ...fit, bar: fitBar, entries: entries.filter((e) => e.goal === 'fitness') },
      home: { ...home, bar: homeBar, card: card || null, card_is_today: isToday, entries: entries.filter((e) => e.goal === 'home') },
    },
    xp_events: events,
    rooms: await roomStats(env, today),
    open_items: isToday ? hTotal - hDone : 0,
  };
}
