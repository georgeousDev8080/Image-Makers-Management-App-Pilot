// =====================================================================
//  Ομάδα: ρόλοι, κωδικοί πρόσκλησης, ιστορικό
// =====================================================================
import { L, esc, icon, lbl, ROLES, timeAgo, actionSheet, confirmBox, toast, toastErr, sheet, copyText, segmented, initSegmented, busy, fmtDate } from '../core.js';
import { sb, S, profileName, reload, friendlyError } from '../data.js';
import { pageHead, setTopActions } from '../layout.js';
import { avatar } from '../components.js';
import { verifyPinPrompt } from './auth.js';

let activity = null;
let invites = null;

const ROLE_HELP = () => ({
  admin_photo: L('Πλήρης πρόσβαση: οικονομικά, Excel, ομάδα, ρυθμίσεις.', 'Full access: finances, Excel, team, settings.'),
  admin_video: L('Πλήρης πρόσβαση + το φύλλο «Mitsos» για το μοντάζ.', 'Full access + the “Mitsos” editing sheet.'),
  photographer: L('Βλέπει μόνο τις εκδηλώσεις που του ανατίθενται, χωρίς τιμές.', 'Sees only events assigned to them, without prices.'),
  videographer: L('Βλέπει μόνο τις εκδηλώσεις που του ανατίθενται, χωρίς τιμές.', 'Sees only events assigned to them, without prices.'),
});

