// ================================================================ RENDERING CORE: tweens, palette, atmosphere, and the TERRAIN (time as landscape)
class Tw { constructor(v, k = 5) { this.v = v; this.t = v; this.k = k; } step(dt) { this.v += (this.t - this.v) * (1 - Math.exp(-this.k * dt)); return this.v; } to(t, hard) { this.t = t; if (hard) this.v = t; return this; } }
const INK = {}, BASE = [0, 0, 0];   // filled from the theme's CSS variables by syncPalette()
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const RAMP = [[0.35, [0, 0, 0]], [0.58, [0, 0, 0]], [0.78, [0, 0, 0]], [0.92, [0, 0, 0]]];   // low → high; the colours come from --r1..--r4
const GLINT = [0, 0, 0], ASH = [0, 0, 0];
function heat(v) { if (v <= RAMP[0][0]) return RAMP[0][1]; for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) return mixc(RAMP[i - 1][1], RAMP[i][1], (v - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0])); return RAMP[RAMP.length - 1][1]; }
// value, momentum (-1..1) and instability (0..1) → one colour
function tone(v, m = 0, u = 0) { let c = heat(v); c = m < 0 ? mixc(c, RAMP[0][1], -m * 0.35) : mixc(c, GLINT, m * 0.22); c = mixc(c, ASH, u * 0.5); return c; }
const FONT = { ui: '"Instrument Sans", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace', disp: '"Fraunces", Georgia, serif' };
function glowSprite(rgb, size = 64) { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, rgba(rgb, 1)); gr.addColorStop(0.18, rgba(rgb, 0.55)); gr.addColorStop(0.5, rgba(rgb, 0.12)); gr.addColorStop(1, rgba(rgb, 0)); g.fillStyle = gr; g.fillRect(0, 0, size, size); return c; }
const SPR = {};
function syncPalette() {
  const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim().split(/\s+/).map(Number);
  Object.assign(INK, { ivory: v('--ink-rgb'), muted: v('--muted-rgb'), ember: v('--alert-rgb'), copper: v('--copper-rgb'), amber: v('--accent-rgb'), verd: v('--ai-rgb'), steel: v('--fit-rgb') });
  BASE.splice(0, 3, ...v('--base-rgb')); INK.dim = mixc(INK.ivory, BASE, 0.3);
  RAMP.forEach((r, i) => (r[1] = v('--r' + (i + 1)))); GLINT.splice(0, 3, ...v('--glint-rgb')); ASH.splice(0, 3, ...v('--ash-rgb'));
  for (const k of ['amber', 'ember', 'verd', 'ivory', 'copper']) SPR[k] = glowSprite(INK[k]);
}
syncPalette();
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i; return lerp(hash1(i), hash1(i + 1), smooth(f)) * 2 - 1; };

// ---- view state for one landscape: where it is looking, what it emphasises. Tweened so every change flows.
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
function makeLandState() {
  return { t0: new Tw(Math.max(0, NOW_DAY - 7 * 26), 4.5), t1: new Tw(NOW_DAY + 7 * 6, 4.5), rowsKind: 'rooms', rowA: Array.from({ length: 14 }, () => new Tw(1, 5)), fc: new Tw(0.55, 3), band: { a: new Tw(0, 5), b: new Tw(0, 5), s: new Tw(0, 3.5), label: '' }, links: [], marks: [], callouts: [], focusRoom: -1, hover: null, hoverRow: -1 };
}
function stepLand(st, dt) { const all = [st.t0, st.t1, st.fc, st.band.a, st.band.b, st.band.s, ...st.rowA, ...st.links.map((l) => l.p), ...st.callouts.map((c) => c.a)]; for (const w of all) { if (RM) w.v = w.t; else w.step(dt); } }
const CLK = { t: 0, dt: 0.016 };
const levelOf = (st) => { const d = st.t1.v - st.t0.v; return d > 420 ? 'Life' : d > 190 ? 'Year' : d > 70 ? 'Season' : d > 24 ? 'Month' : d > 8 ? 'Week' : 'Day'; };

