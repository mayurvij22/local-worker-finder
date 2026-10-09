/**
 * app.js — Customer-facing page logic
 *
 * Features:
 *  - English / Hindi toggle
 *  - Job filter buttons + name search
 *  - Skeleton loading cards
 *  - Worker cards with "Show Number" → reveals phone, Call, WhatsApp
 *  - Browser cache (localStorage) for worker list (NO phone numbers)
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
      showNumber:  'Show Number',
      call:        'Call',
      whatsapp:    'WhatsApp',
      noWorkers:   'No workers found',
      heroTitle:   'Need a skilled worker?',
      heroText:    'Electricians, plumbers, painters & more — call or WhatsApp directly.',
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
      showNumber:  'नंबर दिखाएं',
      call:        'कॉल करें',
      whatsapp:    'व्हाट्सएप',
      noWorkers:   'कोई कारीगर नहीं मिला',
      heroTitle:   'कुशल कारीगर चाहिए?',
      heroText:    'इलेक्ट्रीशियन, प्लंबर, पेंटर और बहुत कुछ — सीधे कॉल या व्हाट्सएप करें।',
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

  var CACHE_KEY = 'yws_workers';
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
      var matchJob = currentJob === 'all' || w.job === currentJob;
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

    // Text column
    var textDiv = document.createElement('div');

    var nameEl = document.createElement('h3');
    nameEl.className = 'worker-name';
    nameEl.textContent = worker.name;           // textContent = safe

    var jobEl = document.createElement('span');
    jobEl.className = 'worker-job';
    jobEl.textContent = jobLabel(worker.job);    // textContent = safe

    textDiv.appendChild(nameEl);
    textDiv.appendChild(jobEl);
    infoDiv.appendChild(avatar);
    infoDiv.appendChild(textDiv);
    card.appendChild(infoDiv);

    // — Show Number button —
    var showBtn = document.createElement('button');
    showBtn.className = 'show-number-btn';
    showBtn.textContent = '📞 ' + t('showNumber');
    showBtn.addEventListener('click', function () {
      revealNumber(worker, card, showBtn);
    });
    card.appendChild(showBtn);

    // — Phone actions container (hidden until number is revealed) —
    var actionsDiv = document.createElement('div');
    actionsDiv.className = 'phone-actions hidden';
    card.appendChild(actionsDiv);

    return card;
  }

  // ═══════════════════════════════════════
  // 9. REVEAL PHONE NUMBER
  // ═══════════════════════════════════════

  function revealNumber(worker, card, btn) {
    // Show a loading spinner inside the button
    btn.disabled = true;
    btn.textContent = '';
    var spinner = document.createElement('div');
    spinner.className = 'btn-spinner';
    btn.appendChild(spinner);

    fetch('/api/number?id=' + encodeURIComponent(worker.id))
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          // Show error (use Hindi message if available and language is Hindi)
          var msg = (currentLang === 'hi' && result.data.error_hi)
            ? result.data.error_hi
            : (result.data.error || t('error'));
          showToast(msg, 'error');
          btn.disabled = false;
          btn.textContent = '📞 ' + t('showNumber');
          return;
        }

        var data = result.data;

        // Hide button, show phone actions
        btn.classList.add('hidden');
        var actions = card.querySelector('.phone-actions');
        actions.classList.remove('hidden');

        // Phone number display
        var phoneDiv = document.createElement('div');
        phoneDiv.className = 'phone-display';
        phoneDiv.textContent = '+91 ' + data.phone;   // textContent = safe
        actions.appendChild(phoneDiv);

        // Buttons row
        var btnRow = document.createElement('div');
        btnRow.className = 'action-buttons';

        // Call button
        var callLink = document.createElement('a');
        callLink.href = 'tel:+91' + data.phone;
        callLink.className = 'action-btn call-btn';
        callLink.textContent = '📞 ' + t('call');
        btnRow.appendChild(callLink);

        // WhatsApp button (only if the worker has WhatsApp)
        if (data.whatsapp) {
          // Always Marathi — workers are local, whatever language the customer browses in
          var waText = 'नमस्कार 🙏\n\n'
            + 'मला तुमचा संपर्क *न्यू योगेश्वर इलेक्ट्रिक & नल फिटिंग* कडून मिळाला.\n'
            + 'मला *' + worker.job + '* ची गरज आहे.\n\n'
            + 'तुम्ही उपलब्ध आहात का?';

          var waLink = document.createElement('a');
          waLink.href = 'https://wa.me/91' + data.phone + '?text=' + encodeURIComponent(waText);
          waLink.target = '_blank';
          waLink.rel = 'noopener noreferrer';
          waLink.className = 'action-btn wa-btn';
          waLink.textContent = '💬 ' + t('whatsapp');
          btnRow.appendChild(waLink);
        }

        actions.appendChild(btnRow);
      })
      .catch(function () {
        showToast(t('error'), 'error');
        btn.disabled = false;
        btn.textContent = '📞 ' + t('showNumber');
      });
  }

  // ═══════════════════════════════════════
  // 10. DATA FETCHING & CACHING
  // ═══════════════════════════════════════

  /**
   * Load worker list — uses localStorage cache for instant display,
   * then refreshes in the background. NEVER caches phone numbers.
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
        // Cache in localStorage (these have NO phone numbers)
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