async function loadExtras(root) {
  const [a, i] = await Promise.all([
    sb.from('activity_log').select('*').order('at', { ascending: false }).limit(60),
    sb.from('invite_codes').select('*').order('created_at', { ascending: false }).limit(50),
  ]);
  activity = a.data || []; invites = i.data || [];
  // ο χρήστης μπορεί να έφυγε από τη σελίδα όσο φόρτωνε
  if (!root.isConnected || !/^#\/team/.test(location.hash)) return;
  renderTeam(root, true);
}

export function renderTeam(root, skipLoad = false) {
  if (skipLoad !== true) loadExtras(root);
  setTopActions(`<button class="btn primary small" data-invite>${icon('key')} <span class="hide-mobile">${esc(L('Κωδικός πρόσκλησης', 'Invite code'))}</span></button>`);
  const pending = S.profiles.filter((p) => !p.role && p.active);
  const admins = S.profiles.filter((p) => ['admin_photo', 'admin_video'].includes(p.role) && p.active);
  const crew = S.profiles.filter((p) => ['photographer', 'videographer'].includes(p.role) && p.active);
  const off = S.profiles.filter((p) => !p.active);
  const row = (p) => `<button class="row has-icon" data-p="${p.id}">${avatar(p)}<div class="main-col"><div class="t">${esc(profileName(p))}${p.id === S.profile.id ? ` <span class="pill">${esc(L('εσείς', 'you'))}</span>` : ''}</div><div class="s">@${esc(p.username)} · ${esc(p.email)}</div></div><div class="v small">${esc(p.role ? lbl(ROLES, p.role) : L('Χωρίς ρόλο', 'No role'))}</div>${icon('chevR', 'chev')}</button>`;
  let html = pageHead(L('Ομάδα', 'Team'), { sub: esc(L(`${admins.length + crew.length} ενεργά μέλη`, `${admins.length + crew.length} active members`)) });
  if (pending.length) html += `<div class="banner">${icon('user')}<div><b>${esc(L(`${pending.length} νέοι λογαριασμοί περιμένουν ρόλο`, `${pending.length} new accounts are waiting for a role`))}</b><span>${esc(L('Πατήστε πάνω τους για να τους δώσετε ρόλο. Μέχρι τότε βλέπουν μόνο μια οθόνη καλωσορίσματος.', 'Tap them to give a role. Until then they only see a welcome screen.'))}</span></div></div>
    <div class="list">${pending.map((p) => row(p).replace('</button>', `<span class="btn small primary" style="margin-left:6px">${esc(L('Ρόλος', 'Role'))}</span></button>`)).join('')}</div>`;
  html += `<div class="group-label">${esc(L('Διαχειριστές', 'Admins'))}</div><div class="list">${admins.map(row).join('')}</div>`;
  html += `<div class="group-label">${esc(L('Συνεργείο', 'Crew'))}</div>${crew.length ? `<div class="list">${crew.map(row).join('')}</div>` : `<div class="card pad muted small">${esc(L('Κανένα μέλος ακόμη. Δώστε έναν κωδικό πρόσκλησης ή ζητήστε τους να κάνουν εγγραφή.', 'No members yet. Give an invite code or ask them to sign up.'))}</div>`}`;
  if (off.length) html += `<div class="group-label">${esc(L('Απενεργοποιημένοι', 'Disabled'))}</div><div class="list" style="opacity:.7">${off.map(row).join('')}</div>`;

  html += `<div class="group-label">${esc(L('Ρόλοι — τι βλέπει ο καθένας', 'Roles — who sees what'))}</div><div class="list">${ROLES.map((r) => `<div class="row"><div class="main-col"><div class="t">${esc(L(r.el, r.en))}</div><div class="s" style="white-space:normal">${esc(ROLE_HELP()[r.v])}</div></div></div>`).join('')}</div>`;

  const active = (invites || []).filter((i) => !i.used_at && (!i.expires_at || new Date(i.expires_at) > new Date()) && i.role !== 'owner');
  html += `<div class="group-label">${esc(L('Ενεργοί κωδικοί πρόσκλησης', 'Active invite codes'))}</div>`;
  html += invites === null ? `<div class="card pad"><div class="skeleton" style="height:20px"></div></div>` : active.length ? `<div class="list">${active.map((i) => `<div class="row"><div class="main-col"><div class="t">${esc(lbl(ROLES, i.role))}${i.note ? ' · ' + esc(i.note) : ''}</div><div class="s">${esc(L('Λήγει', 'Expires'))} ${esc(new Date(i.expires_at).toLocaleString(L('el-GR', 'en-GB')))}</div></div><button class="btn small danger" data-revoke="${i.id}">${esc(L('Ακύρωση', 'Revoke'))}</button></div>`).join('')}</div>` : `<div class="card pad muted small">${esc(L('Κανένας ενεργός κωδικός. Για ασφάλεια, κάθε κωδικός ισχύει μία φορά και λήγει.', 'No active codes. For safety, each code works once and expires.'))}</div>`;

  html += `<div class="group-label">${esc(L('Ιστορικό ασφαλείας', 'Security history'))}</div>`;
  const actName = (a) => ({ role_changed: L('Αλλαγή ρόλου', 'Role changed'), role_from_code: L('Ρόλος με κωδικό', 'Role via code'), invite_created: L('Νέος κωδικός πρόσκλησης', 'Invite created'), invite_failed: L('Λάθος κωδικός', 'Wrong code'), user_disabled: L('Απενεργοποίηση χρήστη', 'User disabled'), user_enabled: L('Ενεργοποίηση χρήστη', 'User enabled'), event_deleted: L('Διαγραφή εκδήλωσης', 'Event deleted'), payment_deleted: L('Διαγραφή πληρωμής', 'Payment deleted'), expense_deleted: L('Διαγραφή εξόδου', 'Expense deleted'), push_configured: L('Ρύθμιση ειδοποιήσεων', 'Push configured') }[a.action] || a.action);
  const detail = (a) => {
    const d = a.details || {};
    if (a.action === 'role_changed') return `${profileName(S.profiles.find((p) => p.id === a.entity_id))}: ${d.from ? lbl(ROLES, d.from) : '—'} → ${d.to ? lbl(ROLES, d.to) : L('χωρίς ρόλο', 'no role')}`;
    if (a.action === 'role_from_code') return `${profileName(S.profiles.find((p) => p.id === a.entity_id))} → ${lbl(ROLES, d.role)}`;
    if (a.action === 'event_deleted') return `${fmtDate(d.event_date)} · ${d.church_location || ''}`;
    if (a.action === 'payment_deleted' || a.action === 'expense_deleted') return `${d.label || d.kind || ''} · ${d.amount} €`;
    if (a.action === 'invite_created') return lbl(ROLES, d.role);
    return '';
  };
  html += activity === null ? `<div class="card pad"><div class="skeleton" style="height:20px"></div></div>` : activity.length ? `<div class="list">${activity.slice(0, 40).map((a) => `<div class="row"><div class="main-col"><div class="t">${esc(actName(a))}</div><div class="s">${esc(detail(a))}${detail(a) ? ' · ' : ''}${esc(profileName(S.profiles.find((p) => p.id === a.user_id)))}</div></div><div class="v tiny">${esc(timeAgo(a.at))}</div></div>`).join('')}</div>` : `<div class="card pad muted small">—</div>`;
  root.innerHTML = html;

  document.querySelector('[data-invite]')?.addEventListener('click', () => createInvite(root));
  root.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => memberActions(S.profiles.find((p) => p.id === b.dataset.p), root)));
  root.querySelectorAll('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmBox(L('Ακύρωση κωδικού;', 'Revoke code?'), L('Δεν θα μπορεί πλέον να χρησιμοποιηθεί.', 'It can no longer be used.'), { ok: L('Ακύρωση κωδικού', 'Revoke'), destructive: true })) return;
    await sb.from('invite_codes').delete().eq('id', b.dataset.revoke); loadExtras(root);
  }));
}

