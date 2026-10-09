/**
 * app.js — Customer-facing page logic
 *
 * Features:
 *  - English / Hindi toggle
 *  - Job filter buttons + name search
 *  - Skeleton loading cards
 *  - Worker cards (name, experience, skills) with a "Book Now" button
 *  - Booking form overlay → POST /api/booking → WhatsApp link to the shop
 *  - Browser cache (localStorage) for the worker list
 *  - Background refresh of worker list
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════
  // 1. TRANSLATIONS
  // ═══════════════════════════════════════

  var T = {
    en: {
      shopName:    'New Yogeshwar Electric & Nal Fitting',
      tagline:     'Find trusted local workers',
      search:      'Search by name...',
      allJobs:     'All',
      bookNow:     'Book Now',
      expOne:      '1 year experience',
      expMany:     ' years experience',
      expNew:      'New worker',
      noWorkers:   'No workers found',
      heroTitle:   'Need a skilled worker?',
      heroText:    'Electricians, plumbers, painters & more — book in under a minute.',
      bookTitle:   'Book a worker',
      bookWith:    'Worker: ',
      lblName:     'Your name',
      lblPhone:    'Phone (10 digits)',
      lblAddress:  'Address',
      lblJob:      'Job',
      submit:      'Submit',
      sending:     'Sending...',
      cancel:      'Cancel',
      close:       'Close',
      errName:     'Please enter your name.',
      errPhone:    'Phone number must be exactly 10 digits.',
      errAddress:  'Please enter your address.',
      errJob:      'Please choose a job.',
      doneTitle:   'Booking received!',
      doneText:    'Your booking is saved. Tap the button below and press Send in WhatsApp so the shop gets your details.',
      doneWa:      'Send on WhatsApp',
      countOne:    '1 worker available',
      countMany:   ' workers available',
      address:     'Sane Nagar, Amalner, Maharashtra 425401',
      devBy:       'Site developed by Mayuur, Bangalore',
      loading:     'Loading...',
      error:       'Something went wrong. Please try again.',
    },
    hi: {
      shopName:    'न्यू योगेश्वर इलेक्ट्रिक & नल फिटिंग',
      tagline:     'विश्वसनीय स्थानीय कारीगर खोजें',
      search:      'नाम से खोजें...',
      allJobs:     'सभी',
      bookNow:     'अभी बुक करें',
      expOne:      '1 वर्ष का अनुभव',
      expMany:     ' वर्ष का अनुभव',
      expNew:      'नया कारीगर',
      noWorkers:   'कोई कारीगर नहीं मिला',
      heroTitle:   'कुशल कारीगर चाहिए?',
      heroText:    'इलेक्ट्रीशियन, प्लंबर, पेंटर और बहुत कुछ — एक मिनट में बुक करें।',
      bookTitle:   'कारीगर बुक करें',
      bookWith:    'कारीगर: ',
      lblName:     'आपका नाम',
      lblPhone:    'फ़ोन नंबर (10 अंक)',
      lblAddress:  'पता',
      lblJob:      'काम',
      submit:      'जमा करें',
      sending:     'भेज रहे हैं...',
      cancel:      'रद्द करें',
      close:       'बंद करें',
      errName:     'कृपया अपना नाम लिखें।',
      errPhone:    'फ़ोन नंबर ठीक 10 अंकों का होना चाहिए।',
      errAddress:  'कृपया अपना पता लिखें।',
      errJob:      'कृपया काम चुनें।',
      doneTitle:   'बुकिंग मिल गई!',
      doneText:    'आपकी बुकिंग सेव हो गई है। नीचे बटन दबाएं और व्हाट्सएप में Send दबाएं ताकि दुकान को आपकी जानकारी मिल जाए।',
      doneWa:      'व्हाट्सएप पर भेजें',
      countOne:    '1 कारीगर उपलब्ध',
      countMany:   ' कारीगर उपलब्ध',
      address:     'सानेनगर, अमळनेर, महाराष्ट्र 425401',
      devBy:       'साइट डेवलपर: मयूर, बेंगलुरु',
      loading:     'लोड हो रहा है...',
      error:       'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
    },
  };

  // Common job name translations (Hindi)
  var JOB_HI = {
    'Electrician':    'इलेक्ट्रीशियन',
    'Plumber':        'प्लंबर',
    'AC Technician':  'AC टेक्नीशियन',
    'Painter':        'पेंटर',
    'Carpenter':      'कारपेंटर',
  };

  // ═══════════════════════════════════════
  // 2. STATE
  // ═══════════════════════════════════════

  var CACHE_KEY = 'yws_workers_v2';   // v2: workers now have experience + jobs[]
  var LANG_KEY  = 'yws_lang';

  var currentLang  = localStorage.getItem(LANG_KEY) || 'en';
  var currentJob   = 'all';
  var searchQuery  = '';
  var workers      = [];
  var jobs         = [];

  // ═══════════════════════════════════════
  // 3. DOM REFERENCES
  // ═══════════════════════════════════════

  function $(id) { return document.getElementById(id); }

  var shopNameEl   = $('shopName');
  var taglineEl    = $('tagline');
  var langToggle   = $('langToggle');
  var searchInput  = $('searchInput');
  var jobFiltersEl = $('jobFilters');
  var btnAll       = $('btnAll');
  var workersGrid  = $('workersGrid');
  var emptyState   = $('emptyState');
  var emptyText    = $('emptyText');
  var toastEl      = $('toast');

  // Booking overlay
  var bookModal    = $('bookModal');
  var bookForm     = $('bookForm');
  var bookWorkerEl = $('bookWorker');
  var custName     = $('custName');
  var custPhone    = $('custPhone');
  var custAddress  = $('custAddress');
  var custJob      = $('custJob');
  var formError    = $('formError');
  var bookSubmit   = $('bookSubmit');
  var bookDone     = $('bookDone');
  var bookingWorker = null;   // the worker currently being booked

  // ═══════════════════════════════════════
  // 4. HELPERS
  // ═══════════════════════════════════════

  /** Get translation for current language */
  function t(key) {
    return T[currentLang][key] || T['en'][key] || key;
  }

  /** Translate a job name to Hindi if applicable */
  function jobLabel(name) {
    if (currentLang === 'hi' && JOB_HI[name]) return JOB_HI[name];
    return name;
  }

  /** "5 years experience" / "5 वर्ष का अनुभव" */
  function experienceLabel(years) {
    if (!years) return t('expNew');
    return years === 1 ? t('expOne') : years + t('expMany');
  }

  /** Get initials from a name, e.g. "Ramesh Singh" → "RS" */
  function getInitials(name) {
    return name
      .split(' ')
      .filter(Boolean)
      .map(function (w) { return w[0]; })
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  /** Pick a consistent color for a worker's avatar based on their name */
  var AVATAR_COLORS = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6',
    '#a855f7', '#ec4899', '#e11d48', '#0891b2',
  ];

  function avatarColor(name) {
    var hash = 0;
    for (var i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  // ═══════════════════════════════════════
  // 5. TOAST NOTIFICATIONS
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

  // ═══════════════════════════════════════
  // 6. SKELETON LOADING
  // ═══════════════════════════════════════

  function showSkeletons() {
    workersGrid.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var card = document.createElement('div');
      card.className = 'skeleton-card';
      card.innerHTML =
        '<div class="skeleton-row">' +
          '<div class="skeleton-avatar"></div>' +
          '<div style="flex:1">' +
            '<div class="skeleton-text name"></div>' +
            '<div class="skeleton-text job"></div>' +
          '</div>' +
        '</div>' +
        '<div class="skeleton-btn"></div>';
      workersGrid.appendChild(card);
    }
  }

  // ═══════════════════════════════════════
  // 7. UI UPDATE FUNCTIONS
  // ═══════════════════════════════════════

  /** Update all translatable text on the page */
  function updateTranslations() {
    shopNameEl.textContent  = t('shopName');
    taglineEl.textContent   = t('tagline');
    searchInput.placeholder = t('search');
    btnAll.textContent      = t('allJobs');
    emptyText.textContent   = t('noWorkers');
    $('heroTitle').textContent = t('heroTitle');
    $('shopAddress').textContent = t('address');
    $('footerShop').textContent  = t('shopName');
    $('footerAddr').textContent  = t('address');
    $('footerDev').textContent   = t('devBy');
    $('devBar').textContent      = t('devBy');
    $('heroText').textContent  = t('heroText');
    langToggle.textContent  = currentLang === 'en' ? 'हिं' : 'EN';

    // Booking overlay text
    $('bookTitle').textContent  = t('bookTitle');
    $('lblName').textContent    = t('lblName');
    $('lblPhone').textContent   = t('lblPhone');
    $('lblAddress').textContent = t('lblAddress');
    $('lblJob').textContent     = t('lblJob');
    $('bookCancel').textContent = t('cancel');
    bookSubmit.textContent      = t('submit');
    $('doneTitle').textContent  = t('doneTitle');
    $('doneText').textContent   = t('doneText');
    $('doneWhatsApp').textContent = '💬 ' + t('doneWa');
    $('doneClose').textContent  = t('close');
    if (bookingWorker) {
      bookWorkerEl.textContent = t('bookWith') + bookingWorker.name;
      fillJobOptions(bookingWorker, custJob.value);
    }

    // Re-render job buttons with translated labels
    renderJobButtons();
    // Re-render worker cards (button labels change)
    renderWorkers();
  }

  /** Render the job filter buttons */
  function renderJobButtons() {
    // Remove all buttons except "All"
    while (jobFiltersEl.children.length > 1) {
      jobFiltersEl.removeChild(jobFiltersEl.lastChild);
    }
    // Update "All" button state
    btnAll.classList.toggle('active', currentJob === 'all');

    jobs.forEach(function (job) {
      var btn = document.createElement('button');
      btn.className = 'job-btn' + (currentJob === job ? ' active' : '');
      btn.dataset.job = job;
      btn.textContent = jobLabel(job);
      btn.addEventListener('click', function () { selectJob(job); });
      jobFiltersEl.appendChild(btn);
    });
  }

  /** Handle clicking a job filter */
  function selectJob(job) {
    currentJob = job;
    // Update button styles
    var buttons = jobFiltersEl.querySelectorAll('.job-btn');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].dataset.job === job);
    }
    renderWorkers();
  }

  /** Render worker cards based on current filters */
  function renderWorkers() {
    var filtered = workers.filter(function (w) {
      var matchJob = currentJob === 'all' || w.jobs.indexOf(currentJob) !== -1;
      var matchSearch = !searchQuery ||
        w.name.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1;
      return matchJob && matchSearch;
    });

    workersGrid.innerHTML = '';
    var countEl = $('resultCount');

    if (filtered.length === 0) {
      countEl.classList.add('hidden');
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    countEl.textContent = filtered.length === 1 ? t('countOne') : filtered.length + t('countMany');
    countEl.classList.remove('hidden');

    filtered.forEach(function (worker, index) {
      var card = createWorkerCard(worker, index);
      workersGrid.appendChild(card);
    });
  }

  // ═══════════════════════════════════════
  // 8. WORKER CARD CREATION
  // ═══════════════════════════════════════

  function createWorkerCard(worker, index) {
    // Card container
    var card = document.createElement('div');
    card.className = 'worker-card';
    card.style.animationDelay = (index * 40) + 'ms';

    // — Worker info row —
    var infoDiv = document.createElement('div');
    infoDiv.className = 'worker-info';

    // Avatar
    var avatar = document.createElement('div');
    avatar.className = 'worker-avatar';
    avatar.style.background = avatarColor(worker.name);
    avatar.textContent = getInitials(worker.name);

    // Text column: name + experience
    var textDiv = document.createElement('div');

    var nameEl = document.createElement('h3');
    nameEl.className = 'worker-name';
    nameEl.textContent = worker.name;           // textContent = safe

    var expEl = document.createElement('p');
    expEl.className = 'worker-exp';
    expEl.textContent = '🛠️ ' + experienceLabel(worker.experience);

    textDiv.appendChild(nameEl);
    textDiv.appendChild(expEl);
    infoDiv.appendChild(avatar);
    infoDiv.appendChild(textDiv);
    card.appendChild(infoDiv);

    // — Skill chips —
    var skillsDiv = document.createElement('div');
    skillsDiv.className = 'worker-skills';
    worker.jobs.forEach(function (job) {
      var chip = document.createElement('span');
      chip.className = 'worker-job';
      chip.textContent = jobLabel(job);          // textContent = safe
      skillsDiv.appendChild(chip);
    });
    card.appendChild(skillsDiv);

    // — Book Now button —
    var bookBtn = document.createElement('button');
    bookBtn.className = 'book-btn';
    bookBtn.textContent = '📅 ' + t('bookNow');
    bookBtn.addEventListener('click', function () { openBooking(worker); });
    card.appendChild(bookBtn);

    return card;
  }

  // ═══════════════════════════════════════
  // 9. BOOKING FORM
  // ═══════════════════════════════════════

  /**
   * Fill the job dropdown. The worker's own skills come first; the
   * pre-selected job is the one being filtered, else the worker's first skill.
   */
  function fillJobOptions(worker, selected) {
    var names = worker.jobs.slice();
    jobs.forEach(function (j) { if (names.indexOf(j) === -1) names.push(j); });

    if (!selected || names.indexOf(selected) === -1) {
      selected = (currentJob !== 'all' && worker.jobs.indexOf(currentJob) !== -1)
        ? currentJob
        : worker.jobs[0];
    }

    custJob.innerHTML = '';
    names.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;                          // English name is what gets saved
      opt.textContent = jobLabel(name);
      opt.selected = name === selected;
      custJob.appendChild(opt);
    });
  }

  function openBooking(worker) {
    bookingWorker = worker;
    bookWorkerEl.textContent = t('bookWith') + worker.name;
    fillJobOptions(worker, null);

    formError.classList.add('hidden');
    bookForm.classList.remove('hidden');
    bookDone.classList.add('hidden');
    bookSubmit.disabled = false;
    bookSubmit.textContent = t('submit');

    // Keep name/phone/address from last time on this phone (saves typing)
    try {
      custName.value    = localStorage.getItem('yws_name') || '';
      custPhone.value   = localStorage.getItem('yws_phone') || '';
      custAddress.value = localStorage.getItem('yws_address') || '';
    } catch (e) { /* ignore */ }

    bookModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    custName.focus();
  }

  function closeBooking() {
    bookModal.classList.add('hidden');
    document.body.style.overflow = '';
    bookingWorker = null;
  }

  /** Keep only digits; turn +91 / 91 / 0 prefixes into a plain 10-digit number */
  function normalizePhone(value) {
    var d = value.replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.substring(2);
    if (d.length === 11 && d.charAt(0) === '0')  d = d.substring(1);
    return d;
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.classList.remove('hidden');
  }

  function submitBooking(e) {
    e.preventDefault();

    var name    = custName.value.trim();
    var phone   = normalizePhone(custPhone.value);
    var address = custAddress.value.trim();
    var job     = custJob.value;

    if (!name)                    { showFormError(t('errName'));    custName.focus();    return; }
    if (!/^\d{10}$/.test(phone))  { showFormError(t('errPhone'));   custPhone.focus();   return; }
    if (!address)                 { showFormError(t('errAddress')); custAddress.focus(); return; }
    if (!job)                     { showFormError(t('errJob'));     custJob.focus();     return; }

    custPhone.value = phone;   // show the cleaned 10-digit number
    formError.classList.add('hidden');
    bookSubmit.disabled = true;
    bookSubmit.textContent = t('sending');

    fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName:  name,
        customerPhone: phone,
        address:       address,
        jobCategory:   job,
        workerName:    bookingWorker.name,
      }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          showFormError((currentLang === 'hi' && result.data.error_hi) || result.data.error || t('error'));
          bookSubmit.disabled = false;
          bookSubmit.textContent = t('submit');
          return;
        }

        try {
          localStorage.setItem('yws_name', name);
          localStorage.setItem('yws_phone', phone);
          localStorage.setItem('yws_address', address);
        } catch (err) { /* ignore */ }

        // Show the confirmation with the WhatsApp button
        $('doneWhatsApp').href = result.data.whatsappUrl;
        bookForm.classList.add('hidden');
        bookDone.classList.remove('hidden');
      })
      .catch(function () {
        showFormError(t('error'));
        bookSubmit.disabled = false;
        bookSubmit.textContent = t('submit');
      });
  }

  // ═══════════════════════════════════════
  // 10. DATA FETCHING & CACHING
  // ═══════════════════════════════════════

  /**
   * Load worker list — uses localStorage cache for instant display,
   * then refreshes in the background. 
   */
  function loadWorkers() {
    // 1. Try to show cached data immediately
    var cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    } catch (e) { /* ignore */ }

    if (cached && Array.isArray(cached) && cached.length > 0) {
      workers = cached;
      renderWorkers();
    } else {
      // No cache — show skeletons
      showSkeletons();
    }

    // 2. Fetch fresh data in background
    fetch('/api/workers')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then(function (data) {
        workers = data;
        // Cache in localStorage 
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        } catch (e) { /* storage full — ignore */ }
        renderWorkers();
      })
      .catch(function () {
        // If we had cached data, it's already shown — just show a toast
        if (!cached || cached.length === 0) {
          workersGrid.innerHTML = '';
          emptyState.classList.remove('hidden');
          emptyText.textContent = t('error');
        }
        showToast(t('error'), 'error');
      });
  }

  /** Load job categories for filter buttons */
  function loadJobs() {
    fetch('/api/jobs')
      .then(function (res) {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then(function (data) {
        jobs = data;
        renderJobButtons();
      })
      .catch(function () {
        // Jobs will just not have filter buttons — not critical
      });
  }

  // ═══════════════════════════════════════
  // 11. EVENT LISTENERS
  // ═══════════════════════════════════════

  // Language toggle
  langToggle.addEventListener('click', function () {
    currentLang = currentLang === 'en' ? 'hi' : 'en';
    localStorage.setItem(LANG_KEY, currentLang);
    updateTranslations();
  });

  // Search input (debounced)
  var searchTimer = null;
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      searchQuery = searchInput.value.trim();
      renderWorkers();
    }, 200);
  });

  // Booking overlay
  bookForm.addEventListener('submit', submitBooking);
  $('bookCancel').addEventListener('click', closeBooking);
  $('doneClose').addEventListener('click', closeBooking);
  bookModal.addEventListener('click', function (e) {
    if (e.target === bookModal) closeBooking();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !bookModal.classList.contains('hidden')) closeBooking();
  });
  // Phone box accepts digits only
  custPhone.addEventListener('input', function () {
    custPhone.value = custPhone.value.replace(/\D/g, '').substring(0, 10);
  });

  // "All" job filter button
  btnAll.addEventListener('click', function () {
    selectJob('all');
  });

  // ═══════════════════════════════════════
  // 12. INIT
  // ═══════════════════════════════════════

  updateTranslations();
  loadJobs();
  loadWorkers();

})();
