/* Laser view: the program in XY, emitting moves coloured by their S setpoint
 * (consigne S: the value sent to Grbl, not the optical power at the work),
 * non-emitting moves (G0, M5, S0) drawn apart in dashed blue. Rasterised to a
 * 960 x 540 image with the same placement as the stored 2D preview, so the tool
 * marker and the progress trail stay aligned. Computed on demand, in a Web Worker
 * when available; light enough for the eco profile. Never talks to a controller.
 * Also runs as a Web Worker itself (message 'render'). */
(function (root) {
  'use strict';
  var isWorker = typeof root.importScripts === 'function' && typeof root.document === 'undefined' && typeof module === 'undefined' && !root.CNCAsLibrary;
  if (typeof root.importScripts === 'function' && !root.CNCMotionEstimate) root.importScripts('motion-estimate.js?v=v2e');
  var ME = typeof module !== 'undefined' && module.exports ? require('./motion-estimate.js') : root.CNCMotionEstimate;
  var W = 960, H = 540, BACKGROUND = [16, 24, 32], TRAVEL = [92, 140, 190];
  // Ramp of the S setpoint fraction: dark red, orange, pale yellow.
  var RAMP = [[90, 26, 0], [255, 138, 0], [255, 242, 160]];
  function rampColour(f) {
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    var k = f < 0.5 ? 0 : 1, u = f < 0.5 ? f * 2 : (f - 0.5) * 2, a = RAMP[k], b = RAMP[k + 1];
    return [Math.round(a[0] + (b[0] - a[0]) * u), Math.round(a[1] + (b[1] - a[1]) * u), Math.round(a[2] + (b[2] - a[2]) * u)];
  }
  // Same placement as the stored 2D image (projection version 1 of library-preview.js).
  function placement(b) {
    var sx = b[2] - b[0], sy = b[3] - b[1], scale = Math.min(880 / (sx || 1), 440 / (sy || 1));
    var ox = (W - sx * scale) / 2 - b[0] * scale, oy = H - (H - sy * scale) / 2 + b[1] * scale;
    return { scale: scale, ox: ox, oy: oy, matrix: [scale, 0, 0, ox, 0, -scale, 0, oy] };
  }
  // Emitting: a feed move (G1/G2/G3) with M3 or M4 on and S > 0. Grbl's laser mode ($32=1) turns
  // the laser off during G0 and while stopped; the view follows the program, not the machine.
  function emitting(mode, info) { return mode !== 0 && (info.spindle === 'M3' || info.spindle === 'M4') && info.s > 0; }

  // Analyses a text and rasterises it. bounds [xmin, ymin, xmax, ymax] (the stored projection's),
  // or null (a first pass finds them). options.sRef: S of full colour ($30 when known), else the program's max.
  function analyze(text, options) {
    options = options || {};
    var summary = { version: 1, sMax: 0, hasM3: false, hasM4: false, emittingLength: 0, travelLength: 0, emittingMoves: 0, levels: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    var b = Array.isArray(options.bounds) && options.bounds.length === 4 && options.bounds.every(isFinite) && options.bounds[2] >= options.bounds[0] && options.bounds[3] >= options.bounds[1] ? options.bounds : null;
    if (!b) {
      var e = [Infinity, Infinity, -Infinity, -Infinity];
      var grow = function (x, y) { if (x < e[0]) e[0] = x; if (y < e[1]) e[1] = y; if (x > e[2]) e[2] = x; if (y > e[3]) e[3] = y; };
      ME.createInterpreter(function (mode, ax, ay, az, bx, by, bz, info) {
        if (info.lost) return;
        if (mode === 2 || mode === 3) { grow(ax, ay); ME.arcPoints(mode, ax, ay, az, bx, by, bz, info, 0.05, grow); }
        else if (ax !== bx || ay !== by) { grow(ax, ay); grow(bx, by); }
      }).text(text);
      b = e[0] <= e[2] ? e : [0, 0, 1, 1];
    }
    var place = placement(b), sc = place.scale, ox = place.ox, oy = place.oy;
    var sPix = new Float32Array(W * H), travel = new Uint8Array(W * H), dash = 0;
    function plot(px, py, s, isTravel) {
      if (px < 0 || py < 0 || px >= W || py >= H) return;
      var i = py * W + px;
      if (isTravel) { if ((dash++ & 7) < 4) travel[i] = 1; } else if (s > sPix[i]) sPix[i] = s;
    }
    function line(ax, ay, bx, by, s, isTravel) {
      var x0 = Math.round(ox + ax * sc), y0 = Math.round(oy - ay * sc), x1 = Math.round(ox + bx * sc), y1 = Math.round(oy - by * sc);
      var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy, guard = 0;
      for (;;) {
        plot(x0, y0, s, isTravel);
        if ((x0 === x1 && y0 === y1) || ++guard > 4000) break;
        var e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    }
    var tolerance = Math.max(0.001, 0.5 / sc);
    var interp = ME.createInterpreter(function (mode, ax, ay, az, bx, by, bz, info) {
      if (info.lost) return;
      var length = ME.moveLength(mode, ax, ay, az, bx, by, bz, info), on = emitting(mode, info);
      if (on) {
        summary.emittingLength += length; summary.emittingMoves++;
        if (info.s > summary.sMax) summary.sMax = info.s;
      } else summary.travelLength += length;
      if (ax === bx && ay === by && mode !== 2 && mode !== 3) return; // a full circle ends where it starts
      var s = on ? info.s : 0;
      if (mode === 2 || mode === 3) {
        var px = ax, py = ay;
        ME.arcPoints(mode, ax, ay, az, bx, by, bz, info, tolerance, function (qx, qy) { line(px, py, qx, qy, s, !on); px = qx; py = qy; });
      } else line(ax, ay, bx, by, s, !on);
    }, function (kind, lineNo, value) {
      if (kind === 'spindle') { if (value === 'M3') summary.hasM3 = true; if (value === 'M4') summary.hasM4 = true; }
    });
    interp.text(text);
    var sRef = options.sRef > 0 ? options.sRef : summary.sMax, pixels = new Uint8ClampedArray(W * H * 4);
    for (var i = 0, j = 0; i < W * H; i++, j += 4) {
      var c = BACKGROUND;
      if (sPix[i] > 0) { var f = sRef > 0 ? sPix[i] / sRef : 1; c = rampColour(f); summary.levels[Math.min(9, Math.floor(Math.min(1, f) * 10))]++; }
      else if (travel[i]) c = TRAVEL;
      pixels[j] = c[0]; pixels[j + 1] = c[1]; pixels[j + 2] = c[2]; pixels[j + 3] = 255;
    }
    summary.sRef = sRef; summary.sRefSource = options.sRef > 0 ? '$30' : 'program';
    summary.emittingLength = Math.round(summary.emittingLength * 10) / 10; summary.travelLength = Math.round(summary.travelLength * 10) / 10;
    summary.overRef = options.sRef > 0 && summary.sMax > options.sRef;
    return { pixels: pixels, width: W, height: H, bounds: b, projection: { version: 2, view: 'laser', width: W, height: H, units: 'mm', wcs: 'G54', zScale: 1, scale: sc, matrix: place.matrix }, summary: summary };
  }
  // The compact laser summary of the sidecar (contract §6): {sMax, hasM4, emittingLength, travelLength}.
  function sidecarSummary(text) { return ME.estimate(text, { laser: true }).laser; }
  // Sidecar laser summary kept only with the expected shape.
  function validSummary(l) { return !!(l && typeof l === 'object' && typeof l.sMax === 'number' && typeof l.hasM4 === 'boolean' && typeof l.emittingLength === 'number' && typeof l.travelLength === 'number'); }

  var api = { analyze: analyze, sidecarSummary: sidecarSummary, validSummary: validSummary, rampColour: rampColour, placement: placement, emitting: emitting, colours: { travel: TRAVEL, background: BACKGROUND, ramp: RAMP } };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  if (isWorker) {
    root.onmessage = function (event) {
      var m = event.data || {};
      if (m.type !== 'render') return;
      var reading = typeof m.blob.text === 'function' ? m.blob.text() : Promise.resolve(new root.FileReaderSync().readAsText(m.blob, 'UTF-8'));
      reading.then(function (raw) {
        var v = JSON.parse(raw); if (!v || typeof v.data !== 'string') throw new Error('G-code absent de la réponse du serveur');
        var r = analyze(v.data, { bounds: m.bounds, sRef: m.sRef });
        root.postMessage({ type: 'image', id: m.id, pixels: r.pixels.buffer, projection: r.projection, summary: r.summary }, [r.pixels.buffer]);
      }).catch(function (e) { root.postMessage({ type: 'error', id: m.id, message: e && e.message || String(e) }); });
    };
    root.postMessage({ type: 'ready', version: 1 });
    return;
  }
  // ---------- Page ----------
  var uiLocale = root.cncI18n || { t: function (s) { return s; }, locale: 'fr-FR' }, t = uiLocale.t;
  var source = root.document && root.document.currentScript && root.document.currentScript.src;
  var workerURL = (source ? source.split(/[?#]/)[0].replace(/[^/]*$/, '') : '') + 'laser-view.js?v=v2e';
  // Renders the laser view of a previewed program: Promise of {blob (PNG), projection, summary}.
  // meta: {file, fingerprint, projection}; options: {sRef}. The worker ends with the job.
  function render(meta, options) {
    options = options || {};
    var worker = null, cancelled = false;
    var promise = root.CNCPreviewInspect.fetchProgram(meta.file).then(function (res) {
      if (!root.CNCPreviewInspect.sameFingerprint(res.fingerprint, meta.fingerprint)) throw new Error(t('Le fichier a changé depuis l’aperçu : régénérez-le dans Fichiers.'));
      if (cancelled) throw new Error(t('Annulé'));
      var bounds = meta.projection && Array.isArray(meta.projection.bounds) ? meta.projection.bounds : null;
      if (typeof root.Worker === 'function') {
        return new Promise(function (resolve, reject) {
          try { worker = new root.Worker(workerURL); } catch (e) { reject(e); return; }
          worker.onerror = function (e) { if (e && e.preventDefault) e.preventDefault(); reject(new Error(t('Analyse laser interrompue.'))); };
          worker.onmessage = function (e) {
            var m = e.data || {};
            if (m.type === 'ready') { worker.postMessage({ type: 'render', id: 1, blob: res.blob, bounds: bounds, sRef: options.sRef }); return; }
            if (m.type === 'error') { reject(new Error(m.message)); return; }
            if (m.type === 'image') resolve({ pixels: new Uint8ClampedArray(m.pixels), projection: m.projection, summary: m.summary });
          };
        });
      }
      return root.CNCPreviewInspect.textOf(res.blob).then(function (text) {
        if (text.length > 5 * 1048576) throw new Error(t('Fichier trop grand pour une analyse sans Worker.'));
        return analyze(text, { bounds: bounds, sRef: options.sRef });
      });
    }).then(function (r) {
      release();
      if (cancelled) throw new Error(t('Annulé'));
      var canvas = root.document.createElement('canvas'); canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d'); if (!ctx) throw new Error(t('Canvas indisponible'));
      var image = ctx.createImageData(W, H); image.data.set(r.pixels); ctx.putImageData(image, 0, 0);
      legend(ctx, r.summary);
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (blob) { if (blob) resolve({ blob: blob, projection: r.projection, summary: r.summary }); else reject(new Error(t('Encodage PNG impossible'))); }, 'image/png');
      });
    }, function (e) { release(); throw e; });
    function release() { if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; } }
    return { promise: promise, cancel: function () { cancelled = true; release(); } };
  }
  function fmt(v, d) { try { return v.toLocaleString(uiLocale.locale || 'fr-FR', { maximumFractionDigits: d || 0 }); } catch (_) { return String(v); } }
  function legend(ctx, s) {
    if (typeof ctx.fillText !== 'function') return;
    ctx.fillStyle = 'rgba(16,24,32,.85)'; ctx.fillRect(612, 12, 336, 58);
    for (var i = 0; i < 10; i++) { var c = rampColour((i + 0.5) / 10); ctx.fillStyle = 'rgb(' + c.join(',') + ')'; ctx.fillRect(620 + i * 18, 20, 18, 14); }
    ctx.font = '15px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#c9d6df';
    ctx.fillText('S 0 → ' + fmt(s.sRef) + (s.sRefSource === '$30' ? ' ($30)' : ''), 806, 27);
    ctx.fillStyle = 'rgb(' + TRAVEL.join(',') + ')'; ctx.fillRect(620, 48, 18, 4);
    ctx.fillStyle = '#c9d6df'; ctx.fillText(t('sans émission'), 644, 50);
  }
  // One line for the view's status: what the colours mean and the details computed now.
  function describe(s) {
    if (!s) return '';
    var parts = [t('Vue laser XY : couleur = consigne S, pas la puissance optique.'),
      t('S max ') + fmt(s.sMax) + (s.sRefSource === '$30' ? ' / $30 = ' + fmt(s.sRef) : ''),
      s.hasM4 ? t('M4 (dynamique)') : s.hasM3 ? t('M3 (constant)') : t('ni M3 ni M4'),
      t('trajets avec émission ') + fmt(s.emittingLength / 1000, 2) + ' m', t('sans émission ') + fmt(s.travelLength / 1000, 2) + ' m'];
    if (s.overRef) parts.push(t('⚠ S au-dessus de $30 : Grbl plafonne la consigne.'));
    return parts.join(' · ');
  }
  api.render = render; api.describe = describe;
  root.CNCLaserView = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this);
