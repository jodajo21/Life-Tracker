// ================================================================ CARD ART: how the printed card looks
// One layout (cardOps) feeds two painters: jsPDF for the real PDF and SVG for the print preview, so what you preview is what prints.
// Each two-day slot has its own colour and a small drawing: Mon–Tue a sun, Wed–Thu a sprout, Fri–Sat a star. Text stays dark navy on soft colour, so it prints clearly on any printer.
const CARD_INK = '#232946';
const CARDG = { W: 288, H: 432, L: 24, R: 264, band: 116, rowsTop: 136, rowsBot: 354 };   // points, for a 4 × 6 in card
const SEGS = [
  { name: 'Fresh start', band: '#FFD166', deep: '#F29F05', tint: '#FFF1C7', motif: 'sun',
    msgs: ['Fresh week, fresh start.', 'You\'ve got this.', 'Start small. Start now.', 'Momentum begins today.', 'One thing at a time.', 'Tiny wins add up.'] },
  { name: 'Midweek groove', band: '#6FD6C6', deep: '#16A08E', tint: '#D9F6F0', motif: 'sprout',
    msgs: ['Right in the groove.', 'Look at you go.', 'Steady wins the week.', 'Future you says thanks.', 'Making it look easy.', 'Keep that good rhythm.'] },
  { name: 'Finish strong', band: '#FF93A8', deep: '#E0476A', tint: '#FFE1E8', motif: 'star',
    msgs: ['Finish strong, then rest.', 'Almost the weekend!', 'Sunday you will be proud.', 'Last push. You\'ve got this.', 'Tidy home, happy heart.', 'Done feels so good.'] },
];
const segOf = (c) => SEGS[c.idx % 3];
const cardMsg = (c) => { const s = segOf(c); return s.msgs[Math.floor(c.idx / 3) % s.msgs.length]; };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const segVars = (s) => `--pb:${s.band};--pd:${s.deep};--pt:${s.tint};--pbr:${hexRgb(s.band).join(' ')};--pdr:${hexRgb(s.deep).join(' ')}`;

// ---- the drawings, in a 100 × 100 box. Colour names are resolved per slot.
const star5 = (cx, cy, ro, ri, rot) => Array.from({ length: 10 }, (_, i) => { const a = rot + (i * Math.PI) / 5, r = i % 2 ? ri : ro; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const MOTIFS = {
  sun: [
    ...Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4, c = Math.cos(a), s = Math.sin(a); return { t: 'line', p: [50 + c * 35, 50 + s * 35, 50 + c * 46, 50 + s * 46], w: 6, c: 'deep' }; }),
    { t: 'circle', p: [50, 50, 25], c: 'deep' },
    { t: 'circle', p: [41, 45, 2.9], c: 'ink' }, { t: 'circle', p: [59, 45, 2.9], c: 'ink' },
    { t: 'path', d: [['M', 38.5, 55], ['C', 43, 67, 57, 67, 61.5, 55]], s: 'ink', w: 3.6 },
  ],
  sprout: [
    { t: 'path', d: [['M', 50, 90], ['C', 50, 74, 50, 62, 50, 44]], s: 'deep', w: 5.5 },
    { t: 'path', d: [['M', 50, 62], ['C', 33, 63, 21, 53, 20, 33], ['C', 38, 32, 50, 44, 50, 62], ['Z']], c: 'deep' },
    { t: 'path', d: [['M', 50, 50], ['C', 66, 51, 79, 42, 81, 22], ['C', 63, 21, 50, 33, 50, 50], ['Z']], c: 'white' },
    { t: 'path', d: [['M', 24, 91], ['C', 36, 83, 64, 83, 76, 91]], s: 'deep', w: 4.5 },
  ],
  star: [
    { t: 'poly', p: star5(50, 52, 37, 16, -Math.PI / 2 - 0.18), c: 'deep', s: 'deep', w: 5 },
    { t: 'circle', p: [13, 24, 4.2], c: 'white' }, { t: 'circle', p: [87, 72, 3.8], c: 'white' }, { t: 'circle', p: [83, 16, 3.2], c: 'ink' },
    { t: 'line', p: [12, 74, 21, 83], w: 4.2, c: 'white' }, { t: 'line', p: [87, 38, 94, 31], w: 4.2, c: 'deep' },
  ],
};
function motifOps(ops, seg, x0, y0, size) {
  const u = size / 100, col = (k) => ({ deep: seg.deep, ink: CARD_INK, white: '#ffffff', band: seg.band, tint: seg.tint }[k] || k), X = (v) => x0 + v * u, Y = (v) => y0 + v * u;
  for (const m of MOTIFS[seg.motif]) {
    if (m.t === 'circle') ops.push({ o: 'circle', x: X(m.p[0]), y: Y(m.p[1]), r: m.p[2] * u, f: col(m.c) });
    else if (m.t === 'line') ops.push({ o: 'line', x1: X(m.p[0]), y1: Y(m.p[1]), x2: X(m.p[2]), y2: Y(m.p[3]), s: col(m.c), sw: m.w * u, cap: 'round' });
    else if (m.t === 'poly') ops.push({ o: 'poly', pts: m.p.map(([a, b]) => [X(a), Y(b)]), f: col(m.c), s: m.s && col(m.s), sw: (m.w || 0) * u });
    else ops.push({ o: 'path', d: m.d.map((s) => (s[0] === 'Z' ? s : [s[0], ...s.slice(1).map((v, i) => (i % 2 ? Y(v) : X(v)))])), f: m.c && col(m.c), s: m.s && col(m.s), sw: (m.w || 0) * u });
  }
}

