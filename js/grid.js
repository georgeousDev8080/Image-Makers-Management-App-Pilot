// =====================================================================
//  Πίνακας τύπου Excel: επεξεργασία κελιών, πλοήγηση με πλήκτρα,
//  σταθερή πρώτη στήλη & επικεφαλίδες, ομάδες στηλών
// =====================================================================
import { L, esc, money, fmtDate, parseMoney, normTime, opt, sheet, toast, toastErr, haptic, latinName } from './core.js';

const memory = {}; // id → { scrollLeft, scrollTop, sel: {rk, ck} }
/** Χρωματιστή ετικέτα επιλογής (tone: red, green, blue, yellow, orange, grey, solid-green, solid-red, ή CSS χρώμα μέσω o.color) */
export const toneChip = (o, caret = true) => `<span class="tchip t-${esc(o.tone || 'grey')}${caret ? ' caret' : ''}"${o.color ? ` style="--tc:${esc(o.color)}"` : ''}>${esc(L(o.el, o.en))}</span>`;
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

/**
 * cols: [{ key, label, group, w, type, get(row), display(row)->html, editable(row)->bool|bool, options(row)->[{v,el,en}], cls(row), sum: bool }]
 * opts: { id, rows, rowKey(row), rowClass(row), groups: {key: {label, cls}}, onEdit(row, col, value) → Promise, empty }
 */
