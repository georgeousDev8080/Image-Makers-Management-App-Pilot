// =====================================================================
//  Νέα εκδήλωση / επεξεργασία (οδηγός σε 4 βήματα)
// =====================================================================
import { needsOffer, normTime, timeInputAttrs, fmtTime, L, esc, icon, matches, fmtDate, CATEGORIES, RESOLUTIONS, segmented, initSegmented, toast, toastErr, busy, mapsUrl, money, parseMoney } from '../core.js';
import { S, coupleName, profileName, saveCustomer, saveEvent, saveFinance, setCrew, uploadOffer, eventView, updateRequest, saveAppointment, copyOfferToEvent } from '../data.js';
import { pageHead, go, backBtn } from '../layout.js';
import { avatar, packageNameFrom, offerSummaryHTML } from '../components.js';
import { pickLocation } from '../mappicker.js';
import { openOfferBuilder, requestToOfferState, pickPdfFile, offerIsStale, refreshOfferPdf } from '../offer.js';

let W = null;
let key = '';

function freshState(params) {
  const s = {
    step: 0, mode: params.id ? 'edit' : 'new',
    custMode: 'existing', customerId: null, cq: '',
    cust: { name1: '', name2: '', phone1: '', phone2: '', email1: '', email2: '' },
    ev: { category: 'wedding', event_date: params.date || '', event_time: normTime(params.time) || '', resolution: '1080', church_location: '', bride_house: '', groom_house: '', reception_location: '', church_geo: '', bride_geo: '', groom_geo: '', reception_geo: '', notes: '', extra_crew: '' },
    fin: { package_price: '', package_name: '', second_crew: false, office_notes: '' },
    crew: [],
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
      s.fin = { package_price: v.f.package_price ?? '', package_name: v.f.package_name || '', second_crew: !!v.f.second_crew, office_notes: v.f.office_notes || '' };
      s.crew = v.crew.map((c) => ({ user_id: c.user_id, duty: c.duty }));
      s.offer = { pdf: null, pdfName: '', data: e.offer_data || null, existingPath: e.offer_path || null };
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

const STEPS = () => [L('Πελάτης', 'Customer'), L('Εκδήλωση', 'Event'), L('Συνεργείο', 'Crew'), needsOffer(W.ev.category) ? L('Προσφορά & πακέτο', 'Offer & package') : L('Πακέτο', 'Package')];

export function renderEventForm(root, params = {}) {
  const k = JSON.stringify([params.id, params.request, params.date, params.customer, params.appointment]);
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
    ${W.step < 3 ? `<button class="btn primary large" data-next>${esc(L('Επόμενο', 'Next'))} ${icon('chevR')}</button>` : `<button class="btn primary large" data-save>${icon('check')} ${esc(W.mode === 'edit' ? L('Αποθήκευση αλλαγών', 'Save changes') : L('Αποθήκευση εκδήλωσης', 'Save event'))}</button>`}
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
  root.querySelector('[data-prev]')?.addEventListener('click', () => { W.step--; draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  root.querySelector('[data-next]')?.addEventListener('click', () => {
    if (!validate(root, W.step)) return;
    W.step++; draw(root, params); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
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
    ok = showErr(root, 'event_time', !W.ev.event_time ? req : normTime(W.ev.event_time) === null ? L('Γράψτε την ώρα ως ΩΩ:ΛΛ, π.χ. 18:00', 'Enter the time as HH:MM, e.g. 18:00') : '') && ok;
    if (normTime(W.ev.event_time)) W.ev.event_time = normTime(W.ev.event_time);
    ok = showErr(root, 'church_location', W.ev.church_location ? '' : req) && ok;
    if (!W.ev.category || !W.ev.resolution) ok = false;
    if (!ok) toastErr(L('Συμπληρώστε τα υποχρεωτικά πεδία', 'Fill in the required fields'));
    return ok;
  }
  if (step === 3) {
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
  if (step === 1) return !!(W.ev.event_date && W.ev.event_time && W.ev.church_location);
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
      ${fld('event_time', simple ? L('Ώρα έναρξης', 'Start time') : L('Ώρα μυστηρίου / έναρξης', 'Ceremony / start time'), W.ev.event_time, { req: true, type: 'time' })}
      <div class="field full" id="sameDay"></div>
      <div class="field full"><label>${esc(L('Ανάλυση video', 'Video resolution'))} <span class="req">*</span></label>${segmented('res', RESOLUTIONS.map((r) => ({ v: r.v, label: L(r.el, r.en) })), W.ev.resolution, { block: true })}</div>
      ${simple ? locFld('church_location', 'church_geo', L('Τοποθεσία', 'Location'), { req: true, ph: L('π.χ. Κεντρική πλατεία, Λάρισα', 'e.g. Central square, Larissa') })
        : locFld('church_location', 'church_geo', L('Εκκλησία / τοποθεσία μυστηρίου', 'Church / ceremony location'), { req: true, ph: L('π.χ. Ι.Ν. Αγίου Αχιλλείου, Λάρισα', 'e.g. St. Achilleios Church, Larissa') })}
      ${wed ? locFld('bride_house', 'bride_geo', L('Σπίτι νύφης', 'Bride’s home'), { ph: L('Διεύθυνση, περιοχή', 'Address, area') }) : ''}
      ${wed ? locFld('groom_house', 'groom_geo', L('Σπίτι γαμπρού', 'Groom’s home'), { ph: L('Διεύθυνση, περιοχή', 'Address, area') }) : ''}
      ${simple ? '' : locFld('reception_location', 'reception_geo', L('Χώρος δεξίωσης', 'Reception venue'), { ph: L('π.χ. Κτήμα …, Λάρισα', 'e.g. Estate …, Larissa') })}
      <div class="field full help" style="margin-top:-4px">${icon('pin')} ${esc(simple ? L('Πατήστε το κουμπί 📍 για να βάλετε pin στον χάρτη. Το συνεργείο πατά «Χάρτης» και πηγαίνει ακριβώς εκεί.', 'Tap 📍 to drop a pin on the map. The crew taps “Map” and goes exactly there.') : L('Πατήστε το κουμπί 📍 δίπλα σε κάθε τοποθεσία για να βάλετε pin στον χάρτη. Το συνεργείο πατά «Χάρτης» και πηγαίνει ακριβώς εκεί.', 'Tap 📍 next to each location to drop a pin on the map. The crew taps “Map” and goes exactly there.'))}</div>
      <div class="field full"><label>${esc(simple ? L('Σχόλια', 'Comments') : L('Σημειώσεις εκδήλωσης', 'Event notes'))}</label><textarea class="textarea" name="notes" placeholder="${esc(simple ? L('Περιγραφή, λεπτομέρειες, ό,τι πρέπει να ξέρει το συνεργείο (τα βλέπει και εκείνο)', 'Description, details, anything the crew should know (they can see this)') : L('Ό,τι πρέπει να ξέρει το συνεργείο (τα βλέπει και εκείνο)', 'Anything the crew should know (they can see this)'))}">${esc(W.ev.notes)}</textarea></div>
    </div></div>`;
  bindInputs(body, W.ev);
  body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { if (W.ev.category === b.dataset.cat) return; W.ev.category = b.dataset.cat; draw(root, params); }));
  initSegmented(body, (_, v) => { W.ev.resolution = v; });
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
function stepCrew(body) {
  const team = S.profiles.filter((p) => p.role && p.active).sort((a, b) => profileName(a).localeCompare(profileName(b)));
  const sel = new Map(W.crew.map((c) => [c.user_id, c.duty]));
  const defDuty = (p) => (['videographer', 'admin_video'].includes(p.role) ? 'video' : 'photo');
  const paint = () => {
    body.innerHTML = `<div class="card pad"><p class="muted small">${esc(L('Προαιρετικό. Όσοι επιλεγούν θα λάβουν ειδοποίηση με τα στοιχεία της εκδήλωσης (χωρίς οικονομικά).', 'Optional. Selected members get a notification with the event details (no finances).'))}</p></div>
      <div class="list mt-s">${team.map((p) => {
        const on = sel.has(p.id);
        return `<div class="row"><label class="hstack" style="flex:1;cursor:pointer;flex-wrap:nowrap"><input type="checkbox" data-u="${p.id}" ${on ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)">${avatar(p)}<div class="main-col"><div class="t">${esc(profileName(p))}</div></div></label>
          ${on ? segmented('d_' + p.id, [{ v: 'photo', label: L('Φωτο', 'Photo') }, { v: 'video', label: L('Βίντεο', 'Video') }, { v: 'drone', label: 'Drone' }], sel.get(p.id)) : ''}</div>`;
      }).join('') || `<div class="row muted">${esc(L('Δεν υπάρχουν ακόμα μέλη ομάδας με ρόλο.', 'No team members with a role yet.'))}</div>`}</div>
      <div class="card pad mt"><div class="field"><label>${esc(L('Εξωτερικοί συνεργάτες (προαιρετικό)', 'External crew (optional)'))}</label><input class="input" name="extra_crew" value="${esc(W.ev.extra_crew || '')}" placeholder="${esc(L('π.χ. Νίκος (drone)', 'e.g. Nick (drone)'))}"></div></div>`;
    body.querySelectorAll('[data-u]').forEach((cb) => cb.addEventListener('change', () => {
      const p = team.find((x) => x.id === cb.dataset.u);
      if (cb.checked) sel.set(p.id, defDuty(p)); else sel.delete(p.id);
      W.crew = [...sel.entries()].map(([user_id, duty]) => ({ user_id, duty }));
      paint();
    }));
    initSegmented(body, (name, val) => { sel.set(name.slice(2), val); W.crew = [...sel.entries()].map(([user_id, duty]) => ({ user_id, duty })); });
    bindInputs(body, W.ev);
  };
  paint();
}

// ---------- Βήμα 4: Προσφορά ----------
function stepOffer(body, root, params) {
  const has = W.offer.pdf || W.offer.existingPath || W.offer.fromAppointment;
  const c = W.custMode === 'existing' && W.customerId ? S.customers.get(W.customerId) : W.cust;
  const withOffer = needsOffer(W.ev.category);
  body.innerHTML = `${withOffer ? `
    <div class="card pad">
      <div class="spread"><b>${esc(L('Προσφορά (PDF)', 'Offer (PDF)'))} <span class="req" style="color:var(--red)">*</span></b>${has ? `<span class="pill green">${icon('check')} ${esc(L('Επισυνάφθηκε', 'Attached'))}</span>` : `<span class="pill red">${esc(L('Λείπει', 'Missing'))}</span>`}</div>
      <p class="muted small mt-s">${esc(L('Το PDF το βλέπουν μόνο οι διαχειριστές. Το συνεργείο βλέπει μόνο τι περιλαμβάνει το πακέτο, χωρίς τιμές.', 'Only admins can open the PDF. The crew only sees what the package includes, without prices.'))}</p>
      ${has ? `<div class="offer-box" style="padding:12px 0 0"><div class="pdf-thumb">PDF</div><div class="main-col" style="flex:1"><div class="t">${esc(W.offer.pdfName || L('Υπάρχουσα προσφορά', 'Existing offer'))}</div><div class="s">${esc(W.offer.pdf ? L('Θα ανέβει με την αποθήκευση', 'Will upload when you save') : W.offer.fromAppointment && !W.offer.existingPath ? L('Από το ραντεβού — θα αντιγραφεί στην εκδήλωση', 'From the appointment — will be copied to the event') : L('Ήδη αποθηκευμένη', 'Already saved'))}</div></div></div>` : ''}
      <div class="grid cols-2 mt" style="gap:10px">
        <button class="btn primary large" data-builder>${icon('wand')} ${esc(W.offer.data ? L('Επεξεργασία στον Οδηγό προσφοράς', 'Edit in offer builder') : L('Δημιουργία με τον Οδηγό προσφοράς', 'Create with offer builder'))}</button>
        <button class="btn large" data-upload>${icon('upload')} ${esc(L('Ανέβασμα έτοιμου PDF', 'Upload ready PDF'))}</button>
      </div>
      <div class="help mt-s">${esc(L('Ο Οδηγός ανοίγει συμπληρωμένος με τα στοιχεία του ζευγαριού. Πατήστε «Αποθήκευση στην εκδήλωση» όταν τελειώσετε.', 'The builder opens pre-filled with the couple’s details. Tap “Save to event” when done.'))}</div>
    </div>
    ${W.offer.data ? `<div class="card pad mt">${offerSummaryHTML(W.offer.data)}</div>` : ''}` : ''}
    <div class="card pad ${withOffer ? 'mt' : ''}"><div class="form-grid">
      ${fld('package_price', L('Τελική αξία πακέτου (€)', 'Final package value (€)'), W.fin.package_price, { inputmode: 'decimal', ph: '2800', help: esc(withOffer ? L('Συμπληρώνεται αυτόματα από τον Οδηγό. Όταν οι πληρωμές φτάσουν αυτό το ποσό, η γραμμή στο Excel γίνεται πράσινη.', 'Filled automatically by the builder. When payments reach this amount, the Excel row turns green.') : L('Η συμφωνημένη αξία. Όταν οι πληρωμές φτάσουν αυτό το ποσό, η γραμμή στο Excel γίνεται πράσινη.', 'The agreed value. When payments reach this amount, the Excel row turns green.')), extra: '<span class="suffix">€</span>' })}
      ${fld('package_name', L('Όνομα πακέτου', 'Package name'), W.fin.package_name, { ph: 'BASIC PAC' })}
      <label class="check-row full"><span class="switch"><input type="checkbox" name="second_crew" ${W.fin.second_crew ? 'checked' : ''}><span></span></span><span>${esc(L('Δεύτερο συνεργείο', 'Second crew'))}</span></label>
      <div class="field full"><label>${esc(L('Σημειώσεις γραφείου (μόνο για διαχειριστές)', 'Office notes (admins only)'))}</label><textarea class="textarea" name="office_notes" style="min-height:70px">${esc(W.fin.office_notes)}</textarea></div>
    </div></div>
    <div class="card pad mt"><b>${esc(L('Σύνοψη', 'Summary'))}</b>
      <div class="small mt-s" style="line-height:1.7">${esc(coupleName(c))}<br>${esc(fmtDate(W.ev.event_date))} · ${esc(W.ev.event_time || '—')} · ${esc(W.ev.church_location || '—')}<br>${esc(L('Συνεργείο', 'Crew'))}: ${esc(W.crew.map((x) => profileName(S.profiles.find((p) => p.id === x.user_id))).join(', ') || '—')}</div></div>`;
  bindInputs(body, W.fin);
  body.querySelector('[data-builder]')?.addEventListener('click', async () => {
    const res = await openOfferBuilder({ prefill: { ...(W.offer.data || {}), partner1: c?.name1 || '', partner2: c?.name2 || '', phone1: c?.phone1 || '', phone2: c?.phone2 || '', eventDate: W.ev.event_date, church: [W.ev.church_location, W.ev.event_time].filter(Boolean).join(' · '), reception: W.ev.reception_location, city: (W.ev.church_location || '').split(',').pop().trim(), finalPrice: W.fin.package_price || undefined } });
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
    const evRow = { ...W.ev, customer_id: customerId, event_time: W.ev.event_time || null };
    if (W.mode === 'edit') evRow.id = params.id;
    else if (W.savedId) evRow.id = W.savedId; // νέα προσπάθεια μετά από σφάλμα: όχι δεύτερη εκδήλωση
    if (W.offer.data) evRow.offer_data = W.offer.data;
    // πεδία που δεν υπάρχουν στην κατηγορία: σπίτια μόνο σε γάμο/γαμοβάπτιση, δεξίωση όχι σε διαφημιστικό/άλλο
    if (!['wedding', 'wedding_baptism'].includes(evRow.category)) Object.assign(evRow, { bride_house: null, groom_house: null, bride_geo: null, groom_geo: null, house_location: null });
    if (['promo', 'other'].includes(evRow.category)) Object.assign(evRow, { reception_location: null, reception_geo: null });
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
    const curCrew = S.crew.filter((c) => c.event_id === ev.id);
    const crewChanged = W.crew.length !== curCrew.length || W.crew.some((c) => !curCrew.some((x) => x.user_id === c.user_id && x.duty === c.duty));
    if (crewChanged) await setCrew(ev.id, W.crew);
    if (W.appointmentId) await saveAppointment({ id: W.appointmentId, status: 'confirmed', event_id: ev.id, customer_id: customerId, handled_by: S.profile.id }).catch(() => {});
    if (W.requestId) await updateRequest(W.requestId, { status: 'converted', event_id: ev.id, customer_id: customerId, handled_by: S.profile.id }).catch(() => {});
    toast(W.mode === 'edit' ? L('Οι αλλαγές αποθηκεύτηκαν', 'Changes saved') : L('Η εκδήλωση δημιουργήθηκε! 🎉', 'Event created! 🎉'), { body: W.crew.length ? L('Το συνεργείο ειδοποιήθηκε.', 'The crew was notified.') : '' });
    W = null; key = '';
    go(`#/event/${ev.id}`);
  } catch (e) {
    console.error(e);
  } finally { saving = false; busy(btn, false); }
}
