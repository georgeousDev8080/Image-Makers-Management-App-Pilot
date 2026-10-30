// =====================================================================
//  Κατάσταση Εργασιών / Workflow
//  Αντίγραφο του Excel μόνο για Κατάσταση Φωτογραφιών & Κατάσταση Video.
//  Ό,τι αλλάζει εδώ αλλάζει και στο Excel (και στο Mitsos για το video).
// =====================================================================
import { L, esc, icon, fmtDate, todayISO, daysBetween, matches, lbl, options, PHOTO_STATUS, EDIT_STATUS, WF_RULES, MONTHS_EL_UP, CHANNELS, sheet, toast, toastErr, confirmBox, copyText, smsUrl, mailUrl, waUrl, viberUrl, timeAgo, busy } from '../core.js';
import { S, allEventViews, eventView, patchEvent, logSentMessage, yearsAvailable, saveWfTemplate, deleteWfTemplate } from '../data.js';
import { pageHead, emptyState, setTopActions } from '../layout.js';
import { renderText } from './outbox.js';

const st = { year: null, q: '', filter: 'active' };

/** Πόσες ημέρες είναι το έργο στο τρέχον στάδιο και τι χρώμα παίρνει */
export function wfLevel(e, today = todayISO()) {
  const rule = WF_RULES[e.photo_status];
  if (!rule || e.status === 'cancelled') return { level: '', days: null };
  const changed = String(e.photo_status_at || e.updated_at || e.created_at || '').slice(0, 10) || e.event_date;
  const since = e.photo_status === 'samples_todo' ? (changed > e.event_date ? changed : e.event_date) : changed;
  const days = daysBetween(since, today);
  if (days < 0) return { level: '', days: null };
  return { level: days >= rule.late ? 'late' : days >= rule.warn ? 'warn' : '', days, rule };
}
export const wfLateCount = () => [...S.events.values()].filter((e) => wfLevel(e).level === 'late').length;

const monthUp = (iso) => (iso ? MONTHS_EL_UP[Number(iso.slice(5, 7)) - 1] : '');

