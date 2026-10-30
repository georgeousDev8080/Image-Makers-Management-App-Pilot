// =====================================================================
//  Κοινά κομμάτια UI (κάρτες εκδηλώσεων, πακέτο προσφοράς κ.λπ.)
// =====================================================================
import { dutyLabel, dutyEmoji, safeColor, L, esc, icon, fmtTime, parseISO, monthShort, lbl, CATEGORIES, PHOTO_STATUS, EDIT_STATUS, money, initials, colorFor, relDays, daysBetween, todayISO, LANG } from './core.js';
import { isAdmin, profileName } from './data.js';

export const catPill = (cat) => `<span class="pill cat-pill cat-${esc(cat)}">${esc(lbl(CATEGORIES, cat))}</span>`;
export const catShort = (cat) => ({ wedding: L('Γάμος', 'Wedding'), baptism: L('Βάπτιση', 'Baptism'), wedding_baptism: L('Γαμοβάπτιση', 'Wed+Bapt.'), promo: 'Promo', other: L('Άλλο', 'Other') }[cat] || cat);

export function dateTile(iso, cat) {
  const d = parseISO(iso);
  const dow = (LANG === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'])[d.getDay()];
  return `<div class="date-tile cat-${esc(cat)}"><small>${esc(monthShort(d.getMonth()))}</small><b>${d.getDate()}</b><span>${esc(dow)}</span></div>`;
}

export function avatar(p, cls = '') {
  if (!p) return '';
  return `<span class="avatar ${cls}" style="--c:${safeColor(p.color, p.id)}" title="${esc(profileName(p))}">${esc(initials(profileName(p)))}</span>`;
}

export function photoStatusPill(v) {
  const color = { samples_todo: '', samples_pickup: 'blue', samples_waiting: 'orange', changes: 'orange', lab: 'red', ready: 'green', delivered: 'green' }[v] || '';
  return `<span class="pill ${color}">${icon('camera')} ${esc(lbl(PHOTO_STATUS, v))}</span>`;
}
export function editStatusPill(v) {
  if (!v || v === 'none') return '';
  const color = { todo: 'orange', in_progress: 'blue', done: 'green' }[v] || '';
  return `<span class="pill ${color}">${icon('film')} ${esc(lbl(EDIT_STATUS, v))}</span>`;
}

/** Γραμμή εκδήλωσης για λίστες */
export function eventRow(v, { money: showMoney = isAdmin(), compact = false, crewType = false } = {}) {
  const e = v.e;
  const cancelled = e.status === 'cancelled';
  const sub = [fmtTime(e.event_time), e.church_location].filter(Boolean).join(' · ');
  const crew = v.crew.map((c) => avatar(c.profile, 'sm')).join('');
  let right = '';
  if (showMoney && v.price != null) {
    right = v.fullyPaid
      ? `<span class="pill green">${icon('check')} ${esc(L('Εξοφλήθηκε', 'Paid'))}</span>`
      : `<div class="v money small">${esc(money(v.balance, { dec: 0 }))}<div class="tiny muted">${esc(L('υπόλοιπο', 'balance'))}</div></div>`;
  }
  const days = daysBetween(todayISO(), e.event_date);
  return `<a class="row event-card" href="#/event/${e.id}" style="${cancelled ? 'opacity:.55' : ''}">
    ${dateTile(e.event_date, e.category)}
    <div class="main-col">
      <div class="t">${esc(v.title)} ${cancelled ? `<span class="pill red">${esc(L('Ακυρώθηκε', 'Cancelled'))}</span>` : ''}</div>
      <div class="s">${esc(sub || '—')}</div>
      ${compact ? '' : `<div class="hstack" style="margin-top:5px;gap:6px">${catPill(e.category)}${crewType && v.f ? `<span class="pill ${v.f.second_crew ? 'purple' : ''}">${esc(v.f.second_crew ? L('Διπλό συνεργείο', 'Double crew') : L('Μονό συνεργείο', 'Single crew'))}</span>` : ''}${days >= 0 && days <= 30 ? `<span class="pill accent">${esc(relDays(e.event_date))}</span>` : ''}${e.resolution === '4k' ? '<span class="pill blue">4K</span>' : ''}${crew ? `<span class="avatars">${crew}</span>` : ''}</div>`}
    </div>
    ${right}
    ${icon('chevR', 'chev')}
  </a>`;
}

// ---------- Πακέτο προσφοράς (από τα δεδομένα του Οδηγού προσφοράς) ----------
const BASE_INCLUDED = () => [
  L('Φωτογραφική & κινηματογραφική κάλυψη: σπίτι γαμπρού και νύφης', 'Photo & video coverage: groom and bride homes'),
  L('Κάλυψη μυστηρίου και δεξίωσης (έως 3 ώρες μετά την είσοδο)', 'Ceremony and reception coverage (up to 3 hours after entrance)'),
  L('Ολοκληρωμένο wedding video & trailer', 'Full wedding video & trailer'),
  L('Μεγάλο album 80×30 cm · 25 σαλόνια', 'Large album 80×30 cm · 25 spreads'),
  L('Όλο το φωτογραφικό αρχείο σε πλήρη ανάλυση', 'All photos in full resolution'),
];
/** Τι περιλαμβάνει το βασικό πακέτο βάπτισης (Οδηγός βάπτισης) */
const BAPTISM_INCLUDED = () => [
  L('Φωτογραφική κάλυψη της βάπτισης', 'Photo coverage of the baptism'),
  L('Κινηματογράφηση του μυστηρίου', 'Video of the ceremony'),
  L('Ταινία βάπτισης & σύντομο trailer', 'Baptism film & short trailer'),
  L('Μεγάλο ψηφιακό album 70×30 (20 σαλόνια)', 'Large digital album 70×30 (20 spreads)'),
  L('Όλο το φωτογραφικό αρχείο σε πλήρη ανάλυση', 'All photos in full resolution'),
];
export const isBaptismOffer = (od) => od?.kind === 'baptism';
export function offerSummary(od) {
  if (!od) return null;
  if (isBaptismOffer(od)) {
    const adds = od.adds || [];
    const included = [...BAPTISM_INCLUDED()];
    if (od.prints) included.push(od.prints);
    included.push(adds.includes('Παράδοση video σε 4K') ? L('Παράδοση video σε 4K', 'Video delivered in 4K') : L('Παράδοση video σε Full HD', 'Video delivered in Full HD'));
    const upgrades = adds.filter((x) => x !== 'Παράδοση video σε 4K');
    if (od.smallAlbums) upgrades.push(L(`${od.smallAlbums} ${od.smallAlbums === 1 ? 'μικρό album' : 'μικρά album'} 47×20`, `${od.smallAlbums} small album${od.smallAlbums === 1 ? '' : 's'} 47×20`));
    if (od.largeSpreads) upgrades.push(L(`${od.largeSpreads} επιπλέον σαλόνια μεγάλου album`, `${od.largeSpreads} extra large-album spreads`));
    if (od.smallSpreads) upgrades.push(L(`${od.smallSpreads} επιπλέον σαλόνια μικρού album`, `${od.smallSpreads} extra small-album spreads`));
    return { included, upgrades, removed: [], notes: od.notes || '' };
  }
  const removes = od.removes || [];
  const adds = od.adds || [];
  const included = [...BASE_INCLUDED()];
  const smallAlbums = 3 - (Number(od.removeAlbums) || 0);
  if (smallAlbums > 0) included.push(L(`${smallAlbums} μικρά ψηφιακά album`, `${smallAlbums} small digital albums`));
  if (od.prints) included.push(od.prints);
  ['Drone εκκλησίας', 'Φωτογράφηση next day', 'Video next day', 'Drone next day'].forEach((x) => { if (!removes.includes(x)) included.push(x); });
  included.push(adds.includes('Παράδοση video σε 4K') ? L('Παράδοση video σε 4K', 'Video delivered in 4K') : L('Παράδοση video σε Full HD', 'Video delivered in Full HD'));
  const upgrades = adds.filter((x) => x !== 'Παράδοση video σε 4K').slice();
  if (od.extraHours) upgrades.push(L(`${od.extraHours} επιπλέον ώρες δεξίωσης`, `${od.extraHours} extra reception hours`));
  if (od.largeSpreads) upgrades.push(L(`${od.largeSpreads} επιπλέον σαλόνια μεγάλου album`, `${od.largeSpreads} extra large-album spreads`));
  if (od.smallSpreads) upgrades.push(L(`${od.smallSpreads} επιπλέον σαλόνια μικρού album`, `${od.smallSpreads} extra small-album spreads`));
  const removed = removes.slice();
  if (od.removeAlbums) removed.push(L(`${od.removeAlbums} μικρά album`, `${od.removeAlbums} small albums`));
  return { included, upgrades, removed, notes: od.notes || '' };
}
export function offerSummaryHTML(od) {
  const s = offerSummary(od);
  if (!s) return `<div class="muted small">${esc(L('Δεν υπάρχουν λεπτομέρειες πακέτου.', 'No package details.'))}</div>`;
  return `<div class="grid cols-2" style="gap:14px">
    <div><b class="small muted">${esc(L('ΠΕΡΙΛΑΜΒΑΝΟΝΤΑΙ', 'INCLUDED'))}</b><ul class="pkg-list">${s.included.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
    <div>
      ${s.upgrades.length ? `<b class="small muted">${esc(L('ΑΝΑΒΑΘΜΙΣΕΙΣ', 'UPGRADES'))}</b><ul class="pkg-list plus">${s.upgrades.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${s.removed.length ? `<b class="small muted" style="display:block;margin-top:10px">${esc(L('ΔΕΝ ΠΕΡΙΛΑΜΒΑΝΟΝΤΑΙ', 'NOT INCLUDED'))}</b><ul class="pkg-list minus">${s.removed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${s.notes ? `<b class="small muted" style="display:block;margin-top:10px">${esc(L('ΣΗΜΕΙΩΣΕΙΣ', 'NOTES'))}</b><p class="small">${esc(s.notes)}</p>` : ''}
    </div></div>`;
}
/** Τι χρειάζεται να ξέρει το συνεργείο για την κάλυψη (χωρίς album, εκτυπώσεις, τιμές) */
export function crewBriefHTML(e, myDuty) {
  const od = e.offer_data || null;
  const removes = od?.removes || [], adds = od?.adds || [];
  const hours = 3 + (Number(od?.extraHours) || 0);
  const P = 'photo', V = 'video', D = 'drone', B = 'both';
  const items = [];
  const add = (who, text) => items.push({ who, text });
  if (e.category === 'baptism' || isBaptismOffer(od)) {
    add(B, L('Μυστήριο βάπτισης', 'Baptism ceremony'));
    add(V, e.resolution === '4k' || adds.includes('Παράδοση video σε 4K') ? L('Λήψη video σε 4K', 'Video in 4K') : L('Λήψη video σε Full HD (1080p)', 'Video in Full HD (1080p)'));
    if (adds.includes('Drone στην εκκλησία')) add(D, L('Drone στην εκκλησία', 'Drone at the church'));
    if (adds.includes('Φωτογράφηση πριν & ψηφιακό album ευχολόγιο')) add(P, L('Φωτογράφηση πριν από τη βάπτιση (ευχολόγιο)', 'Pre-baptism photo shoot (guest book)'));
  } else {
  add(B, L('Σπίτι γαμπρού και νύφης', 'Groom and bride homes'));
  add(B, L('Μυστήριο', 'Ceremony'));
  add(B, L(`Δεξίωση: έως ${hours} ώρες μετά την είσοδο`, `Reception: up to ${hours} hours after the entrance`));
  add(V, e.resolution === '4k' || adds.includes('Παράδοση video σε 4K') ? L('Λήψη video σε 4K', 'Video in 4K') : L('Λήψη video σε Full HD (1080p)', 'Video in Full HD (1080p)'));
  if (od) {
    if (!removes.includes('Drone εκκλησίας')) add(D, L('Drone στην εκκλησία', 'Drone at the church'));
    if (adds.includes('2ο συνεργείο')) add(B, L('Δεύτερο συνεργείο', 'Second crew'));
    if (adds.includes('Pre-wedding photo & video')) add(B, L('Pre-wedding φωτογράφηση & video', 'Pre-wedding photo & video'));
    if (adds.includes('Slide show για τη δεξίωση')) add(B, L('Slide show στη δεξίωση', 'Slide show at the reception'));
    if (!removes.includes('Φωτογράφηση next day')) add(P, L('Φωτογράφηση next day', 'Next-day photo shoot'));
    if (!removes.includes('Video next day')) add(V, L('Video next day', 'Next-day video'));
    if (!removes.includes('Drone next day')) add(D, L('Drone next day', 'Next-day drone'));
  }
  }
  const tag = (w) => (w === P ? '📷' : w === V ? '🎥' : w === D ? '🚁' : '📷🎥');
  const mine = (w) => !myDuty || w === B || w === myDuty || (w === D && myDuty === V);
  const list = [...items.filter((i) => mine(i.who)), ...items.filter((i) => !mine(i.who))];
  return `${myDuty ? `<div class="small muted" style="margin-bottom:8px">${esc(L('Η ανάθεσή σου', 'Your assignment'))}: <b style="color:var(--label)">${esc(dutyLabel(myDuty))}</b></div>` : ''}
    <ul class="pkg-list">${list.map((i) => `<li style="${mine(i.who) ? '' : 'opacity:.55'}">${esc(i.text)} <span class="tiny">${tag(i.who)}</span></li>`).join('')}</ul>
    ${od ? '' : `<div class="small muted mt-s">${esc(L('Δεν υπάρχουν ακόμη λεπτομέρειες πακέτου· ρωτήστε τον διαχειριστή.', 'No package details yet; ask an admin.'))}</div>`}`;
}

/** Σύντομο όνομα πακέτου για το φύλλο (π.χ. BASIC PAC + 2ο συνεργείο) */
export function packageNameFrom(od) {
  if (!od) return '';
  const parts = [isBaptismOffer(od) ? 'BAPTISM PAC' : 'BASIC PAC'];
  if (isBaptismOffer(od)) {
    const bs = { 'Φωτογράφηση πριν & ψηφιακό album ευχολόγιο': 'PRE-BAPTISM', 'Drone στην εκκλησία': 'DRONE', 'Μικρό album 47×20': 'ΜΙΚΡΟ ALBUM', 'Album Platinum series': 'PLATINUM ALBUM', 'Platinum album case': 'PLATINUM CASE', 'Wooden USB case': 'USB CASE', 'Παράδοση video σε 4K': '4K' };
    (od.adds || []).forEach((a) => parts.push('+' + (bs[a] || a.toUpperCase())));
    if (od.smallAlbums) parts.push(`+${od.smallAlbums} ΜΙΚΡ${od.smallAlbums === 1 ? 'Ο' : 'Α'} ALBUM`);
    return parts.join(' ');
  }
  const short = { '2ο συνεργείο': '2ο ΣΥΝΕΡΓΕΙΟ', 'Ευχολόγιο': 'ΕΥΧΟΛΟΓΙΟ', 'Pre-wedding photo & video': 'PRE-WEDDING', 'Slide show για τη δεξίωση': 'SLIDESHOW', 'Album Platinum series': 'PLATINUM ALBUM', 'Platinum album case': 'PLATINUM CASE', 'Wooden USB case': 'USB CASE', 'Παράδοση video σε 4K': '4K' };
  (od.adds || []).forEach((a) => parts.push('+' + (short[a] || a.toUpperCase())));
  const remShort = { 'Drone εκκλησίας': 'ΧΩΡΙΣ DRONE ΕΚΚΛ.', 'Φωτογράφηση next day': 'ΧΩΡΙΣ NEXT DAY PHOTO', 'Video next day': 'ΧΩΡΙΣ NEXT DAY VIDEO', 'Drone next day': 'ΧΩΡΙΣ DRONE NEXT DAY' };
  (od.removes || []).forEach((r) => parts.push('−' + (remShort[r] || r.toUpperCase())));
  if (od.removeAlbums) parts.push(`−${od.removeAlbums} ΜΙΚΡΑ ALBUM`);
  if (od.extraHours) parts.push(`+${od.extraHours}Ω ΔΕΞΙΩΣΗ`);
  return parts.join(' ');
}

export function crewChips(v) {
  if (!v.crew.length) return `<span class="muted small">${esc(L('Δεν έχει οριστεί συνεργείο', 'No crew assigned'))}</span>`;
  return v.crew.map((c) => `<span class="chip" style="padding-left:4px">${avatar(c.profile, 'sm')} ${esc(profileName(c.profile))} · ${esc(dutyEmoji(c.duty))} ${esc(dutyLabel(c.duty))}</span>`).join(' ');
}
