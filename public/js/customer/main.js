/**
 * Customer page — pick a category, search by name or type of work, reveal a worker's
 * number, then call or WhatsApp them.
 *
 * The worker list is cached in localStorage for an instant first paint
 * (it has NO phone numbers). Revealed numbers live in memory only.
 *
 * Visits, category taps and call / WhatsApp taps are sent to /api/track
 * for the admin Analytics tab ("Show number" is logged by the server).
 */

import { $, el, icon, spinner, showToast, store } from '../shared/dom.js';
import { STRINGS, LANGS, jobLabel, jobIcon, jobSearchText } from './i18n.js';

const CACHE_KEY = 'yws_workers';
const LANG_KEY  = 'yws_lang';
const VISIT_KEY = 'yws_visit';

/** Saved choice first, then the phone's language, then English. */
function initialLang() {
  const saved = store.get(LANG_KEY);
  if (LANGS.includes(saved)) return saved;
  const device = (navigator.language || '').slice(0, 2);
  return LANGS.includes(device) ? device : 'en';
}

// ?job=Plumber&q=leak — so a filtered list can be shared and survives a reload
const params = new URLSearchParams(location.search);

const state = {
  lang: initialLang(),
  job: params.get('job') || 'all',
  query: (params.get('q') || '').trim(),
  workers: [],
  jobs: [],
  loaded: false,          // false until we have a worker list (cache or network)
  revealed: new Map(),    // worker id → { phone, whatsapp }
};

