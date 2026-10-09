/**
 * admin.js — Admin dashboard logic
 *
 * Features:
 *  - Password login (checked server-side)
 *  - Add / Edit / Delete workers
 *  - Add / Delete job categories
 *  - Responsive table (desktop) + card list (mobile)
 *  - Edit modal and confirm-delete dialog
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════
  // 1. STATE
  // ═══════════════════════════════════════

  var password     = '';    // Stored in memory only (not localStorage)
  var allWorkers   = [];
  var allJobs      = [];
  var pendingDeleteId   = null;  // Worker ID queued for deletion
  var pendingDeleteJob  = null;  // Job name queued for deletion

  // ═══════════════════════════════════════
  // 2. DOM REFERENCES
  // ═══════════════════════════════════════

  function $(id) { return document.getElementById(id); }

  // Login
  var loginScreen    = $('loginScreen');
  var loginPassword  = $('loginPassword');
  var loginBtn       = $('loginBtn');
  var loginError     = $('loginError');
  var dashboard      = $('adminDashboard');

  // Tabs
  var tabWorkers     = $('tabWorkers');
  var tabJobs        = $('tabJobs');
  var panelWorkers   = $('panelWorkers');
  var panelJobs      = $('panelJobs');

  // Add worker form
  var workerName     = $('workerName');
  var workerExp      = $('workerExp');
  var workerJobs     = $('workerJobs');   // container of job tick-boxes
  var addWorkerBtn   = $('addWorkerBtn');

  // Workers table / mobile list
  var tableBody      = $('workersTableBody');
  var mobileList     = $('workersMobileList');

  // Add job
  var newJobName     = $('newJobName');
  var addJobBtn      = $('addJobBtn');
  var jobsList       = $('jobsList');

  // Edit modal
  var editModal      = $('editModal');
  var editId         = $('editId');
  var editName       = $('editName');
  var editExp        = $('editExp');
  var editJobs       = $('editJobs');     // container of job tick-boxes
  var editActive     = $('editActive');
  var editSaveBtn    = $('editSaveBtn');
  var editCancelBtn  = $('editCancelBtn');

  // Confirm modal
  var confirmModal     = $('confirmModal');
  var confirmText      = $('confirmText');
  var confirmDeleteBtn = $('confirmDeleteBtn');
  var confirmCancelBtn = $('confirmCancelBtn');

  // Other
  var logoutBtn = $('logoutBtn');
  var toastEl   = $('toast');

  // ═══════════════════════════════════════
  // 3. HELPERS
  // ═══════════════════════════════════════

  var toastTimer = null;
  function showToast(message, type) {
    clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = 'toast show' + (type ? ' toast-' + type : '');
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 4000);
  }

  /** Draw one tick-box per job inside `container`; tick the ones in `selected` */
  function renderJobChecks(container, selected) {
    container.innerHTML = '';
    allJobs.forEach(function (job) {
      var label = document.createElement('label');
      label.className = 'job-check';
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.value = job;
      box.checked = selected.indexOf(job) !== -1;
      var text = document.createElement('span');
      text.textContent = job;
      label.appendChild(box);
      label.appendChild(text);
      container.appendChild(label);
    });
  }

  /** Names of the ticked jobs inside `container` */
  function getCheckedJobs(container) {
    var boxes = container.querySelectorAll('input:checked');
    return Array.prototype.map.call(boxes, function (b) { return b.value; });
  }

  /** Experience must be a whole number 0-60 */
  function validExperience(text) {
    var n = Number(text);
    return text !== '' && Number.isInteger(n) && n >= 0 && n <= 60;
  }

  /** Make a POST to /api/admin with the password and action */
  function adminAPI(payload) {
    payload.password = password;
    return fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    });
  }

  // ═══════════════════════════════════════
  // 4. LOGIN
  // ═══════════════════════════════════════

  function doLogin() {
    var pwd = loginPassword.value.trim();
    if (!pwd) {
      loginError.textContent = 'Please enter the password.';
      loginError.classList.remove('hidden');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    password = pwd;
    adminAPI({ action: 'login' })
      .then(function (res) {
        if (res.ok) {
          loginScreen.classList.add('hidden');
          dashboard.classList.remove('hidden');
          loadDashboard();
        } else {
          password = '';
          loginError.textContent = res.data.error || 'Wrong password';
          loginError.classList.remove('hidden');
        }
      })
      .catch(function () {
        password = '';
        loginError.textContent = 'Network error. Please try again.';
        loginError.classList.remove('hidden');
      })
      .finally(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
      });
  }

  loginBtn.addEventListener('click', doLogin);
  loginPassword.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doLogin();
  });

  // ═══════════════════════════════════════
  // 5. LOGOUT
  // ═══════════════════════════════════════

  logoutBtn.addEventListener('click', function () {
    password = '';
    allWorkers = [];
    allJobs = [];
    dashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginPassword.value = '';
    loginError.classList.add('hidden');
  });

  // ═══════════════════════════════════════
  // 6. TABS
  // ═══════════════════════════════════════

  tabWorkers.addEventListener('click', function () {
    tabWorkers.classList.add('active');
    tabJobs.classList.remove('active');
    panelWorkers.classList.add('active');
    panelJobs.classList.remove('active');
  });

  tabJobs.addEventListener('click', function () {
    tabJobs.classList.add('active');
    tabWorkers.classList.remove('active');
    panelJobs.classList.add('active');
    panelWorkers.classList.remove('active');
  });

  // ═══════════════════════════════════════
  // 7. LOAD DASHBOARD DATA
  // ═══════════════════════════════════════

  function loadDashboard() {
    loadWorkers();
    loadJobs();
  }

  function loadWorkers() {
    adminAPI({ action: 'getWorkers' })
      .then(function (res) {
        if (res.ok) {
          allWorkers = res.data;
          renderWorkersTable();
        } else {
          showToast(res.data.error || 'Failed to load workers.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error loading workers.', 'error');
      });
  }

  function loadJobs() {
    adminAPI({ action: 'getJobs' })
      .then(function (res) {
        if (res.ok) {
          allJobs = res.data;
          renderJobsList();
          populateJobDropdowns();
        } else {
          showToast(res.data.error || 'Failed to load jobs.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error loading jobs.', 'error');
      });
  }

  // ═══════════════════════════════════════
  // 8. RENDER WORKERS TABLE + MOBILE CARDS
  // ═══════════════════════════════════════

  function renderWorkersTable() {
    // Desktop table
    tableBody.innerHTML = '';
    // Mobile cards
    mobileList.innerHTML = '';

    if (allWorkers.length === 0) {
      var emptyRow = document.createElement('tr');
      var emptyCell = document.createElement('td');
      emptyCell.setAttribute('colspan', '5');
      emptyCell.style.textAlign = 'center';
      emptyCell.style.padding = '24px';
      emptyCell.style.color = '#94a3b8';
      emptyCell.textContent = 'No workers yet. Add one above!';
      emptyRow.appendChild(emptyCell);
      tableBody.appendChild(emptyRow);
      return;
    }

    allWorkers.forEach(function (w) {
      // ── Desktop row ──
      var tr = document.createElement('tr');

      var tdName = document.createElement('td');
      tdName.textContent = w.name;
      tdName.style.fontWeight = '600';

      var tdExp = document.createElement('td');
      tdExp.textContent = w.experience + ' yrs';

      var tdJob = document.createElement('td');
      tdJob.textContent = w.jobs.join(', ');

      var tdStatus = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'status-badge ' + (w.active ? 'active' : 'inactive');
      badge.textContent = w.active ? 'Active' : 'Hidden';
      tdStatus.appendChild(badge);

      var tdActions = document.createElement('td');
      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'table-actions';

      var editBtn = document.createElement('button');
      editBtn.className = 'btn btn-small btn-outline';
      editBtn.textContent = '✏️ Edit';
      editBtn.addEventListener('click', function () { openEditModal(w); });

      var delBtn = document.createElement('button');
      delBtn.className = 'btn btn-small btn-danger';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', function () { openConfirmDelete(w.id, w.name); });

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(delBtn);
      tdActions.appendChild(actionsDiv);

      tr.appendChild(tdName);
      tr.appendChild(tdExp);
      tr.appendChild(tdJob);
      tr.appendChild(tdStatus);
      tr.appendChild(tdActions);
      tableBody.appendChild(tr);

      // ── Mobile card ──
      var card = document.createElement('div');
      card.className = 'mobile-worker-card';

      var fields = [
        ['Name', w.name],
        ['Experience', w.experience + ' yrs'],
        ['Jobs', w.jobs.join(', ')],
        ['Status', w.active ? 'Active' : 'Hidden'],
      ];

      fields.forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'card-field';
        var lbl = document.createElement('span');
        lbl.className = 'label';
        lbl.textContent = f[0];
        var val = document.createElement('span');
        val.textContent = f[1];
        if (f[0] === 'Name') val.style.fontWeight = '600';
        row.appendChild(lbl);
        row.appendChild(val);
        card.appendChild(row);
      });

      var cardActions = document.createElement('div');
      cardActions.className = 'card-actions';

      var mEditBtn = document.createElement('button');
      mEditBtn.className = 'btn btn-small btn-outline';
      mEditBtn.textContent = '✏️ Edit';
      mEditBtn.style.flex = '1';
      mEditBtn.addEventListener('click', function () { openEditModal(w); });

      var mDelBtn = document.createElement('button');
      mDelBtn.className = 'btn btn-small btn-danger';
      mDelBtn.textContent = '🗑️ Delete';
      mDelBtn.style.flex = '1';
      mDelBtn.addEventListener('click', function () { openConfirmDelete(w.id, w.name); });

      cardActions.appendChild(mEditBtn);
      cardActions.appendChild(mDelBtn);
      card.appendChild(cardActions);
      mobileList.appendChild(card);
    });
  }

  // ═══════════════════════════════════════
  // 9. RENDER JOBS LIST
  // ═══════════════════════════════════════

  function renderJobsList() {
    jobsList.innerHTML = '';
    if (allJobs.length === 0) {
      var li = document.createElement('li');
      li.className = 'job-item';
      li.textContent = 'No jobs yet.';
      li.style.color = '#94a3b8';
      jobsList.appendChild(li);
      return;
    }

    allJobs.forEach(function (job) {
      var li = document.createElement('li');
      li.className = 'job-item';

      var nameSpan = document.createElement('span');
      nameSpan.textContent = job;

      var delBtn = document.createElement('button');
      delBtn.className = 'btn btn-small btn-danger';
      delBtn.textContent = '🗑️';
      delBtn.addEventListener('click', function () { openConfirmDeleteJob(job); });

      li.appendChild(nameSpan);
      li.appendChild(delBtn);
      jobsList.appendChild(li);
    });
  }

  /** Refresh the job tick-boxes in the add form */
  function populateJobDropdowns() {
    renderJobChecks(workerJobs, getCheckedJobs(workerJobs));
  }

  // ═══════════════════════════════════════
  // 10. ADD WORKER
  // ═══════════════════════════════════════

  addWorkerBtn.addEventListener('click', function () {
    var name = workerName.value.trim();
    var exp  = workerExp.value.trim();
    var jobs = getCheckedJobs(workerJobs);

    // Validate
    if (!name) { showToast('Please enter worker name.', 'error'); workerName.focus(); return; }
    if (!validExperience(exp)) { showToast('Experience must be a whole number from 0 to 60.', 'error'); workerExp.focus(); return; }
    if (jobs.length === 0) { showToast('Tick at least one job category.', 'error'); return; }

    addWorkerBtn.disabled = true;
    addWorkerBtn.textContent = 'Adding...';

    adminAPI({ action: 'addWorker', name: name, experience: Number(exp), jobs: jobs })
      .then(function (res) {
        if (res.ok) {
          showToast('Worker added!', 'success');
          workerName.value = '';
          workerExp.value = '';
          renderJobChecks(workerJobs, []);
          loadWorkers();
        } else {
          showToast(res.data.error || 'Failed to add worker.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error.', 'error');
      })
      .finally(function () {
        addWorkerBtn.disabled = false;
        addWorkerBtn.textContent = '➕ Add Worker';
      });
  });

  // ═══════════════════════════════════════
  // 11. EDIT WORKER MODAL
  // ═══════════════════════════════════════

  function openEditModal(worker) {
    editId.value       = worker.id;
    editName.value     = worker.name;
    editExp.value      = worker.experience;
    editActive.checked = worker.active;
    renderJobChecks(editJobs, worker.jobs);

    editModal.classList.remove('hidden');
  }

  editCancelBtn.addEventListener('click', function () {
    editModal.classList.add('hidden');
  });

  // Close modal on overlay click
  editModal.addEventListener('click', function (e) {
    if (e.target === editModal) editModal.classList.add('hidden');
  });

  editSaveBtn.addEventListener('click', function () {
    var id    = editId.value;
    var name  = editName.value.trim();
    var exp   = editExp.value.trim();
    var jobs  = getCheckedJobs(editJobs);
    var active = editActive.checked;

    if (!name) { showToast('Name is required.', 'error'); return; }
    if (!validExperience(exp)) { showToast('Experience must be a whole number from 0 to 60.', 'error'); return; }
    if (jobs.length === 0) { showToast('Tick at least one job category.', 'error'); return; }

    editSaveBtn.disabled = true;
    editSaveBtn.textContent = 'Saving...';

    adminAPI({ action: 'updateWorker', id: id, name: name, experience: Number(exp), jobs: jobs, active: active })
      .then(function (res) {
        if (res.ok) {
          showToast('Worker updated!', 'success');
          editModal.classList.add('hidden');
          loadWorkers();
        } else {
          showToast(res.data.error || 'Failed to update.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error.', 'error');
      })
      .finally(function () {
        editSaveBtn.disabled = false;
        editSaveBtn.textContent = 'Save Changes';
      });
  });

  // ═══════════════════════════════════════
  // 12. DELETE WORKER (with confirmation)
  // ═══════════════════════════════════════

  function openConfirmDelete(id, name) {
    pendingDeleteId = id;
    pendingDeleteJob = null;
    confirmText.textContent = 'Are you sure you want to delete "' + name + '"? This cannot be undone.';
    confirmDeleteBtn.textContent = 'Delete';
    confirmModal.classList.remove('hidden');
  }

  function openConfirmDeleteJob(jobName) {
    pendingDeleteJob = jobName;
    pendingDeleteId = null;
    confirmText.textContent = 'Are you sure you want to delete the job "' + jobName + '"?';
    confirmDeleteBtn.textContent = 'Delete';
    confirmModal.classList.remove('hidden');
  }

  confirmCancelBtn.addEventListener('click', function () {
    confirmModal.classList.add('hidden');
    pendingDeleteId = null;
    pendingDeleteJob = null;
  });

  confirmModal.addEventListener('click', function (e) {
    if (e.target === confirmModal) {
      confirmModal.classList.add('hidden');
      pendingDeleteId = null;
      pendingDeleteJob = null;
    }
  });

  confirmDeleteBtn.addEventListener('click', function () {
    if (pendingDeleteId) {
      deleteWorker(pendingDeleteId);
    } else if (pendingDeleteJob) {
      deleteJob(pendingDeleteJob);
    }
  });

  function deleteWorker(id) {
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = 'Deleting...';

    adminAPI({ action: 'deleteWorker', id: id })
      .then(function (res) {
        if (res.ok) {
          showToast('Worker deleted.', 'success');
          confirmModal.classList.add('hidden');
          loadWorkers();
        } else {
          showToast(res.data.error || 'Failed to delete.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error.', 'error');
      })
      .finally(function () {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = 'Delete';
        pendingDeleteId = null;
      });
  }

  // ═══════════════════════════════════════
  // 13. ADD / DELETE JOB
  // ═══════════════════════════════════════

  addJobBtn.addEventListener('click', function () {
    var name = newJobName.value.trim();
    if (!name) { showToast('Enter a job name.', 'error'); newJobName.focus(); return; }

    addJobBtn.disabled = true;
    addJobBtn.textContent = '...';

    adminAPI({ action: 'addJob', jobName: name })
      .then(function (res) {
        if (res.ok) {
          showToast('Job added!', 'success');
          newJobName.value = '';
          loadJobs();
        } else {
          showToast(res.data.error || 'Failed to add job.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error.', 'error');
      })
      .finally(function () {
        addJobBtn.disabled = false;
        addJobBtn.textContent = 'Add';
      });
  });

  newJobName.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addJobBtn.click();
  });

  function deleteJob(jobName) {
    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.textContent = 'Deleting...';

    adminAPI({ action: 'deleteJob', jobName: jobName })
      .then(function (res) {
        if (res.ok) {
          showToast('Job deleted.', 'success');
          confirmModal.classList.add('hidden');
          loadJobs();
        } else {
          showToast(res.data.error || 'Failed to delete job.', 'error');
        }
      })
      .catch(function () {
        showToast('Network error.', 'error');
      })
      .finally(function () {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = 'Delete';
        pendingDeleteJob = null;
      });
  }

})();
