// =====================================================================
//  IMAGE MAKERS · Studio Manager — εκκίνηση, πλοήγηση, διάταξη
//  made by georgeousDev software solutions · gkararizosg@gmail.com
// =====================================================================
import { L, esc, icon, $, $$, on, applyTheme, toast, hasLayer, closeAllLayers, debounce, initials, colorFor, lbl, ROLES, setLang, LANG } from './core.js';
import { sb, S, configured, loadProfile, loadAll, startRealtime, stopRealtime, subscribe, isAdmin, isVideoAdmin, hasRole, setNotificationHandler, unreadCount, pendingMessages, newRequests, pendingUsers, pendingAppointments, staleAppointments, markRead, updateBadge, profileName, emit } from './data.js';
import { UI, go } from './layout.js';
import { registerSW, onSWMessage, ensureSubscription } from './push.js';
import { renderAuth, renderWelcome, showLock, needsLock, showNewPin, renderNotConfigured, needsTerms, renderTermsGate, legalLinks } from './views/auth.js';
import { renderHome } from './views/home.js';
import { renderCalendar } from './views/calendar.js';
import { renderEvents, renderEventDetail } from './views/events.js';
import { renderEventForm } from './views/event-form.js';
import { renderCustomers, renderCustomer } from './views/customers.js';
import { renderMoney } from './views/money.js';
import { renderSheets } from './views/sheets.js';
import { renderAppointments, renderAppointmentForm } from './views/appointments.js';
import { renderWorkflow, wfLateCount } from './views/workflow.js';
import { renderOutbox } from './views/outbox.js';
import { renderTeam } from './views/team.js';
import { renderSettings } from './views/settings.js';
import { renderHelp, maybeShowTour } from './views/help.js';
import { renderNotifications } from './views/notifications.js';

applyTheme();
window.__imNavCount = 0;

const ROUTES = [
  { p: 'home', v: renderHome },
  { p: 'calendar', v: renderCalendar },
  { p: 'events', v: renderEvents },
  { p: 'new-event', v: renderEventForm, admin: true },
  { p: 'event/:id', v: renderEventDetail },
  { p: 'event/:id/edit', v: renderEventForm, admin: true },
  { p: 'customers', v: renderCustomers, admin: true },
  { p: 'customer/:id', v: renderCustomer, admin: true },
  { p: 'money', v: renderMoney, admin: true },
  { p: 'sheets', v: renderSheets, admin: true, wide: true },
  { p: 'sheets/:tab', v: renderSheets, admin: true, wide: true },
  { p: 'requests', v: () => go('#/appointments'), admin: true },
  { p: 'appointments', v: renderAppointments, admin: true },
  { p: 'appointment-new', v: renderAppointmentForm, admin: true },
  { p: 'appointment/:id/edit', v: renderAppointmentForm, admin: true },
  { p: 'workflow', v: renderWorkflow, admin: true },
  { p: 'outbox', v: renderOutbox, admin: true },
  { p: 'outbox/:id', v: renderOutbox, admin: true },
  { p: 'team', v: renderTeam, admin: true },
  { p: 'settings', v: renderSettings },
  { p: 'help', v: renderHelp },
  { p: 'help/:sec', v: renderHelp },
  { p: 'notifications', v: renderNotifications },
];

function matchRoute(hash) {
  const path = hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  const parts = path.split('/');
  for (const r of ROUTES) {
    const rp = r.p.split('/');
    if (rp.length !== parts.length) continue;
    const params = {};
    if (rp.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(parts[i])), true) : seg === parts[i]))) {
      const qs = new URLSearchParams(hash.split('?')[1] || '');
      qs.forEach((v, k) => { params[k] = v; });
      return { route: r, params, path };
    }
  }
  return null;
}

