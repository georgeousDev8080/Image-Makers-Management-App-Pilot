// =====================================================================
//  Αυτοματοποιημένα μηνύματα προς πελάτες (ουρά & πρότυπα)
// =====================================================================
import { L, esc, icon, money, fmtDate, fmtTime, timeAgo, todayISO, daysBetween, lbl, opt, CATEGORIES, TRIGGERS, CHANNELS, METHODS, smsUrl, mailUrl, waUrl, viberUrl, copyText, sheet, toast, toastErr, confirmBox, segmented, initSegmented, busy } from '../core.js';
import { S, eventView, coupleName, updateQueue, saveTemplate, deleteTemplate, runAutomations, business, profileName, allEventViews } from '../data.js';
import { pageHead, emptyState, setTopActions, go } from '../layout.js';

const st = { tab: 'pending' };
const PH = () => [
  ['{couple}', L('Ζευγάρι (μικρά ονόματα)', 'Couple (first names)')], ['{name1}', L('Όνομα 1', 'Name 1')], ['{name2}', L('Όνομα 2', 'Name 2')],
  ['{date}', L('Ημερομηνία', 'Date')], ['{time}', L('Ώρα', 'Time')], ['{church}', L('Εκκλησία', 'Church')], ['{reception}', L('Δεξίωση', 'Reception')],
  ['{days_left}', L('Ημέρες που μένουν', 'Days left')], ['{package_price}', L('Αξία πακέτου', 'Package value')], ['{paid_total}', L('Σύνολο πληρωμών', 'Total paid')],
  ['{balance}', L('Υπόλοιπο', 'Balance')], ['{due_now}', L('Ποσό προς τακτοποίηση', 'Amount due')], ['{threshold}', L('Ποσοστό %', 'Percent %')],
  ['{amount}', L('Ποσό πληρωμής', 'Payment amount')], ['{payment_label}', L('Τύπος πληρωμής', 'Payment type')], ['{payment_date}', L('Ημ. πληρωμής', 'Payment date')], ['{payment_method}', L('Τρόπος πληρωμής', 'Payment method')],
  ['{business_phone}', L('Τηλέφωνο επιχείρησης', 'Business phone')],
];

/** Ίδια λογική με τη βάση — για προεπισκόπηση */
export function renderText(text, v, p, threshold) {
  if (!v) return text || '';
  const first = (s) => String(s || '').trim().split(/\s+/)[0];
  const price = v.price, paid = v.paid;
  const m = (x) => money(x);
  const map = {
    '{couple}': [first(v.c?.name1), first(v.c?.name2)].filter(Boolean).join(' & '), '{name1}': v.c?.name1 || '', '{name2}': v.c?.name2 || '',
    '{date}': fmtDate(v.e.event_date), '{time}': fmtTime(v.e.event_time) || '—', '{church}': v.e.church_location || '—', '{house}': v.e.house_location || '—', '{reception}': v.e.reception_location || '—',
    '{category}': lbl(CATEGORIES, v.e.category), '{package_price}': m(price), '{paid_total}': m(paid), '{balance}': m(Math.max(0, (price || 0) - paid)),
    '{due_now}': m(Math.max(0, (price || 0) * (threshold ?? 80) / 100 - paid)), '{threshold}': String(threshold ?? 80), '{days_left}': String(Math.max(0, daysBetween(todayISO(), v.e.event_date))),
    '{amount}': m(p?.amount ?? 500), '{payment_label}': p?.label || L('1η Δόση', 'Installment 1'), '{payment_date}': fmtDate(p?.paid_on || todayISO()), '{payment_method}': (lbl(METHODS, p?.method || 'cash')).toLowerCase(),
    '{business_phone}': business().phone, '{business_email}': business().email, '{business}': business().name,
  };
  return Object.entries(map).reduce((s, [k, val]) => s.split(k).join(val), text || '');
}

