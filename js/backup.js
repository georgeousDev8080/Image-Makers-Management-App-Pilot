// =====================================================================
//  Αντίγραφα ασφαλείας (Excel / ZIP), επαναφορά, εισαγωγή παλιού Sheet
// =====================================================================
import { L, esc, icon, loadScript, download, norm, lbl, opt, APPT_MODES, APPT_STATUS, REJECT_REASONS, CATEGORIES, PHOTO_STATUS, EDIT_STATUS, PCS, METHODS, RESOLUTIONS, EXPENSE_KINDS, SHOP_SUBS, OTHER_SUBS, ROLES, TRIGGERS, sheet, toast, toastErr, confirmBox, busy, money, fmtDate, pad2 } from './core.js';
import { sb, S, coupleName, profileName, loadAll, offerBlob, friendlyError } from './data.js';

const XL = () => loadScript('vendor/xlsx.full.min.js');
const ZIP = () => loadScript('vendor/jszip.min.js');
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1_$2');
const human = (list, v) => (v ? (opt(list, v) ? opt(list, v).el : v) : '');
function back(list, v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const o = list.find((x) => x.v === s || norm(x.el) === norm(s) || norm(x.en) === norm(s));
  return o ? o.v : null;
}
const yes = (v) => /^(ναι|yes|true|1|x|✓)$/i.test(String(v ?? '').trim());
const num = (v) => { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return v; const s = String(v).replace(/[€\s]/g, ''); const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s; const n = Number(t); return Number.isFinite(n) ? n : null; };
function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 864e5)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  return null;
}
function toTime(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  if (typeof v === 'number' && v < 1) { const mins = Math.round(v * 1440); return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`; }
  const m = String(v).match(/(\d{1,2})[:.](\d{2})/); return m ? `${pad2(m[1])}:${m[2]}` : null;
}

// ---------------------------------------------------------------------
//  Εξαγωγή
// ---------------------------------------------------------------------
function buildWorkbook() {
  const X = window.XLSX;
  const wb = X.utils.book_new();
  const add = (name, rows, widths) => {
    const ws = X.utils.json_to_sheet(rows.length ? rows : [{}]);
    if (rows.length) ws['!cols'] = Object.keys(rows[0]).map((k) => ({ wch: widths?.[k] || Math.min(40, Math.max(10, k.length + 2)) }));
    X.utils.book_append_sheet(wb, ws, name);
  };
  const ev = [...S.events.values()].sort((a, b) => a.event_date.localeCompare(b.event_date));
  add('Πληροφορίες', [
    { 'Στοιχείο': 'Εφαρμογή', 'Τιμή': 'Image Makers · Studio Manager' },
    { 'Στοιχείο': 'Ημερομηνία αντιγράφου', 'Τιμή': new Date().toLocaleString('el-GR') },
    { 'Στοιχείο': 'Από', 'Τιμή': profileName(S.profile) },
    { 'Στοιχείο': 'Πελάτες', 'Τιμή': S.customers.size }, { 'Στοιχείο': 'Εκδηλώσεις', 'Τιμή': S.events.size },
    { 'Στοιχείο': 'Πληρωμές', 'Τιμή': S.payments.length }, { 'Στοιχείο': 'Έξοδα', 'Τιμή': S.expenses.length },
    { 'Στοιχείο': 'Σημείωση', 'Τιμή': 'Μην αλλάζετε τις στήλες ID αν σκοπεύετε να κάνετε επαναφορά από αυτό το αρχείο.' },
  ], { 'Στοιχείο': 24, 'Τιμή': 70 });
  add('Πελάτες', [...S.customers.values()].map((c) => ({ ID: c.id, 'Ονοματεπώνυμο 1': c.name1, 'Ονοματεπώνυμο 2': c.name2 || '', 'Κινητό 1': c.phone1 || '', 'Κινητό 2': c.phone2 || '', 'Email 1': c.email1 || '', 'Email 2': c.email2 || '', 'Σημειώσεις': c.notes || '', 'Δημιουργήθηκε': c.created_at })), { ID: 38, 'Ονοματεπώνυμο 1': 26, 'Ονοματεπώνυμο 2': 26, 'Email 1': 28, 'Email 2': 28, 'Σημειώσεις': 40 });
  add('Εκδηλώσεις', ev.map((e) => {
    const f = S.finance.get(e.id) || {};
    const paid = S.payments.filter((p) => p.event_id === e.id).reduce((n, p) => n + Number(p.amount), 0);
    return {
      ID: e.id, 'Πελάτης ID': e.customer_id || '', 'Ζευγάρι': coupleName(S.customers.get(e.customer_id)), 'Κατηγορία': human(CATEGORIES, e.category),
      'Ημερομηνία': e.event_date, 'Ώρα': (e.event_time || '').slice(0, 5), 'Εκκλησία / Τοποθεσία': e.church_location || '', 'Σπίτι': e.house_location || '', 'Δεξίωση': e.reception_location || '',
      'Ανάλυση': human(RESOLUTIONS, e.resolution), 'Σημειώσεις': e.notes || '', 'Εξωτερικοί συνεργάτες': e.extra_crew || '',
      'Κατάσταση φωτογραφιών': human(PHOTO_STATUS, e.photo_status), 'Κατάσταση editing': human(EDIT_STATUS, e.editing_status), 'Υπολογιστής μοντάζ': human(PCS, e.editing_pc), 'Σχόλια βίντεο': e.video_notes || '',
      'Ακυρωμένη': e.status === 'cancelled' ? 'Ναι' : 'Όχι', 'Αξία πακέτου': f.package_price != null ? Number(f.package_price) : '', 'Όνομα πακέτου': f.package_name || '', '2ο συνεργείο': f.second_crew ? 'Ναι' : 'Όχι',
      'Σημειώσεις γραφείου': f.office_notes || '', 'Πληρώθηκαν': paid, 'Υπόλοιπο': f.package_price != null ? Number(f.package_price) - paid : '',
      'Αρχείο PDF': e.offer_path || '', 'Προσφορά (δεδομένα)': e.offer_data ? JSON.stringify(e.offer_data) : '', 'Δημιουργήθηκε': e.created_at,
    };
  }), { ID: 38, 'Πελάτης ID': 38, 'Ζευγάρι': 30, 'Εκκλησία / Τοποθεσία': 30, 'Σημειώσεις': 30, 'Όνομα πακέτου': 30, 'Προσφορά (δεδομένα)': 20 });
  add('Πληρωμές', [...S.payments].sort((a, b) => (a.paid_on || '').localeCompare(b.paid_on || '')).map((p) => ({
    ID: p.id, 'Εκδήλωση ID': p.event_id || '', 'Ζευγάρι': p.event_id ? coupleName(S.customers.get(S.events.get(p.event_id)?.customer_id)) : '', 'Ημ. εκδήλωσης': S.events.get(p.event_id)?.event_date || '',
    'Κατηγορία': human(CATEGORIES, p.category), 'Είδος': p.kind === 'deposit' ? 'Προκαταβολή' : p.kind === 'installment' ? 'Δόση' : 'Άλλο', 'Τύπος πληρωμής': p.label || '',
    'Ποσό': Number(p.amount), 'Ημερομηνία είσπραξης': p.paid_on || '', 'Τρόπος πληρωμής': human(METHODS, p.method), 'Περιγραφή': p.description || '', 'Σημειώσεις': p.notes || '', 'Δημιουργήθηκε': p.created_at,
  })), { ID: 38, 'Εκδήλωση ID': 38, 'Ζευγάρι': 30 });
  add('Έξοδα', [...S.expenses].sort((a, b) => a.paid_on.localeCompare(b.paid_on)).map((x) => ({
    ID: x.id, 'Ημερομηνία': x.paid_on, 'Τύπος': human(EXPENSE_KINDS, x.kind), 'Υποκατηγορία': x.kind === 'shop' ? human(SHOP_SUBS, x.subcategory) : x.kind === 'other' ? human(OTHER_SUBS, x.subcategory) : (x.subcategory || ''),
    'Μέλος ID': x.crew_id || '', 'Μέλος / Συνεργάτης': x.crew_name || '', 'Για μήνα': x.for_month ? x.for_month.slice(0, 7) : '', 'Πληρωμένος έως': x.paid_until || '', 'Ημέρες': x.days ?? '',
    'Ποσό': Number(x.amount), 'Τρόπος πληρωμής': human(METHODS, x.method), 'Πληρώθηκε σε / Προμηθευτής': x.supplier || '', 'Περιγραφή': x.description || '', 'Σημειώσεις': x.notes || '', 'Δημιουργήθηκε': x.created_at,
  })), { ID: 38, 'Μέλος ID': 38 });
  add('Συνεργείο', S.crew.map((c) => ({ 'Εκδήλωση ID': c.event_id, 'Ζευγάρι': coupleName(S.customers.get(S.events.get(c.event_id)?.customer_id)), 'Ημερομηνία': S.events.get(c.event_id)?.event_date || '', 'Μέλος ID': c.user_id, 'Μέλος': profileName(S.profiles.find((p) => p.id === c.user_id)), 'Αρμοδιότητα': c.duty === 'video' ? 'Βίντεο' : 'Φωτογραφία' })), { 'Εκδήλωση ID': 38, 'Μέλος ID': 38 });
  add('Πρότυπα μηνυμάτων', S.templates.map((t) => ({ ID: t.id, 'Κλειδί': t.key || '', 'Όνομα': t.name, 'Πότε': human(TRIGGERS, t.trigger_type), 'Ημέρες': t.offset_days, 'Ώρα': t.send_hour, 'Ποσοστό %': t.threshold_pct ?? '', 'Κατηγορίες': (t.categories || []).map((c) => human(CATEGORIES, c)).join(', '), 'Τρόποι': (t.channels || []).join(', '), 'Θέμα': t.subject || '', 'Κείμενο': t.body, 'Ενεργό': t.enabled ? 'Ναι' : 'Όχι' })), { ID: 38, 'Κείμενο': 80 });
  add('Ομάδα', S.profiles.map((p) => ({ 'Όνομα': profileName(p), 'Username': p.username, 'Email': p.email, 'Ρόλος': human(ROLES, p.role) || 'Χωρίς ρόλο', 'Ενεργός': p.active ? 'Ναι' : 'Όχι' })));
  add('Ραντεβού', S.appointments.map((a) => ({ ID: a.id, 'Τύπος': human(APPT_MODES, a.mode), 'Ημερομηνία ραντεβού': a.appt_date, 'Κατηγορία': human(CATEGORIES, a.category), 'Ονοματεπώνυμο 1': a.name1 || '', 'Ονοματεπώνυμο 2': a.name2 || '', 'Κινητό': a.phone || '', Email: a.email || '', 'Ημερομηνία εκδήλωσης': a.event_date || '', 'Εκκλησία': a.church || '', 'Ώρα εκκλησίας': a.church_time || '', 'Δεξίωση': a.reception || '', 'Αξία προσφοράς': a.total ?? '', 'Κατάσταση': human(APPT_STATUS, a.status), 'Ημερομηνία κατάστασης': a.status_at, 'Λόγος': human(REJECT_REASONS, a.reason), 'Σχόλια': a.comments || '', 'Σημειώσεις': a.notes || '', 'Εκδήλωση ID': a.event_id || '', 'Αρχείο PDF': a.offer_path || '', 'Προσφορά (δεδομένα)': a.offer_data ? JSON.stringify(a.offer_data) : '', 'Επιλογές πελάτη': a.selections ? JSON.stringify(a.selections) : '' })), { ID: 38, 'Ονοματεπώνυμο 1': 24, 'Ονοματεπώνυμο 2': 24, 'Σχόλια': 40 });
  return wb;
}

export async function exportAllXlsx() {
  await XL();
  window.XLSX.writeFile(buildWorkbook(), `ImageMakers_Antigrafo_${stamp()}.xlsx`);
  toast(L('Το αρχείο Excel κατέβηκε', 'Excel file downloaded'));
}

export async function exportFullZip() {
  await Promise.all([XL(), ZIP()]);
  const t = toast(L('Ετοιμάζεται το αντίγραφο…', 'Preparing backup…'), { type: 'info', ms: 60000 });
  try {
    const zip = new window.JSZip();
    const wbout = window.XLSX.write(buildWorkbook(), { bookType: 'xlsx', type: 'array' });
    zip.file('ImageMakers_dedomena.xlsx', wbout);
    const folder = zip.folder('prosfores_pdf');
    let n = 0;
    for (const e of S.events.values()) {
      if (!e.offer_path) continue;
      try {
        const b = await offerBlob(e.offer_path);
        const name = `${e.id}__${e.event_date}_${coupleName(S.customers.get(e.customer_id)).replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 50)}.pdf`;
        folder.file(name, b); n++;
      } catch (err) { console.warn('pdf', e.id, err); }
    }
    zip.file('README_DIAVASTE.txt', `Image Makers · Πλήρες αντίγραφο ασφαλείας\nΗμερομηνία: ${new Date().toLocaleString('el-GR')}\n\n- ImageMakers_dedomena.xlsx: όλα τα δεδομένα (ανοίγει σε Excel / Numbers / Google Sheets)\n- prosfores_pdf/: ${n} PDF προσφορών (το όνομα ξεκινά με το ID της εκδήλωσης)\n\nΕπαναφορά: Εφαρμογή → Ρυθμίσεις → Επαναφορά από αντίγραφο → επιλέξτε αυτό το .zip\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    download(blob, `ImageMakers_Pliris_Antigrafo_${stamp()}.zip`);
    t(); toast(L('Το πλήρες αντίγραφο κατέβηκε', 'Full backup downloaded'), { body: L(`${n} PDF προσφορών μέσα στο αρχείο.`, `${n} offer PDFs included.`) });
  } catch (e) { t(); throw e; }
}

