// =====================================================================
//  Ρυθμίσεις
// =====================================================================
import { L, LANG, esc, icon, setLang, getThemePref, setThemePref, segmented, initSegmented, toast, toastErr, confirmBox, infoBox, busy, isIOS, isStandalone, colorFor, initials, lbl, ROLES, timeAgo } from '../core.js';
import { sb, S, isAdmin, profileName, saveSetting, business, reload, friendlyError, emit } from '../data.js';
import { pageHead } from '../layout.js';
import { pushState, enablePush, disablePushHere, sendTest, setupServerPush, serverStatus, checkFunction, deviceName } from '../push.js';
import { verifyPinPrompt, showNewPin, lockAfterMinutes, TERMS_ENABLED } from './auth.js';
import { exportAllXlsx, exportFullZip, importBackup, importOldSheet } from '../backup.js';

export const APP_VERSION = '1.0.0';
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });

const COLORS = ['#a96f45', '#2f86d6', '#8e5bd6', '#1a9f8b', '#d4564a', '#c98a1a', '#5a6fd6', '#3c9a5f', '#c2557d', '#6b7b8c'];

export function renderSettings(root) {
  const p = S.profile;
  const admin = isAdmin();
  const b = business();
  const cr = S.settings.crew_reminder || { enabled: true, days_before: 1, hour: 18 };
  let html = pageHead(L('Ρυθμίσεις', 'Settings'));
  html += `<div class="list"><div class="row"><span class="avatar lg" style="--c:${p.color || colorFor(p.id)}">${esc(initials(profileName(p)))}</span><div class="main-col"><div class="t" style="font-size:19px">${esc(profileName(p))}</div><div class="s">@${esc(p.username)} · ${esc(p.email)}</div><div class="s">${esc(lbl(ROLES, p.role))}</div></div></div></div>`;

  html += `<div class="group-label">${esc(L('Προφίλ', 'Profile'))}</div><div class="card pad"><div class="form-grid">
    <div class="field"><label>${esc(L('Ονοματεπώνυμο', 'Full name'))}</label><input class="input" id="pf_name" value="${esc(p.full_name)}"></div>
    <div class="field"><label>${esc(L('Κινητό', 'Mobile'))}</label><input class="input" id="pf_phone" type="tel" value="${esc(p.phone || '')}"></div>
    <div class="field full"><label>${esc(L('Χρώμα', 'Color'))}</label><div class="chips">${COLORS.map((c) => `<button class="chip" data-color="${c}" style="background:${c};width:34px;padding:0;${(p.color || colorFor(p.id)) === c ? 'box-shadow:0 0 0 3px var(--bg),0 0 0 5px ' + c : ''}" aria-label="${c}"></button>`).join('')}</div></div>
  </div><button class="btn primary mt" id="pf_save">${esc(L('Αποθήκευση προφίλ', 'Save profile'))}</button></div>`;

  html += `<div class="group-label">${esc(L('Εμφάνιση & γλώσσα', 'Appearance & language'))}</div><div class="card pad stack">
    <div class="field"><label>${esc(L('Θέμα', 'Theme'))}</label>${segmented('theme', [{ v: 'auto', label: L('Αυτόματο', 'Auto') }, { v: 'light', label: L('Φωτεινό', 'Light') }, { v: 'dark', label: L('Σκούρο', 'Dark') }], getThemePref(), { block: true })}</div>
    <div class="field"><label>${esc(L('Γλώσσα', 'Language'))}</label>${segmented('lang', [{ v: 'el', label: 'Ελληνικά' }, { v: 'en', label: 'English' }], LANG, { block: true })}</div>
  </div>`;

  html += `<div class="group-label">${esc(L('Ειδοποιήσεις σε αυτή τη συσκευή', 'Notifications on this device'))} · ${esc(deviceName())}</div><div class="card pad" id="pushBox"><div class="skeleton" style="height:22px"></div></div>
    <div class="group-foot">${esc(L('Κάθε συσκευή (κινητό, tablet, υπολογιστής) ενεργοποιείται ξεχωριστά.', 'Each device (phone, tablet, computer) is turned on separately.'))}</div>`;

  html += `<div class="group-label">${esc(L('Ασφάλεια', 'Security'))}</div><div class="list">
    <button class="row has-icon" id="chpin"><span class="row-icon">${icon('key')}</span><div class="main-col"><div class="t">${esc(L('Αλλαγή PIN', 'Change PIN'))}</div></div>${icon('chevR', 'chev')}</button>
    <div class="row has-icon"><span class="row-icon" style="background:var(--blue)">${icon('lock')}</span><div class="main-col"><div class="t">${esc(L('Κλείδωμα με PIN όταν η εφαρμογή μένει στο παρασκήνιο', 'Lock with PIN when the app is in the background'))}</div><div class="mt-s">${segmented('lock', [{ v: '0', label: L('Αμέσως', 'Instantly') }, { v: '5', label: '5′' }, { v: '30', label: '30′' }, { v: '100000', label: L('Μόνο στο άνοιγμα', 'Only on open') }], String(lockAfterMinutes()))}</div></div></div>
  </div>`;

  if (admin) {
    html += `<div class="group-label">${esc(L('Ειδοποιήσεις push για όλη την ομάδα (ρύθμιση μία φορά)', 'Push for the whole team (one-time setup)'))}</div><div class="card pad" id="srvBox"><div class="skeleton" style="height:22px"></div></div>`;
    html += `<div class="group-label">${esc(L('Στοιχεία επιχείρησης', 'Business details'))}</div><div class="card pad"><div class="form-grid">
      <div class="field"><label>${esc(L('Επωνυμία', 'Name'))}</label><input class="input" data-b="name" value="${esc(b.name)}"></div>
      <div class="field"><label>${esc(L('Τηλέφωνο', 'Phone'))}</label><input class="input" data-b="phone" value="${esc(b.phone)}"></div>
      <div class="field"><label>Email</label><input class="input" data-b="email" value="${esc(b.email)}"></div>
      <div class="field"><label>${esc(L('Διεύθυνση', 'Address'))}</label><input class="input" data-b="address" value="${esc(b.address)}"></div>
      <div class="field full"><label>Website</label><input class="input" data-b="website" value="${esc(b.website)}"></div>
    </div><div class="help mt-s">${esc(L('Χρησιμοποιούνται στα αυτόματα μηνύματα (π.χ. {business_phone}).', 'Used in automated messages (e.g. {business_phone}).'))}</div><button class="btn primary mt" id="b_save">${esc(L('Αποθήκευση', 'Save'))}</button></div>`;
    html += `<div class="group-label">${esc(L('Υπενθύμιση συνεργείου', 'Crew reminder'))}</div><div class="card pad">
      <label class="check-row"><span class="switch"><input type="checkbox" id="cr_on" ${cr.enabled ? 'checked' : ''}><span></span></span><span>${esc(L('Ειδοποίηση στο συνεργείο πριν από κάθε εκδήλωση', 'Notify the crew before each event'))}</span></label>
      <div class="form-grid"><div class="field"><label>${esc(L('Ημέρες πριν', 'Days before'))}</label><input class="input" id="cr_days" type="number" min="0" max="14" value="${esc(cr.days_before)}"></div><div class="field"><label>${esc(L('Ώρα', 'Hour'))}</label><input class="input" id="cr_hour" type="number" min="0" max="23" value="${esc(cr.hour)}"></div></div>
      <button class="btn primary mt" id="cr_save">${esc(L('Αποθήκευση', 'Save'))}</button></div>`;
    html += `<div class="group-label">${esc(L('Αντίγραφα ασφαλείας & εισαγωγή', 'Backups & import'))}</div><div class="list">
      <button class="row has-icon" data-bk="xlsx"><span class="row-icon" style="background:var(--green)">${icon('table')}</span><div class="main-col"><div class="t">${esc(L('Εξαγωγή όλων σε Excel', 'Export everything to Excel'))}</div><div class="s">${esc(L('Ένα αρχείο .xlsx, αναγνώσιμο από άνθρωπο', 'One human-readable .xlsx file'))}</div></div>${icon('download', 'chev')}</button>
      <button class="row has-icon" data-bk="zip"><span class="row-icon" style="background:var(--blue)">${icon('archive')}</span><div class="main-col"><div class="t">${esc(L('Πλήρες αντίγραφο (Excel + PDF προσφορών)', 'Full backup (Excel + offer PDFs)'))}</div><div class="s">${esc(L('Αρχείο .zip για εξωτερικό δίσκο', '.zip file for an external drive'))}</div></div>${icon('download', 'chev')}</button>
      <button class="row has-icon" data-bk="restore"><span class="row-icon" style="background:var(--orange)">${icon('upload')}</span><div class="main-col"><div class="t">${esc(L('Επαναφορά από αντίγραφο', 'Restore from backup'))}</div><div class="s">${esc(L('.xlsx ή .zip που κατεβάσατε από εδώ', '.xlsx or .zip downloaded from here'))}</div></div>${icon('chevR', 'chev')}</button>
      <button class="row has-icon" data-bk="old"><span class="row-icon" style="background:var(--purple)">${icon('sparkles')}</span><div class="main-col"><div class="t">${esc(L('Εισαγωγή από το παλιό Google Sheet', 'Import from the old Google Sheet'))}</div><div class="s">${esc(L('Αρχείο → Λήψη → Microsoft Excel (.xlsx)', 'File → Download → Microsoft Excel (.xlsx)'))}</div></div>${icon('chevR', 'chev')}</button>
    </div><div class="group-foot">${esc(L('Συμβουλή: κατεβάζετε ένα πλήρες αντίγραφο κάθε μήνα σε εξωτερικό δίσκο.', 'Tip: download a full backup every month to an external drive.'))}</div>`;
  }

  html += `<div class="group-label">${esc(L('Εφαρμογή', 'App'))}</div><div class="list">
    ${!isStandalone() ? `<button class="row has-icon" id="install"><span class="row-icon">${icon('install')}</span><div class="main-col"><div class="t">${esc(L('Εγκατάσταση στη συσκευή', 'Install on this device'))}</div><div class="s">${esc(L('Εικονίδιο στην αρχική οθόνη, πλήρης οθόνη, ειδοποιήσεις', 'Home screen icon, full screen, notifications'))}</div></div>${icon('chevR', 'chev')}</button>` : ''}
    <a class="row has-icon" href="#/help"><span class="row-icon" style="background:var(--blue)">${icon('book')}</span><div class="main-col"><div class="t">${esc(L('Οδηγός χρήσης & Συχνές ερωτήσεις', 'User guide & FAQ'))}</div></div>${icon('chevR', 'chev')}</a>
    ${TERMS_ENABLED ? `<a class="row has-icon" href="legal.html" target="_blank" rel="noopener"><span class="row-icon" style="background:var(--label-2)">${icon('shield')}</span><div class="main-col"><div class="t">${esc(L('Όροι χρήσης & Πολιτική απορρήτου', 'Terms of use & Privacy policy'))}</div><div class="s">${S.profile?.terms_accepted_at ? esc(L('Αποδεχτήκατε την έκδοση', 'You accepted version') + ' ' + (S.profile.terms_version || '') + ' · ' + new Date(S.profile.terms_accepted_at).toLocaleDateString(LANG === 'en' ? 'en-GB' : 'el-GR')) : ''}</div></div>${icon('chevR', 'chev')}</a>` : ''}
    <button class="row has-icon" id="reload"><span class="row-icon" style="background:var(--label-2)">${icon('refresh')}</span><div class="main-col"><div class="t">${esc(L('Ανανέωση δεδομένων', 'Refresh data'))}</div></div></button>
    <button class="row has-icon" id="logout"><span class="row-icon" style="background:var(--red)">${icon('logout')}</span><div class="main-col"><div class="t neg">${esc(L('Αποσύνδεση', 'Sign out'))}</div></div></button>
  </div>
  <div class="center small muted mt" style="padding-bottom:10px">Image Makers · Studio Manager v${APP_VERSION}<br>made by <b>“georgeousDev”</b> software solutions · <a href="mailto:gkararizosg@gmail.com">gkararizosg@gmail.com</a></div>`;
  root.innerHTML = html;

  // προφίλ
  let color = p.color || colorFor(p.id);
  root.querySelectorAll('[data-color]').forEach((c) => c.addEventListener('click', () => { color = c.dataset.color; root.querySelectorAll('[data-color]').forEach((x) => { x.style.boxShadow = x === c ? `0 0 0 3px var(--bg),0 0 0 5px ${color}` : ''; }); }));
  root.querySelector('#pf_save').addEventListener('click', async (e) => { const _btn = e.currentTarget;
    busy(_btn, true);
    const { data, error } = await sb.from('profiles').update({ full_name: root.querySelector('#pf_name').value.trim(), phone: root.querySelector('#pf_phone').value.trim() || null, color }).eq('id', p.id).select().single();
    busy(_btn, false);
    if (error) return toastErr(L('Δεν αποθηκεύτηκε', 'Not saved'), friendlyError(error));
    S.profile = data; await reload('profiles'); toast(L('Το προφίλ αποθηκεύτηκε', 'Profile saved'));
  });
  initSegmented(root, async (name, v) => {
    if (name === 'theme') setThemePref(v);
    if (name === 'lang') { setLang(v); await sb.from('profiles').update({ lang: v }).eq('id', p.id); S.profile.lang = v; location.reload(); }
    if (name === 'lock') { try { localStorage.setItem('im.lockAfter', v); } catch {} toast(L('Αποθηκεύτηκε', 'Saved'), { ms: 1200 }); }
  });
  root.querySelector('#chpin').addEventListener('click', async () => { if (await verifyPinPrompt(L('Γράψτε το τρέχον PIN σας.', 'Enter your current PIN.'))) await showNewPin(); });
  root.querySelector('#logout').addEventListener('click', async () => { if (!await confirmBox(L('Αποσύνδεση;', 'Sign out?'), L('Οι ειδοποιήσεις σε αυτή τη συσκευή θα σταματήσουν.', 'Notifications on this device will stop.'), { ok: L('Αποσύνδεση', 'Sign out'), destructive: true })) return; await disablePushHere(); await sb.auth.signOut(); });
  root.querySelector('#reload').addEventListener('click', async (e) => { const _btn = e.currentTarget; busy(_btn, true); const { loadAll } = await import('../data.js'); await loadAll(); busy(_btn, false); toast(L('Ενημερώθηκε', 'Refreshed')); });
  root.querySelector('#install')?.addEventListener('click', async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; return; }
    location.hash = '#/help/install';
  });
  if (admin) {
    root.querySelector('#b_save').addEventListener('click', async (e) => { const _btn = e.currentTarget; const v = {}; root.querySelectorAll('[data-b]').forEach((i) => { v[i.dataset.b] = i.value.trim(); }); busy(_btn, true); try { await saveSetting('business', v); toast(L('Αποθηκεύτηκε', 'Saved')); } finally { busy(_btn, false); } });
    root.querySelector('#cr_save').addEventListener('click', async (e) => { const _btn = e.currentTarget; busy(_btn, true); try { await saveSetting('crew_reminder', { enabled: root.querySelector('#cr_on').checked, days_before: Number(root.querySelector('#cr_days').value) || 1, hour: Math.min(23, Number(root.querySelector('#cr_hour').value) || 18) }); toast(L('Αποθηκεύτηκε', 'Saved')); } finally { busy(_btn, false); } });
    root.querySelectorAll('[data-bk]').forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.bk;
      try {
        if (k === 'xlsx') await exportAllXlsx();
        if (k === 'zip') await exportFullZip();
        if (k === 'restore') await importBackup();
        if (k === 'old') await importOldSheet();
      } catch (e) { console.error(e); toastErr(L('Δεν ολοκληρώθηκε', 'Not completed'), e.message); }
    }));
    drawServerBox(root);
  }
  drawPushBox(root);
}

