// Spreads chores across a 13-week quarter of 2-day cards (Mon–Tue, Wed–Thu, Fri–Sat).
// Pure functions: no DOM, no network. Used by the app and by test/scheduler.test.mjs.

export const WEEKS = 13;
export const SEGMENTS = [['Mon', 'Tue'], ['Wed', 'Thu'], ['Fri', 'Sat']];
export const MIN_PER_CARD = 3;
export const MAX_PER_CARD = 6;

export function nextMonday(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  const add = (8 - d.getDay()) % 7; // 0 if already Monday
  d.setDate(d.getDate() + add);
  return fmt(d);
}
export function fmt(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return fmt(d);
}

/**
 * @param chores [{id,name,room,per_quarter}]
 * @returns {cards:[{idx,start_date,end_date,label,items:[{chore_id,name,room}]}], warnings:[string], roomCoverage:{room:count}}
 */
export function buildQuarter(chores, startDate, opts = {}) {
  const weeks = opts.weeks ?? WEEKS;
  const min = opts.min ?? MIN_PER_CARD;
  const max = opts.max ?? MAX_PER_CARD;
  const n = weeks * 3;
  const monday = nextMonday(startDate);
  const warnings = [];

  const load = Array.from({ length: n }, () => []); // slot -> chore objects
  const has = (slot, chore) => load[slot].some((c) => c.id === chore.id);

  const active = chores.filter((c) => c.per_quarter > 0);
  const total = active.reduce((s, c) => s + Math.min(c.per_quarter, n), 0);
  if (total > n * max) warnings.push(`Too many tasks: ${total} placements but only ${n * max} spots. Lower some frequencies.`);
  if (total < n * min) warnings.push(`Not enough tasks: ${total} placements but cards need at least ${n * min}. Add chores or raise frequencies.`);

  // Group by frequency so same-frequency chores get staggered phases.
  const byFreq = new Map();
  for (const c of active) {
    const k = Math.min(c.per_quarter, n);
    if (!byFreq.has(k)) byFreq.set(k, []);
    byFreq.get(k).push(c);
  }
  const freqs = [...byFreq.keys()].sort((a, b) => b - a);

  for (const f of freqs) {
    const group = byFreq.get(f);
    const interval = n / f;
    group.forEach((chore, gi) => {
      const phase = (gi * interval) / group.length;
      const used = [];
      for (let k = 0; k < f; k++) {
        const ideal = Math.min(n - 1, Math.floor(phase + k * interval + (f > 1 ? 0 : interval / 2 - 0.5)));
        const reach = Math.max(1, Math.floor(interval / 2));
        let best = -1, bestScore = Infinity;
        for (let d = 0; d <= Math.max(reach, n); d++) {
          for (const slot of d === 0 ? [ideal] : [ideal - d, ideal + d]) {
            if (slot < 0 || slot >= n || load[slot].length >= max || has(slot, chore)) continue;
            // Prefer light cards, near the ideal slot, and not adjacent to the previous occurrence.
            const adjacent = used.some((u) => Math.abs(u - slot) <= 1) && f < n / 2 ? 3 : 0;
            const score = load[slot].length * 1.0 + d * 0.6 + adjacent;
            if (score < bestScore) { bestScore = score; best = slot; }
          }
          if (best >= 0 && d >= reach) break;
        }
        if (best < 0) { warnings.push(`Could not place "${chore.name}" (card capacity full).`); continue; }
        load[best].push(chore);
        used.push(best);
      }
    });
  }

  // Raise any card below the minimum by borrowing from the fullest cards.
  for (let guard = 0; guard < n * 10; guard++) {
    const lo = load.findIndex((l) => l.length < min);
    if (lo < 0) break;
    let donor = -1;
    for (let i = 0; i < n; i++) {
      if (load[i].length > min && (donor < 0 || load[i].length > load[donor].length || (load[i].length === load[donor].length && Math.abs(i - lo) < Math.abs(donor - lo)))) {
        if (load[i].some((c) => !has(lo, c) && c.per_quarter < n)) donor = i;
      }
    }
    if (donor < 0) { warnings.push(`Card ${lo + 1} has fewer than ${min} tasks.`); break; }
    const movable = load[donor]
      .filter((c) => !has(lo, c) && c.per_quarter < n)
      .sort((a, b) => a.per_quarter - b.per_quarter); // move the rarest tasks (least spacing damage)
    // keep spacing: pick the one whose other occurrences are farthest from `lo`
    movable.sort((a, b) => nearest(load, b, lo, donor) - nearest(load, a, lo, donor));
    const pick = movable[0];
    load[donor].splice(load[donor].indexOf(pick), 1);
    load[lo].push(pick);
  }

  const cards = load.map((chs, slot) => {
    const w = Math.floor(slot / 3), s = slot % 3;
    const start = addDays(monday, w * 7 + s * 2);
    return {
      idx: slot,
      start_date: start,
      end_date: addDays(start, 1),
      label: `${SEGMENTS[s][0]}–${SEGMENTS[s][1]}`,
      items: chs
        .slice()
        .sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name))
        .map((c) => ({ chore_id: c.id, name: c.name, room: c.room })),
    };
  });

  const roomCoverage = {};
  for (const c of cards) for (const i of c.items) roomCoverage[i.room] = (roomCoverage[i.room] || 0) + 1;
  return { cards, warnings, roomCoverage, startDate: monday };
}

function nearest(load, chore, slot, ignoreSlot) {
  let best = Infinity;
  load.forEach((l, i) => { if (i !== ignoreSlot && l.some((c) => c.id === chore.id)) best = Math.min(best, Math.abs(i - slot)); });
  return best;
}
