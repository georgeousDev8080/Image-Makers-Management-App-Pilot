// =====================================================================
//  Προσφορές / Ραντεβού
//  · Παρουσίαση στο μαγαζί (συμπληρώνουμε μαζί τον Οδηγό προσφοράς)
//  · Ηλεκτρονική παρουσίαση (το ζευγάρι συμπληρώνει τη σελίδα προσφοράς)
//  Confirm → δημιουργία εκδήλωσης · Reject → μένει ως στατιστικό
// =====================================================================
import { L, esc, icon, money, fmtDate, todayISO, daysBetween, matches, lbl, sum, CATEGORIES, APPT_MODES, REJECT_REASONS, MONTHS_EL_UP, monthShort, sheet, actionSheet, confirmBox, toast, toastErr, busy, copyText, smsUrl, mailUrl, waUrl, viberUrl, telUrl, segmented, initSegmented, parseMoney } from '../core.js';
import { S, isStaleAppt, STALE_DAYS, saveAppointment, deleteAppointment, uploadAppointmentOffer, openOffer, offerUrl, business, eventView } from '../data.js';
import { pageHead, emptyState, setTopActions, go, backBtn } from '../layout.js';
import { catPill, catShort, packageNameFrom, offerSummaryHTML } from '../components.js';
import { openOfferBuilder, generateOfferPdf, requestToOfferState, pickPdfFile, offerIsStale, refreshOfferPdf, offerKindFor, offerKindOf } from '../offer.js';
import { clientPageUrl, downloadClientFile } from './requests.js';
import { barPairs, hbars, bindTips } from '../charts.js';

const st = { mode: 'store', view: 'list', status: 'all', q: '', year: null };

export const apptName = (a) => [a.name1, a.name2].filter(Boolean).join(' & ') || L('Χωρίς όνομα', 'No name');
const ageDays = (a) => Math.floor((Date.now() - new Date(a.status_at).getTime()) / 864e5);

function apptToRequest(a) {
  return { partner1: a.name1, partner2: a.name2, phone1: a.phone, phone2: '', email: a.email, wedding_date: a.event_date, church: a.church, church_time: a.church_time, reception: a.reception, reception_time: a.reception_time, selections: a.selections, client_total: a.total };
}
function offerPrefill(a) {
  const base = a.offer_data || (a.selections ? requestToOfferState(apptToRequest(a)) : {});
  return {
    ...base,
    partner1: a.name1 || '', partner2: a.name2 || '', phone1: a.phone || '', phone2: base.phone2 || '',
    eventDate: a.event_date || '', church: [a.church, a.church_time].filter(Boolean).join(' · '),
    reception: [a.reception, a.reception_time].filter(Boolean).join(' · '),
    city: base.city || (a.church || '').split(',').slice(1).join(',').trim(),
  };
}

// ---------------------------------------------------------------------
//  Σελίδα
// ---------------------------------------------------------------------
export function renderAppointments(root) {
  if (!st.year) st.year = new Date().getFullYear();
  setTopActions(`<button class="btn primary small" data-new>${icon('plus')} <span class="hide-mobile">${esc(L('Νέο ραντεβού', 'New appointment'))}</span></button>`);
  let html = pageHead(L('Προσφορές / Ραντεβού', 'Offers / Appointments'), { sub: esc(L('Κάθε παρουσίαση προσφοράς, στο μαγαζί ή ηλεκτρονικά. Confirm = κλείσαμε τη δουλειά.', 'Every offer presentation, in store or online. Confirm = the job is booked.')) });

  // Τα δύο μεγάλα παράθυρα
  html += `<div class="appt-modes">${APPT_MODES.map((m) => {
    const list = S.appointments.filter((a) => a.mode === m.v);
    const c = (s) => list.filter((a) => a.status === s).length;
    const decided = c('confirmed') + c('rejected');
    const stale = list.filter(isStaleAppt).length;
    return `<button class="appt-mode ${st.mode === m.v ? 'on' : ''}" data-mode="${m.v}">
      <span class="am-ic">${icon(m.icon)}</span>
      <span class="am-t">${esc(L(m.el, m.en))}</span>
      <span class="am-n">${list.length}<small>${esc(L('ραντεβού', 'appointments'))}</small></span>
      <span class="am-stats"><i class="ok">${c('confirmed')} confirmed</i><i class="no">${c('rejected')} rejected</i><i class="wait">${c('pending')} ${esc(L('σε αναμονή', 'pending'))}</i>${stale ? `<i class="stale">${stale} ${esc(L('χωρίς απάντηση', 'no answer'))}</i>` : ''}</span>
      <span class="am-rate">${decided ? Math.round((c('confirmed') / decided) * 100) + '%' : '—'}<small>${esc(L('κλείσιμο', 'win rate'))}</small></span>
    </button>`;
  }).join('')}</div>`;

  html += `<div class="spread mb" style="flex-wrap:wrap;gap:10px">${segmented('v', [{ v: 'list', label: L('Λίστα ραντεβού', 'Appointments') }, { v: 'stats', label: L('Στατιστικά', 'Statistics') }], st.view)}
    ${st.mode === 'online' ? `<button class="btn small" data-link>${icon('link')} ${esc(L('Αποστολή link σε πελάτη', 'Send link to client'))}</button>` : `<button class="btn small" data-store>${icon('plus')} ${esc(L('Νέα παρουσίαση στο μαγαζί', 'New in-store presentation'))}</button>`}</div>`;
  html += '<div id="apBody"></div>';
  root.innerHTML = html;

  const body = root.querySelector('#apBody');
  (st.view === 'stats' ? statsView : listView)(body, () => renderAppointments(root));

  initSegmented(root, (name, v) => { if (name === 'v') { st.view = v; renderAppointments(root); } });
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.mode = b.dataset.mode; renderAppointments(root); }));
  document.querySelector('[data-new]')?.addEventListener('click', () => newAppointmentChooser());
  root.querySelector('[data-link]')?.addEventListener('click', () => openSendLink());
  root.querySelector('[data-store]')?.addEventListener('click', () => go('#/appointment-new'));
}

export async function newAppointmentChooser() {
  const v = await actionSheet({ title: L('Νέο ραντεβού / προσφορά', 'New appointment / offer'), actions: [
    { label: L('Παρουσίαση από κοντά (στο μαγαζί)', 'In-person presentation (in store)'), icon: 'store', value: 'store' },
    { label: L('Αποστολή ηλεκτρονικά (link στον πελάτη)', 'Send online (link to the client)'), icon: 'link', value: 'online' },
  ] });
  if (v === 'store') go('#/appointment-new');
  if (v === 'online') openSendLink();
}

