// =====================================================================
//  Πελάτες
// =====================================================================
import { L, esc, icon, matches, fmtDate, telUrl, smsUrl, mailUrl, sheet, confirmBox, toast, toastErr, busy, initials, colorFor, money } from '../core.js';
import { S, coupleName, saveCustomer, deleteCustomer, allEventViews } from '../data.js';
import { pageHead, emptyState, backBtn, go, setTopActions } from '../layout.js';
import { eventRow } from '../components.js';

const st = { q: '' };

export function renderCustomers(root) {
  const views = allEventViews();
  const evByC = {};
  views.forEach((v) => { if (v.e.customer_id) (evByC[v.e.customer_id] ||= []).push(v); });
  const list = [...S.customers.values()]
    .filter((c) => matches(st.q, c.name1, c.name2, c.phone1, c.phone2, c.email1, c.email2, c.notes))
    .sort((a, b) => {
      const da = evByC[a.id]?.[0]?.e.event_date || '0', db = evByC[b.id]?.[0]?.e.event_date || '0';
      return db.localeCompare(da) || coupleName(a).localeCompare(coupleName(b));
    });
  setTopActions(`<button class="btn primary small" data-new>${icon('plus')} <span class="hide-mobile">${esc(L('Νέος πελάτης', 'New customer'))}</span></button>`);
  let html = pageHead(L('Πελάτες', 'Customers'), { sub: esc(L(`${S.customers.size} πελάτες`, `${S.customers.size} customers`)) });
  html += `<div class="search mb">${icon('search')}<input class="input" id="q" type="search" placeholder="${esc(L('Αναζήτηση με όνομα, τηλέφωνο ή email…', 'Search by name, phone or email…'))}" value="${esc(st.q)}"></div>`;
  if (!list.length) html += emptyState('users', st.q ? L('Δεν βρέθηκε πελάτης', 'No customer found') : L('Δεν υπάρχουν πελάτες ακόμη', 'No customers yet'), L('Οι πελάτες δημιουργούνται και αυτόματα όταν φτιάχνετε νέα εκδήλωση.', 'Customers are also created automatically when you make a new event.'));
  else html += `<div class="list">${list.map((c) => {
    const evs = evByC[c.id] || [];
    const next = evs.find((v) => v.e.event_date >= new Date().toISOString().slice(0, 10)) || evs[evs.length - 1];
    return `<a class="row has-icon" href="#/customer/${c.id}"><span class="avatar" style="--c:${colorFor(c.id)}">${esc(initials(coupleName(c, { short: true }).replace('&', ' ')))}</span>
      <div class="main-col"><div class="t">${esc(coupleName(c))}</div><div class="s">${esc([c.phone1, c.email1].filter(Boolean).join(' · ') || '—')}</div></div>
      ${next ? `<div class="v small">${esc(fmtDate(next.e.event_date))}<div class="tiny muted">${evs.length} ${esc(evs.length === 1 ? L('εκδήλωση', 'event') : L('εκδηλώσεις', 'events'))}</div></div>` : ''}${icon('chevR', 'chev')}</a>`;
  }).join('')}</div>`;
  root.innerHTML = html;
  const q = root.querySelector('#q');
  q.addEventListener('input', () => { st.q = q.value; const p = q.selectionStart; renderCustomers(root); const n = root.querySelector('#q'); n.focus(); n.setSelectionRange(p, p); });
  document.querySelector('[data-new]')?.addEventListener('click', () => openCustomerForm({}));
}

