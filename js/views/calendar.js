// =====================================================================
//  Ημερολόγιο
// =====================================================================
import { L, esc, icon, toISO, parseISO, todayISO, monthName, fmtDateLong, fmtTime, LANG, DOW_SHORT_EL, DOW_SHORT_EN, segmented, initSegmented } from '../core.js';
import { S, isAdmin, allEventViews, myEventIds } from '../data.js';
import { pageHead } from '../layout.js';
import { eventRow, catShort } from '../components.js';

const st = { y: new Date().getFullYear(), m: new Date().getMonth(), sel: todayISO(), mode: 'month', onlyMine: false, anim: '' };

export function renderCalendar(root) {
  const admin = isAdmin();
  const mine = myEventIds();
  const views = allEventViews().filter((v) => (!admin || !st.onlyMine || mine.has(v.e.id)));
  const byDate = {};
  views.forEach((v) => { (byDate[v.e.event_date] ||= []).push(v); });

  const actions = `${segmented('mode', [{ v: 'month', label: L('Μήνας', 'Month') }, { v: 'list', label: L('Λίστα', 'List') }], st.mode)}
    ${admin ? `<a class="btn primary" href="#/new-event?date=${st.sel}">${icon('plus')} <span class="hide-mobile">${esc(L('Νέα εκδήλωση', 'New event'))}</span></a>` : ''}`;
  let html = pageHead(L('Ημερολόγιο', 'Calendar'), { actions });

  if (admin) html += `<div class="chips mb">
      <button class="chip ${!st.onlyMine ? 'on' : ''}" data-mine="0">${esc(L('Όλες οι εκδηλώσεις', 'All events'))}</button>
      <button class="chip ${st.onlyMine ? 'on' : ''}" data-mine="1">${esc(L('Μόνο όπου συμμετέχω', 'Only mine'))}</button></div>`;

  if (st.mode === 'month') {
    const first = new Date(st.y, st.m, 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(st.y, st.m, 1 - offset);
    const today = todayISO();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = toISO(d);
      const evs = byDate[iso] || [];
      const out = d.getMonth() !== st.m;
      if (i >= 35 && out && d.getDate() <= 7 && i % 7 === 0) break; // μην δείχνεις 6η άδεια εβδομάδα
      cells += `<div class="cal-cell ${out ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === st.sel ? 'sel' : ''}" data-date="${iso}" role="button" tabindex="0" aria-label="${esc(fmtDateLong(iso))}, ${evs.length}">
        <span class="num">${d.getDate()}</span>
        ${evs.slice(0, 3).map((v) => `<a class="cal-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}" title="${esc(v.title)}">${v.e.event_time ? esc(fmtTime(v.e.event_time)) + ' ' : ''}${esc(v.title)}</a>`).join('')}
        ${evs.length > 3 ? `<div class="cal-more">+${evs.length - 3} ${esc(L('ακόμη', 'more'))}</div>` : ''}
        <div class="cal-dots">${evs.slice(0, 4).map((v) => `<i class="cat-${v.e.category}" style="background:var(--c)"></i>`).join('')}</div>
      </div>`;
    }
    const dows = LANG === 'en' ? DOW_SHORT_EN : DOW_SHORT_EL;
    const monthCount = views.filter((v) => v.e.event_date.startsWith(`${st.y}-${String(st.m + 1).padStart(2, '0')}`) && v.e.status !== 'cancelled').length;
    html += `<div class="cal-head">
        <div class="cal-title">${esc(monthName(st.m))} ${st.y}</div>
        <span class="pill accent">${monthCount} ${esc(monthCount === 1 ? L('εκδήλωση', 'event') : L('εκδηλώσεις', 'events'))}</span>
        <div class="spacer" style="flex:1"></div>
        <button class="icon-btn filled" data-nav="-1" aria-label="${esc(L('Προηγούμενος μήνας', 'Previous month'))}">${icon('chevL')}</button>
        <button class="btn small" data-nav="0">${esc(L('Σήμερα', 'Today'))}</button>
        <button class="icon-btn filled" data-nav="1" aria-label="${esc(L('Επόμενος μήνας', 'Next month'))}">${icon('chevR')}</button>
      </div>
      <div class="cal" id="cal"><div class="cal-dow">${dows.map((d) => `<div>${esc(d)}</div>`).join('')}</div><div class="cal-grid ${st.anim}">${cells}</div></div>
      <div class="legend">${['wedding', 'baptism', 'wedding_baptism', 'promo', 'other'].map((c) => `<span><i class="cat-${c}" style="background:var(--c)"></i>${esc(catShort(c))}</span>`).join('')}</div>`;
    const dayEvs = byDate[st.sel] || [];
    html += `<div class="section-title"><h2 style="text-transform:capitalize">${esc(fmtDateLong(st.sel))}</h2>${admin ? `<a class="btn small" href="#/new-event?date=${st.sel}">${icon('plus')} ${esc(L('Νέα', 'New'))}</a>` : ''}</div>`;
    html += dayEvs.length ? `<div class="list">${dayEvs.map((v) => eventRow(v)).join('')}</div>` : `<div class="card pad muted center small">${esc(L('Καμία εκδήλωση αυτή την ημέρα.', 'No events on this day.'))}</div>`;
    st.anim = '';
  } else {
    const from = `${st.y}-${String(st.m + 1).padStart(2, '0')}-01`;
    const list = views.filter((v) => v.e.event_date >= from);
    if (!list.length) html += `<div class="card pad muted center">${esc(L('Καμία εκδήλωση από αυτόν τον μήνα και μετά.', 'No events from this month onwards.'))}</div>`;
    let lastMonth = '';
    let open = false;
    list.forEach((v) => {
      const mk = v.e.event_date.slice(0, 7);
      if (mk !== lastMonth) {
        if (open) html += '</div>';
        const [yy, mm] = mk.split('-').map(Number);
        html += `<div class="agenda-day">${esc(monthName(mm - 1))} ${yy}</div><div class="list">`;
        open = true; lastMonth = mk;
      }
      html += eventRow(v);
    });
    if (open) html += '</div>';
  }

  root.innerHTML = html;
  initSegmented(root, (_, v) => { st.mode = v; renderCalendar(root); });
  root.querySelectorAll('[data-mine]').forEach((b) => b.addEventListener('click', () => { st.onlyMine = b.dataset.mine === '1'; renderCalendar(root); }));
  const nav = (dir) => {
    if (dir === 0) { const t = new Date(); st.y = t.getFullYear(); st.m = t.getMonth(); st.sel = todayISO(); st.anim = ''; }
    else { const d = new Date(st.y, st.m + dir, 1); st.y = d.getFullYear(); st.m = d.getMonth(); st.anim = dir > 0 ? 'cal-anim-next' : 'cal-anim-prev'; st.sel = toISO(d); }
    renderCalendar(root);
  };
  root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => nav(Number(b.dataset.nav))));
  root.querySelectorAll('.cal-cell').forEach((c) => {
    c.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      st.sel = c.dataset.date;
      const d = parseISO(st.sel);
      if (d.getMonth() !== st.m) { st.y = d.getFullYear(); st.m = d.getMonth(); }
      renderCalendar(root);
      if (window.innerWidth < 760) root.querySelector('.section-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (admin) c.addEventListener('dblclick', (e) => { if (!e.target.closest('a')) location.hash = `#/new-event?date=${c.dataset.date}`; });
  });
  // swipe για αλλαγή μήνα
  const cal = root.querySelector('#cal');
  if (cal) {
    let x0 = null, y0 = null;
    cal.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    cal.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) nav(dx < 0 ? 1 : -1);
      x0 = null;
    });
  }
}
