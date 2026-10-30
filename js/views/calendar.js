// =====================================================================
//  Ημερολόγιο — σε στυλ Google Calendar
//  Προβολές: Ημέρα · Εβδομάδα · Μήνας · Πρόγραμμα (ώρες σε 24ωρη μορφή)
// =====================================================================
import { L, esc, icon, toISO, parseISO, todayISO, addDays, monthName, fmtDateLong, fmtTime, LANG, DOW_SHORT_EL, DOW_SHORT_EN, segmented, initSegmented } from '../core.js';
import { isAdmin, allEventViews, myEventIds } from '../data.js';
import { pageHead } from '../layout.js';
import { eventRow, catShort } from '../components.js';

const HOUR = 48;          // ύψος μίας ώρας (px) στο πλέγμα ωρών
const DUR = 120;          // προεπιλεγμένη διάρκεια εμφάνισης (λεπτά) — οι εκδηλώσεις έχουν μόνο ώρα έναρξης
const st = { sel: todayISO(), mode: 'month', onlyMine: false, anim: '' };

const dows = () => (LANG === 'en' ? DOW_SHORT_EN : DOW_SHORT_EL);
const mondayOf = (iso) => { const d = parseISO(iso); return addDays(iso, -((d.getDay() + 6) % 7)); };
const mins = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function title() {
  const d = parseISO(st.sel);
  if (st.mode === 'day') return fmtDateLong(st.sel);
  if (st.mode === 'week') {
    const a = parseISO(mondayOf(st.sel)), b = parseISO(addDays(mondayOf(st.sel), 6));
    if (a.getMonth() === b.getMonth()) return `${monthName(a.getMonth())} ${a.getFullYear()}`;
    const ab = (x) => monthName(x.getMonth()).slice(0, 3);
    return a.getFullYear() === b.getFullYear() ? `${ab(a)} – ${ab(b)} ${b.getFullYear()}` : `${ab(a)} ${a.getFullYear()} – ${ab(b)} ${b.getFullYear()}`;
  }
  return `${monthName(d.getMonth())} ${d.getFullYear()}`;
}

/** Τοποθέτηση επικαλυπτόμενων εκδηλώσεων σε στήλες (όπως το Google) */
function layout(evs) {
  const items = evs.map((v) => { const s = mins(v.e.event_time); return { v, s, e: s + DUR }; }).sort((a, b) => a.s - b.s || b.e - a.e);
  const groups = []; let g = null;
  items.forEach((it) => {
    if (!g || it.s >= g.end) { g = { end: it.e, cols: [] }; groups.push(g); }
    g.end = Math.max(g.end, it.e);
    let c = g.cols.findIndex((end) => end <= it.s);
    if (c < 0) { c = g.cols.length; g.cols.push(it.e); } else g.cols[c] = it.e;
    it.col = c; it.g = g;
  });
  return items.map((it) => ({ ...it, n: it.g.cols.length }));
}

