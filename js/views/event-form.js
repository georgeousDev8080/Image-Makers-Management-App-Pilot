// =====================================================================
//  Νέα εκδήλωση / επεξεργασία (οδηγός σε 4 βήματα)
// =====================================================================
import { COVERAGE, needsOffer, normTime, timeInputAttrs, fmtTime, L, esc, icon, matches, fmtDate, CATEGORIES, RESOLUTIONS, segmented, initSegmented, toast, toastErr, busy, mapsUrl, money, parseMoney } from '../core.js';
import { S, coupleName, profileName, saveCustomer, saveEvent, saveFinance, setCrew, crewDiffers, absencesOn, absenceWhen, uploadOffer, eventView, updateRequest, saveAppointment, copyOfferToEvent } from '../data.js';
import { pageHead, go, backBtn } from '../layout.js';
import { avatar, packageNameFrom, offerSummaryHTML, CREW_TASKS, crewBriefTexts } from '../components.js';
import { pickLocation } from '../mappicker.js';
import { openOfferBuilder, requestToOfferState, pickPdfFile, offerIsStale, refreshOfferPdf, offerKindFor, offerKindOf } from '../offer.js';

let W = null;
let key = '';

function freshState(params) {
  const s = {
    step: params.id && params.step ? Math.min(3, Math.max(0, Number(params.step) || 0)) : 0, mode: params.id ? 'edit' : 'new',
    custMode: 'existing', customerId: null, cq: '',
    cust: { name1: '', name2: '', phone1: '', phone2: '', email1: '', email2: '' },
    ev: { category: 'wedding', coverage: 'both', event_date: params.date || '', event_time: normTime(params.time) || '', resolution: '1080', church_location: '', bride_house: '', groom_house: '', reception_location: '', church_geo: '', bride_geo: '', groom_geo: '', reception_geo: '', notes: '', extra_crew: '' },
    fin: { package_price: '', package_name: '', second_crew: false, office_notes: '' },
    crew: [], crewMode: null, cs: 'mode', tasks: { 1: [], 2: [] }, picked: [],
    offer: { pdf: null, pdfName: '', data: null, existingPath: null },
    requestId: params.request || null,
    appointmentId: params.appointment || null,
  };
  if (!S.customers.size) s.custMode = 'new';
  if (params.customer && S.customers.has(params.customer)) { s.custMode = 'existing'; s.customerId = params.customer; }
  if (params.id) {
    const v = eventView(params.id);
    if (v) {
      const e = v.e;
      s.customerId = e.customer_id; s.custMode = 'existing';
      if (v.c) s.cust = { name1: v.c.name1 || '', name2: v.c.name2 || '', phone1: v.c.phone1 || '', phone2: v.c.phone2 || '', email1: v.c.email1 || '', email2: v.c.email2 || '' };
      Object.keys(s.ev).forEach((k) => { s.ev[k] = e[k] ?? ''; });
      s.ev.event_time = (e.event_time || '').slice(0, 5);
      s.timeUnknown = !e.event_time;
      s.fin = { package_price: v.f.package_price ?? '', package_name: v.f.package_name || '', second_crew: !!v.f.second_crew, office_notes: v.f.office_notes || '' };
      s.crew = v.crew.map((c) => ({ user_id: c.user_id, duty: c.duty, team: c.team ?? null, tasks: c.tasks || [] }));
      s.crewMode = e.crew_mode || 'single';
      if (s.crewMode === 'double') {
        s.picked = s.crew.map((c) => c.user_id);
        [1, 2].forEach((t) => { s.tasks[t] = [...(s.crew.find((c) => c.team === t)?.tasks || [])]; });
      }
      s.offer = { pdf: null, pdfName: '', data: e.offer_data || null, existingPath: e.offer_path || null };
      s.origCategory = e.category;
    }
  }
  if (params.request) {
    const r = S.requests.find((x) => x.id === params.request);
    if (r) {
      s.custMode = 'new';
      s.cust = { name1: r.partner1 || '', name2: r.partner2 || '', phone1: r.phone1 || '', phone2: r.phone2 || '', email1: r.email || '', email2: '' };
      // υπάρχει ήδη ο πελάτης;
      const ph = (r.phone1 || '').replace(/\D/g, '');
      const ex = ph && [...S.customers.values()].find((c) => [c.phone1, c.phone2].some((p) => (p || '').replace(/\D/g, '').endsWith(ph.slice(-10))));
      if (ex) { s.custMode = 'existing'; s.customerId = ex.id; }
      s.ev.event_date = r.wedding_date || '';
      s.ev.event_time = (r.church_time || '').slice(0, 5);
      s.ev.church_location = r.church || '';
      s.ev.reception_location = [r.reception, r.reception_time].filter(Boolean).join(' · ');
      s.offer.data = requestToOfferState(r);
      if (s.offer.data?.adds?.includes('Παράδοση video σε 4K')) s.ev.resolution = '4k';
      if (r.client_total) s.fin.package_price = r.client_total;
      s.fin.package_name = packageNameFrom(s.offer.data);
      s.fin.second_crew = !!s.offer.data?.adds?.includes('2ο συνεργείο');
    }
  }
  if (params.appointment) {
    const a = S.appointments.find((x) => x.id === params.appointment);
    if (a) {
      s.custMode = 'new';
      s.cust = { name1: a.name1 || '', name2: a.name2 || '', phone1: a.phone || '', phone2: '', email1: a.email || '', email2: '' };
      const ph = (a.phone || '').replace(/\D/g, '');
      const ex = a.customer_id && S.customers.has(a.customer_id) ? S.customers.get(a.customer_id)
        : ph && [...S.customers.values()].find((c) => [c.phone1, c.phone2].some((p) => (p || '').replace(/\D/g, '').endsWith(ph.slice(-10))));
      if (ex) { s.custMode = 'existing'; s.customerId = ex.id; }
      s.ev.category = a.category || 'wedding';
      s.ev.event_date = a.event_date || '';
      s.ev.event_time = (a.church_time || '').slice(0, 5);
      s.ev.church_location = a.church || '';
      s.ev.reception_location = [a.reception, a.reception_time].filter(Boolean).join(' · ');
      s.ev.notes = a.notes || '';
      s.offer.data = a.offer_data || (a.selections ? requestToOfferState({ partner1: a.name1, partner2: a.name2, phone1: a.phone, wedding_date: a.event_date, church: a.church, church_time: a.church_time, reception: a.reception, reception_time: a.reception_time, selections: a.selections }) : null);
      s.offer.fromAppointment = a.offer_path || null;
      if (a.offer_path) s.offer.pdfName = L('Προσφορά από το ραντεβού', 'Offer from the appointment');
      if (s.offer.data?.adds?.includes('Παράδοση video σε 4K')) s.ev.resolution = '4k';
      if (a.total != null) s.fin.package_price = a.total;
      if (s.offer.data) { s.fin.package_name = packageNameFrom(s.offer.data); s.fin.second_crew = !!s.offer.data?.adds?.includes('2ο συνεργείο'); }
    }
  }
  return s;
}

/** Ο σωστός Οδηγός για την κατηγορία: βάπτιση → Οδηγός βάπτισης, αλλιώς Οδηγός γάμου */
const offerKind = () => offerKindFor(W.ev.category);
/** Η προσφορά φτιάχτηκε με άλλον Οδηγό (π.χ. γάμου, ενώ η εκδήλωση είναι βάπτιση) — χρειάζεται νέα */
const offerMismatch = () => !!W.offer.data && needsOffer(W.ev.category) && offerKindOf(W.offer.data) !== offerKind()
  && (W.mode !== 'edit' || !!W.offer.pdf || W.ev.category !== W.origCategory);