// ---------------------------------------------------------------------
//  Επιλογή αρχείου
// ---------------------------------------------------------------------
function pickFile(accept) {
  return new Promise((resolve) => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    document.body.appendChild(i);
    i.onchange = () => { const f = i.files?.[0]; i.remove(); resolve(f || null); };
    i.click();
  });
}
async function chunked(table, rows, opts = {}) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), opts);
    if (error) throw new Error(`${table}: ${friendlyError(error)}`);
  }
}

// ---------------------------------------------------------------------
//  Επαναφορά από αντίγραφο της εφαρμογής
// ---------------------------------------------------------------------
export async function importBackup() {
  const file = await pickFile('.xlsx,.zip');
  if (!file) return;
  await XL();
  let wbData; const pdfs = [];
  if (/\.zip$/i.test(file.name)) {
    await ZIP();
    const zip = await window.JSZip.loadAsync(file);
    const x = Object.values(zip.files).find((f) => /\.xlsx$/i.test(f.name));
    if (!x) throw new Error(L('Το zip δεν περιέχει αρχείο Excel', 'The zip has no Excel file'));
    wbData = await x.async('arraybuffer');
    for (const f of Object.values(zip.files)) { const m = f.name.match(/([0-9a-f-]{36})__.*\.pdf$/i); if (m) pdfs.push({ id: m[1], file: f }); }
  } else wbData = await file.arrayBuffer();
  const wb = window.XLSX.read(wbData, { type: 'array' });
  const rows = (n) => (wb.Sheets[n] ? window.XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }) : []);
  const C = rows('Πελάτες'), E = rows('Εκδηλώσεις'), P = rows('Πληρωμές'), X = rows('Έξοδα'), K = rows('Συνεργείο'), T = rows('Πρότυπα μηνυμάτων');
  if (!C.length && !E.length && !P.length && !X.length) { toastErr(L('Δεν αναγνωρίστηκε το αρχείο', 'File not recognized'), L('Επιλέξτε αντίγραφο που κατεβάσατε από αυτή την εφαρμογή. Για το παλιό Google Sheet χρησιμοποιήστε την «Εισαγωγή από το παλιό Google Sheet».', 'Choose a backup downloaded from this app. For the old Google Sheet use “Import from the old Google Sheet”.')); return; }
  if (!await confirmBox(L('Επαναφορά δεδομένων;', 'Restore data?'), L(`Βρέθηκαν: ${C.length} πελάτες, ${E.length} εκδηλώσεις, ${P.length} πληρωμές, ${X.length} έξοδα, ${pdfs.length} PDF.\nΌσα υπάρχουν ήδη θα ενημερωθούν, τα υπόλοιπα θα προστεθούν. Δεν σβήνεται τίποτα.`, `Found: ${C.length} customers, ${E.length} events, ${P.length} payments, ${X.length} expenses, ${pdfs.length} PDFs.\nExisting records are updated, others added. Nothing is deleted.`), { ok: L('Επαναφορά', 'Restore') })) return;
  const t = toast(L('Γίνεται επαναφορά…', 'Restoring…'), { type: 'info', ms: 120000 });
  try {
    const old = new Date(Date.now() - 30 * 864e5).toISOString();
    await chunked('customers', C.filter((r) => r.ID).map((r) => ({ id: r.ID, name1: r['Ονοματεπώνυμο 1'] || '—', name2: r['Ονοματεπώνυμο 2'] || null, phone1: String(r['Κινητό 1'] || '') || null, phone2: String(r['Κινητό 2'] || '') || null, email1: r['Email 1'] || null, email2: r['Email 2'] || null, notes: r['Σημειώσεις'] || null })));
    const evRows = E.filter((r) => r.ID && toISODate(r['Ημερομηνία']));
    await chunked('events', evRows.map((r) => {
      let od = null; try { od = r['Προσφορά (δεδομένα)'] ? JSON.parse(r['Προσφορά (δεδομένα)']) : null; } catch {}
      return { id: r.ID, customer_id: r['Πελάτης ID'] || null, category: back(CATEGORIES, r['Κατηγορία']) || 'wedding', event_date: toISODate(r['Ημερομηνία']), event_time: toTime(r['Ώρα']), church_location: r['Εκκλησία / Τοποθεσία'] || null, house_location: r['Σπίτι'] || null, reception_location: r['Δεξίωση'] || null, resolution: back(RESOLUTIONS, r['Ανάλυση']), notes: r['Σημειώσεις'] || null, extra_crew: r['Εξωτερικοί συνεργάτες'] || null, photo_status: back(PHOTO_STATUS, r['Κατάσταση φωτογραφιών']) || 'samples_todo', editing_status: back(EDIT_STATUS, r['Κατάσταση editing']) || 'none', editing_pc: back(PCS, r['Υπολογιστής μοντάζ']), video_notes: r['Σχόλια βίντεο'] || null, status: yes(r['Ακυρωμένη']) ? 'cancelled' : 'booked', offer_path: r['Αρχείο PDF'] || null, offer_data: od, created_at: r['Δημιουργήθηκε'] || old };
    }));
    await chunked('event_finance', evRows.map((r) => ({ event_id: r.ID, package_price: num(r['Αξία πακέτου']), package_name: r['Όνομα πακέτου'] || null, second_crew: yes(r['2ο συνεργείο']), office_notes: r['Σημειώσεις γραφείου'] || null })));
    await chunked('payments', P.filter((r) => r.ID && num(r['Ποσό'])).map((r) => ({ id: r.ID, event_id: r['Εκδήλωση ID'] || null, category: back(CATEGORIES, r['Κατηγορία']) || 'other', kind: r['Είδος'] === 'Προκαταβολή' ? 'deposit' : r['Είδος'] === 'Άλλο' ? 'other' : 'installment', label: r['Τύπος πληρωμής'] || null, amount: num(r['Ποσό']), paid_on: toISODate(r['Ημερομηνία είσπραξης']), method: back(METHODS, r['Τρόπος πληρωμής']), description: r['Περιγραφή'] || null, notes: r['Σημειώσεις'] || null, created_at: r['Δημιουργήθηκε'] || old })));
    const profIds = new Set(S.profiles.map((p) => p.id));
    await chunked('expenses', X.filter((r) => r.ID && num(r['Ποσό'])).map((r) => {
      const kind = back(EXPENSE_KINDS, r['Τύπος']) || 'other';
      return { id: r.ID, kind, subcategory: kind === 'shop' ? back(SHOP_SUBS, r['Υποκατηγορία']) : kind === 'other' ? back(OTHER_SUBS, r['Υποκατηγορία']) || 'misc' : (r['Υποκατηγορία'] || null), crew_id: profIds.has(r['Μέλος ID']) ? r['Μέλος ID'] : null, crew_name: r['Μέλος / Συνεργάτης'] || null, for_month: r['Για μήνα'] ? String(r['Για μήνα']).slice(0, 7) + '-01' : null, paid_until: toISODate(r['Πληρωμένος έως']), days: num(r['Ημέρες']), amount: num(r['Ποσό']), paid_on: toISODate(r['Ημερομηνία']) || new Date().toISOString().slice(0, 10), method: back(METHODS, r['Τρόπος πληρωμής']), supplier: r['Πληρώθηκε σε / Προμηθευτής'] || null, description: r['Περιγραφή'] || null, notes: r['Σημειώσεις'] || null };
    }));
    const crewRows = K.filter((r) => profIds.has(r['Μέλος ID']) && evRows.some((e) => e.ID === r['Εκδήλωση ID'])).map((r) => ({ event_id: r['Εκδήλωση ID'], user_id: r['Μέλος ID'], duty: r['Αρμοδιότητα'] === 'Βίντεο' ? 'video' : 'photo' }));
    if (crewRows.length) await chunked('event_crew', crewRows, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
    if (T.length) await chunked('message_templates', T.filter((r) => r.ID && r['Κείμενο']).map((r) => ({ id: r.ID, key: r['Κλειδί'] || null, name: r['Όνομα'], trigger_type: back(TRIGGERS, r['Πότε']) || 'before_event', offset_days: Number(r['Ημέρες']) || 0, send_hour: Number(r['Ώρα']) || 11, threshold_pct: num(r['Ποσοστό %']), categories: String(r['Κατηγορίες'] || '').split(',').map((s) => back(CATEGORIES, s)).filter(Boolean), channels: String(r['Τρόποι'] || 'sms,email').split(',').map((s) => s.trim()).filter(Boolean), subject: r['Θέμα'] || null, body: r['Κείμενο'], enabled: yes(r['Ενεργό']) })));
    const A = rows('Ραντεβού');
    const evIds = new Set([...S.events.keys(), ...evRows.map((r) => r.ID)]);
    const js = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
    if (A.length) await chunked('appointments', A.filter((r) => r.ID && toISODate(r['Ημερομηνία ραντεβού'])).map((r) => ({ id: r.ID, mode: back(APPT_MODES, r['Τύπος']) || 'store', appt_date: toISODate(r['Ημερομηνία ραντεβού']), category: back(CATEGORIES, r['Κατηγορία']) || 'wedding', name1: r['Ονοματεπώνυμο 1'] || null, name2: r['Ονοματεπώνυμο 2'] || null, phone: String(r['Κινητό'] || '') || null, email: r.Email || null, event_date: toISODate(r['Ημερομηνία εκδήλωσης']), church: r['Εκκλησία'] || null, church_time: r['Ώρα εκκλησίας'] || null, reception: r['Δεξίωση'] || null, total: num(r['Αξία προσφοράς']), status: back(APPT_STATUS, r['Κατάσταση']) || 'pending', status_at: r['Ημερομηνία κατάστασης'] || new Date().toISOString(), reason: back(REJECT_REASONS, r['Λόγος']), comments: r['Σχόλια'] || null, notes: r['Σημειώσεις'] || null, event_id: evIds.has(r['Εκδήλωση ID']) ? r['Εκδήλωση ID'] : null, offer_path: r['Αρχείο PDF'] || null, offer_data: js(r['Προσφορά (δεδομένα)']), selections: js(r['Επιλογές πελάτη']) })));
    for (const p of pdfs) {
      const blob = new Blob([await p.file.async('arraybuffer')], { type: 'application/pdf' });
      const path = `${p.id}/offer-restored-${Date.now()}.pdf`;
      const { error } = await sb.storage.from('offers').upload(path, blob, { contentType: 'application/pdf', upsert: true });
      if (!error) await sb.from('events').update({ offer_path: path }).eq('id', p.id);
    }
    await loadAll();
    t(); toast(L('Η επαναφορά ολοκληρώθηκε', 'Restore complete'));
  } catch (e) { t(); throw e; }
}