// ---------------------------------------------------------------------
//  Λίστα
// ---------------------------------------------------------------------
function rowState(a) {
  if (a.status === 'rejected') return 'rejected';
  if (a.status === 'confirmed') return 'confirmed';
  if (isStaleAppt(a)) return 'stale';
  return 'pending';
}

function listView(body, redraw) {
  const all = S.appointments.filter((a) => a.mode === st.mode);
  const n = (f) => all.filter(f).length;
  let list = all.filter((a) => (st.status === 'all' || (st.status === 'stale' ? isStaleAppt(a) : a.status === st.status))
    && matches(st.q, a.name1, a.name2, a.phone, a.email, a.church, a.reception, a.comments, a.notes, fmtDate(a.event_date), fmtDate(a.appt_date)));
  list = [...list].sort((a, b) => b.appt_date.localeCompare(a.appt_date) || b.created_at.localeCompare(a.created_at));
  const chips = [
    ['all', L('Όλα', 'All'), all.length], ['pending', L('Σε αναμονή', 'Pending'), n((a) => a.status === 'pending')],
    ['stale', L(`Χωρίς απάντηση ${STALE_DAYS}+ ημ.`, `No answer ${STALE_DAYS}+ days`), n(isStaleAppt)],
    ['confirmed', 'Confirmed', n((a) => a.status === 'confirmed')], ['rejected', 'Rejected', n((a) => a.status === 'rejected')],
  ];
  let html = `<div class="sheet-toolbar"><div class="search">${icon('search')}<input class="input" id="aq" type="search" placeholder="${esc(L('Αναζήτηση (όνομα, κινητό, εκκλησία…)', 'Search (name, phone, church…)'))}" value="${esc(st.q)}"></div>
    <div class="chips">${chips.map(([v, t, c]) => `<button class="chip ${st.status === v ? 'on' : ''}" data-st="${v}">${esc(t)} <b>${c}</b></button>`).join('')}</div></div>`;
  if (!list.length) {
    html += emptyState(st.mode === 'online' ? 'link' : 'store', L('Δεν υπάρχουν ραντεβού εδώ', 'No appointments here'),
      st.mode === 'online' ? L('Στείλτε το link της προσφοράς στο ζευγάρι. Μόλις το συμπληρώσει, εμφανίζεται εδώ αυτόματα με ειδοποίηση.', 'Send the offer link to the couple. When they fill it in, it appears here automatically with a notification.')
        : L('Πατήστε «Νέα παρουσίαση στο μαγαζί» όταν έρθει ένα ζευγάρι για προσφορά.', 'Tap “New in-store presentation” when a couple visits for an offer.'));
  } else {
    html += `<div class="appt-table" role="table">
      <div class="at-head" role="row"><span>${esc(L('Ραντεβού', 'Appointment'))}</span><span>${esc(L('Κατηγορία', 'Category'))}</span><span>${esc(L('Ονοματεπώνυμο', 'Name'))}</span><span>${esc(L('Κινητό', 'Mobile'))}</span><span>${esc(L('Εκδήλωση', 'Event'))}</span><span>PDF</span><span>${esc(L('Απόφαση', 'Decision'))}</span></div>
      ${list.map((a) => {
        const s = rowState(a);
        const decision = s === 'rejected' ? `<span class="pill red">Rejected</span>`
          : s === 'confirmed' ? (a.event_id && S.events.has(a.event_id) ? `<a class="pill green" href="#/event/${a.event_id}">✓ Confirmed</a>` : `<span class="pill green">✓ Confirmed</span><button class="btn tiny primary" data-mkev="${a.id}">${esc(L('Δημιουργία εκδήλωσης', 'Create event'))}</button>`)
          : `<button class="btn tiny danger-soft" data-rej="${a.id}">${icon('x')} Reject</button><button class="btn tiny success" data-conf="${a.id}">${icon('check')} Confirm</button>`;
        const pdf = a.offer_path ? `<button class="pdf-btn" data-pdf="${a.id}">${icon('doc')}PDF</button>`
          : (a.selections || a.offer_data) ? `<button class="pdf-btn" data-gen="${a.id}" title="${esc(L('Δημιουργία PDF από τις επιλογές', 'Create PDF from the choices'))}">${icon('wand')}PDF</button>`
          : `<button class="pdf-btn" data-mkpdf="${a.id}" style="color:var(--label-3)" title="${esc(L('Δημιουργία προσφοράς', 'Create offer'))}">${icon('plus')}</button>`;
        return `<div class="at-row ${s}" role="row" data-open="${a.id}">
          <span class="at-date"><b>${esc(fmtDate(a.appt_date))}</b>${s === 'stale' ? `<small class="stale-tag">${esc(L(`${ageDays(a)} ημέρες χωρίς απάντηση`, `${ageDays(a)} days no answer`))}</small>` : ''}</span>
          <span><span class="pill cat-pill cat-${esc(a.category)}">${esc(catShort(a.category))}</span></span>
          <span class="at-name"><b>${esc(apptName(a))}</b>${a.total ? `<small>${esc(money(a.total, { dec: 0 }))}</small>` : ''}${a.comments ? `<small class="muted">💬 ${esc(a.comments.slice(0, 60))}</small>` : ''}</span>
          <span>${a.phone ? `<a href="${telUrl(a.phone)}" class="at-phone" data-stop>${esc(a.phone)}</a>` : '—'}</span>
          <span class="at-ev"><span class="at-lbl">${esc(L('Εκδήλωση', 'Event'))}: </span>${esc(fmtDate(a.event_date))}</span>
          <span data-stop>${pdf}</span>
          <span class="at-dec" data-stop>${decision}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="legend"><span><i style="background:var(--appt-stale)"></i>${esc(L(`Χωρίς απάντηση πάνω από ${STALE_DAYS} ημέρες (ειδοποίηση)`, `No answer for over ${STALE_DAYS} days (notified)`))}</span><span><i style="background:var(--appt-rej)"></i>Rejected</span><span><i style="background:var(--row-paid)"></i>Confirmed</span></div>`;
  }
  body.innerHTML = html;
  const aq = body.querySelector('#aq');
  aq.addEventListener('input', () => { st.q = aq.value; const p = aq.selectionStart; redraw(); const n2 = document.getElementById('aq'); n2?.focus(); n2?.setSelectionRange(p, p); });
  body.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { st.status = b.dataset.st; redraw(); }));
  body.querySelectorAll('[data-stop]').forEach((x) => x.addEventListener('click', (e) => e.stopPropagation()));
  body.querySelectorAll('[data-open]').forEach((r) => r.addEventListener('click', () => openAppointment(find(r.dataset.open))));
  body.querySelectorAll('[data-conf]').forEach((b) => b.addEventListener('click', () => confirmAppt(find(b.dataset.conf))));
  body.querySelectorAll('[data-rej]').forEach((b) => b.addEventListener('click', () => rejectAppt(find(b.dataset.rej))));
  body.querySelectorAll('[data-mkev]').forEach((b) => b.addEventListener('click', () => go(`#/new-event?appointment=${b.dataset.mkev}`)));
  body.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => openOffer(find(b.dataset.pdf).offer_path)));
  body.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', (e) => ensurePdf(find(b.dataset.gen), e.currentTarget)));
  body.querySelectorAll('[data-mkpdf]').forEach((b) => b.addEventListener('click', () => editOffer(find(b.dataset.mkpdf))));
}
const find = (id) => S.appointments.find((a) => a.id === id);

