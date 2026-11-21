/* Performance v2 / L1: visual inspection of borrowed, already available geometry.
 * No source reader, network transport or machine operation belongs to this module.
 * Public data is exactly the L0 inspect snapshot. The additional methods below are
 * local visual adapters, never callbacks in snapshots or cnc-v2-data events.
 *
 * attach(view): camera/restoreCamera, project(x,y,z)->CSS {x,y}, visible(segment),
 *   setInspection, setQuality, measure, stats. The renderer owns its one GL context.
 * update(L2 geometry) / updatePath(decodedPath,facts): borrowed read-only arrays.
 * begin()/pick({x,y,radius})/choose(segment)/end(): purely nominal inspection.
 * setQuality(full|reduced|fixed), diagnose(options), diagnostics(): L6 integration.
 * detach(reason) releases all borrowed arrays and index memory; dispose is terminal.
 */
(function () {
  'use strict';
  var root = window, api = root.cncV2;
  if (!api || !api.gate() || !api.register || !api.lifecycle || !api.identity) return;
  var MAX_SEGMENTS = 500000, LEAF = 8, SLICE_NODES = 256, SLICE_MS = 4;
  var QUERY_NODES = 2048, QUERY_SEGMENTS = 1024, QUERY_MS = 4, CANDIDATES = 8;
  // Lot-owned deferred catalogue: no additional resource or execution on Eco/RT.
  var MESSAGES = [
    ['Examiner', 'Inspect', 'Examinar'],
    ['Inspection visuelle', 'Visual inspection', 'Inspección visual'],
    ['Revenir au direct', 'Return to live view', 'Volver a la vista en directo'],
    ['Loupe · nominal', 'Magnifier · nominal', 'Lupa · nominal'],
    ['Touchez un segment · sélection visuelle uniquement', 'Tap a segment · visual selection only', 'Toque un segmento · selección visual únicamente'],
    ['Index indisponible : préparation au repos requise.', 'Index unavailable: preparation while idle required.', 'Índice no disponible: requiere preparación en reposo.'],
    ['Recherche bornée : rapprochez la vue pour préciser la sélection.', 'Limited search: zoom in to refine the selection.', 'Búsqueda limitada: acerque la vista para precisar la selección.'],
    ['Segments superposés : choisissez lequel examiner.', 'Overlapping segments: choose one to inspect.', 'Segmentos superpuestos: elija cuál examinar.'],
    ['Coordonnées nominales · aucune commande machine', 'Nominal coordinates · no machine command', 'Coordenadas nominales · ninguna orden de máquina'],
    ['Approximation du tracé', 'Approximate toolpath', 'Trayectoria aproximada'],
    ['Parcours nominal', 'Nominal toolpath', 'Trayectoria nominal'],
    ['Segment ', 'Segment ', 'Segmento '],
    ['Ligne ', 'Line ', 'Línea '],
    ['Rendu 3D arrêté : vue fixe conservée.', '3D rendering stopped: fixed view retained.', 'Renderizado 3D detenido: vista fija conservada.'],
    ['Rapide nominal', 'Nominal rapid move', 'Movimiento rápido nominal'],
    ['Travail nominal', 'Nominal cutting move', 'Movimiento de trabajo nominal'],
    ['Tolérance du tracé : ', 'Toolpath tolerance: ', 'Tolerancia de la trayectoria: '],
    ['Tolérance inconnue', 'Unknown tolerance', 'Tolerancia desconocida']
  ];
  function text(key) {
    var language = root.cncI18n && root.cncI18n.language, column = language === 'en' ? 1 : language === 'es' ? 2 : 0;
    for (var i = 0; i < MESSAGES.length; i++) if (MESSAGES[i][0] === key) return MESSAGES[i][column];
    return key;
  }
  var view = null, life = null, geometry = null, source = null, tree = null, base = 0;
  var prepared = false, task = null, taskIsIdle = false, lease = null, untrack = null, unrender = null;
  var active = false, savedCamera = null, selection = null, candidates = [], disposed = false;
  var quality = {mode: 'unknown', dpr: null}, epoch = 0, requestedMode = 'full';
  var measurementEpoch = 0;
  var metrics = {buildSlices: 0, maxBuildSliceMs: 0, queries: 0, lastQueryMs: null, maxQueryMs: 0, lastVisitedNodes: 0, lastTestedSegments: 0, truncated: false};
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function clock() { return root.performance && root.performance.now ? root.performance.now() : Date.now(); }
  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); }); return Object.freeze(value);
  }
  function copy(value) { return value === null || value === undefined ? null : JSON.parse(JSON.stringify(value)); }
  function snapshot() {
    return freeze({version: 1, available: !!view && !!geometry && !disposed, identity: geometry ? geometry.identity : null,
      geometryKey: geometry ? geometry.geometryKey : null, selection: selection,
      quality: {mode: quality.mode, dpr: quality.dpr}});
  }
  function notify() { if (!disposed && api.gate()) api.notify('inspect'); }
  function paintSelection() { if (view && typeof view.setInspection === 'function') view.setInspection(selection); }
  function cancelBuild(drop) {
    epoch++;
    if (task !== null) {
      if (taskIsIdle) root.cancelIdleCallback(task); else root.clearTimeout(task);
    }
    task = null; lease = null;
    if (untrack) { var remove = untrack; untrack = null; remove(); }
    if (drop || !prepared) { tree = null; base = 0; prepared = false; }
  }
  function clearGeometry() {
    cancelBuild(true); geometry = null; source = null; selection = null; candidates = [];
    paintSelection();
  }
  function validGeometry(g) {
    return !!g && g.version === 1 && g.available === true && g.units === 'mm' && g.identity &&
      typeof g.identity.key === 'string' && !!g.identity.key && typeof g.geometryKey === 'string' && !!g.geometryKey &&
      Number.isInteger(g.segmentCount) && g.segmentCount > 0 && g.segmentCount <= MAX_SEGMENTS;
  }
  function component(segment, endpoint, axis) {
    return source.positions[source.local ? (segment + endpoint) * 3 + axis : segment * 6 + endpoint * 3 + axis];
  }
  function sourceLine(segment) { var n = source.lines && source.lines[segment + (source.local ? 1 : 0)]; return finite(n) && n > 0 ? n : null; }
  function passId(segment) { var n = source.passes && source.passes[segment]; return finite(n) ? n : null; }
  function accept(g, s) {
    if (disposed || !api.gate()) return snapshot();
    if (!validGeometry(g) || !s || !s.positions) { clearGeometry(); notify(); return snapshot(); }
    if (geometry && geometry.geometryKey === g.geometryKey && source && source.positions === s.positions && prepared) return snapshot();
    clearGeometry();
    geometry = {identity: freeze(copy(g.identity)), geometryKey: g.geometryKey, quality: g.quality,
      toleranceMm: finite(g.toleranceMm) && g.toleranceMm >= 0 ? g.toleranceMm : null, segmentCount: g.segmentCount};
    source = s; prepare(); notify(); return snapshot();
  }
  function update(g) {
    var b = g && g.buffers, n = g && g.segmentCount;
    var valid = b && b.positions && b.positions.length === n * 6 && b.sourceLines && b.sourceLines.length === n && b.passIds && b.passIds.length === n;
    return accept(valid ? g : null, valid ? {positions: b.positions, lines: b.sourceLines, passes: b.passIds, local: false} : null);
  }
  function updatePath(path, facts) {
    facts = facts || {};
    var n = path && path.count, ok = Number.isInteger(n) && n > 1 && path.positions && path.positions.length === n * 3 && path.lines && path.lines.length === n;
    return accept(ok ? {version: 1, available: true, identity: facts.identity, geometryKey: facts.geometryKey,
      quality: facts.quality, toleranceMm: facts.toleranceMm, segmentCount: n - 1, units: 'mm'} : null,
    ok ? {positions: path.positions, lines: path.lines, passes: facts.passIds || null, mask: facts.mask || null, local: true} : null);
  }
  function prepare() {
    if (!view || !life || !geometry || prepared || task !== null || !api.state().safeIdle) return;
    lease = life.token(); if (!lease) return;
    base = 1; while (base * LEAF < geometry.segmentCount) base *= 2;
    // <= 6 MiB at 500k segments; no duplication or transfer of L2 positions.
    tree = new Float64Array(base * 2 * 6);
    var cursor = base, merging = false, generation = epoch;
    untrack = life.track('read', function () { cancelBuild(false); });
    function queue() {
      taskIsIdle = typeof root.requestIdleCallback === 'function' && typeof root.cancelIdleCallback === 'function';
      task = taskIsIdle ? root.requestIdleCallback(slice, {timeout: 100}) : root.setTimeout(slice, 0);
    }
    function slice(deadline) {
      task = null;
      if (disposed || generation !== epoch || !life || !life.valid(lease)) { cancelBuild(false); return; }
      var started = clock(), steps = 0;
      do {
        var offset = cursor * 6, axis;
        if (!merging) {
          for (axis = 0; axis < 3; axis++) { tree[offset + axis] = Infinity; tree[offset + axis + 3] = -Infinity; }
          var first = (cursor - base) * LEAF, end = Math.min(geometry.segmentCount, first + LEAF);
          for (var segment = first; segment < end; segment++) {
            var usable = true;
            for (axis = 0; axis < 3; axis++) if (!finite(component(segment, 0, axis)) || !finite(component(segment, 1, axis))) usable = false;
            if (!usable) continue;
            for (axis = 0; axis < 3; axis++) {
              var a = component(segment, 0, axis), b = component(segment, 1, axis);
              tree[offset + axis] = Math.min(tree[offset + axis], a, b);
              tree[offset + axis + 3] = Math.max(tree[offset + axis + 3], a, b);
            }
          }
          cursor++;
          if (cursor === base * 2) { merging = true; cursor = base - 1; }
        } else {
          for (axis = 0; axis < 3; axis++) {
            tree[offset + axis] = Math.min(tree[cursor * 12 + axis], tree[cursor * 12 + 6 + axis]);
            tree[offset + axis + 3] = Math.max(tree[cursor * 12 + axis + 3], tree[cursor * 12 + 9 + axis]);
          }
          cursor--;
        }
        steps++;
      } while (cursor > 0 && steps < SLICE_NODES && clock() - started < SLICE_MS && (!deadline || !deadline.timeRemaining || deadline.timeRemaining() > 1));
      metrics.buildSlices++; metrics.maxBuildSliceMs = Math.max(metrics.maxBuildSliceMs, clock() - started);
      if (cursor > 0) { queue(); return; }
      if (!life.valid(lease) || generation !== epoch) { cancelBuild(false); return; }
      prepared = true; lease = null;
      if (untrack) { var remove = untrack; untrack = null; remove(); }
      notify();
    }
    queue();
  }
  function attach(next) {
    if (disposed || !api.gate() || !next || typeof next.project !== 'function') return false;
    if (view !== next) { detach('replaced'); view = next; }
    if (!life) {
      life = api.lifecycle.scope(root.cncShell && root.cncShell.screen ? root.cncShell.screen() : null, 'inspect');
      unrender = life.track('render', function (reason) { detach(reason); });
    }
    if (!view || !life) return false;
    quality = {mode: requestedMode, dpr: null};
    if (typeof view.setQuality === 'function') {
      var effective = view.setQuality(requestedMode);
      if (effective && finite(effective.dpr)) quality.dpr = effective.dpr;
    } else if (typeof view.stats === 'function') { var stats = view.stats(); if (stats && finite(stats.dpr)) quality.dpr = stats.dpr; }
    if (!view || !life) return false;
    prepare(); notify(); return true;
  }
  function begin() {
    if (disposed || !api.gate() || !view || !geometry) return false;
    if (!active) savedCamera = typeof view.camera === 'function' ? copy(view.camera()) : null;
    active = true; return true;
  }
  function end() {
    if (active && view && savedCamera && typeof view.restoreCamera === 'function') view.restoreCamera(savedCamera);
    active = false; savedCamera = null; selection = null; candidates = []; paintSelection(); notify();
  }
  function detach(reason) {
    measurementEpoch++;
    end(); clearGeometry(); view = null;
    if (unrender) { var remove = unrender; unrender = null; remove(); }
    if (life) { var previous = life; life = null; previous.dispose(); }
    quality = {mode: requestedMode === 'fixed' ? 'fixed' : 'unknown', dpr: null};
    notify();
  }
  function projectedBounds(node, project, x, y, radius) {
    var at = node * 6;
    if (!finite(tree[at])) return false;
    var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (var corner = 0; corner < 8; corner++) {
      var p = project(tree[at + (corner & 1 ? 3 : 0)], tree[at + (corner & 2 ? 4 : 1)], tree[at + (corner & 4 ? 5 : 2)]);
      if (!p || !finite(p.x) || !finite(p.y)) return true;
      left = Math.min(left, p.x); right = Math.max(right, p.x); top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
    }
    return x >= left - radius && x <= right + radius && y >= top - radius && y <= bottom + radius;
  }
  function pick(point) {
    point = point || {};
    var started = clock(), nodes = 0, tested = 0, truncated = false, found = [];
    if (!active || !view || !prepared || !geometry || !api.gate() || !finite(point.x) || !finite(point.y)) return {ready: false, candidates: [], truncated: false, visitedNodes: 0, testedSegments: 0, elapsedMs: 0};
    var radius = finite(point.radius) ? Math.max(1, Math.min(64, point.radius)) : 24;
    var project = function (x, y, z) { return view.project(x, y, z); }, stack = [1];
    while (stack.length) {
      if (nodes >= QUERY_NODES || tested >= QUERY_SEGMENTS || clock() - started >= QUERY_MS) { truncated = true; break; }
      var node = stack.pop(); nodes++;
      if (!projectedBounds(node, project, point.x, point.y, radius)) continue;
      if (node < base) { stack.push(node * 2 + 1, node * 2); continue; }
      var first = (node - base) * LEAF, endSegment = Math.min(geometry.segmentCount, first + LEAF);
      for (var segment = first; segment < endSegment; segment++) {
        if (tested >= QUERY_SEGMENTS || clock() - started >= QUERY_MS) { truncated = true; break; }
        tested++;
        if (source.mask && !source.mask[segment + 1]) continue;
        if (typeof view.visible === 'function' && !view.visible(segment)) continue;
        var start = project(component(segment, 0, 0), component(segment, 0, 1), component(segment, 0, 2));
        var finish = project(component(segment, 1, 0), component(segment, 1, 1), component(segment, 1, 2));
        if (!start || !finish || !finite(start.x) || !finite(start.y) || !finite(finish.x) || !finite(finish.y)) continue;
        var dx = finish.x - start.x, dy = finish.y - start.y, length = dx * dx + dy * dy;
        var fraction = length > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
        var sx = start.x + fraction * dx - point.x, sy = start.y + fraction * dy - point.y, distance = Math.sqrt(sx * sx + sy * sy);
        if (distance > radius) continue;
        var nominal = {}, valid = true;
        ['x', 'y', 'z'].forEach(function (axis, j) { nominal[axis] = component(segment, 0, j) + fraction * (component(segment, 1, j) - component(segment, 0, j)); if (!finite(nominal[axis])) valid = false; });
        if (!valid) continue;
        found.push({segment: segment, sourceLine: sourceLine(segment), passId: passId(segment), nominalMm: nominal,
          approximate: geometry.quality !== 'full' || geometry.toleranceMm !== 0, toleranceMm: geometry.toleranceMm, distancePx: distance});
        found.sort(function (a, b) { return a.distancePx - b.distancePx || a.segment - b.segment; });
        if (found.length > CANDIDATES) { found.pop(); truncated = true; }
      }
    }
    if (truncated) found.forEach(function (candidate) { candidate.approximate = true; });
    candidates = found;
    if (found.length === 1 && !truncated) select(found[0]);
    else {
      selection = found.length ? freeze({segment: null, sourceLine: null, passId: null, nominalMm: null,
        approximate: geometry.quality !== 'full' || geometry.toleranceMm !== 0 || truncated, toleranceMm: geometry.toleranceMm,
        candidates: found.map(function (c) { return c.segment; })}) : null;
      paintSelection(); notify();
    }
    var elapsed = clock() - started;
    metrics.queries++; metrics.lastQueryMs = elapsed; metrics.maxQueryMs = Math.max(metrics.maxQueryMs, elapsed);
    metrics.lastVisitedNodes = nodes; metrics.lastTestedSegments = tested; metrics.truncated = truncated;
    return freeze({ready: true, candidates: found.slice(), truncated: truncated, visitedNodes: nodes, testedSegments: tested, elapsedMs: elapsed});
  }
  function select(candidate) {
    selection = freeze({segment: candidate.segment, sourceLine: candidate.sourceLine, passId: candidate.passId,
      nominalMm: copy(candidate.nominalMm), approximate: candidate.approximate, toleranceMm: candidate.toleranceMm,
      candidates: candidates.map(function (c) { return c.segment; })});
    paintSelection(); notify(); return selection;
  }
  function choose(segment) {
    if (!active || !view || !api.gate()) return null;
    for (var i = 0; i < candidates.length; i++) if (candidates[i].segment === segment) return select(candidates[i]);
    return null;
  }
  function setQuality(mode) {
    if (['full', 'reduced', 'fixed'].indexOf(mode) < 0 || disposed || !api.gate()) return false;
    measurementEpoch++; requestedMode = mode; quality = {mode: mode, dpr: null};
    if (view && typeof view.setQuality === 'function') {
      var value = view.setQuality(mode);
      if (value && finite(value.dpr)) quality.dpr = value.dpr;
    }
    notify(); return snapshot().quality;
  }
  function diagnose(options) {
    if (disposed || !api.gate() || !view || typeof view.measure !== 'function') return Promise.resolve({available: false});
    var measuredView = view, generation = ++measurementEpoch;
    return Promise.resolve(view.measure(options || {})).then(function (result) {
      if (!disposed && api.gate() && view === measuredView && generation === measurementEpoch && result && !result.cancelled) {
        var next = result.quality || (typeof view.stats === 'function' && view.stats().quality);
        if (next && ['full', 'reduced', 'fixed'].indexOf(next.mode) >= 0) {
          requestedMode = next.mode; quality = {mode: next.mode, dpr: finite(next.dpr) ? next.dpr : null}; notify();
        }
      }
      return result;
    });
  }
  function diagnostics() {
    return freeze({ready: prepared, active: active, segmentCount: geometry ? geometry.segmentCount : 0,
      indexBytes: tree ? tree.byteLength : 0, pending: task !== null, buildSlices: metrics.buildSlices,
      maxBuildSliceMs: metrics.maxBuildSliceMs, queries: metrics.queries, lastQueryMs: metrics.lastQueryMs,
      maxQueryMs: metrics.maxQueryMs, lastVisitedNodes: metrics.lastVisitedNodes,
      lastTestedSegments: metrics.lastTestedSegments, truncated: metrics.truncated,
      limits: {sliceMs: SLICE_MS, sliceNodes: SLICE_NODES, queryMs: QUERY_MS, queryNodes: QUERY_NODES, querySegments: QUERY_SEGMENTS, candidates: CANDIDATES}});
  }
  function cancel(reason) {
    if (reason === 'job-or-unknown') { cancelBuild(false); return; }
    detach(reason);
  }
  function data(event) {
    var detail = event && event.detail, next = detail && detail.snapshot;
    if (!detail || detail.slot !== 'geometry' || !view || !next) return;
    // A legacy decoded path is an independent drawing with different segment IDs.
    // Its renderer must explicitly adopt L2 buffers before its index may do so.
    if (source && source.local) return;
    if (!next.available) { clearGeometry(); notify(); return; }
    if (geometry && (api.identity.compare(geometry.identity, next.identity) !== 'same' || geometry.identity.jobKey !== (next.identity && next.identity.jobKey))) return;
    update(next);
  }
  function status() { if (!disposed && view && api.gate() && api.state().safeIdle && !prepared) prepare(); }
  function dispose(reason) {
    if (disposed) return;
    detach(reason || 'dispose'); disposed = true;
    root.removeEventListener('cnc-v2-data', data);
    root.removeEventListener('cnc-job-status', status);
  }
  var provider = {owner: 'L1', snapshot: snapshot, update: update, updatePath: updatePath, attach: attach, detach: detach,
    begin: begin, pick: pick, choose: choose, end: end, setQuality: setQuality, diagnose: diagnose, diagnostics: diagnostics,
    cancel: cancel, dispose: dispose, text: text};
  api.register('inspect', provider);
  root.addEventListener('cnc-v2-data', data);
  root.addEventListener('cnc-job-status', status);
})();
