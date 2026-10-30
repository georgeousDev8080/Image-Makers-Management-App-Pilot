// =====================================================================
//  Φύλλα (Excel): Κεντρικό, Πελάτες, Πληρωμές, Φωτογραφίες, Μητρώο,
//  Έξοδα, Σύνοψη, Dashboard, Έλεγχος δεδομένων, Mitsos
// =====================================================================
import { dutyEmoji, L, esc, icon, money, fmtDate, todayISO, daysBetween, sum, matches, lbl, CATEGORIES, PHOTO_STATUS, EDIT_STATUS, PCS, METHODS, RESOLUTIONS, EXPENSE_KINDS, SHOP_SUBS, OTHER_SUBS, MONTHS_EL_UP, monthName, monthShort, toast, confirmBox, actionSheet, segmented, initSegmented } from '../core.js';
import { S, isAdmin, isVideoAdmin, allEventViews, eventView, saveCustomer, patchCustomer, patchPayment, patchExpense, patchEvent, saveFinance, savePayment, deletePayment, saveExpense, deleteExpense, openOffer, yearsAvailable, profileName, profileById } from '../data.js';
import { pageHead, setTopActions } from '../layout.js';
import { renderGrid, exportGrid } from '../grid.js';
import { openIncomeForm, openExpenseForm, expenseTitle, paymentActions, expenseActions } from './money.js';
import { openCrewSheet, deleteEventFlow } from './events.js';
import { uploadPdfForEvent } from '../offer.js';
import { barPairs, hbars, bindTips } from '../charts.js';
import { apptSummaryHTML } from './appointments.js';

const TABS = () => [
  { v: 'main', t: L('Κεντρικό (όλα)', 'Main (all)') },
  { v: 'clients', t: L('Πελάτες & εκδηλώσεις', 'Clients & events') },
  { v: 'payments', t: L('Πληρωμές', 'Payments') },
  { v: 'photos', t: L('Φωτογραφίες & editing', 'Photos & editing') },
  { v: 'register', t: L('Μητρώο Εισπράξεων', 'Receipts register') },
  { v: 'expenses', t: L('Έξοδα', 'Expenses') },
  { v: 'summary', t: L('Σύνοψη', 'Summary') },
  { v: 'dashboard', t: 'Dashboard' },
  { v: 'checks', t: L('Έλεγχος δεδομένων', 'Data checks') },
];
const GROUPS = () => ({
  basic: { label: L('Βασικά στοιχεία', 'Basics'), cls: 'gc-basic' },
  couple: { label: L('Στοιχεία ζευγαριού', 'Couple'), cls: 'gc-couple' },
  cat: { label: L('Κατηγορία / Συνεργείο', 'Category / Crew'), cls: 'gc-cat' },
  fin: { label: L('Οικονομικά / Πληρωμές', 'Finances / Payments'), cls: 'gc-fin' },
  photo: { label: L('Φωτογραφίες & Editing', 'Photos & Editing'), cls: 'gc-photo' },
  money: { label: L('Οικονομική εικόνα', 'Financial picture'), cls: 'gc-money' },
  video: { label: L('Βίντεο / Μοντάζ', 'Video / Editing'), cls: 'gc-video' },
  plain: { label: '', cls: 'gc-plain' },
});
const PRESETS = {
  main: ['basic', 'couple', 'cat', 'fin', 'photo', 'money'],
  clients: ['basic', 'couple', 'cat'],
  payments: ['basic', 'fin', 'money'],
  photos: ['basic', 'photo'],
};

const st = { year: null, q: '', month: '', cat: '', unpaid: false, groups: null, mitsosFilter: 'all', showCancelled: false };