/** PDF από τις επιλογές της ηλεκτρονικής προσφοράς (μία φορά, μετά αποθηκεύεται) */
export async function ensurePdf(a, btn) {
  if (a.offer_path) return openOffer(a.offer_path);
  const w = window.open('about:blank', '_blank');
  busy(btn, true);
  try {
    const res = await generateOfferPdf(offerPrefill(a), offerKindOf(a.offer_data));
    const path = await uploadAppointmentOffer(a.id, new File([res.pdf], 'offer.pdf', { type: 'application/pdf' }));
    await saveAppointment({ id: a.id, offer_path: path, offer_data: res.state, total: res.total ?? a.total });
    toast(L('Το PDF δημιουργήθηκε', 'PDF created'));
    if (w) w.location.href = await offerUrl(path);
  } catch (e) {
    console.error(e); w?.close();
    toastErr(L('Το PDF δεν δημιουργήθηκε', 'PDF not created'), L('Δοκιμάστε «Επεξεργασία προσφοράς» από την καρτέλα του ραντεβού.', 'Try “Edit offer” from the appointment card.'));
  } finally { busy(btn, false); }
}

async function editOffer(a) {
  const kind = offerKindFor(a.category);
  const pre = offerPrefill(a);
  if (offerKindOf(a.offer_data) !== kind) { Object.keys(pre).forEach((k) => { if (!['partner1', 'partner2', 'phone1', 'phone2', 'eventDate', 'church', 'reception', 'city'].includes(k)) delete pre[k]; }); }
  const res = await openOfferBuilder({ kind, prefill: { ...pre, finalPrice: offerKindOf(a.offer_data) === kind ? a.offer_data?.finalPrice ?? undefined : undefined }, saveLabel: L('Αποθήκευση στο ραντεβού', 'Save to appointment') });
  if (!res) return;
  try {
    const path = await uploadAppointmentOffer(a.id, res.pdf);
    await saveAppointment({ id: a.id, offer_path: path, offer_data: res.state, total: res.total });
    toast(L('Η προσφορά αποθηκεύτηκε', 'Offer saved'));
  } catch (e) { console.error(e); }
}

// ---------------------------------------------------------------------
//  Confirm / Reject
// ---------------------------------------------------------------------
export async function confirmAppt(a) {
  if (!await confirmBox(L('Confirm: κλείσαμε τη δουλειά;', 'Confirm: is the job booked?'), L(`${apptName(a)}\nΘα ανοίξει η «Νέα εκδήλωση» συμπληρωμένη με τα στοιχεία του ραντεβού, για να προσθέσετε ώρα, συνεργείο κ.λπ.`, `${apptName(a)}\n“New event” will open pre-filled with the appointment details so you can add time, crew etc.`), { ok: 'Confirm' })) return;
  await saveAppointment({ id: a.id, status: 'confirmed', handled_by: S.profile.id });
  if (!a.offer_path && (a.selections || a.offer_data)) {
    toast(L('Δημιουργία PDF προσφοράς…', 'Creating offer PDF…'), { type: 'info' });
    try {
      const res = await generateOfferPdf(offerPrefill(a), offerKindOf(a.offer_data));
      const path = await uploadAppointmentOffer(a.id, new File([res.pdf], 'offer.pdf', { type: 'application/pdf' }));
      await saveAppointment({ id: a.id, offer_path: path, offer_data: res.state, total: res.total ?? a.total });
    } catch (e) { console.warn(e); }
  }
  toast('Confirmed ✓', { body: L('Συμπληρώστε τα υπόλοιπα στοιχεία της εκδήλωσης.', 'Fill in the remaining event details.') });
  go(`#/new-event?appointment=${a.id}`);
}

export function rejectAppt(a) {
  const f = { reason: a.reason || '', comments: a.comments || '' };
  const body = `<p class="muted small">${esc(L('Το ραντεβού κρατιέται ως στατιστικό (κόκκινη γραμμή). Γράψτε τι πιστεύετε ότι πήγε στραβά. Θα το βρείτε στο Dashboard.', 'The appointment is kept as a statistic (red row). Write what you think went wrong. You will find it in the Dashboard.'))}</p>
    <div class="field mt"><label>${esc(L('Λόγος', 'Reason'))}</label><div class="chips">${REJECT_REASONS.map((r) => `<button type="button" class="chip ${f.reason === r.v ? 'on' : ''}" data-r="${r.v}">${esc(L(r.el, r.en))}</button>`).join('')}</div></div>
    <div class="field"><label>${esc(L('Σχόλια: τι μπορεί να πήγε λάθος;', 'Comments: what might have gone wrong?'))}</label><textarea class="textarea" name="comments" placeholder="${esc(L('π.χ. Βρήκαν φθηνότερη προσφορά, ήθελαν μόνο video…', 'e.g. Found a cheaper offer, wanted video only…'))}">${esc(f.comments)}</textarea></div>`;
  const s = sheet({ title: `Reject · ${apptName(a)}`, body, foot: `<button class="btn" data-close>${esc(L('Άκυρο', 'Cancel'))}</button><button class="btn danger" data-ok>${icon('x')} Reject</button>` });
  s.body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { f.reason = f.reason === b.dataset.r ? '' : b.dataset.r; s.body.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x.dataset.r === f.reason)); }));
  s.root.querySelector('[data-ok]').addEventListener('click', async (e) => {
    const _btn = e.currentTarget; busy(_btn, true);
    f.comments = s.body.querySelector('[name=comments]').value.trim();
    try { await saveAppointment({ id: a.id, status: 'rejected', reason: f.reason || null, comments: f.comments || null, handled_by: S.profile.id }); s.close(); toast('Rejected', { body: L('Κρατήθηκε για τα στατιστικά.', 'Kept for statistics.') }); } catch { busy(_btn, false); }
  });
}

