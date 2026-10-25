// ================================================================ DECK: the cycle as a wall of cards. Columns = weeks, rows = the three two-day cards.
// each pip is one task on one card. lit = done, hollow = missed, pulsing = open now, faint = still to come.
const CY_N = WEEKS / CYC, CUR_CY = Math.floor(NOW_CARD / 39), segRate = (cy, seg) => { let p = 0, d = 0; for (let i = 0; i < 39; i++) { const c = CARDS[cy * 39 + i]; if (c.seg !== seg || !c.finished) continue; p += c.planned; d += c.done; } return p ? d / p : null; };
const cardRate = (c) => (c.finished && c.planned ? c.done / c.planned : null);
const cycRate = (cy) => { let p = 0, d = 0; for (let i = 0; i < 39; i++) { const c = CARDS[cy * 39 + i]; if (c.finished) { p += c.planned; d += c.done; } } return p ? d / p : null; };
const cardLabel = (c) => `${String((c.c % 39) + 1).padStart(2, '0')} / 39`;
function deckGeom(rect) { const sm = rect.w < 520, head = sm ? 30 : 40, hist = sm ? 34 : 86, gx = rect.x, gw = rect.w, gy = rect.y + head, gh = rect.h - head - hist - 8; return { head, hist, gx, gw, gy, gh, cw: gw / 13, ch: gh / 3, hy: rect.y + rect.h - hist + 6 }; }
function drawDeck(g, st, rect, o = {}) {
  const alpha = o.alpha ?? 1, G = deckGeom(rect), cy = st.deckCy, small = rect.w < 520, t = CLK.t, rv = t - st.deckT0, slide = st.deckSlide.v;
  g.save(); g.globalAlpha = alpha; st._dk = { G, cells: [], hist: [], pips: {} };
  const dayOfCard = (c) => cardDay(c), cyc0 = cy * 39;
  // ---- the "now" column: a faint beam through the week we are in
  const nowW = Math.floor((NOW_CARD - cyc0) / 3), inCur = cy === CUR_CY;
  if (inCur && nowW >= 0 && nowW < 13) { const x = G.gx + nowW * G.cw, bg = g.createLinearGradient(0, G.gy - 8, 0, G.gy + G.gh); bg.addColorStop(0, rgba(INK.amber, 0.12)); bg.addColorStop(1, rgba(INK.amber, 0.0)); g.fillStyle = bg; g.fillRect(x + 1, G.gy - 8, G.cw - 2, G.gh + 8); }
  // ---- week header: number, date, holiday landmark, planning mark
  for (let w = 0; w < 13; w++) {
    const x = G.gx + w * G.cw + G.cw / 2 + slide * 30, wk = cy * 13 + w, d0 = wk * 7, dt = dateAt(d0), isNow = inCur && w === nowW;
    txt(g, `W${w + 1}`, x, G.gy - 24, { align: 'center', color: rgba(isNow ? INK.amber : INK.muted, 1), font: `600 ${small ? 8 : 9.5}px ${FONT.mono}`, ls: '1px' });
    if (!small) txt(g, `${MON[dt.getMonth()]} ${dt.getDate()}`, x, G.gy - 12, { align: 'center', color: rgba(isNow ? INK.ivory : INK.dim, 0.8), font: `500 9px ${FONT.mono}` });
    const hol = HOLIDAYS.find((h) => h.day >= d0 && h.day < d0 + 7 && h.rank >= 1);
    if (hol) { g.fillStyle = rgba(INK.ivory, 0.85); g.beginPath(); g.moveTo(x - 20, G.gy - 8); g.lineTo(x - 16.5, G.gy - 4.5); g.lineTo(x - 20, G.gy - 1); g.lineTo(x - 23.5, G.gy - 4.5); g.closePath(); g.fill(); if (!small && G.cw > 56) txt(g, hol.name.length > 9 ? hol.name.slice(0, 8) + '…' : hol.name, x - 13, G.gy - 1.5, { color: rgba(INK.ivory, 0.6), font: `500 8px ${FONT.mono}` }); }
    if (st.plan.v > 0.02 && !small) { const on = PLANNED[wk]; g.strokeStyle = rgba(INK.verd, 0.95 * st.plan.v); g.fillStyle = on ? rgba(INK.verd, 0.95 * st.plan.v) : 'rgba(0,0,0,0)'; g.lineWidth = 1; g.beginPath(); g.arc(x + 20, G.gy - 5.5, 3, 0, 6.283); on ? g.fill() : g.stroke(); }
  }
  // ---- rows: the three cards of a week, with this cycle's rate against the one before
  for (let s = 0; s < 3; s++) {
    const y = G.gy + s * G.ch, sa = st.segA[s].v, r = segRate(cy, s), rp = cy > 0 ? segRate(cy - 1, s) : null, dlt = r != null && rp != null ? r - rp : 0;
    if (small) { txt(g, ['MON', 'WED', 'FRI'][s], rect.x - 5, y + G.ch / 2 - 3, { align: 'right', color: rgba(INK.ivory, 0.4 + 0.5 * sa), font: `600 7px ${FONT.ui}`, ls: '0.6px' }); if (r != null) txt(g, `${Math.round(r * 100)}`, rect.x - 5, y + G.ch / 2 + 8, { align: 'right', color: rgba(tone(r, clamp(dlt * 6, -1, 1), 0), 0.95), font: `500 9px ${FONT.mono}` }); continue; }
    txt(g, SEGS[s].toUpperCase(), rect.x - 14, y + G.ch / 2 - 8, { align: 'right', color: rgba(INK.ivory, 0.45 + 0.5 * sa), font: `600 10px ${FONT.ui}`, ls: '1.4px' });
    if (r != null) { txt(g, `${Math.round(r * 100)}`, rect.x - 40, y + G.ch / 2 + 8, { align: 'right', color: rgba(tone(r, clamp(dlt * 6, -1, 1), 0), 0.95 * (0.4 + 0.6 * sa)), font: `500 12px ${FONT.mono}` }); txt(g, dlt > 0.03 ? '▲' : dlt < -0.03 ? '▼' : '–', rect.x - 14, y + G.ch / 2 + 8, { align: 'right', color: rgba(tone(r, clamp(dlt * 6, -1, 1), 0), 0.8 * sa), font: `500 8px ${FONT.mono}` }); }
  }
  // ---- cards
  for (let i = 0; i < 39; i++) {
    const c = CARDS[cyc0 + i], w = Math.floor(i / 3), s = i % 3, x = G.gx + w * G.cw + 2 + slide * 30, y = G.gy + s * G.ch + 2, cw = G.cw - 4, chh = G.ch - 4, sa = st.segA[s].v;
    const delay = w * 0.045 + s * 0.04, rp = clamp((rv - delay) / 0.5, 0, 1), rate = cardRate(c), isNow = c.c === NOW_CARD, fut = c.c > NOW_CARD, hov = st.hoverCard === c.c;
    st._dk.cells.push({ c: c.c, x, y, w: cw, h: chh });
    g.save(); g.globalAlpha = alpha * (0.35 + 0.65 * sa) * (0.2 + 0.8 * rp);
    // paper: the physical card, with its hang notch
    g.fillStyle = hov ? 'rgba(239,230,212,0.07)' : 'rgba(239,230,212,0.028)'; g.strokeStyle = rgba(INK.ivory, hov ? 0.5 : isNow ? 0.34 : 0.1); g.lineWidth = hov || isNow ? 1.2 : 1; g.beginPath(); g.roundRect(x, y, cw, chh, 3); g.fill(); g.stroke();
    g.fillStyle = rgba(INK.obsidian, 1); g.strokeStyle = rgba(INK.ivory, 0.16); g.beginPath(); g.arc(x + cw / 2, y + 7, 2.6, 0, 6.283); g.fill(); g.stroke();
    if (!small) txt(g, String(i + 1).padStart(2, '0'), x + 5, y + 12, { color: rgba(INK.muted, 0.9), font: `500 8.5px ${FONT.mono}` });
    // sealed: every task on the card done
    if (c.finished && c.done === c.planned) { const gl = g.createLinearGradient(x, 0, x + cw, 0); gl.addColorStop(0, rgba(INK.amber, 0)); gl.addColorStop(0.5, rgba(GLINT, 0.95)); gl.addColorStop(1, rgba(INK.amber, 0)); g.fillStyle = gl; g.fillRect(x + 4, y + chh - 3, cw - 8, 1.6); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= 0.5; g.drawImage(SPR.amber, x + cw / 2 - 26, y + chh - 18, 52, 30); g.globalCompositeOperation = 'source-over'; }
    // pips
    const n = c.tasks.length, top = y + (small ? 15 : 20), bot = y + chh - (small ? 8 : 20), pa = (bot - top) / 5, ph = Math.min(small ? 8 : 17, pa - (small ? 2.5 : 4));
    c.tasks.forEach((tk, k) => {
      const py = top + k * pa + (pa - ph) / 2, px = x + (small ? 3 : 6), pw = cw - (small ? 6 : 12), ri = tk.t.ri, em = st.cEmph[ri].v, ea = clamp((em - 0.2) / 0.8, 0.12, 1), litT = rp > 0 ? clamp((rv - delay - k * 0.05 - 0.1) / 0.28, 0, 1) : 0, hot = st.hoverTask === tk.t.id;
      st._dk.pips[c.c * 8 + k] = { x: px, y: py, w: pw, h: ph, ri, id: tk.t.id };
      g.save(); g.globalAlpha *= ea;
      if (tk.done) { const gr = g.createLinearGradient(px, 0, px + pw, 0); gr.addColorStop(0, rgba(tone(0.78, 0, 0), 1)); gr.addColorStop(1, rgba(tone(0.9, 0.3, 0), 1)); g.shadowColor = rgba(INK.amber, 0.55 * litT); g.shadowBlur = 8 * litT; g.fillStyle = gr; g.beginPath(); g.roundRect(px, py, pw * litT, ph, ph > 9 ? 2.5 : 1.5); g.fill(); g.shadowBlur = 0; if (litT < 1 && litT > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = rgba(GLINT, 0.7 * (1 - litT)); g.fillRect(px + pw * litT - 2, py, 2, ph); g.globalCompositeOperation = 'source-over'; } g.fillStyle = rgba(GLINT, 0.35 * litT); g.fillRect(px + 1, py + 0.5, pw * litT - 2, 1); }
      else if (c.finished) { g.setLineDash([2.5, 2.5]); g.strokeStyle = rgba(INK.ember, 0.62); g.lineWidth = 1; g.beginPath(); g.roundRect(px + 0.5, py + 0.5, pw - 1, ph - 1, ph > 9 ? 2.5 : 1.5); g.stroke(); g.setLineDash([]); }
      else if (isNow) { const pu = 0.5 + 0.5 * Math.sin(t * 3.2 - k * 0.7); g.strokeStyle = rgba(INK.ember, 0.55 + 0.45 * pu); g.lineWidth = 1.2; g.shadowColor = rgba(INK.ember, 0.8); g.shadowBlur = 6 * pu; g.beginPath(); g.roundRect(px + 0.5, py + 0.5, pw - 1, ph - 1, ph > 9 ? 2.5 : 1.5); g.stroke(); g.shadowBlur = 0; }
      else { g.strokeStyle = rgba(INK.steel, 0.2); g.lineWidth = 1; g.beginPath(); g.roundRect(px + 0.5, py + 0.5, pw - 1, ph - 1, ph > 9 ? 2.5 : 1.5); g.stroke(); }
      // effort: 1–3 small marks at the end of the pip
      if (!small && ph > 11) { g.fillStyle = tk.done ? 'rgba(7,8,10,0.55)' : rgba(INK.muted, 0.5); for (let e = 0; e < tk.t.effort; e++) { g.beginPath(); g.arc(px + pw - 5 - e * 4, py + ph / 2, 1.1, 0, 6.283); g.fill(); } }
      if (hot || (st.cLinks.length && st.cLinks.some((l) => l.p.v > 0.05 && (ri === l.a || ri === l.b)))) { const pl = hot ? 1 : Math.max(...st.cLinks.map((l) => l.p.v)); g.strokeStyle = rgba(INK.verd, 0.95 * pl); g.lineWidth = 1.4; g.shadowColor = rgba(INK.verd, 0.9); g.shadowBlur = 8; g.beginPath(); g.roundRect(px - 1.5, py - 1.5, pw + 3, ph + 3, 3.5); g.stroke(); g.shadowBlur = 0; }
      g.restore();
    });
    if (!small) { const lab = fut ? '' : rate == null ? 'NOW' : Math.round(rate * 100) + '%'; txt(g, lab, x + cw / 2, y + chh - 6, { align: 'center', color: isNow ? rgba(INK.amber, 1) : rate != null ? rgba(tone(rate, 0, 0), 0.9) : rgba(INK.muted, 0.7), font: `500 9px ${FONT.mono}` }); }
    g.restore();
  }
  // ---- completion ripples: a physical wave through the wall from the pip just ticked
  for (const rp of st.ripples) { const age = t - rp.t0, R = age * 260, a = (1 - age / 3.2) * rp.s; if (age < 0 || a <= 0) continue; g.strokeStyle = rgba(INK.amber, a * 0.6); g.lineWidth = 1.5; g.beginPath(); g.arc(rp.x, rp.y, R, 0, 6.283); g.stroke(); g.strokeStyle = rgba(INK.ivory, a * 0.2); g.beginPath(); g.arc(rp.x, rp.y, R * 0.82, 0, 6.283); g.stroke(); }
  // ---- cycle history: every cycle as a tiny wall of its own; the chosen one is bracketed
  if (small) { const tw = rect.w / CY_N; for (let k = 0; k < CY_N; k++) { const rr = cycRate(k), sel = k === cy, hx = rect.x + k * tw; st._dk.hist.push({ cy: k, x: hx, y: G.hy - 2, w: tw, h: 32 }); g.fillStyle = rr == null ? rgba(INK.steel, 0.16) : rgba(tone(rr, 0, 0), 0.3 + 0.6 * rr); g.globalAlpha = alpha * (sel ? 1 : 0.55); g.fillRect(hx + 1.5, G.hy + 2, tw - 3, 10); g.globalAlpha = alpha; txt(g, `${k + 1}`, hx + tw / 2, G.hy + 24, { align: 'center', color: rgba(sel ? INK.amber : INK.muted, 1), font: `600 8px ${FONT.mono}` }); if (sel) { g.strokeStyle = rgba(INK.amber, 0.95); g.lineWidth = 1; g.strokeRect(hx + 0.5, G.hy + 0.5, tw - 1, 13); } } g.restore(); return; }
  txt(g, 'CYCLES', rect.x - 14, G.hy + 10, { align: 'right', color: rgba(INK.muted, 1), font: `500 9px ${FONT.mono}`, ls: '1.4px' });
  const hw = rect.w / CY_N, hs = Math.min(small ? 3.2 : 5.2, (hw - 14) / 13);
  for (let k = 0; k < CY_N; k++) {
    const hx = rect.x + k * hw + 6, sel = k === cy; st._dk.hist.push({ cy: k, x: hx - 4, y: G.hy - 4, w: hw - 4, h: G.hist - 6 });
    g.save(); g.globalAlpha = alpha * (sel ? 1 : st.hoverCy === k ? 0.85 : 0.6);
    for (let i = 0; i < 39; i++) { const c = CARDS[k * 39 + i], r = cardRate(c); g.fillStyle = r == null ? rgba(INK.steel, 0.16) : rgba(tone(r, 0, 0), 0.25 + 0.7 * r); g.fillRect(hx + Math.floor(i / 3) * hs, G.hy + 4 + (i % 3) * (hs + 1), hs - 0.8, hs); }
    const rr = cycRate(k); txt(g, `C${k + 1}`, hx, G.hy + 4 + 3 * (hs + 1) + 12, { color: rgba(sel ? INK.amber : INK.dim, 1), font: `600 9px ${FONT.mono}` }); if (rr != null) txt(g, `${Math.round(rr * 100)}`, hx + hs * 13 - 1, G.hy + 4 + 3 * (hs + 1) + 12, { align: 'right', color: rgba(tone(rr, 0, 0), 1), font: `500 9px ${FONT.mono}` });
    if (sel) { g.strokeStyle = rgba(INK.amber, 0.9); g.lineWidth = 1; g.beginPath(); g.roundRect(hx - 4.5, G.hy - 2, hs * 13 + 8, 3 * (hs + 1) + 24, 2); g.stroke(); }
    g.restore();
  }
  // ---- caption for the chosen cycle
  const cr = cycRate(cy), a0 = dateAt(cy * 91), a1 = dateAt(cy * 91 + 90); txt(g, `CYCLE ${cy + 1}  ·  ${MON[a0.getMonth()]} ${a0.getDate()} – ${MON[a1.getMonth()]} ${a1.getDate()}${cr != null ? '  ·  ' + Math.round(cr * 100) + '% DONE' : ''}`, rect.x, rect.y - 4, { color: rgba(INK.dim, 0.9), font: `500 10px ${FONT.mono}`, ls: '1.2px' });
  g.restore();
}
function deckHit(st, x, y) {
  const d = st._dk; if (!d) return null;
  for (const h of d.hist) if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return { kind: 'cycle', cy: h.cy };
  for (const c of d.cells) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { let pip = null; for (let k = 0; k < 8; k++) { const p = d.pips[c.c * 8 + k]; if (p && x >= p.x && x <= p.x + p.w && y >= p.y - 1 && y <= p.y + p.h + 1) pip = { ...p, k }; } return { kind: 'card', c: c.c, x: c.x + c.w / 2, y: c.y + c.h / 2, pip }; }
  return null;
}
function setDeckCycle(st, cy) { cy = clamp(cy, 0, CY_N - 1); if (cy === st.deckCy) return; st.deckSlide.v = cy > st.deckCy ? 1 : -1; st.deckSlide.to(0); st.deckCy = cy; st.deckT0 = CLK.t; }
