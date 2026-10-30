// =====================================================================
//  Μηνιαίο αντίγραφο ασφαλείας — υποχρεωτικό για τους διαχειριστές
//  Από την 1η κάθε μήνα, αν δεν έχει γίνει αντίγραφο μέσα στον μήνα,
//  κανένας διαχειριστής δεν συνεχίζει στην εφαρμογή μέχρι κάποιος
//  από αυτούς να κατεβάσει αντίγραφο.
// =====================================================================
import { L, esc, icon, toastErr, busy, monthName } from './core.js';
import { sb, S, isAdmin, reload } from './data.js';
import { exportAllXlsx, exportFullZip } from './backup.js';

const ENFORCE_FROM = '2026-11-01'; // η υποχρέωση ξεκινά από την 1η Νοεμβρίου 2026

const pad = (n) => String(n).padStart(2, '0');
const monthStart = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
const todayLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Τοπική ημερομηνία (Ελλάδα) του τελευταίου αντιγράφου, ή null */
function lastBackupDay() {
  const at = S.settings?.last_backup?.at;
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : todayLocal(d);
}

/** Χρειάζεται αντίγραφο αυτόν τον μήνα; (μόνο για διαχειριστές) */
export function backupDue() {
  if (!isAdmin()) return false;
  if (todayLocal() < ENFORCE_FROM) return false;
  const last = lastBackupDay();
  return !last || last < monthStart();
}

let open = null;

/** Εμφανίζει την οθόνη αντιγράφου. Επιστρέφει promise που κλείνει όταν γίνει (από οποιονδήποτε διαχειριστή). */
export function showBackupGate() {
  if (open) return open;
  open = new Promise((resolve) => {
    const d = new Date();
    const el = document.createElement('div');
    el.className = 'backup-gate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="box">
      <div class="bg-ic">${icon('archive')}</div>
      <h1>${esc(L('Μηνιαίο αντίγραφο ασφαλείας', 'Monthly backup'))}</h1>
      <p class="bg-month">${esc(monthName(d.getMonth()))} ${d.getFullYear()}</p>
      <p class="muted">${esc(L('Είναι αρχή του μήνα. Για να συνεχίσετε στην εφαρμογή, κατεβάστε ένα αντίγραφο ασφαλείας όλων των δεδομένων. Αρκεί να το κάνει ένας από τους διαχειριστές· μετά ανοίγει για όλους.', 'It’s the start of the month. To continue using the app, download a backup of all data. One admin is enough; then it unlocks for everyone.'))}</p>
      <div class="bg-actions">
        <button class="btn primary large" data-g="zip">${icon('archive')} ${esc(L('Πλήρες αντίγραφο (Excel + PDF)', 'Full backup (Excel + PDFs)'))}</button>
        <button class="btn large" data-g="xlsx">${icon('table')} ${esc(L('Μόνο Excel (πιο γρήγορο)', 'Excel only (faster)'))}</button>
      </div>
      <p class="small muted bg-tip">${esc(L('Φυλάξτε το αρχείο σε εξωτερικό δίσκο ή στο cloud (π.χ. Google Drive).', 'Keep the file on an external drive or in the cloud (e.g. Google Drive).'))}</p>
      <div class="bg-foot">
        <button class="btn plain small" data-g="check">${icon('refresh')} ${esc(L('Το έκανε ήδη άλλος διαχειριστής; Έλεγχος', 'Another admin already did it? Check'))}</button>
        <button class="btn plain small" data-g="out">${icon('logout')} ${esc(L('Αποσύνδεση', 'Sign out'))}</button>
      </div>
    </div>`;
    document.body.appendChild(el);
    document.body.classList.add('gate-open');
    let timer = null;
    const finish = () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
      el.classList.add('hide');
      setTimeout(() => el.remove(), 350);
      document.body.classList.remove('gate-open');
      open = null;
      resolve();
    };
    const check = async () => {
      try {
        const { data } = await sb.from('app_settings').select('value').eq('key', 'last_backup').maybeSingle();
        if (data?.value) S.settings.last_backup = data.value;
      } catch { /* εκτός σύνδεσης */ }
      if (!backupDue()) finish();
      return !backupDue();
    };
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    timer = setInterval(check, 20000); // άλλος διαχειριστής μπορεί να το κάνει στο μεταξύ
    el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', async () => {
      const g = b.dataset.g;
      if (g === 'out') { await sb.auth.signOut(); location.reload(); return; }
      busy(b, true);
      try {
        if (g === 'check') {
          if (!(await check())) toastErr(L('Δεν έχει γίνει ακόμη αντίγραφο αυτόν τον μήνα', 'No backup yet this month'));
          return;
        }
        if (g === 'zip') await exportFullZip();
        if (g === 'xlsx') await exportAllXlsx();
        await reload('app_settings');
        if (!backupDue()) finish();
        else toastErr(L('Το αντίγραφο κατέβηκε αλλά δεν καταγράφηκε', 'Backup downloaded but not recorded'), L('Ελέγξτε τη σύνδεση και δοκιμάστε ξανά.', 'Check your connection and try again.'));
      } catch (e) {
        console.error(e);
        toastErr(L('Το αντίγραφο δεν ολοκληρώθηκε', 'Backup not completed'), e.message);
      } finally { busy(b, false); }
    }));
  });
  return open;
}

/** Έλεγχος όσο η εφαρμογή μένει ανοιχτή (αλλαγή μήνα, επιστροφή στην εφαρμογή) */
export function watchBackupGate() {
  const tick = () => { if (backupDue()) showBackupGate(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  setInterval(tick, 10 * 60 * 1000);
}
