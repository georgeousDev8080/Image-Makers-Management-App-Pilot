// =====================================================================
//  Next day / Ευχολόγιο
//  Συνδέονται με μια υπάρχουσα εκδήλωση και παίρνουν από εκεί πελάτη,
//  συνεργείο, κατηγορία κ.λπ. Υποχρεωτικά: εκδήλωση + ημερομηνία.
//  Προαιρετικά: ώρα, τοποθεσία (αν μείνει κενή, εμφανίζεται της εκδήλωσης).
// =====================================================================
import { matches, L, esc, icon, sheet, toast, toastErr, busy, confirmBox, actionSheet, todayISO, addDays, fmtDate, fmtDateLong, fmtTime, normTime, timeInputAttrs, CATEGORIES, sessionLabel, SESSION_KINDS, evEnd } from '../core.js';
import { S, isAdmin, eventView, allEventViews, saveSession, deleteSession, sessionsOf } from '../data.js';
import { go } from '../layout.js';
import { dateTile, avatar, withoutNextDay } from '../components.js';

const catLabel = (c) => { const o = CATEGORIES.find((x) => x.v === c); return o ? L(o.el, o.en).replace(/\s*\(.*\)$/, '') : ''; };
export const sessionEmoji = (k) => SESSION_KINDS.find((x) => x.v === k)?.emoji || '';
/** Τοποθεσία: η δική του, αλλιώς της εκδήλωσης */
export const sessionPlace = (x) => x.location || S.events.get(x.event_id)?.church_location || '';
/** «Next day · Τοποθεσία» */
export const sessionTitle = (x) => [sessionLabel(x.kind), sessionPlace(x)].filter(Boolean).join(' · ');
export const sessionTip = (x) => { const v = eventView(x.event_id); return [sessionLabel(x.kind), x.start_time ? fmtTime(x.start_time) : '', sessionPlace(x), v?.title, v ? `${catLabel(v.e.category)} ${fmtDate(v.e.event_date)}` : ''].filter(Boolean).join(' · '); };


