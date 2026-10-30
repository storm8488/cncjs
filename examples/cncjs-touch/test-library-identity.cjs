'use strict';
// A stored preview is shown only while it describes the program on the server: the
// server compares the sidecar's fingerprint with the file and answers with a verdict
// (`preview.stale`). Fichiers (shared-library.js) and Suivi (job-dashboard.js) never show
// a stale or unverified preview as valid; uploads and regenerations record the fingerprint
// the server reports for the bytes it wrote or served. No server, no machine.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const FP1 = 'sha256:' + '1'.repeat(64), FP2 = 'sha256:' + '2'.repeat(64);
const IMAGE = 'data:image/png;base64,AA==';
const flush = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(setImmediate); };
// The file a request names: a raw upload carries it in the query, a JSON request in its body.
const fileOf = x => { const q = /[?&]file=([^&]*)/.exec(x.url); if (q) return decodeURIComponent(q[1]); try { return JSON.parse(x.body).file; } catch (_) { return undefined; } };
// Uploads go out as raw bytes (a Blob, application/octet-stream), never as a JSON body holding the program.
const rawText = async x => { assert(x.body instanceof Blob, 'raw upload body'); assert.equal(x.headers['Content-Type'], 'application/octet-stream'); return x.body.text(); };

function XHR(pending) {
  return function () {
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.headers = {}; this.setRequestHeader = (k, v) => { this.headers[k] = v; };
    this.responseHeaders = {}; this.getResponseHeader = k => (k in this.responseHeaders ? this.responseHeaders[k] : null);
    this.send = body => { this.body = body; pending.push(this); };
    this.abort = () => { this.aborted = true; if (this.onabort) this.onabort(); };
  };
}
function reply(xhr, value, headers) {
  xhr.status = 200; xhr.responseHeaders = headers || {};
  if (xhr.responseType === 'blob') xhr.response = new Blob([JSON.stringify(value)], { type: 'application/json' });
  else xhr.responseText = JSON.stringify(value);
  xhr.onload();
}
const meta = (file, extra) => Object.assign({ version: 1, file, originalName: file.toUpperCase(), preview: { image: IMAGE, bounds: [0, 0, 10, 10], segments: 1 } }, extra);
// Sidecar as the server serves it: `data` plus its verdict.
const current = (file, fp) => ({ data: JSON.stringify(meta(file, { fingerprint: fp, size: 100 })), preview: { stale: false, reason: '', fingerprint: fp, size: 100 } });
const stale = (file, reason, keepImage) => ({
  data: JSON.stringify(meta(file, keepImage ? { fingerprint: FP1, size: 100 } : { fingerprint: FP1, size: 100, preview: { stale: true, reason } })),
  preview: { stale: true, reason, fingerprint: FP2, size: 100 }
});

async function library(options = {}) {
  const { document, node, activeScreens } = require('./dom-fixture.cjs').createDOM(['files']);
  const pending = [], handlers = {}, events = [], renders = [];
  const ctx = {
    document, Blob, CustomEvent: function (type, o) { this.type = type; this.detail = o && o.detail; }, setTimeout: () => 0,
    window: { addEventListener: (n, f) => handlers[n] = f, dispatchEvent: e => events.push(e),
      CNCLibraryPreview: { render: () => Promise.resolve({ image: IMAGE, bounds: [0, 0, 1, 1], segments: 1 }),
        renderResponse(blob) { assert(blob instanceof Blob, 'the opaque response goes to the preview worker'); renders.push(blob); return Promise.resolve({ image: IMAGE, bounds: [0, 0, 2, 2], segments: 2 }); } } },
    FileReader: function () { this.readAsText = () => { this.result = 'G0 X0'; Promise.resolve().then(() => this.onload()); }; },
    localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 't' } } }) },
    XMLHttpRequest: XHR(pending)
  };
  // Idle periods as macrotasks, like a browser (a microtask would never let the detail finish).
  if (options.idle) ctx.requestIdleCallback = fn => { setImmediate(() => fn({ timeRemaining: () => 50 })); return 1; };
  vm.runInNewContext(fs.readFileSync(__dirname + '/touch/shared-library.js', 'utf8'), ctx);
  function take(method, endpoint, file) {
    const i = pending.findIndex(x => x.method === method && x.url.split('?')[0].endsWith('/' + endpoint) && (file === undefined || fileOf(x) === file));
    assert(i >= 0, 'expected ' + method + ' ' + endpoint + ' ' + (file || '') + ' among ' + pending.map(x => x.method + ' ' + x.url).join(', '));
    return pending.splice(i, 1)[0];
  }
  const files = options.files || [{ type: 'f', name: 'a.nc', size: 100, mtime: '2026-10-20' }, { type: 'f', name: 'a.nc.cnctouch.json', size: 10, mtime: '2026-10-20' },
    { type: 'f', name: 'b.nc', size: 100, mtime: '2026-10-19' }, { type: 'f', name: 'b.nc.cnctouch.json', size: 10, mtime: '2026-10-19' }];
  reply(take('GET', 'status'), { configured: true }); await flush();
  reply(take('POST', 'files'), { files }); await flush();
  return { node, pending, handlers, events, renders, take, activeScreens, files,
    image: () => node('library-image'), status: () => node('library-image-status'),
    dims: () => node('library-dimensions-status'), table: () => node('library-dimensions-table'),
    refresh: async () => { node('library-refresh').handlers.click(); reply(take('GET', 'status'), { configured: true }); await flush(); reply(take('POST', 'files'), { files }); await flush(); } };
}

