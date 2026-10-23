// =====================================================================
//  IMAGE MAKERS · Edge Function «push»
//  Στέλνει ειδοποιήσεις Web Push (Android, iPhone/iPad, Mac, Windows)
//  Δεν χρειάζεται καμία ρύθμιση secrets — όλα ρυθμίζονται από την εφαρμογή.
//  Στο Supabase: Edge Functions → Deploy a new function → Via Editor
//  Όνομα: push  ·  Επικολλήστε αυτό το αρχείο  ·  Deploy
//  Μετά: Function → Details/Settings → «Verify JWT» = OFF
// =====================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
// Λειτουργεί και με τα νέα κλειδιά (sb_secret_...) και με τα παλιά (service_role)
function serviceKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const k = keys.default || Object.values(keys)[0];
    if (k) return String(k);
  } catch (_) { /* ignore */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const SERVICE_KEY = serviceKey();
const AUTH_HEADERS: Record<string, string> = SERVICE_KEY.startsWith("sb_")
  ? { apikey: SERVICE_KEY }
  : { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

const enc = new TextEncoder();

function b64uToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64u(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// RFC 8291 (aes128gcm) — κρυπτογράφηση περιεχομένου για Web Push
export async function encryptPayload(payload: Uint8Array, p256dhB64u: string, authB64u: string): Promise<Uint8Array> {
  const uaPublic = b64uToBytes(p256dhB64u);
  const authSecret = b64uToBytes(authB64u);

  const asKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));

  const prkKey = await hmac(authSecret, shared);
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic, new Uint8Array([1]));
  const ikm = await hmac(prkKey, keyInfo);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const plain = concat(payload, new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plain));

  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// VAPID (RFC 8292) — υπογραφή JWT ES256
export async function vapidAuthHeader(endpoint: string, privateJwk: JsonWebKey, publicB64u: string, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToB64u(enc.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject,
  })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${bytesToB64u(sig)}, k=${publicB64u}`;
}

async function rest(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...AUTH_HEADERS,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  // Έλεγχος λειτουργίας από την εφαρμογή (Ρυθμίσεις → Ειδοποιήσεις)
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("ok", { headers: CORS });
  try {
    const cfg = await rest("rpc/push_get_config", { method: "POST", body: "{}" });
    if (!cfg?.push_secret || req.headers.get("x-push-secret") !== cfg.push_secret) {
      return new Response("forbidden", { status: 403 });
    }
    if (!cfg.vapid_private_jwk || !cfg.vapid_public) return new Response("push not configured", { status: 200 });

    const { id } = await req.json();
    const rows = await rest(`notifications?id=eq.${encodeURIComponent(id)}&select=*`);
    const n = rows?.[0];
    if (!n) return new Response("no notification", { status: 200 });

    const unread = await fetch(`${SUPABASE_URL}/rest/v1/notifications?user_id=eq.${n.user_id}&read_at=is.null&select=id`, {
      headers: { ...AUTH_HEADERS, Prefer: "count=exact", Range: "0-0" },
    });
    const badge = Number((unread.headers.get("content-range") || "/0").split("/")[1]) || 0;

    const subs = await rest(`push_subscriptions?user_id=eq.${n.user_id}&select=*`);
    const jwk = JSON.parse(cfg.vapid_private_jwk);
    const payload = enc.encode(JSON.stringify({
      id: n.id, title: n.title, body: n.body || "", url: n.link || "#/notifications", kind: n.kind, badge,
    }));

    let sent = 0;
    await Promise.all((subs || []).map(async (s: any) => {
      try {
        const body = await encryptPayload(payload, s.p256dh, s.auth);
        const res = await fetch(s.endpoint, {
          method: "POST",
          headers: {
            Authorization: await vapidAuthHeader(s.endpoint, jwk, cfg.vapid_public, cfg.subject),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: "86400",
            Urgency: "high",
          },
          body,
        });
        if (res.status === 404 || res.status === 410 || res.status === 403) {
          await rest(`push_subscriptions?id=eq.${s.id}`, { method: "DELETE" });
        } else if (res.ok) {
          sent++;
          await rest(`push_subscriptions?id=eq.${s.id}`, {
            method: "PATCH", body: JSON.stringify({ last_ok_at: new Date().toISOString() }),
          });
        } else {
          console.error("push failed", res.status, await res.text());
        }
      } catch (e) {
        console.error("push error", e);
      }
    }));
    return new Response(JSON.stringify({ sent, total: subs?.length || 0 }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(String(e), { status: 500 });
  }
});
