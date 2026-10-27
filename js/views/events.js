// =====================================================================
//  Εκδηλώσεις: λίστα & λεπτομέρειες
// =====================================================================
import { L, esc, icon, money, fmtDate, fmtDateLong, fmtTime, todayISO, daysBetween, matches, mapsUrl, telUrl, smsUrl, mailUrl, lbl, CATEGORIES, RESOLUTIONS, PHOTO_STATUS, EDIT_STATUS, PCS, METHODS, options, segmented, initSegmented, segValue, sheet, confirmBox, actionSheet, toast, download, icsFor, busy, monthName } from '../core.js';
import { S, isAdmin, isVideoAdmin, allEventViews, eventView, coupleName, profileName, patchEvent, deleteEvent, setCrew, openOffer, deletePayment, myEventIds } from '../data.js';
import { pageHead, setTopActions, emptyState, go, backBtn, UI } from '../layout.js';
import { eventRow, catPill, offerSummaryHTML, crewBriefHTML, crewChips, avatar, photoStatusPill, editStatusPill } from '../components.js';
import { openIncomeForm } from './money.js';
import { editOfferForEvent, uploadPdfForEvent } from '../offer.js';

const st = { q: '', when: 'upcoming', cat: '' };

export function renderEvents(root, params = {}) {
  const admin = isAdmin();
  const today = todayISO();
  const mine = myEventIds();
  let list = allEventViews().filter((v) => admin || mine.has(v.e.id));
  if (params.filter === 'nocrew') { st.when = 'upcoming'; }
  list = list.filter((v) => {
    if (st.when === 'upcoming' && v.e.event_date < today) return false;
    if (st.when === 'past' && v.e.event_date >= today) return false;
    if (st.cat && v.e.category !== st.cat) return false;
    if (params.filter === 'nocrew' && v.crew.length) return false;
    return matches(st.q, v.title, v.c?.phone1, v.c?.phone2, v.c?.email1, v.e.church_location, v.e.reception_location, v.e.house_location, fmtDate(v.e.event_date), v.f?.package_name);
  });
  if (st.when === 'past') list.reverse();

  let html = pageHead(admin ? L('Εκδηλώσεις', 'Events') : L('Οι εκδηλώσεις μου', 'My events'), {
    sub: esc(L(`${list.length} εκδηλώσεις`, `${list.length} events`)),
    actions: admin ? `<a class="btn primary hide-mobile" href="#/new-event">${icon('plus')} ${esc(L('Νέα εκδήλωση', 'New event'))}</a>` : '',
  });
  html += `<div class="stack mb">
    <div class="search">${icon('search')}<input class="input" id="q" type="search" placeholder="${esc(L('Αναζήτηση: όνομα, τηλέφωνο, τοποθεσία, ημερομηνία…', 'Search: name, phone, place, date…'))}" value="${esc(st.q)}"></div>
    <div class="spread" style="flex-wrap:wrap">
      ${segmented('when', [{ v: 'upcoming', label: L('Επερχόμενες', 'Upcoming') }, { v: 'past', label: L('Περασμένες', 'Past') }, { v: 'all', label: L('Όλες', 'All') }], st.when)}
      <div class="chips scroll">
        <button class="chip ${!st.cat ? 'on' : ''}" data-cat="">${esc(L('Όλες οι κατηγορίες', 'All categories'))}</button>
        ${CATEGORIES.map((c) => `<button class="chip ${st.cat === c.v ? 'on' : ''}" data-cat="${c.v}"><span class="cat-dot cat-${c.v}"></span>${esc(L(c.el, c.en).replace(' (Promotional)', ''))}</button>`).join('')}
      </div>
    </div>
    ${params.filter === 'nocrew' ? `<div class="banner">${icon('filter')}<div><b>${esc(L('Φίλτρο: χωρίς συνεργείο', 'Filter: no crew'))}</b><span><a href="#/events">${esc(L('Καθαρισμός φίλτρου', 'Clear filter'))}</a></span></div></div>` : ''}
  </div>`;

  if (!list.length) {
    html += emptyState('events', st.q ? L('Δεν βρέθηκαν εκδηλώσεις', 'No events found') : L('Δεν υπάρχουν εκδηλώσεις εδώ', 'No events here'),
      admin ? L('Πατήστε «Νέα εκδήλωση» για να προσθέσετε την πρώτη.', 'Tap “New event” to add one.') : L('Όταν σας ανατεθεί εκδήλωση θα εμφανιστεί εδώ.', 'Events assigned to you will appear here.'));
  } else {
    let lastM = ''; let open = false;
    list.forEach((v) => {
      const mk = v.e.event_date.slice(0, 7);
      if (mk !== lastM) {
        if (open) html += '</div>';
        const [y, m] = mk.split('-').map(Number);
        html += `<div class="agenda-day">${esc(monthName(m - 1))} ${y}</div><div class="list">`;
        lastM = mk; open = true;
      }
      html += eventRow(v);
    });
    if (open) html += '</div>';
  }
  if (admin) html += `<a class="fab hide-desktop" href="#/new-event" aria-label="${esc(L('Νέα εκδήλωση', 'New event'))}">${icon('plus')}</a>`;
  root.innerHTML = html;
  const q = root.querySelector('#q');
  q.addEventListener('input', () => { st.q = q.value; const pos = q.selectionStart; renderEvents(root, params); const nq = root.querySelector('#q'); nq.focus(); nq.setSelectionRange(pos, pos); });
  initSegmented(root, (_, v) => { st.when = v; renderEvents(root, params); });
  root.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { st.cat = b.dataset.cat; renderEvents(root, params); }));
}

