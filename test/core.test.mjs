import assert from 'node:assert/strict';
import { levelFor, seasonOf, hashUnit, luckyRoll, momentum, shieldsAvailable, trophyFor, addDaysIso, LUCKY_P } from '../src/core.mjs';
import { buildQuarter } from '../public/scheduler.js';

// levels never go backwards and grow
let prev = 1; for (let xp = 0; xp < 5000; xp += 7) { const l = levelFor(xp).level; assert.ok(l >= prev); prev = l; }
assert.equal(levelFor(0).level, 1); assert.equal(levelFor(60).level, 2); assert.equal(levelFor(140).level, 3);

assert.deepEqual(seasonOf('2026-10-05'), { id: '2026-Q4', name: 'Fall 2026', start: '2026-10-01', end: '2026-12-31' });
assert.equal(seasonOf('2027-02-28').end, '2027-03-31');

// lucky: deterministic, ~10%
assert.equal(hashUnit('item-5'), hashUnit('item-5'));
let hits = 0, N = 20000; for (let i = 0; i < N; i++) if (luckyRoll(hashUnit('log-' + i))) hits++;
assert.ok(Math.abs(hits / N - LUCKY_P) < 0.015, `lucky rate ${hits / N}`);
assert.ok(luckyRoll(0.05).xp > 0 && luckyRoll(0.5) === null);

// momentum
const T = '2026-10-07'; // Wed
const act = (...offs) => new Set(offs.map((o) => addDaysIso(T, o)));
assert.equal(momentum(act(-3, -2, -1, 0), new Set(), T), 4);
assert.equal(momentum(act(-5, -4, -3, -2, -1), new Set(), T), 5);
// one rest day costs nothing; long gap erodes gently, never below 0
assert.equal(momentum(act(-3, -2, 0), new Set(), T), 3);
assert.equal(momentum(act(-6, -5, -4), new Set(), T), 1); // 3, then 3 missed days: first free, then -1, -1
assert.equal(momentum(new Set(), new Set(), T), 0);
// shields make missed days neutral
assert.equal(momentum(act(-6, -5, -4), act(-3, -2, -1), T), 3);
// Sundays are neutral for home (T-3 is Sunday 10-04)
assert.ok(momentum(act(-4, -2, -1), new Set(), T, { skipSunday: true }) >= momentum(act(-4, -2, -1), new Set(), T));

assert.equal(shieldsAvailable(6, 0), 0); assert.equal(shieldsAvailable(14, 1), 1); assert.equal(shieldsAvailable(100, 0), 3);
assert.deepEqual(trophyFor(4), { tier: null, next: 1 }); assert.equal(trophyFor(5).tier, 'bronze'); assert.equal(trophyFor(30).tier, 'gold');

// weak-room boost adds occurrences and still respects 3..6 per card
const chores = [
  { id: 1, name: 'a', room: 'Kitchen', per_quarter: 39 }, { id: 2, name: 'b', room: 'Kitchen', per_quarter: 13 },
  { id: 3, name: 'c', room: 'Bedrooms', per_quarter: 6 }, { id: 4, name: 'd', room: 'Bedrooms', per_quarter: 3 },
  { id: 5, name: 'e', room: 'Garage', per_quarter: 1 }, { id: 6, name: 'f', room: 'Living', per_quarter: 39 },
  { id: 7, name: 'g', room: 'Living', per_quarter: 13 }, { id: 8, name: 'h', room: 'Bath', per_quarter: 13 },
];
const base = buildQuarter(chores, '2026-10-05'), boosted = buildQuarter(chores, '2026-10-05', { boostRooms: ['Bedrooms', 'Garage'] });
const count = (r, id) => r.cards.flatMap((c) => c.items).filter((i) => i.chore_id === id).length;
assert.equal(count(boosted, 3), count(base, 3) + 1); assert.equal(count(boosted, 5), 2); assert.equal(count(boosted, 1), 39);
assert.deepEqual(boosted.boosted.sort(), ['c', 'd', 'e']);
for (const c of boosted.cards) assert.ok(c.items.length >= 3 && c.items.length <= 6);
console.log('core ok');
