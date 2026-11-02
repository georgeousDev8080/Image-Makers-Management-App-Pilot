// =====================================================================
//  Επιλογή σημείου στον χάρτη (pin): αναζήτηση διεύθυνσης / ονόματος
//  (OpenStreetMap Nominatim) ή πάτημα πάνω στο ακριβές σημείο.
//  Χάρτης: OpenStreetMap μέσω Leaflet (τοπικά στο vendor/leaflet).
// =====================================================================
import { L, esc, icon, sheet, toast, toastErr, loadScript } from './core.js';

const LARISSA = [39.6390, 22.4191];
let cssLoaded = false;

async function loadLeaflet() {
  if (!cssLoaded) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'vendor/leaflet/leaflet.css'; document.head.appendChild(l);
    cssLoaded = true;
  }
  if (!window.L?.map) await loadScript('vendor/leaflet/leaflet.js');
  return window.L;
}

/** «39.63,22.41» → [39.63, 22.41] */
export function parseGeo(g) {
  const m = String(g || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}
/** Σύνδεσμος που ανοίγει το ακριβές pin (Google Maps / Apple Maps στο κινητό, με οδηγίες) */
export function geoUrl(g) {
  const p = parseGeo(g);
  return p ? `https://www.google.com/maps/search/?api=1&query=${p[0]},${p[1]}` : null;
}

/** «39.63, 22.41» ή σύνδεσμος Google Maps με @lat,lng / ?q=lat,lng → [lat, lng] */
function coordsFromText(t) {
  const s = String(t || '');
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || s.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || s.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  return m ? parseGeo(`${m[1]},${m[2]}`) : null;
}

/** Αναζήτηση στο OpenStreetMap (δωρεάν, χωρίς κλειδί) με προτίμηση στην περιοχή του χάρτη */
async function geocode(q, bounds) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.search = new URLSearchParams({ format: 'jsonv2', q, limit: '7', countrycodes: 'gr,cy', 'accept-language': 'el,en', addressdetails: '0' }).toString();
  if (bounds) u.searchParams.set('viewbox', `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`);
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return (await r.json()).map((x) => ({ lat: +x.lat, lng: +x.lon, name: x.name || x.display_name.split(',')[0], addr: x.display_name }));
}

/**
 * Ανοίγει τον χάρτη για να μπει/μετακινηθεί pin.
 * Επιστρέφει: «lat,lng» (νέο pin) · '' (αφαιρέθηκε) · undefined (ακύρωση)
 */