// ---- time axis helpers
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WDS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function axisTicks(t0, t1) {
  const span = t1 - t0, out = [];
  if (span > 420) { for (let d = Math.floor(t0 / 30) * 30; d <= t1; d += 5) { const dt = dateAt(d); if (dt.getDate() <= 5 && dt.getMonth() % 3 === 0 && !out.some((o) => o.d > d - 40 && o.d <= d)) out.push({ d: dayIdx(new Date(dt.getFullYear(), dt.getMonth(), 1)), l: `${MONS[dt.getMonth()]} ’${String(dt.getFullYear()).slice(2)}`, major: dt.getMonth() === 0 }); } }
  else if (span > 100) { for (let d = Math.floor(t0) - 31; d <= t1 + 31; d += 3) { const dt = dateAt(d), f = dayIdx(new Date(dt.getFullYear(), dt.getMonth(), 1)); if (!out.some((o) => o.d === f)) out.push({ d: f, l: dt.getMonth() === 0 ? `${MONS[0]} ’${String(dt.getFullYear()).slice(2)}` : MONS[dt.getMonth()], major: dt.getMonth() === 0 }); } }
  else if (span > 26) { for (let d = Math.floor(t0 / 7) * 7; d <= t1; d += 7) { const dt = dateAt(d); out.push({ d, l: `${MONS[dt.getMonth()]} ${dt.getDate()}`, major: dt.getDate() <= 7 }); } }
  else { const step = span > 14 ? 2 : 1; for (let d = Math.floor(t0); d <= t1; d += step) { const dt = dateAt(d); out.push({ d, l: span > 9 ? `${dt.getDate()}` : `${WDS[dt.getDay()]} ${dt.getDate()}`, major: dt.getDay() === 1 }); } }
  return out;
}
const seasonOfMonth = (m) => (m === 11 || m <= 1 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3);      // winter, spring, summer, autumn
const SEASON = [{ n: 'Winter', c: INK.steel }, { n: 'Spring', c: INK.verd }, { n: 'Summer', c: INK.amber }, { n: 'Autumn', c: INK.copper }];

