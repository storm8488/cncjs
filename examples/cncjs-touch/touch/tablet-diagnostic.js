/* Réglages → « Performances de cette tablette » → Diagnostic. Optional, on demand and only at
 * rest (no job, no pause, no move): CSS window, visual viewport, device pixel ratio, profile,
 * capabilities (Worker, OffscreenCanvas, WebGL and its renderer) and two short render timings
 * (Canvas 2D, and WebGL when available), shown and exportable as JSON. It sends no request and
 * no command; the WebGL context it creates is released at once. */
(function (root) {
  'use strict';
  var doc = root.document, uiLocale = root.cncI18n || { t: function (s) { return s; }, html: function (s) { return s; } }, t = uiLocale.t;
  var card = doc && doc.getElementById('ks-performance-card');
  if (!card) return;
  var SEGMENTS = 20000, machine = null, simulation = false, report = null;
  function now() { return root.performance && typeof root.performance.now === 'function' ? root.performance.now() : Date.now(); }
  function round(v) { return Math.round(v * 10) / 10; }
  // At rest: no machine, or a fresh state with no job, pause or move.
  function busyReason() {
    if (!machine) return '';
    var w = String(machine.workflow || 'idle'), s = String(machine.activeState || '');
    if (w !== 'idle' || /^(run|hold|jog|home|door)/i.test(s)) return t('Diagnostic disponible seulement au repos : aucun travail, pause ou déplacement en cours.');
    return '';
  }
  // A fixed pseudo-random path, so two runs on two tablets draw the same lines.
  function points(n) {
    var out = new Float32Array(n * 2), seed = 7;
    for (var i = 0; i < out.length; i++) { seed = (seed * 16807) % 2147483647; out[i] = seed / 2147483647; }
    return out;
  }
  function canvas2d(p) {
    var c = doc.createElement('canvas'); c.width = 800; c.height = 450;
    var g = c.getContext && c.getContext('2d'); if (!g) return null;
    var start = now(); g.beginPath(); g.moveTo(p[0] * 800, p[1] * 450);
    for (var i = 2; i < p.length; i += 2) g.lineTo(p[i] * 800, p[i + 1] * 450);
    g.stroke(); g.getImageData(0, 0, 1, 1); // forces the raster before the clock stops
    return round(now() - start);
  }
  function webgl(p) {
    var info = { available: false, renderer: '', software: null, drawMs: null };
    var c = doc.createElement('canvas'); c.width = 800; c.height = 450;
    var gl = null, lose = null;
    try {
      gl = c.getContext && (c.getContext('webgl') || c.getContext('experimental-webgl'));
      if (!gl) return info;
      info.available = true;
      var debug = gl.getExtension('WEBGL_debug_renderer_info');
      info.renderer = String(gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      info.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(info.renderer);
      lose = gl.getExtension('WEBGL_lose_context');
      function shader(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
      var prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p*2.0-1.0,0.0,1.0);}'));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, 'precision mediump float;void main(){gl_FragColor=vec4(1.0);}'));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return info;
      var start = now();
      gl.useProgram(prog); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, p, gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.LINE_STRIP, 0, p.length / 2);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // waits for the GPU
      info.drawMs = round(now() - start);
    } catch (_) { info.drawMs = null; }
    finally { if (lose) try { lose.loseContext(); } catch (_) {} }
    return info;
  }
  function collect() {
    var vv = root.visualViewport, profile = root.cncProfile, p = points(SEGMENTS);
    return {
      version: 1, kind: 'cncjs-touch-tablet-diagnostic', at: new Date().toISOString(),
      note: t('Mesure sur cette tablette, au repos, sans commande envoyée. Une mesure isolée, pas une garantie de fluidité.'),
      userAgent: String((root.navigator && root.navigator.userAgent) || ''),
      cssWindow: [root.innerWidth || 0, root.innerHeight || 0],
      visualViewport: vv ? [Math.round(vv.width), Math.round(vv.height), round(vv.scale || 1)] : null,
      devicePixelRatio: root.devicePixelRatio || 1,
      screen: root.screen ? [root.screen.width || 0, root.screen.height || 0] : null,
      orientation: (root.innerWidth || 0) >= (root.innerHeight || 0) ? 'landscape' : 'portrait',
      performance: profile ? profile.performance() : 'eco',
      machineKind: profile ? profile.kind() : null,
      capabilities: { worker: typeof root.Worker === 'function', offscreenCanvas: typeof root.OffscreenCanvas === 'function', webgl2: !!root.WebGL2RenderingContext },
      memoryMb: root.performance && root.performance.memory ? round(root.performance.memory.usedJSHeapSize / 1048576) : null,
      render: { segments: SEGMENTS, canvas2dMs: canvas2d(p), webgl: webgl(p) }
    };
  }
  function line(label, value) { return '<dt>' + label + '</dt><dd>' + String(value).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }) + '</dd>'; }
  function show(r) {
    var g = r.render.webgl;
    $('profile-diagnostic-list').innerHTML =
      line(t('Fenêtre CSS'), r.cssWindow.join(' × ') + ' px') +
      line(t('Zone visible'), r.visualViewport ? r.visualViewport[0] + ' × ' + r.visualViewport[1] + ' px · zoom ' + r.visualViewport[2] : '—') +
      line(t('Rapport de pixels (DPR)'), r.devicePixelRatio) +
      line(t('Profil'), (r.performance === 'performance' ? t('Performance') : t('Éco')) + ' · ' + (r.machineKind === 'laser' ? t('Laser') : r.machineKind === 'cnc' ? t('CNC') : t('type non confirmé'))) +
      line(t('Workers · OffscreenCanvas'), (r.capabilities.worker ? t('oui') : t('non')) + ' · ' + (r.capabilities.offscreenCanvas ? t('oui') : t('non'))) +
      line('WebGL', g.available ? (g.renderer || '—') + (g.software ? ' ' + t('(rendu logiciel)') : '') : t('indisponible')) +
      line(t('Tracé 2D de 20 000 segments'), r.render.canvas2dMs === null ? '—' : r.render.canvas2dMs + ' ms') +
      line(t('Tracé WebGL de 20 000 segments'), g.drawMs === null ? '—' : g.drawMs + ' ms');
    $('profile-diagnostic-export').hidden = false;
  }
  function $(id) { return doc.getElementById(id); }
  card.insertAdjacentHTML('beforeend', uiLocale.html('<div class="ks-diagnostic"><button type="button" id="profile-diagnostic-run" class="ks-secondary">Diagnostic de cette tablette</button><p class="ks-help">Au repos uniquement. Mesure l’écran et deux tracés courts, sans rien envoyer à la machine.</p><dl id="profile-diagnostic-list" class="ks-diagnostic-list"></dl><button type="button" id="profile-diagnostic-export" class="ks-secondary" hidden>Exporter le diagnostic</button><p id="profile-diagnostic-status" role="status"></p></div>'));
  var run = $('profile-diagnostic-run'), status = $('profile-diagnostic-status');
  if (!run) return;
  run.addEventListener('click', function () {
    var reason = simulation ? '' : busyReason();
    if (reason) { status.textContent = reason; return; }
    report = collect(); show(report); status.textContent = t('Diagnostic terminé.');
  });
  $('profile-diagnostic-export').addEventListener('click', function () {
    if (!report) return;
    try { root.CNCDownload.save(new Blob([JSON.stringify(report, null, 1)], { type: 'application/json' }), 'cncjs-touch-diagnostic-' + report.at.replace(/[:.]/g, '-') + '.json'); status.textContent = t('Diagnostic exporté.'); }
    catch (e) { status.textContent = e && e.message ? e.message : t('Téléchargement indisponible dans ce navigateur.'); }
  });
  root.addEventListener('cnc-job-status', function (e) { var d = e && e.detail || {}; simulation = !!d.simulation; machine = d.machine || null; });
  root.cncTabletDiagnostic = { collect: collect, busyReason: busyReason };
})(window);
