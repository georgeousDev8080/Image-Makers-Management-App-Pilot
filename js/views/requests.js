// =====================================================================
//  Αιτήματα προσφοράς από τη σελίδα πελάτη (offer/client.html)
// =====================================================================
import { L, esc, icon, money, fmtDate, timeAgo, telUrl, mailUrl, sheet, toast, copyText, download, segmented, initSegmented, confirmBox } from '../core.js';
import { S, updateRequest, eventView } from '../data.js';
import { pageHead, emptyState, go } from '../layout.js';
import { offerSummaryHTML } from '../components.js';
import { requestToOfferState } from '../offer.js';

const st = { tab: 'new' };

export function clientPageUrl() { return new URL('offer/client.html', location.href.split('#')[0]).href; }

export async function downloadClientFile() {
  const res = await fetch('offer/client.html', { cache: 'no-cache' });
  let html = await res.text();
  const cfg = { SUPABASE_URL: window.IM_CONFIG.SUPABASE_URL, SUPABASE_ANON_KEY: window.IM_CONFIG.SUPABASE_ANON_KEY };
  html = html.replace('/*__IM_INLINE_CONFIG__*/', `window.IM_CONFIG = ${JSON.stringify(cfg)};`).replace('<script src="../config.js"></script>', '');
  download(new Blob([html], { type: 'text/html' }), 'IMAGE_MAKERS_WEDDING_OFFER_2027.html');
}

export function renderRequests(root) {
  const list = S.requests.filter((r) => r.status === st.tab);
  const n = (s) => S.requests.filter((r) => r.status === s).length;
  let html = pageHead(L('Αιτήματα προσφορών', 'Offer requests'), { sub: esc(L('Ό,τι στέλνουν τα ζευγάρια από τη σελίδα προσφοράς.', 'What couples send from the offer page.')) });
  html += `<div class="card pad mb"><div class="spread" style="flex-wrap:wrap"><div><b>${esc(L('Σελίδα προσφοράς για πελάτες', 'Client offer page'))}</b><div class="small muted">${esc(L('Στείλτε τον σύνδεσμο στο ζευγάρι (Viber, email, SMS) ή το αρχείο ως συνημμένο.', 'Send the link to the couple (Viber, email, SMS) or the file as an attachment.'))}</div></div>
    <div class="hstack"><button class="btn small" data-copy>${icon('link')} ${esc(L('Αντιγραφή συνδέσμου', 'Copy link'))}</button><a class="btn small" href="offer/client.html" target="_blank" rel="noopener">${icon('eye')} ${esc(L('Προβολή', 'Preview'))}</a><button class="btn small" data-file>${icon('download')} ${esc(L('Αρχείο για email', 'File for email'))}</button><a class="btn small" href="offer/builder.html" target="_blank" rel="noopener">${icon('wand')} ${esc(L('Οδηγός προσφοράς', 'Offer builder'))}</a></div></div></div>`;
  html += `<div class="mb">${segmented('t', [{ v: 'new', label: L(`Νέα (${n('new')})`, `New (${n('new')})`) }, { v: 'converted', label: L(`Έγιναν εκδηλώσεις (${n('converted')})`, `Converted (${n('converted')})`) }, { v: 'archived', label: L(`Αρχείο (${n('archived')})`, `Archived (${n('archived')})`) }], st.tab)}</div>`;
  html += list.length ? `<div class="list">${list.map((r) => `<button class="row has-icon" data-r="${r.id}"><span class="row-icon" style="background:${r.status === 'new' ? 'var(--blue)' : 'var(--label-3)'}">${icon('inbox')}</span>
      <div class="main-col"><div class="t">${esc([r.partner1, r.partner2].filter(Boolean).join(' & ') || '—')}</div><div class="s">${esc(fmtDate(r.wedding_date))} · ${esc(r.church || '—')} · ${esc(timeAgo(r.created_at))}</div></div>
      <div class="v money">${esc(money(r.client_total, { dec: 0 }))}</div>${icon('chevR', 'chev')}</button>`).join('')}</div>`
    : emptyState('inbox', L('Κανένα αίτημα εδώ', 'No requests here'), st.tab === 'new' ? L('Όταν ένα ζευγάρι στείλει τις επιλογές του, θα ειδοποιηθείτε αμέσως.', 'When a couple sends their choices, you will be notified instantly.') : '');
  root.innerHTML = html;
  initSegmented(root, (_, v) => { st.tab = v; renderRequests(root); });
  root.querySelector('[data-copy]').addEventListener('click', async () => { await copyText(clientPageUrl()); toast(L('Ο σύνδεσμος αντιγράφηκε', 'Link copied'), { body: clientPageUrl() }); });
  root.querySelector('[data-file]').addEventListener('click', () => downloadClientFile());
  root.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => openRequest(S.requests.find((r) => r.id === b.dataset.r))));
}