// ---------------------------------------------------------------------
//  Καρτέλα ραντεβού
// ---------------------------------------------------------------------
export function openAppointment(a) {
  if (!a) return;
  const s0 = rowState(a);
  const ev = a.event_id ? eventView(a.event_id) : null;
  const sel = a.offer_data || (a.selections ? requestToOfferState(apptToRequest(a)) : null);
  const banner = s0 === 'stale' ? `<div class="banner">${icon('warning')}<div><b>${esc(L(`${ageDays(a)} ημέρες χωρίς απάντηση`, `${ageDays(a)} days without an answer`))}</b><span>${esc(L('Πάρτε τηλέφωνο το ζευγάρι. Αν μιλήσατε αλλά δεν αποφάσισαν ακόμη, πατήστε «Μιλήσαμε» για να μετρήσει από την αρχή.', 'Call the couple. If you talked but they have not decided, tap “We talked” to restart the count.'))}</span></div></div>`
    : s0 === 'rejected' ? `<div class="banner red">${icon('x')}<div><b>Rejected${a.reason ? ' · ' + esc(lbl(REJECT_REASONS, a.reason)) : ''}</b><span>${esc(fmtDate(a.status_at))}</span></div></div>`
    : s0 === 'confirmed' ? `<div class="banner green">${icon('checkCircle')}<div><b>Confirmed</b><span>${ev ? `<a href="#/event/${ev.e.id}" data-close>${esc(L('Άνοιγμα εκδήλωσης', 'Open event'))} →</a>` : esc(L('Δεν έχει δημιουργηθεί ακόμη εκδήλωση.', 'No event created yet.'))}</span></div></div>` : '';
  const body = `${banner}<div class="list">
      <div class="row"><div class="main-col"><div class="s">${esc(lbl(APPT_MODES, a.mode))} · ${esc(L('ραντεβού', 'appointment'))} ${esc(fmtDate(a.appt_date))}</div><div class="t">${esc(apptName(a))}</div></div>${catPill(a.category)}</div>
      ${a.phone ? `<div class="row"><div class="main-col"><div class="s">${esc(L('Κινητό', 'Mobile'))}</div><div class="t">${esc(a.phone)}</div></div><a class="icon-btn filled" href="${telUrl(a.phone)}">${icon('phone')}</a><a class="icon-btn filled" href="${smsUrl(a.phone)}">${icon('sms')}</a></div>` : ''}
      ${a.email ? `<div class="row"><div class="main-col"><div class="s">Email</div><div class="t">${esc(a.email)}</div></div><a class="icon-btn filled" href="${mailUrl(a.email)}">${icon('mail')}</a></div>` : ''}
      <div class="row"><div class="main-col"><div class="s">${esc(L('Ημερομηνία εκδήλωσης', 'Event date'))}</div><div class="t">${esc(fmtDate(a.event_date))}</div></div></div>
      <div class="row"><div class="main-col"><div class="s">${esc(L('Εκκλησία / τοποθεσία', 'Church / location'))}</div><div class="t">${esc([a.church, a.church_time].filter(Boolean).join(' · ') || '—')}</div></div></div>
      <div class="row"><div class="main-col"><div class="s">${esc(L('Δεξίωση', 'Reception'))}</div><div class="t">${esc([a.reception, a.reception_time].filter(Boolean).join(' · ') || '—')}</div></div></div>
      <div class="row"><div class="main-col"><div class="s">${esc(L('Αξία προσφοράς', 'Offer value'))}</div><div class="t money">${esc(money(a.total))}</div></div>${a.offer_path ? `<button class="btn small" data-pdf>${icon('doc')} PDF</button>` : ''}</div>
    </div>
    ${sel ? `<div class="group-label">${esc(L('Τι περιλαμβάνει η προσφορά', 'What the offer includes'))}</div><div class="card pad">${offerSummaryHTML(sel)}</div>` : ''}
    <div class="group-label">${esc(L('Σχόλια / τι μπορεί να πήγε λάθος', 'Comments / what might have gone wrong'))}</div>
    <div class="card pad"><textarea class="textarea" name="comments" style="min-height:80px" placeholder="${esc(L('Σημειώσεις για εσάς: τι συζητήσατε, τι τους προβλημάτισε…', 'Notes for you: what you discussed, what worried them…'))}">${esc(a.comments || '')}</textarea>
      ${a.notes ? `<div class="small muted mt-s">${esc(L('Σημειώσεις', 'Notes'))}: ${esc(a.notes)}</div>` : ''}</div>
    <div class="list mt">
      <button class="row has-icon" data-act="offer"><span class="row-icon" style="background:var(--accent)">${icon('wand')}</span><div class="main-col"><div class="t">${esc(a.offer_path || sel ? L('Επεξεργασία προσφοράς (Οδηγός)', 'Edit offer (builder)') : L('Δημιουργία προσφοράς (Οδηγός)', 'Create offer (builder)'))}</div></div>${icon('chevR', 'chev')}</button>
      <button class="row has-icon" data-act="upload"><span class="row-icon" style="background:var(--label-2)">${icon('upload')}</span><div class="main-col"><div class="t">${esc(L('Ανέβασμα έτοιμου PDF', 'Upload ready PDF'))}</div></div>${icon('chevR', 'chev')}</button>
      ${a.mode === 'store' ? `<button class="row has-icon" data-act="edit"><span class="row-icon" style="background:var(--blue)">${icon('edit')}</span><div class="main-col"><div class="t">${esc(L('Επεξεργασία στοιχείων', 'Edit details'))}</div></div>${icon('chevR', 'chev')}</button>` : ''}
      ${a.status === 'pending' ? `<button class="row has-icon" data-act="talked"><span class="row-icon" style="background:var(--orange)">${icon('phone')}</span><div class="main-col"><div class="t">${esc(L('Μιλήσαμε, περιμένουμε απάντηση', 'We talked, waiting for an answer'))}</div><div class="s">${esc(L(`Μηδενίζει τη μέτρηση των ${STALE_DAYS} ημερών`, `Restarts the ${STALE_DAYS}-day count`))}</div></div></button>` : `<button class="row has-icon" data-act="reopen"><span class="row-icon" style="background:var(--label-3)">${icon('refresh')}</span><div class="main-col"><div class="t">${esc(L('Επαναφορά σε «Σε αναμονή»', 'Back to “Pending”'))}</div></div></button>`}
      ${a.status === 'confirmed' && !ev ? `<button class="row has-icon" data-act="mkev"><span class="row-icon" style="background:var(--green)">${icon('plus')}</span><div class="main-col"><div class="t">${esc(L('Δημιουργία εκδήλωσης', 'Create event'))}</div></div>${icon('chevR', 'chev')}</button>` : ''}
      <button class="row has-icon" data-act="del"><span class="row-icon" style="background:var(--red)">${icon('trash')}</span><div class="main-col"><div class="t neg">${esc(L('Διαγραφή ραντεβού', 'Delete appointment'))}</div><div class="s">${esc(L('Χάνεται και από τα στατιστικά. Για «δεν έκλεισε» πατήστε Reject.', 'Also removed from statistics. For “not booked” use Reject.'))}</div></div></button>
    </div>`;
  const foot = a.status === 'pending' ? `<button class="btn danger" data-rej>${icon('x')} Reject</button><button class="btn success" data-conf>${icon('check')} Confirm</button>` : '';
  const s = sheet({ title: L('Ραντεβού / προσφορά', 'Appointment / offer'), body, foot, wide: true });
  const ta = s.body.querySelector('[name=comments]');
  ta.addEventListener('change', () => saveAppointment({ id: a.id, comments: ta.value.trim() || null }).then(() => toast(L('Τα σχόλια αποθηκεύτηκαν', 'Comments saved'), { ms: 1400 })).catch(() => {}));
  s.body.querySelector('[data-pdf]')?.addEventListener('click', () => openOffer(a.offer_path));
  s.root.querySelector('[data-conf]')?.addEventListener('click', () => { s.close(); confirmAppt(a); });
  s.root.querySelector('[data-rej]')?.addEventListener('click', () => { s.close(); rejectAppt(a); });
  s.body.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.act;
    if (act === 'offer') { s.close(); editOffer(a); }
    if (act === 'upload') { const f = await pickPdfFile(); if (!f) return; const path = await uploadAppointmentOffer(a.id, f); await saveAppointment({ id: a.id, offer_path: path }); s.close(); toast(L('Το PDF ανέβηκε', 'PDF uploaded')); }
    if (act === 'edit') { s.close(); go(`#/appointment/${a.id}/edit`); }
    if (act === 'mkev') { s.close(); go(`#/new-event?appointment=${a.id}`); }
    if (act === 'talked') { await saveAppointment({ id: a.id, status_at: new Date().toISOString() }); s.close(); toast(L('Η μέτρηση ξεκίνησε από την αρχή', 'Count restarted')); }
    if (act === 'reopen') { await saveAppointment({ id: a.id, status: 'pending' }); s.close(); }
    if (act === 'del') { if (!await confirmBox(L('Διαγραφή ραντεβού;', 'Delete appointment?'), apptName(a), { ok: L('Διαγραφή', 'Delete'), destructive: true })) return; await deleteAppointment(a.id); s.close(); toast(L('Διαγράφηκε', 'Deleted')); }
  }));
}

