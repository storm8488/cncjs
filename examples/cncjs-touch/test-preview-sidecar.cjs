'use strict';
// Preview sidecar data (touch/library-preview.js, library-preview-worker.js): version 3 adds the
// motion estimate and the laser summary; older sidecars are still read, with what they cannot tell
// listed (no fingerprint, G28/G30 unknown frame, relative start, decimated geometry); export / import of
// a preview between two servers, bound to the program fingerprint, light data only, never settings.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const LP = require('./touch/library-preview.js');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

(async () => {
  // Version 1 (image, projection and trail only), as written before the depth views.
  const v1 = { version: 1, file: 'a.nc', fingerprint: 'sha256:01', preview: { image: IMAGE, projection: { version: 1, width: 960, height: 540, bounds: [0, 0, 10, 10], units: 'mm', wcs: 'G54' }, trail: [0, 0, 0, 5, 10, 10], lines: 5 } };
  let n = LP.normalize(v1);
  assert.equal(n.version, 1); assert.equal(n.image, true); assert.equal(n.trail, true); assert.equal(n.path3d, false); assert.equal(n.estimate, null);
  assert(n.issues.includes('no-path3d')); assert(!n.issues.includes('no-estimate'), 'an old sidecar is not blamed for a missing estimate');
  // Version 2 without fingerprint, with G28 returns and a relative start.
  const v2 = { version: 1, file: 'b.nc', preview: { image: IMAGE, zBounds: [-2, 5], projection: { version: 1, bounds: [0, 0, 1, 1], returns: true, relativeStart: true, wcs: 'G55' }, trail: [0, 0, 0, 1, 1, 1] } };
  n = LP.normalize(v2);
  assert.equal(n.version, 2); assert.deepEqual(['no-fingerprint', 'unknown-frame', 'relative-start', 'other-wcs'].filter(k => n.issues.includes(k)), ['no-fingerprint', 'unknown-frame', 'relative-start', 'other-wcs']);
  // Missing or broken data.
  assert.deepEqual(LP.normalize({}).issues, ['no-preview']); assert.deepEqual(LP.normalize(null).issues, ['no-preview']);
  n = LP.normalize({ fingerprint: 'x', preview: { version: 3, image: IMAGE, projection: { version: 1 }, estimate: { version: 9 }, laser: { sMax: 'a' } } });
  assert.equal(n.estimate, null); assert.equal(n.laser, null); assert(n.issues.includes('no-estimate'));
  assert(LP.normalize({ fingerprint: 'x', preview: { version: 4, image: IMAGE, projection: { version: 1 } } }).issues.includes('newer-version'));

  // The worker adds the estimate and the laser summary (version 3), off the interface thread.
  const posted = [];
  const ctx = { setTimeout, clearTimeout, Promise, Date, Float64Array, Float32Array, Uint8Array, Uint16Array, Int16Array, Number, String, Math, JSON, Array, Object, Error, isFinite,
    postMessage(m) { posted.push(m); } };
  ctx.self = ctx; ctx.importScripts = (...names) => names.forEach(name => vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', name.split('?')[0]), 'utf8'), ctx));
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'touch', 'library-preview-worker.js'), 'utf8'), ctx);
  assert.equal(posted[0].type, 'ready'); assert.equal(ctx.onmessage === undefined, false);
  assert.equal(ctx.CNCLaserView, undefined, 'laser-view.js is not loaded into the preview worker');
  const code = 'G21 G90\nM4 S0\nG0 X0 Y0\nG1 X10 F600 S800\nG4 P1\nG0 X0 Y5\nG1 X10 S400\nM5\nM2';
  ctx.onmessage({ data: { type: 'begin', id: 1, length: code.length } });
  const words = new Uint16Array(code.length); for (let i = 0; i < code.length; i++) words[i] = code.charCodeAt(i);
  ctx.onmessage({ data: { type: 'text', id: 1, offset: 0, data: words.buffer } });
  ctx.onmessage({ data: { type: 'end', id: 1 } });
  for (let i = 0; i < 100 && !posted.some(m => m.type === 'done' || m.type === 'error'); i++) {
    await tick(5);
    posted.filter(m => m.type === 'segments' && !m.acked).forEach(m => { m.acked = true; ctx.onmessage({ data: { type: 'ack', id: 1, sequence: m.sequence } }); });
  }
  const done = posted.find(m => m.type === 'done');
  assert(done, 'done: ' + JSON.stringify(posted.find(m => m.type === 'error')));
  assert.equal(done.estimate.version, 1); assert.equal(done.estimate.dwellSeconds, 1); assert.equal(done.estimate.laser, undefined, 'laser summary kept apart');
  assert.equal(Math.round(done.estimate.feedSeconds), 2);
  assert.deepEqual(JSON.parse(JSON.stringify(done.laser)), { sMax: 800, hasM4: true, emittingLength: 20, travelLength: Math.round(Math.hypot(10, 5) * 10) / 10 });
  assert.equal(LP.validEstimate(done.estimate) !== null, true); assert.equal(LP.validLaser(done.laser) !== null, true);

  // Export: light preview data only, bound to the fingerprint; machine data never travels.
  const stored = { version: 1, file: 'c--touch-20260101000000-0123456789abcdef.nc', originalName: 'c.nc', fingerprint: 'sha256:AbC', size: 120,
    settings: { $110: 5000 }, machine: { port: '/dev/ttyUSB0' },
    preview: { version: 3, image: IMAGE, projection: { version: 1, bounds: [0, 0, 1, 1] }, trail: [0, 0, 0, 1, 1, 1], estimate: done.estimate, laser: done.laser, command: 'M3 S1000', controller: { state: 'Idle' } } };
  const exported = LP.exportPreview(stored);
  assert.equal(exported.format, 'cncjs-touch-preview'); assert.equal(exported.version, 1); assert.equal(exported.fingerprint, 'sha256:AbC');
  const text = JSON.stringify(exported);
  assert(!/\$110|ttyUSB|M3 S1000|controller|settings/.test(text), 'no machine settings, controller state or command in the export');
  assert.throws(() => LP.exportPreview({ preview: {} }), /sans empreinte/);
  // Import on another server: same program (fingerprint compared without case or prefix), checked fields.
  const imported = LP.importPreview(text, 'abc');
  assert.deepEqual(Object.keys(imported).sort(), ['estimate', 'image', 'laser', 'projection', 'trail', 'version']);
  assert.throws(() => LP.importPreview(text, 'sha256:def'), /empreinte différente/);
  assert.throws(() => LP.importPreview(text, ''), /empreinte différente/);
  assert.throws(() => LP.importPreview('{', 'abc'), /illisible/);
  assert.throws(() => LP.importPreview(JSON.stringify({ format: 'autre' }), 'abc'), /pas un aperçu/);
  assert.throws(() => LP.importPreview(JSON.stringify(Object.assign({}, exported, { version: 2 })), 'abc'), /Version/);
  assert.throws(() => LP.importPreview(JSON.stringify(Object.assign({}, exported, { preview: Object.assign({}, exported.preview, { image: 'javascript:1' }) })), 'abc'), /Image/);
  const broken = JSON.parse(text); broken.preview.estimate = { version: 1 }; broken.preview.path3d = { version: 7 };
  const cleaned = LP.importPreview(JSON.stringify(broken), 'abc');
  assert.equal(cleaned.estimate, undefined); assert.equal(cleaned.path3d, undefined, 'invalid optional data dropped, never trusted');
  console.log('PASS preview sidecar: versions 1/2/3 read, unknown frame / relative start / missing fingerprint listed, estimate and laser summary from the worker, export/import bound to the fingerprint without machine data.');
})().catch(e => { console.error(e); process.exit(1); });
