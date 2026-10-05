import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQuarter, nextMonday } from '../public/scheduler.js';

// Parse starter chores out of the seed migration so the test tracks the real data.
const sql = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const block = sql.slice(sql.indexOf('INSERT INTO chores'));
const chores = [...block.matchAll(/\('([^']+)','([^']+)',(\d+)\)/g)]
  .map((m, i) => ({ id: i + 1, name: m[1], room: m[2], per_quarter: +m[3] }));
assert.ok(chores.length >= 30, `parsed ${chores.length} chores`);

const { cards, warnings, roomCoverage } = buildQuarter(chores, '2026-10-05');
assert.equal(cards.length, 39);
assert.deepEqual(warnings, []);
for (const c of cards) assert.ok(c.items.length >= 3 && c.items.length <= 6, `card ${c.idx} has ${c.items.length}`);
for (const c of cards) assert.equal(new Set(c.items.map((i) => i.chore_id)).size, c.items.length, 'no duplicate chore on a card');

for (const ch of chores) {
  const slots = cards.flatMap((c) => c.items.filter((i) => i.chore_id === ch.id).map(() => c.idx));
  assert.equal(slots.length, ch.per_quarter, `${ch.name} count`);
  if (ch.per_quarter > 1 && ch.per_quarter < 39) {
    const gaps = slots.slice(1).map((s, i) => s - slots[i]);
    const ideal = 39 / ch.per_quarter;
    assert.ok(Math.max(...gaps) <= ideal * 2 + 2, `${ch.name} too clumpy: ${gaps}`);
  }
}
assert.equal(cards[0].label, 'Mon–Tue');
assert.equal(cards[1].label, 'Wed–Thu');
assert.equal(cards[2].label, 'Fri–Sat');
assert.equal(nextMonday('2026-10-05'), '2026-10-05'); // already Monday
assert.equal(nextMonday('2026-10-07'), '2026-10-12');

// Warns instead of silently failing
assert.ok(buildQuarter([{ id: 1, name: 'x', room: 'r', per_quarter: 2 }], '2026-10-05').warnings.length > 0);
console.log('scheduler ok:', cards.map((c) => c.items.length).join(' '));
console.log('rooms:', roomCoverage);
