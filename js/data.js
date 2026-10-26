// =====================================================================
//  Data layer: Supabase, κοινή μνήμη (store), realtime, ενέργειες
// =====================================================================
import { L, toastErr, sum, debounce, todayISO, esc } from './core.js';

const CFG = window.IM_CONFIG || {};
export const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/YOUR|ΒΑΛΤΕ/.test(CFG.SUPABASE_URL));
export const sb = configured
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'im.auth' },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export const S = {
  session: null,
  profile: null,
  profiles: [],
  customers: new Map(),
  events: new Map(),
  finance: new Map(),
  crew: [],
  payments: [],
  expenses: [],
  notifications: [],
  queue: [],
  templates: [],
  requests: [],
  appointments: [],
  wfTemplates: [],
  settings: {},
  invites: [],
  loaded: false,
  online: navigator.onLine,
  realtime: false,
};

// ---------- Συνδρομητές ----------
const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export const emit = debounce((what) => subs.forEach((f) => { try { f(what); } catch (e) { console.error(e); } }), 60);

// ---------- Ρόλοι ----------
export const role = () => S.profile?.role || null;
export const isAdmin = () => ['admin_photo', 'admin_video'].includes(role()) && S.profile?.active !== false;
export const isVideoAdmin = () => role() === 'admin_video' && S.profile?.active !== false;
export const hasRole = () => !!role() && S.profile?.active !== false;

// ---------- Φιλικά μηνύματα σφάλματος ----------
export function friendlyError(err) {
  const m = String(err?.message || err?.error_description || err || '');
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return L('Δεν υπάρχει σύνδεση στο internet. Δοκιμάστε ξανά.', 'No internet connection. Please try again.');
  if (/Invalid login credentials/i.test(m)) return L('Λάθος στοιχεία σύνδεσης ή PIN.', 'Wrong login details or PIN.');
  if (/Email not confirmed/i.test(m)) return L('Το email δεν έχει επιβεβαιωθεί. Ελέγξτε τα εισερχόμενά σας.', 'Email not confirmed. Check your inbox.');
  if (/User already registered|already been registered/i.test(m)) return L('Υπάρχει ήδη λογαριασμός με αυτό το email.', 'An account with this email already exists.');
  if (/rate limit|too many/i.test(m)) return L('Πολλές προσπάθειες. Περιμένετε λίγο και δοκιμάστε ξανά.', 'Too many attempts. Please wait a moment.');
  if (/row-level security|permission denied|not_allowed/i.test(m)) return L('Δεν έχετε δικαίωμα για αυτή την ενέργεια.', 'You are not allowed to do this.');
  if (/last_admin/.test(m)) return L('Πρέπει να μείνει τουλάχιστον ένας διαχειριστής.', 'At least one admin must remain.');
  if (/cannot_disable_self/.test(m)) return L('Δεν μπορείτε να απενεργοποιήσετε τον εαυτό σας.', 'You cannot disable yourself.');
  if (/violates foreign key.*customers|events_customer_id_fkey/i.test(m)) return L('Ο πελάτης έχει εκδηλώσεις. Διαγράψτε πρώτα τις εκδηλώσεις του.', 'This customer has events. Delete the events first.');
  if (/duplicate key/i.test(m)) return L('Υπάρχει ήδη εγγραφή με αυτά τα στοιχεία.', 'This entry already exists.');
  if (/JWT|session/i.test(m)) return L('Η σύνδεση έληξε. Συνδεθείτε ξανά.', 'Your session expired. Please sign in again.');
  if (/Password should be at least/i.test(m)) return L('Το PIN πρέπει να έχει 6 ψηφία.', 'The PIN must have 6 digits.');
  return m || L('Κάτι πήγε στραβά.', 'Something went wrong.');
}
export async function q(promise, { silent = false } = {}) {
  const { data, error } = await promise;
  if (error) { if (!silent) toastErr(L('Δεν ολοκληρώθηκε', 'Not completed'), friendlyError(error)); throw error; }
  return data;
}