export function renderOutbox(root, params = {}) {
  if (params.id && params.id !== '_') { const m = S.queue.find((q) => q.id === params.id); if (m) { st.tab = m.status === 'pending' ? 'pending' : 'sent'; setTimeout(() => openMessage(m), 50); history.replaceState(null, '', '#/outbox'); } }
  setTopActions(`<button class="btn small" data-run title="${esc(L('Έλεγχος αυτοματισμών τώρα', 'Check automations now'))}">${icon('refresh')} <span class="hide-mobile">${esc(L('Έλεγχος τώρα', 'Check now'))}</span></button>`);
  const pending = S.queue.filter((m) => m.status === 'pending');
  const done = S.queue.filter((m) => m.status !== 'pending');
  let html = pageHead(L('Μηνύματα προς πελάτες', 'Messages to clients'), { sub: esc(L('Η εφαρμογή ετοιμάζει τα μηνύματα και σας ειδοποιεί. Εσείς πατάτε «Αποστολή».', 'The app prepares the messages and notifies you. You tap “Send”.')) });
  html += `<div class="mb">${segmented('t', [{ v: 'pending', label: L(`Προς αποστολή (${pending.length})`, `To send (${pending.length})`) }, { v: 'sent', label: L('Ιστορικό', 'History') }, { v: 'templates', label: L('Πρότυπα', 'Templates') }], st.tab)}</div>`;
  if (st.tab === 'templates') html += templatesHTML();
  else {
    const list = st.tab === 'pending' ? pending : done;
    html += list.length ? `<div class="list">${list.map((m) => {
      const v = eventView(m.event_id); const t = S.templates.find((x) => x.id === m.template_id);
      return `<button class="row has-icon" data-m="${m.id}"><span class="row-icon" style="background:${m.status === 'pending' ? 'var(--accent)' : m.status === 'sent' ? 'var(--green)' : 'var(--label-3)'}">${icon(m.status === 'sent' ? 'check' : 'message')}</span>
        <div class="main-col"><div class="t">${esc(t?.name || m.title || L('Μήνυμα', 'Message'))} · ${esc(v ? v.title : '—')}</div><div class="s">${esc(m.body.slice(0, 110))}…</div></div>
        <div class="v tiny">${esc(timeAgo(m.status === 'pending' ? m.due_at : m.sent_at || m.created_at))}</div>${icon('chevR', 'chev')}</button>`;
    }).join('')}</div>` : emptyState('message', st.tab === 'pending' ? L('Όλα τα μηνύματα έχουν σταλεί 🎉', 'All messages sent 🎉') : L('Κανένα μήνυμα ακόμη', 'No messages yet'), st.tab === 'pending' ? L('Νέα μηνύματα εμφανίζονται αυτόματα με βάση τα πρότυπα.', 'New messages appear automatically from the templates.') : '');
  }
  root.innerHTML = html;
  initSegmented(root, (_, v) => { st.tab = v; renderOutbox(root); });
  document.querySelector('[data-run]')?.addEventListener('click', async (e) => { const _btn = e.currentTarget; busy(_btn, true); try { await runAutomations(); toast(L('Ο έλεγχος ολοκληρώθηκε', 'Check complete')); } finally { busy(_btn, false); } });
  root.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => openMessage(S.queue.find((m) => m.id === b.dataset.m))));
  root.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => openTemplate(S.templates.find((t) => t.id === b.dataset.t))));
  root.querySelector('[data-newt]')?.addEventListener('click', () => openTemplate(null));
  root.querySelectorAll('[data-toggle]').forEach((cb) => cb.addEventListener('change', async (e) => { e.stopPropagation(); const t = S.templates.find((x) => x.id === cb.dataset.toggle); await saveTemplate({ ...t, enabled: cb.checked }); toast(cb.checked ? L('Ενεργοποιήθηκε', 'Enabled') : L('Απενεργοποιήθηκε', 'Disabled'), { ms: 1500 }); }));
  root.querySelectorAll('.switch').forEach((sw) => sw.addEventListener('click', (e) => e.stopPropagation()));
}

