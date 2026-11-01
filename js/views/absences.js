// =====================================================================
//  Δηλώσεις απουσίας (μη διαθεσιμότητα)
//  Διαχειριστές: για οποιοδήποτε μέλος · Μέλη: μόνο για τον εαυτό τους
// =====================================================================
import { L, esc, icon, sheet, toast, toastErr, busy, confirmBox, actionSheet, todayISO, addDays, fmtDate, fmtDateLong, normTime, timeInputAttrs } from '../core.js';
import { S, isAdmin, profileName, saveAbsences, deleteAbsence, absenceWhen } from '../data.js';

const canEdit = (a) => isAdmin() || a.user_id === S.profile?.id;
const who = (id) => profileName(S.profiles.find((p) => p.id === id) || (id === S.profile?.id ? S.profile : null));
export const absenceText = (a) => `${who(a.user_id)} · ${absenceWhen([a])}${a.note ? ` · ${a.note}` : ''}`;

/** Ενέργειες σε μια απουσία (διαγραφή, αν επιτρέπεται) */
export async function absenceActions(a) {
  if (!a) return;
  if (!canEdit(a)) { toast(absenceText(a), { type: 'info' }); return; }
  const r = await actionSheet({ title: `${fmtDateLong(a.day)} · ${absenceText(a)}`, actions: [{ label: L('Διαγραφή απουσίας', 'Delete absence'), value: 'del', icon: 'trash', destructive: true }] });
  if (r !== 'del') return;
  if (!await confirmBox(L('Διαγραφή απουσίας;', 'Delete absence?'), `${fmtDate(a.day)} · ${absenceText(a)}`, { ok: L('Διαγραφή', 'Delete'), destructive: true })) return;
  try { await deleteAbsence(a.id); toast(L('Η απουσία διαγράφηκε', 'Absence deleted')); } catch (e) { console.error(e); }
}

/** Φόρμα δήλωσης απουσίας */
export function openAbsenceSheet({ day = todayISO(), userId = null } = {}) {
  const admin = isAdmin();
  const people = admin ? S.profiles.filter((p) => p.role && p.active).sort((a, b) => profileName(a).localeCompare(profileName(b))) : [S.profile];
  const f = { user_id: userId || S.profile?.id, from: day < todayISO() ? todayISO() : day, to: '', allDay: true, start: '', end: '', note: '' };
  const body = document.createElement('div');
  const upcoming = () => S.absences.filter((a) => a.day >= todayISO() && (admin || a.user_id === S.profile?.id))
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.start_time || '').localeCompare(String(b.start_time || ''))).slice(0, 40);
  const draw = () => {
    body.innerHTML = `<div class="form">
      ${admin ? `<div class="field"><label>${esc(L('Ποιος δεν θα είναι διαθέσιμος', 'Who will be unavailable'))}</label><select class="select" name="user_id">${people.map((p) => `<option value="${p.id}" ${p.id === f.user_id ? 'selected' : ''}>${esc(profileName(p))}</option>`).join('')}</select></div>`
        : `<div class="small muted">${esc(L('Η δήλωση γίνεται για εσάς και ενημερώνονται οι διαχειριστές.', 'This is declared for you and the admins are notified.'))}</div>`}
      <div class="form-grid">
        <div class="field"><label>${esc(L('Ημερομηνία', 'Date'))}</label><input class="input" type="date" name="from" value="${esc(f.from)}" min="${todayISO()}"></div>
        <div class="field"><label>${esc(L('Έως (προαιρετικά, για πολλές μέρες)', 'Until (optional, for several days)'))}</label><input class="input" type="date" name="to" value="${esc(f.to)}" min="${esc(f.from)}"></div>
      </div>
      <label class="check-row"><span class="switch"><input type="checkbox" name="allDay" ${f.allDay ? 'checked' : ''}><span></span></span><span>${esc(L('Όλη την ημέρα', 'All day'))}</span></label>
      ${f.allDay ? '' : `<div class="form-grid">
        <div class="field"><label>${esc(L('Από ώρα', 'From'))}</label><input class="input" name="start" ${timeInputAttrs} value="${esc(f.start)}"></div>
        <div class="field"><label>${esc(L('Έως ώρα', 'To'))}</label><input class="input" name="end" ${timeInputAttrs} value="${esc(f.end)}"></div>
      </div>`}
      <div class="field"><label>${esc(L('Σημείωση (προαιρετικά)', 'Note (optional)'))}</label><input class="input" name="note" maxlength="300" value="${esc(f.note)}" placeholder="${esc(L('π.χ. ταξίδι, άλλη υποχρέωση', 'e.g. travel, other commitment'))}"></div>
    </div>
    <div class="section-title"><h2>${esc(admin ? L('Επόμενες απουσίες', 'Upcoming absences') : L('Οι απουσίες μου', 'My absences'))}</h2></div>
    <div class="list">${upcoming().map((a) => `<button class="row" data-abs="${a.id}"><div class="main-col"><div class="t">${esc(fmtDateLong(a.day))}</div><div class="s">${esc(absenceText(a))}</div></div>${canEdit(a) ? icon('trash', 'chev') : ''}</button>`).join('') || `<div class="row muted small">${esc(L('Δεν υπάρχουν δηλωμένες απουσίες.', 'No absences declared.'))}</div>`}</div>`;
    body.querySelectorAll('[name]').forEach((i) => i.addEventListener(i.type === 'checkbox' || i.tagName === 'SELECT' ? 'change' : 'input', () => {
      if (i.type === 'checkbox') { f[i.name] = i.checked; draw(); return; }
      f[i.name] = i.value;
      if (i.name === 'from' && f.to && f.to < f.from) { f.to = ''; draw(); }
    }));
    body.querySelectorAll('[data-abs]').forEach((b) => b.addEventListener('click', async () => { await absenceActions(S.absences.find((a) => a.id === b.dataset.abs)); draw(); }));
  };
  draw();
  const s = sheet({ title: L('Δήλωση απουσίας', 'Declare absence'), body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!f.from) return toastErr(L('Επιλέξτε ημερομηνία', 'Choose a date'));
    const to = f.to && f.to >= f.from ? f.to : f.from;
    let start = null, end = null;
    if (!f.allDay) {
      start = normTime(f.start); end = normTime(f.end);
      if (!start || !end) return toastErr(L('Γράψτε τις ώρες ως ΩΩ:ΛΛ', 'Enter the times as HH:MM'), L('π.χ. 10:00 έως 14:00', 'e.g. 10:00 to 14:00'));
      if (end <= start) return toastErr(L('Η ώρα λήξης πρέπει να είναι μετά την έναρξη', 'End time must be after start'));
    }
    const rows = [];
    for (let d = f.from; d <= to && rows.length < 62; d = addDays(d, 1)) rows.push({ user_id: f.user_id, day: d, start_time: start, end_time: end, note: f.note.trim() || null });
    busy(btn, true);
    try {
      await saveAbsences(rows);
      toast(L('Η απουσία δηλώθηκε', 'Absence declared'), { body: rows.length > 1 ? L(`${rows.length} ημέρες`, `${rows.length} days`) : `${fmtDate(f.from)} · ${absenceWhen(rows)}` });
      s.close();
    } catch (e) { console.error(e); busy(btn, false); }
  });
}
