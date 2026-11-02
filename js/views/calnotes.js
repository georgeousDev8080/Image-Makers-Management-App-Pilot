// =====================================================================
//  «Άλλο» στο ημερολόγιο — ελεύθερη καταχώρηση
//  Υποχρεωτικός μόνο ο τίτλος · προαιρετικά ώρα, τοποθεσία, σημειώσεις
// =====================================================================
import { L, esc, icon, sheet, toast, toastErr, busy, confirmBox, actionSheet, infoBox, todayISO, fmtDate, fmtDateLong, fmtTime, normTime, timeInputAttrs } from '../core.js';
import { S, isAdmin, saveCalNote, deleteCalNote } from '../data.js';

export const calNoteTitle = (n) => [n.title, n.location].filter(Boolean).join(' · ');
export const calNoteTip = (n) => [n.title, n.start_time ? fmtTime(n.start_time) : '', n.location, n.notes].filter(Boolean).join(' · ');

export function openCalNoteSheet({ day = '', note = null } = {}) {
  if (!isAdmin()) return;
  const f = note ? { ...note, start_time: note.start_time ? String(note.start_time).slice(0, 5) : '' }
    : { day: day || todayISO(), start_time: '', title: '', location: '', notes: '', team_visible: true };
  const body = document.createElement('div');
  body.innerHTML = `<div class="form">
    <div class="field"><label>${esc(L('Τίτλος', 'Title'))} <span class="req">*</span></label><input class="input" name="title" maxlength="200" value="${esc(f.title)}" placeholder="${esc(L('π.χ. Συνάντηση ομάδας, Παραλαβή άλμπουμ', 'e.g. Team meeting, Album pickup'))}"></div>
    <div class="form-grid">
      <div class="field"><label>${esc(L('Ημερομηνία', 'Date'))}</label><input class="input" type="date" name="day" value="${esc(f.day)}"></div>
      <div class="field"><label>${esc(L('Ώρα (προαιρετικά)', 'Time (optional)'))}</label><input class="input" name="start_time" ${timeInputAttrs} value="${esc(f.start_time)}" placeholder="${esc(L('π.χ. 10:00', 'e.g. 10:00'))}"></div>
    </div>
    <div class="field"><label>${esc(L('Τοποθεσία (προαιρετικά)', 'Location (optional)'))}</label><input class="input" name="location" maxlength="300" value="${esc(f.location || '')}"></div>
    <div class="field"><label>${esc(L('Σημειώσεις (προαιρετικά)', 'Notes (optional)'))}</label><textarea class="textarea" name="notes" style="min-height:70px">${esc(f.notes || '')}</textarea></div>
    <label class="check-row"><span class="switch"><input type="checkbox" name="team_visible" ${f.team_visible !== false ? 'checked' : ''}><span></span></span><span>${esc(L('Να το βλέπει όλη η ομάδα (αλλιώς μόνο οι διαχειριστές)', 'Visible to the whole team (otherwise admins only)'))}</span></label>
  </div>`;
  body.querySelectorAll('[name]').forEach((i) => i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', () => { f[i.name] = i.type === 'checkbox' ? i.checked : i.value; i.classList.remove('invalid'); }));
  const s = sheet({ title: note ? L('Επεξεργασία', 'Edit') : `📌 ${L('Άλλο', 'Other')}`, body, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>` });
  s.root.querySelector('[data-save]').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    if (!String(f.title || '').trim()) { body.querySelector('[name=title]').classList.add('invalid'); return toastErr(L('Γράψτε τίτλο', 'Enter a title')); }
    if (!f.day) f.day = todayISO();
    let t = null;
    if (String(f.start_time || '').trim()) { t = normTime(f.start_time); if (!t) { body.querySelector('[name=start_time]').classList.add('invalid'); return toastErr(L('Γράψτε την ώρα ως ΩΩ:ΛΛ', 'Enter the time as HH:MM')); } }
    busy(btn, true);
    try {
      await saveCalNote({ id: note?.id, day: f.day, start_time: t, title: f.title, location: f.location, notes: f.notes, team_visible: f.team_visible !== false });
      toast(note ? L('Οι αλλαγές αποθηκεύτηκαν', 'Changes saved') : L('Προστέθηκε στο ημερολόγιο', 'Added to the calendar'), { body: `${f.title.trim()} · ${fmtDate(f.day)}${t ? ' ' + t : ''}` });
      s.close();
    } catch (e) { console.error(e); busy(btn, false); }
  });
}

export async function calNoteActions(n) {
  if (!n) return;
  const head = `${n.title} · ${fmtDateLong(n.day)}${n.start_time ? ' · ' + fmtTime(n.start_time) : ''}`;
  if (!isAdmin()) { infoBox(head, [n.location, n.notes].filter(Boolean).join('\n')); return; }
  const r = await actionSheet({ title: [head, n.location, n.notes].filter(Boolean).join(' · '), actions: [
    { label: L('Επεξεργασία', 'Edit'), value: 'edit', icon: 'edit' },
    { label: L('Διαγραφή', 'Delete'), value: 'del', icon: 'trash', destructive: true },
  ] });
  if (r === 'edit') openCalNoteSheet({ note: n });
  if (r === 'del') {
    if (!await confirmBox(L('Διαγραφή;', 'Delete?'), head, { ok: L('Διαγραφή', 'Delete'), destructive: true })) return;
    try { await deleteCalNote(n.id); toast(L('Διαγράφηκε', 'Deleted')); } catch (e) { console.error(e); }
  }
}
void S; void icon;
