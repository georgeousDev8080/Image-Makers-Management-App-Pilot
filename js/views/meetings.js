// =====================================================================
//  Meetings — ημερομηνία, ώρα, τοποθεσία, άτομα, λόγοι
//  Οι έτοιμοι λόγοι (app_settings.meeting_reasons) αλλάζουν από εδώ.
//  Οι συμμετέχοντες ειδοποιούνται αυτόματα (trigger στη βάση).
// =====================================================================
import { L, esc, icon, sheet, toast, toastErr, busy, confirmBox, actionSheet, infoBox, todayISO, fmtDate, fmtDateLong, fmtTime, normTime, timeInputAttrs } from '../core.js';
import { S, isAdmin, profileName, saveMeeting, deleteMeeting, saveSetting, absencesOn, absenceWhen } from '../data.js';
import { dateTile, avatar } from '../components.js';

const DEFAULT_REASONS = ['Προγραμματισμός εβδομάδας', 'Ενημέρωση για εκδήλωση', 'Αξιολόγηση / feedback', 'Εκπαίδευση / εξοπλισμός', 'Οργάνωση μοντάζ & παραδόσεων', 'Οικονομικά'];
export const meetingReasons = () => (Array.isArray(S.settings.meeting_reasons) ? S.settings.meeting_reasons : DEFAULT_REASONS);
const people = () => S.profiles.filter((p) => p.role && p.active).sort((a, b) => profileName(a).localeCompare(profileName(b)));
const prof = (id) => S.profiles.find((p) => p.id === id) || (id === S.profile?.id ? S.profile : null);
const first = (id) => (profileName(prof(id)) || '').split(' ')[0];

export const meetingTitle = (m) => ['Meeting', m.location].filter(Boolean).join(' · ');
export const meetingTip = (m) => [`Meeting ${fmtTime(m.start_time)}`, m.location, (m.reasons || []).join(', '), (m.participants || []).map(first).join(', ')].filter(Boolean).join(' · ');
export const isMine = (m) => (m.participants || []).includes(S.profile?.id);

/** Επεξεργασία της λίστας με τους έτοιμους λόγους */
function openReasonsEditor(onDone) {
  let list = [...meetingReasons()];
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `<p class="small muted">${esc(L('Αυτοί οι λόγοι εμφανίζονται έτοιμοι σε κάθε νέο meeting. Αλλάξτε το κείμενο, αφαιρέστε ή προσθέστε όσους θέλετε.', 'These reasons appear ready in every new meeting. Change the text, remove or add as many as you like.'))}</p>
      <div class="list mt-s">${list.map((r, i) => `<div class="row reason-row"><input class="input" data-i="${i}" maxlength="80" value="${esc(r)}"><button class="icon-btn" data-del="${i}" aria-label="${esc(L('Αφαίρεση', 'Remove'))}">${icon('trash')}</button></div>`).join('') || `<div class="row muted small">${esc(L('Δεν υπάρχουν λόγοι.', 'No reasons.'))}</div>`}</div>
      <div class="input-wrap mt"><input class="input" id="newReason" maxlength="80" placeholder="${esc(L('Νέος λόγος…', 'New reason…'))}"><button class="btn small act" data-add>${icon('plus')} ${esc(L('Προσθήκη', 'Add'))}</button></div>`;
    body.querySelectorAll('[data-i]').forEach((i) => i.addEventListener('input', () => { list[+i.dataset.i] = i.value; }));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { list.splice(+b.dataset.del, 1); draw(); }));
    const add = () => { const v = body.querySelector('#newReason').value.trim(); if (!v) return; list.push(v); draw(); body.querySelector('#newReason').focus(); };
    body.querySelector('[data-add]').addEventListener('click', add);
    body.querySelector('#newReason').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  };
  draw();
  const s = sheet({ title: L('Λόγοι meeting', 'Meeting reasons'), body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => {
    const pending = body.querySelector('#newReason').value.trim(); if (pending) list.push(pending);
    const clean = [...new Set(list.map((x) => x.trim()).filter(Boolean))];
    busy(ev.currentTarget, true);
    try { await saveSetting('meeting_reasons', clean); toast(L('Οι λόγοι αποθηκεύτηκαν', 'Reasons saved')); s.close(); onDone?.(clean); } catch (e) { console.error(e); busy(ev.currentTarget, false); }
  });
}