// ---------------------------------------------------------------------
export function renderEventDetail(root, { id }) {
  const v = eventView(id);
  if (!v) { root.innerHTML = backBtn('#/events') + emptyState('events', L('Η εκδήλωση δεν βρέθηκε', 'Event not found'), L('Ίσως διαγράφηκε ή δεν έχετε πρόσβαση.', 'It may have been deleted or you have no access.')); return; }
  const admin = isAdmin();
  const { e, c, f } = v;
  const days = daysBetween(todayISO(), e.event_date);
  const phone = c?.phone1 || c?.phone2;
  const email = c?.email1 || c?.email2;
  if (UI.topTitle) UI.topTitle.textContent = v.title;
  document.title = `${v.title} · Image Makers`;
  setTopActions(admin ? `<a class="btn small" href="#/event/${id}/edit">${icon('edit')} <span class="hide-mobile">${esc(L('Επεξεργασία', 'Edit'))}</span></a>` : '');

  let html = backBtn('#/events');
  html += `<div class="ev-hero cat-${e.category}" style="--c:var(--cat-${e.category})">
    ${days >= 0 ? `<div class="countdown"><b>${days}</b><small>${esc(days === 1 ? L('ημέρα', 'day') : L('ημέρες', 'days'))}</small></div>` : ''}
    <div class="hstack">${catPill(e.category)}${e.status === 'cancelled' ? `<span class="pill red">${esc(L('Ακυρωμένη', 'Cancelled'))}</span>` : ''}${e.resolution ? `<span class="pill blue">${esc(e.resolution === '4k' ? '4K' : 'Full HD')}</span>` : ''}</div>
    <h1 style="margin-top:10px">${esc(v.title)}</h1>
    <div class="when"><span>${icon('calendar')} ${esc(fmtDateLong(e.event_date))}</span>${e.event_time ? `<span>${icon('clock')} ${esc(fmtTime(e.event_time))}</span>` : ''}</div>
    <div class="quick-actions">
      ${phone ? `<a class="qa" href="${telUrl(phone)}">${icon('phone')}${esc(L('Κλήση', 'Call'))}</a>${admin ? `<a class="qa" href="${smsUrl(phone)}">${icon('sms')}SMS</a>` : ''}` : ''}
      ${email && admin ? `<a class="qa" href="${mailUrl(email)}">${icon('mail')}Email</a>` : ''}
      ${e.church_location ? `<a class="qa" href="${mapsUrl(e.church_location)}" target="_blank" rel="noopener">${icon('map')}${esc(L('Χάρτης', 'Map'))}</a>` : ''}
      <button class="qa" data-act="ics">${icon('calendar')}${esc(L('Στο κινητό', 'To phone'))}</button>
    </div>
  </div>`;

  // Τοποθεσίες
  const locRow = (ic, t, val, extra = '') => val ? `<div class="row has-icon loc-row"><span class="row-icon" style="background:${ic}">${icon('pin')}</span><div class="main-col"><div class="s">${esc(t)}</div><div class="t" style="white-space:normal">${esc(val)}${extra}</div></div><a class="btn small" href="${mapsUrl(val)}" target="_blank" rel="noopener">${icon('map')} ${esc(L('Χάρτης', 'Map'))}</a></div>` : '';
  html += `<div class="group-label">${esc(L('Τοποθεσίες', 'Locations'))}</div><div class="list">
    ${locRow('var(--red)', L('Εκκλησία / Μυστήριο', 'Church / Ceremony'), e.church_location, e.event_time ? ` · ${esc(fmtTime(e.event_time))}` : '')}
    ${locRow('var(--accent)', L('Σπίτι νύφης / γαμπρού', 'Bride / groom home'), e.house_location)}
    ${locRow('var(--purple)', L('Χώρος δεξίωσης', 'Reception venue'), e.reception_location)}
    ${!e.church_location && !e.house_location && !e.reception_location ? `<div class="row muted">${esc(L('Δεν έχουν οριστεί τοποθεσίες', 'No locations set'))}</div>` : ''}
  </div>`;

  // Ζευγάρι
  if (c) {
    const cr = (n, p, m) => `<div class="row"><div class="main-col"><div class="t">${esc(n || '—')}</div><div class="s">${[p, m].filter(Boolean).map(esc).join(' · ') || '—'}</div></div>
      ${p ? `<a class="icon-btn filled" href="${telUrl(p)}" aria-label="${esc(L('Κλήση', 'Call'))}">${icon('phone')}</a>` : ''}${m ? `<a class="icon-btn filled" href="${mailUrl(m)}" aria-label="Email">${icon('mail')}</a>` : ''}</div>`;
    html += `<div class="group-label">${esc(L('Ζευγάρι / Πελάτης', 'Couple / Customer'))}</div><div class="list">
      ${cr(c.name1, c.phone1, c.email1)}${c.name2 || c.phone2 || c.email2 ? cr(c.name2, c.phone2, c.email2) : ''}
      ${admin ? `<a class="row" href="#/customer/${c.id}"><div class="main-col"><div class="t" style="color:var(--accent)">${esc(L('Καρτέλα πελάτη', 'Customer card'))}</div></div>${icon('chevR', 'chev')}</a>` : ''}
    </div>`;
  }

  // Συνεργείο
  html += `<div class="group-label spread"><span>${esc(L('Συνεργείο', 'Crew'))}</span>${admin ? `<button class="btn plain small" data-act="crew">${icon('edit')} ${esc(L('Αλλαγή', 'Change'))}</button>` : ''}</div>
    <div class="card pad"><div class="chips">${crewChips(v)}</div>${e.extra_crew ? `<div class="small muted mt-s">${esc(L('Εξωτερικοί συνεργάτες', 'External crew'))}: ${esc(e.extra_crew)}</div>` : ''}</div>`;

  // Πακέτο / Προσφορά
  html += `<div class="group-label">${esc(admin ? L('Πακέτο & προσφορά', 'Package & offer') : L('Τι περιλαμβάνει η κάλυψη', 'What the coverage includes'))}</div>`;
  if (admin) {
    html += `<div class="list">
      <div class="offer-box">
        <div class="pdf-thumb">PDF</div>
        <div class="main-col" style="flex:1;min-width:0">
          <div class="t">${esc(f.package_name || L('Προσφορά', 'Offer'))}</div>
          <div class="s">${e.offer_path ? esc(L('Ενημερώθηκε', 'Updated')) + ' ' + esc(fmtDate((e.offer_updated_at || '').slice(0, 10))) : `<span class="neg">${esc(L('Δεν υπάρχει PDF προσφοράς', 'No offer PDF yet'))}</span>`}</div>
        </div>
        ${e.offer_path ? `<button class="btn small primary" data-act="pdf">${icon('doc')} ${esc(L('Άνοιγμα', 'Open'))}</button>` : ''}
      </div>
      <button class="row" data-act="offer-edit"><span class="row-icon" style="background:var(--accent)">${icon('wand')}</span><div class="main-col"><div class="t">${esc(e.offer_data ? L('Επεξεργασία προσφοράς', 'Edit offer') : L('Δημιουργία προσφοράς', 'Create offer'))}</div><div class="s">${esc(L('Ανοίγει ο Οδηγός προσφοράς με τα στοιχεία της εκδήλωσης', 'Opens the offer builder with this event’s details'))}</div></div>${icon('chevR', 'chev')}</button>
      <button class="row" data-act="offer-upload"><span class="row-icon" style="background:var(--blue)">${icon('upload')}</span><div class="main-col"><div class="t">${esc(L('Ανέβασμα έτοιμου PDF', 'Upload a ready PDF'))}</div></div>${icon('chevR', 'chev')}</button>
    </div>`;
    if (e.offer_data) html += `<div class="card pad mt-s">${offerSummaryHTML(e.offer_data)}</div>`;
  } else {
    const myDuty = v.crew.find((x) => x.user_id === S.profile?.id)?.duty || null;
    html += `<div class="card pad">${crewBriefHTML(e, myDuty)}</div>`;
  }

  // Κατάσταση παραγωγής (μόνο διαχειριστές)
  if (admin) {
    html += `<div class="group-label">${esc(L('Παραγωγή', 'Production'))}</div>`;
    html += `<div class="card pad"><div class="form-grid">
      <div class="field"><label>${esc(L('Κατάσταση φωτογραφιών', 'Photos status'))}</label><select class="select" data-patch="photo_status">${options(PHOTO_STATUS, e.photo_status)}</select></div>
      <div class="field"><label>${esc(L('Κατάσταση editing', 'Editing status'))}</label><select class="select" data-patch="editing_status">${options(EDIT_STATUS, e.editing_status)}</select></div>
      ${isVideoAdmin() ? `<div class="field"><label>${esc(L('Υπολογιστής μοντάζ', 'Editing computer'))}</label><select class="select" data-patch="editing_pc">${options(PCS, e.editing_pc, { blank: '—' })}</select></div>
      <div class="field"><label>${esc(L('Σχόλια βίντεο', 'Video notes'))}</label><input class="input" data-patch="video_notes" value="${esc(e.video_notes || '')}"></div>` : ''}
    </div><div class="help mt-s">${esc(L('Όταν οι φωτογραφίες γίνουν «Αλλαγές», το editing γίνεται αυτόματα «Να γίνει».', 'When photos become “Changes”, editing automatically becomes “To do”.'))}</div></div>`;
  }

  if (e.notes) html += `<div class="group-label">${esc(L('Σημειώσεις', 'Notes'))}</div><div class="card pad" style="white-space:pre-wrap">${esc(e.notes)}</div>`;

  // Οικονομικά
  if (admin) {
    const pct = v.price ? Math.min(100, Math.round((v.paid / v.price) * 100)) : 0;
    html += `<div class="group-label spread"><span>${esc(L('Οικονομικά', 'Finances'))}</span><button class="btn plain small" data-act="pay">${icon('plus')} ${esc(L('Προσθήκη δόσης', 'Add installment'))}</button></div>
      <div class="card pad">
        <div class="grid cols-3" style="gap:10px">
          <div><div class="small muted">${esc(L('Αξία πακέτου', 'Package'))}</div><div class="money" style="font-size:20px;font-weight:700">${esc(money(v.price))}</div></div>
          <div><div class="small muted">${esc(L('Εισπράχθηκαν', 'Paid'))}</div><div class="money pos" style="font-size:20px;font-weight:700">${esc(money(v.paid))}</div></div>
          <div><div class="small muted">${esc(L('Υπόλοιπο', 'Balance'))}</div><div class="money ${v.balance > 0 ? 'neg' : ''}" style="font-size:20px;font-weight:700">${esc(money(v.balance))}</div></div>
        </div>
        <div class="progress ${v.fullyPaid ? 'green' : ''} mt"><i style="width:${pct}%"></i></div>
        <div class="small muted mt-s">${v.fullyPaid ? `<span class="pos">✓ ${esc(L('Εξοφλήθηκε πλήρως', 'Fully paid'))}</span>` : esc(L(`${pct}% εξοφλημένο`, `${pct}% paid`))}${f.second_crew ? ' · ' + esc(L('2ο συνεργείο', '2nd crew')) : ''}</div>
        ${f.office_notes ? `<div class="small mt-s"><b>${esc(L('Σημειώσεις γραφείου', 'Office notes'))}:</b> ${esc(f.office_notes)}</div>` : ''}
      </div>
      ${v.pays.length ? `<div class="list mt-s">${v.pays.map((p) => `<button class="row" data-pay="${p.id}"><div class="main-col"><div class="t">${esc(p.label || L('Πληρωμή', 'Payment'))}</div><div class="s">${esc(fmtDate(p.paid_on))} · ${esc(lbl(METHODS, p.method))}${p.notes ? ' · ' + esc(p.notes) : ''}</div></div><div class="v money ${p.amount < 0 ? 'neg' : 'pos'}">${esc(money(p.amount))}</div>${icon('chevR', 'chev')}</button>`).join('')}</div>` : ''}`;

    const msgs = S.queue.filter((m) => m.event_id === id);
    if (msgs.length) {
      html += `<div class="group-label">${esc(L('Μηνύματα προς τον πελάτη', 'Messages to the client'))}</div><div class="list">${msgs.map((m) => {
        const t = S.templates.find((x) => x.id === m.template_id);
        const pill = m.status === 'sent' ? `<span class="pill green">${esc(L('Στάλθηκε', 'Sent'))}</span>` : m.status === 'dismissed' ? `<span class="pill">${esc(L('Παραλείφθηκε', 'Skipped'))}</span>` : `<span class="pill orange">${esc(L('Προς αποστολή', 'To send'))}</span>`;
        return `<a class="row" href="#/outbox/${m.id}"><div class="main-col"><div class="t">${esc(t?.name || L('Μήνυμα', 'Message'))}</div><div class="s">${esc(m.body.slice(0, 90))}…</div></div>${pill}${icon('chevR', 'chev')}</a>`;
      }).join('')}</div>`;
    }

    html += `<div class="group-label">${esc(L('Ενέργειες', 'Actions'))}</div><div class="list">
      <a class="row" href="#/event/${id}/edit"><span class="row-icon">${icon('edit')}</span><div class="main-col"><div class="t">${esc(L('Επεξεργασία στοιχείων', 'Edit details'))}</div></div>${icon('chevR', 'chev')}</a>
      <button class="row" data-act="cancel"><span class="row-icon" style="background:var(--orange)">${icon(e.status === 'cancelled' ? 'refresh' : 'x')}</span><div class="main-col"><div class="t">${esc(e.status === 'cancelled' ? L('Επαναφορά εκδήλωσης', 'Restore event') : L('Ακύρωση εκδήλωσης', 'Cancel event'))}</div><div class="s">${esc(L('Μένει στο ιστορικό, ενημερώνεται το συνεργείο', 'Kept in history, crew is notified'))}</div></div></button>
      <button class="row" data-act="delete"><span class="row-icon" style="background:var(--red)">${icon('trash')}</span><div class="main-col"><div class="t neg">${esc(L('Οριστική διαγραφή', 'Delete permanently'))}</div><div class="s">${esc(L('Διαγράφονται και οι πληρωμές της', 'Its payments are deleted too'))}</div></div></button>
    </div>`;
  }

  root.innerHTML = html;

  // ---- ενέργειες ----
  root.querySelector('[data-act="ics"]')?.addEventListener('click', () => {
    const ics = icsFor(e, `${v.title} · ${lbl(CATEGORIES, e.category)}`, e.church_location || '', [e.house_location && `${L('Σπίτι', 'House')}: ${e.house_location}`, e.reception_location && `${L('Δεξίωση', 'Reception')}: ${e.reception_location}`, e.notes].filter(Boolean).join('\n'));
    download(new Blob([ics], { type: 'text/calendar' }), `imagemakers-${e.event_date}.ics`);
  });
  root.querySelector('[data-act="crew"]')?.addEventListener('click', () => openCrewSheet(id));
  root.querySelector('[data-act="pdf"]')?.addEventListener('click', () => openOffer(e.offer_path));
  root.querySelector('[data-act="offer-edit"]')?.addEventListener('click', () => editOfferForEvent(id));
  root.querySelector('[data-act="offer-upload"]')?.addEventListener('click', () => uploadPdfForEvent(id));
  root.querySelector('[data-act="pay"]')?.addEventListener('click', () => openIncomeForm({ eventId: id }));
  root.querySelectorAll('[data-pay]').forEach((b) => b.addEventListener('click', async () => {
    const p = S.payments.find((x) => x.id === b.dataset.pay);
    const a = await actionSheet({ title: `${p.label || ''} · ${money(p.amount)}`, actions: [{ label: L('Επεξεργασία', 'Edit'), value: 'edit', icon: 'edit' }, { label: L('Διαγραφή', 'Delete'), value: 'del', destructive: true, icon: 'trash' }] });
    if (a === 'edit') openIncomeForm({ payment: p });
    if (a === 'del' && await confirmBox(L('Διαγραφή πληρωμής;', 'Delete payment?'), `${p.label || ''} · ${money(p.amount)}`, { ok: L('Διαγραφή', 'Delete'), destructive: true })) { await deletePayment(p.id); toast(L('Η πληρωμή διαγράφηκε', 'Payment deleted')); }
  }));
  root.querySelectorAll('[data-patch]').forEach((inp) => inp.addEventListener('change', async () => {
    const k = inp.dataset.patch;
    try {
      const before = e.editing_status;
      const upd = await patchEvent(id, { [k]: inp.value || null });
      if (k === 'photo_status' && upd.editing_status !== before) toast(L('Το editing έγινε «Να γίνει»', 'Editing set to “To do”'), { type: 'info' });
      else toast(L('Αποθηκεύτηκε', 'Saved'), { ms: 1400 });
    } catch {}
  }));
  root.querySelector('[data-act="cancel"]')?.addEventListener('click', async () => {
    const cancel = e.status !== 'cancelled';
    if (!await confirmBox(cancel ? L('Ακύρωση εκδήλωσης;', 'Cancel event?') : L('Επαναφορά εκδήλωσης;', 'Restore event?'), cancel ? L('Το συνεργείο θα ειδοποιηθεί.', 'The crew will be notified.') : '', { ok: cancel ? L('Ακύρωση εκδήλωσης', 'Cancel event') : L('Επαναφορά', 'Restore'), destructive: cancel })) return;
    await patchEvent(id, { status: cancel ? 'cancelled' : 'booked' });
    toast(cancel ? L('Η εκδήλωση ακυρώθηκε', 'Event cancelled') : L('Η εκδήλωση επανήλθε', 'Event restored'));
  });
  root.querySelector('[data-act="delete"]')?.addEventListener('click', async () => {
    if (!await confirmBox(L('Οριστική διαγραφή;', 'Delete permanently?'), L(`Θα διαγραφούν η εκδήλωση «${v.title}», οι πληρωμές της και το PDF. Δεν γίνεται αναίρεση.`, `The event “${v.title}”, its payments and PDF will be deleted. This cannot be undone.`), { ok: L('Διαγραφή', 'Delete'), destructive: true })) return;
    await deleteEvent(id);
    toast(L('Η εκδήλωση διαγράφηκε', 'Event deleted'));
    go('#/events');
  });
}

