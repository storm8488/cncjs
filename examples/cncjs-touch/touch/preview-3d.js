/* Preview views: the stored 2D image, or a fixed 3D view (isometric, front XZ,
 * side YZ, top XY) drawn from the preview's 3D path. Each view of a file is
 * drawn once, off the interface thread (OffscreenCanvas worker; in the page by
 * short slices otherwise), then kept: the asked view first, the others when the
 * page is idle. A chosen view replaces the image's src; the tool marker and the
 * progress trail read its projection from img.cncView. Never talks to a controller. */
(function (root) {
  'use strict';
  var T3 = root.CNCToolpath3D;
  if (!T3 || typeof document === 'undefined') return;
  var uiLocale = root.cncI18n || { t: function (s) { return s; }, html: function (s) { return s; } }, t = uiLocale.t;
  var STORE = 'cncjs-touch-preview-view-v1';
  var VIEWS = ['2d', 'iso', 'front', 'side', 'top'];
  var LABELS = { '2d': '2D', iso: t('Iso'), front: t('Face'), side: t('Côté'), top: t('Dessus') };
  var TITLES = { '2d': t('Aperçu 2D enregistré'), iso: t('Vue isométrique'), front: t('Vue de face (XZ)'), side: t('Vue de côté (YZ)'), top: t('Vue de dessus (XY)') };
  var source = document.currentScript && document.currentScript.src;
  var workerURL = (source ? source.split(/[?#]/)[0].replace(/[^/]*$/, '') : '') + 'preview-3d-worker.js?v=view2';
  var view = '2d', hosts = [], cache = [], queue = [], active = null, idle = null, nextId = 0;
  var worker = null, workerState = 'none', startup = null;
  try { var saved = root.localStorage.getItem(STORE); if (VIEWS.indexOf(saved) >= 0) view = saved; } catch (_) {}

  // The cache: a few files, each with its finished views ({url, projection}).
  function keyOf(meta) {
    var p = meta && meta.path3d;
    return p && typeof p.data === 'string' ? String(meta.file || '') + '|' + p.count + '|' + p.data.length + '|' + p.data.slice(-48) : '';
  }
  function entryFor(key, create) {
    for (var i = 0; i < cache.length; i++) if (cache[i].key === key) { var hit = cache.splice(i, 1)[0]; cache.unshift(hit); return hit; }
    if (!create) return null;
    var entry = { key: key, views: {}, pending: {}, failed: {} };
    cache.unshift(entry);
    // Three files at most; never one whose image is on screen.
    for (var j = cache.length - 1; j >= 0 && cache.length > 3; j--) {
      var old = cache[j];
      if (hosts.some(function (h) { return h.key === old.key; })) continue;
      Object.keys(old.views).forEach(function (v) { try { root.URL.revokeObjectURL(old.views[v].url); } catch (_) {} });
      queue = queue.filter(function (job) { return job.entry !== old; });
      cache.splice(j, 1);
    }
    return entry;
  }

  function status(host, text) { if (host.status.textContent !== text) host.status.textContent = text; if (host.status.hidden !== !text) host.status.hidden = !text; }
  // cncView names the image it belongs to: a reader compares it with the shown src.
  function show(host, src, cncView) {
    if (cncView) cncView.src = src;
    host.img.cncView = cncView;
    host.shown = src;
    if (host.img.getAttribute('src') !== src) host.img.src = src;
  }
  function buttons(host) {
    host.buttons.forEach(function (b) { var on = String(b.getAttribute('data-view') === view); if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on); });
  }
  function update(host) {
    buttons(host);
    var meta = host.meta;
    host.key = '';
    if (!host.base) { host.img.cncView = null; status(host, ''); return; }
    if (view === '2d') { show(host, host.base, null); status(host, ''); return; }
    if (!meta || !meta.path3d) {
      show(host, host.base, null);
      status(host, t('Vues 3D indisponibles pour cet ancien aperçu : régénérez-le dans Fichiers.')); return;
    }
    var key = keyOf(meta), entry = entryFor(key, true), done = entry.views[view];
    host.key = key;
    if (done) { show(host, done.url, { view: view, projection: done.projection }); status(host, ''); background(entry, meta); return; }
    show(host, host.base, null);
    if (entry.failed[view]) { status(host, t('Vue 3D indisponible : ') + entry.failed[view]); return; }
    status(host, t('Calcul de la vue 3D…'));
    request(entry, meta, view, true);
  }
  function refresh() { hosts.forEach(update); }

  // A host's 2D image changed (another file, a new preview, none): that becomes its base.
  function observe(host) {
    var src = host.img.getAttribute('src') || '';
    if (src === host.shown) return;
    host.base = src && !/^blob:/.test(src) ? src : '';
    host.meta = host.base ? host.img.cncPreview || null : null;
    host.shown = host.base; host.img.cncView = null;
    update(host);
  }

  function request(entry, meta, v, urgent) {
    if (entry.views[v] || entry.failed[v]) return;
    var job = null;
    for (var i = 0; i < queue.length; i++) if (queue[i].entry === entry && queue[i].view === v) job = queue.splice(i, 1)[0];
    if (active && active.entry === entry && active.view === v) { active.urgent = active.urgent || urgent; return; }
    job = job || { entry: entry, meta: meta, view: v, urgent: urgent };
    job.urgent = job.urgent || urgent;
    if (job.urgent) {
      queue.unshift(job);
      // The asked view goes first: a view drawn in the background is set aside.
      if (active && !active.urgent) { cancelActive(); }
    } else queue.push(job);
    pump();
  }
  function background(entry, meta) {
    T3.VIEWS.forEach(function (v) { if (!entry.views[v] && !entry.failed[v]) request(entry, meta, v, false); });
  }
  function cancelActive() {
    var job = active; active = null;
    if (!job) return;
    if (job.cancel) job.cancel();
    if (worker && workerState === 'ready') worker.postMessage({ type: 'cancel', id: job.id });
    job.urgent = false; queue.push(job);
  }
  function pump() {
    if (active || !queue.length) return;
    if (workerState === 'none') { startWorker(); return; }
    if (workerState === 'starting') return;
    var job = queue[0];
    // Views nobody asked for yet are drawn only while the page is idle.
    if (!job.urgent) {
      if (document.hidden) return;
      if (idle === null) {
        // Starting a view only posts a message (the worker draws) or schedules 6 ms slices, so
        // any idle period will do: no minimum length (a page drawing frames never has 20 ms
        // free; measured on the tablet), and 3 s at most. Called on window: Chromium refuses
        // a detached requestIdleCallback (Illegal invocation).
        if (typeof root.requestIdleCallback !== 'function') idle = setTimeout(function () { idle = null; startJob(); }, 300);
        else idle = root.requestIdleCallback(function () { idle = null; startJob(); }, { timeout: 3000 });
      }
      return;
    }
    startJob();
  }
  function startJob() {
    if (active || !queue.length || !queue[0].urgent && document.hidden) return;
    var job = active = queue.shift();
    job.id = ++nextId;
    var options = { title: TITLES[job.view], locale: uiLocale.locale, zBounds: job.meta.zBounds };
    if (workerState === 'ready') worker.postMessage({ type: 'render', id: job.id, key: job.entry.key, view: job.view, path: job.meta.path3d, options: options });
    else inPage(job, options);
  }
  function finished(job, blob, projection, error) {
    if (active !== job) return;
    active = null;
    if (error) job.entry.failed[job.view] = String(error.message || error);
    else job.entry.views[job.view] = { url: root.URL.createObjectURL(blob), projection: projection };
    delete job.entry.pending[job.view];
    refresh();
    pump();
  }

  function startWorker() {
    if (typeof root.Worker !== 'function') { workerState = 'page'; pump(); return; }
    try { worker = new root.Worker(workerURL); } catch (_) { workerState = 'page'; pump(); return; }
    workerState = 'starting';
    function fallback() {
      clearTimeout(startup);
      if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
      // A job sent to a worker that broke is drawn again in the page.
      if (active) { var job = active; active = null; job.urgent = true; queue.unshift(job); }
      workerState = 'page'; pump();
    }
    startup = setTimeout(fallback, 5000);
    worker.onerror = function (event) { if (event && event.preventDefault) event.preventDefault(); fallback(); };
    worker.onmessage = function (event) {
      var message = event.data || {};
      if (message.type === 'ready') {
        clearTimeout(startup);
        // Without OffscreenCanvas, the page draws by slices; the worker is not needed.
        if (message.version !== 1 || !message.offscreen) { fallback(); return; }
        workerState = 'ready'; pump(); return;
      }
      if (!active || message.id !== active.id) return;
      if (message.type === 'image' && message.blob) finished(active, message.blob, message.projection);
      else if (message.type === 'error') finished(active, null, null, new Error(message.message || t('rendu impossible')));
    };
  }
  // Same drawing in the page, 6 ms at a time, then a PNG Blob.
  function inPage(job, options) {
    var stopped = false, timer = null;
    job.cancel = function () { stopped = true; clearTimeout(timer); };
    try {
      var canvas = document.createElement('canvas'); canvas.width = T3.WIDTH; canvas.height = T3.HEIGHT;
      var ctx = canvas.getContext('2d'); if (!ctx) throw new Error(t('Canvas indisponible'));
      var renderer = T3.createRenderer(ctx, T3.decode(job.meta.path3d), job.view, options);
    } catch (error) { finished(job, null, null, error); return; }
    function slice() {
      timer = null; if (stopped) return;
      try {
        var until = Date.now() + 6;
        if (!renderer.step(function () { return Date.now() > until; })) { timer = setTimeout(slice, 0); return; }
        if (typeof canvas.toBlob !== 'function') throw new Error(t('Encodage PNG indisponible'));
        canvas.toBlob(function (blob) { if (!stopped) finished(job, blob, renderer.projection, blob ? null : new Error(t('Encodage PNG impossible'))); }, 'image/png');
      } catch (error) { finished(job, null, null, error); }
    }
    timer = setTimeout(slice, 0);
  }

  function choose(next) {
    if (VIEWS.indexOf(next) < 0 || next === view) return;
    view = next;
    try { root.localStorage.setItem(STORE, view); } catch (_) {}
    refresh();
  }
  function attach(imageId) {
    var img = document.getElementById(imageId);
    if (!img || !img.parentNode) return;
    var box = img.parentNode, bar = document.createElement('div'), note = document.createElement('p');
    bar.className = 't-seg pv3d-views'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', t('Vue de l’aperçu'));
    var host = { img: img, bar: bar, status: note, buttons: [], base: '', meta: null, shown: null, key: '' };
    VIEWS.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pv3d-view'; b.setAttribute('data-view', v); b.setAttribute('aria-pressed', 'false');
      b.textContent = LABELS[v]; b.title = TITLES[v]; b.setAttribute('aria-label', TITLES[v]);
      b.addEventListener('click', function () { choose(v); });
      bar.appendChild(b); host.buttons.push(b);
    });
    note.className = 'pv3d-status'; note.setAttribute('role', 'status'); note.hidden = true;
    box.classList.add('pv3d-host'); box.appendChild(bar); box.appendChild(note);
    hosts.push(host);
    new root.MutationObserver(function () { observe(host); }).observe(img, { attributes: true, attributeFilter: ['src'] });
    observe(host); buttons(host);
  }
  ['library-image', 'home-job-image'].forEach(attach);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pump(); });
  root.cncPreviewViews = { view: function () { return view; }, choose: choose, title: function (v) { return TITLES[v] || ''; },
    state: function () { return { worker: workerState, active: active ? active.view + (active.urgent ? '!' : '') : null, idle: idle !== null, queue: queue.map(function (j) { return j.entry.key.split('|')[0] + ':' + j.view + (j.urgent ? '!' : ''); }) }; }, cached: function () { return cache.map(function (e) { return { key: e.key, views: Object.keys(e.views), failed: e.failed }; }); } };
})(typeof window !== 'undefined' ? window : this);