/** Νέο / επεξεργασία meeting */
export function openMeetingSheet({ day = '', meeting = null } = {}) {
  if (!isAdmin()) return;
  const f = meeting ? { ...meeting, start_time: String(meeting.start_time).slice(0, 5), reasons: [...(meeting.reasons || [])], participants: [...(meeting.participants || [])] }
    : { day: day || todayISO(), start_time: '', location: '', notes: '', reasons: [], participants: S.profile?.id ? [S.profile.id] : [] };
  const body = document.createElement('div');
  const draw = () => {
    const ppl = people();
    const ready = meetingReasons();
    const extra = f.reasons.filter((r) => !ready.includes(r)); // λόγοι που δεν είναι πια στη λίστα ή γράφτηκαν μόνο για αυτό το meeting
    body.innerHTML = `<div class="form">
      <div class="form-grid">
        <div class="field"><label>${esc(L('Ημερομηνία', 'Date'))} <span class="req">*</span></label><input class="input" type="date" name="day" value="${esc(f.day)}"></div>
        <div class="field"><label>${esc(L('Ώρα', 'Time'))} <span class="req">*</span></label><input class="input" name="start_time" ${timeInputAttrs} value="${esc(f.start_time)}" placeholder="${esc(L('π.χ. 11:00', 'e.g. 11:00'))}"></div>
      </div>
      <div class="field"><label>${esc(L('Τοποθεσία', 'Location'))}</label><input class="input" name="location" maxlength="300" value="${esc(f.location || '')}" placeholder="${esc(L('π.χ. Studio, online (Zoom)…', 'e.g. Studio, online (Zoom)…'))}"></div>
      <div class="field"><label class="spread"><span>${esc(L('Ποιους αφορά', 'Who it concerns'))} <span class="req">*</span> <span class="muted">(${f.participants.length})</span></span></label>
        <div class="chips mb-s">
          <button type="button" class="chip" data-grp="all">${esc(L('Όλοι', 'Everyone'))}</button>
          <button type="button" class="chip" data-grp="admin">${esc(L('Διαχειριστές', 'Admins'))}</button>
          <button type="button" class="chip" data-grp="photo">${esc(L('Φωτογράφοι', 'Photographers'))}</button>
          <button type="button" class="chip" data-grp="video">${esc(L('Βιντεογράφοι', 'Videographers'))}</button>
          <button type="button" class="chip" data-grp="none">${esc(L('Κανένας', 'None'))}</button>
        </div>
        <div class="people-pick">${ppl.map((p) => {
          const ab = f.day ? absenceWhen(absencesOn(p.id, f.day)) : '';
          return `<button type="button" class="pp ${f.participants.includes(p.id) ? 'on' : ''}" data-p="${p.id}">${avatar(p, 'sm')}<span>${esc(profileName(p))}${ab ? `<small class="unavail">🚫 ${esc(ab)}</small>` : ''}</span>${f.participants.includes(p.id) ? icon('check', 'pp-ck') : ''}</button>`;
        }).join('')}</div></div>
      <div class="field"><label class="spread"><span>${esc(L('Λόγοι του meeting', 'Meeting reasons'))} <span class="req">*</span></span><button type="button" class="btn plain small" data-editreasons>${icon('edit')} ${esc(L('Επεξεργασία λόγων', 'Edit reasons'))}</button></label>
        <div class="chips">${[...ready, ...extra].map((r) => `<button type="button" class="chip ${f.reasons.includes(r) ? 'on' : ''}" data-r="${esc(r)}">${f.reasons.includes(r) ? '✓ ' : ''}${esc(r)}</button>`).join('')}</div>
        <div class="input-wrap mt-s"><input class="input" id="oneReason" maxlength="80" placeholder="${esc(L('Άλλος λόγος (μόνο για αυτό το meeting)', 'Other reason (this meeting only)'))}"><button type="button" class="btn small act" data-addone>${icon('plus')}</button></div>
      </div>
      <div class="field"><label>${esc(L('Σημειώσεις (προαιρετικά)', 'Notes (optional)'))}</label><textarea class="textarea" name="notes" style="min-height:60px">${esc(f.notes || '')}</textarea></div>
      <div class="small muted">${icon('bell')} ${esc(L('Μόλις αποθηκευτεί, όσοι το αφορά παίρνουν ειδοποίηση.', 'Once saved, everyone it concerns gets a notification.'))}</div>
    </div>`;
    body.querySelectorAll('[name]').forEach((i) => i.addEventListener('input', () => { f[i.name] = i.value; i.classList.remove('invalid'); if (i.name === 'day') draw(); }));
    body.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.p; f.participants = f.participants.includes(id) ? f.participants.filter((x) => x !== id) : [...f.participants, id]; draw(); }));
    body.querySelectorAll('[data-grp]').forEach((b) => b.addEventListener('click', () => {
      const g = b.dataset.grp; const ids = people().filter((p) => g === 'all' || (g === 'admin' && p.role.startsWith('admin')) || (g === 'photo' && /photo/.test(p.role)) || (g === 'video' && /video/.test(p.role))).map((p) => p.id);
      f.participants = g === 'none' ? [] : g === 'all' ? ids : [...new Set([...f.participants, ...ids])]; draw();
    }));
    body.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { const r = b.dataset.r; f.reasons = f.reasons.includes(r) ? f.reasons.filter((x) => x !== r) : [...f.reasons, r]; draw(); }));
    const addOne = () => { const v = body.querySelector('#oneReason').value.trim(); if (!v) return; if (!f.reasons.includes(v)) f.reasons.push(v); draw(); };
    body.querySelector('[data-addone]').addEventListener('click', addOne);
    body.querySelector('#oneReason').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addOne(); } });
    body.querySelector('[data-editreasons]').addEventListener('click', () => openReasonsEditor(() => draw()));
  };
  draw();
  const s = sheet({ title: meeting ? L('Επεξεργασία meeting', 'Edit meeting') : '👥 Meeting', body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    const t = normTime(f.start_time);
    const errs = [];
    if (!f.day) { body.querySelector('[name=day]').classList.add('invalid'); errs.push(L('ημερομηνία', 'date')); }
    if (!t) { body.querySelector('[name=start_time]').classList.add('invalid'); errs.push(L('ώρα (ΩΩ:ΛΛ)', 'time (HH:MM)')); }
    if (!f.participants.length) errs.push(L('τουλάχιστον ένα άτομο', 'at least one person'));
    if (!f.reasons.length) errs.push(L('τουλάχιστον έναν λόγο', 'at least one reason'));
    if (errs.length) return toastErr(L('Λείπουν στοιχεία', 'Missing details'), errs.join(' · '));
    busy(btn, true);
    try {
      await saveMeeting({ id: meeting?.id, day: f.day, start_time: t, location: f.location, notes: f.notes, reasons: f.reasons, participants: f.participants });
      const others = f.participants.filter((x) => x !== S.profile?.id).length;
      toast(meeting ? L('Το meeting ενημερώθηκε', 'Meeting updated') : L('Το meeting δημιουργήθηκε', 'Meeting created'), { body: `${fmtDate(f.day)} ${t}${others ? ` · ${L(`ειδοποιήθηκαν ${others} άτομα`, `${others} people notified`)}` : ''}` });
      s.close();
    } catch (e) { console.error(e); busy(btn, false); }
  });
}