// ---------- Πλοήγηση ----------
function navItems() {
  const admin = isAdmin();
  const items = [
    { sec: L('Γενικά', 'General') },
    { h: '#/home', i: 'home', t: L('Αρχική', 'Home') },
    { h: '#/calendar', i: 'calendar', t: L('Ημερολόγιο', 'Calendar') },
    admin ? { h: '#/appointments', i: 'handshake', t: L('Προσφορές / Ραντεβού', 'Offers / Appointments'), count: () => pendingAppointments().length, warn: () => staleAppointments().length }
      : { h: '#/events', i: 'events', t: L('Οι εκδηλώσεις μου', 'My events') },
  ];
  if (admin) {
    items.push({ h: '#/workflow', i: 'flow', t: L('Κατάσταση Εργασιών', 'Work status'), count: () => wfLateCount() });
    items.push({ sec: L('Οικονομικά', 'Finance') });
    items.push({ h: '#/money', i: 'wallet', t: L('Έσοδα & Έξοδα', 'Income & Expenses') });
    items.push({ h: '#/sheets', i: 'table', t: L('Φύλλα (Excel)', 'Sheets (Excel)') });
    if (isVideoAdmin()) items.push({ h: '#/sheets/mitsos', i: 'film', t: 'Mitsos', count: () => sosCount() });
    items.push({ sec: L('Επικοινωνία', 'Communication') });
    items.push({ h: '#/outbox', i: 'message', t: L('Μηνύματα προς πελάτες', 'Messages to clients'), count: () => pendingMessages().length });
  }
  items.push({ h: '#/notifications', i: 'bell', t: L('Ειδοποιήσεις', 'Notifications'), count: () => unreadCount() });
  items.push({ sec: L('Ομάδα & ρυθμίσεις', 'Team & settings') });
  if (admin) items.push({ h: '#/team', i: 'shield', t: L('Ομάδα', 'Team'), count: () => pendingUsers().length });
  items.push({ h: '#/settings', i: 'settings', t: L('Ρυθμίσεις', 'Settings') });
  items.push({ h: '#/help', i: 'help', t: L('Οδηγός & Ερωτήσεις', 'Guide & FAQ') });
  return items;
}
function sosCount() {
  let n = 0;
  S.events.forEach((e) => { if (['lab', 'ready', 'delivered'].includes(e.photo_status) && e.editing_status !== 'done' && e.status !== 'cancelled') n++; });
  return n;
}
function tabItems() {
  const admin = isAdmin();
  return [
    { h: '#/home', i: 'home', t: L('Αρχική', 'Home') },
    { h: '#/calendar', i: 'calendar', t: L('Ημερολόγιο', 'Calendar') },
    admin ? { h: '#/appointments', i: 'handshake', t: L('Ραντεβού', 'Offers'), count: () => staleAppointments().length } : { h: '#/events', i: 'events', t: L('Εκδηλώσεις', 'Events') },
    admin ? { h: '#/money', i: 'wallet', t: L('Έσοδα/Έξοδα', 'Money') } : { h: '#/notifications', i: 'bell', t: L('Ειδοποιήσεις', 'Alerts'), count: () => unreadCount() },
    { h: '#more', i: 'grid', t: L('Περισσότερα', 'More'), count: () => (admin ? pendingMessages().length + pendingUsers().length + unreadCount() + wfLateCount() : 0) },
  ];
}