// ---- the TERRAIN. rows are ridges; height = completion; hue = momentum; fragmentation = instability; thickness/opacity = how much evidence; particles flow with momentum.
const PARTS = Array.from({ length: 14 }, (_, r) => Array.from({ length: 34 }, (_, i) => ({ u: hash1(r * 91 + i * 13), sp: 0.5 + hash1(r * 17 + i * 3) * 1, jit: hash1(r * 5 + i * 41) })));
function terrainGeom(st, rect, rows) { // shared geometry so hit-testing and drawing agree
  const R = rows.length, sp = rect.h / (R + 1.5), A = sp * (R > 4 ? 2.5 : 2.3);
  return { R, sp, A, base: (i) => rect.y + rect.h - 14 - i * sp - (R > 4 ? 0 : sp * 0.15), xOf: (day) => rect.x + ((day - st.t0.v) / (st.t1.v - st.t0.v)) * rect.w, dayOf: (x) => st.t0.v + ((x - rect.x) / rect.w) * (st.t1.v - st.t0.v) };
}
const fh = (v) => { let x = clamp((v - 0.3) / 0.7, 0, 1.3); if (x > 0.8) x = 0.8 + (x - 0.8) * 0.35; return Math.pow(x, 1.2); };
function drawTerrain(g, st, rect, o = {}) {
  const rows = ROWSETS[st.rowsKind], geo = terrainGeom(st, rect, rows), { R, sp, A } = geo, t0 = st.t0.v, t1 = st.t1.v, span = t1 - t0, mini = !!o.mini;
  const N = clamp(Math.round(rect.w / (mini ? 3 : 3.4)), 50, 340), cards = dayToCard(span), sigma = Math.max(st.rowsKind === 'pairs' ? 2.2 : 0.85, Math.min(6, cards / 60), (cards / N) * 1.25), alpha = o.alpha ?? 1;
  g.save(); g.globalAlpha = alpha;
  // ---- seasons: faint tint along the ground so the year reads as a place
  if (!mini) {
    const y0 = rect.y + rect.h + 4;
    for (let d = Math.floor(t0) - 31; d <= t1 + 31; d += 15) { const dt = dateAt(d), mS = dayIdx(new Date(dt.getFullYear(), dt.getMonth(), 1)), mE = dayIdx(new Date(dt.getFullYear(), dt.getMonth() + 1, 1)); if (mS < d - 14 && d > Math.floor(t0) - 31) { /* dedupe by month start */ } }
    const seen = new Set();
    for (let d = Math.floor(t0) - 32; d <= t1 + 32; d += 10) { const dt = dateAt(d), key = dt.getFullYear() * 12 + dt.getMonth(); if (seen.has(key)) continue; seen.add(key); const mS = dayIdx(new Date(dt.getFullYear(), dt.getMonth(), 1)), mE = dayIdx(new Date(dt.getFullYear(), dt.getMonth() + 1, 1)), xa = clamp(geo.xOf(mS), rect.x, rect.x + rect.w), xb = clamp(geo.xOf(mE), rect.x, rect.x + rect.w); if (xb <= xa) continue; const se = SEASON[seasonOfMonth(dt.getMonth())]; const gr = g.createLinearGradient(0, rect.y + rect.h * 0.35, 0, rect.y + rect.h + 6); gr.addColorStop(0, rgba(se.c, 0)); gr.addColorStop(1, rgba(se.c, 0.075)); g.fillStyle = gr; g.fillRect(xa, rect.y + rect.h * 0.35, xb - xa, rect.h * 0.65 + 6); }
  }
  // ---- cycle boundaries: a faint line where each cycle starts
  if (!mini) { g.setLineDash([2, 5]); g.lineWidth = 1; for (const set of S.sets) { const d = isoToDay(set.start_date), x = geo.xOf(d); if (x < rect.x || x > rect.x + rect.w) continue; g.strokeStyle = rgba(INK.ivory, 0.09); g.beginPath(); g.moveTo(x, rect.y); g.lineTo(x, rect.y + rect.h); g.stroke(); if (span < 600 && rect.w > 500 && Math.abs(x - geo.xOf(NOW_DAY)) > 90) { g.fillStyle = rgba(INK.muted, 0.8); g.font = `500 10px ${FONT.mono}`; g.textAlign = 'left'; g.fillText(`CYCLE ${set.n}`, x + 5, rect.y + 2); } } g.setLineDash([]); }
  // ---- ridges, back to front
  const pts = [];
  for (let ri = R - 1; ri >= 0; ri--) {
    const row = rows[ri], ra = (mini ? 1 : st.rowA[ri]?.v ?? 1), base = geo.base(ri), xs = new Float32Array(N), ys = new Float32Array(N), vs = new Float32Array(N), ms = new Float32Array(N), us = new Float32Array(N), ws = new Float32Array(N), rw = new Float32Array(N);
    for (let k = 0; k < N; k++) { const day = t0 + (span * k) / (N - 1), s = sampleRowAt(row, day, sigma); xs[k] = rect.x + (rect.w * k) / (N - 1); vs[k] = s.v; us[k] = s.u; rw[k] = s.w; ws[k] = clamp(s.w / 5, 0.25, 1); }
    const mh = Math.max(2, Math.round(N / 28));
    for (let k = 0; k < N; k++) { ms[k] = clamp((vs[Math.min(N - 1, k + mh)] - vs[Math.max(0, k - mh)]) * 5, -1, 1); const jit = us[k] > 0.28 ? noise1(xs[k] * 0.09 + CLK.t * 1.6 + ri * 7) * (us[k] - 0.2) * 7 : 0; ys[k] = base - A * fh(vs[k]) + jit; }
    pts[ri] = { xs, ys, vs, ms, us, base };
    // the fill occludes rows behind; its top edge carries a faint gradient so ridges read as solid ground
    const nowK = Math.min(N - 1, Math.max(0, Math.round(((NOW_DAY - t0) / span) * (N - 1)))), futureK = NOW_DAY > t0 && NOW_DAY < t1 ? nowK : N;
    g.beginPath(); g.moveTo(xs[0], base + 12); for (let k = 0; k < Math.min(N, futureK + 1); k++) g.lineTo(xs[k], ys[k]); g.lineTo(xs[Math.min(N - 1, futureK)], base + 12); g.closePath();
    const fillTop = Math.min(...ys.subarray(0, Math.max(1, Math.min(N, futureK)))), gr = g.createLinearGradient(0, fillTop, 0, base + 12), mood = tone(mean(Array.from(vs)), 0, 0);
    gr.addColorStop(0, `rgba(${mood[0] | 0},${mood[1] | 0},${mood[2] | 0},${0.2 * ra})`); gr.addColorStop(0.55, rgba(BASE, 0.93)); gr.addColorStop(1, rgba(BASE, 0.98)); g.fillStyle = gr; g.fill();
    if (!mini && ra > 0.3) { // topographic contours inside the ridge
      g.save(); g.clip(); g.lineWidth = 1; for (const f of [0.28, 0.5, 0.72]) { g.strokeStyle = rgba(INK.ivory, 0.045 * ra); g.beginPath(); const yy = base - A * f; g.moveTo(rect.x, yy); g.lineTo(rect.x + rect.w, yy); g.stroke(); } g.restore();
    }
    // the line itself, segment by segment: hue = health + momentum, dash = instability, weight = evidence
    g.lineCap = 'round';
    for (let k = 1; k < Math.min(N, futureK + 1); k++) {
      if (rw[k] < 0.02 && rw[k - 1] < 0.02) continue;
      const u = us[k], frag = u > 0.55 && hash1(k * 1.7 + ri * 31 + Math.floor(CLK.t * 2.5)) < (u - 0.5) * 0.9; if (frag) continue;
      const c = tone(vs[k], ms[k], u), peak = vs[k] > 0.9 ? 0.25 : 0; g.strokeStyle = rgba(mixc(c, GLINT, peak), (mini ? 0.9 : 0.5 + 0.5 * ws[k]) * ra); g.lineWidth = (mini ? 1.3 : 0.9 + 1.5 * ws[k]) * (ri === st.hoverRow ? 1.25 : 1);
      g.beginPath(); g.moveTo(xs[k - 1], ys[k - 1]); g.lineTo(xs[k], ys[k]); g.stroke();
    }
    // sparks shed by unstable stretches: the field visibly coming apart
    if (!mini && ra > 0.3) { g.globalCompositeOperation = 'lighter'; for (let k = 4; k < Math.min(N, futureK + 1); k += 5) { if (us[k] < 0.42) continue; const n = hash1(k * 3.3 + ri), ph = (CLK.t * 0.35 + n * 5) % 1, x = xs[k] + noise1(k + CLK.t) * 6, y = ys[k] - ph * 26 * us[k]; g.globalAlpha = (1 - ph) * 0.5 * ra * us[k]; g.drawImage(SPR.ember, x - 4, y - 4, 8, 8); } g.globalAlpha = alpha; g.globalCompositeOperation = 'source-over'; }
    // forecast: the same ridge continued, dashed and verdigris, with an uncertainty fan
    if (!mini && row.fc && NOW_DAY < t1 + 1) {
      const k0 = Math.max(0, futureK), fa = st.fc.v * ra;
      if (k0 < N - 1) { g.beginPath(); for (let k = k0; k < N; k++) { const bnd = (row.band[Math.min(row.band.length - 1, Math.round(dayToCard(t0 + (span * k) / (N - 1))))] || 0.1), y = base - A * fh(vs[k] + bnd); k === k0 ? g.moveTo(xs[k], y) : g.lineTo(xs[k], y); } for (let k = N - 1; k >= k0; k--) { const bnd = (row.band[Math.min(row.band.length - 1, Math.round(dayToCard(t0 + (span * k) / (N - 1))))] || 0.1), y = base - A * fh(vs[k] - bnd); g.lineTo(xs[k], y); } g.closePath(); g.fillStyle = rgba(INK.verd, 0.12 * fa); g.fill();
        g.setLineDash([3, 4]); g.lineWidth = 1.3; g.strokeStyle = rgba(INK.verd, 0.85 * fa); g.beginPath(); for (let k = Math.max(0, k0 - 1); k < N; k++) k === Math.max(0, k0 - 1) ? g.moveTo(xs[k], ys[k]) : g.lineTo(xs[k], ys[k]); g.stroke(); g.setLineDash([]); }
    }
  }
  // ---- particles ride the ridges: faster where momentum is up, scattered where it is unstable
  if (!mini) {
    g.globalCompositeOperation = 'lighter';
    for (let ri = 0; ri < R; ri++) { const p = pts[ri], ra = st.rowA[ri]?.v ?? 1; if (ra < 0.25 || !p) continue; const n = 14 + Math.round(18 * clamp(mean(Array.from(p.vs.filter((_, k) => k % 8 === 0))) , 0.3, 1));
      for (let i = 0; i < n; i++) { const q = PARTS[ri][i], k = Math.floor(clamp(((q.u + CLK.t * 0.03 * q.sp * (1 + p.ms[Math.floor(q.u * (N - 1))] * 0.9)) % 1) * (N - 1), 0, N - 2)), u = p.us[k], x = p.xs[k] + noise1(CLK.t * 2 + i) * u * 5, y = p.ys[k] + noise1(CLK.t * 1.5 + i * 3) * u * 8 - 1; if (NOW_DAY > t0 && NOW_DAY < t1 && x > geo.xOf(NOW_DAY)) continue; g.globalAlpha = (0.18 + 0.5 * (1 - u)) * ra * alpha; const c = p.vs[k] > 0.75 ? SPR.amber : SPR.ember, s = 7 + 4 * q.jit; g.drawImage(c, x - s / 2, y - s / 2, s, s); } }
    g.globalAlpha = alpha; g.globalCompositeOperation = 'source-over';
  }
  st._pts = pts; st._geo = geo; st._N = N;
  g.restore();
  return geo;
}

