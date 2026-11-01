// =====================================================================
//  Ημερολόγιο — σε στυλ Google Calendar
//  Προβολές: Ημέρα · Εβδομάδα · Μήνας · Πρόγραμμα (ώρες σε 24ωρη μορφή)
// =====================================================================
import { evDays, evEnd, isMultiDay, fmtDate, CATEGORIES, L, esc, icon, toISO, parseISO, todayISO, addDays, monthName, fmtDateLong, fmtTime, LANG, DOW_SHORT_EL, DOW_SHORT_EN, segmented, initSegmented } from '../core.js';
import { S, isAdmin, allEventViews, myEventIds, profileName, absenceWhen } from '../data.js';
import { openAbsenceSheet, absenceActions, absenceText, groupAbsences } from './absences.js';
import { pageHead } from '../layout.js';
import { eventRow, catShort } from '../components.js';

const catLabel = (c) => { const o = CATEGORIES.find((x) => x.v === c); return o ? L(o.el, o.en).replace(/\s*\(.*\)$/, '') : ''; };
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
  if (st.mode === 'year') return String(d.getFullYear());
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
  // ολοήμερη γραμμή: πολυήμερες εκδηλώσεις (ενωμένες σαν μπάρα), εκδηλώσεις χωρίς ώρα και απουσίες
  const adItems = spanItems().filter((it) => it.kind === 'abs' || it.multi || it.t == null);
  const { segs: adSegs, lanes: adLanes } = laneLayout(days, adItems);
  const hasAllDay = adSegs.length > 0;
  const allDay = `<div class="tg-adgrid" style="grid-template-columns:repeat(${days.length}, minmax(0, 1fr));grid-template-rows:repeat(${Math.max(1, adLanes)}, 24px)">${days.map((_, c) => `<span class="tg-adcol" style="grid-column:${c + 1};grid-row:1 / -1"></span>`).join('')}${adSegs.map((sg) => barHTML(sg, sg.lane + 1, false)).join('')}</div>`;
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="tg-h"><span>${h ? hhmm(h * 60) : ''}</span></div>`).join('');
  const cols = days.map((iso) => {
    const timed = (byDate[iso] || []).filter((v) => mins(v.e.event_time) != null && v.dayN === 1);
    const blocks = layout(timed).map(({ v, s, col, n }) => {
      const w = 100 / n;
      const loc = v.e.church_location || '';
      return `<a class="tg-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}" style="top:${(s / 60) * HOUR}px;height:${(DUR / 60) * HOUR - 2}px;left:calc(${col * w}% + 1px);width:calc(${w}% - 3px)" title="${esc(evTip(v))}">
        <b>${esc(evType(v))}</b><span>${esc(hhmm(s))}</span></a>`;
    }).join('');
    const nowLine = iso === today ? `<div class="tg-now" style="top:${(nowM / 60) * HOUR}px"></div>` : '';
    return `<div class="tg-col ${iso === today ? 'today' : ''}" data-day="${iso}" ${admin ? 'data-slot' : ''}>${blocks}${nowLine}</div>`;
  }).join('');
  return `<div class="tg ${days.length === 1 ? 'one' : ''}" style="--days:${days.length};--hour:${HOUR}px">
    <div class="tg-headrow"><div class="tg-gut"></div>${head}</div>
    ${hasAllDay ? `<div class="tg-adrow"><div class="tg-gut small muted">${esc(L('Ολοήμερα', 'All day'))}</div>${allDay}</div>` : ''}
    <div class="tg-scroll" id="tgs"><div class="tg-body"><div class="tg-hours">${hours}</div>${cols}</div></div>
  </div>`;
}

// απουσίες ανά ημέρα (οι διαχειριστές βλέπουν όλων, τα μέλη μόνο τις δικές τους)
const absBy = () => { const m = {}; S.absences.forEach((a) => { (m[a.day] ||= []).push(a); }); return m; };
const shortName = (id) => (profileName(S.profiles.find((p) => p.id === id) || (id === S.profile?.id ? S.profile : null)) || '').split(' ')[0];
const absChip = (a) => `<button type="button" class="cal-abs" data-abs="${a.id}" title="${esc(absenceText(a))}">🚫 ${esc(shortName(a.user_id))}${a.start_time ? ` <span class="t">${esc(absenceWhen([a]))}</span>` : ''}</button>`;
/** Στο ημερολόγιο φαίνεται ο τύπος της εκδήλωσης (το όνομα του πελάτη μένει στο αναδυόμενο κείμενο) */
const evType = (v) => `${v.dayIdx > 0 ? '↳ ' : ''}${[catLabel(v.e.category), v.e.church_location].filter(Boolean).join(' · ')}${v.dayN > 1 ? ` (${(v.dayIdx || 0) + 1}/${v.dayN})` : ''}`;
const evTip = (v) => [catLabel(v.e.category), v.e.event_time ? fmtTime(v.e.event_time) : '', v.e.church_location, v.title].filter(Boolean).join(' · ');
/** Όλα τα στοιχεία του ημερολογίου ως διαστήματα ημερών (εκδηλώσεις + απουσίες, οι πολυήμερες ενωμένες) */
let VIEWS = [];
function spanItems() {
  const out = VIEWS.map((v) => ({ kind: 'ev', v, start: v.e.event_date, end: evEnd(v.e), multi: isMultiDay(v.e), t: mins(v.e.event_time) }));
  groupAbsences(S.absences).forEach((g) => out.push({ kind: 'abs', g, start: g.from, end: g.to, multi: g.from !== g.to, t: mins(g.start_time) }));
  return out;
}
/** Τοποθέτηση σε «λωρίδες» για μια σειρά ημερών (όπως το Google Calendar): πρώτα οι πολυήμερες, μετά οι μονοήμερες */
function laneLayout(days, items) {
  const first = days[0], last = days[days.length - 1];
  const idx = (d) => days.indexOf(d);
  const segs = items.filter((it) => it.start <= last && it.end >= first).map((it) => ({
    ...it, c0: idx(it.start < first ? first : it.start), c1: idx(it.end > last ? last : it.end), contL: it.start < first, contR: it.end > last,
  }));
  segs.sort((a, b) => (b.multi - a.multi) || (a.c0 - b.c0) || ((b.c1 - b.c0) - (a.c1 - a.c0)) || ((a.kind === 'abs') - (b.kind === 'abs')) || ((a.t ?? -1) - (b.t ?? -1)));
  const lanes = [];
  segs.forEach((sg) => {
    let l = 0;
    while (lanes[l] && lanes[l].slice(sg.c0, sg.c1 + 1).some(Boolean)) l++;
    (lanes[l] ||= Array(days.length).fill(false));
    for (let c = sg.c0; c <= sg.c1; c++) lanes[l][c] = true;
    sg.lane = l;
  });
  return { segs, lanes: lanes.length };
}
function barHTML(sg, row, compact) {
  const style = `grid-column:${sg.c0 + 1} / ${sg.c1 + 2};grid-row:${row}`;
  const cls = `${sg.contL ? 'cl' : ''} ${sg.contR ? 'cr' : ''}`;
  if (sg.kind === 'abs') {
    const g = sg.g;
    return `<button type="button" class="mbar abs ${sg.multi ? 'span' : ''} ${cls}" style="${style}" data-abs="${g.id}" title="${esc(absenceText(g))}">🚫 ${esc(shortName(g.user_id))}${g.start_time ? ` <span class="t">${esc(absenceWhen([g]))}</span>` : ''}${g.note ? ` <span class="t">· ${esc(g.note)}</span>` : ''}</button>`;
  }
  const v = sg.v;
  const time = v.e.event_time && !sg.contL ? `<span class="t">${esc(fmtTime(v.e.event_time))}</span> ` : '';
  const label = [catLabel(v.e.category), v.e.church_location].filter(Boolean).join(' · ');
  return `<a class="mbar cat-${v.e.category} ${sg.multi ? 'span' : 'one'} ${v.e.status === 'cancelled' ? 'cancelled' : ''} ${cls}" style="${style}" href="#/event/${v.e.id}" title="${esc(evTip(v))}">${sg.multi ? '' : '<i></i>'}${compact ? '' : `${time}${esc(label)}`}</a>`;
}
function monthGrid(byDate, admin) {
  const AB = absBy();
  const sel = parseISO(st.sel); const y = sel.getFullYear(), m = sel.getMonth();
  const first = new Date(y, m, 1);
  const start = toISO(new Date(y, m, 1 - ((first.getDay() + 6) % 7)));
  const today = todayISO();
  const MAXL = 4; // ορατές λωρίδες ανά εβδομάδα (οι υπόλοιπες: «+Ν ακόμη»)
  const items = spanItems();
  let weeks = '';
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i));
    if (w >= 4 && parseISO(days[0]).getMonth() !== m) break;
    const { segs } = laneLayout(days, items);
    const hidden = Array(7).fill(0);
    segs.filter((sg) => sg.lane >= MAXL).forEach((sg) => { for (let c = sg.c0; c <= sg.c1; c++) hidden[c]++; });
    const cells = days.map((iso, c) => {
      const d = parseISO(iso); const out = d.getMonth() !== m;
      const evs = byDate[iso] || [];
      return `<div class="cal-cell ${out ? 'out' : ''} ${iso === today ? 'today' : ''} ${iso === st.sel ? 'sel' : ''}" style="grid-column:${c + 1};grid-row:1 / -1" data-date="${iso}" role="button" tabindex="0" aria-label="${esc(fmtDateLong(iso))}, ${evs.length}">
        <button class="num" data-goday="${iso}" tabindex="-1">${d.getDate()}</button>
        <div class="cal-dots">${evs.slice(0, 4).map((v) => `<i class="cat-${v.e.category}" style="background:var(--c)"></i>`).join('')}${(AB[iso] || []).length ? '<i class="abs-dot"></i>' : ''}</div></div>`;
    }).join('');
    const bars = segs.filter((sg) => sg.lane < MAXL).map((sg) => barHTML(sg, sg.lane + 2, false)).join('');
    const more = hidden.map((n, c) => (n ? `<button class="cal-more" style="grid-column:${c + 1};grid-row:${MAXL + 2}" data-goday="${days[c]}">+${n} ${esc(L('ακόμη', 'more'))}</button>` : '')).join('');
    weeks += `<div class="mweek">${cells}${bars}${more}</div>`;
  }
  let html = `<div class="cal" id="cal"><div class="cal-dow">${dows().map((d) => `<div>${esc(d)}</div>`).join('')}</div><div class="mweeks ${st.anim}">${weeks}</div></div>`;
  const dayEvs = byDate[st.sel] || [];
  html += `<div class="section-title cal-daylist"><h2 style="text-transform:capitalize">${esc(fmtDateLong(st.sel))}</h2>${admin ? `<a class="btn small" href="#/new-event?date=${st.sel}">${icon('plus')} ${esc(L('Νέα', 'New'))}</a>` : ''}</div>`;
  html += `<div class="cal-daylist">${dayEvs.length ? `<div class="list">${dayEvs.map((v) => eventRow(v)).join('')}</div>` : `<div class="card pad muted center small">${esc(L('Καμία εκδήλωση αυτή την ημέρα.', 'No events on this day.'))}</div>`}</div>`;
  const dayAbs = AB[st.sel] || [];
  if (dayAbs.length) html += `<div class="cal-daylist"><div class="group-label">${esc(L('Απουσίες', 'Absences'))}</div><div class="list">${dayAbs.map((a) => `<button class="row has-icon" data-abs="${a.id}"><span class="row-icon" style="background:var(--label-3)">🚫</span><div class="main-col"><div class="t">${esc(absenceText(a))}</div></div></button>`).join('')}</div></div>`;
  return html;
}

/** Προβολή «Χρόνος»: οι 12 μήνες της χρονιάς, κάθε ημέρα με εκδήλωση χρωματισμένη */
function yearGrid(byDate) {
  const y = parseISO(st.sel).getFullYear();
  const today = todayISO(); const AB = absBy(); const wd = dows();
  const months = Array.from({ length: 12 }, (_, m) => {
    const first = new Date(y, m, 1); const off = (first.getDay() + 6) % 7; const n = new Date(y, m + 1, 0).getDate();
    let cells = '';
    for (let i = 0; i < off; i++) cells += '<span></span>';
    for (let d = 1; d <= n; d++) {
      const iso = toISO(new Date(y, m, d)); const evs = byDate[iso] || []; const ab = (AB[iso] || []).length;
      const c = evs[0] ? `cat-${evs[0].e.category}` : '';
      cells += `<button type="button" class="yd ${c} ${evs.length ? 'has' : ''} ${evs.length > 1 ? 'many' : ''} ${ab ? 'abs' : ''} ${iso === today ? 'today' : ''}" data-yday="${iso}" title="${esc(`${fmtDateLong(iso)}${evs.length ? ` · ${evs.length} ${L('εκδηλώσεις', 'events')}` : ''}${ab ? ` · ${ab} ${L('απουσίες', 'absences')}` : ''}`)}">${d}</button>`;
    }
    const count = Object.keys(byDate).filter((k) => k.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).reduce((a, k) => a + byDate[k].filter((v) => !v.dayIdx).length, 0);
    return `<div class="ym"><button type="button" class="ym-h" data-ymonth="${m}">${esc(monthName(m))}${count ? ` <span class="pill accent">${count}</span>` : ''}</button>
      <div class="ym-g">${wd.map((x) => `<span class="dw">${esc(x.slice(0, 1))}</span>`).join('')}${cells}</div></div>`;
  }).join('');
  return `<div class="year-grid ${st.anim}">${months}</div>`;
}

function schedule(views) {
  const from = st.sel < todayISO() ? st.sel : todayISO();
  const list = views.filter((v) => evEnd(v.e) >= from).sort((a, b) => a.e.event_date.localeCompare(b.e.event_date) || (mins(a.e.event_time) ?? -1) - (mins(b.e.event_time) ?? -1));
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
      <a class="sch-ev cat-${v.e.category} ${v.e.status === 'cancelled' ? 'cancelled' : ''}" href="#/event/${v.e.id}"><i></i><span class="sch-t">${esc(v.e.event_time ? fmtTime(v.e.event_time) : L('Χωρίς ώρα', 'No time'))}</span><span class="sch-n"><b>${esc(evType(v))}</b>${isMultiDay(v.e) ? `<small>${esc(L(`έως ${fmtDate(v.e.end_date)}`, `until ${fmtDate(v.e.end_date)}`))}</small>` : ''}</span></a>
    </div>`;
  });
  return html + '</div>';
}

