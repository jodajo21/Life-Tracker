// ================================================================ CARD ART: the printed card, drawn like a sheet from a drawing set
// One layout (cardOps) feeds two painters, jsPDF for the real PDF and SVG for the preview, so what you preview is what prints.
// Each two-day slot is a plate with its own construction drawing that builds up as the 13 weeks go by:
//   I Mon–Tue a golden-ratio spiral · II Wed–Thu an orrery of orbits · III Fri–Sat a phyllotaxis seed head.
// The slots alternate light paper and a dark blueprint (the middle of the week is the dark one). Hairline ink, a title block, a task schedule.
const CARDG = { W: 288, H: 432, L: 24, R: 264, rowsTop: 164, rowsBot: 346 };   // points, for a 4 × 6 in card
const PAPER_L = '#F6F0E1', INK_L = '#1C2764', PAPER_D = '#111A44', INK_D = '#EFE9D6';
const SLOTS = [
  { roman: 'I', name: 'BEGIN', motif: 'spiral', light: { wash: '#E4AE3C', accent: '#A9740F', tint: '#F3E2B0' }, dark: { wash: '#F2C25B', accent: '#F2C25B', tint: '#3A3F6B' },
    msgs: ['Begin where you are.', 'Draw the first line.', 'Set the datum, then build.', 'Small foundations hold the most.', 'Start small. Start now.', 'Measure twice, begin once.'] },
  { roman: 'II', name: 'BUILD', motif: 'orbits', light: { wash: '#3FA58F', accent: '#1F7C69', tint: '#CBE8DF' }, dark: { wash: '#59D2B4', accent: '#59D2B4', tint: '#22456A' },
    msgs: ['Hold the line.', 'Steady hands, steady home.', 'Check, adjust, continue.', 'Good work compounds.', 'Keep to the plan.', 'Midpoint. Stay the course.'] },
  { roman: 'III', name: 'COMPLETE', motif: 'seed', light: { wash: '#DE6A52', accent: '#B34530', tint: '#F4D2C8' }, dark: { wash: '#FF7B63', accent: '#FF7B63', tint: '#4A2F5C' },
    msgs: ['Close the sheet well.', 'Finish clean, then rest.', 'Mind the details, then release.', 'Sunday you will be proud.', 'Complete. Then breathe.', 'A tidy home is a quiet mind.'] },
];
const segOf = (c) => SLOTS[c.idx % 3];
const cardMsg = (c) => { const s = segOf(c); return s.msgs[Math.floor(c.idx / 3) % s.msgs.length]; };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const segVars = (s) => `--pb:${s.light.wash};--pd:${s.light.accent};--pt:${s.light.tint};--pbr:${hexRgb(s.light.wash).join(' ')};--pdr:${hexRgb(s.light.accent).join(' ')}`;
const cardStyle = () => store.get('cardstyle', 'alt');          // alt = light, dark, light · light = all light · plain = all light on white paper (saves ink)
const isDarkCard = (c, style = cardStyle()) => style === 'alt' && c.idx % 3 === 1;
function cardTheme(c, style = cardStyle()) {
  const S = segOf(c), dark = isDarkCard(c, style), paper = dark ? PAPER_D : style === 'plain' ? '#FFFFFF' : PAPER_L, ink = dark ? INK_D : INK_L, col = dark ? S.dark : S.light;
  return { dark, fillPaper: style !== 'plain', paper, ink, ink2: mixHex(ink, paper, 0.4), faint: mixHex(ink, paper, 0.72), ghost: mixHex(ink, paper, 0.86), wash: col.wash, accent: col.accent, tint: col.tint,
    washSoft: mixHex(col.wash, paper, dark ? 0.55 : 0.4), washPale: mixHex(col.wash, paper, dark ? 0.8 : 0.72), accentText: mixHex(col.accent, ink, dark ? 0 : 0.4) };
}