// ================================================================ TERRAIN OVERLAYS: landmarks, spotlight, links, callouts, scan line
const txt = (g, s, x, y, o = {}) => { g.font = o.font || `500 10px ${FONT.mono}`; g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic'; if (o.ls) g.letterSpacing = o.ls; g.fillStyle = o.color || rgba(INK.dim, o.a ?? 1); g.fillText(s, x, y); if (o.ls) g.letterSpacing = '0px'; };
function rowY(st, rect, rowI, day) { const p = st._pts && st._pts[rowI]; if (!p) return rect.y + rect.h / 2; const k = clamp(Math.round(((day - st.t0.v) / (st.t1.v - st.t0.v)) * (st._N - 1)), 0, st._N - 1); return p.ys[k]; }
function drawTerrainOverlay(g, st, rect, o = {}) {
  const geo = st._geo; if (!geo) return; const t0 = st.t0.v, t1 = st.t1.v, span = t1 - t0, mini = !!o.mini, al = o.alpha ?? 1; g.save(); g.globalAlpha = al;
  const px = (d) => geo.xOf(d), inX = (x) => x >= rect.x - 1 && x <= rect.x + rect.w + 1;
  // ---- landmarks: holidays stand as thin pins on the ground
  let lastLab = null; if (!mini) for (const h of HOLIDAYS) { const x = px(h.day); if (!inX(x)) continue; const major = h.rank >= 2, show = span < 130 || major || (span < 280 && h.rank >= 1); if (!show) continue; const gr = g.createLinearGradient(0, rect.y - 6, 0, rect.y + rect.h); gr.addColorStop(0, rgba(INK.ivory, major ? 0.34 : 0.2)); gr.addColorStop(1, rgba(INK.ivory, 0)); g.strokeStyle = gr; g.lineWidth = 1; g.beginPath(); g.moveTo(x, rect.y - 6); g.lineTo(x, rect.y + rect.h); g.stroke();
    g.fillStyle = rgba(INK.ivory, major ? 0.9 : 0.6); g.beginPath(); g.moveTo(x, rect.y - 12); g.lineTo(x + 3.5, rect.y - 8); g.lineTo(x, rect.y - 4); g.lineTo(x - 3.5, rect.y - 8); g.closePath(); g.fill(); if (rect.w > 500 && (major || span < 130) && !(st.band.s.v > 0.4 && Math.abs(x - (px(st.band.a.v) + px(st.band.b.v)) / 2) < 110) && !(lastLab !== null && x - lastLab < 92)) { lastLab = x; txt(g, h.name.toUpperCase(), x + 7, rect.y - 5, { font: `500 9px ${FONT.mono}`, color: rgba(INK.ivory, major ? 0.78 : 0.5), ls: '0.8px' }); } }
  // ---- now
  if (NOW_DAY > t0 && NOW_DAY < t1) { const x = px(NOW_DAY), pu = 0.5 + 0.5 * Math.sin(CLK.t * 2.4); const gr = g.createLinearGradient(0, rect.y - 14, 0, rect.y + rect.h); gr.addColorStop(0, rgba(INK.amber, 0.9)); gr.addColorStop(1, rgba(INK.amber, 0.06)); g.strokeStyle = gr; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, rect.y - 14); g.lineTo(x, rect.y + rect.h); g.stroke(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = al * (0.5 + 0.5 * pu); g.drawImage(SPR.amber, x - 11, rect.y - 25, 22, 22); g.globalAlpha = al; g.globalCompositeOperation = 'source-over'; if (!mini) txt(g, 'TODAY', x + (x > rect.x + rect.w - 70 ? -8 : 8), rect.y - 18, { color: rgba(INK.amber, 0.95), font: `600 9px ${FONT.mono}`, ls: '1.2px', align: x > rect.x + rect.w - 70 ? 'right' : 'left' }); if (!mini && x < rect.x + rect.w - 60 && st.fc.v > 0.2) txt(g, 'LIKELY →', x + 8, rect.y + 8, { color: rgba(INK.verd, 0.95 * st.fc.v), font: `500 9px ${FONT.mono}`, ls: '1.2px' }); }
  // ---- AI links: arcs that connect cause to effect, with energy running along them
  for (const l of st.links) { const a = l.p.v; if (a < 0.02) continue; const ax = px(l.a.day), ay = rowY(st, rect, l.a.row, l.a.day), bx = px(l.b.day), by = rowY(st, rect, l.b.row, l.b.day); if (!inX(ax) && !inX(bx)) continue; const cx = (ax + bx) / 2, cy = Math.min(ay, by) - 34 - Math.abs(bx - ax) * 0.1;
    g.setLineDash([4, 4]); g.strokeStyle = rgba(INK.verd, 0.62 * a); g.lineWidth = 1.2; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo(cx, cy, bx, by); g.stroke(); g.setLineDash([]);
    g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 4; i++) { const t = (CLK.t * 0.4 + i / 4) % 1, x = (1 - t) ** 2 * ax + 2 * (1 - t) * t * cx + t * t * bx, y = (1 - t) ** 2 * ay + 2 * (1 - t) * t * cy + t * t * by; g.globalAlpha = al * a * 0.9; g.drawImage(SPR.verd, x - 6, y - 6, 12, 12); } g.globalAlpha = al; g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgba(INK.verd, a); g.beginPath(); g.arc(bx, by, 3, 0, 6.283); g.fill(); }
  // ---- anomalies: places where the field was disturbed
  if (!mini) for (const m of st.marks) { const x = px(m.day); if (!inX(x)) continue; const y = rowY(st, rect, m.row, m.day), ph = (CLK.t * 0.8 + m.day * 0.13) % 1, a = (m.a?.v ?? 1); g.strokeStyle = rgba(INK.ember, (1 - ph) * 0.8 * a); g.lineWidth = 1; g.beginPath(); g.arc(x, y, 4 + ph * 14, 0, 6.283); g.stroke(); g.fillStyle = rgba(INK.ember, 0.95 * a); g.beginPath(); g.arc(x, y, 2.6, 0, 6.283); g.fill(); }
  // ---- spotlight band: everything outside falls away; the region of interest is lit from within
  const bs = st.band.s.v; if (bs > 0.01) { const xa = clamp(px(st.band.a.v), rect.x, rect.x + rect.w), xb = clamp(px(st.band.b.v), rect.x, rect.x + rect.w), y0 = rect.y - 26, y1 = rect.y + rect.h + 34;
    g.fillStyle = rgba(BASE, 0.64 * bs); g.fillRect(rect.x - 60, y0, xa - rect.x + 60, y1 - y0); g.fillRect(xb, y0, rect.x + rect.w - xb + 60, y1 - y0);
    if (xb > xa) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, rgba(INK.amber, 0.0)); gr.addColorStop(0.5, rgba(INK.amber, 0.06 * bs * (0.8 + 0.2 * Math.sin(CLK.t * 1.6)))); gr.addColorStop(1, rgba(INK.amber, 0)); g.fillStyle = gr; g.fillRect(xa, y0, xb - xa, y1 - y0);
      for (const x of [xa, xb]) { const e = g.createLinearGradient(0, y0, 0, y1); e.addColorStop(0, rgba(INK.amber, 0)); e.addColorStop(0.3, rgba(INK.amber, 0.85 * bs)); e.addColorStop(0.7, rgba(INK.amber, 0.85 * bs)); e.addColorStop(1, rgba(INK.amber, 0)); g.strokeStyle = e; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); }
      if (st.band.label) txt(g, st.band.label.toUpperCase(), (xa + xb) / 2, y0 + 12, { align: 'center', color: rgba(INK.amber, bs), font: `600 9.5px ${FONT.mono}`, ls: '1.6px' }); } }
  // ---- axis
  if (!mini) { const ay = rect.y + rect.h + 22; g.strokeStyle = rgba(INK.ivory, 0.1); g.lineWidth = 1; g.beginPath(); g.moveTo(rect.x, ay - 12); g.lineTo(rect.x + rect.w, ay - 12); g.stroke(); let lastX = -99;
    for (const tk of axisTicks(t0, t1)) { const x = px(tk.d); if (x < rect.x - 2 || x > rect.x + rect.w + 2) continue; g.strokeStyle = rgba(INK.ivory, tk.major ? 0.3 : 0.16); g.beginPath(); g.moveTo(x, ay - 12); g.lineTo(x, ay - (tk.major ? 5 : 8)); g.stroke(); if (x - lastX > 40) { txt(g, tk.l, x + 3, ay + 1, { color: rgba(tk.major ? INK.dim : INK.muted, 1), font: `500 9.5px ${FONT.mono}` }); lastX = x; } }
    if (span > 120) { const seen = new Set(); for (let d = Math.floor(t0) - 40; d <= t1 + 40; d += 12) { const dt = dateAt(d), key = dt.getFullYear() * 4 + seasonOfMonth(dt.getMonth()) + (dt.getMonth() === 11 ? 0 : 0), s = seasonOfMonth(dt.getMonth()); if (seen.has(`${dt.getFullYear()}-${s}-${dt.getMonth() >= 11 ? 'x' : ''}`)) continue; seen.add(`${dt.getFullYear()}-${s}-${dt.getMonth() >= 11 ? 'x' : ''}`); const mid = [1, 4, 7, 10][s] ; const sx = geo.xOf(dayIdx(new Date(dt.getFullYear(), s === 0 && dt.getMonth() === 11 ? 12 : mid, 1))); if (sx > rect.x + 40 && sx < rect.x + rect.w - 40) txt(g, SEASON[s].n.toUpperCase(), sx, ay + 14, { align: 'center', color: rgba(SEASON[s].c, 0.7), font: `500 8.5px ${FONT.mono}`, ls: '1.6px' }); } } }
  // ---- row labels, set right against the ground they describe
  if (!mini) { const rows = ROWSETS[st.rowsKind]; rows.forEach((row, i) => { const y = geo.base(i), ra = st.rowA[i]?.v ?? 1, last = sampleRowAt(row, clamp(NOW_DAY - 3, t0, t1), 2.5), mo = clamp((sampleRowAt(row, NOW_DAY - 2, 2.5).v - sampleRowAt(row, NOW_DAY - 24, 2.5).v) * 5, -1, 1), hot = st.hoverRow === i || st.focusRoom === i;
    if (rect.w < 500) { const nm = row.name.replace('Living room', 'Living').replace('Bathrooms', 'Baths').replace('Bedrooms', 'Beds').toUpperCase(); txt(g, nm, rect.x - 8, y - 2, { align: 'right', color: rgba(hot ? INK.ivory : INK.dim, (0.5 + 0.5 * ra)), font: `600 8.5px ${FONT.ui}`, ls: '1px' }); txt(g, `${last.w < 0.05 ? '–' : Math.round(last.v * 100)}`, rect.x - 8, y + 8, { align: 'right', color: rgba(tone(last.v, mo, 0), 0.9 * ra), font: `500 8.5px ${FONT.mono}` }); return; }
    txt(g, row.name.toUpperCase(), rect.x - 14, y - 6, { align: 'right', color: rgba(hot ? INK.ivory : INK.dim, (0.5 + 0.5 * ra) * (hot ? 1 : 0.85)), font: `600 10px ${FONT.ui}`, ls: '1.4px' });
    txt(g, `${last.w < 0.05 ? '–' : Math.round(last.v * 100)}`, rect.x - 40, y + 7, { align: 'right', color: rgba(tone(last.v, mo, 0), 0.95 * ra), font: `500 11px ${FONT.mono}` }); txt(g, mo > 0.15 ? '▲' : mo < -0.15 ? '▼' : '–', rect.x - 14, y + 7, { align: 'right', color: rgba(tone(last.v, mo, 0), 0.8 * ra), font: `500 8px ${FONT.mono}` }); g.strokeStyle = rgba(INK.ivory, 0.05 * ra); g.beginPath(); g.moveTo(rect.x - 10, y); g.lineTo(rect.x + 4, y); g.stroke(); }); }
  // ---- callouts the AI placed on the data itself
  for (const c of st.callouts) { const a = c.a.v; if (a < 0.02) continue; const x = px(c.day); if (!inX(x)) continue; const y = c.row == null ? rect.y + rect.h * c.fy : rowY(st, rect, c.row, c.day) + (c.dy || 0), sd = (c.side || 1) > 0 ? (x + 26 + 130 > rect.x + rect.w + (rect.w < 500 ? -6 : 40) ? -1 : 1) : (x - 26 - 130 < rect.x - 60 ? 1 : -1), tx = x + sd * 26, ty = y - 30; g.strokeStyle = rgba(INK[c.color || 'amber'], 0.7 * a); g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.lineTo(tx + sd * 8, ty); g.stroke(); g.fillStyle = rgba(INK[c.color || 'amber'], a); g.beginPath(); g.arc(x, y, 2.6, 0, 6.283); g.fill();
    const al2 = sd > 0 ? 'left' : 'right', tx2 = tx + sd * 12; txt(g, c.text, tx2, ty - 1, { align: al2, color: rgba(INK.ivory, a), font: `600 12px ${FONT.ui}` }); if (c.sub) txt(g, c.sub, tx2, ty + 12, { align: al2, color: rgba(INK.dim, 0.9 * a), font: `500 10px ${FONT.mono}` }); }
  // ---- scan line: hover reads the instrument at any moment
  if (!mini && st.hover && st.hover.x >= rect.x && st.hover.x <= rect.x + rect.w && st.hover.y >= rect.y - 30 && st.hover.y <= rect.y + rect.h + 50) { const x = st.hover.x, day = geo.dayOf(x), dt = dateAt(day); g.strokeStyle = rgba(INK.ivory, 0.35); g.lineWidth = 1; g.beginPath(); g.moveTo(x, rect.y - 6); g.lineTo(x, rect.y + rect.h); g.stroke(); const rows = ROWSETS[st.rowsKind], sg = Math.max(0.85, (dayToCard(span) / st._N) * 1.25); let best = -1, bd = 1e9;
    rows.forEach((row, i) => { const s = sampleRowAt(row, day, sg), y = rowY(st, rect, i, day); const ra = st.rowA[i]?.v ?? 1; if (Math.abs(y - st.hover.y) < bd) { bd = Math.abs(y - st.hover.y); best = i; } g.fillStyle = rgba(tone(s.v, 0, s.u), 0.95 * ra); g.beginPath(); g.arc(x, y, 3, 0, 6.283); g.fill(); const right = x < rect.x + rect.w - 70; txt(g, (s.w < 0.02 ? '–' : `${Math.round(s.v * 100)}%`), x + (right ? 8 : -8), y + 3.5, { align: right ? 'left' : 'right', color: rgba(INK.ivory, 0.92 * ra), font: `500 10px ${FONT.mono}` }); });
    st.hoverRow = best; const label = `${WDS[dt.getDay()]} ${dt.getDate()} ${MONS[dt.getMonth()]} ’${String(dt.getFullYear()).slice(2)}${day > NOW_DAY ? ' · forecast' : ''}`; const w = g.measureText(label).width + 16; g.fillStyle = rgba(BASE, 0.92); g.fillRect(clamp(x - w / 2, rect.x, rect.x + rect.w - w), rect.y + rect.h + 22, w, 18); txt(g, label, clamp(x - w / 2, rect.x, rect.x + rect.w - w) + 8, rect.y + rect.h + 34, { color: rgba(INK.ivory, 1), font: `500 10px ${FONT.mono}` });
    for (const h of HOLIDAYS) if (Math.abs(h.day - day) < Math.max(1.2, span / 90)) txt(g, h.name, x, rect.y - 24, { align: 'center', color: rgba(INK.ivory, 0.9), font: `600 11px ${FONT.ui}` }); } else if (!mini) st.hoverRow = -1;
  g.restore();
}
// ---- the whole-life silhouette, used as a scrubber
const MMC = {};
function drawMinimap(g, st, rect) {
  const rows = ROWSETS.rooms, N = Math.round(rect.w / 3); let ys = MMC[N]; if (!ys) { ys = MMC[N] = [];
  for (let k = 0; k < N; k++) { const day = (WEEKS * 7 + FC_WEEKS * 7) * (k / (N - 1)); let v = 0, wsum = 0; for (const row of rows) { const s = sampleRowAt(row, day, 3.2); v += s.v * (s.w + 0.2); wsum += s.w + 0.2; } ys.push(v / wsum); } }
  const x0 = (k) => rect.x + (rect.w * k) / (N - 1), yy = (v) => rect.y + rect.h - 3 - (rect.h - 8) * fh(v), nowK = Math.round((NOW_DAY / (WEEKS * 7 + FC_WEEKS * 7)) * (N - 1));
  g.beginPath(); g.moveTo(rect.x, rect.y + rect.h); for (let k = 0; k <= nowK; k++) g.lineTo(x0(k), yy(ys[k])); g.lineTo(x0(nowK), rect.y + rect.h); g.closePath(); const gr = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h); gr.addColorStop(0, rgba(INK.amber, 0.3)); gr.addColorStop(1, rgba(INK.amber, 0.02)); g.fillStyle = gr; g.fill();
  g.lineWidth = 1.1; for (let k = 1; k <= nowK; k++) { g.strokeStyle = rgba(tone(ys[k], clamp((ys[k] - ys[k - 1]) * 40, -1, 1), 0), 0.9); g.beginPath(); g.moveTo(x0(k - 1), yy(ys[k - 1])); g.lineTo(x0(k), yy(ys[k])); g.stroke(); }
  g.setLineDash([2, 3]); g.strokeStyle = rgba(INK.verd, 0.8); g.beginPath(); for (let k = nowK; k < N; k++) k === nowK ? g.moveTo(x0(k), yy(ys[k])) : g.lineTo(x0(k), yy(ys[k])); g.stroke(); g.setLineDash([]);
  for (const h of HOLIDAYS) if (h.rank >= 2 && h.day > 0 && h.day < WEEKS * 7 + 50) { const x = rect.x + (h.day / (WEEKS * 7 + FC_WEEKS * 7)) * rect.w; g.fillStyle = rgba(INK.ivory, 0.55); g.fillRect(x - 0.5, rect.y + rect.h - 6, 1, 6); }
  const tot = WEEKS * 7 + FC_WEEKS * 7, xa = rect.x + (clamp(st.t0.v, 0, tot) / tot) * rect.w, xb = rect.x + (clamp(st.t1.v, 0, tot) / tot) * rect.w; g.fillStyle = rgba(INK.ivory, 0.06); g.fillRect(xa, rect.y - 2, Math.max(4, xb - xa), rect.h + 4); g.strokeStyle = rgba(INK.ivory, 0.55); g.lineWidth = 1; g.strokeRect(xa + 0.5, rect.y - 1.5, Math.max(4, xb - xa) - 1, rect.h + 3);
}
