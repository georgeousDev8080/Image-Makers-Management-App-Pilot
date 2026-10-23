// =====================================================================
//  Σύνδεση, εγγραφή, PIN, κλείδωμα, καλωσόρισμα νέου μέλους
// =====================================================================
import { L, vocative, esc, icon, $, toast, toastErr, setLang, LANG, setThemePref, getThemePref, busy, initials, colorFor, debounce, infoBox, sleep, haptic } from '../core.js';
import { sb, S, friendlyError, loadProfile, reload, profileName } from '../data.js';
import { enablePush, pushState } from '../push.js';

const PIN_LEN = 6;
const credit = `<div class="credit center" style="margin-top:28px">made by <b>“georgeousDev”</b> software solutions · <a href="mailto:gkararizosg@gmail.com">gkararizosg@gmail.com</a></div>`;

// ---------- PIN hash (τοπικό ξεκλείδωμα) ----------
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
export async function setPinHash(uid, pin) { try { localStorage.setItem('im.pin.' + uid, await sha(uid + ':' + pin + ':im')); } catch {} }
const getPinHash = (uid) => { try { return localStorage.getItem('im.pin.' + uid); } catch { return null; } };
export function lockAfterMinutes() { try { const v = localStorage.getItem('im.lockAfter'); return v === null ? 5 : Number(v); } catch { return 5; } }
export function needsLock(hiddenAt) {
  const uid = S.session?.user?.id;
  if (!uid || !getPinHash(uid)) return false;
  const mins = lockAfterMinutes();
  if (mins < 0) return false; // απενεργοποιημένο
  if (hiddenAt === undefined) {
    // κρύο ξεκίνημα εφαρμογής
    let unlocked = null; try { unlocked = sessionStorage.getItem('im.unlocked'); } catch {}
    return !unlocked;
  }
  return hiddenAt && Date.now() - hiddenAt > mins * 60e3;
}
const markUnlocked = () => { try { sessionStorage.setItem('im.unlocked', '1'); } catch {} };