export function pickLocation({ title = L('Σημείο στον χάρτη', 'Point on the map'), geo = null, label = '', near = null } = {}) {
  return new Promise(async (resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const body = document.createElement('div');
    body.innerHTML = `<div class="mp-search">
        <div class="search">${icon('search')}<input class="input" id="mpq" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(L('Αναζήτηση: εκκλησία, κτήμα, διεύθυνση, χωριό…', 'Search: church, venue, address, village…'))}" value="${esc(label || '')}"></div>
        <button class="btn small primary" data-find>${esc(L('Αναζήτηση', 'Search'))}</button>
      </div>
      <div class="mp-results" id="mpr" hidden></div>
      <p class="small muted" style="margin:8px 0">${esc(L('Βρείτε το σημείο με την αναζήτηση ή πατήστε απευθείας πάνω στον χάρτη. Μπορείτε να σύρετε το pin για διόρθωση.', 'Find the place with search or tap directly on the map. You can drag the pin to adjust it.'))}</p>
      <div class="map-pick" id="mp"><div class="map-loading"><div class="spinner"></div></div></div>
      <div class="hstack mt-s" style="flex-wrap:wrap;gap:8px">
        <button class="btn small" data-me>${icon('pin')} ${esc(L('Η θέση μου', 'My location'))}</button>
        <button class="btn small danger" data-clear ${geo ? '' : 'hidden'}>${icon('trash')} ${esc(L('Αφαίρεση pin', 'Remove pin'))}</button>
        <span class="small muted" id="mpc" style="margin-left:auto"></span>
      </div>`;
    const s = sheet({ title, body, wide: true, right: `<button class="btn plain" data-save><b>${esc(L('Αποθήκευση', 'Save'))}</b></button>`, onClose: () => finish(undefined) });
    let Lf;
    try { Lf = await loadLeaflet(); } catch (e) { toastErr(L('Ο χάρτης δεν φόρτωσε', 'The map did not load'), L('Ελέγξτε τη σύνδεση στο internet.', 'Check your internet connection.')); s.close(); finish(undefined); return; }
    const el = body.querySelector('#mp'); el.innerHTML = '';
    const start = parseGeo(geo) || parseGeo(near) || LARISSA;
    const map = Lf.map(el, { zoomControl: true, attributionControl: true }).setView(start, parseGeo(geo) ? 17 : parseGeo(near) ? 15 : 13);
    Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const icn = Lf.icon({ iconUrl: 'vendor/leaflet/images/marker-icon.png', iconRetinaUrl: 'vendor/leaflet/images/marker-icon-2x.png', shadowUrl: 'vendor/leaflet/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
    let marker = null;
    let cur = parseGeo(geo);
    const coords = body.querySelector('#mpc');
    const show = () => { coords.textContent = cur ? `${cur[0].toFixed(5)}, ${cur[1].toFixed(5)}` : L('Δεν έχει μπει pin', 'No pin yet'); body.querySelector('[data-clear]').hidden = !cur; };
    const place = (ll) => {
      cur = [ll.lat ?? ll[0], ll.lng ?? ll[1]];
      if (!marker) { marker = Lf.marker(cur, { draggable: true, icon: icn }).addTo(map); marker.on('dragend', () => { const p = marker.getLatLng(); cur = [p.lat, p.lng]; show(); }); }
      else marker.setLatLng(cur);
      show();
    };
    if (cur) place(cur);
    show();
    map.on('click', (e) => place(e.latlng));
    setTimeout(() => map.invalidateSize(), 250);
    body.querySelector('[data-me]').addEventListener('click', () => {
      if (!navigator.geolocation) return toastErr(L('Η συσκευή δεν δίνει τοποθεσία', 'Location not available'));
      navigator.geolocation.getCurrentPosition((p) => { const ll = [p.coords.latitude, p.coords.longitude]; map.setView(ll, 17); place(ll); },
        () => toastErr(L('Δεν δόθηκε άδεια τοποθεσίας', 'Location permission denied')), { enableHighAccuracy: true, timeout: 10000 });
    });
    // ---- αναζήτηση ----
    const qEl = body.querySelector('#mpq'); const rEl = body.querySelector('#mpr');
    let seq = 0, timer = null, lastQ = '';
    const hideResults = () => { rEl.hidden = true; rEl.innerHTML = ''; };
    const pick = (x) => { map.setView([x.lat, x.lng], 17); place([x.lat, x.lng]); hideResults(); };
    const search = async (force = false) => {
      const q = qEl.value.trim();
      if (!q) { hideResults(); return; }
      const c = coordsFromText(q);
      if (c) { pick({ lat: c[0], lng: c[1] }); return; }
      if (q.length < 3 || (!force && q === lastQ)) return;
      lastQ = q; const my = ++seq;
      rEl.hidden = false; rEl.innerHTML = `<div class="mp-r muted"><div class="spinner sm"></div> ${esc(L('Αναζήτηση…', 'Searching…'))}</div>`;
      try {
        let res = await geocode(q, map.getBounds());
        // «Ι.Ν. …» / «Ιερός Ναός …» δεν ταιριάζουν πάντα στο OpenStreetMap: δεύτερη προσπάθεια χωρίς αυτά
        const simple = q.replace(/(^|\s)(Ι\.?\s?Ν\.?|Ι\.?\s?Μ\.?|Ιερ[οό]ς\s+Να[οό]ς|Ιερ[αά]\s+Μον[ηή])(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
        if (!res.length && simple && simple !== q) res = await geocode(simple, map.getBounds());
        if (my !== seq) return;
        rEl.innerHTML = res.length ? res.map((x, i) => `<button type="button" class="mp-r" data-i="${i}">${icon('pin')}<span><b>${esc(x.name)}</b><small>${esc(x.addr)}</small></span></button>`).join('')
          : `<div class="mp-r muted">${esc(L('Δεν βρέθηκε. Δοκιμάστε πιο απλά (π.χ. «Άγιος Αχίλλειος Λάρισα») ή πατήστε πάνω στον χάρτη.', 'Not found. Try simpler words (e.g. “Agios Achilleios Larissa”) or tap on the map.'))}</div>`;
        rEl.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => pick(res[+b.dataset.i])));
        if (res.length === 1 && !cur) pick(res[0]);
      } catch (e) {
        if (my !== seq) return;
        console.warn(e); rEl.innerHTML = `<div class="mp-r muted">${esc(L('Η αναζήτηση δεν είναι διαθέσιμη αυτή τη στιγμή. Πατήστε πάνω στον χάρτη.', 'Search is not available right now. Tap on the map.'))}</div>`;
      }
    };
    qEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(timer); search(true); qEl.blur(); } });
    qEl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => search(), 900); });
    body.querySelector('[data-find]').addEventListener('click', () => { clearTimeout(timer); search(true); });
    // χωρίς pin αλλά με γραμμένη τοποθεσία: ψάχνει αμέσως
    if (!cur && label && label.trim().length >= 3) setTimeout(() => search(true), 400);

    body.querySelector('[data-clear]').addEventListener('click', () => { if (marker) { map.removeLayer(marker); marker = null; } cur = null; show(); });
    s.root.querySelector('[data-save]').addEventListener('click', () => {
      const v = cur ? `${cur[0].toFixed(6)},${cur[1].toFixed(6)}` : '';
      finish(v); s.close();
      toast(v ? L('Το pin αποθηκεύτηκε', 'Pin saved') : L('Το pin αφαιρέθηκε', 'Pin removed'), { ms: 1500 });
    });
  });
}
