// =====================================================================
//  Ειδοποιήσεις (μέσα στην εφαρμογή)
// =====================================================================
import { L, esc, icon, timeAgo, actionSheet } from '../core.js';
import { S, markRead, markAllRead, deleteNotification } from '../data.js';
import { pageHead, emptyState, setTopActions, go } from '../layout.js';

const KIND = { assignment: ['users', 'var(--accent)'], event: ['events', 'var(--blue)'], reminder: ['clock', 'var(--orange)'], message: ['message', 'var(--accent)'], request: ['inbox', 'var(--blue)'], team: ['shield', 'var(--purple)'], sos: ['warning', 'var(--red)'], editing: ['film', 'var(--purple)'], test: ['checkCircle', 'var(--green)'] };

export function renderNotifications(root) {
  const list = S.notifications;
  setTopActions(list.some((n) => !n.read_at) ? `<button class="btn small" data-all>${icon('check')} <span class="hide-mobile">${esc(L('Όλες διαβάστηκαν', 'Mark all read'))}</span></button>` : '');
  let html = pageHead(L('Ειδοποιήσεις', 'Notifications'));
  html += list.length ? `<div class="list">${list.map((n) => {
    const [ic, c] = KIND[n.kind] || ['bell', 'var(--label-2)'];
    return `<button class="row has-icon notif ${n.read_at ? 'read' : ''}" data-n="${n.id}"><span class="dot"></span><span class="row-icon" style="background:${c}">${icon(ic)}</span><div class="main-col"><div class="t">${esc(n.title)}</div><div class="s">${esc(n.body || '')}</div></div><div class="v tiny">${esc(timeAgo(n.created_at))}</div></button>`;
  }).join('')}</div>` : emptyState('bell', L('Καμία ειδοποίηση', 'No notifications'), L('Εδώ θα βλέπετε αναθέσεις, αλλαγές, πληρωμές και υπενθυμίσεις.', 'Assignments, changes, payments and reminders appear here.'));
  root.innerHTML = html;
  document.querySelector('[data-all]')?.addEventListener('click', () => markAllRead());
  root.querySelectorAll('[data-n]').forEach((b) => {
    const n = list.find((x) => x.id === b.dataset.n);
    b.addEventListener('click', () => { markRead(n.id); if (n.link) go(n.link); });
    b.addEventListener('contextmenu', async (e) => { e.preventDefault(); const a = await actionSheet({ actions: [{ label: L('Διαγραφή', 'Delete'), value: 'd', destructive: true, icon: 'trash' }] }); if (a === 'd') deleteNotification(n.id); });
  });
}