// ---------- Φόρτωση ----------
async function fetchAll(table, build = (x) => x, order = 'created_at') {
  const out = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await build(sb.from(table).select('*')).order(order, { ascending: true }).range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

export async function loadProfile() {
  const uid = S.session?.user?.id;
  if (!uid) { S.profile = null; return null; }
  const { data, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  S.profile = data;
  return data;
}

const loaders = {
  profiles: async () => { S.profiles = await fetchAll('profiles'); },
  customers: async () => { S.customers = new Map((await fetchAll('customers')).map((r) => [r.id, r])); },
  events: async () => { S.events = new Map((await fetchAll('events', (x) => x, 'event_date')).map((r) => [r.id, r])); },
  event_crew: async () => { S.crew = await fetchAll('event_crew'); },
  event_finance: async () => { S.finance = isAdmin() ? new Map((await fetchAll('event_finance', (x) => x, 'event_id')).map((r) => [r.event_id, r])) : new Map(); },
  payments: async () => { S.payments = isAdmin() ? await fetchAll('payments') : []; },
  expenses: async () => { S.expenses = isAdmin() ? await fetchAll('expenses') : []; },
  notifications: async () => {
    const { data, error } = await sb.from('notifications').select('*').eq('user_id', S.profile.id).order('created_at', { ascending: false }).limit(200);
    if (error) throw error; S.notifications = data;
  },
  message_queue: async () => {
    if (!isAdmin()) { S.queue = []; return; }
    const { data, error } = await sb.from('message_queue').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error; S.queue = data;
  },
  message_templates: async () => { S.templates = isAdmin() ? await fetchAll('message_templates') : []; },
  offer_requests: async () => {
    if (!isAdmin()) { S.requests = []; return; }
    const { data, error } = await sb.from('offer_requests').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error; S.requests = data;
  },
  appointments: async () => {
    if (!isAdmin()) { S.appointments = []; return; }
    const { data, error } = await sb.from('appointments').select('*').order('appt_date', { ascending: false }).order('created_at', { ascending: false }).limit(3000);
    if (error) throw error; S.appointments = data;
  },
  workflow_templates: async () => {
    if (!isAdmin()) { S.wfTemplates = []; return; }
    const { data, error } = await sb.from('workflow_templates').select('*').order('sort', { ascending: true });
    if (error) throw error; S.wfTemplates = data;
  },
  app_settings: async () => {
    const { data, error } = await sb.from('app_settings').select('*');
    if (error) throw error; S.settings = Object.fromEntries(data.map((r) => [r.key, r.value]));
  },
};

export async function loadAll() {
  await Promise.all(Object.values(loaders).map((f) => f()));
  S.loaded = true;
  emit('all');
}
export async function reload(table) {
  if (!loaders[table]) return;
  try { await loaders[table](); emit(table); } catch (e) { console.warn('reload', table, e); }
}
const reloadSoon = {};
function scheduleReload(table) {
  clearTimeout(reloadSoon[table]);
  reloadSoon[table] = setTimeout(() => reload(table), 250);
}

// ---------- Realtime ----------
let channel = null;
let onNewNotification = null;
export function setNotificationHandler(fn) { onNewNotification = fn; }
export function startRealtime() {
  stopRealtime();
  const tables = ['notifications', 'events', 'event_crew', 'event_finance', 'payments', 'expenses', 'customers', 'message_queue', 'offer_requests', 'profiles', 'appointments', 'workflow_templates'];
  channel = sb.channel('im-db');
  tables.forEach((t) => {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: t }, (payload) => {
      if (t === 'notifications') {
        if (payload.eventType === 'INSERT' && payload.new?.user_id === S.profile?.id) {
          if (!S.notifications.some((n) => n.id === payload.new.id)) {
            S.notifications.unshift(payload.new);
            onNewNotification?.(payload.new);
            emit('notifications');
          }
          return;
        }
      }
      if (t === 'event_crew') { scheduleReload('events'); scheduleReload('customers'); }
      if (t === 'profiles' && payload.new?.id === S.profile?.id) { S.profile = { ...S.profile, ...payload.new }; emit('me'); }
      scheduleReload(t);
    });
  });
  channel.subscribe((status) => { S.realtime = status === 'SUBSCRIBED'; });
}
export function stopRealtime() { if (channel) { sb.removeChannel(channel); channel = null; } }