const t = (key, vars = {}) =>
  (STRINGS[state.lang][key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');

// ─── Helpers ───

function initials(name) {
  return name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  '#e11d48', '#ea580c', '#d97706', '#65a30d', '#059669', '#0d9488',
  '#0891b2', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3',
];

function avatarColor(name) {
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const formatPhone = (p) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;

/** Fire-and-forget analytics; failures are ignored. */
function track(type, extra = {}) {
  fetch('/api/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, ...extra }),
    keepalive: true, // still sent if the tap opens the dialer / WhatsApp
  }).catch(() => {});
}

// ─── Search ───

const normalize = (s) => (s || '').toLowerCase().normalize('NFC');
const splitWords = (s) => normalize(s).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);

// Words that say nothing about who to call: "AC repair", "plumber near me", "बिजली का काम".
const FILLER = new Set([
  'repair', 'repairing', 'service', 'services', 'work', 'worker', 'workers', 'wala', 'wale', 'need', 'near', 'me',
  'for', 'the', 'and', 'a', 'of', 'in', 'my', 'fix', 'fixing', 'job', 'काम', 'वाला', 'वाले', 'का', 'की', 'के',
  'चा', 'ची', 'चे', 'दुरुस्ती', 'रिपेयर',
]);

/** True when a and b differ by at most one inserted, deleted or changed letter. */
function closeEnough(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const tail = (x, y) => a.slice(x) === b.slice(y);
  return tail(i + 1, i + 1) || tail(i + 1, i) || tail(i, i + 1);
}

// Searchable text per worker, built once per worker object.
const searchIndex = new WeakMap();
function indexOf(worker) {
  let entry = searchIndex.get(worker);
  if (!entry) {
    const name = normalize(worker.name);
    const job = normalize(jobSearchText(worker.job));
    entry = { name, job, words: splitWords(`${name} ${job}`) };
    searchIndex.set(worker, entry);
  }
  return entry;
}

/**
 * How well a worker matches the query: 0 = no match, higher = better.
 * Every typed word must match the name or the kind of work. Small typos
 * ("plumbr", "electrcian") are allowed for words of 4+ letters.
 */
function matchScore(worker, query) {
  const terms = splitWords(query).filter((w) => !FILLER.has(w));
  if (terms.length === 0) return 1;
  const { name, job, words } = indexOf(worker);
  let score = 0;
  for (const term of terms) {
    if (name.startsWith(term) || name.includes(` ${term}`)) score += 4;
    else if (name.includes(term)) score += 3;
    else if (words.some((w) => w.startsWith(term)) || job.includes(term)) score += 2;
    else if (term.length >= 4 && words.some((w) => closeEnough(term, w.slice(0, term.length)) || closeEnough(term, w))) score += 1;
    else return 0;
  }
  return score;
}

/** Workers matching the current search, best first (ignores the category). */
function searchResults() {
  if (!state.query) return state.workers;
  return state.workers
    .map((w, i) => ({ w, i, score: matchScore(w, state.query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((r) => r.w);
}

function syncUrl() {
  const next = new URLSearchParams();
  if (state.job !== 'all') next.set('job', state.job);
  if (state.query) next.set('q', state.query);
  const qs = next.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ─── Static text ───

function applyTranslations() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  $('searchInput').placeholder = t('search');
  $('searchClear').setAttribute('aria-label', t('clearSearch'));
  $('langSelect').value = state.lang;
  renderCategories();
  renderWorkers();
}

// ─── Categories ───

function renderCategories() {
  if (state.jobs.length === 0) return; // keep the loading placeholders
  // Counts follow the search, so customers see which categories have matches
  const matches = searchResults();
  const counts = new Map([['all', matches.length]]);
  for (const w of matches) counts.set(w.job, (counts.get(w.job) || 0) + 1);
  $('categoryGrid').replaceChildren(...['all', ...state.jobs].map((job) => categoryTile(job, counts.get(job) || 0)));
}

function categoryTile(job, count) {
  const btn = el('button',
    'group flex min-w-0 flex-col items-center gap-2 rounded-2xl p-1 text-center outline-none ' +
    'focus-visible:ring-2 focus-visible:ring-brand-500');
  btn.type = 'button';
  btn.setAttribute('aria-pressed', String(state.job === job));

  const tile = el('span',
    'flex aspect-square w-full max-w-[76px] items-center justify-center rounded-2xl bg-neutral-100 text-[28px] ' +
    'transition group-hover:bg-neutral-200 group-active:scale-95 sm:text-3xl ' +
    'group-aria-pressed:bg-brand-50 group-aria-pressed:ring-2 group-aria-pressed:ring-brand-500',
    job === 'all' ? '✨' : jobIcon(job));
  tile.setAttribute('aria-hidden', 'true');

  const label = el('span',
    'w-full text-[11px] font-medium leading-tight text-neutral-700 xs:text-xs ' +
    'group-aria-pressed:font-semibold group-aria-pressed:text-brand-700',
    job === 'all' ? t('allJobs') : jobLabel(job, state.lang));

  btn.append(tile, label);
  if (state.loaded) {
    label.append(el('span', 'mt-0.5 block text-[10px] font-normal text-neutral-400 xs:text-[11px]', String(count)));
    if (count === 0 && state.job !== job) btn.classList.add('opacity-50');
  }
  btn.addEventListener('click', () => selectJob(job));
  return btn;
}

function selectJob(job) {
  state.job = job;
  if (job !== 'all') track('category', { value: job });
  syncUrl();
  renderCategories();
  renderWorkers();
  // On phones the list sits below the grid — bring it into view
  if (window.matchMedia('(max-width: 1023px)').matches) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('workersSection').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }
}

// ─── Worker list ───

function filteredWorkers() {
  return searchResults().filter((w) => state.job === 'all' || w.job === state.job);
}

function renderWorkers() {
  const jobTitle = state.job === 'all' ? '' : jobLabel(state.job, state.lang);
  $('workersTitle').textContent = state.query
    ? t('resultsFor', { q: state.query }) + (jobTitle ? ` · ${jobTitle}` : '')
    : jobTitle || t('workersTitle');
  $('clearFilter').hidden = state.job === 'all' && !state.query;
  $('searchClear').hidden = !$('searchInput').value;
  if (!state.loaded) return; // skeletons stay until data arrives

  const list = filteredWorkers();
  $('resultCount').textContent = list.length === 1 ? t('countOne') : `${list.length}${t('countMany')}`;
  $('emptyState').hidden = list.length > 0;
  // Nothing in this category, but the search finds workers in others
  $('searchAll').hidden = !(list.length === 0 && state.job !== 'all' && state.query && searchResults().length > 0);
  $('workersGrid').replaceChildren(...list.map(workerCard));
}

function workerCard(worker, index) {
  const card = el('article',
    'card flex animate-fade-up flex-col p-4 transition hover:shadow-xl hover:shadow-neutral-900/5 sm:p-5');
  card.style.animationDelay = `${Math.min(index, 10) * 35}ms`;

  // Left: name, job, badge — right: avatar with the "Show number" button overlapping it
  const top = el('div', 'flex gap-4');

  const info = el('div', 'min-w-0 flex-1');
  const job = el('p', 'mt-1 flex items-center gap-1.5 text-sm text-neutral-600');
  job.append(el('span', '', jobIcon(worker.job)), el('span', '', jobLabel(worker.job, state.lang)));
  const badge = el('p',
    'mt-3 inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700');
  badge.append(icon('check', 'h-3.5 w-3.5'), el('span', '', t('verified')));
  const exp = el('p', 'mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500');
  exp.append(el('span', '', '🛠️'), el('span', '', t('experience', { n: worker.experience ?? 5 })));
  info.append(el('h3', 'break-words text-base font-semibold leading-snug sm:text-lg', worker.name), job, exp, badge);

  const side = el('div', 'flex w-24 shrink-0 flex-col items-center');
  const avatar = el('div',
    'flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl text-xl font-bold tracking-wide text-white shadow-inner',
    initials(worker.name));
  avatar.style.background = avatarColor(worker.name);
  avatar.setAttribute('aria-hidden', 'true');
  if (worker.photo) {
    // Swap in the photo only once it loads — a broken or private Drive link keeps the initials
    const img = el('img', 'h-full w-full object-cover');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = worker.photo;
    img.addEventListener('load', () => avatar.replaceChildren(img));
  }

  const showBtn = el('button',
    'relative -mt-4 inline-flex h-9 min-w-[6.25rem] items-center justify-center whitespace-nowrap rounded-lg border ' +
    'border-neutral-200 bg-white px-3 text-xs font-semibold text-brand-600 shadow-md shadow-neutral-900/5 transition ' +
    'hover:border-brand-500 active:scale-95 disabled:cursor-wait',
    t('showNumber'));
  showBtn.type = 'button';
  showBtn.setAttribute('aria-label', `${t('showNumber')} — ${worker.name}`);
  side.append(avatar, showBtn);

  top.append(info, side);

  const actions = el('div', 'mt-4 border-t border-dashed border-neutral-200 pt-4');
  actions.hidden = true;
  card.append(top, actions);

  const known = state.revealed.get(worker.id);
  if (known) showActions(worker, known, showBtn, actions);
  else showBtn.addEventListener('click', () => revealNumber(worker, showBtn, actions));

  return card;
}

async function revealNumber(worker, btn, actions) {
  btn.disabled = true;
  btn.replaceChildren(spinner('border-brand-200 border-t-brand-600'));
  try {
    const res = await fetch(`/api/number?id=${encodeURIComponent(worker.id)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data[`error_${state.lang}`] || data.error || t('error'), 'error');
      throw new Error('handled');
    }
    state.revealed.set(worker.id, data);
    showActions(worker, data, btn, actions);
  } catch (err) {
    if (err.message !== 'handled') showToast(t('error'), 'error');
    btn.disabled = false;
    btn.textContent = t('showNumber');
  }
}

function showActions(worker, data, btn, actions) {
  btn.hidden = true;
  actions.hidden = false;

  const phone = el('p', 'mb-3 text-center text-lg font-semibold tracking-wide tabular-nums', formatPhone(data.phone));
  const row = el('div', `grid gap-2 ${data.whatsapp ? 'grid-cols-2' : 'grid-cols-1'}`);

  const call = el('a', 'btn btn-dark');
  call.href = `tel:+91${data.phone}`;
  call.append(icon('phone'), el('span', '', t('call')));
  call.addEventListener('click', () => track('call', { workerId: worker.id }));
  row.append(call);

  if (data.whatsapp) {
    // Always Marathi — workers are local, whatever language the customer browses in
    const text = 'नमस्कार 🙏\n\n'
      + 'मला तुमचा संपर्क *न्यू योगेश्वर इलेक्ट्रिक & नल फिटिंग* कडून मिळाला.\n'
      + `मला *${worker.job}* ची गरज आहे.\n\n`
      + 'तुम्ही उपलब्ध आहात का?';
    const wa = el('a', 'btn btn-wa');
    wa.href = `https://wa.me/91${data.phone}?text=${encodeURIComponent(text)}`;
    wa.target = '_blank';
    wa.rel = 'noopener noreferrer';
    wa.append(icon('chat'), el('span', '', t('whatsapp')));
    wa.addEventListener('click', () => track('whatsapp', { workerId: worker.id }));
    row.append(wa);
  }

  actions.replaceChildren(phone, row);
}

function showSkeletons() {
  const skeleton = () => {
    const card = el('div', 'card flex gap-4 p-4 sm:p-5');
    card.innerHTML =
      '<div class="flex-1 animate-pulse space-y-3">' +
        '<div class="h-4 w-2/3 rounded bg-neutral-200"></div>' +
        '<div class="h-3 w-1/3 rounded bg-neutral-200"></div>' +
        '<div class="h-6 w-1/2 rounded bg-neutral-100"></div>' +
      '</div>' +
      '<div class="h-20 w-20 animate-pulse rounded-2xl bg-neutral-200"></div>';
    return card;
  };
  $('workersGrid').replaceChildren(...Array.from({ length: 6 }, skeleton));
}

// ─── Data ───

async function loadWorkers() {
  let cached = null;
  try { cached = JSON.parse(store.get(CACHE_KEY)); } catch { /* ignore */ }

  if (Array.isArray(cached) && cached.length > 0) {
    state.workers = cached;
    state.loaded = true;
    renderWorkers();
  } else {
    showSkeletons();
  }

  try {
    const res = await fetch('/api/workers');
    if (!res.ok) throw new Error('failed');
    state.workers = await res.json();
    state.loaded = true;
    store.set(CACHE_KEY, JSON.stringify(state.workers));
    renderCategories();
    renderWorkers();
  } catch {
    if (!state.loaded) {
      $('workersGrid').replaceChildren();
      $('emptyState').hidden = false;
    }
    showToast(t('error'), 'error');
  }
}

async function loadJobs(workersReady) {
  try {
    const res = await fetch('/api/jobs');
    if (!res.ok) throw new Error('failed');
    state.jobs = await res.json();
  } catch {
    // Not critical: fall back to the jobs that workers actually have
    await workersReady;
    state.jobs = [...new Set(state.workers.map((w) => w.job))];
  }
  if (state.jobs.length === 0) $('categoryGrid').replaceChildren(categoryTile('all', state.workers.length));
  // A shared link may name a category that no longer exists
  if (state.job !== 'all' && !state.jobs.includes(state.job)) {
    state.job = 'all';
    syncUrl();
    renderWorkers();
  }
  renderCategories();
}

// ─── Events ───

$('langSelect').addEventListener('change', (e) => {
  state.lang = LANGS.includes(e.target.value) ? e.target.value : 'en';
  store.set(LANG_KEY, state.lang);
  applyTranslations();
});

function setQuery(text) {
  state.query = text.trim();
  syncUrl();
  renderCategories();
  renderWorkers();
}

let searchTimer = null;
$('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  $('searchClear').hidden = !e.target.value;
  searchTimer = setTimeout(() => setQuery(e.target.value), 200);
});

// Enter / "Search" on the phone keyboard: close the keyboard and jump to the results
$('searchInput').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  clearTimeout(searchTimer);
  setQuery(e.target.value);
  e.target.blur();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('workersSection').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
});

$('searchClear').addEventListener('click', () => {
  clearTimeout(searchTimer);
  $('searchInput').value = '';
  setQuery('');
  $('searchInput').focus();
});

$('clearFilter').addEventListener('click', () => {
  clearTimeout(searchTimer);
  $('searchInput').value = '';
  state.query = '';
  selectJob('all');
});

$('searchAll').addEventListener('click', () => selectJob('all'));

// ─── Init ───

$('searchInput').value = state.query;
applyTranslations();
loadJobs(loadWorkers());

// One visit per browser session
try {
  if (!sessionStorage.getItem(VISIT_KEY)) {
    sessionStorage.setItem(VISIT_KEY, '1');
    track('visit');
  }
} catch { /* storage blocked — skip */ }
