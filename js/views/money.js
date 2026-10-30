// =====================================================================
//  Έσοδα & Έξοδα
// =====================================================================
import { L, esc, icon, money, fmtDate, todayISO, addDays, matches, sum, parseMoney, lbl, opt, options, CATEGORIES, METHODS, EXPENSE_KINDS, SHOP_SUBS, OTHER_SUBS, sheet, actionSheet, confirmBox, toast, toastErr, busy, monthName, segmented, initSegmented, daysBetween } from '../core.js';
import { S, isAdmin, eventView, allEventViews, coupleName, profileName, profileById, savePayment, deletePayment, saveExpense, deleteExpense, nextPaymentLabel, wageStatus } from '../data.js';
import { pageHead, setTopActions } from '../layout.js';
import { catPill } from '../components.js';

const st = { kind: 'all', y: new Date().getFullYear(), q: '' };

export function expenseTitle(x) {
  const k = opt(EXPENSE_KINDS, x.kind);
  let t = k ? L(k.el, k.en) : x.kind;
  if (x.kind === 'shop' && x.subcategory) t += ' · ' + lbl(SHOP_SUBS, x.subcategory);
  if (x.kind === 'other' && x.subcategory) t = lbl(OTHER_SUBS, x.subcategory);
  if ((x.kind === 'payroll' || x.kind === 'daily_wage') && (x.crew_name || x.crew_id)) t += ' · ' + (x.crew_name || profileName(profileById(x.crew_id)));
  return t;
}
export function expenseSub(x) {
  const parts = [];
  if (x.kind === 'payroll' && x.for_month) { const [y, m] = x.for_month.split('-').map(Number); parts.push(L(`Μήνας: ${monthName(m - 1)} ${y}`, `Month: ${monthName(m - 1)} ${y}`)); }
  if (x.kind === 'daily_wage' && x.paid_until) parts.push(L(`Πληρωμένος έως ${fmtDate(x.paid_until)}`, `Paid until ${fmtDate(x.paid_until)}`));
  if (x.description) parts.push(x.description);
  if (x.supplier) parts.push(x.supplier);
  if (x.method) parts.push(lbl(METHODS, x.method));
  if (x.notes) parts.push(x.notes);
  return parts.join(' · ');
}
export function wageLine(w) {
  return L(`${w.name} έχει πάρει ${money(w.total)} και είναι πληρωμένος μέχρι και για ${w.paidUntil ? fmtDate(w.paidUntil) : '—'}`,
           `${w.name} has received ${money(w.total)} and is paid up to and including ${w.paidUntil ? fmtDate(w.paidUntil) : '—'}`);
}

