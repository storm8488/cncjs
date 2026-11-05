/* Preview analysis on demand: filters of the simplified 3D path, segment
 * inspection (source line, exact programmed values vs simplified geometry),
 * the stock and clamps drawn on previews, and the resume preview (the server's
 * preamble, then the original file from the resume line).
 * Never talks to a controller and never changes the G-code that is sent: the
 * simplified geometry is a drawing, never a measurement.
 * Also runs as a Web Worker (the source index: line offsets and checkpoints of
 * the interpreter, kept for one file fingerprint). */
(function (root) {
  'use strict';
  var isWorker = typeof root.importScripts === 'function' && typeof root.document === 'undefined' && typeof module === 'undefined' && !root.CNCAsLibrary;
  if (typeof root.importScripts === 'function' && !root.CNCMotionEstimate) root.importScripts('motion-estimate.js?v=prof1');
  var ME = typeof module !== 'undefined' && module.exports ? require('./motion-estimate.js') : root.CNCMotionEstimate;
  var uiLocale = (!isWorker && root.cncI18n) || { t: function (s) { return s; }, locale: 'fr-FR' }, t = uiLocale.t;

  // ---------- Filters ----------
  // Tools and operations are offered only when the program names them: T words (two
  // tools at least) or operation comments ("(operation: Pocket)", FreeCAD "(begin operation: …)").
  function offers(index) {
    var tools = [], ops = [];
    ((index && index.tools) || []).forEach(function (e) { if (tools.indexOf(e.tool) < 0) tools.push(e.tool); });
    ((index && index.operations) || []).forEach(function (e) { if (ops.indexOf(e.name) < 0) ops.push(e.name); });
    return { tools: tools.length >= 2 ? tools : [], operations: ops.length >= 1 ? ops : [] };
  }
  // Sender-line ranges [from, to] where a value is active: entries [{key, line}] sorted by line.
  function ranges(entries, key, value, lastLine) {
    var out = [];
    for (var i = 0; i < entries.length; i++) if (entries[i][key] === value) out.push([entries[i].line, i + 1 < entries.length ? entries[i + 1].line - 1 : lastLine || Infinity]);
    return out;
  }
  function inRanges(list, line) { for (var i = 0; i < list.length; i++) if (line >= list[i][0] && line <= list[i][1]) return true; return false; }
  // Visibility of each segment of a decoded path (segment i: point i-1 to point i).
  // filters: {rapids (true: shown), zMin, zMax, lineFrom, lineTo, tool, operation}; index: tools/operations.
  function filterMask(path, filters, index) {
    var n = path.count, mask = new Uint8Array(n), P = path.positions, R = path.rapid, L = path.lines, f = filters || {};
    var zMin = typeof f.zMin === 'number' ? f.zMin : -Infinity, zMax = typeof f.zMax === 'number' ? f.zMax : Infinity;
    var from = typeof f.lineFrom === 'number' ? f.lineFrom : -Infinity, to = typeof f.lineTo === 'number' ? f.lineTo : Infinity;
    var last = n ? L[n - 1] : 0;
    var tool = f.tool !== undefined && f.tool !== null && index ? ranges(index.tools || [], 'tool', f.tool, last) : null;
    var op = f.operation && index ? ranges(index.operations || [], 'name', f.operation, last) : null;
    var shown = 0;
    for (var i = 1; i < n; i++) {
      if (f.rapids === false && R[i]) continue;
      var za = P[i * 3 - 1], zb = P[i * 3 + 2], lo = za < zb ? za : zb, hi = za < zb ? zb : za;
      if (hi < zMin || lo > zMax) continue;
      var line = L[i];
      if (line < from || line > to) continue;
      if (tool && !inRanges(tool, line)) continue;
      if (op && !inRanges(op, line)) continue;
      mask[i] = 1; shown++;
    }
    return { mask: mask, shown: shown, total: Math.max(0, n - 1) };
  }

  // ---------- Inspection ----------
  // Nearest visible segment to a screen point. screen: Float32Array of projected x, y per point
  // (same order as the path); returns {index, distance, t} or null beyond maxDistance pixels.
  function nearestSegment(screen, count, mask, px, py, maxDistance) {
    var best = -1, bestD = (maxDistance || 24) * (maxDistance || 24), bestT = 0;
    for (var i = 1; i < count; i++) {
      if (mask && !mask[i]) continue;
      var ax = screen[i * 2 - 2], ay = screen[i * 2 - 1], bx = screen[i * 2], by = screen[i * 2 + 1];
      var dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy, u = len > 0 ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      var cx = ax + u * dx - px, cy = ay + u * dy - py, d = cx * cx + cy * cy;
      if (d < bestD) { bestD = d; best = i; bestT = u; }
    }
    return best < 0 ? null : { index: best, distance: Math.sqrt(bestD), t: bestT };
  }
  function fmt(v, digits) {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    try { return v.toLocaleString(uiLocale.locale || 'fr-FR', { minimumFractionDigits: digits === undefined ? 3 : digits, maximumFractionDigits: digits === undefined ? 3 : digits }); } catch (_) { return v.toFixed(digits === undefined ? 3 : digits); }
  }
  // Rows for an inspected segment. kind: 'exact' (read from the source line or the program
  // interpreted up to it), 'simplified' (the decimated preview), 'unknown'.
  // source: null, or {raw, after: interpreter state after the line} from the source index.
  function describe(path, index, source, meta) {
    var P = path.positions, i = index, rows = [], line = path.lines[i], tol = meta && typeof meta.tolerance === 'number' ? meta.tolerance : null;
    rows.push({ label: t('Ligne source (numérotation du suivi)'), value: String(line), kind: 'exact' });
    rows.push({ label: t('Type'), value: path.rapid[i] ? t('Rapide G0') : t('Travail G1/G2/G3'), kind: 'simplified' });
    rows.push({ label: t('Point du tracé'), value: 'X ' + fmt(P[i * 3]) + ' · Y ' + fmt(P[i * 3 + 1]) + ' · Z ' + fmt(P[i * 3 + 2]) + ' mm', kind: 'simplified',
      note: t('géométrie simplifiée') + (tol !== null ? ' (± ' + fmt(tol, 3) + ' mm' + (meta && meta.decimated ? t(', points décimés') : '') + ')' : '') });
    if (!source) {
      rows.push({ label: t('Valeurs exactes'), value: t('ligne source non lue'), kind: 'unknown' });
      return rows;
    }
    rows.push({ label: t('Texte de la ligne'), value: String(source.raw || '').slice(0, 200), kind: 'exact' });
    var a = source.after || {};
    if (a.lost) rows.push({ label: t('Fin de ligne programmée'), value: t('inconnue (axes ') + a.lostAxes + t(' après G28/G30/G53/palpage)'), kind: 'unknown' });
    else rows.push({ label: t('Fin de ligne programmée'), value: 'X ' + fmt(a.x) + ' · Y ' + fmt(a.y) + ' · Z ' + fmt(a.z) + ' mm', kind: 'exact', note: t('valeur exacte de la ligne source') });
    rows.push({ label: t('Avance F programmée'), value: a.feed === null || a.feed === undefined ? t('inconnue') : a.inverse ? fmt(a.feed, 1) + t(' (G93, inverse du temps)') : fmt(a.feed, 0) + ' mm/min', kind: a.feed === null || a.feed === undefined ? 'unknown' : 'exact' });
    rows.push({ label: t('Consigne S'), value: a.s === null || a.s === undefined ? t('inconnue') : fmt(a.s, 0) + (a.spindle ? ' · ' + a.spindle : ''), kind: a.s === null || a.s === undefined ? 'unknown' : 'exact' });
    return rows;
  }

  // Source index: sender line -> character offset, and an interpreter checkpoint every 2000 lines.
  function createSourceIndex(text) {
    var checkpoints = [], interp = ME.createInterpreter(null, null), offset = 0, sender = 0;
    while (offset < text.length) {
      var lf = text.indexOf('\n', offset); if (lf < 0) lf = text.length;
      var raw = text.slice(offset, lf);
      if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
      if (raw.trim().length) { sender++; if (sender % 2000 === 1) checkpoints.push({ line: sender, offset: offset, state: interp.snapshot() }); }
      interp.line(raw); offset = lf + 1;
    }
    return { text: text, checkpoints: checkpoints, lines: sender };
  }
  // State after a sender line: {line, raw, before, after}.
  function stateAt(index, line) {
    if (!(line >= 1 && line <= index.lines)) return null;
    var cp = null;
    for (var i = index.checkpoints.length - 1; i >= 0; i--) if (index.checkpoints[i].line <= line) { cp = index.checkpoints[i]; break; }
    var interp = ME.createInterpreter(null, null), before = null;
    interp.restore(cp.state);
    var offset = cp.offset, text = index.text;
    while (offset < text.length) {
      var lf = text.indexOf('\n', offset); if (lf < 0) lf = text.length;
      var raw = text.slice(offset, lf);
      if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
      var nonEmpty = raw.trim().length > 0, current = interp.state().line + (nonEmpty ? 1 : 0);
      if (nonEmpty && current === line) { before = interp.state(); interp.line(raw); return { line: line, raw: raw.trim(), before: before, after: interp.state() }; }
      interp.line(raw); offset = lf + 1;
    }
    return null;
  }

  // ---------- Stock and clamps (indicative) ----------
  var CLAMPS = 'cncjs-touch-clamps-v1';
  function clampValue(c) {
    var keys = ['x', 'y', 'w', 'd', 'h'], out = {};
    for (var i = 0; i < keys.length; i++) {
      var v = typeof c[keys[i]] === 'string' ? Number(String(c[keys[i]]).replace(',', '.')) : c[keys[i]];
      if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 10000) return null;
      out[keys[i]] = v;
    }
    return out.w > 0 && out.d > 0 && out.h > 0 ? out : null;
  }
  function fpKey(fp) { return String(fp || '').toLowerCase().replace(/^sha256:/, ''); }
  function loadClamps(fingerprint, storage) {
    try { var all = JSON.parse(storage.getItem(CLAMPS) || 'null'); var list = all && all.version === 1 && all.files && all.files[fpKey(fingerprint)]; return Array.isArray(list) ? list.map(clampValue).filter(Boolean) : []; } catch (_) { return []; }
  }
  function saveClamps(fingerprint, list, storage) {
    var all;
    try { all = JSON.parse(storage.getItem(CLAMPS) || 'null'); } catch (_) { all = null; }
    if (!all || all.version !== 1 || typeof all.files !== 'object') all = { version: 1, files: {}, order: [] };
    var key = fpKey(fingerprint); if (!key) return false;
    all.files[key] = list.map(clampValue).filter(Boolean).slice(0, 12);
    all.order = (all.order || []).filter(function (k) { return k !== key; }); all.order.push(key);
    while (all.order.length > 50) delete all.files[all.order.shift()];
    try { storage.setItem(CLAMPS, JSON.stringify(all)); return true; } catch (_) { return false; }
  }
  // Boxes to draw: the stock from the project sheet (assumed corner X0 Y0, top at Z0) and the clamps.
  // pathBounds [xmin, ymin, zmin, xmax, ymax, zmax] tells whether the program leaves the assumed stock.
  function overlayBoxes(stock, clamps, pathBounds) {
    var boxes = [], notes = [];
    if (stock && stock.x > 0 && stock.y > 0) {
      var depth = stock.z > 0 ? stock.z : 0;
      boxes.push({ kind: 'stock', min: [0, 0, -depth], max: [stock.x, stock.y, 0] });
      notes.push(t('Brut de la fiche projet, position supposée : coin X0 Y0, dessus à Z0.') + (stock.z > 0 ? '' : ' ' + t('Épaisseur inconnue.')));
      var b = pathBounds;
      if (b && (b[0] < -0.01 || b[1] < -0.01 || b[3] > stock.x + 0.01 || b[4] > stock.y + 0.01)) notes.push(t('Le parcours sort du brut supposé : sa position réelle est probablement différente.'));
    }
    (clamps || []).forEach(function (c) { c = clampValue(c); if (c) boxes.push({ kind: 'clamp', min: [c.x, c.y, 0], max: [c.x + c.w, c.y + c.d, c.h] }); });
    if (boxes.length) notes.push(t('Indicatif : aucune garantie anticollision.'));
    return { boxes: boxes, notes: notes };
  }

  // ---------- Resume preview ----------
  function sameFingerprint(a, b) { return !!a && !!b && fpKey(a) === fpKey(b); }
  // preview: the server's {version:1, fingerprint, fromLine, preamble, kind}; source: {fingerprint, path}
  // (path: decoded path3d or the encoded one). Never recomputes a resume: the preamble is drawn as given.
  function resumePlan(preview, source) {
    if (!preview || typeof preview !== 'object' || preview.version !== 1 || !Array.isArray(preview.preamble) || typeof preview.fromLine !== 'number' || !(preview.fromLine >= 1))
      return { available: false, reason: 'no-preview' };
    if (!source || !sameFingerprint(preview.fingerprint, source.fingerprint)) return { available: false, reason: 'fingerprint' };
    var path = source.path;
    try { if (path && !path.positions) path = root.CNCToolpath3D ? root.CNCToolpath3D.decode(path) : typeof module !== 'undefined' ? require('./toolpath-3d.js').decode(path) : null; } catch (_) { path = null; }
    if (!path || !path.count) return { available: false, reason: 'no-path' };
    var preamble = [], notes = [], first = null, lastPoint = null;
    var interp = ME.createInterpreter(function (mode, ax, ay, az, bx, by, bz, info) {
      if (info.lost) return; // from where the tool is now: unknown
      preamble.push([ax, ay, az, bx, by, bz, mode === 0 ? 1 : 0, info.line]);
      lastPoint = [bx, by, bz];
    }, function (kind, line) {
      if (kind === 'home' || kind === 'machine' || kind === 'probe' || kind === 'frame') notes.push({ kind: kind, line: line });
    }, { unknownStart: true });
    preview.preamble.forEach(function (l) { interp.line(String(l)); });
    var end = interp.state();
    if (!end.lost) lastPoint = [end.x, end.y, end.z];
    if (preamble.length) first = preamble[0].slice(0, 3);
    var start = -1, P = path.positions;
    for (var i = 1; i < path.count; i++) if (path.lines[i] >= preview.fromLine) { start = i; break; }
    if (start < 0) return { available: false, reason: 'line' };
    var junction = [P[start * 3 - 3], P[start * 3 - 2], P[start * 3 - 1]], discontinuities = [];
    if (!lastPoint) discontinuities.push({ kind: 'unknown-end' });
    else {
      var dx = lastPoint[0] - junction[0], dy = lastPoint[1] - junction[1], dz = lastPoint[2] - junction[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var tol = (path.tolerance || source.tolerance || 0.05) * 2 + 0.01;
      if (d > tol) discontinuities.push({ kind: 'junction', distance: d });
    }
    return { available: true, fromLine: preview.fromLine, kind: preview.kind || 'cnc', preamble: preamble, firstKnown: first, preambleEnd: lastPoint, start: start, junction: junction,
      path: path, discontinuities: discontinuities, notes: notes, lines: preview.preamble.length };
  }
  var REASONS = {
    'no-preview': 'Aperçu de reprise indisponible : le serveur n’a pas fourni de préambule.',
    fingerprint: 'Aperçu de reprise indisponible : le fichier a changé (empreinte différente de celle du serveur).',
    'no-path': 'Aperçu de reprise indisponible : régénérez l’aperçu du fichier dans Fichiers.',
    line: 'Aperçu de reprise indisponible : ligne de reprise au-delà du tracé.'
  };
  function reasonText(reason) { return t(REASONS[reason] || REASONS['no-preview']); }
  // Draws a plan (iso projection of toolpath-3d.js) on a 960 x 540 canvas 2D context.
  function drawResume(ctx, plan, overlay) {
    var T3 = root.CNCToolpath3D; if (!T3 || !plan.available) return null;
    var P = plan.path.positions, b = plan.path.bounds.slice();
    plan.preamble.forEach(function (s) { for (var k = 0; k < 3; k++) { b[k] = Math.min(b[k], s[k], s[k + 3]); b[k + 3] = Math.max(b[k + 3], s[k], s[k + 3]); } });
    var proj = T3.projection('iso', b, 1), m = proj.matrix;
    function pt(x, y, z) { return T3.apply(m, x, y, z); }
    ctx.globalAlpha = 1; ctx.fillStyle = T3.colours.background; ctx.fillRect(0, 0, 960, 540); ctx.lineWidth = 1;
    if (overlay) drawBoxes(ctx, overlay.boxes, pt);
    function polyline(from, to, colour, alpha) {
      ctx.strokeStyle = colour; ctx.globalAlpha = alpha; ctx.beginPath();
      var a = pt(P[from * 3 - 3], P[from * 3 - 2], P[from * 3 - 1]); ctx.moveTo(a[0], a[1]);
      for (var i = from; i < to; i++) { var c = pt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); ctx.lineTo(c[0], c[1]); }
      ctx.stroke();
    }
    if (plan.start > 1) polyline(1, plan.start, '#657c8f', 0.35); // lines before the resume: not replayed
    polyline(plan.start, plan.path.count, '#55d6ed', 1);
    ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = '#ffb020';
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([8, 6]);
    ctx.beginPath();
    plan.preamble.forEach(function (s) { var a = pt(s[0], s[1], s[2]), c = pt(s[3], s[4], s[5]); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); });
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    ctx.lineWidth = 1;
    if (plan.discontinuities.length && plan.preambleEnd) {
      var e = pt(plan.preambleEnd[0], plan.preambleEnd[1], plan.preambleEnd[2]), j = pt(plan.junction[0], plan.junction[1], plan.junction[2]);
      ctx.strokeStyle = '#ff3b3b'; ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(j[0], j[1]); ctx.stroke();
    }
    return proj;
  }
  function drawBoxes(ctx, boxes, pt) {
    (boxes || []).forEach(function (box) {
      ctx.strokeStyle = box.kind === 'stock' ? 'rgba(220,200,150,.8)' : 'rgba(255,120,80,.9)'; ctx.globalAlpha = 1;
      if (typeof ctx.setLineDash === 'function') ctx.setLineDash(box.kind === 'stock' ? [4, 4] : []);
      var a = box.min, c = box.max, corners = [];
      for (var i = 0; i < 8; i++) corners.push(pt(i & 1 ? c[0] : a[0], i & 2 ? c[1] : a[1], i & 4 ? c[2] : a[2]));
      var edges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      ctx.beginPath(); edges.forEach(function (e) { ctx.moveTo(corners[e[0]][0], corners[e[0]][1]); ctx.lineTo(corners[e[1]][0], corners[e[1]][1]); }); ctx.stroke();
    });
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
  }

  // ---------- Program text on demand (page only) ----------
  function apiBase() { try { return root.cncState.get().apiBase; } catch (_) { return '/api'; } }
  // The program's bytes and the fingerprint the server gives for them (header X-Program-Fingerprint).
  function fetchProgram(file) {
    return new Promise(function (resolve, reject) {
      var token = ''; try { token = JSON.parse(root.localStorage.getItem('cnc')).state.session.token; } catch (_) {}
      if (!token) { reject(new Error(t('Session CNCjs requise pour lire le fichier.'))); return; }
      var xhr = new root.XMLHttpRequest();
      xhr.open('POST', apiBase() + '/watch/file', true); xhr.timeout = 60000;
      try { xhr.responseType = 'blob'; } catch (_) {}
      xhr.setRequestHeader('Authorization', 'Bearer ' + token); xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status !== 200) { reject(new Error(t('Fichier illisible sur le serveur.'))); return; }
        var fp = ''; try { fp = xhr.getResponseHeader('X-Program-Fingerprint') || ''; } catch (_) {}
        resolve({ blob: xhr.response, fingerprint: fp });
      };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error(t('Serveur inaccessible.'))); };
      xhr.send(JSON.stringify({ file: file }));
    });
  }
  // The JSON envelope of watch/file ({data: text}) read off the interface thread when possible.
  function textOf(blob) {
    return (typeof blob.text === 'function' ? blob.text() : new Promise(function (resolve, reject) { var r = new root.FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = reject; r.readAsText(blob, 'UTF-8'); }))
      .then(function (raw) { var v = JSON.parse(raw); if (!v || typeof v.data !== 'string') throw new Error(t('G-code absent de la réponse du serveur')); return v.data; });
  }
  // Source of a previewed file for inspection, cached by fingerprint in a worker. release() ends it.
  function source(meta, options) {
    options = options || {};
    var worker = null, local = null, ready = null, nextId = 0, waiting = {}, released = false;
    var scriptURL = options.workerURL || WORKER_URL;
    function load() {
      if (ready) return ready;
      ready = (options.fetchProgram || fetchProgram)(meta.file).then(function (res) {
        if (!sameFingerprint(res.fingerprint, meta.fingerprint)) throw new Error(t('Le fichier a changé depuis l’aperçu : valeurs exactes indisponibles.'));
        if (released) throw new Error(t('Annulé'));
        var W = options.Worker || root.Worker;
        if (typeof W === 'function') {
          try { worker = new W(scriptURL); } catch (_) { worker = null; }
        }
        if (worker) {
          worker.onmessage = function (e) { var m = e.data || {}, cb = waiting[m.id]; if (cb) { delete waiting[m.id]; if (m.type === 'error') cb[1](new Error(m.message)); else cb[0](m); } };
          worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); Object.keys(waiting).forEach(function (k) { waiting[k][1](new Error(t('Analyse du fichier interrompue.'))); }); waiting = {}; };
          return call({ type: 'load', blob: res.blob, fingerprint: res.fingerprint });
        }
        return textOf(res.blob).then(function (text) {
          if (text.length > 5 * 1048576) throw new Error(t('Fichier trop grand pour une analyse sans Worker.'));
          local = createSourceIndex(text);
        });
      });
      return ready;
    }
    function call(message) { return new Promise(function (resolve, reject) { message.id = ++nextId; waiting[message.id] = [resolve, reject]; worker.postMessage(message); }); }
    return {
      stateAt: function (line) {
        return load().then(function () {
          if (released) throw new Error(t('Annulé'));
          if (local) return stateAt(local, line);
          return call({ type: 'state', line: line }).then(function (m) { return m.state; });
        });
      },
      release: function () {
        released = true; local = null;
        if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
        Object.keys(waiting).forEach(function (k) { waiting[k][1](new Error(t('Annulé'))); }); waiting = {};
      },
      get active() { return !!worker || !!local; }
    };
  }

  // ---------- Full geometry (Performance UI spec 3.8): the whole program, for the GPU view ----------
  // Interpreted read-only (CNCMotionEstimate's interpreter), arcs cut at a sagitta of 0.01 mm at most.
  // Points as in path3d: point 0 is the program start, each other one the end of a move, with the
  // sender line that reached it and its type (rapid G0 or work). More than `cap` segments: only the
  // count is returned (tooLong), nothing kept. Never sends anything: a drawing, not a measurement.
  var GEOMETRY_CAP = 500000, ARC_TOLERANCE = 0.01;
  function buildGeometry(text, options) {
    options = options || {};
    var cap = options.cap > 0 ? Math.floor(options.cap) : GEOMETRY_CAP, tol = options.tolerance > 0 ? options.tolerance : ARC_TOLERANCE;
    var size = 4096, n = 0, X = new Float32Array(size * 3), L = new Float32Array(size), R = new Uint8Array(size), segments = 0, tooLong = false;
    function point(x, y, z, rapid, line) {
      if (n) segments++;
      if (tooLong) return;
      if (segments > cap) { tooLong = true; return; }
      if (n >= size) {
        size *= 2;
        var X2 = new Float32Array(size * 3), L2 = new Float32Array(size), R2 = new Uint8Array(size);
        X2.set(X); L2.set(L); R2.set(R); X = X2; L = L2; R = R2;
      }
      X[n * 3] = x; X[n * 3 + 1] = y; X[n * 3 + 2] = z; L[n] = line; R[n] = rapid; n++;
    }
    var interp = ME.createInterpreter(function (mode, ax, ay, az, bx, by, bz, info) {
      if (info.lost) return; // start unknown (after G28, G53…): not drawn
      // Program start, or back on known ground after an unknown move: a rapid-flagged start point.
      if (!tooLong && (!n || Math.abs(X[n * 3 - 3] - ax) > 1e-4 || Math.abs(X[n * 3 - 2] - ay) > 1e-4 || Math.abs(X[n * 3 - 1] - az) > 1e-4)) point(ax, ay, az, 1, n ? info.line : 0);
      if (mode >= 2) ME.arcPoints(mode, ax, ay, az, bx, by, bz, info, tol, function (x, y, z) { point(x, y, z, 0, info.line); });
      else point(bx, by, bz, mode === 0 ? 1 : 0, info.line);
    }, null);
    var offset = 0;
    while (offset < text.length) {
      var lf = text.indexOf('\n', offset); if (lf < 0) lf = text.length;
      var raw = text.slice(offset, lf);
      if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
      interp.line(raw); offset = lf + 1;
    }
    if (tooLong) return { tooLong: true, segments: segments };
    return { tooLong: false, segments: Math.max(0, n - 1), count: n, positions: X.slice(0, n * 3), lines: L.slice(0, n), rapid: R.slice(0, n) };
  }
  function geometryBounds(positions, count) {
    var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0; i < count; i++) for (var k = 0; k < 3; k++) { var v = positions[i * 3 + k]; if (v < b[k]) b[k] = v; if (v > b[k + 3]) b[k + 3] = v; }
    return b;
  }
  // Page side: reads the program (fingerprint checked against the preview's), interprets it in a worker,
  // gets the typed arrays back (transferred). {promise, cancel}; the promise gives {tooLong, segments, path}.
  var WORKER_URL = 'preview-inspect.js?v=perfv1';
  function geometry(meta, options) {
    options = options || {};
    var worker = null, done = false, rejectNow = null;
    var promise = new Promise(function (resolve, reject) {
      rejectNow = reject;
      (options.fetchProgram || fetchProgram)(meta.file).then(function (res) {
        if (done) return;
        if (!sameFingerprint(res.fingerprint, meta.fingerprint)) throw new Error(t('Le fichier a changé depuis l’aperçu : géométrie complète indisponible.'));
        var W = options.Worker || root.Worker;
        if (typeof W !== 'function') throw new Error(t('Géométrie complète indisponible sans Worker.'));
        worker = new W(options.workerURL || WORKER_URL);
        worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); finish(); reject(new Error(t('Analyse du fichier interrompue.'))); };
        worker.onmessage = function (e) {
          var m = e.data || {}; finish();
          if (m.type === 'error') { reject(new Error(m.message)); return; }
          if (m.tooLong) { resolve({ tooLong: true, segments: m.segments, path: null }); return; }
          resolve({ tooLong: false, segments: m.segments, path: { count: m.count, positions: m.positions, lines: m.lines, rapid: m.rapid, bounds: geometryBounds(m.positions, m.count), full: true } });
        };
        worker.postMessage({ type: 'geometry', id: 1, blob: res.blob, cap: options.cap || GEOMETRY_CAP, tolerance: ARC_TOLERANCE });
      }).catch(function (e) { finish(); reject(e); });
    });
    function finish() { done = true; if (worker) { worker.onmessage = worker.onerror = null; try { worker.terminate(); } catch (_) {} worker = null; } }
    return { promise: promise, cancel: function () { if (done) return; finish(); rejectNow(new Error(t('Annulé'))); } };
  }

  // ---------- Resume preview in the page ----------
  // show(container, preview, source?): source {fingerprint, path3d} defaults to the program shown in Suivi.
  function show(container, preview, src) {
    if (!container || typeof root.document === 'undefined') return { available: false, reason: 'no-preview' };
    var doc = root.document;
    if (!src) { var img = doc.getElementById('home-job-image'), m = img && img.cncPreview; src = m ? { fingerprint: m.fingerprint, path: m.path3d } : null; }
    else if (src.path3d && !src.path) src = { fingerprint: src.fingerprint, path: src.path3d };
    var plan = resumePlan(preview, src), box = container.querySelector ? container.querySelector('.pv-resume') : null;
    if (!box) { box = doc.createElement('div'); box.className = 'pv-resume'; container.appendChild(box); }
    box.textContent = '';
    var note = doc.createElement('p'); note.className = 'pv-resume-note'; note.setAttribute('role', 'status');
    if (!plan.available) { note.textContent = reasonText(plan.reason); box.appendChild(note); box.setAttribute('data-state', 'unavailable'); return plan; }
    var canvas = doc.createElement('canvas'); canvas.width = 960; canvas.height = 540; canvas.className = 'pv-resume-canvas';
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', t('Aperçu de la reprise'));
    var ctx = canvas.getContext && canvas.getContext('2d');
    var stock = root.CNCProjects && typeof root.CNCProjects.stock === 'function' ? root.CNCProjects.stock() : null;
    var overlay = overlayBoxes(stock, loadClamps(src.fingerprint, root.localStorage), plan.path.bounds);
    if (ctx) drawResume(ctx, plan, overlay);
    box.appendChild(canvas);
    var parts = [t('Pointillés orange : préambule envoyé par le serveur (') + plan.lines + t(' lignes), depuis la position actuelle de l’outil, inconnue ici.'),
      t('Cyan : fichier d’origine à partir de la ligne ') + plan.fromLine + t(' ; gris : lignes non rejouées.'), t('Géométrie simplifiée, indicative.')];
    if (plan.discontinuities.some(function (d) { return d.kind === 'junction'; })) parts.push(t('Discontinuité (trait rouge) entre la fin du préambule et le fichier : vérifiez la reprise.'));
    if (plan.discontinuities.some(function (d) { return d.kind === 'unknown-end'; })) parts.push(t('Fin du préambule inconnue de l’aperçu (axes non redonnés en absolu).'));
    if (plan.notes.length) parts.push(t('Le préambule contient un retour ou un changement de repère : position inconnue de l’aperçu.'));
    parts = parts.concat(overlay.notes);
    note.textContent = parts.join(' ');
    box.appendChild(note); box.setAttribute('data-state', 'ready');
    return plan;
  }
  function hide(container) { var box = container && container.querySelector && container.querySelector('.pv-resume'); if (box && box.parentNode) box.parentNode.removeChild(box); }

  var api = { offers: offers, filterMask: filterMask, nearestSegment: nearestSegment, describe: describe, createSourceIndex: createSourceIndex, stateAt: stateAt,
    clampValue: clampValue, loadClamps: loadClamps, saveClamps: saveClamps, overlayBoxes: overlayBoxes, drawBoxes: drawBoxes,
    resumePlan: resumePlan, drawResume: drawResume, reasonText: reasonText, sameFingerprint: sameFingerprint, fetchProgram: fetchProgram, textOf: textOf, source: source, show: show, hide: hide,
    buildGeometry: buildGeometry, geometry: geometry, GEOMETRY_CAP: GEOMETRY_CAP };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (isWorker) {
    // Worker: one program kept, keyed by its fingerprint.
    var current = null;
    root.onmessage = function (event) {
      var m = event.data || {};
      function fail(e) { root.postMessage({ type: 'error', id: m.id, message: e && e.message || String(e) }); }
      try {
        if (m.type === 'load') {
          if (current && current.fingerprint === m.fingerprint) { root.postMessage({ type: 'loaded', id: m.id, lines: current.index.lines }); return; }
          var reading = typeof m.blob.text === 'function' ? m.blob.text() : Promise.resolve(new root.FileReaderSync().readAsText(m.blob, 'UTF-8'));
          reading.then(function (raw) {
            var v = JSON.parse(raw); if (!v || typeof v.data !== 'string') throw new Error('G-code absent de la réponse du serveur');
            current = { fingerprint: m.fingerprint, index: createSourceIndex(v.data) };
            root.postMessage({ type: 'loaded', id: m.id, lines: current.index.lines });
          }).catch(fail);
        } else if (m.type === 'state') {
          if (!current) throw new Error('Aucun fichier chargé');
          root.postMessage({ type: 'state', id: m.id, state: stateAt(current.index, m.line) });
        } else if (m.type === 'geometry') {
          // The whole program for the GPU view: its own read of the blob, nothing kept in the worker.
          var text = typeof m.blob.text === 'function' ? m.blob.text() : Promise.resolve(new root.FileReaderSync().readAsText(m.blob, 'UTF-8'));
          text.then(function (raw) {
            var v = JSON.parse(raw); if (!v || typeof v.data !== 'string') throw new Error('G-code absent de la réponse du serveur');
            var g = buildGeometry(v.data, { cap: m.cap, tolerance: m.tolerance });
            if (g.tooLong) root.postMessage({ type: 'geometry', id: m.id, tooLong: true, segments: g.segments });
            else root.postMessage({ type: 'geometry', id: m.id, segments: g.segments, count: g.count, positions: g.positions, lines: g.lines, rapid: g.rapid }, [g.positions.buffer, g.lines.buffer, g.rapid.buffer]);
          }).catch(fail);
        } else if (m.type === 'forget') current = null;
      } catch (e) { fail(e); }
    };
    return;
  }
  root.CNCPreviewInspect = api;
  root.cncResumePreview = { show: show, hide: hide, plan: resumePlan };
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
