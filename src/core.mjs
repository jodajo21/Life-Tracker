// Pure game rules (no I/O) so they can be unit-tested with plain node.

export const XP = { fitness: 15, home: 10, card_clear: 25, discovery: 10, comeback: 15 };
export const LUCKY_P = 0.1;          // ~1 in 10 logs; shown in the app
export const LUCKY_AMOUNTS = [10, 15, 20, 25, 40];
export const MOMENTUM_MAX = 7;
export const SHIELD_CAP = 3;
export const TROPHY_TIERS = [[30, 'gold'], [15, 'silver'], [5, 'bronze']]; // shards needed per room

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseIso = (s) => new Date(s + 'T00:00:00');
export const addDaysIso = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);

/** Level n -> n+1 costs 60 + 20*(n-1) XP. Total XP only ever rises, so levels never drop. */
export function levelFor(xp) {
  let level = 1, floor = 0;
  for (;;) {
    const need = 60 + 20 * (level - 1);
    if (xp < floor + need) return { level, into: xp - floor, need };
    floor += need; level++;
  }
}

/** Calendar-quarter "season". */
export function seasonOf(dateIso) {
  const [y, m] = dateIso.split('-').map(Number);
  const q = Math.floor((m - 1) / 3);
  return {
    id: `${y}-Q${q + 1}`,
    name: `${['Winter', 'Spring', 'Summer', 'Fall'][q]} ${y}`,
    start: `${y}-${pad(q * 3 + 1)}-01`,
    end: iso(new Date(y, q * 3 + 3, 0)),
  };
}

/** Deterministic [0,1) from a string (FNV-1a) so re-checking the same box can't re-roll a lucky drop. */
export function hashUnit(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return ((h >>> 0) % 1000003) / 1000003;
}
export function luckyRoll(r) {
  if (r >= LUCKY_P) return null;
  const xp = LUCKY_AMOUNTS[Math.min(LUCKY_AMOUNTS.length - 1, Math.floor((r / LUCKY_P) * LUCKY_AMOUNTS.length))];
  return { xp, label: 'Lucky drop' };
}

/**
 * Momentum 0..7 (a gentle meter, never XP): +1 per active day; after 2+ consecutive missed days it
 * loses 1 per further missed day. Shielded days and (optionally) Sundays are neutral. Today is never counted as missed.
 */
export function momentum(activeDates, shieldDates, todayIso, { skipSunday = false, window = 45 } = {}) {
  let m = 0, gap = 0;
  for (let i = window; i >= 0; i--) {
    const d = addDaysIso(todayIso, -i);
    if (activeDates.has(d)) { m = Math.min(MOMENTUM_MAX, m + 1); gap = 0; continue; }
    if (d === todayIso || shieldDates.has(d) || (skipSunday && parseIso(d).getDay() === 0)) continue;
    gap++;
    if (gap >= 2) m = Math.max(0, m - 1);
  }
  return m;
}

/** 1 shield earned per 7 active days (lifetime); you can hold up to 3. */
export const shieldsAvailable = (activeDayCount, used) => Math.max(0, Math.min(SHIELD_CAP, Math.floor(activeDayCount / 7) - used));

export function trophyFor(shards) {
  const hit = TROPHY_TIERS.find(([n]) => shards >= n);
  const next = [...TROPHY_TIERS].reverse().find(([n]) => shards < n);
  return { tier: hit ? hit[1] : null, next: next ? next[0] - shards : 0 };
}
