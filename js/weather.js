// =====================================================================
//  Καιρός για την επόμενη εκδήλωση (Open-Meteo: δωρεάν, χωρίς κλειδί)
//  Θέση: το pin της εκκλησίας / δεξίωσης, αλλιώς η πόλη από την τοποθεσία.
//  Η πρόγνωση υπάρχει έως ~16 ημέρες πριν.
// =====================================================================
import { L, esc } from './core.js';
import { parseGeo } from './mappicker.js';

const FORECAST_DAYS = 16;
const mem = new Map();

const WMO = (c) => {
  if (c === 0) return ['☀️', L('Αίθριος', 'Clear')];
  if (c === 1) return ['🌤️', L('Κυρίως αίθριος', 'Mainly clear')];
  if (c === 2) return ['⛅', L('Λίγα σύννεφα', 'Partly cloudy')];
  if (c === 3) return ['☁️', L('Συννεφιά', 'Overcast')];
  if (c === 45 || c === 48) return ['🌫️', L('Ομίχλη', 'Fog')];
  if (c >= 51 && c <= 57) return ['🌦️', L('Ψιχάλες', 'Drizzle')];
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return ['🌧️', L('Βροχή', 'Rain')];
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ['🌨️', L('Χιόνι', 'Snow')];
  if (c >= 95) return ['⛈️', L('Καταιγίδα', 'Thunderstorm')];
  return ['🌡️', ''];
};

/** Πόλη από «Ι.Ν. Αγίου Αχιλλίου, Λάρισα» → «Λάρισα» */
const cityOf = (loc) => String(loc || '').split(' · ')[0].split(',').map((x) => x.trim()).filter(Boolean).pop() || '';

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function placeOf(e) {
  const g = parseGeo(e.church_geo) || parseGeo(e.reception_geo) || parseGeo(e.bride_geo) || parseGeo(e.groom_geo);
  const city = cityOf(e.church_location || e.reception_location || e.house_location);
  if (g) return { lat: g[0], lng: g[1], name: city };
  if (!city) return null;
  const k = 'geo:' + city;
  if (mem.has(k)) return mem.get(k);
  const p = getJSON(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: city, count: '1', language: 'el', countryCode: 'GR' })}`)
    .then((j) => (j.results?.[0] ? { lat: j.results[0].latitude, lng: j.results[0].longitude, name: j.results[0].name } : null))
    .catch(() => null);
  mem.set(k, p);
  return p;
}

/** Πρόγνωση για την ημέρα & ώρα της εκδήλωσης → { emoji, text, temp, rain, wind, hour, place } ή { later: n } ή null */
export async function eventWeather(e, today) {
  const days = Math.round((new Date(e.event_date) - new Date(today)) / 864e5);
  if (days < 0) return null;
  if (days > FORECAST_DAYS - 1) return { later: days - (FORECAST_DAYS - 1) };
  const place = await placeOf(e);
  if (!place) return null;
  const hour = Number(String(e.event_time || '12:00').slice(0, 2)) || 12;
  const k = `wx:${place.lat.toFixed(2)},${place.lng.toFixed(2)}:${e.event_date}`;
  let data = mem.get(k);
  if (!data) {
    data = getJSON(`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({ latitude: place.lat, longitude: place.lng, hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m', timezone: 'Europe/Athens', start_date: e.event_date, end_date: e.event_date })}`);
    mem.set(k, data);
    setTimeout(() => mem.delete(k), 60 * 60 * 1000); // ανανέωση κάθε ώρα
  }
  const j = await data;
  const i = (j.hourly?.time || []).findIndex((t) => Number(t.slice(11, 13)) === hour);
  if (i < 0) return null;
  const [emoji, text] = WMO(j.hourly.weather_code[i]);
  return { emoji, text, temp: Math.round(j.hourly.temperature_2m[i]), rain: j.hourly.precipitation_probability?.[i], wind: Math.round(j.hourly.wind_speed_10m?.[i] || 0), hour, place: place.name, at: e.event_time ? String(e.event_time).slice(0, 5) : '' };
}

export function weatherHTML(w) {
  if (!w) return '';
  if (w.later) return `<span class="wx later">🌤️ ${esc(L(`Η πρόγνωση του καιρού εμφανίζεται ${w.later === 1 ? 'από αύριο' : `σε ${w.later} ημέρες`}`, `Weather forecast shows ${w.later === 1 ? 'from tomorrow' : `in ${w.later} days`}`))}</span>`;
  const bits = [`<b>${w.temp}°</b>`, esc(w.text)];
  if (w.rain != null) bits.push(`💧 ${w.rain}%`);
  if (w.wind >= 20) bits.push(`💨 ${w.wind} km/h`);
  return `<span class="wx"><span class="wx-ic">${w.emoji}</span>${bits.join(' · ')}<small>${esc([w.at || L('μεσημέρι', 'midday'), w.place].filter(Boolean).join(' · '))}</small></span>`;
}

/** Γεμίζει όλα τα [data-wx] (id εκδήλωσης) μέσα στο root */
export function fillWeather(root, events, today) {
  root.querySelectorAll('[data-wx]').forEach(async (el) => {
    const e = events.get(el.dataset.wx);
    if (!e) return;
    try { const w = await eventWeather(e, today); if (el.isConnected) { el.innerHTML = weatherHTML(w); el.hidden = !w; } } catch { el.hidden = true; }
  });
}
