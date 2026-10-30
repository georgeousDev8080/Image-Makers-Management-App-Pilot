// =====================================================================
//  Επιλογή σημείου στον χάρτη (pin) — χωρίς αναζήτηση: ο χρήστης
//  μετακινεί τον χάρτη και πατά πάνω στο ακριβές σημείο.
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

/**
 * Ανοίγει τον χάρτη για να μπει/μετακινηθεί pin.
 * Επιστρέφει: «lat,lng» (νέο pin) · '' (αφαιρέθηκε) · undefined (ακύρωση)
 */
export function pickLocation({ title = L('Σημείο στον χάρτη', 'Point on the map'), geo = null, label = '', near = null } = {}) {
  return new Promise(async (resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    const body = document.createElement('div');
    body.innerHTML = `<p class="small muted" style="margin-bottom:8px">${esc(L('Μετακινήστε και μεγεθύνετε τον χάρτη και πατήστε στο ακριβές σημείο. Μπορείτε να σύρετε το pin για διόρθωση.', 'Pan and zoom the map and tap the exact spot. You can drag the pin to adjust it.'))}${label ? ` <b>${esc(label)}</b>` : ''}</p>
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
    body.querySelector('[data-clear]').addEventListener('click', () => { if (marker) { map.removeLayer(marker); marker = null; } cur = null; show(); });
    s.root.querySelector('[data-save]').addEventListener('click', () => {
      const v = cur ? `${cur[0].toFixed(6)},${cur[1].toFixed(6)}` : '';
      finish(v); s.close();
      toast(v ? L('Το pin αποθηκεύτηκε', 'Pin saved') : L('Το pin αφαιρέθηκε', 'Pin removed'), { ms: 1500 });
    });
  });
}