export function renderMoney(root) {
  const y = st.y, yp = String(y) + '-';
  const incomes = S.payments.filter((p) => (p.paid_on || '').startsWith(yp));
  const expenses = S.expenses.filter((x) => (x.paid_on || '').startsWith(yp));
  const inSum = sum(incomes, (p) => p.amount), outSum = sum(expenses, (x) => x.amount);

  setTopActions(`<button class="btn primary small hide-mobile" data-new>${icon('plus')} ${esc(L('Νέα κίνηση', 'New entry'))}</button>`);
  let html = pageHead(L('Έσοδα & Έξοδα', 'Income & Expenses'), { sub: esc(L('Κάθε καταχώρηση ενημερώνει αυτόματα τα φύλλα Excel.', 'Every entry updates the Excel sheets automatically.')) });

  html += `<div class="cal-head"><button class="icon-btn filled" data-m="-1">${icon('chevL')}</button><div class="cal-title" style="min-width:0;text-align:center;flex:1">${y}</div><button class="icon-btn filled" data-m="1">${icon('chevR')}</button></div>
    <div class="grid cols-3" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
      <div class="kpi"><div class="k-label">${icon('incoming')} ${esc(L('Έσοδα', 'Income'))}</div><div class="k-value pos">${esc(money(inSum, { dec: 0 }))}</div><div class="k-sub">${incomes.length} ${esc(L('κινήσεις', 'entries'))}</div></div>
      <div class="kpi"><div class="k-label">${icon('outgoing')} ${esc(L('Έξοδα', 'Expenses'))}</div><div class="k-value neg">${esc(money(outSum, { dec: 0 }))}</div><div class="k-sub">${expenses.length} ${esc(L('κινήσεις', 'entries'))}</div></div>
      <div class="kpi accent"><div class="k-label">${icon('euro')} ${esc(L('Καθαρό', 'Net'))}</div><div class="k-value">${esc(money(inSum - outSum, { dec: 0 }))}</div><div class="k-sub">${esc(L('ταμειακή διαφορά', 'cash difference'))}</div></div>
    </div>`;

  html += `<div class="spread mt" style="flex-wrap:wrap">${segmented('k', [{ v: 'all', label: L('Όλα', 'All') }, { v: 'in', label: L('Έσοδα', 'Income') }, { v: 'out', label: L('Έξοδα', 'Expenses') }], st.kind)}
    <div class="search" style="flex:1;min-width:200px;max-width:340px">${icon('search')}<input class="input" id="mq" type="search" placeholder="${esc(L('Αναζήτηση…', 'Search…'))}" value="${esc(st.q)}"></div></div>`;

  const rows = [];
  if (st.kind !== 'out') incomes.forEach((p) => {
    const v = p.event_id ? eventView(p.event_id) : null;
    rows.push({ t: 'in', id: p.id, date: p.paid_on, created: p.created_at, amount: Number(p.amount), title: v ? `${v.title}` : (p.description || lbl(CATEGORIES, p.category)), sub: [p.label, lbl(METHODS, p.method), p.notes].filter((x) => x && x !== '—').join(' · '), cat: p.category });
  });
  if (st.kind !== 'in') expenses.forEach((x) => rows.push({ t: 'out', id: x.id, date: x.paid_on, created: x.created_at, amount: Number(x.amount), title: expenseTitle(x), sub: expenseSub(x) }));
  const filtered = rows.filter((r) => matches(st.q, r.title, r.sub, fmtDate(r.date), String(r.amount))).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));

  html += `<div class="section-title"><h2>${esc(L(`Κινήσεις ${y}`, `Entries ${y}`))}</h2><span class="hint">${filtered.length}</span></div>`;
  if (!filtered.length) html += `<div class="card pad center muted">${esc(L('Καμία κίνηση αυτή τη χρονιά. Πατήστε + για νέα.', 'No entries this year. Tap + to add one.'))}</div>`;
  else {
    let lastM = null; let open = false;
    filtered.forEach((r) => {
      const mo = Number((r.date || '').slice(5, 7)) || 0;
      if (mo !== lastM) {
        if (open) html += '</div>';
        const mIn = sum(filtered.filter((x) => x.t === 'in' && Number((x.date || '').slice(5, 7)) === mo), (x) => x.amount);
        const mOut = sum(filtered.filter((x) => x.t === 'out' && Number((x.date || '').slice(5, 7)) === mo), (x) => x.amount);
        html += `<div class="agenda-day spread"><span>${esc(mo ? monthName(mo - 1) : '—')}</span><span class="small" style="font-weight:600">${mIn ? `<span class="pos">+${esc(money(mIn, { dec: 0 }))}</span>` : ''}${mIn && mOut ? ' · ' : ''}${mOut ? `<span class="neg">−${esc(money(mOut, { dec: 0 }))}</span>` : ''}</span></div><div class="list">`;
        lastM = mo; open = true;
      }
      const dn = daysBetween(r.date, todayISO());
      r.sub = [dn === 0 ? L('Σήμερα', 'Today') : dn === 1 ? L('Χθες', 'Yesterday') : fmtDate(r.date), r.sub].filter(Boolean).join(' · ');
      html += `<button class="row has-icon" data-${r.t}="${r.id}"><span class="row-icon" style="background:${r.t === 'in' ? 'var(--green)' : 'var(--red)'}">${icon(r.t === 'in' ? 'incoming' : 'outgoing')}</span>
        <div class="main-col"><div class="t">${esc(r.title)}</div><div class="s">${esc(r.sub || '—')}</div></div>
        <div class="v money ${r.t === 'in' ? 'pos' : 'neg'}" style="font-weight:650">${r.t === 'in' ? '+' : '−'}${esc(money(Math.abs(r.amount)).replace('−', ''))}</div></button>`;
    });
    if (open) html += '</div>';
  }

  // Μεροκάματα
  const wages = wageStatus();
  html += `<div class="section-title"><h2>${esc(L('Μεροκάματα', 'Daily wages'))}</h2><button class="btn small" data-wage="">${icon('plus')} ${esc(L('Πληρωμή', 'Pay'))}</button></div>`;
  html += wages.length ? `<div class="list">${wages.map((w) => `<button class="row has-icon" data-wage="${esc(w.crew_id || '')}" data-wname="${esc(w.name)}"><span class="row-icon" style="background:var(--purple)">${icon('user')}</span><div class="main-col"><div class="t" style="white-space:normal">${esc(wageLine(w))}</div><div class="s">${esc(L(`Φέτος: ${money(w.yearTotal)} · ${w.count} πληρωμές · τελευταία ${fmtDate(w.last)}`, `This year: ${money(w.yearTotal)} · ${w.count} payments · last ${fmtDate(w.last)}`))}</div></div>${icon('plus', 'chev')}</button>`).join('')}</div>`
    : `<div class="card pad muted small">${esc(L('Δεν έχουν καταχωρηθεί μεροκάματα.', 'No daily wages recorded yet.'))}</div>`;

  // Μισθοδοσία φέτος
  const yr = String(y);
  const pay = S.expenses.filter((x) => x.kind === 'payroll' && (x.paid_on || '').startsWith(yr));
  if (pay.length) {
    const by = {};
    pay.forEach((x) => { const k = x.crew_id || x.crew_name; (by[k] ||= { name: x.crew_name || profileName(profileById(x.crew_id)), total: 0, last: null }); by[k].total += Number(x.amount); if (!by[k].last || (x.for_month || '') > (by[k].last || '')) by[k].last = x.for_month; });
    html += `<div class="section-title"><h2>${esc(L(`Μισθοδοσία ${yr}`, `Payroll ${yr}`))}</h2></div><div class="list">${Object.values(by).map((b) => { const [yy, mm] = (b.last || '').split('-').map(Number); return `<div class="row"><div class="main-col"><div class="t">${esc(b.name)}</div><div class="s">${esc(b.last ? L(`Τελευταίος μήνας: ${monthName(mm - 1)} ${yy}`, `Last month paid: ${monthName(mm - 1)} ${yy}`) : '')}</div></div><div class="v money">${esc(money(b.total))}</div></div>`; }).join('')}</div>`;
  }

  html += `<div class="hstack mt"><a class="btn" href="#/sheets/register">${icon('table')} ${esc(L('Μητρώο Εισπράξεων', 'Receipts register'))}</a><a class="btn" href="#/sheets/expenses">${icon('table')} ${esc(L('Φύλλο Εξόδων', 'Expenses sheet'))}</a><a class="btn" href="#/sheets/dashboard">${icon('chart')} Dashboard</a></div>`;
  html += `<button class="fab" data-new aria-label="${esc(L('Νέα κίνηση', 'New entry'))}">${icon('plus')}</button>`;
  root.innerHTML = html;

  initSegmented(root, (_, v) => { st.kind = v; renderMoney(root); });
  root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.y += Number(b.dataset.m); renderMoney(root); }));
  const mq = root.querySelector('#mq');
  mq.addEventListener('input', () => { st.q = mq.value; const p = mq.selectionStart; renderMoney(root); const n = root.querySelector('#mq'); n.focus(); n.setSelectionRange(p, p); });
  document.querySelectorAll('[data-new]').forEach((b) => b.addEventListener('click', newEntry));
  root.querySelectorAll('[data-in]').forEach((b) => b.addEventListener('click', () => paymentActions(S.payments.find((p) => p.id === b.dataset.in))));
  root.querySelectorAll('[data-out]').forEach((b) => b.addEventListener('click', () => expenseActions(S.expenses.find((x) => x.id === b.dataset.out))));
  root.querySelectorAll('[data-wage]').forEach((b) => b.addEventListener('click', () => openExpenseForm({ kind: 'daily_wage', crew_id: b.dataset.wage || null, crew_name: b.dataset.wage ? null : b.dataset.wname || null })));
}