const offerReady = () => !needsOffer(W.ev.category) || (!!(W.offer.pdf || W.offer.existingPath || W.offer.fromAppointment) && !offerMismatch());
const STEPS = () => [L('Πελάτης', 'Customer'), L('Εκδήλωση', 'Event'), L('Συνεργείο', 'Crew'), needsOffer(W.ev.category) ? L('Προσφορά & πακέτο', 'Offer & package') : L('Πακέτο', 'Package')];

export function renderEventForm(root, params = {}) {
  const k = JSON.stringify([params.id, params.request, params.date, params.customer, params.appointment, params.step]);
  if (!W || k !== key || params._fresh) { W = freshState(params); key = k; params._fresh = false; }
  draw(root, params);
}

function draw(root, params) {
  const steps = STEPS();
  const title = W.mode === 'edit' ? L('Επεξεργασία εκδήλωσης', 'Edit event') : L('Νέα εκδήλωση', 'New event');
  let html = backBtn(W.mode === 'edit' ? `#/event/${params.id}` : W.appointmentId ? '#/appointments' : '#/events') + pageHead(title, { sub: esc(L(`Βήμα ${W.step + 1} από 4 · ${steps[W.step]}`, `Step ${W.step + 1} of 4 · ${steps[W.step]}`)) });
  html += `<div class="steps">${steps.map((s, i) => `<button type="button" data-step="${i}" class="${i < W.step ? 'done' : ''} ${i === W.step ? 'cur' : ''}"><i></i><span>${i + 1}. ${esc(s)}</span></button>`).join('')}</div>`;
  html += `<div id="stepBody" class="view-enter"></div>`;
  html += `<div class="wizard-foot">
    <button class="btn" data-prev ${W.step === 0 ? 'style="visibility:hidden"' : ''}>${icon('chevL')} ${esc(L('Πίσω', 'Back'))}</button>
    ${W.step < 3 ? `<span class="hstack" style="gap:8px">${W.mode === 'edit' ? `<button class="btn large" data-save2>${icon('check')} <span class="hide-mobile">${esc(L('Αποθήκευση', 'Save'))}</span></button>` : ''}<button class="btn primary large" data-next>${esc(L('Επόμενο', 'Next'))} ${icon('chevR')}</button></span>` : `<button class="btn primary large" data-save>${icon('check')} ${esc(W.mode === 'edit' ? L('Αποθήκευση αλλαγών', 'Save changes') : L('Αποθήκευση εκδήλωσης', 'Save event'))}</button>`}
  </div>`;
  root.innerHTML = html;
  const body = root.querySelector('#stepBody');
  [stepCustomer, stepEvent, stepCrew, stepOffer][W.step](body, root, params);

  root.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    const to = Number(b.dataset.step);
    if (to === W.step) return;
    if (to > W.step && !validateUpTo(root, params, to - 1)) return;
    W.step = to; draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  root.querySelector('[data-prev]')?.addEventListener('click', () => {
    if (W.step === 2 && crewBack()) { draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    W.step--; if (W.step === 2) W.cs = W.crewMode === 'double' ? 't2' : W.crewMode === 'single' ? 'single' : 'mode';
    draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  root.querySelector('[data-next]')?.addEventListener('click', () => {
    if (W.step === 2) { const r = crewNext(); if (r === false) return; if (r === 'stay') { draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' }); return; } }
    if (!validate(root, W.step)) return;
    W.step++; if (W.step === 2) W.cs = 'mode';
    draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  root.querySelector('[data-save2]')?.addEventListener('click', (e) => save(root, params, e.currentTarget));
  root.querySelector('[data-save]')?.addEventListener('click', (e) => save(root, params, e.currentTarget));
}

function showErr(root, name, msg) {
  const inp = root.querySelector(`[name="${name}"]`);
  inp?.classList.toggle('invalid', !!msg);
  const err = inp?.closest('.field')?.querySelector('.err') || root.querySelector(`[data-err="${name}"]`);
  if (err) { err.hidden = !msg; err.textContent = msg || ''; }
  return !msg;
}

function validate(root, step) {
  const req = L('Υποχρεωτικό πεδίο', 'Required field');
  if (step === 0) {
    if (W.custMode === 'existing') {
      if (!W.customerId) { toastErr(L('Επιλέξτε πελάτη', 'Choose a customer'), L('Ή πατήστε «Νέος πελάτης».', 'Or tap “New customer”.')); return false; }
      return true;
    }
    let ok = true;
    ok = showErr(root, 'name1', W.cust.name1 ? '' : req) && ok;
    ok = showErr(root, 'phone1', !W.cust.phone1 ? req : W.cust.phone1.replace(/\D/g, '').length < 10 ? L('Ελέγξτε τον αριθμό (10 ψηφία).', 'Check the number (10 digits).') : '') && ok;
    ok = showErr(root, 'email1', !W.cust.email1 ? req : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(W.cust.email1) ? L('Μη έγκυρο email', 'Invalid email') : '') && ok;
    if (W.cust.email2) ok = showErr(root, 'email2', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(W.cust.email2) ? '' : L('Μη έγκυρο email', 'Invalid email')) && ok;
    if (!ok) toastErr(L('Συμπληρώστε τα υποχρεωτικά πεδία', 'Fill in the required fields'));
    return ok;
  }
  if (step === 1) {
    let ok = true;
    ok = showErr(root, 'event_date', W.ev.event_date ? '' : req) && ok;
    if (W.timeUnknown) W.ev.event_time = '';
    ok = showErr(root, 'event_time', W.timeUnknown ? '' : !W.ev.event_time ? req : normTime(W.ev.event_time) === null ? L('Γράψτε την ώρα ως ΩΩ:ΛΛ, π.χ. 18:00', 'Enter the time as HH:MM, e.g. 18:00') : '') && ok;
    if (normTime(W.ev.event_time)) W.ev.event_time = normTime(W.ev.event_time);
    ok = showErr(root, 'church_location', W.ev.church_location ? '' : req) && ok;
    if (!W.ev.category || !W.ev.resolution) ok = false;
    if (!ok) toastErr(L('Συμπληρώστε τα υποχρεωτικά πεδία', 'Fill in the required fields'));
    return ok;
  }
  if (step === 2) {
    if (W.crewMode === 'double') {
      const t1 = W.crew.filter((c) => c.team === 1), t2 = W.crew.filter((c) => c.team === 2);
      if (!t1.length || !t2.length) { toastErr(L('Συμπληρώστε και τα 2 συνεργεία', 'Fill in both crews'), L('Κάθε συνεργείο χρειάζεται τουλάχιστον ένα άτομο.', 'Each crew needs at least one person.')); return false; }
    }
    return true;
  }
  if (step === 3) {
    if (offerMismatch()) { toastErr(L('Χρειάζεται νέα προσφορά', 'A new offer is needed'), offerKind() === 'baptism' ? L('Η προσφορά που υπάρχει είναι για γάμο. Δημιουργήστε την προσφορά με τον Οδηγό προσφοράς βάπτισης.', 'The existing offer is for a wedding. Create the offer with the baptism offer builder.') : L('Η προσφορά που υπάρχει είναι για βάπτιση. Δημιουργήστε νέα με τον Οδηγό προσφοράς.', 'The existing offer is for a baptism. Create a new one with the offer builder.')); return false; }
    if (needsOffer(W.ev.category) && !W.offer.pdf && !W.offer.existingPath && !W.offer.fromAppointment) { toastErr(L('Λείπει η προσφορά (PDF)', 'Offer PDF missing'), L('Δημιουργήστε την με τον Οδηγό προσφοράς ή ανεβάστε έτοιμο PDF.', 'Create it with the offer builder or upload a ready PDF.')); return false; }
    const p = parseMoney(W.fin.package_price);
    if (W.fin.package_price !== '' && (p === null || p < 0)) { showErr(root, 'package_price', L('Μη έγκυρο ποσό', 'Invalid amount')); return false; }
    return true;
  }
  return true;
}
function validateUpTo(root, params, step) {
  if (!validate(root, W.step)) return false;
  for (let i = 0; i <= step; i++) {
    if (!quickValid(i)) { W.step = i; draw(root, params); setTimeout(() => validate(root, i), 30); return false; }
  }
  return true;
}
function quickValid(step) {
  if (step === 0) return W.custMode === 'existing' ? !!W.customerId : !!(W.cust.name1 && W.cust.phone1 && W.cust.email1);
  if (step === 1) return !!(W.ev.event_date && (W.ev.event_time || W.timeUnknown) && W.ev.church_location);
  return true;
}

function bindInputs(container, obj) {
  container.querySelectorAll('[name]').forEach((i) => {
    const ev = i.type === 'checkbox' ? 'change' : 'input';
    i.addEventListener(ev, () => { obj[i.name] = i.type === 'checkbox' ? i.checked : i.value; i.classList.remove('invalid'); const er = i.closest('.field')?.querySelector('.err'); if (er) er.hidden = true; });
  });
}
const fld = (name, label, val, { req = false, type = 'text', ph = '', full = false, inputmode = '', help = '', extra = '' } = {}) =>
  `<div class="field ${full ? 'full' : ''}"><label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label><div class="input-wrap">${type === 'time' ? `<input class="input" name="${name}" ${timeInputAttrs} value="${esc(fmtTime(val))}">` : `<input class="input" name="${name}" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} value="${esc(val ?? '')}" placeholder="${esc(ph)}" autocomplete="off">`}${extra}</div>${help ? `<div class="help">${help}</div>` : ''}<div class="err" hidden></div></div>`;

const locFld = (name, geoKey, label, { req = false, ph = '' } = {}) =>
  `<div class="field full"><label>${esc(label)}${req ? ' <span class="req">*</span>' : ''} <span class="loc-pin" data-pintag="${geoKey}" ${W.ev[geoKey] ? '' : 'hidden'}>· 📍 ${esc(L('pin στον χάρτη', 'pinned'))}</span></label><div class="input-wrap"><input class="input" name="${name}" type="text" value="${esc(W.ev[name] ?? '')}" placeholder="${esc(ph)}" autocomplete="off"><button type="button" class="btn small act pin-btn ${W.ev[geoKey] ? 'on' : ''}" data-pin="${geoKey}" data-field="${name}" title="${esc(L('Pin στον χάρτη', 'Pin on the map'))}">${icon('pin')}</button></div><div class="err" hidden></div></div>`;

// ---------- Βήμα 1: Πελάτης ----------
function stepCustomer(body, root, params) {
  const editingCustomer = W.mode === 'edit' || W.custMode === 'new';
  let html = `<div class="card pad">`;
  html += segmented('cm', [{ v: 'existing', label: L('Υπάρχων πελάτης', 'Existing customer') }, { v: 'new', label: L('Νέος πελάτης', 'New customer') }], W.custMode, { block: true });
  if (W.custMode === 'existing') {
    const list = [...S.customers.values()].filter((c) => matches(W.cq, c.name1, c.name2, c.phone1, c.phone2, c.email1, c.email2)).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 60);
    html += `<div class="search mt">${icon('search')}<input class="input" id="cq" type="search" placeholder="${esc(L('Αναζήτηση πελάτη (όνομα, τηλέφωνο, email)', 'Search customer (name, phone, email)'))}" value="${esc(W.cq)}"></div>
      <div class="list pick-list mt-s" id="clist">${list.map((c) => `<button type="button" class="row pick ${W.customerId === c.id ? 'on' : ''}" data-c="${c.id}"><div class="main-col"><div class="t">${esc(coupleName(c))}</div><div class="s">${esc([c.phone1, c.email1].filter(Boolean).join(' · ') || '—')}</div></div>${W.customerId === c.id ? icon('checkCircle', 'pos') : ''}</button>`).join('') || `<div class="row muted">${esc(L('Δεν βρέθηκε πελάτης. Πατήστε «Νέος πελάτης».', 'No customer found. Tap “New customer”.'))}</div>`}</div>`;
    if (W.customerId && W.mode === 'edit') html += `<div class="help mt-s">${esc(L('Για να αλλάξετε τα στοιχεία του πελάτη, ανοίξτε την εκδήλωση και πατήστε «Καρτέλα πελάτη».', 'To change customer details, open their card in Customers.'))}</div>`;
  } else {
    html += `<div class="form-grid mt">
      ${fld('name1', L('Ονοματεπώνυμο 1', 'Full name 1'), W.cust.name1, { req: true, ph: L('π.χ. Μαρία Παπαδοπούλου', 'e.g. Maria Papadopoulou') })}
      ${fld('name2', L('Ονοματεπώνυμο 2', 'Full name 2'), W.cust.name2, { ph: L('π.χ. Γιώργος Ιωάννου', 'e.g. George Ioannou') })}
      ${fld('phone1', L('Κινητό 1', 'Mobile 1'), W.cust.phone1, { req: true, type: 'tel', inputmode: 'tel', ph: '69XXXXXXXX' })}
      ${fld('phone2', L('Κινητό 2', 'Mobile 2'), W.cust.phone2, { type: 'tel', inputmode: 'tel', ph: '69XXXXXXXX' })}
      ${fld('email1', 'Email 1', W.cust.email1, { req: true, type: 'email', inputmode: 'email', ph: 'name@gmail.com' })}
      ${fld('email2', 'Email 2', W.cust.email2, { type: 'email', inputmode: 'email', ph: 'name@gmail.com' })}
    </div>`;
    // πιθανό διπλότυπο
    html += `<div id="dup"></div>`;
  }
  html += `</div>`;
  body.innerHTML = html;
  initSegmented(body, (_, v) => { W.custMode = v; draw(root, params); });
  bindInputs(body, W.cust);
  const cq = body.querySelector('#cq');
  cq?.addEventListener('input', () => { W.cq = cq.value; const pos = cq.selectionStart; draw(root, params); const n = root.querySelector('#cq'); n.focus(); n.setSelectionRange(pos, pos); });
  body.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => {
    W.customerId = b.dataset.c;
    const c = S.customers.get(W.customerId);
    W.cust = { name1: c.name1 || '', name2: c.name2 || '', phone1: c.phone1 || '', phone2: c.phone2 || '', email1: c.email1 || '', email2: c.email2 || '' };
    draw(root, params);
  }));
  const dup = body.querySelector('#dup');
  if (dup) {
    const check = () => {
      const ph = (W.cust.phone1 || '').replace(/\D/g, '');
      const em = (W.cust.email1 || '').toLowerCase();
      const ex = [...S.customers.values()].find((c) => (ph.length >= 10 && [c.phone1, c.phone2].some((p) => (p || '').replace(/\D/g, '') === ph)) || (em && [c.email1, c.email2].some((m) => (m || '').toLowerCase() === em)));
      dup.innerHTML = ex ? `<div class="banner mt">${icon('warning')}<div><b>${esc(L('Υπάρχει ήδη πελάτης με αυτά τα στοιχεία', 'A customer with these details exists'))}</b><span>${esc(coupleName(ex))} · <a href="#" data-use="${ex.id}">${esc(L('Χρήση αυτού του πελάτη', 'Use this customer'))}</a></span></div></div>` : '';
      dup.querySelector('[data-use]')?.addEventListener('click', (e) => { e.preventDefault(); W.custMode = 'existing'; W.customerId = ex.id; draw(root, params); });
    };
    body.querySelectorAll('[name=phone1],[name=email1]').forEach((i) => i.addEventListener('change', check));
    check();
  }
}

// ---------- Βήμα 2: Εκδήλωση ----------
function stepEvent(body, root, params) {
  const sameDay = W.ev.event_date ? [...S.events.values()].filter((e) => e.event_date === W.ev.event_date && e.id !== params.id && e.status !== 'cancelled') : [];
  const cat = W.ev.category;
  const wed = cat === 'wedding' || cat === 'wedding_baptism'; // σπίτι νύφης/γαμπρού μόνο σε γάμο & γαμοβάπτιση
  const simple = cat === 'promo' || cat === 'other';           // διαφημιστικό/άλλο: μόνο τοποθεσία + σχόλια
  body.innerHTML = `<div class="card pad"><div class="form-grid">
      <div class="field full"><label>${esc(L('Κατηγορία εκδήλωσης', 'Event category'))} <span class="req">*</span></label>
        <div class="chips">${CATEGORIES.map((c) => `<button type="button" class="chip ${W.ev.category === c.v ? 'on' : ''}" data-cat="${c.v}"><span class="cat-dot cat-${c.v}"></span>${esc(L(c.el, c.en))}</button>`).join('')}</div></div>
      ${fld('event_date', L('Ημερομηνία', 'Date'), W.ev.event_date, { req: true, type: 'date' })}
      <div class="field"><label>${esc(simple ? L('Ώρα έναρξης', 'Start time') : L('Ώρα μυστηρίου / έναρξης', 'Ceremony / start time'))} <span class="req">*</span></label>
        <div class="time-split ${W.timeUnknown ? 'unknown' : ''}"><input class="input" name="event_time" ${timeInputAttrs} value="${esc(W.timeUnknown ? '' : fmtTime(W.ev.event_time))}" ${W.timeUnknown ? 'disabled' : ''}><button type="button" class="ts-unknown ${W.timeUnknown ? 'on' : ''}" data-tunk aria-pressed="${W.timeUnknown ? 'true' : 'false'}">${W.timeUnknown ? '✓ ' : ''}${esc(L('Δεν γνωρίζουμε ακόμη', 'Not known yet'))}</button></div>
        ${W.timeUnknown ? `<div class="help">${esc(L('Θα λάβετε υπενθύμιση 3 μήνες πριν, αν δεν έχει μπει ώρα.', 'You’ll get a reminder 3 months before if no time has been set.'))}</div>` : ''}<div class="err" hidden></div></div>
      <div class="field full" id="sameDay"></div>
      <div class="field full"><label>${esc(L('Κάλυψη', 'Coverage'))} <span class="req">*</span></label>${segmented('cov', COVERAGE.map((c) => ({ v: c.v, label: L(c.el, c.en) })), W.ev.coverage || 'both', { block: true })}</div>
      ${W.ev.coverage === 'photo' ? '' : `<div class="field full"><label>${esc(L('Ανάλυση video', 'Video resolution'))} <span class="req">*</span></label>${segmented('res', RESOLUTIONS.map((r) => ({ v: r.v, label: L(r.el, r.en) })), W.ev.resolution, { block: true })}</div>`}
      ${simple ? locFld('church_location', 'church_geo', L('Τοποθεσία', 'Location'), { req: true, ph: L('π.χ. Κεντρική πλατεία, Λάρισα', 'e.g. Central square, Larissa') })
        : locFld('church_location', 'church_geo', L('Εκκλησία / τοποθεσία μυστηρίου', 'Church / ceremony location'), { req: true, ph: L('π.χ. Ι.Ν. Αγίου Αχιλλείου, Λάρισα', 'e.g. St. Achilleios Church, Larissa') })}
      ${wed ? locFld('bride_house', 'bride_geo', L('Σπίτι νύφης', 'Bride’s home'), { ph: L('Διεύθυνση, περιοχή', 'Address, area') }) : ''}
      ${wed ? locFld('groom_house', 'groom_geo', L('Σπίτι γαμπρού', 'Groom’s home'), { ph: L('Διεύθυνση, περιοχή', 'Address, area') }) : ''}
      ${simple ? '' : locFld('reception_location', 'reception_geo', L('Χώρος δεξίωσης', 'Reception venue'), { ph: L('π.χ. Κτήμα …, Λάρισα', 'e.g. Estate …, Larissa') })}
      <div class="field full help" style="margin-top:-4px">${icon('pin')} ${esc(simple ? L('Πατήστε το κουμπί 📍 για να βάλετε pin στον χάρτη. Το συνεργείο πατά «Χάρτης» και πηγαίνει ακριβώς εκεί.', 'Tap 📍 to drop a pin on the map. The crew taps “Map” and goes exactly there.') : L('Πατήστε το κουμπί 📍 δίπλα σε κάθε τοποθεσία για να βάλετε pin στον χάρτη. Το συνεργείο πατά «Χάρτης» και πηγαίνει ακριβώς εκεί.', 'Tap 📍 next to each location to drop a pin on the map. The crew taps “Map” and goes exactly there.'))}</div>
      <div class="field full"><label>${esc(simple ? L('Σχόλια', 'Comments') : L('Σημειώσεις εκδήλωσης', 'Event notes'))}</label><textarea class="textarea" name="notes" placeholder="${esc(simple ? L('Περιγραφή, λεπτομέρειες, ό,τι πρέπει να ξέρει το συνεργείο (τα βλέπει και εκείνο)', 'Description, details, anything the crew should know (they can see this)') : L('Ό,τι πρέπει να ξέρει το συνεργείο (τα βλέπει και εκείνο)', 'Anything the crew should know (they can see this)'))}">${esc(W.ev.notes)}</textarea></div>
    </div></div>`;
  bindInputs(body, W.ev);
  body.querySelector('[data-tunk]')?.addEventListener('click', () => { W.timeUnknown = !W.timeUnknown; if (W.timeUnknown) W.ev.event_time = ''; draw(root, params); if (!W.timeUnknown) setTimeout(() => root.querySelector('[name=event_time]')?.focus(), 50); });
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { if (W.ev.category === b.dataset.cat) return; W.ev.category = b.dataset.cat; draw(root, params); }));
  initSegmented(body, (name, v) => {
    if (name === 'cov') {
      W.ev.coverage = v;
      // βάζουμε τις αρμοδιότητες του συνεργείου σε συμφωνία με την κάλυψη
      if (v === 'photo') W.crew = W.crew.map((c) => (c.duty === 'video' ? { ...c, duty: 'photo' } : c));
      if (v === 'video') W.crew = W.crew.map((c) => (c.duty === 'photo' ? { ...c, duty: 'video' } : c));
      draw(root, params); return;
    }
    W.ev.resolution = v;
  });
  body.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', async () => {
    const key = b.dataset.pin; const field = b.dataset.field;
    const near = W.ev.church_geo || W.ev.reception_geo || W.ev.bride_geo || W.ev.groom_geo || null;
    const v = await pickLocation({ title: L('Pin στον χάρτη', 'Pin on the map'), geo: W.ev[key] || null, label: W.ev[field] || '', near });
    if (v === undefined) return;
    W.ev[key] = v;
    b.classList.toggle('on', !!v);
    const tag = body.querySelector(`[data-pintag="${key}"]`); if (tag) tag.hidden = !v;
  }));
  const sd = body.querySelector('#sameDay');
  const paintSame = () => {
    const list = W.ev.event_date ? [...S.events.values()].filter((e) => e.event_date === W.ev.event_date && e.id !== params.id && e.status !== 'cancelled') : [];
    sd.innerHTML = list.length ? `<div class="banner" style="margin:0">${icon('warning')}<div><b>${esc(L(`Υπάρχουν ήδη ${list.length} εκδηλώσεις αυτή την ημέρα`, `${list.length} events already on this day`))}</b><span>${list.map((e) => esc(coupleName(S.customers.get(e.customer_id)) + (e.church_location ? ' · ' + e.church_location : ''))).join('<br>')}</span></div></div>` : '';
    sd.hidden = !list.length;
  };
  body.querySelector('[name=event_date]').addEventListener('change', paintSame);
  paintSame();
  void sameDay;
}

