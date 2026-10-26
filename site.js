(function () {
  initThemeToggle();
  initRevealToggle();
  initCopyChecksum();
  initBackdrop();
  initPublicStats();

  function initPublicStats() {
    var card = document.getElementById('site-stats');
    if (!card) return;
    var endpoint = card.getAttribute('data-stats-api');
    if (!endpoint) return;
    var visitCount = document.getElementById('visit-count');
    var androidCount = document.getElementById('android-download-count');
    var windowsCount = document.getElementById('windows-download-count');
    var note = document.getElementById('stats-note');
    var base;
    try {
      base = new URL(endpoint);
      if (base.protocol !== 'https:' || base.pathname !== '/') return;
    } catch (e) { return; }
    var api = base.origin;
    var visitKey = 'flipit-visit-counted';
    var countedThisTab = false;
    try { countedThisTab = sessionStorage.getItem(visitKey) === '1'; } catch (e) {}

    var visitRequest = countedThisTab ? Promise.resolve() : fetch(api + '/visit', {
      method: 'POST',
      body: '',
      keepalive: true
    }).then(function (response) {
      if (!response.ok) throw new Error('Visit counter unavailable');
      try { sessionStorage.setItem(visitKey, '1'); } catch (e) {}
    });

    visitRequest.then(function () {
      return fetch(api + '/stats', { headers: { Accept: 'application/json' } });
    }).then(function (response) {
      if (!response.ok) throw new Error('Stats unavailable');
      return response.json();
    }).then(function (data) {
      if (visitCount && Number.isSafeInteger(data.visits)) visitCount.textContent = data.visits.toLocaleString();
      if (androidCount && Number.isSafeInteger(data.androidDownloads)) androidCount.textContent = data.androidDownloads.toLocaleString();
      if (windowsCount && Number.isSafeInteger(data.windowsDownloads)) windowsCount.textContent = data.windowsDownloads.toLocaleString();
      if (note) note.textContent = 'One visit is counted per open tab session. Download totals come from public releases.';
    }).catch(function () {
      if (note) note.textContent = 'Live totals are temporarily unavailable. Please check back soon.';
    });
  }

  /**
   * Light and dark, with the phone or computer's own setting as the starting point. A choice made
   * here is remembered and wins over that setting, in both directions - someone on a dark system
   * who wants this page light gets it, which an override in one direction only would not give
   * them.
   */
  function initThemeToggle() {
    var toggle = document.getElementById('theme-toggle');
    var label = document.getElementById('theme-label');
    if (!toggle) return;
    var root = document.documentElement;
    var system = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function currentlyDark() {
      var chosen = root.getAttribute('data-theme');
      if (chosen === 'dark') return true;
      if (chosen === 'light') return false;
      return !!(system && system.matches);
    }

    function show() {
      var dark = currentlyDark();
      // The button says what it will do, not what the page is: a control named after its own
      // state reads as a statement and leaves people guessing which way it goes.
      if (label) label.textContent = dark ? 'Light' : 'Dark';
      toggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
      toggle.setAttribute('aria-label', dark ? 'Switch to the light theme' : 'Switch to the dark theme');
      root.setAttribute('data-shows', dark ? 'dark' : 'light');
    }

    toggle.addEventListener('click', function () {
      var next = currentlyDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('flipit-theme', next); } catch (e) {}
      show();
    });

    // Until someone chooses here, the system setting still leads, so follow it as it changes.
    if (system) {
      var follow = function () { if (!root.getAttribute('data-theme')) show(); };
      if (system.addEventListener) system.addEventListener('change', follow);
      else if (system.addListener) system.addListener(follow);
    }
    show();
  }

  function initRevealToggle() {
    var props = document.getElementById('props');
    var toggle = document.getElementById('reveal-toggle');
    if (!props || !toggle) return;
    toggle.addEventListener('click', function () {
      var revealed = props.classList.toggle('is-revealed');
      toggle.setAttribute('aria-pressed', revealed ? 'true' : 'false');
      toggle.textContent = revealed ? 'Redact values' : 'Reveal values';
    });
  }

  // One per download, so each platform's checksum has a button of its own.
  function initCopyChecksum() {
    wireCopy('copy-hash', 'hash');
    wireCopy('copy-apk-hash', 'apk-hash');
  }

  function wireCopy(buttonId, hashId) {
    var copyBtn = document.getElementById(buttonId);
    var hash = document.getElementById(hashId);
    if (!copyBtn || !hash) return;

    var timer;
    function flash(message) {
      copyBtn.textContent = message;
      clearTimeout(timer);
      timer = setTimeout(function () { copyBtn.textContent = 'Copy checksum'; }, 2400);
    }
    function selectHash() {
      var range = document.createRange();
      range.selectNodeContents(hash);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      flash('Selected — press Ctrl+C');
    }
    copyBtn.addEventListener('click', function () {
      var text = hash.textContent.trim();
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { flash('Copied'); }, selectHash);
        } else {
          selectHash();
        }
      } catch (e) {
        selectHash();
      }
    });
  }

  // Format tags from FlipIt's real conversions drift up the page; every few
  // seconds one flips over to the format it converts into.
  function initBackdrop() {
    var canvas = document.createElement('canvas');
    if (!canvas.getContext || !window.requestAnimationFrame) return;
    canvas.className = 'backdrop';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(canvas, document.body.firstChild);
    var ctx = canvas.getContext('2d');

    var PAIRS = [
      ['.docx', '.pdf'], ['.pdf', '.xlsx'], ['.pdf', '.csv'], ['.pdf', '.docx'],
      ['.txt', '.pdf'], ['.csv', '.xlsx'], ['.xlsx', '.csv'], ['.jpg', '.png'],
      ['.png', '.jpg'], ['.mp3', '.wav'], ['.wav', '.mp3'], ['.xlsx', '.pdf'], ['.jpg', '.pdf'], ['.png', '.docx']
    ];
    var FLIP_MS = 900;
    var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    var width = 0, height = 0, chips = [], colors = {};
    var running = false, frame = 0, last = 0, resizeTimer;

    function rand(min, max) { return min + Math.random() * (max - min); }
    function reduced() { return !!(reduceQuery && reduceQuery.matches); }

    function readColors() {
      var style = getComputedStyle(document.documentElement);
      var dark = style.getPropertyValue('color-scheme').indexOf('dark') !== -1;
      colors = {
        ink: style.getPropertyValue('--ink-3').trim() || '#676F85',
        accent: style.getPropertyValue('--accent').trim() || '#4557E8',
        base: dark ? 0.34 : 0.3
      };
    }

    function makeChip(anywhere) {
      var depth = Math.random();
      return {
        pair: PAIRS[Math.floor(Math.random() * PAIRS.length)],
        showing: 0,
        x: rand(0, width),
        y: anywhere ? rand(0, height) : height + rand(20, 140),
        depth: depth,
        scale: 0.8 + depth * 0.45,
        speed: 6 + depth * 10,
        swayAmp: rand(6, 18),
        swayRate: rand(0.00015, 0.0004),
        phase: rand(0, Math.PI * 2),
        nextFlip: performance.now() + rand(1500, 12000),
        flipStart: -1
      };
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var target = Math.max(10, Math.min(26, Math.round((width * height) / 60000)));
      while (chips.length < target) chips.push(makeChip(true));
      chips.length = target;
    }

    // Faint behind the centred text column, full strength in the margins.
    function edgeFactor(x) {
      var half = Math.min(560, width / 2);
      var distance = Math.abs(x - width / 2);
      var inner = half * 0.85;
      if (distance <= inner) return 0.35;
      return 0.35 + 0.65 * Math.min(1, (distance - inner) / (half * 0.3 + 40));
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawChip(chip, now) {
      var flipping = chip.flipStart >= 0;
      var progress = flipping ? Math.min(1, (now - chip.flipStart) / FLIP_MS) : 0;
      var label = chip.pair[progress > 0.5 ? 1 - chip.showing : chip.showing];
      var squash = flipping ? Math.max(0.02, Math.abs(Math.cos(progress * Math.PI))) : 1;
      var glow = flipping ? Math.sin(progress * Math.PI) : 0;

      var fontSize = 12 * chip.scale;
      ctx.font = '500 ' + fontSize.toFixed(1) + 'px "IBM Plex Mono", Consolas, monospace';
      var w = ctx.measureText(label).width + 16 * chip.scale;
      var h = 24 * chip.scale;
      var x = chip.x + Math.sin(now * chip.swayRate + chip.phase) * chip.swayAmp;
      var alpha = colors.base * (0.45 + chip.depth * 0.55) * edgeFactor(x);

      ctx.save();
      ctx.translate(x, chip.y);
      ctx.scale(squash, 1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1;
      roundRect(-w / 2, -h / 2, w, h, 5 * chip.scale);

      ctx.globalAlpha = alpha * (1 - glow * 0.6);
      ctx.strokeStyle = colors.ink;
      ctx.stroke();
      ctx.fillStyle = colors.ink;
      ctx.fillText(label, 0, 1);

      if (glow > 0) {
        ctx.globalAlpha = Math.min(1, (alpha + 0.25) * glow);
        ctx.strokeStyle = colors.accent;
        ctx.stroke();
        ctx.fillStyle = colors.accent;
        ctx.fillText(label, 0, 1);
      }
      ctx.restore();
    }

    function step(now) {
      var dt = last ? Math.min(64, now - last) : 16;
      last = now;
      ctx.clearRect(0, 0, width, height);
      for (var i = 0; i < chips.length; i++) {
        var chip = chips[i];
        chip.y -= (chip.speed * dt) / 1000;
        if (chip.y < -40) chip = chips[i] = makeChip(false);
        if (chip.flipStart < 0 && now >= chip.nextFlip) chip.flipStart = now;
        if (chip.flipStart >= 0 && now - chip.flipStart >= FLIP_MS) {
          chip.showing = 1 - chip.showing;
          chip.flipStart = -1;
          chip.nextFlip = now + rand(6000, 14000);
        }
        drawChip(chip, now);
      }
      if (running) frame = window.requestAnimationFrame(step);
    }

    function drawStill() {
      var now = performance.now();
      ctx.clearRect(0, 0, width, height);
      for (var i = 0; i < chips.length; i++) {
        chips[i].flipStart = -1;
        drawChip(chips[i], now);
      }
    }

    function start() {
      if (running || reduced() || document.hidden) return;
      running = true;
      last = 0;
      frame = window.requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      window.cancelAnimationFrame(frame);
    }

    function refresh() {
      stop();
      readColors();
      if (reduced()) drawStill();
      else start();
    }

    function listen(query, handler) {
      if (!query) return;
      if (query.addEventListener) query.addEventListener('change', handler);
      else if (query.addListener) query.addListener(handler);
    }

    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        if (!running) drawStill();
      }, 150);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else refresh();
    });
    listen(reduceQuery, refresh);
    listen(darkQuery, function () {
      readColors();
      if (!running) drawStill();
    });
    if (window.MutationObserver) {
      new MutationObserver(function () {
        readColors();
        if (!running) drawStill();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (!running) drawStill(); });
    }

    readColors();
    resize();
    refresh();
  }
})();