export function renderWorkflow(root) {
  const years = yearsAvailable();
  if (!st.year) st.year = new Date().getFullYear();
  const today = todayISO();
  setTopActions(`<select class="select" id="wy" style="min-height:36px;padding:6px 34px 6px 12px;width:auto;font-weight:650">${years.map((y) => `<option ${y === st.year ? 'selected' : ''}>${y}</option>`).join('')}</select>`);
  const base = allEventViews({ year: st.year, includeCancelled: false });
  const withLvl = base.map((v) => ({ v, ...wfLevel(v.e, today) }));
  const f = {
    active: (r) => r.v.e.photo_status !== 'delivered',
    late: (r) => !!r.level,
    done: (r) => r.v.e.photo_status === 'delivered',
    all: () => true,
  };
  const count = (k) => withLvl.filter(f[k]).length;
  let rows = withLvl.filter(f[st.filter]).filter((r) => matches(st.q, r.v.title, r.v.e.church_location, fmtDate(r.v.e.event_date), lbl(PHOTO_STATUS, r.v.e.photo_status), lbl(EDIT_STATUS, r.v.e.editing_status)));
  const rank = { late: 0, warn: 1, '': 2 };
  rows.sort((a, b) => (st.filter === 'late' ? rank[a.level] - rank[b.level] : 0) || a.v.e.event_date.localeCompare(b.v.e.event_date));

  let html = pageHead(L('Κατάσταση Εργασιών', 'Work status'), { sub: esc(L('Φωτογραφίες και video κάθε εκδήλωσης. Ό,τι αλλάζετε εδώ αλλάζει αυτόματα και στο Excel και στο Mitsos.', 'Photos and video for every event. Changes here update the Excel and Mitsos automatically.')) });
  html += `<div class="sheet-toolbar"><div class="search">${icon('search')}<input class="input" id="wq" type="search" placeholder="${esc(L('Αναζήτηση…', 'Search…'))}" value="${esc(st.q)}"></div>
    <div class="chips">${[['active', L('Σε εξέλιξη', 'In progress')], ['late', L('Καθυστερήσεις', 'Delays')], ['done', L('Παραδόθηκαν', 'Delivered')], ['all', L('Όλες', 'All')]].map(([k, t]) => `<button class="chip ${st.filter === k ? 'on' : ''}" data-f="${k}">${esc(t)} <b>${count(k)}</b></button>`).join('')}</div>
    <span style="flex:1"></span><button class="btn small" data-tpl>${icon('message')} ${esc(L('Πρότυπα μηνυμάτων', 'Message templates'))}</button></div>`;
  if (!rows.length) html += emptyState('flow', st.filter === 'late' ? L('Καμία καθυστέρηση 🎉', 'No delays 🎉') : L('Δεν υπάρχουν εκδηλώσεις εδώ', 'No events here'), st.filter === 'active' ? L('Εδώ εμφανίζεται κάθε εκδήλωση από τη στιγμή που κλείνεται, μέχρι να παραδοθεί.', 'Every event appears here from the moment it is booked until it is delivered.') : '');
  else {
    html += `<div class="wf-table">
      <div class="wf-head"><span>${esc(L('Ημερομηνία', 'Date'))}</span><span>${esc(L('Μήνας', 'Month'))}</span><span>${esc(L('Όνομα', 'Name'))}</span><span>${esc(L('Τοποθεσία', 'Location'))}</span><span>${esc(L('Κατάσταση Φωτογραφιών', 'Photos status'))}</span><span>${esc(L('Κατάσταση Video', 'Video status'))}</span><span></span></div>
      ${rows.map(({ v, level, days, rule }) => {
        const sent = S.queue.filter((m) => m.event_id === v.e.id && m.status === 'sent').sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0];
        return `<div class="wf-row ${level}" data-id="${v.e.id}">
        <span class="wf-date"><b>${esc(fmtDate(v.e.event_date))}</b></span>
        <span class="wf-month">${esc(monthUp(v.e.event_date))}</span>
        <span class="wf-name"><a href="#/event/${v.e.id}">${esc(v.title)}</a></span>
        <span class="wf-loc">${esc(v.e.church_location || '—')}</span>
        <span class="wf-sel"><label class="wf-lbl">${esc(L('Φωτογραφίες', 'Photos'))}</label><select class="select" data-ph="${v.e.id}">${options(PHOTO_STATUS, v.e.photo_status)}</select>${days != null && rule ? `<small class="wf-days">${esc(L(`${days} ημ. σε αυτό το στάδιο`, `${days} days in this stage`))}${level ? ` · ${esc(level === 'late' ? L('καθυστέρηση', 'late') : L('προσοχή', 'attention'))}` : ''}</small>` : ''}</span>
        <span class="wf-sel"><label class="wf-lbl">Video</label><select class="select" data-ed="${v.e.id}">${options(EDIT_STATUS, v.e.editing_status)}</select></span>
        <span class="wf-act"><button class="btn small" data-mail="${v.e.id}" title="${esc(L('Μήνυμα στον πελάτη', 'Message the client'))}">${icon('mail')}<span class="hide-mobile"> ${esc(L('Μήνυμα', 'Message'))}</span></button>${sent ? `<small class="wf-sent" title="${esc(sent.title || '')}">✓ ${esc(timeAgo(sent.sent_at))}</small>` : ''}</span>
      </div>`;
      }).join('')}
    </div>
    <div class="legend"><span><i style="background:var(--wf-warn)"></i>${esc(L('Πορτοκαλί: αργεί να περάσει στο επόμενο στάδιο', 'Orange: slow to move to the next stage'))}</span><span><i style="background:var(--wf-late)"></i>${esc(L('Κόκκινο: μεγάλη καθυστέρηση', 'Red: long delay'))}</span><span>${esc(L('Τα χρώματα είναι μόνο προειδοποίηση· δεν αλλάζουν τίποτα.', 'Colours are warnings only; they change nothing.'))}</span></div>
    <div class="card pad mt small muted" style="line-height:1.7">${esc(L('Κανόνες: «Να γίνουν δείγματα» 25 / 35 ημέρες μετά την εκδήλωση · «Έλαβαν δείγματα και περιμένουμε» 20 / 35 ημέρες χωρίς να πάει στις «Αλλαγές» · «Αλλαγές» 20 / 30 ημέρες χωρίς να πάει για εκτύπωση · «Έτοιμα προς παραλαβή» 7 / 14 ημέρες (πορτοκαλί / κόκκινο).', 'Rules: “Samples to be made” 25 / 35 days after the event · “Client has samples” 20 / 35 days without moving to “Changes” · “Changes” 20 / 30 days without going to print · “Ready for pickup” 7 / 14 days (orange / red).'))}</div>`;
  }
  root.innerHTML = html;
  document.getElementById('wy')?.addEventListener('change', (e) => { st.year = Number(e.target.value); renderWorkflow(root); });
  const wq = root.querySelector('#wq');
  wq.addEventListener('input', () => { st.q = wq.value; const p = wq.selectionStart; renderWorkflow(root); const n = document.getElementById('wq'); n?.focus(); n?.setSelectionRange(p, p); });
  root.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.f; renderWorkflow(root); }));
  root.querySelector('[data-tpl]').addEventListener('click', () => openTemplates());
  root.querySelectorAll('[data-ph]').forEach((sel) => sel.addEventListener('change', async () => {
    const id = sel.dataset.ph; const before = S.events.get(id).editing_status;
    sel.disabled = true;
    try {
      const u = await patchEvent(id, { photo_status: sel.value });
      if (u.editing_status !== before) toast(L('Το video έγινε «Να γίνει» αυτόματα', 'Video auto-set to “To do”'), { type: 'info' });
      else toast(L('Αποθηκεύτηκε', 'Saved'), { ms: 1200 });
    } catch { sel.value = S.events.get(id).photo_status; } finally { sel.disabled = false; }
  }));
  root.querySelectorAll('[data-ed]').forEach((sel) => sel.addEventListener('change', async () => {
    sel.disabled = true;
    try { await patchEvent(sel.dataset.ed, { editing_status: sel.value }); toast(L('Αποθηκεύτηκε', 'Saved'), { ms: 1200 }); } catch { sel.value = S.events.get(sel.dataset.ed).editing_status; } finally { sel.disabled = false; }
  }));
  root.querySelectorAll('[data-mail]').forEach((b) => b.addEventListener('click', () => pickMessage(b.dataset.mail)));
}

