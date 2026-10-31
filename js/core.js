// =====================================================================
//  Core: γλώσσα, μορφοποίηση, εικονίδια, UI primitives
// =====================================================================

// ---------- Γλώσσα ----------
export let LANG = (() => { try { return localStorage.getItem('im.lang') || 'el'; } catch { return 'el'; } })();
export const L = (el, en) => (LANG === 'en' ? (en ?? el) : el);
export function setLang(lang) {
  LANG = lang === 'en' ? 'en' : 'el';
  try { localStorage.setItem('im.lang', LANG); } catch {}
  document.documentElement.lang = LANG;
}
document.documentElement.lang = LANG;

// ---------- Θέμα ----------
export function getThemePref() { try { return localStorage.getItem('im.theme') || 'auto'; } catch { return 'auto'; } }
const mq = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme(pref = getThemePref()) {
  const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#000000' : '#f2f2f7';
}
export function setThemePref(pref) { try { localStorage.setItem('im.theme', pref); } catch {} applyTheme(pref); }
mq.addEventListener?.('change', () => applyTheme());

// ---------- Escape / DOM ----------
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function on(root, type, selector, handler, opts) {
  const fn = (e) => { const el = e.target.closest?.(selector); if (el && root.contains(el)) handler(e, el); };
  root.addEventListener(type, fn, opts);
  return () => root.removeEventListener(type, fn, opts);
}
export function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
export const sum = (arr, f = (x) => x) => arr.reduce((n, x) => n + (Number(f(x)) || 0), 0);
export const groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] ||= []).push(x); return m; }, {});
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').trim();
export const matches = (q, ...fields) => { const n = norm(q); if (!n) return true; const hay = norm(fields.join(' ')); return n.split(/\s+/).every((w) => hay.includes(w)); };