// ---------- Βήμα 3: Συνεργείο ----------
// Συνεργείο: 1 συνεργείο (όπως πάντα) ή 2 συνεργεία (επιλογή ατόμων → συνεργείο 1 → συνεργείο 2)
const crewTeam = () => S.profiles.filter((p) => p.role && p.active).sort((a, b) => profileName(a).localeCompare(profileName(b)));
const defDuty = (p) => (W.ev.coverage === 'photo' ? 'photo' : W.ev.coverage === 'video' ? 'video' : ['videographer', 'admin_video'].includes(p?.role) ? 'video' : 'photo');
const dutyOpts = () => [{ v: 'photo', label: L('Φωτο', 'Photo') }, { v: 'video', label: L('Βίντεο', 'Video') }, { v: 'drone', label: 'Drone' }].filter((o) => !(W.ev.coverage === 'photo' && o.v === 'video') && !(W.ev.coverage === 'video' && o.v === 'photo'));
/** Δεν είναι διαθέσιμος/η την ημέρα της εκδήλωσης; → κείμενο ωρών, αλλιώς '' */
const unavailable = (uid) => (W.ev.event_date ? absenceWhen(absencesOn(uid, W.ev.event_date)) : '');
const unavailTag = (txt) => `<span class="unavail">(${esc(L('δεν είναι διαθέσιμος/η', 'not available'))}: ${esc(txt)})</span>`;

