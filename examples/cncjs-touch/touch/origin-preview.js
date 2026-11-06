/* Visual origin in Préparer (Performance UI, lot O; PERFORMANCE-UI-SPEC.md §7, §8.7).
 * Advanced module: injected by cncProfile.loadAdvanced from job-preparation.js only in the wide
 * layout (perf-wide), on a CNC machine, on the real page, while Préparer is visible.
 *
 * It shows, in a 3D view of CNCPreviewGL (lot V's overlay API), where the loaded program would be
 * placed if the X Y work origin were set at the current position: the program and the project
 * stock translated by the current work position, its outline coloured by the travel check of
 * travel-check.js (place(): the same rules as check(), nothing new), the machine travel
 * ($130–$132) and the proposed origin. Z stays at the current origin (Q6).
 *
 * Display only. Nothing here sends anything, sets an origin, moves the machine or ticks a step of
 * the guided preparation: no request of its own (the loaded preview comes from
 * cncDashboardView.loadedPreview()), no click on any control. The cnc-job-status handler only
 * stores the report and asks for one animation frame; drawing is CNCPreviewGL's, in that frame.
 * During a job, a pause or an alarm the view is closed and nothing is read. */
(function (root) {
  'use strict';
  var uiLocale = root.cncI18n || { t: function (s) { return s; } }, t = function (s) { return uiLocale.t(s); };
  var doc = root.document;
  // The stylesheet takes the ?v= of this script (set by loadAdvanced), so both change together.
  var scriptSrc = doc && doc.currentScript && doc.currentScript.src || '', query = /\?[^#]*/.exec(scriptSrc);
  var CSS_HREF = 'origin-preview.css' + (query ? query[0] : '');
  var COLOUR = { ok: 'ok', outside: 'danger', unknown: 'neutral' };

  function num(v) { var n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; }
  // Same format as travel-check.js (one decimal, comma).
  function fmt(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  function check() { return root.CNCTravelCheck && typeof root.CNCTravelCheck.place === 'function' ? root.CNCTravelCheck : null; }
  function laser(m) {
    var p = m && m.machineProfile;
    if (p && typeof p === 'object') return p.kind === 'laser';
    try { return !!root.cncProfile && root.cncProfile.kind() === 'laser'; } catch (_) { return false; }
  }
  function wide() { try { return !!root.cncLayout && root.cncLayout.wide() === true; } catch (_) { return false; } }
  // 'stale' | 'alarm' | 'running' | 'paused' | 'empty' | 'idle'
  function phase(m) {
    if (!m || !m.fresh) return 'stale';
    if (/^alarm/i.test(m.activeState || '')) return 'alarm';
    if (m.workflow === 'paused') return 'paused';
    if (m.workflow && m.workflow !== 'idle') return 'running';
    return m.name ? 'idle' : 'empty';
  }
  // Verdict of travel-check.js for the origin set here in X and Y: {state, tone, text}.
  function verdict(meta, m) {
    var r = check().place(meta, m, { axes: 'xy' });
    if (r.state === 'ok') return { state: 'ok', tone: 'ok', text: t('Si l’origine X Y est posée ici : dans la course machine en X et Y (estimation de la tablette ; Z non vérifié).') };
    if (r.state === 'outside') {
      // The axes check() found outside (its own 0.001 mm margin), written in its format.
      var out = (r.axes || []).filter(function (a) { return a.min < a.low - 0.001 || a.max > a.high + 0.001; });
      return { state: 'outside', tone: 'danger', text: t('Si l’origine X Y est posée ici : hors course en ') + out.map(function (a) {
        return a.axis + ' ' + fmt(a.min) + ' → ' + fmt(a.max) + ' mm (' + t('course ') + fmt(a.low) + ' → ' + fmt(a.high) + ')';
      }).join(' ; ') + '.' };
    }
    var prefix = t('Course machine non vérifiée : '), message = String(r.message || '');
    return { state: 'unknown', tone: 'neutral', text: t('Course non vérifiable : ') + (message.indexOf(prefix) === 0 ? message.slice(prefix.length) : message) };
  }
  // The current origin: the server's travel pre-check when it has one, else check().
  function current(meta, m) {
    var view = root.CNCProgramCheckView, pc = view && m.programCheck ? view.describe(m.programCheck) : null;
    if (pc) return { tone: pc.verdict === 'validated' ? 'ok' : pc.verdict === 'outside' ? 'danger' : 'neutral', text: t('Origine actuelle : ') + pc.summary };
    var r = check().check(meta, m);
    return { tone: r.state === 'ok' ? 'ok' : r.state === 'outside' ? 'danger' : 'neutral', text: t('Origine actuelle : ') + r.message };
  }
  // Overlays (spec §8.3) for a fresh idle report: [] when the work position is not usable.
  function overlays(meta, m, state, stock) {
    var co = m.coordinates || {}, w = co.wpos || {}, wx = num(w.x), wy = num(w.y), list = [];
    if (wx === null || wy === null || (m.operator && m.operator.reportUnits && m.operator.reportUnits !== 'mm')) return list;
    var travel = check().travelBox(m);
    if (travel.known) list.push({ id: 'travel', kind: 'box', frame: 'machine', min: travel.min, max: travel.max, colour: 'neutral', width: 'thin' });
    list.push({ id: 'placed', kind: 'program', translate: [wx, wy, 0], colour: 'info', width: 'thick' });
    var p = meta && meta.projection, b = p && p.units === 'mm' && p.bounds, zb = meta && meta.zBounds;
    if (Array.isArray(b) && b.length === 4 && b.every(function (v) { return num(v) !== null; }) && b[2] >= b[0] && b[3] >= b[1]) {
      var z = Array.isArray(zb) && zb.length === 2 && num(zb[0]) !== null && num(zb[1]) !== null && zb[1] >= zb[0] ? zb : [0, 0];
      list.push({ id: 'outline', kind: 'box', frame: 'work', min: [b[0] + wx, b[1] + wy, z[0]], max: [b[2] + wx, b[3] + wy, z[1]], colour: COLOUR[state] || 'neutral', width: 'thick' });
    }
    // The project stock, assumed at X0 Y0 with its top at Z0 (as preview-inspect.js draws it), moved with the program.
    if (stock && stock.x > 0 && stock.y > 0) {
      var depth = stock.z > 0 ? stock.z : 0;
      list.push({ id: 'stock', kind: 'box', frame: 'work', min: [wx, wy, -depth], max: [wx + stock.x, wy + stock.y, 0], colour: 'stock', width: 'thin' });
    }
    list.push({ id: 'origin', kind: 'marker', frame: 'work', at: [wx, wy, 0], colour: 'info' });
    return list;
  }
  // Last placement, greyed, while the machine state is unavailable.
  function frozen(list) {
    return list.map(function (o) {
      var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; });
      if (o.id === 'placed' || o.id === 'outline' || o.id === 'origin') c.colour = 'neutral';
      return c;
    });
  }
  // The line under the « Origine de travail » step of the guided preparation: the verdict, or ''.
  function hint(m, preview) {
    if (phase(m) !== 'idle' || !preview || !preview.projection || laser(m) || !wide() || !check()) return '';
    return verdict(preview, m).text;
  }
  // Pure model of the card for a state (tests, and paint() below).
  function model(m, meta, stock) {
    var ph = phase(m);
    if (ph !== 'idle' || !meta) return { phase: ph, overlays: [], verdict: null, current: null };
    var v = verdict(meta, m);
    return { phase: ph, overlays: overlays(meta, m, v.state, stock), verdict: v, current: current(meta, m) };
  }

  // ---- Card in Préparer ----
  var s = null;
  function el(tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; if (node.hidden !== !text) node.hidden = !text; }
  function setTone(node, tone) { if (node.getAttribute('data-tone') !== tone) node.setAttribute('data-tone', tone); }
  function setHidden(node, hidden) { if (node.hidden !== hidden) node.hidden = hidden; }
  function unavailable() {
    var gl = root.CNCPreviewGL, dash = root.cncDashboardView;
    if (!gl || typeof gl.open !== 'function' || typeof gl.checkOverlays !== 'function' || !dash || typeof dash.loadedPreview !== 'function' || !check()) return t('module absent');
    try { if (root.cncGpu && root.cncGpu.state().lost) return t('contexte WebGL perdu'); } catch (_) {}
    return '';
  }
  function performance() { try { return root.cncProfile.performance() === 'performance'; } catch (_) { return false; } }
  function locked() { try { return !!root.cncScreenLock && root.cncScreenLock.locked(); } catch (_) { return false; } }
  function schedule() {
    if (!s || s.frame !== null) return;
    var raf = root.requestAnimationFrame || function (fn) { return root.setTimeout(fn, 16); };
    s.frame = raf(paint);
  }
  function closeView() {
    if (!s || !s.handle) return;
    var h = s.handle; s.handle = null; s.closing = true;
    try { h.close('view'); } finally { if (s) s.closing = false; }
  }
  function programKey(m) { return [m.name, m.revision === undefined ? '' : m.revision, m.fingerprint || ''].join(':'); }
  function requestPreview(key, name) {
    var own = s, id = ++own.request;
    function done(meta) {
      if (s !== own || own.request !== id || own.metaKey !== key) return;
      own.meta = meta && typeof meta === 'object' && meta.file === name ? meta : null; schedule();
    }
    try { root.cncDashboardView.loadedPreview().then(done, function () { done(null); }); } catch (_) { done(null); }
  }
  function stockOf(meta) { try { return root.CNCProjects && typeof root.CNCProjects.stock === 'function' ? root.CNCProjects.stock(meta.file) : null; } catch (_) { return null; } }
  function canOpen() {
    var gl = root.CNCPreviewGL;
    if (s.closedBy === 'pagehide' || locked() || !performance()) return false;
    if (s.screen.classList && !s.screen.classList.contains('active')) return false;
    try { return !(gl.active && gl.active()); } catch (_) { return false; }
  }
  function openView(list) {
    var own = s, handle = null;
    own.closedBy = '';
    // Shown before the view opens in it: the view measures its frame once, at open (a hidden frame gave a 1 x 1 px canvas).
    setHidden(own.view, false);
    handle = root.CNCPreviewGL.open(own.meta, { container: own.view, live: { tool: true }, pathStyle: 'ghost', fit: 'all', overlays: list,
      onClose: function (reason) {
        if (own.handle === handle) own.handle = null;
        if (!own.closing) own.closedBy = String(reason || '');
        if (s === own) schedule();
      },
      onFallback: function (message) { own.failure = String(message || '').replace(/[\s.]+$/, ''); if (s === own) schedule(); } });
    if (handle && !own.failure && own.closedBy === '') { own.handle = handle; own.sent = JSON.stringify(list); }
  }
  function show(parts) {
    var n = s.nodes;
    setText(n.file, parts.file || '');
    setHidden(n.legend, !parts.legend);
    setText(n.verdict, parts.verdict ? parts.verdict.text : ''); if (parts.verdict) setTone(n.verdict, parts.verdict.tone);
    setText(n.current, parts.current ? parts.current.text : ''); if (parts.current) setTone(n.current, parts.current.tone);
    setText(n.state, parts.state || '');
    setHidden(n.view, !s.handle);
  }
  function paint() {
    if (!s) return;
    s.frame = null;
    var m = s.machine, ph = phase(m), reason = s.failure || unavailable();
    if (reason) { closeView(); show({ state: t('Vue 3D indisponible : ') + reason + t('. Le contrôle de course reste au chargement et au démarrage.') }); return; }
    if (ph === 'stale') {
      // No preview yet (read pending or answered null, loadedPreview() giving null without a state):
      // asked again when the state comes back, even for the same program.
      if (!s.meta) s.metaKey = '';
      // Frozen and greyed: the last placement stays, nothing new is computed.
      if (s.handle && s.last.length) { var grey = frozen(s.last), key = JSON.stringify(grey); if (key !== s.sent) { s.handle.setOverlays(grey); s.sent = key; } }
      show({ file: s.file, legend: !!s.handle, state: t('État machine indisponible : aperçu figé.') }); return;
    }
    if (ph === 'alarm' || ph === 'running' || ph === 'paused') {
      closeView(); s.last = [];
      show({ state: ph === 'alarm' ? t('Alarme : position machine non garantie, aperçu d’origine suspendu.') : ph === 'paused' ? t('Travail en pause : aperçu d’origine suspendu.') : t('Travail en cours : aperçu d’origine suspendu.') });
      return;
    }
    if (ph === 'empty') { closeView(); s.metaKey = ''; s.meta = undefined; s.last = []; s.file = ''; show({ state: t('Aucun programme chargé : rien à placer.') }); return; }
    var key = programKey(m);
    s.file = m.originalName || m.name;
    if (key !== s.metaKey) { closeView(); s.metaKey = key; s.meta = undefined; s.last = []; requestPreview(key, m.name); }
    if (s.meta === undefined) { show({ file: s.file }); return; }
    if (!s.meta) { closeView(); show({ file: s.file, state: t('Aperçu sans parcours 3D : régénérez-le dans Fichiers.') }); return; }
    var r = model(m, s.meta, stockOf(s.meta));
    if (!s.meta.path3d) { closeView(); show({ file: s.file, verdict: r.verdict, current: r.current, state: t('Aperçu sans parcours 3D : régénérez-le dans Fichiers.') }); return; }
    s.last = r.overlays;
    if (s.handle) { var sig = JSON.stringify(r.overlays); if (sig !== s.sent) { s.handle.setOverlays(r.overlays); s.sent = sig; } }
    else if (canOpen()) openView(r.overlays);
    if (s.failure) { paint(); return; }
    show({ file: s.file, legend: true, verdict: r.verdict, current: r.current });
  }
  function on(target, type, fn) { target.addEventListener(type, fn); s.listeners.push([target, type, fn]); }
  function mount(screen) {
    if (s || !screen || !doc) return;
    if (!doc.getElementById('op-style')) {
      var link = doc.createElement('link'); link.id = 'op-style'; link.rel = 'stylesheet'; link.href = CSS_HREF;
      (doc.head || doc.body).appendChild(link);
    }
    var card = el('section', 'card op-card'); card.id = 'op-card'; card.setAttribute('aria-label', t('Où le programme se placera'));
    var head = el('div', 'op-head'), title = el('h2', '', t('Où le programme se placera')), file = el('span', 'op-file');
    head.appendChild(title); head.appendChild(file); card.appendChild(head);
    var only = el('p', 'op-note op-only', t('Affichage seulement : rien n’est envoyé, aucune origine n’est posée.')); only.setAttribute('data-tone', 'info'); card.appendChild(only);
    var view = el('div', 'op-view'); view.hidden = true; card.appendChild(view);
    var legend = el('p', 'op-legend'); legend.hidden = true;
    [['op-sw-ghost', t('Gris : origine actuelle (G54)')], ['op-sw-placed', t('Bleu : si l’origine X Y est posée ici')], ['op-sw-travel', t('Cadre : course machine ($130–$132)')]].forEach(function (item) {
      var span = el('span'), sw = el('i', 'op-sw ' + item[0]); sw.setAttribute('aria-hidden', 'true');
      span.appendChild(sw); span.appendChild(doc.createTextNode(item[1])); legend.appendChild(span);
    });
    card.appendChild(legend);
    var verdictNode = el('p', 'op-note op-verdict'); verdictNode.setAttribute('role', 'status'); verdictNode.hidden = true; card.appendChild(verdictNode);
    var currentNode = el('p', 'op-note op-current'); currentNode.hidden = true; card.appendChild(currentNode);
    var state = el('p', 'op-note op-state'); state.setAttribute('data-tone', 'neutral'); state.setAttribute('role', 'status'); state.hidden = true; card.appendChild(state);
    screen.appendChild(card);
    var machine = null; try { machine = root.cncState.get().machine || null; } catch (_) {}
    s = { screen: screen, card: card, view: view, nodes: { file: file, legend: legend, verdict: verdictNode, current: currentNode, state: state, view: view },
      listeners: [], frame: null, handle: null, closing: false, closedBy: '', failure: '', machine: machine, meta: undefined, metaKey: '', request: 0, last: [], sent: '', file: '' };
    on(root, 'cnc-job-status', function (e) { var d = e && e.detail || {}; if (d.simulation) return; s.machine = d.machine || null; schedule(); });
    on(root, 'cnc-gpu-change', schedule);
    on(root, 'cnc-library-preview-updated', function () { s.metaKey = ''; schedule(); });
    on(root, 'cnc-screen-lock', schedule);
    if (doc.body && doc.body.classList) doc.body.classList.add('perf-origin');
    schedule();
  }
  function unmount() {
    if (!s) return;
    var own = s;
    closeView();
    if (own.frame !== null) { var caf = root.cancelAnimationFrame || root.clearTimeout; try { caf(own.frame); } catch (_) {} }
    own.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    if (own.card.parentNode) own.card.parentNode.removeChild(own.card);
    if (doc.body && doc.body.classList) doc.body.classList.remove('perf-origin');
    s = null;
    own.listeners = []; own.machine = null; own.meta = null; own.last = []; own.request++;
  }
  root.CNCOriginPreview = { mount: mount, unmount: unmount, hint: hint, model: model };
})(typeof window !== 'undefined' ? window : this);