// ---------------------------------------------------------------------
//  Αποστολή link (ηλεκτρονική παρουσίαση)
// ---------------------------------------------------------------------
export function openSendLink() {
  const url = clientPageUrl();
  const f = { phone: '', email: '', name: '' };
  const msg = () => L(`Γεια σας${f.name ? ' ' + f.name : ''}! Σας στέλνουμε την προσφορά μας για τη μεγάλη σας μέρα. Διαλέξτε ό,τι θέλετε και πατήστε «Αποστολή» — θα σας καλέσουμε αμέσως. ${url}\n${business().name} · ${business().phone}`,
    `Hello${f.name ? ' ' + f.name : ''}! Here is our offer for your big day. Choose what you like and tap “Send” — we will call you right away. ${url}\n${business().name} · ${business().phone}`);
  const body = `<div class="banner">${icon('link')}<div><b>${esc(L('Πώς λειτουργεί', 'How it works'))}</b><span>${esc(L('Το ζευγάρι ανοίγει το link, διαλέγει πακέτο και πατάει «Αποστολή». Το ραντεβού εμφανίζεται αμέσως στην «Ηλεκτρονική παρουσίαση» με ειδοποίηση, και το PDF φτιάχνεται με ένα πάτημα.', 'The couple opens the link, picks a package and taps “Send”. The appointment appears instantly under “Online presentation” with a notification, and the PDF is created with one tap.'))}</span></div></div>
    <div class="field"><label>${esc(L('Σύνδεσμος προσφοράς', 'Offer link'))}</label><div class="input-wrap"><input class="input" readonly value="${esc(url)}"><button class="btn small act" data-copy>${icon('copy')}</button></div></div>
    <div class="form-grid">
      <div class="field"><label>${esc(L('Όνομα (προαιρετικό)', 'Name (optional)'))}</label><input class="input" name="name" placeholder="${esc(L('π.χ. Μαρία', 'e.g. Maria'))}"></div>
      <div class="field"><label>${esc(L('Κινητό', 'Mobile'))}</label><input class="input" name="phone" type="tel" inputmode="tel" placeholder="69XXXXXXXX"></div>
      <div class="field full"><label>Email</label><input class="input" name="email" type="email" inputmode="email" placeholder="name@gmail.com"></div>
    </div>
    <div class="grid cols-2" style="gap:8px">
      <button class="btn primary" data-send="sms">${icon('sms')} SMS</button>
      <button class="btn primary" data-send="email">${icon('mail')} Email</button>
      <button class="btn" data-send="viber">${icon('message')} Viber</button>
      <button class="btn" data-send="whatsapp">${icon('message')} WhatsApp</button>
      <a class="btn" href="offer/client.html" target="_blank" rel="noopener">${icon('eye')} ${esc(L('Προβολή σελίδας', 'Preview page'))}</a>
      <button class="btn" data-file>${icon('download')} ${esc(L('Αρχείο για email', 'File for email'))}</button>
    </div>`;
  const s = sheet({ title: L('Ηλεκτρονική παρουσίαση', 'Online presentation'), body });
  s.body.querySelectorAll('[name]').forEach((i) => i.addEventListener('input', () => { f[i.name] = i.value.trim(); }));
  s.body.querySelector('[data-copy]').addEventListener('click', async () => { await copyText(url); toast(L('Ο σύνδεσμος αντιγράφηκε', 'Link copied')); });
  s.body.querySelector('[data-file]').addEventListener('click', () => downloadClientFile());
  s.body.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', async () => {
    const how = b.dataset.send;
    if ((how === 'sms' || how === 'whatsapp') && !f.phone) return toastErr(L('Γράψτε κινητό', 'Enter a mobile'));
    if (how === 'email' && !f.email) return toastErr(L('Γράψτε email', 'Enter an email'));
    if (how === 'sms') window.location.href = smsUrl(f.phone, msg());
    if (how === 'whatsapp') window.location.href = waUrl(f.phone, msg());
    if (how === 'email') window.location.href = mailUrl(f.email, L('Image Makers · Η προσφορά μας για εσάς', 'Image Makers · Our offer for you'), msg());
    if (how === 'viber') { await copyText(msg()); window.location.href = viberUrl(msg()); }
  }));
}