(async () => {
  // Fichiers: a stale sidecar (program replaced under the same name) is never shown.
  let f = await library();
  reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch')); await flush();
  assert.equal(f.image().hidden, true); assert.equal(f.image().src, undefined, 'no image set');
  assert.match(f.status().textContent, /^Aperçu périmé : régénérez-le depuis le PC\./);
  assert.equal(f.table().hidden, true); assert.match(f.dims().textContent, /périmé/);
  assert.equal(f.image().cncPreview, null, 'no projection handed to the 3D views or the marker');
  assert.equal(f.node('library-name').textContent, 'A.NC', 'the name still comes from the sidecar');
  // Even a server that only sets the verdict and leaves the old image in the data.
  await f.refresh(); reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch', true)); await flush();
  assert.equal(f.image().hidden, true); assert.match(f.status().textContent, /périmé/); assert.equal(f.image().cncPreview, null);
  // Older sidecar without fingerprint, program gone: each says what to do.
  await f.refresh(); reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'no-fingerprint')); await flush();
  assert.match(f.status().textContent, /sans empreinte.*régénérez-le depuis le PC/); assert.equal(f.image().hidden, true);
  await f.refresh(); reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'program-missing')); await flush();
  assert.match(f.status().textContent, /introuvable/); assert.equal(f.image().hidden, true);
  // A current preview: shown, with the program's fingerprint for the 3D views and the marker.
  await f.refresh(); reply(take(f, 'a.nc.cnctouch.json'), current('a.nc', FP1)); await flush();
  f.image().onload();
  assert.equal(f.image().hidden, false); assert.equal(f.status().hidden, true); assert.equal(f.table().hidden, false);
  assert.equal(f.image().cncPreview.fingerprint, FP1); assert.match(f.dims().textContent, /D’après l’aperçu enregistré/);
  // No verdict at all (a server that does not check) and no fingerprint: not presented as valid.
  await f.refresh(); reply(take(f, 'a.nc.cnctouch.json'), { data: JSON.stringify(meta('a.nc')) }); await flush();
  f.image().onload();
  assert.equal(f.status().hidden, false); assert.match(f.status().textContent, /non vérifié.*régénérez-le depuis le PC/);
  assert.match(f.dims().textContent, /non vérifié/);
  assert.equal(f.image().cncPreview.fingerprint, '', 'no fingerprint: the 3D views refuse it');

  // Row thumbnails skip a stale sidecar (no extent, no image), keep a current one.
  f = await library({ idle: true });
  reply(take(f, 'a.nc.cnctouch.json'), current('a.nc', FP1)); await flush(); f.image().onload(); await flush();
  const row = name => f.node('library-list').children.find(r => r.getAttribute && r.getAttribute('data-file') === name);
  reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch', true)); await flush(6);
  assert.doesNotMatch(row('a.nc')._info.textContent, /×/, 'no extent from a stale preview'); assert.equal(row('a.nc')._img.hidden, true);
  reply(take(f, 'b.nc.cnctouch.json'), current('b.nc', FP2)); await flush(6);
  assert.match(row('b.nc')._info.textContent, /10 × 10 mm/);

  // Upload: the sidecar carries the fingerprint and size the server reports for the bytes it wrote.
  f = await library();
  reply(take(f, 'a.nc.cnctouch.json'), current('a.nc', FP1)); await flush(); f.image().onload();
  f.node('library-input').files = [{ name: 'part.nc', size: 5 }]; f.node('library-send').handlers.click(); await flush(6);
  const program = f.take('PUT', 'file'); const stored = fileOf(program); assert.match(stored, /^part--touch-\d{14}-[a-f0-9]{16}\.nc$/);
  assert.equal(await rawText(program), 'G0 X0', 'the program bytes, not a JSON body');
  reply(program, { file: stored, fingerprint: FP2, size: 5 }); await flush();
  const sidecar = f.take('PUT', 'file'); const written = JSON.parse(await rawText(sidecar));
  assert.equal(fileOf(sidecar), stored + '.cnctouch.json');
  assert.equal(written.fingerprint, FP2); assert.equal(written.size, 5); assert.equal(written.preview.image, IMAGE);
  reply(sidecar, { file: stored + '.cnctouch.json' }); await flush();
  assert.equal(f.image().cncPreview.fingerprint, FP2, 'the card shows the upload with its fingerprint');
  assert.match(f.node('library-upload-status').textContent, /enregistré/);
  // A server that reports no fingerprint: the operator is told the preview will be flagged.
  f = await library(); reply(take(f, 'a.nc.cnctouch.json'), current('a.nc', FP1)); await flush(); f.image().onload();
  f.node('library-input').files = [{ name: 'old.nc', size: 5 }]; f.node('library-send').handlers.click(); await flush(6);
  reply(f.take('PUT', 'file'), {}); await flush();
  const sidecarWrite = f.take('PUT', 'file'), unverified = JSON.parse(await rawText(sidecarWrite));
  assert.equal(unverified.fingerprint, undefined);
  reply(sidecarWrite, {}); await flush();
  assert.match(f.node('library-upload-status').textContent, /sans empreinte/);

  // Regeneration: the fingerprint of the served program (headers of the Blob response) goes into the sidecar.
  f = await library();
  reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch')); await flush();
  f.node('library-regenerate').handlers.click();
  reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch')); await flush();
  const read = f.take('POST', 'file', 'a.nc'); assert.equal(read.responseType, 'blob');
  reply(read, { file: 'a.nc', data: 'G0 X0\nG1 X1', fingerprint: FP2, size: 100 }, { 'X-Program-Fingerprint': FP2, 'X-Program-Size': '100' }); await flush(6);
  assert.equal(f.renders.length, 1);
  reply(f.take('POST', 'files'), { files: f.files }); await flush();
  const regenerated = JSON.parse(await rawText(f.take('PUT', 'file', 'a.nc.cnctouch.json')));
  assert.equal(regenerated.fingerprint, FP2); assert.equal(regenerated.size, 100); assert.deepEqual(regenerated.preview.bounds, [0, 0, 2, 2]);
  assert.equal(regenerated.originalName, 'A.NC', 'the sidecar keeps its name');
  // Without a fingerprint from the server, nothing is written: the sidecar could not be verified later.
  f = await library();
  reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch')); await flush();
  f.node('library-regenerate').handlers.click();
  reply(take(f, 'a.nc.cnctouch.json'), stale('a.nc', 'fingerprint-mismatch')); await flush();
  reply(f.take('POST', 'file', 'a.nc'), { file: 'a.nc', data: 'G0 X0' }); await flush(6);
  assert.equal(f.renders.length, 0); assert(!f.pending.some(x => x.method === 'PUT'));
  assert.match(f.node('library-regenerate-status').textContent, /Aperçu non modifié : Empreinte du fichier absente/);
  console.log('PASS library identity: stale/unverified/current sidecars in Fichiers, thumbnails, upload and regeneration fingerprints.');

  // Suivi: the loaded file's preview follows the same verdict.
  const dashboard = () => {
    const { document, node } = require('./dom-fixture.cjs').createDOM(['home']);
    const pending = [], listeners = {};
    const ctx = { document, window: { addEventListener: (n, f) => listeners[n] = f }, Date, localStorage: { getItem: () => JSON.stringify({ state: { session: { token: 't' } } }) }, XMLHttpRequest: XHR(pending) };
    vm.runInNewContext(fs.readFileSync(__dirname + '/touch/job-dashboard.js', 'utf8'), ctx);
    return { node, pending, listeners, img: () => node('home-job-image'), status: () => node('home-image-status'),
      select: file => listeners['cnc-library-select']({ detail: { file, name: file } }) };
  };
  let d = dashboard(); d.select('a.nc'); assert.equal(d.pending.length, 1);
  reply(d.pending.shift(), stale('a.nc', 'fingerprint-mismatch', true));
  assert.equal(d.img().hidden, true); assert.equal(d.img().src, undefined); assert.equal(d.img().cncPreview, null);
  assert.equal(d.status().hidden, false); assert.match(d.status().textContent, /^Aperçu périmé : régénérez-le depuis le PC\./);
  d.listeners['cnc-library-preview-updated']({ detail: { file: 'a.nc' } });
  reply(d.pending.shift(), stale('a.nc', 'no-fingerprint')); assert.match(d.status().textContent, /sans empreinte/);
  d.listeners['cnc-library-preview-updated']({ detail: { file: 'a.nc' } });
  reply(d.pending.shift(), current('a.nc', FP1)); d.img().onload();
  assert.equal(d.img().hidden, false); assert.equal(d.status().hidden, true); assert.equal(d.img().cncPreview.fingerprint, FP1);
  d.listeners['cnc-library-preview-updated']({ detail: { file: 'a.nc' } });
  reply(d.pending.shift(), { data: JSON.stringify(meta('a.nc')) }); d.img().onload();
  assert.equal(d.img().hidden, false); assert.equal(d.status().hidden, false); assert.match(d.status().textContent, /non vérifié/);
  assert.equal(d.img().cncPreview.fingerprint, '');
  console.log('PASS dashboard identity: stale, old and unverified previews flagged, current preview carries its fingerprint.');
})().catch(e => { console.error(e); process.exitCode = 1; });

function take(f, file) { return f.take('POST', 'file', file); }
