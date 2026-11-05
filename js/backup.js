// =====================================================================
//  Αντίγραφα ασφαλείας (Excel / ZIP), επαναφορά, εισαγωγή παλιού Sheet
// =====================================================================
import { L, esc, icon, loadScript, download, norm, lbl, opt, APPT_MODES, APPT_STATUS, REJECT_REASONS, CATEGORIES, PHOTO_STATUS, EDIT_STATUS, PCS, METHODS, RESOLUTIONS, EXPENSE_KINDS, VIDEO_STATUS, SHOP_STATUS, FILES_COPIED, STORED_AT, SHOP_SUBS, OTHER_SUBS, ROLES, TRIGGERS, sheet, toast, toastErr, confirmBox, busy, money, fmtDate, pad2 } from './core.js';
import { sb, S, coupleName, profileName, loadAll, offerBlob, friendlyError, saveSetting } from './data.js';

/** Καταγραφή του τελευταίου αντιγράφου (για την υπενθύμιση στην Αρχική) */
const markBackup = (kind) => saveSetting('last_backup', { at: new Date().toISOString(), by: S.profile?.id || null, kind }).catch((e) => { console.warn('last_backup', e); });

const XL = () => loadScript('vendor/xlsx.full.min.js');
const ZIP = () => loadScript('vendor/jszip.min.js');
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1_$2');
const human = (list, v) => (v ? (opt(list, v) ? opt(list, v).el : v) : '');
function back(list, v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  const o = list.find((x) => x.v === s || norm(x.el) === norm(s) || norm(x.en) === norm(s) || (x.alias || []).some((a) => norm(a) === norm(s)));
  return o ? o.v : null;
}
const geoOk = (v) => (/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/.test(String(v || '').trim()) ? String(v).trim() : null);
const yes = (v) => /^(ναι|yes|true|1|x|✓)$/i.test(String(v ?? '').trim());
const num = (v) => { if (v === null || v === undefined || v === '') return null; if (typeof v === 'number') return v; const s = String(v).replace(/[€\s\u00a0]/g, ''); const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^-?\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s; const n = Number(t); return Number.isFinite(n) ? n : null; };
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
/** Φρέσκα δεδομένα από τη βάση πριν από κάθε αντίγραφο (και όσα δεν κρατιούνται όλα στη μνήμη) */
async function freshData() {
  await loadAll();
  const all = async (table, order) => {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from(table).select('*').order(order, { ascending: true }).range(from, from + 999);
      if (error) throw new Error(`${table}: ${friendlyError(error)}`);
      out.push(...data); if (data.length < 1000) break;
    }
    return out;
  };
  return { queue: await all('message_queue', 'created_at'), wf: await all('workflow_templates', 'sort') };
}
const tm5 = (t) => (t ? String(t).slice(0, 5) : '');