// Ασφάλεια: ανανέωση όταν η εφαρμογή ξαναγίνεται ενεργή ή κάθε 60″ αν δεν υπάρχει realtime
let lastPoll = Date.now();
async function poll(force = false) {
  if (!S.profile || !hasRole()) return;
  if (!force && S.realtime && Date.now() - lastPoll < 5 * 60e3) return;
  lastPoll = Date.now();
  const before = new Set(S.notifications.map((n) => n.id));
  await Promise.all(Object.keys(loaders).map((t) => loaders[t]().catch(() => {})));
  S.notifications.filter((n) => !before.has(n.id) && !n.read_at).slice(0, 3).forEach((n) => onNewNotification?.(n));
  emit('all');
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(true); });
setInterval(() => poll(false), 60e3);
window.addEventListener('online', () => { S.online = true; emit('online'); poll(true); });
window.addEventListener('offline', () => { S.online = false; emit('online'); });

// ---------- Παράγωγα ----------
export const coupleName = (c, { short = false } = {}) => {
  if (!c) return L('Χωρίς πελάτη', 'No customer');
  const f = (s) => (short ? String(s || '').trim().split(/\s+/)[0] : String(s || '').trim());
  return [f(c.name1), f(c.name2)].filter(Boolean).join(' & ') || L('Χωρίς όνομα', 'No name');
};
export const profileName = (p) => (p ? (p.full_name || p.username || p.email) : '—');
export const profileById = (id) => S.profiles.find((p) => p.id === id);
export function paymentsFor(eventId) {
  return S.payments.filter((p) => p.event_id === eventId).sort((a, b) => (a.paid_on || '').localeCompare(b.paid_on || '') || a.created_at.localeCompare(b.created_at));
}
export function eventView(id) {
  const e = S.events.get(id);
  if (!e) return null;
  const c = S.customers.get(e.customer_id) || null;
  const f = S.finance.get(id) || {};
  const pays = isAdmin() ? paymentsFor(id) : [];
  const paid = sum(pays, (p) => p.amount);
  const price = f.package_price != null ? Number(f.package_price) : null;
  const balance = price != null ? Math.round((price - paid) * 100) / 100 : null;
  const crew = S.crew.filter((x) => x.event_id === id).map((x) => ({ ...x, profile: profileById(x.user_id) }));
  return { e, c, f, pays, paid, price, balance, fullyPaid: price != null && price > 0 && paid >= price - 0.009, crew, title: coupleName(c) };
}
export function allEventViews({ year = null, includeCancelled = true } = {}) {
  return [...S.events.values()]
    .filter((e) => (year ? String(e.event_date).startsWith(String(year)) : true) && (includeCancelled || e.status !== 'cancelled'))
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || String(a.event_time || '').localeCompare(String(b.event_time || '')))
    .map((e) => eventView(e.id));
}
export function myEventIds() {
  const me = S.profile?.id;
  return new Set(S.crew.filter((c) => c.user_id === me).map((c) => c.event_id));
}
export function yearsAvailable() {
  const ys = new Set([...S.events.values()].map((e) => Number(String(e.event_date).slice(0, 4))));
  S.payments.forEach((p) => p.paid_on && ys.add(Number(p.paid_on.slice(0, 4))));
  S.expenses.forEach((p) => p.paid_on && ys.add(Number(p.paid_on.slice(0, 4))));
  ys.add(new Date().getFullYear());
  return [...ys].filter(Boolean).sort();
}
export function nextPaymentLabel(eventId) {
  const n = S.payments.filter((p) => p.event_id === eventId && p.amount > 0).length;
  if (n === 0) return { kind: 'deposit', label: L('Προκαταβολή', 'Deposit') };
  return { kind: 'installment', label: L(`${n}η Δόση`, `Installment ${n}`) };
}
export const unreadCount = () => S.notifications.filter((n) => !n.read_at).length;
export const pendingMessages = () => S.queue.filter((m) => m.status === 'pending');
export const newRequests = () => S.requests.filter((r) => r.status === 'new');
export const STALE_DAYS = 10;
export const isStaleAppt = (a) => a.status === 'pending' && (Date.now() - new Date(a.status_at).getTime()) > STALE_DAYS * 864e5;
export const pendingAppointments = () => S.appointments.filter((a) => a.status === 'pending');
export const staleAppointments = () => S.appointments.filter(isStaleAppt);
export const pendingUsers = () => S.profiles.filter((p) => !p.role && p.active);

