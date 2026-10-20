/* 3D preview views, drawn off the interface thread on an OffscreenCanvas.
 * Geometry and image encoding only: no controller, network or DOM access. */
(function () {
  'use strict';
  importScripts('toolpath-3d.js?v=view1');
  var T3 = self.CNCToolpath3D, current = null, job = null;
  // One decoded path is kept: the views of a file are asked for one after the other.
  function decoded(key, path) {
    if (current && current.key === key) return current.path;
    current = { key: key, path: T3.decode(path) };
    return current.path;
  }
  function offscreen() {
    try { return typeof OffscreenCanvas === 'function' && !!new OffscreenCanvas(1, 1).getContext('2d'); } catch (_) { return false; }
  }
  function fail(id, error) { if (job && job.id === id) job = null; self.postMessage({ type: 'error', id: id, message: error && error.message || String(error) }); }
  function render(message) {
    var id = message.id, canvas, ctx, renderer, path;
    try {
      path = decoded(message.key, message.path);
      canvas = new OffscreenCanvas(T3.WIDTH, T3.HEIGHT); ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponible dans le Worker');
      renderer = T3.createRenderer(ctx, path, message.view, message.options);
    } catch (error) { fail(id, error); return; }
    job = { id: id };
    // Slices of 40 ms so a newer request (or a cancel) is read between them.
    function slice() {
      if (!job || job.id !== id) return;
      try {
        var until = Date.now() + 40;
        if (!renderer.step(function () { return Date.now() > until; })) { setTimeout(slice, 0); return; }
        canvas.convertToBlob({ type: 'image/png' }).then(function (blob) {
          if (!job || job.id !== id) return;
          job = null;
          self.postMessage({ type: 'image', id: id, key: message.key, view: message.view, blob: blob, projection: renderer.projection });
        }, function (error) { fail(id, error); });
      } catch (error) { fail(id, error); }
    }
    slice();
  }
  self.onmessage = function (event) {
    var message = event.data || {};
    if (message.type === 'render' && typeof message.id === 'number' && typeof message.key === 'string' && T3.VIEWS.indexOf(message.view) >= 0) render(message);
    else if (message.type === 'cancel') { if (job && job.id === message.id) job = null; }
    else if (message.type === 'forget') current = null;
  };
  self.postMessage({ type: 'ready', version: 1, offscreen: offscreen() });
})();