// ---------------------------------------------------------------------
//  Νέα παρουσίαση στο μαγαζί / επεξεργασία
// ---------------------------------------------------------------------
let F = null; let fKey = '';
export function renderAppointmentForm(root, params = {}) {
  const k = params.id || 'new';
  if (!F || fKey !== k || params._fresh) {
    params._fresh = false;
    const a = params.id ? find(params.id) : null;
    F = a ? { ...a, pdf: null, pdfName: '' } : { mode: 'store', appt_date: todayISO(), category: 'wedding', name1: '', name2: '', phone: '', email: '', event_date: '', church: '', reception: '', notes: '', total: '', offer_data: null, pdf: null, pdfName: '' };
    fKey = k;
  }
  const edit = !!params.id;
  const fld = (n, l, { req = false, type = 'text', ph = '', full = false, im = '' } = {}) => `<div class="field ${full ? 'full' : ''}"><label>${esc(l)}${req ? ' <span class="req">*</span>' : ''}</label><input class="input" name="${n}" type="${type}" ${im ? `inputmode="${im}"` : ''} value="${esc(F[n] ?? '')}" placeholder="${esc(ph)}"><div class="err" hidden></div></div>`;
  const has = F.pdf || F.offer_path;
  root.innerHTML = backBtn('#/appointments') + pageHead(edit ? L('Επεξεργασία ραντεβού', 'Edit appointment') : L('Νέα παρουσίαση στο μαγαζί', 'New in-store presentation'), { sub: esc(L('Συμπληρώστε τα στοιχεία και φτιάξτε την προσφορά μαζί με το ζευγάρι.', 'Fill in the details and build the offer together with the couple.')) })
    + `<div class="card pad"><div class="form-grid">
      ${fld('appt_date', L('Ημερομηνία ραντεβού', 'Appointment date'), { req: true, type: 'date' })}
      ${fld('event_date', L('Ημερομηνία εκδήλωσης', 'Event date'), { type: 'date' })}
      <div class="field full"><label>${esc(L('Κατηγορία εκδήλωσης', 'Event category'))} <span class="req">*</span></label><div class="chips">${CATEGORIES.map((c) => `<button type="button" class="chip ${F.category === c.v ? 'on' : ''}" data-cat="${c.v}"><span class="cat-dot cat-${c.v}"></span>${esc(L(c.el, c.en))}</button>`).join('')}</div></div>
      ${fld('name1', L('Ονοματεπώνυμο 1', 'Full name 1'), { req: true, ph: L('π.χ. Μαρία Παπαδοπούλου', 'e.g. Maria Papadopoulou') })}
      ${fld('name2', L('Ονοματεπώνυμο 2', 'Full name 2'), { ph: L('π.χ. Γιώργος Ιωάννου', 'e.g. George Ioannou') })}
      ${fld('phone', L('Κινητό', 'Mobile'), { req: true, type: 'tel', im: 'tel', ph: '69XXXXXXXX' })}
      ${fld('email', 'Email', { type: 'email', im: 'email', ph: 'name@gmail.com' })}
      ${fld('church', L('Εκκλησία / τοποθεσία', 'Church / location'), { full: true, ph: L('π.χ. Ι.Ν. Αγίου Αχιλλείου, Λάρισα', 'e.g. St. Achilleios Church, Larissa') })}
      ${fld('reception', L('Χώρος δεξίωσης', 'Reception venue'), { full: true })}
      <div class="field full"><label>${esc(L('Σημειώσεις', 'Notes'))}</label><textarea class="textarea" name="notes" style="min-height:70px">${esc(F.notes || '')}</textarea></div>
    </div></div>
    <div class="card pad mt">
      <div class="spread"><b>${esc(L('Προσφορά (PDF)', 'Offer (PDF)'))}</b>${has ? `<span class="pill green">${icon('check')} ${esc(L('Έτοιμη', 'Ready'))}</span>` : `<span class="pill">${esc(L('Δεν έχει γίνει', 'Not made yet'))}</span>`}</div>
      ${has ? `<div class="small muted mt-s">${esc(F.pdfName || L('Αποθηκευμένη προσφορά', 'Saved offer'))}${F.total ? ' · ' + esc(money(F.total, { dec: 0 })) : ''}</div>` : ''}
      <div class="grid cols-2 mt" style="gap:10px">
        <button class="btn primary large" data-builder>${icon('wand')} ${esc(F.offer_data ? L('Επεξεργασία στον Οδηγό προσφοράς', 'Edit in offer builder') : L('Δημιουργία με τον Οδηγό προσφοράς', 'Create with offer builder'))}</button>
        <button class="btn large" data-upload>${icon('upload')} ${esc(L('Ανέβασμα έτοιμου PDF', 'Upload ready PDF'))}</button>
      </div>
      ${F.offer_data ? `<div class="mt">${offerSummaryHTML(F.offer_data)}</div>` : ''}
      <div class="field mt"><label>${esc(L('Αξία προσφοράς (€)', 'Offer value (€)'))}</label><div class="input-wrap"><input class="input" name="total" inputmode="decimal" value="${esc(F.total ?? '')}" placeholder="2800"><span class="suffix">€</span></div><div class="help">${esc(L('Συμπληρώνεται αυτόματα από τον Οδηγό.', 'Filled automatically by the builder.'))}</div></div>
    </div>
    <div class="wizard-foot"><span></span><button class="btn primary large" data-save>${icon('check')} ${esc(edit ? L('Αποθήκευση αλλαγών', 'Save changes') : L('Αποθήκευση ραντεβού', 'Save appointment'))}</button></div>`;
  root.querySelectorAll('[name]').forEach((i) => i.addEventListener('input', () => { F[i.name] = i.value; i.classList.remove('invalid'); }));
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { F.category = b.dataset.cat; root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); }));
  root.querySelector('[data-builder]').addEventListener('click', async () => {
    const kind = offerKindFor(F.category);
    const res = await openOfferBuilder({ kind, prefill: { ...(F.offer_data && offerKindOf(F.offer_data) === kind ? F.offer_data : {}), partner1: F.name1, partner2: F.name2, phone1: F.phone, eventDate: F.event_date, church: F.church, reception: F.reception, city: (F.church || '').split(',').slice(1).join(',').trim(), finalPrice: offerKindOf(F.offer_data) === kind ? F.offer_data?.finalPrice ?? undefined : undefined }, saveLabel: L('Αποθήκευση στο ραντεβού', 'Save to appointment') });
    if (!res) return;
    F.pdf = res.pdf; F.pdfName = res.fileName; F.offer_data = res.state; F.total = res.total;
    // ό,τι γράφτηκε στον Οδηγό περνά και στη φόρμα, ώστε φόρμα και PDF να συμφωνούν
    F.name1 = res.state.partner1 || F.name1; F.name2 = res.state.partner2 || ''; F.phone = res.state.phone1 || F.phone;
    F.event_date = res.state.eventDate || F.event_date; F.church = res.state.church || F.church; F.reception = res.state.reception || F.reception;
    toast(L('Η προσφορά επισυνάφθηκε', 'Offer attached'), { body: `${money(res.total, { dec: 0 })} · ${packageNameFrom(res.state)}` });
    renderAppointmentForm(root, params);
  });
  root.querySelector('[data-upload]').addEventListener('click', async () => { const f = await pickPdfFile(); if (!f) return; F.pdf = f; F.pdfName = f.name; renderAppointmentForm(root, params); });
  root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const _btn = e.currentTarget;
    let ok = true;
    const bad = (n) => { root.querySelector(`[name=${n}]`)?.classList.add('invalid'); ok = false; };
    if (!F.appt_date) bad('appt_date');
    if (!String(F.name1 || '').trim()) bad('name1');
    if (String(F.phone || '').replace(/\D/g, '').length < 10) bad('phone');
    if (F.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(F.email)) bad('email');
    if (!ok) return toastErr(L('Συμπληρώστε σωστά τα υποχρεωτικά πεδία', 'Fill in the required fields correctly'));
    if (!F.pdf && !F.offer_path && !await confirmBox(L('Αποθήκευση χωρίς προσφορά;', 'Save without an offer?'), L('Μπορείτε να τη φτιάξετε και αργότερα από τη λίστα.', 'You can make it later from the list.'), { ok: L('Αποθήκευση', 'Save') })) return;
    busy(_btn, true, L('Αποθήκευση…', 'Saving…'));
    try {
      // Διορθώθηκαν στοιχεία μετά τη δημιουργία της προσφοράς; Το PDF ξαναφτιάχνεται με τα σωστά.
      const cur = { partner1: F.name1.trim(), partner2: (F.name2 || '').trim(), phone1: F.phone.trim(), eventDate: F.event_date || '', church: F.church || '', reception: F.reception || '' };
      if (F.offer_data && offerIsStale(F.offer_data, cur)) {
        busy(_btn, true, L('Ενημέρωση PDF με τα σωστά στοιχεία…', 'Updating the PDF with the correct details…'));
        try { const r = await refreshOfferPdf(F.offer_data, cur); F.pdf = r.pdf; F.pdfName = r.fileName; F.offer_data = r.state; }
        catch (err) { console.warn(err); toastErr(L('Το PDF δεν ενημερώθηκε', 'PDF not updated'), L('Ανοίξτε τον Οδηγό προσφοράς και αποθηκεύστε ξανά.', 'Open the offer builder and save again.')); }
        busy(_btn, true, L('Αποθήκευση…', 'Saving…'));
      }
      const total = parseMoney(F.total);
      let a = await saveAppointment({ id: F.id, mode: 'store', appt_date: F.appt_date, category: F.category, name1: F.name1.trim(), name2: (F.name2 || '').trim() || null, phone: F.phone.trim(), email: (F.email || '').trim() || null, event_date: F.event_date || null, church: F.church || null, reception: F.reception || null, notes: F.notes || null, offer_data: F.offer_data || null, total });
      if (F.pdf) { const path = await uploadAppointmentOffer(a.id, F.pdf); a = await saveAppointment({ id: a.id, offer_path: path }); }
      toast(edit ? L('Οι αλλαγές αποθηκεύτηκαν', 'Changes saved') : L('Το ραντεβού καταχωρήθηκε', 'Appointment saved'), { body: L('Όταν σας απαντήσουν, πατήστε Confirm ή Reject.', 'When they answer, tap Confirm or Reject.') });
      F = null; fKey = ''; st.mode = 'store'; st.view = 'list';
      go('#/appointments');
    } catch (err) { console.error(err); busy(_btn, false); }
  });
}