/** Φόρμα νέου / επεξεργασίας Next day ή Ευχολογίου */
export function openSessionSheet({ kind = 'next_day', eventId = '', day = '', session = null } = {}) {
  if (!isAdmin()) return;
  const f = session ? { ...session, start_time: session.start_time ? String(session.start_time).slice(0, 5) : '' }
    : { kind, event_id: eventId, day, start_time: '', location: '', notes: '' };
  if (!f.day && f.event_id && f.kind === 'next_day') { const e = S.events.get(f.event_id); if (e) f.day = addDays(evEnd(e), 1); }
  const today = todayISO();
  // εκδηλώσεις που μπορούν να έχουν Next day / Ευχολόγιο: όχι ακυρωμένες, όχι γάμοι που στην προσφορά αφαιρέθηκε όλο το next day
  const views = allEventViews({ includeCancelled: false }).filter((v) => !withoutNextDay(v.e) || v.e.id === f.event_id);
  const near = (v) => Math.abs(new Date(v.e.event_date) - new Date(today)) / 864e5;
  const recent = views.filter((v) => v.e.event_date <= today && evEnd(v.e) >= addDays(today, -14)).sort((a, b) => near(a) - near(b));
  const soon = views.filter((v) => v.e.event_date > today && v.e.event_date <= addDays(today, 14)).sort((a, b) => near(a) - near(b));
  let q = '';
  const name = sessionLabel(f.kind);
  const evBtn = (v) => `<button type="button" class="row ev-pick" data-pick="${v.e.id}">${dateTile(v.e.event_date, v.e.category)}<div class="main-col"><div class="t">${esc([catLabel(v.e.category), v.e.church_location].filter(Boolean).join(' · '))}</div><div class="s">${esc([v.title, v.e.event_time ? fmtTime(v.e.event_time) : ''].filter(Boolean).join(' · '))}</div></div>${icon('chevR', 'chev')}</button>`;
  const listHTML = () => {
    if (q.trim()) {
      const hits = views.filter((v) => matches(q, v.title, v.e.church_location, v.e.reception_location, catLabel(v.e.category), fmtDate(v.e.event_date), v.c?.phone1, v.c?.phone2))
        .sort((a, b) => near(a) - near(b)).slice(0, 30);
      return hits.length ? `<div class="list">${hits.map(evBtn).join('')}</div>` : `<div class="card pad small muted">${esc(L('Δεν βρέθηκε εκδήλωση.', 'No event found.'))}</div>`;
    }
    const grp = (t, l) => (l.length ? `<div class="group-label">${esc(t)}</div><div class="list">${l.map(evBtn).join('')}</div>` : '');
    return grp(L('Τελευταίες 2 εβδομάδες', 'Last 2 weeks'), recent) + grp(L('Επόμενες 2 εβδομάδες', 'Next 2 weeks'), soon)
      || `<div class="card pad small muted">${esc(L('Καμία εκδήλωση τις τελευταίες / επόμενες 2 εβδομάδες. Χρησιμοποιήστε την αναζήτηση.', 'No events in the last / next 2 weeks. Use the search.'))}</div>`;
  };
  const body = document.createElement('div');
  const draw = () => {
    const parent = f.event_id ? eventView(f.event_id) : null;
    body.innerHTML = `<div class="form">
      <div class="banner">${icon('link')}<div><b>${esc(L(`Το ${name} συνδέεται με μια εκδήλωση`, `The ${name} is linked to an event`))}</b><span>${esc(L('Πελάτης, συνεργείο και στοιχεία παίρνονται από την εκδήλωση. Το συνεργείο της ειδοποιείται.', 'Client, crew and details come from the event. Its crew is notified.'))}</span></div></div>
      <div class="field"><label>${esc(L('Από ποια εκδήλωση είναι', 'Which event it belongs to'))} <span class="req">*</span></label>
      ${parent ? `<div class="card pad small sess-parent spread" style="align-items:flex-start;gap:10px"><div><b>${esc(parent.title)}</b><div class="muted">${esc([catLabel(parent.e.category), fmtDateLong(parent.e.event_date), parent.e.event_time ? fmtTime(parent.e.event_time) : '', parent.e.church_location].filter(Boolean).join(' · '))}</div>${parent.crew.length ? `<div class="muted">${esc(L('Συνεργείο', 'Crew'))}: ${esc(parent.crew.map((c) => (c.profile?.full_name || '').split(' ')[0]).filter(Boolean).join(', '))}</div>` : ''}</div>${session ? '' : `<button type="button" class="btn small" data-change>${esc(L('Αλλαγή', 'Change'))}</button>`}</div>`
        : `<div class="search">${icon('search')}<input class="input" id="evq" type="search" autocomplete="off" placeholder="${esc(L('Αναζήτηση: όνομα, τοποθεσία, ημερομηνία (π.χ. 12/06)…', 'Search: name, place, date (e.g. 12/06)…'))}" value="${esc(q)}"></div><div class="ev-pick-list mt-s" id="evl">${listHTML()}</div>`}
      </div>
      <div class="field"><label>${esc(L(`Ημερομηνία ${name}`, `${name} date`))} <span class="req">*</span></label><input class="input" type="date" name="day" value="${esc(f.day || '')}"></div>
      <div class="form-grid">
        <div class="field"><label>${esc(L('Ώρα (προαιρετικά)', 'Time (optional)'))}</label><input class="input" name="start_time" ${timeInputAttrs} value="${esc(f.start_time || '')}" placeholder="${esc(L('π.χ. 17:00', 'e.g. 17:00'))}"></div>
        <div class="field"><label>${esc(L('Τοποθεσία (προαιρετικά)', 'Location (optional)'))}</label><input class="input" name="location" maxlength="300" value="${esc(f.location || '')}" placeholder="${esc(parent?.e.church_location ? L(`Κενό = ${parent.e.church_location}`, `Empty = ${parent.e.church_location}`) : L('π.χ. Παραλία Πλαταμώνα', 'e.g. Platamonas beach'))}"></div>
      </div>
      <div class="field"><label>${esc(L('Σημειώσεις (προαιρετικά)', 'Notes (optional)'))}</label><textarea class="textarea" name="notes" style="min-height:60px">${esc(f.notes || '')}</textarea></div>
    </div>`;
    body.querySelectorAll('[name]').forEach((i) => i.addEventListener('input', () => {
      f[i.name] = i.value; i.classList.remove('invalid');
      if (i.name === 'day') f._autoDay = false;
    }));
    const bindPicks = () => body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      f.event_id = b.dataset.pick;
      const e = S.events.get(f.event_id);
      if (e && f.kind === 'next_day' && !session && (!f.day || f._autoDay)) { f.day = addDays(evEnd(e), 1); f._autoDay = true; }
      draw();
    }));
    const qEl = body.querySelector('#evq');
    qEl?.addEventListener('input', () => { q = qEl.value; qEl.classList.remove('invalid'); body.querySelector('#evl').innerHTML = listHTML(); bindPicks(); });
    bindPicks();
    body.querySelector('[data-change]')?.addEventListener('click', () => { f.event_id = ''; q = ''; draw(); body.querySelector('#evq')?.focus(); });
  };
  draw();
  const s = sheet({ title: session ? L(`Επεξεργασία ${name}`, `Edit ${name}`) : `${sessionEmoji(f.kind)} ${name}`, body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    let ok = true;
    const bad = (n) => { body.querySelector(`[name=${n}]`)?.classList.add('invalid'); ok = false; };
    if (!f.event_id) { body.querySelector('#evq')?.classList.add('invalid'); ok = false; }
    if (!f.day) bad('day');
    let t = null;
    if (String(f.start_time || '').trim()) { t = normTime(f.start_time); if (!t) bad('start_time'); }
    if (!ok) return toastErr(L('Συμπληρώστε τα υποχρεωτικά πεδία', 'Fill in the required fields'), L('Εκδήλωση και ημερομηνία είναι υποχρεωτικά· η ώρα γράφεται ως ΩΩ:ΛΛ.', 'Event and date are required; time as HH:MM.'));
    busy(btn, true);
    try {
      await saveSession({ id: session?.id, event_id: f.event_id, kind: f.kind, day: f.day, start_time: t, location: f.location, notes: f.notes });
      toast(session ? L('Οι αλλαγές αποθηκεύτηκαν', 'Changes saved') : L(`Το ${name} καταχωρήθηκε`, `${name} saved`), { body: `${fmtDate(f.day)}${t ? ' · ' + t : ''} · ${L('ενημερώθηκε το συνεργείο', 'crew notified')}` });
      s.close();
    } catch (e) { console.error(e); busy(btn, false); }
  });
}