// ---------- PIN keypad ----------
function pinPad(container, { onComplete, extraLeft = '' }) {
  let val = '';
  container.innerHTML = `
    <div class="pin-dots" aria-live="polite">${'<i></i>'.repeat(PIN_LEN)}</div>
    <div class="keypad">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-k="${n}">${n}</button>`).join('')}
      <button type="button" class="ghost" data-k="extra">${extraLeft}</button>
      <button type="button" data-k="0">0</button>
      <button type="button" class="ghost" data-k="del" aria-label="${esc(L('Διαγραφή', 'Delete'))}">${icon('backspace')}</button>
    </div>`;
  const dots = container.querySelector('.pin-dots');
  const paint = () => [...dots.children].forEach((d, i) => d.classList.toggle('on', i < val.length));
  let locked = false;
  const press = async (k) => {
    if (locked) return;
    if (k === 'del') val = val.slice(0, -1);
    else if (/^\d$/.test(k) && val.length < PIN_LEN) val += k;
    haptic(4);
    paint();
    if (val.length === PIN_LEN) {
      locked = true;
      const ok = await onComplete(val);
      if (ok === false) { dots.classList.add('shake'); haptic([20, 40, 20]); await sleep(450); dots.classList.remove('shake'); val = ''; paint(); }
      locked = false;
    }
  };
  container.addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b && b.dataset.k !== 'extra') press(b.dataset.k); });
  const kd = (e) => { if (!container.isConnected) return document.removeEventListener('keydown', kd); if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('del'); };
  document.addEventListener('keydown', kd);
  return { reset() { val = ''; paint(); }, destroy() { document.removeEventListener('keydown', kd); } };
}

function tools() {
  return `<div class="auth-tools">
    <button class="icon-btn filled" data-lang title="Ελληνικά / English">${icon('globe')}</button>
    <button class="icon-btn filled" data-theme title="${esc(L('Φωτεινό / σκούρο', 'Light / dark'))}">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
  </div>`;
}
function bindTools(root, rerender) {
  root.querySelector('[data-lang]')?.addEventListener('click', () => { setLang(LANG === 'el' ? 'en' : 'el'); rerender(); });
  root.querySelector('[data-theme]')?.addEventListener('click', () => { setThemePref(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); rerender(); });
}

// ---------- Δεν έχει ρυθμιστεί ----------
export function renderNotConfigured(root) {
  root.innerHTML = `<div class="welcome"><div class="box">
    <div class="brand-mobile" style="display:grid;place-items:center;width:84px;height:84px;border-radius:22px;background:#1c1a18;margin:0 auto 18px"><img src="icons/logo-white.png" style="width:64px" alt=""></div>
    <h1>${esc(L('Σχεδόν έτοιμοι!', 'Almost ready!'))}</h1>
    <p>${esc(L('Η εφαρμογή δεν έχει συνδεθεί ακόμη με τη βάση δεδομένων (Supabase).', 'The app is not connected to the database (Supabase) yet.'))}</p>
    <div class="card pad mt" style="text-align:left">
      <b>${esc(L('Τι πρέπει να γίνει:', 'What to do:'))}</b>
      <ol style="margin:8px 0 0;padding-left:20px;color:var(--label-2)">
        <li>${esc(L('Ανοίξτε το αρχείο config.js στο GitHub.', 'Open the file config.js on GitHub.'))}</li>
        <li>${esc(L('Βάλτε το Project URL και το anon key από το Supabase (Project Settings → API).', 'Paste the Project URL and anon key from Supabase (Project Settings → API).'))}</li>
        <li>${esc(L('Αποθηκεύστε (Commit) και ανανεώστε αυτή τη σελίδα σε 1–2 λεπτά.', 'Save (Commit) and reload this page in 1–2 minutes.'))}</li>
      </ol>
    </div>${credit}</div></div>`;
}

// ---------- Σύνδεση / Εγγραφή ----------
export function renderAuth(root, { onDone, mode: startMode } = {}) {
  let mode = startMode || 'login';
  let remembered = null; try { remembered = JSON.parse(localStorage.getItem('im.lastUser') || 'null'); } catch {}
  let step = remembered ? 'pin' : 'id';
  let identifier = remembered?.identifier || '';
  let pad = null;

  const draw = () => {
    pad?.destroy?.();
    root.innerHTML = `<div class="auth">
      <div class="auth-hero"><div class="copy"><img src="icons/logo-white.png" alt="Image Makers">
        <h2>${L('Η ιστορία τους,<br>οργανωμένη σωστά.', 'Their story,<br>beautifully organized.')}</h2>
        <p>${esc(L('Εκδηλώσεις, πελάτες, οικονομικά και ομάδα — σε ένα σημείο.', 'Events, customers, finances and team — in one place.'))}</p></div></div>
      <div class="auth-panel" style="position:relative">${tools()}<div class="auth-box" id="box"></div></div>
    </div>`;
    bindTools(root, draw);
    const box = $('#box', root);
    const brand = `<div class="brand-mobile"><img src="icons/logo-white.png" alt="Image Makers"></div>`;

    if (mode === 'login' && step === 'id') {
      box.innerHTML = `${brand}<h1>${esc(L('Καλώς ήρθατε', 'Welcome'))}</h1><p class="sub">${esc(L('Συνδεθείτε με το όνομα χρήστη ή το email σας.', 'Sign in with your username or email.'))}</p>
        <form class="form" id="f" novalidate>
          <div class="field"><label>${esc(L('Όνομα χρήστη ή email', 'Username or email'))}</label>
            <input class="input" name="identifier" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(identifier)}" placeholder="${esc(L('π.χ. giorgos ή giorgos@gmail.com', 'e.g. giorgos or giorgos@gmail.com'))}" required></div>
          <button class="btn primary large block" type="submit">${esc(L('Συνέχεια', 'Continue'))} ${icon('chevR')}</button>
        </form>
        <div class="auth-switch">${esc(L('Νέος στην ομάδα;', 'New to the team?'))} <a href="#" data-mode="signup"><b>${esc(L('Δημιουργία λογαριασμού', 'Create account'))}</b></a></div>${credit}`;
      const f = $('#f', box);
      setTimeout(() => f.identifier.focus(), 50);
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        identifier = f.identifier.value.trim();
        if (!identifier) { f.identifier.classList.add('invalid'); return; }
        step = 'pin'; remembered = null; draw();
      });
    } else if (mode === 'login' && step === 'pin') {
      const name = remembered?.name || identifier;
      box.innerHTML = `<div class="center">
          <span class="avatar lg" style="--c:${colorFor(identifier)};margin:0 auto">${esc(initials(name))}</span>
          <h1 style="font-size:24px;margin-top:12px">${esc(remembered ? L(`Γεια σου, ${vocative(name)}`, `Hi, ${name.split(' ')[0]}`) : identifier)}</h1>
          <p class="sub" style="margin-bottom:0">${esc(L('Πληκτρολογήστε το 6ψήφιο PIN σας', 'Enter your 6-digit PIN'))}</p>
          <div id="pad"></div>
          <div class="hstack" style="justify-content:center;margin-top:18px;gap:14px">
            <a href="#" data-other>${esc(L('Άλλος λογαριασμός', 'Other account'))}</a>
            <a href="#" data-mode="forgot">${esc(L('Ξέχασα το PIN', 'Forgot PIN'))}</a>
          </div></div>${credit}`;
      pad = pinPad($('#pad', box), {
        onComplete: async (pin) => {
          try {
            const { data: email, error: e1 } = await sb.rpc('login_email', { p_identifier: identifier });
            if (e1) throw e1;
            if (!email) { toastErr(L('Δεν βρέθηκε λογαριασμός', 'Account not found'), L('Ελέγξτε το όνομα χρήστη ή χρησιμοποιήστε το email σας.', 'Check the username or use your email.')); return false; }
            const { data, error } = await sb.auth.signInWithPassword({ email, password: pin });
            if (error) throw error;
            S.session = data.session;
            await setPinHash(data.user.id, pin);
            markUnlocked();
            const prof = await loadProfile().catch(() => null);
            try { localStorage.setItem('im.lastUser', JSON.stringify({ identifier, name: prof ? profileName(prof) : identifier })); } catch {}
            onDone?.();
            return true;
          } catch (err) {
            if (!/Invalid login/i.test(err.message)) toastErr(L('Η σύνδεση απέτυχε', 'Sign-in failed'), friendlyError(err));
            return false;
          }
        },
      });
      box.querySelector('[data-other]').addEventListener('click', (e) => { e.preventDefault(); try { localStorage.removeItem('im.lastUser'); } catch {} remembered = null; identifier = ''; step = 'id'; draw(); });
    } else if (mode === 'signup') {
      box.innerHTML = `${brand}<h1>${esc(L('Νέος λογαριασμός', 'New account'))}</h1><p class="sub">${esc(L('Μετά την εγγραφή, ένας διαχειριστής θα σας δώσει ρόλο.', 'After signing up, an admin will give you a role.'))}</p>
        <form class="form" id="f" novalidate autocomplete="off">
          <div class="field"><label>${esc(L('Ονοματεπώνυμο', 'Full name'))} <span class="req">*</span></label><input class="input" name="full_name" autocomplete="name" placeholder="${esc(L('π.χ. Γιώργος Παπαδόπουλος', 'e.g. George Papadopoulos'))}"><div class="err" hidden></div></div>
          <div class="field"><label>${esc(L('Όνομα χρήστη', 'Username'))} <span class="req">*</span></label><input class="input" name="username" autocapitalize="none" spellcheck="false" placeholder="${esc(L('π.χ. giorgos', 'e.g. george'))}"><div class="help" id="uhelp">${esc(L('Λατινικά γράμματα, αριθμοί, τελεία ή _ (3–30 χαρακτήρες).', 'Latin letters, numbers, dot or _ (3–30 characters).'))}</div><div class="err" hidden></div></div>
          <div class="field"><label>Email <span class="req">*</span></label><input class="input" name="email" type="email" inputmode="email" autocapitalize="none" autocomplete="email" placeholder="name@gmail.com"><div class="err" hidden></div></div>
          <div class="form-grid">
            <div class="field"><label>PIN (6 ${esc(L('ψηφία', 'digits'))}) <span class="req">*</span></label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="••••••"><div class="err" hidden></div></div>
            <div class="field"><label>${esc(L('Επανάληψη PIN', 'Repeat PIN'))} <span class="req">*</span></label><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="••••••"><div class="err" hidden></div></div>
          </div>
          <button class="btn primary large block" type="submit">${esc(L('Δημιουργία λογαριασμού', 'Create account'))}</button>
        </form>
        <div class="auth-switch">${esc(L('Έχετε ήδη λογαριασμό;', 'Already have an account?'))} <a href="#" data-mode="login"><b>${esc(L('Σύνδεση', 'Sign in'))}</b></a></div>${credit}`;
      const f = $('#f', box);
      const err = (name, msg) => { const i = f[name]; i.classList.toggle('invalid', !!msg); const e = i.closest('.field').querySelector('.err'); e.hidden = !msg; e.textContent = msg || ''; return !msg; };
      let userOk = false;
      const checkUser = debounce(async () => {
        const u = f.username.value.trim();
        if (!/^[a-zA-Z0-9._]{3,30}$/.test(u)) { userOk = false; return; }
        const { data } = await sb.rpc('username_available', { p_username: u });
        userOk = !!data;
        err('username', data ? '' : L('Το όνομα χρήστη χρησιμοποιείται ήδη.', 'This username is taken.'));
        if (data) $('#uhelp', box).innerHTML = `<span class="pos">✓ ${esc(L('Διαθέσιμο', 'Available'))}</span>`;
      }, 350);
      f.username.addEventListener('input', () => { f.username.value = f.username.value.replace(/\s/g, ''); checkUser(); });
      ['pin', 'pin2'].forEach((n) => f[n].addEventListener('input', () => { f[n].value = f[n].value.replace(/\D/g, '').slice(0, 6); }));
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = { full_name: f.full_name.value.trim(), username: f.username.value.trim(), email: f.email.value.trim().toLowerCase(), pin: f.pin.value, pin2: f.pin2.value };
        let ok = true;
        ok = err('full_name', v.full_name.length < 2 ? L('Γράψτε το ονοματεπώνυμό σας.', 'Enter your full name.') : '') && ok;
        ok = err('username', !/^[a-zA-Z0-9._]{3,30}$/.test(v.username) ? L('Μόνο λατινικά, αριθμοί, . ή _ (3–30).', 'Only latin letters, numbers, . or _ (3–30).') : '') && ok;
        ok = err('email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ? L('Μη έγκυρο email.', 'Invalid email.') : '') && ok;
        ok = err('pin', !/^\d{6}$/.test(v.pin) ? L('Το PIN πρέπει να έχει ακριβώς 6 ψηφία.', 'The PIN must be exactly 6 digits.') : /^(\d)\1{5}$|^(012345|123456|234567|345678|456789|987654|654321)$/.test(v.pin) ? L('Πολύ εύκολο PIN. Διαλέξτε κάτι άλλο.', 'PIN too easy. Choose another.') : '') && ok;
        ok = err('pin2', v.pin !== v.pin2 ? L('Τα PIN δεν ταιριάζουν.', 'PINs do not match.') : '') && ok;
        if (!ok) return;
        const { data: avail } = await sb.rpc('username_available', { p_username: v.username });
        if (!avail) { err('username', L('Το όνομα χρήστη χρησιμοποιείται ήδη.', 'This username is taken.')); return; }
        const btn = f.querySelector('button[type=submit]');
        busy(btn, true);
        const { data, error } = await sb.auth.signUp({ email: v.email, password: v.pin, options: { data: { username: v.username, full_name: v.full_name, lang: LANG }, emailRedirectTo: location.href.split('#')[0] } });
        busy(btn, false);
        if (error) { toastErr(L('Η εγγραφή απέτυχε', 'Sign-up failed'), friendlyError(error)); return; }
        try { localStorage.setItem('im.lastUser', JSON.stringify({ identifier: v.username, name: v.full_name })); } catch {}
        if (data.session) {
          S.session = data.session;
          await setPinHash(data.user.id, v.pin);
          markUnlocked();
          toast(L('Ο λογαριασμός δημιουργήθηκε!', 'Account created!'));
          onDone?.();
        } else {
          await infoBox(L('Ελέγξτε το email σας', 'Check your email'), L('Σας στείλαμε σύνδεσμο επιβεβαίωσης. Πατήστε τον και μετά συνδεθείτε με το PIN σας.', 'We sent you a confirmation link. Tap it, then sign in with your PIN.'));
          mode = 'login'; step = 'pin'; identifier = v.username; remembered = { identifier: v.username, name: v.full_name }; draw();
        }
      });
    } else if (mode === 'forgot') {
      box.innerHTML = `${brand}<h1>${esc(L('Ξεχάσατε το PIN;', 'Forgot your PIN?'))}</h1><p class="sub">${esc(L('Γράψτε το email του λογαριασμού σας. Θα λάβετε σύνδεσμο για να ορίσετε νέο PIN.', 'Enter your account email. You will receive a link to set a new PIN.'))}</p>
        <form class="form" id="f" novalidate>
          <div class="field"><label>Email</label><input class="input" name="email" type="email" inputmode="email" autocapitalize="none" placeholder="name@gmail.com"></div>
          <button class="btn primary large block" type="submit">${esc(L('Αποστολή συνδέσμου', 'Send link'))}</button>
        </form>
        <div class="auth-switch"><a href="#" data-mode="login">${icon('chevL')} ${esc(L('Πίσω στη σύνδεση', 'Back to sign in'))}</a></div>
        <div class="banner mt">${icon('help')}<div><span>${esc(L('Αν δεν έρθει email σε λίγα λεπτά, κοιτάξτε στα Ανεπιθύμητα (Spam).', 'If no email arrives in a few minutes, check your Spam folder.'))}</span></div></div>${credit}`;
      const f = $('#f', box);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = f.email.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { f.email.classList.add('invalid'); return; }
        const btn = f.querySelector('button'); busy(btn, true);
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
        busy(btn, false);
        if (error) { toastErr(L('Δεν στάλθηκε', 'Not sent'), friendlyError(error)); return; }
        await infoBox(L('Στάλθηκε!', 'Sent!'), L('Ανοίξτε το email από αυτή τη συσκευή και πατήστε τον σύνδεσμο για να ορίσετε νέο PIN.', 'Open the email on this device and tap the link to set a new PIN.'));
        mode = 'login'; draw();
      });
    }
    box.querySelectorAll('[data-mode]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); mode = a.dataset.mode; if (mode === 'login') step = remembered || identifier ? 'pin' : 'id'; draw(); }));
  };
  draw();
}

// ---------- Κλείδωμα ----------
let lockOpen = false;
export function showLock() {
  if (lockOpen) return Promise.resolve();
  lockOpen = true;
  return new Promise((resolve) => {
    const uid = S.session?.user?.id;
    const name = S.profile ? profileName(S.profile) : '';
    const elx = document.createElement('div');
    elx.className = 'lockscreen';
    elx.innerHTML = `<span class="avatar lg" style="--c:${S.profile?.color || colorFor(uid)}">${esc(initials(name))}</span>
      <h2>${esc(L('Εισαγάγετε το PIN σας', 'Enter your PIN'))}</h2>
      <div class="muted small">${esc(name)}</div>
      <div id="lpad"></div>
      <button class="btn plain mt" data-out>${icon('logout')} ${esc(L('Αποσύνδεση', 'Sign out'))}</button>`;
    document.body.appendChild(elx);
    let fails = 0;
    const pad = pinPad(elx.querySelector('#lpad'), {
      onComplete: async (pin) => {
        const h = await sha(uid + ':' + pin + ':im');
        if (h === getPinHash(uid)) {
          markUnlocked(); pad.destroy(); elx.remove(); lockOpen = false; resolve(); return true;
        }
        fails++;
        if (fails >= 5) {
          toastErr(L('Πολλές λάθος προσπάθειες', 'Too many wrong attempts'), L('Συνδεθείτε ξανά.', 'Please sign in again.'));
          try { localStorage.removeItem('im.pin.' + uid); } catch {}
          pad.destroy(); elx.remove(); lockOpen = false;
          await sb.auth.signOut();
        }
        return false;
      },
    });
    elx.querySelector('[data-out]').addEventListener('click', async () => { pad.destroy(); elx.remove(); lockOpen = false; await sb.auth.signOut(); });
  });
}

// ---------- Νέο PIN (ανάκτηση ή αλλαγή) ----------
export function showNewPin({ recovery = false } = {}) {
  return new Promise((resolve) => {
    const elx = document.createElement('div');
    elx.className = 'lockscreen';
    let first = null;
    const draw = () => {
      elx.innerHTML = `<div class="brand-badge" style="width:64px;height:64px;border-radius:18px"><img src="icons/logo-white.png" style="width:48px" alt=""></div>
        <h2>${esc(first ? L('Ξαναγράψτε το νέο PIN', 'Repeat the new PIN') : L('Ορίστε νέο 6ψήφιο PIN', 'Set a new 6-digit PIN'))}</h2>
        <div id="npad"></div>${recovery ? '' : `<button class="btn plain mt" data-cancel>${esc(L('Ακύρωση', 'Cancel'))}</button>`}`;
      const pad = pinPad(elx.querySelector('#npad'), {
        onComplete: async (pin) => {
          if (!first) {
            if (/^(\d)\1{5}$|^(012345|123456|234567|345678|456789|987654|654321)$/.test(pin)) { toastErr(L('Πολύ εύκολο PIN', 'PIN too easy')); return false; }
            first = pin; pad.destroy(); draw(); return true;
          }
          if (pin !== first) { toastErr(L('Τα PIN δεν ταιριάζουν', 'PINs do not match')); first = null; pad.destroy(); setTimeout(draw, 300); return false; }
          const { data, error } = await sb.auth.updateUser({ password: pin });
          if (error) { toastErr(L('Δεν άλλαξε το PIN', 'PIN not changed'), friendlyError(error)); return false; }
          await setPinHash(data.user.id, pin);
          markUnlocked();
          toast(L('Το νέο PIN αποθηκεύτηκε', 'New PIN saved'));
          pad.destroy(); elx.remove(); resolve(true); return true;
        },
      });
      elx.querySelector('[data-cancel]')?.addEventListener('click', () => { pad.destroy(); elx.remove(); resolve(false); });
    };
    draw();
    document.body.appendChild(elx);
  });
}

// ---------- Καλωσόρισμα (χωρίς ρόλο ακόμη) ----------
export function renderWelcome(root, { onRole }) {
  let owner = false;
  let ownerRole = 'admin_photo';
  const name = vocative(profileName(S.profile));
  const draw = async () => {
    root.innerHTML = `<div class="welcome" style="position:relative">${tools()}<div class="box">
      <div class="emoji">👋</div>
      <h1>${esc(L(`Καλώς ήρθες στην ομάδα, ${name}!`, `Welcome to the team, ${name}!`))}</h1>
      <p>${esc(L('Ο λογαριασμός σου δημιουργήθηκε. Ένας διαχειριστής θα σου δώσει σύντομα ρόλο και τότε η εφαρμογή θα ανοίξει αυτόματα.', 'Your account is ready. An admin will give you a role soon and the app will open automatically.'))}</p>
      <div class="card pad mt" style="text-align:left">
        <div class="spread"><b>${esc(L('Έχεις κωδικό πρόσκλησης;', 'Have an invite code?'))}</b>${icon('key')}</div>
        <p class="muted small" style="margin-top:4px">${esc(L('Αν σου έδωσε κωδικό ένας διαχειριστής, γράψε τον εδώ.', 'If an admin gave you a code, type it here.'))}</p>
        <form id="cf" class="form mt-s">
          <input class="input" name="code" placeholder="XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" style="text-align:center;letter-spacing:.15em;font-weight:700;font-size:20px">
          <div id="ownerBox" ${owner ? '' : 'hidden'}>
            <div class="field"><label>${esc(L('Η ειδικότητά μου ως ιδιοκτήτης:', 'My specialty as owner:'))}</label>
              <div class="segmented block" data-seg="orole"><span class="thumb"></span>
                <button type="button" data-v="admin_photo" aria-selected="${ownerRole === 'admin_photo'}">${esc(L('Φωτογράφος', 'Photographer'))}</button>
                <button type="button" data-v="admin_video" aria-selected="${ownerRole === 'admin_video'}">${esc(L('Βιντεογράφος', 'Videographer'))}</button>
              </div></div>
          </div>
          <button class="btn primary block" type="submit">${esc(L('Χρήση κωδικού', 'Use code'))}</button>
          <a href="#" id="ownerLink" class="small center" ${owner ? 'hidden' : ''}>${esc(L('Είμαι ο ιδιοκτήτης και έχω τον κωδικό εγκατάστασης', 'I am the owner and have the setup code'))}</a>
        </form>
      </div>
      <div class="card pad mt" style="text-align:left" id="notifCard"></div>
      <button class="btn plain mt" id="lo">${icon('logout')} ${esc(L('Αποσύνδεση', 'Sign out'))}</button>
      ${credit}
    </div></div>`;
    bindTools(root, draw);
    const { initSegmented } = await import('../core.js');
    initSegmented(root, (_, v) => { ownerRole = v; });
    $('#ownerLink', root)?.addEventListener('click', (e) => { e.preventDefault(); owner = true; $('#ownerBox', root).hidden = false; e.target.hidden = true; initSegmented($('#ownerBox', root), (_, v) => { ownerRole = v; }); });
    const f = $('#cf', root);
    f.code.addEventListener('input', () => {
      let v = f.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      if (v.length > 4) v = v.slice(0, 4) + '-' + v.slice(4);
      f.code.value = v;
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button[type=submit]'); busy(btn, true);
      const { data, error } = await sb.rpc('redeem_invite', { p_code: f.code.value, p_admin_role: owner ? ownerRole : null });
      busy(btn, false);
      if (error) { toastErr(L('Ο κωδικός δεν έγινε δεκτός', 'Code not accepted'), friendlyError(error)); return; }
      if (String(data).startsWith('error:')) {
        toastErr(L('Ο κωδικός δεν έγινε δεκτός', 'Code not accepted'), data === 'error:too_many_attempts' ? L('Πολλές λάθος προσπάθειες. Δοκιμάστε σε 1 ώρα.', 'Too many attempts. Try again in an hour.') : L('Ο κωδικός είναι λάθος, έχει λήξει ή έχει ήδη χρησιμοποιηθεί.', 'The code is wrong, expired or already used.'));
        f.code.classList.add('invalid'); return;
      }
      toast(L('Καλώς ήρθες!', 'Welcome!'), { body: L('Ο ρόλος σου ενεργοποιήθηκε.', 'Your role is active.') });
      await loadProfile();
      stop(); onRole?.();
    });
    $('#lo', root).addEventListener('click', () => { stop(); sb.auth.signOut(); });
    // ειδοποιήσεις
    const nc = $('#notifCard', root);
    await reload('app_settings').catch(() => {});
    const st = await pushState().catch(() => 'unsupported');
    if (st === 'on') nc.innerHTML = `<div class="hstack">${icon('checkCircle', 'pos')}<b>${esc(L('Οι ειδοποιήσεις είναι ενεργές', 'Notifications are on'))}</b></div><p class="muted small">${esc(L('Θα ειδοποιηθείς μόλις σου δοθεί ρόλος.', 'You will be notified when you get a role.'))}</p>`;
    else if (st === 'ios-install') nc.innerHTML = `<b>${esc(L('Εγκατάσταση στο iPhone', 'Install on iPhone'))}</b><p class="muted small">${L('Για ειδοποιήσεις: πατήστε <span class="ios-share">' + icon('share') + '</span> «Κοινοποίηση» και μετά «Προσθήκη στην οθόνη Αφετηρίας». Ανοίξτε την εφαρμογή από το νέο εικονίδιο.', 'For notifications: tap <span class="ios-share">' + icon('share') + '</span> Share, then “Add to Home Screen”. Open the app from the new icon.')}</p>`;
    else if (st === 'default' || st === 'server-missing') {
      nc.innerHTML = `<b>${esc(L('Ενεργοποίηση ειδοποιήσεων', 'Turn on notifications'))}</b><p class="muted small">${esc(L('Για να μάθεις αμέσως πότε θα σου δοθεί ρόλος και πότε σου ανατίθεται εκδήλωση.', 'To know immediately when you get a role or an event.'))}</p><button class="btn primary block mt-s" id="np">${icon('bell')} ${esc(L('Ενεργοποίηση', 'Turn on'))}</button>`;
      $('#np', root).addEventListener('click', async () => { const r = await enablePush().catch(() => 'error'); if (r === 'on') { toast(L('Ενεργοποιήθηκαν', 'Turned on')); draw(); } else if (r === 'server-missing') infoBox(L('Σχεδόν έτοιμο', 'Almost there'), L('Ο διαχειριστής δεν έχει ολοκληρώσει ακόμα τη ρύθμιση ειδοποιήσεων. Θα ενεργοποιηθούν αργότερα από τις Ρυθμίσεις.', 'The admin has not finished notification setup yet. You can turn them on later in Settings.')); else if (r === 'denied') infoBox(L('Οι ειδοποιήσεις είναι μπλοκαρισμένες', 'Notifications are blocked'), L('Επιτρέψτε τις από τις ρυθμίσεις του browser/κινητού για αυτή τη σελίδα.', 'Allow them in your browser/phone settings for this site.')); });
    } else nc.remove();
  };
  draw();
  const timer = setInterval(async () => {
    const p = await loadProfile().catch(() => null);
    if (p?.role) { stop(); toast(L('Σας δόθηκε ρόλος!', 'You have a role!')); onRole?.(); }
  }, 10000);
  const stop = () => clearInterval(timer);
}

/** Επιβεβαίωση με PIN για ευαίσθητες ενέργειες (π.χ. ορισμός διαχειριστή) */
export async function verifyPinPrompt(reason) {
  const { promptBox } = await import('../core.js');
  const uid = S.session?.user?.id;
  const pin = await promptBox(L('Επιβεβαίωση με PIN', 'Confirm with PIN'), reason || '', { type: 'password', inputmode: 'numeric', placeholder: '••••••', ok: L('Επιβεβαίωση', 'Confirm') });
  if (pin === null) return false;
  const stored = getPinHash(uid);
  if (stored) {
    if ((await sha(uid + ':' + pin + ':im')) === stored) return true;
  } else {
    const { error } = await sb.auth.signInWithPassword({ email: S.session.user.email, password: pin });
    if (!error) { await setPinHash(uid, pin); return true; }
  }
  toastErr(L('Λάθος PIN', 'Wrong PIN'));
  return false;
}
