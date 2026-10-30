// =====================================================================
//  Ειδοποιήσεις (μέσα στην εφαρμογή)
// =====================================================================
import { L, esc, icon, timeAgo, actionSheet, segmented, initSegmented } from '../core.js';

const st = { tab: 'unread' };
import { S, markRead, markAllRead, deleteNotification } from '../data.js';
import { pageHead, emptyState, setTopActions, go } from '../layout.js';

const KIND = { assignment: ['users', 'var(--accent)'], event: ['events', 'var(--blue)'], reminder: ['clock', 'var(--orange)'], message: ['message', 'var(--accent)'], request: ['inbox', 'var(--blue)'], appointment: ['handshake', 'var(--orange)'], team: ['shield', 'var(--purple)'], sos: ['warning', 'var(--red)'], editing: ['film', 'var(--purple)'], test: ['checkCircle', 'var(--green)'], update: ['sparkles', 'var(--accent)'] };

export function renderNotifications(root) {
  const all = S.notifications;
  const unread = all.filter((n) => !n.read_at), read = all.filter((n) => n.read_at);
  const list = st.tab === 'unread' ? unread : read;
  setTopActions(unread.length ? `<button class="btn small" data-all>${icon('check')} <span class="hide-mobile">${esc(L('Όλες διαβάστηκαν', 'Mark all read'))}</span></button>` : '');
  let html = pageHead(L('Ειδοποιήσεις', 'Notifications'));
  html += `<div class="mb">${segmented('nt', [{ v: 'unread', label: L(`Μη αναγνωσμένες (${unread.length})`, `Unread (${unread.length})`) }, { v: 'read', label: L(`Αναγνωσμένες (${read.length})`, `Read (${read.length})`) }], st.tab)}</div>`;
  html += list.length ? `<div class="list">${list.map((n) => {
    const [ic, c] = KIND[n.kind] || ['bell', 'var(--label-2)'];
    return `<button class="row has-icon notif ${n.read_at ? 'read' : ''}" data-n="${n.id}"><span class="dot"></span><span class="row-icon" style="background:${c}">${icon(ic)}</span><div class="main-col"><div class="t">${esc(n.title)}</div><div class="s">${esc(n.body || '')}</div></div><div class="v tiny">${esc(timeAgo(n.created_at))}</div></button>`;
  }).join('')}</div>` : emptyState('bell', st.tab === 'unread' ? L('Καμία νέα ειδοποίηση 🎉', 'No new notifications 🎉') : L('Καμία αναγνωσμένη ειδοποίηση', 'No read notifications'), st.tab === 'unread' ? L('Οι αναθέσεις, αλλαγές, πληρωμές και υπενθυμίσεις εμφανίζονται εδώ. Όσες διαβάσετε περνούν στις «Αναγνωσμένες».', 'Assignments, changes, payments and reminders appear here. Once read they move to “Read”.') : '');
  root.innerHTML = html;
  initSegmented(root, (_, v) => { st.tab = v; renderNotifications(root); });
  document.querySelector('[data-all]')?.addEventListener('click', () => markAllRead());
  root.querySelectorAll('[data-n]').forEach((b) => {
    const n = list.find((x) => x.id === b.dataset.n);
    b.addEventListener('click', () => { markRead(n.id); if (n.link) go(n.link); });
    b.addEventListener('contextmenu', async (e) => { e.preventDefault(); const a = await actionSheet({ actions: [{ label: L('Διαγραφή', 'Delete'), value: 'd', destructive: true, icon: 'trash' }] }); if (a === 'd') deleteNotification(n.id); });
  });
}