/** Πάτημα σε Next day / Ευχολόγιο (ημερολόγιο, καρτέλα εκδήλωσης) */
export async function sessionActions(x) {
  if (!x) return;
  if (!isAdmin()) { go(`#/event/${x.event_id}`); return; }
  const r = await actionSheet({ title: `${sessionLabel(x.kind)} · ${fmtDateLong(x.day)}${x.start_time ? ' · ' + fmtTime(x.start_time) : ''}`, actions: [
    { label: L('Άνοιγμα εκδήλωσης', 'Open event'), value: 'open', icon: 'events' },
    { label: L('Επεξεργασία', 'Edit'), value: 'edit', icon: 'edit' },
    { label: L('Διαγραφή', 'Delete'), value: 'del', icon: 'trash', destructive: true },
  ] });
  if (r === 'open') go(`#/event/${x.event_id}`);
  if (r === 'edit') openSessionSheet({ session: x });
  if (r === 'del') {
    if (!await confirmBox(L(`Διαγραφή ${sessionLabel(x.kind)};`, `Delete ${sessionLabel(x.kind)}?`), `${fmtDate(x.day)} · ${sessionPlace(x)}`, { ok: L('Διαγραφή', 'Delete'), destructive: true })) return;
    try { await deleteSession(x.id); toast(L('Διαγράφηκε', 'Deleted')); } catch (e) { console.error(e); }
  }
}

/** Ενότητα στην καρτέλα εκδήλωσης */
export function sessionsSectionHTML(eventId) {
  const list = sessionsOf(eventId);
  const admin = isAdmin() && !withoutNextDay(S.events.get(eventId));
  if (!list.length && !admin) return '';
  return `<div class="group-label spread"><span>${esc(L('Next day / Ευχολόγιο', 'Next day / Blessing'))}</span>${admin ? `<span class="hstack" style="gap:6px"><button class="btn plain small" data-newsess="next_day">${icon('plus')} Next day</button><button class="btn plain small" data-newsess="blessing">${icon('plus')} ${esc(L('Ευχολόγιο', 'Blessing'))}</button></span>` : ''}</div>
    <div class="list">${list.map((x) => `<button class="row has-icon" data-sess="${x.id}"><span class="row-icon sess-ic ${x.kind}">${sessionEmoji(x.kind)}</span><div class="main-col"><div class="t">${esc(sessionTitle(x))}</div><div class="s">${esc([fmtDateLong(x.day), x.start_time ? fmtTime(x.start_time) : L('ώρα: δεν έχει οριστεί', 'time: not set'), x.notes].filter(Boolean).join(' · '))}</div></div>${admin ? icon('chevR', 'chev') : ''}</button>`).join('') || `<div class="row muted small">${esc(L('Δεν υπάρχει Next day ή Ευχολόγιο.', 'No Next day or blessing.'))}</div>`}</div>`;
}
export function bindSessionsSection(root, eventId) {
  root.querySelectorAll('[data-newsess]').forEach((b) => b.addEventListener('click', () => openSessionSheet({ kind: b.dataset.newsess, eventId })));
  root.querySelectorAll('[data-sess]').forEach((b) => b.addEventListener('click', () => sessionActions(S.sessions.find((x) => x.id === b.dataset.sess))));
}

/** Γραμμή λίστας (Αρχική) σε στυλ εκδήλωσης: τύπος · τοποθεσία, ώρα, από ποια εκδήλωση */
export function sessionRow(x) {
  const v = eventView(x.event_id);
  const crew = v ? v.crew.map((c) => avatar(c.profile, 'sm')).join('') : '';
  return `<a class="row event-card sess-row" href="#/event/${x.event_id}">
    ${dateTile(x.day, 'sess-' + x.kind)}
    <div class="main-col">
      <div class="t ev-big">${sessionEmoji(x.kind)} ${esc(sessionTitle(x))}</div>
      <div class="ev-when">${icon('clock')} ${esc(x.start_time ? fmtTime(x.start_time) : L('ώρα: ;', 'time: ?'))}</div>
      <div class="s">${esc(v ? `${v.title} · ${catLabel(v.e.category)} ${fmtDate(v.e.event_date)}` : '')}</div>
      ${crew ? `<div class="hstack" style="margin-top:5px;gap:6px"><span class="avatars">${crew}</span></div>` : ''}
    </div>
    ${icon('chevR', 'chev')}
  </a>`;
}