// ---- geometry helpers
const rad = (d) => (d * Math.PI) / 180;
function arcD(cx, cy, r, a0, a1) {                                   // an arc as bezier segments; angles in degrees, from +x toward +y
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90)), step = (a1 - a0) / n, kk = (4 / 3) * Math.tan(rad(step) / 4), d = [['M', cx + r * Math.cos(rad(a0)), cy + r * Math.sin(rad(a0))]]; let a = a0;
  for (let i = 0; i < n; i++) { const b = a + step, x0 = cx + r * Math.cos(rad(a)), y0 = cy + r * Math.sin(rad(a)), x3 = cx + r * Math.cos(rad(b)), y3 = cy + r * Math.sin(rad(b));
    d.push(['C', x0 - kk * r * Math.sin(rad(a)), y0 + kk * r * Math.cos(rad(a)), x3 + kk * r * Math.sin(rad(b)), y3 - kk * r * Math.cos(rad(b)), x3, y3]); a = b; }
  return d;
}
const ellipsePts = (cx, cy, rx, ry, rot, n = 72) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI, x = rx * Math.cos(a), y = ry * Math.sin(a); return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]; });
function arcsIn(cx, cy, r, box) {                                     // the parts of a circle that lie inside a box, as arc ranges in degrees
  const inside = (a) => { const x = cx + r * Math.cos(rad(a)), y = cy + r * Math.sin(rad(a)); return x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]; };
  const out = []; let st = null;
  for (let a = 0; a <= 360; a += 0.5) { const ok = a < 360 && inside(a); if (ok && st === null) st = a; if (!ok && st !== null) { if (a - st > 2) out.push([st, a - 0.5]); st = null; } }
  return out;
}
const FIB = new Set([1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144]);

// ---- layout: the schedule's rows share the space; a six-task card gets compact single-line rows
function rowLayout(n) { const area = CARDG.rowsBot - CARDG.rowsTop, rh = Math.min(44, area / Math.max(1, n)), y0 = CARDG.rowsTop + (area - rh * n) / 2; return { rh, y0, compact: rh < 33 }; }
function wrapText(text, maxW, size, weight, measure, ff) {
  const out = [], words = []; let line = '';
  for (let word of String(text).split(/\s+/).filter(Boolean)) {                      // a word wider than the line is cut into pieces
    while (measure(word, size, weight, ff) > maxW && word.length > 1) { let n = word.length - 1; while (n > 1 && measure(word.slice(0, n), size, weight, ff) > maxW) n--; words.push(word.slice(0, n)); word = word.slice(n); }
    words.push(word);
  }
  for (const word of words) { const t = line ? line + ' ' + word : word; if (measure(t, size, weight, ff) <= maxW || !line) line = t; else { out.push(line); line = word; } }
  if (line) out.push(line);
  return out;
}
function ellipsize(s, maxW, size, weight, measure, ff) { let t = s; while (t.length > 1 && measure(t + '...', size, weight, ff) > maxW) t = t.slice(0, -1); return t.trimEnd() + '...'; }

