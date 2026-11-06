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
  var placementProvider = null, comparisonMode = 'both', invalidatedReads = new WeakSet();
  // This key belongs to L0's deferred JSON catalogue, registered when v2 opens.
  var unknownSource = 'Source inconnue';

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
    if (v2() && (!check().placementData || check().placementData(preview, m).verdict === 'unknown' ||
        !m.operator || m.operator.wcs !== 'G54' || m.operator.reportUnits !== 'mm')) return t('Course non vérifiable : ') + t(unknownSource);
    return verdict(preview, m).text;
  }
  // Pure model of the card for a state (tests, and paint() below).
  function model(m, meta, stock) {
    var ph = phase(m);
    if (ph !== 'idle' || !meta) return { phase: ph, overlays: [], verdict: null, current: null };
    var v = verdict(meta, m);
    return { phase: ph, overlays: overlays(meta, m, v.state, stock), verdict: v, current: current(meta, m) };
  }

  // L2 -> L5/L6, data only. update({machine,preview,declarations}) accepts only
  // the loaded fingerprint. A declaration never verifies a fixture or a collision.
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (k) { freeze(value[k]); }); return Object.freeze(value);
  }
  function unknownPlacement(identity) {
    return { version: 1, available: false, identity: identity || null, current: null, hypothesis: null,
      travel: { verdict: 'unknown', source: null, marginsMm: null, zVerified: false, collisionsVerified: false }, declarations: [] };
  }
  function v2() { return !!root.cncV2 && root.cncV2.gate(); }
  function declared(list, identity) {
    var inspect = root.CNCPreviewInspect, inputs = {};
    if (!inspect || typeof inspect.declarations !== 'function') return [];
    (Array.isArray(list) ? list.slice(0, 64) : []).forEach(function (d) {
      if (!d || ['stock', 'clamp', 'dimension'].indexOf(d.kind) < 0 || ['project', 'operator', 'program'].indexOf(d.source) < 0 ||
          !d.identity || d.identity.key !== identity.key || d.units !== 'mm' || !d.value || typeof d.value !== 'object') return;
      var input = inputs[d.source] || (inputs[d.source] = { identity: d.identity, clamps: [], dimensions: [] });
      if (d.kind === 'stock') { if (!input.stock) input.stock = d.value; }
      else if (d.kind === 'clamp') input.clamps.push(d.value);
      else input.dimensions.push(d.value);
    });
    return inspect.declarations(identity, inputs);
  }
  function placement(input, api) {
    var m = input.machine, meta = input.preview, result = unknownPlacement();
    if (!m || !meta || meta.file !== m.name || !meta.fingerprint || meta.fingerprint !== m.fingerprint) return result;
    var id = api.identity.create({ role: 'loaded', file: m.name, fingerprint: m.fingerprint, controller: m.port, generation: m.generation, revision: m.revision });
    if (!id.jobKey) return result;
    result.identity = id; result.declarations = declared(input.declarations, id);
    var p = meta.projection, op = m.operator || {}, co = m.coordinates || {}, mp = co.mpos || {}, wp = co.wpos || {};
    if (phase(m) !== 'idle' || m.activeState !== 'Idle' || num(m.statusAgeMs) === null || m.statusAgeMs < 0 || m.statusAgeMs > 2500 ||
        op.reportUnits !== 'mm' || op.wcs !== 'G54' || !p || p.units !== 'mm' || p.relativeStart ||
        (p.programWcs && p.programWcs !== op.wcs)) return result;
    if (num(mp.x) === null || num(mp.y) === null || num(wp.x) === null || num(wp.y) === null) return result;
    var z = num(mp.z) !== null && num(wp.z) !== null ? num(mp.z) - num(wp.z) : null;
    result.available = true;
    result.current = { wcs: op.wcs, offsetMm: { x: num(mp.x) - num(wp.x), y: num(mp.y) - num(wp.y), z: z } };
    result.hypothesis = { axes: ['x', 'y'], deltaMm: { x: num(wp.x), y: num(wp.y) }, zUnchanged: true };
    if (check() && check().placementData) result.travel = check().placementData(meta, m);
    return result;
  }
  function installPlacement() {
    var api = root.cncV2;
    if (placementProvider || !v2() || !api.register || !api.identity || (doc && doc.body && doc.body.getAttribute('data-simulation') === 'true')) return;
    var life = api.lifecycle.scope(null, 'placement'), value = freeze(unknownPlacement()), ended = false;
    function reset() { value = freeze(unknownPlacement()); }
    placementProvider = {
      snapshot: function () {
        // safeIdle includes elapsed monotone report age, even with no new event.
        if (!ended && !api.state().safeIdle && value.available) reset();
        return value;
      },
      update: function (input) {
        if (ended || !life.token()) { reset(); return value; }
        input = input || {};
        var m = input.machine, key = m ? JSON.stringify([m.port, m.generation, m.revision, m.name, m.fingerprint]) : null;
        if (!key || key !== api.state().programKey) { reset(); return value; }
        var next = placement(input, api);
        if (input.declarations === undefined && value.identity && next.identity && value.identity.jobKey === next.identity.jobKey) next.declarations = value.declarations;
        var changed = JSON.stringify(next) !== JSON.stringify(value);
        value = freeze(next); if (changed) api.notify('placement'); return value;
      },
      cancel: function () { reset(); },
      dispose: function () { if (ended) return; ended = true; reset(); life.dispose(); }
    };
    api.register('placement', placementProvider);
  }
  // The base path is hidden in v2, and both placements are ordinary overlays.
  // setOverlays() changes neither camera nor fit; no program is loaded again.
  function comparison(mode) {
    if (['both', 'current', 'hypothesis'].indexOf(mode) >= 0 && v2()) { comparisonMode = mode; schedule(); }
    return comparisonMode;
  }
  function compareOverlays(list, all) {
    var both = [{ id: 'current', kind: 'program', translate: [0, 0, 0], colour: 'neutral', width: 'thin' }].concat(list);
    if (all) return both;
    return both.filter(function (o) {
      if (comparisonMode === 'hypothesis') return o.id !== 'current';
      if (comparisonMode === 'current') return ['placed', 'outline', 'stock', 'origin'].indexOf(o.id) < 0;
      return true;
    });
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
  function programKey(m) { return v2() ? JSON.stringify([m.port, m.generation, m.revision, m.name, m.fingerprint]) : [m.name, m.revision === undefined ? '' : m.revision, m.fingerprint || ''].join(':'); }
  function readable(own) {
    return !own.v2 || (v2() && performance() && !doc.hidden && !own.locked && !locked() && own.screenActive &&
      own.closedBy !== 'pagehide' && phase(own.machine) === 'idle' && (!root.cncV2.state || root.cncV2.state().safeIdle));
  }
  function cancelUnavailable() { if (s && s.pending && !readable(s)) s.pending(); }
  function requestPreview(key, name) {
    var own = s, release = function () {}, response = null, finished = false, cancelled = false, aborted = false;
    var dashboard = root.cncDashboardView;
    if (own.pending) own.pending();
    own.metaKey = key;
    var id = ++own.request, lease = own.life ? own.life.token() : null;
    if (own.life && !lease) { own.metaKey = ''; return; }
    function abortRead() {
      if (!response || aborted) return;
      aborted = true;
      // L4 may have no abort API and keep returning the same cached promise.
      // Remember its invalidation across card remounts, without retaining it.
      if (own.v2 && (typeof response === 'object' || typeof response === 'function')) invalidatedReads.add(response);
      // L4 may expose cancellation on this promise or on its accessor. Passing
      // the original promise prevents cancelling a newer/shared cache entry.
      try {
        if (typeof dashboard.cancelLoadedPreview === 'function') dashboard.cancelLoadedPreview(response);
        else if (typeof response.cancel === 'function') response.cancel();
        else if (typeof response.abort === 'function') response.abort();
      } catch (_) { /* Local invalidation still rejects every late answer. */ }
    }
    function releaseRead() { release(); if (own.pending === cancel) own.pending = null; }
    function cancel() {
      if (finished) return;
      finished = true; cancelled = true;
      if (own.request === id) { own.request++; own.metaKey = ''; }
      releaseRead(); abortRead();
    }
    own.pending = cancel;
    if (own.life) release = own.life.track('read', cancel);
    if (finished) return;
    function done(meta) {
      if (finished) return;
      // Recheck elapsed monotone age too: no status event need arrive while the
      // read is pending. Invalidate before accepting any part of the answer.
      if ((own.life && !own.life.valid(lease)) || !readable(own)) { cancel(); return; }
      finished = true; releaseRead();
      if (s !== own || own.request !== id || own.metaKey !== key) return;
      own.meta = meta && typeof meta === 'object' && meta.file === name && (!v2() || (meta.fingerprint && own.machine && meta.fingerprint === own.machine.fingerprint)) ? meta : null; schedule();
    }
    try {
      response = dashboard.loadedPreview();
      // A synchronous accessor may itself dispatch the event that cancelled us.
      if (cancelled) abortRead();
      if (own.v2 && invalidatedReads.has(response)) {
        // Treat this cache entry as a stable absence until its identity changes
        // or a preview update arrives; retrying it every frame would loop.
        response.then(function () {}, function () {}); done(null); return;
      }
      response.then(done, function () { done(null); });
    } catch (_) { done(null); }
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
    handle = root.CNCPreviewGL.open(own.meta, { container: own.view, live: { tool: true }, pathStyle: v2() ? 'hidden' : 'ghost', fit: 'all', overlays: list,
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
    setText(n.verdict, parts.verdict ? parts.verdict.text : ''); setTone(n.verdict, parts.verdict ? parts.verdict.tone : 'neutral');
    setText(n.current, parts.current ? parts.current.text : ''); setTone(n.current, parts.current ? parts.current.tone : 'neutral');
    setText(n.state, parts.state || '');
    setHidden(n.view, !s.handle);
  }
  function paint() {
    if (!s) return;
    s.frame = null;
    var m = s.machine, ph = phase(m), reason = s.failure || unavailable();
    activateV2();
    cancelUnavailable();
    if (s.v2 && (!v2() || doc.hidden || s.locked || locked() || !s.screenActive || s.closedBy === 'pagehide')) {
      closeView();
      // Preparation can retain the card while the layout is held. A closed
      // scene must not leave its previous placement looking verified.
      show({ file: s.file, verdict: { tone: 'neutral', text: t('Vérification suspendue : non suivi') } });
      return;
    }
    if (s.v2 && ph === 'idle' && (!v2() || (root.cncV2.state && !root.cncV2.state().safeIdle) ||
        m.activeState !== 'Idle' || num(m.statusAgeMs) === null || m.statusAgeMs < 0 || m.statusAgeMs > 2500)) ph = 'stale';
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
    var r = model(m, s.meta, v2() ? null : stockOf(s.meta));
    if (v2()) {
      installPlacement();
      if (placementProvider) {
        var placed = placementProvider.update({ machine: m, preview: s.meta });
        var stocks = placed.declarations.filter(function (d) { return d.kind === 'stock'; });
        if (stocks.length) r = model(m, s.meta, stocks[0].value);
      }
      // The legacy verifier defaults an absent $23 to zero. Its rules stay intact;
      // v2 never presents that missing firmware convention as a green placement.
      var data = check().placementData && check().placementData(s.meta, m);
      if (!data || data.verdict === 'unknown') {
        r.overlays = r.overlays.filter(function (o) { return o.id !== 'travel'; }).map(function (o) {
          if (o.id === 'outline') o.colour = 'neutral'; return o;
        });
        if (r.verdict.state === 'ok' || r.verdict.state === 'outside') r.verdict = { state: 'unknown', tone: 'neutral', text: t('Course non vérifiable : ') + t(unknownSource) };
        r.current = { tone: 'neutral', text: t('Origine actuelle : ') + t(unknownSource) };
      }
      var op = m.operator || {}, projection = s.meta.projection || {};
      if (op.reportUnits !== 'mm' || op.wcs !== 'G54' || projection.relativeStart ||
          (projection.programWcs && projection.programWcs !== op.wcs)) r.overlays = [];
      r.allOverlays = compareOverlays(r.overlays, true);
      r.overlays = compareOverlays(r.overlays);
    }
    if (!s.meta.path3d) { closeView(); show({ file: s.file, verdict: r.verdict, current: r.current, state: t('Aperçu sans parcours 3D : régénérez-le dans Fichiers.') }); return; }
    s.last = r.overlays;
    if (s.handle) { var sig = JSON.stringify(r.overlays); if (sig !== s.sent) { s.handle.setOverlays(r.overlays); s.sent = sig; } }
    else if (canOpen()) {
      openView(r.allOverlays || r.overlays);
      if (s.handle && r.allOverlays) { s.handle.setOverlays(r.overlays); s.sent = JSON.stringify(r.overlays); }
    }
    if (s.failure) { paint(); return; }
    show({ file: s.file, legend: true, verdict: r.verdict, current: r.current });
  }
  function on(target, type, fn) { target.addEventListener(type, fn); s.listeners.push([target, type, fn]); }
  function activateV2() {
    if (!s || !v2()) return;
    if (!s.v2) {
      s.v2 = true;
      // A card mounted by v1 may outlive the deferred v2 bootstrap. Its old read
      // has no v2 lease: revoke it before installing this card's new lifecycle.
      if (s.pending) s.pending();
      s.screenActive = !s.screen.classList || s.screen.classList.contains('active');
      s.locked = locked();
      on(root, 'cnc-screen-change', function (e) { s.screenActive = e.detail === 'jog'; cancelUnavailable(); schedule(); });
      on(root, 'pagehide', function () { s.closedBy = 'pagehide'; if (s.pending) s.pending(); });
      on(root, 'cnc-v2-data', function (e) { if (e.detail && e.detail.slot === 'placement') schedule(); });
      if (doc.addEventListener) on(doc, 'visibilitychange', function () { cancelUnavailable(); schedule(); });
    }
    // The gate facade can open before the contract script has finished loading.
    // Acquire one scope as soon as it exists, never retrofit a lease onto a read.
    if (!s.life && root.cncV2.lifecycle) {
      if (s.pending) s.pending();
      s.life = root.cncV2.lifecycle.scope('prepare', 'placement');
    }
  }
  function mount(screen) {
    if (s || !screen || !doc) return;
    installPlacement(); comparisonMode = 'both';
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
      listeners: [], frame: null, handle: null, closing: false, closedBy: '', failure: '', machine: machine, meta: undefined, metaKey: '', request: 0, last: [], sent: '', file: '', v2: false,
      screenActive: !screen.classList || screen.classList.contains('active'), locked: locked(),
      life: null, pending: null };
    on(root, 'cnc-job-status', function (e) {
      var d = e && e.detail || {}; if (d.simulation) return;
      s.machine = d.machine || null;
      activateV2();
      if (s.v2 && (!readable(s) || (s.metaKey && programKey(s.machine) !== s.metaKey))) {
        if (s.pending) s.pending();
        s.request++;
        if (!s.meta) s.metaKey = '';
      }
      // No preview yet (read pending, or answered null) and the state is lost or names another program:
      // that read is not remembered, so the program shown next is asked again, even if it is the same one
      // and even if no frame showed the change. A steady state keeps a genuine null (no read loop).
      if (!s.meta && s.metaKey && (!s.machine || !s.machine.fresh || programKey(s.machine) !== s.metaKey)) s.metaKey = '';
      schedule();
    });
    on(root, 'cnc-gpu-change', schedule);
    on(root, 'cnc-library-preview-updated', function () { s.metaKey = ''; schedule(); });
    on(root, 'cnc-screen-lock', function (e) {
      if (s.v2) { s.locked = !!e.detail; cancelUnavailable(); }
      schedule();
    });
    on(root, 'cnc-v2-change', function () {
      if (!s.v2 && !v2()) return;
      activateV2(); cancelUnavailable(); schedule();
    });
    activateV2();
    if (doc.body && doc.body.classList) doc.body.classList.add('perf-origin');
    schedule();
  }
  function unmount() {
    if (!s) return;
    var own = s;
    closeView();
    if (own.pending) own.pending();
    if (own.life) own.life.dispose();
    if (own.frame !== null) { var caf = root.cancelAnimationFrame || root.clearTimeout; try { caf(own.frame); } catch (_) {} }
    own.listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2]); });
    if (own.card.parentNode) own.card.parentNode.removeChild(own.card);
    if (doc.body && doc.body.classList) doc.body.classList.remove('perf-origin');
    s = null;
    own.listeners = []; own.machine = null; own.meta = null; own.last = []; own.request++;
  }
  root.CNCOriginPreview = { mount: mount, unmount: unmount, hint: hint, model: model, comparison: comparison };
  installPlacement();
})(typeof window !== 'undefined' ? window : this);