function detailsText(m) {
  return [
    `${fmtDateLong(m.day)} · ${fmtTime(m.start_time)}${m.location ? ` · ${m.location}` : ''}`,
    `${L('Λόγοι', 'Reasons')}: ${(m.reasons || []).join(', ')}`,
    `${L('Άτομα', 'People')}: ${(m.participants || []).map((id) => profileName(prof(id))).join(', ')}`,
    m.notes ? `${L('Σημειώσεις', 'Notes')}: ${m.notes}` : '',
  ].filter(Boolean).join('\n');
}

export async function meetingActions(m) {
  if (!m) return;
  if (!isAdmin()) { infoBox('👥 Meeting', detailsText(m)); return; }
  const r = await actionSheet({ title: `Meeting · ${fmtDateLong(m.day)} · ${fmtTime(m.start_time)}${m.location ? ' · ' + m.location : ''} · ${(m.reasons || []).join(', ')}`, actions: [
    { label: L('Λεπτομέρειες', 'Details'), value: 'info', icon: 'users' },
    { label: L('Επεξεργασία', 'Edit'), value: 'edit', icon: 'edit' },
    { label: L('Ακύρωση meeting (ειδοποιούνται όλοι)', 'Cancel meeting (everyone is notified)'), value: 'del', icon: 'trash', destructive: true },
  ] });
  if (r === 'info') infoBox('👥 Meeting', detailsText(m));
  if (r === 'edit') openMeetingSheet({ meeting: m });
  if (r === 'del') {
    if (!await confirmBox(L('Ακύρωση meeting;', 'Cancel meeting?'), L('Θα ειδοποιηθούν όσοι συμμετέχουν.', 'Participants will be notified.'), { ok: L('Ακύρωση meeting', 'Cancel meeting'), destructive: true })) return;
    try { await deleteMeeting(m.id); toast(L('Το meeting ακυρώθηκε', 'Meeting cancelled')); } catch (e) { console.error(e); }
  }
}

/** Γραμμή λίστας (Αρχική) */
export function meetingRow(m) {
  const av = (m.participants || []).map((id) => avatar(prof(id), 'sm')).join('');
  return `<button type="button" class="row event-card meet-row" data-meeting="${m.id}" style="width:100%;text-align:left">
    ${dateTile(m.day, 'meet')}
    <div class="main-col">
      <div class="t ev-big">👥 ${esc(meetingTitle(m))}</div>
      <div class="ev-when">${icon('clock')} ${esc(fmtTime(m.start_time))}</div>
      <div class="s">${esc((m.reasons || []).join(', '))}</div>
      ${av ? `<div class="hstack" style="margin-top:5px;gap:6px"><span class="avatars">${av}</span></div>` : ''}
    </div>
    ${icon('chevR', 'chev')}
  </button>`;
}
