export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  ASSETS: Fetcher;
  APP_TOKEN: string;
  ANTHROPIC_API_KEY: string;
  MODEL?: string;
  TZ_NAME?: string;
  ANTHROPIC_BASE_URL?: string; // override for local testing
}
export type Json = Record<string, any>;
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export function today(env: Env) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ_NAME || 'America/Chicago' }).format(new Date());
}
export async function q(env: Env, sql: string, ...args: any[]) {
  return (await env.DB.prepare(sql).bind(...args).all()).results as Json[];
}
export async function run(env: Env, sql: string, ...args: any[]) {
  return env.DB.prepare(sql).bind(...args).run();
}

export async function loadCards(env: Env, where: string, ...args: any[]): Promise<Json[]> {
  const cards = await q(env, `SELECT c.* FROM cards c WHERE ${where} ORDER BY c.start_date, c.idx`, ...args);
  if (!cards.length) return [];
  const items = await q(env, `SELECT ci.*, ch.room FROM card_items ci LEFT JOIN chores ch ON ch.id=ci.chore_id
    WHERE ci.card_id IN (${cards.map(() => '?').join(',')}) ORDER BY ci.card_id, ci.pos`, ...cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, items: items.filter((i) => i.card_id === c.id) }));
}