async function setRole(p, role, root) {
  const isAdminRole = ['admin_photo', 'admin_video'].includes(role);
  if (isAdminRole) {
    if (!await confirmBox(L('Ορισμός διαχειριστή;', 'Make admin?'), L(`Ο/Η ${profileName(p)} θα έχει πλήρη πρόσβαση σε οικονομικά, πελάτες και ομάδα.`, `${profileName(p)} will have full access to finances, customers and team.`), { ok: L('Συνέχεια', 'Continue') })) return;
    if (!await verifyPinPrompt(L('Για ασφάλεια, γράψτε το δικό σας PIN.', 'For safety, enter your own PIN.'))) return;
  }
  if (p.id === S.profile.id && !isAdminRole && !await confirmBox(L('Αλλαγή του δικού σας ρόλου;', 'Change your own role?'), L('Θα χάσετε την πρόσβαση διαχειριστή.', 'You will lose admin access.'), { ok: L('Αλλαγή', 'Change'), destructive: true })) return;
  const { error } = await sb.rpc('admin_set_role', { p_user: p.id, p_role: role });
  if (error) { toastErr(L('Ο ρόλος δεν άλλαξε', 'Role not changed'), friendlyError(error)); return; }
  await reload('profiles');
  toast(role ? L(`Νέος ρόλος: ${lbl(ROLES, role)}`, `New role: ${lbl(ROLES, role)}`) : L('Ο ρόλος αφαιρέθηκε', 'Role removed'), { body: L('Ο χρήστης ειδοποιήθηκε.', 'The user was notified.') });
  loadExtras(root);
}

async function memberActions(p, root) {
  if (!p) return;
  const acts = [
    ...ROLES.filter((r) => r.v !== p.role).map((r) => ({ label: L(`Ρόλος: ${r.el}`, `Role: ${r.en}`), value: 'role:' + r.v, icon: r.v.startsWith('admin') ? 'shield' : r.v === 'videographer' ? 'video' : 'camera' })),
    ...(p.role ? [{ label: L('Αφαίρεση ρόλου', 'Remove role'), value: 'role:', icon: 'x' }] : []),
    ...(p.id !== S.profile.id ? [{ label: p.active ? L('Απενεργοποίηση λογαριασμού', 'Disable account') : L('Ενεργοποίηση λογαριασμού', 'Enable account'), value: 'active', icon: 'lock', destructive: p.active }] : []),
  ];
  const a = await actionSheet({ title: `${profileName(p)} · ${p.role ? lbl(ROLES, p.role) : L('χωρίς ρόλο', 'no role')}`, actions: acts });
  if (!a) return;
  if (a.startsWith('role:')) return setRole(p, a.slice(5) || null, root);
  if (a === 'active') {
    if (p.active && !await confirmBox(L('Απενεργοποίηση;', 'Disable?'), L(`Ο/Η ${profileName(p)} δεν θα μπορεί να μπει στην εφαρμογή.`, `${profileName(p)} will not be able to use the app.`), { ok: L('Απενεργοποίηση', 'Disable'), destructive: true })) return;
    const { error } = await sb.rpc('admin_set_active', { p_user: p.id, p_active: !p.active });
    if (error) { toastErr(L('Δεν ολοκληρώθηκε', 'Not completed'), friendlyError(error)); return; }
    await reload('profiles'); loadExtras(root);
  }
}

