// =====================================================================
//  Layout helpers κοινά σε όλες τις σελίδες
// =====================================================================
import { esc, icon, L } from './core.js';

export const UI = { topTitle: null, actions: null, current: null };

export function go(hash) {
  if (!hash.startsWith('#')) hash = '#' + hash;
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
export function back(fallback = '#/home') {
  if (window.__imNavCount > 1) history.back(); else go(fallback);
}

/** Μεγάλος τίτλος σελίδας τύπου iOS */
export function pageHead(title, { sub = '', actions = '' } = {}) {
  if (UI.topTitle) UI.topTitle.textContent = title;
  document.title = `${title} · Image Makers`;
  return `<div class="page-head"><div><h1 class="large-title">${esc(title)}</h1>${sub ? `<div class="page-sub">${sub}</div>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}
export function setTopActions(html = '') { if (UI.actions) UI.actions.innerHTML = html; }

export function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty">${icon(ic)}<b>${esc(title)}</b>${text ? `<div>${esc(text)}</div>` : ''}${action ? `<div class="mt">${action}</div>` : ''}</div>`;
}
export const backBtn = (fallback) => `<button class="btn plain" data-back="${esc(fallback)}" style="margin-left:-10px">${icon('chevL')} ${esc(L('Πίσω', 'Back'))}</button>`;