function cardOps(deck, c, measure, { preview = false, style = cardStyle(), part = 'all', sub = '' } = {}) {
  const G = CARDG, S = segOf(c), T = cardTheme(c, style), weeks = Math.ceil(deck.cards.length / 3), wk = Math.floor(c.idx / 3), prog = weeks > 1 ? wk / (weeks - 1) : 1;
  const bg = [], head = [], body = [], foot = [];
  const ln = (x1, y1, x2, y2, s, sw = 0.5, e = {}) => ({ o: 'line', x1, y1, x2, y2, s, sw, ...e });
  const ci = (x, y, r, e) => ({ o: 'circle', x, y, r, ...e }), re = (x, y, w, h, e) => ({ o: 'rect', x, y, w, h, ...e });
  const tx = (s, x, y, size, w, col, { a = 'left', cs = 0, ff = 'times' } = {}) => { let xx = x; if (a !== 'left') { const wd = measure(s, size, w, ff) + cs * s.length; xx = a === 'center' ? x - wd / 2 : x - wd; } return { o: 'text', t: s, x: xx, y, size, w, c: col, ff, ...(cs ? { cs } : {}) }; };
  const node = (x, y, r, col) => [ci(x, y, r, { s: col, sw: 0.5 }), ln(x - r - 2, y, x + r + 2, y, col, 0.4), ln(x, y - r - 2, x, y + r + 2, col, 0.4)];
  const dimH = (x1, x2, y, label, col) => [ln(x1, y, x2, y, col, 0.45), ln(x1 - 1.8, y + 1.8, x1 + 1.8, y - 1.8, col, 0.6), ln(x2 - 1.8, y + 1.8, x2 + 1.8, y - 1.8, col, 0.6), tx(label, (x1 + x2) / 2, y - 2.2, 5.8, 'italic', col, { a: 'center' })];

  // ---- paper, sheet frame, centering marks (a 3 pt keyline of bare paper is left round the edge so a slightly off cut never shows)
  if (T.fillPaper) bg.push(re(3, 3, G.W - 6, G.H - 6, { f: T.paper }));
  bg.push(re(12, 12, G.W - 24, G.H - 24, { s: T.ink2, sw: 0.6 }));
  [[G.W / 2, 7, G.W / 2, 17], [G.W / 2, G.H - 17, G.W / 2, G.H - 7], [7, G.H / 2, 17, G.H / 2], [G.W - 17, G.H / 2, G.W - 7, G.H / 2]].forEach(([a, b, c2, d]) => bg.push(ln(a, b, c2, d, T.ink2, 0.6)));
  [[0, 12], [276, 288]].forEach(([a, b]) => bg.push(ln(a, 54, b, 54, T.faint, 0.7)));                         // where the clamp area ends
  if (preview) bg.push(ln(12, 54, 276, 54, T.faint, 0.6, { dash: [3, 3] }), tx('CLAMP SPACE', G.W / 2, 34, 7, 'bold', T.ink2, { a: 'center', cs: 1.8 }));

  // ---- faint construction circles and axes run behind the whole header, as on a working drawing
  [58, 90, 128].forEach((r) => arcsIn(222, 101, r, [14, 14, 274, 152]).forEach(([a0, a1]) => head.push({ o: 'path', d: arcD(219, 101, r, a0, a1), s: T.ghost, sw: 0.5 })));
  head.push(ln(14, 101, 274, 101, T.ghost, 0.5), ln(222, 14, 222, 152, T.ghost, 0.5));

  // ---- title: plate label, the days (on a highlighter stripe), the week
  head.push(tx(`${S.roman}  /  ${S.name}`, G.L, 74, 7.2, 'bold', T.accentText, { cs: 1.6 }));
  const days = c.label.replace('–', ' · ').toUpperCase();
  head.push(re(G.L - 2, 94.5, measure(days, 21, 'normal', 'times') + 2 * days.length + 2, 10, { f: T.washSoft }));
  head.push(tx(days, G.L, 102, 21, 'normal', T.ink, { cs: 2 }));
  head.push(tx(sub || `Week ${wk + 1} of ${weeks}`, G.L, 118, 10, 'italic', T.ink2));
  head.push(...node(G.L + 1.5, 134, 2.2, T.ink2), ln(G.L + 7, 134, 120, 134, T.faint, 0.45));

  // ---- the plate: an abstract construction drawing that builds up through the cycle
  const wash = T.wash, ink2 = T.ink2, faint = T.faint;
  if (S.motif === 'spiral') {
    const x0 = 172, y0 = 68, w0 = 98, h0 = w0 / 1.6180339887, n = 4 + Math.round(4 * prog); let r = { x: x0, y: y0, w: w0, h: h0 }; const sq = [], arcs = [];
    for (let i = 0; i < n; i++) {
      const d = i % 4; let s, q, a;
      if (d === 0) { s = r.h; q = [r.x, r.y, s, s]; a = [r.x + s, r.y + s, s, 180, 270]; r = { x: r.x + s, y: r.y, w: r.w - s, h: r.h }; }
      else if (d === 1) { s = r.w; q = [r.x, r.y, s, s]; a = [r.x, r.y + s, s, 270, 360]; r = { x: r.x, y: r.y + s, w: r.w, h: r.h - s }; }
      else if (d === 2) { s = r.h; q = [r.x + r.w - s, r.y, s, s]; a = [r.x + r.w - s, r.y, s, 0, 90]; r = { x: r.x, y: r.y, w: r.w - s, h: r.h }; }
      else { s = r.w; q = [r.x, r.y + r.h - s, s, s]; a = [r.x + s, r.y + r.h - s, s, 90, 180]; r = { x: r.x, y: r.y, w: r.w, h: r.h - s }; }
      sq.push(q); arcs.push(a);
    }
    head.push(re(sq[2][0], sq[2][1], sq[2][2], sq[2][3], { f: T.washSoft }));
    sq.forEach((q) => head.push(re(q[0], q[1], q[2], q[3], { s: faint, sw: 0.45 })));
    head.push(ln(x0, y0, x0 + w0, y0 + h0, faint, 0.4, { dash: [2, 2] }), ln(x0, y0 + h0, x0 + w0, y0, faint, 0.4, { dash: [2, 2] }));
    head.push(re(x0, y0, w0, h0, { s: ink2, sw: 0.8 }));
    arcs.forEach((a) => head.push({ o: 'path', d: arcD(a[0], a[1], a[2], a[3], a[4]), s: T.accent, sw: 1.3 }));
    const last = sq[sq.length - 1]; head.push(ci(last[0] + last[2] / 2, last[1] + last[3] / 2, 1.8, { f: T.accent }));
    head.push(...dimH(x0, x0 + w0, 62, w0.toFixed(1), ink2), ln(x0, 62, x0, y0 - 1, faint, 0.4), ln(x0 + w0, 62, x0 + w0, y0 - 1, faint, 0.4));
    head.push(tx('1 : 1.618', x0 + w0, y0 + h0 + 10, 6, 'italic', ink2, { a: 'right' }), tx(`n = ${n}`, x0, y0 + h0 + 10, 6, 'italic', ink2));
  } else if (S.motif === 'orbits') {
    const cx = 222, cy = 101, R = 38, n = 3 + Math.round(1 * prog) + (prog > 0.6 ? 1 : 0), radii = Array.from({ length: Math.min(5, n) }, (_, i) => ((i + 1) / Math.min(5, n)) * R);
    head.push(ln(cx - R - 9, cy, cx + R + 9, cy, ink2, 0.45), ln(cx, cy - R - 9, cx, cy + R + 5, ink2, 0.45));
    for (let i = -4; i <= 4; i++) if (i) head.push(ln(cx + (i * R) / 4, cy - 1.6, cx + (i * R) / 4, cy + 1.6, ink2, 0.4), ln(cx - 1.6, cy + (i * R) / 4, cx + 1.6, cy + (i * R) / 4, ink2, 0.4));
    head.push({ o: 'poly', pts: ellipsePts(cx, cy, R * 1.0, R * 0.34, rad(-24)), s: faint, sw: 0.5, dash: [2, 2] });
    if (radii.length > 2) head.push(ci(cx, cy, radii[2], { f: T.washSoft }), ci(cx, cy, radii[1], { f: T.paper }));          // a wash between two orbits
    radii.forEach((rr, i) => head.push(ci(cx, cy, rr, { s: i === radii.length - 1 ? ink2 : faint, sw: i === radii.length - 1 ? 0.8 : 0.5 })));
    const ang = 15 + 7.5 * wk; head.push(ln(cx, cy, cx + (R + 5) * Math.cos(rad(-ang)), cy + (R + 5) * Math.sin(rad(-ang)), faint, 0.45), { o: 'path', d: arcD(cx, cy, 14, -ang, 0), s: T.accent, sw: 0.8 }, tx(`${ang.toFixed(1)}°`, cx - R, cy + R + 5, 6, 'italic', ink2));
    radii.forEach((rr, i) => { const a = rad(-70 + wk * 47 + i * 131); const px = cx + rr * Math.cos(a), py = cy + rr * Math.sin(a); head.push(ci(px, py, i === 1 ? 2.8 : 2.1, { f: i % 2 ? T.washSoft : wash, s: T.ink, sw: 0.5 })); if (i === 2) head.push(ci(px, py, 4.4, { s: ink2, sw: 0.4 })); });
    head.push(ci(cx, cy, 4.2, { f: wash, s: T.ink, sw: 0.6 }));
    head.push(...dimH(cx - R, cx + R, 62, `Ø ${(R * 2).toFixed(1)}`, ink2), ln(cx - R, 62, cx - R, cy - R + 2, faint, 0.4), ln(cx + R, 62, cx + R, cy - R + 2, faint, 0.4));
    head.push(tx(`${radii.length} orbits`, cx + R + 8, cy + R + 5, 6, 'italic', ink2, { a: 'right' }));
  } else {
    const cx = 222, cy = 101, R = 38, N = 40 + Math.round(134 * prog), ga = 137.50776405;
    head.push(ln(cx - R - 9, cy, cx + R + 9, cy, ink2, 0.45), ln(cx, cy - R - 9, cx, cy + R + 5, ink2, 0.45), ci(cx, cy, R + 2.5, { f: T.washPale, s: ink2, sw: 0.7 }), ci(cx, cy, R * 0.55, { s: faint, sw: 0.4, dash: [2, 2] }));
    for (let i = 1; i <= N; i++) { const rr = R * Math.sqrt(i / N), a = rad(i * ga), x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a), big = FIB.has(i); head.push(ci(x, y, big ? 1.9 : 0.55 + 1.15 * Math.sqrt(i / N), big ? { f: wash, s: T.ink, sw: 0.4 } : { f: T.ink2 })); }
    const a8 = 8 * ga, a9 = a8 + ga; head.push(ln(cx, cy, cx + (R + 5) * Math.cos(rad(a8)), cy + (R + 5) * Math.sin(rad(a8)), faint, 0.45), ln(cx, cy, cx + (R + 5) * Math.cos(rad(a9)), cy + (R + 5) * Math.sin(rad(a9)), faint, 0.45), { o: 'path', d: arcD(cx, cy, 13, a8, a9), s: T.accent, sw: 0.8 });
    head.push(tx('137.5°', cx - R - 2, cy + R + 5, 6, 'italic', ink2));
    head.push(...dimH(cx - R - 2.5, cx + R + 2.5, 62, `Ø ${(R * 2 + 5).toFixed(1)}`, ink2), ln(cx - R - 2.5, 62, cx - R - 2.5, cy - R, faint, 0.4), ln(cx + R + 2.5, 62, cx + R + 2.5, cy - R, faint, 0.4));
    head.push(tx(`${N} seeds`, cx + R + 8, cy + R + 5, 6, 'italic', ink2, { a: 'right' }));
  }

  // ---- the schedule: a tick box on a datum line, the task, the area
  body.push(tx('TASK', 58, 154, 6.2, 'bold', T.ink2, { cs: 1.6 }), tx('AREA', G.R, 154, 6.2, 'bold', T.ink2, { cs: 1.6, a: 'right' }), ln(G.L, 158, G.R, 158, T.ink2, 0.5));
  const n = c.items.length, { rh, y0, compact } = rowLayout(n), nx = 58, cap = compact ? 1 : 2;
  body.push(ln(36, 160, 36, G.rowsBot + 4, T.faint, 0.5));
  c.items.forEach((it, i) => {
    const cy = y0 + rh * (i + 0.5), room = it.room ? it.room.toUpperCase() : '', cs = 1.1, roomW = room ? measure(room, 6.6, 'normal', 'times') + room.length * cs : 0, maxW = G.R - nx - (room ? roomW + 16 : 0);
    if (i) body.push(ln(nx, y0 + rh * i, G.R, y0 + rh * i, T.ghost, 0.5));
    body.push(re(26, cy - 10, 20, 20, { f: T.paper, s: T.ink, sw: 1 }), ln(36, cy - 13.5, 36, cy - 10, T.ink, 0.5), ln(36, cy + 10, 36, cy + 13.5, T.ink, 0.5), ln(22.5, cy, 26, cy, T.ink, 0.5), ln(46, cy, 49.5, cy, T.ink, 0.5));
    let fs = compact ? 12.5 : 14.5, lines, lh;                                          // a long name steps the type down until the row fits
    for (const size of compact ? [12.5] : [14.5, 13.5, 12.5]) { fs = size; lh = fs * 1.16; lines = wrapText(it.name, maxW, fs, 'normal', measure, 'times'); if (lines.length <= cap && lines.length * lh <= rh - 6) break; }
    if (lines.length > cap) { lines = lines.slice(0, cap); lines[cap - 1] = ellipsize(lines[cap - 1], maxW, fs, 'normal', measure, 'times'); }
    const top = cy - (lines.length * lh) / 2;
    lines.forEach((l, j) => body.push(tx(l, nx, top + fs * 0.8 + j * lh, fs, 'normal', T.ink)));
    if (room) body.push(ci(G.R - roomW - 6, cy - 2.2, 1.7, { f: wash }), tx(room, G.R, cy + 0.2, 6.6, 'normal', T.ink2, { a: 'right', cs }));
  });

  // ---- title block: sheet, week, slot, a scale bar for the 13 weeks, and a note
  const bx = G.L, bw = G.R - G.L, by = 356;
  foot.push(re(bx, by, bw, 26, { f: T.washPale }), re(bx, by, bw, 58, { s: T.ink, sw: 0.8 }), ln(bx, by + 26, G.R, by + 26, T.ink, 0.5), ln(bx, by + 42, G.R, by + 42, T.ink, 0.5), ln(bx + bw / 3, by, bx + bw / 3, by + 26, T.ink2, 0.5), ln(bx + (2 * bw) / 3, by, bx + (2 * bw) / 3, by + 26, T.ink2, 0.5));
  [['SHEET', cardNo(deck, c)], ['WEEK', `${pad(wk + 1)} / ${pad(weeks)}`], ['PLATE', `${S.roman} · ${S.name}`]].forEach(([k, v], i) => foot.push(tx(k, bx + 5 + (i * bw) / 3, by + 8.5, 5.6, 'bold', T.ink2, { cs: 1.5 }), tx(v, bx + 5 + (i * bw) / 3, by + 21, i === 2 ? 9 : 11, 'normal', T.ink)));
  const sx = bx + 40, sw2 = G.R - 5 - sx, seg = sw2 / weeks;
  foot.push(tx('SCALE', bx + 5, by + 37.5, 5.6, 'bold', T.ink2, { cs: 1.5 }));
  for (let i = 0; i < weeks; i++) foot.push(re(sx + i * seg, by + 30, seg, 8, i < wk ? { f: T.washSoft, s: T.ink, sw: 0.5 } : i === wk ? { f: wash, s: T.ink, sw: 0.8 } : { s: T.ink2, sw: 0.5 }));
  foot.push(tx(cardMsg(c), G.W / 2, by + 53, 8.8, 'italic', T.ink, { a: 'center' }));

  const out = part === 'head' ? head : part === 'foot' ? foot : [...bg, ...head, ...body, ...foot];
  return out;
}