// ---------------------------------------------------------------------
//  Dashboard / στατιστικά
// ---------------------------------------------------------------------
export function apptStats(year) {
  const y = String(year);
  const list = S.appointments.filter((a) => a.appt_date.startsWith(y));
  const pack = (arr) => {
    const conf = arr.filter((a) => a.status === 'confirmed'), rej = arr.filter((a) => a.status === 'rejected'), pend = arr.filter((a) => a.status === 'pending');
    const decided = conf.length + rej.length;
    return { n: arr.length, conf: conf.length, rej: rej.length, pend: pend.length, stale: arr.filter(isStaleAppt).length, rate: decided ? Math.round((conf.length / decided) * 100) : null, value: sum(conf, (a) => a.total || 0), lost: sum(rej, (a) => a.total || 0), avg: arr.length ? sum(arr, (a) => a.total || 0) / Math.max(1, arr.filter((a) => a.total).length) : 0,
      days: decided ? Math.round(sum([...conf, ...rej], (a) => Math.max(0, daysBetween(a.appt_date, String(a.status_at).slice(0, 10)))) / decided) : null };
  };
  return { list, all: pack(list), store: pack(list.filter((a) => a.mode === 'store')), online: pack(list.filter((a) => a.mode === 'online')),
    months: [...Array(12).keys()].map((m) => { const mm = String(m + 1).padStart(2, '0'); const arr = list.filter((a) => a.appt_date.slice(5, 7) === mm); return { label: monthShort(m), a: arr.filter((a) => a.status === 'confirmed').length, b: arr.filter((a) => a.status === 'rejected').length, n: arr.length, m }; }),
    byCat: CATEGORIES.map((c) => ({ c, ...pack(list.filter((a) => a.category === c.v)) })).filter((r) => r.n),
    reasons: REJECT_REASONS.map((r) => ({ label: L(r.el, r.en), v: list.filter((a) => a.status === 'rejected' && a.reason === r.v).length })).filter((r) => r.v),
    comments: list.filter((a) => a.comments).sort((a, b) => b.appt_date.localeCompare(a.appt_date)) };
}

/** Μικρή σύνοψη για το Dashboard των Φύλλων */
export function apptSummaryHTML(year) {
  const s = apptStats(year);
  if (!s.list.length) return '';
  const k = (label, p) => `<div class="kpi"><div class="k-label">${esc(label)}</div><div class="k-value">${p.rate == null ? '—' : p.rate + '%'}</div><div class="k-sub">${p.n} ${esc(L('ραντεβού', 'appts'))} · ${p.conf} confirmed · ${p.rej} rejected</div></div>`;
  return `<div class="section-title"><h2>${esc(L('Προσφορές / Ραντεβού', 'Offers / Appointments'))} ${year}</h2><a class="small" href="#/appointments">${esc(L('Αναλυτικά', 'Details'))} ${icon('chevR')}</a></div>
    <div class="grid cols-3">${k(L('Ποσοστό κλεισίματος (όλα)', 'Win rate (all)'), s.all)}${k(L('Στο μαγαζί', 'In store'), s.store)}${k(L('Ηλεκτρονικά', 'Online'), s.online)}</div>`;
}