function shellHTML() {
  const p = S.profile;
  return `
  <div class="app">
    <aside class="sidebar" aria-label="${esc(L('Μενού', 'Menu'))}">
      <div class="sidebar-head">
        <div class="brand-badge"><img src="icons/icon-192.png" alt="" style="width:40px;border-radius:11px"></div>
        <div class="brand-text"><b>IMAGE MAKERS</b><small>Studio Manager</small></div>
        <button class="icon-btn sidebar-toggle" id="sbToggle" title="${esc(L('Σύμπτυξη / ανάπτυξη μενού', 'Collapse / expand menu'))}" aria-label="${esc(L('Σύμπτυξη μενού', 'Collapse menu'))}">${icon('sidebar')}</button>
      </div>
      <nav class="nav" id="nav"></nav>
      <div class="sidebar-foot">
        <a class="me-chip" href="#/settings">
          <span class="avatar" style="--c:${p.color || colorFor(p.id)}">${esc(initials(profileName(p)))}</span>
          <span class="who"><b>${esc(profileName(p))}</b><small>${esc(lbl(ROLES, p.role))}</small></span>
        </a>
        <div class="credit"><div>${legalLinks()}</div>made by <b>“georgeousDev”</b> software solutions · <a href="mailto:gkararizosg@gmail.com">gkararizosg@gmail.com</a></div>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <main class="main">
      <header class="topbar" id="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="${esc(L('Μενού', 'Menu'))}">${icon('menu')}</button>
        <div class="title" id="topTitle"></div>
        <div class="spacer"></div>
        <div id="topActions" class="hstack" style="flex-wrap:nowrap"></div>
        <a class="icon-btn" href="#/notifications" id="bellBtn" aria-label="${esc(L('Ειδοποιήσεις', 'Notifications'))}">${icon('bell')}<span class="badge" hidden></span></a>
      </header>
      <div class="page" id="page"></div>
    </main>
    <div class="tabbar"><nav id="tabbar"></nav></div>
  </div>`;
}