// ---------------------------------------------------------------------
//  Μήνυμα προς πελάτη ανάλογα με το στάδιο
// ---------------------------------------------------------------------
function pickMessage(eventId) {
  const v = eventView(eventId);
  if (!v) return;
  const stage = v.e.photo_status;
  const tpls = S.wfTemplates.filter((t) => t.enabled);
  const forStage = tpls.filter((t) => t.stage === stage);
  const others = tpls.filter((t) => t.stage !== stage);
  const history = S.queue.filter((m) => m.event_id === eventId && m.status === 'sent').sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));
  const item = (t) => `<button class="row" data-t="${t.id}"><div class="main-col"><div class="t">${esc(t.name)}</div><div class="s">${esc(renderText(t.body, v).slice(0, 110))}…</div></div>${icon('chevR', 'chev')}</button>`;
  const body = `<div class="card pad" style="background:var(--fill-2);box-shadow:none"><b>${esc(v.title)}</b><div class="small muted">${esc(fmtDate(v.e.event_date))} · ${esc(lbl(PHOTO_STATUS, stage))}</div></div>
    <div class="group-label">${esc(L('Προτεινόμενα για αυτό το στάδιο', 'Suggested for this stage'))}</div>
    ${forStage.length ? `<div class="list">${forStage.map(item).join('')}</div>` : `<div class="card pad small muted">${esc(L('Δεν υπάρχει πρότυπο για αυτό το στάδιο.', 'No template for this stage.'))}</div>`}
    ${others.length ? `<div class="group-label">${esc(L('Άλλα μηνύματα', 'Other messages'))}</div><div class="list">${others.map(item).join('')}</div>` : ''}
    ${history.length ? `<div class="group-label">${esc(L('Έχουν σταλεί', 'Already sent'))}</div><div class="list">${history.slice(0, 10).map((m) => `<div class="row"><div class="main-col"><div class="t">${esc(m.title || S.templates.find((t) => t.id === m.template_id)?.name || L('Μήνυμα', 'Message'))}</div><div class="s">${esc(m.sent_at ? new Date(m.sent_at).toLocaleString('el-GR') : '')}</div></div><span class="pill green">✓</span></div>`).join('')}</div>` : ''}`;
  const s = sheet({ title: L('Μήνυμα προς πελάτη', 'Message to client'), body });
  s.body.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { s.close(); compose(v, S.wfTemplates.find((t) => t.id === b.dataset.t)); }));
}