async function drawPushBox(root) {
  const box = root.querySelector('#pushBox'); if (!box) return;
  const stt = await pushState().catch(() => 'unsupported');
  const { data: devs } = await sb.from('push_subscriptions').select('id,device,created_at,last_ok_at').eq('user_id', S.profile.id);
  const devList = (devs || []).length ? `<div class="small muted mt">${esc(L('Οι συσκευές μου με ειδοποιήσεις:', 'My devices with notifications:'))} ${(devs || []).map((d) => esc(d.device || '?')).join(', ')}</div>` : '';
  const S_ = {
    on: `<div class="hstack">${icon('checkCircle', 'pos')}<b>${esc(L('Ενεργές σε αυτή τη συσκευή', 'On for this device'))}</b></div><div class="hstack mt"><button class="btn primary" id="ptest">${icon('send')} ${esc(L('Δοκιμαστική ειδοποίηση', 'Test notification'))}</button><button class="btn" id="poff">${esc(L('Απενεργοποίηση', 'Turn off'))}</button></div>`,
    default: `<b>${esc(L('Οι ειδοποιήσεις δεν είναι ενεργές', 'Notifications are off'))}</b><p class="small muted">${esc(L('Ενεργοποιήστε τις για να μαθαίνετε αμέσως αναθέσεις, αλλαγές, πληρωμές και μηνύματα προς αποστολή.', 'Turn them on to hear immediately about assignments, changes, payments and messages to send.'))}</p><button class="btn primary mt-s" id="pon">${icon('bell')} ${esc(L('Ενεργοποίηση ειδοποιήσεων', 'Turn on notifications'))}</button>`,
    denied: `<b class="neg">${esc(L('Οι ειδοποιήσεις έχουν μπλοκαριστεί', 'Notifications are blocked'))}</b><p class="small muted">${esc(isIOS() ? L('Ρυθμίσεις iPhone → Ειδοποιήσεις → Image Makers → Να επιτρέπονται.', 'iPhone Settings → Notifications → Image Makers → Allow.') : L('Πατήστε το λουκέτο δίπλα στη διεύθυνση της σελίδας → Ειδοποιήσεις → Να επιτρέπονται. Μετά ανανεώστε.', 'Tap the lock next to the address bar → Notifications → Allow. Then reload.'))}</p>`,
    'ios-install': `<b>${esc(L('Στο iPhone/iPad χρειάζεται εγκατάσταση', 'On iPhone/iPad installation is needed'))}</b><p class="small muted">${L('1. Στο Safari πατήστε <span class="ios-share">' + icon('share') + '</span> «Κοινοποίηση».<br>2. «Προσθήκη στην οθόνη Αφετηρίας».<br>3. Ανοίξτε την εφαρμογή από το νέο εικονίδιο και ελάτε ξανά εδώ.', '1. In Safari tap <span class="ios-share">' + icon('share') + '</span> Share.<br>2. “Add to Home Screen”.<br>3. Open the app from the new icon and come back here.')}</p>`,
    unsupported: `<b>${esc(L('Αυτός ο browser δεν υποστηρίζει ειδοποιήσεις', 'This browser does not support notifications'))}</b><p class="small muted">${esc(L('Χρησιμοποιήστε Chrome, Edge, Firefox ή Safari (νέα έκδοση). Οι ειδοποιήσεις εμφανίζονται πάντα και μέσα στην εφαρμογή (καμπανάκι).', 'Use Chrome, Edge, Firefox or Safari (recent). Notifications always appear inside the app too (bell).'))}</p>`,
    'server-missing': `<b>${esc(L('Αναμονή ρύθμισης από διαχειριστή', 'Waiting for admin setup'))}</b><p class="small muted">${esc(isAdmin() ? L('Ολοκληρώστε πρώτα τη «ρύθμιση μία φορά» πιο κάτω.', 'First complete the “one-time setup” below.') : L('Ο διαχειριστής δεν έχει ολοκληρώσει τη ρύθμιση. Μέχρι τότε θα βλέπετε τις ειδοποιήσεις μέσα στην εφαρμογή.', 'The admin has not finished setup. Meanwhile you will see notifications inside the app.'))}</p>`,
  };
  box.innerHTML = (S_[stt] || S_.unsupported) + devList;
  box.querySelector('#pon')?.addEventListener('click', async (e) => { const _btn = e.currentTarget;
    busy(_btn, true);
    const r = await enablePush().catch((er) => { toastErr(L('Δεν ενεργοποιήθηκαν', 'Not enabled'), er.message); return 'error'; });
    if (r === 'on') { toast(L('Οι ειδοποιήσεις ενεργοποιήθηκαν', 'Notifications on')); await sendTest().catch(() => {}); }
    drawPushBox(root);
  });
  box.querySelector('#ptest')?.addEventListener('click', async (e) => { const _btn = e.currentTarget; busy(_btn, true); try { await sendTest(); toast(L('Στάλθηκε', 'Sent'), { body: L('Θα πρέπει να εμφανιστεί σε λίγα δευτερόλεπτα.', 'It should appear in a few seconds.') }); } catch (er) { toastErr('Error', friendlyError(er)); } busy(_btn, false); });
  box.querySelector('#poff')?.addEventListener('click', async () => { await disablePushHere(); toast(L('Απενεργοποιήθηκαν', 'Turned off')); drawPushBox(root); });
}