function createInvite(root) {
  let role = 'photographer', hours = '48';
  const body = document.createElement('div');
  body.innerHTML = `<div class="form">
    <p class="muted small">${esc(L('Ο νέος συνεργάτης κάνει εγγραφή στην εφαρμογή και γράφει αυτόν τον κωδικό. Παίρνει αμέσως τον ρόλο. Ο κωδικός ισχύει μία φορά.', 'The new member signs up and enters this code. They get the role instantly. The code works once.'))}</p>
    <div class="field"><label>${esc(L('Ρόλος', 'Role'))}</label><select class="select" name="role">${ROLES.map((r) => `<option value="${r.v}" ${r.v === role ? 'selected' : ''}>${esc(L(r.el, r.en))}</option>`).join('')}</select></div>
    <div class="field"><label>${esc(L('Ισχύς', 'Valid for'))}</label>${segmented('h', [{ v: '2', label: L('2 ώρες', '2 hours') }, { v: '48', label: L('2 ημέρες', '2 days') }, { v: '168', label: L('1 εβδομάδα', '1 week') }], hours, { block: true })}</div>
    <div class="field"><label>${esc(L('Για ποιον (προαιρετικό)', 'For whom (optional)'))}</label><input class="input" name="note" placeholder="${esc(L('π.χ. Νίκος', 'e.g. Nick'))}"></div>
    <button class="btn primary large block" data-go>${icon('key')} ${esc(L('Δημιουργία κωδικού', 'Create code'))}</button>
    <div id="out"></div></div>`;
  const s = sheet({ title: L('Κωδικός πρόσκλησης', 'Invite code'), body });
  initSegmented(body, (_, v) => { hours = v; });
  body.querySelector('[data-go]').addEventListener('click', async (e) => { const _btn = e.currentTarget;
    role = body.querySelector('[name=role]').value;
    if (role.startsWith('admin') && !await verifyPinPrompt(L('Κωδικός για διαχειριστή — επιβεβαιώστε με το PIN σας.', 'Admin code — confirm with your PIN.'))) return;
    busy(_btn, true);
    const { data, error } = await sb.rpc('admin_create_invite', { p_role: role, p_hours: Number(hours), p_note: body.querySelector('[name=note]').value || null });
    busy(_btn, false);
    if (error) { toastErr(L('Δεν δημιουργήθηκε', 'Not created'), friendlyError(error)); return; }
    const link = location.href.split('#')[0];
    const msg = L(`Καλώς ήρθες στην Image Makers! 📸\n1. Άνοιξε: ${link}\n2. Πάτησε «Δημιουργία λογαριασμού»\n3. Γράψε τον κωδικό: ${data}\n(ισχύει ${hours === '2' ? '2 ώρες' : hours === '48' ? '2 ημέρες' : '1 εβδομάδα'}, μία φορά)`, `Welcome to Image Makers! 📸\n1. Open: ${link}\n2. Tap “Create account”\n3. Enter the code: ${data}\n(valid ${hours === '2' ? '2 hours' : hours === '48' ? '2 days' : '1 week'}, once)`);
    body.querySelector('#out').innerHTML = `<div class="codebox mt">${esc(data)}</div><p class="small muted center mt-s">${esc(L('Ο κωδικός εμφανίζεται μόνο τώρα. Στείλτε τον στον συνεργάτη.', 'The code is shown only now. Send it to the member.'))}</p>
      <div class="grid cols-2 mt-s" style="gap:8px"><button class="btn" data-cp>${icon('copy')} ${esc(L('Αντιγραφή μηνύματος', 'Copy message'))}</button>${navigator.share ? `<button class="btn" data-sh>${icon('share')} ${esc(L('Κοινοποίηση', 'Share'))}</button>` : ''}</div>`;
    body.querySelector('[data-cp]').addEventListener('click', async () => { await copyText(msg); toast(L('Αντιγράφηκε', 'Copied')); });
    body.querySelector('[data-sh]')?.addEventListener('click', () => navigator.share({ text: msg }).catch(() => {}));
    _btn.hidden = true;
    loadExtras(root);
  });
  void s;
}