export function renderSheets(root, params = {}) {
  if (!isAdmin()) return;
  const tab = params.tab || 'main';
  if (params.unpaid) st.unpaid = true;
  const years = yearsAvailable();
  if (!st.year) {
    const cy = new Date().getFullYear();
    const counts = years.map((y) => [y, [...S.events.values()].filter((e) => e.event_date.startsWith(String(y))).length]);
    st.year = counts.find(([y]) => y === cy)?.[1] ? cy : (counts.filter(([, n]) => n).map(([y]) => y).find((y) => y >= cy) || cy);
  }
  const tabs = TABS();
  // Το Mitsos είναι ξεχωριστή σελίδα (μενού), χωρίς τις καρτέλες των υπόλοιπων φύλλων
  const cur = tab === 'mitsos' ? { v: 'mitsos', t: 'Mitsos' } : (tabs.find((t) => t.v === tab) || tabs[0]);
  const yearSel = `<select class="select" id="yr" style="min-height:36px;padding:6px 34px 6px 12px;width:auto;font-weight:650">${years.map((y) => `<option ${y === st.year ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
  setTopActions(yearSel);
  let html = pageHead(cur.v === 'mitsos' ? 'Mitsos · Editing βίντεο' : `${cur.t} ${st.year}`, { sub: '' });
  if (cur.v !== 'mitsos') html += `<div class="sheet-tabs" style="position:static;margin:-8px 0 12px">${tabs.map((t) => `<a href="#/sheets/${t.v}" class="${t.v === cur.v ? 'active' : ''} ${t.cls || ''}">${esc(t.t)}</a>`).join('')}</div>`;
  html += `<div id="sheetBody"></div>`;
  root.innerHTML = html;
  document.getElementById('yr')?.addEventListener('change', (e) => { st.year = Number(e.target.value); renderSheets(root, params); });
  const body = root.querySelector('#sheetBody');
  const fn = { main: eventsSheet, clients: eventsSheet, payments: eventsSheet, photos: eventsSheet, register: registerSheet, expenses: expensesSheet, summary: summarySheet, dashboard: dashboardSheet, checks: checksSheet, mitsos: mitsosSheet }[cur.v];
  fn(body, cur.v, () => renderSheets(root, params));
  // κράτα το ενεργό tab ορατό
  root.querySelector('.sheet-tabs a.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function toolbar({ search = true, months = true, cats = true, unpaid = false, extra = '', exportBtn = true } = {}) {
  const ms = [...Array(12).keys()];
  return `<div class="sheet-toolbar">
    ${search ? `<div class="search">${icon('search')}<input class="input" id="sq" type="search" placeholder="${esc(L('Αναζήτηση…', 'Search…'))}" value="${esc(st.q)}"></div>` : ''}
    ${months ? `<select class="select" id="sm" style="width:auto;min-height:40px"><option value="">${esc(L('Όλοι οι μήνες', 'All months'))}</option>${ms.map((m) => `<option value="${String(m + 1).padStart(2, '0')}" ${st.month === String(m + 1).padStart(2, '0') ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select>` : ''}
    ${cats ? `<select class="select" id="sc" style="width:auto;min-height:40px"><option value="">${esc(L('Όλες οι κατηγορίες', 'All categories'))}</option>${CATEGORIES.map((c) => `<option value="${c.v}" ${st.cat === c.v ? 'selected' : ''}>${esc(L(c.el, c.en))}</option>`).join('')}</select>` : ''}
    ${unpaid ? `<button class="chip ${st.unpaid ? 'on' : ''}" id="su">${icon('euro')} ${esc(L('Μόνο ανεξόφλητα', 'Unpaid only'))}</button>` : ''}
    ${extra}
    <span style="flex:1"></span>
    ${exportBtn ? `<button class="btn small" id="sx">${icon('download')} Excel</button>` : ''}
  </div>`;
}
function bindToolbar(body, redraw) {
  const sq = body.querySelector('#sq');
  sq?.addEventListener('input', () => { st.q = sq.value; const p = sq.selectionStart; redraw(); const n = document.getElementById('sq'); n?.focus(); n?.setSelectionRange(p, p); });
  body.querySelector('#sm')?.addEventListener('change', (e) => { st.month = e.target.value; redraw(); });
  body.querySelector('#sc')?.addEventListener('change', (e) => { st.cat = e.target.value; redraw(); });
  body.querySelector('#su')?.addEventListener('click', () => { st.unpaid = !st.unpaid; redraw(); });
}

const monthUp = (iso) => (iso ? MONTHS_EL_UP[Number(iso.slice(5, 7)) - 1] : '');
const yesNo = [{ v: 'true', el: 'Ναι', en: 'Yes' }, { v: 'false', el: 'Όχι', en: 'No' }];

// ---------------------------------------------------------------------
//  Κεντρικό φύλλο εκδηλώσεων (και οι μικρότερες εκδοχές του)
// ---------------------------------------------------------------------
function eventsSheet(body, tab, redraw) {
  const G = GROUPS();
  const visible = new Set(tab === 'main' ? (st.groups || PRESETS.main) : PRESETS[tab]);
  let views = allEventViews({ year: st.year }).filter((v) => st.showCancelled || v.e.status !== 'cancelled');
  views = views.filter((v) => (!st.month || v.e.event_date.slice(5, 7) === st.month) && (!st.cat || v.e.category === st.cat) && (!st.unpaid || !v.fullyPaid)
    && matches(st.q, v.title, v.c?.phone1, v.c?.phone2, v.c?.email1, v.c?.email2, v.e.church_location, v.f.package_name, fmtDate(v.e.event_date), v.f.office_notes));
  const maxPays = Math.max(4, ...views.map((v) => v.pays.filter((p) => p.amount > 0).length - 1));

  const updCust = async (v, field, val) => { if (!v.c) return; if (field === 'name1' && !val) throw new Error('required'); await patchCustomer(v.c.id, { [field]: val || null }); };
  const cols = [];
  const add = (g, c) => { if (visible.has(g)) cols.push({ group: g, ...c }); };
  add('basic', { key: 'month', label: L('Μήνας', 'Month'), w: 104, get: (v) => monthUp(v.e.event_date) });
  add('basic', { key: 'date', label: L('Ημερομηνία', 'Date'), w: 96, type: 'date', editable: true, required: true, get: (v) => v.e.event_date, set: (v, val) => val && patchEvent(v.e.id, { event_date: val }) });
  add('basic', { key: 'loc', label: L('Τοποθεσία', 'Location'), w: 210, editable: true, get: (v) => v.e.church_location, set: (v, val) => patchEvent(v.e.id, { church_location: val }) });
  add('couple', { key: 'name1', label: L('Όνομα 1', 'Name 1'), w: 160, editable: (v) => !!v.c, get: (v) => v.c?.name1, set: (v, val) => updCust(v, 'name1', val) });
  add('couple', { key: 'name2', label: L('Όνομα 2', 'Name 2'), w: 160, editable: (v) => !!v.c, get: (v) => v.c?.name2, set: (v, val) => updCust(v, 'name2', val) });
  add('couple', { key: 'phone1', label: L('Τηλ. 1', 'Phone 1'), w: 112, editable: (v) => !!v.c, get: (v) => v.c?.phone1, set: (v, val) => updCust(v, 'phone1', val) });
  add('couple', { key: 'phone2', label: L('Τηλ. 2', 'Phone 2'), w: 112, editable: (v) => !!v.c, get: (v) => v.c?.phone2, set: (v, val) => updCust(v, 'phone2', val) });
  add('couple', { key: 'email1', label: 'Email 1', w: 190, editable: (v) => !!v.c, get: (v) => v.c?.email1, set: (v, val) => updCust(v, 'email1', val) });
  add('couple', { key: 'email2', label: 'Email 2', w: 170, editable: (v) => !!v.c, get: (v) => v.c?.email2, set: (v, val) => updCust(v, 'email2', val) });
  add('cat', { key: 'cat', label: L('Κατηγορία Εκδήλωσης', 'Event category'), w: 130, type: 'select', blank: false, options: CATEGORIES, editable: true, get: (v) => v.e.category, set: (v, val) => patchEvent(v.e.id, { category: val }) });
  add('cat', { key: 'pdf', label: 'PDF', w: 62, align: 'center', get: (v) => (v.e.offer_path ? 'PDF' : ''), display: (v) => v.e.offer_path ? `<button class="pdf-btn" data-pdf="${v.e.id}" title="${esc(L('Άνοιγμα προσφοράς', 'Open offer'))}">${icon('doc')}PDF</button>` : `<button class="pdf-btn" data-upl="${v.e.id}" style="color:var(--label-3)" title="${esc(L('Ανέβασμα PDF', 'Upload PDF'))}">${icon('upload')}</button>` });
  add('cat', { key: 'second', label: L('Δεύτερο Συνεργείο', 'Second crew'), w: 92, type: 'select', blank: false, options: yesNo, editable: true, get: (v) => (v.f.second_crew ? 'true' : 'false'), set: (v, val) => saveFinance(v.e.id, { second_crew: val === 'true' }) });
  add('cat', { key: 'crew', label: L('Συνεργείο', 'Crew'), w: 170, editable: true, onOpen: (v) => openCrewSheet(v.e.id), get: (v) => v.crew.map((c) => profileName(c.profile)).join(', '), display: (v) => v.crew.length ? esc(v.crew.map((c) => profileName(c.profile).split(' ')[0] + (' ' + dutyEmoji(c.duty))).join(', ')) : `<span class="muted">+ ${esc(L('ανάθεση', 'assign'))}</span>` });
  add('cat', { key: 'res', label: L('Ανάλυση', 'Resolution'), w: 92, type: 'select', options: RESOLUTIONS, editable: true, get: (v) => v.e.resolution, set: (v, val) => patchEvent(v.e.id, { resolution: val }) });
  add('fin', { key: 'price', label: L('Πακέτο (€)', 'Package (€)'), w: 104, type: 'money', editable: true, sum: true, get: (v) => v.price, set: (v, val) => { if (val != null && val < 0) throw new Error('negative'); return saveFinance(v.e.id, { package_price: val }); } });
  add('fin', { key: 'pname', label: L('Όνομα Πακέτου', 'Package name'), w: 220, editable: true, get: (v) => v.f.package_name, set: (v, val) => saveFinance(v.e.id, { package_name: val }) });
  if (visible.has('fin')) {
    const payCol = (i) => ({
      group: 'fin', key: 'pay' + i, label: i === 0 ? L('Προκαταβολή', 'Deposit') : L(`${i}η Δόση`, `Installment ${i}`), w: 104, type: 'money', sum: (v) => v.pays.filter((p) => p.amount > 0)[i]?.amount || 0,
      editable: true, get: (v) => v.pays.filter((p) => p.amount > 0)[i]?.amount ?? null,
      onOpen: (v) => { const p = v.pays.filter((x) => x.amount > 0)[i]; if (p) paymentActions(p); else openIncomeForm({ eventId: v.e.id, lock: true }); },
      display: (v) => { const p = v.pays.filter((x) => x.amount > 0)[i]; return p ? `<div class="pay-cell"><span>${esc(money(p.amount))}</span><small>${esc(fmtDate(p.paid_on))}</small></div>` : '<span class="ph"></span>'; },
      exportValue: (v) => v.pays.filter((p) => p.amount > 0)[i]?.amount ?? '',
    });
    for (let i = 0; i <= maxPays; i++) cols.push(payCol(i));
    cols.push({ group: 'fin', key: 'addpay', label: L('Νέα δόση', 'New installment'), w: 104, align: 'center', get: () => '', display: (v) => `<button class="add-pay" data-addpay="${v.e.id}">${icon('plus')} ${esc(L('Δόση', 'Pay'))}</button>`, exportValue: () => '' });
    cols.push({ group: 'fin', key: 'paidok', label: L('Εξόφληση OK', 'Paid OK'), w: 92, align: 'center', get: (v) => (v.fullyPaid ? L('Ναι', 'Yes') : L('Όχι', 'No')), display: (v) => v.price == null ? '<span class="muted">—</span>' : v.fullyPaid ? `<span class="pill green">✓ ${esc(L('Ναι', 'Yes'))}</span>` : esc(L('Όχι', 'No')) });
  }
  add('photo', { key: 'pst', label: L('Κατάσταση Φωτογραφίες', 'Photos status'), w: 220, type: 'select', blank: false, options: PHOTO_STATUS, editable: true, get: (v) => v.e.photo_status, set: async (v, val) => { const before = v.e.editing_status; const u = await patchEvent(v.e.id, { photo_status: val }); if (u.editing_status !== before) toast(L('Το editing έγινε «Να γίνει» αυτόματα', 'Editing auto-set to “To do”'), { type: 'info' }); } });
  add('photo', { key: 'est', label: L('Κατάσταση Editing', 'Editing status'), w: 130, type: 'select', blank: false, options: EDIT_STATUS, editable: true, get: (v) => v.e.editing_status, set: (v, val) => patchEvent(v.e.id, { editing_status: val }) });
  add('photo', { key: 'pc', label: L('Υπολογιστής μοντάζ', 'Editing computer'), w: 120, type: 'select', options: PCS, editable: true, get: (v) => v.e.editing_pc, set: (v, val) => patchEvent(v.e.id, { editing_pc: val }) });
  add('photo', { key: 'vnotes', label: L('Σχόλια Βίντεο', 'Video notes'), w: 220, editable: true, get: (v) => v.e.video_notes, set: (v, val) => patchEvent(v.e.id, { video_notes: val }) });
  add('money', { key: 'paid', label: L('Σύνολο Εισπράξεων', 'Total collected'), w: 112, type: 'money', sum: true, get: (v) => v.paid });
  add('money', { key: 'bal', label: L('Υπόλοιπο προς Είσπραξη', 'Balance due'), w: 112, type: 'money', sum: (v) => Math.max(0, v.balance || 0), get: (v) => v.balance, cls: (v) => (v.balance > 0 && v.e.event_date < todayISO() ? 'neg' : '') });
  add('money', { key: 'office', label: L('Σημειώσεις Γραφείου', 'Office notes'), w: 220, editable: true, get: (v) => v.f.office_notes, set: (v, val) => saveFinance(v.e.id, { office_notes: val }) });
  add('money', { key: 'enotes', label: L('Σημειώσεις εκδήλωσης', 'Event notes'), w: 220, editable: true, get: (v) => v.e.notes, set: (v, val) => patchEvent(v.e.id, { notes: val }) });
  // οριστική διαγραφή από το φύλλο (με τους ίδιους ελέγχους ασφαλείας όπως στην καρτέλα της εκδήλωσης)
  cols.push({ group: cols.length ? cols[cols.length - 1].group : 'basic', key: 'del', label: L('Διαγραφή', 'Delete'), w: 84, align: 'center', get: () => '', exportValue: () => '', display: (v) => `<button class="del-btn" data-delev="${v.e.id}" title="${esc(L('Οριστική διαγραφή εκδήλωσης', 'Delete event permanently'))}">${icon('trash')}</button>` });
  if (cols.length) cols[0].sticky = true;
  // ημερομηνία πρώτη & σταθερή στο κινητό
  const di = cols.findIndex((c) => c.key === 'date');
  if (di > 0) { const [d] = cols.splice(di, 1); cols.unshift(d); cols.forEach((c, i) => { c.sticky = i === 0; }); }
  // αντιγραφή group στην πρώτη (για ομαδοποίηση)
  if (cols[0]) cols[0].group = cols[1]?.group === 'basic' ? 'basic' : cols[0].group;

  const toggles = tab === 'main' ? `<div class="chips col-toggles scroll" style="margin-bottom:10px">${PRESETS.main.map((g) => `<button class="chip ${visible.has(g) ? 'on' : ''}" data-g="${g}"><i style="--g:${{ basic: '#3e4651', couple: '#3e4651', cat: '#2b5797', fin: '#7a1712', photo: '#2b5797', money: '#3f7a2b' }[g]}"></i>${esc(G[g].label)}</button>`).join('')}</div>` : '';
  body.innerHTML = toolbar({ unpaid: true, extra: `<button class="chip ${st.showCancelled ? 'on' : ''}" id="scx">${esc(L('Με ακυρωμένες', 'Include cancelled'))}</button><a class="btn small primary" href="#/new-event">${icon('plus')} ${esc(L('Εκδήλωση', 'Event'))}</a>` }) + toggles + '<div id="grid"></div>' +
    `<div class="legend"><span><i style="background:var(--row-paid)"></i>${esc(L('Πλήρως εξοφλημένη (οι πληρωμές έφτασαν την αξία πακέτου)', 'Fully paid (payments reached package value)'))}</span><span>${esc(L('Διπλό κλικ ή Enter για επεξεργασία κελιού · στο κινητό ένα πάτημα', 'Double-click or Enter to edit a cell · tap on mobile'))}</span></div>`;
  bindToolbar(body, redraw);
  body.querySelector('#scx')?.addEventListener('click', () => { st.showCancelled = !st.showCancelled; redraw(); });
  body.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
    const set = new Set(st.groups || PRESETS.main);
    if (set.has(b.dataset.g)) { if (set.size > 1) set.delete(b.dataset.g); } else set.add(b.dataset.g);
    st.groups = PRESETS.main.filter((g) => set.has(g)); redraw();
  }));
  renderGrid(body.querySelector('#grid'), cols, {
    id: 'ev-' + tab, rows: views, rowKey: (v) => v.e.id, groups: G,
    rowClass: (v) => [v.fullyPaid ? 'paid' : '', v.e.status === 'cancelled' ? 'cancelled' : ''].join(' '),
    onEdit: async (v, c, val) => { await c.set(v, val); },
    empty: L('Δεν υπάρχουν εκδηλώσεις για αυτά τα φίλτρα.', 'No events for these filters.'),
  });
  body.querySelectorAll('[data-pdf]').forEach((b) => b.addEventListener('click', () => openOffer(S.events.get(b.dataset.pdf).offer_path)));
  body.querySelectorAll('[data-upl]').forEach((b) => b.addEventListener('click', () => uploadPdfForEvent(b.dataset.upl)));
  body.querySelectorAll('[data-addpay]').forEach((b) => b.addEventListener('click', () => openIncomeForm({ eventId: b.dataset.addpay, lock: true })));
  body.querySelectorAll('[data-delev]').forEach((b) => b.addEventListener('click', () => deleteEventFlow(b.dataset.delev)));
  body.querySelector('#sx')?.addEventListener('click', () => exportGrid(`${TABS().find((t) => t.v === tab).t} ${st.year}`, cols.filter((c) => !['addpay', 'del'].includes(c.key)), views));
  // διπλό κλικ στη 1η στήλη → άνοιγμα εκδήλωσης (κινητό: παρατεταμένο πάτημα)
  body.querySelectorAll('tbody tr[data-rk] td.sticky').forEach((td) => td.addEventListener('contextmenu', (e) => { e.preventDefault(); location.hash = '#/event/' + td.parentElement.dataset.rk; }));
}

// ---------------------------------------------------------------------
//  Mitsos (μόνο Διαχειριστής Βιντεογράφος)
// ---------------------------------------------------------------------
const isSOS = (e) => ['lab', 'ready', 'delivered'].includes(e.photo_status) && e.editing_status !== 'done' && e.status !== 'cancelled';
function mitsosSheet(body, tab, redraw) {
  if (!isVideoAdmin()) { body.innerHTML = `<div class="empty">${icon('lock')}<b>${esc(L('Μόνο για Διαχειριστή (Βιντεογράφο)', 'Admin (Videographer) only'))}</b></div>`; return; }
  let views = allEventViews({ year: st.year, includeCancelled: false });
  const counts = { open: views.filter((v) => v.e.editing_status !== 'done' && v.e.editing_status !== 'none').length, sos: views.filter((v) => isSOS(v.e)).length };
  views = views.filter((v) => (st.mitsosFilter === 'all' || (st.mitsosFilter === 'sos' ? isSOS(v.e) : st.mitsosFilter === 'open' ? (v.e.editing_status !== 'done') : true))
    && matches(st.q, v.title, v.e.church_location, fmtDate(v.e.event_date), v.e.video_notes));
  views.sort((a, b) => (isSOS(b.e) - isSOS(a.e)) || a.e.event_date.localeCompare(b.e.event_date));
  const cols = [
    { key: 'date', label: L('Ημερομηνία', 'Date'), w: 96, type: 'date', sticky: true, group: 'basic', get: (v) => v.e.event_date },
    { key: 'sos', label: 'SOS', w: 64, align: 'center', group: 'basic', get: (v) => (isSOS(v.e) ? 'SOS' : ''), display: (v) => (isSOS(v.e) ? '<span class="sos-tag">SOS</span>' : '') },
    { key: 'couple', label: L('Ζευγάρι', 'Couple'), w: 200, group: 'basic', get: (v) => v.title, display: (v) => `<a href="#/event/${v.e.id}">${esc(v.title)}</a>` },
    { key: 'loc', label: L('Τοποθεσία', 'Location'), w: 190, group: 'basic', get: (v) => v.e.church_location },
    { key: 'res', label: L('Ανάλυση', 'Resolution'), w: 90, type: 'select', options: RESOLUTIONS, group: 'video', editable: true, get: (v) => v.e.resolution, set: (v, val) => patchEvent(v.e.id, { resolution: val }) },
    { key: 'pst', label: L('Φωτογραφίες', 'Photos'), w: 210, type: 'select', options: PHOTO_STATUS, group: 'video', get: (v) => v.e.photo_status },
    { key: 'est', label: L('Κατάσταση Editing', 'Editing status'), w: 140, type: 'select', blank: false, options: EDIT_STATUS, group: 'video', editable: true, get: (v) => v.e.editing_status, set: (v, val) => patchEvent(v.e.id, { editing_status: val }) },
    { key: 'pc', label: L('Υπολογιστής μοντάζ', 'Editing computer'), w: 130, type: 'select', options: PCS, group: 'video', editable: true, get: (v) => v.e.editing_pc, set: (v, val) => patchEvent(v.e.id, { editing_pc: val }) },
    { key: 'vn', label: L('Σχόλια βίντεο', 'Video notes'), w: 260, group: 'video', editable: true, get: (v) => v.e.video_notes, set: (v, val) => patchEvent(v.e.id, { video_notes: val }) },
  ];
  body.innerHTML = `<div class="banner">${icon('film')}<div><b>${esc(L('Πώς δουλεύει το Mitsos', 'How Mitsos works'))}</b><span>${esc(L('Όταν οι φωτογραφίες γίνουν «Αλλαγές», το editing γίνεται αυτόματα «Να γίνει». Όταν το album πάει «Εκτύπωση στο εργαστήριο», η γραμμή γίνεται κόκκινη SOS μέχρι να ολοκληρωθεί το editing.', 'When photos become “Changes”, editing becomes “To do”. When the album goes to the lab, the row turns red SOS until editing is done.'))}</span></div></div>`
    + toolbar({ months: false, cats: false, extra: segmented('mf', [{ v: 'all', label: L('Όλα', 'All') }, { v: 'open', label: L(`Εκκρεμή`, 'Pending') }, { v: 'sos', label: `SOS (${counts.sos})` }], st.mitsosFilter) }) + '<div id="grid"></div>';
  bindToolbar(body, redraw);
  initSegmented(body, (_, v) => { st.mitsosFilter = v; redraw(); });
  renderGrid(body.querySelector('#grid'), cols, { id: 'mitsos', rows: views, rowKey: (v) => v.e.id, groups: GROUPS(), rowClass: (v) => (isSOS(v.e) ? 'sos' : v.e.editing_status === 'done' ? 'paid' : ''), onEdit: (v, c, val) => c.set(v, val), empty: L('Δεν υπάρχουν εκκρεμότητες 🎉', 'Nothing pending 🎉') });
  body.querySelector('#sx').addEventListener('click', () => exportGrid(`Mitsos ${st.year}`, cols, views));
}

// ---------------------------------------------------------------------
//  Μητρώο Εισπράξεων
// ---------------------------------------------------------------------
function registerSheet(body, tab, redraw) {
  const y = String(st.year);
  let rows = S.payments.map((p) => ({ p, v: p.event_id ? eventView(p.event_id) : null }))
    .filter(({ p, v }) => (v ? v.e.event_date.startsWith(y) : (p.paid_on || '').startsWith(y)));
  rows = rows.filter(({ p, v }) => (!st.month || (v ? v.e.event_date.slice(5, 7) : (p.paid_on || '').slice(5, 7)) === st.month) && (!st.cat || p.category === st.cat)
    && matches(st.q, v?.title, v?.e.church_location, p.label, p.notes, p.description, fmtDate(p.paid_on)));
  rows.sort((a, b) => ((a.v?.e.event_date || a.p.paid_on || '').localeCompare(b.v?.e.event_date || b.p.paid_on || '')) || (a.p.paid_on || '').localeCompare(b.p.paid_on || ''));
  const cols = [
    { key: 'edate', label: L('Ημερομηνία Εκδήλωσης', 'Event date'), w: 100, type: 'date', sticky: true, get: (r) => r.v?.e.event_date },
    { key: 'emonth', label: L('Μήνας Εκδήλωσης', 'Event month'), w: 110, get: (r) => monthUp(r.v?.e.event_date) },
    { key: 'loc', label: L('Τοποθεσία', 'Location'), w: 200, get: (r) => r.v?.e.church_location || '' },
    { key: 'client', label: L('Πελάτης / Λεπτομέρειες', 'Client / Details'), w: 220, get: (r) => r.v ? r.v.title : r.p.description, display: (r) => r.v ? `<a href="#/event/${r.v.e.id}">${esc(r.v.title)}</a>` : esc(r.p.description || '') },
    { key: 'cat', label: L('Κατηγορία', 'Category'), w: 120, type: 'select', options: CATEGORIES, get: (r) => r.p.category },
    { key: 'label', label: L('Τύπος Πληρωμής', 'Payment type'), w: 120, editable: true, get: (r) => r.p.label, set: (r, val) => patchPayment(r.p.id, { label: val }) },
    { key: 'amount', label: L('Ποσό', 'Amount'), w: 104, type: 'money', editable: true, required: true, sum: true, get: (r) => r.p.amount, set: (r, val) => { if (!val) throw new Error('amount'); return patchPayment(r.p.id, { amount: val }); } },
    { key: 'paid_on', label: L('Ημερομηνία Είσπραξης', 'Date received'), w: 100, type: 'date', editable: true, get: (r) => r.p.paid_on, set: (r, val) => patchPayment(r.p.id, { paid_on: val }) },
    { key: 'method', label: L('Τρόπος Πληρωμής', 'Payment method'), w: 140, type: 'select', options: METHODS, editable: true, get: (r) => r.p.method, set: (r, val) => patchPayment(r.p.id, { method: val }) },
    { key: 'notes', label: L('Σημειώσεις', 'Notes'), w: 240, editable: true, get: (r) => r.p.notes, set: (r, val) => patchPayment(r.p.id, { notes: val }) },
    { key: 'act', label: '', w: 56, align: 'center', get: () => '', display: (r) => `<button class="pdf-btn" data-pact="${r.p.id}" style="color:var(--label-2)" aria-label="${esc(L('Ενέργειες', 'Actions'))}">${icon('more')}</button>`, exportValue: () => '' },
  ];
  body.innerHTML = `<div class="banner">${icon('sparkles')}<div><b>${esc(L('Ενημερώνεται αυτόματα', 'Updates automatically'))}</b><span>${esc(L('Κάθε έσοδο από το «Έσοδα & Έξοδα» ή από το κουμπί «+ Δόση» μπαίνει εδώ μόνο του.', 'Every income from “Income & Expenses” or the “+ Pay” button appears here by itself.'))}</span></div></div>`
    + toolbar({ extra: `<button class="btn small primary" id="newin">${icon('plus')} ${esc(L('Έσοδο', 'Income'))}</button>` }) + '<div id="grid"></div>';
  bindToolbar(body, redraw);
  renderGrid(body.querySelector('#grid'), cols, { id: 'register', rows, rowKey: (r) => r.p.id, onEdit: (r, c, val) => c.set(r, val), empty: L('Καμία είσπραξη για αυτά τα φίλτρα.', 'No receipts for these filters.') });
  body.querySelector('#newin').addEventListener('click', () => openIncomeForm({}));
  body.querySelectorAll('[data-pact]').forEach((b) => b.addEventListener('click', () => paymentActions(S.payments.find((p) => p.id === b.dataset.pact))));
  body.querySelector('#sx').addEventListener('click', () => exportGrid(`Μητρώο Εισπράξεων ${st.year}`, cols.filter((c) => c.key !== 'act'), rows));
}

// ---------------------------------------------------------------------
//  Έξοδα
// ---------------------------------------------------------------------
const kindOptions = () => [...EXPENSE_KINDS];
function expensesSheet(body, tab, redraw) {
  const y = String(st.year);
  let rows = S.expenses.filter((x) => (x.paid_on || '').startsWith(y));
  rows = rows.filter((x) => (!st.month || x.paid_on.slice(5, 7) === st.month) && (!st.cat || x.kind === st.cat) && matches(st.q, expenseTitle(x), x.supplier, x.description, x.notes, x.crew_name));
  rows.sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.created_at.localeCompare(b.created_at));
  const cols = [
    { key: 'date', label: L('Ημερομηνία', 'Date'), w: 100, type: 'date', sticky: true, editable: true, required: true, get: (x) => x.paid_on, set: (x, v) => v && patchExpense(x.id, { paid_on: v }) },
    { key: 'month', label: L('Μήνας', 'Month'), w: 110, get: (x) => monthUp(x.paid_on) },
    { key: 'kind', label: L('Κατηγορία Εξόδου', 'Expense category'), w: 220, get: (x) => expenseTitle(x) },
    { key: 'sup', label: L('Πληρώθηκε σε / Προμηθευτής', 'Paid to / Supplier'), w: 190, editable: (x) => !x.crew_id, get: (x) => x.supplier || x.crew_name || profileName(profileById(x.crew_id)) || '', set: (x, v) => patchExpense(x.id, { supplier: v }) },
    { key: 'desc', label: L('Περιγραφή', 'Description'), w: 220, editable: true, get: (x) => x.description || (x.kind === 'payroll' && x.for_month ? L(`Μισθός ${monthName(Number(x.for_month.slice(5, 7)) - 1)}`, `Salary ${monthName(Number(x.for_month.slice(5, 7)) - 1)}`) : x.kind === 'daily_wage' && x.paid_until ? L(`Πληρωμένος έως ${fmtDate(x.paid_until)}`, `Paid until ${fmtDate(x.paid_until)}`) : ''), set: (x, v) => patchExpense(x.id, { description: v }) },
    { key: 'amount', label: L('Ποσό', 'Amount'), w: 104, type: 'money', editable: true, required: true, sum: true, get: (x) => x.amount, set: (x, v) => { if (!v) throw new Error('amount'); return patchExpense(x.id, { amount: v }); } },
    { key: 'method', label: L('Τρόπος Πληρωμής', 'Payment method'), w: 140, type: 'select', options: METHODS, editable: true, get: (x) => x.method, set: (x, v) => patchExpense(x.id, { method: v }) },
    { key: 'notes', label: L('Σημειώσεις', 'Notes'), w: 240, editable: true, get: (x) => x.notes, set: (x, v) => patchExpense(x.id, { notes: v }) },
    { key: 'act', label: '', w: 56, align: 'center', get: () => '', display: (x) => `<button class="pdf-btn" data-xact="${x.id}" style="color:var(--label-2)">${icon('more')}</button>`, exportValue: () => '' },
  ];
  body.innerHTML = toolbar({ cats: false, extra: `<select class="select" id="sk" style="width:auto;min-height:40px"><option value="">${esc(L('Όλοι οι τύποι', 'All types'))}</option>${kindOptions().map((k) => `<option value="${k.v}" ${st.cat === k.v ? 'selected' : ''}>${esc(L(k.el, k.en))}</option>`).join('')}</select><button class="btn small primary" id="newx">${icon('plus')} ${esc(L('Έξοδο', 'Expense'))}</button>` }) + '<div id="grid"></div>';
  bindToolbar(body, redraw);
  body.querySelector('#sk').addEventListener('change', (e) => { st.cat = e.target.value; redraw(); });
  renderGrid(body.querySelector('#grid'), cols, { id: 'expenses', rows, rowKey: (x) => x.id, onEdit: (x, c, v) => c.set(x, v), empty: L('Κανένα έξοδο για αυτά τα φίλτρα.', 'No expenses for these filters.') });
  body.querySelector('#newx').addEventListener('click', () => openExpenseForm({}));
  body.querySelectorAll('[data-xact]').forEach((b) => b.addEventListener('click', () => expenseActions(S.expenses.find((x) => x.id === b.dataset.xact))));
  body.querySelector('#sx').addEventListener('click', () => exportGrid(`Έξοδα ${st.year}`, cols.filter((c) => c.key !== 'act'), rows));
}

// ---------------------------------------------------------------------
//  Σύνοψη & Dashboard
// ---------------------------------------------------------------------
function yearStats() {
  const y = String(st.year);
  const views = allEventViews({ year: y, includeCancelled: false });
  const pays = S.payments.filter((p) => (p.paid_on || '').startsWith(y));
  const exps = S.expenses.filter((x) => (x.paid_on || '').startsWith(y));
  const byCat = CATEGORIES.map((c) => {
    const vs = views.filter((v) => v.e.category === c.v);
    return { c, n: vs.length, value: sum(vs, (v) => v.price || 0), paid: sum(vs, (v) => v.paid), bal: sum(vs, (v) => Math.max(0, v.balance || 0)) };
  });
  const months = [...Array(12).keys()].map((m) => {
    const mm = String(m + 1).padStart(2, '0');
    const vs = views.filter((v) => v.e.event_date.slice(5, 7) === mm);
    const inByEvent = sum(vs, (v) => v.paid);
    const cashIn = sum(pays.filter((p) => p.paid_on.slice(5, 7) === mm), (p) => p.amount);
    const out = sum(exps.filter((x) => x.paid_on.slice(5, 7) === mm), (x) => x.amount);
    return { m, n: vs.length, value: sum(vs, (v) => v.price || 0), inByEvent, cashIn, out };
  });
  const expKinds = {};
  exps.forEach((x) => { const k = x.kind === 'shop' ? 'shop:' + (x.subcategory || '') : x.kind === 'other' ? 'other:' + (x.subcategory || 'misc') : x.kind; (expKinds[k] ||= { label: expenseTitle({ ...x, crew_id: null, crew_name: null }), n: 0, v: 0 }); expKinds[k].n++; expKinds[k].v += Number(x.amount); });
  const value = sum(views, (v) => v.price || 0), collected = sum(pays, (p) => p.amount), spent = sum(exps, (x) => x.amount);
  const evPaid = sum(views, (v) => v.paid);
  return { views, pays, exps, byCat, months, expKinds: Object.values(expKinds).sort((a, b) => b.v - a.v), value, collected, spent, evPaid, open: sum(views, (v) => Math.max(0, v.balance || 0)), noPrice: views.filter((v) => v.price == null).length };
}

function summarySheet(body) {
  const s = yearStats();
  const tbl = (head, rows, foot) => `<div class="xl-wrap" style="max-height:none;min-height:0"><table class="xl"><thead><tr class="h">${head.map((h, i) => `<th class="gc-plain" style="top:0;text-align:${i ? 'right' : 'left'}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'num' : ''}"><div class="c" style="--w:${i ? 120 : 260}px">${c}</div></td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${i ? 'num' : ''}"><div class="c" style="--w:${i ? 120 : 260}px">${c}</div></td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
  const m = (v) => esc(money(v));
  body.innerHTML = `<div class="grid cols-2">
    <div><div class="group-label" style="margin-top:0">${esc(L('Δείκτες', 'Indicators'))}</div>${tbl([L('Δείκτης', 'Indicator'), L('Τιμή', 'Value')], [
      [esc(L('Σύνολο εκδηλώσεων', 'Total events')), s.views.length],
      [esc(L('Συνολική αξία πακέτων (καταχωρημένη)', 'Total package value (recorded)')), m(s.value)],
      [esc(L('Εισπράξεις εκδηλώσεων του έτους', 'Collected for this year’s events')), m(s.evPaid)],
      [esc(L('Πραγματικά εισπραχθέντα μέσα στο έτος', 'Actually collected during the year')), m(s.collected)],
      [esc(L('Ανοιχτό υπόλοιπο', 'Open balance')), m(s.open)],
      [esc(L('Σύνολο εξόδων', 'Total expenses')), m(s.spent)],
      [esc(L('Καθαρή ταμειακή διαφορά', 'Net cash difference')), `<b>${m(s.collected - s.spent)}</b>`],
      [esc(L('Εκδηλώσεις χωρίς τιμή πακέτου', 'Events without package price')), s.noPrice],
      [esc(L('Ποσοστό εξόφλησης', 'Collection rate')), s.value ? Math.round((s.evPaid / s.value) * 100) + '%' : '—'],
    ])}</div>
    <div><div class="group-label" style="margin-top:0">${esc(L('Ανά κατηγορία', 'By category'))}</div>${tbl([L('Κατηγορία', 'Category'), L('Πλήθος', 'Count'), L('Αξία Πακέτων', 'Package value'), L('Εισπραχθέντα', 'Collected'), L('Υπόλοιπο', 'Balance')],
      s.byCat.map((r) => [`<span class="cat-dot cat-${r.c.v}"></span> ${esc(L(r.c.el, r.c.en))}`, r.n, m(r.value), m(r.paid), m(r.bal)]),
      [esc(L('Σύνολο', 'Total')), s.views.length, m(s.value), m(s.evPaid), m(s.open)])}</div>
  </div>
  <div class="group-label">${esc(L('Ανά μήνα', 'By month'))}</div>${tbl([L('Μήνας', 'Month'), L('Εκδηλώσεις', 'Events'), L('Αξία Πακέτων', 'Package value'), L('Εισπράξεις (ανά μήνα εκδήλωσης)', 'Collected (by event month)'), L('Εισπράξεις (ταμειακά)', 'Collected (cash)'), L('Έξοδα', 'Expenses'), L('Ταμειακή Διαφορά', 'Cash difference')],
      s.months.map((r) => [esc(MONTHS_EL_UP[r.m]), r.n, m(r.value), m(r.inByEvent), m(r.cashIn), m(r.out), `<span class="${r.cashIn - r.out < 0 ? 'neg' : ''}">${m(r.cashIn - r.out)}</span>`]),
      [esc(L('Σύνολο', 'Total')), s.views.length, m(s.value), m(s.evPaid), m(s.collected), m(s.spent), m(s.collected - s.spent)])}
  <div class="group-label">${esc(L('Έξοδα ανά κατηγορία', 'Expenses by category'))}</div>${tbl([L('Κατηγορία Εξόδου', 'Expense category'), L('Πλήθος', 'Count'), L('Ποσό', 'Amount')], s.expKinds.map((r) => [esc(r.label), r.n, m(r.v)]), [esc(L('Σύνολο', 'Total')), s.exps.length, m(s.spent)])}`;
}

function dashboardSheet(body) {
  const s = yearStats();
  const m0 = (v) => money(v, { dec: 0 });
  body.innerHTML = `<div class="grid cols-4">
      <div class="kpi accent"><div class="k-label">${esc(L('Εκδηλώσεις', 'Events'))}</div><div class="k-value">${s.views.length}</div><div class="k-sub">${esc(L('Αξία', 'Value'))} ${esc(m0(s.value))}</div></div>
      <div class="kpi"><div class="k-label">${esc(L('Εισπράχθηκαν', 'Collected'))}</div><div class="k-value">${esc(m0(s.collected))}</div><div class="k-sub">${s.value ? Math.round((s.evPaid / s.value) * 100) : 0}% ${esc(L('των πακέτων', 'of packages'))}</div></div>
      <div class="kpi"><div class="k-label">${esc(L('Έξοδα', 'Expenses'))}</div><div class="k-value">${esc(m0(s.spent))}</div><div class="k-sub">${s.exps.length} ${esc(L('κινήσεις', 'entries'))}</div></div>
      <div class="kpi"><div class="k-label">${esc(L('Καθαρή ταμειακή διαφορά', 'Net cash'))}</div><div class="k-value ${s.collected - s.spent < 0 ? 'neg' : ''}">${esc(m0(s.collected - s.spent))}</div><div class="k-sub">${esc(L('Ανοιχτό υπόλοιπο', 'Open balance'))} ${esc(m0(s.open))}</div></div>
    </div>
    <div class="card pad mt" id="mchart"><div class="spread"><b>${esc(L('Μηνιαία εικόνα εσόδων / εξόδων', 'Monthly income / expenses'))}</b><span class="small muted">${esc(L('ταμειακά, ανά μήνα πληρωμής', 'cash, by payment month'))}</span></div><div class="mt-s">${barPairs(s.months.map((r) => ({ label: monthShort(r.m), a: r.cashIn, b: r.out })))}</div></div>
    <div class="grid cols-2 mt">
      <div class="card pad"><b>${esc(L('Εκδηλώσεις ανά κατηγορία', 'Events by category'))}</b><div class="mt-s">${hbars(s.byCat.filter((r) => r.n).map((r) => ({ label: L(r.c.el, r.c.en).replace(' (Promotional)', ''), v: r.n, dot: r.c.v }))) || `<div class="muted small">—</div>`}</div></div>
      <div class="card pad"><b>${esc(L('Έξοδα ανά κατηγορία', 'Expenses by category'))}</b><div class="mt-s">${hbars(s.expKinds.slice(0, 8).map((r) => ({ label: r.label, v: r.v })), { fmt: m0 }) || `<div class="muted small">—</div>`}</div></div>
    </div>
    ${apptSummaryHTML(st.year)}
    <div class="small muted mt-s">${esc(L('Αναλυτικοί αριθμοί σε πίνακα: καρτέλα «Σύνοψη».', 'Detailed numbers in a table: the “Summary” tab.'))}</div>`;
  bindTips(body.querySelector('#mchart'));
}

// ---------------------------------------------------------------------
//  Έλεγχος δεδομένων
// ---------------------------------------------------------------------
function checksSheet(body) {
  const today = todayISO();
  const views = allEventViews({ year: st.year, includeCancelled: false });
  const issues = [];
  const push = (sev, title, list, fmt) => { if (list.length) issues.push({ sev, title, list, fmt }); };
  const ev = (v) => `<a class="row" href="#/event/${v.e.id}"><div class="main-col"><div class="t">${esc(v.title)}</div><div class="s">${esc(fmtDate(v.e.event_date))} · ${esc(v.e.church_location || '—')}</div></div>${icon('chevR', 'chev')}</a>`;
  push('red', L('Χωρίς τιμή πακέτου', 'No package price'), views.filter((v) => v.price == null), ev);
  push('red', L('Χωρίς PDF προσφοράς', 'No offer PDF'), views.filter((v) => !v.e.offer_path), ev);
  push('orange', L('Περασμένες εκδηλώσεις με υπόλοιπο', 'Past events with a balance'), views.filter((v) => v.e.event_date < today && v.balance > 0.009), (v) => ev(v).replace('</div></div>', `</div></div><div class="v money neg">${esc(money(v.balance))}</div>`));
  push('orange', L('Πληρωμές μεγαλύτερες από την αξία πακέτου', 'Payments larger than package value'), views.filter((v) => v.price != null && v.paid > v.price + 0.009), ev);
  push('orange', L('Χωρίς εκκλησία / τοποθεσία', 'No church / location'), views.filter((v) => !v.e.church_location), ev);
  push('orange', L('Χωρίς ανάλυση video', 'No video resolution'), views.filter((v) => !v.e.resolution), ev);
  push('orange', L('Επόμενες 30 ημέρες χωρίς συνεργείο', 'Next 30 days without crew'), views.filter((v) => v.e.event_date >= today && daysBetween(today, v.e.event_date) <= 30 && !v.crew.length), ev);
  push('', L('Πελάτης χωρίς τηλέφωνο', 'Customer without phone'), views.filter((v) => !v.c?.phone1 && !v.c?.phone2), ev);
  push('', L('Πελάτης χωρίς email', 'Customer without email'), views.filter((v) => !v.c?.email1 && !v.c?.email2), ev);
  const pays = S.payments.filter((p) => (p.paid_on || '').startsWith(String(st.year)) || !p.paid_on);
  push('', L('Πληρωμές χωρίς τρόπο πληρωμής', 'Payments without method'), pays.filter((p) => !p.method), (p) => `<button class="row" data-p="${p.id}"><div class="main-col"><div class="t">${esc(p.label || '')} · ${esc(money(p.amount))}</div><div class="s">${esc(fmtDate(p.paid_on))}</div></div></button>`);
  const total = issues.reduce((n, i) => n + i.list.length, 0);
  body.innerHTML = total ? `<div class="banner ${issues.some((i) => i.sev === 'red') ? 'red' : ''}">${icon('warning')}<div><b>${esc(L(`${total} πράγματα θέλουν έλεγχο`, `${total} things need checking`))}</b><span>${esc(L('Πατήστε μια εκδήλωση για να τη διορθώσετε.', 'Tap an event to fix it.'))}</span></div></div>` + issues.map((i) => `<div class="group-label spread"><span>${esc(i.title)}</span><span class="pill ${i.sev}">${i.list.length}</span></div><div class="list">${i.list.slice(0, 30).map(i.fmt).join('')}</div>`).join('')
    : `<div class="banner green">${icon('checkCircle')}<div><b>${esc(L('Όλα είναι εντάξει!', 'All good!'))}</b><span>${esc(L(`Δεν βρέθηκαν προβλήματα στα δεδομένα του ${st.year}.`, `No issues found in ${st.year}.`))}</span></div></div>`;
  body.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => openIncomeForm({ payment: S.payments.find((p) => p.id === b.dataset.p) })));
}
void deletePayment; void deleteExpense; void confirmBox; void actionSheet; void lbl; void SHOP_SUBS; void OTHER_SUBS;