export function renderCalendar(root) {
  const admin = isAdmin();
  const mine = myEventIds();
  const views = allEventViews().filter((v) => (!admin || !st.onlyMine || mine.has(v.e.id)));
  const byDate = {};
  // πολυήμερες: εμφανίζονται σε κάθε ημέρα τους (dayIdx / dayN)
  views.forEach((v) => { const ds = evDays(v.e); ds.forEach((d, i) => { (byDate[d] ||= []).push({ ...v, dayIdx: i, dayN: ds.length }); }); });
  VIEWS = views;

  const modes = [{ v: 'day', label: L('Ημέρα', 'Day') }, { v: 'week', label: L('Εβδομάδα', 'Week') }, { v: 'month', label: L('Μήνας', 'Month') }, { v: 'year', label: L('Χρόνος', 'Year') }, { v: 'list', label: L('Πρόγραμμα', 'Schedule') }];
  const actions = `<button class="btn" data-absence>🚫 <span class="hide-mobile">${esc(L('Δήλωση απουσίας', 'Declare absence'))}</span></button>${admin ? `<a class="btn primary" href="#/new-event?date=${st.sel}">${icon('plus')} <span class="hide-mobile">${esc(L('Νέα εκδήλωση', 'New event'))}</span></a>` : ''}`;
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
  else if (st.mode === 'year') html += yearGrid(byDate);
  else html += schedule(views);
  if (st.mode !== 'list') html += `<div class="legend">${['wedding', 'baptism', 'wedding_baptism', 'promo', 'other'].map((c) => `<span><i class="cat-${c}" style="background:var(--c)"></i>${esc(catShort(c))}</span>`).join('')}${admin && (st.mode === 'day' || st.mode === 'week') ? `<span class="muted">${esc(L('Πατήστε σε κενή ώρα για νέα εκδήλωση', 'Tap an empty time slot to add an event'))}</span>` : ''}</div>`;
  st.anim = '';

  root.innerHTML = html;
  initSegmented(root, (_, v) => { st.mode = v; renderCalendar(root); });
  root.querySelector('[data-absence]')?.addEventListener('click', () => openAbsenceSheet({ day: st.sel }));
  root.querySelectorAll('[data-abs]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); absenceActions(S.absences.find((a) => a.id === b.dataset.abs)); }));
  root.querySelectorAll('[data-yday]').forEach((b) => b.addEventListener('click', () => { st.sel = b.dataset.yday; st.mode = 'day'; renderCalendar(root); }));
  root.querySelectorAll('[data-ymonth]').forEach((b) => b.addEventListener('click', () => { const d = parseISO(st.sel); st.sel = toISO(new Date(d.getFullYear(), Number(b.dataset.ymonth), 1)); st.mode = 'month'; renderCalendar(root); }));
  root.querySelectorAll('[data-mine]').forEach((b) => b.addEventListener('click', () => { st.onlyMine = b.dataset.mine === '1'; renderCalendar(root); }));
  const nav = (dir) => {
    if (dir === 0) st.sel = todayISO();
    else if (st.mode === 'day') st.sel = addDays(st.sel, dir);
    else if (st.mode === 'week') st.sel = addDays(st.sel, 7 * dir);
    else if (st.mode === 'year') { const d = parseISO(st.sel); st.sel = toISO(new Date(d.getFullYear() + dir, d.getMonth(), 1)); st.anim = dir > 0 ? 'cal-anim-next' : 'cal-anim-prev'; }
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
    const firstM = Math.min(...shown.flatMap((d) => (byDate[d] || []).filter((v) => !v.dayIdx).map((v) => mins(v.e.event_time)).filter((x) => x != null)), 9 * 60);
    tgs.scrollTop = Math.max(0, (firstM / 60 - 1) * HOUR);
  }
  // swipe για αλλαγή περιόδου
  const sw = root.querySelector('#cal') || root.querySelector('.tg') || root.querySelector('.year-grid');
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