export function renderCustomer(root, { id }) {
  const c = S.customers.get(id);
  if (!c) { root.innerHTML = backBtn('#/customers') + emptyState('users', L('Ο πελάτης δεν βρέθηκε', 'Customer not found')); return; }
  const evs = allEventViews().filter((v) => v.e.customer_id === id);
  setTopActions(`<button class="btn small" data-edit>${icon('edit')} <span class="hide-mobile">${esc(L('Επεξεργασία', 'Edit'))}</span></button>`);
  const person = (n, p, m) => `<div class="row"><div class="main-col"><div class="t">${esc(n || '—')}</div><div class="s">${esc([p, m].filter(Boolean).join(' · ') || '—')}</div></div>
    ${p ? `<a class="icon-btn filled" href="${telUrl(p)}">${icon('phone')}</a><a class="icon-btn filled" href="${smsUrl(p)}">${icon('sms')}</a>` : ''}${m ? `<a class="icon-btn filled" href="${mailUrl(m)}">${icon('mail')}</a>` : ''}</div>`;
  const total = evs.reduce((n, v) => n + (v.price || 0), 0), paid = evs.reduce((n, v) => n + v.paid, 0);
  let html = backBtn('#/customers') + pageHead(coupleName(c));
  html += `<div class="list">${person(c.name1, c.phone1, c.email1)}${c.name2 || c.phone2 || c.email2 ? person(c.name2, c.phone2, c.email2) : ''}</div>`;
  if (c.notes) html += `<div class="group-label">${esc(L('Σημειώσεις', 'Notes'))}</div><div class="card pad" style="white-space:pre-wrap">${esc(c.notes)}</div>`;
  html += `<div class="grid cols-3 mt"><div class="kpi"><div class="k-label">${esc(L('Εκδηλώσεις', 'Events'))}</div><div class="k-value">${evs.length}</div></div><div class="kpi"><div class="k-label">${esc(L('Αξία', 'Value'))}</div><div class="k-value">${esc(money(total, { dec: 0 }))}</div></div><div class="kpi"><div class="k-label">${esc(L('Πληρωμές', 'Paid'))}</div><div class="k-value pos">${esc(money(paid, { dec: 0 }))}</div></div></div>`;
  html += `<div class="section-title"><h2>${esc(L('Εκδηλώσεις', 'Events'))}</h2><a class="btn small primary" href="#/new-event?customer=${id}">${icon('plus')} ${esc(L('Νέα', 'New'))}</a></div>`;
  html += evs.length ? `<div class="list">${evs.map((v) => eventRow(v)).join('')}</div>` : `<div class="card pad muted">${esc(L('Καμία εκδήλωση.', 'No events.'))}</div>`;
  html += `<div class="list mt"><button class="row" data-del><span class="row-icon" style="background:var(--red)">${icon('trash')}</span><div class="main-col"><div class="t neg">${esc(L('Διαγραφή πελάτη', 'Delete customer'))}</div><div class="s">${esc(L('Μόνο αν δεν έχει εκδηλώσεις', 'Only if they have no events'))}</div></div></button></div>`;
  root.innerHTML = html;
  document.querySelector('[data-edit]')?.addEventListener('click', () => openCustomerForm(c));
  root.querySelector('[data-del]').addEventListener('click', async () => {
    if (evs.length) { toastErr(L('Ο πελάτης έχει εκδηλώσεις', 'Customer has events'), L('Διαγράψτε πρώτα τις εκδηλώσεις του.', 'Delete their events first.')); return; }
    if (!await confirmBox(L('Διαγραφή πελάτη;', 'Delete customer?'), coupleName(c), { ok: L('Διαγραφή', 'Delete'), destructive: true })) return;
    await deleteCustomer(id); toast(L('Ο πελάτης διαγράφηκε', 'Customer deleted')); go('#/customers');
  });
}

export function openCustomerForm(c = {}, { onSaved } = {}) {
  const f = { id: c.id, name1: c.name1 || '', name2: c.name2 || '', phone1: c.phone1 || '', phone2: c.phone2 || '', email1: c.email1 || '', email2: c.email2 || '', notes: c.notes || '' };
  const fld = (n, l, req, type = 'text', ph = '') => `<div class="field"><label>${esc(l)}${req ? ' <span class="req">*</span>' : ''}</label><input class="input" name="${n}" type="${type}" value="${esc(f[n])}" placeholder="${esc(ph)}"></div>`;
  const body = `<div class="form-grid">
    ${fld('name1', L('Ονοματεπώνυμο 1', 'Full name 1'), true)}${fld('name2', L('Ονοματεπώνυμο 2', 'Full name 2'))}
    ${fld('phone1', L('Κινητό 1', 'Mobile 1'), true, 'tel', '69XXXXXXXX')}${fld('phone2', L('Κινητό 2', 'Mobile 2'), false, 'tel', '69XXXXXXXX')}
    ${fld('email1', 'Email 1', true, 'email')}${fld('email2', 'Email 2', false, 'email')}
    <div class="field full"><label>${esc(L('Σημειώσεις', 'Notes'))}</label><textarea class="textarea" name="notes">${esc(f.notes)}</textarea></div></div>`;
  const s = sheet({ title: f.id ? L('Επεξεργασία πελάτη', 'Edit customer') : L('Νέος πελάτης', 'New customer'), body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (e) => { const _btn = e.currentTarget;
    s.body.querySelectorAll('[name]').forEach((i) => { f[i.name] = i.value.trim(); });
    let ok = true;
    const bad = (n) => { s.body.querySelector(`[name=${n}]`).classList.add('invalid'); ok = false; };
    if (!f.name1) bad('name1');
    if (!f.phone1) bad('phone1');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email1)) bad('email1');
    if (!ok) { toastErr(L('Συμπληρώστε τα υποχρεωτικά πεδία', 'Fill in the required fields')); return; }
    busy(_btn, true);
    try { const saved = await saveCustomer(f); s.close(); toast(L('Ο πελάτης αποθηκεύτηκε', 'Customer saved')); onSaved?.(saved); if (!f.id) go('#/customer/' + saved.id); } catch { busy(_btn, false); }
  });
}