async function drawServerBox(root) {
  const box = root.querySelector('#srvBox'); if (!box) return;
  let st;
  try { st = await serverStatus(); } catch (e) { box.innerHTML = `<span class="neg">${esc(friendlyError(e))}</span>`; return; }
  const fnOk = await checkFunction();
  const line = (ok, t, help = '') => `<div class="row" style="padding-left:0"><span style="font-size:18px">${ok ? '✅' : '⚠️'}</span><div class="main-col"><div class="t" style="white-space:normal">${esc(t)}</div>${!ok && help ? `<div class="s" style="white-space:normal">${help}</div>` : ''}</div></div>`;
  box.innerHTML = `
    ${line(st.has_pg_net, L('Βάση: επέκταση pg_net', 'Database: pg_net extension'), esc(L('Supabase → Database → Extensions → ενεργοποιήστε «pg_net» και τρέξτε ξανά το schema.sql.', 'Supabase → Database → Extensions → enable “pg_net” and run schema.sql again.')))}
    ${line(st.has_pg_cron, L('Βάση: χρονοπρογραμματισμός (pg_cron)', 'Database: scheduler (pg_cron)'), esc(L('Supabase → Database → Extensions → ενεργοποιήστε «pg_cron» και τρέξτε ξανά το schema.sql. Χωρίς αυτό, τα μηνύματα «10 ημέρες πριν» ελέγχονται μόνο όταν πατάτε «Έλεγχος τώρα».', 'Enable “pg_cron” and run schema.sql again. Without it, “10 days before” messages are only checked when you press “Check now”.')))}
    ${line(fnOk, L('Edge Function «push» εγκατεστημένη', 'Edge Function “push” deployed'), esc(L('Δείτε τον Οδηγό εγκατάστασης, βήμα «Ειδοποιήσεις». Θυμηθείτε: Verify JWT = OFF.', 'See the setup guide, “Notifications” step. Remember: Verify JWT = OFF.')))}
    ${line(st.has_vapid && !!st.functions_url, L('Κλειδιά ειδοποιήσεων δημιουργημένα', 'Notification keys created'))}
    <div class="small muted">${esc(L(`Συσκευές με ειδοποιήσεις σε όλη την ομάδα: ${st.subscriptions}`, `Devices with notifications across the team: ${st.subscriptions}`))}</div>
    <div class="hstack mt">
      <button class="btn ${st.has_vapid ? '' : 'primary'}" id="srvSetup">${icon('sparkles')} ${esc(st.has_vapid ? L('Νέα κλειδιά (επαναρύθμιση)', 'New keys (reset)') : L('Ενεργοποίηση για όλη την ομάδα', 'Enable for the whole team'))}</button>
      <button class="btn" id="srvRe">${icon('refresh')} ${esc(L('Έλεγχος ξανά', 'Check again'))}</button>
    </div>`;
  box.querySelector('#srvRe').addEventListener('click', () => drawServerBox(root));
  box.querySelector('#srvSetup').addEventListener('click', async (e) => { const _btn = e.currentTarget;
    if (st.has_vapid && !await confirmBox(L('Δημιουργία νέων κλειδιών;', 'Create new keys?'), L('Όλες οι συσκευές της ομάδας θα πρέπει να ξαναενεργοποιήσουν τις ειδοποιήσεις.', 'All team devices will need to turn notifications on again.'), { ok: L('Συνέχεια', 'Continue'), destructive: true })) return;
    busy(_btn, true);
    try {
      await setupServerPush();
      toast(L('Έτοιμο! 🎉', 'Done! 🎉'), { body: L('Τώρα ενεργοποιήστε τις ειδοποιήσεις σε αυτή τη συσκευή.', 'Now turn on notifications on this device.') });
      drawServerBox(root); drawPushBox(root);
    } catch (er) { toastErr(L('Δεν ολοκληρώθηκε', 'Not completed'), friendlyError(er)); busy(_btn, false); }
  });
}
void infoBox; void timeAgo; void emit;