function templatesHTML() {
  const ts = [...S.templates].sort((a, b) => TRIGGERS.findIndex((x) => x.v === a.trigger_type) - TRIGGERS.findIndex((x) => x.v === b.trigger_type));
  const when = (t) => {
    if (t.trigger_type === 'before_event') return L(`${t.offset_days} ημέρες πριν, ${t.send_hour}:00`, `${t.offset_days} days before, ${t.send_hour}:00`);
    if (t.trigger_type === 'after_event') return L(`${t.offset_days} ημέρ. μετά, ${t.send_hour}:00`, `${t.offset_days} days after, ${t.send_hour}:00`);
    if (t.trigger_type === 'unpaid_after_event') return L(`${t.offset_days} ημέρ. μετά, αν έχει πληρωθεί < ${t.threshold_pct}%`, `${t.offset_days} days after, if paid < ${t.threshold_pct}%`);
    return lbl(TRIGGERS, t.trigger_type);
  };
  return `<div class="list">${ts.map((t) => `<div class="row tap" data-t="${t.id}"><div class="main-col"><div class="t">${esc(t.name)}</div><div class="s">${esc(when(t))} · ${esc((t.channels || []).map((c) => lbl(CHANNELS, c)).join(', '))} · ${esc(t.recipients?.length ? t.recipients.map((id) => profileName(S.profiles.find((p) => p.id === id)).split(' ')[0]).join(', ') : L('όλοι οι διαχειριστές', 'all admins'))}</div></div>
    <label class="switch"><input type="checkbox" data-toggle="${t.id}" ${t.enabled ? 'checked' : ''}><span></span></label></div>`).join('')}</div>
    <button class="btn primary mt" data-newt>${icon('plus')} ${esc(L('Νέο πρότυπο', 'New template'))}</button>
    <div class="banner mt">${icon('help')}<div><b>${esc(L('Πώς λειτουργεί', 'How it works'))}</b><span>${esc(L('Τη σωστή στιγμή (π.χ. 10 ημέρες πριν) η εφαρμογή ετοιμάζει το κείμενο με τα στοιχεία του ζευγαριού και στέλνει ειδοποίηση στους διαχειριστές που έχετε ορίσει. Ανοίγετε το μήνυμα και πατάτε SMS, Email ή WhatsApp — χωρίς χρεώσεις.', 'At the right time (e.g. 10 days before) the app prepares the text with the couple’s details and notifies the admins you chose. Open it and tap SMS, Email or WhatsApp — no charges.'))}</span></div></div>`;
}