/** Επόμενο μέσα στο βήμα «Συνεργείο»: 'stay' = άλλαξε υπο-οθόνη, false = σφάλμα, undefined = προχώρα στο επόμενο βήμα */
function crewNext() {
  if (W.cs === 'mode') {
    if (!W.crewMode) W.crewMode = 'single';
    W.cs = W.crewMode === 'double' ? 'pick' : 'single';
    return 'stay';
  }
  if (W.cs === 'pick') {
    if (W.picked.length < 2) { toastErr(L('Επιλέξτε τουλάχιστον 2 άτομα', 'Choose at least 2 people'), L('Για 2 συνεργεία χρειάζεται ένα άτομο σε κάθε συνεργείο.', 'Two crews need at least one person each.')); return false; }
    W.cs = 't1'; return 'stay';
  }
  if (W.cs === 't1') {
    if (!W.crew.some((c) => c.team === 1)) { toastErr(L('Επιλέξτε ποιοι είναι στο συνεργείο 1', 'Choose who is in crew 1')); return false; }
    if (!W.picked.some((u) => !W.crew.some((c) => c.user_id === u && c.team === 1))) { toastErr(L('Δεν έμεινε κανείς για το συνεργείο 2', 'Nobody left for crew 2'), L('Αφήστε τουλάχιστον ένα άτομο για το 2ο συνεργείο.', 'Leave at least one person for crew 2.')); return false; }
    W.cs = 't2'; return 'stay';
  }
  return undefined;
}
function crewBack() {
  const back = { pick: 'mode', single: 'mode', t1: 'pick', t2: 't1' }[W.cs];
  if (!back) return false;
  W.cs = back; return true;
}