// ---------- Μορφοποίηση ----------
export function money(v, { dec = 2, sign = false, blank = '—' } = {}) {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return blank;
  const n = Number(v);
  const s = Math.abs(n).toLocaleString('el-GR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return `${n < 0 ? '−' : sign && n > 0 ? '+' : ''}${s} €`;
}
export const money0 = (v, o = {}) => money(v, { dec: 0, ...o });
export function parseMoney(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return s;
  let t = String(s).replace(/[€\s]/g, '').trim();
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (t.includes(',')) t = t.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // «2.800» = δύο χιλιάδες οκτακόσια (ελληνική γραφή)
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
export const pad2 = (n) => String(n).padStart(2, '0');
export function todayISO() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
export function parseISO(s) { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
export function fmtDate(s, blank = '—') { if (!s) return blank; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
/** Διαφημιστικό και Άλλο δεν έχουν PDF προσφοράς */
export const needsOffer = (cat) => cat !== 'promo' && cat !== 'other';
/** Αρμοδιότητες συνεργείου */
export const DUTIES = [{ v: 'photo', el: 'Φωτογραφία', en: 'Photo', e: '📷' }, { v: 'video', el: 'Βίντεο', en: 'Video', e: '🎥' }, { v: 'drone', el: 'Drone', en: 'Drone', e: '🚁' }];
export const dutyLabel = (d) => { const o = DUTIES.find((x) => x.v === d) || DUTIES[0]; return L(o.el, o.en); };
export const dutyEmoji = (d) => (DUTIES.find((x) => x.v === d) || DUTIES[0]).e;
export function fmtTime(s) { return s ? String(s).slice(0, 5) : ''; }
/** Ώρα πάντα σε 24ωρη μορφή ΩΩ:ΛΛ (π.χ. «930» → «09:30», «18» → «18:00»). null αν δεν είναι έγκυρη. */
export function normTime(v) {
  const t = String(v ?? '').trim().replace(/[:.,]$/, '');
  if (!t) return '';
  let h, m;
  const mm = t.match(/^(\d{1,2})\s*[:.,]\s*(\d{1,2})$/);
  if (mm) { h = +mm[1]; m = +mm[2]; }
  else if (/^\d{1,4}$/.test(t)) { if (t.length <= 2) { h = +t; m = 0; } else { h = +t.slice(0, t.length - 2); m = +t.slice(-2); } }
  else return null;
  if (h > 23 || m > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
/** Πεδίο ώρας 24ωρης μορφής (αντί του <input type=time> που σε κάποια κινητά δείχνει ΠΜ/ΜΜ) */
export const timeInputAttrs = 'type="text" inputmode="numeric" maxlength="5" placeholder="ΩΩ:ΛΛ" data-time autocomplete="off"';
if (typeof document !== 'undefined' && !window.__imTimeBound) {
  window.__imTimeBound = true;
  document.addEventListener('input', (e) => {
    const i = e.target; if (!i?.matches?.('input[data-time]')) return;
    const d = i.value.replace(/[^\d:]/g, '');
    if (e.inputType && e.inputType.startsWith('delete')) { i.value = d; return; }
    i.value = /^\d{3,4}$/.test(d) ? d.slice(0, d.length - 2).padStart(2, '0') + ':' + d.slice(-2) : (/^\d{2}$/.test(d) && +d <= 23 ? d + ':' : d).slice(0, 5);
  }, true);
  document.addEventListener('blur', (e) => {
    const i = e.target; if (!i?.matches?.('input[data-time]')) return;
    const n = normTime(i.value);
    if (n === null) { i.classList.add('invalid'); return; }
    i.classList.remove('invalid');
    if (n !== i.value) { i.value = n; i.dispatchEvent(new Event('input', { bubbles: true })); }
  }, true);
}
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 864e5); }
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
export const MONTHS_EL = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const MONTHS_EL_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
export const MONTHS_EL_UP = ['ΙΑΝΟΥΑΡΙΟΣ', 'ΦΕΒΡΟΥΑΡΙΟΣ', 'ΜΑΡΤΙΟΣ', 'ΑΠΡΙΛΙΟΣ', 'ΜΑΙΟΣ', 'ΙΟΥΝΙΟΣ', 'ΙΟΥΛΙΟΣ', 'ΑΥΓΟΥΣΤΟΣ', 'ΣΕΠΤΕΜΒΡΙΟΣ', 'ΟΚΤΩΒΡΙΟΣ', 'ΝΟΕΜΒΡΙΟΣ', 'ΔΕΚΕΜΒΡΙΟΣ'];
export const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DOW_EL = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const DOW_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DOW_SHORT_EL = ['Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ', 'Κυρ'];
export const DOW_SHORT_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const monthName = (i) => (LANG === 'en' ? MONTHS_EN[i] : MONTHS_EL[i]);
export const monthShort = (i) => (LANG === 'en' ? MONTHS_EN[i].slice(0, 3) : ['Ιαν', 'Φεβ', 'Μάρ', 'Απρ', 'Μάι', 'Ιούν', 'Ιούλ', 'Αύγ', 'Σεπ', 'Οκτ', 'Νοέ', 'Δεκ'][i]);
export function fmtDateLong(s) {
  if (!s) return '—';
  const d = parseISO(s);
  return LANG === 'en'
    ? `${DOW_EN[d.getDay()]}, ${d.getDate()} ${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`
    : `${DOW_EL[d.getDay()]} ${d.getDate()} ${MONTHS_EL_GEN[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateMed(s) {
  if (!s) return '—';
  const d = parseISO(s);
  return LANG === 'en' ? `${d.getDate()} ${MONTHS_EN[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : `${d.getDate()} ${MONTHS_EL_GEN[d.getMonth()]} ${d.getFullYear()}`;
}
export function relDays(s) {
  const n = daysBetween(todayISO(), s);
  if (n === 0) return L('Σήμερα', 'Today');
  if (n === 1) return L('Αύριο', 'Tomorrow');
  if (n === -1) return L('Χθες', 'Yesterday');
  if (n > 0) return L(`σε ${n} ημέρες`, `in ${n} days`);
  return L(`πριν από ${-n} ημέρες`, `${-n} days ago`);
}
export function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return L('μόλις τώρα', 'just now');
  if (s < 3600) return L(`πριν ${Math.floor(s / 60)}′`, `${Math.floor(s / 60)}m ago`);
  if (s < 86400) return L(`πριν ${Math.floor(s / 3600)} ώρ.`, `${Math.floor(s / 3600)}h ago`);
  if (s < 7 * 86400) return L(`πριν ${Math.floor(s / 86400)} ημ.`, `${Math.floor(s / 86400)}d ago`);
  return fmtDate(new Date(ts).toISOString().slice(0, 10));
}
export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
export function colorFor(str) {
  const palette = ['#a96f45', '#2f86d6', '#8e5bd6', '#1a9f8b', '#d4564a', '#c98a1a', '#5a6fd6', '#3c9a5f', '#c2557d', '#6b7b8c'];
  let h = 0; for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

// ---------- Σύνδεσμοι ----------
/** Χρώμα μόνο σε μορφή #hex (προστασία από κακόβουλες τιμές μέσα σε style="") */
export const safeColor = (c, id) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : colorFor(id));
export function mapsUrl(loc) {
  const s = String(loc || '').trim();
  // σύνδεσμος χάρτη: μόνο http(s) και πάντα «καθαρισμένος» (όχι εισαγωγή κώδικα μέσα στο href)
  if (/^https?:\/\//i.test(s)) { try { const u = new URL(s); if (/^https?:$/.test(u.protocol)) return u.href.replace(/"/g, '%22').replace(/'/g, '%27').replace(/</g, '%3C').replace(/>/g, '%3E'); } catch {} }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s)}`;
}
export function cleanPhone(p) {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (/^69\d{8}$/.test(s) || /^2\d{9}$/.test(s)) s = '+30' + s;
  return s;
}
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const telUrl = (p) => `tel:${cleanPhone(p)}`;
export const smsUrl = (p, body = '') => `sms:${cleanPhone(p)}${body ? (isIOS() ? '&' : '?') + 'body=' + encodeURIComponent(body) : ''}`;
export const mailUrl = (to, subject = '', body = '') => `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const waUrl = (p, body = '') => `https://wa.me/${cleanPhone(p).replace('+', '')}?text=${encodeURIComponent(body)}`;
export const viberUrl = (body = '') => `viber://forward?text=${encodeURIComponent(body)}`;

/** Ονόματα αρχείων με λατινικούς χαρακτήρες (κάποιοι browsers αγνοούν ελληνικά ονόματα λήψης) */
export function latinName(s) {
  const m = { α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z', η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', ϋ: 'y', ΰ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o' };
  return String(s || '').split('').map((ch) => { const lo = ch.toLowerCase(); const t = m[lo]; if (t === undefined) return ch; return ch !== lo ? t.charAt(0).toUpperCase() + t.slice(1) : t; }).join('')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
}
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}
export function loadScript(src) {
  return new Promise((res, rej) => {
    if ([...document.scripts].some((s) => s.src.endsWith(src.replace(/^\.\//, '')))) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load ' + src));
    document.head.appendChild(s);
  });
}
export function haptic(ms = 8) { try { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate?.(ms); } catch {} }

// ---------- Εικονίδια ----------
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  events: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M7.5 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.7c1.8.7 3 2.4 3.5 5.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1-4 4.2-6.2 8-6.2s7 2.2 8 6.2"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="14" rx="3"/><path d="M2.5 10h19M16.5 15h1.5"/><path d="M6 6l9.5-3a1.5 1.5 0 0 1 2 1.4V6"/>',
  table: '<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M3 9h18M3 14.5h18M9 9v11.5M15 9v11.5"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M7 3v18M17 3v18M3 7.5h4M3 12h18M3 16.5h4M17 7.5h4M17 16.5h4"/>',
  inbox: '<path d="M3 13.5h5l1.5 3h5l1.5-3h5"/><path d="M5.5 5h13l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-5.5Z"/>',
  message: '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.5-5A8.5 8.5 0 1 1 21 11.5Z"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.7 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.8 7.5-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.3-2.5 4"/><path d="M12 17.2v.1"/>',
  bell: '<path d="M6 8.5a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 14.5 6 8.5Z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.5-4.5"/>',
  chevR: '<path d="m9 5 7 7-7 7"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>',
  chevD: '<path d="m5 9 7 7 7-7"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  phone: '<path d="M5 3.5h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.6 6.6l1.4-2.3 4.5 1.8V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.1 1.5 1.5 0 0 1 5 3.5Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5.5-6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7"/>',
  edit: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9S14.5 18.3 12 21c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z"/>',
  logout: '<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l-4-4 4-4M6 12h10"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4 1.5v-8Z"/>',
  download: '<path d="M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15"/>',
  upload: '<path d="M12 16V4M7 8.5l5-5 5 5M4.5 20.5h15"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  camera: '<path d="M3.5 8.5a2 2 0 0 1 2-2h2L9 4h6l1.5 2.5h2a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/><circle cx="12" cy="13" r="3.7"/>',
  video: '<rect x="2.5" y="6" width="13.5" height="12" rx="2.5"/><path d="m16 10.5 5.5-3v9l-5.5-3Z"/>',
  warning: '<path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4.5M12 17.3v.1"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  euro: '<path d="M18 6.5A7 7 0 1 0 18 17.5M4 10h10M4 14h10"/>',
  incoming: '<path d="M17 7 7 17M7 9v8h8"/>',
  outgoing: '<path d="M7 17 17 7M9 7h8v8"/>',
  share: '<path d="M12 3.5v12M7.5 8 12 3.5 16.5 8"/><path d="M6 11.5H5a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 5 20.5h14a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
  copy: '<rect x="8" y="8" width="12.5" height="12.5" rx="2.5"/><path d="M16 8V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8"/>',
  send: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5Z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
  key: '<circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15.5l.8 2 2 .7-2 .8-.8 2-.7-2-2-.8 2-.7Z"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  map: '<path d="m9 4.5-5.5 2v13l5.5-2 6 2 5.5-2v-13l-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1.5"/><path d="M5 8.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V8.5M10 12.5h4"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H11v17H5.5A1.5 1.5 0 0 1 4 18.5ZM20 4.5A1.5 1.5 0 0 0 18.5 3H13v17h5.5a1.5 1.5 0 0 0 1.5-1.5Z"/>',
  backspace: '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12Z"/><path d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>',
  print: '<path d="M7 9V3.5h10V9M7 17.5H5A1.5 1.5 0 0 1 3.5 16v-5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v5a1.5 1.5 0 0 1-1.5 1.5h-2"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
  eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="3.5" width="18" height="17" rx="3"/><circle cx="9" cy="9.5" r="2"/><path d="m21 15.5-5-5L5 20.5"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M12 7v7M9 11l3 3 3-3M10.5 18.5h3"/>',
  sms: '<path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.5L3 20.5l1.5-5A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 11.5h.1M12 11.5h.1M16 11.5h.1"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  receipt: '<path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2 2 0 0 0-2.8 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a4 4 0 0 1 4.6-.7l.4.2a2 2 0 0 0 1.3.2L21 6"/><path d="m21 5 1 9-2 2"/><path d="M2 5l-1 9 6.5 6.5a1.4 1.4 0 0 0 2-2"/><path d="M2 5h7"/>',
  flow: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
  store: '<path d="M4 9.5V20h16V9.5M3 9.5 5 4h14l2 5.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/><path d="M10 20v-5h4v5"/>',
  trending: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18"/>',
  wand: '<path d="m4 20 11-11M14 4v3M18.5 5.5l-2 2M20 10h-3M12.5 2.5l.5 1.5"/>',
};
export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.help}</svg>`;

// ---------- Τιμές / λίστες ----------
export const CATEGORIES = [
  { v: 'wedding', el: 'Γάμος', en: 'Wedding' },
  { v: 'baptism', el: 'Βάπτιση', en: 'Baptism' },
  { v: 'wedding_baptism', el: 'Γαμοβάπτιση', en: 'Wedding & baptism' },
  { v: 'promo', el: 'Διαφημιστικό (Promotional)', en: 'Promotional' },
  { v: 'other', el: 'Άλλο', en: 'Other' },
];
export const PHOTO_STATUS = [
  { v: 'samples_todo', el: 'Να γίνουν δείγματα', en: 'Samples to be made' },
  { v: 'samples_waiting', el: 'Έλαβαν δείγματα και περιμένουμε', en: 'Client has samples – waiting' },
  { v: 'changes', el: 'Αλλαγές', en: 'Changes' },
  { v: 'lab', el: 'Εκτύπωση στο εργαστήριο', en: 'Printing at the lab' },
  { v: 'ready', el: 'Έτοιμα προς παραλαβή', en: 'Ready for pickup' },
  { v: 'delivered', el: 'Παραδόθηκαν στον πελάτη', en: 'Delivered to client' },
];
/** Προειδοποιητικά χρώματα workflow: ημέρες στο ίδιο στάδιο → πορτοκαλί / κόκκινο */
export const WF_RULES = {
  samples_todo: { warn: 25, late: 35, next: 'samples_waiting' },
  samples_waiting: { warn: 20, late: 35, next: 'changes' },
  changes: { warn: 20, late: 30, next: 'lab' },
  ready: { warn: 7, late: 14, next: 'delivered' },
};
export const APPT_MODES = [
  { v: 'store', el: 'Παρουσίαση στο μαγαζί', en: 'In-store presentation', icon: 'store' },
  { v: 'online', el: 'Ηλεκτρονική παρουσίαση', en: 'Online presentation', icon: 'link' },
];
export const APPT_STATUS = [
  { v: 'pending', el: 'Σε αναμονή', en: 'Pending' },
  { v: 'confirmed', el: 'Confirmed', en: 'Confirmed' },
  { v: 'rejected', el: 'Rejected', en: 'Rejected' },
];
export const REJECT_REASONS = [
  { v: 'price', el: 'Τιμή / budget', en: 'Price / budget' },
  { v: 'date', el: 'Ημερομηνία μη διαθέσιμη', en: 'Date not available' },
  { v: 'competitor', el: 'Επέλεξαν άλλον', en: 'Chose someone else' },
  { v: 'no_answer', el: 'Δεν απάντησαν', en: 'No answer' },
  { v: 'cancelled', el: 'Ακύρωσαν την εκδήλωση', en: 'Event cancelled' },
  { v: 'other', el: 'Άλλο', en: 'Other' },
];
/** Κατάσταση editing (Excel) = «Προτεραιότητα» στο φύλλο Dimitris. alias = ονομασίες που υπήρξαν (για επαναφορά αντιγράφων) */
export const EDIT_STATUS = [
  { v: 'none', el: '—', en: '—' },
  { v: 'todo', el: 'Να γίνει', en: 'To do', alias: ['όχι έτοιμο', 'not ready'] },
  { v: 'in_progress', el: 'Σε επεξεργασία', en: 'In progress', alias: ['υπό επεξεργασία', 'έτοιμο να γίνει export', 'ready for export'] },
  { v: 'done', el: 'Ολοκληρώθηκε', en: 'Done', alias: ['έτοιμο', 'ready'] },
];
/** Κατάσταση Βίντεο του φύλλου Dimitris (ξεχωριστό πεδίο) */
export const VIDEO_STATUS = [
  { v: 'not_ready', el: 'όχι έτοιμο', en: 'not ready', tone: 'red' },
  { v: 'in_progress', el: 'υπό επεξεργασία', en: 'in progress', tone: 'blue' },
  { v: 'export', el: 'έτοιμο να γίνει export', en: 'ready for export', tone: 'yellow' },
  { v: 'ready', el: 'έτοιμο', en: 'ready', tone: 'green' },
];
export const PCS = [
  { v: 'macbook', el: 'macbook', en: 'macbook', tone: 'grey', alias: ['MacBook'] },
  { v: 'mac_mini', el: 'mac mini', en: 'mac mini', tone: 'grey', alias: ['Mac Mini'] },
  { v: 'win_pc', el: 'win pc', en: 'win pc', tone: 'grey', alias: ['Win PC'] },
];
/** Είναι στο μαγαζί; */
export const SHOP_STATUS = [
  { v: 'to_deliver', el: 'να παραδοθεί στο μαγαζί', en: 'to be delivered to the shop', tone: 'orange' },
  { v: 'delivered', el: 'παραδόθηκε στο μαγαζί', en: 'delivered to the shop', tone: 'green' },
];
/** Περασμένα αρχεία */
export const FILES_COPIED = [
  { v: 'yes', el: 'ναι', en: 'yes', tone: 'solid-green' },
  { v: 'no', el: 'όχι', en: 'no', tone: 'solid-red' },
];
/** Αποθηκευμένο σε */
export const STORED_AT = [
  { v: 'home', el: 'Σπίτι', en: 'Home', tone: 'grey' },
  { v: 'shop', el: 'Μαγαζί', en: 'Shop', tone: 'grey' },
  { v: 'both', el: 'Και τα 2', en: 'Both', tone: 'grey' },
];
export const RESOLUTIONS = [
  { v: '1080', el: 'Full HD (1080p)', en: 'Full HD (1080p)' },
  { v: '4k', el: '4K', en: '4K' },
];
export const METHODS = [
  { v: 'cash', el: 'Μετρητά', en: 'Cash' },
  { v: 'card', el: 'Κάρτα / POS', en: 'Card / POS' },
  { v: 'bank', el: 'Τραπεζική μεταφορά', en: 'Bank transfer' },
  { v: 'iris', el: 'IRIS', en: 'IRIS' },
  { v: 'other', el: 'Άλλο', en: 'Other' },
];
export const EXPENSE_KINDS = [
  { v: 'payroll', el: 'Μισθοδοσία', en: 'Payroll', icon: 'briefcase' },
  { v: 'daily_wage', el: 'Μεροκάματα', en: 'Daily wages', icon: 'user' },
  { v: 'investment', el: 'Επενδύσεις', en: 'Investments', icon: 'trending' },
  { v: 'shop', el: 'Μαγαζί', en: 'Shop', icon: 'store' },
  { v: 'other', el: 'Άλλο', en: 'Other', icon: 'receipt' },
];
export const SHOP_SUBS = [
  { v: 'rent', el: 'Ενοίκιο', en: 'Rent' },
  { v: 'electricity', el: 'Ρεύμα', en: 'Electricity' },
  { v: 'internet', el: 'Internet', en: 'Internet' },
  { v: 'water', el: 'Νερό', en: 'Water' },
  { v: 'common', el: 'Κοινόχρηστα', en: 'Building fees' },
  { v: 'misc', el: 'Διάφορα', en: 'Miscellaneous' },
];
export const OTHER_SUBS = [
  { v: 'accountant', el: 'Λογιστής / Επαγγελματικές υπηρεσίες', en: 'Accountant / Services' },
  { v: 'equipment', el: 'Εξοπλισμός / Αναλώσιμα', en: 'Equipment / Supplies' },
  { v: 'travel', el: 'Μετακινήσεις / Καύσιμα', en: 'Travel / Fuel' },
  { v: 'subscriptions', el: 'Λογαριασμοί / Συνδρομές', en: 'Bills / Subscriptions' },
  { v: 'bank', el: 'Τραπεζικά / POS', en: 'Bank / POS fees' },
  { v: 'marketing', el: 'Marketing', en: 'Marketing' },
  { v: 'lab', el: 'Εργαστήριο / Εκτυπώσεις', en: 'Lab / Printing' },
  { v: 'taxes', el: 'Φόροι / Εισφορές', en: 'Taxes / Contributions' },
  { v: 'misc', el: 'Άλλο', en: 'Other' },
];
export const ROLES = [
  { v: 'admin_photo', el: 'Διαχειριστής (Φωτογράφος)', en: 'Admin (Photographer)' },
  { v: 'admin_video', el: 'Διαχειριστής (Βιντεογράφος)', en: 'Admin (Videographer)' },
  { v: 'photographer', el: 'Φωτογράφος', en: 'Photographer' },
  { v: 'videographer', el: 'Βιντεογράφος', en: 'Videographer' },
];
export const TRIGGERS = [
  { v: 'on_booking', el: 'Με το κλείσιμο της εκδήλωσης', en: 'When the event is booked' },
  { v: 'before_event', el: 'Ημέρες πριν την εκδήλωση', en: 'Days before the event' },
  { v: 'after_event', el: 'Μετά το τέλος της εκδήλωσης', en: 'After the event' },
  { v: 'on_payment', el: 'Με κάθε πληρωμή (επιβεβαίωση)', en: 'On every payment (confirmation)' },
  { v: 'unpaid_after_event', el: 'Μετά την εκδήλωση, αν δεν έχει πληρωθεί το ποσοστό', en: 'After the event, if the % is not paid' },
];
export const CHANNELS = [
  { v: 'sms', el: 'SMS', en: 'SMS' },
  { v: 'email', el: 'Email', en: 'Email' },
  { v: 'whatsapp', el: 'WhatsApp', en: 'WhatsApp' },
  { v: 'viber', el: 'Viber', en: 'Viber' },
];
export const opt = (list, v) => list.find((o) => o.v === v);
export const lbl = (list, v, blank = '—') => { const o = opt(list, v); return o ? L(o.el, o.en) : (v || blank); };
export const options = (list, sel, { blank } = {}) =>
  (blank !== undefined ? `<option value="">${esc(blank)}</option>` : '') +
  list.map((o) => `<option value="${esc(o.v)}"${o.v === sel ? ' selected' : ''}>${esc(L(o.el, o.en))}</option>`).join('');

// ---------- Toast ----------
let toastsEl;
export function toast(title, { body = '', type = 'ok', ms = 3200, onClick } = {}) {
  if (!toastsEl) { toastsEl = el('<div class="toasts" aria-live="polite"></div>'); document.body.appendChild(toastsEl); }
  const ic = type === 'err' ? 'warning' : type === 'info' ? 'bell' : 'checkCircle';
  const t = el(`<div class="toast ${type}" role="status">${icon(ic)}<div><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}</div></div>`);
  if (onClick) { t.style.cursor = 'pointer'; t.addEventListener('click', () => { onClick(); close(); }); }
  toastsEl.appendChild(t);
  if (type === 'err') haptic([10, 40, 10]); else haptic();
  let done = false;
  function close() { if (done) return; done = true; t.classList.add('out'); setTimeout(() => t.remove(), 300); }
  setTimeout(close, ms);
  let sy = null;
  t.addEventListener('touchstart', (e) => { sy = e.touches[0].clientY; }, { passive: true });
  t.addEventListener('touchmove', (e) => { if (sy !== null && e.touches[0].clientY - sy < -12) close(); }, { passive: true });
  return close;
}
export const toastErr = (title, body) => toast(title, { type: 'err', body, ms: 5200 });

// ---------- Layers (sheet, alert, action sheet) ----------
const layers = [];
function pushLayer(layer, onClose) {
  document.body.appendChild(layer);
  layers.push({ layer, onClose });
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('open')));
  if (layers.length === 1) document.body.style.overflow = 'hidden';
}
function popLayer(layer) {
  const i = layers.findIndex((x) => x.layer === layer);
  if (i < 0) return;
  const [{ onClose }] = layers.splice(i, 1);
  layer.classList.remove('open');
  setTimeout(() => layer.remove(), 420);
  if (!layers.length) document.body.style.overflow = '';
  onClose?.();
}
export const hasLayer = () => layers.length > 0;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) {
    const top = layers[layers.length - 1];
    if (!top.layer.dataset.noesc) top.layer.querySelector('[data-close]')?.click();
  }
});

/**
 * Bottom sheet / modal.
 * opts: { title, body (html|Node), foot (html), wide, left (html), right(html), onOpen(root, close), onClose, dismissible }
 */
export function sheet(opts) {
  const layer = el(`<div class="layer" role="dialog" aria-modal="true">
    <div class="backdrop" data-close></div>
    <div class="sheet ${opts.wide ? 'wide' : ''} ${opts.full ? 'full' : ''}">
      <div class="grabber"></div>
      <div class="sheet-head">
        <div class="side">${opts.left ?? `<button class="btn plain" data-close>${esc(L('Κλείσιμο', 'Close'))}</button>`}</div>
        <h3>${esc(opts.title || '')}</h3>
        <div class="side r">${opts.right ?? ''}</div>
      </div>
      <div class="sheet-body"></div>
      ${opts.foot ? `<div class="sheet-foot">${opts.foot}</div>` : ''}
    </div>
  </div>`);
  const body = layer.querySelector('.sheet-body');
  if (typeof opts.body === 'string') body.innerHTML = opts.body; else if (opts.body) body.appendChild(opts.body);
  let closed = false;
  const close = (val) => { if (closed) return; closed = true; popLayer(layer); opts.onClose?.(val); };
  layer.addEventListener('click', (e) => {
    const c = e.target.closest('[data-close]');
    if (c && layer.contains(c)) {
      if (c.classList.contains('backdrop') && opts.dismissible === false) return;
      close();
    }
  });
  // drag-to-dismiss (mobile)
  const sh = layer.querySelector('.sheet'); const head = layer.querySelector('.sheet-head'); const grab = layer.querySelector('.grabber');
  let y0 = null, dy = 0;
  const start = (e) => { if (window.innerWidth > 640 || opts.dismissible === false) return; y0 = e.touches[0].clientY; dy = 0; sh.classList.add('dragging'); };
  const move = (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.setProperty('--drag', dy + 'px'); };
  const end = () => { if (y0 === null) return; sh.classList.remove('dragging'); y0 = null; if (dy > 110) close(); else sh.style.setProperty('--drag', '0px'); };
  [head, grab].forEach((h) => { h.addEventListener('touchstart', start, { passive: true }); h.addEventListener('touchmove', move, { passive: true }); h.addEventListener('touchend', end); });
  pushLayer(layer, null);
  opts.onOpen?.(layer, close);
  return { root: layer, body, close };
}

export function alertBox({ title, text = '', buttons = [{ label: 'OK', value: true, bold: true }], input = null }) {
  return new Promise((resolve) => {
    const layer = el(`<div class="layer" role="alertdialog" aria-modal="true" data-noesc="1">
      <div class="backdrop"></div>
      <div class="alert">
        <div class="a-body"><h4>${esc(title)}</h4>${text ? `<p>${esc(text)}</p>` : ''}
          ${input ? `<div class="a-input"><input class="input" ${input.type ? `type="${input.type}"` : ''} ${input.inputmode ? `inputmode="${input.inputmode}"` : ''} placeholder="${esc(input.placeholder || '')}" value="${esc(input.value || '')}" autocomplete="off"></div>` : ''}
        </div>
        <div class="a-actions">${buttons.map((b, i) => `<button data-i="${i}" class="${b.bold ? 'bold' : ''} ${b.destructive ? 'destructive' : ''}">${esc(b.label)}</button>`).join('')}</div>
      </div></div>`);
    const inp = layer.querySelector('input');
    layer.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const btn = buttons[+b.dataset.i];
      popLayer(layer);
      resolve(input ? (btn.value ? inp.value : null) : btn.value);
    });
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const bi = buttons.findIndex((b) => b.bold); layer.querySelector(`button[data-i="${bi >= 0 ? bi : buttons.length - 1}"]`).click(); } });
    pushLayer(layer);
    setTimeout(() => inp?.focus(), 120);
  });
}
export const confirmBox = (title, text = '', { ok = L('OK', 'OK'), cancel = L('Ακύρωση', 'Cancel'), destructive = false } = {}) =>
  alertBox({ title, text, buttons: [{ label: cancel, value: false }, { label: ok, value: true, bold: !destructive, destructive }] });
export const promptBox = (title, text = '', input = {}) =>
  alertBox({ title, text, input, buttons: [{ label: L('Ακύρωση', 'Cancel'), value: false }, { label: input.ok || L('OK', 'OK'), value: true, bold: true }] });
export const infoBox = (title, text = '') => alertBox({ title, text, buttons: [{ label: L('Εντάξει', 'OK'), value: true, bold: true }] });

export function actionSheet({ title = '', actions = [] }) {
  return new Promise((resolve) => {
    const layer = el(`<div class="layer as" role="dialog" aria-modal="true">
      <div class="backdrop" data-v=""></div>
      <div class="actionsheet">
        <div class="grp">${title ? `<div class="as-title">${esc(title)}</div>` : ''}
          ${actions.map((a, i) => `<button data-v="${i}" class="${i === 0 && title ? 'after-title' : ''} ${a.destructive ? 'destructive' : ''}">${a.icon ? icon(a.icon) : ''}${esc(a.label)}</button>`).join('')}
        </div>
        <div class="grp"><button class="cancel" data-v="">${esc(L('Ακύρωση', 'Cancel'))}</button></div>
      </div></div>`);
    layer.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      popLayer(layer);
      const a = b.dataset.v === '' ? null : actions[+b.dataset.v];
      resolve(a ? (a.value ?? a.label) : null);
    });
    pushLayer(layer);
  });
}

// ---------- Segmented control ----------
export function segmented(name, items, value, { block = false } = {}) {
  return `<div class="segmented ${block ? 'block' : ''}" data-seg="${esc(name)}" role="tablist">
    <span class="thumb"></span>
    ${items.map((it) => `<button type="button" role="tab" data-v="${esc(it.v)}" aria-selected="${it.v === value}">${esc(it.label)}</button>`).join('')}
  </div>`;
}
export function initSegmented(root, onChange) {
  $$('.segmented', root).forEach((seg) => {
    const place = () => {
      const cur = seg.querySelector('button[aria-selected="true"]') || seg.querySelector('button');
      const th = seg.querySelector('.thumb');
      if (!cur || !th) return;
      th.style.width = cur.offsetWidth + 'px';
      th.style.transform = `translateX(${cur.offsetLeft - 2}px)`;
    };
    requestAnimationFrame(place);
    new ResizeObserver(place).observe(seg);
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]'); if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      place(); haptic(5);
      onChange?.(seg.dataset.seg, b.dataset.v);
    });
  });
}
export const segValue = (root, name) => root.querySelector(`.segmented[data-seg="${name}"] button[aria-selected="true"]`)?.dataset.v;

// ---------- Form helpers ----------
export function field(label, inner, { req = false, help = '', full = false, id = '' } = {}) {
  return `<div class="field ${full ? 'full' : ''}" ${id ? `data-field="${id}"` : ''}><label>${esc(label)}${req ? ' <span class="req">*</span>' : ''}</label>${inner}${help ? `<div class="help">${help}</div>` : ''}<div class="err" hidden></div></div>`;
}
export function setErr(root, name, msg) {
  const inp = root.querySelector(`[name="${name}"]`);
  const f = inp?.closest('.field') || root.querySelector(`[data-field="${name}"]`);
  inp?.classList.toggle('invalid', !!msg);
  const e = f?.querySelector('.err');
  if (e) { e.hidden = !msg; e.textContent = msg || ''; }
  return !msg;
}
export function formData(root) {
  const o = {};
  $$('[name]', root).forEach((i) => {
    if (i.type === 'checkbox') o[i.name] = i.checked;
    else if (i.type === 'radio') { if (i.checked) o[i.name] = i.value; }
    else o[i.name] = i.value.trim();
  });
  return o;
}
export function busy(btn, on, text) {
  if (!btn) return;
  if (on) { btn.dataset.txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner dark" style="width:18px;height:18px;margin:0;border-width:2px"></span>${text ? ' ' + esc(text) : ''}`; }
  else { btn.disabled = false; if (btn.dataset.txt) btn.innerHTML = btn.dataset.txt; }
}

// ---------- ICS (προσθήκη στο ημερολόγιο κινητού) ----------
export function icsFor(ev, title, location, description) {
  const d = (ev.event_date || '').replace(/-/g, '');
  const t = (ev.event_time || '12:00').slice(0, 5).replace(':', '') + '00';
  const endH = String(Math.min(23, Number((ev.event_time || '12:00').slice(0, 2)) + 8)).padStart(2, '0');
  const escI = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Image Makers//Studio Manager//EL', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${ev.id}@imagemakers`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Athens:${d}T${t}`, `DTEND;TZID=Europe/Athens:${d}T${endH}${t.slice(2)}`,
    `SUMMARY:${escI(title)}`, `LOCATION:${escI(location)}`, `DESCRIPTION:${escI(description)}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${escI(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

/** Κλητική πτώση μικρού ονόματος (Γιώργος → Γιώργο, Κώστας → Κώστα) */
export function vocative(name) {
  const n = String(name || '').trim().split(/\s+/)[0] || '';
  if (LANG === 'en') return n;
  if (/ας$/.test(n)) return n.slice(0, -1);
  if (/ης$/.test(n)) return n.slice(0, -1);
  if (/ούς$/.test(n)) return n.slice(0, -1);
  if (/ος$/.test(n)) {
    const stem = n.slice(0, -2);
    if (/ι$/.test(stem)) return stem + 'ο';
    const acc = stem.search(/[άέήίόύώ]/);
    if (acc < 0) return stem + 'ο';
    const after = stem.slice(acc + 1).match(/[αεηιουω]+/g) || [];
    return stem + (after.length >= 1 ? 'ε' : 'ο');
  }
  return n;
}
/** Κλείνει όλα τα ανοιχτά παράθυρα (π.χ. όταν αλλάζει σελίδα) */
export function closeAllLayers() { [...layers].forEach((l) => popLayer(l.layer)); }
