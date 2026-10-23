// =====================================================================
//  Σύνδεση με τον «Οδηγό προσφοράς» (offer/builder.html)
// =====================================================================
import { L, esc, icon, toast, toastErr, confirmBox, money } from './core.js';
import { S, eventView, uploadOffer, saveEvent, saveFinance } from './data.js';
import { packageNameFrom } from './components.js';

const ADD_MAP = {
  preWeddingVideoDrone: 'Pre-wedding photo & video', secondCrew: '2ο συνεργείο', slideshow: 'Slide show για τη δεξίωση',
  guestBook: 'Ευχολόγιο', platinumAlbum: 'Album Platinum series', platinumCase: 'Platinum album case',
  woodenUsbCase: 'Wooden USB case', video4k: 'Παράδοση video σε 4K',
};
const INC_MAP = { droneChurch: 'Drone εκκλησίας', photoNextDay: 'Φωτογράφηση next day', videoNextDay: 'Video next day', droneNextDay: 'Drone next day' };

/** Μετατροπή επιλογών της σελίδας πελάτη σε κατάσταση του Οδηγού */
export function requestToOfferState(r) {
  const s = r?.selections || {};
  const inc = s.include || {};
  const up = s.upgrades || {};
  const fmtD = r.wedding_date || '';
  return {
    partner1: r.partner1 || '', partner2: r.partner2 || '', phone1: r.phone1 || '', phone2: r.phone2 || '',
    eventDate: fmtD, city: '',
    church: [r.church, r.church_time].filter(Boolean).join(' · '),
    reception: [r.reception, r.reception_time].filter(Boolean).join(' · '),
    notes: '',
    removes: Object.entries(INC_MAP).filter(([k]) => String(inc[k]) === '0').map(([, v]) => v),
    adds: Object.entries(ADD_MAP).filter(([k]) => String(up[k]) === '1').map(([, v]) => v),
    removeAlbums: Math.max(0, 3 - (Number(s.smallAlbums ?? 3) || 0)),
    extraHours: Number(s.extraHours) || 0, largeSpreads: Number(s.largeSpreads) || 0, smallSpreads: Number(s.smallSpreads) || 0,
    prints: s.prints || '30 φωτογραφίες 13×18 cm',
    finalPrice: null,
  };
}

export function pickPdfFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/pdf,.pdf';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const f = inp.files?.[0]; inp.remove();
      if (!f) return resolve(null);
      if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) { toastErr(L('Επιλέξτε αρχείο PDF', 'Choose a PDF file')); return resolve(null); }
      if (f.size > 25 * 1024 * 1024) { toastErr(L('Το αρχείο είναι πολύ μεγάλο', 'File too large'), L('Μέγιστο 25 MB.', 'Max 25 MB.')); return resolve(null); }
      resolve(f);
    });
    window.addEventListener('focus', () => setTimeout(() => { if (inp.isConnected && !inp.files?.length) { inp.remove(); resolve(null); } }, 1200), { once: true });
    inp.click();
  });
}

