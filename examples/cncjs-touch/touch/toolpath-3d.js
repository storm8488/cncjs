/* Toolpath in 3D for previews: a simplified path stored with the file's preview,
 * its compact codec, fixed projections (isometric, front, side, top) and a
 * Canvas 2D renderer. Geometry only: no controller, network or DOM access.
 *
 * Stored path (preview.path3d, version 1): `count` points, each one the end of
 * the move arriving there, with its type (rapid G0 or work) and the sender line
 * (non-empty lines, as CNCjs counts them) that reached it. `data` is base64 of,
 * per point: zigzag varints of the X, Y and Z deltas in `quantum` mm, then a
 * varint of (line delta × 2 + rapid flag). The first point is the program start.
 * decode() returns typed arrays a future three.js view can use as they are
 * (positions as BufferAttribute(…, 3), rapid flags for vertex colours). */
(function (root) {
  'use strict';
  var MAX_POINTS = 30000, QUANTUM = 1000, WIDTH = 960, HEIGHT = 540;
  var VIEWS = ['iso', 'front', 'side', 'top'];
  var BACKGROUND = '#101820', RAPID = '#657c8f', WORK = '#55d6ed';
  // Below Z0, from just under the surface (light violet) to the deepest pass (red).
  var DEPTH = (function () {
    var stops = [[195, 166, 255], [255, 99, 184], [255, 59, 59]], colours = [];
    for (var i = 0; i < 8; i++) {
      var t = (i + 0.5) / 8 * 2, k = Math.min(1, Math.floor(t)), f = t - k, a = stops[k], b = stops[k + 1], hex = '#';
      for (var c = 0; c < 3; c++) hex += ('0' + Math.round(a[c] + (b[c] - a[c]) * f).toString(16)).slice(-2);
      colours.push(hex);
    }
    return colours;
  })();
  // Work at or above Z0 keeps the classic cyan; below it, the colour of its depth.
  function depthColor(z, zmin) {
    if (!(zmin < 0) || !(z < -1e-6)) return WORK;
    var i = Math.floor(z / zmin * DEPTH.length);
    return DEPTH[i < 0 ? 0 : i >= DEPTH.length ? DEPTH.length - 1 : i];
  }

  // Radial-distance simplification, streamed into preallocated typed arrays: a point is
  // kept when it is at least `tolerance` away from the last kept one, or when the move type
  // changes after it (the end of a run). Z distances count `zScale` times (the exaggeration
  // the side views use). The latest point waits in plain variables until the next one
  // decides: nothing is allocated per move (measured on the Tegra: the 3D path was a
  // third of the worker's second pass with JS arrays).
  // options: bounds [xmin, ymin, zmin, xmax, ymax, zmax] of the whole program, maxPoints.
  function createBuilder(options) {
    options = options || {};
    var b = Array.isArray(options.bounds) && options.bounds.length === 6 && options.bounds.every(isFinite) ? options.bounds : null;
    var max = options.maxPoints > 1 ? Math.floor(options.maxPoints) : MAX_POINTS, limit = Math.max(2, Math.floor(max * 0.8));
    var k = b ? zScale(b) : 1;
    var diagonal = b ? Math.sqrt(Math.pow(b[3] - b[0], 2) + Math.pow(b[4] - b[1], 2) + Math.pow((b[5] - b[2]) * k, 2)) : 0;
    var cap = max + 4, X = new Float64Array(cap), Y = new Float64Array(cap), Z = new Float64Array(cap), L = new Float64Array(cap), R = new Uint8Array(cap), n = 0;
    // About a quarter of a pixel of the 960 px views: invisible, and arcs of 0.02 mm steps shrink a lot.
    var tolerance = Math.max(1 / QUANTUM, diagonal / 4000), tol2 = tolerance * tolerance;
    var pending = false, px = 0, py = 0, pz = 0, pr = 0, pl = 0, input = 0, simplified = false, decimated = false;
    function put(i, x, y, z, r, l) { X[i] = x; Y[i] = y; Z[i] = z; R[i] = r; L[i] = l; }
    function add(x, y, z, r, l) {
      if (!n) { put(n++, x, y, z, r, l); return; }
      if (pending) {
        var dx = px - X[n - 1], dy = py - Y[n - 1], dz = (pz - Z[n - 1]) * k;
        if (pr !== r || dx * dx + dy * dy + dz * dz >= tol2) put(n++, px, py, pz, pr, pl);
      }
      pending = true; px = x; py = y; pz = z; pr = r; pl = l;
    }
    function flush() { if (pending) { put(n++, px, py, pz, pr, pl); pending = false; } }
    // The same rule again on the kept points, in place: the output never passes the input.
    function refilter() {
      var w = 1, hold = false, hx = 0, hy = 0, hz = 0, hr = 0, hl = 0;
      for (var i = 1; i < n; i++) {
        if (hold) {
          var dx = hx - X[w - 1], dy = hy - Y[w - 1], dz = (hz - Z[w - 1]) * k;
          if (hr !== R[i] || dx * dx + dy * dy + dz * dz >= tol2) put(w++, hx, hy, hz, hr, hl);
        }
        hold = true; hx = X[i]; hy = Y[i]; hz = Z[i]; hr = R[i]; hl = L[i];
      }
      if (hold) put(w++, hx, hy, hz, hr, hl);
      n = w;
    }
    function reduce() {
      flush();
      if (!(diagonal > 0)) { var e = boundsOf(view()); diagonal = Math.sqrt(Math.pow(e[3] - e[0], 2) + Math.pow(e[4] - e[1], 2) + Math.pow((e[5] - e[2]) * k, 2)); }
      // Too many points: twice the tolerance, applied again to what was kept, up to a
      // fiftieth of the part (a coarse but faithful drawing of every move type).
      while (n + 1 > limit && tolerance * 2 <= diagonal / 50) { tolerance *= 2; tol2 = tolerance * tolerance; simplified = true; refilter(); }
      // Still too dense (a raster finer than that): one point in `step`, so the swept area,
      // its depth and its order remain visible. The first and the last points stay.
      if (n + 1 > limit) {
        simplified = decimated = true;
        var step = Math.ceil(n / (max * 0.4)), w = 0, last = n - 1;
        for (var j = 0; j < n; j += step) put(w++, X[j], Y[j], Z[j], R[j], L[j]);
        if ((w - 1) * step !== last) put(w++, X[last], Y[last], Z[last], R[last], L[last]);
        n = w;
      }
    }
    function view() { return { xs: X.subarray(0, n), ys: Y.subarray(0, n), zs: Z.subarray(0, n), rapid: R.subarray(0, n), lines: L.subarray(0, n) }; }
    return {
      // One move of the program, from (ax, ay, az) to (bx, by, bz). mode 0 = G0.
      move: function (ax, ay, az, bx, by, bz, mode, line) {
        if (!input++) add(ax, ay, az, 1, 0);
        add(bx, by, bz, mode === 0 ? 1 : 0, line);
        if (n >= limit) reduce();
      },
      finish: function (totalLines) {
        flush();
        if (n > max) reduce();
        var f = view();
        return { version: 1, format: 'delta-varint-base64', quantum: 1 / QUANTUM, units: 'mm', wcs: 'G54',
          count: n, moves: input, tolerance: Math.round(tolerance * QUANTUM) / QUANTUM, simplified: simplified || n < input + 1, decimated: decimated,
          zScale: k, bounds: b ? b.slice() : boundsOf(f), lines: typeof totalLines === 'number' ? totalLines : (n ? L[n - 1] : 0), data: encode(f) };
      }
    };
  }
  function boundsOf(f) {
    var b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0; i < f.xs.length; i++) {
      b[0] = Math.min(b[0], f.xs[i]); b[1] = Math.min(b[1], f.ys[i]); b[2] = Math.min(b[2], f.zs[i]);
      b[3] = Math.max(b[3], f.xs[i]); b[4] = Math.max(b[4], f.ys[i]); b[5] = Math.max(b[5], f.zs[i]);
    }
    return f.xs.length ? b : [0, 0, 0, 0, 0, 0];
  }

  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', LOOKUP = new Int16Array(128);
  for (var a = 0; a < 128; a++) LOOKUP[a] = -1;
  for (var c = 0; c < 64; c++) LOOKUP[ALPHABET.charCodeAt(c)] = c;
  function base64(bytes, length) {
    var out = [], chunk = '';
    for (var i = 0; i < length; i += 3) {
      var n = bytes[i] << 16 | (i + 1 < length ? bytes[i + 1] << 8 : 0) | (i + 2 < length ? bytes[i + 2] : 0);
      chunk += ALPHABET.charAt(n >> 18 & 63) + ALPHABET.charAt(n >> 12 & 63) + (i + 1 < length ? ALPHABET.charAt(n >> 6 & 63) : '=') + (i + 2 < length ? ALPHABET.charAt(n & 63) : '=');
      if (chunk.length >= 8192) { out.push(chunk); chunk = ''; }
    }
    out.push(chunk);
    return out.join('');
  }
  function unbase64(text) {
    if (text.length % 4) throw new Error('parcours 3D illisible');
    var pad = text.charAt(text.length - 1) === '=' ? text.charAt(text.length - 2) === '=' ? 2 : 1 : 0;
    var bytes = new Uint8Array(text.length / 4 * 3 - pad), used = 0;
    for (var i = 0; i < text.length; i += 4) {
      var n = 0;
      for (var j = 0; j < 4; j++) {
        var code = text.charCodeAt(i + j), v = code < 128 ? LOOKUP[code] : -1;
        if (v < 0) { if (code === 61 && i + j >= text.length - pad) v = 0; else throw new Error('parcours 3D illisible'); }
        n = n * 64 + v;
      }
      if (used < bytes.length) bytes[used++] = n >> 16 & 255;
      if (used < bytes.length) bytes[used++] = n >> 8 & 255;
      if (used < bytes.length) bytes[used++] = n & 255;
    }
    return bytes;
  }
  function encode(f) {
    var n = f.xs.length, bytes = new Uint8Array(Math.max(16, n * 28)), used = 0, px = 0, py = 0, pz = 0, pl = 0;
    function varint(v) { while (v >= 128) { bytes[used++] = v % 128 + 128; v = Math.floor(v / 128); } bytes[used++] = v; }
    function signed(v) { varint(v < 0 ? -2 * v - 1 : 2 * v); }
    for (var i = 0; i < n; i++) {
      var qx = Math.round(f.xs[i] * QUANTUM), qy = Math.round(f.ys[i] * QUANTUM), qz = Math.round(f.zs[i] * QUANTUM), line = Math.max(pl, Math.round(f.lines[i]) || 0);
      signed(qx - px); signed(qy - py); signed(qz - pz); varint((line - pl) * 2 + (f.rapid[i] ? 1 : 0));
      px = qx; py = qy; pz = qz; pl = line;
    }
    return base64(bytes, used);
  }
  // Throws on anything but a well-formed version 1 path.
  function decode(path) {
    if (!path || path.version !== 1 || path.format !== 'delta-varint-base64' || typeof path.data !== 'string' || path.data.length > 8 * 1048576) throw new Error('parcours 3D absent ou non reconnu');
    var n = path.count;
    if (typeof n !== 'number' || n % 1 || n < 1 || n > 4 * MAX_POINTS) throw new Error('parcours 3D non reconnu');
    var bytes = unbase64(path.data), used = 0, positions = new Float64Array(n * 3), rapid = new Uint8Array(n), lines = new Float64Array(n);
    var q = typeof path.quantum === 'number' && path.quantum > 0 ? path.quantum : 1 / QUANTUM, x = 0, y = 0, z = 0, line = 0;
    function varint() {
      var v = 0, scale = 1;
      for (var guard = 0; guard < 8; guard++) {
        if (used >= bytes.length) throw new Error('parcours 3D tronqué');
        var byte = bytes[used++];
        v += (byte & 127) * scale; scale *= 128;
        if (byte < 128) return v;
      }
      throw new Error('parcours 3D illisible');
    }
    function signed() { var v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; }
    var bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (var i = 0; i < n; i++) {
      x += signed(); y += signed(); z += signed();
      var tag = varint(); line += Math.floor(tag / 2); rapid[i] = tag % 2;
      var px = x * q, py = y * q, pz = z * q;
      positions[i * 3] = px; positions[i * 3 + 1] = py; positions[i * 3 + 2] = pz; lines[i] = line;
      if (px < bounds[0]) bounds[0] = px; if (py < bounds[1]) bounds[1] = py; if (pz < bounds[2]) bounds[2] = pz;
      if (px > bounds[3]) bounds[3] = px; if (py > bounds[4]) bounds[4] = py; if (pz > bounds[5]) bounds[5] = pz;
    }
    if (used !== bytes.length) throw new Error('parcours 3D illisible');
    return { count: n, positions: positions, rapid: rapid, lines: lines, bounds: bounds };
  }

  // Screen right and up of each world axis: [rx, ry, rz, ux, uy, uz].
  function basis(view) {
    var s2 = Math.SQRT1_2, s6 = 1 / Math.sqrt(6);
    // Seen from the front right, above: X goes right and down, Y right and up, Z up.
    if (view === 'iso') return [s2, s2, 0, -s6, s6, 2 * s6];
    if (view === 'front') return [1, 0, 0, 0, 0, 1]; // XZ, seen from -Y
    if (view === 'side') return [0, 1, 0, 0, 0, 1]; // YZ, seen from +X
    if (view === 'top') return [1, 0, 0, 0, 1, 0];
    throw new Error('vue inconnue');
  }
  // A shallow job on a large part is drawn with Z exaggerated (1, 2, 5… 50 times)
  // until its depth spans at least 15 % of the part. The views say so.
  function zScale(b) {
    var xy = Math.max(b[3] - b[0], b[4] - b[1]), dz = Math.max(b[5], 0) - Math.min(b[2], 0);
    if (!(dz > 0) || !(xy > 0)) return 1;
    var steps = [1, 2, 5, 10, 20, 50];
    for (var i = 0; i < steps.length; i++) if (dz * steps[i] >= 0.15 * xy) return steps[i];
    return 50;
  }
  var AREA = [48, 80, 912, 452];
  // Affine projection to the 960 × 540 image: px = m0 x + m1 y + m2 z + m3, py = m4 x + m5 y + m6 z + m7.
  // The fitted box always includes the Z0 plane.
  function projection(view, b, k) {
    var e = basis(view), z0 = Math.min(b[2], 0), z1 = Math.max(b[5], 0);
    if (view === 'top') k = 1; else if (!(k > 0)) k = zScale(b);
    var sx0 = Infinity, sx1 = -Infinity, su0 = Infinity, su1 = -Infinity;
    for (var i = 0; i < 8; i++) {
      var x = i & 1 ? b[3] : b[0], y = i & 2 ? b[4] : b[1], z = (i & 4 ? z1 : z0) * k;
      var sx = e[0] * x + e[1] * y + e[2] * z, su = e[3] * x + e[4] * y + e[5] * z;
      sx0 = Math.min(sx0, sx); sx1 = Math.max(sx1, sx); su0 = Math.min(su0, su); su1 = Math.max(su1, su);
    }
    var w = sx1 - sx0, h = su1 - su0, s = Math.min(w > 1e-9 ? (AREA[2] - AREA[0]) / w : Infinity, h > 1e-9 ? (AREA[3] - AREA[1]) / h : Infinity);
    if (!isFinite(s)) s = 1;
    var cx = (AREA[0] + AREA[2]) / 2 - s * (sx0 + sx1) / 2, cy = (AREA[1] + AREA[3]) / 2 + s * (su0 + su1) / 2;
    return { version: 2, view: view, width: WIDTH, height: HEIGHT, units: 'mm', wcs: 'G54', zScale: k, scale: s,
      matrix: [s * e[0], s * e[1], s * e[2] * k, cx, -s * e[3], -s * e[4], -s * e[5] * k, cy] };
  }
  function apply(m, x, y, z) { return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7]]; }
  function format(value, locale, digits) {
    var v = Math.abs(value) < 0.5 * Math.pow(10, -digits) ? 0 : value;
    try { return v.toLocaleString(locale || 'fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }); } catch (_) { return v.toFixed(digits); }
  }
  // Depth legend: "≥ Z0" in cyan, then the depth colours down to the deepest Z.
  function legend(ctx, x, y, zmin, zmax, locale) {
    if (!(zmin < 0) || typeof ctx.fillText !== 'function') return;
    ctx.globalAlpha = 1; ctx.font = '17px sans-serif'; ctx.textBaseline = 'middle';
    // 300 px wide: in the 3D views it sits in the top right corner, clear of the view selector.
    ctx.fillStyle = 'rgba(16,24,32,.85)'; ctx.fillRect(x - 8, y - 16, 300, 54);
    ctx.fillStyle = WORK; ctx.fillRect(x, y - 7, 18, 14);
    ctx.fillStyle = '#c9d6df'; ctx.fillText('≥ Z0', x + 24, y);
    for (var i = 0; i < DEPTH.length; i++) { ctx.fillStyle = DEPTH[i]; ctx.fillRect(x + 80 + i * 18, y - 7, 18, 14); }
    ctx.fillStyle = '#c9d6df'; ctx.fillText(format(zmin, locale, 2), x + 80 + DEPTH.length * 18 + 6, y);
    ctx.fillText('Z min ' + format(zmin, locale, 2) + ' · Z max ' + format(zmax, locale, 2) + ' mm', x, y + 24);
  }
  function niceLength(target) {
    if (!(target > 0) || !isFinite(target)) return 0;
    var p = Math.pow(10, Math.floor(Math.log(target) / Math.LN10)), best = p;
    [1, 2, 5, 10].forEach(function (f) { if (f * p <= target) best = f * p; });
    return best;
  }
  // Renders one view of a decoded path. step(deadline) draws until deadline()
  // says stop and returns true once the image is complete (overlays included).
  // options: { title, locale, zBounds }.
  function createRenderer(ctx, path, view, options) {
    options = options || {};
    var b = path.bounds.slice(), zb = options.zBounds;
    if (Array.isArray(zb) && zb.length === 2 && isFinite(zb[0]) && isFinite(zb[1])) { b[2] = Math.min(b[2], zb[0]); b[5] = Math.max(b[5], zb[1]); }
    var proj = projection(view, b, view === 'top' ? 1 : zScale(b)), m = proj.matrix, P = path.positions, R = path.rapid, n = path.count, i = 1, started = false;
    var locale = options.locale, zmin = b[2];
    function point(j) { return apply(m, P[j * 3], P[j * 3 + 1], P[j * 3 + 2]); }
    function dashed(on) { if (typeof ctx.setLineDash === 'function') ctx.setLineDash(on ? [6, 5] : []); }
    function text(value, x, y, colour, align) {
      if (typeof ctx.fillText !== 'function') return;
      ctx.fillStyle = colour || '#c9d6df'; ctx.textAlign = align || 'left'; ctx.fillText(value, x, y); ctx.textAlign = 'left';
    }
    function plane() {
      // The suggested Z0 plane: the program's XY extent, a little wider, at Z = 0.
      var mx = Math.max((b[3] - b[0]) * 0.04, 1), my = Math.max((b[4] - b[1]) * 0.04, 1);
      var x0 = b[0] - mx, x1 = b[3] + mx, y0 = b[1] - my, y1 = b[4] + my, corners;
      ctx.globalAlpha = 1; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(142,203,255,.55)'; dashed(true);
      if (view === 'front' || view === 'side') {
        var a = view === 'front' ? apply(m, x0, 0, 0) : apply(m, 0, y0, 0), c = view === 'front' ? apply(m, x1, 0, 0) : apply(m, 0, y1, 0);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
        corners = [a];
      } else {
        corners = [apply(m, x0, y0, 0), apply(m, x1, y0, 0), apply(m, x1, y1, 0), apply(m, x0, y1, 0)];
        ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]);
        for (var k = 1; k < 4; k++) ctx.lineTo(corners[k][0], corners[k][1]);
        ctx.closePath();
        if (view === 'iso') { ctx.fillStyle = 'rgba(142,203,255,.08)'; ctx.fill(); }
        ctx.stroke();
      }
      dashed(false);
      var label = corners[view === 'iso' ? 1 : 0];
      if (typeof ctx.fillText === 'function') { ctx.font = 'bold 17px sans-serif'; ctx.textBaseline = 'bottom'; text('Z0', label[0] + 6, label[1] - 4, '#8ecbff'); }
    }
    function triad() {
      var ox = 62, oy = 498, axes = [['X', 1, 0, 0, '#ff7a7a'], ['Y', 0, 1, 0, '#5fe39a'], ['Z', 0, 0, 1, '#7cbcff']];
      ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.font = 'bold 17px sans-serif'; ctx.textBaseline = 'middle';
      axes.forEach(function (axis) {
        var dx = m[0] * axis[1] + m[1] * axis[2] + m[2] * axis[3], dy = m[4] * axis[1] + m[5] * axis[2] + m[6] * axis[3], len = Math.sqrt(dx * dx + dy * dy);
        ctx.strokeStyle = axis[4];
        if (len < 1e-9 * (Math.abs(m[0]) + Math.abs(m[1]) + Math.abs(m[2]) + 1e-12)) {
          // The axis points at the viewer (or away): a ringed dot.
          ctx.beginPath(); if (typeof ctx.arc === 'function') ctx.arc(ox, oy, 6, 0, 2 * Math.PI); ctx.stroke();
          text(axis[0], ox + 10, oy + 14, axis[4]); return;
        }
        var ex = ox + dx / len * 34, ey = oy + dy / len * 34;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
        text(axis[0], ex + dx / len * 12, ey + dy / len * 12, axis[4], 'center');
      });
    }
    function scaleBar() {
      // Along the projected X axis (Y for the side view): its length in mm is exact on that axis.
      var ax = view === 'side' ? [m[1], m[5]] : [m[0], m[4]], perMm = Math.sqrt(ax[0] * ax[0] + ax[1] * ax[1]);
      var mm = niceLength(130 / perMm); if (!mm) return;
      var ux = ax[0] / perMm, uy = ax[1] / perMm, len = mm * perMm, ex = 912, ey = 512, sx = ex - ux * len, sy = ey - uy * len;
      ctx.globalAlpha = 1; ctx.strokeStyle = '#eef3f6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey);
      ctx.moveTo(sx - uy * 5, sy + ux * 5); ctx.lineTo(sx + uy * 5, sy - ux * 5);
      ctx.moveTo(ex - uy * 5, ey + ux * 5); ctx.lineTo(ex + uy * 5, ey - ux * 5); ctx.stroke();
      if (typeof ctx.fillText === 'function') {
        ctx.font = '17px sans-serif'; ctx.textBaseline = 'bottom';
        text(format(mm, locale, mm < 1 ? (mm < 0.1 ? 2 : 1) : 0) + ' mm' + (proj.zScale > 1 ? ' · Z ×' + proj.zScale : ''), ex, Math.min(ey, sy) - 8, '#eef3f6', 'right');
      }
    }
    return {
      projection: proj,
      total: n,
      get drawn() { return i; },
      step: function (deadline) {
        if (!started) {
          started = true;
          ctx.globalAlpha = 1; ctx.fillStyle = BACKGROUND; ctx.fillRect(0, 0, WIDTH, HEIGHT);
          ctx.lineJoin = 'round';
          plane();
        }
        ctx.lineWidth = 1;
        var colour = null, run = 0;
        while (i < n) {
          if ((i & 127) === 0 && deadline && deadline()) break;
          var rapid = R[i], col = rapid ? RAPID : depthColor(Math.min(P[i * 3 - 1], P[i * 3 + 2]), zmin);
          if (col !== colour || run >= 512) {
            if (colour !== null) ctx.stroke();
            ctx.strokeStyle = col; ctx.globalAlpha = rapid ? 0.7 : 1; ctx.beginPath();
            var a = point(i - 1); ctx.moveTo(a[0], a[1]); colour = col; run = 0;
          }
          var c = point(i); ctx.lineTo(c[0], c[1]); run++; i++;
        }
        if (colour !== null) ctx.stroke();
        if (i < n) return false;
        ctx.globalAlpha = 1;
        if (typeof ctx.fillText === 'function') { ctx.font = 'bold 20px sans-serif'; ctx.textBaseline = 'bottom'; text(options.title || view, WIDTH / 2, HEIGHT - 12, '#eef3f6', 'center'); }
        legend(ctx, WIDTH - 300, 28, zmin, b[5], locale);
        triad(); scaleBar();
        return true;
      }
    };
  }
  var api = { MAX_POINTS: MAX_POINTS, VIEWS: VIEWS, WIDTH: WIDTH, HEIGHT: HEIGHT, colours: { background: BACKGROUND, rapid: RAPID, work: WORK, depth: DEPTH.slice() },
    depthColor: depthColor, createBuilder: createBuilder, decode: decode, zScale: zScale, projection: projection, apply: apply,
    legend: legend, createRenderer: createRenderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CNCToolpath3D = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