function stepCrew(body, root, params) {
  const team = crewTeam();
  const redraw = () => draw(root, params);
  const extra = `<div class="card pad mt"><div class="field"><label>${esc(L('Εξωτερικοί συνεργάτες (προαιρετικό)', 'External crew (optional)'))}</label><input class="input" name="extra_crew" value="${esc(W.ev.extra_crew || '')}" placeholder="${esc(L('π.χ. Νίκος (drone)', 'e.g. Nick (drone)'))}"></div></div>`;
  const subtitle = (n, t, sub) => `<div class="crew-sub"><span class="crew-sub-n">${n}</span><div><b>${esc(t)}</b>${sub ? `<div class="small muted">${esc(sub)}</div>` : ''}</div></div>`;
  const person = (p, { on, disabled, extraHtml = '' }) => {
    const un = unavailable(p.id);
    return `<div class="row ${disabled ? 'is-off' : ''}"><label class="hstack" style="flex:1;cursor:${disabled ? 'not-allowed' : 'pointer'};flex-wrap:nowrap"><input type="checkbox" data-u="${p.id}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} style="width:22px;height:22px;accent-color:var(--accent)">${avatar(p)}<div class="main-col"><div class="t" style="white-space:normal">${esc(profileName(p))} ${un ? unavailTag(un) : ''}</div></div></label>${extraHtml}</div>`;
  };
  const wedCat = ['wedding', 'wedding_baptism'].includes(W.ev.category);
  const HOUSES = ['groom_house', 'bride_house'];
  const opt = (v) => CREW_TASKS.find((k) => k.v === v);
  // 1ο συνεργείο: πάει σε όλη την εκδήλωση· διαλέγετε μόνο σε ποιο σπίτι (γαμπρού ή νύφης)
  // 2ο συνεργείο: τα υπόλοιπα· το σπίτι του 1ου συνεργείου είναι γκρι
  const taskBoxes = (t) => {
    if (t === 1) {
      return `<div class="card pad mt"><b>${esc(wedCat ? L('Σε ποιο σπίτι πηγαίνει το συνεργείο 1;', 'Which home does crew 1 go to?') : L('Το συνεργείο 1 πηγαίνει σε όλη την εκδήλωση.', 'Crew 1 covers the whole event.'))}</b>
        ${wedCat ? `<div class="task-grid mt-s">${HOUSES.map((v) => `<label class="task-box ${W.tasks[1].includes(v) ? 'on' : ''}"><input type="radio" name="t1house" data-house="${v}" ${W.tasks[1].includes(v) ? 'checked' : ''}><span>${esc(L(opt(v).el, opt(v).en))}</span></label>`).join('')}</div>
        <div class="help mt-s">${esc(L('Εκκλησία και κέντρο τα καλύπτει πάντα το 1ο συνεργείο.', 'Crew 1 always covers the church and the reception.'))}</div>` : ''}</div>`;
    }
    const taken = W.tasks[1].filter((x) => HOUSES.includes(x));
    const list = [...(wedCat ? HOUSES : []), 'church', 'reception', 'drone'];
    return `<div class="card pad mt"><b>${esc(L('Τι αναλαμβάνει το συνεργείο 2', 'What crew 2 covers'))}</b>
      <div class="task-grid mt-s">${list.map((v) => { const off = taken.includes(v); const on = !off && W.tasks[2].includes(v); return `<label class="task-box ${on ? 'on' : ''} ${off ? 'off' : ''}"><input type="checkbox" data-task="${v}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''}><span>${esc(L(opt(v).el, opt(v).en))}${off ? ` <small>(${esc(L('συνεργείο 1', 'crew 1'))})</small>` : ''}</span></label>`; }).join('')}</div></div>`;
  };
  const syncTasks = (t) => { W.crew = W.crew.map((c) => (c.team === t ? { ...c, tasks: [...W.tasks[t]] } : c)); };
  const bindHouse = () => body.querySelectorAll('[data-house]').forEach((rb) => rb.addEventListener('click', () => {
    const v = rb.dataset.house;
    const had = W.tasks[1].includes(v);
    W.tasks[1] = ['all', ...(had ? [] : [v])]; // ξαναπατώντας το ίδιο σπίτι, ακυρώνεται
    W.tasks[2] = W.tasks[2].filter((x) => x !== v);
    syncTasks(1); syncTasks(2); redraw();
  }));
  const bindTasks = (t) => body.querySelectorAll('[data-task]').forEach((cb) => cb.addEventListener('change', () => {
    const v = cb.dataset.task;
    W.tasks[t] = cb.checked ? [...new Set([...W.tasks[t], v])] : W.tasks[t].filter((x) => x !== v);
    cb.closest('.task-box').classList.toggle('on', cb.checked);
    syncTasks(t);
  }));

  // Οθόνη 1: πόσα συνεργεία
  if (W.cs === 'mode') {
    body.innerHTML = `<div class="crew-modes">
        <button type="button" class="crew-mode ${W.crewMode !== 'double' ? 'on' : ''}" data-cm="single"><span class="cm-ic">${icon('users')}</span><b>${esc(L('1 συνεργείο', '1 crew'))}</b><span>${esc(L('(βασικό)', '(main)'))}</span></button>
        <button type="button" class="crew-mode ${W.crewMode === 'double' ? 'on' : ''}" data-cm="double"><span class="cm-ic">${icon('users')}${icon('users')}</span><b>${esc(L('2 συνεργεία', '2 crews'))}</b><span>${esc(L('χωρίζονται οι αρμοδιότητες', 'tasks are split'))}</span></button>
      </div>
      <p class="muted small center mt">${esc(L('Προαιρετικό: μπορείτε να ορίσετε το συνεργείο και αργότερα.', 'Optional: you can set the crew later.'))}</p>`;
    body.querySelectorAll('[data-cm]').forEach((b) => b.addEventListener('click', () => {
      const m = b.dataset.cm;
      if (m !== W.crewMode) {
        // αλλαγή τύπου: κρατάμε τα άτομα, μηδενίζουμε τη διαίρεση σε συνεργεία
        W.crewMode = m;
        if (m === 'double') { W.picked = W.crew.map((c) => c.user_id); W.crew = W.crew.map((c) => ({ ...c, team: null, tasks: [] })); W.tasks = { 1: [], 2: [] }; }
        else W.crew = W.crew.map((c) => ({ ...c, team: null, tasks: [] }));
      }
      W.cs = m === 'double' ? 'pick' : 'single';
      redraw();
    }));
    return;
  }

  // 1 συνεργείο: όπως πάντα (Φωτο / Βίντεο / Drone ανά άτομο)
  if (W.cs === 'single') {
    const sel = new Map(W.crew.map((c) => [c.user_id, c.duty]));
    const write = () => { W.crew = [...sel.entries()].map(([user_id, duty]) => ({ user_id, duty, team: null, tasks: [] })); };
    body.innerHTML = subtitle('1', L('1 συνεργείο (βασικό)', '1 crew (main)'), L('Όσοι επιλεγούν θα λάβουν ειδοποίηση με τα στοιχεία της εκδήλωσης και την αρμοδιότητά τους (χωρίς οικονομικά).', 'Selected members get a notification with the event details and their duty (no finances).'))
      + `<div class="list mt-s">${team.map((p) => {
        const on = sel.has(p.id); const un = unavailable(p.id);
        return person(p, { on, disabled: !!un && !on, extraHtml: on ? segmented('d_' + p.id, dutyOpts(), sel.get(p.id)) : '' });
      }).join('') || `<div class="row muted">${esc(L('Δεν υπάρχουν ακόμα μέλη ομάδας με ρόλο.', 'No team members with a role yet.'))}</div>`}</div>` + extra;
    body.querySelectorAll('[data-u]').forEach((cb) => cb.addEventListener('change', () => {
      const p = team.find((x) => x.id === cb.dataset.u);
      if (cb.checked) sel.set(p.id, defDuty(p)); else sel.delete(p.id);
      write(); redraw();
    }));
    initSegmented(body, (name, val) => { sel.set(name.slice(2), val); write(); });
    bindInputs(body, W.ev);
    return;
  }

  // 2 συνεργεία · Οθόνη 2: ποιοι θα πάνε (μόνο ονόματα)
  if (W.cs === 'pick') {
    body.innerHTML = subtitle('2', L('Επιλέξτε συνολικά τα άτομα', 'Choose everyone who goes'), L('Όλοι όσοι θα πάνε και στα 2 συνεργεία. Στα επόμενα βήματα τους χωρίζετε.', 'Everyone going in both crews. You split them in the next steps.'))
      + `<div class="list mt-s">${team.map((p) => { const on = W.picked.includes(p.id); return person(p, { on, disabled: !!unavailable(p.id) && !on }); }).join('')}</div>` + extra;
    body.querySelectorAll('[data-u]').forEach((cb) => cb.addEventListener('change', () => {
      const u = cb.dataset.u;
      if (cb.checked) W.picked = [...new Set([...W.picked, u])];
      else { W.picked = W.picked.filter((x) => x !== u); W.crew = W.crew.filter((c) => c.user_id !== u); }
    }));
    bindInputs(body, W.ev);
    return;
  }

  // Οθόνη 3 / 4: συνεργείο 1 (από όσους επιλέχθηκαν) και συνεργείο 2 (από όσους έμειναν)
  const t = W.cs === 't1' ? 1 : 2;
  const pool = W.picked.map((u) => team.find((p) => p.id === u)).filter(Boolean)
    .filter((p) => t === 1 || !W.crew.some((c) => c.user_id === p.id && c.team === 1));
  body.innerHTML = subtitle(t === 1 ? '3' : '4', t === 1 ? (['wedding', 'wedding_baptism'].includes(W.ev.category) ? L('Επιλέξτε το 1ο συνεργείο (βασικό) (Πηγαίνει σε όλο τον γάμο)', 'Choose crew 1 (main) (Covers the whole wedding)') : L('Επιλέξτε το 1ο συνεργείο (βασικό) (Πηγαίνει σε όλη την εκδήλωση)', 'Choose crew 1 (main) (Covers the whole event)')) : L('Επιλέξτε το 2ο συνεργείο', 'Choose crew 2'), t === 1 ? L('Από τα άτομα που επιλέξατε.', 'From the people you chose.') : L('Από τα άτομα που έμειναν. Όποιος δεν επιλεγεί, δεν θα πάει.', 'From the people left. Anyone not chosen will not go.'))
    + `<div class="list mt-s">${pool.map((p) => person(p, { on: W.crew.some((c) => c.user_id === p.id && c.team === t) })).join('') || `<div class="row muted">${esc(L('Δεν έμεινε κανείς.', 'Nobody left.'))}</div>`}</div>`
    + taskBoxes(t);
  if (t === 1 && !W.tasks[1].includes('all')) { W.tasks[1] = ['all', ...W.tasks[1].filter((x) => HOUSES.includes(x))]; syncTasks(1); }
  body.querySelectorAll('[data-u]').forEach((cb) => cb.addEventListener('change', () => {
    const u = cb.dataset.u;
    W.crew = W.crew.filter((c) => c.user_id !== u);
    if (cb.checked) W.crew.push({ user_id: u, duty: defDuty(team.find((p) => p.id === u)), team: t, tasks: [...W.tasks[t]] });
  }));
  bindTasks(t);
  bindHouse();
}