function compose(v, t) {
  const f = { to_email: v.c?.email1 || v.c?.email2 || '', to_phone: v.c?.phone1 || v.c?.phone2 || '', subject: renderText(t.subject || 'Image Makers', v), body: renderText(t.body, v) };
  const body = `<div class="form">
    <div class="form-grid"><div class="field"><label>Email</label><input class="input" name="to_email" type="email" value="${esc(f.to_email)}"></div><div class="field"><label>${esc(L('Κινητό', 'Mobile'))}</label><input class="input" name="to_phone" type="tel" value="${esc(f.to_phone)}"></div></div>
    <div class="field"><label>${esc(L('Θέμα', 'Subject'))}</label><input class="input" name="subject" value="${esc(f.subject)}"></div>
    <div class="field"><label>${esc(L('Κείμενο (μπορείτε να το αλλάξετε)', 'Text (you can edit it)'))}</label><textarea class="textarea" name="body" style="min-height:170px">${esc(f.body)}</textarea></div>
    <div class="grid cols-2" style="gap:8px">
      <button class="btn primary" data-send="email">${icon('mail')} Email</button>
      <button class="btn" data-send="sms">${icon('sms')} SMS</button>
      <button class="btn" data-send="viber">${icon('message')} Viber</button>
      <button class="btn" data-send="whatsapp">${icon('message')} WhatsApp</button>
    </div>
    <div class="help">${esc(L('Μετά την αποστολή θα σας ρωτήσουμε αν στάλθηκε, για να καταγραφεί στο «Μηνύματα προς πελάτες → Ιστορικό».', 'After sending we will ask whether it was sent, so it is recorded in “Messages to clients → History”.'))}</div>
  </div>`;
  const s = sheet({ title: t.name, body, wide: true });
  const read = () => s.body.querySelectorAll('[name]').forEach((i) => { f[i.name] = i.value; });
  s.body.querySelectorAll('[data-send]').forEach((b) => b.addEventListener('click', async () => {
    read();
    const how = b.dataset.send;
    if (how === 'email') { if (!f.to_email) return toastErr(L('Λείπει email', 'Email missing')); window.location.href = mailUrl(f.to_email, f.subject, f.body); }
    if (how === 'sms' || how === 'whatsapp') { if (!f.to_phone) return toastErr(L('Λείπει κινητό', 'Mobile missing')); window.location.href = how === 'sms' ? smsUrl(f.to_phone, f.body) : waUrl(f.to_phone, f.body); }
    if (how === 'viber') { await copyText(f.body); window.location.href = viberUrl(f.body); }
    setTimeout(async () => {
      if (await confirmBox(L('Στάλθηκε το μήνυμα;', 'Was the message sent?'), L('Αν ναι, καταγράφεται στο ιστορικό μηνυμάτων.', 'If yes, it is recorded in the message history.'), { ok: L('Ναι, στάλθηκε', 'Yes, sent'), cancel: L('Όχι ακόμη', 'Not yet') })) {
        try { await logSentMessage({ eventId: v.e.id, title: t.name, channels: [how], toPhone: f.to_phone, toEmail: f.to_email, subject: f.subject, body: f.body }); s.close(); toast(L('Καταγράφηκε στο ιστορικό', 'Recorded in history')); } catch {}
      }
    }, 900);
  }));
}