// ---- layout: rows share the space between the header and the footer; a six-task card gets compact rows
function rowLayout(n) { const area = CARDG.rowsBot - CARDG.rowsTop, rh = Math.min(60, area / Math.max(1, n)), y0 = CARDG.rowsTop + (area - rh * n) / 2; return { rh, y0, compact: rh < 38 }; }
function wrapText(text, maxW, size, weight, measure) {
  const out = []; let line = '';
  const words = [];
  for (let word of String(text).split(/\s+/).filter(Boolean)) {                     // a word wider than the line is cut into pieces
    while (measure(word, size, weight) > maxW && word.length > 1) { let n = word.length - 1; while (n > 1 && measure(word.slice(0, n), size, weight) > maxW) n--; words.push(word.slice(0, n)); word = word.slice(n); }
    words.push(word);
  }
  for (const word of words) {
    const t = line ? line + ' ' + word : word;
    if (measure(t, size, weight) <= maxW || !line) line = t; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}
function ellipsize(s, maxW, size, weight, measure) { let t = s; while (t.length > 1 && measure(t + '...', size, weight) > maxW) t = t.slice(0, -1); return t.trimEnd() + '...'; }

function cardOps(deck, c, measure, { preview = false } = {}) {
  const G = CARDG, S = segOf(c), NAVY = CARD_INK, ops = [], weeks = Math.ceil(deck.cards.length / 3), wk = Math.floor(c.idx / 3), soft = (h, t) => mixHex(h, '#ffffff', t);
  const txt = (t, x, y, size, w, c2, extra = {}) => ({ o: 'text', t, x, y, size, w, c: c2, ...extra });
  // header band: square at the top edge, soft at the bottom. The top 54 pt is only colour, left clear for a clamp.
  ops.push({ o: 'rect', x: 0, y: 0, w: G.W, h: G.band - 18, f: S.band }, { o: 'rect', x: 0, y: G.band - 40, w: G.W, h: 40, r: 18, f: S.band });
  [[30, 21, 11], [64, 35, 5], [255, 25, 17]].forEach(([x, y, r]) => ops.push({ o: 'circle', x, y, r, f: soft(S.band, 0.0) === S.band ? mixHex(S.band, '#ffffff', 0.38) : mixHex(S.band, '#ffffff', 0.38) }));   // soft decoration up in the clamp zone
  [[0, 10], [278, 288]].forEach(([a, b]) => ops.push({ o: 'line', x1: a, y1: 54, x2: b, y2: 54, s: mixHex(S.band, NAVY, 0.35), sw: 1 }));
  if (preview) ops.push({ o: 'line', x1: 0, y1: 54, x2: G.W, y2: 54, s: mixHex(S.band, NAVY, 0.3), sw: 0.8, dash: [3, 3] }, txt('CLAMP SPACE', G.W / 2, 31, 8, 'bold', mixHex(S.band, NAVY, 0.5), { a: 'center', cs: 1.8 }));
  ops.push(txt(c.label.replace('–', ' · ').toUpperCase(), G.L, 88, 27, 'bold', NAVY, { cs: 0.6 }));
  ops.push(txt(`Week ${wk + 1} of ${weeks}`, G.L, 106, 11, 'normal', mixHex(NAVY, S.band, 0.2)));
  motifOps(ops, S, 206, 58, 52);
  // tasks
  const n = c.items.length, { rh, y0, compact } = rowLayout(n), nx = 58, maxW = G.R - nx - (compact ? 0 : 4), cap = compact ? 1 : 2;
  c.items.forEach((it, i) => {
    const cy = y0 + rh * (i + 0.5), room = it.room ? it.room.toUpperCase() : '', cs = 0.7, chipW = room ? measure(room, 7.2, 'bold') + room.length * cs + 11 : 0;
    ops.push({ o: 'rect', x: G.L, y: cy - 12, w: 24, h: 24, r: 7, f: S.tint, s: NAVY, sw: 1.7 });
    let fs = compact ? 12.5 : 14.5, lines, lh;                                          // a long name steps the type down until the row fits
    for (const size of compact ? [12.5] : [14.5, 13.5, 12.5]) { fs = size; lh = fs * 1.18; lines = wrapText(it.name, maxW, fs, 'bold', measure); if (lines.length <= cap && lines.length * lh + (room ? 17 : 0) <= rh - 6) break; }
    if (lines.length > cap) { lines = lines.slice(0, cap); lines[cap - 1] = ellipsize(lines[cap - 1], maxW, fs, 'bold', measure); }
    const block = lines.length * lh + (room && !compact ? 17 : 0), top = cy - block / 2;
    lines.forEach((ln, j) => ops.push(txt(ln, nx, top + fs * 0.84 + j * lh, fs, 'bold', NAVY)));
    if (room && (!compact || measure(lines[0], fs, 'bold') + chipW + 8 < maxW)) {
      const cx = compact ? G.R - chipW : nx, cyy = compact ? cy - 6 : top + lines.length * lh + 5;
      ops.push({ o: 'rect', x: cx, y: cyy, w: chipW, h: 12, r: 6, f: S.tint }, txt(room, cx + 5.5, cyy + 8.6, 7.2, 'bold', mixHex(NAVY, '#ffffff', 0.25), { cs }));
    }
    if (i) ops.push({ o: 'line', x1: nx, y1: y0 + rh * i, x2: G.R, y2: y0 + rh * i, s: soft(S.deep, 0.4), sw: 1.6, dash: [0.1, 4.2], cap: 'round' });
  });
  // footer: a friendly line, where this card sits in the 13 weeks, and its number
  ops.push({ o: 'rect', x: G.L, y: 362, w: G.R - G.L, h: 26, r: 13, f: S.tint }, txt(cardMsg(c), G.W / 2, 378.8, 10.5, 'italic', NAVY, { a: 'center' }));
  for (let i = 0; i < weeks; i++) {
    const x = G.L + 4 + i * 14.2, y = 408;
    if (i < wk) ops.push({ o: 'circle', x, y, r: 3.2, f: soft(S.deep, 0.45) });
    else if (i === wk) ops.push({ o: 'circle', x, y, r: 4, f: S.deep }, { o: 'circle', x, y, r: 6.4, s: S.deep, sw: 1 });
    else ops.push({ o: 'circle', x, y, r: 3, s: soft(S.deep, 0.3), sw: 1.1 });
  }
  const no = cardNo(deck, c), nw = measure(no, 10.5, 'bold') + 16;
  ops.push({ o: 'rect', x: G.R - nw, y: 398, w: nw, h: 20, r: 10, f: S.tint }, txt(no, G.R - nw / 2, 411.6, 10.5, 'bold', NAVY, { a: 'center' }));
  return ops;
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
      let cx = 0, cy = 0, sx = 0, sy = 0; const segs = []; let closed = false;
      for (const s of p.d) { if (s[0] === 'M') { cx = sx = s[1]; cy = sy = s[2]; } else if (s[0] === 'C') { segs.push([(s[1] - cx) * k, (s[2] - cy) * k, (s[3] - cx) * k, (s[4] - cy) * k, (s[5] - cx) * k, (s[6] - cy) * k]); cx = s[5]; cy = s[6]; } else closed = true; }
      doc.lines(segs, X(p.d[0][1]), Y(p.d[0][2]), [1, 1], style, closed);
    } else if (p.o === 'text') {
      doc.setFont('helvetica', p.w).setFontSize(p.size * k); doc.setTextColor(...rgb(p.c)); doc.text(p.t, X(p.x), Y(p.y), { align: p.a || 'left', ...(p.cs ? { charSpace: p.cs * k } : {}) });
    }
    if (p.dash) doc.setLineDashPattern([], 0); if (p.cap) doc.setLineCap('butt');
  }
}
const pdfMeasure = (doc) => (s, size, w) => { doc.setFont('helvetica', w).setFontSize(size); return doc.getTextWidth(s); };

