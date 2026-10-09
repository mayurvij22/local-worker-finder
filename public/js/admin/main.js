/**
 * Admin dashboard — password login (checked server-side), add / edit /
 * delete workers, add / delete job categories.
 *
 * The password is kept in memory only, never in storage.
 */

import { $, el, icon, showToast, openModal, closeModal, wireModal } from '../shared/dom.js';

const state = {
  password: '',
  workers: [],
  jobs: [],
  pendingDelete: null,   // { kind: 'worker', id, name } | { kind: 'job', name }
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

function selectTab(name) {
  const workers = name === 'workers';
  $('tabWorkers').setAttribute('aria-selected', String(workers));
  $('tabJobs').setAttribute('aria-selected', String(!workers));
  $('panelWorkers').hidden = !workers;
  $('panelJobs').hidden = workers;
}

$('tabWorkers').addEventListener('click', () => selectTab('workers'));
$('tabJobs').addEventListener('click', () => selectTab('jobs'));

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
    cell.colSpan = 5;
    row.append(cell);
    body.replaceChildren(row);
    cards.replaceChildren(el('p', 'card px-4 py-10 text-center text-sm text-neutral-400', 'No workers yet. Add one!'));
    return;
  }

  body.replaceChildren(...state.workers.map((w) => {
    const tr = el('tr', 'transition hover:bg-neutral-50');
    const name = el('td', 'px-4 py-3 font-semibold');
    name.append(el('span', '', w.name));
    if (w.whatsapp) name.append(el('span', 'ml-2 rounded bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#128C7E]', 'WA'));
    const status = el('td', 'px-4 py-3');
    status.append(statusBadge(w.active));
    const actions = el('td', 'px-4 py-3');
    const wrap = el('div', 'flex justify-end gap-2');
    wrap.append(...actionButtons(w, false));
    actions.append(wrap);
    tr.append(name, el('td', 'px-4 py-3 tabular-nums text-neutral-600', w.phone), el('td', 'px-4 py-3 text-neutral-600', w.job), status, actions);
    return tr;
  }));

  cards.replaceChildren(...state.workers.map((w) => {
    const card = el('div', 'card p-4');
    const head = el('div', 'flex items-start justify-between gap-3');
    const who = el('div', 'min-w-0');
    who.append(
      el('p', 'break-words font-semibold', w.name),
      el('p', 'mt-0.5 text-sm text-neutral-500', `${w.job} · ${w.phone}${w.whatsapp ? ' · WhatsApp' : ''}`),
    );
    head.append(who, statusBadge(w.active));
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

  if (!name) { showToast('Please enter worker name.', 'error'); return $('workerName').focus(); }
  if (!isPhone(phone)) { showToast('Phone must be exactly 10 digits.', 'error'); return $('workerPhone').focus(); }
  if (!job) { showToast('Please select a job category.', 'error'); return $('workerJob').focus(); }

  withBusy($('addWorkerBtn'), 'Adding…', async () => {
    const res = await adminAPI({ action: 'addWorker', name, phone, job, whatsapp: $('workerWhatsApp').checked });
    if (!res.ok) return showToast(res.data.error || 'Failed to add worker.', 'error');
    showToast('Worker added!', 'success');
    e.target.reset();
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
  $('editActive').checked = w.active;
  $('editWhatsApp').checked = w.whatsapp;
  fillJobSelect($('editJob'), w.job);
  openModal($('editModal'));
  $('editName').focus();
}

$('editForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('editName').value.trim();
  const phone = $('editPhone').value.trim();
  const job = $('editJob').value;

  if (!name) return showToast('Name is required.', 'error');
  if (!isPhone(phone)) return showToast('Phone must be 10 digits.', 'error');
  if (!job) return showToast('Job is required.', 'error');

  withBusy($('editSaveBtn'), 'Saving…', async () => {
    const res = await adminAPI({
      action: 'updateWorker', id: $('editId').value, name, phone, job,
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