// ---------------------------------------------------------------------
//  Εισαγωγή από το παλιό Google Sheet (Εκδηλώσεις + Έξοδα)
// ---------------------------------------------------------------------
const CAT_MAP = (s) => { const n = norm(s); if (!n) return 'wedding'; if (n.includes('γαμοβαπτ')) return 'wedding_baptism'; if (n.includes('βαπτ')) return 'baptism'; if (n.includes('γαμ')) return 'wedding'; if (n.includes('διαφημ') || n.includes('promo')) return 'promo'; return 'other'; };
const METHOD_MAP = (s) => { const n = norm(s); if (!n) return null; if (n.includes('μετρητ') || n.includes('cash')) return 'cash'; if (n.includes('καρτ') || n.includes('pos') || n.includes('card')) return 'card'; if (n.includes('iris')) return 'iris'; if (n.includes('τραπεζ') || n.includes('μεταφορ') || n.includes('bank')) return 'bank'; return 'other'; };
function EXP_MAP(s) {
  const n = norm(s);
  if (/μισθοδοσ|συνεργατ/.test(n)) return ['payroll', null];
  if (/μεροκαματ/.test(n)) return ['daily_wage', null];
  if (/ενοικ/.test(n)) return ['shop', 'rent'];
  if (/ρευμα|δεη/.test(n)) return ['shop', 'electricity'];
  if (/internet|ιντερνετ/.test(n)) return ['shop', 'internet'];
  if (/νερο|ευδαπ|δευα/.test(n)) return ['shop', 'water'];
  if (/κοινοχρηστ/.test(n)) return ['shop', 'common'];
  if (/εξοπλισμ|παγια|επενδυσ/.test(n)) return ['investment', null];
  if (/λογιστ|επαγγελματικ/.test(n)) return ['other', 'accountant'];
  if (/μετακιν|καυσιμ/.test(n)) return ['other', 'travel'];
  if (/λογαριασμ|συνδρομ/.test(n)) return ['other', 'subscriptions'];
  if (/τραπεζ|pos/.test(n)) return ['other', 'bank'];
  if (/marketing|διαφημ/.test(n)) return ['other', 'marketing'];
  return ['other', 'misc'];
}