// ---------- Βήμα 4: Προσφορά ----------
function stepOffer(body, root, params) {
  const mism = offerMismatch();
  const has = offerReady() && needsOffer(W.ev.category);
  const bap = offerKind() === 'baptism';
  const c = W.custMode === 'existing' && W.customerId ? S.customers.get(W.customerId) : W.cust;
  const withOffer = needsOffer(W.ev.category);
  body.innerHTML = `${withOffer ? `
    <div class="card pad">
      <div class="spread"><b>${esc(L('Προσφορά (PDF)', 'Offer (PDF)'))} <span class="req" style="color:var(--red)">*</span></b>${has ? `<span class="pill green">${icon('check')} ${esc(L('Επισυνάφθηκε', 'Attached'))}</span>` : mism ? `<span class="pill red">${esc(L('Χρειάζεται νέα', 'New one needed'))}</span>` : `<span class="pill red">${esc(L('Λείπει', 'Missing'))}</span>`}</div>
      <p class="muted small mt-s">${esc(L('Το PDF το βλέπουν μόνο οι διαχειριστές. Το συνεργείο βλέπει μόνο τι περιλαμβάνει το πακέτο, χωρίς τιμές.', 'Only admins can open the PDF. The crew only sees what the package includes, without prices.'))}</p>
      ${mism ? `<div class="banner mt-s" style="margin-bottom:0">${icon('warning')}<div><b>${esc(bap ? L('Η προσφορά που υπάρχει είναι για γάμο', 'The existing offer is for a wedding') : L('Η προσφορά που υπάρχει είναι για βάπτιση', 'The existing offer is for a baptism'))}</b><span>${esc(bap ? L('Για βάπτιση η προσφορά γίνεται με τον Οδηγό προσφοράς βάπτισης. Πατήστε το κουμπί από κάτω.', 'For a baptism, the offer is made with the baptism offer builder. Tap the button below.') : L('Δημιουργήστε νέα προσφορά με τον Οδηγό προσφοράς.', 'Create a new offer with the offer builder.'))}</span></div></div>` : ''}
      ${has ? `<div class="offer-box" style="padding:12px 0 0"><div class="pdf-thumb">PDF</div><div class="main-col" style="flex:1"><div class="t">${esc(W.offer.pdfName || L('Υπάρχουσα προσφορά', 'Existing offer'))}</div><div class="s">${esc(W.offer.pdf ? L('Θα ανέβει με την αποθήκευση', 'Will upload when you save') : W.offer.fromAppointment && !W.offer.existingPath ? L('Από το ραντεβού — θα αντιγραφεί στην εκδήλωση', 'From the appointment — will be copied to the event') : L('Ήδη αποθηκευμένη', 'Already saved'))}</div></div></div>` : ''}
      <div class="grid cols-2 mt" style="gap:10px">
        <button class="btn primary large" data-builder>${icon('wand')} ${esc(W.offer.data && !mism ? (bap ? L('Επεξεργασία στον Οδηγό βάπτισης', 'Edit in baptism builder') : L('Επεξεργασία στον Οδηγό προσφοράς', 'Edit in offer builder')) : (bap ? L('Δημιουργία με τον Οδηγό βάπτισης', 'Create with baptism builder') : L('Δημιουργία με τον Οδηγό προσφοράς', 'Create with offer builder')))}</button>
        <button class="btn large" data-upload>${icon('upload')} ${esc(L('Ανέβασμα έτοιμου PDF', 'Upload ready PDF'))}</button>
      </div>
      <div class="help mt-s">${esc(bap ? L('Ο Οδηγός βάπτισης (πακέτο 680€, αναβαθμίσεις, album, εκτυπώσεις) ανοίγει συμπληρωμένος με τα στοιχεία των γονέων. Πατήστε «Αποθήκευση στην εκδήλωση» όταν τελειώσετε.', 'The baptism builder (680€ package, upgrades, album, prints) opens pre-filled with the parents’ details. Tap “Save to event” when done.') : L('Ο Οδηγός ανοίγει συμπληρωμένος με τα στοιχεία του ζευγαριού. Πατήστε «Αποθήκευση στην εκδήλωση» όταν τελειώσετε.', 'The builder opens pre-filled with the couple’s details. Tap “Save to event” when done.'))}</div>
    </div>
    ${W.offer.data && !mism ? `<div class="card pad mt">${offerSummaryHTML(W.offer.data)}</div>` : ''}` : ''}
    <div class="card pad ${withOffer ? 'mt' : ''}"><div class="form-grid">
      ${fld('package_price', L('Τελική αξία πακέτου (€)', 'Final package value (€)'), W.fin.package_price, { inputmode: 'decimal', ph: '2800', help: esc(withOffer ? L('Συμπληρώνεται αυτόματα από τον Οδηγό. Όταν οι πληρωμές φτάσουν αυτό το ποσό, η γραμμή στο Excel γίνεται πράσινη.', 'Filled automatically by the builder. When payments reach this amount, the Excel row turns green.') : L('Η συμφωνημένη αξία. Όταν οι πληρωμές φτάσουν αυτό το ποσό, η γραμμή στο Excel γίνεται πράσινη.', 'The agreed value. When payments reach this amount, the Excel row turns green.')), extra: '<span class="suffix">€</span>' })}
      ${fld('package_name', L('Όνομα πακέτου', 'Package name'), W.fin.package_name, { ph: 'BASIC PAC' })}
      <label class="check-row full"><span class="switch"><input type="checkbox" name="second_crew" ${W.fin.second_crew ? 'checked' : ''}><span></span></span><span>${esc(L('Δεύτερο συνεργείο', 'Second crew'))}</span></label>
      <div class="field full"><label>${esc(L('Σημειώσεις γραφείου (μόνο για διαχειριστές)', 'Office notes (admins only)'))}</label><textarea class="textarea" name="office_notes" style="min-height:70px">${esc(W.fin.office_notes)}</textarea></div>
    </div></div>
    <div class="card pad mt"><b>${esc(L('Σύνοψη', 'Summary'))}</b>
      <div class="small mt-s" style="line-height:1.7">${esc(coupleName(c))}<br>${esc(fmtDate(W.ev.event_date))} · ${esc(W.ev.event_time || (W.timeUnknown ? L('ώρα: δεν γνωρίζουμε ακόμη', 'time: not known yet') : '—'))} · ${esc(W.ev.church_location || '—')}<br>${esc(L('Συνεργείο', 'Crew'))}: ${esc(W.crew.map((x) => profileName(S.profiles.find((p) => p.id === x.user_id))).join(', ') || '—')}</div></div>`;
  bindInputs(body, W.fin);
  body.querySelector('[data-builder]')?.addEventListener('click', async () => {
    const kind = offerKind();
    const same = W.offer.data && offerKindOf(W.offer.data) === kind;
    const res = await openOfferBuilder({ kind, prefill: { ...(same ? W.offer.data : {}), partner1: c?.name1 || '', partner2: c?.name2 || '', phone1: c?.phone1 || '', phone2: c?.phone2 || '', eventDate: W.ev.event_date, church: [W.ev.church_location, W.ev.event_time].filter(Boolean).join(' · '), reception: kind === 'baptism' ? '' : W.ev.reception_location, city: (W.ev.church_location || '').split(',').pop().trim(), finalPrice: same ? (W.fin.package_price || undefined) : undefined } });
    if (!res) return;
    W.offer.pdf = res.pdf; W.offer.pdfName = res.fileName; W.offer.data = res.state;
    if (W.custMode === 'new') { W.cust.name1 = res.state.partner1 || W.cust.name1; W.cust.name2 = res.state.partner2 || ''; W.cust.phone1 = res.state.phone1 || W.cust.phone1; }
    if (res.state.eventDate) W.ev.event_date = res.state.eventDate;
    W.fin.package_price = res.total; W.fin.package_name = packageNameFrom(res.state); W.fin.second_crew = (res.state.adds || []).includes('2ο συνεργείο');
    if ((res.state.adds || []).includes('Παράδοση video σε 4K')) W.ev.resolution = '4k';
    toast(L('Η προσφορά επισυνάφθηκε', 'Offer attached'), { body: `${money(res.total, { dec: 0 })} · ${W.fin.package_name}` });
    draw(root, params);
  });
  body.querySelector('[data-upload]')?.addEventListener('click', async () => {
    const f = await pickPdfFile();
    if (!f) return;
    W.offer.pdf = f; W.offer.pdfName = f.name;
    if (offerMismatch()) { W.offer.data = null; W.offer.dataCleared = true; } // έτοιμο PDF στη θέση προσφοράς άλλου τύπου
    draw(root, params);
  });
}