export function renderGrid(container, cols, opts) {
  const { id, rows, rowKey, rowClass = () => '', groups = {}, onEdit, empty = L('Καμία εγγραφή', 'No rows') } = opts;
  const mem = (memory[id] ||= { scrollLeft: 0, scrollTop: 0, sel: null });
  const isEditable = (c, r) => (typeof c.editable === 'function' ? c.editable(r) : !!c.editable);
  const raw = (c, r) => (c.get ? c.get(r) : r[c.key]);
  const show = (c, r) => {
    if (c.display) return c.display(r);
    const v = raw(c, r);
    if ((v === null || v === undefined || v === '') && c.type === 'select' && c.chips) return '<span class="tchip t-empty"></span>';
    if (v === null || v === undefined || v === '') return '<span class="ph"></span>';
    if (c.type === 'money') return esc(money(v));
    if (c.type === 'date') return esc(fmtDate(v));
    if (c.type === 'time') return esc(String(v).slice(0, 5));
    if (c.type === 'select') { const list = typeof c.options === 'function' ? c.options(r) : c.options; const o = opt(list, v); return o?.tone ? toneChip(o) : esc(o ? L(o.el, o.en) : v); }
    if (c.type === 'bool') return v ? L('Ναι', 'Yes') : L('Όχι', 'No');
    return esc(v);
  };

  // επικεφαλίδες
  const groupRow = [];
  cols.forEach((c) => {
    const last = groupRow[groupRow.length - 1];
    if (last && last.g === c.group) last.n++;
    else groupRow.push({ g: c.group, n: 1 });
  });
  const hasGroups = cols.some((c) => c.group);
  let html = `<div class="xl-wrap" tabindex="0"><table class="xl"><thead>`;
  if (hasGroups) html += `<tr class="g">${groupRow.map((g, i) => `<th colspan="${g.n}" class="${groups[g.g]?.cls || 'gc-plain'} ${i === 0 && cols[0].sticky ? 'sticky' : ''}">${esc(groups[g.g]?.label || '')}</th>`).join('')}</tr>`;
  html += `<tr class="h">${cols.map((c) => `<th class="${groups[c.group]?.cls || 'gc-plain'} ${c.sticky ? 'sticky' : ''}" style="${hasGroups ? '' : 'top:0'}"><div style="min-width:${c.w || 110}px">${esc(c.label)}</div></th>`).join('')}</tr></thead><tbody>`;
  if (!rows.length) html += `<tr><td colspan="${cols.length}"><div class="c muted" style="justify-content:center;max-width:none;height:80px">${esc(empty)}</div></td></tr>`;
  rows.forEach((r, ri) => {
    html += `<tr class="${rowClass(r)}" data-rk="${esc(rowKey(r))}">${cols.map((c, ci) => {
      const ed = isEditable(c, r);
      const cls = [c.sticky ? 'sticky' : '', ed ? 'edit' : '', ['money', 'number'].includes(c.type) ? 'num' : '', c.align === 'center' ? 'ctr' : '', c.cls ? c.cls(r) : ''].join(' ');
      return `<td class="${cls}" data-r="${ri}" data-c="${ci}"><div class="c" style="--w:${c.w || 110}px">${show(c, r)}</div></td>`;
    }).join('')}</tr>`;
  });
  html += `</tbody>`;
  if (cols.some((c) => c.sum) && rows.length) {
    html += `<tfoot><tr>${cols.map((c, ci) => {
      if (ci === 0) return `<td class="sticky"><div class="c" style="--w:${c.w || 110}px">${esc(L('Σύνολο', 'Total'))} (${rows.length})</div></td>`;
      if (!c.sum) return '<td><div class="c"></div></td>';
      const s = rows.reduce((n, r) => n + (Number(typeof c.sum === 'function' ? c.sum(r) : raw(c, r)) || 0), 0);
      return `<td class="num"><div class="c" style="--w:${c.w || 110}px">${esc(money(s))}</div></td>`;
    }).join('')}</tr></tfoot>`;
  }
  html += `</table></div>`;
  container.innerHTML = html;

  const wrap = container.querySelector('.xl-wrap');
  wrap.scrollLeft = mem.scrollLeft; wrap.scrollTop = mem.scrollTop;
  wrap.addEventListener('scroll', () => { mem.scrollLeft = wrap.scrollLeft; mem.scrollTop = wrap.scrollTop; }, { passive: true });

  let sel = null; // td
  let editing = null;
  const tdAt = (r, c) => wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
  const select = (td, scroll = true) => {
    if (!td) return;
    sel?.classList.remove('sel');
    sel = td; td.classList.add('sel');
    const r = rows[+td.dataset.r], c = cols[+td.dataset.c];
    mem.sel = { rk: rowKey(r), ck: c.key };
    if (scroll) td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  // επαναφορά επιλογής
  if (mem.sel) {
    const ri = rows.findIndex((r) => rowKey(r) === mem.sel.rk);
    const ci = cols.findIndex((c) => c.key === mem.sel.ck);
    if (ri >= 0 && ci >= 0) select(tdAt(ri, ci), false);
  }

  async function commit(td, value) {
    const r = rows[+td.dataset.r], c = cols[+td.dataset.c];
    const old = raw(c, r);
    if ((old ?? '') === (value ?? '') || (c.type === 'money' && Number(old) === Number(value) && value !== null)) { td.querySelector('.c').innerHTML = show(c, r); return; }
    if (c.required && (value === null || value === undefined || value === '')) { toastErr(L('Το πεδίο δεν μπορεί να μείνει κενό', 'This field cannot be empty')); td.querySelector('.c').innerHTML = show(c, r); return; }
    td.classList.add('saving');
    try {
      await onEdit(r, c, value);
      td.classList.remove('saving');
      td.classList.add('flash'); setTimeout(() => td.classList.remove('flash'), 1200);
      // κελί που άδειασε: δυνατότητα αναίρεσης (π.χ. κατά λάθος Delete)
      if ((value === null || value === '') && old !== null && old !== undefined && old !== '' && c.type !== 'bool') {
        toast(L('Το κελί άδειασε', 'Cell cleared'), { type: 'info', body: L('Πατήστε εδώ για αναίρεση', 'Tap here to undo'), ms: 7000, onClick: () => { onEdit(r, c, old).then(() => toast(L('Αναιρέθηκε', 'Undone'), { ms: 1500 })).catch(() => {}); } });
      }
    } catch (e) {
      td.classList.remove('saving');
      td.querySelector('.c').innerHTML = show(c, r);
    }
  }

  function parse(c, v) {
    if (c.type === 'money' || c.type === 'number') { if (v === '' || v === null) return null; const n = parseMoney(v); if (n === null) { toastErr(L('Μη έγκυρος αριθμός', 'Invalid number')); return undefined; } return n; }
    if (c.type === 'bool') return v === 'true' || v === true;
    if (c.type === 'time') { const t = normTime(v); if (t === null) { toastErr(L('Γράψτε την ώρα ως ΩΩ:ΛΛ', 'Enter the time as HH:MM')); return undefined; } return t || null; }
    return v === '' ? null : v;
  }

  function startEdit(td, initial) {
    const r = rows[+td.dataset.r], c = cols[+td.dataset.c];
    if (!isEditable(c, r)) { if (c.onOpen) c.onOpen(r); return; }
    if (c.onOpen) { c.onOpen(r); return; }
    if (c.type === 'bool') { commit(td, !raw(c, r)); haptic(); return; }
    if (coarse()) return editInSheet(td, r, c);
    if (c.type === 'select' && c.chips) return chipMenu(td, r, c);
    const v = raw(c, r);
    const box = td.querySelector('.c');
    let input;
    if (c.type === 'select') {
      const list = typeof c.options === 'function' ? c.options(r) : c.options;
      input = document.createElement('select');
      input.innerHTML = (c.blank !== false ? `<option value="">—</option>` : '') + list.map((o) => `<option value="${esc(o.v)}" ${o.v === v ? 'selected' : ''}>${esc(L(o.el, o.en))}</option>`).join('');
    } else {
      input = document.createElement('input');
      input.type = c.type === 'date' ? 'date' : 'text';
      if (c.type === 'time') { input.inputMode = 'numeric'; input.maxLength = 5; input.placeholder = 'ΩΩ:ΛΛ'; input.dataset.time = '1'; }
      if (c.type === 'money' || c.type === 'number') input.inputMode = 'decimal';
      input.value = initial !== undefined ? initial : (v == null ? '' : c.type === 'money' ? String(v).replace('.', ',') : c.type === 'time' ? String(v).slice(0, 5) : String(v));
    }
    input.className = 'cell-input';
    box.innerHTML = ''; box.style.padding = '0'; box.appendChild(input);
    editing = { td, input, c, r };
    input.focus();
    if (input.select && initial === undefined && input.type === 'text') input.select();
    let done = false;
    const finish = async (save, move) => {
      if (done) return; done = true;
      editing = null;
      box.style.padding = '';
      if (save) {
        const val = parse(c, input.value);
        if (val === undefined) { box.innerHTML = show(c, r); }
        else {
          // αφαιρούμε το πεδίο αμέσως ώστε ο πίνακας να μπορεί να ανανεωθεί
          const shown = input.tagName === 'SELECT' ? (input.selectedOptions[0]?.textContent || '') : input.value;
          box.textContent = shown;
          await commit(td, val);
        }
      } else box.innerHTML = show(c, r);
      if (move) { const nx = tdAt(+td.dataset.r + move[0], +td.dataset.c + move[1]); if (nx) select(nx); }
      wrap.focus({ preventScroll: true });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true, [1, 0]); }
      else if (e.key === 'Tab') { e.preventDefault(); finish(true, [0, e.shiftKey ? -1 : 1]); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
    if (c.type === 'select') input.addEventListener('change', () => finish(true));
  }

  // λίστα επιλογών με χρωματιστές ετικέτες (όπως τα dropdown chips του Google Sheets)
  function chipMenu(td, r, c) {
    document.querySelector('.chip-menu')?.remove();
    const list = typeof c.options === 'function' ? c.options(r) : c.options;
    const v = raw(c, r);
    const m = document.createElement('div');
    m.className = 'chip-menu';
    m.innerHTML = `<div class="cm-cur">${esc(v ? L(opt(list, v)?.el || v, opt(list, v)?.en || v) : '')}&nbsp;</div>`
      + list.map((o) => `<button type="button" class="cm-opt ${o.v === v ? 'on' : ''}" data-v="${esc(o.v)}">${toneChip(o, false)}</button>`).join('')
      + (c.blank !== false ? `<button type="button" class="cm-opt cm-clear" data-v="">${esc(L('Καθαρισμός', 'Clear'))}</button>` : '');
    document.body.appendChild(m);
    const rc = td.getBoundingClientRect();
    const h = m.offsetHeight, w = Math.max(rc.width, 220);
    m.style.width = w + 'px';
    m.style.left = Math.min(rc.left, innerWidth - w - 8) + 'px';
    m.style.top = (rc.bottom + h + 8 > innerHeight ? Math.max(8, rc.top - h - 4) : rc.top) + 'px';
    let idx = Math.max(0, list.findIndex((o) => o.v === v));
    const btns = [...m.querySelectorAll('.cm-opt')];
    const focusAt = (i) => { idx = (i + btns.length) % btns.length; btns.forEach((b, j) => b.classList.toggle('kb', j === idx)); };
    focusAt(idx);
    const close = () => { m.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', keys, true); wrap.focus({ preventScroll: true }); };
    const pick = (val) => { close(); commit(td, val || null); };
    const outside = (e) => { if (!m.contains(e.target)) close(); };
    const keys = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); focusAt(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); focusAt(idx - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(btns[idx].dataset.v); }
    };
    btns.forEach((b) => b.addEventListener('click', () => pick(b.dataset.v)));
    setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', keys, true); }, 0);
  }

  function editInSheet(td, r, c) {
    const v = raw(c, r);
    let inner;
    if (c.type === 'select') {
      const list = typeof c.options === 'function' ? c.options(r) : c.options;
      inner = `<div class="list">${(c.blank !== false ? [{ v: '', el: '—', en: '—' }] : []).concat(list).map((o) => `<button class="row" data-v="${esc(o.v)}"><div class="main-col"><div class="t">${o.tone ? toneChip(o, false) : esc(L(o.el, o.en))}</div></div>${(o.v || null) === (v || null) ? '<span class="pos">✓</span>' : ''}</button>`).join('')}</div>`;
    } else {
      const type = c.type === 'date' ? 'date' : 'text';
      const val = v == null ? '' : c.type === 'money' ? String(v).replace('.', ',') : c.type === 'time' ? String(v).slice(0, 5) : String(v);
      inner = `<div class="form"><input class="input" type="${type}" ${c.type === 'time' ? 'inputmode="numeric" maxlength="5" placeholder="ΩΩ:ΛΛ" data-time' : ''} ${['money', 'number'].includes(c.type) ? 'inputmode="decimal"' : ''} value="${esc(val)}"><button class="btn primary large block" data-ok>${esc(L('Αποθήκευση', 'Save'))}</button></div>`;
    }
    const s = sheet({ title: c.label, body: inner });
    s.body.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { s.close(); commit(td, b.dataset.v || null); }));
    const inp = s.body.querySelector('input');
    if (inp) {
      setTimeout(() => inp.focus(), 350);
      const ok = () => { const val = parse(c, inp.value); if (val === undefined) return; s.close(); commit(td, val); };
      s.body.querySelector('[data-ok]').addEventListener('click', ok);
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    }
  }

  wrap.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, select')) return;
    const td = e.target.closest('td[data-r]'); if (!td) return;
    if (editing && editing.td === td) return;
    const wasSel = sel === td;
    select(td, false);
    if (coarse() || wasSel) startEdit(td);
  });
  wrap.addEventListener('dblclick', (e) => { const td = e.target.closest('td[data-r]'); if (!td || e.target.closest('button, a, input, select')) return; if (editing && editing.td === td) return; startEdit(td); });
  wrap.addEventListener('keydown', (e) => {
    if (editing || !sel) return;
    const r = +sel.dataset.r, c = +sel.dataset.c;
    const mv = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], Tab: [0, e.shiftKey ? -1 : 1] }[e.key];
    if (mv) { e.preventDefault(); const nx = tdAt(r + mv[0], c + mv[1]); if (nx) select(nx); return; }
    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); startEdit(sel); return; }
    const col = cols[c], row = rows[r];
    if ((e.key === 'Delete' || e.key === 'Backspace') && isEditable(col, row) && !col.onOpen && col.type !== 'bool' && !col.required) { e.preventDefault(); commit(sel, null); return; }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && isEditable(col, row) && ['text', 'money', 'number', undefined].includes(col.type) && !col.onOpen) { e.preventDefault(); startEdit(sel, e.key); }
  });
  return { wrap };
}

/** Εξαγωγή του τρέχοντος πίνακα σε .xlsx */
export async function exportGrid(name, cols, rows) {
  const { loadScript } = await import('./core.js');
  await loadScript('vendor/xlsx.full.min.js');
  const header = cols.map((c) => c.label);
  const data = rows.map((r) => cols.map((c) => {
    const v = c.exportValue ? c.exportValue(r) : c.get ? c.get(r) : r[c.key];
    if (v === null || v === undefined) return '';
    if (c.type === 'money' || c.type === 'number') return Number(v);
    if (c.type === 'date') return fmtDate(v, '');
    if (c.type === 'select') { const list = typeof c.options === 'function' ? c.options(r) : c.options; const o = opt(list, v); return o ? L(o.el, o.en) : v; }
    if (c.type === 'bool') return v ? L('Ναι', 'Yes') : L('Όχι', 'No');
    return String(v);
  }));
  const ws = window.XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(10, Math.round((c.w || 110) / 7)) }));
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31).replace(/[\\/?*[\]:]/g, ''));
  window.XLSX.writeFile(wb, latinName(`ImageMakers_${name}_${new Date().toISOString().slice(0, 10)}.xlsx`));
}
