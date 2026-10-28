// =====================================================================
//  Ειδοποιήσεις push & service worker
// =====================================================================
import { L, isIOS, isStandalone, toast } from './core.js';
import { sb, S, reload } from './data.js';

let reg = null;
const handlers = { navigate: null, push: null };
export const onSWMessage = (type, fn) => { handlers[type] = fn; };

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const hadController = !!navigator.serviceWorker.controller;
    reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    navigator.serviceWorker.addEventListener('message', (e) => {
      const d = e.data || {};
      if (d.type === 'navigate') handlers.navigate?.(d.hash, d.id);
      if (d.type === 'push') handlers.push?.(d.payload);
      if (d.type === 'resubscribe') ensureSubscription(true);
    });
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'activated' && hadController) {
          toast(L('Νέα έκδοση εφαρμογής', 'New app version'), { type: 'info', body: L('Πατήστε για ανανέωση.', 'Tap to reload.'), ms: 9000, onClick: () => location.reload() });
        }
      });
    });
    return reg;
  } catch (e) { console.warn('SW', e); return null; }
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const serverPushReady = () => !!S.settings.vapid_public;

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android κινητό' : 'Android tablet';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Συσκευή';
}

/** Κατάσταση ειδοποιήσεων σε αυτή τη συσκευή */
export async function pushState() {
  if (isIOS() && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (!serverPushReady()) return Notification.permission === 'granted' ? 'server-missing' : 'default';
  if (Notification.permission !== 'granted') return 'default';
  const r = reg || (await navigator.serviceWorker.getRegistration());
  const sub = await r?.pushManager.getSubscription();
  return sub ? 'on' : 'default';
}

const b64uToU8 = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const u8ToB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function saveSub(sub) {
  const j = sub.toJSON();
  // η συσκευή περνά στον λογαριασμό που είναι συνδεδεμένος τώρα (τελευταίος συνδεδεμένος)
  const { error: e1 } = await sb.rpc('push_claim', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_device: deviceName() });
  if (!e1) return true;
  const row = { user_id: S.profile.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName() };
  const { error } = await sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  return !error;
}

/** Ζητά άδεια (πρέπει να καλείται από πάτημα κουμπιού) και ενεργοποιεί */
export async function enablePush() {
  if (isIOS() && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'default';
  if (!serverPushReady()) { await reload('app_settings'); if (!serverPushReady()) return 'server-missing'; }
  return (await ensureSubscription(true)) ? 'on' : 'error';
}

export async function ensureSubscription(force = false) {
  try {
    if (!pushSupported() || Notification.permission !== 'granted' || !serverPushReady() || !S.profile) return false;
    const r = reg || (await navigator.serviceWorker.ready);
    const key = b64uToU8(S.settings.vapid_public);
    let sub = await r.pushManager.getSubscription();
    if (sub) {
      const cur = sub.options?.applicationServerKey ? u8ToB64u(sub.options.applicationServerKey) : null;
      if (cur && cur !== S.settings.vapid_public) { await sub.unsubscribe(); sub = null; }
    }
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    let ok = await saveSub(sub);
    if (!ok) { await sub.unsubscribe(); sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }); ok = await saveSub(sub); }
    try { localStorage.setItem('im.push', '1'); } catch {}
    return ok;
  } catch (e) { console.warn('push subscribe', e); if (force) throw e; return false; }
}

export async function disablePushHere() {
  try {
    const r = reg || (await navigator.serviceWorker.getRegistration());
    const sub = await r?.pushManager.getSubscription();
    if (sub) {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
  } catch (e) { console.warn(e); }
  try { localStorage.removeItem('im.push'); } catch {}
}

export async function sendTest() {
  const { error } = await sb.rpc('send_test_notification');
  if (error) throw error;
}

/** Ρύθμιση του server για push (μία φορά, από διαχειριστή) */
export async function setupServerPush() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = u8ToB64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  const url = window.IM_CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1';
  const subject = 'mailto:' + (S.settings.business?.email || 'digital.imagemakers@gmail.com');
  const { error } = await sb.rpc('admin_set_push_config', {
    p_functions_url: url, p_vapid_public: pub, p_vapid_private_jwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }), p_subject: subject,
  });
  if (error) throw error;
  await reload('app_settings');
  return pub;
}

export async function serverStatus() {
  const { data, error } = await sb.rpc('push_status');
  if (error) throw error;
  return data;
}

export async function checkFunction() {
  try {
    const res = await fetch(window.IM_CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/push', { method: 'GET' });
    return res.ok;
  } catch { return false; }
}