function openRequest(r) {
  const st8 = requestToOfferState(r);
  const ev = r.event_id ? eventView(r.event_id) : null;
  const body = `<div class="list">
      <div class="row"><div class="main-col"><div class="s">${esc(L('Ζευγάρι', 'Couple'))}</div><div class="t">${esc([r.partner1, r.partner2].filter(Boolean).join(' & '))}</div></div></div>
      ${[r.phone1, r.phone2].filter(Boolean).map((p) => `<div class="row"><div class="main-col"><div class="s">${esc(L('Κινητό', 'Mobile'))}</div><div class="t">${esc(p)}</div></div><a class="icon-btn filled" href="${telUrl(p)}">${icon('phone')}</a></div>`).join('')}
      ${r.email ? `<div class="row"><div class="main-col"><div class="s">Email</div><div class="t">${esc(r.email)}</div></div><a class="icon-btn filled" href="${mailUrl(r.email)}">${icon('mail')}</a></div>` : ''}
      <div class="row"><div class="main-col"><div class="s">${esc(L('Ημερομηνία γάμου', 'Wedding date'))}</div><div class="t">${esc(fmtDate(r.wedding_date))}</div></div></div>
      <div class="row"><div class="main-col"><div class="s">${esc(L('Εκκλησία', 'Church'))}</div><div class="t">${esc([r.church, r.church_time].filter(Boolean).join(' · ') || '—')}</div></div></div>
      <div class="row"><div class="main-col"><div class="s">${esc(L('Δεξίωση', 'Reception'))}</div><div class="t">${esc([r.reception, r.reception_time].filter(Boolean).join(' · ') || '—')}</div></div></div>
      <div class="row"><div class="main-col"><div class="s">${esc(L('Σύνολο που είδε ο πελάτης', 'Total the client saw'))}</div><div class="t money">${esc(money(r.client_total))}</div></div></div>
    </div>
    <div class="group-label">${esc(L('Επιλογές πακέτου', 'Package choices'))}</div><div class="card pad">${offerSummaryHTML(st8)}</div>
    ${ev ? `<a class="btn block mt" href="#/event/${ev.e.id}" data-close>${icon('events')} ${esc(L('Άνοιγμα εκδήλωσης', 'Open event'))}</a>` : ''}`;
  const foot = r.status === 'new'
    ? `<button class="btn" data-arch>${icon('archive')} ${esc(L('Αρχειοθέτηση', 'Archive'))}</button><button class="btn primary" data-conv>${icon('plus')} ${esc(L('Δημιουργία εκδήλωσης', 'Create event'))}</button>`
    : r.status === 'archived' ? `<button class="btn" data-unarch>${icon('refresh')} ${esc(L('Επαναφορά', 'Restore'))}</button>` : '';
  const s = sheet({ title: L('Αίτημα προσφοράς', 'Offer request'), body, foot });
  s.root.querySelector('[data-conv]')?.addEventListener('click', () => { s.close(); go(`#/new-event?request=${r.id}`); });
  s.root.querySelector('[data-arch]')?.addEventListener('click', async () => { if (!await confirmBox(L('Αρχειοθέτηση αιτήματος;', 'Archive request?'), L('Μπορείτε να το επαναφέρετε αργότερα.', 'You can restore it later.'))) return; await updateRequest(r.id, { status: 'archived', handled_by: S.profile.id }); s.close(); toast(L('Αρχειοθετήθηκε', 'Archived')); });
  s.root.querySelector('[data-unarch]')?.addEventListener('click', async () => { await updateRequest(r.id, { status: 'new' }); s.close(); });
}