function openMessage(m) {
  if (!m) return;
  const v = eventView(m.event_id);
  const t = S.templates.find((x) => x.id === m.template_id);
  const f = { body: m.body, subject: m.subject || '', to_phone: m.to_phone || v?.c?.phone1 || '', to_email: m.to_email || v?.c?.email1 || '' };
  const ch = t?.channels?.length ? t.channels : ['sms', 'email'];
  const body = `<div class="form">
    <div class="card" style="background:var(--fill-2);box-shadow:none"><div class="row"><div class="main-col"><div class="t">${esc(v ? v.title : '—')}</div><div class="s">${esc(t?.name || m.title || '')} · ${v ? esc(fmtDate(v.e.event_date)) : ''}</div></div>${v ? `<a class="btn small" href="#/event/${v.e.id}" data-close>${esc(L('Εκδήλωση', 'Event'))}</a>` : ''}</div></div>
    <div class="form-grid"><div class="field"><label>${esc(L('Κινητό', 'Mobile'))}</label><input class="input" name="to_phone" type="tel" value="${esc(f.to_phone)}"></div><div class="field"><label>Email</label><input class="input" name="to_email" type="email" value="${esc(f.to_email)}"></div></div>
    ${ch.includes('email') ? `<div class="field"><label>${esc(L('Θέμα email', 'Email subject'))}</label><input class="input" name="subject" value="${esc(f.subject)}"></div>` : ''}
    <div class="field"><label>${esc(L('Κείμενο (μπορείτε να το αλλάξετε)', 'Text (you can edit it)'))}</label><textarea class="textarea" name="body" style="min-height:170px">${esc(f.body)}</textarea></div>
    <div class="grid cols-2" style="gap:8px">
      ${ch.includes('sms') ? `<button class="btn primary" data-send="sms">${icon('sms')} SMS</button>` : ''}
      ${ch.includes('email') ? `<button class="btn primary" data-send="email">${icon('mail')} Email</button>` : ''}
      ${ch.includes('whatsapp') ? `<button class="btn" data-send="whatsapp">${icon('message')} WhatsApp</button>` : ''}
      ${ch.includes('viber') ? `<button class="btn" data-send="viber">${icon('message')} Viber</button>` : ''}
      <button class="btn" data-send="copy">${icon('copy')} ${esc(L('Αντιγραφή κειμένου', 'Copy text'))}</button>
    </div>
    ${m.status === 'sent' ? `<div class="banner green">${icon('checkCircle')}<div><b>${esc(L('Στάλθηκε', 'Sent'))}</b><span>${esc(m.sent_at ? new Date(m.sent_at).toLocaleString('el-GR') : '')} · ${esc(profileName(S.profiles.find((p) => p.id === m.sent_by)))}</span></div></div>` : ''}
  </div>`;
  const foot = m.status === 'pending' ? `<button class="btn" data-dismiss>${esc(L('Παράλειψη', 'Skip'))}</button><button class="btn success" data-done>${icon('check')} ${esc(L('Στάλθηκε', 'Mark as sent'))}</button>` : `<button class="btn" data-reopen>${icon('refresh')} ${esc(L('Επαναφορά σε «Προς αποστολή»', 'Back to “To send”'))}</button>`;
  const s = sheet({ title: L('Μήνυμα προς πελάτη', 'Message to client'), body, foot });
  const read = () => { s.body.querySelectorAll('[name]').forEach((i) => { f[i.name] = i.value; }); };
  const persist = async () => { read(); if (f.body !== m.body || f.subject !== (m.subject || '') || f.to_phone !== (m.to_phone || '') || f.to_email !== (m.to_email || '')) { Object.assign(m, await updateQueue(m.id, { body: f.body, subject: f.subject, to_phone: f.to_phone, to_email: f.to_email })); } };
  s.body.querySelectorAll('[name]').forEach((i) => i.addEventListener('change', () => persist().catch(() => {})));
  s.body.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', async () => {
    read();
    const how = b.dataset.send;
    if (how === 'copy') { await copyText(f.body); toast(L('Το κείμενο αντιγράφηκε', 'Text copied')); }
    else if (how === 'sms' || how === 'whatsapp') { if (!f.to_phone) return toastErr(L('Λείπει κινητό', 'Mobile missing')); window.location.href = how === 'sms' ? smsUrl(f.to_phone, f.body) : waUrl(f.to_phone, f.body); }
    else if (how === 'email') { if (!f.to_email) return toastErr(L('Λείπει email', 'Email missing')); window.location.href = mailUrl(f.to_email, f.subject, f.body); }
    else if (how === 'viber') { await copyText(f.body); window.location.href = viberUrl(f.body); }
    await persist().catch(() => {});
    if (m.status === 'pending') setTimeout(async () => {
      if (await confirmBox(L('Στάλθηκε το μήνυμα;', 'Was the message sent?'), L('Αν ναι, θα μετακινηθεί στο ιστορικό.', 'If yes, it moves to history.'), { ok: L('Ναι, στάλθηκε', 'Yes, sent'), cancel: L('Όχι ακόμη', 'Not yet') })) {
        await updateQueue(m.id, { status: 'sent', sent_at: new Date().toISOString(), sent_by: S.profile.id }); s.close(); toast(L('Σημειώθηκε ως απεσταλμένο', 'Marked as sent'));
      }
    }, 900);
  }));
  s.root.querySelector('[data-done]')?.addEventListener('click', async () => { await persist().catch(() => {}); await updateQueue(m.id, { status: 'sent', sent_at: new Date().toISOString(), sent_by: S.profile.id }); s.close(); toast(L('Σημειώθηκε ως απεσταλμένο', 'Marked as sent')); });
  s.root.querySelector('[data-dismiss]')?.addEventListener('click', async () => { if (!await confirmBox(L('Παράλειψη μηνύματος;', 'Skip this message?'), L('Δεν θα σταλεί.', 'It will not be sent.'))) return; await updateQueue(m.id, { status: 'dismissed', sent_by: S.profile.id }); s.close(); });
  s.root.querySelector('[data-reopen]')?.addEventListener('click', async () => { await updateQueue(m.id, { status: 'pending', sent_at: null }); s.close(); });
}