/** Ανοίγει τον Οδηγό προσφοράς πάνω από την εφαρμογή. Επιστρέφει {pdf, fileName, state, total} ή null */
export function openOfferBuilder({ prefill = {} } = {}) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'offer-layer';
    layer.innerHTML = `<div class="offer-bar">
        <button class="btn" data-x>${icon('x')} <span class="hide-mobile">${esc(L('Ακύρωση', 'Cancel'))}</span></button>
        <b>${esc(L('Οδηγός προσφοράς', 'Offer builder'))}</b>
        <button class="btn primary" data-save>${icon('check')} ${esc(L('Αποθήκευση στην εκδήλωση', 'Save to event'))}</button>
      </div>
      <iframe title="${esc(L('Οδηγός προσφοράς', 'Offer builder'))}" src="offer/builder.html?embed=1"></iframe>
      <div class="offer-busy"><div class="center"><div class="spinner"></div>${esc(L('Φόρτωση…', 'Loading…'))}</div></div>`;
    document.body.appendChild(layer);
    document.body.style.overflow = 'hidden';
    const frame = layer.querySelector('iframe');
    const busyEl = layer.querySelector('.offer-busy');
    let api = null;
    const done = (val) => { layer.remove(); document.body.style.overflow = ''; resolve(val); };
    frame.addEventListener('load', async () => {
      for (let i = 0; i < 50 && !frame.contentWindow?.IMOffer; i++) await new Promise((r) => setTimeout(r, 100));
      api = frame.contentWindow?.IMOffer;
      if (!api) { toastErr(L('Ο Οδηγός προσφοράς δεν φόρτωσε', 'Offer builder did not load')); return; }
      try { api.setState(prefill); } catch (e) { console.warn(e); }
      busyEl.hidden = true;
    });
    layer.querySelector('[data-x]').addEventListener('click', async () => {
      if (await confirmBox(L('Κλείσιμο χωρίς αποθήκευση;', 'Close without saving?'), L('Οι αλλαγές στην προσφορά θα χαθούν.', 'Changes to the offer will be lost.'), { ok: L('Κλείσιμο', 'Close'), destructive: true })) done(null);
    });
    layer.querySelector('[data-save]').addEventListener('click', async () => {
      if (!api) return;
      const state = api.getState();
      if (!state.partner1 && !state.partner2) { toastErr(L('Λείπουν τα ονόματα', 'Names missing'), L('Συμπληρώστε τουλάχιστον ένα ονοματεπώνυμο.', 'Fill in at least one name.')); return; }
      busyEl.hidden = false;
      busyEl.innerHTML = `<div class="center"><div class="spinner"></div>${esc(L('Δημιουργία PDF… (λίγα δευτερόλεπτα)', 'Creating PDF… (a few seconds)'))}</div>`;
      try {
        const blob = await api.exportPdf();
        const safe = [state.partner1, state.partner2].filter(Boolean).join('_').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'offer';
        const fileName = `Image_Makers_Prosfora_${safe}_${state.eventDate || ''}.pdf`;
        const file = new File([blob], fileName, { type: 'application/pdf' });
        done({ pdf: file, fileName, state, total: state.total });
      } catch (e) {
        console.error(e);
        busyEl.hidden = true;
        toastErr(L('Το PDF δεν δημιουργήθηκε', 'PDF not created'), e.message);
      }
    });
  });
}

/** Δημιουργία/επεξεργασία προσφοράς για υπάρχουσα εκδήλωση */
export async function editOfferForEvent(id) {
  const v = eventView(id);
  if (!v) return;
  const { e, c, f } = v;
  const prefill = {
    ...(e.offer_data || {}),
    partner1: c?.name1 || '', partner2: c?.name2 || '', phone1: c?.phone1 || '', phone2: c?.phone2 || '',
    eventDate: e.event_date, church: [e.church_location, (e.event_time || '').slice(0, 5)].filter(Boolean).join(' · '),
    reception: e.reception_location || '',
    finalPrice: e.offer_data?.finalPrice ?? (f.package_price && !e.offer_data ? f.package_price : undefined),
  };
  const res = await openOfferBuilder({ prefill });
  if (!res) return;
  await applyOfferResult(id, res);
}

export async function applyOfferResult(id, res) {
  const v = eventView(id);
  try {
    const path = await uploadOffer(id, res.pdf);
    const patch = { id, offer_path: path, offer_data: res.state, offer_updated_at: new Date().toISOString() };
    if ((res.state.adds || []).includes('Παράδοση video σε 4K')) patch.resolution = '4k';
    await saveEvent(patch);
    const newPrice = Number(res.total);
    let price = v.f.package_price;
    if (price == null || Number(price) === newPrice || await confirmBox(L('Ενημέρωση αξίας πακέτου;', 'Update package value?'), L(`Παλιά αξία: ${money(price)}\nΝέα αξία από την προσφορά: ${money(newPrice)}`, `Old value: ${money(price)}\nNew value from offer: ${money(newPrice)}`), { ok: L('Ενημέρωση', 'Update') })) price = newPrice;
    await saveFinance(id, { package_price: price, package_name: packageNameFrom(res.state), second_crew: (res.state.adds || []).includes('2ο συνεργείο') });
    toast(L('Η προσφορά αποθηκεύτηκε', 'Offer saved'), { body: L('Το PDF επισυνάφθηκε στην εκδήλωση.', 'The PDF is attached to the event.') });
  } catch (e) { console.error(e); }
}

export async function uploadPdfForEvent(id) {
  const f = await pickPdfFile();
  if (!f) return;
  try {
    const path = await uploadOffer(id, f);
    await saveEvent({ id, offer_path: path, offer_updated_at: new Date().toISOString() });
    toast(L('Το PDF ανέβηκε', 'PDF uploaded'));
  } catch (e) { console.error(e); }
}

/** Αυτόνομος Οδηγός (χωρίς εκδήλωση) — για γρήγορη προσφορά σε πελάτη */
export function openStandaloneBuilder() { window.open('offer/builder.html', '_blank'); }
void S;