// ---------------------------------------------------------------------
//  Πρότυπα μηνυμάτων workflow
// ---------------------------------------------------------------------
export function openTemplates() {
  const stages = [{ v: 'any', el: 'Οποιοδήποτε στάδιο', en: 'Any stage' }, ...PHOTO_STATUS];
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `<p class="small muted">${esc(L('Αυτά τα μηνύματα τα στέλνετε εσείς με το κουμπί «Μήνυμα» σε κάθε γραμμή. Η εφαρμογή προτείνει όσα ταιριάζουν στην κατάσταση των φωτογραφιών.', 'You send these with the “Message” button on each row. The app suggests the ones that match the photo status.'))}</p>
      ${stages.map((sg) => { const list = S.wfTemplates.filter((t) => t.stage === sg.v); return list.length ? `<div class="group-label">${esc(L(sg.el, sg.en))}</div><div class="list">${list.map((t) => `<button class="row" data-e="${t.id}"><div class="main-col"><div class="t">${esc(t.name)}${t.enabled ? '' : ` <span class="pill">${esc(L('ανενεργό', 'off'))}</span>`}</div><div class="s">${esc(t.body.slice(0, 90))}…</div></div>${icon('chevR', 'chev')}</button>`).join('')}</div>` : ''; }).join('')}
      <button class="btn primary mt" data-new>${icon('plus')} ${esc(L('Νέο πρότυπο', 'New template'))}</button>`;
    body.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => editTemplate(S.wfTemplates.find((t) => t.id === b.dataset.e), draw)));
    body.querySelector('[data-new]').addEventListener('click', () => editTemplate(null, draw));
  };
  draw();
  sheet({ title: L('Πρότυπα μηνυμάτων workflow', 'Workflow message templates'), body, wide: true });
}

function editTemplate(t, after) {
  const f = t ? { ...t, channels: [...(t.channels || [])] } : { name: '', stage: 'any', channels: ['email', 'sms'], subject: 'Image Makers', body: L('Αγαπητοί {couple}, ', 'Dear {couple}, '), enabled: true, sort: 100 };
  const stages = [{ v: 'any', el: 'Οποιοδήποτε στάδιο', en: 'Any stage' }, ...PHOTO_STATUS];
  const body = `<div class="form">
    <div class="field"><label>${esc(L('Όνομα', 'Name'))} <span class="req">*</span></label><input class="input" name="name" value="${esc(f.name)}"></div>
    <div class="field"><label>${esc(L('Προτείνεται όταν οι φωτογραφίες είναι σε', 'Suggested when photos are at'))}</label><select class="select" name="stage">${options(stages, f.stage)}</select></div>
    <label class="check-row"><span class="switch"><input type="checkbox" name="enabled" ${f.enabled ? 'checked' : ''}><span></span></span><span>${esc(L('Ενεργό', 'Active'))}</span></label>
    <div class="field"><label>${esc(L('Θέμα email', 'Email subject'))}</label><input class="input" name="subject" value="${esc(f.subject || '')}"></div>
    <div class="field"><label>${esc(L('Κείμενο', 'Text'))} <span class="req">*</span></label><textarea class="textarea" name="body" style="min-height:150px">${esc(f.body)}</textarea><div class="help">${esc(L('Αυτόματα πεδία: {couple} ζευγάρι · {date} ημερομηνία · {church} εκκλησία · {balance} υπόλοιπο · {business_phone} τηλέφωνο.', 'Auto fields: {couple} · {date} · {church} · {balance} · {business_phone}.'))}</div></div>
    ${t ? `<button type="button" class="btn danger" data-del>${icon('trash')} ${esc(L('Διαγραφή', 'Delete'))}</button>` : ''}
  </div>`;
  const s = sheet({ title: t ? L('Επεξεργασία προτύπου', 'Edit template') : L('Νέο πρότυπο', 'New template'), body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (e) => {
    const _btn = e.currentTarget;
    s.body.querySelectorAll('[name]').forEach((i) => { f[i.name] = i.type === 'checkbox' ? i.checked : i.value; });
    if (!f.name.trim() || !f.body.trim()) return toastErr(L('Συμπληρώστε όνομα και κείμενο', 'Fill in name and text'));
    busy(_btn, true);
    try { await saveWfTemplate(f); s.close(); toast(L('Αποθηκεύτηκε', 'Saved')); after?.(); } catch { busy(_btn, false); }
  });
  s.body.querySelector('[data-del]')?.addEventListener('click', async () => { if (!await confirmBox(L('Διαγραφή προτύπου;', 'Delete template?'), f.name, { ok: L('Διαγραφή', 'Delete'), destructive: true })) return; await deleteWfTemplate(t.id); s.close(); after?.(); });
}
void CHANNELS;
