// ================================================================ ROOM DATA: groupings and correlations (the Deck view and the insights draw on these)
const CL_POS = [[0.30, 0.52], [0.55, 0.26], [0.58, 0.70], [0.80, 0.46], [0.12, 0.27], [0.12, 0.80], [0.90, 0.84], [0.36, 0.89]];
const BANDS = (f) => (f >= 26 ? 0 : f >= 12 ? 1 : f >= 6 ? 2 : f >= 3 ? 3 : 4);
const CONST = ROOMS.map((room, ri) => {
  const tasks = TASKS.filter((t) => t.ri === ri).sort((a, b) => b.f - a.f), bands = {}; tasks.forEach((t) => (bands[BANDS(t.f)] ||= []).push(t));
  const keys = Object.keys(bands).map(Number).sort((a, b) => a - b), load = tasks.reduce((a, t) => a + t.f, 0);
  return { ri, room, tasks, bands: keys.map((k, i) => ({ k, i, n: keys.length, tasks: bands[k] })), load };
});
const MAXLOAD = Math.max(...CONST.map((c) => c.load));
// correlations between rooms' weekly rates, from the data itself
const CORR = (() => {
  const wk = ROOMS.map((_, ri) => { const a = []; for (let w = Math.max(0, lastFin - 70); w <= lastFin; w++) { let p = 0, d = 0; for (let s = 0; s < 3; s++) { const c = CARDS[w * 3 + s]; for (const x of c.tasks) if (x.t.ri === ri && c.finished) { p++; if (x.done) d++; } } a.push(p ? d / p : null); } return a; }), out = [];
  const all = wk[0].map((_, i) => mean(wk.map((r) => r[i]).filter((v) => v != null)));
  const resid = wk.map((r) => r.map((v, i) => (v == null ? null : v - all[i])));
  for (let i = 0; i < ROOMS.length; i++) for (let j = i + 1; j < ROOMS.length; j++) { const pairs = resid[i].map((v, k) => [v, resid[j][k]]).filter((p) => p[0] != null && p[1] != null); if (pairs.length < 30) continue; const ma = mean(pairs.map((p) => p[0])), mb = mean(pairs.map((p) => p[1])); let num = 0, da = 0, db = 0; pairs.forEach(([a, b]) => { num += (a - ma) * (b - mb); da += (a - ma) ** 2; db += (b - mb) ** 2; }); out.push({ a: i, b: j, r: num / Math.sqrt(da * db || 1) }); }
  return out.sort((x, y) => y.r - x.r).slice(0, 5);
})();

