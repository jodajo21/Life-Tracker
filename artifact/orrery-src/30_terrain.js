// ================================================================ RENDERING CORE: tweens, palette, atmosphere, and the TERRAIN (time as landscape)
class Tw { constructor(v, k = 5) { this.v = v; this.t = v; this.k = k; } step(dt) { this.v += (this.t - this.v) * (1 - Math.exp(-this.k * dt)); return this.v; } to(t, hard) { this.t = t; if (hard) this.v = t; return this; } }
const INK = { obsidian: '#07080a', charcoal: '#0e1012', graphite: '#1a1d21', ivory: [239, 230, 212], dim: [179, 170, 152], muted: [138, 131, 114], ember: [210, 86, 42], copper: [200, 121, 74], amber: [227, 162, 74], verd: [111, 176, 163], steel: [141, 154, 168] };
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const RAMP = [[0.35, [162, 74, 40]], [0.58, [194, 90, 43]], [0.78, [217, 136, 70]], [0.92, [238, 182, 92]]];   // validated warm ramp: ember → copper → amber → gold
const GLINT = [247, 235, 203], ASH = [138, 127, 114];
function heat(v) { if (v <= RAMP[0][0]) return RAMP[0][1]; for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) return mixc(RAMP[i - 1][1], RAMP[i][1], (v - RAMP[i - 1][0]) / (RAMP[i][0] - RAMP[i - 1][0])); return RAMP[RAMP.length - 1][1]; }
// value, momentum (-1..1) and instability (0..1) → one colour
function tone(v, m = 0, u = 0) { let c = heat(v); c = m < 0 ? mixc(c, RAMP[0][1], -m * 0.35) : mixc(c, GLINT, m * 0.22); c = mixc(c, ASH, u * 0.5); return c; }
const FONT = { ui: '"Instrument Sans", system-ui, sans-serif', mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace', disp: '"Fraunces", Georgia, serif' };
function glowSprite(rgb, size = 64) { const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2); gr.addColorStop(0, rgba(rgb, 1)); gr.addColorStop(0.18, rgba(rgb, 0.55)); gr.addColorStop(0.5, rgba(rgb, 0.12)); gr.addColorStop(1, rgba(rgb, 0)); g.fillStyle = gr; g.fillRect(0, 0, size, size); return c; }
const SPR = { amber: glowSprite(INK.amber), ember: glowSprite(INK.ember), verd: glowSprite(INK.verd), ivory: glowSprite(INK.ivory), copper: glowSprite(INK.copper) };
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i; return lerp(hash1(i), hash1(i + 1), smooth(f)) * 2 - 1; };

// ---- view state: everything a scene needs to know about where it is looking. Tweened so every change flows.
function makeState(kind) {
  const rows = ROWSETS.rooms.length;
  return {
    kind, t0: new Tw(NOW_DAY - 7 * 52, 4.5), t1: new Tw(NOW_DAY + 7 * 6, 4.5), mode: new Tw(0, 3), rowsKind: 'rooms',
    rowA: Array.from({ length: 8 }, () => new Tw(1, 5)), spot: new Tw(0, 3), band: { a: new Tw(0, 5), b: new Tw(0, 5), s: new Tw(0, 3.5), label: '' },
    fc: new Tw(0.55, 3), plan: new Tw(0, 3), compare: new Tw(0, 3), links: [], marks: [], focusRoom: -1, hover: null, hoverRow: -1, callouts: [], ripples: [], pulse: new Tw(0, 8),
    groupA: new Tw(0, 4), clusterFocus: -1, zoomC: new Tw(0, 3.5), cEmph: Array.from({ length: 8 }, () => new Tw(1, 5)), cLinks: [], dtp: 0,
    deckCy: Math.floor(NOW_CARD / 39), deckT0: 0, deckSlide: new Tw(0, 6), segA: [new Tw(1, 5), new Tw(1, 5), new Tw(1, 5)], hoverCard: -1, hoverCy: -1,
  };
}
function stepState(st, dt) { for (const k of ['t0', 't1', 'mode', 'spot', 'fc', 'plan', 'compare', 'pulse', 'groupA', 'zoomC']) st[k].step(dt); st.deckSlide.step(dt); st.segA.forEach((t) => t.step(dt)); st.band.a.step(dt); st.band.b.step(dt); st.band.s.step(dt); st.rowA.forEach((t) => t.step(dt)); st.cEmph.forEach((t) => t.step(dt)); st.links.forEach((l) => l.p.step(dt)); st.cLinks.forEach((l) => l.p.step(dt)); st.callouts.forEach((c) => c.a.step(dt)); st.ripples = st.ripples.filter((r) => CLK.t - r.t0 < 3.2); }
const CLK = { t: 0, dt: 0.016 };
const levelOf = (st) => { const d = st.t1.v - st.t0.v; return d > 420 ? 'Life' : d > 190 ? 'Year' : d > 70 ? 'Season' : d > 24 ? 'Month' : d > 8 ? 'Week' : 'Day'; };