function findHeader(aoa, must) {
  for (let i = 0; i < Math.min(8, aoa.length); i++) {
    const r = (aoa[i] || []).map((c) => norm(c));
    if (must.every((m) => r.some((c) => c === m || c.startsWith(m)))) return i;
  }
  return -1;
}

export async function importOldSheet() {
  const file = await pickFile('.xlsx,.xls,.csv');
  if (!file) return;
  await XL();
  const wb = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const events = []; const expenses = []; const warn = [];
  for (const name of wb.SheetNames) {
    const aoa = window.XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
    // Φύλλο εκδηλώσεων
    let h = findHeader(aoa, ['ημερομηνια', 'τοποθεσια', 'ονομα 1']);
    if (h >= 0) {
      const H = aoa[h].map((c) => norm(c));
      const col = (pred) => H.findIndex(pred);
      const ix = {
        date: col((c) => c === 'ημερομηνια'), loc: col((c) => c === 'τοποθεσια'),
        n1: col((c) => c === 'ονομα 1'), n2: col((c) => c === 'ονομα 2'), p1: col((c) => c.startsWith('τηλ. 1') || c === 'τηλ 1'), p2: col((c) => c.startsWith('τηλ. 2') || c === 'τηλ 2'),
        e1: col((c) => c === 'email 1'), e2: col((c) => c === 'email 2'), cat: col((c) => c.startsWith('κατηγορια εκδηλωσ')), second: col((c) => c.startsWith('δευτερο συνεργ')),
        price: col((c) => c.startsWith('πακετο')), pname: col((c) => c.startsWith('ονομα πακετου')), dep: col((c) => c.startsWith('προκαταβολ')),
        photo: col((c) => c.startsWith('κατασταση album') || c.startsWith('κατασταση φωτογραφ')), edit: col((c) => c.startsWith('κατασταση editing')),
        pc: col((c) => c.startsWith('υπολογιστης')), vnotes: col((c) => c.startsWith('σχολια βιντεο')), office: col((c) => c.startsWith('σημειωσεις γραφειου')), time: col((c) => c === 'ωρα'),
      };
      const inst = H.map((c, i) => ({ i, m: c.match(/^(\d+)η δοση/) })).filter((x) => x.m).sort((a, b) => a.m[1] - b.m[1]);
      const get = (r, i) => (i >= 0 ? r[i] : '');
      for (let i = h + 1; i < aoa.length; i++) {
        const r = aoa[i];
        const date = toISODate(get(r, ix.date));
        if (!date) continue;
        const pays = [];
        const dep = num(get(r, ix.dep)); if (dep) pays.push({ kind: 'deposit', label: 'Προκαταβολή', amount: dep });
        inst.forEach((x) => { const a = num(r[x.i]); if (a) pays.push({ kind: 'installment', label: `${x.m[1]}η Δόση`, amount: a }); });
        const photoV = get(r, ix.photo);
        events.push({
          date, time: toTime(get(r, ix.time)), loc: String(get(r, ix.loc) || '').trim(), n1: String(get(r, ix.n1) || '').trim(), n2: String(get(r, ix.n2) || '').trim(),
          p1: String(get(r, ix.p1) || '').trim(), p2: String(get(r, ix.p2) || '').trim(), e1: String(get(r, ix.e1) || '').trim(), e2: String(get(r, ix.e2) || '').trim(),
          cat: CAT_MAP(get(r, ix.cat)), second: yes(get(r, ix.second)), price: num(get(r, ix.price)), pname: String(get(r, ix.pname) || '').trim(), pays,
          photo: back(PHOTO_STATUS, photoV) || 'samples_todo', edit: back(EDIT_STATUS, get(r, ix.edit)) || (norm(get(r, ix.edit)) === 'να γινει' ? 'todo' : 'none'), pc: back(PCS, get(r, ix.pc)), vnotes: String(get(r, ix.vnotes) || '').trim(), office: String(get(r, ix.office) || '').trim(),
          dup: [...S.events.values()].some((e) => e.event_date === date && norm(e.church_location) === norm(get(r, ix.loc))),
        });
      }
      continue;
    }
    // Φύλλο εξόδων
    h = findHeader(aoa, ['ημερομηνια', 'κατηγορια εξοδου', 'ποσο']);
    if (h >= 0) {
      const H = aoa[h].map((c) => norm(c));
      const ix = { date: H.findIndex((c) => c === 'ημερομηνια'), cat: H.findIndex((c) => c.startsWith('κατηγορια εξοδου')), sup: H.findIndex((c) => c.startsWith('πληρωθηκε')), desc: H.findIndex((c) => c.startsWith('περιγραφη')), amt: H.findIndex((c) => c === 'ποσο'), meth: H.findIndex((c) => c.startsWith('τροπος')), notes: H.findIndex((c) => c.startsWith('σημειωσεις')) };
      for (let i = h + 1; i < aoa.length; i++) {
        const r = aoa[i]; const amount = num(r[ix.amt]); const date = toISODate(r[ix.date]);
        if (!amount || !date) continue;
        const [kind, sub] = EXP_MAP(r[ix.cat]);
        expenses.push({ kind, subcategory: sub, paid_on: date, amount, supplier: String(r[ix.sup] ?? '').trim() || null, crew_name: ['payroll', 'daily_wage'].includes(kind) ? String(r[ix.sup] ?? '').trim() || null : null, description: String(r[ix.desc] ?? '').trim() || String(r[ix.cat] ?? '').trim() || null, method: METHOD_MAP(r[ix.meth]), notes: String(r[ix.notes] ?? '').trim() || null });
      }
    }
  }
  if (!events.length && !expenses.length) { toastErr(L('Δεν βρέθηκαν δεδομένα', 'No data found'), L('Βεβαιωθείτε ότι το αρχείο έχει το φύλλο «Εκδηλώσεις» με τις στήλες Ημερομηνία, Τοποθεσία, Όνομα 1.', 'Make sure the file has the events sheet with Date, Location, Name 1 columns.')); return; }
  const fresh = events.filter((e) => !e.dup);
  const noPhone = fresh.filter((e) => !e.p1 && !e.p2).length;
  if (noPhone) warn.push(L(`${noPhone} εκδηλώσεις χωρίς τηλέφωνο`, `${noPhone} events without phone`));
  warn.push(L('Οι εκδηλώσεις θα μπουν χωρίς PDF προσφοράς και χωρίς ώρα αν δεν υπάρχει — θα τα δείτε στον «Έλεγχο δεδομένων».', 'Events are imported without an offer PDF and without time if missing — see “Data checks”.'));
  warn.push(L('Οι δόσεις μπαίνουν χωρίς ημερομηνία είσπραξης (δεν υπήρχε στο παλιό φύλλο). Μπορείτε να τη συμπληρώσετε στο Μητρώο.', 'Installments are imported without a receipt date (not in the old sheet). Fill it in the register.'));
  const body = `<div class="banner">${icon('sparkles')}<div><b>${esc(L(`Βρέθηκαν ${events.length} εκδηλώσεις και ${expenses.length} έξοδα`, `Found ${events.length} events and ${expenses.length} expenses`))}</b><span>${esc(L(`${events.length - fresh.length} εκδηλώσεις υπάρχουν ήδη και θα παραλειφθούν.`, `${events.length - fresh.length} events already exist and will be skipped.`))}</span></div></div>
    <ul class="small muted">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    <div class="xl-wrap" style="max-height:340px"><table class="xl"><thead><tr class="h">${[L('Ημερομηνία', 'Date'), L('Τοποθεσία', 'Location'), L('Ζευγάρι', 'Couple'), L('Πακέτο', 'Package'), L('Πληρωμές', 'Payments'), ''].map((x) => `<th class="gc-plain" style="top:0">${esc(x)}</th>`).join('')}</tr></thead><tbody>
    ${events.slice(0, 60).map((e) => `<tr class="${e.dup ? 'cancelled' : ''}"><td><div class="c">${esc(fmtDate(e.date))}</div></td><td><div class="c">${esc(e.loc)}</div></td><td><div class="c">${esc([e.n1, e.n2].filter(Boolean).join(' & ') || '—')}</div></td><td class="num"><div class="c">${esc(money(e.price))}</div></td><td class="num"><div class="c">${esc(money(e.pays.reduce((n, p) => n + p.amount, 0)))}</div></td><td><div class="c">${e.dup ? esc(L('υπάρχει', 'exists')) : ''}</div></td></tr>`).join('')}
    </tbody></table></div>`;
  const s = sheet({ title: L('Εισαγωγή από Google Sheet', 'Import from Google Sheet'), body, wide: true, foot: `<button class="btn" data-close>${esc(L('Ακύρωση', 'Cancel'))}</button><button class="btn primary" data-go>${icon('upload')} ${esc(L(`Εισαγωγή ${fresh.length} εκδηλώσεων & ${expenses.length} εξόδων`, `Import ${fresh.length} events & ${expenses.length} expenses`))}</button>` });
  s.root.querySelector('[data-go]').addEventListener('click', async (ev) => { const _btn = ev.currentTarget;
    busy(_btn, true, L('Εισαγωγή…', 'Importing…'));
    const old = new Date(Date.now() - 30 * 864e5).toISOString();
    try {
      for (const e of fresh) {
        const { data: c, error: ce } = await sb.from('customers').insert({ name1: e.n1 || e.n2 || L('Πελάτης', 'Customer') + ' ' + (e.loc || fmtDate(e.date)), name2: e.n1 ? e.n2 || null : null, phone1: e.p1 || null, phone2: e.p2 || null, email1: e.e1 || null, email2: e.e2 || null, created_by: S.profile.id }).select().single();
        if (ce) throw ce;
        const { data: evr, error: ee } = await sb.from('events').insert({ customer_id: c.id, category: e.cat, event_date: e.date, event_time: e.time, church_location: e.loc || null, photo_status: e.photo, editing_status: e.edit, editing_pc: e.pc, video_notes: e.vnotes || null, created_at: old, created_by: S.profile.id }).select().single();
        if (ee) throw ee;
        await sb.from('event_finance').upsert({ event_id: evr.id, package_price: e.price, package_name: e.pname || null, second_crew: e.second, office_notes: e.office || null });
        if (e.pays.length) { const { error: pe } = await sb.from('payments').insert(e.pays.map((p) => ({ event_id: evr.id, category: e.cat, kind: p.kind, label: p.label, amount: p.amount, paid_on: null, created_at: old }))); if (pe) throw pe; }
      }
      if (expenses.length) await chunked('expenses', expenses);
      await loadAll();
      s.close();
      toast(L('Η εισαγωγή ολοκληρώθηκε! 🎉', 'Import complete! 🎉'), { body: L(`${fresh.length} εκδηλώσεις, ${expenses.length} έξοδα.`, `${fresh.length} events, ${expenses.length} expenses.`) });
    } catch (e) { busy(_btn, false); toastErr(L('Η εισαγωγή σταμάτησε', 'Import stopped'), friendlyError(e)); await loadAll(); }
  });
}
void lbl;
