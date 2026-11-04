/* Free 3D view of a preview (Performance profile only). Loaded on demand by
 * cncProfile.loadAdvanced(['preview-gl.js']): never script-tagged, never fetched
 * in the eco profile. A small WebGL1 line renderer of the simplified 3D path
 * (preview.path3d), no three.js: the toolpath is only coloured lines, and three.js
 * (0.103, ~550 KB) is not served to the touch pages.
 *
 * Touch: one finger rotates, two fingers zoom (pinch) and pan, a tap inspects a
 * segment; pointer events stay in the canvas (preventDefault, no propagation),
 * so a camera gesture can never reach a jog control. Drawn on change only, at most
 * 30 frames/s during a gesture, canvas resolution capped (device pixel ratio <= 1.5).
 * Real Z scale by default; an exaggeration is explicit and labelled.
 * Everything is released (GL buffers, program, context, inspection worker, listeners,
 * caches) on closing, on a screen change or when the profile goes back to eco; a
 * missing, failing or lost WebGL context closes the view with a fallback to the
 * fixed views. Nothing here talks to the controller. */
(function (root) {
  'use strict';
  var T3 = root.CNCToolpath3D, PI = root.CNCPreviewInspect;
  if (typeof module !== 'undefined' && module.exports) { T3 = require('./toolpath-3d.js'); PI = require('./preview-inspect.js'); }
  var uiLocale = root.cncI18n || { t: function (s) { return s; }, locale: 'fr-FR' }, t = uiLocale.t;
  var MAX_DPR = 1.5, GESTURE_FRAME_MS = 33, DEG = Math.PI / 180;
  // Software renderer (no WebGL, e.g. the Surface RT): segments drawn during a gesture, the whole path at rest.
  var SOFT_GESTURE_SEGMENTS = 3000;
  var PRESETS = { iso: [45, 35.264], top: [0, 90], front: [0, 0], side: [90, 0] };
  var Z_SCALES = [1, 2, 5, 10];

  function hex(c) { return [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255]; }
  // Screen basis of the camera: yaw (degrees around Z), elevation (0: horizontal, 90: from the top).
  function basis(yaw, pitch) {
    var a = yaw * DEG, e = pitch * DEG;
    return { r: [Math.cos(a), Math.sin(a), 0], u: [-Math.sin(a) * Math.sin(e), Math.cos(a) * Math.sin(e), Math.cos(e)] };
  }
  // Column-major 4x4 for WebGL: clip = M * (p - centre), z scaled by zs. width/height in CSS pixels.
  function matrix(cam, width, height, zs) {
    var b = basis(cam.yaw, cam.pitch), ax = cam.zoom / (width / 2), ay = cam.zoom / (height / 2);
    return new Float32Array([
      b.r[0] * ax, b.u[0] * ay, 0, 0,
      b.r[1] * ax, b.u[1] * ay, 0, 0,
      b.r[2] * ax * zs, b.u[2] * ay * zs, 0, 0,
      cam.panX / (width / 2), cam.panY / (height / 2), 0, 1]);
  }
  // Same projection on the CPU, to screen pixels (origin top left): Float32Array x, y per point.
  function project(positions, count, centre, cam, width, height, zs, out) {
    var b = basis(cam.yaw, cam.pitch), r = b.r, u = b.u, s = out && out.length >= count * 2 ? out : new Float32Array(count * 2);
    for (var i = 0; i < count; i++) {
      var x = positions[i * 3] - centre[0], y = positions[i * 3 + 1] - centre[1], z = (positions[i * 3 + 2] - centre[2]) * zs;
      s[i * 2] = width / 2 + cam.zoom * (r[0] * x + r[1] * y + r[2] * z) + cam.panX;
      s[i * 2 + 1] = height / 2 - (cam.zoom * (u[0] * x + u[1] * y + u[2] * z) + cam.panY);
    }
    return s;
  }
  // Camera fitting the bounds [xmin, ymin, zmin, xmax, ymax, zmax] in the view, for a preset.
  function fit(bounds, preset, width, height, zs) {
    var p = PRESETS[preset] || PRESETS.iso, b = basis(p[0], p[1]), c = centreOf(bounds);
    var r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
    for (var i = 0; i < 8; i++) {
      var x = (i & 1 ? bounds[3] : bounds[0]) - c[0], y = (i & 2 ? bounds[4] : bounds[1]) - c[1], z = ((i & 4 ? bounds[5] : bounds[2]) - c[2]) * zs;
      var sr = b.r[0] * x + b.r[1] * y + b.r[2] * z, su = b.u[0] * x + b.u[1] * y + b.u[2] * z;
      r0 = Math.min(r0, sr); r1 = Math.max(r1, sr); u0 = Math.min(u0, su); u1 = Math.max(u1, su);
    }
    var zoom = 0.88 * Math.min(width / Math.max(1e-6, r1 - r0), height / Math.max(1e-6, u1 - u0));
    if (!isFinite(zoom) || zoom <= 0) zoom = 1;
    return { yaw: p[0], pitch: p[1], zoom: zoom, panX: -zoom * (r0 + r1) / 2, panY: -zoom * (u0 + u1) / 2 };
  }
  function centreOf(b) { return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]; }

  // Interleaved vertices (x, y, z, r, g, b) of the visible segments, the boxes and the axes.
  function buildVertices(path, mask, centre, zmin, boxes, axisLength) {
    var n = path.count, P = path.positions, R = path.rapid, visible = 0, i;
    for (i = 1; i < n; i++) if (!mask || mask[i]) visible++;
    var extra = (boxes ? boxes.length * 12 : 0) + 3, data = new Float32Array((visible + extra) * 12), k = 0;
    var rapid = hex(T3.colours.rapid).map(function (v) { return v * 0.8; }), cache = {};
    function colour(i) {
      if (R[i]) return rapid;
      var c = T3.depthColor(Math.min(P[i * 3 - 1], P[i * 3 + 2]), zmin);
      return cache[c] || (cache[c] = hex(c));
    }
    function vertex(x, y, z, c) { data[k++] = x - centre[0]; data[k++] = y - centre[1]; data[k++] = z - centre[2]; data[k++] = c[0]; data[k++] = c[1]; data[k++] = c[2]; }
    for (i = 1; i < n; i++) {
      if (mask && !mask[i]) continue;
      var c = colour(i);
      vertex(P[i * 3 - 3], P[i * 3 - 2], P[i * 3 - 1], c); vertex(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], c);
    }
    var pathVertices = k / 6;
    (boxes || []).forEach(function (box) {
      var a = box.min, b = box.max, col = box.kind === 'stock' ? [0.86, 0.78, 0.59] : [1, 0.47, 0.31];
      [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(function (e) {
        e.forEach(function (j) { vertex(j & 1 ? b[0] : a[0], j & 2 ? b[1] : a[1], j & 4 ? b[2] : a[2], col); });
      });
    });
    [[1, 0, 0, [1, 0.48, 0.48]], [0, 1, 0, [0.37, 0.89, 0.6]], [0, 0, 1, [0.49, 0.74, 1]]].forEach(function (ax) {
      vertex(0, 0, 0, ax[3]); vertex(ax[0] * axisLength, ax[1] * axisLength, ax[2] * axisLength, ax[3]);
    });
    return { data: data.subarray(0, k), vertices: k / 6, pathVertices: pathVertices, segments: visible };
  }

  var VERTEX = 'attribute vec3 p;attribute vec3 c;uniform mat4 m;varying vec3 v;void main(){gl_Position=m*vec4(p,1.0);v=c;}';
  var FRAGMENT = 'precision mediump float;varying vec3 v;void main(){gl_FragColor=vec4(v,1.0);}';
  // WebGL1 line renderer. Throws when the context cannot be made usable.
  function createRenderer(canvas) {
    var attrs = { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
    var gl = null;
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (_) { gl = null; }
    if (!gl) throw new Error(t('WebGL indisponible sur cette tablette'));
    var program = null, vs = null, fs = null, buffer = null, vertices = 0, released = false;
    function shader(type, source) {
      var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(t('WebGL : shader refusé'));
      return s;
    }
    vs = shader(gl.VERTEX_SHADER, VERTEX); fs = shader(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(t('WebGL : programme refusé'));
    var locP = gl.getAttribLocation(program, 'p'), locC = gl.getAttribLocation(program, 'c'), locM = gl.getUniformLocation(program, 'm');
    buffer = gl.createBuffer();
    return {
      gl: gl,
      upload: function (data) {
        if (released) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); vertices = data.length / 6;
      },
      draw: function (m, width, height) {
        if (released || (gl.isContextLost && gl.isContextLost())) return false;
        gl.viewport(0, 0, width, height); gl.clearColor(0.063, 0.094, 0.125, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(locP); gl.vertexAttribPointer(locP, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(locC); gl.vertexAttribPointer(locC, 3, gl.FLOAT, false, 24, 12);
        gl.uniformMatrix4fv(locM, false, m); gl.drawArrays(gl.LINES, 0, vertices);
        return gl.getError ? gl.getError() === gl.NO_ERROR : true;
      },
      release: function () {
        if (released) return; released = true;
        try {
          if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program); if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs);
          var lose = gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        } catch (_) {}
        buffer = program = vs = fs = null; gl = null;
      },
      get released() { return released; }
    };
  }
  // Canvas 2D line renderer with the same interface, for a browser without WebGL: the vertices are
  // projected on the CPU with the same matrix; during a gesture only every n-th segment is drawn
  // (at most SOFT_GESTURE_SEGMENTS), the whole path when the finger is lifted.
  function create2DRenderer(canvas) {
    var g = null;
    try { g = canvas.getContext('2d', { alpha: false }); } catch (_) { g = null; }
    if (!g) throw new Error(t('WebGL et Canvas 2D indisponibles sur cette tablette'));
    var data = null, vertices = 0, released = false, styles = {};
    function style(i) {
      var key = Math.round(data[i * 6 + 3] * 255) + ',' + Math.round(data[i * 6 + 4] * 255) + ',' + Math.round(data[i * 6 + 5] * 255);
      return styles[key] || (styles[key] = 'rgb(' + key + ')');
    }
    return {
      software: true,
      upload: function (d) { if (!released) { data = d; vertices = d.length / 6; } },
      draw: function (m, width, height, coarse) {
        if (released || !data) return !released;
        g.fillStyle = '#101820'; g.fillRect(0, 0, width, height);
        g.lineWidth = 1;
        var segments = vertices / 2, step = coarse ? Math.max(1, Math.ceil(segments / SOFT_GESTURE_SEGMENTS)) : 1, current = '', open = false;
        var hw = width / 2, hh = height / 2;
        for (var s = 0; s < segments; s += step) {
          var a = s * 2, b = a + 1, c = style(a);
          if (c !== current) { if (open) g.stroke(); g.strokeStyle = c; g.beginPath(); current = c; open = true; }
          var ax = data[a * 6], ay = data[a * 6 + 1], az = data[a * 6 + 2], bx = data[b * 6], by = data[b * 6 + 1], bz = data[b * 6 + 2];
          g.moveTo((m[0] * ax + m[4] * ay + m[8] * az + m[12] + 1) * hw, (1 - (m[1] * ax + m[5] * ay + m[9] * az + m[13])) * hh);
          g.lineTo((m[0] * bx + m[4] * by + m[8] * bz + m[12] + 1) * hw, (1 - (m[1] * bx + m[5] * by + m[9] * bz + m[13])) * hh);
        }
        if (open) g.stroke();
        return true;
      },
      release: function () { released = true; data = null; styles = {}; g = null; },
      get released() { return released; }
    };
  }

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function number(text) { var s = String(text || '').trim().replace(',', '.'); if (!s) return null; var v = Number(s); return isFinite(v) ? v : NaN; }
  function fmt(v, d) { try { return v.toLocaleString(uiLocale.locale || 'fr-FR', { maximumFractionDigits: d === undefined ? 3 : d }); } catch (_) { return String(v); } }

  var current = null;
  // Opens the free view over the page. meta: {file, fingerprint, path3d, zBounds, estimate};
  // options: {document, window, onClose(reason), onFallback(message), source (inspection), storage, stock,
  // container}: with a container the view is drawn inside it (the preview frame) instead of over the page.
  function open(meta, options) {
    options = options || {};
    var win = options.window || root, doc = options.document || win.document;
    if (current) current.close('replaced');
    var listeners = [], frame = null, lastFrame = 0, gesture = false, closed = false, renderer = null, path = null, mask = null, screen = null, screenKey = '';
    var zs = 1, cam = null, width = 0, height = 0, dpr = 1, centre = [0, 0, 0], bounds = null, src = null, inspected = -1, filters = { rapids: true };
    var pointers = {}, start = null, restoreBackground = null;
    function on(target, type, fn, opts) { target.addEventListener(type, fn, opts || false); listeners.push([target, type, fn, opts || false]); }
    function fail(message) { close('fallback'); if (options.onFallback) options.onFallback(message); }
    try { path = T3.decode(meta && meta.path3d); } catch (e) { if (options.onFallback) options.onFallback(t('Vue 3D libre indisponible : ') + e.message); return null; }
    bounds = path.bounds.slice();
    var zb = meta.zBounds; if (Array.isArray(zb) && zb.length === 2) { bounds[2] = Math.min(bounds[2], zb[0], 0); bounds[5] = Math.max(bounds[5], zb[1], 0); }
    centre = centreOf(bounds);
    var index = meta.estimate ? { tools: meta.estimate.tools || [], operations: meta.estimate.operations || [] } : null, offered = PI.offers(index);
    var storage = options.storage || win.localStorage, clamps = PI.loadClamps(meta.fingerprint, storage), stock = options.stock || null, overlay = PI.overlayBoxes(stock, clamps, bounds);

    // ---- DOM ----
    var inline = !!options.container;
    var dialog = el(doc, 'div', inline ? 'pgl-dialog pgl-inline' : 'pgl-dialog'); dialog.setAttribute('aria-label', t('Vue 3D libre'));
    if (!inline) { dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); }
    var head = el(doc, 'header', 'pgl-head'), title = el(doc, 'h2', '', t('Vue 3D libre')), file = el(doc, 'p', 'pgl-file', meta.originalName || meta.file || '');
    var closeButton = el(doc, 'button', 't-btn t-btn--ghost pgl-close', t('Fermer ×')); closeButton.type = 'button';
    head.appendChild(title); head.appendChild(file); head.appendChild(closeButton); dialog.appendChild(head);
    var tools = el(doc, 'div', 'pgl-tools t-seg'); tools.setAttribute('role', 'group');
    var presetButtons = {};
    // Inline (small frame): the camera buttons fold behind « Vues » so the drawing keeps the frame.
    var fold = null;
    if (inline) {
      fold = el(doc, 'button', 'pgl-fold', t('Vues')); fold.type = 'button'; fold.setAttribute('aria-expanded', 'false'); fold.setAttribute('aria-label', t('Vues de la caméra'));
      tools.appendChild(fold); tools.classList.add('is-folded');
      on(fold, 'click', function () { var open = tools.classList.contains('is-folded'); tools.classList.toggle('is-folded', !open); fold.setAttribute('aria-expanded', String(open)); });
    }
    function refold() { if (fold) { tools.classList.add('is-folded'); fold.setAttribute('aria-expanded', 'false'); } }
    [['iso', t('Iso')], ['top', t('Dessus')], ['front', t('Face')], ['side', t('Côté')]].forEach(function (p) {
      var b = el(doc, 'button', 'pgl-preset', p[1]); b.type = 'button'; b.setAttribute('data-preset', p[0]); tools.appendChild(b); presetButtons[p[0]] = b;
      on(b, 'click', function () { cam = fit(bounds, p[0], width || 1, height || 1, zs); invalidate(); refold(); });
    });
    var recentre = el(doc, 'button', 'pgl-recentre', t('Recentrer')); recentre.type = 'button'; tools.appendChild(recentre);
    var zButton = el(doc, 'button', 'pgl-zscale', ''); zButton.type = 'button'; tools.appendChild(zButton);
    dialog.appendChild(tools);
    var stage = el(doc, 'div', 'pgl-stage'), canvas = el(doc, 'canvas', 'pgl-canvas');
    canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', t('Parcours en 3D, un doigt pour tourner, deux pour zoomer et déplacer, un appui pour inspecter'));
    if (canvas.style) canvas.style.touchAction = 'none';
    stage.appendChild(canvas); dialog.appendChild(stage);
    var side = el(doc, 'div', 'pgl-side'); dialog.appendChild(side);
    // Filters
    var filterBox = el(doc, 'fieldset', 'pgl-filters'), legend = el(doc, 'legend', '', t('Filtres')); filterBox.appendChild(legend);
    var rapidToggle = el(doc, 'button', 'pgl-toggle', t('Rapides G0 : affichés')); rapidToggle.type = 'button'; rapidToggle.setAttribute('aria-pressed', 'true'); filterBox.appendChild(rapidToggle);
    function field(label) { var w = el(doc, 'label', 'pgl-field'), s = el(doc, 'span', '', label), i = el(doc, 'input', ''); i.type = 'text'; i.setAttribute('inputmode', 'decimal'); w.appendChild(s); w.appendChild(i); filterBox.appendChild(w); return i; }
    var zMinInput = field(t('Z min (mm)')), zMaxInput = field(t('Z max (mm)')), fromInput = field(t('Ligne de')), toInput = field(t('Ligne à'));
    function select(label, values, format) {
      if (!values.length) return null;
      var w = el(doc, 'label', 'pgl-field'), s = el(doc, 'span', '', label), sel = el(doc, 'select', '');
      var all = el(doc, 'option', '', t('Tous')); all.value = ''; sel.appendChild(all);
      values.forEach(function (v) { var o = el(doc, 'option', '', format(v)); o.value = String(v); sel.appendChild(o); });
      w.appendChild(s); w.appendChild(sel); filterBox.appendChild(w); return sel;
    }
    var toolSelect = select(t('Outil (mots T du programme)'), offered.tools, function (v) { return 'T' + v; });
    var opSelect = select(t('Opération (commentaires du programme)'), offered.operations, function (v) { return v; });
    var apply = el(doc, 'button', 't-btn pgl-apply', t('Appliquer les filtres')); apply.type = 'button'; filterBox.appendChild(apply);
    var count = el(doc, 'p', 'pgl-count'); count.setAttribute('role', 'status'); filterBox.appendChild(count);
    var filterError = el(doc, 'p', 'pgl-error'); filterBox.appendChild(filterError);
    side.appendChild(filterBox);
    // Inspection
    var inspect = el(doc, 'section', 'pgl-inspect'); inspect.appendChild(el(doc, 'h3', '', t('Inspection')));
    var rows = el(doc, 'dl', 'pgl-rows'), hint = el(doc, 'p', 'pgl-hint', t('Touchez un segment pour lire sa ligne source.'));
    inspect.appendChild(hint); inspect.appendChild(rows); side.appendChild(inspect);
    // Clamps (indicative)
    var clampBox = el(doc, 'fieldset', 'pgl-clamps'); clampBox.appendChild(el(doc, 'legend', '', t('Brides (saisie manuelle)')));
    var clampList = el(doc, 'ul', 'pgl-clamp-list'); clampBox.appendChild(clampList);
    var clampInputs = {};
    [['x', t('X (mm)')], ['y', t('Y (mm)')], ['w', t('Largeur X (mm)')], ['d', t('Profondeur Y (mm)')], ['h', t('Hauteur (mm)')]].forEach(function (f) {
      var w = el(doc, 'label', 'pgl-field'), s = el(doc, 'span', '', f[1]), i = el(doc, 'input', ''); i.type = 'text'; i.setAttribute('inputmode', 'decimal'); w.appendChild(s); w.appendChild(i); clampBox.appendChild(w); clampInputs[f[0]] = i;
    });
    var addClamp = el(doc, 'button', 't-btn t-btn--ghost', t('Ajouter la bride')); addClamp.type = 'button'; clampBox.appendChild(addClamp);
    var overlayNote = el(doc, 'p', 'pgl-overlay-note'); clampBox.appendChild(overlayNote);
    side.appendChild(clampBox);
    var foot = el(doc, 'p', 'pgl-foot', t('Géométrie simplifiée (') + path.count + t(' points, tolérance ') + fmt(meta.path3d.tolerance || 0) + ' mm' + (meta.path3d.decimated ? t(', points décimés') : '') + t(') : dessin indicatif, jamais envoyé à la machine.'));
    dialog.appendChild(foot);
    if (inline) options.container.appendChild(dialog);
    else {
      doc.body.appendChild(dialog);
      if (win.CNCStripGuard && typeof win.CNCStripGuard.isolate === 'function') restoreBackground = win.CNCStripGuard.isolate(dialog);
    }

    // ---- GL ----
    // WebGL first; without it (Surface RT kiosk), the Canvas 2D renderer: slower, lighter while turning.
    try { renderer = createRenderer(canvas); } catch (e) {
      try { renderer = create2DRenderer(canvas); } catch (e2) { fail(t('Vue 3D libre indisponible : ') + e2.message + t('. Vues fixes conservées.')); return null; }
    }
    on(canvas, 'webglcontextlost', function () { fail(t('Contexte WebGL perdu : vue 3D libre fermée, vues fixes conservées.')); });

    // Inline (small frame): a short label, the exaggeration still named.
    function zLabel() { zButton.textContent = zs === 1 ? (inline ? 'Z ×1' : t('Z ×1 (échelle réelle)')) : 'Z ×' + zs + t(' (exagéré)'); zButton.setAttribute('data-exaggerated', String(zs !== 1)); }
    function upload() {
      overlay = PI.overlayBoxes(stock, clamps, bounds);
      var diag = Math.sqrt(Math.pow(bounds[3] - bounds[0], 2) + Math.pow(bounds[4] - bounds[1], 2)) || 10;
      var built = buildVertices(path, mask, centre, bounds[2], overlay.boxes, diag * 0.08);
      renderer.upload(built.data);
      count.textContent = built.segments + ' / ' + Math.max(0, path.count - 1) + t(' segments affichés');
      overlayNote.textContent = overlay.notes.join(' ');
      clampList.textContent = '';
      clamps.forEach(function (c, i) {
        var li = el(doc, 'li', '', 'X ' + fmt(c.x) + ' Y ' + fmt(c.y) + ' · ' + fmt(c.w) + ' × ' + fmt(c.d) + ' × ' + fmt(c.h) + ' mm');
        var rm = el(doc, 'button', 't-btn t-btn--ghost', t('Retirer')); rm.type = 'button';
        on(rm, 'click', function () { clamps.splice(i, 1); PI.saveClamps(meta.fingerprint, clamps, storage); upload(); invalidate(); });
        li.appendChild(rm); clampList.appendChild(li);
      });
    }
    function resize() {
      var rect = stage.getBoundingClientRect ? stage.getBoundingClientRect() : { width: 800, height: 450 };
      var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
      dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1);
      if (w !== width || h !== height) {
        var first = !width; width = w; height = h;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        if (canvas.style) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
        if (first || !cam) cam = fit(bounds, 'iso', width, height, zs);
      }
      invalidate();
    }
    function paint(now) {
      frame = null; if (closed) return;
      now = typeof now === 'number' ? now : Date.now();
      // During a gesture: at most one frame every 33 ms.
      if (gesture && now - lastFrame < GESTURE_FRAME_MS) { frame = win.requestAnimationFrame(paint); return; }
      lastFrame = now;
      if (!renderer.draw(matrix(cam, width, height, zs), canvas.width, canvas.height, gesture)) fail(t('Erreur WebGL : vue 3D libre fermée, vues fixes conservées.'));
    }
    function invalidate() { if (!closed && frame === null) frame = win.requestAnimationFrame(paint); }

    // ---- Gestures: kept in the canvas ----
    function stop(e) { if (e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
    function ids() { return Object.keys(pointers); }
    on(canvas, 'pointerdown', function (e) {
      stop(e);
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      gesture = true;
      start = ids().length === 1 ? { x: e.clientX, y: e.clientY, at: Date.now(), moved: 0 } : null;
    });
    on(canvas, 'pointermove', function (e) {
      var p = pointers[e.pointerId]; if (!p) return;
      stop(e);
      var list = ids();
      if (list.length === 1) {
        var dx = e.clientX - p.x, dy = e.clientY - p.y;
        cam.yaw -= dx * 0.4; cam.pitch = Math.max(-89, Math.min(90, cam.pitch + dy * 0.4));
        if (start) start.moved += Math.abs(dx) + Math.abs(dy);
      } else if (list.length === 2) {
        var other = pointers[list[0] === String(e.pointerId) ? list[1] : list[0]];
        var before = Math.sqrt(Math.pow(p.x - other.x, 2) + Math.pow(p.y - other.y, 2)), after = Math.sqrt(Math.pow(e.clientX - other.x, 2) + Math.pow(e.clientY - other.y, 2));
        if (before > 4 && after > 4) zoomAt((e.clientX + other.x) / 2, (e.clientY + other.y) / 2, after / before);
        cam.panX += (e.clientX - p.x) / 2; cam.panY -= (e.clientY - p.y) / 2;
      }
      p.x = e.clientX; p.y = e.clientY; invalidate();
    });
    function up(e) {
      if (!pointers[e.pointerId]) return;
      stop(e);
      delete pointers[e.pointerId];
      if (!ids().length) {
        gesture = false;
        if (e.type === 'pointerup' && start && start.moved < 8 && Date.now() - start.at < 500) tap(e);
        start = null; invalidate();
      } else start = null;
    }
    on(canvas, 'pointerup', up); on(canvas, 'pointercancel', up); on(canvas, 'lostpointercapture', up);
    on(canvas, 'wheel', function (e) { stop(e); var r = canvas.getBoundingClientRect(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15, r); invalidate(); }, { passive: false });
    // Also stop the touch and mouse events some browsers send next to pointer events.
    ['touchstart', 'touchmove', 'touchend', 'mousedown', 'click', 'contextmenu'].forEach(function (type) { on(canvas, type, stop, { passive: false }); });
    function zoomAt(clientX, clientY, factor, rect) {
      rect = rect || canvas.getBoundingClientRect();
      var px = clientX - rect.left - width / 2, py = -(clientY - rect.top - height / 2), z = Math.max(1e-4, Math.min(1e6, cam.zoom * factor)), k = z / cam.zoom;
      cam.panX = px - (px - cam.panX) * k; cam.panY = py - (py - cam.panY) * k; cam.zoom = z;
    }
    function tap(e) {
      var rect = canvas.getBoundingClientRect(), key = [cam.yaw, cam.pitch, cam.zoom, cam.panX, cam.panY, zs, width, height].join(',');
      if (screenKey !== key) { screen = project(path.positions, path.count, centre, cam, width, height, zs, screen); screenKey = key; }
      var hit = PI.nearestSegment(screen, path.count, mask, e.clientX - rect.left, e.clientY - rect.top, 24);
      showInspection(hit ? hit.index : -1);
    }
    function showRows(list) {
      rows.textContent = '';
      list.forEach(function (r) {
        var dt = el(doc, 'dt', '', r.label), dd = el(doc, 'dd', '', r.value);
        dd.setAttribute('data-kind', r.kind);
        if (r.note) dd.appendChild(el(doc, 'small', 'pgl-note', ' — ' + r.note));
        rows.appendChild(dt); rows.appendChild(dd);
      });
    }
    function showInspection(i) {
      inspected = i;
      if (i < 0) { hint.textContent = t('Aucun segment à cet endroit.'); rows.textContent = ''; return; }
      hint.textContent = t('Lecture de la ligne source…');
      showRows(PI.describe(path, i, null, meta.path3d));
      if (!src) src = options.source || PI.source(meta, options.sourceOptions);
      var line = path.lines[i];
      src.stateAt(line).then(function (state) {
        if (closed || inspected !== i) return;
        hint.textContent = state ? t('Valeurs exactes lues dans la ligne source ; le point du tracé reste simplifié.') : t('Ligne source introuvable.');
        showRows(PI.describe(path, i, state, meta.path3d));
      }, function (err) { if (!closed && inspected === i) hint.textContent = err.message; });
    }

    // ---- Controls ----
    on(closeButton, 'click', function () { close('user'); });
    on(recentre, 'click', function () { cam = fit(bounds, 'iso', width, height, zs); invalidate(); });
    on(zButton, 'click', function () { zs = Z_SCALES[(Z_SCALES.indexOf(zs) + 1) % Z_SCALES.length]; zLabel(); screenKey = ''; invalidate(); });
    on(rapidToggle, 'click', function () {
      filters.rapids = !filters.rapids; rapidToggle.setAttribute('aria-pressed', String(filters.rapids));
      rapidToggle.textContent = filters.rapids ? t('Rapides G0 : affichés') : t('Rapides G0 : masqués'); applyFilters();
    });
    function applyFilters() {
      var zMin = number(zMinInput.value), zMax = number(zMaxInput.value), from = number(fromInput.value), to = number(toInput.value);
      if ([zMin, zMax, from, to].some(function (v) { return v !== null && isNaN(v); })) { filterError.textContent = t('Valeur de filtre illisible.'); return; }
      filterError.textContent = '';
      filters.zMin = zMin; filters.zMax = zMax; filters.lineFrom = from; filters.lineTo = to;
      filters.tool = toolSelect && toolSelect.value !== '' ? Number(toolSelect.value) : null;
      filters.operation = opSelect && opSelect.value ? opSelect.value : null;
      var res = PI.filterMask(path, filters, index); mask = res.mask; upload(); invalidate();
    }
    on(apply, 'click', applyFilters);
    on(addClamp, 'click', function () {
      var c = PI.clampValue({ x: clampInputs.x.value, y: clampInputs.y.value, w: clampInputs.w.value, d: clampInputs.d.value, h: clampInputs.h.value });
      if (!c) { overlayNote.textContent = t('Bride illisible : X, Y, largeur, profondeur et hauteur en mm (dimensions positives).'); return; }
      clamps.push(c); PI.saveClamps(meta.fingerprint, clamps, storage); upload(); invalidate();
    });
    on(win, 'resize', resize);
    on(win, 'cnc-profile-change', function (e) { var d = e && e.detail; if (d && d.performance !== 'performance') { close('eco'); if (options.onFallback) options.onFallback(t('Profil éco : vue 3D libre fermée et ressources libérées, vues fixes conservées.')); } });
    on(win, 'cnc-screen-change', function () { close('screen'); });
    on(win, 'cnc-screen-lock', function (e) { if (e && e.detail) close('lock'); });
    on(win, 'pagehide', function () { close('pagehide'); });
    if (!inline) on(doc, 'keydown', function (e) { if (e.key === 'Escape') { stop(e); close('user'); } });

    function close(reason) {
      if (closed) return; closed = true;
      if (frame !== null && win.cancelAnimationFrame) win.cancelAnimationFrame(frame); frame = null;
      listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (_) {} }); listeners = [];
      if (renderer) renderer.release();
      if (src && src.release) src.release();
      src = null; renderer = null; path = null; mask = null; screen = null; pointers = {};
      if (typeof restoreBackground === 'function') { var r = restoreBackground; restoreBackground = null; r(); }
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (current === handle) current = null;
      if (options.onClose) options.onClose(reason);
    }
    var handle = {
      close: close,
      state: function () { return { closed: closed, software: !!(renderer && renderer.software), listeners: listeners.length, gesture: gesture, zScale: zs, camera: cam && { yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom }, renderer: !!renderer, dpr: dpr, canvas: { width: canvas.width, height: canvas.height }, inspected: inspected, filters: filters }; },
      paint: paint, applyFilters: applyFilters, inspect: showInspection, dialog: dialog, canvas: canvas
    };
    current = handle;
    zLabel(); upload(); resize();
    if (!inline && closeButton.focus) try { closeButton.focus({ preventScroll: true }); } catch (_) {}
    return handle;
  }

  var api = { open: open, close: function (reason) { if (current) current.close(reason || 'api'); }, active: function () { return !!current; },
    basis: basis, matrix: matrix, project: project, fit: fit, buildVertices: buildVertices, createRenderer: createRenderer, create2DRenderer: create2DRenderer, PRESETS: PRESETS, MAX_DPR: MAX_DPR, GESTURE_FRAME_MS: GESTURE_FRAME_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNCPreviewGL = api;
})(typeof window !== 'undefined' ? window : this);
