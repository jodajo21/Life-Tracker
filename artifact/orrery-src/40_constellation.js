// ================================================================ CONSTELLATION: rooms as orbital systems, tasks as bodies
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

function constStats(st) { // what the window says about each room and task, smoothed so colour and order glide as the window moves
  let c0 = clamp(dayToCard(st.t0.v), 0, NOW_CARD), c1 = clamp(dayToCard(st.t1.v), 0, NOW_CARD); if (c1 - c0 < 6) c0 = Math.max(0, c1 - 6);
  const key = `${Math.round(c0 / 2)}-${Math.round(c1 / 2)}`; if (st._ck !== key) { st._ck = key; st._cw = windowStats(c0, c1); }
  const w = st._cw; st._nv ||= {}; st._ro ||= {};
  CONST.forEach((cl) => { const rm = w.rooms[cl.ri]; const ro = (st._ro[cl.ri] ||= { rate: new Tw(0.7, 3), order: new Tw(0.6, 2.2), trend: new Tw(0, 3) }); ro.rate.to(rm.rate ?? 0.7); ro.trend.to(clamp(rm.trend * 8, -1, 1)); ro.order.to(clamp(0.2 + 0.85 * (1 - clamp(rm.sd / 0.2, 0, 1)) - clamp(-rm.trend * 5, 0, 0.45), 0.04, 1)); ro.rate.step(CLK.dt); ro.order.step(CLK.dt); ro.trend.step(CLK.dt);
    cl.tasks.forEach((t) => { const tk = w.tasks[t.id], nv = (st._nv[t.id] ||= { rate: new Tw(0.7, 3), sd: new Tw(0, 3) }); nv.rate.to(tk.rate ?? 0.7); nv.sd.to(tk.sd); nv.rate.step(CLK.dt); nv.sd.step(CLK.dt); }); });
  return w;
}
function constLayout(st, rect) {
  const Rmax = Math.min(rect.w, rect.h) * 0.19, f = st.clusterFocus, zc = st.zoomC.v, out = [];
  const raw = CONST.map((cl, i) => ({ x: rect.x + CL_POS[i][0] * rect.w, y: rect.y + CL_POS[i][1] * rect.h, r: Rmax * Math.sqrt(cl.load / MAXLOAD) * 0.92 + Rmax * 0.12 }));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const S = f >= 0 ? 1 + ((Math.min(rect.w, rect.h) * 0.43) / raw[f].r - 1) * zc : 1, fx = f >= 0 ? lerp(cx, raw[f].x, zc) : cx, fy = f >= 0 ? lerp(cy, raw[f].y, zc) : cy;
  raw.forEach((p, i) => out.push({ x: cx + (p.x - fx) * S, y: cy + (p.y - fy) * S, r: p.r * S, a: f >= 0 && i !== f ? lerp(1, 0.1, zc) : 1 }));
  return out;
}
function drawConst(g, st, rect, o = {}) {
  const alpha = o.alpha ?? 1, small = rect.w < 520, w = constStats(st), L = constLayout(st, rect), t = CLK.t, dueIds = new Set(CURRENT.tasks.filter((x) => x.open).map((x) => x.t.id)); g.save(); g.globalAlpha = alpha; st._cl = []; st._nodes = [];
  const sc = st.clusterFocus >= 0 ? 1 + st.zoomC.v * 0.9 : 1;
  for (const l of st.cLinks) { const p = l.p.v; if (p < 0.02) continue; const A = L[l.a], B = L[l.b], mx = (A.x + B.x) / 2 + (B.y - A.y) * 0.18, my = (A.y + B.y) / 2 - (B.x - A.x) * 0.18, al = Math.min(A.a, B.a);
    g.setLineDash(l.dash ? [3, 5] : []); g.strokeStyle = rgba(INK.verd, (0.18 + 0.5 * l.s) * p * al); g.lineWidth = 0.8 + 1.8 * l.s; g.beginPath(); g.moveTo(A.x, A.y); g.quadraticCurveTo(mx, my, B.x, B.y); g.stroke(); g.setLineDash([]);
    g.globalCompositeOperation = 'lighter'; const n = 3 + Math.round(l.s * 6); for (let i = 0; i < n; i++) { const u = (t * (0.07 + 0.12 * l.s) + i / n) % 1, x = (1 - u) ** 2 * A.x + 2 * (1 - u) * u * mx + u * u * B.x, y = (1 - u) ** 2 * A.y + 2 * (1 - u) * u * my + u * u * B.y; g.globalAlpha = alpha * p * al * 0.85; g.drawImage(SPR.verd, x - 5, y - 5, 10, 10); } g.globalAlpha = alpha; g.globalCompositeOperation = 'source-over'; }
  CONST.forEach((cl, ci) => {
    const P = L[ci], em = st.cEmph[ci].v * P.a; if (em < 0.03) return; const ro = st._ro[cl.ri], rate = ro.rate.v, order = ro.order.v, trend = ro.trend.v, col = tone(rate, trend, 1 - order), focus = st.clusterFocus === ci;
    st._cl.push({ i: ci, x: P.x, y: P.y, r: P.r }); g.globalAlpha = alpha * em;
    const fr = P.r * 1.55, gr = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, fr); gr.addColorStop(0, rgba(col, 0.2 * (0.5 + rate))); gr.addColorStop(0.55, rgba(col, 0.045)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.beginPath(); g.arc(P.x, P.y, fr, 0, 6.283); g.fill();
    cl.bands.forEach((b) => { const rb = P.r * (b.n === 1 ? 0.7 : 0.3 + 0.7 * (b.i / (b.n - 1))); g.lineWidth = 0.8; g.strokeStyle = rgba(INK.ivory, 0.1 + 0.08 * order);
      if (order > 0.7) { g.beginPath(); g.arc(P.x, P.y, rb, 0, 6.283); g.stroke(); } else { const segs = 14, gap = (1 - order) * 0.75; for (let s = 0; s < segs; s++) { const a0 = (s / segs) * 6.283 + t * 0.03 * (b.i + 1), keep = hash1(s * 13.1 + ci * 5 + b.i * 17 + Math.floor(t * 0.5)) > gap * 0.55; if (!keep) continue; g.beginPath(); g.arc(P.x, P.y, rb + noise1(s + t * 0.8 + ci) * (1 - order) * 3, a0, a0 + (6.283 / segs) * 0.82); g.stroke(); } } });
    if (order < 0.5) { g.globalCompositeOperation = 'lighter'; const nF = Math.round((0.5 - order) * 44); for (let i = 0; i < nF; i++) { const ph = (t * 0.12 + hash1(i * 3.3 + ci * 9)) % 1, ang = hash1(i * 7.1 + ci) * 6.283 + t * 0.06, rr = P.r * (0.95 + 0.7 * ph), x = P.x + Math.cos(ang) * rr + noise1(t + i) * 4, y = P.y + Math.sin(ang) * rr + noise1(t * 1.2 + i * 2) * 4; g.globalAlpha = alpha * em * (1 - ph) * 0.55; g.drawImage(SPR.ember, x - 4, y - 4, 8, 8); } g.globalAlpha = alpha * em; g.globalCompositeOperation = 'source-over'; }
    const cr = Math.max(5, P.r * 0.17); g.strokeStyle = rgba(INK.ivory, 0.12); g.lineWidth = 1.4; g.beginPath(); g.arc(P.x, P.y, cr + 4, 0, 6.283); g.stroke(); g.strokeStyle = rgba(col, 0.95); g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.arc(P.x, P.y, cr + 4, -1.5708, -1.5708 + 6.283 * clamp(rate, 0.02, 1)); g.stroke();
    g.globalCompositeOperation = 'lighter'; const pu = 0.85 + 0.15 * Math.sin(t * (1.2 + order) + ci); g.drawImage(SPR.amber, P.x - cr * 2.4 * pu, P.y - cr * 2.4 * pu, cr * 4.8 * pu, cr * 4.8 * pu); g.globalCompositeOperation = 'source-over'; g.fillStyle = rgba(mixc(col, GLINT, 0.55), 1); g.beginPath(); g.arc(P.x, P.y, cr * 0.42, 0, 6.283); g.fill();
    cl.bands.forEach((b) => b.tasks.forEach((tk, j) => {
      const rb = P.r * (b.n === 1 ? 0.7 : 0.3 + 0.7 * (b.i / (b.n - 1))), fn = Math.log2(tk.f + 1) / Math.log2(40), om = (0.1 + 0.5 * fn) * (ci % 2 ? 1 : -1), ordered = (j / b.tasks.length) * 6.283 + b.i * 1.1, free = hash1(tk.id * 3.7) * 6.283, nv = st._nv[tk.id], wob = nv.sd.v * 1.1;
      const ang = om * t + lerp(free, ordered, order) + noise1(t * 0.6 + tk.id) * wob * (1 - order * 0.6), rr = rb + noise1(t * 0.8 + tk.id * 2) * wob * P.r * 0.07;
      let x = P.x + Math.cos(ang) * rr, y = P.y + Math.sin(ang) * rr, boost = 0;
      for (const rp of st.ripples) { const age = t - rp.t0, R = age * 260 * Math.max(0.7, sc), d = Math.hypot(x - rp.x, y - rp.y), wv = Math.exp(-(((d - R) / 30) ** 2)) * (1 - age / 3.2) * rp.s; if (wv > 0.001) { x += ((x - rp.x) / (d || 1)) * wv * 9; y += ((y - rp.y) / (d || 1)) * wv * 9; boost += wv; } }
      const v = nv.rate.v, c = tone(v, 0, nv.sd.v * 1.3), rn = (2.2 + tk.effort * 1.05) * Math.min(1.8, Math.max(0.8, sc)) * (small ? 0.85 : 1) * (1 + boost * 0.6), due = dueIds.has(tk.id), miss = v < 0.5;
      st._nodes.push({ id: tk.id, ci, x, y, rn: Math.max(rn + 4, 9) });
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * em * (0.4 + 0.5 * v + boost); g.drawImage(v > 0.75 ? SPR.amber : SPR.ember, x - rn * 3.2, y - rn * 3.2, rn * 6.4, rn * 6.4); g.globalCompositeOperation = 'source-over'; g.globalAlpha = alpha * em;
      if (miss) { g.strokeStyle = rgba(c, 0.9); g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, rn, 0, 6.283); g.stroke(); const ph = (t * 0.33 + tk.id * 0.21) % 1; g.strokeStyle = rgba(INK.ember, (1 - ph) * 0.35); g.lineWidth = 1; g.beginPath(); g.arc(x, y, rn + ph * 18, 0, 6.283); g.stroke(); } else { g.fillStyle = rgba(mixc(c, GLINT, boost * 0.6 + (v > 0.92 ? 0.25 : 0)), 1); g.beginPath(); g.arc(x, y, rn, 0, 6.283); g.fill(); }
      if (due) { const ph = (t * 0.85 + tk.id * 0.13) % 1; g.strokeStyle = rgba(INK.amber, (1 - ph) * 0.9); g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, rn + 2 + ph * 11, 0, 6.283); g.stroke(); g.strokeStyle = rgba(INK.amber, 0.95); g.lineWidth = 1; g.beginPath(); g.arc(x, y, rn + 3, 0, 6.283); g.stroke(); }
      if ((focus && st.zoomC.v > 0.55) || st.hoverTask === tk.id) { const ox = Math.cos(ang) * (rn + 8), oy = Math.sin(ang) * (rn + 8); txt(g, tk.name, x + ox, y + oy + 3, { align: Math.cos(ang) >= 0 ? 'left' : 'right', color: rgba(INK.ivory, 0.92 * (focus && st.hoverTask !== tk.id ? Math.min(1, (st.zoomC.v - 0.5) * 3) : 1)), font: `500 ${small ? 9.5 : 11}px ${FONT.ui}` }); }
    }));
    const showName = true; if (showName) { txt(g, cl.room.name.toUpperCase(), P.x, P.y + P.r + (small ? 13 : 17), { align: 'center', color: rgba(INK.ivory, 0.92), font: `600 ${small ? 8.5 : 10}px ${FONT.ui}`, ls: '1.4px' }); txt(g, `${Math.round(rate * 100)}%  ${trend > 0.15 ? '▲' : trend < -0.15 ? '▼' : '–'}`, P.x, P.y + P.r + (small ? 23 : 31), { align: 'center', color: rgba(col, 1), font: `500 ${small ? 8.5 : 10.5}px ${FONT.mono}` }); }
    g.globalAlpha = alpha;
  });
  for (const rp of st.ripples) { const age = t - rp.t0, R = age * 260 * Math.max(0.7, sc), a = (1 - age / 3.2) * rp.s; g.strokeStyle = rgba(INK.amber, a * 0.55); g.lineWidth = 1.5; g.beginPath(); g.arc(rp.x, rp.y, R, 0, 6.283); g.stroke(); g.strokeStyle = rgba(INK.ivory, a * 0.18); g.lineWidth = 1; g.beginPath(); g.arc(rp.x, rp.y, R * 0.82, 0, 6.283); g.stroke(); }
  g.restore();
}
function constHit(st, x, y) {
  let best = null, bd = 1e9; for (const n of st._nodes || []) { const d = Math.hypot(n.x - x, n.y - y); if (d < n.rn && d < bd) { bd = d; best = { kind: 'task', id: n.id, ci: n.ci, x: n.x, y: n.y }; } } if (best) return best;
  for (const c of st._cl || []) { const d = Math.hypot(c.x - x, c.y - y); if (d < c.r * 1.15 && d < bd) { bd = d; best = { kind: 'cluster', i: c.i, x: c.x, y: c.y }; } } return best;
}