function timeGrid(days, byDate, admin) {
  const today = todayISO();
  const now = new Date(); const nowM = now.getHours() * 60 + now.getMinutes();
  const wd = dows();
  const head = days.map((iso) => { const d = parseISO(iso); return `<button class="tg-dh ${iso === today ? 'today' : ''}" data-goday="${iso}"><span class="tg-dow">${esc(wd[(d.getDay() + 6) % 7])}</span><span class="tg-num">${d.getDate()}</span></button>`; }).join('');
  const allDay = days.map((iso) => {
    const list = (byDate[iso] || []).filter((v) => mins(v.e.event_time) == null);
    return `<div class="tg-ad">${list.map((v) => `<a class="cal-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}">${esc(v.title)}</a>`).join('')}</div>`;
  }).join('');
  const hasAllDay = days.some((iso) => (byDate[iso] || []).some((v) => mins(v.e.event_time) == null));
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="tg-h"><span>${h ? hhmm(h * 60) : ''}</span></div>`).join('');
  const cols = days.map((iso) => {
    const timed = (byDate[iso] || []).filter((v) => mins(v.e.event_time) != null);
    const blocks = layout(timed).map(({ v, s, col, n }) => {
      const w = 100 / n;
      const loc = v.e.church_location || '';
      return `<a class="tg-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}" style="top:${(s / 60) * HOUR}px;height:${(DUR / 60) * HOUR - 2}px;left:calc(${col * w}% + 1px);width:calc(${w}% - 3px)" title="${esc(`${hhmm(s)} ${v.title}${loc ? ' · ' + loc : ''}`)}">
        <b>${esc(v.title)}</b><span>${esc(hhmm(s))}${loc ? ` · ${esc(loc)}` : ''}</span></a>`;
    }).join('');
    const nowLine = iso === today ? `<div class="tg-now" style="top:${(nowM / 60) * HOUR}px"></div>` : '';
    return `<div class="tg-col ${iso === today ? 'today' : ''}" data-day="${iso}" ${admin ? 'data-slot' : ''}>${blocks}${nowLine}</div>`;
  }).join('');
  return `<div class="tg ${days.length === 1 ? 'one' : ''}" style="--days:${days.length};--hour:${HOUR}px">
    <div class="tg-headrow"><div class="tg-gut"></div>${head}</div>
    ${hasAllDay ? `<div class="tg-adrow"><div class="tg-gut small muted">${esc(L('Χωρίς ώρα', 'No time'))}</div>${allDay}</div>` : ''}
    <div class="tg-scroll" id="tgs"><div class="tg-body"><div class="tg-hours">${hours}</div>${cols}</div></div>
  </div>`;
}

function monthGrid(byDate, admin) {
  const sel = parseISO(st.sel); const y = sel.getFullYear(), m = sel.getMonth();
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
  const today = todayISO();
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const iso = toISO(d);
    const evs = (byDate[iso] || []).slice().sort((a, b) => (mins(a.e.event_time) ?? -1) - (mins(b.e.event_time) ?? -1));
    const out = d.getMonth() !== m;
    if (i >= 35 && out && i % 7 === 0) break;
    cells += `<div class="cal-cell ${out ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === st.sel ? 'sel' : ''}" data-date="${iso}" role="button" tabindex="0" aria-label="${esc(fmtDateLong(iso))}, ${evs.length}">
      <button class="num" data-goday="${iso}" tabindex="-1">${d.getDate()}</button>
      ${evs.slice(0, 3).map((v) => `<a class="cal-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}" title="${esc(v.title)}"><i></i>${v.e.event_time ? `<span class="t">${esc(fmtTime(v.e.event_time))}</span> ` : ''}${esc(v.title)}</a>`).join('')}
      ${evs.length > 3 ? `<button class="cal-more" data-goday="${iso}">+${evs.length - 3} ${esc(L('ακόμη', 'more'))}</button>` : ''}
      <div class="cal-dots">${evs.slice(0, 4).map((v) => `<i class="cat-${v.e.category}" style="background:var(--c)"></i>`).join('')}</div>
    </div>`;
  }
  let html = `<div class="cal" id="cal"><div class="cal-dow">${dows().map((d) => `<div>${esc(d)}</div>`).join('')}</div><div class="cal-grid ${st.anim}">${cells}</div></div>`;
  const dayEvs = byDate[st.sel] || [];
  html += `<div class="section-title cal-daylist"><h2 style="text-transform:capitalize">${esc(fmtDateLong(st.sel))}</h2>${admin ? `<a class="btn small" href="#/new-event?date=${st.sel}">${icon('plus')} ${esc(L('Νέα', 'New'))}</a>` : ''}</div>`;
  html += `<div class="cal-daylist">${dayEvs.length ? `<div class="list">${dayEvs.map((v) => eventRow(v)).join('')}</div>` : `<div class="card pad muted center small">${esc(L('Καμία εκδήλωση αυτή την ημέρα.', 'No events on this day.'))}</div>`}</div>`;
  return html;
}

function schedule(views) {
  const from = st.sel < todayISO() ? st.sel : todayISO();
  const list = views.filter((v) => v.e.event_date >= from).sort((a, b) => a.e.event_date.localeCompare(b.e.event_date) || (mins(a.e.event_time) ?? -1) - (mins(b.e.event_time) ?? -1));
  if (!list.length) return `<div class="card pad muted center">${esc(L('Καμία εκδήλωση από εδώ και πέρα.', 'No events from here on.'))}</div>`;
  const today = todayISO(); const wd = dows();
  let html = '<div class="sch">'; let lastM = '', lastD = '';
  list.forEach((v) => {
    const mk = v.e.event_date.slice(0, 7);
    if (mk !== lastM) { const [yy, mm] = mk.split('-').map(Number); html += `<div class="sch-month">${esc(monthName(mm - 1))} ${yy}</div>`; lastM = mk; }
    const d = parseISO(v.e.event_date);
    const first = v.e.event_date !== lastD; lastD = v.e.event_date;
    html += `<div class="sch-row ${first ? 'first' : ''}">
      <div class="sch-date ${v.e.event_date === today ? 'today' : ''}">${first ? `<span class="n">${d.getDate()}</span><span class="w">${esc(wd[(d.getDay() + 6) % 7])}</span>` : ''}</div>
      <a class="sch-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}"><i></i><span class="sch-t">${esc(v.e.event_time ? fmtTime(v.e.event_time) : L('Χωρίς ώρα', 'No time'))}</span><span class="sch-n"><b>${esc(v.title)}</b>${v.e.church_location ? `<small>${esc(v.e.church_location)}</small>` : ''}</span></a>
    </div>`;
  });
  return html + '</div>';
}

export function renderCalendar(root) {
  const admin = isAdmin();
  const mine = myEventIds();
  const views = allEventViews().filter((v) => (!admin || !st.onlyMine || mine.has(v.e.id)));
  const byDate = {};
  views.forEach((v) => { (byDate[v.e.event_date] ||= []).push(v); });

  const modes = [{ v: 'day', label: L('Ημέρα', 'Day') }, { v: 'week', label: L('Εβδομάδα', 'Week') }, { v: 'month', label: L('Μήνας', 'Month') }, { v: 'list', label: L('Πρόγραμμα', 'Schedule') }];
  const actions = admin ? `<a class="btn primary" href="#/new-event?date=${st.sel}">${icon('plus')} <span class="hide-mobile">${esc(L('Νέα εκδήλωση', 'New event'))}</span></a>` : '';
  let html = pageHead(L('Ημερολόγιο', 'Calendar'), { actions });

  html += `<div class="gc-bar">
      <button class="btn small" data-nav="0">${esc(L('Σήμερα', 'Today'))}</button>
      <button class="icon-btn" data-nav="-1" aria-label="${esc(L('Προηγούμενο', 'Previous'))}">${icon('chevL')}</button>
      <button class="icon-btn" data-nav="1" aria-label="${esc(L('Επόμενο', 'Next'))}">${icon('chevR')}</button>
      <div class="cal-title">${esc(title())}</div>
      <div class="gc-modes">${segmented('mode', modes, st.mode)}</div>
    </div>`;
  if (admin) html += `<div class="chips mb">
      <button class="chip ${!st.onlyMine ? 'on' : ''}" data-mine="0">${esc(L('Όλες οι εκδηλώσεις', 'All events'))}</button>
      <button class="chip ${st.onlyMine ? 'on' : ''}" data-mine="1">${esc(L('Μόνο όπου συμμετέχω', 'Only mine'))}</button></div>`;

  if (st.mode === 'month') html += monthGrid(byDate, admin);
  else if (st.mode === 'week') { const mon = mondayOf(st.sel); html += timeGrid(Array.from({ length: 7 }, (_, i) => addDays(mon, i)), byDate, admin); }
  else if (st.mode === 'day') html += timeGrid([st.sel], byDate, admin);
  else html += schedule(views);
  if (st.mode !== 'list') html += `<div class="legend">${['wedding', 'baptism', 'wedding_baptism', 'promo', 'other'].map((c) => `<span><i class="cat-${c}" style="background:var(--c)"></i>${esc(catShort(c))}</span>`).join('')}${admin && st.mode !== 'month' ? `<span class="muted">${esc(L('Πατήστε σε κενή ώρα για νέα εκδήλωση', 'Tap an empty time slot to add an event'))}</span>` : ''}</div>`;
  st.anim = '';

  root.innerHTML = html;
  initSegmented(root, (_, v) => { st.mode = v; renderCalendar(root); });
  root.querySelectorAll('[data-mine]').forEach((b) => b.addEventListener('click', () => { st.onlyMine = b.dataset.mine === '1'; renderCalendar(root); }));
  const nav = (dir) => {
    if (dir === 0) st.sel = todayISO();
    else if (st.mode === 'day') st.sel = addDays(st.sel, dir);
    else if (st.mode === 'week') st.sel = addDays(st.sel, 7 * dir);
    else { const d = parseISO(st.sel); st.sel = toISO(new Date(d.getFullYear(), d.getMonth() + dir, 1)); st.anim = dir > 0 ? 'cal-anim-next' : 'cal-anim-prev'; }
    renderCalendar(root);
  };
  root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => nav(Number(b.dataset.nav))));
  root.querySelectorAll('[data-goday]').forEach((b) => b.addEventListener('click', (e) => {
    // στο κινητό (μήνας) το πάτημα σε ημέρα απλώς την επιλέγει· αλλού ανοίγει την προβολή ημέρας
    if (st.mode === 'month' && window.innerWidth < 760 && !b.classList.contains('cal-more')) return;
    e.stopPropagation(); st.sel = b.dataset.goday; st.mode = 'day'; renderCalendar(root);
  }));
  root.querySelectorAll('.cal-cell').forEach((c) => {
    c.addEventListener('click', (e) => {
      if (e.target.closest('a,.cal-more')) return;
      const prevM = st.sel.slice(0, 7);
      st.sel = c.dataset.date;
      if (st.sel.slice(0, 7) !== prevM) st.anim = st.sel > prevM ? 'cal-anim-next' : 'cal-anim-prev';
      renderCalendar(root);
      if (window.innerWidth < 760) root.querySelector('.cal-daylist')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (admin) c.addEventListener('dblclick', (e) => { if (!e.target.closest('a')) location.hash = `#/new-event?date=${c.dataset.date}`; });
  });
  // κλικ σε κενή ώρα → νέα εκδήλωση εκείνη την ώρα (στρογγυλοποίηση στο μισάωρο)
  root.querySelectorAll('[data-slot]').forEach((col) => col.addEventListener('click', (e) => {
    if (e.target.closest('a')) return;
    const y = e.clientY - col.getBoundingClientRect().top;
    const m = Math.max(0, Math.min(23 * 60 + 30, Math.floor((y / HOUR) * 2) * 30));
    location.hash = `#/new-event?date=${col.dataset.day}&time=${hhmm(m)}`;
  }));
  // αρχική κύλιση στις 09:00 (ή στην πρώτη εκδήλωση της προβολής)
  const tgs = root.querySelector('#tgs');
  if (tgs) {
    const shown = st.mode === 'day' ? [st.sel] : Array.from({ length: 7 }, (_, i) => addDays(mondayOf(st.sel), i));
    const firstM = Math.min(...shown.flatMap((d) => (byDate[d] || []).map((v) => mins(v.e.event_time)).filter((x) => x != null)), 9 * 60);
    tgs.scrollTop = Math.max(0, (firstM / 60 - 1) * HOUR);
  }
  // swipe για αλλαγή περιόδου
  const sw = root.querySelector('#cal') || root.querySelector('.tg');
  if (sw) {
    let x0 = null, y0 = null;
    sw.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    sw.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) nav(dx < 0 ? 1 : -1);
      x0 = null;
    });
  }
}
