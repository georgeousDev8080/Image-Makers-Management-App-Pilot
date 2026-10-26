// Απλά, ελαφριά γραφήματα SVG (χωρίς βιβλιοθήκες)
import { esc, money, L } from './core.js';

/** Ομαδοποιημένες μπάρες: έσοδα vs έξοδα ανά μήνα */
export function barPairs(data, { h = 220, labels = null, fmt = null } = {}) {
  const [la, lb] = labels || [L('Έσοδα', 'Income'), L('Έξοδα', 'Expenses')];
  const f = fmt || ((v) => money(v, { dec: 0 }));
  // data: [{label, a (έσοδα), b (έξοδα)}]
  const raw = Math.max(0, ...data.flatMap((d) => [d.a, d.b]));
  const stepRaw = Math.max(raw / 4, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(stepRaw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((v) => v >= stepRaw);
  const max = step * 4;
  const W = 720, H = h, pl = 46, pb = 26, pt = 10;
  const cw = (W - pl - 8) / data.length;
  const bw = Math.max(4, Math.min(18, cw / 2 - 3));
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const ticks = 4;
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = step * i; const yy = y(v);
    g += `<line class="axis" x1="${pl}" x2="${W - 4}" y1="${yy}" y2="${yy}" stroke-width="${i === 0 ? 1 : .6}" ${i ? 'stroke-dasharray="2 4"' : ''}/><text x="${pl - 6}" y="${yy + 4}" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('el-GR', { maximumFractionDigits: 1 }) + 'k' : Math.round(v)}</text>`;
  }
  const bar = (x, v, cls, tip) => {
    if (v <= 0) return '';
    const top = y(v), hh = H - pb - top, r = Math.min(4, bw / 2, hh);
    const path = `M${x},${H - pb} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pb} Z`;
    return `<path class="${cls}" d="${path}" data-tip="${esc(tip)}"><title>${esc(tip)}</title></path>`;
  };
  data.forEach((d, i) => {
    const cx = pl + cw * i + cw / 2;
    g += bar(cx - bw - 1, d.a, 'bar-in', `${d.label} · ${la}: ${f(d.a)}`);
    g += bar(cx + 1, d.b, 'bar-out', `${d.label} · ${lb}: ${f(d.b)}`);
    g += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
  });
  return `<div class="chart-legend"><span><i class="in"></i>${esc(la)}</span><span><i class="out"></i>${esc(lb)}</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(la + ' / ' + lb)}">${g}</svg>`;
}

/** Οριζόντιες μπάρες μίας σειράς */
export function hbars(items, { fmt = (v) => String(v) } = {}) {
  const max = Math.max(1, ...items.map((i) => i.v));
  return items.map((i) => `<div class="hbar" title="${esc(i.label)}: ${esc(fmt(i.v))}"><span class="truncate">${i.dot ? `<span class="cat-dot cat-${i.dot}"></span> ` : ''}${esc(i.label)}</span><div class="track"><i style="width:${(i.v / max) * 100}%;${i.dot ? `background:var(--cat-${i.dot})` : ''}"></i></div><b class="money small">${esc(fmt(i.v))}</b></div>`).join('');
}

/** Tooltip που ακολουθεί το ποντίκι για στοιχεία με data-tip */
export function bindTips(root) {
  let tip = null;
  root.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip?.remove(); tip = null; return; }
    if (!tip) { tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip); }
    tip.textContent = t.dataset.tip;
    tip.style.left = Math.min(window.innerWidth - 200, e.clientX + 12) + 'px';
    tip.style.top = e.clientY - 36 + 'px';
  });
  root.addEventListener('pointerleave', () => { tip?.remove(); tip = null; });
}
