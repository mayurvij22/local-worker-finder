/**
 * dom.js — small helpers shared by the customer and admin pages.
 */

export const $ = (id) => document.getElementById(id);

/** Create an element with classes and (safely escaped) text. */
export function el(tag, className = '', text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ─── Icons (static SVG markup only — never user data) ───

const PATHS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};

export function icon(name, className = 'h-4 w-4') {
  const span = el('span', 'inline-flex shrink-0');
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML =
    `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round">${PATHS[name]}</svg>`;
  return span;
}

/** Small spinner for buttons that are waiting on the network. */
export function spinner(className = 'border-neutral-300 border-t-neutral-900') {
  return el('span', `h-4 w-4 animate-spin rounded-full border-2 ${className}`);
}

// ─── Toast ───

const TONES = { error: 'bg-red-600', success: 'bg-emerald-600' };
let toastTimer = null;

export function showToast(message, type) {
  const toast = $('toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.remove('bg-red-600', 'bg-emerald-600');
  if (TONES[type]) toast.classList.add(TONES[type]);
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4000);
}

// ─── Modals ───

export function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

export function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = '';
}

/** Close on backdrop click and on Escape. `onClose` runs any extra cleanup. */
export function wireModal(modal, onClose = () => {}) {
  const close = () => { closeModal(modal); onClose(); };
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
  return close;
}

// ─── Storage (can throw in private mode — never let that break the page) ───

export const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};
