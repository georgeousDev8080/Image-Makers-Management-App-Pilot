// =====================================================================
//  Αρχική
// =====================================================================
import { L, vocative, esc, icon, money, fmtDateLong, fmtTime, todayISO, daysBetween, sum, addDays, isIOS, isStandalone } from '../core.js';
import { S, isAdmin, isVideoAdmin, allEventViews, profileName, myEventIds, pendingAppointments, staleAppointments, pendingMessages, pendingUsers, unreadCount } from '../data.js';
import { wfLevel } from './workflow.js';
import { newAppointmentChooser } from './appointments.js';
import { pageHead } from '../layout.js';
import { eventRow } from '../components.js';
import { openIncomeForm, openExpenseForm } from './money.js';
import { pushState } from '../push.js';

export function renderHome(root) {
  const admin = isAdmin();
  const today = todayISO();
  const h = new Date().getHours();
  const hello = h < 12 ? L('Καλημέρα', 'Good morning') : h < 18 ? L('Καλησπέρα', 'Good afternoon') : L('Καλό βράδυ', 'Good evening');
  const first = vocative(profileName(S.profile));
  const mine = myEventIds();
  const all = allEventViews({ includeCancelled: false });
  const visible = admin ? all : all.filter((v) => mine.has(v.e.id));
  const upcoming = visible.filter((v) => v.e.event_date >= today);
  const next = upcoming[0];

  let html = pageHead(`${hello}, ${first}`, { sub: esc(fmtDateLong(today)) });
  html += '<div id="banners"></div>';

  if (next) {
    const d = daysBetween(today, next.e.event_date);
    html += `<a class="hero-card" href="#/event/${next.e.id}">
      <div class="count"><b>${d}</b><span>${esc(d === 1 ? L('ημέρα', 'day') : L('ημέρες', 'days'))}</span></div>
      <div class="eyebrow">${esc(admin ? L('Επόμενη εκδήλωση', 'Next event') : L('Η επόμενη εκδήλωσή σου', 'Your next event'))}</div>
      <h2>${esc(next.title)}</h2>
      <div class="meta"><span>${icon('calendar')} ${esc(fmtDateLong(next.e.event_date))}</span>${next.e.event_time ? `<span>${icon('clock')} ${esc(fmtTime(next.e.event_time))}</span>` : ''}${next.e.church_location ? `<span>${icon('pin')} ${esc(next.e.church_location)}</span>` : ''}</div>
    </a>`;
  } else {
    html += `<div class="hero-card"><div class="eyebrow">Image Makers</div><h2>${esc(admin ? L('Δεν υπάρχουν προγραμματισμένες εκδηλώσεις', 'No upcoming events') : L('Δεν σου έχει ανατεθεί ακόμη εκδήλωση', 'No events assigned to you yet'))}</h2></div>`;
  }

  if (admin) {
    // Χρειάζεται προσοχή
    const todo = [];
    const sa = staleAppointments().length; if (sa) todo.push({ h: '#/appointments', i: 'handshake', c: 'var(--orange)', t: L(`${sa} ραντεβού χωρίς απάντηση πάνω από 10 ημέρες`, `${sa} appointments without an answer for 10+ days`) });
    const pa = pendingAppointments().length - sa; if (pa > 0) todo.push({ h: '#/appointments', i: 'handshake', c: 'var(--blue)', t: L(`${pa} προσφορές σε αναμονή απάντησης`, `${pa} offers waiting for an answer`) });
    const wl = all.filter((v) => wfLevel(v.e, today).level === 'late').length; if (wl) todo.push({ h: '#/workflow', i: 'flow', c: 'var(--red)', t: L(`${wl} εργασίες με μεγάλη καθυστέρηση (φωτογραφίες)`, `${wl} jobs with a long delay (photos)`) });
    const pm = pendingMessages().length; if (pm) todo.push({ h: '#/outbox', i: 'message', c: 'var(--accent)', t: L(`${pm} μηνύματα προς πελάτες για αποστολή`, `${pm} client messages to send`) });
    const pu = pendingUsers().length; if (pu) todo.push({ h: '#/team', i: 'shield', c: 'var(--purple)', t: L(`${pu} νέοι λογαριασμοί περιμένουν ρόλο`, `${pu} new accounts need a role`) });
    if (isVideoAdmin()) {
      const sos = all.filter((v) => ['lab', 'ready', 'delivered'].includes(v.e.photo_status) && v.e.editing_status !== 'done').length;
      if (sos) todo.push({ h: '#/sheets/mitsos', i: 'warning', c: 'var(--red)', t: L(`${sos} SOS στο Mitsos — το album πάει για εκτύπωση`, `${sos} SOS in Mitsos — album going to print`) });
    }
    const noCrew = upcoming.filter((v) => daysBetween(today, v.e.event_date) <= 21 && !v.crew.length).length;
    if (noCrew) todo.push({ h: '#/events?filter=nocrew', i: 'users', c: 'var(--orange)', t: L(`${noCrew} εκδηλώσεις τις επόμενες 3 εβδομάδες χωρίς συνεργείο`, `${noCrew} events in the next 3 weeks without crew`) });
    const overdue = all.filter((v) => v.e.event_date < today && v.price && v.balance > 0.009).length;
    if (overdue) todo.push({ h: '#/sheets/payments?unpaid=1', i: 'euro', c: 'var(--red)', t: L(`${overdue} περασμένες εκδηλώσεις με υπόλοιπο`, `${overdue} past events with a balance`) });
    const noOffer = upcoming.filter((v) => !v.e.offer_path).length;
    if (noOffer) todo.push({ h: '#/sheets/checks', i: 'doc', c: 'var(--label-2)', t: L(`${noOffer} μελλοντικές εκδηλώσεις χωρίς PDF προσφοράς`, `${noOffer} upcoming events without an offer PDF`) });
    if (todo.length) {
      html += `<div class="section-title"><h2>${esc(L('Χρειάζονται προσοχή', 'Needs attention'))}</h2></div><div class="list">${todo.map((x) => `<a class="row has-icon" href="${x.h}"><span class="row-icon" style="background:${x.c}">${icon(x.i)}</span><div class="main-col"><div class="t">${esc(x.t)}</div></div>${icon('chevR', 'chev')}</a>`).join('')}</div>`;
    }

    // Γρήγορες ενέργειες
    html += `<div class="section-title"><h2>${esc(L('Γρήγορες ενέργειες', 'Quick actions'))}</h2></div>
      <div class="grid cols-4">
        <button class="kpi" data-act="appt" style="text-align:left;border:0"><div class="k-label" style="color:var(--accent)">${icon('plus')} ${esc(L('Νέο ραντεβού', 'New appointment'))}</div><div class="k-sub">${esc(L('Παρουσίαση στο μαγαζί ή link', 'In store or by link'))}</div></button>
        <button class="kpi" data-act="income" style="text-align:left;border:0"><div class="k-label" style="color:var(--green)">${icon('incoming')} ${esc(L('Νέο έσοδο', 'New income'))}</div><div class="k-sub">${esc(L('Προκαταβολή ή δόση', 'Deposit or installment'))}</div></button>
        <button class="kpi" data-act="expense" style="text-align:left;border:0"><div class="k-label" style="color:var(--red)">${icon('outgoing')} ${esc(L('Νέο έξοδο', 'New expense'))}</div><div class="k-sub">${esc(L('Μισθοδοσία, μεροκάματο, μαγαζί…', 'Payroll, wages, shop…'))}</div></button>
        <a class="kpi" href="#/sheets" style="display:block"><div class="k-label" style="color:var(--blue)">${icon('table')} ${esc(L('Φύλλα (Excel)', 'Sheets (Excel)'))}</div><div class="k-sub">${esc(L('Όλα τα δεδομένα σε πίνακες', 'All data in tables'))}</div></a>
      </div>`;

    // Οικονομικά έτους
    const y = String(new Date().getFullYear());
    const yearEvents = all.filter((v) => v.e.event_date.startsWith(y));
    const pkg = sum(yearEvents, (v) => v.price || 0);
    const collected = sum(S.payments.filter((p) => (p.paid_on || '').startsWith(y)), (p) => p.amount);
    const spent = sum(S.expenses.filter((x) => (x.paid_on || '').startsWith(y)), (x) => x.amount);
    const open = sum(all.filter((v) => v.e.event_date.startsWith(y)), (v) => Math.max(0, v.balance || 0));
    const m = todayISO().slice(0, 7);
    const inM = sum(S.payments.filter((p) => (p.paid_on || '').startsWith(m)), (p) => p.amount);
    const outM = sum(S.expenses.filter((x) => (x.paid_on || '').startsWith(m)), (x) => x.amount);
    html += `<div class="section-title"><h2>${esc(L(`Οικονομικά ${y}`, `Finances ${y}`))}</h2><a href="#/sheets/dashboard" class="small">${esc(L('Dashboard', 'Dashboard'))} ${icon('chevR')}</a></div>
      <div class="grid cols-4">
        <div class="kpi accent"><div class="k-label">${icon('events')} ${esc(L('Εκδηλώσεις', 'Events'))}</div><div class="k-value">${yearEvents.length}</div><div class="k-sub">${esc(L('Αξία πακέτων', 'Package value'))}: ${esc(money(pkg, { dec: 0 }))}</div></div>
        <div class="kpi"><div class="k-label">${icon('incoming')} ${esc(L('Εισπράχθηκαν', 'Collected'))}</div><div class="k-value pos">${esc(money(collected, { dec: 0 }))}</div><div class="k-sub">${esc(L('Αυτόν τον μήνα', 'This month'))}: ${esc(money(inM, { dec: 0 }))}</div></div>
        <div class="kpi"><div class="k-label">${icon('outgoing')} ${esc(L('Έξοδα', 'Expenses'))}</div><div class="k-value neg">${esc(money(spent, { dec: 0 }))}</div><div class="k-sub">${esc(L('Αυτόν τον μήνα', 'This month'))}: ${esc(money(outM, { dec: 0 }))}</div></div>
        <div class="kpi"><div class="k-label">${icon('euro')} ${esc(L('Ανοιχτό υπόλοιπο', 'Open balance'))}</div><div class="k-value">${esc(money(open, { dec: 0 }))}</div><div class="k-sub">${esc(L('Καθαρό ταμείο', 'Net cash'))}: ${esc(money(collected - spent, { dec: 0 }))}</div></div>
      </div>`;
  } else {
    const un = unreadCount();
    if (un) html += `<div class="list mt"><a class="row has-icon" href="#/notifications"><span class="row-icon" style="background:var(--blue)">${icon('bell')}</span><div class="main-col"><div class="t">${esc(L(`${un} νέες ειδοποιήσεις`, `${un} new notifications`))}</div></div>${icon('chevR', 'chev')}</a></div>`;
  }

  const list = upcoming.slice(0, admin ? 8 : 20);
  html += `<div class="section-title"><h2>${esc(admin ? L('Επόμενες εκδηλώσεις', 'Upcoming events') : L('Οι επόμενες εκδηλώσεις μου', 'My upcoming events'))}</h2><a href="#/calendar" class="small">${esc(L('Ημερολόγιο', 'Calendar'))} ${icon('chevR')}</a></div>`;
  html += list.length ? `<div class="list">${list.map((v) => eventRow(v)).join('')}</div>` : `<div class="card pad muted center">${esc(L('Καμία επερχόμενη εκδήλωση.', 'No upcoming events.'))}</div>`;

  root.innerHTML = html;
  root.querySelector('[data-act="appt"]')?.addEventListener('click', () => newAppointmentChooser());
  root.querySelector('[data-act="income"]')?.addEventListener('click', () => openIncomeForm({}));
  root.querySelector('[data-act="expense"]')?.addEventListener('click', () => openExpenseForm({}));

  // Banners: εγκατάσταση / ειδοποιήσεις
  (async () => {
    const b = root.querySelector('#banners'); if (!b) return;
    const st = await pushState().catch(() => 'unsupported');
    let out = '';
    if (st === 'ios-install') out += `<a class="banner" href="#/help/install">${icon('install')}<div><b>${esc(L('Προσθέστε την εφαρμογή στην οθόνη Αφετηρίας', 'Add the app to your Home Screen'))}</b><span>${esc(L('Στο iPhone οι ειδοποιήσεις λειτουργούν μόνο έτσι. Πατήστε για οδηγίες.', 'On iPhone, notifications only work this way. Tap for instructions.'))}</span></div></a>`;
    else if (st === 'default') out += `<a class="banner" href="#/settings">${icon('bell')}<div><b>${esc(L('Ενεργοποιήστε τις ειδοποιήσεις', 'Turn on notifications'))}</b><span>${esc(L('Για να μαθαίνετε αμέσως αναθέσεις, αλλαγές και πληρωμές.', 'To hear about assignments, changes and payments right away.'))}</span></div></a>`;
    else if (st === 'denied') out += `<a class="banner red" href="#/help/notifications">${icon('bell')}<div><b>${esc(L('Οι ειδοποιήσεις είναι μπλοκαρισμένες', 'Notifications are blocked'))}</b><span>${esc(L('Πατήστε για να δείτε πώς θα τις ξαναενεργοποιήσετε.', 'Tap to see how to turn them back on.'))}</span></div></a>`;
    else if (st === 'server-missing' && admin) out += `<a class="banner" href="#/settings">${icon('sparkles')}<div><b>${esc(L('Ολοκληρώστε τη ρύθμιση ειδοποιήσεων', 'Finish notification setup'))}</b><span>${esc(L('Ένα κλικ στις Ρυθμίσεις → Ειδοποιήσεις push για όλη την ομάδα.', 'One click in Settings → Push for the whole team.'))}</span></div></a>`;
    if (!S.online) out += `<div class="banner red">${icon('warning')}<div><b>${esc(L('Χωρίς σύνδεση', 'Offline'))}</b><span>${esc(L('Βλέπετε τα τελευταία αποθηκευμένα δεδομένα.', 'You are seeing the last saved data.'))}</span></div></div>`;
    b.innerHTML = out;
  })();
}