function renderNav() {
  const cur = '#/' + (location.hash.replace(/^#\/?/, '').split('?')[0] || 'home');
  const isActive = (h) => {
    if (h === '#/sheets') return cur.startsWith('#/sheets') && cur !== '#/sheets/mitsos';
    if (h === '#/events') return cur === '#/events' || cur.startsWith('#/event/') || cur === '#/new-event';
    if (h === '#/appointments') return cur.startsWith('#/appointment');
    if (h === '#/outbox') return cur.startsWith('#/outbox');
    if (h === '#/help') return cur.startsWith('#/help');
    return cur === h;
  };
  const nav = $('#nav');
  if (nav) nav.innerHTML = navItems().map((it) => {
    if (it.sec) return `<div class="nav-section">${esc(it.sec)}</div>`;
    const n = it.count ? it.count() : 0;
    return `<a href="${it.h}" class="${isActive(it.h) ? 'active' : ''}" title="${esc(it.t)}">${icon(it.i)}<span>${esc(it.t)}</span>${n ? `<b class="count">${n > 99 ? '99+' : n}</b><i class="dot-count"></i>` : ''}</a>`;
  }).join('');
  const tb = $('#tabbar');
  if (tb) tb.innerHTML = tabItems().map((it) => {
    const n = it.count ? it.count() : 0;
    return `<a href="${it.h}" class="${isActive(it.h) ? 'active' : ''}">${icon(it.i)}<span>${esc(it.t)}</span>${n ? `<b class="badge">${n > 99 ? '99+' : n}</b>` : ''}</a>`;
  }).join('');
  const bell = $('#bellBtn .badge');
  const un = unreadCount();
  if (bell) { bell.hidden = !un; bell.textContent = un > 99 ? '99+' : un; }
  updateBadge();
}

// ---------- Προβολή σελίδας ----------
let cleanup = null;
let lastPath = null;
let pendingRefresh = false;

function renderRoute({ animate = true } = {}) {
  const page = $('#page');
  if (!page) return;
  const m = matchRoute(location.hash || '#/home');
  if (!m) { go('#/home'); return; }
  if ((m.route.admin && !isAdmin()) || (m.route.videoAdmin && !isVideoAdmin()) || (m.params.tab === 'mitsos' && !isVideoAdmin())) {
    toast(L('Δεν έχετε πρόσβαση σε αυτή τη σελίδα', 'You do not have access to this page'), { type: 'err' });
    go('#/home');
    return;
  }
  const samePage = lastPath === m.path;
  const scroll = samePage ? window.scrollY : 0;
  try { cleanup?.(); } catch {}
  cleanup = null;
  page.classList.toggle('wide', !!m.route.wide);
  UI.actions.innerHTML = '';
  page.innerHTML = '';
  try {
    cleanup = m.route.v(page, m.params) || null;
  } catch (e) {
    console.error(e);
    page.innerHTML = `<div class="empty">${icon('warning')}<b>${esc(L('Κάτι πήγε στραβά σε αυτή τη σελίδα', 'Something went wrong on this page'))}</b><div class="small">${esc(e.message)}</div></div>`;
  }
  if (animate && !samePage) { page.classList.remove('view-enter'); void page.offsetWidth; page.classList.add('view-enter'); }
  window.scrollTo(0, scroll);
  lastPath = m.path;
  renderNav();
  onScroll();
}

const refresh = debounce(() => {
  if (!$('#page')) return;
  const a = document.activeElement;
  const typing = a && $('#page').contains(a) && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable);
  if (typing || document.querySelector('.xl .cell-input')) { pendingRefresh = true; return; }
  renderRoute({ animate: false });
}, 150);
document.addEventListener('focusout', () => { if (pendingRefresh) { pendingRefresh = false; setTimeout(refresh, 200); } });

function onScroll() { $('#topbar')?.classList.toggle('scrolled', window.scrollY > 28); }
window.addEventListener('scroll', onScroll, { passive: true });

window.addEventListener('hashchange', () => {
  window.__imNavCount++;
  document.body.classList.remove('drawer-open');
  if (location.hash !== '#more') closeAllLayers();
  if (location.hash === '#more') { history.replaceState(null, '', '#/' + (lastPath || 'home')); document.body.classList.add('drawer-open'); return; }
  if (!$('#page')) return;
  renderRoute();
});

// ---------- Εκκίνηση ----------
function hideBoot() { const b = $('#boot'); if (b) { b.classList.add('hide'); setTimeout(() => b.remove(), 600); } }

async function startApp() {
  const root = $('#root');
  if (localStorage.getItem('im.sb') === '1') document.body.classList.add('sb-collapsed');
  root.innerHTML = shellHTML();
  UI.topTitle = $('#topTitle');
  UI.actions = $('#topActions');
  $('#sbToggle').addEventListener('click', () => {
    const c = document.body.classList.toggle('sb-collapsed');
    try { localStorage.setItem('im.sb', c ? '1' : '0'); } catch {}
  });
  $('#menuBtn').addEventListener('click', () => document.body.classList.add('drawer-open'));
  $('#scrim').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  on(document.body, 'click', '[data-back]', (e, b) => { e.preventDefault(); if (window.__imNavCount > 1) history.back(); else go(b.dataset.back || '#/home'); });
  // swipe από αριστερά για άνοιγμα μενού (κινητό)
  let sx = null;
  document.addEventListener('touchstart', (e) => { const x = e.touches[0].clientX; sx = x < 18 && !hasLayer() ? x : null; }, { passive: true });
  document.addEventListener('touchmove', (e) => { if (sx !== null && e.touches[0].clientX - sx > 60) { document.body.classList.add('drawer-open'); sx = null; } }, { passive: true });

  renderNav();
  if (!location.hash || location.hash === '#' || location.hash === '#/') history.replaceState(null, '', '#/home');
  renderRoute();
  hideBoot();
  maybeShowTour();
}

async function enterApp() {
  const root = $('#root');
  try { await loadProfile(); } catch (e) { console.error(e); }
  if (!S.profile) {
    // το προφίλ δημιουργείται αμέσως μετά την εγγραφή — μικρή αναμονή
    for (let i = 0; i < 6 && !S.profile; i++) { await new Promise((r) => setTimeout(r, 600)); await loadProfile().catch(() => {}); }
  }
  if (!S.profile) { hideBoot(); renderAuth(root, { onDone: enterApp }); return; }
  if (S.profile.lang && S.profile.lang !== LANG) setLang(S.profile.lang);
  if (!S.profile.active) {
    hideBoot();
    root.innerHTML = `<div class="welcome"><div class="box"><div class="emoji">🔒</div><h1>${esc(L('Ο λογαριασμός είναι απενεργοποιημένος', 'This account is disabled'))}</h1><p>${esc(L('Επικοινωνήστε με έναν διαχειριστή της Image Makers.', 'Please contact an Image Makers admin.'))}</p><button class="btn mt" id="lo">${icon('logout')} ${esc(L('Αποσύνδεση', 'Sign out'))}</button></div></div>`;
    $('#lo').onclick = () => sb.auth.signOut();
    return;
  }
  if (needsTerms()) { hideBoot(); await renderTermsGate(root); }
  if (!hasRole()) {
    hideBoot();
    startRealtime();
    renderWelcome(root, { onRole: () => { location.hash = '#/home'; enterApp(); } });
    return;
  }
  if (needsLock()) { hideBoot(); await showLock(); }
  root.innerHTML = `<div class="boot" id="boot" style="background:var(--bg)"><div class="spinner dark"></div></div>`;
  try { await loadAll(); } catch (e) { console.error(e); toast(L('Πρόβλημα φόρτωσης δεδομένων', 'Could not load data'), { type: 'err', body: e.message }); }
  startRealtime();
  ensureSubscription().catch(() => {});
  await startApp();
}

// νέες ειδοποιήσεις όσο η εφαρμογή είναι ανοιχτή
setNotificationHandler((n) => {
  if (document.visibilityState !== 'visible') return;
  toast(n.title, { type: 'info', body: (n.body || '').split('\n')[0], ms: 5500, onClick: () => { markRead(n.id); if (n.link) go(n.link); } });
  renderNav();
});
onSWMessage('navigate', (hash, id) => { if (id) markRead(id); go(hash); });
subscribe((what) => {
  if (what === 'me') {
    if (!S.profile?.active) { location.reload(); return; }
    if (hasRole() !== !!$('#page')) { location.reload(); return; }
  }
  renderNav();
  refresh();
});

// Κλείδωμα όταν η εφαρμογή μένει στο παρασκήνιο
let hiddenAt = 0;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); try { sessionStorage.setItem('im.hiddenAt', String(hiddenAt)); } catch {} return; }
  if (S.profile && hasRole() && $('#page') && needsLock(hiddenAt)) await showLock();
});