// ---------- Αποθήκευση ----------
let saving = false;
async function save(root, params, btn) {
  if (saving) return;
  for (let i = 0; i < 4; i++) if (!quickValid(i)) { W.step = i; draw(root, params); validate(root, i); return; }
  if (!validate(root, 3)) return;
  saving = true; busy(btn, true, L('Αποθήκευση…', 'Saving…'));
  try {
    let customerId = W.customerId;
    if (W.custMode === 'new') {
      const c = await saveCustomer({ ...W.cust });
      customerId = c.id; W.customerId = c.id; W.custMode = 'existing';
    }
    // Διορθώθηκαν στοιχεία μετά τη δημιουργία της προσφοράς; Το PDF ξαναφτιάχνεται με τα σωστά.
    const hasPdf = needsOffer(W.ev.category) && (W.offer.pdf || W.offer.existingPath || W.offer.fromAppointment);
    if (W.offer.data && hasPdf) {
      const cc = S.customers.get(customerId) || W.cust;
      const cur = { partner1: cc.name1 || '', partner2: cc.name2 || '', phone1: cc.phone1 || '', eventDate: W.ev.event_date || '', church: [W.ev.church_location, (W.ev.event_time || '').slice(0, 5)].filter(Boolean).join(' · '), reception: W.ev.reception_location || '' };
      if (offerIsStale(W.offer.data, cur)) {
        busy(btn, true, L('Ενημέρωση PDF με τα σωστά στοιχεία…', 'Updating the PDF with the correct details…'));
        try { const r = await refreshOfferPdf(W.offer.data, cur); W.offer.pdf = r.pdf; W.offer.pdfName = r.fileName; W.offer.data = r.state; }
        catch (err) { console.warn(err); toastErr(L('Το PDF δεν ενημερώθηκε', 'PDF not updated'), L('Ανοίξτε τον Οδηγό προσφοράς από την εκδήλωση και αποθηκεύστε ξανά.', 'Open the offer builder from the event and save again.')); }
        busy(btn, true, L('Αποθήκευση…', 'Saving…'));
      }
    }
    const evRow = { ...W.ev, customer_id: customerId, event_time: W.timeUnknown ? null : (W.ev.event_time || null) };
    if (W.mode === 'edit') evRow.id = params.id;
    else if (W.savedId) evRow.id = W.savedId; // νέα προσπάθεια μετά από σφάλμα: όχι δεύτερη εκδήλωση
    if (W.offer.data) evRow.offer_data = W.offer.data;
    else if (W.offer.dataCleared) evRow.offer_data = null;
    // πεδία που δεν υπάρχουν στην κατηγορία: σπίτια μόνο σε γάμο/γαμοβάπτιση, δεξίωση όχι σε διαφημιστικό/άλλο
    if (!['wedding', 'wedding_baptism'].includes(evRow.category)) Object.assign(evRow, { bride_house: null, groom_house: null, bride_geo: null, groom_geo: null, house_location: null });
    if (['promo', 'other'].includes(evRow.category)) Object.assign(evRow, { reception_location: null, reception_geo: null });
    const prevMode = (evRow.id && S.events.get(evRow.id)?.crew_mode) || 'single';
    evRow.crew_mode = W.crewMode === 'double' ? 'double' : 'single';
    const ev = await saveEvent(evRow);
    W.savedId = ev.id;
    if (!needsOffer(W.ev.category)) { /* διαφημιστικό/άλλο: χωρίς PDF προσφοράς */ }
    else if (W.offer.pdf) {
      const path = await uploadOffer(ev.id, W.offer.pdf);
      await saveEvent({ id: ev.id, offer_path: path, offer_updated_at: new Date().toISOString() });
      W.offer.existingPath = path; W.offer.pdf = null;
    } else if (W.offer.fromAppointment && !W.offer.existingPath) {
      const path = await copyOfferToEvent(W.offer.fromAppointment, ev.id);
      await saveEvent({ id: ev.id, offer_path: path, offer_updated_at: new Date().toISOString() });
      W.offer.existingPath = path;
    }
    const price = parseMoney(W.fin.package_price);
    await saveFinance(ev.id, { package_price: price, package_name: W.fin.package_name || null, second_crew: !!W.fin.second_crew, office_notes: W.fin.office_notes || null });
    // συνεργείο: αν άλλαξε η σύνθεση/οι αρμοδιότητες, ξαναγράφονται τα κείμενα ανάθεσης
    const mode = W.crewMode === 'double' ? 'double' : 'single';
    const list = (mode === 'double' ? W.crew.filter((c) => c.team === 1 || c.team === 2) : W.crew.map((c) => ({ ...c, team: null, tasks: [] })))
      .map((c) => ({ user_id: c.user_id, duty: c.duty || 'photo', team: c.team ?? null, tasks: c.tasks || [] }));
    const cur = S.crew.filter((c) => c.event_id === ev.id);
    const configChanged = prevMode !== mode || cur.length !== list.length || list.some((l) => { const c = cur.find((x) => x.user_id === l.user_id); return !c || c.duty !== l.duty || (c.team ?? null) !== l.team || JSON.stringify([...(c.tasks || [])].sort()) !== JSON.stringify([...l.tasks].sort()); });
    if (configChanged) {
      const texts = crewBriefTexts(mode, list, W.ev.coverage);
      const withBriefs = list.map((l) => ({ ...l, brief: texts[l.user_id] || null }));
      if (crewDiffers(ev.id, withBriefs)) await setCrew(ev.id, withBriefs);
    }
    if (W.appointmentId) await saveAppointment({ id: W.appointmentId, status: 'confirmed', event_id: ev.id, customer_id: customerId, handled_by: S.profile.id }).catch(() => {});
    if (W.requestId) await updateRequest(W.requestId, { status: 'converted', event_id: ev.id, customer_id: customerId, handled_by: S.profile.id }).catch(() => {});
    toast(W.mode === 'edit' ? L('Οι αλλαγές αποθηκεύτηκαν', 'Changes saved') : L('Η εκδήλωση δημιουργήθηκε! 🎉', 'Event created! 🎉'), { body: W.crew.length ? L('Το συνεργείο ειδοποιήθηκε.', 'The crew was notified.') : '' });
    W = null; key = '';
    go(`#/event/${ev.id}`);
  } catch (e) {
    console.error(e);
  } finally { saving = false; busy(btn, false); }
}
