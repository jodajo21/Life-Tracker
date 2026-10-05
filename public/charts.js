// Tiny dependency-free SVG charts. All return HTML strings.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** bars: [{label, value}] */
export function bars(data, color, { height = 110, showEvery = 1 } = {}) {
  const W = 320, pad = 18, H = height;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - 4) / data.length;
  const out = data.map((d, i) => {
    const h = Math.round(((H - pad - 12) * d.value) / max);
    const x = 2 + i * bw;
    return `<rect x="${x + bw * 0.12}" y="${H - pad - h}" width="${bw * 0.76}" height="${Math.max(h, d.value ? 2 : 0)}" rx="2" fill="${color}"><title>${esc(d.label)}: ${d.value}</title></rect>` +
      (d.value ? `<text x="${x + bw / 2}" y="${H - pad - h - 3}" text-anchor="middle">${d.value}</text>` : '') +
      (i % showEvery === 0 ? `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${esc(d.label)}</text>` : '');
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${out}<line x1="0" x2="${W}" y1="${H - pad}" y2="${H - pad}" stroke="var(--line)"/></svg>`;
}

/** Calendar heatmap. counts: {YYYY-MM-DD: n}; columns are weeks (Mon-first). */
export function heatmap(counts, fromIso, toIso, color) {
  const start = new Date(fromIso + 'T00:00:00'); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(toIso + 'T00:00:00');
  const cell = 14, gap = 3, left = 14;
  const weeks = Math.ceil((end - start) / 864e5 / 7) + 1;
  const max = Math.max(1, ...Object.values(counts));
  let out = '';
  ['M', '', 'W', '', 'F', '', ''].forEach((l, r) => { if (l) out += `<text x="0" y="${r * (cell + gap) + 11}">${l}</text>`; });
  for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) {
    const d = new Date(start); d.setDate(start.getDate() + w * 7 + r);
    if (d > end || d < new Date(fromIso + 'T00:00:00')) continue;
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const n = counts[iso] || 0;
    const op = n ? 0.3 + 0.7 * (n / max) : 1;
    out += `<rect x="${left + w * (cell + gap)}" y="${r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${n ? color : 'var(--heat0)'}" fill-opacity="${op}"><title>${iso}: ${n}</title></rect>`;
  }
  const W = left + weeks * (cell + gap), H = 7 * (cell + gap);
  return `<svg viewBox="0 0 ${W} ${H}" style="max-height:${H * 1.6}px" role="img">${out}</svg>`;
}

/** items: [{label, value, of?}] — horizontal bars; with `of`, draws progress toward it. */
export function hbars(items, color) {
  if (!items.length) return '';
  const max = Math.max(1, ...items.map((i) => i.of ?? i.value));
  return items.map((i) => `<div style="display:grid;grid-template-columns:110px 1fr 54px;gap:8px;align-items:center;margin:5px 0;font-size:13px">
    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(i.label)}">${esc(i.label)}</span>
    <div style="background:var(--heat0);border-radius:6px;height:12px;overflow:hidden"><div style="width:${(100 * i.value) / max}%;height:100%;background:${color}"></div></div>
    <span class="sub" style="text-align:right">${i.of != null ? `${i.value}/${i.of}` : i.value}</span></div>`).join('');
}

/** Completion ring (0..1) */
export function ring(frac, color, label) {
  const r = 34, c = 2 * Math.PI * r, pct = Math.round(frac * 100);
  return `<svg viewBox="0 0 90 90" style="width:92px"><circle cx="45" cy="45" r="${r}" fill="none" stroke="var(--heat0)" stroke-width="10"/>
    <circle cx="45" cy="45" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c * frac} ${c}" transform="rotate(-90 45 45)"/>
    <text x="45" y="49" text-anchor="middle" style="font:700 18px system-ui;fill:var(--ink)">${pct}%</text>
    ${label ? `<text x="45" y="62" text-anchor="middle" style="font-size:8px">${esc(label)}</text>` : ''}</svg>`;
}