function openTemplate(t) {
  const admins = S.profiles.filter((p) => ['admin_photo', 'admin_video'].includes(p.role) && p.active);
  const f = t ? { ...t, categories: [...(t.categories || [])], channels: [...(t.channels || [])], recipients: [...(t.recipients || [])] }
    : { name: '', trigger_type: 'before_event', offset_days: 7, send_hour: 11, threshold_pct: 80, categories: [], channels: ['sms', 'email'], recipients: [], subject: 'Image Makers', body: L('Αγαπητοί {couple}, ', 'Dear {couple}, '), enabled: true };
  const sample = allEventViews().filter((v) => v.c).sort((a, b) => Math.abs(daysBetween(todayISO(), a.e.event_date)) - Math.abs(daysBetween(todayISO(), b.e.event_date)))[0];
  const body = document.createElement('div');
  let lastField = null;
  const draw = () => {
    const needsOffset = ['before_event', 'after_event', 'unpaid_after_event'].includes(f.trigger_type);
    body.innerHTML = `<div class="form">
      <div class="field"><label>${esc(L('Όνομα προτύπου', 'Template name'))} <span class="req">*</span></label><input class="input" name="name" value="${esc(f.name)}"></div>
      <label class="check-row"><span class="switch"><input type="checkbox" name="enabled" ${f.enabled ? 'checked' : ''}><span></span></span><span>${esc(L('Ενεργό', 'Active'))}</span></label>
      <div class="field"><label>${esc(L('Πότε ετοιμάζεται', 'When it is prepared'))}</label><select class="select" name="trigger_type">${TRIGGERS.map((x) => `<option value="${x.v}" ${f.trigger_type === x.v ? 'selected' : ''}>${esc(L(x.el, x.en))}</option>`).join('')}</select></div>
      ${needsOffset ? `<div class="form-grid">
        <div class="field"><label>${esc(f.trigger_type === 'before_event' ? L('Ημέρες πριν', 'Days before') : L('Ημέρες μετά', 'Days after'))}</label><input class="input" name="offset_days" type="number" min="0" max="365" value="${esc(f.offset_days)}"></div>
        <div class="field"><label>${esc(L('Ώρα (0–23)', 'Hour (0–23)'))}</label><input class="input" name="send_hour" type="number" min="0" max="23" value="${esc(f.send_hour)}"></div>
        ${f.trigger_type === 'unpaid_after_event' ? `<div class="field full"><label>${esc(L('Ποσοστό που πρέπει να έχει εξοφληθεί (%)', 'Percent that must be paid (%)'))}</label><input class="input" name="threshold_pct" type="number" min="1" max="100" value="${esc(f.threshold_pct ?? 80)}"><div class="help">${esc(L('Π.χ. 80 = 40% κράτηση + 40% ημέρα γάμου.', 'E.g. 80 = 40% booking + 40% wedding day.'))}</div></div>` : ''}
      </div>` : ''}
      <div class="field"><label>${esc(L('Για ποιες κατηγορίες (κανένα = όλες)', 'For which categories (none = all)'))}</label><div class="chips">${CATEGORIES.map((c) => `<button type="button" class="chip ${f.categories.includes(c.v) ? 'on' : ''}" data-arr="categories" data-v="${c.v}">${esc(L(c.el, c.en).replace(' (Promotional)', ''))}</button>`).join('')}</div></div>
      <div class="field"><label>${esc(L('Τρόποι αποστολής', 'Send via'))}</label><div class="chips">${CHANNELS.map((c) => `<button type="button" class="chip ${f.channels.includes(c.v) ? 'on' : ''}" data-arr="channels" data-v="${c.v}">${esc(c.el)}</button>`).join('')}</div></div>
      <div class="field"><label>${esc(L('Ποιος ειδοποιείται (κανένας = όλοι οι διαχειριστές)', 'Who gets notified (none = all admins)'))}</label><div class="chips">${admins.map((p) => `<button type="button" class="chip ${f.recipients.includes(p.id) ? 'on' : ''}" data-arr="recipients" data-v="${p.id}">${esc(profileName(p))}</button>`).join('')}</div></div>
      <div class="field"><label>${esc(L('Θέμα (για email)', 'Subject (for email)'))}</label><input class="input" name="subject" value="${esc(f.subject || '')}"></div>
      <div class="field"><label>${esc(L('Κείμενο μηνύματος', 'Message text'))} <span class="req">*</span></label><textarea class="textarea" name="body" style="min-height:150px">${esc(f.body)}</textarea>
        <div class="help">${esc(L('Πατήστε για να προσθέσετε στοιχεία που συμπληρώνονται αυτόματα:', 'Tap to insert details that fill in automatically:'))}</div>
        <div class="chips" style="margin-top:4px">${PH().map(([k, l]) => `<button type="button" class="chip" data-ph="${k}" title="${esc(k)}">${esc(l)}</button>`).join('')}</div></div>
      <div class="group-label" style="margin-left:0">${esc(L('Προεπισκόπηση', 'Preview'))}${sample ? ' · ' + esc(sample.title) : ''}</div>
      <div class="card pad" id="prev" style="white-space:pre-wrap;background:var(--fill-2);box-shadow:none"></div>
      ${t ? `<button type="button" class="btn danger" data-del>${icon('trash')} ${esc(L('Διαγραφή προτύπου', 'Delete template'))}</button>` : ''}
    </div>`;
    const prev = () => { body.querySelector('#prev').textContent = sample ? renderText(f.body, sample, null, Number(f.threshold_pct)) : L('Δεν υπάρχει εκδήλωση για προεπισκόπηση.', 'No event to preview.'); };
    prev();
    body.querySelectorAll('[name]').forEach((i) => {
      i.addEventListener('focus', () => { if (i.name === 'body' || i.name === 'subject') lastField = i; });
      i.addEventListener(i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input', () => { f[i.name] = i.type === 'checkbox' ? i.checked : i.value; if (i.name === 'trigger_type') draw(); else prev(); });
    });
    body.querySelectorAll('[data-arr]').forEach((b) => b.addEventListener('click', () => { const a = f[b.dataset.arr]; const i = a.indexOf(b.dataset.v); if (i >= 0) a.splice(i, 1); else a.push(b.dataset.v); b.classList.toggle('on'); }));
    body.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => {
      const ta = lastField || body.querySelector('[name=body]');
      const pos = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, pos) + b.dataset.ph + ta.value.slice(ta.selectionEnd ?? pos);
      f[ta.name] = ta.value; ta.focus(); ta.setSelectionRange(pos + b.dataset.ph.length, pos + b.dataset.ph.length); prev();
    }));
    body.querySelector('[data-del]')?.addEventListener('click', async () => { if (!await confirmBox(L('Διαγραφή προτύπου;', 'Delete template?'), f.name, { ok: L('Διαγραφή', 'Delete'), destructive: true })) return; await deleteTemplate(t.id); s.close(); toast(L('Διαγράφηκε', 'Deleted')); });
  };
  draw();
  const s = sheet({ title: t ? L('Επεξεργασία προτύπου', 'Edit template') : L('Νέο πρότυπο', 'New template'), body, wide: true, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (e) => { const _btn = e.currentTarget;
    if (!f.name || !f.body) { toastErr(L('Συμπληρώστε όνομα και κείμενο', 'Fill in name and text')); return; }
    if (!f.channels.length) { toastErr(L('Επιλέξτε τουλάχιστον έναν τρόπο αποστολής', 'Choose at least one channel')); return; }
    busy(_btn, true);
    try { await saveTemplate(f); s.close(); toast(L('Το πρότυπο αποθηκεύτηκε', 'Template saved')); } catch { busy(_btn, false); }
  });
}
void opt; void coupleName; void go;