// ---------------------------------------------------------------------
export function openCrewSheet(eventId, { onSave, initial } = {}) {
  const team = S.profiles.filter((p) => p.role && p.active).sort((a, b) => profileName(a).localeCompare(profileName(b)));
  const cur = initial || S.crew.filter((c) => c.event_id === eventId).map((c) => ({ user_id: c.user_id, duty: c.duty }));
  const sel = new Map(cur.map((c) => [c.user_id, c.duty]));
  const defDuty = (p) => (['videographer', 'admin_video'].includes(p.role) ? 'video' : 'photo');
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `<p class="muted small mb">${esc(L('Επιλέξτε ποιοι θα πάνε και με ποια αρμοδιότητα. Θα λάβουν ειδοποίηση.', 'Choose who goes and their duty. They will be notified.'))}</p>
      <div class="list">${team.map((p) => {
        const on = sel.has(p.id);
        return `<div class="row"><label class="hstack" style="flex:1;cursor:pointer;flex-wrap:nowrap"><input type="checkbox" data-u="${p.id}" ${on ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)">${avatar(p)}<div class="main-col"><div class="t">${esc(profileName(p))}</div><div class="s">${esc(lbl([{ v: 'admin_photo', el: 'Διαχειριστής · Φωτογράφος', en: 'Admin · Photographer' }, { v: 'admin_video', el: 'Διαχειριστής · Βιντεογράφος', en: 'Admin · Videographer' }, { v: 'photographer', el: 'Φωτογράφος', en: 'Photographer' }, { v: 'videographer', el: 'Βιντεογράφος', en: 'Videographer' }], p.role))}</div></div></label>
          ${on ? segmented('d_' + p.id, [{ v: 'photo', label: L('Φωτο', 'Photo') }, { v: 'video', label: L('Βίντεο', 'Video') }], sel.get(p.id)) : ''}</div>`;
      }).join('') || `<div class="row muted">${esc(L('Δεν υπάρχουν μέλη με ρόλο.', 'No team members with a role.'))}</div>`}</div>`;
    body.querySelectorAll('[data-u]').forEach((cb) => cb.addEventListener('change', () => {
      const p = team.find((x) => x.id === cb.dataset.u);
      if (cb.checked) sel.set(p.id, defDuty(p)); else sel.delete(p.id);
      draw();
    }));
    initSegmented(body, (name, val) => sel.set(name.slice(2), val));
  };
  draw();
  const s = sheet({
    title: L('Συνεργείο εκδήλωσης', 'Event crew'), body,
    right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>`,
  });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => { const _btn = ev.currentTarget;
    const list = [...sel.entries()].map(([user_id, duty]) => ({ user_id, duty }));
    if (onSave) { onSave(list); s.close(); return; }
    busy(_btn, true);
    try { await setCrew(eventId, list); toast(L('Το συνεργείο ενημερώθηκε', 'Crew updated'), { body: L('Στάλθηκαν ειδοποιήσεις.', 'Notifications sent.') }); s.close(); } catch { busy(_btn, false); }
  });
}
