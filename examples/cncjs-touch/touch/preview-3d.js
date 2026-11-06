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
  // 'laser' (laser-view.js) only for a machine whose profile is laser; it stays available in eco.
  var VIEWS = ['2d', 'iso', 'front', 'side', 'top', 'laser'];
  var LABELS = { '2d': '2D', iso: t('Iso'), front: t('Face'), side: t('Côté'), top: t('Dessus'), laser: t('Laser') };
  var TITLES = { '2d': t('Aperçu 2D enregistré'), iso: t('Vue isométrique'), front: t('Vue de face (XZ)'), side: t('Vue de côté (YZ)'), top: t('Vue de dessus (XY)'), laser: t('Vue laser (XY, consigne S)') };
  var source = document.currentScript && document.currentScript.src;
  var base = source ? source.split(/[?#]/)[0].replace(/[^/]*$/, '') : '';
  var workerURL = base + 'preview-3d-worker.js?v=view3';
  var view = '2d', hosts = [], cache = [], queue = [], active = null, idle = null, nextId = 0;
  var worker = null, workerState = 'none', startup = null;
  // v2 owns a visible scene only. Keep the v1 RT/Eco/laser scheduling unchanged.
  var v2Seen = false, ended = false, locked = false, renderFrame = null, renderTasks = [], refreshQueued = false;
  function releaseFixed() {
    if (active && active.cancel) active.cancel();
    active = null; queue = [];
    clearTimeout(startup); startup = null;
    if (idle !== null) { if (root.cancelIdleCallback) root.cancelIdleCallback(idle); else clearTimeout(idle); idle = null; }
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    workerState = 'none';
    if (laserJob) { laserJob.run.cancel(); laserJob = null; }
    cache.forEach(function (entry) { Object.keys(entry.views).forEach(function (view) { try { root.URL.revokeObjectURL(entry.views[view].url); } catch (_) {} }); });
    cache = [];
  }
  function v2() {
    var api = root.cncV2;
    if (!v2Seen && api && typeof api.gate === 'function' && api.gate()) { v2Seen = true; releaseFixed(); }
    return v2Seen;
  }
  function v2Ready() { return !ended && !locked && !document.hidden && root.cncV2 && root.cncV2.gate(); }
  function fixedQuality() {
    if (!v2() || !root.cncV2 || typeof root.cncV2.use !== 'function') return false;
    var snapshot = root.cncV2.use('inspect').snapshot();
    return !!(snapshot && snapshot.quality && snapshot.quality.mode === 'fixed');
  }
  function onFrame(fn, failed) {
    if (!v2()) { fn(); return; }
    if (!v2Ready()) return;
    renderTasks.push(function () { try { fn(); } catch (error) { if (failed) failed(error); else throw error; } });
    if (renderFrame !== null) return;
    renderFrame = root.requestAnimationFrame(function () {
      renderFrame = null; var tasks = renderTasks; renderTasks = [];
      if (!v2Ready()) { refreshQueued = false; return; }
      tasks.forEach(function (task) { task(); });
    });
  }
  function suspend(reason) {
    if (!v2()) return;
    if (renderFrame !== null) root.cancelAnimationFrame(renderFrame);
    renderFrame = null; renderTasks = []; refreshQueued = false;
    releaseFixed();
    if (gpuIdle !== null) { if (root.cancelIdleCallback) root.cancelIdleCallback(gpuIdle); else clearTimeout(gpuIdle); gpuIdle = null; }
    freeOpen = null;
    hosts.forEach(function (host) { closeInline(host, reason); });
    if (root.CNCPreviewGL && typeof root.CNCPreviewGL.close === 'function') root.CNCPreviewGL.close(reason);
  }
  try { var saved = root.localStorage.getItem(STORE); if (VIEWS.indexOf(saved) >= 0) view = saved; } catch (_) {}

  // The cache: a few programs, each with its finished views ({url, projection}). A program is
  // its fingerprint (the SHA-256 of the file, set by the server when the sidecar was made),
  // not its name: a file replaced under the same name is another program. The path's point
  // count, length and tail only tell two previews of the same program apart.
  function keyOf(meta) {
    var p = meta && meta.path3d, fp = meta && meta.fingerprint;
    return p && typeof p.data === 'string' && typeof fp === 'string' && fp ? fp + '|' + p.count + '|' + p.data.length + '|' + p.data.slice(-48) : '';
  }
  function entryFor(key, file, create) {
    for (var i = 0; i < cache.length; i++) if (cache[i].key === key) { var hit = cache.splice(i, 1)[0]; cache.unshift(hit); return hit; }
    if (!create) return null;
    var entry = { key: key, file: String(file || ''), views: {}, pending: {}, failed: {} };
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
  // Profile (tablet-profile.js, lot B): absent or unreadable reads as eco and an unknown machine.
  function profile() { var p = root.cncProfile; return p && typeof p.performance === 'function' ? p : null; }
  function performance() { var p = profile(); try { return !!p && p.performance() === 'performance'; } catch (_) { return false; } }
  function laserMachine() { var p = profile(); try { return !!p && typeof p.kind === 'function' && p.kind() === 'laser'; } catch (_) { return false; } }
  // A laser machine has the laser view only; the CNC choice is kept for when the type goes back to CNC.
  function current() { if (laserMachine()) return 'laser'; return view === 'laser' ? '2d' : view; }
  function buttons(host) {
    var v = current();
    host.buttons.forEach(function (b) {
      var name = b.getAttribute('data-view'), on = String(name === v);
      if (b.getAttribute('aria-pressed') !== on) b.setAttribute('aria-pressed', on);
      var hide = laserMachine() ? name !== 'laser' : name === 'laser';
      if (b.hidden !== hide) b.hidden = hide;
    });
    // CNC in Performance: the free 3D view is the preview itself (no view buttons); otherwise the fixed views.
    var inline = inlineMode(host);
    if (host.free.hidden !== true) host.free.hidden = true;
    var bar = inline || !!host.img.hidden || !host.img.getAttribute('src');
    if (host.bar.hidden !== bar) host.bar.hidden = bar;
  }
  // ---- Inline free 3D view (CNC, Performance): drawn in the preview frame, turned with a finger ----
  // Suivi keeps its fixed view and progress trail while a job runs or is paused, except under the GPU
  // gate (spec 3.1): the live 3D view of the loaded program then stays, with its progress and marker.
  var jobBusy = false, jobMachine = null;
  function samePrint(a, b) { return String(a || '').toLowerCase().replace(/^sha256:/, '') === String(b || '').toLowerCase().replace(/^sha256:/, ''); }
  function liveAllowed(host) {
    var g = gpuState(), m = jobMachine, meta = host.meta, art = host.img.parentNode;
    if (host.img.id !== 'home-job-image' || !g.hardware || g.lost || !m || !meta || m.name !== meta.file) return false;
    if (v2() && (typeof m.fingerprint !== 'string' || !m.fingerprint || !samePrint(m.fingerprint, meta.fingerprint))) return false;
    if (m.fingerprint && meta.fingerprint && !samePrint(m.fingerprint, meta.fingerprint)) return false;
    return !(art && typeof art.getAttribute === 'function' && art.getAttribute('data-identity') === 'other');
  }
  function inlineMode(host) {
    if (v2() && (!v2Ready() || fixedQuality())) return false;
    if (laserMachine() || !performance() || !host.base || !keyOf(host.meta)) return false;
    if (host.img.id === 'home-job-image' && jobBusy && !liveAllowed(host)) return false;
    return host.failedKey !== keyOf(host.meta);
  }
  function visible(host) { if (v2() && !v2Ready()) return false; var s = host.img.closest ? host.img.closest('.screen') : null; return !s || !s.classList || s.classList.contains('active'); }
  function closeInline(host, reason) { host.glRequest = null; if (host.gl) { var h = host.gl; host.gl = null; h.close(reason || 'view'); } }
  function inline(host) {
    var meta = host.meta, key = keyOf(meta);
    show(host, host.base, null);
    if (host.gl && host.glKey === key) return;
    if (v2() && host.glRequest && host.glKey === key) return;
    // « Agrandir » opened the free view in large: the inline one comes back when it closes.
    if (freeOpen) return;
    closeInline(host);
    if (!visible(host)) return;
    var P = profile(), request = host.glRequest = {};
    host.glKey = key; status(host, t('Chargement de la vue 3D libre…'));
    // v2 inspections use only metadata already attached to the preview. L2 owns
    // enrichment at rest; opening this scene must never trigger a source read.
    var extra = v2() || meta.estimate !== undefined ? Promise.resolve(meta) : sidecar(meta.file).then(function (s) { return s.fingerprint === meta.fingerprint && s.preview ? s.preview : {}; }, function () { return {}; });
    function failed(message) { if (v2() ? host.glRequest !== request : host.glRequest !== request && host.glRequest !== null) return; host.failedKey = key; host.gl = null; refresh(); status(host, message); }
    function loadFailed(e) { failed(t('Vue 3D libre indisponible : ') + String(e && e.message || e) + t('. Vues fixes conservées.')); }
    Promise.all([P.loadAdvanced(['preview-gl.js']), extra]).then(function (r) {
      onFrame(function () {
      if (host.glRequest !== request || !inlineMode(host) || !visible(host)) return;
      gpuEnsure();
      if (host.glRequest !== request || !inlineMode(host) || !visible(host)) return;
      if (!root.CNCPreviewGL) throw new Error(t('module absent'));
      var full = {}; Object.keys(meta).forEach(function (k) { full[k] = meta[k]; });
      if (full.estimate === undefined) full.estimate = r[1].estimate || null;
      var stock = root.CNCProjects && typeof root.CNCProjects.stock === 'function' ? root.CNCProjects.stock(meta.file) : null;
      status(host, '');
      // Suivi: the live view (progress and tool marker; ignored by preview-gl.js without the GPU gate),
      // and the whole program's geometry, read at rest only, never during a job (Q7).
      // Fichiers never follows the machine (spec 2.4).
      var home = host.img.id === 'home-job-image';
      var handle = root.CNCPreviewGL.open(full, { container: host.img.parentNode, stock: stock, live: home ? { progress: true, tool: true } : undefined, fullGeometry: home && !jobBusy && (!v2() || root.cncV2.state().safeIdle), loaded: home,
        onFallback: function (message) { failed(message); },
        onClose: function () { if (host.gl === handle) host.gl = null; if (host.img.cncLiveView === handle) host.img.cncLiveView = null; } });
      if (handle) { host.gl = handle; if (home) host.img.cncLiveView = handle; }
      }, loadFailed);
    }).catch(loadFailed);
  }
  function update(host) {
    if (v2() && (!visible(host) || !v2Ready())) { closeInline(host); return; }
    buttons(host);
    var meta = host.meta, view = current();
    host.key = '';
    if (!host.base) { closeInline(host); host.img.cncView = null; status(host, ''); return; }
    if (inlineMode(host)) { inline(host); return; }
    closeInline(host);
    // A v2 GPU failure keeps the existing fixed image in exactly the same host;
    // do not start the v1 fixed-view worker as a second renderer in this session.
    if (v2()) { show(host, host.base, null); return; }
    if (view === '2d') { show(host, host.base, null); status(host, ''); return; }
    if (view === 'laser') { laser(host); return; }
    // No 3D path (old preview) or no fingerprint (older or unverified sidecar): the 2D image stays.
    var key = keyOf(meta);
    if (!key) {
      show(host, host.base, null);
      status(host, t('Vues 3D indisponibles pour cet ancien aperçu : régénérez-le dans Fichiers.')); return;
    }
    var entry = entryFor(key, meta.file, true), done = entry.views[view];
    host.key = key;
    if (done) { show(host, done.url, { view: view, projection: done.projection }); status(host, ''); background(entry, meta); return; }
    show(host, host.base, null);
    if (entry.failed[view]) { status(host, t('Vue 3D indisponible : ') + entry.failed[view]); return; }
    status(host, t('Calcul de la vue 3D…'));
    request(entry, meta, view, true);
  }
  function refresh() {
    if (!v2()) { hosts.forEach(update); return; }
    if (refreshQueued || !v2Ready()) return;
    refreshQueued = true;
    onFrame(function () { refreshQueued = false; hosts.forEach(update); });
  }

  // ---- Laser view (laser-view.js): computed on demand from the program's text, bound to its fingerprint ----
  var laserJob = null;
  function laser(host) {
    var meta = host.meta, L = root.CNCLaserView;
    if (!meta || !meta.fingerprint || !meta.file) { show(host, host.base, null); status(host, t('Vue laser indisponible : aperçu sans empreinte, régénérez-le dans Fichiers.')); return; }
    if (!L || !root.CNCPreviewInspect) { show(host, host.base, null); status(host, t('Vue laser indisponible sur cette page.')); return; }
    var key = 'laser|' + meta.fingerprint, entry = entryFor(key, meta.file, true), done = entry.views.laser;
    host.key = key;
    if (done) { show(host, done.url, { view: 'laser', projection: done.projection }); status(host, L.describe(done.summary)); return; }
    show(host, host.base, null);
    if (entry.failed.laser) { status(host, t('Vue laser indisponible : ') + entry.failed.laser); return; }
    status(host, t('Calcul de la vue laser…'));
    if (laserJob && laserJob.key === key) return;
    if (laserJob) laserJob.run.cancel();
    var m = null; try { m = profile() && profile().machine(); } catch (_) {}
    var sRef = m && m.laser && m.laser.sMax > 0 ? m.laser.sMax : 0;
    var job = laserJob = { key: key, run: L.render(meta, { sRef: sRef }) };
    job.run.promise.then(function (r) {
      if (laserJob !== job) return;
      laserJob = null; entry.views.laser = { url: root.URL.createObjectURL(r.blob), projection: r.projection, summary: r.summary }; refresh();
    }, function (e) {
      if (laserJob !== job) return;
      laserJob = null; entry.failed.laser = String(e && e.message || e); refresh();
    });
  }

  // ---- Free 3D view (preview-gl.js, Performance profile only, loaded on demand) ----
  function api(method, path, body, blob) {
    return new Promise(function (resolve, reject) {
      var token = ''; try { token = JSON.parse(root.localStorage.getItem('cnc')).state.session.token; } catch (_) {}
      if (!token) { reject(new Error(t('Session CNCjs requise pour lire l’aperçu.'))); return; }
      var apiBase = '/api'; try { apiBase = root.cncState.get().apiBase; } catch (_) {}
      var xhr = new root.XMLHttpRequest(); xhr.open(method, apiBase + '/watch/' + path, true); xhr.timeout = 60000;
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.setRequestHeader('Content-Type', blob ? 'application/octet-stream' : 'application/json');
      xhr.onload = function () { if (xhr.status < 200 || xhr.status >= 300) { reject(new Error(t('Le serveur a refusé la demande (HTTP ') + xhr.status + ').')); return; } try { resolve(xhr.responseText ? JSON.parse(xhr.responseText) : null); } catch (_) { resolve(null); } };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error(t('Serveur inaccessible.'))); };
      xhr.send(blob || (body ? JSON.stringify(body) : null));
    });
  }
  // The stored sidecar of a file ({version, file, fingerprint, preview, …}).
  function sidecar(file) { return api('POST', 'file', { file: file + '.cnctouch.json' }).then(function (r) { var meta = JSON.parse(r && r.data); if (!meta || meta.file !== file) throw new Error(t('Aperçu enregistré illisible.')); return meta; }); }
  var freeOpen = null;
  function openFree(host) {
    var P = profile(), meta = host.meta;
    if (v2() && (!v2Ready() || !visible(host) || fixedQuality())) return;
    if (!performance()) { status(host, t('Vue 3D libre : profil Performance requis (Réglages).')); buttons(host); return; }
    if (!keyOf(meta)) { status(host, t('Vues 3D indisponibles pour cet ancien aperçu : régénérez-le dans Fichiers.')); return; }
    status(host, t('Chargement de la vue 3D libre…'));
    var request = freeOpen = {};
    // The estimate (tools, operations) is not on every image: read from the sidecar when missing.
    var extra = v2() || meta.estimate !== undefined ? Promise.resolve(meta) : sidecar(meta.file).then(function (s) { return s.fingerprint === meta.fingerprint && s.preview ? s.preview : {}; }, function () { return {}; });
    // Left (eco, another screen) while loading: nothing opens and the inline view comes back.
    function drop() { if (freeOpen === request) { freeOpen = null; refresh(); } }
    function loadFailed(e) { if (freeOpen === request) { freeOpen = null; refresh(); status(host, t('Vue 3D libre indisponible : ') + String(e && e.message || e) + t('. Vues fixes conservées.')); } }
    Promise.all([P.loadAdvanced(['preview-gl.js']), extra]).then(function (r) {
      onFrame(function () {
      if (freeOpen !== request) return;
      if (!performance() || !visible(host)) { drop(); return; }
      if (!root.CNCPreviewGL) throw new Error(t('module absent'));
      gpuEnsure();
      var full = {}; Object.keys(meta).forEach(function (k) { full[k] = meta[k]; });
      if (full.estimate === undefined) full.estimate = r[1].estimate || null;
      var stock = root.CNCProjects && typeof root.CNCProjects.stock === 'function' ? root.CNCProjects.stock(meta.file) : null;
      status(host, '');
      var opened = root.CNCPreviewGL.open(full, { stock: stock, onFallback: function (message) { status(host, message); }, onClose: drop });
      if (!opened) drop();
      }, loadFailed);
    }).catch(loadFailed);
  }

  // ---- GPU gate (PERFORMANCE-UI-SPEC.md 2.1, 8.1): Performance profile AND a hardware WebGL probe ----
  // The probe (CNCPreviewGL.probeGpu, in the advanced module) runs once per page, in Performance only,
  // from an idle callback or when a 3D view is opened, never from a cnc-job-status handler. Eco loads
  // nothing, opens no context and answers {checked: true, hardware: false, reason: 'eco'}. The result is
  // kept for the page's life: eco removes the class, Performance puts it back without a new probe.
  // There is no way to force the gate open (no URL parameter, no storage key).
  var gpuProbe = null, gpuLost = false, gpuWaiters = [], gpuIdle = null, gpuSent = '';
  function gpuState() {
    var p = gpuProbe || {};
    var s = { checked: !!gpuProbe, hardware: p.hardware === true, lost: gpuLost, renderer: typeof p.renderer === 'string' ? p.renderer : '', webgl2: p.webgl2 === true, antialias: p.antialias === true,
      lineWidth: Array.isArray(p.lineWidth) && p.lineWidth.length === 2 ? p.lineWidth.slice() : [1, 1], maxTextureSize: typeof p.maxTextureSize === 'number' ? p.maxTextureSize : 0,
      reason: gpuProbe ? (typeof p.reason === 'string' ? p.reason : '') : 'pending' };
    if (!performance()) { s.checked = true; s.hardware = false; s.reason = 'eco'; } else if (s.lost) s.reason = 'context-lost';
    return s;
  }
  function gpuApply() {
    var s = gpuState(), list = document.body && document.body.classList;
    if (list && typeof list.toggle === 'function') { list.toggle('perf-gpu', s.hardware); list.toggle('perf-gpu-lost', s.hardware && s.lost); }
    var signature = JSON.stringify(s);
    if (signature !== gpuSent) {
      gpuSent = signature;
      try { root.dispatchEvent(new root.CustomEvent('cnc-gpu-change', { detail: s })); } catch (_) {}
    }
    if (s.checked && gpuWaiters.length) { var waiting = gpuWaiters; gpuWaiters = []; waiting.forEach(function (fn) { fn(s); }); }
  }
  // Probe now, the module being loaded (a 3D view is opening): the view then decides its rendering.
  function gpuEnsure() {
    if (gpuProbe || !performance() || !root.CNCPreviewGL || typeof root.CNCPreviewGL.probeGpu !== 'function') return;
    try { gpuProbe = root.CNCPreviewGL.probeGpu(document); } catch (_) { gpuProbe = { hardware: false, reason: 'probe-failed' }; }
    gpuApply();
  }
  function gpuSchedule() {
    var P = profile();
    if (gpuProbe || gpuIdle !== null || !performance() || !P || typeof P.loadAdvanced !== 'function') return;
    function run() {
      gpuIdle = null;
      if (gpuProbe || !performance()) return;
      P.loadAdvanced(['preview-gl.js']).then(function () { var first = !gpuProbe; gpuEnsure(); if (first && gpuProbe) refresh(); }, function () {
        // Refused because the profile went back to eco: probed again on the next switch.
        if (performance() && !gpuProbe) { gpuProbe = { hardware: false, reason: 'probe-failed' }; gpuApply(); }
      });
    }
    // Called on window: Chromium refuses a detached requestIdleCallback.
    if (typeof root.requestIdleCallback === 'function') gpuIdle = root.requestIdleCallback(run, { timeout: 3000 });
    else gpuIdle = setTimeout(run, 300);
  }
  root.cncGpu = {
    state: gpuState,
    ready: function () {
      var s = gpuState();
      if (s.checked) return Promise.resolve(s);
      return new Promise(function (resolve) { gpuWaiters.push(resolve); gpuSchedule(); });
    },
    // Internal (preview-gl.js): a view lost its WebGL context. Only ever closes the gate, until a reload.
    _contextLost: function () { if (!gpuLost) { gpuLost = true; gpuApply(); refresh(); } }
  };

  // ---- Export / import of a preview between two servers (Fichiers only) ----
  function exportPreview(host) {
    var meta = host.meta, LP = root.CNCLibraryPreview;
    if (!meta || !meta.file || !LP || !root.CNCDownload) { status(host, t('Export indisponible.')); return; }
    sidecar(meta.file).then(function (s) {
      var data = LP.exportPreview(s);
      root.CNCDownload.save(new root.Blob([JSON.stringify(data)], { type: 'application/json' }), String(s.originalName || meta.file).replace(/\.[^.]*$/, '') + '.apercu-cncjs.json');
      status(host, t('Aperçu exporté (sans réglage machine ni commande).'));
    }).catch(function (e) { status(host, t('Export impossible : ') + e.message); });
  }
  function importPreview(host, fileInput) {
    var meta = host.meta, chosen = fileInput.files && fileInput.files[0], LP = root.CNCLibraryPreview, PI = root.CNCPreviewInspect;
    fileInput.value = '';
    if (!chosen || !meta || !meta.file || !LP || !PI) return;
    if (chosen.size > 8 * 1048576) { status(host, t('Fichier d’aperçu trop volumineux.')); return; }
    status(host, t('Vérification de l’aperçu importé…'));
    var reading = typeof chosen.text === 'function' ? chosen.text() : new Promise(function (resolve, reject) { var r = new root.FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsText(chosen); });
    // The fingerprint of the program on this server, as the server gives it now.
    Promise.all([reading, PI.fetchProgram(meta.file), sidecar(meta.file).catch(function () { return null; })]).then(function (r) {
      var preview = LP.importPreview(String(r[0]), r[1].fingerprint), old = r[2] || {};
      var next = { version: 1, file: meta.file, originalName: typeof old.originalName === 'string' ? old.originalName : meta.file, bytes: old.bytes, fingerprint: r[1].fingerprint, preview: preview, previewVersion: 2, importedAt: new Date().toISOString() };
      if (old.createdAt) next.createdAt = old.createdAt;
      return api('PUT', 'file?file=' + encodeURIComponent(meta.file + '.cnctouch.json'), null, new root.Blob([JSON.stringify(next)], { type: 'application/octet-stream' }));
    }).then(function () {
      status(host, t('✓ Aperçu importé : empreinte du fichier vérifiée.'));
      try { root.dispatchEvent(new root.CustomEvent('cnc-library-preview-updated', { detail: { file: meta.file } })); } catch (_) {}
      var refreshButton = document.getElementById('library-refresh'); if (refreshButton && !refreshButton.disabled) refreshButton.click();
    }).catch(function (e) { status(host, t('Aperçu non importé : ') + e.message); });
  }

  // A host's 2D image changed (another file, a new preview, none): that becomes its base.
  // No image (a file without preview, an image that failed): no view to choose, and the bar
  // would cover the message shown in the image's place (validation D1).
  function visibility(host) { var off = !!host.img.hidden || !host.img.getAttribute('src'), bar = off || inlineMode(host); if (host.bar.hidden !== bar) host.bar.hidden = bar; if (host.transfer && host.transfer.hidden !== off) host.transfer.hidden = off; }
  function observe(host) {
    visibility(host);
    var src = host.img.getAttribute('src') || '';
    if (src === host.shown) return;
    host.base = src && !/^blob:/.test(src) ? src : '';
    host.meta = host.base ? host.img.cncPreview || null : null;
    host.shown = host.base; host.img.cncView = null;
    if (v2()) refresh(); else update(host);
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
    if (VIEWS.indexOf(next) < 0 || next === view || next === 'laser' || laserMachine()) return;
    view = next;
    try { root.localStorage.setItem(STORE, view); } catch (_) {}
    refresh();
  }
  function attach(imageId) {
    var img = document.getElementById(imageId);
    if (!img || !img.parentNode) return;
    var box = img.parentNode, bar = document.createElement('div'), note = document.createElement('p');
    bar.className = 't-seg pv3d-views'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', t('Vue de l’aperçu'));
    var host = { img: img, bar: bar, status: note, buttons: [], base: '', meta: null, shown: null, key: '', free: null };
    VIEWS.forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pv3d-view'; b.setAttribute('data-view', v); b.setAttribute('aria-pressed', 'false');
      b.textContent = LABELS[v]; b.title = TITLES[v]; b.setAttribute('aria-label', TITLES[v]);
      if (v === 'laser') b.hidden = true;
      b.addEventListener('click', function () { choose(v); });
      bar.appendChild(b); host.buttons.push(b);
    });
    var free = document.createElement('button');
    free.type = 'button'; free.className = 'pv3d-view pv3d-free'; free.hidden = true; free.textContent = t('3D libre'); free.title = t('Vue 3D libre (profil Performance)'); free.setAttribute('aria-label', free.title);
    free.addEventListener('click', function () { openFree(host); });
    bar.appendChild(free); host.free = free;
    if (imageId === 'library-image') {
      var transfer = document.createElement('div'), out = document.createElement('button'), into = document.createElement('button'), input = document.createElement('input');
      transfer.className = 'pv3d-transfer';
      out.type = 'button'; out.className = 't-btn t-btn--ghost'; out.textContent = t('Exporter l’aperçu');
      into.type = 'button'; into.className = 't-btn t-btn--ghost'; into.textContent = t('Importer un aperçu…');
      input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
      out.addEventListener('click', function () { exportPreview(host); });
      into.addEventListener('click', function () { if (host.meta) input.click(); });
      input.addEventListener('change', function () { importPreview(host, input); });
      transfer.appendChild(out); transfer.appendChild(into); transfer.appendChild(input);
      host.transfer = transfer;
    }
    note.className = 'pv3d-status'; note.setAttribute('role', 'status'); note.hidden = true;
    box.classList.add('pv3d-host'); box.appendChild(bar);
    // « Agrandir » (preview-viewer.js) over the inline free view opens the free view in large,
    // not the flat image: taken before the button's own listener.
    box.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.preview-open') : null;
      if (!b || !host.gl || !inlineMode(host)) return;
      e.stopPropagation(); e.preventDefault(); openFree(host);
    }, true);
    // Export / import of the preview: in « Détails de l’aperçu » (touch-shell.js), so the preview keeps its height in Fichiers.
    var details = typeof document.querySelector === 'function' ? document.querySelector('#ks-file-info .ks-sheet-content') : null;
    if (host.transfer && details) details.appendChild(host.transfer);
    else if (host.transfer && box.parentNode) box.parentNode.insertBefore(host.transfer, box.nextSibling);
    // Fichiers: the status line goes under the preview (its frame clips what overflows); Suivi keeps it over the image.
    if (imageId === 'library-image' && box.parentNode) { note.classList.add('pv3d-status--below'); box.parentNode.insertBefore(note, box.nextSibling); } else box.appendChild(note);
    hosts.push(host);
    new root.MutationObserver(function () { observe(host); }).observe(img, { attributes: true, attributeFilter: ['src', 'hidden'] });
    observe(host); buttons(host);
  }
  ['library-image', 'home-job-image'].forEach(attach);
  document.addEventListener('visibilitychange', function () {
    if (v2()) { if (document.hidden) suspend('document-hidden'); else refresh(); }
    else if (!document.hidden) pump();
  });
  // The profile changed (eco / performance, CNC / laser): the buttons follow; an open free view closes itself.
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('cnc-profile-change', function () { if (v2() && !performance()) suspend('eco'); gpuApply(); gpuSchedule(); refresh(); });
    // The inline view closes itself on a screen change; it is opened again on the screen now shown.
    root.addEventListener('cnc-screen-change', function () {
      if (v2()) { suspend('screen-hidden'); refresh(); } else setTimeout(refresh, 50);
    });
    root.addEventListener('cnc-screen-lock', function (e) { if (!v2()) return; locked = !!(e && e.detail); if (locked) suspend('lock'); else refresh(); });
    root.addEventListener('cnc-v2-change', function () { if (!v2()) return; if (!v2Ready()) suspend('gate'); else refresh(); });
    root.addEventListener('cnc-v2-data', function (e) {
      if (!v2() || !e.detail || e.detail.slot !== 'inspect') return;
      // A quality notification cannot reattach the provider (attach can notify).
      // Fixed is an explicit visual stop, kept until another explicit choice.
      var fixed = fixedQuality(), changed = false;
      hosts.forEach(function (h) {
        if (!!h.qualityFixed !== fixed) changed = true;
        if (h.qualityFixed && !fixed) h.failedKey = null;
        h.qualityFixed = fixed;
        if (fixed) closeInline(h, 'fixed');
      });
      if (fixed) { freeOpen = null; if (root.CNCPreviewGL && typeof root.CNCPreviewGL.close === 'function') root.CNCPreviewGL.close('fixed'); }
      if (changed) refresh();
    });
    root.addEventListener('pagehide', function () { if (v2()) { ended = true; suspend('pagehide'); } });
    root.addEventListener('cnc-job-status', function (e) {
      var m = e && e.detail && e.detail.machine, busy = !!(m && m.workflow && m.workflow !== 'idle');
      jobMachine = m || null;
      if (busy !== jobBusy) { jobBusy = busy; refresh(); }
    });
  }
  gpuApply(); gpuSchedule();
  root.cncPreviewViews = { view: current, choose: choose, openFree: function (imageId) { var h = hosts.filter(function (x) { return x.img.id === imageId; })[0]; if (h) openFree(h); }, title: function (v) { return TITLES[v] || ''; },
    state: function () { return { worker: workerState, active: active ? active.view + (active.urgent ? '!' : '') : null, idle: idle !== null, queue: queue.map(function (j) { return j.entry.file + ':' + j.view + (j.urgent ? '!' : ''); }) }; }, cached: function () { return cache.map(function (e) { return { key: e.key, file: e.file, views: Object.keys(e.views), failed: e.failed }; }); } };
})(typeof window !== 'undefined' ? window : this);