function statsView(body, redraw) {
  const years = [...new Set([new Date().getFullYear(), ...S.appointments.map((a) => Number(a.appt_date.slice(0, 4)))])].sort();
  const s = apptStats(st.year);
  const pct = (p) => (p.rate == null ? '—' : p.rate + '%');
  const m0 = (v) => money(v, { dec: 0 });
  const row = (label, f) => `<tr><td>${esc(label)}</td><td class="num">${f(s.store)}</td><td class="num">${f(s.online)}</td><td class="num"><b>${f(s.all)}</b></td></tr>`;
  body.innerHTML = `<div class="spread mb"><b>${esc(L('Στατιστικά ραντεβού', 'Appointment statistics'))}</b><select class="select" id="ay" style="width:auto;min-height:36px">${years.map((y) => `<option ${y === st.year ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    <div class="grid cols-4">
      <div class="kpi accent"><div class="k-label">${esc(L('Ραντεβού', 'Appointments'))}</div><div class="k-value">${s.all.n}</div><div class="k-sub">${s.store.n} ${esc(L('στο μαγαζί', 'in store'))} · ${s.online.n} ${esc(L('ηλεκτρονικά', 'online'))}</div></div>
      <div class="kpi"><div class="k-label">Confirmed</div><div class="k-value pos">${s.all.conf}</div><div class="k-sub">${esc(L('Αξία', 'Value'))} ${esc(m0(s.all.value))}</div></div>
      <div class="kpi"><div class="k-label">Rejected</div><div class="k-value neg">${s.all.rej}</div><div class="k-sub">${esc(L('Χαμένη αξία', 'Lost value'))} ${esc(m0(s.all.lost))}</div></div>
      <div class="kpi"><div class="k-label">${esc(L('Ποσοστό κλεισίματος', 'Win rate'))}</div><div class="k-value">${pct(s.all)}</div><div class="k-sub">${s.all.pend} ${esc(L('σε αναμονή', 'pending'))}${s.all.stale ? ` · ${s.all.stale} ${esc(L('χωρίς απάντηση', 'no answer'))}` : ''}</div></div>
    </div>
    <div class="card pad mt"><b>${esc(L('Μαγαζί ή ηλεκτρονικά; Σύγκριση', 'In store or online? Comparison'))}</b>
      <div class="xl-wrap mt-s" style="max-height:none;min-height:0"><table class="xl cmp-table"><thead><tr class="h"><th class="gc-plain" style="top:0;text-align:left">${esc(L('Δείκτης', 'Indicator'))}</th><th class="gc-plain" style="top:0">${esc(L('Στο μαγαζί', 'In store'))}</th><th class="gc-plain" style="top:0">${esc(L('Ηλεκτρονικά', 'Online'))}</th><th class="gc-plain" style="top:0">${esc(L('Σύνολο', 'Total'))}</th></tr></thead><tbody>
        ${row(L('Ραντεβού', 'Appointments'), (p) => p.n)}${row('Confirmed', (p) => p.conf)}${row('Rejected', (p) => p.rej)}${row(L('Σε αναμονή', 'Pending'), (p) => p.pend)}
        ${row(L('Ποσοστό κλεισίματος', 'Win rate'), pct)}${row(L('Αξία που κλείσαμε', 'Value booked'), (p) => esc(m0(p.value)))}${row(L('Μέση αξία προσφοράς', 'Average offer'), (p) => esc(m0(p.avg)))}${row(L('Μέρες μέχρι απόφαση (μ.ό.)', 'Days to decision (avg)'), (p) => (p.days == null ? '—' : p.days))}
      </tbody></table></div></div>
    <div class="card pad mt" id="achart"><div class="spread"><b>${esc(L('Ανά μήνα ραντεβού', 'By appointment month'))}</b></div><div class="mt-s">${barPairs(s.months, { labels: ['Confirmed', 'Rejected'], fmt: (v) => String(v) })}</div></div>
    <div class="grid cols-2 mt">
      <div class="card pad"><b>${esc(L('Ποσοστό κλεισίματος ανά κατηγορία', 'Win rate by category'))}</b><div class="mt-s">${hbars(s.byCat.map((r) => ({ label: `${L(r.c.el, r.c.en).replace(' (Promotional)', '')} (${r.conf}/${r.conf + r.rej})`, v: r.rate ?? 0, dot: r.c.v })), { fmt: (v) => v + '%' }) || `<div class="muted small">—</div>`}</div></div>
      <div class="card pad"><b>${esc(L('Γιατί δεν έκλεισαν', 'Why they did not book'))}</b><div class="mt-s">${hbars(s.reasons) || `<div class="muted small">${esc(L('Δεν υπάρχουν ακόμη rejected με λόγο.', 'No rejected with a reason yet.'))}</div>`}</div></div>
    </div>
    <div class="section-title"><h2>${esc(L('Σχόλια: τι μπορεί να πήγε λάθος', 'Comments: what might have gone wrong'))}</h2></div>
    ${s.comments.length ? `<div class="list">${s.comments.slice(0, 40).map((a) => `<button class="row has-icon" data-open="${a.id}"><span class="row-icon" style="background:${a.status === 'rejected' ? 'var(--red)' : a.status === 'confirmed' ? 'var(--green)' : 'var(--orange)'}">${icon('message')}</span><div class="main-col"><div class="t">${esc(apptName(a))} · ${esc(lbl(APPT_MODES, a.mode))}${a.reason ? ' · ' + esc(lbl(REJECT_REASONS, a.reason)) : ''}</div><div class="s" style="white-space:normal">${esc(a.comments)}</div></div><div class="v tiny">${esc(fmtDate(a.appt_date))}</div></button>`).join('')}</div>`
      : `<div class="card pad muted small">${esc(L('Γράψτε σχόλια σε κάθε ραντεβού (ειδικά στα Rejected) για να βλέπετε εδώ τι δουλεύει και τι όχι.', 'Write comments on each appointment (especially Rejected) to see here what works and what does not.'))}</div>`}`;
  body.querySelector('#ay').addEventListener('change', (e) => { st.year = Number(e.target.value); redraw(); });
  body.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openAppointment(find(b.dataset.open))));
  bindTips(body.querySelector('#achart'));
}
void MONTHS_EL_UP;