export function wageStatus() {
  const map = new Map();
  S.expenses.filter((x) => x.kind === 'daily_wage').forEach((x) => {
    const key = x.crew_id || `name:${(x.crew_name || '').trim().toLowerCase()}`;
    const cur = map.get(key) || { key, crew_id: x.crew_id, name: x.crew_name || profileName(profileById(x.crew_id)), total: 0, yearTotal: 0, paidUntil: null, last: null, count: 0 };
    cur.total += Number(x.amount) || 0;
    if (String(x.paid_on).startsWith(String(new Date().getFullYear()))) cur.yearTotal += Number(x.amount) || 0;
    if (x.paid_until && (!cur.paidUntil || x.paid_until > cur.paidUntil)) cur.paidUntil = x.paid_until;
    if (!cur.last || x.paid_on > cur.last) cur.last = x.paid_on;
    cur.count++;
    if (x.crew_id) cur.name = profileName(profileById(x.crew_id)) || cur.name;
    map.set(key, cur);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// ---------- Ενέργειες ----------
export async function saveCustomer(c) {
  const row = { name1: c.name1, name2: c.name2 || null, phone1: c.phone1 || null, phone2: c.phone2 || null, email1: c.email1 || null, email2: c.email2 || null, notes: c.notes || null };
  let data;
  if (c.id) data = await q(sb.from('customers').update(row).eq('id', c.id).select().single());
  else data = await q(sb.from('customers').insert({ ...row, created_by: S.profile.id }).select().single());
  S.customers.set(data.id, data); emit('customers');
  return data;
}
export async function deleteCustomer(id) {
  await q(sb.from('customers').delete().eq('id', id));
  S.customers.delete(id); emit('customers');
}

const EVENT_FIELDS = ['customer_id', 'category', 'event_date', 'event_time', 'church_location', 'house_location', 'reception_location', 'resolution', 'notes', 'extra_crew', 'offer_path', 'offer_data', 'offer_updated_at', 'photo_status', 'editing_status', 'editing_pc', 'video_notes', 'status'];
export async function saveEvent(ev) {
  const row = {};
  EVENT_FIELDS.forEach((k) => { if (k in ev) row[k] = ev[k] === '' ? null : ev[k]; });
  let data;
  if (ev.id && S.events.has(ev.id)) data = await q(sb.from('events').update(row).eq('id', ev.id).select().single());
  else data = await q(sb.from('events').insert({ ...(ev.id ? { id: ev.id } : {}), ...row, created_by: S.profile.id }).select().single());
  S.events.set(data.id, data); emit('events');
  return data;
}
export async function patchEvent(id, patch) {
  const data = await q(sb.from('events').update(patch).eq('id', id).select().single());
  S.events.set(id, data); emit('events');
  return data;
}
export async function deleteEvent(id) {
  const e = S.events.get(id);
  if (e?.offer_path) await sb.storage.from('offers').remove([e.offer_path]).catch(() => {});
  await q(sb.from('events').delete().eq('id', id));
  S.events.delete(id); S.finance.delete(id);
  S.payments = S.payments.filter((p) => p.event_id !== id);
  S.crew = S.crew.filter((c) => c.event_id !== id);
  emit('events');
}
export async function saveFinance(eventId, patch) {
  const data = await q(sb.from('event_finance').upsert({ event_id: eventId, ...patch }).select().single());
  S.finance.set(eventId, data); emit('event_finance');
  return data;
}
export async function setCrew(eventId, list) {
  // list: [{user_id, duty}]
  const cur = S.crew.filter((c) => c.event_id === eventId);
  const remove = cur.filter((c) => !list.some((l) => l.user_id === c.user_id));
  const add = list.filter((l) => !cur.some((c) => c.user_id === l.user_id));
  const change = list.filter((l) => cur.some((c) => c.user_id === l.user_id && c.duty !== l.duty));
  for (const r of remove) await q(sb.from('event_crew').delete().eq('event_id', eventId).eq('user_id', r.user_id));
  if (add.length) await q(sb.from('event_crew').insert(add.map((a) => ({ event_id: eventId, user_id: a.user_id, duty: a.duty }))));
  for (const c of change) await q(sb.from('event_crew').update({ duty: c.duty }).eq('event_id', eventId).eq('user_id', c.user_id));
  S.crew = [...S.crew.filter((c) => c.event_id !== eventId), ...list.map((l) => ({ event_id: eventId, ...l }))];
  emit('event_crew');
}
export async function savePayment(p) {
  const row = { event_id: p.event_id || null, category: p.category || 'other', kind: p.kind || 'installment', label: p.label || null, amount: p.amount, paid_on: p.paid_on || todayISO(), method: p.method || null, description: p.description || null, notes: p.notes || null };
  let data;
  if (p.id) data = await q(sb.from('payments').update(row).eq('id', p.id).select().single());
  else data = await q(sb.from('payments').insert(row).select().single());
  S.payments = [...S.payments.filter((x) => x.id !== data.id), data]; emit('payments');
  setTimeout(() => reload('message_queue'), 900);
  return data;
}
export async function deletePayment(id) {
  await q(sb.from('payments').delete().eq('id', id));
  S.payments = S.payments.filter((x) => x.id !== id); emit('payments');
}
export async function saveExpense(x) {
  const row = { kind: x.kind, subcategory: x.subcategory || null, crew_id: x.crew_id || null, crew_name: x.crew_name || null, for_month: x.for_month || null, paid_until: x.paid_until || null, days: x.days || null, amount: x.amount, paid_on: x.paid_on || todayISO(), method: x.method || null, supplier: x.supplier || null, description: x.description || null, notes: x.notes || null };
  let data;
  if (x.id) data = await q(sb.from('expenses').update(row).eq('id', x.id).select().single());
  else data = await q(sb.from('expenses').insert(row).select().single());
  S.expenses = [...S.expenses.filter((e) => e.id !== data.id), data]; emit('expenses');
  return data;
}
export async function deleteExpense(id) {
  await q(sb.from('expenses').delete().eq('id', id));
  S.expenses = S.expenses.filter((x) => x.id !== id); emit('expenses');
}

// Αρχείο προσφοράς (PDF)
export async function uploadOffer(eventId, blob) {
  const path = `${eventId}/offer-${Date.now()}.pdf`;
  const { error } = await sb.storage.from('offers').upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) { toastErr(L('Το PDF δεν ανέβηκε', 'PDF upload failed'), friendlyError(error)); throw error; }
  const old = S.events.get(eventId)?.offer_path;
  if (old && old !== path) sb.storage.from('offers').remove([old]).catch(() => {});
  return path;
}
export async function offerUrl(path) {
  const { data, error } = await sb.storage.from('offers').createSignedUrl(path, 60 * 60);
  if (error) { toastErr(L('Το PDF δεν άνοιξε', 'Could not open PDF'), friendlyError(error)); throw error; }
  let url = data.signedUrl;
  if (url.startsWith('/')) url = CFG.SUPABASE_URL.replace(/\/$/, '') + '/storage/v1' + url;
  return url;
}
export async function offerBlob(path) {
  const { data, error } = await sb.storage.from('offers').download(path);
  if (error) throw error;
  return data;
}
export async function openOffer(path) {
  const w = window.open('about:blank', '_blank');
  try {
    const url = await offerUrl(path);
    if (w) w.location.href = url; else window.location.href = url;
  } catch { w?.close(); }
}

// Ειδοποιήσεις
export async function markRead(id) {
  const n = S.notifications.find((x) => x.id === id);
  if (!n || n.read_at) return;
  n.read_at = new Date().toISOString(); emit('notifications');
  await sb.from('notifications').update({ read_at: n.read_at }).eq('id', id);
  updateBadge();
}
export async function markAllRead() {
  const now = new Date().toISOString();
  S.notifications.forEach((n) => { if (!n.read_at) n.read_at = now; });
  emit('notifications');
  await sb.rpc('mark_all_read');
  updateBadge();
}
export async function deleteNotification(id) {
  S.notifications = S.notifications.filter((n) => n.id !== id); emit('notifications');
  await sb.from('notifications').delete().eq('id', id);
}
export function updateBadge() {
  const n = unreadCount();
  try { if ('setAppBadge' in navigator) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch {}
}

// Μηνύματα
export async function updateQueue(id, patch) {
  const data = await q(sb.from('message_queue').update(patch).eq('id', id).select().single());
  S.queue = S.queue.map((m) => (m.id === id ? data : m)); emit('message_queue');
  return data;
}
export async function saveTemplate(t) {
  const row = { name: t.name, trigger_type: t.trigger_type, offset_days: Number(t.offset_days) || 0, send_hour: Number(t.send_hour) || 0, threshold_pct: t.threshold_pct === '' || t.threshold_pct == null ? null : Number(t.threshold_pct), categories: t.categories || [], channels: t.channels || [], recipients: t.recipients || [], subject: t.subject || null, body: t.body, enabled: !!t.enabled };
  let data;
  if (t.id) data = await q(sb.from('message_templates').update(row).eq('id', t.id).select().single());
  else data = await q(sb.from('message_templates').insert(row).select().single());
  S.templates = [...S.templates.filter((x) => x.id !== data.id), data]; emit('message_templates');
  return data;
}
export async function deleteTemplate(id) {
  await q(sb.from('message_templates').delete().eq('id', id));
  S.templates = S.templates.filter((x) => x.id !== id); emit('message_templates');
}
export async function runAutomations() {
  const n = await q(sb.rpc('run_automations'));
  await reload('message_queue');
  return n;
}

// Ρυθμίσεις
export async function saveSetting(key, value) {
  await q(sb.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() }));
  S.settings[key] = value; emit('app_settings');
}
export const business = () => ({ name: 'Image Makers', phone: '2410 550361', email: 'digital.imagemakers@gmail.com', address: '28ης Οκτωβρίου 40, Λάρισα', website: 'www.imagemakers.gr', ...(S.settings.business || {}) });

// Αιτήματα
export async function updateRequest(id, patch) {
  const data = await q(sb.from('offer_requests').update(patch).eq('id', id).select().single());
  S.requests = S.requests.map((r) => (r.id === id ? data : r)); emit('offer_requests');
  return data;
}

// Προσφορές / Ραντεβού
const APPT_FIELDS = ['mode', 'appt_date', 'category', 'name1', 'name2', 'phone', 'email', 'event_date', 'church', 'church_time', 'reception', 'reception_time', 'notes', 'offer_path', 'offer_data', 'selections', 'total', 'status', 'status_at', 'reason', 'comments', 'customer_id', 'event_id', 'handled_by'];
export async function saveAppointment(a) {
  const row = {};
  APPT_FIELDS.forEach((k) => { if (k in a) row[k] = a[k] === '' ? null : a[k]; });
  let data;
  if (a.id && S.appointments.some((x) => x.id === a.id)) data = await q(sb.from('appointments').update(row).eq('id', a.id).select().single());
  else data = await q(sb.from('appointments').insert({ ...(a.id ? { id: a.id } : {}), ...row, created_by: S.profile.id }).select().single());
  S.appointments = [data, ...S.appointments.filter((x) => x.id !== data.id)]; emit('appointments');
  return data;
}
export async function deleteAppointment(id) {
  const a = S.appointments.find((x) => x.id === id);
  await q(sb.from('appointments').delete().eq('id', id));
  if (a?.offer_path && ![...S.events.values()].some((e) => e.offer_path === a.offer_path)) sb.storage.from('offers').remove([a.offer_path]).catch(() => {});
  S.appointments = S.appointments.filter((x) => x.id !== id); emit('appointments');
}
export async function uploadAppointmentOffer(apptId, blob) {
  const path = `appointments/${apptId}/offer-${Date.now()}.pdf`;
  const { error } = await sb.storage.from('offers').upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) { toastErr(L('Το PDF δεν ανέβηκε', 'PDF upload failed'), friendlyError(error)); throw error; }
  const old = S.appointments.find((x) => x.id === apptId)?.offer_path;
  if (old && old !== path && ![...S.events.values()].some((e) => e.offer_path === old)) sb.storage.from('offers').remove([old]).catch(() => {});
  return path;
}
/** Αντιγραφή του PDF ενός ραντεβού στην εκδήλωση που δημιουργήθηκε */
export async function copyOfferToEvent(fromPath, eventId) {
  const to = `${eventId}/offer-${Date.now()}.pdf`;
  const { error } = await sb.storage.from('offers').copy(fromPath, to);
  if (error) { console.warn('copy offer', error); return fromPath; }
  return to;
}