export async function newEntry() {
  const a = await actionSheet({ title: L('Τι θέλετε να καταχωρήσετε;', 'What do you want to record?'), actions: [{ label: L('Έσοδο (πληρωμή πελάτη)', 'Income (client payment)'), value: 'in', icon: 'incoming' }, { label: L('Έξοδο', 'Expense'), value: 'out', icon: 'outgoing' }] });
  if (a === 'in') openIncomeForm({});
  if (a === 'out') openExpenseForm({});
}
export async function paymentActions(p) {
  if (!p) return;
  const a = await actionSheet({ title: `${p.label || L('Πληρωμή', 'Payment')} · ${money(p.amount)}`, actions: [{ label: L('Επεξεργασία', 'Edit'), value: 'edit', icon: 'edit' }, ...(p.event_id ? [{ label: L('Άνοιγμα εκδήλωσης', 'Open event'), value: 'ev', icon: 'events' }] : []), { label: L('Διαγραφή', 'Delete'), value: 'del', icon: 'trash', destructive: true }] });
  if (a === 'edit') openIncomeForm({ payment: p });
  if (a === 'ev') location.hash = `#/event/${p.event_id}`;
  if (a === 'del' && await confirmBox(L('Διαγραφή πληρωμής;', 'Delete payment?'), `${p.label || ''} · ${money(p.amount)} · ${fmtDate(p.paid_on)}`, { ok: L('Διαγραφή', 'Delete'), destructive: true })) { await deletePayment(p.id); toast(L('Διαγράφηκε', 'Deleted')); }
}
export async function expenseActions(x) {
  if (!x) return;
  const a = await actionSheet({ title: `${expenseTitle(x)} · ${money(x.amount)}`, actions: [{ label: L('Επεξεργασία', 'Edit'), value: 'edit', icon: 'edit' }, { label: L('Διαγραφή', 'Delete'), value: 'del', icon: 'trash', destructive: true }] });
  if (a === 'edit') openExpenseForm({ expense: x });
  if (a === 'del' && await confirmBox(L('Διαγραφή εξόδου;', 'Delete expense?'), `${expenseTitle(x)} · ${money(x.amount)}`, { ok: L('Διαγραφή', 'Delete'), destructive: true })) { await deleteExpense(x.id); toast(L('Διαγράφηκε', 'Deleted')); }
}