// ---- painter 1: the PDF. (ox, oy) is the card's corner on the page, k scales 4 × 6 up to 5.25 × 7.875 in.
function paintPdf(doc, ops, ox, oy, k) {
  const X = (v) => ox + v * k, Y = (v) => oy + v * k, rgb = hexRgb;
  for (const p of ops) {
    if (p.f) doc.setFillColor(...rgb(p.f)); if (p.s) { doc.setDrawColor(...rgb(p.s)); doc.setLineWidth((p.sw || 1) * k); }
    const style = p.f && p.s ? 'FD' : p.f ? 'F' : 'S';
    if (p.dash) doc.setLineDashPattern(p.dash.map((v) => v * k), 0); if (p.cap) doc.setLineCap(p.cap); if (p.s) doc.setLineJoin('round');
    if (p.o === 'rect') p.r ? doc.roundedRect(X(p.x), Y(p.y), p.w * k, p.h * k, p.r * k, p.r * k, style) : doc.rect(X(p.x), Y(p.y), p.w * k, p.h * k, style);
    else if (p.o === 'circle') doc.circle(X(p.x), Y(p.y), p.r * k, style);
    else if (p.o === 'line') doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
    else if (p.o === 'poly') { const d = p.pts.map(([x, y], i) => (i ? [(x - p.pts[i - 1][0]) * k, (y - p.pts[i - 1][1]) * k] : null)).filter(Boolean); doc.lines(d, X(p.pts[0][0]), Y(p.pts[0][1]), [1, 1], style, true); }
    else if (p.o === 'path') {
      let cx = 0, cy = 0; const segs = []; let closed = false;
      for (const s of p.d) { if (s[0] === 'M') { cx = s[1]; cy = s[2]; } else if (s[0] === 'L') { segs.push([(s[1] - cx) * k, (s[2] - cy) * k]); cx = s[1]; cy = s[2]; } else if (s[0] === 'C') { segs.push([(s[1] - cx) * k, (s[2] - cy) * k, (s[3] - cx) * k, (s[4] - cy) * k, (s[5] - cx) * k, (s[6] - cy) * k]); cx = s[5]; cy = s[6]; } else closed = true; }
      doc.lines(segs, X(p.d[0][1]), Y(p.d[0][2]), [1, 1], style, closed);
    } else if (p.o === 'text') {
      doc.setFont(p.ff || 'times', p.w).setFontSize(p.size * k); doc.setTextColor(...rgb(p.c)); doc.text(p.t, X(p.x), Y(p.y), p.cs ? { charSpace: p.cs * k } : undefined);
    }
    if (p.dash) doc.setLineDashPattern([], 0); if (p.cap) doc.setLineCap('butt');
  }
}
const pdfMeasure = (doc) => (s, size, w, ff = 'times') => { doc.setFont(ff, w).setFontSize(size); return doc.getTextWidth(s); };

