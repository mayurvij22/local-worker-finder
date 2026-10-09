/**
 * Admin dashboard — password login (checked server-side), add / edit /
 * delete workers, add / delete job categories, customer analytics.
 *
 * The password is kept in memory only, never in storage.
 */

import { $, el, icon, showToast, openModal, closeModal, wireModal } from '../shared/dom.js';

const state = {
  password: '',
  workers: [],
  jobs: [],
  pendingDelete: null,   // { kind: 'worker', id, name } | { kind: 'job', name }
  statsDays: 7,
};

/** POST to /api/admin with the password and an action. */
async function adminAPI(payload) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, password: state.password }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Run a request while a button shows a busy label; restores it afterwards. */
async function withBusy(btn, busyText, fn) {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyText;
  try {
    return await fn();
  } catch {
    showToast('Network error. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

const isPhone = (v) => /^\d{10}$/.test(v);
const isExperience = (v) => /^\d{1,2}$/.test(v) && Number(v) <= 60;

// ─── Photos (Google Drive share links — same rules as lib/sheets.js) ───

function drivePhotoSrc(link) {
  const m = String(link || '').trim().match(/^https:\/\/(?:drive|docs)\.google\.com\/.*?(?:\/d\/|[?&]id=)([\w-]{20,})/);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400` : '';
}
const isPhoto = (v) => !v || Boolean(drivePhotoSrc(v));

/** Show a live preview next to a photo-link input; returns a refresh function. */
function wirePhotoPreview(input, img) {
  const update = () => {
    const src = drivePhotoSrc(input.value);
    img.hidden = !src;
    if (src && img.src !== src) img.src = src;
  };
  img.addEventListener('error', () => { img.hidden = true; });
  input.addEventListener('input', update);
  return update;
}
const updateWorkerPreview = wirePhotoPreview($('workerPhoto'), $('workerPhotoPreview'));
const updateEditPreview = wirePhotoPreview($('editPhoto'), $('editPhotoPreview'));

/** Small round photo (initials until it loads, or if it fails) for the worker list. */
function thumb(w) {
  const box = el('span',
    'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100 text-xs font-bold text-neutral-500',
    w.name.split(' ').filter(Boolean).map((p) => p[0]).join('').slice(0, 2).toUpperCase());
  box.setAttribute('aria-hidden', 'true');
  if (w.photoSrc) {
    const img = el('img', 'h-full w-full object-cover');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = w.photoSrc;
    img.addEventListener('load', () => box.replaceChildren(img));
  }
  return box;
}

// ═══ Login / logout ═══

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const pwd = $('loginPassword').value.trim();
  const error = $('loginError');
  if (!pwd) {
    error.textContent = 'Please enter the password.';
    error.hidden = false;
    return;
  }

  state.password = pwd;
  withBusy($('loginBtn'), 'Logging in…', async () => {
    const res = await adminAPI({ action: 'login' });
    if (res.ok) {
      error.hidden = true;
      $('loginScreen').hidden = true;
      $('adminDashboard').hidden = false;
      loadWorkers();
      loadJobs();
    } else {
      state.password = '';
      error.textContent = res.data.error || 'Wrong password';
      error.hidden = false;
    }
  }).then(() => { if (!state.password) $('loginPassword').focus(); });
});

$('logoutBtn').addEventListener('click', () => {
  Object.assign(state, { password: '', workers: [], jobs: [], pendingDelete: null });
  $('adminDashboard').hidden = true;
  $('loginScreen').hidden = false;
  $('loginPassword').value = '';
  $('loginError').hidden = true;
});

// ═══ Tabs ═══

const TABS = { workers: ['tabWorkers', 'panelWorkers'], jobs: ['tabJobs', 'panelJobs'], stats: ['tabStats', 'panelStats'] };

function selectTab(name) {
  for (const [key, [tab, panel]] of Object.entries(TABS)) {
    $(tab).setAttribute('aria-selected', String(key === name));
    $(panel).hidden = key !== name;
  }
  if (name === 'stats') loadStats();
}

for (const key of Object.keys(TABS)) {
  $(TABS[key][0]).addEventListener('click', () => selectTab(key));
}

// ═══ Load data ═══

async function loadWorkers() {
  try {
    const res = await adminAPI({ action: 'getWorkers' });
    if (!res.ok) return showToast(res.data.error || 'Failed to load workers.', 'error');
    state.workers = res.data;
    renderWorkers();
  } catch {
    showToast('Network error loading workers.', 'error');
  }
}

async function loadJobs() {
  try {
    const res = await adminAPI({ action: 'getJobs' });
    if (!res.ok) return showToast(res.data.error || 'Failed to load jobs.', 'error');
    state.jobs = res.data;
    renderJobs();
    fillJobSelect($('workerJob'), '', 'Select job…');
  } catch {
    showToast('Network error loading jobs.', 'error');
  }
}

function renderStats() {
  $('statTotal').textContent = state.workers.length;
  $('statActive').textContent = state.workers.filter((w) => w.active).length;
  $('statJobs').textContent = state.jobs.length;
}

// ═══ Workers: table (tablet+) and cards (phone) ═══

function statusBadge(active) {
  return el('span',
    `inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`,
    active ? 'Active' : 'Hidden');
}

function actionButtons(w, stretch) {
  const edit = el('button', `btn btn-outline btn-sm ${stretch ? 'flex-1' : ''}`);
  edit.type = 'button';
  edit.append(icon('edit', 'h-3.5 w-3.5'), el('span', '', 'Edit'));
  edit.addEventListener('click', () => openEdit(w));

  const del = el('button', `btn btn-sm border border-red-200 bg-white text-red-600 hover:bg-red-50 ${stretch ? 'flex-1' : ''}`);
  del.type = 'button';
  del.setAttribute('aria-label', `Delete ${w.name}`);
  del.append(icon('trash', 'h-3.5 w-3.5'));
  if (stretch) del.append(el('span', '', 'Delete'));
  del.addEventListener('click', () => confirmDelete({ kind: 'worker', id: w.id, name: w.name }));

  return [edit, del];
}

function renderWorkers() {
  renderStats();
  const body = $('workersTableBody');
  const cards = $('workersMobileList');

  if (state.workers.length === 0) {
    const row = el('tr');
    const cell = el('td', 'px-4 py-10 text-center text-neutral-400', 'No workers yet. Add one!');
    cell.colSpan = 6;
    row.append(cell);
    body.replaceChildren(row);
    cards.replaceChildren(el('p', 'card px-4 py-10 text-center text-sm text-neutral-400', 'No workers yet. Add one!'));
    return;
  }

  body.replaceChildren(...state.workers.map((w) => {
    const tr = el('tr', 'transition hover:bg-neutral-50');
    const name = el('td', 'px-4 py-3 font-semibold');
    const who = el('div', 'flex items-center gap-3');
    who.append(thumb(w), el('span', '', w.name));
    name.append(who);
    if (w.whatsapp) who.append(el('span', 'ml-2 rounded bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E]', 'WA'));
    const status = el('td', 'px-4 py-3');
    status.append(statusBadge(w.active));
    const actions = el('td', 'px-4 py-3');
    const wrap = el('div', 'flex justify-end gap-2');
    wrap.append(...actionButtons(w, false));
    actions.append(wrap);
    tr.append(
      name,
      el('td', 'px-4 py-3 tabular-nums text-neutral-600', w.phone),
      el('td', 'px-4 py-3 text-neutral-600', w.job),
      el('td', 'whitespace-nowrap px-4 py-3 text-neutral-600', `${w.experience}+ yrs`),
      status, actions,
    );
    return tr;
  }));

  cards.replaceChildren(...state.workers.map((w) => {
    const card = el('div', 'card p-4');
    const head = el('div', 'flex items-start gap-3');
    const who = el('div', 'min-w-0 flex-1');
    who.append(
      el('p', 'break-words font-semibold', w.name),
      el('p', 'mt-0.5 text-sm text-neutral-500', `${w.job} · ${w.experience}+ yrs · ${w.phone}${w.whatsapp ? ' · WhatsApp' : ''}`),
    );
    head.append(thumb(w), who, statusBadge(w.active));
    const row = el('div', 'mt-4 flex gap-2 border-t border-neutral-100 pt-3');
    row.append(...actionButtons(w, true));
    card.append(head, row);
    return card;
  }));
}

// ═══ Jobs ═══

function renderJobs() {
  renderStats();
  const list = $('jobsList');
  if (state.jobs.length === 0) {
    list.replaceChildren(el('li', 'py-6 text-center text-sm text-neutral-400', 'No jobs yet.'));
    return;
  }
  list.replaceChildren(...state.jobs.map((job) => {
    const li = el('li', 'flex items-center justify-between gap-3 py-3');
    const del = el('button', 'btn btn-sm border border-red-200 bg-white text-red-600 hover:bg-red-50');
    del.type = 'button';
    del.setAttribute('aria-label', `Delete ${job}`);
    del.append(icon('trash', 'h-3.5 w-3.5'));
    del.addEventListener('click', () => confirmDelete({ kind: 'job', name: job }));
    li.append(el('span', 'min-w-0 break-words font-medium', job), del);
    return li;
  }));
}

function fillJobSelect(select, selected, placeholder) {
  const options = state.jobs.map((job) => {
    const opt = el('option', '', job);
    opt.value = job;
    opt.selected = job === selected;
    return opt;
  });
  if (placeholder) {
    const first = el('option', '', placeholder);
    first.value = '';
    options.unshift(first);
  }
  select.replaceChildren(...options);
}

// ═══ Add worker ═══

$('addWorkerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('workerName').value.trim();
  const phone = $('workerPhone').value.trim();
  const job = $('workerJob').value;
  const experience = $('workerExperience').value.trim() || '5';
  const photo = $('workerPhoto').value.trim();

  if (!name) { showToast('Please enter worker name.', 'error'); return $('workerName').focus(); }
  if (!isPhone(phone)) { showToast('Phone must be exactly 10 digits.', 'error'); return $('workerPhone').focus(); }
  if (!isExperience(experience)) { showToast('Experience must be 0–60 years.', 'error'); return $('workerExperience').focus(); }
  if (!job) { showToast('Please select a job category.', 'error'); return $('workerJob').focus(); }
  if (!isPhoto(photo)) { showToast('Photo must be a Google Drive link.', 'error'); return $('workerPhoto').focus(); }

  withBusy($('addWorkerBtn'), 'Adding…', async () => {
    const res = await adminAPI({
      action: 'addWorker', name, phone, job, photo, experience: Number(experience), whatsapp: $('workerWhatsApp').checked,
    });
    if (!res.ok) return showToast(res.data.error || 'Failed to add worker.', 'error');
    showToast('Worker added!', 'success');
    e.target.reset();
    updateWorkerPreview();
    loadWorkers();
  });
});

// ═══ Edit worker ═══

const closeEdit = wireModal($('editModal'));
$('editCancelBtn').addEventListener('click', closeEdit);

function openEdit(w) {
  $('editId').value = w.id;
  $('editName').value = w.name;
  $('editPhone').value = w.phone;
  $('editExperience').value = w.experience;
  $('editActive').checked = w.active;
  $('editWhatsApp').checked = w.whatsapp;
  $('editPhoto').value = w.photo || '';
  updateEditPreview();
  fillJobSelect($('editJob'), w.job);
  openModal($('editModal'));
  $('editName').focus();
}

$('editForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('editName').value.trim();
  const phone = $('editPhone').value.trim();
  const job = $('editJob').value;
  const experience = $('editExperience').value.trim() || '5';
  const photo = $('editPhoto').value.trim();

  if (!name) return showToast('Name is required.', 'error');
  if (!isPhone(phone)) return showToast('Phone must be 10 digits.', 'error');
  if (!isExperience(experience)) return showToast('Experience must be 0–60 years.', 'error');
  if (!job) return showToast('Job is required.', 'error');
  if (!isPhoto(photo)) return showToast('Photo must be a Google Drive link.', 'error');

  withBusy($('editSaveBtn'), 'Saving…', async () => {
    const res = await adminAPI({
      action: 'updateWorker', id: $('editId').value, name, phone, job, photo, experience: Number(experience),
      active: $('editActive').checked, whatsapp: $('editWhatsApp').checked,
    });
    if (!res.ok) return showToast(res.data.error || 'Failed to update.', 'error');
    showToast('Worker updated!', 'success');
    closeModal($('editModal'));
    loadWorkers();
  });
});

// ═══ Delete (worker or job) with confirmation ═══

const closeConfirm = wireModal($('confirmModal'), () => { state.pendingDelete = null; });
$('confirmCancelBtn').addEventListener('click', closeConfirm);

function confirmDelete(target) {
  state.pendingDelete = target;
  $('confirmText').textContent = target.kind === 'worker'
    ? `Are you sure you want to delete "${target.name}"? This cannot be undone.`
    : `Are you sure you want to delete the job "${target.name}"?`;
  openModal($('confirmModal'));
}

$('confirmDeleteBtn').addEventListener('click', () => {
  const target = state.pendingDelete;
  if (!target) return;

  withBusy($('confirmDeleteBtn'), 'Deleting…', async () => {
    const payload = target.kind === 'worker'
      ? { action: 'deleteWorker', id: target.id }
      : { action: 'deleteJob', jobName: target.name };
    const res = await adminAPI(payload);
    if (!res.ok) return showToast(res.data.error || 'Failed to delete.', 'error');
    showToast(target.kind === 'worker' ? 'Worker deleted.' : 'Job deleted.', 'success');
    closeConfirm();
    if (target.kind === 'worker') loadWorkers(); else loadJobs();
  });
});

// ═══ Add job ═══

$('addJobForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('newJobName').value.trim();
  if (!name) { showToast('Enter a job name.', 'error'); return $('newJobName').focus(); }

  withBusy($('addJobBtn'), '…', async () => {
    const res = await adminAPI({ action: 'addJob', jobName: name });
    if (!res.ok) return showToast(res.data.error || 'Failed to add job.', 'error');
    showToast('Job added!', 'success');
    $('newJobName').value = '';
    loadJobs();
  });
});

// ═══ Analytics ═══

let statsRequest = 0; // ignore slow responses for an older range

async function loadStats() {
  const ticket = ++statsRequest;
  $('dailyChart').classList.add('animate-pulse', 'opacity-60');
  try {
    const res = await adminAPI({ action: 'getStats', days: state.statsDays });
    if (ticket !== statsRequest) return;
    if (!res.ok) return showToast(res.data.error || 'Failed to load analytics.', 'error');
    renderAnalytics(res.data);
  } catch {
    showToast('Network error loading analytics.', 'error');
  } finally {
    if (ticket === statsRequest) $('dailyChart').classList.remove('animate-pulse', 'opacity-60');
  }
}

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

function renderAnalytics({ days, totals, workers, categories }) {
  $('kpiVisits').textContent = totals.visit;
  $('kpiReveals').textContent = totals.reveal;
  $('kpiCalls').textContent = totals.call;
  $('kpiWhatsApp').textContent = totals.whatsapp;

  // Daily bars: visits (purple), with the share that led to a number shown (green) at the bottom
  const max = Math.max(1, ...days.map((d) => Math.max(d.visits, d.reveals)));
  $('dailyChart').replaceChildren(...days.map((d) => {
    const col = el('div', 'group relative flex h-full flex-1 items-end');
    col.title = `${shortDate(d.date)}: ${d.visits} visits, ${d.reveals} numbers shown`;
    const top = Math.max(d.visits, d.reveals);
    const bar = el('div', 'relative w-full overflow-hidden rounded-t bg-brand-500/80 transition group-hover:bg-brand-500');
    bar.style.height = `${(top / max) * 100}%`;
    bar.style.minHeight = top ? '3px' : '0';
    const reveals = el('div', 'absolute inset-x-0 bottom-0 bg-emerald-500');
    reveals.style.height = top ? `${(d.reveals / top) * 100}%` : '0';
    bar.append(reveals);
    col.append(bar);
    return col;
  }));
  const mid = days[Math.floor(days.length / 2)];
  $('dailyLabels').replaceChildren(
    ...[days[0], mid, days[days.length - 1]].map((d) => el('span', '', shortDate(d.date))));

  // Top workers
  $('topWorkers').replaceChildren(...(workers.length ? workers.map((w) => {
    const tr = el('tr');
    tr.append(
      el('td', 'max-w-[10rem] truncate py-2.5 pr-2 font-medium', w.name),
      el('td', 'px-2 py-2.5 text-right font-semibold tabular-nums text-brand-600', String(w.reveal)),
      el('td', 'px-2 py-2.5 text-right tabular-nums', String(w.call)),
      el('td', 'py-2.5 pl-2 text-right tabular-nums text-emerald-600', String(w.whatsapp)),
    );
    return tr;
  }) : [emptyRow('No worker activity yet.')]));

  // Popular categories
  const most = Math.max(1, ...categories.map((c) => c.count));
  $('topCategories').replaceChildren(...(categories.length ? categories.map((c) => {
    const li = el('li');
    const head = el('div', 'flex items-center justify-between text-sm');
    head.append(el('span', 'font-medium', c.name), el('span', 'tabular-nums text-neutral-500', String(c.count)));
    const rail = el('div', 'mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100');
    const fill = el('div', 'h-full rounded-full bg-brand-500');
    fill.style.width = `${(c.count / most) * 100}%`;
    rail.append(fill);
    li.append(head, rail);
    return li;
  }) : [el('li', 'py-4 text-center text-sm text-neutral-400', 'No category taps yet.')]));
}

function emptyRow(text) {
  const tr = el('tr');
  const td = el('td', 'py-6 text-center text-sm text-neutral-400', text);
  td.colSpan = 4;
  tr.append(td);
  return tr;
}

$('statsRange').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-days]');
  if (!btn) return;
  state.statsDays = Number(btn.dataset.days);
  for (const b of $('statsRange').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b === btn));
  }
  loadStats();
});