// ---------------------------------------------------------------------
//  Φόρμα εσόδου
// ---------------------------------------------------------------------
export function openIncomeForm({ eventId = null, payment = null, category = null, lock = false } = {}) {
  if (!isAdmin()) return;
  const f = {
    id: payment?.id || null,
    event_id: payment ? payment.event_id : eventId,
    category: payment?.category || category || (eventId ? S.events.get(eventId)?.category : 'wedding') || 'wedding',
    noEvent: payment ? !payment.event_id : false,
    label: payment?.label || '', kind: payment?.kind || 'installment',
    amount: payment ? String(payment.amount).replace('.', ',') : '',
    paid_on: payment?.paid_on || todayISO(), method: payment?.method || 'cash',
    description: payment?.description || '', notes: payment?.notes || '', q: '',
  };
  if (!f.id && f.event_id) { const n = nextPaymentLabel(f.event_id); f.label = n.label; f.kind = n.kind; }
  const body = document.createElement('div');
  const draw = () => {
    const v = f.event_id ? eventView(f.event_id) : null;
    const canNoEvent = ['promo', 'other'].includes(f.category);
    const locked = lock && !!f.event_id; // από το Excel: η εκδήλωση και η κατηγορία είναι ήδη γνωστές
    let html = `<div class="form">
      ${locked ? '' : `<div class="field"><label>${esc(L('Κατηγορία εσόδου', 'Income category'))}</label>
        <div class="chips">${CATEGORIES.map((c) => `<button type="button" class="chip ${f.category === c.v ? 'on' : ''}" data-cat="${c.v}"><span class="cat-dot cat-${c.v}"></span>${esc(L(c.el, c.en).replace(' (Promotional)', ' / Promo'))}</button>`).join('')}</div></div>`}`;
    if (canNoEvent && !locked) html += `<label class="check-row"><span class="switch"><input type="checkbox" id="noev" ${f.noEvent ? 'checked' : ''}><span></span></span><span>${esc(L('Χωρίς συγκεκριμένη εκδήλωση', 'Not linked to an event'))}</span></label>`;
    if (f.noEvent && canNoEvent) {
      html += `<div class="field"><label>${esc(L('Περιγραφή', 'Description'))} <span class="req">*</span></label><input class="input" name="description" value="${esc(f.description)}" placeholder="${esc(L('π.χ. Εκτυπώσεις φωτογραφιών', 'e.g. Photo prints'))}"><div class="err" hidden></div></div>`;
    } else if (v) {
      const pct = v.price ? Math.min(100, Math.round((v.paid / v.price) * 100)) : 0;
      html += `<div class="card" style="background:var(--fill-2);box-shadow:none"><div class="row"><div class="main-col"><div class="t">${esc(v.title)}</div><div class="s">${esc(fmtDate(v.e.event_date))} · ${esc(v.e.church_location || '')}</div></div>${f.id || locked ? '' : `<button type="button" class="btn small" data-change>${esc(L('Αλλαγή', 'Change'))}</button>`}</div>
        <div class="row"><div class="main-col"><div class="progress ${v.fullyPaid ? 'green' : ''}"><i style="width:${pct}%"></i></div><div class="s mt-s">${esc(L('Αξία', 'Value'))} ${esc(money(v.price))} · ${esc(L('Πληρώθηκαν', 'Paid'))} ${esc(money(v.paid))} · <b>${esc(L('Υπόλοιπο', 'Balance'))} ${esc(money(v.balance))}</b></div></div></div>
        ${v.pays.length ? `<div class="row"><div class="main-col s">${v.pays.map((p) => `${esc(p.label || '')}: ${esc(money(p.amount))} (${esc(fmtDate(p.paid_on))})`).join('<br>')}</div></div>` : ''}</div>`;
    } else {
      const list = allEventViews({ includeCancelled: false }).filter((x) => x.e.category === f.category && matches(f.q, x.title, x.e.church_location, fmtDate(x.e.event_date), x.c?.phone1))
        .sort((a, b) => Math.abs(daysBetween(todayISO(), a.e.event_date)) - Math.abs(daysBetween(todayISO(), b.e.event_date))).slice(0, 40);
      html += `<div class="field"><label>${esc(L('Εκδήλωση', 'Event'))} <span class="req">*</span></label>
        <div class="search">${icon('search')}<input class="input" id="eq" type="search" placeholder="${esc(L('Αναζήτηση ζευγαριού, ημερομηνίας…', 'Search couple, date…'))}" value="${esc(f.q)}"></div>
        <div class="list pick-list" style="max-height:260px">${list.map((x) => `<button type="button" class="row" data-ev="${x.e.id}"><div class="main-col"><div class="t">${esc(x.title)}</div><div class="s">${esc(fmtDate(x.e.event_date))} · ${esc(x.e.church_location || '')}</div></div><div class="v small money">${x.price != null ? (x.fullyPaid ? '<span class="pill green">✓</span>' : esc(money(x.balance, { dec: 0 }))) : '—'}</div></button>`).join('') || `<div class="row muted small">${esc(L('Δεν υπάρχουν εκδηλώσεις σε αυτή την κατηγορία.', 'No events in this category.'))}</div>`}</div><div class="err" hidden data-err="event"></div></div>`;
    }
    if (v || f.noEvent) {
      const sugg = v ? [L('Προκαταβολή', 'Deposit'), L('1η Δόση', 'Installment 1'), L('2η Δόση', 'Installment 2'), L('3η Δόση', 'Installment 3'), L('Εξόφληση', 'Final payment')] : [];
      const chips = [];
      if (v?.balance > 0) chips.push({ t: L(`Υπόλοιπο ${money(v.balance, { dec: 0 })}`, `Balance ${money(v.balance, { dec: 0 })}`), a: v.balance });
      if (v?.price) { chips.push({ t: `40% = ${money(v.price * 0.4, { dec: 0 })}`, a: Math.round(v.price * 0.4) }); chips.push({ t: `20% = ${money(v.price * 0.2, { dec: 0 })}`, a: Math.round(v.price * 0.2) }); }
      html += `${v ? `<div class="field"><label>${esc(L('Τι πληρώνεται', 'What is being paid'))}</label><input class="input" name="label" value="${esc(f.label)}" placeholder="${esc(L('π.χ. 1η Δόση', 'e.g. Installment 1'))}"><div class="chips scroll" style="margin-top:6px">${sugg.map((s) => `<button type="button" class="chip small" data-lbl="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>` : ''}
        <div class="form-grid">
          <div class="field"><label>${esc(L('Ποσό', 'Amount'))} <span class="req">*</span></label><div class="input-wrap"><input class="input" name="amount" inputmode="decimal" value="${esc(f.amount)}" placeholder="0,00"><span class="suffix">€</span></div>${chips.length ? `<div class="chips" style="margin-top:6px">${chips.map((c) => `<button type="button" class="chip" data-amt="${c.a}">${esc(c.t)}</button>`).join('')}</div>` : ''}<div class="err" hidden></div></div>
          <div class="field"><label>${esc(L('Ημερομηνία είσπραξης', 'Date received'))}</label><input class="input" type="date" name="paid_on" value="${esc(f.paid_on)}"></div>
          <div class="field"><label>${esc(L('Τρόπος πληρωμής', 'Payment method'))}</label><select class="select" name="method">${options(METHODS, f.method)}</select></div>
          <div class="field"><label>${esc(L('Σημειώσεις', 'Notes'))}</label><input class="input" name="notes" value="${esc(f.notes)}"></div>
        </div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { f.category = b.dataset.cat; if (f.event_id && S.events.get(f.event_id)?.category !== f.category) f.event_id = null; if (!['promo', 'other'].includes(f.category)) f.noEvent = false; draw(); }));
    body.querySelector('#noev')?.addEventListener('change', (e) => { f.noEvent = e.target.checked; draw(); });
    body.querySelector('[data-change]')?.addEventListener('click', () => { f.event_id = null; draw(); });
    const eq = body.querySelector('#eq');
    eq?.addEventListener('input', () => { f.q = eq.value; const p = eq.selectionStart; draw(); const n = body.querySelector('#eq'); n.focus(); n.setSelectionRange(p, p); });
    body.querySelectorAll('[data-ev]').forEach((b) => b.addEventListener('click', () => { f.event_id = b.dataset.ev; const n = nextPaymentLabel(f.event_id); f.label = n.label; f.kind = n.kind; draw(); }));
    body.querySelectorAll('[name]').forEach((i) => i.addEventListener('input', () => { f[i.name] = i.value; i.classList.remove('invalid'); }));
    body.querySelectorAll('[data-lbl]').forEach((b) => b.addEventListener('click', () => { f.label = b.dataset.lbl; body.querySelector('[name=label]').value = f.label; f.kind = /Προκαταβολή|Deposit/.test(f.label) ? 'deposit' : 'installment'; }));
    body.querySelectorAll('[data-amt]').forEach((b) => b.addEventListener('click', () => { f.amount = String(b.dataset.amt).replace('.', ','); body.querySelector('[name=amount]').value = f.amount; }));
  };
  draw();
  const s = sheet({ title: f.id ? L('Επεξεργασία εσόδου', 'Edit income') : L('Νέο έσοδο', 'New income'), body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => { const _btn = ev.currentTarget;
    const amount = parseMoney(f.amount);
    if (!f.noEvent && !f.event_id) { toastErr(L('Επιλέξτε εκδήλωση', 'Choose an event')); return; }
    if (f.noEvent && !f.description) { toastErr(L('Γράψτε περιγραφή', 'Enter a description')); body.querySelector('[name=description]')?.classList.add('invalid'); return; }
    if (!amount) { toastErr(L('Γράψτε ποσό', 'Enter an amount')); body.querySelector('[name=amount]')?.classList.add('invalid'); return; }
    const before = f.event_id ? eventView(f.event_id) : null;
    if (before?.price && !f.id && before.paid + amount > before.price + 0.01 && !await confirmBox(L('Το ποσό ξεπερνά το υπόλοιπο', 'Amount exceeds balance'), L(`Υπόλοιπο: ${money(before.balance)}. Να καταχωρηθεί ${money(amount)};`, `Balance: ${money(before.balance)}. Record ${money(amount)}?`), { ok: L('Ναι, καταχώρηση', 'Yes, record') })) return;
    busy(_btn, true);
    try {
      await savePayment({ id: f.id, event_id: f.noEvent ? null : f.event_id, category: f.category, kind: f.kind, label: f.label || (f.noEvent ? null : nextPaymentLabel(f.event_id).label), amount, paid_on: f.paid_on || todayISO(), method: f.method, description: f.noEvent ? f.description : null, notes: f.notes });
      s.close();
      const after = f.event_id ? eventView(f.event_id) : null;
      if (after?.fullyPaid && !before?.fullyPaid) toast(L('Εξοφλήθηκε πλήρως! 🎉', 'Fully paid! 🎉'), { body: L('Η γραμμή στο Excel έγινε πράσινη.', 'The Excel row turned green.') });
      else toast(f.id ? L('Η πληρωμή ενημερώθηκε', 'Payment updated') : L('Το έσοδο καταχωρήθηκε', 'Income recorded'), { body: !f.id && f.event_id ? L('Ετοιμάστηκε μήνυμα επιβεβαίωσης για τον πελάτη.', 'A confirmation message for the client is ready.') : L('Ενημερώθηκε και το Μητρώο Εισπράξεων.', 'The receipts register was updated too.') });
    } catch { busy(_btn, false); }
  });
}

// ---------------------------------------------------------------------
//  Φόρμα εξόδου
// ---------------------------------------------------------------------
export function openExpenseForm({ expense = null, kind = null, crew_id = null, crew_name = null } = {}) {
  if (!isAdmin()) return;
  const x = expense || {};
  const f = {
    id: x.id || null, kind: x.kind || kind || 'shop', subcategory: x.subcategory || (kind === 'shop' || (!kind && !x.kind) ? 'rent' : ''),
    crew_id: x.crew_id || crew_id || '', crew_name: x.crew_id ? '' : (x.crew_name || crew_name || ''),
    for_month: (x.for_month || todayISO()).slice(0, 7), paid_until: x.paid_until || todayISO(), days: x.days ?? '',
    amount: x.amount != null ? String(x.amount).replace('.', ',') : '', paid_on: x.paid_on || todayISO(), method: x.method || 'cash',
    supplier: x.supplier || '', description: x.description || '', notes: x.notes || '',
  };
  if (f.kind === 'other' && !f.subcategory) f.subcategory = 'misc';
  const team = S.profiles.filter((p) => p.role && p.active);
  const body = document.createElement('div');
  const draw = () => {
    const crewSel = `<div class="field"><label>${esc(L('Μέλος ομάδας', 'Team member'))} <span class="req">*</span></label>
      <select class="select" name="crew_id"><option value="">${esc(L('— Επιλέξτε —', '— Choose —'))}</option>${team.map((p) => `<option value="${p.id}" ${f.crew_id === p.id ? 'selected' : ''}>${esc(profileName(p))}</option>`).join('')}<option value="__other" ${!f.crew_id && f.crew_name ? 'selected' : ''}>${esc(L('Άλλος (εξωτερικός συνεργάτης)', 'Other (external)'))}</option></select>
      ${!f.crew_id && (f.crew_name || f._other) ? `<input class="input mt-s" name="crew_name" value="${esc(f.crew_name)}" placeholder="${esc(L('Όνομα συνεργάτη', 'Name'))}">` : ''}</div>`;
    let html = `<div class="form"><div class="field"><label>${esc(L('Τύπος εξόδου', 'Expense type'))}</label>
      <div class="chips">${EXPENSE_KINDS.map((k) => `<button type="button" class="chip ${f.kind === k.v ? 'on' : ''}" data-kind="${k.v}">${icon(k.icon)} ${esc(L(k.el, k.en))}</button>`).join('')}</div></div>`;
    if (f.kind === 'payroll') {
      html += `<div class="form-grid">${crewSel}<div class="field"><label>${esc(L('Για ποιον μήνα', 'For which month'))} <span class="req">*</span></label><input class="input" type="month" name="for_month" value="${esc(f.for_month)}"></div></div>`;
    } else if (f.kind === 'daily_wage') {
      const w = wageStatus().find((w) => (f.crew_id && w.crew_id === f.crew_id) || (!f.crew_id && f.crew_name && w.name.toLowerCase() === f.crew_name.toLowerCase()));
      html += `<div class="form-grid">${crewSel}<div class="field"><label>${esc(L('Πληρωμένος μέχρι και για', 'Paid up to and including'))} <span class="req">*</span></label><input class="input" type="date" name="paid_until" value="${esc(f.paid_until)}"></div></div>
        ${w ? `<div class="banner" style="margin:0">${icon('user')}<div><b>${esc(L('Μέχρι τώρα', 'So far'))}</b><span>${esc(wageLine(w))}</span></div></div>` : ''}
        <div class="field"><label>${esc(L('Αριθμός μεροκάματων (προαιρετικό)', 'Number of days (optional)'))}</label><input class="input" name="days" inputmode="decimal" value="${esc(f.days)}" placeholder="π.χ. 2"></div>`;
    } else if (f.kind === 'shop') {
      html += `<div class="field"><label>${esc(L('Κατηγορία', 'Category'))}</label><div class="chips">${SHOP_SUBS.map((s) => `<button type="button" class="chip ${f.subcategory === s.v ? 'on' : ''}" data-sub="${s.v}">${esc(L(s.el, s.en))}</button>`).join('')}</div></div>
        ${f.subcategory === 'misc' ? `<div class="field"><label>${esc(L('Σημείωση (τι αφορά)', 'Note (what for)'))} <span class="req">*</span></label><input class="input" name="description" value="${esc(f.description)}" placeholder="${esc(L('π.χ. Καθαριστικά', 'e.g. Cleaning supplies'))}"></div>` : ''}`;
    } else if (f.kind === 'investment') {
      html += `<div class="field"><label>${esc(L('Περιγραφή επένδυσης', 'Investment description'))} <span class="req">*</span></label><input class="input" name="description" value="${esc(f.description)}" placeholder="${esc(L('π.χ. Νέα κάμερα Sony A7 IV', 'e.g. New Sony A7 IV camera'))}"></div>
        <div class="field"><label>${esc(L('Προμηθευτής', 'Supplier'))}</label><input class="input" name="supplier" value="${esc(f.supplier)}"></div>`;
    } else {
      html += `<div class="field"><label>${esc(L('Κατηγορία', 'Category'))}</label><select class="select" name="subcategory">${options(OTHER_SUBS, f.subcategory)}</select></div>
        <div class="form-grid"><div class="field"><label>${esc(L('Πληρώθηκε σε / Προμηθευτής', 'Paid to / Supplier'))}</label><input class="input" name="supplier" value="${esc(f.supplier)}"></div>
        <div class="field"><label>${esc(L('Περιγραφή', 'Description'))}</label><input class="input" name="description" value="${esc(f.description)}"></div></div>`;
    }
    html += `<div class="form-grid">
      <div class="field"><label>${esc(L('Ποσό', 'Amount'))} <span class="req">*</span></label><div class="input-wrap"><input class="input" name="amount" inputmode="decimal" value="${esc(f.amount)}" placeholder="0,00"><span class="suffix">€</span></div></div>
      <div class="field"><label>${esc(L('Ημερομηνία πληρωμής', 'Payment date'))}</label><input class="input" type="date" name="paid_on" value="${esc(f.paid_on)}"></div>
      <div class="field"><label>${esc(L('Τρόπος πληρωμής', 'Payment method'))}</label><select class="select" name="method">${options(METHODS, f.method)}</select></div>
      <div class="field"><label>${esc(L('Σημειώσεις', 'Notes'))}</label><input class="input" name="notes" value="${esc(f.notes)}"></div>
    </div></div>`;
    body.innerHTML = html;
    body.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { f.kind = b.dataset.kind; f.subcategory = f.kind === 'shop' ? 'rent' : f.kind === 'other' ? 'misc' : ''; draw(); }));
    body.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { f.subcategory = b.dataset.sub; draw(); }));
    body.querySelectorAll('[name]').forEach((i) => i.addEventListener(i.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (i.name === 'crew_id') { if (i.value === '__other') { f.crew_id = ''; f._other = true; } else { f.crew_id = i.value; f.crew_name = ''; f._other = false; } draw(); return; }
      f[i.name] = i.value; i.classList.remove('invalid');
      if (i.name === 'subcategory') draw();
    }));
  };
  draw();
  const s = sheet({ title: f.id ? L('Επεξεργασία εξόδου', 'Edit expense') : L('Νέο έξοδο', 'New expense'), body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => { const _btn = ev.currentTarget;
    const amount = parseMoney(f.amount);
    const bad = (name, msg) => { toastErr(msg); body.querySelector(`[name=${name}]`)?.classList.add('invalid'); };
    if ((f.kind === 'payroll' || f.kind === 'daily_wage') && !f.crew_id && !f.crew_name) return bad('crew_id', L('Επιλέξτε μέλος ομάδας', 'Choose a team member'));
    if (f.kind === 'payroll' && !f.for_month) return bad('for_month', L('Επιλέξτε μήνα', 'Choose a month'));
    if (f.kind === 'daily_wage' && !f.paid_until) return bad('paid_until', L('Συμπληρώστε μέχρι πότε είναι πληρωμένος', 'Fill in “paid until”'));
    if (f.kind === 'investment' && !f.description) return bad('description', L('Γράψτε περιγραφή', 'Enter a description'));
    if (f.kind === 'shop' && f.subcategory === 'misc' && !f.description) return bad('description', L('Γράψτε σημείωση', 'Enter a note'));
    if (!amount) return bad('amount', L('Γράψτε ποσό', 'Enter an amount'));
    busy(_btn, true);
    try {
      await saveExpense({ id: f.id, kind: f.kind, subcategory: f.subcategory || null, crew_id: f.crew_id || null, crew_name: f.crew_id ? null : f.crew_name || null, for_month: f.kind === 'payroll' ? f.for_month + '-01' : null, paid_until: f.kind === 'daily_wage' ? f.paid_until : null, days: f.kind === 'daily_wage' ? parseMoney(f.days) : null, amount, paid_on: f.paid_on || todayISO(), method: f.method, supplier: f.supplier, description: f.description, notes: f.notes });
      s.close();
      if (f.kind === 'daily_wage') { const w = wageStatus().find((w) => (f.crew_id && w.crew_id === f.crew_id) || (!f.crew_id && w.name.toLowerCase() === (f.crew_name || '').toLowerCase())); toast(L('Το μεροκάματο καταχωρήθηκε', 'Wage recorded'), { body: w ? wageLine(w) : '' , ms: 5000 }); }
      else toast(f.id ? L('Το έξοδο ενημερώθηκε', 'Expense updated') : L('Το έξοδο καταχωρήθηκε', 'Expense recorded'));
    } catch { busy(_btn, false); }
  });
}
void addDays; void catPill; void setTopActions;