// ---- atmosphere: obsidian ground, copper horizon glow, drifting dust that moves slower the further away it sits
const DUST = Array.from({ length: 70 }, (_, i) => ({ x: hash1(i * 3.1), y: hash1(i * 7.7), z: 0.2 + hash1(i * 5.3) * 0.8, s: 0.4 + hash1(i * 2.9) * 1.4, ph: hash1(i * 9.1) * 6.28 }));
function drawAtmos(g, W, H, t, strength = 1) {
  g.fillStyle = INK.obsidian; g.fillRect(0, 0, W, H);
  let gr = g.createRadialGradient(W * 0.46, H * 1.05, 0, W * 0.46, H * 1.05, Math.max(W, H) * 0.85); gr.addColorStop(0, rgba(INK.copper, 0.13 * strength)); gr.addColorStop(0.45, rgba(INK.ember, 0.04 * strength)); gr.addColorStop(1, 'rgba(7,8,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W * 0.7, -H * 0.1, 0, W * 0.7, -H * 0.1, H * 0.9); gr.addColorStop(0, rgba(INK.verd, 0.045 * strength)); gr.addColorStop(1, 'rgba(7,8,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  for (const p of DUST) { const x = ((p.x + t * 0.004 * p.z + Math.sin(t * 0.07 + p.ph) * 0.01) % 1) * W, y = ((p.y - t * 0.0025 * p.z) % 1 + 1) % 1 * H, a = (0.05 + 0.09 * p.z) * (0.6 + 0.4 * Math.sin(t * 0.6 + p.ph)) * strength; g.globalAlpha = a; const s = p.s * (0.5 + p.z) * 7; g.drawImage(SPR.copper, x - s / 2, y - s / 2, s, s); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

// ---- time axis helpers
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function axisTicks(t0, t1) {
  const span = t1 - t0, out = [];
  if (span > 420) { for (let d = Math.floor(t0 / 30) * 30; d <= t1; d += 5) { const dt = dateAt(d); if (dt.getDate() <= 5 && dt.getMonth() % 3 === 0 && !out.some((o) => o.d > d - 40 && o.d <= d)) out.push({ d: dayIdx(new Date(dt.getFullYear(), dt.getMonth(), 1)), l: `${MON[dt.getMonth()]} ’${String(dt.getFullYear()).slice(2)}`, major: dt.getMonth() === 0 }); } }
  else if (span > 100) { for (let d = Math.floor(t0) - 31; d <= t1 + 31; d += 3) { const dt = dateAt(d), f = dayIdx(new Date(dt.getFullYear(), dt.getMonth(), 1)); if (!out.some((o) => o.d === f)) out.push({ d: f, l: dt.getMonth() === 0 ? `${MON[0]} ’${String(dt.getFullYear()).slice(2)}` : MON[dt.getMonth()], major: dt.getMonth() === 0 }); } }
  else if (span > 26) { for (let d = Math.floor(t0 / 7) * 7; d <= t1; d += 7) { const dt = dateAt(d); out.push({ d, l: `${MON[dt.getMonth()]} ${dt.getDate()}`, major: dt.getDate() <= 7 }); } }
  else { const step = span > 14 ? 2 : 1; for (let d = Math.floor(t0); d <= t1; d += step) { const dt = dateAt(d); out.push({ d, l: span > 9 ? `${dt.getDate()}` : `${WD[dt.getDay()]} ${dt.getDate()}`, major: dt.getDay() === 1 }); } }
  return out;
}
const seasonOfMonth = (m) => (m === 11 || m <= 1 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3);      // winter, spring, summer, autumn
const SEASON = [{ n: 'Winter', c: INK.steel }, { n: 'Spring', c: INK.verd }, { n: 'Summer', c: INK.amber }, { n: 'Autumn', c: INK.copper }];

// ---- the TERRAIN. rows are ridges; height = completion; hue = momentum; fragmentation = instability; thickness/opacity = how much evidence; particles flow with momentum.
const PARTS = Array.from({ length: 8 }, (_, r) => Array.from({ length: 34 }, (_, i) => ({ u: hash1(r * 91 + i * 13), sp: 0.5 + hash1(r * 17 + i * 3) * 1, jit: hash1(r * 5 + i * 41) })));
function terrainGeom(st, rect, rows) { // shared geometry so hit-testing and drawing agree
  const R = rows.length, sp = rect.h / (R + 1.5), A = sp * (R > 4 ? 2.5 : 2.3);
  return { R, sp, A, base: (i) => rect.y + rect.h - 14 - i * sp - (R > 4 ? 0 : sp * 0.15), xOf: (day) => rect.x + ((day - st.t0.v) / (st.t1.v - st.t0.v)) * rect.w, dayOf: (x) => st.t0.v + ((x - rect.x) / rect.w) * (st.t1.v - st.t0.v) };
}
const fh = (v) => { let x = clamp((v - 0.3) / 0.7, 0, 1.3); if (x > 0.8) x = 0.8 + (x - 0.8) * 0.35; return Math.pow(x, 1.2); };
function sampleRowAt(row, day, sigma) { return sampleRow(row, dayToCard(day), sigma); }
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
  // ---- cycle boundaries
  if (!mini) { g.setLineDash([2, 5]); g.lineWidth = 1; for (let cy = 0; cy <= WEEKS / CYC; cy++) { const d = cy * 91, x = geo.xOf(d); if (x < rect.x || x > rect.x + rect.w) continue; g.strokeStyle = rgba(INK.ivory, 0.07); g.beginPath(); g.moveTo(x, rect.y); g.lineTo(x, rect.y + rect.h); g.stroke(); if (span < 600 && rect.w > 500) { g.fillStyle = rgba(INK.muted, 0.8); g.font = `500 9px ${FONT.mono}`; g.textAlign = 'left'; if (Math.abs(x - geo.xOf(NOW_DAY)) > 90) g.fillText(`CYCLE ${cy + 1}`, x + 5, rect.y + 2); } } g.setLineDash([]); }
  // ---- ridges, back to front
  const pts = [];
  for (let ri = R - 1; ri >= 0; ri--) {
    const row = rows[ri], ra = (mini ? 1 : st.rowA[ri]?.v ?? 1), base = geo.base(ri), xs = new Float32Array(N), ys = new Float32Array(N), vs = new Float32Array(N), ms = new Float32Array(N), us = new Float32Array(N), ws = new Float32Array(N);
    for (let k = 0; k < N; k++) { const day = t0 + (span * k) / (N - 1), s = sampleRowAt(row, day, sigma); xs[k] = rect.x + (rect.w * k) / (N - 1); vs[k] = s.v; us[k] = s.u; ws[k] = clamp(s.w / 5, 0.25, 1); }
    const mh = Math.max(2, Math.round(N / 28));
    for (let k = 0; k < N; k++) { ms[k] = clamp((vs[Math.min(N - 1, k + mh)] - vs[Math.max(0, k - mh)]) * 5, -1, 1); const jit = us[k] > 0.28 ? noise1(xs[k] * 0.09 + CLK.t * 1.6 + ri * 7) * (us[k] - 0.2) * 7 : 0; ys[k] = base - A * fh(vs[k]) + jit; }
    pts[ri] = { xs, ys, vs, ms, us, base };
    // the fill occludes rows behind; its top edge carries a faint gradient so ridges read as solid ground
    const nowK = Math.min(N - 1, Math.max(0, Math.round(((NOW_DAY - t0) / span) * (N - 1)))), futureK = NOW_DAY > t0 && NOW_DAY < t1 ? nowK : N;
    g.beginPath(); g.moveTo(xs[0], base + 12); for (let k = 0; k < Math.min(N, futureK + 1); k++) g.lineTo(xs[k], ys[k]); g.lineTo(xs[Math.min(N - 1, futureK)], base + 12); g.closePath();
    const fillTop = Math.min(...ys.subarray(0, Math.max(1, Math.min(N, futureK)))), gr = g.createLinearGradient(0, fillTop, 0, base + 12), mood = tone(mean(Array.from(vs)), 0, 0);
    gr.addColorStop(0, `rgba(${mood[0] | 0},${mood[1] | 0},${mood[2] | 0},${0.2 * ra})`); gr.addColorStop(0.55, 'rgba(10,11,13,0.93)'); gr.addColorStop(1, 'rgba(7,8,10,0.98)'); g.fillStyle = gr; g.fill();
    if (!mini && ra > 0.3) { // topographic contours inside the ridge
      g.save(); g.clip(); g.lineWidth = 1; for (const f of [0.28, 0.5, 0.72]) { g.strokeStyle = rgba(INK.ivory, 0.045 * ra); g.beginPath(); const yy = base - A * f; g.moveTo(rect.x, yy); g.lineTo(rect.x + rect.w, yy); g.stroke(); } g.restore();
    }
    // the line itself, segment by segment: hue = health + momentum, dash = instability, weight = evidence
    g.lineCap = 'round';
    for (let k = 1; k < Math.min(N, futureK + 1); k++) {
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