// ---- painter 2: SVG for the preview (same numbers, so it lines up with the PDF)
let _mctx = null;
const svgMeasure = (s, size, w) => { _mctx ||= document.createElement('canvas').getContext('2d'); _mctx.font = `${w === 'italic' ? 'italic' : w} ${size}px Helvetica, Arial, sans-serif`; return _mctx.measureText(s).width; };
function paintSvg(ops, vb = [CARDG.W, CARDG.H]) {
  const f = (v) => +v.toFixed(2), col = (c) => c || 'none';
  const body = ops.map((p) => {
    const paint = `fill="${col(p.f)}" stroke="${col(p.s)}"${p.s ? ` stroke-width="${f(p.sw || 1)}" stroke-linejoin="round"` : ''}${p.cap ? ` stroke-linecap="${p.cap}"` : ''}${p.dash ? ` stroke-dasharray="${p.dash.join(' ')}"` : ''}`;
    if (p.o === 'rect') return `<rect x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"${p.r ? ` rx="${p.r}"` : ''} ${paint}/>`;
    if (p.o === 'circle') return `<circle cx="${f(p.x)}" cy="${f(p.y)}" r="${f(p.r)}" ${paint}/>`;
    if (p.o === 'line') return `<line x1="${f(p.x1)}" y1="${f(p.y1)}" x2="${f(p.x2)}" y2="${f(p.y2)}" ${paint}/>`;
    if (p.o === 'poly') return `<polygon points="${p.pts.map(([x, y]) => f(x) + ',' + f(y)).join(' ')}" ${paint}/>`;
    if (p.o === 'path') return `<path d="${p.d.map((s) => (s[0] === 'Z' ? 'Z' : s[0] + s.slice(1).map(f).join(' '))).join(' ')}" ${paint}/>`;
    return `<text x="${f(p.x)}" y="${f(p.y)}" text-anchor="${p.a === 'center' ? 'middle' : 'start'}"${p.cs ? ` letter-spacing="${p.cs}"` : ''} style="fill:${p.c};font:${p.w === 'italic' ? 'italic 400' : p.w === 'bold' ? '700' : '400'} ${p.size}px Helvetica, Arial, sans-serif">${esc(p.t)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${vb[0]} ${vb[1]}" xmlns="http://www.w3.org/2000/svg" font-family="Helvetica, Arial, sans-serif" aria-hidden="true">${body}</svg>`;
}
const cardSvg = (deck, c) => paintSvg(cardOps(deck, c, svgMeasure, { preview: true }));
const motifSvg = (seg) => { const ops = []; motifOps(ops, seg, 0, 0, 100); return paintSvg(ops, [100, 100]); };
