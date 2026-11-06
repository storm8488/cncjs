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
  var SOFT_GESTURE_SEGMENTS = 1500;
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

  // ---- Overlays (PERFORMANCE-UI-SPEC.md 8.3): coloured lines only, no command meaning ----
  // Named colours only (the dark tokens), never a free CSS colour.
  var OVERLAY_COLOURS = { info: '#7cbcff', ok: '#5fe39a', warn: '#ffc857', danger: '#ff8a80', neutral: '#aab8c1', stock: '#dbc796', clamp: '#ff784f' };
  var OVERLAY_FIELDS = { segments: ['id', 'kind', 'frame', 'points', 'colour', 'width'], box: ['id', 'kind', 'frame', 'min', 'max', 'colour', 'width'],
    program: ['id', 'kind', 'translate', 'colour', 'width'], marker: ['id', 'kind', 'frame', 'at', 'colour'] };
  var MAX_OVERLAYS = 16, MAX_POINT_NUMBERS = 300000, MAX_ABS = 100000;
  function triple(v) { return (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 3 && Array.prototype.every.call(v, function (n) { return typeof n === 'number' && isFinite(n) && Math.abs(n) <= MAX_ABS; }); }
  // '' when accepted, else the refusal code. Same rules, same order as the stub of spec 8.10.
  function checkOne(o, ids, budget) {
    if (!o || typeof o !== 'object') return 'field';
    if (typeof o.id !== 'string' || !/^[a-z0-9-]{1,32}$/.test(o.id) || ids[o.id]) return 'id';
    var allowed = OVERLAY_FIELDS[o.kind]; if (!allowed || !Object.prototype.hasOwnProperty.call(OVERLAY_FIELDS, o.kind)) return 'kind';
    var extra = Object.keys(o).filter(function (k) { return allowed.indexOf(k) < 0 || typeof o[k] === 'function'; });
    if (extra.length) return 'field';
    if (o.kind !== 'program' && o.frame !== undefined && o.frame !== 'work' && o.frame !== 'machine') return 'frame';
    if (!Object.prototype.hasOwnProperty.call(OVERLAY_COLOURS, o.colour)) return 'colour';
    if (o.kind !== 'marker' && o.width !== undefined && o.width !== 'thin' && o.width !== 'thick') return 'width';
    if (o.kind === 'segments') {
      var p = o.points;
      if (!(Array.isArray(p) || p instanceof Float32Array) || !p.length || p.length % 6) return 'points';
      for (var i = 0; i < p.length; i++) if (typeof p[i] !== 'number' || !isFinite(p[i]) || Math.abs(p[i]) > MAX_ABS) return 'number';
      if (budget.points + p.length > MAX_POINT_NUMBERS) return 'limit';
      budget.points += p.length;
    }
    if (o.kind === 'box') { if (!triple(o.min) || !triple(o.max)) return 'number'; for (var a = 0; a < 3; a++) if (o.min[a] > o.max[a]) return 'number'; }
    if (o.kind === 'program' && !triple(o.translate)) return 'number';
    if (o.kind === 'marker' && !triple(o.at)) return 'number';
    return '';
  }
  // Pure: {accepted: the accepted objects, refused: [{id, code, message}]}. At most 16 accepted.
  function checkOverlays(list) {
    var accepted = [], refused = [], ids = {}, budget = { points: 0 };
    (Array.isArray(list) ? list : []).forEach(function (o) {
      var code = accepted.length >= MAX_OVERLAYS ? 'limit' : checkOne(o, ids, budget);
      if (code) refused.push({ id: o && typeof o.id === 'string' ? o.id : '', code: code, message: t('Incrustation refusée : ') + code });
      else { ids[o.id] = true; accepted.push(o); }
    });
    return { accepted: accepted, refused: refused };
  }
  // A private copy of an accepted overlay (the caller may change its arrays afterwards).
  function copyOverlay(o) {
    var c = { id: o.id, kind: o.kind, frame: o.kind === 'program' ? 'work' : o.frame || 'work', colour: o.colour, width: o.kind === 'marker' ? 'thin' : o.width || 'thin' };
    ['min', 'max', 'at', 'translate'].forEach(function (k) { if (o[k]) c[k] = [o[k][0], o[k][1], o[k][2]]; });
    if (o.points) c.points = new Float32Array(o.points);
    return c;
  }
  function sameOverlay(a, b) {
    if (!a || !b) return false;
    var keys = ['id', 'kind', 'frame', 'colour', 'width'];
    for (var i = 0; i < keys.length; i++) if (a[keys[i]] !== b[keys[i]]) return false;
    var arrays = ['min', 'max', 'at', 'translate', 'points'];
    for (var j = 0; j < arrays.length; j++) {
      var x = a[arrays[j]], y = b[arrays[j]];
      if (!x !== !y) return false;
      if (x) { if (x.length !== y.length) return false; for (var k = 0; k < x.length; k++) if (x[k] !== y[k]) return false; }
    }
    return true;
  }

  // ---- GPU gate probe (spec 2.1): called by preview-3d.js only, in the Performance profile ----
  var SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;
  // A 1 × 1 canvas off the document: a hardware WebGL context and a renderer that is not a
  // software one. Reads the capabilities the GPU rendering needs, then releases the contexts.
  function probeGpu(doc) {
    doc = doc || root.document;
    var result = { hardware: false, renderer: '', webgl2: false, antialias: false, lineWidth: [1, 1], maxTextureSize: 0, reason: 'no-webgl' };
    function lose(g) { try { var x = g && g.getExtension && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (_) {} }
    var gl = null;
    try {
      var canvas = doc.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true, antialias: true }) || canvas.getContext('experimental-webgl', { failIfMajorPerformanceCaveat: true, antialias: true });
      if (!gl) return result;
      var info = gl.getExtension && gl.getExtension('WEBGL_debug_renderer_info');
      result.renderer = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
      var range = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE);
      if (range && range.length >= 2 && isFinite(range[0]) && isFinite(range[1])) result.lineWidth = [Number(range[0]), Number(range[1])];
      result.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
      var attrs = gl.getContextAttributes && gl.getContextAttributes();
      result.antialias = !!(attrs && attrs.antialias);
      try {
        var c2 = doc.createElement('canvas'); c2.width = 1; c2.height = 1;
        var g2 = c2.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
        result.webgl2 = !!g2; lose(g2);
      } catch (_) { result.webgl2 = false; }
      result.hardware = !SOFTWARE_RENDERER.test(result.renderer);
      result.reason = result.hardware ? '' : 'software';
    } catch (_) {
      result.hardware = false; result.reason = 'probe-failed';
    } finally { lose(gl); }
    return result;
  }
  // The gate as the views read it at opening: Performance, hardware probe, no context lost since.
  function gpuGate(win) {
    try { var s = win.cncGpu && typeof win.cncGpu.state === 'function' ? win.cncGpu.state() : null; return s && s.hardware === true && s.lost !== true ? s : null; } catch (_) { return null; }
  }

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
  // (about SOFT_GESTURE_SEGMENTS: 1 500 measured as the best compromise on the RT), the whole path when the finger is lifted.
  function create2DRenderer(canvas) {
    var g = null;
    try { g = canvas.getContext('2d', { alpha: false }); } catch (_) { g = null; }
    if (!g) throw new Error(t('WebGL et Canvas 2D indisponibles sur cette tablette'));
    // Segments grouped by colour at upload: one stroke() per colour, not per colour change (the depth
    // shading of a large finishing path changes colour thousands of times; measured on the Surface RT).
    var data = null, released = false, groups = [];
    function group(d) {
      var byKey = {}, out = [], segments = d.length / 12;
      for (var s = 0; s < segments; s++) {
        var i = s * 12, key = Math.round(d[i + 3] * 255) + ',' + Math.round(d[i + 4] * 255) + ',' + Math.round(d[i + 5] * 255);
        var gr = byKey[key]; if (!gr) { gr = byKey[key] = { style: 'rgb(' + key + ')', list: [] }; out.push(gr); }
        gr.list.push(s);
      }
      return out;
    }
    return {
      software: true,
      upload: function (d) { if (!released) { data = d; groups = group(d); } },
      draw: function (m, width, height, coarse) {
        if (released || !data) return !released;
        g.fillStyle = '#101820'; g.fillRect(0, 0, width, height);
        g.lineWidth = 1;
        var segments = data.length / 12, step = coarse ? Math.max(1, Math.ceil(segments / SOFT_GESTURE_SEGMENTS)) : 1;
        var hw = width / 2, hh = height / 2;
        for (var k = 0; k < groups.length; k++) {
          var list = groups[k].list; if (!list.length) continue;
          g.strokeStyle = groups[k].style; g.beginPath();
          for (var j = 0; j < list.length; j += step) {
            var a = list[j] * 12, b = a + 6;
            var ax = data[a], ay = data[a + 1], az = data[a + 2], bx = data[b], by = data[b + 1], bz = data[b + 2];
            g.moveTo((m[0] * ax + m[4] * ay + m[8] * az + m[12] + 1) * hw, (1 - (m[1] * ax + m[5] * ay + m[9] * az + m[13])) * hh);
            g.lineTo((m[0] * bx + m[4] * by + m[8] * bz + m[12] + 1) * hw, (1 - (m[1] * bx + m[5] * by + m[9] * bz + m[13])) * hh);
          }
          g.stroke();
        }
        return true;
      },
      release: function () { released = true; data = null; groups = []; g = null; },
      get released() { return released; }
    };
  }

  // ---- GPU rendering (spec 4): only under the GPU gate, decided when the view opens ----
  var GPU_MAX_DPR = 2, DEPTH_FADE = 0.45;
  var BG = [0.063, 0.094, 0.125];
  var ACK = hex('#ffc857'), ACK_RAPID = [0, 1, 2].map(function (k) { return (ACK[k] + BG[k]) / 2; }), PASS = hex('#eef3f6'), GHOST = hex('#87969f');
  // Same projection as matrix(), plus a depth row: clip z = distance away from the viewer / radius, so the
  // depth test and the depth fade work. radius bounds everything drawn (path, overlays) around the centre.
  function depthMatrix(cam, width, height, zs, radius) {
    var m = matrix(cam, width, height, zs), b = basis(cam.yaw, cam.pitch), r = b.r, u = b.u, R = radius > 0 ? radius : 1;
    // Toward the viewer: r × u.
    var tx = r[1] * u[2] - r[2] * u[1], ty = r[2] * u[0] - r[0] * u[2], tz = r[0] * u[1] - r[1] * u[0];
    m[2] = -tx / R; m[6] = -ty / R; m[10] = -tz * zs / R; m[14] = 0;
    return m;
  }
  // Interleaved vertices (x, y, z, r, g, b, line) of the path for the GPU: rapids first, then the work
  // segments in program order, so a pass (consecutive work segments) is one range. first[i] is the
  // first vertex of segment i (-1 when masked out). The line of a segment is lines[i], the line that
  // reaches its end point: the shader compares it with the acknowledged line A (an uniform).
  function buildPathVertices(path, mask, centre, zmin) {
    var n = path.count, P = path.positions, R = path.rapid, L = path.lines, rapids = 0, cuts = 0, i;
    for (i = 1; i < n; i++) if (!mask || mask[i]) { if (R[i]) rapids++; else cuts++; }
    var data = new Float32Array((rapids + cuts) * 14), first = new Int32Array(n), k = 0, cache = {};
    var rapid = hex(T3.colours.rapid).map(function (v) { return v * 0.8; });
    first.fill(-1);
    function put(j, c, line) { data[k++] = P[j * 3] - centre[0]; data[k++] = P[j * 3 + 1] - centre[1]; data[k++] = P[j * 3 + 2] - centre[2]; data[k++] = c[0]; data[k++] = c[1]; data[k++] = c[2]; data[k++] = line; }
    for (i = 1; i < n; i++) {
      if ((mask && !mask[i]) || !R[i]) continue;
      first[i] = k / 7; put(i - 1, rapid, L[i]); put(i, rapid, L[i]);
    }
    var cutFirst = k / 7;
    for (i = 1; i < n; i++) {
      if ((mask && !mask[i]) || R[i]) continue;
      var name = T3.depthColor(Math.min(P[i * 3 - 1], P[i * 3 + 2]), zmin), c = cache[name] || (cache[name] = hex(name));
      first[i] = k / 7; put(i - 1, c, L[i]); put(i, c, L[i]);
    }
    return { data: data, rapidFirst: 0, rapidCount: rapids * 2, cutFirst: cutFirst, cutCount: cuts * 2, first: first, segments: rapids + cuts };
  }
  // Vertices with one colour per vertex and no line (boxes, axes, overlays): line -1 is never acknowledged.
  function colouredVertices(list) {
    var data = new Float32Array(list.length * 7);
    list.forEach(function (v, i) { data.set([v[0], v[1], v[2], v[3][0], v[3][1], v[3][2], -1], i * 7); });
    return data;
  }
  var BOX_EDGES = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  function boxVertices(min, max, colour, centre, out) {
    BOX_EDGES.forEach(function (e) { e.forEach(function (j) { out.push([(j & 1 ? max[0] : min[0]) - centre[0], (j & 2 ? max[1] : min[1]) - centre[1], (j & 4 ? max[2] : min[2]) - centre[2], colour]); }); });
    return out;
  }
  var GPU_VERTEX = 'attribute vec3 p;attribute vec3 c;attribute float l;uniform mat4 m;uniform vec3 s;uniform vec3 o;uniform float a;uniform float mode;uniform vec3 solid;uniform vec3 ack;varying vec3 v;varying float d;' +
    'void main(){vec4 q=m*vec4(p*s+o,1.0);q.z=clamp(q.z,-0.999,0.999);gl_Position=q;d=q.z;v=mode>0.5?solid:(l>=0.0&&l<=a?ack:c);}';
  var GPU_FRAGMENT = 'precision mediump float;varying vec3 v;varying float d;uniform vec3 bg;uniform float fade;void main(){gl_FragColor=vec4(mix(v,bg,fade*clamp(d*0.5+0.5,0.0,1.0)),1.0);}';
  // WebGL1 line renderer for a hardware GPU: antialiasing asked, depth test, depth fade, line widths
  // bounded by ALIASED_LINE_WIDTH_RANGE. Static buffers only: a new acknowledged line, a translation or a
  // colour is an uniform, never a buffer upload. Throws when the context cannot be made usable.
  function createGpuRenderer(canvas, counters) {
    var attrs = { antialias: true, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true };
    var gl = null;
    try { gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs); } catch (_) { gl = null; }
    if (!gl) throw new Error(t('WebGL indisponible sur cette tablette'));
    var program = null, vs = null, fs = null, buffers = [], released = false;
    function shader(type, source) {
      var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(t('WebGL : shader refusé'));
      return s;
    }
    vs = shader(gl.VERTEX_SHADER, GPU_VERTEX); fs = shader(gl.FRAGMENT_SHADER, GPU_FRAGMENT);
    program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(t('WebGL : programme refusé'));
    var loc = { p: gl.getAttribLocation(program, 'p'), c: gl.getAttribLocation(program, 'c'), l: gl.getAttribLocation(program, 'l') }, U = {};
    ['m', 's', 'o', 'a', 'mode', 'solid', 'ack', 'bg', 'fade'].forEach(function (n) { U[n] = gl.getUniformLocation(program, n); });
    var range = null; try { range = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE); } catch (_) {}
    var lineRange = range && range.length >= 2 && range[1] >= range[0] && range[0] > 0 ? [Number(range[0]), Number(range[1])] : [1, 1];
    var ctxAttrs = gl.getContextAttributes ? gl.getContextAttributes() : null;
    var bound = null, width = 1, frameDpr = 1;
    var api = {
      gl: gl, software: false, antialias: !!(ctxAttrs && ctxAttrs.antialias), lineWidthRange: lineRange,
      // A static buffer of interleaved vertices (7 floats each).
      buffer: function (data) {
        if (released) return null;
        var b = { id: gl.createBuffer(), count: data.length / 7 };
        gl.bindBuffer(gl.ARRAY_BUFFER, b.id); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        if (counters) { counters.uploads++; counters.uploadBytes += data.byteLength; }
        buffers.push(b); bound = null; return b;
      },
      free: function (b) {
        var i = buffers.indexOf(b); if (i < 0) return;
        buffers.splice(i, 1); if (!released) try { gl.deleteBuffer(b.id); } catch (_) {}
        if (bound === b) bound = null;
      },
      begin: function (m, w, h, dpr) {
        if (released || (gl.isContextLost && gl.isContextLost())) return false;
        frameDpr = dpr || 1; width = -1;
        gl.viewport(0, 0, w, h); gl.clearColor(BG[0], BG[1], BG[2], 1); gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
        gl.uniformMatrix4fv(U.m, false, m); gl.uniform3f(U.bg, BG[0], BG[1], BG[2]); gl.uniform1f(U.fade, DEPTH_FADE);
        bound = null; return true;
      },
      // Lines of a buffer range. o: {px (CSS width), solid, ack (line, -1 none), ackColour, shift, scale, depth}.
      lines: function (b, first, count, o) {
        if (released || !b || count <= 0) return;
        if (bound !== b) {
          gl.bindBuffer(gl.ARRAY_BUFFER, b.id);
          gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 28, 0);
          gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 3, gl.FLOAT, false, 28, 12);
          gl.enableVertexAttribArray(loc.l); gl.vertexAttribPointer(loc.l, 1, gl.FLOAT, false, 28, 24);
          bound = b;
        }
        var w = Math.max(lineRange[0], Math.min(lineRange[1], (o.px || 1) * frameDpr));
        if (w !== width) { gl.lineWidth(w); width = w; }
        var s = o.scale || [1, 1, 1], sh = o.shift || [0, 0, 0], solid = o.solid, ack = o.ackColour || ACK;
        gl.uniform3f(U.s, s[0], s[1], s[2]); gl.uniform3f(U.o, sh[0], sh[1], sh[2]);
        gl.uniform1f(U.mode, solid ? 1 : 0); if (solid) gl.uniform3f(U.solid, solid[0], solid[1], solid[2]);
        gl.uniform1f(U.a, typeof o.ack === 'number' ? o.ack : -1); gl.uniform3f(U.ack, ack[0], ack[1], ack[2]);
        if (o.depth === false) gl.disable(gl.DEPTH_TEST); else gl.enable(gl.DEPTH_TEST);
        gl.drawArrays(gl.LINES, first, count);
      },
      end: function () { return released ? false : gl.getError ? gl.getError() === gl.NO_ERROR : true; },
      release: function () {
        if (released) return; released = true;
        try {
          buffers.forEach(function (b) { gl.deleteBuffer(b.id); }); buffers = [];
          if (program) gl.deleteProgram(program); if (vs) gl.deleteShader(vs); if (fs) gl.deleteShader(fs);
          var lose = gl.getExtension && gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
        } catch (_) {}
        program = vs = fs = null; gl = null;
      },
      get released() { return released; },
      get bufferCount() { return buffers.length; }
    };
    return api;
  }

  function el(doc, tag, cls, text) { var n = doc.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function number(text) { var s = String(text || '').trim().replace(',', '.'); if (!s) return null; var v = Number(s); return isFinite(v) ? v : NaN; }
  function fmt(v, d) { try { return v.toLocaleString(uiLocale.locale || 'fr-FR', { maximumFractionDigits: d === undefined ? 3 : d }); } catch (_) { return String(v); } }

  // Full geometry of the loaded program (spec 3.8, Q7): one entry, by fingerprint, kept from one screen
  // to the other (the program is not read again, even less during a job); dropped in eco, on a lost
  // context, at pagehide and when a view of another loaded program opens. Listeners only while kept.
  var fullCache = null, fullListening = false;
  function fullDrop() {
    fullCache = null;
    if (fullListening && typeof root.removeEventListener === 'function') { root.removeEventListener('cnc-profile-change', fullOnProfile); root.removeEventListener('pagehide', fullDrop); }
    fullListening = false;
  }
  function fullOnProfile(e) { var d = e && e.detail; if (d && d.performance !== 'performance') fullDrop(); }
  function fullKeep(fingerprint, full) {
    fullCache = { fingerprint: fingerprint, path: full };
    if (!fullListening && typeof root.addEventListener === 'function') { root.addEventListener('cnc-profile-change', fullOnProfile); root.addEventListener('pagehide', fullDrop); fullListening = true; }
  }

  var current = null;
  // Opens the free view over the page. meta: {file, fingerprint, path3d, zBounds, estimate};
  // options: {document, window, onClose(reason), onFallback(message), source (inspection), storage, stock,
  // container}: with a container the view is drawn inside it (the preview frame) instead of over the page.
  // Under the GPU gate (cncGpu, read once here, never changed during the view's life), also
  // {live: {progress, tool}, overlays: [...], pathStyle: 'normal'|'ghost'|'hidden', fit: 'path'|'all'}
  // (spec 8.2), fullGeometry: true (Suivi at rest: read the whole program for the drawing, spec 3.8) and
  // loaded: true (the view shows the loaded program, Suivi: another one releases the kept geometry);
  // without the gate these are ignored and the view behaves as before.
  function open(meta, options) {
    options = options || {};
    var win = options.window || root, doc = options.document || win.document;
    if (current) current.close('replaced');
    var gate = gpuGate(win), gpu = !!gate;
    var liveOptions = gpu && options.live && typeof options.live === 'object' ? { progress: options.live.progress === true, tool: options.live.tool === true } : { progress: false, tool: false };
    var pathStyle = gpu && (options.pathStyle === 'ghost' || options.pathStyle === 'hidden') ? options.pathStyle : 'normal';
    var fitMode = gpu && options.fit === 'all' ? 'all' : 'path';
    var overlays = [], followOn = false;
    var counters = { frames: 0, gestureFrames: 0, lastPaintMs: 0, maxPaintMs: 0, uploads: 0, uploadBytes: 0 };
    var listeners = [], frame = null, lastFrame = 0, gesture = false, closed = false, renderer = null, path = null, mask = null, screen = null, screenKey = '';
    var zs = 1, cam = null, width = 0, height = 0, dpr = 1, centre = [0, 0, 0], bounds = null, src = null, inspected = -1, filters = { rapids: true };
    var pointers = {}, start = null, restoreBackground = null, twoFingers = null;
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
      on(b, 'click', function () { cam = fit(fitBounds(), p[0], width || 1, height || 1, zs); setFollow(false); invalidate(); refold(); });
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
    // Under the GPU gate, the GPU renderer (spec 4); otherwise, or if it cannot start, WebGL as before;
    // without it (Surface RT kiosk), the Canvas 2D renderer: slower, lighter while turning.
    if (gpu) try { renderer = createGpuRenderer(canvas, counters); } catch (_) { renderer = null; }
    if (!renderer) try { renderer = createRenderer(canvas); } catch (e) {
      try { renderer = create2DRenderer(canvas); } catch (e2) { fail(t('Vue 3D libre indisponible : ') + e2.message + t('. Vues fixes conservées.')); return null; }
    }
    // The GPU rendering, decided once: the gate was open and the GPU renderer started.
    var gpuMode = gpu && renderer.software === false && typeof renderer.lines === 'function';
    var gpuPath = null, extrasBuffer = null, triadBuffer = null;
    var clock = win.performance && typeof win.performance.now === 'function' ? function () { return win.performance.now(); } : function () { return Date.now(); };
    // A lost context also closes the GPU gate until a reload (spec 2.1): no live WebGL view opens again.
    on(canvas, 'webglcontextlost', function () {
      try { if (win.cncGpu && typeof win.cncGpu._contextLost === 'function') win.cncGpu._contextLost(); } catch (_) {}
      fullDrop();
      fail(t('Contexte WebGL perdu : vue 3D libre fermée, vues fixes conservées.'));
    });

    // Inline (small frame): a short label, the exaggeration still named.
    function zLabel() { zButton.textContent = zs === 1 ? (inline ? 'Z ×1' : t('Z ×1 (échelle réelle)')) : 'Z ×' + zs + t(' (exagéré)'); zButton.setAttribute('data-exaggerated', String(zs !== 1)); }
    function upload() {
      overlay = PI.overlayBoxes(stock, clamps, bounds);
      var diag = Math.sqrt(Math.pow(bounds[3] - bounds[0], 2) + Math.pow(bounds[4] - bounds[1], 2)) || 10;
      var built;
      if (gpuMode) {
        if (gpuPath) renderer.free(gpuPath.buffer);
        built = buildPathVertices(path, mask, centre, bounds[2]);
        gpuPath = { buffer: renderer.buffer(built.data), built: built };
        built.data = null; // on the GPU now: the copy is not kept
        if (extrasBuffer) renderer.free(extrasBuffer);
        extrasBuffer = renderer.buffer(extraVertices(overlay.boxes, diag * 0.08));
        if (!triadBuffer) triadBuffer = renderer.buffer(colouredVertices([[0, 0, 0, [1, 1, 1]], [1, 0, 0, [1, 1, 1]], [0, 0, 0, [1, 1, 1]], [0, 1, 0, [1, 1, 1]], [0, 0, 0, [1, 1, 1]], [0, 0, 1, [1, 1, 1]]]));
      } else {
        built = buildVertices(path, mask, centre, bounds[2], overlay.boxes, diag * 0.08);
        renderer.upload(built.data);
      }
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
      var nextDpr = Math.min(gpuMode ? GPU_MAX_DPR : MAX_DPR, win.devicePixelRatio || 1);
      if (w !== width || h !== height || nextDpr !== dpr) {
        dpr = nextDpr;
        var first = !width; width = w; height = h;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        if (canvas.style) { canvas.style.width = w + 'px'; canvas.style.height = h + 'px'; }
        if (first || !cam) cam = fit(fitBounds(), 'iso', width, height, zs);
      }
      invalidate();
    }
    function paint(now) {
      frame = null; if (closed) return;
      now = typeof now === 'number' ? now : Date.now();
      // During a gesture without the GPU rendering: at most one frame every 33 ms. With it: every
      // animation frame (target 60 frames/s). A late frame is never caught up: the next one draws now.
      if (!gpuMode && gesture && now - lastFrame < GESTURE_FRAME_MS) { frame = win.requestAnimationFrame(paint); return; }
      lastFrame = now;
      var started = clock();
      beforePaint(now);
      var ok = gpuMode ? paintGpu() : renderer.draw(matrix(cam, width, height, zs), canvas.width, canvas.height, gesture);
      if (!ok) { fail(t('Erreur WebGL : vue 3D libre fermée, vues fixes conservées.')); return; }
      var spent = clock() - started;
      counters.frames++; if (gesture) counters.gestureFrames++;
      counters.lastPaintMs = spent; if (spent > counters.maxPaintMs) counters.maxPaintMs = spent;
      afterPaint(now);
    }
    // Vertices of the stock and clamp boxes and the axis triad (one colour per vertex).
    function extraVertices(boxes, axisLength) {
      var list = [];
      (boxes || []).forEach(function (box) { boxVertices(box.min, box.max, box.kind === 'stock' ? [0.86, 0.78, 0.59] : [1, 0.47, 0.31], centre, list); });
      [[1, 0, 0, [1, 0.48, 0.48]], [0, 1, 0, [0.37, 0.89, 0.6]], [0, 0, 1, [0.49, 0.74, 1]]].forEach(function (ax) {
        list.push([-centre[0], -centre[1], -centre[2], ax[3]]); list.push([ax[0] * axisLength - centre[0], ax[1] * axisLength - centre[1], ax[2] * axisLength - centre[2], ax[3]]);
      });
      return colouredVertices(list);
    }
    // Translation (world mm) of an overlay this frame: machine frame converted by work = machine − o.
    function overlayShift(o) {
      var base = o.kind === 'program' ? o.translate : o.kind === 'marker' ? [o.at[0] - centre[0], o.at[1] - centre[1], o.at[2] - centre[2]] : [0, 0, 0];
      if (o.frame !== 'machine') return base;
      var off = live.offset;
      return [base[0] - off[0], base[1] - off[1], base[2] - off[2]];
    }
    // Extent of an overlay (its own frame), kept with its copy.
    function overlayBox(o) {
      if (o.extent) return o.extent;
      var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
      function add(x, y, z) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z); b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z); }
      if (o.kind === 'segments') for (var i = 0; i < o.points.length; i += 3) add(o.points[i], o.points[i + 1], o.points[i + 2]);
      else if (o.kind === 'box') { add(o.min[0], o.min[1], o.min[2]); add(o.max[0], o.max[1], o.max[2]); }
      else if (o.kind === 'marker') add(o.at[0], o.at[1], o.at[2]);
      else { add(bounds[0] + o.translate[0], bounds[1] + o.translate[1], bounds[2] + o.translate[2]); add(bounds[3] + o.translate[0], bounds[4] + o.translate[1], bounds[5] + o.translate[2]); }
      o.extent = b; return b;
    }
    // The bounds drawn now, in the work frame: path (unless hidden), drawn overlays, the tool marker.
    function drawnBounds(withPath) {
      var b = withPath ? bounds.slice() : [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k;
      overlays.forEach(function (o) {
        if (overlayReason(o)) return;
        var e = overlayBox(o), off = o.frame === 'machine' ? live.offset : [0, 0, 0];
        for (var a = 0; a < 3; a++) { b[a] = Math.min(b[a], e[a] - off[a]); b[a + 3] = Math.max(b[a + 3], e[a + 3] - off[a]); }
      });
      var at = markerPoint();
      if (at) for (k = 0; k < 3; k++) { b[k] = Math.min(b[k], at[k]); b[k + 3] = Math.max(b[k + 3], at[k]); }
      if (!(b[0] <= b[3])) return bounds.slice();
      return b;
    }
    // What « Recentrer », the presets and the first frame fit: the path, or everything drawn (fit: 'all').
    function fitBounds() { return fitMode === 'all' ? drawnBounds(pathStyle !== 'hidden') : bounds; }
    function paintGpu() {
      var b = drawnBounds(true), radius = 1;
      for (var i = 0; i < 8; i++) {
        var x = (i & 1 ? b[3] : b[0]) - centre[0], y = (i & 2 ? b[4] : b[1]) - centre[1], z = ((i & 4 ? b[5] : b[2]) - centre[2]) * zs;
        radius = Math.max(radius, Math.sqrt(x * x + y * y + z * z));
      }
      if (!renderer.begin(depthMatrix(cam, width, height, zs, radius * 1.05), canvas.width, canvas.height, dpr)) return false;
      renderer.lines(extrasBuffer, 0, extrasBuffer.count, { px: 1 });
      var built = gpuPath.built, A = progressLine();
      // Order (spec 3.1): rapids, work remaining and acknowledged (the shader compares each line with A), current pass.
      if (pathStyle === 'normal') {
        renderer.lines(gpuPath.buffer, built.rapidFirst, built.rapidCount, { px: 1, ack: A, ackColour: ACK_RAPID });
        renderer.lines(gpuPath.buffer, built.cutFirst, built.cutCount, { px: 2, ack: A, ackColour: ACK });
        var range = passRange();
        if (range) renderer.lines(gpuPath.buffer, range[0], range[1], { px: 3, solid: PASS });
      } else if (pathStyle === 'ghost') renderer.lines(gpuPath.buffer, 0, built.rapidCount + built.cutCount, { px: 1, solid: GHOST });
      // Overlays: coloured lines only; a machine-frame one only while the offset is known.
      overlays.forEach(function (o) {
        if (overlayReason(o)) return;
        var colour = hex(OVERLAY_COLOURS[o.colour]), px = o.width === 'thick' ? 2 : 1, shift = overlayShift(o);
        if (o.kind === 'program') { renderer.lines(gpuPath.buffer, 0, built.rapidCount + built.cutCount, { px: px, solid: colour, shift: shift }); return; }
        if (o.kind === 'marker') {
          // Fixed size on screen (24 px CSS), over everything.
          var k = 24 / Math.max(1e-6, cam.zoom);
          renderer.lines(triadBuffer, 0, 6, { px: 2, solid: colour, shift: shift, scale: [k, k, k / zs], depth: false });
          return;
        }
        if (!o.buffer) {
          var list = [];
          if (o.kind === 'box') boxVertices(o.min, o.max, colour, centre, list);
          else for (var j = 0; j < o.points.length; j += 3) list.push([o.points[j] - centre[0], o.points[j + 1] - centre[1], o.points[j + 2] - centre[2], colour]);
          o.buffer = renderer.buffer(colouredVertices(list));
        }
        renderer.lines(o.buffer, 0, o.buffer.count, { px: px, solid: colour, shift: shift });
      });
      return renderer.end();
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
      twoFingers = null;
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
        // A two-finger move (the middle of the fingers travels) stops « Suivre l’outil »; a pinch keeps it.
        var mx = (e.clientX + other.x) / 2, my = (e.clientY + other.y) / 2;
        if (!twoFingers) twoFingers = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
        if (followOn && Math.abs(mx - twoFingers.x) + Math.abs(my - twoFingers.y) > 24) setFollow(false);
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
      // The inline view has no inspection panel (preview-advanced.css): a tap there reads nothing.
      if (inline) return;
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
      // No read of the program during a job (spec 3.7, Q7): the simplified values stay.
      if (jobBusy()) { hint.textContent = t('Travail en cours : la ligne source n’est pas lue, valeurs du tracé simplifié.'); return; }
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
    on(recentre, 'click', function () { cam = fit(fitBounds(), 'iso', width, height, zs); setFollow(false); invalidate(); });
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
    // A view drawn in a frame of the page follows the frame's own size (Préparer: the card's texts appear
    // after the view opens; a frame shown after open), not only the window's.
    var sizeWatch = null;
    if (inline && typeof win.ResizeObserver === 'function') {
      try { sizeWatch = new win.ResizeObserver(function () { if (!closed) resize(); }); sizeWatch.observe(stage); } catch (_) { sizeWatch = null; }
    }
    on(win, 'cnc-profile-change', function (e) { var d = e && e.detail; if (d && d.performance !== 'performance') { close('eco'); if (options.onFallback) options.onFallback(t('Profil éco : vue 3D libre fermée et ressources libérées, vues fixes conservées.')); } });
    on(win, 'cnc-screen-change', function () { close('screen'); });
    on(win, 'cnc-screen-lock', function (e) { if (e && e.detail) close('lock'); });
    on(win, 'pagehide', function () { close('pagehide'); });
    if (!inline) on(doc, 'keydown', function (e) { if (e.key === 'Escape') { stop(e); close('user'); } });

    // ---- Live view (spec 3): reports, acknowledged lines, current pass, interpolated tool marker ----
    // The cnc-job-status handler only stores the report, computes A and L and asks for a frame:
    // no drawing, no layout read, no search along the path there. Snapping, interpolation, the pass
    // and the camera follow are computed in the animation frame.
    var STALE_MS = 2500, INTERPOLATE_MS = 1000;
    var live = { ackLine: -1, lastAckSegment: 0, pass: null, offset: null, offsetReason: 'no-offset', machine: null, simulation: false, receivedAt: -Infinity, fresh: false, alarm: false,
      report: null, previous: null, seq: 0, display: null, snapped: false, interpolating: false, staleTimer: null, reason: '' };
    var liveOn = gpuMode && (liveOptions.progress || liveOptions.tool), cumulative = null;
    var followButton = null, toolMark = null;
    if (liveOn && liveOptions.tool) {
      followButton = el(doc, 'button', 'pgl-follow', t('Suivre l’outil')); followButton.type = 'button'; followButton.setAttribute('aria-pressed', 'false');
      tools.appendChild(followButton);
      on(followButton, 'click', function () { if (!followButton.disabled) setFollow(!followOn); });
      toolMark = el(doc, 'span', 'pgl-tool'); toolMark.hidden = true; toolMark.setAttribute('aria-hidden', 'true'); stage.appendChild(toolMark);
    }
    function totalLines() { var p = meta.path3d; return p && typeof p.lines === 'number' && p.lines > 0 ? p.lines : path.lines[path.count - 1] || 0; }
    function sameProgram(m) { return !!m && m.name === meta.file && !(m.fingerprint && meta.fingerprint && PI.sameFingerprint && !PI.sameFingerprint(m.fingerprint, meta.fingerprint)); }
    // Last segment acknowledged: the largest i with lines[i] <= A (the lines grow along the path).
    function lastSegment(A) {
      var L = path.lines, lo = 1, hi = path.count - 1, best = 0;
      if (!(A >= 0)) return 0;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (L[mid] <= A) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      return best;
    }
    function num(v) { var n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; }
    // The reported work position in the path's frame (G54, mm), or null with the reason (texts of tool-position.js).
    function reportedPoint(m, simulation) {
      var w;
      if (simulation) { if (m.wcs !== 'G54') return { reason: t('Position fictive : aperçu limité au repère G54.') }; w = m.workPosition; }
      else {
        if (!m.operator || m.operator.reportUnits !== 'mm' || m.operator.wcs !== 'G54') return { reason: t('Position outil : repère G54 et rapports en mm requis.') };
        w = m.coordinates && m.coordinates.wpos;
      }
      var x = w && num(w.x), y = w && num(w.y), z = w && num(w.z);
      if (x === null || y === null || z === null) return { reason: t('Position outil inconnue.') };
      return { point: [x, y, z] };
    }
    function offsetOf(m, simulation) {
      if (simulation) return { reason: 'no-offset' };
      if (!m.operator || m.operator.reportUnits !== 'mm') return { reason: 'units' };
      if (m.operator.wcs !== 'G54') return { reason: 'wcs' };
      var c = m.coordinates || {}, w = c.wpos || {}, p = c.mpos || {}, o = [];
      for (var k = 0, axes = ['x', 'y', 'z']; k < 3; k++) {
        var a = num(p[axes[k]]), b = num(w[axes[k]]);
        if (a === null || b === null) return { reason: 'no-offset' };
        o.push(a - b);
      }
      return { offset: o, reason: '' };
    }
    function onStatus(e) {
      var d = e && e.detail || {}, m = d.machine;
      if (!m || closed) return;
      var now = clock(), wasStale = isStale(now);
      live.machine = m; live.simulation = !!d.simulation; live.receivedAt = now; live.fresh = m.fresh === true;
      // The whole program is read at rest only (Q7c): a read still in flight when a job starts is cancelled.
      if (fullRequest && busy()) { var stopped = fullRequest; fullRequest = null; stopped.cancel(); }
      // Same for the source of an inspection: its read is aborted, the worker ended.
      if (src && busy()) { var reading = src; src = null; inspected = -1; if (reading.release) reading.release(); }
      live.alarm = /^alarm/i.test(String(m.activeState || ''));
      // A and L: from a fresh report of this program only; frozen otherwise (stale, alarm).
      if (liveOptions.progress && live.fresh && !live.alarm) {
        var TP = win.CNCToolPosition, finished = m.finished === true || m.finishedWithErrors === true;
        if (!sameProgram(m) || !TP || typeof TP.acknowledged !== 'function' || !(typeof m.total === 'number' && m.total > 0 && typeof m.received === 'number') || (m.workflow === 'idle' && !finished)) live.ackLine = -1;
        else live.ackLine = TP.acknowledged(m, totalLines());
        live.lastAckSegment = lastSegment(live.ackLine);
      }
      if (liveOptions.tool) {
        if (live.fresh) {
          var r = reportedPoint(m, live.simulation);
          if (r.point) {
            // Back from a stale state: no interpolation from the old position (a new start).
            live.previous = wasStale || !live.report ? null : live.report;
            live.report = { t: now, p: r.point, seq: ++live.seq, age: typeof m.statusAgeMs === 'number' && isFinite(m.statusAgeMs) && m.statusAgeMs >= 0 ? m.statusAgeMs : 0, snap: undefined };
            live.reason = '';
          } else { live.report = null; live.previous = null; live.reason = r.reason; }
          var o = offsetOf(m, live.simulation);
          live.offset = o.offset || null; live.offsetReason = o.reason;
        }
        // One frame when the report becomes stale (2.5 s), then none.
        if (live.staleTimer !== null) clearTimeout(live.staleTimer);
        live.staleTimer = setTimeout(function () { live.staleTimer = null; invalidate(); }, STALE_MS + 100);
      }
      invalidate();
    }
    if (liveOn) on(win, 'cnc-job-status', onStatus);
    function isStale(now) { return !live.fresh || (typeof now === 'number' ? now : clock()) - live.receivedAt > STALE_MS; }
    function running() { return !!live.machine && live.machine.workflow === 'running'; }
    function busy() { return !!live.machine && (live.machine.workflow === 'running' || live.machine.workflow === 'paused'); }
    // A job running or paused, as this view knows it (live view) or as the page does (cncState).
    function jobBusy() {
      if (busy()) return true;
      var m = null; try { m = win.cncState && win.cncState.get().machine; } catch (_) {}
      return !!m && (m.workflow === 'running' || m.workflow === 'paused');
    }
    function offsetReason() {
      if (!liveOptions.tool || !live.machine) return 'no-offset';
      if (live.offsetReason) return live.offsetReason;
      return isStale() ? 'stale' : '';
    }
    function progressLine() { return liveOptions.progress ? live.ackLine : -1; }
    // ---- Geometry: path3d (simplified), or the whole program (spec 3.8) under the cap of Q7 ----
    var geometry = 'simplified', geometryReason = '', geometryTotal = 0, fullRequest = null;
    function geometryKind() { return geometry; }
    function footText() {
      foot.textContent = geometry === 'full' ? t('Géométrie complète (') + Math.max(0, path.count - 1) + t(' segments, arcs à 0,01 mm) : dessin indicatif, jamais envoyé à la machine.')
        : t('Géométrie simplifiée (') + path.count + t(' points, tolérance ') + fmt(meta.path3d.tolerance || 0) + ' mm' + (meta.path3d.decimated ? t(', points décimés') : '') + t(') : dessin indicatif, jamais envoyé à la machine.');
    }
    // The whole program replaces path3d in this view (same centre and camera; filters and snaps reset).
    function useFull(full, now) {
      path = full; geometry = 'full'; mask = null; screen = null; screenKey = ''; cumulative = null; lastSnap = 0;
      if (live.report) live.report.snap = undefined;
      if (live.previous) live.previous.snap = undefined;
      footText();
      if (now) { upload(); invalidate(); }
    }
    if (gpuMode && meta.fingerprint) {
      if (fullCache && PI.sameFingerprint(fullCache.fingerprint, meta.fingerprint)) useFull(fullCache.path, false);
      else {
        // Another loaded program is shown (Suivi): the geometry kept for the previous one is released now
        // (Q7b), whatever happens to this program's own read (too long, refused, no read at all). A file
        // only looked at (Fichiers) does not change the loaded program: its geometry stays.
        if (fullCache && (options.fullGeometry === true || options.loaded === true)) fullDrop();
      }
      if (geometry !== 'full' && options.fullGeometry === true && typeof PI.geometry === 'function') {
        var asked = fullRequest = PI.geometry(meta, { Worker: options.Worker, fetchProgram: options.fetchProgram });
        asked.promise.then(function (r) {
          if (fullRequest !== asked) return;
          fullRequest = null;
          if (closed || busy()) return;
          if (r.tooLong) { geometryReason = 'too-long'; geometryTotal = r.segments; invalidate(); return; }
          fullDrop(); fullKeep(meta.fingerprint, r.path); useFull(r.path, true);
        }, function () { if (fullRequest === asked) fullRequest = null; });
      }
    }
    // Cumulative length along the path, once per view.
    function cumulativeLengths() {
      if (cumulative) return cumulative;
      var P = path.positions, n = path.count, c = new Float64Array(n);
      for (var i = 1; i < n; i++) { var dx = P[i * 3] - P[i * 3 - 3], dy = P[i * 3 + 1] - P[i * 3 - 2], dz = P[i * 3 + 2] - P[i * 3 - 1]; c[i] = c[i - 1] + Math.sqrt(dx * dx + dy * dy + dz * dz); }
      return (cumulative = c);
    }
    // Nearest point of the segments 1..limit to p, within the tolerance: {seg, s (abscissa), d}, or null.
    // A sliding window from the previous snap (forward, a little backward), the whole range if it misses.
    function snapTo(p, limit, hint) {
      var P = path.positions, c = cumulativeLengths(), tol = geometry === 'full' ? 0.1 : Math.max(2 * (meta.path3d && meta.path3d.tolerance || 0), 0.1), best = null;
      function scan(from, to) {
        for (var j = Math.max(1, from); j <= to; j++) {
          var ax = P[j * 3 - 3], ay = P[j * 3 - 2], az = P[j * 3 - 1], vx = P[j * 3] - ax, vy = P[j * 3 + 1] - ay, vz = P[j * 3 + 2] - az;
          var len2 = vx * vx + vy * vy + vz * vz, k = len2 > 0 ? ((p[0] - ax) * vx + (p[1] - ay) * vy + (p[2] - az) * vz) / len2 : 0;
          k = k < 0 ? 0 : k > 1 ? 1 : k;
          var dx = ax + k * vx - p[0], dy = ay + k * vy - p[1], dz = az + k * vz - p[2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d <= tol && (!best || d < best.d - 1e-9)) best = { seg: j, s: c[j - 1] + k * (c[j] - c[j - 1]), d: d };
        }
      }
      if (limit < 1) return null;
      var h = hint > 0 ? Math.min(hint, limit) : 1;
      scan(h - 50, Math.min(limit, h + 2000));
      if (!best) scan(1, limit);
      return best;
    }
    // Point of the path at abscissa s, on a segment <= limit (s itself is never past the last snap).
    function pointAt(s, limit) {
      var c = cumulativeLengths(), P = path.positions, lo = 1, hi = limit, j = limit;
      while (lo <= hi) { var mid = (lo + hi) >> 1; if (c[mid] >= s) { j = mid; hi = mid - 1; } else lo = mid + 1; }
      var len = c[j] - c[j - 1], k = len > 0 ? Math.max(0, Math.min(1, (s - c[j - 1]) / len)) : 1;
      return [P[j * 3 - 3] + k * (P[j * 3] - P[j * 3 - 3]), P[j * 3 - 2] + k * (P[j * 3 + 1] - P[j * 3 - 2]), P[j * 3 - 1] + k * (P[j * 3 + 2] - P[j * 3 - 1])];
    }
    var lastSnap = 0;
    function snapOf(report, limit) {
      if (report.snap === undefined || (report.snap && report.snap.seg > limit) || (report.snap === null && report.limit !== limit)) {
        report.snap = snapTo(report.p, limit, lastSnap); report.limit = limit;
        if (report.snap) lastSnap = report.snap.seg;
      }
      return report.snap;
    }
    // The current pass: work segments around the snapped one, bounded by rapids and by L.
    function passOf(seg, limit) {
      var R = path.rapid; if (!seg || seg > limit || R[seg]) return null;
      var from = seg, to = seg;
      while (from > 1 && !R[from - 1]) from--;
      while (to < limit && !R[to + 1]) to++;
      return [from, to];
    }
    function passRange() {
      var pass = live.pass; if (!pass || !gpuPath) return null;
      var first = gpuPath.built.first, a = -1, b = -1;
      for (var i = pass[0]; i <= pass[1]; i++) if (first[i] >= 0) { if (a < 0) a = first[i]; b = first[i]; }
      return a < 0 ? null : [a, b - a + 2];
    }
    function markerPoint() { return live.display; }
    // Called at the start of each frame: snapping, interpolation, pass, follow.
    function beforePaint() {
      live.interpolating = false; live.snapped = false; live.pass = null; live.display = null;
      if (!liveOn || !liveOptions.tool || !live.report) return;
      var now = clock(), R = live.report, stale = isStale(now), L = live.lastAckSegment;
      // Snapped and interpolated only while a job runs, with fresh reports of this program and known progress.
      var canSnap = !stale && !live.alarm && running() && liveOptions.progress && live.ackLine >= 0 && sameProgram(live.machine) && L >= 1;
      live.display = R.p;
      if (canSnap) {
        var S = snapOf(R, L), prev = live.previous, PS = prev ? snapOf(prev, L) : null;
        if (S) {
          live.snapped = true;
          live.pass = passOf(S.seg, L);
          if (PS && PS.s <= S.s && R.t - prev.t > 0 && R.t - prev.t <= INTERPOLATE_MS) {
            var alpha = Math.max(0, Math.min(1, (now - R.t) / (R.t - prev.t)));
            live.display = pointAt(PS.s + alpha * (S.s - PS.s), L);
            live.interpolating = alpha < 1;
          }
        }
      }
      // « Suivre l’outil »: the camera keeps the marker in the middle; stopped while stale or in alarm.
      if (followOn && !stale && !live.alarm && cam) {
        var b = basis(cam.yaw, cam.pitch), q = [live.display[0] - centre[0], live.display[1] - centre[1], (live.display[2] - centre[2]) * zs];
        cam.panX = -cam.zoom * (b.r[0] * q[0] + b.r[1] * q[1] + b.r[2] * q[2]);
        cam.panY = -cam.zoom * (b.u[0] * q[0] + b.u[1] * q[1] + b.u[2] * q[2]);
      }
    }
    // After the frame: the DOM marker (fixed 16 px on screen, over the path), the follow button,
    // and the next frame only while the marker is between two reports (α < 1).
    function afterPaint() {
      if (toolMark) {
        var at = live.display, stale = isStale(), show = !!at;
        if (show) {
          var s = project(new Float64Array(at), 1, centre, cam, width, height, zs);
          var move = 'translate(' + s[0].toFixed(1) + 'px,' + s[1].toFixed(1) + 'px)';
          if (toolMark.style.transform !== move) toolMark.style.transform = move;
        }
        if (toolMark.hidden !== !show) toolMark.hidden = !show;
        toolMark.classList.toggle('is-stale', stale || live.alarm);
      }
      if (followButton) {
        var off = !live.display, live2 = busy();
        if (followButton.disabled !== off) followButton.disabled = off;
        var reason = off ? live.reason || t('Position outil inconnue.') : t('Suivre l’outil');
        if (followButton.title !== reason) followButton.title = reason;
        if (followButton.getAttribute('aria-pressed') !== String(followOn)) followButton.setAttribute('aria-pressed', String(followOn));
        followButton.classList.toggle('is-live', live2);
      }
      if (live.interpolating) invalidate();
    }
    function liveState() {
      var now = clock(), shown = !!live.display;
      return { ackLine: live.ackLine, lastAckSegment: live.lastAckSegment, pass: live.pass ? live.pass.slice() : null,
        marker: { shown: shown, stale: shown && isStale(now), alarm: shown && live.alarm, snapped: live.snapped, interpolating: live.interpolating,
          ageMs: live.report ? Math.round(live.report.age + Math.max(0, now - live.report.t)) : null, at: shown ? live.display.slice() : null },
        follow: followOn, workflow: live.machine ? live.machine.workflow || '' : '', simulation: live.simulation, reason: live.reason };
    }
    function setFollow(on) { followOn = !!on; if (followButton) followButton.setAttribute('aria-pressed', String(followOn)); invalidate(); }
    function dropOverlay(o) { if (o.buffer && renderer && renderer.free) renderer.free(o.buffer); o.buffer = null; }
    function overlaysChanged() { invalidate(); }

    function close(reason) {
      if (closed) return; closed = true;
      overlays.forEach(dropOverlay); overlays = []; followOn = false;
      // (live is not set yet when the view fails while opening.)
      if (live) { if (live.staleTimer !== null) clearTimeout(live.staleTimer); live.staleTimer = null; live.report = live.previous = live.machine = live.display = null; }
      cumulative = null; gpuPath = extrasBuffer = triadBuffer = null;
      if (fullRequest) { var pending = fullRequest; fullRequest = null; pending.cancel(); }
      if (frame !== null && win.cancelAnimationFrame) win.cancelAnimationFrame(frame); frame = null;
      if (sizeWatch) { try { sizeWatch.disconnect(); } catch (_) {} sizeWatch = null; }
      listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (_) {} }); listeners = [];
      if (renderer) renderer.release();
      if (src && src.release) src.release();
      src = null; renderer = null; path = null; mask = null; screen = null; pointers = {};
      if (typeof restoreBackground === 'function') { var r = restoreBackground; restoreBackground = null; r(); }
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (current === handle) current = null;
      if (options.onClose) options.onClose(reason);
    }
    // ---- Overlays and live state (spec 8.2-8.3) ----
    // Declarative: the list replaces the previous one; an unchanged overlay keeps its GPU buffer.
    // Callable from an event handler: it stores and asks for a frame, it never draws.
    function setOverlays(list) {
      var r = checkOverlays(list), next = r.accepted.map(function (o) {
        var copy = copyOverlay(o), old = overlays.filter(function (x) { return x.id === copy.id; })[0];
        return old && sameOverlay(old, copy) ? old : copy;
      });
      overlays.forEach(function (o) { if (next.indexOf(o) < 0) dropOverlay(o); });
      overlays = next;
      overlaysChanged();
      return { ok: !r.refused.length, accepted: next.map(function (o) { return o.id; }), refused: r.refused };
    }
    // Whether an overlay is drawn now, and why not: a machine-frame one needs the offset o = mpos − wpos.
    function overlayReason(o) {
      if (!gpu) return 'software';
      if (o.frame === 'machine') return offsetReason();
      return '';
    }
    function follow(on) {
      if (typeof on === 'boolean' && liveOptions.tool) setFollow(on);
      return followOn;
    }
    function stats() {
      return { frames: counters.frames, gestureFrames: counters.gestureFrames, lastPaintMs: counters.lastPaintMs, maxPaintMs: counters.maxPaintMs, uploads: counters.uploads, uploadBytes: counters.uploadBytes,
        dpr: dpr, canvas: { width: canvas.width, height: canvas.height } };
    }
    var handle = {
      close: close,
      state: function () {
        var lw = renderer && renderer.lineWidthRange ? renderer.lineWidthRange.slice() : [1, 1];
        return { closed: closed, software: !!(renderer && renderer.software), listeners: listeners.length, gesture: gesture, zScale: zs, camera: cam && { yaw: cam.yaw, pitch: cam.pitch, zoom: cam.zoom }, renderer: !!renderer, dpr: dpr, canvas: { width: canvas.width, height: canvas.height }, inspected: inspected, filters: filters,
          gpu: gpu && !!renderer && !renderer.software, antialias: !!(renderer && renderer.antialias), lineWidth: lw, geometry: geometryKind(), segments: path ? Math.max(0, path.count - 1) : 0,
          geometryReason: geometryReason, geometryTotal: geometryTotal, geometryPending: !!fullRequest,
          pathStyle: pathStyle, fit: fitMode, live: liveState(),
          overlays: overlays.map(function (o) { var reason = overlayReason(o); return { id: o.id, drawn: !closed && !reason, reason: reason }; }) };
      },
      stats: stats, setOverlays: setOverlays, follow: follow,
      paint: paint, applyFilters: applyFilters, inspect: showInspection, dialog: dialog, canvas: canvas
    };
    current = handle;
    if (Array.isArray(options.overlays)) setOverlays(options.overlays);
    zLabel(); upload(); resize();
    if (!inline && closeButton.focus) try { closeButton.focus({ preventScroll: true }); } catch (_) {}
    return handle;
  }

  // view(): the open view's handle (state(), stats()), for the measurements through DevTools (spec 10).
  var api = { open: open, close: function (reason) { if (current) current.close(reason || 'api'); }, active: function () { return !!current; }, view: function () { return current; },
    basis: basis, matrix: matrix, project: project, fit: fit, buildVertices: buildVertices, createRenderer: createRenderer, create2DRenderer: create2DRenderer, PRESETS: PRESETS, MAX_DPR: MAX_DPR, GESTURE_FRAME_MS: GESTURE_FRAME_MS,
    probeGpu: probeGpu, checkOverlays: checkOverlays, OVERLAY_COLOURS: OVERLAY_COLOURS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNCPreviewGL = api;
})(typeof window !== 'undefined' ? window : this);