// Μηνύματα workflow
export async function saveWfTemplate(t) {
  const row = { name: t.name, stage: t.stage || 'any', channels: t.channels?.length ? t.channels : ['email'], subject: t.subject || null, body: t.body, enabled: t.enabled !== false, sort: Number(t.sort) || 0 };
  let data;
  if (t.id) data = await q(sb.from('workflow_templates').update(row).eq('id', t.id).select().single());
  else data = await q(sb.from('workflow_templates').insert(row).select().single());
  S.wfTemplates = [...S.wfTemplates.filter((x) => x.id !== data.id), data].sort((a, b) => a.sort - b.sort); emit('workflow_templates');
  return data;
}
export async function deleteWfTemplate(id) {
  await q(sb.from('workflow_templates').delete().eq('id', id));
  S.wfTemplates = S.wfTemplates.filter((x) => x.id !== id); emit('workflow_templates');
}
/** Καταγραφή μηνύματος που στάλθηκε χειροκίνητα (εμφανίζεται στο ιστορικό «Μηνύματα προς πελάτες») */
export async function logSentMessage({ eventId, title, channels, toPhone, toEmail, subject, body }) {
  const row = { template_id: null, event_id: eventId, dedupe_key: `manual:${eventId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, due_at: new Date().toISOString(), status: 'sent', channels, assigned_to: [S.profile.id], to_phone: toPhone || null, to_email: toEmail || null, subject: subject || null, body, title: title || null, sent_at: new Date().toISOString(), sent_by: S.profile.id };
  const data = await q(sb.from('message_queue').insert(row).select().single());
  S.queue = [data, ...S.queue]; emit('message_queue');
  return data;
}

export function escAttr(v) { return esc(v); }