async function boot() {
  registerSW();
  const root = $('#root');
  if (!configured) { hideBoot(); renderNotConfigured(root); return; }
  const urlInfo = window.__IM_URL || {};
  let recovering = !!urlInfo.recovery || /type=recovery/.test(location.hash);
  let recoveryShown = false;
  const doRecovery = async () => {
    if (recoveryShown) return;
    recoveryShown = true;
    hideBoot();
    history.replaceState(null, '', location.pathname + '#/home');
    await showNewPin({ recovery: true });
    enterApp();
  };
  sb.auth.onAuthStateChange(async (event, session) => {
    S.session = session;
    if (event === 'PASSWORD_RECOVERY') { recovering = true; doRecovery(); }
    if (event === 'SIGNED_OUT') {
      stopRealtime();
      S.profile = null; S.loaded = false;
      try { sessionStorage.clear(); } catch {}
      location.hash = '#/home';
      renderAuth($('#root'), { onDone: enterApp });
    }
  });
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  if (urlInfo.error) {
    history.replaceState(null, '', location.pathname + '#/home');
    toast(L('Ο σύνδεσμος δεν ισχύει πια', 'The link is no longer valid'), { type: 'err', body: L('Ζητήστε νέο από «Ξέχασα το PIN». Ο σύνδεσμος ισχύει μία φορά και για λίγη ώρα.', 'Request a new one from “Forgot PIN”. The link works once and for a short time.'), ms: 8000 });
  }
  if (recovering) {
    if (S.session) { doRecovery(); return; }
    // περιμένουμε λίγο να ολοκληρωθεί η σύνδεση από τον σύνδεσμο
    for (let i = 0; i < 20 && !S.session; i++) await new Promise((r) => setTimeout(r, 250));
    if (S.session) { doRecovery(); return; }
    toast(L('Ο σύνδεσμος δεν ισχύει πια', 'The link is no longer valid'), { type: 'err', body: L('Ζητήστε νέο από «Ξέχασα το PIN».', 'Request a new one from “Forgot PIN”.'), ms: 8000 });
  }
  if (!S.session) { hideBoot(); renderAuth(root, { onDone: enterApp }); return; }
  enterApp();
}

boot();