// ---- painter 2: SVG for the preview and the on-screen card (same numbers, so it lines up with the PDF)
let _mctx = null;
const FONTS = { times: "'Times New Roman', Times, 'Liberation Serif', serif", helvetica: 'Helvetica, Arial, sans-serif' };
const svgMeasure = (s, size, w, ff = 'times') => { _mctx ||= document.createElement('canvas').getContext('2d'); _mctx.font = `${w === 'italic' ? 'italic' : w === 'bold' ? 'bold' : 'normal'} ${size}px ${FONTS[ff]}`; return _mctx.measureText(s).width; };
function paintSvg(ops, vb = [0, 0, CARDG.W, CARDG.H]) {
  const f = (v) => +v.toFixed(2), col = (c) => c || 'none';
  const body = ops.map((p) => {
    const paint = `fill="${col(p.f)}" stroke="${col(p.s)}"${p.s ? ` stroke-width="${f(p.sw || 1)}" stroke-linejoin="round"` : ''}${p.cap ? ` stroke-linecap="${p.cap}"` : ''}${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}`;
    if (p.o === 'rect') return `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"${p.r ? ` rx="${p.r}"` : ''} ${paint}/>`;
    if (p.o === 'circle') return `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" ${paint}/>`;
    if (p.o === 'line') return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" ${paint}/>`;
    if (p.o === 'poly') return `<polygon points="${p.pts.map(([x, y]) => f(x) + ',' + f(y)).join(' ')}" ${paint}/>`;
    if (p.o === 'path') return `<path d="${p.d.map((s) => (s[0] === 'Z' ? 'Z' : s[0] + s.slice(1).map(f).join(' '))).join(' ')}" ${paint}/>`;
    return `<text x="${f(p.x)}" y="${f(p.y)}"${p.cs ? ` letter-spacing="${p.cs}"` : ''} style="fill:${p.c};font:${p.w === 'italic' ? 'italic 400' : p.w === 'bold' ? '700' : '400'} ${p.size}px ${FONTS[p.ff || 'times']}">${esc(p.t)}</text>`;
  }).join('');
  return `<svg viewBox="${vb.join(' ')}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}
const cardSvg = (deck, c, style = cardStyle()) => paintSvg(cardOps(deck, c, svgMeasure, { preview: true, style }));
const cardPartSvg = (deck, c, part, sub = '') => paintSvg(cardOps(deck, c, svgMeasure, { part, sub }), part === 'head' ? [0, 56, CARDG.W, 92] : [0, 352, CARDG.W, 66]);