function buildWorkbook(extra = { queue: [], wf: [] }) {
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
      'Ημερομηνία': e.event_date, 'Ώρα': (e.event_time || '').slice(0, 5), 'Εκκλησία / Τοποθεσία': e.church_location || '', 'Σπίτι': e.house_location || '', 'Σπίτι νύφης': e.bride_house || '', 'Σπίτι γαμπρού': e.groom_house || '', 'Δεξίωση': e.reception_location || '', 'Pin εκκλησίας': e.church_geo || '', 'Pin σπιτιού νύφης': e.bride_geo || '', 'Pin σπιτιού γαμπρού': e.groom_geo || '', 'Pin δεξίωσης': e.reception_geo || '',
      'Ανάλυση': human(RESOLUTIONS, e.resolution), 'Σημειώσεις': e.notes || '', 'Εξωτερικοί συνεργάτες': e.extra_crew || '',
      'Κατάσταση φωτογραφιών': human(PHOTO_STATUS, e.photo_status), 'Κατάσταση editing': human(EDIT_STATUS, e.editing_status), 'Υπολογιστής μοντάζ': human(PCS, e.editing_pc), 'Σχόλια βίντεο': e.video_notes || '', 'Έως (πολυήμερη)': e.end_date || '', 'Κάλυψη': e.coverage === 'photo' ? 'Μόνο φωτογραφία' : e.coverage === 'video' ? 'Μόνο βίντεο' : 'Φωτογραφία & βίντεο', 'Συνεργεία': e.crew_mode === 'double' ? 2 : 1, 'Κατάσταση βίντεο': human(VIDEO_STATUS, e.video_status), 'Είναι στο μαγαζί': human(SHOP_STATUS, e.shop_status), 'Περασμένα αρχεία': human(FILES_COPIED, e.files_copied), 'Αποθηκευμένο σε': human(STORED_AT, e.stored_at),
      'Ακυρωμένη': e.status === 'cancelled' ? 'Ναι' : 'Όχι', 'Αξία πακέτου': f.package_price != null ? Number(f.package_price) : '', 'Όνομα πακέτου': f.package_name || '', '2ο συνεργείο': f.second_crew ? 'Ναι' : 'Όχι',
      'Σημειώσεις γραφείου': f.office_notes || '', 'Πληρώθηκαν': paid, 'Υπόλοιπο': f.package_price != null ? Number(f.package_price) - paid : '',
      'Αρχείο PDF': e.offer_path || '', 'Προσφορά (δεδομένα)': e.offer_data ? JSON.stringify(e.offer_data) : '', 'Δημιουργήθηκε': e.created_at,
      'Αλλαγή κατάστασης φωτογραφιών': e.photo_status_at || '', 'Αλλαγή κατάστασης editing': e.editing_status_at || '', 'Αλλαγή προσφοράς': e.offer_updated_at || '',
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
  add('Συνεργείο', S.crew.map((c) => ({ 'Εκδήλωση ID': c.event_id, 'Ζευγάρι': coupleName(S.customers.get(S.events.get(c.event_id)?.customer_id)), 'Ημερομηνία': S.events.get(c.event_id)?.event_date || '', 'Μέλος ID': c.user_id, 'Μέλος': profileName(S.profiles.find((p) => p.id === c.user_id)), 'Αρμοδιότητα': c.duty === 'video' ? 'Βίντεο' : c.duty === 'drone' ? 'Drone' : 'Φωτογραφία', '+ Drone': c.drone && c.duty !== 'drone' ? 'Ναι' : '', 'Συνεργείο (1/2)': c.team || '', 'Αναλαμβάνει': (c.tasks || []).join(','), 'Κείμενο ανάθεσης': c.brief || '', 'Δημιουργήθηκε': c.created_at || '' })), { 'Εκδήλωση ID': 38, 'Μέλος ID': 38 });
  add('Απουσίες', S.absences.map((a) => ({ ID: a.id, 'Μέλος ID': a.user_id, 'Μέλος': profileName(S.profiles.find((p) => p.id === a.user_id)), 'Ημερομηνία': a.day, 'Από': a.start_time ? String(a.start_time).slice(0, 5) : '', 'Έως': a.end_time ? String(a.end_time).slice(0, 5) : '', 'Σημείωση': a.note || '', 'Δημιουργήθηκε': a.created_at || '' })), { ID: 38, 'Μέλος ID': 38 });
  add('Next day - Ευχολόγια', S.sessions.map((x) => ({ ID: x.id, 'Εκδήλωση ID': x.event_id, 'Ζευγάρι': coupleName(S.customers.get(S.events.get(x.event_id)?.customer_id)), 'Είδος': x.kind === 'blessing' ? 'Ευχολόγιο' : 'Next day', 'Ημερομηνία': x.day, 'Ώρα': x.start_time ? String(x.start_time).slice(0, 5) : '', 'Τοποθεσία': x.location || '', 'Σημειώσεις': x.notes || '', 'Δημιουργήθηκε': x.created_at || '' })), { ID: 38, 'Εκδήλωση ID': 38, 'Ζευγάρι': 28 });
  add('Meetings', S.meetings.map((m) => ({ ID: m.id, 'Ημερομηνία': m.day, 'Ώρα': String(m.start_time || '').slice(0, 5), 'Τοποθεσία': m.location || '', 'Λόγοι': (m.reasons || []).join(' | '), 'Άτομα': (m.participants || []).map((id) => profileName(S.profiles.find((p) => p.id === id))).join(', '), 'Άτομα ID': (m.participants || []).join(','), 'Σημειώσεις': m.notes || '', 'Δημιουργήθηκε': m.created_at || '' })), { ID: 38, 'Λόγοι': 40, 'Άτομα': 40, 'Άτομα ID': 40 });
  add('Ημερολόγιο - Άλλο', S.calNotes.map((n) => ({ ID: n.id, 'Ημερομηνία': n.day, 'Ώρα': n.start_time ? String(n.start_time).slice(0, 5) : '', 'Τίτλος': n.title, 'Τοποθεσία': n.location || '', 'Σημειώσεις': n.notes || '', 'Ορατό σε όλους': n.team_visible === false ? 'Όχι' : 'Ναι', 'Δημιουργήθηκε': n.created_at || '' })), { ID: 38, 'Τίτλος': 30 });
  add('Πρότυπα μηνυμάτων', S.templates.map((t) => ({ ID: t.id, 'Κλειδί': t.key || '', 'Όνομα': t.name, 'Πότε': human(TRIGGERS, t.trigger_type), 'Ημέρες': t.offset_days, 'Ώρα': t.send_hour, 'Ποσοστό %': t.threshold_pct ?? '', 'Κατηγορίες': (t.categories || []).map((c) => human(CATEGORIES, c)).join(', '), 'Τρόποι': (t.channels || []).join(', '), 'Θέμα': t.subject || '', 'Κείμενο': t.body, 'Ενεργό': t.enabled ? 'Ναι' : 'Όχι', 'Παραλήπτες': (t.recipients || []).join(',') })), { ID: 38, 'Κείμενο': 80 });
  add('Πρότυπα εργασιών', extra.wf.map((t) => ({ ID: t.id, 'Κλειδί': t.key || '', 'Όνομα': t.name, 'Στάδιο': t.stage || '', 'Τρόποι': (t.channels || []).join(', '), 'Θέμα': t.subject || '', 'Κείμενο': t.body, 'Ενεργό': t.enabled ? 'Ναι' : 'Όχι', 'Σειρά': t.sort ?? '' })), { ID: 38, 'Κείμενο': 80 });
  add('Μηνύματα πελατών', extra.queue.map((m) => ({ ID: m.id, 'Πρότυπο ID': m.template_id || '', 'Εκδήλωση ID': m.event_id || '', 'Πληρωμή ID': m.payment_id || '', 'Κλειδί': m.dedupe_key, 'Τίτλος': m.title || '', 'Προς τηλέφωνο': m.to_phone || '', 'Προς email': m.to_email || '', 'Θέμα': m.subject || '', 'Κείμενο': m.body, 'Τρόποι': (m.channels || []).join(','), 'Κατάσταση': m.status || '', 'Προγραμματισμένο': m.due_at || '', 'Στάλθηκε': m.sent_at || '', 'Στάλθηκε από ID': m.sent_by || '', 'Ανατέθηκε σε ID': (m.assigned_to || []).join(','), 'Δημιουργήθηκε': m.created_at })), { ID: 38, 'Κείμενο': 60, 'Κλειδί': 40 });
  add('Ρυθμίσεις', Object.entries(S.settings || {}).map(([k, v]) => ({ 'Κλειδί': k, 'Τιμή (JSON)': JSON.stringify(v) })), { 'Κλειδί': 22, 'Τιμή (JSON)': 90 });
  add('Ομάδα', S.profiles.map((p) => ({ 'Όνομα': profileName(p), 'Username': p.username, 'Email': p.email, 'Ρόλος': human(ROLES, p.role) || 'Χωρίς ρόλο', 'Ενεργός': p.active ? 'Ναι' : 'Όχι' })));
  add('Ραντεβού', S.appointments.map((a) => ({ ID: a.id, 'Τύπος': human(APPT_MODES, a.mode), 'Ημερομηνία ραντεβού': a.appt_date, 'Ώρα ραντεβού': a.appt_time ? String(a.appt_time).slice(0, 5) : '', 'Κατηγορία': human(CATEGORIES, a.category), 'Ονοματεπώνυμο 1': a.name1 || '', 'Ονοματεπώνυμο 2': a.name2 || '', 'Κινητό': a.phone || '', Email: a.email || '', 'Ημερομηνία εκδήλωσης': a.event_date || '', 'Εκκλησία': a.church || '', 'Ώρα εκκλησίας': a.church_time || '', 'Δεξίωση': a.reception || '', 'Ώρα δεξίωσης': a.reception_time || '', 'Πελάτης ID': a.customer_id || '', 'Δημιουργήθηκε': a.created_at || '', 'Αξία προσφοράς': a.total ?? '', 'Κατάσταση': human(APPT_STATUS, a.status), 'Ημερομηνία κατάστασης': a.status_at, 'Λόγος': human(REJECT_REASONS, a.reason), 'Σχόλια': a.comments || '', 'Σημειώσεις': a.notes || '', 'Εκδήλωση ID': a.event_id || '', 'Αρχείο PDF': a.offer_path || '', 'Προσφορά (δεδομένα)': a.offer_data ? JSON.stringify(a.offer_data) : '', 'Επιλογές πελάτη': a.selections ? JSON.stringify(a.selections) : '' })), { ID: 38, 'Ονοματεπώνυμο 1': 24, 'Ονοματεπώνυμο 2': 24, 'Σχόλια': 40 });
  return wb;
}

export async function exportAllXlsx() {
  const [, extra] = await Promise.all([XL(), freshData()]);
  window.XLSX.writeFile(buildWorkbook(extra), `ImageMakers_Antigrafo_${stamp()}.xlsx`);
  await markBackup('xlsx');
  toast(L('Το αρχείο Excel κατέβηκε', 'Excel file downloaded'));
}

export async function exportFullZip() {
  const t = toast(L('Ετοιμάζεται το αντίγραφο…', 'Preparing backup…'), { type: 'info', ms: 600000 });
  try {
    const [, , extra] = await Promise.all([XL(), ZIP(), freshData()]);
    const zip = new window.JSZip();
    const wbout = window.XLSX.write(buildWorkbook(extra), { bookType: 'xlsx', type: 'array' });
    zip.file('ImageMakers_dedomena.xlsx', wbout);
    const folder = zip.folder('prosfores_pdf');
    let n = 0; let failed = 0;
    for (const e of S.events.values()) {
      if (!e.offer_path) continue;
      try {
        const b = await offerBlob(e.offer_path);
        const name = `${e.id}__${e.event_date}_${coupleName(S.customers.get(e.customer_id)).replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 50)}.pdf`;
        folder.file(name, b); n++;
      } catch (err) { failed++; console.warn('pdf', e.id, err); }
    }
    // και τα PDF των ραντεβού/προσφορών
    const af = zip.folder('rantevou_pdf'); let na = 0;
    for (const a of S.appointments) {
      if (!a.offer_path) continue;
      try {
        const b = await offerBlob(a.offer_path);
        af.file(`${a.id}__appt__${(a.appt_date || '')}_${[a.name1, a.name2].filter(Boolean).join('_').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 50)}.pdf`, b); na++;
      } catch (err) { failed++; console.warn('pdf appt', a.id, err); }
    }
    zip.file('README_DIAVASTE.txt', `Image Makers · Πλήρες αντίγραφο ασφαλείας\nΗμερομηνία: ${new Date().toLocaleString('el-GR')}\n\n- ImageMakers_dedomena.xlsx: όλα τα δεδομένα (ανοίγει σε Excel / Numbers / Google Sheets)\n- prosfores_pdf/: ${n} PDF προσφορών εκδηλώσεων (το όνομα ξεκινά με το ID της εκδήλωσης)\n- rantevou_pdf/: ${na} PDF προσφορών ραντεβού\n\nΕπαναφορά: Εφαρμογή → Ρυθμίσεις → Επαναφορά από αντίγραφο → επιλέξτε αυτό το .zip\n`);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    download(blob, `ImageMakers_Pliris_Antigrafo_${stamp()}.zip`);
    await markBackup('zip');
    t();
    if (failed) toastErr(L('Το αντίγραφο κατέβηκε, αλλά λείπουν PDF', 'Backup downloaded, but some PDFs are missing'), L(`${n + na} PDF μπήκαν, ${failed} δεν κατέβηκαν (σύνδεση;). Τα δεδομένα είναι όλα μέσα· δοκιμάστε ξανά για τα PDF.`, `${n + na} PDFs included, ${failed} could not be downloaded (connection?). All data is included; try again for the PDFs.`));
    else toast(L('Το πλήρες αντίγραφο κατέβηκε', 'Full backup downloaded'), { body: L(`${n + na} PDF προσφορών μέσα στο αρχείο.`, `${n + na} offer PDFs included.`) });
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
    i.addEventListener('cancel', () => { i.remove(); resolve(null); }); // κλείσιμο του παραθύρου χωρίς επιλογή
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
    const x = Object.values(zip.files).find((f) => /\.xlsx$/i.test(f.name) && !f.name.startsWith('__MACOSX'));
    if (!x) throw new Error(L('Το zip δεν περιέχει αρχείο Excel', 'The zip has no Excel file'));
    wbData = await x.async('arraybuffer');
    for (const f of Object.values(zip.files)) { if (f.dir || f.name.startsWith('__MACOSX')) continue; const m = f.name.match(/([0-9a-f-]{36})__(appt__)?[^/]*\.pdf$/i); if (m) pdfs.push({ id: m[1].toLowerCase(), appt: !!m[2], file: f }); }
  } else wbData = await file.arrayBuffer();
  const wb = window.XLSX.read(wbData, { type: 'array' });
  // όλα τα κελιά ως κείμενο χωρίς κενά άκρα (αν το αρχείο ανοίχτηκε/αποθηκεύτηκε στο Excel, τα ID/τηλέφωνα μένουν σωστά)
  const rows = (n) => (wb.Sheets[n] ? window.XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' }).map((r) => { const o = {}; for (const k in r) o[k.trim()] = r[k]; return o; }) : []);
  const C = rows('Πελάτες'), E = rows('Εκδηλώσεις'), P = rows('Πληρωμές'), X = rows('Έξοδα'), K = rows('Συνεργείο'), T = rows('Πρότυπα μηνυμάτων');
  const AB0 = rows('Απουσίες'), SX0 = rows('Next day - Ευχολόγια'), MT0 = rows('Meetings'), CN0 = rows('Ημερολόγιο - Άλλο'), A = rows('Ραντεβού'), WF = rows('Πρότυπα εργασιών'), Q = rows('Μηνύματα πελατών'), ST = rows('Ρυθμίσεις');
  if (!C.length && !E.length && !P.length && !X.length && !A.length) { toastErr(L('Δεν αναγνωρίστηκε το αρχείο', 'File not recognized'), L('Επιλέξτε αντίγραφο που κατεβάσατε από αυτή την εφαρμογή. Για το παλιό Google Sheet χρησιμοποιήστε την «Εισαγωγή από το παλιό Google Sheet».', 'Choose a backup downloaded from this app. For the old Google Sheet use “Import from the old Google Sheet”.')); return; }
  // Ασφαλής επαναφορά: προστίθενται ΜΟΝΟ όσα λείπουν· ό,τι υπάρχει ήδη στην εφαρμογή δεν αλλάζει ποτέ
  const extra = await freshData();
  const id = (v) => String(v ?? '').trim().toLowerCase();
  const ids = (list, f = (x) => x.id) => new Set(list.map((x) => id(f(x))));
  const have = { c: new Set(S.customers.keys()), e: new Set(S.events.keys()), p: ids(S.payments), x: ids(S.expenses), a: ids(S.appointments), t: ids(S.templates), ab: ids(S.absences), sx: ids(S.sessions), mt: ids(S.meetings), cn: ids(S.calNotes), wf: ids(extra.wf), q: ids(extra.queue, (m) => m.dedupe_key) };
  const fresh = (list, set, key = 'ID') => list.filter((r) => id(r[key]) && !set.has(id(r[key])));
  const profIds = new Set(S.profiles.map((p) => p.id));
  const nC = fresh(C, have.c), nE = fresh(E, have.e).filter((r) => toISODate(r['Ημερομηνία'])), nP = fresh(P, have.p).filter((r) => num(r['Ποσό'])), nX = fresh(X, have.x).filter((r) => num(r['Ποσό']));
  const nA = fresh(A, have.a).filter((r) => toISODate(r['Ημερομηνία ραντεβού']));
  const nAB = fresh(AB0, have.ab).filter((r) => profIds.has(id(r['Μέλος ID'])) && toISODate(r['Ημερομηνία']));
  const nSX = fresh(SX0, have.sx), nMT = fresh(MT0, have.mt), nCN = fresh(CN0, have.cn);
  const tKeys = new Set(S.templates.map((t) => t.key).filter(Boolean)); const wKeys = new Set(extra.wf.map((t) => t.key).filter(Boolean));
  const nT = fresh(T, have.t).filter((r) => r['Κείμενο'] && r['Όνομα'] && !(r['Κλειδί'] && tKeys.has(r['Κλειδί'])));
  const nWF = fresh(WF, have.wf).filter((r) => r['Κείμενο'] && r['Όνομα'] && !(r['Κλειδί'] && wKeys.has(r['Κλειδί'])));
  const nQ = fresh(Q, have.q, 'Κλειδί').filter((r) => r['Κείμενο']);
  const nST = ST.filter((r) => r['Κλειδί'] && !['last_backup', 'vapid_public'].includes(r['Κλειδί']) && !(r['Κλειδί'] in (S.settings || {})));
  const total = nC.length + nE.length + nP.length + nX.length + nA.length + nAB.length + nSX.length + nMT.length + nCN.length + nT.length + nWF.length + nQ.length + nST.length;
  const pdfTodo = pdfs.filter((p) => { const cur = p.appt ? S.appointments.find((a) => a.id === p.id) : S.events.get(p.id); return cur && !cur.offer_path; }).length;
  if (!total && !pdfTodo) { toast(L('Δεν χρειάζεται επαναφορά', 'Nothing to restore'), { body: L('Όλα τα στοιχεία του αντιγράφου υπάρχουν ήδη στην εφαρμογή.', 'Everything in the backup already exists in the app.') }); return; }
  const others = nA.length + nAB.length + nSX.length + nMT.length + nCN.length + nT.length + nWF.length + nQ.length + nST.length;
  if (!await confirmBox(L('Επαναφορά δεδομένων;', 'Restore data?'), L(`Θα προστεθούν όσα λείπουν από την εφαρμογή: ${nC.length} πελάτες, ${nE.length} εκδηλώσεις, ${nP.length} πληρωμές, ${nX.length} έξοδα${others ? ` και ${others} ακόμη (ραντεβού, απουσίες, μηνύματα κ.λπ.)` : ''}.\nΌ,τι υπάρχει ήδη ΔΕΝ αλλάζει και δεν σβήνεται τίποτα.`, `Missing records will be added: ${nC.length} customers, ${nE.length} events, ${nP.length} payments, ${nX.length} expenses${others ? ` and ${others} more (appointments, absences, messages etc.)` : ''}.\nExisting records are NOT changed and nothing is deleted.`), { ok: L('Επαναφορά', 'Restore') })) return;
  const t = toast(L('Γίνεται επαναφορά…', 'Restoring…'), { type: 'info', ms: 600000 });
  // λειτουργία επαναφοράς: χωρίς ειδοποιήσεις στην ομάδα και χωρίς νέα μηνύματα πελατών όσο προστίθενται
  try { await sb.rpc('set_restore_mode', { p_on: true }); } catch (e) { console.warn('restore mode', e); }
  try {
    const old = new Date(Date.now() - 30 * 864e5).toISOString();
    // χρονοσφραγίδα: κείμενο ISO, ή αριθμός ημερομηνίας του Excel (αν το αρχείο αποθηκεύτηκε από το Excel)
    const ts = (v) => {
      if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
      if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
      const s = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
    };
    const hm = (v) => toTime(v) || str(v);
    const str = (v) => { const s = String(v ?? ''); return s.trim() ? s : null; };
    const js = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
    const custOk = new Set([...have.c, ...nC.map((r) => id(r.ID))]);
    const evOk = new Set([...have.e, ...nE.map((r) => id(r.ID))]);
    const payOk = new Set([...have.p, ...nP.map((r) => id(r.ID))]);
    await chunked('customers', nC.map((r) => ({ id: id(r.ID), name1: str(r['Ονοματεπώνυμο 1']) || '—', name2: str(r['Ονοματεπώνυμο 2']), phone1: str(r['Κινητό 1']), phone2: str(r['Κινητό 2']), email1: str(r['Email 1']), email2: str(r['Email 2']), notes: str(r['Σημειώσεις']), created_at: ts(r['Δημιουργήθηκε']) || old })));
    await chunked('events', nE.map((r) => {
      const cid = id(r['Πελάτης ID']);
      return { id: id(r.ID), customer_id: custOk.has(cid) ? cid : null, category: back(CATEGORIES, r['Κατηγορία']) || 'wedding', event_date: toISODate(r['Ημερομηνία']), event_time: toTime(r['Ώρα']), church_location: str(r['Εκκλησία / Τοποθεσία']), house_location: str(r['Σπίτι']), bride_house: str(r['Σπίτι νύφης']), groom_house: str(r['Σπίτι γαμπρού']), church_geo: geoOk(r['Pin εκκλησίας']), bride_geo: geoOk(r['Pin σπιτιού νύφης']), groom_geo: geoOk(r['Pin σπιτιού γαμπρού']), reception_geo: geoOk(r['Pin δεξίωσης']), reception_location: str(r['Δεξίωση']), resolution: back(RESOLUTIONS, r['Ανάλυση']), notes: str(r['Σημειώσεις']), extra_crew: str(r['Εξωτερικοί συνεργάτες']), photo_status: back(PHOTO_STATUS, r['Κατάσταση φωτογραφιών']) || 'samples_todo', editing_status: back(EDIT_STATUS, r['Κατάσταση editing']) || 'none', editing_pc: back(PCS, r['Υπολογιστής μοντάζ']), video_notes: str(r['Σχόλια βίντεο']), end_date: toISODate(r['Έως (πολυήμερη)']) || null, coverage: /μόνο φωτ|photo only/i.test(r['Κάλυψη'] || '') ? 'photo' : /μόνο βίντ|video only/i.test(r['Κάλυψη'] || '') ? 'video' : 'both', crew_mode: String(r['Συνεργεία'] || '1') === '2' ? 'double' : 'single', video_status: back(VIDEO_STATUS, r['Κατάσταση βίντεο']) || 'not_ready', shop_status: back(SHOP_STATUS, r['Είναι στο μαγαζί']), files_copied: back(FILES_COPIED, r['Περασμένα αρχεία']), stored_at: back(STORED_AT, r['Αποθηκευμένο σε']), status: yes(r['Ακυρωμένη']) ? 'cancelled' : 'booked', offer_path: str(r['Αρχείο PDF']), offer_data: js(r['Προσφορά (δεδομένα)']), created_at: ts(r['Δημιουργήθηκε']) || old, photo_status_at: ts(r['Αλλαγή κατάστασης φωτογραφιών']), editing_status_at: ts(r['Αλλαγή κατάστασης editing']), offer_updated_at: ts(r['Αλλαγή προσφοράς']) };
    }));
    await chunked('event_finance', nE.map((r) => ({ event_id: id(r.ID), package_price: num(r['Αξία πακέτου']), package_name: str(r['Όνομα πακέτου']), second_crew: yes(r['2ο συνεργείο']), office_notes: str(r['Σημειώσεις γραφείου']) })), { onConflict: 'event_id' });
    await chunked('payments', nP.map((r) => { const ev = id(r['Εκδήλωση ID']); return { id: id(r.ID), event_id: evOk.has(ev) ? ev : null, category: back(CATEGORIES, r['Κατηγορία']) || 'other', kind: r['Είδος'] === 'Προκαταβολή' ? 'deposit' : r['Είδος'] === 'Άλλο' ? 'other' : 'installment', label: str(r['Τύπος πληρωμής']), amount: num(r['Ποσό']), paid_on: toISODate(r['Ημερομηνία είσπραξης']), method: back(METHODS, r['Τρόπος πληρωμής']), description: str(r['Περιγραφή']), notes: str(r['Σημειώσεις']), created_at: ts(r['Δημιουργήθηκε']) || old }; }));
    await chunked('expenses', nX.map((r) => {
      const kind = back(EXPENSE_KINDS, r['Τύπος']) || 'other'; const crew = id(r['Μέλος ID']);
      return { id: id(r.ID), kind, subcategory: kind === 'shop' ? back(SHOP_SUBS, r['Υποκατηγορία']) : kind === 'other' ? back(OTHER_SUBS, r['Υποκατηγορία']) || 'misc' : str(r['Υποκατηγορία']), crew_id: profIds.has(crew) ? crew : null, crew_name: str(r['Μέλος / Συνεργάτης']), for_month: r['Για μήνα'] ? (toISODate(r['Για μήνα']) || String(r['Για μήνα']).slice(0, 7) + '-01').slice(0, 7) + '-01' : null, paid_until: toISODate(r['Πληρωμένος έως']), days: num(r['Ημέρες']), amount: num(r['Ποσό']), paid_on: toISODate(r['Ημερομηνία']) || new Date().toISOString().slice(0, 10), method: back(METHODS, r['Τρόπος πληρωμής']), supplier: str(r['Πληρώθηκε σε / Προμηθευτής']), description: str(r['Περιγραφή']), notes: str(r['Σημειώσεις']), created_at: ts(r['Δημιουργήθηκε']) || old };
    }));
    const newEv = new Set(nE.map((r) => id(r.ID)));
    const crewRows = K.filter((r) => profIds.has(id(r['Μέλος ID'])) && newEv.has(id(r['Εκδήλωση ID']))).map((r) => ({ event_id: id(r['Εκδήλωση ID']), user_id: id(r['Μέλος ID']), duty: r['Αρμοδιότητα'] === 'Βίντεο' ? 'video' : /drone/i.test(r['Αρμοδιότητα'] || '') ? 'drone' : 'photo', drone: r['+ Drone'] === 'Ναι' || /drone/i.test(r['Αρμοδιότητα'] || ''), team: [1, 2].includes(Number(r['Συνεργείο (1/2)'])) ? Number(r['Συνεργείο (1/2)']) : null, tasks: String(r['Αναλαμβάνει'] || '').split(',').map((x) => x.trim()).filter((x) => ['houses', 'church', 'reception', 'drone'].includes(x)), brief: str(r['Κείμενο ανάθεσης']), ...(ts(r['Δημιουργήθηκε']) ? { created_at: ts(r['Δημιουργήθηκε']) } : {}) }));
    if (crewRows.length) await chunked('event_crew', crewRows, { onConflict: 'event_id,user_id', ignoreDuplicates: true });
    const AB = nAB.map((r) => ({ id: id(r.ID), user_id: id(r['Μέλος ID']), day: toISODate(r['Ημερομηνία']), start_time: toTime(r['Από']), end_time: toTime(r['Έως']), note: str(r['Σημείωση']), ...(ts(r['Δημιουργήθηκε']) ? { created_at: ts(r['Δημιουργήθηκε']) } : {}) })).filter((a) => (!a.start_time && !a.end_time) || (a.start_time && a.end_time && a.end_time > a.start_time));
    if (AB.length) await chunked('absences', AB, { onConflict: 'id', ignoreDuplicates: true });
    const SX = nSX.filter((r) => evOk.has(id(r['Εκδήλωση ID'])) && toISODate(r['Ημερομηνία'])).map((r) => ({ id: id(r.ID), event_id: id(r['Εκδήλωση ID']), kind: r['Είδος'] === 'Ευχολόγιο' ? 'blessing' : 'next_day', day: toISODate(r['Ημερομηνία']), start_time: toTime(r['Ώρα']), location: str(r['Τοποθεσία']), notes: str(r['Σημειώσεις']), ...(ts(r['Δημιουργήθηκε']) ? { created_at: ts(r['Δημιουργήθηκε']) } : {}) }));
    if (SX.length) await chunked('event_sessions', SX, { onConflict: 'id', ignoreDuplicates: true });
    const MT = nMT.filter((r) => toISODate(r['Ημερομηνία']) && toTime(r['Ώρα'])).map((r) => ({ id: id(r.ID), day: toISODate(r['Ημερομηνία']), start_time: toTime(r['Ώρα']), location: str(r['Τοποθεσία']), reasons: String(r['Λόγοι'] || '').split('|').map((x) => x.trim()).filter(Boolean), participants: String(r['Άτομα ID'] || '').split(',').map(id).filter((u) => profIds.has(u)), notes: str(r['Σημειώσεις']), ...(ts(r['Δημιουργήθηκε']) ? { created_at: ts(r['Δημιουργήθηκε']) } : {}) })).filter((m) => m.reasons.length && m.participants.length);
    if (MT.length) await chunked('meetings', MT, { onConflict: 'id', ignoreDuplicates: true });
    const CN = nCN.filter((r) => r['Τίτλος'] && toISODate(r['Ημερομηνία'])).map((r) => ({ id: id(r.ID), day: toISODate(r['Ημερομηνία']), start_time: toTime(r['Ώρα']), title: String(r['Τίτλος']).slice(0, 200), location: str(r['Τοποθεσία']), notes: str(r['Σημειώσεις']), team_visible: r['Ορατό σε όλους'] !== 'Όχι', ...(ts(r['Δημιουργήθηκε']) ? { created_at: ts(r['Δημιουργήθηκε']) } : {}) }));
    if (CN.length) await chunked('calendar_notes', CN, { onConflict: 'id', ignoreDuplicates: true });
    if (nT.length) await chunked('message_templates', nT.map((r) => ({ id: id(r.ID), key: str(r['Κλειδί']), name: r['Όνομα'], trigger_type: back(TRIGGERS, r['Πότε']) || 'before_event', offset_days: Number(r['Ημέρες']) || 0, send_hour: r['Ώρα'] === '' ? 11 : Math.min(23, Math.max(0, Number(r['Ώρα']) || 0)), threshold_pct: num(r['Ποσοστό %']), categories: String(r['Κατηγορίες'] || '').split(',').map((x) => back(CATEGORIES, x)).filter(Boolean), channels: String(r['Τρόποι'] || 'sms,email').split(',').map((x) => x.trim()).filter(Boolean), ...(r['Παραλήπτες'] ? { recipients: String(r['Παραλήπτες']).split(',').map(id).filter((u) => profIds.has(u)) } : {}), subject: str(r['Θέμα']), body: r['Κείμενο'], enabled: yes(r['Ενεργό']) })));
    if (nWF.length) await chunked('workflow_templates', nWF.map((r) => ({ id: id(r.ID), key: str(r['Κλειδί']), name: r['Όνομα'], stage: str(r['Στάδιο']), channels: String(r['Τρόποι'] || '').split(',').map((x) => x.trim()).filter(Boolean), subject: str(r['Θέμα']), body: r['Κείμενο'], enabled: yes(r['Ενεργό']), sort: num(r['Σειρά']) ?? 0 })));
    const evIds = new Set([...S.events.keys(), ...newEv]);
    if (nA.length) await chunked('appointments', nA.map((r) => { const ev = id(r['Εκδήλωση ID']); const cu = id(r['Πελάτης ID']); return { id: id(r.ID), mode: back(APPT_MODES, r['Τύπος']) || 'store', appt_date: toISODate(r['Ημερομηνία ραντεβού']), appt_time: toTime(r['Ώρα ραντεβού']), category: back(CATEGORIES, r['Κατηγορία']) || 'wedding', name1: str(r['Ονοματεπώνυμο 1']), name2: str(r['Ονοματεπώνυμο 2']), phone: str(r['Κινητό']), email: str(r.Email), event_date: toISODate(r['Ημερομηνία εκδήλωσης']), church: str(r['Εκκλησία']), church_time: hm(r['Ώρα εκκλησίας']), reception: str(r['Δεξίωση']), reception_time: hm(r['Ώρα δεξίωσης']), total: num(r['Αξία προσφοράς']), status: back(APPT_STATUS, r['Κατάσταση']) || 'pending', status_at: ts(r['Ημερομηνία κατάστασης']) || new Date().toISOString(), reason: back(REJECT_REASONS, r['Λόγος']), comments: str(r['Σχόλια']), notes: str(r['Σημειώσεις']), event_id: evIds.has(ev) ? ev : null, customer_id: custOk.has(cu) ? cu : null, offer_path: str(r['Αρχείο PDF']), offer_data: js(r['Προσφορά (δεδομένα)']), selections: js(r['Επιλογές πελάτη']), ...(ts(r['Δημιουργήθηκε']) ? { created_at: ts(r['Δημιουργήθηκε']) } : {}) }; }));
    // ιστορικό μηνυμάτων προς πελάτες (ώστε να μην ξανασταλούν όσα είχαν σταλεί)
    const tplOk = new Set([...have.t, ...nT.map((r) => id(r.ID))]);
    if (nQ.length) await chunked('message_queue', nQ.map((r) => { const tp = id(r['Πρότυπο ID']), ev = id(r['Εκδήλωση ID']), pa = id(r['Πληρωμή ID']), sb_ = id(r['Στάλθηκε από ID']); return { id: id(r.ID) || undefined, template_id: tplOk.has(tp) ? tp : null, event_id: evOk.has(ev) ? ev : null, payment_id: payOk.has(pa) ? pa : null, dedupe_key: r['Κλειδί'], title: str(r['Τίτλος']), to_phone: str(r['Προς τηλέφωνο']), to_email: str(r['Προς email']), subject: str(r['Θέμα']), body: r['Κείμενο'], channels: String(r['Τρόποι'] || '').split(',').map((x) => x.trim()).filter(Boolean), status: ['pending', 'sent', 'dismissed'].includes(r['Κατάσταση']) ? r['Κατάσταση'] : 'pending', due_at: ts(r['Προγραμματισμένο']), sent_at: ts(r['Στάλθηκε']), sent_by: profIds.has(sb_) ? sb_ : null, assigned_to: String(r['Ανατέθηκε σε ID'] || '').split(',').map(id).filter((u) => profIds.has(u)), created_at: ts(r['Δημιουργήθηκε']) || old }; }), { onConflict: 'dedupe_key', ignoreDuplicates: true });
    for (const r of nST) { const v = js(r['Τιμή (JSON)']); if (v !== null) { const { error } = await sb.from('app_settings').insert({ key: r['Κλειδί'], value: v }); if (error && error.code !== '23505') throw new Error(`app_settings: ${friendlyError(error)}`); } }
    // PDF: μόνο όπου λείπει (νέα εγγραφή ή χωρίς αρχείο)· δεν αντικαθίσταται υπάρχον PDF
    await loadAll();
    let pdfOk = 0, pdfFail = 0;
    for (const p of pdfs) {
      const cur = p.appt ? S.appointments.find((a) => a.id === p.id) : S.events.get(p.id);
      if (!cur) continue;
      const isNew = p.appt ? nA.some((r) => id(r.ID) === p.id) : newEv.has(p.id);
      if (!isNew && cur.offer_path) continue;
      try {
        const blob = new Blob([await p.file.async('arraybuffer')], { type: 'application/pdf' });
        const path = `${p.appt ? 'appointments/' : ''}${p.id}/offer-restored-${Date.now()}.pdf`;
        const { error } = await sb.storage.from('offers').upload(path, blob, { contentType: 'application/pdf', upsert: false });
        if (error) throw error;
        const { error: ue } = await sb.from(p.appt ? 'appointments' : 'events').update({ offer_path: path }).eq('id', p.id);
        if (ue) throw ue;
        pdfOk++;
      } catch (e) { pdfFail++; console.warn('restore pdf', p.id, e); }
    }
    t();
    toast(L('Η επαναφορά ολοκληρώθηκε', 'Restore complete'), { body: L(`${total} εγγραφές${pdfOk ? ` και ${pdfOk} PDF` : ''} προστέθηκαν.`, `${total} records${pdfOk ? ` and ${pdfOk} PDFs` : ''} added.`) });
    if (pdfFail) toastErr(L(`${pdfFail} PDF δεν ανέβηκαν`, `${pdfFail} PDFs were not uploaded`), L('Τα δεδομένα επανήλθαν. Δοκιμάστε ξανά την επαναφορά για τα PDF.', 'The data was restored. Run the restore again for the PDFs.'));
  } catch (e) { t(); throw e; } finally {
    try { await sb.rpc('set_restore_mode', { p_on: false }); } catch (e) { console.warn('restore mode', e); }
    try { await sb.rpc('run_automations'); } catch (e) { console.warn('automations', e); }
    await loadAll();
  }
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

const PHOTO_MAP = (s) => { const n = norm(s); if (!n) return null; if (n.includes('παραδοθ')) return 'delivered'; if (n.includes('ετοιμ')) return 'ready'; if (n.includes('εκτυπω') || n.includes('εργαστηρ') || n.includes('lab')) return 'lab'; if (n.includes('αλλαγ')) return 'changes'; if (n.includes('δειγμα') && (n.includes('ελαβ') || n.includes('περιμεν') || n.includes('παραλαβ'))) return 'samples_waiting'; if (n.includes('δειγμα')) return 'samples_todo'; return null; };
function findHeader(aoa, must) {
  must = must.map(norm);
  for (let i = 0; i < Math.min(8, aoa.length); i++) {
    const r = (aoa[i] || []).map((c) => norm(c));
    if (must.every((m) => r.some((c) => c === m || c.startsWith(m)))) return i;
  }
  return -1;
}

export async function importOldSheet() {
  const N = norm;
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
        date: col((c) => c === N('ημερομηνια')), loc: col((c) => c === N('τοποθεσια')),
        n1: col((c) => c === N('ονομα 1')), n2: col((c) => c === N('ονομα 2')), p1: col((c) => c.startsWith(N('τηλ. 1')) || c === N('τηλ 1')), p2: col((c) => c.startsWith(N('τηλ. 2')) || c === N('τηλ 2')),
        e1: col((c) => c === N('email 1')), e2: col((c) => c === N('email 2')), cat: col((c) => c.startsWith(N('κατηγορια εκδηλωσ'))), second: col((c) => c.startsWith(N('δευτερο συνεργ'))),
        price: col((c) => c.startsWith(N('πακετο'))), pname: col((c) => c.startsWith(N('ονομα πακετου'))), dep: col((c) => c.startsWith(N('προκαταβολ'))),
        photo: col((c) => c.startsWith(N('κατασταση album')) || c.startsWith(N('κατασταση φωτογραφ'))), edit: col((c) => c.startsWith(N('κατασταση editing'))),
        pc: col((c) => c.startsWith(N('υπολογιστης'))), vnotes: col((c) => c.startsWith(N('σχολια βιντεο'))), office: col((c) => c.startsWith(N('σημειωσεις γραφειου'))), time: col((c) => c === N('ωρα')),
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
          photo: back(PHOTO_STATUS, photoV) || PHOTO_MAP(photoV) || 'samples_todo', edit: back(EDIT_STATUS, get(r, ix.edit)) || (norm(get(r, ix.edit)) === N('να γινει') ? 'todo' : 'none'), pc: back(PCS, get(r, ix.pc)), vnotes: String(get(r, ix.vnotes) || '').trim(), office: String(get(r, ix.office) || '').trim(),
          dup: [...S.events.values()].some((e) => e.event_date === date && norm(e.church_location) === norm(get(r, ix.loc))),
        });
      }
      continue;
    }
    // Φύλλο εξόδων
    h = findHeader(aoa, ['ημερομηνια', 'κατηγορια εξοδου', 'ποσο']);
    if (h >= 0) {
      const H = aoa[h].map((c) => norm(c));
      const ix = { date: H.findIndex((c) => c === N('ημερομηνια')), cat: H.findIndex((c) => c.startsWith(N('κατηγορια εξοδου'))), sup: H.findIndex((c) => c.startsWith(N('πληρωθηκε'))), desc: H.findIndex((c) => c.startsWith(N('περιγραφη'))), amt: H.findIndex((c) => c === N('ποσο')), meth: H.findIndex((c) => c.startsWith(N('τροπος'))), notes: H.findIndex((c) => c.startsWith(N('σημειωσεις'))) };
      for (let i = h + 1; i < aoa.length; i++) {
        const r = aoa[i]; const amount = num(r[ix.amt]); const date = toISODate(r[ix.date]);
        if (!amount || !date) continue;
        const [kind, sub] = EXP_MAP(r[ix.cat]);
        expenses.push({ kind, subcategory: sub, paid_on: date, amount, supplier: String(r[ix.sup] ?? '').trim() || null, crew_name: ['payroll', 'daily_wage'].includes(kind) ? String(r[ix.sup] ?? '').trim() || null : null, description: String(r[ix.desc] ?? '').trim() || String(r[ix.cat] ?? '').trim() || null, method: METHOD_MAP(r[ix.meth]), notes: String(r[ix.notes] ?? '').trim() || null });
      }
    }
  }
  // έξοδα που υπάρχουν ήδη (ίδια ημερομηνία, ποσό και περιγραφή/προμηθευτής) δεν ξαναμπαίνουν
  const expKey = (x) => [x.paid_on, Number(x.amount).toFixed(2), norm(x.description || ''), norm(x.supplier || '')].join('|');
  const haveExp = new Set(S.expenses.map(expKey));
  const allExp = expenses.length;
  for (let i = expenses.length - 1; i >= 0; i--) if (haveExp.has(expKey(expenses[i]))) expenses.splice(i, 1);
  if (!events.length && !allExp) { toastErr(L('Δεν βρέθηκαν δεδομένα', 'No data found'), L('Βεβαιωθείτε ότι το αρχείο έχει το φύλλο «Εκδηλώσεις» με τις στήλες Ημερομηνία, Τοποθεσία, Όνομα 1.', 'Make sure the file has the events sheet with Date, Location, Name 1 columns.')); return; }
  const fresh = events.filter((e) => !e.dup);
  const noPhone = fresh.filter((e) => !e.p1 && !e.p2).length;
  if (noPhone) warn.push(L(`${noPhone} εκδηλώσεις χωρίς τηλέφωνο`, `${noPhone} events without phone`));
  warn.push(L('Οι εκδηλώσεις θα μπουν χωρίς PDF προσφοράς και χωρίς ώρα αν δεν υπάρχει — θα τα δείτε στον «Έλεγχο δεδομένων».', 'Events are imported without an offer PDF and without time if missing — see “Data checks”.'));
  warn.push(L('Οι δόσεις μπαίνουν χωρίς ημερομηνία είσπραξης (δεν υπήρχε στο παλιό φύλλο). Μπορείτε να τη συμπληρώσετε στο Μητρώο.', 'Installments are imported without a receipt date (not in the old sheet). Fill it in the register.'));
  const body = `<div class="banner">${icon('sparkles')}<div><b>${esc(L(`Βρέθηκαν ${events.length} εκδηλώσεις και ${allExp} έξοδα`, `Found ${events.length} events and ${allExp} expenses`))}</b><span>${esc(L(`${events.length - fresh.length} εκδηλώσεις και ${allExp - expenses.length} έξοδα υπάρχουν ήδη και θα παραλειφθούν.`, `${events.length - fresh.length} events and ${allExp - expenses.length} expenses already exist and will be skipped.`))}</span></div></div>
    <ul class="small muted">${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
    <div class="xl-wrap" style="max-height:340px"><table class="xl"><thead><tr class="h">${[L('Ημερομηνία', 'Date'), L('Τοποθεσία', 'Location'), L('Ζευγάρι', 'Couple'), L('Πακέτο', 'Package'), L('Πληρωμές', 'Payments'), ''].map((x) => `<th class="gc-plain" style="top:0">${esc(x)}</th>`).join('')}</tr></thead><tbody>
    ${events.slice(0, 60).map((e) => `<tr class="${e.dup ? 'cancelled' : ''}"><td><div class="c">${esc(fmtDate(e.date))}</div></td><td><div class="c">${esc(e.loc)}</div></td><td><div class="c">${esc([e.n1, e.n2].filter(Boolean).join(' & ') || '—')}</div></td><td class="num"><div class="c">${esc(money(e.price))}</div></td><td class="num"><div class="c">${esc(money(e.pays.reduce((n, p) => n + p.amount, 0)))}</div></td><td><div class="c">${e.dup ? esc(L('υπάρχει', 'exists')) : ''}</div></td></tr>`).join('')}
    </tbody></table></div>`;
  const s = sheet({ title: L('Εισαγωγή από Google Sheet', 'Import from Google Sheet'), body, wide: true, foot: `<button class="btn" data-close>${esc(L('Ακύρωση', 'Cancel'))}</button><button class="btn primary" data-go ${!fresh.length && !expenses.length ? "disabled" : ""}>${icon('upload')} ${esc(L(`Εισαγωγή ${fresh.length} εκδηλώσεων & ${expenses.length} εξόδων`, `Import ${fresh.length} events & ${expenses.length} expenses`))}</button>` });
  s.root.querySelector('[data-go]').addEventListener('click', async (ev) => { const _btn = ev.currentTarget;
    busy(_btn, true, L('Εισαγωγή…', 'Importing…'));
    const old = new Date(Date.now() - 30 * 864e5).toISOString();
    try { await sb.rpc('set_restore_mode', { p_on: true }); } catch (e) { console.warn('restore mode', e); }
    try {
      const nEv = fresh.length, nExp = expenses.length;
      for (const e of fresh) {
        if (e.dup) continue;
        const { data: c, error: ce } = await sb.from('customers').insert({ name1: e.n1 || e.n2 || L('Πελάτης', 'Customer') + ' ' + (e.loc || fmtDate(e.date)), name2: e.n1 ? e.n2 || null : null, phone1: e.p1 || null, phone2: e.p2 || null, email1: e.e1 || null, email2: e.e2 || null, created_by: S.profile.id }).select().single();
        if (ce) throw ce;
        const { data: evr, error: ee } = await sb.from('events').insert({ customer_id: c.id, category: e.cat, event_date: e.date, event_time: e.time, church_location: e.loc || null, photo_status: e.photo, editing_status: e.edit, editing_pc: e.pc, video_notes: e.vnotes || null, created_at: old, created_by: S.profile.id }).select().single();
        if (ee) throw ee;
        const { error: fe } = await sb.from('event_finance').upsert({ event_id: evr.id, package_price: e.price, package_name: e.pname || null, second_crew: e.second, office_notes: e.office || null }, { onConflict: 'event_id' });
        if (fe) throw fe;
        e.dup = true; // αν σταματήσει στη μέση, μια νέα προσπάθεια δεν τη διπλασιάζει
        if (e.pays.length) { const { error: pe } = await sb.from('payments').insert(e.pays.map((p) => ({ event_id: evr.id, category: e.cat, kind: p.kind, label: p.label, amount: p.amount, paid_on: null, created_at: old }))); if (pe) throw pe; }
      }
      if (expenses.length) { await chunked('expenses', expenses); expenses.length = 0; }
      await sb.rpc('set_restore_mode', { p_on: false }); await sb.rpc('run_automations');
      await loadAll();
      s.close();
      toast(L('Η εισαγωγή ολοκληρώθηκε! 🎉', 'Import complete! 🎉'), { body: L(`${nEv} εκδηλώσεις, ${nExp} έξοδα.`, `${nEv} events, ${nExp} expenses.`) });
    } catch (e) { busy(_btn, false); try { await sb.rpc('set_restore_mode', { p_on: false }); } catch {} toastErr(L('Η εισαγωγή σταμάτησε', 'Import stopped'), friendlyError(e)); await loadAll(); }
  });
}
void lbl;
